import '../../../core/network/api_exception.dart';
import '../../../core/utils/home_time.dart';
import '../../../mock/mock_backend.dart';
import '../../devices/devices.dart';
import '../domain/agent_reply.dart';
import '../domain/assistant_repository.dart';
import '../domain/assistant_schedule.dart';

/// Deterministic stand-in for the AI Agent (`USE_MOCK=true` and tests): a rule
/// based reading of the sentence over the in-memory [MockBackend].
///
/// - "bật/tắt" + one device → runs it now (`done`, a real mock command);
/// - the same with a time ("8h tối", "sau 30 phút") → `scheduled`;
/// - a verb with no device ("Bật") → `clarify` with the home's devices as options;
/// - "đi ngủ" → `confirm` (a pending card to confirm or reject);
/// - a question ("bao nhiêu độ") → `answer`;
/// - a voice message is "heard" as [sampleTranscript] and treated as typed.
class MockAssistantRepository implements AssistantRepository {
  MockAssistantRepository(this._backend);

  /// What the mock "recognises" from any recording.
  static const sampleTranscript = 'Tắt đèn phòng khách';

  final MockBackend _backend;
  final _pending = <int, _PendingRequest>{};
  final _schedules = <int, AssistantSchedule>{};

  // ------------------------------------------------------------------ chat

  @override
  Future<AgentReply> sendText(
    int homeId,
    String text, {
    String? conversationId,
  }) => _backend.respond(() => _reply(homeId, text, null, conversationId));

  @override
  Future<AgentReply> sendVoice(
    int homeId,
    RecordedAudio audio, {
    String? conversationId,
  }) => _backend.respond(
    () => _reply(homeId, sampleTranscript, sampleTranscript, conversationId),
  );

  AgentReply _reply(
    int homeId,
    String raw,
    String? transcript,
    String? conversationId,
  ) {
    _backend.meId; // 401 when nobody is signed in
    final conversation = conversationId ?? 'mock-${_backend.nextId('chat')}';
    final text = _normalize(raw);
    final relays = _relays(homeId);

    AgentReply reply({
      required AgentReplyType type,
      required String message,
      AgentClarification? clarification,
      List<AssistantSchedule> executed = const [],
      List<AssistantSchedule> scheduled = const [],
      AgentPending? pending,
      List<AgentRejectedStep> rejected = const [],
    }) => AgentReply(
      conversationId: conversation,
      type: type,
      reply: message,
      transcript: transcript,
      clarification: clarification,
      executed: executed,
      scheduled: scheduled,
      pending: pending,
      rejected: rejected,
    );

    // A habit the Assistant suggests itself must be confirmed.
    if (text.contains('đi ngủ')) {
      final steps = <AgentPendingStep>[
        for (final d in relays)
          if (_kindOf(d) == ApplianceKind.lamp ||
              _kindOf(d) == ApplianceKind.fan)
            AgentPendingStep(
              index: 0,
              deviceId: d.id,
              deviceName: d.name,
              roomName: d.roomName,
              actionLabel: 'Tắt ${_lower(d.name)}',
              reason: 'Bạn thường tắt thiết bị này khi đi ngủ.',
            ),
      ];
      if (steps.isNotEmpty) {
        final numbered = [
          for (var i = 0; i < steps.length; i++)
            AgentPendingStep(
              index: i,
              deviceId: steps[i].deviceId,
              deviceName: steps[i].deviceName,
              roomName: steps[i].roomName,
              actionLabel: steps[i].actionLabel,
              reason: steps[i].reason,
            ),
        ];
        final id = _backend.nextId('agent_request');
        final pending = AgentPending(
          requestId: id,
          requestHash: 'mock-hash-$id',
          expiresAt: _backend.now.add(const Duration(minutes: 5)),
          steps: numbered,
        );
        _pending[id] = _PendingRequest(homeId, pending);
        return reply(
          type: AgentReplyType.confirm,
          message: 'Mình đề xuất tắt các thiết bị này. Bạn xác nhận nhé?',
          pending: pending,
        );
      }
    }

    if (_isQuestion(text)) {
      return reply(
        type: AgentReplyType.answer,
        message: _climateAnswer(homeId, text),
      );
    }

    final executed = <AssistantSchedule>[];
    final scheduled = <AssistantSchedule>[];
    final rejected = <AgentRejectedStep>[];
    final clauses = text
        .split(RegExp(r'[,;]| và | rồi '))
        .map((c) => c.trim())
        .where((c) => c.isNotEmpty)
        .toList();

    for (var i = 0; i < clauses.length; i++) {
      final clause = clauses[i];
      final turnOn = _hasWord(clause, const ['bật', 'mở']);
      final turnOff = _hasWord(clause, const ['tắt', 'đóng']);
      if (turnOn == turnOff) continue; // no verb or contradictory
      if (_bareVerb.hasMatch(clause)) {
        final verb = turnOn ? 'Bật' : 'Tắt';
        return reply(
          type: AgentReplyType.clarify,
          message: 'Bạn muốn ${verb.toLowerCase()} thiết bị nào?',
          clarification: AgentClarification(
            question: 'Bạn muốn ${verb.toLowerCase()} thiết bị nào?',
            options: [
              for (final d in relays.take(4)) '$verb ${_lower(d.name)}',
            ],
          ),
        );
      }
      final matches = _matchDevices(relays, clause);
      if (matches.isEmpty) {
        rejected.add(
          AgentRejectedStep(
            index: i,
            code: 'NOT_FOUND',
            message: 'Mình không tìm thấy thiết bị nào khớp với "$clause".',
          ),
        );
        continue;
      }
      if (matches.length > 1) {
        final verb = turnOn ? 'Bật' : 'Tắt';
        return reply(
          type: AgentReplyType.clarify,
          message: 'Bạn muốn ${verb.toLowerCase()} thiết bị nào?',
          clarification: AgentClarification(
            question: 'Bạn muốn ${verb.toLowerCase()} thiết bị nào?',
            options: [
              for (final d in matches.take(4)) '$verb ${_lower(d.name)}',
            ],
          ),
        );
      }
      final device = matches.single;
      final runAt = _parseWhen(clause, homeId);
      if (runAt == null) {
        executed.add(_run(device, turnOn, homeId));
      } else {
        scheduled.add(_schedule(device, turnOn, runAt, homeId));
      }
    }

    if (executed.isNotEmpty || scheduled.isNotEmpty) {
      final type = executed.isNotEmpty && scheduled.isNotEmpty
          ? AgentReplyType.mixed
          : executed.isNotEmpty
          ? AgentReplyType.done
          : AgentReplyType.scheduled;
      final message = switch (type) {
        AgentReplyType.done => 'Mình đã làm xong rồi nhé.',
        AgentReplyType.scheduled => 'Mình đã hẹn giờ cho bạn.',
        _ => 'Mình đã làm ngay phần cần làm và hẹn giờ phần còn lại.',
      };
      return reply(
        type: type,
        message: message,
        executed: executed,
        scheduled: scheduled,
        rejected: rejected,
      );
    }
    if (rejected.isNotEmpty) {
      return reply(
        type: AgentReplyType.refuse,
        message: 'Mình chưa làm được yêu cầu này.',
        rejected: rejected,
      );
    }

    return reply(
      type: AgentReplyType.clarify,
      message: 'Mình chưa rõ bạn muốn làm gì.',
      clarification: AgentClarification(
        question: 'Bạn muốn mình làm gì?',
        options: [
          for (final d in relays.take(2))
            '${d.isOn ? 'Tắt' : 'Bật'} ${_lower(d.name)}',
        ],
      ),
    );
  }

  // ----------------------------------------------------- confirm / cancel

  @override
  Future<AgentConfirmResult> confirm(
    int requestId,
    String requestHash,
    List<int> stepIndexes,
  ) => _backend.respond(() {
    _backend.meId;
    final request = _pending[requestId];
    if (request == null) throw _error('NOT_FOUND', 404);
    if (request.status != _RequestStatus.pending) {
      throw _error('REQUEST_NOT_PENDING', 409);
    }
    if (!_backend.now.isBefore(request.pending.expiresAt)) {
      throw _error('REQUEST_EXPIRED', 409);
    }
    if (requestHash != request.pending.requestHash) {
      throw _error('REQUEST_CHANGED', 409);
    }
    final chosen = request.pending.steps
        .where((s) => stepIndexes.contains(s.index))
        .toList();
    if (chosen.isEmpty) throw _error('INVALID_INPUT', 400);
    request.status = _RequestStatus.completed;
    final results = <AssistantSchedule>[];
    for (final step in chosen) {
      final device = _backend.devices.firstWhere((d) => d.id == step.deviceId);
      results.add(_run(device, false, request.homeId));
    }
    return AgentConfirmResult(requestId: requestId, results: results);
  });

  @override
  Future<void> reject(int requestId) => _backend.respond(() {
    _backend.meId;
    final request = _pending[requestId];
    if (request == null) throw _error('NOT_FOUND', 404);
    if (request.status != _RequestStatus.pending) {
      throw _error('REQUEST_NOT_PENDING', 409);
    }
    request.status = _RequestStatus.rejected;
  });

  @override
  Future<AssistantSchedule> cancelSchedule(int scheduleId) =>
      _backend.respond(() {
        _backend.meId;
        final schedule = _schedules[scheduleId];
        if (schedule == null) throw _error('NOT_FOUND', 404);
        if (!schedule.isCancellable) {
          throw _error('SCHEDULE_NOT_CANCELLABLE', 409);
        }
        final cancelled = schedule.copyWith(
          status: AssistantScheduleStatus.cancelled,
          canCancel: false,
        );
        _schedules[scheduleId] = cancelled;
        return cancelled;
      });

  // ------------------------------------------------------------- helpers

  ApiException _error(String code, int status) =>
      ApiException(code: code, statusCode: status);

  String _timezone(int homeId) {
    for (final record in _backend.homes) {
      if (record.home.id == homeId) return record.home.timezone;
    }
    return defaultHomeTimezone;
  }

  /// Controllable relays of the home (the views honour the caller's role).
  List<CustomerDevice> _relays(int homeId) {
    final result = <CustomerDevice>[];
    for (final d in _backend.devices) {
      if (d.homeId != homeId || !d.isRelay) continue;
      try {
        final view = _backend.requireDevice(d.id).device;
        if (view.canControl) result.add(view);
      } on ApiException {
        // Not visible to this member.
      }
    }
    return result;
  }

  ApplianceKind? _kindOf(CustomerDevice d) => ApplianceKind.of(d);

  AssistantSchedule _run(CustomerDevice device, bool turnOn, int homeId) {
    final stamp = _backend.now;
    final id = _backend.nextId('assistant_schedule');
    final label = '${turnOn ? 'Bật' : 'Tắt'} ${_lower(device.name)}';
    var status = AssistantScheduleStatus.done;
    String? errorCode;
    try {
      _backend.sendCommand(device.id, DeviceCommand.power(turnOn));
    } on ApiException catch (error) {
      status = AssistantScheduleStatus.failed;
      errorCode = error.code;
    }
    final schedule = AssistantSchedule(
      id: id,
      deviceName: device.name,
      roomName: device.roomName,
      actionLabel: label,
      runAt: stamp,
      status: status,
      errorCode: errorCode,
      timezone: _timezone(homeId),
    );
    _schedules[id] = schedule;
    return schedule;
  }

  AssistantSchedule _schedule(
    CustomerDevice device,
    bool turnOn,
    DateTime runAt,
    int homeId,
  ) {
    final id = _backend.nextId('assistant_schedule');
    final schedule = AssistantSchedule(
      id: id,
      deviceName: device.name,
      roomName: device.roomName,
      actionLabel: '${turnOn ? 'Bật' : 'Tắt'} ${_lower(device.name)}',
      runAt: runAt,
      status: AssistantScheduleStatus.scheduled,
      canCancel: true,
      timezone: _timezone(homeId),
    );
    _schedules[id] = schedule;
    return schedule;
  }

  /// "sau 30 phút" or "8h tối" / "20:30" → the instant, `null` = now.
  DateTime? _parseWhen(String clause, int homeId) {
    final after = RegExp(r'sau\s+(\d{1,4})\s*phút').firstMatch(clause);
    if (after != null) {
      return _backend.now.add(Duration(minutes: int.parse(after.group(1)!)));
    }
    final at = RegExp(
      r'(\d{1,2})\s*(?:h|giờ|:)\s*(\d{1,2})?',
    ).firstMatch(clause);
    if (at == null) return null;
    var hour = int.parse(at.group(1)!);
    final minute = int.tryParse(at.group(2) ?? '') ?? 0;
    if (hour < 12 && (clause.contains('tối') || clause.contains('chiều'))) {
      hour += 12;
    }
    if (hour > 23 || minute > 59) return null;
    final now = _backend.now;
    final current = HomeClock(_timezone(homeId)).partsOf(now).secondOfDay;
    var delta = hour * 3600 + minute * 60 - current;
    if (delta <= 0) delta += 86400;
    return now.add(Duration(seconds: delta));
  }

  List<CustomerDevice> _matchDevices(
    List<CustomerDevice> relays,
    String clause,
  ) {
    ApplianceKind? kind;
    if (clause.contains('đèn')) {
      kind = ApplianceKind.lamp;
    } else if (clause.contains('quạt')) {
      kind = ApplianceKind.fan;
    } else if (clause.contains('rèm')) {
      kind = ApplianceKind.curtain;
    } else if (clause.contains('điều hòa') || clause.contains('máy lạnh')) {
      kind = ApplianceKind.airConditioner;
    }
    if (kind == null) return const [];
    final ofKind = relays.where((d) => _kindOf(d) == kind).toList();
    final inRoom = ofKind
        .where(
          (d) => d.roomName != null && clause.contains(_normalize(d.roomName!)),
        )
        .toList();
    return inRoom.isNotEmpty ? inRoom : ofKind;
  }

  /// A clause that is only a verb ("bật"): no device to act on.
  static final _bareVerb = RegExp(r'^(bật|tắt|mở|đóng)$');

  bool _isQuestion(String text) =>
      text.contains('?') ||
      text.contains('bao nhiêu') ||
      text.contains('nhiệt độ') ||
      text.contains('độ ẩm');

  String _climateAnswer(int homeId, String text) {
    final sensors = _backend.devices
        .where(
          (d) =>
              d.homeId == homeId && d.isSensor && d.latest?.temperature != null,
        )
        .toList();
    if (sensors.isEmpty) return 'Mình chưa có số liệu nhiệt độ của nhà này.';
    final inRoom = sensors
        .where(
          (d) => d.roomName != null && text.contains(_normalize(d.roomName!)),
        )
        .toList();
    final sensor = (inRoom.isNotEmpty ? inRoom : sensors).first;
    final reading = sensor.latest!;
    final temperature = reading.temperature!.toStringAsFixed(1);
    final humidity = reading.humidity?.round();
    return '${sensor.roomName ?? 'Nhà bạn'} đang '
        '$temperature °C${humidity == null ? '' : ', độ ẩm $humidity%'}.';
  }

  bool _hasWord(String text, List<String> words) =>
      words.any((w) => RegExp('(^|\\s)$w(\\s|\$)').hasMatch(text));

  String _lower(String value) => value.toLowerCase();

  String _normalize(String value) =>
      value.toLowerCase().replaceAll('hoà', 'hòa').trim();
}

enum _RequestStatus { pending, completed, rejected }

class _PendingRequest {
  _PendingRequest(this.homeId, this.pending);

  final int homeId;
  final AgentPending pending;
  _RequestStatus status = _RequestStatus.pending;
}

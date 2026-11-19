import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:smart_home_mobile/core/config/app_config.dart';
import 'package:smart_home_mobile/core/network/api_client.dart';
import 'package:smart_home_mobile/core/network/api_exception.dart';
import 'package:smart_home_mobile/core/storage/session_storage.dart';
import 'package:smart_home_mobile/core/utils/json.dart';
import 'package:smart_home_mobile/mock/mock_backend.dart';
import 'package:smart_home_mobile/mock/mock_providers.dart';
import 'package:smart_home_mobile/modules/ai/ai.dart';
import 'package:smart_home_mobile/modules/ai/data/assistant_remote_repository.dart';
import 'package:smart_home_mobile/modules/ai/domain/assistant_texts.dart';
import 'package:smart_home_mobile/modules/auth/auth.dart';

const _homeId = 1;

// ------------------------------------------------------------------ contract

Map<String, Object?> _schedule(
  int id, {
  String status = 'done',
  String? errorCode,
  bool canCancel = false,
}) => {
  'id': id,
  'home_id': _homeId,
  'timezone': 'Asia/Ho_Chi_Minh',
  'device_id': 5,
  'device_name': 'Đèn phòng khách',
  'room_name': 'Phòng khách',
  'appliance': 'lamp',
  'action': 'turn_on',
  'action_label': 'Bật đèn',
  'run_at': '2026-11-15T13:00:00.000Z',
  'status': status,
  'origin': 'ai_agent',
  'channel': 'mobile',
  'error_code': errorCode,
  'can_cancel': canCancel,
};

void main() {
  group('AgentReply mapper', () {
    test('maps every block of a mixed reply with a pending card', () {
      final reply = agentReplyFromJson(
        asJson({
          'conversation_id': 'c-1',
          'type': 'mixed',
          'reply': 'Mình đã làm một phần.',
          'transcript': 'bật đèn rồi tắt quạt lúc tám giờ',
          'clarification': {
            'question': 'Bạn muốn đèn nào?',
            'options': ['Đèn phòng khách', '', 'Đèn nhà bếp'],
          },
          'executed': [
            _schedule(1),
            _schedule(2, status: 'failed', errorCode: 'DEVICE_OFFLINE'),
          ],
          'scheduled': [_schedule(3, status: 'scheduled', canCancel: true)],
          'pending': {
            'request_id': 42,
            'request_hash': 'abc123',
            'expires_at': '2026-11-15T13:05:00.000Z',
            'steps': [
              {
                'index': 0,
                'device_id': 5,
                'device_name': 'Đèn phòng khách',
                'room_name': 'Phòng khách',
                'action_label': 'Tắt đèn',
                'run_at': null,
                'reason': 'Thói quen',
              },
              {
                'index': 1,
                'device_id': 6,
                'device_name': 'Quạt',
                'room_name': null,
                'action_label': 'Tắt quạt',
                'run_at': '2026-11-15T15:00:00.000Z',
                'reason': '',
              },
            ],
          },
          'rejected': [
            {'index': 2, 'code': 'NOT_FOUND', 'message': 'Không thấy rèm.'},
            {'index': 3, 'code': 'FORBIDDEN'},
          ],
        }),
      );

      expect(reply.conversationId, 'c-1');
      expect(reply.type, AgentReplyType.mixed);
      expect(reply.transcript, 'bật đèn rồi tắt quạt lúc tám giờ');
      expect(reply.clarification?.question, 'Bạn muốn đèn nào?');
      expect(reply.clarification?.options, ['Đèn phòng khách', 'Đèn nhà bếp']);
      expect(reply.executed.map((s) => s.status), [
        AssistantScheduleStatus.done,
        AssistantScheduleStatus.failed,
      ]);
      expect(reply.executed.last.errorCode, 'DEVICE_OFFLINE');
      expect(reply.scheduled.single.isCancellable, isTrue);
      expect(reply.scheduled.single.timezone, 'Asia/Ho_Chi_Minh');
      expect(reply.scheduled.single.roomName, 'Phòng khách');
      expect(reply.scheduled.single.runAt, DateTime.utc(2026, 11, 15, 13));

      final pending = reply.pending!;
      expect(pending.requestId, 42);
      expect(pending.requestHash, 'abc123');
      expect(pending.expiresAt, DateTime.utc(2026, 11, 15, 13, 5));
      expect(pending.steps, hasLength(2));
      expect(pending.steps.first.runAt, isNull);
      expect(pending.steps.first.roomName, 'Phòng khách');
      expect(pending.steps.last.runAt, DateTime.utc(2026, 11, 15, 15));
      expect(pending.steps.last.roomName, isNull);

      expect(reply.rejected.map((r) => r.code), ['NOT_FOUND', 'FORBIDDEN']);
      expect(reply.rejected.first.message, 'Không thấy rèm.');
      expect(reply.rejected.last.message, isNull);
    });

    test('a bare answer defaults every list and object', () {
      final reply = agentReplyFromJson(
        asJson({'conversation_id': 'c', 'type': 'answer', 'reply': 'Xin chào'}),
      );
      expect(reply.type, AgentReplyType.answer);
      expect(reply.transcript, isNull);
      expect(reply.clarification, isNull);
      expect(reply.executed, isEmpty);
      expect(reply.scheduled, isEmpty);
      expect(reply.pending, isNull);
      expect(reply.rejected, isEmpty);
    });

    test('maps all seven reply types, an unknown one becomes answer', () {
      for (final type in AgentReplyType.values) {
        expect(AgentReplyType.fromApi(type.name), type);
      }
      expect(AgentReplyType.fromApi('weird'), AgentReplyType.answer);
      expect(AgentReplyType.fromApi(null), AgentReplyType.answer);
    });

    test('confirm result lists one schedule per step', () {
      final result = agentConfirmResultFromJson(
        asJson({
          'request_id': 42,
          'status': 'completed',
          'results': [_schedule(1), _schedule(2, status: 'scheduled')],
        }),
      );
      expect(result.requestId, 42);
      expect(result.results.map((s) => s.status), [
        AssistantScheduleStatus.done,
        AssistantScheduleStatus.scheduled,
      ]);
    });
  });

  group('WAV packer', () {
    test('wraps PCM16 mono 16 kHz in a 44-byte RIFF header', () {
      final pcm = Uint8List.fromList(List.generate(3200, (i) => i % 256));
      final wav = encodeWav(pcm);
      expect(wav.length, 44 + pcm.length);
      final header = ByteData.sublistView(wav);
      String tag(int at) => String.fromCharCodes(wav.sublist(at, at + 4));
      expect(tag(0), 'RIFF');
      expect(header.getUint32(4, Endian.little), 36 + pcm.length);
      expect(tag(8), 'WAVE');
      expect(tag(12), 'fmt ');
      expect(header.getUint32(16, Endian.little), 16);
      expect(header.getUint16(20, Endian.little), 1); // PCM
      expect(header.getUint16(22, Endian.little), 1); // mono
      expect(header.getUint32(24, Endian.little), 16000);
      expect(header.getUint32(28, Endian.little), 32000); // byte rate
      expect(header.getUint16(32, Endian.little), 2); // block align
      expect(header.getUint16(34, Endian.little), 16); // bits
      expect(tag(36), 'data');
      expect(header.getUint32(40, Endian.little), pcm.length);
      expect(wav.sublist(44), pcm);
    });

    test('30 seconds fit under the 1 MB upload limit', () {
      final wav = encodeWav(Uint8List(maxPcmBytes));
      expect(maxPcmBytes, 960000);
      expect(wav.length, 960044);
      expect(wav.length, lessThan(audioMaxBytes));
      expect(pcmDurationMs(maxPcmBytes), 30000);
    });
  });

  group('error sentences', () {
    String message(ApiException e, {bool voice = false}) =>
        assistantErrorMessage(e, voice: voice);

    test('agent codes get their own sentence', () {
      expect(
        message(const ApiException(code: 'EMPTY_AUDIO', statusCode: 400)),
        contains('chưa nghe thấy gì'),
      );
      expect(
        message(const ApiException(code: 'LLM_DISABLED', statusCode: 503)),
        contains('chưa được bật'),
      );
      expect(
        message(const ApiException(code: 'STT_DISABLED', statusCode: 503)),
        contains('gõ chữ'),
      );
      expect(
        message(const ApiException(code: 'ACCOUNT_LOCKED', statusCode: 403)),
        contains('bị khoá'),
      );
      expect(
        message(const ApiException(code: 'SESSION_EXPIRED', statusCode: 401)),
        contains('đăng nhập lại'),
      );
    });

    test('413 is told apart for voice and text', () {
      final tooLarge = ApiException.fromHttp(413, null);
      expect(message(tooLarge, voice: true), contains('tối đa 30 giây'));
      expect(message(tooLarge), contains('Tin nhắn quá dài'));
    });

    test('a 429 from nginx (HTML, no code) is the rate-limit sentence', () {
      final limited = ApiException.fromHttp(429, '<html>429</html>');
      expect(message(limited), contains('Đợi một lát'));
    });

    test('a 404 without an agent code means no agent on this server', () {
      expect(message(ApiException.fromHttp(404, null)), assistantUnavailable);
    });

    test('unknown codes and 5xx say "tạm bận", never a raw code', () {
      for (final error in const [
        ApiException(code: 'WEIRD_CODE', statusCode: 500),
        ApiException(code: 'AGENT_UNAVAILABLE', statusCode: 502),
        ApiException(code: 'SERVER_ERROR', statusCode: 503),
      ]) {
        final text = message(error);
        expect(text, contains('tạm bận'));
        expect(text, isNot(contains('WEIRD_CODE')));
      }
    });

    test('network errors use the shared sentence', () {
      expect(
        message(const ApiException(code: ApiErrorCode.networkError)),
        contains('Không kết nối được máy chủ'),
      );
    });

    test('confirm errors; stale ones lock the card', () {
      for (final code in [
        'NOT_FOUND',
        'REQUEST_NOT_PENDING',
        'REQUEST_EXPIRED',
        'REQUEST_CHANGED',
      ]) {
        final error = ApiException(code: code, statusCode: 409);
        expect(isStaleRequestError(error), isTrue, reason: code);
        expect(confirmErrorMessage(error), isNot(contains('_')));
      }
      expect(
        confirmErrorMessage(
          const ApiException(code: 'REQUEST_EXPIRED', statusCode: 409),
        ),
        contains('hết hạn'),
      );
      final invalid = const ApiException(
        code: 'INVALID_INPUT',
        statusCode: 400,
      );
      expect(isStaleRequestError(invalid), isFalse);
      expect(confirmErrorMessage(invalid), contains('chọn ít nhất một bước'));
      expect(
        isStaleRequestError(
          const ApiException(code: ApiErrorCode.networkError),
        ),
        isFalse,
      );
    });

    test('a rejected step uses the agent sentence, else one by code', () {
      expect(
        rejectedMessage(
          const AgentRejectedStep(index: 0, code: 'X', message: 'Câu riêng.'),
        ),
        'Câu riêng.',
      );
      expect(
        rejectedMessage(
          const AgentRejectedStep(index: 0, code: 'SCHEDULE_LIMIT'),
        ),
        contains('50 hẹn giờ'),
      );
      expect(
        rejectedMessage(const AgentRejectedStep(index: 0, code: 'ODD')),
        rejectedDefault,
      );
    });

    test('microphone sentences point at Settings or typing', () {
      expect(micFailureMessage(MicFailure.denied), contains('Cài đặt'));
      expect(micFailureMessage(MicFailure.denied), contains('Micro'));
    });
  });

  group('RemoteAssistantRepository', () {
    test('sends typed and voice messages to the agent, confirm/cancel to the '
        'backend', () async {
      final seen = <http.Request>[];
      final api = ApiClient(
        trustedOrigins: const ['http://agent.test'],
        baseUrl: 'http://backend.test/api/mobile',
        httpClient: MockClient((request) async {
          seen.add(request);
          final path = request.url.path;
          Map<String, Object?> body;
          if (path.endsWith('/messages') || path.endsWith('/voice')) {
            body = {
              'conversation_id': 'c-9',
              'type': 'answer',
              'reply': 'Ok',
              'transcript': path.endsWith('/voice') ? 'bật đèn' : null,
            };
          } else if (path.endsWith('/confirm')) {
            body = {
              'request_id': 7,
              'status': 'completed',
              'results': [_schedule(1)],
            };
          } else if (path.endsWith('/reject')) {
            body = {'request_id': 7, 'status': 'rejected'};
          } else {
            body = _schedule(5, status: 'cancelled');
          }
          return http.Response(
            jsonEncode(body),
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
        storage: MemorySessionStorage(
          tokens: const SessionTokens(accessToken: 'tok', refreshToken: 'ref'),
        ),
      );
      final repository = RemoteAssistantRepository(
        api,
        agentBaseUrl: 'http://agent.test/api/agent/',
      );

      final typed = await repository.sendText(
        3,
        'Bật đèn',
        conversationId: 'c-1',
      );
      expect(typed.reply, 'Ok');
      expect(
        seen.last.url.toString(),
        'http://agent.test/api/agent/homes/3/messages',
      );
      expect(jsonDecode(utf8.decode(seen.last.bodyBytes)), {
        'text': 'Bật đèn',
        'conversation_id': 'c-1',
      });
      expect(seen.last.headers['Authorization'], 'Bearer tok');

      await repository.sendText(3, 'Hi');
      expect(jsonDecode(utf8.decode(seen.last.bodyBytes)), {'text': 'Hi'});

      final audio = RecordedAudio(
        bytes: encodeWav(Uint8List(3200)),
        mimeType: wavMimeType,
        durationMs: 100,
      );
      final voice = await repository.sendVoice(3, audio, conversationId: 'c-1');
      expect(voice.transcript, 'bật đèn');
      expect(
        seen.last.url.toString(),
        'http://agent.test/api/agent/homes/3/voice?conversation_id=c-1',
      );
      expect(seen.last.headers['Content-Type'], 'audio/wav');
      expect(seen.last.headers['X-Audio-Duration-Ms'], '100');
      expect(seen.last.bodyBytes, audio.bytes);

      final confirmed = await repository.confirm(7, 'hash-1', [0, 2]);
      expect(confirmed.results, hasLength(1));
      expect(
        seen.last.url.toString(),
        'http://backend.test/api/mobile/agent/requests/7/confirm',
      );
      expect(jsonDecode(utf8.decode(seen.last.bodyBytes)), {
        'request_hash': 'hash-1',
        'step_indexes': [0, 2],
      });

      await repository.reject(7);
      expect(
        seen.last.url.toString(),
        'http://backend.test/api/mobile/agent/requests/7/reject',
      );

      final cancelled = await repository.cancelSchedule(5);
      expect(cancelled.status, AssistantScheduleStatus.cancelled);
      expect(
        seen.last.url.toString(),
        'http://backend.test/api/mobile/schedules/5/cancel',
      );
    });
  });

  group('AppConfig', () {
    test('the agent URL defaults to <API_BASE_URL>/api/agent', () {
      const config = AppConfig(apiBaseUrl: 'http://192.168.1.5');
      expect(config.agentBaseUrl, 'http://192.168.1.5/api/agent');
      const direct = AppConfig(
        apiBaseUrl: 'http://192.168.1.5',
        agentBaseUrl: 'http://10.0.2.2:8000/v1',
      );
      expect(direct.agentBaseUrl, 'http://10.0.2.2:8000/v1');
    });
  });

  group('AssistantChatNotifier on the mock', () {
    // 12:00 in Hà Nội on 15/11/2026; tests move it forward.
    late DateTime now;
    late MockBackend backend;
    late ProviderContainer container;

    AssistantChatNotifier chat() =>
        container.read(assistantChatProvider(_homeId).notifier);
    AssistantChatState state() =>
        container.read(assistantChatProvider(_homeId));
    AssistantEntry lastAssistant() =>
        state().entries.whereType<AssistantEntry>().last;
    bool power(String name) => backend.devices
        .firstWhere((d) => d.homeId == _homeId && d.name == name)
        .isOn;

    setUp(() {
      now = DateTime.utc(2026, 11, 15, 5);
      backend = MockBackend(clock: () => now)..currentUserId = 7;
      container = ProviderContainer(
        retry: (_, _) => null,
        overrides: [
          appConfigProvider.overrideWithValue(
            const AppConfig(apiBaseUrl: 'http://localhost:5000', useMock: true),
          ),
          mockBackendProvider.overrideWithValue(backend),
          sessionUserIdProvider.overrideWithValue(7),
        ],
      );
      addTearDown(container.dispose);
    });

    test(
      'a clear typed command runs now: done + a real device command',
      () async {
        expect(power('Đèn phòng khách'), isTrue);
        await chat().sendText('Tắt đèn phòng khách');

        expect(state().busy, isFalse);
        expect(state().entries, hasLength(2));
        expect(
          (state().entries.first as UserEntry).text,
          'Tắt đèn phòng khách',
        );
        final reply = lastAssistant().reply;
        expect(reply.type, AgentReplyType.done);
        expect(reply.executed.single.status, AssistantScheduleStatus.done);
        expect(reply.executed.single.actionLabel, 'Tắt đèn phòng khách');
        expect(power('Đèn phòng khách'), isFalse);
        expect(state().conversationId, reply.conversationId);
      },
    );

    test('"Bật" alone names no device → clarify; tapping a chip sends it', () async {
      await chat().sendText('Bật');
      final clarify = lastAssistant().reply;
      expect(clarify.type, AgentReplyType.clarify);
      expect(clarify.clarification!.options, hasLength(4));
      final conversation = state().conversationId;

      await chat().sendText(clarify.clarification!.options.first);
      expect(lastAssistant().reply.type, AgentReplyType.done);
      expect(state().conversationId, conversation); // same conversation
    });

    test('a time in the sentence schedules it; the schedule can be cancelled '
        'once', () async {
      await chat().sendText('8h tối bật đèn phòng khách');
      final reply = lastAssistant().reply;
      expect(reply.type, AgentReplyType.scheduled);
      final schedule = reply.scheduled.single;
      expect(schedule.status, AssistantScheduleStatus.scheduled);
      expect(schedule.isCancellable, isTrue);
      // 20:00 in Hà Nội = 13:00 UTC, later the same day.
      expect(schedule.runAt, DateTime.utc(2026, 11, 15, 13));

      expect(await chat().cancelSchedule(schedule.id), isNull);
      expect(
        lastAssistant().scheduled.single.status,
        AssistantScheduleStatus.cancelled,
      );
      expect(state().cancellingId, isNull);

      final error = await chat().cancelSchedule(schedule.id);
      expect(error, contains('không huỷ được nữa'));
    });

    test('"sau 30 phút" schedules relative to now', () async {
      await chat().sendText('tắt quạt phòng khách sau 30 phút');
      final schedule = lastAssistant().reply.scheduled.single;
      expect(schedule.runAt, now.add(const Duration(minutes: 30)));
    });

    test('a question is answered with the room reading', () async {
      await chat().sendText('Phòng khách bao nhiêu độ?');
      final reply = lastAssistant().reply;
      expect(reply.type, AgentReplyType.answer);
      expect(reply.reply, contains('°C'));
      expect(reply.executed, isEmpty);
    });

    test('a voice message is "heard" and shown as the transcript', () async {
      await chat().sendVoice(
        RecordedAudio(
          bytes: encodeWav(Uint8List(32000)),
          mimeType: wavMimeType,
          durationMs: 1000,
        ),
      );
      final user = state().entries.first as UserEntry;
      expect(user.voice, isTrue);
      expect(user.text, 'Tắt đèn phòng khách');
      expect(lastAssistant().reply.transcript, 'Tắt đèn phòng khách');
      expect(lastAssistant().reply.type, AgentReplyType.done);
    });

    test('a recording above 1 MB is refused before sending', () async {
      await chat().sendVoice(
        RecordedAudio(
          bytes: Uint8List(audioMaxBytes + 1),
          mimeType: wavMimeType,
          durationMs: 31000,
        ),
      );
      final entry = state().entries.single as ErrorEntry;
      expect(entry.text, contains('tối đa 30 giây'));
    });

    test(
      '"đi ngủ" asks for confirmation; confirming runs the chosen steps',
      () async {
        await chat().sendText('Tôi đi ngủ');
        final entry = lastAssistant();
        expect(entry.reply.type, AgentReplyType.confirm);
        expect(entry.outcome, isA<PendingOpen>());
        final pending = entry.reply.pending!;
        expect(pending.steps, isNotEmpty);
        expect(pending.expiresAt, now.add(const Duration(minutes: 5)));
        expect(power('Đèn phòng khách'), isTrue); // nothing ran yet

        await chat().confirm(entry.id, [pending.steps.first.index]);
        final done = lastAssistant().outcome as PendingDone;
        expect(done.results, hasLength(1));
        expect(done.results.single.status, AssistantScheduleStatus.done);
      },
    );

    test(
      'rejecting leaves the devices alone; the answered card ignores a later '
      'confirm',
      () async {
        await chat().sendText('Tôi đi ngủ');
        final id = lastAssistant().id;
        final steps = lastAssistant().reply.pending!.steps;

        await chat().reject(id);
        expect(lastAssistant().outcome, isA<PendingRejected>());
        expect(power('Đèn phòng khách'), isTrue);

        await chat().confirm(id, [steps.first.index]);
        expect(lastAssistant().outcome, isA<PendingRejected>());
        expect(power('Đèn phòng khách'), isTrue);
      },
    );

    test(
      'a double tap on Xác nhận sends one request and keeps the real result',
      () async {
        await chat().sendText('Tôi đi ngủ');
        final id = lastAssistant().id;
        final step = lastAssistant().reply.pending!.steps.first.index;

        // Both taps land before the first request returns.
        await Future.wait([
          chat().confirm(id, [step]),
          chat().confirm(id, [step]),
        ]);
        final done = lastAssistant().outcome as PendingDone;
        expect(done.results, hasLength(1));
        expect(done.results.single.status, AssistantScheduleStatus.done);
      },
    );

    test(
      'an expired request locks the card with the expiry sentence',
      () async {
        await chat().sendText('Tôi đi ngủ');
        final id = lastAssistant().id;
        final steps = lastAssistant().reply.pending!.steps;
        now = now.add(const Duration(minutes: 6));

        await chat().confirm(id, [steps.first.index]);
        final stale = lastAssistant().outcome as PendingStale;
        expect(stale.message, contains('hết hạn'));
        expect(power('Đèn phòng khách'), isTrue);
      },
    );

    test('a transient failure keeps the card usable with the error', () async {
      await chat().sendText('Tôi đi ngủ');
      final id = lastAssistant().id;
      // A step list the server refuses (nothing chosen is handled in the UI;
      // an unknown index → INVALID_INPUT, which is not a stale error).
      await chat().confirm(id, [99]);
      final open = lastAssistant().outcome as PendingOpen;
      expect(open.error, contains('chọn ít nhất một bước'));
    });

    test('reset forgets the conversation', () async {
      await chat().sendText('Bật đèn');
      expect(state().conversationId, isNotNull);
      chat().reset();
      expect(state().entries, isEmpty);
      expect(state().conversationId, isNull);
    });

    test(
      'errors become a Vietnamese bubble, the notifier is free again',
      () async {
        final failing = ProviderContainer(
          retry: (_, _) => null,
          overrides: [
            sessionUserIdProvider.overrideWithValue(7),
            assistantRepositoryProvider.overrideWithValue(_Failing()),
          ],
        );
        addTearDown(failing.dispose);
        final notifier = failing.read(assistantChatProvider(_homeId).notifier);
        await notifier.sendText('Bật đèn');
        var current = failing.read(assistantChatProvider(_homeId));
        expect(current.busy, isFalse);
        expect((current.entries.last as ErrorEntry).text, contains('tạm bận'));

        await notifier.sendVoice(
          RecordedAudio(
            bytes: Uint8List(10),
            mimeType: wavMimeType,
            durationMs: 700,
          ),
        );
        current = failing.read(assistantChatProvider(_homeId));
        expect(
          current.entries.whereType<UserEntry>().last.text,
          'Tin nhắn giọng nói',
        );
        expect((current.entries.last as ErrorEntry).text, contains('tạm bận'));
      },
    );

    test(
      'a reply that arrives after another user signed in is dropped',
      () async {
        final gated = _Gated();
        final switching = ProviderContainer(
          retry: (_, _) => null,
          overrides: [
            sessionUserIdProvider.overrideWith((ref) => ref.watch(_user)),
            assistantRepositoryProvider.overrideWithValue(gated),
          ],
        );
        addTearDown(switching.dispose);
        final notifier = switching.read(
          assistantChatProvider(_homeId).notifier,
        );

        final pending = notifier.sendText('Bật đèn');
        expect(switching.read(assistantChatProvider(_homeId)).busy, isTrue);

        // User 7 signs out, user 8 signs in on the same phone.
        switching.read(_user.notifier).set(8);
        expect(switching.read(assistantChatProvider(_homeId)).entries, isEmpty);

        gated.reply.complete(
          agentReplyFromJson(
            asJson({
              'conversation_id': 'c-7',
              'type': 'answer',
              'reply': 'Câu trả lời cho người dùng 7',
            }),
          ),
        );
        await pending;

        final after = switching.read(assistantChatProvider(_homeId));
        expect(after.entries, isEmpty);
        expect(after.conversationId, isNull);
        expect(after.busy, isFalse);
      },
    );
  });
}

class _SessionUser extends Notifier<int?> {
  @override
  int? build() => 7;

  void set(int? id) => state = id;
}

final _user = NotifierProvider<_SessionUser, int?>(_SessionUser.new);

/// Holds the text reply until the test completes [reply].
class _Gated extends _Failing {
  final reply = Completer<AgentReply>();

  @override
  Future<AgentReply> sendText(
    int homeId,
    String text, {
    String? conversationId,
  }) => reply.future;
}

class _Failing implements AssistantRepository {
  @override
  Future<AgentReply> sendText(
    int homeId,
    String text, {
    String? conversationId,
  }) => Future.error(const ApiException(code: 'WEIRD', statusCode: 502));

  @override
  Future<AgentReply> sendVoice(
    int homeId,
    RecordedAudio audio, {
    String? conversationId,
  }) => Future.error(const ApiException(code: 'WEIRD', statusCode: 502));

  @override
  Future<AgentConfirmResult> confirm(
    int requestId,
    String requestHash,
    List<int> stepIndexes,
  ) => Future.error(const ApiException(code: 'WEIRD', statusCode: 502));

  @override
  Future<void> reject(int requestId) =>
      Future.error(const ApiException(code: 'WEIRD', statusCode: 502));

  @override
  Future<AssistantSchedule> cancelSchedule(int scheduleId) =>
      Future.error(const ApiException(code: 'WEIRD', statusCode: 502));
}

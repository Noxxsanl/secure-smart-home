import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:smart_home_mobile/app/app.dart';
import 'package:smart_home_mobile/core/config/app_config.dart';
import 'package:smart_home_mobile/core/storage/session_storage.dart';
import 'package:smart_home_mobile/mock/mock_backend.dart';
import 'package:smart_home_mobile/mock/mock_providers.dart';
import 'package:smart_home_mobile/modules/ai/ai.dart';
import 'package:smart_home_mobile/modules/realtime/realtime.dart';

/// A microphone that records nothing: no plugin is touched in tests.
class _FakeRecorder implements VoiceRecorder {
  _FakeRecorder({
    this.durationMs = 2000,
    this.failure,
    this.startGate,
    this.permissionGranted = true,
  });

  final int durationMs;
  final MicFailure? failure;

  /// When set, [start] waits for it — the system permission dialog, or a slow
  /// microphone.
  final Completer<void>? startGate;

  /// What [isPermissionGranted] answers before [start] (false = first use).
  final bool permissionGranted;
  var starts = 0;
  var stops = 0;
  var cancels = 0;

  @override
  Future<bool> isPermissionGranted() async => permissionGranted;

  @override
  Future<void> start() async {
    starts++;
    await startGate?.future;
    if (failure != null) throw MicException(failure!);
  }

  @override
  Future<RecordedAudio?> stop() async {
    stops++;
    return RecordedAudio(
      bytes: encodeWav(Uint8List(pcmBytesPerMs * durationMs)),
      mimeType: wavMimeType,
      durationMs: durationMs,
    );
  }

  @override
  Future<void> cancel() async => cancels++;

  @override
  Future<void> dispose() async {}
}

Widget _app(_FakeRecorder recorder, MockBackend backend) => ProviderScope(
  retry: (_, _) => null,
  overrides: [
    appConfigProvider.overrideWithValue(
      const AppConfig(apiBaseUrl: 'http://localhost:5000', useMock: true),
    ),
    sessionStorageProvider.overrideWithValue(MemorySessionStorage()),
    mockBackendProvider.overrideWithValue(backend),
    realtimeEnabledProvider.overrideWithValue(false),
    voiceRecorderProvider.overrideWithValue(recorder),
  ],
  child: const SmartHomeApp(),
);

Future<void> _signIn(
  WidgetTester tester,
  _FakeRecorder recorder, {
  MockBackend? backend,
  Size size = const Size(1000, 3200),
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(_app(recorder, backend ?? MockBackend()));
  await tester.pumpAndSettle();
  await tester.enterText(
    find.widgetWithText(TextFormField, 'Email hoặc mã người dùng'),
    'user01@smarthome.local',
  );
  await tester.enterText(
    find.widgetWithText(TextFormField, 'Mật khẩu'),
    'user123',
  );
  await tester.tap(find.text('ĐĂNG NHẬP'));
  await tester.pumpAndSettle();
}

Future<void> _openAssistant(
  WidgetTester tester,
  _FakeRecorder recorder, {
  MockBackend? backend,
  Size size = const Size(1000, 3200),
}) async {
  await _signIn(tester, recorder, backend: backend, size: size);
  await tester.tap(find.byKey(const ValueKey('assistant-mic')));
  await tester.pumpAndSettle();
}

/// Puts a finger down on [key] and keeps it there past the 300 ms long press.
Future<TestGesture> _hold(WidgetTester tester, String key) async {
  final gesture = await tester.startGesture(
    tester.getCenter(find.byKey(ValueKey(key))),
  );
  await tester.pump(const Duration(milliseconds: 350));
  await tester.pump();
  return gesture;
}

/// Lifts the finger and lets the answer arrive (no pumpAndSettle: the pending
/// card of some answers ticks every second).
Future<void> _release(WidgetTester tester, TestGesture gesture) async {
  await gesture.up();
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

Future<void> _type(WidgetTester tester, String text) async {
  await tester.enterText(find.byKey(const ValueKey('assistant-input')), text);
  await tester.pump();
  await tester.tap(find.byKey(const ValueKey('assistant-send')));
  // The pending card ticks every second, so never pumpAndSettle after this.
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  testWidgets('the mic button opens the Assistant for the current home', (
    tester,
  ) async {
    await _openAssistant(tester, _FakeRecorder());

    expect(find.text('Trợ lý AI'), findsOneWidget);
    expect(find.textContaining('mình là Trợ lý của ngôi nhà'), findsOneWidget);
    expect(find.textContaining('gửi tới OpenAI'), findsOneWidget);
    // The empty conversation offers example sentences.
    expect(find.byKey(const ValueKey('chip-Bật đèn')), findsOneWidget);
    expect(
      find.text('Giữ nút mic để nói, hoặc gõ chữ bên dưới'),
      findsOneWidget,
    );
  });

  testWidgets('a typed clear command is done at once and reported', (
    tester,
  ) async {
    final backend = MockBackend();
    await _openAssistant(tester, _FakeRecorder(), backend: backend);

    await _type(tester, 'Tắt đèn phòng khách');
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Tắt đèn phòng khách'), findsWidgets); // bubble + result
    expect(find.text('Mình đã làm xong rồi nhé.'), findsOneWidget);
    expect(find.byKey(const ValueKey('assistant-executed')), findsOneWidget);
    expect(find.text('Đã làm'), findsOneWidget);
    expect(find.text('Đã thực hiện'), findsOneWidget);
    final lamp = backend.devices.firstWhere(
      (d) => d.homeId == 1 && d.name == 'Đèn phòng khách',
    );
    expect(lamp.isOn, isFalse);
    // The example sentences are gone once the conversation started.
    expect(find.byKey(const ValueKey('chip-Bật đèn')), findsNothing);
  });

  testWidgets('a question the Assistant asks back is answered by tapping a '
      'chip', (tester) async {
    await _openAssistant(tester, _FakeRecorder());

    await _type(tester, 'Bật');
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Bạn muốn bật thiết bị nào?'), findsOneWidget);
    final chip = find.byKey(const ValueKey('chip-Bật đèn phòng khách'));
    expect(chip, findsOneWidget);

    await tester.tap(chip);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const ValueKey('assistant-executed')), findsOneWidget);
  });

  testWidgets('"Cần xác nhận" card: tick steps, countdown, confirm', (
    tester,
  ) async {
    await _openAssistant(tester, _FakeRecorder());

    await _type(tester, 'Tôi đi ngủ');
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byKey(const ValueKey('pending-card')), findsOneWidget);
    expect(find.text('Cần xác nhận'), findsOneWidget);
    expect(find.textContaining('Hết hạn sau 5:00'), findsOneWidget);
    expect(find.text('Thực hiện ngay khi xác nhận'), findsWidgets);

    // Un-tick the first step, then confirm the rest.
    await tester.tap(find.byKey(const ValueKey('pending-step-0')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('pending-confirm')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byKey(const ValueKey('pending-card')), findsOneWidget);
    expect(find.text('Đã thực hiện'), findsWidgets);
    expect(find.byKey(const ValueKey('pending-confirm')), findsNothing);
    // Nothing keeps ticking now, so the screen settles.
    await tester.pumpAndSettle();
  });

  testWidgets('declining the card shows "Đã từ chối"', (tester) async {
    await _openAssistant(tester, _FakeRecorder());

    await _type(tester, 'Tôi đi ngủ');
    await tester.pump(const Duration(milliseconds: 100));
    await tester.tap(find.byKey(const ValueKey('pending-reject')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Đã từ chối'), findsOneWidget);
    expect(
      find.text('Đã huỷ yêu cầu. Mình không thực hiện gì cả.'),
      findsOneWidget,
    );
    await tester.pumpAndSettle();
  });

  testWidgets('a scheduled reply lists "Đã hẹn" and its Huỷ button works', (
    tester,
  ) async {
    await _openAssistant(tester, _FakeRecorder());

    await _type(tester, '8h tối bật đèn phòng khách');
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byKey(const ValueKey('assistant-scheduled')), findsOneWidget);
    expect(find.text('Đã hẹn'), findsOneWidget);
    expect(find.textContaining('20:00'), findsWidgets);
    final cancel = find.byKey(const ValueKey('cancel-schedule-1'));
    expect(cancel, findsOneWidget);

    await tester.tap(cancel);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Đã huỷ'), findsOneWidget);
    expect(cancel, findsNothing);
  });

  group('hold to talk — the mic in the middle of the bar', () {
    testWidgets('a quick tap opens the Assistant; nothing is recorded', (
      tester,
    ) async {
      final recorder = _FakeRecorder();
      await _signIn(tester, recorder);
      expect(find.text('Trợ lý AI'), findsNothing);

      await tester.tap(find.byKey(const ValueKey('assistant-mic')));
      await tester.pumpAndSettle();

      expect(find.text('Trợ lý AI'), findsOneWidget);
      expect(recorder.starts, 0);
    });

    testWidgets('holding records with a bubble; releasing sends the voice '
        'message and opens the Assistant', (tester) async {
      final recorder = _FakeRecorder();
      await _signIn(tester, recorder);

      final gesture = await _hold(tester, 'assistant-mic');
      expect(recorder.starts, 1);
      expect(find.text('Trợ lý AI'), findsNothing);
      expect(find.textContaining('Đang nghe… 0:00 / 0:30'), findsOneWidget);
      expect(find.text('Thả tay để gửi · Kéo lên để huỷ'), findsOneWidget);

      await tester.pump(const Duration(seconds: 4));
      expect(find.textContaining('Đang nghe… 0:04 / 0:30'), findsOneWidget);

      await _release(tester, gesture);
      expect(recorder.stops, 1);
      expect(find.byKey(const ValueKey('hold-bubble')), findsNothing);
      // The Assistant sheet opens and shows what was heard and the result.
      expect(find.text('Trợ lý AI'), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 400));
      expect(
        find.textContaining('Bạn nói: Tắt đèn phòng khách'),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('assistant-executed')), findsOneWidget);
      await tester.pumpAndSettle();
    });

    testWidgets('releasing before 0.6 s of audio sends nothing', (
      tester,
    ) async {
      final recorder = _FakeRecorder(durationMs: 300);
      await _signIn(tester, recorder);

      final gesture = await _hold(tester, 'assistant-mic');
      await _release(tester, gesture);

      expect(recorder.stops, 1);
      expect(find.text('Giữ lâu hơn một chút rồi nói nhé.'), findsOneWidget);
      expect(find.text('Trợ lý AI'), findsNothing);
      await tester.pumpAndSettle();
      expect(find.textContaining('Bạn nói:'), findsNothing);
    });

    testWidgets('dragging 80 dp away turns it into a cancel; releasing there '
        'discards the recording', (tester) async {
      final recorder = _FakeRecorder();
      await _signIn(tester, recorder);

      final gesture = await _hold(tester, 'assistant-mic');
      await gesture.moveBy(const Offset(0, -120));
      await tester.pump();
      expect(find.text('Thả tay để huỷ'), findsOneWidget);
      expect(find.text('Thả tay để gửi · Kéo lên để huỷ'), findsNothing);

      // Back in range: sending again.
      await gesture.moveBy(const Offset(0, 120));
      await tester.pump();
      expect(find.text('Thả tay để gửi · Kéo lên để huỷ'), findsOneWidget);

      await gesture.moveBy(const Offset(0, -120));
      await tester.pump();
      await _release(tester, gesture);

      expect(recorder.cancels, 1);
      expect(recorder.stops, 0);
      expect(find.text('Trợ lý AI'), findsNothing);
      expect(find.byKey(const ValueKey('hold-bubble')), findsNothing);
      await tester.pumpAndSettle();
      expect(find.textContaining('Bạn nói:'), findsNothing);
    });

    testWidgets('releasing while the microphone is still starting (the '
        'permission dialog) sends nothing', (tester) async {
      final gate = Completer<void>();
      final recorder = _FakeRecorder(startGate: gate, permissionGranted: false);
      await _signIn(tester, recorder);

      final gesture = await _hold(tester, 'assistant-mic');
      expect(find.text('Đang chuẩn bị micro…'), findsOneWidget);
      await gesture.up();
      await tester.pump();

      gate.complete();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(recorder.starts, 1);
      expect(recorder.cancels, 1);
      expect(recorder.stops, 0);
      expect(find.text('Trợ lý AI'), findsNothing);
      expect(
        find.text('Đã cấp quyền micro — giữ nút mic để nói.'),
        findsOneWidget,
      );
      await tester.pumpAndSettle();
    });

    testWidgets('with the permission already granted, an early release is '
        '"hold longer", not "permission granted"', (tester) async {
      final gate = Completer<void>();
      final recorder = _FakeRecorder(startGate: gate);
      await _signIn(tester, recorder);

      final gesture = await _hold(tester, 'assistant-mic');
      await gesture.up();
      await tester.pump();

      gate.complete();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(recorder.cancels, 1);
      expect(recorder.stops, 0);
      expect(find.text('Giữ lâu hơn một chút rồi nói nhé.'), findsOneWidget);
      expect(
        find.text('Đã cấp quyền micro — giữ nút mic để nói.'),
        findsNothing,
      );
      await tester.pumpAndSettle();
    });

    testWidgets('a refused microphone permission explains how to allow it', (
      tester,
    ) async {
      final recorder = _FakeRecorder(failure: MicFailure.denied);
      await _signIn(tester, recorder);

      final gesture = await _hold(tester, 'assistant-mic');
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.textContaining('Cài đặt'), findsOneWidget);
      expect(find.textContaining('gõ chữ thay thế'), findsOneWidget);
      expect(find.byKey(const ValueKey('hold-bubble')), findsNothing);
      await gesture.up();
      await tester.pumpAndSettle();
      expect(recorder.stops, 0);
    });
  });

  group('hold to talk — the mic inside the Assistant', () {
    testWidgets('a quick tap only reminds to hold the button', (tester) async {
      final recorder = _FakeRecorder();
      await _openAssistant(tester, recorder);

      await tester.tap(find.byKey(const ValueKey('mic-button')));
      await tester.pump();

      expect(recorder.starts, 0);
      expect(find.text('Giữ nút mic để nói.'), findsOneWidget);
    });

    testWidgets('holding records, releasing sends the transcript as a voice '
        'bubble', (tester) async {
      final recorder = _FakeRecorder();
      await _openAssistant(tester, recorder);

      final gesture = await _hold(tester, 'mic-button');
      expect(recorder.starts, 1);
      expect(find.textContaining('Đang nghe… 0:00 / 0:30'), findsOneWidget);

      await tester.pump(const Duration(seconds: 5));
      expect(find.textContaining('Đang nghe… 0:05 / 0:30'), findsOneWidget);
      // Typing is locked while recording.
      expect(
        tester
            .widget<TextField>(find.byKey(const ValueKey('assistant-input')))
            .enabled,
        isFalse,
      );

      await _release(tester, gesture);
      expect(recorder.stops, 1);
      expect(
        find.textContaining('Bạn nói: Tắt đèn phòng khách'),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('assistant-executed')), findsOneWidget);
      await tester.pumpAndSettle();
    });

    testWidgets('a refused microphone permission is explained in the sheet', (
      tester,
    ) async {
      final recorder = _FakeRecorder(failure: MicFailure.denied);
      await _openAssistant(tester, recorder);

      final gesture = await _hold(tester, 'mic-button');
      await tester.pump(const Duration(milliseconds: 50));
      await gesture.up();
      await tester.pump();

      expect(find.byKey(const ValueKey('assistant-mic-error')), findsOneWidget);
      expect(find.textContaining('Cài đặt'), findsOneWidget);
      expect(find.textContaining('gõ chữ thay thế'), findsOneWidget);
      // Back to idle: typing still works.
      expect(
        tester
            .widget<TextField>(find.byKey(const ValueKey('assistant-input')))
            .enabled,
        isTrue,
      );
    });
  });

  testWidgets('the conversation survives closing the sheet; a new one clears '
      'it', (tester) async {
    await _openAssistant(tester, _FakeRecorder());

    await _type(tester, 'Phòng khách bao nhiêu độ?');
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.textContaining('độ ẩm'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('assistant-close')));
    await tester.pumpAndSettle();
    expect(find.text('Trợ lý AI'), findsNothing);

    await tester.tap(find.byKey(const ValueKey('assistant-mic')));
    await tester.pumpAndSettle();
    expect(find.textContaining('độ ẩm'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('assistant-reset')));
    await tester.pumpAndSettle();
    expect(find.textContaining('độ ẩm'), findsNothing);
    expect(find.textContaining('mình là Trợ lý của ngôi nhà'), findsOneWidget);
  });

  testWidgets('every block fits a 360 px phone without overflow', (
    tester,
  ) async {
    await _openAssistant(tester, _FakeRecorder(), size: const Size(360, 780));

    await _type(tester, '8h tối bật đèn phòng khách, tắt quạt phòng khách');
    await tester.pump(const Duration(milliseconds: 100));
    await _type(tester, 'Tôi đi ngủ');
    await tester.pump(const Duration(milliseconds: 100));
    await _type(tester, 'bật máy sưởi');
    await tester.pump(const Duration(milliseconds: 100));

    // The list is lazy: the newest blocks are the ones on screen.
    expect(find.byKey(const ValueKey('pending-card')), findsOneWidget);
    expect(find.byKey(const ValueKey('assistant-rejected')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

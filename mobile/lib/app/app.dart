import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme/app_theme.dart';
import '../core/widgets/app_feedback.dart';
import 'app_root.dart';
import 'router.dart';

class SmartHomeApp extends ConsumerWidget {
  const SmartHomeApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp(
      title: 'Smart Home IoT',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      scaffoldMessengerKey: ref.watch(rootMessengerKeyProvider),
      home: const AppRoot(),
      onGenerateRoute: onGenerateAppRoute,
    );
  }
}

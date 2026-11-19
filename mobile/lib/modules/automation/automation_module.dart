/// Pages of the automation module for the composition root (lib/app/).
///
/// The "Tự động" tab is two sub-tabs (Hẹn giờ | Tự động hoá). The frame lives
/// here, not in a feature: `features/schedules` and `features/rules` must not
/// import each other, and this entry may import both.
library;

import 'package:flutter/material.dart';

import 'features/rules/rules_view.dart';
import 'features/schedules/schedules_view.dart';

/// "Tự động" tab: one-off schedules (FR-5.10) and automation rules (FR-7.1).
class AutomationPage extends StatelessWidget {
  const AutomationPage({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          automaticallyImplyLeading: false,
          title: const Text('Tự động'),
          bottom: const TabBar(
            tabs: [
              Tab(
                key: ValueKey<String>('automation-tab-schedules'),
                text: 'Hẹn giờ',
              ),
              Tab(
                key: ValueKey<String>('automation-tab-rules'),
                text: 'Tự động hoá',
              ),
            ],
          ),
        ),
        body: const TabBarView(children: [SchedulesView(), RulesView()]),
      ),
    );
  }
}

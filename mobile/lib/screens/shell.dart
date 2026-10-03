import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/theme.dart';

/// Bottom navigation: the five places a student goes most.
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  static const _items = [
    (Icons.home_outlined, Icons.home_rounded, 'Home'),
    (Icons.map_outlined, Icons.map_rounded, 'Roadmaps'),
    (Icons.groups_outlined, Icons.groups_rounded, 'Groups'),
    (Icons.forum_outlined, Icons.forum_rounded, 'Community'),
    (Icons.apps_outlined, Icons.apps_rounded, 'More'),
  ];

  @override
  Widget build(BuildContext context) => Scaffold(
        body: shell,
        bottomNavigationBar: DecoratedBox(
          decoration: const BoxDecoration(border: Border(top: BorderSide(color: AppColors.line))),
          child: NavigationBar(
            selectedIndex: shell.currentIndex,
            onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
            destinations: [for (final (off, on, label) in _items) NavigationDestination(icon: Icon(off), selectedIcon: Icon(on), label: label)],
          ),
        ),
      );
}

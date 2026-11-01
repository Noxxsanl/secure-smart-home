import 'package:flutter/material.dart';

class BottomNavItem {
  const BottomNavItem({
    required this.label,
    required this.icon,
    required this.selectedIcon,
    this.badgeCount = 0,
  });

  final String label;
  final IconData icon;
  final IconData selectedIcon;

  /// Unread counter shown as a badge (0 hides it).
  final int badgeCount;
}

class AppBottomNavigationBar extends StatelessWidget {
  const AppBottomNavigationBar({
    super.key,
    required this.items,
    required this.selectedIndex,
    required this.onSelected,
  });

  final List<BottomNavItem> items;
  final int selectedIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Material(
      elevation: 12,
      color: colorScheme.surface,
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 72,
          child: Row(
            children: List.generate(items.length, (index) {
              final item = items[index];
              final isSelected = selectedIndex == index;
              final color = isSelected
                  ? colorScheme.primary
                  : colorScheme.onSurfaceVariant;

              return Expanded(
                child: Semantics(
                  selected: isSelected,
                  button: true,
                  child: InkWell(
                    key: ValueKey<String>('nav-${item.label}'),
                    onTap: () => onSelected(index),
                    child: Column(
                      children: [
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 220),
                          curve: Curves.easeOut,
                          width: isSelected ? 36 : 0,
                          height: 3,
                          decoration: BoxDecoration(
                            color: colorScheme.primary,
                            borderRadius: const BorderRadius.vertical(
                              bottom: Radius.circular(4),
                            ),
                          ),
                        ),
                        const SizedBox(height: 9),
                        Badge(
                          isLabelVisible: item.badgeCount > 0,
                          label: Text(
                            item.badgeCount > 99 ? '99+' : '${item.badgeCount}',
                          ),
                          child: Icon(
                            isSelected ? item.selectedIcon : item.icon,
                            color: color,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          item.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: color,
                            fontSize: 12,
                            fontWeight: isSelected
                                ? FontWeight.bold
                                : FontWeight.normal,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}

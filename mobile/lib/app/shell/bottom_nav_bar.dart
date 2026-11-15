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

/// Height of the bar proper (without the safe area under it).
const double kNavBarHeight = 64;

/// How far the middle of the bar bulges above its top edge.
const double kNavBumpHeight = 20;

/// Width of the bulge at the top edge.
const double kNavBumpWidth = 110;

/// Width left in the row for the middle slot; the tabs share the rest.
const double _centerSlotWidth = 84;

/// Bottom bar: the first half of [items] on the left, [center] in a round
/// bulge in the middle, the rest on the right. The bulge is part of the bar's
/// outline (and of its shadow); everything around it is transparent, so the
/// page background shows through.
class AppBottomNavigationBar extends StatelessWidget {
  AppBottomNavigationBar({
    super.key,
    required this.items,
    required this.selectedIndex,
    required this.onSelected,
    required this.center,
  }) : assert(items.length.isEven, 'Tabs are split evenly around the middle');

  final List<BottomNavItem> items;
  final int selectedIndex;
  final ValueChanged<int> onSelected;

  /// Widget in the bulge (the Assistant's mic and its label). It is placed
  /// with its top above the bar's top edge.
  final Widget center;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final bottomInset = MediaQuery.paddingOf(context).bottom;
    final half = items.length ~/ 2;

    return SizedBox(
      height: kNavBumpHeight + kNavBarHeight + bottomInset,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned.fill(
            child: CustomPaint(
              painter: _BarPainter(
                color: colorScheme.surface,
                shadowColor: Colors.black,
              ),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            top: kNavBumpHeight,
            height: kNavBarHeight,
            child: Row(
              children: [
                for (var i = 0; i < half; i++) _tab(context, i),
                const SizedBox(width: _centerSlotWidth),
                for (var i = half; i < items.length; i++) _tab(context, i),
              ],
            ),
          ),
          // The button's top sits 16 dp above the bar's edge, inside the bulge.
          Positioned(
            left: 0,
            right: 0,
            top: kNavBumpHeight - 16,
            child: Center(child: center),
          ),
        ],
      ),
    );
  }

  Widget _tab(BuildContext context, int index) {
    final colorScheme = Theme.of(context).colorScheme;
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
                  fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The bar's outline: a straight top edge with a smooth bulge in the middle
/// (two Bézier curves), filled with [color] and shadowed along that outline.
class _BarPainter extends CustomPainter {
  const _BarPainter({required this.color, required this.shadowColor});

  final Color color;
  final Color shadowColor;

  Path _outline(Size size) {
    final centerX = size.width / 2;
    const half = kNavBumpWidth / 2;
    const shoulder = kNavBumpWidth * 0.26;
    const top = kNavBumpHeight;
    return Path()
      ..moveTo(0, top)
      ..lineTo(centerX - half, top)
      ..cubicTo(
        centerX - half + shoulder,
        top,
        centerX - half * 0.55,
        0,
        centerX,
        0,
      )
      ..cubicTo(
        centerX + half * 0.55,
        0,
        centerX + half - shoulder,
        top,
        centerX + half,
        top,
      )
      ..lineTo(size.width, top)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
  }

  @override
  void paint(Canvas canvas, Size size) {
    final path = _outline(size);
    canvas.drawShadow(path, shadowColor, 8, false);
    canvas.drawPath(path, Paint()..color = color);
  }

  @override
  bool shouldRepaint(_BarPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.shadowColor != shadowColor;
}

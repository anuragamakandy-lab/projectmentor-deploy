import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api.dart';
import 'format.dart' as fmt;
import 'format.dart' hide initials;
import 'theme.dart';

void showSnack(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}

String errorText(Object e) => e is ApiException ? e.message : 'Something went wrong. Please try again.';

Future<bool> confirm(BuildContext context, {required String title, required String message, String ok = 'Confirm', bool danger = false}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      backgroundColor: AppColors.bg,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: Text(title, style: Theme.of(context).textTheme.titleLarge),
      content: Text(message, style: Theme.of(context).textTheme.bodyMedium),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel', style: TextStyle(color: AppColors.soft))),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(90, 44), backgroundColor: danger ? AppColors.danger : AppColors.ink),
          onPressed: () => Navigator.pop(c, true),
          child: Text(ok),
        ),
      ],
    ),
  );
  return r ?? false;
}

/// Soft header background (the website's sub-page artwork), fading into the page colour.
class HeroBackground extends StatelessWidget {
  const HeroBackground({super.key, this.height = 260});
  final double height;
  @override
  Widget build(BuildContext context) => SizedBox(
        height: height,
        width: double.infinity,
        child: ShaderMask(
          shaderCallback: (r) => const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Colors.black, Colors.black, Colors.transparent],
            stops: [0, 0.5, 1],
          ).createShader(r),
          blendMode: BlendMode.dstIn,
          child: Image.asset('assets/images/page-hero.webp', fit: BoxFit.cover, alignment: Alignment.topCenter),
        ),
      );
}

/// Page title block used at the top of every main screen.
class PageHeader extends StatelessWidget {
  const PageHeader({super.key, required this.title, this.eyebrow, this.subtitle, this.trailing});
  final String title;
  final String? eyebrow;
  final String? subtitle;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
      child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (eyebrow != null) Eyebrow(eyebrow!),
            Text(title, style: t.headlineMedium),
            if (subtitle != null) ...[const SizedBox(height: 6), Text(subtitle!, style: t.bodyMedium)],
          ]),
        ),
        if (trailing != null) ...[const SizedBox(width: 12), trailing!],
      ]),
    );
  }
}

class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key, this.color = AppColors.accent});
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 18, height: 2, decoration: BoxDecoration(color: AppColors.gold, borderRadius: BorderRadius.circular(2))),
          const SizedBox(width: 8),
          Text(text.toUpperCase(), style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, letterSpacing: 1.4, color: color)),
        ]),
      );
}

/// Scrollable page with the hero background, a header and pull-to-refresh.
class HeroPage extends StatelessWidget {
  const HeroPage({super.key, required this.header, required this.children, this.onRefresh, this.padding = const EdgeInsets.fromLTRB(20, 8, 20, 32)});
  final Widget header;
  final List<Widget> children;
  final Future<void> Function()? onRefresh;
  final EdgeInsets padding;
  @override
  Widget build(BuildContext context) {
    final list = ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      children: [
        Stack(children: [
          // The artwork sits behind the header and the top of the content, then fades into the page.
          const Positioned(top: 0, left: 0, right: 0, child: HeroBackground()),
          SafeArea(
            bottom: false,
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const SizedBox(height: 8),
              header,
              Padding(padding: padding, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children)),
            ]),
          ),
        ]),
      ],
    );
    return onRefresh == null ? list : RefreshIndicator(color: AppColors.accent, onRefresh: onRefresh!, child: list);
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.action, this.onAction});
  final String title;
  final String? action;
  final VoidCallback? onAction;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 22, bottom: 10),
        child: Row(children: [
          Expanded(child: Text(title, style: Theme.of(context).textTheme.titleLarge)),
          if (action != null) TextButton(onPressed: onAction, child: Text(action!)),
        ]),
      );
}

class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.onTap, this.padding = const EdgeInsets.all(18), this.color, this.borderColor});
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsets padding;
  final Color? color;
  final Color? borderColor;
  @override
  Widget build(BuildContext context) => Material(
        color: color ?? Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: borderColor ?? AppColors.line)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
      );
}

class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.label});
  final String? label;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 60),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 2.6)),
          if (label != null) ...[const SizedBox(height: 14), Text(label!, style: Theme.of(context).textTheme.bodyMedium, textAlign: TextAlign.center)],
        ]),
      );
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, required this.message, this.action, this.onAction});
  final IconData icon;
  final String title;
  final String message;
  final String? action;
  final VoidCallback? onAction;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(24, 32, 24, 28),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18), border: Border.all(color: AppColors.line)),
        child: Column(children: [
          Container(width: 56, height: 56, decoration: const BoxDecoration(color: AppColors.mint, shape: BoxShape.circle), child: Icon(icon, color: AppColors.accent, size: 26)),
          const SizedBox(height: 14),
          Text(title, style: Theme.of(context).textTheme.titleMedium, textAlign: TextAlign.center),
          const SizedBox(height: 6),
          Text(message, style: Theme.of(context).textTheme.bodyMedium, textAlign: TextAlign.center),
          if (action != null) ...[const SizedBox(height: 18), FilledButton(onPressed: onAction, child: Text(action!))],
        ]),
      );
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => EmptyState(icon: Icons.wifi_off_rounded, title: 'Could not load this', message: message, action: 'Try again', onAction: onRetry);
}

/// Badge frames awarded by admins (same colours as the website).
const badgeColors = {'Silver': Color(0xFFA8B2BF), 'Gold': Color(0xFFD4A63A), 'Premium': Color(0xFF6B5BD2), 'Diamond': Color(0xFF2FA7D4)};

/// Profile picture (or initials), framed in the user's badge colour.
class Avatar extends StatelessWidget {
  const Avatar({super.key, this.name, this.initials, this.seed, this.size = 36, this.photoId, this.badge});
  final String? name;
  final String? initials;
  final String? seed;
  final double size;
  final String? photoId;
  final String? badge;
  static const _palette = [Color(0xFF1F6F7F), Color(0xFF2F7FD1), Color(0xFF6B5BD2), Color(0xFFC2573A), Color(0xFFA9832B), Color(0xFF0F8A95), Color(0xFFB23A6F), Color(0xFF3D7A2A)];
  @override
  Widget build(BuildContext context) {
    final key = seed ?? name ?? initials ?? '';
    var h = 0;
    for (final c in key.codeUnits) { h = (h * 31 + c) & 0x7fffffff; }
    final frame = badgeColors[badge];
    Widget face = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(color: _palette[h % _palette.length], shape: BoxShape.circle),
      child: photoId != null
          ? Image.network(api.uploadUrl(photoId!), width: size, height: size, fit: BoxFit.cover, cacheWidth: (size * 3).round(),
              errorBuilder: (_, __, ___) => Text(initials ?? initialsOf(name), style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: size * 0.36)))
          : Text(initials ?? initialsOf(name), style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: size * 0.36)),
    );
    if (frame == null) return face;
    final ring = (size / 18).clamp(2.0, 5.0);
    return Stack(clipBehavior: Clip.none, children: [
      Container(
        padding: EdgeInsets.all(ring),
        decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: frame, width: ring)),
        child: face,
      ),
      if (size >= 40)
        Positioned(right: -2, bottom: -2, child: Container(
          width: 18, height: 18, alignment: Alignment.center,
          decoration: BoxDecoration(color: frame, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)),
          child: Text(badge![0], style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800)),
        )),
    ]);
  }
  static String initialsOf(String? n) => fmt.initials(n ?? '');
}

/// "Gold" style chip next to a name.
class BadgeChip extends StatelessWidget {
  const BadgeChip(this.badge, {super.key});
  final String? badge;
  @override
  Widget build(BuildContext context) {
    final c = badgeColors[badge];
    if (c == null) return const SizedBox.shrink();
    return Container(
      margin: const EdgeInsets.only(left: 6),
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(999), border: Border.all(color: c, width: 1.5)),
      child: Text(badge!, style: TextStyle(color: c, fontSize: 10.5, fontWeight: FontWeight.w800)),
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill(this.status, {super.key, this.overdue = false});
  final String status;
  final bool overdue;
  @override
  Widget build(BuildContext context) {
    final (bg, fg) = overdue
        ? (const Color(0xFFF8E1DC), AppColors.danger)
        : switch (status) {
            'Done' => (const Color(0xFFDDEFE5), AppColors.success),
            'InProgress' || 'Doing' => (const Color(0xFFFBEBC7), AppColors.warn),
            'Blocked' => (const Color(0xFFF8E1DC), AppColors.danger),
            'Accepted' => (const Color(0xFFDDEFE5), AppColors.success),
            'PendingApproval' => (const Color(0xFFE6EEF7), const Color(0xFF2F5F9A)),
            _ => (AppColors.bg2, AppColors.soft),
          };
    final label = overdue ? 'Overdue' : (status == 'PendingApproval' ? 'Needs review' : statusLabel(status));
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(label, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w700)),
    );
  }
}

class PhaseTag extends StatelessWidget {
  const PhaseTag(this.phase, {super.key});
  final String phase;
  @override
  Widget build(BuildContext context) {
    final c = AppColors.phase(phase);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(999)),
      child: Text(phase.toUpperCase(), style: TextStyle(color: c, fontSize: 10.5, fontWeight: FontWeight.w800, letterSpacing: 0.8)),
    );
  }
}

/// Circular progress with the number in the middle.
class ProgressRing extends StatelessWidget {
  const ProgressRing({super.key, required this.percent, this.size = 64, this.stroke = 6, this.label, this.color = AppColors.accent, this.track = AppColors.bg2, this.textColor = AppColors.ink});
  final double percent;
  final double size;
  final double stroke;
  final String? label;
  final Color color;
  final Color track;
  final Color textColor;
  @override
  Widget build(BuildContext context) => SizedBox(
        width: size,
        height: size,
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: percent.clamp(0, 100) / 100),
          duration: const Duration(milliseconds: 900),
          curve: Curves.easeOutCubic,
          builder: (_, v, __) => CustomPaint(
            painter: _RingPainter(v, stroke, color, track),
            child: Center(child: Text(label ?? '${percent.round()}%', style: TextStyle(fontWeight: FontWeight.w800, fontSize: size * 0.24, color: textColor))),
          ),
        ),
      );
}

class _RingPainter extends CustomPainter {
  _RingPainter(this.v, this.stroke, this.color, this.track);
  final double v, stroke;
  final Color color, track;
  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final p = Paint()..style = PaintingStyle.stroke..strokeWidth = stroke..strokeCap = StrokeCap.round;
    canvas.drawArc(rect.deflate(stroke / 2), 0, math.pi * 2, false, p..color = track);
    if (v > 0) canvas.drawArc(rect.deflate(stroke / 2), -math.pi / 2, math.pi * 2 * v, false, p..color = color);
  }
  @override
  bool shouldRepaint(_RingPainter o) => o.v != v;
}

class InfoRow extends StatelessWidget {
  const InfoRow({super.key, required this.icon, required this.text, this.color = AppColors.soft});
  final IconData icon;
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 6),
        Flexible(child: Text(text, style: TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.w500))),
      ]);
}

/// Bottom-sheet helper with the app's styling and keyboard-safe padding.
Future<T?> showAppSheet<T>(BuildContext context, Widget Function(BuildContext) builder) => showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      useRootNavigator: true,
      useSafeArea: true,
      builder: (c) => Padding(padding: EdgeInsets.only(bottom: MediaQuery.of(c).viewInsets.bottom), child: builder(c)),
    );

/// A bottom sheet with standard padding that scrolls when its content is taller than the screen.
Future<T?> showPanel<T>(BuildContext context, Widget Function(BuildContext) builder) => showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      useRootNavigator: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (c) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(c).viewInsets.bottom),
        child: SingleChildScrollView(padding: const EdgeInsets.fromLTRB(20, 18, 20, 22), child: builder(c)),
      ),
    );

/// Asks for a line (or paragraph) of text. Returns null when cancelled.
Future<String?> promptText(BuildContext context, {required String title, String initial = '', bool multiline = false, String ok = 'Save'}) {
  final controller = TextEditingController(text: initial);
  return showDialog<String>(
    context: context,
    builder: (c) => AlertDialog(
      backgroundColor: AppColors.bg,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: Text(title, style: Theme.of(context).textTheme.titleLarge),
      content: TextField(controller: controller, autofocus: true, minLines: multiline ? 3 : 1, maxLines: multiline ? 8 : 1),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel', style: TextStyle(color: AppColors.soft))),
        FilledButton(style: FilledButton.styleFrom(minimumSize: const Size(90, 44)), onPressed: () => Navigator.pop(c, controller.text.trim()), child: Text(ok)),
      ],
    ),
  );
}

Future<void> copyText(String text) => Clipboard.setData(ClipboardData(text: text));


/// Light Markdown for chatbot replies: paragraphs, "- " and "1. " lists, **bold** and `code`.
class MarkdownText extends StatelessWidget {
  const MarkdownText(this.text, {super.key, this.style});
  final String text;
  final TextStyle? style;

  static TextSpan _inline(String s, TextStyle base) {
    final spans = <TextSpan>[];
    final re = RegExp(r'(\*\*[^*]+\*\*|`[^`]+`)');
    var last = 0;
    for (final m in re.allMatches(s)) {
      if (m.start > last) spans.add(TextSpan(text: s.substring(last, m.start)));
      final t = m.group(0)!;
      spans.add(t.startsWith('**')
          ? TextSpan(text: t.substring(2, t.length - 2), style: const TextStyle(fontWeight: FontWeight.w800))
          : TextSpan(text: t.substring(1, t.length - 1), style: const TextStyle(fontFamily: 'monospace', backgroundColor: Color(0x14172D4C))));
      last = m.end;
    }
    if (last < s.length) spans.add(TextSpan(text: s.substring(last)));
    return TextSpan(style: base, children: spans);
  }

  @override
  Widget build(BuildContext context) {
    final base = style ?? const TextStyle(color: AppColors.ink, height: 1.45, fontSize: 15);
    final children = <Widget>[];
    for (final raw in text.replaceAll('\r', '').split('\n')) {
      final line = raw.trimRight();
      if (line.trim().isEmpty) { if (children.isNotEmpty) children.add(const SizedBox(height: 6)); continue; }
      final bullet = RegExp(r'^\s*[-*•]\s+(.*)').firstMatch(line);
      final num = RegExp(r'^\s*(\d+)[.)]\s+(.*)').firstMatch(line);
      if (bullet != null || num != null) {
        children.add(Padding(padding: const EdgeInsets.only(left: 4, bottom: 3), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 18, child: Text(bullet != null ? '•' : '${num!.group(1)}.', style: base.copyWith(fontWeight: FontWeight.w800))),
          Expanded(child: Text.rich(_inline(bullet != null ? bullet.group(1)! : num!.group(2)!, base))),
        ])));
      } else {
        children.add(Text.rich(_inline(line.replaceFirst(RegExp(r'^#{1,4}\s+'), ''), base)));
      }
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: children);
  }
}

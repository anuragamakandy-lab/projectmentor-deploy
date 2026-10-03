import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/session.dart';
import '../core/theme.dart';

/// Opening animation (mobile version of the website preloader):
/// gold curves draw in, the logo wipes in from the left, a status line and counter run,
/// then the app opens on the right screen for this user.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});
  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 2300))..forward();
  Timer? _done;

  @override
  void initState() {
    super.initState();
    _done = Timer(const Duration(milliseconds: 2600), () {
      if (!mounted) return;
      context.go(session.isLoggedIn ? '/home' : (session.onboarded ? '/login' : '/welcome'));
    });
  }

  @override
  void dispose() {
    _done?.cancel();
    _c.dispose();
    super.dispose();
  }

  double _interval(double begin, double end, [Curve curve = Curves.easeInOutCubic]) =>
      curve.transform(((_c.value - begin) / (end - begin)).clamp(0.0, 1.0));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          final curves = _interval(0, 0.75);
          final logo = _interval(0.1, 0.62);
          final tag = _interval(0.5, 0.8, Curves.easeOutCubic);
          final count = (_interval(0, 0.95, Curves.easeOutCubic) * 100).round();
          final status = count < 35 ? 'Loading your workspace' : count < 70 ? 'Preparing lessons and templates' : count < 100 ? 'Getting your AI mentor ready' : 'Welcome';
          return Stack(children: [
            Positioned.fill(child: CustomPaint(painter: _CurvesPainter(curves))),
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 40),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  ClipRect(child: Align(alignment: Alignment.centerLeft, widthFactor: logo, child: Image.asset('assets/images/logo-full.png', width: 260))),
                  const SizedBox(height: 14),
                  Opacity(
                    opacity: tag,
                    child: Transform.translate(offset: Offset(0, 10 * (1 - tag)), child: const Text('From first idea to final viva', style: TextStyle(color: AppColors.soft, fontSize: 15, fontWeight: FontWeight.w500))),
                  ),
                ]),
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: SafeArea(
                top: false,
                child: Column(children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 0, 24, 12),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Expanded(child: Text(status.toUpperCase(), style: const TextStyle(fontSize: 11, letterSpacing: 1.6, fontWeight: FontWeight.w700, color: AppColors.faint))),
                      Text('$count', style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w800, height: 1, letterSpacing: -1.5, color: AppColors.ink, fontFeatures: [FontFeature.tabularFigures()])),
                      const Text('%', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: AppColors.faint)),
                    ]),
                  ),
                  Align(alignment: Alignment.centerLeft, child: FractionallySizedBox(widthFactor: count / 100, child: Container(height: 2, color: AppColors.gold))),
                ]),
              ),
            ),
          ]);
        },
      ),
    );
  }
}

/// Thin gold curves and soft corner shapes — the same motif as the website header artwork.
class _CurvesPainter extends CustomPainter {
  _CurvesPainter(this.t);
  final double t;
  @override
  void paint(Canvas canvas, Size s) {
    final blob = Paint()..color = const Color(0xFFE8E9DC).withValues(alpha: 0.9 * t.clamp(0, 1));
    canvas.drawPath(Path()..moveTo(0, 0)..lineTo(s.width * 0.55, 0)..cubicTo(s.width * 0.45, s.height * 0.12, s.width * 0.25, s.height * 0.2, 0, s.height * 0.24)..close(), blob);
    canvas.drawPath(Path()..moveTo(s.width, s.height)..lineTo(s.width * 0.35, s.height)..cubicTo(s.width * 0.55, s.height * 0.86, s.width * 0.8, s.height * 0.78, s.width, s.height * 0.74)..close(), blob);

    final line = Paint()..style = PaintingStyle.stroke..strokeWidth = 1.3..color = AppColors.gold;
    final paths = [
      Path()..moveTo(0, s.height * 0.27)..cubicTo(s.width * 0.3, s.height * 0.26, s.width * 0.55, s.height * 0.14, s.width * 0.75, 0),
      Path()..moveTo(s.width * 0.25, s.height)..cubicTo(s.width * 0.5, s.height * 0.9, s.width * 0.7, s.height * 0.8, s.width, s.height * 0.76),
      Path()..moveTo(s.width, s.height * 0.05)..cubicTo(s.width * 0.82, s.height * 0.07, s.width * 0.78, s.height * 0.2, s.width * 0.86, s.height * 0.28),
    ];
    for (final p in paths) {
      for (final m in p.computeMetrics()) {
        canvas.drawPath(m.extractPath(0, m.length * t), line);
      }
    }
    if (t > 0.85) {
      final dot = Paint()..color = const Color(0xFFCDD6C6).withValues(alpha: ((t - 0.85) / 0.15).clamp(0, 1));
      canvas.drawCircle(Offset(s.width * 0.86, s.height * 0.28), 7, dot);
    }
  }
  @override
  bool shouldRepaint(_CurvesPainter o) => o.t != t;
}

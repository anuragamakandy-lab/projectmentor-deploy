import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Languages an admin can give an examiner (same as the website).
const examinerLanguages = {'en-GB': 'English (British)', 'en-US': 'English (American)', 'en-IN': 'English (South Asian)'};

/// Accents a student can pick for the microphone.
const studentAccents = {'en-US': 'English (American)', 'en-GB': 'English (British)', 'en-IN': 'English (Indian / Sri Lankan)', 'en-AU': 'English (Australian)'};

String sampleLine(Map? c) => 'Hello, I am ${c?['name'] ?? 'your examiner'}. This is how I sound.';

Future<String> savedAccent() async => (await SharedPreferences.getInstance()).getString('pm.viva.accent') ?? 'en-US';
Future<void> saveAccent(String v) async => (await SharedPreferences.getInstance()).setString('pm.viva.accent', v);

/// Sets the TTS engine to the character's language, gender, speed and pitch.
/// Returns false when the phone has no voice for the language (e.g. Sinhala) — show the text instead.
Future<bool> applyExaminerVoice(FlutterTts tts, Map? c) async {
  final lang = (c?['language'] as String?) ?? 'en-GB';
  try {
    final available = await tts.isLanguageAvailable(lang);
    if (available != true && available != 1) {
      if (!lang.startsWith('en')) return false;
      await tts.setLanguage('en-GB');
    } else {
      await tts.setLanguage(lang);
    }
    // Prefer a voice of the right gender when the engine lists them.
    final voices = await tts.getVoices;
    if (voices is List) {
      final want = (c?['gender'] == 'female') ? RegExp('female|woman', caseSensitive: false) : RegExp(r'\bmale\b|man', caseSensitive: false);
      final match = voices.cast<Map>().where((v) => '${v['locale']}'.toLowerCase().replaceAll('_', '-') == lang.toLowerCase() && want.hasMatch('${v['name']} ${v['gender'] ?? ''}')).firstOrNull;
      if (match != null) await tts.setVoice({'name': '${match['name']}', 'locale': '${match['locale']}'});
    }
    // flutter_tts: 0.5 is a normal rate on Android; the admin's 1.0x maps to ~0.48.
    await tts.setSpeechRate(((c?['rate'] as num?)?.toDouble() ?? 1.0) * 0.48);
    await tts.setPitch(((c?['pitch'] as num?)?.toDouble() ?? 0.95));
    return true;
  } catch (_) {
    return lang.startsWith('en');
  }
}

Color _hex(String? h, Color fallback) {
  if (h == null || h.length != 7) return fallback;
  return Color(int.parse('FF${h.substring(1)}', radix: 16));
}

Color _shade(Color c, double amount) => Color.lerp(c, amount < 0 ? Colors.black : Colors.white, amount.abs())!;

/// The 2D examiner portrait (same design as the website), drawn with a painter. Animates the mouth while talking.
class ExaminerPortrait extends StatefulWidget {
  const ExaminerPortrait({super.key, required this.look, this.size = 96, this.talking = false});
  final Map? look;
  final double size;
  final bool talking;
  @override
  State<ExaminerPortrait> createState() => _ExaminerPortraitState();
}

class _ExaminerPortraitState extends State<ExaminerPortrait> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 260));

  @override
  void didUpdateWidget(covariant ExaminerPortrait old) {
    super.didUpdateWidget(old);
    if (widget.talking && !_c.isAnimating) _c.repeat(reverse: true);
    if (!widget.talking && _c.isAnimating) { _c.stop(); _c.value = 0; }
  }

  @override
  void initState() {
    super.initState();
    if (widget.talking) _c.repeat(reverse: true);
  }

  @override
  void dispose() { _c.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => ClipOval(
        child: SizedBox(
          width: widget.size,
          height: widget.size,
          child: AnimatedBuilder(animation: _c, builder: (_, __) => CustomPaint(painter: _ExaminerPainter(widget.look ?? const {}, _c.value))),
        ),
      );
}

class _ExaminerPainter extends CustomPainter {
  _ExaminerPainter(this.look, this.mouth);
  final Map look;
  final double mouth;

  @override
  void paint(Canvas canvas, Size size) {
    // Draw in the website's 300x300 space, cropped to the portrait (72,46 → 228,202).
    final s = size.width / 156;
    canvas.scale(s);
    canvas.translate(-72, -46);
    final skin = _hex(look['skinTone'], const Color(0xFFEFC29A));
    final hair = _hex(look['hairColor'], const Color(0xFFC9CFD2));
    final outfit = _hex(look['outfitColor'], const Color(0xFF127A53));
    final accent = _hex(look['accentColor'], const Color(0xFFC39A3C));
    final female = look['gender'] == 'female';
    final style = (look['hairStyle'] as String?) ?? 'short';
    final p = Paint()..isAntiAlias = true;

    canvas.drawRect(const Rect.fromLTWH(72, 46, 156, 156), p..color = const Color(0xFFF1EBDE));
    // hair behind
    if (style == 'long') canvas.drawPath(ui.Path()..moveTo(86, 120)..cubicTo(80, 70, 112, 50, 150, 50)..cubicTo(188, 50, 220, 70, 214, 120)..lineTo(222, 214)..lineTo(78, 214)..close(), p..color = _shade(hair, -0.12));
    if (style == 'bun') canvas.drawCircle(const Offset(150, 52), 20, p..color = _shade(hair, -0.12));
    if (style == 'curly') canvas.drawOval(const Rect.fromLTWH(84, 52, 132, 100), p..color = _shade(hair, -0.12));
    // jacket
    canvas.drawPath(ui.Path()..moveTo(54, 300)..cubicTo(56, 250, 90, 224, 132, 212)..lineTo(150, 236)..lineTo(168, 212)..cubicTo(210, 224, 244, 250, 246, 300)..close(), p..color = outfit);
    canvas.drawPath(ui.Path()..moveTo(132, 212)..lineTo(150, 236)..lineTo(168, 212)..lineTo(163, 205)..lineTo(150, 220)..lineTo(137, 205)..close(), p..color = const Color(0xFFF7F8F4));
    if (!female) canvas.drawPath(ui.Path()..moveTo(146, 224)..lineTo(154, 224)..lineTo(158, 262)..lineTo(150, 274)..lineTo(142, 262)..close(), p..color = accent);
    // neck, ears, face
    canvas.drawRect(const Rect.fromLTWH(134, 184, 32, 30), p..color = _shade(skin, -0.08));
    canvas.drawOval(Rect.fromCenter(center: const Offset(94, 134), width: 18, height: 28), p);
    canvas.drawOval(Rect.fromCenter(center: const Offset(206, 134), width: 18, height: 28), p);
    if (female) {
      canvas.drawCircle(const Offset(94, 150), 3.5, Paint()..color = accent);
      canvas.drawCircle(const Offset(206, 150), 3.5, Paint()..color = accent);
    }
    canvas.drawOval(Rect.fromCenter(center: const Offset(150, 128), width: 114, height: 128), p..color = skin);
    // hair front
    p.color = hair;
    switch (style) {
      case 'bald':
        break;
      case 'curly':
        for (final o in const [Offset(104, 92), Offset(120, 76), Offset(140, 68), Offset(160, 68), Offset(180, 76), Offset(196, 92), Offset(100, 112), Offset(200, 112)]) { canvas.drawCircle(o, 16, p); }
      case 'side':
        canvas.drawPath(ui.Path()..moveTo(92, 124)..cubicTo(86, 76, 114, 54, 152, 56)..cubicTo(192, 58, 214, 82, 208, 124)..cubicTo(204, 104, 196, 94, 186, 88)..cubicTo(160, 92, 128, 82, 112, 96)..cubicTo(102, 102, 95, 110, 92, 124)..close(), p);
      case 'long':
      case 'bun':
        canvas.drawPath(ui.Path()..moveTo(92, 128)..cubicTo(86, 78, 114, 56, 150, 56)..cubicTo(186, 56, 214, 78, 208, 128)..cubicTo(202, 102, 186, 88, 166, 84)..cubicTo(152, 96, 128, 100, 108, 98)..cubicTo(100, 106, 95, 116, 92, 128)..close(), p);
      default:
        canvas.drawPath(ui.Path()..moveTo(92, 124)..cubicTo(86, 78, 112, 56, 150, 56)..cubicTo(190, 56, 214, 78, 208, 124)..cubicTo(205, 106, 198, 96, 189, 90)..cubicTo(172, 98, 128, 98, 111, 90)..cubicTo(102, 96, 95, 106, 92, 124)..close(), p);
    }
    // cheeks, brows, eyes
    final cheek = Paint()..color = const Color(0xFFE8846C).withValues(alpha: female ? 0.3 : 0.2);
    canvas.drawCircle(const Offset(113, 157), 9, cheek);
    canvas.drawCircle(const Offset(187, 157), 9, cheek);
    final line = Paint()..color = _shade(hair, -0.3)..style = PaintingStyle.stroke..strokeWidth = 3.4..strokeCap = StrokeCap.round;
    canvas.drawPath(ui.Path()..moveTo(113, 110)..quadraticBezierTo(126, 102, 140, 107), line);
    canvas.drawPath(ui.Path()..moveTo(160, 107)..quadraticBezierTo(174, 102, 187, 110), line);
    for (final x in const [127.0, 173.0]) {
      canvas.drawOval(Rect.fromCenter(center: Offset(x, 130), width: 15, height: 16), Paint()..color = Colors.white);
      canvas.drawCircle(Offset(x, 131), 3.8, Paint()..color = const Color(0xFF23302A));
      canvas.drawCircle(Offset(x + 1.3, 129.5), 1.1, Paint()..color = Colors.white);
    }
    if (look['glasses'] == true) {
      final g = Paint()..color = const Color(0xFF1D2320)..style = PaintingStyle.stroke..strokeWidth = 3;
      canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(107, 115, 40, 29), const Radius.circular(10)), g);
      canvas.drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(153, 115, 40, 29), const Radius.circular(10)), g);
      canvas.drawLine(const Offset(147, 127), const Offset(153, 127), g);
    }
    // nose
    canvas.drawPath(ui.Path()..moveTo(150, 136)..quadraticBezierTo(143, 152, 149, 157)..quadraticBezierTo(154, 159, 158, 155),
        Paint()..color = _shade(skin, -0.2)..style = PaintingStyle.stroke..strokeWidth = 2.6..strokeCap = StrokeCap.round);
    if (look['facialHair'] == true && !female) {
      canvas.drawPath(ui.Path()..moveTo(131, 167)..quadraticBezierTo(141, 159, 150, 164)..quadraticBezierTo(159, 159, 169, 167)..quadraticBezierTo(160, 172, 150, 168)..quadraticBezierTo(140, 172, 131, 167)..close(), Paint()..color = hair);
    }
    // mouth: smile, opening while talking
    if (mouth > 0.05) {
      canvas.drawOval(Rect.fromCenter(center: const Offset(150, 178), width: 18, height: 4 + 9 * mouth), Paint()..color = const Color(0xFF6B2424));
    } else {
      canvas.drawPath(ui.Path()..moveTo(134, 173)..quadraticBezierTo(150, 193, 166, 173)..quadraticBezierTo(150, 180, 134, 173)..close(), Paint()..color = const Color(0xFF6B2424));
    }
  }

  @override
  bool shouldRepaint(covariant _ExaminerPainter old) => old.mouth != mouth || old.look != look;
}

import 'package:flutter/material.dart';

/// Same palette as the website: cream, navy, teal, flat colours only.
class AppColors {
  static const bg = Color(0xFFFAF4E8);
  static const bg2 = Color(0xFFF1EBDE);
  static const surface = Colors.white;
  static const ink = Color(0xFF172D4C);
  static const soft = Color(0xFF4F5F74);
  static const faint = Color(0xFF8794A5);
  static const accent = Color(0xFF1F6F7F);
  static const accentDark = Color(0xFF185A67);
  static const teal = Color(0xFFA3CFD8);
  static const mint = Color(0xFFD3E6DA);
  static const sage = Color(0xFFB7D7CD);
  static const sun = Color(0xFFF2C77A);
  static const gold = Color(0xFFC9A15A);
  static const line = Color(0x1C172D4C);
  static const danger = Color(0xFFB0391F);
  static const success = Color(0xFF2F8F5B);
  static const warn = Color(0xFFB07D16);

  static const phases = <String, Color>{
    'Title': Color(0xFF6B5BD2),
    'Design': Color(0xFF2F7FD1),
    'Build': Color(0xFF1F6F7F),
    'Documentation': Color(0xFFA9832B),
    'Presentation': Color(0xFFC2573A),
    'Deployment': Color(0xFF0F8A95),
  };
  static Color phase(String? p) => phases[p] ?? accent;
}

const kFont = 'PlusJakartaSans';

ThemeData buildTheme() {
  const scheme = ColorScheme(
    brightness: Brightness.light,
    primary: AppColors.ink,
    onPrimary: Colors.white,
    secondary: AppColors.accent,
    onSecondary: Colors.white,
    tertiary: AppColors.sun,
    onTertiary: AppColors.ink,
    error: AppColors.danger,
    onError: Colors.white,
    surface: AppColors.surface,
    onSurface: AppColors.ink,
  );
  final base = ThemeData(useMaterial3: true, colorScheme: scheme, fontFamily: kFont, scaffoldBackgroundColor: AppColors.bg);
  final text = base.textTheme.apply(bodyColor: AppColors.ink, displayColor: AppColors.ink, fontFamily: kFont);
  final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(12));

  return base.copyWith(
    textTheme: text.copyWith(
      headlineLarge: text.headlineLarge?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -1.0, height: 1.1),
      headlineMedium: text.headlineMedium?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.8, height: 1.15),
      headlineSmall: text.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.5),
      titleLarge: text.titleLarge?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.3),
      titleMedium: text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
      titleSmall: text.titleSmall?.copyWith(fontWeight: FontWeight.w600),
      bodyLarge: text.bodyLarge?.copyWith(height: 1.55, color: AppColors.ink),
      bodyMedium: text.bodyMedium?.copyWith(height: 1.5, color: AppColors.soft),
      bodySmall: text.bodySmall?.copyWith(color: AppColors.faint),
      labelLarge: text.labelLarge?.copyWith(fontWeight: FontWeight.w600),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.bg,
      foregroundColor: AppColors.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(fontFamily: kFont, fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.ink, letterSpacing: -0.3),
    ),
    cardTheme: CardTheme(
      color: AppColors.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: AppColors.line)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.ink,
        foregroundColor: Colors.white,
        minimumSize: const Size(64, 52),
        shape: shape,
        textStyle: const TextStyle(fontFamily: kFont, fontWeight: FontWeight.w700, fontSize: 15.5),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.ink,
        minimumSize: const Size(64, 52),
        side: const BorderSide(color: AppColors.line, width: 1.2),
        backgroundColor: Colors.white,
        shape: shape,
        textStyle: const TextStyle(fontFamily: kFont, fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: AppColors.accent, textStyle: const TextStyle(fontFamily: kFont, fontWeight: FontWeight.w700)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      hintStyle: const TextStyle(color: AppColors.faint, fontWeight: FontWeight.w400),
      labelStyle: const TextStyle(color: AppColors.soft),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.line)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.accent, width: 1.6)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.danger)),
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: AppColors.bg2,
      selectedColor: AppColors.ink,
      labelStyle: const TextStyle(fontFamily: kFont, fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.ink),
      secondaryLabelStyle: const TextStyle(fontFamily: kFont, fontWeight: FontWeight.w600, fontSize: 13, color: Colors.white),
      side: BorderSide.none,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      showCheckmark: false,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: AppColors.mint,
      elevation: 0,
      height: 68,
      labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(
            fontFamily: kFont,
            fontSize: 12,
            fontWeight: s.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
            color: s.contains(WidgetState.selected) ? AppColors.ink : AppColors.faint,
          )),
      iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(color: s.contains(WidgetState.selected) ? AppColors.ink : AppColors.faint)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: AppColors.ink,
      contentTextStyle: const TextStyle(fontFamily: kFont, color: Colors.white),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    dividerTheme: const DividerThemeData(color: AppColors.line, space: 1, thickness: 1),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: AppColors.bg,
      showDragHandle: true,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    ),
    tabBarTheme: const TabBarTheme(
      labelColor: AppColors.ink,
      unselectedLabelColor: AppColors.faint,
      indicatorColor: AppColors.accent,
      dividerColor: AppColors.line,
      labelStyle: TextStyle(fontFamily: kFont, fontWeight: FontWeight.w700, fontSize: 14),
      unselectedLabelStyle: TextStyle(fontFamily: kFont, fontWeight: FontWeight.w500, fontSize: 14),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: AppColors.accent, linearTrackColor: AppColors.bg2),
  );
}

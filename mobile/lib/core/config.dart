import 'package:flutter/foundation.dart';

/// Where the app finds the ProjectMentor API (the same backend and database as the website).
/// The address is set when the app is built, so students never have to type a server address:
///   flutter build apk --dart-define=API_URL=https://api.your-domain.com --dart-define=WEB_URL=https://your-domain.com
/// Without it: Android emulator -> 10.0.2.2 (the host PC), web/desktop -> localhost.
class AppConfig {
  static const _fromBuild = String.fromEnvironment('API_URL');
  static const _webFromBuild = String.fromEnvironment('WEB_URL');

  static String get apiUrl {
    if (_fromBuild.isNotEmpty) return _fromBuild;
    if (kIsWeb) return 'http://localhost:5220';
    return defaultTargetPlatform == TargetPlatform.android ? 'http://10.0.2.2:5220' : 'http://localhost:5220';
  }

  static String get webUrl => _webFromBuild.isNotEmpty ? _webFromBuild : 'http://localhost:5173';

  static Future<void> load() async {}
}

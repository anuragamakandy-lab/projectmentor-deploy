import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';

class AppUser {
  AppUser({required this.id, required this.email, required this.fullName, required this.role});
  final String id;
  final String email;
  final String fullName;
  final String role;
  bool get isAdmin => role == 'Admin';
  String get firstName => fullName.trim().split(RegExp(r'\s+')).first;

  factory AppUser.fromAuth(Map<String, dynamic> j) =>
      AppUser(id: j['userId'], email: j['email'], fullName: j['fullName'], role: j['role']);
  Map<String, dynamic> toJson() => {'userId': id, 'email': email, 'fullName': fullName, 'role': role};
}

/// Signed-in state, kept on the device so students stay logged in (token expires after 8 hours).
class Session extends ChangeNotifier {
  Session._();
  static final Session instance = Session._();
  static const _key = 'pm.session';
  static const _onboardKey = 'pm.onboarded';

  AppUser? user;
  bool onboarded = false;
  String? pendingInvite; // invite code to join after logging in
  bool get isLoggedIn => user != null && api.token != null;

  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    onboarded = prefs.getBool(_onboardKey) ?? false;
    final raw = prefs.getString(_key);
    if (raw != null) {
      try {
        final j = jsonDecode(raw) as Map<String, dynamic>;
        api.token = j['token'] as String?;
        user = AppUser.fromAuth(j);
      } catch (_) {
        await prefs.remove(_key);
      }
    }
    api.onUnauthorized = () => logout(expired: true);
  }

  bool sessionExpired = false;

  Future<void> _store(Map<String, dynamic> auth) async {
    api.token = auth['token'] as String;
    user = AppUser.fromAuth(auth);
    sessionExpired = false;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode({...user!.toJson(), 'token': api.token}));
    notifyListeners();
  }

  Future<void> login(String email, String password) async => _store(await api.login(email.trim(), password));
  Future<void> register(String name, String email, String password, int? year) async =>
      _store(await api.register(name.trim(), email.trim(), password, year));

  /// Google sign-in: the ProjectMentor session returned by /api/auth/google.
  Future<void> loginWithAuth(Map<String, dynamic> auth) => _store(auth);

  /// After the student edits their name on the profile screen.
  Future<void> updateName(String fullName) async {
    if (user == null) return;
    await _store({...user!.toJson(), 'fullName': fullName, 'token': api.token});
  }

  Future<void> logout({bool expired = false}) async {
    if (user == null && api.token == null) return;
    api.token = null;
    user = null;
    sessionExpired = expired;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
    notifyListeners();
  }

  Future<void> finishOnboarding() async {
    onboarded = true;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_onboardKey, true);
    notifyListeners();
  }
}

final session = Session.instance;

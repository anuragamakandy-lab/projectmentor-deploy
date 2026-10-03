import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_sign_in/google_sign_in.dart';

import 'api.dart';
import 'session.dart';
import 'theme.dart';
import 'widgets.dart';
import 'google_web_button_stub.dart' if (dart.library.js_interop) 'google_web_button_web.dart';

/// The Google account picked on Create account (it still needs a password before the account is made).
typedef GooglePick = void Function(String idToken, String email, String? name);

/// "Continue with Google" for the phone app. Shown only when the server has a Google client id
/// (GOOGLE_CLIENT_IDS). On Log in the server signs in an EXISTING account only; a Google account with no
/// ProjectMentor account is sent to Create account. On Create account [onPick] receives the Google token.
class GoogleSignInButton extends StatefulWidget {
  const GoogleSignInButton({super.key, this.onPick, this.label = 'Continue with Google'});
  final GooglePick? onPick;
  final String label;
  @override
  State<GoogleSignInButton> createState() => _GoogleSignInButtonState();
}

class _GoogleSignInButtonState extends State<GoogleSignInButton> {
  String? _clientId;
  bool _busy = false;

  GoogleSignIn? _web;
  StreamSubscription<GoogleSignInAccount?>? _sub;

  @override
  void initState() {
    super.initState();
    api.googleClientId().then((id) {
      if (!mounted || id == null) return;
      setState(() => _clientId = id);
      if (kIsWeb) {
        // Browser: Google's own button signs in; the ID token arrives through onCurrentUserChanged.
        _web = GoogleSignIn(clientId: id, scopes: const ['email', 'profile']);
        _sub = _web!.onCurrentUserChanged.listen((account) async {
          if (account == null) return;
          final token = (await account.authentication).idToken;
          if (token != null) await _finish(token, account.email, account.displayName);
        });
        _web!.signInSilently().catchError((_) => null);
      }
    }).catchError((_) {});
  }

  @override
  void dispose() { _sub?.cancel(); super.dispose(); }

  Future<void> _finish(String idToken, String email, String? name) async {
    if (widget.onPick != null) { widget.onPick!(idToken, email, name); return; }
    setState(() => _busy = true);
    try {
      await session.loginWithAuth(await api.googleSignIn(idToken));
    } on ApiException catch (e) {
      _failed(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _failed(ApiException e) {
    if (!mounted) return;
    // A deactivated account goes to the Contact the admins form with its details filled in.
    if (e.isDeactivated) { context.push('/contact', extra: {...?e.data, 'deactivated': true}); return; }
    // No ProjectMentor account for this Google email: never create one on Log in — go to Create account.
    if (e.status == 404 && e.data?['code'] == 'no_account') {
      showSnack(context, 'No ProjectMentor account for this Google email yet. Create one first.');
      context.go('/register', extra: {'email': e.data?['email'], 'name': e.data?['name']});
      return;
    }
    showSnack(context, 'Google sign-in failed: ${e.message}');
  }

  Future<void> _signIn() async {
    setState(() => _busy = true);
    try {
      final google = GoogleSignIn(scopes: const ['email', 'profile'], serverClientId: _clientId);
      await google.signOut();
      final account = await google.signIn();
      if (account == null) return; // cancelled
      final idToken = (await account.authentication).idToken;
      if (idToken == null) throw Exception('Google did not return a sign-in token.');
      if (widget.onPick != null) { widget.onPick!(idToken, account.email, account.displayName); return; }
      await session.loginWithAuth(await api.googleSignIn(idToken));
    } on ApiException catch (e) {
      _failed(e);
    } catch (e) {
      if (mounted) showSnack(context, 'Google sign-in failed: ${errorText(e)}');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_clientId == null) return const SizedBox.shrink();
    if (kIsWeb) {
      return Column(children: [
        const SizedBox(height: 14),
        const Row(children: [Expanded(child: Divider()), Padding(padding: EdgeInsets.symmetric(horizontal: 10), child: Text('or', style: TextStyle(color: AppColors.faint))), Expanded(child: Divider())]),
        const SizedBox(height: 14),
        Center(child: SizedBox(height: 44, child: googleWebButton())),
      ]);
    }
    return Column(children: [
      const SizedBox(height: 14),
      const Row(children: [Expanded(child: Divider()), Padding(padding: EdgeInsets.symmetric(horizontal: 10), child: Text('or', style: TextStyle(color: AppColors.faint))), Expanded(child: Divider())]),
      const SizedBox(height: 14),
      OutlinedButton.icon(
        onPressed: _busy ? null : _signIn,
        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52), backgroundColor: Colors.white),
        icon: _busy
            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
            : Container(width: 22, height: 22, alignment: Alignment.center, decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: AppColors.line)),
                child: const Text('G', style: TextStyle(fontWeight: FontWeight.w800, color: Color(0xFF4285F4)))),
        label: Text(widget.label, style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
    ]);
  }
}

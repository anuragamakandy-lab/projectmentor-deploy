import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/session.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import '../core/google_auth.dart';
import '../core/api.dart';

/// First-run introduction: three short slides with the website photos.
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});
  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _page = PageController();
  int _index = 0;
  // The website's hero artwork first, then the same photos the website uses.
  static const _slides = [
    ('assets/images/hero.webp', 'From first idea to final viva', 'Plan your project with an AI mentor that knows your deadline, your skills and your time.'),
    ('assets/images/community.webp', 'Build it together', 'Private groups with a weekly sprint board, plus a community to share progress and get help.'),
    ('assets/images/graduation.webp', 'Write it up and defend it', 'Lessons, templates and an AI examiner to practise your viva before it counts.'),
  ];

  Future<void> _finish(String route) async {
    await session.finishOnboarding();
    if (mounted) context.go(route);
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 8, 0),
            child: Row(children: [
              Image.asset('assets/images/logo-full.png', height: 30),
              const Spacer(),
              TextButton(onPressed: () => _finish('/login'), child: const Text('Skip')),
            ]),
          ),
          Expanded(
            child: PageView.builder(
              controller: _page,
              itemCount: _slides.length,
              onPageChanged: (i) => setState(() => _index = i),
              itemBuilder: (_, i) {
                final (img, title, text) = _slides[i];
                return Padding(
                  padding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Expanded(child: ClipRRect(borderRadius: BorderRadius.circular(20), child: Image.asset(img, fit: BoxFit.cover, width: double.infinity))),
                    const SizedBox(height: 28),
                    Text(title, style: t.headlineMedium),
                    const SizedBox(height: 10),
                    Text(text, style: t.bodyLarge?.copyWith(color: AppColors.soft)),
                  ]),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 20, 24, 20),
            child: Row(children: [
              Row(children: List.generate(_slides.length, (i) => AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    margin: const EdgeInsets.only(right: 6),
                    width: i == _index ? 22 : 8,
                    height: 8,
                    decoration: BoxDecoration(color: i == _index ? AppColors.ink : AppColors.line, borderRadius: BorderRadius.circular(8)),
                  ))),
              const Spacer(),
              FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size(140, 52)),
                onPressed: () => _index < _slides.length - 1
                    ? _page.nextPage(duration: const Duration(milliseconds: 350), curve: Curves.easeOutCubic)
                    : _finish('/register'),
                child: Text(_index < _slides.length - 1 ? 'Next' : 'Get started'),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _AuthFrame extends StatelessWidget {
  const _AuthFrame({required this.title, required this.subtitle, required this.children});
  final String title;
  final String subtitle;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      body: Stack(children: [
        const Positioned(top: 0, left: 0, right: 0, child: HeroBackground(height: 320)),
        SafeArea(
          child: ListView(padding: const EdgeInsets.fromLTRB(24, 20, 24, 32), children: [
            Image.asset('assets/images/logo-full.png', height: 34, alignment: Alignment.centerLeft),
            const SizedBox(height: 44),
            if (session.pendingInvite != null)
              Container(
                margin: const EdgeInsets.only(bottom: 18),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: AppColors.mint, borderRadius: BorderRadius.circular(12)),
                child: const Text('To join the project group, sign up or log in first. You will join the group right after.', style: TextStyle(color: AppColors.accentDark, fontWeight: FontWeight.w600)),
              ),
            Text(title, style: t.headlineLarge),
            const SizedBox(height: 8),
            Text(subtitle, style: t.bodyLarge?.copyWith(color: AppColors.soft)),
            const SizedBox(height: 28),
            ...children,
          ]),
        ),
      ]),
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _hide = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (session.sessionExpired) _error = 'Your session expired. Please log in again.';
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() { _busy = true; _error = null; });
    try {
      await session.login(_email.text, _password.text);
    } on ApiException catch (e) {
      if (e.isDeactivated) {
        if (mounted) context.push('/contact', extra: {...?e.data, 'deactivated': true});
      } else {
        setState(() => _error = e.status == 401 ? 'Incorrect email or password.' : e.message);
      }
    } catch (e) {
      setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => _AuthFrame(
        title: 'Welcome back',
        subtitle: 'Log in to keep your next milestone in view.',
        children: [
          Form(
            key: _form,
            child: AutofillGroup(
              child: Column(children: [
                TextFormField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.mail_outline_rounded)),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter your email address' : !emailOk(v) ? 'Enter a valid email address' : null,
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _password,
                  obscureText: _hide,
                  autofillHints: const [AutofillHints.password],
                  onFieldSubmitted: (_) => _submit(),
                  decoration: InputDecoration(
                    labelText: 'Password',
                    prefixIcon: const Icon(Icons.lock_outline_rounded),
                    suffixIcon: IconButton(icon: Icon(_hide ? Icons.visibility_outlined : Icons.visibility_off_outlined), onPressed: () => setState(() => _hide = !_hide)),
                  ),
                  validator: (v) => (v == null || v.isEmpty) ? 'Enter your password' : null,
                ),
              ]),
            ),
          ),
          Align(alignment: Alignment.centerRight, child: TextButton(onPressed: () => context.push('/forgot', extra: _email.text.trim()), child: const Text('Forgot password?'))),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600))),
          const SizedBox(height: 14),
          FilledButton(onPressed: _busy ? null : _submit, child: _busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.4)) : const Text('Log in')),
          const GoogleSignInButton(),
          const SizedBox(height: 16),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Text('New to ProjectMentor?', style: TextStyle(color: AppColors.soft)),
            TextButton(onPressed: () => context.go('/register'), child: const Text('Create an account')),
          ]),
          Center(child: TextButton.icon(onPressed: () => context.push('/contact'), icon: const Icon(Icons.support_agent_rounded, size: 18), label: const Text('Need help? Contact the admins'), style: TextButton.styleFrom(foregroundColor: AppColors.faint))),
        ],
      );
}

/// Same rules as the server.
bool emailOk(String v) => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]{2,}$').hasMatch(v.trim());
String? passwordProblem(String? v) {
  if (v == null || v.isEmpty) return 'Enter a password';
  if (v.length < 8) return 'Use at least 8 characters';
  if (v.length > 128) return 'Use 128 characters or fewer';
  if (!RegExp(r'[A-Za-z]').hasMatch(v) || !RegExp(r'\d').hasMatch(v)) return 'Include at least one letter and one number';
  return null;
}

/// Create account: email → 6-digit code emailed → account; or Google → choose a password → account.
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key, this.prefill});
  /// {email, name} when Log in with Google found no account.
  final Map? prefill;
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  final _code = TextEditingController();
  int? _year;
  bool _busy = false;
  bool _hide = true;
  String? _error;
  String _step = 'form'; // form | code | google
  String? _token; // verification token (email) or Google ID token
  String? _sentTo;

  @override
  void initState() {
    super.initState();
    _email.text = widget.prefill?['email'] as String? ?? '';
    _name.text = widget.prefill?['name'] as String? ?? '';
  }

  Future<void> _run(Future<void> Function() job) async {
    setState(() { _busy = true; _error = null; });
    try {
      await job();
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sendCode() async {
    if (_step == 'form' && !_form.currentState!.validate()) return;
    await _run(() async {
      final r = await api.registerStart(_name.text.trim(), _email.text.trim(), _password.text, _year);
      setState(() { _token = r['verificationToken'] as String; _sentTo = r['email'] as String?; _code.clear(); _step = 'code'; });
    });
  }

  Future<void> _verify() async {
    if (!RegExp(r'^\d{6}$').hasMatch(_code.text.trim())) { setState(() => _error = 'Enter the 6-digit code from the email'); return; }
    await _run(() => session.register(_name.text, _email.text, _password.text, _year, _code.text, _token!));
  }

  void _picked(String idToken, String email, String? name) => setState(() {
        _token = idToken;
        _email.text = email;
        if (_name.text.trim().isEmpty) _name.text = name ?? '';
        _password.clear(); _confirm.clear(); _error = null; _step = 'google';
      });

  Future<void> _finishGoogle() async {
    if (!_form.currentState!.validate()) return;
    await _run(() async => session.loginWithAuth(await api.googleRegister(_token!, _name.text.trim(), _password.text, _year)));
  }

  void _back() => setState(() { _step = 'form'; _token = null; _error = null; });

  Widget _spinner(String label) => _busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.4)) : Text(label);

  List<Widget> _passwords() => [
        TextFormField(
          controller: _password,
          obscureText: _hide,
          textInputAction: TextInputAction.next,
          decoration: InputDecoration(
            labelText: 'Password',
            helperText: 'At least 8 characters, with a letter and a number',
            prefixIcon: const Icon(Icons.lock_outline_rounded),
            suffixIcon: IconButton(icon: Icon(_hide ? Icons.visibility_outlined : Icons.visibility_off_outlined), onPressed: () => setState(() => _hide = !_hide)),
          ),
          validator: passwordProblem,
        ),
        const SizedBox(height: 14),
        TextFormField(
          controller: _confirm,
          obscureText: _hide,
          decoration: const InputDecoration(labelText: 'Confirm password', prefixIcon: Icon(Icons.lock_outline_rounded)),
          validator: (v) => (v == null || v.isEmpty) ? 'Confirm your password' : v != _password.text ? 'Passwords do not match' : null,
        ),
      ];

  List<Widget> _nameAndYear() => [
        TextFormField(
          controller: _name,
          textCapitalization: TextCapitalization.words,
          textInputAction: TextInputAction.next,
          decoration: const InputDecoration(labelText: 'Full name', prefixIcon: Icon(Icons.person_outline_rounded)),
          validator: (v) => (v == null || v.trim().length < 2) ? 'Enter your name' : null,
        ),
        const SizedBox(height: 14),
      ];

  Widget _yearChips() => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const SizedBox(height: 18),
        Text('Year of study (optional)', style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: 8),
        Wrap(spacing: 8, children: [
          for (final y in [1, 2, 3, 4])
            ChoiceChip(label: Text('Year $y'), selected: _year == y, onSelected: (s) => setState(() => _year = s ? y : null)),
        ]),
      ]);

  Widget? _errorText() => _error == null ? null : Padding(padding: const EdgeInsets.only(top: 14), child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)));

  @override
  Widget build(BuildContext context) {
    if (_step == 'code') {
      return _AuthFrame(
        title: 'Check your email',
        subtitle: 'We sent a 6-digit code to ${_sentTo ?? _email.text}. It expires in 15 minutes.',
        children: [
          TextField(
            controller: _code,
            keyboardType: TextInputType.number,
            maxLength: 6,
            autofocus: true,
            autofillHints: const [AutofillHints.oneTimeCode],
            onSubmitted: (_) => _verify(),
            decoration: const InputDecoration(labelText: '6-digit code', prefixIcon: Icon(Icons.pin_outlined), counterText: ''),
          ),
          if (_errorText() != null) _errorText()!,
          const SizedBox(height: 22),
          FilledButton(onPressed: _busy ? null : _verify, child: _spinner('Verify and create account')),
          const SizedBox(height: 10),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            TextButton(onPressed: _busy ? null : _sendCode, child: const Text('Send a new code')),
            TextButton(onPressed: _back, child: const Text('Change details')),
          ]),
        ],
      );
    }

    if (_step == 'google') {
      return _AuthFrame(
        title: 'Choose a password',
        subtitle: 'Your account will use ${_email.text}. Set a password so you can also log in with your email.',
        children: [
          Form(key: _form, child: Column(children: [..._nameAndYear(), ..._passwords()])),
          _yearChips(),
          if (_errorText() != null) _errorText()!,
          const SizedBox(height: 22),
          FilledButton(onPressed: _busy ? null : _finishGoogle, child: _spinner('Create account')),
          const SizedBox(height: 10),
          Center(child: TextButton(onPressed: _back, child: const Text('Use a different method'))),
        ],
      );
    }

    return _AuthFrame(
      title: 'Create your account',
      subtitle: 'Free for students. We’ll email you a code to confirm your address.',
      children: [
        if (widget.prefill != null)
          Container(
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: AppColors.mint, borderRadius: BorderRadius.circular(12)),
            child: const Text('There is no ProjectMentor account for that Google email yet. Create one below.', style: TextStyle(color: AppColors.accentDark, fontWeight: FontWeight.w600)),
          ),
        Form(
          key: _form,
          child: Column(children: [
            ..._nameAndYear(),
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.mail_outline_rounded)),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter your email address' : !emailOk(v) ? 'Enter a valid email address' : null,
            ),
            const SizedBox(height: 14),
            ..._passwords(),
          ]),
        ),
        _yearChips(),
        if (_errorText() != null) _errorText()!,
        const SizedBox(height: 22),
        FilledButton(onPressed: _busy ? null : _sendCode, child: _spinner('Continue')),
        GoogleSignInButton(onPick: _picked, label: 'Sign up with Google'),
        const SizedBox(height: 16),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          const Text('Already have an account?', style: TextStyle(color: AppColors.soft)),
          TextButton(onPressed: () => context.go('/login'), child: const Text('Log in')),
        ]),
      ],
    );
  }
}

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});
  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  late final _email = TextEditingController(text: GoRouterState.of(context).extra as String? ?? '');
  final _code = TextEditingController();
  final _password = TextEditingController();
  bool _sent = false;
  bool _busy = false;
  String? _message;
  String? _error;

  Future<void> _send() async {
    if (!_email.text.contains('@')) { setState(() => _error = 'Enter your email address.'); return; }
    setState(() { _busy = true; _error = null; });
    try { final m = await api.forgotPassword(_email.text.trim()); setState(() { _sent = true; _message = m; }); }
    catch (e) { setState(() => _error = errorText(e)); }
    finally { if (mounted) setState(() => _busy = false); }
  }

  Future<void> _reset() async {
    if (_code.text.trim().length != 6) { setState(() => _error = 'Enter the 6-digit code from the email.'); return; }
    final weak = passwordProblem(_password.text);
    if (weak != null) { setState(() => _error = weak); return; }
    setState(() { _busy = true; _error = null; });
    try { await session.loginWithAuth(await api.resetPassword(_email.text.trim(), _code.text.trim(), _password.text)); }
    catch (e) { setState(() => _error = errorText(e)); }
    finally { if (mounted) setState(() => _busy = false); }
  }

  @override
  Widget build(BuildContext context) => _AuthFrame(
        title: _sent ? 'Check your email' : 'Reset your password',
        subtitle: _sent ? (_message ?? 'We sent you a 6-digit code.') : 'Enter your email and we will send you a 6-digit code.',
        children: [
          TextField(controller: _email, enabled: !_sent, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.mail_outline_rounded))),
          if (_sent) ...[
            const SizedBox(height: 14),
            TextField(controller: _code, keyboardType: TextInputType.number, maxLength: 6, textAlign: TextAlign.center, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: 10), decoration: const InputDecoration(labelText: '6-digit code', counterText: '')),
            const SizedBox(height: 14),
            TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'New password', helperText: 'At least 8 characters, with a letter and a number', prefixIcon: Icon(Icons.lock_outline_rounded))),
          ],
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 14), child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600))),
          const SizedBox(height: 22),
          FilledButton(onPressed: _busy ? null : (_sent ? _reset : _send), child: Text(_busy ? 'Please wait…' : _sent ? 'Save new password' : 'Send code')),
          if (_sent) TextButton(onPressed: _busy ? null : _send, child: const Text('Send a new code')),
          TextButton(onPressed: () => context.go('/login'), child: const Text('Back to log in')),
        ],
      );
}

/// "Contact the admins": also shown when a deactivated student tries to log in, with their details filled in.
class ContactAdminScreen extends StatefulWidget {
  const ContactAdminScreen({super.key, this.prefill});
  final Map? prefill;
  @override
  State<ContactAdminScreen> createState() => _ContactAdminScreenState();
}

class _ContactAdminScreenState extends State<ContactAdminScreen> {
  late final bool _deactivated = widget.prefill?['deactivated'] == true;
  late final _name = TextEditingController(text: widget.prefill?['name'] ?? session.user?.fullName ?? '');
  late final _email = TextEditingController(text: widget.prefill?['email'] ?? session.user?.email ?? '');
  late final _subject = TextEditingController(text: _deactivated ? 'Please review my deactivated account' : '');
  late final _message = TextEditingController(text: _deactivated
      ? 'Hello ProjectMentor team,\n\nMy account (${widget.prefill?['email'] ?? ''}) was deactivated${widget.prefill?['reason'] != null ? ' with the reason: "${widget.prefill?['reason']}"' : ''}. '
        'I tried to sign in on ${DateTime.now().toString().substring(0, 16)}.\n\nCould you please review my account and let me know what I need to do to use it again?\n\nThank you,\n${widget.prefill?['name'] ?? ''}'
      : '');
  bool _busy = false;
  String? _sent;
  String? _error;

  Future<void> _send() async {
    setState(() { _busy = true; _error = null; });
    try { final m = await api.contactAdmin({'name': _name.text.trim(), 'email': _email.text.trim(), 'subject': _subject.text.trim(), 'message': _message.text.trim()}); setState(() => _sent = m); }
    catch (e) { setState(() => _error = errorText(e)); }
    finally { if (mounted) setState(() => _busy = false); }
  }

  @override
  Widget build(BuildContext context) => _AuthFrame(
        title: _deactivated ? 'Your account is deactivated' : 'Contact the admins',
        subtitle: _deactivated
            ? 'Contact the ProjectMentor admins and they will review your account.${widget.prefill?['reason'] != null ? '\nReason given: ${widget.prefill?['reason']}' : ''}'
            : 'Your message goes straight to the ProjectMentor admins. They reply by email.',
        children: _sent != null
            ? [
                Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: AppColors.mint, borderRadius: BorderRadius.circular(14)), child: Text(_sent!, style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.accentDark))),
                const SizedBox(height: 16),
                FilledButton(onPressed: () => context.go('/login'), child: const Text('Back to log in')),
              ]
            : [
                TextField(controller: _name, decoration: const InputDecoration(labelText: 'Your name')),
                const SizedBox(height: 12),
                TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Account email')),
                const SizedBox(height: 12),
                TextField(controller: _subject, decoration: const InputDecoration(labelText: 'Subject')),
                const SizedBox(height: 12),
                TextField(controller: _message, minLines: 6, maxLines: 12, decoration: const InputDecoration(labelText: 'Message', alignLabelWithHint: true)),
                if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600))),
                const SizedBox(height: 18),
                FilledButton(onPressed: _busy ? null : _send, child: Text(_busy ? 'Sending…' : 'Send to the admins')),
                TextButton(onPressed: () => context.canPop() ? context.pop() : context.go('/login'), child: const Text('Back')),
              ],
      );
}

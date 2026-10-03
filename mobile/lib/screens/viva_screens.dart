import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:go_router/go_router.dart';
import 'package:speech_to_text/speech_to_text.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import '../core/examiner.dart';

Color _tone(num score) => score >= 8 ? AppColors.success : score >= 5 ? AppColors.warn : AppColors.danger;

/* ======================= home ======================= */

class VivaHomeScreen extends StatefulWidget {
  const VivaHomeScreen({super.key});
  @override
  State<VivaHomeScreen> createState() => _VivaHomeScreenState();
}

class _VivaHomeScreenState extends State<VivaHomeScreen> {
  List? _items;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try { final r = await api.vivas(); if (mounted) setState(() { _items = r; _error = null; }); }
    catch (e) { if (mounted) setState(() => _error = errorText(e)); }
  }

  Future<void> _delete(Map v) async {
    if (!await confirm(context, title: 'Delete this practice viva?', message: 'Its marks and answers will be removed.', ok: 'Delete', danger: true)) return;
    try { await api.deleteViva(v['id']); _load(); } catch (e) { if (mounted) showSnack(context, errorText(e)); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Mock viva')),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () => context.push('/viva/new').then((_) => _load()),
          backgroundColor: AppColors.ink, foregroundColor: Colors.white,
          icon: const Icon(Icons.mic_none_rounded), label: const Text('Start a viva', style: TextStyle(fontWeight: FontWeight.w700)),
        ),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ListView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 100), children: [
            ClipRRect(borderRadius: BorderRadius.circular(18), child: Stack(children: [
              Image.asset('assets/images/viva.webp', height: 170, width: double.infinity, fit: BoxFit.cover),
              Positioned.fill(child: Container(color: AppColors.ink.withValues(alpha: 0.62))),
              const Positioned(left: 18, right: 18, bottom: 16, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Practise before it counts', style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -0.5)),
                SizedBox(height: 4),
                Text('An AI examiner asks about your own project and marks every answer.', style: TextStyle(color: Color(0xFFD6E1EA))),
              ])),
            ])),
            const SizedBox(height: 16),
            for (final (n, t, d) in [('1', 'Tell us about your project', 'A guided form, or fill it from your roadmap.'), ('2', 'Answer out loud', 'Questions are read to you. Speak or type your answer.'), ('3', 'Get live marks', 'A score, feedback and a model answer every time.')])
              Padding(padding: const EdgeInsets.only(bottom: 8), child: Row(children: [
                CircleAvatar(radius: 14, backgroundColor: AppColors.mint, child: Text(n, style: const TextStyle(color: AppColors.accent, fontWeight: FontWeight.w800, fontSize: 13))),
                const SizedBox(width: 12),
                Expanded(child: Text.rich(TextSpan(children: [TextSpan(text: '$t. ', style: const TextStyle(fontWeight: FontWeight.w700)), TextSpan(text: d, style: const TextStyle(color: AppColors.soft))]))),
              ])),
            const SectionTitle('Your practice vivas'),
            if (_error != null && _items == null) ErrorView(message: _error!, onRetry: _load)
            else if (_items == null) const LoadingView()
            else if (_items!.isEmpty) const Text('No practice yet. Your first mock viva takes about 10 minutes.', style: TextStyle(color: AppColors.soft))
            else
              for (final v in _items!.cast<Map>())
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: AppCard(
                    onTap: () => context.push('/viva/${v['id']}').then((_) => _load()),
                    child: Row(children: [
                      v['status'] == 'Completed'
                          ? ProgressRing(percent: (v['scorePercent'] as num? ?? 0).toDouble(), size: 52, stroke: 5)
                          : Container(width: 52, height: 52, alignment: Alignment.center, decoration: const BoxDecoration(color: Color(0xFFFBEBC7), shape: BoxShape.circle), child: const Text('Live', style: TextStyle(color: AppColors.warn, fontWeight: FontWeight.w800, fontSize: 12))),
                      const SizedBox(width: 14),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(v['title'], maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                        Text('${v['stage']} · ${v['difficulty']} · ${mediumDate(parseDate(v['createdAt']))}', style: const TextStyle(color: AppColors.soft, fontSize: 13)),
                        Text(v['status'] == 'Completed' ? '${v['answered']} questions answered' : 'Continue — ${v['answered']} of ${v['total']} answered', style: TextStyle(color: v['status'] == 'Completed' ? AppColors.faint : AppColors.accent, fontSize: 12.5, fontWeight: FontWeight.w600)),
                      ])),
                      IconButton(onPressed: () => _delete(v), icon: const Icon(Icons.delete_outline_rounded, color: AppColors.faint)),
                    ]),
                  ),
                ),
          ]),
        ),
      );
}

/* ======================= setup ======================= */

class VivaSetupScreen extends StatefulWidget {
  const VivaSetupScreen({super.key, this.roadmapId});
  final String? roadmapId;
  @override
  State<VivaSetupScreen> createState() => _VivaSetupScreenState();
}

class _VivaSetupScreenState extends State<VivaSetupScreen> {
  static const _steps = [
    ('The basics', [('title', 'Project title', true, false), ('projectType', 'Type of project', false, false), ('teamSize', 'Team size', false, false), ('yourRole', 'Your own part in the project', false, true)]),
    ('Problem and users', [('problem', 'What problem does it solve?', true, true), ('targetUsers', 'Who are the users?', false, false), ('objectives', 'Main objectives', false, true)]),
    ('What you built', [('features', 'Key features', true, true), ('frontend', 'Frontend', false, false), ('backend', 'Backend', false, false), ('database', 'Database', false, false), ('otherTech', 'AI, APIs and other tools', false, false), ('architecture', 'How the parts fit together', false, true)]),
    ('Data, security and testing', [('security', 'Security', false, true), ('testing', 'Testing', false, true), ('deployment', 'Deployment', false, false)]),
    ('Your journey', [('progress', 'How far have you got?', false, true), ('challenges', 'Biggest challenges', false, true), ('limitations', 'Known limitations', false, true), ('futureWork', 'Future work', false, true), ('notes', 'Anything else?', false, true)]),
  ];
  final Map<String, TextEditingController> _c = {};
  int _step = 0;
  String _stage = 'Final', _difficulty = 'Standard';
  int _count = 6;
  String? _roadmapId;
  bool _busy = false;
  List? _roadmaps;
  // Examiners published by admins; the student picks one, can hear its voice and sets their accent.
  List<Map> _characters = [];
  String? _characterId;
  String _accent = 'en-US';
  final FlutterTts _previewTts = FlutterTts();
  bool _previewing = false;
  bool? _previewVoice;

  Map? get _chosen => _characters.where((c) => c['id'] == _characterId).firstOrNull ?? _characters.firstOrNull;

  Future<void> _loadCharacters() async {
    _accent = await savedAccent();
    try {
      final list = (await api.vivaCharacters()).cast<Map>();
      if (mounted) setState(() { _characters = list; _characterId ??= list.firstOrNull?['id']; });
      _checkVoice();
    } catch (_) {}
  }

  Future<void> _checkVoice() async {
    final ok = await applyExaminerVoice(_previewTts, _chosen);
    if (mounted) setState(() => _previewVoice = ok);
  }

  Future<void> _testVoice() async {
    if (_previewing) { await _previewTts.stop(); setState(() => _previewing = false); return; }
    final ok = await applyExaminerVoice(_previewTts, _chosen);
    if (!ok) { if (mounted) showSnack(context, 'This phone has no ${examinerLanguages[_chosen?['language']]} voice. Questions will be shown as text.'); return; }
    setState(() => _previewing = true);
    await _previewTts.awaitSpeakCompletion(true);
    await _previewTts.speak(sampleLine(_chosen));
    if (mounted) setState(() => _previewing = false);
  }

  @override
  void dispose() {
    _previewTts.stop();
    super.dispose();
  }

  TextEditingController _ctl(String k) => _c.putIfAbsent(k, TextEditingController.new);

  @override
  void initState() {
    super.initState();
    _loadCharacters();
    // Only approved roadmaps can fill the viva form.
    api.roadmaps().then((r) { if (mounted) setState(() => _roadmaps = r.where((x) => x['roadmapStatus'] == 'Accepted').toList()); }).catchError((_) {});
    if (widget.roadmapId != null) _fill(widget.roadmapId!);
  }

  Future<void> _fill(String id) async {
    try {
      final d = await api.vivaPrefill(id);
      // Fill every field from the approved roadmap; the student can still edit anything before starting.
      d.forEach((k, v) { if (v != null && '$v'.isNotEmpty) _ctl(k).text = '$v'; });
      setState(() => _roadmapId = id);
      if (mounted) showSnack(context, 'Filled from your roadmap. Check each step and add what is missing.');
    } catch (e) { if (mounted) showSnack(context, errorText(e)); }
  }

  int get _filled => _steps.expand((s) => s.$2).where((f) => _ctl(f.$1).text.trim().isNotEmpty).length;
  int get _total => _steps.expand((s) => s.$2).length;

  bool _validStep() {
    if (_step >= _steps.length) return true;
    final missing = _steps[_step].$2.where((f) => f.$3 && _ctl(f.$1).text.trim().isEmpty).map((f) => f.$2).toList();
    if (missing.isNotEmpty) showSnack(context, 'Please fill in: ${missing.join(', ')}');
    return missing.isEmpty;
  }

  Future<void> _start() async {
    setState(() => _busy = true);
    final details = <String, dynamic>{for (final f in _steps.expand((s) => s.$2)) f.$1: _ctl(f.$1).text.trim().isEmpty ? null : _ctl(f.$1).text.trim()};
    details['teamSize'] = int.tryParse(details['teamSize'] ?? '');
    try {
      final s = await api.startViva({'details': details, 'roadmapRequestId': _roadmapId, 'stage': _stage, 'difficulty': _difficulty, 'questionCount': _count, 'characterId': _chosen?['id']});
      if (mounted) context.pushReplacement('/viva/${s['id']}');
    } catch (e) {
      if (mounted) { showSnack(context, errorText(e)); setState(() => _busy = false); }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_busy) {
      return const Scaffold(body: Center(child: Padding(padding: EdgeInsets.all(32), child: Column(mainAxisSize: MainAxisSize.min, children: [
        CircularProgressIndicator(),
        SizedBox(height: 20),
        Text('The examiner is reading your project…', textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        SizedBox(height: 6),
        Text('Preparing questions about your project. This takes a few seconds.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.soft)),
      ]))));
    }
    final last = _step == _steps.length;
    final pct = _filled / _total;
    return Scaffold(
      appBar: AppBar(title: const Text('Set up your viva')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Text(last ? 'Viva settings' : 'Step ${_step + 1} of ${_steps.length + 1} · ${_steps[_step].$1}', style: const TextStyle(fontWeight: FontWeight.w700)),
              const Spacer(),
              Text('Detail ${(pct * 100).round()}%', style: const TextStyle(color: AppColors.accent, fontWeight: FontWeight.w700, fontSize: 13)),
            ]),
            const SizedBox(height: 8),
            ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: (_step + 1) / (_steps.length + 1), minHeight: 5)),
          ]),
        ),
        Expanded(
          child: ListView(padding: const EdgeInsets.fromLTRB(20, 12, 20, 24), children: [
            if (_step == 0 && (_roadmaps?.isNotEmpty ?? false))
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: DropdownButtonFormField<String>(
                  value: _roadmapId,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Quick fill from a roadmap', prefixIcon: Icon(Icons.bolt_rounded)),
                  items: [for (final r in _roadmaps!) DropdownMenuItem(value: r['id'] as String, child: Text(r['displayTitle'], overflow: TextOverflow.ellipsis))],
                  onChanged: (v) { if (v != null) _fill(v); },
                ),
              ),
            if (!last)
              for (final (key, label, required, multi) in _steps[_step].$2)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: TextField(
                    controller: _ctl(key),
                    minLines: multi ? 2 : 1,
                    maxLines: multi ? 5 : 1,
                    keyboardType: key == 'teamSize' ? TextInputType.number : TextInputType.text,
                    textCapitalization: TextCapitalization.sentences,
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(labelText: required ? '$label *' : label),
                  ),
                )
            else ...[
              const Text('Choose your examiner', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              SizedBox(
                height: 176,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: _characters.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 10),
                  itemBuilder: (_, i) {
                    final c = _characters[i];
                    final on = _chosen?['id'] == c['id'];
                    return AppCard(
                      onTap: () { _previewTts.stop(); setState(() { _characterId = c['id']; _previewing = false; }); _checkVoice(); },
                      padding: const EdgeInsets.all(10),
                      color: on ? const Color(0xFFEAF4F2) : Colors.white,
                      borderColor: on ? AppColors.accent : AppColors.line,
                      child: SizedBox(width: 118, child: Column(children: [
                        ExaminerPortrait(look: c, size: 84),
                        const SizedBox(height: 6),
                        Text(c['name'], maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                        Text(c['tagline'] ?? '${c['style']} examiner', maxLines: 2, textAlign: TextAlign.center, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.soft, fontSize: 11.5)),
                        Text(examinerLanguages[c['language']] ?? c['language'], style: const TextStyle(color: AppColors.accent, fontSize: 11, fontWeight: FontWeight.w700)),
                      ])),
                    );
                  },
                ),
              ),
              const SizedBox(height: 10),
              Row(children: [
                OutlinedButton.icon(onPressed: _chosen == null ? null : _testVoice, icon: Icon(_previewing ? Icons.stop_rounded : Icons.volume_up_rounded, size: 18), label: Text(_previewing ? 'Stop' : 'Test voice')),
                const SizedBox(width: 10),
                Expanded(child: DropdownButtonFormField<String>(
                  value: _accent,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Your accent (microphone)', isDense: true),
                  items: [for (final e in studentAccents.entries) DropdownMenuItem(value: e.key, child: Text(e.value, overflow: TextOverflow.ellipsis))],
                  onChanged: (v) { if (v != null) { setState(() => _accent = v); saveAccent(v); } },
                )),
              ]),
              if (_previewVoice == false)
                Padding(padding: const EdgeInsets.only(top: 6), child: Text('This phone has no ${examinerLanguages[_chosen?['language']]} voice, so the examiner\'s words will be shown as text. You can add the voice in your phone\'s text-to-speech settings.', style: const TextStyle(color: AppColors.soft, fontSize: 12.5))),
              const SizedBox(height: 18),
              const Text('Which viva is it?', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Wrap(spacing: 8, children: [for (final s in ['Proposal', 'Progress', 'Final']) ChoiceChip(label: Text('$s viva'), selected: _stage == s, onSelected: (_) => setState(() => _stage = s))]),
              const SizedBox(height: 18),
              const Text('How tough should the examiner be?', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              for (final (v, d) in [('Friendly', 'Warm and patient. Perfect for a first try.'), ('Standard', 'Like a normal viva. Polite and fair.'), ('Strict', 'Probing questions and follow-ups.')])
                Padding(padding: const EdgeInsets.only(bottom: 8), child: AppCard(
                  onTap: () => setState(() => _difficulty = v),
                  padding: const EdgeInsets.all(14),
                  color: _difficulty == v ? const Color(0xFFEAF4F2) : Colors.white,
                  borderColor: _difficulty == v ? AppColors.accent : AppColors.line,
                  child: Row(children: [
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(v, style: const TextStyle(fontWeight: FontWeight.w700)), Text(d, style: const TextStyle(color: AppColors.soft, fontSize: 13))])),
                    Icon(_difficulty == v ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded, color: _difficulty == v ? AppColors.accent : AppColors.faint),
                  ]),
                )),
              const SizedBox(height: 10),
              const Text('How many questions?', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Wrap(spacing: 8, children: [for (final n in [4, 6, 8, 10]) ChoiceChip(label: Text('$n (~${(n * 1.7).round()} min)'), selected: _count == n, onSelected: (_) => setState(() => _count = n))]),
              const SizedBox(height: 18),
              AppCard(color: AppColors.bg2, child: const Text('Find a quiet place and allow the microphone when asked. You can always type instead.', style: TextStyle(color: AppColors.soft))),
            ],
          ]),
        ),
        SafeArea(top: false, child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: Row(children: [
            if (_step > 0) Expanded(child: OutlinedButton(onPressed: () => setState(() => _step--), child: const Text('Back'))),
            if (_step > 0) const SizedBox(width: 12),
            Expanded(flex: 2, child: FilledButton(
              onPressed: () { if (!_validStep()) return; last ? _start() : setState(() => _step++); },
              child: Text(last ? 'Start my viva' : 'Next'),
            )),
          ]),
        )),
      ]),
    );
  }
}

/* ======================= room + report ======================= */

class VivaRoomScreen extends StatefulWidget {
  const VivaRoomScreen({super.key, required this.id});
  final String id;
  @override
  State<VivaRoomScreen> createState() => _VivaRoomScreenState();
}

class _VivaRoomScreenState extends State<VivaRoomScreen> {
  Map<String, dynamic>? _s;
  String? _error;
  final _answer = TextEditingController();
  final FlutterTts _tts = FlutterTts();
  final SpeechToText _stt = SpeechToText();
  bool _sttReady = false, _listening = false, _voiceOn = true, _speaking = false, _marking = false, _finishing = false, _started = false;
  String? _resultId;
  int _seconds = 0;
  Timer? _timer;
  String _baseText = '';

  @override
  void initState() {
    super.initState();
    _load();
    _initVoice();
  }

  bool _hasVoice = true;
  String _accent = 'en-US';

  Future<void> _initVoice() async {
    _accent = await savedAccent();
    try {
      _tts.setStartHandler(() { if (mounted) setState(() => _speaking = true); });
      _tts.setCompletionHandler(() { if (mounted) setState(() => _speaking = false); });
      _tts.setCancelHandler(() { if (mounted) setState(() => _speaking = false); });
      await _tts.awaitSpeakCompletion(true);
    } catch (_) {}
    try {
      _sttReady = await _stt.initialize(onStatus: (s) { if (s == 'notListening' || s == 'done') { if (mounted) setState(() => _listening = false); } });
    } catch (_) { _sttReady = false; }
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _timer?.cancel();
    _tts.stop();
    _stt.stop();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final s = await api.viva(widget.id);
      // Speak with the examiner character the student chose (language, gender, speed, pitch set by admins).
      final ok = await applyExaminerVoice(_tts, s['character'] as Map?);
      if (mounted) setState(() { _s = s; _error = null; _hasVoice = ok; });
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  List<Map> get _qs => ((_s?['questions'] as List?) ?? []).cast<Map>()..sort((a, b) => (a['sequence'] as int).compareTo(b['sequence'] as int));
  Map? get _current => _qs.where((q) => q['answered'] != true).firstOrNull;
  Map? get _result => _resultId == null ? null : _qs.where((q) => q['id'] == _resultId).firstOrNull;

  Future<void> _say(String text) async {
    if (!_voiceOn || !_hasVoice) return;
    try { await _tts.stop(); await _tts.speak(text); } catch (_) {}
  }

  void _startTimer() {
    _timer?.cancel();
    _seconds = 0;
    _timer = Timer.periodic(const Duration(seconds: 1), (_) { if (mounted) setState(() => _seconds++); });
  }

  Future<void> _ask() async {
    final q = _current;
    if (q == null) return;
    setState(() { _resultId = null; _answer.clear(); });
    _startTimer();
    await _say((q['isFollowUp'] == true ? 'A quick follow-up. ' : '') + (q['text'] as String));
  }

  Future<void> _begin() async {
    setState(() => _started = true);
    await _say(_s?['greeting'] ?? 'Welcome to your mock viva. Let us begin.');
    await _ask();
  }

  Future<void> _toggleMic() async {
    if (!_sttReady) { showSnack(context, 'Voice input is not available here. Please type your answer.'); return; }
    if (_listening) { await _stt.stop(); setState(() => _listening = false); return; }
    await _tts.stop();
    _baseText = _answer.text.trim();
    setState(() => _listening = true);
    await _stt.listen(
      listenOptions: SpeechListenOptions(localeId: _accent.replaceAll('-', '_'), partialResults: true, listenMode: ListenMode.dictation, cancelOnError: true, pauseFor: const Duration(seconds: 6), listenFor: const Duration(minutes: 3)),
      onResult: (r) => setState(() => _answer.text = [_baseText, r.recognizedWords].where((s) => s.isNotEmpty).join(' ')),
    );
  }

  Future<void> _submit({bool skip = false}) async {
    final q = _current;
    if (q == null) return;
    final text = skip ? '' : _answer.text.trim();
    if (!skip && text.isEmpty) { showSnack(context, 'Say or type an answer first — or skip the question.'); return; }
    await _stt.stop();
    await _tts.stop();
    _timer?.cancel();
    setState(() { _marking = true; _listening = false; });
    try {
      final s = await api.answerViva(widget.id, q['id'], text, _seconds);
      if (!mounted) return;
      setState(() { _s = s; _resultId = q['id']; _marking = false; });
      final r = _result;
      if (r?['feedback'] != null) _say(r!['feedback']);
    } catch (e) {
      if (mounted) { showSnack(context, errorText(e)); setState(() => _marking = false); _startTimer(); }
    }
  }

  Future<void> _finish() async {
    await _tts.stop();
    setState(() => _finishing = true);
    try {
      final s = await api.finishViva(widget.id);
      if (mounted) setState(() { _s = s; _finishing = false; });
    } catch (e) {
      if (mounted) { showSnack(context, errorText(e)); setState(() => _finishing = false); }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = _s;
    if (s == null) return Scaffold(appBar: AppBar(), body: Padding(padding: const EdgeInsets.all(20), child: _error != null ? ErrorView(message: _error!, onRetry: _load) : const LoadingView()));
    if (s['status'] == 'Completed') return _Report(s: s, onListen: _say);

    final qs = _qs;
    final answered = qs.where((q) => q['answered'] == true).toList();
    final points = answered.fold<num>(0, (a, q) => a + (q['score'] as num? ?? 0));
    final current = _current;
    final result = _result;

    return Scaffold(
      appBar: AppBar(
        title: Text(s['title'], maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(tooltip: _voiceOn ? 'Mute examiner' : 'Unmute examiner', onPressed: () { setState(() => _voiceOn = !_voiceOn); if (!_voiceOn) _tts.stop(); }, icon: Icon(_voiceOn ? Icons.volume_up_outlined : Icons.volume_off_outlined)),
        ],
      ),
      body: _finishing
          ? const LoadingView(label: 'The examiner is writing your report…')
          : ListView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 32), children: [
              Row(children: [
                Expanded(child: Wrap(spacing: 5, runSpacing: 5, children: [
                  for (final q in qs) Container(
                    width: q['isFollowUp'] == true ? 9 : 13, height: q['isFollowUp'] == true ? 9 : 13,
                    decoration: BoxDecoration(shape: BoxShape.circle, color: q['answered'] == true ? _tone(q['score'] ?? 0) : Colors.white, border: Border.all(color: current?['id'] == q['id'] ? AppColors.accent : AppColors.line, width: 2)),
                  ),
                ])),
                Text(answered.isEmpty ? 'Score —' : 'Score $points/${answered.length * 10}', style: const TextStyle(fontWeight: FontWeight.w800)),
              ]),
              const SizedBox(height: 16),
              if (!_started && answered.isEmpty) ...[
                AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Before we start', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                  const SizedBox(height: 10),
                  for (final t in [
                    'Turn your sound on — each question is read to you.',
                    _sttReady ? 'Tap the microphone and answer out loud. You can edit the text before sending.' : 'Type your answers below.',
                    'Aim for about ${s['difficulty'] == 'Strict' ? '45–60' : '60–90'} seconds per answer. Use your project’s real names.',
                    'After each answer you get a score, feedback and a model answer.',
                  ]) Padding(padding: const EdgeInsets.only(bottom: 8), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [const Icon(Icons.check_circle_outline_rounded, size: 18, color: AppColors.accent), const SizedBox(width: 8), Expanded(child: Text(t, style: const TextStyle(color: AppColors.soft)))])),
                  if (s['greeting'] != null) ...[const SizedBox(height: 6), Text('“${s['greeting']}”', style: const TextStyle(fontStyle: FontStyle.italic, color: AppColors.ink))],
                  const SizedBox(height: 14),
                  SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: _begin, icon: const Icon(Icons.play_arrow_rounded), label: const Text('Begin the viva'))),
                ])),
              ] else if (result != null) ...[
                _ResultCard(q: result, onListen: () => _say(result['modelAnswer'] ?? '')),
                const SizedBox(height: 14),
                current != null
                    ? FilledButton(onPressed: _ask, child: Text(current['isFollowUp'] == true ? 'Answer the follow-up' : 'Next question'))
                    : FilledButton(onPressed: _finish, style: FilledButton.styleFrom(backgroundColor: AppColors.accent), child: const Text('Finish and see my report')),
                if (current != null) TextButton(onPressed: _finish, child: const Text('End the viva now')),
              ] else if (current != null) ...[
                // The examiner character, talking while the question is read out.
                Row(children: [
                  ExaminerPortrait(look: s['character'] as Map?, size: 64, talking: _speaking),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text((s['character'] as Map?)?['name'] ?? 'Dr. Mentor', style: const TextStyle(fontWeight: FontWeight.w800)),
                    Text(_speaking ? 'Speaking…' : _hasVoice ? 'Listening for your answer' : 'Reading mode — no voice for this language on this phone', style: const TextStyle(color: AppColors.soft, fontSize: 12.5)),
                  ])),
                ]),
                const SizedBox(height: 12),
                Text(current['isFollowUp'] == true ? 'FOLLOW-UP' : 'QUESTION ${qs.where((q) => q['isFollowUp'] != true && (q['sequence'] as int) <= (current['sequence'] as int)).length} OF ${qs.where((q) => q['isFollowUp'] != true).length}',
                    style: const TextStyle(color: AppColors.accent, fontWeight: FontWeight.w800, fontSize: 12, letterSpacing: 1.2)),
                const SizedBox(height: 4),
                Align(alignment: Alignment.centerLeft, child: Chip(label: Text(current['topic']))),
                const SizedBox(height: 6),
                Text(current['text'], style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, height: 1.35, letterSpacing: -0.3)),
                TextButton.icon(onPressed: _speaking ? null : () => _say(current['text']), icon: const Icon(Icons.replay_rounded, size: 18), label: const Text('Repeat question')),
                const SizedBox(height: 10),
                Center(child: GestureDetector(
                  onTap: _marking ? null : _toggleMic,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    width: 84, height: 84,
                    decoration: BoxDecoration(
                      color: _listening ? AppColors.danger : (_sttReady ? AppColors.accent : AppColors.line),
                      shape: BoxShape.circle,
                      boxShadow: _listening ? [BoxShadow(color: AppColors.danger.withValues(alpha: 0.35), blurRadius: 24, spreadRadius: 6)] : const [],
                    ),
                    child: Icon(_listening ? Icons.stop_rounded : Icons.mic_rounded, color: Colors.white, size: 38),
                  ),
                )),
                const SizedBox(height: 8),
                Center(child: Text(_listening ? 'Listening… tap to stop' : (_sttReady ? 'Tap to answer out loud' : 'Type your answer below'), style: const TextStyle(color: AppColors.soft, fontWeight: FontWeight.w600))),
                const SizedBox(height: 4),
                Center(child: Text('${_seconds ~/ 60}:${(_seconds % 60).toString().padLeft(2, '0')}', style: TextStyle(fontWeight: FontWeight.w800, color: _seconds > 90 ? AppColors.warn : AppColors.faint, fontFeatures: const [])),),
                const SizedBox(height: 12),
                TextField(controller: _answer, minLines: 5, maxLines: 10, textCapitalization: TextCapitalization.sentences, enabled: !_marking, decoration: const InputDecoration(hintText: 'Your answer appears here. You can edit it before sending.')),
                const SizedBox(height: 14),
                Row(children: [
                  TextButton(onPressed: _marking ? null : () => _submit(skip: true), child: const Text('Skip', style: TextStyle(color: AppColors.soft))),
                  const Spacer(),
                  FilledButton(onPressed: _marking ? null : _submit, style: FilledButton.styleFrom(minimumSize: const Size(170, 52)), child: Text(_marking ? 'Marking…' : 'Submit answer')),
                ]),
              ] else ...[
                const Text('All questions answered.', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
                const SizedBox(height: 12),
                FilledButton(onPressed: _finish, child: const Text('Finish and see my report')),
              ],
            ]),
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({required this.q, required this.onListen});
  final Map q;
  final VoidCallback onListen;
  @override
  Widget build(BuildContext context) {
    final score = q['score'] as num? ?? 0;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      AppCard(child: Row(children: [
        ProgressRing(percent: score * 10.0, size: 84, stroke: 8, label: '$score/10', color: _tone(score)),
        const SizedBox(width: 16),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text((q['verdict'] ?? '').toString().toUpperCase(), style: TextStyle(color: _tone(score), fontWeight: FontWeight.w800, letterSpacing: 1)),
          const SizedBox(height: 4),
          Text('“${q['feedback'] ?? ''}”', style: const TextStyle(fontSize: 15, height: 1.45, fontWeight: FontWeight.w600)),
        ])),
      ])),
      if ((q['strengths'] as List?)?.isNotEmpty ?? false) ...[const SizedBox(height: 10), _ListBox(title: 'What you did well', items: (q['strengths'] as List).cast<String>(), color: AppColors.success)],
      if ((q['improvements'] as List?)?.isNotEmpty ?? false) ...[const SizedBox(height: 10), _ListBox(title: 'To score higher', items: (q['improvements'] as List).cast<String>(), color: AppColors.warn)],
      const SizedBox(height: 10),
      AppCard(
        color: const Color(0xFFFBF3E2),
        borderColor: AppColors.gold.withValues(alpha: 0.5),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Text('High-scoring answer', style: TextStyle(fontWeight: FontWeight.w800)),
            const Spacer(),
            TextButton.icon(onPressed: onListen, icon: const Icon(Icons.volume_up_outlined, size: 18), label: const Text('Listen')),
          ]),
          Text(q['modelAnswer'] ?? '', style: const TextStyle(height: 1.55)),
        ]),
      ),
    ]);
  }
}

class _ListBox extends StatelessWidget {
  const _ListBox({required this.title, required this.items, required this.color});
  final String title;
  final List<String> items;
  final Color color;
  @override
  Widget build(BuildContext context) => AppCard(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: TextStyle(fontWeight: FontWeight.w800, color: color)),
          const SizedBox(height: 6),
          for (final i in items) Padding(padding: const EdgeInsets.only(bottom: 4), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(padding: const EdgeInsets.only(top: 7), child: Container(width: 5, height: 5, decoration: BoxDecoration(color: color, shape: BoxShape.circle))),
            const SizedBox(width: 8),
            Expanded(child: Text(i, style: const TextStyle(color: AppColors.soft, height: 1.45))),
          ])),
        ]),
      );
}

class _Report extends StatelessWidget {
  const _Report({required this.s, required this.onListen});
  final Map<String, dynamic> s;
  final Future<void> Function(String) onListen;
  @override
  Widget build(BuildContext context) {
    final summary = s['summary'] as Map?;
    final qs = (s['questions'] as List).cast<Map>()..sort((a, b) => (a['sequence'] as int).compareTo(b['sequence'] as int));
    final pct = (s['scorePercent'] as num? ?? 0).toDouble();
    return Scaffold(
      appBar: AppBar(title: const Text('Viva report')),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 32), children: [
        AppCard(
          color: AppColors.ink,
          borderColor: AppColors.ink,
          padding: const EdgeInsets.all(20),
          child: Row(children: [
            ProgressRing(percent: pct, size: 96, stroke: 9, color: AppColors.sun, track: Colors.white24, textColor: Colors.white),
            const SizedBox(width: 18),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Grade ${summary?['grade'] ?? '—'}', style: const TextStyle(color: AppColors.sun, fontWeight: FontWeight.w800, fontSize: 18)),
              const SizedBox(height: 4),
              Text(s['title'], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 16)),
              Text('${s['stage']} viva · ${s['difficulty']}', style: const TextStyle(color: Color(0xFFB9C7D6), fontSize: 13)),
            ])),
          ]),
        ),
        if (summary?['overall'] != null) ...[const SizedBox(height: 14), Text(summary!['overall'], style: const TextStyle(height: 1.55, fontSize: 15.5))],
        if ((summary?['strengths'] as List?)?.isNotEmpty ?? false) ...[const SizedBox(height: 14), _ListBox(title: 'Your strengths', items: (summary!['strengths'] as List).cast<String>(), color: AppColors.success)],
        if ((summary?['weakAreas'] as List?)?.isNotEmpty ?? false) ...[const SizedBox(height: 10), _ListBox(title: 'Practise these', items: [for (final w in summary!['weakAreas'] as List) '${w['topic']}: ${w['tip']}'], color: AppColors.warn)],
        if ((summary?['nextSteps'] as List?)?.isNotEmpty ?? false) ...[const SizedBox(height: 10), _ListBox(title: 'Next steps', items: (summary!['nextSteps'] as List).cast<String>(), color: AppColors.accent)],
        const SectionTitle('Question by question'),
        for (final (i, q) in qs.indexed)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: AppCard(
              padding: EdgeInsets.zero,
              child: Theme(
                data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
                child: ExpansionTile(
                  initiallyExpanded: (q['score'] as num? ?? 0) < 7,
                  leading: CircleAvatar(backgroundColor: _tone(q['score'] ?? 0).withValues(alpha: 0.14), child: Text('${q['score'] ?? 0}', style: TextStyle(color: _tone(q['score'] ?? 0), fontWeight: FontWeight.w800))),
                  title: Text(q['text'], style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5)),
                  subtitle: Text('${q['isFollowUp'] == true ? 'Follow-up' : 'Q${i + 1}'} · ${q['topic']}', style: const TextStyle(fontSize: 12)),
                  childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  expandedCrossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Your answer', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.faint, fontSize: 12)),
                    Text((q['answer'] as String?)?.isNotEmpty == true ? q['answer'] : 'Skipped', style: const TextStyle(color: AppColors.soft, height: 1.5)),
                    const SizedBox(height: 10),
                    const Text('Feedback', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.faint, fontSize: 12)),
                    Text(q['feedback'] ?? '', style: const TextStyle(height: 1.5)),
                    const SizedBox(height: 10),
                    Row(children: [
                      const Text('High-scoring answer', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.gold, fontSize: 12)),
                      const Spacer(),
                      IconButton(onPressed: () => onListen(q['modelAnswer'] ?? ''), icon: const Icon(Icons.volume_up_outlined, size: 20)),
                    ]),
                    Text(q['modelAnswer'] ?? '', style: const TextStyle(height: 1.5)),
                  ],
                ),
              ),
            ),
          ),
        const SizedBox(height: 10),
        FilledButton(onPressed: () => context.pushReplacement('/viva/new${s['roadmapRequestId'] != null ? '?roadmap=${s['roadmapRequestId']}' : ''}'), child: const Text('Practise again')),
      ]),
    );
  }
}

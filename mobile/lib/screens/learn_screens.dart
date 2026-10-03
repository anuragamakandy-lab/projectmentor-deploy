import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api.dart';
import '../core/files.dart';
import '../core/theme.dart';
import '../core/widgets.dart';

/// Learn content (tracks, lessons, videos, templates) is managed in the admin panel and read from the API,
/// so the app always matches the website. The last copy is kept on the phone for offline reading.
class LearnData {
  static const _prefsKey = 'pm.learn.cache';
  static Map<String, dynamic>? _memory;
  static DateTime? _fetchedAt;

  static Future<Map<String, dynamic>> load({bool refresh = false}) async {
    final fresh = _fetchedAt != null && DateTime.now().difference(_fetchedAt!) < const Duration(minutes: 2);
    if (_memory != null && fresh && !refresh) return _memory!;
    try {
      final data = Map<String, dynamic>.from(await api.learnContent());
      _memory = data;
      _fetchedAt = DateTime.now();
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsKey, jsonEncode(data));
      return data;
    } catch (e) {
      if (_memory != null) return _memory!;
      final cached = (await SharedPreferences.getInstance()).getString(_prefsKey);
      if (cached != null) return _memory = jsonDecode(cached) as Map<String, dynamic>;
      rethrow;
    }
  }

  /// Downloads a template or example file from the API and opens it.
  static Future<String> openFile(Map file) async => saveAndOpen(await api.bytes(file['url'] as String), file['file'] as String);
}

/// Loading / error wrapper used by the three Learn screens.
Widget learnBody(Map<String, dynamic>? data, String? error, VoidCallback retry, Widget Function(Map<String, dynamic>) builder) {
  if (data != null) return builder(data);
  if (error != null) return ErrorView(message: error, onRetry: retry);
  return const LoadingView();
}

/// Strips **bold** / *italic* markers into rich text spans.
TextSpan rich(String text, {TextStyle? base}) {
  final spans = <TextSpan>[];
  final re = RegExp(r'(\*\*[^*]+\*\*|\*[^*]+\*)');
  var last = 0;
  for (final m in re.allMatches(text)) {
    if (m.start > last) spans.add(TextSpan(text: text.substring(last, m.start)));
    final t = m.group(0)!;
    spans.add(t.startsWith('**')
        ? TextSpan(text: t.substring(2, t.length - 2), style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.ink))
        : TextSpan(text: t.substring(1, t.length - 1), style: const TextStyle(fontStyle: FontStyle.italic)));
    last = m.end;
  }
  if (last < text.length) spans.add(TextSpan(text: text.substring(last)));
  return TextSpan(style: base, children: spans);
}

class LearnScreen extends StatefulWidget {
  const LearnScreen({super.key, this.initialTrack});
  final String? initialTrack;
  @override
  State<LearnScreen> createState() => _LearnScreenState();
}

class _LearnScreenState extends State<LearnScreen> {
  Map<String, dynamic>? _data;
  String? _error;
  Set<String> _done = {};
  String? _track;

  @override
  void initState() {
    super.initState();
    _load();
    _loadDone();
  }

  Future<void> _load({bool refresh = false}) async {
    try {
      final d = await LearnData.load(refresh: refresh);
      if (!mounted) return;
      final keys = (d['tracks'] as Map).keys.cast<String>().toList();
      setState(() {
        _data = d;
        _error = null;
        if (_track == null || !keys.contains(_track)) _track = keys.contains(widget.initialTrack) ? widget.initialTrack : (keys.isEmpty ? null : keys.first);
      });
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  Future<void> _loadDone() async {
    final p = await SharedPreferences.getInstance();
    if (mounted) setState(() => _done = (p.getStringList('pm.learn.done') ?? []).toSet());
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    final trackKeys = (d?['tracks'] as Map?)?.keys.cast<String>().toList() ?? const <String>[];
    final track = d?['tracks'][_track] as Map?;
    final lessons = (track?['lessons'] as List?)?.cast<Map>() ?? const [];
    final doneCount = lessons.where((l) => _done.contains('$_track.${l['id']}')).length;
    return Scaffold(
      appBar: AppBar(title: const Text('Learn'), actions: [TextButton.icon(onPressed: () => context.push('/templates'), icon: const Icon(Icons.description_outlined, size: 18), label: const Text('Templates'))]),
      body: d == null
          ? learnBody(null, _error, _load, (_) => const SizedBox())
          : RefreshIndicator(onRefresh: () => _load(refresh: true), child: ListView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 32), children: [
              const Text('Write it well. Present it with confidence.', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -0.6, height: 1.2)),
              const SizedBox(height: 6),
              const Text('Lessons a lecturer would teach — in simple English, with examples and videos.', style: TextStyle(color: AppColors.soft)),
              const SizedBox(height: 16),
              SizedBox(
                height: 42,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: trackKeys.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (_, i) => ChoiceChip(
                    label: Text(d['tracks'][trackKeys[i]]['label']),
                    selected: _track == trackKeys[i],
                    onSelected: (_) => setState(() => _track = trackKeys[i]),
                  ),
                ),
              ),
              if (trackKeys.isEmpty) const Padding(padding: EdgeInsets.only(top: 24), child: Text('No lessons yet. Check back soon.', style: TextStyle(color: AppColors.soft))),
              const SizedBox(height: 16),
              if (track != null) AppCard(
                color: AppColors.bg2,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(track['label'] ?? '', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
                  const SizedBox(height: 4),
                  Text(track['intro'] ?? '', style: const TextStyle(color: AppColors.soft)),
                  const SizedBox(height: 12),
                  Row(children: [
                    Expanded(child: ClipRRect(borderRadius: BorderRadius.circular(6), child: LinearProgressIndicator(value: lessons.isEmpty ? 0 : doneCount / lessons.length, minHeight: 7))),
                    const SizedBox(width: 10),
                    Text('$doneCount/${lessons.length} done', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                  ]),
                ]),
              ),
              const SizedBox(height: 12),
              for (final (i, l) in lessons.indexed)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: AppCard(
                    onTap: () => context.push('/learn/$_track/${l['id']}').then((_) => _loadDone()),
                    padding: const EdgeInsets.all(14),
                    child: Row(children: [
                      Container(
                        width: 38, height: 38, alignment: Alignment.center,
                        decoration: BoxDecoration(color: _done.contains('$_track.${l['id']}') ? AppColors.success : AppColors.mint, shape: BoxShape.circle),
                        child: _done.contains('$_track.${l['id']}') ? const Icon(Icons.check_rounded, color: Colors.white, size: 20) : Text('${i + 1}', style: const TextStyle(color: AppColors.accent, fontWeight: FontWeight.w800)),
                      ),
                      const SizedBox(width: 12),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(l['title'], style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                        Text(l['lead'] ?? '', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.soft, fontSize: 13)),
                      ])),
                      const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
                    ]),
                  ),
                ),
            ])),
    );
  }
}

/* ======================= lesson reader ======================= */

class LessonScreen extends StatefulWidget {
  const LessonScreen({super.key, required this.track, required this.lessonId});
  final String track, lessonId;
  @override
  State<LessonScreen> createState() => _LessonScreenState();
}

class _LessonScreenState extends State<LessonScreen> {
  Map<String, dynamic>? _data;
  String? _error;
  bool _done = false;

  Future<void> _load() async {
    try {
      final d = await LearnData.load();
      if (mounted) setState(() { _data = d; _error = null; });
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
    SharedPreferences.getInstance().then((p) { if (mounted) setState(() => _done = (p.getStringList('pm.learn.done') ?? []).contains('${widget.track}.${widget.lessonId}')); });
  }

  Future<void> _toggleDone() async {
    final p = await SharedPreferences.getInstance();
    final set = (p.getStringList('pm.learn.done') ?? []).toSet();
    final key = '${widget.track}.${widget.lessonId}';
    _done ? set.remove(key) : set.add(key);
    await p.setStringList('pm.learn.done', set.toList());
    setState(() => _done = !_done);
  }

  @override
  Widget build(BuildContext context) {
    if (_data == null) return Scaffold(appBar: AppBar(), body: learnBody(null, _error, _load, (_) => const SizedBox()));
    final lessons = (((_data!['tracks'] as Map)[widget.track] as Map?)?['lessons'] as List? ?? const []).cast<Map>();
    final index = lessons.indexWhere((l) => l['id'] == widget.lessonId);
    if (index < 0) {
      return Scaffold(appBar: AppBar(), body: const EmptyState(icon: Icons.school_outlined, title: 'Lesson not found', message: 'It may have been moved or removed. Go back to Learn to see the current lessons.'));
    }
    final l = lessons[index];
    final next = index + 1 < lessons.length ? lessons[index + 1] : null;
    return Scaffold(
      appBar: AppBar(title: Text('Lesson ${index + 1} of ${lessons.length}')),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 40), children: [
        Text(l['title'], style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -0.6, height: 1.2)),
        const SizedBox(height: 8),
        Text(l['lead'] ?? '', style: const TextStyle(fontSize: 16, color: AppColors.soft, height: 1.55)),
        const SizedBox(height: 10),
        for (final b in (l['blocks'] as List).cast<Map>()) Padding(padding: const EdgeInsets.only(top: 14), child: _Block(b: b, videos: _data!['videos'] as Map)),
        const SizedBox(height: 24),
        FilledButton.icon(
          onPressed: _toggleDone,
          style: FilledButton.styleFrom(backgroundColor: _done ? AppColors.success : AppColors.ink),
          icon: Icon(_done ? Icons.check_circle_rounded : Icons.check_circle_outline_rounded),
          label: Text(_done ? 'Lesson done' : 'Mark lesson as done'),
        ),
        if (next != null) ...[
          const SizedBox(height: 10),
          OutlinedButton(onPressed: () => context.pushReplacement('/learn/${widget.track}/${next['id']}'), child: Text('Next: ${next['title']}', maxLines: 1, overflow: TextOverflow.ellipsis)),
        ],
      ]),
    );
  }
}

class _Block extends StatefulWidget {
  const _Block({required this.b, required this.videos});
  final Map b;
  final Map videos;
  @override
  State<_Block> createState() => _BlockState();
}

class _BlockState extends State<_Block> {
  final Map<int, int> _quiz = {};
  Set<int> _checked = {};

  @override
  void initState() {
    super.initState();
    if (widget.b['type'] == 'checklist') {
      SharedPreferences.getInstance().then((p) { if (mounted) setState(() => _checked = (p.getStringList('pm.learn.check.${widget.b['id']}') ?? []).map(int.parse).toSet()); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final b = widget.b;
    const body = TextStyle(fontSize: 15.5, height: 1.6, color: AppColors.soft, fontFamily: kFont);
    switch (b['type']) {
      case 'image':
        return b['uploadId'] == null ? const SizedBox.shrink() : Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(children: [
            GestureDetector(
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => Scaffold(appBar: AppBar(title: Text(b['caption'] ?? 'Diagram')), backgroundColor: Colors.white,
                  body: InteractiveViewer(maxScale: 5, child: Center(child: Image.network(api.uploadUrl(b['uploadId']))))))),
              child: Container(decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.line)), padding: const EdgeInsets.all(8),
                  child: Image.network(api.uploadUrl(b['uploadId']), errorBuilder: (_, __, ___) => const Text('Image could not load.'))),
            ),
            if (b['caption'] != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text('${b['caption']} · tap to zoom', textAlign: TextAlign.center, style: const TextStyle(color: AppColors.faint, fontSize: 12.5))),
          ]),
        );
      case 'p':
        return Text.rich(rich(b['text'] ?? '', base: body));
      case 'tip':
        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: const Color(0xFFFBF3E2), borderRadius: BorderRadius.circular(14), border: Border(left: BorderSide(color: AppColors.gold, width: 4))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('LECTURER’S NOTE', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 11.5, letterSpacing: 1.2, color: AppColors.gold)),
            const SizedBox(height: 6),
            Text.rich(rich(b['text'], base: body.copyWith(color: AppColors.ink))),
          ]),
        );
      case 'list':
        return Column(children: [for (final i in (b['items'] as List)) _bullet(Text.rich(rich(i, base: body)))]);
      case 'cards':
        return Column(children: [for (final c in (b['items'] as List).cast<Map>()) Padding(padding: const EdgeInsets.only(bottom: 8), child: AppCard(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [Expanded(child: Text(c['title'], style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))), if (c['meta'] != null) Text(c['meta'], style: const TextStyle(color: AppColors.faint, fontSize: 12))]),
              const SizedBox(height: 4),
              Text(c['text'], style: const TextStyle(color: AppColors.soft, height: 1.5)),
            ])))]);
      case 'steps':
        return Column(children: [for (final (i, s) in (b['items'] as List).cast<Map>().indexed) Padding(padding: const EdgeInsets.only(bottom: 12), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              CircleAvatar(radius: 14, backgroundColor: AppColors.ink, child: Text('${i + 1}', style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w800))),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(s['title'], style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)), const SizedBox(height: 2), Text.rich(rich(s['text'], base: body.copyWith(fontSize: 14.5)))])),
            ]))]);
      case 'doDont':
        return Column(children: [
          _box('Do', (b['do'] as List).cast<String>(), AppColors.success, const Color(0xFFEAF5EE)),
          const SizedBox(height: 8),
          _box('Don’t', (b['dont'] as List).cast<String>(), AppColors.danger, const Color(0xFFFBEFEC)),
        ]);
      case 'compare':
        return Column(children: [for (final c in (b['items'] as List).cast<Map>()) Padding(padding: const EdgeInsets.only(bottom: 10), child: AppCard(padding: const EdgeInsets.all(14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (c['labels'] == null) const Text('BEFORE', style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w800, fontSize: 11, letterSpacing: 1)),
              Text(c['bad'], style: const TextStyle(color: AppColors.soft, decoration: TextDecoration.none)),
              const SizedBox(height: 10),
              if (c['labels'] == null) const Text('BETTER', style: TextStyle(color: AppColors.success, fontWeight: FontWeight.w800, fontSize: 11, letterSpacing: 1)),
              Text(c['good'], style: const TextStyle(color: AppColors.ink, fontWeight: FontWeight.w600)),
              if (c['why'] != null) ...[const SizedBox(height: 8), Text(c['why'], style: const TextStyle(color: AppColors.accentDark, fontSize: 13.5))],
            ])))]);
      case 'table':
        final head = (b['head'] as List).cast<String>();
        return Column(children: [for (final r in (b['rows'] as List).cast<List>()) Padding(padding: const EdgeInsets.only(bottom: 8), child: AppCard(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              for (final (i, cell) in r.cast<String>().indexed) Padding(padding: const EdgeInsets.only(bottom: 4), child: Text.rich(TextSpan(children: [
                    TextSpan(text: '${head[i]}: ', style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.faint, fontSize: 12.5)),
                    rich(cell, base: TextStyle(color: i == 0 ? AppColors.ink : AppColors.soft, fontWeight: i == 0 ? FontWeight.w700 : FontWeight.w400, fontSize: 14)),
                  ]))),
            ])))]);
      case 'example':
        return Container(
          width: double.infinity,
          decoration: BoxDecoration(color: AppColors.ink, borderRadius: BorderRadius.circular(12)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(padding: const EdgeInsets.fromLTRB(14, 10, 14, 0), child: Text(b['title'] ?? '', style: const TextStyle(color: AppColors.teal, fontSize: 12, fontWeight: FontWeight.w700))),
            SingleChildScrollView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.all(14), child: Text(b['code'], style: const TextStyle(color: Color(0xFFDCE4DF), fontFamily: 'monospace', fontSize: 12.5, height: 1.55))),
          ]),
        );
      case 'videos':
        return Column(children: [for (final id in (b['ids'] as List).cast<String>()) if (widget.videos[id] != null) Padding(padding: const EdgeInsets.only(bottom: 10), child: _Video(id: id, v: widget.videos[id] as Map))]);
      case 'quiz':
        final qs = (b['questions'] as List).cast<Map>();
        return AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [const Text('Quick check', style: TextStyle(fontWeight: FontWeight.w800)), const Spacer(), if (_quiz.length == qs.length) Text('${qs.indexed.where((e) => _quiz[e.$1] == e.$2['answer']).length}/${qs.length} correct', style: const TextStyle(color: AppColors.accent, fontWeight: FontWeight.w700))]),
          for (final (i, q) in qs.indexed) ...[
            const SizedBox(height: 12),
            Text('${i + 1}. ${q['q']}', style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Wrap(spacing: 8, runSpacing: 8, children: [for (final (j, o) in (q['options'] as List).cast<String>().indexed) ChoiceChip(
                  label: Text(o),
                  selected: _quiz[i] == j,
                  selectedColor: j == q['answer'] ? AppColors.success : AppColors.danger,
                  labelStyle: TextStyle(color: _quiz[i] == j ? Colors.white : (_quiz.containsKey(i) && j == q['answer'] ? AppColors.success : AppColors.ink), fontWeight: FontWeight.w600),
                  onSelected: _quiz.containsKey(i) ? null : (_) => setState(() => _quiz[i] = j),
                )]),
            if (_quiz.containsKey(i)) Padding(padding: const EdgeInsets.only(top: 6), child: Text('${_quiz[i] == q['answer'] ? 'Correct. ' : 'Not quite. '}${q['why']}', style: TextStyle(color: _quiz[i] == q['answer'] ? AppColors.success : AppColors.danger, fontSize: 13.5))),
          ],
          if (_quiz.length == qs.length) TextButton(onPressed: () => setState(_quiz.clear), child: const Text('Try again')),
        ]));
      case 'checklist':
        final items = (b['items'] as List).cast<String>();
        return AppCard(padding: EdgeInsets.zero, child: Column(children: [
          Padding(padding: const EdgeInsets.fromLTRB(16, 14, 16, 4), child: Row(children: [Text('${_checked.length} of ${items.length} done', style: const TextStyle(fontWeight: FontWeight.w700)), const Spacer()])),
          for (final (i, it) in items.indexed) CheckboxListTile(
                value: _checked.contains(i),
                activeColor: AppColors.success,
                controlAffinity: ListTileControlAffinity.leading,
                title: Text(it, style: const TextStyle(fontSize: 14.5)),
                onChanged: (_) async {
                  setState(() => _checked.contains(i) ? _checked.remove(i) : _checked.add(i));
                  final p = await SharedPreferences.getInstance();
                  await p.setStringList('pm.learn.check.${b['id']}', _checked.map((e) => '$e').toList());
                },
              ),
        ]));
      default:
        return const SizedBox.shrink(); // visual diagrams are shown on the website
    }
  }

  Widget _bullet(Widget child) => Padding(padding: const EdgeInsets.only(bottom: 8), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.only(top: 9), child: Container(width: 6, height: 6, decoration: const BoxDecoration(color: AppColors.accent, shape: BoxShape.circle))),
        const SizedBox(width: 10),
        Expanded(child: child),
      ]));

  Widget _box(String title, List<String> items, Color c, Color bg) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(14)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: TextStyle(color: c, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          for (final i in items) _bullet(Text.rich(rich(i, base: const TextStyle(color: AppColors.ink, height: 1.45, fontSize: 14.5, fontFamily: kFont)))),
        ]),
      );
}

class _Video extends StatelessWidget {
  const _Video({required this.id, required this.v});
  final String id;
  final Map v;
  @override
  Widget build(BuildContext context) => AppCard(
        padding: EdgeInsets.zero,
        onTap: () => openLink('https://www.youtube.com/watch?v=$id'),
        child: Row(children: [
          Stack(alignment: Alignment.center, children: [
            Image.network('https://img.youtube.com/vi/$id/hqdefault.jpg', width: 130, height: 78, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Container(width: 130, height: 78, color: AppColors.bg2)),
            const CircleAvatar(radius: 16, backgroundColor: Colors.black54, child: Icon(Icons.play_arrow_rounded, color: Colors.white)),
            Positioned(right: 4, bottom: 4, child: Container(padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1), color: Colors.black87, child: Text(v['duration'] ?? '', style: const TextStyle(color: Colors.white, fontSize: 10.5)))),
          ]),
          const SizedBox(width: 12),
          Expanded(child: Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(v['title'] ?? '', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
            const SizedBox(height: 2),
            Text('${v['channel']} · YouTube', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.faint, fontSize: 12)),
          ]))),
          const SizedBox(width: 8),
        ]),
      );
}

/* ======================= templates ======================= */

class TemplatesScreen extends StatefulWidget {
  const TemplatesScreen({super.key});
  @override
  State<TemplatesScreen> createState() => _TemplatesScreenState();
}

class _TemplatesScreenState extends State<TemplatesScreen> {
  Map<String, dynamic>? _data;
  String? _error;
  String _cat = 'All';
  String _q = '';
  String? _opening;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load({bool refresh = false}) async {
    try {
      final d = await LearnData.load(refresh: refresh);
      if (mounted) setState(() { _data = d; _error = null; });
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  Color _fmt(String f) => switch (f) { 'Word' => const Color(0xFF2B579A), 'Excel' => const Color(0xFF217346), 'PowerPoint' => const Color(0xFFC43E1C), 'Markdown' => const Color(0xFF24292F), _ => AppColors.soft };

  Future<void> _open(Map file) async {
    setState(() => _opening = file['id'] as String?);
    try { final msg = await LearnData.openFile(file); if (mounted) showSnack(context, msg); }
    catch (e) { if (mounted) showSnack(context, 'Could not download this file. ${errorText(e)}'); }
    finally { if (mounted) setState(() => _opening = null); }
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    final cats = (d?['templateCategories'] as List?)?.cast<String>() ?? const ['All'];
    if (!cats.contains(_cat)) _cat = 'All';
    final all = (d?['templates'] as List?)?.cast<Map>() ?? const [];
    final list = all.where((t) => (_cat == 'All' || t['category'] == _cat) && (_q.isEmpty || '${t['name']} ${t['when'] ?? ''} ${(t['inside'] as List).join(' ')}'.toLowerCase().contains(_q.toLowerCase()))).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Templates')),
      body: d == null
          ? learnBody(null, _error, _load, (_) => const SizedBox())
          : RefreshIndicator(onRefresh: () => _load(refresh: true), child: ListView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 32), children: [
              const Text('Fill-in-the-blanks templates for every stage — proposal to viva. Each one has guidance telling you what to write.', style: TextStyle(color: AppColors.soft)),
              const SizedBox(height: 14),
              TextField(onChanged: (v) => setState(() => _q = v), decoration: const InputDecoration(hintText: 'Search templates — e.g. test, Gantt, README', prefixIcon: Icon(Icons.search_rounded))),
              const SizedBox(height: 12),
              SizedBox(height: 40, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: cats.length, separatorBuilder: (_, __) => const SizedBox(width: 8), itemBuilder: (_, i) => ChoiceChip(label: Text(cats[i]), selected: _cat == cats[i], onSelected: (_) => setState(() => _cat = cats[i])))),
              const SizedBox(height: 14),
              if (list.isEmpty) const Text('No templates match that search.', style: TextStyle(color: AppColors.soft)),
              for (final t in list)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Text(t['name'], style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
                      if (t['format'] != null) Container(padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3), decoration: BoxDecoration(color: _fmt(t['format']), borderRadius: BorderRadius.circular(999)), child: Text(t['format'], style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w700))),
                    ]),
                    const SizedBox(height: 6),
                    if (t['when'] != null) Text.rich(TextSpan(children: [const TextSpan(text: 'Use it: ', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.ink)), TextSpan(text: t['when'])]), style: const TextStyle(color: AppColors.soft, fontSize: 13.5)),
                    const SizedBox(height: 8),
                    for (final i in (t['inside'] as List).cast<String>()) Padding(padding: const EdgeInsets.only(bottom: 3), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Padding(padding: EdgeInsets.only(top: 3), child: Icon(Icons.check_rounded, size: 15, color: AppColors.accent)),
                      const SizedBox(width: 6),
                      Expanded(child: Text(i, style: const TextStyle(color: AppColors.soft, fontSize: 13))),
                    ])),
                    const SizedBox(height: 10),
                    SizedBox(width: double.infinity, child: FilledButton.icon(onPressed: _opening != null ? null : () => _open(t), style: FilledButton.styleFrom(backgroundColor: AppColors.accent, minimumSize: const Size(10, 46)), icon: _opening == t['id'] ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.download_rounded, size: 20), label: Text(_opening == t['id'] ? 'Downloading…' : 'Open template'))),
                    if (t['saveAs'] != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text('After downloading, rename it to ${t['saveAs']}', style: const TextStyle(color: AppColors.faint, fontSize: 12))),
                  ])),
                ),
              const SectionTitle('Finished examples'),
              for (final dl in (d['downloads'] as List).cast<Map>())
                Padding(padding: const EdgeInsets.only(bottom: 10), child: AppCard(
                  onTap: _opening != null ? null : () => _open(dl),
                  child: Row(children: [
                    const Icon(Icons.auto_stories_outlined, color: AppColors.accent),
                    const SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(dl['name'], style: const TextStyle(fontWeight: FontWeight.w700)), if (dl['type'] != null) Text(dl['type'], style: const TextStyle(color: AppColors.faint, fontSize: 12.5))])),
                    const Icon(Icons.open_in_new_rounded, color: AppColors.faint, size: 20),
                  ]),
                )),
            ])),
    );
  }
}

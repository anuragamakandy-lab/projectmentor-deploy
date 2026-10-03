import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/api.dart';
import '../core/files.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../core/widgets.dart';

/* ======================= list ======================= */

class RoadmapsScreen extends StatefulWidget {
  const RoadmapsScreen({super.key});
  @override
  State<RoadmapsScreen> createState() => _RoadmapsScreenState();
}

class _RoadmapsScreenState extends State<RoadmapsScreen> {
  List? _items;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final r = await api.roadmaps();
      if (mounted) setState(() { _items = r; _error = null; });
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  Future<void> _rename(Map r) async {
    final c = TextEditingController(text: r['displayTitle']);
    final name = await showAppSheet<String>(context, (ctx) => Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Rename roadmap', style: Theme.of(ctx).textTheme.titleLarge),
            const SizedBox(height: 14),
            TextField(controller: c, autofocus: true, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(labelText: 'Project title')),
            const SizedBox(height: 16),
            FilledButton(onPressed: () => Navigator.pop(ctx, c.text.trim()), child: const Text('Save')),
          ]),
        ));
    if (name == null || name.isEmpty) return;
    try { await api.renameRoadmap(r['id'], name); _load(); } catch (e) { if (mounted) showSnack(context, errorText(e)); }
  }

  Future<void> _delete(Map r) async {
    if (!await confirm(context, title: 'Delete roadmap?', message: '“${r['displayTitle']}” and all its progress will be removed permanently.', ok: 'Delete', danger: true)) return;
    try { await api.deleteRoadmap(r['id']); _load(); if (mounted) showSnack(context, 'Roadmap deleted'); } catch (e) { if (mounted) showSnack(context, errorText(e)); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () => context.push('/roadmaps/new').then((_) => _load()),
          backgroundColor: AppColors.ink,
          foregroundColor: Colors.white,
          icon: const Icon(Icons.add_rounded),
          label: const Text('New roadmap', style: TextStyle(fontWeight: FontWeight.w700)),
        ),
        body: HeroPage(
          onRefresh: _load,
          header: const PageHeader(eyebrow: 'Your work', title: 'Roadmaps', subtitle: 'Each roadmap is a separate project. Tap one to track its milestones.'),
          children: [
            if (_error != null && _items == null) ErrorView(message: _error!, onRetry: _load)
            else if (_items == null) const LoadingView()
            else if (_items!.isEmpty)
              EmptyState(icon: Icons.map_outlined, title: 'No roadmaps yet', message: 'Answer a few questions and the AI builds a plan with dated milestones.', action: 'Create my first roadmap', onAction: () => context.push('/roadmaps/new').then((_) => _load()))
            else
              ..._items!.map((r) => Padding(padding: const EdgeInsets.only(bottom: 12), child: _RoadmapCard(r: r as Map, onRename: () => _rename(r), onDelete: () => _delete(r), onChanged: _load))),
            const SizedBox(height: 70),
          ],
        ),
      );
}

class _RoadmapCard extends StatelessWidget {
  const _RoadmapCard({required this.r, required this.onRename, required this.onDelete, required this.onChanged});
  final Map r;
  final VoidCallback onRename, onDelete, onChanged;
  @override
  Widget build(BuildContext context) {
    final hasPlan = r['roadmapStatus'] != 'None';
    final pct = (r['progressPercent'] as num? ?? 0).toDouble();
    final overdue = r['overdueCount'] as int? ?? 0;
    return AppCard(
      onTap: () => context.push(hasPlan ? '/roadmaps/${r['id']}' : '/roadmaps/${r['id']}/chat').then((_) => onChanged()),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          StatusPill(hasPlan ? r['roadmapStatus'] : 'Draft'),
          const SizedBox(width: 8),
          if (overdue > 0) StatusPill('Overdue', overdue: true),
          const Spacer(),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_horiz_rounded, color: AppColors.faint),
            onSelected: (v) => v == 'rename' ? onRename() : onDelete(),
            itemBuilder: (_) => const [PopupMenuItem(value: 'rename', child: Text('Rename')), PopupMenuItem(value: 'delete', child: Text('Delete', style: TextStyle(color: AppColors.danger)))],
          ),
        ]),
        Text(r['displayTitle'] ?? '', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 6),
        InfoRow(icon: Icons.event_outlined, text: 'Deadline ${mediumDate(parseDay(r['deadline']))}'),
        const SizedBox(height: 12),
        if (hasPlan) ...[
          Row(children: [
            Expanded(child: ClipRRect(borderRadius: BorderRadius.circular(6), child: LinearProgressIndicator(value: pct / 100, minHeight: 8))),
            const SizedBox(width: 10),
            Text('${pct.round()}%', style: const TextStyle(fontWeight: FontWeight.w800)),
          ]),
          const SizedBox(height: 6),
          Text('${r['doneCount']} of ${r['milestoneCount']} milestones done', style: const TextStyle(color: AppColors.soft, fontSize: 13)),
        ] else
          const Text('Not finished yet — tap to continue planning.', style: TextStyle(color: AppColors.accent, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}

/* ======================= new roadmap (guided form) ======================= */

class NewRoadmapScreen extends StatefulWidget {
  const NewRoadmapScreen({super.key});
  @override
  State<NewRoadmapScreen> createState() => _NewRoadmapScreenState();
}

class _NewRoadmapScreenState extends State<NewRoadmapScreen> {
  int _step = 0;
  bool _hasIdea = false;
  String? _draftId;
  final _title = TextEditingController();
  final _summary = TextEditingController();
  int _year = 3;
  String _type = 'web';
  DateTime _deadline = today().add(const Duration(days: 70));
  double _hours = 8;
  int _team = 1;
  final _tech = TextEditingController();
  final _weak = TextEditingController();
  bool _busy = false;

  static const _types = [('web', 'Web app', Icons.language_rounded), ('mobile', 'Mobile app', Icons.phone_iphone_rounded), ('data', 'Data or AI', Icons.insights_rounded)];

  Future<void> _submit() async {
    if (_hasIdea && _title.text.trim().isEmpty) { showSnack(context, 'Give your project idea a title.'); setState(() => _step = 0); return; }
    setState(() => _busy = true);
    try {
      // Coming back to change answers replaces the earlier unfinished draft.
      if (_draftId != null) await api.deleteRoadmap(_draftId!).catchError((_) {});
      final draft = await api.draftRoadmap({
        'year': _year, 'projectType': _type, 'deadline': dayKey(_deadline), 'hoursPerWeek': _hours.round(),
        'teamSize': _team, 'technologies': _tech.text.trim().isEmpty ? null : _tech.text.trim(),
        'leastConfident': _weak.text.trim().isEmpty ? null : _weak.text.trim(),
        'title': _hasIdea ? _title.text.trim() : null,
        'description': _hasIdea && _summary.text.trim().isNotEmpty ? _summary.text.trim() : null,
      });
      final id = draft['roadmapRequestId'] as String;
      _draftId = id;
      if (!mounted) return;
      // push (not replace) so Back returns to these answers.
      if (_hasIdea) {
        context.push('/roadmaps/$id/chat', extra: {'title': _title.text.trim(), 'summary': _summary.text.trim()});
      } else {
        context.push('/roadmaps/$id/ideas');
      }
    } catch (e) {
      if (mounted) showSnack(context, errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final steps = [_stepIdea(t), _stepDetails(t), _stepSkills(t)];
    return Scaffold(
      appBar: AppBar(title: const Text('New roadmap')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
          child: Row(children: List.generate(3, (i) => Expanded(child: Container(
                height: 5,
                margin: EdgeInsets.only(right: i < 2 ? 6 : 0),
                decoration: BoxDecoration(color: i <= _step ? AppColors.accent : AppColors.line, borderRadius: BorderRadius.circular(4)),
              )))),
        ),
        Expanded(child: ListView(padding: const EdgeInsets.fromLTRB(20, 12, 20, 24), children: [steps[_step]])),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            child: Row(children: [
              if (_step > 0) Expanded(child: OutlinedButton(onPressed: () => setState(() => _step--), child: const Text('Back'))),
              if (_step > 0) const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: FilledButton(
                  onPressed: _busy ? null : () => _step < 2 ? setState(() => _step++) : _submit(),
                  child: _busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.4)) : Text(_step < 2 ? 'Next' : (_hasIdea ? 'Continue to mentor chat' : 'Suggest ideas')),
                ),
              ),
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _choice({required bool selected, required IconData icon, required String title, required String text, required VoidCallback onTap}) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: AppCard(
          onTap: onTap,
          color: selected ? const Color(0xFFEAF4F2) : Colors.white,
          borderColor: selected ? AppColors.accent : AppColors.line,
          child: Row(children: [
            Icon(icon, color: selected ? AppColors.accent : AppColors.soft),
            const SizedBox(width: 14),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5)),
              const SizedBox(height: 2),
              Text(text, style: const TextStyle(color: AppColors.soft, fontSize: 13.5)),
            ])),
            Icon(selected ? Icons.radio_button_checked_rounded : Icons.radio_button_off_rounded, color: selected ? AppColors.accent : AppColors.faint),
          ]),
        ),
      );

  Widget _stepIdea(TextTheme t) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Do you have a project idea?', style: t.headlineSmall),
        const SizedBox(height: 6),
        const Text('Both paths end with a full roadmap.', style: TextStyle(color: AppColors.soft)),
        const SizedBox(height: 20),
        _choice(selected: !_hasIdea, icon: Icons.lightbulb_outline_rounded, title: 'Suggest ideas for me', text: 'The AI proposes projects that fit you.', onTap: () => setState(() => _hasIdea = false)),
        _choice(selected: _hasIdea, icon: Icons.edit_note_rounded, title: 'I already have an idea', text: 'Skip suggestions and go straight to planning.', onTap: () => setState(() => _hasIdea = true)),
        if (_hasIdea) ...[
          const SizedBox(height: 8),
          TextField(controller: _title, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(labelText: 'Project title', hintText: 'e.g. Campus lost and found app')),
          const SizedBox(height: 12),
          TextField(controller: _summary, maxLines: 3, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(labelText: 'Short description (optional)', hintText: 'What will it do, and for whom?')),
        ],
      ]);

  Widget _stepDetails(TextTheme t) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('About your project', style: t.headlineSmall),
        const SizedBox(height: 18),
        Text('Year of study', style: t.titleSmall),
        const SizedBox(height: 8),
        Wrap(spacing: 8, children: [for (final y in [1, 2, 3, 4]) ChoiceChip(label: Text('Year $y'), selected: _year == y, onSelected: (_) => setState(() => _year = y))]),
        const SizedBox(height: 18),
        Text('Project type', style: t.titleSmall),
        const SizedBox(height: 8),
        Row(children: [
          for (final (v, label, icon) in _types)
            Expanded(child: Padding(
              padding: EdgeInsets.only(right: v == 'data' ? 0 : 8),
              child: AppCard(
                onTap: () => setState(() => _type = v),
                padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 6),
                color: _type == v ? const Color(0xFFEAF4F2) : Colors.white,
                borderColor: _type == v ? AppColors.accent : AppColors.line,
                child: Column(children: [Icon(icon, color: _type == v ? AppColors.accent : AppColors.soft), const SizedBox(height: 6), Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))]),
              ),
            )),
        ]),
        const SizedBox(height: 18),
        Text('Deadline', style: t.titleSmall),
        const SizedBox(height: 8),
        AppCard(
          onTap: () async {
            final d = await showDatePicker(context: context, initialDate: _deadline, firstDate: today().add(const Duration(days: 7)), lastDate: today().add(const Duration(days: 730)));
            if (d != null) setState(() => _deadline = d);
          },
          child: Row(children: [
            const Icon(Icons.event_outlined, color: AppColors.accent),
            const SizedBox(width: 12),
            Expanded(child: Text(longDate(_deadline), style: const TextStyle(fontWeight: FontWeight.w600))),
            Text('${daysUntil(_deadline) ~/ 7} weeks', style: const TextStyle(color: AppColors.soft)),
          ]),
        ),
        const SizedBox(height: 18),
        Row(children: [Text('Hours per week', style: t.titleSmall), const Spacer(), Text('${_hours.round()} h', style: const TextStyle(fontWeight: FontWeight.w800))]),
        Slider(value: _hours, min: 2, max: 40, divisions: 38, activeColor: AppColors.accent, onChanged: (v) => setState(() => _hours = v)),
        Row(children: [
          Text('Team size', style: t.titleSmall),
          const Spacer(),
          IconButton.outlined(onPressed: _team > 1 ? () => setState(() => _team--) : null, icon: const Icon(Icons.remove_rounded)),
          SizedBox(width: 44, child: Text('$_team', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18))),
          IconButton.outlined(onPressed: _team < 10 ? () => setState(() => _team++) : null, icon: const Icon(Icons.add_rounded)),
        ]),
      ]);

  Widget _stepSkills(TextTheme t) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Your skills', style: t.headlineSmall),
        const SizedBox(height: 6),
        const Text('Optional, but it helps the AI fit the plan to you.', style: TextStyle(color: AppColors.soft)),
        const SizedBox(height: 18),
        TextField(controller: _tech, decoration: const InputDecoration(labelText: 'Technologies you know', hintText: 'e.g. React, C#, SQL')),
        const SizedBox(height: 12),
        TextField(controller: _weak, maxLines: 2, decoration: const InputDecoration(labelText: 'What you feel least confident about', hintText: 'e.g. database design, deployment')),
        const SizedBox(height: 18),
        AppCard(
          color: AppColors.bg2,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Summary', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Text('Year $_year · ${_types.firstWhere((x) => x.$1 == _type).$2} · ${_hours.round()} h/week · team of $_team', style: const TextStyle(color: AppColors.soft)),
            Text('Deadline ${mediumDate(_deadline)}', style: const TextStyle(color: AppColors.soft)),
            if (_hasIdea && _title.text.isNotEmpty) Text('Idea: ${_title.text}', style: const TextStyle(color: AppColors.soft)),
          ]),
        ),
      ]);
}

/* ======================= ideas ======================= */

class IdeasScreen extends StatefulWidget {
  const IdeasScreen({super.key, required this.id});
  final String id;
  @override
  State<IdeasScreen> createState() => _IdeasScreenState();
}

class _IdeasScreenState extends State<IdeasScreen> {
  List? _ideas;
  String? _error;
  bool _loading = false;
  final List<String> _seen = [];

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final r = await api.suggestIdeas(widget.id, _seen);
      final ideas = r['ideas'] as List? ?? [];
      if (ideas.isEmpty) throw ApiException(r['message'] ?? 'No ideas came back. Please try again.');
      _seen.addAll(ideas.map((i) => (i as Map)['title'] as String));
      if (mounted) setState(() => _ideas = ideas);
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Project ideas')),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ListView(padding: const EdgeInsets.fromLTRB(20, 4, 20, 32), children: [
            const Text('Ideas picked for you', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -0.6)),
            const SizedBox(height: 6),
            const Text('Choose one to shape with your mentor, or ask for different ideas.', style: TextStyle(color: AppColors.soft)),
            const SizedBox(height: 18),
            if (_loading && _ideas == null) const LoadingView(label: 'The Idea agent is thinking… (up to 30 seconds)')
            else if (_error != null && _ideas == null) ErrorView(message: _error!, onRetry: _load)
            else ...[
              ..._ideas!.map((i) => Padding(padding: const EdgeInsets.only(bottom: 14), child: _IdeaCard(idea: i as Map, onPick: () async {
                final summary = [i['summary'], if (i['whyItFits'] != null) 'Why it fits: ${i['whyItFits']}', if ((i['techStack'] as List?)?.isNotEmpty ?? false) 'Suggested stack: ${(i['techStack'] as List).join(', ')}'].join('\n');
                // Save the idea first so the mentor knows it from the first message.
                await api.renameRoadmap(widget.id, i['title'] as String, description: summary).catchError((_) {});
                if (context.mounted) context.push('/roadmaps/${widget.id}/chat', extra: {'title': i['title'] as String, 'summary': summary});
              }))),
              OutlinedButton.icon(onPressed: _loading ? null : _load, icon: _loading ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.refresh_rounded), label: const Text('Show different ideas')),
            ],
          ]),
        ),
      );
}

class _IdeaCard extends StatelessWidget {
  const _IdeaCard({required this.idea, required this.onPick});
  final Map idea;
  final VoidCallback onPick;
  @override
  Widget build(BuildContext context) => AppCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(idea['title'] ?? '', style: Theme.of(context).textTheme.titleMedium)),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: AppColors.bg2, borderRadius: BorderRadius.circular(999)),
              child: Text(idea['difficulty'] ?? '', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.soft)),
            ),
          ]),
          const SizedBox(height: 8),
          Text(idea['summary'] ?? '', style: const TextStyle(color: AppColors.soft, height: 1.5)),
          if ((idea['whyItFits'] as String?)?.isNotEmpty ?? false) ...[
            const SizedBox(height: 10),
            Text('Why it fits you: ${idea['whyItFits']}', style: const TextStyle(color: AppColors.accentDark, fontWeight: FontWeight.w600, fontSize: 13.5)),
          ],
          const SizedBox(height: 12),
          Wrap(spacing: 6, runSpacing: 6, children: [for (final s in (idea['techStack'] as List? ?? [])) Chip(label: Text('$s'), visualDensity: VisualDensity.compact)]),
          const SizedBox(height: 14),
          SizedBox(width: double.infinity, child: FilledButton(onPressed: onPick, style: FilledButton.styleFrom(minimumSize: const Size(64, 46)), child: const Text('Choose this idea'))),
        ]),
      );
}

/* ======================= mentor chat ======================= */

class MentorChatScreen extends StatefulWidget {
  const MentorChatScreen({super.key, required this.id, this.extra});
  final String id;
  final Map<String, String>? extra;
  @override
  State<MentorChatScreen> createState() => _MentorChatScreenState();
}

/// The roadmap mentor: knows the project, remembers this chat, opens with a project summary and three
/// suggested questions, and answers whatever the student asks.
class _MentorChatScreenState extends State<MentorChatScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  List<Map> _messages = [];
  List<String> _suggestions = [];
  Map? _project;
  bool _thinking = true;
  bool _ready = false;
  bool _planned = false;
  bool _generating = false;
  String? _title;

  @override
  void initState() {
    super.initState();
    _title = widget.extra?['title'];
    _start();
  }

  Future<void> _start() async {
    try {
      final r = await api.roadmap(widget.id);
      _title ??= r['title'];
      _planned = (r['milestones'] as List? ?? []).isNotEmpty;
      final a = await api.assistant(widget.id);
      _apply(a);
    } catch (e) {
      if (mounted) showSnack(context, errorText(e));
    }
    if (mounted) setState(() => _thinking = false);
    _toBottom();
  }

  void _apply(Map a) {
    _messages = ((a['messages'] as List?) ?? const []).cast<Map>();
    _suggestions = ((a['suggestions'] as List?) ?? const []).cast<String>();
    _project = (a['project'] as Map?) ?? _project;
    _ready = a['ready'] == true || _ready;
  }

  void _toBottom() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      });

  Future<void> _send([String? preset]) async {
    final text = (preset ?? _input.text).trim();
    if (text.isEmpty || _thinking) return;
    setState(() { _messages = [..._messages, {'role': 'user', 'content': text}]; _suggestions = []; _thinking = true; _input.clear(); });
    _toBottom();
    try {
      _apply(await api.sendChat(widget.id, text));
    } catch (e) {
      if (mounted) { showSnack(context, errorText(e)); _input.text = text; }
    }
    if (mounted) setState(() => _thinking = false);
    _toBottom();
  }

  Future<void> _generate() async {
    setState(() => _generating = true);
    try {
      await api.plan(widget.id, title: widget.extra?['title'], summary: widget.extra?['summary']);
      if (mounted) context.pushReplacement('/roadmaps/${widget.id}');
    } catch (e) {
      if (mounted) { showSnack(context, errorText(e)); setState(() => _generating = false); }
    }
  }

  void _showProject() {
    final p = _project;
    if (p == null) return;
    showPanel(context, (_) => Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          const Eyebrow('Your project'),
          Text(p['title'] ?? '', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          if (p['description'] != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(p['description'], style: const TextStyle(color: AppColors.soft))),
          const SizedBox(height: 12),
          InfoRow(icon: Icons.category_outlined, text: '${p['projectType']} project'),
          InfoRow(icon: Icons.event_outlined, text: 'Deadline ${mediumDate(DateTime.tryParse(p['deadline'] ?? ''))}'),
          InfoRow(icon: Icons.schedule_outlined, text: '${p['hoursPerWeek']} hours a week${p['teamSize'] != null ? ' · team of ${p['teamSize']}' : ''}'),
          if (p['technologies'] != null) InfoRow(icon: Icons.code_rounded, text: 'You know: ${p['technologies']}'),
          if (((p['milestones'] as num?) ?? 0) > 0) InfoRow(icon: Icons.flag_outlined, text: '${p['done']} of ${p['milestones']} milestones done${((p['overdue'] as num?) ?? 0) > 0 ? ' · ${p['overdue']} overdue' : ''}'),
          const SizedBox(height: 8),
          const Text('The mentor remembers this chat. It is also used for the "Concerns and solutions" section of your report.', style: TextStyle(color: AppColors.faint, fontSize: 12.5)),
        ]));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Mentor chat'),
            if (_title != null) Text(_title!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5, color: AppColors.soft, fontWeight: FontWeight.w500)),
          ]),
          actions: [IconButton(onPressed: _showProject, tooltip: 'Project details', icon: const Icon(Icons.info_outline_rounded))],
        ),
        body: Column(children: [
          if (!_planned)
            Container(
              color: Colors.white,
              padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
              child: Row(children: [
                TextButton.icon(onPressed: () => context.canPop() ? context.pop() : context.go('/roadmaps/new'), icon: const Icon(Icons.arrow_back_rounded, size: 18), label: const Text('Back')),
                const Spacer(),
                const Text('Step 3 of 4', style: TextStyle(color: AppColors.faint, fontWeight: FontWeight.w700, fontSize: 12.5)),
                const SizedBox(width: 8),
              ]),
            ),
          Expanded(
            child: ListView.builder(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 16),
              itemCount: _messages.length + (_thinking ? 1 : 0),
              itemBuilder: (_, i) {
                if (i == _messages.length) return const _Bubble(mine: false, text: null);
                final m = _messages[i];
                return _Bubble(mine: m['role'] == 'user', text: m['content'] as String?);
              },
            ),
          ),
          if (_suggestions.isNotEmpty && !_thinking)
            SizedBox(height: 46, child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12), children: [
              for (final s in _suggestions) Padding(padding: const EdgeInsets.only(right: 8, bottom: 6), child: ActionChip(
                label: Text(s), onPressed: () => _send(s),
                backgroundColor: Colors.white, side: const BorderSide(color: AppColors.accent), labelStyle: const TextStyle(color: AppColors.accent, fontWeight: FontWeight.w700),
              )),
            ])),
          if (!_planned)
            Container(
              color: Colors.white,
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: Row(children: [
                Expanded(child: Text(_ready ? 'The mentor has enough to plan well.' : 'Answer a couple of questions for a better plan.', style: const TextStyle(color: AppColors.soft, fontSize: 13))),
                FilledButton(
                  style: FilledButton.styleFrom(minimumSize: const Size(10, 42), backgroundColor: _ready ? AppColors.accent : AppColors.ink),
                  onPressed: _generating || _messages.isEmpty ? null : _generate,
                  child: Text(_generating ? 'Building…' : 'Generate roadmap'),
                ),
              ]),
            ),
          Container(
            color: Colors.white,
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                child: Row(children: [
                  Expanded(child: TextField(
                    controller: _input,
                    minLines: 1,
                    maxLines: 5,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: InputDecoration(hintText: 'Ask your mentor anything…', filled: true, fillColor: AppColors.bg, border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none), contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12)),
                  )),
                  const SizedBox(width: 8),
                  IconButton.filled(onPressed: _thinking ? null : () => _send(), style: IconButton.styleFrom(backgroundColor: AppColors.ink, minimumSize: const Size(48, 48)), icon: const Icon(Icons.arrow_upward_rounded)),
                ]),
              ),
            ),
          ),
        ]),
      );
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.mine, required this.text});
  final bool mine;
  final String? text;
  @override
  Widget build(BuildContext context) => Row(
        mainAxisAlignment: mine ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!mine) Padding(padding: const EdgeInsets.only(right: 8, bottom: 10), child: CircleAvatar(radius: 15, backgroundColor: Colors.white, child: Image.asset('assets/images/logo-mark.png', width: 22))),
          Flexible(child: Container(
            margin: const EdgeInsets.only(bottom: 10),
            constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.82),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            decoration: BoxDecoration(
              color: mine ? AppColors.accent : const Color(0xFFF3EFE6),
              borderRadius: BorderRadius.only(topLeft: const Radius.circular(18), topRight: const Radius.circular(18), bottomLeft: Radius.circular(mine ? 18 : 4), bottomRight: Radius.circular(mine ? 4 : 18)),
            ),
            child: text == null
                ? const SizedBox(width: 36, height: 16, child: Center(child: LinearProgressIndicator(minHeight: 3)))
                : mine ? Text(text!, style: const TextStyle(color: Colors.white, height: 1.45, fontSize: 15)) : MarkdownText(text!),
          )),
        ],
      );
}

/* ======================= detail ======================= */

class RoadmapDetailScreen extends StatefulWidget {
  const RoadmapDetailScreen({super.key, required this.id});
  final String id;
  @override
  State<RoadmapDetailScreen> createState() => _RoadmapDetailScreenState();
}

class _RoadmapDetailScreenState extends State<RoadmapDetailScreen> {
  Map<String, dynamic>? _r;
  String? _error;
  bool _busy = false;

  @override
  void initState() { super.initState(); _load(); }

  bool _showSummary = true;
  bool _justAccepted = false;

  Future<void> _load() async {
    try {
      final r = await api.roadmap(widget.id);
      if (mounted) setState(() { _r = r; _error = null; });
      // Accepted before summaries existed: build it once.
      if (r['status'] == 'Accepted' && r['summary'] == null) {
        api.roadmapSummary(widget.id).then((s) { if (mounted) setState(() => _r!['summary'] = s); }).catchError((_) {});
      }
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  Future<void> _replan() async {
    setState(() => _busy = true);
    try { await api.plan(widget.id, title: _r?['title'], summary: _r?['description']); await _load(); }
    catch (e) { if (mounted) showSnack(context, errorText(e)); }
    finally { if (mounted) setState(() => _busy = false); }
  }

  Future<void> _decide(bool accept) async {
    if (!accept && !await confirm(context, title: 'Ask for a different plan?', message: 'The current plan is set aside. Tell the mentor what to change, then generate a new plan.', ok: 'Ask for changes')) return;
    setState(() => _busy = true);
    try {
      accept ? await api.acceptRoadmap(_r!['id']) : await api.reviseRoadmap(_r!['id']);
      await _load();
      if (accept) setState(() { _justAccepted = true; _showSummary = true; });
      if (mounted) showSnack(context, accept ? 'Roadmap accepted. Here is your summary.' : 'Revision requested.');
    } catch (e) {
      if (mounted) showSnack(context, errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _report() async {
    showSnack(context, 'Preparing your PDF report…');
    try {
      final bytes = await api.roadmapReport(widget.id);
      final msg = await saveAndOpen(bytes, '${(_r?['title'] ?? 'project').toString().replaceAll(' ', '_')}_report.pdf');
      if (mounted) showSnack(context, msg);
    } catch (e) {
      if (mounted) showSnack(context, errorText(e));
    }
  }

  Future<void> _status(Map m) async {
    final picked = await showAppSheet<String>(context, (ctx) => Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            PhaseTag(m['phase']),
            const SizedBox(height: 8),
            Text(m['title'], style: Theme.of(ctx).textTheme.titleLarge),
            if ((m['description'] as String?)?.isNotEmpty ?? false) ...[const SizedBox(height: 8), Text(m['description'], style: Theme.of(ctx).textTheme.bodyMedium)],
            const SizedBox(height: 8),
            InfoRow(icon: Icons.event_outlined, text: 'Due ${longDate(parseDay(m['dueDate']))}'),
            if ((m['resources'] as List?)?.isNotEmpty ?? false) ...[
              const SizedBox(height: 14),
              const Text('Helpful resources', style: TextStyle(fontWeight: FontWeight.w700)),
              ...(m['resources'] as List).map((r) => ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    leading: const Icon(Icons.link_rounded, color: AppColors.accent),
                    title: Text(r['title'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(r['topic'] ?? ''),
                    onTap: () => openLink(r['url']),
                  )),
            ],
            if (_r?['status'] == 'Accepted') ...[
              const SizedBox(height: 16),
              const Text('Update status', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final (v, l) in [('NotStarted', 'Not started'), ('InProgress', 'In progress'), ('Blocked', 'Blocked'), ('Done', 'Done')])
                  ChoiceChip(label: Text(l), selected: m['status'] == v, onSelected: (_) => Navigator.pop(ctx, v)),
              ]),
            ],
          ]),
        ));
    if (picked == null || picked == m['status']) return;
    try {
      await api.setMilestoneStatus(m['id'], picked);
      await _load();
      if (mounted && picked == 'Done') showSnack(context, 'Nice work — milestone done!');
    } catch (e) {
      if (mounted) showSnack(context, errorText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_r == null) {
      return Scaffold(appBar: AppBar(), body: Padding(padding: const EdgeInsets.all(20), child: _error != null ? ErrorView(message: _error!, onRetry: _load) : const LoadingView()));
    }
    final r = _r!;
    final ms = (r['milestones'] as List? ?? []).cast<Map>();
    final accepted = r['status'] == 'Accepted';
    final pending = r['status'] == 'PendingApproval';
    final done = ms.where((m) => m['status'] == 'Done').length;
    final pct = ms.isEmpty ? 0.0 : done * 100 / ms.length;

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(r['title'] ?? 'Roadmap', maxLines: 1, overflow: TextOverflow.ellipsis),
          actions: [
            PopupMenuButton<String>(
              onSelected: (v) {
                if (v == 'chat') context.push('/roadmaps/${widget.id}/chat');
                if (v == 'viva') context.push('/viva/new?roadmap=${widget.id}');
                if (v == 'pdf') _report();
                if (v == 'agents') context.push('/roadmaps/${widget.id}/agents');
              },
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'chat', child: Text('Mentor conversation')),
                const PopupMenuItem(value: 'viva', child: Text('Practise viva for this project')),
                if (accepted) const PopupMenuItem(value: 'pdf', child: Text('Download PDF report')),
                const PopupMenuItem(value: 'agents', child: Text('How the AI built this')),
              ],
            ),
          ],
          bottom: const TabBar(tabs: [Tab(text: 'Milestones'), Tab(text: 'Calendar')]),
        ),
        body: TabBarView(children: [
          RefreshIndicator(
            onRefresh: _load,
            child: ListView(padding: const EdgeInsets.fromLTRB(20, 16, 20, 32), children: [
              if (accepted && r['summary'] != null && _showSummary) ...[_SummaryCard(summary: r['summary'] as Map, first: _justAccepted, onHide: () => setState(() => _showSummary = false)), const SizedBox(height: 12)],
              if (accepted && r['summary'] != null && !_showSummary) Align(alignment: Alignment.centerLeft, child: TextButton.icon(onPressed: () => setState(() => _showSummary = true), icon: const Icon(Icons.summarize_outlined, size: 18), label: const Text('Show the roadmap summary'))),
              if (accepted && ms.any(_overdue))
                Padding(padding: const EdgeInsets.only(bottom: 12), child: AppCard(
                  color: const Color(0xFFFFF4F2), borderColor: const Color(0x55B0391F),
                  child: Row(children: [
                    const Icon(Icons.error_outline_rounded, color: AppColors.danger),
                    const SizedBox(width: 10),
                    Expanded(child: Text('${ms.where(_overdue).length} milestone${ms.where(_overdue).length == 1 ? ' is' : 's are'} overdue. Finish ${ms.where(_overdue).length == 1 ? 'it' : 'them'} or update the status.', style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700))),
                  ]),
                )),
              if (r['status'] == 'Draft' || r['requestStatus'] == 'RevisionRequested')
                Padding(padding: const EdgeInsets.only(bottom: 12), child: AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('You asked for changes', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const Text('Tell the mentor what to change, then generate a new plan.', style: TextStyle(color: AppColors.soft)),
                  const SizedBox(height: 10),
                  Row(children: [
                    Expanded(child: OutlinedButton(onPressed: () => context.push('/roadmaps/${widget.id}/chat'), child: const Text('Talk to mentor'))),
                    const SizedBox(width: 8),
                    Expanded(child: FilledButton(onPressed: _busy ? null : _replan, child: Text(_busy ? 'Building…' : 'New plan'))),
                  ]),
                ]))),
              AppCard(
                child: Row(children: [
                  ProgressRing(percent: pct, size: 70, stroke: 7),
                  const SizedBox(width: 16),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    StatusPill(r['status']),
                    const SizedBox(height: 8),
                    Text('$done of ${ms.length} milestones done', style: const TextStyle(fontWeight: FontWeight.w700)),
                    if (ms.any(_overdue)) Text('${ms.where(_overdue).length} overdue', style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600)),
                  ])),
                ]),
              ),
              if (pending) ...[
                const SizedBox(height: 12),
                AppCard(
                  color: const Color(0xFFEAF4F2),
                  borderColor: AppColors.teal,
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Review your roadmap', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                    const SizedBox(height: 4),
                    const Text('Accept it to start tracking your milestones.', style: TextStyle(color: AppColors.soft)),
                    const SizedBox(height: 12),
                    FilledButton(onPressed: _busy ? null : () => _decide(true), child: const Text('Accept this roadmap')),
                  ]),
                ),
              ],
              if (accepted) ...[
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(child: OutlinedButton.icon(onPressed: _report, icon: const Icon(Icons.picture_as_pdf_outlined, size: 20), label: const Text('PDF report'))),
                  const SizedBox(width: 10),
                  Expanded(child: OutlinedButton.icon(onPressed: () => context.push('/viva/new?roadmap=${widget.id}'), icon: const Icon(Icons.record_voice_over_outlined, size: 20), label: const Text('Mock viva'))),
                ]),
              ],
              const SectionTitle('Milestones'),
              if (accepted) const Padding(padding: EdgeInsets.only(bottom: 10), child: Text('Tap a milestone to update its status.', style: TextStyle(color: AppColors.faint, fontSize: 13))),
              ...ms.asMap().entries.map((e) => _MilestoneTile(m: e.value, last: e.key == ms.length - 1, onTap: () => _status(e.value))),
            ]),
          ),
          MilestoneCalendar(milestones: ms, onOpen: _status),
        ]),
      ),
    );
  }
}

bool _overdue(Map m) => m['isOverdue'] == true || (m['status'] != 'Done' && (parseDay(m['dueDate'])?.isBefore(today()) ?? false));

/// The summary shown after accepting a roadmap (and at the top of the roadmap afterwards).
class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.summary, required this.first, required this.onHide});
  final Map summary;
  final bool first;
  final VoidCallback onHide;
  @override
  Widget build(BuildContext context) {
    final phases = ((summary['phases'] as List?) ?? const []).cast<Map>();
    List<String> list(String k) => ((summary[k] as List?) ?? const []).cast<String>();
    Widget section(String title, List<String> items) => items.isEmpty ? const SizedBox.shrink() : Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
            for (final i in items) Padding(padding: const EdgeInsets.only(top: 4), child: Text('•  $i', style: const TextStyle(color: Color(0xFFDCE4EE), height: 1.4))),
          ]),
        );
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(gradient: const LinearGradient(colors: [AppColors.ink, Color(0xFF1F4F66)]), borderRadius: BorderRadius.circular(18), border: first ? Border.all(color: AppColors.sun, width: 2) : null),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(first ? 'ROADMAP ACCEPTED' : 'ROADMAP SUMMARY', style: const TextStyle(color: AppColors.sun, fontWeight: FontWeight.w800, fontSize: 11.5, letterSpacing: 1.2))),
          GestureDetector(onTap: onHide, child: const Text('Hide', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w700))),
        ]),
        const SizedBox(height: 6),
        Text(summary['overview'] ?? '', style: const TextStyle(color: Colors.white, height: 1.5, fontSize: 15)),
        if (phases.isNotEmpty) ...[
          const SizedBox(height: 12),
          for (final ph in phases)
            Container(margin: const EdgeInsets.only(bottom: 6), padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: Colors.white.withValues(alpha: .08), borderRadius: BorderRadius.circular(10)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [Expanded(child: Text(ph['name'] ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800))), Text(ph['dates'] ?? '', style: const TextStyle(color: AppColors.sun, fontWeight: FontWeight.w700, fontSize: 12))]),
                  if (ph['focus'] != null) Text(ph['focus'], style: const TextStyle(color: Color(0xFFC9D4E0), fontSize: 13)),
                ])),
        ],
        section('Do this week', list('firstSteps')),
        section('Tips', list('tips')),
        section('Watch out for', list('risks')),
      ]),
    );
  }
}

class _MilestoneTile extends StatelessWidget {
  const _MilestoneTile({required this.m, required this.last, required this.onTap});
  final Map m;
  final bool last;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final done = m['status'] == 'Done';
    final c = AppColors.phase(m['phase']);
    final due = parseDay(m['dueDate']);
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        SizedBox(
          width: 28,
          child: Column(children: [
            Container(
              width: 22, height: 22, margin: const EdgeInsets.only(top: 18),
              decoration: BoxDecoration(color: done ? AppColors.success : Colors.white, shape: BoxShape.circle, border: Border.all(color: done ? AppColors.success : c, width: 2)),
              child: done ? const Icon(Icons.check_rounded, size: 14, color: Colors.white) : null,
            ),
            if (!last) Expanded(child: Container(width: 2, color: AppColors.line)),
          ]),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: AppCard(
              onTap: onTap,
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [PhaseTag(m['phase']), const Spacer(), StatusPill(m['status'], overdue: _overdue(m))]),
                const SizedBox(height: 8),
                Text(m['title'] ?? '', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, decoration: done ? TextDecoration.lineThrough : null, color: done ? AppColors.faint : AppColors.ink)),
                const SizedBox(height: 4),
                InfoRow(icon: Icons.event_outlined, text: '${mediumDate(due)} · ${due == null ? '' : countdown(daysUntil(due), done: done)}', color: _overdue(m) ? AppColors.danger : AppColors.soft),
              ]),
            ),
          ),
        ),
      ]),
    );
  }
}

/// Month calendar with every milestone on its due date, plus an agenda list underneath.
class MilestoneCalendar extends StatefulWidget {
  const MilestoneCalendar({super.key, required this.milestones, required this.onOpen});
  final List<Map> milestones;
  final void Function(Map) onOpen;
  @override
  State<MilestoneCalendar> createState() => _MilestoneCalendarState();
}

class _MilestoneCalendarState extends State<MilestoneCalendar> {
  late DateTime _month;

  @override
  void initState() {
    super.initState();
    final next = widget.milestones.where((m) => m['status'] != 'Done').map((m) => parseDay(m['dueDate'])).whereType<DateTime>().toList()..sort();
    final d = next.isNotEmpty ? next.first : today();
    _month = DateTime(d.year, d.month);
  }

  @override
  Widget build(BuildContext context) {
    final byDay = <String, List<Map>>{};
    for (final m in widget.milestones) {
      final d = parseDay(m['dueDate']);
      if (d != null) byDay.putIfAbsent(dayKey(d), () => []).add(m);
    }
    final first = DateTime(_month.year, _month.month);
    final start = first.subtract(Duration(days: first.weekday - 1));
    final days = List.generate(42, (i) => DateTime(start.year, start.month, start.day + i));
    final inMonth = widget.milestones.where((m) { final d = parseDay(m['dueDate']); return d != null && d.month == _month.month && d.year == _month.year; }).toList();

    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
      Row(children: [
        IconButton.outlined(onPressed: () => setState(() => _month = DateTime(_month.year, _month.month - 1)), icon: const Icon(Icons.chevron_left_rounded)),
        Expanded(child: Text(_monthName(_month), textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge)),
        IconButton.outlined(onPressed: () => setState(() => _month = DateTime(_month.year, _month.month + 1)), icon: const Icon(Icons.chevron_right_rounded)),
      ]),
      const SizedBox(height: 12),
      AppCard(
        padding: const EdgeInsets.all(10),
        child: Column(children: [
          Row(children: [for (final w in ['M', 'T', 'W', 'T', 'F', 'S', 'S']) Expanded(child: Center(child: Text(w, style: const TextStyle(color: AppColors.faint, fontWeight: FontWeight.w700, fontSize: 12))))]),
          const SizedBox(height: 6),
          GridView.count(
            crossAxisCount: 7,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            childAspectRatio: 0.9,
            children: days.map((d) {
              final list = byDay[dayKey(d)] ?? const [];
              final isToday = dayKey(d) == dayKey(today());
              final out = d.month != _month.month;
              return InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: list.isEmpty ? null : () => widget.onOpen(list.first),
                child: Container(
                  margin: const EdgeInsets.all(2),
                  decoration: BoxDecoration(color: list.isNotEmpty ? AppColors.phase(list.first['phase']).withValues(alpha: 0.12) : null, borderRadius: BorderRadius.circular(10)),
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Container(
                      width: 26, height: 26, alignment: Alignment.center,
                      decoration: BoxDecoration(color: isToday ? AppColors.accent : null, shape: BoxShape.circle),
                      child: Text('${d.day}', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: isToday ? Colors.white : out ? AppColors.line : AppColors.ink)),
                    ),
                    if (list.isNotEmpty)
                      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                        for (final m in list.take(3)) Container(width: 6, height: 6, margin: const EdgeInsets.symmetric(horizontal: 1, vertical: 2),
                            decoration: BoxDecoration(color: m['status'] == 'Done' ? AppColors.success : _overdue(m) ? AppColors.danger : AppColors.phase(m['phase']), shape: BoxShape.circle)),
                      ]),
                  ]),
                ),
              );
            }).toList(),
          ),
        ]),
      ),
      const SectionTitle('This month'),
      if (inMonth.isEmpty) const Text('No deadlines this month.', style: TextStyle(color: AppColors.soft)),
      ...inMonth.map((m) {
        final d = parseDay(m['dueDate'])!;
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: AppCard(
            onTap: () => widget.onOpen(m),
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              Container(
                width: 50, height: 50, alignment: Alignment.center,
                decoration: BoxDecoration(color: AppColors.phase(m['phase']).withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Text('${d.day}', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: AppColors.phase(m['phase']), height: 1)),
                  Text(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][d.weekday - 1], style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.phase(m['phase']))),
                ]),
              ),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(m['title'] ?? '', style: const TextStyle(fontWeight: FontWeight.w700)),
                Text('${m['phase']} · ${countdown(daysUntil(d), done: m['status'] == 'Done')}', style: TextStyle(fontSize: 13, color: _overdue(m) ? AppColors.danger : AppColors.soft)),
              ])),
            ]),
          ),
        );
      }),
    ]);
  }

  static String _monthName(DateTime d) => '${const ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.month - 1]} ${d.year}';
}

/// How the four agents built this roadmap, described for this specific project.
class AgentsScreen extends StatelessWidget {
  const AgentsScreen({super.key, required this.id});
  final String id;
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('How the AI built this')),
        body: FutureBuilder<Map<String, dynamic>>(
          future: api.execution(id),
          builder: (_, s) {
            if (s.hasError) return Padding(padding: const EdgeInsets.all(20), child: ErrorView(message: errorText(s.error!), onRetry: () {}));
            if (!s.hasData) return const LoadingView();
            final agents = ((s.data!['agents'] as List?) ?? const []).cast<Map>();
            return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
              const Text('Four agents worked on this roadmap one after another. Here is what each one did for your project.', style: TextStyle(color: AppColors.soft)),
              const SizedBox(height: 12),
              for (final (i, a) in agents.indexed)
                Padding(padding: const EdgeInsets.only(bottom: 12), child: AppCard(child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  CircleAvatar(radius: 18, backgroundColor: AppColors.ink, child: Text('${i + 1}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800))),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Text(a['title'] ?? '', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
                      StatusPill(a['status'] == 'Success' ? 'Done' : (a['status'] ?? '')),
                    ]),
                    Text(a['role'] ?? '', style: const TextStyle(color: AppColors.faint, fontSize: 12.5)),
                    const SizedBox(height: 8),
                    Text(a['summary'] ?? '', style: const TextStyle(height: 1.45)),
                    for (final d in ((a['details'] as List?) ?? const []).cast<String>())
                      Padding(padding: const EdgeInsets.only(top: 4), child: Text('•  $d', style: const TextStyle(color: AppColors.soft, fontSize: 13))),
                  ])),
                ]))),
            ]);
          },
        ),
      );
}

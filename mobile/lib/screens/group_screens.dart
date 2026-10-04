import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:share_plus/share_plus.dart';

import '../core/api.dart';
import '../core/config.dart';
import '../core/format.dart';
import '../core/session.dart';
import '../core/theme.dart';
import '../core/widgets.dart';

Color groupColor(dynamic s) {
  final v = int.tryParse((s as String? ?? '#1F6F7F').replaceFirst('#', ''), radix: 16) ?? 0x1F6F7F;
  return Color(0xFF000000 | v);
}

/// Accepts a full invite link (…/join/<code>) or just the code.
String? inviteCodeFrom(String text) {
  final t = text.trim();
  final m = RegExp(r'/join/([A-Za-z0-9_-]{10,})').firstMatch(t);
  if (m != null) return m.group(1);
  return RegExp(r'^[A-Za-z0-9_-]{10,}$').hasMatch(t) ? t : null;
}

/* ======================= list ======================= */

class GroupsScreen extends StatefulWidget {
  const GroupsScreen({super.key});
  @override
  State<GroupsScreen> createState() => _GroupsScreenState();
}

class _GroupsScreenState extends State<GroupsScreen> {
  List? _groups;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final g = await api.groups();
      if (mounted) setState(() { _groups = g; _error = null; });
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  Future<void> _create() async {
    final id = await showAppSheet<String>(context, (_) => const _CreateGroupSheet());
    if (id != null && mounted) { context.push('/groups/$id?invite=1').then((_) => _load()); _load(); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        floatingActionButton: FloatingActionButton.extended(
          onPressed: _create,
          backgroundColor: AppColors.ink,
          foregroundColor: Colors.white,
          icon: const Icon(Icons.add_rounded),
          label: const Text('New group', style: TextStyle(fontWeight: FontWeight.w700)),
        ),
        body: HeroPage(
          onRefresh: _load,
          header: const PageHeader(eyebrow: 'Project groups', title: 'Build it together', subtitle: 'Private groups with a shared roadmap, a weekly sprint board and chat.'),
          children: [
            AppCard(
              onTap: () => context.push('/join').then((_) => _load()),
              child: const Row(children: [
                Icon(Icons.link_rounded, color: AppColors.accent),
                SizedBox(width: 12),
                Expanded(child: Text('Got an invite link or code? Tap to join a group.', style: TextStyle(fontWeight: FontWeight.w600))),
                Icon(Icons.chevron_right_rounded, color: AppColors.faint),
              ]),
            ),
            const SectionTitle('Your groups'),
            if (_error != null && _groups == null) ErrorView(message: _error!, onRetry: _load)
            else if (_groups == null) const LoadingView()
            else if (_groups!.isEmpty)
              EmptyState(icon: Icons.groups_outlined, title: 'You are not in a group yet', message: 'Create one for your team, or ask a teammate for their invite link.', action: 'Create a group', onAction: _create)
            else
              ..._groups!.map((g) => Padding(padding: const EdgeInsets.only(bottom: 12), child: _GroupTile(g: g as Map, onBack: _load))),
            const SizedBox(height: 70),
          ],
        ),
      );
}

class _GroupTile extends StatelessWidget {
  const _GroupTile({required this.g, required this.onBack});
  final Map g;
  final VoidCallback onBack;
  @override
  Widget build(BuildContext context) {
    final open = g['openTasks'] as int? ?? 0, done = g['doneTasks'] as int? ?? 0, total = open + done;
    final c = groupColor(g['color']);
    return AppCard(
      onTap: () => context.push('/groups/${g['id']}').then((_) => onBack()),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(width: 44, height: 44, alignment: Alignment.center, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(12)),
              child: Text((g['name'] as String).substring(0, 1).toUpperCase(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18))),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(g['name'], style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            Text('${g['myRole'] == 'Owner' ? 'Owner' : 'Member'} · ${g['memberCount']} member${g['memberCount'] == 1 ? '' : 's'}', style: const TextStyle(color: AppColors.soft, fontSize: 13)),
          ])),
          if (g['lastMessageAt'] != null) Text(timeAgo(parseDate(g['lastMessageAt'])), style: const TextStyle(color: AppColors.faint, fontSize: 12)),
        ]),
        const SizedBox(height: 12),
        InfoRow(icon: Icons.map_outlined, text: g['roadmapTitle'] ?? 'No roadmap linked yet'),
        if (g['lastMessagePreview'] != null) ...[const SizedBox(height: 4), InfoRow(icon: Icons.chat_bubble_outline_rounded, text: g['lastMessagePreview'])],
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: ClipRRect(borderRadius: BorderRadius.circular(6), child: LinearProgressIndicator(value: total == 0 ? 0 : done / total, minHeight: 7, color: c))),
          const SizedBox(width: 10),
          Text(total == 0 ? 'No tasks' : '$done/$total', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
        ]),
      ]),
    );
  }
}

class _CreateGroupSheet extends StatefulWidget {
  const _CreateGroupSheet();
  @override
  State<_CreateGroupSheet> createState() => _CreateGroupSheetState();
}

class _CreateGroupSheetState extends State<_CreateGroupSheet> {
  final _name = TextEditingController();
  final _desc = TextEditingController();
  String? _roadmap;
  List? _roadmaps;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    api.roadmaps().then((r) { if (mounted) setState(() => _roadmaps = r.where((x) => x['roadmapStatus'] == 'Accepted').toList()); }).catchError((_) {});
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) { showSnack(context, 'Give your group a name.'); return; }
    setState(() => _busy = true);
    try {
      final g = await api.createGroup(_name.text.trim(), _desc.text.trim().isEmpty ? null : _desc.text.trim(), _roadmap);
      if (mounted) Navigator.pop(context, g['id'] as String);
    } catch (e) {
      if (mounted) { showSnack(context, errorText(e)); setState(() => _busy = false); }
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Create a group', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 16),
          TextField(controller: _name, autofocus: true, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Group name', hintText: 'e.g. Team FindIt – Group 07')),
          const SizedBox(height: 12),
          TextField(controller: _desc, maxLines: 2, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(labelText: 'Short description (optional)')),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _roadmap,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Shared roadmap', helperText: 'The AI plans weekly tasks from this roadmap.'),
            items: [
              const DropdownMenuItem(value: null, child: Text('Choose later')),
              for (final r in _roadmaps ?? []) DropdownMenuItem(value: r['id'] as String, child: Text(r['displayTitle'], overflow: TextOverflow.ellipsis)),
            ],
            onChanged: (v) => setState(() => _roadmap = v),
          ),
          const SizedBox(height: 18),
          FilledButton(onPressed: _busy ? null : _save, child: Text(_busy ? 'Creating…' : 'Create group')),
        ]),
      );
}

/* ======================= join ======================= */

class JoinGroupScreen extends StatefulWidget {
  const JoinGroupScreen({super.key, this.code});
  final String? code;
  @override
  State<JoinGroupScreen> createState() => _JoinGroupScreenState();
}

class _JoinGroupScreenState extends State<JoinGroupScreen> {
  final _input = TextEditingController();
  Map<String, dynamic>? _preview;
  String? _code;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.code != null) { _input.text = widget.code!; _check(); }
  }

  Future<void> _check() async {
    final code = inviteCodeFrom(_input.text);
    if (code == null) { setState(() => _error = 'That does not look like an invite link or code.'); return; }
    setState(() { _busy = true; _error = null; _code = code; });
    try {
      final p = await api.previewInvite(code);
      if (mounted) setState(() => _preview = p);
      // Just signed up / logged in from this invite link → join straight away.
      if (mounted && session.autoJoinInvite == code && p['valid'] == true && p['alreadyMember'] != true) {
        session.autoJoinInvite = null;
        await _join();
        return;
      }
      session.autoJoinInvite = null;
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _join() async {
    setState(() => _busy = true);
    try {
      final id = await api.joinGroup(_code!);
      if (mounted) { showSnack(context, 'Welcome to the group!'); context.pushReplacement('/groups/$id'); }
    } catch (e) {
      if (mounted) setState(() { _error = errorText(e); _busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _preview;
    return Scaffold(
      appBar: AppBar(title: const Text('Join a group')),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        if (p == null) ...[
          const Text('Paste the invite link or code your teammate shared with you.', style: TextStyle(color: AppColors.soft, fontSize: 15)),
          const SizedBox(height: 16),
          TextField(controller: _input, decoration: const InputDecoration(labelText: 'Invite link or code', prefixIcon: Icon(Icons.link_rounded)), onSubmitted: (_) => _check()),
          const SizedBox(height: 16),
          FilledButton(onPressed: _busy ? null : _check, child: Text(_busy ? 'Checking…' : 'Continue')),
        ] else if (p['valid'] == true) ...[
          AppCard(
            padding: const EdgeInsets.all(24),
            child: Column(children: [
              Container(width: 72, height: 72, alignment: Alignment.center, decoration: BoxDecoration(color: groupColor(p['color']), borderRadius: BorderRadius.circular(20)),
                  child: Text((p['groupName'] as String).substring(0, 1).toUpperCase(), style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w800))),
              const SizedBox(height: 14),
              const Eyebrow('You are invited to join'),
              Text(p['groupName'], textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall),
              if (p['description'] != null) ...[const SizedBox(height: 8), Text(p['description'], textAlign: TextAlign.center, style: const TextStyle(color: AppColors.soft))],
              const SizedBox(height: 8),
              Text('Created by ${p['ownerName']} · ${p['memberCount']} members', style: const TextStyle(color: AppColors.faint)),
              const SizedBox(height: 20),
              if (p['alreadyMember'] == true)
                FilledButton(onPressed: () => context.pushReplacement('/groups/${p['groupId']}'), child: const Text('Open the group'))
              else
                SizedBox(width: double.infinity, child: FilledButton(onPressed: _busy ? null : _join, child: Text(_busy ? 'Joining…' : 'Join ${p['groupName']}'))),
              const SizedBox(height: 10),
              Text(p['alreadyMember'] == true
                  ? 'Signed in as ${session.user?.fullName} (${session.user?.email}), who is already a member.'
                  : 'Joining as ${session.user?.fullName} (${session.user?.email}). Members can see your name.',
                  textAlign: TextAlign.center, style: const TextStyle(color: AppColors.faint, fontSize: 12.5)),
              // Logging out sends them to Log in; the router keeps the invite and brings them back here.
              TextButton(onPressed: () => session.logout(), child: const Text('Not you? Log in with a different account')),
            ]),
          ),
        ] else
          EmptyState(icon: Icons.lock_outline_rounded, title: 'This invite cannot be used', message: p['reason'] ?? 'Ask your teammate for a new link.', action: 'Try another link', onAction: () => setState(() => _preview = null)),
        if (_error != null) Padding(padding: const EdgeInsets.only(top: 14), child: Text(_error!, style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600))),
      ]),
    );
  }
}

/* ======================= workspace ======================= */

class GroupWorkspaceScreen extends StatefulWidget {
  const GroupWorkspaceScreen({super.key, required this.id});
  final String id;
  @override
  State<GroupWorkspaceScreen> createState() => _GroupWorkspaceScreenState();
}

class _GroupWorkspaceScreenState extends State<GroupWorkspaceScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 4, vsync: this);
  Map<String, dynamic>? _group;
  Map<String, dynamic>? _board;
  String? _error;
  bool _generating = false;
  int _unread = 0;

  @override
  void initState() {
    super.initState();
    _tabs.addListener(() { if (_tabs.index == 2 && _unread > 0) setState(() => _unread = 0); });
    _load();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (GoRouterState.of(context).uri.queryParameters['invite'] == '1') _invite();
    });
  }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _load() async {
    try {
      final r = await Future.wait([api.group(widget.id), api.board(widget.id)]);
      if (mounted) setState(() { _group = r[0]; _board = r[1]; _error = null; });
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  Future<void> _boardCall(Future<Map<String, dynamic>> f, {String? ok}) async {
    try {
      final b = await f;
      if (mounted) setState(() => _board = b);
      if (ok != null && mounted) showSnack(context, ok);
      api.group(widget.id).then((g) { if (mounted) setState(() => _group = g); });
    } catch (e) {
      if (mounted) showSnack(context, errorText(e));
    }
  }

  Future<void> _generate() async {
    setState(() => _generating = true);
    try {
      final r = await api.generateTasks(widget.id);
      if (mounted) {
        setState(() => _board = Map<String, dynamic>.from(r['board']));
        showSnack(context, (r['created'] as int) > 0 ? 'Planned ${r['created']} tasks${r['source'] == 'AI' ? ' with AI' : ' from templates (AI was busy)'}' : 'Every milestone already has tasks.');
      }
    } catch (e) {
      if (mounted) showSnack(context, errorText(e));
    } finally {
      if (mounted) setState(() => _generating = false);
    }
  }

  Future<void> _openTask([Map? task]) async {
    final result = await showAppSheet<Map<String, dynamic>>(context, (_) => _TaskSheet(task: task, board: _board!));
    if (result == null) return;
    if (result['delete'] == true) return _boardCall(api.deleteTask(widget.id, task!['id']), ok: 'Task deleted');
    if (task == null) return _boardCall(api.createTask(widget.id, result), ok: 'Task added');
    return _boardCall(api.updateTask(widget.id, task['id'], result), ok: 'Task saved');
  }

  Future<void> _assign(Map task) async {
    final members = ((_board?['members'] as List?) ?? const []).cast<Map>();
    final picked = await showPanel<String>(context, (c) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Assign "${task['title']}"', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          for (final m in members)
            ListTile(
              leading: Avatar(name: m['fullName'], initials: m['initials'], seed: m['userId'], size: 36),
              title: Text(m['fullName'] ?? ''),
              trailing: task['assigneeId'] == m['userId'] ? const Icon(Icons.check_rounded, color: AppColors.accent) : null,
              onTap: () => Navigator.pop(c, m['userId'] as String),
            ),
          ListTile(leading: const Icon(Icons.person_off_outlined), title: const Text('Nobody'), onTap: () => Navigator.pop(c, '')),
        ]));
    if (picked == null) return;
    final name = members.where((m) => m['userId'] == picked).map((m) => m['fullName']).firstOrNull;
    return _boardCall(api.updateTask(widget.id, task['id'], picked.isEmpty ? {'clearAssignee': true} : {'assigneeId': picked}), ok: picked.isEmpty ? 'Task unassigned' : 'Assigned to $name');
  }

  void _move(Map task, String status) => _boardCall(api.updateTask(widget.id, task['id'], {'status': status}), ok: status == 'Done' ? 'Nice work — task done!' : null);

  Future<void> _invite() async {
    await showAppSheet(context, (_) => _InviteSheet(groupId: widget.id, groupName: _group?['name'] ?? 'our group'));
  }

  @override
  Widget build(BuildContext context) {
    final g = _group;
    if (g == null || _board == null) {
      return Scaffold(appBar: AppBar(), body: Padding(padding: const EdgeInsets.all(20), child: _error != null ? ErrorView(message: _error!, onRetry: _load) : const LoadingView()));
    }
    final me = session.user?.id;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(children: [
          Container(width: 34, height: 34, alignment: Alignment.center, decoration: BoxDecoration(color: groupColor(g['color']), borderRadius: BorderRadius.circular(10)),
              child: Text((g['name'] as String).substring(0, 1).toUpperCase(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800))),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(g['name'], maxLines: 1, overflow: TextOverflow.ellipsis),
            Text(g['roadmapTitle'] ?? 'No roadmap linked', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: AppColors.soft, fontWeight: FontWeight.w500)),
          ])),
        ]),
        actions: [IconButton(onPressed: _invite, tooltip: 'Invite teammates', icon: const Icon(Icons.person_add_alt_1_outlined))],
        bottom: TabBar(controller: _tabs, isScrollable: false, tabs: [
          const Tab(text: 'Board'),
          const Tab(text: 'Week'),
          Tab(child: Row(mainAxisSize: MainAxisSize.min, children: [
            const Text('Chat'),
            if (_unread > 0) Container(margin: const EdgeInsets.only(left: 6), padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1), decoration: BoxDecoration(color: AppColors.danger, borderRadius: BorderRadius.circular(10)), child: Text('$_unread', style: const TextStyle(color: Colors.white, fontSize: 11))),
          ])),
          const Tab(text: 'Team'),
        ]),
      ),
      body: TabBarView(controller: _tabs, children: [
        _BoardTab(board: _board!, hasRoadmap: g['roadmapRequestId'] != null, me: me, generating: _generating, onGenerate: _generate, onOpen: _openTask, onMove: _move, onAssign: _assign, onRefresh: _load),
        _WeekTab(board: _board!, me: me, onToggle: (t) => _move(t, t['status'] == 'Done' ? 'Todo' : 'Done'), onOpen: _openTask, onRefresh: _load),
        GroupChat(groupId: widget.id, me: me, isActive: () => _tabs.index == 2, onUnread: (n) => setState(() => _unread += n)),
        _TeamTab(group: g, board: _board!, me: me, onInvite: _invite, onChanged: _load),
      ]),
      floatingActionButton: AnimatedBuilder(
        animation: _tabs,
        builder: (_, __) => _tabs.index == 0
            ? FloatingActionButton(onPressed: () => _openTask(), backgroundColor: AppColors.ink, foregroundColor: Colors.white, tooltip: 'Add task', child: const Icon(Icons.add_rounded))
            : const SizedBox.shrink(),
      ),
    );
  }
}

/* ----- Board tab ----- */

class _BoardTab extends StatefulWidget {
  const _BoardTab({required this.board, required this.hasRoadmap, required this.me, required this.generating, required this.onGenerate, required this.onOpen, required this.onMove, required this.onRefresh, this.onAssign});
  final Future<void> Function(Map)? onAssign;
  final Map<String, dynamic> board;
  final bool hasRoadmap, generating;
  final String? me;
  final VoidCallback onGenerate;
  final void Function([Map?]) onOpen;
  final void Function(Map, String) onMove;
  final Future<void> Function() onRefresh;
  @override
  State<_BoardTab> createState() => _BoardTabState();
}

class _BoardTabState extends State<_BoardTab> {
  String _column = 'Todo';
  String? _milestone;
  bool _mine = false;

  static const _cols = [('Todo', 'To do'), ('Doing', 'Doing'), ('Done', 'Done')];

  @override
  Widget build(BuildContext context) {
    final tasks = (widget.board['tasks'] as List).cast<Map>();
    final milestones = (widget.board['milestones'] as List).cast<Map>();
    final current = widget.board['currentWeekStart'] as String;
    bool keep(Map t) => (_milestone == null || t['milestoneId'] == _milestone) && (!_mine || t['assigneeId'] == widget.me);
    final visible = tasks.where((t) => t['status'] == _column && keep(t)).toList()..sort((a, b) => (a['sortOrder'] as int).compareTo(b['sortOrder'] as int));

    return RefreshIndicator(
      onRefresh: widget.onRefresh,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 14, 16, 96), children: [
        if (tasks.isEmpty)
          EmptyState(
            icon: Icons.auto_awesome_outlined,
            title: widget.hasRoadmap ? 'Your board is empty' : 'Link a roadmap to start planning',
            message: widget.hasRoadmap ? 'Let the Sprint Planner break your milestones into small weekly tasks and share them fairly — or add tasks yourself.' : 'Open the Team tab and choose the roadmap your team is building.',
            action: widget.hasRoadmap ? (widget.generating ? 'Planning… (up to 30 s)' : 'Plan my sprints') : null,
            onAction: widget.generating ? null : widget.onGenerate,
          )
        else ...[
          if (milestones.isNotEmpty)
            SizedBox(
              height: 74,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: milestones.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) {
                  final m = milestones[i];
                  final c = AppColors.phase(m['phase']);
                  final on = _milestone == m['id'];
                  final total = m['tasks'] as int, done = m['tasksDone'] as int;
                  return GestureDetector(
                    onTap: () => setState(() => _milestone = on ? null : m['id']),
                    child: Container(
                      width: 140,
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: on ? c : AppColors.line, width: on ? 2 : 1)),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(m['phase'].toString().toUpperCase(), style: TextStyle(color: c, fontWeight: FontWeight.w800, fontSize: 10.5, letterSpacing: 0.8)),
                        const Spacer(),
                        ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: total == 0 ? (m['status'] == 'Done' ? 1 : 0) : done / total, minHeight: 5, color: c)),
                        const SizedBox(height: 4),
                        Text(total == 0 ? 'no tasks yet' : '$done/$total tasks', style: const TextStyle(fontSize: 11.5, color: AppColors.soft)),
                      ]),
                    ),
                  );
                },
              ),
            ),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size(10, 44)),
              onPressed: widget.generating || !widget.hasRoadmap ? null : widget.onGenerate,
              icon: widget.generating ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.auto_awesome_outlined, size: 18),
              label: Text(widget.generating ? 'Planning…' : 'Plan with AI'),
            )),
            const SizedBox(width: 10),
            FilterChip(label: const Text('My tasks'), selected: _mine, onSelected: (v) => setState(() => _mine = v), selectedColor: AppColors.ink, labelStyle: TextStyle(color: _mine ? Colors.white : AppColors.ink, fontWeight: FontWeight.w600)),
          ]),
          const SizedBox(height: 14),
          SegmentedButton<String>(
            showSelectedIcon: false,
            style: SegmentedButton.styleFrom(selectedBackgroundColor: AppColors.ink, selectedForegroundColor: Colors.white, backgroundColor: Colors.white, side: const BorderSide(color: AppColors.line)),
            segments: [for (final (v, l) in _cols) ButtonSegment(value: v, label: Text('$l ${tasks.where((t) => t['status'] == v && keep(t)).length}'))],
            selected: {_column},
            onSelectionChanged: (s) => setState(() => _column = s.first),
          ),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Text(_column == 'Done' ? 'Swipe left to move a task back.' : 'Swipe right to move a task forward. Tap to edit.', style: const TextStyle(color: AppColors.faint, fontSize: 12.5)),
          ),
          if (visible.isEmpty)
            Padding(padding: const EdgeInsets.symmetric(vertical: 30), child: Center(child: Text(_column == 'Done' ? 'Finished tasks will appear here.' : 'Nothing here.', style: const TextStyle(color: AppColors.faint))))
          else
            ...visible.map((t) => _SwipeTask(task: t, current: current, column: _column, onOpen: () => widget.onOpen(t), onMove: widget.onMove, onAssign: widget.onAssign == null ? null : () => widget.onAssign!(t))),
        ],
      ]),
    );
  }
}

class _SwipeTask extends StatelessWidget {
  const _SwipeTask({required this.task, required this.current, required this.column, required this.onOpen, required this.onMove, this.onAssign});
  final VoidCallback? onAssign;
  final Map task;
  final String current, column;
  final VoidCallback onOpen;
  final void Function(Map, String) onMove;
  @override
  Widget build(BuildContext context) {
    final next = column == 'Todo' ? 'Doing' : column == 'Doing' ? 'Done' : null;
    final prev = column == 'Done' ? 'Doing' : column == 'Doing' ? 'Todo' : null;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Dismissible(
        key: ValueKey('${task['id']}-$column'),
        direction: next != null && prev != null ? DismissDirection.horizontal : next != null ? DismissDirection.startToEnd : DismissDirection.endToStart,
        background: _swipeBg(next == null ? '' : 'Move to ${statusLabel(next)}', Alignment.centerLeft, next == 'Done' ? AppColors.success : AppColors.accent),
        secondaryBackground: _swipeBg(prev == null ? '' : 'Back to ${statusLabel(prev)}', Alignment.centerRight, AppColors.soft),
        confirmDismiss: (dir) async {
          final target = dir == DismissDirection.startToEnd ? next : prev;
          if (target != null) onMove(task, target);
          return false; // the board refreshes from the server instead
        },
        child: TaskCard(task: task, current: current, onTap: onOpen, onAssign: onAssign),
      ),
    );
  }

  Widget _swipeBg(String text, Alignment a, Color c) => Container(
        alignment: a,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(16)),
        child: Text(text, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
      );
}

class TaskCard extends StatelessWidget {
  const TaskCard({super.key, required this.task, required this.current, required this.onTap, this.onAssign});
  final VoidCallback? onAssign;
  final Map task;
  final String current;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final late = task['status'] != 'Done' && task['weekStart'] != null && (task['weekStart'] as String).compareTo(current) < 0;
    final done = task['status'] == 'Done';
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      borderColor: late ? AppColors.danger.withValues(alpha: 0.5) : null,
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          if (task['milestonePhase'] != null) PhaseTag(task['milestonePhase']),
          if (task['source'] == 'AI') ...[const SizedBox(width: 6), const Text('AI', style: TextStyle(color: AppColors.gold, fontWeight: FontWeight.w800, fontSize: 11))],
          const Spacer(),
          GestureDetector(
            onTap: onAssign,
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              if (onAssign != null) Text(task['assigneeName'] != null ? '' : 'Assign ', style: const TextStyle(color: AppColors.accent, fontWeight: FontWeight.w700, fontSize: 12.5)),
              task['assigneeName'] != null
                  ? Avatar(name: task['assigneeName'], initials: task['assigneeInitials'], seed: task['assigneeId'], size: 26)
                  : Container(width: 26, height: 26, alignment: Alignment.center, decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: AppColors.faint)), child: const Text('?', style: TextStyle(color: AppColors.faint, fontSize: 12))),
            ]),
          ),
        ]),
        const SizedBox(height: 8),
        Text(task['title'] ?? '', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, decoration: done ? TextDecoration.lineThrough : null, color: done ? AppColors.faint : AppColors.ink)),
        const SizedBox(height: 6),
        Row(children: [
          // Flexible: InfoRow contains a flexible text, so it needs a bounded width inside this row.
          Flexible(child: InfoRow(icon: late ? Icons.schedule_rounded : Icons.event_outlined, text: weekLabel(task['weekStart'], current), color: late ? AppColors.danger : AppColors.soft)),
          if (task['estimateHours'] != null) ...[const SizedBox(width: 14), Flexible(child: InfoRow(icon: Icons.timer_outlined, text: '${(task['estimateHours'] as num).toString().replaceAll('.0', '')} h'))],
        ]),
      ]),
    );
  }
}

class _TaskSheet extends StatefulWidget {
  const _TaskSheet({required this.task, required this.board});
  final Map? task;
  final Map<String, dynamic> board;
  @override
  State<_TaskSheet> createState() => _TaskSheetState();
}

class _TaskSheetState extends State<_TaskSheet> {
  late final _title = TextEditingController(text: widget.task?['title'] ?? '');
  late final _desc = TextEditingController(text: widget.task?['description'] ?? '');
  late final _hours = TextEditingController(text: widget.task?['estimateHours']?.toString().replaceAll('.0', '') ?? '');
  late String _status = widget.task?['status'] ?? 'Todo';
  late String? _assignee = widget.task?['assigneeId'];
  late String? _milestone = widget.task?['milestoneId'];
  late String _week = widget.task?['weekStart'] ?? widget.board['currentWeekStart'];

  @override
  Widget build(BuildContext context) {
    final isNew = widget.task == null;
    final current = parseDay(widget.board['currentWeekStart'])!;
    final weeks = {for (var i = -1; i <= 12; i++) dayKey(current.add(Duration(days: 7 * i))), _week}.toList()..sort();
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(isNew ? 'New task' : 'Edit task', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 14),
          TextField(controller: _title, autofocus: isNew, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(labelText: 'What needs to be done?')),
          const SizedBox(height: 12),
          TextField(controller: _desc, maxLines: 2, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(labelText: 'What “done” means (optional)')),
          const SizedBox(height: 14),
          const Text('Status', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Wrap(spacing: 8, children: [for (final (v, l) in [('Todo', 'To do'), ('Doing', 'Doing'), ('Done', 'Done')]) ChoiceChip(label: Text(l), selected: _status == v, onSelected: (_) => setState(() => _status = v))]),
          const SizedBox(height: 14),
          DropdownButtonFormField<String?>(
            value: _assignee,
            decoration: const InputDecoration(labelText: 'Who'),
            items: [const DropdownMenuItem(value: null, child: Text('Nobody yet')), for (final m in widget.board['members'] as List) DropdownMenuItem(value: m['userId'] as String, child: Text(m['fullName']))],
            onChanged: (v) => setState(() => _assignee = v),
          ),
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: DropdownButtonFormField<String>(
              value: _week,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Sprint week'),
              items: [for (final w in weeks) DropdownMenuItem(value: w, child: Text(weekLabel(w, widget.board['currentWeekStart'])))],
              onChanged: (v) => setState(() => _week = v!),
            )),
            const SizedBox(width: 12),
            SizedBox(width: 110, child: TextField(controller: _hours, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Hours'))),
          ]),
          const SizedBox(height: 12),
          DropdownButtonFormField<String?>(
            value: _milestone,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Milestone'),
            items: [const DropdownMenuItem(value: null, child: Text('Not linked')), for (final m in widget.board['milestones'] as List) DropdownMenuItem(value: m['id'] as String, child: Text('${m['phase']} — ${m['title']}', overflow: TextOverflow.ellipsis))],
            onChanged: (v) => setState(() => _milestone = v),
          ),
          const SizedBox(height: 18),
          FilledButton(
            onPressed: () {
              if (_title.text.trim().isEmpty) { showSnack(context, 'Give the task a title.'); return; }
              final hours = double.tryParse(_hours.text.trim());
              final body = <String, dynamic>{'title': _title.text.trim(), 'description': _desc.text.trim(), 'status': _status, 'estimateHours': hours, 'weekStart': _week};
              if (isNew) { body['assigneeId'] = _assignee; body['milestoneId'] = _milestone; }
              else {
                if (_assignee == null) { body['clearAssignee'] = true; } else { body['assigneeId'] = _assignee; }
                if (_milestone == null) { body['clearMilestone'] = true; } else { body['milestoneId'] = _milestone; }
                if (_status == widget.task!['status']) body.remove('status');
              }
              Navigator.pop(context, body);
            },
            child: Text(isNew ? 'Add task' : 'Save'),
          ),
          if (!isNew) ...[
            const SizedBox(height: 8),
            TextButton(
              onPressed: () async { if (await confirm(context, title: 'Delete task?', message: 'This cannot be undone.', ok: 'Delete', danger: true) && context.mounted) Navigator.pop(context, {'delete': true}); },
              style: TextButton.styleFrom(foregroundColor: AppColors.danger),
              child: const Text('Delete task'),
            ),
          ],
        ]),
      ),
    );
  }
}

/* ----- Week tab ----- */

class _WeekTab extends StatelessWidget {
  const _WeekTab({required this.board, required this.me, required this.onToggle, required this.onOpen, required this.onRefresh});
  final Map<String, dynamic> board;
  final String? me;
  final void Function(Map) onToggle;
  final void Function([Map?]) onOpen;
  final Future<void> Function() onRefresh;
  @override
  Widget build(BuildContext context) {
    final current = board['currentWeekStart'] as String;
    final tasks = (board['tasks'] as List).cast<Map>();
    final week = tasks.where((t) => t['weekStart'] == current || (t['status'] != 'Done' && t['weekStart'] != null && (t['weekStart'] as String).compareTo(current) < 0)).toList();
    final planned = week.fold<num>(0, (s, t) => s + (t['estimateHours'] as num? ?? 0));
    final doneH = week.where((t) => t['status'] == 'Done').fold<num>(0, (s, t) => s + (t['estimateHours'] as num? ?? 0));
    final cap = board['weeklyCapacityHours'] as num?;
    final members = [...(board['members'] as List).cast<Map>(), {'userId': null, 'fullName': 'Unassigned'}];
    final start = parseDay(current)!;

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 40), children: [
        Text('This week’s sprint', style: Theme.of(context).textTheme.headlineSmall),
        Text('${shortDate(start)} – ${shortDate(start.add(const Duration(days: 6)))}', style: const TextStyle(color: AppColors.soft)),
        const SizedBox(height: 14),
        AppCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Text('${_n(doneH)}/${_n(planned)} h done', style: const TextStyle(fontWeight: FontWeight.w800)),
              const Spacer(),
              if (cap != null) Text('Team has ~${_n(cap)} h/week', style: const TextStyle(color: AppColors.soft, fontSize: 13)),
            ]),
            const SizedBox(height: 10),
            ClipRRect(borderRadius: BorderRadius.circular(6), child: LinearProgressIndicator(value: planned == 0 ? 0 : (doneH / planned).toDouble(), minHeight: 9)),
            if (cap != null && planned > cap) const Padding(padding: EdgeInsets.only(top: 8), child: Text('More work is planned than the team usually has time for.', style: TextStyle(color: AppColors.warn, fontSize: 12.5, fontWeight: FontWeight.w600))),
          ]),
        ),
        if (week.isEmpty)
          const Padding(padding: EdgeInsets.only(top: 30), child: Text('No tasks planned for this week. Use “Plan with AI” on the Board.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.soft)))
        else
          for (final m in members)
            if (week.any((t) => t['assigneeId'] == m['userId'])) ...[
              const SizedBox(height: 16),
              Row(children: [
                m['userId'] == null ? const Icon(Icons.help_outline_rounded, color: AppColors.faint) : Avatar(name: m['fullName'], initials: m['initials'], seed: m['userId'], size: 30),
                const SizedBox(width: 10),
                Text(m['userId'] == me ? 'You' : m['fullName'], style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              ]),
              const SizedBox(height: 8),
              AppCard(
                padding: EdgeInsets.zero,
                child: Column(children: [
                  for (final t in week.where((t) => t['assigneeId'] == m['userId']))
                    CheckboxListTile(
                      value: t['status'] == 'Done',
                      onChanged: (_) => onToggle(t),
                      controlAffinity: ListTileControlAffinity.leading,
                      activeColor: AppColors.success,
                      title: Text(t['title'], style: TextStyle(fontWeight: FontWeight.w600, decoration: t['status'] == 'Done' ? TextDecoration.lineThrough : null, color: t['status'] == 'Done' ? AppColors.faint : AppColors.ink)),
                      subtitle: Text([if ((t['weekStart'] as String).compareTo(current) < 0 && t['status'] != 'Done') 'carried over', if (t['status'] == 'Doing') 'in progress', if (t['estimateHours'] != null) '${_n(t['estimateHours'])} h'].join(' · ')),
                      secondary: IconButton(icon: const Icon(Icons.edit_outlined, size: 20), onPressed: () => onOpen(t)),
                    ),
                ]),
              ),
            ],
      ]),
    );
  }
  static String _n(num v) => v % 1 == 0 ? v.toInt().toString() : v.toString();
}

/* ----- Chat tab ----- */

class GroupChat extends StatefulWidget {
  const GroupChat({super.key, required this.groupId, required this.me, required this.isActive, required this.onUnread});
  final String groupId;
  final String? me;
  final bool Function() isActive;
  final void Function(int) onUnread;
  @override
  State<GroupChat> createState() => _GroupChatState();
}

class _GroupChatState extends State<GroupChat> with AutomaticKeepAliveClientMixin {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final List<Map> _messages = [];
  final Set<String> _seen = {};
  String? _last;
  Timer? _timer;
  bool _sending = false;
  bool _loaded = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _poll(first: true);
    _timer = Timer.periodic(const Duration(seconds: 4), (_) => _poll());
  }

  @override
  void dispose() { _timer?.cancel(); super.dispose(); }

  Future<void> _poll({bool first = false}) async {
    try {
      final list = (await api.messages(widget.groupId, after: first ? null : _last)).cast<Map>();
      if (!mounted || list.isEmpty) { if (first && mounted) setState(() => _loaded = true); return; }
      final fresh = list.where((m) => _seen.add(m['id'] as String)).toList();
      final fromOthers = fresh.where((m) => m['senderId'] != widget.me && m['isSystem'] != true).length;
      if (!first && fromOthers > 0 && !widget.isActive()) widget.onUnread(fromOthers);
      _last = list.last['createdAt'];
      setState(() { _messages.addAll(fresh); _loaded = true; });
      _toBottom();
    } catch (_) {/* keep polling quietly */}
  }

  void _toBottom() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
      });

  Future<void> _send({String? uploadId}) async {
    final text = _input.text.trim();
    if (text.isEmpty && uploadId == null) return;
    setState(() => _sending = true);
    try {
      final m = await api.sendMessage(widget.groupId, text, uploadId: uploadId);
      if (_seen.add(m['id'])) setState(() => _messages.add(m));
      _last = m['createdAt'];
      _input.clear();
      _toBottom();
    } catch (e) {
      if (mounted) showSnack(context, errorText(e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _attach() async {
    final file = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1800, imageQuality: 85);
    if (file == null) return;
    setState(() => _sending = true);
    try {
      final up = await api.upload(await file.readAsBytes(), file.name);
      await _send(uploadId: up['id']);
    } catch (e) {
      if (mounted) { showSnack(context, errorText(e)); setState(() => _sending = false); }
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    String? lastDay;
    return Column(children: [
      Expanded(
        child: !_loaded
            ? const LoadingView()
            : _messages.isEmpty
                ? const Center(child: Text('No messages yet. Say hello to your team.', style: TextStyle(color: AppColors.soft)))
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                    itemCount: _messages.length,
                    itemBuilder: (_, i) {
                      final m = _messages[i];
                      final at = parseDate(m['createdAt']);
                      final day = at == null ? '' : (dayKey(at) == dayKey(today()) ? 'Today' : mediumDate(at));
                      final showDay = day != lastDay;
                      lastDay = day;
                      final prev = i > 0 ? _messages[i - 1] : null;
                      final grouped = !showDay && prev != null && prev['isSystem'] != true && prev['senderId'] == m['senderId'];
                      return Column(children: [
                        if (showDay) Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: Text(day, style: const TextStyle(color: AppColors.faint, fontSize: 12, fontWeight: FontWeight.w700))),
                        _ChatMessage(m: m, mine: m['senderId'] == widget.me, grouped: grouped),
                      ]);
                    },
                  ),
      ),
      Container(
        color: Colors.white,
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(6, 8, 10, 8),
            child: Row(children: [
              IconButton(onPressed: _sending ? null : _attach, tooltip: 'Attach a photo', icon: const Icon(Icons.image_outlined, color: AppColors.soft)),
              Expanded(child: TextField(
                controller: _input,
                minLines: 1,
                maxLines: 4,
                textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(hintText: 'Message your team…', filled: true, fillColor: AppColors.bg, border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none), contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12)),
              )),
              const SizedBox(width: 8),
              IconButton.filled(onPressed: _sending ? null : () => _send(), style: IconButton.styleFrom(backgroundColor: AppColors.accent, minimumSize: const Size(46, 46)), icon: const Icon(Icons.send_rounded, size: 20)),
            ]),
          ),
        ),
      ),
    ]);
  }
}

class _ChatMessage extends StatelessWidget {
  const _ChatMessage({required this.m, required this.mine, required this.grouped});
  final Map m;
  final bool mine, grouped;
  @override
  Widget build(BuildContext context) {
    if (m['isSystem'] == true) {
      return Container(
        margin: const EdgeInsets.symmetric(vertical: 6, horizontal: 20),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(color: const Color(0xFFF6EDD8), borderRadius: BorderRadius.circular(20)),
        child: Text(m['content'], textAlign: TextAlign.center, style: const TextStyle(fontSize: 12.5, color: AppColors.soft)),
      );
    }
    final upload = m['upload'] as Map?;
    final at = parseDate(m['createdAt']);
    return Padding(
      padding: EdgeInsets.only(top: grouped ? 2 : 8),
      child: Row(mainAxisAlignment: mine ? MainAxisAlignment.end : MainAxisAlignment.start, crossAxisAlignment: CrossAxisAlignment.end, children: [
        if (!mine) grouped ? const SizedBox(width: 30) : Avatar(name: m['senderName'], initials: m['senderInitials'], seed: m['senderId'], size: 30),
        if (!mine) const SizedBox(width: 8),
        Flexible(
          child: Container(
            constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.74),
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
            decoration: BoxDecoration(
              color: mine ? AppColors.accent : Colors.white,
              border: mine ? null : Border.all(color: AppColors.line),
              borderRadius: BorderRadius.only(topLeft: const Radius.circular(16), topRight: const Radius.circular(16), bottomLeft: Radius.circular(mine ? 16 : 4), bottomRight: Radius.circular(mine ? 4 : 16)),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (!mine && !grouped) Text(m['senderName'] ?? '', style: const TextStyle(color: AppColors.accent, fontWeight: FontWeight.w700, fontSize: 12)),
              if (upload != null && (upload['contentType'] as String).startsWith('image/'))
                Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: ClipRRect(borderRadius: BorderRadius.circular(10), child: Image.network(api.uploadUrl(upload['id']), width: 220, fit: BoxFit.cover))),
              if ((m['content'] as String?)?.isNotEmpty ?? false) Text(m['content'], style: TextStyle(color: mine ? Colors.white : AppColors.ink, height: 1.4, fontSize: 15)),
              Align(alignment: Alignment.centerRight, child: Text(timeOfDay(at), style: TextStyle(fontSize: 10.5, color: mine ? Colors.white70 : AppColors.faint))),
            ]),
          ),
        ),
      ]),
    );
  }
}

/* ----- Team tab ----- */

class _TeamTab extends StatefulWidget {
  const _TeamTab({required this.group, required this.board, required this.me, required this.onInvite, required this.onChanged});
  final Map<String, dynamic> group;
  final Map<String, dynamic> board;
  final String? me;
  final VoidCallback onInvite;
  final Future<void> Function() onChanged;
  @override
  State<_TeamTab> createState() => _TeamTabState();
}

class _TeamTabState extends State<_TeamTab> {
  List? _myRoadmaps;
  bool get _owner => widget.group['myRole'] == 'Owner';

  @override
  void initState() {
    super.initState();
    if (_owner) api.roadmaps().then((r) { if (mounted) setState(() => _myRoadmaps = r.where((x) => x['roadmapStatus'] == 'Accepted').toList()); }).catchError((_) {});
  }

  Future<void> _linkRoadmap(String? id) async {
    try {
      await api.updateGroup(widget.group['id'], id == null ? {'clearRoadmap': true} : {'roadmapRequestId': id});
      await widget.onChanged();
      if (mounted) showSnack(context, id == null ? 'Roadmap unlinked' : 'Roadmap linked — plan your sprint on the Board.');
    } catch (e) { if (mounted) showSnack(context, errorText(e)); }
  }

  Future<void> _remove(Map m) async {
    if (!await confirm(context, title: 'Remove ${m['fullName']}?', message: 'Their unfinished tasks become unassigned.', ok: 'Remove', danger: true)) return;
    try { await api.removeMember(widget.group['id'], m['userId']); await widget.onChanged(); } catch (e) { if (mounted) showSnack(context, errorText(e)); }
  }

  Future<void> _leaveOrDelete() async {
    final owner = _owner;
    if (!await confirm(context, title: owner ? 'Delete this group?' : 'Leave this group?', message: owner ? 'The board and chat are deleted for everyone.' : 'You can only come back with a new invite link.', ok: owner ? 'Delete' : 'Leave', danger: true)) return;
    try {
      owner ? await api.deleteGroup(widget.group['id']) : await api.leaveGroup(widget.group['id']);
      if (mounted) context.pop();
    } catch (e) { if (mounted) showSnack(context, errorText(e)); }
  }

  @override
  Widget build(BuildContext context) {
    final members = (widget.group['members'] as List).cast<Map>();
    final rows = (widget.board['contributions'] as List).cast<Map>();
    return ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 40), children: [
      Row(children: [
        Text('Members', style: Theme.of(context).textTheme.titleLarge),
        const Spacer(),
        FilledButton.icon(onPressed: widget.onInvite, style: FilledButton.styleFrom(minimumSize: const Size(10, 42), backgroundColor: AppColors.accent), icon: const Icon(Icons.person_add_alt_1_outlined, size: 18), label: const Text('Invite')),
      ]),
      const SizedBox(height: 10),
      AppCard(
        padding: EdgeInsets.zero,
        child: Column(children: [
          for (final m in members)
            ListTile(
              leading: Avatar(name: m['fullName'], initials: m['initials'], seed: m['userId']),
              title: Text('${m['fullName']}${m['userId'] == widget.me ? ' (you)' : ''}', style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text('${m['role']} · joined ${timeAgo(parseDate(m['joinedAt']))}'),
              trailing: _owner && m['userId'] != widget.me ? IconButton(icon: const Icon(Icons.person_remove_outlined, color: AppColors.danger), onPressed: () => _remove(m)) : null,
            ),
        ]),
      ),
      const SectionTitle('Contribution record'),
      const Text('Built from finished tasks and chat activity — useful for the team section of your report.', style: TextStyle(color: AppColors.soft, fontSize: 13.5)),
      const SizedBox(height: 10),
      for (final r in rows)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: AppCard(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              Avatar(name: r['fullName'], initials: r['initials'], seed: r['userId'], size: 34),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(r['fullName'], style: const TextStyle(fontWeight: FontWeight.w700)),
                Text('${r['tasksDone']} of ${r['tasksAssigned']} tasks · ${r['hoursDone']} h · ${r['messages']} messages', style: const TextStyle(color: AppColors.soft, fontSize: 12.5)),
              ])),
              ProgressRing(percent: (r['sharePercent'] as num).toDouble(), size: 44, stroke: 4),
            ]),
          ),
        ),
      const SectionTitle('Shared roadmap'),
      if (_owner)
        DropdownButtonFormField<String?>(
          value: widget.group['roadmapRequestId'],
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Roadmap the team is building'),
          items: [
            const DropdownMenuItem(value: null, child: Text('None')),
            for (final r in _myRoadmaps ?? []) DropdownMenuItem(value: r['id'] as String, child: Text(r['displayTitle'], overflow: TextOverflow.ellipsis)),
            if (widget.group['roadmapRequestId'] != null && !(_myRoadmaps ?? []).any((r) => r['id'] == widget.group['roadmapRequestId']))
              DropdownMenuItem(value: widget.group['roadmapRequestId'] as String, child: Text(widget.group['roadmapTitle'] ?? 'Current roadmap')),
          ],
          onChanged: _linkRoadmap,
        )
      else
        Text(widget.group['roadmapTitle'] ?? 'Ask the owner to link the team’s roadmap.', style: const TextStyle(color: AppColors.soft)),
      if ((widget.group['milestones'] as List).isNotEmpty) ...[
        const SizedBox(height: 12),
        for (final m in (widget.group['milestones'] as List).cast<Map>())
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: AppCard(padding: const EdgeInsets.all(12), child: Row(children: [
              PhaseTag(m['phase']),
              const SizedBox(width: 10),
              Expanded(child: Text(m['title'], maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600))),
              StatusPill(m['status']),
            ])),
          ),
      ],
      const SizedBox(height: 26),
      OutlinedButton(onPressed: _leaveOrDelete, style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger), child: Text(_owner ? 'Delete group' : 'Leave group')),
    ]);
  }
}

/* ----- Invite sheet ----- */

class _InviteSheet extends StatefulWidget {
  const _InviteSheet({required this.groupId, required this.groupName});
  final String groupId, groupName;
  @override
  State<_InviteSheet> createState() => _InviteSheetState();
}

class _InviteSheetState extends State<_InviteSheet> {
  Map? _invite;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final list = (await api.invites(widget.groupId)).cast<Map>().where((i) => i['active'] == true).toList();
      final inv = list.isNotEmpty ? list.first : await api.createInvite(widget.groupId);
      if (mounted) setState(() => _invite = inv);
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  String get _link => '${AppConfig.webUrl}/join/${_invite!['token']}';

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Invite your teammates', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 6),
          Text('Share this link. When they open it and log in, they join ${widget.groupName}. In the app they can paste the code under Groups → Join.', style: const TextStyle(color: AppColors.soft)),
          const SizedBox(height: 16),
          if (_error != null) Text(_error!, style: const TextStyle(color: AppColors.danger))
          else if (_invite == null) const LoadingView()
          else ...[
            AppCard(
              color: AppColors.bg2,
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Invite code', style: TextStyle(color: AppColors.faint, fontSize: 12, fontWeight: FontWeight.w700)),
                SelectableText(_invite!['token'], style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                const SizedBox(height: 6),
                Text('Expires ${mediumDate(parseDate(_invite!['expiresAt']))} · used ${_invite!['uses']} times', style: const TextStyle(color: AppColors.faint, fontSize: 12)),
              ]),
            ),
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: () => SharePlus.instance.share(ShareParams(text: 'Join our project group "${widget.groupName}" on ProjectMentor: $_link\n\nIn the app: Groups → Join → paste this code: ${_invite!['token']}', subject: 'Join ${widget.groupName} on ProjectMentor')),
              icon: const Icon(Icons.ios_share_rounded),
              label: const Text('Share invite'),
            ),
            const SizedBox(height: 8),
            const Text('Anyone with the link can join, so only share it with your team.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.faint, fontSize: 12.5)),
          ],
        ]),
      );
}

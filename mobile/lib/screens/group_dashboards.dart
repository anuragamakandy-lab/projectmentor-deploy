import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../core/widgets.dart';

/* Shared helpers. Dates arrive as 'YYYY-MM-DD'. */

/// Whole days from today until that date (0 = today, negative = overdue).
int daysLeft(String iso) {
  final d = parseDay(iso)!;
  final now = DateTime.now();
  return DateTime(d.year, d.month, d.day).difference(DateTime(now.year, now.month, now.day)).inDays;
}

String countdown(String iso) {
  final d = daysLeft(iso);
  return d < 0 ? '${-d} day${d == -1 ? '' : 's'} overdue' : d == 0 ? 'due today' : d == 1 ? 'due tomorrow' : '$d days left';
}

/// A task is due at the end of its sprint week, or on its milestone's date when it has no week.
String? taskDue(Map t, Map board) {
  if (t['weekStart'] != null) {
    final d = parseDay(t['weekStart'])!.add(const Duration(days: 6));
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  }
  final m = (board['milestones'] as List).cast<Map>().where((m) => m['id'] == t['milestoneId']).firstOrNull;
  return m?['dueDate'] as String?;
}

num _hours(Iterable<Map> l) => l.fold<num>(0, (s, t) => s + (t['estimateHours'] as num? ?? 0));
String _n(num v) => v % 1 == 0 ? v.toInt().toString() : v.toString();
Color? _tone(String? iso, {int warnDays = 3}) => iso == null ? null : daysLeft(iso) < 0 ? AppColors.danger : daysLeft(iso) <= warnDays ? AppColors.warn : null;

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value, this.sub, {this.tone, this.progress});
  final String label, value, sub;
  final Color? tone;
  final double? progress;
  @override
  Widget build(BuildContext context) => AppCard(
        padding: const EdgeInsets.all(14),
        borderColor: tone?.withValues(alpha: 0.45),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label.toUpperCase(), style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, letterSpacing: 0.8, color: AppColors.faint)),
          const SizedBox(height: 6),
          Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: tone ?? AppColors.ink)),
          const SizedBox(height: 2),
          Text(sub, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: AppColors.soft)),
          if (progress != null) ...[
            const SizedBox(height: 8),
            ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: progress!.clamp(0, 1), minHeight: 5)),
          ],
        ]),
      );
}

Widget _statGrid(List<Widget> stats) => LayoutBuilder(builder: (_, c) {
      final w = (c.maxWidth - 10) / 2;
      return Wrap(spacing: 10, runSpacing: 10, children: [for (final s in stats) SizedBox(width: w, child: s)]);
    });

/* ======================= Group dashboard (shared) ======================= */

class GroupDashboardTab extends StatefulWidget {
  const GroupDashboardTab({super.key, required this.group, required this.board, required this.me, required this.onInvite, required this.onChanged, required this.onToggle, required this.onOpen});
  final Map<String, dynamic> group;
  final Map<String, dynamic> board;
  final String? me;
  final VoidCallback onInvite;
  final Future<void> Function() onChanged;
  final void Function(Map) onToggle;
  final void Function([Map?]) onOpen;
  @override
  State<GroupDashboardTab> createState() => _GroupDashboardTabState();
}

class _GroupDashboardTabState extends State<GroupDashboardTab> {
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
    final board = widget.board;
    final tasks = (board['tasks'] as List).cast<Map>();
    final done = tasks.where((t) => t['status'] == 'Done').length;
    final doingCount = tasks.where((t) => t['status'] == 'Doing').length;
    final pct = tasks.isEmpty ? 0 : (done * 100 / tasks.length).round();
    final milestones = (board['milestones'] as List).cast<Map>().toList()..sort((a, b) => (a['dueDate'] as String).compareTo(b['dueDate']));
    final finalDate = (widget.group['deadline'] as String?) ?? (milestones.isEmpty ? null : milestones.last['dueDate'] as String);
    final upcoming = milestones.where((m) => m['status'] != 'Done').take(2).toList();
    final current = board['currentWeekStart'] as String;
    final week = tasks.where((t) => t['weekStart'] == current || (t['status'] != 'Done' && t['weekStart'] != null && (t['weekStart'] as String).compareTo(current) < 0)).toList();
    final contrib = {for (final c in (board['contributions'] as List).cast<Map>()) c['userId']: c};
    final members = (widget.group['members'] as List).cast<Map>();
    final left = finalDate == null ? null : daysLeft(finalDate);

    return RefreshIndicator(
      onRefresh: widget.onChanged,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 40), children: [
        IntrinsicHeight(
          child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Expanded(child: _Tile(title: 'Project deadline', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(left == null ? '—' : '${left.abs()}', style: TextStyle(fontSize: 38, height: 1, fontWeight: FontWeight.w800, color: left != null && left < 0 ? AppColors.danger : left != null && left <= 7 ? AppColors.warn : AppColors.ink)),
                const SizedBox(width: 6),
                Flexible(child: Text(left == null ? 'not set' : left < 0 ? 'days overdue' : left == 1 ? 'day left' : 'days left', style: const TextStyle(color: AppColors.soft, fontSize: 13))),
              ]),
              const SizedBox(height: 6),
              Text(finalDate == null ? 'Link a roadmap' : 'Hand-in ${shortDate(parseDay(finalDate))}', style: const TextStyle(color: AppColors.faint, fontSize: 12)),
              const SizedBox(height: 8),
              for (final m in upcoming)
                Container(
                  margin: const EdgeInsets.only(top: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                  decoration: BoxDecoration(color: AppColors.phase(m['phase']).withValues(alpha: 0.13), borderRadius: BorderRadius.circular(8)),
                  child: Text('${m['phase']} · ${countdown(m['dueDate'])}', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: AppColors.phase(m['phase']))),
                ),
            ]))),
            const SizedBox(width: 10),
            Expanded(child: _Tile(title: 'Team progress', child: Column(children: [
              _Gauge(percent: pct / 100),
              const SizedBox(height: 8),
              Text('$done done · $doingCount doing · ${tasks.length - done - doingCount} to do', textAlign: TextAlign.center, style: const TextStyle(fontSize: 11.5, color: AppColors.soft)),
            ]))),
          ]),
        ),
        const SizedBox(height: 10),
        _Tile(title: 'Team activity · last 14 days', child: _ActivityBars(tasks: tasks)),
        const SizedBox(height: 10),
        _Tile(title: 'Calendar', child: _MiniCalendar(milestones: milestones, deadline: finalDate)),

        if (milestones.isNotEmpty) ...[
          const SizedBox(height: 10),
          _Tile(title: 'Milestones', child: Column(children: [
            for (final m in milestones)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(children: [
                  SizedBox(width: 104, child: Align(alignment: Alignment.centerLeft, child: PhaseTag(m['phase']))),
                  Expanded(child: Text(m['title'], maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: m['status'] == 'Done' ? AppColors.faint : AppColors.ink))),
                  const SizedBox(width: 8),
                  Text(m['status'] == 'Done' ? '✓' : shortDate(parseDay(m['dueDate'])),
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: m['status'] != 'Done' && daysLeft(m['dueDate']) < 0 ? AppColors.danger : AppColors.soft)),
                ]),
              ),
          ])),
        ],

        const SizedBox(height: 10),
        _Tile(
          title: 'Team · ${members.length}',
          action: TextButton.icon(onPressed: widget.onInvite, icon: const Icon(Icons.person_add_alt_1_outlined, size: 16), label: const Text('Invite'), style: TextButton.styleFrom(visualDensity: VisualDensity.compact)),
          child: Column(children: [
            for (final m in members)
              Builder(builder: (_) {
                final c = contrib[m['userId']];
                final open = tasks.where((t) => t['assigneeId'] == m['userId'] && t['status'] != 'Done').toList();
                final late = open.where((t) { final d = taskDue(t, board); return d != null && daysLeft(d) < 0; }).length;
                final assigned = (c?['tasksAssigned'] as int?) ?? 0, doneT = (c?['tasksDone'] as int?) ?? 0;
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(children: [
                    Avatar(name: m['fullName'], initials: m['initials'], seed: m['userId'], size: 34),
                    const SizedBox(width: 10),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${m['fullName']}${m['userId'] == widget.me ? ' (you)' : ''}${m['role'] == 'Owner' ? ' · Owner' : ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                      const SizedBox(height: 4),
                      ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: assigned == 0 ? 0 : doneT / assigned, minHeight: 4)),
                      const SizedBox(height: 3),
                      Text('$doneT/$assigned done · ${c?['sharePercent'] ?? 0}% of work${late > 0 ? ' · $late overdue' : ''}', style: TextStyle(fontSize: 11.5, color: late > 0 ? AppColors.danger : AppColors.faint)),
                    ])),
                    if (_owner && m['userId'] != widget.me) IconButton(tooltip: 'Remove', icon: const Icon(Icons.person_remove_outlined, size: 20, color: AppColors.faint), onPressed: () => _remove(m)),
                  ]),
                );
              }),
          ]),
        ),

        const SizedBox(height: 10),
        _Tile(
          title: 'This week · ${shortDate(parseDay(current))} – ${shortDate(parseDay(current)!.add(const Duration(days: 6)))}',
          child: week.isEmpty
              ? const Text('No tasks planned for this week. Use “Plan with AI” on the Board.', style: TextStyle(color: AppColors.faint, fontSize: 13))
              : Column(children: [
                  for (final m in [...(board['members'] as List).cast<Map>(), {'userId': null, 'fullName': 'Unassigned'}])
                    if (week.any((t) => t['assigneeId'] == m['userId']))
                      Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(color: AppColors.bg, borderRadius: BorderRadius.circular(12), border: m['userId'] == widget.me ? Border.all(color: AppColors.accent, width: 1.5) : null),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            m['userId'] == null ? const Icon(Icons.help_outline_rounded, size: 22, color: AppColors.faint) : Avatar(name: m['fullName'], initials: m['initials'], seed: m['userId'], size: 24),
                            const SizedBox(width: 8),
                            Expanded(child: Text(m['userId'] == widget.me ? 'You' : m['fullName'], style: const TextStyle(fontWeight: FontWeight.w700))),
                            Text('${week.where((t) => t['assigneeId'] == m['userId'] && t['status'] != 'Done').length} left', style: const TextStyle(fontSize: 12, color: AppColors.faint)),
                          ]),
                          for (final t in week.where((t) => t['assigneeId'] == m['userId']))
                            InkWell(
                              onTap: () => widget.onOpen(t),
                              child: Row(children: [
                                Checkbox(value: t['status'] == 'Done', visualDensity: VisualDensity.compact, activeColor: AppColors.success, onChanged: (_) => widget.onToggle(t)),
                                Expanded(child: Text(t['title'], maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, decoration: t['status'] == 'Done' ? TextDecoration.lineThrough : null, color: t['status'] == 'Done' ? AppColors.faint : AppColors.ink))),
                              ]),
                            ),
                        ]),
                      ),
                ]),
        ),

        const SizedBox(height: 10),
        AppCard(
          padding: EdgeInsets.zero,
          child: ExpansionTile(
            shape: const Border(),
            title: const Text('Group settings', style: TextStyle(fontWeight: FontWeight.w700)),
            childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            children: [
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
                Align(alignment: Alignment.centerLeft, child: Text(widget.group['roadmapTitle'] ?? 'Ask the owner to link the team’s roadmap.', style: const TextStyle(color: AppColors.soft))),
              const SizedBox(height: 14),
              SizedBox(width: double.infinity, child: OutlinedButton(onPressed: _leaveOrDelete, style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger), child: Text(_owner ? 'Delete group' : 'Leave group'))),
            ],
          ),
        ),
      ]),
    );
  }
}

/* ----- dashboard widgets ----- */

class _Tile extends StatelessWidget {
  const _Tile({required this.title, required this.child, this.action});
  final String title;
  final Widget child;
  final Widget? action;
  @override
  Widget build(BuildContext context) => AppCard(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.soft))),
            if (action != null) action!,
          ]),
          const SizedBox(height: 10),
          child,
        ]),
      );
}

/// Half-circle gauge.
class _Gauge extends StatelessWidget {
  const _Gauge({required this.percent});
  final double percent;
  @override
  Widget build(BuildContext context) => SizedBox(
        height: 74,
        child: Stack(alignment: Alignment.bottomCenter, children: [
          Positioned.fill(child: CustomPaint(painter: _GaugePainter(percent.clamp(0, 1)))),
          Text('${(percent * 100).round()}%', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
        ]),
      );
}

class _GaugePainter extends CustomPainter {
  _GaugePainter(this.value);
  final double value;
  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 12.0;
    final r = (size.width / 2).clamp(0, size.height - stroke / 2).toDouble() - stroke / 2;
    final rect = Rect.fromCircle(center: Offset(size.width / 2, size.height - 4), radius: r);
    final base = Paint()..style = PaintingStyle.stroke..strokeWidth = stroke..strokeCap = StrokeCap.round..color = AppColors.line;
    canvas.drawArc(rect, 3.14159, 3.14159, false, base);
    if (value > 0) canvas.drawArc(rect, 3.14159, 3.14159 * value, false, base..color = AppColors.accent);
  }
  @override
  bool shouldRepaint(_GaugePainter old) => old.value != value;
}

/// Tasks finished per day over the last 14 days.
class _ActivityBars extends StatelessWidget {
  const _ActivityBars({required this.tasks});
  final List<Map> tasks;
  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final days = [for (var i = 13; i >= 0; i--) today.subtract(Duration(days: i))];
    final counts = [
      for (final d in days)
        tasks.where((t) {
          final c = t['completedAt'] == null ? null : DateTime.tryParse(t['completedAt'])?.toLocal();
          return c != null && c.year == d.year && c.month == d.month && c.day == d.day;
        }).length
    ];
    final max = counts.fold<int>(2, (a, b) => b > a ? b : a);
    final total = counts.fold<int>(0, (a, b) => a + b);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      SizedBox(
        height: 70,
        child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          for (var i = 0; i < 14; i++)
            Expanded(child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Tooltip(
                message: '${counts[i]} done on ${shortDate(days[i])}',
                child: Container(
                  height: 4 + 62 * counts[i] / max,
                  decoration: BoxDecoration(color: i == 13 ? AppColors.accent : AppColors.accent.withValues(alpha: counts[i] == 0 ? 0.12 : 0.55), borderRadius: BorderRadius.circular(4)),
                ),
              ),
            )),
        ]),
      ),
      const SizedBox(height: 6),
      Row(children: [
        Text(shortDate(days.first), style: const TextStyle(fontSize: 11, color: AppColors.faint)),
        const Spacer(),
        const Text('Today', style: TextStyle(fontSize: 11, color: AppColors.faint)),
      ]),
      const SizedBox(height: 4),
      Text(total == 0 ? 'No tasks finished in the last 2 weeks yet' : '$total task${total > 1 ? 's' : ''} finished in the last 2 weeks', style: const TextStyle(fontSize: 12, color: AppColors.soft)),
    ]);
  }
}

/// Month calendar with milestone due dates in their phase colour.
class _MiniCalendar extends StatefulWidget {
  const _MiniCalendar({required this.milestones, required this.deadline});
  final List<Map> milestones;
  final String? deadline;
  @override
  State<_MiniCalendar> createState() => _MiniCalendarState();
}

class _MiniCalendarState extends State<_MiniCalendar> {
  late DateTime _month;

  @override
  void initState() {
    super.initState();
    final next = widget.milestones.where((m) => m['status'] != 'Done').firstOrNull;
    final d = next == null ? DateTime.now() : parseDay(next['dueDate'])!;
    _month = DateTime(d.year, d.month);
  }

  String _key(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final byDay = <String, Map>{for (final m in widget.milestones) m['dueDate'] as String: m};
    final start = _month.subtract(Duration(days: (_month.weekday + 6) % 7));
    final today = _key(DateTime.now());
    const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return Column(children: [
      Row(children: [
        IconButton(visualDensity: VisualDensity.compact, onPressed: () => setState(() => _month = DateTime(_month.year, _month.month - 1)), icon: const Icon(Icons.chevron_left_rounded)),
        Expanded(child: Text('${names[_month.month - 1]} ${_month.year}', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700))),
        IconButton(visualDensity: VisualDensity.compact, onPressed: () => setState(() => _month = DateTime(_month.year, _month.month + 1)), icon: const Icon(Icons.chevron_right_rounded)),
      ]),
      Row(children: [for (final d in ['M', 'T', 'W', 'T', 'F', 'S', 'S']) Expanded(child: Center(child: Text(d, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.faint))))]),
      const SizedBox(height: 4),
      for (var w = 0; w < 6; w++)
        Row(children: [
          for (var i = 0; i < 7; i++)
            Builder(builder: (_) {
              final d = start.add(Duration(days: w * 7 + i));
              final k = _key(d);
              final m = byDay[k];
              final isFinal = k == widget.deadline;
              final c = m == null ? null : AppColors.phase(m['phase']);
              return Expanded(child: Tooltip(
                message: m != null ? '${m['phase']}: ${m['title']}' : isFinal ? 'Final deadline' : '',
                child: Container(
                  height: 32,
                  margin: const EdgeInsets.all(2),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: isFinal ? AppColors.accent : c?.withValues(alpha: 0.2) ?? AppColors.bg,
                    borderRadius: BorderRadius.circular(8),
                    border: k == today ? Border.all(color: AppColors.ink, width: 1.5) : null,
                  ),
                  child: Text('${d.day}', style: TextStyle(fontSize: 12, fontWeight: m != null || isFinal ? FontWeight.w800 : FontWeight.w500,
                      color: isFinal ? Colors.white : c ?? (d.month == _month.month ? AppColors.ink : AppColors.faint.withValues(alpha: 0.5)))),
                ),
              ));
            }),
        ]),
    ]);
  }
}

/* ======================= My work (private) ======================= */

class MyWorkTab extends StatelessWidget {
  const MyWorkTab({super.key, required this.group, required this.board, required this.me, required this.onMove, required this.onOpen, required this.onRefresh});
  final Map<String, dynamic> group;
  final Map<String, dynamic> board;
  final String? me;
  final void Function(Map, String) onMove;
  final void Function([Map?]) onOpen;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final tasks = (board['tasks'] as List).cast<Map>();
    final mine = tasks.where((t) => t['assigneeId'] == me).toList();
    final open = mine.where((t) => t['status'] != 'Done').toList();
    final doing = open.where((t) => t['status'] == 'Doing').toList();
    final done = mine.where((t) => t['status'] == 'Done').toList();
    final todo = open.where((t) => t['status'] == 'Todo').toList()..sort((a, b) => (taskDue(a, board) ?? '9').compareTo(taskDue(b, board) ?? '9'));
    final overdue = todo.where((t) { final d = taskDue(t, board); return d != null && daysLeft(d) < 0; }).toList();
    final soon = todo.where((t) => !overdue.contains(t)).toList();
    final nextUp = doing.isNotEmpty ? doing.first : todo.firstOrNull;
    final nextDue = nextUp == null ? null : taskDue(nextUp, board);
    final pct = mine.isEmpty ? 0 : (done.length * 100 / mine.length).round();
    final share = (board['contributions'] as List).cast<Map>().where((c) => c['userId'] == me).firstOrNull?['sharePercent'] ?? 0;
    final unassigned = tasks.where((t) => t['assigneeId'] == null && t['status'] != 'Done').length;

    final milestoneIds = open.map((t) => t['milestoneId']).whereType<String>().toSet();
    final together = [
      for (final id in milestoneIds)
        (
          ms: (board['milestones'] as List).cast<Map>().where((m) => m['id'] == id).firstOrNull,
          people: {for (final t in tasks.where((t) => t['milestoneId'] == id && t['assigneeId'] != null && t['assigneeId'] != me && t['status'] != 'Done')) t['assigneeId']: t['assigneeName']},
        )
    ].where((x) => x.ms != null && x.people.isNotEmpty).toList();

    final tips = <String>[
      if (overdue.isNotEmpty) 'You have ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}. Finish ${overdue.length > 1 ? 'them' : 'it'} first, or tell your team in the chat if you are stuck.',
      if (doing.length > 2) 'Several tasks are in progress. Finishing one before starting the next keeps the board honest.',
      if (open.isEmpty && unassigned > 0) '$unassigned unassigned task${unassigned > 1 ? 's are' : ' is'} on the board. Pick one up!',
      if (mine.isEmpty) 'Nothing is assigned to you yet. Use “Plan with AI” on the Board to share the work across the team.',
    ];

    Widget row(Map t) {
      final due = taskDue(t, board);
      final late = t['status'] != 'Done' && due != null && daysLeft(due) < 0;
      final isDone = t['status'] == 'Done';
      return ListTile(
        contentPadding: const EdgeInsets.only(left: 4, right: 8),
        leading: Checkbox(value: isDone, activeColor: AppColors.success, onChanged: (_) => onMove(t, isDone ? 'Todo' : 'Done')),
        title: Text(t['title'], style: TextStyle(fontWeight: FontWeight.w600, decoration: isDone ? TextDecoration.lineThrough : null, color: isDone ? AppColors.faint : AppColors.ink)),
        subtitle: Text([if (t['milestonePhase'] != null) t['milestonePhase'], isDone ? 'done' : due == null ? 'no date' : countdown(due), if (t['estimateHours'] != null) '${_n(t['estimateHours'])} h'].join(' · '),
            style: TextStyle(color: late ? AppColors.danger : AppColors.soft, fontSize: 12.5)),
        trailing: t['status'] == 'Todo' ? TextButton(onPressed: () => onMove(t, 'Doing'), child: const Text('Start')) : null,
        onTap: () => onOpen(t),
      );
    }

    Widget section(String title, List<Map> list, {Color? color}) => list.isEmpty
        ? const SizedBox.shrink()
        : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(padding: const EdgeInsets.fromLTRB(4, 14, 4, 6), child: Text(title.toUpperCase(), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.8, color: color ?? AppColors.faint))),
            AppCard(padding: EdgeInsets.zero, child: Column(children: [for (final t in list) row(t)])),
          ]);

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 16, 16, 40), children: [
        _statGrid([
          _Stat('My progress', '$pct%', '${done.length} of ${mine.length} of my tasks', progress: pct / 100),
          _Stat('Open tasks', '${open.length}', '${_n(_hours(open))} h of work left', tone: overdue.isNotEmpty ? AppColors.danger : null),
          _Stat('Next deadline', nextDue == null ? '—' : countdown(nextDue), nextUp?['title'] ?? 'Nothing due', tone: _tone(nextDue, warnDays: 2)),
          _Stat('My share', '$share%', 'of the team’s finished work'),
        ]),
        if (nextUp != null) ...[
          const SizedBox(height: 14),
          AppCard(
            borderColor: AppColors.accent,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(nextUp['status'] == 'Doing' ? 'YOU ARE WORKING ON' : 'UP NEXT FOR YOU', style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, letterSpacing: 0.8, color: AppColors.faint)),
              const SizedBox(height: 6),
              Text(nextUp['title'], style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text([nextUp['milestoneTitle'] ?? 'Not linked to a milestone', if (nextDue != null) countdown(nextDue)].join(' · '), style: const TextStyle(color: AppColors.soft, fontSize: 13)),
              const SizedBox(height: 12),
              Wrap(spacing: 8, runSpacing: 8, children: [
                if (nextUp['status'] == 'Todo') FilledButton(onPressed: () => onMove(nextUp, 'Doing'), style: FilledButton.styleFrom(minimumSize: const Size(10, 40), backgroundColor: AppColors.accent), child: const Text('Start now')),
                FilledButton(onPressed: () => onMove(nextUp, 'Done'), style: FilledButton.styleFrom(minimumSize: const Size(10, 40)), child: const Text('Mark done')),
                OutlinedButton(onPressed: () => onOpen(nextUp), style: OutlinedButton.styleFrom(minimumSize: const Size(10, 40)), child: const Text('Details')),
              ]),
            ]),
          ),
        ],
        for (final tip in tips)
          Container(
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.sun.withValues(alpha: 0.25), borderRadius: BorderRadius.circular(12)),
            child: Text(tip, style: const TextStyle(fontSize: 13.5)),
          ),
        section('In progress', doing),
        section('Overdue', overdue, color: AppColors.danger),
        section('To do', soon),
        if (done.isNotEmpty) ...[
          const SizedBox(height: 10),
          AppCard(padding: EdgeInsets.zero, child: ExpansionTile(shape: const Border(), title: Text('Done (${done.length})', style: const TextStyle(fontWeight: FontWeight.w700)), children: [for (final t in done) row(t)])),
        ],
        if (together.isNotEmpty) ...[
          const SectionTitle('Working with you'),
          for (final x in together)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: AppCard(
                padding: const EdgeInsets.all(12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    PhaseTag(x.ms!['phase']),
                    const SizedBox(width: 8),
                    Expanded(child: Text(x.ms!['title'], maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700))),
                  ]),
                  const SizedBox(height: 8),
                  Wrap(spacing: 8, runSpacing: 6, children: [
                    for (final e in x.people.entries)
                      Chip(avatar: Avatar(name: e.value ?? '', seed: e.key, size: 22), label: Text((e.value as String? ?? '').split(' ').first), visualDensity: VisualDensity.compact),
                  ]),
                ]),
              ),
            ),
        ],
      ]),
    );
  }
}

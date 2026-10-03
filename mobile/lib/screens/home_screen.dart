import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../core/session.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import 'profile_screen.dart';

/// Home: where the project stands today. Overdue work first, then the next milestone, quick actions,
/// groups, the community and something to learn. Every section loads on its own.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<Map> _roadmaps = [], _groups = [], _vivas = [], _posts = [];
  int _unread = 0, _communityUnread = 0;
  Map<String, dynamic>? _current;
  bool _loading = true;
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    _error = null;
    Future<T?> safe<T>(Future<T> f) async { try { return await f; } catch (e) { _error ??= errorText(e); return null; } }
    final r = await Future.wait([safe(api.roadmaps()), safe(api.groups()), safe(api.vivas()), safe(api.communityFeed()), safe(api.notifications(scope: 'System')), safe(refreshProfile())]);
    final roadmaps = ((r[0] as List?) ?? const []).cast<Map>();
    final active = roadmaps.where((x) => x['roadmapStatus'] == 'Accepted').toList()
      ..sort((a, b) => ((b['overdueCount'] as num?) ?? 0).compareTo((a['overdueCount'] as num?) ?? 0));
    Map<String, dynamic>? current;
    if (active.isNotEmpty) current = await safe(api.roadmap(active.first['id'] as String));
    if (!mounted) return;
    final notes = r[4] as Map?;
    setState(() {
      _roadmaps = roadmaps;
      _groups = ((r[1] as List?) ?? const []).cast<Map>();
      _vivas = ((r[2] as List?) ?? const []).cast<Map>();
      _posts = (((r[3] as Map?)?['posts'] as List?) ?? const []).cast<Map>().take(3).toList();
      _unread = (notes?['unread'] as num?)?.toInt() ?? 0;
      _communityUnread = (notes?['communityUnread'] as num?)?.toInt() ?? 0;
      _current = current;
      _loading = false;
    });
  }

  Widget _quick(IconData icon, String label, Color color, VoidCallback onTap) => Expanded(child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Column(children: [
          Container(width: 54, height: 54, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(16)), child: Icon(icon, color: AppColors.ink, size: 26)),
          const SizedBox(height: 6),
          Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
        ]),
      ));

  @override
  Widget build(BuildContext context) {
    final user = session.user;
    final active = _roadmaps.where((x) => x['roadmapStatus'] == 'Accepted').toList();
    final waiting = _roadmaps.where((x) => x['roadmapStatus'] == 'PendingApproval').toList();
    final overdue = active.fold<int>(0, (n, x) => n + ((x['overdueCount'] as num?)?.toInt() ?? 0));
    final milestones = ((_current?['milestones'] as List?) ?? const []).cast<Map>();
    final today = DateTime.now();
    final next = (milestones.where((m) => m['status'] != 'Done').toList()..sort((a, b) => (a['dueDate'] as String).compareTo(b['dueDate'] as String))).firstOrNull;
    final done = milestones.where((m) => m['status'] == 'Done').length;
    final bestViva = _vivas.where((v) => v['scorePercent'] != null).fold<int?>(null, (b, v) => b == null || (v['scorePercent'] as int) > b ? v['scorePercent'] as int : b);

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: EdgeInsets.zero, children: [
          // Header: logo, notifications and the profile picture over the website's hero artwork.
          Stack(children: [
            SizedBox(height: 230, width: double.infinity, child: ShaderMask(
              shaderCallback: (r) => const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.black, Colors.black, Colors.transparent], stops: [0, .55, 1]).createShader(r),
              blendMode: BlendMode.dstIn,
              child: Image.asset('assets/images/hero.webp', fit: BoxFit.cover, color: Colors.white.withValues(alpha: .35), colorBlendMode: BlendMode.lighten),
            )),
            SafeArea(bottom: false, child: Padding(padding: const EdgeInsets.fromLTRB(20, 8, 12, 0), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Image.asset('assets/images/logo-full.png', height: 30),
                const Spacer(),
                IconButton(
                  onPressed: () async { await context.push('/notifications'); _load(); },
                  tooltip: 'Notifications',
                  icon: Badge(isLabelVisible: _unread + _communityUnread > 0, label: Text('${_unread + _communityUnread}'), child: const Icon(Icons.notifications_none_rounded, size: 27)),
                ),
                GestureDetector(
                  onTap: () => context.push('/profile'),
                  child: ValueListenableBuilder(valueListenable: profileNotifier, builder: (_, me, __) =>
                      Avatar(name: me?['fullName'] ?? user?.fullName, seed: user?.id, size: 40, photoId: me?['avatarId'], badge: me?['badge'])),
                ),
              ]),
              const SizedBox(height: 26),
              Eyebrow(greeting()),
              Text('Hi, ${user?.firstName ?? 'there'}', style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 4),
              Text(active.isEmpty ? 'Let\'s plan your project today.' : 'Here is where your project stands today.', style: const TextStyle(color: AppColors.soft)),
            ]))),
          ]),
          Padding(padding: const EdgeInsets.fromLTRB(16, 6, 16, 40), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (_loading) const LoadingView(label: 'Loading your workspace…'),
            if (!_loading && _error != null && _roadmaps.isEmpty) ...[ErrorView(message: _error!, onRetry: _load), const SizedBox(height: 12)],
            if (overdue > 0)
              FadeSlideIn(child: AppCard(
                color: const Color(0xFFFFF4F2),
                borderColor: const Color(0x55B0391F),
                onTap: () => context.push('/roadmaps/${active.first['id']}'),
                child: Row(children: [
                  const Icon(Icons.error_outline_rounded, color: AppColors.danger, size: 30),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('$overdue overdue milestone${overdue == 1 ? '' : 's'}', style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.danger)),
                    const Text('Catch up or update the status so your plan stays true.', style: TextStyle(color: AppColors.soft, fontSize: 13)),
                  ])),
                  const Icon(Icons.chevron_right_rounded),
                ]),
              )),
            if (waiting.isNotEmpty) ...[
              const SizedBox(height: 10),
              AppCard(color: const Color(0xFFFFF8EA), onTap: () => context.push('/roadmaps/${waiting.first['id']}'),
                  child: Row(children: [const Icon(Icons.fact_check_outlined, color: AppColors.warn), const SizedBox(width: 12), Expanded(child: Text('"${waiting.first['displayTitle']}" is ready for you to review and accept.', style: const TextStyle(fontWeight: FontWeight.w700))), const Icon(Icons.chevron_right_rounded)])),
            ],
            if (!_loading) ...[
              const SizedBox(height: 12),
              if (_current == null)
                FadeSlideIn(child: AppCard(
                  padding: EdgeInsets.zero,
                  onTap: () => context.push('/roadmaps/new'),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Image.asset('assets/images/plan.webp', height: 150, fit: BoxFit.cover),
                    const Padding(padding: EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Start your first roadmap', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                      SizedBox(height: 4),
                      Text('Answer a few questions, talk to the mentor and get dated milestones with resources.', style: TextStyle(color: AppColors.soft)),
                    ])),
                  ]),
                ))
              else
                FadeSlideIn(child: AppCard(
                  onTap: () => context.push('/roadmaps/${_current!['id'] ?? active.first['id']}'),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      ProgressRing(percent: milestones.isEmpty ? 0 : done * 100 / milestones.length, size: 64),
                      const SizedBox(width: 14),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Eyebrow('Current project'),
                        Text(_current!['title'] ?? active.first['displayTitle'] ?? 'My project', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
                        Text('$done of ${milestones.length} milestones done', style: const TextStyle(color: AppColors.soft)),
                      ])),
                    ]),
                    if (next != null) ...[
                      const Divider(height: 26),
                      Row(children: [
                        Icon(next['isOverdue'] == true ? Icons.error_outline_rounded : Icons.flag_outlined, color: next['isOverdue'] == true ? AppColors.danger : AppColors.accent),
                        const SizedBox(width: 10),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(next['isOverdue'] == true ? 'Overdue' : 'Next up', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: next['isOverdue'] == true ? AppColors.danger : AppColors.accent)),
                          Text(next['title'], style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text('Due ${mediumDate(DateTime.tryParse(next['dueDate']))} · ${countdown(DateTime.parse(next['dueDate']).difference(DateTime(today.year, today.month, today.day)).inDays)}', style: const TextStyle(color: AppColors.soft, fontSize: 12.5)),
                        ])),
                      ]),
                    ],
                  ]),
                )),
              const SizedBox(height: 18),
              Row(children: [
                _quick(Icons.add_road_rounded, 'New\nroadmap', AppColors.mint, () => context.push('/roadmaps/new')),
                _quick(Icons.chat_bubble_outline_rounded, 'Ask the\nmentor', const Color(0xFFDDEBF0), () => active.isEmpty ? context.push('/roadmaps/new') : context.push('/roadmaps/${active.first['id']}/chat')),
                _quick(Icons.record_voice_over_outlined, 'Mock\nviva', const Color(0xFFFBEBC7), () => context.push('/viva')),
                _quick(Icons.school_outlined, 'Learn', const Color(0xFFE6E3F5), () => context.push('/learn')),
              ]),
              const SectionTitle('At a glance'),
              Row(children: [
                Expanded(child: _Stat(value: '${active.length}', label: 'Active roadmaps', onTap: () => context.go('/roadmaps'))),
                const SizedBox(width: 8),
                Expanded(child: _Stat(value: '${_groups.length}', label: 'Groups', onTap: () => context.go('/groups'))),
                const SizedBox(width: 8),
                Expanded(child: _Stat(value: bestViva == null ? '–' : '$bestViva%', label: 'Best viva', onTap: () => context.push('/viva'))),
              ]),
              if (_groups.isNotEmpty) ...[
                SectionTitle('Your groups', action: 'All', onAction: () => context.go('/groups')),
                for (final g in _groups.take(2))
                  Padding(padding: const EdgeInsets.only(bottom: 8), child: AppCard(
                    padding: const EdgeInsets.all(14),
                    onTap: () => context.push('/groups/${g['id']}'),
                    child: Row(children: [
                      const CircleAvatar(backgroundColor: AppColors.mint, child: Icon(Icons.groups_rounded, color: AppColors.accent)),
                      const SizedBox(width: 12),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(g['name'] ?? '', style: const TextStyle(fontWeight: FontWeight.w700)),
                        Text('${g['memberCount'] ?? 0} members${g['roadmapTitle'] != null ? ' · ${g['roadmapTitle']}' : ''}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.soft, fontSize: 12.5)),
                      ])),
                      const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
                    ]),
                  )),
              ],
              SectionTitle('From the community', action: 'Open', onAction: () => context.go('/community')),
              if (_communityUnread > 0)
                Padding(padding: const EdgeInsets.only(bottom: 8), child: AppCard(color: AppColors.mint, onTap: () => context.go('/community'),
                    child: Text('You have $_communityUnread new community notification${_communityUnread == 1 ? '' : 's'}.', style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.accentDark)))),
              if (_posts.isEmpty) const Text('No posts yet. Share your progress to start the conversation.', style: TextStyle(color: AppColors.soft)),
              for (final p in _posts)
                Padding(padding: const EdgeInsets.only(bottom: 8), child: AppCard(
                  padding: const EdgeInsets.all(14),
                  onTap: () => context.push('/posts/${p['id']}'),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Avatar(name: p['authorName'], seed: p['authorId'], size: 38, photoId: p['authorAvatarId'], badge: p['authorBadge']),
                    const SizedBox(width: 10),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(p['authorName'] ?? '', style: const TextStyle(fontWeight: FontWeight.w800)),
                      Text((p['projectTitle'] ?? p['content'] ?? '').toString(), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.soft)),
                    ])),
                  ]),
                )),
              const SectionTitle('Learn something new'),
              AppCard(
                padding: EdgeInsets.zero,
                onTap: () => context.push('/learn?track=diagrams'),
                child: Row(children: [
                  ClipRRect(borderRadius: const BorderRadius.horizontal(left: Radius.circular(16)), child: Image.asset('assets/images/learn.webp', width: 110, height: 96, fit: BoxFit.cover)),
                  const SizedBox(width: 12),
                  const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Diagrams for your report', style: TextStyle(fontWeight: FontWeight.w800)),
                    SizedBox(height: 2),
                    Text('ER, use case, class, sequence and architecture diagrams with examples.', style: TextStyle(color: AppColors.soft, fontSize: 12.5)),
                  ])),
                  const SizedBox(width: 10),
                ]),
              ),
            ],
          ])),
        ]),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label, required this.onTap});
  final String value, label;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => AppCard(
        onTap: onTap,
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
        child: Column(children: [
          Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          Text(label, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.soft, fontSize: 12)),
        ]),
      );
}

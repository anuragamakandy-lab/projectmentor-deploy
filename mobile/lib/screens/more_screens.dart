import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/api.dart';
import '../core/config.dart';
import '../core/files.dart';
import '../core/format.dart';
import '../core/session.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import 'profile_screen.dart';

/// Logs out after asking first. Cancel keeps the student where they are.
Future<void> confirmLogout(BuildContext context) async {
  if (await confirm(context, title: 'Log out?', message: 'You will need to log in again to see your roadmaps, groups and community.', ok: 'Log out')) {
    await session.logout();
    if (context.mounted) context.go('/login');
  }
}

/// "More" tab: the remaining tools and the account.
class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final user = session.user;
    Widget item(IconData icon, String title, String sub, VoidCallback onTap, {Color color = AppColors.mint}) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: AppCard(
            onTap: onTap,
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              Container(width: 44, height: 44, decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(12)), child: Icon(icon, color: AppColors.ink)),
              const SizedBox(width: 14),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5)), Text(sub, style: const TextStyle(color: AppColors.soft, fontSize: 13))])),
              const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
            ]),
          ),
        );
    return Scaffold(
      body: HeroPage(
        header: const PageHeader(eyebrow: 'Tools and account', title: 'More'),
        children: [
          AppCard(
            onTap: () => context.push('/profile'),
            child: Row(children: [
              ValueListenableBuilder(valueListenable: profileNotifier, builder: (_, me, __) =>
                  Avatar(name: user?.fullName, seed: user?.id, size: 54, photoId: me?['avatarId'], badge: me?['badge'])),
              const SizedBox(width: 14),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(user?.fullName ?? '', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
                Text(user?.email ?? '', style: const TextStyle(color: AppColors.soft)),
                const Text('View and edit your profile', style: TextStyle(color: AppColors.accent, fontWeight: FontWeight.w700, fontSize: 12.5)),
              ])),
            ]),
          ),
          const SectionTitle('Learn and practise'),
          item(Icons.record_voice_over_outlined, 'Mock viva', 'Practise with an AI examiner and get live marks', () => context.push('/viva'), color: const Color(0xFFFBEBC7)),
          item(Icons.school_outlined, 'Learn', 'Reports, diagrams, presentations and Git, with videos', () => context.push('/learn')),
          item(Icons.description_outlined, 'Templates', 'Proposal, SRS, test report, final report and more', () => context.push('/templates'), color: const Color(0xFFE6E3F5)),
          item(Icons.menu_book_outlined, 'Resources', 'Free tutorials, docs and courses by topic', () => context.push('/resources'), color: const Color(0xFFDDEBF0)),
          const SectionTitle('Account'),
          item(Icons.notifications_none_rounded, 'Notifications', 'Deadlines, badges and account messages', () => context.push('/notifications'), color: AppColors.bg2),
          item(Icons.support_agent_rounded, 'Contact the admins', 'Ask a question or report a problem', () => context.push('/contact'), color: AppColors.bg2),
          item(Icons.language_rounded, 'Open the website', AppConfig.webUrl, () => openLink(AppConfig.webUrl), color: AppColors.bg2),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: () => confirmLogout(context),
            style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger, minimumSize: const Size.fromHeight(50)),
            icon: const Icon(Icons.logout_rounded),
            label: const Text('Log out'),
          ),
          const SizedBox(height: 16),
          const Center(child: Text('ProjectMentor · From first idea to final viva', style: TextStyle(color: AppColors.faint, fontSize: 12))),
        ],
      ),
    );
  }
}

/// The resources library: mostly free tutorials, docs and courses, plus clearly marked paid courses.
class ResourcesScreen extends StatefulWidget {
  const ResourcesScreen({super.key});
  @override
  State<ResourcesScreen> createState() => _ResourcesScreenState();
}

class _ResourcesScreenState extends State<ResourcesScreen> {
  List<Map> _items = [];
  List<String> _topics = [];
  String? _topic;
  String? _level;
  String _price = 'free';
  bool _saved = false;
  bool _linked = false;
  String _q = '';
  int _total = 0;
  int _page = 1;
  bool _loading = true;
  String? _error;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    api.resourceFacets().then((f) { if (mounted) setState(() => _topics = ((f['topics'] as List?) ?? const []).cast<String>()); }).catchError((_) {});
    _load();
  }

  @override
  void dispose() { _debounce?.cancel(); super.dispose(); }

  Future<void> _load({bool more = false}) async {
    setState(() { _loading = true; _error = null; });
    try {
      final page = more ? _page + 1 : 1;
      final r = await api.resources(search: _q.isEmpty ? null : _q, topic: _topic, level: _level, price: _price.isEmpty ? null : _price,
          bookmarked: _saved, linked: _linked, page: page);
      final list = ((r['items'] as List?) ?? const []).cast<Map>();
      if (mounted) setState(() { _items = more ? [..._items, ...list] : list; _total = (r['totalItems'] as num?)?.toInt() ?? list.length; _page = page; });
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _bookmark(Map r) async {
    try {
      final on = await api.toggleBookmark(r['id']);
      setState(() => r['bookmarked'] = on);
      if (mounted) showSnack(context, on ? 'Saved to your bookmarks' : 'Removed from bookmarks');
    } catch (e) { if (mounted) showSnack(context, errorText(e)); }
  }

  Widget _chip(String label, bool on, VoidCallback tap) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(label: Text(label), selected: on, onSelected: (_) => tap(), selectedColor: AppColors.ink, labelStyle: TextStyle(color: on ? Colors.white : AppColors.ink, fontWeight: FontWeight.w600)),
      );

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Resources')),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 32), children: [
            const Text('The best places to learn what your project needs. Most are free.', style: TextStyle(color: AppColors.soft)),
            const SizedBox(height: 12),
            TextField(
              decoration: const InputDecoration(hintText: 'Search: React, ER diagram, testing…', prefixIcon: Icon(Icons.search_rounded)),
              onChanged: (v) { _q = v.trim(); _debounce?.cancel(); _debounce = Timer(const Duration(milliseconds: 400), _load); },
            ),
            const SizedBox(height: 10),
            SizedBox(height: 40, child: ListView(scrollDirection: Axis.horizontal, children: [
              _chip('Free', _price == 'free', () { setState(() => _price = _price == 'free' ? '' : 'free'); _load(); }),
              _chip('Paid courses', _price == 'paid', () { setState(() => _price = _price == 'paid' ? '' : 'paid'); _load(); }),
              _chip('Bookmarks', _saved, () { setState(() => _saved = !_saved); _load(); }),
              _chip('In my roadmap', _linked, () { setState(() => _linked = !_linked); _load(); }),
              for (final l in ['Beginner', 'Intermediate', 'Advanced']) _chip(l, _level == l, () { setState(() => _level = _level == l ? null : l); _load(); }),
            ])),
            const SizedBox(height: 6),
            if (_topics.isNotEmpty)
              SizedBox(height: 40, child: ListView(scrollDirection: Axis.horizontal, children: [
                _chip('All topics', _topic == null, () { setState(() => _topic = null); _load(); }),
                for (final t in _topics) _chip(t.replaceFirst('Build: ', ''), _topic == t, () { setState(() => _topic = t); _load(); }),
              ])),
            Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: Text('$_total result${_total == 1 ? '' : 's'}', style: const TextStyle(color: AppColors.faint, fontWeight: FontWeight.w600))),
            if (_loading && _items.isEmpty) const LoadingView()
            else if (_error != null) ErrorView(message: _error!, onRetry: _load)
            else if (_items.isEmpty) const EmptyState(icon: Icons.menu_book_outlined, title: 'Nothing found', message: 'Try another word, topic or filter.')
            else ...[
              for (final r in _items) _ResourceCard(r: r, onBookmark: () => _bookmark(r)),
              if (_items.length < _total) Center(child: TextButton(onPressed: _loading ? null : () => _load(more: true), child: Text(_loading ? 'Loading…' : 'Show more'))),
            ],
          ]),
        ),
      );
}

class _ResourceCard extends StatelessWidget {
  const _ResourceCard({required this.r, required this.onBookmark});
  final Map r;
  final VoidCallback onBookmark;
  @override
  Widget build(BuildContext context) {
    final free = r['isFree'] != false;
    final linked = ((r['linkedMilestones'] as List?) ?? const []).cast<String>();
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        onTap: () => openLink(r['url']),
        borderColor: free ? null : const Color(0x55B5832F),
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text(r['resourceType'] ?? '', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: AppColors.accent)),
            const SizedBox(width: 8),
            Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2), decoration: BoxDecoration(color: free ? const Color(0xFFE6F4EC) : const Color(0xFFFFF2D9), borderRadius: BorderRadius.circular(999)),
                child: Text(free ? 'Free' : 'Paid', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: free ? const Color(0xFF18794E) : const Color(0xFF8A5A00)))),
            const Spacer(),
            IconButton(onPressed: onBookmark, tooltip: 'Save', icon: Icon(r['bookmarked'] == true ? Icons.bookmark_rounded : Icons.bookmark_border_rounded, color: r['bookmarked'] == true ? AppColors.gold : AppColors.faint)),
          ]),
          Padding(padding: const EdgeInsets.only(right: 8), child: Text(r['title'] ?? '', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5))),
          if (r['provider'] != null) Text(r['provider'], style: const TextStyle(color: AppColors.faint, fontWeight: FontWeight.w600, fontSize: 12.5)),
          if ((r['description'] as String?)?.isNotEmpty ?? false) Padding(padding: const EdgeInsets.only(top: 6, right: 8), child: Text(r['description'], style: const TextStyle(color: AppColors.soft, height: 1.4))),
          if (linked.isNotEmpty)
            Container(margin: const EdgeInsets.only(top: 8, right: 8), padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6), decoration: BoxDecoration(color: AppColors.mint, borderRadius: BorderRadius.circular(8)),
                child: Text('In your roadmap: ${linked.take(2).join(', ')}', style: const TextStyle(color: AppColors.accentDark, fontWeight: FontWeight.w700, fontSize: 12.5))),
          const SizedBox(height: 8),
          Wrap(spacing: 10, children: [
            Text(r['level'] ?? 'Beginner', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: AppColors.ink)),
            if (r['duration'] != null) Text(r['duration'], style: const TextStyle(color: AppColors.soft, fontSize: 12.5)),
            if (!free && r['price'] != null) Text(r['price'], style: const TextStyle(color: Color(0xFF8A5A00), fontWeight: FontWeight.w700, fontSize: 12.5)),
          ]),
        ]),
      ),
    );
  }
}

/// System notifications (deadlines, badges, account). Community activity is summarised in one line that opens Community.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});
  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  Map<String, dynamic>? _data;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final d = await api.notifications(scope: 'System');
      if (mounted) setState(() => _data = d);
      if (((d['unread'] as num?) ?? 0) > 0) api.readNotifications(scope: 'System');
    } catch (e) { if (mounted) showSnack(context, errorText(e)); }
  }

  @override
  Widget build(BuildContext context) {
    final items = ((_data?['items'] as List?) ?? const []).cast<Map>();
    final community = (_data?['communityUnread'] as num?)?.toInt() ?? 0;
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: _data == null ? const LoadingView() : RefreshIndicator(onRefresh: _load, child: ListView(padding: const EdgeInsets.all(16), children: [
        if (community > 0)
          Padding(padding: const EdgeInsets.only(bottom: 12), child: AppCard(
            color: AppColors.mint,
            onTap: () => context.go('/community'),
            child: Row(children: [
              const Icon(Icons.forum_rounded, color: AppColors.accent),
              const SizedBox(width: 12),
              Expanded(child: Text('You have $community new community notification${community == 1 ? '' : 's'}. Open Community to see them.', style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.accentDark))),
              const Icon(Icons.chevron_right_rounded),
            ]),
          )),
        if (items.isEmpty) const Padding(padding: EdgeInsets.all(30), child: Center(child: Text('Nothing new. Deadlines, badges and account messages appear here.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.faint)))),
        for (final n in items)
          Padding(padding: const EdgeInsets.only(bottom: 8), child: AppCard(
            padding: const EdgeInsets.all(14),
            borderColor: n['kind'] == 'Overdue' ? const Color(0x66B0391F) : null,
            onTap: () {
              final link = (n['link'] as String?) ?? '';
              final rid = RegExp(r'/student/roadmaps/([0-9a-f-]{36})').firstMatch(link)?.group(1);
              final gid = RegExp(r'/groups/([0-9a-f-]{36})').firstMatch(link)?.group(1);
              if (rid != null) { context.push('/roadmaps/$rid'); } else if (gid != null) { context.push('/groups/$gid'); }
            },
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(n['kind'] == 'Overdue' ? Icons.error_outline_rounded : n['kind'] == 'DueSoon' ? Icons.schedule_rounded : n['kind'] == 'Badge' ? Icons.workspace_premium_rounded : Icons.notifications_none_rounded,
                  color: n['kind'] == 'Overdue' ? AppColors.danger : AppColors.accent),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(n['title'] ?? '', style: TextStyle(fontWeight: n['isRead'] == true ? FontWeight.w600 : FontWeight.w800)),
                if (n['body'] != null) Text(n['body'], style: const TextStyle(color: AppColors.soft)),
                Text(timeAgo(DateTime.tryParse(n['createdAt'] ?? '')?.toLocal()), style: const TextStyle(color: AppColors.faint, fontSize: 12)),
              ])),
            ]),
          )),
      ])),
    );
  }
}

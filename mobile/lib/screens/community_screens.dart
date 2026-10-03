import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:share_plus/share_plus.dart';

import '../core/api.dart';
import '../core/config.dart';
import '../core/files.dart';
import '../core/format.dart';
import '../core/session.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import 'profile_screen.dart';

const _kinds = ['Update', 'Showcase', 'Question', 'Report', 'Idea'];
const audiences = <(String, String, IconData)>[
  ('Public', 'Public', Icons.public_rounded),
  ('Friends', 'Friends', Icons.group_rounded),
  ('OnlyMe', 'Only me', Icons.lock_rounded),
];
(String, String, IconData) audienceOf(String? v) => audiences.firstWhere((a) => a.$1 == v || (v == 'Private' && a.$1 == 'OnlyMe'), orElse: () => audiences.first);

/// Facebook-style reactions (same set as the website).
const reactions = <(String, IconData, Color)>[
  ('Like', Icons.thumb_up_rounded, Color(0xFF2F7FD1)),
  ('Love', Icons.favorite_rounded, Color(0xFFE0475B)),
  ('Care', Icons.volunteer_activism_rounded, Color(0xFFE8A33A)),
  ('Haha', Icons.sentiment_very_satisfied_rounded, Color(0xFFE8B23A)),
  ('Excellent', Icons.star_rounded, Color(0xFFB5832F)),
  ('Angry', Icons.sentiment_very_dissatisfied_rounded, Color(0xFFD9622B)),
];
(String, IconData, Color) reactionOf(String? k) => reactions.firstWhere((r) => r.$1 == k, orElse: () => reactions.first);

Widget verifiedTick({double size = 16}) => Padding(padding: const EdgeInsets.only(left: 4), child: Icon(Icons.verified_rounded, size: size, color: AppColors.accent));

/// Long-press (or tap the arrow) to pick a reaction, like Facebook.
Future<String?> pickReaction(BuildContext context) => showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (_) => SafeArea(child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 18, 12, 18),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
          for (final (k, icon, color) in reactions)
            InkWell(borderRadius: BorderRadius.circular(30), onTap: () => Navigator.pop(context, k), child: Padding(padding: const EdgeInsets.all(6), child: Column(mainAxisSize: MainAxisSize.min, children: [
              CircleAvatar(radius: 22, backgroundColor: color.withValues(alpha: 0.14), child: Icon(icon, color: color, size: 26)),
              const SizedBox(height: 4),
              Text(k, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600)),
            ]))),
        ]),
      )),
    );

/* ======================= Community shell with the Facebook-style tab bar ======================= */

class CommunityScreen extends StatefulWidget {
  const CommunityScreen({super.key});
  @override
  State<CommunityScreen> createState() => _CommunityScreenState();
}

class _CommunityScreenState extends State<CommunityScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 4, vsync: this);
  Map<String, dynamic> _counts = {'notifications': 0, 'requests': 0};
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _refreshCounts();
    _timer = Timer.periodic(const Duration(seconds: 45), (_) => _refreshCounts());
  }

  @override
  void dispose() { _timer?.cancel(); _tabs.dispose(); super.dispose(); }

  Future<void> _refreshCounts() async {
    try { final c = await api.communityCounts(); if (mounted) setState(() => _counts = c); } catch (_) {}
  }

  Widget _tab(IconData icon, int badge) => Tab(height: 50, child: Stack(clipBehavior: Clip.none, children: [
        Icon(icon, size: 27),
        if (badge > 0) Positioned(right: -10, top: -6, child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
          decoration: BoxDecoration(color: const Color(0xFFE41E3F), borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.white, width: 1.5)),
          child: Text(badge > 9 ? '9+' : '$badge', style: const TextStyle(color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.w800)),
        )),
      ]));

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          titleSpacing: 16,
          title: Row(children: [
            Image.asset('assets/images/logo-mark.png', height: 30),
            const SizedBox(width: 8),
            const Text('Community', style: TextStyle(fontWeight: FontWeight.w800)),
          ]),
          actions: [
            IconButton(tooltip: 'Search', onPressed: () => context.push('/community-search'), icon: const Icon(Icons.search_rounded)),
            const SizedBox(width: 4),
          ],
          bottom: TabBar(
            controller: _tabs,
            labelColor: AppColors.accent,
            unselectedLabelColor: AppColors.faint,
            indicatorColor: AppColors.accent,
            indicatorWeight: 3,
            onTap: (i) { if (i == 1 || i == 2) Future.delayed(const Duration(seconds: 1), _refreshCounts); },
            tabs: [
              _tab(Icons.home_rounded, 0),
              _tab(Icons.people_alt_rounded, (_counts['requests'] as num?)?.toInt() ?? 0),
              _tab(Icons.notifications_rounded, (_counts['notifications'] as num?)?.toInt() ?? 0),
              _tab(Icons.account_circle_rounded, 0),
            ],
          ),
        ),
        body: TabBarView(controller: _tabs, children: [
          const FeedView(),
          FriendsView(onChanged: _refreshCounts),
          CommunityNotificationsView(onRead: _refreshCounts),
          PersonProfileView(userId: session.user?.id ?? '', embedded: true),
        ]),
      );
}

/* ======================= Feed ======================= */

class FeedView extends StatefulWidget {
  const FeedView({super.key});
  @override
  State<FeedView> createState() => _FeedViewState();
}

class _FeedViewState extends State<FeedView> with AutomaticKeepAliveClientMixin {
  final List<Map> _posts = [];
  String? _next;
  String? _kind;
  String _view = '';
  bool _loading = true;
  String? _error;
  Map? _page;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
    api.officialPage().then((p) { if (mounted) setState(() => _page = p); }).catchError((_) {});
  }

  Future<void> _load({bool more = false}) async {
    setState(() { _loading = true; _error = null; });
    try {
      if (_view == 'pending') {
        final list = (await api.pendingPosts()).cast<Map>();
        if (mounted) setState(() { _posts..clear()..addAll(list); _next = null; });
      } else {
        final r = await api.communityFeed(kind: _kind, mine: _view == 'mine', before: more ? _next : null);
        final list = (r['posts'] as List).cast<Map>();
        if (mounted) setState(() { if (!more) _posts.clear(); _posts.addAll(list); _next = r['nextBefore'] as String?; });
      }
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _compose() async {
    final post = await showPanel<Map>(context, (_) => const PostComposer());
    if (post == null || !mounted) return;
    if (post['status'] == 'Approved') setState(() => _posts.insert(0, post));
    showSnack(context, post['status'] == 'Approved' ? 'Posted.' : 'Sent for a quick admin check. See it under "Waiting for approval".');
  }

  Widget _filter(String label, bool on, VoidCallback tap) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(label: Text(label), selected: on, onSelected: (_) => tap(), selectedColor: AppColors.ink, labelStyle: TextStyle(color: on ? Colors.white : AppColors.ink, fontWeight: FontWeight.w600)),
      );

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final me = session.user;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.only(bottom: 40), children: [
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
          child: Column(children: [
            Row(children: [
              ValueListenableBuilder(valueListenable: profileNotifier, builder: (_, p, __) => Avatar(name: me?.fullName, seed: me?.id, size: 42, photoId: p?['avatarId'], badge: p?['badge'])),
              const SizedBox(width: 10),
              Expanded(child: InkWell(
                onTap: _compose,
                borderRadius: BorderRadius.circular(30),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(color: const Color(0xFFF0F2F5), borderRadius: BorderRadius.circular(30)),
                  child: Text("What's new with your project, ${me?.firstName ?? ''}?", style: const TextStyle(color: AppColors.soft)),
                ),
              )),
            ]),
            const Divider(height: 18),
            Row(children: [
              Expanded(child: TextButton.icon(onPressed: _compose, icon: const Icon(Icons.photo_library_rounded, color: Color(0xFF2E9E6B)), label: const Text('Photo'))),
              Expanded(child: TextButton.icon(onPressed: _compose, icon: const Icon(Icons.description_rounded, color: Color(0xFF2F7FD1)), label: const Text('Report'))),
              Expanded(child: TextButton.icon(onPressed: _compose, icon: const Icon(Icons.star_rounded, color: Color(0xFFE8A33A)), label: const Text('Showcase'))),
            ]),
          ]),
        ),
        SizedBox(height: 52, child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.fromLTRB(12, 8, 12, 4), children: [
          _filter('All posts', _kind == null && _view.isEmpty, () { setState(() { _kind = null; _view = ''; }); _load(); }),
          for (final k in ['Showcase', 'Question', 'Report', 'Idea', 'Announcement']) _filter('${k}s', _kind == k, () { setState(() { _kind = k; _view = ''; }); _load(); }),
          _filter('My posts', _view == 'mine', () { setState(() { _kind = null; _view = 'mine'; }); _load(); }),
          _filter('Waiting for approval', _view == 'pending', () { setState(() { _kind = null; _view = 'pending'; }); _load(); }),
        ])),
        if (_page != null && _view.isEmpty && _kind == null) _PageCard(page: _page!, onChanged: (p) => setState(() => _page = p)),
        if (_loading && _posts.isEmpty) const Padding(padding: EdgeInsets.all(24), child: LoadingView()),
        if (_error != null) Padding(padding: const EdgeInsets.all(16), child: ErrorView(message: _error!, onRetry: _load)),
        if (!_loading && _error == null && _posts.isEmpty)
          Padding(padding: const EdgeInsets.all(16), child: EmptyState(icon: Icons.forum_outlined, title: _view == 'pending' ? 'Nothing waiting for approval' : 'No posts here yet', message: 'Share a screenshot, your report, a question or an idea.', action: 'Write a post', onAction: _compose)),
        for (final p in _posts) PostCard(key: ValueKey(p['id']), post: p, onRemoved: () => setState(() => _posts.remove(p)), onShared: (np) { if (np['status'] == 'Approved') setState(() => _posts.insert(0, np)); }),
        if (_next != null) Center(child: TextButton(onPressed: _loading ? null : () => _load(more: true), child: Text(_loading ? 'Loading…' : 'Show more posts'))),
      ]),
    );
  }
}

class _PageCard extends StatelessWidget {
  const _PageCard({required this.page, required this.onChanged});
  final Map page;
  final void Function(Map) onChanged;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 6, 12, 4),
        child: AppCard(
          onTap: () => context.push('/people/${page['id']}'),
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            Avatar(name: page['fullName'], seed: page['id'], size: 44, photoId: page['avatarId']),
            const SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [Text(page['fullName'] ?? '', style: const TextStyle(fontWeight: FontWeight.w800)), verifiedTick()]),
              Text('${page['followerCount']} followers · Official page', style: const TextStyle(color: AppColors.soft, fontSize: 12.5)),
            ])),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size(10, 38), backgroundColor: page['following'] == true ? AppColors.bg2 : AppColors.ink, foregroundColor: page['following'] == true ? AppColors.ink : Colors.white),
              onPressed: () async {
                try {
                  final on = await api.toggleFollow(page['id']);
                  onChanged({...page, 'following': on, 'followerCount': (page['followerCount'] as int) + (on ? 1 : -1)});
                } catch (e) { if (context.mounted) showSnack(context, errorText(e)); }
              },
              child: Text(page['following'] == true ? 'Following' : 'Follow'),
            ),
          ]),
        ),
      );
}

/* ======================= Post card ======================= */

class PostCard extends StatefulWidget {
  const PostCard({super.key, required this.post, this.onRemoved, this.onShared, this.nested = false});
  final Map post;
  final VoidCallback? onRemoved;
  final void Function(Map)? onShared;
  final bool nested;
  @override
  State<PostCard> createState() => _PostCardState();
}

class _PostCardState extends State<PostCard> {
  late Map _p = widget.post;
  late Map<String, int> _counts = Map<String, int>.from((_p['reactions'] as Map? ?? {}).map((k, v) => MapEntry(k as String, (v as num).toInt())));
  late int _total = (_p['likeCount'] as num?)?.toInt() ?? 0;
  late String? _mine = _p['myReaction'] as String?;
  late int _comments = (_p['commentCount'] as num?)?.toInt() ?? 0;

  Future<void> _react(String? type) async {
    try {
      final r = await api.react(_p['id'], type ?? _mine ?? 'Like');
      setState(() {
        _counts = Map<String, int>.from((r['reactions'] as Map).map((k, v) => MapEntry(k as String, (v as num).toInt())));
        _total = (r['total'] as num).toInt();
        _mine = r['myReaction'] as String?;
      });
    } catch (e) { if (mounted) showSnack(context, errorText(e)); }
  }

  Future<void> _openComments() async {
    await showModalBottomSheet(context: context, isScrollControlled: true, backgroundColor: Colors.white, useSafeArea: true,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
        builder: (_) => CommentsSheet(post: _p, onCount: (d) => setState(() => _comments += d)));
  }

  Future<void> _share() async {
    final original = (_p['sharedPost'] as Map?) ?? _p;
    final link = '${AppConfig.webUrl}/community?post=${original['id']}';
    final choice = await showPanel<String>(context, (c) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Padding(padding: EdgeInsets.fromLTRB(4, 0, 4, 10), child: Text('Share', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
          ListTile(leading: const Icon(Icons.dynamic_feed_rounded, color: AppColors.accent), title: const Text('Share to feed'), subtitle: const Text('Post it on your profile with your own caption'), onTap: () => Navigator.pop(c, 'feed')),
          ListTile(leading: const Icon(Icons.ios_share_rounded), title: const Text('Share outside the app'), subtitle: const Text('WhatsApp, email and more'), onTap: () => Navigator.pop(c, 'system')),
          ListTile(leading: const Icon(Icons.link_rounded), title: const Text('Copy link'), onTap: () => Navigator.pop(c, 'copy')),
        ]));
    if (!mounted || choice == null) return;
    if (choice == 'system') {
      final title = (original['projectTitle'] ?? original['content'] ?? '').toString();
      SharePlus.instance.share(ShareParams(text: '${original['authorName']} on ProjectMentor: ${title.length > 80 ? '${title.substring(0, 80)}…' : title}\n$link', subject: 'ProjectMentor community'));
    } else if (choice == 'copy') {
      await copyText(link);
      if (mounted) showSnack(context, 'Link copied');
    } else {
      final np = await showPanel<Map>(context, (_) => _ShareSheet(post: original));
      if (np != null && mounted) {
        widget.onShared?.call(np);
        showSnack(context, np['status'] == 'Approved' ? 'Shared to your feed' : 'Shared. Your caption will appear after an admin checks it.');
      }
    }
  }

  Future<void> _menu() async {
    final choice = await showPanel<String>(context, (c) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (_p['canEdit'] == true) ListTile(leading: const Icon(Icons.edit_rounded), title: const Text('Edit post'), onTap: () => Navigator.pop(c, 'edit')),
          if (_p['canEdit'] == true)
            for (final (v, l, icon) in audiences)
              ListTile(leading: Icon(icon), title: Text('Who can see this: $l'), trailing: _p['visibility'] == v ? const Icon(Icons.check_rounded, color: AppColors.accent) : null, onTap: () => Navigator.pop(c, 'aud:$v')),
          if (_p['canDelete'] == true) ListTile(leading: const Icon(Icons.delete_outline_rounded, color: AppColors.danger), title: const Text('Delete post', style: TextStyle(color: AppColors.danger)), onTap: () => Navigator.pop(c, 'delete')),
        ]));
    if (!mounted || choice == null) return;
    try {
      if (choice == 'delete') {
        if (!await confirm(context, title: 'Delete post?', message: 'This cannot be undone.', ok: 'Delete', danger: true)) return;
        await api.deletePost(_p['id']);
        widget.onRemoved?.call();
      } else if (choice.startsWith('aud:')) {
        final p = await api.updatePost(_p['id'], {'visibility': choice.substring(4)});
        setState(() => _p = p);
      } else {
        final text = await promptText(context, title: 'Edit post', initial: _p['content'] ?? '', multiline: true);
        if (text == null) return;
        final p = await api.updatePost(_p['id'], {'content': text});
        setState(() => _p = p);
        if (p['status'] == 'Pending' && mounted) showSnack(context, 'Saved. The edited post is back with an admin for a quick check.');
      }
    } catch (e) { if (mounted) showSnack(context, errorText(e)); }
  }

  @override
  Widget build(BuildContext context) {
    final p = _p;
    final files = ((p['attachments'] as List?) ?? const []).cast<Map>();
    final images = files.where((f) => (f['contentType'] as String).startsWith('image/')).toList();
    final docs = files.where((f) => !(f['contentType'] as String).startsWith('image/')).toList();
    final aud = audienceOf(p['visibility']);
    final r = reactionOf(_mine);
    final top = (_counts.entries.where((e) => e.value > 0).toList()..sort((a, b) => b.value.compareTo(a.value))).take(3).toList();
    final body = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 4, 0),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          GestureDetector(onTap: () => context.push('/people/${p['authorId']}'), child: Avatar(name: p['authorName'], seed: p['authorId'], size: 42, photoId: p['authorAvatarId'], badge: p['authorBadge'])),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Wrap(crossAxisAlignment: WrapCrossAlignment.center, children: [
              GestureDetector(onTap: () => context.push('/people/${p['authorId']}'), child: Text(p['authorName'] ?? '', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
              if (p['authorIsOfficial'] == true) verifiedTick(),
              if (p['sharedPost'] != null) const Text(' shared a post', style: TextStyle(color: AppColors.soft)),
              if (p['groupName'] != null) Text(' · ${p['groupName']}', style: const TextStyle(color: AppColors.soft)),
            ]),
            const SizedBox(height: 2),
            Row(children: [
              Text(timeAgo(DateTime.tryParse(p['createdAt'] ?? '')?.toLocal()), style: const TextStyle(color: AppColors.faint, fontSize: 12.5)),
              if (p['editedAt'] != null) const Text(' · Edited', style: TextStyle(color: AppColors.faint, fontSize: 12.5)),
              const Text(' · ', style: TextStyle(color: AppColors.faint)),
              Icon(aud.$3, size: 13, color: AppColors.faint),
              if (p['kind'] != null && p['kind'] != 'Update') Container(margin: const EdgeInsets.only(left: 6), padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1), decoration: BoxDecoration(color: AppColors.bg2, borderRadius: BorderRadius.circular(999)), child: Text(p['kind'], style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppColors.soft))),
            ]),
          ])),
          if (!widget.nested && (p['canEdit'] == true || p['canDelete'] == true)) IconButton(onPressed: _menu, icon: const Icon(Icons.more_horiz_rounded, color: AppColors.soft)),
        ]),
      ),
      if (p['status'] != null && p['status'] != 'Approved')
        Container(margin: const EdgeInsets.fromLTRB(14, 10, 14, 0), padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: p['status'] == 'Pending' ? const Color(0xFFFFF2D9) : const Color(0xFFFCE8E6), borderRadius: BorderRadius.circular(10)),
            child: Text(p['status'] == 'Pending' ? 'Waiting for an admin to approve it.' : 'Not approved${p['moderationNote'] != null ? ': ${p['moderationNote']}' : '.'}', style: const TextStyle(fontWeight: FontWeight.w600))),
      if (p['projectTitle'] != null) Padding(padding: const EdgeInsets.fromLTRB(14, 10, 14, 0), child: Text(p['projectTitle'], style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
      if ((p['content'] as String?)?.isNotEmpty ?? false) Padding(padding: const EdgeInsets.fromLTRB(14, 8, 14, 0), child: Text(p['content'], style: const TextStyle(fontSize: 15, height: 1.45))),
      if (images.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 10), child: _ImageGrid(images: images)),
      for (final d in docs)
        Padding(padding: const EdgeInsets.fromLTRB(14, 8, 14, 0), child: AppCard(
          padding: const EdgeInsets.all(10),
          onTap: () async { try { showSnack(context, await saveAndOpen(await api.bytes('/api/uploads/${d['id']}'), d['fileName'])); } catch (e) { showSnack(context, errorText(e)); } },
          child: Row(children: [const Icon(Icons.insert_drive_file_rounded, color: AppColors.accent), const SizedBox(width: 10), Expanded(child: Text(d['fileName'], maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600))), Text(fileSize(d['size'] as num), style: const TextStyle(color: AppColors.faint))]),
        )),
      if (p['sharedPost'] != null)
        Container(margin: const EdgeInsets.fromLTRB(14, 10, 14, 0), decoration: BoxDecoration(border: Border.all(color: AppColors.line), borderRadius: BorderRadius.circular(12)), clipBehavior: Clip.antiAlias,
            child: PostCard(post: p['sharedPost'] as Map, nested: true)),
      if (p['sharedPostUnavailable'] == true)
        Container(margin: const EdgeInsets.fromLTRB(14, 10, 14, 0), padding: const EdgeInsets.all(14), decoration: BoxDecoration(border: Border.all(color: AppColors.line), borderRadius: BorderRadius.circular(12)), child: const Text('This content is no longer available.', style: TextStyle(color: AppColors.faint))),
      if (!widget.nested && (_total > 0 || _comments > 0 || ((p['shareCount'] as num?) ?? 0) > 0))
        Padding(padding: const EdgeInsets.fromLTRB(14, 10, 14, 0), child: Row(children: [
          for (final e in top) Padding(padding: const EdgeInsets.only(right: 2), child: Icon(reactionOf(e.key).$2, size: 17, color: reactionOf(e.key).$3)),
          if (_total > 0) Text(' $_total', style: const TextStyle(color: AppColors.soft)),
          const Spacer(),
          if (_comments > 0) GestureDetector(onTap: _openComments, child: Text('$_comments comment${_comments == 1 ? '' : 's'}', style: const TextStyle(color: AppColors.soft))),
          if (((p['shareCount'] as num?) ?? 0) > 0) Text('  ·  ${p['shareCount']} share${p['shareCount'] == 1 ? '' : 's'}', style: const TextStyle(color: AppColors.soft)),
        ])),
      if (!widget.nested && p['status'] == 'Approved') ...[
        const Divider(height: 16, indent: 12, endIndent: 12),
        Padding(padding: const EdgeInsets.fromLTRB(4, 0, 4, 4), child: Row(children: [
          Expanded(child: GestureDetector(
            onLongPress: () async { final k = await pickReaction(context); if (k != null) _react(k); },
            child: TextButton.icon(
              onPressed: () => _react(_mine ?? 'Like'),
              style: TextButton.styleFrom(foregroundColor: _mine != null ? r.$3 : AppColors.soft, minimumSize: const Size(10, 44)),
              icon: Icon(_mine != null ? r.$2 : Icons.thumb_up_outlined, size: 20),
              label: Text(_mine ?? 'Like', style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
          )),
          Expanded(child: TextButton.icon(onPressed: _openComments, style: TextButton.styleFrom(foregroundColor: AppColors.soft, minimumSize: const Size(10, 44)), icon: const Icon(Icons.mode_comment_outlined, size: 20), label: const Text('Comment', style: TextStyle(fontWeight: FontWeight.w700)))),
          Expanded(child: TextButton.icon(onPressed: _share, style: TextButton.styleFrom(foregroundColor: AppColors.soft, minimumSize: const Size(10, 44)), icon: const Icon(Icons.share_outlined, size: 20), label: const Text('Share', style: TextStyle(fontWeight: FontWeight.w700)))),
        ])),
      ] else const SizedBox(height: 12),
    ]);
    if (widget.nested) return body;
    return Container(margin: const EdgeInsets.only(top: 8), color: Colors.white, child: body);
  }
}

class _ImageGrid extends StatelessWidget {
  const _ImageGrid({required this.images});
  final List<Map> images;
  @override
  Widget build(BuildContext context) {
    void open(Map f) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => Scaffold(backgroundColor: Colors.black, appBar: AppBar(backgroundColor: Colors.black, foregroundColor: Colors.white),
        body: Center(child: InteractiveViewer(child: Image.network(api.uploadUrl(f['id'])))))));
    if (images.length == 1) {
      return GestureDetector(onTap: () => open(images.first), child: ConstrainedBox(constraints: const BoxConstraints(maxHeight: 420), child: Image.network(api.uploadUrl(images.first['id']), width: double.infinity, fit: BoxFit.cover)));
    }
    return GridView.count(
      crossAxisCount: 2, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), mainAxisSpacing: 2, crossAxisSpacing: 2,
      children: [for (final f in images.take(4)) GestureDetector(onTap: () => open(f), child: Image.network(api.uploadUrl(f['id']), fit: BoxFit.cover))],
    );
  }
}

class _ShareSheet extends StatefulWidget {
  const _ShareSheet({required this.post});
  final Map post;
  @override
  State<_ShareSheet> createState() => _ShareSheetState();
}

class _ShareSheetState extends State<_ShareSheet> {
  final _caption = TextEditingController();
  String _aud = 'Public';
  bool _busy = false;
  @override
  Widget build(BuildContext context) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Share to your feed', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
        const SizedBox(height: 12),
        TextField(controller: _caption, minLines: 2, maxLines: 5, decoration: const InputDecoration(hintText: 'Say something about this…')),
        const SizedBox(height: 10),
        SegmentedButton<String>(showSelectedIcon: false, segments: [for (final (v, l, i) in audiences) ButtonSegment(value: v, label: Text(l), icon: Icon(i, size: 16))], selected: {_aud}, onSelectionChanged: (s) => setState(() => _aud = s.first)),
        const SizedBox(height: 10),
        Container(decoration: BoxDecoration(border: Border.all(color: AppColors.line), borderRadius: BorderRadius.circular(12)), clipBehavior: Clip.antiAlias, child: PostCard(post: widget.post, nested: true)),
        const SizedBox(height: 14),
        FilledButton(onPressed: _busy ? null : () async {
          setState(() => _busy = true);
          try { final p = await api.sharePost(widget.post['id'], _caption.text.trim(), _aud); if (context.mounted) Navigator.pop(context, p); }
          catch (e) { if (context.mounted) showSnack(context, errorText(e)); setState(() => _busy = false); }
        }, child: Text(_busy ? 'Sharing…' : 'Share now')),
      ]);
}

/* ======================= Comments with replies and reactions ======================= */

class CommentsSheet extends StatefulWidget {
  const CommentsSheet({super.key, required this.post, required this.onCount});
  final Map post;
  final void Function(int) onCount;
  @override
  State<CommentsSheet> createState() => _CommentsSheetState();
}

class _CommentsSheetState extends State<CommentsSheet> {
  List<Map> _list = [];
  bool _loading = true;
  Map? _replyTo;
  final _text = TextEditingController();
  final _focus = FocusNode();

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try { final l = (await api.comments(widget.post['id'])).cast<Map>(); if (mounted) setState(() => _list = l); }
    catch (e) { if (mounted) showSnack(context, errorText(e)); }
    finally { if (mounted) setState(() => _loading = false); }
  }

  Future<void> _send() async {
    final t = _text.text.trim();
    if (t.isEmpty) return;
    try {
      final c = await api.reply(widget.post['id'], t, _replyTo?['id']);
      setState(() { _list.add(c); _text.clear(); _replyTo = null; });
      widget.onCount(1);
    } catch (e) { if (mounted) showSnack(context, errorText(e)); }
  }

  Future<void> _actions(Map c) async {
    final choice = await showPanel<String>(context, (s) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          ListTile(leading: const Icon(Icons.add_reaction_outlined), title: const Text('React'), onTap: () => Navigator.pop(s, 'react')),
          ListTile(leading: const Icon(Icons.reply_rounded), title: const Text('Reply'), onTap: () => Navigator.pop(s, 'reply')),
          if (c['canEdit'] == true) ListTile(leading: const Icon(Icons.edit_rounded), title: const Text('Edit'), onTap: () => Navigator.pop(s, 'edit')),
          if (c['canDelete'] == true) ListTile(leading: const Icon(Icons.delete_outline_rounded, color: AppColors.danger), title: const Text('Delete', style: TextStyle(color: AppColors.danger)), onTap: () => Navigator.pop(s, 'delete')),
        ]));
    if (!mounted || choice == null) return;
    try {
      if (choice == 'react') {
        final k = await pickReaction(context);
        if (k == null) return;
        final r = await api.reactComment(c['id'], k);
        setState(() { c['reactions'] = r['reactions']; c['reactionTotal'] = r['total']; c['myReaction'] = r['myReaction']; });
      } else if (choice == 'reply') {
        _startReply(c);
      } else if (choice == 'edit') {
        final t = await promptText(context, title: 'Edit comment', initial: c['content'] ?? '', multiline: true);
        if (t == null) return;
        final u = await api.editComment(c['id'], t);
        setState(() { final i = _list.indexWhere((x) => x['id'] == c['id']); if (i >= 0) _list[i] = u; });
      } else {
        if (!await confirm(context, title: 'Delete comment?', message: 'Its replies are deleted too.', ok: 'Delete', danger: true)) return;
        await api.deleteComment(c['id']);
        final gone = _list.where((x) => x['id'] == c['id'] || x['parentId'] == c['id']).length;
        setState(() => _list.removeWhere((x) => x['id'] == c['id'] || x['parentId'] == c['id']));
        widget.onCount(-gone);
      }
    } catch (e) { if (mounted) showSnack(context, errorText(e)); }
  }

  void _startReply(Map c) {
    final top = c['parentId'] == null ? c : _list.firstWhere((x) => x['id'] == c['parentId'], orElse: () => c);
    setState(() => _replyTo = top);
    if (c['authorId'] != session.user?.id) _text.text = '@${(c['authorName'] as String).split(' ').first} ';
    _focus.requestFocus();
  }

  Widget _comment(Map c, {bool reply = false}) {
    final total = (c['reactionTotal'] as num?)?.toInt() ?? 0;
    final mine = c['myReaction'] as String?;
    return Padding(
      padding: EdgeInsets.only(left: reply ? 46 : 0, bottom: 10),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        GestureDetector(onTap: () => context.push('/people/${c['authorId']}'), child: Avatar(name: c['authorName'], seed: c['authorId'], size: reply ? 28 : 36, photoId: c['authorAvatarId'], badge: c['authorBadge'])),
        const SizedBox(width: 8),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          GestureDetector(
            onLongPress: () => _actions(c),
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 9),
              decoration: BoxDecoration(color: const Color(0xFFF0F2F5), borderRadius: BorderRadius.circular(16)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(mainAxisSize: MainAxisSize.min, children: [Text(c['authorName'] ?? '', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)), if (c['authorIsOfficial'] == true) verifiedTick(size: 13)]),
                const SizedBox(height: 2),
                Text(c['content'] ?? '', style: const TextStyle(height: 1.35)),
              ]),
            ),
          ),
          Padding(padding: const EdgeInsets.only(left: 10, top: 4), child: Wrap(spacing: 14, crossAxisAlignment: WrapCrossAlignment.center, children: [
            Text(timeAgo(DateTime.tryParse(c['createdAt'] ?? '')?.toLocal()) + (c['editedAt'] != null ? ' · Edited' : ''), style: const TextStyle(color: AppColors.faint, fontSize: 12)),
            GestureDetector(
              onTap: () async { try { final r = await api.reactComment(c['id'], mine ?? 'Like'); setState(() { c['reactions'] = r['reactions']; c['reactionTotal'] = r['total']; c['myReaction'] = r['myReaction']; }); } catch (e) { if (mounted) showSnack(context, errorText(e)); } },
              onLongPress: () async { final k = await pickReaction(context); if (k == null) return; final r = await api.reactComment(c['id'], k); setState(() { c['reactions'] = r['reactions']; c['reactionTotal'] = r['total']; c['myReaction'] = r['myReaction']; }); },
              child: Text(mine ?? 'Like', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: mine != null ? reactionOf(mine).$3 : AppColors.soft)),
            ),
            GestureDetector(onTap: () => _startReply(c), child: const Text('Reply', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: AppColors.soft))),
            if (c['canEdit'] == true || c['canDelete'] == true) GestureDetector(onTap: () => _actions(c), child: const Text('More', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: AppColors.soft))),
            if (total > 0) Row(mainAxisSize: MainAxisSize.min, children: [Icon(reactionOf(mine ?? ((c['reactions'] as Map?)?.keys.firstOrNull as String?)).$2, size: 14, color: reactionOf(mine ?? ((c['reactions'] as Map?)?.keys.firstOrNull as String?)).$3), Text(' $total', style: const TextStyle(fontSize: 12, color: AppColors.soft))]),
          ])),
        ])),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final top = _list.where((c) => c['parentId'] == null).toList();
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.82,
        child: Column(children: [
          const SizedBox(height: 10),
          Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.line, borderRadius: BorderRadius.circular(4))),
          const Padding(padding: EdgeInsets.all(12), child: Text('Comments', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17))),
          const Divider(height: 1),
          Expanded(child: _loading
              ? const LoadingView()
              : top.isEmpty
                  ? const Center(child: Text('No comments yet. Be the first to comment.', style: TextStyle(color: AppColors.faint)))
                  : ListView(padding: const EdgeInsets.fromLTRB(14, 14, 14, 10), children: [
                      for (final c in top) ...[_comment(c), for (final r in _list.where((x) => x['parentId'] == c['id'])) _comment(r, reply: true)],
                    ])),
          if (_replyTo != null)
            Container(color: AppColors.bg2, padding: const EdgeInsets.fromLTRB(16, 6, 6, 6), child: Row(children: [
              Expanded(child: Text('Replying to ${_replyTo!['authorName']}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
              IconButton(onPressed: () => setState(() { _replyTo = null; _text.clear(); }), icon: const Icon(Icons.close_rounded, size: 18)),
            ])),
          SafeArea(top: false, child: Padding(padding: const EdgeInsets.fromLTRB(12, 8, 8, 10), child: Row(children: [
            Expanded(child: TextField(controller: _text, focusNode: _focus, minLines: 1, maxLines: 4, textCapitalization: TextCapitalization.sentences,
                decoration: InputDecoration(hintText: _replyTo == null ? 'Write a comment…' : 'Write a reply…', filled: true, fillColor: const Color(0xFFF0F2F5), border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none), contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10)))),
            IconButton(onPressed: _send, icon: const Icon(Icons.send_rounded, color: AppColors.accent)),
          ]))),
        ]),
      ),
    );
  }
}

/* ======================= Composer ======================= */

class PostComposer extends StatefulWidget {
  const PostComposer({super.key});
  @override
  State<PostComposer> createState() => _PostComposerState();
}

class _PostComposerState extends State<PostComposer> {
  final _text = TextEditingController();
  final _title = TextEditingController();
  String _kind = 'Update';
  String _aud = 'Public';
  final List<XFile> _images = [];
  bool _busy = false;

  Future<void> _pick() async {
    final files = await ImagePicker().pickMultiImage(maxWidth: 1280, imageQuality: 80);
    setState(() => _images.addAll(files.take(6 - _images.length)));
  }

  Future<void> _post() async {
    if (_text.text.trim().isEmpty && _images.isEmpty) { showSnack(context, 'Write something or add a photo.'); return; }
    setState(() => _busy = true);
    try {
      final ids = <String>[];
      for (final f in _images) { ids.add((await api.upload(await f.readAsBytes(), f.name))['id']); }
      final p = await api.createPost({'content': _text.text.trim(), 'kind': _kind, 'projectTitle': _title.text.trim().isEmpty ? null : _title.text.trim(), 'uploadIds': ids, 'visibility': _aud});
      if (mounted) Navigator.pop(context, p);
    } catch (e) {
      if (mounted) { showSnack(context, errorText(e)); setState(() => _busy = false); }
    }
  }

  @override
  Widget build(BuildContext context) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Create post', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        SegmentedButton<String>(showSelectedIcon: false, segments: [for (final (v, l, i) in audiences) ButtonSegment(value: v, label: Text(l), icon: Icon(i, size: 16))], selected: {_aud}, onSelectionChanged: (s) => setState(() => _aud = s.first)),
        const SizedBox(height: 10),
        Wrap(spacing: 6, runSpacing: 6, children: [for (final k in _kinds) ChoiceChip(label: Text(k), selected: _kind == k, onSelected: (_) => setState(() => _kind = k))]),
        const SizedBox(height: 10),
        TextField(controller: _title, decoration: const InputDecoration(hintText: 'Project name (optional)')),
        const SizedBox(height: 10),
        TextField(controller: _text, autofocus: true, minLines: 4, maxLines: 8, textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(hintText: _kind == 'Question' ? 'What did you try, and what exactly went wrong?' : "What's new with your project?")),
        if (_images.isNotEmpty) ...[
          const SizedBox(height: 10),
          SizedBox(height: 84, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: _images.length, separatorBuilder: (_, __) => const SizedBox(width: 8), itemBuilder: (_, i) => Stack(children: [
            ClipRRect(borderRadius: BorderRadius.circular(10), child: FutureBuilder(future: _images[i].readAsBytes(), builder: (_, s) => s.hasData ? Image.memory(s.data!, width: 84, height: 84, fit: BoxFit.cover) : const SizedBox(width: 84, height: 84))),
            Positioned(right: 2, top: 2, child: GestureDetector(onTap: () => setState(() => _images.removeAt(i)), child: const CircleAvatar(radius: 11, backgroundColor: Colors.black54, child: Icon(Icons.close_rounded, size: 14, color: Colors.white)))),
          ]))),
        ],
        const SizedBox(height: 10),
        OutlinedButton.icon(onPressed: _images.length >= 6 ? null : _pick, icon: const Icon(Icons.photo_library_outlined), label: const Text('Add photos')),
        const SizedBox(height: 6),
        const Text('An admin checks every post before others can see it. Never share passwords or other people\'s personal details.', style: TextStyle(color: AppColors.faint, fontSize: 12.5)),
        const SizedBox(height: 12),
        FilledButton(onPressed: _busy ? null : _post, child: Text(_busy ? 'Posting…' : 'Post')),
      ]);
}

/* ======================= Friends & requests ======================= */

class FriendsView extends StatefulWidget {
  const FriendsView({super.key, required this.onChanged});
  final VoidCallback onChanged;
  @override
  State<FriendsView> createState() => _FriendsViewState();
}

class _FriendsViewState extends State<FriendsView> with AutomaticKeepAliveClientMixin {
  Map<String, dynamic>? _data;
  String _tab = 'received';
  String? _error;

  @override
  bool get wantKeepAlive => true;
  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try { final d = await api.friends(); if (mounted) setState(() { _data = d; _error = null; }); }
    catch (e) { if (mounted) setState(() => _error = errorText(e)); }
  }

  Future<void> _run(Future<void> Function() f, String ok) async {
    try { await f(); if (mounted) showSnack(context, ok); await _load(); widget.onChanged(); }
    catch (e) { if (mounted) showSnack(context, errorText(e)); }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_error != null) return Padding(padding: const EdgeInsets.all(16), child: ErrorView(message: _error!, onRetry: _load));
    if (_data == null) return const LoadingView();
    final lists = {'received': _data!['received'], 'sent': _data!['sent'], 'friends': _data!['friends'], 'people': _data!['suggestions']};
    final list = (lists[_tab] as List).cast<Map>();
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.fromLTRB(14, 12, 14, 40), children: [
        const Text('Friends', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final (k, l) in [('received', 'Requests (${(lists['received'] as List).length})'), ('sent', 'Sent (${(lists['sent'] as List).length})'), ('friends', 'Your friends (${(lists['friends'] as List).length})'), ('people', 'People you may know')])
            ChoiceChip(label: Text(l), selected: _tab == k, onSelected: (_) => setState(() => _tab = k), selectedColor: AppColors.ink, labelStyle: TextStyle(color: _tab == k ? Colors.white : AppColors.ink, fontWeight: FontWeight.w600)),
        ]),
        const SizedBox(height: 14),
        if (list.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 30), child: Center(child: Text({'received': 'No new friend requests.', 'sent': 'No sent requests waiting.', 'friends': 'No friends yet. Find people under "People you may know".', 'people': 'No suggestions right now.'}[_tab]!, style: const TextStyle(color: AppColors.faint)))),
        for (final p in list)
          Padding(padding: const EdgeInsets.only(bottom: 10), child: AppCard(
            onTap: () => context.push('/people/${p['id']}'),
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              Avatar(name: p['fullName'], seed: p['id'], size: 56, photoId: p['avatarId'], badge: p['badge']),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(p['fullName'] ?? '', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                Text(((p['mutualFriends'] as num?) ?? 0) > 0 ? '${p['mutualFriends']} mutual friends' : (p['subtitle'] ?? 'Student'), style: const TextStyle(color: AppColors.soft, fontSize: 12.5)),
                const SizedBox(height: 8),
                if (_tab == 'received') Row(children: [
                  Expanded(child: FilledButton(style: FilledButton.styleFrom(minimumSize: const Size(10, 38)), onPressed: () => _run(() => api.acceptFriend(p['id']), 'You are now friends'), child: const Text('Confirm'))),
                  const SizedBox(width: 8),
                  Expanded(child: OutlinedButton(style: OutlinedButton.styleFrom(minimumSize: const Size(10, 38)), onPressed: () => _run(() => api.declineFriend(p['id']), 'Request removed'), child: const Text('Delete'))),
                ])
                else if (_tab == 'sent') OutlinedButton(style: OutlinedButton.styleFrom(minimumSize: const Size(10, 38)), onPressed: () => _run(() => api.removeFriend(p['id']), 'Request cancelled'), child: const Text('Cancel request'))
                else if (_tab == 'people') FilledButton.icon(style: FilledButton.styleFrom(minimumSize: const Size(10, 38)), onPressed: () => _run(() => api.sendFriendRequest(p['id']), 'Friend request sent'), icon: const Icon(Icons.person_add_alt_1_rounded, size: 18), label: const Text('Add friend')),
              ])),
            ]),
          )),
      ]),
    );
  }
}

/* ======================= Community notifications ======================= */

class CommunityNotificationsView extends StatefulWidget {
  const CommunityNotificationsView({super.key, required this.onRead});
  final VoidCallback onRead;
  @override
  State<CommunityNotificationsView> createState() => _CommunityNotificationsViewState();
}

class _CommunityNotificationsViewState extends State<CommunityNotificationsView> {
  List<Map> _items = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try { final r = await api.notifications(scope: 'Community'); if (mounted) setState(() => _items = (r['items'] as List).cast<Map>()); }
    catch (_) {}
    finally { if (mounted) setState(() => _loading = false); }
  }

  void _open(Map n) {
    if (n['isRead'] != true) { api.readNotification(n['id']).then((_) => widget.onRead()); setState(() => n['isRead'] = true); }
    final link = (n['link'] as String?) ?? '';
    final post = RegExp(r'post=([0-9a-f-]{36})').firstMatch(link)?.group(1);
    final person = RegExp(r'/profile/([0-9a-f-]{36})').firstMatch(link)?.group(1);
    if (post != null) { context.push('/posts/$post'); }
    else if (person != null) { context.push('/people/$person'); }
    else if (link.contains('requests')) { DefaultTabController.maybeOf(context); showSnack(context, 'Open the Friends tab to answer the request.'); }
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.fromLTRB(8, 12, 8, 40), children: [
          Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: Row(children: [
            const Expanded(child: Text('Notifications', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800))),
            TextButton(onPressed: () async { await api.readNotifications(scope: 'Community'); setState(() { for (final n in _items) { n['isRead'] = true; } }); widget.onRead(); }, child: const Text('Mark all read')),
          ])),
          if (_loading) const LoadingView()
          else if (_items.isEmpty) const Padding(padding: EdgeInsets.all(30), child: Center(child: Text("You're all caught up.", style: TextStyle(color: AppColors.faint)))),
          for (final n in _items)
            Material(
              color: n['isRead'] == true ? Colors.transparent : const Color(0xFFEEF6F7),
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => _open(n),
                child: Padding(padding: const EdgeInsets.all(10), child: Row(children: [
                  n['actorId'] != null
                      ? Avatar(initials: n['actorInitials'], seed: n['actorId'], size: 50, photoId: n['actorAvatarId'])
                      : const CircleAvatar(radius: 25, backgroundColor: AppColors.mint, child: Icon(Icons.notifications_rounded, color: AppColors.accent)),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(n['title'] ?? '', style: TextStyle(fontWeight: n['isRead'] == true ? FontWeight.w500 : FontWeight.w800)),
                    if (n['body'] != null) Text(n['body'], maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.soft, fontSize: 13)),
                    Text(timeAgo(DateTime.tryParse(n['createdAt'] ?? '')?.toLocal()), style: const TextStyle(color: AppColors.accent, fontWeight: FontWeight.w700, fontSize: 12)),
                  ])),
                  if (n['isRead'] != true) const CircleAvatar(radius: 5, backgroundColor: AppColors.accent),
                ])),
              ),
            ),
        ]),
      );
}

/* ======================= Search ======================= */

class CommunitySearchView extends StatefulWidget {
  const CommunitySearchView({super.key});
  @override
  State<CommunitySearchView> createState() => _CommunitySearchViewState();
}

class _CommunitySearchViewState extends State<CommunitySearchView> {
  Map<String, dynamic>? _res;
  Timer? _debounce;
  bool _loading = false;

  void _search(String q) {
    _debounce?.cancel();
    if (q.trim().isEmpty) { setState(() => _res = null); return; }
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      setState(() => _loading = true);
      try { final r = await api.communitySearch(q.trim()); if (mounted) setState(() => _res = r); }
      catch (e) { if (mounted) showSnack(context, errorText(e)); }
      finally { if (mounted) setState(() => _loading = false); }
    });
  }

  @override
  Widget build(BuildContext context) {
    final people = ((_res?['people'] as List?) ?? const []).cast<Map>();
    final posts = ((_res?['posts'] as List?) ?? const []).cast<Map>();
    return ListView(padding: const EdgeInsets.only(bottom: 40), children: [
      Padding(padding: const EdgeInsets.all(14), child: TextField(
        autofocus: false,
        onChanged: _search,
        decoration: InputDecoration(hintText: 'Search people and posts', prefixIcon: const Icon(Icons.search_rounded), filled: true, fillColor: const Color(0xFFF0F2F5), border: OutlineInputBorder(borderRadius: BorderRadius.circular(30), borderSide: BorderSide.none)),
      )),
      if (_loading) const LinearProgressIndicator(minHeight: 2),
      if (_res == null) const Padding(padding: EdgeInsets.all(30), child: Center(child: Text('Find classmates by name, university or skill, or search posts by topic.', textAlign: TextAlign.center, style: TextStyle(color: AppColors.faint)))),
      if (_res != null && people.isEmpty && posts.isEmpty) const Padding(padding: EdgeInsets.all(30), child: Center(child: Text('No results.', style: TextStyle(color: AppColors.faint)))),
      if (people.isNotEmpty) const Padding(padding: EdgeInsets.fromLTRB(16, 4, 16, 6), child: Text('People', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
      for (final p in people)
        ListTile(
          onTap: () => context.push('/people/${p['id']}'),
          leading: Avatar(name: p['fullName'], seed: p['id'], size: 44, photoId: p['avatarId'], badge: p['badge']),
          title: Row(children: [Flexible(child: Text(p['fullName'] ?? '', style: const TextStyle(fontWeight: FontWeight.w700))), if (p['isOfficial'] == true) verifiedTick()]),
          subtitle: Text(p['relationship'] == 'Friends' ? 'Friend' : (p['subtitle'] ?? 'Student')),
          trailing: const Icon(Icons.chevron_right_rounded),
        ),
      if (posts.isNotEmpty) const Padding(padding: EdgeInsets.fromLTRB(16, 12, 16, 0), child: Text('Posts', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
      for (final p in posts) PostCard(key: ValueKey('s${p['id']}'), post: p),
    ]);
  }
}

/* ======================= A person's community profile ======================= */

class PersonProfileView extends StatefulWidget {
  const PersonProfileView({super.key, required this.userId, this.embedded = false});
  final String userId;
  final bool embedded;
  @override
  State<PersonProfileView> createState() => _PersonProfileViewState();
}

class _PersonProfileViewState extends State<PersonProfileView> with AutomaticKeepAliveClientMixin {
  Map<String, dynamic>? _p;
  final List<Map> _posts = [];
  String? _error;
  String _tab = 'posts';
  List<Map>? _friends;

  @override
  bool get wantKeepAlive => true;
  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final r = await Future.wait([api.communityProfile(widget.userId), api.communityFeed(author: widget.userId)]);
      if (mounted) setState(() { _p = r[0]; _posts..clear()..addAll(((r[1]['posts'] as List?) ?? const []).cast<Map>()); _error = null; });
    } catch (e) { if (mounted) setState(() => _error = errorText(e)); }
  }

  Future<void> _relation(Future<String> Function() f) async {
    try { final rel = await f(); setState(() => _p!['relationship'] = rel); } catch (e) { if (mounted) showSnack(context, errorText(e)); }
  }

  Future<void> _cover() async {
    final file = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1800, imageQuality: 82);
    if (file == null) return;
    try { final r = await api.uploadCover(await file.readAsBytes(), file.name); setState(() => _p!['coverId'] = r['coverId']); } catch (e) { if (mounted) showSnack(context, errorText(e)); }
  }

  Widget _actions(Map p) {
    if (p['isSelf'] == true) {
      return Row(children: [
        Expanded(child: FilledButton.icon(onPressed: () async { final saved = await showPanel<Map>(context, (_) => _EditDetailsSheet(profile: p)); if (saved != null) setState(() => _p = Map<String, dynamic>.from(saved)); }, icon: const Icon(Icons.edit_rounded, size: 18), label: const Text('Edit details'))),
        const SizedBox(width: 8),
        OutlinedButton(onPressed: () => context.push('/profile'), child: const Text('Main profile')),
      ]);
    }
    if (p['isOfficial'] == true) {
      final on = p['following'] == true;
      return FilledButton(onPressed: () async { try { final f = await api.toggleFollow(p['id']); setState(() { p['following'] = f; p['followerCount'] = (p['followerCount'] as int) + (f ? 1 : -1); }); } catch (e) { if (mounted) showSnack(context, errorText(e)); } },
          style: FilledButton.styleFrom(backgroundColor: on ? AppColors.bg2 : AppColors.ink, foregroundColor: on ? AppColors.ink : Colors.white), child: Text(on ? 'Following' : 'Follow'));
    }
    return switch (p['relationship']) {
      'Friends' => OutlinedButton.icon(onPressed: () async { if (await confirm(context, title: 'Unfriend ${p['fullName']}?', message: 'You can send a new request later.', ok: 'Unfriend', danger: true)) _relation(() async { await api.removeFriend(p['id']); return 'None'; }); }, icon: const Icon(Icons.how_to_reg_rounded), label: const Text('Friends')),
      'RequestSent' => OutlinedButton(onPressed: () => _relation(() async { await api.removeFriend(p['id']); return 'None'; }), child: const Text('Cancel request')),
      'RequestReceived' => Row(children: [
          Expanded(child: FilledButton(onPressed: () => _relation(() => api.acceptFriend(p['id'])), child: const Text('Confirm request'))),
          const SizedBox(width: 8),
          Expanded(child: OutlinedButton(onPressed: () => _relation(() => api.declineFriend(p['id'])), child: const Text('Delete'))),
        ]),
      _ => FilledButton.icon(onPressed: () => _relation(() => api.sendFriendRequest(p['id'])), icon: const Icon(Icons.person_add_alt_1_rounded), label: const Text('Add friend')),
    };
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_error != null) return Padding(padding: const EdgeInsets.all(16), child: ErrorView(message: _error!, onRetry: _load));
    final p = _p;
    if (p == null) return const LoadingView();
    final facts = <(IconData, String)>[
      if (p['university'] != null) (Icons.school_rounded, 'Studies at ${p['university']}'),
      if (p['degree'] != null) (Icons.workspace_premium_rounded, p['degree']),
      if (p['yearOfStudy'] != null) (Icons.calendar_today_rounded, 'Year ${p['yearOfStudy']}'),
      if (p['location'] != null) (Icons.home_rounded, 'Lives in ${p['location']}'),
      if (p['birthday'] != null) (Icons.cake_rounded, 'Birthday ${p['birthday']}'),
      if (p['email'] != null) (Icons.mail_rounded, p['email']),
      if (p['skills'] != null) (Icons.bolt_rounded, p['skills']),
      if (p['githubUrl'] != null) (Icons.code_rounded, p['githubUrl']),
      if (p['linkedinUrl'] != null) (Icons.link_rounded, p['linkedinUrl']),
      if (p['website'] != null) (Icons.language_rounded, p['website']),
    ];
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.only(bottom: 40), children: [
        Container(color: Colors.white, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Stack(clipBehavior: Clip.none, children: [
            Container(
              height: 170, width: double.infinity,
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [AppColors.ink, AppColors.accent]),
                image: p['coverId'] != null ? DecorationImage(image: NetworkImage(api.uploadUrl(p['coverId'])), fit: BoxFit.cover) : null,
              ),
            ),
            if (p['isSelf'] == true)
              Positioned(right: 10, bottom: 10, child: Row(children: [
                FilledButton.icon(onPressed: _cover, style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: AppColors.ink, minimumSize: const Size(10, 36)), icon: const Icon(Icons.photo_camera_rounded, size: 18), label: Text(p['coverId'] == null ? 'Add cover' : 'Change')),
                if (p['coverId'] != null) ...[const SizedBox(width: 6), IconButton.filled(onPressed: () async { if (!await confirm(context, title: 'Remove cover photo?', message: '', ok: 'Remove', danger: true)) return; await api.removeCover(); setState(() => p['coverId'] = null); }, style: IconButton.styleFrom(backgroundColor: Colors.white, foregroundColor: AppColors.danger), icon: const Icon(Icons.delete_outline_rounded))],
              ])),
            Positioned(left: 16, bottom: -54, child: Container(padding: const EdgeInsets.all(4), decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle), child: Avatar(name: p['fullName'], seed: p['id'], size: 104, photoId: p['avatarId'], badge: p['badge']))),
          ]),
          const SizedBox(height: 62),
          Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [Flexible(child: Text(p['fullName'] ?? '', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800))), if (p['isOfficial'] == true) verifiedTick(size: 22)]),
            Text(p['isOfficial'] == true ? '${p['followerCount']} followers · Official page' : '${p['friendCount']} friends${((p['mutualFriends'] as num?) ?? 0) > 0 && p['isSelf'] != true ? ' · ${p['mutualFriends']} mutual' : ''}', style: const TextStyle(color: AppColors.soft, fontWeight: FontWeight.w600)),
            if (p['bio'] != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(p['bio'], style: const TextStyle(height: 1.4))),
            const SizedBox(height: 12),
            _actions(p),
            const SizedBox(height: 10),
          ])),
          Row(children: [
            for (final (k, l) in [('posts', 'Posts'), ('about', 'About'), if (p['isOfficial'] != true) ('friends', 'Friends')])
              Expanded(child: InkWell(onTap: () async { setState(() => _tab = k); if (k == 'friends' && _friends == null) { final f = await api.profileFriends(p['id']); if (mounted) setState(() => _friends = f.cast<Map>()); } },
                child: Container(padding: const EdgeInsets.symmetric(vertical: 12), decoration: BoxDecoration(border: Border(bottom: BorderSide(color: _tab == k ? AppColors.accent : Colors.transparent, width: 3))),
                    child: Text(l, textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w800, color: _tab == k ? AppColors.accent : AppColors.soft))))),
          ]),
        ])),
        if (_tab == 'posts') ...[
          if (_posts.isEmpty) const Padding(padding: EdgeInsets.all(30), child: Center(child: Text('No posts to show yet.', style: TextStyle(color: AppColors.faint)))),
          for (final post in _posts) PostCard(key: ValueKey('p${post['id']}'), post: post, onRemoved: () => setState(() => _posts.remove(post))),
        ],
        if (_tab == 'about')
          Container(margin: const EdgeInsets.only(top: 8), color: Colors.white, padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (facts.isEmpty) Text(p['isSelf'] == true ? 'Add your university, degree, skills and links with Edit details.' : 'Nothing to show here.', style: const TextStyle(color: AppColors.faint)),
            for (final (icon, text) in facts) Padding(padding: const EdgeInsets.only(bottom: 12), child: Row(children: [Icon(icon, color: AppColors.soft, size: 22), const SizedBox(width: 12), Expanded(child: Text(text, style: const TextStyle(fontSize: 15)))])),
            if (p['isSelf'] == true) const Text('Name, picture and email come from your main profile. Choose who can see each detail in Edit details.', style: TextStyle(color: AppColors.faint, fontSize: 12.5)),
          ])),
        if (_tab == 'friends')
          Container(margin: const EdgeInsets.only(top: 8), color: Colors.white, padding: const EdgeInsets.all(12), child: _friends == null ? const LoadingView() : _friends!.isEmpty
              ? const Padding(padding: EdgeInsets.all(20), child: Center(child: Text('No friends to show.', style: TextStyle(color: AppColors.faint))))
              : Column(children: [for (final f in _friends!) ListTile(onTap: () => context.push('/people/${f['id']}'), leading: Avatar(name: f['fullName'], seed: f['id'], size: 44, photoId: f['avatarId'], badge: f['badge']), title: Text(f['fullName'] ?? '', style: const TextStyle(fontWeight: FontWeight.w700)), subtitle: Text(((f['mutualFriends'] as num?) ?? 0) > 0 ? '${f['mutualFriends']} mutual friends' : 'Student'))])),
      ]),
    );
  }
}

/// Opened from posts, comments and search: someone's community profile on its own screen.
class PersonProfileScreen extends StatelessWidget {
  const PersonProfileScreen({super.key, required this.userId});
  final String userId;
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('Profile')), body: PersonProfileView(userId: userId));
}

/// One post on its own screen (from a notification or a shared link).
class PostScreen extends StatelessWidget {
  const PostScreen({super.key, required this.id});
  final String id;
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Post')),
        body: FutureBuilder<Map<String, dynamic>>(
          future: api.postById(id),
          builder: (_, s) => s.hasError
              ? const Padding(padding: EdgeInsets.all(20), child: EmptyState(icon: Icons.hide_source_rounded, title: 'Post not available', message: 'It may have been deleted or its audience changed.'))
              : !s.hasData ? const LoadingView() : ListView(children: [PostCard(post: s.data!)]),
        ),
      );
}

class _EditDetailsSheet extends StatefulWidget {
  const _EditDetailsSheet({required this.profile});
  final Map profile;
  @override
  State<_EditDetailsSheet> createState() => _EditDetailsSheetState();
}

class _EditDetailsSheetState extends State<_EditDetailsSheet> {
  late final Map<String, TextEditingController> _c = {
    for (final k in ['bio', 'university', 'degree', 'location', 'skills', 'githubUrl', 'linkedinUrl', 'website']) k: TextEditingController(text: widget.profile[k] ?? ''),
  };
  late String? _birthday = widget.profile['birthdayValue'] as String?;
  late bool _showYear = widget.profile['birthdayShowYear'] != false;
  late final Map<String, String> _vis = Map<String, String>.from((widget.profile['visibility'] as Map?) ?? {});
  bool _busy = false;

  Widget _vis_(String key) => DropdownButton<String>(
        value: _vis[key] ?? 'Public', underline: const SizedBox(), isDense: true,
        items: const [DropdownMenuItem(value: 'Public', child: Text('Public')), DropdownMenuItem(value: 'Friends', child: Text('Friends')), DropdownMenuItem(value: 'Private', child: Text('Only me'))],
        onChanged: (v) => setState(() => _vis[key] = v!),
      );

  Widget _field(String key, String label, String vis, {String? hint}) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
          Expanded(child: TextField(controller: _c[key], decoration: InputDecoration(labelText: label, hintText: hint, suffixIcon: IconButton(tooltip: 'Delete', icon: const Icon(Icons.clear_rounded, size: 18), onPressed: () => _c[key]!.clear())))),
          const SizedBox(width: 8),
          _vis_(vis),
        ]),
      );

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      final saved = await api.updateCommunityProfile({
        for (final e in _c.entries) e.key: e.value.text.trim().isEmpty ? null : e.value.text.trim(),
        'birthday': _birthday, 'birthdayShowYear': _showYear, 'visibility': _vis,
      });
      if (mounted) Navigator.pop(context, saved);
    } catch (e) {
      if (mounted) { showSnack(context, errorText(e)); setState(() => _busy = false); }
    }
  }

  @override
  Widget build(BuildContext context) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Edit details', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        const Text('Name, picture and email come from your main profile.', style: TextStyle(color: AppColors.faint, fontSize: 12.5)),
        const SizedBox(height: 12),
        TextField(controller: _c['bio'], maxLength: 500, minLines: 2, maxLines: 4, decoration: const InputDecoration(labelText: 'Bio')),
        _field('university', 'University', 'university'),
        _field('degree', 'Degree', 'degree'),
        _field('location', 'Lives in', 'location'),
        _field('skills', 'Skills', 'skills', hint: 'React, C#, UI design'),
        Row(children: [
          Expanded(child: OutlinedButton.icon(
            onPressed: () async {
              final d = await showDatePicker(context: context, firstDate: DateTime(1950), lastDate: DateTime.now(), initialDate: DateTime.tryParse(_birthday ?? '') ?? DateTime(2003));
              if (d != null) setState(() => _birthday = '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}');
            },
            icon: const Icon(Icons.cake_outlined),
            label: Text(_birthday == null ? 'Add birthday' : 'Birthday: $_birthday'),
          )),
          if (_birthday != null) IconButton(tooltip: 'Delete birthday', onPressed: () => setState(() => _birthday = null), icon: const Icon(Icons.clear_rounded)),
          _vis_('birthday'),
        ]),
        if (_birthday != null) CheckboxListTile(contentPadding: EdgeInsets.zero, value: _showYear, onChanged: (v) => setState(() => _showYear = v ?? true), title: const Text('Show the year')),
        const SizedBox(height: 6),
        _field('githubUrl', 'GitHub', 'links'),
        _field('linkedinUrl', 'LinkedIn', 'links'),
        _field('website', 'Website', 'links'),
        Row(children: [const Expanded(child: Text('Who can see my email')), _vis_('email')]),
        Row(children: [const Expanded(child: Text('Who can see my year of study')), _vis_('year')]),
        Row(children: [const Expanded(child: Text('Who can see my friends list')), _vis_('friends')]),
        const SizedBox(height: 12),
        FilledButton(onPressed: _busy ? null : _save, child: Text(_busy ? 'Saving…' : 'Save')),
      ]);
}

/// Search opened from the magnifier at the top of Community.
class CommunitySearchScreen extends StatelessWidget {
  const CommunitySearchScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('Search')), body: const CommunitySearchView());
}

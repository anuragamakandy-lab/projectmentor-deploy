import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../core/session.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import 'more_screens.dart';

/// Shared copy of the signed-in student's profile (photo + badge), so the home header and community show the same picture.
final profileNotifier = ValueNotifier<Map<String, dynamic>?>(null);

Future<Map<String, dynamic>?> refreshProfile() async {
  try {
    final p = await api.profile();
    profileNotifier.value = p;
    return p;
  } catch (_) {
    return profileNotifier.value;
  }
}

const _kindIcons = {
  'Roadmap': Icons.map_outlined, 'Milestone': Icons.flag_outlined, 'Viva': Icons.record_voice_over_outlined,
  'Post': Icons.forum_outlined, 'Group': Icons.groups_outlined, 'Task': Icons.task_alt_rounded,
};

/// The student's profile: details, picture, badge, progress, activity, notifications and account deletion.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  Map<String, dynamic>? _notes;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final results = await Future.wait([api.profile(), api.notifications(scope: 'System')]);
      profileNotifier.value = results[0];
      if (mounted) setState(() => _notes = results[1]);
      if ((results[1]['unread'] as int? ?? 0) > 0) api.readNotifications().catchError((_) {});
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  Future<void> _photo() async {
    final choice = await showAppSheet<String>(context, (ctx) => Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(leading: const Icon(Icons.photo_library_outlined), title: const Text('Choose from gallery'), onTap: () => Navigator.pop(ctx, 'gallery')),
          ListTile(leading: const Icon(Icons.photo_camera_outlined), title: const Text('Take a photo'), onTap: () => Navigator.pop(ctx, 'camera')),
          if (profileNotifier.value?['avatarId'] != null)
            ListTile(leading: const Icon(Icons.delete_outline, color: AppColors.danger), title: const Text('Remove photo', style: TextStyle(color: AppColors.danger)), onTap: () => Navigator.pop(ctx, 'remove')),
          const SizedBox(height: 12),
        ]));
    if (choice == null) return;
    setState(() => _busy = true);
    try {
      if (choice == 'remove') {
        await api.removeAvatar();
      } else {
        // The picker resizes and compresses the photo before upload (512 px, quality 80).
        final file = await ImagePicker().pickImage(source: choice == 'camera' ? ImageSource.camera : ImageSource.gallery, maxWidth: 512, maxHeight: 512, imageQuality: 80);
        if (file == null) return;
        await api.uploadAvatar(await file.readAsBytes(), file.name);
      }
      await refreshProfile();
      if (mounted) showSnack(context, choice == 'remove' ? 'Photo removed.' : 'Profile picture updated.');
    } catch (e) {
      if (mounted) showSnack(context, errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _edit(Map<String, dynamic> me) async {
    final name = TextEditingController(text: me['fullName']);
    final bio = TextEditingController(text: me['bio'] ?? '');
    int? year = me['yearOfStudy'];
    final saved = await showAppSheet<bool>(context, (ctx) => StatefulBuilder(builder: (ctx, setS) => Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const Text('Edit profile', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 14),
            TextField(controller: name, decoration: const InputDecoration(labelText: 'Full name')),
            const SizedBox(height: 12),
            DropdownButtonFormField<int?>(
              value: year,
              decoration: const InputDecoration(labelText: 'Year of study'),
              items: [const DropdownMenuItem(value: null, child: Text('Not set')), for (var y = 1; y <= 6; y++) DropdownMenuItem(value: y, child: Text('Year $y'))],
              onChanged: (v) => setS(() => year = v),
            ),
            const SizedBox(height: 12),
            TextField(controller: bio, maxLines: 3, maxLength: 500, decoration: const InputDecoration(labelText: 'Bio', hintText: 'What are you building?')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
          ]),
        )));
    if (saved != true) return;
    try {
      await api.updateProfile(name.text.trim(), year, bio.text.trim());
      await session.updateName(name.text.trim());
      await refreshProfile();
      if (mounted) showSnack(context, 'Profile updated.');
    } catch (e) {
      if (mounted) showSnack(context, errorText(e));
    }
  }

  Future<void> _delete(Map<String, dynamic> me) async {
    if (!await confirm(context, title: 'Delete your account?', message: 'Your roadmaps, groups you own, posts, mock vivas and progress are deleted for good. This cannot be undone.', ok: 'Continue', danger: true)) return;
    if (!mounted) return;
    final hasPassword = me['hasPassword'] == true;
    final c = TextEditingController();
    final value = await showAppSheet<String>(context, (ctx) => Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(hasPassword ? 'Enter your password to confirm' : 'Type ${me['email']} to confirm', style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            TextField(controller: c, obscureText: hasPassword, autofocus: true),
            const SizedBox(height: 12),
            FilledButton(style: FilledButton.styleFrom(backgroundColor: AppColors.danger), onPressed: () => Navigator.pop(ctx, c.text), child: const Text('Delete my account')),
          ]),
        ));
    if (value == null || value.isEmpty) return;
    try {
      await api.deleteAccount(password: hasPassword ? value : null, confirmEmail: hasPassword ? null : value);
      profileNotifier.value = null;
      await session.logout();
    } catch (e) {
      if (mounted) showSnack(context, errorText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My profile'), actions: [
        TextButton.icon(onPressed: () => context.push('/people/${session.user?.id}'), icon: const Icon(Icons.public_rounded, size: 18), label: const Text('Community profile')),
      ]),
      body: ValueListenableBuilder(
        valueListenable: profileNotifier,
        builder: (context, me, _) {
          if (me == null) return _error != null ? ErrorView(message: _error!, onRetry: _load) : const LoadingView();
          final usage = me['usage'] as Map;
          final s = usage['stats'] as Map;
          final activity = (usage['activity'] as List).cast<Map>();
          final progress = (usage['progress'] as List).cast<Map>();
          final notes = ((_notes?['items'] as List?) ?? const []).cast<Map>();
          final frame = badgeColors[me['badge']];
          return RefreshIndicator(
            onRefresh: _load,
            child: ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, 40), children: [
              FadeSlideIn(child: AppCard(child: Column(children: [
                GestureDetector(
                  onTap: _busy ? null : _photo,
                  child: Stack(clipBehavior: Clip.none, children: [
                    Avatar(name: me['fullName'], seed: me['id'], size: 96, photoId: me['avatarId'], badge: me['badge']),
                    Positioned(right: -6, top: -4, child: CircleAvatar(radius: 15, backgroundColor: AppColors.ink, child: _busy
                        ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.photo_camera_outlined, size: 16, color: Colors.white))),
                  ]),
                ),
                const SizedBox(height: 12),
                Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Flexible(child: Text(me['fullName'], textAlign: TextAlign.center, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800))),
                  BadgeChip(me['badge']),
                ]),
                const SizedBox(height: 2),
                Text('${me['email']}${me['yearOfStudy'] != null ? ' · Year ${me['yearOfStudy']}' : ''}', style: const TextStyle(color: AppColors.soft, fontSize: 13)),
                const SizedBox(height: 8),
                Text(me['bio'] ?? 'Add a short bio so your group and the community know what you are building.', textAlign: TextAlign.center,
                    style: TextStyle(color: me['bio'] == null ? AppColors.faint : AppColors.ink, height: 1.45)),
                if (frame != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text('${me['badge']} member — your badge frames your picture in the community.', textAlign: TextAlign.center, style: TextStyle(color: frame, fontWeight: FontWeight.w700, fontSize: 12.5))),
                const SizedBox(height: 12),
                OutlinedButton.icon(onPressed: () => _edit(Map<String, dynamic>.from(me)), icon: const Icon(Icons.edit_outlined, size: 18), label: const Text('Edit profile')),
              ]))),
              const SectionTitle('Current progress'),
              FadeSlideIn(delay: 80, child: AppCard(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  ProgressRing(percent: (s['progressPercent'] as int).toDouble(), size: 70),
                  const SizedBox(width: 14),
                  Expanded(child: Text(s['milestones'] == 0 ? 'Accept a roadmap to start tracking progress.' : 'You have finished ${s['milestonesDone']} of ${s['milestones']} milestones.', style: const TextStyle(color: AppColors.soft))),
                ]),
                for (final r in progress) ...[
                  const SizedBox(height: 12),
                  InkWell(
                    onTap: () => context.push('/roadmaps/${r['roadmapRequestId']}'),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(child: Text(r['title'], style: const TextStyle(fontWeight: FontWeight.w700))),
                        if (((r['overdue'] as num?) ?? 0) > 0) Container(margin: const EdgeInsets.only(right: 8), padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1), decoration: BoxDecoration(color: const Color(0xFFFCE8E6), borderRadius: BorderRadius.circular(999)), child: Text('${r['overdue']} overdue', style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700, fontSize: 11.5))),
                        Text('${r['done']}/${r['total']}', style: const TextStyle(color: AppColors.faint)),
                      ]),
                      const SizedBox(height: 5),
                      ClipRRect(borderRadius: BorderRadius.circular(6), child: LinearProgressIndicator(value: (r['total'] as int) == 0 ? 0 : (r['done'] as int) / (r['total'] as int), minHeight: 7)),
                    ]),
                  ),
                ],
                const SizedBox(height: 14),
                LayoutBuilder(builder: (context, c) {
                  final w = (c.maxWidth - 16) / 3;
                  return Wrap(spacing: 8, runSpacing: 8, children: [
                    for (final (k, label) in [('roadmaps', 'Roadmaps'), ('milestonesDone', 'Milestones'), ('vivasCompleted', 'Mock vivas'), ('posts', 'Posts'), ('reactionsReceived', 'Reactions'), ('tasksDone', 'Tasks done')])
                      Container(
                        width: w, height: 70,
                        decoration: BoxDecoration(color: AppColors.bg2, borderRadius: BorderRadius.circular(12)),
                        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                          Text('${s[k] ?? 0}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                          Text(label, style: const TextStyle(color: AppColors.soft, fontSize: 11.5)),
                        ]),
                      ),
                  ]);
                }),
              ]))),
              const SectionTitle('Recent activity'),
              FadeSlideIn(delay: 140, child: AppCard(child: activity.isEmpty
                  ? const Text('Your roadmaps, vivas, posts and finished tasks will appear here.', style: TextStyle(color: AppColors.soft))
                  : Column(children: [
                      for (final a in activity.take(15))
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          leading: CircleAvatar(radius: 16, backgroundColor: AppColors.mint, child: Icon(_kindIcons[a['kind']] ?? Icons.circle_outlined, size: 17, color: AppColors.accent)),
                          title: Text(a['text'], style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text(timeAgo(parseDate(a['at']))),
                        ),
                    ]))),
              const SectionTitle('Notifications'),
              AppCard(child: notes.isEmpty
                  ? const Text('No notifications yet.', style: TextStyle(color: AppColors.soft))
                  : Column(children: [
                      for (final n in notes)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          leading: Icon(n['isRead'] == true ? Icons.notifications_none_rounded : Icons.notifications_active_rounded, color: AppColors.accent),
                          title: Text(n['title'], style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text([if (n['body'] != null) n['body'], timeAgo(parseDate(n['createdAt']))].join('\n')),
                        ),
                    ])),
              const SizedBox(height: 20),
              OutlinedButton.icon(
                onPressed: () => confirmLogout(context),
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                icon: const Icon(Icons.logout_rounded),
                label: const Text('Log out'),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () => _delete(Map<String, dynamic>.from(me)),
                style: OutlinedButton.styleFrom(foregroundColor: AppColors.danger),
                icon: const Icon(Icons.delete_forever_outlined),
                label: const Text('Delete my account'),
              ),
            ]),
          );
        },
      ),
    );
  }
}

/// Small entrance animation for cards (fade + slide up). Cheap: one implicit animation per card.
class FadeSlideIn extends StatelessWidget {
  const FadeSlideIn({super.key, required this.child, this.delay = 0});
  final Widget child;
  final int delay;
  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: Duration(milliseconds: 420 + delay),
        curve: Interval(delay / (420 + delay), 1, curve: Curves.easeOutCubic),
        builder: (_, t, c) => Opacity(opacity: t, child: Transform.translate(offset: Offset(0, 16 * (1 - t)), child: c)),
        child: child,
      );
}

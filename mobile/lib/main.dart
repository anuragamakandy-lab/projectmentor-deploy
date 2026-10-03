import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import 'core/config.dart';
import 'core/session.dart';
import 'core/theme.dart';
import 'screens/auth_screens.dart';
import 'screens/community_screens.dart';
import 'screens/group_screens.dart';
import 'screens/home_screen.dart';
import 'screens/learn_screens.dart';
import 'screens/more_screens.dart';
import 'screens/roadmap_screens.dart';
import 'screens/shell.dart';
import 'screens/splash_screen.dart';
import 'screens/viva_screens.dart';
import 'screens/profile_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(statusBarColor: Colors.transparent, statusBarIconBrightness: Brightness.dark));
  await AppConfig.load();
  await session.restore();
  runApp(const ProjectMentorApp());
}

final _rootKey = GlobalKey<NavigatorState>();

const _public = {'/splash', '/welcome', '/login', '/register', '/forgot', '/contact'};

final router = GoRouter(
  navigatorKey: _rootKey,
  initialLocation: '/splash',
  refreshListenable: session,
  redirect: (context, state) {
    final loc = state.matchedLocation;
    if (loc == '/splash') return null;
    if (!session.isLoggedIn && !_public.contains(loc)) {
      if (loc.startsWith('/join')) session.pendingInvite = state.pathParameters['code'];
      return session.onboarded ? '/login' : '/welcome';
    }
    if (session.isLoggedIn && (loc == '/login' || loc == '/register' || loc == '/welcome' || loc == '/forgot')) {
      final invite = session.pendingInvite;
      if (invite != null) { session.pendingInvite = null; return '/join/$invite'; }
      return '/home';
    }
    return null;
  },
  routes: [
    GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
    GoRoute(path: '/welcome', builder: (_, __) => const OnboardingScreen()),
    GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
    GoRoute(path: '/register', builder: (_, __) => const RegisterScreen()),
    GoRoute(path: '/forgot', builder: (_, __) => const ForgotPasswordScreen()),
    GoRoute(path: '/contact', builder: (_, s) => ContactAdminScreen(prefill: s.extra as Map?)),
    StatefulShellRoute.indexedStack(
      builder: (context, state, shell) => AppShell(shell: shell),
      branches: [
        StatefulShellBranch(routes: [GoRoute(path: '/home', builder: (_, __) => const HomeScreen())]),
        StatefulShellBranch(routes: [GoRoute(path: '/roadmaps', builder: (_, __) => const RoadmapsScreen())]),
        StatefulShellBranch(routes: [GoRoute(path: '/groups', builder: (_, __) => const GroupsScreen())]),
        StatefulShellBranch(routes: [GoRoute(path: '/community', builder: (_, __) => const CommunityScreen())]),
        StatefulShellBranch(routes: [GoRoute(path: '/more', builder: (_, __) => const MoreScreen())]),
      ],
    ),
    GoRoute(parentNavigatorKey: _rootKey, path: '/roadmaps/new', builder: (_, __) => const NewRoadmapScreen()),
    GoRoute(parentNavigatorKey: _rootKey, path: '/roadmaps/:id', builder: (_, s) => RoadmapDetailScreen(id: s.pathParameters['id']!)),
    GoRoute(parentNavigatorKey: _rootKey, path: '/roadmaps/:id/agents', builder: (_, s) => AgentsScreen(id: s.pathParameters['id']!)),
    GoRoute(parentNavigatorKey: _rootKey, path: '/roadmaps/:id/ideas', builder: (_, s) => IdeasScreen(id: s.pathParameters['id']!)),
    GoRoute(parentNavigatorKey: _rootKey, path: '/roadmaps/:id/chat', builder: (_, s) => MentorChatScreen(id: s.pathParameters['id']!, extra: s.extra as Map<String, String>?)),
    GoRoute(parentNavigatorKey: _rootKey, path: '/groups/:id', builder: (_, s) => GroupWorkspaceScreen(id: s.pathParameters['id']!)),
    GoRoute(parentNavigatorKey: _rootKey, path: '/join', builder: (_, __) => const JoinGroupScreen()),
    GoRoute(parentNavigatorKey: _rootKey, path: '/join/:code', builder: (_, s) => JoinGroupScreen(code: s.pathParameters['code'])),
    GoRoute(parentNavigatorKey: _rootKey, path: '/viva', builder: (_, __) => const VivaHomeScreen()),
    GoRoute(parentNavigatorKey: _rootKey, path: '/viva/new', builder: (_, s) => VivaSetupScreen(roadmapId: s.uri.queryParameters['roadmap'])),
    GoRoute(parentNavigatorKey: _rootKey, path: '/viva/:id', builder: (_, s) => VivaRoomScreen(id: s.pathParameters['id']!)),
    GoRoute(parentNavigatorKey: _rootKey, path: '/learn', builder: (_, s) => LearnScreen(initialTrack: s.uri.queryParameters['track'])),
    GoRoute(parentNavigatorKey: _rootKey, path: '/learn/:track/:lesson', builder: (_, s) => LessonScreen(track: s.pathParameters['track']!, lessonId: s.pathParameters['lesson']!)),
    GoRoute(parentNavigatorKey: _rootKey, path: '/templates', builder: (_, __) => const TemplatesScreen()),
    GoRoute(parentNavigatorKey: _rootKey, path: '/resources', builder: (_, __) => const ResourcesScreen()),
    GoRoute(parentNavigatorKey: _rootKey, path: '/people/:id', builder: (_, s) => PersonProfileScreen(userId: s.pathParameters['id']!)),
    GoRoute(parentNavigatorKey: _rootKey, path: '/community-search', builder: (_, __) => const CommunitySearchScreen()),
    GoRoute(parentNavigatorKey: _rootKey, path: '/posts/:id', builder: (_, s) => PostScreen(id: s.pathParameters['id']!)),
    GoRoute(parentNavigatorKey: _rootKey, path: '/notifications', builder: (_, __) => const NotificationsScreen()),
    GoRoute(parentNavigatorKey: _rootKey, path: '/profile', builder: (_, __) => const ProfileScreen()),
  ],
);

class ProjectMentorApp extends StatelessWidget {
  const ProjectMentorApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp.router(
        title: 'ProjectMentor',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        routerConfig: router,
        // On a tablet or a wide browser window, keep the phone layout readable instead of stretching it.
        builder: (context, child) => LayoutBuilder(builder: (context, c) => c.maxWidth <= 640
            ? child!
            : ColoredBox(color: const Color(0xFFE9E3D6), child: Center(child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 480),
                child: ClipRect(child: MediaQuery(data: MediaQuery.of(context).copyWith(size: Size(480, c.maxHeight)), child: child!)),
              )))),
      );
}

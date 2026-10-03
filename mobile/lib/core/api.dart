import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'config.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.status, this.data});
  final String message;
  final int? status;
  /// The JSON body of the error, e.g. {code: deactivated, name, email, reason}.
  final Map? data;
  bool get isDeactivated => status == 403 && data?['code'] == 'deactivated';
  bool get isUnauthorized => status == 401;
  bool get isNotFound => status == 404;
  @override
  String toString() => message;
}

/// Thin client for the ProjectMentor REST API — the same endpoints the website uses.
class Api {
  Api._();
  static final Api instance = Api._();

  String? token;
  void Function()? onUnauthorized;
  final http.Client _http = http.Client();

  Uri _uri(String path, [Map<String, String?>? query]) {
    final q = <String, String>{};
    query?.forEach((k, v) { if (v != null && v.isNotEmpty) q[k] = v; });
    return Uri.parse('${AppConfig.apiUrl}$path').replace(queryParameters: q.isEmpty ? null : q);
  }

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<dynamic> _send(Future<http.Response> Function() request) async {
    http.Response res;
    try {
      res = await request().timeout(const Duration(seconds: 75));
    } on TimeoutException {
      throw ApiException('The server took too long to answer. Please try again.');
    } catch (_) {
      throw ApiException('Cannot reach the ProjectMentor server. Check your internet connection and try again.');
    }
    final text = utf8.decode(res.bodyBytes);
    dynamic body;
    if (text.isNotEmpty) {
      try { body = jsonDecode(text); } catch (_) { body = text; }
    }
    if (res.statusCode >= 200 && res.statusCode < 300) return body;
    if (res.statusCode == 401 && token != null) onUnauthorized?.call();
    String message;
    if (body is String && body.trim().isNotEmpty && body.length < 400) {
      message = body.trim();
    } else if (body is Map && body['message'] is String) {
      message = body['message'];
    } else if (body is Map && body['title'] is String) {
      message = body['title'];
    } else {
      message = switch (res.statusCode) {
        401 => 'Your session has expired. Please log in again.',
        403 => 'You do not have permission to do that.',
        404 => 'Not found.',
        503 => 'The AI is busy right now. Please try again in a moment.',
        _ => 'Something went wrong (${res.statusCode}). Please try again.',
      };
    }
    throw ApiException(message, status: res.statusCode, data: body is Map ? body : null);
  }

  Future<dynamic> get(String path, [Map<String, String?>? query]) => _send(() => _http.get(_uri(path, query), headers: _headers));
  Future<dynamic> post(String path, [Object? body]) => _send(() => _http.post(_uri(path), headers: _headers, body: jsonEncode(body ?? {})));
  Future<dynamic> put(String path, [Object? body]) => _send(() => _http.put(_uri(path), headers: _headers, body: jsonEncode(body ?? {})));
  Future<dynamic> patch(String path, [Object? body]) => _send(() => _http.patch(_uri(path), headers: _headers, body: jsonEncode(body ?? {})));
  Future<dynamic> delete(String path) => _send(() => _http.delete(_uri(path), headers: _headers));

  Future<Uint8List> bytes(String path) async {
    final res = await _http.get(_uri(path), headers: _headers).timeout(const Duration(seconds: 90));
    if (res.statusCode != 200) throw ApiException('Could not download the file (${res.statusCode}).', status: res.statusCode);
    return res.bodyBytes;
  }

  String uploadUrl(String id) => '${AppConfig.apiUrl}/api/uploads/$id';

  // ---------------- content managed in the admin panel ----------------
  Future<dynamic> learnContent() => get('/api/content/learn');

  // ---------------- auth ----------------
  Future<Map<String, dynamic>> login(String email, String password) async =>
      Map<String, dynamic>.from(await post('/api/auth/login', {'email': email, 'password': password}));
  /// Create account step 1: emails a 6-digit code. Returns {verificationToken, email, message}.
  Future<Map<String, dynamic>> registerStart(String name, String email, String password, int? year) async =>
      Map<String, dynamic>.from(await post('/api/auth/register/start', {'fullName': name, 'email': email, 'password': password, 'yearOfStudy': year}));
  /// Create account step 2: the emailed code creates the account.
  Future<Map<String, dynamic>> register(String name, String email, String password, int? year, String code, String token) async =>
      Map<String, dynamic>.from(await post('/api/auth/register', {'fullName': name, 'email': email, 'password': password, 'yearOfStudy': year, 'code': code, 'verificationToken': token}));

  // ---------------- roadmaps ----------------
  Future<List> roadmaps() async => await get('/api/roadmap-requests') as List;
  Future<Map<String, dynamic>> roadmap(String id) async => Map<String, dynamic>.from(await get('/api/roadmap-requests/$id'));
  Future<Map<String, dynamic>> draftRoadmap(Map<String, dynamic> intake) async => Map<String, dynamic>.from(await post('/api/roadmap-requests/draft', intake));
  Future<Map<String, dynamic>> suggestIdeas(String id, List<String> exclude) async =>
      Map<String, dynamic>.from(await post('/api/roadmap-requests/$id/ideas', {'exclude': exclude}));
  Future<List> chatHistory(String id) async => await get('/api/roadmap-requests/$id/chat') as List;
  Future<Map<String, dynamic>> sendChat(String id, String? message) async =>
      Map<String, dynamic>.from(await post('/api/roadmap-requests/$id/chat', {'message': message}));
  Future<Map<String, dynamic>> plan(String id, {String? title, String? summary}) async =>
      Map<String, dynamic>.from(await post('/api/roadmap-requests/$id/plan', title == null ? {} : {'title': title, 'summary': summary}));
  Future<void> renameRoadmap(String id, String title, {String? description}) => put('/api/roadmap-requests/$id/title', {'title': title, 'description': description});
  Future<Map<String, dynamic>> execution(String id) async => Map<String, dynamic>.from(await get('/api/roadmap-requests/$id/execution'));
  Future<Map<String, dynamic>> assistant(String id) async => Map<String, dynamic>.from(await get('/api/roadmap-requests/$id/assistant'));
  Future<Map<String, dynamic>> roadmapSummary(String id) async => Map<String, dynamic>.from(await get('/api/roadmap-requests/$id/summary'));
  Future<void> deleteRoadmap(String id) => delete('/api/roadmap-requests/$id');
  Future<void> acceptRoadmap(String roadmapId) => post('/api/roadmaps/$roadmapId/accept', {'comment': 'Accepted from the mobile app'});
  Future<void> reviseRoadmap(String roadmapId) => post('/api/roadmaps/$roadmapId/request-revision', {'comment': 'Please revise this roadmap'});
  Future<void> setMilestoneStatus(String milestoneId, String status) => put('/api/roadmaps/milestones/$milestoneId/status', {'status': status});
  Future<Uint8List> roadmapReport(String id) => bytes('/api/roadmap-requests/$id/report');

  // ---------------- resources ----------------
  Future<Map<String, dynamic>> resources({String? search, String? topic, String? type, String? level, String? price, bool bookmarked = false, bool linked = false, int page = 1, String sortBy = 'featured'}) async =>
      Map<String, dynamic>.from(await get('/api/resources', {'search': search, 'topic': topic, 'type': type, 'level': level, 'price': price,
        'bookmarked': bookmarked ? 'true' : null, 'linked': linked ? 'true' : null, 'page': '$page', 'pageSize': '20', 'sortBy': sortBy}));
  Future<bool> toggleBookmark(String id) async => (await post('/api/resources/$id/bookmark'))['bookmarked'] as bool;
  Future<Map<String, dynamic>> resourceFacets() async => Map<String, dynamic>.from(await get('/api/resources/facets'));

  // ---------------- groups ----------------
  Future<List> groups() async => await get('/api/groups') as List;
  Future<Map<String, dynamic>> group(String id) async => Map<String, dynamic>.from(await get('/api/groups/$id'));
  Future<Map<String, dynamic>> createGroup(String name, String? description, String? roadmapId) async =>
      Map<String, dynamic>.from(await post('/api/groups', {'name': name, 'description': description, 'roadmapRequestId': roadmapId}));
  Future<Map<String, dynamic>> updateGroup(String id, Map<String, dynamic> body) async => Map<String, dynamic>.from(await put('/api/groups/$id', body));
  Future<void> deleteGroup(String id) => delete('/api/groups/$id');
  Future<void> leaveGroup(String id) => post('/api/groups/$id/leave');
  Future<void> removeMember(String id, String userId) => delete('/api/groups/$id/members/$userId');
  Future<List> invites(String id) async => await get('/api/groups/$id/invites') as List;
  Future<Map<String, dynamic>> createInvite(String id, {int days = 7, int? maxUses}) async =>
      Map<String, dynamic>.from(await post('/api/groups/$id/invites', {'expiresInDays': days, 'maxUses': maxUses}));
  Future<void> revokeInvite(String id, String inviteId) => delete('/api/groups/$id/invites/$inviteId');
  Future<Map<String, dynamic>> previewInvite(String code) async => Map<String, dynamic>.from(await get('/api/groups/join/${Uri.encodeComponent(code)}'));
  Future<String> joinGroup(String code) async => (await post('/api/groups/join/${Uri.encodeComponent(code)}'))['groupId'] as String;
  Future<List> messages(String id, {String? after}) async => await get('/api/groups/$id/messages', {'after': after}) as List;
  Future<Map<String, dynamic>> sendMessage(String id, String content, {String? uploadId}) async =>
      Map<String, dynamic>.from(await post('/api/groups/$id/messages', {'content': content, 'uploadId': uploadId}));
  Future<Map<String, dynamic>> board(String id) async => Map<String, dynamic>.from(await get('/api/groups/$id/board'));
  Future<Map<String, dynamic>> createTask(String id, Map<String, dynamic> body) async => Map<String, dynamic>.from(await post('/api/groups/$id/board/tasks', body));
  Future<Map<String, dynamic>> updateTask(String id, String taskId, Map<String, dynamic> body) async =>
      Map<String, dynamic>.from(await patch('/api/groups/$id/board/tasks/$taskId', body));
  Future<Map<String, dynamic>> deleteTask(String id, String taskId) async => Map<String, dynamic>.from(await delete('/api/groups/$id/board/tasks/$taskId'));
  Future<Map<String, dynamic>> generateTasks(String id, {String? milestoneId}) async =>
      Map<String, dynamic>.from(await post('/api/groups/$id/board/generate', {'milestoneId': milestoneId, 'assignEvenly': true}));

  // ---------------- uploads ----------------
  Future<Map<String, dynamic>> upload(Uint8List data, String filename) async {
    final req = http.MultipartRequest('POST', _uri('/api/uploads'));
    if (token != null) req.headers['Authorization'] = 'Bearer $token';
    req.files.add(http.MultipartFile.fromBytes('file', data, filename: filename));
    final body = await _send(() async => http.Response.fromStream(await _http.send(req)));
    return Map<String, dynamic>.from(body);
  }

  // ---------------- community ----------------
  Future<Map<String, dynamic>> feed({String? kind, bool mine = false, String? q, String? before}) async =>
      Map<String, dynamic>.from(await get('/api/community/posts', {'kind': kind, 'mine': mine ? 'true' : null, 'q': q, 'before': before}));
  Future<Map<String, dynamic>> createPost(Map<String, dynamic> body) async => Map<String, dynamic>.from(await post('/api/community/posts', body));
  Future<void> deletePost(String id) => delete('/api/community/posts/$id');
  Future<Map<String, dynamic>> toggleLike(String id) async => Map<String, dynamic>.from(await post('/api/community/posts/$id/like'));
  Future<List> comments(String id) async => await get('/api/community/posts/$id/comments') as List;
  Future<Map<String, dynamic>> addComment(String id, String content) async =>
      Map<String, dynamic>.from(await post('/api/community/posts/$id/comments', {'content': content}));
  Future<void> deleteComment(String id) => delete('/api/community/comments/$id');

  // ---------------- mock viva ----------------
  Future<List> vivas() async => await get('/api/viva') as List;
  Future<Map<String, dynamic>> viva(String id) async => Map<String, dynamic>.from(await get('/api/viva/$id'));
  Future<Map<String, dynamic>> vivaPrefill(String roadmapId) async => Map<String, dynamic>.from(await get('/api/viva/prefill/$roadmapId'));
  Future<Map<String, dynamic>> startViva(Map<String, dynamic> body) async => Map<String, dynamic>.from(await post('/api/viva', body));
  Future<Map<String, dynamic>> answerViva(String id, String questionId, String answer, int seconds) async =>
      Map<String, dynamic>.from(await post('/api/viva/$id/answer', {'questionId': questionId, 'answer': answer, 'durationSeconds': seconds}));
  Future<Map<String, dynamic>> finishViva(String id) async => Map<String, dynamic>.from(await post('/api/viva/$id/finish'));
  Future<void> deleteViva(String id) => delete('/api/viva/$id');
  Future<List> vivaCharacters() async => await get('/api/viva/characters') as List;

  // ---------------- community extras ----------------
  Future<Map<String, dynamic>> react(String id, String reaction) async =>
      Map<String, dynamic>.from(await post('/api/community/posts/$id/react', {'reaction': reaction}));
  Future<List> pendingPosts() async => await get('/api/community/posts/pending') as List;
  Future<Map<String, dynamic>> postById(String id) async => Map<String, dynamic>.from(await get('/api/community/posts/$id'));

  // ---------------- profile & notifications ----------------
  Future<Map<String, dynamic>> profile() async => Map<String, dynamic>.from(await get('/api/profile'));
  Future<void> updateProfile(String fullName, int? year, String? bio) => put('/api/profile', {'fullName': fullName, 'yearOfStudy': year, 'bio': bio});
  Future<Map<String, dynamic>> uploadAvatar(Uint8List data, String filename) async {
    final req = http.MultipartRequest('POST', _uri('/api/profile/avatar'));
    if (token != null) req.headers['Authorization'] = 'Bearer $token';
    req.files.add(http.MultipartFile.fromBytes('file', data, filename: filename));
    return Map<String, dynamic>.from(await _send(() async => http.Response.fromStream(await _http.send(req))));
  }
  Future<void> removeAvatar() => delete('/api/profile/avatar');
  Future<void> deleteAccount({String? password, String? confirmEmail}) =>
      post('/api/profile/delete', {'password': password, 'confirmEmail': confirmEmail});
  Future<Map<String, dynamic>> notifications({String scope = 'System'}) async => Map<String, dynamic>.from(await get('/api/notifications', {'scope': scope}));
  Future<void> readNotifications({String scope = 'System'}) => post('/api/notifications/read?scope=$scope');
  Future<void> readNotification(String id) => post('/api/notifications/$id/read');

  // ---------------- community: Facebook-style ----------------
  Future<Map<String, dynamic>> communityFeed({String? kind, bool mine = false, String? q, String? before, String? author}) async =>
      Map<String, dynamic>.from(await get('/api/community/posts', {'kind': kind, 'mine': mine ? 'true' : null, 'q': q, 'before': before, 'author': author}));
  Future<Map<String, dynamic>> updatePost(String id, Map<String, dynamic> body) async => Map<String, dynamic>.from(await put('/api/community/posts/$id', body));
  Future<Map<String, dynamic>> sharePost(String id, String caption, String visibility) async =>
      Map<String, dynamic>.from(await post('/api/community/posts/$id/share', {'content': caption, 'visibility': visibility}));
  Future<Map<String, dynamic>> reply(String postId, String content, String? parentId) async =>
      Map<String, dynamic>.from(await post('/api/community/posts/$postId/comments', {'content': content, 'parentId': parentId}));
  Future<Map<String, dynamic>> editComment(String id, String content) async => Map<String, dynamic>.from(await put('/api/community/comments/$id', {'content': content}));
  Future<Map<String, dynamic>> reactComment(String id, String reaction) async => Map<String, dynamic>.from(await post('/api/community/comments/$id/react', {'reaction': reaction}));
  Future<Map<String, dynamic>> communitySearch(String q) async => Map<String, dynamic>.from(await get('/api/community/search', {'q': q}));
  Future<Map<String, dynamic>> friends() async => Map<String, dynamic>.from(await get('/api/community/friends'));
  Future<String> sendFriendRequest(String id) async => (await post('/api/community/friends/$id/request'))['relationship'] as String;
  Future<String> acceptFriend(String id) async => (await post('/api/community/friends/$id/accept'))['relationship'] as String;
  Future<String> declineFriend(String id) async => (await post('/api/community/friends/$id/decline'))['relationship'] as String;
  Future<void> removeFriend(String id) => delete('/api/community/friends/$id');
  Future<bool> toggleFollow(String pageId) async => (await post('/api/community/pages/$pageId/follow'))['following'] as bool;
  Future<Map<String, dynamic>> communityCounts() async => Map<String, dynamic>.from(await get('/api/community/counts'));
  Future<Map<String, dynamic>> officialPage() async => Map<String, dynamic>.from(await get('/api/community/page'));
  Future<Map<String, dynamic>> communityProfile(String id) async => Map<String, dynamic>.from(await get('/api/community/profiles/$id'));
  Future<List> profileFriends(String id) async => await get('/api/community/profiles/$id/friends') as List;
  Future<Map<String, dynamic>> updateCommunityProfile(Map<String, dynamic> body) async => Map<String, dynamic>.from(await put('/api/community/profile', body));
  Future<Map<String, dynamic>> uploadCover(Uint8List data, String filename) async {
    final req = http.MultipartRequest('POST', _uri('/api/community/profile/cover'));
    if (token != null) req.headers['Authorization'] = 'Bearer $token';
    req.files.add(http.MultipartFile.fromBytes('file', data, filename: filename));
    return Map<String, dynamic>.from(await _send(() async => http.Response.fromStream(await _http.send(req))));
  }
  Future<void> removeCover() => delete('/api/community/profile/cover');

  // ---------------- account help ----------------
  Future<String> forgotPassword(String email) async => (await post('/api/auth/forgot-password', {'email': email}))['message'] as String;
  Future<Map<String, dynamic>> resetPassword(String email, String code, String password) async =>
      Map<String, dynamic>.from(await post('/api/auth/reset-password', {'email': email, 'code': code, 'password': password}));
  Future<String> contactAdmin(Map<String, dynamic> body) async => (await post('/api/support', body))['message'] as String;

  // ---------------- Google sign-in ----------------
  Future<String?> googleClientId() async => (await get('/api/auth/config') as Map)['googleClientId'] as String?;
  Future<Map<String, dynamic>> googleSignIn(String idToken) async => Map<String, dynamic>.from(await post('/api/auth/google', {'idToken': idToken}));
  Future<Map<String, dynamic>> googleRegister(String idToken, String name, String password, int? year) async =>
      Map<String, dynamic>.from(await post('/api/auth/google/register', {'idToken': idToken, 'fullName': name, 'password': password, 'yearOfStudy': year}));
}

final api = Api.instance;

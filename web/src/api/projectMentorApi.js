const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5220';

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    });
  } catch {
    const error = new Error('Cannot reach the API — make sure the backend and database are running.');
    error.code = 'API_UNREACHABLE';
    throw error;
  }
  // The API returns JSON for data but plain text for friendly error messages — handle both.
  const text = await response.text().catch(() => '');
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    // An expired/invalid token on an authenticated request: clear the stale
    // session and send the user to log in, instead of leaving broken pages.
    const isAuthed = Boolean(options.headers?.Authorization);
    if (response.status === 401 && isAuthed) {
      try { localStorage.removeItem('projectmentor.auth'); sessionStorage.removeItem('projectmentor.auth'); } catch { /* ignore */ }
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.assign('/login?expired=1');
      }
    }
    const message = typeof body === 'string' ? body : body?.message ?? body?.title;
    const error = new Error(message || `Request failed (${response.status})`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

export function startRegistration(payload) {
  return request('/api/auth/register/start', { method: 'POST', body: JSON.stringify(payload) });
}

export function registerStudent(payload) {
  return request('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) });
}

export function login(payload) {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
}

export function createRoadmapRequest(token, payload) {
  return request('/api/roadmap-requests', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
}

export function getRoadmapRequest(token, id) {
  return request(`/api/roadmap-requests/${id}`, { headers: { Authorization: `Bearer ${token}` } });
}

export function getCurrentRoadmapRequest(token) {
  return request('/api/roadmap-requests/current', { headers: { Authorization: `Bearer ${token}` } });
}

export function listRoadmapRequests(token) {
  return request('/api/roadmap-requests', { headers: { Authorization: `Bearer ${token}` } });
}

export function renameRoadmapRequest(token, id, title, description = null) {
  return request(`/api/roadmap-requests/${id}/title`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ title, description }) });
}

export function deleteRoadmapRequest(token, id) {
  return request(`/api/roadmap-requests/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

export function getRoadmapExecution(token, id) {
  return request(`/api/roadmap-requests/${id}/execution`, { headers: { Authorization: `Bearer ${token}` } });
}

// --- Idea-suggestion flow ---

// Path A step 1: create a draft request (no planning yet).
export function draftRoadmapRequest(token, payload) {
  return request('/api/roadmap-requests/draft', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
}

// Path A step 2: get AI-suggested ideas (pass exclude titles to reshuffle).
export function suggestIdeas(token, id, exclude = []) {
  return request(`/api/roadmap-requests/${id}/ideas`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ exclude }) });
}

// Mentor chat — read the saved transcript.
export function getChatHistory(token, id) {
  return request(`/api/roadmap-requests/${id}/chat`, { headers: { Authorization: `Bearer ${token}` } });
}

// Mentor chat — send one message (or kick off with null), get the reply + full transcript.
export function sendChat(token, id, message) {
  return request(`/api/roadmap-requests/${id}/chat`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ message }) });
}

// Path A step 3 (and Path B): choose an idea (optional) and run the planning workflow.
export function planRoadmap(token, id, choice = null) {
  return request(`/api/roadmap-requests/${id}/plan`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(choice ?? {}) });
}

// Download the generated report as a file (authed endpoint → blob).
export async function downloadRoadmapReport(token, id) {
  const res = await fetch(`${API_URL}/api/roadmap-requests/${id}/report`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Could not generate the report. Make sure the roadmap is accepted.');
  const blob = await res.blob();
  const dispo = res.headers.get('Content-Disposition') || '';
  const match = dispo.match(/filename="?([^"]+)"?/);
  return { blob, filename: match ? match[1] : 'project_report.pdf' };
}

export function updateMilestoneStatus(token, milestoneId, status) {
  return request(`/api/roadmaps/milestones/${milestoneId}/status`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) });
}

export function acceptRoadmap(token, id) {
  return request(`/api/roadmaps/${id}/accept`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ comment: 'Accepted from React demo' }) });
}

export function requestRevision(token, id) {
  return request(`/api/roadmaps/${id}/request-revision`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ comment: 'Please revise this demo roadmap' }) });
}

// --- Component B: Resource Hub ---

export function searchResources(token, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  });
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request(`/api/resources${suffix}`, { headers: auth(token) });
}

export function getResourceFacets(token) {
  return request('/api/resources/facets', { headers: auth(token) });
}

export function createResource(token, payload) {
  return request('/api/resources', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
}

export function updateResource(token, id, payload) {
  return request(`/api/resources/${id}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
}

export function deleteResource(token, id) {
  return request(`/api/resources/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

// --- AI Mock Viva ---

export function listVivas(token) {
  return request('/api/viva', { headers: { Authorization: `Bearer ${token}` } });
}

export function getViva(token, id) {
  return request(`/api/viva/${id}`, { headers: { Authorization: `Bearer ${token}` } });
}

/** The student's own approved roadmaps plus approved roadmaps of their project groups. */
export function getVivaRoadmaps(token) {
  return request('/api/viva/roadmaps', { headers: { Authorization: `Bearer ${token}` } });
}

export function getVivaPrefill(token, roadmapRequestId) {
  return request(`/api/viva/prefill/${roadmapRequestId}`, { headers: { Authorization: `Bearer ${token}` } });
}

export function startViva(token, payload) {
  return request('/api/viva', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
}

export function answerViva(token, id, questionId, answer, durationSeconds) {
  return request(`/api/viva/${id}/answer`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ questionId, answer, durationSeconds }) });
}

export function finishViva(token, id) {
  return request(`/api/viva/${id}/finish`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
}

export function deleteViva(token, id) {
  return request(`/api/viva/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

// --- Groups, invitations, chat and sprint board ---
// Logged-out visitors call the public endpoints without a token.
const auth = token => (token ? { Authorization: `Bearer ${token}` } : {});

export const listGroups = token => request('/api/groups', { headers: auth(token) });
export const getGroup = (token, id) => request(`/api/groups/${id}`, { headers: auth(token) });
export const createGroup = (token, payload) => request('/api/groups', { method: 'POST', headers: auth(token), body: JSON.stringify(payload) });
export const updateGroup = (token, id, payload) => request(`/api/groups/${id}`, { method: 'PUT', headers: auth(token), body: JSON.stringify(payload) });
export const deleteGroup = (token, id) => request(`/api/groups/${id}`, { method: 'DELETE', headers: auth(token) });
export const leaveGroup = (token, id) => request(`/api/groups/${id}/leave`, { method: 'POST', headers: auth(token) });
export const removeGroupMember = (token, id, userId) => request(`/api/groups/${id}/members/${userId}`, { method: 'DELETE', headers: auth(token) });

export const listInvites = (token, id) => request(`/api/groups/${id}/invites`, { headers: auth(token) });
export const createInvite = (token, id, payload = {}) => request(`/api/groups/${id}/invites`, { method: 'POST', headers: auth(token), body: JSON.stringify(payload) });
export const revokeInvite = (token, id, inviteId) => request(`/api/groups/${id}/invites/${inviteId}`, { method: 'DELETE', headers: auth(token) });
export const previewInvite = (token, code) => request(`/api/groups/join/${encodeURIComponent(code)}`, { headers: auth(token) });
export const joinGroup = (token, code) => request(`/api/groups/join/${encodeURIComponent(code)}`, { method: 'POST', headers: auth(token) });

export const getMessages = (token, id, after) => request(`/api/groups/${id}/messages${after ? `?after=${encodeURIComponent(after)}` : ''}`, { headers: auth(token) });
export const sendMessage = (token, id, content, uploadId = null) => request(`/api/groups/${id}/messages`, { method: 'POST', headers: auth(token), body: JSON.stringify({ content, uploadId }) });

export const getBoard = (token, id) => request(`/api/groups/${id}/board`, { headers: auth(token) });
export const createTask = (token, id, payload) => request(`/api/groups/${id}/board/tasks`, { method: 'POST', headers: auth(token), body: JSON.stringify(payload) });
export const updateTask = (token, id, taskId, payload) => request(`/api/groups/${id}/board/tasks/${taskId}`, { method: 'PATCH', headers: auth(token), body: JSON.stringify(payload) });
export const deleteTask = (token, id, taskId) => request(`/api/groups/${id}/board/tasks/${taskId}`, { method: 'DELETE', headers: auth(token) });
export const generateTasks = (token, id, payload = {}) => request(`/api/groups/${id}/board/generate`, { method: 'POST', headers: auth(token), body: JSON.stringify(payload) });

// --- Uploads + community ---
export const uploadUrl = id => `${API_URL}/api/uploads/${id}`;

export async function uploadFile(token, file) {
  const form = new FormData();
  form.append('file', file);
  let res;
  try {
    res = await fetch(`${API_URL}/api/uploads`, { method: 'POST', headers: auth(token), body: form });
  } catch {
    throw new Error('Cannot reach the API — make sure the backend is running.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((typeof body === 'string' ? body : body?.title) || `Upload failed (${res.status})`);
  return body;
}

export function getFeed(token, { kind, mine, q, before } = {}) {
  const p = new URLSearchParams();
  if (kind) p.set('kind', kind);
  if (mine) p.set('mine', 'true');
  if (q) p.set('q', q);
  if (before) p.set('before', before);
  const s = p.toString();
  return request(`/api/community/posts${s ? `?${s}` : ''}`, { headers: auth(token) });
}
export const createPost = (token, payload) => request('/api/community/posts', { method: 'POST', headers: auth(token), body: JSON.stringify(payload) });
export const deletePost = (token, id) => request(`/api/community/posts/${id}`, { method: 'DELETE', headers: auth(token) });
export const toggleLike = (token, id) => request(`/api/community/posts/${id}/like`, { method: 'POST', headers: auth(token) });
export const getComments = (token, id) => request(`/api/community/posts/${id}/comments`, { headers: auth(token) });
export const addComment = (token, id, content) => request(`/api/community/posts/${id}/comments`, { method: 'POST', headers: auth(token), body: JSON.stringify({ content }) });
export const deleteComment = (token, id) => request(`/api/community/comments/${id}`, { method: 'DELETE', headers: auth(token) });

// --- Sign in with Google ---
export function authConfig() {
  return request('/api/auth/config');
}

export function googleSignIn(idToken) {
  return request('/api/auth/google', { method: 'POST', body: JSON.stringify({ idToken }) });
}

export function googleRegister(payload) {
  return request('/api/auth/google/register', { method: 'POST', body: JSON.stringify(payload) });
}

// --- Profile, activity and notifications ---
export function getProfile(token) {
  return request('/api/profile', { headers: auth(token) });
}

export function updateProfile(token, payload) {
  return request('/api/profile', { method: 'PUT', headers: auth(token), body: JSON.stringify(payload) });
}

export async function uploadAvatar(token, file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/api/profile/avatar`, { method: 'POST', headers: auth(token), body: form });
  const text = await res.text();
  if (!res.ok) throw new Error(text || 'Could not upload the picture.');
  return JSON.parse(text);
}

export function removeAvatar(token) {
  return request('/api/profile/avatar', { method: 'DELETE', headers: auth(token) });
}

export function deleteAccount(token, payload) {
  return request('/api/profile/delete', { method: 'POST', headers: auth(token), body: JSON.stringify(payload) });
}

export function getNotifications(token) {
  return request('/api/notifications', { headers: auth(token) });
}

export function markNotificationsRead(token) {
  // The navbar bell only clears system notifications; community ones are cleared inside Community.
  return request('/api/notifications/read?scope=System', { method: 'POST', headers: auth(token) });
}

// --- Community: reactions, pending queue, single post ---
export function reactToPost(token, id, reaction) {
  return request(`/api/community/posts/${id}/react`, { method: 'POST', headers: auth(token), body: JSON.stringify({ reaction }) });
}

export function getPendingPosts(token) {
  return request('/api/community/posts/pending', { headers: auth(token) });
}

export function getPost(token, id) {
  return request(`/api/community/posts/${id}`, { headers: auth(token) });
}

// --- Mock viva characters (published by admins) ---
export function getVivaCharacters(token) {
  return request('/api/viva/characters', { headers: auth(token) });
}

// ---------------- Community (Facebook-style) ----------------
const q = params => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '' && v !== false) sp.set(k, v); });
  const s = sp.toString();
  return s ? `?${s}` : '';
};
export const getCommunityFeed = (token, params = {}) => request(`/api/community/posts${q(params)}`, { headers: auth(token) });
export const updatePost = (token, id, payload) => request(`/api/community/posts/${id}`, { method: 'PUT', headers: auth(token), body: JSON.stringify(payload) });
export const sharePost = (token, id, payload) => request(`/api/community/posts/${id}/share`, { method: 'POST', headers: auth(token), body: JSON.stringify(payload) });
export const addReply = (token, id, content, parentId) => request(`/api/community/posts/${id}/comments`, { method: 'POST', headers: auth(token), body: JSON.stringify({ content, parentId }) });
export const editComment = (token, id, content) => request(`/api/community/comments/${id}`, { method: 'PUT', headers: auth(token), body: JSON.stringify({ content }) });
export const reactToComment = (token, id, reaction) => request(`/api/community/comments/${id}/react`, { method: 'POST', headers: auth(token), body: JSON.stringify({ reaction }) });
export const communitySearch = (token, text) => request(`/api/community/search${q({ q: text })}`, { headers: auth(token) });
export const getFriends = token => request('/api/community/friends', { headers: auth(token) });
export const sendFriendRequest = (token, id) => request(`/api/community/friends/${id}/request`, { method: 'POST', headers: auth(token) });
export const acceptFriend = (token, id) => request(`/api/community/friends/${id}/accept`, { method: 'POST', headers: auth(token) });
export const declineFriend = (token, id) => request(`/api/community/friends/${id}/decline`, { method: 'POST', headers: auth(token) });
export const removeFriend = (token, id) => request(`/api/community/friends/${id}`, { method: 'DELETE', headers: auth(token) });
export const toggleFollowPage = (token, id) => request(`/api/community/pages/${id}/follow`, { method: 'POST', headers: auth(token) });
export const getCommunityCounts = token => request('/api/community/counts', { headers: auth(token) });
export const getOfficialPage = token => request('/api/community/page', { headers: auth(token) });
export const getCommunityProfile = (token, id) => request(`/api/community/profiles/${id}`, { headers: auth(token) });
export const getProfileFriends = (token, id) => request(`/api/community/profiles/${id}/friends`, { headers: auth(token) });
export const updateCommunityProfile = (token, payload) => request('/api/community/profile', { method: 'PUT', headers: auth(token), body: JSON.stringify(payload) });
export const removeCover = token => request('/api/community/profile/cover', { method: 'DELETE', headers: auth(token) });
export async function uploadCover(token, file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/api/community/profile/cover`, { method: 'POST', headers: auth(token), body: form });
  const text = await res.text();
  if (!res.ok) throw new Error(text || 'Could not upload the cover picture.');
  return JSON.parse(text);
}
export const getScopedNotifications = (token, scope) => request(`/api/notifications${q({ scope })}`, { headers: auth(token) });
export const markScopeRead = (token, scope) => request(`/api/notifications/read${q({ scope })}`, { method: 'POST', headers: auth(token) });
export const markNotificationRead = (token, id) => request(`/api/notifications/${id}/read`, { method: 'POST', headers: auth(token) });

// ---------------- Accounts ----------------
export const forgotPassword = email => request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
export const resetPassword = payload => request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(payload) });
export const contactAdmin = payload => request('/api/support', { method: 'POST', body: JSON.stringify(payload) });

// ---------------- Roadmap assistant ----------------
export const getAssistant = (token, id) => request(`/api/roadmap-requests/${id}/assistant`, { headers: auth(token) });
export const getRoadmapSummary = (token, id, refresh = false) => request(`/api/roadmap-requests/${id}/summary${refresh ? '?refresh=true' : ''}`, { headers: auth(token) });

// ---------------- Resources ----------------
export const toggleBookmark = (token, id) => request(`/api/resources/${id}/bookmark`, { method: 'POST', headers: auth(token) });

// API calls used only by the admin panel. Everything the admin changes here is read by
// both the website and the mobile app, so there is a single place to manage content.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5220';
import { adminSession } from './adminSession';

export const apiUrl = path => `${API_URL}${path}`;

const token = () => adminSession.token();

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = { Authorization: `Bearer ${token()}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(apiUrl(path), { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new Error('Cannot reach the API. Make sure the backend is running.');
  }
  const text = await res.text().catch(() => '');
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (res.status === 401) {
    // Expired token, or the account is no longer an active admin.
    adminSession.clear();
    window.location.assign('/admin/login?expired=1');
    throw new Error('Your session expired.');
  }
  if (res.status === 403) throw new Error('This account is not an admin.');
  if (!res.ok) {
    const message = typeof data === 'string' && data ? data
      : data?.errors ? Object.values(data.errors).flat().join(' ')
      : data?.title ?? `Request failed (${res.status}).`;
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}

const qs = params => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') q.set(k, v); });
  const s = q.toString();
  return s ? `?${s}` : '';
};

export const admin = {
  stats: () => request('/api/admin/stats'),

  settings: () => request('/api/admin/settings'),
  saveSettings: values => request('/api/admin/settings', { method: 'PUT', body: { values } }),
  testEmail: to => request('/api/admin/settings/test-email', { method: 'POST', body: { to } }),
  emails: params => request(`/api/admin/emails${qs(params ?? {})}`),
  sendEmail: body => request('/api/admin/emails/send', { method: 'POST', body }),
  support: status => request(`/api/admin/support${qs({ status })}`),
  replySupport: (id, body) => request(`/api/admin/support/${id}/reply`, { method: 'POST', body: { body } }),
  supportStatus: (id, status) => request(`/api/admin/support/${id}`, { method: 'PATCH', body: { status } }),
  deleteSupport: id => request(`/api/admin/support/${id}`, { method: 'DELETE' }),

  page: () => request('/api/admin/page'),
  pagePosts: before => request(`/api/admin/page/posts${qs({ before })}`),
  savePage: body => request('/api/admin/page', { method: 'PUT', body }),
  pageAvatar: file => { const form = new FormData(); form.append('file', file); return request('/api/admin/page/avatar', { method: 'POST', form }); },
  pageCover: file => { const form = new FormData(); form.append('file', file); return request('/api/admin/page/cover', { method: 'POST', form }); },
  createPagePost: body => request('/api/admin/page/posts', { method: 'POST', body }),
  updatePagePost: (id, body) => request(`/api/admin/page/posts/${id}`, { method: 'PUT', body }),
  deletePagePost: id => request(`/api/admin/page/posts/${id}`, { method: 'DELETE' }),
  pageComments: id => request(`/api/admin/page/posts/${id}/comments`),
  pageComment: (id, content, parentId) => request(`/api/admin/page/posts/${id}/comments`, { method: 'POST', body: { content, parentId } }),
  deletePageComment: id => request(`/api/admin/page/comments/${id}`, { method: 'DELETE' }),
  pageFollowers: () => request('/api/admin/page/followers'),
  upload: file => { const form = new FormData(); form.append('file', file); return request('/api/uploads', { method: 'POST', form }); },

  users: params => request(`/api/admin/users${qs(params)}`),
  userDetail: id => request(`/api/admin/users/${id}`),
  updateUser: (id, body) => request(`/api/admin/users/${id}`, { method: 'PATCH', body }),
  setBadge: (id, badge) => request(`/api/admin/users/${id}/badge`, { method: 'PUT', body: { badge } }),
  search: q => request(`/api/admin/search${qs({ q })}`),

  vivaStats: () => request('/api/admin/viva'),
  createCharacter: body => request('/api/admin/viva/characters', { method: 'POST', body }),
  updateCharacter: (id, body) => request(`/api/admin/viva/characters/${id}`, { method: 'PUT', body }),
  deleteCharacter: id => request(`/api/admin/viva/characters/${id}`, { method: 'DELETE' }),

  posts: params => request(`/api/admin/posts${qs(params)}`),
  postCounts: () => request('/api/admin/posts/counts'),
  approvePost: id => request(`/api/admin/posts/${id}/approve`, { method: 'POST', body: {} }),
  rejectPost: (id, note) => request(`/api/admin/posts/${id}/reject`, { method: 'POST', body: { note } }),
  createPost: body => request('/api/admin/posts', { method: 'POST', body }),
  updatePost: (id, body) => request(`/api/admin/posts/${id}`, { method: 'PUT', body }),
  deletePost: id => request(`/api/admin/posts/${id}`, { method: 'DELETE' }),
  postComments: id => request(`/api/admin/posts/${id}/comments`),
  deleteComment: id => request(`/api/admin/comments/${id}`, { method: 'DELETE' }),

  groups: q => request(`/api/admin/groups${qs({ q })}`),
  groupMembers: id => request(`/api/admin/groups/${id}/members`),
  deleteGroup: id => request(`/api/admin/groups/${id}`, { method: 'DELETE' }),

  site: () => request('/api/admin/site'),
  createSiteEntry: body => request('/api/admin/site', { method: 'POST', body }),
  updateSiteEntry: (id, body) => request(`/api/admin/site/${id}`, { method: 'PUT', body }),
  deleteSiteEntry: id => request(`/api/admin/site/${id}`, { method: 'DELETE' }),
  reorderSite: ids => request('/api/admin/site/order', { method: 'PUT', body: { ids } }),

  resources: params => request(`/api/resources${qs(params)}`),
  resourceFacets: () => request('/api/resources/facets'),
  createResource: body => request('/api/resources', { method: 'POST', body }),
  updateResource: (id, body) => request(`/api/resources/${id}`, { method: 'PUT', body }),
  deleteResource: id => request(`/api/resources/${id}`, { method: 'DELETE' }),

  videos: () => request('/api/admin/videos'),
  lookupVideo: url => request(`/api/admin/videos/lookup${qs({ url })}`),
  createVideo: body => request('/api/admin/videos', { method: 'POST', body }),
  updateVideo: (id, body) => request(`/api/admin/videos/${id}`, { method: 'PUT', body }),
  deleteVideo: id => request(`/api/admin/videos/${id}`, { method: 'DELETE' }),

  tracks: () => request('/api/admin/tracks'),
  createTrack: body => request('/api/admin/tracks', { method: 'POST', body }),
  updateTrack: (id, body) => request(`/api/admin/tracks/${id}`, { method: 'PUT', body }),
  deleteTrack: id => request(`/api/admin/tracks/${id}`, { method: 'DELETE' }),
  reorderTracks: ids => request('/api/admin/tracks/order', { method: 'PUT', body: { ids } }),
  reorderLessons: (trackId, ids) => request(`/api/admin/tracks/${trackId}/order`, { method: 'PUT', body: { ids } }),

  lesson: id => request(`/api/admin/lessons/${id}`),
  createLesson: body => request('/api/admin/lessons', { method: 'POST', body }),
  updateLesson: (id, body) => request(`/api/admin/lessons/${id}`, { method: 'PUT', body }),
  deleteLesson: id => request(`/api/admin/lessons/${id}`, { method: 'DELETE' }),

  files: () => request('/api/admin/files'),
  createFile: form => request('/api/admin/files', { method: 'POST', form }),
  updateFile: (id, form) => request(`/api/admin/files/${id}`, { method: 'PUT', form }),
  deleteFile: id => request(`/api/admin/files/${id}`, { method: 'DELETE' }),
  reorderFiles: ids => request('/api/admin/files/order', { method: 'PUT', body: { ids } }),

  /** Admin download (works for unpublished files too). */
  async downloadFile(id, fileName) {
    const res = await fetch(apiUrl(`/api/admin/files/${id}/download`), { headers: { Authorization: `Bearer ${token()}` } });
    if (!res.ok) throw new Error('Could not download the file.');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
};

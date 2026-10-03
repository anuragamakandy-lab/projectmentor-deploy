import { useEffect, useState } from 'react';
import { admin, apiUrl } from '../adminApi';
import { Empty, ErrorBox, Field, Icon, Loading, Modal, PageHead, timeAgo, useAsync, useFeedback } from '../ui';

const STATUSES = [['Pending', 'Waiting for review'], ['Approved', 'Approved'], ['Rejected', 'Rejected'], ['', 'All posts']];
const KINDS = ['Announcement', 'Showcase', 'Update', 'Question', 'Report', 'Idea'];
const REASONS = [
  'Please add more detail about your project.',
  'This looks like personal information. Please remove it and post again.',
  'This is not related to student projects.',
  'Please keep the language respectful.',
];

/** Approve, reject, edit or delete community posts; post announcements; moderate comments. */
export default function Community({ onChanged }) {
  const { toast, confirm } = useFeedback();
  const [status, setStatus] = useState('Pending');
  const [q, setQ] = useState(new URLSearchParams(window.location.search).get('q') ?? '');
  const [query, setQuery] = useState('');
  const counts = useAsync(() => admin.postCounts(), []);
  const posts = useAsync(() => admin.posts({ status, q: query }), [status, query]);
  const [editing, setEditing] = useState(null);   // post being edited, or {} for a new announcement
  const [rejecting, setRejecting] = useState(null);
  const [commentsFor, setCommentsFor] = useState(null);

  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  function refresh() {
    posts.reload();
    counts.reload();
    onChanged?.();
  }

  async function approve(p) {
    try { await admin.approvePost(p.id); toast('Post approved. It is now public.'); refresh(); }
    catch (e) { toast(e.message, 'error'); }
  }

  async function remove(p) {
    if (!await confirm({ title: 'Delete this post?', message: 'The post, its likes and comments are removed for everyone. This cannot be undone.', ok: 'Delete post', danger: true })) return;
    try { await admin.deletePost(p.id); toast('Post deleted.'); refresh(); }
    catch (e) { toast(e.message, 'error'); }
  }

  const c = counts.data;
  return (
    <>
      <PageHead title="Community posts" sub="New student posts wait here until you approve or reject them. Approved posts appear in the community feed on the website and the app. Students edit their own posts; you can edit announcements.">
        <button type="button" className="adm-btn primary" onClick={() => setEditing({})}><Icon name="plus" />New announcement</button>
      </PageHead>

      <section className="adm-card">
        <div className="adm-toolbar">
          <div className="adm-tabs" role="tablist">
            {STATUSES.map(([value, label]) => (
              <button key={value || 'all'} type="button" className={status === value ? 'on' : ''} onClick={() => setStatus(value)}>
                {label}
                {c && value && <span className={value === 'Pending' && c.pending > 0 ? 'adm-badge' : 'adm-pill'}>{c[value.toLowerCase()]}</span>}
              </button>
            ))}
          </div>
          <div className="adm-search">
            <Icon name="search" />
            <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search text, author or project" aria-label="Search posts" />
          </div>
        </div>

        {posts.error && <ErrorBox error={posts.error} onRetry={posts.reload} />}
        {posts.loading && !posts.data && <Loading />}
        {posts.data && posts.data.length === 0 && (
          <Empty title={status === 'Pending' ? 'Nothing to review' : 'No posts found'}
            text={status === 'Pending' ? 'New posts from students will appear here.' : 'Try another filter or search.'} />
        )}

        <div className="adm-posts">
          {posts.data?.map(p => (
            <article className="adm-post" key={p.id}>
              <div className="adm-post-head">
                <span className="avatar">{p.authorName.split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase()}</span>
                <div>
                  <strong>{p.authorName}</strong>
                  <small>{p.authorEmail} · {timeAgo(p.createdAt)}</small>
                </div>
                <span className="adm-pill info">{p.kind}</span>
                <span className={`adm-pill ${p.status === 'Approved' ? 'ok' : p.status === 'Pending' ? 'warn' : 'bad'}`}>{p.status === 'Pending' ? 'Waiting' : p.status}</span>
              </div>
              <div className="adm-post-body">
                {p.projectTitle && <span className="title">{p.projectTitle}</span>}
                {p.content || <em>(no text)</em>}
              </div>
              {p.images.length > 0 && (
                <div className="adm-post-images">
                  {p.images.map(id => (
                    <a key={id} href={apiUrl(`/api/uploads/${id}`)} target="_blank" rel="noreferrer">
                      <img src={apiUrl(`/api/uploads/${id}`)} alt="" loading="lazy" onError={e => { e.currentTarget.parentElement.textContent = 'Attachment'; }} />
                    </a>
                  ))}
                </div>
              )}
              {p.status === 'Rejected' && p.moderationNote && <p className="adm-post-note">Reason sent to the student: {p.moderationNote}</p>}
              <div className="adm-post-foot">
                <span className="meta">{p.likes} likes · {p.comments} comments</span>
                {p.comments > 0 && <button type="button" className="adm-btn sm ghost" onClick={() => setCommentsFor(p)}>Comments</button>}
                {p.kind === 'Announcement' && <button type="button" className="adm-btn sm ghost" onClick={() => setEditing(p)}><Icon name="edit" size={15} />Edit</button>}
                <button type="button" className="adm-btn sm danger" onClick={() => remove(p)}><Icon name="trash" size={15} />Delete</button>
                {p.status !== 'Rejected' && <button type="button" className="adm-btn sm" onClick={() => setRejecting(p)}>Reject</button>}
                {p.status !== 'Approved' && <button type="button" className="adm-btn sm ok" onClick={() => approve(p)}>Approve</button>}
              </div>
            </article>
          ))}
        </div>
      </section>

      {editing && <PostForm post={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
      {rejecting && <RejectForm post={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); refresh(); }} />}
      {commentsFor && <Comments post={commentsFor} onClose={() => { setCommentsFor(null); refresh(); }} />}
    </>
  );
}

function PostForm({ post, onClose, onSaved }) {
  const { toast } = useFeedback();
  const isNew = !post.id;
  const [form, setForm] = useState({ content: post.content ?? '', kind: post.kind ?? 'Announcement', projectTitle: post.projectTitle ?? '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (isNew) await admin.createPost(form); else await admin.updatePost(post.id, form);
      toast(isNew ? 'Announcement published.' : 'Post updated.');
      onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? 'New announcement' : 'Edit post'} onClose={onClose}>
      <form className="adm-form" onSubmit={save}>
        {error && <p className="adm-form-error">{error}</p>}
        <Field label="Type">
          <select value={form.kind} onChange={set('kind')}>{KINDS.map(k => <option key={k}>{k}</option>)}</select>
        </Field>
        <Field label="Project or title (optional)"><input type="text" value={form.projectTitle} onChange={set('projectTitle')} maxLength={200} /></Field>
        <Field label="Text" wide hint={isNew ? 'Announcements from admins are published straight away.' : 'The author will see your changes.'}>
          <textarea value={form.content} onChange={set('content')} rows={7} maxLength={5000} required />
        </Field>
        <div className="adm-modal-actions wide">
          <button type="button" className="adm-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Publish' : 'Save changes'}</button>
        </div>
      </form>
    </Modal>
  );
}

function RejectForm({ post, onClose, onDone }) {
  const { toast } = useFeedback();
  const [note, setNote] = useState(REASONS[0]);
  const [busy, setBusy] = useState(false);

  async function reject(e) {
    e.preventDefault();
    setBusy(true);
    try { await admin.rejectPost(post.id, note); toast('Post rejected. The student can see your reason.'); onDone(); }
    catch (err) { toast(err.message, 'error'); setBusy(false); }
  }

  return (
    <Modal title="Reject this post" onClose={onClose} size="sm">
      <form onSubmit={reject} style={{ display: 'grid', gap: 12 }}>
        <p className="adm-confirm-text">The post stays hidden from other students. Its author sees it marked as not approved, with the reason below.</p>
        <Field label="Quick reasons">
          <select value={REASONS.includes(note) ? note : ''} onChange={e => e.target.value && setNote(e.target.value)}>
            <option value="">Write my own</option>
            {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Reason shown to the student"><textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={3} /></Field>
        <div className="adm-modal-actions">
          <button type="button" className="adm-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn danger" disabled={busy}>Reject post</button>
        </div>
      </form>
    </Modal>
  );
}

function Comments({ post, onClose }) {
  const { toast, confirm } = useFeedback();
  const list = useAsync(() => admin.postComments(post.id), [post.id]);

  async function remove(c) {
    if (!await confirm({ title: 'Delete this comment?', message: `"${c.content.slice(0, 120)}"`, ok: 'Delete', danger: true })) return;
    try { await admin.deleteComment(c.id); toast('Comment deleted.'); list.reload(); }
    catch (e) { toast(e.message, 'error'); }
  }

  return (
    <Modal title={`Comments on ${post.authorName}'s post`} onClose={onClose}>
      {list.loading && !list.data && <Loading />}
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
      {list.data?.length === 0 && <Empty title="No comments" />}
      <ul className="adm-comments">
        {list.data?.map(c => (
          <li key={c.id}>
            <div><strong>{c.authorName}</strong> <small>{timeAgo(c.createdAt)}</small><p style={{ margin: '4px 0 0' }}>{c.content}</p></div>
            <button type="button" className="adm-icon-btn danger" onClick={() => remove(c)} aria-label="Delete comment"><Icon name="trash" size={16} /></button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

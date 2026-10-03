import { useEffect, useRef, useState } from 'react';
import { admin, apiUrl } from '../adminApi';
import { Empty, ErrorBox, Field, Icon, Loading, Modal, PageHead, timeAgo, useAsync, useFeedback } from '../ui';

const KINDS = [['Announcement', 'Announcement'], ['Update', 'Update'], ['Showcase', 'Showcase'], ['Idea', 'Tip / idea']];

/**
 * The official ProjectMentor community page. Students can open it and follow it. Admins edit its details,
 * publish posts as ProjectMentor (no approval needed) and reply to comments as ProjectMentor.
 */
export default function OfficialPage() {
  const { toast, confirm } = useFeedback();
  const data = useAsync(() => admin.page(), []);
  const [posts, setPosts] = useState([]);
  const [next, setNext] = useState(null);
  const [details, setDetails] = useState(null);
  const [editor, setEditor] = useState(null);
  const [comments, setComments] = useState(null);
  const [followers, setFollowers] = useState(null);
  const avatarInput = useRef(null);
  const coverInput = useRef(null);

  useEffect(() => { if (data.data) { setPosts(data.data.posts); setNext(data.data.nextBefore); } }, [data.data]);
  if (data.loading && !data.data) return <Loading />;
  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />;
  const p = data.data.profile;

  async function upload(kind, file) {
    try { await (kind === 'avatar' ? admin.pageAvatar(file) : admin.pageCover(file)); toast('Picture updated.'); data.reload(); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function remove(post) {
    if (!await confirm({ title: 'Delete this post?', message: 'Students will no longer see it. This cannot be undone.', ok: 'Delete', danger: true })) return;
    try { await admin.deletePagePost(post.id); setPosts(l => l.filter(x => x.id !== post.id)); toast('Post deleted.'); } catch (e) { toast(e.message, 'error'); }
  }
  async function more() {
    const r = await admin.pagePosts(next);
    setPosts(l => [...l, ...r.posts]); setNext(r.nextBefore);
  }

  return (
    <>
      <PageHead title="ProjectMentor page" sub="The official community page. Students can visit and follow it, and its posts appear in everyone's feed.">
        <a className="adm-btn" href={`/community/profile/${p.id}`} target="_blank" rel="noreferrer"><Icon name="external" size={15} />View page</a>
        <button type="button" className="adm-btn primary" onClick={() => setEditor({ kind: 'Announcement', projectTitle: '', content: '' })}><Icon name="plus" size={16} />New post</button>
      </PageHead>

      <section className="adm-card adm-page-card">
        <div className="adm-page-cover" style={p.coverId ? { backgroundImage: `url(${apiUrl(`/api/uploads/${p.coverId}`)})` } : undefined}>
          <button type="button" className="adm-btn sm" onClick={() => coverInput.current.click()}>Change cover</button>
        </div>
        <div className="adm-page-id">
          <button type="button" className="adm-page-avatar" onClick={() => avatarInput.current.click()} title="Change the page picture">
            {p.avatarId ? <img src={apiUrl(`/api/uploads/${p.avatarId}`)} alt="" /> : 'PM'}
          </button>
          <div className="grow">
            <h2>{p.fullName} <span className="adm-pill ok">Official</span></h2>
            <p className="adm-hint">{p.followerCount} follower{p.followerCount === 1 ? '' : 's'} · {p.postCount} posts</p>
            {p.bio && <p>{p.bio}</p>}
          </div>
          <div className="adm-row-actions">
            <button type="button" className="adm-btn" onClick={() => admin.pageFollowers().then(setFollowers)}>Followers</button>
            <button type="button" className="adm-btn" onClick={() => setDetails({ bio: p.bio ?? '', university: p.university ?? '', location: p.location ?? '', website: p.website ?? '', skills: p.skills ?? '' })}>Edit details</button>
          </div>
        </div>
        <input ref={avatarInput} type="file" accept="image/*" hidden onChange={e => { if (e.target.files[0]) upload('avatar', e.target.files[0]); e.target.value = ''; }} />
        <input ref={coverInput} type="file" accept="image/*" hidden onChange={e => { if (e.target.files[0]) upload('cover', e.target.files[0]); e.target.value = ''; }} />
      </section>

      <section className="adm-card">
        <div className="adm-toolbar"><h2 className="adm-section" style={{ margin: 0 }}>Posts</h2></div>
        {posts.length === 0 && <Empty title="No posts yet" text="Publish the first post as ProjectMentor." />}
        <div className="adm-posts">
          {posts.map(post => (
            <article key={post.id} className="adm-post">
              <div className="adm-post-head">
                <span className="adm-pill">{post.kind}</span>
                <small>{timeAgo(post.createdAt)}{post.editedAt ? ' · edited' : ''}</small>
              </div>
              <div className="adm-post-body">
                {post.projectTitle && <strong>{post.projectTitle}</strong>}
                <p>{post.content}</p>
              </div>
              <div className="adm-post-foot">
                <span>{post.likeCount} reactions · {post.commentCount} comments · {post.shareCount} shares</span>
                <div className="adm-row-actions">
                  <button type="button" className="adm-btn sm" onClick={() => setComments(post)}>Comments</button>
                  <button type="button" className="adm-btn sm ghost" onClick={() => setEditor({ id: post.id, kind: post.kind, projectTitle: post.projectTitle ?? '', content: post.content })}>Edit</button>
                  <button type="button" className="adm-icon-btn danger" onClick={() => remove(post)} aria-label="Delete post"><Icon name="trash" size={16} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
        {next && <div className="adm-card-pad"><button type="button" className="adm-btn" onClick={more}>Load more</button></div>}
      </section>

      {editor && <PostEditor post={editor} onClose={() => setEditor(null)} onSaved={saved => {
        setPosts(l => (editor.id ? l.map(x => (x.id === saved.id ? saved : x)) : [saved, ...l])); setEditor(null);
      }} />}
      {details && <DetailsEditor value={details} onClose={() => setDetails(null)} onSaved={() => { setDetails(null); data.reload(); }} />}
      {comments && <CommentsModal post={comments} onClose={() => setComments(null)} />}
      {followers && (
        <Modal title={`Followers (${followers.length})`} onClose={() => setFollowers(null)}>
          {followers.length === 0 && <Empty title="No followers yet" />}
          <ul className="adm-list">{followers.map(f => <li key={f.id}><div className="grow"><strong>{f.fullName}</strong><small>{f.email} · since {timeAgo(f.since)}</small></div></li>)}</ul>
        </Modal>
      )}
    </>
  );
}

function PostEditor({ post, onClose, onSaved }) {
  const { toast } = useFeedback();
  const [form, setForm] = useState(post);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const uploadIds = [];
      for (const f of files) uploadIds.push((await admin.upload(f)).id);
      const body = { content: form.content, kind: form.kind, projectTitle: form.projectTitle || null, uploadIds, visibility: 'Public' };
      onSaved(post.id ? await admin.updatePagePost(post.id, body) : await admin.createPagePost(body));
      toast(post.id ? 'Post updated.' : 'Published to the community.');
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  }
  return (
    <Modal title={post.id ? 'Edit post' : 'New post as ProjectMentor'} onClose={onClose} size="lg">
      <form className="adm-form" onSubmit={save}>
        <Field label="Type"><select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Title" hint="Optional, shown in bold above the text."><input value={form.projectTitle} onChange={e => setForm(f => ({ ...f, projectTitle: e.target.value }))} maxLength={200} /></Field>
        <Field label="Text" wide><textarea rows={8} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} required /></Field>
        {!post.id && <Field label="Photos or files" hint="Up to 6 images, PDF, Word, PowerPoint or Excel files." wide>
          <input type="file" multiple accept="image/*,.pdf,.docx,.pptx,.xlsx" onChange={e => setFiles([...e.target.files].slice(0, 6))} /></Field>}
        <div className="adm-modal-actions"><button type="button" className="adm-btn" onClick={onClose}>Cancel</button><button type="submit" className="adm-btn primary" disabled={busy}>{busy ? 'Saving…' : post.id ? 'Save' : 'Publish'}</button></div>
      </form>
    </Modal>
  );
}

function DetailsEditor({ value, onClose, onSaved }) {
  const { toast } = useFeedback();
  const [form, setForm] = useState(value);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  async function save(e) {
    e.preventDefault();
    try { await admin.savePage(form); toast('Page details saved.'); onSaved(); } catch (err) { toast(err.message, 'error'); }
  }
  return (
    <Modal title="Edit page details" onClose={onClose}>
      <form className="adm-form" onSubmit={save}>
        <Field label="About (bio)" wide><textarea rows={4} maxLength={500} value={form.bio} onChange={set('bio')} /></Field>
        <Field label="Organisation"><input value={form.university} onChange={set('university')} /></Field>
        <Field label="Location"><input value={form.location} onChange={set('location')} /></Field>
        <Field label="Topics" hint="Shown as skills, e.g. Roadmaps, Viva practice, Reports"><input value={form.skills} onChange={set('skills')} /></Field>
        <Field label="Website"><input value={form.website} onChange={set('website')} placeholder="https://…" /></Field>
        <div className="adm-modal-actions"><button type="button" className="adm-btn" onClick={onClose}>Cancel</button><button type="submit" className="adm-btn primary">Save</button></div>
      </form>
    </Modal>
  );
}

function CommentsModal({ post, onClose }) {
  const { toast, confirm } = useFeedback();
  const list = useAsync(() => admin.pageComments(post.id), [post.id]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    try { await admin.pageComment(post.id, text.trim(), replyTo?.id ?? null); setText(''); setReplyTo(null); list.reload(); } catch (err) { toast(err.message, 'error'); }
  }
  async function remove(c) {
    if (!await confirm({ title: 'Delete this comment?', ok: 'Delete', danger: true })) return;
    try { await admin.deletePageComment(c.id); list.reload(); } catch (err) { toast(err.message, 'error'); }
  }
  const top = (list.data ?? []).filter(c => !c.parentId);
  const replies = id => (list.data ?? []).filter(c => c.parentId === id);
  const row = (c, reply) => (
    <li key={c.id} className={reply ? 'adm-reply' : ''}>
      <div className="grow"><strong>{c.authorName}{c.authorIsOfficial ? ' (ProjectMentor)' : ''}</strong><small>{timeAgo(c.createdAt)} · {c.reactionTotal} reactions</small><p>{c.content}</p></div>
      {!reply && <button type="button" className="adm-btn sm ghost" onClick={() => setReplyTo(c)}>Reply</button>}
      <button type="button" className="adm-icon-btn danger" onClick={() => remove(c)} aria-label="Delete comment"><Icon name="trash" size={15} /></button>
    </li>
  );
  return (
    <Modal title="Comments" onClose={onClose} size="lg">
      {list.loading && !list.data && <Loading />}
      {list.data?.length === 0 && <Empty title="No comments yet" />}
      <ul className="adm-list adm-comments">{top.map(c => [row(c, false), ...replies(c.id).map(r => row(r, true))])}</ul>
      <form className="adm-form" onSubmit={send}>
        <Field label={replyTo ? `Reply to ${replyTo.authorName} as ProjectMentor` : 'Comment as ProjectMentor'} wide>
          <textarea rows={3} value={text} onChange={e => setText(e.target.value)} />
        </Field>
        <div className="adm-modal-actions">{replyTo && <button type="button" className="adm-btn" onClick={() => setReplyTo(null)}>Cancel reply</button>}<button type="submit" className="adm-btn primary">Send</button></div>
      </form>
    </Modal>
  );
}

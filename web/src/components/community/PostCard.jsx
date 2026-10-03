import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addReply, deleteComment, deletePost, editComment, getComments, reactToComment, reactToPost, sharePost, updatePost, uploadUrl,
} from '../../api/projectMentorApi';
import Avatar, { BadgeChip, timeAgo } from '../Avatar';
import { REACTIONS, REACTION_COLOR, ReactionIcon, ReactionSummary } from '../Reactions';
import { useFeedback } from '../../ui/feedback';
import { AUDIENCES, AudienceIcon, Icon, Modal, RichText, VerifiedTick, kb, useCommunity } from './shared';

const profileLink = (id) => `/community/profile/${id}`;

/** Facebook-style reaction button: click = Like (or remove), hover/long-press = pick a reaction. */
function ReactButton({ mine, onReact, small = false }) {
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const show = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), 350); };
  const hide = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 250); };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <span className="cm-react-wrap" onMouseEnter={show} onMouseLeave={hide}>
      {open && (
        <span className="cm-react-pop" role="menu" onMouseEnter={() => clearTimeout(timer.current)}>
          {REACTIONS.map(([k, label]) => (
            <button key={k} type="button" role="menuitem" title={label} aria-label={label} onClick={() => { setOpen(false); onReact(k); }}>
              <ReactionIcon type={k} size={small ? 26 : 34} />
            </button>
          ))}
        </span>
      )}
      <button type="button" className={small ? 'cm-link-btn' : 'cm-action'} style={mine ? { color: REACTION_COLOR[mine], fontWeight: 700 } : undefined}
        onClick={() => onReact(mine ?? 'Like')} onContextMenu={e => { e.preventDefault(); setOpen(true); }} aria-label={mine ? `Remove ${mine}` : 'Like'}>
        {!small && (mine ? <ReactionIcon type={mine} size={20} /> : Icon.like)}
        <span>{mine ?? 'Like'}</span>
      </button>
    </span>
  );
}

/* ---------------- comments with replies ---------------- */

function CommentItem({ c, replies, onReply, onChanged, onRemoved, depth = 0 }) {
  const { token, guard } = useCommunity();
  const { confirm, toast } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.content);
  const [rx, setRx] = useState({ reactions: c.reactions ?? {}, total: c.reactionTotal ?? 0, mine: c.myReaction });

  async function react(type) {
    if (!await guard('react to comments')) return;
    try { const r = await reactToComment(token, c.id, type); setRx({ reactions: r.reactions, total: r.total, mine: r.myReaction }); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function save(e) {
    e.preventDefault();
    try { onChanged(await editComment(token, c.id, text)); setEditing(false); } catch (err) { toast(err.message, 'error'); }
  }
  async function remove() {
    if (!await confirm({ title: 'Delete comment?', message: 'This also deletes its replies.', ok: 'Delete', danger: true })) return;
    try { await deleteComment(token, c.id); onRemoved(c.id); } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <div className={`cm-comment${depth ? ' reply' : ''}`}>
      <Link to={profileLink(c.authorId)}><Avatar name={c.authorName} seed={c.authorId} size={depth ? 28 : 34} photoId={c.authorAvatarId} badge={c.authorBadge} /></Link>
      <div className="cm-comment-main">
        {editing ? (
          <form className="cm-comment-edit" onSubmit={save}>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={2} autoFocus />
            <div><button type="button" className="cm-link-btn" onClick={() => { setEditing(false); setText(c.content); }}>Cancel</button><button className="cm-link-btn strong" type="submit">Save</button></div>
          </form>
        ) : (
          <div className="cm-bubble">
            <Link to={profileLink(c.authorId)} className="cm-name">{c.authorName}{c.authorIsOfficial && <VerifiedTick size={13} />}</Link>
            <p><RichText text={c.content} /></p>
            {rx.total > 0 && <span className="cm-bubble-rx"><ReactionSummary reactions={rx.reactions} total={rx.total} /></span>}
          </div>
        )}
        {!editing && (
          <div className="cm-comment-meta">
            <ReactButton small mine={rx.mine} onReact={react} />
            <button type="button" className="cm-link-btn" onClick={async () => { if (await guard('reply to comments')) onReply(c); }}>Reply</button>
            <span>{timeAgo(c.createdAt)}{c.editedAt && ' · Edited'}</span>
            {c.canEdit && <button type="button" className="cm-link-btn" onClick={() => setEditing(true)}>Edit</button>}
            {c.canDelete && <button type="button" className="cm-link-btn" onClick={remove}>Delete</button>}
          </div>
        )}
        {replies?.map(r => <CommentItem key={r.id} c={r} depth={1} onReply={() => onReply(c, r)} onChanged={onChanged} onRemoved={onRemoved} />)}
      </div>
    </div>
  );
}

function Comments({ post, initial, onCount }) {
  const { token, me, user, isAuthenticated, guard } = useCommunity();
  const { toast } = useFeedback();
  const [list, setList] = useState(initial ?? []);
  const [all, setAll] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const input = useRef(null);

  async function loadAll() {
    try { setList(await getComments(token, post.id)); setAll(true); } catch (e) { toast(e.message, 'error'); }
  }
  useEffect(() => { if (post.commentCount > 0 && (initial?.length ?? 0) === 0) loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function send(e) {
    e.preventDefault();
    if (!await guard('comment')) return;
    if (!text.trim()) return;
    try {
      const c = await addReply(token, post.id, text.trim(), replyTo?.id ?? null);
      setList(l => [...l, c]); setText(''); setReplyTo(null); onCount(1);
    } catch (err) { toast(err.message, 'error'); }
  }
  const top = list.filter(c => !c.parentId);
  const repliesOf = id => list.filter(c => c.parentId === id);
  const startReply = (parent, child) => {
    setReplyTo(parent);
    setText(child && child.authorId !== user?.userId ? `@${child.authorName.split(' ')[0]} ` : '');
    setTimeout(() => input.current?.focus(), 0);
  };

  return (
    <div className="cm-comments">
      {!all && post.commentCount > top.length + list.filter(c => c.parentId).length && (
        <button type="button" className="cm-link-btn strong" onClick={loadAll}>View all {post.commentCount} comments</button>
      )}
      {top.map(c => (
        <CommentItem key={c.id} c={c} replies={repliesOf(c.id)} onReply={startReply}
          onChanged={u => setList(l => l.map(x => (x.id === u.id ? u : x)))}
          onRemoved={id => { const gone = list.filter(x => x.id === id || x.parentId === id).length; setList(l => l.filter(x => x.id !== id && x.parentId !== id)); onCount(-gone); }} />
      ))}
      <form className="cm-comment-form" onSubmit={send}>
        <Avatar name={me?.fullName ?? user?.fullName ?? 'Guest'} seed={user?.userId} size={32} photoId={me?.avatarId} badge={me?.badge} />
        <div className="cm-comment-input">
          {replyTo && <span className="cm-replying">Replying to {replyTo.authorName} <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">×</button></span>}
          <input ref={input} value={text} onChange={e => setText(e.target.value)} onFocus={() => { if (!isAuthenticated) guard('comment'); }}
            placeholder={replyTo ? 'Write a reply…' : 'Write a comment…'} aria-label="Write a comment" />
        </div>
        <button className="cm-send" type="submit" disabled={!text.trim()} aria-label="Send">{Icon.share}</button>
      </form>
    </div>
  );
}

/* ---------------- share ---------------- */

function ShareMenu({ post, onShared }) {
  const { token, guard, me, user } = useCommunity();
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [caption, setCaption] = useState('');
  const [aud, setAud] = useState('Public');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const original = post.sharedPost ?? post;
  const url = `${window.location.origin}/community?post=${original.id}`;
  const text = `${original.authorName} on ProjectMentor: ${(original.projectTitle || original.content || '').slice(0, 100)}`;

  async function doShare(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const p = await sharePost(token, original.id, { content: caption.trim(), visibility: aud });
      onShared(p); setModal(false); setCaption('');
      toast(p.status === 'Pending' ? 'Shared. Your caption will appear after an admin checks it.' : 'Shared to your feed.');
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <span className="cm-share-wrap" ref={ref}>
      <button type="button" className="cm-action" onClick={() => setOpen(o => !o)} aria-expanded={open}>{Icon.share}<span>Share</span></button>
      {open && (
        <div className="cm-menu up" role="menu">
          <button type="button" role="menuitem" onClick={async () => { setOpen(false); if (await guard('share posts')) setModal(true); }}><b>Share to feed</b><small>Post it on your profile with your own caption</small></button>
          <button type="button" role="menuitem" onClick={async () => { await navigator.clipboard?.writeText(url); setOpen(false); toast('Link copied.'); }}>Copy link</button>
          <a role="menuitem" href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>Share on WhatsApp</a>
          <a role="menuitem" href={`mailto:?subject=${encodeURIComponent('A post on ProjectMentor')}&body=${encodeURIComponent(`${text}\n\n${url}`)}`} onClick={() => setOpen(false)}>Send by email</a>
          {navigator.share && <button type="button" role="menuitem" onClick={() => { setOpen(false); navigator.share({ title: 'ProjectMentor', text, url }).catch(() => {}); }}>More options…</button>}
        </div>
      )}
      {modal && (
        <Modal title="Share to your feed" onClose={() => setModal(false)}>
          <form onSubmit={doShare} className="cm-share-form">
            <div className="cm-who">
              <Avatar name={me?.fullName ?? user?.fullName} seed={user?.userId} size={40} photoId={me?.avatarId} badge={me?.badge} />
              <div><strong>{me?.fullName ?? user?.fullName}</strong>
                <select value={aud} onChange={e => setAud(e.target.value)} aria-label="Who can see this">{AUDIENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            </div>
            <textarea rows={3} value={caption} onChange={e => setCaption(e.target.value)} placeholder="Say something about this…" autoFocus />
            <SharedPreview post={original} />
            <button className="button button-primary" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Sharing…' : 'Share now'}</button>
          </form>
        </Modal>
      )}
    </span>
  );
}

function Attachments({ files }) {
  if (!files?.length) return null;
  const images = files.filter(f => f.contentType.startsWith('image/'));
  const docs = files.filter(f => !f.contentType.startsWith('image/'));
  return (
    <>
      {images.length > 0 && (
        <div className={`cm-gallery n${Math.min(images.length, 4)}`}>
          {images.slice(0, 4).map((f, i) => (
            <a key={f.id} href={uploadUrl(f.id)} target="_blank" rel="noreferrer" className="cm-gallery-item">
              <img src={uploadUrl(f.id)} alt={f.fileName} loading="lazy" />
              {i === 3 && images.length > 4 && <span className="cm-more">+{images.length - 4}</span>}
            </a>
          ))}
        </div>
      )}
      {docs.map(f => (
        <a key={f.id} className="cm-doc" href={uploadUrl(f.id)} target="_blank" rel="noreferrer">
          <span className="cm-doc-ico">{Icon.file}</span><span><b>{f.fileName}</b><small>{kb(f.size)}</small></span>
        </a>
      ))}
    </>
  );
}

function SharedPreview({ post }) {
  return (
    <div className="cm-shared">
      <div className="cm-post-head">
        <Avatar name={post.authorName} seed={post.authorId} size={34} photoId={post.authorAvatarId} badge={post.authorBadge} />
        <div><Link to={profileLink(post.authorId)} className="cm-name">{post.authorName}{post.authorIsOfficial && <VerifiedTick />}</Link>
          <small>{timeAgo(post.createdAt)}</small></div>
      </div>
      {post.projectTitle && <h4 className="cm-post-title">{post.projectTitle}</h4>}
      {post.content && <p className="cm-post-text"><RichText text={post.content} /></p>}
      <Attachments files={post.attachments} />
    </div>
  );
}

/* ---------------- the post card ---------------- */

export default function PostCard({ post: initial, onRemoved, onShared, highlight = false }) {
  const { token, guard } = useCommunity();
  const { confirm, toast } = useFeedback();
  const [post, setPost] = useState(initial);
  const [rx, setRx] = useState({ reactions: initial.reactions ?? {}, total: initial.likeCount, mine: initial.myReaction });
  const [comments, setComments] = useState(initial.commentCount);
  const [showComments, setShowComments] = useState(highlight || initial.recentComments?.length > 0);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial.content);
  const ref = useRef(null);
  useEffect(() => { if (highlight) ref.current?.scrollIntoView({ block: 'start' }); }, [highlight]);
  useEffect(() => {
    if (!menu) return undefined;
    const close = e => { if (!ref.current?.querySelector('.cm-post-menu')?.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  async function react(type) {
    if (!await guard('react to posts')) return;
    try { const r = await reactToPost(token, post.id, type); setRx({ reactions: r.reactions, total: r.total, mine: r.myReaction }); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function setAudience(v) {
    setMenu(false);
    try { const p = await updatePost(token, post.id, { visibility: v }); setPost(p); toast(`Now visible to: ${AUDIENCES.find(a => a[0] === v)[1]}`); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function saveEdit(e) {
    e.preventDefault();
    try {
      const p = await updatePost(token, post.id, { content: draft });
      setPost(p); setEditing(false);
      if (p.status === 'Pending') toast('Saved. The edited post is back with an admin for a quick check.');
    } catch (err) { toast(err.message, 'error'); }
  }
  async function remove() {
    setMenu(false);
    if (!await confirm({ title: 'Delete post?', message: 'This cannot be undone.', ok: 'Delete', danger: true })) return;
    try { await deletePost(token, post.id); onRemoved?.(post.id); } catch (e) { toast(e.message, 'error'); }
  }

  const aud = AUDIENCES.find(a => a[0] === post.visibility) ?? AUDIENCES[0];
  return (
    <article className={`cm-card cm-post${highlight ? ' highlight' : ''}`} ref={ref} id={`post-${post.id}`}>
      <header className="cm-post-head">
        <Link to={profileLink(post.authorId)}><Avatar name={post.authorName} seed={post.authorId} size={42} photoId={post.authorAvatarId} badge={post.authorBadge} /></Link>
        <div className="cm-post-who">
          <div>
            <Link to={profileLink(post.authorId)} className="cm-name">{post.authorName}</Link>
            {post.authorIsOfficial && <VerifiedTick />}
            <BadgeChip badge={post.authorBadge} />
            {post.sharedPost && <span className="cm-muted"> shared a post</span>}
            {post.groupName && <span className="cm-muted"> · {post.groupName}</span>}
          </div>
          <small>
            <Link to={`/community?post=${post.id}`}>{timeAgo(post.createdAt)}</Link>
            {post.editedAt && ' · Edited'} · <span title={aud[2]} className="cm-aud"><AudienceIcon value={post.visibility} /></span>
            {post.kind && post.kind !== 'Update' && <span className={`cm-kind k-${post.kind}`}>{post.kind}</span>}
            {post.status !== 'Approved' && <span className={`cm-status s-${post.status}`}>{post.status === 'Pending' ? 'Waiting for approval' : 'Not approved'}</span>}
          </small>
        </div>
        {(post.canEdit || post.canDelete) && (
          <div className="cm-post-menu">
            <button type="button" className="cm-round" onClick={() => setMenu(m => !m)} aria-label="Post options" aria-expanded={menu}>{Icon.dots}</button>
            {menu && (
              <div className="cm-menu" role="menu">
                {post.canEdit && <button type="button" role="menuitem" onClick={() => { setMenu(false); setEditing(true); setDraft(post.content); }}>Edit post</button>}
                {post.canEdit && AUDIENCES.map(([v, l, d]) => (
                  <button key={v} type="button" role="menuitemradio" aria-checked={post.visibility === v} className={post.visibility === v ? 'on' : ''} onClick={() => setAudience(v)}>
                    <span className="cm-menu-ico"><AudienceIcon value={v} size={15} /></span><span><b>{l}</b><small>{d}</small></span>
                  </button>
                ))}
                {post.canDelete && <button type="button" role="menuitem" className="danger" onClick={remove}>Delete post</button>}
              </div>
            )}
          </div>
        )}
      </header>

      {post.status === 'Rejected' && post.moderationNote && <p className="cm-note">Admin note: {post.moderationNote}</p>}
      {post.projectTitle && <h3 className="cm-post-title">{post.projectTitle}</h3>}
      {editing ? (
        <form className="cm-edit" onSubmit={saveEdit}>
          <textarea rows={4} value={draft} onChange={e => setDraft(e.target.value)} autoFocus />
          <div><button type="button" className="button button-quiet button-small" onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" className="button button-primary button-small">Save</button></div>
        </form>
      ) : post.content && <p className="cm-post-text"><RichText text={post.content} /></p>}
      <Attachments files={post.attachments} />
      {post.sharedPost && <SharedPreview post={post.sharedPost} />}
      {post.sharedPostUnavailable && <div className="cm-shared cm-muted">This content is no longer available.</div>}

      {(rx.total > 0 || comments > 0 || post.shareCount > 0) && (
        <div className="cm-counts">
          <ReactionSummary reactions={rx.reactions} total={rx.total} />
          <span>
            {comments > 0 && <button type="button" className="cm-link-btn" onClick={() => setShowComments(true)}>{comments} comment{comments === 1 ? '' : 's'}</button>}
            {post.shareCount > 0 && <span> · {post.shareCount} share{post.shareCount === 1 ? '' : 's'}</span>}
          </span>
        </div>
      )}
      {post.status === 'Approved' && (
        <div className="cm-actions">
          <ReactButton mine={rx.mine} onReact={react} />
          <button type="button" className="cm-action" onClick={() => setShowComments(true)}>{Icon.comment}<span>Comment</span></button>
          <ShareMenu post={post} onShared={p => onShared?.(p)} />
        </div>
      )}
      {showComments && post.status === 'Approved' && <Comments post={post} initial={post.recentComments} onCount={d => setComments(n => n + d)} />}
    </article>
  );
}

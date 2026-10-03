import { useEffect, useState } from 'react';
import { admin } from '../adminApi';
import { Empty, ErrorBox, Field, Icon, Loading, Modal, PageHead, useAsync, useFeedback } from '../ui';

const thumb = id => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;

/** The YouTube video library used by lessons. */
export default function Videos() {
  const { toast, confirm } = useFeedback();
  const list = useAsync(() => admin.videos(), []);
  const [q, setQ] = useState(new URLSearchParams(window.location.search).get('q') ?? '');
  const [editing, setEditing] = useState(null);
  const term = q.trim().toLowerCase();
  const videos = (list.data ?? []).filter(v => !term || `${v.title} ${v.channel}`.toLowerCase().includes(term));

  async function remove(v) {
    if (!await confirm({ title: 'Delete this video?', message: `"${v.title}" will be removed from the library.`, ok: 'Delete', danger: true })) return;
    try { await admin.deleteVideo(v.id); toast('Video deleted.'); list.reload(); }
    catch (e) { toast(e.message, 'error'); }
  }

  return (
    <>
      <PageHead title="Videos" sub="YouTube videos shown inside lessons on the website and the app. Add a video here, then pick it in a lesson.">
        <button type="button" className="adm-btn primary" onClick={() => setEditing({})}><Icon name="plus" />Add video</button>
      </PageHead>
      <section className="adm-card">
        <div className="adm-toolbar">
          <div className="adm-search"><Icon name="search" /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search title or channel" aria-label="Search videos" /></div>
          <span style={{ color: 'var(--a-faint)', fontSize: 13 }}>{list.data?.length ?? 0} videos</span>
        </div>
        {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
        {list.loading && !list.data && <Loading />}
        {list.data && videos.length === 0 && <Empty title="No videos found" />}
        <div className="adm-videos">
          {videos.map(v => (
            <article className="adm-card adm-video" key={v.id}>
              <a className="adm-video-thumb" href={`https://www.youtube.com/watch?v=${v.youtubeId}`} target="_blank" rel="noreferrer">
                <img src={thumb(v.youtubeId)} alt="" loading="lazy" />
                {v.duration && <span>{v.duration}</span>}
              </a>
              <div className="adm-video-body">
                <strong>{v.title}</strong>
                <small>{v.channel}</small>
              </div>
              <div className="adm-video-foot">
                {v.usedIn.length > 0
                  ? <span className="adm-pill info" title={v.usedIn.join(', ')}>In {v.usedIn.length} lesson{v.usedIn.length > 1 ? 's' : ''}</span>
                  : <span className="adm-pill">Not used yet</span>}
                <div className="adm-row-actions">
                  <button type="button" className="adm-icon-btn" onClick={() => setEditing(v)} aria-label="Edit"><Icon name="edit" size={16} /></button>
                  <button type="button" className="adm-icon-btn danger" onClick={() => remove(v)} aria-label="Delete"><Icon name="trash" size={16} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      {editing && <VideoForm video={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />}
    </>
  );
}

function VideoForm({ video, onClose, onSaved }) {
  const { toast } = useFeedback();
  const isNew = !video.id;
  const [form, setForm] = useState({
    url: video.youtubeId ? `https://www.youtube.com/watch?v=${video.youtubeId}` : '',
    title: video.title ?? '', channel: video.channel ?? '', duration: video.duration ?? '',
  });
  const [preview, setPreview] = useState(video.youtubeId ?? '');
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  // Paste a link and the title and channel fill themselves in.
  useEffect(() => {
    const url = form.url.trim();
    if (!url || (!isNew && url.endsWith(video.youtubeId))) return undefined;
    const t = setTimeout(async () => {
      setLooking(true);
      try {
        const r = await admin.lookupVideo(url);
        setPreview(r.youtubeId);
        setForm(f => ({ ...f, title: f.title || r.title || '', channel: f.channel || r.channel || '' }));
        setError('');
      } catch (e) { setPreview(''); setError(e.message); }
      finally { setLooking(false); }
    }, 450);
    return () => clearTimeout(t);
  }, [form.url, isNew, video.youtubeId]);

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (isNew) await admin.createVideo(form); else await admin.updateVideo(video.id, form);
      toast(isNew ? 'Video added to the library.' : 'Video updated.');
      onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? 'Add video' : 'Edit video'} onClose={onClose}>
      <form className="adm-form" onSubmit={save}>
        {error && <p className="adm-form-error">{error}</p>}
        <Field label="YouTube link" wide hint={looking ? 'Reading video details…' : 'Paste a youtube.com or youtu.be link.'}>
          <input type="url" value={form.url} onChange={set('url')} placeholder="https://www.youtube.com/watch?v=…" required autoFocus={isNew} />
        </Field>
        {preview && (
          <div className="adm-video-preview wide">
            <img src={thumb(preview)} alt="" />
            <span style={{ color: 'var(--a-soft)', fontSize: 13 }}>Video id <b>{preview}</b>. Check the title and channel below.</span>
          </div>
        )}
        <Field label="Title" wide><input type="text" value={form.title} onChange={set('title')} maxLength={200} required /></Field>
        <Field label="Channel"><input type="text" value={form.channel} onChange={set('channel')} maxLength={120} required /></Field>
        <Field label="Length (optional)" hint="For example 8:41 or 1:03:20"><input type="text" value={form.duration} onChange={set('duration')} maxLength={20} /></Field>
        <div className="adm-modal-actions wide">
          <button type="button" className="adm-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

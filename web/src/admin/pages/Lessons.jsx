import { useState } from 'react';
import { Link } from 'react-router-dom';
import { admin } from '../adminApi';
import { Empty, ErrorBox, Field, Icon, Loading, Modal, PageHead, move, timeAgo, useAsync, useFeedback } from '../ui';

/** Learn tracks and their lessons. */
export default function Lessons() {
  const { toast, confirm } = useFeedback();
  const tracks = useAsync(() => admin.tracks(), []);
  const [editingTrack, setEditingTrack] = useState(null);

  async function reorderTracks(index, dir) {
    const next = move(tracks.data, index, dir);
    tracks.setData(next);
    try { await admin.reorderTracks(next.map(t => t.id)); } catch (e) { toast(e.message, 'error'); tracks.reload(); }
  }

  async function reorderLessons(track, index, dir) {
    const lessons = move(track.lessons, index, dir);
    tracks.setData(d => d.map(t => (t.id === track.id ? { ...t, lessons } : t)));
    try { await admin.reorderLessons(track.id, lessons.map(l => l.id)); } catch (e) { toast(e.message, 'error'); tracks.reload(); }
  }

  async function removeLesson(l) {
    if (!await confirm({ title: `Delete "${l.title}"?`, message: 'The lesson is removed from the website and the app. This cannot be undone. To take it offline for now, open it and switch off Published instead.', ok: 'Delete lesson', danger: true })) return;
    try { await admin.deleteLesson(l.id); toast('Lesson deleted.'); tracks.reload(); } catch (e) { toast(e.message, 'error'); }
  }

  async function removeTrack(t) {
    if (!await confirm({ title: `Delete the "${t.label}" track?`, message: 'Only empty tracks can be deleted.', ok: 'Delete track', danger: true })) return;
    try { await admin.deleteTrack(t.id); toast('Track deleted.'); tracks.reload(); } catch (e) { toast(e.message, 'error'); }
  }

  return (
    <>
      <PageHead title="Lessons" sub="Learn is organised into tracks. Each track is a tab on the website's Learn page and in the app.">
        <a className="adm-btn" href="/learn" target="_blank" rel="noreferrer"><Icon name="external" size={16} />View Learn page</a>
        <button type="button" className="adm-btn" onClick={() => setEditingTrack({})}><Icon name="plus" />New track</button>
        <Link className="adm-btn primary" to="/admin/lessons/new"><Icon name="plus" />New lesson</Link>
      </PageHead>
      {tracks.error && <ErrorBox error={tracks.error} onRetry={tracks.reload} />}
      {tracks.loading && !tracks.data && <Loading />}
      {tracks.data?.length === 0 && <section className="adm-card"><Empty title="No tracks yet" text="Create a track first, then add lessons to it." /></section>}
      {tracks.data?.map((t, ti) => (
        <section className="adm-card adm-section" key={t.id}>
          <div className="adm-card-head">
            <div>
              <h2>{t.label} <span className="adm-pill" style={{ marginLeft: 6 }}>{t.lessons.length} lessons</span></h2>
              <p>{t.intro}</p>
            </div>
            <div className="adm-row-actions">
              <button type="button" className="adm-icon-btn" disabled={ti === 0} onClick={() => reorderTracks(ti, -1)} aria-label="Move track up"><Icon name="up" /></button>
              <button type="button" className="adm-icon-btn" disabled={ti === tracks.data.length - 1} onClick={() => reorderTracks(ti, 1)} aria-label="Move track down"><Icon name="down" /></button>
              <button type="button" className="adm-icon-btn" onClick={() => setEditingTrack(t)} aria-label="Edit track"><Icon name="edit" size={16} /></button>
              {t.lessons.length === 0 && <button type="button" className="adm-icon-btn danger" onClick={() => removeTrack(t)} aria-label="Delete track"><Icon name="trash" size={16} /></button>}
              <Link className="adm-btn sm" to={`/admin/lessons/new?track=${t.id}`}><Icon name="plus" size={15} />Lesson</Link>
            </div>
          </div>
          {t.lessons.length === 0 && <Empty title="No lessons in this track" />}
          <ul className="adm-list">
            {t.lessons.map((l, i) => (
              <li key={l.id} className={l.isPublished ? '' : 'muted'}>
                <span className="n">{i + 1}</span>
                <div className="grow">
                  <strong><Link to={`/admin/lessons/${l.id}`} style={{ textDecoration: 'none' }}>{l.title}</Link></strong>
                  <small>{l.blocks} blocks · updated {timeAgo(l.updatedAt)}</small>
                </div>
                {!l.isPublished && <span className="adm-pill">Draft</span>}
                <div className="adm-row-actions">
                  <button type="button" className="adm-icon-btn" disabled={i === 0} onClick={() => reorderLessons(t, i, -1)} aria-label="Move up"><Icon name="up" /></button>
                  <button type="button" className="adm-icon-btn" disabled={i === t.lessons.length - 1} onClick={() => reorderLessons(t, i, 1)} aria-label="Move down"><Icon name="down" /></button>
                  <Link className="adm-icon-btn" to={`/admin/lessons/${l.id}`} aria-label="Edit"><Icon name="edit" size={16} /></Link>
                  <button type="button" className="adm-icon-btn danger" onClick={() => removeLesson(l)} aria-label="Delete"><Icon name="trash" size={16} /></button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {editingTrack && <TrackForm track={editingTrack} onClose={() => setEditingTrack(null)} onSaved={() => { setEditingTrack(null); tracks.reload(); }} />}
    </>
  );
}

function TrackForm({ track, onClose, onSaved }) {
  const { toast } = useFeedback();
  const isNew = !track.id;
  const [form, setForm] = useState({ label: track.label ?? '', intro: track.intro ?? '' });
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    try {
      if (isNew) await admin.createTrack(form); else await admin.updateTrack(track.id, form);
      toast(isNew ? 'Track created.' : 'Track updated.');
      onSaved();
    } catch (err) { setError(err.message); }
  }

  return (
    <Modal title={isNew ? 'New track' : 'Edit track'} onClose={onClose}>
      <form className="adm-form" onSubmit={save}>
        {error && <p className="adm-form-error">{error}</p>}
        <Field label="Name" wide hint="Shown as a tab, e.g. Documentation & reports"><input type="text" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} maxLength={120} required /></Field>
        <Field label="Introduction" wide><textarea value={form.intro} onChange={e => setForm(f => ({ ...f, intro: e.target.value }))} maxLength={1000} rows={3} /></Field>
        <div className="adm-modal-actions wide">
          <button type="button" className="adm-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}

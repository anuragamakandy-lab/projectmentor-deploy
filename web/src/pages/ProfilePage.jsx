import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { deleteAccount, getNotifications, markNotificationsRead, removeAvatar, updateProfile, uploadAvatar } from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';
import { useMe } from '../auth/useMe';
import Avatar, { BADGES, BadgeChip, timeAgo } from '../components/Avatar';
import { useFeedback } from '../ui/feedback';
import { compressImage } from '../ui/image';
import '../styles/profile.css';

const STAT_LABELS = [
  ['roadmaps', 'Roadmaps'], ['milestonesDone', 'Milestones done'], ['vivasCompleted', 'Mock vivas'], ['averageVivaScore', 'Average viva score', '%'],
  ['posts', 'Community posts'], ['reactionsReceived', 'Reactions received'], ['groups', 'Groups'], ['tasksDone', 'Tasks finished'],
];
const KIND_LABEL = { Roadmap: 'Roadmap', Milestone: 'Milestone', Viva: 'Mock viva', Post: 'Community', Group: 'Group', Task: 'Sprint board' };

/** The student's own profile: details, picture, progress, activity, notifications and account deletion. */
export default function ProfilePage() {
  const { token, updateUser, logout } = useAuth();
  const { me, reload } = useMe();
  const { toast, confirm, prompt } = useFeedback();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const fileRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(null);

  useEffect(() => { reload().catch(e => toast(e.message, 'error')); }, [reload, toast]);
  useEffect(() => {
    getNotifications(token).then(n => { setNotes(n); if (n.unread) markNotificationsRead(token).catch(() => {}); }).catch(() => setNotes({ items: [] }));
  }, [token]);
  useEffect(() => {
    if (hash && notes) document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, notes]);

  if (!me) return <main className="profile container"><p className="note">Loading your profile…</p></main>;
  const u = me.usage;
  const s = u.stats;

  function startEdit() {
    setForm({ fullName: me.fullName, yearOfStudy: me.yearOfStudy ?? '', bio: me.bio ?? '' });
    setEditing(true);
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateProfile(token, { fullName: form.fullName, yearOfStudy: form.yearOfStudy === '' ? null : Number(form.yearOfStudy), bio: form.bio });
      updateUser({ fullName: form.fullName.trim() });
      await reload();
      setEditing(false);
      toast('Profile updated.');
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  }

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      await uploadAvatar(token, await compressImage(file, { max: 512 }));
      await reload();
      toast('Profile picture updated. It now shows in the community too.');
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  }

  async function dropPhoto() {
    if (!await confirm({ title: 'Remove your profile picture?', message: 'Your initials will be shown instead.', ok: 'Remove' })) return;
    try { await removeAvatar(token); await reload(); toast('Profile picture removed.'); } catch (err) { toast(err.message, 'error'); }
  }

  async function removeAccount() {
    if (!await confirm({
      title: 'Delete your account?',
      message: 'Your roadmaps, groups you own, posts, mock vivas and progress are deleted for good. This cannot be undone.',
      ok: 'Continue', danger: true,
    })) return;
    const value = await prompt(me.hasPassword
      ? { title: 'Confirm with your password', message: 'Enter your password to delete your account.', inputType: 'password', ok: 'Delete my account', danger: true }
      : { title: 'Confirm with your email', message: `Type ${me.email} to delete your account.`, placeholder: me.email, ok: 'Delete my account', danger: true });
    if (value == null) return;
    try {
      await deleteAccount(token, me.hasPassword ? { password: value } : { confirmEmail: value });
      logout();
      navigate('/', { replace: true });
    } catch (err) { toast(err.message, 'error'); }
  }

  const frame = BADGES[me.badge];
  return (
    <main className="profile container">
      <section className="pf-card pf-head">
        <div className="pf-photo">
          <Avatar name={me.fullName} seed={me.id} size={112} photoId={me.avatarId} badge={me.badge} title="" />
          <div className="pf-photo-actions">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={pickPhoto} />
            <button type="button" className="button button-quiet button-small" onClick={() => fileRef.current?.click()} disabled={busy}>{me.avatarId ? 'Change photo' : 'Add photo'}</button>
            {me.avatarId && <button type="button" className="pf-link" onClick={dropPhoto}>Remove</button>}
          </div>
        </div>

        {!editing ? (
          <div className="pf-who">
            <h1>{me.fullName} <BadgeChip badge={me.badge} /></h1>
            <p className="pf-meta">{me.email}{me.yearOfStudy ? ` · Year ${me.yearOfStudy}` : ''} · joined {new Date(me.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
            {me.bio ? <p className="pf-bio">{me.bio}</p> : <p className="pf-bio muted">Add a short bio so your group and the community know what you are building.</p>}
            {frame && <p className="pf-badge-note">You are a <strong style={{ color: frame.color }}>{frame.label}</strong>. Your badge frames your picture in the community.</p>}
            <button type="button" className="button button-primary button-small" onClick={startEdit}>Edit profile</button>
          </div>
        ) : (
          <form className="pf-form" onSubmit={save}>
            <label className="form-field">Full name<input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} maxLength={120} required /></label>
            <label className="form-field">Year of study
              <select value={form.yearOfStudy} onChange={e => setForm(f => ({ ...f, yearOfStudy: e.target.value }))}>
                <option value="">Not set</option>
                {[1, 2, 3, 4, 5, 6].map(y => <option key={y} value={y}>Year {y}</option>)}
              </select>
            </label>
            <label className="form-field pf-wide">Bio<textarea rows={3} maxLength={500} value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="What are you building? What do you want feedback on?" /></label>
            <div className="pf-form-actions">
              <button type="button" className="button button-quiet button-small" onClick={() => setEditing(false)}>Cancel</button>
              <button type="submit" className="button button-primary button-small" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        )}
      </section>

      <div className="pf-grid">
        <section className="pf-card">
          <h2>Current progress</h2>
          <div className="pf-progress">
            <div className="pf-ring" style={{ '--p': s.progressPercent }}><span>{s.progressPercent}%</span></div>
            <p>{s.milestones ? <>You have finished <strong>{s.milestonesDone} of {s.milestones}</strong> milestones in your accepted roadmaps.</> : <>Accept a roadmap to start tracking progress. <Link to="/student">Create one</Link>.</>}</p>
          </div>
          {u.progress.map(r => (
            <Link key={r.roadmapRequestId} className="pf-bar" to={`/student/roadmaps/${r.roadmapRequestId}`}>
              <span className="pf-bar-top"><strong>{r.title}</strong><small>{r.overdue > 0 && <b className="pf-late">{r.overdue} overdue</b>}{r.done}/{r.total}</small></span>
              <span className="pf-bar-track"><span style={{ width: `${r.total ? (r.done / r.total) * 100 : 0}%` }} /></span>
            </Link>
          ))}
          <div className="pf-stats">
            {STAT_LABELS.map(([k, label, unit]) => (
              <div key={k}><strong>{s[k] ?? '—'}{s[k] != null && unit ? unit : ''}</strong><span>{label}</span></div>
            ))}
          </div>
        </section>

        <section className="pf-card">
          <h2>Recent activity</h2>
          {u.activity.length === 0 && <p className="note">Your roadmaps, vivas, posts and finished tasks will appear here.</p>}
          <ol className="pf-timeline">
            {u.activity.map((a, i) => (
              <li key={i}>
                <span className={`pf-dot k-${a.kind}`} aria-hidden="true" />
                <div>
                  {a.link ? <Link to={a.link}>{a.text}</Link> : <span>{a.text}</span>}
                  <small>{KIND_LABEL[a.kind] ?? a.kind} · {timeAgo(a.at)}</small>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="pf-card" id="notifications">
        <h2>Notifications</h2>
        {!notes && <p className="note">Loading…</p>}
        {notes?.items.length === 0 && <p className="note">No notifications yet.</p>}
        <ul className="pf-notes">
          {notes?.items.map(n => (
            <li key={n.id}>
              <div>
                {n.link ? <Link to={n.link}><strong>{n.title}</strong></Link> : <strong>{n.title}</strong>}
                {n.body && <p>{n.body}</p>}
              </div>
              <small>{timeAgo(n.createdAt)}</small>
            </li>
          ))}
        </ul>
      </section>

      <section className="pf-card pf-danger">
        <div>
          <h2>Delete account</h2>
          <p>Permanently delete your account and everything in it.</p>
        </div>
        <button type="button" className="button button-danger button-small" onClick={removeAccount}>Delete my account</button>
      </section>
    </main>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createGroup, listGroups, listRoadmapRequests } from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';
import { timeAgo } from '../components/Avatar';
import '../styles/groups.css';

/** Accepts a full invite link (…/join/<code>) or just the code. */
export function inviteCodeFrom(text) {
  const t = (text || '').trim();
  const m = t.match(/\/join\/([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(t) ? t : null;
}

export default function GroupsPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState(null);
  const [roadmaps, setRoadmaps] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', roadmapRequestId: '' });
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    listGroups(token).then(setGroups).catch(e => { setError(e.message); setGroups([]); });
    listRoadmapRequests(token).then(r => setRoadmaps((r ?? []).filter(x => x.roadmapStatus === 'Accepted'))).catch(() => {});
  }, [token]);

  async function create(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Give your group a name.'); return; }
    setBusy(true); setError('');
    try {
      const g = await createGroup(token, { name: form.name.trim(), description: form.description.trim() || null, roadmapRequestId: form.roadmapRequestId || null });
      navigate(`/groups/${g.id}?invite=1`);
    } catch (err) { setError(err.message); setBusy(false); }
  }

  function join(e) {
    e.preventDefault();
    const code = inviteCodeFrom(link);
    if (!code) { setError('That does not look like an invite link. It should end with /join/ and a long code.'); return; }
    navigate(`/join/${code}`);
  }

  const first = user?.fullName?.split(' ')[0];

  return (
    <main className="grp">
      <section className="grp-hero">
        <div className="grp-hero-inner">
          <div>
            <p className="eyebrow">Project groups</p>
            <h1>Build it <em>together.</em></h1>
            <p className="grp-lede">{first ? `${first}, create` : 'Create'} a private group for your team, invite members with a link, plan weekly sprints with AI, and chat — all in one place.</p>
            <div className="grp-hero-cta">
              <button type="button" className="button button-gold" onClick={() => setShowCreate(s => !s)}>+ Create a group</button>
              <Link className="button button-quiet" to="/community">Visit the community →</Link>
            </div>
          </div>
          <ol className="grp-how" aria-label="How groups work">
            <li><span>1</span><div><strong>Create a group</strong><small>Link the roadmap your team is building.</small></div></li>
            <li><span>2</span><div><strong>Share the invite link</strong><small>Like GitHub: teammates open it and join.</small></div></li>
            <li><span>3</span><div><strong>Plan the sprint with AI</strong><small>Milestones become small weekly tasks.</small></div></li>
            <li><span>4</span><div><strong>Work, chat and track</strong><small>Drag tasks to Done — the roadmap updates itself.</small></div></li>
          </ol>
        </div>
      </section>

      <div className="grp-wrap">
        {showCreate && (
          <form className="grp-card grp-create" onSubmit={create}>
            <h2>Create a new group</h2>
            <div className="grp-form-grid">
              <label>Group name <em>required</em>
                <input value={form.name} maxLength={120} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Team FindIt – SE3090 Group 07" autoFocus />
              </label>
              <label>Shared roadmap
                <select value={form.roadmapRequestId} onChange={e => setForm(f => ({ ...f, roadmapRequestId: e.target.value }))}>
                  <option value="">Choose later</option>
                  {roadmaps.map(r => <option key={r.id} value={r.id}>{r.displayTitle}</option>)}
                </select>
                <small>The AI plans the team’s weekly tasks from this roadmap.</small>
              </label>
              <label className="wide">Short description
                <textarea rows={2} maxLength={1000} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Final-year project. We meet every Tuesday at 4 pm." />
              </label>
            </div>
            <div className="grp-actions">
              <button type="button" className="button button-quiet" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="button button-emerald" disabled={busy}>{busy ? 'Creating…' : 'Create group'}</button>
            </div>
          </form>
        )}

        <form className="grp-join" onSubmit={join}>
          <span aria-hidden="true"></span>
          <label htmlFor="grp-link">Got an invite link?</label>
          <input id="grp-link" value={link} onChange={e => setLink(e.target.value)} placeholder="Paste it here — e.g. http://…/join/Ab3x…" />
          <button type="submit" className="button button-emerald button-small" disabled={!link.trim()}>Open</button>
        </form>

        {error && <p className="error-message" role="alert">{error}</p>}

        <h2 className="grp-section">Your groups</h2>
        {groups === null && <p className="note">Loading…</p>}
        {groups?.length === 0 && (
          <div className="grp-empty">
            <span aria-hidden="true"></span>
            <strong>You are not in a group yet</strong>
            <p>Create one for your team, or ask a teammate for their invite link.</p>
            <button type="button" className="button button-emerald" onClick={() => setShowCreate(true)}>Create my first group</button>
          </div>
        )}
        <div className="grp-grid">
          {groups?.map(g => {
            const total = g.openTasks + g.doneTasks;
            const pct = total ? Math.round((g.doneTasks / total) * 100) : 0;
            return (
              <Link className="grp-tile" to={`/groups/${g.id}`} key={g.id} style={{ '--g': g.color }}>
                <div className="grp-tile-top">
                  <span className="grp-badge" aria-hidden="true">{g.name.slice(0, 1).toUpperCase()}</span>
                  <div className="grp-tile-title">
                    <h3>{g.name}</h3>
                    <small>{g.myRole === 'Owner' ? 'Owner' : 'Member'} · {g.memberCount} member{g.memberCount === 1 ? '' : 's'}</small>
                  </div>
                </div>
                {g.description && <p className="grp-tile-desc">{g.description}</p>}
                <div className="grp-tile-road">{g.roadmapTitle ? <>{g.roadmapTitle}</> : <span className="muted">No roadmap linked yet</span>}</div>
                <div className="grp-tile-progress">
                  <div className="grp-bar"><span style={{ width: `${pct}%` }} /></div>
                  <small>{total ? `${g.doneTasks}/${total} tasks done` : 'No tasks yet'}</small>
                </div>
                <div className="grp-tile-foot">
                  <span className="grp-initials">{g.memberInitials.map((i, k) => <span key={k}>{i}</span>)}</span>
                  {g.lastMessageAt && <small className="grp-last" title={g.lastMessagePreview}>{timeAgo(g.lastMessageAt)}</small>}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}

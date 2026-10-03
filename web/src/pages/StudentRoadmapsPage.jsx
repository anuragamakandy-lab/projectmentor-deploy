import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deleteRoadmapRequest, listRoadmapRequests, renameRoadmapRequest } from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';
import { useFeedback } from '../ui/feedback';
import { daysLeft, fmtDate } from '../components/roadmap/RoadmapKit';

const STATUS = {
  Accepted: ['Active', 'ok'], PendingApproval: ['Waiting for you to review', 'wait'], RevisionRequested: ['Revision requested', 'wait'],
  Planning: ['Being planned', 'wait'], Submitted: ['Draft', 'draft'], Failed: ['Could not be planned', 'bad'],
};
const TYPE_LABEL = { web: 'Web app', mobile: 'Mobile app', data: 'Data / AI' };

/** Where clicking a roadmap card should go, based on how far it got. */
function targetFor(r) {
  if (r.roadmapStatus === 'None' && (r.requestStatus === 'Submitted' || r.requestStatus === 'Planning')) return `/student/roadmaps/${r.id}/chat`;
  return `/student/roadmaps/${r.id}`;
}

export default function StudentRoadmapsPage() {
  const { confirm, prompt, toast } = useFeedback();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [roadmaps, setRoadmaps] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const load = () => listRoadmapRequests(token).then(setRoadmaps).catch(e => setError(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  async function rename(e, r) {
    e.stopPropagation();
    const title = await prompt({ title: 'Rename roadmap', value: r.displayTitle, ok: 'Save' });
    if (title === null) return;
    try { await renameRoadmapRequest(token, r.id, title.trim() || null); load(); } catch (err) { toast(err.message, 'error'); }
  }
  async function remove(e, r) {
    e.stopPropagation();
    if (!await confirm({ title: `Delete "${r.displayTitle}"?`, message: 'This permanently removes the roadmap, its progress and its mentor chat.', ok: 'Delete roadmap', danger: true })) return;
    try { await deleteRoadmapRequest(token, r.id); load(); toast('Roadmap deleted.'); } catch (err) { toast(err.message, 'error'); }
  }

  const list = (roadmaps ?? []).filter(r => filter === 'all' || (filter === 'active' ? r.roadmapStatus === 'Accepted' : r.roadmapStatus !== 'Accepted'));
  const active = (roadmaps ?? []).filter(r => r.roadmapStatus === 'Accepted');
  const overdue = active.reduce((n, r) => n + r.overdueCount, 0);

  return (
    <main className="page page-wide rm-page">
      <div className="rm-head">
        <div>
          <p className="eyebrow">Roadmaps</p>
          <h1>Your projects</h1>
          <p className="page-lede">Each roadmap is one project with its own milestones, mentor chat and report. Click a card to open it.</p>
        </div>
        <Link className="button button-primary" to="/student">+ New roadmap</Link>
      </div>

      {roadmaps && roadmaps.length > 0 && (
        <div className="rl-stats">
          <div><b>{roadmaps.length}</b><span>roadmaps</span></div>
          <div><b>{active.length}</b><span>active</span></div>
          <div><b>{active.length ? Math.round(active.reduce((n, r) => n + r.progressPercent, 0) / active.length) : 0}%</b><span>average progress</span></div>
          <div className={overdue ? 'late' : ''}><b>{overdue}</b><span>overdue milestones</span></div>
        </div>
      )}

      {roadmaps && roadmaps.length > 0 && (
        <div className="cm-pills rl-filter" role="tablist">
          {[['all', 'All'], ['active', 'Active'], ['other', 'Drafts & reviews']].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      )}

      {error && <p className="error-message" role="alert">{error}</p>}
      {!roadmaps && !error && <div className="rl-grid"><div className="rl-card skeleton" /><div className="rl-card skeleton" /></div>}
      {roadmaps?.length === 0 && (
        <section className="rm-panel rl-empty">
          <img src="/home/plan.webp" alt="" />
          <div>
            <h2>Start your first roadmap</h2>
            <p>Answer a few questions, talk your idea through with the mentor and get a dated plan with milestones and resources.</p>
            <Link className="button button-primary" to="/student">Start a roadmap</Link>
          </div>
        </section>
      )}

      <div className="rl-grid">
        {list.map(r => {
          const [label, tone] = r.roadmapStatus === 'Accepted' ? STATUS.Accepted : r.roadmapStatus === 'PendingApproval' ? STATUS.PendingApproval : STATUS[r.requestStatus] ?? [r.requestStatus, 'draft'];
          const days = r.deadline && r.deadline !== '0001-01-01' ? daysLeft(r.deadline) : null;
          return (
            <article key={r.id} className={`rl-card t-${tone}`} role="link" tabIndex={0} onClick={() => navigate(targetFor(r))}
              onKeyDown={e => { if (e.key === 'Enter') navigate(targetFor(r)); }} aria-label={`Open ${r.displayTitle}`}>
              <div className="rl-top">
                <span className={`rl-status ${tone}`}>{label}</span>
                {r.projectType && <span className="rl-type">{TYPE_LABEL[r.projectType] ?? r.projectType}</span>}
              </div>
              <h2>{r.displayTitle}</h2>
              {r.roadmapStatus === 'Accepted' ? (
                <>
                  <div className="rl-progress"><span style={{ width: `${r.progressPercent}%` }} /></div>
                  <p className="rl-line"><b>{r.progressPercent}%</b> · {r.doneCount} of {r.milestoneCount} milestones done
                    {r.overdueCount > 0 && <span className="rl-late">{r.overdueCount} overdue</span>}</p>
                </>
              ) : (
                <p className="rl-line">{r.roadmapStatus === 'PendingApproval' ? 'Your plan is ready. Open it to review and accept.' : r.requestStatus === 'Failed' ? 'Open it to try again.' : 'Continue where you left off.'}</p>
              )}
              <div className="rl-foot">
                <span>{days === null ? `Created ${new Date(r.createdAt).toLocaleDateString()}` : days >= 0 ? `Due ${fmtDate(r.deadline)} · ${days} days left` : `Deadline passed (${fmtDate(r.deadline)})`}</span>
                <span className="rl-tools">
                  <button type="button" onClick={e => rename(e, r)} aria-label={`Rename ${r.displayTitle}`}>Rename</button>
                  <button type="button" className="danger" onClick={e => remove(e, r)} aria-label={`Delete ${r.displayTitle}`}>Delete</button>
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}

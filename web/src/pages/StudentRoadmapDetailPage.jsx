import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { acceptRoadmap, downloadRoadmapReport, getRoadmapRequest, getRoadmapSummary, planRoadmap, requestRevision, updateMilestoneStatus } from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';
import DeadlineCalendar from '../components/DeadlineCalendar';
import { RoadmapSteps, daysLeft, fmtDate } from '../components/roadmap/RoadmapKit';
import { useFeedback } from '../ui/feedback';

const STATUSES = [['NotStarted', 'Not started'], ['InProgress', 'In progress'], ['Blocked', 'Blocked'], ['Done', 'Done']];
const STATUS_CLASS = { NotStarted: 'todo', InProgress: 'doing', Blocked: 'blocked', Done: 'done' };
const overdue = m => m.isOverdue ?? (m.status !== 'Done' && daysLeft(m.dueDate) < 0);

function SummaryCard({ summary, onClose, first }) {
  if (!summary) return null;
  return (
    <section className={`rd-summary${first ? ' first' : ''}`} aria-labelledby="rd-summary-title">
      <div className="rd-summary-head">
        <div>
          <p className="eyebrow">{first ? 'Roadmap accepted' : 'Roadmap summary'}</p>
          <h2 id="rd-summary-title">{first ? 'Your plan is locked in. Here is the summary.' : 'Your plan at a glance'}</h2>
        </div>
        {onClose && <button type="button" className="button button-quiet button-small" onClick={onClose}>Hide</button>}
      </div>
      <p className="rd-overview">{summary.overview}</p>
      {summary.phases?.length > 0 && (
        <ol className="rd-phases">
          {summary.phases.map((p, i) => <li key={i}><b>{p.name}</b><small>{p.dates}</small><span>{p.focus}</span></li>)}
        </ol>
      )}
      <div className="rd-cols">
        {summary.firstSteps?.length > 0 && <div><h3>Do this week</h3><ul>{summary.firstSteps.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
        {summary.tips?.length > 0 && <div><h3>Tips</h3><ul>{summary.tips.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
        {summary.risks?.length > 0 && <div><h3>Watch out for</h3><ul>{summary.risks.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
      </div>
    </section>
  );
}

export default function StudentRoadmapDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const { confirm, toast } = useFeedback();
  const [rm, setRm] = useState(undefined);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyMilestone, setBusyMilestone] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [justAccepted, setJustAccepted] = useState(false);
  const [showSummary, setShowSummary] = useState(true);
  const [open, setOpen] = useState('');

  const load = useCallback(async () => {
    try { setRm(await getRoadmapRequest(token, id)); }
    catch (e) { if (e.status === 404) setNotFound(true); else toast(e.message, 'error'); }
  }, [token, id, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!rm || !['Submitted', 'Planning'].includes(rm.requestStatus) || rm.milestones.length) return undefined;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [rm, load]);
  // Accepted before summaries existed: build it once.
  useEffect(() => {
    if (rm?.status === 'Accepted' && !rm.summary) getRoadmapSummary(token, id).then(s => setRm(r => ({ ...r, summary: s }))).catch(() => {});
  }, [rm?.status, rm?.summary, token, id]);

  async function decide(action) {
    if (action === 'revision' && !await confirm({ title: 'Ask for a different plan?', message: 'The current plan will be set aside. You can talk to the mentor and generate again.', ok: 'Request revision' })) return;
    setBusy(true);
    try {
      const updated = action === 'accept' ? await acceptRoadmap(token, rm.id) : await requestRevision(token, rm.id);
      setRm(updated);
      if (action === 'accept') { setJustAccepted(true); setShowSummary(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  async function download() {
    setDownloading(true);
    try {
      const { blob, filename } = await downloadRoadmapReport(token, id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { toast(e.message, 'error'); }
    finally { setDownloading(false); }
  }
  async function setStatus(milestoneId, status) {
    setBusyMilestone(milestoneId);
    try {
      const updated = await updateMilestoneStatus(token, milestoneId, status);
      setRm(w => ({ ...w, milestones: w.milestones.map(m => (m.id === milestoneId ? updated : m)) }));
      if (status === 'Done') toast('Nice work! Milestone done.');
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusyMilestone(''); }
  }

  if (notFound) return (
    <main className="page rm-page"><h1>Roadmap not found</h1><p className="page-lede">It does not exist or belongs to another account.</p>
      <Link to="/student/roadmaps" className="button button-primary">Back to your roadmaps</Link></main>
  );
  if (!rm) return <main className="page rm-page"><section className="rm-panel rm-loading"><span className="rm-spinner" /><p>Loading roadmap…</p></section></main>;

  const processing = ['Submitted', 'Planning'].includes(rm.requestStatus) && rm.milestones.length === 0;
  const pending = rm.status === 'PendingApproval';
  const active = rm.status === 'Accepted';
  const ms = rm.milestones;
  const done = ms.filter(m => m.status === 'Done').length;
  const pct = ms.length ? Math.round((done / ms.length) * 100) : 0;
  const late = ms.filter(overdue);
  const next = ms.filter(m => m.status !== 'Done').sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const deadline = ms.length ? ms[ms.length - 1].dueDate : null;

  return (
    <main className="page page-wide rm-page">
      <div className="rm-head">
        <div>
          <p className="eyebrow">{active ? 'Roadmap' : pending ? 'Review your plan' : 'Roadmap'}</p>
          <h1>{rm.title || 'Your roadmap'}</h1>
          {rm.description && <p className="page-lede rd-desc">{rm.description.split('\n')[0]}</p>}
        </div>
        <Link to="/student/roadmaps" className="button button-quiet button-small">← All roadmaps</Link>
      </div>
      {pending && <RoadmapSteps current="review" links={{}} />}

      {processing && <section className="rm-panel rm-loading"><span className="rm-spinner" /><div><h2>Building your roadmap</h2><p className="note">Planning milestones, attaching resources and checking the dates. This takes a moment.</p></div></section>}

      {active && showSummary && rm.summary && <SummaryCard summary={rm.summary} first={justAccepted} onClose={() => setShowSummary(false)} />}
      {active && !showSummary && <button type="button" className="button button-quiet button-small rd-show" onClick={() => setShowSummary(true)}>Show the roadmap summary</button>}

      {(pending || active) && (
        <>
          <section className="rd-overview-grid">
            <div className="rd-stat main">
              {active ? <>
                <span className="rd-ring" style={{ '--p': pct }}><b>{pct}%</b></span>
                <div><b>{done} of {ms.length}</b><span>milestones done</span></div>
              </> : <div><b>{ms.length} milestones</b><span>ready for your review</span></div>}
            </div>
            <div className="rd-stat"><b>{next ? next.title : 'All done!'}</b><span>{next ? `Next · due ${fmtDate(next.dueDate)}` : 'Every milestone is complete'}</span></div>
            <div className={`rd-stat${late.length ? ' late' : ''}`}><b>{late.length}</b><span>{late.length ? 'overdue: update or catch up' : 'nothing overdue'}</span></div>
            {deadline && <div className="rd-stat"><b>{fmtDate(deadline)}</b><span>{daysLeft(deadline) >= 0 ? `${daysLeft(deadline)} days to go` : 'final date passed'}</span></div>}
          </section>

          <div className="rd-actions">
            {pending && <>
              <button className="button button-primary" disabled={busy} onClick={() => decide('accept')}>{busy ? 'Saving…' : 'Accept this roadmap'}</button>
            </>}
            <Link className="button button-quiet" to={`/student/roadmaps/${id}/conversation`}>Ask the mentor</Link>
            {active && <button className="button button-quiet" disabled={downloading} onClick={download}>{downloading ? 'Preparing PDF…' : 'Download report (PDF)'}</button>}
            {active && <Link className="button button-quiet" to={`/student/viva/new?roadmap=${id}`}>Practise viva</Link>}
            <Link className="button button-quiet" to={`/student/roadmaps/${id}/workflow`}>How the AI built this</Link>
          </div>

          {late.length > 0 && active && (
            <div className="rd-late" role="alert">
              <b>{late.length} milestone{late.length > 1 ? 's are' : ' is'} overdue.</b> {late.map(m => m.title).slice(0, 3).join(', ')}{late.length > 3 ? '…' : ''}. Finish them or update their status.
            </div>
          )}

          <section className="rm-panel">
            <h2 className="panel-title">{active ? 'Milestones' : 'Your plan'}</h2>
            <ol className="rd-list">
              {ms.map((m, i) => {
                const isLate = overdue(m);
                const expanded = open === m.id;
                return (
                  <li key={m.id} className={`rd-item ${STATUS_CLASS[m.status] ?? 'todo'}${isLate ? ' late' : ''}`} id={`m-${m.id}`}>
                    <span className="rd-node" aria-hidden="true">{m.status === 'Done' ? '✓' : i + 1}</span>
                    <div className="rd-body">
                      <button type="button" className="rd-row" onClick={() => setOpen(expanded ? '' : m.id)} aria-expanded={expanded}>
                        <span className="rd-title"><b>{m.title}</b><small>{m.phase}{m.estimatedHours ? ` · about ${Math.round(m.estimatedHours)} h` : ''}</small></span>
                        <span className="rd-due">{isLate && <span className="rd-late-chip">Overdue</span>}{fmtDate(m.dueDate)}</span>
                      </button>
                      {(expanded || !active) && m.description && <p className="rd-text">{m.description}</p>}
                      {expanded && m.resources?.length > 0 && (
                        <div className="rd-res">{m.resources.map(r => <a key={r.id} href={r.url} target="_blank" rel="noreferrer">{r.title} ↗</a>)}</div>
                      )}
                      {active && (
                        <div className="status-picker" role="group" aria-label={`Status for ${m.title}`}>
                          {STATUSES.map(([value, label]) => (
                            <button key={value} type="button" className={`status-opt ${STATUS_CLASS[value]}${m.status === value ? ' active' : ''}`}
                              disabled={busyMilestone === m.id} onClick={() => setStatus(m.id, value)}>{label}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
          <DeadlineCalendar milestones={ms} projectTitle={rm.title || 'My project'} />
        </>
      )}

      {!processing && !pending && !active && (
        <section className="rm-panel">
          <h2>This roadmap is not active</h2>
          <p className="note">{rm.requestStatus === 'RevisionRequested' ? 'You asked for changes. Talk to the mentor, then generate a new plan.' : `Status: ${rm.requestStatus}.`}</p>
          <div className="rd-actions">
            <Link className="button button-quiet" to={`/student/roadmaps/${id}/conversation`}>Tell the mentor what to change</Link>
            <button type="button" className="button button-primary" disabled={busy} onClick={async () => {
              setBusy(true);
              try { await planRoadmap(token, id, { title: rm.title, summary: rm.description }); await load(); }
              catch (e) { toast(e.message, 'error'); }
              finally { setBusy(false); }
            }}>{busy ? 'Building a new plan…' : 'Generate a new plan'}</button>
          </div>
        </section>
      )}
    </main>
  );
}

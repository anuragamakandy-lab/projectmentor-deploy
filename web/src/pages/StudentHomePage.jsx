import { useEffect, useState } from 'react';
import { acceptRoadmap, createRoadmapRequest, getCurrentRoadmapRequest, requestRevision } from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';

const defaultIntake = { year: '2', projectType: 'web', deadline: '2026-10-30', hoursPerWeek: '8' };
const showAgentModeIndicator = true;

function getErrorMessage(error) {
  if (error.code === 'API_UNREACHABLE') return error.message;
  return error.message || 'Something went wrong. Please try again.';
}

function MilestoneList({ milestones }) {
  return (
    <ol className="milestones">
      {milestones.map(milestone => (
        <li className="milestone" key={milestone.id}>
          <div>
            <span className="phase">{milestone.phase}</span>
            <h4>{milestone.title}</h4>
            <small>{milestone.description}</small>
          </div>
          <div className="milestone-meta">
            <span>{milestone.dueDate}</span>
            <span>{milestone.status}</span>
            <span>{milestone.resources?.length ? '● resource attached' : '○ no resource'}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function StudentHomePage() {
  const { token, user } = useAuth();
  const [workflow, setWorkflow] = useState(undefined);
  const [intake, setIntake] = useState(defaultIntake);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadCurrent() {
    try {
      const current = await getCurrentRoadmapRequest(token);
      setWorkflow(current);
    } catch (exception) {
      setError(getErrorMessage(exception));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCurrent(); }, [token]);

  useEffect(() => {
    if (!workflow || !['Submitted', 'Planning'].includes(workflow.requestStatus)) return undefined;
    const timer = window.setInterval(loadCurrent, 1500);
    return () => window.clearInterval(timer);
  }, [workflow, token]);

  function updateIntake(event) {
    setIntake(current => ({ ...current, [event.target.name]: event.target.value }));
    setError('');
  }

  async function submitIntake(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const created = await createRoadmapRequest(token, {
        year: Number(intake.year), projectType: intake.projectType,
        deadline: intake.deadline, hoursPerWeek: Number(intake.hoursPerWeek),
      });
      setWorkflow({ id: created.roadmapId, status: 'None', requestStatus: created.status, milestones: [] });
      await loadCurrent();
    } catch (exception) {
      setError(getErrorMessage(exception));
    } finally {
      setBusy(false);
    }
  }

  async function decide(action) {
    setBusy(true); setError('');
    try {
      const updated = action === 'accept'
        ? await acceptRoadmap(token, workflow.id)
        : await requestRevision(token, workflow.id);
      setWorkflow(updated);
    } catch (exception) {
      setError(getErrorMessage(exception));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="page"><p className="eyebrow">Student workspace</p><h1>Loading your project…</h1></main>;

  const hasDraftRevision = workflow?.requestStatus === 'RevisionRequested' && workflow.status === 'Draft';
  const isProcessing = workflow && ['Submitted', 'Planning'].includes(workflow.requestStatus);
  const isAwaitingApproval = workflow?.status === 'PendingApproval';
  const isActive = workflow?.status === 'Accepted';
  const showIntake = !workflow || hasDraftRevision;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Student workspace</p>
          <h1>Welcome, {user.fullName.split(' ')[0]}.</h1>
        </div>
      </div>
      <p className="page-lede">Your project roadmap lives here. Submit an intake, review the generated plan, and keep your next step visible — the Examiner is watching the dates.</p>

      {showIntake && (
        <section className="panel">
          <h2>{hasDraftRevision ? 'Start a fresh roadmap run' : 'Start your roadmap'}</h2>
          {hasDraftRevision && <p className="note">Your revision request has been recorded — automated re-planning arrives in a later phase.</p>}
          <form className="intake-grid" onSubmit={submitIntake}>
            <label className="form-field">Year of study
              <select name="year" value={intake.year} onChange={updateIntake}><option value="1">Year 1</option><option value="2">Year 2</option><option value="3">Year 3</option><option value="4">Year 4</option></select>
            </label>
            <label className="form-field">Project type
              <select name="projectType" value={intake.projectType} onChange={updateIntake}><option value="web">Web application</option><option value="mobile">Mobile application</option><option value="data">Data or AI project</option></select>
            </label>
            <label className="form-field">Deadline
              <input name="deadline" type="date" value={intake.deadline} onChange={updateIntake} required />
            </label>
            <label className="form-field">Hours per week
              <input name="hoursPerWeek" type="number" min="1" value={intake.hoursPerWeek} onChange={updateIntake} required />
            </label>
            <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Generating roadmap…' : 'Generate roadmap'}</button>
          </form>
        </section>
      )}

      {isProcessing && (
        <section className="panel">
          <h2>Generating your roadmap</h2>
          <p className="note">The workflow is planning, attaching resources, and validating your milestones. This only takes a moment.</p>
        </section>
      )}

      {(isAwaitingApproval || isActive) && (
        <section className="panel">
          <div className="status-row">
            <span className="chip">Request · {workflow.requestStatus}</span>
            <span className="chip gold">Roadmap · {workflow.status}</span>
          </div>
          {showAgentModeIndicator && <p className="note">Agents: rule-based (Phase 1) — LLM reasoning arrives in a later phase.</p>}
          <MilestoneList milestones={workflow.milestones} />
          {isAwaitingApproval && (
            <div className="hero-actions">
              <button className="button button-primary" disabled={busy} onClick={() => decide('accept')}>Accept roadmap</button>
              <button className="button button-quiet" disabled={busy} onClick={() => decide('revision')}>Request revision</button>
            </div>
          )}
        </section>
      )}

      <p className="demo-note">This calls the live API and PostgreSQL database. No canned or scripted data.</p>
      {error && <p className="error-message" role="alert">{error}</p>}
    </main>
  );
}

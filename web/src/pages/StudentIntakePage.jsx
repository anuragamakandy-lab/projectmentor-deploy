import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { deleteRoadmapRequest, draftRoadmapRequest } from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';
import { RoadmapSteps } from '../components/roadmap/RoadmapKit';

// Answers are kept in this tab so "Back" from the next steps brings them back.
const KEY = 'pm.intake';
const inThreeMonths = () => { const d = new Date(); d.setMonth(d.getMonth() + 3); return d.toISOString().slice(0, 10); };
const defaults = () => ({ mode: 'suggest', year: '3', projectType: 'web', deadline: inThreeMonths(), hoursPerWeek: '10', title: '', description: '', teamSize: '1', technologies: '', leastConfident: '', draftId: null });
const read = () => { try { return { ...defaults(), ...JSON.parse(sessionStorage.getItem(KEY) || '{}') }; } catch { return defaults(); } };

export default function StudentIntakePage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Answers come back only when the student pressed Back from a later step; "New roadmap" always starts empty.
  const [intake, setIntake] = useState(() => {
    if (location.state?.back) return read();
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
    return defaults();
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => { setIntake(c => ({ ...c, [k]: v })); setError(''); };
  const field = e => set(e.target.name, e.target.value);

  async function submit(event) {
    event.preventDefault();
    if (intake.mode === 'own' && intake.title.trim().length < 3) { setError('Give your project a short title.'); return; }
    if (new Date(intake.deadline) < new Date(Date.now() + 86400000)) { setError('Choose a deadline at least 2 days from today.'); return; }
    setBusy(true); setError('');
    try {
      // Going back and changing answers replaces the earlier unfinished draft instead of leaving it behind.
      if (intake.draftId) await deleteRoadmapRequest(token, intake.draftId).catch(() => {});
      const draft = await draftRoadmapRequest(token, {
        year: Number(intake.year), projectType: intake.projectType, deadline: intake.deadline, hoursPerWeek: Number(intake.hoursPerWeek),
        teamSize: intake.teamSize ? Number(intake.teamSize) : null, technologies: intake.technologies.trim() || null,
        leastConfident: intake.leastConfident.trim() || null,
        title: intake.mode === 'own' ? intake.title.trim() : null, description: intake.mode === 'own' ? intake.description.trim() || null : null,
      });
      const saved = { ...intake, draftId: draft.roadmapRequestId };
      sessionStorage.setItem(KEY, JSON.stringify(saved));
      navigate(intake.mode === 'suggest' ? `/student/roadmaps/${draft.roadmapRequestId}/ideas` : `/student/roadmaps/${draft.roadmapRequestId}/chat`,
        { state: intake.mode === 'own' ? { title: intake.title.trim(), summary: intake.description.trim() || null } : undefined });
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <main className="page rm-page">
      <div className="rm-head">
        <div>
          <p className="eyebrow">New roadmap</p>
          <h1>Let's plan your project, {user.fullName.split(' ')[0]}.</h1>
          <p className="page-lede">A few quick questions so the plan fits your deadline, your time and what you already know.</p>
        </div>
        <Link className="button button-quiet button-small" to="/student/roadmaps">My roadmaps</Link>
      </div>
      <RoadmapSteps current="details" />

      <form className="rm-form" onSubmit={submit}>
        <section className="rm-panel">
          <h2>1. Do you already have a project idea?</h2>
          <div className="rm-choice" role="radiogroup" aria-label="Do you have an idea?">
            <button type="button" role="radio" aria-checked={intake.mode === 'suggest'} className={intake.mode === 'suggest' ? 'on' : ''} onClick={() => set('mode', 'suggest')}>
              <strong>Suggest ideas for me</strong><span>The AI proposes projects that suit your year, time and skills.</span>
            </button>
            <button type="button" role="radio" aria-checked={intake.mode === 'own'} className={intake.mode === 'own' ? 'on' : ''} onClick={() => set('mode', 'own')}>
              <strong>I have an idea</strong><span>Describe it and go straight to the mentor chat.</span>
            </button>
          </div>
          {intake.mode === 'own' && (
            <div className="rm-grid">
              <label className="form-field rm-wide">Project title<input name="title" value={intake.title} onChange={field} placeholder="e.g. FindIt - campus lost and found app" maxLength={200} /></label>
              <label className="form-field rm-wide">Describe your idea <span className="optional">the more detail, the better the plan</span>
                <textarea name="description" rows={4} value={intake.description} onChange={field} maxLength={2000}
                  placeholder="What problem does it solve? Who will use it? What are the main features?" /></label>
            </div>
          )}
        </section>

        <section className="rm-panel">
          <h2>2. Your timeline</h2>
          <div className="rm-grid">
            <label className="form-field">Deadline<input name="deadline" type="date" value={intake.deadline} onChange={field} required /></label>
            <label className="form-field">Hours you can spend per week<input name="hoursPerWeek" type="number" min="1" max="80" value={intake.hoursPerWeek} onChange={field} required /></label>
            <label className="form-field">Team size<input name="teamSize" type="number" min="1" max="10" value={intake.teamSize} onChange={field} /></label>
          </div>
        </section>

        <section className="rm-panel">
          <h2>3. About you and the project</h2>
          <div className="rm-grid">
            <label className="form-field">Year of study
              <select name="year" value={intake.year} onChange={field}>{[1, 2, 3, 4].map(y => <option key={y} value={y}>Year {y}</option>)}</select>
            </label>
            <label className="form-field">Project type
              <select name="projectType" value={intake.projectType} onChange={field}>
                <option value="web">Web application</option><option value="mobile">Mobile application</option><option value="data">Data or AI project</option>
              </select>
            </label>
            <label className="form-field">Technologies you know <span className="optional">optional</span>
              <input name="technologies" value={intake.technologies} onChange={field} placeholder="e.g. React, C#, SQL" />
            </label>
            <label className="form-field">What feels hardest? <span className="optional">optional</span>
              <input name="leastConfident" value={intake.leastConfident} onChange={field} placeholder="e.g. database design, testing" />
            </label>
          </div>
        </section>

        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="rm-actions">
          <Link className="button button-quiet" to="/student/roadmaps">Cancel</Link>
          <button className="button button-primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : intake.mode === 'suggest' ? 'Next: see ideas →' : 'Next: talk to the mentor →'}
          </button>
        </div>
      </form>
    </main>
  );
}

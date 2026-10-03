import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteViva, listVivas } from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';
import Examiner from '../components/Examiner';
import '../styles/viva.css';
import { useFeedback } from '../ui/feedback';

const STEPS = [
  ['', 'Tell us about your project', 'A guided form collects every detail — or fill it in one click from your roadmap.'],
  ['', 'Answer out loud', 'Your examiner asks questions about YOUR project. Speak your answer (or type it).'],
  ['', 'Get live marks', 'Every answer is scored out of 10 with feedback and a high-scoring model answer.'],
  ['', 'See your report', 'A grade, your strong and weak topics, and exactly what to practise next.'],
];

export function ScoreRing({ percent, size = 64, stroke = 6, label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent ?? 0));
  const tone = p >= 75 ? 'good' : p >= 50 ? 'ok' : 'low';
  return (
    <svg className={`score-ring tone-${tone}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? `${p}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} className="score-ring-track" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} className="score-ring-bar" strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="score-ring-text" style={{ fontSize: size * 0.26 }}>
        {label ?? `${p}%`}
      </text>
    </svg>
  );
}

export default function VivaHomePage() {
  const { confirm } = useFeedback();
  const { token, user } = useAuth();
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listVivas(token).then(setSessions).catch(e => { setError(e.message); setSessions([]); });
  }, [token]);

  async function remove(id) {
    if (!await confirm({ title: 'Delete this practice viva?', message: 'Its questions, answers and marks are removed.', ok: 'Delete', danger: true })) return;
    try {
      await deleteViva(token, id);
      setSessions(s => s.filter(x => x.id !== id));
    } catch (e) { setError(e.message); }
  }

  const first = user?.fullName?.split(' ')[0];
  const voiceOk = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

  return (
    <main className="viva">
      <section className="viva-hero">
        <div className="viva-hero-inner">
          <div className="viva-hero-copy">
            <p className="eyebrow">AI Mock Viva</p>
            <h1>Practise your viva<br /><em>before</em> the real one.</h1>
            <p className="viva-hero-lede">
              {first ? `${first}, meet` : 'Meet'} <strong>your AI examiner</strong> — choose a character who reads your project,
              asks the questions a real panel would ask, and marks every answer live.
            </p>
            <div className="viva-hero-cta">
              <Link className="button button-gold" to="/student/viva/new">Start a mock viva →</Link>
              <a className="button button-quiet" href="#past">Past practice</a>
            </div>
            {!voiceOk && <p className="viva-hint">Tip: use Chrome or Edge to answer by voice. Other browsers can type answers.</p>}
          </div>
          <div className="viva-hero-art">
            <div className="viva-stage-card"><Examiner state="idle" mood="happy" size={300} /></div>
          </div>
        </div>
      </section>

      <section className="viva-wrap">
        <ol className="viva-steps">
          {STEPS.map(([icon, title, text], i) => (
            <li key={title}>
              <span className="viva-step-icon" aria-hidden="true">{icon}</span>
              <span className="viva-step-no">Step {i + 1}</span>
              <strong>{title}</strong>
              <p>{text}</p>
            </li>
          ))}
        </ol>

        <div className="viva-section-head" id="past">
          <h2>Your practice vivas</h2>
          {sessions?.length > 0 && <Link className="button button-emerald button-small" to="/student/viva/new">+ New viva</Link>}
        </div>

        {error && <p className="error-message" role="alert">{error}</p>}
        {sessions === null && <p className="note">Loading…</p>}
        {sessions?.length === 0 && (
          <div className="viva-empty">
            <strong>No practice yet</strong>
            <p>Your first mock viva takes about 10 minutes. You’ll finish with a clear list of what to revise.</p>
            <Link className="button button-emerald" to="/student/viva/new">Start my first viva</Link>
          </div>
        )}

        <div className="viva-list">
          {sessions?.map(s => {
            const done = s.status === 'Completed';
            return (
              <article className="viva-item" key={s.id}>
                <div className="viva-item-score">
                  {done ? <ScoreRing percent={s.scorePercent} /> : <span className="viva-item-live">In<br />progress</span>}
                </div>
                <div className="viva-item-body">
                  <h3>{s.title}</h3>
                  <p className="viva-item-meta">
                    <span className="chip">{s.stage} viva</span>
                    <span className="chip">{s.difficulty}</span>
                    <span>{new Date(s.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span>{done ? `${s.answered} questions answered` : `${s.answered} of ${s.total} answered`}</span>
                  </p>
                </div>
                <div className="viva-item-actions">
                  <Link className={`button button-small ${done ? 'button-quiet' : 'button-emerald'}`} to={`/student/viva/${s.id}`}>
                    {done ? 'View report' : 'Continue →'}
                  </Link>
                  <button className="icon-btn" type="button" onClick={() => remove(s.id)} aria-label={`Delete ${s.title}`} title="Delete"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" /></svg></button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

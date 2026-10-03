import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { answerViva, finishViva, getViva } from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';
import Examiner from '../components/Examiner';
import { ACCENTS, LANGUAGES, lookOf } from '../content/examiners';

const LANGUAGE_NAME = Object.fromEntries(LANGUAGES);
export const sampleLine = c => `Hello, I am ${c?.name ?? 'your examiner'}. This is how I sound.`;
import { useListener, useSpeaker } from '../hooks/useSpeech';
import { ScoreRing } from './VivaHomePage';
import '../styles/viva.css';
import { scrollToAnchor } from '../ui/scroll';
import { useFeedback } from '../ui/feedback';

const MOOD_FOR = { impressed: 'impressed', satisfied: 'happy', unsure: 'unsure', concerned: 'concerned' };

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function tone(score) { return score >= 8 ? 'good' : score >= 5 ? 'ok' : 'low'; }

export default function VivaRoomPage() {
  const { confirm } = useFeedback();
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [character, setCharacter] = useState(null);
  const speaker = useSpeaker(character);
  const listener = useListener();

  const [session, setSession] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | intro | ask | answer | marking | result | done | finishing | report
  const [caption, setCaption] = useState('');
  const [answer, setAnswer] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [resultId, setResultId] = useState(null);
  const [showModel, setShowModel] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState('');
  const startedAt = useRef(0);

  const questions = useMemo(() => [...(session?.questions ?? [])].sort((a, b) => a.sequence - b.sequence), [session]);
  const current = questions.find(q => !q.answered) ?? null;
  const answered = questions.filter(q => q.answered);
  const result = questions.find(q => q.id === resultId) ?? null;
  const pointsSoFar = answered.reduce((s, q) => s + (q.score ?? 0), 0);
  const mainCount = questions.filter(q => !q.isFollowUp).length;
  const mainIndex = current ? questions.filter(q => !q.isFollowUp && q.sequence <= current.sequence).length : mainCount;

  // Load the session.
  useEffect(() => {
    getViva(token, id)
      .then(s => {
        setSession(s);
        setCharacter(s.character ?? null);
        const pending = s.questions.some(q => !q.answered);
        setPhase(s.status === 'Completed' ? 'report' : pending ? 'intro' : 'done');
      })
      .catch(e => { setError(e.status === 404 ? 'This viva was not found.' : e.message); setPhase('error'); });
  }, [token, id]);

  // Answer timer.
  useEffect(() => {
    if (phase !== 'answer') return undefined;
    startedAt.current = Date.now() - seconds * 1000;
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Stop voices when leaving the page.
  useEffect(() => () => { speaker.stop(); listener.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const say = useCallback(async (text) => {
    setCaption(text);
    await speaker.speak(text);
  }, [speaker]);

  const ask = useCallback(async (q) => {
    if (!q) return;
    setPhase('ask');
    setAnswer('');
    setSeconds(0);
    setError('');
    scrollToAnchor('viva-stage');
    await say((q.isFollowUp ? 'A quick follow-up. ' : '') + q.text);
    setPhase(p => (p === 'ask' ? 'answer' : p));
  }, [say]);

  async function begin() {
    const greeting = session.greeting || 'Welcome to your mock viva. Let’s begin.';
    setPhase('ask');
    await say(greeting);
    await ask(current);
  }

  function toggleMic() {
    if (listener.listening) { listener.stop(); return; }
    speaker.stop();
    if (phase === 'ask') setPhase('answer');
    listener.start(text => setAnswer(a => (a ? `${a.trimEnd()} ${text}` : text)));
  }

  async function submit(skip = false) {
    if (!current || phase === 'marking') return;
    listener.stop();
    speaker.stop();
    const text = skip ? '' : `${answer} ${listener.interim}`.trim();
    if (!skip && !text) { setError('Say or type an answer first — or press “Skip question”.'); return; }
    setPhase('marking');
    setCaption('Hmm, let me think about that…');
    setError('');
    try {
      const updated = await answerViva(token, id, current.id, text, seconds);
      setSession(updated);
      const marked = updated.questions.find(q => q.id === current.id);
      setResultId(current.id);
      setShowModel(true);
      setPhase('result');
      if (marked?.feedback) say(marked.feedback);
    } catch (e) {
      setError(e.message || 'The examiner could not mark that answer. Please submit again.');
      setAnswer(text);
      setPhase('answer');
      setCaption('');
    }
  }

  async function finish() {
    listener.stop();
    speaker.stop();
    setPhase('finishing');
    setCaption('Let me put your results together…');
    try {
      const done = await finishViva(token, id);
      setSession(done);
      setPhase('report');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e.message || 'Could not finish the viva.');
      setPhase(current ? 'answer' : 'result');
    }
  }

  async function endEarly() {
    const msg = answered.length === 0
      ? 'End this viva? You haven’t answered any questions yet.'
      : `End the viva now? Your report will use the ${answered.length} answer(s) you gave.`;
    if (await confirm({ title: 'Finish the viva now?', message: msg, ok: 'Finish viva' })) finish();
  }

  // Ctrl/Cmd + Enter submits.
  function onKey(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(false); }
  }

  if (phase === 'loading') return <main className="viva viva-wrap"><p className="note">Loading your viva…</p></main>;
  if (phase === 'error') return <main className="viva viva-wrap"><p className="error-message">{error}</p><Link className="button button-quiet" to="/student/viva">← Back to vivas</Link></main>;
  if (phase === 'report') return <VivaReport session={session} onSpeak={say} speaker={speaker} navigate={navigate} />;

  const exState = speaker.speaking ? 'speaking' : listener.listening ? 'listening' : (phase === 'marking' || phase === 'finishing') ? 'thinking' : 'idle';
  const exMood = phase === 'result' && result ? (MOOD_FOR[result.reaction] ?? 'neutral') : phase === 'intro' ? 'happy' : listener.listening ? 'satisfied' : 'neutral';
  const target = session.difficulty === 'Strict' ? 60 : 90;

  return (
    <main className="viva viva-room">
      <header className="viva-room-bar">
        <div className="viva-room-title">
          <Link to="/student/viva" className="viva-back" aria-label="Back to vivas">←</Link>
          <div>
            <p className="eyebrow">{session.stage} viva · {session.difficulty}</p>
            <h1>{session.title}</h1>
          </div>
        </div>
        <div className="viva-room-stats">
          <div className="viva-dots" aria-label="Question progress">
            {questions.map(q => (
              <span key={q.id}
                className={`viva-dot${q.isFollowUp ? ' small' : ''}${q.answered ? ` tone-${tone(q.score)}` : ''}${current?.id === q.id ? ' current' : ''}`}
                title={q.answered ? `${q.topic}: ${q.score}/10` : q.topic} />
            ))}
          </div>
          <div className="viva-live-score" aria-live="polite">
            <small>Score so far</small>
            <strong>{answered.length ? `${pointsSoFar}/${answered.length * 10}` : '—'}</strong>
          </div>
        </div>
      </header>

      <div className="viva-room-grid">
        {/* Examiner stage */}
        <section className="viva-stage band-dark" aria-label="Examiner" data-anchor="viva-stage">
          <div className={`viva-stage-avatar ${exState}`}>
            <Examiner state={exState} mood={exMood} size={320} look={lookOf(character)} />
          </div>
          <div className={`viva-caption${caption ? ' on' : ''}`} aria-live="polite">
            <span className="viva-caption-who">{character?.name ?? 'Dr. Mentor'}</span>
            <p>{caption || (phase === 'intro' ? session.greeting : '…')}</p>
          </div>
          <div className="viva-stage-tools">
            <button type="button" className="viva-tool" onClick={() => { speaker.setMuted(m => !m); speaker.stop(); }} aria-pressed={speaker.muted}>
              {speaker.muted ? 'Voice off' : 'Voice on'}
            </button>
            {current && phase !== 'intro' && (
              <button type="button" className="viva-tool" onClick={() => say(current.text)} disabled={speaker.speaking || phase === 'marking'}>↻ Repeat question</button>
            )}
            <button type="button" className="viva-tool" onClick={() => setSettingsOpen(o => !o)} aria-expanded={settingsOpen}>Settings</button>
          </div>
          {settingsOpen && (
            <div className="viva-settings">
              <p className="viva-settings-note">
                {speaker.hasVoice
                  ? <>{character?.name ?? 'Your examiner'} speaks {LANGUAGE_NAME[speaker.language] ?? speaker.language}. The voice is set by the ProjectMentor team.</>
                  : <>This device has no {LANGUAGE_NAME[speaker.language] ?? speaker.language} voice, so the examiner's words are shown as text. Try Chrome or Edge, or install the language voice in your system settings.</>}
              </p>
              <label>Your accent (for the microphone)
                <select value={listener.lang} onChange={e => listener.setLang(e.target.value)}>
                  {ACCENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <button type="button" className="button button-quiet button-small" onClick={() => say(sampleLine(character))} disabled={!speaker.hasVoice}>Test voice</button>
            </div>
          )}
        </section>

        {/* Question / answer / result panel */}
        <section className="viva-panel">
          {phase === 'intro' && (
            <div className="viva-card viva-intro">
              <h2>Before we start</h2>
              <ul className="viva-checks">
                <li><span></span> Turn your sound on — your examiner speaks every question.</li>
                <li><span></span> {listener.supported ? 'Press the microphone and answer out loud. Allow mic access when the browser asks.' : 'Voice answers need Chrome or Edge — you can type your answers here.'}</li>
                <li><span></span> Aim for about {target === 60 ? '45–60' : '60–90'} seconds per answer. Use your project’s real names and reasons.</li>
                <li><span></span> After each answer you get a live score, feedback and a model answer.</li>
              </ul>
              <p className="note">{mainCount} questions · {session.difficulty} examiner{session.difficulty !== 'Friendly' ? ' · may ask follow-ups' : ''}</p>
              <button className="button button-gold viva-begin" type="button" onClick={begin}>▶ Begin the viva</button>
            </div>
          )}

          {(phase === 'ask' || phase === 'answer' || phase === 'marking') && current && (
            <div className="viva-card viva-qcard">
              <div className="viva-q-head">
                <span className="viva-q-no">{current.isFollowUp ? 'Follow-up' : `Question ${mainIndex} of ${mainCount}`}</span>
                <span className="chip">{current.topic}</span>
              </div>
              <h2 className="viva-q-text">{current.text}</h2>

              <div className={`viva-answer${listener.listening ? ' live' : ''}`}>
                <div className="viva-answer-top">
                  <button type="button" className={`viva-mic${listener.listening ? ' on' : ''}`} onClick={toggleMic}
                    disabled={!listener.supported || phase === 'marking'} aria-pressed={listener.listening}
                    aria-label={listener.listening ? 'Stop microphone' : 'Answer with microphone'}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" strokeWidth="2" strokeLinecap="round" /></svg>
                  </button>
                  <div className="viva-mic-text">
                    <strong>{listener.listening ? 'Listening… speak now' : listener.supported ? 'Press the mic to answer out loud' : 'Type your answer below'}</strong>
                    <span>{listener.listening ? 'Press again when you finish.' : 'You can edit the text before you submit.'}</span>
                  </div>
                  <div className={`viva-timer${seconds > target ? ' over' : ''}`} title="Time on this answer">
                    <svg viewBox="0 0 36 36" aria-hidden="true">
                      <circle cx="18" cy="18" r="15" className="t-track" />
                      <circle cx="18" cy="18" r="15" className="t-bar" strokeDasharray="94.2" strokeDashoffset={94.2 * (1 - Math.min(seconds / target, 1))} transform="rotate(-90 18 18)" />
                    </svg>
                    <span>{fmt(seconds)}</span>
                  </div>
                </div>
                <textarea
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  onKeyDown={onKey}
                  rows={6}
                  placeholder={listener.supported ? 'Your spoken answer appears here…' : 'Type your answer here…'}
                  disabled={phase === 'marking'}
                  aria-label="Your answer"
                />
                {listener.interim && <p className="viva-interim">{listener.interim}</p>}
                {listener.error && <p className="error-message">{listener.error}</p>}
              </div>

              {error && <p className="error-message" role="alert">{error}</p>}

              <div className="viva-actions">
                <button type="button" className="button button-quiet button-small" onClick={() => submit(true)} disabled={phase === 'marking'}>Skip question</button>
                <button type="button" className="button button-emerald" onClick={() => submit(false)} disabled={phase === 'marking'}>
                  {phase === 'marking' ? 'Marking your answer…' : 'Submit answer ✓'}
                </button>
              </div>
              <p className="viva-kbd">Tip: press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> to submit.</p>
            </div>
          )}

          {phase === 'result' && result && (
            <div className="viva-card viva-result">
              <div className="viva-result-top">
                <div className={`viva-score-big tone-${tone(result.score)}`}>
                  <ScoreRing percent={result.score * 10} size={112} stroke={9} label={`${result.score}/10`} />
                </div>
                <div>
                  <span className={`viva-verdict tone-${tone(result.score)}`}>{result.verdict}</span>
                  <p className="viva-result-topic">{result.isFollowUp ? 'Follow-up' : result.topic}</p>
                  <p className="viva-feedback">“{result.feedback}”</p>
                </div>
              </div>

              <details className="viva-yours">
                <summary>Your answer{result.durationSeconds ? ` · ${fmt(result.durationSeconds)}` : ''}</summary>
                <p>{result.answer || <em>No answer given.</em>}</p>
              </details>

              <div className="viva-two">
                {result.strengths?.length > 0 && (
                  <div className="viva-list-box good">
                    <h3>What you did well</h3>
                    <ul>{result.strengths.map(s => <li key={s}>{s}</li>)}</ul>
                  </div>
                )}
                {result.improvements?.length > 0 && (
                  <div className="viva-list-box improve">
                    <h3>To score higher</h3>
                    <ul>{result.improvements.map(s => <li key={s}>{s}</li>)}</ul>
                  </div>
                )}
              </div>

              <div className={`viva-model${showModel ? ' open' : ''}`}>
                <button type="button" className="viva-model-head" onClick={() => setShowModel(s => !s)} aria-expanded={showModel}>
                  <span>High-scoring answer</span><span aria-hidden="true">{showModel ? '−' : '+'}</span>
                </button>
                {showModel && (
                  <div className="viva-model-body">
                    <p>{result.modelAnswer}</p>
                    <button type="button" className="viva-tool light" onClick={() => say(result.modelAnswer)}>Listen to it</button>
                  </div>
                )}
              </div>

              <div className="viva-actions">
                <button type="button" className="button button-quiet button-small" onClick={endEarly}>End viva now</button>
                {current
                  ? <button type="button" className="button button-emerald" onClick={() => ask(current)}>{current.isFollowUp ? 'Answer follow-up →' : 'Next question →'}</button>
                  : <button type="button" className="button button-gold" onClick={finish}>Finish & see my report →</button>}
              </div>
            </div>
          )}

          {phase === 'result' && !result && current && (
            <div className="viva-card"><button className="button button-emerald" type="button" onClick={() => ask(current)}>Continue →</button></div>
          )}

          {phase === 'intro' || phase === 'finishing' ? null : (
            phase !== 'result' && !current && (
              <div className="viva-card">
                <h2>All questions answered</h2>
                <button className="button button-gold" type="button" onClick={finish}>Finish & see my report →</button>
              </div>
            )
          )}

          {phase === 'finishing' && (
            <div className="viva-card viva-intro"><h2>Writing your report…</h2><p className="note">{character?.name ?? 'Your examiner'} is reviewing all your answers.</p></div>
          )}

          {phase !== 'intro' && phase !== 'finishing' && (phase === 'ask' || phase === 'answer') && (
            <button type="button" className="viva-end-link" onClick={endEarly}>End viva early</button>
          )}
        </section>
      </div>
    </main>
  );
}

/* ---------------- Final report ---------------- */

function VivaReport({ session, onSpeak, speaker, navigate }) {
  const qs = [...session.questions].sort((a, b) => a.sequence - b.sequence);
  const s = session.summary;
  const pct = session.scorePercent ?? 0;
  const times = qs.filter(q => q.answer).map(q => q.durationSeconds).filter(Boolean); // skipped answers don't count
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  const best = [...qs].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const [open, setOpen] = useState(() => new Set(qs.filter(q => (q.score ?? 0) < 7).map(q => q.id)));
  const mood = pct >= 75 ? 'impressed' : pct >= 55 ? 'happy' : pct >= 40 ? 'unsure' : 'concerned';

  useEffect(() => { if (s?.overall) onSpeak(s.overall); return () => speaker.stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id) {
    setOpen(o => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  return (
    <main className="viva viva-report">
      <section className="viva-report-hero">
        <div className="viva-report-hero-inner">
          <div className="viva-report-ex"><Examiner state={speaker.speaking ? "speaking" : "idle"} mood={mood} size={180} portrait look={lookOf(session.character)} /></div>
          <div className="viva-report-headline">
            <p className="eyebrow">Mock viva report · {session.stage} · {session.difficulty}</p>
            <h1>{session.title}</h1>
            <p className="viva-report-overall">{s?.overall}</p>
            <p className="viva-report-date">{new Date(session.completedAt ?? session.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
          <div className="viva-report-score">
            <ScoreRing percent={pct} size={150} stroke={11} />
            <span className={`viva-grade grade-${s?.grade ?? 'F'}`}>Grade {s?.grade ?? '—'}</span>
          </div>
        </div>
      </section>

      <section className="viva-wrap">
        <div className="viva-stats">
          <div><strong>{qs.length}</strong><span>questions answered</span></div>
          <div><strong>{qs.reduce((a, q) => a + (q.score ?? 0), 0)}/{qs.length * 10}</strong><span>total marks</span></div>
          <div><strong>{avg ? fmt(avg) : '—'}</strong><span>average answer time</span></div>
          <div><strong>{best ? best.topic : '—'}</strong><span>strongest topic</span></div>
        </div>

        <div className="viva-report-grid">
          <div className="viva-list-box good">
            <h3>Your strengths</h3>
            <ul>{(s?.strengths ?? []).map(x => <li key={x}>{x}</li>)}</ul>
          </div>
          <div className="viva-list-box improve">
            <h3>Practise these</h3>
            <ul>{(s?.weakAreas ?? []).map(w => <li key={w.topic}><strong>{w.topic}:</strong> {w.tip}</li>)}</ul>
          </div>
          <div className="viva-list-box steps">
            <h3>Next steps</h3>
            <ol>{(s?.nextSteps ?? []).map(x => <li key={x}>{x}</li>)}</ol>
          </div>
        </div>

        <div className="viva-section-head">
          <h2>Question by question</h2>
          <p className="note">Low scores are opened for you. Read each high-scoring answer and practise it out loud.</p>
        </div>

        <div className="viva-review">
          {qs.map((q, i) => (
            <article key={q.id} className={`viva-review-item${open.has(q.id) ? ' open' : ''}`}>
              <button type="button" className="viva-review-head" onClick={() => toggle(q.id)} aria-expanded={open.has(q.id)}>
                <span className={`viva-review-score tone-${tone(q.score ?? 0)}`}>{q.score ?? 0}<small>/10</small></span>
                <span className="viva-review-q">
                  <small>{q.isFollowUp ? 'Follow-up' : `Q${i + 1}`} · {q.topic}</small>
                  {q.text}
                </span>
                <span className="viva-review-toggle" aria-hidden="true">{open.has(q.id) ? '−' : '+'}</span>
              </button>
              {open.has(q.id) && (
                <div className="viva-review-body">
                  <div className="viva-review-cols">
                    <div>
                      <h4>Your answer</h4>
                      <p className="viva-review-yours">{q.answer || <em>Skipped</em>}</p>
                      <h4>Examiner’s feedback</h4>
                      <p>{q.feedback}</p>
                      {q.improvements?.length > 0 && (<><h4>To score higher</h4><ul>{q.improvements.map(x => <li key={x}>{x}</li>)}</ul></>)}
                    </div>
                    <div className="viva-model open">
                      <div className="viva-model-head static"><span>High-scoring answer</span></div>
                      <div className="viva-model-body">
                        <p>{q.modelAnswer}</p>
                        <button type="button" className="viva-tool light" onClick={() => onSpeak(q.modelAnswer)}>Listen</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>

        <div className="viva-report-learn">
          <div>
            <strong>Want to present with more confidence?</strong>
            <p>The Learn page covers viva questions, handling nerves and live demos — with videos.</p>
          </div>
          <Link className="button button-quiet" to="/learn?track=present">Open the presentation guide →</Link>
        </div>

        <div className="viva-report-actions no-print">
          <button type="button" className="button button-gold" onClick={() => navigate(`/student/viva/new?from=${session.id}`)}>Practise again</button>
          <button type="button" className="button button-quiet" onClick={() => { setOpen(new Set(qs.map(q => q.id))); setTimeout(() => window.print(), 150); }}>Print / save as PDF</button>
          <Link className="button button-quiet" to="/student/viva">All my vivas</Link>
        </div>
      </section>
    </main>
  );
}

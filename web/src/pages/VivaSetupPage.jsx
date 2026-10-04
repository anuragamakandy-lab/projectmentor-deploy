import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getViva, getVivaPrefill, getVivaRoadmaps, listVivas, startViva } from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';
import Examiner from '../components/Examiner';
import '../styles/viva.css';
import { scrollToAnchor } from '../ui/scroll';
import { useFeedback } from '../ui/feedback';
import { getVivaCharacters } from '../api/projectMentorApi';
import { useListener, useSpeaker } from '../hooks/useSpeech';
import { ACCENTS, LANGUAGES, lookOf } from '../content/examiners';
import { sampleLine } from './VivaRoomPage';

const LANGUAGE_NAME = Object.fromEntries(LANGUAGES);

const DRAFT_KEY = 'pm.viva.draft';

/* Every field the examiner can use. `need` = required to continue. Hints are written in simple English. */
const STEPS = [
  {
    title: 'The basics',
    intro: 'Start with the simple facts. The examiner uses these to set the scene.',
    fields: [
      { key: 'title', label: 'Project title', need: true, placeholder: 'e.g. FindIt – Campus Lost & Found' },
      { key: 'projectType', label: 'Type of project', type: 'select', options: ['Web app', 'Mobile app', 'Web + mobile', 'AI / machine learning', 'Data / analytics', 'IoT / hardware', 'Game', 'Desktop app', 'Other'] },
      { key: 'teamSize', label: 'Team size', type: 'number', placeholder: '1 if you worked alone' },
      { key: 'yourRole', label: 'Your own part in the project', hint: 'In team vivas, examiners always ask what YOU did.', placeholder: 'e.g. I built the backend API, the database and the login system.' },
    ],
  },
  {
    title: 'Problem & users',
    intro: 'Most vivas begin with “Why did you build this?”. Help the examiner ask it well.',
    fields: [
      { key: 'problem', label: 'What problem does it solve?', need: true, area: true, placeholder: 'e.g. Students lose items on campus. The notice board is slow and you cannot search it, so most items are never returned.' },
      { key: 'targetUsers', label: 'Who are the users?', placeholder: 'e.g. Students, campus security staff, admins' },
      { key: 'objectives', label: 'Main objectives', area: true, placeholder: 'e.g. 1) Report an item in under 1 minute 2) Match lost and found items automatically 3) Let owners chat safely with finders' },
    ],
  },
  {
    title: 'What you built',
    intro: 'The heart of the viva. The more specific you are, the sharper (and more useful) the questions.',
    fields: [
      { key: 'features', label: 'Key features', need: true, area: true, placeholder: 'e.g. Report lost/found items with photos, smart matching, in-app chat, admin moderation, email alerts' },
      { key: 'frontend', label: 'Frontend', placeholder: 'e.g. React + Vite, Flutter' },
      { key: 'backend', label: 'Backend', placeholder: 'e.g. ASP.NET Core Web API' },
      { key: 'database', label: 'Database and main tables', placeholder: 'e.g. PostgreSQL: Users, Items, Claims' },
      { key: 'otherTech', label: 'AI, APIs and other tools', placeholder: 'e.g. Gemini API, Cloudinary, EmailJS, GitHub Actions' },
      { key: 'architecture', label: 'How the parts fit together', area: true, hint: 'Describe the flow in one or two sentences.', placeholder: 'e.g. React and Flutter call a REST API. The API uses JWT auth, talks to PostgreSQL through EF Core, and calls Gemini for AI features.' },
    ],
  },
  {
    title: 'Data, security & testing',
    intro: 'Examiners love these topics because they show real engineering. Fill in what you can.',
    fields: [
      { key: 'security', label: 'Security', area: true, placeholder: 'e.g. JWT with Student/Admin roles, hashed passwords, users can only see their own data, input validation' },
      { key: 'testing', label: 'Testing', area: true, placeholder: 'e.g. xUnit unit tests for services, Postman for API tests, 5 students did user testing' },
      { key: 'deployment', label: 'Deployment', placeholder: 'e.g. API on Azure, database on Neon, web on Vercel, CI with GitHub Actions' },
    ],
  },
  {
    title: 'Your journey',
    intro: 'Honest reflection earns marks. Examiners often finish with “What would you do differently?”.',
    fields: [
      { key: 'progress', label: 'How far have you got?', area: true, placeholder: 'e.g. Backend and web app done, mobile app 60% done, testing in progress' },
      { key: 'challenges', label: 'Biggest challenges and how you solved them', area: true, placeholder: 'e.g. Image upload was slow — we moved images to Cloudinary and stored only the URL.' },
      { key: 'limitations', label: 'Known limitations', area: true, placeholder: 'e.g. Matching is keyword-based, no push notifications yet' },
      { key: 'futureWork', label: 'Future work', area: true, placeholder: 'e.g. Image-similarity matching, push notifications, multi-campus support' },
      { key: 'notes', label: 'Anything else the examiner should know?', area: true, placeholder: 'e.g. Our lecturer is very interested in the AI part.' },
    ],
  },
];

const ALL_FIELDS = STEPS.flatMap(s => s.fields);
const EMPTY = Object.fromEntries(ALL_FIELDS.map(f => [f.key, '']));

const STAGES = [
  ['Proposal', '', 'Before building. Questions on the problem, plan and design.'],
  ['Progress', '', 'Halfway. What you built so far and how you will finish.'],
  ['Final', '', 'Finished project. Implementation, testing, results and future work.'],
];
const LEVELS = [
  ['Friendly', 'happy', 'Warm and patient. Perfect for your first try.'],
  ['Standard', 'satisfied', 'Like a normal viva. Polite, fair and focused.'],
  ['Strict', 'concerned', 'Probing “why?” questions and follow-ups. Real pressure.'],
];

function loadDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) ?? null; } catch { return null; }
}

function fromApi(details) {
  const next = { ...EMPTY };
  Object.keys(EMPTY).forEach(k => {
    const v = details?.[k];
    if (v !== null && v !== undefined && v !== '') next[k] = String(v);
  });
  return next;
}

export default function VivaSetupPage() {
  const { confirm } = useFeedback();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const draft = useMemo(loadDraft, []);

  const [step, setStep] = useState(draft?.step ?? 0);
  const [form, setForm] = useState({ ...EMPTY, ...(draft?.form ?? {}) });
  const [settings, setSettings] = useState(draft?.settings ?? { stage: 'Final', difficulty: 'Standard', questionCount: 6 });
  const [roadmapId, setRoadmapId] = useState(draft?.roadmapId ?? '');
  const [sources, setSources] = useState({ roadmaps: [], vivas: [] });
  const [source, setSource] = useState('');
  const [filling, setFilling] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  // Examiner characters published by admins; the student picks one and can hear its voice.
  const [characters, setCharacters] = useState([]);
  const chosen = characters.find(c => c.id === settings.characterId) ?? characters[0] ?? null;
  const speaker = useSpeaker(chosen);
  const listener = useListener();

  useEffect(() => {
    getVivaCharacters(token).then(list => {
      setCharacters(list);
      setSettings(s => (list.some(c => c.id === s.characterId) ? s : { ...s, characterId: list[0]?.id ?? null }));
    }).catch(() => {});
  }, [token]);

  // Sources for one-click fill: the student's approved roadmaps, their groups' approved roadmaps and previous vivas.
  useEffect(() => {
    Promise.all([getVivaRoadmaps(token).catch(() => []), listVivas(token).catch(() => [])])
      .then(([roadmaps, vivas]) => setSources({ roadmaps: roadmaps ?? [], vivas: vivas ?? [] }));
  }, [token]);

  // Deep links: ?roadmap=<id> (from a roadmap page) or ?from=<vivaId> (practise again).
  useEffect(() => {
    const r = params.get('roadmap');
    const f = params.get('from');
    if (r) fill(`r:${r}`);
    else if (f) fill(`v:${f}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ step, form, settings, roadmapId })); } catch { /* ignore */ }
  }, [step, form, settings, roadmapId]);

  async function fill(value) {
    if (!value) return;
    setFilling(true);
    setError('');
    try {
      const [kind, id] = value.split(':');
      if (kind === 'r') {
        const d = await getVivaPrefill(token, id);
        // Fill every field from the approved roadmap; the student can edit anything before starting.
        setForm(f => {
          const incoming = fromApi(d);
          const merged = { ...f };
          Object.keys(incoming).forEach(k => { if (incoming[k]) merged[k] = incoming[k]; });
          return merged;
        });
        setRoadmapId(id);
        setFlash('Filled from your approved roadmap. Read each step and edit anything before you start.');
      } else {
        const v = await getViva(token, id);
        setForm(fromApi(v.details));
        setRoadmapId(v.roadmapRequestId ?? '');
        setSettings(s => ({ ...s, stage: v.stage, difficulty: v.difficulty }));
        setFlash('Loaded the details from your previous viva.');
      }
      setSource('');
    } catch (e) {
      setError(e.message || 'Could not load those details.');
    } finally {
      setFilling(false);
    }
  }

  const filled = ALL_FIELDS.filter(f => String(form[f.key] ?? '').trim()).length;
  const pct = Math.round((filled / ALL_FIELDS.length) * 100);
  const meter = pct >= 75 ? ['Excellent', 'Expect sharp, very personal questions.'] :
    pct >= 50 ? ['Good', 'Add a few more details for even better questions.'] :
    pct >= 25 ? ['Basic', 'Questions may be general. More detail = better practice.'] :
    ['Very little', 'Tell us more so the examiner can ask about YOUR project.'];

  const isSettings = step === STEPS.length;
  const current = STEPS[step];
  const missing = current ? current.fields.filter(f => f.need && !String(form[f.key] ?? '').trim()) : [];

  function set(key, value) { setForm(f => ({ ...f, [key]: value })); }

  function next() {
    if (missing.length) { setError(`Please fill in: ${missing.map(f => f.label).join(', ')}`); return; }
    setError('');
    setStep(s => Math.min(s + 1, STEPS.length));
    scrollToAnchor('viva-step');
  }

  function back() { setError(''); setStep(s => Math.max(0, s - 1)); scrollToAnchor('viva-step'); }

  function jump(i) {
    // Only allow jumping forward past steps whose required fields are filled.
    for (let s = 0; s < Math.min(i, STEPS.length); s++) {
      const need = STEPS[s].fields.filter(f => f.need && !String(form[f.key] ?? '').trim());
      if (need.length) { setStep(s); setError(`Please fill in: ${need.map(f => f.label).join(', ')}`); return; }
    }
    setError('');
    setStep(i);
  }

  async function begin() {
    setStarting(true);
    setError('');
    const details = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v ?? '').trim() || null]));
    details.teamSize = details.teamSize ? Number(details.teamSize) || null : null;
    try {
      const session = await startViva(token, { details, roadmapRequestId: roadmapId || null, ...settings, characterId: chosen?.id ?? null });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      navigate(`/student/viva/${session.id}`);
    } catch (e) {
      setError(e.message || 'Could not start the viva. Please try again.');
      setStarting(false);
    }
  }

  async function clearAll() {
    if (!await confirm({ title: 'Clear the whole form?', message: 'Everything you typed in the project details will be removed.', ok: 'Clear form', danger: true })) return;
    setForm({ ...EMPTY });
    setRoadmapId('');
    setStep(0);
  }

  if (starting) {
    return (
      <main className="viva">
        <section className="viva-loading">
          <Examiner state="thinking" mood="neutral" size={260} look={lookOf(chosen)} />
          <h2>{chosen?.name ?? 'Your examiner'} is reading your project…</h2>
          <p>Preparing {settings.questionCount} questions about <strong>{form.title}</strong>. This takes a few seconds.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="viva viva-wrap viva-setup">
      <div className="page-head">
        <div>
          <p className="eyebrow">AI Mock Viva · Setup</p>
          <h1>Tell your examiner about your project</h1>
          <p className="page-lede">Good viva questions come from good details. Fill in as much as you can — your answers are saved as you type.</p>
        </div>
        <Link className="button button-quiet button-small" to="/student/viva">← Back</Link>
      </div>

      <div className="viva-quickfill">
        <span aria-hidden="true"></span>
        <label htmlFor="vq-source">Quick fill from</label>
        <select id="vq-source" value={source} onChange={e => setSource(e.target.value)} disabled={filling}>
          <option value="">Choose a roadmap or past viva…</option>
          {sources.roadmaps.some(r => r.source === 'Mine') && (
            <optgroup label="My roadmaps">
              {sources.roadmaps.filter(r => r.source === 'Mine').map(r => <option key={r.id} value={`r:${r.id}`}>{r.displayTitle} — {r.progressPercent}% done</option>)}
            </optgroup>
          )}
          {sources.roadmaps.some(r => r.source === 'Group') && (
            <optgroup label="Group roadmaps">
              {sources.roadmaps.filter(r => r.source === 'Group').map(r => <option key={r.id} value={`r:${r.id}`}>{r.displayTitle} · {r.groupName} — {r.progressPercent}% done</option>)}
            </optgroup>
          )}
          {sources.vivas.length > 0 && (
            <optgroup label="Previous vivas">
              {sources.vivas.map(v => <option key={v.id} value={`v:${v.id}`}>{v.title} — {new Date(v.createdAt).toLocaleDateString()}</option>)}
            </optgroup>
          )}
        </select>
        <button className="button button-emerald button-small" type="button" onClick={() => fill(source)} disabled={!source || filling}>
          {filling ? 'Filling…' : 'Fill'}
        </button>
        <button className="button button-quiet button-small" type="button" onClick={clearAll}>Clear</button>
      </div>
      {flash && <p className="viva-flash" role="status" onAnimationEnd={() => setFlash('')}>{flash}</p>}

      <div className="viva-setup-grid" data-anchor="viva-step">
        <aside className="viva-setup-side">
          <ol className="viva-stepper">
            {[...STEPS.map(s => s.title), 'Viva settings'].map((t, i) => {
              const stepFields = STEPS[i]?.fields ?? [];
              const count = stepFields.filter(f => String(form[f.key] ?? '').trim()).length;
              return (
                <li key={t} className={i === step ? 'active' : i < step ? 'done' : ''}>
                  <button type="button" onClick={() => jump(i)}>
                    <span className="viva-stepper-no">{i < step ? '✓' : i + 1}</span>
                    <span>{t}{stepFields.length > 0 && <small>{count}/{stepFields.length}</small>}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="viva-meter">
            <div className="viva-meter-top"><strong>Detail level</strong><span>{meter[0]}</span></div>
            <div className="viva-meter-bar"><span style={{ width: `${pct}%` }} /></div>
            <p>{meter[1]}</p>
          </div>
        </aside>

        <section className="viva-setup-main">
          {!isSettings ? (
            <div className="viva-card" key={step}>
              <p className="viva-card-step">Step {step + 1} of {STEPS.length + 1}</p>
              <h2>{current.title}</h2>
              <p className="viva-card-intro">{current.intro}</p>
              <div className="viva-fields">
                {current.fields.map(f => (
                  <label key={f.key} className={`viva-field${f.area ? ' wide' : ''}`}>
                    <span className="viva-field-label">{f.label}{f.need && <em> required</em>}</span>
                    {f.hint && <span className="viva-field-hint">{f.hint}</span>}
                    {f.type === 'select' ? (
                      <select value={form[f.key]} onChange={e => set(f.key, e.target.value)}>
                        <option value="">Choose…</option>
                        {/* keep a prefilled value that isn't in the list (e.g. "web") */}
                        {form[f.key] && !f.options.includes(form[f.key]) && <option value={form[f.key]}>{form[f.key]}</option>}
                        {f.options.map(o => <option key={o}>{o}</option>)}
                      </select>
                    ) : f.area ? (
                      <textarea rows={3} value={form[f.key]} placeholder={f.placeholder} onChange={e => set(f.key, e.target.value)} />
                    ) : (
                      <input type={f.type ?? 'text'} min={f.type === 'number' ? 1 : undefined} max={f.type === 'number' ? 20 : undefined}
                        value={form[f.key]} placeholder={f.placeholder} onChange={e => set(f.key, e.target.value)} />
                    )}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="viva-card">
              <p className="viva-card-step">Step {STEPS.length + 1} of {STEPS.length + 1}</p>
              <h2>Viva settings</h2>
              <p className="viva-card-intro">Choose the kind of viva you want to practise.</p>

              <h3 className="viva-sub">Choose your examiner</h3>
              <div className="viva-characters">
                {characters.map(c => (
                  <button type="button" key={c.id} className={`viva-character${chosen?.id === c.id ? ' on' : ''}`}
                    onClick={() => { speaker.stop(); setSettings(s => ({ ...s, characterId: c.id })); }} aria-pressed={chosen?.id === c.id}>
                    <span className="viva-character-face"><Examiner mood="happy" size={96} portrait label="" look={lookOf(c)} /></span>
                    <strong>{c.name}</strong>
                    <span>{c.tagline || `${c.style} examiner`}</span>
                    <small>{LANGUAGE_NAME[c.language] ?? c.language}</small>
                  </button>
                ))}
              </div>
              {chosen && (
                <div className="viva-voice-row">
                  <button type="button" className="button button-quiet button-small" disabled={!speaker.hasVoice}
                    onClick={() => (speaker.speaking ? speaker.stop() : speaker.speak(sampleLine(chosen)))}>
                    {speaker.speaking ? 'Stop' : `Test ${chosen.name}'s voice`}
                  </button>
                  <label>Your accent (for the microphone)
                    <select value={listener.lang} onChange={e => listener.setLang(e.target.value)}>
                      {ACCENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                  {!speaker.hasVoice && <p className="note">This browser has no {LANGUAGE_NAME[chosen.language]} voice. The examiner's words will be shown as text. Chrome or Edge on Windows and Android usually have more voices.</p>}
                </div>
              )}

              <h3 className="viva-sub">Which viva is it?</h3>
              <div className="viva-choices three">
                {STAGES.map(([value, icon, text]) => (
                  <button type="button" key={value} className={`viva-choice${settings.stage === value ? ' on' : ''}`}
                    onClick={() => setSettings(s => ({ ...s, stage: value }))} aria-pressed={settings.stage === value}>
                    <span className="viva-choice-icon" aria-hidden="true">{icon}</span>
                    <strong>{value} viva</strong>
                    <span>{text}</span>
                  </button>
                ))}
              </div>

              <h3 className="viva-sub">How tough should {chosen?.name ?? 'the examiner'} be?</h3>
              <div className="viva-choices three">
                {LEVELS.map(([value, mood, text]) => (
                  <button type="button" key={value} className={`viva-choice level${settings.difficulty === value ? ' on' : ''}`}
                    onClick={() => setSettings(s => ({ ...s, difficulty: value }))} aria-pressed={settings.difficulty === value}>
                    <span className="viva-choice-face"><Examiner mood={mood} size={74} portrait label="" look={lookOf(chosen)} /></span>
                    <strong>{value}</strong>
                    <span>{text}</span>
                  </button>
                ))}
              </div>

              <h3 className="viva-sub">How many questions?</h3>
              <div className="viva-chips">
                {[[4, '≈ 6 min'], [6, '≈ 10 min'], [8, '≈ 14 min'], [10, '≈ 18 min']].map(([n, time]) => (
                  <button type="button" key={n} className={`viva-chip${settings.questionCount === n ? ' on' : ''}`}
                    onClick={() => setSettings(s => ({ ...s, questionCount: n }))} aria-pressed={settings.questionCount === n}>
                    <strong>{n}</strong> questions <small>{time}</small>
                  </button>
                ))}
              </div>

              <div className="viva-ready">
                <Examiner state="idle" mood="happy" size={92} portrait label="" look={lookOf(chosen)} />
                <div>
                  <strong>Ready when you are.</strong>
                  <p>Find a quiet place, allow the microphone when asked, and answer like it’s the real viva. You can also type.</p>
                </div>
              </div>
            </div>
          )}

          {error && <p className="error-message" role="alert">{error}</p>}

          <div className="viva-nav">
            {step > 0 ? <button className="button button-quiet" type="button" onClick={back}>← Back</button> : <span />}
            {!isSettings
              ? <button className="button button-emerald" type="button" onClick={next}>Next: {STEPS[step + 1]?.title ?? 'Viva settings'} →</button>
              : <button className="button button-gold" type="button" onClick={begin}>Start my viva</button>}
          </div>
        </section>
      </div>
    </main>
  );
}

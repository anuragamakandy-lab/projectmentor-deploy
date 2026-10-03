import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLearnContent } from '../content/useLearnContent';
import DownloadLink from '../components/DownloadLink';
import { uploadUrl } from '../api/projectMentorApi';
import '../styles/learn.css';
import '../styles/learn-extra.css';

// ---------- small helpers ----------
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

// **bold** and *italic* inside plain strings.
function Rich({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p.startsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('*')) return <em key={i}>{p.slice(1, -1)}</em>;
    return <span key={i}>{p}</span>;
  });
}

// Learn content comes from the API (managed in the admin panel) and is shared through context.
const LearnData = createContext(null);

// ---------- content blocks ----------
function VideoCard({ id }) {
  const v = useContext(LearnData).videos[id];
  if (!v) return null;
  return (
    <a className="vid" href={`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noreferrer noopener">
      <span className="vid-thumb">
        <img src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`} alt="" loading="lazy" />
        <span className="vid-play" aria-hidden="true">▶</span>
        <span className="vid-time">{v.duration}</span>
      </span>
      <span className="vid-body">
        <strong>{v.title}</strong>
        <small>{v.channel} · YouTube</small>
      </span>
    </a>
  );
}

function Quiz({ questions }) {
  const [picked, setPicked] = useState({});
  const score = questions.filter((q, i) => picked[i] === q.answer).length;
  const done = Object.keys(picked).length === questions.length;
  return (
    <div className="quiz">
      <div className="quiz-head"><span>Quick check</span>{done && <strong>{score}/{questions.length} correct</strong>}</div>
      {questions.map((q, i) => (
        <div className="quiz-q" key={i}>
          <p>{i + 1}. {q.q}</p>
          <div className="quiz-opts">
            {q.options.map((o, j) => {
              const chosen = picked[i] === j;
              const state = picked[i] === undefined ? '' : j === q.answer ? ' right' : chosen ? ' wrong' : ' dim';
              return (
                <button key={j} type="button" className={`quiz-opt${state}`} disabled={picked[i] !== undefined}
                  onClick={() => setPicked(p => ({ ...p, [i]: j }))}>{o}</button>
              );
            })}
          </div>
          {picked[i] !== undefined && (
            <p className={`quiz-why${picked[i] === q.answer ? ' ok' : ''}`}>{picked[i] === q.answer ? '✓ Correct. ' : '✗ Not quite. '}{q.why}</p>
          )}
        </div>
      ))}
      {done && <button type="button" className="button button-quiet button-small" onClick={() => setPicked({})}>Try again</button>}
    </div>
  );
}

function Checklist({ id, items }) {
  const key = `pm.learn.check.${id}`;
  const [ticked, setTicked] = useState(() => load(key, {}));
  useEffect(() => { save(key, ticked); }, [key, ticked]);
  const count = items.filter((_, i) => ticked[i]).length;
  return (
    <div className="checklist">
      <div className="checklist-head">
        <span>{count} of {items.length} done</span>
        <span className="mini-bar"><span style={{ width: `${(count / items.length) * 100}%` }} /></span>
      </div>
      {items.map((it, i) => (
        <label className={`check-item${ticked[i] ? ' on' : ''}`} key={i}>
          <input type="checkbox" checked={Boolean(ticked[i])} onChange={() => setTicked(t => ({ ...t, [i]: !t[i] }))} />
          <span className="check-box" aria-hidden="true">{ticked[i] ? '✓' : ''}</span>
          <span>{it}</span>
        </label>
      ))}
    </div>
  );
}

// ---------- illustrations ----------
function ReportAnatomy() {
  const parts = [
    ['Title page', 'Project name, your names, date', 0],
    ['Abstract', 'The whole report in ~200 words', 4],
    ['Contents', 'Generated from your headings', 0],
    ['1 · Introduction', 'What problem? Why does it matter? Aims', 10],
    ['2 · Literature review', 'What already exists? What is missing?', 15],
    ['3 · Methodology', 'How did you plan and build it?', 15],
    ['4 · Implementation', 'What did you build? Key designs and screens', 20],
    ['5 · Testing & results', 'Does it work? What are the numbers?', 15],
    ['6 · Discussion', 'What do the results mean? Limits?', 10],
    ['7 · Conclusion', 'Did you meet your aims? What next?', 5],
    ['References', 'Every source you used', 0],
    ['Appendices', 'Extra material: full code, surveys', 0],
  ];
  return (
    <div className="anatomy">
      {parts.map(([name, q, pct]) => (
        <div className={`anatomy-row${pct ? '' : ' minor'}`} key={name}>
          <span className="anatomy-name">{name}</span>
          <span className="anatomy-q">{q}</span>
          <span className="anatomy-pct">{pct ? <><span className="mini-bar"><span style={{ width: `${pct * 5}%` }} /></span><em>~{pct}%</em></> : <em>—</em>}</span>
        </div>
      ))}
      <p className="anatomy-note">Percentages show a typical share of the main body. Your marking scheme always wins.</p>
    </div>
  );
}

function CaptionDemo() {
  return (
    <div className="caption-demo">
      <div>
        <div className="cd-label">Tables: caption <b>above</b></div>
        <p className="cd-cap">Table 1. Pilot results before and after FindIt</p>
        <div className="cd-table">
          <span>Measure</span><span>Before</span><span>After</span>
          <span>Days to recover</span><span>14</span><span>3</span>
          <span>Items returned</span><span>31%</span><span>72%</span>
        </div>
      </div>
      <div>
        <div className="cd-label">Figures: caption <b>below</b></div>
        <div className="cd-fig">
          <span>App</span><i>→</i><span>API</span><i>→</i><span>DB</span>
        </div>
        <p className="cd-cap">Figure 1. System architecture of FindIt</p>
      </div>
    </div>
  );
}

function TalkTimeline() {
  const rows = [
    ['0:00', 'Title & team', 'Who you are and the project name. Start with a hook.'],
    ['0:30', 'The problem', 'Why it matters — use a number or a short story.'],
    ['1:30', 'Your solution', 'One sentence: what you built and for whom.'],
    ['2:30', 'Objectives', 'Two or three measurable goals.'],
    ['3:15', 'How it works', 'Architecture diagram — follow one example through it.'],
    ['4:45', 'Live demo', 'One full user journey. Have a backup video.'],
    ['6:45', 'Results', 'Proof that you met your objectives.'],
    ['7:45', 'Challenges & lessons', 'One honest challenge and how you solved it.'],
    ['8:45', 'Conclusion', 'Repeat your key message. Next steps.'],
    ['9:30', 'Questions', 'Thank the audience and invite questions.'],
  ];
  return (
    <ol className="timeline">
      {rows.map(([t, title, text]) => (
        <li key={t}><span className="tl-time">{t}</span><span className="tl-dot" aria-hidden="true" /><div><strong>{title}</strong><span>{text}</span></div></li>
      ))}
    </ol>
  );
}

function SlideCompare() {
  return (
    <div className="slide-compare">
      <div className="sc-pair">
        <figure className="sc bad">
          <div className="mini-slide busy">
            <div className="ms-title-small">Introduction</div>
            <ul>
              <li>Lost items are a big problem in universities because students move between many buildings every day and they forget things like phones, wallets, ID cards and laptops</li>
              <li>Currently students use WhatsApp groups, Facebook pages, notice boards and the security office which are not connected to each other</li>
              <li>Our system FindIt will solve this problem by using a mobile app, a web API, a PostgreSQL database and a matching engine</li>
              <li>A survey of 120 students found that 3 in 10 lost something last semester</li>
            </ul>
          </div>
          <figcaption><b>✗ Bad</b> — a wall of tiny text. The audience reads instead of listening, and the title says nothing.</figcaption>
        </figure>
        <figure className="sc good">
          <div className="mini-slide clean">
            <div className="ms-title">Lost items rarely come home</div>
            <div className="ms-stat">3 in 10</div>
            <div className="ms-sub">students lost something on campus last semester</div>
          </div>
          <figcaption><b>✓ Good</b> — the title states the point, one big number, a few words. You explain the rest out loud.</figcaption>
        </figure>
      </div>
      <div className="sc-pair">
        <figure className="sc bad">
          <div className="mini-slide busy">
            <div className="ms-title-small">Results</div>
            <div className="ms-grid">
              {['Test', 'Run 1', 'Run 2', 'Run 3', 'Avg', 'Days A', '15', '13', '14', '14', 'Days B', '3', '4', '2', '3', 'Return %', '30', '33', '30', '31'].map((c, i) => <span key={i}>{c}</span>)}
            </div>
          </div>
          <figcaption><b>✗ Bad</b> — a raw table of numbers. Nobody can see the result in 3 seconds.</figcaption>
        </figure>
        <figure className="sc good">
          <div className="mini-slide clean">
            <div className="ms-title">Recovery time fell by 78%</div>
            <div className="ms-bars">
              <span><i style={{ height: '88%' }} /><em>Before · 14 days</em></span>
              <span className="hi"><i style={{ height: '20%' }} /><em>After · 3 days</em></span>
            </div>
          </div>
          <figcaption><b>✓ Good</b> — one simple chart, the key result highlighted, and the title tells the story.</figcaption>
        </figure>
      </div>
    </div>
  );
}

function GitAreas() {
  const areas = [
    ['', 'Working folder', 'Files you edit'],
    ['', 'Staging area', 'Changes picked for the next save'],
    ['', 'Local repository', 'Your commits, on your laptop'],
    ['', 'GitHub', 'Shared copy for the team'],
  ];
  const moves = ['git add', 'git commit', 'git push'];
  return (
    <div className="git-areas">
      <div className="ga-row">
        {areas.map(([icon, name, text], i) => (
          <div className="ga-cell" key={name}>
            <div className={`ga-box${i === 3 ? ' remote' : ''}`}>
              <span className="ga-icon" aria-hidden="true">{icon}</span>
              <strong>{name}</strong>
              <small>{text}</small>
            </div>
            {i < 3 && <div className="ga-arrow"><code>{moves[i]}</code><span aria-hidden="true">→</span></div>}
          </div>
        ))}
      </div>
      <div className="ga-back"><span aria-hidden="true">←</span><code>git pull</code><span>brings your team’s commits from GitHub into your folder</span></div>
    </div>
  );
}

function BranchDiagram() {
  return (
    <figure className="branch-fig">
      <svg viewBox="0 0 640 190" role="img" aria-label="A feature branch splits from main, gets three commits, and merges back through a pull request">
        <line x1="30" y1="60" x2="610" y2="60" className="br-main" />
        <path d="M150 60 C 190 60, 190 140, 230 140 L 430 140 C 470 140, 470 60, 510 60" className="br-feat" />
        {[60, 150, 330, 510, 590].map(x => <circle key={x} cx={x} cy="60" r="10" className="br-dot main" />)}
        {[250, 330, 410].map(x => <circle key={x} cx={x} cy="140" r="10" className="br-dot feat" />)}
        <text x="30" y="34" className="br-label main">main — always works</text>
        <text x="245" y="178" className="br-label feat">feature/login — your safe space</text>
        <text x="150" y="88" className="br-note" textAnchor="middle">git switch -c</text>
        <text x="510" y="34" className="br-note" textAnchor="middle">merge (pull request)</text>
        <text x="330" y="118" className="br-note" textAnchor="middle">commit · commit · commit</text>
      </svg>
      <figcaption>Create a branch → commit on it → open a pull request → merge back into main.</figcaption>
    </figure>
  );
}

const VISUALS = { reportAnatomy: ReportAnatomy, captionDemo: CaptionDemo, talkTimeline: TalkTimeline, slideCompare: SlideCompare, gitAreas: GitAreas, branchDiagram: BranchDiagram };

// ---------- Templates library ----------
const FORMAT_CLASS = { Word: 'word', Excel: 'excel', PowerPoint: 'ppt', Markdown: 'md', Text: 'txt' };
// The journey through the templates, grouped by project stage.
const TEMPLATE_ORDER = [
  ['Start', 'Week 1', ['Project proposal', 'Project plan & Gantt chart', 'Risk register']],
  ['Requirements', 'Week 2', ['Requirements specification (SRS)', 'Literature review matrix']],
  ['Design', 'Week 3', ['Design document']],
  ['Build & test', 'Weeks 4–6', ['Test plan', 'Test cases log', 'Test report', 'Weekly progress log']],
  ['Midway check', 'Halfway', ['Interim progress report', 'Meeting minutes']],
  ['Write up', 'Week 6+', ['Final project report', 'User manual', 'README for your repository']],
  ['Present', 'Last 2 weeks', ['Presentation template', 'Viva preparation sheet']],
];

function TemplatesLibrary() {
  const { templates: TEMPLATES, templateCategories: TEMPLATE_CATEGORIES, downloads: DOWNLOADS } = useContext(LearnData);
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [flash, setFlash] = useState('');
  const query = q.trim().toLowerCase();
  const list = TEMPLATES.filter(t => (cat === 'All' || t.category === cat) &&
    (!query || `${t.name} ${t.when ?? ''} ${t.inside.join(' ')} ${t.format ?? ''}`.toLowerCase().includes(query)));

  function show(name) {
    setCat('All'); setQ('');
    setFlash(name);
    setTimeout(() => document.getElementById(`tpl-${name}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    setTimeout(() => setFlash(''), 2200);
  }

  return (
    <div className="tpl">
      <div className="tpl-how">
        {[['', 'Download', 'Pick a template and download it.'], ['', 'Fill the blanks', 'Replace every grey [bracketed] text with your own words.'], ['', 'Tidy up', 'Delete the green help box and any sections you do not need.'], ['', 'Save as yours', 'e.g. FindIt_Final_Report_v1.docx — and keep it in Git or OneDrive.']].map(([icon, title, text], i) => (
          <div className="tpl-how-step" key={title}>
            <span className="tpl-how-n">{i + 1}</span>
            <span className="tpl-how-icon" aria-hidden="true">{icon}</span>
            <strong>{title}</strong>
            <p>{text}</p>
          </div>
        ))}
      </div>

      <section className="tpl-journey" aria-labelledby="tpl-journey-title">
        <div className="tpl-journey-head">
          <h3 id="tpl-journey-title">Which template, when?</h3>
          <p>Follow your project from the first week to the viva. Click a template to jump to it.</p>
        </div>
        <ol className="tpl-stages">
          {TEMPLATE_ORDER.map(([stage, when, names], i) => {
            const have = names.filter(n => TEMPLATES.some(t => t.name === n));
            if (have.length === 0) return null;
            return (
              <li key={stage} className="tpl-stage">
                <span className="tpl-stage-n">{i + 1}</span>
                <div className="tpl-stage-body">
                  <small>{when}</small>
                  <strong>{stage}</strong>
                  <div className="tpl-stage-links">{have.map(n => <button key={n} type="button" onClick={() => show(n)}>{n}</button>)}</div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="tpl-toolbar">
        <div className="tpl-search">
          <span aria-hidden="true"></span>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search templates — e.g. test, Gantt, README" aria-label="Search templates" />
        </div>
        <DownloadLink className="button button-emerald button-small" path="/api/content/templates.zip" fileName="projectmentor-templates.zip">Download all ({TEMPLATES.length})</DownloadLink>
      </div>
      <div className="tpl-cats" role="tablist" aria-label="Template categories">
        {TEMPLATE_CATEGORIES.map(c => {
          const n = c === 'All' ? TEMPLATES.length : TEMPLATES.filter(t => t.category === c).length;
          return (
            <button key={c} type="button" role="tab" aria-selected={cat === c} className={`tpl-cat${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>
              {c} <small>{n}</small>
            </button>
          );
        })}
      </div>

      {list.length === 0 && <p className="tpl-empty">No templates match “{q}”. Try another word.</p>}

      <div className="tpl-grid">
        {list.map(t => (
          <article className={`tpl-card${flash === t.name ? ' flash' : ''}`} key={t.id} id={`tpl-${t.name}`}>
            <div className="tpl-card-top">
              <span className={`tpl-format ${FORMAT_CLASS[t.format] ?? ''}`}>{t.format}</span>
            </div>
            <h3>{t.name}</h3>
            {t.when && <p className="tpl-when"><b>Use it:</b> {t.when}</p>}
            <ul className="tpl-inside">{t.inside.map(x => <li key={x}>{x}</li>)}</ul>
            <DownloadLink className="tpl-dl" path={t.url} fileName={t.file}>
              Download <span>{t.file.split('.').pop().toUpperCase()}</span>
            </DownloadLink>
            {t.saveAs && <p className="tpl-note">After downloading, rename it to <code>{t.saveAs}</code></p>}
          </article>
        ))}
      </div>

      <div className="tpl-examples">
        <div>
          <strong>Want to see what “finished” looks like?</strong>
          <p>Compare your work with our complete example report and presentation.</p>
        </div>
        <div className="tpl-examples-links">
          {DOWNLOADS.map(d => <DownloadLink key={d.id} className="button button-quiet button-small" path={d.url} fileName={d.file}>{d.name}</DownloadLink>)}
        </div>
      </div>
    </div>
  );
}

function Block({ block }) {
  switch (block.type) {
    case 'p': return <p className="lp"><Rich text={block.text} /></p>;
    case 'tip': return <aside className="lecturer"><span className="lecturer-tag">Lecturer’s note</span><p><Rich text={block.text} /></p></aside>;
    case 'list': return <ul className="llist">{block.items.map((t, i) => <li key={i}><Rich text={t} /></li>)}</ul>;
    case 'cards': return (
      <div className="lcards">{block.items.map(c => (
        <div className="lcard" key={c.title}>
          <span className="lcard-icon" aria-hidden="true">{c.icon}</span>
          <strong>{c.title}</strong>
          <p>{c.text}</p>
          {c.meta && <small>{c.meta}</small>}
        </div>
      ))}</div>
    );
    case 'steps': return (
      <ol className="lsteps">{block.items.map((s, i) => (
        <li key={i}><span className="lstep-n">{i + 1}</span><div><strong>{s.title}</strong><p><Rich text={s.text} /></p></div></li>
      ))}</ol>
    );
    case 'doDont': return (
      <div className="dodont">
        <div className="dd do"><h4>✓ Do</h4><ul>{block.do.map((t, i) => <li key={i}><Rich text={t} /></li>)}</ul></div>
        <div className="dd dont"><h4>✗ Don’t</h4><ul>{block.dont.map((t, i) => <li key={i}><Rich text={t} /></li>)}</ul></div>
      </div>
    );
    case 'compare': return (
      <div className="compare">{block.items.map((c, i) => (
        <div className="cmp" key={i}>
          <div className="cmp-bad"><span>{c.labels?.[0] ?? 'Before'}</span><p>{c.bad}</p></div>
          <div className="cmp-good"><span>{c.labels?.[1] ?? 'Better'}</span><p>{c.good}</p></div>
          <p className="cmp-why">{c.why}</p>
        </div>
      ))}</div>
    );
    case 'table': return (
      <div className="ltable-wrap"><table className="ltable">
        <thead><tr>{block.head.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{block.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}><Rich text={c} /></td>)}</tr>)}</tbody>
      </table></div>
    );
    case 'example': return (
      <div className="lexample"><div className="lexample-head">{block.title}</div><pre>{block.code}</pre></div>
    );
    case 'videos': return <div className="vids">{block.ids.map(id => <VideoCard key={id} id={id} />)}</div>;
    case 'quiz': return <Quiz questions={block.questions} />;
    case 'checklist': return <Checklist id={block.id} items={block.items} />;
    case 'visual': { const V = VISUALS[block.name]; return V ? <V /> : null; }
    case 'image': return block.uploadId ? (
      <figure className="lfig">
        <a href={uploadUrl(block.uploadId)} target="_blank" rel="noreferrer" title="Open full size"><img src={uploadUrl(block.uploadId)} alt={block.caption ?? ''} loading="lazy" /></a>
        {block.caption && <figcaption>{block.caption}</figcaption>}
      </figure>
    ) : null;
    default: return null;
  }
}

// ---------- page ----------
export default function LearnPage() {
  const { content, error, reload } = useLearnContent();
  if (!content) {
    return (
      <main className="learn">
        <section className="learn-hero"><div className="learn-hero-inner">
          <p className="eyebrow">Learn</p>
          {error
            ? <><h1>Lessons could not load</h1><p className="page-lede">{error}</p><button type="button" className="button button-primary" onClick={reload}>Try again</button></>
            : <><h1>Loading lessons…</h1><p className="page-lede">Fetching the latest lessons, videos and templates.</p></>}
        </div></section>
      </main>
    );
  }
  return <LearnData.Provider value={content}><LearnView content={content} /></LearnData.Provider>;
}

function LearnView({ content }) {
  const { tracks: TRACKS, templates: TEMPLATES, downloads: DOWNLOADS } = content;
  const firstKey = Object.keys(TRACKS)[0] ?? 'templates';
  const [track, setTrack] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('track');
    if (TRACKS[fromUrl] || fromUrl === 'templates') return fromUrl;
    const saved = load('pm.learn.track', firstKey);
    return TRACKS[saved] || saved === 'templates' ? saved : firstKey;
  });
  const [done, setDone] = useState(() => load('pm.learn.done', {}));
  const [active, setActive] = useState('');
  const [progress, setProgress] = useState(0);
  const lessonsRef = useRef(null);

  const t = TRACKS[track] ?? TRACKS[firstKey];
  const isTemplates = track === 'templates' || !t;
  const doneCount = (t?.lessons ?? []).filter(l => done[`${track}.${l.id}`]).length;
  const order = [...Object.keys(TRACKS), 'templates'];
  const nextKey = order[(order.indexOf(track) + 1) % order.length];
  const nextLabel = nextKey === 'templates' ? 'Templates library' : TRACKS[nextKey].label;

  useEffect(() => { save('pm.learn.track', track); }, [track]);
  useEffect(() => { save('pm.learn.done', done); }, [done]);

  // Reading progress bar.
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setProgress(max > 0 ? Math.min(100, (h.scrollTop / max) * 100) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Highlight the lesson currently on screen.
  useEffect(() => {
    const els = lessonsRef.current?.querySelectorAll('[data-lesson]') ?? [];
    const io = new IntersectionObserver(entries => {
      const vis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.dataset.lesson);
    }, { rootMargin: '-20% 0px -65% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [track]);

  const videoCount = useMemo(() => new Set(Object.values(TRACKS).flatMap(tr => tr.lessons.flatMap(l => l.blocks.filter(b => b.type === 'videos').flatMap(b => b.ids)))).size, [TRACKS]);

  function go(id) {
    document.getElementById(`lesson-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function switchTrack(key) {
    setTrack(key);
    setActive('');
    document.getElementById('learn-tracks')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <main className="learn">
      <div className="read-progress" style={{ width: `${progress}%` }} aria-hidden="true" />

      <section className="learn-hero">
        <div className="learn-hero-inner">
          <p className="eyebrow">Learn · from zero to hero</p>
          <h1>Write it well. <span className="script-accent">Present it</span> with confidence.</h1>
          <p className="page-lede">Everything a lecturer would teach you about project reports, diagrams, technical writing, presentations and Git — in simple English, with examples, videos and ready-to-use templates.</p>
          <div className="learn-stats">
            <span><b>{Object.values(TRACKS).reduce((n, tr) => n + tr.lessons.length, 0)}</b> lessons</span>
            <span><b>{videoCount}</b> videos</span>
            <span><b>{TEMPLATES.length}</b> templates</span>
            <span><b>{DOWNLOADS.length}</b> example files</span>
          </div>
        </div>
      </section>

      <nav className="lt-bar" id="learn-tracks" aria-label="Choose a topic">
        <div className="lt-inner" role="tablist">
          {Object.values(TRACKS).map(tr => (
            <button key={tr.key} type="button" role="tab" aria-selected={track === tr.key}
              className={`lt-tab${track === tr.key ? ' on' : ''}`} onClick={() => switchTrack(tr.key)}>
              <span className="lt-label">{tr.label}</span>
              <small>{tr.lessons.length} lessons</small>
            </button>
          ))}
          <span className="lt-sep" aria-hidden="true" />
          <button type="button" role="tab" aria-selected={isTemplates}
            className={`lt-tab lt-templates${isTemplates ? ' on' : ''}`} onClick={() => switchTrack('templates')}>
            <span className="lt-label">Templates</span>
            <small>{TEMPLATES.length} files</small>
          </button>
        </div>
      </nav>

      {isTemplates ? (
        <div className="learn-tpl-wrap">
          <p className="track-intro">Ready-made, fill-in-the-blanks documents for every stage of your project — proposal to viva. Each one has grey guidance text that tells you exactly what to write.</p>
          <TemplatesLibrary />
          {TRACKS[firstKey] && <button type="button" className="next-link" onClick={() => switchTrack(firstKey)}>Start learning: {TRACKS[firstKey].label} →</button>}
        </div>
      ) : (
      <div className="learn-layout">
        <aside className="learn-toc" aria-label="Lessons">
          <div className="toc-progress">
            <span>{doneCount} of {t.lessons.length} lessons done</span>
            <span className="mini-bar"><span style={{ width: `${(doneCount / (t.lessons.length || 1)) * 100}%` }} /></span>
          </div>
          <ol>
            {t.lessons.map((l, i) => (
              <li key={l.id}>
                <button type="button" className={`toc-item${active === l.id ? ' active' : ''}${done[`${track}.${l.id}`] ? ' done' : ''}`} onClick={() => go(l.id)}>
                  <span className="toc-n">{done[`${track}.${l.id}`] ? '✓' : i + 1}</span>
                  <span>{l.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <div className="learn-lessons" ref={lessonsRef}>
          <p className="track-intro">{t.intro}</p>
          {t.lessons.map((l, i) => {
            const key = `${track}.${l.id}`;
            return (
              <section className="lesson" id={`lesson-${l.id}`} data-lesson={l.id} key={key}>
                <header className="lesson-head">
                  <span className="lesson-n">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <h2>{l.title}</h2>
                    <p className="lesson-lead">{l.lead}</p>
                  </div>
                </header>
                {l.blocks.map((b, j) => <Block block={b} key={j} />)}
                <div className="lesson-foot">
                  <label className={`lesson-done${done[key] ? ' on' : ''}`}>
                    <input type="checkbox" checked={Boolean(done[key])} onChange={() => setDone(d => ({ ...d, [key]: !d[key] }))} />
                    {done[key] ? '✓ Lesson done' : 'Mark lesson as done'}
                  </label>
                  {i < t.lessons.length - 1 && <button type="button" className="next-link" onClick={() => go(t.lessons[i + 1].id)}>Next: {t.lessons[i + 1].title} →</button>}
                </div>
              </section>
            );
          })}

          <section className="lesson downloads" id="downloads">
            <header className="lesson-head">
              <span className="lesson-n"></span>
              <div>
                <h2>Example files to study</h2>
                <p className="lesson-lead">Download these, open them side by side with the lessons, and copy the structure — not the words.</p>
              </div>
            </header>
            <div className="dl-grid">
              {DOWNLOADS.map(d => (
                <DownloadLink className="dl-card" key={d.id} path={d.url} fileName={d.file}>
                  <span className="dl-body"><strong>{d.name}</strong><small>{d.type}</small><span>{d.text}</span></span>
                  <span className="dl-btn">Download</span>
                </DownloadLink>
              ))}
            </div>
            <button type="button" className="next-link" onClick={() => switchTrack(nextKey)}>Next: {nextLabel} →</button>
          </section>
        </div>
      </div>
      )}
    </main>
  );
}

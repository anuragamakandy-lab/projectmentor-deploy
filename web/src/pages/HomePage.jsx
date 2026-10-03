import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Footer from '../components/Footer';
import HomeNav from '../components/home/HomeNav';
import Preloader from '../components/home/Preloader';
import { useHomeMotion } from '../components/home/useHomeMotion';
import { useSiteContent } from '../content/useSiteContent';
import '../styles/home.css';

const HERO = '/home/hero.webp';
const PRELOAD = ['/logo-full.png', HERO, '/home/plan.webp', '/home/team.webp'];
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
const inWords = n => WORDS[n] ?? String(n);
const isExternal = url => /^https?:/i.test(url ?? '');

/* Plain line icons (no emoji). */
const PATHS = {
  check: 'm5 12 4.5 4.5L19 7',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  plus: 'M12 5v14M5 12h14',
};
const Icon = ({ name, size = 18 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name]} /></svg>
);

/* Shapes from the hero artwork, repeated quietly down the page so hero and page read as one canvas. */
const SHAPES = [
  ['blob teal s1', { top: '17%', right: '-11%', width: 460, height: 460 }],
  ['blob mint s2', { top: '31%', left: '-12%', width: 420, height: 420 }],
  ['blob sage s3', { top: '49%', right: '-12%', width: 380, height: 380 }],
  ['blob teal s2', { top: '66%', left: '-13%', width: 440, height: 440 }],
  ['blob mint s1', { top: '82%', right: '-10%', width: 360, height: 360 }],
  ['dot sun', { top: '22%', left: '5%', width: 34, height: 34 }],
  ['dot teal', { top: '40%', right: '6%', width: 26, height: 26 }],
  ['dot olive', { top: '57%', left: '7%', width: 30, height: 30 }],
  ['dot sun', { top: '74%', right: '8%', width: 22, height: 22 }],
];





function FaqItem({ q, a, i }) {
  const [open, setOpen] = useState(i === 0);
  return (
    <div className={`hm-faq-item${open ? ' open' : ''}`}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span>{q}</span>
        <span className="hm-faq-icon" aria-hidden="true"><Icon name="plus" size={16} /></span>
      </button>
      <div className="hm-faq-a"><div><p>{a}</p></div></div>
    </div>
  );
}

function Spotlight({ id, flip, image, alt, kicker, title, text, points, link, linkLabel }) {
  return (
    <section className={`hm-section hm-spot${flip ? ' flip' : ''}`} id={id}>
      <figure className="hm-photo" data-reveal>
        <img src={image} alt={alt} loading="lazy" decoding="async" />
      </figure>
      <div className="hm-spot-copy" data-reveal style={{ '--d': '120ms' }}>
        <p className="hm-kicker">{kicker}</p>
        <h2>{title}</h2>
        <p>{text}</p>
        <ul className="hm-ticks">
          {points.map(p => <li key={p}><span className="hm-tick"><Icon name="check" size={14} /></span><span>{p}</span></li>)}
        </ul>
        <Link className="hm-link" to={link}>{linkLabel} <Icon name="arrow" size={16} /></Link>
      </div>
    </section>
  );
}

export default function HomePage() {
  const { isAuthenticated, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const rootRef = useRef(null);
  const done = useCallback(() => setLoading(false), []);
  const startPath = isAuthenticated ? (user?.role === 'Admin' ? '/admin' : '/student') : '/register';
  // Feature cards, steps, agents and FAQ are managed in the admin panel.
  const site = useSiteContent();
  const features = site?.features ?? [];
  const journey = site?.journey ?? [];
  const agents = site?.agents ?? [];
  const faq = site?.faq ?? [];

  useHomeMotion(rootRef, site);
  useEffect(() => {
    document.documentElement.classList.add('hm-page');
    return () => document.documentElement.classList.remove('hm-page');
  }, []);

  return (
    <div className={`hm${loading ? ' is-loading' : ' is-ready'}`} ref={rootRef}>
      {loading && <Preloader assets={PRELOAD} onDone={done} />}

      <div className="hm-shapes" aria-hidden="true">
        {SHAPES.map(([cls, style], i) => <span key={i} className={`hm-shape ${cls}`} style={style} />)}
      </div>

      <HomeNav />

      <main>
        {/* Hero */}
        <section className="hm-hero" id="top">
          <div className="hm-hero-art" aria-hidden="true"><img src={HERO} alt="" fetchPriority="high" decoding="async" /></div>
          <span className="hm-hero-wave" aria-hidden="true" />
          <div className="hm-hero-inner">
            <h1 className="hm-title">
              <span className="hm-line"><span className="hm-in" style={{ '--d': '0ms' }}>From first idea</span></span>
              <span className="hm-line"><span className="hm-in accent" style={{ '--d': '120ms' }}>to final viva.</span></span>
            </h1>
            <p className="hm-lede hm-in" style={{ '--d': '260ms' }}>
              ProjectMentor guides undergraduates through the whole project — planning, teamwork, writing and the viva — with an AI mentor that knows your project.
            </p>
          </div>
        </section>

        {/* Features */}
        {features.length > 0 && (
        <section className="hm-section" id="features">
          <header className="hm-head" data-reveal>
            <p className="hm-kicker">What you can do</p>
            <h2>One place for the whole project.</h2>
            <p>{inWords(features.length)} tool{features.length === 1 ? '' : 's'} that work together, so you always know what to do next.</p>
          </header>
          <div className="hm-features">
            {features.map((f, i) => {
              const body = (
                <>
                  <span className="hm-feature-img"><img src={`/home/${f.image ?? 'plan'}.webp`} alt="" loading="lazy" decoding="async" /></span>
                  <span className="hm-feature-body">
                    <h3>{f.title}</h3>
                    <p>{f.body}</p>
                    {f.linkLabel && <span className="hm-link">{f.linkLabel} <Icon name="arrow" size={16} /></span>}
                  </span>
                </>
              );
              const props = { className: `hm-feature f${i % 5}`, 'data-reveal': true, style: { '--d': `${i * 80}ms` } };
              if (!f.linkUrl) return <div key={f.id} {...props}>{body}</div>;
              return isExternal(f.linkUrl)
                ? <a key={f.id} href={f.linkUrl} target="_blank" rel="noreferrer" {...props}>{body}</a>
                : <Link key={f.id} to={f.linkUrl} {...props}>{body}</Link>;
            })}
          </div>
        </section>
        )}

        {/* Journey */}
        {journey.length > 0 && (
        <section className="hm-section" id="journey">
          <header className="hm-head" data-reveal>
            <p className="hm-kicker">How it works</p>
            <h2>Your project, step by step.</h2>
            <p>The path every ProjectMentor student follows, from the first idea to the final viva.</p>
          </header>
          <ol className="hm-journey" data-progress>
            <span className="hm-journey-line" aria-hidden="true"><i /></span>
            {journey.map((step, i) => (
              <li key={step.id} className={`hm-step ${i % 2 ? 'right' : 'left'}`} data-reveal>
                <span className="hm-step-node" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <div className="hm-step-card"><h3>{step.title}</h3><p>{step.body}</p></div>
              </li>
            ))}
          </ol>
        </section>
        )}

        <Spotlight id="teams" image="/home/build.webp" alt="Two students working on code together at a laptop"
          kicker="Groups and sprints" title="Group projects without the chaos."
          text="Invite teammates with a link. Milestones are broken into small weekly tasks and shared fairly, so everyone knows what to do this week."
          points={['Drag-and-drop sprint board with a weekly view', 'Team chat with images and files', 'Contribution record ready for your report']}
          link={isAuthenticated ? '/groups' : '/register'} linkLabel="Create a group" />

        <Spotlight id="viva" flip image="/home/present.webp" alt="A student presenting to a class in a lecture room"
          kicker="Mock viva" title="Rehearse the viva before it counts."
          text="The AI examiner reads your project, asks the questions a real panel would ask, listens to your spoken answer and marks it."
          points={['Questions about your own features, data and decisions', 'A score out of ten with what to improve', 'A high-scoring model answer for every question']}
          link={isAuthenticated ? '/student/viva' : '/register'} linkLabel="Practise now" />

        <Spotlight id="learn" image="/home/books.webp" alt="Open books and notes on a study desk"
          kicker="Learn and templates" title="Write it well. Present it clearly."
          text="Plain-English lessons on reports, technical writing, presentations and Git — with videos, quizzes and fill-in-the-blanks templates."
          points={['Which tense to use, and where', 'Clear slide design with good and bad examples', 'Proposal, SRS, test plan and final report templates']}
          link="/learn" linkLabel="Open the lessons" />

        {/* Agents */}
        {agents.length > 0 && (
        <section className="hm-band" id="agents">
          <div className="hm-band-inner">
            <header className="hm-head left" data-reveal>
              <p className="hm-kicker light">Under the hood</p>
              <h2>{inWords(agents.length)} AI agent{agents.length === 1 ? '' : 's'}, each with one job.</h2>
              <p>Every answer is checked before you see it, and each agent has a safe fallback when the AI is busy.</p>
            </header>
            <ol className="hm-agents">
              {agents.map((a, i) => (
                <li key={a.id} data-reveal style={{ '--d': `${i * 60}ms` }}>
                  <span className="hm-agent-n">{String(i + 1).padStart(2, '0')}</span>
                  <div><h3>{a.title}</h3><p>{a.body}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>
        )}

        {/* Stats (live counts from the database) */}
        {site && (
        <section className="hm-section hm-stats" data-reveal>
          {[[agents.length, 'AI agents'], [site.lessons, 'Lessons'], [site.videos, 'Videos'], [site.templates, 'Templates']].map(([n, label]) => (
            <div className="hm-stat" key={label}><b data-count={n}>0</b><span>{label}</span></div>
          ))}
        </section>
        )}

        {/* FAQ */}
        {faq.length > 0 && (
        <section className="hm-section hm-faq" id="faq">
          <header className="hm-head" data-reveal>
            <p className="hm-kicker">Questions</p>
            <h2>Good to know.</h2>
          </header>
          <div className="hm-faq-list" data-reveal>
            {faq.map((item, i) => <FaqItem key={item.id} q={item.title} a={item.body} i={i} />)}
          </div>
        </section>
        )}

        {/* Closing call to action */}
        <section className="hm-section">
          <div className="hm-cta" data-reveal>
            <img src="/home/graduation.webp" alt="" loading="lazy" decoding="async" />
            <div className="hm-cta-copy">
              <h2>Your project deserves a plan.</h2>
              <p>Answer a few questions and get your first roadmap today.</p>
              <Link className="hm-btn light" to={startPath}>{isAuthenticated ? 'Go to your workspace' : 'Create your free account'}</Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

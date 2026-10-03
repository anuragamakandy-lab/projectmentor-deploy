import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const COLUMNS = [
  ['Product', [['Plan', '/student'], ['Work as a team', '/groups'], ['Learn', '/learn'], ['Practise', '/student/viva'], ['Share', '/community']]],
  ['Resources', [['Templates', '/learn?track=templates'], ['Writing guide', '/learn'], ['Presentation guide', '/learn?track=present'], ['Git guide', '/learn?track=git'], ['Resource hub', '/resources']]],
  ['Account', [['Log in', '/login'], ['Create account', '/register'], ['My roadmaps', '/student/roadmaps'], ['My groups', '/groups']]],
];

/** Shared footer for the home page and every sub-page. */
export default function Footer() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');

  // No mailing list exists yet, so the form honestly leads to sign-up with the email filled in.
  function submit(e) {
    e.preventDefault();
    navigate('/register', { state: { email: email.trim() } });
  }

  return (
    <footer className="sf">
      <svg className="sf-planet" viewBox="0 0 96 70" aria-hidden="true">
        <ellipse cx="48" cy="40" rx="44" ry="11" fill="none" stroke="#C9A15A" strokeWidth="1.2" transform="rotate(-14 48 40)" />
        <circle cx="52" cy="32" r="20" fill="#A3CFD8" />
        <circle cx="46" cy="27" r="7" fill="#C7E2E6" />
        <circle cx="12" cy="52" r="3" fill="#C9A15A" />
      </svg>

      <div className="sf-inner">
        <div className="sf-brand">
          <Link to="/" aria-label="ProjectMentor home"><img src="/logo-full.png" alt="ProjectMentor" /></Link>
          <p>Your AI mentor from first idea to final viva: plan it, build it with your team, write it up, and present it with confidence.</p>
          <div className="sf-social">
            <a href="https://github.com/IT24100732/ProjectMentor-App" target="_blank" rel="noreferrer noopener" aria-label="ProjectMentor on GitHub">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" /></svg>
            </a>
          </div>
        </div>

        {COLUMNS.map(([title, links]) => (
          <div className="sf-col" key={title}>
            <h3>{title}</h3>
            <ul>{links.map(([label, to]) => <li key={label}><Link to={to}>{label}</Link></li>)}</ul>
          </div>
        ))}

        <div className="sf-news">
          <h3>Stay updated</h3>
          <p>Create a free account to save your roadmaps and get project tips along the way.</p>
          <form className="sf-form" onSubmit={submit}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Your email address" aria-label="Your email address" />
            <button type="submit" aria-label="Continue to sign up">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
            </button>
          </form>
        </div>
      </div>

      <div className="sf-base">
        <span>© {new Date().getFullYear()} ProjectMentor. All rights reserved.</span>
        <span>Built for SE3090 Software Engineering Frameworks</span>
      </div>

      <svg className="sf-waves" viewBox="0 0 1440 190" preserveAspectRatio="none" aria-hidden="true">
        <path className="wc" d="M0 150 C 240 120 420 170 640 150 C 860 130 1000 160 1180 150 C 1300 144 1380 150 1440 146 L1440 190 L0 190 Z" />
        <path className="wa" d="M760 190 C 900 150 1020 90 1160 74 C 1270 62 1360 40 1440 18 L1440 190 Z" />
        <path className="wb" d="M980 190 C 1100 156 1210 120 1310 110 C 1370 104 1410 96 1440 88 L1440 190 Z" />
        <path className="gl" d="M0 172 C 260 160 480 182 700 166 C 900 152 1060 120 1220 98 C 1320 84 1390 70 1440 62" />
        <circle className="gd" cx="700" cy="166" r="4" />
      </svg>
    </footer>
  );
}

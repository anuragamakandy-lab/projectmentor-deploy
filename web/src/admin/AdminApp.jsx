import { useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { adminSession, useAdminSession } from './adminSession';
import { admin } from './adminApi';
import { FeedbackProvider, Icon } from './ui';
import Overview from './pages/Overview';
import Community from './pages/Community';
import SiteContent from './pages/SiteContent';
import Resources from './pages/Resources';
import Videos from './pages/Videos';
import Lessons from './pages/Lessons';
import LessonEditor from './pages/LessonEditor';
import Files from './pages/Files';
import Users from './pages/Users';
import Groups from './pages/Groups';
import Viva from './pages/Viva';
import SystemSettings from './pages/SystemSettings';
import Emails from './pages/Emails';
import Support from './pages/Support';
import OfficialPage from './pages/OfficialPage';
import './admin.css';

const NAV = [
  ['Manage', [
    ['/admin', 'Overview', 'overview', true],
    ['/admin/community', 'Community posts', 'community'],
    ['/admin/page', 'ProjectMentor page', 'page'],
    ['/admin/users', 'Users', 'users'],
    ['/admin/groups', 'Project groups', 'users'],
    ['/admin/viva', 'Mock viva', 'viva'],
  ]],
  ['Content', [
    ['/admin/site', 'Home page', 'globe'],
    ['/admin/lessons', 'Lessons', 'lessons'],
    ['/admin/videos', 'Videos', 'videos'],
    ['/admin/files', 'Templates & examples', 'files'],
    ['/admin/resources', 'Resources', 'resources'],
  ]],
  ['System', [
    ['/admin/emails', 'Emails', 'mail'],
    ['/admin/support', 'Support inbox', 'support'],
    ['/admin/settings', 'System settings', 'settings'],
  ]],
];

/** The admin console. Lives at /admin with its own sign-in, separate from the student site. */
export default function AdminApp() {
  const user = useAdminSession()?.user;
  const logout = () => adminSession.clear();
  const location = useLocation();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [pending, setPending] = useState(0);

  // Pending-post count in the sidebar, refreshed on every page change and every minute.
  useEffect(() => {
    if (user?.role !== 'Admin') return undefined;
    const load = () => admin.stats().then(s => setPending(s.pendingPosts)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [user, location.pathname]);

  useEffect(() => { setNavOpen(false); }, [location.pathname]);
  useEffect(() => { document.title = 'Admin · ProjectMentor'; }, [location.pathname]);

  if (!user) return <Navigate to="/admin/login" replace />;
  if (user.role !== 'Admin') return <Navigate to="/admin/login" replace />;

  function signOut() {
    logout();
    navigate('/admin/login', { replace: true });
  }

  const initials = user.fullName.split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <FeedbackProvider>
      <div className={`adm${navOpen ? ' nav-open' : ''}`}>
        <div className="adm-topbar">
          <button type="button" onClick={() => setNavOpen(o => !o)} aria-label="Open menu"><Icon name="menu" /></button>
          <img src="/logo-full-light.png" alt="ProjectMentor" />
          <span>Admin</span>
        </div>

        <aside className="adm-side" onClick={e => { if (e.target === e.currentTarget) setNavOpen(false); }}>
          <NavLink to="/admin" className="adm-brand" end>
            <img src="/logo-full-light.png" alt="ProjectMentor" />
            <span>Admin</span>
          </NavLink>
          <GlobalSearch />
          <nav className="adm-nav" aria-label="Admin">
            {NAV.map(([label, items]) => (
              <div key={label} style={{ display: 'contents' }}>
                <div className="adm-nav-label">{label}</div>
                {items.map(([to, text, icon, end]) => (
                  <NavLink key={to} to={to} end={end}>
                    <Icon name={icon} />{text}
                    {to === '/admin/community' && pending > 0 && <span className="adm-badge" title={`${pending} waiting for review`}>{pending}</span>}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="adm-side-foot">
            <div className="adm-me">
              <span className="adm-me-avatar">{initials}</span>
              <div><strong>{user.fullName}</strong><small>{user.email}</small></div>
            </div>
            <div className="adm-side-links">
              <a href="/" target="_blank" rel="noreferrer"><Icon name="external" size={15} />Website</a>
              <button type="button" onClick={signOut}><Icon name="logout" size={15} />Sign out</button>
            </div>
          </div>
        </aside>

        <main className="adm-main">
          <Routes>
            <Route index element={<Overview />} />
            <Route path="community" element={<Community onChanged={() => admin.stats().then(s => setPending(s.pendingPosts)).catch(() => {})} />} />
            <Route path="users" element={<Users />} />
            <Route path="groups" element={<Groups />} />
            <Route path="viva" element={<Viva />} />
            <Route path="site" element={<SiteContent />} />
            <Route path="lessons" element={<Lessons />} />
            <Route path="lessons/new" element={<LessonEditor />} />
            <Route path="lessons/:id" element={<LessonEditor />} />
            <Route path="videos" element={<Videos />} />
            <Route path="files" element={<Files />} />
            <Route path="resources" element={<Resources />} />
            <Route path="page" element={<OfficialPage />} />
            <Route path="emails" element={<Emails />} />
            <Route path="support" element={<Support />} />
            <Route path="settings" element={<SystemSettings />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
      </div>
    </FeedbackProvider>
  );
}

/** One search box for the whole console (users, groups, posts, lessons, videos, files, resources, characters). */
function GlobalSearch() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState(null);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const box = useRef(null);

  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return undefined; }
    const t = setTimeout(() => admin.search(q.trim()).then(h => { setHits(h); setActive(0); }).catch(() => setHits([])), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onKey = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); box.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function go(hit) {
    setQ(''); setHits(null);
    navigate(hit.link);
  }

  return (
    <div className="adm-gsearch">
      <Icon name="search" size={16} />
      <input ref={box} type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search everything (Ctrl+K)" aria-label="Search the admin console"
        onKeyDown={e => {
          if (!hits?.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, hits.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
          if (e.key === 'Enter') { e.preventDefault(); go(hits[active]); }
          if (e.key === 'Escape') { setQ(''); setHits(null); }
        }} />
      {hits && (
        <div className="adm-gresults" role="listbox">
          {hits.length === 0 && <p>No results for "{q}".</p>}
          {hits.map((h, i) => (
            <a key={`${h.kind}${h.id}`} href={h.link} className={i === active ? 'on' : ''} onClick={e => { e.preventDefault(); go(h); }} role="option" aria-selected={i === active}>
              <span className="adm-pill">{h.kind}</span>
              <div><strong>{h.title}</strong>{h.subtitle && <small>{h.subtitle}</small>}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

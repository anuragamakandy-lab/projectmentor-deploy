import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useMe } from '../../auth/useMe';
import Avatar from '../Avatar';
import { NotificationBell } from '../Navbar';
import { useFeedback } from '../../ui/feedback';

const STUDENT_LINKS = [['/student/roadmaps', 'Roadmaps'], ['/groups', 'Groups'], ['/community', 'Community'], ['/student/viva', 'Mock viva'], ['/resources', 'Resources'], ['/learn', 'Learn']];
const ADMIN_LINKS = [['/admin', 'Console'], ['/community', 'Community'], ['/resources', 'Resources'], ['/learn', 'Learn']];
const GUEST_LINKS = [['/community', 'Community'], ['/resources', 'Resources'], ['/learn', 'Learn']];

export default function HomeNav() {
  const { isAuthenticated, user, logout } = useAuth();
  const { me } = useMe();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = !isAuthenticated ? GUEST_LINKS : user?.role === 'Admin' ? ADMIN_LINKS : STUDENT_LINKS;
  const { confirm } = useFeedback();
  async function signOut() {
    setOpen(false);
    if (!await confirm({ title: 'Log out?', message: 'You will need to log in again to see your roadmaps, groups and community.', ok: 'Log out' })) return;
    logout();
    navigate('/');
  }

  return (
    <header className={`hm-nav${scrolled ? ' is-scrolled' : ''}${open ? ' is-open' : ''}`}>
      <div className="hm-nav-inner">
        <Link to="/" className="hm-brand" aria-label="ProjectMentor home">
          <img className="hm-logo" src="/logo-full.png" alt="ProjectMentor" />
        </Link>

        <nav className="hm-links" aria-label="Main">
          {links.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
        </nav>

        <div className="hm-nav-cta">
          {isAuthenticated ? (
            <>
              <NotificationBell />
              <Link className="nav-me" to="/profile" aria-label="Your profile" title="Your profile">
                <Avatar name={me?.fullName ?? user.fullName} seed={user.userId} size={34} photoId={me?.avatarId} badge={me?.badge} title="" />
              </Link>
              <button type="button" className="icon-btn hide-sm" onClick={signOut} aria-label="Log out" title="Log out">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
              </button>
            </>
          ) : (
            <>
              <Link className="hm-btn ghost sm hide-sm" to="/login">Log in</Link>
              <Link className="hm-btn solid sm" to="/register">Get started</Link>
            </>
          )}
          <button type="button" className="hm-burger" onClick={() => setOpen(o => !o)} aria-label="Menu" aria-expanded={open} aria-controls="hm-menu">
            <span /><span /><span />
          </button>
        </div>
      </div>

      <div className="hm-menu" id="hm-menu" hidden={!open}>
        {links.map(([to, label]) => <Link key={to} to={to} onClick={() => setOpen(false)}>{label}</Link>)}
        <div className="hm-menu-cta">
          {isAuthenticated
            ? <><Link className="hm-btn ghost" to="/profile">My profile</Link><button type="button" className="hm-btn ghost" onClick={signOut}>Log out</button></>
            : <><Link className="hm-btn solid" to="/register">Get started</Link><Link className="hm-btn ghost" to="/login">Log in</Link></>}
        </div>
      </div>
    </header>
  );
}

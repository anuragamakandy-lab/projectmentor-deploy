import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useMe } from '../auth/useMe';
import { getNotifications, markNotificationsRead } from '../api/projectMentorApi';
import Avatar, { timeAgo } from './Avatar';
import { useFeedback } from '../ui/feedback';

const marketingLinks = [
  ['/', 'Home'],
  ['/learn', 'Learn'],
  ['/community', 'Community'],
  ['/resources', 'Resources'],
];

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" /><path d="M4 21v-1a7 7 0 0 1 14 0v1" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/** Notification bell: unread count, latest notifications, marks them read when opened. */
export function NotificationBell() {
  const { token } = useAuth();
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (!token) return undefined;
    const load = () => getNotifications(token).then(setData).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [token, location.pathname]);
  useEffect(() => { setOpen(false); }, [location.pathname]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && data.unread > 0) {
      try { await markNotificationsRead(token); setData(d => ({ ...d, unread: 0 })); } catch { /* ignore */ }
    }
  }

  return (
    <div className="nav-wrap">
      <button className="icon-btn nav-bell" type="button" onClick={toggle} aria-label={`Notifications${data.unread ? `, ${data.unread} new` : ''}`} aria-expanded={open}>
        <BellIcon />
        {(data.unread + (data.communityUnread ?? 0)) > 0 && <span className="nav-bell-count">{data.unread + (data.communityUnread ?? 0) > 9 ? '9+' : data.unread + (data.communityUnread ?? 0)}</span>}
      </button>
      {open && (
        <div className="nav-pop" role="dialog" aria-label="Notifications">
          <div className="nav-pop-head">Notifications <Link to="/profile#notifications">See all</Link></div>
          {/* Community activity lives in the Community page; the bell only points to it. */}
          {data.communityUnread > 0 && (
            <Link to="/community/notifications" className="nav-note nav-note-community unread">
              <strong>You have {data.communityUnread} new community notification{data.communityUnread === 1 ? '' : 's'}</strong>
              <span>Friend requests, comments, reactions and shares. Open the Community page to see them.</span>
            </Link>
          )}
          {data.items.length === 0 && !data.communityUnread && <p className="nav-pop-empty">Nothing new yet. You will see deadlines, badges and account messages here.</p>}
          {data.items.slice(0, 8).map(n => (
            <Link key={n.id} to={n.link || '/profile'} className={`nav-note${n.isRead ? '' : ' unread'}`}>
              <strong>{n.title}</strong>
              {n.body && <span>{n.body}</span>}
              <small>{timeAgo(n.createdAt)}</small>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Navbar({ overlay = false }) {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const { me } = useMe();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!overlay) return undefined;
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [overlay]);

  const { confirm } = useFeedback();

  // Ask first; Cancel keeps the student on the page they are on.
  async function signOut() {
    if (!await confirm({ title: 'Log out?', message: 'You will need to log in again to see your roadmaps, groups and community.', ok: 'Log out' })) return;
    logout();
    navigate('/');
  }

  const links = isAuthenticated
    ? (user.role === 'Admin'
        ? [['/', 'Home'], ['/admin', 'Console'], ['/community', 'Community'], ['/resources', 'Resources'], ['/learn', 'Learn']]
        : [['/', 'Home'], ['/student/roadmaps', 'Roadmaps'], ['/groups', 'Groups'], ['/community', 'Community'], ['/student/viva', 'Mock Viva'], ['/resources', 'Resources'], ['/learn', 'Learn']])
    : marketingLinks;

  return (
    <header className={`navbar ${overlay ? 'overlay' : 'solid'}${overlay && scrolled ? ' scrolled' : ''}`}>
      <div className="container navbar-inner">
        <Link className="brand" to="/" aria-label="ProjectMentor home">
          <img className="brand-full" src="/logo-full.png" alt="ProjectMentor" />
        </Link>

        <nav className="nav-links" aria-label="Primary">
          {links.map(([href, label]) => (
            href.startsWith('#')
              ? <a key={href} href={href}>{label}</a>
              : <NavLink key={href} to={href} end={href === '/'}>{label}</NavLink>
          ))}
        </nav>

        <div className="nav-right">
          {isAuthenticated && <NotificationBell />}
          {isAuthenticated
            ? (
              <Link className="nav-me" to="/profile" aria-label="Your profile" title="Your profile">
                <Avatar name={me?.fullName ?? user.fullName} seed={user.userId} size={34} photoId={me?.avatarId} badge={me?.badge} title="" />
              </Link>
            )
            : (
              <Link className="icon-btn" to="/login" aria-label="Log in" title="Log in">
                <UserIcon />
              </Link>
            )}
          {isAuthenticated && (
            <button className="icon-btn" type="button" onClick={signOut} aria-label="Sign out" title="Sign out">
              <LogoutIcon />
            </button>
          )}
          <button className="icon-btn nav-menu-btn" type="button" onClick={() => setMenuOpen(o => !o)} aria-label="Menu" aria-expanded={menuOpen} aria-controls="mobile-nav">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav className="nav-mobile" id="mobile-nav" aria-label="Menu">
          {links.map(([href, label]) => (
            href.startsWith('#')
              ? <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>
              : <Link key={href} to={href} className={location.pathname === href || (href !== '/' && location.pathname.startsWith(href)) ? 'on' : ''}>{label}</Link>
          ))}
        </nav>
      )}
    </header>
  );
}

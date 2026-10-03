import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  acceptFriend, communitySearch, declineFriend, getCommunityCounts, getCommunityFeed, getFriends, getOfficialPage, getPendingPosts, getPost,
  getScopedNotifications, listGroups, markNotificationRead, markScopeRead, removeFriend, sendFriendRequest,
} from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';
import { useMe } from '../auth/useMe';
import Avatar, { timeAgo } from '../components/Avatar';
import PostCard from '../components/community/PostCard';
import Composer from '../components/community/Composer';
import ProfileView, { RelationButtons } from '../components/community/ProfileView';
import { CommunityCtx, Icon, VerifiedTick, useCommunity, useLoginGuard } from '../components/community/shared';
import { useFeedback } from '../ui/feedback';
import '../styles/community.css';

const FILTERS = [['', 'All posts'], ['Showcase', 'Showcases'], ['Question', 'Questions'], ['Report', 'Reports'], ['Idea', 'Ideas'], ['Announcement', 'Announcements']];

/* ---------------- top bar (like Facebook's) ---------------- */

function TopBar({ counts }) {
  const { token, user, me } = useCommunity();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!q.trim()) { setResults(null); return undefined; }
    const t = setTimeout(() => communitySearch(token, q.trim()).then(setResults).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q, token]);
  useEffect(() => {
    const close = e => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function submit(e) {
    e.preventDefault();
    if (!q.trim()) return;
    setOpen(false);
    navigate(`/community/search?q=${encodeURIComponent(q.trim())}`);
  }
  const tabs = [
    ['/community', 'Feed', Icon.home, 0, true],
    ['/community/requests', 'Friend requests', Icon.people, counts.requests],
    ['/community/notifications', 'Notifications', Icon.bell, counts.notifications],
    ['/community/profile', 'My profile', Icon.user, 0],
  ];
  return (
    <div className="cm-topbar">
      <div className="cm-topbar-inner">
        <div className="cm-search" ref={box}>
          <form onSubmit={submit} role="search">
            <span className="cm-search-ico">{Icon.search}</span>
            <input value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Search ProjectMentor" aria-label="Search people and posts" />
          </form>
          {open && results && (
            <div className="cm-search-pop">
              {results.people.length === 0 && results.posts.length === 0 && <p className="cm-muted pad">No results for "{q}".</p>}
              {results.people.slice(0, 6).map(p => (
                <Link key={p.id} to={`/community/profile/${p.id}`} className="cm-search-item" onClick={() => setOpen(false)}>
                  <Avatar name={p.fullName} seed={p.id} size={36} photoId={p.avatarId} badge={p.badge} />
                  <span><b>{p.fullName}{p.isOfficial && <VerifiedTick size={13} />}</b><small>{p.relationship === 'Friends' ? 'Friend' : p.subtitle ?? 'Student'}</small></span>
                </Link>
              ))}
              {results.posts.length > 0 && <button type="button" className="cm-search-all" onClick={submit}>{Icon.search} See all results for "{q}"</button>}
            </div>
          )}
        </div>
        <nav className="cm-tabs" aria-label="Community">
          {tabs.map(([to, label, icon, badge, end]) => (
            <NavLink key={to} to={to} end={end} className="cm-tab" title={label} aria-label={label}>
              {icon}{badge > 0 && <span className="cm-tab-badge">{badge > 9 ? '9+' : badge}</span>}
              <span className="cm-tab-label">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="cm-topbar-me">
          {user
            ? <Link to="/community/profile" className="cm-me" aria-label="My community profile"><Avatar name={me?.fullName ?? user.fullName} seed={user.userId} size={36} photoId={me?.avatarId} badge={me?.badge} /></Link>
            : <Link to="/login" className="button button-primary button-small">Log in</Link>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- feed ---------------- */

function Feed() {
  const { token, user, me, isAuthenticated } = useCommunity();
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') ?? '';
  const view = params.get('view') ?? '';
  const focus = params.get('post');
  const [posts, setPosts] = useState([]);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(null);
  const [groups, setGroups] = useState([]);
  const [page, setPage] = useState(null);
  const [friends, setFriends] = useState(null);

  const load = useCallback(async (before = null) => {
    setLoading(true); setError('');
    try {
      if (view === 'pending') { setPosts(await getPendingPosts(token)); setNext(null); return; }
      const r = await getCommunityFeed(token, { kind, mine: view === 'mine', before });
      setPosts(p => (before ? [...p, ...r.posts] : r.posts));
      setNext(r.nextBefore);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [token, kind, view]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!focus) { setFocused(null); return; }
    getPost(token, focus).then(setFocused).catch(() => setFocused(false));
  }, [focus, token]);
  useEffect(() => {
    getOfficialPage(token).then(setPage).catch(() => {});
    if (isAuthenticated) {
      listGroups(token).then(setGroups).catch(() => {});
      getFriends(token).then(setFriends).catch(() => {});
    }
  }, [token, isAuthenticated]);

  const setFilter = (k, v) => { const n = new URLSearchParams(); if (k) n.set(k, v); setParams(n); };
  const shown = focused ? posts.filter(p => p.id !== focused.id) : posts;

  return (
    <div className="cm-layout">
      <aside className="cm-left">
        <nav className="cm-card cm-side-nav" aria-label="Feed filters">
          {user && (
            <Link to="/community/profile" className="cm-side-me">
              <Avatar name={me?.fullName ?? user.fullName} seed={user.userId} size={36} photoId={me?.avatarId} badge={me?.badge} />
              <b>{me?.fullName ?? user.fullName}</b>
            </Link>
          )}
          {FILTERS.map(([k, l]) => (
            <button key={l} type="button" className={!view && kind === k ? 'on' : ''} onClick={() => setFilter(k ? 'kind' : '', k)}>{l}</button>
          ))}
          {isAuthenticated && <>
            <button type="button" className={view === 'mine' ? 'on' : ''} onClick={() => setFilter('view', 'mine')}>My posts</button>
            <button type="button" className={view === 'pending' ? 'on' : ''} onClick={() => setFilter('view', 'pending')}>Waiting for approval</button>
            <Link to="/community/requests">Friends</Link>
          </>}
        </nav>
        {groups.length > 0 && (
          <div className="cm-card cm-side-list">
            <h3>Your groups</h3>
            <div className="cm-side-scroll">
              {groups.map(g => (
                <Link key={g.id} to={`/groups/${g.id}`} className="cm-side-item">
                  <span className="cm-group-dot" style={{ background: g.color }}>{g.name[0]?.toUpperCase()}</span><span>{g.name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </aside>

      <main className="cm-center">
        {view !== 'pending' && <Composer groups={groups} onPosted={p => { if (p.status === 'Approved') setPosts(list => [p, ...list]); }} />}
        {view === 'pending' && <div className="cm-card cm-banner">Posts you wrote that an admin has not approved yet. Rejected posts show the admin's note.</div>}
        {focused && <PostCard key={`f-${focused.id}`} post={focused} highlight onRemoved={() => setFocused(null)} onShared={p => p.status === 'Approved' && setPosts(l => [p, ...l])} />}
        {focused === false && <div className="cm-card cm-empty"><p>That post is not available any more.</p></div>}
        {shown.map(p => (
          <PostCard key={p.id} post={p} onRemoved={id => setPosts(l => l.filter(x => x.id !== id))} onShared={np => np.status === 'Approved' && setPosts(l => [np, ...l])} />
        ))}
        {error && <div className="cm-card cm-empty"><p>{error}</p></div>}
        {!loading && !error && shown.length === 0 && !focused && (
          <div className="cm-card cm-empty"><p>{view === 'pending' ? 'Nothing waiting for approval.' : 'No posts here yet.'}</p></div>
        )}
        {loading && <div className="cm-card cm-skeleton" aria-hidden="true"><span /><span /><span /></div>}
        {next && !loading && <button type="button" className="button button-quiet cm-more-btn" onClick={() => load(next)}>Show more posts</button>}
      </main>

      <aside className="cm-right">
        {page && (
          <div className="cm-card cm-page-card">
            <div className="cm-page-cover" style={page.coverId ? { backgroundImage: `url(${import.meta.env.VITE_API_URL ?? 'http://localhost:5220'}/api/uploads/${page.coverId})` } : undefined} />
            <div className="cm-page-row">
              <Avatar name={page.fullName} seed={page.id} size={48} photoId={page.avatarId} />
              <div><Link to={`/community/profile/${page.id}`} className="cm-name">{page.fullName}<VerifiedTick /></Link><small>{page.followerCount} followers</small></div>
            </div>
            <p className="cm-muted">{page.bio}</p>
            <RelationButtons profile={page} onChange={patch => setPage(x => ({ ...x, ...patch }))} />
          </div>
        )}
        {friends?.received?.length > 0 && (
          <div className="cm-card cm-side-list">
            <h3>Friend requests <Link to="/community/requests">See all</Link></h3>
            {friends.received.slice(0, 3).map(p => <RequestRow key={p.id} person={p} compact onDone={() => getFriends(token).then(setFriends)} />)}
          </div>
        )}
        {friends?.suggestions?.length > 0 && (
          <div className="cm-card cm-side-list">
            <h3>People you may know</h3>
            {friends.suggestions.slice(0, 5).map(p => <SuggestionRow key={p.id} person={p} />)}
          </div>
        )}
        <div className="cm-card cm-tips">
          <h3>Write a great post</h3>
          <p><b>Showcase:</b> a screenshot and one line on what it does.</p>
          <p><b>Question:</b> what you tried and the exact error.</p>
          <p><b>Report:</b> attach the PDF and ask for specific feedback.</p>
        </div>
      </aside>
    </div>
  );
}

function SuggestionRow({ person }) {
  const { token, guard } = useCommunity();
  const { toast } = useFeedback();
  const [rel, setRel] = useState(person.relationship);
  async function add() {
    if (!await guard('add friends')) return;
    try { setRel((await sendFriendRequest(token, person.id)).relationship); } catch (e) { toast(e.message, 'error'); }
  }
  return (
    <div className="cm-person-row">
      <Link to={`/community/profile/${person.id}`}><Avatar name={person.fullName} seed={person.id} size={40} photoId={person.avatarId} badge={person.badge} /></Link>
      <div><Link to={`/community/profile/${person.id}`} className="cm-name">{person.fullName}</Link><small>{person.mutualFriends ? `${person.mutualFriends} mutual friends` : person.subtitle ?? 'Student'}</small></div>
      {rel === 'RequestSent'
        ? <button type="button" className="button button-quiet button-small" onClick={async () => { await removeFriend(token, person.id); setRel('None'); }}>Cancel</button>
        : <button type="button" className="button button-primary button-small" onClick={add}>Add</button>}
    </div>
  );
}

function RequestRow({ person, compact = false, onDone }) {
  const { token } = useCommunity();
  const { toast } = useFeedback();
  const [state, setState] = useState('');
  const act = async (fn, label) => { try { await fn(token, person.id); setState(label); onDone?.(); } catch (e) { toast(e.message, 'error'); } };
  return (
    <div className={`cm-person-row${compact ? ' compact' : ''}`}>
      <Link to={`/community/profile/${person.id}`}><Avatar name={person.fullName} seed={person.id} size={compact ? 40 : 56} photoId={person.avatarId} badge={person.badge} /></Link>
      <div>
        <Link to={`/community/profile/${person.id}`} className="cm-name">{person.fullName}</Link>
        <small>{person.mutualFriends ? `${person.mutualFriends} mutual friends · ` : ''}{person.since && timeAgo(person.since)}</small>
        {state ? <small className="cm-done">{state}</small> : (
          <span className="cm-btn-pair">
            <button type="button" className="button button-primary button-small" onClick={() => act(acceptFriend, 'Request accepted')}>Confirm</button>
            <button type="button" className="button button-quiet button-small" onClick={() => act(declineFriend, 'Request removed')}>Delete</button>
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------------- friend requests & people ---------------- */

function FriendsView({ onChanged }) {
  const { token, isAuthenticated, guard } = useCommunity();
  const { toast } = useFeedback();
  const [tab, setTab] = useState('received');
  const [data, setData] = useState(null);
  const load = useCallback(() => getFriends(token).then(setData).catch(e => toast(e.message, 'error')), [token, toast]);
  useEffect(() => { if (isAuthenticated) load(); }, [isAuthenticated, load]);
  if (!isAuthenticated) return <div className="cm-card cm-empty"><p>Log in to see friend requests and find people.</p><button type="button" className="button button-primary" onClick={() => guard('see friend requests')}>Log in</button></div>;
  if (!data) return <div className="cm-card cm-empty"><p>Loading…</p></div>;

  const sections = [['received', `Requests (${data.received.length})`], ['sent', `Sent (${data.sent.length})`], ['friends', `Friends (${data.friends.length})`], ['people', 'People you may know']];
  const list = { received: data.received, sent: data.sent, friends: data.friends, people: data.suggestions }[tab];
  return (
    <div className="cm-friends">
      <aside className="cm-card cm-side-nav">
        <h2 className="cm-section-title">Friends</h2>
        {sections.map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </aside>
      <section className="cm-friends-main">
        {list.length === 0 && <div className="cm-card cm-empty"><p>{{ received: 'No new friend requests.', sent: 'You have no pending sent requests.', friends: 'No friends yet. Find people you know below.', people: 'No suggestions right now.' }[tab]}</p></div>}
        <div className="cm-people-cards">
          {list.map(p => (
            <div key={p.id} className="cm-card cm-person-card">
              <Link to={`/community/profile/${p.id}`} className="cm-person-photo"><Avatar name={p.fullName} seed={p.id} size={96} photoId={p.avatarId} badge={p.badge} /></Link>
              <Link to={`/community/profile/${p.id}`} className="cm-name">{p.fullName}</Link>
              <small className="cm-muted">{p.mutualFriends ? `${p.mutualFriends} mutual friends` : p.subtitle ?? 'Student'}</small>
              <PersonActions person={p} tab={tab} onDone={() => { load(); onChanged(); }} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PersonActions({ person, tab, onDone }) {
  const { token } = useCommunity();
  const { confirm, toast } = useFeedback();
  const run = async fn => { try { await fn(); onDone(); } catch (e) { toast(e.message, 'error'); } };
  if (tab === 'received') return <span className="cm-btn-col">
    <button type="button" className="button button-primary button-small" onClick={() => run(() => acceptFriend(token, person.id))}>Confirm</button>
    <button type="button" className="button button-quiet button-small" onClick={() => run(() => declineFriend(token, person.id))}>Delete</button></span>;
  if (tab === 'sent') return <button type="button" className="button button-quiet button-small" onClick={() => run(() => removeFriend(token, person.id))}>Cancel request</button>;
  if (tab === 'friends') return <span className="cm-btn-col">
    <Link className="button button-quiet button-small" to={`/community/profile/${person.id}`}>View profile</Link>
    <button type="button" className="button button-quiet button-small" onClick={async () => { if (await confirm({ title: `Unfriend ${person.fullName}?`, ok: 'Unfriend', danger: true })) run(() => removeFriend(token, person.id)); }}>Unfriend</button></span>;
  return <button type="button" className="button button-primary button-small" onClick={() => run(() => sendFriendRequest(token, person.id))}>Add friend</button>;
}

/* ---------------- community notifications ---------------- */

function NotificationsView({ onRead }) {
  const { token, isAuthenticated, guard } = useCommunity();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  useEffect(() => { if (isAuthenticated) getScopedNotifications(token, 'Community').then(setData).catch(() => setData({ items: [] })); }, [token, isAuthenticated]);
  if (!isAuthenticated) return <div className="cm-card cm-empty"><p>Log in to see your community notifications.</p><button type="button" className="button button-primary" onClick={() => guard('see notifications')}>Log in</button></div>;
  if (!data) return <div className="cm-card cm-empty"><p>Loading…</p></div>;
  const items = filter === 'unread' ? data.items.filter(n => !n.isRead) : data.items;

  async function open(n) {
    if (!n.isRead) { markNotificationRead(token, n.id).catch(() => {}); onRead(); }
    navigate(n.link || '/community');
  }
  async function readAll() {
    await markScopeRead(token, 'Community');
    setData(d => ({ ...d, items: d.items.map(i => ({ ...i, isRead: true })) }));
    onRead(true);
  }
  return (
    <section className="cm-card cm-notes">
      <div className="cm-notes-head">
        <h2>Notifications</h2>
        <button type="button" className="cm-link-btn strong" onClick={readAll}>Mark all as read</button>
      </div>
      <div className="cm-pills">
        {[['all', 'All'], ['unread', 'Unread']].map(([k, l]) => <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      {items.length === 0 && <p className="cm-muted pad">You're all caught up.</p>}
      {items.map(n => (
        <button key={n.id} type="button" className={`cm-note${n.isRead ? '' : ' unread'}`} onClick={() => open(n)}>
          <span className="cm-note-ava">
            {n.actorId ? <Avatar name={n.actorInitials ?? '?'} initials={n.actorInitials} seed={n.actorId} size={52} photoId={n.actorAvatarId} /> : <span className="cm-note-sys">{Icon.bell}</span>}
            <span className={`cm-note-kind k-${n.kind}`} aria-hidden="true" />
          </span>
          <span className="cm-note-text"><b>{n.title}</b>{n.body && <span>{n.body}</span>}<small>{timeAgo(n.createdAt)}</small></span>
          {!n.isRead && <span className="cm-dot" aria-label="Unread" />}
        </button>
      ))}
    </section>
  );
}

/* ---------------- search results ---------------- */

function SearchView() {
  const { token } = useCommunity();
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const [res, setRes] = useState(null);
  const [tab, setTab] = useState('all');
  useEffect(() => { setRes(null); communitySearch(token, q).then(setRes).catch(() => setRes({ people: [], posts: [] })); }, [q, token]);
  if (!res) return <div className="cm-card cm-empty"><p>Searching…</p></div>;
  return (
    <div className="cm-search-page">
      <div className="cm-card cm-pills big">
        <h2>Results for "{q}"</h2>
        {[['all', 'All'], ['people', `People (${res.people.length})`], ['posts', `Posts (${res.posts.length})`]].map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab !== 'posts' && res.people.length > 0 && (
        <div className="cm-card">
          <h3 className="cm-section-title">People</h3>
          {res.people.map(p => (
            <div key={p.id} className="cm-person-row">
              <Link to={`/community/profile/${p.id}`}><Avatar name={p.fullName} seed={p.id} size={56} photoId={p.avatarId} badge={p.badge} /></Link>
              <div><Link to={`/community/profile/${p.id}`} className="cm-name">{p.fullName}{p.isOfficial && <VerifiedTick />}</Link>
                <small>{p.relationship === 'Friends' ? 'Friend' : p.subtitle ?? 'Student'}{p.mutualFriends ? ` · ${p.mutualFriends} mutual` : ''}</small></div>
              {p.relationship !== 'Self' && <RelationButtons profile={{ ...p, isSelf: false, following: p.following, followerCount: 0 }} onChange={() => {}} />}
            </div>
          ))}
        </div>
      )}
      {tab !== 'people' && res.posts.map(p => <PostCard key={p.id} post={p} />)}
      {res.people.length === 0 && res.posts.length === 0 && <div className="cm-card cm-empty"><p>Nothing matches "{q}". Try a name, a project or a technology.</p></div>}
    </div>
  );
}

/* ---------------- page ---------------- */

export default function CommunityPage() {
  const { token, user, isAuthenticated } = useAuth();
  const { me } = useMe();
  const guard = useLoginGuard(isAuthenticated);
  const [counts, setCounts] = useState({ notifications: 0, requests: 0 });
  const location = useLocation();
  const refreshCounts = useCallback(() => { if (isAuthenticated) getCommunityCounts(token).then(setCounts).catch(() => {}); }, [token, isAuthenticated]);
  useEffect(() => { refreshCounts(); const t = setInterval(refreshCounts, 45000); return () => clearInterval(t); }, [refreshCounts, location.pathname]);
  const ctx = useMemo(() => ({ token, user, me, isAuthenticated, guard }), [token, user, me, isAuthenticated, guard]);

  return (
    <CommunityCtx.Provider value={ctx}>
      <div className="cm-page">
        <TopBar counts={counts} />
        {!isAuthenticated && (
          <div className="cm-guest">You are browsing as a guest. <Link to="/login" state={{ from: location.pathname + location.search }}>Log in</Link> or <Link to="/register">create an account</Link> to post, react, comment and add friends.</div>
        )}
        <div className="cm-body">
          <Routes>
            <Route index element={<Feed />} />
            <Route path="requests" element={<FriendsView onChanged={refreshCounts} />} />
            <Route path="notifications" element={<NotificationsView onRead={all => setCounts(c => ({ ...c, notifications: all ? 0 : Math.max(0, c.notifications - 1) }))} />} />
            <Route path="search" element={<SearchView />} />
            <Route path="profile" element={<ProfileView selfId={user?.userId} />} />
            <Route path="profile/:id" element={<ProfileView />} />
            <Route path="*" element={<Feed />} />
          </Routes>
        </div>
      </div>
    </CommunityCtx.Provider>
  );
}

// Re-exported for other pages that show a single post.
export { useCommunity };

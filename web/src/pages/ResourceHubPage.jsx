import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getResourceFacets, searchResources, toggleBookmark } from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';
import { useFeedback } from '../ui/feedback';
import '../styles/resources.css';

// Short descriptions shown on the topic chips so students know where to look.
const TOPIC_INFO = {
  Planning: 'Ideas, objectives, requirements and timelines',
  Design: 'UML, ER diagrams, architecture and UI/UX',
  'Build: Frontend': 'HTML, CSS, JavaScript and React',
  'Build: Backend': 'APIs, servers, security and login',
  'Build: Databases': 'SQL, PostgreSQL, Firebase and NoSQL',
  'Build: Mobile': 'Flutter, Android and React Native',
  'Build: AI & APIs': 'AI models, data science and API tools',
  Testing: 'Unit, integration and end-to-end tests',
  'Version control': 'Git, GitHub and teamwork',
  Documentation: 'Technical writing, references and READMEs',
  Presentation: 'Slides, speaking and your viva',
  Deployment: 'Hosting, Docker and CI/CD',
};
const TYPE_ICON = {
  Video: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 9l5 3-5 3z" fill="currentColor" /></svg>,
  Course: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 9l10-5 10 5-10 5z" /><path d="M6 11v5c3 2 9 2 12 0v-5" /></svg>,
  Article: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>,
  Documentation: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z" /><path d="M8 7h6M8 11h6" /></svg>,
};
const BookmarkIcon = ({ on }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z" /></svg>
);

function ResourceCard({ r, onBookmark }) {
  const host = (() => { try { return new URL(r.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  return (
    <article className={`rs-card${r.isFree ? '' : ' paid'}`}>
      <div className="rs-card-top">
        <span className={`rs-type t-${r.resourceType}`}>{TYPE_ICON[r.resourceType]}{r.resourceType}</span>
        <span className={`rs-price${r.isFree ? '' : ' paid'}`}>{r.isFree ? 'Free' : 'Paid'}</span>
        <button type="button" className={`rs-bm${r.bookmarked ? ' on' : ''}`} onClick={() => onBookmark(r)} aria-pressed={r.bookmarked} title={r.bookmarked ? 'Remove bookmark' : 'Save for later'}>
          <BookmarkIcon on={r.bookmarked} />
        </button>
      </div>
      <h3><a href={r.url} target="_blank" rel="noreferrer noopener">{r.title}</a></h3>
      <p className="rs-provider">{r.provider ?? host}</p>
      {r.description && <p className="rs-desc">{r.description}</p>}
      {r.linkedMilestones?.length > 0 && (
        <p className="rs-linked" title={r.linkedMilestones.join(', ')}>In your roadmap: {r.linkedMilestones.slice(0, 2).join(', ')}{r.linkedMilestones.length > 2 ? ` +${r.linkedMilestones.length - 2}` : ''}</p>
      )}
      <div className="rs-meta">
        <span className={`rs-level l-${r.level}`}>{r.level}</span>
        {r.duration && <span>{r.duration}</span>}
        {!r.isFree && r.price && <span className="rs-cost">{r.price}</span>}
      </div>
      {r.tags?.length > 0 && <div className="rs-tags">{r.tags.slice(0, 4).map(t => <span key={t}>#{t}</span>)}</div>}
      <a className="rs-open" href={r.url} target="_blank" rel="noreferrer noopener">{r.isFree ? 'Open resource' : 'View course'} <span aria-hidden="true">↗</span></a>
    </article>
  );
}

export default function ResourceHubPage() {
  const { token, isAuthenticated } = useAuth();
  const { toast, confirm } = useFeedback();
  const navigate = useNavigate();
  const location = useLocation();
  const [facets, setFacets] = useState(null);
  const [filters, setFilters] = useState({ search: '', topic: '', type: '', level: '', price: '', bookmarked: false, linked: false, sortBy: 'featured' });
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [paid, setPaid] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => { getResourceFacets(token).then(setFacets).catch(() => {}); }, [token]);
  useEffect(() => { searchResources(token, { price: 'paid', pageSize: 12, sortBy: 'title' }).then(r => setPaid(r.items)).catch(() => {}); }, [token]);
  useEffect(() => { const t = setTimeout(() => setFilters(f => ({ ...f, search: query })), 300); return () => clearTimeout(t); }, [query]);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const r = await searchResources(token, { ...filters, price: filters.price || (filters.topic || filters.search || filters.bookmarked || filters.linked ? '' : 'free'), page: p, pageSize: 18 });
      setItems(list => (p === 1 ? r.items : [...list, ...r.items]));
      setTotal(r.totalItems); setPage(p);
    } catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [token, filters, toast]);
  useEffect(() => { load(1); }, [load]);

  const set = (k, v) => setFilters(f => ({ ...f, [k]: f[k] === v ? (typeof v === 'boolean' ? false : '') : v }));
  async function needLogin(what) {
    if (isAuthenticated) return true;
    if (await confirm({ title: 'Log in first', message: `Log in to ${what}. Browsing the library is free for everyone.`, ok: 'Log in', cancel: 'Not now' }))
      navigate('/login', { state: { from: location.pathname } });
    return false;
  }
  async function bookmark(r) {
    if (!await needLogin('save resources')) return;
    try {
      const { bookmarked } = await toggleBookmark(token, r.id);
      setItems(list => list.map(x => (x.id === r.id ? { ...x, bookmarked } : x)));
      setPaid(list => list.map(x => (x.id === r.id ? { ...x, bookmarked } : x)));
      toast(bookmarked ? 'Saved to your bookmarks.' : 'Removed from bookmarks.');
    } catch (e) { toast(e.message, 'error'); }
  }
  const topics = useMemo(() => (facets?.topics ?? []).filter(t => TOPIC_INFO[t] || t), [facets]);
  const anyFilter = filters.topic || filters.type || filters.level || filters.price || filters.bookmarked || filters.linked || filters.search;

  return (
    <main className="rs">
      <section className="rs-hero">
        <div className="rs-hero-inner">
          <p className="eyebrow">Resources</p>
          <h1>The best places to learn what your project needs.</h1>
          <p className="page-lede">A hand-picked library of tutorials, documentation and courses for every part of a software project, from planning to deployment. Most are completely free.</p>
          <div className="rs-stats">
            <span><b>{facets?.total ?? '–'}</b> resources</span>
            <span><b>{facets?.free ?? '–'}</b> free</span>
            <span><b>{topics.length}</b> topics</span>
            {isAuthenticated && <span>Resources linked to your roadmap are marked</span>}
          </div>
          <div className="rs-search">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></svg>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search: React, ER diagram, testing, Flutter…" aria-label="Search resources" />
          </div>
          <p className="rs-learn-link">Looking for lessons on writing reports, diagrams or presenting? Those are in <Link to="/learn">Learn</Link>.</p>
        </div>
      </section>

      <div className="rs-body">
        <aside className="rs-filters" aria-label="Filters">
          <div className="rs-filter-group">
            <h3>Show</h3>
            <button type="button" className={`rs-chip${filters.bookmarked ? ' on' : ''}`} onClick={async () => { if (await needLogin('see your bookmarks')) set('bookmarked', true); }}>My bookmarks</button>
            <button type="button" className={`rs-chip${filters.linked ? ' on' : ''}`} onClick={async () => { if (await needLogin('see resources linked to your roadmap')) set('linked', true); }}>Linked to my roadmap</button>
          </div>
          <div className="rs-filter-group">
            <h3>Price</h3>
            {[['free', 'Free'], ['paid', 'Paid courses']].map(([v, l]) => <button key={v} type="button" className={`rs-chip${filters.price === v ? ' on' : ''}`} onClick={() => set('price', v)}>{l}</button>)}
          </div>
          <div className="rs-filter-group">
            <h3>Level</h3>
            {(facets?.levels ?? ['Beginner', 'Intermediate', 'Advanced']).map(l => <button key={l} type="button" className={`rs-chip${filters.level === l ? ' on' : ''}`} onClick={() => set('level', l)}>{l}</button>)}
          </div>
          <div className="rs-filter-group">
            <h3>Type</h3>
            {(facets?.types ?? []).map(t => <button key={t} type="button" className={`rs-chip${filters.type === t ? ' on' : ''}`} onClick={() => set('type', t)}>{t}</button>)}
          </div>
          {anyFilter && <button type="button" className="rs-clear" onClick={() => { setQuery(''); setFilters(f => ({ ...f, search: '', topic: '', type: '', level: '', price: '', bookmarked: false, linked: false })); }}>Clear all filters</button>}
        </aside>

        <div className="rs-main">
          <div className="rs-topics" role="tablist" aria-label="Topics">
            <button type="button" role="tab" aria-selected={!filters.topic} className={`rs-topic${!filters.topic ? ' on' : ''}`} onClick={() => setFilters(f => ({ ...f, topic: '' }))}>
              <b>Recommended</b><small>Free picks for every stage</small>
            </button>
            {topics.map(t => (
              <button key={t} type="button" role="tab" aria-selected={filters.topic === t} className={`rs-topic${filters.topic === t ? ' on' : ''}`} onClick={() => set('topic', t)}>
                <b>{t.replace('Build: ', '')}</b><small>{TOPIC_INFO[t] ?? 'Resources'}</small>
              </button>
            ))}
          </div>

          <div className="rs-result-head">
            <h2>{filters.bookmarked ? 'Your bookmarks' : filters.linked ? 'Linked to your roadmap' : filters.topic || (filters.search ? `Results for "${filters.search}"` : 'Recommended free resources')}</h2>
            <span className="rs-count">{total} result{total === 1 ? '' : 's'}</span>
            <select value={filters.sortBy} onChange={e => setFilters(f => ({ ...f, sortBy: e.target.value }))} aria-label="Sort by">
              <option value="featured">Best for beginners</option>
              <option value="title">A to Z</option>
              <option value="level">Level</option>
              <option value="createdat">Newest</option>
            </select>
          </div>

          {!loading && items.length === 0 && <div className="rs-empty"><p>No resources match these filters.</p></div>}
          <div className="rs-grid">{items.map(r => <ResourceCard key={r.id} r={r} onBookmark={bookmark} />)}</div>
          {loading && <p className="rs-loading">Loading…</p>}
          {!loading && items.length < total && <button type="button" className="button button-quiet rs-more" onClick={() => load(page + 1)}>Show more</button>}

          {!anyFilter && paid.length > 0 && (
            <section className="rs-paid" aria-labelledby="rs-paid-title">
              <div className="rs-paid-head">
                <h2 id="rs-paid-title">Paid online courses</h2>
                <p>Want a structured course with a certificate? These are popular, well-reviewed options. Prices change often, so check the course page. Many offer free trials, free auditing or financial aid for students.</p>
              </div>
              <div className="rs-grid">{paid.map(r => <ResourceCard key={r.id} r={r} onBookmark={bookmark} />)}</div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

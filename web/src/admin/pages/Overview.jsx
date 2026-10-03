import { Link } from 'react-router-dom';
import { admin } from '../adminApi';
import { ErrorBox, Icon, Loading, PageHead, formatDate, useAsync } from '../ui';

export default function Overview() {
  const { data: s, error, loading, reload } = useAsync(() => admin.stats(), []);

  if (loading && !s) return <><PageHead title="Overview" /><Loading /></>;
  if (error) return <><PageHead title="Overview" /><ErrorBox error={error} onRetry={reload} /></>;

  const cards = [
    ['Waiting for review', s.pendingPosts, 'community posts', '/admin/community', s.pendingPosts > 0],
    ['Students', s.students, `${s.admins} admin${s.admins === 1 ? '' : 's'}, ${s.inactiveUsers} inactive`, '/admin/users'],
    ['Roadmaps', s.roadmaps, 'created by students', '/admin/users'],
    ['Project groups', s.groups, 'private team spaces', '/admin/groups'],
    ['Community posts', s.posts, 'all statuses', '/admin/community'],
    ['Mock vivas', s.vivas, 'practice sessions', null],
    ['Lessons', s.lessons, 'in all tracks', '/admin/lessons'],
    ['Videos', s.videos, 'in the library', '/admin/videos'],
    ['Templates', s.templates, `${s.examples} example files`, '/admin/files'],
    ['Resources', s.resources, 'in the Resource Hub', '/admin/resources'],
    ['Home page items', s.siteEntries, 'features, steps, FAQ', '/admin/site'],
  ];

  return (
    <>
      <PageHead title="Overview" sub="Everything students see on the website and in the mobile app is managed from this console." />
      <div className="adm-note">
        <Icon name="globe" />
        <span>The website and the mobile app read from the same database. Anything you add, edit, hide or delete here changes both straight away.</span>
      </div>

      <div className="adm-stats">
        {cards.map(([label, value, sub, to, alert]) => {
          const body = <><small>{label}</small><strong>{value}</strong><span>{sub}</span></>;
          return to
            ? <Link key={label} to={to} className={`adm-card adm-stat${alert ? ' alert' : ''}`}>{body}</Link>
            : <div key={label} className="adm-card adm-stat">{body}</div>;
        })}
      </div>

      <div className="adm-grid-2">
        <section className="adm-card">
          <div className="adm-card-head">
            <div><h2>Newest users</h2><p>The latest accounts on the website and the app.</p></div>
            <Link className="adm-btn sm" to="/admin/users">All users</Link>
          </div>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Name</th><th>Role</th><th className="hide-sm">Joined</th></tr></thead>
              <tbody>
                {s.newestUsers.map(u => (
                  <tr key={u.id}>
                    <td className="t-main"><strong>{u.fullName}</strong><small>{u.email}</small></td>
                    <td><span className={`adm-pill ${u.role === 'Admin' ? 'dark' : ''}`}>{u.role}</span>{!u.isActive && <> <span className="adm-pill bad">Inactive</span></>}</td>
                    <td className="hide-sm">{formatDate(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="adm-card">
          <div className="adm-card-head"><div><h2>Quick actions</h2></div></div>
          <div className="adm-quick">
            <Link to="/admin/community"><Icon name="community" /><span>Review community posts<small>{s.pendingPosts} waiting</small></span></Link>
            <Link to="/admin/lessons/new"><Icon name="lessons" /><span>Write a new lesson<small>Shown on Learn in the website and app</small></span></Link>
            <Link to="/admin/videos"><Icon name="videos" /><span>Add a YouTube video<small>Paste a link, the title fills itself</small></span></Link>
            <Link to="/admin/files"><Icon name="files" /><span>Upload a template<small>Word, Excel, PowerPoint, PDF or text</small></span></Link>
            <Link to="/admin/site"><Icon name="globe" /><span>Edit the home page<small>Features, steps, AI agents and FAQ</small></span></Link>
          </div>
        </section>
      </div>
    </>
  );
}

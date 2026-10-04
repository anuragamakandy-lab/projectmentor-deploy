import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Avatar, { BADGES } from '../../components/Avatar';
import { admin } from '../adminApi';
import { useAdminSession } from '../adminSession';
import { Empty, ErrorBox, Icon, Loading, Modal, PageHead, formatDate, timeAgo, useAsync, useFeedback } from '../ui';

const BADGE_NAMES = Object.keys(BADGES);

/**
 * Users: admins can see each student's usage and activity, award a badge and (de)activate the account.
 * Names, years, passwords and deleting an account belong to the student (on their profile page).
 */
export default function Users() {
  const me = useAdminSession()?.user;
  const { toast, confirm, prompt } = useFeedback();
  const [params, setParams] = useSearchParams();
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [badge, setBadge] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const list = useAsync(() => admin.users({ q: query, role, status, badge }), [query, role, status, badge]);
  const openId = params.get('open');

  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  async function toggleActive(u) {
    let reason = null;
    if (u.isActive) {
      // A reason is required: it is emailed to the student and shown when they try to sign in.
      for (;;) {
        reason = await prompt({ title: `Deactivate ${u.fullName}?`, message: 'They are signed out straight away on the website and the app, and their community profile and posts are hidden. Write the reason (required): it is emailed to them and shown when they try to sign in.', placeholder: 'e.g. Repeated spam posts in the community', ok: 'Deactivate', danger: true });
        if (reason === null) return;
        if (reason.trim()) break;
        toast('Please write a reason. It is emailed to the student.', 'error');
      }
    } else if (!await confirm({ title: `Activate ${u.fullName}?`, message: 'They can sign in again and their profile and posts come back. They get an email.', ok: 'Activate' })) return;
    try { await admin.updateUser(u.id, { isActive: !u.isActive, reason: reason?.trim() || null }); toast(u.isActive ? 'Account deactivated. The student was emailed the reason.' : 'Account activated and the student was emailed.'); list.reload(); }
    catch (e) { toast(e.message, 'error'); }
  }

  const open = id => setParams(id ? { open: id } : {});

  return (
    <>
      <PageHead title="Users" sub="See how each student uses ProjectMentor, award badges and activate or deactivate accounts. Students edit their own details." />
      <section className="adm-card">
        <div className="adm-toolbar">
          <div className="adm-search"><Icon name="search" /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or email" aria-label="Search users" /></div>
          <select value={role} onChange={e => setRole(e.target.value)} style={{ width: 'auto' }} aria-label="Role">
            <option value="">All roles</option><option value="Student">Students</option><option value="Admin">Admins</option>
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} style={{ width: 'auto' }} aria-label="Status">
            <option value="">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option>
          </select>
          <select value={badge} onChange={e => setBadge(e.target.value)} style={{ width: 'auto' }} aria-label="Badge">
            <option value="">Any badge</option><option value="none">No badge</option>
            {BADGE_NAMES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <span style={{ color: 'var(--a-faint)', fontSize: 13 }}>{list.data?.length ?? 0} users</span>
        </div>
        {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
        {list.loading && !list.data && <Loading />}
        {list.data?.length === 0 && <Empty title="No users found" text="Try another search or filter." />}
        {list.data?.length > 0 && (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Name</th><th>Role</th><th className="hide-sm">Badge</th><th className="hide-sm num">Roadmaps</th><th className="hide-sm num">Posts</th><th className="hide-sm">Last active</th><th>Status</th><th /></tr></thead>
              <tbody>
                {list.data.map(u => {
                  const self = u.id === me?.userId;
                  return (
                    <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => open(u.id)}>
                      <td>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <Avatar name={u.fullName} seed={u.id} size={34} photoId={u.avatarId} badge={u.badge} title="" />
                          <div className="t-main"><strong>{u.fullName}{self && ' (you)'}</strong><small>{u.email}</small></div>
                        </div>
                      </td>
                      <td><span className={`adm-pill ${u.role === 'Admin' ? 'dark' : ''}`}>{u.role}</span></td>
                      <td className="hide-sm">{u.badge ? <span className="adm-pill" style={{ background: '#fff', border: `1.5px solid ${BADGES[u.badge].color}`, color: BADGES[u.badge].color }}>{u.badge}</span> : '—'}</td>
                      <td className="hide-sm num">{u.roadmaps}</td>
                      <td className="hide-sm num">{u.posts}</td>
                      <td className="hide-sm">{u.lastActiveAt ? timeAgo(u.lastActiveAt) : '—'}</td>
                      <td><span className={`adm-pill ${u.isActive ? 'ok' : 'bad'}`}>{u.isActive ? 'Active' : 'Inactive'}</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="adm-row-actions">
                          <button type="button" className="adm-btn sm ghost" onClick={() => open(u.id)}>View usage</button>
                          {!self && <button type="button" className={`adm-btn sm ${u.isActive ? 'danger' : 'ok'}`} onClick={() => toggleActive(u)}>{u.isActive ? 'Deactivate' : 'Activate'}</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {openId && <UserDetail id={openId} self={openId === me?.userId} onClose={() => open(null)} onChanged={list.reload} onToggle={toggleActive} />}
    </>
  );
}

function UserDetail({ id, self, onClose, onChanged, onToggle }) {
  const { toast } = useFeedback();
  const detail = useAsync(() => admin.userDetail(id), [id]);
  const d = detail.data;

  async function award(b) {
    try {
      await admin.setBadge(id, b || null);
      toast(b ? `${b} badge awarded. The student has been notified.` : 'Badge removed.');
      detail.reload();
      onChanged();
    } catch (e) { toast(e.message, 'error'); }
  }

  return (
    <Modal title="Student usage" onClose={onClose} size="lg">
      {detail.loading && !d && <Loading />}
      {detail.error && <ErrorBox error={detail.error} onRetry={detail.reload} />}
      {d && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <Avatar name={d.user.fullName} seed={d.user.id} size={72} photoId={d.avatarId} badge={d.badge} title="" />
            <div style={{ flex: 1, minWidth: 200 }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{d.user.fullName}</h3>
              <p style={{ margin: '2px 0', color: 'var(--a-soft)' }}>{d.user.email} · {d.user.role}{d.user.yearOfStudy ? ` · Year ${d.user.yearOfStudy}` : ''}</p>
              <p style={{ margin: 0, color: 'var(--a-faint)', fontSize: 13 }}>Joined {formatDate(d.user.createdAt)} · last active {d.lastActiveAt ? timeAgo(d.lastActiveAt) : 'never'}</p>
              {d.bio && <p style={{ margin: '8px 0 0' }}>{d.bio}</p>}
            </div>
            {!self && <button type="button" className={`adm-btn sm ${d.user.isActive ? 'danger' : 'ok'}`} onClick={async () => { await onToggle(d.user); detail.reload(); }}>{d.user.isActive ? 'Deactivate' : 'Activate'}</button>}
          </div>

          <div className="adm-card adm-card-pad" style={{ display: 'grid', gap: 10 }}>
            <strong>Badge</strong>
            <p style={{ margin: 0, color: 'var(--a-soft)', fontSize: 13 }}>
              Usage score <b>{d.usage.score}</b>. {d.usage.suggestedBadge ? <>Suggested badge: <b>{d.usage.suggestedBadge}</b>.</> : 'Not enough activity for a badge yet.'} The badge frames their picture on their profile and in the community.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {BADGE_NAMES.map(b => (
                <button key={b} type="button" className="adm-btn sm" onClick={() => award(b)}
                  style={d.badge === b ? { background: BADGES[b].color, borderColor: BADGES[b].color, color: '#fff' } : { borderColor: BADGES[b].color, color: BADGES[b].color }}>
                  {b}{d.usage.suggestedBadge === b ? ' (suggested)' : ''}
                </button>
              ))}
              {d.badge && <button type="button" className="adm-btn sm ghost" onClick={() => award(null)}>Remove badge</button>}
            </div>
          </div>

          <div className="adm-stats" style={{ marginBottom: 0 }}>
            {[['Roadmaps', d.usage.stats.roadmaps], ['Progress', `${d.usage.stats.progressPercent}%`], ['Milestones done', `${d.usage.stats.milestonesDone}/${d.usage.stats.milestones}`],
              ['Mock vivas', d.usage.stats.vivasCompleted], ['Average viva', d.usage.stats.averageVivaScore != null ? `${d.usage.stats.averageVivaScore}%` : '—'],
              ['Posts', d.usage.stats.posts], ['Comments', d.usage.stats.comments], ['Reactions received', d.usage.stats.reactionsReceived],
              ['Groups', d.usage.stats.groups], ['Tasks finished', d.usage.stats.tasksDone], ['Chat messages', d.usage.stats.messages]].map(([l, v]) => (
              <div key={l} className="adm-card adm-stat"><small>{l}</small><strong style={{ fontSize: '1.3rem' }}>{v}</strong></div>
            ))}
          </div>

          <div>
            <strong>Activity</strong>
            {d.usage.activity.length === 0 && <p style={{ color: 'var(--a-faint)' }}>No activity yet.</p>}
            <ul className="adm-list">
              {d.usage.activity.map((a, i) => (
                <li key={i}><span className="adm-pill">{a.kind}</span><div className="grow"><strong style={{ fontWeight: 600 }}>{a.text}</strong></div><small style={{ color: 'var(--a-faint)' }}>{timeAgo(a.at)}</small></li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { admin } from '../adminApi';
import { Empty, ErrorBox, Icon, Loading, Modal, PageHead, formatDate, timeAgo, useAsync, useFeedback } from '../ui';

/** Project groups: admins can view groups and members, and delete a group. Editing a group is the students' right. */
export default function Groups() {
  const { toast, confirm } = useFeedback();
  const [q, setQ] = useState(new URLSearchParams(window.location.search).get('q') ?? '');
  const [query, setQuery] = useState('');
  const list = useAsync(() => admin.groups(query), [query]);
  const [membersOf, setMembersOf] = useState(null);

  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  async function remove(g) {
    if (!await confirm({ title: `Delete "${g.name}"?`, message: `This removes the group for all ${g.members} members, with its board (${g.tasks} tasks), chat (${g.messages} messages) and invite links. This cannot be undone.`, ok: 'Delete group', danger: true })) return;
    try { await admin.deleteGroup(g.id); toast('Group deleted.'); list.reload(); }
    catch (e) { toast(e.message, 'error'); }
  }

  return (
    <>
      <PageHead title="Project groups" sub="Private team spaces created by students. You can view members and delete a group (for example spam or abuse). Students manage their own groups; chats stay private to members." />
      <section className="adm-card">
        <div className="adm-toolbar">
          <div className="adm-search"><Icon name="search" /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search group name" aria-label="Search groups" /></div>
        </div>
        {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
        {list.loading && !list.data && <Loading />}
        {list.data?.length === 0 && <Empty title="No groups yet" text="Groups appear here when students create them." />}
        {list.data?.length > 0 && (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Group</th><th className="hide-sm">Owner</th><th className="num">Members</th><th className="hide-sm num">Tasks</th><th className="hide-sm num">Messages</th><th className="hide-sm">Created</th><th /></tr></thead>
              <tbody>
                {list.data.map(g => (
                  <tr key={g.id}>
                    <td className="t-main"><strong>{g.name}</strong><small>{g.roadmapTitle ? `Roadmap: ${g.roadmapTitle}` : 'No roadmap linked'}</small></td>
                    <td className="hide-sm t-main"><strong>{g.ownerName}</strong><small>{g.ownerEmail}</small></td>
                    <td className="num">{g.members}</td>
                    <td className="hide-sm num">{g.tasks}</td>
                    <td className="hide-sm num">{g.messages}</td>
                    <td className="hide-sm">{formatDate(g.createdAt)}</td>
                    <td>
                      <div className="adm-row-actions">
                        <button type="button" className="adm-btn sm ghost" onClick={() => setMembersOf(g)}>Members</button>
                        <button type="button" className="adm-icon-btn danger" onClick={() => remove(g)} aria-label={`Delete ${g.name}`}><Icon name="trash" size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {membersOf && <Members group={membersOf} onClose={() => { setMembersOf(null); list.reload(); }} />}
    </>
  );
}

function Members({ group, onClose }) {
  const list = useAsync(() => admin.groupMembers(group.id), [group.id]);

  return (
    <Modal title={`Members of ${group.name}`} onClose={onClose}>
      {list.loading && !list.data && <Loading />}
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
      <ul className="adm-list">
        {list.data?.map(m => (
          <li key={m.userId}>
            <div className="grow"><strong>{m.fullName}</strong><small>{m.email} · joined {timeAgo(m.joinedAt)}</small></div>
            <span className={`adm-pill ${m.role === 'Owner' ? 'dark' : ''}`}>{m.role}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

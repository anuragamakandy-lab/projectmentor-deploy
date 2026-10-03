import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  createTask, deleteGroup, deleteTask, generateTasks, getBoard, getGroup, leaveGroup, listRoadmapRequests,
  removeGroupMember, updateGroup, updateTask,
} from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';
import { AvatarStack } from '../components/Avatar';
import DeadlineCalendar from '../components/DeadlineCalendar';
import SprintBoard, { TaskDialog } from '../components/group/SprintBoard';
import { GroupChat, InviteDialog, TeamPanel, ThisWeek } from '../components/group/GroupPanels';
import '../styles/groups.css';
import '../styles/board.css';
import { useFeedback } from '../ui/feedback';

const TABS = [['board', '', 'Board'], ['week', '', 'This week'], ['chat', '', 'Chat'], ['roadmap', '', 'Roadmap'], ['team', '', 'Team']];

export default function GroupWorkspacePage() {
  const { confirm } = useFeedback();
  const { id } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const me = user?.userId;

  const [group, setGroup] = useState(null);
  const [board, setBoard] = useState(null);
  const [tab, setTab] = useState(() => (TABS.some(t => t[0] === params.get('tab')) ? params.get('tab') : 'board'));
  const [dialog, setDialog] = useState(null);       // task being edited / created
  const [inviting, setInviting] = useState(params.get('invite') === '1');
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState(params.get('welcome') === '1' ? 'Welcome to the group! Say hi in the chat.' : '');
  const [error, setError] = useState('');
  const [roadmaps, setRoadmaps] = useState([]);
  const [pickRoadmap, setPickRoadmap] = useState('');

  const flash = useCallback(msg => { setToast(msg); }, []);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(''), 4000); return () => clearTimeout(t); }, [toast]);

  const load = useCallback(async () => {
    try {
      const [g, b] = await Promise.all([getGroup(token, id), getBoard(token, id)]);
      setGroup(g); setBoard(b);
    } catch (e) { setError(e.status === 404 ? 'not-found' : e.message); }
  }, [token, id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (params.get('invite') || params.get('welcome')) { params.delete('invite'); params.delete('welcome'); setParams(params, { replace: true }); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pick up teammates' board changes while you work.
  useEffect(() => {
    if (tab !== 'board' && tab !== 'week') return undefined;
    const t = setInterval(() => { if (!dialog && document.visibilityState === 'visible') getBoard(token, id).then(setBoard).catch(() => {}); }, 20000);
    return () => clearInterval(t);
  }, [tab, dialog, token, id]);

  useEffect(() => {
    if (group?.myRole === 'Owner') listRoadmapRequests(token).then(r => setRoadmaps((r ?? []).filter(x => x.roadmapStatus === 'Accepted'))).catch(() => {});
  }, [group?.myRole, token]);

  function switchTab(t) {
    setTab(t);
    if (t === 'chat') setUnread(0);
    params.set('tab', t); setParams(params, { replace: true });
  }

  async function run(promise, okMsg) {
    setBusy(true); setError('');
    try {
      const b = await promise;
      if (b) setBoard(b);
      if (okMsg) flash(okMsg);
      return true;
    } catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  }

  function move(task, status, sortOrder) {
    // Optimistic: move the card at once, then sync with the server's ordering.
    setBoard(b => ({ ...b, tasks: b.tasks.map(t => (t.id === task.id ? { ...t, status, sortOrder: sortOrder ?? 9999 } : t)) }));
    run(updateTask(token, id, task.id, { status, sortOrder }), status === 'Done' && task.status !== 'Done' ? 'Nice work — task done!' : null)
      .then(() => getGroup(token, id).then(setGroup).catch(() => {}));
  }

  async function save(payload) {
    const ok = await run(dialog.id ? updateTask(token, id, dialog.id, payload) : createTask(token, id, payload), dialog.id ? 'Task saved' : 'Task added');
    if (ok) { setDialog(null); getGroup(token, id).then(setGroup).catch(() => {}); }
  }

  async function remove(task) {
    if (await run(deleteTask(token, id, task.id), 'Task deleted')) setDialog(null);
  }

  async function generate(milestoneId) {
    setGenerating(true); setError('');
    try {
      const r = await generateTasks(token, id, { milestoneId, assignEvenly: true });
      setBoard(r.board);
      flash(r.created ? `Planned ${r.created} tasks${r.source === 'AI' ? ' with AI' : ' from templates (AI was busy)'} and shared them across the team.` : 'Every milestone already has tasks.');
    } catch (e) { setError(e.message); }
    finally { setGenerating(false); }
  }

  async function linkRoadmap(clear = false) {
    setBusy(true); setError('');
    try {
      const g = await updateGroup(token, id, clear ? { clearRoadmap: true } : { roadmapRequestId: pickRoadmap });
      setGroup(g); setPickRoadmap('');
      setBoard(await getBoard(token, id));
      flash(clear ? 'Roadmap unlinked' : 'Roadmap linked — now plan your sprint on the Board.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function rename(body) {
    try { setGroup(await updateGroup(token, id, body)); flash('Group updated'); } catch (e) { setError(e.message); }
  }
  async function removeMember(m) {
    if (!await confirm({ title: `Remove ${m.fullName}?`, message: 'Their unfinished tasks become unassigned.', ok: 'Remove', danger: true })) return;
    try { await removeGroupMember(token, id, m.userId); await load(); flash(`${m.fullName} was removed`); } catch (e) { setError(e.message); }
  }
  async function leave() {
    if (!await confirm({ title: 'Leave this group?', message: 'You can only come back with a new invite link.', ok: 'Leave group', danger: true })) return;
    try { await leaveGroup(token, id); navigate('/groups'); } catch (e) { setError(e.message); }
  }
  async function destroy() {
    if (window.prompt(`This deletes the group, its board and chat for everyone.\nType the group name to confirm:\n${group.name}`) !== group.name) return;
    try { await deleteGroup(token, id); navigate('/groups'); } catch (e) { setError(e.message); }
  }

  function toggleDone(t) { move(t, t.status === 'Done' ? 'Todo' : 'Done', null); }
  // Quick assign from a card: give a task to any team member (or nobody).
  function assign(task, userId) {
    const m = board.members.find(x => x.userId === userId);
    run(updateTask(token, id, task.id, userId ? { assigneeId: userId } : { clearAssignee: true }), userId ? `Assigned to ${m?.fullName ?? 'a teammate'}` : 'Task unassigned');
  }

  if (error === 'not-found') {
    return (
      <main className="grp grp-wrap">
        <div className="grp-empty"><span aria-hidden="true"></span><strong>Group not found</strong><p>It may have been deleted, or you are not a member.</p><Link className="button button-quiet" to="/groups">← My groups</Link></div>
      </main>
    );
  }
  if (!group || !board) return <main className="grp grp-wrap"><p className="note">{error || 'Loading your group…'}</p></main>;

  const isOwner = group.myRole === 'Owner';
  const doneTasks = board.tasks.filter(t => t.status === 'Done').length;
  const pct = board.tasks.length ? Math.round((doneTasks / board.tasks.length) * 100) : 0;

  return (
    <main className="grp ws" style={{ '--g': group.color }}>
      <header className="ws-head">
        <div className="ws-head-inner">
          <Link to="/groups" className="ws-back" aria-label="Back to my groups">←</Link>
          <span className="grp-badge" aria-hidden="true">{group.name.slice(0, 1).toUpperCase()}</span>
          <div className="ws-title">
            <h1>{group.name}</h1>
            <p>{group.roadmapTitle ? <>{group.roadmapTitle}</> : 'No roadmap linked'}{board.tasks.length > 0 && <> · <b>{pct}%</b> of tasks done</>}</p>
          </div>
          <div className="ws-people">
            <AvatarStack people={group.members} max={5} size={32} />
            <button type="button" className="button button-gold button-small" onClick={() => setInviting(true)}>+ Invite</button>
          </div>
        </div>
        <nav className="ws-tabs" role="tablist" aria-label="Group sections">
          {TABS.map(([key, icon, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={`ws-tab${tab === key ? ' on' : ''}`} onClick={() => switchTab(key)}>
              <span aria-hidden="true">{icon}</span>{label}
              {key === 'chat' && unread > 0 && <span className="ws-unread" aria-label={`${unread} new messages`}>{unread}</span>}
            </button>
          ))}
        </nav>
      </header>

      <div className="ws-body">
        {error && <p className="error-message" role="alert">{error}</p>}

        {tab === 'board' && (
          <SprintBoard board={board} me={me} onMove={move} onAssign={assign} onOpen={t => setDialog(t)} onNew={() => setDialog({ status: 'Todo' })}
            onGenerate={generate} generating={generating} hasRoadmap={Boolean(group.roadmapRequestId)} />
        )}
        {tab === 'week' && <ThisWeek board={board} me={me} onToggleDone={toggleDone} onOpen={t => setDialog(t)} />}

        {/* Chat stays mounted so new messages are counted while you are on other tabs. */}
        <div hidden={tab !== 'chat'}>
          <GroupChat token={token} groupId={id} me={me} active={tab === 'chat'} onUnread={n => setUnread(u => u + n)} />
        </div>

        {tab === 'roadmap' && (
          <div className="ws-roadmap">
            {isOwner && (
              <div className="ws-link-road">
                <span>Shared roadmap:</span>
                <select value={pickRoadmap} onChange={e => setPickRoadmap(e.target.value)} aria-label="Choose a roadmap to share">
                  <option value="">{group.roadmapTitle ? `Change from “${group.roadmapTitle}”…` : 'Choose one of your roadmaps…'}</option>
                  {roadmaps.filter(r => r.id !== group.roadmapRequestId).map(r => <option key={r.id} value={r.id}>{r.displayTitle}</option>)}
                </select>
                <button type="button" className="button button-emerald button-small" disabled={!pickRoadmap || busy} onClick={() => linkRoadmap(false)}>Link</button>
                {group.roadmapRequestId && <Link className="button button-quiet button-small" to={`/student/roadmaps/${group.roadmapRequestId}`}>Open full roadmap</Link>}
                {roadmaps.length === 0 && <Link to="/student">Create a roadmap first →</Link>}
              </div>
            )}
            {!group.roadmapRequestId ? (
              <div className="sb-empty"><span aria-hidden="true"></span><strong>No roadmap linked yet</strong>
                <p>{isOwner ? 'Choose the roadmap your team is building above. Its milestones and deadlines appear here and on the board.' : 'Ask the group owner to link the team’s roadmap.'}</p></div>
            ) : (
              <>
                <div className="ws-ms-list">
                  {group.milestones.map(m => {
                    const p = board.milestones.find(x => x.id === m.id);
                    return (
                      <div key={m.id} className={`ws-ms ph-${m.phase} st-${m.status}`}>
                        <span className="ws-ms-phase">{m.phase}</span>
                        <div><strong>{m.title}{m.status !== 'Done' && new Date(`${m.dueDate}T23:59:59`) < new Date() && <span className="sb-late-chip">Overdue</span>}</strong><small>Due {new Date(m.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · {p?.tasks ? `${p.tasksDone}/${p.tasks} tasks` : 'no tasks'}</small></div>
                        <span className="ws-ms-status">{m.status === 'Done' ? '✓ Done' : m.status === 'InProgress' ? 'In progress' : m.status === 'Blocked' ? 'Blocked' : 'Not started'}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="ws-sync-note">Milestones update automatically: one task in progress → <b>In progress</b>; every task done → <b>Done</b>.</p>
                <DeadlineCalendar milestones={group.milestones} projectTitle={group.roadmapTitle ?? group.name} />
              </>
            )}
          </div>
        )}

        {tab === 'team' && (
          <TeamPanel group={group} board={board} me={me} isOwner={isOwner} onInvite={() => setInviting(true)}
            onRemove={removeMember} onLeave={leave} onDelete={destroy} onRename={rename} />
        )}
      </div>

      {dialog && <TaskDialog task={dialog} board={board} busy={busy} onClose={() => setDialog(null)} onSave={save} onDelete={remove} />}
      {inviting && <InviteDialog token={token} group={group} onClose={() => setInviting(false)} />}
      {toast && <div className="ws-toast" role="status">{toast}</div>}
    </main>
  );
}

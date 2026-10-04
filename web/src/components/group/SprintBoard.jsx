import { useMemo, useRef, useState } from 'react';
import Avatar, { addWeeks, weekLabel } from '../Avatar';
import { useFeedback } from '../../ui/feedback';

export const COLUMNS = [
  ['Todo', 'To do', ''],
  ['Doing', 'Doing', ''],
  ['Done', 'Done', ''],
];

function TaskCard({ task, current, members = [], onOpen, onMove, onAssign, onDragStart, dragging }) {
  const late = task.status !== 'Done' && task.weekStart && task.weekStart < current;
  const idx = COLUMNS.findIndex(c => c[0] === task.status);
  return (
    <article
      className={`sb-card${dragging ? ' dragging' : ''}${late ? ' late' : ''}`}
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', task.id); onDragStart(task.id); }}
      onDragEnd={() => onDragStart(null)}
      data-task={task.id}
    >
      <button type="button" className="sb-card-main" onClick={() => onOpen(task)} aria-label={`Open task: ${task.title}`}>
        <div className="sb-card-top">
          {task.milestonePhase && <span className={`sb-phase ph-${task.milestonePhase}`}>{task.milestonePhase}</span>}
          {task.source === 'AI' && <span className="sb-ai" title="Planned by the Sprint Planner agent">AI</span>}
        </div>
        <strong className="sb-title">{task.title}</strong>
        <div className="sb-meta">
          <span className={`sb-week${late ? ' late' : ''}`}>{late ? '' : ''}{weekLabel(task.weekStart, current)}</span>
          {task.estimateHours != null && <span>{Number(task.estimateHours)}h</span>}
        </div>
      </button>
      <div className="sb-card-foot">
        {task.assigneeName
          ? <Avatar name={task.assigneeName} initials={task.assigneeInitials} seed={task.assigneeId} size={24} />
          : <span className="sb-unassigned" title="Nobody yet">?</span>}
        {onAssign ? (
          <select className="sb-assign-mini" value={task.assigneeId ?? ''} onChange={e => onAssign(task, e.target.value)} aria-label={`Assign ${task.title}`} title="Assign to">
            <option value="">Unassigned</option>
            {members.map(m => <option key={m.userId} value={m.userId}>{m.fullName}</option>)}
          </select>
        ) : <small>{task.assigneeName ?? 'Unassigned'}</small>}
      </div>
      <div className="sb-quick" aria-label="Move task">
        <button type="button" disabled={idx === 0} onClick={() => onMove(task, COLUMNS[idx - 1][0])} aria-label="Move left" title={idx > 0 ? `Move to ${COLUMNS[idx - 1][1]}` : ''}>‹</button>
        <button type="button" disabled={idx === COLUMNS.length - 1} onClick={() => onMove(task, COLUMNS[idx + 1][0])} aria-label="Move right" title={idx < 2 ? `Move to ${COLUMNS[idx + 1][1]}` : ''}>›</button>
      </div>
    </article>
  );
}

export function TaskDialog({ task, board, onClose, onSave, onDelete, busy }) {
  const { confirm } = useFeedback();
  const isNew = !task.id;
  const current = board.currentWeekStart;
  const [f, setF] = useState({
    title: task.title ?? '', description: task.description ?? '', status: task.status ?? 'Todo',
    assigneeId: task.assigneeId ?? '', estimateHours: task.estimateHours ?? '', weekStart: task.weekStart ?? current, milestoneId: task.milestoneId ?? '',
  });
  const weeks = useMemo(() => {
    const list = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map(n => addWeeks(current, n));
    if (f.weekStart && !list.includes(f.weekStart)) list.push(f.weekStart);
    return list.sort();
  }, [current, f.weekStart]);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  function submit(e) {
    e.preventDefault();
    if (!f.title.trim()) return;
    const payload = {
      title: f.title.trim(), description: f.description.trim(), status: f.status,
      estimateHours: f.estimateHours === '' ? null : Number(f.estimateHours), weekStart: f.weekStart || null,
    };
    if (isNew) { payload.assigneeId = f.assigneeId || null; payload.milestoneId = f.milestoneId || null; }
    else {
      if (f.assigneeId) payload.assigneeId = f.assigneeId; else payload.clearAssignee = true;
      if (f.milestoneId) payload.milestoneId = f.milestoneId; else payload.clearMilestone = true;
      if (!f.weekStart) payload.clearWeek = true;
      if (f.status === task.status) delete payload.status;
    }
    onSave(payload);
  }

  return (
    <div className="sb-modal" role="dialog" aria-modal="true" aria-label={isNew ? 'New task' : 'Edit task'} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="sb-dialog" onSubmit={submit} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
        <div className="sb-dialog-head">
          <h3>{isNew ? 'New task' : 'Edit task'}</h3>
          <button type="button" className="sb-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <label>What needs to be done? <em>required</em>
          <input autoFocus value={f.title} maxLength={200} onChange={e => set('title', e.target.value)} placeholder="e.g. Create the users table and migration" />
        </label>
        <label>Details / what “done” means
          <textarea rows={3} value={f.description} maxLength={2000} onChange={e => set('description', e.target.value)} placeholder="e.g. Table exists, migration runs, seed data added." />
        </label>
        <div className="sb-dialog-grid">
          <label>Status
            <select value={f.status} onChange={e => set('status', e.target.value)}>{COLUMNS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <label>Who
            <select value={f.assigneeId} onChange={e => set('assigneeId', e.target.value)}>
              <option value="">Nobody yet</option>
              {board.members.map(m => <option key={m.userId} value={m.userId}>{m.fullName}</option>)}
            </select>
          </label>
          <label>Sprint week
            <select value={f.weekStart} onChange={e => set('weekStart', e.target.value)}>
              {weeks.map(w => <option key={w} value={w}>{weekLabel(w, current)}</option>)}
            </select>
          </label>
          <label>Hours (estimate)
            <input type="number" min="0.5" max="40" step="0.5" value={f.estimateHours} onChange={e => set('estimateHours', e.target.value)} placeholder="e.g. 3" />
          </label>
          <label className="wide">Milestone
            <select value={f.milestoneId} onChange={e => set('milestoneId', e.target.value)}>
              <option value="">Not linked</option>
              {board.milestones.map(m => <option key={m.id} value={m.id}>{m.phase} — {m.title}</option>)}
            </select>
          </label>
        </div>
        {!isNew && task.completedAt && <p className="sb-done-note">Done by {task.completedByName ?? 'a member'} on {new Date(task.completedAt).toLocaleDateString()}</p>}
        <div className="sb-dialog-actions">
          {!isNew && <button type="button" className="sb-delete" onClick={async () => { if (await confirm({ title: 'Delete this task?', message: 'It is removed from the board for the whole group.', ok: 'Delete task', danger: true })) onDelete(task); }} disabled={busy}>Delete task</button>}
          <span />
          <button type="button" className="button button-quiet button-small" onClick={onClose}>Cancel</button>
          <button type="submit" className="button button-emerald button-small" disabled={busy || !f.title.trim()}>{busy ? 'Saving…' : isNew ? 'Add task' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}

export default function SprintBoard({ board, me, onMove, onAssign, onOpen, onNew, onGenerate, generating, hasRoadmap }) {
  const [who, setWho] = useState('all');
  const [milestone, setMilestone] = useState('all');
  const [dragId, setDragId] = useState(null);
  const [drop, setDrop] = useState(null); // { status, index }
  const colRefs = useRef({});
  const current = board.currentWeekStart;

  const visible = board.tasks.filter(t =>
    (who === 'all' || (who === 'me' ? t.assigneeId === me : who === 'none' ? !t.assigneeId : t.assigneeId === who)) &&
    (milestone === 'all' || (milestone === 'none' ? !t.milestoneId : t.milestoneId === milestone)));
  const byStatus = s => visible.filter(t => t.status === s).sort((a, b) => a.sortOrder - b.sortOrder);
  const untouched = board.milestones.filter(m => m.tasks === 0 && m.status !== 'Done');

  function overColumn(e, status) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const cards = [...(colRefs.current[status]?.querySelectorAll('[data-task]') ?? [])].filter(el => el.dataset.task !== dragId);
    let index = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { index = i; break; }
    }
    if (!drop || drop.status !== status || drop.index !== index) setDrop({ status, index });
  }

  function dropOn(e, status) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragId;
    const task = board.tasks.find(t => t.id === id);
    const index = drop?.status === status ? drop.index : byStatus(status).length;
    setDrop(null); setDragId(null);
    if (!task) return;
    // Convert the index among *visible* cards into the index in the full column.
    const full = board.tasks.filter(t => t.status === status && t.id !== id).sort((a, b) => a.sortOrder - b.sortOrder);
    const visibleCol = byStatus(status).filter(t => t.id !== id);
    const anchor = visibleCol[index];
    const fullIndex = anchor ? full.findIndex(t => t.id === anchor.id) : full.length;
    if (task.status === status && full.indexOf(task) === fullIndex) return;
    onMove(task, status, fullIndex);
  }

  return (
    <div className="sb">
      <div className="sb-toolbar">
        <button type="button" className="button button-gold button-small" onClick={() => onGenerate(null)} disabled={generating || !hasRoadmap}
          title={hasRoadmap ? 'Plans tasks for milestones that have none, then shares the remaining to-do work across every member. Doing and done tasks are never changed.' : 'Link a roadmap first (Roadmap tab)'}>
          {generating ? 'Planning…' : 'Plan sprint with AI'}
        </button>
        <button type="button" className="button button-emerald button-small" onClick={onNew}>+ Add task</button>
        <div className="sb-filters">
          <select value={who} onChange={e => setWho(e.target.value)} aria-label="Filter by person">
            <option value="all">Everyone</option>
            <option value="me">My tasks</option>
            <option value="none">Unassigned</option>
            {board.members.filter(m => m.userId !== me).map(m => <option key={m.userId} value={m.userId}>{m.fullName}</option>)}
          </select>
          <select value={milestone} onChange={e => setMilestone(e.target.value)} aria-label="Filter by milestone">
            <option value="all">All milestones</option>
            {board.milestones.map(m => <option key={m.id} value={m.id}>{m.phase} — {m.title}</option>)}
            <option value="none">Not linked</option>
          </select>
        </div>
      </div>

      {board.tasks.length === 0 && (
        <div className="sb-empty">
          <span aria-hidden="true"></span>
          <strong>{hasRoadmap ? 'Your board is empty' : 'Link a roadmap to start planning'}</strong>
          <p>{hasRoadmap
            ? 'Let the Sprint Planner break your milestones into small weekly tasks and share them fairly across the team — or add tasks yourself.'
            : 'Open the Roadmap tab and choose the roadmap your team is building. Then the AI can plan your sprints.'}</p>
          {hasRoadmap && <button type="button" className="button button-gold" onClick={() => onGenerate(null)} disabled={generating}>{generating ? 'Planning… (up to 30 s)' : 'Plan my sprints'}</button>}
        </div>
      )}
      {untouched.length > 0 && board.tasks.length > 0 && (
        <p className="sb-hint">{untouched.length} milestone{untouched.length > 1 ? 's have' : ' has'} no tasks yet. <button type="button" onClick={() => onGenerate(null)} disabled={generating}>Plan {untouched.length > 1 ? 'them' : 'it'} with AI</button></p>
      )}

      {board.tasks.length > 0 && (
        <div className="sb-columns">
          {COLUMNS.map(([status, label, icon]) => {
            const list = byStatus(status);
            const hours = list.reduce((s, t) => s + Number(t.estimateHours ?? 0), 0);
            return (
              <section key={status} className={`sb-col col-${status}${drop?.status === status ? ' over' : ''}`}
                onDragOver={e => overColumn(e, status)} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDrop(null); }}
                onDrop={e => dropOn(e, status)} aria-label={`${label} column`}>
                <header className="sb-col-head">
                  <span>{icon} {label}</span>
                  <small>{list.length}{hours ? ` · ${hours}h` : ''}</small>
                </header>
                <div className="sb-col-body" ref={el => { colRefs.current[status] = el; }}>
                  {list.map((t, i) => (
                    <div key={t.id}>
                      {drop?.status === status && drop.index === i && <div className="sb-drop-line" />}
                      <TaskCard task={t} current={current} members={board.members} onAssign={onAssign} onOpen={onOpen} onMove={(task, s) => onMove(task, s, null)}
                        onDragStart={setDragId} dragging={dragId === t.id} />
                    </div>
                  ))}
                  {drop?.status === status && drop.index >= list.filter(t => t.id !== dragId).length && <div className="sb-drop-line" />}
                  {list.length === 0 && <p className="sb-col-empty">{status === 'Done' ? 'Finished tasks land here' : 'Drag tasks here'}</p>}
                </div>
                {status === 'Todo' && <button type="button" className="sb-add" onClick={onNew}>+ Add a task</button>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

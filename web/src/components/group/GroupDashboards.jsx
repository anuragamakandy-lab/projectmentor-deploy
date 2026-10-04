import Avatar from '../Avatar';
import { ThisWeek } from './GroupPanels';

/* Shared date helpers. Dates are 'YYYY-MM-DD' strings from the API. */
const DAY = 86400000;
const toDate = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const fmt = iso => toDate(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
/** Whole days from today until the end of that date (0 = today, negative = overdue). */
export function daysLeft(iso) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((toDate(iso) - today) / DAY);
}
export function countdown(iso) {
  const d = daysLeft(iso);
  return d < 0 ? `${-d} day${d === -1 ? '' : 's'} overdue` : d === 0 ? 'due today' : d === 1 ? 'due tomorrow' : `${d} days left`;
}
/** A task is due at the end of its sprint week, or on its milestone's date when it has no week. */
export function taskDue(task, board) {
  if (task.weekStart) { const d = toDate(task.weekStart); d.setDate(d.getDate() + 6); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  return board.milestones.find(m => m.id === task.milestoneId)?.dueDate ?? null;
}
const hoursOf = list => list.reduce((s, t) => s + Number(t.estimateHours ?? 0), 0);

function Stat({ label, value, sub, tone, children }) {
  return (
    <div className={`gd-stat${tone ? ` ${tone}` : ''}`}>
      <span className="gd-stat-label">{label}</span>
      <strong className="gd-stat-value">{value}</strong>
      {sub && <small>{sub}</small>}
      {children}
    </div>
  );
}

const Bar = ({ pct }) => <span className="gd-bar"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></span>;

/* ======================= Group dashboard (shared by everyone) ======================= */
export function GroupOverview({ group, board, me, isOwner, onInvite, onRemove, onOpenBoard, onToggleDone, onOpen, children }) {
  const tasks = board.tasks;
  const done = tasks.filter(t => t.status === 'Done').length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const milestones = [...board.milestones].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const finalDate = group.deadline ?? milestones.at(-1)?.dueDate ?? null;
  const next = milestones.find(m => m.status !== 'Done');
  const current = board.currentWeekStart;
  const week = tasks.filter(t => t.weekStart === current || (t.status !== 'Done' && t.weekStart && t.weekStart < current));
  const weekDone = hoursOf(week.filter(t => t.status === 'Done'));
  const contrib = Object.fromEntries((board.contributions ?? []).map(c => [c.userId, c]));

  return (
    <div className="gd">
      <div className="gd-stats">
        <Stat label="Project deadline" value={finalDate ? countdown(finalDate).replace('due ', '') : 'Not set'}
          sub={finalDate ? `Final hand-in ${toDate(finalDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}` : 'Link a roadmap to see it'}
          tone={finalDate && daysLeft(finalDate) < 0 ? 'bad' : finalDate && daysLeft(finalDate) <= 7 ? 'warn' : ''} />
        <Stat label="Team progress" value={`${pct}%`} sub={`${done} of ${tasks.length} tasks done`}><Bar pct={pct} /></Stat>
        <Stat label="Next milestone" value={next ? countdown(next.dueDate) : milestones.length ? 'All done' : 'None yet'} sub={next ? `${next.phase} · ${next.title}` : milestones.length ? 'Every milestone is finished' : 'Link a roadmap to see milestones'}
          tone={next && daysLeft(next.dueDate) < 0 ? 'bad' : next && daysLeft(next.dueDate) <= 3 ? 'warn' : ''} />
        <Stat label="This week" value={`${weekDone}/${hoursOf(week)}h`} sub={board.weeklyCapacityHours ? `Team capacity ${Number(board.weeklyCapacityHours)}h a week` : `${week.length} tasks in this sprint`} />
      </div>

      {milestones.length > 0 && (
        <section className="gd-card">
          <header className="gd-card-head"><h2>Milestones</h2><button type="button" className="gd-link" onClick={onOpenBoard}>Open the board →</button></header>
          <ol className="gd-timeline">
            {milestones.map(m => {
              const p = m.tasks ? Math.round((m.tasksDone / m.tasks) * 100) : (m.status === 'Done' ? 100 : 0);
              const late = m.status !== 'Done' && daysLeft(m.dueDate) < 0;
              return (
                <li key={m.id} className={`${m.status === 'Done' ? 'done' : ''}${late ? ' late' : ''}${next?.id === m.id ? ' next' : ''}`}>
                  <span className={`gd-phase ph-${m.phase}`}>{m.phase}</span>
                  <strong title={m.title}>{m.title}</strong>
                  <Bar pct={p} />
                  <small>{m.status === 'Done' ? 'Done' : late ? `Overdue · ${fmt(m.dueDate)}` : `Due ${fmt(m.dueDate)}`} · {m.tasks ? `${m.tasksDone}/${m.tasks}` : 'no tasks'}</small>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <div className="gd-split">
        <section className="gd-card">
          <ThisWeek board={board} me={me} onToggleDone={onToggleDone} onOpen={onOpen} />
        </section>

        <section className="gd-card">
          <header className="gd-card-head"><h2>Team <small>{group.members.length}</small></h2><button type="button" className="button button-gold button-small" onClick={onInvite}>+ Invite</button></header>
          <ul className="gd-team">
            {group.members.map(m => {
              const c = contrib[m.userId];
              const open = tasks.filter(t => t.assigneeId === m.userId && t.status !== 'Done');
              const late = open.filter(t => { const d = taskDue(t, board); return d && daysLeft(d) < 0; }).length;
              const doing = open.filter(t => t.status === 'Doing').length;
              return (
                <li key={m.userId} className={m.userId === me ? 'me' : ''}>
                  <Avatar name={m.fullName} initials={m.initials} seed={m.userId} size={40} />
                  <div className="gd-team-main">
                    <div className="gd-team-name">
                      <strong>{m.fullName}{m.userId === me ? ' (you)' : ''}</strong>
                      <span className="gd-role">{m.role === 'Owner' ? 'Owner' : 'Member'}</span>
                    </div>
                    <Bar pct={c?.tasksAssigned ? (c.tasksDone / c.tasksAssigned) * 100 : 0} />
                    <small>
                      {c ? `${c.tasksDone}/${c.tasksAssigned} tasks done · ${c.sharePercent}% of team work` : 'No tasks yet'}
                      {doing > 0 && ` · ${doing} in progress`}
                      {late > 0 && <b className="gd-late"> · {late} overdue</b>}
                    </small>
                  </div>
                  {isOwner && m.userId !== me && <button type="button" className="gd-remove" onClick={() => onRemove(m)} aria-label={`Remove ${m.fullName}`}>Remove</button>}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {children}
    </div>
  );
}

/* ======================= My work (private to the signed-in member) ======================= */
export function MyWork({ group, board, me, user, onMove, onOpen, onOpenBoard }) {
  const mine = board.tasks.filter(t => t.assigneeId === me);
  const open = mine.filter(t => t.status !== 'Done');
  const doing = open.filter(t => t.status === 'Doing');
  const done = mine.filter(t => t.status === 'Done').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  const withDue = t => ({ t, due: taskDue(t, board) });
  const todo = open.filter(t => t.status === 'Todo').map(withDue).sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'));
  const overdue = todo.filter(x => x.due && daysLeft(x.due) < 0);
  const soon = todo.filter(x => !x.due || daysLeft(x.due) >= 0);
  const nextUp = doing[0] ? withDue(doing[0]) : todo[0];
  const pct = mine.length ? Math.round((done.length / mine.length) * 100) : 0;
  const share = board.contributions?.find(c => c.userId === me)?.sharePercent ?? 0;
  const unassigned = board.tasks.filter(t => !t.assigneeId && t.status !== 'Done').length;

  // Teammates working on the same milestones as my open tasks.
  const myMilestones = [...new Set(open.map(t => t.milestoneId).filter(Boolean))];
  const together = myMilestones.map(id => {
    const ms = board.milestones.find(m => m.id === id);
    const others = board.tasks.filter(t => t.milestoneId === id && t.assigneeId && t.assigneeId !== me && t.status !== 'Done');
    const people = [...new Map(others.map(t => [t.assigneeId, { id: t.assigneeId, name: t.assigneeName, initials: t.assigneeInitials, count: others.filter(o => o.assigneeId === t.assigneeId).length }])).values()];
    return { ms, people };
  }).filter(x => x.ms && x.people.length);

  const tips = [];
  if (overdue.length) tips.push(`You have ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}. Finish ${overdue.length > 1 ? 'them' : 'it'} first, or tell your team in the chat if you are stuck.`);
  if (doing.length > 2) tips.push('You have several tasks in progress. Finishing one before starting the next keeps the board honest.');
  if (!open.length && unassigned) tips.push(`There ${unassigned === 1 ? 'is 1 unassigned task' : `are ${unassigned} unassigned tasks`} on the board. Pick one up!`);
  if (!mine.length) tips.push('Nothing is assigned to you yet. Use “Plan sprint with AI” on the Board to share the work across the team.');

  const Row = ({ t, due }) => {
    const late = t.status !== 'Done' && due && daysLeft(due) < 0;
    return (
      <li className={`mw-row${t.status === 'Done' ? ' done' : ''}${late ? ' late' : ''}`}>
        <label className="tw-check">
          <input type="checkbox" checked={t.status === 'Done'} onChange={() => onMove(t, t.status === 'Done' ? 'Todo' : 'Done')} aria-label={`Mark ${t.title} ${t.status === 'Done' ? 'not done' : 'done'}`} />
          <span className="tw-box" aria-hidden="true">{t.status === 'Done' ? '✓' : ''}</span>
        </label>
        <button type="button" className="mw-title" onClick={() => onOpen(t)}>
          <span>{t.title}</span>
          <small>
            {t.milestonePhase && <em className={`gd-phase ph-${t.milestonePhase}`}>{t.milestonePhase}</em>}
            {t.status === 'Done' ? `Done${t.completedAt ? ` ${new Date(t.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}` : due ? countdown(due) : 'no date'}
            {t.estimateHours != null && ` · ${Number(t.estimateHours)}h`}
          </small>
        </button>
        {t.status === 'Todo' && <button type="button" className="button button-quiet button-small" onClick={() => onMove(t, 'Doing')}>Start</button>}
      </li>
    );
  };

  return (
    <div className="gd mw">
      <div className="gd-stats">
        <Stat label="My progress" value={`${pct}%`} sub={`${done.length} of ${mine.length} of my tasks done`}><Bar pct={pct} /></Stat>
        <Stat label="Open tasks" value={open.length} sub={`${hoursOf(open)}h of work left`} tone={overdue.length ? 'bad' : ''} />
        <Stat label="Next deadline" value={nextUp?.due ? countdown(nextUp.due) : '—'} sub={nextUp ? nextUp.t.title : 'Nothing due'}
          tone={nextUp?.due && daysLeft(nextUp.due) < 0 ? 'bad' : nextUp?.due && daysLeft(nextUp.due) <= 2 ? 'warn' : ''} />
        <Stat label="My share of team work" value={`${share}%`} sub={`${group.members.length} members in ${group.name}`} />
      </div>

      {nextUp && (
        <section className="gd-card mw-next">
          <div>
            <span className="gd-stat-label">{nextUp.t.status === 'Doing' ? 'You are working on' : 'Up next for you'}</span>
            <h2>{nextUp.t.title}</h2>
            <p>{nextUp.t.milestoneTitle ? `${nextUp.t.milestonePhase} · ${nextUp.t.milestoneTitle}` : 'Not linked to a milestone'}{nextUp.due ? ` · ${countdown(nextUp.due)}` : ''}</p>
          </div>
          <div className="mw-next-actions">
            {nextUp.t.status === 'Todo' && <button type="button" className="button button-emerald button-small" onClick={() => onMove(nextUp.t, 'Doing')}>Start now</button>}
            <button type="button" className="button button-gold button-small" onClick={() => onMove(nextUp.t, 'Done')}>Mark done</button>
            <button type="button" className="button button-quiet button-small" onClick={() => onOpen(nextUp.t)}>Details</button>
          </div>
        </section>
      )}

      {tips.length > 0 && <ul className="mw-tips">{tips.map(t => <li key={t}>{t}</li>)}</ul>}

      <div className="gd-split">
        <section className="gd-card">
          <header className="gd-card-head"><h2>My tasks</h2><button type="button" className="gd-link" onClick={onOpenBoard}>Team board →</button></header>
          {!mine.length && <p className="gd-empty">No tasks assigned to you, {user?.fullName?.split(' ')[0] ?? 'yet'}.</p>}
          {doing.length > 0 && <><h3 className="mw-h">In progress</h3><ul className="mw-list">{doing.map(t => <Row key={t.id} t={t} due={taskDue(t, board)} />)}</ul></>}
          {overdue.length > 0 && <><h3 className="mw-h late">Overdue</h3><ul className="mw-list">{overdue.map(x => <Row key={x.t.id} {...x} />)}</ul></>}
          {soon.length > 0 && <><h3 className="mw-h">To do</h3><ul className="mw-list">{soon.map(x => <Row key={x.t.id} {...x} />)}</ul></>}
          {done.length > 0 && (
            <details className="mw-done"><summary>Done ({done.length})</summary><ul className="mw-list">{done.map(t => <Row key={t.id} t={t} due={null} />)}</ul></details>
          )}
        </section>

        <section className="gd-card">
          <header className="gd-card-head"><h2>Working with you</h2></header>
          {together.length === 0 ? (
            <p className="gd-empty">When teammates have tasks in the same milestones as you, they show here so you know who to talk to.</p>
          ) : (
            <ul className="mw-together">
              {together.map(({ ms, people }) => (
                <li key={ms.id}>
                  <span className={`gd-phase ph-${ms.phase}`}>{ms.phase}</span>
                  <strong>{ms.title}</strong>
                  <small>{countdown(ms.dueDate)}</small>
                  <div className="mw-people">
                    {people.map(p => (
                      <span key={p.id} className="mw-person"><Avatar name={p.name} initials={p.initials} seed={p.id} size={24} />{p.name.split(' ')[0]} · {p.count} task{p.count > 1 ? 's' : ''}</span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

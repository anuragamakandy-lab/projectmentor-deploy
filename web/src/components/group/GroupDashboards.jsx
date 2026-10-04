import { useState } from 'react';
import Avatar from '../Avatar';

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
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function Tile({ title, action, onAction, className = '', children }) {
  return (
    <section className={`bt ${className}`}>
      <header className="bt-head">
        <h3>{title}</h3>
        {action && <button type="button" className="bt-action" onClick={onAction}>{action}</button>}
      </header>
      {children}
    </section>
  );
}

/** Half-circle gauge like a speedometer. */
function Gauge({ pct, label }) {
  const r = 70, c = Math.PI * r;
  return (
    <div className="bt-gauge">
      <svg viewBox="0 0 180 100" role="img" aria-label={`${pct}% ${label}`}>
        <path d="M20 90 A70 70 0 0 1 160 90" className="bt-gauge-track" />
        <path d="M20 90 A70 70 0 0 1 160 90" className="bt-gauge-fill" strokeDasharray={`${(pct / 100) * c} ${c}`} />
      </svg>
      <div className="bt-gauge-value"><strong>{pct}%</strong><small>{label}</small></div>
    </div>
  );
}

/** Month calendar with milestone due dates marked in their phase colour. */
function MiniCalendar({ milestones, deadline }) {
  const today = new Date();
  const first = milestones.find(m => m.status !== 'Done')?.dueDate ?? iso(today);
  const [month, setMonth] = useState(() => { const d = toDate(first); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const byDay = {};
  milestones.forEach(m => { (byDay[m.dueDate] ??= []).push(m); });
  const start = new Date(month); start.setDate(1 - ((month.getDay() + 6) % 7)); // Monday first
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const shift = n => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1));
  return (
    <div className="bt-cal">
      <div className="bt-cal-nav">
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
        <strong>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong>
        <button type="button" onClick={() => shift(1)} aria-label="Next month">›</button>
      </div>
      <div className="bt-cal-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="bt-cal-dow">{d}</span>)}
        {days.map(d => {
          const key = iso(d);
          const ms = byDay[key];
          const cls = [d.getMonth() !== month.getMonth() && 'out', key === iso(today) && 'today', ms && `has ph-${ms[0].phase}`, key === deadline && 'final'].filter(Boolean).join(' ');
          return (
            <span key={key} className={`bt-cal-day ${cls}`} title={ms ? ms.map(m => `${m.phase}: ${m.title}`).join('\n') : key === deadline ? 'Final deadline' : undefined}>
              {d.getDate()}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Smooth area chart of tasks finished per day over the last 14 days. */
function ActivityChart({ tasks }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() - 13 + i); return d; });
  const counts = days.map(d => tasks.filter(t => t.completedAt && iso(new Date(t.completedAt)) === iso(d)).length);
  const max = Math.max(2, ...counts);
  const W = 560, H = 150, P = 14;
  const pts = counts.map((c, i) => [P + (i * (W - 2 * P)) / 13, H - 24 - (c / max) * (H - 48)]);
  const line = pts.reduce((s, [x, y], i) => {
    if (!i) return `M${x},${y}`;
    const [px, py] = pts[i - 1]; const cx = (px + x) / 2;
    return `${s} C${cx},${py} ${cx},${y} ${x},${y}`;
  }, '');
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <div className="bt-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${total} tasks finished in the last 14 days`}>
        <defs><linearGradient id="btFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--g, #0e7a52)" stopOpacity="0.28" /><stop offset="1" stopColor="var(--g, #0e7a52)" stopOpacity="0" /></linearGradient></defs>
        <path d={`${line} L${pts.at(-1)[0]},${H - 24} L${pts[0][0]},${H - 24} Z`} fill="url(#btFill)" />
        <path d={line} className="bt-chart-line" />
        <line x1={pts.at(-1)[0]} x2={pts.at(-1)[0]} y1="8" y2={H - 24} className="bt-chart-now" />
        {pts.map(([x, y], i) => counts[i] > 0 && <circle key={i} cx={x} cy={y} r="4" className="bt-chart-dot"><title>{`${counts[i]} done on ${days[i].toLocaleDateString()}`}</title></circle>)}
      </svg>
      <div className="bt-chart-axis">
        {days.filter((_, i) => i % 3 === 0 || i === 13).map(d => <span key={iso(d)}>{iso(d) === iso(today) ? 'Today' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>)}
      </div>
      <p className="bt-note">{total ? `${total} task${total > 1 ? 's' : ''} finished in the last 2 weeks` : 'No tasks finished in the last 2 weeks yet'}</p>
    </div>
  );
}

export function GroupOverview({ group, board, me, isOwner, onInvite, onRemove, onOpenBoard, onToggleDone, onOpen, children }) {
  const tasks = board.tasks;
  const done = tasks.filter(t => t.status === 'Done').length;
  const doingCount = tasks.filter(t => t.status === 'Doing').length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const milestones = [...board.milestones].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const finalDate = group.deadline ?? milestones.at(-1)?.dueDate ?? null;
  const upcoming = milestones.filter(m => m.status !== 'Done').slice(0, 2);
  const current = board.currentWeekStart;
  const week = tasks.filter(t => t.weekStart === current || (t.status !== 'Done' && t.weekStart && t.weekStart < current));
  const contrib = Object.fromEntries((board.contributions ?? []).map(c => [c.userId, c]));
  const left = finalDate ? daysLeft(finalDate) : null;

  return (
    <div className="bento">
      <Tile title="Project deadline" className="b-deadline">
        <div className={`bt-count${left != null && left < 0 ? ' bad' : left != null && left <= 7 ? ' warn' : ''}`}>
          <strong>{left == null ? '—' : Math.abs(left)}</strong>
          <span>{left == null ? 'Link a roadmap to see the deadline' : left < 0 ? 'days overdue' : left === 1 ? 'day left' : 'days left'}</span>
        </div>
        {finalDate && <p className="bt-note">Final hand-in {toDate(finalDate).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long' })}</p>}
        <div className="bt-chips">
          {upcoming.map(m => (
            <span key={m.id} className={`bt-chip ph-${m.phase}`}><b>{m.phase}</b><small>{countdown(m.dueDate)}</small></span>
          ))}
        </div>
      </Tile>

      <Tile title="Team progress" className="b-gauge">
        <Gauge pct={pct} label="tasks done" />
        <ul className="bt-legend">
          <li><i className="l-done" />Done {done}</li>
          <li><i className="l-doing" />Doing {doingCount}</li>
          <li><i className="l-todo" />To do {tasks.length - done - doingCount}</li>
        </ul>
      </Tile>

      <Tile title="Calendar" className="b-cal"><MiniCalendar milestones={milestones} deadline={finalDate} /></Tile>

      <Tile title="Team activity" className="b-chart"><ActivityChart tasks={tasks} /></Tile>

      <Tile title="Milestones" action="Open board →" onAction={onOpenBoard} className="b-ms">
        {milestones.length === 0 ? <p className="bt-note">Link a roadmap (Roadmap tab) to see its milestones.</p> : (
          <table className="bt-table">
            <thead><tr><th>Phase</th><th>Milestone</th><th>Due</th><th>Tasks</th></tr></thead>
            <tbody>
              {milestones.map(m => {
                const late = m.status !== 'Done' && daysLeft(m.dueDate) < 0;
                return (
                  <tr key={m.id} className={m.status === 'Done' ? 'done' : ''}>
                    <td><span className={`gd-phase ph-${m.phase}`}>{m.phase}</span></td>
                    <td className="bt-ellipsis" title={m.title}>{m.title}</td>
                    <td className={late ? 'bt-late' : ''}>{m.status === 'Done' ? '✓ Done' : fmt(m.dueDate)}</td>
                    <td>{m.tasks ? `${m.tasksDone}/${m.tasks}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Tile>

      <Tile title={`Team · ${group.members.length}`} action="+ Invite" onAction={onInvite} className="b-team">
        <ul className="bt-team">
          {group.members.map(m => {
            const c = contrib[m.userId];
            const open = tasks.filter(t => t.assigneeId === m.userId && t.status !== 'Done');
            const late = open.filter(t => { const d = taskDue(t, board); return d && daysLeft(d) < 0; }).length;
            return (
              <li key={m.userId}>
                <Avatar name={m.fullName} initials={m.initials} seed={m.userId} size={34} />
                <div>
                  <strong>{m.fullName}{m.userId === me ? ' (you)' : ''}{m.role === 'Owner' && <em> · Owner</em>}</strong>
                  <Bar pct={c?.tasksAssigned ? (c.tasksDone / c.tasksAssigned) * 100 : 0} />
                  <small>{c ? `${c.tasksDone}/${c.tasksAssigned} done · ${c.sharePercent}% of work` : 'No tasks yet'}{late > 0 && <b className="gd-late"> · {late} overdue</b>}</small>
                </div>
                {isOwner && m.userId !== me && <button type="button" className="gd-remove" onClick={() => onRemove(m)} aria-label={`Remove ${m.fullName}`}>Remove</button>}
              </li>
            );
          })}
        </ul>
      </Tile>

      <Tile title={`This week · ${fmt(current)} – ${fmt(iso(new Date(toDate(current).getTime() + 6 * DAY)))}`} className="b-week">
        {week.length === 0 ? <p className="bt-note">No tasks planned for this week. Use “Plan sprint with AI” on the Board.</p> : (
          <div className="bt-week">
            {[...board.members, { userId: null, fullName: 'Unassigned', initials: '?' }].map(m => {
              const list = week.filter(t => (t.assigneeId ?? null) === m.userId);
              if (!list.length) return null;
              const leftCount = list.filter(t => t.status !== 'Done').length;
              return (
                <div key={m.userId ?? 'none'} className={`bt-week-col${m.userId === me ? ' me' : ''}`}>
                  <header>
                    {m.userId ? <Avatar name={m.fullName} initials={m.initials} seed={m.userId} size={26} /> : <span className="sb-unassigned">?</span>}
                    <strong>{m.userId === me ? 'You' : m.fullName.split(' ')[0]}</strong>
                    <small>{leftCount ? `${leftCount} left` : 'all done'}</small>
                  </header>
                  {list.map(t => (
                    <div key={t.id} className={`bt-task${t.status === 'Done' ? ' done' : ''}`}>
                      <label className="tw-check"><input type="checkbox" checked={t.status === 'Done'} onChange={() => onToggleDone(t)} /><span className="tw-box" aria-hidden="true">{t.status === 'Done' ? '✓' : ''}</span></label>
                      <button type="button" onClick={() => onOpen(t)}>{t.title}</button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </Tile>

      <div className="b-more">{children}</div>
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

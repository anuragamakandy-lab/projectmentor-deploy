import { useMemo, useState } from 'react';
import '../styles/calendar.css';

/*
 * Deadlines calendar for one roadmap. Pure front-end: it reads the milestones the page already has.
 *  - Month view: each milestone sits on its due date; a thin coloured line under each day shows
 *    which milestone you should be working on that day (the next one due).
 *  - List view: an agenda grouped by month (default on phones).
 *  - "Add to my calendar" exports an .ics file (Google Calendar, Outlook, Apple) with a 1-day reminder.
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY = 86400000;
const STATUS_LABEL = { NotStarted: 'Not started', InProgress: 'In progress', Blocked: 'Blocked', Done: 'Done' };

function parse(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
function key(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function startOfToday() { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function daysBetween(a, b) { return Math.round((b - a) / DAY); }
function longDate(d) { return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
function shortDate(d) { return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); }

function countdown(days, done) {
  if (done) return 'Completed';
  if (days < -1) return `${-days} days overdue`;
  if (days === -1) return '1 day overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days < 14) return `In ${days} days`;
  return `In ${Math.round(days / 7)} weeks`;
}

// ---------- .ics export ----------
function icsEscape(s) { return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function icsDate(d) { return key(d).replace(/-/g, ''); }
function fold(line) {
  const out = [];
  for (let i = 0; i < line.length; i += 73) out.push((i ? ' ' : '') + line.slice(i, i + 73));
  return out.join('\r\n');
}
function buildIcs(items, projectTitle) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ProjectMentor//Roadmap deadlines//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEscape(projectTitle)}`];
  items.forEach(m => {
    const end = new Date(m.date.getTime() + DAY);
    lines.push('BEGIN:VEVENT', `UID:${m.id}@projectmentor`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(m.date)}`, `DTEND;VALUE=DATE:${icsDate(end)}`,
      `SUMMARY:${icsEscape(`Deadline: ${m.title}`)}`,
      `DESCRIPTION:${icsEscape(`${projectTitle} — ${m.phase} phase.\n${m.description ?? ''}`)}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(`Tomorrow: ${m.title}`)}`, 'END:VALARM',
      'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n');
}
function downloadIcs(items, projectTitle, name) {
  const blob = new Blob([buildIcs(items, projectTitle)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(name || projectTitle || 'roadmap').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'roadmap'}_deadlines.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DeadlineCalendar({ milestones = [], projectTitle = 'My project' }) {
  const today = startOfToday();

  const items = useMemo(() => milestones
    .filter(m => m.dueDate)
    .map(m => {
      const date = parse(m.dueDate);
      const done = m.status === 'Done';
      const days = daysBetween(today, date);
      return { ...m, date, done, days, overdue: !done && days < 0 };
    })
    .sort((a, b) => a.date - b.date), [milestones]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = items.find(m => !m.done && m.days >= 0) ?? null;
  const overdue = items.filter(m => m.overdue);
  const thisWeek = items.filter(m => !m.done && m.days >= 0 && m.days <= 7);
  const focus = overdue[0] ?? next; // what to work on right now
  const allDone = items.length > 0 && items.every(m => m.done);

  const [view, setView] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'list' : 'month'));
  const [month, setMonth] = useState(() => monthStart(next?.date ?? (items.length && today > items[items.length - 1].date ? items[items.length - 1].date : today)));
  const [selectedId, setSelectedId] = useState(focus?.id ?? null);
  const selected = items.find(m => m.id === selectedId) ?? null;

  if (items.length === 0) return null;

  // "Working window" for each milestone: from the day after the previous due date up to its own due date.
  const windowOf = (day) => {
    let prev = null;
    for (const m of items) {
      if (day <= m.date && (!prev || day > prev.date)) return m;
      prev = m;
    }
    return null;
  };

  // 6-week grid starting on Monday.
  const first = monthStart(month);
  const offset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  const byDay = items.reduce((acc, m) => { (acc[key(m.date)] ||= []).push(m); return acc; }, {});
  const firstMonth = monthStart(items[0].date);
  const lastMonth = monthStart(items[items.length - 1].date);

  const groups = items.reduce((acc, m) => {
    const label = m.date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    (acc[label] ||= []).push(m);
    return acc;
  }, {});

  function pick(m) {
    setSelectedId(m.id);
    setMonth(monthStart(m.date));
  }

  return (
    <section className="panel cal" aria-label="Deadlines calendar">
      <div className="cal-head">
        <div>
          <h2 className="panel-title">Deadlines calendar</h2>
          <p className="cal-sub">Every milestone on one calendar. Click a deadline to see the details.</p>
        </div>
        <div className="cal-actions">
          <div className="cal-toggle" role="group" aria-label="Calendar view">
            <button type="button" className={view === 'month' ? 'on' : ''} onClick={() => setView('month')} aria-pressed={view === 'month'}>Month</button>
            <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} aria-pressed={view === 'list'}>List</button>
          </div>
          <button type="button" className="button button-quiet button-small" onClick={() => downloadIcs(items, projectTitle)}
            title="Download an .ics file for Google Calendar, Outlook or Apple Calendar">
            Add to my calendar
          </button>
        </div>
      </div>

      {/* At-a-glance alerts */}
      <div className="cal-alerts">
        {allDone ? (
          <div className="cal-alert good"><span className="cal-alert-icon"></span><div><strong>All milestones done</strong><span>Great work — your roadmap is complete.</span></div></div>
        ) : focus && (
          <button type="button" className={`cal-alert focus${focus.overdue ? ' late' : ''}`} onClick={() => pick(focus)}>
            <span className="cal-alert-icon">{focus.overdue ? '' : ''}</span>
            <div>
              <small>{focus.overdue ? 'Catch up on' : 'Work on now'}</small>
              <strong>{focus.title}</strong>
              <span>{countdown(focus.days, focus.done)} · {shortDate(focus.date)}</span>
            </div>
          </button>
        )}
        <div className={`cal-alert${thisWeek.length ? ' warn' : ''}`}>
          <span className="cal-alert-num">{thisWeek.length}</span>
          <div><strong>Due in the next 7 days</strong><span>{thisWeek.length ? thisWeek.map(m => m.title).slice(0, 2).join(', ') : 'Nothing due this week'}</span></div>
        </div>
        <div className={`cal-alert${overdue.length ? ' late' : ' good'}`}>
          <span className="cal-alert-num">{overdue.length}</span>
          <div><strong>{overdue.length ? 'Overdue' : 'Nothing overdue'}</strong><span>{overdue.length ? 'Update the status when you finish them.' : 'You are on track ✓'}</span></div>
        </div>
      </div>

      {view === 'month' ? (
        <div className="cal-month">
          <div className="cal-nav">
            <button type="button" className="cal-arrow" onClick={() => setMonth(m => addMonths(m, -1))} aria-label="Previous month">‹</button>
            <h3 aria-live="polite">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
            <button type="button" className="cal-arrow" onClick={() => setMonth(m => addMonths(m, 1))} aria-label="Next month">›</button>
            <div className="cal-jumps">
              <button type="button" onClick={() => setMonth(monthStart(today))}>Today</button>
              <button type="button" onClick={() => setMonth(firstMonth)}>Start</button>
              <button type="button" onClick={() => setMonth(lastMonth)}>Final deadline</button>
            </div>
          </div>

          <div className="cal-grid" role="grid">
            {WEEKDAYS.map(d => <div className="cal-wd" key={d} role="columnheader">{d}</div>)}
            {cells.map(day => {
              const k = key(day);
              const list = byDay[k] ?? [];
              const inMonth = day.getMonth() === month.getMonth();
              const isToday = k === key(today);
              const win = windowOf(day);
              return (
                <div key={k} role="gridcell"
                  className={`cal-day${inMonth ? '' : ' out'}${isToday ? ' today' : ''}${list.length ? ' has' : ''}${day.getDay() === 0 || day.getDay() === 6 ? ' wkend' : ''}`}
                  aria-label={`${longDate(day)}${list.length ? `: ${list.map(m => m.title).join(', ')}` : ''}`}>
                  <span className="cal-num">{day.getDate()}</span>
                  {isToday && <span className="cal-today-tag">Today</span>}
                  <div className="cal-chips">
                    {list.slice(0, 2).map(m => (
                      <button type="button" key={m.id} onClick={() => setSelectedId(m.id)}
                        className={`cal-chip ph-${m.phase}${m.done ? ' done' : ''}${m.overdue ? ' late' : ''}${selectedId === m.id ? ' sel' : ''}`}
                        title={`${m.title} — ${STATUS_LABEL[m.status] ?? m.status}`}>
                        {m.done ? '✓ ' : m.overdue ? '! ' : ''}{m.title}
                      </button>
                    ))}
                    {list.length > 2 && <button type="button" className="cal-more" onClick={() => setSelectedId(list[2].id)}>+{list.length - 2} more</button>}
                  </div>
                  {win && <span className={`cal-window ph-${win.phase}${win.done ? ' done' : ''}`} title={`Working on: ${win.title}`} />}
                </div>
              );
            })}
          </div>

          <div className="cal-legend">
            <span><i className="lg-chip" /> Deadline</span>
            <span><i className="lg-line" /> Line under a day = the milestone you should be working on</span>
            <span><i className="lg-late" /> Overdue</span>
            <span><i className="lg-done" /> Done</span>
          </div>
        </div>
      ) : (
        <div className="cal-list">
          {Object.entries(groups).map(([label, list]) => (
            <div className="cal-list-group" key={label}>
              <h3>{label}</h3>
              <ol>
                {list.map(m => (
                  <li key={m.id}>
                    <button type="button" className={`cal-row${m.done ? ' done' : ''}${m.overdue ? ' late' : ''}${selectedId === m.id ? ' sel' : ''}`} onClick={() => setSelectedId(m.id)}>
                      <span className={`cal-date ph-${m.phase}`}>
                        <b>{m.date.getDate()}</b>
                        <small>{m.date.toLocaleDateString(undefined, { weekday: 'short' })}</small>
                      </span>
                      <span className="cal-row-body">
                        <strong>{m.title}</strong>
                        <small>{m.phase} · {STATUS_LABEL[m.status] ?? m.status}</small>
                      </span>
                      <span className="cal-row-count">{countdown(m.days, m.done)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className={`cal-detail ph-${selected.phase}`} aria-live="polite">
          <div className="cal-detail-top">
            <span className="phase">{selected.phase}</span>
            <span className={`cal-pill${selected.done ? ' done' : selected.overdue ? ' late' : ''}`}>{STATUS_LABEL[selected.status] ?? selected.status}</span>
            <button type="button" className="cal-x" onClick={() => setSelectedId(null)} aria-label="Close details">×</button>
          </div>
          <h4>{selected.title}</h4>
          {selected.description && <p>{selected.description}</p>}
          <div className="cal-detail-meta">
            <span>{longDate(selected.date)}</span>
            <span className={selected.overdue ? 'late' : ''}>{countdown(selected.days, selected.done)}</span>
          </div>
          <button type="button" className="cal-link" onClick={() => downloadIcs([selected], projectTitle, selected.title)}>
            Add just this deadline to my calendar
          </button>
        </div>
      )}
    </section>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createInvite, getMessages, listInvites, revokeInvite, sendMessage, uploadFile, uploadUrl } from '../../api/projectMentorApi';
import Avatar, { addWeeks, timeAgo, weekLabel } from '../Avatar';

/* ---------------- This week ---------------- */
export function ThisWeek({ board, me, onToggleDone, onOpen }) {
  const current = board.currentWeekStart;
  const next = addWeeks(current, 1);
  const thisWeek = board.tasks.filter(t => t.weekStart === current || (t.status !== 'Done' && t.weekStart && t.weekStart < current));
  const nextWeek = board.tasks.filter(t => t.weekStart === next && t.status !== 'Done');
  const planned = thisWeek.reduce((s, t) => s + Number(t.estimateHours ?? 0), 0);
  const doneHours = thisWeek.filter(t => t.status === 'Done').reduce((s, t) => s + Number(t.estimateHours ?? 0), 0);
  const cap = board.weeklyCapacityHours ? Number(board.weeklyCapacityHours) : null;
  const over = cap && planned > cap;
  const mine = thisWeek.filter(t => t.assigneeId === me && t.status !== 'Done');

  const people = [...board.members, { userId: null, fullName: 'Unassigned', initials: '?' }]
    .map(m => ({ ...m, tasks: thisWeek.filter(t => (t.assigneeId ?? null) === m.userId) }))
    .filter(m => m.tasks.length > 0);

  const [y, mo, d] = current.split('-').map(Number);
  const start = new Date(y, mo - 1, d);
  const end = new Date(y, mo - 1, d + 6);
  const range = `${start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;

  return (
    <div className="tw">
      <div className="tw-head">
        <div>
          <h2>This week’s sprint <small>{range}</small></h2>
          <p>{mine.length ? `You have ${mine.length} task${mine.length > 1 ? 's' : ''} left this week.` : 'Nothing left for you this week.'}</p>
        </div>
        <div className={`tw-cap${over ? ' over' : ''}`}>
          <div className="tw-cap-top"><strong>{doneHours}/{planned}h done</strong>{cap && <small>team capacity {cap}h / week</small>}</div>
          <div className="tw-cap-bar">
            <span className="planned" style={{ width: `${Math.min(100, cap ? (planned / cap) * 100 : 100)}%` }} />
            <span className="done" style={{ width: `${Math.min(100, (cap ? doneHours / cap : planned ? doneHours / planned : 0) * 100)}%` }} />
          </div>
          {over && <small className="tw-warn">More work planned than the team usually has time for. Move something to next week.</small>}
        </div>
      </div>

      {thisWeek.length === 0 ? (
        <div className="sb-empty small"><strong>No tasks planned for this week</strong><p>Use “Plan sprint with AI” on the Board, or give tasks a week when you edit them.</p></div>
      ) : (
        <div className="tw-people">
          {people.map(p => {
            const left = p.tasks.filter(t => t.status !== 'Done');
            const hours = left.reduce((s, t) => s + Number(t.estimateHours ?? 0), 0);
            return (
              <section key={p.userId ?? 'none'} className={`tw-person${p.userId === me ? ' me' : ''}`}>
                <header>
                  {p.userId ? <Avatar name={p.fullName} initials={p.initials} seed={p.userId} size={32} /> : <span className="sb-unassigned big">?</span>}
                  <div><strong>{p.userId === me ? 'You' : p.fullName}</strong><small>{left.length} left · {hours}h</small></div>
                </header>
                <ul>
                  {p.tasks.sort((a, b) => (a.status === 'Done') - (b.status === 'Done')).map(t => {
                    const late = t.status !== 'Done' && t.weekStart < current;
                    return (
                      <li key={t.id} className={`${t.status === 'Done' ? 'done' : ''}${late ? ' late' : ''}`}>
                        <label className="tw-check">
                          <input type="checkbox" checked={t.status === 'Done'} onChange={() => onToggleDone(t)} />
                          <span className="tw-box" aria-hidden="true">{t.status === 'Done' ? '✓' : ''}</span>
                        </label>
                        <button type="button" className="tw-task" onClick={() => onOpen(t)}>
                          <span>{t.title}</span>
                          <small>{late ? `from ${weekLabel(t.weekStart, current).toLowerCase()} · ` : ''}{t.status === 'Doing' ? 'in progress · ' : ''}{t.estimateHours != null ? `${Number(t.estimateHours)}h` : ''}</small>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {nextWeek.length > 0 && (
        <details className="tw-next">
          <summary>Coming up next week ({nextWeek.length})</summary>
          <ul>{nextWeek.map(t => <li key={t.id}><button type="button" onClick={() => onOpen(t)}>{t.title}</button> <small>{t.assigneeName ?? 'unassigned'}</small></li>)}</ul>
        </details>
      )}
    </div>
  );
}

/* ---------------- Chat ---------------- */
function dayLabel(iso) {
  const d = new Date(iso); const t = new Date();
  const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function GroupChat({ token, groupId, me, active, onUnread }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const logRef = useRef(null);
  const lastRef = useRef(null);
  const seenRef = useRef(new Set());
  const stick = useRef(true);
  const fileRef = useRef(null);

  // Load, then poll for new messages every 3 s (faster while the chat is open).
  useEffect(() => {
    let alive = true;
    let timer;
    async function tick(first) {
      try {
        const list = await getMessages(token, groupId, first ? null : lastRef.current);
        if (!alive) return;
        if (list.length) {
          lastRef.current = list[list.length - 1].createdAt;
          // Count unread outside the state updater (React may run updaters twice in development).
          const fresh = list.filter(x => !seenRef.current.has(x.id));
          list.forEach(x => seenRef.current.add(x.id));
          const fromOthers = fresh.filter(x => x.senderId !== me && !x.isSystem).length;
          if (!first && !active && fromOthers) onUnread?.(fromOthers);
          setMessages(m => {
            if (first) return list;
            const seen = new Set(m.map(x => x.id));
            return [...m, ...list.filter(x => !seen.has(x.id))];
          });
        }
      } catch { /* keep polling quietly */ }
      if (alive) timer = setTimeout(() => tick(false), active ? 3000 : 8000);
    }
    tick(true);
    return () => { alive = false; clearTimeout(timer); };
  }, [token, groupId, me, active]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = logRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, active]);

  async function send(e) {
    e.preventDefault();
    if ((!text.trim() && !file) || sending) return;
    setSending(true); setError('');
    try {
      let uploadId = null;
      if (file) uploadId = (await uploadFile(token, file)).id;
      const msg = await sendMessage(token, groupId, text.trim(), uploadId);
      stick.current = true;
      seenRef.current.add(msg.id);
      setMessages(m => (m.some(x => x.id === msg.id) ? m : [...m, msg]));
      lastRef.current = msg.createdAt;
      setText(''); setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) { setError(err.message); }
    finally { setSending(false); }
  }

  let lastDay = '';
  return (
    <div className="gc">
      <div className="gc-log" ref={logRef} onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        {messages.length === 0 && <p className="gc-empty">No messages yet. Say hello to your team</p>}
        {messages.map((m, i) => {
          const day = dayLabel(m.createdAt);
          const showDay = day !== lastDay; lastDay = day;
          const prev = messages[i - 1];
          const grouped = prev && !prev.isSystem && prev.senderId === m.senderId && !showDay && (new Date(m.createdAt) - new Date(prev.createdAt)) < 5 * 60000;
          const mine = m.senderId === me;
          return (
            <div key={m.id}>
              {showDay && <div className="gc-day"><span>{day}</span></div>}
              {m.isSystem ? (
                <div className="gc-system">{m.content}</div>
              ) : (
                <div className={`gc-row${mine ? ' mine' : ''}${grouped ? ' grouped' : ''}`}>
                  {!mine && (grouped ? <span className="gc-gap" /> : <Avatar name={m.senderName} initials={m.senderInitials} seed={m.senderId} size={30} />)}
                  <div className="gc-bubble">
                    {!mine && !grouped && <span className="gc-name">{m.senderName}</span>}
                    {m.upload && (m.upload.contentType.startsWith('image/')
                      ? <a href={uploadUrl(m.upload.id)} target="_blank" rel="noreferrer"><img className="gc-img" src={uploadUrl(m.upload.id)} alt={m.upload.fileName} loading="lazy" /></a>
                      : <a className="gc-file" href={uploadUrl(m.upload.id)} target="_blank" rel="noreferrer">{m.upload.fileName}</a>)}
                    {m.content && <p>{m.content}</p>}
                    <time dateTime={m.createdAt} title={new Date(m.createdAt).toLocaleString()}>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {file && <div className="gc-attach">{file.name} <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }} aria-label="Remove attachment">×</button></div>}
      {error && <p className="error-message gc-error">{error}</p>}
      <form className="gc-bar" onSubmit={send}>
        <label className="gc-clip" title="Attach an image or file">
          <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.docx,.pptx,.xlsx" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.6 8.6a2 2 0 0 1-2.8-2.8L15.5 7" /></svg><span className="sr-only">Attach a file</span>
        </label>
        <textarea rows={1} value={text} maxLength={4000} placeholder="Message your team…" aria-label="Message"
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); } }} />
        <button type="submit" className="button button-emerald" disabled={sending || (!text.trim() && !file)}>{sending ? '…' : 'Send'}</button>
      </form>
    </div>
  );
}

/* ---------------- Invite dialog ---------------- */
export function InviteDialog({ token, group, onClose }) {
  const [invites, setInvites] = useState(null);
  const [days, setDays] = useState(7);
  const [maxUses, setMaxUses] = useState('');
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');

  const linkFor = code => `${window.location.origin}/join/${code}`;
  const active = invites?.filter(i => i.active) ?? [];
  const main = active[0];

  useEffect(() => {
    listInvites(token, group.id).then(async list => {
      if (list.some(i => i.active)) setInvites(list);
      else setInvites([await createInvite(token, group.id, { expiresInDays: 7 }), ...list]); // first open: make one automatically
    }).catch(e => setError(e.message));
  }, [token, group.id]);

  async function make() {
    setError('');
    try {
      const inv = await createInvite(token, group.id, { expiresInDays: Number(days), maxUses: maxUses ? Number(maxUses) : null });
      setInvites(l => [inv, ...(l ?? [])]);
    } catch (e) { setError(e.message); }
  }
  async function revoke(id) {
    try { await revokeInvite(token, group.id, id); setInvites(l => l.filter(i => i.id !== id)); } catch (e) { setError(e.message); }
  }
  async function copy(text, key) {
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    setCopied(key); setTimeout(() => setCopied(''), 1800);
  }

  const message = main ? `Join our project group "${group.name}" on ProjectMentor: ${linkFor(main.token)}` : '';

  return (
    <div className="sb-modal" role="dialog" aria-modal="true" aria-label="Invite teammates" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sb-dialog invite" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
        <div className="sb-dialog-head">
          <h3>Invite your teammates</h3>
          <button type="button" className="sb-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="inv-intro">Send this link to your group members. When they open it and log in (or sign up), they join <strong>{group.name}</strong>.</p>
        {!invites && !error && <p className="note">Creating your link…</p>}
        {main && (
          <>
            <div className="inv-link">
              <input readOnly value={linkFor(main.token)} onFocus={e => e.target.select()} aria-label="Invite link" />
              <button type="button" className="button button-emerald button-small" onClick={() => copy(linkFor(main.token), 'main')}>{copied === 'main' ? '✓ Copied' : 'Copy link'}</button>
            </div>
            <p className="inv-meta">Expires {new Date(main.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{main.maxUses ? ` · ${main.uses}/${main.maxUses} uses` : ` · used ${main.uses} time${main.uses === 1 ? '' : 's'}`}</p>
            <div className="inv-share">
              <a className="inv-btn wa" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">WhatsApp</a>
              <a className="inv-btn mail" href={`mailto:?subject=${encodeURIComponent(`Join ${group.name} on ProjectMentor`)}&body=${encodeURIComponent(message)}`}>Email</a>
              <button type="button" className="inv-btn" onClick={() => copy(message, 'msg')}>{copied === 'msg' ? '✓ Copied' : 'Copy message'}</button>
            </div>
          </>
        )}
        <details className="inv-more">
          <summary>More options</summary>
          <div className="inv-new">
            <label>Expires after
              <select value={days} onChange={e => setDays(e.target.value)}><option value={1}>1 day</option><option value={7}>7 days</option><option value={30}>30 days</option></select>
            </label>
            <label>Max people
              <select value={maxUses} onChange={e => setMaxUses(e.target.value)}><option value="">No limit</option>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}</select>
            </label>
            <button type="button" className="button button-quiet button-small" onClick={make}>New link</button>
          </div>
          {active.length > 0 && (
            <ul className="inv-list">
              {active.map(i => (
                <li key={i.id}>
                  <code>…{i.token.slice(-8)}</code>
                  <small>exp. {new Date(i.expiresAt).toLocaleDateString()} · {i.uses}{i.maxUses ? `/${i.maxUses}` : ''} used</small>
                  <button type="button" onClick={() => copy(linkFor(i.token), i.id)}>{copied === i.id ? '✓' : 'Copy'}</button>
                  <button type="button" className="danger" onClick={() => revoke(i.id)}>Turn off</button>
                </li>
              ))}
            </ul>
          )}
          <p className="inv-safety">Anyone with an active link can join, so only share it with your team. Turn a link off if it was shared by mistake.</p>
        </details>
        {error && <p className="error-message">{error}</p>}
      </div>
    </div>
  );
}

/* ---------------- Team ---------------- */
export function TeamPanel({ group, board, me, isOwner, onInvite, onRemove, onLeave, onDelete, onRename }) {
  const [name, setName] = useState(group.name);
  const [desc, setDesc] = useState(group.description ?? '');
  const rows = board?.contributions ?? [];

  function exportCsv() {
    const head = ['Member', 'Tasks assigned', 'Tasks done', 'Hours done', 'Share of done work %', 'Chat messages'];
    const lines = [head, ...rows.map(r => [r.fullName, r.tasksAssigned, r.tasksDone, r.hoursDone, r.sharePercent, r.messages])]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','));
    const doneTasks = (board?.tasks ?? []).filter(t => t.status === 'Done').map(t => `"${t.title.replace(/"/g, '""')}","${t.completedByName ?? ''}","${t.completedAt ? new Date(t.completedAt).toLocaleDateString() : ''}"`);
    const csv = [...lines, '', '"Completed task","Done by","Date"', ...doneTasks].join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `${group.name.replace(/[^\w-]+/g, '_')}_contributions.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="tm">
      <section className="tm-card">
        <div className="tm-head"><h2>Members <small>{group.members.length}</small></h2><button type="button" className="button button-emerald button-small" onClick={onInvite}>+ Invite</button></div>
        <ul className="tm-members">
          {group.members.map(m => (
            <li key={m.userId}>
              <Avatar name={m.fullName} initials={m.initials} seed={m.userId} size={38} />
              <div><strong>{m.fullName}{m.userId === me ? ' (you)' : ''}</strong><small>{m.role === 'Owner' ? 'Owner' : 'Member'} · joined {timeAgo(m.joinedAt)}</small></div>
              {isOwner && m.userId !== me && <button type="button" className="tm-remove" onClick={() => onRemove(m)}>Remove</button>}
            </li>
          ))}
        </ul>
      </section>

      <section className="tm-card">
        <div className="tm-head"><h2>Contribution record</h2><button type="button" className="button button-quiet button-small" onClick={exportCsv} disabled={!rows.length}>Export CSV</button></div>
        <p className="tm-note">Built from finished board tasks and chat activity. Paste it into the “Team contribution” section of your report.</p>
        <div className="tm-table-wrap">
          <table className="tm-table">
            <thead><tr><th>Member</th><th>Assigned</th><th>Done</th><th>Hours done</th><th>Share</th><th>Messages</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.userId}>
                  <td><span className="tm-who"><Avatar name={r.fullName} initials={r.initials} seed={r.userId} size={24} />{r.fullName}</span></td>
                  <td>{r.tasksAssigned}</td><td>{r.tasksDone}</td><td>{Number(r.hoursDone)}</td>
                  <td><span className="tm-share"><i style={{ width: `${r.sharePercent}%` }} /></span>{r.sharePercent}%</td>
                  <td>{r.messages}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tm-card">
        <h2>Settings</h2>
        {isOwner ? (
          <form className="tm-settings" onSubmit={e => { e.preventDefault(); onRename({ name: name.trim(), description: desc }); }}>
            <label>Group name<input value={name} maxLength={120} onChange={e => setName(e.target.value)} /></label>
            <label>Description<textarea rows={2} maxLength={1000} value={desc} onChange={e => setDesc(e.target.value)} /></label>
            <div className="tm-row">
              <button type="submit" className="button button-emerald button-small" disabled={!name.trim()}>Save changes</button>
              <button type="button" className="tm-danger" onClick={onDelete}>Delete group</button>
            </div>
          </form>
        ) : (
          <div className="tm-row"><p className="tm-note">Only the owner can rename or delete the group.</p><button type="button" className="tm-danger" onClick={onLeave}>Leave group</button></div>
        )}
      </section>
    </div>
  );
}

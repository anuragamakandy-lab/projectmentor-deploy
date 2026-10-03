import { useState } from 'react';
import { Link } from 'react-router-dom';
import { admin } from '../adminApi';
import { Empty, ErrorBox, Loading, Modal, PageHead, timeAgo, useAsync, useFeedback } from '../ui';

/** Messages sent with the "Contact the admins" form (for example from deactivated accounts). Replies go out by email. */
export default function Support() {
  const { toast, confirm } = useFeedback();
  const [status, setStatus] = useState('Open');
  const list = useAsync(() => admin.support(status), [status]);
  const [open, setOpen] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!reply.trim()) return;
    setBusy(true);
    try { const r = await admin.replySupport(open.id, reply.trim()); toast(r.message, r.emailed ? 'ok' : 'error'); setOpen(null); setReply(''); list.reload(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  async function setState(item, s) {
    try { await admin.supportStatus(item.id, s); list.reload(); setOpen(null); } catch (e) { toast(e.message, 'error'); }
  }
  async function remove(item) {
    if (!await confirm({ title: 'Delete this message?', ok: 'Delete', danger: true })) return;
    try { await admin.deleteSupport(item.id); list.reload(); setOpen(null); } catch (e) { toast(e.message, 'error'); }
  }

  return (
    <>
      <PageHead title="Support inbox" sub="Messages from the Contact the admins form. Students whose account is deactivated can write here. Your reply is emailed to them." />
      <section className="adm-card">
        <div className="adm-toolbar">
          <div className="adm-seg">
            {[['Open', 'Open'], ['Replied', 'Replied'], ['Closed', 'Closed'], ['', 'All']].map(([v, l]) => (
              <button key={l} type="button" className={status === v ? 'on' : ''} onClick={() => setStatus(v)}>{l}{v === 'Open' && list.data?.open ? ` (${list.data.open})` : ''}</button>
            ))}
          </div>
        </div>
        {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
        {list.loading && !list.data && <Loading />}
        {list.data?.items.length === 0 && <Empty title="Nothing here" text="New messages appear here and are also emailed to the admin email." />}
        <ul className="adm-list">
          {list.data?.items.map(i => (
            <li key={i.id} className="adm-support-row" onClick={() => { setOpen(i); setReply(''); }}>
              <div className="grow">
                <strong>{i.subject}</strong>
                <small>{i.name} · {i.email} · {timeAgo(i.createdAt)}{i.accountActive === false ? ' · account deactivated' : ''}</small>
                <p className="adm-truncate">{i.message}</p>
              </div>
              <span className={`adm-pill ${i.status === 'Open' ? 'warn' : i.status === 'Replied' ? 'ok' : ''}`}>{i.status}</span>
            </li>
          ))}
        </ul>
      </section>

      {open && (
        <Modal title={open.subject} onClose={() => setOpen(null)} size="lg">
          <p className="adm-hint">From <strong>{open.name}</strong> &lt;{open.email}&gt; · {new Date(open.createdAt).toLocaleString()}</p>
          {open.userId && <p><Link to={`/admin/users?q=${encodeURIComponent(open.email)}`}>Open this account in Users</Link>{open.accountActive === false && ' (deactivated: you can reactivate it there)'}</p>}
          <div className="adm-note-box">{open.message}</div>
          {open.reply && <><h3 className="adm-section">Your reply ({timeAgo(open.repliedAt)})</h3><div className="adm-note-box">{open.reply}</div></>}
          <label className="adm-field wide"><span className="adm-label">{open.reply ? 'Send another reply' : 'Reply'}</span>
            <textarea rows={6} value={reply} onChange={e => setReply(e.target.value)} placeholder={`Hi ${open.name.split(' ')[0]}, …`} /></label>
          <div className="adm-modal-actions">
            <button type="button" className="adm-btn danger ghost" onClick={() => remove(open)}>Delete</button>
            {open.status !== 'Closed' ? <button type="button" className="adm-btn" onClick={() => setState(open, 'Closed')}>Close without reply</button>
              : <button type="button" className="adm-btn" onClick={() => setState(open, 'Open')}>Re-open</button>}
            <button type="button" className="adm-btn primary" disabled={busy || !reply.trim()} onClick={send}>{busy ? 'Sending…' : 'Send reply'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

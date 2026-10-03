import { useEffect, useState } from 'react';
import { admin } from '../adminApi';
import { Empty, ErrorBox, Field, Icon, Loading, PageHead, timeAgo, useAsync, useFeedback } from '../ui';

const KIND_LABEL = {
  Welcome: 'Welcome', PasswordReset: 'Password reset', DueSoon: 'Due soon', Overdue: 'Overdue', AccountStatus: 'Account status',
  Support: 'Support', Custom: 'Admin message', Announcement: 'Announcement', SupportReply: 'Support reply', Test: 'Test',
};

/** Write emails to students (one person, a badge group or everyone) and see every email the system has sent. */
export default function Emails() {
  const { toast, confirm } = useFeedback();
  const [filter, setFilter] = useState({ kind: '', status: '', q: '' });
  const [q, setQ] = useState('');
  const log = useAsync(() => admin.emails(filter), [filter.kind, filter.status, filter.q]);
  const [form, setForm] = useState({ audience: 'user', badge: 'Gold', subject: '', heading: '', body: '' });
  const [people, setPeople] = useState([]);
  const [find, setFind] = useState('');
  const [matches, setMatches] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const t = setTimeout(() => setFilter(f => ({ ...f, q: q.trim() })), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    if (find.trim().length < 2) { setMatches([]); return undefined; }
    const t = setTimeout(() => admin.users({ q: find.trim(), role: 'Student' }).then(u => setMatches(u.slice(0, 6))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [find]);

  async function send(e) {
    e.preventDefault();
    if (form.audience === 'user' && people.length === 0) { toast('Choose at least one student.', 'error'); return; }
    const who = form.audience === 'user' ? `${people.length} student${people.length === 1 ? '' : 's'}` : form.audience === 'all' ? 'every active student' : `all ${form.badge} students`;
    if (!await confirm({ title: 'Send this email?', message: `It will be sent to ${who}. Each email counts towards your EmailJS monthly limit.`, ok: 'Send' })) return;
    setBusy(true);
    try {
      const r = await admin.sendEmail({ audience: form.audience, userIds: people.map(p => p.id), badge: form.badge, subject: form.subject, heading: form.heading, body: form.body });
      toast(r.message, r.failed ? 'error' : 'ok');
      setForm(f => ({ ...f, subject: '', heading: '', body: '' })); setPeople([]);
      log.reload();
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <PageHead title="Emails" sub="Send a message to students without leaving the admin panel. Every email uses the ProjectMentor template. Automatic emails are switched on or off in System settings." />
      {log.data && !log.data.ready && <div className="adm-error"><span>EmailJS is not set up yet. Add the keys in System settings first.</span></div>}

      <section className="adm-card adm-card-pad">
        <h2 className="adm-section">Write an email</h2>
        <form className="adm-form" onSubmit={send}>
          <Field label="Send to">
            <div className="adm-seg">
              {[['user', 'Selected students'], ['badge', 'Students with a badge'], ['all', 'All active students']].map(([v, l]) => (
                <button key={v} type="button" className={form.audience === v ? 'on' : ''} onClick={() => setForm(f => ({ ...f, audience: v }))}>{l}</button>
              ))}
            </div>
          </Field>
          {form.audience === 'user' && (
            <Field label="Students" hint="Search by name or email.">
              <div className="adm-people-pick">
                {people.map(p => <span key={p.id} className="adm-pill dark">{p.fullName}<button type="button" onClick={() => setPeople(x => x.filter(y => y.id !== p.id))} aria-label={`Remove ${p.fullName}`}>×</button></span>)}
                <input value={find} onChange={e => setFind(e.target.value)} placeholder="Type a name or email" />
              </div>
              {matches.length > 0 && (
                <div className="adm-pick-list">
                  {matches.map(u => (
                    <button key={u.id} type="button" onClick={() => { if (!people.some(p => p.id === u.id)) setPeople(x => [...x, u]); setFind(''); setMatches([]); }}>
                      <strong>{u.fullName}</strong><small>{u.email}{u.isActive ? '' : ' · deactivated'}</small>
                    </button>
                  ))}
                </div>
              )}
            </Field>
          )}
          {form.audience === 'badge' && (
            <Field label="Badge">
              <select value={form.badge} onChange={e => setForm(f => ({ ...f, badge: e.target.value }))}>{['Silver', 'Gold', 'Premium', 'Diamond'].map(b => <option key={b}>{b}</option>)}</select>
            </Field>
          )}
          <Field label="Subject"><input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} required maxLength={200} placeholder="e.g. Your progress this week" /></Field>
          <Field label="Heading" hint="The big title inside the email. Leave blank to use the subject."><input value={form.heading} onChange={e => setForm(f => ({ ...f, heading: e.target.value }))} maxLength={200} /></Field>
          <Field label="Message" hint="Plain text. Leave a blank line between paragraphs. The student's name is added automatically (Hi Amara,)." wide>
            <textarea rows={8} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} required />
          </Field>
          <div className="adm-modal-actions"><button type="submit" className="adm-btn primary" disabled={busy}><Icon name="mail" size={16} />{busy ? 'Sending…' : 'Send email'}</button></div>
        </form>
      </section>

      <section className="adm-card">
        <div className="adm-toolbar">
          <h2 className="adm-section" style={{ margin: 0 }}>Email log</h2>
          {log.data && <span className="adm-pill">{log.data.sentLast30Days} sent in the last 30 days</span>}
          <div className="adm-search"><Icon name="search" /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search email or subject" /></div>
          <select value={filter.kind} onChange={e => setFilter(f => ({ ...f, kind: e.target.value }))} aria-label="Type">
            <option value="">All types</option>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))} aria-label="Status">
            <option value="">All</option><option>Sent</option><option>Failed</option><option>Skipped</option>
          </select>
        </div>
        {log.error && <ErrorBox error={log.error} onRetry={log.reload} />}
        {log.loading && !log.data && <Loading />}
        {log.data?.items.length === 0 && <Empty title="No emails yet" text="Emails appear here as soon as the system or an admin sends one." />}
        {log.data?.items.length > 0 && (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>To</th><th>Subject</th><th className="hide-sm">Type</th><th>Status</th><th className="hide-sm">When</th></tr></thead>
              <tbody>
                {log.data.items.map(e => (
                  <tr key={e.id}>
                    <td className="t-main"><strong>{e.toName ?? e.toEmail}</strong><small>{e.toEmail}</small></td>
                    <td className="t-main"><strong>{e.subject}</strong>{e.error && <small className="adm-err-text">{e.error}</small>}</td>
                    <td className="hide-sm">{KIND_LABEL[e.kind] ?? e.kind}</td>
                    <td><span className={`adm-pill ${e.status === 'Sent' ? 'ok' : e.status === 'Failed' ? 'bad' : 'warn'}`}>{e.status}</span></td>
                    <td className="hide-sm">{timeAgo(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

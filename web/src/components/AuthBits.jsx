import { useState } from 'react';
import { contactAdmin } from '../api/projectMentorApi';

/** Password input with a show/hide toggle and an optional strength meter. */
export function PasswordField({ label, name, value, onChange, error, autoComplete = 'current-password', meter = false }) {
  const [show, setShow] = useState(false);
  const score = strength(value);
  return (
    <label className="form-field">{label}
      <span className="pw-wrap">
        <input name={name} type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={onChange} aria-invalid={Boolean(error)} />
        <button type="button" className="pw-toggle" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? 'Hide' : 'Show'}
        </button>
      </span>
      {meter && value && (
        <span className="pw-meter" aria-live="polite">
          <span className={`pw-bar s${score}`}><i /><i /><i /><i /></span>
          <small>{['Too short', 'Weak', 'Fair', 'Good', 'Strong'][score]}</small>
        </span>
      )}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

export function strength(p = '') {
  if (p.length < 8) return 0;
  let s = 1;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p) || p.length >= 12) s++;
  return Math.min(s, 4);
}

/**
 * "Contact the ProjectMentor admins" form. Name, email and a ready-made message are filled in for deactivated
 * accounts so the student only has to press Send. The message is emailed to the admin and saved in the admin support inbox.
 */
export function ContactAdminForm({ name = '', email = '', reason = '', deactivated = false, onDone }) {
  const when = new Date().toLocaleString();
  const [form, setForm] = useState({
    name, email,
    subject: deactivated ? 'Please review my deactivated account' : '',
    message: deactivated
      ? `Hello ProjectMentor team,\n\nMy account (${email || 'my email'}) was deactivated${reason ? ` with the reason: "${reason}"` : ''}. I tried to sign in on ${when}.\n\nCould you please review my account and let me know what I need to do to use it again?\n\nThank you,\n${name || ''}`
      : '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const set = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { setSent((await contactAdmin(form)).message); onDone?.(); }
    catch (err) { setError(err.message || 'Could not send your message.'); }
    finally { setBusy(false); }
  }

  if (sent) return <div className="contact-sent" role="status"><strong>Message sent</strong><p>{sent}</p></div>;
  return (
    <form className="auth-form" onSubmit={submit}>
      <div className="form-grid-2">
        <label className="form-field">Your name<input name="name" value={form.name} onChange={set} required /></label>
        <label className="form-field">Account email<input name="email" type="email" value={form.email} onChange={set} required /></label>
      </div>
      <label className="form-field">Subject<input name="subject" value={form.subject} onChange={set} required /></label>
      <label className="form-field">Message<textarea name="message" rows={7} value={form.message} onChange={set} required /></label>
      {error && <p className="error-message" role="alert">{error}</p>}
      <button className="button button-primary" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Sending…' : 'Send to the admins'}</button>
    </form>
  );
}

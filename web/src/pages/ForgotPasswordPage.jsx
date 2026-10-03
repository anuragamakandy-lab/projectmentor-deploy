import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import { PasswordField } from '../components/AuthBits';
import { forgotPassword, resetPassword } from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';
import { validateEmail, validatePassword } from '../auth/validation';

/** Forgot password: 1) email a 6-digit code, 2) enter the code and a new password (signs you in). */
export default function ForgotPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { loginWithSession } = useAuth();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState(location.state?.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e) {
    e?.preventDefault();
    const bad = validateEmail(email);
    if (bad) { setError(bad); return; }
    setBusy(true); setError('');
    try { setMsg((await forgotPassword(email.trim())).message); setStep(2); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function reset(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) { setError('Enter the 6-digit code from the email.'); return; }
    const weak = validatePassword(password);
    if (weak) { setError(weak); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true); setError('');
    try {
      const session = await resetPassword({ email: email.trim(), code: code.trim(), password });
      loginWithSession(session);
      navigate('/', { replace: true });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <AuthShell title="Locked out? It happens." points={['We email you a 6-digit code', 'The code works for 15 minutes', 'Choose a new password and you are back in']}>
      <section className="auth-card rise">
        <p className="eyebrow">Step {step} of 2</p>
        <h1>{step === 1 ? 'Reset your password' : 'Check your email'}</h1>
        {step === 1 ? (
          <>
            <p className="auth-intro">Enter the email you use for ProjectMentor and we will send you a code.</p>
            <form className="auth-form" onSubmit={send} noValidate>
              <label className="form-field">Email<input type="email" autoComplete="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} /></label>
              {error && <p className="error-message" role="alert">{error}</p>}
              <button className="button button-primary" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Sending…' : 'Send code'}</button>
            </form>
          </>
        ) : (
          <>
            <p className="auth-intro">{msg}</p>
            <form className="auth-form" onSubmit={reset} noValidate>
              <label className="form-field">6-digit code
                <input className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError(''); }} />
              </label>
              <PasswordField label="New password" name="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" meter />
              <PasswordField label="Confirm new password" name="confirm" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
              {error && <p className="error-message" role="alert">{error}</p>}
              <button className="button button-primary" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Saving…' : 'Save new password'}</button>
            </form>
            <p className="auth-switch"><button type="button" className="linklike" onClick={send} disabled={busy}>Send a new code</button></p>
          </>
        )}
        <p className="auth-switch">Remembered it? <Link to="/login">Log in</Link></p>
      </section>
    </AuthShell>
  );
}

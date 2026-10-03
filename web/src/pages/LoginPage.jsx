import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import GoogleButton from '../components/GoogleButton';
import { ContactAdminForm, PasswordField } from '../components/AuthBits';
import { useAuth } from '../auth/AuthContext';
import { validateEmail } from '../auth/validation';

// Only allow in-app paths (no //evil.com style open redirects).
export function returnPath(state) {
  const from = state?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !from.startsWith('/login') && !from.startsWith('/register') ? from : null;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = returnPath(location.state);
  const joining = from?.startsWith('/join/');
  const { login, loginWithSession, logout, isAuthenticated } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deactivated, setDeactivated] = useState(null);
  const [contact, setContact] = useState(false);

  // After signing in students go to the home page (or back to the page that sent them here).
  useEffect(() => { if (isAuthenticated) navigate(from ?? '/', { replace: true }); }, [isAuthenticated, navigate, from]);

  function finish(session) {
    if (session.role === 'Admin') {
      logout();
      setServerError('This is an admin account. Please sign in on the admin page: /admin/login');
      return;
    }
    navigate(from ?? '/', { replace: true });
  }

  function failed(error) {
    if (error.status === 403 && error.body?.code === 'deactivated') { setDeactivated(error.body); return; }
    // Google account with no ProjectMentor account: never create one here — send them to Create account.
    if (error.status === 404 && error.body?.code === 'no_account') {
      navigate('/register', { state: { ...(from ? { from } : {}), email: error.body.email, name: error.body.name, noAccount: true } });
      return;
    }
    setServerError(error.code === 'API_UNREACHABLE'
      ? 'Cannot reach the server. Make sure the backend and database are running.'
      : error.status === 401 ? 'Incorrect email or password.' : error.message || 'Unable to log in. Please try again.');
  }

  function googleSession(session) {
    if (session.role === 'Admin') { setServerError('This is an admin account. Please sign in on the admin page: /admin/login'); return; }
    loginWithSession(session);
    navigate(from ?? '/', { replace: true });
  }

  if (isAuthenticated) return null;

  function updateField(event) {
    const { name, value } = event.target;
    setForm(current => ({ ...current, [name]: value }));
    setErrors(current => ({ ...current, [name]: '' }));
    setServerError('');
  }

  async function submit(event) {
    event.preventDefault();
    const nextErrors = { email: validateEmail(form.email), password: form.password ? '' : 'Password is required.' };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;
    setBusy(true); setServerError('');
    try { finish(await login({ email: form.email.trim(), password: form.password })); }
    catch (error) { failed(error); }
    finally { setBusy(false); }
  }

  if (deactivated) {
    return (
      <AuthShell title="We are here to help." points={['Tell us what happened', 'An admin reviews every message', 'You get a reply by email']}>
        <section className="auth-card rise">
          <div className="deact-badge" aria-hidden="true">!</div>
          <h1>Your account is deactivated.</h1>
          <p className="auth-intro">Contact the ProjectMentor admins and they will review your account.
            {deactivated.reason && <><br /><strong>Reason given:</strong> {deactivated.reason}</>}</p>
          {contact
            ? <ContactAdminForm name={deactivated.name} email={deactivated.email} reason={deactivated.reason} deactivated />
            : <button className="button button-primary" type="button" style={{ width: '100%' }} onClick={() => setContact(true)}>Contact the admins</button>}
          <p className="auth-switch"><button type="button" className="linklike" onClick={() => { setDeactivated(null); setContact(false); }}>Back to log in</button></p>
        </section>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Welcome back to your project." points={['Your roadmap and next milestone', 'Your group, sprint board and chat', 'Mock vivas, lessons and templates']}>
      <section className="auth-card rise">
        <p className="eyebrow">Welcome back</p>
        <h1>Log in</h1>
        <p className="auth-intro">Pick up where you left off.</p>
        {new URLSearchParams(location.search).get('expired') && <p className="error-message" role="status">Your session expired. Please log in again.</p>}
        {joining && <p className="auth-invite" role="status">You were invited to a project group. Log in, then you can join it. No account yet? Create one first.</p>}
        <GoogleButton text="signin_with" onSession={googleSession} onError={setServerError} onFailure={failed} first />
        <form className="auth-form" onSubmit={submit} noValidate>
          <label className="form-field">Email
            <input name="email" type="email" autoComplete="email" value={form.email} onChange={updateField} aria-invalid={Boolean(errors.email)} />
            {errors.email && <small className="field-error">{errors.email}</small>}
          </label>
          <PasswordField label="Password" name="password" value={form.password} onChange={updateField} error={errors.password} />
          <div className="auth-row"><Link to="/forgot-password" state={{ email: form.email }}>Forgot password?</Link></div>
          {serverError && <p className="error-message" role="alert">{serverError}</p>}
          <button className="button button-primary" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Logging in…' : 'Log in'}</button>
        </form>
        <p className="auth-switch">New to ProjectMentor? <Link to="/register" state={from ? { from } : undefined}>Create an account</Link></p>
      </section>
    </AuthShell>
  );
}

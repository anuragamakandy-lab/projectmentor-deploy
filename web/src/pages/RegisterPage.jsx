import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import GoogleButton from '../components/GoogleButton';
import { PasswordField } from '../components/AuthBits';
import { googleRegister, registerStudent, startRegistration } from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';
import { googleProfile, validateEmail, validatePassword } from '../auth/validation';
import { returnPath } from './LoginPage';

/**
 * Create account. Two ways:
 *  - Email: details → 6-digit code emailed to prove the address → account created.
 *  - Google: pick a Google account (Google proves the email) → choose a password → account created.
 */
export default function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = returnPath(location.state);
  const joining = from?.startsWith('/join/');
  const noAccount = Boolean(location.state?.noAccount);
  const { loginWithSession, isAuthenticated } = useAuth();
  const [form, setForm] = useState({ fullName: typeof location.state?.name === 'string' ? location.state.name : '', email: typeof location.state?.email === 'string' ? location.state.email : '', password: '', confirmPassword: '', yearOfStudy: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('form'); // form | code | google
  const [verify, setVerify] = useState(null); // { token, email, message }
  const [code, setCode] = useState('');
  const [google, setGoogle] = useState(null); // { credential, email }

  useEffect(() => { if (isAuthenticated) navigate(from ?? '/', { replace: true }); }, [isAuthenticated, navigate, from]);
  if (isAuthenticated) return null;

  function updateField(event) {
    const { name, value } = event.target;
    setForm(current => ({ ...current, [name]: value }));
    setErrors(current => ({ ...current, [name]: '' }));
    setServerError('');
  }

  function validate(withEmail) {
    const next = {};
    if (form.fullName.trim().length < 2) next.fullName = 'Enter your full name.';
    if (withEmail) next.email = validateEmail(form.email);
    next.password = validatePassword(form.password);
    if (!form.confirmPassword) next.confirmPassword = 'Confirm your password.';
    else if (form.password !== form.confirmPassword) next.confirmPassword = 'Passwords do not match.';
    setErrors(next);
    return !Object.values(next).some(Boolean);
  }

  function showError(error) {
    setServerError(error.code === 'API_UNREACHABLE'
      ? 'Cannot reach the server. Please try again in a moment.'
      : error.message || 'Unable to create your account. Please try again.');
  }

  function done(session) {
    if (session.role === 'Admin') { setServerError('This is an admin account. Please sign in on the admin page.'); return; }
    loginWithSession(session);
    navigate(from ?? '/', { replace: true });
  }

  const details = () => ({ fullName: form.fullName.trim(), email: form.email.trim(), password: form.password, yearOfStudy: form.yearOfStudy ? Number(form.yearOfStudy) : null });

  async function sendCode(event) {
    event?.preventDefault();
    if (!validate(true)) return;
    setBusy(true); setServerError('');
    try {
      const r = await startRegistration(details());
      setVerify({ token: r.verificationToken, email: r.email, message: r.message });
      setCode(''); setStep('code');
    } catch (error) { showError(error); }
    finally { setBusy(false); }
  }

  async function confirmCode(event) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) { setErrors({ code: 'Enter the 6-digit code from the email.' }); return; }
    setBusy(true); setServerError('');
    try { done(await registerStudent({ ...details(), code: code.trim(), verificationToken: verify.token })); }
    catch (error) { showError(error); }
    finally { setBusy(false); }
  }

  function onGoogle(credential) {
    const p = googleProfile(credential);
    setGoogle({ credential, email: p.email });
    setForm(f => ({ ...f, email: p.email, fullName: f.fullName || p.name, password: '', confirmPassword: '' }));
    setErrors({}); setServerError(''); setStep('google');
  }

  async function finishGoogle(event) {
    event.preventDefault();
    if (!validate(false)) return;
    setBusy(true); setServerError('');
    try { done(await googleRegister({ idToken: google.credential, fullName: form.fullName.trim(), password: form.password, yearOfStudy: form.yearOfStudy ? Number(form.yearOfStudy) : null })); }
    catch (error) {
      if (error.status === 401) { setStep('form'); setGoogle(null); }
      showError(error);
    }
    finally { setBusy(false); }
  }

  const back = () => { setStep('form'); setGoogle(null); setVerify(null); setServerError(''); setErrors({}); };
  const loginLink = <p className="auth-switch">Already have an account? <Link to="/login" state={from ? { from } : undefined}>Log in</Link></p>;

  const nameAndYear = (
    <div className="form-grid-2">
      <label className="form-field">Full name
        <input name="fullName" type="text" autoComplete="name" value={form.fullName} onChange={updateField} aria-invalid={Boolean(errors.fullName)} placeholder="e.g. Amara Silva" />
        {errors.fullName && <small className="field-error">{errors.fullName}</small>}
      </label>
      <label className="form-field">Year of study <span className="optional">optional</span>
        <select name="yearOfStudy" value={form.yearOfStudy} onChange={updateField}>
          <option value="">Choose</option>
          {[1, 2, 3, 4].map(y => <option key={y} value={y}>Year {y}</option>)}
        </select>
      </label>
    </div>
  );
  const passwords = (
    <div className="form-grid-2">
      <PasswordField label="Password" name="password" value={form.password} onChange={updateField} error={errors.password} autoComplete="new-password" meter />
      <PasswordField label="Confirm password" name="confirmPassword" value={form.confirmPassword} onChange={updateField} error={errors.confirmPassword} autoComplete="new-password" />
    </div>
  );

  return (
    <AuthShell title="Plan, build and defend your project." points={['A dated roadmap sized to your deadline', 'Private groups with a weekly sprint board', 'An AI examiner to practise your viva', 'A community of students building projects']}>
      <section className="auth-card auth-card-wide rise">
        {step === 'code' && verify && (
          <>
            <p className="eyebrow">Step 2 of 2</p>
            <h1>Check your email</h1>
            <p className="auth-intro">{verify.message}</p>
            <form className="auth-form" onSubmit={confirmCode} noValidate>
              <label className="form-field">6-digit code
                <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} autoFocus
                  onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setErrors({}); setServerError(''); }} aria-invalid={Boolean(errors.code)} placeholder="123456" />
                {errors.code && <small className="field-error">{errors.code}</small>}
              </label>
              {serverError && <p className="error-message" role="alert">{serverError}</p>}
              <button className="button button-primary" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Checking…' : 'Verify and create account'}</button>
            </form>
            <p className="auth-switch">
              Didn’t get it? Check spam, or <button type="button" className="linklike" onClick={() => sendCode()} disabled={busy}>send a new code</button>
              {' · '}<button type="button" className="linklike" onClick={back}>change details</button>
            </p>
          </>
        )}

        {step === 'google' && google && (
          <>
            <p className="eyebrow">Create account with Google</p>
            <h1>Choose a password</h1>
            <p className="auth-intro">Your account will use <strong>{google.email}</strong>. Set a password so you can also log in with your email.</p>
            <form className="auth-form" onSubmit={finishGoogle} noValidate>
              {nameAndYear}
              {passwords}
              {serverError && <p className="error-message" role="alert">{serverError}</p>}
              <button className="button button-primary" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Creating your account…' : 'Create account'}</button>
            </form>
            <p className="auth-switch"><button type="button" className="linklike" onClick={back}>Use a different method</button></p>
          </>
        )}

        {step === 'form' && (
          <>
            <p className="eyebrow">Free student account</p>
            <h1>Create your account</h1>
            <p className="auth-intro">One account for the website and the mobile app.</p>
            {noAccount && <p className="auth-invite" role="status">There is no ProjectMentor account for that Google email yet. Create one below.</p>}
            {joining && <p className="auth-invite" role="status">You were invited to a project group. Create your account, then you can join it.</p>}
            <GoogleButton text="signup_with" onCredential={onGoogle} onError={setServerError} first />
            <form className="auth-form" onSubmit={sendCode} noValidate>
              {nameAndYear}
              <label className="form-field">Email
                <input name="email" type="email" autoComplete="email" value={form.email} onChange={updateField} aria-invalid={Boolean(errors.email)} placeholder="you@university.edu" />
                {errors.email && <small className="field-error">{errors.email}</small>}
              </label>
              {passwords}
              {serverError && <p className="error-message" role="alert">{serverError}</p>}
              <button className="button button-primary" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Sending code…' : 'Continue'}</button>
              <p className="auth-fine">We’ll email you a 6-digit code to confirm your address. By creating an account you agree to keep the community kind and never share passwords or other people's personal details.</p>
            </form>
          </>
        )}
        {loginLink}
      </section>
    </AuthShell>
  );
}

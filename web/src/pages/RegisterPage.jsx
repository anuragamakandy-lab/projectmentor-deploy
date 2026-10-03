import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import GoogleButton from '../components/GoogleButton';
import { PasswordField, strength } from '../components/AuthBits';
import { registerStudent } from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';
import { validateEmail } from '../auth/validation';
import { returnPath } from './LoginPage';

export default function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = returnPath(location.state);
  const joining = from?.startsWith('/join/');
  const { loginWithSession, isAuthenticated } = useAuth();
  const [form, setForm] = useState({ fullName: '', email: typeof location.state?.email === 'string' ? location.state.email : '', password: '', confirmPassword: '', yearOfStudy: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (isAuthenticated) navigate(from ?? '/', { replace: true }); }, [isAuthenticated, navigate, from]);
  if (isAuthenticated) return null;

  function updateField(event) {
    const { name, value } = event.target;
    setForm(current => ({ ...current, [name]: value }));
    setErrors(current => ({ ...current, [name]: '' }));
    setServerError('');
  }

  function validate() {
    const next = {};
    if (form.fullName.trim().length < 2) next.fullName = 'Enter your full name.';
    next.email = validateEmail(form.email);
    if (strength(form.password) === 0) next.password = 'Use at least 8 characters.';
    if (form.password !== form.confirmPassword) next.confirmPassword = 'Passwords do not match.';
    setErrors(next);
    return !Object.values(next).some(Boolean);
  }

  function googleSession(session) {
    if (session.role === 'Admin') { setServerError('This is an admin account. Please sign in on the admin page.'); return; }
    loginWithSession(session);
    navigate(from ?? '/', { replace: true });
  }

  async function submit(event) {
    event.preventDefault();
    if (!validate()) return;
    setBusy(true); setServerError('');
    try {
      const session = await registerStudent({
        fullName: form.fullName.trim(), email: form.email.trim(), password: form.password,
        yearOfStudy: form.yearOfStudy ? Number(form.yearOfStudy) : null,
      });
      loginWithSession(session);
      navigate(from ?? '/', { replace: true });
    } catch (error) {
      setServerError(error.code === 'API_UNREACHABLE'
        ? 'Cannot reach the server. Make sure the backend and database are running.'
        : error.status === 409 ? 'This email already has an account. Try logging in instead.' : error.message || 'Unable to create your account. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Plan, build and defend your project." points={['A dated roadmap sized to your deadline', 'Private groups with a weekly sprint board', 'An AI examiner to practise your viva', 'A community of students building projects']}>
      <section className="auth-card auth-card-wide rise">
        <p className="eyebrow">Free student account</p>
        <h1>Create your account</h1>
        <p className="auth-intro">One account for the website and the mobile app.</p>
        {joining && <p className="auth-invite" role="status">You were invited to a project group. Create your account and you will join it straight away.</p>}
        <GoogleButton text="signup_with" onSession={googleSession} onError={setServerError} first />
        <form className="auth-form" onSubmit={submit} noValidate>
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
          <label className="form-field">University email
            <input name="email" type="email" autoComplete="email" value={form.email} onChange={updateField} aria-invalid={Boolean(errors.email)} placeholder="you@university.edu" />
            {errors.email && <small className="field-error">{errors.email}</small>}
          </label>
          <div className="form-grid-2">
            <PasswordField label="Password" name="password" value={form.password} onChange={updateField} error={errors.password} autoComplete="new-password" meter />
            <PasswordField label="Confirm password" name="confirmPassword" value={form.confirmPassword} onChange={updateField} error={errors.confirmPassword} autoComplete="new-password" />
          </div>
          {serverError && <p className="error-message" role="alert">{serverError}</p>}
          <button className="button button-primary" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Creating your account…' : 'Create account'}</button>
          <p className="auth-fine">By creating an account you agree to keep the community kind and never share passwords or other people's personal details.</p>
        </form>
        <p className="auth-switch">Already have an account? <Link to="/login" state={from ? { from } : undefined}>Log in</Link></p>
      </section>
    </AuthShell>
  );
}

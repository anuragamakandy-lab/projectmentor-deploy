import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login as loginRequest } from '../api/projectMentorApi';
import StarField from '../components/StarField';
import { adminSession, useAdminSession } from './adminSession';
import '../styles/auth-shell.css';
import './admin.css';

/** Separate sign-in page for the admin console (/admin/login). Students are told to use the main site. */
export default function AdminLogin() {
  const user = useAdminSession()?.user;
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const expired = new URLSearchParams(window.location.search).has('expired');

  useEffect(() => {
    document.title = 'Admin sign in · ProjectMentor';
    if (user?.role === 'Admin') navigate('/admin', { replace: true });
  }, [user, navigate]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.email.trim() || !form.password) { setError('Enter your email and password.'); return; }
    setBusy(true);
    try {
      const session = await loginRequest({ email: form.email.trim(), password: form.password });
      if (session.role !== 'Admin') {
        setError('This account is not an admin. Students sign in on the main website.');
        return;
      }
      adminSession.set(session);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.status === 401 ? 'Wrong email or password.' : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-login">
      <aside className="adm-login-art">
        <StarField />
        <img src="/logo-full-light.png" alt="ProjectMentor" />
        <div>
          <h2>One console for the website and the mobile app.</h2>
          <p>Everything students see is managed here. Changes go live on both the website and the app straight away.</p>
          <ul>
            <li>Approve or reject community posts</li>
            <li>Lessons, videos, templates and resources</li>
            <li>Home page sections and FAQ</li>
            <li>Users and project groups</li>
          </ul>
        </div>
        <small>ProjectMentor administration</small>
      </aside>
      <div className="adm-login-form">
        <form onSubmit={submit} noValidate>
          <div>
            <h1>Admin sign in</h1>
            <p>Use your administrator account.</p>
          </div>
          {expired && !error && <p className="adm-login-info" role="status">Your session ended. Please sign in again.</p>}
          {error && <p className="adm-login-error" role="alert">{error}</p>}
          <label>Email
            <input type="email" autoComplete="username" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </label>
          <label>Password
            <input type="password" autoComplete="current-password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </label>
          <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <Link className="adm-login-back" to="/">Back to the website</Link>
        </form>
      </div>
    </div>
  );
}

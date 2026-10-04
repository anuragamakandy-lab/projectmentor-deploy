import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { joinGroup, previewInvite } from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';
import '../styles/groups.css';

/**
 * Landing page for an invitation link (WhatsApp, email…). Open to everyone:
 *  - logged out → "sign up or log in first"; after that the student comes back here and joins automatically;
 *  - logged in  → shows WHICH account will join, with "Not you? Use a different account".
 */
export default function JoinGroupPage() {
  const { token: code } = useParams();
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const autoJoined = useRef(false);
  const here = `/join/${code}`;

  useEffect(() => {
    setPreview(null);
    previewInvite(token, code).then(setPreview).catch(e => setError(e.message));
  }, [token, code]);

  const isStudent = user?.role === 'Student';

  async function join() {
    setBusy(true); setError('');
    try {
      const r = await joinGroup(token, code);
      navigate(`/groups/${r.groupId}?welcome=1`, { replace: true });
    } catch (e) { setError(e.message); setBusy(false); }
  }

  // Just signed up / logged in from this link → join straight away.
  useEffect(() => {
    if (!location.state?.autoJoin || autoJoined.current || !token || !isStudent || !preview?.valid || preview.alreadyMember) return;
    autoJoined.current = true;
    join();
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function switchAccount() {
    logout();
    navigate('/login', { state: { from: here } });
  }

  const ask = { state: { from: here } };

  return (
    <main className="grp grp-join-page">
      <div className="grp-invite-card" style={{ '--g': preview?.color ?? '#0e7a52' }}>
        {!preview && !error && <p className="note">Checking your invite…</p>}

        {preview && preview.valid && (
          <>
            <span className="grp-badge big" aria-hidden="true">{preview.groupName?.slice(0, 1).toUpperCase()}</span>
            <p className="eyebrow">You’re invited to join</p>
            <h1>{preview.groupName}</h1>
            {preview.description && <p className="grp-invite-desc">{preview.description}</p>}
            <p className="grp-invite-meta">Created by <strong>{preview.ownerName}</strong> · {preview.memberCount} member{preview.memberCount === 1 ? '' : 's'}</p>

            {!token ? (
              <>
                <p className="auth-invite" role="status">To join this group, sign up first. Already have an account? Log in — you will join the group right after.</p>
                <Link className="button button-gold grp-join-btn" to="/register" {...ask}>Sign up to join</Link>
                <p className="grp-invite-note">Already have an account? <Link to="/login" {...ask}>Log in to join</Link></p>
              </>
            ) : preview.alreadyMember ? (
              <>
                <p className="grp-invite-note">You’re signed in as <strong>{user?.fullName}</strong> ({user?.email}), who is already a member of this group.</p>
                <Link className="button button-emerald" to={`/groups/${preview.groupId}`}>Open the group →</Link>
                <p className="grp-invite-note">Not you? <button type="button" className="linklike" onClick={switchAccount}>Log in with a different account</button></p>
              </>
            ) : !isStudent ? (
              <>
                <p className="error-message">Only student accounts can join project groups.</p>
                <p className="grp-invite-note"><button type="button" className="linklike" onClick={switchAccount}>Log in with a student account</button></p>
              </>
            ) : (
              <>
                <ul className="grp-invite-perks">
                  <li>See the team’s roadmap and deadlines</li>
                  <li>Pick up tasks on the weekly sprint board</li>
                  <li>Chat with your team</li>
                </ul>
                <button type="button" className="button button-gold grp-join-btn" onClick={join} disabled={busy}>{busy ? 'Joining…' : `Join ${preview.groupName}`}</button>
                <p className="grp-invite-note">Joining as <strong>{user?.fullName}</strong> ({user?.email}). Members can see your name.</p>
                <p className="grp-invite-note">Not you? <button type="button" className="linklike" onClick={switchAccount}>Log in with a different account</button></p>
              </>
            )}
          </>
        )}

        {preview && !preview.valid && (
          <>
            <span className="grp-invite-icon" aria-hidden="true"></span>
            <h1>This invite can’t be used</h1>
            <p className="grp-invite-desc">{preview.reason}</p>
            <Link className="button button-quiet" to={token ? '/groups' : '/'}>{token ? 'Go to my groups' : 'Go to the home page'}</Link>
          </>
        )}

        {error && <p className="error-message" role="alert">{error}</p>}
      </div>
    </main>
  );
}

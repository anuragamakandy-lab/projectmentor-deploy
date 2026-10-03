import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { joinGroup, previewInvite } from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';
import '../styles/groups.css';

/** Landing page for an invitation link: shows the group, then one click to join. */
export default function JoinGroupPage() {
  const { token: code } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    previewInvite(token, code).then(setPreview).catch(e => setError(e.message));
  }, [token, code]);

  async function join() {
    setBusy(true); setError('');
    try {
      const r = await joinGroup(token, code);
      navigate(`/groups/${r.groupId}?welcome=1`, { replace: true });
    } catch (e) { setError(e.message); setBusy(false); }
  }

  const isStudent = user?.role === 'Student';

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
            {preview.alreadyMember ? (
              <Link className="button button-emerald" to={`/groups/${preview.groupId}`}>You’re already a member — open the group →</Link>
            ) : !isStudent ? (
              <p className="error-message">Only student accounts can join project groups.</p>
            ) : (
              <>
                <ul className="grp-invite-perks">
                  <li>See the team’s roadmap and deadlines</li>
                  <li>Pick up tasks on the weekly sprint board</li>
                  <li>Chat with your team</li>
                </ul>
                <button type="button" className="button button-gold grp-join-btn" onClick={join} disabled={busy}>{busy ? 'Joining…' : `Join ${preview.groupName}`}</button>
                <p className="grp-invite-note">Joining as <strong>{user?.fullName}</strong>. Members can see your name.</p>
              </>
            )}
          </>
        )}

        {preview && !preview.valid && (
          <>
            <span className="grp-invite-icon" aria-hidden="true"></span>
            <h1>This invite can’t be used</h1>
            <p className="grp-invite-desc">{preview.reason}</p>
            <Link className="button button-quiet" to="/groups">Go to my groups</Link>
          </>
        )}

        {error && <p className="error-message" role="alert">{error}</p>}
      </div>
    </main>
  );
}

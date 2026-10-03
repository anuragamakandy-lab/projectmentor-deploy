import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getRoadmapRequest, planRoadmap } from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';
import MentorChat from '../components/roadmap/MentorChat';
import { RoadmapSteps } from '../components/roadmap/RoadmapKit';

function useProjectContext(id, state) {
  const key = `pm.chat.${id}`;
  if (state?.title) {
    try { sessionStorage.setItem(key, JSON.stringify(state)); } catch { /* ignore */ }
    return state;
  }
  try { return JSON.parse(sessionStorage.getItem(key) || '{}'); } catch { return {}; }
}

/** Step 3 of building a roadmap: talk the idea through with the mentor, then generate the roadmap. */
export default function StudentChatPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const ctx = useProjectContext(id, location.state);
  const [ready, setReady] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(false);
  const fromIdeas = (() => { try { return JSON.parse(sessionStorage.getItem('pm.intake') || '{}').mode === 'suggest'; } catch { return false; } })();

  // Already generated? Then this is the saved conversation.
  useEffect(() => {
    getRoadmapRequest(token, id).then(r => {
      if (r && (r.status === 'PendingApproval' || r.status === 'Accepted' || r.milestones?.length > 0)) navigate(`/student/roadmaps/${id}/conversation`, { replace: true });
      else setChecked(true);
    }).catch(() => setChecked(true));
  }, [token, id, navigate]);

  async function generate() {
    setGenerating(true); setError('');
    try {
      await planRoadmap(token, id, { title: ctx.title || null, summary: ctx.summary || null });
      try { sessionStorage.removeItem(`pm.chat.${id}`); sessionStorage.removeItem('pm.intake'); } catch { /* ignore */ }
      navigate(`/student/roadmaps/${id}`);
    } catch (e) {
      setError(e.message || 'Could not build the roadmap. Please try again.');
      setGenerating(false);
    }
  }

  const links = { details: { to: '/student' }, ...(fromIdeas ? { idea: { to: `/student/roadmaps/${id}/ideas` } } : {}) };
  return (
    <main className="page page-wide rm-page">
      <div className="rm-head">
        <div>
          <p className="eyebrow">New roadmap · mentor chat</p>
          <h1>{ctx.title || 'Shape your project'}</h1>
          <p className="page-lede">Ask anything about your idea. The mentor knows your details and remembers this chat. When you are ready, generate your roadmap.</p>
        </div>
      </div>
      <RoadmapSteps current="chat" links={{ ...links, idea: links.idea ?? (fromIdeas ? undefined : { to: '/student' }) }} />
      {checked && (
        <MentorChat requestId={id} onReady={setReady} footer={(
          <div className="mc-footer">
            <Link className="button button-quiet" to={fromIdeas ? `/student/roadmaps/${id}/ideas` : '/student'} state={{ back: true }}>← Back</Link>
            <span className="note">{ready ? 'Great, the mentor has enough to plan well.' : 'Answer a couple of questions for a better plan, or generate now.'}</span>
            <button className={`button ${ready ? 'button-primary' : 'button-gold'}`} onClick={generate} disabled={generating}>
              {generating ? 'Building your roadmap… (about 20 seconds)' : 'Generate my roadmap →'}
            </button>
          </div>
        )} />
      )}
      {error && <p className="error-message" role="alert">{error}</p>}
    </main>
  );
}

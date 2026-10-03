import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { renameRoadmapRequest, suggestIdeas } from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';
import { RoadmapSteps } from '../components/roadmap/RoadmapKit';

export default function StudentIdeasPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [ideas, setIdeas] = useState([]);
  const [seen, setSeen] = useState([]);
  const [available, setAvailable] = useState(true);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState('');
  const [error, setError] = useState('');

  const fetchIdeas = useCallback(async exclude => {
    setLoading(true); setError('');
    try {
      const data = await suggestIdeas(token, id, exclude);
      setAvailable(data.available); setMessage(data.message || ''); setIdeas(data.ideas || []);
      setSeen(prev => [...prev, ...(data.ideas || []).map(i => i.title)]);
    } catch (e) { setError(e.message || 'Could not load ideas.'); }
    finally { setLoading(false); }
  }, [token, id]);
  useEffect(() => { fetchIdeas([]); }, [fetchIdeas]);

  async function pick(idea) {
    setPicking(idea.title);
    // Save the chosen idea now so the mentor chatbot knows it from the first message.
    const summary = [idea.summary, idea.whyItFits && `Why it fits: ${idea.whyItFits}`, idea.techStack?.length && `Suggested stack: ${idea.techStack.join(', ')}`].filter(Boolean).join('\n');
    try { await renameRoadmapRequest(token, id, idea.title, summary); } catch { /* the chat still works without it */ }
    navigate(`/student/roadmaps/${id}/chat`, { state: { title: idea.title, summary } });
  }

  return (
    <main className="page page-wide rm-page">
      <div className="rm-head">
        <div>
          <p className="eyebrow">New roadmap</p>
          <h1>Ideas made for you</h1>
          <p className="page-lede">Based on your year, project type, deadline and weekly hours. Pick one, or ask for a fresh set.</p>
        </div>
      </div>
      <RoadmapSteps current="idea" links={{ details: { to: '/student' } }} />

      {error && <p className="error-message" role="alert">{error}</p>}
      {!available && !loading && (
        <section className="rm-panel">
          <h2>AI suggestions are not available right now</h2>
          <p className="note">{message || 'The AI key is not set up.'}</p>
          <Link className="button button-primary button-small" to="/student" state={{ back: true }}>Go back and enter my own idea</Link>
        </section>
      )}
      {loading && <section className="rm-panel rm-loading"><span className="rm-spinner" aria-hidden="true" /><p>The Idea agent is thinking. This takes a few seconds…</p></section>}

      {available && !loading && ideas.length > 0 && (
        <>
          <div className="idea-grid">
            {ideas.map(idea => (
              <article className="idea-card" key={idea.title}>
                <div className="idea-card-head"><span className="idea-diff">{idea.difficulty}</span></div>
                <h3>{idea.title}</h3>
                <p className="idea-summary">{idea.summary}</p>
                {idea.whyItFits && <p className="idea-why"><strong>Why it fits:</strong> {idea.whyItFits}</p>}
                {idea.techStack?.length > 0 && <div className="idea-tech">{idea.techStack.map(t => <span className="idea-tech-chip" key={t}>{t}</span>)}</div>}
                <button className="button button-primary button-small idea-pick" disabled={Boolean(picking)} onClick={() => pick(idea)}>
                  {picking === idea.title ? 'Opening the mentor…' : 'Choose this project'}
                </button>
              </article>
            ))}
          </div>
        </>
      )}
      <div className="rm-actions">
        <Link className="button button-quiet" to="/student" state={{ back: true }}>← Back to my details</Link>
        {available && !loading && <button type="button" className="button button-gold" disabled={Boolean(picking)} onClick={() => fetchIdeas(seen)}>↻ Show me other ideas</button>}
      </div>
    </main>
  );
}

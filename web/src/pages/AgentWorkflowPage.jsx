import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getRoadmapExecution, getRoadmapRequest } from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';
import '../styles/roadmap.css';

const STATUS = { Success: ['Done', 'ok'], Failed: ['Failed', 'bad'], Running: ['Running', 'wait'], Pending: ['Not run', 'wait'] };

/** How the four agents built THIS roadmap: one card per agent with a short, project-specific description. */
export default function AgentWorkflowPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getRoadmapExecution(token, id).then(setData).catch(e => setError(e.status === 404 ? 'This roadmap has not been planned yet.' : e.message));
    getRoadmapRequest(token, id).then(r => setTitle(r?.title || '')).catch(() => {});
  }, [token, id]);

  return (
    <main className="page page-wide rm-page">
      <div className="rm-head">
        <div>
          <p className="eyebrow">How the AI built this</p>
          <h1>{title || 'Your roadmap'}</h1>
          <p className="page-lede">Four agents worked on this roadmap one after another. Here is what each one did for your project.</p>
        </div>
        <Link className="button button-quiet button-small" to={`/student/roadmaps/${id}`}>← Back to the roadmap</Link>
      </div>

      {error && <section className="rm-panel"><p className="note">{error}</p></section>}
      {!data && !error && <section className="rm-panel rm-loading"><span className="rm-spinner" /><p>Loading…</p></section>}

      {data?.agents && (
        <ol className="ag-list">
          {data.agents.map((a, i) => {
            const [label, tone] = STATUS[a.status] ?? [a.status, 'wait'];
            return (
              <li key={a.agent} className="ag-card">
                <span className="ag-n">{i + 1}</span>
                <div className="ag-body">
                  <div className="ag-top">
                    <h2>{a.title}</h2>
                    <span className={`rl-status ${tone}`}>{label}</span>
                  </div>
                  <p className="ag-role">{a.role}</p>
                  <p className="ag-summary">{a.summary}</p>
                  {a.details?.length > 0 && <ul className="ag-details">{a.details.map((d, j) => <li key={j}>{d}</li>)}</ul>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}

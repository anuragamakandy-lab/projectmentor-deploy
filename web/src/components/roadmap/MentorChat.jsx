import { useEffect, useRef, useState } from 'react';
import { getAssistant, sendChat } from '../../api/projectMentorApi';
import { useAuth } from '../../auth/AuthContext';
import { Markdown, daysLeft, fmtDate } from './RoadmapKit';

/**
 * The roadmap mentor chatbot: a large chat with the project summary beside it. It opens with a summary of the
 * project and three suggested questions, answers anything the student types, and remembers the whole conversation.
 */
export default function MentorChat({ requestId, onReady, footer }) {
  const { token } = useAuth();
  const [messages, setMessages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [project, setProject] = useState(null);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(true);
  const [error, setError] = useState('');
  const logRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages, thinking]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await getAssistant(token, requestId);
        if (!alive) return;
        setMessages(r.messages); setSuggestions(r.suggestions ?? []); setProject(r.project ?? null); onReady?.(r.ready);
      } catch (e) { if (alive) setError(e.message || 'Could not open the chat.'); }
      finally { if (alive) setThinking(false); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, requestId]);

  async function ask(text) {
    const message = text.trim();
    if (!message || thinking) return;
    setMessages(m => [...m, { role: 'user', content: message }]);
    setInput(''); setSuggestions([]); setThinking(true); setError('');
    try {
      const r = await sendChat(token, requestId, message);
      setMessages(r.messages); setSuggestions(r.suggestions ?? []); if (r.project) setProject(r.project); onReady?.(r.ready);
    } catch (e) {
      setError(e.message || 'The mentor could not answer. Please try again.');
      setInput(message);
    } finally {
      setThinking(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="mc">
      <aside className="mc-side">
        <div className="mc-card">
          <p className="mc-eyebrow">Your project</p>
          <h2>{project?.title ?? 'Loading…'}</h2>
          {project?.description && <p className="mc-desc">{project.description}</p>}
          {project && (
            <dl className="mc-facts">
              <div><dt>Type</dt><dd>{project.projectType}</dd></div>
              <div><dt>Deadline</dt><dd>{fmtDate(project.deadline)}<small>{daysLeft(project.deadline) >= 0 ? `${daysLeft(project.deadline)} days left` : 'passed'}</small></dd></div>
              <div><dt>Time</dt><dd>{project.hoursPerWeek} h / week</dd></div>
              <div><dt>Team</dt><dd>{project.teamSize ? `${project.teamSize} ${project.teamSize === 1 ? 'person' : 'people'}` : 'Not set'}</dd></div>
              {project.technologies && <div><dt>You know</dt><dd>{project.technologies}</dd></div>}
            </dl>
          )}
          {project?.milestones > 0 && (
            <div className="mc-progress">
              <div className="mc-progress-top"><b>{project.done}/{project.milestones}</b> milestones done{project.overdue > 0 && <span className="mc-late">{project.overdue} overdue</span>}</div>
              <div className="mc-pbar"><span style={{ width: `${Math.round((project.done / project.milestones) * 100)}%` }} /></div>
              {project.nextMilestone && <p>Next: <b>{project.nextMilestone}</b> · {fmtDate(project.nextDue)}</p>}
            </div>
          )}
        </div>
        <div className="mc-card mc-tips">
          <p className="mc-eyebrow">Good questions to ask</p>
          <ul>
            <li>Who are the stakeholders?</li><li>What should version 1 include?</li><li>How do I design the database?</li><li>How do I test and deploy it?</li>
          </ul>
          <p className="mc-note">The mentor remembers this conversation. It is also used to write the "Concerns and solutions" section of your report.</p>
        </div>
      </aside>

      <section className="mc-main" aria-label="Mentor chat">
        <div className="mc-log" ref={logRef} aria-live="polite">
          {messages.map((m, i) => (
            <div className={`mc-row ${m.role}`} key={i}>
              {m.role === 'assistant' && <span className="mc-ava" aria-hidden="true"><img src="/logo-mark.png" alt="" /></span>}
              <div className="mc-bubble">{m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}</div>
            </div>
          ))}
          {thinking && (
            <div className="mc-row assistant">
              <span className="mc-ava" aria-hidden="true"><img src="/logo-mark.png" alt="" /></span>
              <div className="mc-bubble typing"><span /><span /><span /></div>
            </div>
          )}
        </div>
        {suggestions.length > 0 && !thinking && (
          <div className="mc-suggest" aria-label="Suggested questions">
            {suggestions.map(s => <button key={s} type="button" onClick={() => ask(s)}>{s}</button>)}
          </div>
        )}
        {error && <p className="error-message mc-error" role="alert">{error}</p>}
        <form className="mc-bar" onSubmit={e => { e.preventDefault(); ask(input); }}>
          <textarea ref={inputRef} rows={1} value={input} onChange={e => setInput(e.target.value)} placeholder="Ask your mentor anything about your project…"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); } }} aria-label="Your message" />
          <button className="button button-primary" type="submit" disabled={thinking || !input.trim()}>Send</button>
        </form>
        {footer}
      </section>
    </div>
  );
}

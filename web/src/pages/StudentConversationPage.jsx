import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getRoadmapRequest } from '../api/projectMentorApi';
import { useAuth } from '../auth/AuthContext';
import MentorChat from '../components/roadmap/MentorChat';

/** The mentor chatbot for a roadmap that already exists: same memory, project-aware answers and suggestions. */
export default function StudentConversationPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const [title, setTitle] = useState('');
  useEffect(() => { getRoadmapRequest(token, id).then(r => setTitle(r?.title || '')).catch(() => {}); }, [token, id]);

  return (
    <main className="page page-wide rm-page">
      <div className="rm-head">
        <div>
          <p className="eyebrow">Mentor chat</p>
          <h1>{title || 'Your project mentor'}</h1>
          <p className="page-lede">Ask about the next milestone, design, testing, your report or anything that is blocking you.</p>
        </div>
        <Link className="button button-quiet button-small" to={`/student/roadmaps/${id}`}>← Back to the roadmap</Link>
      </div>
      <MentorChat requestId={id} />
    </main>
  );
}

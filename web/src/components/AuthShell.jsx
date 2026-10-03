import { Link } from 'react-router-dom';
import StarField from './StarField';
import '../styles/auth-shell.css';

/** Sign-in / sign-up layout: a calm navy panel with a light 3D star field, and the form. No site navbar. */
export default function AuthShell({ title, points, children }) {
  return (
    <div className="ash">
      <aside className="ash-art">
        <StarField />
        <Link to="/" className="ash-logo"><img src="/logo-full-light.png" alt="ProjectMentor home" /></Link>
        <div className="ash-copy">
          <h2>{title}</h2>
          <ul>{points.map(p => <li key={p}>{p}</li>)}</ul>
        </div>
        <small>From first idea to final viva.</small>
      </aside>
      <main className="ash-main">
        <Link to="/" className="ash-back">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
          Back to home
        </Link>
        {children}
      </main>
    </div>
  );
}

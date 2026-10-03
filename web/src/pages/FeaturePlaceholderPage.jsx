import { Link } from 'react-router-dom';

export default function FeaturePlaceholderPage({ eyebrow, title, description }) {
  return (
    <main className="placeholder">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
      <p className="note" style={{ marginTop: '-12px', marginBottom: '30px' }}>In build — this component is on the roadmap. The Examiner has noted the deadline.</p>
      <Link className="button button-primary" to="/student">Back to workspace</Link>
    </main>
  );
}

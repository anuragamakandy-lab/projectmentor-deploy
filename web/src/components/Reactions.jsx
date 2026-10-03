// Facebook-style reactions drawn as small flat SVG icons (no emoji).
export const REACTIONS = [
  ['Like', 'Like', '#2F7FD1'],
  ['Love', 'Love', '#E0475B'],
  ['Care', 'Care', '#E8A33A'],
  ['Haha', 'Haha', '#E8B23A'],
  ['Excellent', 'Excellent', '#B5832F'],
  ['Angry', 'Angry', '#D9622B'],
];
export const REACTION_COLOR = Object.fromEntries(REACTIONS.map(([k, , c]) => [k, c]));

const face = (color, mouth, extra) => (
  <>
    <circle cx="12" cy="12" r="10" fill={color} />
    <circle cx="8.6" cy="10" r="1.3" fill="#3b2a12" />
    <circle cx="15.4" cy="10" r="1.3" fill="#3b2a12" />
    {extra}
    {mouth}
  </>
);

export function ReactionIcon({ type, size = 18 }) {
  const c = REACTION_COLOR[type] ?? '#2F7FD1';
  let body;
  switch (type) {
    case 'Love':
      body = <><circle cx="12" cy="12" r="11" fill={c} /><path d="M12 17.2l-4.3-4.1a2.7 2.7 0 0 1 3.8-3.8l.5.5.5-.5a2.7 2.7 0 0 1 3.8 3.8z" fill="#fff" /></>;
      break;
    case 'Care':
      body = face('#F6C343', <path d="M9 14.6q3 2.4 6 0" stroke="#3b2a12" strokeWidth="1.3" fill="none" strokeLinecap="round" />,
        <path d="M12 21.4l-3.6-3.4a2.2 2.2 0 0 1 3.1-3.1l.5.5.5-.5a2.2 2.2 0 0 1 3.1 3.1z" fill="#E0475B" />);
      break;
    case 'Haha':
      body = face('#F6C343', <path d="M7.5 13.2h9a4.5 4.5 0 0 1-9 0z" fill="#3b2a12" />);
      break;
    case 'Excellent':
      body = <><circle cx="12" cy="12" r="11" fill={c} /><path d="M12 5.6l1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill="#fff" /></>;
      break;
    case 'Angry':
      body = face('#E8743B', <path d="M9 16q3-2 6 0" stroke="#3b2a12" strokeWidth="1.3" fill="none" strokeLinecap="round" />,
        <path d="M6.8 7.6l3.2 1.4M17.2 7.6L14 9" stroke="#3b2a12" strokeWidth="1.3" strokeLinecap="round" />);
      break;
    default: // Like
      body = <><circle cx="12" cy="12" r="11" fill={c} /><path d="M7.5 11h2v6.5h-2zM10.5 17.5V11l2.6-4.2c.6-.9 2-.5 2 .6V10h2.4a1.3 1.3 0 0 1 1.3 1.5l-.8 4.8a1.4 1.4 0 0 1-1.4 1.2z" fill="#fff" /></>;
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{body}</svg>;
}

/** Up to three most-used reaction icons, overlapped, plus the total. */
export function ReactionSummary({ reactions = {}, total }) {
  const top = Object.entries(reactions).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!total) return <span />;
  return (
    <span className="rx-summary" title={Object.entries(reactions).map(([k, n]) => `${k} ${n}`).join(' · ')}>
      <span className="rx-stack">{top.map(([k]) => <span key={k} className="rx-chip"><ReactionIcon type={k} size={18} /></span>)}</span>
      {total}
    </span>
  );
}

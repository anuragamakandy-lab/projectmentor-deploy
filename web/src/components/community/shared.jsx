import { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useFeedback } from '../../ui/feedback';

/** Shared state for every community view (token, me, counts and the "log in first" guard). */
export const CommunityCtx = createContext(null);
export const useCommunity = () => useContext(CommunityCtx);

/** Returns guard(): true when signed in; otherwise shows the "Log in to continue" pop-up. */
export function useLoginGuard(isAuthenticated) {
  const { confirm } = useFeedback();
  const navigate = useNavigate();
  const location = useLocation();
  return async (what = 'do that') => {
    if (isAuthenticated) return true;
    if (await confirm({ title: 'Log in to continue', message: `You need a ProjectMentor account to ${what}. It only takes a minute.`, ok: 'Log in', cancel: 'Not now' }))
      navigate('/login', { state: { from: location.pathname + location.search } });
    return false;
  };
}

export const AUDIENCES = [
  ['Public', 'Public', 'Anyone on ProjectMentor'],
  ['Friends', 'Friends', 'Only your friends'],
  ['OnlyMe', 'Only me', 'Only you'],
];

export function AudienceIcon({ value, size = 13 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (value === 'Friends') return <svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><circle cx="17" cy="9" r="2.6" /><path d="M16 14.2a5 5 0 0 1 5.5 5" /></svg>;
  if (value === 'OnlyMe' || value === 'Private') return <svg {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>;
}

export function VerifiedTick({ size = 15 }) {
  return (
    <svg className="cm-verified" width={size} height={size} viewBox="0 0 24 24" aria-label="Official ProjectMentor page" role="img">
      <path fill="#1F6F7F" d="M12 1.8l2.6 1.9 3.2-.2 1 3 2.7 1.8-.9 3.1.9 3.1-2.7 1.8-1 3-3.2-.2L12 22.2l-2.6-1.9-3.2.2-1-3-2.7-1.8.9-3.1-.9-3.1 2.7-1.8 1-3 3.2.2z" />
      <path fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M7.6 12.3l3 3 5.8-6" />
    </svg>
  );
}

export const Icon = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V21h5v-6h4v6h5V9.5" /></svg>,
  people: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.6" /><path d="M2.5 20.5a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.4 3.4 0 0 1 0 6.6M18.5 14.5a6 6 0 0 1 3 6" /></svg>,
  bell: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>,
  search: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a7 7 0 0 1 14 0v1" /></svg>,
  comment: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.2-4.4A8 8 0 1 1 21 12z" /></svg>,
  share: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 5l7 7-7 7v-4c-5 0-8.5 1.5-11 5 1-5 4-10 11-11z" /></svg>,
  like: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 10v11H3V10zM7 10l4-7c1.4 0 2.5 1.2 2.3 2.6L12.8 9H19a2 2 0 0 1 2 2.3l-1.3 7.5A2.6 2.6 0 0 1 17.1 21H7" /></svg>,
  dots: <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>,
  photo: <svg viewBox="0 0 24 24" fill="none" stroke="#2E9E6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></svg>,
  file: <svg viewBox="0 0 24 24" fill="none" stroke="#2F7FD1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>,
  project: <svg viewBox="0 0 24 24" fill="none" stroke="#E8A33A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2l3 6 6 .9-4.5 4.4 1 6.2L12 16.6 6.5 19.5l1-6.2L3 8.9 9 8z" /></svg>,
  camera: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>,
};

// Rendered at the end of <body> so it always sits above the site navbar and the community bar.
export function Modal({ title, onClose, children, wide = false }) {
  return createPortal(
    <div className="cm-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`cm-modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="cm-modal-head">
          <h2>{title}</h2>
          <button type="button" className="cm-round" onClick={onClose} aria-label="Close">{Icon.close}</button>
        </div>
        <div className="cm-modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export const kb = n => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Renders **bold** and line breaks in user text safely (no HTML). */
export function RichText({ text }) {
  if (!text) return null;
  return text.split('\n').map((line, i) => (
    <span key={i}>{line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={j}>{part.slice(2, -2)}</strong> : part)}<br /></span>
  ));
}

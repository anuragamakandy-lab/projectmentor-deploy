import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import '../styles/feedback.css';

/**
 * Site-wide pop-ups: toasts and confirm dialogs that match the design, used instead of the
 * browser's window.alert / window.confirm.
 *   const { toast, confirm } = useFeedback();
 *   if (await confirm({ title, message, ok: 'Delete', danger: true })) ...
 */
const Feedback = createContext({ toast: () => {}, confirm: async () => false, prompt: async () => null });

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [value, setValue] = useState('');

  const toast = useCallback((text, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), tone === 'error' ? 6000 : 3200);
  }, []);
  const confirm = useCallback(options => new Promise(resolve => setDialog({ ...options, resolve })), []);
  const prompt = useCallback(options => new Promise(resolve => { setValue(options.value ?? ''); setDialog({ ...options, input: true, resolve }); }), []);

  const close = result => { dialog?.resolve(result); setDialog(null); };

  useEffect(() => {
    if (!dialog) return undefined;
    const onKey = e => { if (e.key === 'Escape') close(dialog.input ? null : false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <Feedback.Provider value={{ toast, confirm, prompt }}>
      {children}
      <div className="pm-toasts" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`pm-toast ${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
            <span className="pm-toast-dot" aria-hidden="true" />{t.text}
          </div>
        ))}
      </div>
      {dialog && (
        <div className="pm-overlay" onMouseDown={e => { if (e.target === e.currentTarget) close(dialog.input ? null : false); }}>
          <form className="pm-dialog" role="dialog" aria-modal="true" aria-labelledby="pm-dialog-title"
            onSubmit={e => { e.preventDefault(); close(dialog.input ? value : true); }}>
            <h2 id="pm-dialog-title">{dialog.title}</h2>
            {dialog.message && <p>{dialog.message}</p>}
            {dialog.input && (
              <input className="pm-dialog-input" type={dialog.inputType ?? 'text'} value={value} onChange={e => setValue(e.target.value)}
                placeholder={dialog.placeholder} autoFocus aria-label={dialog.title} />
            )}
            <div className="pm-dialog-actions">
              <button type="button" className="pm-btn" onClick={() => close(dialog.input ? null : false)}>{dialog.cancel ?? 'Cancel'}</button>
              <button type="submit" className={`pm-btn ${dialog.danger ? 'danger' : 'primary'}`} autoFocus={!dialog.input}>{dialog.ok ?? 'OK'}</button>
            </div>
          </form>
        </div>
      )}
    </Feedback.Provider>
  );
}

export const useFeedback = () => useContext(Feedback);

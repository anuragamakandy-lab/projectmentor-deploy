import { useEffect, useMemo, useState } from 'react';
import { admin } from '../adminApi';
import { ErrorBox, Field, Loading, PageHead, Toggle, formatDate, useAsync, useFeedback } from '../ui';

/**
 * System settings: every API key, id, address and email switch the system uses, in one place.
 * Saving updates the server immediately (no restart). Secret keys are never shown or copyable: they show
 * only "set" with the last 4 characters, and can be replaced by typing a new value.
 */
export default function SystemSettings() {
  const { toast } = useFeedback();
  const data = useAsync(() => admin.settings(), []);
  const [values, setValues] = useState({});
  const [secrets, setSecrets] = useState({});
  const [editing, setEditing] = useState({});
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState('');

  useEffect(() => {
    if (!data.data) return;
    setValues(Object.fromEntries(data.data.items.filter(i => !i.secret).map(i => [i.key, i.value ?? ''])));
    setSecrets({}); setEditing({});
  }, [data.data]);

  const groups = useMemo(() => {
    const g = new Map();
    (data.data?.items ?? []).forEach(i => { if (!g.has(i.group)) g.set(i.group, []); g.get(i.group).push(i); });
    return [...g.entries()];
  }, [data.data]);

  const original = Object.fromEntries((data.data?.items ?? []).filter(i => !i.secret).map(i => [i.key, i.value ?? '']));
  const changed = Object.keys(values).filter(k => values[k] !== original[k]);
  const secretChanged = Object.keys(secrets).filter(k => secrets[k]?.trim());
  const dirty = changed.length + secretChanged.length;

  async function save() {
    setBusy(true);
    try {
      const payload = Object.fromEntries([...changed.map(k => [k, values[k]]), ...secretChanged.map(k => [k, secrets[k].trim()])]);
      await admin.saveSettings(payload);
      toast('Settings saved. The whole system uses them now.');
      data.reload();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  async function test() {
    try { toast((await admin.testEmail(testTo.trim() || null)).message); }
    catch (e) { toast(e.message, 'error'); }
  }

  if (data.loading && !data.data) return <Loading />;
  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />;

  return (
    <>
      <PageHead title="System settings" sub="API keys, ids and addresses used by the website and the mobile app. Changes work straight away. Secret keys are stored encrypted and are never shown.">
        <button type="button" className="adm-btn primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : dirty ? `Save ${dirty} change${dirty === 1 ? '' : 's'}` : 'Saved'}</button>
      </PageHead>

      <div className="adm-settings-status">
        <span className={`adm-pill ${data.data.aiReady ? 'ok' : 'warn'}`}>AI {data.data.aiReady ? 'connected' : 'not set up'}</span>
        <span className={`adm-pill ${data.data.emailReady ? 'ok' : 'warn'}`}>Email {data.data.emailReady ? 'connected' : 'not set up'}</span>
      </div>

      {groups.map(([group, items]) => (
        <section className="adm-card adm-card-pad adm-settings" key={group}>
          <h2>{group}</h2>
          <div className="adm-settings-grid">
            {items.map(i => (
              <div key={i.key} className={`adm-setting${i.type === 'bool' ? ' bool' : ''}`}>
                {i.type === 'bool' ? (
                  <>
                    <Toggle checked={values[i.key] !== 'false'} onChange={v => setValues(x => ({ ...x, [i.key]: v ? 'true' : 'false' }))} label={i.label} />
                    <small className="adm-hint">{i.help}</small>
                  </>
                ) : (
                  <Field label={<>{i.label}{i.secret && <span className="adm-secret-tag">secret</span>}</>} hint={i.help}>
                    {i.secret ? (
                      editing[i.key] ? (
                        <span className="adm-secret-edit">
                          <input type="password" autoComplete="new-password" value={secrets[i.key] ?? ''} onChange={e => setSecrets(s => ({ ...s, [i.key]: e.target.value }))}
                            placeholder="Paste the new key" onCopy={e => e.preventDefault()} onCut={e => e.preventDefault()} autoFocus />
                          <button type="button" className="adm-btn sm ghost" onClick={() => { setEditing(x => ({ ...x, [i.key]: false })); setSecrets(s => ({ ...s, [i.key]: '' })); }}>Cancel</button>
                        </span>
                      ) : (
                        <span className="adm-secret-view">
                          <code>{i.isSet ? i.hint : 'Not set'}</code>
                          <button type="button" className="adm-btn sm" onClick={() => setEditing(x => ({ ...x, [i.key]: true }))}>{i.isSet ? 'Replace' : 'Add'}</button>
                        </span>
                      )
                    ) : (
                      <input type={i.type === 'email' ? 'email' : 'text'} value={values[i.key] ?? ''} onChange={e => setValues(x => ({ ...x, [i.key]: e.target.value }))} spellCheck={false} />
                    )}
                  </Field>
                )}
                {i.updatedAt && <small className="adm-updated">Updated {formatDate(i.updatedAt)}</small>}
              </div>
            ))}
          </div>
          {group.startsWith('Email') && (
            <div className="adm-test-email">
              <input type="email" value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="Send a test email to… (blank = admin email)" />
              <button type="button" className="adm-btn" onClick={test} disabled={dirty > 0} title={dirty ? 'Save your changes first' : undefined}>Send test email</button>
            </div>
          )}
        </section>
      ))}
      <p className="adm-note">The database connection and the login token secret are not here on purpose: the server needs them to start, so they stay in appsettings.Local.json (or environment variables) on the server.</p>
    </>
  );
}

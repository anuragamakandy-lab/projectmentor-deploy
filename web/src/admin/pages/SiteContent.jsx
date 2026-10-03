import { useState } from 'react';
import { admin } from '../adminApi';
import { Empty, ErrorBox, Field, Icon, Loading, Modal, PageHead, Toggle, move, useAsync, useFeedback } from '../ui';

const SECTIONS = [
  ['features', 'Feature cards', 'The five large cards under "One place for the whole project".', 'Feature'],
  ['journey', 'Step by step', 'The numbered steps under "Your project, step by step".', 'Step'],
  ['agents', 'AI agents', 'The agent list under "Seven AI agents, each with one job".', 'Agent'],
  ['faq', 'FAQ', 'Questions and answers under "Good to know".', 'Question'],
];
const IMAGES = ['plan', 'team', 'learn', 'viva', 'community', 'build', 'present', 'books', 'graduation'];

/** Home page sections: add, edit, hide, reorder and delete items. */
export default function SiteContent() {
  const { toast, confirm } = useFeedback();
  const [section, setSection] = useState('features');
  const all = useAsync(() => admin.site(), []);
  const [editing, setEditing] = useState(null);
  const meta = SECTIONS.find(s => s[0] === section);
  const items = (all.data ?? []).filter(e => e.section === section);

  async function reorder(index, dir) {
    const next = move(items, index, dir);
    all.setData(d => [...d.filter(e => e.section !== section), ...next]);
    try { await admin.reorderSite(next.map(e => e.id)); }
    catch (e) { toast(e.message, 'error'); all.reload(); }
  }

  async function togglePublished(e) {
    try { await admin.updateSiteEntry(e.id, { ...e, isPublished: !e.isPublished }); all.reload(); toast(e.isPublished ? 'Hidden from the home page.' : 'Shown on the home page.'); }
    catch (err) { toast(err.message, 'error'); }
  }

  async function remove(e) {
    if (!await confirm({ title: 'Delete this item?', message: `"${e.title}" will be removed from the home page.`, ok: 'Delete', danger: true })) return;
    try { await admin.deleteSiteEntry(e.id); toast('Deleted.'); all.reload(); }
    catch (err) { toast(err.message, 'error'); }
  }

  return (
    <>
      <PageHead title="Home page" sub="The sections of the public home page. Hidden items stay here but are not shown to visitors.">
        <a className="adm-btn" href="/" target="_blank" rel="noreferrer"><Icon name="external" size={16} />View home page</a>
        <button type="button" className="adm-btn primary" onClick={() => setEditing({ section })}><Icon name="plus" />Add {meta[3].toLowerCase()}</button>
      </PageHead>
      <section className="adm-card">
        <div className="adm-toolbar">
          <div className="adm-tabs">
            {SECTIONS.map(([key, label]) => (
              <button key={key} type="button" className={section === key ? 'on' : ''} onClick={() => setSection(key)}>
                {label}<span className="adm-pill">{(all.data ?? []).filter(e => e.section === key).length}</span>
              </button>
            ))}
          </div>
        </div>
        <p style={{ margin: 0, padding: '12px 18px 0', color: 'var(--a-faint)', fontSize: 13 }}>{meta[2]} Use the arrows to change the order.</p>
        {all.error && <ErrorBox error={all.error} onRetry={all.reload} />}
        {all.loading && !all.data && <Loading />}
        {all.data && items.length === 0 && <Empty title="Nothing here yet" text="This section is hidden on the home page until you add an item." />}
        <ul className="adm-list">
          {items.map((e, i) => (
            <li key={e.id} className={e.isPublished ? '' : 'muted'}>
              <span className="n">{i + 1}</span>
              <div className="grow"><strong>{e.title}</strong><small>{e.body}</small></div>
              {!e.isPublished && <span className="adm-pill">Hidden</span>}
              {e.linkUrl && <span className="adm-pill info hide-sm">{e.linkUrl}</span>}
              <div className="adm-row-actions">
                <button type="button" className="adm-icon-btn" disabled={i === 0} onClick={() => reorder(i, -1)} aria-label="Move up"><Icon name="up" /></button>
                <button type="button" className="adm-icon-btn" disabled={i === items.length - 1} onClick={() => reorder(i, 1)} aria-label="Move down"><Icon name="down" /></button>
                <button type="button" className="adm-btn sm ghost" onClick={() => togglePublished(e)}>{e.isPublished ? 'Hide' : 'Show'}</button>
                <button type="button" className="adm-icon-btn" onClick={() => setEditing(e)} aria-label="Edit"><Icon name="edit" size={16} /></button>
                <button type="button" className="adm-icon-btn danger" onClick={() => remove(e)} aria-label="Delete"><Icon name="trash" size={16} /></button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      {editing && <EntryForm entry={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); all.reload(); }} />}
    </>
  );
}

function EntryForm({ entry, onClose, onSaved }) {
  const { toast } = useFeedback();
  const isNew = !entry.id;
  const section = entry.section;
  const isFaq = section === 'faq';
  const isFeature = section === 'features';
  const [form, setForm] = useState({
    title: entry.title ?? '', body: entry.body ?? '', image: entry.image ?? (isFeature ? 'plan' : ''),
    linkUrl: entry.linkUrl ?? '', linkLabel: entry.linkLabel ?? '', isPublished: entry.isPublished ?? true,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const body = { section, ...form, image: form.image || null, linkUrl: form.linkUrl || null, linkLabel: form.linkLabel || null };
    try {
      if (isNew) await admin.createSiteEntry(body); else await admin.updateSiteEntry(entry.id, body);
      toast('Saved. The home page is updated.');
      onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? 'Add item' : 'Edit item'} onClose={onClose}>
      <form className="adm-form" onSubmit={save}>
        {error && <p className="adm-form-error">{error}</p>}
        <Field label={isFaq ? 'Question' : section === 'agents' ? 'Agent name' : 'Title'} wide>
          <input type="text" value={form.title} onChange={set('title')} maxLength={200} required />
        </Field>
        <Field label={isFaq ? 'Answer' : 'Text'} wide><textarea value={form.body} onChange={set('body')} maxLength={2000} rows={4} required /></Field>
        {isFeature && (
          <>
            <Field label="Photo" hint="Photos already used on the home page.">
              <select value={form.image} onChange={set('image')}>{IMAGES.map(i => <option key={i} value={i}>{i}</option>)}</select>
            </Field>
            <div className="adm-field">
              <span className="adm-label">Preview</span>
              <img src={`/home/${form.image}.webp`} alt="" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--a-line)' }} />
            </div>
            <Field label="Button link" hint="A page on this site such as /learn, or a full https:// link."><input type="text" value={form.linkUrl} onChange={set('linkUrl')} placeholder="/learn" /></Field>
            <Field label="Button text"><input type="text" value={form.linkLabel} onChange={set('linkLabel')} maxLength={60} placeholder="Start learning" /></Field>
          </>
        )}
        <div className="wide"><Toggle checked={form.isPublished} onChange={v => setForm(f => ({ ...f, isPublished: v }))} label="Show on the home page" /></div>
        <div className="adm-modal-actions wide">
          <button type="button" className="adm-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

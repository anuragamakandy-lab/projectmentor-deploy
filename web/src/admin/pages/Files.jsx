import { useState } from 'react';
import { admin } from '../adminApi';
import { Empty, ErrorBox, Field, Icon, Loading, Modal, PageHead, Toggle, formatBytes, formatDate, move, useAsync, useFeedback } from '../ui';

const CATEGORIES = ['Planning', 'Requirements & design', 'Testing', 'Reports', 'Team & Git', 'Presentation & viva'];
const FORMATS = ['Word', 'Excel', 'PowerPoint', 'PDF', 'Markdown', 'Text', 'ZIP'];

/** Downloadable templates and finished example files (Learn → Templates, and the Templates screen in the app). */
export default function Files() {
  const { toast, confirm } = useFeedback();
  const [kind, setKind] = useState('Template');
  const all = useAsync(() => admin.files(), []);
  const [editing, setEditing] = useState(null);
  const items = (all.data ?? []).filter(f => f.kind === kind);

  async function reorder(index, dir) {
    const next = move(items, index, dir);
    all.setData(d => [...d.filter(f => f.kind !== kind), ...next]);
    try { await admin.reorderFiles(next.map(f => f.id)); }
    catch (e) { toast(e.message, 'error'); all.reload(); }
  }

  async function remove(f) {
    if (!await confirm({ title: `Delete "${f.name}"?`, message: 'The file is removed from the website and the app. This cannot be undone.', ok: 'Delete', danger: true })) return;
    try { await admin.deleteFile(f.id); toast('File deleted.'); all.reload(); }
    catch (e) { toast(e.message, 'error'); }
  }

  async function download(f) {
    try { await admin.downloadFile(f.id, f.fileName); } catch (e) { toast(e.message, 'error'); }
  }

  return (
    <>
      <PageHead title="Templates & examples" sub="Fill-in-the-blanks templates and finished example files that students download from Learn on the website and the app.">
        <button type="button" className="adm-btn primary" onClick={() => setEditing({ kind })}><Icon name="plus" />Upload {kind === 'Template' ? 'template' : 'example'}</button>
      </PageHead>
      <section className="adm-card">
        <div className="adm-toolbar">
          <div className="adm-tabs">
            {[['Template', 'Templates'], ['Example', 'Example files']].map(([v, l]) => (
              <button key={v} type="button" className={kind === v ? 'on' : ''} onClick={() => setKind(v)}>{l}<span className="adm-pill">{(all.data ?? []).filter(f => f.kind === v).length}</span></button>
            ))}
          </div>
          <span style={{ color: 'var(--a-faint)', fontSize: 13 }}>The order here is the order students see.</span>
        </div>
        {all.error && <ErrorBox error={all.error} onRetry={all.reload} />}
        {all.loading && !all.data && <Loading />}
        {all.data && items.length === 0 && <Empty title="No files yet" text="Upload the first one." />}
        {items.length > 0 && (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th style={{ width: 70 }}>Order</th><th>Name</th>{kind === 'Template' && <th className="hide-sm">Category</th>}<th className="hide-sm">File</th><th className="hide-sm">Updated</th><th>Status</th><th /></tr></thead>
              <tbody>
                {items.map((f, i) => (
                  <tr key={f.id}>
                    <td>
                      <div style={{ display: 'flex' }}>
                        <button type="button" className="adm-icon-btn" disabled={i === 0} onClick={() => reorder(i, -1)} aria-label="Move up"><Icon name="up" /></button>
                        <button type="button" className="adm-icon-btn" disabled={i === items.length - 1} onClick={() => reorder(i, 1)} aria-label="Move down"><Icon name="down" /></button>
                      </div>
                    </td>
                    <td className="t-main"><strong>{f.name}</strong><small>{f.format}{f.whenToUse ? ` · ${f.whenToUse}` : f.description ? ` · ${f.description.slice(0, 80)}` : ''}</small></td>
                    {kind === 'Template' && <td className="hide-sm">{f.category}</td>}
                    <td className="hide-sm t-main"><strong style={{ fontWeight: 600 }}>{f.fileName}</strong><small>{formatBytes(f.size)}</small></td>
                    <td className="hide-sm">{formatDate(f.updatedAt)}</td>
                    <td><span className={`adm-pill ${f.isPublished ? 'ok' : ''}`}>{f.isPublished ? 'Published' : 'Hidden'}</span></td>
                    <td>
                      <div className="adm-row-actions">
                        <button type="button" className="adm-icon-btn" onClick={() => download(f)} aria-label="Download"><Icon name="download" size={16} /></button>
                        <button type="button" className="adm-icon-btn" onClick={() => setEditing(f)} aria-label="Edit"><Icon name="edit" size={16} /></button>
                        <button type="button" className="adm-icon-btn danger" onClick={() => remove(f)} aria-label="Delete"><Icon name="trash" size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {editing && <FileForm file={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); all.reload(); }} />}
    </>
  );
}

function FileForm({ file, onClose, onSaved }) {
  const { toast } = useFeedback();
  const isNew = !file.id;
  const isTemplate = file.kind === 'Template';
  const [form, setForm] = useState({
    name: file.name ?? '', category: file.category ?? CATEGORIES[0], format: file.format ?? '',
    whenToUse: file.whenToUse ?? '', description: file.description ?? '', inside: (file.inside ?? []).join('\n'),
    saveAs: file.saveAs ?? '', isPublished: file.isPublished ?? true,
  });
  const [upload, setUpload] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    if (isNew && !upload) { setError('Choose a file to upload.'); return; }
    if (upload && upload.size > 15 * 1024 * 1024) { setError('Files must be 15 MB or smaller.'); return; }
    setBusy(true); setError('');
    const data = new FormData();
    data.set('kind', file.kind);
    Object.entries(form).forEach(([k, v]) => data.set(k, String(v)));
    if (upload) data.set('file', upload);
    try {
      if (isNew) await admin.createFile(data); else await admin.updateFile(file.id, data);
      toast(isNew ? 'File uploaded.' : 'File updated.');
      onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? `Upload ${isTemplate ? 'template' : 'example file'}` : `Edit ${file.name}`} onClose={onClose} size="lg">
      <form className="adm-form" onSubmit={save}>
        {error && <p className="adm-form-error">{error}</p>}
        <Field label={isNew ? 'File' : 'Replace file (optional)'} wide hint={isNew ? 'Word, Excel, PowerPoint, PDF, Markdown, text or ZIP. Up to 15 MB.' : `Current file: ${file.fileName} (${formatBytes(file.size)})`}>
          <input type="file" onChange={e => setUpload(e.target.files?.[0] ?? null)} accept=".docx,.doc,.xlsx,.xls,.pptx,.ppt,.pdf,.md,.txt,.zip" />
        </Field>
        <Field label="Name"><input type="text" value={form.name} onChange={set('name')} maxLength={160} required /></Field>
        {isTemplate
          ? <Field label="Category"><select value={form.category} onChange={set('category')}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
          : <Field label="Label" hint="Shown under the name, e.g. PDF · 6 pages"><input type="text" value={form.format} onChange={set('format')} maxLength={40} /></Field>}
        {isTemplate && (
          <>
            <Field label="Format" hint="Left empty, it is worked out from the file."><select value={form.format} onChange={set('format')}><option value="">Automatic</option>{FORMATS.map(f => <option key={f}>{f}</option>)}</select></Field>
            <Field label="Rename after download (optional)" hint="e.g. .gitignore"><input type="text" value={form.saveAs} onChange={set('saveAs')} maxLength={160} /></Field>
            <Field label="When to use it" wide><input type="text" value={form.whenToUse} onChange={set('whenToUse')} maxLength={500} placeholder="Before you start building, to get your idea approved." /></Field>
            <Field label="What is inside" wide hint="One point per line."><textarea value={form.inside} onChange={set('inside')} rows={5} /></Field>
          </>
        )}
        {!isTemplate && <Field label="Description" wide><textarea value={form.description} onChange={set('description')} rows={4} maxLength={1000} /></Field>}
        <div className="wide"><Toggle checked={form.isPublished} onChange={v => setForm(f => ({ ...f, isPublished: v }))} label="Published (students can download it)" /></div>
        <div className="adm-modal-actions wide">
          <button type="button" className="adm-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

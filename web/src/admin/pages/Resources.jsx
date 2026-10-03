import { useEffect, useState } from 'react';
import { admin } from '../adminApi';
import { Empty, ErrorBox, Field, Icon, Loading, Modal, PageHead, Toggle, useAsync, useFeedback } from '../ui';

const TYPES = ['Article', 'Video', 'Documentation', 'Course'];

/** Resource Hub links (also attached to roadmap milestones by the Resource agent). */
export default function Resources() {
  const { toast, confirm } = useFeedback();
  const [q, setQ] = useState(new URLSearchParams(window.location.search).get('q') ?? '');
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const facets = useAsync(() => admin.resourceFacets(), []);
  const list = useAsync(() => admin.resources({ search: query, topic, type, page, pageSize: 20 }), [query, topic, type, page]);
  const [editing, setEditing] = useState(null);

  useEffect(() => { const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  async function remove(r) {
    if (!await confirm({ title: 'Delete this resource?', message: `"${r.title}" will be removed from the Resource Hub on the website and the app.`, ok: 'Delete', danger: true })) return;
    try { await admin.deleteResource(r.id); toast('Resource deleted.'); list.reload(); facets.reload(); }
    catch (e) { toast(e.message, 'error'); }
  }

  const data = list.data;
  return (
    <>
      <PageHead title="Resources" sub="Tutorials and documentation in the Resource Hub. The Resource agent also attaches these to roadmap milestones by topic.">
        <button type="button" className="adm-btn primary" onClick={() => setEditing({})}><Icon name="plus" />Add resource</button>
      </PageHead>
      <section className="adm-card">
        <div className="adm-toolbar">
          <div className="adm-search"><Icon name="search" /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search title or description" aria-label="Search resources" /></div>
          <select value={topic} onChange={e => { setTopic(e.target.value); setPage(1); }} style={{ width: 'auto' }} aria-label="Topic">
            <option value="">All topics</option>
            {facets.data?.topics.map(t => <option key={t}>{t}</option>)}
          </select>
          <select value={type} onChange={e => { setType(e.target.value); setPage(1); }} style={{ width: 'auto' }} aria-label="Type">
            <option value="">All types</option>
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
        {list.loading && !data && <Loading />}
        {data?.items.length === 0 && <Empty title="No resources found" text="Try another filter, or add a resource." />}
        {data?.items.length > 0 && (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Resource</th><th>Topic</th><th className="hide-sm">Type</th><th className="hide-sm">Tags</th><th /></tr></thead>
              <tbody>
                {data.items.map(r => (
                  <tr key={r.id}>
                    <td className="t-main"><strong>{r.title}</strong><small className="adm-truncate" style={{ display: 'block' }}><a href={r.url} target="_blank" rel="noreferrer">{r.url}</a></small></td>
                    <td>{r.topic}</td>
                    <td className="hide-sm"><span className="adm-pill">{r.resourceType}</span></td>
                    <td className="hide-sm">{r.tags.join(', ') || '—'}</td>
                    <td>
                      <div className="adm-row-actions">
                        <button type="button" className="adm-icon-btn" onClick={() => setEditing(r)} aria-label="Edit"><Icon name="edit" size={16} /></button>
                        <button type="button" className="adm-icon-btn danger" onClick={() => remove(r)} aria-label="Delete"><Icon name="trash" size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.totalPages > 1 && (
          <div className="adm-pager">
            <span>{data.totalItems} resources · page {data.page} of {data.totalPages}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="adm-btn sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
              <button type="button" className="adm-btn sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          </div>
        )}
      </section>
      {editing && <ResourceForm resource={editing} topics={facets.data?.topics ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); facets.reload(); }} />}
    </>
  );
}

function ResourceForm({ resource, topics, onClose, onSaved }) {
  const { toast } = useFeedback();
  const isNew = !resource.id;
  const [form, setForm] = useState({
    title: resource.title ?? '', url: resource.url ?? '', resourceType: resource.resourceType ?? 'Article',
    topic: resource.topic ?? '', description: resource.description ?? '', tags: (resource.tags ?? []).join(', '),
    level: resource.level ?? 'Beginner', duration: resource.duration ?? '', isFree: resource.isFree ?? true, price: resource.price ?? '',
    provider: resource.provider ?? '', isFeatured: resource.isFeatured ?? false,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const body = { ...form, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) };
    try {
      if (isNew) await admin.createResource(body); else await admin.updateResource(resource.id, body);
      toast(isNew ? 'Resource added.' : 'Resource updated.');
      onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? 'Add resource' : 'Edit resource'} onClose={onClose}>
      <form className="adm-form" onSubmit={save}>
        {error && <p className="adm-form-error">{error}</p>}
        <Field label="Title" wide><input type="text" value={form.title} onChange={set('title')} required /></Field>
        <Field label="Link" wide><input type="url" value={form.url} onChange={set('url')} placeholder="https://" required /></Field>
        <Field label="Type"><select value={form.resourceType} onChange={set('resourceType')}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Topic" hint="Pick an existing topic or type a new one.">
          <input type="text" list="adm-topics" value={form.topic} onChange={set('topic')} required />
          <datalist id="adm-topics">{topics.map(t => <option key={t} value={t} />)}</datalist>
        </Field>
        <Field label="Description" wide><textarea value={form.description} onChange={set('description')} rows={3} /></Field>
        <Field label="Tags" wide hint="Separate tags with commas."><input type="text" value={form.tags} onChange={set('tags')} placeholder="beginner, git" /></Field>
        <Field label="Provider" hint="Who made it, e.g. freeCodeCamp, Coursera"><input type="text" value={form.provider} onChange={set('provider')} /></Field>
        <Field label="Level"><select value={form.level} onChange={set('level')}>{['Beginner', 'Intermediate', 'Advanced'].map(l => <option key={l}>{l}</option>)}</select></Field>
        <Field label="Time needed" hint="e.g. 30 min, 6 h, Self-paced"><input type="text" value={form.duration} onChange={set('duration')} /></Field>
        <Field label="Price">
          <select value={form.isFree ? 'free' : 'paid'} onChange={e => setForm(f => ({ ...f, isFree: e.target.value === 'free' }))}><option value="free">Free</option><option value="paid">Paid course</option></select>
        </Field>
        {!form.isFree && <Field label="Fee" wide hint="Shown on the card, e.g. Coursera subscription (about US$49/month)"><input type="text" value={form.price} onChange={set('price')} /></Field>}
        <Field label="Recommended" hint="Shown first under Recommended."><Toggle checked={form.isFeatured} onChange={v => setForm(f => ({ ...f, isFeatured: v }))} label="Feature this resource" /></Field>
        <div className="adm-modal-actions wide">
          <button type="button" className="adm-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="adm-btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

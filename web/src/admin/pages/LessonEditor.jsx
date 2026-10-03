import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { admin, apiUrl } from '../adminApi';
import { ErrorBox, Field, Icon, Loading, PageHead, Toggle, move, useFeedback } from '../ui';

// Every block type the website and the app can render, with a friendly name and an empty starting value.
const TYPES = {
  p: ['Paragraph', 'Plain text', () => ({ type: 'p', text: '' })],
  tip: ["Lecturer's note", 'Highlighted advice', () => ({ type: 'tip', text: '' })],
  list: ['Bullet list', 'One point per line', () => ({ type: 'list', items: [] })],
  steps: ['Steps', 'Numbered how-to', () => ({ type: 'steps', items: [{ title: '', text: '' }] })],
  cards: ['Cards', 'Short side-by-side ideas', () => ({ type: 'cards', items: [{ title: '', text: '', meta: '' }] })],
  doDont: ["Do and don't", 'Two lists', () => ({ type: 'doDont', do: [], dont: [] })],
  compare: ['Before and after', 'Weak vs better example', () => ({ type: 'compare', items: [{ bad: '', good: '', why: '' }] })],
  table: ['Table', 'Rows and columns', () => ({ type: 'table', head: ['Column 1', 'Column 2'], rows: [['', '']] })],
  example: ['Code or text example', 'Shown in a dark box', () => ({ type: 'example', title: '', code: '' })],
  videos: ['Videos', 'From the video library', () => ({ type: 'videos', ids: [] })],
  quiz: ['Quiz', 'Multiple choice check', () => ({ type: 'quiz', questions: [{ q: '', options: ['', ''], answer: 0, why: '' }] })],
  checklist: ['Checklist', 'Students tick items off', () => ({ type: 'checklist', id: `check-${Date.now().toString(36)}`, items: [] })],
  visual: ['Diagram', 'A built-in illustration', () => ({ type: 'visual', name: 'reportAnatomy' })],
  image: ['Image', 'Upload a diagram or picture', () => ({ type: 'image', uploadId: '', caption: '' })],
};
const VISUALS = [['reportAnatomy', 'Report structure'], ['captionDemo', 'Figure captions'], ['talkTimeline', 'Talk timeline'], ['slideCompare', 'Slide before and after'], ['gitAreas', 'Git working areas'], ['branchDiagram', 'Git branches']];

const lines = text => text.split('\n').map(s => s.trim()).filter(Boolean);
const joinLines = arr => (arr ?? []).join('\n');

export default function LessonEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const isNew = !id;
  const [tracks, setTracks] = useState(null);
  const [videos, setVideos] = useState([]);
  const [lesson, setLesson] = useState(null);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [t, v, l] = await Promise.all([admin.tracks(), admin.videos(), isNew ? null : admin.lesson(id)]);
        if (!alive) return;
        setTracks(t);
        setVideos(v);
        setLesson(l ?? { trackId: params.get('track') ?? t[0]?.id ?? '', title: '', lead: '', isPublished: true, blocks: [TYPES.p[2]()] });
      } catch (e) { if (alive) setError(e.message); }
    })();
    return () => { alive = false; };
  }, [id, isNew, params]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = patch => { setLesson(l => ({ ...l, ...patch })); setDirty(true); };
  const setBlock = (i, block) => update({ blocks: lesson.blocks.map((b, j) => (j === i ? block : b)) });

  async function save() {
    setBusy(true); setSaveError('');
    const body = { trackId: lesson.trackId, title: lesson.title, lead: lesson.lead, isPublished: lesson.isPublished, blocks: lesson.blocks, slug: lesson.slug };
    try {
      const saved = isNew ? await admin.createLesson(body) : await admin.updateLesson(id, body);
      setDirty(false);
      toast(lesson.isPublished ? 'Lesson saved and live on the website and app.' : 'Draft saved. Students cannot see it yet.');
      if (isNew) navigate(`/admin/lessons/${saved.id}`, { replace: true }); else setLesson(saved);
    } catch (e) { setSaveError(e.message); toast(e.message, 'error'); } finally { setBusy(false); }
  }

  async function removeBlock(i) {
    const b = lesson.blocks[i];
    const empty = JSON.stringify(b) === JSON.stringify(TYPES[b.type]?.[2]?.());
    if (!empty && !await confirm({ title: 'Remove this block?', message: `The ${TYPES[b.type]?.[0] ?? b.type} block and its content will be removed when you save.`, ok: 'Remove', danger: true })) return;
    update({ blocks: lesson.blocks.filter((_, j) => j !== i) });
  }

  if (error) return <><PageHead title="Lesson" /><ErrorBox error={error} /></>;
  if (!lesson || !tracks) return <><PageHead title="Lesson" /><Loading /></>;
  const track = tracks.find(t => t.id === lesson.trackId);

  return (
    <>
      <PageHead title={isNew ? 'New lesson' : 'Edit lesson'} sub={track ? `Track: ${track.label}` : undefined}>
        <Link className="adm-btn" to="/admin/lessons">Back to lessons</Link>
        {!isNew && track && <a className="adm-btn" href={`/learn?track=${track.key}`} target="_blank" rel="noreferrer"><Icon name="external" size={16} />View</a>}
        <button type="button" className="adm-btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : dirty || isNew ? 'Save lesson' : 'Saved'}</button>
      </PageHead>

      <div className="adm-editor">
        <div className="adm-blocks">
          <section className="adm-card adm-card-pad" style={{ display: 'grid', gap: 14 }}>
            {saveError && <p className="adm-form-error">{saveError}</p>}
            <Field label="Lesson title"><input type="text" value={lesson.title} onChange={e => update({ title: e.target.value })} maxLength={200} placeholder="e.g. Writing a clear abstract" /></Field>
            <Field label="Introduction" hint="One or two sentences under the title."><textarea value={lesson.lead ?? ''} onChange={e => update({ lead: e.target.value })} maxLength={1000} rows={2} /></Field>
            <p className="adm-hint" style={{ margin: 0 }}>Formatting: write **bold** or *italic* inside any text.</p>
          </section>

          {lesson.blocks.map((b, i) => (
            <section className="adm-block" key={i}>
              <div className="adm-block-head">
                <strong>{i + 1}. {TYPES[b.type]?.[0] ?? b.type}</strong>
                <span className="spacer" />
                <button type="button" className="adm-icon-btn" disabled={i === 0} onClick={() => update({ blocks: move(lesson.blocks, i, -1) })} aria-label="Move up"><Icon name="up" /></button>
                <button type="button" className="adm-icon-btn" disabled={i === lesson.blocks.length - 1} onClick={() => update({ blocks: move(lesson.blocks, i, 1) })} aria-label="Move down"><Icon name="down" /></button>
                <button type="button" className="adm-icon-btn danger" onClick={() => removeBlock(i)} aria-label="Remove block"><Icon name="trash" size={16} /></button>
              </div>
              <div className="adm-block-body"><BlockForm block={b} videos={videos} onChange={nb => setBlock(i, nb)} /></div>
            </section>
          ))}

          <section className="adm-card adm-card-pad">
            <h2 style={{ fontSize: '1rem', marginBottom: 10 }}>Add a block</h2>
            <div className="adm-addblock">
              {Object.entries(TYPES).map(([type, [name, hint, make]]) => (
                <button key={type} type="button" onClick={() => update({ blocks: [...lesson.blocks, make()] })}><strong>{name}</strong><small>{hint}</small></button>
              ))}
            </div>
          </section>
        </div>

        <aside className="adm-editor-side">
          <section className="adm-card adm-card-pad" style={{ display: 'grid', gap: 14 }}>
            <Field label="Track">
              <select value={lesson.trackId} onChange={e => update({ trackId: e.target.value })}>{tracks.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
            </Field>
            <Toggle checked={lesson.isPublished} onChange={v => update({ isPublished: v })} label={lesson.isPublished ? 'Published' : 'Draft (hidden)'} />
            <p className="adm-hint" style={{ margin: 0 }}>{lesson.isPublished ? 'Students see this lesson on the website and in the app.' : 'Only admins can see drafts.'}</p>
            {lesson.slug && <p className="adm-hint" style={{ margin: 0 }}>Link name: <code>{lesson.slug}</code></p>}
            <button type="button" className="adm-btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save lesson'}</button>
            {dirty && <span className="adm-pill warn" style={{ justifySelf: 'start' }}>Unsaved changes</span>}
          </section>
          <section className="adm-card adm-card-pad">
            <strong style={{ display: 'block', marginBottom: 6 }}>{lesson.blocks.length} blocks</strong>
            <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--a-soft)', fontSize: 13, display: 'grid', gap: 3 }}>
              {lesson.blocks.map((b, i) => <li key={i}>{TYPES[b.type]?.[0] ?? b.type}</li>)}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- one form per block type

function BlockForm({ block: b, videos, onChange }) {
  const set = patch => onChange({ ...b, ...patch });
  switch (b.type) {
    case 'p':
    case 'tip':
      return <textarea value={b.text ?? ''} onChange={e => set({ text: e.target.value })} rows={b.type === 'p' ? 4 : 3} placeholder={b.type === 'tip' ? 'Advice in a lecturer’s voice…' : 'Write the paragraph…'} />;
    case 'list':
    case 'checklist':
      return <LinesField label="One item per line" value={b.items} onChange={items => set({ items })} rows={5} />;
    case 'doDont':
      return (
        <div className="adm-form">
          <LinesField label="Do (one per line)" value={b.do} onChange={v => set({ do: v })} />
          <LinesField label="Don't (one per line)" value={b.dont} onChange={v => set({ dont: v })} />
        </div>
      );
    case 'example':
      return (
        <>
          <Field label="Heading"><input type="text" value={b.title ?? ''} onChange={e => set({ title: e.target.value })} placeholder="e.g. A clear README skeleton" /></Field>
          <Field label="Code or text"><textarea className="code" value={b.code ?? ''} onChange={e => set({ code: e.target.value })} rows={8} spellCheck={false} /></Field>
        </>
      );
    case 'image':
      return <ImageBlock block={b} set={set} />;
    case 'visual':
      return <Field label="Diagram"><select value={b.name} onChange={e => set({ name: e.target.value })}>{VISUALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>;
    case 'steps':
      return <Rows items={b.items} onChange={items => set({ items })} make={() => ({ title: '', text: '' })} label="Step" render={(it, up) => (
        <>
          <input type="text" value={it.title} onChange={e => up({ title: e.target.value })} placeholder="Step title" />
          <textarea value={it.text} onChange={e => up({ text: e.target.value })} rows={2} placeholder="What to do" />
        </>
      )} />;
    case 'cards':
      return <Rows items={b.items} onChange={items => set({ items })} make={() => ({ title: '', text: '', meta: '' })} label="Card" render={(it, up) => (
        <>
          <div className="adm-form"><input type="text" value={it.title} onChange={e => up({ title: e.target.value })} placeholder="Title" /><input type="text" value={it.meta ?? ''} onChange={e => up({ meta: e.target.value })} placeholder="Small label (optional)" /></div>
          <textarea value={it.text} onChange={e => up({ text: e.target.value })} rows={2} placeholder="Text" />
        </>
      )} />;
    case 'compare':
      return <Rows items={b.items} onChange={items => set({ items })} make={() => ({ bad: '', good: '', why: '' })} label="Example" render={(it, up) => (
        <>
          <div className="adm-form">
            <input type="text" value={it.labels?.[0] ?? ''} onChange={e => up({ labels: [e.target.value, it.labels?.[1] ?? ''] })} placeholder="Left label (default: Before)" />
            <input type="text" value={it.labels?.[1] ?? ''} onChange={e => up({ labels: [it.labels?.[0] ?? '', e.target.value] })} placeholder="Right label (default: Better)" />
          </div>
          <textarea value={it.bad} onChange={e => up({ bad: e.target.value })} rows={2} placeholder="Weak version" />
          <textarea value={it.good} onChange={e => up({ good: e.target.value })} rows={2} placeholder="Better version" />
          <input type="text" value={it.why ?? ''} onChange={e => up({ why: e.target.value })} placeholder="Why it is better" />
        </>
      )} cleanup={it => (it.labels && !it.labels[0] && !it.labels[1] ? (({ labels, ...rest }) => rest)(it) : it)} />;
    case 'table':
      return <TableForm block={b} onChange={onChange} />;
    case 'quiz':
      return <Rows items={b.questions} onChange={questions => set({ questions })} make={() => ({ q: '', options: ['', ''], answer: 0, why: '' })} label="Question" render={(it, up) => (
        <>
          <input type="text" value={it.q} onChange={e => up({ q: e.target.value })} placeholder="Question" />
          <LinesField label="Answer options (one per line)" value={it.options} onChange={options => up({ options, answer: Math.min(it.answer, Math.max(0, options.length - 1)) })} rows={3} />
          <Field label="Correct answer">
            <select value={it.answer} onChange={e => up({ answer: Number(e.target.value) })}>{it.options.map((o, j) => <option key={j} value={j}>{o || `Option ${j + 1}`}</option>)}</select>
          </Field>
          <input type="text" value={it.why ?? ''} onChange={e => up({ why: e.target.value })} placeholder="Explanation shown after answering" />
        </>
      )} />;
    case 'videos':
      return <VideoPicker ids={b.ids} videos={videos} onChange={ids => set({ ids })} />;
    default:
      return <p className="adm-hint">This block type cannot be edited here.</p>;
  }
}

/** Textarea bound to a string array, one entry per line (keeps the text as typed while editing). */
function LinesField({ label, value, onChange, rows = 4 }) {
  const [text, setText] = useState(joinLines(value));
  useEffect(() => { if (lines(text).join('\n') !== joinLines(value)) setText(joinLines(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Field label={label}><textarea value={text} rows={rows} onChange={e => { setText(e.target.value); onChange(lines(e.target.value)); }} /></Field>;
}

/** A repeatable list of small forms (steps, cards, comparisons, quiz questions). */
function Rows({ items, onChange, make, render, label, cleanup = x => x }) {
  const list = items ?? [];
  const up = i => patch => onChange(list.map((it, j) => (j === i ? cleanup({ ...it, ...patch }) : it)));
  return (
    <div className="adm-rows">
      {list.map((it, i) => (
        <div className="adm-rowcard" key={i}>
          <div className="adm-rowcard-head">
            <span>{label} {i + 1}</span>
            <span className="adm-row-actions">
              <button type="button" className="adm-icon-btn" disabled={i === 0} onClick={() => onChange(move(list, i, -1))} aria-label="Move up"><Icon name="up" size={16} /></button>
              <button type="button" className="adm-icon-btn" disabled={i === list.length - 1} onClick={() => onChange(move(list, i, 1))} aria-label="Move down"><Icon name="down" size={16} /></button>
              <button type="button" className="adm-icon-btn danger" disabled={list.length === 1} onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label="Remove"><Icon name="trash" size={15} /></button>
            </span>
          </div>
          {render(it, up(i))}
        </div>
      ))}
      <button type="button" className="adm-btn sm" style={{ justifySelf: 'start' }} onClick={() => onChange([...list, make()])}><Icon name="plus" size={15} />Add {label.toLowerCase()}</button>
    </div>
  );
}

function TableForm({ block: b, onChange }) {
  const cols = b.head.length;
  const setHead = (j, v) => onChange({ ...b, head: b.head.map((h, k) => (k === j ? v : h)) });
  const setCell = (i, j, v) => onChange({ ...b, rows: b.rows.map((r, k) => (k === i ? r.map((c, m) => (m === j ? v : c)) : r)) });
  const addCol = () => onChange({ ...b, head: [...b.head, `Column ${cols + 1}`], rows: b.rows.map(r => [...r, '']) });
  const removeCol = j => onChange({ ...b, head: b.head.filter((_, k) => k !== j), rows: b.rows.map(r => r.filter((_, k) => k !== j)) });
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="adm-table" style={{ minWidth: cols * 180 }}>
        <thead>
          <tr>
            {b.head.map((h, j) => (
              <th key={j} style={{ textTransform: 'none' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input type="text" value={h} onChange={e => setHead(j, e.target.value)} aria-label={`Heading ${j + 1}`} />
                  {cols > 1 && <button type="button" className="adm-icon-btn danger" onClick={() => removeCol(j)} aria-label="Remove column"><Icon name="close" size={14} /></button>}
                </div>
              </th>
            ))}
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {b.rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => <td key={j}><input type="text" value={c} onChange={e => setCell(i, j, e.target.value)} aria-label={`Row ${i + 1} column ${j + 1}`} /></td>)}
              <td><button type="button" className="adm-icon-btn danger" disabled={b.rows.length === 1} onClick={() => onChange({ ...b, rows: b.rows.filter((_, k) => k !== i) })} aria-label="Remove row"><Icon name="trash" size={15} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="button" className="adm-btn sm" onClick={() => onChange({ ...b, rows: [...b.rows, b.head.map(() => '')] })}><Icon name="plus" size={15} />Row</button>
        <button type="button" className="adm-btn sm" onClick={addCol}><Icon name="plus" size={15} />Column</button>
      </div>
    </div>
  );
}

function VideoPicker({ ids, videos, onChange }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const chosen = ids.map(id => videos.find(v => v.youtubeId === id)).filter(Boolean);
  const list = useMemo(() => videos.filter(v => !term || `${v.title} ${v.channel}`.toLowerCase().includes(term)), [videos, term]);
  const toggle = id => onChange(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  return (
    <>
      <p className="adm-hint" style={{ margin: 0 }}>
        {chosen.length ? `Selected, in order: ${chosen.map(v => v.title).join('; ')}` : 'Choose one or more videos.'}{' '}
        Missing a video? <Link to="/admin/videos" target="_blank">Add it to the library</Link>, then reload this page.
      </p>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search videos" aria-label="Search videos" />
      <div className="adm-pick-videos">
        {list.map(v => (
          <label key={v.id} className={`adm-pick-video${ids.includes(v.youtubeId) ? ' on' : ''}`}>
            <input type="checkbox" checked={ids.includes(v.youtubeId)} onChange={() => toggle(v.youtubeId)} style={{ width: 'auto', minHeight: 0 }} />
            <img src={`https://img.youtube.com/vi/${v.youtubeId}/mqdefault.jpg`} alt="" loading="lazy" />
            <span>{v.title}<small>{v.channel}{v.duration ? ` · ${v.duration}` : ''}</small></span>
          </label>
        ))}
      </div>
    </>
  );
}

/** An uploaded picture (e.g. an ER or use case diagram) with a caption. */
function ImageBlock({ block: b, set }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  async function pick(file) {
    if (!file) return;
    setBusy(true);
    try { const up = await admin.upload(file); set({ uploadId: up.id }); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  return (
    <div className="adm-form">
      {b.uploadId && <img src={apiUrl(`/api/uploads/${b.uploadId}`)} alt="" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #E6E1D6' }} />}
      <Field label={b.uploadId ? 'Replace image' : 'Image'} hint="PNG, JPG, GIF or WebP up to 5 MB."><input type="file" accept="image/*" disabled={busy} onChange={e => pick(e.target.files[0])} /></Field>
      <Field label="Caption"><input type="text" value={b.caption ?? ''} onChange={e => set({ caption: e.target.value })} placeholder="e.g. Figure: ER diagram for FindIt" /></Field>
    </div>
  );
}

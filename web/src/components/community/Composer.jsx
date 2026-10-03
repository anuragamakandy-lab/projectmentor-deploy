import { useRef, useState } from 'react';
import { createPost, uploadFile } from '../../api/projectMentorApi';
import Avatar from '../Avatar';
import { compressImage } from '../../ui/image';
import { useFeedback } from '../../ui/feedback';
import { AUDIENCES, Icon, Modal, kb, useCommunity } from './shared';

const KINDS = [['Showcase', 'Showcase'], ['Update', 'Update'], ['Question', 'Question'], ['Report', 'Report'], ['Idea', 'Idea']];

/** Facebook-style "What's on your mind?" box that opens a full post editor. */
export default function Composer({ groups = [], onPosted }) {
  const { token, me, user, guard } = useCommunity();
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('Update');
  const [text, setText] = useState('');
  const [project, setProject] = useState('');
  const [groupId, setGroupId] = useState('');
  const [aud, setAud] = useState('Public');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const picker = useRef(null);
  const first = (me?.fullName ?? user?.fullName ?? '').split(' ')[0];

  async function start(withPicker = null) {
    if (!await guard('post in the community')) return;
    setOpen(true);
    if (withPicker) setTimeout(() => { picker.current.accept = withPicker; picker.current.click(); }, 50);
  }
  function addFiles(list) {
    const next = [...files];
    for (const f of list) {
      if (next.length >= 6) { setError('You can add up to 6 files.'); break; }
      next.push({ file: f, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null });
    }
    setFiles(next);
  }
  function close() {
    files.forEach(f => f.url && URL.revokeObjectURL(f.url));
    setFiles([]); setText(''); setProject(''); setGroupId(''); setError(''); setOpen(false);
  }
  async function submit(e) {
    e.preventDefault();
    if (!text.trim() && files.length === 0) { setError('Write something or add a photo or file.'); return; }
    setBusy(true); setError('');
    try {
      const ids = [];
      for (const f of files) ids.push((await uploadFile(token, await compressImage(f.file))).id);
      const post = await createPost(token, { content: text.trim(), kind, projectTitle: project.trim() || null, uploadIds: ids, groupId: groupId || null, visibility: aud });
      onPosted(post);
      close();
      toast(post.status === 'Pending' ? 'Sent for a quick admin check. You can follow it under "Waiting for approval".' : 'Posted.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="cm-card cm-composer">
        <div className="cm-composer-row">
          <Avatar name={me?.fullName ?? user?.fullName ?? 'Guest'} seed={user?.userId} size={42} photoId={me?.avatarId} badge={me?.badge} />
          <button type="button" className="cm-composer-pill" onClick={() => start()}>
            {user ? `What's new with your project, ${first}?` : 'Log in to share your project progress'}
          </button>
        </div>
        <div className="cm-composer-tools">
          <button type="button" onClick={() => start('image/*')}>{Icon.photo}<span>Photo</span></button>
          <button type="button" onClick={() => start('.pdf,.docx,.pptx,.xlsx')}>{Icon.file}<span>Report or file</span></button>
          <button type="button" onClick={async () => { await start(); setKind('Showcase'); }}>{Icon.project}<span>Showcase</span></button>
        </div>
      </div>
      {open && (
        <Modal title="Create post" onClose={close} wide>
          <form className="cm-create" onSubmit={submit}
            onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles([...e.dataTransfer.files]); }}>
            <div className="cm-who">
              <Avatar name={me?.fullName ?? user?.fullName} seed={user?.userId} size={44} photoId={me?.avatarId} badge={me?.badge} />
              <div>
                <strong>{me?.fullName ?? user?.fullName}</strong>
                <div className="cm-who-opts">
                  <select value={aud} onChange={e => setAud(e.target.value)} aria-label="Who can see this post">{AUDIENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  {groups.length > 0 && (
                    <select value={groupId} onChange={e => setGroupId(e.target.value)} aria-label="Group">
                      <option value="">No group</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
            </div>
            <div className="cm-kinds" role="radiogroup" aria-label="Type of post">
              {KINDS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}
            </div>
            <input className="cm-title-input" value={project} onChange={e => setProject(e.target.value)} placeholder="Project name (optional)" maxLength={200} />
            <textarea className="cm-big-text" rows={5} value={text} onChange={e => setText(e.target.value)} autoFocus
              placeholder={kind === 'Question' ? 'What did you try, and what exactly went wrong?' : kind === 'Report' ? 'Attach your report and say what feedback you want.' : `What's new with your project, ${first}?`} />
            {files.length > 0 && (
              <div className="cm-files">
                {files.map((f, i) => (
                  <div key={i} className="cm-file">
                    {f.url ? <img src={f.url} alt="" /> : <span className="cm-file-doc">{Icon.file}<small>{f.file.name}<br />{kb(f.file.size)}</small></span>}
                    <button type="button" onClick={() => setFiles(fs => fs.filter((_, k) => k !== i))} aria-label="Remove file">×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="cm-add-row">
              <span>Add to your post</span>
              <button type="button" onClick={() => { picker.current.accept = 'image/*'; picker.current.click(); }} aria-label="Add photo">{Icon.photo}</button>
              <button type="button" onClick={() => { picker.current.accept = '.pdf,.docx,.pptx,.xlsx'; picker.current.click(); }} aria-label="Add file">{Icon.file}</button>
            </div>
            {error && <p className="error-message" role="alert">{error}</p>}
            <p className="cm-hint">An admin checks every post before others can see it. Never share passwords or other people's personal details.</p>
            <button className="button button-primary" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Posting…' : 'Post'}</button>
          </form>
        </Modal>
      )}
      <input ref={picker} type="file" multiple hidden onChange={e => { addFiles([...e.target.files]); e.target.value = ''; }} />
    </>
  );
}

import { useState } from 'react';
import Examiner from '../../components/Examiner';
import { LANGUAGES, STOCK_EXAMINERS, lookOf } from '../../content/examiners';
import { useSpeaker } from '../../hooks/useSpeech';
import { sampleLine } from '../../pages/VivaRoomPage';
import { admin } from '../adminApi';
import { ErrorBox, Field, Icon, Loading, Modal, PageHead, Toggle, useAsync, useFeedback } from '../ui';

const LANGUAGE_NAME = Object.fromEntries(LANGUAGES);
const HAIR = [['short', 'Short'], ['side', 'Side part'], ['curly', 'Curly'], ['long', 'Long'], ['bun', 'Bun'], ['bald', 'Bald']];
const STYLES = [['Friendly', 'Friendly — encouraging'], ['Standard', 'Standard — like a real viva'], ['Strict', 'Strict — demanding']];

/** Mock viva: examiner characters (2D, voice, language) that students choose from, plus usage numbers. */
export default function Viva() {
  const { toast, confirm } = useFeedback();
  const data = useAsync(() => admin.vivaStats(), []);
  const [editing, setEditing] = useState(null);
  const [choosing, setChoosing] = useState(false);
  const s = data.data;

  async function remove(c) {
    if (!await confirm({ title: `Delete ${c.name}?`, message: 'Students will no longer see this examiner. Past vivas keep their results.', ok: 'Delete', danger: true })) return;
    try { await admin.deleteCharacter(c.id); toast('Character deleted.'); data.reload(); } catch (e) { toast(e.message, 'error'); }
  }

  async function togglePublish(c) {
    try { await admin.updateCharacter(c.id, { ...c, isPublished: !c.isPublished }); toast(c.isPublished ? 'Hidden from students.' : 'Published to students.'); data.reload(); }
    catch (e) { toast(e.message, 'error'); }
  }

  return (
    <>
      <PageHead title="Mock viva" sub="The AI examiners students practise with. Start from a stock male or female design, set the name, look, language and voice, then publish it.">
        <button type="button" className="adm-btn primary" onClick={() => setChoosing(true)}><Icon name="plus" />New character</button>
      </PageHead>
      {data.error && <ErrorBox error={data.error} onRetry={data.reload} />}
      {data.loading && !s && <Loading />}
      {s && (
        <>
          <div className="adm-stats">
            {[['Vivas started', s.sessions], ['Vivas finished', s.completed], ['Average score', s.averageScore != null ? `${s.averageScore}%` : '—'], ['Students practising', s.students], ['Published examiners', s.characters.filter(c => c.isPublished).length]].map(([l, v]) => (
              <div key={l} className="adm-card adm-stat"><small>{l}</small><strong>{v}</strong></div>
            ))}
          </div>
          <section className="adm-card">
            <div className="adm-card-head"><div><h2>Examiner characters</h2><p>Students pick one of the published characters before their viva.</p></div></div>
            <div className="adm-chars">
              {s.characters.map(c => (
                <article key={c.id} className={`adm-char${c.isPublished ? '' : ' off'}`}>
                  <div className="adm-char-face"><Examiner mood="happy" size={150} portrait label="" look={lookOf(c)} /></div>
                  <strong>{c.name}</strong>
                  <small>{c.tagline || `${c.style} examiner`}</small>
                  <div className="adm-char-tags">
                    <span className="adm-pill info">{LANGUAGE_NAME[c.language] ?? c.language}</span>
                    <span className="adm-pill">{c.gender === 'female' ? 'Female voice' : 'Male voice'}</span>
                    <span className="adm-pill">{c.sessions} vivas</span>
                    <span className={`adm-pill ${c.isPublished ? 'ok' : ''}`}>{c.isPublished ? 'Published' : 'Hidden'}</span>
                  </div>
                  <div className="adm-row-actions" style={{ justifyContent: 'center' }}>
                    <button type="button" className="adm-btn sm" onClick={() => setEditing(c)}><Icon name="edit" size={15} />Edit</button>
                    <button type="button" className="adm-btn sm ghost" onClick={() => togglePublish(c)}>{c.isPublished ? 'Hide' : 'Publish'}</button>
                    <button type="button" className="adm-icon-btn danger" onClick={() => remove(c)} aria-label={`Delete ${c.name}`}><Icon name="trash" size={16} /></button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {choosing && (
        <Modal title="Choose a stock character" onClose={() => setChoosing(false)} size="lg">
          <p className="adm-confirm-text" style={{ marginBottom: 14 }}>Pick a starting design. You can change the name, colours, hair, voice and language next.</p>
          <div className="adm-chars">
            {STOCK_EXAMINERS.map(st => (
              <button key={st.preset} type="button" className="adm-char pick" onClick={() => { setChoosing(false); setEditing({ ...st, tagline: '', language: 'en-GB', rate: 1, pitch: st.gender === 'female' ? 1.05 : 0.95, style: 'Standard', isPublished: true }); }}>
                <div className="adm-char-face"><Examiner mood="happy" size={130} portrait label="" look={st} /></div>
                <strong>{st.label}</strong>
                <small>{st.gender === 'female' ? 'Female' : 'Male'}</small>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {editing && <CharacterForm character={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); data.reload(); }} />}
    </>
  );
}

function CharacterForm({ character, onClose, onSaved }) {
  const { toast } = useFeedback();
  const isNew = !character.id;
  const [c, setC] = useState({
    name: character.name, tagline: character.tagline ?? '', preset: character.preset ?? 'custom', gender: character.gender,
    skinTone: character.skinTone, hairColor: character.hairColor, hairStyle: character.hairStyle, outfitColor: character.outfitColor,
    accentColor: character.accentColor, glasses: character.glasses, facialHair: character.facialHair, language: character.language,
    rate: character.rate, pitch: character.pitch, style: character.style, isPublished: character.isPublished,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const speaker = useSpeaker(c);
  const set = k => e => setC(x => ({ ...x, [k]: e.target.type === 'number' || e.target.type === 'range' ? Number(e.target.value) : e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (isNew) await admin.createCharacter(c); else await admin.updateCharacter(character.id, c);
      toast(c.isPublished ? 'Saved and published to students.' : 'Saved as hidden.');
      onSaved();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? 'New examiner' : `Edit ${character.name}`} onClose={() => { speaker.stop(); onClose(); }} size="lg">
      <form onSubmit={save} className="adm-char-editor">
        <div className="adm-char-preview">
          <Examiner state={speaker.speaking ? 'speaking' : 'idle'} mood="happy" size={240} look={lookOf(c)} />
          <button type="button" className="adm-btn sm" onClick={() => (speaker.speaking ? speaker.stop() : speaker.speak(sampleLine(c)))} disabled={!speaker.hasVoice}>
            {speaker.speaking ? 'Stop' : 'Test voice'}
          </button>
          {!speaker.hasVoice && <small className="adm-hint" style={{ textAlign: 'center' }}>This browser has no {LANGUAGE_NAME[c.language]} voice. Students on devices without it will read the questions as text.</small>}
        </div>
        <div className="adm-form">
          {error && <p className="adm-form-error">{error}</p>}
          <Field label="Name (shown on the nameplate)"><input type="text" value={c.name} onChange={set('name')} maxLength={40} required /></Field>
          <Field label="Short description"><input type="text" value={c.tagline} onChange={set('tagline')} maxLength={160} placeholder="Calm, asks about design decisions" /></Field>
          <Field label="Voice and look"><select value={c.gender} onChange={e => setC(x => ({ ...x, gender: e.target.value, facialHair: e.target.value === 'female' ? false : x.facialHair }))}><option value="male">Male</option><option value="female">Female</option></select></Field>
          <Field label="Hair"><select value={c.hairStyle} onChange={set('hairStyle')}>{HAIR.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Skin"><input type="color" value={c.skinTone} onChange={set('skinTone')} /></Field>
          <Field label="Hair colour"><input type="color" value={c.hairColor} onChange={set('hairColor')} /></Field>
          <Field label="Jacket"><input type="color" value={c.outfitColor} onChange={set('outfitColor')} /></Field>
          <Field label="Tie / nameplate"><input type="color" value={c.accentColor} onChange={set('accentColor')} /></Field>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }} className="wide">
            <Toggle checked={c.glasses} onChange={v => setC(x => ({ ...x, glasses: v }))} label="Glasses" />
            {c.gender === 'male' && <Toggle checked={c.facialHair} onChange={v => setC(x => ({ ...x, facialHair: v }))} label="Moustache" />}
          </div>
          <Field label="Language" >
            <select value={c.language} onChange={set('language')}>{LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </Field>
          <Field label="Examiner style"><select value={c.style} onChange={set('style')}>{STYLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label={`Speaking speed ${c.rate.toFixed(2)}×`}><input type="range" min="0.7" max="1.3" step="0.05" value={c.rate} onChange={set('rate')} /></Field>
          <Field label={`Pitch ${c.pitch.toFixed(2)}`}><input type="range" min="0.7" max="1.3" step="0.05" value={c.pitch} onChange={set('pitch')} /></Field>
          <div className="wide"><Toggle checked={c.isPublished} onChange={v => setC(x => ({ ...x, isPublished: v }))} label="Published (students can choose this examiner)" /></div>
          <div className="adm-modal-actions wide">
            <button type="button" className="adm-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="adm-btn primary" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Create' : 'Save'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

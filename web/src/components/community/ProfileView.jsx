import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  acceptFriend, declineFriend, getCommunityFeed, getCommunityProfile, getProfileFriends, removeCover, removeFriend,
  sendFriendRequest, toggleFollowPage, updateCommunityProfile, uploadCover, uploadUrl,
} from '../../api/projectMentorApi';
import Avatar, { BadgeChip } from '../Avatar';
import { compressImage } from '../../ui/image';
import { useFeedback } from '../../ui/feedback';
import PostCard from './PostCard';
import Composer from './Composer';
import { AudienceIcon, Icon, Modal, VerifiedTick, useCommunity } from './shared';

const FIELDS = [
  ['university', 'University', 'e.g. SLIIT'],
  ['degree', 'Degree', 'e.g. BSc (Hons) in Information Technology'],
  ['location', 'Lives in', 'e.g. Colombo, Sri Lanka'],
  ['skills', 'Skills', 'e.g. React, C#, UI design'],
];
const VIS = [['Public', 'Public'], ['Friends', 'Friends'], ['Private', 'Only me']];

/** Buttons for another person's profile: Add friend / Cancel / Accept + Decline / Friends (Unfriend) / Follow page. */
export function RelationButtons({ profile, onChange }) {
  const { token, guard } = useCommunity();
  const { confirm, toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const run = async (fn, what = 'add friends') => {
    if (!await guard(what)) return;
    setBusy(true);
    try { await fn(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const rel = profile.relationship;
  if (profile.isSelf) return null;
  if (profile.isOfficial)
    return <button type="button" className={`button button-small ${profile.following ? 'button-quiet' : 'button-primary'}`} disabled={busy}
      onClick={() => run(async () => { const r = await toggleFollowPage(token, profile.id); onChange({ following: r.following, followerCount: profile.followerCount + (r.following ? 1 : -1) }); }, 'follow pages')}>
      {profile.following ? 'Following' : 'Follow'}</button>;
  if (rel === 'Friends')
    return <button type="button" className="button button-quiet button-small" disabled={busy} onClick={() => run(async () => {
      if (!await confirm({ title: `Unfriend ${profile.fullName}?`, message: 'You can send a new request later.', ok: 'Unfriend', danger: true })) return;
      await removeFriend(token, profile.id); onChange({ relationship: 'None' });
    })}>Friends ✓</button>;
  if (rel === 'RequestSent')
    return <button type="button" className="button button-quiet button-small" disabled={busy} onClick={() => run(async () => { await removeFriend(token, profile.id); onChange({ relationship: 'None' }); })}>Cancel request</button>;
  if (rel === 'RequestReceived')
    return <span className="cm-btn-pair">
      <button type="button" className="button button-primary button-small" disabled={busy} onClick={() => run(async () => { await acceptFriend(token, profile.id); onChange({ relationship: 'Friends' }); })}>Confirm</button>
      <button type="button" className="button button-quiet button-small" disabled={busy} onClick={() => run(async () => { await declineFriend(token, profile.id); onChange({ relationship: 'None' }); })}>Delete request</button>
    </span>;
  return <button type="button" className="button button-primary button-small" disabled={busy} onClick={() => run(async () => { const r = await sendFriendRequest(token, profile.id); onChange({ relationship: r.relationship }); })}>Add friend</button>;
}

function EditDetails({ profile, onClose, onSaved }) {
  const { token } = useCommunity();
  const { toast } = useFeedback();
  const [form, setForm] = useState({
    bio: profile.bio ?? '', birthday: profile.birthdayValue ?? '', birthdayShowYear: profile.birthdayShowYear,
    university: profile.university ?? '', degree: profile.degree ?? '', location: profile.location ?? '', skills: profile.skills ?? '',
    githubUrl: profile.githubUrl ?? '', linkedinUrl: profile.linkedinUrl ?? '', website: profile.website ?? '',
  });
  const [vis, setVis] = useState({ ...profile.visibility });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const visSelect = key => (
    <select className="cm-vis" value={vis[key]} onChange={e => setVis(v => ({ ...v, [key]: e.target.value }))} aria-label="Who can see this">
      {VIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try { onSaved(await updateCommunityProfile(token, { ...form, birthday: form.birthday || null, visibility: vis })); toast('Profile saved.'); onClose(); }
    catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  }
  const row = (key, label, el, visKey = key) => (
    <div className="cm-edit-row" key={key}>
      <label>{label}{el}</label>
      <div className="cm-edit-side">{visSelect(visKey)}
        <button type="button" className="cm-link-btn" onClick={() => set(key, key === 'birthday' ? '' : '')} title="Delete">Delete</button></div>
    </div>
  );
  return (
    <Modal title="Edit details" onClose={onClose} wide>
      <form className="cm-edit-details" onSubmit={save}>
        <p className="cm-hint">Your name, profile picture and email come from your main profile. Change them in <Link to="/profile">My profile</Link>.</p>
        <label className="cm-bio">Bio<textarea rows={3} maxLength={500} value={form.bio} onChange={e => set('bio', e.target.value)} placeholder="A line about you and what you are building" /></label>
        {FIELDS.map(([k, l, ph]) => row(k, l, <input value={form[k]} onChange={e => set(k, e.target.value)} placeholder={ph} />))}
        {row('birthday', 'Birthday', <span className="cm-bday"><input type="date" value={form.birthday} max={new Date().toISOString().slice(0, 10)} onChange={e => set('birthday', e.target.value)} />
          <label className="cm-check"><input type="checkbox" checked={form.birthdayShowYear} onChange={e => set('birthdayShowYear', e.target.checked)} /> Show the year</label></span>)}
        {row('githubUrl', 'GitHub', <input value={form.githubUrl} onChange={e => set('githubUrl', e.target.value)} placeholder="github.com/yourname" />, 'links')}
        {row('linkedinUrl', 'LinkedIn', <input value={form.linkedinUrl} onChange={e => set('linkedinUrl', e.target.value)} placeholder="linkedin.com/in/yourname" />, 'links')}
        {row('website', 'Website', <input value={form.website} onChange={e => set('website', e.target.value)} placeholder="yourportfolio.com" />, 'links')}
        <div className="cm-edit-row"><label>Email<input value="From your main profile" disabled /></label><div className="cm-edit-side">{visSelect('email')}</div></div>
        <div className="cm-edit-row"><label>Year of study<input value="From your main profile" disabled /></label><div className="cm-edit-side">{visSelect('year')}</div></div>
        <div className="cm-edit-row"><label>Friends list<input value="Who can see your friends" disabled /></label><div className="cm-edit-side">{visSelect('friends')}</div></div>
        <button className="button button-primary" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Modal>
  );
}

export default function ProfileView({ selfId }) {
  const { id: routeId } = useParams();
  const id = routeId ?? selfId;
  const { token, user, isAuthenticated, guard } = useCommunity();
  const { confirm, toast } = useFeedback();
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('posts');
  const [posts, setPosts] = useState({ list: [], next: null, loading: true });
  const [friends, setFriends] = useState(null);
  const [edit, setEdit] = useState(false);
  const coverInput = useRef(null);

  useEffect(() => {
    if (!id) return;
    setP(null); setError(''); setTab('posts'); setFriends(null);
    getCommunityProfile(token, id).then(setP).catch(e => setError(e.status === 404 ? 'This profile is not available.' : e.message));
  }, [id, token]);
  const loadPosts = useCallback(async (before = null) => {
    try {
      const r = await getCommunityFeed(token, { author: id, before });
      setPosts(s => ({ list: before ? [...s.list, ...r.posts] : r.posts, next: r.nextBefore, loading: false }));
    } catch { setPosts(s => ({ ...s, loading: false })); }
  }, [id, token]);
  useEffect(() => { if (id) { setPosts({ list: [], next: null, loading: true }); loadPosts(); } }, [id, loadPosts]);
  useEffect(() => { if (tab === 'friends' && !friends) getProfileFriends(token, id).then(setFriends).catch(() => setFriends([])); }, [tab, friends, id, token]);

  if (!id) return <div className="cm-card cm-empty"><p>Log in to see your profile.</p><Link className="button button-primary" to="/login">Log in</Link></div>;
  if (error) return <div className="cm-card cm-empty"><p>{error}</p><Link className="button button-quiet" to="/community">Back to the feed</Link></div>;
  if (!p) return <div className="cm-card cm-empty"><p>Loading profile…</p></div>;

  async function changeCover(file) {
    try { const r = await uploadCover(token, await compressImage(file, { max: 1800 })); setP(x => ({ ...x, coverId: r.coverId })); toast('Cover updated.'); }
    catch (e) { toast(e.message, 'error'); }
  }
  async function deleteCover() {
    if (!await confirm({ title: 'Remove cover photo?', ok: 'Remove', danger: true })) return;
    try { await removeCover(token); setP(x => ({ ...x, coverId: null })); } catch (e) { toast(e.message, 'error'); }
  }

  const about = [
    ['university', 'Studies at', p.university], ['degree', 'Degree', p.degree], ['year', 'Year of study', p.yearOfStudy ? `Year ${p.yearOfStudy}` : null],
    ['location', 'Lives in', p.location], ['birthday', 'Birthday', p.birthday], ['email', 'Email', p.email], ['skills', 'Skills', p.skills],
  ].filter(([, , v]) => v);
  const links = [['GitHub', p.githubUrl], ['LinkedIn', p.linkedinUrl], ['Website', p.website]].filter(([, v]) => v);

  return (
    <div className="cm-profile">
      <section className="cm-card cm-profile-top">
        <div className="cm-cover" style={p.coverId ? { backgroundImage: `url(${uploadUrl(p.coverId)})` } : undefined}>
          {p.isSelf && (
            <div className="cm-cover-tools">
              <button type="button" className="cm-chip-btn" onClick={() => coverInput.current.click()}>{Icon.camera}<span>{p.coverId ? 'Change cover' : 'Add cover photo'}</span></button>
              {p.coverId && <button type="button" className="cm-chip-btn" onClick={deleteCover}>Remove</button>}
              <input ref={coverInput} type="file" accept="image/*" hidden onChange={e => { if (e.target.files[0]) changeCover(e.target.files[0]); e.target.value = ''; }} />
            </div>
          )}
        </div>
        <div className="cm-profile-id">
          <div className="cm-profile-avatar"><Avatar name={p.fullName} seed={p.id} size={136} photoId={p.avatarId} badge={p.badge} /></div>
          <div className="cm-profile-name">
            <h1>{p.fullName}{p.isOfficial && <VerifiedTick size={22} />}</h1>
            <p className="cm-muted">
              {p.isOfficial ? `${p.followerCount} follower${p.followerCount === 1 ? '' : 's'} · Official page` : `${p.friendCount} friend${p.friendCount === 1 ? '' : 's'}`}
              {!p.isSelf && p.mutualFriends > 0 && ` · ${p.mutualFriends} mutual`}
            </p>
            {p.badge && <BadgeChip badge={p.badge} />}
          </div>
          <div className="cm-profile-actions">
            {p.isSelf
              ? <><button type="button" className="button button-primary button-small" onClick={() => setEdit(true)}>Edit details</button>
                <Link className="button button-quiet button-small" to="/profile">Main profile</Link></>
              : <RelationButtons profile={p} onChange={patch => setP(x => ({ ...x, ...patch }))} />}
          </div>
        </div>
        <nav className="cm-profile-tabs" aria-label="Profile sections">
          {[['posts', 'Posts'], ['about', 'About'], ...(p.isOfficial ? [] : [['friends', 'Friends']])].map(([k, l]) => (
            <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
      </section>

      <div className="cm-profile-body">
        <aside className="cm-card cm-intro">
          <h2>Intro</h2>
          {p.bio ? <p className="cm-bio-text">{p.bio}</p> : p.isSelf && <p className="cm-muted">Add a short bio so people know what you are building.</p>}
          <ul className="cm-facts">
            {about.slice(0, 5).map(([k, l, v]) => <li key={k}><span>{l}</span> <b>{v}</b>{p.isSelf && <span className="cm-fact-vis" title={`Visible to: ${p.visibility?.[k]}`}><AudienceIcon value={p.visibility?.[k]} size={12} /></span>}</li>)}
            {links.map(([l, v]) => <li key={l}><span>{l}</span> <a href={v} target="_blank" rel="noreferrer">{v.replace(/^https?:\/\//, '')}</a></li>)}
          </ul>
          {p.isSelf && <button type="button" className="button button-quiet button-small" style={{ width: '100%' }} onClick={() => setEdit(true)}>Edit details</button>}
        </aside>

        <div className="cm-profile-main">
          {tab === 'posts' && (
            <>
              {p.isSelf && <Composer onPosted={post => setPosts(s => ({ ...s, list: post.status === 'Approved' ? [post, ...s.list] : s.list }))} />}
              {posts.list.map(post => <PostCard key={post.id} post={post} onRemoved={pid => setPosts(s => ({ ...s, list: s.list.filter(x => x.id !== pid) }))} />)}
              {!posts.loading && posts.list.length === 0 && <div className="cm-card cm-empty"><p>No posts to show yet.</p></div>}
              {posts.next && <button type="button" className="button button-quiet" onClick={() => loadPosts(posts.next)}>Load more</button>}
            </>
          )}
          {tab === 'about' && (
            <section className="cm-card cm-about">
              <h2>About</h2>
              {p.bio && <p>{p.bio}</p>}
              {about.length === 0 && links.length === 0 && <p className="cm-muted">{p.isSelf ? 'You have not added any details yet.' : 'Nothing to show here.'}</p>}
              <dl>{about.map(([k, l, v]) => <div key={k}><dt>{l}</dt><dd>{v}{p.isSelf && <span className="cm-fact-vis"><AudienceIcon value={p.visibility?.[k]} size={12} /> {p.visibility?.[k] === 'Private' ? 'Only me' : p.visibility?.[k]}</span>}</dd></div>)}
                {links.map(([l, v]) => <div key={l}><dt>{l}</dt><dd><a href={v} target="_blank" rel="noreferrer">{v}</a></dd></div>)}
                <div><dt>Joined</dt><dd>{new Date(p.joinedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</dd></div></dl>
              {p.isSelf && <button type="button" className="button button-primary button-small" onClick={() => setEdit(true)}>Edit details</button>}
            </section>
          )}
          {tab === 'friends' && (
            <section className="cm-card">
              <h2 className="cm-section-title">Friends</h2>
              {!friends ? <p className="cm-muted">Loading…</p> : friends.length === 0 ? <p className="cm-muted">No friends to show.</p> : (
                <div className="cm-people-grid">
                  {friends.map(f => (
                    <Link key={f.id} to={`/community/profile/${f.id}`} className="cm-person-tile">
                      <Avatar name={f.fullName} seed={f.id} size={64} photoId={f.avatarId} badge={f.badge} />
                      <b>{f.fullName}</b>{f.mutualFriends > 0 && <small>{f.mutualFriends} mutual</small>}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
      {edit && <EditDetails profile={p} onClose={() => setEdit(false)} onSaved={setP} />}
      {!isAuthenticated && !p.isSelf && <p className="cm-hint center"><button type="button" className="linklike" onClick={() => guard('add friends')}>Log in</button> to add {p.fullName.split(' ')[0]} as a friend.</p>}
      {user && null}
    </div>
  );
}

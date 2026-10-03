const PALETTE = ['#0e7a52', '#2f7fd1', '#6b5bd2', '#c2573a', '#a9832b', '#0f8a95', '#b23a6f', '#3d7a2a', '#7a4a2a', '#4a5a9a'];

/** Stable colour per person, from their id or name. */
export function colorFor(seed = '') {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export function initialsOf(name = '?') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5220';

/** Badge frame colours (awarded by admins): Silver, Gold, Premium, Diamond. */
export const BADGES = {
  Silver: { color: '#A8B2BF', label: 'Silver member' },
  Gold: { color: '#D4A63A', label: 'Gold member' },
  Premium: { color: '#6B5BD2', label: 'Premium member' },
  Diamond: { color: '#2FA7D4', label: 'Diamond member' },
};

/** Profile picture (or initials), framed in the user's badge colour when they have one. */
export default function Avatar({ name, initials, seed, size = 36, title, ring = false, photoId, badge }) {
  const bg = colorFor(seed || name || initials || '');
  const frame = BADGES[badge];
  const ringWidth = Math.max(2, Math.round(size / 18));
  const style = { width: size, height: size, background: bg, fontSize: Math.max(10, size * 0.38) };
  if (frame) style.boxShadow = `0 0 0 ${ringWidth}px #fff, 0 0 0 ${ringWidth * 2}px ${frame.color}`;
  return (
    <span className={`avatar${ring ? ' ring' : ''}${frame ? ' framed' : ''}`} title={title ?? (frame ? `${name} · ${frame.label}` : name)}
      style={style} aria-hidden={title === '' ? true : undefined}>
      {photoId
        ? <img src={`${API_URL}/api/uploads/${photoId}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        : (initials || initialsOf(name))}
      {frame && size >= 40 && <span className="avatar-badge" style={{ background: frame.color }} aria-hidden="true">{badge[0]}</span>}
    </span>
  );
}

/** Small "Gold member" style chip shown next to a name. */
export function BadgeChip({ badge }) {
  const frame = BADGES[badge];
  if (!frame) return null;
  return <span className="badge-chip" style={{ color: frame.color, borderColor: frame.color }}>{badge}</span>;
}

export function AvatarStack({ people = [], max = 5, size = 28 }) {
  const shown = people.slice(0, max);
  return (
    <span className="avatar-stack" aria-label={`${people.length} members`}>
      {shown.map((p, i) => <Avatar key={p.userId ?? i} name={p.fullName ?? p.name} initials={p.initials} seed={p.userId ?? p.fullName} size={size} ring />)}
      {people.length > max && <span className="avatar more" style={{ width: size, height: size, fontSize: size * 0.36 }}>+{people.length - max}</span>}
    </span>
  );
}

export function timeAgo(iso) {
  const d = new Date(iso);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)} d ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

/** Monday of the week (local), as YYYY-MM-DD — matches the API's WeekStart. */
export function mondayOf(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addWeeks(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n * 7);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function weekLabel(week, current) {
  if (!week) return 'No week';
  if (week === current) return 'This week';
  if (week === addWeeks(current, 1)) return 'Next week';
  if (week === addWeeks(current, -1)) return 'Last week';
  const [y, m, d] = week.split('-').map(Number);
  return `Week of ${new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

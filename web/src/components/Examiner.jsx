import { useId } from 'react';
import { DEFAULT_LOOK } from '../content/examiners';

/**
 * The animated 2D viva examiner (pure SVG + CSS, no libraries). Admins create characters from the stock
 * male and female designs and change the colours, hair, glasses and name (the `look` prop).
 *
 * state: 'idle' | 'speaking' | 'listening' | 'thinking'
 * mood:  'neutral' | 'happy' | 'impressed' | 'satisfied' | 'unsure' | 'concerned'
 *
 * Blinking, breathing, talking (mouth), nodding (listening) and the thinking bubble are all
 * CSS animations keyed off the classes on the root <svg>, so React only changes two props.
 */
const MOUTHS = {
  neutral: <path className="ex-mouth-line" d="M138 177 Q150 182 162 177" />,
  satisfied: <path className="ex-mouth-line" d="M136 175 Q150 186 164 175" />,
  happy: <path className="ex-mouth-fill" d="M134 173 Q150 193 166 173 Q150 180 134 173Z" />,
  impressed: <path className="ex-mouth-fill" d="M133 172 Q150 196 167 172 Q150 179 133 172Z" />,
  unsure: <path className="ex-mouth-line" d="M138 179 Q144 175 150 179 Q156 183 162 177" />,
  concerned: <path className="ex-mouth-line" d="M139 181 Q150 174 161 181" />,
};

/** Darker / lighter shade of a #rrggbb colour (for shadows and highlights). */
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(c + 255 * amount)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f).map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

function Hair({ style, color, back }) {
  const dark = shade(color, -0.12);
  if (style === 'bald') {
    return back ? null : <path d="M94 126 C92 112 96 104 102 100 L104 122 Z M206 126 C208 112 204 104 198 100 L196 122 Z" fill={color} />;
  }
  if (back) {
    if (style === 'long') return <path d="M86 120 C80 70 112 50 150 50 C188 50 220 70 214 120 L222 214 C200 226 178 220 168 206 L132 206 C122 220 100 226 78 214 Z" fill={dark} />;
    if (style === 'bun') return <circle cx="150" cy="52" r="20" fill={dark} />;
    if (style === 'curly') return <path d="M84 132 C70 100 90 60 120 56 C130 40 170 40 180 56 C210 60 230 100 216 132 C222 150 208 160 204 148 L96 148 C92 160 78 150 84 132 Z" fill={dark} />;
    return null;
  }
  switch (style) {
    case 'side':
      return <path d="M92 124 C86 76 114 54 152 56 C192 58 214 82 208 124 C204 104 196 94 186 88 C160 92 128 82 112 96 C102 102 95 110 92 124 Z" fill={color} />;
    case 'long':
    case 'bun':
      return <path d="M92 128 C86 78 114 56 150 56 C186 56 214 78 208 128 C202 102 186 88 166 84 C152 96 128 100 108 98 C100 106 95 116 92 128 Z" fill={color} />;
    case 'curly':
      return (
        <g fill={color}>
          {[[104, 92], [120, 76], [140, 68], [160, 68], [180, 76], [196, 92], [100, 112], [200, 112]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="16" />)}
        </g>
      );
    default: // short
      return (
        <>
          <path d="M92 124 C86 78 112 56 150 56 C190 56 214 78 208 124 C205 106 198 96 189 90 C172 98 128 98 111 90 C102 96 95 106 92 124 Z" fill={color} />
          <path d="M111 90 C128 98 172 98 189 90 C180 80 166 74 150 74 C134 74 120 80 111 90 Z" fill={dark} opacity="0.5" />
        </>
      );
  }
}

export default function Examiner({ state = 'idle', mood = 'neutral', size = 300, portrait = false, look: lookProp, label }) {
  const look = { ...DEFAULT_LOOK, ...(lookProp ?? {}) };
  const uid = useId().replace(/:/g, '');
  const m = MOUTHS[mood] ? mood : 'neutral';
  const skin = look.skinTone;
  const skinShade = shade(skin, -0.08);
  const outfit = look.outfitColor;
  const female = look.gender === 'female';
  const name = (look.name || 'Examiner').toUpperCase();
  const a11y = label ?? `${look.name || 'Your examiner'}, your viva examiner`;

  return (
    <svg
      className={`ex ex-state-${state} ex-mood-${m}`}
      viewBox={portrait ? '72 46 156 156' : '0 0 300 300'}
      width={size}
      height={size}
      role={a11y ? 'img' : undefined}
      aria-label={a11y || undefined}
      aria-hidden={a11y ? undefined : true}
    >
      <defs>
        <clipPath id={`l${uid}`}><ellipse cx="127" cy="130" rx="7.5" ry="8" /></clipPath>
        <clipPath id={`r${uid}`}><ellipse cx="173" cy="130" rx="7.5" ry="8" /></clipPath>
      </defs>

      <circle cx="150" cy="130" r="128" fill={outfit} opacity="0.14" />

      {/* Thinking bubble */}
      <g className="ex-think" aria-hidden="true">
        <circle cx="222" cy="78" r="5" />
        <circle cx="238" cy="58" r="8" />
        <g className="ex-think-cloud">
          <ellipse cx="262" cy="30" rx="26" ry="18" />
          <circle className="ex-dot" cx="251" cy="30" r="3" />
          <circle className="ex-dot" cx="262" cy="30" r="3" />
          <circle className="ex-dot" cx="273" cy="30" r="3" />
        </g>
      </g>

      <g className="ex-body">
        <Hair style={look.hairStyle} color={look.hairColor} back />
        {/* Shoulders + jacket */}
        <path d="M54 300 C56 250 90 224 132 212 L150 236 L168 212 C210 224 244 250 246 300 Z" fill={outfit} />
        <path d="M132 212 L150 236 L168 212 L163 205 L150 220 L137 205 Z" fill="#f7f8f4" />
        {female
          ? <circle cx="150" cy="232" r="5" fill={look.accentColor} />
          : <><path d="M146 224 L154 224 L158 262 L150 274 L142 262 Z" fill={look.accentColor} />
            <path d="M146 224 L154 224 L152 231 L148 231 Z" fill={shade(look.accentColor, -0.12)} /></>}
        <path d="M132 212 L118 236 L136 246 L150 236 Z" fill={shade(outfit, -0.1)} />
        <path d="M168 212 L182 236 L164 246 L150 236 Z" fill={shade(outfit, -0.1)} />
        <circle cx="194" cy="252" r="3" fill={look.accentColor} />

        <g className="ex-head">
          <path d="M134 184 L134 210 Q150 222 166 210 L166 184 Z" fill={skinShade} />
          <ellipse cx="94" cy="134" rx="9" ry="14" fill={skinShade} />
          <ellipse cx="206" cy="134" rx="9" ry="14" fill={skinShade} />
          {female && <><circle cx="94" cy="150" r="3.5" fill={look.accentColor} /><circle cx="206" cy="150" r="3.5" fill={look.accentColor} /></>}
          <ellipse cx="150" cy="128" rx="57" ry="64" fill={skin} />
          <Hair style={look.hairStyle} color={look.hairColor} />
          <circle cx="113" cy="157" r="9" fill="#e8846c" opacity={female ? 0.3 : 0.2} />
          <circle cx="187" cy="157" r="9" fill="#e8846c" opacity={female ? 0.3 : 0.2} />

          <path className="ex-brow ex-brow-l" d="M113 110 Q126 102 140 107" style={{ stroke: shade(look.hairColor, -0.25) }} />
          <path className="ex-brow ex-brow-r" d="M160 107 Q174 102 187 110" style={{ stroke: shade(look.hairColor, -0.25) }} />

          <g clipPath={`url(#l${uid})`}>
            <ellipse cx="127" cy="130" rx="7.5" ry="8" fill="#fff" />
            <g className="ex-pupils"><circle cx="127" cy="131" r="3.8" fill="#23302a" /><circle cx="128.3" cy="129.5" r="1.1" fill="#fff" /></g>
            <rect className="ex-lid" x="118" y="121" width="18" height="18" fill={skin} />
          </g>
          <g clipPath={`url(#r${uid})`}>
            <ellipse cx="173" cy="130" rx="7.5" ry="8" fill="#fff" />
            <g className="ex-pupils"><circle cx="173" cy="131" r="3.8" fill="#23302a" /><circle cx="174.3" cy="129.5" r="1.1" fill="#fff" /></g>
            <rect className="ex-lid" x="164" y="121" width="18" height="18" fill={skin} />
          </g>
          {female && (
            <g stroke="#23302a" strokeWidth="1.6" strokeLinecap="round">
              <path d="M119 124 L116 121" /><path d="M135 124 L138 121" /><path d="M165 124 L162 121" /><path d="M181 124 L184 121" />
            </g>
          )}

          {look.glasses && (
            <>
              <g className="ex-glasses" fill="none" stroke="#1d2320" strokeWidth="3">
                <rect x="107" y="115" width="40" height="29" rx="10" />
                <rect x="153" y="115" width="40" height="29" rx="10" />
                <path d="M147 128 Q150 124 153 128" />
                <path d="M107 124 L95 121" />
                <path d="M193 124 L205 121" />
              </g>
              <path d="M111 119 L120 119" stroke="#fff" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
              <path d="M157 119 L166 119" stroke="#fff" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
            </>
          )}

          <path d="M150 136 Q143 152 149 157 Q154 159 158 155" fill="none" stroke={shade(skin, -0.2)} strokeWidth="2.6" strokeLinecap="round" />
          {look.facialHair && !female && (
            <path d="M131 167 Q141 159 150 164 Q159 159 169 167 Q160 172 150 168 Q140 172 131 167 Z" fill={look.hairColor} />
          )}

          <g className="ex-mouth-rest">{MOUTHS[m]}</g>
          <g className="ex-mouth-talk">
            <ellipse cx="150" cy="178" rx="9" ry="6.5" fill="#6b2424" />
            <ellipse cx="150" cy="181.5" rx="5" ry="2.4" fill="#d9706a" />
          </g>
        </g>
      </g>

      {/* Desk + nameplate */}
      <rect x="0" y="266" width="300" height="34" fill="#151a16" />
      <rect x="0" y="266" width="300" height="3" fill="#2a332c" />
      <g className="ex-plate">
        <rect x="88" y="272" width="124" height="22" rx="3" fill={look.accentColor} />
        <rect x="91" y="275" width="118" height="16" rx="2" fill="none" stroke={shade(look.accentColor, -0.25)} strokeWidth="1" />
        <text x="150" y="287" textAnchor="middle" fontFamily="'Plus Jakarta Sans', sans-serif" fontSize={name.length > 14 ? 8 : 10} fontWeight="700" letterSpacing="1.5" fill="#1b1407">{name}</text>
      </g>
    </svg>
  );
}

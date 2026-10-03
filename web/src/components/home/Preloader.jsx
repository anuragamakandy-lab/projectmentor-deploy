import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './useHomeMotion';

const STATUS = [
  [0, 'Loading your workspace'],
  [35, 'Preparing lessons and templates'],
  [70, 'Getting your AI mentor ready'],
  [100, 'Welcome'],
];
const COLUMNS = 5;

/**
 * Home-page intro (runs on every visit to the home page).
 * Gold curves draw in, the logo is wiped in from left to right, a status line and counter follow
 * real loading (fonts, key images, window load), then five columns lift away to reveal the page.
 * A timer (not rAF) drives progress so it also completes in background tabs; a hard deadline
 * guarantees it can never trap the visitor.
 */
export default function Preloader({ onDone, assets = [] }) {
  const [shown, setShown] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const target = useRef(6);
  const finished = useRef(false);

  useEffect(() => {
    const reduce = prefersReducedMotion();
    const started = performance.now();
    const minTime = reduce ? 200 : 2000;
    const state = { fonts: false, images: 0, load: document.readyState === 'complete' };
    const total = Math.max(1, assets.length);
    const bump = () => { target.current = 6 + (state.fonts ? 24 : 0) + Math.round((state.images / total) * 50) + (state.load ? 20 : 0); };
    bump();

    if (document.fonts?.ready) document.fonts.ready.then(() => { state.fonts = true; bump(); });
    else state.fonts = true;
    assets.forEach(src => {
      const img = new Image();
      img.onload = img.onerror = () => { state.images += 1; bump(); };
      img.src = src;
    });
    const onLoad = () => { state.load = true; bump(); };
    window.addEventListener('load', onLoad);

    document.documentElement.classList.add('hm-lock');
    window.scrollTo(0, 0);
    let value = 0;
    const timers = [];
    const finish = () => {
      if (finished.current) return;
      finished.current = true;
      clearInterval(loop);
      setShown(100);
      timers.push(setTimeout(() => setLeaving(true), reduce ? 0 : 450));
      timers.push(setTimeout(() => {
        document.documentElement.classList.remove('hm-lock');
        onDone();
      }, reduce ? 60 : 1650));
    };
    const loop = setInterval(() => {
      const ceiling = performance.now() - started < minTime ? Math.min(target.current, 86) : target.current;
      value = Math.min(ceiling, value + (ceiling - value) * (reduce ? 1 : 0.09) + 0.3);
      setShown(Math.floor(value));
      if (value >= 99.5) finish();
    }, 30);
    const safety = setTimeout(() => { state.fonts = true; state.images = total; state.load = true; bump(); }, 4500);
    const hardStop = setTimeout(finish, 7000);

    return () => {
      clearInterval(loop);
      [safety, hardStop, ...timers].forEach(clearTimeout);
      window.removeEventListener('load', onLoad);
      document.documentElement.classList.remove('hm-lock');
    };
  }, [assets, onDone]);

  const status = [...STATUS].reverse().find(([at]) => shown >= at)?.[1] ?? STATUS[0][1];

  return (
    <div className={`pl${leaving ? ' pl-leave' : ''}`} role="status" aria-live="polite" aria-label={`Loading ProjectMentor, ${shown} percent`}>
      <div className="pl-cols" aria-hidden="true">
        {Array.from({ length: COLUMNS }, (_, i) => <span key={i} style={{ '--i': i }} />)}
      </div>

      <svg className="pl-curves" viewBox="0 0 1440 900" preserveAspectRatio="none" aria-hidden="true">
        <path className="pl-blob a" d="M0 0 H420 C 360 150 220 300 0 360 Z" />
        <path className="pl-blob b" d="M1440 900 H1080 C 1160 760 1300 640 1440 600 Z" />
        <path className="pl-curve c1" pathLength="1" d="M0 250 C 220 250 360 160 470 70 C 520 30 560 8 600 0" />
        <path className="pl-curve c2" pathLength="1" d="M840 900 C 1040 840 1180 720 1290 660 C 1350 630 1400 620 1440 620" />
        <path className="pl-curve c3" pathLength="1" d="M1440 30 C 1360 40 1300 120 1310 210 C 1320 300 1390 340 1440 345" />
        <path className="pl-curve c4" pathLength="1" d="M0 520 C 90 560 140 640 130 720 C 122 790 80 840 40 870" />
        <circle className="pl-node n1" cx="1312" cy="216" r="9" />
        <circle className="pl-node n2" cx="120" cy="672" r="9" />
      </svg>

      <div className="pl-content">
        <div className="pl-logo-wrap">
          <img className="pl-logo-full" src="/logo-full.png" alt="ProjectMentor" />
        </div>
        <span className="pl-mask"><span className="pl-tag">From first idea to final viva</span></span>
      </div>

      <div className="pl-bottom">
        <div className="pl-status">
          <span className="pl-mask"><span key={status} className="pl-status-text">{status}</span></span>
          <span className="pl-count">{shown}<small>%</small></span>
        </div>
        <div className="pl-line"><span style={{ transform: `scaleX(${shown / 100})` }} /></div>
      </div>
    </div>
  );
}

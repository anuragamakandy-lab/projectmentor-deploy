import { useCallback, useEffect, useRef, useState } from 'react';

/* Browser-native voice for the mock viva: free, no API keys, nothing leaves the browser
   except what the browser's own speech service needs. */

const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } },
};

const FEMALE = /female|woman|zira|aria|jenny|sonia|libby|hazel|susan|samantha|karen|moira|tessa|veena|heera|swara|neerja|google uk english female|google us english/i;
const MALE = /male|guy|ryan|david|mark|daniel|george|brian|christopher|andrew|ravi|prabhat|google uk english male/i;

/** Best installed voice for a language and preferred gender (any voice of the language when the gender is not found). */
export function pickVoice(voices, language = 'en-GB', gender = 'male') {
  const base = language.split('-')[0];
  const exact = voices.filter(v => v.lang?.toLowerCase() === language.toLowerCase());
  const same = exact.length ? exact : voices.filter(v => v.lang?.toLowerCase().startsWith(base));
  if (!same.length) return null;
  const want = gender === 'female' ? FEMALE : MALE;
  const avoid = gender === 'female' ? MALE : FEMALE;
  return same.find(v => want.test(v.name) && /natural|online|google/i.test(v.name))
    ?? same.find(v => want.test(v.name))
    ?? same.find(v => !avoid.test(v.name))
    ?? same[0];
}

/**
 * Text-to-speech in the examiner character's voice. The language, gender, speed and pitch come from
 * the character an admin set up; students only choose the character (and can mute).
 * speak(text) resolves when finished (or immediately when muted, unsupported or no voice for the language).
 */
export function useSpeaker(character) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [voices, setVoices] = useState([]);
  const [muted, setMuted] = useState(() => store.get('pm.viva.muted', false));
  const [speaking, setSpeaking] = useState(false);
  const token = useRef(0);
  const language = character?.language ?? 'en-GB';
  const voice = pickVoice(voices, language, character?.gender ?? 'male');
  // A Sinhala character on a device without a Sinhala voice: show the text instead of reading it with an English voice.
  const hasVoice = Boolean(voice);

  useEffect(() => {
    if (!supported) return undefined;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load);
      window.speechSynthesis.cancel();
    };
  }, [supported]);

  useEffect(() => store.set('pm.viva.muted', muted), [muted]);

  const stop = useCallback(() => {
    token.current += 1;
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback((text) => {
    stop();
    if (!supported || muted || !text || !voice) return Promise.resolve();
    const my = token.current;
    // Chrome cuts long utterances off after ~15s, so speak sentence by sentence (also Sinhala full stops).
    const parts = text.match(/[^.!?।]+[.!?।]*\s*/g)?.map(s => s.trim()).filter(Boolean) ?? [text];
    setSpeaking(true);
    return new Promise((resolve) => {
      let i = 0;
      const next = () => {
        if (my !== token.current) return resolve();
        if (i >= parts.length) { setSpeaking(false); return resolve(); }
        const u = new SpeechSynthesisUtterance(parts[i++]);
        u.voice = voice;
        u.lang = voice.lang;
        u.rate = character?.rate ?? 1;
        u.pitch = character?.pitch ?? 0.95;
        u.onend = next;
        u.onerror = next;
        window.speechSynthesis.speak(u);
      };
      next();
    });
  }, [supported, muted, voice, character, stop]);

  return { supported, voice, hasVoice, language, muted, setMuted, speaking, speak, stop };
}

/** Speech-to-text: live transcript while listening. Chrome/Edge only; others fall back to typing. */
export function useListener() {
  const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const supported = Boolean(Recognition);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const [lang, setLang] = useState(() => store.get('pm.viva.lang', 'en-US'));
  const rec = useRef(null);
  const wanted = useRef(false);
  const onFinal = useRef(() => {});

  useEffect(() => store.set('pm.viva.lang', lang), [lang]);

  const stop = useCallback(() => {
    wanted.current = false;
    setListening(false);
    setInterim('');
    try { rec.current?.stop(); } catch { /* ignore */ }
  }, []);

  const start = useCallback((handleFinal) => {
    if (!supported) return;
    onFinal.current = handleFinal;
    setError('');
    wanted.current = true;
    const r = new Recognition();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) onFinal.current(t.trim());
        else live += t;
      }
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('Microphone access was blocked. Allow the mic in your browser’s address bar, or type your answer.');
        wanted.current = false;
      } else if (e.error === 'audio-capture') {
        setError('No microphone was found. Plug one in, or type your answer.');
        wanted.current = false;
      }
    };
    // Chrome ends recognition after a pause; restart quietly while the student is still answering.
    r.onend = () => {
      if (wanted.current) { try { r.start(); } catch { /* ignore */ } }
      else { setListening(false); setInterim(''); }
    };
    rec.current = r;
    try { r.start(); setListening(true); } catch { setListening(false); }
  }, [Recognition, supported, lang]);

  useEffect(() => () => { wanted.current = false; try { rec.current?.abort(); } catch { /* ignore */ } }, []);

  return { supported, listening, interim, error, lang, setLang, start, stop };
}

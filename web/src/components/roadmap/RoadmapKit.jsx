import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/roadmap.css';

/** Steps of building a roadmap. Earlier steps are links so students can always go back. */
export function RoadmapSteps({ current, links = {} }) {
  const steps = [['details', 'Your details'], ['idea', 'Choose an idea'], ['chat', 'Talk to the mentor'], ['review', 'Review & accept']];
  const index = steps.findIndex(([k]) => k === current);
  return (
    <ol className="rm-steps" aria-label="Roadmap steps">
      {steps.map(([key, label], i) => {
        const state = i < index ? 'done' : i === index ? 'now' : 'next';
        const inner = <><span className="rm-step-n">{state === 'done' ? '✓' : i + 1}</span><span className="rm-step-label">{label}</span></>;
        return (
          <li key={key} className={`rm-step ${state}`} aria-current={state === 'now' ? 'step' : undefined}>
            {state === 'done' && links[key] ? <Link to={links[key].to} state={{ back: true, ...links[key].state }}>{inner}</Link> : <span>{inner}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** Small, safe Markdown for chatbot replies: paragraphs, - and 1. lists, **bold**, *italic* and `code`. */
export function Markdown({ text }) {
  if (!text) return null;
  const inline = (s, key) => s.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={`${key}-${i}`}>{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={`${key}-${i}`}>{part.slice(1, -1)}</em>;
    return <Fragment key={`${key}-${i}`}>{part}</Fragment>;
  });
  const blocks = [];
  let list = null;
  text.replace(/\r/g, '').split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)/.exec(line);
    const num = /^\s*\d+[.)]\s+(.*)/.exec(line);
    if (bullet || num) {
      const type = bullet ? 'ul' : 'ol';
      if (!list || list.type !== type) { list = { type, items: [] }; blocks.push(list); }
      list.items.push(inline((bullet ?? num)[1], i));
      return;
    }
    list = null;
    if (line.trim() === '') { blocks.push(null); return; }
    const heading = /^#{1,4}\s+(.*)/.exec(line);
    blocks.push({ type: heading ? 'h' : 'p', content: inline(heading ? heading[1] : line, i) });
  });
  return (
    <div className="md">
      {blocks.filter(Boolean).map((b, i) => {
        if (b.type === 'ul') return <ul key={i}>{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>;
        if (b.type === 'ol') return <ol key={i}>{b.items.map((it, j) => <li key={j}>{it}</li>)}</ol>;
        if (b.type === 'h') return <p key={i} className="md-h">{b.content}</p>;
        return <p key={i}>{b.content}</p>;
      })}
    </div>
  );
}

export const fmtDate = d => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const daysLeft = d => Math.round((new Date(`${d}T00:00:00`) - new Date(new Date().toDateString())) / 86400000);

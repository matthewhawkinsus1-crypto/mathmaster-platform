import { useMemo } from 'react';
import {
  classMemoryDetail,
  classMemorySentence,
  sameSettings,
  setupFromMemory,
  suggestNextSettings,
} from '../../../functions/shared/liveChallengeClassMemory.mjs';

/*
 * LAST TIME, AND WHAT TO TRY NEXT — the card at the top of a rush's setup
 * when this class has played the game before (liveChallengeClassMemory.mjs):
 *
 *   Period 5 last played this on Oct 28 at Standard, 3 × 60 s, 86% accuracy → try Challenge.
 *   4.2 graphs per student · weakest: vertex (41% completed)
 *   [Use last settings]  [Use suggestion]
 *
 * Either button fills in the whole setup — question settings, rounds, time,
 * scoring — and every choice stays editable after. "Use suggestion" is left
 * out when the suggestion is to run the same game again.
 */

export default function ClassMemoryCard({ memory, onUse }) {
  const next = useMemo(() => suggestNextSettings(memory), [memory]);
  if (!memory?.settings || typeof onUse !== 'function') return null;
  const sentence = classMemorySentence(memory, next);
  const detail = classMemoryDetail(memory);
  const offerSuggestion = Boolean(next) && !sameSettings(next.settings, memory.settings);
  const button = (primary) => ({
    minHeight: 40,
    padding: '8px 14px',
    borderRadius: 9,
    border: primary ? 0 : '1px solid var(--mm-border)',
    background: primary ? '#1a73e8' : 'var(--mm-surface)',
    color: primary ? '#fff' : 'var(--mm-text-strong)',
    fontWeight: 900,
    cursor: 'pointer',
  });
  return (
    <section data-mm-class-memory={memory.game} aria-label="Last time this class played" style={{ gridColumn: '1 / -1', padding: '13px 15px', borderRadius: 12, background: 'var(--mm-info-bg)', border: '1px solid var(--mm-info-border)', color: 'var(--mm-info-text)', display: 'grid', gap: 8 }}>
      <div style={{ fontWeight: 900, fontSize: 'calc(15 * var(--mm-px))' }}>{sentence}</div>
      {detail && <div style={{ fontSize: 'calc(13 * var(--mm-px))' }}>{detail}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={button(!offerSuggestion)} onClick={() => onUse(setupFromMemory(memory.game, memory.settings))}>Use last settings</button>
        {offerSuggestion && <button type="button" style={button(true)} onClick={() => onUse(setupFromMemory(memory.game, next.settings))}>Use suggestion</button>}
      </div>
    </section>
  );
}

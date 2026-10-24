import React, { useState } from 'react';
import {
  CORRECTION_REFLECTION_SENTENCE_MAX,
  correctionReflectionChoices,
  correctionReflectionFrame,
} from '../../platform/student/correctionReflection.js';

const card = {
  background: 'var(--mm-surface)',
  border: '1px solid var(--mm-border)',
  borderRadius: 14,
  padding: 'clamp(16px, 4vw, 26px)',
};

const quietButton = {
  minHeight: 44,
  padding: '9px 15px',
  borderRadius: 8,
  border: '1px solid var(--mm-border-strong)',
  background: 'var(--mm-surface)',
  color: 'var(--mm-text)',
  cursor: 'pointer',
};

/*
 * BEFORE THE FIRST QUESTION OF A SKILL: WHAT WENT WRONG, AND THE FIX.
 *
 * One pick from 2–3 options and an optional sentence, with a Help me say it
 * frame (correctionReflection.js). Nothing is graded and either step can be
 * skipped; the question is already being prepared behind it. Their teacher can
 * read it (TC11), so the step says so before anything is written.
 */
export const CorrectionReflectionStep = ({ target, onDone }) => {
  const choices = correctionReflectionChoices(target);
  const [choice, setChoice] = useState(null);
  const [sentence, setSentence] = useState('');
  const [framed, setFramed] = useState(false);
  const chosenFrame = correctionReflectionFrame(choice);
  const helpMeSayIt = () => {
    setFramed(true);
    if (!sentence.trim() && chosenFrame) setSentence(chosenFrame.en);
  };
  return (
    <section data-corrections-reflection="" aria-labelledby="corrections-reflection-heading" style={{ ...card, display: 'grid', gap: 12 }}>
      <h2 id="corrections-reflection-heading" style={{ margin: 0, fontSize: 'calc(18 * var(--mm-px))' }}>Before you start: what went wrong?</h2>
      <p data-corrections-reflection-note="" style={{ margin: 0, color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))' }}>Your teacher can read what you pick and write here. It does not change your grade.</p>
      <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        <legend style={{ marginBottom: 6, color: 'var(--mm-text)' }}>Pick the one closest to what happened on the Test. There is no wrong choice.</legend>
        {choices.map((option) => (
          <label key={option.id} style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44, padding: '6px 10px', borderRadius: 8, border: `1px solid ${choice === option.id ? 'var(--mm-primary-border)' : 'var(--mm-border)'}`, cursor: 'pointer' }}>
            <input type="radio" name="corrections-reflection-choice" value={option.id} checked={choice === option.id} onChange={() => { setChoice(option.id); setFramed(false); }} />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
      {chosenFrame && (
        <div style={{ display: 'grid', gap: 8 }}>
          <label htmlFor="corrections-reflection-sentence" style={{ fontWeight: 800 }}>How will you fix it? (optional)</label>
          <div>
            <button type="button" onClick={helpMeSayIt} style={quietButton}>💬 Help me say it</button>
          </div>
          {framed && (
            <div data-corrections-reflection-frame="" style={{ color: 'var(--mm-text)', lineHeight: 1.55 }}>
              <div>{chosenFrame.en}</div>
              <div lang="es" style={{ color: 'var(--mm-text-muted)' }}>{chosenFrame.es}</div>
            </div>
          )}
          <textarea
            id="corrections-reflection-sentence"
            value={sentence}
            maxLength={CORRECTION_REFLECTION_SENTENCE_MAX}
            rows={2}
            onChange={(event) => setSentence(event.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, border: '1px solid var(--mm-border-strong)', font: 'inherit', background: 'var(--mm-surface)', color: 'var(--mm-text)' }}
          />
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" disabled={!choice} onClick={() => onDone({ choice, sentence })} style={{ minHeight: 44, padding: '9px 16px', border: 0, borderRadius: 8, background: 'var(--mm-primary)', color: 'var(--mm-on-primary)', fontWeight: 900, cursor: choice ? 'pointer' : 'not-allowed', opacity: choice ? 1 : 0.6 }}>
          Start practising
        </button>
        <button type="button" onClick={() => onDone({ skipped: true })} style={quietButton}>Skip for now</button>
      </div>
    </section>
  );
};

export default CorrectionReflectionStep;

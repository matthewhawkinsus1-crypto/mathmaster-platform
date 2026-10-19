/*
 * ONE SHORT REFLECTION BEFORE EACH CORRECTIONS SKILL (QA pass 3, HELP-13).
 *
 * Corrections were re-answering only. Each skill now starts with two quick
 * steps, both skippable:
 *
 *   1. pick what went wrong on the Test, from 2–3 options;
 *   2. say the fix, with a "Help me say it" sentence frame for it.
 *
 * The options are about the student's own process, never about the item: the
 * recorded pattern (only when the plan names one — correctionTargetMistakePattern),
 * misreading the question, a slip in a step, not knowing how to start. There
 * is no right option and nothing is graded. A frame is a starter with a blank,
 * like every Help me say it frame (src/platform/language/sentenceFrames.js):
 * English with Spanish beneath, no answer, no value, no method.
 *
 * KEPT ON THIS DEVICE. The corrections records (testCycleCorrectionPlans,
 * testCycleRecords) are server-only — `allow read, write: if false` — so a
 * student writes none of them, and storing this would need a new write path.
 * Until that is decided, the reflection stays in the browser: which option
 * was picked (and that the step is done) in localStorage, so it is not asked
 * again; the sentence the student wrote only in sessionStorage, which ends
 * with the tab, so a shared Chromebook does not keep it. The key carries the
 * plan id, which names the student. Storage that throws (private mode,
 * blocked site data) just means the reflection is asked again.
 */
import { correctionTargetMistakePattern } from './testCycleDiscovery.js';

const frame = (en, es) => Object.freeze({ en, es });

export const CORRECTION_REFLECTION_CHOICES = Object.freeze({
  pattern: Object.freeze({
    id: 'pattern',
    label: 'The mistake named above',
    frame: frame('Next time, I will check for that mistake by _____.', 'La próxima vez, revisaré ese error al _____.'),
  }),
  misread: Object.freeze({
    id: 'misread',
    label: 'I misread what the question was asking',
    frame: frame('Next time, I will reread the question and find _____ before I start.', 'La próxima vez, volveré a leer la pregunta y buscaré _____ antes de empezar.'),
  }),
  step: Object.freeze({
    id: 'step',
    label: 'I made a slip in a step (a sign, a number, or the order)',
    frame: frame('Next time, I will check each step, especially _____.', 'La próxima vez, revisaré cada paso, sobre todo _____.'),
  }),
  start: Object.freeze({
    id: 'start',
    label: 'I was not sure how to start',
    frame: frame('To start a problem like this, I will first _____.', 'Para empezar un problema como este, primero voy a _____.'),
  }),
});

/** The 2–3 options for this target, the recorded pattern first when there is one. */
export const correctionReflectionChoices = (target = {}) => {
  const { pattern, misread, step, start } = CORRECTION_REFLECTION_CHOICES;
  return correctionTargetMistakePattern(target) ? [pattern, misread, step] : [misread, step, start];
};

/** The Help me say it frame for a chosen option, or null. */
export const correctionReflectionFrame = (choiceId) => (
  Object.prototype.hasOwnProperty.call(CORRECTION_REFLECTION_CHOICES, choiceId) ? CORRECTION_REFLECTION_CHOICES[choiceId].frame : null
);

export const CORRECTION_REFLECTION_SENTENCE_MAX = 280;

export const correctionReflectionKey = ({ planId, correctionId } = {}) => (
  `mathmaster:corrections-reflection:${encodeURIComponent(String(planId ?? ''))}:${encodeURIComponent(String(correctionId ?? ''))}`
);

const storageOf = (kind) => {
  try {
    return typeof window === 'undefined' ? null : window[kind] || null;
  } catch {
    return null;
  }
};

/** What this device remembers: { done, choice, skipped, sentence } or null. */
export const readCorrectionReflection = (ids, { local = storageOf('localStorage'), session = storageOf('sessionStorage') } = {}) => {
  try {
    const key = correctionReflectionKey(ids);
    const saved = JSON.parse(local?.getItem(key) || 'null');
    if (!saved || saved.done !== true) return null;
    const choice = Object.prototype.hasOwnProperty.call(CORRECTION_REFLECTION_CHOICES, saved.choice) ? saved.choice : null;
    let sentence = '';
    try {
      sentence = String(session?.getItem(key) || '').slice(0, CORRECTION_REFLECTION_SENTENCE_MAX);
    } catch {
      sentence = '';
    }
    return { done: true, choice, skipped: saved.skipped === true, sentence };
  } catch {
    return null;
  }
};

/** Remember that the reflection is done (or skipped). Never throws. */
export const saveCorrectionReflection = (ids, { choice = null, sentence = '', skipped = false } = {}, { local = storageOf('localStorage'), session = storageOf('sessionStorage') } = {}) => {
  const key = correctionReflectionKey(ids);
  const kept = Object.prototype.hasOwnProperty.call(CORRECTION_REFLECTION_CHOICES, choice) ? choice : null;
  const written = String(sentence || '').trim().slice(0, CORRECTION_REFLECTION_SENTENCE_MAX);
  try {
    local?.setItem(key, JSON.stringify({ done: true, choice: skipped ? null : kept, skipped: skipped === true }));
  } catch {
    // Not remembered: the reflection is simply asked again next time.
  }
  try {
    if (written && !skipped) session?.setItem(key, written);
  } catch {
    // The sentence is only a reminder for this sitting.
  }
  return { done: true, choice: skipped ? null : kept, skipped: skipped === true, sentence: skipped ? '' : written };
};

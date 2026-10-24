/*
 * A STUDENT'S CORRECTIONS REFLECTION, AS THE SERVER KEEPS IT (TC11; C1-12).
 *
 * Each Corrections skill starts with a short reflection: pick what went wrong
 * on the Test, then say the fix in a sentence (src/platform/student/
 * correctionReflection.js). Until now it stayed on the device, so a teacher
 * never saw it and another device never had it. The owner chose to carry it on
 * the correction response the student already sends, into the server-only plan,
 * and to show it in the teacher's per-student view.
 *
 * The browser's words are not trusted: this keeps only a known pick and a
 * bounded sentence, with the control characters taken out. What it returns is
 * what is stored and what a teacher reads. Nothing here is graded, and nothing
 * here can reach a grade, a plan's targets or a student's card.
 *
 * Pure: no Firestore, no clock.
 */

/** The picks the reflection offers (correctionReflection.js CORRECTION_REFLECTION_CHOICES). */
export const CORRECTION_REFLECTION_CHOICE_IDS = Object.freeze(['pattern', 'misread', 'step', 'start']);
export const CORRECTION_REFLECTION_SENTENCE_MAX = 280;

// A control character (a tab, a line break, a NUL, DEL) becomes a space.
const withoutControlCharacters = (value) => [...value]
  .map((character) => {
    const code = character.codePointAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  })
  .join('');

/**
 * The reflection to keep, or null when there is nothing to keep (not an object,
 * an unknown pick, no pick and not skipped). Skipped keeps no words.
 */
export const normalizeCorrectionReflection = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  if (input.skipped === true) return { skipped: true, choice: null, sentence: '' };
  const choice = CORRECTION_REFLECTION_CHOICE_IDS.includes(input.choice) ? input.choice : null;
  if (!choice) return null;
  const sentence = withoutControlCharacters(typeof input.sentence === 'string' ? input.sentence : '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CORRECTION_REFLECTION_SENTENCE_MAX);
  return { skipped: false, choice, sentence };
};

/**
 * The reflections map after `incoming` for one skill: unchanged (the same
 * object) when there is nothing new to keep, so a write that changes nothing is
 * not made.
 */
export const withCorrectionReflection = (reflections, correctionId, incoming, at) => {
  const current = reflections && typeof reflections === 'object' && !Array.isArray(reflections) ? reflections : {};
  const next = normalizeCorrectionReflection(incoming);
  const id = String(correctionId ?? '').trim();
  if (!next || !id) return current;
  const kept = current[id];
  if (kept && kept.skipped === next.skipped && kept.choice === next.choice && kept.sentence === next.sentence) return current;
  // Skipping on one device never wipes what was written on another.
  if (kept && next.skipped && !kept.skipped) return current;
  return { ...current, [id]: { ...next, at } };
};

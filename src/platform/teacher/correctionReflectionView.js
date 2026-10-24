/*
 * WHAT A STUDENT SAID WENT WRONG, IN THE TEACHER'S PER-STUDENT VIEW (TC11).
 *
 * Each Corrections skill starts with a short reflection (pick what went wrong,
 * say the fix). It used to stay on the device; now it rides on the correction
 * response into the server-only plan, and getTeacherTestCyclePlans hands it to
 * the teacher of record on each skill (`target.reflection`). These are the lines
 * the plans panel shows for it. The student's own words are shown as they wrote
 * them, never reworded; the pick is named in a teacher's words.
 *
 * Pure: no React, no network.
 */

const PICK = Object.freeze({
  pattern: 'the mistake MathMaster named',
  misread: 'misreading what the question asked',
  step: 'a slip in a step (a sign, a number, or the order)',
  start: 'not knowing how to start',
});

/** { said, plan } for a skill's reflection, or null when the student has not reflected. */
export const describeCorrectionReflection = (reflection) => {
  if (!reflection || typeof reflection !== 'object') return null;
  if (reflection.skipped === true) return { said: 'Skipped the reflection.', plan: null };
  const pick = Object.prototype.hasOwnProperty.call(PICK, reflection.choice) ? PICK[reflection.choice] : null;
  if (!pick) return null;
  const sentence = typeof reflection.sentence === 'string' ? reflection.sentence.trim() : '';
  return { said: `Said it was ${pick}.`, plan: sentence ? `Their plan: “${sentence}”` : null };
};

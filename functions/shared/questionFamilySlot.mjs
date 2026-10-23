/*
 * THE TWO THINGS EVERY SCREEN ASKS OF A QUESTION FAMILY SLOT, WITHOUT THE ENGINE.
 *
 * Is this slot family-backed, and what is its slot key? Neither needs a
 * family's definition, but questionFamilyInstance.mjs (which re-exports both)
 * imports the whole registry, every family's generator with it. App reads
 * these two from here, so the student's first load does not carry the
 * registry (scripts/check-first-load-budget.mjs); the engine arrives with the
 * question runtime (src/platform/generation/familyDelivery.js).
 */

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();

/** Is this slot opted into the question family engine at all? */
export const isFamilyBackedQuestion = (question) => isObject(question?.questionFamily);

export const familySlotKey = ({ assignmentId = '', question = null, storageIndex = 0 } = {}) => {
  const slot = clean(question?.questionId) || clean(question?.id) || `index-${Math.max(0, Number(storageIndex) || 0)}`;
  return `${clean(assignmentId) || 'assignment'}|${slot}`;
};

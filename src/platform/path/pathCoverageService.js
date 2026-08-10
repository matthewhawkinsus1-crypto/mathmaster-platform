import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { getWheelTeksForCourse } from '../mastery/strandConfig.js';
import { isSkillLaunchable } from '../../../functions/shared/pathCoverage.mjs';

// Reading and rebuilding the My Math Path coverage index.
//
// The index says which standards the secure bank can actually issue a question
// for. Every surface that can send a student somewhere reads it: the wheel, the
// recommendation panel, and the routing engine that may descend into a
// prerequisite.

/** The stored index for a course, or null when it has never been built. */
export const fetchPathCoverage = async (courseId) => {
  if (!courseId) return null;
  try {
    const snapshot = await getDoc(doc(db, 'pathCoverage', String(courseId)));
    return snapshot.exists() ? snapshot.data() : null;
  } catch (error) {
    // A coverage read that fails must not take the Path down with it — but it
    // must not be mistaken for "everything is covered" either. Null fails
    // closed everywhere it is consulted.
    console.error('Could not load My Math Path coverage:', error);
    return null;
  }
};

/**
 * Recompute coverage from the secure bank.
 *
 * The wheel standards travel with the request because the Functions bundle does
 * not carry the Texas standards catalogue. See the note on `rebuildPathCoverage`
 * for why that cannot open a dead end.
 */
export const rebuildPathCoverage = async (courses = ['algebra1', 'algebra2']) => {
  const wheelTeksByCourse = Object.fromEntries(
    courses.map((courseId) => [courseId, getWheelTeksForCourse(courseId)]),
  );
  const call = httpsCallable(functions, 'rebuildPathCoverage');
  const result = await call({ courses, wheelTeksByCourse });
  return result.data || {};
};

/**
 * Import a seed package into the secure Path bank.
 *
 * Every item is validated server-side by the same `buildIssuePlan` the runtime
 * uses before anything is written, and the call is idempotent on each item's
 * own id, so a partial import is simply re-run.
 */
export const seedPathQuestionBank = async (items, { dryRun = false, chunkSize = 400 } = {}) => {
  const call = httpsCallable(functions, 'seedPathQuestionBank');
  const totals = { received: 0, accepted: 0, rejected: [], standards: new Set() };
  for (let index = 0; index < items.length; index += chunkSize) {
    // eslint-disable-next-line no-await-in-loop
    const result = await call({ items: items.slice(index, index + chunkSize), dryRun });
    const data = result.data || {};
    totals.received += data.received || 0;
    totals.accepted += data.accepted || 0;
    totals.rejected.push(...(data.rejected || []));
    (data.standards || []).forEach((code) => totals.standards.add(code));
  }
  return { ...totals, standards: [...totals.standards].sort(), dryRun };
};

/**
 * A predicate bound to one course's index.
 *
 * Handed to the engines so they can ask "can a student work here?" without
 * knowing where coverage comes from — and so a test can supply its own answer.
 */
export const createCoverageGate = (index) => ({
  index,
  isLaunchable: (teksCode) => isSkillLaunchable(index, teksCode),
  // No index at all means nothing has been confirmed. Callers use this to say
  // "checking…" rather than "unavailable", which are different messages.
  isKnown: Boolean(index),
});

export default fetchPathCoverage;

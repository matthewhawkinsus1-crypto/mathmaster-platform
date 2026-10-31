/*
 * WHAT A STUDENT GOT WRONG ON THE RETEST, FOR THEIR TEACHER (TC02; B-41, C2-105).
 *
 * A Retest's responses record a mistake exactly as a Test's do
 * (`grading.misconceptionEvidence`, written where the answer is graded), but the
 * cycle has no Corrections after a Retest, so nothing read it. This is the
 * reader, for the teacher's per-student view only: nothing here reaches a
 * student, and nothing here can move a grade.
 *
 * It reads the same profile Corrections are built from
 * (buildPerformanceProfile), so the registry's trust gate still decides what
 * counts: a mistake is named only when a server classifier proved it, in the
 * registry's own label and teacher meaning. A skill with a miss and no proved
 * mistake is listed as missed and says nothing more. A question the student never
 * reached counts as missed, as it does everywhere else in the cycle.
 *
 * Pure: no Firestore, no clock.
 */

import { buildPerformanceProfile } from './testCycleCorrections.mjs';
import { getMisconceptionCode } from './misconceptionCodes.mjs';

const mistakeOf = (code) => {
  const entry = getMisconceptionCode(code);
  return entry ? { code: entry.id, label: entry.label, meaning: entry.teacherMeaning } : null;
};

/**
 * The skills a Retest missed, with the mistakes its work proved, in blueprint
 * order. `responses` is `responsesForProfile(session)` (functions/lib/testCycle.js);
 * `blueprint` is the Retest's own.
 */
export const retestMistakesForTeacher = ({ blueprint = null, responses = [] } = {}) => buildPerformanceProfile({ blueprint, responses })
  .targets
  .filter((target) => target.missed > 0)
  .map((target) => ({
    targetId: target.targetId,
    label: target.label,
    alignmentKey: target.alignmentKey,
    attempted: target.attempted,
    missed: target.missed,
    mistakes: target.misconceptions.map(mistakeOf).filter(Boolean),
  }));

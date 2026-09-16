import { projectCurrentAssignmentContent } from '../assignments/currentContentProjection.js';

/**
 * Classwork is the primary teaching/pace section. This extracts, in order,
 * only the Classwork entries from the assignment's CURRENT-CONTENT
 * projection — the same seam the student runtime (App.jsx's
 * navigationSections/visibleQuestionEntries) and student presence
 * (getCurrentContentQuestionIndices, which is this same projection's
 * entries) already use.
 *
 * This is deliberately NOT built from raw physical storage order. MathMaster
 * allows a question to be excluded and superseded by a valid replacement
 * appended later in storage; the projection re-positions that replacement at
 * the EXCLUDED question's logical slot, which is where the student actually
 * sees it and where the replacement's live progress bit is reported. Reading
 * storage order directly would put that same question at the wrong Classwork
 * position and make Walkthrough compare two different numbering systems.
 *
 * `progressPositions` is each Classwork entry's index within the FULL
 * projected entries list — exactly the array `getCurrentContentQuestionIndices`
 * returns and that `encodeQuestionStates` (in App.jsx's live-presence payload)
 * is indexed by — so a compact per-included-question state string can be
 * re-indexed down to just Classwork without drifting from what the student's
 * own presence document reports.
 */
export function classworkModel(assignment) {
  if (!assignment) return { questions: [], progressPositions: [] };
  const projection = projectCurrentAssignmentContent(assignment);
  const entries = projection.entries
    .map((entry, progressPosition) => ({ entry, progressPosition }))
    .filter(({ entry }) => entry.logicalRole === 'classwork');
  return {
    questions: entries.map(({ entry }) => ({ question: entry.question, questionIndex: entry.storageIndex })),
    progressPositions: entries.map(({ progressPosition }) => progressPosition),
  };
}

/**
 * Maps a STORAGE question index (the assignment's raw question array index,
 * as tracked by things like `currentQuestionIndex`) to its position within
 * the Classwork-only list, or null when that storage index belongs to
 * another section (Warm-Up/Practice/DOL/etc) and therefore has no Classwork
 * position at all.
 *
 * The teacher runtime always navigates to the storage index of whatever row
 * is ACTUALLY rendered — for a logical Classwork Q1 that is really a
 * replacement physically appended after Q2, that is the replacement's own
 * (later) storage index, never the excluded original's. Because
 * `classworkModel` above already carries each entry's real storage index
 * from the same projection, a direct storage-index match here agrees with
 * both the student runtime and student presence without any extra
 * historical/replacement bookkeeping of its own.
 *
 * This is the seam that keeps the teacher's real exemplar position — a
 * storage index — from being compared directly against a Classwork-relative
 * pace number, which is a different index system.
 */
export function classworkPositionForStorageIndex(assignment, storageQuestionIndex) {
  const { questions } = classworkModel(assignment);
  const position = questions.findIndex((entry) => entry.questionIndex === storageQuestionIndex);
  return position >= 0 ? position : null;
}

export function describeClassworkPace({ assignment, classworkQuestionPosition } = {}) {
  const { questions } = classworkModel(assignment);
  if (!questions.length) return 'No Classwork questions in this lesson';
  if (classworkQuestionPosition === null || classworkQuestionPosition === undefined) {
    return `Not yet in Classwork (${questions.length} question${questions.length === 1 ? '' : 's'})`;
  }
  return `Classwork Q${classworkQuestionPosition + 1} of ${questions.length}`;
}

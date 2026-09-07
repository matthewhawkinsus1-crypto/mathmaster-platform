/*
 * THE TEACHER'S INTAKE SCREEN IS TWO FILES NOW, AND A TEST ABOUT IT MEANS BOTH.
 *
 * AssignmentIntake.jsx was split: a wrapper that owns the Incomplete
 * Assignments panel and the salvage path around onJsonReady, and a base that
 * implements the guided creator itself. The implementation moved; nothing was
 * lost.
 *
 * Six tests in this suite inspect "the assignment creator" by reading its
 * source as text. After the split those reads found a 179-line wrapper instead
 * of the creator, so they failed on strings like "Paste AI Assignment" and
 * "NO CODE REQUIRED" — not because a teacher lost anything on screen, but
 * because the markup is next door. This mirrors the solver split already
 * handled by ./solverSource.mjs, and follows the same rule for the same reason.
 *
 * READING BOTH, RATHER THAN REPOINTING EACH TEST AT THE BASE, is deliberate.
 * These tests assert about "the teacher's intake screen", and that is now the
 * pair. A test aimed only at the base silently stops covering anything the
 * wrapper owns — the salvage path, the draft list — and would pass while that
 * code was deleted.
 *
 * WHY THE COMPOSITION CHECK. Concatenating two files is only honest while the
 * wrapper still renders the base. Drop the <AssignmentIntakeBase /> element and
 * the creator vanishes from the teacher's screen, yet every string these tests
 * look for is still present in the concatenation and all six keep passing. That
 * is the dead-code-satisfies-the-assertion failure, so the pairing asserts the
 * seam it depends on.
 *
 * WHAT THIS DOES NOT DO. These are source-inspection tests. They never render
 * the component, so they cannot catch a behavioural regression and never could.
 * Restoring them restores exactly the guard that existed before the refactor —
 * no more.
 */

import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (relativePath) => readFileSync(new URL(`../../../src/${relativePath}`, import.meta.url), 'utf8');

/** The whole teacher intake screen: salvage wrapper and guided creator. */
export const assignmentIntakeSource = () => {
  const wrapper = read('AssignmentIntake.jsx');

  // The concatenation below only describes what a teacher sees while the
  // wrapper actually mounts the base. Assert the seam rather than assume it.
  assert.match(
    wrapper,
    /<AssignmentIntakeBase\b/,
    'AssignmentIntake.jsx must render <AssignmentIntakeBase />; without it the creator is not on screen and reading both files would assert against orphaned code',
  );

  return `${wrapper}\n${read('AssignmentIntakeBase.jsx')}`;
};

export default { assignmentIntakeSource };

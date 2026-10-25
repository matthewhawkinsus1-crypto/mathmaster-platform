import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRIOR_WORK_READ_BATCH,
  fetchAssignmentsById,
  fetchStudentAssignments,
  priorWorkAssignmentIds,
} from '../../src/platform/assignments/studentAssignmentScope.js';

/*
 * NO STUDENT'S EARLIER WORK IS LEFT UNREAD (MP01).
 *
 * A student's device reads the assignments they have work on that are not their
 * current class's, by id (studentAssignmentScope.js). That read used to stop at
 * 200 ids and drop the rest without a word, so a student with more earlier work
 * than that showed less mastery evidence than the old whole-collection read
 * gave. The owner decided to lift the limit; 200 is now the size of one round of
 * reads, so no one is left out and no one starts an unbounded burst.
 *
 * Firestore is stood in for by a reader that exists for every id and records how
 * many reads were in flight at once. The real reads are covered by
 * tests/rules/assignmentPrivacyRules.test.mjs, on the emulator.
 */

const ids = (count) => Array.from({ length: count }, (_, index) => `a${String(index).padStart(4, '0')}`);
const worked = (list) => Object.fromEntries(list.map((id) => [id, {}]));

const reader = ({ missing = [], failing = [] } = {}) => {
  const gone = new Set(missing);
  const broken = new Set(failing);
  const state = { inFlight: 0, peak: 0, reads: [] };
  const readOne = async (id) => {
    state.reads.push(id);
    state.inFlight += 1;
    state.peak = Math.max(state.peak, state.inFlight);
    // Yield, so reads started together are really in flight together.
    await new Promise((resolve) => { setImmediate(resolve); });
    state.inFlight -= 1;
    if (broken.has(id)) return null;
    return {
      id,
      exists: () => !gone.has(id),
      data: () => ({ title: `Lesson ${id}`, assignedClassIds: ['earlier-class'] }),
    };
  };
  return { state, readOne };
};

test('a student with more than 200 earlier assignments has every one of them read', async () => {
  const everything = ids(450);
  const wanted = priorWorkAssignmentIds({ gradesByAssignment: worked(everything), loadedIds: [] });
  assert.equal(wanted.length, 450, 'none is dropped before it is read');
  assert.deepEqual(wanted, [...everything].sort(), 'and the order is the same for the same work');

  const { readOne } = reader();
  const fetched = await fetchAssignmentsById(null, wanted, { studentId: 'S_A', readOne });
  assert.deepEqual(fetched.map((entry) => entry.id), wanted, 'every assignment came back, in the order asked for');
  assert.equal(fetched[449].title, 'Lesson a0449', 'including the last one, well past 200');
});

test('the reads go in rounds of at most PRIOR_WORK_READ_BATCH, one round after another', async () => {
  assert.equal(PRIOR_WORK_READ_BATCH, 200, 'the size of the one burst this read always made');
  const { state, readOne } = reader();
  await fetchAssignmentsById(null, ids(650), { studentId: 'S_A', readOne });
  assert.equal(state.reads.length, 650);
  assert.equal(state.peak, PRIOR_WORK_READ_BATCH, 'a big account never has more than a round in flight');
});

test('a student at or under the batch reads exactly as before: one round, all at once', async () => {
  const { state, readOne } = reader();
  const fetched = await fetchAssignmentsById(null, ids(120), { studentId: 'S_A', readOne });
  assert.equal(fetched.length, 120);
  assert.equal(state.peak, 120, 'one round, as the single burst used to be');
});

test('an assignment that cannot be read, or no longer exists, costs only itself', async () => {
  const list = ids(250);
  const { readOne } = reader({ missing: [list[3]], failing: [list[230]] });
  const fetched = await fetchAssignmentsById(null, list, { studentId: 'S_A', readOne });
  assert.equal(fetched.length, 248);
  assert.ok(!fetched.some((entry) => entry.id === list[3] || entry.id === list[230]));
  assert.ok(fetched.some((entry) => entry.id === list[249]), 'the rounds after the failure still ran');
});

test('the sign-in read returns a large account whole, with the individually assigned Test marked', async () => {
  const everything = ids(450);
  const { readOne } = reader();
  const fetched = await fetchStudentAssignments({
    db: null,
    studentId: 'S_A',
    classId: null,
    gradesByAssignment: worked(everything),
    extraIds: ['resume-target'],
    individualAssignmentIds: ['test-added-alone'],
    readOne,
  });
  assert.equal(fetched.length, 452, '450 earlier assignments, the resume target and the Test');
  assert.ok(fetched.some((entry) => entry.id === 'a0449'), 'the last of the 450 is there');
  assert.equal(fetched.find((entry) => entry.id === 'test-added-alone').assignedToStudentIndividually, true);
  assert.equal(fetched.find((entry) => entry.id === 'a0001').assignedToStudentIndividually, undefined);
});

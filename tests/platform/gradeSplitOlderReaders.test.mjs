// A RECORD MOVED INTO THE GRADES SPLIT GRADES THE SAME FOR A READER BUILT BEFORE THE SPLIT.
//
// ingestStudentSubmissions moves every record a student still has stored whole
// into the split (functions/lib/gradeDetailStore.js splitInlineRecords): the
// summary stays on grades/{studentId} and the detail, `stepGrades` among it,
// moves to responseDetail. A summary carries what its steps earned as
// `stepCredit`, and every reader in this build counts it.
//
// Code built before the split does not. It keeps reading these summaries while
// the functions roll out, and in every browser tab opened before Hosting ships,
// for as long as the tab stays open: nothing reloads it
// (src/components/common/BuildFreshnessNotice.jsx only offers a reload). That
// code grades a record from its stored credit and its `stepGrades`
// (functions/shared/attemptPolicy.mjs as it was, which the browser imports
// through src/attemptPolicy.js), so a summary whose steps earned more than its
// stored credit reads lower there: a two-question assignment at 84% read 50%
// in the teacher's gradebook, the student's Grade Center and Grade Transfer's
// TEAMS rows, which persistGradeTransferSnapshot stores as the browser computed
// them. So such a record is left whole, as any record whose summary would not
// grade as the record does is; every other record still moves.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { getQuestionCredit } from '../../functions/shared/attemptPolicy.mjs';
import { splitIsFaithful, splitQuestionRecord } from '../../functions/shared/gradeEntryStorage.mjs';

const require = createRequire(import.meta.url);
const { splitInlineRecords } = require('../../functions/lib/gradeDetailStore.js');
const runtime = require('../../functions/lib/classroomGradeRuntime.js');

// The credit a reader built before the split gives a record: this build's rule
// with no `stepCredit`, which did not exist then (the previous build's
// getQuestionCredit is this one without its stepCredit term).
const creditBeforeTheSplit = (record) => {
  if (!record || typeof record !== 'object') return getQuestionCredit(record);
  const { stepCredit: _stepCredit, ...rest } = record;
  return getQuestionCredit(rest);
};

const step = (stepNumber, before, after) => ({
  kind: 'operation', label: `Step ${stepNumber}`, stepNumber, variantIndex: 0, mode: 'guided',
  equationBefore: before, equationAfter: after, earned: 1, possible: 1, expectedTotalPoints: 3,
  accepted: true, productive: true, recordedAt: '2026-11-13T14:24:18.412Z',
});
// Steps that earned more than the stored credit (gradeEntryStorage.test.mjs's stepRecord).
const stepsAheadOfCredit = () => ({
  status: 'attempted', attemptCount: 1, totalAttempts: 1, partialCredit: 0, bestPartialCredit: 0,
  variantIndex: 0, timeSpent: 210, lastAttemptAt: '2026-11-13T14:24:18.412Z', lastSubmissionId: 'sub-1',
  stepCreditVersion: 3, gradedBy: 'server', submissionOrigin: 'server-ingestion',
  stepGrades: [step(1, '2x+3=11', '2x=8'), step(2, '2x=8', 'x=4')],
  algebraState: { equation: 'x=4', stepNumber: 2, supportLevel: 'guided', relationState: null },
  partGrades: [], lastResponseKey: '{"x":"4"}', questionDetails: 'Solve 2x + 3 = 11',
  supportUsage: { hintUsed: false, isMathematicallyIndependent: true, accommodations: [] },
});
// The same steps where the stored credit already counts them, as recordQuestionStep writes it.
const stepsCounted = () => ({ ...stepsAheadOfCredit(), partialCredit: 67, bestPartialCredit: 67 });
const partRecord = () => ({
  status: 'correct', attemptCount: 2, totalAttempts: 2, partialCredit: 100, bestPartialCredit: 100,
  variantIndex: 1, timeSpent: 95, lastAttemptAt: '2026-11-14T21:27:14.720Z',
  partGrades: [{ id: 'm', label: 'slope', isComplete: true, isCorrect: true }], stepGrades: [],
  lastResponseKey: '{"m":"2"}', questionDetails: 'y = 2x - 1', familyDelivery: { familyId: 'lines', seat: 14 },
  supportUsage: { hintUsed: true, isMathematicallyIndependent: false, accommodations: ['read-aloud'] },
  algebraState: null,
});

// Just enough Firestore for splitInlineRecords: documents by path, one
// transaction, field-path updates and merged sets.
const memoryFirestore = (documents) => {
  const store = new Map(Object.entries(documents).map(([path, data]) => [path, structuredClone(data)]));
  const ref = (path) => ({
    path,
    id: path.split('/').pop(),
    collection: (name) => ({ doc: (id) => ref(`${path}/${name}/${id}`) }),
  });
  return {
    store,
    collection: (name) => ({ doc: (id) => ref(`${name}/${id}`) }),
    async runTransaction(work) {
      const writes = [];
      const transaction = {
        get: async (target) => ({ exists: store.has(target.path), data: () => structuredClone(store.get(target.path)) }),
        set: (target, data) => writes.push(() => {
          const existing = store.get(target.path) || {};
          store.set(target.path, { ...existing, ...data, questions: { ...existing.questions, ...data.questions } });
        }),
        update: (target, ...pairs) => writes.push(() => {
          const data = store.get(target.path);
          for (let index = 0; index < pairs.length; index += 2) {
            const segments = pairs[index].segments;
            let at = data;
            segments.slice(0, -1).forEach((segment) => { at = (at[segment] ||= {}); });
            at[segments[segments.length - 1]] = structuredClone(pairs[index + 1]);
          }
        }),
      };
      const result = await work(transaction);
      writes.forEach((write) => write());
      return result;
    },
  };
};

// settings/serverGrading with the grades split on (splitGradeRecords).
const SPLIT_ON = Object.freeze({ splitGradeRecords: true });

test('a record whose steps earned more than its stored credit stays whole; every other record still moves', async () => {
  const original = { a1: { 0: stepsAheadOfCredit(), 1: partRecord() }, a2: { 0: stepsCounted() } };
  const db = memoryFirestore({ 'grades/s1': { classId: 'c1', gradesByAssignment: original } });

  const moved = await splitInlineRecords({ db, studentId: 's1', settings: SPLIT_ON });
  assert.deepEqual(moved, { split: 2, kept: 1 });

  const stored = db.store.get('grades/s1').gradesByAssignment;
  assert.deepEqual(stored.a1[0], stepsAheadOfCredit(), 'left whole, exactly as it was');
  assert.equal(typeof stored.a1[1].detailRef, 'string', 'a record with no such steps moves');
  assert.equal(typeof stored.a2[0].detailRef, 'string', 'steps its stored credit already counts move too');

  // What every reader grades from the grades document alone, old and new.
  for (const [assignmentId, tracker] of Object.entries(original)) {
    for (const [key, record] of Object.entries(tracker)) {
      const where = `${assignmentId}/${key}`;
      assert.equal(creditBeforeTheSplit(stored[assignmentId][key]), creditBeforeTheSplit(record), `${where}: a reader built before the split`);
      assert.equal(getQuestionCredit(stored[assignmentId][key]), getQuestionCredit(record), `${where}: this build`);
      assert.equal(runtime.getQuestionCredit(stored[assignmentId][key]), runtime.getQuestionCredit(record), `${where}: the Classroom triggers`);
    }
  }
});

test('with the switch off, records move only for a student whose grades document is near the cap, by the same check', async () => {
  const original = { a1: { 0: stepsAheadOfCredit(), 1: partRecord() }, a2: { 0: stepsCounted() } };
  // Most students: nothing moves, so every tab opened before the split still reads every record whole.
  const small = memoryFirestore({ 'grades/s1': { classId: 'c1', gradesByAssignment: original } });
  assert.deepEqual(await splitInlineRecords({ db: small, studentId: 's1' }), { split: 0, kept: 0 });
  assert.deepEqual(await splitInlineRecords({ db: small, studentId: 's1', settings: { splitGradeRecords: false } }), { split: 0, kept: 0 });
  assert.deepEqual(small.store.get('grades/s1').gradesByAssignment, original, 'stored exactly as it was');
  assert.equal(small.store.has('grades/s1/responseDetail/a1'), false, 'and no detail written');

  // Past three quarters of the cap, the faithful records move so this student's grades keep saving.
  const near = memoryFirestore({ 'grades/s1': { classId: 'c1', history: 'x'.repeat(800_000), gradesByAssignment: original } });
  assert.deepEqual(await splitInlineRecords({ db: near, studentId: 's1' }), { split: 2, kept: 1 });
  const stored = near.store.get('grades/s1').gradesByAssignment;
  assert.deepEqual(stored.a1[0], stepsAheadOfCredit(), 'the record an older reader would grade lower stays whole');
  assert.equal(typeof stored.a1[1].detailRef, 'string');
  assert.equal(typeof stored.a2[0].detailRef, 'string');
});

test('the check is the reason: such a summary alone reads lower to a reader built before the split', () => {
  const record = stepsAheadOfCredit();
  const halves = splitQuestionRecord(record);
  // This build grades the summary as the record (stepCredit carries the steps)...
  assert.equal(getQuestionCredit(halves.summary), getQuestionCredit(record));
  // ...a reader built before the split does not, so the split is not faithful.
  assert.ok(creditBeforeTheSplit(halves.summary) < creditBeforeTheSplit(record));
  assert.equal(splitIsFaithful(record, halves), false);
  for (const faithful of [stepsCounted(), partRecord()]) assert.equal(splitIsFaithful(faithful, splitQuestionRecord(faithful)), true);
});

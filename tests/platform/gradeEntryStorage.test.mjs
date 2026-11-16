// A QUESTION RECORD STORED AS A SUMMARY ON THE STUDENT AND ITS DETAIL BESIDE IT
// READS BACK EXACTLY, AND GRADES THE SAME FROM THE SUMMARY ALONE.
//
// Nov 16, 2026: grades/{studentId} held every question record of every
// assignment, and the largest documents were at 86% of Firestore's 1 MiB cap
// and growing 100-170 KB a week. functions/shared/gradeEntryStorage.mjs splits
// each record: the summary stays in gradesByAssignment, and the detail (parts,
// steps, last response, support flags, algebra state) moves to
// grades/{studentId}/responseDetail/{assignmentId}. A read-only check over all
// 47,949 production records found 0 round-trip differences and 0 grading
// differences between a summary and its full record. Here the same promises are
// held on fixtures, including the records that need `stepCredit` (credit
// earned by steps beyond the stored partial credit).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DETAIL_FIELDS,
  RESPONSE_DETAIL_COLLECTION,
  assignmentsWithSplitRecords,
  hasInlineDetail,
  hydrateGradeDocument,
  isSplitSummary,
  mergeQuestionRecord,
  mergeTracker,
  responseDetailPath,
  splitQuestionRecord,
  splitTracker,
} from '../../functions/shared/gradeEntryStorage.mjs';
import {
  calculateStepPartialCredit,
  emptyQuestionRecord,
  getQuestionCardState,
  getQuestionCredit as clientCredit,
  normalizeQuestionRecord,
} from '../../functions/shared/attemptPolicy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const runtime = require(path.join(root, 'functions/lib/classroomGradeRuntime.js'));

// functions/index.js's own credit functions, from its source.
const indexSource = readFileSync(path.join(root, 'functions/index.js'), 'utf8');
const grab = (start) => {
  const at = indexSource.indexOf(start);
  assert.ok(at >= 0, `functions/index.js defines ${start}`);
  return indexSource.slice(at, indexSource.indexOf('\n}\n', at) + 2);
};
const clampLine = indexSource.slice(indexSource.indexOf('const clampPercent = (value) =>'), indexSource.indexOf(';', indexSource.indexOf('const clampPercent = (value) =>')) + 1);
const indexCredit = new Function(`${clampLine}
${grab('function storedAlgebraStepPartialCredit(record)')}
${grab('function teacherOverrideAppliesToRecord(')}
${grab('function getQuestionCredit(record, authoritativeOverride = null)')}
${grab('function isQuestionTerminal(record)')}
${grab('function questionWasAttempted(record)')}
return { getQuestionCredit, isQuestionTerminal, questionWasAttempted };`)();

const step = (overrides) => ({
  kind: 'operation', label: 'Subtract 3', stepNumber: 1, variantIndex: 0, mode: 'guided',
  equationBefore: '2x+3=11', equationAfter: '2x=8', earned: 1, possible: 1, expectedTotalPoints: 3,
  accepted: true, productive: true, recordedAt: '2026-11-13T14:24:18.412Z', ...overrides,
});

// A step-algebra record whose steps earned more than its stored partial credit:
// the summary must carry that as stepCredit.
const stepRecord = () => ({
  status: 'attempted', attemptCount: 1, totalAttempts: 1, partialCredit: 0, bestPartialCredit: 0,
  variantIndex: 0, timeSpent: 210, lastAttemptAt: '2026-11-13T14:24:18.412Z', lastSubmissionId: 'sub-1',
  stepCreditVersion: 3, gradedBy: 'server', submissionOrigin: 'server-ingestion',
  stepGrades: [step(), step({ stepNumber: 2, label: 'Divide by 2', equationBefore: '2x=8', equationAfter: 'x=4' })],
  algebraState: { equation: 'x=4', stepNumber: 2, supportLevel: 'guided', relationState: null },
  partGrades: [], lastResponseKey: '{"x":"4"}', questionDetails: 'Solve 2x + 3 = 11',
  supportUsage: { hintUsed: false, isMathematicallyIndependent: true, accommodations: [] },
});
const partRecord = () => ({
  status: 'correct', attemptCount: 2, totalAttempts: 2, partialCredit: 100, bestPartialCredit: 100,
  variantIndex: 1, timeSpent: 95, lastAttemptAt: '2026-11-14T21:27:14.720Z',
  partGrades: [{ label: 'slope', isComplete: true, isCorrect: true }, { label: 'intercept', isComplete: true, isCorrect: true }],
  stepGrades: [], lastResponseKey: '{"m":"2","b":"-1"}', questionDetails: 'y = 2x - 1',
  familyDelivery: { familyId: 'lines', seat: 14 }, familyDeliveryVerification: { ok: true },
  supportUsage: { hintUsed: true, isMathematicallyIndependent: false, accommodations: ['read-aloud'] },
  algebraState: null,
});

const gradeViews = (record) => [
  indexCredit.getQuestionCredit(record), indexCredit.isQuestionTerminal(record), indexCredit.questionWasAttempted(record),
  runtime.getQuestionCredit(record), runtime.isQuestionTerminal(record), runtime.questionWasAttempted(record),
  clientCredit(record), JSON.stringify(getQuestionCardState(record)),
  (({ status, attemptCount, totalAttempts, partialCredit, bestPartialCredit, variantIndex, timeSpent }) => [status, attemptCount, totalAttempts, partialCredit, bestPartialCredit, variantIndex, timeSpent])(normalizeQuestionRecord(record)),
];

test('a record splits into a summary without detail and a detail that is only detail', () => {
  const record = partRecord();
  const { summary, detail } = splitQuestionRecord(record, { detailRef: 'ref-1' });
  for (const field of DETAIL_FIELDS) assert.ok(!(field in summary), `${field} is not on the summary`);
  assert.equal(summary.detailRef, 'ref-1');
  assert.equal(detail.detailRef, 'ref-1');
  assert.deepEqual(Object.keys(detail).filter((key) => key !== 'detailRef').sort(), DETAIL_FIELDS.filter((field) => field in record).sort());
  assert.ok(isSplitSummary(summary));
  assert.ok(!hasInlineDetail(summary));
  assert.equal(RESPONSE_DETAIL_COLLECTION, 'responseDetail');
  assert.equal(responseDetailPath('s 1', 'a1'), 'grades/s 1/responseDetail/a1');
});

test('the summary joined to its detail is the record, exactly', () => {
  for (const record of [stepRecord(), partRecord(), emptyQuestionRecord()]) {
    const { summary, detail } = splitQuestionRecord(record, { detailRef: 'ref-2' });
    const { detailRef, stepCredit, ...merged } = mergeQuestionRecord(summary, detail);
    assert.equal(detailRef, 'ref-2');
    assert.deepEqual(merged, record);
  }
});

test('the summary alone grades exactly as the full record: credit, terminal, attempted, card, normalized', () => {
  const record = stepRecord();
  // The steps earned more than the stored partial credit: this is what stepCredit carries.
  assert.ok(calculateStepPartialCredit(record.stepGrades, 0) > record.bestPartialCredit);
  const { summary } = splitQuestionRecord(record);
  assert.equal(summary.stepCredit, calculateStepPartialCredit(record.stepGrades, 0));
  assert.deepEqual(gradeViews(summary), gradeViews(record));
  // Without stepCredit the summary would grade lower: the check above is not vacuous.
  const { stepCredit, ...bare } = summary;
  assert.ok(indexCredit.getQuestionCredit(bare) < indexCredit.getQuestionCredit(record));
  assert.ok(runtime.getQuestionCredit(bare) < runtime.getQuestionCredit(record));
  for (const other of [partRecord(), emptyQuestionRecord()]) assert.deepEqual(gradeViews(splitQuestionRecord(other).summary), gradeViews(other));
});

test('a detail is attached only to the summary that names it', () => {
  const { summary, detail } = splitQuestionRecord(partRecord(), { detailRef: 'old' });
  // A later write (a new detailRef) never shows the older detail.
  const newer = { ...summary, detailRef: 'new' };
  assert.ok(!('partGrades' in mergeQuestionRecord(newer, detail)));
  // A reset by a writer that knows nothing of the split (an empty record, no detailRef) is read as written.
  const reset = emptyQuestionRecord();
  assert.deepEqual(mergeQuestionRecord(reset, detail), reset);
  // A record from before the split, detail inline, is read as written.
  const legacy = partRecord();
  assert.deepEqual(mergeQuestionRecord(legacy, detail), legacy);
  // A summary whose detail is missing reads as its summary.
  assert.deepEqual(mergeQuestionRecord(summary, undefined), { ...summary });
  // Legacy string statuses and empty slots are not split.
  assert.deepEqual(splitQuestionRecord('incorrect'), { summary: 'incorrect', detail: null });
  assert.deepEqual(splitQuestionRecord(null), { summary: null, detail: null });
});

test('a split never carries old split markers forward', () => {
  const first = splitQuestionRecord(stepRecord(), { detailRef: 'a' });
  const merged = mergeQuestionRecord(first.summary, first.detail);
  const second = splitQuestionRecord({ ...merged, stepGrades: [] }, { detailRef: 'b' });
  assert.equal(second.summary.detailRef, 'b');
  assert.ok(!('stepCredit' in second.summary), 'no steps, no stepCredit');
  assert.ok(!('detailRef' in second.detail && second.detail.detailRef !== 'b'));
});

test('trackers and documents: only the named assignments are joined', () => {
  const tracker = splitTracker({ 0: stepRecord(), 1: partRecord(), 2: 'unattempted' }, { detailRefFor: (key) => `r${key}` });
  assert.equal(tracker.summaries[2], 'unattempted');
  assert.ok(!(2 in tracker.details));
  const gradeData = {
    classId: 'c1',
    gradesByAssignment: { a1: tracker.summaries, a2: { 0: partRecord() } },
  };
  assert.deepEqual(assignmentsWithSplitRecords(gradeData), ['a1']);
  assert.deepEqual(assignmentsWithSplitRecords(gradeData, ['a2']), []);
  const hydrated = hydrateGradeDocument(gradeData, { a1: { questions: tracker.details } });
  assert.deepEqual(hydrated.gradesByAssignment.a2, gradeData.gradesByAssignment.a2);
  assert.equal(hydrated.classId, 'c1');
  const { detailRef, stepCredit, ...q0 } = hydrated.gradesByAssignment.a1[0];
  assert.deepEqual(q0, stepRecord());
  assert.deepEqual(mergeTracker(tracker.summaries, null)[1], { ...tracker.summaries[1] });
  assert.equal(hydrateGradeDocument(gradeData, {}), gradeData, 'nothing to join: the same object');
});

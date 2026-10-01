// The Student Case Review, end to end, on a synthetic school: one student
// whose records cover the brief's scenarios, one with almost no evidence.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStudentCaseReview, trendOf } from '../../src/platform/caseReview/studentCaseReview.js';
import { narrativeViolations } from '../../src/platform/caseReview/narrativeGuard.js';
import { TEMPLATES } from '../../src/platform/caseReview/narrativeFacts.js';
import { CASE_PROVENANCE } from '../../src/platform/caseReview/caseProvenance.js';
import { QUESTION_OUTCOME } from '../../src/platform/caseReview/attemptAnalysis.js';
import { RECONCILIATION_STATUS } from '../../src/platform/caseReview/sisReconciliation.js';
import { NOW, caseInputs, studentB } from './helpers/caseReviewFixture.mjs';
import { caseAssignmentsCsv, gradeItemLabel } from '../../src/platform/caseReview/caseReviewExport.js';

const model = buildStudentCaseReview(caseInputs());
const entry = (id) => model.assignments.find((row) => row.assignmentId === id);

test('only the student\'s real assignment instances, with the exact grade contribution of each', () => {
  assert.deepEqual(model.assignments.map((row) => row.assignmentId), ['L1', 'L2', 'L3', 'L6', 'L4', 'L5']);
  assert.ok(!model.assignments.some((row) => row.assignmentId === 'LIB'), 'the unassigned library copy never appears');
  const l1 = entry('L1');
  assert.equal(l1.instanceId, 'L1');
  assert.equal(l1.type, 'Lesson (notes / classwork)');
  assert.deepEqual(l1.sections.map((section) => section.key), ['warmup', 'classwork', 'practice', 'dol']);
  assert.deepEqual(l1.gradeItems.map((item) => [item.key, item.grade]), [['warmup', 100], ['classwork', 100], ['practice', 100], ['dol', 0]]);
  assert.equal(l1.points.possible, 8);
  assert.match(l1.weightPolicy, /set in the gradebook/);
  assert.equal(entry('L2').changedSinceExport, true, 'L2 Classwork was exported at 70 and is now 80');
  assert.equal(entry('L2').gradeItems.find((item) => item.key === 'classwork').exportStatus.state, 'changed-since-export');
});

test('the executive snapshot counts every status and keeps Standard and Modified apart', () => {
  const snapshot = model.summary.snapshot;
  assert.equal(snapshot.assigned, 6);
  assert.equal(snapshot.completed, 4);
  assert.equal(snapshot.incomplete, 1, 'L5 in progress under its extension');
  assert.equal(snapshot.missing, 1, 'L6');
  assert.equal(snapshot.completedLate, 1, 'L4 after the individualized due date');
  assert.equal(snapshot.modifiedCount, 1, 'L3: a record shows a modification changed an item');
  assert.equal(snapshot.performance.modified.count, 1);
  assert.equal(snapshot.performance.standard.count, 3);
  assert.equal(snapshot.officialSis.average, 71);
  assert.equal(snapshot.officialSis.provenance, CASE_PROVENANCE.SIS);
  assert.equal(snapshot.activeTime.serverMinutes, 35);
  assert.equal(entry('L4').individualizedDueAtMs > entry('L4').classDueAtMs, true, 'extra time moved L4\'s due date');
});

test('high completion, low DOL: instruction and DOL are compared as numbers', () => {
  const comparison = model.sectionComparison.comparisons.find((row) => row.from === 'instructional' && row.to === 'dol' && row.condition === 'standard');
  assert.equal(comparison.substantial, true);
  assert.ok(comparison.fromValue - comparison.toValue >= 15);
  assert.ok(model.sectionComparisonLines.some((line) => /^DOL accuracy: \d+%\.$/.test(line)));
  assert.ok(model.sectionComparison.assignmentsWithDolGap.some((row) => row.assignmentId === 'L1'));
});

test('repeated retries, exhausted attempts and strong improvement after retry are counted from the records', () => {
  const l1 = entry('L1').questions;
  assert.deepEqual(l1.find((row) => row.storageIndex === 2).attempts.map((attempt) => attempt.result), ['incorrect', 'incorrect', 'correct']);
  assert.equal(l1.find((row) => row.storageIndex === 2).attemptsSource, 'evidence-events');
  assert.equal(l1.find((row) => row.storageIndex === 6).outcome, QUESTION_OUTCOME.EXHAUSTED);
  const returned = entry('L2').questions.find((row) => row.storageIndex === 4);
  assert.equal(returned.repeatedReturn, true, 'the practice question was corrected the next day');
  assert.equal(entry('L3').questions[0].attemptsSource, 'derived-from-record', 'older work without per-attempt events');
  assert.ok(model.attemptSummary.correctedAfterRetry >= 5);
  assert.match(model.attemptSummaryText.standard, /scored questions? were correct on the first attempt/);
  assert.match(model.attemptSummaryText.modified, /scored questions? were correct on the first attempt/);
});

test('missing historical engagement reads Not recorded; recorded minutes are server-timed', () => {
  const l1 = model.completion.assignments.find((row) => row.assignmentId === 'L1');
  assert.equal(l1.time.activeMinutes, null);
  assert.equal(l1.time.activeProvenance, CASE_PROVENANCE.NOT_RECORDED);
  const l2 = model.completion.assignments.find((row) => row.assignmentId === 'L2');
  assert.equal(l2.time.activeMinutes, 35);
  assert.equal(l2.sessions.ledger.length, 2, 'two work sessions a day apart');
  assert.equal(l2.resumed, true);
});

test('late work, an attendance extension and Practice Mode are recorded facts with their own provenance', () => {
  const l4 = model.completion.assignments.find((row) => row.assignmentId === 'L4');
  assert.equal(l4.late, true);
  assert.equal(l4.afterDeadline.notCountedAfterClose, 1);
  const l5 = entry('L5');
  assert.equal(l5.attendanceExtension.meetingsGranted, 2);
  assert.ok(l5.finalAtMs > NOW, 'still open for this student');
  const practice = model.completion.assignments.find((row) => row.assignmentId === 'L1').practiceMode;
  assert.equal(practice.questionsPracticed, 2);
  assert.equal(practice.provenance, CASE_PROVENANCE.LEGACY);
  const kinds = new Set(model.timeline.entries.map((row) => row.kind));
  ['assigned', 'work-day', 'work-session', 'completed', 'attendance-extension', 'individual-due', 'practice-mode', 'not-counted', 'grade-export', 'grade-change', 'support']
    .forEach((kind) => assert.ok(kinds.has(kind), `timeline has ${kind}`));
});

test('support evidence comes from PR #401, with configured, available, used and staff-documented kept apart', () => {
  const tts = model.supportEvidence.summary.supports.find((row) => row.supportId === 'text-to-speech');
  assert.deepEqual([tts.configured, tts.assignmentsAvailable, tts.uses, tts.staffRecords], [true, 1, 1, 0]);
  const cfu = model.supportEvidence.summary.supports.find((row) => row.supportId === 'check-for-understanding');
  assert.equal(cfu.staffRecords, 1);
  // A configured manual support with no staff record is a gap, phrased as a record.
  assert.ok(model.narrativeFacts.some((fact) => fact.key === 'supports.no-record.repeat-instructions' && fact.provenance === CASE_PROVENANCE.NOT_RECORDED));
});

test('the gradebook reconciliation covers matched, unmatched, differing and missing items, and refuses to guess weights', () => {
  const rows = model.sis.reconciliation.rows;
  const status = (name) => rows.find((row) => row.itemName === name).status;
  assert.equal(status('Lesson 1 - Classwork'), RECONCILIATION_STATUS.MATCH);
  assert.equal(status('Lesson 1 DOL'), RECONCILIATION_STATUS.MATCH);
  assert.equal(status('Lesson 2 Classwork'), RECONCILIATION_STATUS.OFFICIAL_DIFFERS_FROM_EXPORT);
  assert.equal(status('Quiz 2 (paper)'), RECONCILIATION_STATUS.UNMATCHED_SIS_ITEM);
  assert.ok(model.sis.reconciliation.missingFromSis.some((row) => row.assignmentId === 'L3'), 'MathMaster work absent from the gradebook');
  assert.equal(model.sis.contribution.sufficient, false);
  assert.equal(model.sis.contribution.status, 'missing-weights');
  assert.ok(model.evidenceGaps.some((line) => /will not guess/.test(line)));
});

test('every narrative fact has provenance, sources where it claims a record, and a template the guard accepts', () => {
  Object.entries(TEMPLATES).forEach(([name, template]) => {
    assert.deepEqual(narrativeViolations(template.replace(/\{[A-Za-z]+\}/g, ' ')), [], `template ${name}`);
  });
  assert.ok(model.narrativeFacts.length >= 12);
  model.narrativeFacts.forEach((fact) => {
    assert.ok(Object.values(CASE_PROVENANCE).includes(fact.provenance), fact.key);
    if (fact.provenance !== CASE_PROVENANCE.NOT_RECORDED) assert.ok(fact.sources.length > 0, `${fact.key} names its sources`);
    assert.doesNotMatch(fact.text, /undefined|NaN|null/, fact.key);
  });
  const texts = model.narrativeFacts.map((fact) => fact.text);
  assert.ok(texts.includes('The student was assigned 6 MathMaster activities during the selected period and completed 4.'));
  assert.ok(texts.some((text) => /^Classwork: \d+ of \d+ answered items were correct by the final attempt \(\d+%\)\.$/.test(text)));
  assert.ok(texts.some((text) => /initially incorrect grade-level questions? (?:was|were) corrected on a later attempt\./.test(text)));
  assert.ok(texts.some((text) => /^On Modified work, 8 of 8 scored questions were correct on the first attempt\.$/.test(text)), 'Modified work in its own sentence');
  assert.ok(texts.some((text) => text.startsWith("The student's individualized due date for Lesson 4")));
  assert.ok(texts.some((text) => text.startsWith("An attendance extension set the student's last day to turn in Lesson 5")));
  assert.ok(texts.some((text) => /^Historical active time is not available for \d+ assignments? because that telemetry was not recorded\.$/.test(text)));
  assert.ok(texts.some((text) => /^The platform records calculator use on 1 assignment\.$/.test(text)));
  assert.ok(texts.some((text) => text.startsWith('MathMaster does not contain a record establishing whether')));
});

test('what needs attention: ordered, recoverable work named, and no diagnosis', () => {
  const attention = model.attention;
  assert.equal(attention.incomplete[0].assignmentId, 'L6', 'missing work first');
  assert.ok(attention.recoverable.some((row) => row.assignmentId === 'L5' && row.reason === 'open-until'));
  assert.equal(attention.lowestDols[0].assignmentId, 'L1');
  assert.ok(attention.exhaustedTotal >= 3);
  assert.ok(attention.supportEvidencePresent.some((row) => row.supportId === 'text-to-speech'));
  assert.match(attention.note, /does not diagnose/);
  // The weak standard whose DOL sits well below instruction is ranked first, with its numbers.
  assert.equal(attention.addressFirst[0].code, 'A.3C');
  assert.match(attention.addressFirst[0].basis, /^DOL \d+% vs Classwork \+ Practice \d+%/);
  assert.ok(attention.skillsBreakingDown.some((row) => row.code === 'A.3C'));
  JSON.stringify(attention.addressFirst).split('"').forEach((text) => assert.doesNotMatch(text, /struggl|lazy|effort|motivat|disabilit/i));
});

test('an unanswered section is never shown as a score: not started while open, no answers once closed', () => {
  const item = (id, key) => entry(id).gradeItems.find((row) => row.key === key);
  // L5 is still open for this student (attendance extension): one Classwork answer so far.
  assert.equal(item('L5', 'warmup').state, 'not-started');
  assert.equal(item('L5', 'classwork').state, 'partial-open');
  assert.equal(gradeItemLabel(item('L5', 'dol')), 'Not started');
  assert.match(gradeItemLabel(item('L5', 'classwork')), /^\d+ so far$/);
  // L6 closed with no answers: MathMaster has no contribution for it, and says why.
  assert.equal(item('L6', 'dol').state, 'no-answers-closed');
  assert.equal(item('L6', 'dol').grade, null);
  assert.equal(gradeItemLabel(item('L6', 'dol')), 'No answers');
  assert.equal(item('L4', 'dol').state, 'graded');
  const l5Row = caseAssignmentsCsv(model).split('\r\n').find((line) => line.startsWith('Lesson 5'));
  assert.match(l5Row, /,Not started,/, 'the CSV says Not started, not 0');
  // A DOL the student has not answered is never a "lowest DOL".
  assert.ok(model.attention.lowestDols.every((row) => row.answered > 0));
  assert.ok(!model.attention.lowestDols.some((row) => ['L5', 'L6'].includes(row.assignmentId)));
});

test('a student with little evidence: absent support, unloaded attempts — said plainly, never zeroed', () => {
  const sparse = buildStudentCaseReview(caseInputs({
    student: studentB, studentName: 'Blake Sample', revisions: [], evidence: [], serviceLog: [], engagement: [], sessionSummaries: undefined,
    exportSnapshots: null, caseEvidence: null, caseEvidenceError: 'not deployed', sisSnapshot: null,
  }));
  assert.equal(sparse.summary.snapshot.assigned, 6);
  assert.equal(sparse.summary.snapshot.incomplete + sparse.summary.snapshot.missing + sparse.summary.snapshot.notStarted >= 4, true);
  assert.equal(sparse.supportEvidence.profile.status, 'none');
  assert.equal(sparse.dataSources.attemptEvents.loaded, false);
  assert.ok(sparse.evidenceGaps.some((line) => /could not be loaded \(not deployed\)/.test(line)));
  assert.ok(sparse.evidenceGaps.some((line) => /No official gradebook snapshot/.test(line)));
  assert.ok(sparse.questions.filter((row) => row.attempts.length).every((row) => row.attemptsSource === 'derived-from-record'));
  assert.equal(sparse.completion.assignments[0].practiceMode.loaded, false);
  assert.ok(!sparse.narrativeFacts.some((fact) => /used|documented/.test(fact.key) && fact.category === 'supports'));
  assert.ok(sparse.assignments[0].gradeItems.every((item) => item.exportStatus.state === 'unavailable'), 'export history not loaded is not "not exported"');
});

test('trends need enough dated values and never overstate', () => {
  assert.equal(trendOf([{ atMs: 1, value: 50 }, { atMs: 2, value: 60 }]).determinable, false);
  const week = 7 * 86400000;
  const trend = trendOf([{ atMs: 0, value: 40 }, { atMs: week, value: 50 }, { atMs: 2 * week, value: 70 }, { atMs: 3 * week, value: 80 }]);
  assert.deepEqual([trend.earlier, trend.later, trend.direction], [45, 75, 'higher']);
});

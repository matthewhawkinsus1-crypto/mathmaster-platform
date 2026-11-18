/*
 * A RECOVERY'S SAVED STATE ON THIS DEVICE, AND ITS ANSWER COPIES, READ BACK
 * DAMAGED.
 *
 * The Recovery runner keeps its step records (tries Step Algebra's rejected
 * moves spent) and the questions this device could not show in localStorage,
 * and its answers in a copy on this device, an older build's key and the
 * server (recoveryAnswerDrafts.js). In Chromium, on the real App on the
 * teacher harness, the base opened 724 damaged copies of these stores: a step
 * record holding a value String or Number cannot read showed "This question
 * could not be displayed" (5) or closed the whole Recovery (1, in the try
 * count, above the question's boundary); every mark that was not a word (19:
 * true, numbers, lists, records, blank text) marked its question "MathMaster
 * could not grade this question"; such a value in an older build's answers
 * (3) or this device's copy (7) closed the whole Recovery; and one in the
 * server's copy (4) failed its read, so every answer the account held was
 * missing.
 *
 * These read the same values in node through the real code: the runner's
 * stores through recoveryDeviceRecords.js (the runner's wiring is held below),
 * the answer copies through the real sync (createRecoveryAnswerSync,
 * readRecoveryDraftEntries, mergeRecoveryDraftDocument). Nothing throws; no
 * damaged value reads as a try used, a question over or one not shown; and
 * every other saved record and answer comes back as saved.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  RECOVERY_STEP_STATUSES,
  readRecoveryStepRecords,
  readRecoveryUnavailable,
} from '../../src/platform/recovery/recoveryDeviceRecords.js';
import {
  buildRecoveryAnswerValue,
  buildRecoveryDraftPatch,
  createRecoveryAnswerSync,
  mergeRecoveryDraftDocument,
  readRecoveryDraftEntries,
  recoveryAnswerKey,
} from '../../src/platform/recovery/recoveryAnswerDrafts.js';
import {
  calculateStepPartialCredit,
  getAttemptsRemaining,
  normalizeQuestionRecord,
  recordQuestionStep,
} from '../../src/attemptPolicy.js';
import { recordAttemptRevision } from '../../src/platform/persistence/pausedWorkRefresh.js';
import { canonicalResponseSavedAt } from '../../src/platform/persistence/canonicalResponseTime.js';
import { QUESTION_RESOLUTION_FAILURE } from '../../src/platform/generation/familyPinReplay.js';
import { equationStatePatch, relationStatePatch } from '../../functions/shared/serverGrading/stepAlgebraStepVerification.mjs';
import { damagedCopies, hostileKeys, hostileValues } from './helpers/hostileDraftValues.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

/* ------------------------------------------------------------ the step records */

const STEP = { kind: 'algebra-step', label: 'Divided both sides by 5', productive: true, accepted: true, earned: 1, possible: 1, equationBefore: '5x=35', equationAfter: 'x=7', expectedTotalPoints: 2 };
const SUPPORT = { modified: false, accommodations: ['extended-time'], modifications: [], hintUsed: true, teacherAssisted: false, scaffoldUsed: false, contextScaffoldUsed: false, backUpStepUsed: false, feedbackAssisted: false, remediationUsed: false, workedExampleUsed: false, calculatorUsed: false, isMathematicallyIndependent: false };

// Records as the runner's writer leaves them (recordQuestionStep), each with
// what a step tool patches in.
const writtenRecords = () => {
  const balanced = recordQuestionStep({
    record: null, stepGrade: STEP, countsAttempt: false, maximumAttempts: 1,
    statePatch: equationStatePatch({ equation: { left: 'x', right: '7', variable: 'x' }, supportLevel: 'standard', stepNumber: 1 }),
  }).record;
  const twoSteps = recordQuestionStep({
    record: balanced, stepGrade: { ...STEP, label: 'Subtracted 3', equationBefore: 'x+3=10', equationAfter: 'x=7' }, countsAttempt: false, maximumAttempts: 3, supportUsage: SUPPORT,
    statePatch: equationStatePatch({ equation: { left: 'x', right: '7', variable: 'x', objective: { kind: 'solve', variable: 'x', simplifyRequired: true } }, supportLevel: 'standard', stepNumber: 2 }),
  }).record;
  const rejected = recordQuestionStep({ record: null, stepGrade: { ...STEP, accepted: false, productive: false }, countsAttempt: true, maximumAttempts: 3, statePatch: { questionDetails: 'Rejected move: Divide by 2' } }).record;
  const expired = recordQuestionStep({ record: null, stepGrade: { ...STEP, accepted: false, productive: false }, countsAttempt: true, maximumAttempts: 1 }).record;
  const relation = recordQuestionStep({
    record: null, stepGrade: { ...STEP, kind: 'relation-step' }, countsAttempt: false, maximumAttempts: 2,
    statePatch: relationStatePatch({ variable: 'x', branches: [{ expressions: ['x', '4'], relations: ['<'] }] }),
  }).record;
  return { balanced, twoSteps, rejected, expired, relation };
};

test('every record the runner writes comes back as the very object saved, with nothing reported', () => {
  const records = writtenRecords();
  assert.equal(records.expired.status, 'expired');
  assert.equal(records.rejected.status, 'attempted');
  Object.values(records).forEach((written) => assert.ok(RECOVERY_STEP_STATUSES.includes(written.status)));
  const stored = JSON.parse(JSON.stringify(records));
  const { value, issues } = readRecoveryStepRecords(stored);
  assert.equal(value, stored);
  assert.deepEqual(issues, []);
  // Nothing stored is nothing repaired.
  assert.deepEqual(readRecoveryStepRecords(null), { value: {}, issues: [] });
});

// What the question reads of a record as it opens and as the student steps:
// QuestionEngine's normalizing, its paused-work revision and response time,
// the wrapper's recorded-work test, the step credit and the next step's write.
const readAsTheQuestionDoes = (record) => {
  const normalized = normalizeQuestionRecord(record);
  recordAttemptRevision(record);
  canonicalResponseSavedAt(normalized);
  assert.equal(typeof ((Number(record?.totalAttempts) || 0) > 0), 'boolean');
  calculateStepPartialCredit(normalized.stepGrades, normalized.variantIndex);
  getAttemptsRemaining(record, 1);
  recordQuestionStep({ record, stepGrade: STEP, countsAttempt: true, maximumAttempts: 3 });
  const equation = record?.algebraState?.equation;
  if (equation) {
    for (const side of [equation.left, equation.right]) {
      assert.ok(typeof side === 'string' || Number.isFinite(side), `a board side is text or a number: ${typeof side}`);
    }
  }
  return normalized;
};

// What the runner shows of a record: over (every try used) only when its
// writer said so, never correct (no writer of this store says so).
const assertNoWrongState = (record, label) => {
  if (!record) return;
  assert.ok(RECOVERY_STEP_STATUSES.includes(record.status), `${label}: status ${String(record.status)}`);
  assert.ok(Number.isInteger(record.attemptCount) && record.attemptCount >= 0, `${label}: tries ${typeof record.attemptCount}`);
  if (record.status === 'expired') assert.ok(record.attemptCount >= 1, `${label}: over with no try counted`);
};

test('a damaged step record never throws as its question opens, never reads as a try used or the question over, and the other records are kept', () => {
  const records = writtenRecords();
  let cases = 0;
  let dropped = 0;
  for (const [name, valid] of Object.entries(records)) {
    const other = name === 'expired' ? records.balanced : records.expired;
    const damaged = [...damagedCopies(valid), ...hostileValues().map(([kind, value]) => [`= ${kind}`, value])];
    for (const [damage, value] of damaged) {
      const label = `${name}${damage}`;
      cases += 1;
      const stored = { q1: value, q2: other };
      const { value: kept } = readRecoveryStepRecords(stored);
      assert.equal(kept.q2, other, `${label}: the other question's record is the very one saved`);
      if (!kept.q1) { dropped += 1; continue; }
      assertNoWrongState(kept.q1, label);
      readAsTheQuestionDoes(kept.q1);
      assert.notEqual(normalizeQuestionRecord(kept.q1).status, 'correct', label);
    }
  }
  assert.ok(cases > 2000, `${cases} damaged records`);
  assert.ok(dropped > 100 && dropped < cases, `${dropped} not kept`);
});

test('the store damaged as a whole is read as nothing kept, and a key of the wrong kind is dropped', () => {
  const records = writtenRecords();
  for (const [kind, value] of hostileValues()) {
    const { value: kept } = readRecoveryStepRecords(value);
    assert.ok(kept && typeof kept === 'object' && !Array.isArray(kept), kind);
    Object.values(kept).forEach((record) => assertNoWrongState(record, kind));
  }
  const hostile = hostileKeys();
  Object.assign(hostile, { q1: records.expired });
  const { value: kept, issues } = readRecoveryStepRecords(hostile);
  assert.equal(Object.getPrototypeOf(kept), Object.prototype);
  assert.equal(kept.q1, records.expired);
  assert.ok(issues.includes('hostile-key'));
});

test('the cases that broke the base: each reads as a record the question can open, or as none', () => {
  const { balanced, expired } = writtenRecords();
  const unprintable = hostileKeys();
  for (const field of ['status', 'attemptCount', 'totalAttempts', 'variantIndex', 'lastAttemptAt', 'lastResponseKey']) {
    const { value } = readRecoveryStepRecords({ q1: { ...balanced, [field]: unprintable } });
    if (value.q1) readAsTheQuestionDoes(value.q1);
    assert.ok(!value.q1 || value.q1[field] === undefined, `${field}: the unreadable value is gone`);
  }
  // Statuses no writer of this store leaves: never a question shown correct or
  // over without a try.
  assert.equal(readRecoveryStepRecords({ q1: { ...balanced, status: 'correct' } }).value.q1, undefined);
  assert.equal(readRecoveryStepRecords({ q1: { ...expired, attemptCount: 0 } }).value.q1, undefined);
  // A key the question reads that this store's writer never writes (a
  // deadline submission's origin) is dropped, never read.
  const { value } = readRecoveryStepRecords({ q1: { ...balanced, submissionOrigin: unprintable } });
  assert.equal(value.q1.submissionOrigin, undefined);
  readAsTheQuestionDoes(value.q1);
  // A board with one side opens the question's own equation.
  const oneSided = readRecoveryStepRecords({ q1: { ...balanced, algebraState: { ...balanced.algebraState, equation: { left: 'x' } } } }).value.q1;
  assert.equal(oneSided.algebraState.equation, undefined);
  assert.equal(oneSided.algebraState.stepNumber, 1);
});

/* ------------------------------------------------------- what could not be shown */

const CLASSIFICATIONS = Object.values(QUESTION_RESOLUTION_FAILURE).filter((value) => typeof value === 'string');

test('every mark the runner writes comes back as saved; a mark that is not a classification never marks a question', () => {
  assert.ok(CLASSIFICATIONS.length >= 5);
  const marks = Object.fromEntries([...CLASSIFICATIONS, 'unclassified'].map((classification, index) => [`q${index + 1}`, classification]));
  const stored = JSON.parse(JSON.stringify(marks));
  assert.equal(readRecoveryUnavailable(stored).value, stored);
  assert.deepEqual(readRecoveryUnavailable(stored).issues, []);
  let marked = 0;
  for (const [kind, value] of hostileValues()) {
    const { value: kept } = readRecoveryUnavailable({ q1: value, q2: 'pin-fingerprint-mismatch' });
    assert.equal(kept.q2, 'pin-fingerprint-mismatch', `${kind}: the other mark is kept`);
    if (Object.prototype.hasOwnProperty.call(kept, 'q1')) {
      marked += 1;
      assert.equal(typeof kept.q1, 'string', kind);
      assert.ok(kept.q1.trim().length > 0, kind);
    }
    const whole = readRecoveryUnavailable(value).value;
    Object.values(whole).forEach((mark) => assert.equal(typeof mark, 'string', `whole ${kind}`));
  }
  // Only words a classification can be: "abc" and "12" are words, as every
  // classification the runner writes is (String(...) of a code); blank and
  // overlong text is not.
  assert.equal(marked, 2);
  assert.equal(Object.getPrototypeOf(readRecoveryUnavailable(hostileKeys()).value), Object.prototype);
});

/* ------------------------------------------------------------ the runner's wiring */

test('the runner opens both stores through their checks, and reads them nowhere else', () => {
  const runner = executableSource(readFileSync(new URL('../../src/components/student/SectionRecoveryRunner.jsx', import.meta.url), 'utf8'));
  const assessment = region(runner, 'function AssessmentRunner(', 'export default function SectionRecoveryRunner(', 'assessment runner');
  assert.match(assessment, /useState\(\(\) => readSaved\(stepsKey, readRecoveryStepRecords\b/);
  assert.match(assessment, /useState\(\(\) => readSaved\(unavailableKey, readRecoveryUnavailable\b/);
  // Every read of storage in the runner goes through a check.
  const reads = runner.match(/readSaved\([^)]*\)/g) || [];
  assert.equal(reads.length, 2, reads.join(' | '));
  assert.equal((runner.match(/localStorage\.getItem\(/g) || []).length, 1);
  const reader = region(runner, 'const readSaved = (key, read, what) => {', '\n};', 'stored read');
  assert.match(reader, /const \{ value, issues \} = read\(parsed\);/);
  assert.match(reader, /return value;/);
  assert.doesNotMatch(reader, /return parsed/);
});

/* -------------------------------------------------------------- the answer copies */

const STUDENT = '910975';
const ASSIGNMENT = 'a-recovery-c';
const keyFor = (itemId) => recoveryAnswerKey({ section: 'dol', opportunity: 1, itemId });
const fieldsResponse = (text) => ({ kind: 'fields', type: 'multi-answer', value: '', fields: [{ id: 'part-1', value: text, isComplete: true }] });
const answerEntry = (itemId, text, savedAt) => ({
  key: keyFor(itemId),
  value: buildRecoveryAnswerValue({ itemId, fingerprint: `fp-${itemId}`, response: fieldsResponse(text) }),
  savedAt,
  writer: 'device-a',
  revision: 1,
  synced: true,
  origin: 'device',
});
const openSync = () => {
  const sync = createRecoveryAnswerSync({ studentId: STUDENT, assignmentId: ASSIGNMENT, writer: 'device-b', flush: () => new Promise(() => {}), now: () => 1_800_000_000_000 });
  return sync;
};
const answerOf = (sync, itemId) => sync.entry(keyFor(itemId))?.value?.response?.fields?.[0]?.value ?? null;

test('this device\'s copy, damaged: nothing throws as the Recovery opens, and every other answer is kept', () => {
  const q1 = answerEntry('q1', '7', 1_700_000_000_000);
  const q2 = answerEntry('q2', '4', 1_700_000_000_001);
  let cases = 0;
  for (const [damage, value] of [...damagedCopies(q2), ...hostileValues().map(([kind, hostile]) => [` = ${kind}`, hostile])]) {
    cases += 1;
    const sync = openSync();
    assert.doesNotThrow(() => sync.hydrate({ [q1.key]: q1, [q2.key]: value }), damage);
    assert.equal(answerOf(sync, 'q1'), '7', `${damage}: the other answer is kept`);
    sync.stop();
  }
  for (const [kind, value] of hostileValues()) {
    const sync = openSync();
    assert.doesNotThrow(() => sync.hydrate(value), `whole copy ${kind}`);
    sync.stop();
  }
  assert.ok(cases > 100, `${cases}`);
});

test('an answer whose own key was damaged is the answer its place in the copy names', () => {
  const q1 = answerEntry('q1', '7', 1_700_000_000_000);
  for (const damaged of [undefined, null, 'abc', 12, true, [], {}, hostileKeys()]) {
    const sync = openSync();
    sync.hydrate({ [q1.key]: { ...q1, key: damaged } });
    assert.equal(answerOf(sync, 'q1'), '7', JSON.stringify(damaged));
    sync.stop();
  }
});

test('an older build\'s answers and the server\'s copy, damaged: nothing throws, and every other answer is read', () => {
  const unprintable = hostileKeys();
  // The older build's key: { itemId: response }, read by the hook into this
  // device's copy through buildRecoveryAnswerValue.
  for (const response of [
    { ...fieldsResponse('4'), type: unprintable },
    { ...fieldsResponse('4'), fields: [{ id: unprintable, value: '4' }] },
    { ...fieldsResponse('4'), fields: [{ id: 'part-1', value: unprintable }] },
    { kind: 'tool', type: unprintable, toolId: unprintable, value: unprintable, contractVersion: unprintable },
    ...hostileValues().map(([, value]) => value),
  ]) {
    assert.doesNotThrow(() => buildRecoveryAnswerValue({ itemId: 'q2', fingerprint: 'fp-q2', response }));
  }
  // The server's copy: one damaged entry beside an answer typed on another
  // Chromebook. The base failed the whole read on these (the account's answers
  // were missing on every device).
  const typedElsewhere = answerEntry('q1', '9', 1_700_000_000_005);
  const storedEntry = (entry) => ({ key: entry.key, valueJson: JSON.stringify(entry.value), savedAt: entry.savedAt, questionIndex: null, variantIndex: null, writer: 'device-c', revision: 1 });
  const other = storedEntry(answerEntry('q3', '2', 1_700_000_000_006));
  for (const [damage, value] of [...damagedCopies(other), ...hostileValues().map(([kind, hostile]) => [` = ${kind}`, hostile])]) {
    const document = { entries: [storedEntry(typedElsewhere), value] };
    let entries;
    assert.doesNotThrow(() => { entries = readRecoveryDraftEntries(document); }, damage);
    assert.ok(entries.some((entry) => entry.key === typedElsewhere.key), `${damage}: the answer typed elsewhere is read`);
    const sync = openSync();
    sync.noteServerCopy(entries);
    assert.equal(answerOf(sync, 'q1'), '9', damage);
    sync.stop();
    // A save merged into that document keeps it too.
    const merged = mergeRecoveryDraftDocument({ existing: document, patch: buildRecoveryDraftPatch({ studentId: STUDENT, assignmentId: ASSIGNMENT, entries: [{ ...answerEntry('q2', '5', 1_700_000_000_010), synced: false }] }) });
    assert.ok(merged.entries.some((entry) => entry.key === typedElsewhere.key), `${damage}: merged`);
  }
  for (const field of ['key', 'savedAt', 'writer', 'revision']) {
    const entries = readRecoveryDraftEntries({ entries: [storedEntry(typedElsewhere), { ...other, [field]: unprintable }] });
    assert.ok(entries.some((entry) => entry.key === typedElsewhere.key), field);
  }
});

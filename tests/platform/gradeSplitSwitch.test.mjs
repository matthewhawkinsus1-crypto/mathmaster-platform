// THE GRADES SPLIT WAITS FOR ITS SWITCH: settings/serverGrading.splitGradeRecords.
//
// A browser tab opened before the split shipped reads a question's record from
// the grades document alone, and nothing reloads it: shown a summary, it loses
// the question's parts, steps and last response. So until the operator turns
// the switch on, a day after Hosting ships, every writer stores a record whole,
// as before the split, except a record already stored split and any record of a
// student whose grades document is near Firestore's 1 MiB cap. Switch on or
// off, a record is split only when it has detail to move and a reader built
// before the split grades its summary exactly as the whole record
// (gradeSplitOlderReaders.test.mjs).
//
// The same writers against the emulator: tests/integration/gradeSplitServer.test.mjs.
// A teacher's live correction, one transaction over a class, writes every
// record whole: tests/rules/liveCorrectionClassRules.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { getQuestionCredit } from '../../functions/shared/attemptPolicy.mjs';
import {
  DETAIL_FIELDS,
  SPLIT_SWITCH_FIELD,
  mergeQuestionRecord,
  recordForStorage,
  splitSwitchOn,
  trackerForStorage,
  trackerWhole,
  wholeRecord,
} from '../../functions/shared/gradeEntryStorage.mjs';

const require = createRequire(import.meta.url);
const store = require('../../functions/lib/gradeDetailStore.js');
const { DOCUMENT_CAP_BYTES, firestoreDocumentBytes } = require('../../functions/lib/firestoreDocumentSize.js');

const source = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

const step = (stepNumber, before, after) => ({
  kind: 'operation', label: `Step ${stepNumber}`, stepNumber, variantIndex: 0, mode: 'guided',
  equationBefore: before, equationAfter: after, earned: 1, possible: 1, expectedTotalPoints: 3,
  accepted: true, productive: true, recordedAt: '2026-11-13T14:24:18.412Z',
});
// Steps that earned more than the stored credit: a reader built before the
// split grades this record's summary lower, so it is never split without the switch.
const stepsAheadOfCredit = () => ({
  status: 'attempted', attemptCount: 1, totalAttempts: 1, partialCredit: 0, bestPartialCredit: 0,
  variantIndex: 0, timeSpent: 210, lastAttemptAt: '2026-11-13T14:24:18.412Z', lastSubmissionId: 'sub-1',
  stepCreditVersion: 3, gradedBy: 'server', submissionOrigin: 'server-ingestion',
  stepGrades: [step(1, '2x+3=11', '2x=8'), step(2, '2x=8', 'x=4')],
  algebraState: { equation: 'x=4', stepNumber: 2, supportLevel: 'guided', relationState: null },
  partGrades: [], lastResponseKey: '{"x":"4"}', questionDetails: 'Solve 2x + 3 = 11',
  supportUsage: { hintUsed: false, isMathematicallyIndependent: true, accommodations: [] },
});
const partRecord = () => ({
  status: 'correct', attemptCount: 2, totalAttempts: 2, partialCredit: 100, bestPartialCredit: 100,
  variantIndex: 1, timeSpent: 95, lastAttemptAt: '2026-11-14T21:27:14.720Z',
  partGrades: [{ id: 'm', label: 'slope', isComplete: true, isCorrect: true }], stepGrades: [],
  lastResponseKey: '{"m":"2"}', questionDetails: 'y = 2x - 1', familyDelivery: { familyId: 'lines', seat: 14 },
  supportUsage: { hintUsed: true, isMathematicallyIndependent: false, accommodations: ['read-aloud'] },
  algebraState: null,
});
// A record as a writer holds it after reading one stored split: joined to its
// detail, still carrying the summary's detailRef (and stepCredit, when steps earned any).
const joinedFromSplit = (record, detailRef = 'stored-ref') => ({ ...record, detailRef });
const withoutMarkers = (record) => {
  const { detailRef: _detailRef, stepCredit: _stepCredit, ...rest } = record;
  return rest;
};
const isSplit = ({ summary, detail }) => Boolean(detail) && typeof summary.detailRef === 'string'
  && DETAIL_FIELDS.every((field) => !(field in summary));

// A grades document reference, and a writer that records what is written on it.
const gradeRefFor = (studentId) => ({
  id: studentId,
  path: `grades/${studentId}`,
  collection: (name) => ({ doc: (id) => ({ id, path: `grades/${studentId}/${name}/${id}` }) }),
});
const recordingWriter = () => {
  const writes = [];
  return {
    writes,
    set: (ref, data, options) => writes.push({ op: 'set', path: ref.path, data, options }),
    update: (ref, ...pairs) => writes.push({ op: 'update', path: ref.path, pairs }),
  };
};

test('the switch is settings/serverGrading.splitGradeRecords, and only true turns it on', () => {
  assert.equal(SPLIT_SWITCH_FIELD, 'splitGradeRecords');
  assert.equal(splitSwitchOn({ splitGradeRecords: true, requireStepWork: false }), true);
  for (const off of [undefined, null, {}, { splitGradeRecords: false }, { splitGradeRecords: 'true' }, { splitGradeRecords: 1 }]) {
    assert.equal(splitSwitchOn(off), false, JSON.stringify(off));
  }
});

test('with the switch off a record is stored whole, as before the split, with no split marker', () => {
  assert.deepEqual(recordForStorage(partRecord()), { summary: partRecord(), detail: null });
  assert.deepEqual(recordForStorage(stepsAheadOfCredit()), { summary: stepsAheadOfCredit(), detail: null });
  // A stray stepCredit is never written on a whole record: readers compute it from the steps.
  assert.deepEqual(recordForStorage({ ...partRecord(), stepCredit: 40 }), { summary: partRecord(), detail: null });
  for (const legacy of ['attempted', null, 3]) assert.deepEqual(recordForStorage(legacy), { summary: legacy, detail: null });
  // A field left undefined is dropped, as the split drops it: Firestore refuses an undefined value.
  const unset = recordForStorage({ ...partRecord(), familyDelivery: undefined }).summary;
  assert.equal(Object.prototype.hasOwnProperty.call(unset, 'familyDelivery'), false);
});

test('with the switch on a record is split, by the same check as without it', () => {
  const halves = recordForStorage(partRecord(), { splitAll: true });
  assert.ok(isSplit(halves));
  assert.deepEqual(withoutMarkers(mergeQuestionRecord(halves.summary, halves.detail)), partRecord(), 'joined back it is the record');
  // A tab left open across the switch still reads the summary alone.
  assert.deepEqual(recordForStorage(stepsAheadOfCredit(), { splitAll: true }), { summary: stepsAheadOfCredit(), detail: null });
  assert.deepEqual(recordForStorage(joinedFromSplit(stepsAheadOfCredit()), { splitAll: true }), { summary: stepsAheadOfCredit(), detail: null });
});

test('a record with no detail field is never split: there is nothing to move', () => {
  // Split, it would name a detail holding nothing, which a browser cannot tell
  // from one that has not loaded (it refuses to write over either).
  const bare = { status: 'attempted', attemptCount: 1, partialCredit: 50 };
  for (const policy of [{ splitAll: true }, { nearCap: true }, {}]) {
    assert.deepEqual(recordForStorage(bare, policy), { summary: bare, detail: null }, JSON.stringify(policy));
    assert.deepEqual(recordForStorage({ ...bare, detailRef: 'stored-ref' }, policy), { summary: bare, detail: null });
  }
});

test('a record or tracker stored whole: no split marker, no undefined field, nothing for responseDetail', () => {
  const { familyDelivery: _familyDelivery, ...withoutPin } = partRecord();
  assert.deepEqual(wholeRecord({ ...joinedFromSplit(partRecord()), stepCredit: 40, familyDelivery: undefined }), withoutPin);
  for (const legacy of ['attempted', null, 3]) assert.equal(wholeRecord(legacy), legacy);
  assert.deepEqual(trackerWhole({ 0: joinedFromSplit(partRecord()), 1: 'attempted', 2: { ...stepsAheadOfCredit(), detailRef: 'r', stepCredit: 67 } }), {
    0: partRecord(), 1: 'attempted', 2: stepsAheadOfCredit(),
  });
  assert.deepEqual(trackerWhole(undefined), {});
});

test('a record already stored split stays split, unless an older reader would grade its summary lower', () => {
  const kept = recordForStorage(joinedFromSplit(partRecord()));
  assert.ok(isSplit(kept), 'it stays split, so a document the split made room in does not fill again');
  assert.notEqual(kept.summary.detailRef, 'stored-ref', 'with a fresh detailRef, written with its detail');
  assert.deepEqual(withoutMarkers(mergeQuestionRecord(kept.summary, kept.detail)), partRecord());

  const ahead = { ...joinedFromSplit(stepsAheadOfCredit()), stepCredit: 67 };
  const whole = recordForStorage(ahead);
  assert.equal(whole.detail, null, 'its summary would read lower in a tab opened before the split');
  assert.deepEqual(whole.summary, stepsAheadOfCredit(), 'so it is written whole, without the old detailRef or stepCredit');
  assert.equal(getQuestionCredit(whole.summary), getQuestionCredit(stepsAheadOfCredit()));
});

test('near the cap a record is split, by the same check', () => {
  assert.ok(isSplit(recordForStorage(partRecord(), { nearCap: true })));
  assert.deepEqual(recordForStorage(stepsAheadOfCredit(), { nearCap: true }), { summary: stepsAheadOfCredit(), detail: null });
});

test('a tracker keeps each record as the rule says, and says when its detail document must be replaced', () => {
  const tracker = { 0: partRecord(), 1: joinedFromSplit(partRecord()), 2: 'attempted', 3: joinedFromSplit(stepsAheadOfCredit()) };
  const off = trackerForStorage(tracker);
  assert.deepEqual(off.summaries[0], partRecord());
  assert.equal(typeof off.summaries[1].detailRef, 'string');
  assert.equal(off.summaries[2], 'attempted');
  assert.deepEqual(off.summaries[3], stepsAheadOfCredit());
  assert.deepEqual(Object.keys(off.details), ['1']);
  assert.equal(off.hadSplit, true, 'records 1 and 3 were stored split: the detail document is replaced');

  const allWhole = trackerForStorage({ 0: partRecord(), 1: 'attempted' });
  assert.deepEqual(allWhole, { summaries: { 0: partRecord(), 1: 'attempted' }, details: {}, hadSplit: false });

  const on = trackerForStorage({ 0: partRecord(), 1: stepsAheadOfCredit() }, { splitAll: true });
  assert.deepEqual(Object.keys(on.details), ['0'], 'record 1 stays whole, switch or no switch');
  assert.deepEqual(on.summaries[1], stepsAheadOfCredit());
});

test('the size counted is Firestore\'s own: its documented example is 147 bytes', () => {
  assert.equal(DOCUMENT_CAP_BYTES, 1_048_576);
  assert.equal(firestoreDocumentBytes('users/jeff/tasks/my_task_id', {
    type: 'Personal', done: false, priority: 1, description: 'Learn Cloud Firestore',
  }), 147);
  // name 'c/d': 2 + 2 + 16; fields: 'a' [8 + 2 + 1], 'm' { 'k' true }; + 32
  assert.equal(firestoreDocumentBytes('c/d', { a: [1, 'b', null], m: { k: true } }), 20 + (2 + 11) + (2 + 2 + 1) + 32);
  const timestamp = { seconds: 1, nanoseconds: 0, toDate: () => new Date(1000) };
  assert.equal(firestoreDocumentBytes('c/d', { t: timestamp, d: new Date(0), b: new Uint8Array(5), s: 'é' }), 20 + (2 + 8) + (2 + 8) + (2 + 5) + (2 + 3) + 32);
});

test('a write splits with the switch on, or when the grades document is past three quarters of the cap', async () => {
  assert.equal(store.GRADE_DOCUMENT_SPLIT_BYTES, 786_432);
  const gradeRef = gradeRefFor('s1');
  assert.deepEqual(await store.splitPolicy({ settings: { splitGradeRecords: true } }), { splitAll: true, nearCap: false, bytes: null });
  const small = await store.splitPolicy({ settings: {}, gradeRef, storedGradeData: { gradesByAssignment: { a1: { 0: partRecord() } } } });
  assert.equal(small.splitAll, false);
  assert.equal(small.nearCap, false);
  assert.ok(small.bytes > 0 && small.bytes < 2_000);
  const near = await store.splitPolicy({ settings: null, gradeRef, storedGradeData: { history: 'x'.repeat(store.GRADE_DOCUMENT_SPLIT_BYTES) } });
  assert.equal(near.nearCap, true);
  // Nothing measured, nothing near the cap.
  assert.deepEqual(await store.splitPolicy({ settings: {} }), { splitAll: false, nearCap: false, bytes: 0 });
});

test('one question\'s record: whole with no detail write while the switch is off; split beside its detail when on', async () => {
  const gradeRef = gradeRefFor('s1');
  const key = (pair) => pair[0].segments.join('/');

  const offWriter = recordingWriter();
  const off = await store.questionRecordUpdates({
    writer: offWriter, gradeRef, studentId: 's1', assignmentId: 'a1', questionKey: '0', record: partRecord(), policy: { splitAll: false, nearCap: false },
  });
  assert.equal(key(off), 'gradesByAssignment/a1/0');
  assert.deepEqual(off[1], partRecord());
  assert.deepEqual(offWriter.writes, [], 'no detail document is written');
  // No policy at all is the switch off.
  const unsaid = await store.questionRecordUpdates({ writer: recordingWriter(), gradeRef, studentId: 's1', assignmentId: 'a1', questionKey: '0', record: partRecord() });
  assert.deepEqual(unsaid[1], partRecord());

  const onWriter = recordingWriter();
  const on = await store.questionRecordUpdates({
    writer: onWriter, gradeRef, studentId: 's1', assignmentId: 'a1', questionKey: '0', record: partRecord(), policy: { splitAll: true },
  });
  assert.equal(typeof on[1].detailRef, 'string');
  assert.equal(onWriter.writes.length, 1);
  assert.equal(onWriter.writes[0].path, 'grades/s1/responseDetail/a1');
  assert.equal(onWriter.writes[0].data.questions[0].detailRef, on[1].detailRef);

  const nearWriter = recordingWriter();
  const near = await store.questionRecordUpdates({
    writer: nearWriter, gradeRef, studentId: 's1', assignmentId: 'a1', questionKey: '0', record: stepsAheadOfCredit(), policy: { nearCap: true },
  });
  assert.deepEqual(near[1], stepsAheadOfCredit(), 'near the cap, a record an older reader would grade lower is still written whole');
  assert.deepEqual(nearWriter.writes, []);
});

test('a whole tracker: its detail document is replaced only when a record is split now or was before', async () => {
  const storage = await store.gradeEntryStorage();
  const gradeRef = gradeRefFor('s1');
  const write = (tracker, policy) => {
    const writer = recordingWriter();
    store.writeSplitTracker(storage, writer, gradeRef, 'a1', tracker, policy);
    return writer.writes;
  };

  const whole = write({ 0: partRecord() }, { splitAll: false });
  assert.equal(whole.length, 1, 'records written whole: the grades document only');
  assert.deepEqual(whole[0].pairs[1], { 0: partRecord() });

  const wasSplit = write({ 0: joinedFromSplit(stepsAheadOfCredit()) }, null);
  assert.deepEqual(wasSplit.map((entry) => entry.op), ['update', 'set']);
  assert.deepEqual(wasSplit[1].data.questions, {}, 'the old detail is cleared, so none survives the record written whole');
  assert.equal(wasSplit[1].options, undefined, 'replaced, not merged');

  const on = write({ 0: partRecord(), 1: stepsAheadOfCredit() }, { splitAll: true });
  assert.deepEqual(Object.keys(on[1].data.questions), ['0']);
  assert.deepEqual(on[0].pairs[1][1], stepsAheadOfCredit());
});

test('every writer of a question record passes the switch, read from settings/serverGrading', () => {
  const grading = source('functions/gradingFunctions.js');
  const authoring = source('functions/authoringFunctions.js');
  // Each call's arguments, up to the text that closes it.
  const callsOf = (text, name, close = '})') => text.split(`${name}(`).slice(1).map((rest) => rest.slice(0, rest.indexOf(close) + close.length));

  const recordCalls = callsOf(grading, 'await questionRecordUpdates');
  assert.equal(recordCalls.length, 2, 'the deadline finalizer and submission ingestion');
  recordCalls.forEach((call) => assert.match(call, /policy: recordPolicy/));
  assert.equal((grading.match(/const recordPolicy = await splitPolicy\(\{ settings: serverGradingSettings, gradeRef, storedGradeData \}\);/g) || []).length, 2,
    'each measured on the grades document as stored, in its own transaction');
  assert.match(grading, /splitInlineRecords\(\{ db, studentId, settings: serverGradingSettings \}\)/);
  assert.match(grading, /\(recordPolicy\.splitAll \|\| recordPolicy\.nearCap\)/, 'records are moved only when they would split');

  // The scheduler, a teacher's sweep, the submission queue and a teacher's
  // draft recovery each read the switch once and hand it to every finalizer
  // and every ingestion they run.
  assert.equal((grading.match(/const serverGradingSettings = \(await db\.collection\("settings"\)\.doc\("serverGrading"\)\.get\(\)\)\.data\(\) \|\| \{\};/g) || []).length, 4);
  const finalizerCalls = callsOf(grading, 'await finalizeOneResponseCheckpoint');
  assert.equal(finalizerCalls.length, 2);
  finalizerCalls.forEach((call) => assert.match(call, /serverGradingSettings/));
  const ingestionCalls = callsOf(grading, 'await ingestOneSubmission');
  assert.equal(ingestionCalls.length, 2, 'the submission queue and a teacher\'s draft recovery');
  ingestionCalls.forEach((call) => assert.match(call, /\bserverGradingSettings\b/));
  assert.equal(grading.split('ingestOneSubmission(').length - 1, 3, 'its definition and those two calls: no other caller');

  const trackerCalls = callsOf(authoring, 'writeSplitTracker', ');');
  assert.equal(trackerCalls.length, 2, 'the content upgrade and a teacher\'s question repair');
  trackerCalls.forEach((call) => assert.match(call, /, recordPolicy\);$/));
  assert.equal((authoring.match(/settings: \(await db\.collection\("settings"\)\.doc\("serverGrading"\)\.get\(\)\)\.data\(\) \|\| \{\},/g) || []).length, 2);

  // The browser's writer: whole unless told the switch is on, which it reads fresh and treats as off when unreadable.
  const browser = source('src/platform/grades/responseDetailStore.js');
  assert.match(browser, /export const writeTrackerSplit = \(\{ db, writer, studentId, assignmentId, tracker, splitAll = false \}\)/);
  assert.match(browser, /if \(hadSplit \|\| Object\.keys\(details\)\.length\) \{/);
  assert.match(browser, /splitSwitchOn\(\(await getDoc\(doc\(db, 'settings', 'serverGrading'\)\)\)\.data\(\)\)/);
  assert.match(browser, /\} catch \{\n {4}return false;\n {2}\}/);
  // The current-grader repair, one student per batch, reads the switch.
  const app = source('src/App.jsx');
  assert.match(app, /const splitAll = await readSplitSwitch\(db\);/);
  assert.match(app, /writeTrackerSplit\(\{/);
});

test('a teacher\'s live correction, one transaction over a class, writes every record whole and reads detail beside it', () => {
  // Firestore rules allow 20 document lookups in one transaction; a detail
  // document costs one per student, written or read in it
  // (tests/rules/liveCorrectionClassRules.test.mjs).
  const browser = source('src/platform/grades/responseDetailStore.js');
  assert.match(browser, /export const writeTrackerWhole = \(\{ db, writer, studentId, assignmentId, tracker \}\) => \{\n {2}if \(!trackerFullyJoined\(tracker\)\) throw new UnjoinedTrackerError\(studentId, assignmentId\);\n {2}const records = trackerWhole\(tracker\);\n {2}writer\.update\(doc\(db, 'grades', String\(studentId\)\), new FieldPath\('gradesByAssignment', String\(assignmentId\)\), records\);\n {2}return records;\n\};/);
  // The detail is read with getDoc, never transaction.get, and a summary that
  // no longer matches it runs the transaction again (Firestore's `aborted`).
  const start = browser.indexOf('export const joinTrackerOutsideTransaction');
  assert.ok(start > 0);
  const join = browser.slice(start, browser.indexOf('\n};\n', start));
  assert.match(join, /const snapshot = await getDoc\(responseDetailDoc\(db, studentId, assignmentId\)\);/);
  assert.match(join, /throw new FirestoreError\(\n {6}'aborted',/);
  assert.doesNotMatch(browser, /transaction\.get\(/);

  const workspace = source('src/app/teacher/TeacherWorkspace.jsx');
  assert.match(workspace, /await joinTrackerOutsideTransaction\(db, student\.id, snapshot\.data\(\) \|\| \{\}, assignmentId\)/);
  assert.match(workspace, /writeTrackerWhole\(\{ db, writer: transaction, studentId: student\.id, assignmentId, tracker: nextTracker \}\);/);
  assert.doesNotMatch(workspace, /writeTrackerSplit|readSplitSwitch|responseDetailDoc/);
});

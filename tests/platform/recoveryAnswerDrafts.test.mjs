// SAVED RECOVERY ANSWERS FOLLOW THE STUDENT, AND CARRY NOTHING BUT THE ANSWER.
//
// The release-candidate bug: a Recovery's "saved" answers lived only in the
// browser that saved them, so the same Recovery submitted from another
// Chromebook sent `responses: {}` and every saved answer was graded 0. The
// pure rules are in src/platform/recovery/recoveryAnswerDrafts.js; the real
// Firestore round trip and the real `advanceSectionRecovery` handler are in
// tests/integration/recoveryAnswerDraftsCrossDevice.test.mjs, the Security
// Rules in tests/rules/recoveryAnswerDraftRules.test.mjs, and the screens in
// tests/browser/teacherWorkflow/recoveryDraftCrossDeviceJourneys.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  RECOVERY_ANSWER_SAVED_WHERE,
  RECOVERY_DRAFT_FORBIDDEN_KEYS,
  applyRecoveryAnswerPatch,
  buildRecoveryAnswerValue,
  buildRecoveryDraftPatch,
  createRecoveryAnswerSync,
  forbiddenRecoveryDraftPath,
  mergeRecoveryDraftDocument,
  projectRecoveryAnswer,
  readRecoveryDraftEntries,
  recoveryAnswerKey,
  recoveryDraftAssignmentId,
  recoveryDraftDocumentId,
} from '../../src/platform/recovery/recoveryAnswerDrafts.js';
import { normalizeCheckpointResponse } from '../../src/platform/performance/responseCheckpoint.js';
import { buildToolResponse } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { FORBIDDEN_DRAFT_KEYS, isSyncableDraftKey } from '../../functions/shared/workspaceDraftSchema.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const STUDENT = 's-1';
const ASSIGNMENT = 'a-1';
const SECRET = 'KEY-7731-SECRET';
const key = (itemId) => recoveryAnswerKey({ section: 'dol', opportunity: 1, itemId });

// A rendered question as the runner holds it: answer key, solution and
// grading definitions all present, which is exactly what must never travel.
const renderedQuestion = {
  type: 'multiAnswer',
  prompt: 'Solve 2x + 3 = 9.',
  answerFields: [{ id: 'solution', label: 'x =', answer: SECRET, acceptedAnswers: [SECRET] }],
  acceptedAnswers: [SECRET],
  solution: { steps: [SECRET] },
  gradingContract: { expected: SECRET },
  questionFamily: { id: 'linear.twoStepEquation', seed: 99 },
};
const studentResponse = normalizeCheckpointResponse(renderedQuestion, {
  parts: [{ id: 'solution', response: 'x=3', isComplete: true }],
  responseKey: 'x=3',
  isComplete: true,
});

// Every key at every depth, including inside each entry's JSON and inside a
// tool response's serialized work.
const allKeys = (value, found = new Set()) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 1) {
      try { allKeys(JSON.parse(trimmed), found); } catch { /* plain text */ }
    }
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) { value.forEach((entry) => allKeys(entry, found)); return found; }
  Object.entries(value).forEach(([name, nested]) => { found.add(name); allKeys(nested, found); });
  return found;
};

const memoryServer = () => {
  let stored = null;
  const writes = [];
  return {
    get: () => stored,
    writes,
    flush: (patch) => applyRecoveryAnswerPatch({
      read: async () => (stored ? JSON.parse(JSON.stringify(stored)) : null),
      write: (merged) => { stored = { ...merged, updatedAt: 'server-time' }; writes.push(patch); },
    }, patch),
    read: async () => readRecoveryDraftEntries(stored),
  };
};

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => { setImmediate(resolve); });
const manualTimers = () => {
  const queue = [];
  return { set: (callback, delay) => { queue.push({ callback, delay }); return queue.length; }, clear: () => {}, queue };
};

/* --------------------------------------------------------------- payload */

test('the draft payload is the student\'s answer only: no key, solution or grading data at any depth', () => {
  const value = buildRecoveryAnswerValue({ itemId: 'r1', fingerprint: 'fp-1', response: { ...studentResponse, answerKey: SECRET, isCorrect: true, question: renderedQuestion } });
  assert.ok(value);
  const patch = buildRecoveryDraftPatch({ studentId: STUDENT, assignmentId: ASSIGNMENT, entries: [{ key: key('r1'), value, savedAt: 10, writer: 'w', revision: 1 }] });
  const document = mergeRecoveryDraftDocument({ existing: null, patch });
  const json = JSON.stringify(document);
  assert.ok(!json.includes(SECRET), 'no answer-key or solution value anywhere in the document');
  const keys = allKeys(document);
  for (const forbidden of new Set([...FORBIDDEN_DRAFT_KEYS, ...RECOVERY_DRAFT_FORBIDDEN_KEYS, 'question', 'prompt', 'questionFamily', 'steps'])) {
    assert.ok(!keys.has(forbidden), `no "${forbidden}" key in the stored draft`);
  }
  // The student's answer is there, field id and all — `solution` here is a
  // field's id (a value), never a key.
  const [entry] = readRecoveryDraftEntries(document);
  assert.deepEqual(entry.value.response.fields, [{ id: 'solution', value: 'x=3', isComplete: true }]);
  // Exactly the shape the Security Rules allow on a draft.
  assert.equal(document.secure, false);
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.documentId, `${STUDENT}__${ASSIGNMENT}-recovery`);
  assert.equal(document.assignmentId, recoveryDraftAssignmentId(ASSIGNMENT));
  ['isCorrect', 'score', 'grade', 'record', 'evidence', 'mastery', 'answerKey', 'acceptedAnswers', 'solution', 'seed', 'attemptCount', 'totalAttempts', 'partGrades', 'partialCredit']
    .forEach((field) => assert.ok(!Object.hasOwn(document, field), `no top-level ${field}`));
});

test('a tool response keeps its work, never a key smuggled into that work', () => {
  const tool = buildToolResponse({ question: { type: 'functionGraph' }, toolId: 'graph', work: { points: [[0, 1], [2, 5]], explanation: 'slope 2', solution: SECRET, answerKey: SECRET } });
  const projected = projectRecoveryAnswer(tool);
  assert.ok(projected, 'the work is kept');
  assert.ok(!JSON.stringify(projected).includes(SECRET));
  assert.ok(JSON.parse(projected.value).explanation === 'slope 2', 'a field the student wrote is theirs');
  // A forged tool response whose serialized work still names a key: the tool
  // contract drops its own non-work keys, and anything else the draft guard
  // forbids refuses the whole answer rather than storing it.
  const forged = { ...tool, value: JSON.stringify({ points: [], gradingContract: { expected: SECRET } }) };
  assert.ok(!JSON.stringify(projectRecoveryAnswer(forged)).includes(SECRET), 'the bounded work drops a contract key');
  const smuggled = { ...tool, value: JSON.stringify({ points: [], workedSolution: SECRET }) };
  assert.equal(projectRecoveryAnswer(smuggled), null, 'work naming a worked solution is never stored');
  assert.equal(forbiddenRecoveryDraftPath({ a: [{ b: { solution: 1 } }] }), 'a[0].b.solution');
  assert.equal(projectRecoveryAnswer({ kind: 'mystery', value: SECRET }), null, 'an unknown shape is never stored');
});

test('the draft key cannot be mistaken for secure or preview work, and never names the assignment', () => {
  const draftKey = recoveryAnswerKey({ section: 'dol', opportunity: 2, itemId: 'r3~replacement' });
  assert.ok(isSyncableDraftKey(draftKey));
  assert.ok(!draftKey.includes(ASSIGNMENT));
  assert.equal(recoveryDraftDocumentId({ studentId: 'a/b', assignmentId: 'x' }), 'a%2Fb__x-recovery');
});

/* ----------------------------------------------------------------- order */

test('per question the newest answer wins; an older save from the same page never lands over a newer one', () => {
  const value = (answer) => buildRecoveryAnswerValue({ itemId: 'r1', response: { kind: 'scalar', type: 'literal', value: answer, fields: [] } });
  const patch = (entries) => buildRecoveryDraftPatch({ studentId: STUDENT, assignmentId: ASSIGNMENT, entries });
  const answerOf = (document, itemId = 'r1') => readRecoveryDraftEntries(document).find((entry) => entry.key === key(itemId))?.value.response?.value;

  // Same page: revision decides, even when the newer save carries an older clock.
  const newer = patch([{ key: key('r1'), value: value('7'), savedAt: 100, writer: 'page-a', revision: 2 }]);
  const older = patch([{ key: key('r1'), value: value('5'), savedAt: 200, writer: 'page-a', revision: 1 }]);
  const landed = mergeRecoveryDraftDocument({ existing: mergeRecoveryDraftDocument({ patch: newer }), patch: older });
  assert.equal(answerOf(landed), '7', 'the stale write from the same page is refused');

  // Different pages: the later edit wins.
  const otherDevice = patch([{ key: key('r1'), value: value('9'), savedAt: 300, writer: 'page-b', revision: 1 }]);
  assert.equal(answerOf(mergeRecoveryDraftDocument({ existing: landed, patch: otherDevice })), '9');
  const staleDevice = patch([{ key: key('r1'), value: value('1'), savedAt: 50, writer: 'page-c', revision: 9 }]);
  assert.equal(answerOf(mergeRecoveryDraftDocument({ existing: landed, patch: staleDevice })), '7', 'an older edit from another device does not win');

  // Two Chromebooks saving different questions both survive.
  const q2 = patch([{ key: key('r2'), value: buildRecoveryAnswerValue({ itemId: 'r2', response: { kind: 'scalar', type: 'literal', value: '4', fields: [] } }), savedAt: 10, writer: 'page-b', revision: 1 }]);
  const both = mergeRecoveryDraftDocument({ existing: landed, patch: q2 });
  assert.equal(answerOf(both, 'r1'), '7');
  assert.equal(answerOf(both, 'r2'), '4');
});

/* ------------------------------------------------------------------ sync */

const answer = (itemId, text) => buildRecoveryAnswerValue({ itemId, fingerprint: `fp-${itemId}`, response: { kind: 'scalar', type: 'literal', value: text, fields: [] } });

test('saves go one at a time; a save made while one is on its way goes next, and the newest is what the server keeps', async () => {
  const server = memoryServer();
  const gates = [];
  let concurrent = 0;
  let peak = 0;
  const sync = createRecoveryAnswerSync({
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    writer: 'page-a',
    flush: async (patch) => {
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      const gate = deferred();
      gates.push(gate);
      await gate.promise;
      const result = await server.flush(patch);
      concurrent -= 1;
      return result;
    },
  });
  sync.save(key('r1'), answer('r1', '5'));
  assert.equal(sync.savedWhere(key('r1')), RECOVERY_ANSWER_SAVED_WHERE.SAVING, 'not "saved" until the server has it');
  sync.save(key('r1'), answer('r1', '7'));
  sync.save(key('r2'), answer('r2', '4'));
  await tick();
  assert.equal(gates.length, 1, 'one save at a time');
  gates[0].resolve();
  await tick(); await tick();
  assert.equal(gates.length, 2, 'the changes made meanwhile go next');
  assert.equal(sync.savedWhere(key('r1')), RECOVERY_ANSWER_SAVED_WHERE.SAVING, 'the first save carried an older revision, so r1 is not yet acknowledged');
  gates[1].resolve();
  await sync.whenIdle();
  assert.equal(peak, 1);
  assert.equal(sync.savedWhere(key('r1')), RECOVERY_ANSWER_SAVED_WHERE.ACCOUNT);
  const stored = Object.fromEntries((await server.read()).map((entry) => [entry.key, entry.value.response.value]));
  assert.deepEqual(stored, { [key('r1')]: '7', [key('r2')]: '4' });
});

test('offline: the answer is kept on this device, says so, and syncs when the connection is back', async () => {
  const server = memoryServer();
  let online = false;
  const timers = manualTimers();
  let persisted = {};
  const sync = createRecoveryAnswerSync({
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    writer: 'page-a',
    scheduler: timers,
    persist: (snapshot) => { persisted = snapshot; },
    flush: (patch) => (online ? server.flush(patch) : Promise.reject(new Error('offline'))),
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    sync.save(key('r1'), answer('r1', '5'));
    assert.equal(await sync.whenIdle(), false);
    assert.equal(sync.savedWhere(key('r1')), RECOVERY_ANSWER_SAVED_WHERE.DEVICE);
    assert.equal(persisted[key('r1')].synced, false, 'this device\'s copy is kept, marked not yet on the server');
    assert.equal(server.get(), null);
    assert.ok(timers.queue.length >= 1, 'a retry is scheduled');

    // The page is closed and reopened offline-then-online: the fallback copy
    // is merged with the server copy and the answer the server lacks is sent.
    sync.stop();
    online = true;
    const reopened = createRecoveryAnswerSync({ studentId: STUDENT, assignmentId: ASSIGNMENT, writer: 'page-b', flush: server.flush });
    reopened.hydrate(persisted);
    await reopened.whenIdle();
    reopened.noteServerCopy(await server.read());
    assert.equal(reopened.savedWhere(key('r1')), RECOVERY_ANSWER_SAVED_WHERE.ACCOUNT);
    assert.equal(readRecoveryDraftEntries(server.get())[0].value.response.value, '5');
  } finally {
    console.warn = warn;
  }
});

test('two Chromebooks: answers saved on one are there on the other, and an edit made after reading them wins even on a slow clock', async () => {
  const server = memoryServer();
  const first = createRecoveryAnswerSync({ studentId: STUDENT, assignmentId: ASSIGNMENT, writer: 'chromebook-1', flush: server.flush, now: () => 1_000_000 });
  first.save(key('r1'), answer('r1', '5'));
  first.save(key('r2'), answer('r2', '4'));
  await first.whenIdle();

  // A fresh browser context: nothing on this device at all.
  const second = createRecoveryAnswerSync({ studentId: STUDENT, assignmentId: ASSIGNMENT, writer: 'chromebook-2', flush: server.flush, now: () => 10 });
  second.hydrate({});
  second.noteServerCopy(await server.read());
  assert.equal(second.entry(key('r1')).value.response.value, '5');
  assert.equal(second.entry(key('r2')).value.response.value, '4');
  assert.equal(second.entry(key('r1')).origin, 'server', 'shown as an answer saved on another device');
  assert.equal(second.savedWhere(key('r2')), RECOVERY_ANSWER_SAVED_WHERE.ACCOUNT);

  // Its clock is far behind the first Chromebook's; the edit still wins.
  second.save(key('r1'), answer('r1', '6'));
  await second.whenIdle();
  const stored = Object.fromEntries(readRecoveryDraftEntries(server.get()).map((entry) => [entry.key, entry.value.response.value]));
  assert.deepEqual(stored, { [key('r1')]: '6', [key('r2')]: '4' });

  // The first Chromebook, returning, takes the newer answer.
  first.noteServerCopy(await server.read());
  assert.equal(first.entry(key('r1')).value.response.value, '6');
});

test('an answer a build before this one kept only on this device is backed up, but never over a newer server answer', async () => {
  const server = memoryServer();
  const other = createRecoveryAnswerSync({ studentId: STUDENT, assignmentId: ASSIGNMENT, writer: 'other', flush: server.flush });
  other.save(key('r1'), answer('r1', '8'));
  await other.whenIdle();
  const device = createRecoveryAnswerSync({ studentId: STUDENT, assignmentId: ASSIGNMENT, writer: 'page', flush: server.flush });
  device.hydrate({
    [key('r1')]: { key: key('r1'), value: answer('r1', '3'), savedAt: 1, writer: 'legacy-device', revision: 1, synced: false },
    [key('r2')]: { key: key('r2'), value: answer('r2', '2'), savedAt: 1, writer: 'legacy-device', revision: 1, synced: false },
  });
  await device.whenIdle();
  const stored = Object.fromEntries(readRecoveryDraftEntries(server.get()).map((entry) => [entry.key, entry.value.response.value]));
  assert.deepEqual(stored, { [key('r1')]: '8', [key('r2')]: '2' });
  assert.equal(device.entry(key('r1')).value.response.value, '8', 'the device takes the server\'s newer answer');
});

test('a copy handed in on open is on this device\'s own fallback at once, even offline', async () => {
  let persisted = {};
  const warn = console.warn;
  console.warn = () => {};
  try {
    const sync = createRecoveryAnswerSync({
      studentId: STUDENT,
      assignmentId: ASSIGNMENT,
      writer: 'page',
      scheduler: manualTimers(),
      persist: (snapshot) => { persisted = snapshot; },
      flush: () => Promise.reject(new Error('offline')),
    });
    sync.hydrate({ [key('r1')]: { key: key('r1'), value: answer('r1', '3'), savedAt: 1, writer: 'legacy-device', revision: 1, synced: false } });
    assert.equal(persisted[key('r1')]?.value.response.value, '3', 'persisted before any save is attempted');
    await sync.whenIdle();
    assert.equal(persisted[key('r1')].synced, false);
    sync.stop();
  } finally {
    console.warn = warn;
  }
});

test('tries used up travel as a bare flag, with the answer dropped', async () => {
  const server = memoryServer();
  const sync = createRecoveryAnswerSync({ studentId: STUDENT, assignmentId: ASSIGNMENT, writer: 'page', flush: server.flush });
  sync.save(key('r1'), answer('r1', '5'));
  sync.save(key('r1'), buildRecoveryAnswerValue({ itemId: 'r1', fingerprint: 'fp-r1', closed: true }));
  await sync.whenIdle();
  const [entry] = readRecoveryDraftEntries(server.get());
  assert.deepEqual(entry.value, { v: 1, itemId: 'r1', fingerprint: 'fp-r1', response: null, closed: true });
});

/* --------------------------------------------------------------- wiring */

test('the runner saves through the drafts, says where, and submits what every device saved', () => {
  const runner = executableSource(readFileSync(new URL('../../src/components/student/SectionRecoveryRunner.jsx', import.meta.url), 'utf8'));
  const assessment = region(runner, 'function AssessmentRunner(', 'export default function SectionRecoveryRunner(', 'assessment runner');
  // A saved answer goes to the server draft, not only to this device.
  const grade = region(assessment, 'const handleGrade = useCallback(', '}, [current, currentClosed', 'assessment grade handler');
  assert.match(grade, /if \(!saveAnswer\(current, response\)\)/);
  assert.doesNotMatch(grade, /writeSaved\(/, 'answers are no longer kept on this device alone');
  // Submit first lands the pending save and reads the server copy, and sends that.
  const submit = region(assessment, 'const submitAll = async () => {', '\n  };', 'submit handler');
  const prepared = submit.indexOf('await drafts.prepareSubmit()');
  const sent = submit.indexOf('submitSectionRecovery(');
  assert.ok(prepared > -1 && sent > prepared, 'the server copy is read before Submit sends anything');
  assert.match(submit, /Object\.entries\(latest\.responses\)/, 'Submit sends the merged answers');
  // "Saved" alone only once the server has it.
  const copy = region(runner, 'export const RECOVERY_SAVED_COPY = Object.freeze({', '});', 'saved copy');
  assert.match(copy, /\[RECOVERY_ANSWER_SAVED_WHERE\.ACCOUNT\]: 'Answer saved to your MathMaster account/);
  assert.match(copy, /\[RECOVERY_ANSWER_SAVED_WHERE\.DEVICE\]: 'Answer saved on this device only — it will sync/);
  assert.doesNotMatch(copy, /\[RECOVERY_ANSWER_SAVED_WHERE\.SAVING\]: 'Answer saved/);
  assert.doesNotMatch(assessment, /Answer saved — you can change it/, 'the old unqualified "saved" is gone');
  const hook = readFileSync(new URL('../../src/components/student/useRecoveryAnswerDrafts.js', import.meta.url), 'utf8');
  assert.match(hook, /flush: \(patch\) => writeRecoveryAnswerDraft\(patch\)/);
  assert.match(hook, /window\.addEventListener\('online', online\)/, 'back online, the pending answers are sent');
});

test('the resume lookup reads past a Recovery draft, which never carries a resume', () => {
  const store = readFileSync(new URL('../../src/platform/persistence/workspaceDraftStore.js', import.meta.url), 'utf8');
  const signature = /export const readLatestWorkspaceResume = async \(studentId, \{ maxAssignments = (\d+) \} = \{\}\)/.exec(store);
  assert.ok(signature && Number(signature[1]) > 1);
  assert.equal(mergeRecoveryDraftDocument({ patch: buildRecoveryDraftPatch({ studentId: STUDENT, assignmentId: ASSIGNMENT }) }).resume, null);
});

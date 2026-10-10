/*
 * THE PRE-#456 MULTIPLE-CHOICE REPORT: ITS DECISIONS, AND THAT IT ONLY READS.
 *
 * Before hotfix #456, issueNextQuestion served a stored (already sanitized)
 * item through the sanitizer again, which hashed each runtime option id a
 * second time, so every option was graded wrong. scripts/lib/pathChoiceIdRegradePlan.mjs
 * decides what can be said about such an answer; scripts/report-path-choice-id-regrade.mjs
 * reads Firestore and lists them. The emulator proof is
 * tests/integration/pathChoiceIdRegradeReport.test.mjs.
 *
 * The pre-fix ids below are LITERALS, produced by the pre-fix mathPath.js
 * itself (git f002678: buildIssuePlan, buildSanitizedQuestion, then
 * buildSanitizedQuestion of the stored item, exactly as issueNextQuestion
 * called them), not by the module under test. The same pre-fix code graded
 * every one of the served options wrong.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';
import {
  PATH_CHOICE_ID_BASIS,
  PATH_CHOICE_ID_CLASS,
  PATH_CHOICE_ID_REASON,
  bankItemChoiceShape,
  classifyChoiceSubmission,
  planStoredSubmission,
  preFixServedChoiceIds,
} from '../../scripts/lib/pathChoiceIdRegradePlan.mjs';
import {
  parseReportArgs,
  runPathChoiceIdRegradeReport,
} from '../../scripts/report-path-choice-id-regrade.mjs';
import { buildPathRecapEntry, serializePathRecapEntry } from '../../functions/shared/pathSessionRecap.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

// --- fixtures -----------------------------------------------------------------

// The author marks opt-2 ("$x = 4$") right: 2(4) + 3 = 11.
const questionLevel = {
  id: 'kaudit-regrade-question-level',
  familyId: 'mathmaster:A.5A:kaudit-regrade',
  prompt: 'Which value of x solves 2x + 3 = 11?',
  choices: [{ id: 'opt-1', label: '$x = 7$' }, { id: 'opt-2', label: '$x = 4$' }, { id: 'opt-3', label: '$x = 3$' }],
  responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'choice', expected: 'opt-2' }],
};

// Relation A is a function, relation B is not.
const fieldLevel = {
  id: 'kaudit-regrade-field-level',
  familyId: 'mathmaster:A.2A:kaudit-regrade',
  prompt: 'Classify each relation.',
  responseFields: [
    { id: 'first', label: 'Relation A', inputProfile: 'choice', expected: 'yes', choices: [{ id: 'yes', label: 'Function' }, { id: 'no', label: 'Not a function' }] },
    { id: 'second', label: 'Relation B', inputProfile: 'choice', expected: 'no', choices: [{ id: 'yes', label: 'Function' }, { id: 'no', label: 'Not a function' }] },
  ],
};

// From the pre-fix code (f002678), questionInstanceId 'qi-kaudit'.
const PRE_FIX = {
  questionLevel: {
    stored: { '$x = 7$': 'choice_0e6b68a0eeb0b34a36916ea031bb', '$x = 4$': 'choice_97f94e422aa5031f55e14783b385', '$x = 3$': 'choice_179ad6fe0d56cc66eebce91148a5' },
    served: { '$x = 7$': 'choice_c54ce277b9790c48bbbc617a64d0', '$x = 4$': 'choice_6a1b43fdc609ac6f2338fadeb4b1', '$x = 3$': 'choice_a1209182eb341342da5e8e92bdc9' },
  },
  fieldLevel: {
    stored: {
      first: { Function: 'choice_f62a81fe9870f044571429c3f4ec', 'Not a function': 'choice_ffd316770e3ee25ddedb107ce155' },
      second: { Function: 'choice_a3bfb301f8609600b8ccf2757208', 'Not a function': 'choice_6966263fa40d191d736f12ddc6bd' },
    },
    served: {
      first: { Function: 'choice_b95f22602281f2c6865135699f30', 'Not a function': 'choice_8300c56b07da642f08d614fa7673' },
      second: { Function: 'choice_c894783faaa6ba1da5d08cbbcd7d', 'Not a function': 'choice_d200580d07bf79aee8cd6bdb1193' },
    },
  },
};

// The stored item exactly as issueNextQuestion writes it (minus session metadata).
const storedItemFor = async (authored) => {
  const plan = await mathPath.buildIssuePlan(authored);
  return {
    ...mathPath.buildSanitizedQuestion(authored, { questionInstanceId: 'qi-kaudit', attemptsAllowed: 1, toolPayload: plan.toolPayload }),
    bankQuestionId: authored.id,
    privateGrading: plan.privateGrading,
  };
};

// --- the old second hash --------------------------------------------------------

test('the stored ids are the ones the pre-fix code stored, and the re-derived served ids are the ones it served', async () => {
  const question = await storedItemFor(questionLevel);
  assert.deepEqual(Object.fromEntries(question.choices.map((choice) => [choice.label, choice.id])), PRE_FIX.questionLevel.stored);
  const derived = preFixServedChoiceIds(question);
  assert.deepEqual(
    Object.fromEntries(derived.map((entry) => [entry.label, [entry.runtimeId, entry.servedId]])),
    Object.fromEntries(Object.entries(PRE_FIX.questionLevel.served).map(([label, served]) => [label, [PRE_FIX.questionLevel.stored[label], served]])),
  );

  const fields = await storedItemFor(fieldLevel);
  const fieldDerived = preFixServedChoiceIds(fields);
  for (const fieldId of ['first', 'second']) {
    const own = fieldDerived.filter((entry) => entry.fieldId === fieldId);
    assert.deepEqual(Object.fromEntries(own.map((entry) => [entry.label, entry.runtimeId])), PRE_FIX.fieldLevel.stored[fieldId]);
    assert.deepEqual(Object.fromEntries(own.map((entry) => [entry.label, entry.servedId])), PRE_FIX.fieldLevel.served[fieldId]);
  }
});

// --- the re-grade -----------------------------------------------------------------

test('a pre-fix served id is mapped back and graded by the fixed grader: the right option would be correct, a wrong one stays wrong', async () => {
  const storedItem = await storedItemFor(questionLevel);
  const right = await classifyChoiceSubmission({ storedItem, responses: { answer: PRE_FIX.questionLevel.served['$x = 4$'] }, recordedIsCorrect: false });
  assert.equal(right.classification, PATH_CHOICE_ID_CLASS.WOULD_BE_CORRECT);
  assert.deepEqual(right.mappings, [{ fieldId: 'answer', via: 'pre-fix-served-id', label: '$x = 4$' }]);
  for (const label of ['$x = 7$', '$x = 3$']) {
    const wrong = await classifyChoiceSubmission({ storedItem, responses: { answer: PRE_FIX.questionLevel.served[label] }, recordedIsCorrect: false });
    assert.equal(wrong.classification, PATH_CHOICE_ID_CLASS.STILL_WRONG, label);
  }
});

test('field-level options: right only when every field maps to its right option', async () => {
  const storedItem = await storedItemFor(fieldLevel);
  const { served } = PRE_FIX.fieldLevel;
  const right = await classifyChoiceSubmission({
    storedItem, recordedIsCorrect: false,
    responses: { first: served.first.Function, second: served.second['Not a function'] },
  });
  assert.equal(right.classification, PATH_CHOICE_ID_CLASS.WOULD_BE_CORRECT);
  const half = await classifyChoiceSubmission({
    storedItem, recordedIsCorrect: false,
    responses: { first: served.first.Function, second: served.second.Function },
  });
  assert.equal(half.classification, PATH_CHOICE_ID_CLASS.STILL_WRONG);
  // One field's pre-fix id offered to the other field is not one of its options.
  const crossed = await classifyChoiceSubmission({
    storedItem, recordedIsCorrect: false,
    responses: { first: served.second.Function, second: served.second['Not a function'] },
  });
  assert.deepEqual([crossed.classification, crossed.reason, crossed.fieldId], [PATH_CHOICE_ID_CLASS.UNDETERMINABLE, PATH_CHOICE_ID_REASON.SUBMITTED_ID_UNRECOGNIZED, 'first']);
});

test('nothing is guessed: missing or inconsistent data is undeterminable, and a right record is left alone', async () => {
  const storedItem = await storedItemFor(questionLevel);
  const rightId = PRE_FIX.questionLevel.served['$x = 4$'];
  const cases = [
    [{ storedItem, responses: { answer: rightId }, recordedIsCorrect: true }, PATH_CHOICE_ID_CLASS.ALREADY_CORRECT, null],
    [{ storedItem, responses: { answer: rightId } }, PATH_CHOICE_ID_CLASS.UNDETERMINABLE, PATH_CHOICE_ID_REASON.RECORDED_VERDICT_MISSING],
    [{ storedItem: null, responses: { answer: rightId }, recordedIsCorrect: false }, PATH_CHOICE_ID_CLASS.UNDETERMINABLE, PATH_CHOICE_ID_REASON.ISSUED_ITEM_NOT_STORED],
    [{ storedItem: { ...storedItem, privateGrading: null }, responses: { answer: rightId }, recordedIsCorrect: false }, PATH_CHOICE_ID_CLASS.UNDETERMINABLE, PATH_CHOICE_ID_REASON.ISSUED_ITEM_NOT_STORED],
    [{ storedItem, responses: null, recordedIsCorrect: false }, PATH_CHOICE_ID_CLASS.UNDETERMINABLE, PATH_CHOICE_ID_REASON.SUBMITTED_RESPONSE_NOT_STORED],
    // The author id and a made-up id are neither the stored nor the served form.
    [{ storedItem, responses: { answer: 'opt-2' }, recordedIsCorrect: false }, PATH_CHOICE_ID_CLASS.UNDETERMINABLE, PATH_CHOICE_ID_REASON.SUBMITTED_ID_UNRECOGNIZED],
    [{ storedItem, responses: { answer: `choice_${'0'.repeat(28)}` }, recordedIsCorrect: false }, PATH_CHOICE_ID_CLASS.UNDETERMINABLE, PATH_CHOICE_ID_REASON.SUBMITTED_ID_UNRECOGNIZED],
    // Served after the fix (the stored id itself): a wrong pick stands…
    [{ storedItem, responses: { answer: PRE_FIX.questionLevel.stored['$x = 7$'] }, recordedIsCorrect: false }, PATH_CHOICE_ID_CLASS.STILL_WRONG, null],
    // …and a right pick recorded wrong is not this bug: say so, do not re-grade it.
    [{ storedItem, responses: { answer: PRE_FIX.questionLevel.stored['$x = 4$'] }, recordedIsCorrect: false }, PATH_CHOICE_ID_CLASS.UNDETERMINABLE, PATH_CHOICE_ID_REASON.CURRENT_GRADER_DISAGREES],
  ];
  for (const [input, classification, reason] of cases) {
    const result = await classifyChoiceSubmission(input);
    assert.deepEqual([result.classification, result.reason], [classification, reason], JSON.stringify(input.responses));
  }
  const typed = await storedItemFor({ ...questionLevel, id: 'kaudit-typed', choices: [], responseFields: [{ id: 'answer', label: 'x', inputProfile: 'number', expected: '4' }] });
  assert.equal((await classifyChoiceSubmission({ storedItem: typed, responses: { answer: '5' }, recordedIsCorrect: false })).classification, PATH_CHOICE_ID_CLASS.NOT_A_CHOICE_ITEM);
});

// --- what the stored records allow ---------------------------------------------------

test('a bank document is a choice item only when every variant it can issue is one', () => {
  const choiceField = { id: 'answer', inputProfile: 'choice' };
  assert.equal(bankItemChoiceShape(questionLevel), 'choice');
  assert.equal(bankItemChoiceShape(fieldLevel), 'choice');
  assert.equal(bankItemChoiceShape({ responseFields: [{ id: 'answer', inputProfile: 'number' }] }), 'not-choice');
  // A choice field with no options anywhere is not answerable by option id.
  assert.equal(bankItemChoiceShape({ responseFields: [choiceField] }), 'not-choice');
  assert.equal(bankItemChoiceShape({ ...questionLevel, pathToolId: 'graphing2' }), 'not-choice');
  assert.equal(bankItemChoiceShape({ ...questionLevel, variants: [{ prompt: 'a' }, { prompt: 'b' }] }), 'choice');
  assert.equal(bankItemChoiceShape({ ...questionLevel, variants: [{ prompt: 'a' }, { responseFields: [{ id: 'answer', inputProfile: 'number' }] }] }), 'unknown');
  assert.equal(bankItemChoiceShape(null), 'unknown');
});

// The recap entry the CURRENT submitPathResponse stores, built by its own
// writer: the student's answer is kept only when it names a stored option.
const recapFor = (storedItem, responses, isCorrect) => JSON.parse(serializePathRecapEntry(buildPathRecapEntry({
  sessionId: 's-1',
  questionInstanceId: 'qi-kaudit',
  questionNumber: 1,
  skillCode: 'A.5A',
  closedAt: 1,
  publicQuestion: mathPath.buildSanitizedQuestion(storedItem, { questionInstanceId: 'qi-kaudit', attemptsAllowed: 1, issued: true }),
  answerKeyQuestion: storedItem,
  privateGrading: storedItem.privateGrading,
  responsePayload: { responses },
  grading: { isCorrect, score: isCorrect ? 1 : 0, attemptNumber: 1, questionFinalized: true },
})));

test('from stored records: a recap with no answer for a choice field is listed; one that names a stored option stands', async () => {
  const storedItem = await storedItemFor(questionLevel);
  const wrong = { result: { grading: { isCorrect: false } } };
  const oldPath = planStoredSubmission({ submission: wrong, recapEntry: recapFor(storedItem, { answer: PRE_FIX.questionLevel.served['$x = 4$'] }, false) });
  assert.deepEqual(
    [oldPath.classification, oldPath.reason, oldPath.basis, oldPath.fieldIds],
    [PATH_CHOICE_ID_CLASS.UNDETERMINABLE, PATH_CHOICE_ID_REASON.SUBMITTED_OPTION_NOT_STORED, PATH_CHOICE_ID_BASIS.RECAP_OPTION_MATCHED_NOTHING, ['answer']],
  );
  const fixedWrong = planStoredSubmission({ submission: wrong, recapEntry: recapFor(storedItem, { answer: PRE_FIX.questionLevel.stored['$x = 7$'] }, false) });
  assert.equal(fixedWrong.classification, PATH_CHOICE_ID_CLASS.STILL_WRONG);
  const right = planStoredSubmission({ submission: { result: { grading: { isCorrect: true } } }, recapEntry: recapFor(storedItem, { answer: PRE_FIX.questionLevel.stored['$x = 4$'] }, true) });
  assert.equal(right.classification, PATH_CHOICE_ID_CLASS.ALREADY_CORRECT);
});

test('from stored records without a recap: listed only for a choice bank item inside the pre-fix window', () => {
  const wrong = { result: { grading: { isCorrect: false } } };
  const listed = planStoredSubmission({ submission: wrong, bankDoc: questionLevel, evidenceFound: true, gradedBeforeFix: true });
  assert.deepEqual([listed.reason, listed.basis], [PATH_CHOICE_ID_REASON.SUBMITTED_OPTION_NOT_STORED, PATH_CHOICE_ID_BASIS.GRADED_BEFORE_FIX]);
  assert.equal(planStoredSubmission({ submission: wrong, bankDoc: questionLevel, evidenceFound: true, gradedBeforeFix: false }).reason, PATH_CHOICE_ID_REASON.GRADED_AFTER_WINDOW);
  assert.equal(planStoredSubmission({ submission: wrong, bankDoc: questionLevel, evidenceFound: false, gradedBeforeFix: true }).reason, PATH_CHOICE_ID_REASON.EVIDENCE_EVENT_NOT_FOUND);
  assert.equal(planStoredSubmission({ submission: wrong, bankDoc: null, evidenceFound: true, gradedBeforeFix: true }).reason, PATH_CHOICE_ID_REASON.ITEM_SHAPE_UNKNOWN);
  assert.equal(planStoredSubmission({ submission: wrong, bankDoc: { responseFields: [{ id: 'a', inputProfile: 'number' }] }, evidenceFound: true, gradedBeforeFix: true }).classification, PATH_CHOICE_ID_CLASS.NOT_A_CHOICE_ITEM);
  assert.equal(planStoredSubmission({ submission: { result: {} }, bankDoc: questionLevel, evidenceFound: true, gradedBeforeFix: true }).reason, PATH_CHOICE_ID_REASON.RECORDED_VERDICT_MISSING);
});

// --- the report against a database that refuses every write ---------------------------

const WRITE_METHODS = new Set(['set', 'update', 'delete', 'create', 'add', 'batch', 'runTransaction', 'bulkWriter', 'recursiveDelete']);

const pick = (data, fields) => {
  if (!fields) return structuredClone(data);
  const out = {};
  for (const field of fields) {
    const parts = field.split('.');
    let source = data;
    for (const part of parts) source = source?.[part];
    if (source === undefined) continue;
    let target = out;
    parts.slice(0, -1).forEach((part) => { target[part] ??= {}; target = target[part]; });
    target[parts.at(-1)] = structuredClone(source);
  }
  return out;
};
const valueAt = (data, field) => field.split('.').reduce((value, part) => value?.[part], data);

// An in-memory Firestore with the read surface the report uses. Every object
// it hands out throws on a write method, and records the attempt.
const readOnlyStore = (documents) => {
  const attempts = [];
  const guard = (target, label) => new Proxy(target, {
    get(object, property) {
      if (WRITE_METHODS.has(property)) {
        return () => { attempts.push(`${label}.${String(property)}`); throw new Error(`write refused: ${label}.${String(property)}`); };
      }
      return object[property];
    },
  });
  const snapshot = (docPath, fields) => {
    const data = documents.get(docPath);
    const id = docPath.split('/').at(-1);
    return { id, exists: data !== undefined, ref: { path: docPath }, data: () => (data === undefined ? undefined : pick(data, fields)) };
  };
  const query = (collectionPath, state = { filters: [], order: null, descending: false, fields: null, limit: Infinity, after: null }) => guard({
    where: (field, op, value) => query(collectionPath, { ...state, filters: [...state.filters, [field, op, value]] }),
    orderBy: (field, direction = 'asc') => query(collectionPath, { ...state, order: field, descending: direction === 'desc' }),
    select: (...fields) => query(collectionPath, { ...state, fields }),
    limit: (count) => query(collectionPath, { ...state, limit: count }),
    startAfter: (doc) => query(collectionPath, { ...state, after: doc }),
    get: async () => {
      const ops = { '==': (a, b) => a === b, '>=': (a, b) => a >= b, '<': (a, b) => a < b };
      let rows = [...documents.keys()]
        .filter((key) => key.startsWith(`${collectionPath}/`) && !key.slice(collectionPath.length + 1).includes('/'))
        .filter((key) => state.filters.every(([field, op, value]) => ops[op](valueAt(documents.get(key), field), value)));
      const sortKey = (key) => [state.order ? valueAt(documents.get(key), state.order) : 0, key];
      rows.sort((a, b) => {
        const [x, y] = [sortKey(a), sortKey(b)];
        return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0;
      });
      if (state.descending) rows.reverse();
      if (state.after) rows = rows.slice(rows.indexOf(state.after.ref.path) + 1);
      return { docs: rows.slice(0, state.limit).map((key) => snapshot(key, state.fields)) };
    },
  }, `query(${collectionPath})`);
  const docRef = (docPath) => guard({
    id: docPath.split('/').at(-1),
    path: docPath,
    collection: (name) => collectionRef(`${docPath}/${name}`),
    get: async () => snapshot(docPath, null),
  }, `doc(${docPath})`);
  const collectionRef = (collectionPath) => guard({
    ...query(collectionPath),
    doc: (id) => docRef(`${collectionPath}/${id}`),
  }, `collection(${collectionPath})`);
  const db = guard({
    collection: (name) => collectionRef(name),
    getAll: async (...args) => {
      const options = args.at(-1)?.fieldMask ? args.pop() : {};
      return args.map((ref) => snapshot(ref.path, options.fieldMask || null));
    },
  }, 'db');
  return { db, attempts };
};

const T = Date.parse('2026-10-05T15:00:00Z');
const evidence = (sessionId, at, questionId, isCorrect) => ({
  eventKey: `ev-${sessionId}`,
  occurredAt: at,
  alignmentKeys: ['texas:A.5A'],
  masteryEvidenceKeys: ['texas:A.5A'],
  questionSnapshot: { questionId, familyId: 'f' },
  performance: { isCorrect, score: isCorrect ? 1 : 0, attemptNumber: 1, status: 'finalized', isMathematicallyIndependent: true },
  source: { kind: 'myMathPath', activitySessionId: sessionId },
});
const submission = (studentId, sessionId, at, isCorrect, recapJson = null) => ({
  studentId, sessionId, submissionId: `sub-${sessionId}`, createdAt: at,
  result: { grading: { isCorrect, score: isCorrect ? 1 : 0, attemptNumber: 1, questionFinalized: true }, feedback: { tone: 'closed' } },
  ...(recapJson ? { recapJson } : {}),
});

const seededStore = async ({ contradiction = false, recapContradiction = false, outside = false } = {}) => {
  const storedItem = await storedItemFor(questionLevel);
  const docs = new Map([
    [`pathQuestionBank/${questionLevel.id}`, questionLevel],
    ['pathQuestionBank/typed', { id: 'typed', responseFields: [{ id: 'answer', inputProfile: 'number', expected: '4' }] }],
    // Pre-hotfix shape (no recap), choice item, recorded wrong: LISTED.
    ['pathSubmissions/a', submission('STU-A', 'sa', T, false)],
    ['grades/STU-A/evidenceEvents/ev-sa', evidence('sa', T, questionLevel.id, false)],
    // The same session's earlier question: matched by time, never by session alone.
    ['grades/STU-A/evidenceEvents/ev-sa-q1', { ...evidence('sa', T - 60000, 'typed', true), eventKey: 'ev-sa-q1' }],
    ['studentMasteryProfiles/STU-A', { profiles: { 'A.5A': { mastery: { estimate: 20, status: 'Developing', confidence: 'Low' } }, 'A.2A': { mastery: { estimate: 90 } } } }],
    [`masteryEvidenceApplications/${mathPath.opaqueId('mastery', 'STU-A', 'ev-sa')}`, { studentId: 'STU-A', eventKey: 'ev-sa', appliedAt: T + 5 }],
    // Pre-hotfix shape, a typed item recorded wrong: never affected.
    ['pathSubmissions/b', submission('STU-B', 'sb', T + 1, false)],
    ['grades/STU-B/evidenceEvents/ev-sb', evidence('sb', T + 1, 'typed', false)],
    // A recap whose choice answer matched nothing: LISTED.
    ['pathSubmissions/c', submission('STU-C', 'sc', T + 2, false, JSON.stringify(recapFor(storedItem, { answer: PRE_FIX.questionLevel.served['$x = 4$'] }, false)))],
    ['grades/STU-C/evidenceEvents/ev-sc', evidence('sc', T + 2, questionLevel.id, false)],
    // A recap naming a stored wrong option: stands.
    ['pathSubmissions/d', submission('STU-D', 'sd', T + 3, false, JSON.stringify(recapFor(storedItem, { answer: PRE_FIX.questionLevel.stored['$x = 7$'] }, false)))],
    // Outside the window: never read.
    ['pathSubmissions/e', submission('STU-E', 'se', T + 10 * 864e5, false)],
    ['grades/STU-E/evidenceEvents/ev-se', evidence('se', T + 10 * 864e5, questionLevel.id, false)],
  ]);
  if (contradiction) {
    docs.set('pathSubmissions/f', submission('STU-F', 'sf', T + 4, true));
    docs.set('grades/STU-F/evidenceEvents/ev-sf', evidence('sf', T + 4, questionLevel.id, true));
  }
  if (recapContradiction) {
    // Right through today's ids, recap and all: a window that reaches past
    // the fix (or lies after #459, where recaps began).
    docs.set('pathSubmissions/f', submission('STU-F', 'sf', T + 4, true, JSON.stringify(recapFor(storedItem, { answer: PRE_FIX.questionLevel.stored['$x = 4$'] }, true))));
  }
  if (outside) {
    // Around a window [T - 1 day, T + 1 day): nearest first, each side.
    const at = (id, time, isCorrect, questionId = questionLevel.id) => {
      docs.set(`pathSubmissions/${id}`, submission(`STU-${id}`, `s${id}`, time, isCorrect));
      docs.set(`grades/STU-${id}/evidenceEvents/ev-s${id}`, evidence(`s${id}`, time, questionId, isCorrect));
    };
    const until = T + 864e5;
    const since = T - 864e5;
    at('g', until, false); // the exclusive end itself is outside
    at('h', until + 1000, false, 'typed'); // not a choice item: not counted
    at('i', until + 2000, true); // the first choice answer recorded right: stop
    at('j', until + 3000, false); // after it: the grader worked, not counted
    at('k', since - 1000, false);
    at('l', since - 2000, false);
    at('m', since - 3000, true); // the last one recorded right before --since
    at('n', since - 4000, false);
  }
  return readOnlyStore(docs);
};

test('the report lists exactly the void answers, with their evidence and mastery, and never writes', async () => {
  const { db, attempts } = await seededStore();
  const report = await runPathChoiceIdRegradeReport({ db, since: T - 864e5, until: T + 864e5, pageSize: 2, now: () => T });
  assert.deepEqual(attempts, []);
  assert.equal(report.readOnly, true);
  assert.equal(report.counts.scanned, 4, 'paged through every submission in the window, and none outside it');
  assert.deepEqual(report.flagged.map((entry) => [entry.submissionDocId, entry.studentId, entry.basis]), [
    ['a', 'STU-A', PATH_CHOICE_ID_BASIS.GRADED_BEFORE_FIX],
    ['c', 'STU-C', PATH_CHOICE_ID_BASIS.RECAP_OPTION_MATCHED_NOTHING],
  ]);
  assert.equal(report.counts.byClass[PATH_CHOICE_ID_CLASS.WOULD_BE_CORRECT], 0);
  assert.equal(report.counts.byClass[PATH_CHOICE_ID_CLASS.NOT_A_CHOICE_ITEM], 1);
  assert.equal(report.counts.byClass[PATH_CHOICE_ID_CLASS.STILL_WRONG], 1);
  const [a] = report.flagged;
  assert.equal(a.skill, 'A.5A');
  assert.equal(a.submittedAt, new Date(T).toISOString());
  assert.equal(a.evidence.path, 'grades/STU-A/evidenceEvents/ev-sa');
  assert.deepEqual(a.mastery, {
    profilePath: 'studentMasteryProfiles/STU-A',
    applied: true,
    appliedAt: new Date(T + 5).toISOString(),
    current: { 'A.5A': { estimate: 20, status: 'Developing', confidence: 'Low' } },
  });
  // No name field anywhere: student ids only.
  assert.doesNotMatch(JSON.stringify(report), /"(firstName|lastName|displayName|studentName)"/);
});

test('a choice item recorded right inside the window disproves it: nothing is listed on the window alone', async () => {
  const { db, attempts } = await seededStore({ contradiction: true });
  const report = await runPathChoiceIdRegradeReport({ db, since: T - 864e5, until: T + 864e5, now: () => T });
  assert.deepEqual(attempts, []);
  assert.equal(report.windowCheck.holds, false);
  assert.equal(report.windowCheck.latestRecordedRightAt, new Date(T + 4).toISOString());
  // The recap's own evidence does not depend on the window, so it stays listed.
  assert.deepEqual(report.flagged.map((entry) => entry.submissionDocId), ['c']);
  assert.equal(report.counts.undeterminableByReason[PATH_CHOICE_ID_REASON.WINDOW_CONTRADICTED], 1);
});

test('a choice item recorded right WITH a recap also disproves the window (one lying after the fix is caught)', async () => {
  const { db, attempts } = await seededStore({ recapContradiction: true });
  const report = await runPathChoiceIdRegradeReport({ db, since: T - 864e5, until: T + 864e5, now: () => T });
  assert.deepEqual(attempts, []);
  assert.equal(report.windowCheck.holds, false);
  assert.equal(report.windowCheck.choiceItemsRecordedRight, 1);
  assert.deepEqual(report.flagged.map((entry) => entry.submissionDocId), ['c']);
});

test('answers a too-narrow window leaves out are counted from each side, out to the nearest right answer, and never listed', async () => {
  const { db, attempts } = await seededStore({ outside: true });
  const since = T - 864e5;
  const until = T + 864e5;
  const report = await runPathChoiceIdRegradeReport({ db, since, until, pageSize: 1, now: () => T });
  assert.deepEqual(attempts, []);
  const { beforeSince, afterUntil } = report.windowCheck;
  assert.equal(report.windowCheck.holds, true);
  assert.deepEqual(
    [afterUntil.recordedWrongChoiceWithoutRecap, afterUntil.submissions.map((entry) => entry.submissionDocId), afterUntil.recordedRightChoiceAt],
    [1, ['g'], new Date(until + 2000).toISOString()],
  );
  assert.deepEqual(
    [beforeSince.recordedWrongChoiceWithoutRecap, beforeSince.submissions.map((entry) => entry.submissionDocId), beforeSince.recordedRightChoiceAt],
    [2, ['k', 'l'], new Date(since - 3000).toISOString()],
  );
  assert.equal(afterUntil.probedTo, new Date(until + 7 * 864e5).toISOString());
  assert.deepEqual(report.flagged.map((entry) => entry.submissionDocId), ['a', 'c'], 'outside answers are counted, not listed');
  assert.equal(report.counts.scanned, 4);
  // --probe-days 0 turns the check off.
  const off = await runPathChoiceIdRegradeReport({ db, since, until, probeDays: 0, now: () => T });
  assert.equal(off.windowCheck.afterUntil.recordedWrongChoiceWithoutRecap, 0);
  assert.equal(off.windowCheck.afterUntil.probedTo, null);
});

test('the store really refuses writes (so the tests above would have caught one)', async () => {
  const { db, attempts } = await seededStore();
  assert.throws(() => db.collection('pathSubmissions').doc('a').set({}), /write refused/);
  assert.throws(() => db.batch(), /write refused/);
  assert.throws(() => db.runTransaction(async () => {}), /write refused/);
  assert.equal(attempts.length, 3);
});

test('the script has no write mode and no Firestore write call', () => {
  const source = executableSource(readFileSync(new URL('../../scripts/report-path-choice-id-regrade.mjs', import.meta.url), 'utf8'))
    // Not Firestore: the read caches are Maps, and app.delete() closes the
    // Admin SDK's channels.
    .replace(/\b(cache|profiles)\.set\(/g, 'map-set(')
    .replace(/\bapp\.delete\(\)/g, 'app-close()');
  assert.doesNotMatch(source, /\.(set|update|delete|create|add|batch|runTransaction|bulkWriter|recursiveDelete)\(/);
  assert.doesNotMatch(source, /--execute|--write|--apply/);
  assert.throws(() => parseReportArgs(['--project', 'p', '--since', '2026-10-01', '--until', '2026-10-08', '--execute']), /no write mode/);
  assert.throws(() => parseReportArgs(['--project', 'p']), /--since and --until are required/);
  const parsed = parseReportArgs(['--project', 'p', '--since', '2026-10-01', '--until', '2026-10-07T21:15:15Z']);
  assert.deepEqual([parsed.since, parsed.until, parsed.probeDays], [Date.parse('2026-10-01T00:00:00Z'), Date.parse('2026-10-07T21:15:15Z'), 7]);
  assert.equal(parseReportArgs(['--project', 'p', '--since', '2026-10-01', '--until', '2026-10-08', '--probe-days', '0']).probeDays, 0);
  assert.throws(() => parseReportArgs(['--project', 'p', '--since', '2026-10-01', '--until', '2026-10-08', '--probe-days', '-1']), /--probe-days/);
});

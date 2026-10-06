// My Math Path stores a Rich Tool item that nests arrays — against a real Firestore.
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-path-rich-storage \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs \
//      --test tests/integration/pathRichToolStorage.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and picks
// this file up as well.)
//
// WHY. Firestore refuses an array directly inside an array. A Data Modeling
// Lab item's points ([[x, y], …]), a Mapping Diagram's arrows, a reflection
// family's expected points and a 3×3 RREF are all shaped that way, so
// `issueNextQuestion`'s transaction failed with a generic "internal" — and
// family selection being deterministic, every retry chose the same family:
// seven TEKS could not issue a first question. A wrong answer with tries left
// rewrote the same item and would have failed the same way. The Admin SDK
// accepts these values offline, so no unit test can see it; this runs the
// real codec and the real `submitPathResponse` against the emulator.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const require = createRequire(import.meta.url);

assert.ok(
  process.env.FIRESTORE_EMULATOR_HOST,
  'FIRESTORE_EMULATOR_HOST must be set — run this through firebase emulators:exec, never against a real project.',
);

const functionsIndex = require(path.join(repo, 'functions/index.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const db = admin.firestore();
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const storage = require(path.join(repo, 'functions/lib/secureItemStorage.js'));
const { BANK_FAMILY_BY_TOOL, RICH_TOOL_ANSWERS, loadBankFamilies } = await import(path.join(repo, 'tests/fixtures/secureRichToolAnswers.mjs'));

const bank = await loadBankFamilies();
const PREFIX = 'pathrich_';
const SKILL = 'A.4(A)';

/** The `currentQuestion` issueNextQuestion builds for a bank family. */
const issuedItem = async (family, { questionInstanceId, attemptsAllowed = 1 } = {}) => {
  const instantiated = await mathPath.instantiateQuestion(family, `${PREFIX}${family.id}`);
  if (!instantiated.question) return null;
  const plan = await mathPath.buildIssuePlan(instantiated.question);
  if (!plan.issuable) return null;
  return {
    ...mathPath.buildSanitizedQuestion(instantiated.question, { toolPayload: plan.toolPayload, questionInstanceId, attemptsAllowed, attemptsUsed: 0 }),
    ...plan.toolPayload,
    questionInstanceId,
    alignmentKey: SKILL,
    bankQuestionId: family.id,
    sourceBankQuestionId: family.id,
    familyId: family.id,
    familyVersion: 1,
    activityRole: 'practice',
    difficultyBand: 3,
    dok: 2,
    skillCode: SKILL,
    alignmentKeys: [`texas:${SKILL}`],
    assessmentContext: { framework: 'course', examStyle: false },
    applicableSupports: [],
    authorizedSupports: [],
    attemptsAllowed,
    attemptsUsed: 0,
    privateGrading: plan.privateGrading,
    privateSupport: null,
  };
};

test('every bank item that nests arrays is stored through the codec, and read back exactly', async () => {
  const nested = [];
  for (const family of bank.filter((entry) => entry.type && entry.active !== false)) {
    // eslint-disable-next-line no-await-in-loop
    const item = await issuedItem(family, { questionInstanceId: `${PREFIX}${family.id}` });
    if (item && storage.holdsNestedArray(item)) nested.push(item);
  }
  assert.ok(nested.length >= 34, `the affected families are all here (${nested.length})`);
  for (const item of nested) {
    const ref = db.collection('pathSessions').doc(`${PREFIX}probe-${item.familyId}`);
    // eslint-disable-next-line no-await-in-loop
    await ref.set({ currentQuestion: storage.storableItem(item) });
    // eslint-disable-next-line no-await-in-loop
    const stored = (await ref.get()).data().currentQuestion;
    assert.deepEqual(storage.readStoredItem(stored), item, item.familyId);
  }
  // The emulator is really checking: the same item, unencoded, is refused.
  await assert.rejects(
    db.collection('pathSessions').doc(`${PREFIX}probe-plain`).set({ currentQuestion: nested[0] }),
    /array value in an array value|nested arrays/i,
  );
});

test('a Data Modeling Lab item: a wrong answer with a try left is written back, then the right one finalizes', async () => {
  const studentId = `${PREFIX}student`;
  const sessionId = `${PREFIX}session`;
  const questionInstanceId = `${PREFIX}qi-lab`;
  const family = bank.find((entry) => entry.id === BANK_FAMILY_BY_TOOL.dataModelingLab);
  const item = await issuedItem(family, { questionInstanceId, attemptsAllowed: 2 });
  assert.ok(storage.holdsNestedArray(item), 'the lab item nests arrays');
  await db.collection('grades').doc(studentId).set({ studentId, classId: `${PREFIX}class`, classPeriod: '3' });
  await db.collection('pathSessions').doc(sessionId).set({
    sessionId, studentId, status: 'active', sessionKind: 'practice', courseId: 'algebra1',
    classId: `${PREFIX}class`, classPeriod: '3', requiredQuestions: 5,
    target: { alignmentKey: `texas:${SKILL}` },
    summary: { completedQuestions: 0, correctQuestions: 0, independentSuccesses: 0 },
    pathState: { counters: { questionsThisSession: 0 } },
    currentSkillCode: SKILL, excursion: null, diagnosing: null, lastDecision: null,
    evidenceBySkill: {}, route: [], createdAt: Date.now(), updatedAt: Date.now(),
    // As issueNextQuestion now writes it.
    currentQuestion: storage.storableItem(item),
  });
  const studentRequest = (data) => ({ auth: { uid: `${studentId}-uid`, token: { role: 'student', studentId } }, data, rawRequest: { headers: {} } });
  const publicTool = { tool: item.tool };

  const wrong = await functionsIndex.submitPathResponse.run(studentRequest({
    sessionId, questionInstanceId, submissionId: `${PREFIX}sub-1`, responsePayload: { raw: RICH_TOOL_ANSWERS.dataModelingLab.wrong(publicTool) },
  }));
  assert.equal(wrong.grading.isCorrect, false);
  assert.equal(wrong.grading.questionFinalized, false, 'a try is left');
  const reopened = (await db.collection('pathSessions').doc(sessionId).get()).data().currentQuestion;
  assert.equal(reopened.attemptsUsed, 1, 'the write-back of the open item landed');
  assert.deepEqual(storage.readStoredItem(reopened).privateGrading, item.privateGrading);

  // Re-issuing the open question returns the full tool, decoded.
  const resumed = await functionsIndex.issueNextQuestion.run(studentRequest({ sessionId }));
  assert.deepEqual(resumed.questionInstance.tool.points, item.tool.points);

  const right = await functionsIndex.submitPathResponse.run(studentRequest({
    sessionId, questionInstanceId, submissionId: `${PREFIX}sub-2`, responsePayload: { raw: RICH_TOOL_ANSWERS.dataModelingLab.answer(publicTool) },
  }));
  assert.equal(right.grading.isCorrect, true, 'graded from the decoded private definition');
  assert.equal(right.grading.questionFinalized, true);
  assert.equal((await db.collection('pathSessions').doc(sessionId).get()).data().currentQuestion, null);
});

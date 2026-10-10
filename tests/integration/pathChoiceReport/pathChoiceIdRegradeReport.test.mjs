// The pre-#456 multiple-choice report, against a real Firestore (the emulator),
// over submissions the real submitPathResponse callable recorded.
//
// HOW TO RUN:
//   npx firebase emulators:exec --only firestore --project mathmaster-path-choice-report \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs --test tests/integration/pathChoiceReport/*.test.mjs"
// or `npm run test:path-choice-report:emulator` (a CI step of its own). It
// lives outside tests/integration/*.test.mjs on purpose: the report reads
// EVERY submission in its window, so another suite's Path answers recorded in
// the same emulator at the same time change what it finds.
//
// THE FIXTURES. Each answer goes through the real submitPathResponse, which
// records exactly what production records:
//   OLD-RIGHT  the option a pre-fix browser held for the RIGHT answer: the stored
//              item sanitized again without `issued`, which is the call
//              issueNextQuestion made before #456 (the pre-fix ids themselves are
//              pinned to the pre-fix code in tests/platform/kGrading_pathChoiceIdRegradeReport.test.mjs).
//   OLD-WRONG  the same, for a wrong option.
//   OLD-BARE   OLD-RIGHT stored the way the code BEFORE the hotfix stored it
//              (f002678 wrote no recapJson; the recap arrived with PR #459).
//   NEW-WRONG  a wrong option served by today's issueNextQuestion.
//   NEW-RIGHT  the right option served by today's issueNextQuestion.
//
// WHAT IS PROVED. The report lists OLD-RIGHT, OLD-WRONG and OLD-BARE and
// nothing else of ours, and calls none of them "would be correct": the stored
// records cannot tell OLD-RIGHT from OLD-WRONG, because no record keeps the
// option a pre-fix student clicked (scripts/lib/pathChoiceIdRegradePlan.mjs).
// NEW-WRONG stands as still-wrong. NEW-RIGHT is recorded just after the window
// ends, as the fix would be: a window reaching it is disproved (no choice item
// could be recorded right under the bug), and one ending before OLD-BARE says
// it left a pre-fix-looking answer out. The report runs on a database handle
// that throws on every write method, and as the CLI.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const require = createRequire(import.meta.url);

assert.ok(
  process.env.FIRESTORE_EMULATOR_HOST,
  'FIRESTORE_EMULATOR_HOST must be set — run this through firebase emulators:exec, never against a real project.',
);

// functions/index.js calls initializeApp() at module load, so it is required
// FIRST and owns the default app.
const functionsIndex = require(path.join(repo, 'functions/index.js'));
const admin = require(path.join(repo, 'functions/node_modules', 'firebase-admin'));
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const secureItems = require(path.join(repo, 'functions/lib/secureItems.js'));
const db = admin.firestore();
const { FieldValue } = admin.firestore;

const { runPathChoiceIdRegradeReport } = await import('../../../scripts/report-path-choice-id-regrade.mjs');
const { PATH_CHOICE_ID_BASIS, PATH_CHOICE_ID_CLASS, preFixServedChoiceIds } = await import('../../../scripts/lib/pathChoiceIdRegradePlan.mjs');

const CLASS_ID = 'path-choice-report-class';
const PREFIX = 'choice-regrade-fixture';
const studentRequest = (studentId, data) => ({
  auth: { uid: `${studentId}-uid`, token: { role: 'student', studentId } },
  data,
  rawRequest: { headers: {} },
});

// 2(4) + 3 = 11: the author's opt-2 is right.
const authored = {
  id: `${PREFIX}-question`,
  active: true,
  alignmentKeys: ['texas:A.5A'],
  courseId: 'algebra1',
  familyId: `mathmaster:A.5A:${PREFIX}`,
  familyVersion: 1,
  questionType: 'response',
  activityRole: 'practice',
  difficultyBand: 3,
  dok: 2,
  calculatorPolicy: 'inherit',
  prompt: 'Which value of x solves 2x + 3 = 11?',
  choices: [{ id: 'opt-1', label: '$x = 7$' }, { id: 'opt-2', label: '$x = 4$' }, { id: 'opt-3', label: '$x = 3$' }],
  responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'choice', expected: 'opt-2' }],
};
const RIGHT = '$x = 4$';
const WRONG = '$x = 7$';

// The `currentQuestion` issueNextQuestion writes for a bank item.
const openItem = async (questionInstanceId) => {
  const plan = await mathPath.buildIssuePlan(authored);
  assert.ok(plan.issuable);
  return secureItems.storableItem({
    ...mathPath.buildSanitizedQuestion(authored, { questionInstanceId, attemptsAllowed: 1, attemptsUsed: 0, toolPayload: plan.toolPayload }),
    bankQuestionId: authored.id,
    sourceBankQuestionId: authored.id,
    generatorParameters: null,
    skillCode: 'A.5A',
    pathRole: 'continue',
    coursePassLevel: 1,
    alignmentKeys: ['texas:A.5A'],
    attemptsAllowed: 1,
    attemptsUsed: 0,
    applicableSupports: [],
    authorizedSupports: [],
    privateGrading: plan.privateGrading,
  });
};

const seedSession = async ({ studentId, sessionId, item }) => {
  await db.recursiveDelete(db.collection('grades').doc(studentId)).catch(() => {});
  const prior = await db.collection('pathSubmissions').where('sessionId', '==', sessionId).get();
  await Promise.all(prior.docs.map((entry) => entry.ref.delete()));
  await db.collection('grades').doc(studentId).set({ studentId, classId: CLASS_ID, classPeriod: '2', assignedTeacherEmail: 'choice-report@example.com' });
  const now = Date.now();
  await db.collection('pathSessions').doc(sessionId).set({
    sessionId, studentId, status: 'active', sessionKind: 'practice', assessmentFramework: null, coursePracticeIntent: null,
    courseId: 'algebra1', classId: CLASS_ID, weekKey: null, weeklySlotKey: null, weeklySlot: null, requiredQuestions: 2,
    coursePassLevel: 1, target: { alignmentKey: 'texas:A.5A' },
    summary: { completedQuestions: 0, correctQuestions: 0, independentSuccesses: 0 },
    pathState: { counters: { questionsThisSession: 0 } }, currentSkillCode: 'A.5A', excursion: null, diagnosing: null,
    lastDecision: null, evidenceBySkill: {}, route: [], createdAt: now, updatedAt: now, currentQuestion: item,
  });
};

// One answer, recorded by the real callable. `served` picks the id the browser
// held: 'pre-fix' re-sanitizes the stored item without `issued`, as the
// pre-#456 issueNextQuestion did; 'fixed' asks today's issueNextQuestion.
const answer = async ({ tag, label, served }) => {
  const studentId = `${PREFIX}-${tag}-student`;
  const sessionId = `${PREFIX}-${tag}-session`;
  const item = await openItem(`qi-${PREFIX}-${tag}`);
  await seedSession({ studentId, sessionId, item });
  let options;
  if (served === 'pre-fix') {
    const stored = secureItems.readStoredItem(item);
    options = mathPath.buildSanitizedQuestion(stored, { questionInstanceId: stored.questionInstanceId, attemptsAllowed: 1 }).choices;
    // The id the planner re-derives is the id that browser held.
    const derived = preFixServedChoiceIds(stored).find((entry) => entry.label === label);
    assert.equal(derived.servedId, options.find((choice) => choice.label === label).id);
  } else {
    options = (await functionsIndex.issueNextQuestion.run(studentRequest(studentId, { sessionId }))).questionInstance.choices;
  }
  const option = options.find((choice) => choice.label === label);
  const submissionId = `sub-${PREFIX}-${tag}`;
  const result = await functionsIndex.submitPathResponse.run(studentRequest(studentId, {
    sessionId, questionInstanceId: `qi-${PREFIX}-${tag}`, submissionId, responsePayload: { responses: { answer: option.id } },
  }));
  return { studentId, sessionId, docId: mathPath.opaqueId('submission', sessionId, submissionId), isCorrect: result.grading.isCorrect };
};

// A database handle that throws on every write method, at every level: the
// report gets nothing else.
const WRITE_METHODS = new Set(['set', 'update', 'delete', 'create', 'add', 'batch', 'runTransaction', 'bulkWriter', 'recursiveDelete', 'bundle']);
const FIRESTORE_TYPES = new Set(['Firestore', 'CollectionReference', 'DocumentReference', 'Query', 'QuerySnapshot', 'QueryDocumentSnapshot', 'DocumentSnapshot']);
const writeAttempts = [];
const targets = new WeakMap();
const unwrap = (value) => (Array.isArray(value) ? value.map(unwrap) : (targets.get(value) || value));
const readOnly = (value) => {
  if (Array.isArray(value)) return value.map(readOnly);
  if (value && typeof value.then === 'function') return value.then(readOnly);
  if (!value || typeof value !== 'object' || !FIRESTORE_TYPES.has(value.constructor?.name)) return value;
  const proxy = new Proxy(value, {
    get(target, property) {
      if (WRITE_METHODS.has(property)) {
        return () => {
          writeAttempts.push(`${target.constructor.name}.${String(property)}`);
          throw new Error(`write refused: ${String(property)}`);
        };
      }
      const member = Reflect.get(target, property, target);
      return typeof member === 'function'
        ? (...args) => readOnly(member.apply(target, args.map(unwrap)))
        : readOnly(member);
    },
  });
  targets.set(proxy, value);
  return proxy;
};

const fixtures = {};
let windowStart;
let windowEnd;

test.before(async () => {
  windowStart = Date.now() - 1000;
  await db.collection('pathQuestionBank').doc(authored.id).set(authored);
  fixtures.oldRight = await answer({ tag: 'old-right', label: RIGHT, served: 'pre-fix' });
  fixtures.oldWrong = await answer({ tag: 'old-wrong', label: WRONG, served: 'pre-fix' });
  fixtures.oldBare = await answer({ tag: 'old-bare', label: RIGHT, served: 'pre-fix' });
  // f002678 wrote `{ studentId, sessionId, submissionId, createdAt, result }`.
  await db.collection('pathSubmissions').doc(fixtures.oldBare.docId).update({ recapJson: FieldValue.delete() });
  fixtures.newWrong = await answer({ tag: 'new-wrong', label: WRONG, served: 'fixed' });
  // The window ends (exclusive) here; NEW-RIGHT is recorded after it.
  windowEnd = Date.now() + 1;
  await new Promise((resolve) => { setTimeout(resolve, 5); });
  fixtures.newRight = await answer({ tag: 'new-right', label: RIGHT, served: 'fixed' });
  for (const fixture of Object.values(fixtures)) {
    fixture.createdAt = (await db.collection('pathSubmissions').doc(fixture.docId).get()).data().createdAt;
  }
  assert.ok(fixtures.newRight.createdAt >= windowEnd);
});

test('the fixtures reproduce the old and new outcomes', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(fixtures).map(([name, fixture]) => [name, fixture.isCorrect])),
    { oldRight: false, oldWrong: false, oldBare: false, newWrong: false, newRight: true },
  );
});

const ours = (entries) => entries.filter((entry) => String(entry.studentId).startsWith(PREFIX));

test('the report lists exactly the answers graded through pre-fix ids, and never claims one would be correct', async () => {
  const report = await runPathChoiceIdRegradeReport({ db: readOnly(db), since: windowStart, until: windowEnd, pageSize: 2 });
  assert.deepEqual(writeAttempts, []);
  const listed = Object.fromEntries(ours(report.flagged).map((entry) => [entry.submissionDocId, entry]));
  assert.deepEqual(Object.keys(listed).sort(), [fixtures.oldRight.docId, fixtures.oldWrong.docId, fixtures.oldBare.docId].sort());
  assert.equal(listed[fixtures.oldRight.docId].basis, PATH_CHOICE_ID_BASIS.RECAP_OPTION_MATCHED_NOTHING);
  assert.equal(listed[fixtures.oldWrong.docId].basis, PATH_CHOICE_ID_BASIS.RECAP_OPTION_MATCHED_NOTHING);
  assert.equal(listed[fixtures.oldBare.docId].basis, PATH_CHOICE_ID_BASIS.GRADED_BEFORE_FIX);
  for (const entry of Object.values(listed)) {
    assert.equal(entry.classification, PATH_CHOICE_ID_CLASS.UNDETERMINABLE, 'the option was never stored, so it is never called right');
    assert.equal(entry.skill, 'A.5A');
    assert.match(entry.evidence.path, new RegExp(`^grades/${entry.studentId}/evidenceEvents/`));
    assert.equal(entry.evidence.isCorrect, false);
    assert.equal(entry.mastery.profilePath, `studentMasteryProfiles/${entry.studentId}`);
  }
  // The evidence each one points at is the event that submission wrote.
  const bare = listed[fixtures.oldBare.docId];
  const event = await db.doc(bare.evidence.path).get();
  assert.equal(event.data().source.activitySessionId, fixtures.oldBare.sessionId);
  assert.equal(new Date(event.data().occurredAt).toISOString(), bare.submittedAt);
  assert.equal(report.windowCheck.holds, true);
  assert.equal(report.windowCheck.afterUntil.recordedRightChoiceAt, new Date(fixtures.newRight.createdAt).toISOString());
});

test('a window that runs past the fix is disproved by a recap-recorded right answer: nothing listed on the window alone', async () => {
  const report = await runPathChoiceIdRegradeReport({ db: readOnly(db), since: windowStart, until: fixtures.newRight.createdAt + 1 });
  assert.deepEqual(writeAttempts, []);
  assert.equal(report.windowCheck.holds, false);
  assert.ok(report.windowCheck.choiceItemsRecordedRight >= 1);
  // The recap-based ones do not rest on the window; OLD-BARE does.
  assert.deepEqual(ours(report.flagged).map((entry) => entry.submissionDocId).sort(), [fixtures.oldRight.docId, fixtures.oldWrong.docId].sort());
});

test('a window that ends too early counts the pre-fix-looking answer it leaves out, and does not list it', async () => {
  const report = await runPathChoiceIdRegradeReport({ db: readOnly(db), since: windowStart, until: fixtures.oldBare.createdAt });
  assert.deepEqual(writeAttempts, []);
  assert.equal(report.windowCheck.holds, true);
  assert.ok(!ours(report.flagged).some((entry) => entry.submissionDocId === fixtures.oldBare.docId));
  assert.ok(report.windowCheck.afterUntil.submissions.some((entry) => entry.submissionDocId === fixtures.oldBare.docId));
  assert.equal(report.windowCheck.afterUntil.recordedRightChoiceAt, new Date(fixtures.newRight.createdAt).toISOString());
});

test('as the CLI: counts on stdout, student ids only in the JSON detail', async () => {
  const out = mkdtempSync(path.join(os.tmpdir(), 'path-choice-report-'));
  try {
    const project = process.env.GCLOUD_PROJECT || 'mathmaster-path-choice-report';
    const { stdout } = await promisify(execFile)(process.execPath, [
      path.join(repo, 'scripts/report-path-choice-id-regrade.mjs'),
      '--project', project,
      '--since', new Date(windowStart).toISOString(),
      '--until', new Date(windowEnd).toISOString(),
      '--out', out,
    ], { cwd: repo, env: process.env });
    assert.match(stdout, /READ ONLY/);
    assert.match(stdout, /LISTED: recorded wrong, verdict void, option not stored\s+\d+/);
    assert.doesNotMatch(stdout, new RegExp(PREFIX, 'i'), 'no student id on stdout');
    const [file] = readdirSync(out);
    const report = JSON.parse(readFileSync(path.join(out, file), 'utf8'));
    assert.equal(ours(report.flagged).length, 3);
    assert.doesNotMatch(stdout, /Window edge/, 'the window [start, end) leaves no pre-fix-looking answer out');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

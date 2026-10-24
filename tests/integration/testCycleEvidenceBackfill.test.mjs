/*
 * THE TEST CYCLE EVIDENCE BACKFILL, AGAINST A REAL FIRESTORE (emulator).
 *
 * scripts/backfill-test-cycle-evidence.mjs runEvidenceBackfill with the Admin SDK.
 * The script has NOT been run against any real project; this is the only place
 * it runs. Pinned: the report (the default) writes nothing; --execute names the
 * misses a Test was graded without, one field on each response, and the targets
 * of an open Corrections plan, leaving every score, verdict, progress counter
 * and other document exactly as they were; a second run writes nothing; a plan
 * already finished is left alone; the confirmation can stop it; and sittings
 * are counted, never written.
 *
 * Run through npm run test:challenge-finish. Ids are prefixed `tceb` because the
 * integration suites share one emulator, and every run here names its
 * assignment, so no other suite's sessions are ever read or written.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run through npm run test:challenge-finish.');

const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'mathmaster-finish-harness' });
const db = admin.firestore();
const { FieldPath } = admin.firestore;
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const secureItems = require(path.join(repo, 'functions/lib/secureItems.js'));
const secureExamItems = require(path.join(repo, 'functions/lib/secureExamItems.js'));
const testCycleLib = require(path.join(repo, 'functions/lib/testCycle.js'));
const { runEvidenceBackfill, serverDeps } = await import(path.join(repo, 'scripts/backfill-test-cycle-evidence.mjs'));
const { buildCorrectionPlan, buildPerformanceProfile } = await import(path.join(repo, 'functions/shared/testCycleCorrections.mjs'));

const PREFIX = 'tceb';
const A1 = `${PREFIX}-A1`;
const A2 = `${PREFIX}-A2`;
const STUDENT = `${PREFIX}-S1`;
const NOW = Date.parse('2026-10-24T15:00:00Z');
const deps = serverDeps();

const SYSTEMS = { pathToolId: 'systemsWorkspace', prompt: 'Solve the system.', mode: 'linear', system: { m1: 1, b1: 2, m2: -1, b2: 8 } };
const RELATION = { pathToolId: 'relationMapping', prompt: 'Give the domain and range.', pairs: [{ x: 1, y: 4 }, { x: 2, y: 5 }, { x: 3, y: 6 }], ask: ['domain', 'range'] };
const BLUEPRINT = {
  title: 'Backfill Test (synthetic)', passingScore: 70,
  targets: [
    { targetId: 'tS', alignmentKey: 'texas:A.5C', label: 'Systems', dok: 2, difficultyBand: 3, questionCount: 1, familyIds: ['fS'] },
    { targetId: 'tR', alignmentKey: 'texas:A.2A', label: 'Domain and range', dok: 2, difficultyBand: 3, questionCount: 1, familyIds: ['fR'] },
  ],
};

const issue = async (question, extra) => {
  const plan = await mathPath.buildIssuePlan(question);
  return secureItems.storableItem({ ...question, ...extra, privateGrading: plan.privateGrading, ...plan.toolPayload });
};

/** A finished Test graded BEFORE the deploy: two misses a detector names today, none carrying evidence. */
const buildOldSession = async ({ examSessionId, assignmentId, stage = 'test', status = 'submitted', studentId = STUDENT, startedAt = Date.parse('2026-10-12T15:30:00Z') }) => {
  const base = {
    examSessionId, studentId, classId: `${PREFIX}-c1`, examType: 'courseTest', status, startedAt,
    courseTest: { assignmentId, cycleStage: stage, recordId: `${assignmentId}__${studentId}` },
  };
  const specs = [
    ['qS', 'tS', 'fS', SYSTEMS, { raw: { classification: 'one', x: 0, y: 2 } }],
    ['qR', 'tR', 'fR', RELATION, { raw: { domain: [4, 5, 6], range: [1, 2, 3] } }],
  ];
  const responses = {};
  const items = {};
  for (const [questionInstanceId, targetId, familyId, question, payload] of specs) {
    // eslint-disable-next-line no-await-in-loop
    const stored = await issue(question, { questionInstanceId, slotId: `${targetId}#1`, targetId, familyId });
    // eslint-disable-next-line no-await-in-loop
    const record = await secureExamItems.buildResponseRecord(stored, { session: base, responsePayload: payload, supportUsage: {}, now: 1000 });
    delete record.grading.misconceptionEvidence;
    responses[questionInstanceId] = record;
    items[questionInstanceId] = { item: stored, draftResponse: null, issuedAt: 1 };
  }
  const session = {
    ...base,
    requiredQuestions: 2,
    issuancePlan: { entries: specs.map(([questionInstanceId, targetId, familyId]) => ({ slotId: `${targetId}#1`, targetId, familyId, questionInstanceId, dok: 2, difficultyBand: 3 })) },
    responses,
  };
  return { session, items };
};

const planFor = (session, assignmentId) => buildCorrectionPlan({
  blueprint: BLUEPRINT,
  profile: buildPerformanceProfile({ blueprint: BLUEPRINT, responses: testCycleLib.responsesForProfile(session) }),
  policy: { mode: 'testCycle' },
  releasedTestGrade: 0,
  assignmentId,
  studentId: STUDENT,
  examSessionId: session.examSessionId,
});

// What Firestore holds has no `undefined` in it; a fixture built in memory may.
const stored = (value) => JSON.parse(JSON.stringify(value));
const write = async ({ session, items }, planDocument = null) => {
  const ref = db.collection('examSessions').doc(session.examSessionId);
  await ref.set(stored(session));
  await Promise.all(Object.entries(items).map(([id, data]) => ref.collection('items').doc(id).set(stored(data))));
  if (planDocument) await db.collection('testCycleCorrectionPlans').doc(session.courseTest.recordId).set(stored(planDocument));
};
const read = async (collection, id) => (await db.collection(collection).doc(id).get()).data();
const run = (options = {}) => runEvidenceBackfill({ db, FieldPath, deps, now: NOW, assignment: A1, ...options });

test('the report writes nothing; execute names the misses and the open plan\'s targets and nothing else; a second run writes nothing', async () => {
  const old = await buildOldSession({ examSessionId: `${PREFIX}-old`, assignmentId: A1 });
  // The student has begun Corrections: one target has progress that must survive.
  const stored = planFor(old.session, A1);
  stored.targets = stored.targets.map((target) => (target.targetId === 'tS' ? { ...target, correctResponses: 1, requiredCorrectResponses: 2 } : target));
  await write(old, { recordId: `${A1}__${STUDENT}`, assignmentId: A1, studentId: STUDENT, plan: stored, activeQuestions: { 'correction-tS': { questionInstanceId: 'open-1', attemptsUsed: 1 } }, updatedAt: 5 });
  // The same Test, graded AFTER the deploy (evidence already there), a Retest, an unfinished Test and a practice test.
  const named = await buildOldSession({ examSessionId: `${PREFIX}-named`, assignmentId: A1, studentId: `${PREFIX}-S2` });
  const namedResponses = {};
  for (const [id, response] of Object.entries(named.session.responses)) {
    namedResponses[id] = { ...response, grading: { ...response.grading, misconceptionEvidence: (await deps.pathMisconceptionEvidence({
      privateGrading: secureItems.readStoredItem(named.items[id].item).privateGrading,
      grading: await secureItems.gradeIssuedItem(named.items[id].item, response.responsePayload),
      raw: await secureItems.rawWorkOf(response.responsePayload),
      responses: null,
      question: secureItems.readStoredItem(named.items[id].item),
    })) } };
  }
  named.session.responses = namedResponses;
  await write(named);
  await write(await buildOldSession({ examSessionId: `${PREFIX}-retest`, assignmentId: A1, stage: 'retest', studentId: `${PREFIX}-S3` }));
  await write(await buildOldSession({ examSessionId: `${PREFIX}-live`, assignmentId: A1, status: 'in_progress', studentId: `${PREFIX}-S4` }));
  await write(await buildOldSession({ examSessionId: `${PREFIX}-other`, assignmentId: A2, studentId: `${PREFIX}-S5` }));
  // One of the days already has a recorded sitting.
  await db.collection('testCycleClassSittings').doc(`${A1}__${PREFIX}-c1__2026-10-12`).set({ assignmentId: A1, classId: `${PREFIX}-c1`, dateKey: '2026-10-12' });

  const before = {
    old: await read('examSessions', `${PREFIX}-old`),
    plan: await read('testCycleCorrectionPlans', `${A1}__${STUDENT}`),
    named: await read('examSessions', `${PREFIX}-named`),
    retest: await read('examSessions', `${PREFIX}-retest`),
    live: await read('examSessions', `${PREFIX}-live`),
    other: await read('examSessions', `${PREFIX}-other`),
  };

  // --- the report -------------------------------------------------------------
  const dry = await run();
  assert.equal(dry.mode, 'report');
  assert.deepEqual(
    [dry.counts.sessionsScanned, dry.counts.wouldName, dry.counts.alreadyNamed, dry.counts.sessionsToWrite, dry.counts.plansToRefresh, dry.counts.targetsToName],
    [3, 4, 2, 2, 1, 2],
    'old Test (2) + Retest (2) would be named; the post-deploy Test already is; only the old Test has a plan',
  );
  assert.equal(dry.counts.sessionsOutOfScope, 1, 'the unfinished Test is not read; another assignment is not asked for');
  assert.deepEqual(dry.codes, { 'system-point-on-one-line-only': 2, 'domain-range-swapped': 2 });
  assert.deepEqual(dry.sessions.map((entry) => entry.examSessionId).sort(), [`${PREFIX}-old`, `${PREFIX}-retest`]);
  // Sittings are counted: two Tests were started on the 12th, in one class: one day, and it has a sitting.
  assert.deepEqual([dry.counts.sittingDays, dry.counts.sittingDaysRecorded, dry.counts.sittingDaysNotRecorded], [1, 1, 0]);
  assert.equal((await db.collection('testCycleClassSittings').get()).docs.filter((doc) => doc.id.startsWith(PREFIX)).length, 1, 'a sitting is never written');
  assert.deepEqual({
    old: await read('examSessions', `${PREFIX}-old`),
    plan: await read('testCycleCorrectionPlans', `${A1}__${STUDENT}`),
    named: await read('examSessions', `${PREFIX}-named`),
    retest: await read('examSessions', `${PREFIX}-retest`),
    live: await read('examSessions', `${PREFIX}-live`),
    other: await read('examSessions', `${PREFIX}-other`),
  }, before, 'the report changed nothing');

  // --- the confirmation can stop it ------------------------------------------------
  const refused = await run({ execute: true, confirm: async () => false });
  assert.equal(refused.aborted, true);
  assert.deepEqual(await read('examSessions', `${PREFIX}-old`), before.old, 'not confirmed, not written');

  // --- execute ----------------------------------------------------------------
  const executed = await run({ execute: true });
  assert.equal(executed.mode, 'execute');
  assert.deepEqual([executed.counts.written, executed.counts.plansRefreshed, executed.counts.failed], [2, 1, 0]);

  const after = await read('examSessions', `${PREFIX}-old`);
  for (const id of ['qS', 'qR']) {
    assert.ok(after.responses[id].grading.misconceptionEvidence, `${id} is named`);
    // The verdict, the score, the work and the snapshot are as they were.
    const { misconceptionEvidence: _evidence, ...grading } = after.responses[id].grading;
    assert.deepEqual(grading, before.old.responses[id].grading);
    assert.deepEqual({ ...after.responses[id], grading: undefined }, { ...before.old.responses[id], grading: undefined });
  }
  assert.deepEqual(
    after.responses.qS.grading.misconceptionEvidence.findings.map((finding) => finding.code), ['system-point-on-one-line-only'],
  );
  assert.equal(after.evidenceBackfilledAt, NOW);
  const { responses: _r1, evidenceBackfilledAt: _e1, ...restAfter } = after;
  const { responses: _r2, ...restBefore } = before.old;
  assert.deepEqual(restAfter, restBefore, 'no other field of the session moved');

  // The open plan names its mistakes and keeps the student's progress and their open question.
  const plan = await read('testCycleCorrectionPlans', `${A1}__${STUDENT}`);
  assert.deepEqual(Object.fromEntries(plan.plan.targets.map((target) => [target.targetId, [target.diagnosis, target.misconception]])), {
    tS: ['misconception', 'system-point-on-one-line-only'],
    tR: ['misconception', 'domain-range-swapped'],
  });
  const begun = plan.plan.targets.find((target) => target.targetId === 'tS');
  assert.deepEqual([begun.correctResponses, begun.requiredCorrectResponses], [1, 2], 'progress is the student\'s');
  assert.deepEqual(plan.activeQuestions, before.plan.activeQuestions, 'and so is the question they have open');
  assert.equal(plan.evidenceBackfilledAt, NOW);
  assert.equal(plan.plan.releasedTestGrade, before.plan.plan.releasedTestGrade);

  // Everything outside the run is as it was.
  assert.deepEqual(await read('examSessions', `${PREFIX}-named`), before.named);
  assert.deepEqual(await read('examSessions', `${PREFIX}-live`), before.live);
  assert.deepEqual(await read('examSessions', `${PREFIX}-other`), before.other, 'another assignment was never asked for');
  assert.ok((await read('examSessions', `${PREFIX}-retest`)).responses.qS.grading.misconceptionEvidence, 'a Retest is named too');
  assert.equal((await read('examSessions', `${PREFIX}-retest`)).responses.qS.grading.isCorrect, false);

  // --- a second run writes nothing ----------------------------------------------
  const again = await run({ execute: true });
  assert.deepEqual([again.counts.wouldName, again.counts.sessionsToWrite, again.counts.written, again.counts.plansRefreshed, again.counts.alreadyNamed], [0, 0, 0, 0, 6]);
  assert.deepEqual(await read('examSessions', `${PREFIX}-old`), after);
  assert.deepEqual(await read('testCycleCorrectionPlans', `${A1}__${STUDENT}`), plan);
});

test('a finished plan is left alone unless asked; a session without its issued items is counted, not written', async () => {
  const assignmentId = `${PREFIX}-A3`;
  const old = await buildOldSession({ examSessionId: `${PREFIX}-done`, assignmentId, studentId: `${PREFIX}-S6` });
  const finished = { ...planFor(old.session, assignmentId), complete: true };
  finished.targets = finished.targets.map((target) => ({ ...target, complete: true, correctResponses: target.requiredCorrectResponses }));
  await write(old, { recordId: `${assignmentId}__${PREFIX}-S6`, assignmentId, studentId: `${PREFIX}-S6`, plan: finished, activeQuestions: {}, updatedAt: 5 });
  const missing = await buildOldSession({ examSessionId: `${PREFIX}-gone`, assignmentId, studentId: `${PREFIX}-S7` });
  await write({ session: missing.session, items: {} });

  const dry = await run({ assignment: assignmentId });
  assert.deepEqual([dry.counts.itemMissing, dry.counts.wouldName, dry.counts.planSkippedComplete, dry.counts.targetsToName], [2, 2, 1, 0]);
  assert.deepEqual([dry.counts.sittingDays, dry.counts.sittingDaysRecorded, dry.counts.sittingDaysNotRecorded], [1, 0, 1], 'one Test day, with no sitting recorded for it');
  const executed = await run({ assignment: assignmentId, execute: true });
  assert.equal(executed.counts.written, 1, 'only the session whose items are held');
  assert.deepEqual((await read('testCycleCorrectionPlans', `${assignmentId}__${PREFIX}-S6`)).plan.targets.map((target) => target.diagnosis), ['standard', 'standard'], 'a finished plan is history');
  assert.equal((await read('examSessions', `${PREFIX}-gone`)).responses.qS.grading.misconceptionEvidence, undefined);

  const widened = await run({ assignment: assignmentId, execute: true, includeComplete: true });
  assert.equal(widened.counts.plansRefreshed, 1);
  assert.deepEqual((await read('testCycleCorrectionPlans', `${assignmentId}__${PREFIX}-S6`)).plan.targets.map((target) => target.diagnosis), ['misconception', 'misconception']);
  // The day had no sitting and still has none: it is reported, never written.
  assert.equal((await db.collection('testCycleClassSittings').doc(`${assignmentId}__${PREFIX}-c1__2026-10-12`).get()).exists, false);
});

test('a correction that lands between the report and the write is kept: each session is re-planned inside the transaction that writes it', async () => {
  const assignmentId = `${PREFIX}-A4`;
  const studentId = `${PREFIX}-S8`;
  const recordId = `${assignmentId}__${studentId}`;
  const old = await buildOldSession({ examSessionId: `${PREFIX}-race`, assignmentId, studentId });
  const built = planFor(old.session, assignmentId);
  await write(old, { recordId, assignmentId, studentId, plan: built, activeQuestions: {}, updatedAt: 5 });

  const open = { 'correction-tR': { questionInstanceId: 'open-2', attemptsUsed: 1 } };
  const executed = await run({
    assignment: assignmentId,
    execute: true,
    // The report is read and the operator has said yes; meanwhile the student answers a correction.
    confirm: async () => {
      const targets = built.targets.map((target) => (target.targetId === 'tR' ? { ...target, correctResponses: 1, requiredCorrectResponses: 2 } : target));
      await db.collection('testCycleCorrectionPlans').doc(recordId).update({ 'plan.targets': targets, activeQuestions: open, updatedAt: 9 });
      return true;
    },
  });
  assert.deepEqual([executed.counts.written, executed.counts.plansRefreshed, executed.counts.failed], [1, 1, 0]);
  const plan = await read('testCycleCorrectionPlans', recordId);
  const answered = plan.plan.targets.find((target) => target.targetId === 'tR');
  assert.deepEqual([answered.correctResponses, answered.requiredCorrectResponses], [1, 2], 'what the student did while the script waited is kept');
  assert.equal(answered.misconception, 'domain-range-swapped', 'and the target is named');
  assert.deepEqual(plan.activeQuestions, open);
  assert.equal(plan.updatedAt, 9, 'the script does not pass itself off as the student\'s activity');
});

test('without an assignment the report reads every course-test session, mine among them, and still writes nothing', async () => {
  const everyone = await runEvidenceBackfill({ db, FieldPath, deps, now: NOW, stages: ['test', 'retest'] });
  assert.equal(everyone.mode, 'report');
  // The three finished Tests of the first scenario and the two of the second are among them.
  assert.ok(everyone.counts.sessionsScanned >= 5, String(everyone.counts.sessionsScanned));
  assert.equal(everyone.counts.written, 0);
  assert.equal(everyone.counts.plansRefreshed, 0);
  // Only the stage asked for is read: A1 has two finished Tests and one finished Retest.
  assert.equal((await run({ assignment: A1, stages: ['test'] })).counts.sessionsScanned, 2);
  assert.equal((await run({ assignment: A1, stages: ['retest'] })).counts.sessionsScanned, 1);
  // A trial run reads only as many sessions as it is asked to.
  assert.equal((await run({ assignment: A1, limit: 1 })).counts.sessionsScanned, 1);
});

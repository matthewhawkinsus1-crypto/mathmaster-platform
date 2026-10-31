/*
 * TC13 (C2-110): GIVING PAST TESTS THE MISTAKE EVIDENCE THEY WERE GRADED WITHOUT.
 *
 * NOT RUN against any real project: this is the plan the script
 * (scripts/backfill-test-cycle-evidence.mjs) makes, tested with the server's own
 * grader and diagnosis on real issued items, and the script's refusals. The
 * emulator test (tests/integration/testCycleEvidenceBackfill.test.mjs) runs the
 * script itself. Pinned here: a response is named only if the server's diagnosis
 * names it today AND today's grader also calls it a miss; no verdict or score is
 * ever part of the plan; a Corrections target is renamed exactly as
 * buildCorrectionPlan would have named it, with its progress left alone.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  BACKFILL_SKIP,
  evidenceCandidateIds,
  namedDiagnosisDetail,
  planPlanRefresh,
  planSessionEvidence,
  sessionIsCandidate,
  sittingIdSeen,
  withPlannedEvidence,
} from '../../scripts/lib/testCycleEvidenceBackfill.mjs';
import { parseArgs, serverDeps } from '../../scripts/backfill-test-cycle-evidence.mjs';
import { getMisconceptionCode, trustedMisconceptionFindings } from '../../functions/shared/misconceptionCodes.mjs';
import { buildCorrectionPlan, buildPerformanceProfile } from '../../functions/shared/testCycleCorrections.mjs';

const require = createRequire(new URL('../../functions/index.js', import.meta.url));
const mathPath = require('./lib/mathPath');
const secureItems = require('./lib/secureItems');
const secureExamItems = require('./lib/secureExamItems');
const testCycleLib = require('./lib/testCycle');

const deps = serverDeps();
const issue = async (question, extra = {}) => {
  const plan = await mathPath.buildIssuePlan(question);
  assert.equal(plan.issuable, true, `the fixture issues as a real item (${plan.reason})`);
  return secureItems.storableItem({ ...question, ...extra, privateGrading: plan.privateGrading, ...plan.toolPayload });
};

const SYSTEMS = { pathToolId: 'systemsWorkspace', prompt: 'Solve the system.', mode: 'linear', system: { m1: 1, b1: 2, m2: -1, b2: 8 } };
const RELATION = { pathToolId: 'relationMapping', prompt: 'Give the domain and range.', pairs: [{ x: 1, y: 4 }, { x: 2, y: 5 }, { x: 3, y: 6 }], ask: ['domain', 'range'] };
const FIELD = { prompt: 'Write the line with slope 2 and y-intercept 3.', responseFields: [{ id: 'answer', label: 'Equation in slope-intercept form', expected: 'y = 2x + 3' }] };
const tool = (raw) => ({ raw });

const BLUEPRINT = {
  title: 'Unit 5 Test (synthetic)', passingScore: 70,
  targets: [
    { targetId: 'tS', alignmentKey: 'texas:A.5C', label: 'Systems', dok: 2, difficultyBand: 3, questionCount: 1, familyIds: ['fS'] },
    { targetId: 'tR', alignmentKey: 'texas:A.2A', label: 'Domain and range', dok: 2, difficultyBand: 3, questionCount: 1, familyIds: ['fR'] },
    { targetId: 'tL', alignmentKey: 'texas:A.3C', label: 'Writing lines', dok: 2, difficultyBand: 2, questionCount: 1, familyIds: ['fL'] },
  ],
};
const SESSION_ID = 'exam-1';

// A Test as it was graded BEFORE the deploy: every response recorded, none with evidence.
const oldTest = async ({ overrides = {} } = {}) => {
  const specs = [
    ['qS', 'tS', 'fS', SYSTEMS, tool({ classification: 'one', x: 0, y: 2 })],
    ['qR', 'tR', 'fR', RELATION, tool({ domain: [4, 5, 6], range: [1, 2, 3] })],
    ['qL', 'tL', 'fL', FIELD, { responses: { answer: '2x - y = -3' } }],
  ];
  const base = { examSessionId: SESSION_ID, studentId: 'S1', classId: 'c1', examType: 'courseTest', status: 'submitted', startedAt: Date.parse('2026-10-12T15:30:00Z'), courseTest: { assignmentId: 'A1', cycleStage: 'test', recordId: 'A1__S1' } };
  const responses = {};
  const items = new Map();
  for (const [questionInstanceId, targetId, familyId, question, payload] of specs) {
    // eslint-disable-next-line no-await-in-loop
    const stored = await issue(question, { questionInstanceId, slotId: `${targetId}#1`, targetId, familyId });
    // eslint-disable-next-line no-await-in-loop
    const record = await secureExamItems.buildResponseRecord(stored, { session: base, responsePayload: payload, supportUsage: {}, now: 1000 });
    assert.ok(record.grading.misconceptionEvidence, `the premise: today's server names ${questionInstanceId}`);
    delete record.grading.misconceptionEvidence;
    responses[questionInstanceId] = record;
    items.set(questionInstanceId, { item: stored, draftResponse: null });
  }
  const session = {
    ...base,
    issuancePlan: { entries: specs.map(([questionInstanceId, targetId, familyId]) => ({ slotId: `${targetId}#1`, targetId, familyId, questionInstanceId, dok: 2, difficultyBand: 3 })) },
    responses,
    ...overrides,
  };
  return { session, items };
};

const planFrom = (session) => buildCorrectionPlan({
  blueprint: BLUEPRINT,
  profile: buildPerformanceProfile({ blueprint: BLUEPRINT, responses: testCycleLib.responsesForProfile(session) }),
  policy: { mode: 'testCycle' },
  releasedTestGrade: 0,
  assignmentId: 'A1',
  studentId: 'S1',
  examSessionId: SESSION_ID,
});

/* --- the evidence ---------------------------------------------------------- */

test('responses graded before the deploy are named exactly as the server names them now', async () => {
  const { session, items } = await oldTest();
  assert.deepEqual(evidenceCandidateIds(session).sort(), ['qL', 'qR', 'qS']);
  const { counts, updates } = await planSessionEvidence({ session, itemsById: items, deps });
  assert.deepEqual(updates.map((update) => [update.questionInstanceId, update.codes]), [
    ['qS', ['system-point-on-one-line-only']],
    ['qR', ['domain-range-swapped']],
    ['qL', ['line-wrong-form-slope-intercept']],
  ]);
  assert.deepEqual([counts.responses, counts.wouldName, counts.nothingProved], [3, 3, 0]);
  // Each is the server's own provenance block, accepted by the registry's trust gate.
  updates.forEach((update) => assert.deepEqual(trustedMisconceptionFindings({ misconceptionEvidence: update.evidence }).map((entry) => entry.code), update.codes));
});

test('the verdict stands: nothing here reads a score to change it, and the input is never mutated', async () => {
  const { session, items } = await oldTest();
  const before = JSON.stringify(session);
  const { updates } = await planSessionEvidence({ session, itemsById: items, deps });
  assert.equal(JSON.stringify(session), before, 'planning changes nothing');
  const planned = withPlannedEvidence(session, updates);
  assert.equal(JSON.stringify(session), before, 'nor does applying it to a copy');
  for (const [questionInstanceId, response] of Object.entries(planned.responses)) {
    const original = session.responses[questionInstanceId];
    assert.deepEqual([response.grading.score, response.grading.isCorrect], [original.grading.score, original.grading.isCorrect], 'the grader\'s verdict');
    const { misconceptionEvidence, ...gradingWithout } = response.grading;
    assert.ok(misconceptionEvidence);
    assert.deepEqual(gradingWithout, original.grading, 'one field is added to grading, nothing else');
    assert.deepEqual({ ...response, grading: undefined }, { ...original, grading: undefined }, 'the rest of the response is as it was');
  }
});

test('what is not a candidate is counted and left alone, and says why', async () => {
  const { session, items } = await oldTest();
  const named = (await planSessionEvidence({ session, itemsById: items, deps })).updates.find((update) => update.questionInstanceId === 'qR').evidence;
  const edited = {
    ...session,
    responses: {
      // Already carries evidence (recorded after the deploy, or by an earlier run).
      qS: { ...session.responses.qS, grading: { ...session.responses.qS.grading, misconceptionEvidence: named } },
      // Right at the time.
      qR: { ...session.responses.qR, grading: { score: 1, isCorrect: true } },
      // Today's grader accepts what was marked a miss: left exactly as it is.
      qL: { ...session.responses.qL, responsePayload: { responses: { answer: 'y = 2x + 3' } } },
      // Never reached, never graded.
      qU: { ...session.responses.qS, questionInstanceId: 'qU', unanswered: true, grading: { score: 0, isCorrect: false } },
      // A miss whose issued item is no longer held.
      qM: { ...session.responses.qS, questionInstanceId: 'qM' },
      // A miss no detector explains.
      qN: { ...session.responses.qR, questionInstanceId: 'qN', responsePayload: tool({ domain: [7], range: [8] }) },
    },
  };
  const moreItems = new Map(items).set('qN', items.get('qR')).set('qU', items.get('qS'));
  // The caller reads issued items only for the misses that could still gain evidence.
  assert.deepEqual(evidenceCandidateIds(edited).sort(), ['qL', 'qM', 'qN']);
  const { counts, updates } = await planSessionEvidence({ session: edited, itemsById: moreItems, deps });
  assert.deepEqual(updates, []);
  assert.deepEqual(
    [counts[BACKFILL_SKIP.ALREADY_NAMED], counts[BACKFILL_SKIP.CORRECT], counts[BACKFILL_SKIP.GRADER_DISAGREES], counts[BACKFILL_SKIP.UNANSWERED], counts[BACKFILL_SKIP.ITEM_MISSING], counts[BACKFILL_SKIP.NOTHING_PROVED]],
    [1, 1, 1, 1, 1, 1],
  );
  assert.equal(counts.responses, 6);
  assert.equal(counts.wouldName, 0);
});

test('a session that throws while it is read is counted as failed and the others go on', async () => {
  const { session, items } = await oldTest();
  const broken = { ...deps, gradeIssuedItem: async (stored, payload) => { if (stored.questionInstanceId === 'qR') throw new Error('grader down'); return deps.gradeIssuedItem(stored, payload); } };
  const { counts, updates } = await planSessionEvidence({ session, itemsById: items, deps: broken });
  assert.deepEqual([counts.failed, updates.map((update) => update.questionInstanceId)], [1, ['qS', 'qL']]);
});

test('only finished Test and Retest sessions of a course Test are candidates', () => {
  const finished = { examType: 'courseTest', status: 'submitted', courseTest: { cycleStage: 'test' } };
  assert.equal(sessionIsCandidate(finished), true);
  assert.equal(sessionIsCandidate({ ...finished, status: 'time_expired' }), true);
  assert.equal(sessionIsCandidate({ ...finished, courseTest: { cycleStage: 'retest' } }), true);
  assert.equal(sessionIsCandidate({ ...finished, courseTest: { cycleStage: 'retest' } }, { stages: ['test'] }), false);
  for (const status of ['not_started', 'in_progress', 'locked_integrity', 'paused']) assert.equal(sessionIsCandidate({ ...finished, status }), false, status);
  assert.equal(sessionIsCandidate({ ...finished, examType: 'digitalSAT' }), false);
  assert.equal(sessionIsCandidate(null), false);
});

/* --- the Corrections plan --------------------------------------------------- */

test('a target is renamed exactly as buildCorrectionPlan would have named it, and nothing else about the plan moves', async () => {
  const { session, items } = await oldTest();
  const stored = planFrom(session);
  assert.deepEqual(stored.targets.map((target) => target.diagnosis), ['standard', 'standard', 'standard'], 'the premise: built before the deploy');
  // The student has begun: progress that must survive.
  const progressed = { ...stored, targets: stored.targets.map((target, index) => (index === 0 ? { ...target, correctResponses: 1, requiredCorrectResponses: 2 } : target)) };
  const { updates } = await planSessionEvidence({ session, itemsById: items, deps });
  const withEvidence = withPlannedEvidence(session, updates);
  const refresh = planPlanRefresh({ planDocument: { plan: progressed }, session: withEvidence });
  assert.deepEqual(refresh.changes.map((change) => [change.targetId, change.code]).sort(), [
    ['tL', 'line-wrong-form-slope-intercept'], ['tR', 'domain-range-swapped'], ['tS', 'system-point-on-one-line-only'],
  ]);
  // The very plan the builder makes from the session once it has the evidence.
  const rebuilt = planFrom(withEvidence);
  refresh.plan.targets.forEach((target) => {
    const expected = rebuilt.targets.find((entry) => entry.correctionId === target.correctionId);
    const progress = progressed.targets.find((entry) => entry.correctionId === target.correctionId);
    assert.deepEqual(
      { ...target, correctResponses: expected.correctResponses, requiredCorrectResponses: expected.requiredCorrectResponses },
      expected,
      `${target.correctionId}: the diagnosis fields are the builder's`,
    );
    assert.equal(target.correctResponses, progress.correctResponses, 'and its progress is the student\'s');
    assert.equal(target.requiredCorrectResponses, progress.requiredCorrectResponses);
  });
  assert.equal(refresh.plan.targets[0].correctResponses, 1);
  // The one sentence is held to the builder's.
  assert.equal(rebuilt.targets[0].diagnosisDetail, namedDiagnosisDetail(getMisconceptionCode(rebuilt.targets[0].misconception)));
  // Everything outside the targets is the stored plan's.
  const { targets: _t1, ...restBefore } = progressed;
  const { targets: _t2, ...restAfter } = refresh.plan;
  assert.deepEqual(restAfter, restBefore);
});

test('a plan is left alone when it is another session\'s, finished, not mistake-targeted, already named, or the evidence is not trusted', async () => {
  const { session, items } = await oldTest();
  const plan = planFrom(session);
  const { updates } = await planSessionEvidence({ session, itemsById: items, deps });
  const planned = withPlannedEvidence(session, updates);
  const skipped = (document, options = {}, from = planned) => planPlanRefresh({ planDocument: document, session: from, ...options });

  assert.equal(skipped({ plan: { ...plan, sourceExamSessionId: 'another-session' } }).skipped, 'otherSession');
  assert.equal(skipped({ plan: { ...plan, strategy: 'standardOnly' } }).skipped, 'notTargeted');
  assert.equal(skipped(null).skipped, 'noPlan');
  const finished = { ...plan, complete: true };
  assert.equal(skipped({ plan: finished }).skipped, 'complete');
  assert.equal(skipped({ plan: { ...plan, targets: plan.targets.map((target) => ({ ...target, complete: true })) } }).skipped, 'complete');
  assert.equal(skipped({ plan: finished }, { includeComplete: true }).changes.length, 3, 'unless asked');
  // Named already, by the builder or by an earlier run: nothing new.
  const named = skipped({ plan: planFrom(planned) });
  assert.deepEqual([named.plan, named.changes, named.skipped], [null, [], 'nothingNew']);
  // No evidence on the session: nothing to name.
  assert.equal(skipped({ plan }, {}, session).skipped, 'nothingNew');
  // Evidence the registry's trust gate refuses (a forged source) names nothing.
  const forged = withPlannedEvidence(session, updates.map((update) => ({ ...update, evidence: { ...update.evidence, source: 'client' } })));
  assert.equal(skipped({ plan }, {}, forged).skipped, 'nothingNew');
});

/* --- the days, and the refusals -------------------------------------------- */

test('a Test day is the school date the Test was started on, per class and assignment', () => {
  const session = { classId: 'c3', startedAt: Date.parse('2026-10-12T15:30:00Z'), courseTest: { assignmentId: 'A1' } };
  assert.equal(sittingIdSeen(session, { timeZone: 'America/Chicago' }), 'A1__c3__2026-10-12');
  // 00:30 UTC on the 13th is still the 12th in Chicago.
  assert.equal(sittingIdSeen({ ...session, startedAt: Date.parse('2026-10-13T00:30:00Z') }, { timeZone: 'America/Chicago' }), 'A1__c3__2026-10-12');
  for (const missing of [{ classId: '' }, { startedAt: null }, { startedAt: 0 }, { courseTest: {} }]) assert.equal(sittingIdSeen({ ...session, ...missing }, { timeZone: 'America/Chicago' }), null, JSON.stringify(missing));
});

test('the script is a read-only report unless told otherwise, and its --yes is for the emulator only', () => {
  const base = ['--project', 'p'];
  assert.throws(() => parseArgs([]), /--project <id> is required\. Nothing has been read\./);
  assert.throws(() => parseArgs(['--execute']), /--project <id> is required/);
  const report = parseArgs(base, {});
  assert.deepEqual([report.execute, report.yes, report.assignment, report.stages, report.includeComplete, report.limit], [false, false, null, ['test', 'retest'], false, null]);
  assert.equal(parseArgs([...base, '--execute'], {}).execute, true);
  // --yes skips the typed project id: only against the emulator, and only with --execute.
  assert.throws(() => parseArgs([...base, '--yes'], { FIRESTORE_EMULATOR_HOST: 'localhost:8700' }), /--yes only makes sense with --execute/);
  assert.throws(() => parseArgs([...base, '--execute', '--yes'], {}), /refusing --yes/);
  assert.equal(parseArgs([...base, '--execute', '--yes'], { FIRESTORE_EMULATOR_HOST: 'localhost:8700' }).yes, true);
  assert.deepEqual(parseArgs([...base, '--stage', 'retest', '--limit', '5', '--assignment', 'A1', '--include-complete'], {}).stages, ['retest']);
  assert.throws(() => parseArgs([...base, '--stage', 'both-ish'], {}), /--stage must be/);
  assert.throws(() => parseArgs([...base, '--nonsense'], {}), /Unknown option/);
  assert.throws(() => parseArgs([...base, '--limit'], {}), /--limit needs a value/);
  assert.equal(parseArgs(['--help']).help, true);
});

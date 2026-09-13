import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  describeFamily, indexApprovedFamilies, targetFamilyCoverage,
} from '../../functions/shared/testCycleBlueprint.mjs';
import { buildSecureIssuancePlan } from '../../functions/shared/testCycleIssuance.mjs';
import { TEST_CYCLE_STAGE, resolveTestCycleStage } from '../../functions/shared/testCycleStages.mjs';
import { region } from './helpers/sourceContract.mjs';

const functionsIndex = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

/*
 * REGRESSIONS FOR THE DEFECTS THE END-TO-END CERTIFICATION FOUND (#224).
 *
 * Each of these was green in the headless suite and broken in a classroom. The
 * emulator certification is what caught them; these are the fast checks that
 * keep them caught, so a future change does not have to wait for an emulator
 * run to learn it has reintroduced one.
 *
 * The theme is worth stating: every one of them passed because the unit
 * fixtures were SIMPLER than production data. A family fixture of
 * `{ id, generator }` exercised a different branch from a real bank question,
 * and a record fixture with a tracker exercised a different branch from the
 * teacher gradebook that has none.
 */

/**
 * A family shaped like the real Path bank: a document id AND a descriptive
 * `familyId` that is deliberately different, because that is what the bank
 * actually contains (`mm_A_2A_v2_bounded-range` vs
 * `mathmaster:A.2A:v2-bounded-range`).
 */
const bankFamily = (id, { authoredFamilyId = `mathmaster:A.5A:${id}`, generative = true, active = true } = {}) => ({
  id,
  active,
  courseId: 'algebra1',
  alignmentKeys: ['texas:A.5A'],
  familyId: authoredFamilyId,
  familyVersion: 3,
  questionType: 'response',
  dok: 2,
  difficultyBand: 3,
  representation: 'symbolic',
  prompt: 'Solve {{a}}x = {{b}}.',
  responseFields: [{ id: 'answer', label: 'x', inputProfile: 'number', expected: '{{x}}' }],
  ...(generative
    ? { generator: { parameters: { a: { type: 'int', min: 2, max: 9 } }, derived: { x: 'b/a' } } }
    : {}),
});

test('a real bank question is indexed by the id a blueprint can address', () => {
  // THE DEFECT: `indexApprovedFamilies` short-circuited on any object carrying
  // `familyId` and `alignmentKeys` and passed it through undescribed. Every
  // real bank question carries both, so `validated` was never computed, came
  // back undefined, and the family was dropped. A blueprint built on the real
  // bank failed preflight with "names no approved, validated generator family"
  // and could not be assigned at all.
  const index = indexApprovedFamilies([bankFamily('mm_A_5A_v2_solve')]);
  assert.equal(index.size, 1, 'a real bank question must survive indexing');
  assert.ok(index.has('mm_A_5A_v2_solve'), 'and be keyed by its document id');
  assert.equal(index.has('mathmaster:A.5A:mm_A_5A_v2_solve'), false,
    'not by the descriptive familyId, which nothing downstream can fetch');

  const described = index.get('mm_A_5A_v2_solve');
  assert.equal(described.validated, true);
  assert.equal(described.active, true);
  assert.equal(described.generative, true);
  assert.equal(described.bankQuestionId, 'mm_A_5A_v2_solve');
  assert.equal(described.authoredFamilyId, 'mathmaster:A.5A:mm_A_5A_v2_solve',
    'the descriptive id is kept as provenance, just not as the key');
});

test('describeFamily prefers the addressable document id over the authored one', () => {
  assert.equal(describeFamily(bankFamily('doc-id')).familyId, 'doc-id');
  // A family with no document id falls back, so descriptor-shaped input still works.
  assert.equal(describeFamily({ familyId: 'only-authored', alignmentKeys: [] }).familyId, 'only-authored');
});

test('an inactive bank family is still excluded', () => {
  // The fix must not have turned the index into "accept everything".
  assert.equal(indexApprovedFamilies([bankFamily('retired', { active: false })]).size, 0);
  assert.equal(indexApprovedFamilies([{ id: 'no-alignment', active: false }]).size, 0);
});

test('coverage and issuance both work against real bank shapes end to end', () => {
  const families = ['f1', 'f2', 'f3'].map((id) => bankFamily(id));
  const blueprint = {
    blueprintId: 'bp',
    targets: [{ targetId: 't1', alignmentKey: 'texas:A.5A', questionCount: 2, anchor: true, familyIds: ['f1', 'f2', 'f3'] }],
  };
  const coverage = targetFamilyCoverage(blueprint, families);
  assert.equal(coverage[0].availableFamilies, 3);
  assert.equal(coverage[0].sufficientForTest, true);
  assert.equal(coverage[0].sufficientForRetest, true);

  const plan = buildSecureIssuancePlan({ blueprint, families, studentId: 'S1', assignmentId: 'A1' });
  assert.equal(plan.requiresLiveGeneration, false);
  for (const entry of plan.entries) {
    // The planner must emit an id the issuing server can fetch from the bank.
    assert.ok(['f1', 'f2', 'f3'].includes(entry.familyId), `unfetchable familyId ${entry.familyId}`);
  }
});

test('a started secure Test proves the Review gate was passed, with no tracker in hand', () => {
  // THE DEFECT: review completion lives in the ordinary assignment tracker,
  // which only the student's own card passes in. Every other reader — the
  // teacher gradebook above all — resolved a stage without it and got "Review"
  // back for a student who had finished the whole cycle.
  const policy = { mode: 'testCycle' };
  const base = { assignmentId: 'A1', studentId: 'S1' };

  const released = resolveTestCycleStage({
    policy,
    record: { ...base, test: { examSessionId: 'e1', state: 'released', rawScore: 88 } },
  });
  assert.equal(released.stage, TEST_CYCLE_STAGE.PASSED, 'no tracker, and still the right stage');

  for (const state of ['inProgress', 'submitted']) {
    const resolved = resolveTestCycleStage({ policy, record: { ...base, test: { examSessionId: 'e1', state } } });
    assert.notEqual(resolved.stage, TEST_CYCLE_STAGE.REVIEW, `a ${state} Test cannot be at the Review stage`);
  }

  // And the gate itself is untouched: an ASSIGNED Test with unfinished Review
  // is still Review, which is the case the gate exists for.
  const gated = resolveTestCycleStage({
    policy,
    record: { ...base, test: { examSessionId: 'e1', state: 'assigned' } },
    reviewProgress: { total: 3, attempted: 1, complete: false },
  });
  assert.equal(gated.stage, TEST_CYCLE_STAGE.REVIEW);
});

test('an emptied secure stage is not a wildcard', () => {
  // THE DEFECT: a reset CLEARS the stage's session id, and "no current session"
  // was read as "anything is current" — so the one session that passed the
  // check was the superseded one the reset had just thrown away.
  const guard = region(
    functionsIndex,
    'async function courseTestSessionIsCurrent(',
    '/** Teacher action: open secure Test sessions',
    'courseTestSessionIsCurrent',
  );
  assert.match(guard, /String\(currentSessionId \|\| ""\) === String\(session\.examSessionId \|\| ""\)/);
  assert.doesNotMatch(guard, /!currentSessionId \|\|/, 'an empty stage must not readmit anything');

  const entry = region(
    functionsIndex,
    'async function assertCourseTestEntryAllowed(',
    'async function teacherOwnedClassIds(',
    'entry guard',
  );
  assert.match(entry, /String\(currentSessionId \|\| ""\) !== String\(session\.examSessionId \|\| ""\)/);
  // And supersession is checked BEFORE the terminal early-return, because a
  // reset force-submits what it replaces: checking "finished?" first showed the
  // student "Exam recorded" for work the reset had discarded.
  assert.ok(
    entry.indexOf('replaced by your teacher') < entry.indexOf('TERMINAL_STATES.has(session.status)'),
    'supersession must be decided before terminal state',
  );
});

test('resetting the Retest leaves a usable Retest behind', () => {
  // THE DEFECT: Reset Test minted its replacement inline, Reset Retest cleared
  // the session id and stopped — so the student sat at "retest pending" with
  // nothing behind it, the same trap waiving corrections used to be.
  const action = region(
    functionsIndex,
    'exports.teacherTestCycleAction = onCall(',
    'exports.listTeacherTestCycleRecords',
    'teacherTestCycleAction',
  );
  assert.match(action, /const resetRetest = action === "resetSecureSession"/);
  assert.match(action, /\|\| resetRetest\) \{\n\s*retest = await ensureRetestSession/);
});

test('the requested class is validated before preflight spends time generating items', () => {
  const assign = region(
    functionsIndex,
    'exports.assignTestCycleSessions = onCall(',
    'exports.preflightTestCycleAssignment',
    'assignTestCycleSessions',
  );
  assert.ok(
    assign.indexOf('not assigned this Test Cycle') < assign.indexOf('runTestCyclePreflight'),
    'a teacher pointing at the wrong class should be told that, not whatever preflight says first',
  );
});

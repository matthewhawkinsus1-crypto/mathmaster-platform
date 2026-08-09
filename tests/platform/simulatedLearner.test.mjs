import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OUTCOME_CONTROLS, SIMULATION_NAMESPACE, STARTING_PROFILES,
  applySimulationOutcome, attemptsForOutcome, buildDebugPackage, createSimulatedLearner,
  evaluateSimulation, explainRouting, forceSkillState, isRoutingMismatch, isSimulatedAssignmentId,
} from '../../src/platform/simulation/simulatedLearner.js';
import { TEXAS_STANDARDS_BY_COURSE } from '../../src/texasStandards.js';

// A real TEKS code that has prior-course vertical alignment, so remediation
// routing has somewhere to send the learner.
const CODE = 'A.5A';
const question = {
  questionId: 'q1',
  type: 'algebra',
  prompt: 'Solve 3x + 6 = 21.',
  dok: 2,
  alignments: [{ framework: 'teks', code: CODE, role: 'primary', evidenceLevel: 'assessed' }],
};

test('the target TEKS exists in the loaded registry', () => {
  const all = Object.values(TEXAS_STANDARDS_BY_COURSE).flat();
  assert.ok(all.some((standard) => standard.code === CODE), `${CODE} must be a real standard for this test to mean anything`);
});

test('a fresh learner has no evidence and routes nowhere', () => {
  const { learner, seedAssignments } = createSimulatedLearner({ profileId: 'fresh', teksCodes: [CODE] });
  assert.deepEqual(seedAssignments, []);
  assert.ok(learner.id.startsWith(`${SIMULATION_NAMESPACE}:`), 'the learner id is namespaced away from real students');
  assert.equal(learner.isSimulated, true);

  const { profile, routing } = evaluateSimulation({ learner, assignments: seedAssignments, question });
  assert.equal(profile.evidenceCount, 0);
  const explanation = explainRouting({ question, profile, routing });
  assert.equal(explanation.decision, 'Gather more evidence');
});

// The whole premise: a seeded starting state must produce the intended
// performance level through the real mastery engine, not by assignment.
test('each starting profile reaches its intended performance level', () => {
  const expected = { struggling: 'didNotMeet', approaching: 'approaches', onLevel: 'meets', advanced: 'masters' };
  for (const [profileId, key] of Object.entries(expected)) {
    const { learner, seedAssignments } = createSimulatedLearner({ profileId, teksCodes: [CODE] });
    const { profile } = evaluateSimulation({ learner, assignments: seedAssignments, question });
    assert.equal(profile.teks[CODE]?.performance?.key, key,
      `${profileId} should score ${key}, got ${profile.teks[CODE]?.performance?.key} (score ${profile.teks[CODE]?.performance?.score})`);
  }
});

test('a struggling learner is routed to a real prerequisite standard', () => {
  const { learner, seedAssignments } = createSimulatedLearner({ profileId: 'struggling', teksCodes: [CODE] });
  const { profile, routing } = evaluateSimulation({ learner, assignments: seedAssignments, question });

  assert.ok(routing.needsSupport.includes(CODE), 'the weak TEKS is flagged');
  assert.ok(routing.supportStandards.length > 0, 'a prior-course standard is offered');

  const explanation = explainRouting({ question, profile, routing });
  assert.equal(explanation.decision, 'Remediation');
  assert.match(explanation.prerequisiteAffected, /^[A-Z0-9.]+/);
  assert.match(explanation.exitCondition, /prerequisite/i);
  // The teacher-facing text must never leak internals.
  assert.ok(!/undefined|NaN|\[object/.test(JSON.stringify(explanation.detectedDifficulty)));
});

test('an advanced learner is not routed to remediation', () => {
  const { learner, seedAssignments } = createSimulatedLearner({ profileId: 'advanced', teksCodes: [CODE] });
  const { profile, routing } = evaluateSimulation({ learner, assignments: seedAssignments, question });
  assert.deepEqual(routing.needsSupport, []);
  assert.equal(explainRouting({ question, profile, routing }).decision, 'Acceleration available');
});

test('outcome controls run through the real attempt policy', () => {
  const { learner } = createSimulatedLearner({ profileId: 'fresh', teksCodes: [CODE] });

  const correct = applySimulationOutcome({ learner, assignmentId: 'a1', questionIndex: 0, outcomeId: 'forceCorrect' });
  assert.equal(correct.learner.gradesByAssignment.a1[0].status, 'correct');
  assert.equal(correct.result.isCorrect, true);
  assert.match(correct.event.detail, /100% credit/);

  // Three misses must exhaust the policy and land on expired, not loop forever.
  const failed = applySimulationOutcome({ learner, assignmentId: 'a1', questionIndex: 1, outcomeId: 'repeatedError' });
  assert.equal(failed.learner.gradesByAssignment.a1[1].status, 'expired');

  const hinted = applySimulationOutcome({ learner, assignmentId: 'a1', questionIndex: 2, outcomeId: 'forceHinted' });
  assert.equal(hinted.learner.gradesByAssignment.a1[2].status, 'correct');
  assert.equal(hinted.learner.gradesByAssignment.a1[2].supportUsage.hintUsed, true,
    'hint usage has to survive into the record or it cannot discount the evidence');

  const skipped = applySimulationOutcome({ learner, assignmentId: 'a1', questionIndex: 3, outcomeId: 'skip' });
  assert.equal(skipped.learner.gradesByAssignment.a1[3].status, 'unattempted');
  assert.match(skipped.event.detail, /unanswered/);
});

test('applying an outcome never mutates the learner passed in', () => {
  const { learner } = createSimulatedLearner({ profileId: 'fresh', teksCodes: [CODE] });
  const before = JSON.stringify(learner);
  applySimulationOutcome({ learner, assignmentId: 'a1', questionIndex: 0, outcomeId: 'forceCorrect' });
  assert.equal(JSON.stringify(learner), before, 'a rewind feature is impossible if state is mutated in place');
});

test('Force Skill Failure changes the routing decision, not just the screen', () => {
  const start = createSimulatedLearner({ profileId: 'onLevel', teksCodes: [CODE] });
  const beforeRouting = evaluateSimulation({ learner: start.learner, assignments: start.seedAssignments, question });
  assert.equal(explainRouting({ question, ...beforeRouting }).decision, 'Continue at grade level');

  const forced = forceSkillState({ learner: start.learner, targetKey: 'didNotMeet', teksCodes: [CODE] });
  const assignments = [...start.seedAssignments, forced.seedAssignment];
  const afterRouting = evaluateSimulation({ learner: forced.learner, assignments, question });
  const after = explainRouting({ question, ...afterRouting });

  assert.equal(after.decision, 'Remediation', 'forcing failure must actually re-route through the engine');
  assert.ok(after.prerequisiteAffected !== 'None');
  assert.equal(forced.event.kind, 'force');
});

test('simulated assignment ids are recognisable so nothing else picks them up', () => {
  const { seedAssignments } = createSimulatedLearner({ profileId: 'onLevel', teksCodes: [CODE] });
  assert.ok(seedAssignments.every((assignment) => isSimulatedAssignmentId(assignment.id)));
  assert.equal(isSimulatedAssignmentId('real-assignment-123'), false);
});

test('the debug package carries the state, not a description of it', () => {
  const { learner, seedAssignments, timeline } = createSimulatedLearner({ profileId: 'struggling', teksCodes: [CODE] });
  const evaluated = evaluateSimulation({ learner, assignments: seedAssignments, question });
  const explanation = explainRouting({ question, ...evaluated });
  const text = buildDebugPackage({
    question, explanation, ...evaluated, timeline,
    teacherFeedback: 'Students should be able to drag the point.',
    feedbackCategory: 'Graph/tool problem',
    expectedRoute: 'Integer Operations',
  });

  assert.match(text, /# MathMaster Teacher Simulator Report/);
  assert.match(text, /Primary TEKS: A\.5A/);
  assert.match(text, /ROUTING MISMATCH/, 'an expectation that does not match must say so');
  assert.match(text, /Students should be able to drag the point/);
  assert.match(text, /## Question JSON/);
  assert.ok(text.includes('"questionId": "q1"'), 'the actual question JSON is embedded');
  assert.match(text, /No student data is involved/);
});

test('a matching expectation is not reported as a mismatch', () => {
  const explanation = { nextActivity: 'A.2A — Prerequisite support' };
  assert.equal(isRoutingMismatch('A.2A', explanation), false);
  assert.equal(isRoutingMismatch('Integer Operations', explanation), true);
  assert.equal(isRoutingMismatch('', explanation), false, 'no expectation is not a mismatch');
});

test('every outcome control has attempts defined and hostile input is safe', () => {
  for (const control of OUTCOME_CONTROLS) {
    assert.doesNotThrow(() => attemptsForOutcome(control.id));
  }
  assert.deepEqual(attemptsForOutcome('nonsense'), []);
  for (const bad of [null, undefined, 42, 'x', []]) {
    assert.doesNotThrow(() => applySimulationOutcome({ learner: bad, assignmentId: 'a', questionIndex: 0, outcomeId: 'forceCorrect' }));
    assert.doesNotThrow(() => evaluateSimulation({ learner: bad, assignments: [], question: null }));
    assert.doesNotThrow(() => explainRouting({ question: bad, profile: null, routing: null }));
  }
  assert.doesNotThrow(() => buildDebugPackage());
  assert.doesNotThrow(() => createSimulatedLearner());
  assert.equal(STARTING_PROFILES.length >= 5, true);
});

test('forcing a second skill state replaces the first instead of averaging with it', () => {
  const start = createSimulatedLearner({ profileId: 'fresh', teksCodes: [CODE] });

  const failed = forceSkillState({ learner: start.learner, targetKey: 'didNotMeet', teksCodes: [CODE] });
  const afterFail = evaluateSimulation({
    learner: failed.learner,
    assignments: [failed.seedAssignment],
    question,
  });
  assert.equal(explainRouting({ question, ...afterFail }).decision, 'Remediation');

  const mastered = forceSkillState({ learner: failed.learner, targetKey: 'masters', teksCodes: [CODE] });
  assert.equal(mastered.seedAssignment.id, failed.seedAssignment.id,
    'the same document id is what lets the second force overwrite the first');
  const afterMastery = evaluateSimulation({
    learner: mastered.learner,
    assignments: [mastered.seedAssignment],
    question,
  });
  assert.equal(explainRouting({ question, ...afterMastery }).decision, 'Acceleration available',
    'a teacher exploring branches must be able to flip the decision back');
});

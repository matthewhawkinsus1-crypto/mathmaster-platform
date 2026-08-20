import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_EXCURSION_DEPTH, PATH_ACTION, beginExcursion, decideNextStep, excursionSatisfied,
  resolveDiagnostic,
} from '../../src/platform/path/pathSessionRouting.js';
import { getSkillGraph, hardPrerequisitesOf, teksSkillId } from '../../src/platform/path/skillGraph.js';

const COURSE = 'algebra1';

// The brief's own example: origin A.5C, remediation target A.5A. Read the
// prerequisites from the graph rather than asserting them, so this file follows
// the reviewed edges instead of a second opinion about them.
const TARGET = teksSkillId('A.5C');
const skillOf = (skillId) => getSkillGraph(COURSE).find((skill) => skill.skillId === skillId);
const HARD_PREREQS = hardPrerequisitesOf(skillOf(TARGET)).map((entry) => entry.skillId);
// Every hard prerequisite of A.5C, and everything THEY require, has to be
// solid before "the prerequisites are intact" is true.
const ALL_HARD_BELOW = (() => {
  const seen = new Set();
  const walk = (skillId) => {
    hardPrerequisitesOf(skillOf(skillId)).forEach((entry) => {
      if (seen.has(entry.skillId)) return;
      seen.add(entry.skillId);
      walk(entry.skillId);
    });
  };
  walk(TARGET);
  return [...seen];
})();

const strong = (mastery = 0.95) => ({ mastery, attempts: 8, recentAccuracy: mastery });
const weak = (mastery = 0.2) => ({ mastery, attempts: 8, recentAccuracy: mastery });

const decide = (overrides = {}) => decideNextStep({
  courseId: COURSE,
  currentSkillId: TARGET,
  requiredQuestions: 5,
  completedQuestions: 1,
  ...overrides,
});

test('the graph gives A.5C a hard prerequisite to route to', () => {
  assert.deepEqual(HARD_PREREQS, [teksSkillId('A.5A')], 'the brief\'s example must match the reviewed graph');
});

// --- 1. Success continues ----------------------------------------------------

test('a student who succeeds on A.5C continues on A.5C', () => {
  const decision = decide({
    outcome: { isCorrect: true },
    masteryBySkill: { [TARGET]: strong(0.6) },
    sessionEvidence: { finalized: 1, missed: 0, consecutiveMisses: 0 },
  });
  assert.equal(decision.action, PATH_ACTION.CONTINUE);
  assert.equal(decision.skillId, TARGET);
});

// --- 2. One miss is not remediation ------------------------------------------

test('a single missed question does not trigger remediation', () => {
  const decision = decide({
    outcome: { isCorrect: false },
    masteryBySkill: { [TARGET]: weak(0.4), [HARD_PREREQS[0]]: weak(0.15) },
    sessionEvidence: { finalized: 1, missed: 1, consecutiveMisses: 1 },
  });
  assert.equal(decision.action, PATH_ACTION.SUPPORTED_RETRY, 'one miss is a slip, not a diagnosis');
  assert.equal(decision.skillId, TARGET);
  assert.match(decision.explanation, /not a pattern/i);
});

// --- 3. Repeated failure with a weak prerequisite routes to it ----------------

test('A.5C repeatedly failed with weak prerequisite evidence routes to the prerequisite', () => {
  const decision = decide({
    outcome: { isCorrect: false },
    masteryBySkill: { [TARGET]: weak(0.3), [HARD_PREREQS[0]]: weak(0.15) },
    sessionEvidence: { finalized: 3, missed: 3, consecutiveMisses: 3 },
  });
  assert.equal(decision.action, PATH_ACTION.DESCEND);
  assert.equal(decision.skillId, HARD_PREREQS[0]);
  // The excursion, written down at the moment the student is sent away.
  assert.equal(decision.excursion.originSkillId, TARGET);
  assert.equal(decision.excursion.targetSkillId, HARD_PREREQS[0]);
  assert.equal(decision.excursion.reason, 'prerequisiteGap');
  assert.equal(decision.excursion.depth, 1);
  assert.equal(decision.excursion.returnThreshold, 0.7);
});

// --- 4. No evidence means diagnose, not descend ------------------------------

test('repeated failure with NO prerequisite evidence diagnoses first', () => {
  const decision = decide({
    outcome: { isCorrect: false },
    // Nothing at all is known about the prerequisites.
    masteryBySkill: { [TARGET]: weak(0.3) },
    sessionEvidence: { finalized: 3, missed: 3, consecutiveMisses: 3 },
  });
  assert.equal(decision.action, PATH_ACTION.DIAGNOSE);
  assert.ok(decision.diagnosing, 'a diagnostic records what it is checking and where it came from');
  assert.equal(decision.diagnosing.originSkillId, TARGET);
  assert.equal(decision.excursion, null, 'a diagnostic is not a descent');
});

test('a diagnostic that passes returns to the origin with support, not deeper', () => {
  const diagnosing = { originSkillId: TARGET, targetSkillId: HARD_PREREQS[0] };
  const decision = resolveDiagnostic({ diagnosing, isCorrect: true });
  assert.equal(decision.action, PATH_ACTION.RETURN_TO_ORIGIN);
  assert.equal(decision.skillId, TARGET);
  assert.match(decision.explanation, /is not what is holding this up/i);
  assert.ok(!/texas:|A\.5A|A\.5C/.test(decision.explanation), 'student-facing text names skills, not codes');
});

test('a diagnostic that fails confirms the gap and descends', () => {
  const diagnosing = { originSkillId: TARGET, targetSkillId: HARD_PREREQS[0] };
  const decision = resolveDiagnostic({ diagnosing, isCorrect: false });
  assert.equal(decision.action, PATH_ACTION.DESCEND);
  assert.equal(decision.skillId, HARD_PREREQS[0]);
  assert.equal(decision.excursion.originSkillId, TARGET);
  assert.equal(decision.excursion.reason, 'diagnosticConfirmedGap');
});

// --- 5. Solid prerequisites mean the work belongs here ------------------------

test('repeated failure with solid prerequisites reteaches in place', () => {
  const masteryBySkill = { [TARGET]: weak(0.3) };
  // Solid all the way down: the planner descends through a weak ancestor, so
  // one solid parent is not enough to prove "the gap is here".
  ALL_HARD_BELOW.forEach((skillId) => { masteryBySkill[skillId] = strong(0.95); });
  const decision = decide({
    outcome: { isCorrect: false },
    masteryBySkill,
    sessionEvidence: { finalized: 3, missed: 3, consecutiveMisses: 3 },
  });
  assert.equal(decision.action, PATH_ACTION.SUPPORTED_RETRY);
  assert.equal(decision.skillId, TARGET, 'do not descend past a solid prerequisite');
  assert.equal(decision.reason, 'prerequisites_intact');
});

// --- 6. The excursion returns ------------------------------------------------

test('when the repair holds, the student bridges back to where they came from', () => {
  const excursion = beginExcursion({ originSkillId: TARGET, targetSkillId: HARD_PREREQS[0], reason: 'prerequisiteGap' });
  const decision = decide({
    currentSkillId: HARD_PREREQS[0],
    excursion,
    outcome: { isCorrect: true },
    masteryBySkill: { [HARD_PREREQS[0]]: strong(0.75) },
    sessionEvidence: { finalized: 2, missed: 0, consecutiveMisses: 0 },
  });
  assert.equal(decision.action, PATH_ACTION.BRIDGE);
  assert.equal(decision.returnTo, TARGET);
});

test('the excursion does not end early', () => {
  const excursion = beginExcursion({ originSkillId: TARGET, targetSkillId: HARD_PREREQS[0], reason: 'prerequisiteGap' });
  assert.equal(excursionSatisfied({ excursion, masteryBySkill: { [HARD_PREREQS[0]]: strong(0.55) } }), false);
  assert.equal(excursionSatisfied({ excursion, masteryBySkill: { [HARD_PREREQS[0]]: strong(0.7) } }), true);
  assert.equal(excursionSatisfied({ excursion, masteryBySkill: {} }), false, 'no evidence is not a pass');
});

test('an unfinished excursion keeps the student on the repair', () => {
  const excursion = beginExcursion({ originSkillId: TARGET, targetSkillId: HARD_PREREQS[0], reason: 'prerequisiteGap' });
  const decision = decide({
    currentSkillId: HARD_PREREQS[0],
    excursion,
    outcome: { isCorrect: true },
    masteryBySkill: { [HARD_PREREQS[0]]: strong(0.5) },
    sessionEvidence: { finalized: 1, missed: 0, consecutiveMisses: 0 },
    // Even with the session's question count met, an open excursion is not
    // abandoned half-way.
    completedQuestions: 9,
  });
  assert.equal(decision.action, PATH_ACTION.CONTINUE);
  assert.equal(decision.skillId, HARD_PREREQS[0]);
});

// --- 7. Descent ends ----------------------------------------------------------

test('failure beyond the allowed depth asks for a teacher, not another level', () => {
  const deep = { ...beginExcursion({ originSkillId: TARGET, targetSkillId: HARD_PREREQS[0], reason: 'prerequisiteGap' }), depth: MAX_EXCURSION_DEPTH };
  const decision = decide({
    currentSkillId: HARD_PREREQS[0],
    excursion: deep,
    outcome: { isCorrect: false },
    masteryBySkill: { [HARD_PREREQS[0]]: weak(0.1) },
    sessionEvidence: { finalized: 4, missed: 4, consecutiveMisses: 4 },
  });
  assert.equal(decision.action, PATH_ACTION.TEACHER_SUPPORT);
  assert.match(decision.explanation, /teacher/i);
});

// --- 8. Mastery and retention -------------------------------------------------

test('a mastered student is extended rather than drilled', () => {
  const decision = decide({
    outcome: { isCorrect: true },
    masteryBySkill: { [TARGET]: strong(0.95) },
    sessionEvidence: { finalized: 2, missed: 0, consecutiveMisses: 0 },
  });
  assert.equal(decision.action, PATH_ACTION.ENRICHMENT);
});

test('a retention concern is verified rather than assumed', () => {
  const decision = decide({
    outcome: { isCorrect: true },
    masteryBySkill: { [TARGET]: strong(0.95) },
    sessionEvidence: { finalized: 2, missed: 0, consecutiveMisses: 0 },
    retentionConcern: true,
  });
  assert.equal(decision.action, PATH_ACTION.VERIFY_RETENTION);
});

// --- 9. Sessions end ----------------------------------------------------------

test('a session with its evidence finishes', () => {
  const decision = decide({
    completedQuestions: 5,
    requiredQuestions: 5,
    outcome: { isCorrect: true },
    masteryBySkill: { [TARGET]: strong(0.6) },
    sessionEvidence: { finalized: 5, missed: 1, consecutiveMisses: 0 },
  });
  assert.equal(decision.action, PATH_ACTION.COMPLETE);
});

test('every decision carries a sentence a teacher can read', () => {
  const cases = [
    { outcome: { isCorrect: true }, masteryBySkill: { [TARGET]: strong(0.6) }, sessionEvidence: { finalized: 1, missed: 0 } },
    { outcome: { isCorrect: false }, masteryBySkill: { [TARGET]: weak() }, sessionEvidence: { finalized: 1, missed: 1 } },
    { outcome: { isCorrect: false }, masteryBySkill: { [TARGET]: weak(), [HARD_PREREQS[0]]: weak(0.1) }, sessionEvidence: { finalized: 3, missed: 3 } },
  ];
  cases.forEach((input) => {
    const decision = decide(input);
    assert.ok(decision.explanation && decision.explanation.length > 15, `${decision.action} needs an explanation`);
    assert.ok(!/_/.test(decision.explanation), `${decision.action} explanation leaks a code: ${decision.explanation}`);
    assert.ok(decision.reason, `${decision.action} needs a machine-readable reason`);
  });
});

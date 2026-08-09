import test from 'node:test';
import assert from 'node:assert/strict';
import { getSkillGraph, hardPrerequisitesOf, teksSkillId } from '../../src/platform/path/skillGraph.js';
import { STRENGTH, canLock } from '../../src/platform/path/prerequisiteStrength.js';
import { listCourseEdges } from '../../src/platform/path/coursePrerequisites.js';
import {
  findHardCycles, validateAllGraphs, validateAuthoredEdges,
  validateCourseGraph, validateRemediationTermination, validateVerticalOverrides,
} from '../../src/platform/path/graphValidation.js';
import {
  REMEDIATION_ACTION, describeBranchImpact, planRemediation, preserveUnrelatedBranches,
} from '../../src/platform/path/remediationPlan.js';
import { explainLock, findOptionRow, listPrerequisiteChoices, simulateInstantMastery } from '../../src/platform/path/graphInspection.js';
import { STATUS, evaluatePrerequisites, getStudentPathOptions } from '../../src/platform/path/recommendationEngine.js';
import { staticMapProvider } from '../../src/platform/path/curriculumPacing.js';

const skill = (course, code) => getSkillGraph(course).find((entry) => entry.skillId === teksSkillId(code));

const evidence = (mastery) => ({ mastery, attempts: 10, recentAccuracy: mastery, evidenceStrength: 1 });

// ---------------------------------------------------------------------------
// The strength model itself
// ---------------------------------------------------------------------------

test('every authored edge declares a real strength, and only hard can lock', () => {
  ['algebra1', 'algebra2'].forEach((courseId) => {
    const edges = listCourseEdges(courseId);
    assert.ok(edges.length > 0, `${courseId} must have authored edges`);
    edges.forEach((edge) => {
      assert.ok([STRENGTH.HARD, STRENGTH.SOFT, STRENGTH.REINFORCEMENT].includes(edge.strength),
        `${edge.from}->${edge.to} has strength ${edge.strength}`);
      assert.equal(canLock(edge.strength), edge.strength === STRENGTH.HARD);
    });
  });
});

test('registry vertical alignment is soft unless deliberately promoted', () => {
  // A2.2A lists seven Algebra I priors. If those were all hard, one weak
  // Algebra I standard would close the first skill of Algebra II.
  const parentFunctions = skill('algebra2', 'A2.2A');
  assert.ok(parentFunctions, 'A2.2A must exist');
  assert.equal(hardPrerequisitesOf(parentFunctions).length, 0,
    'A2.2A must not be gated by the registry relatedness map');

  // The promotions that were made deliberately still gate.
  const solveRational = skill('algebra2', 'A2.6I');
  const hardCodes = hardPrerequisitesOf(solveRational).map((entry) => entry.skillId);
  assert.ok(hardCodes.includes(teksSkillId('A.5A')),
    'solving rational equations genuinely requires solving linear equations');
  assert.ok(!hardCodes.includes(teksSkillId('A.12E')),
    'the rest of the registry list must stay soft');
});

test('a soft prerequisite never locks, a hard one does', () => {
  const target = skill('algebra1', 'A.8A');
  // A.10E (factoring) is soft for A.8A — one of four solution methods.
  const softGap = evaluatePrerequisites(target, { [teksSkillId('A.10E')]: evidence(0.1) });
  assert.equal(softGap.severeGaps.length, 0, 'a soft edge must not produce a severe gap');
  assert.equal(softGap.unmetPrerequisites.length, 0, 'a soft edge must not produce an unmet prerequisite');
  assert.deepEqual(softGap.supportiveShortfall, [teksSkillId('A.10E')]);
  assert.equal(softGap.scaffoldingSuggested, true);

  // A.5A → A.5C is hard.
  const hardGap = evaluatePrerequisites(skill('algebra1', 'A.5C'), { [teksSkillId('A.5A')]: evidence(0.1) });
  assert.deepEqual(hardGap.severeGaps, [teksSkillId('A.5A')]);
});

test('the quadratic-formula case: a weak factorer can still solve quadratics', () => {
  const options = getStudentPathOptions({
    courseId: 'algebra1',
    masteryBySkill: { [teksSkillId('A.10E')]: evidence(0.05) },
    pacing: { currentWindow: 1, windowCount: 1 },
    pacingProvider: staticMapProvider({ windowMap: {}, windowCount: 1 }),
  });
  const row = findOptionRow(options, teksSkillId('A.8A'));
  assert.ok(row, 'A.8A must appear in the options');
  assert.notEqual(row.status, STATUS.LOCKED,
    'factoring is one of four methods; it must not close solving quadratics');
  assert.ok(row.supportingSkillGaps.includes(teksSkillId('A.10E')),
    'the soft gap must still be reported so scaffolding can be offered');
});

// ---------------------------------------------------------------------------
// Graph validation — the checks the brief named
// ---------------------------------------------------------------------------

test('no circular hard dependencies', () => {
  ['algebra1', 'algebra2'].forEach((courseId) => {
    assert.deepEqual(findHardCycles(courseId), [], `${courseId} has a hard cycle`);
  });
});

test('every referenced skill exists and belongs to its course', () => {
  ['algebra1', 'algebra2'].forEach((courseId) => {
    const errors = validateAuthoredEdges(courseId).filter((entry) => entry.severity === 'error');
    assert.deepEqual(errors, [], `${courseId}: ${errors.map((entry) => entry.message).join('; ')}`);
  });
});

test('no process standard is ever a hard prerequisite', () => {
  ['algebra1', 'algebra2'].forEach((courseId) => {
    getSkillGraph(courseId).forEach((entry) => {
      hardPrerequisitesOf(entry).forEach((prereq) => {
        assert.ok(!/^[A-Z0-9.]*\.1[A-G]$/.test(prereq.skillId.replace('teks:', '')),
          `${entry.skillId} is gated by what looks like a process standard: ${prereq.skillId}`);
      });
    });
  });
  assert.deepEqual(validateVerticalOverrides(), [], 'vertical overrides must all be real, non-process edges');
});

test('remediation always terminates, for every skill, from the worst possible state', () => {
  ['algebra1', 'algebra2'].forEach((courseId) => {
    assert.deepEqual(validateRemediationTermination(courseId), [], `${courseId} can loop in remediation`);
  });
});

test('the whole graph validates', () => {
  const result = validateAllGraphs();
  assert.ok(result.ok, result.errors.map((entry) => entry.message).join('\n'));
  ['algebra1', 'algebra2'].forEach((courseId) => {
    assert.equal(validateCourseGraph(courseId).ok, true);
  });
});

// ---------------------------------------------------------------------------
// Diagnose before descend
// ---------------------------------------------------------------------------

test('no evidence about a prerequisite produces a check, not a descent', () => {
  const plan = planRemediation({ courseId: 'algebra1', skillId: teksSkillId('A.5C'), masteryBySkill: {} });
  assert.equal(plan.action, REMEDIATION_ACTION.DIAGNOSE);
  assert.equal(plan.targetSkillId, teksSkillId('A.5A'));
  assert.equal(plan.depth, 0, 'a diagnosis must not descend first');
});

test('solid prerequisites mean the gap is here, not underneath', () => {
  const plan = planRemediation({
    courseId: 'algebra1',
    skillId: teksSkillId('A.5C'),
    masteryBySkill: { [teksSkillId('A.5A')]: evidence(0.95), [teksSkillId('8.8C')]: evidence(0.95) },
  });
  assert.equal(plan.action, REMEDIATION_ACTION.RETEACH_IN_PLACE);
  assert.equal(plan.targetSkillId, teksSkillId('A.5C'));
});

test('real evidence of a real gap descends, and only as far as the evidence goes', () => {
  const plan = planRemediation({
    courseId: 'algebra1',
    skillId: teksSkillId('A.5C'),
    masteryBySkill: {
      [teksSkillId('A.5A')]: evidence(0.2),
      // The grade-8 standard underneath A.5A is fine, so the descent stops.
      [teksSkillId('8.8C')]: evidence(0.95),
    },
  });
  assert.equal(plan.action, REMEDIATION_ACTION.RETEACH_IN_PLACE);
  assert.equal(plan.targetSkillId, teksSkillId('A.5A'), 'the work belongs at the level the evidence points to');
  assert.equal(plan.depth, 1);
  assert.deepEqual(plan.path, [teksSkillId('A.5C'), teksSkillId('A.5A')]);
});

test('descent is bounded and never revisits a skill', () => {
  const allWeak = {};
  getSkillGraph('algebra2').forEach((entry) => {
    allWeak[entry.skillId] = evidence(0.1);
    entry.prerequisites.forEach((prereq) => { allWeak[prereq.skillId] = evidence(0.1); });
  });
  getSkillGraph('algebra2').forEach((entry) => {
    const plan = planRemediation({ courseId: 'algebra2', skillId: entry.skillId, masteryBySkill: allWeak });
    assert.ok(plan.depth <= 3, `${entry.skillId} descended ${plan.depth} levels`);
    assert.equal(new Set(plan.path).size, plan.path.length, `${entry.skillId} revisited a skill`);
  });
});

// ---------------------------------------------------------------------------
// Unrelated branches survive remediation
// ---------------------------------------------------------------------------

test('remediating one skill does not close the rest of the course', () => {
  const impact = describeBranchImpact({ courseId: 'algebra1', skillId: teksSkillId('A.5A') });
  assert.ok(impact.blockedSkillIds.length > 0, 'solving equations must genuinely gate something');
  assert.ok(impact.blockedShare < 0.5,
    `remediating one skill closed ${Math.round(impact.blockedShare * 100)}% of the course`);
  // Exponential and data-analysis work has nothing to do with solving linear
  // equations, and must remain open.
  assert.ok(impact.unrelatedSkillIds.includes(teksSkillId('A.9D')));
  assert.ok(impact.unrelatedSkillIds.includes(teksSkillId('A.4A')));
});

test('the student keeps real options while remediating', () => {
  const options = getStudentPathOptions({
    courseId: 'algebra1',
    masteryBySkill: { [teksSkillId('A.5A')]: evidence(0.2) },
    pacing: { currentWindow: 1, windowCount: 1 },
    pacingProvider: staticMapProvider({ windowMap: {}, windowCount: 1 }),
  });
  const preserved = preserveUnrelatedBranches({ options, courseId: 'algebra1', remediationSkillId: teksSkillId('A.5A') });
  assert.ok(preserved.stillOpen.length > 5, 'a remediating student must still have somewhere to work');
  assert.ok(preserved.stillOpen.every((row) => !preserved.waitingOnRemediation.includes(row.skillId)));
});

// ---------------------------------------------------------------------------
// Simulator graph inspection
// ---------------------------------------------------------------------------

test('"why is this locked?" names the hard skills and separates the merely helpful', () => {
  const explanation = explainLock({
    courseId: 'algebra1',
    skillId: teksSkillId('A.8A'),
    masteryBySkill: { [teksSkillId('A.10E')]: evidence(0.1) },
  });
  assert.equal(explanation.found, true);
  assert.deepEqual(explanation.blocking, [], 'nothing hard is short, so nothing is blocking');
  assert.ok(explanation.helpful.some((entry) => entry.skillId === teksSkillId('A.10E')),
    'factoring must be reported as helpful rather than silently dropped');

  const locked = explainLock({
    courseId: 'algebra1',
    skillId: teksSkillId('A.5C'),
    masteryBySkill: { [teksSkillId('A.5A')]: evidence(0.1) },
  });
  assert.equal(locked.blocking.length, 1);
  assert.equal(locked.blocking[0].skillId, teksSkillId('A.5A'));
  assert.equal(locked.blocking[0].severity, 'severe');
});

test('"what if I instantly master this?" runs the real engine twice', () => {
  const pathInput = {
    courseId: 'algebra1',
    masteryBySkill: { [teksSkillId('A.5A')]: evidence(0.1) },
    pacing: { currentWindow: 1, windowCount: 1 },
    pacingProvider: staticMapProvider({ windowMap: {}, windowCount: 1 }),
  };
  const before = findOptionRow(getStudentPathOptions(pathInput), teksSkillId('A.5C'));
  assert.equal(before.status, STATUS.LOCKED);

  const result = simulateInstantMastery({
    pathInput,
    skillId: teksSkillId('A.5C'),
    prerequisiteSkillId: teksSkillId('A.5A'),
  });
  assert.equal(result.opened, true, result.summary);
  assert.notEqual(result.after.status, STATUS.LOCKED);
  // The counterfactual must not have written anything back.
  assert.equal(pathInput.masteryBySkill[teksSkillId('A.5A')].mastery, 0.1);
});

test('mastering the wrong prerequisite is reported as making no difference', () => {
  const pathInput = {
    courseId: 'algebra1',
    masteryBySkill: { [teksSkillId('A.5A')]: evidence(0.1) },
    pacing: { currentWindow: 1, windowCount: 1 },
    pacingProvider: staticMapProvider({ windowMap: {}, windowCount: 1 }),
  };
  const result = simulateInstantMastery({
    pathInput,
    skillId: teksSkillId('A.5C'),
    prerequisiteSkillId: teksSkillId('A.9D'),
  });
  assert.equal(result.opened, false);
  assert.match(result.summary, /not what is holding it|Status stays/);
});

test('the prerequisite picker puts the gating skills first', () => {
  const choices = listPrerequisiteChoices({ courseId: 'algebra1', skillId: teksSkillId('A.8A') });
  assert.ok(choices.length > 0);
  const strengths = choices.map((entry) => entry.strength);
  const firstSoft = strengths.indexOf(STRENGTH.SOFT);
  const lastHard = strengths.lastIndexOf(STRENGTH.HARD);
  if (firstSoft >= 0 && lastHard >= 0) assert.ok(lastHard < firstSoft, 'hard prerequisites must sort first');
  assert.ok(choices.every((entry) => entry.strengthNote));
});

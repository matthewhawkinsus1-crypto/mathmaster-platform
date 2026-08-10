import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REMEDIATION_ACTION, planCoveredRemediation, planRemediation,
} from '../../src/platform/path/remediationPlan.js';
import { hardPrerequisitesOf, resolveSkillAnywhere } from '../../src/platform/path/skillGraph.js';
import { teksSkillId } from '../../src/platform/path/skillGraph.js';

const COURSE = 'algebra1';
const ORIGIN = teksSkillId('A.5C');

// The mathematics decides where a student should go. Coverage decides whether
// MathMaster can actually take them there. Where those disagree, the route must
// change — but only to a skill the origin genuinely depends on. Substituting a
// merely similar standard is the failure this exists to prevent.

const weakEverywhere = () => {
  // Every hard prerequisite of the origin, marked weak, so the planner routes.
  const origin = resolveSkillAnywhere(ORIGIN);
  const mastery = { [ORIGIN]: { mastery: 0.3, attempts: 4 } };
  hardPrerequisitesOf(origin).forEach((entry) => {
    mastery[entry.skillId] = { mastery: 0.2, attempts: 3 };
  });
  return mastery;
};

test('with everything covered, the covered planner agrees with the plain one', () => {
  const masteryBySkill = weakEverywhere();
  const plain = planRemediation({ courseId: COURSE, skillId: ORIGIN, masteryBySkill });
  const covered = planCoveredRemediation({ courseId: COURSE, skillId: ORIGIN, masteryBySkill, isCovered: () => true });

  assert.equal(covered.action, plain.action);
  assert.equal(covered.targetSkillId, plain.targetSkillId);
  assert.equal(covered.coverageAdjusted, false);
  assert.deepEqual(covered.coverageSkipped, []);
});

test('without a coverage predicate nothing changes, so existing callers are untouched', () => {
  const masteryBySkill = weakEverywhere();
  const covered = planCoveredRemediation({ courseId: COURSE, skillId: ORIGIN, masteryBySkill });
  const plain = planRemediation({ courseId: COURSE, skillId: ORIGIN, masteryBySkill });
  assert.equal(covered.coverageChecked, false);
  assert.equal(covered.action, plain.action);
  assert.equal(covered.targetSkillId, plain.targetSkillId);
});

test('an uncovered target is replaced by a real prerequisite, never by a lookalike', () => {
  const masteryBySkill = weakEverywhere();
  const plain = planRemediation({ courseId: COURSE, skillId: ORIGIN, masteryBySkill });
  assert.ok(plain.targetSkillId, 'the fixture must actually route somewhere');

  // Everything is covered EXCEPT the skill the mathematics picked.
  const covered = planCoveredRemediation({
    courseId: COURSE,
    skillId: ORIGIN,
    masteryBySkill,
    isCovered: (skillId) => skillId !== plain.targetSkillId,
  });

  assert.equal(covered.coverageAdjusted, true);
  assert.notEqual(covered.targetSkillId, plain.targetSkillId);
  assert.ok(covered.coverageSkipped.includes(plain.targetSkillId), 'the skipped skill is named');

  // The replacement must be something the origin actually depends on, directly
  // or through the chain — not merely another standard in the course.
  const origin = resolveSkillAnywhere(ORIGIN);
  const direct = hardPrerequisitesOf(origin).map((entry) => entry.skillId);
  const deeper = direct.flatMap((skillId) => hardPrerequisitesOf(resolveSkillAnywhere(skillId) || {}).map((entry) => entry.skillId));
  assert.ok(
    [...direct, ...deeper].includes(covered.targetSkillId),
    `${covered.targetSkillId} must be in the origin's prerequisite closure`,
  );
});

test('when nothing in the closure has content, the student stays put and the gap is named', () => {
  const masteryBySkill = weakEverywhere();
  const covered = planCoveredRemediation({
    courseId: COURSE,
    skillId: ORIGIN,
    masteryBySkill,
    isCovered: () => false,
  });

  assert.equal(covered.action, REMEDIATION_ACTION.NO_COVERED_ROUTE);
  assert.equal(covered.targetSkillId, null, 'routing nowhere beats routing into an error');
  assert.ok(covered.coverageSkipped.length > 0, 'the skills that could not be used are reported');
  assert.match(covered.explanation, /no practice content/);
  // Distinct from "the prerequisites were fine" — that would be a lie here.
  assert.notEqual(covered.action, REMEDIATION_ACTION.RETEACH_IN_PLACE);
});

test('a plan that was not going to route anywhere is left alone', () => {
  // Every prerequisite solid: the planner reteaches in place, and coverage of
  // other skills is irrelevant to that.
  const origin = resolveSkillAnywhere(ORIGIN);
  const masteryBySkill = { [ORIGIN]: { mastery: 0.4, attempts: 4 } };
  hardPrerequisitesOf(origin).forEach((entry) => {
    masteryBySkill[entry.skillId] = { mastery: 0.95, attempts: 6 };
  });

  const covered = planCoveredRemediation({ courseId: COURSE, skillId: ORIGIN, masteryBySkill, isCovered: () => false });
  assert.equal(covered.action, REMEDIATION_ACTION.RETEACH_IN_PLACE);
  assert.equal(covered.coverageAdjusted, false);
});

test('the replacement action follows the evidence at the replacement', () => {
  // A skill nobody has evidence for is a short check, not a unit of
  // remediation, even when it was reached by a coverage detour.
  const masteryBySkill = weakEverywhere();
  const plain = planRemediation({ courseId: COURSE, skillId: ORIGIN, masteryBySkill });
  const covered = planCoveredRemediation({
    courseId: COURSE,
    skillId: ORIGIN,
    masteryBySkill,
    isCovered: (skillId) => skillId !== plain.targetSkillId,
  });
  assert.ok(
    [REMEDIATION_ACTION.DESCEND, REMEDIATION_ACTION.DIAGNOSE].includes(covered.action),
    `unexpected action ${covered.action}`,
  );
});

/*
 * NO STUDENT LOSES, ON DEPLOY DAY, A MASTERED STATUS OR AN UNLOCK THEY HAVE ON
 * MAIN (coordinator decision, push D review of PR #459).
 *
 * The server profile counts EVERY attempt as an event, so "right on the second
 * try" reads 50% where main's assignment record reads 100%. Fed alone to the
 * Path engine it took Mastered away overnight and locked the skills built on
 * it. The engine now reads the MORE FAVOURABLE of the two per skill
 * (masteryAdapter.js favourableMasteryBySkill), and Path-only evidence, which
 * main never saw, can credit a skill but never lock one. The wheel and the
 * weekly planner keep the server rule — the divergence the handoff documents.
 *
 * Algebra I: A.3A is a hard prerequisite of A.2B, A.2C and A.3B.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStudentMasteryProfile } from '../../src/masteryEngine.js';
import { buildMasteryBySkill, buildMasteryBySkillForStudent } from '../../src/platform/path/masteryAdapter.js';
import { STATUS, getStudentPathOptions } from '../../src/platform/path/recommendationEngine.js';
import { getSkillGraph, teksSkillId } from '../../src/platform/path/skillGraph.js';
import { sequenceProvider } from '../../src/platform/path/curriculumPacing.js';
import { buildPathMap } from '../../src/platform/path/pathMap.js';
import { buildTopicBrowser } from '../../src/platform/path/topicBrowser.js';
import { buildUnifiedMasteryProfiles } from '../../src/platform/mastery/unifiedMastery.js';
import { MASTERY_STATUS } from '../../functions/shared/masteryRule.mjs';
import { studentWithAssignmentWork } from './helpers/assignmentWork.mjs';

const NOW = Date.parse('2026-10-07T15:00:00Z');
const CODE = 'A.3A';
const DEPENDENTS = ['A.2B', 'A.2C', 'A.3B'];
const skills = getSkillGraph('algebra1');
const optionsWith = (masteryBySkill) => getStudentPathOptions({
  courseId: 'algebra1',
  masteryBySkill,
  pacing: { windowIndex: 3, windowCount: 8, accelerationRadius: 1 },
  pacingProvider: sequenceProvider({ skills, windowCount: 8 }),
});
const statusOf = (options, code) => Object.keys(options)
  .find((key) => Array.isArray(options[key]) && options[key].some((row) => row.skillId === teksSkillId(code))) || null;
const outcome = (options) => Object.fromEntries([CODE, ...DEPENDENTS].map((code) => [code, statusOf(options, code)]));

// What the trigger writes for that work: every attempt is an event.
const serverProfile = (estimate, events, independent, dok = [2, 3]) => ({
  [CODE]: {
    mastery: { estimate },
    accumulator: { eligibleEvents: events, effectiveWeight: events, independentSuccesses: independent },
    dimensions: { eligibleGradeLevelEvents: events, dokRepresented: dok, lastIndependentSuccessAt: NOW - 86400000 },
    updatedAt: NOW,
  },
});

// The four profiles the coordinator reproduced.
const CASES = {
  'eight questions, all right on the second try': [{ [CODE]: Array(8).fill(2) }, serverProfile(50, 16, 8)],
  'five on the first try, three on the second, two on the third': [{ [CODE]: [1, 1, 1, 1, 1, 2, 2, 2, 3, 3] }, serverProfile(59, 17, 10)],
  'six questions, all right on the third try': [{ [CODE]: Array(6).fill(3) }, serverProfile(33, 18, 6)],
  'ten right first try, then one missed Path diagnostic': [{ [CODE]: Array(10).fill(1) }, serverProfile(0, 1, 0, [2])],
};

test('each reproduced profile has, on the Path, exactly the outcome it has on main', () => {
  for (const [label, [tries, serverProfiles]] of Object.entries(CASES)) {
    const { student, assignments } = studentWithAssignmentWork(tries);
    // Main's engine input: the assignment record alone.
    const main = outcome(optionsWith(buildMasteryBySkill(buildStudentMasteryProfile({ student, assignments }))));
    const branch = outcome(optionsWith(buildMasteryBySkillForStudent({ student, assignments, serverProfiles })));
    assert.equal(main[CODE], STATUS.MASTERED, `${label}: main has it mastered`);
    assert.deepEqual(branch, main, label);
    DEPENDENTS.forEach((code) => assert.ok(![STATUS.LOCKED, STATUS.REMEDIATION].includes(branch[code]), `${label}: ${code} stays open`));
  }
});

test('evidence main never saw (Path only) can credit a skill but never lock one', () => {
  const none = studentWithAssignmentWork({});
  // A single missed Path question, nothing else on record: main read A.3A as
  // unproven, which locks nothing.
  const weak = outcome(optionsWith(buildMasteryBySkillForStudent({ ...none, serverProfiles: serverProfile(0, 1, 0, [2]) })));
  const unproven = outcome(optionsWith({}));
  DEPENDENTS.forEach((code) => assert.equal(weak[code], unproven[code], `${code} is what it is with no evidence at all`));
  // A Path-only Mastered verdict is credited.
  const strong = outcome(optionsWith(buildMasteryBySkillForStudent({ ...none, serverProfiles: serverProfile(92, 8, 6) })));
  assert.equal(strong[CODE], STATUS.MASTERED);
  // And where the SERVER is the more favourable, it wins over a weak record.
  const weakRecord = studentWithAssignmentWork({ [CODE]: [0, 0, 1, 0] });
  const served = outcome(optionsWith(buildMasteryBySkillForStudent({ ...weakRecord, serverProfiles: serverProfile(92, 8, 6) })));
  assert.equal(served[CODE], STATUS.MASTERED);
});

test('the map, its evidence and the topic browser show the more favourable number and verdict', () => {
  const [tries, serverProfiles] = CASES['eight questions, all right on the second try'];
  const work = studentWithAssignmentWork(tries);
  const options = optionsWith(buildMasteryBySkillForStudent({ ...work, serverProfiles }));
  const profiles = buildUnifiedMasteryProfiles({ ...work, serverProfiles });
  const map = buildPathMap(options, { masteryProfilesByTEKS: profiles });
  const card = map.mastered.find((node) => node.skillId === teksSkillId(CODE));
  assert.ok(card, 'listed with what you have mastered');
  assert.ok(card.evidence.some((item) => item.text === "You've mastered this: 100% from 8 questions."), card.evidence.map((item) => item.text).join(' | '));
  const browser = buildTopicBrowser({ courseId: 'algebra1', pathOptions: options, masteryProfilesByTEKS: profiles, now: NOW });
  const row = browser.groups.flatMap((group) => group.skills).find((skill) => skill.skillId === teksSkillId(CODE));
  assert.equal(row.masteryStatus, MASTERY_STATUS.MASTERED);

  // The wheel keeps the server rule, as it did on main: the documented
  // divergence until the server scores each question once.
  assert.notEqual(profiles[CODE].mastery.status, MASTERY_STATUS.MASTERED);
});

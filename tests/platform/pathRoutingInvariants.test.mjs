// Invariants that must hold for EVERY learner, not just the ones we thought of.
//
// WHAT THIS FOUND. A sweep of 840 synthetic learners — ten performance
// patterns × six mastery profiles × fourteen target standards, all through the
// real server routing engine over the real shipped bank — found 42 runs that
// never terminated. The shape was always the same: a student descended once
// into a repair skill, then kept missing THAT skill. The depth limit counts
// DESCENTS, and no descent was happening, so it never tripped. The planner
// found the repair skill's own prerequisites intact and returned "reteach in
// place", so the session answered SUPPORTED_RETRY on the same skill forever.
// The excursion never closed, the student never went home, and in all 840 runs
// the TEACHER_SUPPORT escalation fired exactly zero times — the safety valve
// for "this student is stuck" was unreachable.
//
// These tests run a smaller sweep on every CI run and assert the invariants
// directly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { buildCoverageIndex } from '../../functions/shared/pathCoverage.mjs';
import {
  PATH_ACTION, STALL_MISSES_IN_EXCURSION, STALL_MISSES_ON_TARGET,
} from '../../functions/shared/pathSessionRouting.mjs';
import { teksSkillId } from '../../functions/shared/pathSkillGraph.mjs';

const require = createRequire(import.meta.url);
const pathRouting = require('../../functions/lib/pathRouting.js');

const bank = JSON.parse(
  readFileSync(new URL('../../seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json', import.meta.url), 'utf8'),
).documents || [];
const codes = [...new Set(bank.map((q) => String((q.alignmentKeys || [])[0] || '').replace(/^texas:/, '')))].filter(Boolean);

const coverage = {
  algebra1: buildCoverageIndex({
    courseId: 'algebra1',
    wheelTeks: codes,
    bankItems: bank,
    plans: Object.fromEntries(bank.map((q) => [q.id, { issuable: true }])),
  }),
  algebra2: null,
};

// Deterministic, so a failure is reproducible rather than a rumour.
let seed = 20260820;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const reseed = () => { seed = 20260820; };

const PATTERNS = {
  allCorrect: () => true,
  allWrong: () => false,
  alternating: (i) => i % 2 === 0,
  random: () => rand() < 0.5,
  improving: (i) => rand() < Math.min(0.95, 0.15 + i * 0.08),
  deteriorating: (i) => rand() < Math.max(0.05, 0.95 - i * 0.08),
  mostlyWrong: () => rand() < 0.15,
  streakThenCollapse: (i) => i < 5,
};

const MASTERY = {
  fresh: () => ({}),
  weakEverything: () => Object.fromEntries(codes.map((c) => [teksSkillId(c), { masteryEstimate: 12 }])),
  strongEverything: () => Object.fromEntries(codes.map((c) => [teksSkillId(c), { masteryEstimate: 92 }])),
  mixed: () => Object.fromEntries(codes.map((c, i) => [teksSkillId(c), { masteryEstimate: i % 3 === 0 ? 25 : 80 }])),
};

/** Play one learner all the way through, and report everything that happened. */
const play = async ({ target, pattern, mastery, steps = 30 }) => {
  const profiles = MASTERY[mastery](target);
  let session = {
    status: 'active', sessionKind: 'practice', requiredQuestions: 5,
    target: { alignmentKey: `texas:${target}` }, currentSkillCode: target,
    summary: { completedQuestions: 0, correctQuestions: 0, independentSuccesses: 0 },
    evidenceBySkill: {}, excursion: null, diagnosing: null, route: [],
  };
  const visits = [];
  const actions = [];
  for (let i = 0; i < steps && session.status === 'active'; i += 1) {
    const isCorrect = PATTERNS[pattern](i);
    // eslint-disable-next-line no-await-in-loop
    const routed = await pathRouting.routeAfterFinalizedQuestion({
      session, skillCode: session.currentSkillCode, isCorrect,
      profiles, coverageIndexes: coverage, retentionConcern: false,
    });
    visits.push(routed.currentSkillCode);
    actions.push(routed.decision?.action);
    session = {
      ...session,
      currentSkillCode: routed.currentSkillCode,
      excursion: routed.excursion, diagnosing: routed.diagnosing,
      lastDecision: routed.lastDecision, evidenceBySkill: routed.evidenceBySkill,
      summary: {
        ...session.summary,
        completedQuestions: session.summary.completedQuestions + 1,
        correctQuestions: session.summary.correctQuestions + (isCorrect ? 1 : 0),
      },
      status: routed.decision.action === PATH_ACTION.COMPLETE ? 'completed'
        : routed.decision.action === PATH_ACTION.TEACHER_SUPPORT ? 'teacherSupportNeeded' : 'active',
    };
  }
  return { session, visits, actions, terminated: session.status !== 'active' };
};

const sweep = async (steps = 30) => {
  reseed();
  const targets = codes.slice(0, 8);
  const runs = [];
  for (const target of targets) {
    for (const pattern of Object.keys(PATTERNS)) {
      for (const mastery of Object.keys(MASTERY)) {
        // eslint-disable-next-line no-await-in-loop
        runs.push({ target, pattern, mastery, ...(await play({ target, pattern, mastery, steps })) });
      }
    }
  }
  return runs;
};

// --- The invariants -----------------------------------------------------------

test('INVARIANT every learner reaches a terminal state — nobody loops forever', async () => {
  const runs = await sweep();
  const stuck = runs.filter((run) => !run.terminated);
  assert.deepEqual(
    stuck.map((run) => `${run.target}/${run.pattern}/${run.mastery}`),
    [],
    'a session that never ends is a student who never gets help',
  );
});

test('INVARIANT a student who cannot be routed further is handed to a teacher', async () => {
  const runs = await sweep();
  const escalated = runs.filter((run) => run.session.status === 'teacherSupportNeeded');
  assert.ok(escalated.length > 0,
    'the teacher-support escalation must be reachable — it fired zero times in 840 runs before the stall guard');
  // And it must be learners who are genuinely stuck, judged by what actually
  // happened rather than by the label on the pattern. Escalation ENDS the
  // session, so escalating a student who was getting better would take the
  // session away from them at the worst possible moment.
  escalated.forEach((run) => {
    const { correctQuestions, completedQuestions } = run.session.summary;
    assert.ok(correctQuestions / Math.max(1, completedQuestions) < 0.5,
      `${run.target}/${run.pattern}: escalated a student who was getting most of it right`);
  });
});

test('INVARIANT a learner is never left standing on nothing', async () => {
  const runs = await sweep();
  runs.forEach((run) => {
    run.visits.forEach((skill, index) => {
      assert.ok(skill, `${run.target}/${run.pattern} had no current skill at step ${index}`);
    });
  });
});

test('INVARIANT an excursion is always closed by the time the session ends', async () => {
  const runs = await sweep();
  const dangling = runs.filter((run) => run.terminated
    && run.session.status === 'completed'
    && run.session.excursion);
  assert.deepEqual(dangling.map((run) => run.target), [],
    'a completed session with an open excursion means the student never went home');
});

test('INVARIANT a perfect student is never sent backwards', async () => {
  reseed();
  for (const target of codes.slice(0, 8)) {
    // eslint-disable-next-line no-await-in-loop
    const run = await play({ target, pattern: 'allCorrect', mastery: 'fresh' });
    assert.ok(!run.actions.includes(PATH_ACTION.DESCEND),
      `${target}: success must never open a prerequisite excursion`);
    assert.ok(!run.actions.includes(PATH_ACTION.TEACHER_SUPPORT),
      `${target}: a student getting everything right must not be escalated`);
    assert.equal(run.session.status, 'completed');
  }
});

test('INVARIANT a failing student escalates rather than repeating one skill forever', async () => {
  reseed();
  for (const target of codes.slice(0, 8)) {
    // eslint-disable-next-line no-await-in-loop
    const run = await play({ target, pattern: 'allWrong', mastery: 'weakEverything' });
    assert.equal(run.session.status, 'teacherSupportNeeded',
      `${target}: a student missing everything must end up with a person, not another question`);
    // And it must not take an unreasonable number of questions to get there.
    // A student missing everything should meet a person quickly.
    assert.ok(run.visits.length <= 16,
      `${target}: took ${run.visits.length} questions to escalate, which is too long to leave a student struggling`);
  }
});

test('INVARIANT the stall thresholds are ordered so an excursion escalates sooner', () => {
  // A student inside an excursion is already away from the work they came to
  // do, so a stall there costs them more than a stall on their own target.
  assert.ok(STALL_MISSES_IN_EXCURSION < STALL_MISSES_ON_TARGET);
  assert.ok(STALL_MISSES_IN_EXCURSION >= 3, 'escalating too eagerly would send every wobble to a teacher');
});

test('INVARIANT no session issues a decision the engine cannot name', async () => {
  const runs = await sweep();
  const known = new Set(Object.values(PATH_ACTION));
  runs.forEach((run) => {
    run.actions.forEach((action) => {
      assert.ok(known.has(action), `unknown routing action: ${action}`);
    });
  });
});

test('INVARIANT a repair excursion has a maximum length', async () => {
  // The second pathology the sweep found. Consecutive-miss counting closes the
  // "always failing" case but not the "roughly half right" one: a student
  // answering the repair skill at about a coin flip never misses enough in a
  // row to stall, and never lifts the blended mastery to the return threshold
  // either. Seven such learners lived in the prerequisite indefinitely.
  const { MAX_EXCURSION_QUESTIONS } = await import('../../functions/shared/pathSessionRouting.mjs');
  assert.ok(MAX_EXCURSION_QUESTIONS >= 4, 'too short and a genuine repair never gets a chance');
  assert.ok(MAX_EXCURSION_QUESTIONS <= 8, 'too long and the detour becomes the destination');

  reseed();
  const runs = await sweep(40);
  runs.forEach((run) => {
    // Count the longest unbroken run on any single skill. Nobody should be
    // parked on one skill for the whole session.
    let longest = 0;
    let current = 0;
    let previous = null;
    run.visits.forEach((skill) => {
      current = skill === previous ? current + 1 : 1;
      previous = skill;
      longest = Math.max(longest, current);
    });
    assert.ok(longest <= 20,
      `${run.target}/${run.pattern}/${run.mastery}: parked on one skill for ${longest} consecutive questions`);
  });
});

test('INVARIANT a completed session never congratulates a student who got nothing right', async () => {
  // "This session has the evidence it needed" was reachable by a student who
  // answered the full set and got none of it right, whenever the skill had no
  // routable prerequisite to descend to. That both misleads the student and
  // hides them from their teacher.
  const runs = await sweep();
  runs.filter((run) => run.session.status === 'completed').forEach((run) => {
    const { correctQuestions, completedQuestions } = run.session.summary;
    if (completedQuestions >= 5) {
      assert.ok(correctQuestions > 0,
        `${run.target}/${run.pattern}: completed a session in which nothing landed`);
    }
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  practicePassesAllowed,
  practicePassSwitchApplies,
  rewardPolicyAfterEdit,
  rewardPolicyForNewAssignment,
} from '../../src/platform/rewards/practicePassPolicy.js';
import { practicePassLooksEligible } from '../../src/platform/rewards/practicePassClientEligibility.js';
import {
  PRACTICE_PASS_COST,
  PRACTICE_PASS_INELIGIBLE_CODES,
  evaluatePracticePassEligibility,
  practicePassPolicyOverride,
} from '../../functions/shared/classPointRewards.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

/*
 * "ALLOW PRACTICE PASSES" ON ONE ASSIGNMENT: THE AUTHORING SWITCH (LC23).
 *
 * The rule was already enforced: `assignment.rewardPolicy.practicePassEligible:
 * false` makes the server refuse a use and the wallet not offer the
 * assignment, but nothing authored it. The Assignment Review now has the
 * switch. What a save writes has to be what those two read, so these hold the
 * writer to the readers: the same answers for every value the field could
 * hold, and a whole life of an assignment (created, turned off, turned back
 * on) seen by the wallet and by the server.
 */

const lesson = (overrides = {}) => ({
  id: 'a1',
  title: 'Solving Equations',
  assignedClassIds: ['class-a'],
  sections: [
    { role: 'classwork', questions: [{}] },
    { role: 'practice', questions: [{}, {}] },
  ],
  dueAt: '2026-09-20T23:59:00.000Z',
  lateDueAt: '2026-09-27T23:59:00.000Z',
  ...overrides,
});
const WHILE_OPEN = Date.parse('2026-09-15T12:00:00.000Z');

const walletOffers = (assignment) => practicePassLooksEligible({ assignment, classId: 'class-a', nowValue: WHILE_OPEN });
const serverDecision = (assignment) => evaluatePracticePassEligibility({
  assignment,
  assignedToClass: true,
  isTestCycleAssignment: false,
  practiceIndices: [1, 2],
  hasCreditBearingAttempt: false,
  alreadyRedeemed: false,
  balance: PRACTICE_PASS_COST,
  nowValue: WHILE_OPEN,
});

// What the Assignment Review saves, as the workspace applies it.
const created = (allow) => {
  const rewardPolicy = rewardPolicyForNewAssignment(allow);
  return lesson(rewardPolicy ? { rewardPolicy } : {});
};
const edited = (assignment, allow) => {
  const rewardPolicy = rewardPolicyAfterEdit(assignment.rewardPolicy, allow);
  return rewardPolicy === undefined ? assignment : { ...assignment, rewardPolicy };
};

test('a pass is allowed unless the teacher said no, exactly as the server reads the field', () => {
  // The server's own reading is a different implementation (classPointRewards.mjs
  // carries node:crypto, so the browser keeps its own): they must never disagree.
  const stored = [undefined, null, true, false, 'false', 'no', 0, 1, '', {}, [], NaN];
  for (const value of stored) {
    const assignment = { rewardPolicy: { practicePassEligible: value } };
    const serverRefuses = practicePassPolicyOverride(assignment) === false;
    assert.equal(practicePassesAllowed(assignment), !serverRefuses, JSON.stringify(value) ?? 'undefined');
  }
  for (const assignment of [null, undefined, {}, { rewardPolicy: null }, { rewardPolicy: 'no' }, { rewardPolicy: {} }]) {
    assert.equal(practicePassesAllowed(assignment), true, JSON.stringify(assignment));
  }
  assert.equal(practicePassesAllowed({ rewardPolicy: { practicePassEligible: false } }), false);
});

test('a new assignment carries only the "no", never a default written out', () => {
  assert.deepEqual(rewardPolicyForNewAssignment(false), { practicePassEligible: false });
  for (const allow of [true, undefined, null, 'false', 0, '']) {
    assert.equal(rewardPolicyForNewAssignment(allow), undefined, String(allow));
  }
});

test('a saved edit writes only what changes', () => {
  const cases = [
    // [what is stored, what the switch says, what the save writes]
    [undefined, true, undefined],
    [null, true, undefined],
    [{}, true, undefined],
    [undefined, false, { practicePassEligible: false }],
    [null, false, { practicePassEligible: false }],
    [{ practicePassEligible: false }, false, undefined],
    [{ practicePassEligible: false }, true, {}],
    // an explicit "yes" decides nothing the default does not: left as it is.
    [{ practicePassEligible: true }, true, undefined],
    [{ practicePassEligible: true }, false, { practicePassEligible: false }],
    // anything else in the policy is kept, whichever way the switch turns.
    [{ other: 1 }, false, { other: 1, practicePassEligible: false }],
    [{ other: 1, practicePassEligible: false }, true, { other: 1 }],
    [{ other: 1, practicePassEligible: false }, false, undefined],
    // a switch that never spoke leaves the stored policy alone.
    [{ practicePassEligible: false }, undefined, undefined],
    [{ practicePassEligible: false }, null, undefined],
    [{ practicePassEligible: false }, 'true', undefined],
    [undefined, undefined, undefined],
    // a stored policy that is not a map is no policy.
    ['no', false, { practicePassEligible: false }],
    [['no'], false, { practicePassEligible: false }],
  ];
  for (const [stored, allow, expected] of cases) {
    const before = JSON.stringify(stored);
    assert.deepEqual(rewardPolicyAfterEdit(stored, allow), expected, `${before} + ${String(allow)}`);
    assert.equal(JSON.stringify(stored), before, 'what was stored is not changed in place');
  }
});

test('what a save writes is what the wallet and the server read, through a whole life of an assignment', () => {
  // Created with passes allowed: no policy at all, and both say yes.
  let assignment = created(true);
  assert.equal('rewardPolicy' in assignment, false);
  assert.equal(walletOffers(assignment), true);
  assert.deepEqual(serverDecision(assignment), { eligible: true, code: null, message: null });

  // The teacher turns passes off: the wallet stops offering it and the server refuses it, in words.
  assignment = edited(assignment, false);
  assert.deepEqual(assignment.rewardPolicy, { practicePassEligible: false });
  assert.equal(walletOffers(assignment), false);
  const refused = serverDecision(assignment);
  assert.equal(refused.eligible, false);
  assert.equal(refused.code, PRACTICE_PASS_INELIGIBLE_CODES.REWARD_POLICY_DISABLED);
  assert.match(refused.message, /cannot be used on this assignment/);

  // Saving again without touching the switch changes nothing.
  assert.equal(edited(assignment, false), assignment);

  // Turned back on: the "no" is gone, and both say yes again.
  assignment = edited(assignment, true);
  assert.equal(practicePassPolicyOverride(assignment), null, 'no override is stored, not a "yes"');
  assert.equal(walletOffers(assignment), true);
  assert.equal(serverDecision(assignment).eligible, true);

  // Created with passes off: refused from the start, by both.
  const off = created(false);
  assert.equal(walletOffers(off), false);
  assert.equal(serverDecision(off).code, PRACTICE_PASS_INELIGIBLE_CODES.REWARD_POLICY_DISABLED);
});

test('the switch is shown only where a pass could be used', () => {
  assert.equal(practicePassSwitchApplies(['warmup', 'classwork', 'practice', 'dol']), true);
  assert.equal(practicePassSwitchApplies(['practice']), true);
  assert.equal(practicePassSwitchApplies([' Practice ']), true);
  assert.equal(practicePassSwitchApplies(['warmup', 'classwork', 'dol']), false, 'no Practice section: nothing to excuse');
  assert.equal(practicePassSwitchApplies(['classwork', 'practice', 'quiz']), false, 'a quiz can never take a pass');
  assert.equal(practicePassSwitchApplies(['classwork', 'practice', 'test']), false, 'nor a test');
  assert.equal(practicePassSwitchApplies(['practice'], { testCycle: true }), false, 'nor a Test Cycle');
  assert.equal(practicePassSwitchApplies([]), false);
  assert.equal(practicePassSwitchApplies(undefined), false);
  assert.equal(practicePassSwitchApplies(null), false);

  // What the server refuses on its own, whatever is stored: the switch never offers a choice that decides nothing.
  const withQuiz = lesson({ sections: [...lesson().sections, { role: 'quiz', questions: [{}] }] });
  assert.equal(serverDecision(withQuiz).code, PRACTICE_PASS_INELIGIBLE_CODES.QUIZ_ASSIGNMENT);
  assert.equal(practicePassSwitchApplies(withQuiz.sections.map((section) => section.role)), false);
});

// ─── the screens: the switch is on the review, and the choice is saved ───────

const read = (relative) => executableSource(readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8'));
const modal = read('src/components/teacher/LessonPreflightModal.jsx');
const workspace = read('src/app/teacher/TeacherWorkspace.jsx');

test('the review starts with passes allowed, and the switch writes the teacher\'s choice to the draft', () => {
  const defaults = region(modal, 'const initialReviewDraft = (draft = {}) => {', '\n};', 'the review draft defaults');
  assert.match(defaults, /allowPracticePasses: true,/);
  assert.ok(
    defaults.indexOf('allowPracticePasses: true') < defaults.indexOf('...rest,'),
    'a draft that already carries the choice (an assignment being edited) keeps it',
  );

  const handlers = region(modal, 'const allowPracticePasses = ', 'const outputProfileEnabled', 'the switch state');
  assert.match(handlers, /const allowPracticePasses = draft\.allowPracticePasses !== false;/);
  assert.match(handlers, /setDraft\(\(current\) => \(\{ \.\.\.current, allowPracticePasses: allow \}\)\)/);
  assert.match(handlers, /practicePassSwitchApplies\(activityRoles, \{ testCycle: isTestCycleAssignment\(effectiveAssignmentV5\) \}\)/);
});

test('the switch is a checkbox in the Delivery step, shown only where a pass could be used, in the catalog\'s own words', () => {
  const delivery = region(modal, 'const renderDelivery = () => (', 'const renderCheck = () => (', 'the Delivery step');
  const fieldset = region(delivery, '{showPracticePassSwitch && (', '\n      )}', 'the Practice Passes fieldset');
  assert.match(fieldset, /data-preflight-practice-passes/);
  assert.match(fieldset, /<input\s+type="checkbox"[^>]*checked=\{allowPracticePasses\}\s+onChange=\{\(event\) => setAllowPracticePasses\(event\.target\.checked\)\}/);
  // What a pass is and does is said once, by the reward catalog, not re-worded here.
  assert.match(fieldset, /REWARD_DEFINITIONS\.practicePass\.teacherDescription/);
  assert.match(fieldset, /REWARD_DEFINITIONS\.practicePass\.gradeEffect/);
  assert.doesNotMatch(delivery.replace(fieldset, ''), /allowPracticePasses/, 'one switch, in one place');
});

test('the whole draft, the choice included, goes to the save', () => {
  const confirm = region(modal, 'onConfirmPublish?.({', 'publicationPlan,', 'the confirm payload');
  assert.match(confirm, /draft: \{\s*\.\.\.draft,/);
  assert.doesNotMatch(confirm, /allowPracticePasses/, 'nothing here may overwrite what the teacher chose');
});

test('a new assignment is created with only the "no", whichever class or the library it is saved for', () => {
  const before = region(workspace, 'const handleCreateAssignment = async', 'const assignmentPayloadBase = {', 'create, before the payload');
  assert.match(before, /const newRewardPolicy = rewardPolicyForNewAssignment\(teacherReview\.allowPracticePasses\);/);
  // The base every destination's document (Standard, Honors, or the one library
  // copy) is built from, so the choice reaches each of them.
  const base = region(workspace, 'const assignmentPayloadBase = {', 'createdAt: new Date(),', 'the payload base');
  assert.match(base, /\.\.\.\(newRewardPolicy \? \{ rewardPolicy: newRewardPolicy \} : \{\}\),/);
  const variant = region(workspace, '...assignmentPayloadBase,', 'assertFirestoreSafeAssignmentPayload(payload);', 'each destination\'s payload');
  assert.doesNotMatch(variant, /rewardPolicy/, 'no destination overrides what the base carries');
});

test('a saved edit writes the choice only when it changed, and student records do not block it', () => {
  const update = region(workspace, 'const updateExistingAssignmentFromReview', 'const confirmAssignmentPreflight', 'the setup update');
  assert.match(update, /const nextRewardPolicy = rewardPolicyAfterEdit\(existing\.rewardPolicy, draft\.allowPracticePasses\);/);
  const patch = region(update, 'const patch = {', 'assertFirestoreSafeAssignmentPayload(', 'the patch');
  assert.match(patch, /\.\.\.\(nextRewardPolicy !== undefined \? \{ rewardPolicy: nextRewardPolicy \} : \{\}\),/);
  // It is saved with the rest of the reviewed patch, not around it.
  assert.match(update, /await updateDoc\(doc\(db, 'assignments', existing\.id\), \{\s*\.\.\.patchWithoutDol,/);
  // A rule read when a pass is USED changes no past evidence, so it is not one of
  // the fields a saved assignment with student records refuses to change.
  const historical = region(update, 'const historicalFields = [', '];', 'the historical fields');
  assert.doesNotMatch(historical, /rewardPolicy/);
});

test('an assignment being edited, reused or given to another class carries its choice', () => {
  const hydrate = region(workspace, 'const beginEditAssignmentSetup', 'const opened = openAssignmentPreflight(', 'the edit draft');
  assert.match(hydrate, /allowPracticePasses: practicePassesAllowed\(assignment\),/);

  // Giving a library item to classes, and adding a class to a given assignment,
  // both start a new Review from the stored one: a "no" must go with it.
  const dates = region(workspace, 'const assignment = assignments.find((item) => item.id === assignmentId);', 'const originalClassIds = Array.isArray', 'dates and classes');
  assert.match(dates, /openStoredAssignmentForPreflight\(assignment, \{[^}]*allowPracticePasses: practicePassesAllowed\(assignment\),/);
  const further = region(workspace, 'const originalClassIds = Array.isArray', 'const targetGroups = buildDestinationGroups({ assignedClassIds: editedClassIds, classes });', 'added classes');
  assert.match(further, /openStoredAssignmentForPreflight\(assignment, \{[^}]*allowPracticePasses: practicePassesAllowed\(assignment\),/);
});

test('the wallet\'s filter, the server and the review read every stored value the same way', () => {
  // The wallet reads the field inline (a teacher module would join the student's
  // first load); the three readings are held to one another here, on the whole
  // lesson each one decides about.
  const stored = [undefined, null, true, false, 'false', 'no', 0, 1, '', {}, [], NaN];
  for (const value of stored) {
    const assignment = lesson({ rewardPolicy: { practicePassEligible: value } });
    const label = JSON.stringify(value) ?? 'undefined';
    assert.equal(walletOffers(assignment), practicePassesAllowed(assignment), `wallet, ${label}`);
    assert.equal(serverDecision(assignment).eligible, practicePassesAllowed(assignment), `server, ${label}`);
  }
  assert.equal(walletOffers(lesson({ rewardPolicy: { practicePassEligible: false } })), false);
  assert.equal(walletOffers(lesson()), true);

  const wallet = read('src/platform/rewards/practicePassClientEligibility.js');
  assert.doesNotMatch(wallet, /practicePassPolicy/, 'the student\'s first load must not import the teacher\'s authoring module');
});

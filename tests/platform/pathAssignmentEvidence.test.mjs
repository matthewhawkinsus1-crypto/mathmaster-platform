/*
 * WHEN ASSIGNMENT EVIDENCE MOVES MY MATH PATH (MP25).
 *
 * The trace is recorded beside favourableMasteryBySkill in
 * src/platform/path/masteryAdapter.js. These tests drive the student's own
 * Path engine (buildStudentPathOptions) with real assignment attempts
 * (helpers/assignmentWork.mjs) and the server's own event builder and scorer,
 * and pin each rule of the trace:
 *
 *   - evidence too thin for the one rule to judge never closes a door (it
 *     used to lock every skill built on a prerequisite missed once); it still
 *     orders the open cards, as main's engine did;
 *   - a skill locks when either record can judge it;
 *   - a "not for mastery" assignment moves neither record (the server's
 *     profile used to count it);
 *   - only a question's primary alignment moves a skill;
 *   - a single right answer reads Mastered (decided, recorded).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { studentWithAssignmentWork } from './helpers/assignmentWork.mjs';
import { buildStudentPathOptions } from '../../src/platform/path/studentPathOptions.js';
import { favourableMasteryBySkill, buildMasteryBySkill } from '../../src/platform/path/masteryAdapter.js';
import { REASON } from '../../src/platform/path/recommendationEngine.js';
import { getSkillGraph, teksCodeFromSkillId } from '../../src/platform/path/skillGraph.js';
import { buildStudentMasteryProfile } from '../../src/masteryEngine.js';
import { buildAttemptEvidenceEvent } from '../../functions/shared/attemptEvidenceEvent.mjs';
import { masteryEventFacts, rescoreProfilesFromEvidence } from '../../functions/shared/masteryScoring.mjs';
import { MASTERY_STATUS } from '../../functions/shared/masteryRule.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

// 25 October 2026: Algebra I in Module 2, where A.2B is a hard prerequisite
// of the two current skills A.2E and A.2F.
const NOW = Date.parse('2026-10-25T15:00:00Z');
const SKILLS = getSkillGraph('algebra1').map((skill) => skill.skillId);
const DEPENDENTS = ['teks:A.2E', 'teks:A.2F'];

const pathFor = ({ student = { id: 's' }, assignments = [], serverMasteryProfiles = {} } = {}) => buildStudentPathOptions({
  student, assignments, serverMasteryProfiles, courseId: 'algebra1', nowValue: NOW,
});
// skillId → status for every skill in the course graph, so a skill missing
// from the engine's answer shows as a difference.
const statusBySkill = (options) => {
  const rows = new Map(Object.values(options).filter(Array.isArray).flat().map((row) => [row.skillId, row]));
  return Object.fromEntries(SKILLS.map((skillId) => [skillId, rows.get(skillId)?.status || 'missing']));
};
const rowFor = (options, skillId) => Object.values(options).filter(Array.isArray).flat().find((row) => row.skillId === skillId);
const BLANK = statusBySkill(pathFor());

test('fixture: before any work, A.2E and A.2F are open, and A.2B is a prerequisite they can lock on', () => {
  assert.equal(SKILLS.length, new Set(SKILLS).size);
  DEPENDENTS.forEach((skillId) => assert.notEqual(BLANK[skillId], 'locked', skillId));
  DEPENDENTS.forEach((skillId) => assert.notEqual(BLANK[skillId], 'missing', skillId));
});

// Every skill whose status differs from `before`, as [before, after].
const movedFrom = (before, after) => Object.fromEntries(SKILLS
  .filter((skillId) => before[skillId] !== after[skillId])
  .map((skillId) => [skillId, [before[skillId], after[skillId]]]));

test('one assignment question missed on a prerequisite closes no door; two can', () => {
  const once = studentWithAssignmentWork({ 'A.2B': [0] });
  // Exactly what moves: the two skills built on A.2B stay open, ordered lower
  // (readiness reads the miss, as main read it). They used to lock.
  assert.deepEqual(movedFrom(BLANK, statusBySkill(pathFor(once))), {
    'teks:A.2E': ['recommended', 'available'],
    'teks:A.2F': ['recommended', 'available'],
  });
  // Two questions: the one rule can judge it (Needs Attention), and the
  // skills built on it lock, naming the gap.
  const twice = studentWithAssignmentWork({ 'A.2B': [0, 0] });
  const options = pathFor(twice);
  DEPENDENTS.forEach((skillId) => {
    assert.equal(statusBySkill(options)[skillId], 'locked', skillId);
    assert.ok(rowFor(options, skillId).reasons.includes(REASON.PREREQ_SEVERE_GAP), skillId);
  });
});

const serverProfile = ({ estimate, events }) => ({
  mastery: { estimate },
  accumulator: { eligibleEvents: events, effectiveWeight: events, independentSuccesses: 0 },
  dimensions: { eligibleGradeLevelEvents: events, dokRepresented: [2] },
});

test('the skill moves when EITHER record can judge it: the server\'s ten Path questions still lock', () => {
  const once = studentWithAssignmentWork({ 'A.2B': [0] });
  // Ten Path questions at 30% on the server: judged (Needs Attention), so the
  // thin assignment record does not unlock what that evidence closes.
  const judged = statusBySkill(pathFor({ ...once, serverMasteryProfiles: { 'A.2B': serverProfile({ estimate: 30, events: 10 }) } }));
  DEPENDENTS.forEach((skillId) => assert.equal(judged[skillId], 'locked', skillId));
  // One Path question and one assignment question, both missed: thin on both.
  const thin = statusBySkill(pathFor({ ...once, serverMasteryProfiles: { 'A.2B': serverProfile({ estimate: 0, events: 1 }) } }));
  DEPENDENTS.forEach((skillId) => assert.ok(!['locked', 'remediation'].includes(thin[skillId]), `${skillId}: ${thin[skillId]}`));
});

test('a record too thin to judge never locks, and still counts wherever main counted it', () => {
  const legacy = (tries) => buildMasteryBySkill(buildStudentMasteryProfile(studentWithAssignmentWork({ 'A.2B': tries })));
  // The assignment record alone (no unified profile for the skill).
  const record = (tries) => favourableMasteryBySkill({ legacy: legacy(tries), unified: {} })['teks:A.2B'];
  assert.equal(record([0]).lock, false, 'one question missed: too thin to lock');
  assert.notEqual(record([0, 0]).lock, false, 'two questions: judged, it can lock');
  assert.notEqual(record([1]).lock, false, 'one question right: Mastered by the record');
  // Readiness and Challenge evidence still read it (it is not "unproven"):
  // nothing main credited is taken away.
  assert.notEqual(record([0]).gate, false);
  const merged = favourableMasteryBySkill({
    legacy: legacy([0]),
    unified: { 'teks:A.2B': { mastery: 0, attempts: 1, mastered: false, status: MASTERY_STATUS.NOT_ENOUGH_EVIDENCE } },
  })['teks:A.2B'];
  assert.equal(merged.lock, false, 'thin on both records');
  assert.notEqual(merged.gate, false);
});

test('a single right answer reads Mastered on the Path (the 0.9 record; a coordinator decision, recorded)', () => {
  const statuses = statusBySkill(pathFor(studentWithAssignmentWork({ 'A.2B': [1] })));
  assert.equal(statuses['teks:A.2B'], 'mastered');
  assert.notEqual(BLANK['teks:A.2B'], 'mastered');
});

// --- Which work counts ----------------------------------------------------------

const withPolicy = (work, evidencePolicy) => ({ ...work, assignments: work.assignments.map((assignment) => ({ ...assignment, evidencePolicy })) });

test('an assignment marked "not for mastery" moves neither the record nor the Path', () => {
  const missed = studentWithAssignmentWork({ 'A.2B': [0, 0, 0] });
  const counted = statusBySkill(pathFor(withPolicy(missed, { masteryEligible: true })));
  DEPENDENTS.forEach((skillId) => assert.equal(counted[skillId], 'locked', `fixture: counted work locks ${skillId}`));
  assert.deepEqual(statusBySkill(pathFor(withPolicy(missed, { masteryEligible: false }))), BLANK);
});

// The server's evidence for one attempt, as submissionIngestion.mjs builds it.
const serverEvent = (assignment, { questionIndex = 0, isCorrect = false } = {}) => buildAttemptEvidenceEvent({
  studentId: 's',
  assignment,
  question: assignment.questions[questionIndex],
  questionIndex,
  activityRole: 'practice',
  attemptRecord: { totalAttempts: 3, status: isCorrect ? 'correct' : 'incorrect' },
  attemptResult: { isCorrect },
  occurredAt: NOW,
});

test('the server\'s profile skips "not for mastery" work too; every other event keeps its shape', () => {
  const [assignment] = studentWithAssignmentWork({ 'A.2B': [0, 0, 0] }).assignments;
  const counted = { ...assignment, evidencePolicy: { masteryEligible: true } };
  const notCounted = { ...assignment, evidencePolicy: { masteryEligible: false } };
  assert.deepEqual(masteryEventFacts(serverEvent(counted), mathPath).codes, ['A.2B']);
  assert.deepEqual(masteryEventFacts(serverEvent(notCounted), mathPath).codes, [], 'the trigger applies it to no skill');
  // Rebuilt from the whole history (the backfill), it adds nothing either.
  const history = (source) => source.questions.map((question, index) => ({ id: `e${index}`, evidence: serverEvent(source, { questionIndex: index }) }));
  assert.deepEqual(Object.keys(rescoreProfilesFromEvidence(history(counted), mathPath, { now: NOW })), ['A.2B']);
  assert.deepEqual(rescoreProfilesFromEvidence(history(notCounted), mathPath, { now: NOW }), {});
  // Only the "not for mastery" event carries the flag.
  assert.equal(serverEvent(notCounted).source.masteryEligible, false);
  assert.equal(Object.hasOwn(serverEvent(counted).source, 'masteryEligible'), false);
  assert.equal(Object.hasOwn(serverEvent(assignment).source, 'masteryEligible'), false, 'no policy at all: counted, as before');
});

test('only a question\'s primary alignment moves a skill, on either record', () => {
  const missed = studentWithAssignmentWork({ 'A.2B': [0, 0, 0] });
  const secondary = {
    ...missed,
    assignments: missed.assignments.map((assignment) => ({
      ...assignment,
      questions: assignment.questions.map((question) => ({
        ...question,
        alignments: question.alignments.map((entry) => ({ ...entry, role: 'secondary' })),
      })),
    })),
  };
  assert.deepEqual(statusBySkill(pathFor(secondary)), BLANK);
  assert.deepEqual(masteryEventFacts(serverEvent(secondary.assignments[0]), mathPath).codes, []);
  assert.deepEqual(masteryEventFacts(serverEvent(missed.assignments[0]), mathPath).codes, ['A.2B'], 'fixture: primary counts');
});

test('the unified status names the thin case: Not Enough Evidence on both records', () => {
  // What the Path card shows for the prerequisite itself after one miss: its
  // own evidence, by the one rule, unchanged by this fix.
  const options = pathFor(studentWithAssignmentWork({ 'A.2B': [0] }));
  const row = rowFor(options, 'teks:A.2B');
  assert.equal(row.masteryStatus, MASTERY_STATUS.NOT_ENOUGH_EVIDENCE);
  assert.equal(row.evidenceCount, 1);
  assert.equal(teksCodeFromSkillId(row.skillId), 'A.2B');
});

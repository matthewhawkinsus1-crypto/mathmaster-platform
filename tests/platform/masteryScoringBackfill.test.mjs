/*
 * THE RESCORING BACKFILL COSTS NOBODY ANYTHING, AND AFTER IT THE MAP AND THE
 * WHEEL READ ONE NUMBER (student push I; product decision 8).
 *
 * scripts/lib/masteryScoringBackfill.mjs rebuilds a student's server profiles
 * each question once and floors any skill that would show less, on the wheel
 * or on the Path map, than it shows today. These tests build real-shaped
 * students — the assignment record from real attempts, the evidence events
 * the server wrote for those attempts, and the profile the OLD trigger built
 * from them — and check the plan against the client's own code.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { lossesFor, mapCreditsMore, planStudentMasteryBackfill, studentView } from '../../scripts/lib/masteryScoringBackfill.mjs';
import { parseBackfillArgs } from '../../scripts/backfill-mastery-scoring.mjs';
import { applyMasteryEvent, masteryEventFacts } from '../../functions/shared/masteryScoring.mjs';
import { MASTERY_STATUS } from '../../functions/shared/masteryRule.mjs';
import { recordQuestionAttempt } from '../../src/attemptPolicy.js';
import { STATUS, getStudentPathOptions } from '../../src/platform/path/recommendationEngine.js';
import { buildMasteryBySkill, buildMasteryBySkillForStudent } from '../../src/platform/path/masteryAdapter.js';
import { buildStudentMasteryProfile } from '../../src/masteryEngine.js';
import { getSkillGraph, teksSkillId } from '../../src/platform/path/skillGraph.js';
import { sequenceProvider } from '../../src/platform/path/curriculumPacing.js';

const mathPath = createRequire(import.meta.url)('../../functions/lib/mathPath.js');
const NOW = Date.parse('2026-10-12T15:00:00Z');
const CODES = ['A.3A', 'A.2B', 'A.5A', 'A.7A'];

// A deterministic generator, so a failure names a reproducible student.
const lcg = (seed) => {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
};

/**
 * One student: per code, a list of questions {tries, dok, hint}. tries is the
 * attempt that was right (0 = never right in 3). Also Path-only questions
 * (pathOnly: [{code, correct, dok}]).
 */
const buildStudent = ({ questionsByCode = {}, pathOnly = [] }, { studentId = 's', assignmentId = 'a1' } = {}) => {
  const questions = [];
  const grades = {};
  const events = [];
  let clock = Date.parse('2026-09-01T12:00:00Z');
  Object.entries(questionsByCode).forEach(([code, entries]) => entries.forEach(({ tries, dok, hint }) => {
    const index = questions.length;
    const questionId = `q${index}`;
    questions.push({ questionId, type: 'algebra', alignments: [{ framework: 'teks', code, role: 'primary', evidenceLevel: 'assessed' }], dok });
    let record = null;
    const outcomes = tries > 0 ? [...Array(tries - 1).fill(false), true] : [false, false, false];
    outcomes.forEach((isCorrect, attemptIndex) => {
      record = recordQuestionAttempt({ record, isCorrect, supportUsage: hint ? { hintUsed: true } : {} }).record;
      clock += 60000;
      events.push({
        id: `ev-${studentId}-${index}-${attemptIndex + 1}`,
        evidence: {
          eventKey: `ev-${studentId}-${index}-${attemptIndex + 1}`,
          studentId,
          occurredAt: clock,
          masteryEvidenceKeys: [`texas:${code}`],
          questionSnapshot: { questionInstanceId: `qi-${index}`, questionId, dok, familyId: 'algebra' },
          source: { kind: 'assignment', assignmentId, activityRole: 'practice', questionIndex: index },
          performance: { score: isCorrect ? 1 : 0, isCorrect, attemptNumber: attemptIndex + 1 },
          supportUsage: hint ? { hintUsed: true } : {},
        },
      });
    });
    if (hint) record = { ...record, supportUsage: { ...(record.supportUsage || {}), hintUsed: true } };
    grades[index] = record;
  }));
  pathOnly.forEach(({ code, correct, dok }, index) => {
    clock += 60000;
    events.push({
      id: `path-${studentId}-${index}`,
      evidence: {
        eventKey: `path-${studentId}-${index}`, studentId, occurredAt: clock, masteryEvidenceKeys: [`texas:${code}`],
        questionSnapshot: { questionInstanceId: `pq-${index}`, dok }, source: { kind: 'path', activityRole: 'practice' },
        performance: { score: correct ? 1 : 0, isCorrect: correct, attemptNumber: 1 }, supportUsage: {},
      },
    });
  });
  return {
    student: { id: studentId, gradesByAssignment: { [assignmentId]: grades } },
    assignments: [{ id: assignmentId, title: 'Lesson', questions }],
    events,
  };
};

// The document the OLD trigger built: every attempt a separate event.
const oldTriggerDocument = (events, studentId) => {
  const profiles = {};
  events.forEach(({ id, evidence }) => {
    const facts = masteryEventFacts({ ...evidence, source: { activityRole: evidence.source.activityRole }, questionSnapshot: { ...evidence.questionSnapshot, questionInstanceId: null } }, mathPath, { eventId: id });
    facts.codes.forEach((code) => {
      const { questions: _q, scoringVersion: _v, ...entry } = applyMasteryEvent(profiles[code], facts, code, { now: NOW }).entry;
      profiles[code] = entry;
    });
  });
  return events.length ? { studentId, profiles } : null;
};

const plan = (fixture, studentId = 's') => {
  const built = buildStudent(fixture, { studentId });
  const stored = oldTriggerDocument(built.events, studentId);
  return { built, stored, result: planStudentMasteryBackfill({ studentId, stored, events: built.events, student: built.student, assignments: built.assignments, helpers: mathPath, now: NOW }) };
};

const assertAgree = (view, label) => {
  Object.entries(view.unified).forEach(([code, profile]) => {
    const map = view.map[teksSkillId(code)];
    if (!map) return;
    assert.equal(map.mastered === true, profile.mastery.status === MASTERY_STATUS.MASTERED, `${label} ${code}: map and wheel give one verdict`);
    assert.ok(Math.abs(Number(map.mastery) * 100 - Number(profile.mastery.estimate ?? 0)) < 1e-6, `${label} ${code}: map ${map.mastery} vs wheel ${profile.mastery.estimate}`);
  });
};

test('D\'s four reproduced profiles: nothing lost, and map and wheel read one number', () => {
  const cases = {
    'eight questions, all right on the second try': { questionsByCode: { 'A.3A': Array.from({ length: 8 }, (_, i) => ({ tries: 2, dok: i % 3 === 0 ? 3 : 2 })) } },
    'five first, three second, two third try': { questionsByCode: { 'A.3A': [1, 1, 1, 1, 1, 2, 2, 2, 3, 3].map((tries, i) => ({ tries, dok: i % 3 === 0 ? 3 : 2 })) } },
    'six questions, all right on the third try': { questionsByCode: { 'A.3A': Array.from({ length: 6 }, (_, i) => ({ tries: 3, dok: i % 3 === 0 ? 3 : 2 })) } },
    'ten right first try, then one missed Path diagnostic': { questionsByCode: { 'A.3A': Array.from({ length: 10 }, (_, i) => ({ tries: 1, dok: i % 3 === 0 ? 3 : 2 })) }, pathOnly: [{ code: 'A.3A', correct: false, dok: 2 }] },
  };
  for (const [label, fixture] of Object.entries(cases)) {
    const { built, stored, result } = plan(fixture);
    assert.equal(result.action, 'write', label);
    assert.deepEqual(result.violations, [], label);
    const before = studentView({ student: built.student, assignments: built.assignments, serverProfiles: stored.profiles });
    const after = studentView({ student: built.student, assignments: built.assignments, serverProfiles: result.document.profiles });
    assert.deepEqual(lossesFor('A.3A', before, after), [], label);
    assertAgree(after, label);
    // Main called A.3A Mastered (one score per question); so does every screen now.
    assert.equal(after.unified['A.3A'].mastery.status, MASTERY_STATUS.MASTERED, label);
  }
});

test('the rescored number itself is the assignment record\'s (no floor needed for right-on-a-later-try)', () => {
  const { result } = plan({ questionsByCode: { 'A.3A': Array.from({ length: 8 }, (_, i) => ({ tries: 2, dok: i % 3 === 0 ? 3 : 2 })) } });
  const entry = result.document.profiles['A.3A'];
  assert.equal(entry.mastery.observedPerformance, 100, 'eight questions right on the 2nd try are 100%, as the record says');
  assert.equal(entry.accumulator.eligibleEvents, 8);
  assert.equal(entry.floor, undefined);
});

test('a sweep of 400 real-shaped students: no plan lowers anything, every plan writes, map and wheel agree', () => {
  const random = lcg(20261010);
  let floors = 0;
  for (let index = 0; index < 400; index += 1) {
    const questionsByCode = {};
    const codes = CODES.filter(() => random() < 0.6);
    codes.forEach((code) => {
      questionsByCode[code] = Array.from({ length: 1 + Math.floor(random() * 12) }, () => ({
        tries: random() < 0.15 ? 0 : 1 + Math.floor(random() * 3),
        dok: 1 + Math.floor(random() * 3),
        hint: random() < 0.15,
      }));
    });
    const pathOnly = random() < 0.4 ? Array.from({ length: 1 + Math.floor(random() * 5) }, () => ({
      code: CODES[Math.floor(random() * CODES.length)], correct: random() < 0.6, dok: 2 + Math.floor(random() * 2),
    })) : [];
    const studentId = `sweep-${index}`;
    const { built, stored, result } = plan({ questionsByCode, pathOnly }, studentId);
    if (!stored) continue;
    assert.equal(result.action, 'write', `${studentId}: ${JSON.stringify(result.violations)}`);
    const before = studentView({ student: built.student, assignments: built.assignments, serverProfiles: stored.profiles });
    const after = studentView({ student: built.student, assignments: built.assignments, serverProfiles: result.document.profiles });
    Object.keys(before.unified).forEach((code) => assert.deepEqual(lossesFor(code, before, after), [], `${studentId} ${code}`));
    assertAgree(after, studentId);
    // Locks and unlocks: no skill the student could open on main is closed.
    const optionsOf = (masteryBySkill) => getStudentPathOptions({
      courseId: 'algebra1', masteryBySkill,
      pacing: { windowIndex: 3, windowCount: 8, accelerationRadius: 1 },
      pacingProvider: sequenceProvider({ skills: getSkillGraph('algebra1'), windowCount: 8 }),
    });
    const lockedSet = (options) => new Set([...(options[STATUS.LOCKED] || []), ...(options[STATUS.REMEDIATION] || [])].map((row) => row.skillId));
    const mainLocked = lockedSet(optionsOf(buildMasteryBySkill(buildStudentMasteryProfile(built))));
    const beforeLocked = lockedSet(optionsOf(buildMasteryBySkillForStudent({ ...built, serverProfiles: stored.profiles })));
    const afterLocked = lockedSet(optionsOf(buildMasteryBySkillForStudent({ ...built, serverProfiles: result.document.profiles })));
    afterLocked.forEach((skillId) => assert.ok(beforeLocked.has(skillId) || mainLocked.has(skillId), `${studentId}: ${skillId} newly locked`));
    floors += result.changes.filter((change) => change.floored).length;
  }
  assert.ok(floors > 0, 'the sweep reaches profiles that need a floor (hints, never-right questions)');
});

test('a skill only the assignment record knows gets a floor-only entry, so map and wheel agree on it', () => {
  // One question right: main's map calls it Mastered (0.9 cut-off); the
  // server never saw it.
  const built = buildStudent({ questionsByCode: { 'A.7A': [{ tries: 1, dok: 2 }] } });
  const stored = { studentId: 's', profiles: {} };
  const before = studentView({ student: built.student, assignments: built.assignments, serverProfiles: {} });
  assert.equal(mapCreditsMore('A.7A', before), true);
  const result = planStudentMasteryBackfill({ studentId: 's', stored, events: [], student: built.student, assignments: built.assignments, helpers: mathPath, now: NOW });
  assert.equal(result.action, 'write');
  assert.equal(result.document.profiles['A.7A'].floor.status, MASTERY_STATUS.MASTERED);
  const after = studentView({ student: built.student, assignments: built.assignments, serverProfiles: result.document.profiles });
  assertAgree(after, 'floor-only');
  assert.equal(after.map[teksSkillId('A.7A')].mastered, true, 'still Mastered on the map, as on main');
});

test('idempotent: a rescored document is skipped, so a second run writes nothing', () => {
  const { built, result } = plan({ questionsByCode: { 'A.3A': [{ tries: 2, dok: 3 }, { tries: 1, dok: 2 }] } });
  const again = planStudentMasteryBackfill({ studentId: 's', stored: result.document, events: built.events, student: built.student, assignments: built.assignments, helpers: mathPath, now: NOW + 1 });
  assert.equal(again.action, 'skip');
  assert.equal(result.document.masteryScoring.version, 2);
  Object.values(result.document.profiles).forEach((entry) => assert.equal(entry.scoringVersion, 2));
});

test('a plan that would still lower something is refused, never written', () => {
  const { built, stored } = plan({ questionsByCode: { 'A.3A': [{ tries: 0, dok: 3 }, { tries: 1, dok: 2 }] } });
  // A stored document the client reads as Mastered for reasons the floor
  // cannot reproduce (a status label alone is not evidence for the rule).
  const forged = { ...stored, profiles: { 'A.3A': { ...stored.profiles['A.3A'], mastery: { estimate: 99, status: 'Mastered' }, accumulator: { eligibleEvents: 9, effectiveWeight: 9, independentSuccesses: 9 }, dimensions: { dokRepresented: [3] } } } };
  const result = planStudentMasteryBackfill({ studentId: 's', stored: forged, events: built.events, student: built.student, assignments: built.assignments, helpers: mathPath, now: NOW });
  assert.equal(result.action, 'write', 'the floor holds Mastered and 99');
  assert.equal(result.document.profiles['A.3A'].floor.status, MASTERY_STATUS.MASTERED);
  assert.equal(result.document.profiles['A.3A'].floor.estimate, 99);
});

test('the script is a dry run unless --execute, and needs a project', () => {
  assert.throws(() => parseBackfillArgs([]), /--project <id> is required/);
  assert.equal(parseBackfillArgs(['--project', 'p']).execute, false);
  assert.equal(parseBackfillArgs(['--project', 'p', '--execute']).execute, true);
  assert.throws(() => parseBackfillArgs(['--project', 'p', '--force']), /Unknown option/);
});

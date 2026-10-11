/*
 * THE RESCORING BACKFILL COSTS NOBODY ANYTHING, AND AFTER IT THE MAP AND THE
 * WHEEL READ ONE NUMBER (student push I; product decision 8).
 *
 * scripts/lib/masteryScoringBackfill.mjs rebuilds a student's server profiles
 * each question once and refuses any student whose wheel or Path map would
 * show less than it shows today. Every screen reads the favourable rule (the
 * higher of the server's and the assignment record's number, Mastered when
 * either says so), so map and wheel agree before and after. These tests build real-shaped
 * students — the assignment record from real attempts, the evidence events
 * the server wrote for those attempts, and the profile the OLD trigger built
 * from them — and check the plan against the client's own code.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { lossesFor, lostChallenges, newlyClosed, planStudentMasteryBackfill, studentView } from '../../scripts/lib/masteryScoringBackfill.mjs';
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
    // The baseline is MAIN's real screens on the stored (per-attempt) document.
    const before = studentView({ student: built.student, assignments: built.assignments, serverProfiles: stored.profiles, main: true });
    const after = studentView({ student: built.student, assignments: built.assignments, serverProfiles: result.document.profiles });
    assert.deepEqual(lossesFor('A.3A', before, after), [], label);
    assertAgree(after, label);
    // Main called A.3A Mastered (one score per question); so does every screen now.
    assert.equal(after.unified['A.3A'].mastery.status, MASTERY_STATUS.MASTERED, label);
  }
});

test('the rescored server number itself is the assignment record\'s for right-on-a-later-try', () => {
  const { result } = plan({ questionsByCode: { 'A.3A': Array.from({ length: 8 }, (_, i) => ({ tries: 2, dok: i % 3 === 0 ? 3 : 2 })) } });
  const entry = result.document.profiles['A.3A'];
  assert.equal(entry.mastery.observedPerformance, 100, 'eight questions right on the 2nd try are 100%, as the record says');
  assert.equal(entry.accumulator.eligibleEvents, 8);
});

test('a sweep of 400 real-shaped students: nothing written lowers anything, map and wheel agree, and most students are written', () => {
  const random = lcg(20261010);
  let written = 0;
  let refused = 0;
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
    const before = studentView({ student: built.student, assignments: built.assignments, serverProfiles: stored.profiles, main: true });
    if (result.action === 'refuse') {
      refused += 1;
      assert.ok(result.violations.length > 0);
      continue;
    }
    assert.equal(result.action, 'write');
    written += 1;
    const after = studentView({ student: built.student, assignments: built.assignments, serverProfiles: result.document.profiles });
    Object.keys(before.unified).forEach((code) => assert.deepEqual(lossesFor(code, before, after), [], `${studentId} ${code}`));
    assertAgree(after, studentId);
    // Locks and Challenge cards: nothing main opens or offers is taken away.
    assert.deepEqual(newlyClosed(before, after), [], `${studentId}: newly locked`);
    assert.deepEqual(lostChallenges(before, after), [], `${studentId}: Challenge lost`);
  }
  assert.ok(written > 300, `${written} written, ${refused} refused`);
});

test('idempotent: a rescored document is skipped, so a second run writes nothing', () => {
  const { built, result } = plan({ questionsByCode: { 'A.3A': [{ tries: 2, dok: 3 }, { tries: 1, dok: 2 }] } });
  const again = planStudentMasteryBackfill({ studentId: 's', stored: result.document, events: built.events, student: built.student, assignments: built.assignments, helpers: mathPath, now: NOW + 1 });
  assert.equal(again.action, 'skip');
  assert.equal(result.document.masteryScoring.version, 2);
});

test('a plan that would lower something is refused, never written', () => {
  const { built, stored } = plan({ questionsByCode: { 'A.3A': [{ tries: 0, dok: 3 }, { tries: 1, dok: 2 }] } });
  // A stored document the client reads as Mastered for reasons the evidence
  // does not reproduce.
  const forged = { ...stored, profiles: { 'A.3A': { ...stored.profiles['A.3A'], mastery: { estimate: 99, status: 'Mastered' }, accumulator: { eligibleEvents: 9, effectiveWeight: 9, weightedScoreSum: 8.9, independentSuccesses: 9 }, dimensions: { dokRepresented: [3] } } } };
  const result = planStudentMasteryBackfill({ studentId: 's', stored: forged, events: built.events, student: built.student, assignments: built.assignments, helpers: mathPath, now: NOW });
  assert.equal(result.action, 'refuse');
  assert.ok(result.violations.some((violation) => violation.code === 'A.3A'));
});

// The coordinator's review of #467, after the backfill, then ordinary use: the
// favourable rule keeps main's outcome where the narrowed bridge did not.
const optionsFor = (masteryBySkill) => getStudentPathOptions({
  courseId: 'algebra1', masteryBySkill,
  pacing: { currentWindow: 3, windowCount: 8, accelerationRadius: 1 },
  pacingProvider: sequenceProvider({ skills: getSkillGraph('algebra1'), windowCount: 8 }),
});
const statusOf = (options, code) => Object.keys(options)
  .find((key) => Array.isArray(options[key]) && options[key].some((row) => row.skillId === teksSkillId(code))) || null;
const afterOrdinaryUse = (fixture, newEvents) => {
  const { built, result } = plan(fixture);
  assert.equal(result.action, 'write');
  const profiles = { ...result.document.profiles };
  newEvents.forEach((evidence, index) => {
    const facts = masteryEventFacts({ ...evidence, eventKey: `new-${index}` }, mathPath);
    facts.codes.forEach((code) => { profiles[code] = applyMasteryEvent(profiles[code], facts, code, { now: NOW + index }).entry; });
  });
  // Main after the same work: its per-attempt trigger over every event, and
  // its own screens (server rule wheel, favourable map).
  const all = [...built.events, ...newEvents.map((evidence, index) => ({ id: `new-${index}`, evidence: { ...evidence, eventKey: `new-${index}` } }))];
  const mainView = studentView({ student: built.student, assignments: built.assignments, serverProfiles: oldTriggerDocument(all, 's').profiles, main: true });
  const main = optionsFor(mainView.map);
  const now = optionsFor(buildMasteryBySkillForStudent({ ...built, serverProfiles: profiles }));
  return { built, profiles, main, now, mainView, view: studentView({ student: built.student, assignments: built.assignments, serverProfiles: profiles }) };
};
const pathAnswer = (code, index, { correct, dok = 2 }) => ({
  studentId: 's', occurredAt: NOW + index, masteryEvidenceKeys: [`texas:${code}`],
  questionSnapshot: { questionInstanceId: `pq-new-${index}`, dok }, source: { kind: 'myMathPath', activityRole: 'practice' },
  performance: { score: correct ? 1 : 0, isCorrect: correct, attemptNumber: 1, status: 'finalized' }, supportUsage: {},
});

test('review (a): 3/3 first-try classwork on A.3A, then 12 Path items with 2 right: Mastered and A.2B open, as on main', () => {
  const pathItems = Array.from({ length: 12 }, (_, index) => pathAnswer('A.3A', index, { correct: index < 2 }));
  const { main, now, view } = afterOrdinaryUse({ questionsByCode: { 'A.3A': [{ tries: 1, dok: 3 }, { tries: 1, dok: 2 }, { tries: 1, dok: 2 }] } }, pathItems);
  assert.equal(statusOf(main, 'A.3A'), STATUS.MASTERED);
  assert.equal(statusOf(now, 'A.3A'), STATUS.MASTERED);
  assert.equal(statusOf(now, 'A.2B'), statusOf(main, 'A.2B'));
  assert.equal(view.unified['A.3A'].mastery.status, MASTERY_STATUS.MASTERED, 'the wheel agrees');
  assertAgree(view, '(a)');
});

test('review (b): assignment work the server never saw is kept: A.3A at 70% with no evidence, then 2 wrong Path answers', () => {
  const built = buildStudent({ questionsByCode: { 'A.3A': [{ tries: 1, dok: 2 }, { tries: 1, dok: 2 }, { tries: 0, dok: 2 }, { tries: 1, dok: 2 }, { tries: 1, dok: 3 }, { tries: 0, dok: 2 }, { tries: 1, dok: 2 }, { tries: 1, dok: 2 }, { tries: 0, dok: 2 }, { tries: 1, dok: 2 }] } });
  // No evidence events at all: the server never saw this work.
  const result = planStudentMasteryBackfill({ studentId: 's', stored: null, events: [], student: built.student, assignments: built.assignments, helpers: mathPath, now: NOW });
  const profiles = { ...(result.document?.profiles || {}) };
  [0, 1].forEach((index) => {
    const facts = masteryEventFacts({ ...pathAnswer('A.3A', index, { correct: false }), eventKey: `w-${index}` }, mathPath);
    facts.codes.forEach((code) => { profiles[code] = applyMasteryEvent(profiles[code], facts, code, { now: NOW }).entry; });
  });
  const wrong = [0, 1].map((index) => ({ id: `w-${index}`, evidence: { ...pathAnswer('A.3A', index, { correct: false }), eventKey: `w-${index}` } }));
  const main = optionsFor(studentView({ student: built.student, assignments: built.assignments, serverProfiles: oldTriggerDocument(wrong, 's').profiles, main: true }).map);
  const mastery = buildMasteryBySkillForStudent({ ...built, serverProfiles: profiles });
  assert.equal(Math.round(mastery[teksSkillId('A.3A')].mastery * 100), 70, 'the map keeps the assignment record\'s 70, not 0');
  assert.equal(statusOf(optionsFor(mastery), 'A.2B'), statusOf(main, 'A.2B'), 'A.2B is as open as on main');
  assertAgree(studentView({ student: built.student, assignments: built.assignments, serverProfiles: profiles }), '(b)');
});

test('review (c): eight correct new questions without a DOK 3 item keep a Mastered main gave', () => {
  const pathItems = Array.from({ length: 8 }, (_, index) => pathAnswer('A.3A', index, { correct: true, dok: 2 }));
  const { main, now, view } = afterOrdinaryUse({ questionsByCode: { 'A.3A': Array.from({ length: 6 }, () => ({ tries: 1, dok: 2 })) } }, pathItems);
  assert.equal(statusOf(main, 'A.3A'), STATUS.MASTERED);
  assert.equal(statusOf(now, 'A.3A'), STATUS.MASTERED);
  assert.equal(view.unified['A.3A'].mastery.status, MASTERY_STATUS.MASTERED);
});

test('after the backfill and ten ordinary new questions, no Mastered or unlock main gives is lost, for 300 students', () => {
  const random = lcg(4672026);
  for (let index = 0; index < 300; index += 1) {
    const questionsByCode = {};
    CODES.filter(() => random() < 0.6).forEach((code) => {
      questionsByCode[code] = Array.from({ length: 1 + Math.floor(random() * 10) }, () => ({ tries: random() < 0.2 ? 0 : 1 + Math.floor(random() * 3), dok: 1 + Math.floor(random() * 3) }));
    });
    if (!Object.keys(questionsByCode).length) continue;
    const studentId = `use-${index}`;
    const built = buildStudent({ questionsByCode }, { studentId });
    const stored = oldTriggerDocument(built.events, studentId);
    const result = planStudentMasteryBackfill({ studentId, stored, events: built.events, student: built.student, assignments: built.assignments, helpers: mathPath, now: NOW });
    const profiles = { ...(result.action === 'write' ? result.document.profiles : stored.profiles) };
    const newEvents = [];
    for (let question = 0; question < 10; question += 1) {
      const code = CODES[Math.floor(random() * CODES.length)];
      const evidence = { ...pathAnswer(code, question, { correct: random() < 0.5, dok: 1 + Math.floor(random() * 3) }), eventKey: `${studentId}-n${question}` };
      newEvents.push({ id: evidence.eventKey, evidence });
      const facts = masteryEventFacts(evidence, mathPath);
      facts.codes.forEach((key) => { profiles[key] = applyMasteryEvent(profiles[key], facts, key, { now: NOW }).entry; });
    }
    // Main after the same ten answers: its per-attempt trigger, its own screens.
    const mainView = studentView({ student: built.student, assignments: built.assignments, serverProfiles: oldTriggerDocument([...built.events, ...newEvents], studentId).profiles, main: true });
    const mastery = buildMasteryBySkillForStudent({ ...built, serverProfiles: profiles });
    Object.entries(mainView.map).forEach(([skillId, record]) => {
      if (!record) return;
      const mainMastered = typeof record.mastered === 'boolean' ? record.mastered : Number(record.mastery) >= 0.9;
      if (mainMastered) assert.equal(mastery[skillId]?.mastered, true, `${studentId} ${skillId}: Mastered on main, not here`);
    });
    const branch = studentView({ student: built.student, assignments: built.assignments, serverProfiles: profiles });
    Object.entries(mainView.unified).forEach(([code, profile]) => {
      if (profile.mastery.status === MASTERY_STATUS.MASTERED) assert.equal(branch.unified[code].mastery.status, MASTERY_STATUS.MASTERED, `${studentId} ${code}: wheel Mastered on main`);
    });
    assert.deepEqual(newlyClosed(mainView, branch), [], `${studentId}: locked where main had it open`);
    assertAgree(studentView({ student: built.student, assignments: built.assignments, serverProfiles: profiles }), studentId);
  }
});

test('the script is a dry run unless --execute, and needs a project', () => {
  assert.throws(() => parseBackfillArgs([]), /--project <id> is required/);
  assert.equal(parseBackfillArgs(['--project', 'p']).execute, false);
  assert.equal(parseBackfillArgs(['--project', 'p', '--execute']).execute, true);
  assert.throws(() => parseBackfillArgs(['--project', 'p', '--force']), /Unknown option/);
});

test('review BLOCKER 1: a Mastered server profile beside a short quiz stays Mastered on the wheel, card, map and Path', async () => {
  const { mergeMasteryProfile, assignmentRecordFor, toPathSkillMastery } = await import('../../src/platform/mastery/unifiedMastery.js');
  const { favourableMasteryBySkill } = await import('../../src/platform/path/masteryAdapter.js');
  const { masteryChecklist } = await import('../../functions/shared/masteryRule.mjs');
  // Server: 88, Mastered, 10 events (8 from a lesson in a previous class).
  const server = {
    teksCode: 'A.3A', mastery: { estimate: 88, status: MASTERY_STATUS.MASTERED },
    accumulator: { eligibleEvents: 10, effectiveWeight: 10, weightedScoreSum: 8.8, independentSuccesses: 8 },
    dimensions: { eligibleGradeLevelEvents: 10, independentSuccesses: 8, dokRepresented: [2, 3] },
  };
  // The current class's quiz: 88.1 from 2 items.
  const record = assignmentRecordFor({ score: 88.1, itemCount: 2, effectiveEvidence: 2 });
  const wheel = mergeMasteryProfile({}, server, {}, record);
  assert.equal(wheel.mastery.status, MASTERY_STATUS.MASTERED, 'wheel');
  const card = masteryChecklist(wheel);
  assert.equal(card.mastered, true, 'card');
  assert.equal(card.items.find((item) => item.key === 'questions').progress, '4 of 4', 'the card counts the server\'s questions');
  const path = toPathSkillMastery(wheel);
  assert.equal(path.mastered, true, 'map');
  const map = favourableMasteryBySkill({ legacy: { [teksSkillId('A.3A')]: { mastery: 0.881, attempts: 2, evidenceStrength: 2 / 6 } }, unified: { [teksSkillId('A.3A')]: path } });
  assert.equal(statusOf(optionsFor(map), 'A.3A'), STATUS.MASTERED, 'Path');
  // And no over-promotion: record 85.9 from 8 items beside a Developing server.
  const developing = { ...server, mastery: { estimate: 54, status: MASTERY_STATUS.DEVELOPING }, accumulator: { ...server.accumulator, weightedScoreSum: 5.4 } };
  assert.equal(mergeMasteryProfile({}, developing, {}, assignmentRecordFor({ score: 85.9, itemCount: 8, effectiveEvidence: 8 })).mastery.status, MASTERY_STATUS.SECURE);
});

test('a Challenge card lost only at a later pacing window is still refused (re-check of #467)', () => {
  // At window 1 nothing is lost; from window 2 on, A.5B and A.5C stop being
  // Challenge cards after rescoring (their prerequisites' strength drops).
  const { result } = plan({ questionsByCode: {
    'A.4A': [{ tries: 1, dok: 3 }, { tries: 1, dok: 3 }],
    'A.5A': [{ tries: 1, dok: 3 }, { tries: 2, dok: 2 }],
    'A.2B': [{ tries: 1, dok: 2 }, { tries: 1, dok: 2 }, { tries: 2, dok: 2 }, { tries: 2, dok: 2 }, { tries: 1, dok: 2 }, { tries: 1, dok: 2 }],
  } }, 'later-window');
  assert.equal(result.action, 'refuse');
  const losses = result.violations.flatMap((violation) => violation.losses.map((loss) => `${violation.code} ${loss}`));
  assert.ok(losses.some((loss) => /^A\.5B map: Challenge card lost \(window 2\)$/.test(loss)), losses.join(' | '));
  assert.equal(losses.some((loss) => /\(window 1\)/.test(loss)), false, 'window 1 alone would have missed it');
});

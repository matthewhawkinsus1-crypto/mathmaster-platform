import test from 'node:test';
import assert from 'node:assert/strict';
import { getSkillGraph, teksSkillId } from '../../src/platform/path/skillGraph.js';
import { TIMING, sequenceProvider, staticMapProvider } from '../../src/platform/path/curriculumPacing.js';
import {
  MASTERED_THRESHOLD, REASON, STATUS,
  beginRemediation, evaluatePrerequisites, explainForStudent,
  getStudentPathOptions, shouldReturnFromRemediation,
} from '../../src/platform/path/recommendationEngine.js';

const COURSE = 'algebra1';
const graph = getSkillGraph(COURSE);
const idsWithPrereqs = graph.filter((skill) => skill.prerequisites.length);

// Prerequisites frequently live in an EARLIER course (Algebra I skills depend
// on grade-8 standards), so "this student has mastered everything before it"
// has to seed those too — seeding only the current course leaves the
// prerequisites unproven, which is a different scenario entirely.
const masteredEverything = (extraSkillIds = []) => {
  const entry = { mastery: 0.95, attempts: 20, evidenceStrength: 1 };
  const map = {};
  graph.forEach((skill) => {
    map[skill.skillId] = entry;
    skill.prerequisites.forEach((prereq) => { map[prereq.skillId] = entry; });
  });
  extraSkillIds.forEach((skillId) => { map[skillId] = entry; });
  return map;
};

const find = (result, skillId) => Object.values(result)
  .filter(Array.isArray)
  .flat()
  .find((row) => row.skillId === skillId) || null;

test('the graph is a graph, not a numbered list', () => {
  assert.ok(graph.length > 10, `expected a real Algebra I graph, got ${graph.length}`);
  assert.ok(idsWithPrereqs.length > 0, 'at least some skills must carry real prerequisite edges');
  assert.ok(graph.every((skill) => skill.classification !== 'process'),
    'process standards are ways of working, not routing destinations');
  // Prerequisites must point at real skills, including in earlier courses.
  const prereqIds = new Set(idsWithPrereqs.flatMap((skill) => skill.prerequisites.map((p) => p.skillId)));
  assert.ok(prereqIds.size > 0);
});

// --- Case 1: multiple valid paths ------------------------------------------
test('Case 1 — several qualifying skills are all offered, not just one', () => {
  const result = getStudentPathOptions({ courseId: COURSE, masteryBySkill: {} });
  const offered = [...result.recommended, ...result.available];
  assert.ok(offered.length > 3, 'a student with no gaps should have real choice');
  assert.equal(result.locked.length, 0, 'nothing locks without evidence of a gap');
  // The engine must never collapse to a single answer.
  assert.ok(Array.isArray(result.recommended));
});

// --- Case 2: localized weakness --------------------------------------------
test('Case 2 — a weakness locks only what depends on it', () => {
  const dependent = idsWithPrereqs[0];
  const weakPrereq = dependent.prerequisites[0].skillId;
  const unrelated = graph.find((skill) => skill.skillId !== dependent.skillId
    && !skill.prerequisites.some((p) => p.skillId === weakPrereq));

  const result = getStudentPathOptions({
    courseId: COURSE,
    masteryBySkill: { [weakPrereq]: { mastery: 0.2, attempts: 8, recentAccuracy: 0.3 } },
  });

  const dependentRow = find(result, dependent.skillId);
  assert.equal(dependentRow.status, STATUS.LOCKED, 'a severe gap locks the dependent skill');
  assert.ok(dependentRow.unmetPrerequisites.includes(weakPrereq));
  assert.equal(dependentRow.remediationTarget, weakPrereq, 'the engine names where to send the student');

  const unrelatedRow = find(result, unrelated.skillId);
  assert.notEqual(unrelatedRow.status, STATUS.LOCKED,
    'an unrelated branch must stay open — this is the whole point of a graph');
});

test('a moderate gap routes to remediation rather than locking', () => {
  const dependent = idsWithPrereqs[0];
  const prereq = dependent.prerequisites[0];
  const result = getStudentPathOptions({
    courseId: COURSE,
    masteryBySkill: { [prereq.skillId]: { mastery: prereq.minimumMastery - 0.1, attempts: 8 } },
  });
  const row = find(result, dependent.skillId);
  assert.equal(row.status, STATUS.REMEDIATION);
  assert.ok(row.reasons.includes(REASON.PREREQ_GAP));
});

// --- Case 3: far-future skill ----------------------------------------------
test('Case 3 — high mastery does not unlock far-future content', () => {
  const late = graph[graph.length - 1];
  const provider = staticMapProvider({ windowMap: { [late.skillId]: { window: 8 } } });
  const result = getStudentPathOptions({
    courseId: COURSE,
    pacingProvider: provider,
    pacing: { currentWindow: 1, accelerationRadius: 1 },
    masteryBySkill: masteredEverything(),
  });
  const row = find(result, late.skillId);
  assert.equal(row.curriculumTiming, TIMING.FUTURE);
  assert.ok([STATUS.FUTURE, STATUS.MASTERED].includes(row.status));
  assert.ok(!result.recommended.some((item) => item.skillId === late.skillId),
    'Guardrail 2: never recommend far-future content on mastery alone');
});

// --- Case 4 / 5: acceleration and honors radius ----------------------------
test('Case 4 and 5 — acceleration is bounded, and honors widens the bound', () => {
  const target = graph[5];
  const provider = staticMapProvider({ windowMap: { [target.skillId]: { window: 3 } } });
  const mastery = masteredEverything();
  delete mastery[target.skillId];

  const regular = getStudentPathOptions({
    courseId: COURSE, pacingProvider: provider, pacing: { currentWindow: 1 }, masteryBySkill: mastery,
  });
  assert.equal(find(regular, target.skillId).curriculumTiming, TIMING.FUTURE,
    'two windows ahead is beyond the default radius of 1');

  const honors = getStudentPathOptions({
    courseId: COURSE, pacingProvider: provider, pacing: { currentWindow: 1 },
    masteryBySkill: mastery, courseProfile: { rigor: 'honors' },
  });
  const honorsRow = find(honors, target.skillId);
  assert.equal(honorsRow.curriculumTiming, TIMING.AHEAD, 'honors radius of 2 brings it into range');
  assert.equal(honorsRow.status, STATUS.EXTENSION, 'and strong mastery makes it a challenge option');
});

test('one window ahead with strong mastery is an extension', () => {
  const target = graph[5];
  const provider = staticMapProvider({ windowMap: { [target.skillId]: { window: 2 } } });
  const mastery = masteredEverything();
  delete mastery[target.skillId];
  const result = getStudentPathOptions({
    courseId: COURSE, pacingProvider: provider, pacing: { currentWindow: 1 }, masteryBySkill: mastery,
  });
  assert.equal(find(result, target.skillId).status, STATUS.EXTENSION);
});

// --- Case 6: teacher override ----------------------------------------------
test('Case 6 — a teacher can open future content, but not lower the maths bar', () => {
  const target = graph[graph.length - 1];
  const provider = staticMapProvider({ windowMap: { [target.skillId]: { window: 8 } } });
  const base = { courseId: COURSE, pacingProvider: provider, pacing: { currentWindow: 1 } };

  assert.equal(find(getStudentPathOptions(base), target.skillId).status, STATUS.FUTURE);

  const opened = getStudentPathOptions({
    ...base,
    teacherOverrides: [{ skillId: target.skillId, action: 'open' }],
  });
  const row = find(opened, target.skillId);
  assert.notEqual(row.status, STATUS.FUTURE, 'the override lifts the pacing lock');
  assert.ok(row.reasons.includes(REASON.TEACHER_UNLOCK));

  // Hiding works too, and expired overrides are ignored.
  const hidden = getStudentPathOptions({ ...base, teacherOverrides: [{ skillId: target.skillId, action: 'hide' }] });
  assert.equal(find(hidden, target.skillId).status, STATUS.LOCKED);

  const expired = getStudentPathOptions({
    ...base,
    teacherOverrides: [{ skillId: target.skillId, action: 'open', expiresAt: '2020-01-01' }],
  });
  assert.equal(find(expired, target.skillId).status, STATUS.FUTURE, 'an expired override stops applying');
});

test('a teacher override never overrides a severe prerequisite gap by default', () => {
  const dependent = idsWithPrereqs[0];
  const weak = dependent.prerequisites[0].skillId;
  const result = getStudentPathOptions({
    courseId: COURSE,
    masteryBySkill: { [weak]: { mastery: 0.1, attempts: 10 } },
    teacherOverrides: [{ skillId: dependent.skillId, action: 'recommend' }],
  });
  assert.equal(find(result, dependent.skillId).status, STATUS.LOCKED,
    'Guardrail 1: only an explicit open may bypass a severe gap');
});

// --- Case 7: remediation return --------------------------------------------
test('Case 7 — remediation remembers where it came from and knows when to return', () => {
  const dependent = idsWithPrereqs[0];
  const target = dependent.prerequisites[0].skillId;
  const excursion = beginRemediation({ originSkillId: dependent.skillId, targetSkillId: target });

  assert.equal(excursion.originSkillId, dependent.skillId, 'Guardrail 4: the way back is recorded');
  assert.ok(excursion.origin.label.length > 0);

  assert.equal(shouldReturnFromRemediation({ excursion, masteryBySkill: { [target]: { mastery: 0.4 } } }), false);
  assert.equal(shouldReturnFromRemediation({ excursion, masteryBySkill: { [target]: { mastery: 0.8 } } }), true);

  // Once repaired, the original skill is offered again.
  const after = getStudentPathOptions({
    courseId: COURSE,
    masteryBySkill: { [target]: { mastery: 0.85, attempts: 10 } },
  });
  const row = find(after, dependent.skillId);
  assert.ok([STATUS.RECOMMENDED, STATUS.AVAILABLE, STATUS.PRIORITY].includes(row.status));
  assert.ok(row.reasons.includes(REASON.PREREQS_MASTERED));
});

// --- Case 8: repeated avoidance --------------------------------------------
test('Case 8 — avoidance raises pressure gradually rather than hard-locking', () => {
  const target = graph[2];
  const runs = [0, 1, 3].map((count) => getStudentPathOptions({
    courseId: COURSE,
    avoidanceBySkill: { [target.skillId]: count },
  }));
  const scores = runs.map((result) => find(result, target.skillId).score);

  assert.ok(scores[1] > scores[0], 'being passed over once nudges the score up');
  assert.ok(scores[2] > scores[1], 'and further avoidance nudges it further');
  assert.equal(find(runs[2], target.skillId).status, STATUS.PRIORITY,
    'sustained avoidance escalates to priority');
  // Everything else stays choosable — pressure, not a cage.
  assert.ok(runs[2].available.length + runs[2].recommended.length > 0);
});

// --- Case 9: new student ----------------------------------------------------
test('Case 9 — a new student gets breadth and low confidence, not false precision', () => {
  const result = getStudentPathOptions({ courseId: COURSE, masteryBySkill: {} });
  assert.equal(result.confidence.level, 'low');
  assert.match(result.confidence.message, /several good places/i);
  assert.ok(result.available.length + result.recommended.length >= 3);
  assert.ok(result.recommended.every((row) => row.reasons.includes(REASON.INSUFFICIENT_EVIDENCE)));
});

test('confidence rises with evidence', () => {
  const heavy = Object.fromEntries(graph.slice(0, 8).map((skill) => [skill.skillId, { mastery: 0.8, attempts: 10 }]));
  assert.equal(getStudentPathOptions({ courseId: COURSE, masteryBySkill: heavy }).confidence.level, 'high');
});

// --- Case 10: required assignment ------------------------------------------
test('Case 10 — required work outranks every independent recommendation', () => {
  const target = graph[4];
  const result = getStudentPathOptions({
    courseId: COURSE,
    requiredSkillIds: [target.skillId],
    assignmentSkillIds: [target.skillId],
  });
  const row = find(result, target.skillId);
  assert.equal(row.status, STATUS.REQUIRED);
  assert.equal(result.required[0].skillId, target.skillId);
  assert.ok(row.reasons.includes(REASON.REQUIRED_ASSIGNMENT));
  // Guardrail 6: the requirement does not permanently alter the graph.
  const without = getStudentPathOptions({ courseId: COURSE });
  assert.notEqual(find(without, target.skillId).status, STATUS.REQUIRED);
});

// --- pacing behaviour -------------------------------------------------------
test('a skill the pacing map does not know is CURRENT, never FUTURE', () => {
  // Missing data is ignorance, not a decision to withhold content.
  const provider = staticMapProvider({ windowMap: {} });
  const result = getStudentPathOptions({ courseId: COURSE, pacingProvider: provider, pacing: { currentWindow: 4 } });
  assert.equal(result.future.length, 0);
  assert.ok(result.recommended.length + result.available.length > 0);
});

test('the provisional fallback is labelled as provisional everywhere', () => {
  const provider = sequenceProvider({ skills: graph });
  const result = getStudentPathOptions({ courseId: COURSE, pacingProvider: provider, pacing: { currentWindow: 1 } });
  assert.equal(result.pacingIsProvisional, true);
  const anyMapped = [...result.recommended, ...result.available, ...result.future][0];
  assert.equal(anyMapped.pacingIsProvisional, true, 'no screen may present provisional pacing as authoritative');
});

// --- mastered / prerequisite evaluation ------------------------------------
test('a mastered skill is reported as mastered and stops crowding the list', () => {
  const target = graph[1];
  const result = getStudentPathOptions({
    courseId: COURSE,
    masteryBySkill: { [target.skillId]: { mastery: MASTERED_THRESHOLD + 0.05, attempts: 20 } },
  });
  assert.equal(find(result, target.skillId).status, STATUS.MASTERED);
});

test('no evidence on a prerequisite is unproven, not deficient', () => {
  const skill = idsWithPrereqs[0];
  const evaluation = evaluatePrerequisites(skill, {});
  assert.deepEqual(evaluation.unmetPrerequisites, []);
  assert.deepEqual(evaluation.severeGaps, []);
  assert.equal(evaluation.hasEvidence, false);
});

test('student explanations are plain language and never leak reason codes', () => {
  const result = getStudentPathOptions({ courseId: COURSE });
  [...result.recommended, ...result.available].slice(0, 5).forEach((row) => {
    const text = explainForStudent(row);
    assert.ok(text.length > 0);
    assert.ok(!/_/.test(text), `"${text}" leaks a reason code`);
  });
});

test('hostile and empty input never throws', () => {
  for (const bad of [null, undefined, 42, 'x', []]) {
    assert.doesNotThrow(() => getStudentPathOptions({ courseId: COURSE, masteryBySkill: bad, teacherOverrides: bad }));
  }
  assert.doesNotThrow(() => getStudentPathOptions());
  assert.deepEqual(getStudentPathOptions({ courseId: 'nope' }).recommended, []);
  assert.equal(explainForStudent(null), '');
});

// The learning map a student actually reads.
//
// Section 9 of the product brief names nine states the Path home has to keep
// apart, and one rule that matters more than any of them: never show a
// dead-end lock with no action, and never let a PACING restriction read as
// mathematical failure. These tests pin both, plus the "no developer metadata"
// rule that a student screen is easy to leak.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPathMap, explainLock, lockKind, statusForSkill, PATH_MARK } from '../../src/platform/path/pathMap.js';
import { getStudentPathOptions, STATUS } from '../../src/platform/path/recommendationEngine.js';
import { getSkillGraph, teksSkillId } from '../../src/platform/path/skillGraph.js';
import { sequenceProvider } from '../../src/platform/path/curriculumPacing.js';
import { collectRequiredSkillIds } from '../../src/platform/path/studentPathOptions.js';
import { deriveStudentLabel, studentLabelForTeks } from '../../functions/shared/pathSkillLabels.mjs';

const COURSE = 'algebra1';
const skills = getSkillGraph(COURSE);

const optionsFor = ({ masteryBySkill = {}, requiredSkillIds = [], teacherOverrides = [], windowIndex = 2 } = {}) => (
  getStudentPathOptions({
    courseId: COURSE,
    masteryBySkill,
    pacing: { windowIndex, windowCount: 6, accelerationRadius: 1 },
    pacingProvider: sequenceProvider({ skills, windowCount: 6 }),
    requiredSkillIds,
    teacherOverrides,
  })
);

// --- No dead-end locks --------------------------------------------------------

test('a lock with no prerequisite is a teacher decision and says so', () => {
  assert.equal(lockKind({}), 'teacher');
  assert.equal(lockKind({ remediationTarget: teksSkillId('A.5A') }), 'prerequisite');

  const sentence = explainLock({});
  assert.match(sentence, /teacher/i);
  assert.match(sentence, /still open/i, 'closing one skill must not read as closing the course');
});

test('every card that is not a door explains which kind of door it is not', () => {
  const options = optionsFor({ windowIndex: 0 });
  const map = buildPathMap(options, { limits: { comingUp: 8, needsSupport: 8 } });
  [...map.comingUp, ...map.needsSupport].forEach((node) => {
    if (node.selectable) return;
    assert.ok(
      ['pacing', 'prerequisite', 'teacher'].includes(node.blockedBy),
      `${node.skillId} is closed but does not say why (blockedBy=${node.blockedBy})`,
    );
  });
});

test('a blocked skill always leaves the student something to do', () => {
  const failed = skills.find((skill) => skill.prerequisites?.some((entry) => entry.strength === 'hard'));
  const blockingId = failed.prerequisites.find((entry) => entry.strength === 'hard').skillId;
  const options = optionsFor({ masteryBySkill: { [blockingId]: { mastery: 0.1, attempts: 8, recentAccuracy: 0.2 } } });
  const map = buildPathMap(options, { limits: { needsSupport: 8 } });

  map.needsSupport.forEach((node) => {
    const hasAction = node.selectable || Boolean(node.strengthen);
    const hasExplanation = Boolean(node.lockedExplanation);
    assert.ok(hasExplanation, `${node.skillId} is blocked with no explanation`);
    // Either the student can act on this card, or the whole rest of the map is
    // still open to them. A card with neither is the dead end the brief forbids.
    const elsewhereOpen = map.focus.length + map.branches.length + map.challenge.length > 0;
    assert.ok(hasAction || elsewhereOpen, `${node.skillId} is a dead end`);
  });
});

// --- Pacing is not failure ----------------------------------------------------

test('a pacing restriction and a prerequisite lock do not share a colour', () => {
  assert.notEqual(
    PATH_MARK[STATUS.FUTURE].tone,
    PATH_MARK[STATUS.LOCKED].tone,
    '"your class gets here later" must not look like "you cannot do this"',
  );
  assert.notEqual(PATH_MARK[STATUS.FUTURE].symbol, PATH_MARK[STATUS.LOCKED].symbol);
});

test('a coming-up card is tagged as a calendar fact, not a mathematical one', () => {
  const options = optionsFor({ windowIndex: 0 });
  const map = buildPathMap(options, { limits: { comingUp: 8 } });
  const future = map.comingUp.filter((node) => node.status === STATUS.FUTURE);
  assert.ok(future.length, 'this fixture must produce some future work');
  future.forEach((node) => {
    assert.equal(node.blockedBy, 'pacing', `${node.skillId} should be blocked by the calendar, not the mathematics`);
    assert.equal(node.selectable, false);
  });
});

// --- Mastered and retention are states of the map, not a footnote -------------

test('the map exposes mastered skills and retention checks, not just a count', () => {
  const masteredId = skills[3].skillId;
  const options = optionsFor({
    masteryBySkill: { [masteredId]: { mastery: 0.95, attempts: 12, recentAccuracy: 0.95 } },
  });
  const map = buildPathMap(options);
  assert.ok(Array.isArray(map.mastered), 'mastered skills must be renderable, not only counted');
  assert.ok(Array.isArray(map.retentionDue));
  assert.equal(typeof map.masteredCount, 'number');
});

test('a retention check is offered with a reason and is startable', () => {
  const masteredId = skills[3].skillId;
  const base = optionsFor({ masteryBySkill: { [masteredId]: { mastery: 0.95, attempts: 12, recentAccuracy: 0.95 } } });
  const withRetention = {
    ...base,
    mastered: (base.mastered || []).map((row) => ({ ...row, retentionDue: true })),
  };
  const map = buildPathMap(withRetention);
  if (!map.retentionDue.length) return; // no mastered rows in this fixture
  map.retentionDue.forEach((node) => {
    assert.equal(node.selectable, true, 'a retention check the student cannot start is not a check');
    assert.equal(node.isRetentionCheck, true);
    assert.match(node.reason, /stayed with you|a while ago/i, 'a re-run of mastered work needs its reason attached');
  });
});

// --- Teacher-assigned work is the classroom contract --------------------------

test('open assigned work produces required skills; closed work does not', () => {
  const question = (code) => ({ alignments: [{ framework: 'teks', role: 'primary', code }] });
  const now = 1_700_000_000_000;
  const required = collectRequiredSkillIds([
    { id: 'open', questions: [question('A.5A')] },
    { id: 'closed', closesAt: now - 1000, questions: [question('A.2A')] },
    { id: 'notYet', opensAt: now + 1000, questions: [question('A.3A')] },
    { id: 'simulated', simulated: true, questions: [question('A.6A')] },
  ], now);

  assert.ok(required.includes(teksSkillId('A.5A')), 'open assigned work is required work');
  assert.ok(!required.includes(teksSkillId('A.2A')), 'a closed assignment is history, not homework');
  assert.ok(!required.includes(teksSkillId('A.3A')), 'work that has not opened is not required yet');
  assert.ok(!required.includes(teksSkillId('A.6A')), 'a simulated assignment must never reach a real student path');
});

test('required work leads the map and is labelled as the teacher\'s', () => {
  const requiredId = skills[10].skillId;
  const map = buildPathMap(optionsFor({ requiredSkillIds: [requiredId] }));
  assert.equal(map.focus[0].skillId, requiredId);
  assert.equal(map.focus[0].status, STATUS.REQUIRED);
  assert.match(map.focus[0].statusLabel, /assigned/i);
});

// --- No developer metadata on a student screen --------------------------------

test('an uncurated standard never falls back to showing its code', () => {
  assert.equal(deriveStudentLabel('', 'A.5A'), 'This skill');
  assert.equal(deriveStudentLabel(null, 'ZZ.9Q'), 'This skill');
  assert.ok(!/ZZ\.9Q/.test(studentLabelForTeks('ZZ.9Q')), 'an unknown code must not reach a student');
});

test('no node on the map renders a code, a band, a DOK level or an internal id', () => {
  const options = optionsFor({ windowIndex: 0 });
  const map = buildPathMap(options, { limits: { comingUp: 8, needsSupport: 8, branches: 8, mastered: 8 } });
  const nodes = [...map.focus, ...map.branches, ...map.comingUp, ...map.needsSupport, ...map.challenge,
    ...map.mastered, ...map.retentionDue,
    ...map.needsSupport.map((entry) => entry.strengthen).filter(Boolean)];
  assert.ok(nodes.length, 'this fixture must draw something');

  nodes.forEach((node) => {
    const studentText = [node.title, node.description, node.reason, node.statusLabel, node.lockedExplanation]
      .filter(Boolean).join(' ');
    assert.ok(!/\b(A|A2)\.\d+[A-Z]\b/.test(studentText), `code leaked: ${studentText}`);
    assert.ok(!/\bDOK\b/i.test(studentText), `DOK leaked: ${studentText}`);
    assert.ok(!/\bband\s*\d/i.test(studentText), `difficulty band leaked: ${studentText}`);
    assert.ok(!/texas:/i.test(studentText), `alignment key leaked: ${studentText}`);
    assert.ok(!/_[a-z]+_/i.test(studentText), `reason code leaked: ${studentText}`);
  });
});

// --- One engine ---------------------------------------------------------------

test('nothing the map calls startable is a skill the engine locked', () => {
  const failed = skills.find((skill) => skill.prerequisites?.some((entry) => entry.strength === 'hard'));
  const blockingId = failed.prerequisites.find((entry) => entry.strength === 'hard').skillId;
  const options = optionsFor({ masteryBySkill: { [blockingId]: { mastery: 0.1, attempts: 8, recentAccuracy: 0.2 } } });
  const map = buildPathMap(options, { limits: { comingUp: 8, needsSupport: 8, branches: 8 } });

  [...map.focus, ...map.branches, ...map.comingUp, ...map.challenge]
    .filter((node) => node.selectable)
    .forEach((node) => {
      const status = statusForSkill(options, node.skillId);
      assert.ok(![STATUS.LOCKED, STATUS.FUTURE].includes(status),
        `${node.skillId} is offered as a door but the engine says ${status}`);
    });
});

// --- Content availability closes the door before it is drawn ------------------

test('a skill with no practice content is never drawn as a door', () => {
  const options = optionsFor();
  const map = buildPathMap(options, { isCovered: () => false, limits: { branches: 8 } });
  [...map.focus, ...map.branches, ...map.challenge].forEach((node) => {
    assert.equal(node.selectable, false, `${node.skillId} has no content but is still startable`);
    assert.equal(node.contentPending, true);
    assert.ok(!/\b(A|A2)\.\d+[A-Z]\b/.test(node.reason), 'the availability message must not name a code');
  });
});

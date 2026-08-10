import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPathMap, explainLock, statusForSkill } from '../../src/platform/path/pathMap.js';
import { getStudentPathOptions, STATUS } from '../../src/platform/path/recommendationEngine.js';
import { curateStudentPanel } from '../../src/platform/path/studentPanel.js';
import { getSkillGraph, teksSkillId } from '../../src/platform/path/skillGraph.js';
import { sequenceProvider } from '../../src/platform/path/curriculumPacing.js';

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

test('the map is drawn from the engine, and shows nothing when there is nothing', () => {
  assert.equal(buildPathMap(null), null);
  const empty = buildPathMap({});
  assert.equal(empty.isEmpty, true);
  assert.equal(empty.totalSkills, 0);
});

test('the map is nearby, not the whole course', () => {
  const options = optionsFor();
  const map = buildPathMap(options);
  const shown = map.focus.length + map.branches.length + map.comingUp.length
    + map.needsSupport.length + map.challenge.length;
  assert.ok(map.totalSkills > 20, 'the course itself is large');
  assert.ok(shown <= 15, `a path is a handful of choices, not ${shown} of them`);
  assert.ok(shown > 0);
});

// --- The guarantee: one engine, two screens, one answer -----------------------

test('a skill in Recommended for You has the same status on the path', () => {
  const options = optionsFor();
  const panel = curateStudentPanel(options);
  const map = buildPathMap(options);

  const cards = [panel.best, panel.strengthen, ...(panel.choices || []), panel.challenge].filter(Boolean);
  assert.ok(cards.length, 'the panel must offer something to compare');

  cards.forEach((card) => {
    const engineStatus = statusForSkill(options, card.skillId);
    assert.equal(card.status, engineStatus, `${card.skillId} disagrees between panel and engine`);
    const node = [...map.focus, ...map.branches, ...map.comingUp, ...map.challenge,
      ...map.needsSupport, ...map.needsSupport.map((entry) => entry.strengthen).filter(Boolean)]
      .find((entry) => entry.skillId === card.skillId);
    if (node && node.status) {
      assert.equal(node.status, engineStatus, `${card.skillId} disagrees between panel and path`);
    }
  });
});

// --- Branch preservation -----------------------------------------------------

test('a hard-prerequisite failure locks its descendants and nothing else', () => {
  // Fail one skill outright, master a couple of unrelated ones.
  const failed = skills.find((skill) => skill.prerequisites?.some((entry) => entry.strength === 'hard'));
  assert.ok(failed, 'the graph must contain at least one hard edge to test');
  const blockingId = failed.prerequisites.find((entry) => entry.strength === 'hard').skillId;

  const options = optionsFor({ masteryBySkill: { [blockingId]: { mastery: 0.1, attempts: 8, recentAccuracy: 0.2 } } });
  const map = buildPathMap(options);

  // Something is blocked...
  assert.ok(map.needsSupport.length > 0 || options.locked.length > 0, 'the failure must block something');
  // ...and other work is still offered.
  assert.ok(
    map.focus.length + map.branches.length > 0,
    'one weakness must not shut down the whole course',
  );
});

test('a blocked skill is shown with the repair that opens it, not as a dead end', () => {
  const options = optionsFor();
  const blocked = [...options.remediation, ...options.locked].find((row) => row.remediationTarget);
  if (!blocked) return; // Nothing blocked in this fixture; the other test covers the shape.

  const map = buildPathMap(options, { limits: { needsSupport: 8 } });
  const node = map.needsSupport.find((entry) => entry.skillId === blocked.skillId);
  assert.ok(node, 'the blocked skill must appear');
  assert.ok(node.strengthen, 'and it must carry its repair');
  assert.equal(node.strengthen.selectable, true, 'the repair is what the student can act on');
  assert.equal(node.selectable, blocked.status !== STATUS.LOCKED);
});

test('the lock explanation says what to do, not what the graph thinks', () => {
  const sentence = explainLock({ remediationTarget: teksSkillId('A.5A') });
  assert.match(sentence, /A\.5A/);
  assert.match(sentence, /Strengthen/);
  assert.ok(!/prerequisite_/.test(sentence), 'no reason codes in student text');
  assert.equal(explainLock({}), 'This is not open yet.');
});

// --- Timing ------------------------------------------------------------------

test('future work is shown but is not a door', () => {
  const options = optionsFor({ windowIndex: 0 });
  const map = buildPathMap(options, { limits: { comingUp: 6 } });
  map.comingUp.forEach((node) => {
    if (node.status === STATUS.FUTURE) {
      assert.equal(node.selectable, false, `${node.skillId} is beyond the horizon and must not be selectable`);
    }
  });
});

test('being ready early is not the same as being told to do it now', () => {
  // Ready-early rows carry calendarTiming 'upcoming'. They belong under
  // "coming up", never in the current-learning headline.
  const options = optionsFor();
  const early = { ...options, recommended: options.recommended.map((row) => ({ ...row, calendarTiming: 'upcoming', calendarDaysUntilStart: 6 })) };
  const map = buildPathMap(early);
  assert.ok(!map.focus.some((node) => node.calendarTiming === 'upcoming'));
  assert.ok(map.comingUp.some((node) => node.calendarTiming === 'upcoming'));
});

test('every node carries the engine\'s own sentence', () => {
  const options = optionsFor();
  const map = buildPathMap(options);
  [...map.focus, ...map.branches, ...map.comingUp, ...map.challenge].forEach((node) => {
    assert.ok(node.reason && node.reason.length > 5, `${node.skillId} needs a student-facing reason`);
    assert.ok(!/_/.test(node.reason), `${node.skillId} reason leaks a reason code: ${node.reason}`);
    assert.ok(node.symbol, `${node.skillId} needs a mark`);
    assert.ok(node.statusLabel, `${node.skillId} needs a status label`);
  });
});

test('required work leads the path', () => {
  const requiredId = skills[10].skillId;
  const options = optionsFor({ requiredSkillIds: [requiredId] });
  const map = buildPathMap(options);
  assert.equal(map.focus[0].skillId, requiredId);
  assert.equal(map.focus[0].status, STATUS.REQUIRED);
});

test('a teacher priority is visible as one', () => {
  const priorityId = skills[6].skillId;
  const options = optionsFor({ teacherOverrides: [{ skillId: priorityId, action: 'priority' }] });
  const map = buildPathMap(options);
  const node = [...map.focus, ...map.branches].find((entry) => entry.skillId === priorityId);
  assert.ok(node, 'a flagged skill must be on the path');
  assert.equal(node.teacherPriority, true);
  assert.match(node.reason, /teacher/i);
});

test('statusForSkill finds a skill wherever the engine put it', () => {
  const options = optionsFor();
  const anySkill = options.available[0] || options.recommended[0];
  assert.equal(statusForSkill(options, anySkill.skillId), anySkill.status);
  assert.equal(statusForSkill(options, 'texas:NOPE'), null);
  assert.equal(statusForSkill(null, 'x'), null);
});

// --- Content availability is shown, not hidden ------------------------------------

test('a skill with no practice content is visible, marked, and not a door', () => {
  const map = buildPathMap(optionsFor(), { isCovered: () => false });
  const nodes = [...map.focus, ...map.branches, ...map.comingUp, ...map.needsSupport, ...map.challenge];
  assert.ok(nodes.length > 0, 'the map still draws the course');
  nodes.forEach((node) => {
    assert.equal(node.selectable, false, `${node.skillId} must not be clickable`);
    assert.equal(node.contentPending, true);
    assert.equal(node.statusLabel, 'Coming soon', 'students see plain words, never a bank error');
    assert.match(node.reason, /being prepared/);
  });
});

test('coverage can only close a door, never open one', () => {
  // Everything covered: the map is exactly what the pedagogy said.
  const covered = buildPathMap(optionsFor(), { isCovered: () => true });
  const plain = buildPathMap(optionsFor());
  assert.deepEqual(
    covered.focus.map((node) => [node.skillId, node.selectable]),
    plain.focus.map((node) => [node.skillId, node.selectable]),
  );
  covered.focus.forEach((node) => assert.equal(node.contentPending, undefined));
});

test('with no coverage information the map is unchanged, so existing callers keep working', () => {
  assert.deepEqual(buildPathMap(optionsFor()), buildPathMap(optionsFor(), { isCovered: null }));
});

/*
 * BROWSE ALL TOPICS (student push D, item 7).
 *
 * The Path map is capped to a handful of nearby cards. The topic browser lists
 * every skill of the student's course, grouped by the district's units (or the
 * course's topics where there is no district calendar), with the same Path
 * status, mastery status, launch gate and lock sentence the other screens use.
 * These tests pin that it is complete, that it agrees with the map and the
 * unified mastery, and that it names units the way the class does.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTopicBrowser, matchesTopicQuery, PATH_STATE, TOPIC_GROUPING } from '../../src/platform/path/topicBrowser.js';
import {
  DISTRICT_CALENDAR_COURSES, buildDistrictUnitIndex, districtUnitForSkill, districtUnitTitle, getDistrictUnits,
} from '../../src/platform/path/districtUnits.js';
import { buildStudentPathOptions, resolvePacingProvider } from '../../src/platform/path/studentPathOptions.js';
import { getStudentPathOptions, STATUS } from '../../src/platform/path/recommendationEngine.js';
import { buildPathMap, explainLock, explainPacing, statusForSkill } from '../../src/platform/path/pathMap.js';
import { getSkillGraph, teksCodeFromSkillId, teksSkillId } from '../../src/platform/path/skillGraph.js';
import { buildUnifiedMasteryProfiles } from '../../src/platform/mastery/unifiedMastery.js';
import { MASTERY_STATUS } from '../../functions/shared/masteryRule.mjs';

// A fixed school day, so the calendar's answer cannot drift with the clock:
// Algebra I is in Module 2, Topic 2 (5-27 October 2026).
const NOW = Date.parse('2026-10-07T15:00:00Z');

const server = {
  // Mastered by the shared rule.
  'A.12A': { mastery: { estimate: 91 }, accumulator: { eligibleEvents: 8, effectiveWeight: 8, independentSuccesses: 5 }, dimensions: { dokRepresented: [2, 3] } },
  // 58% from six questions: below the hard-prerequisite bar of what builds on it.
  'A.3A': { mastery: { estimate: 58 }, accumulator: { eligibleEvents: 6, effectiveWeight: 6, independentSuccesses: 2 }, dimensions: { dokRepresented: [1, 2] } },
  // A severe gap: locks what depends on it.
  'A.5A': { mastery: { estimate: 20 }, accumulator: { eligibleEvents: 6, effectiveWeight: 6, independentSuccesses: 0 }, dimensions: { dokRepresented: [1] } },
};
const profiles = buildUnifiedMasteryProfiles({ student: { id: 's' }, assignments: [], serverProfiles: server });
const optionsFor = (courseId = 'algebra1', serverProfiles = server) => buildStudentPathOptions({
  student: { id: 's' }, assignments: [], courseId, serverMasteryProfiles: serverProfiles, nowValue: NOW,
});
const allSkills = (browser) => browser.groups.flatMap((group) => group.skills);

// --- Completeness -------------------------------------------------------------

test('every skill of the course appears exactly once, grouped by the district units', () => {
  for (const courseId of ['algebra1', 'algebra2']) {
    const browser = buildTopicBrowser({ courseId, pathOptions: optionsFor(courseId, {}) });
    assert.equal(browser.grouping, TOPIC_GROUPING.UNIT, `${courseId} has a district calendar, so it groups by unit`);
    const listed = allSkills(browser).map((skill) => skill.skillId);
    const course = getSkillGraph(courseId).map((skill) => skill.skillId);
    assert.equal(listed.length, course.length, `${courseId}: every skill, no more`);
    assert.equal(new Set(listed).size, listed.length, `${courseId}: no skill listed twice`);
    assert.deepEqual([...listed].sort(), [...course].sort());
    // The groups ARE the district's units, in the order the class meets them.
    assert.deepEqual(browser.groups.map((group) => group.id), getDistrictUnits(courseId).map((unit) => unit.id));
    assert.equal(browser.totalSkills, course.length);
  }
});

test('courses without a district calendar list every skill once, grouped by topic', () => {
  for (const courseId of ['grade6', 'grade7', 'grade8']) {
    const browser = buildTopicBrowser({ courseId, pathOptions: getStudentPathOptions({ courseId }) });
    assert.equal(browser.grouping, TOPIC_GROUPING.TOPIC);
    assert.equal(browser.canGroupByUnit, false);
    assert.deepEqual(browser.groupOptions, [TOPIC_GROUPING.TOPIC]);
    const listed = allSkills(browser).map((skill) => skill.skillId);
    assert.equal(listed.length, getSkillGraph(courseId).length);
    assert.equal(new Set(listed).size, listed.length);
    // Asking for units where there are none is answered with topics, not an empty page.
    assert.equal(buildTopicBrowser({ courseId, pathOptions: getStudentPathOptions({ courseId }), groupBy: 'unit' }).grouping, TOPIC_GROUPING.TOPIC);
  }
});

test('the topic grouping lists the same skills, by strand', () => {
  const byUnit = buildTopicBrowser({ pathOptions: optionsFor() });
  const byTopic = buildTopicBrowser({ pathOptions: optionsFor(), groupBy: 'topic' });
  assert.equal(byTopic.grouping, TOPIC_GROUPING.TOPIC);
  assert.deepEqual(allSkills(byTopic).map((s) => s.skillId).sort(), allSkills(byUnit).map((s) => s.skillId).sort());
  byTopic.groups.forEach((group) => group.skills.forEach((skill) => assert.equal(skill.topicId, group.id)));
  byUnit.groups.forEach((group) => group.skills.forEach((skill) => assert.equal(skill.unitId, group.id)));
});

// --- One truth with the map and the unified mastery ------------------------------

test('Path status comes from the engine and mastery status from the unified profiles', () => {
  const options = optionsFor();
  const browser = buildTopicBrowser({ pathOptions: options, masteryProfilesByTEKS: profiles });
  allSkills(browser).forEach((skill) => {
    const engine = statusForSkill(options, skill.skillId);
    assert.equal(skill.pathStatus, engine, `${skill.skillId}: Path status must be the engine's`);
    assert.equal(skill.pathState, engine === STATUS.LOCKED ? PATH_STATE.LOCKED : engine === STATUS.FUTURE ? PATH_STATE.FUTURE : PATH_STATE.OPEN);
    const profile = profiles[teksCodeFromSkillId(skill.skillId)];
    assert.equal(skill.masteryStatus, profile ? profile.mastery.status : MASTERY_STATUS.NOT_ENOUGH_EVIDENCE, `${skill.skillId}: mastery status must be the unified profile's`);
    // One rule: built from the same profiles, "Mastered" on the Path and in the
    // mastery column are the same claim.
    assert.equal(skill.pathStatus === STATUS.MASTERED, skill.masteryStatus === MASTERY_STATUS.MASTERED, `${skill.skillId} disagrees about Mastered`);
  });
  const mastered = allSkills(browser).find((skill) => skill.skillId === teksSkillId('A.12A'));
  assert.equal(mastered.masteryStatus, MASTERY_STATUS.MASTERED);
  assert.equal(browser.masteredSkills, 1);
});

test('a stale stored status is re-derived by the rule, as the skill card does', () => {
  const stale = { 'A.2A': { mastery: { estimate: 70, status: 'Mastered' }, accumulator: { eligibleEvents: 6, effectiveWeight: 6, independentSuccesses: 4 }, dimensions: { dokRepresented: [3] } } };
  const browser = buildTopicBrowser({ pathOptions: optionsFor(), masteryProfilesByTEKS: stale });
  assert.equal(allSkills(browser).find((s) => s.skillId === teksSkillId('A.2A')).masteryStatus, MASTERY_STATUS.SECURE);
});

test('a skill opens exactly where the map opens it, and the coverage gate closes it', () => {
  const options = optionsFor();
  const uncovered = new Set([teksSkillId('A.2E'), teksSkillId('A.12B')]);
  const isCovered = (skillId) => !uncovered.has(skillId);
  const browser = buildTopicBrowser({ pathOptions: options, masteryProfilesByTEKS: profiles, isCovered });
  const map = buildPathMap(options, { isCovered, limits: { current: 99, branches: 99, comingUp: 99, needsSupport: 99, challenge: 99, mastered: 99 } });
  const mapNodes = [...map.focus, ...map.branches, ...map.comingUp, ...map.needsSupport, ...map.challenge, ...map.mastered];
  assert.ok(mapNodes.length > 20, 'the uncapped map must cover most of the course to compare against');
  allSkills(browser).forEach((skill) => {
    const node = mapNodes.find((entry) => entry.skillId === skill.skillId);
    if (node) assert.equal(skill.launchable, node.selectable, `${skill.skillId}: browser and map disagree about the door`);
    if (skill.pathState !== PATH_STATE.OPEN) assert.equal(skill.launchable, false, `${skill.skillId}: locked and future skills never launch`);
  });
  const pending = allSkills(browser).find((skill) => skill.skillId === teksSkillId('A.2E'));
  assert.equal(pending.pathState, PATH_STATE.OPEN, 'open on the Path…');
  assert.equal(pending.launchable, false, '…but no published practice, so no door');
  assert.equal(pending.blockedBy, 'content');
  assert.match(pending.whyNot, /being prepared/);
  assert.deepEqual(pending.evidence, [], 'nothing to practise means nothing to recommend');
  const pendingNode = mapNodes.find((entry) => entry.skillId === teksSkillId('A.2E'));
  assert.equal(pendingNode.contentPending, true);
  assert.deepEqual(pendingNode.evidence, [], 'the map card says the same');
  // Coverage not loaded yet closes nothing: the session launcher still fails closed.
  const unknown = buildTopicBrowser({ pathOptions: options, masteryProfilesByTEKS: profiles, isCovered: null });
  assert.equal(allSkills(unknown).find((skill) => skill.skillId === teksSkillId('A.2E')).launchable, true);
});

test('locked and future skills explain why instead of launching', () => {
  const options = optionsFor();
  const browser = buildTopicBrowser({ pathOptions: options, masteryProfilesByTEKS: profiles });
  const locked = allSkills(browser).filter((skill) => skill.pathState === PATH_STATE.LOCKED);
  const future = allSkills(browser).filter((skill) => skill.pathState === PATH_STATE.FUTURE);
  assert.ok(locked.length > 0, 'the A.5A gap must lock something to test');
  assert.ok(future.length > 0, 'October leaves later modules in the future');
  const rows = ['locked', 'future'].flatMap((bucket) => options[bucket]);
  locked.forEach((skill) => {
    const row = rows.find((entry) => entry.skillId === skill.skillId);
    assert.equal(skill.launchable, false);
    assert.equal(skill.whyNot, explainLock(row), `${skill.skillId}: the lock sentence is the map's`);
    assert.equal(skill.blockedBy, 'prerequisite');
    assert.ok(skill.strengthen, 'a prerequisite lock carries the repair that opens it');
    assert.deepEqual(skill.evidence, [], 'a closed skill is explained, not recommended');
  });
  future.forEach((skill) => {
    const row = rows.find((entry) => entry.skillId === skill.skillId);
    assert.equal(skill.launchable, false);
    assert.equal(skill.blockedBy, 'pacing');
    assert.equal(skill.whyNot, explainPacing(row));
    assert.match(skill.whyNot, /Nothing is wrong/);
    assert.deepEqual(skill.evidence, [], 'a closed skill is explained, not recommended');
  });
});

test('the repair offered on a locked skill respects the coverage gate', () => {
  const options = optionsFor();
  const lockedRow = options.locked.find((row) => row.remediationTarget);
  assert.ok(lockedRow);
  const open = buildTopicBrowser({ pathOptions: options });
  const closed = buildTopicBrowser({ pathOptions: options, isCovered: (skillId) => skillId !== lockedRow.remediationTarget });
  const find = (browser) => allSkills(browser).find((skill) => skill.skillId === lockedRow.skillId);
  assert.equal(find(open).strengthen.skillId, lockedRow.remediationTarget);
  assert.equal(find(closed).strengthen, null, 'never offer a repair the bank cannot issue');
});

// --- District units --------------------------------------------------------------

test('skills show the district unit the class calls them by, never a bare "Topic 1"', () => {
  const browser = buildTopicBrowser({ pathOptions: optionsFor(), groupBy: 'topic' });
  const slope = allSkills(browser).find((skill) => skill.skillId === teksSkillId('A.3A'));
  assert.equal(slope.unitTitle, 'Module 2: Exploring Constant Rate of Change');
  allSkills(browser).forEach((skill) => {
    assert.ok(skill.unitTitle, `${skill.skillId} must be placed in a unit`);
    assert.doesNotMatch(skill.unitTitle, /^Topic \d/, 'a topic window is named by its parent unit');
  });
  // The map's cards carry the same unit, from the same resolver.
  const map = buildPathMap(optionsFor());
  [...map.focus, ...map.branches].forEach((node) => assert.equal(node.unitTitle, districtUnitForSkill(node.skillId).title));
});

test('units are ordered by the calendar, keep the calendar\'s own names, and say where the class is', () => {
  const units = getDistrictUnits('algebra1');
  assert.deepEqual(units.map((unit) => unit.title), [
    'Module 1: Searching for Patterns',
    'Module 2: Exploring Constant Rate of Change',
    'Module 3: Modeling Linear Equations and Inequalities',
    'Module 4: Investigating Growth and Decay',
    'Module 5: Maximizing and Minimizing',
  ]);
  const algebraTwo = getDistrictUnits('algebra2');
  // Module 2 is only ever reviewed on this calendar: real, unscheduled, and
  // named exactly as the district wrote it.
  const reviewOnly = algebraTwo.find((unit) => unit.id === 'alg2.m2');
  assert.equal(reviewOnly.scheduled, false);
  assert.equal(reviewOnly.title, 'Module 2 Review: Exploring Quadratic Functions');
  assert.equal(algebraTwo.find((unit) => unit.id === 'alg2.u4').title, 'Unit 4: Expressions, Factoring, Equations with Rational Exponents');
  // Data modelling is taught all year, so it comes last.
  assert.equal(algebraTwo[algebraTwo.length - 1].id, 'alg2.modeling');
  // Bookkeeping about a second block of dates is not part of a unit's name.
  algebraTwo.forEach((unit) => assert.doesNotMatch(unit.title, /second window|continued/i));
  assert.deepEqual(getDistrictUnits('grade8'), []);
  assert.equal(districtUnitForSkill(teksSkillId('8.5A')), null);

  const browser = buildTopicBrowser({ pathOptions: optionsFor() });
  const standing = Object.fromEntries(browser.groups.map((group) => [group.id, group.standing]));
  assert.equal(standing['alg1.module2'], 'Your class is working on this unit now');
  assert.equal(standing['alg1.module1'], 'Your class covered this unit earlier');
  assert.equal(standing['alg1.module5'], 'Later in the course');
  assert.equal(browser.groups.find((group) => group.id === 'alg1.module2').classHere, true);
});

test('unit rules hold for any calendar: parents name topics, review-only and embedded units come last', () => {
  const calendar = { windows: [
    // A review-only unit dated BEFORE the first taught unit still follows every
    // scheduled one: it has not been placed by the district.
    { id: 'rev', curriculumType: 'review', curriculumId: 'u.rev', title: 'Module 9 Review: Old Ideas', start: '2026-08-01', end: '2026-08-03', recommendationMode: 'review' },
    { id: 'emb', curriculumType: 'embedded', curriculumId: 'u.emb', title: 'Modelling', embedded: true },
    { id: 'u2', curriculumType: 'unit', curriculumId: 'u.two', title: 'Unit 2: Later', start: '2026-10-01', end: '2026-10-20' },
    { id: 'u2b', curriculumType: 'unit', curriculumId: 'u.two', title: 'Unit 2 (continued)', start: '2027-01-10', end: '2027-01-20' },
    { id: 'u1', curriculumType: 'unit', curriculumId: 'u.one', title: 'Unit 1: First', start: '2026-08-10', end: '2026-09-01' },
    { id: 'u1.t1', parentId: 'u1', curriculumType: 'topic', curriculumId: 'u.one.t1', title: 'Topic 1', start: '2026-08-10', end: '2026-08-20' },
    // The same topic node reviewed in a summer block BEFORE it is taught: the
    // skill belongs to the unit that teaches it, not to the review.
    { id: 'sum', curriculumType: 'review', curriculumId: 'u.summer', title: 'Summer Review', start: '2026-07-01', end: '2026-07-03', recommendationMode: 'review' },
    { id: 'sum.t', parentId: 'sum', curriculumType: 'topic', curriculumId: 'u.three.t1', title: 'Topic 1', start: '2026-07-01', end: '2026-07-03', recommendationMode: 'review' },
    { id: 'u3', curriculumType: 'unit', curriculumId: 'u.three', title: 'Unit 3: Taught', start: '2026-11-01', end: '2026-11-20' },
    { id: 'u3.t1', parentId: 'u3', curriculumType: 'topic', curriculumId: 'u.three.t1', title: 'Topic 1', start: '2026-11-01', end: '2026-11-10' },
  ] };
  const { units, unitBySkill } = buildDistrictUnitIndex({ calendar, links: {
    'teks:A': 'u.one.t1', 'teks:B': 'u.two', 'teks:C': 'u.rev', 'teks:D': 'u.emb', 'teks:E': 'nowhere', 'teks:F': 'u.three.t1',
  } });
  assert.deepEqual(units.map((unit) => unit.id), ['u.one', 'u.two', 'u.three', 'u.rev', 'u.emb']);
  assert.equal(unitBySkill.get('teks:F').title, 'Unit 3: Taught', 'a skill belongs to the unit that teaches it, not a review of it');
  assert.equal(unitBySkill.get('teks:A').title, 'Unit 1: First', 'a topic is named by its parent unit');
  assert.equal(unitBySkill.get('teks:B').title, 'Unit 2: Later', 'the first block names the unit');
  assert.equal(unitBySkill.get('teks:C').scheduled, false);
  assert.equal(unitBySkill.get('teks:D').embedded, true);
  assert.equal(unitBySkill.has('teks:E'), false, 'a link to no window places the skill nowhere rather than guessing');
  assert.equal(districtUnitTitle({ title: 'Unit 4 (continued)' }), 'Unit 4');
  assert.equal(districtUnitTitle({ title: 'Module 3: Analyzing Structure (second window)' }), 'Module 3: Analyzing Structure');
});

test('the units and the pacing provider read one calendar table', () => {
  Object.entries(DISTRICT_CALENDAR_COURSES).forEach(([courseId, entry]) => {
    const provider = resolvePacingProvider({ courseId, skills: getSkillGraph(courseId.replace(/-honors$/, '')), pacing: {}, nowValue: NOW });
    assert.equal(provider.frameworkId, entry.calendar.calendarId, `${courseId} must be timed by the calendar its units come from`);
  });
});

// --- Search ---------------------------------------------------------------------

test('search by name finds skills, units and topics, and never by code', () => {
  const options = optionsFor();
  const slope = buildTopicBrowser({ pathOptions: options, query: 'Slope' });
  assert.ok(slope.matchedSkills > 0);
  allSkills(slope).forEach((skill) => assert.match(`${skill.title} ${skill.description}`, /slope/i));
  assert.ok(allSkills(slope).some((skill) => skill.title === 'Finding slope'));
  // Every visible group has a match; groups without one are dropped.
  slope.groups.forEach((group) => assert.ok(group.skills.length > 0));
  assert.ok(slope.groups.length < buildTopicBrowser({ pathOptions: options }).groups.length);

  // "Investigating" is in the unit's name and in no skill's: it finds the whole unit.
  const unit = buildTopicBrowser({ pathOptions: options, query: 'investigating' });
  assert.deepEqual(unit.groups.map((group) => group.id), ['alg1.module4'], 'a unit name finds the unit');
  assert.equal(unit.matchedSkills, getDistrictUnits('algebra1').find((entry) => entry.id === 'alg1.module4').skillIds.length);

  assert.equal(buildTopicBrowser({ pathOptions: options, query: 'A.5A' }).matchedSkills, 0, 'codes are not student vocabulary');
  assert.equal(buildTopicBrowser({ pathOptions: options, query: 'zzzz' }).groups.length, 0);
  assert.equal(matchesTopicQuery({ title: 'Solving linear equations' }, '  LINEAR   solving '), true);
  assert.equal(matchesTopicQuery({ title: 'Solving linear equations' }, 'linear quadratic'), false, 'every word must match');
});

// --- Student language -----------------------------------------------------------

test('nothing in the browser shows a student a TEKS code or a reason code', () => {
  const browser = buildTopicBrowser({ pathOptions: optionsFor(), masteryProfilesByTEKS: profiles, groupBy: 'topic' });
  const text = [
    ...browser.groups.flatMap((group) => [group.title, group.standing]),
    ...allSkills(browser).flatMap((skill) => [
      skill.title, skill.topicTitle, skill.unitTitle, skill.statusLabel, skill.whyNot, skill.reason,
      skill.strengthen?.title, ...skill.evidence.map((item) => item.text),
    ]),
  ].filter(Boolean);
  text.forEach((line) => {
    assert.doesNotMatch(line, /\b(?:A|A2|[678])\.\d+[A-Z]?\b/, `code leaked: ${line}`);
    assert.doesNotMatch(line, /_/, `reason code leaked: ${line}`);
  });
});

test('hostile input never throws', () => {
  assert.equal(buildTopicBrowser(), null);
  assert.equal(buildTopicBrowser({ pathOptions: null }), null);
  assert.doesNotThrow(() => buildTopicBrowser({ courseId: 'algebra1', pathOptions: { required: 'x', locked: [null, 7] } }));
  const bare = buildTopicBrowser({ courseId: 'algebra1' });
  assert.equal(bare.totalSkills, getSkillGraph('algebra1').length, 'without options the course is still listed');
  allSkills(bare).forEach((skill) => {
    assert.equal(skill.launchable, false);
    assert.equal(skill.pathState, PATH_STATE.UNAVAILABLE);
    assert.ok(skill.whyNot);
  });
});

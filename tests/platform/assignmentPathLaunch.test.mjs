// "Practice This Skill" on an assignment result opens My Math Path on the
// skill the assignment teaches — and keeps the old behaviour (reopen the
// assignment) for section practice, Test Cycles and assignments with no Path
// skill.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { pathSkillForTeks, resolveAssignmentPathLaunch } from '../../src/platform/path/assignmentPathLaunch.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');

const teks = (code, role = 'primary') => ({ framework: 'teks', code, role });
const q = (id, alignments, extra = {}) => ({ questionId: id, prompt: id, alignments, ...extra });
const lesson = (sections) => ({ id: 'a1', schemaVersion: 5, title: 'Lesson', sections });

// The ordinary shape: a Warm-Up reviewing an earlier skill, then the lesson.
// The Warm-Up has the most questions on one skill, so counting it would pick
// the prerequisite.
const LESSON = lesson([
  { id: 'w', role: 'warmup', questions: ['w1', 'w2', 'w3', 'w4'].map((id) => q(id, [teks('8.8C')])) },
  { id: 'c', role: 'classwork', questions: [q('c1', [teks('A.5A')]), q('c2', [teks('A.5A'), teks('A.1A', 'secondary')])] },
  { id: 'p', role: 'practice', questions: [q('p1', [teks('A.5A')]), q('p2', [teks('A.5B')])] },
  { id: 'd', role: 'dol', questions: [q('d1', [teks('A.5B')])] },
]);

test('the skill is the one the lesson teaches, not the Warm-Up the route happens to point at', () => {
  // The result route opens at question 0, which here is a Warm-Up item on a
  // grade-8 prerequisite. "Practice This Skill" means the lesson's skill.
  assert.deepEqual(
    resolveAssignmentPathLaunch({ assignment: LESSON, questionIndex: 0 }),
    { skillId: 'teks:A.5A', teksCode: 'A.5A' },
  );
});

test('a whole-assignment result resolves; a split section post keeps its section practice', () => {
  assert.equal(resolveAssignmentPathLaunch({ assignment: LESSON, sectionKey: 'whole' })?.teksCode, 'A.5A');
  assert.equal(resolveAssignmentPathLaunch({ assignment: LESSON, sectionKey: null })?.teksCode, 'A.5A');
  for (const sectionKey of ['warmup', 'classwork', 'practice', 'dol', 'DOL']) {
    assert.equal(
      resolveAssignmentPathLaunch({ assignment: LESSON, sectionKey }),
      null,
      `"Practice ${sectionKey}" practises that section, so it must keep reopening the assignment`,
    );
  }
});

test('Warm-Up questions decide only when nothing else is aligned to a Path skill', () => {
  const warmupOnly = lesson([
    { id: 'w', role: 'warmup', questions: [q('w1', [teks('8.8C')])] },
    { id: 'c', role: 'classwork', questions: [q('c1', [])] },
  ]);
  assert.equal(resolveAssignmentPathLaunch({ assignment: warmupOnly })?.teksCode, '8.8C');
});

test('no Path skill means the old behaviour, never a guess', () => {
  const unaligned = lesson([{ id: 'c', role: 'classwork', questions: [q('c1', []), q('c2', undefined)] }]);
  assert.equal(resolveAssignmentPathLaunch({ assignment: unaligned }), null);

  // A process standard is a way of working, not a Path destination.
  const processOnly = lesson([{ id: 'c', role: 'classwork', questions: [q('c1', [teks('A.1A')])] }]);
  assert.equal(resolveAssignmentPathLaunch({ assignment: processOnly }), null);

  // A secondary or prerequisite alignment is not what the question assesses.
  const secondaryOnly = lesson([{ id: 'c', role: 'classwork', questions: [q('c1', [teks('A.5A', 'secondary'), teks('8.8C', 'prerequisite')])] }]);
  assert.equal(resolveAssignmentPathLaunch({ assignment: secondaryOnly }), null);

  const unknown = lesson([{ id: 'c', role: 'classwork', questions: [q('c1', [teks('ZZ.99Q')])] }]);
  assert.equal(resolveAssignmentPathLaunch({ assignment: unknown }), null);

  assert.equal(resolveAssignmentPathLaunch({ assignment: null }), null);
  assert.equal(resolveAssignmentPathLaunch({ assignment: [] }), null);
  assert.equal(resolveAssignmentPathLaunch(), null);
});

test('a Test Cycle keeps its own stage card', () => {
  const cycle = {
    ...LESSON,
    assignment: { gradingPurpose: 'test' },
    deliveryPolicy: { sectionGating: 'rolePolicy' },
    sections: [...LESSON.sections, { id: 'r', role: 'review', questions: [q('r1', [teks('A.5A')])] }],
  };
  assert.equal(resolveAssignmentPathLaunch({ assignment: cycle }), null);
});

test('legacy alignment shapes are read by the same canonical reader', () => {
  const legacy = lesson([{
    id: 'c',
    role: 'classwork',
    questions: [
      { questionId: 'c1', standard: 'A.12A' },
      { questionId: 'c2', standards: { primary: ['A.12A'], secondary: ['A.1A'] } },
      { questionId: 'c3', teks: 'A.3C' },
    ],
  }]);
  assert.equal(resolveAssignmentPathLaunch({ assignment: legacy })?.teksCode, 'A.12A');
});

test('a tie goes to the route\'s own question, then to the order the questions appear in', () => {
  const tied = lesson([{ id: 'c', role: 'classwork', questions: [q('c1', [teks('A.5A')]), q('c2', [teks('A.3C')]), q('c3', [teks('A.12A')])] }]);
  assert.equal(resolveAssignmentPathLaunch({ assignment: tied, questionIndex: 0 })?.teksCode, 'A.5A');
  assert.equal(resolveAssignmentPathLaunch({ assignment: tied, questionIndex: 2 })?.teksCode, 'A.12A');
  assert.equal(resolveAssignmentPathLaunch({ assignment: tied, questionIndex: 99 })?.teksCode, 'A.5A');
  // A count still beats the route's question.
  const majority = lesson([{ id: 'c', role: 'classwork', questions: [q('c1', [teks('A.3C')]), q('c2', [teks('A.5A')]), q('c3', [teks('A.5A')])] }]);
  assert.equal(resolveAssignmentPathLaunch({ assignment: majority, questionIndex: 0 })?.teksCode, 'A.5A');
});

test('a question the teacher excluded does not vote; its replacement does', () => {
  const replaced = lesson([{
    id: 'c',
    role: 'classwork',
    questions: [
      q('c1', [teks('A.3C')], { teacherExcluded: true }),
      q('c2', [teks('A.3C')], { teacherExcluded: true }),
      q('c3', [teks('A.5A')]),
      q('c4', [teks('A.12A')], { supersedesQuestionId: 'c1' }),
    ],
  }]);
  // Without the exclusion A.3C would win two votes to one.
  assert.equal(resolveAssignmentPathLaunch({ assignment: replaced, questionIndex: 0 })?.teksCode, 'A.12A',
    'the route still points at the excluded question; its replacement inherits the tie-break');
});

test('a flat legacy question list is read the same way', () => {
  const flat = {
    id: 'legacy',
    questions: [
      { activityRole: 'warmup', standard: '8.8C' },
      { activityRole: 'practice', standard: 'A.5A' },
      // Excluded by the teacher: without that, A.3C would win two to one.
      { activityRole: 'practice', standard: 'A.3C', teacherExcluded: true },
      { activityRole: 'practice', standard: 'A.3C', teacherExcluded: true },
    ],
  };
  assert.equal(resolveAssignmentPathLaunch({ assignment: flat })?.teksCode, 'A.5A');
});

test('a Path skill is a non-process standard the skill graph knows, from any course', () => {
  assert.deepEqual(pathSkillForTeks('a.5a'), { skillId: 'teks:A.5A', teksCode: 'A.5A' });
  assert.deepEqual(pathSkillForTeks('8.8C'), { skillId: 'teks:8.8C', teksCode: '8.8C' });
  assert.equal(pathSkillForTeks('A.1A'), null);
  assert.equal(pathSkillForTeks(''), null);
  assert.equal(pathSkillForTeks(null), null);
});

/* ---------------------------------------------------------------- wiring */

test('App imports the resolver it calls on the assignment result', () => {
  // App.jsx is JSX: no test imports it and the build does not resolve free
  // identifiers, so a call without its import is a runtime ReferenceError on
  // the button. The import is asserted next to the call.
  assert.match(
    executableSource(app),
    /import \{ resolveAssignmentPathLaunch \} from '\.\/platform\/path\/assignmentPathLaunch\.js';/,
  );
  const route = region(app, "if (user.role === 'student' && activeView === 'assignmentResult' && assignmentResultRoute) {", 'return renderStudentIdentityShell(', 'assignment result route');
  assert.match(executableSource(route), /const resultPathLaunch = resolveAssignmentPathLaunch\(\{/);
});

/*
 * Student pass 3, NAV-8: the result page's "Try it again — no credit" used to
 * open this skill in My Math Path while the same words everywhere else reopen
 * the assignment. Two buttons now: "Try these questions again — no credit"
 * reopens the assignment; "Practice this skill" opens My Math Path on the
 * resolved skill, and exists only when there is one.
 */
test('the result offers the resolved skill as its own button, and its retry reopens the assignment', () => {
  const route = executableSource(region(app, "if (user.role === 'student' && activeView === 'assignmentResult' && assignmentResultRoute) {", '\n  if (isStudentAssignment) {', 'assignment result route'));
  // The resolver reads THIS assignment, at the route's question, scoped to the
  // same section the retry is scoped to — so a split section post resolves to
  // nothing and keeps only its section retry.
  const call = region(route, 'const resultPathLaunch = resolveAssignmentPathLaunch({', '});', 'resolver call');
  assert.match(call, /assignment: recoveryAssignment,/);
  assert.match(route, /const recoveryAssignment = assignments\.find\(\(item\) => item\.id === assignmentResultRoute\.assignmentId\) \|\| null;/);
  assert.match(call, /questionIndex: assignmentResultRoute\.questionIndex/);
  assert.match(call, /sectionKey: resultSectionLabel \? assignmentResultRoute\.sectionKey : null/);

  const result = region(route, '<StudentAssignmentResult', '\n        />', 'Assignment Result render');
  // "Practice this skill": launches the Path on the skill, or is not offered.
  const skill = region(result, 'onPracticeSkill={resultPathLaunch ? () => {', '} : null}', 'skill handler');
  assert.match(skill, /setPathLaunchTeks\(resultPathLaunch\.teksCode\);/);
  assert.match(skill, /openStudentDashboardMode\('mathPath'\);/);
  // "Try these questions again": reopens the assignment, scoped and returning here; never the Path.
  const retry = region(result, 'onPractice={(assignmentId) => startAssignment(assignmentId, assignmentResultRoute.questionIndex, {', '})}', 'retry handler');
  assert.match(retry, /sectionKey: resultSectionLabel \? assignmentResultRoute\.sectionKey : null/);
  assert.match(retry, /returnToResult: true/);
  assert.doesNotMatch(retry, /setPathLaunchTeks|mathPath/);
});

test('Section Recovery practice is untouched', () => {
  const panel = region(app, '<SectionRecoveryPanel', '/>', 'Section Recovery panel');
  assert.match(panel, /onPractice=\{\(section\) => setRecoverySession\(\{ assignmentId: assignmentResultRoute\.assignmentId, section, mode: 'practice' \}\)\}/);
  assert.doesNotMatch(executableSource(panel), /resolveAssignmentPathLaunch|setPathLaunchTeks/);
});

test('a Path launch from the result leaves the result route, keeping only the skill', () => {
  // openStudentDashboardMode clears the result route and every other
  // destination's leftovers, and keeps pathLaunchTeks for mathPath — which is
  // what lets My Math Path start the session on arrival.
  const open = region(app, 'const openStudentDashboardMode = (mode) => {', '};', 'openStudentDashboardMode');
  assert.match(open, /setAssignmentResultRoute\(null\);/);
  assert.match(open, /if \(mode !== 'mathPath'\) setPathLaunchTeks\(null\);/);
  assert.match(open, /setActiveView\('dashboard'\);/);
  assert.match(app, /launchTeksCode=\{pathLaunchTeks\}/);
});

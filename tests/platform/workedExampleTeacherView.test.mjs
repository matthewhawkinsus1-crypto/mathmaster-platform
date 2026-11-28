// THE TEACHER'S VIEW OF WORKED EXAMPLES (docs/platform/WORKED_EXAMPLES.md,
// section 9, slice G): per skill, which students opened a worked example and
// how their next question on that skill was marked. Shown in the teacher's
// results beside the "worth a conversation" signals. Counts of what was
// recorded: it writes nothing, and no grade, attempt or mastery path reads it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  EXAMPLE_HOW, EXAMPLE_NEXT, EXAMPLE_OUTCOME, WORKED_EXAMPLES_NONE, WORKED_EXAMPLES_NOTE,
  buildWorkedExampleView, exampleOpenedOn, exampleOutcomeOf, exampleSkillLabel,
} from '../../src/platform/teacher/workedExampleView.js';
import { exampleSkillOf } from '../../src/platform/supports/workedExample/exampleSkill.js';
import { splitQuestionRecord } from '../../functions/shared/gradeEntryStorage.mjs';
import { firstLoadGraph, repo, teacherFirstLoadGraph } from './helpers/firstLoadGraph.mjs';
import { executableSource } from './helpers/sourceContract.mjs';
import { teacherWorkspaceSource } from './helpers/appScreens.mjs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

// A lesson: Classwork has two questions on factoring and one on the zero
// product property; Practice has one more of each; the DOL has one factoring.
const question = (familyId, extra = {}) => ({ type: 'multiAnswer', familyId, studentActions: ['multipleResponses'], ...extra });
const ASSIGNMENT = {
  id: 'L7',
  schemaVersion: 5,
  sections: [
    { role: 'classwork', questions: [question('factoring-trinomials'), question('factoring-trinomials'), question('zeroProductProperty')] },
    { role: 'practice', questions: [question('factoring-trinomials'), question('zeroProductProperty')] },
    { role: 'dol', questions: [question('factoring-trinomials')] },
  ],
};
// Positions: 0 CW factoring, 1 CW factoring, 2 CW zero product, 3 PR factoring, 4 PR zero product, 5 DOL factoring.
const at = (minute) => Date.UTC(2026, 10, 18, 15, minute);
const answer = (status, tries, usage = {}, minute = null) => ({ status, totalAttempts: tries, attemptCount: tries, supportUsage: usage, ...(minute === null ? {} : { lastAttemptAt: at(minute) }) });
const ASKED = { workedExampleUsed: true };
const SHOWN = { workedExampleShown: 'auto' };

const STUDENTS = [
  // Ana: Classwork showed her the example on question 1; the next factoring question went right first try.
  { id: 'S1', name: 'Ana Ruiz', tracker: { 0: answer('correct', 2, SHOWN, 1), 1: answer('correct', 1, {}, 5), 2: answer('correct', 1, {}, 8) } },
  // Ben: asked for one on question 2 (after being shown it), then missed the Practice one; asked again there, and the DOL went right after a retry.
  { id: 'S2', name: 'Ben Ortiz', tracker: { 0: answer('correct', 1, {}, 1), 1: answer('attempted', 2, { ...ASKED, ...SHOWN }, 6), 3: answer('expired', 3, ASKED, 20), 5: answer('correct', 2, {}, 40) } },
  // Cal: asked on the zero-product Classwork question; has not reached the Practice one.
  { id: 'S3', name: 'Cal Diaz', tracker: { 2: answer('correct', 1, ASKED, 9) } },
  // Dee: opened no example.
  { id: 'S4', name: 'Dee Park', tracker: { 0: answer('correct', 1, {}, 2), 1: answer('correct', 1, {}, 4) } },
];
const view = buildWorkedExampleView({ assignment: ASSIGNMENT, students: STUDENTS });

test('a skill is the example player\'s own: the question\'s family, or its kind with its standard', () => {
  assert.deepEqual(view.skills.map((skill) => [skill.key, skill.label, skill.questionNumbers]), [
    ['factoring-trinomials', 'Factoring trinomials', [1, 2, 4, 6]],
    ['zeroProductProperty', 'Zero product property', [3, 5]],
  ]);
  for (const stored of ASSIGNMENT.sections.flatMap((section) => section.questions)) assert.ok(view.skills.some((skill) => skill.key === exampleSkillOf(stored)));
  assert.equal(exampleSkillLabel({ studentActions: ['multipleResponses'], primaryStandard: 'A2.7G' }), 'A2.7G: Multiple responses');
  // The section of each question is named, so a DOL question on the skill is seen as one.
  assert.deepEqual(view.skills[0].questions.map((place) => place.roleLabel), ['Classwork', 'Classwork', 'Practice', 'DOL']);
  // A question the teacher left out belongs to none.
  const trimmedAssignment = { ...ASSIGNMENT, sections: [{ role: 'classwork', questions: [question('factoring-trinomials', { teacherExcluded: true }), { type: 'multiAnswer' }, question('zeroProductProperty')] }] };
  const trimmed = buildWorkedExampleView({ assignment: trimmedAssignment, students: [] });
  assert.deepEqual(trimmed.skills.map((skill) => [skill.key, skill.named, skill.questionNumbers]), [['question:1', false, [2]], ['zeroProductProperty', true, [3]]]);
  // A question with no family and no student action can still have an example
  // opened on it (the player finds one by its type): it is listed on its own,
  // never dropped, and is not offered as "a skill nobody opened an example on".
  assert.deepEqual(trimmed.untouched, ['Zero product property']);
  const unnamed = buildWorkedExampleView({ assignment: trimmedAssignment, students: [{ id: 'S9', name: 'Ida Moss', tracker: { 1: answer('correct', 2, ASKED, 3), 2: answer('correct', 1, ASKED, 6) } }] });
  assert.deepEqual(unnamed.opened.map((skill) => [skill.label, skill.students[0].opened[0].next.outcome]), [
    ['Question 2 (no skill named on this question)', EXAMPLE_NEXT.NONE],
    ['Zero product property', EXAMPLE_NEXT.NONE],
  ]);
  assert.equal(unnamed.where, '1 skill and 1 question with no skill named');
  assert.equal(view.where, '2 skills');
});

test('which students opened an example, on which question, and how it reached them', () => {
  const factoring = view.skills[0];
  assert.deepEqual(factoring.students.map((student) => [student.name, student.opened.map((entry) => [entry.questionIndex, entry.how])]), [
    ['Ana Ruiz', [[0, EXAMPLE_HOW.SHOWN]]],
    ['Ben Ortiz', [[1, EXAMPLE_HOW.BOTH], [3, EXAMPLE_HOW.ASKED]]],
  ]);
  assert.deepEqual([factoring.studentsOpened, factoring.examplesOpened, factoring.asked, factoring.shownOnly], [2, 3, 2, 1]);
  assert.deepEqual(view.skills[1].students.map((student) => student.name), ['Cal Diaz']);
  assert.deepEqual([view.studentsOpened, view.studentsLooked, view.examplesOpened], [3, 4, 4]);
  // Shown by Classwork is said apart from asked for: nobody asked for it.
  assert.equal(factoring.students[0].opened[0].howLabel, 'Shown by Classwork (not asked for)');
  assert.equal(factoring.students[1].opened[1].howLabel, 'Asked for it');
  assert.equal(exampleOpenedOn({ supportUsage: { hintUsed: true } }), null);
  assert.equal(exampleOpenedOn({ supportUsage: { workedExampleShown: true } }), null, 'only the recorded value "auto" is an example shown');
  assert.equal(exampleOpenedOn(null), null);
});

test('whether the next question on the skill then went right', () => {
  const [ana, ben] = view.skills[0].students;
  // Ana: shown on question 1 (right after a retry); question 2 right on the first try.
  assert.deepEqual([ana.opened[0].outcome, ana.opened[0].next.questionIndex, ana.opened[0].next.outcome], [EXAMPLE_OUTCOME.RIGHT_LATER, 1, EXAMPLE_NEXT.RIGHT_FIRST]);
  // Ben: on question 2, the next factoring question is Practice question 4, not right; from there, the DOL, right after another try.
  assert.deepEqual(ben.opened.map((entry) => [entry.next.questionIndex, entry.next.roleLabel, entry.next.outcome]), [[3, 'Practice', EXAMPLE_NEXT.NOT_RIGHT], [5, 'DOL', EXAMPLE_NEXT.RIGHT_LATER]]);
  assert.equal(ben.opened[1].next.outcomeLabel, 'Right after another try');
  // Cal: the next zero-product question is not answered yet.
  assert.deepEqual([view.skills[1].students[0].opened[0].next.questionIndex, view.skills[1].students[0].opened[0].next.outcome], [4, EXAMPLE_NEXT.NOT_ANSWERED]);
  assert.deepEqual(view.skills[0].next, { rightFirstTry: 1, rightAfterRetry: 1, notRight: 1, notAnswered: 0, answeredEarlier: 0, noNextQuestion: 0 });
  assert.equal(view.skills[0].line, '2 students opened an example (3 times). On the next question on the skill: 1 right on the first try, 1 right after another try, 1 not right.');
  assert.equal(view.skills[1].line, '1 student opened an example (1 time). On the next question on the skill: 1 not answered.');
  // How a record was marked: its status and its tries, nothing else.
  assert.equal(exampleOutcomeOf({ status: 'correct', totalAttempts: 1 }), EXAMPLE_OUTCOME.RIGHT_FIRST);
  assert.equal(exampleOutcomeOf({ status: 'correct', totalAttempts: 3 }), EXAMPLE_OUTCOME.RIGHT_LATER);
  assert.equal(exampleOutcomeOf({ status: 'expired', totalAttempts: 3 }), EXAMPLE_OUTCOME.NOT_RIGHT);
  assert.equal(exampleOutcomeOf({ status: 'incorrect' }), EXAMPLE_OUTCOME.NOT_RIGHT);
  assert.equal(exampleOutcomeOf(undefined), EXAMPLE_OUTCOME.NOT_ANSWERED);
  assert.equal(exampleOutcomeOf({ status: 'unattempted', totalAttempts: 0 }), EXAMPLE_OUTCOME.NOT_ANSWERED);
});

test('no later question on the skill, and a "next" question answered earlier, are said as such and not counted as what followed', () => {
  // The example was opened on the skill's last question.
  const last = buildWorkedExampleView({ assignment: ASSIGNMENT, students: [{ id: 'S5', name: 'Eli Vo', tracker: { 5: answer('correct', 1, ASKED, 30) } }] });
  // (A DOL never shows an example; this is a record as stored, read as stored.)
  assert.deepEqual([last.skills[0].students[0].opened[0].next.questionIndex, last.skills[0].students[0].opened[0].next.outcome], [null, EXAMPLE_NEXT.NONE]);
  assert.equal(last.skills[0].next.noNextQuestion, 1);
  // Worked out of order: Practice question 4 was last answered at :10, the
  // Classwork question the example was opened on at :25.
  const outOfOrder = buildWorkedExampleView({ assignment: ASSIGNMENT, students: [{ id: 'S6', name: 'Fay Lim', tracker: { 1: answer('correct', 2, ASKED, 25), 3: answer('correct', 1, {}, 10) } }] });
  const entry = outOfOrder.skills[0].students[0].opened[0];
  assert.deepEqual([entry.next.questionIndex, entry.next.outcome], [3, EXAMPLE_NEXT.EARLIER]);
  assert.deepEqual([outOfOrder.skills[0].next.rightFirstTry, outOfOrder.skills[0].next.answeredEarlier, outOfOrder.skills[0].nextAnswered], [0, 1, 0]);
  assert.match(outOfOrder.skills[0].line, /1 answered earlier\.$/);
  // With no times on record, the assignment's order is all there is.
  const untimed = buildWorkedExampleView({ assignment: ASSIGNMENT, students: [{ id: 'S7', name: 'Gus Roe', tracker: { 1: answer('correct', 2, ASKED), 3: answer('correct', 1) } }] });
  assert.equal(untimed.skills[0].students[0].opened[0].next.outcome, EXAMPLE_NEXT.RIGHT_FIRST);
  assert.ok(view.limitations.some((line) => /does not hold when an example was opened/.test(line)));
});

test('the next question is one the gradebook shows: a question the teacher left out is passed over', () => {
  // Classwork question 2 (factoring) is left out of the assignment. For a
  // student shown the example on question 1, the next factoring question is
  // Practice question 4, the one after it.
  const sections = ASSIGNMENT.sections.map((section, position) => (position === 0 ? { ...section, questions: [section.questions[0], { ...section.questions[1], teacherExcluded: true }, section.questions[2]] } : section));
  const leftOut = buildWorkedExampleView({ assignment: { ...ASSIGNMENT, sections }, students: [{ id: 'S1', name: 'Ana Ruiz', tracker: { 0: answer('correct', 1, SHOWN, 1), 3: answer('correct', 1, {}, 12) } }] });
  assert.deepEqual(leftOut.skills[0].questionNumbers, [1, 4, 6]);
  const entry = leftOut.skills[0].students[0].opened[0];
  assert.deepEqual([entry.next.questionIndex, entry.next.roleLabel, entry.next.outcome], [3, 'Practice', EXAMPLE_NEXT.RIGHT_FIRST]);
  assert.equal(leftOut.skills[0].next.notAnswered, 0);
  // The rule is the gradebook's own, not a second one.
  const model = executableSource(read('src/platform/teacher/workedExampleView.js'));
  assert.match(model, /\.filter\(\(entry\) => entry\?\.question && questionIsIncluded\(entry\.question\)\)/);
  assert.match(executableSource(teacherWorkspaceSource()), /if \(!questionIsIncluded\(question\)\) return null;/);
});

test('a replacement question stands where the student sees it, not where it is stored', () => {
  // Storage: [question 1 (left out), question 2, question 1's replacement].
  // The student sees [the replacement, question 2]. An example opened on the
  // replacement has question 2 as its next question.
  const replaced = {
    id: 'L8',
    schemaVersion: 5,
    sections: [{ id: 'cw', role: 'classwork', questions: [
      question('factoring-trinomials', { questionId: 'q1', teacherExcluded: true }),
      question('factoring-trinomials', { questionId: 'q2' }),
      question('factoring-trinomials', { questionId: 'q1b', supersedesQuestionId: 'q1' }),
    ] }],
  };
  const replacedView = buildWorkedExampleView({ assignment: replaced, students: [{ id: 'S1', name: 'Ana Ruiz', tracker: { 2: answer('correct', 2, SHOWN, 1), 1: answer('correct', 1, {}, 5) } }] });
  // The order students meet them, each with its storage position (what the tracker and the gradebook's cards go by).
  assert.deepEqual(replacedView.skills[0].questions.map((place) => place.questionIndex), [2, 1]);
  const entry = replacedView.skills[0].students[0].opened[0];
  assert.deepEqual([entry.questionIndex, entry.next.questionIndex, entry.next.outcome], [2, 1, EXAMPLE_NEXT.RIGHT_FIRST]);
  // And an example opened on question 2, the last one the student meets, has no later question.
  const onSecond = buildWorkedExampleView({ assignment: replaced, students: [{ id: 'S2', name: 'Ben Ortiz', tracker: { 1: answer('correct', 1, ASKED, 5), 2: answer('correct', 1, {}, 1) } }] });
  assert.deepEqual([onSecond.skills[0].students[0].opened[0].next.questionIndex, onSecond.skills[0].students[0].opened[0].next.outcome], [null, EXAMPLE_NEXT.NONE]);
});

test('a question not required for a student is never their next question', () => {
  // A reduced workload leaves Classwork question 2 out for Ana only
  // ("Not required for this student" in her results). Her next factoring
  // question is Practice question 4; Ben, who has every question, keeps question 2.
  const tracker = { 0: answer('correct', 1, SHOWN, 1), 3: answer('attempted', 2, {}, 12) };
  const both = buildWorkedExampleView({ assignment: ASSIGNMENT, students: [
    { id: 'S1', name: 'Ana Ruiz', tracker, omitted: [1] },
    { id: 'S2', name: 'Ben Ortiz', tracker },
  ] });
  const [ana, ben] = both.skills[0].students;
  assert.deepEqual([ana.opened[0].next.questionIndex, ana.opened[0].next.outcome], [3, EXAMPLE_NEXT.NOT_RIGHT]);
  assert.deepEqual([ben.opened[0].next.questionIndex, ben.opened[0].next.outcome], [1, EXAMPLE_NEXT.NOT_ANSWERED]);
  // The class totals count what each student was asked to answer.
  assert.deepEqual([both.skills[0].next.notRight, both.skills[0].next.notAnswered], [1, 1]);
  // Every later question on the skill left out for her: there is no next one.
  const allOmitted = buildWorkedExampleView({ assignment: ASSIGNMENT, students: [{ id: 'S1', name: 'Ana Ruiz', tracker, omitted: [1, 3, 5] }] });
  assert.deepEqual([allOmitted.skills[0].students[0].opened[0].next.questionIndex, allOmitted.skills[0].students[0].opened[0].next.outcome], [null, EXAMPLE_NEXT.NONE]);
  // The gradebook hands the view each student's own omitted questions; the view does not work them out.
  assert.doesNotMatch(executableSource(read('src/platform/teacher/workedExampleView.js')), /studentRequiredQuestions/);
});

test('none opened is said as none; a support record that has not loaded is not "opened none"', () => {
  const none = buildWorkedExampleView({ assignment: ASSIGNMENT, students: [STUDENTS[3]] });
  assert.deepEqual([none.none, none.opened.length, none.examplesOpened], [WORKED_EXAMPLES_NONE, 0, 0]);
  assert.deepEqual(none.untouched, ['Factoring trinomials', 'Zero product property']);
  assert.equal(view.none, '');
  assert.deepEqual(view.untouched, []);
  // The flags are stored apart from the summary a class view reads first
  // (gradeEntryStorage.mjs). A summary that has not met its detail says nothing
  // about what was opened.
  const { summary } = splitQuestionRecord(answer('correct', 1, ASKED, 3));
  assert.ok(!('supportUsage' in summary));
  const waiting = buildWorkedExampleView({ assignment: ASSIGNMENT, students: [{ id: 'S8', name: 'Hal Kim', tracker: { 0: summary } }, STUDENTS[0]] });
  assert.deepEqual(waiting.notLoaded, [{ studentId: 'S8', name: 'Hal Kim' }]);
  // Nothing opened so far, with a record still to arrive, is not "none": the
  // definitive line waits for every record, even when a loaded student opened none.
  const stillWaiting = buildWorkedExampleView({ assignment: ASSIGNMENT, students: [{ id: 'S8', name: 'Hal Kim', tracker: { 0: summary } }, STUDENTS[3]] });
  assert.deepEqual([stillWaiting.none, stillWaiting.unknown, stillWaiting.opened.length, stillWaiting.notLoaded.length], ['', true, 0, 1]);
  assert.deepEqual([none.unknown, view.unknown, waiting.unknown], [false, false, false], 'known none, and something opened, are not unknown');
  const panel = executableSource(read('src/components/teacher/WorkedExamplesBySkill.jsx'));
  assert.match(panel, /\{view\.unknown \? null : view\.none \? \(/, 'the panel draws no "none" line while a record is still to arrive');
  assert.deepEqual(view.notLoaded, []);
  // No assignment, no students: an empty view, not an error.
  assert.deepEqual(buildWorkedExampleView().skills, []);
  assert.deepEqual(buildWorkedExampleView({ assignment: ASSIGNMENT, students: [{ id: '', tracker: {} }, null] }).studentsLooked, 0);
});

test('it says what was recorded, never why, and that no score changes', () => {
  assert.match(WORKED_EXAMPLES_NOTE, /changes no score/);
  assert.match(WORKED_EXAMPLES_NOTE, /do not say the example is why/);
  const said = [view.note, ...view.limitations, ...view.skills.map((skill) => skill.line), ...view.skills.flatMap((skill) => skill.students.flatMap((student) => student.opened.flatMap((entry) => [entry.howLabel, entry.outcomeLabel, entry.next.outcomeLabel])))];
  for (const line of said) assert.doesNotMatch(line, /because|thanks to|helped|worked for|caused|improved|learned|struggl|cheat/i, line);
  // The model returns what it was given, marked up: it has no writer and reads no server.
  const model = executableSource(read('src/platform/teacher/workedExampleView.js'));
  assert.doesNotMatch(model, /firebase|setDoc|updateDoc|getDoc|httpsCallable|onSnapshot/);
  const imports = [...model.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(imports, ['../supports/workedExample/exampleSkill.js', '../assignments/currentContentProjection.js', '../../assignmentLifecycle.js', '../../../functions/shared/gradeEntryStorage.mjs']);
  // The tracker it is handed is not changed.
  const before = JSON.stringify(STUDENTS);
  buildWorkedExampleView({ assignment: ASSIGNMENT, students: STUDENTS });
  assert.equal(JSON.stringify(STUDENTS), before);
});

test('no grade, attempt or mastery path, and nothing on the student\'s side, reads the teacher\'s view', () => {
  const sources = [];
  const walk = (dir) => readdirSync(dir).forEach((name) => {
    if (name === 'node_modules' || name === 'lib') return;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(?:js|jsx|mjs)$/.test(name)) sources.push(full);
  });
  walk(path.join(repo, 'src'));
  walk(path.join(repo, 'functions'));
  const mentions = sources.filter((file) => /workedExampleView|WorkedExamplesBySkill/.test(readFileSync(file, 'utf8'))).map((file) => path.relative(repo, file)).sort();
  assert.deepEqual(mentions, [
    // The gradebook's JSX, which the workspace loads on demand (teacherWorkspaceSource).
    'src/app/teacher/gradebookTabView.jsx',
    'src/app/teacher/teacherPanelPrefetch.js',
    'src/app/teacher/teacherPanels.js',
    'src/components/teacher/WorkedExamplesBySkill.jsx',
  ]);
  // And the panel is the model's only reader.
  assert.deepEqual(sources.filter((file) => /buildWorkedExampleView/.test(readFileSync(file, 'utf8'))).map((file) => path.relative(repo, file)).sort(), ['src/components/teacher/WorkedExamplesBySkill.jsx', 'src/platform/teacher/workedExampleView.js']);
  // Neither first load carries it: the panel is fetched when an assignment's results are open.
  for (const graph of [firstLoadGraph(), teacherFirstLoadGraph()]) {
    assert.ok(!graph.has(path.join(repo, 'src/components/teacher/WorkedExamplesBySkill.jsx')));
    assert.ok(!graph.has(path.join(repo, 'src/platform/teacher/workedExampleView.js')));
  }
});

test('in the teacher\'s results: the class view per skill, and the student\'s view beside the worth-a-conversation notes', () => {
  const workspace = executableSource(teacherWorkspaceSource());
  // The class: every visible student's records for the assignment; a name opens that student's results.
  assert.match(workspace, /\{selectedGradebookPeriod && selectedAssignment && !gradebookFilter\.student && \(\s*<WorkedExamplesBySkill assignment=\{selectedAssignment\} students=\{gradebookVisibleStudents\.map\(\(student\) => \(\{ id: student\.id, name: formatStudentName\(student\), tracker: projectedAssignmentTrackerFor\(\{ student, assignment: selectedAssignment \}\) \|\| \{\}, omitted: studentRequiredQuestions\(\{ assignment: selectedAssignment, profile: student\.profile \|\| null, tracker: student\.gradesByAssignment\?\.\[selectedAssignment\.id\] \|\| null \}\)\.omitted \}\)\)\} onOpenStudent=\{/);
  assert.match(workspace, /onOpenStudent=\{\(studentId\) => \{ const student = gradebookVisibleStudents\.find\(\(entry\) => entry\.id === studentId\); if \(student\) setGradebookFilter\(\(current\) => \(\{ \.\.\.current, student \}\)\); \}\}/);
  // The student: above the question cards, each of which carries its signals (QuestionSignalNotes).
  const single = workspace.indexOf('<WorkedExamplesBySkill single assignment={selectedAssignment} students={[{ id: student.id, name: formatStudentName(student), tracker: studentGrades, omitted: drillRequired.omitted }]} />');
  assert.ok(single !== -1, 'the student view draws the panel for that student');
  assert.ok(single < workspace.indexOf('<QuestionSignalNotes studentId={student.id}'), 'beside the worth-a-conversation notes');
  const panels = executableSource(read('src/app/teacher/teacherPanels.js'));
  assert.match(panels, /^export const WorkedExamplesBySkill = drawnPanel\(\(\) => import\('\.\.\/\.\.\/components\/teacher\/WorkedExamplesBySkill\.jsx'\), ""\);$/m);
  // The panel draws what the model says, and reads nothing itself.
  const panel = executableSource(read('src/components/teacher/WorkedExamplesBySkill.jsx'));
  assert.match(panel, /const view = useMemo\(\(\) => buildWorkedExampleView\(\{ assignment, students \}\), \[assignment, students\]\);/);
  assert.doesNotMatch(panel, /firebase|\bdb\b|getDoc|onSnapshot|httpsCallable/);
  assert.match(panel, /<p style=\{\{ \.\.\.small, margin: '4px 0 0' \}\}>\{view\.note\}<\/p>/);
  assert.match(panel, /data-worked-examples-not-loaded=""/);
  assert.match(panel, /\{view\.limitations\.map\(/);
  // Its one disclosure is a pointer target of at least 24 CSS px (WCAG 2.5.8; the
  // large-text certification measures it), and the student's name is a button.
  assert.match(panel, /<summary style=\{\{ \.\.\.small, cursor: 'pointer', minHeight: 24, padding: '4px 0', boxSizing: 'border-box' \}\}>What this can and cannot say<\/summary>/);
});

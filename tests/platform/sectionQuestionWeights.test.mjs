import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { splitGrade, splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';
import { projectGradeTransferUnits } from '../../src/platform/gradeTransfer/gradeTransferProjection.js';
import { teamsCsv } from '../../src/platform/gradeTransfer/gradeTransferModel.js';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { questionWeightShares } from '../../src/platform/grading/questionWeights.js';
import { buildAssignmentWeightReviewRequest } from '../../src/platform/grading/weightReviewPack.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { assignmentQuestionEditorSource } from './helpers/splitComponentSource.mjs';

const require = createRequire(import.meta.url);
const { classroomPublicationGrade } = require('../../functions/lib/classroomSectionGrade.js');
const { assignmentGradeProgress } = require('../../functions/lib/classroomGradeRuntime.js');
const { runtimeQuestionsFromAssignment } = require('../../functions/lib/assignmentRuntime.js');

/*
 * A QUESTION'S WEIGHT COUNTS INSIDE ITS OWN SECTION, IN EVERY SECTION EXPORT.
 *
 * Warm-Up, Classwork, Practice and DOL leave MathMaster as separate gradebook
 * columns: Grade Transfer's TEAMS rows and Classroom's section coursework. A
 * weight that moved only the whole-assignment grade would change nothing a
 * teacher exports. Each section's grade is weighted within that section
 * (docs/architecture/question-values.md §5); these pin it on every path a
 * section grade leaves by.
 *
 * The fixture: a ×5 Practice question answered right beside two ×1 Practice
 * questions answered wrong. Weighted, Practice is 5 of 7 value units: 71%.
 * With the weight ignored inside the section it would be 1 of 3: 33%.
 */
const lesson = (practiceWeights) => ({
  id: 'weighted-lesson',
  title: 'Weighted lesson',
  schemaVersion: 5,
  assignedClassIds: ['c1'],
  lateDueAt: '2020-01-01T00:00:00Z',
  sections: [
    { id: 'warmup', role: 'warmup', title: 'Warm-Up', questions: [{ questionId: 'w1', questionWeight: 1 }] },
    {
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: practiceWeights.map((questionWeight, index) => ({ questionId: `p${index + 1}`, questionWeight })),
    },
    {
      id: 'dol',
      role: 'dol',
      title: 'DOL',
      questions: [{ questionId: 'd1', questionWeight: 1 }, { questionId: 'd2', questionWeight: 1 }],
    },
  ],
});
const HEAVY_PRACTICE = [5, 1, 1];
const EVEN_PRACTICE = [1, 1, 1];

const right = { status: 'correct', attemptCount: 1, totalAttempts: 1, variantIndex: 0, partialCredit: 100 };
const wrong = { status: 'expired', attemptCount: 3, totalAttempts: 3, variantIndex: 0, partialCredit: 0, bestPartialCredit: 0 };
// Storage order: w1 0 · p1 1, p2 2, p3 3 · d1 4, d2 5.
const TRACKER = { 0: right, 1: right, 2: wrong, 3: wrong, 4: right, 5: wrong };

const exportedPracticeRows = (assignment) => {
  const { units } = projectGradeTransferUnits({
    classes: [{ classId: 'c1', name: 'Algebra I', period: 'P1', teacherOfRecord: 'teacher@school.org' }],
    assignments: [assignment],
    students: [{ id: '1500123', classId: 'c1', displayName: 'Ada Lovelace', gradesByAssignment: { [assignment.id]: TRACKER } }],
    teacherEmail: 'teacher@school.org',
  });
  const practice = units[0].sectionUnits.find((unit) => unit.sectionKey === 'practice');
  return teamsCsv(practice.allRows);
};

const classroomPracticeGrade = (assignment) => classroomPublicationGrade({
  assignment,
  publication: { sectionKey: 'practice' },
  tracker: TRACKER,
  questions: runtimeQuestionsFromAssignment(assignment),
  gradeProgress: assignmentGradeProgress,
});

test('the Practice row Grade Transfer writes for TEAMS carries a heavy question\'s weight', () => {
  assert.equal(exportedPracticeRows(lesson(HEAVY_PRACTICE)), '1500123,71\r\n', '5 of 7 Practice value units');
  assert.equal(exportedPracticeRows(lesson(EVEN_PRACTICE)), '1500123,33\r\n', 'the same answers with every question ×1');
});

test('the Practice grade Classroom section passback sends carries the same weight', () => {
  const heavy = classroomPracticeGrade(lesson(HEAVY_PRACTICE));
  assert.deepEqual(heavy.questionIndices, [1, 2, 3], 'graded over the Practice questions only');
  assert.equal(heavy.grade, 71);
  assert.equal(classroomPracticeGrade(lesson(EVEN_PRACTICE)).grade, 33);
});

test('a Practice weight moves the Practice grade and the overall grade, and no other section', () => {
  const heavy = splitGradesBySection({ tracker: TRACKER, assignment: lesson(HEAVY_PRACTICE) });
  const even = splitGradesBySection({ tracker: TRACKER, assignment: lesson(EVEN_PRACTICE) });

  // The browser split every gradebook, Grade Center and export reads.
  assert.equal(heavy.practice.score, 71);
  assert.equal(even.practice.score, 33);
  assert.equal(heavy.warmup.score, even.warmup.score);
  assert.equal(heavy.dol.score, even.dol.score);

  // And the whole-assignment grade: (1 + 5 + 1) of (1 + 7 + 2) value units.
  assert.equal(splitGrade({ tracker: TRACKER, assignment: lesson(HEAVY_PRACTICE) }).score, 70);
  assert.equal(splitGrade({ tracker: TRACKER, assignment: lesson(EVEN_PRACTICE) }).score, 50);
});

/*
 * WHAT THE TEACHER IS SHOWN IS WHAT THE GRADE DOES.
 *
 * The question editor states each weight as a share of its own section's
 * grade (the column Grade Transfer and Classroom export) and of the whole
 * assignment's. Those numbers must be the grades themselves: a student who
 * earns ONLY that question gets exactly that share of its section, and of the
 * assignment. Includes a question whose own activityRole moves it out of the
 * section it is stored in, which the grade follows.
 */
const mixedLesson = () => {
  const assignment = lesson(HEAVY_PRACTICE);
  assignment.sections[0].questions.push({ questionId: 'w2-practice', activityRole: 'practice', questionWeight: 2 });
  return assignment;
};

test('the editor\'s section and assignment shares are the grades a student earns from that question alone', () => {
  for (const assignment of [lesson(HEAVY_PRACTICE), lesson(EVEN_PRACTICE), mixedLesson()]) {
    const questions = getStoredAssignmentQuestions(assignment);
    const shares = questionWeightShares(questions);
    questions.forEach((question, onlyRight) => {
      const tracker = Object.fromEntries(questions.map((_, index) => [index, index === onlyRight ? right : wrong]));
      const share = shares[onlyRight];
      assert.equal(share.sectionCount, 3);
      assert.equal(
        splitGradesBySection({ tracker, assignment })[share.role].score,
        Math.round(share.sectionShare),
        `${question.questionId}: its ${share.role} share is the ${share.role} grade it earns alone`,
      );
      assert.equal(splitGrade({ tracker, assignment }).score, Math.round(share.assignmentShare), `${question.questionId}: and its assignment share`);
    });
  }

  const shares = questionWeightShares(getStoredAssignmentQuestions(mixedLesson()));
  assert.equal(shares[1].role, 'practice', 'stored in Warm-Up, graded as Practice');
  assert.equal(Math.round(shares[2].sectionShare * 10) / 10, 55.6, 'the ×5 question is 5 of the 9 Practice units');
});

test('an excluded question has no share and leaves every denominator', () => {
  const questions = getStoredAssignmentQuestions(lesson(HEAVY_PRACTICE))
    .map((question) => (question.questionId === 'p2' ? { ...question, teacherExcluded: true } : question));
  const shares = questionWeightShares(questions);
  assert.equal(shares[2], null);
  assert.equal(Math.round(shares[1].sectionShare * 10) / 10, 83.3, '5 of the 6 Practice units left');
  assert.equal(Math.round(shares[1].assignmentShare * 10) / 10, 55.6, '5 of the 9 units left');
});

test('the question editor\'s GRADE badge shows the question\'s share of its own section', () => {
  const editor = assignmentQuestionEditorSource();
  // A .jsx call with no import passes the build and lint; it fails only at runtime.
  assert.match(editor, /import \{[^}]*\bquestionWeightShares\b[^}]*\} from '\.\/platform\/grading\/questionWeights\.js'/);
  assert.match(editor, /import \{[^}]*\bV5_SECTION_TITLES\b[^}]*\} from '\.\/platform\/contract\/assignmentSchemaV5\.js'/);
  assert.match(editor, /const weightShares = useMemo\(\(\) => questionWeightShares\(questions\), \[questions\]\)/);

  // The badge is drawn per card, indexed like the list the shares were computed from.
  const cards = region(editor, '{questions.map((question, index) => {', 'data-supersession-notice', 'question cards');
  const badge = region(cards, 'title={describeQuestionValue(question).sentence}', '</span>', 'GRADE badge');
  assert.match(badge, /weightShares\[index\]\.sectionShare\.toFixed\(1\)\}% of \$\{V5_SECTION_TITLES\[weightShares\[index\]\.role\]/);
  assert.match(badge, /weightShares\[index\]\.assignmentShare\.toFixed\(1\)\}% of assignment/);
});

test('the AI weight review is told a weight counts inside its own section', () => {
  const assignment = lesson(HEAVY_PRACTICE);
  const request = buildAssignmentWeightReviewRequest({ assignment, questions: getStoredAssignmentQuestions(assignment) });
  assert.match(request, /graded on its own and exported as its own gradebook column/);
  assert.match(request, /share of its OWN SECTION's grade, and also of the whole-assignment grade/);
  assert.match(request, /Never scale a whole section up or down/);
  assert.doesNotMatch(request, /contribute to the WHOLE assignment grade/);
});

test('the Teacher Path Simulator grades a simulated student with the same weighted split', () => {
  // The simulated dashboard's "Current grade" comes from this provider. A private
  // copy of the arithmetic once ignored question weights and returned 0 for every
  // V5 assignment (it looked for a flat questions list V5 does not have).
  const simulator = executableSource(componentSource('src/components/teacher/SimulatedStudentExperience.jsx'));
  assert.match(simulator, /import \{ splitGrade \} from '\.\.\/\.\.\/platform\/teacher\/gradeEvidence\.js'/);
  assert.match(simulator, /import \{ getStoredAssignmentQuestions \} from '\.\.\/\.\.\/platform\/contract\/storedAssignmentV5\.js'/);
  const grade = region(simulator, 'const calculateGrade = (', '\n};', 'simulator calculateGrade');
  assert.match(grade, /getStoredAssignmentQuestions\(assignmentData\)\.length/, 'a V5 assignment keeps its questions in sections');
  assert.match(grade, /return splitGrade\(\{ tracker: assignmentTracker, assignment: assignmentData, practicePassRedeemed, supportProfile \}\)\.score \?\? 0/);
  assert.doesNotMatch(grade, /getQuestionCredit|\.questions\?\.length/, 'no private, unweighted average');
  const providers = region(simulator, 'providers: {', '},', 'simulated dashboard providers');
  assert.match(providers, /\bcalculateGrade,/);
});

test('a student is told a weighted question counts in this section\'s grade, not only the assignment\'s', () => {
  const engine = componentSource('src/QuestionEngine.jsx');
  const note = region(engine, '{questionGradeWeight !== 1 && (', '</div>', 'student weight note');
  assert.match(note, /times a standard-weight question in this section&apos;s grade and in the assignment grade/);
});

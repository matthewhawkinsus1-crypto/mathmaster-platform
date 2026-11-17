/*
 * STORED ASSIGNMENTS FOR THE QUESTION EDITOR'S PRE-FLIGHT FINDINGS.
 *
 * Algebra I M3 T2 L2 as a teacher's import stores it: its Classwork 18
 * (Question 21) says "Use the prices you found", an advisory note, and every
 * question has the notes that no Spanish is written. Two Step Algebra
 * questions are added the way a replacement or a repair pack adds them,
 * without the import that would rewrite them, so they keep the shapes
 * Pre-Flight warns about: a given written x(x - 5) = 0, and an equation whose
 * variable cancels. Used by questionEditorPreflightFindings.test.mjs and,
 * built in node and handed to the page, by tests/browser/questionEditorPreflight.mjs.
 */
import { readFileSync } from 'node:fs';

import { compileTeacherImport } from '../../../scripts/check-teacher-import.mjs';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from '../../../src/platform/contract/assignmentSchemaV5.js';

const LESSON_FILE = new URL('../../../teacher-import-jsons/algebra1-module3/T2_L2_Solving_Systems_by_Substitution.json', import.meta.url);

export const PRODUCT_QUESTION_ID = 'editor-preflight-product';
export const CANCELS_QUESTION_ID = 'editor-preflight-cancels';
/** Classwork 18, "Use the prices you found". */
export const NOTED_QUESTION_ID = 'm3t2l2-cw-18';

let compiled = null;
const lesson = () => {
  compiled = compiled || compileTeacherImport(readFileSync(LESSON_FILE, 'utf8')).model.assignmentV5;
  return compiled;
};

const storedFrom = (assignmentV5, questions, extra = {}) => ({
  id: 'asg-editor-preflight',
  schemaVersion: 5,
  title: assignmentV5.assignment.title,
  courseId: assignmentV5.assignment.courseId,
  folder: assignmentV5.assignment.folder,
  instructionalPurpose: assignmentV5.assignment.instructionalPurpose,
  gradingPurpose: assignmentV5.assignment.gradingPurpose,
  variantPolicy: assignmentV5.variantPolicy,
  assignedClassIds: ['period-3'],
  sections: rebuildV5SectionsFromQuestions(assignmentV5, questions),
  ...extra,
});

/** The two Step Algebra questions, stored as a replacement would store them. */
export const warnedQuestions = () => {
  const classwork = flattenV5Sections(lesson()).find((question) => question.activityRole === 'classwork');
  const asStored = { activityRole: 'classwork', sectionId: classwork.sectionId, alignments: classwork.alignments, dok: 2 };
  return [
    { ...asStored, questionId: PRODUCT_QUESTION_ID, type: 'stepAlgebra', prompt: 'Solve $x(x-5)=0$.', equationLatex: 'x(x - 5) = 0', solveFor: 'x', relationWorkspace: true },
    { ...asStored, questionId: CANCELS_QUESTION_ID, type: 'stepAlgebra', prompt: 'Solve.', equation: '2x + 3 = 2x + 5' },
  ];
};

/** The lesson with a question Pre-Flight warns about twice over, and one with a note. */
export const editorPreflightAssignment = (extra = {}) => storedFrom(lesson(), [...flattenV5Sections(lesson()), ...warnedQuestions()], extra);

/**
 * A large assignment: that one with the lesson's questions in it twice, the
 * second time under new ids (82 questions, about twice the repository's
 * largest lesson), for what an edit costs.
 */
export const largeEditorAssignment = () => {
  const questions = flattenV5Sections(lesson());
  const again = questions.map((question) => ({ ...question, questionId: `${question.questionId}-again` }));
  return storedFrom(lesson(), [...questions, ...warnedQuestions(), ...again], { id: 'asg-editor-preflight-large' });
};

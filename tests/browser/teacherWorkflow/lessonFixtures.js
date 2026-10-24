// REAL LESSONS, AS A STUDENT'S ASSIGNMENT IN THE HARNESS (PH10).
//
// `?questions=matrices` makes today's lesson (a-today) the Algebra II · Module 1
// · Topic 2 · Lesson 3 lesson of Solving Systems with Matrices: Matrix Lab
// items with their Check button, a figure sort, a three-box Warm-Up, an exit
// ticket. The questions are NOT the raw JSON: they go through the chain a
// teacher import and publish run (parse -> preflight review -> preflight model
// -> validateAssignmentQuestions -> rebuildV5SectionsFromQuestions), exactly as
// tests/browser/algebra2MatricesLessonMain.jsx mounts them, because import
// recompiles by studentActions and raw JSON can pass where the published
// assignment is broken.
//
// Browser only (a Vite `?raw` import), and loaded by fakeFirestore.js only when
// the page asks for it, so the node journeys that import fixture.js never
// reach it.
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from '../../../src/platform/contract/assignmentSchemaV5.js';
import MATRICES_TEXT from '../../../teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json?raw';

const LESSON_TEXT = Object.freeze({ matrices: MATRICES_TEXT });

const compile = (text) => {
  const parsed = parseAssignmentBlueprintText(text);
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  if (!model.isValid) throw new Error(`Preflight rejected the lesson:\n${model.errors.join('\n')}`);
  const questions = validateAssignmentQuestions(flattenV5Sections(model.assignmentV5), {});
  return rebuildV5SectionsFromQuestions(model.assignmentV5, questions);
};

const compiled = new Map();

// A copy per assignment, so one lesson's edits never reach another's.
export const lessonSectionsFor = (name) => {
  if (!LESSON_TEXT[name]) throw new Error(`No lesson called "${name}" (${Object.keys(LESSON_TEXT).join(', ')})`);
  if (!compiled.has(name)) compiled.set(name, compile(LESSON_TEXT[name]));
  return JSON.parse(JSON.stringify(compiled.get(name)));
};

export const REAL_LESSON_NAMES = Object.freeze(Object.keys(LESSON_TEXT));

/*
 * THE PRODUCTION HONORS-EXTENSION CASE, AS FIXTURES.
 *
 * An Algebra I assignment whose core family is linear.multipleRepresentations
 * (the certified family-backed lesson in docs/assignments), published to an
 * Honors class whose course profile said Algebra II. The old no-AI generator
 * (courseRigor.buildHonorsEnrichmentQuestion, contract version 1) gave it the
 * question below: an "Algebra II Honors extension" graphStory that asks the
 * student to represent a relationship "with a graph" and justify why "the
 * graph is reasonable" — with no graph, no functionSpec, and nothing to grade
 * but character counts. It is written out literally, exactly as production
 * stored it, so the tests do not depend on the generator that made it.
 */
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from '../../../src/platform/contract/assignmentSchemaV5.js';
import { getStoredAssignmentQuestions, storedAssignmentToV5 } from '../../../src/platform/contract/storedAssignmentV5.js';

const read = (relPath) => readFileSync(new URL(`../../../${relPath}`, import.meta.url), 'utf8');

export const LMR_FAMILY_FILE = 'docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json';

export const PRODUCTION_LEGACY_HONORS_QUESTION = Object.freeze({
  questionId: 'legacy-honors-ext-1',
  type: 'graphStory',
  familyId: 'honors-modeling-algebra2',
  activityRole: 'classwork',
  dok: 3,
  difficultyBand: 4,
  teks: ['A.3C'],
  tags: ['honors', 'modeling', 'multiple-representations', 'justification'],
  honorsEnrichment: { generatedBy: 'MathMaster', contractVersion: 1, source: 'deterministic-policy' },
  prompt: 'Algebra II Honors extension: Create a realistic situation connected to TEKS A.3C. Define the quantities, represent their relationship with a graph, and justify why the graph is reasonable. Then explain what one important feature of the model means in context.',
  variants: [
    { prompt: 'Algebra II Honors extension: Create a realistic situation connected to TEKS A.3C. Define the quantities, represent their relationship with a graph, and justify why the graph is reasonable. Then explain what one important feature of the model means in context.' },
    { prompt: 'Algebra II Honors extension: Design a different real-world model connected to TEKS A.3C. Identify the independent and dependent quantities, sketch and label a graph, justify its important features, and explain what one important feature of your representation means in context.' },
  ],
  minimumScenarioCharacters: 35,
  minimumExplanationCharacters: 45,
  questionWeight: 1.5,
});

const clone = (value) => JSON.parse(JSON.stringify(value));

/** The certified Algebra I Multiple Representations lesson, through the real import + publish chain. */
export const publishLmrLesson = () => {
  const parsed = parseAssignmentBlueprintText(read(LMR_FAMILY_FILE));
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  if (!model.isValid) throw new Error(`fixture lesson no longer passes Pre-Flight:\n${model.errors.join('\n')}`);
  const questions = validateAssignmentQuestions(flattenV5Sections(model.assignmentV5), {});
  return { assignmentV5: model.assignmentV5, questions };
};

/**
 * A stored Honors destination of that lesson with one extra Classwork question
 * — placed the way publish places the Honors extension: at the end of the
 * Classwork section, which Practice and the DOL follow.
 */
export const storedHonorsAssignment = (extensionQuestion, { id = 'asg-honors-lmr', courseProfileCourse = 'algebra2' } = {}) => {
  const { assignmentV5, questions } = publishLmrLesson();
  const extension = { ...clone(extensionQuestion), activityRole: 'classwork' };
  delete extension.sectionId;
  const sections = rebuildV5SectionsFromQuestions(assignmentV5, [...questions, extension]);
  return {
    id,
    schemaVersion: 5,
    title: assignmentV5.assignment.title,
    courseId: assignmentV5.assignment.courseId,
    courseProfile: { course: courseProfileCourse, courseLevel: 'honors' },
    rigorVariant: 'honors',
    honorsContractVersion: 1,
    folder: assignmentV5.assignment.folder,
    instructionalPurpose: assignmentV5.assignment.instructionalPurpose,
    gradingPurpose: assignmentV5.assignment.gradingPurpose,
    variantPolicy: assignmentV5.variantPolicy,
    assignedClassIds: ['period-4-honors'],
    sections,
  };
};

/** The production assignment: the lesson plus the legacy v1 graphStory. */
export const productionHonorsAssignment = () => storedHonorsAssignment(PRODUCTION_LEGACY_HONORS_QUESTION);

/** What the Assignment Question Editor holds for a stored assignment. */
export const editorQuestionsOf = (stored) => clone(getStoredAssignmentQuestions(stored));

/**
 * The editor's save path (App.jsx saveQuestionEditor): rebuild the candidate
 * from the edited question list and judge it with the full assignment
 * Pre-Flight. `stored` is the record the rebuild reads its sections from (a
 * swap passes it through withAppendedQuestionSections first).
 */
export const preflightEditorCandidate = (stored, questions) => (
  buildAssignmentV5PreflightModel(storedAssignmentToV5(stored, { questions }))
);

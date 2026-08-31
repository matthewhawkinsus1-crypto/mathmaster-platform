import { rebuildV5SectionsFromQuestions } from '../contract/assignmentSchemaV5.js';
import {
  getStoredAssignmentQuestions,
  storedAssignmentToV5,
} from '../contract/storedAssignmentV5.js';
import { buildAssignmentV5PreflightModel } from '../preflight/assignmentV5PreflightModel.js';

const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const sameJson = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

const isUnassignedLibraryRecord = (assignment = {}) => (
  (!Array.isArray(assignment.assignedClassIds) || assignment.assignedClassIds.filter(Boolean).length === 0)
  && (!Array.isArray(assignment.assignedClassPeriods) || assignment.assignedClassPeriods.filter(Boolean).length === 0)
);

const orderedQuestionIds = (assignment = {}) => (
  getStoredAssignmentQuestions(assignment).map((question) => clean(question?.questionId))
);

const isCollapsedWorkflowCopy = (targetQuestion = {}, sourceQuestion = {}) => {
  const targetId = clean(targetQuestion.questionId);
  const sourceId = clean(sourceQuestion.questionId);
  if (!targetId || targetId !== sourceId) return false;
  if (!Array.isArray(sourceQuestion.workflow) || sourceQuestion.workflow.length < 2) return false;
  if (Array.isArray(targetQuestion.workflow) && targetQuestion.workflow.length > 0) return false;
  if (!sameJson(targetQuestion.studentActions || [], sourceQuestion.studentActions || [])) return false;
  if (clean(targetQuestion.prompt) !== clean(sourceQuestion.prompt)) return false;

  // This is the exact V5 self-round-trip failure that used to collapse a
  // composed function workflow into the legacy free-plot renderer. Keep the
  // detector narrow so a deliberate teacher rewrite can never be "repaired"
  // merely because another library question happens to share an id.
  return targetQuestion.type === 'functionGraph'
    && sourceQuestion.type === 'functionGraph'
    && targetQuestion.studentChoosesX === true
    && isObject(targetQuestion.functionSpec)
    && clean(targetQuestion.functionSpec.type).toLowerCase() === 'linear'
    && Number(targetQuestion.functionSpec.m) === 1
    && Number(targetQuestion.functionSpec.b) === 0;
};

export const prepareStoredAssignmentForReuse = (assignment, { resetAssignmentKey = true } = {}) => {
  const canonicalV5 = storedAssignmentToV5(assignment, { resetAssignmentKey });
  const model = buildAssignmentV5PreflightModel(canonicalV5);
  if (!model.isValid) {
    throw new Error(
      `This saved assignment cannot be reused until MathMaster's current assignment checks are clean:\n${model.errors.join('\n')}`,
    );
  }
  return {
    assignmentV5: model.assignmentV5,
    questions: model.questions,
    warnings: model.warnings,
  };
};

export const inspectLibraryContentRepair = (targetAssignment, assignments = []) => {
  if (!targetAssignment || isUnassignedLibraryRecord(targetAssignment)) {
    return { source: null, questionIds: [], reason: 'target-is-library' };
  }

  const targetQuestions = getStoredAssignmentQuestions(targetAssignment);
  if (!targetQuestions.length) {
    return { source: null, questionIds: [], reason: 'target-has-no-questions' };
  }
  const targetIds = orderedQuestionIds(targetAssignment);

  const candidates = (Array.isArray(assignments) ? assignments : [])
    .filter((candidate) => candidate?.id && candidate.id !== targetAssignment.id)
    // Prefer the reusable Library source, but also accept an intact sibling
    // delivery. A teacher may have created the broken class copy before the
    // Library workflow was fixed, while another class still has the exact
    // canonical question students originally received.
    .map((source) => {
      const sourceQuestions = getStoredAssignmentQuestions(source);
      const sourceById = new Map(sourceQuestions.map((question) => [clean(question?.questionId), question]));
      const repairable = targetQuestions.filter((targetQuestion) => (
        isCollapsedWorkflowCopy(targetQuestion, sourceById.get(clean(targetQuestion?.questionId)))
      ));
      if (!repairable.length) return null;

      const sourceIds = orderedQuestionIds(source);
      const exactOrder = sameJson(targetIds, sourceIds);
      const sameTitle = clean(source.title).toLowerCase() === clean(targetAssignment.title).toLowerCase();
      const sameCourse = clean(source.courseId || source.assignment?.courseId).toLowerCase()
        === clean(targetAssignment.courseId || targetAssignment.assignment?.courseId).toLowerCase();

      return {
        source,
        questionIds: repairable.map((question) => clean(question.questionId)),
        score: repairable.length * 100
          + (isUnassignedLibraryRecord(source) ? 50 : 0)
          + (exactOrder ? 20 : 0)
          + (sameTitle ? 10 : 0)
          + (sameCourse ? 5 : 0),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);

  if (!candidates.length) return { source: null, questionIds: [], reason: 'no-matching-canonical-source' };
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) {
    return { source: null, questionIds: [], reason: 'ambiguous-library-source' };
  }
  return {
    source: candidates[0].source,
    questionIds: candidates[0].questionIds,
    reason: null,
  };
};

export const buildSafeLibraryContentRepair = (targetAssignment, sourceAssignment) => {
  const targetQuestions = getStoredAssignmentQuestions(targetAssignment);
  const sourceQuestions = getStoredAssignmentQuestions(sourceAssignment);
  const sourceById = new Map(sourceQuestions.map((question) => [clean(question?.questionId), question]));
  const repairedQuestionIds = [];

  const repairedQuestions = targetQuestions.map((targetQuestion) => {
    const sourceQuestion = sourceById.get(clean(targetQuestion?.questionId));
    if (!isCollapsedWorkflowCopy(targetQuestion, sourceQuestion)) return targetQuestion;
    repairedQuestionIds.push(clean(targetQuestion.questionId));
    return {
      ...sourceQuestion,
      // Delivery identity/order is owned by the already-live assignment.
      questionId: targetQuestion.questionId,
      activityRole: targetQuestion.activityRole,
      sectionId: targetQuestion.sectionId,
      sectionTitle: targetQuestion.sectionTitle,
      teacherExcluded: targetQuestion.teacherExcluded === true,
    };
  });

  if (!repairedQuestionIds.length) {
    throw new Error('No safely repairable collapsed workflow questions were found in this assignment.');
  }

  const candidateV5 = storedAssignmentToV5(targetAssignment, {
    questions: repairedQuestions,
    resetAssignmentKey: false,
  });
  candidateV5.sections = rebuildV5SectionsFromQuestions(targetAssignment, repairedQuestions);
  const model = buildAssignmentV5PreflightModel(candidateV5);
  if (!model.isValid) {
    throw new Error(
      `MathMaster found a problem while validating the in-place repair:\n${model.errors.join('\n')}`,
    );
  }

  const beforeIds = orderedQuestionIds(targetAssignment);
  const afterIds = model.questions.map((question) => clean(question?.questionId));
  if (!sameJson(beforeIds, afterIds)) {
    throw new Error('The repair would change question identity or order, so MathMaster stopped before touching student work.');
  }

  return {
    sections: model.assignmentV5.sections,
    repairedQuestionIds,
  };
};

export { isCollapsedWorkflowCopy, isUnassignedLibraryRecord };

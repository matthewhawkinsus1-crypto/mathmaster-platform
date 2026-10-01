/*
 * Grading declarations for every NON-registry question surface QuestionEngine
 * renders (src/QuestionEngine.jsx's type switch), every catalogued type
 * (functions/shared/questionTypeCatalog.mjs) and composed workflows.
 *
 * Light: declarations only. The graders live in ../serverResponseGrading.mjs
 * (ordinary types delegate to ../../ordinaryResponseGrading.mjs).
 */
import {
  declareClientGraded,
  declareNonGraded,
  declareOrdinary,
  declareQuestionGrader,
  declareSubsystem,
} from '../surfaceDeclarations.mjs';

const PENDING = (type) => declareClientGraded({ blocker: `PENDING: grading audit for question type ${type}.` });

/*
 * Step Algebra: a Question Family instance carries its generated answer, so the
 * server can confirm the student's FINAL equation isolates the variable at the
 * instance's value (questionFamilyGrading.mjs gradeStepAlgebraFinalAnswer).
 */
const stepAlgebraFinalAnswer = declareQuestionGrader({
  graderVersion: 'step-algebra-final-answer-v1',
  supports: (question) => (
    Number.isFinite(Number(question?.generatedAnswer))
      ? { supported: true }
      : { supported: false, reason: 'no-step-answer-key' }
  ),
  blocker: 'PENDING: grading audit for authored (non-family) Step Algebra questions.',
});

export default Object.freeze({
  literal: declareOrdinary(),
  multiAnswer: declareOrdinary(),
  orderedPair: declareOrdinary(),
  system: declareOrdinary(),
  table: declareOrdinary(),
  fraction: PENDING('fraction'),
  numberLine: PENDING('numberLine'),
  stepAlgebra: stepAlgebraFinalAnswer,
  algebra: stepAlgebraFinalAnswer,
  graphing: PENDING('graphing'),
  functionGraph: PENDING('functionGraph'),
  functionInvestigation: PENDING('functionInvestigation'),
  graphAnalysis: PENDING('graphAnalysis'),
  functionCharacteristics: PENDING('functionCharacteristics'),
  relationshipModel: PENDING('relationshipModel'),
  graphScenarioMatch: PENDING('graphScenarioMatch'),
  graphComparison: PENDING('graphComparison'),
  graphStory: PENDING('graphStory'),
  contextInterpretation: PENDING('contextInterpretation'),
  composedWorkflow: PENDING('composedWorkflow'),
  modelingLab: declareSubsystem({
    subsystem: 'modeling-lab-server-evaluation',
    note: 'PENDING: confirm the Modeling Lab server evaluator owns the verdict.',
  }),
  platformQuestionError: declareNonGraded({
    reason: 'A placeholder shown when MathMaster could not prepare a question; the student cannot answer it and no attempt is recorded.',
  }),
});

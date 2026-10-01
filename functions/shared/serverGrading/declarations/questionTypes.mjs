/*
 * Structured question surfaces (graphing, graphScenarioMatch, graphComparison,
 * graphStory, contextInterpretation, relationshipModel and the interactive
 * graph workspace types) are declared in their own files and joined in
 * ../gradingManifest.mjs STRUCTURED_TYPE_DECLARATIONS.
 *
 * Grading declarations for every NON-registry question surface QuestionEngine
 * renders (src/QuestionEngine.jsx's type switch), every catalogued type
 * (functions/shared/questionTypeCatalog.mjs) and composed workflows.
 *
 * Light: declarations only. The graders live in ../serverResponseGrading.mjs
 * (ordinary types delegate to ../../ordinaryResponseGrading.mjs).
 */
import {
  declareNonGraded,
  declareOrdinary,
  declareSubsystem,
} from '../surfaceDeclarations.mjs';

import fraction from './types/fraction.mjs';
import numberLine from './types/numberLine.mjs';
import stepAlgebra from './types/stepAlgebra.mjs';
import literalWorkspace from './types/literalWorkspace.mjs';
import composedWorkflow from './types/composedWorkflow.mjs';
import functionCharacteristics from './types/functionCharacteristics.mjs';
import figureMatch from './types/figureMatch.mjs';
import graphChoicePreview from './types/graphChoicePreview.mjs';

export default Object.freeze({
  literal: declareOrdinary(),
  multiAnswer: declareOrdinary(),
  orderedPair: declareOrdinary(),
  system: declareOrdinary(),
  table: declareOrdinary(),
  fraction,
  numberLine,
  stepAlgebra,
  // The retired answer-box solver; QuestionEngine renders it as the same
  // balance workspace, so it is the same surface.
  algebra: stepAlgebra,
  // A literal question that asks for the balance workspace is answered with
  // a final equation, not a typed expression (see gradingManifest.mjs).
  literalWorkspace,
  functionCharacteristics,
  figureMatch,
  graphChoicePreview,
  composedWorkflow,
  // Graded by the submitModelingLab callable (functions/lib/labEvaluation.js),
  // which writes the evaluation to a server-owned marker. Ingestion records
  // the gradebook attempt from THAT marker (serverGrading/
  // modelingLabGrading.mjs), never from the browser's relay; an attempt with
  // no evaluation is held for teacher review.
  modelingLab: declareSubsystem({
    subsystem: 'modeling-lab-server-evaluation',
    note: 'Evaluated by the submitModelingLab callable; the gradebook attempt is recorded from its server-written modelingLabSubmissions marker.',
  }),
  platformQuestionError: declareNonGraded({
    reason: 'A placeholder shown when MathMaster could not prepare a question; the student cannot answer it and no attempt is recorded.',
  }),
});

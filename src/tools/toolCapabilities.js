// Per-tool capability declarations.
//
// A WARNING ABOUT THIS FILE. These flags are DECLARATIONS, and for most of
// their life nothing read them: an audit of every consumer found only a
// Markdown line in an AI authoring prompt and a JSON dump on a developer
// bench. Nothing gated behaviour on them, so they drifted from the truth —
// every tool used to declare `supportsSolutionReview: true` while
// `buildToolSolutionReviewModel` returned a review for six of them and null
// for the other thirteen.
//
// `supportsSolutionReview` is now kept honest by a test that compares it
// against the review builder's actual branches. Before adding a flag here,
// ask what code will enforce it — and prefer deriving the answer, the way
// `src/platform/supports/toolSupportMatrix.js` does, over asserting it.

export const TOOL_CAPABILITIES = {
  dataModelingLab: { supportsAttempts: true, supportsSolutionReview: false, supportsCalculator: true, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: true },
  inverseCompositionLab: { supportsAttempts: true, supportsSolutionReview: false, supportsCalculator: false, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: true },
  systemsWorkspace: { supportsAttempts: true, supportsSolutionReview: false, supportsCalculator: true, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: true },
  parabolaGeometryLab: { supportsAttempts: true, supportsSolutionReview: false, supportsCalculator: true, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: true },
  polynomialWorkshop: { supportsAttempts: true, supportsSolutionReview: false, supportsCalculator: true, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: true },
  signSolutionAnalyzer: { supportsAttempts: true, supportsSolutionReview: false, supportsCalculator: false, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: true },
  sequenceExplorer: { supportsAttempts: true, supportsSolutionReview: true, supportsCalculator: true, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: true },
  complexPlaneLab: { supportsAttempts: true, supportsSolutionReview: false, supportsCalculator: true, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: true },
  exponentialLogBridge: { supportsAttempts: true, supportsSolutionReview: false, supportsCalculator: true, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: true },
  transformationsLab: { supportsAttempts: true, supportsSolutionReview: false, supportsCalculator: true, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: true },
  representationMatch: { supportsAttempts: true, supportsSolutionReview: true, supportsCalculator: false, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: true },
  functionInvestigation2: { supportsAttempts: true, supportsSolutionReview: true, supportsCalculator: true, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: true },
  graphing2: { supportsAttempts: true, supportsSolutionReview: false, supportsCalculator: false, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: true },
  intervalNumberLine: { supportsAttempts: true, supportsSolutionReview: false, supportsCalculator: false, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: true },
  relationMapping: { supportsAttempts: true, supportsSolutionReview: true, supportsCalculator: false, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: true },
  openSortBoard: { supportsAttempts: true, supportsSolutionReview: true, supportsCalculator: false, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: false },
  constraintFunctionBuilder: { supportsAttempts: true, supportsSolutionReview: true, supportsCalculator: true, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: false },
  stepAlgebra2: { supportsAttempts: true, supportsSolutionReview: false, supportsCalculator: false, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: true },
  solutionReview2: { supportsAttempts: false, supportsSolutionReview: true, supportsCalculator: false, supportsScaffolds: false, supportsModifiedContent: false, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: false },
};

TOOL_CAPABILITIES.intervalNumberLine = { supportsAttempts: true, supportsSolutionReview: true, supportsCalculator: false, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: true };
TOOL_CAPABILITIES.relationMapping = { supportsAttempts: true, supportsSolutionReview: true, supportsCalculator: false, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: true };
TOOL_CAPABILITIES.openSortBoard = { supportsAttempts: true, supportsSolutionReview: true, supportsCalculator: false, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: true };
TOOL_CAPABILITIES.constraintFunctionBuilder = { supportsAttempts: true, supportsSolutionReview: true, supportsCalculator: false, supportsScaffolds: true, supportsModifiedContent: true, supportsTeacherPreview: true, supportsDemoMode: true, supportsAssessmentMode: true };

export const getToolCapabilities = (toolId) => TOOL_CAPABILITIES[toolId] || {};

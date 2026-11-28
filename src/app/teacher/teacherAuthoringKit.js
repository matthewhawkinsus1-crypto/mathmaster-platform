/*
 * THE AUTHORING CODE THE TEACHER'S WORKSPACE RUNS FOR AN ACTION.
 *
 * TeacherWorkspace.jsx imported these statically, and with them Pre-Flight's
 * model, the assignment compiler and its checks, the graders they run, live
 * corrections, Library reuse, Honors CCMR and Recovery planning: about 1 MB
 * gzip that every teacher downloaded, parsed and compiled before their first
 * screen drew (scripts/check-first-load-budget.mjs, teacherHome), though no
 * screen draws with it. An action runs it: an import or a pasted lesson,
 * Review / Edit Setup and Create, Duplicate, a question edit, a Library
 * repair, Dates & Classes for a Library lesson or an added class. The
 * Assignments list reads two checks from it on each card (Recovery can be
 * added; a Library copy to repair from), and waits for it as for its own code.
 *
 * The workspace loads this module on demand (./authoringKitLoader.js): fetched
 * while the browser is idle once the workspace has drawn, and at once by the
 * action or the screen that needs it first.
 *
 * Only re-exports: the logic stays in its own module, where its tests are.
 */
export { parseAssignmentBlueprintText, validateAssignmentQuestions, assertFirestoreSafeAssignmentPayload } from '../../assignmentBlueprint.js';
export { markIncompleteAssignmentDraftPublished } from '../../platform/preflight/incompleteAssignmentDraftStore.js';
export { validateQuestionsSemantics } from '../../platform/contract/semanticValidation.js';
export { buildAssignmentV5PreflightModel } from '../../platform/preflight/assignmentV5PreflightModel.js';
export { canSalvageV5IntakeResult } from '../../platform/preflight/assignmentAuthoringState.js';
export { questionFingerprint, repairAssignmentTrackerForGranularWorkflowCredit, repairAssignmentTrackerForLiveCorrections } from '../../platform/assignment/liveQuestionCorrection.js';
export { GRAPH_VIEWPORT_REPAIR_KIND } from '../../../functions/shared/liveResponseRepairPolicy.mjs';
export { normalizeLabDefinition } from '../../platform/labs/labDefinitionSchema.js';
export { buildSafeLibraryContentRepair, inspectLibraryContentRepair, prepareStoredAssignmentForReuse } from '../../platform/assignments/libraryAssignmentReuse.js';
export { confirmHonorsCandidateForCreate, proveImportedCcmrClaims } from '../../platform/assignments/canonicalCcmrHydration.js';
export { ccmrAuditWarnings } from '../../platform/assignments/ccmrAuditWarnings.js';
export { certifyHonorsExtensionQuestion } from '../../platform/rigor/honorsExtensionRecipes.js';
export { withAppendedQuestionSections } from '../../platform/rigor/honorsExtensionSwap.js';
export { creationRecoveryContent } from '../../platform/recovery/recoveryContentAuthoring.js';
export { recoveryPreparationAvailable } from '../../../functions/shared/recoveryContentPlan.mjs';
export { stripAssignmentInstanceState } from '../../../functions/shared/assignmentPrivacy.mjs';

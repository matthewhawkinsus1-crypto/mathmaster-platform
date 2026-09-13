/*
 * THE TEST CYCLE, FOR THE BROWSER.
 *
 * Every rule lives in functions/shared/testCycle*.mjs because Cloud Functions
 * deploy only the functions/ directory and cannot import from src/. This file
 * is a re-export and nothing else: there is no second definition of the capped
 * grade rule, the corrections algorithm or the retest targeting here for a
 * screen to disagree with the server about.
 *
 * If you are about to add a calculation to this file, it belongs in the shared
 * module instead.
 */

export {
  TEST_CYCLE_MODE,
  DEFAULT_PASSING_SCORE,
  DEFAULT_MAX_RECORDED_RETEST_GRADE,
  DEFAULT_TARGETED_WEAK_SHARE,
  DEFAULT_ANCHOR_SHARE,
  TEACHER_CONTROL_ACTIONS,
  applyTeacherControlAction,
  defaultTestCyclePolicy,
  isTestCycleAssignment,
  isTestCyclePolicy,
  normalizeTeacherControls,
  normalizeTestCyclePolicy,
} from '../../../functions/shared/testCyclePolicy.mjs';

export {
  GRADE_SOURCE,
  GRADE_HISTORY_REASON,
  appendTestCycleGradeHistory,
  buildTestCycleGradeState,
  cappedRetestContribution,
  recordedTestCycleGrade,
  testCycleClassroomPassback,
} from '../../../functions/shared/testCycleGrade.mjs';

export {
  SESSION_STATE,
  applyRetestReleased,
  applyTestReleased,
  normalizeTestCycleRecord,
  recordGradeState,
  testCycleGradeBreakdown,
  testCycleRecordId,
} from '../../../functions/shared/testCycleRecord.mjs';

export {
  SECURE_STAGES,
  INSTRUCTIONAL_STAGES,
  TEST_CYCLE_STAGE,
  resolveTestCycleStage,
  stageIsSecure,
  stageLaunchesSecureRuntime,
  visibleStageIds,
} from '../../../functions/shared/testCycleStages.mjs';

export {
  blueprintAnchorTargets,
  blueprintEquivalenceSignature,
  blueprintTargetById,
  describeFamily,
  expandBlueprintSlots,
  indexApprovedFamilies,
  normalizeTestBlueprint,
  targetFamilyCoverage,
} from '../../../functions/shared/testCycleBlueprint.mjs';

export {
  CYCLE_STAGE,
  auditRetestInstanceReuse,
  buildSecureIssuancePlan,
  nextPlanEntry,
  planRequiresLiveGeneration,
  planSeedKey,
} from '../../../functions/shared/testCycleIssuance.mjs';

export {
  CORRECTION_DIAGNOSIS,
  applyCorrectionEvidence,
  buildCorrectionPlan,
  buildPerformanceProfile,
  correctionPlanProgress,
  correctionsAreDue,
} from '../../../functions/shared/testCycleCorrections.mjs';

export {
  buildRetestBlueprint,
  resolveRetestQuestionCount,
  retestRigorIsPreserved,
} from '../../../functions/shared/testCycleRetest.mjs';

export {
  SECURE_ANSWER_KEYS,
  TEST_CYCLE_FORBIDDEN_ROLES,
  TEST_CYCLE_INSTRUCTIONAL_ROLES,
  findSecureAnswerKeyLeaks,
  preflightTestCycle,
} from '../../../functions/shared/testCyclePreflight.mjs';

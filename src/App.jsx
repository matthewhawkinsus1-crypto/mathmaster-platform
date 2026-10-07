import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  checkpointDocumentId,
  checkpointEligibility,
  enqueueResponseCheckpoint,
  normalizeCheckpointResponse,
  responseFingerprint,
} from './platform/performance/responseCheckpoint.js';
import { WORKSPACE_DRAFT_REREAD_AFTER_HIDDEN_MS, createWorkspaceDraftSync } from './platform/persistence/workspaceDraftSync.js';
import { readLatestWorkspaceResume, readWorkspaceDraft, writeWorkspaceDraft } from './platform/persistence/workspaceDraftStore.js';
import { readWorkspaceDraftEntries, selectRestorableDraftEntries } from '../functions/shared/workspaceDraftSchema.mjs';
import { canonicalResponseSavedAt } from './platform/persistence/canonicalResponseTime.js';
import { adoptCanonicalAdvances } from './platform/persistence/canonicalTrackerReconciliation.js';
import { applyWarmupTeacherControl, resolveAuthoritativeClose, resolveWarmupInstructionDateKey } from '../functions/shared/sectionDeadline.mjs';
import useEngagementLedger from './platform/supportEvidence/useEngagementLedger.js';
import StudentSupportTools from './components/student/StudentSupportTools.jsx';
import SupportEvidenceReportView from './components/teacher/SupportEvidenceReportView.jsx';
import { recordStudentSupportEvidence as saveStudentSupportEvidence } from './platform/supportEvidence/supportEvidenceStore.js';
import { launchSupportRecords, studentMayRecordSupport, usedRecordKey } from './platform/supportEvidence/studentSupportTelemetry.js';
import { buildDolAttemptGrant, buildDolClose, buildDolDateMove, buildDolExtension, buildDolScheduleRestore, buildDolWindowOpening, scheduledDolDateFor, summarizeStudentRecovery } from './platform/assessment/assessmentRecovery.js';
import {
  classDolFieldPatch,
  controlsRequestKey,
  createControlsRequestGate,
  planStudentDolGrant,
  runStudentControlsCalls,
} from './platform/assessment/dolAttemptGrantClient.js';
import { setStudentAssignmentControls } from './services/studentAssignmentControlsService.js';
import { PRESENCE_FLUSH_MS, applyKeyedChanges, createKeyedUpdateBuffer } from './platform/performance/coalescedKeyedUpdates.js';
import { teacherAdmin } from './auth/authService';
import {
  buildScratchpadWrites,
  normalizeScratchpadPages,
  scratchpadPageCount,
  scratchpadPageDocId,
} from './platform/student/scratchpadPages.js';
import {
  EMPTY_SCRATCHPAD_CACHE,
  readCachedScratchpadPage,
  storeCachedScratchpad,
  touchCachedScratchpad,
} from './platform/student/practiceScratchpadCache.js';
import {
  getAssignmentByLaunchId,
  listClassroomCourseMappings,
  publishAssignmentToClassrooms,
  publishClassroomMaterial,
  repairClassroomAssignmentPublications,
  storeLessonNotesPdf,
  updateAssignmentClassroomPublications,
} from './classroomApi';



import { generateQuestion, isPersonalizedBlueprint } from './problemGenerator';
import { buildStudentFamilyContext, readLocalDeliveryPin, writeLocalDeliveryPin } from './platform/generation/familyDelivery.js';
import { familySlotKey, isFamilyBackedQuestion } from '../functions/shared/questionFamilyInstance.mjs';
import { normalizeDeliveryPin } from '../functions/shared/questionGenerationIdentity.mjs';
import { stripAssignmentInstanceState } from '../functions/shared/assignmentPrivacy.mjs';
import {
  fetchAssignmentsById,
  fetchStudentAssignments,
  mergeStudentAssignments,
  priorWorkAssignmentIds,
  subscribeStudentClassAssignments,
  workedAssignmentKey,
} from './platform/assignments/studentAssignmentScope.js';
import { EMPTY_STUDENT_CONTROLS, projectStudentAssignments } from './platform/assignments/studentAssignmentControls.js';
import useStudentAssignmentControls from './platform/assignments/useStudentAssignmentControls.js';
import {
  EMPTY_TEACHER_CONTROLS,
  projectTeacherAssignments,
  teacherControlsClassIds,
  teacherControlsScopeKey,
} from './platform/teacher/teacherClassControls.js';
import useTeacherClassControls from './platform/teacher/useTeacherClassControls.js';
import {
  GENERATION_SEATS_VERSION,
  generationSeatPlanSignature,
  planGenerationSeatWrites,
} from './platform/generation/generationSeatReconciler.js';
import { mergePracticeTrackers } from './platform/student/practiceTrackerMerge.js';
import {
  emptyQuestionRecord,
  getQuestionCardState,
  getQuestionCredit,
  normalizeQuestionRecord,
  recordQuestionAttempt,
  recordQuestionStep,
  requestReplacementQuestion,
  resolveQuestionMaximumAttempts,
  resolveQuestionReplacementAllowed,
  resolveTeacherGrantedExtraAttempts,
} from './attemptPolicy';
import {
  parseAssignmentBlueprintText,
  validateAssignmentQuestions,
  assertFirestoreSafeAssignmentPayload,
} from './assignmentBlueprint';


import { markIncompleteAssignmentDraftPublished } from './platform/preflight/incompleteAssignmentDraftStore.js';
import { hydrateAssignmentCcmr } from './services/assignmentCcmrService.js';
import { auditAlignmentSpecificity, validateAlignments } from './platform/contract/alignments';
import { validateQuestionsSemantics } from './platform/contract/semanticValidation';
import {
  buildQuestionDraftKey,
  clearResumeAction,
  questionDraftSavedAt,
  readResumeAction,
  removeAssignmentDrafts,
  restoreQuestionDrafts,
  saveResumeAction,
  subscribeToQuestionDrafts,
} from './questionDraftStorage';
import { answerFocusPosition } from './platform/interaction/answerEntryUx.js';
import {
  CLASS_PERIODS,
  DEFAULT_CLASS_SCHEDULE,
  assignmentIsForStudent,
  formatDateTime,
  formatRemainingTime,
  getAssignmentLifecycle,
  getClassPackUpState,
  getDOLState,
  getWarmupState,
  getSectionAccessState,
  getSectionVariantMode,
  localDateKey,
  normalizeSchedule,
  prerequisiteAccess,
  recordAssignmentActivity,
  resolveDOLQuestionIndex,
  resolveDOLQuestionIndices,
  getCurrentContentQuestionIndices,
  getIncludedQuestionIndices,
  questionIsIncluded,
  studentAssignmentIndicesWithPracticePass,
  studentDueDateLines,
  studentRequiredQuestions,
} from './assignmentLifecycle';
import { HEARTBEAT_INTERVAL_MS, buildLiveStatus, encodeQuestionStates } from './livePresence';
import { describeWorkloadSummary } from '../functions/shared/reducedWorkload.mjs';
import {
  SPOTLIGHT_FRAME_COLLECTION,
  SPOTLIGHT_REQUEST_COLLECTION,
  SPOTLIGHT_STATUS,
  buildSpotlightFrame,
  createSpotlightPublisher,
  isActiveSpotlightRequest,
  publicStudentLabel,
  scheduleSpotlightExpiry,
} from './platform/liveSpotlight.js';
import { activeStudentSpotlightQuery } from './platform/liveSpotlightQueries.js';
import { getQuestionRepresentation } from './platform/contract/questionTypeCatalog';
import { getQuestionPrimaryTeksCodes } from './questionMetadata.js';
import {
  buildSupportUsage,
  getStudentSupportPresentation,
  normalizeStudentProfile,
  sameStudentProfile,
} from './studentSupport';


import AssignmentCardMenu from './AssignmentCardMenu';



import { TEXAS_MATH_ACTIVE_COURSES, getTexasStandardsForCourse } from './texasStandards.js';
import ClassContextBar from './components/teacher/ClassContextBar.jsx';
import WeeklyPathGradePanel from './components/teacher/WeeklyPathGradePanel.jsx';
import ClassroomSyncReview from './components/teacher/ClassroomSyncReview.jsx';
import TeacherQuickSearch from './components/teacher/TeacherQuickSearch.jsx';
import StudentProfileDrawer from './components/teacher/StudentProfileDrawer.jsx';
import AssignmentHub from './components/teacher/AssignmentHub.jsx';
import GradebookAssignmentBar, { GradebookClassChooser } from './components/teacher/GradebookAssignmentBar.jsx';
import { classGradeProgress } from './platform/teacher/assignmentProgress.js';
import { groupAssignmentList } from './platform/teacher/assignmentListGroups.js';
import StudentNameLink from './components/common/StudentNameLink.jsx';
import StudentResponseInspector from './components/teacher/StudentResponseInspector.jsx';
import AssignmentGradeOverrideControls from './components/teacher/AssignmentGradeOverrideControls.jsx';

import DOLCountdown from './components/student/DOLCountdown.jsx';


import { useToast } from './ui/Toast';
import { prefetchQuestionResources } from './platform/performance/questionPrefetch.js';
import { measurePerformanceOperation, startPerformanceSpan } from './platform/performance/performanceTelemetry.js';
import {
  createDurableAction,
  drainDurableActions,
  enqueueDurableAction,
  listDurableActions,
  overlayDurableActionsOnGrades,
  resendRetiredReviewWork,
} from './platform/performance/durableActionOutbox.js';
import {
  PROGRESS_KINDS,
  buildProgressEnvelopeForAction,
  callableDeliveryDiagnostic,
  ingestOneSubmission,
  reconcileAssignmentActivityProjection,
  reportDeviceQueueState,
} from './services/submissionIngestionService.js';
import { forgetAssignmentToolDrafts } from './tools/shared/usePersistentToolState.js';
import { createDeviceReportCoordinator, reconcileWithDeviceReports } from './platform/persistence/deviceReportCoordinator.js';
import {
  INGESTIBLE_KINDS,
  buildSubmissionEnvelope,
  captureSectionAccessProof,
  normalizeStepWork,
} from '../functions/shared/submissionEnvelope.mjs';
import {
  SUBMISSION_DISPOSITION,
} from '../functions/shared/studentSubmissionDisposition.mjs';
import { resolveStudentAssignmentEntry } from './platform/student/assignmentEntry.js';
import { EmptyState, ProgressBar, SearchField, StatCard } from './ui/primitives';
import { buildStudentMasteryProfile, collectStudentEvidence } from './masteryEngine.js';
import {
  getEffectiveActivityPolicy,
  resolveQuestionActivityRole,
} from './platform/policies/activityPolicies';
import { SMART_VIEWS, matchesSmartView } from './assignmentSmartViews';
import {
  advanceLiveTeachingSession,
  updateWalkthroughTimer,
  walkthroughSessionId,
  walkthroughTimerRemaining,
  endLiveTeachingSession,
  startLiveTeachingSession,
} from './platform/teacher/liveTeachingSession.js';
import { validatePersistedWalkthroughSession, walkthroughEligibility } from './platform/assignments/assignmentAvailability.js';
import { describeClassworkPace } from './platform/teacher/classworkModel.js';
import { assignmentFolderMatches, normalizeFolderPath, normalizeFolderPaths, renameFolderPath, titleOrFolderMatches } from './assignmentFolders';
import {
  assertPublishable, buildDestinationGroups, destinationAssignmentKey,
  isLibraryAssignment, resolveAssignmentDates, resolveCreationMode,
} from './assignmentDestinations';

import { flattenV5Sections, rebuildV5SectionsFromQuestions } from './platform/contract/assignmentSchemaV5.js';
import { isDesktopStickyLayout, revealBelowSticky } from './platform/layout/stickyReveal.js';
import {
  canonicalV5PersistencePatch,
  getStoredAssignmentQuestions,
  prepareAssignmentForRuntime,
  getStoredAssignmentTypeProjection,
  getStoredAssignmentVariantMode,
  getStoredSectionVariantModes,
  storedAssignmentToV5,
  testCycleContractFields,
} from './platform/contract/storedAssignmentV5.js';
import { buildAssignmentV5PreflightModel } from './platform/preflight/assignmentV5PreflightModel.js';
import { canSalvageV5IntakeResult } from './platform/preflight/assignmentAuthoringState.js';
import {
  contentVersionLabel,
  contentVersionOf,
  latestCurrentLibraryRelease,
} from './platform/assignments/assignmentContentVersion.js';
import {
  projectCurrentAssignmentContent,
  resolveCurrentContentStorageIndex,
} from './platform/assignments/currentContentProjection.js';
import { buildCurrentContentPortablePackage } from './platform/assignments/currentContentPortableAssignment.js';
import {
  questionFingerprint,
  repairAssignmentTrackerForCurrentGrader,
  repairAssignmentTrackerForGranularWorkflowCredit,
  repairAssignmentTrackerForLiveCorrections,
} from './platform/assignment/liveQuestionCorrection.js';
import { GRAPH_VIEWPORT_REPAIR_KIND } from '../functions/shared/liveResponseRepairPolicy.mjs';
import { normalizeQuestionWeight } from './platform/grading/questionWeights.js';
import { normalizeLessonPublishingIntentV5 } from './platform/authoring/lessonPublishingIntent.js';
import { normalizeLabDefinition } from './platform/labs/labDefinitionSchema.js';
import { normalizeContextualQuestion } from './platform/context/wordProblemLayer';
import { buildAttemptEvidenceEvent } from './platform/history/evidenceEvent.js';










import RecommendedSkills from './components/student/RecommendedSkills.jsx';
import { teksCodeFromSkillId } from './platform/path/skillGraph.js';
import { buildStudentPathOptions } from './platform/path/studentPathOptions.js';
import { fetchStudentEvidenceEvents } from './platform/history/evidencePersistence.js';
import { COMPARABILITY, describeDeliveredRigor, explainGrade, rigorComparability, splitGrade, splitGradesBySection } from './platform/teacher/gradeEvidence.js';
import { assignmentGradeOverrideFor, canonicalPresentedAssignmentGrade, projectedAssignmentTrackerFor, projectTeacherOverridesForDisplay } from './platform/grading/canonicalGradeProjection.js';
import { projectSectionRecoveriesForDisplay } from './platform/grading/sectionRecoveryGrades.js';
import { classroomLaunchTarget, parseClassroomLaunchSearch } from './platform/classroom/classroomLaunchRoute.js';
import { buildStudentDashboardModel, resolveNextAction, resolveUpNext } from './studentDashboardModel.js';
import { resolveAssignmentHandoff } from './platform/student/assignmentHandoff.js';
import WhatChangedList from './components/student/WhatChangedList.jsx';
import {
  buildWhatChanged, markWhatChangedSeen, readWhatChangedSeenAt, rememberWhatChangedFirstSeen, untimedWhatChangedKeys,
} from './platform/student/whatChangedModel.js';
import { describeLogoutRisk } from './platform/student/logoutGuard.js';
import { describeSaveStatus } from './platform/student/saveStatusModel.js';
import { buildRecoverySummariesByAssignment, recoveryStatesFromSummaries } from './platform/student/recoveryStates.js';
import { buildTestCycleCardRefreshKey } from './platform/student/testCycleDiscovery.js';
import {
  readStudentRouteState,
  studentRouteKey,
  writeStudentRouteState,
} from './platform/student/browserHistory.js';
import {
  TEACHER_HISTORY_DOCUMENT_ID,
  planTeacherHistoryWrite,
  readTeacherHistoryEntry,
  teacherRouteKey,
  teacherRouteSignature,
  writeTeacherRouteState,
} from './platform/teacher/teacherBrowserHistory.js';
import { questionAssessmentFramework } from './platform/student/questionAlignmentInfo.js';
import { FRAMEWORK_LABELS } from './platform/ccmr/assessmentCrosswalk.js';
import {
  STUDENT_SELF_NEUTRAL_LABEL,
  buildStudentIdentityIndex,
  compareStudentsByName,
  formatStudentLabel,
  formatStudentName,
  resolveStudentDisplayName,
} from './platform/studentName';
// The teacher roster is RESOLVED, not copied: the compact listSignInAccess row
// is the only name a Classroom-linked legacy student has on Home and Live.
import {
  normalizeTeacherRosterSummary,
  rosterStudentLabel,
  rosterStudentNameForStorage,
} from './platform/teacher/teacherRosterSummary.js';
import { evidenceRowsToEvents } from './platform/profile/legacyEvidenceAdapter.js';
import { buildStudentLearningProfile } from './platform/profile/studentLearningProfile.js';
import { resolveDeliveredQuestionMetadata } from './platform/assignments/assignmentAdaptation.js';
import { adaptLegacyMasteryToPhase5 } from './platform/profile/legacyMasteryAdapter.js';
import StudentDashboardView from './components/student/StudentDashboardView.jsx';
import StudentGradeCenter from './components/student/StudentGradeCenter.jsx';
import StudentAssignmentsCenter from './components/student/StudentAssignmentsCenter.jsx';
import { isTestCycleAssignment } from './platform/assessment/testCycle.js';
import { attachTestCycleContract, preflightTestCycleCandidate, updateTestCyclePolicy } from './services/testCycleService.js';
import { isSecureExamActive, useSecureExamActive } from './platform/assessment/secureExamPresence.js';
import { getAssignmentEvidenceSummary, manageAssignmentLifecycle } from './services/assessmentLifecycleService.js';
import { TEST_CYCLE_CONTRACT_EDIT, planTestCycleContractEdit } from './platform/assessment/testCycleContractEdit.js';
import StudentGlobalNav, { STUDENT_DESTINATION } from './components/student/StudentGlobalNav.jsx';
import StudentAssignmentResult from './components/student/StudentAssignmentResult.jsx';
import SectionRecoveryPanel from './components/student/SectionRecoveryPanel.jsx';
import SectionRecoveryAuditTrail from './components/teacher/SectionRecoveryAuditTrail.jsx';
import StudentDolRecoveryRow from './components/teacher/StudentDolRecoveryRow.jsx';
import { completedRecoverySections, heldRecoverySections, warmupChallengeCounts } from './platform/recovery/teacherRecoveryAudit.js';
import { buildStudentRecoverySummary } from './platform/recovery/studentRecoveryModel.js';
import { recoveryErrorCode, startSectionRecovery } from './services/sectionRecoveryService.js';
import StudentIdentityBar, { STUDENT_IDENTITY_STACK_OFFSET } from './components/student/StudentIdentityBar.jsx';
import { ASSIGNMENT_NAV_HEIGHT_VAR, stickyHeightRef } from './platform/layout/stickyHeightRef.js';
import { shouldCompactAssignmentNavigation } from './platform/layout/assignmentNavigationChrome.js';
import {
  emptyClassPointAccount,
  subscribeToClassPointAnnouncements,
  subscribeToPracticePassRedemptions,
  subscribeToStudentClassPoints,
} from './platform/classPointsClient.js';
import { practicePassEligibleAssignments } from './platform/rewards/practicePassClientEligibility.js';
import {
  loadStudentRewardHistory,
  subscribeToStudentRewardInventory,
  // A callable, not a hook: imported under a name rules-of-hooks reads as one.
  usePracticePass as redeemPracticePassCallable,
} from './platform/rewards/rewardsClient.js';
import { buildRewardWallet } from './platform/rewards/rewardWallet.js';
import { useRewardCelebrations } from './platform/rewards/useRewardCelebrations.js';
import { useClassPracticePasses } from './platform/rewards/useClassPracticePasses.js';
import StudentRewardsCenter from './components/student/rewards/StudentRewardsCenter.jsx';
import ChallengeRewardsEarned from './components/student/rewards/ChallengeRewardsEarned.jsx';

import {
  buildStudentGradeCenter,
  findGradeCenterEntry,
} from './platform/student/studentGradeCenterModel.js';
import {
  GRADING_PERIOD_SETTINGS_DOC,
  gradingPeriodAssignmentPatch,
  currentGradingPeriodStamp,
  normalizeGradingPeriodSettings,
} from './platform/student/gradingPeriods.js';
import {
  ROUTE_EVENTS, buildRouteEvent, fetchClassPacing, fetchSkillOverrides, fetchWeeklyGoalSettings, fetchTeacherWeeklyPathCompletions, fetchStudentWeeklyPathGoalSnapshot,
  interventionAsOverride, logRouteEvent, overridesForClassContext, saveClassPacing, saveSkillOverrides, saveWeeklyGoalSettings,
  setStudentPathIntervention, storedPacingForClassContext, storedWeeklyGoalForClassContext,
  subscribeStudentPathIntervention,
} from './platform/path/pathStore.js';
import WeeklyPathControls from './components/teacher/WeeklyPathControls.jsx';
import StudentPerformanceBadge from './components/common/StudentPerformanceBadge.jsx';
import { buildWeeklyPathPlan } from './platform/path/weeklyPathPlan.js';
import { buildTeacherWeeklyView, buildWeeklyGoal, deriveCompletionsFromEvidence, dueAtFor, evaluateWeeklyGoalProgress, normalizeWeeklyGoalConfig, weekKeyFor } from './platform/path/weeklyPathGoal.js';
import SignInAccess from './SignInAccess.jsx';
import ClassesAdmin from './components/admin/ClassesAdmin.jsx';
import PreproductionReset from './components/admin/PreproductionReset.jsx';
import AssignmentAiHealth from './components/admin/AssignmentAiHealth.jsx';
import PathCoverageAudit from './components/teacher/PathCoverageAudit.jsx';
import {
  blobToBase64,
  generateLessonNotesPdfBlob,
} from './platform/resources/pdfLoaders.js';
import { buildAssignmentWorksheetModel, PRINT_OUTPUT_MODES } from './platform/resources/assignmentWorksheetPdfModel.js';
import { downloadAssignmentWorksheetPdf } from './platform/resources/pdfLoaders.js';
import { defaultAssignmentDateInputs } from './platform/assignments/assignmentDateDefaults.js';
import {
  buildSafeLibraryContentRepair,
  inspectLibraryContentRepair,
  prepareStoredAssignmentForReuse,
} from './platform/assignments/libraryAssignmentReuse.js';
import { applyCcmrHydrationToCanonicalAssignment } from './platform/assignments/canonicalCcmrHydration.js';
import {
  assignmentNeedsStudentForWorksheet,
  buildTeacherAssignmentWorksheetModel,
  eligibleStudentsForTeacherWorksheet,
} from './platform/resources/teacherAssignmentWorksheetExport.js';
import {
  classroomPostingMode,
  mappedCourseIdsForAssignment,
  shouldAutoPublishClassroomPackage,
} from './platform/classroom/automaticClassroomPublishing.js';
import { classIdsForTeacher, resolveStudentCourseContext, studentsInClass, unplaceableStudents } from '../functions/shared/classModel.mjs';
import { buildNeedsAttentionQueue } from './platform/teacher/needsAttention.js';
import {
  SUPPORT_EVENT_KIND,
  SUPPORT_EVENT_STAGE,
  summarizeRapidCorrectness,
} from './platform/teacher/studentSupportSignals.js';
import {
  fetchStudentSupportHistory,
  fetchAttendanceForClassDateRange,
  recordStudentSupportEvent,
  subscribeStudentSessionSummaries,
  subscribeStudentSupportEvents,
} from './platform/teacher/studentSupportStore.js';
import { localDateKeyOf } from './platform/attendance/classMeetings.js';
import { buildNonInstructionalSet } from './platform/path/curriculumCalendar.js';
import { schoolYearNonInstructionalRanges } from './curriculum/calendars/schoolYear2026-2027.js';
import AttendanceHistoryPanel from './components/teacher/AttendanceHistoryPanel.jsx';
import ParentContactCenter from './components/teacher/ParentContactCenter.jsx';
import TeacherActionCenter from './components/teacher/TeacherActionCenter.jsx';
// buildAttendanceCorrectionReviewEvent was called by "Keep current extension"
// and "Apply shorter extension" without being imported — a ReferenceError that
// made every attendance correction review impossible to resolve.
import { buildAttendanceCorrectionReviewEvent, buildReturnCheckInEvent } from './platform/attendance/returnCheckIn.js';
import { resolveReturnCheckIns } from './platform/attendance/returnCheckIn.js';
import { buildTeacherActionItems, openTeacherActionCount } from './platform/teacher/teacherActionCenter.js';
import { fetchAllParentContactsForExport, recordParentContact, recordParentContactResolution, subscribeParentContacts } from './platform/teacher/parentContactStore.js';
import { loadTeacherGradeTransferState } from './platform/gradeTransfer/gradeTransferStore.js';
import { projectGradeTransferUnits } from './platform/gradeTransfer/gradeTransferProjection.js';
import { listTeacherTestCycleRecords } from './services/testCycleService.js';
import { projectTestCycleTeacherActions } from './platform/teacher/testCycleActionProjection.js';
import {
  buildStudentExtensionPatch,
  reconcileAssignmentExtensionsForCorrection,
} from './platform/attendance/extensionReconciliation.js';
import { LIVE_ATTENDANCE_EVENT_KIND } from './platform/teacher/liveAttendance.js';
import { ATTENDANCE_HISTORY_EVENT_KIND } from './platform/attendance/attendanceHistory.js';
import { applyStudentAttendanceExtension } from './platform/attendance/extensionClient.js';
import {
  defaultCourseProfiles,
  inspectHonorsRigor,
  normalizeCourseProfiles,
} from './platform/rigor/courseRigor.js';
import { certifyHonorsExtensionQuestion } from './platform/rigor/honorsExtensionRecipes.js';
import { withAppendedQuestionSections } from './platform/rigor/honorsExtensionSwap.js';
import LoginScreen from './LoginScreen.jsx';
import { useAuth } from './auth/AuthProvider.jsx';
import { watchLiveChallengeInvite } from './platform/liveChallenge/liveChallengeService.js';

import {
  WARMUP_CHALLENGE_ROUTE,
  resolveWarmupChallenge,
  shouldShowChallengeHandoffBanner,
  shouldShowWarmupWaitingPanel,
} from './platform/liveChallenge/warmupChallengeLink.js';
// The administrator identity comes from the same module the callables enforce,
// so the browser can never believe in a different administrator than the server.
import { isRootAdminEmail } from '../functions/shared/rolePolicy.mjs';

// Built once: the district instructional calendar is static reference data,
// not per-render or per-teacher state (see the identical constant in
// LiveClassMonitor.jsx, which needs the same calendar for the same reason).
const SCHOOL_NON_INSTRUCTIONAL_KEYS = buildNonInstructionalSet(schoolYearNonInstructionalRanges());

const ClassroomManagerV2 = lazy(() => import('./ClassroomManagerV2.jsx'));
const AssignmentQuestionEditor = lazy(() => import('./AssignmentQuestionEditor.jsx'));
const QuestionEngine = lazy(() => import('./QuestionEngine.jsx'));
const AssignmentIntake = lazy(() => import('./AssignmentIntake.jsx'));
const TeacherQuestionReviewPanel = lazy(() => import('./components/teacher/TeacherQuestionReviewPanel.jsx'));
const TeacherSidebar = lazy(() => import('./TeacherSidebar.jsx'));
const GradeTransferCenter = lazy(() => import('./components/teacher/GradeTransferCenter.jsx'));
const AssignmentLibrary = lazy(() => import('./AssignmentLibrary.jsx'));
const TeacherAssignmentPdfDialog = lazy(() => import('./components/teacher/TeacherAssignmentPdfDialog.jsx'));
const AssignmentContentUpgradeModal = lazy(() => import('./components/teacher/AssignmentContentUpgradeModal.jsx'));
const ClassesWorkspace = lazy(() => import('./ClassesWorkspace.jsx'));
const TeacherHome = lazy(() => import('./TeacherHome.jsx'));
const TexasStandardsDashboard = lazy(() => import('./TexasStandardsDashboard.jsx'));
const MathToolsLab = lazy(() => import('./dev/MathToolsLab.jsx'));
const LessonPreflightModal = lazy(() => import('./components/teacher/LessonPreflightModal.jsx'));
const MyMathPathApp = lazy(() => import('./components/student/MyMathPathApp.jsx'));
const StudentSecureExamDashboard = lazy(() => import('./components/assessment/StudentSecureExamDashboard.jsx'));
const TeacherSecureExamDashboard = lazy(() => import('./components/assessment/TeacherSecureExamDashboard.jsx'));
const TeacherAnalyticsDashboard = lazy(() => import('./components/analytics/TeacherAnalyticsDashboard.jsx'));
// Student Case Review / Academic Evidence Deep Dive: its code loads only when a
// teacher opens it from the student drawer (docs/STUDENT_CASE_REVIEW_DESIGN.md).
const StudentCaseReviewView = lazy(() => import('./components/teacher/caseReview/StudentCaseReviewView.jsx'));
const DemoExperience = lazy(() => import('./components/demo/DemoExperience.jsx'));
const StudentsRoster = lazy(() => import('./components/teacher/StudentsRoster.jsx'));
const ClassCourseSettings = lazy(() => import('./components/teacher/ClassCourseSettings.jsx'));
const ClassScheduleSettings = lazy(() => import('./components/teacher/ClassScheduleSettings.jsx'));
const PathSimulator = lazy(() => import('./components/teacher/PathSimulator.jsx'));
const PacingControls = lazy(() => import('./components/teacher/PacingControls.jsx'));
const MarkingPeriodSettings = lazy(() => import('./components/teacher/MarkingPeriodSettings.jsx'));
const WarmupChallengeGate = lazy(() => import('./components/liveChallenge/WarmupChallengeGate.jsx'));
const LiveChallengeTeacher = lazy(() => import('./components/liveChallenge/LiveChallengeTeacher.jsx'));
const LiveChallengeStudent = lazy(() => import('./components/liveChallenge/LiveChallengeStudent.jsx'));
// Only a student opening a Test Cycle needs this, and it brings the secure
// exam player, the calculator and all of MathLive with it — about 1 MB that a
// static import put in front of every sign-in.
const TestCycleCard = lazy(() => import('./components/student/TestCycleCard.jsx'));
const TestCyclePreview = lazy(() => import('./components/teacher/TestCyclePreview.jsx'));
// The Recovery runner mounts QuestionEngine, and with it MathLive (~780 KB):
// a student who opens a Recovery fetches it then, not every student at sign-in.
const SectionRecoveryRunner = lazy(() => import('./components/student/SectionRecoveryRunner.jsx'));



/*
 * Which teacher tabs a class actually scopes, and what it scopes there.
 *
 * This table is the honest boundary of the class-first architecture. A tab in
 * it inherits the workspace's class rather than asking again; a tab absent from
 * it genuinely operates outside class scope, and showing a class selector above
 * it would imply a filter that does not exist.
 *
 * `allowAllClasses: false` marks the views that cannot answer anything without
 * a specific class — a weekly goal or a live room is a fact about one class, not
 * an average across five.
 */
const CLASS_SCOPED_TABS = Object.freeze({
  home: { scopeLabel: 'Showing what needs attention' },
  classesWorkspace: { scopeLabel: 'Showing the class' },
  students: { scopeLabel: 'Showing the roster' },
  grades: { scopeLabel: 'Showing grades' },
  weeklyPath: { scopeLabel: 'Showing weekly goals', allowAllClasses: false },
  pacing: { scopeLabel: 'Showing pacing', allowAllClasses: false },
  standards: { scopeLabel: 'Showing mastery' },
  analytics: { scopeLabel: 'Showing analytics' },
  assignments: { scopeLabel: 'Showing assignments' },
});

const createQuestionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeAssignmentQuestions = (questions = []) => questions.map((question) => ({
  ...question,
  questionId: question.questionId || createQuestionId(),
  teacherExcluded: question.teacherExcluded === true,
}));

const assignmentFeedbackWasReleased = (assignment) => assignment?.feedbackReleased === true || Boolean(assignment?.feedbackReleasedAt);

const assignmentUsesTeacherReleasePolicy = (assignment) => (
  getStoredAssignmentQuestions(assignment).some((question) => {
    const role = resolveQuestionActivityRole({ question, assignment });
    return getEffectiveActivityPolicy(role).feedback === 'teacherRelease';
  })
);

const assignmentHasHeldTeacherFeedback = (assignment) => (
  assignmentUsesTeacherReleasePolicy(assignment) && !assignmentFeedbackWasReleased(assignment)
);

const createEmptyAssignmentTracker = (questions = []) => {
  const initialTracker = {};
  questions.forEach((_, index) => {
    initialTracker[index] = emptyQuestionRecord();
  });
  return initialTracker;
};

const createPracticeAssignmentTracker = (questions = [], frozenTracker = {}) => {
  const initialTracker = {};
  questions.forEach((_, index) => {
    const frozenRecord = normalizeQuestionRecord(frozenTracker[index]);
    initialTracker[index] = {
      ...emptyQuestionRecord(),
      variantIndex: frozenRecord.variantIndex,
    };
  });
  return initialTracker;
};

const formatDueDate = (assignmentOrValue) => {
  if (assignmentOrValue && typeof assignmentOrValue === 'object') {
    return formatDateTime(assignmentOrValue.dueAt || assignmentOrValue.dueDate);
  }
  return formatDateTime(assignmentOrValue);
};

const formatLateDueDate = (assignment) =>
  formatDateTime(assignment?.lateDueAt || assignment?.lateDueDate || assignment?.dueAt || assignment?.dueDate);

const formatTimeStamp = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
};

const toDateTimeLocalInputValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const activityTitleForRole = (role) => ({
  warmup: 'Warm-Up',
  classwork: 'Classwork',
  dol: 'DOL',
  practice: 'Practice',
  quiz: 'Quiz',
  test: 'Unit Test',
}[role] || 'Activity');

const captureTimedSectionAccess = ({
  activityRole,
  assignment,
  schedule,
  classId,
  classPeriod,
  capturedAt,
}) => {
  if (activityRole !== 'warmup') return null;
  const state = getWarmupState({
    assignment,
    schedule,
    classId,
    classPeriod,
    nowValue: capturedAt,
  });
  return {
    role: 'warmup',
    status: state.status,
    teacherTimerScheduled: state.teacherTimerScheduled === true,
    endsAt: state.endsAt instanceof Date ? state.endsAt.toISOString() : null,
    instructionDateKey: state.instructionDateKey || null,
  };
};

const warmupCaptureWasActive = (capture, capturedAt) => {
  if (capture?.role !== 'warmup' || capture?.status !== 'active') return false;
  const endsAt = capture?.endsAt ? new Date(capture.endsAt).getTime() : Number.NaN;
  return !Number.isFinite(endsAt) || capturedAt <= endsAt;
};

const calculateDOLSectionScore = (assignmentTracker = {}, questionIndices = [], assignment = null) => {
  const indices = Array.isArray(questionIndices) ? questionIndices : [];
  if (!indices.length) return 0;
  const questions = getStoredAssignmentQuestions(assignment || {});
  let possibleWeight = 0;
  let earnedWeight = 0;
  indices.forEach((index) => {
    const weight = normalizeQuestionWeight(questions[index] || {});
    possibleWeight += weight;
    earnedWeight += getQuestionCredit(assignmentTracker?.[index]) * weight;
  });
  return possibleWeight > 0 ? Math.round((earnedWeight / possibleWeight) * 100) : 0;
};

// Statuses that mean something to a student who has come back after the close.
// Every other lifecycle status is internal bookkeeping.
const DISPLAYED_CHECKPOINT_OUTCOMES = ['auto-submitted', 'incomplete-at-close', 'explicitly-submitted'];

const TEACHER_FULL_STUDENT_DATA_TABS = new Set([
  'students', 'weeklyPath', 'actionCenter', 'parentContacts', 'grades', 'gradeTransfer',
  'standards', 'analytics', 'exams',
]);
const TEACHER_SUPPORT_STREAM_TABS = new Set(['home', 'classesWorkspace', 'attendanceHistory', 'actionCenter', 'parentContacts']);
const TEACHER_PARENT_CONTACT_STREAM_TABS = new Set(['parentContacts', 'actionCenter']);
// Tabs that work across every class a teacher teaches by design (Grade
// Export's units, the Action Center's queue, Parent Contacts' roster): their
// students' private controls are read for all of those classes, in the one
// controls listener (platform/teacher/teacherClassControls.js).
const TEACHER_CROSS_CLASS_TABS = new Set(['gradeTransfer', 'actionCenter', 'parentContacts']);
const TEACHER_SESSION_SUMMARY_TABS = new Set(['home', 'classesWorkspace', 'parentContacts']);

function App() {
  const auth = useAuth();
  // Identity is owned entirely by <AuthProvider>. `user` below is the
  // application-level profile that the rest of this component reads: the
  // roster record, class period and inclusion supports that hang off whoever
  // the auth layer says is signed in.
  const { toastSuccess, toastError, toastInfo, toastWarning, confirm: confirmAction } = useToast();
  const [user, setUser] = useState(null);
  const emptyStudentClassPoints = () => ({
    account: emptyClassPointAccount(),
    transactions: [],
    announcements: [],
    // Live waivers only, by assignment: what grading and completion read.
    redemptionsByAssignment: {},
    // Every Practice Pass use, undone ones included: what reward history reads.
    redemptions: [],
    // The student's usable rewards (rewardGrants with status available);
    // null until the first snapshot, so "what they already had" is never
    // mistaken for "just earned".
    grants: null,
    inventoryUnavailable: false,
    unavailable: true,
  });
  const [studentClassPoints, setStudentClassPoints] = useState(emptyStudentClassPoints());

  const [sessionHydrating, setSessionHydrating] = useState(false);
  const [sessionHydrationError, setSessionHydrationError] = useState(null);

  useEffect(() => {
    // Teacher Preview and synthetic student views can never cross this role gate.
    // A student without canonical class membership also creates no query.
    if (user?.role !== 'student' || !user.id || !user.classId) {
      setStudentClassPoints(emptyStudentClassPoints());
      return undefined;
    }
    setStudentClassPoints(emptyStudentClassPoints());
    let walletFailed = false;
    const unavailable = (error) => {
      walletFailed = true;
      console.warn('Class Points are temporarily unavailable:', error);
      setStudentClassPoints((current) => ({ ...current, unavailable: true }));
    };
    const unsubscribeWallet = subscribeToStudentClassPoints({
      db,
      studentId: user.id,
      classId: user.classId,
      onAccount: (account) => setStudentClassPoints((current) => ({ ...current, account, unavailable: walletFailed })),
      onHistory: (transactions) => setStudentClassPoints((current) => ({ ...current, transactions })),
      onError: unavailable,
    });
    const unsubscribeAnnouncements = subscribeToClassPointAnnouncements({
      db,
      classId: user.classId,
      onAnnouncements: (announcements) => setStudentClassPoints((current) => ({ ...current, announcements })),
      // A public celebration feed failure must not hide an otherwise healthy private wallet.
      onError: (error) => console.warn('Class celebrations are temporarily unavailable:', error),
    });
    // The authoritative Practice Pass waiver projection for this student+class.
    // Read-only here -- redeeming one goes only through redeemPracticePassCallable.
    const unsubscribeRedemptions = subscribeToPracticePassRedemptions({
      db,
      studentId: user.id,
      classId: user.classId,
      onRedemptions: (redemptionsByAssignment, redemptions = []) => setStudentClassPoints((current) => ({ ...current, redemptionsByAssignment, redemptions })),
      onError: (error) => console.warn('Practice Pass redemptions are temporarily unavailable:', error),
    });
    // The student's usable rewards. A failure here hides nothing else.
    const unsubscribeInventory = subscribeToStudentRewardInventory({
      db,
      studentId: user.id,
      classId: user.classId,
      onGrants: (grants) => setStudentClassPoints((current) => ({ ...current, grants, inventoryUnavailable: false })),
      onError: (error) => {
        console.warn('Rewards are temporarily unavailable:', error);
        setStudentClassPoints((current) => ({ ...current, inventoryUnavailable: true }));
      },
    });
    return () => { unsubscribeWallet(); unsubscribeAnnouncements(); unsubscribeRedemptions(); unsubscribeInventory(); };
  }, [user?.role, user?.id, user?.classId]);

  // A new reward gets one toast and a "New" mark (useRewardCelebrations).
  const celebratingStudentId = user?.role === 'student' ? user.id : null;
  const { newIds: newRewardIds, clearNew: clearNewRewards } = useRewardCelebrations({
    studentId: celebratingStudentId,
    grants: studentClassPoints.grants,
    onCelebrate: (message) => toastSuccess(message),
  });

  /*
   * THE ONE DOOR A STUDENT USES TO SPEND A REWARD.
   *
   * `redeemPracticePass` (functions/index.js → rewardActionStore.mjs) checks
   * everything again and writes the waiver and the payment in one
   * transaction. Nothing here changes a count: the listeners above do, once
   * the server has committed.
   */
  const handleUsePracticePass = ({ assignmentId, payWith, grantId }) => redeemPracticePassCallable({ assignmentId, payWith, grantId });
  const handleLoadRewardHistory = () => loadStudentRewardHistory({ db, studentId: user?.id, classId: user?.classId });

  /*
   * THE ONE PLACE THE STUDENT RUNTIME ASKS "IS PRACTICE EXCUSED HERE?"
   *
   * Reads the authoritative subscription only -- never Teacher Preview, which
   * has no student redemption to read and must keep showing every current-
   * content question exactly as authored. Every required-navigation/
   * completion site in the student runtime (startAssignment, the active-
   * question correction effect, live presence, the workspace question count)
   * calls this rather than re-reading `studentClassPoints` itself, so the
   * "which assignment" and "which student" scoping cannot drift between them.
   */
  const hasPracticePassFor = (assignmentId) => (
    user?.role === 'student' && Boolean(studentClassPoints.redemptionsByAssignment?.[assignmentId])
  );

  /*
   * THE ONE PLACE THE STUDENT RUNTIME ASKS "WHICH QUESTIONS ARE MINE?"
   *
   * Current content, minus a Practice Pass waiver, minus what this student's
   * reduced-item-count accommodation omits (assignmentLifecycle.js
   * studentRequiredQuestions → functions/shared/reducedWorkload.mjs). Only a
   * real student's own profile is ever read: Teacher Preview and voluntary
   * post-deadline Practice Mode pass `forStudent: false` and see everything.
   */
  // Planned on the STORED document — the copy the Grade Center, the teacher
  // views and the Cloud Functions read — never on the runtime-repaired view,
  // so every reader omits the same items (positions are unchanged by repair).
  const studentRequiredFor = (assignmentData, { hasPracticePass = false, forStudent = true, assignmentTracker = null } = {}) => (
    studentRequiredQuestions({
      assignment: assignments.find((entry) => entry.id === assignmentData?.id) || assignmentData || {},
      hasPracticePass,
      profile: forStudent && user?.role === 'student' ? user.profile : null,
      tracker: assignmentTracker ?? tracker?.[assignmentData?.id] ?? null,
    })
  );

  // Google Classroom launches preserve the server-verified publication and
  // section identity all the way into the browser. Legacy whole-assignment
  // links still parse as sectionKey="whole" and follow the original behavior.
  const [launchAssignment, setLaunchAssignment] = useState(null);
  const [pendingClassroomLaunch, setPendingClassroomLaunch] = useState(null);
  // The student Assignment Result route: which assignment is on screen and,
  // when the student arrived through a split Google Classroom post, which
  // section that post covered. Launch context only — the grade itself always
  // comes from the Grade Center model, never from here.
  const [assignmentResultRoute, setAssignmentResultRoute] = useState(null);
  const [activeClassroomSectionKey, setActiveClassroomSectionKey] = useState(null);

  useEffect(() => {
    let launch = null;
    try {
      launch = parseClassroomLaunchSearch(window.location.search);
    } catch (error) {
      console.error('Rejected invalid Classroom launch link:', error);
      return;
    }
    if (!launch) return;
    setPendingClassroomLaunch(launch);
    getAssignmentByLaunchId({ assignmentId: launch.assignmentId })
      .then((assignment) => setLaunchAssignment(assignment))
      .catch((err) => console.error('Failed to resolve Classroom launch link:', err));
  }, []);

  const [activeView, setActiveView] = useState('dashboard');
  // Teacher Preview deliberately reuses the student assignment renderer, but the
  // signed-in role remains teacher. Use this early flag to suspend teacher-only
  // background feeds while that renderer is on screen; cached teacher data stays
  // in memory and the feeds reconnect when Preview closes.
  const teacherPreviewRuntimeActive = user?.role === 'teacher' && activeView === 'teacherPreview';
  const [teacherTab, setTeacherTab] = useState('home');
  const [teacherWorkspaceMode, setTeacherWorkspaceMode] = useState('teacher');
  const [adminTab, setAdminTab] = useState('classes');
  const [classes, setClasses] = useState([]);
  // Who is looking, and at which classes. Read by fetchStudents, which runs
  // during sign-in before `user` state exists.
  const viewerRef = useRef({ email: null, isRootAdmin: false });
  const classesRef = useRef([]);
  // THE CLASS THE TEACHER IS CURRENTLY WORKING IN.
  //
  // Held at the workspace level on purpose. Class context used to live inside
  // ClassesWorkspace, which unmounts on every tab change, so walking from a
  // class to the Gradebook and back meant picking the class again. classId is
  // the authoritative half; the period travels with it only because legacy
  // screens and unmigrated student records still address work by period.
  const [activeClass, setActiveClass] = useState({ classId: null, classPeriod: null });
  const [homeNavigationPeriod, setHomeNavigationPeriod] = useState(null);
  // Teacher-only Live Teaching session (Classroom Live, Phase 2). Holds only
  // where the teacher's exemplar currently is, never student response data.
  // See platform/teacher/liveTeachingSession.js.
  const [liveTeachingSession, setLiveTeachingSession] = useState(null);
  const walkthroughWriteRef = useRef(null);
  // Current-grader credit repair is intentionally deferred until the teacher
  // opens Grades. It still repairs the authorized roster automatically, but it
  // no longer makes every teacher login download and regrade the full history.
  const teacherGraderRepairRanRef = useRef(false);
  const [assignments, setAssignments] = useState([]);
  // For effects that only LOOK UP an assignment (a title for a toast). The
  // whole collection is one live listener, so `assignments` changes whenever
  // any assignment in the school does; as a dependency it tore down and
  // re-created the listener holding the lookup on every such change.
  const assignmentsRef = useRef(assignments);
  assignmentsRef.current = assignments;
  const [allStudents, setAllStudents] = useState([]);
  const [teacherRosterSummaries, setTeacherRosterSummaries] = useState([]);
  const [teacherStudentDataMode, setTeacherStudentDataMode] = useState('summary');
  const [profileDrawerStudentDetail, setProfileDrawerStudentDetail] = useState(null);
  // Live presence for the teacher home grid, keyed by student id. Never stored
  // alongside grades and never read outside the live view.
  const [presenceById, setPresenceById] = useState({});
  // Persistent teacher-reviewed support history. Unlike presence, these are the
  // small set of concerns, dismissals and interventions worth keeping.
  const [studentSupportEvents, setStudentSupportEvents] = useState([]);
  const [parentContacts, setParentContacts] = useState([]);
  const [actionGradeSnapshots, setActionGradeSnapshots] = useState([]);
  const [actionPracticePasses, setActionPracticePasses] = useState(new Set());
  // Keep only the small badge count after Action Center releases its heavy
  // projections. This preserves the sidebar cue without retaining student history.
  const [teacherActionOpenCountCache, setTeacherActionOpenCountCache] = useState(0);
  const [retestRecoveryActions, setRetestRecoveryActions] = useState([]);
  const [parentContactSourceAction, setParentContactSourceAction] = useState(null);
  const [studentSessionSummaries, setStudentSessionSummaries] = useState([]);
  // Curriculum pacing and per-class skill overrides. Teacher-owned inputs to
  // the adaptive path engine, read by the student's Path, Recommended for You
  // and CCMR — a change here changes what a student is offered.
  const [pacingByClass, setPacingByClass] = useState({});
  const [skillOverrides, setSkillOverrides] = useState([]);
  const [studentPathIntervention, setStudentPathInterventionState] = useState(null);
  const [pathInterventionBusyStudentId, setPathInterventionBusyStudentId] = useState(null);
  const [pacingBusy, setPacingBusy] = useState(false);
  // Weekly Path goal settings, per class. Stored beside pacing and read the
  // same way — students read them, teachers write them, and a class with
  // nothing stored gets working defaults rather than no Path.
  const [weeklyGoalsByClass, setWeeklyGoalsByClass] = useState({});
  const [weeklyGoalBusy, setWeeklyGoalBusy] = useState(false);
  const [weeklyPathCompletionsByStudent, setWeeklyPathCompletionsByStudent] = useState({});
  const [weeklyPathGoalSnapshotsByStudent, setWeeklyPathGoalSnapshotsByStudent] = useState({});
  const [studentWeeklyPathProgress, setStudentWeeklyPathProgress] = useState(null);
  // Set when the server could not read the whole week. The Weekly Path table
  // shows grades, so an incomplete read has to be visible rather than assumed.
  // The student whose profile drawer is open, from ANY teacher surface.
  // Held here so the drawer opens OVER the teacher's current work rather than
  // navigating them away from the class monitor or gradebook they were reading.
  const [profileDrawerStudentId, setProfileDrawerStudentId] = useState(null);
  // The Student Support Evidence Report, opened for one student from the
  // drawer, the gradebook or the roster. It stacks above the drawer.
  const [supportReportStudentId, setSupportReportStudentId] = useState(null);
  const [caseReviewStudentId, setCaseReviewStudentId] = useState(null);
  // ONE ASSIGNMENT, FROM ANYWHERE (components/teacher/AssignmentHub.jsx): the
  // assignment and the class it was opened from. Like the student drawer, it
  // opens over the current screen instead of navigating away from it.
  const [assignmentHubTarget, setAssignmentHubTarget] = useState(null);
  // A hand-off into Grade Export (class and/or assignment already chosen).
  const [gradeExportScope, setGradeExportScope] = useState(null);
  // A hand-off into Live Class on Home: which class and assignment to show.
  const [liveFocus, setLiveFocus] = useState(null);
  const [gradebookProgressFilter, setGradebookProgressFilter] = useState('all');
  // Which Assignments-tab groups the teacher has opened or closed by hand
  // (platform/teacher/assignmentListGroups.js). Closed and library groups start
  // folded; the one holding the card being edited always opens.
  const [assignmentGroupOpen, setAssignmentGroupOpen] = useState({});
  // The global live dashboard keeps bounded recent data. Opening one student's
  // profile performs a focused query so older history is not silently lost just
  // because this teacher has many students/classes.
  const [profileSupportHistory, setProfileSupportHistory] = useState({
    studentId: null,
    events: [],
    summaries: [],
  });
  const [weeklyPathTruncated, setWeeklyPathTruncated] = useState(false);
  // A prepared Classroom grade payload awaiting the teacher's review. Holding it
  // in state rather than sending it is the whole point: nothing reaches
  // Classroom without a person having looked at it.
  const [classroomSyncProposal, setClassroomSyncProposal] = useState(null);
  const [classroomManagerAssignmentId, setClassroomManagerAssignmentId] = useState('');
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  // Delivered-question evidence for one class, loaded only when a teacher asks
  // for it. One Firestore read per student is not a price to pay for rendering
  // a summary panel nobody requested.
  const [classEvidenceByStudentId, setClassEvidenceByStudentId] = useState({});
  const [classEvidenceLoading, setClassEvidenceLoading] = useState(false);
  // Which class's weekly progress has actually come back from the server.
  // "No data yet" and "no sessions completed" are different facts, and only one
  // of them is worth telling a teacher about.
  const [weeklyPathProgressLoadedFor, setWeeklyPathProgressLoadedFor] = useState(null);
  const [weeklyPathProgressLoading, setWeeklyPathProgressLoading] = useState(false);
  // The skill a student picked from Recommended for You, consumed once by
  // My Math Path and cleared when they come back.
  const [pathLaunchTeks, setPathLaunchTeks] = useState(null);
  const [activeAssignmentId, setActiveAssignmentId] = useState(null);
  const [tracker, setTracker] = useState({});
  const [studentOutboxDepth, setStudentOutboxDepth] = useState(0);
  // Grade-bearing work is counted separately: a pending checkpoint is not a
  // reason to worry a student, and a pending Submit is.
  const [studentPendingGradeCount, setStudentPendingGradeCount] = useState(0);
  const [studentNeedsReviewCount, setStudentNeedsReviewCount] = useState(0);
  const [studentPersistenceStatus, setStudentPersistenceStatus] = useState('idle');
  const [studentReportingError, setStudentReportingError] = useState(null);
  // What the deadline finalizer did with each checkpointed question, read back
  // from the server's own receipt. A student who was not in the tab when time
  // ended finds out here what happened, and never reads "submitted" for a
  // response that was not complete.
  const [checkpointOutcomes, setCheckpointOutcomes] = useState({});
  // Bumped when a server-held draft that this device did not have is restored.
  // It is part of the QuestionEngine key, so the workspace remounts and the
  // tools read the recovered work — without the first render having waited.
  const [workspaceDraftGeneration, setWorkspaceDraftGeneration] = useState(0);
  // Where the student's cursor was when that remount was ordered, and on which
  // question: the remount puts it back there instead of in the first box (a
  // keystroke already on its way would otherwise land over the restored work).
  const [draftRestoreFocus, setDraftRestoreFocus] = useState(null);
  const currentQuestionIndexRef = useRef(0);
  const workspaceDraftSyncRef = useRef(null);
  const trackerRef = useRef({});
  const [practiceTracker, setPracticeTracker] = useState({});
  // Practice Mode and "View as Student" scratchpads never reach Firestore, so
  // they live here — in budgeted, least-recently-used stores, because a page is
  // an image of up to ~700KB and a day of practice used to keep every one.
  const [practiceScratchpads, setPracticeScratchpads] = useState(EMPTY_SCRATCHPAD_CACHE);
  const [previewTracker, setPreviewTracker] = useState({});
  const [previewScratchpads, setPreviewScratchpads] = useState(EMPTY_SCRATCHPAD_CACHE);
  const [previewSessionId, setPreviewSessionId] = useState(0);
  const [teacherScratchpadDialog, setTeacherScratchpadDialog] = useState(null);
  const [teacherScratchpadLoading, setTeacherScratchpadLoading] = useState(false);
  const [responseInspectorTarget, setResponseInspectorTarget] = useState(null);
  const [teacherWorksheetDialog, setTeacherWorksheetDialog] = useState(null);
  const [teacherWorksheetBusy, setTeacherWorksheetBusy] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [assignmentNavigationCollapsed, setAssignmentNavigationCollapsed] = useState(false);
  const [assignmentOverviewExpanded, setAssignmentOverviewExpanded] = useState(false);
  const assignmentQuestionStageRef = useRef(null);
  // A restore's cursor belongs to the question it was read on (draftRestoreFocus):
  // another question, or another assignment, opens as any question opens.
  useEffect(() => {
    currentQuestionIndexRef.current = currentQuestionIndex;
    setDraftRestoreFocus(null);
  }, [currentQuestionIndex, activeAssignmentId]);

  // Once the student reaches the workspace, the full progress dashboard has
  // done its job. Keep its section/question/previous/next essentials in one
  // row and let the existing “Show progress” control restore the full view.
  // Short landscape phones start in this presentation even before scrolling.
  useEffect(() => {
    if (activeView !== 'assignment' || !activeAssignmentId) return undefined;
    let frame = 0;
    const updateAssignmentNavigationChrome = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const work = assignmentQuestionStageRef.current?.querySelector('[data-work-view-focus="true"]')
          || assignmentQuestionStageRef.current?.querySelector('.math-tool-workspace');
        if (shouldCompactAssignmentNavigation({
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          workTop: work?.getBoundingClientRect?.().top ?? Infinity,
        })) {
          setAssignmentNavigationCollapsed(true);
          setAssignmentOverviewExpanded(false);
        }
      });
    };
    updateAssignmentNavigationChrome();
    window.addEventListener('scroll', updateAssignmentNavigationChrome, { passive: true });
    window.addEventListener('resize', updateAssignmentNavigationChrome);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updateAssignmentNavigationChrome);
      window.removeEventListener('resize', updateAssignmentNavigationChrome);
    };
  }, [activeView, activeAssignmentId]);

  const [resumeAction, setResumeAction] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [classSchedule, setClassSchedule] = useState(DEFAULT_CLASS_SCHEDULE);
  const [courseProfiles, setCourseProfiles] = useState(() => defaultCourseProfiles(CLASS_PERIODS));
  const [courseProfilesSaving, setCourseProfilesSaving] = useState(false);
  const [assignmentActivity, setAssignmentActivity] = useState({});
  const [dolGradesByAssignment, setDolGradesByAssignment] = useState({});
  const [classworkGradesByAssignment, setClassworkGradesByAssignment] = useState({});
  const [supportUsageByAssignment, setSupportUsageByAssignment] = useState({});
  const [classroomSyncStatusByAssignment, setClassroomSyncStatusByAssignment] = useState({});
  /*
   * The canonical recorded Test Cycle grades, read from grades/{studentId}.
   *
   * Written ONLY by the secure release path in Cloud Functions. The browser
   * never computes or writes this: a device that could write its own recorded
   * grade is a device that can pass a test it did not take.
   */
  const [testCycleGrades, setTestCycleGrades] = useState({});
  // A secure Test or Retest owns the screen while it runs; the Warm-Up and
  // Pack-Up banners and the browser's Back button stand down until it ends.
  const secureExamActive = useSecureExamActive();
  const [teacherGradeOverridesByAssignment, setTeacherGradeOverridesByAssignment] = useState({});
  // The student's own Practice-based Recovery records (server-written; see
  // functions/shared/sectionRecoveryRecord.mjs). The browser never builds one:
  // it holds what the grades snapshot says, plus the record the server
  // returned from its last action until that snapshot arrives.
  const [sectionRecoveryByAssignment, setSectionRecoveryByAssignment] = useState({});
  // The student's Live Challenge Warm-Up results (server-written when a match
  // finishes). A result is the Warm-Up grade, so the Grade Center reads it.
  const [warmupChallengeByAssignment, setWarmupChallengeByAssignment] = useState({});
  // The Recovery the student has open ({ assignmentId, section, mode }), and
  // the section whose Start is waiting on the server.
  const [recoverySession, setRecoverySession] = useState(null);
  const [recoveryBusySection, setRecoveryBusySection] = useState(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState(null);
  const [editingAssignmentDates, setEditingAssignmentDates] = useState({ dueAt: '', lateDueAt: '', assignedClassPeriods: [], assignedClassIds: [] });
  const [questionEditorAssignment, setQuestionEditorAssignment] = useState(null);
  const [contentUpgradeRequest, setContentUpgradeRequest] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [assignmentFolderPaths, setAssignmentFolderPaths] = useState([]);
  const [libraryNavigation, setLibraryNavigation] = useState(null);
  const [movingFolderAssignmentId, setMovingFolderAssignmentId] = useState(null);
  const [movingFolderValue, setMovingFolderValue] = useState('');
  // "Dates & classes" can be opened from an assignment's hub on any screen. The
  // card being edited may be far down the Assignments tab (or in a folded
  // closed group, which opens for it), so bring it to the teacher.
  useEffect(() => {
    if (teacherTab !== 'assignments' || !editingAssignmentId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector(`[data-assignment-card="${CSS.escape(editingAssignmentId)}"]`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [teacherTab, editingAssignmentId]);
  const [feedbackReleaseBusyId, setFeedbackReleaseBusyId] = useState(null);
  const [dolUnlockBusyKey, setDolUnlockBusyKey] = useState(null);
  const [dolAttemptGrantBusyKey, setDolAttemptGrantBusyKey] = useState(null);
  const [dolControlBusyKey, setDolControlBusyKey] = useState(null);
  const dolRecoveryAnnouncedRef = useRef({});
  const [warmupControlBusyKey, setWarmupControlBusyKey] = useState(null);
  const [sectionAccessBusyKey, setSectionAccessBusyKey] = useState(null);
  const [studentDashboardMode, setStudentDashboardMode] = useState('assignments');
  // Which Test Cycle the student has open. One id, because a student is in one
  // assessment at a time and the card asks the server for everything else.
  const [activeTestCycleAssignmentId, setActiveTestCycleAssignmentId] = useState(null);
  // What, on the student's live grade document, means "ask the server about
  // this Test Cycle again": its projection (stage, release, retest) and its
  // Review answers. A string, so an unrelated grade change does not refetch.
  /*
   * ACTIONABLE CHANGES ARE SURFACED, NOT SENT.
   *
   * There is no inbox and there should not be one. But when the server moves a
   * student's Test Cycle while they are signed in — results released,
   * corrections opened, a retest unlocked — the live grade document already
   * says so, and one quiet toast says it to the student. The first snapshot
   * after sign-in announces nothing (that is history, and the list's "New"
   * marker covers it), and nothing interrupts a secure exam in progress.
   */
  const previousTestCycleStagesRef = useRef(null);
  useEffect(() => {
    if (user?.role !== 'student') return;
    const current = Object.fromEntries(Object.entries(testCycleGrades || {})
      .map(([assignmentId, projection]) => [assignmentId, projection?.stage || null]));
    const previous = previousTestCycleStagesRef.current;
    previousTestCycleStagesRef.current = current;
    if (!previous || isSecureExamActive()) return;
    const NOTICE = {
      passed: 'Your test results are ready.',
      corrections: 'Your test results are ready. Your corrections are open.',
      retest: 'Your retest is unlocked.',
      complete: 'Your retest results are ready.',
      retestClosed: 'Your teacher has closed retesting. Your recorded grade is final.',
    };
    Object.entries(current).forEach(([assignmentId, stage]) => {
      if (!stage || previous[assignmentId] === stage || !NOTICE[stage]) return;
      const title = assignments.find((assignment) => assignment.id === assignmentId)?.title || 'Your assessment';
      toastInfo(title, NOTICE[stage]);
    });
  }, [testCycleGrades]); // eslint-disable-line react-hooks/exhaustive-deps

  const testCycleCardRefreshKey = useMemo(() => {
    if (!activeTestCycleAssignmentId) return null;
    return buildTestCycleCardRefreshKey({
      projection: testCycleGrades?.[activeTestCycleAssignmentId],
      reviewRecords: tracker?.[activeTestCycleAssignmentId],
    });
  }, [activeTestCycleAssignmentId, testCycleGrades, tracker]);
  // Marking-period metadata, shared by the student Grade Center and the teacher
  // control surface. Student-safe by construction: ids, labels, order, and
  // whether a period is closed. No teacher notes or policy live in it.
  const [gradingPeriodSettings, setGradingPeriodSettings] = useState(() => normalizeGradingPeriodSettings({}));
  const [gradingPeriodBusy, setGradingPeriodBusy] = useState(false);
  const [liveChallengeInvite, setLiveChallengeInvite] = useState(null);
  // Rooms this student has finished or stepped out of. Leaving the inline
  // Warm-Up game has to be recorded, or the route would still say PLAY and drop
  // them straight back into it — a trap with no way into the assignment.
  const [warmupChallengePlayedRoomIds, setWarmupChallengePlayedRoomIds] = useState([]);

  // Browser Back/Forward should move through MathMaster's logical student
  // screens before it ever considers the website that launched MathMaster.
  //
  // The app is intentionally state-driven rather than react-router driven, so
  // without these same-document History API entries Safari/Chrome sees the
  // entire student experience as one page. A Back press from a question can
  // therefore leave MathMaster altogether.
  const studentBrowserHistoryReadyRef = useRef(false);
  const studentBrowserRouteRef = useRef(null);
  // The teacher's counterpart (teacherBrowserRoute, near Live Teaching below).
  const teacherBrowserHistoryReadyRef = useRef(false);
  const teacherHistoryStepBackAtRef = useRef(0);
  const teacherHistoryRestoreRef = useRef(null);
  // Which assignment the in-memory preview tracker belongs to, so Back into a
  // preview resumes it only when the work on screen is that assignment's.
  const previewTrackerAssignmentIdRef = useRef(null);
  const studentBrowserRoute = useMemo(() => {
    if (user?.role !== 'student') return null;
    if (activeView === 'assignment') {
      return {
        surface: 'assignment',
        assignmentId: activeAssignmentId || '',
        questionIndex: currentQuestionIndex,
      };
    }
    // Assignment Result is its own entry so the required Back chain —
    // Practice -> Result -> Grades -> Home — has a browser entry per screen.
    if (activeView === 'assignmentResult') {
      return {
        surface: 'assignmentResult',
        assignmentId: assignmentResultRoute?.assignmentId || activeAssignmentId || '',
        sectionKey: assignmentResultRoute?.sectionKey || '',
        origin: assignmentResultRoute?.origin || 'assignments',
      };
    }
    return {
      surface: 'dashboard',
      dashboardMode: studentDashboardMode || 'assignments',
    };
  }, [user?.role, activeView, activeAssignmentId, currentQuestionIndex, studentDashboardMode, assignmentResultRoute]);

  useEffect(() => {
    if (!studentBrowserRoute) {
      studentBrowserHistoryReadyRef.current = false;
      return;
    }

    const current = readStudentRouteState(window.history.state);
    const currentKey = current ? studentRouteKey(current) : null;
    const targetKey = studentRouteKey(studentBrowserRoute);

    // Mark the document entry the student arrived on as MathMaster Home. From
    // this point onward internal navigation pushes same-document entries.
    if (!studentBrowserHistoryReadyRef.current) {
      studentBrowserHistoryReadyRef.current = true;
      if (currentKey !== targetKey) {
        writeStudentRouteState(studentBrowserRoute, { replace: true });
      }
      return;
    }

    // A popstate restoration changes React state AFTER the browser has already
    // moved to the matching history entry. Seeing the same key here prevents
    // that restoration from immediately pushing a duplicate entry.
    if (currentKey !== targetKey) {
      writeStudentRouteState(studentBrowserRoute);
    }
  }, [studentBrowserRoute]);
  useEffect(() => { studentBrowserRouteRef.current = studentBrowserRoute; }, [studentBrowserRoute]);

  useEffect(() => {
    if (user?.role !== 'student') return undefined;

    const restoreFromBrowserHistory = (event) => {
      /*
       * BACK DOES NOT LEAVE A SECURE EXAM.
       *
       * The browser has already moved to the previous entry; put the exam's
       * entry back and stay. Leaving would unmount the exam mid-question (the
       * answers are saved, but the student rarely meant it). Submitting, or the
       * exam's own exit after it is submitted, is the way out.
       */
      if (isSecureExamActive()) {
        if (studentBrowserRouteRef.current) writeStudentRouteState(studentBrowserRouteRef.current);
        toastInfo('Your test is still open', 'Use Submit test when you are finished. Your answers are saved as you type.');
        return;
      }
      const route = readStudentRouteState(event.state);
      if (!route) return;

      if (route.surface === 'assignment') {
        setStudentDashboardMode('assignments');
        setPathLaunchTeks(null);
        setActiveAssignmentId(route.assignmentId || null);
        setCurrentQuestionIndex(route.questionIndex || 0);
        setActiveView('assignment');
        return;
      }

      // Back onto a result entry restores the same assignment — and the same
      // Classroom section, when the student arrived through a split link.
      if (route.surface === 'assignmentResult') {
        setPathLaunchTeks(null);
        setActiveAssignmentId(route.assignmentId || null);
        setActiveClassroomSectionKey(route.sectionKey || null);
        setAssignmentResultRoute((current) => (
          current && current.assignmentId === route.assignmentId && current.origin === route.origin
            ? current
            : {
              assignmentId: route.assignmentId || '',
              sectionKey: route.sectionKey || 'whole',
              sectionLabel: null,
              questionIndex: 0,
              origin: route.origin || 'assignments',
            }
        ));
        setActiveView('assignmentResult');
        return;
      }

      setActiveView('dashboard');
      setAssignmentResultRoute(null);
      setActiveClassroomSectionKey(null);
      setActiveAssignmentId(null);
      setStudentDashboardMode(route.dashboardMode || 'assignments');
      if (route.dashboardMode !== 'mathPath') setPathLaunchTeks(null);
    };

    window.addEventListener('popstate', restoreFromBrowserHistory);
    return () => window.removeEventListener('popstate', restoreFromBrowserHistory);
  }, [user?.role]);


  // A Live Challenge invitation is one tiny per-student pointer. Listening at
  // the App level means the student can be alerted while sitting on the
  // dashboard OR while working inside an assignment; the heavy game player is
  // still lazy-loaded only when they actually open it.
  useEffect(() => {
    if (user?.role !== 'student' || !user?.id) {
      setLiveChallengeInvite(null);
      return undefined;
    }
    return watchLiveChallengeInvite(
      user.id,
      (invite) => setLiveChallengeInvite(invite),
      (error) => console.error('Could not watch Live Challenge invitation:', error),
    );
  }, [user?.role, user?.id]);
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const currentStudentMasteryProfile = useMemo(() => {
    if (user?.role !== 'student') return null;
    return buildStudentMasteryProfile({
      student: {
        id: user.id,
        classPeriod: user.classPeriod,
        gradesByAssignment: tracker,
        supportUsageByAssignment,
      },
      assignments,
    });
  }, [user, tracker, supportUsageByAssignment, assignments]);

  // Overrides, then a Live Challenge Warm-Up result, then any completed
  // Practice-based Recovery — the same order every teacher surface, Grade
  // Transfer and Classroom passback use.
  const gradeDisplayTracker = useMemo(
    () => projectSectionRecoveriesForDisplay(
      projectTeacherOverridesForDisplay(tracker, teacherGradeOverridesByAssignment),
      sectionRecoveryByAssignment,
      Object.fromEntries(assignments.map((assignment) => [assignment.id, assignment])),
      warmupChallengeByAssignment,
      // A Recovery credits only this student's own items (never one their
      // reduced-item-count accommodation omits).
      user?.role === 'student' ? user.profile || null : null,
    ),
    [tracker, teacherGradeOverridesByAssignment, sectionRecoveryByAssignment, assignments, warmupChallengeByAssignment, user?.role, user?.profile],
  );

  // Recovery for the assignment whose result is open. The original section is
  // read AFTER teacher overrides and BEFORE any Recovery — the comparison the
  // server makes — so the panel never offers what the server would refuse.
  const recoveryAssignmentId = user?.role === 'student' && activeView === 'assignmentResult'
    ? assignmentResultRoute?.assignmentId || null
    : null;
  // Recovery for every open assignment, so Home's "Today" rule and Grades'
  // "Ways to raise your grade" see the Recoveries the result page would offer
  // (platform/student/recoveryStates.js). Refreshed once a minute at most.
  const studentRecoveryMinute = Math.floor(now / 60000);
  const studentRecoverySummariesByAssignment = useMemo(() => (user?.role === 'student' && user?.id
    ? buildRecoverySummariesByAssignment({
      assignments,
      trackerByAssignment: projectTeacherOverridesForDisplay(tracker, teacherGradeOverridesByAssignment) || {},
      sectionRecoveryByAssignment,
      studentId: user.id,
      classId: user.classId || null,
      classPeriod: user.classPeriod,
      schedule: classSchedule,
      studentProfile: user.profile || null,
      nowValue: studentRecoveryMinute * 60000,
    })
    : {}), [user?.role, user?.id, user?.classId, user?.classPeriod, user?.profile, assignments, tracker, teacherGradeOverridesByAssignment, sectionRecoveryByAssignment, classSchedule, studentRecoveryMinute]);
  const studentRecoverySummary = useMemo(() => {
    if (!recoveryAssignmentId || !user?.id) return [];
    const assignment = assignments.find((item) => item.id === recoveryAssignmentId);
    if (!assignment) return [];
    return buildStudentRecoverySummary({
      assignment,
      tracker: projectTeacherOverridesForDisplay(tracker, teacherGradeOverridesByAssignment)?.[recoveryAssignmentId] || {},
      recoveryForAssignment: sectionRecoveryByAssignment?.[recoveryAssignmentId] || null,
      studentId: user.id,
      classId: user.classId || null,
      classPeriod: user.classPeriod,
      schedule: classSchedule,
      studentProfile: user.profile || null,
    });
  }, [recoveryAssignmentId, assignments, tracker, teacherGradeOverridesByAssignment, sectionRecoveryByAssignment, user?.id, user?.classId, user?.classPeriod, user?.profile, classSchedule]);

  useEffect(() => {
    if (!recoveryAssignmentId) setRecoverySession(null);
  }, [recoveryAssignmentId]);

  // Active students per class, for Pre-Flight's "enough distinct questions
  // for this class" check. Counts only: no identities leave this memo.
  const preflightRosterSizesByClassId = useMemo(() => {
    const sizes = {};
    (Array.isArray(teacherRosterSummaries) ? teacherRosterSummaries : []).forEach((student) => {
      if (!student?.classId || String(student.status || 'active') !== 'active') return;
      sizes[student.classId] = (sizes[student.classId] || 0) + 1;
    });
    return sizes;
  }, [teacherRosterSummaries]);

  // THE TEACHER IDENTITY INDEX: studentId -> compact roster row. Built from the
  // roster the teacher already holds — no read, no listener — and only when
  // that roster is refetched, so naming a student from a stored id (a toast, a
  // support event, a recovery row) is an O(1) lookup on every screen.
  const teacherStudentIdentityIndex = useMemo(
    () => buildStudentIdentityIndex(teacherRosterSummaries),
    [teacherRosterSummaries],
  );

  const mergeSectionRecoveryRecord = useCallback((assignmentId, section, record) => {
    if (!assignmentId || !section || !record) return;
    setSectionRecoveryByAssignment((current) => ({
      ...(current || {}),
      [assignmentId]: { ...(current?.[assignmentId] || {}), [section]: record },
    }));
  }, []);

  /*
   * THE STUDENT GRADE CENTER, BUILT FROM THE CANONICAL TRACKER.
   *
   * `tracker` is grades/{studentId}.gradesByAssignment — the same evidence the
   * teacher gradebook and Google Classroom passback read. `practiceTracker` is
   * deliberately NOT passed: post-close practice runs against it, and the model
   * has no parameter that could receive it, so practising a closed assignment
   * cannot move a recorded grade.
   */
  const studentGradeCenter = useMemo(() => {
    if (user?.role !== 'student') return null;
    return buildStudentGradeCenter({
      assignments,
      classId: user.classId || null,
      classPeriod: user.classPeriod,
      studentId: user.id,
      courseLabel: user.className || user.classPeriod || '',
      nowValue: now,
      tracker: gradeDisplayTracker,
      testCycleGrades,
      classworkGradesByAssignment,
      gradingPeriodSettings,
      classroomSyncStatusByAssignment,
      practicePassRedemptionsByAssignment: studentClassPoints.redemptionsByAssignment,
      supportProfile: user.profile || null,
      // A held Practice-based Recovery makes its assignment Pending Grade —
      // unless an assignment-level teacher override already decided it.
      sectionRecoveryByAssignment,
      teacherGradeOverridesByAssignment,
      providers: { assignmentHasHeldTeacherFeedback, prerequisiteAccess },
    });
  }, [
    user, assignments, now, gradeDisplayTracker, testCycleGrades, classworkGradesByAssignment,
    gradingPeriodSettings, classroomSyncStatusByAssignment, studentClassPoints.redemptionsByAssignment,
    sectionRecoveryByAssignment, teacherGradeOverridesByAssignment,
  ]);

  /*
   * WHICH ASSIGNMENTS THE WALLET OFFERS, AND THE ONE DOOR THAT SPENDS POINTS.
   *
   * `practicePassEligibleAssignments` is a best-effort UX filter over data this
   * component already holds for the dashboard (`assignments`,
   * `gradeDisplayTracker`) -- it never decides eligibility. `redeemPracticePass`
   * (functions/index.js) independently re-verifies everything before it ever
   * spends a point; a refusal surfaces through the wallet's own inline error
   * state, and the balance shown never moves until the authoritative account
   * subscription above updates it.
   */
  const studentPracticePassEligibleAssignments = useMemo(() => (
    user?.role === 'student' && user.id && user.classId
      ? practicePassEligibleAssignments({
        assignments,
        classId: user.classId,
        classPeriod: user.classPeriod,
        tracker: gradeDisplayTracker,
        redemptionsByAssignment: studentClassPoints.redemptionsByAssignment,
        nowValue: now,
        studentId: user.id,
      })
      : []
  ), [user, assignments, gradeDisplayTracker, studentClassPoints.redemptionsByAssignment, now]);

  const studentRewardWallet = useMemo(() => buildRewardWallet({
    grants: studentClassPoints.grants,
    redemptions: studentClassPoints.redemptions,
    account: studentClassPoints.unavailable ? null : studentClassPoints.account,
    nowMs: now,
  }), [studentClassPoints.grants, studentClassPoints.redemptions, studentClassPoints.account, studentClassPoints.unavailable, now]);

  // "New" lasts for one visit to My Rewards: leaving it clears the marks.
  const previousStudentModeRef = useRef(null);
  useEffect(() => {
    if (previousStudentModeRef.current === 'rewards' && studentDashboardMode !== 'rewards') clearNewRewards();
    previousStudentModeRef.current = studentDashboardMode;
  }, [studentDashboardMode]);

  // The signed-in student's own Student Learning Profile, built from the same
  // evidence their teacher's roster reads. Assignment adaptation needs the DOK
  // and stable-band picture, which the legacy mastery profile does not carry.
  const studentLearningProfile = useMemo(() => {
    if (user?.role !== 'student') return null;
    const student = {
      id: user.id,
      classPeriod: user.classPeriod,
      gradesByAssignment: tracker,
      supportUsageByAssignment,
    };
    const rows = collectStudentEvidence({ student, assignments });
    const { events } = evidenceRowsToEvents(rows);
    return buildStudentLearningProfile({
      courseId: user?.profile?.course || 'algebra1',
      evidenceEvents: events,
      masteryProfilesByTeks: currentStudentMasteryProfile
        ? adaptLegacyMasteryToPhase5({ legacyProfile: currentStudentMasteryProfile, evidenceRows: rows })
        : {},
    });
  }, [user, tracker, supportUsageByAssignment, assignments, currentStudentMasteryProfile]);

  const adaptiveStudentProfile = useMemo(() => {
    if (user?.role !== 'student') return null;
    return {
      ...(user.profile || {}),
      adaptiveInstruction: currentStudentMasteryProfile?.adaptiveInstruction || { generatorBand: 3, byTeks: {}, confidence: 'Low', performanceLevel: 'insufficient' },
    };
  }, [user, currentStudentMasteryProfile]);

  const teacherMasteryProfilesByStudentId = useMemo(() => {
    if (teacherStudentDataMode !== 'full') return {};
    if (!allStudents.length) return {};
    return Object.fromEntries(allStudents.map((student) => {
      const profile = buildStudentMasteryProfile({ student, assignments });
      return [student.id, profile];
    }));
  }, [allStudents, assignments, teacherStudentDataMode]);

  // ONE SET OF LEARNING PROFILES FOR THE WHOLE TEACHER WORKSPACE.
  //
  // The Students roster, the Weekly Path table and anything added later all
  // read from this. Building them per screen is how a repository ends up with
  // four status vocabularies and a student who reads as two different levels on
  // two tabs. Derived synchronously from the grades documents already in
  // memory, so no screen pays a Firestore read to show a badge.
  const classesById = useMemo(
    () => Object.fromEntries((Array.isArray(classes) ? classes : []).map((entry) => [entry.classId, entry])),
    [classes],
  );

  // Course level per student, resolved through the shared class resolver. Passed
  // to the CCMR screen for DISPLAY only — enrollment says which room a student
  // sits in, not what they can do.
  const courseLevelByStudentId = useMemo(() => Object.fromEntries(allStudents.map((student) => [
    student.id,
    resolveStudentCourseContext({ student, classesById, courseProfiles }).courseLevel,
  ])), [allStudents, classesById, courseProfiles]);

  // The standards a teacher might type a code for. Both active courses, because
  // a teacher searching "A2.4F" should find it without first switching course.
  const searchableStandards = useMemo(() => (
    TEXAS_MATH_ACTIVE_COURSES.flatMap((course) => getTexasStandardsForCourse(course.id))
  ), []);

  const teacherLearningProfiles = useMemo(() => {
    if (teacherStudentDataMode !== 'full') return {};
    if (!allStudents.length) return {};
    return Object.fromEntries(allStudents.map((student) => {
      const rows = collectStudentEvidence({ student, assignments });
      const { events } = evidenceRowsToEvents(rows);
      const legacyProfile = teacherMasteryProfilesByStudentId[student.id] || null;
      return [student.id, buildStudentLearningProfile({
        // The class is authoritative. A period-keyed course lookup answers with
        // whichever class was written last when two share a period, so one of
        // those two classes' students get profiled against the wrong course.
        courseId: resolveStudentCourseContext({ student, classesById, courseProfiles }).courseId,
        evidenceEvents: events,
        // Without per-TEKS mastery, course mastery is null and the performance
        // projection reads "Establishing Baseline" forever, however much work
        // the student has done. The legacy summaries already carry it.
        masteryProfilesByTeks: legacyProfile
          ? adaptLegacyMasteryToPhase5({ legacyProfile, evidenceRows: rows })
          : {},
      })];
    }));
  }, [allStudents, assignments, courseProfiles, classesById, teacherMasteryProfilesByStudentId, teacherStudentDataMode]);

  // The students in the class the Weekly Path screen is looking at.
  const teacherWeeklyRoster = useMemo(() => {
    if (!['weeklyPath', 'grades'].includes(teacherTab)) return [];
    const activeId = activeClass.classId || classes[0]?.classId || null;
    if (!activeId) return [];
    return studentsInClass({ students: allStudents, classes, classId: activeId })
      .map((student) => ({ ...student, name: formatStudentName(student) }))
      // Named students by last, first, id; students with no name on file last.
      .sort(compareStudentsByName);
  }, [allStudents, classes, activeClass.classId, teacherTab]);

  const teacherWeeklyGoalsByStudent = useMemo(() => {
    if (!['weeklyPath', 'grades'].includes(teacherTab)) return {};
    const activeId = activeClass.classId || classes[0]?.classId || null;
    const classRecord = classes.find((entry) => entry.classId === activeId) || null;
    if (!classRecord) return {};
    const honors = String(classRecord.courseLevel || '').toLowerCase() === 'honors';
    const courseId = classRecord.course || courseProfiles?.[classRecord.period]?.course || 'algebra1';
    const config = storedWeeklyGoalForClassContext(weeklyGoalsByClass, {
      classId: activeId,
      classPeriod: classRecord.period,
    }) || {};
    const pacing = storedPacingForClassContext(pacingByClass, {
      classId: activeId,
      classPeriod: classRecord.period,
    });
    const teacherOverrides = overridesForClassContext(skillOverrides, {
      classId: activeId,
      classPeriod: classRecord.period,
    });

    return Object.fromEntries(teacherWeeklyRoster.map((student) => {
      const studentAssignments = assignments.filter((assignment) => assignmentIsForStudent(assignment, { classId: student.classId || classRecord.classId, classPeriod: student.classPeriod || classRecord.period }));
      const pathOptions = buildStudentPathOptions({
        student,
        assignments: studentAssignments,
        courseId,
        pacing,
        teacherOverrides,
        nowValue: now,
      });
      const plan = buildWeeklyPathPlan({
        options: pathOptions,
        courseId,
        profile: teacherLearningProfiles[student.id] || null,
        sessions: config.sessions || (honors ? 5 : 4),
        honors,
        now,
      });
      const proposedGoal = buildWeeklyGoal({
        plan,
        config,
        honors,
        studentId: student.id,
        courseId,
        now,
      });
      const frozen = weeklyPathGoalSnapshotsByStudent[student.id] || null;
      const goal = frozen ? {
        ...proposedGoal,
        ...frozen,
        settings: proposedGoal.settings,
        profile: proposedGoal.profile,
        suppressed: proposedGoal.suppressed,
      } : { ...proposedGoal, assignmentState: 'proposed' };
      return [student.id, goal];
    }));
  }, [activeClass.classId, classes, courseProfiles, weeklyGoalsByClass, pacingByClass, skillOverrides, teacherWeeklyRoster, assignments, teacherLearningProfiles, weeklyPathGoalSnapshotsByStudent, now, teacherTab]);

  useEffect(() => {
    // Home needs this as much as the Weekly Path tab does: the needs-attention
    // queue reports who is behind, and reporting that from data that has not
    // loaded yet would tell a teacher the whole class is behind every time they
    // open the page.
    if (user?.role !== 'teacher' || !['weeklyPath', 'home', 'grades'].includes(teacherTab)) return undefined;
    if (teacherPreviewRuntimeActive) return undefined;
    const activeId = activeClass.classId || classes[0]?.classId || null;
    if (!activeId) { setWeeklyPathCompletionsByStudent({}); setWeeklyPathGoalSnapshotsByStudent({}); setWeeklyPathProgressLoadedFor(null); return undefined; }
    const classRecord = classes.find((entry) => entry.classId === activeId) || null;
    const config = storedWeeklyGoalForClassContext(weeklyGoalsByClass, {
      classId: activeId,
      classPeriod: classRecord?.period || '',
    }) || {};
    const weekStartsOn = config.weekStartsOn || 1;
    let alive = true;

    const loadProgress = async ({ showLoading = false } = {}) => {
      if (showLoading && alive) setWeeklyPathProgressLoading(true);
      try {
        const result = await fetchTeacherWeeklyPathCompletions({
          classId: activeId,
          // Compute the week at fetch time. This keeps Monday rollover correct
          // without tying a Cloud Function call to App's UI clock tick.
          weekKey: weekKeyFor(Date.now(), weekStartsOn),
        });
        if (alive) {
          setWeeklyPathCompletionsByStudent(result?.byStudentId || {});
          setWeeklyPathGoalSnapshotsByStudent(result?.goalsByStudentId || {});
          setWeeklyPathTruncated(result?.truncated === true);
          setWeeklyPathProgressLoadedFor(activeId);
        }
      } catch (error) {
        console.error('Could not load Weekly Path progress:', error);
        // A failed read is NOT zero completions. Leaving `loadedFor` unset keeps
        // every completion alert out of the queue rather than announcing that
        // nobody did any work.
        if (alive) { setWeeklyPathCompletionsByStudent({}); setWeeklyPathGoalSnapshotsByStudent({}); setWeeklyPathTruncated(false); setWeeklyPathProgressLoadedFor(null); }
      } finally {
        if (showLoading && alive) setWeeklyPathProgressLoading(false);
      }
    };

    loadProgress({ showLoading: true });
    // Weekly progress changes only when sessions complete. Refresh once a
    // minute while the teacher is looking at this class instead of invoking a
    // callable every time the application's display clock ticks.
    const timer = setInterval(() => loadProgress(), 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [user?.role, teacherTab, activeClass.classId, classes, weeklyGoalsByClass, teacherPreviewRuntimeActive]);

  useEffect(() => {
    if (!pendingClassroomLaunch) return;
    if (user?.role !== 'student') return;
    const targetAssignment = assignments.find(
      (assignment) => assignment.id === pendingClassroomLaunch.assignmentId,
    );
    if (!targetAssignment) return;

    // A Classroom link is a doorway, not authorization. The signed-in student
    // must still belong to the MathMaster class that owns this assignment.
    if (!assignmentIsForStudent(targetAssignment, { classId: user.classId || null, classPeriod: user.classPeriod })) {
      toastWarning(
        'Assignment not available',
        'This Google Classroom assignment is not assigned to your MathMaster class.',
      );
      setPendingClassroomLaunch(null);
      return;
    }

    try {
      const target = classroomLaunchTarget({
        assignment: targetAssignment,
        launch: pendingClassroomLaunch,
        nowValue: Date.now(),
        studentId: user.id,
      });

      // A permanently closed post is an official grade/result link first —
      // whole assignment or split section alike. Starting voluntary practice is
      // a separate, explicit action so opening Classroom can never silently
      // replace the frozen record with an ungraded tracker, and the student
      // lands on a screen with their grade on it rather than a disabled
      // workspace they cannot navigate out of.
      if (target.showFrozenReportFirst) {
        setAssignmentResultRoute(target);
        setActiveClassroomSectionKey(target.sectionKey);
        setActiveAssignmentId(target.assignmentId);
        setCurrentQuestionIndex(target.questionIndex);
        setStudentDashboardMode('assignments');
        setActiveView('assignmentResult');
      } else {
        startAssignment(target.assignmentId, target.questionIndex, {
          sectionKey: target.isSectionLaunch ? target.sectionKey : null,
        });
      }
    } catch (error) {
      console.error('Could not open Classroom section link:', error);
      toastWarning('Classroom link unavailable', error?.message || 'This Classroom section could not be opened.');
    } finally {
      setPendingClassroomLaunch(null);
    }
    // startAssignment intentionally reads the latest assignment/tracker state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingClassroomLaunch, user, assignments, tracker]);

  // Holds the normalized text of the JSON currently in preflight. Nothing edits
  // it by hand any more; it exists so publishing can re-parse exactly what the
  // teacher reviewed.
  const [assignmentPreflight, setAssignmentPreflight] = useState(null);
  const [assignmentPreflightBusy, setAssignmentPreflightBusy] = useState(false);

  const [gradebookFilter, setGradebookFilter] = useState({
    classId: '',
    classPeriod: '',
    assignmentId: null,
    student: null,
  });

  // The gradebook shows Practice excused where a student used a Practice
  // Pass, exactly as the student's Grade Center and Google Classroom already
  // do; without this the same student read "Practice 0%" here.
  const gradebookHasPracticePass = useClassPracticePasses(
    user?.role === 'teacher' && teacherTab === 'grades' ? gradebookFilter.classId || null : null,
  );

  const [exportJsonAssignment, setExportJsonAssignment] = useState(null);
  const [exportJsonCopied, setExportJsonCopied] = useState(false);

  const [deleteDialog, setDeleteDialog] = useState(null);
  // What the server found before the teacher confirms a delete: null while
  // loading, then { studentsWithWork, canDelete, classroomPublications, ... }
  // or { error }. Delete is offered only when no student has worked on it.
  const [deleteEvidence, setDeleteEvidence] = useState(null);
  const [deleteClassroomAcknowledged, setDeleteClassroomAcknowledged] = useState(false);
  // The Test Cycle a teacher is previewing as a student (an overlay), and the
  // one the Tests tab should open first when reached from an assignment card.
  const [testCyclePreviewAssignment, setTestCyclePreviewAssignment] = useState(null);
  const [focusedTestCycleAssignmentId, setFocusedTestCycleAssignmentId] = useState(null);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deleteTitleConfirmation, setDeleteTitleConfirmation] = useState('');
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [isIdle, setIsIdle] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const lastPointerRef = useRef(null);
  // Academic interaction is deliberately separate from generic mouse/keyboard
  // activity. Presence never records keys or response text; this timestamp is
  // advanced only by meaningful assignment actions below.
  const lastAcademicInteractionRef = useRef(Date.now());
  // When the currently open assignment was started, for the live class grid.
  const liveStartedAtRef = useRef({ assignmentId: null, at: Date.now() });
  // Count only page-visibility losses during the current assignment. We never
  // record which tab/site was opened. This is corroborating telemetry only.
  const liveFocusLossRef = useRef({ assignmentId: null, count: 0, hiddenAt: null });
  // Dynamic question/progress state changes frequently. Keep the latest compact
  // presence payload in a ref so those changes update the heartbeat WITHOUT
  // tearing down the presence document (and therefore without creating an
  // archive-trigger invocation on every answer/question change).
  const livePresencePayloadRef = useRef(null);
  const spotlightPublisherRef = useRef(null);
  const [studentSpotlightRequest, setStudentSpotlightRequest] = useState(null);
  const [studentSpotlightMessage, setStudentSpotlightMessage] = useState('');
  // Session-only active time for the live monitor/archive. Assignment question
  // timers are cumulative across resumes, and assignment-activity pending time
  // is periodically flushed/reset, so neither is a valid class-session clock.
  const liveSessionActiveSecondsRef = useRef({ assignmentId: null, seconds: 0 });
  const liveSessionAttemptBaselineRef = useRef({ assignmentId: null, totalAttemptsByIndex: {} });
  const activeTimeRef = useRef(0);
  const pendingAssignmentSecondsRef = useRef(0);
  const lastDOLStatusRef = useRef({});
  // Last student DOL reminder timestamp, keyed by assignment + class + date.
  // The active DOL card/banner stays visible; this adds a repeated nudge for a
  // student who is deep in another question or sitting on the dashboard.
  const dolOpenAnnouncedRef = useRef({});
  // Warm-Up notices follow the same student-wide pattern as DOL notices:
  // visible on every student surface and repeated while unfinished work is
  // still inside the live Warm-Up window.
  const warmupOpenAnnouncedRef = useRef({});
  const classroomSyncNoticeRef = useRef({});

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(clock);
  }, []);

  // The general dashboard clock can stay inexpensive at 30 seconds, while
  // DOL, Warm-Up auto-close, and pack-up transitions need to happen at the
  // actual bell/timer-derived second. Schedule one precise wake-up for the
  // next transition rather than letting a teacher-set Warm-Up timer drift by
  // as much as the dashboard clock interval.
  useEffect(() => {
    if (user?.role !== 'student' || !user.classPeriod) return undefined;
    const realNow = Date.now();
    const studentContext = { classId: user.classId || null, classPeriod: user.classPeriod };
    const relevantAssignments = assignments
      .filter((assignment) => assignmentIsForStudent(assignment, studentContext));
    const targets = relevantAssignments
      .map((assignment) => getDOLState({ assignment, schedule: classSchedule, ...studentContext, nowValue: realNow }))
      .map((state) => state.status === 'beforeClass' ? state.window?.start?.getTime()
        : state.status === 'waiting' ? state.opensAt?.getTime()
          : state.status === 'active' ? state.endsAt?.getTime() + 100
            : null)
      .filter((target) => Number.isFinite(target) && target > realNow);

    relevantAssignments
      .map((assignment) => getWarmupState({ assignment, schedule: classSchedule, ...studentContext, nowValue: realNow }))
      .map((state) => state.status === 'waiting'
        ? state.opensAt?.getTime()
        : state.status === 'active'
          ? (state.autoCloseScheduled ? state.autoCloseAt?.getTime() : state.endsAt?.getTime()) + 100
          : null)
      .filter((target) => Number.isFinite(target) && target > realNow)
      .forEach((target) => targets.push(target));

    const packUp = getClassPackUpState({
      schedule: classSchedule,
      classPeriod: user.classPeriod,
      nowValue: realNow,
      minutesBeforeEnd: 5,
    });
    const packTarget = packUp.status === 'waiting'
      ? packUp.startsAt?.getTime()
      : packUp.status === 'active'
        ? packUp.endsAt?.getTime() + 100
        : null;
    if (Number.isFinite(packTarget) && packTarget > realNow) targets.push(packTarget);

    if (!targets.length) return undefined;
    const nextTarget = Math.min(...targets);
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(50, nextTarget - realNow));
    return () => window.clearTimeout(timer);
  }, [user, assignments, classSchedule, now]);

  /*
   * A STUDENT'S DEVICE LISTENS TO ITS OWN CLASS, NOT THE SCHOOL.
   *
   * Students: their class's assignments live, plus — read once, by id — any
   * assignment they have work on from before a class move
   * (platform/assignments/studentAssignmentScope.js). Every other class's
   * assignments, and the per-student entries on them, never reach the device,
   * and an edit to another class's assignment no longer wakes it.
   * Teachers keep the whole collection: their screens span classes.
   *
   * AND ITS OWN CONTROLS, NOBODY ELSE'S. Each lesson arrives already reduced
   * to this student's view (no classmate's extension, excusal, reopen, DOL
   * grant or recovery-log entry survives the snapshot), and is then projected
   * once with the student's private controls — exactly one more listener per
   * device (platform/assignments/studentAssignmentControls.js). Every student
   * reader (cards, Resume/Open, lifecycle, Grade Center, Recovery, Practice
   * Pass, make-up, the DOL attempt budget) reads those projected lessons.
   *
   * Teachers: one more listener too — their students' controls for the
   * classes on screen (platform/teacher/teacherClassControls.js) — merged into
   * each lesson's `studentOverrides` by teacherAssignmentView, never into the
   * `dol`, `warmup` or `sectionAccess` that teacher actions write back.
   */
  const studentAssignmentControls = useStudentAssignmentControls({
    db,
    // The SESSION's student, so the listener opens beside sign-in hydration
    // rather than after it; owner-checked on every projection.
    studentId: auth.status === 'ready' && auth.session?.role === 'student' ? auth.session.studentId : null,
  });
  const studentClassAssignmentsRef = useRef([]);
  const studentPriorWorkAssignmentsRef = useRef([]);
  // Whose lessons these are, for the projection: set from the session before
  // the first lesson reaches state, and cleared with the lessons themselves.
  const studentViewerRef = useRef({ studentId: null, profile: null });
  const studentControlsRef = useRef(EMPTY_STUDENT_CONTROLS);
  studentControlsRef.current = studentAssignmentControls;
  /*
   * "WHAT CHANGED" (decision 6): a read-only list built from records the
   * student already reads — released results, grade changes with their fixed
   * reason, excused/reopened/extended work, new work, retests
   * (platform/student/whatChangedModel.js). The device's last-seen time is
   * read once per visit so "New" does not vanish while it is being read.
   */
  const [whatChangedSeenAt, setWhatChangedSeenAt] = useState(0);
  useEffect(() => {
    if (user?.role === 'student' && user?.id) setWhatChangedSeenAt(readWhatChangedSeenAt(user.id));
  }, [user?.role, user?.id]);
  const whatChangedMinute = Math.floor(now / 60000);
  const whatChangedItems = useMemo(() => {
    if (user?.role !== 'student' || !user?.id) return [];
    const input = {
      studentId: user.id,
      classId: user.classId || null,
      classPeriod: user.classPeriod || null,
      assignments,
      testCycleGrades,
      teacherGradeOverridesByAssignment,
      controlsByAssignmentId: studentAssignmentControls?.byAssignmentId || {},
      nowValue: whatChangedMinute * 60000,
      seenAt: whatChangedSeenAt,
    };
    const firstSeenByKey = rememberWhatChangedFirstSeen(user.id, untimedWhatChangedKeys(buildWhatChanged(input)), input.nowValue);
    return buildWhatChanged({ ...input, firstSeenByKey });
  }, [user?.role, user?.id, user?.classId, user?.classPeriod, assignments, testCycleGrades, teacherGradeOverridesByAssignment, studentAssignmentControls, whatChangedMinute, whatChangedSeenAt]);
  // What was last projected into state, so re-running an effect with nothing
  // new projects nothing again (every projection makes new lesson objects).
  const lastPublishedRef = useRef(null);
  const publishStudentAssignments = () => {
    const { studentId, profile } = studentViewerRef.current;
    const inputs = [studentClassAssignmentsRef.current, studentPriorWorkAssignmentsRef.current, studentId, profile, studentControlsRef.current];
    if (lastPublishedRef.current && inputs.every((input, index) => input === lastPublishedRef.current[index])) return;
    lastPublishedRef.current = inputs;
    setAssignments(projectStudentAssignments({
      assignments: mergeStudentAssignments(studentClassAssignmentsRef.current, studentPriorWorkAssignmentsRef.current),
      studentId,
      profile,
      controls: studentControlsRef.current,
    }));
  };

  // Which classes' controls a teacher's screens need right now: the class
  // they are working in, any other class a visible surface shows, and on the
  // cross-class tabs the classes they teach (teacherControlsClassIds).
  const [teacherSurfaceClasses, setTeacherSurfaceClasses] = useState({ live: null, hub: null, attendance: null, exportClassIds: [] });
  const reportTeacherSurfaceClass = useCallback((surface, value) => {
    setTeacherSurfaceClasses((current) => {
      const next = surface === 'exportClassIds'
        ? (Array.isArray(value) ? value.filter(Boolean).map(String) : [])
        : (value ? String(value) : null);
      const same = surface === 'exportClassIds' ? current.exportClassIds.join('|') === next.join('|') : current[surface] === next;
      return same ? current : { ...current, [surface]: next };
    });
  }, []);
  const reportLiveClass = useCallback((classId) => reportTeacherSurfaceClass('live', classId), [reportTeacherSurfaceClass]);
  const reportHubClass = useCallback((classId) => reportTeacherSurfaceClass('hub', classId), [reportTeacherSurfaceClass]);
  const reportAttendanceClass = useCallback((classId) => reportTeacherSurfaceClass('attendance', classId), [reportTeacherSurfaceClass]);
  const reportExportClasses = useCallback((classIds) => reportTeacherSurfaceClass('exportClassIds', classIds), [reportTeacherSurfaceClass]);
  const teacherControlsScope = useMemo(() => {
    if (user?.role !== 'teacher') return '';
    const studentClass = (studentId) => (studentId ? allStudents.find((student) => student.id === studentId)?.classId || null : null);
    return teacherControlsScopeKey({
      email: user.email,
      isRootAdmin: user.isRootAdmin === true,
      classIds: teacherControlsClassIds({
        activeClassId: activeClass.classId,
        surfaceClassIds: [
          teacherTab === 'home' ? teacherSurfaceClasses.live : null,
          assignmentHubTarget ? teacherSurfaceClasses.hub || assignmentHubTarget.classId : null,
          teacherTab === 'attendanceHistory' ? teacherSurfaceClasses.attendance : null,
          studentClass(caseReviewStudentId),
          studentClass(supportReportStudentId),
          ...(teacherTab === 'gradeTransfer' ? teacherSurfaceClasses.exportClassIds : []),
        ],
        crossClassTab: TEACHER_CROSS_CLASS_TABS.has(teacherTab),
        taughtClassIds: classIdsForTeacher(classes.filter((entry) => entry?.status !== 'archived'), user.email),
      }),
    });
  }, [user?.role, user?.email, user?.isRootAdmin, activeClass.classId, teacherTab, teacherSurfaceClasses, assignmentHubTarget, caseReviewStudentId, supportReportStudentId, allStudents, classes]);
  const teacherClassControls = useTeacherClassControls({ db, scopeKey: teacherControlsScope });
  const teacherSharedAssignmentsRef = useRef([]);
  const teacherControlsRef = useRef(EMPTY_TEACHER_CONTROLS);
  teacherControlsRef.current = teacherClassControls;
  const publishTeacherAssignments = () => {
    const inputs = [teacherSharedAssignmentsRef.current, teacherControlsRef.current];
    if (lastPublishedRef.current && inputs.every((input, index) => input === lastPublishedRef.current[index])) return;
    lastPublishedRef.current = inputs;
    setAssignments(projectTeacherAssignments({
      assignments: teacherSharedAssignmentsRef.current,
      controls: teacherControlsRef.current,
    }));
  };
  // Nothing one account's screens held survives into the next account's: the
  // lessons (with that account's own controls projected into them) and every
  // copy they were projected from go at sign-out and at any change of account.
  // The controls listeners themselves are keyed by account and torn down with it.
  const hydratedSessionUidRef = useRef(null);
  const clearSignedInAssignments = () => {
    studentClassAssignmentsRef.current = [];
    studentPriorWorkAssignmentsRef.current = [];
    studentViewerRef.current = { studentId: null, profile: null };
    teacherSharedAssignmentsRef.current = [];
    lastPublishedRef.current = null;
    setAssignments([]);
  };

  // A changed control, a newly read scope, or a profile revision re-projects
  // the lessons already held: no listener is re-opened for it.
  useEffect(() => {
    if (user?.role === 'student' && user.id) {
      studentViewerRef.current = { studentId: user.id, profile: user.profile || null };
      publishStudentAssignments();
    } else if (user?.role === 'teacher') {
      publishTeacherAssignments();
    }
    // The publishers read refs; these are what change their answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.id, user?.profile, studentAssignmentControls, teacherClassControls]);

  useEffect(() => {
    if (!user?.role || !user.id) return undefined;

    if (user.role === 'student') {
      return subscribeStudentClassAssignments({
        db,
        studentId: user.id,
        classId: user.classId,
        onChange: (classAssignments) => {
          studentClassAssignmentsRef.current = classAssignments;
          publishStudentAssignments();
          // A teacher DOL unlock is an assignment update; see below.
          setNow(Date.now());
        },
        onError: (error) => console.error('Assignment live update failed:', error),
      });
    }

    const unsubscribe = onSnapshot(
      collection(db, 'assignments'),
      (snapshot) => {
        const liveAssignments = snapshot.docs.map((assignmentDoc) => ({
          id: assignmentDoc.id,
          ...assignmentDoc.data(),
        }));
        liveAssignments.sort((a, b) =>
          String(a.dueAt || a.dueDate || '').localeCompare(String(b.dueAt || b.dueDate || '')),
        );
        teacherSharedAssignmentsRef.current = liveAssignments;
        publishTeacherAssignments();
        // A teacher DOL unlock is an assignment update. Refresh the logical
        // clock with the snapshot so students do not wait for the next 30s
        // lifecycle tick before seeing an early release.
        setNow(Date.now());
      },
      (error) => console.error('Assignment live update failed:', error),
    );

    return unsubscribe;
    // Who is signed in and their class decide the listener; a profile
    // revision re-projects (above) without re-opening it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.id, user?.classId]);

  // Work a student did under an earlier class: read once per change in the
  // SET of assignments they have work on (not on every answer), by id.
  const studentWorkedAssignmentKey = user?.role === 'student' ? workedAssignmentKey(tracker) : '';
  useEffect(() => {
    if (user?.role !== 'student' || !studentWorkedAssignmentKey) return undefined;
    let cancelled = false;
    const loadedIds = [
      ...studentClassAssignmentsRef.current,
      ...studentPriorWorkAssignmentsRef.current,
    ].map((assignment) => assignment.id);
    const missing = priorWorkAssignmentIds({
      gradesByAssignment: Object.fromEntries(studentWorkedAssignmentKey.split('|').map((id) => [id, true])),
      loadedIds,
    });
    if (!missing.length) return undefined;
    fetchAssignmentsById(db, missing, { studentId: user.id })
      .then((fetched) => {
        if (cancelled || !fetched.length) return;
        studentPriorWorkAssignmentsRef.current = mergeStudentAssignments(studentPriorWorkAssignmentsRef.current, fetched);
        publishStudentAssignments();
      })
      .catch((error) => console.warn('Could not load earlier-class assignments:', error));
    return () => { cancelled = true; };
    // publishStudentAssignments reads refs and the current user; the key is
    // what decides whether there is anything new to read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.id, studentWorkedAssignmentKey]);

  // Pacing and overrides are advisory: a failure here must not stop a teacher
  // signing in, so it degrades to defaults rather than rejecting the login.
  const fetchPathSettings = async () => {
    try {
      const [pacing, overrides, weeklyGoals] = await Promise.all([
        fetchClassPacing(), fetchSkillOverrides(), fetchWeeklyGoalSettings(),
      ]);
      setPacingByClass(pacing);
      setSkillOverrides(overrides);
      setWeeklyGoalsByClass(weeklyGoals);
    } catch (error) {
      console.error('Could not load curriculum pacing:', error);
    }
  };

  // Inputs for the student's independent path. Students read pacing and
  // overrides (settings/ is student-readable); they never write them.
  const studentStoredPacing = useMemo(() => {
    if (user?.role !== 'student') return null;
    return storedPacingForClassContext(pacingByClass, {
      classId: user.classId,
      classPeriod: user.classPeriod,
    });
  }, [user, pacingByClass]);

  // The teacher's weekly goal settings for THIS student's class. Same
  // classId-then-period fallback as pacing, and the same rule: nothing stored
  // means the defaults apply, never that the student has no week.
  const studentWeeklyGoalConfig = useMemo(() => {
    if (user?.role !== 'student') return null;
    return storedWeeklyGoalForClassContext(weeklyGoalsByClass, {
      classId: user.classId,
      classPeriod: user.classPeriod,
    });
  }, [user, weeklyGoalsByClass]);

  useEffect(() => {
    if (user?.role !== 'student' || !user.id) {
      setStudentWeeklyPathProgress(null);
      return undefined;
    }
    if (studentDashboardMode !== 'assignments') return undefined;

    const honors = String(user?.profile?.courseLevel || '').toLowerCase() === 'honors';
    const settings = normalizeWeeklyGoalConfig(studentWeeklyGoalConfig || {}, { honors });
    const currentWeekKey = weekKeyFor(now, settings.weekStartsOn || 1);
    let active = true;
    setStudentWeeklyPathProgress(null);

    Promise.all([
      fetchStudentWeeklyPathGoalSnapshot({ weekKey: currentWeekKey }),
      fetchStudentEvidenceEvents(user.id),
    ]).then(([goal, evidenceEvents]) => {
      if (!active) return;
      if (!goal) {
        const required = Number(settings.sessions) || 0;
        setStudentWeeklyPathProgress({
          required,
          completed: 0,
          remaining: required,
          complete: required === 0,
          overdue: now > dueAtFor(now, settings) && required > 0,
        });
        return;
      }

      const completions = deriveCompletionsFromEvidence({
        evidenceEvents,
        weekKey: goal.weekKey,
        weekStartsOn: goal?.settings?.weekStartsOn || settings.weekStartsOn || 1,
        now,
      });
      setStudentWeeklyPathProgress(evaluateWeeklyGoalProgress({ goal, completions, now }));
    }).catch((error) => {
      if (!active) return;
      console.error('Could not confirm the student Weekly Path status:', error);
      setStudentWeeklyPathProgress(null);
    });

    return () => { active = false; };
  }, [
    user?.role, user?.id, user?.profile?.courseLevel, studentWeeklyGoalConfig,
    studentDashboardMode, Math.floor(now / 3_600_000),
  ]);

  useEffect(() => {
    if (user?.role !== 'student' || !user.id) {
      setStudentPathInterventionState(null);
      return undefined;
    }
    return subscribeStudentPathIntervention({
      studentId: user.id,
      onChange: setStudentPathInterventionState,
      onError: (error) => console.error('Personal Path recommendation failed to load:', error),
    });
  }, [user?.role, user?.id]);

  const studentOverrides = useMemo(() => {
    if (user?.role !== 'student') return [];
    const classOverrides = overridesForClassContext(skillOverrides, {
      classId: user.classId,
      classPeriod: user.classPeriod,
    });
    const personal = interventionAsOverride(studentPathIntervention);
    return personal ? [...classOverrides, personal] : classOverrides;
  }, [skillOverrides, studentPathIntervention, user]);

  const studentPathAssignments = useMemo(() => (
    user?.role === 'student'
      ? assignments.filter((assignment) => assignmentIsForStudent(assignment, { classId: user.classId || null, classPeriod: user.classPeriod }))
      : []
  ), [assignments, user]);

  const studentRecord = useMemo(() => ({
    id: user?.id,
    gradesByAssignment: tracker,
    supportUsageByAssignment,
  }), [user, tracker, supportUsageByAssignment]);

  // Resolved at sign-in from the student's class, so every surface below reads
  // the same course the Path and the recommendation engine read.
  const studentCourseId = user?.profile?.course || 'algebra1';

  // Evaluated once and shared, so Recommended for You and My Math Path cannot
  // disagree about what this student should do next.
  const studentPathOptions = useMemo(() => buildStudentPathOptions({
    student: studentRecord,
    assignments: studentPathAssignments,
    courseId: studentCourseId,
    pacing: studentStoredPacing,
    teacherOverrides: studentOverrides,
  }), [studentRecord, studentPathAssignments, studentCourseId, studentStoredPacing, studentOverrides]);

  // Downstream presentation may want to say whether timing is automatic or
  // teacher-set. The engine has already resolved that distinction for us.
  const studentPacing = studentPathOptions?.pacing || studentStoredPacing;

  const handleChooseSkill = (card) => {
    if (!card?.skillId) return;
    // Route history is best-effort and deliberately not awaited: a student
    // must never wait on a log write to start working.
    logRouteEvent({
      studentId: user.id,
      event: buildRouteEvent({
        studentId: user.id,
        event: ROUTE_EVENTS.CHOSEN,
        selectedSkillId: card.skillId,
        decisionType: card.slot,
        reasons: [card.status].filter(Boolean),
        context: { title: card.title, remediationTarget: card.remediationTarget || null },
      }),
    });
    // Open practice on the chosen skill rather than announcing it. A student
    // who picks a skill and is then left on the dashboard to find it again has
    // not really been given a choice.
    const code = teksCodeFromSkillId(card.skillId);
    if (!code) {
      toastInfo('Not available yet', 'Practice for this skill is not set up yet.');
      return;
    }
    setPathLaunchTeks(code);
    setStudentDashboardMode('mathPath');
  };

  const handleSavePacing = async (next) => {
    setPacingByClass(next);
    setPacingBusy(true);
    try {
      await saveClassPacing(next);
    } catch (error) {
      toastError('Pacing not saved', 'The change is showing locally but did not reach the server.');
      console.error(error);
    } finally {
      setPacingBusy(false);
    }
  };

  const handleSaveWeeklyGoal = async (classId, config) => {
    if (!classId) return;
    // Optimistic locally, then persisted. A teacher adjusting a control must
    // see it move immediately; a failed write says so rather than silently
    // reverting under them.
    const next = { ...weeklyGoalsByClass, [classId]: config };
    setWeeklyGoalsByClass(next);
    setWeeklyGoalBusy(true);
    try {
      await saveWeeklyGoalSettings(next);
    } catch (error) {
      toastError('Weekly goal not saved', 'The change is showing locally but did not reach the server.');
      console.error(error);
    } finally {
      setWeeklyGoalBusy(false);
    }
  };

  const handleSaveOverrides = async (next) => {
    setSkillOverrides(next);
    setPacingBusy(true);
    try {
      await saveSkillOverrides(next);
    } catch (error) {
      toastError('Override not saved', 'The change is showing locally but did not reach the server.');
      console.error(error);
    } finally {
      setPacingBusy(false);
    }
  };

  const handlePersonalPathRecommendation = async ({
    studentId,
    studentName = null,
    teksCode = null,
    clear = false,
    classId = null,
    classPeriod = null,
    assignmentId = null,
    assignmentTitle = null,
  } = {}) => {
    const id = String(studentId || '').trim();
    if (!id) return null;
    // Named from the roster by id. The caller's name is only a historical hint:
    // a Live tile whose student has no name on file passes none, and the id is
    // never promoted to a name — the toast labels it as an id instead.
    const studentLabel = rosterStudentLabel({ studentId: id, index: teacherStudentIdentityIndex, historicalName: studentName });
    const storedStudentName = rosterStudentNameForStorage({ studentId: id, index: teacherStudentIdentityIndex, historicalName: studentName });
    setPathInterventionBusyStudentId(id);
    try {
      const result = await setStudentPathIntervention({
        studentId: id,
        teksCode,
        durationHours: 48,
        clear,
      });

      if (clear) {
        toastSuccess(
          'Personal Path recommendation cleared',
          `${studentLabel} is back to the normal adaptive Path priorities.`,
        );
        return result;
      }

      // The intervention and the support history are different records on
      // purpose. The student sees only "teacher recommended this skill"; the
      // private teacher history preserves when/where the action happened.
      if (user?.email) {
        recordStudentSupportEvent({
          db,
          teacherEmail: user.email,
          event: {
            kind: SUPPORT_EVENT_KIND.TEACHER_INTERVENTION,
            stage: SUPPORT_EVENT_STAGE.ACTION_TAKEN,
            studentId: id,
            studentName: storedStudentName,
            classId,
            classPeriod,
            assignmentId,
            assignmentTitle,
            source: 'liveMonitor',
            summary: `Teacher recommended ${teksCode} as a temporary personal My Math Path priority for 48 hours.`,
            evidence: {
              teksCode,
              durationHours: 48,
              interventionType: 'personalPathRecommendation',
            },
          },
        }).catch((error) => {
          console.error('Path recommendation applied but support history did not save:', error);
        });
      }

      toastSuccess(
        'Path recommendation updated',
        `${teksCode} is now a personal priority for ${studentLabel} for 48 hours. Normal prerequisite and content safeguards still apply.`,
      );
      return result;
    } catch (error) {
      console.error(error);
      toastError(
        clear ? 'Could not clear Path recommendation' : 'Could not update Path recommendation',
        error.message,
      );
      return null;
    } finally {
      setPathInterventionBusyStudentId(null);
    }
  };

  // A student's own individualized (extra-time) deadlines are derived from
  // their pinned support profile and injected IN MEMORY by
  // projectStudentAssignments (withStudentSupportDates, after the student's
  // view), so every lifecycle reader honours them; nothing is persisted, and
  // nothing about one student's supports reaches the shared document.
  //
  // The whole collection, for a TEACHER's screens (a student's device reads
  // its class only — studentAssignmentScope.js). Held as stored and projected
  // with the students' controls for the classes on screen.
  const fetchAssignments = async () => {
    const querySnapshot = await getDocs(collection(db, 'assignments'));
    const fetchedAssignments = [];
    querySnapshot.forEach((assignmentDoc) => {
      fetchedAssignments.push({ id: assignmentDoc.id, ...assignmentDoc.data() });
    });
    fetchedAssignments.sort((a, b) => String(a.dueAt || a.dueDate || '').localeCompare(String(b.dueAt || b.dueDate || '')));
    teacherSharedAssignmentsRef.current = fetchedAssignments;
    publishTeacherAssignments();
    return fetchedAssignments;
  };

  /**
   * Publish one already-saved MathMaster assignment to every Google Classroom
   * course mapped to one of its assigned class periods.
   *
   * MathMaster assignment creation is authoritative. Classroom is a downstream
   * publication target, so a Classroom failure never rolls back the assignment.
   */
  const autoPublishAssignmentPackageToClassroom = async (assignment) => {
    if (!shouldAutoPublishClassroomPackage(assignment)) {
      return { status: 'skipped', reason: 'not-auto-publishable', published: 0, failed: 0 };
    }

    const mappingResult = await listClassroomCourseMappings();
    const mappings = Array.isArray(mappingResult?.mappings) ? mappingResult.mappings : [];
    const courseIds = mappedCourseIdsForAssignment(assignment, mappings);
    if (!courseIds.length) {
      return {
        status: 'needs-mapping',
        reason: 'No Google Classroom course is mapped to the assignment’s MathMaster class period.',
        published: 0,
        failed: 0,
      };
    }

    const classroom = assignment.classroomPackage || {};
    const notesPdf = assignment.lessonResources?.notesPdf || null;
    const resourceLinks = Array.isArray(classroom.additionalLinks)
      ? classroom.additionalLinks
        .map((link) => ({ title: String(link?.title || '').trim(), url: String(link?.url || '').trim() }))
        .filter((link) => link.title && /^https?:\/\//i.test(link.url))
      : [];

    const hasAuthoredNotes = notesPdf?.enabled === true
      && Array.isArray(notesPdf?.sections)
      && notesPdf.sections.length > 0;
    if (notesPdf?.enabled && !hasAuthoredNotes) {
      console.warn('Lesson notes are enabled but contain no authored sections; skipping the notes PDF so an empty handout can never reach Google Classroom.');
    }
    if (hasAuthoredNotes) {
      let notesUrl = notesPdf?.asset?.url || null;
      if (!notesUrl) {
        const generated = await generateLessonNotesPdfBlob({ assignment, notesPdf });
        const stored = await storeLessonNotesPdf({
          assignmentId: assignment.id,
          fileName: notesPdf.fileName,
          title: notesPdf.title,
          pageCount: generated.pageCount,
          base64: await blobToBase64(generated.blob),
        });
        notesUrl = stored?.url || null;
      }
      if (notesUrl) {
        resourceLinks.unshift({
          title: notesPdf.title || `${assignment.title} — Student Notes`,
          url: notesUrl,
        });
      }
    }

    const dedupedLinks = [
      ...new Map(resourceLinks.map((item) => [item.url, item])).values(),
    ];
    const postingMode = classroomPostingMode(assignment);

    if (
      classroom?.resourcesPost?.enabled !== false
      && postingMode === 'separateMaterial'
      && dedupedLinks.length
    ) {
      const materialResult = await publishClassroomMaterial({
        courseIds,
        materialKey: `assignment:${assignment.id}:resources`,
        title: classroom?.resourcesPost?.title || `${assignment.title} — Notes & Resources`,
        description: classroom?.resourcesPost?.description || `Reference materials for ${assignment.title}.`,
        topicName: classroom?.topic?.name || '',
        materials: dedupedLinks,
      });
      const failedMaterials = (materialResult?.results || []).filter((item) => item.status === 'failed');
      if (failedMaterials.length) {
        console.warn('Some Classroom resource posts failed:', failedMaterials);
      }
    }

    const response = await publishAssignmentToClassrooms({
      courseIds,
      assignmentId: assignment.id,
      classroomTitle: classroom?.assignmentPost?.title || assignment.title,
      maxPoints: Number(classroom?.assignmentPost?.maxPoints) || 100,
      gradePassbackEnabled: classroom?.gradePassback?.enabled !== false,
      topicName: classroom?.topic?.name || '',
      instructions: classroom?.assignmentPost?.instructions
        || `Complete “${assignment.title}” in MathMaster.`,
      materials: (
        classroom?.resourcesPost?.enabled !== false
        && postingMode === 'attachToAssignment'
      ) ? dedupedLinks : [],
    });

    const summary = response?.summary || {};
    const published = Number(summary.published || 0) + Number(summary.alreadyPublished || 0);
    const failed = Number(summary.failed || 0);
    return {
      status: failed ? (published ? 'partial' : 'failed') : 'published',
      published,
      failed,
      courseIds,
      results: response?.results || [],
    };
  };

  /**
   * The students this signed-in user may see.
   *
   * A teacher's roster is the students in the classes they are teacher of
   * record for — not the whole school. The scope is applied here, once, so
   * every teacher surface downstream (gradebook, standards, analytics, exams,
   * Path inspection) inherits it rather than each re-deriving it and
   * disagreeing. The root administrator sees everyone.
   */
  const handleRepairClassroomAssignmentPost = async (assignment) => {
    if (!assignment?.id) return;
    try {
      const response = await repairClassroomAssignmentPublications({
        assignmentId: assignment.id,
      });
      const summary = response?.summary || {};
      const checked = Number(summary.checked || 0);
      const reposted = Number(summary.reposted || 0);
      const healthy = Number(summary.healthy || 0);
      const failed = Number(summary.failed || 0);
      const queuedGrades = Number(summary.queuedGrades || 0);
      const ignoredPriorDestinations = Number(summary.ignoredPriorDestinations || 0);
      const repostedCourses = (response?.results || [])
        .filter((item) => item.status === 'reposted')
        .map((item) => item.courseName || item.courseId)
        .filter(Boolean);
      const healthyCourses = (response?.results || [])
        .filter((item) => item.status === 'healthy')
        .map((item) => item.courseName || item.courseId)
        .filter(Boolean);

      if (!checked) {
        toastWarning(
          'No current Classroom destination found',
          'MathMaster could not find a Google Classroom course mapped to the class currently assigned this work. Open Google Classroom Manager and verify the class-to-course mapping.',
        );
        return;
      }
      if (reposted > 0) {
        toastSuccess(
          'Google Classroom assignment reposted',
          assignment.title + ': recreated ' + reposted + ' missing Classroom post' + (reposted === 1 ? '' : 's')
            + (repostedCourses.length ? ' in ' + repostedCourses.join(', ') : '')
            + ' and queued ' + queuedGrades + ' linked student grade record' + (queuedGrades === 1 ? '' : 's')
            + ' for passback review. Existing MathMaster work was preserved.'
            + (ignoredPriorDestinations > 0
              ? ' MathMaster ignored ' + ignoredPriorDestinations + ' older publication record' + (ignoredPriorDestinations === 1 ? '' : 's') + ' from other course mappings.'
              : ''),
        );
      } else if (healthy > 0 && failed === 0) {
        toastInfo(
          'Current Classroom post is healthy',
          assignment.title + ': Google Classroom confirmed the current mapped assignment post'
            + (healthy === 1 ? '' : 's')
            + (healthyCourses.length ? ' in ' + healthyCourses.join(', ') : '')
            + ' ' + (healthy === 1 ? 'is' : 'are') + ' still available. Nothing was duplicated. If you still cannot see the post, choose Force New Classroom Post from this assignment menu and select the exact Google Classroom.'
            + (ignoredPriorDestinations > 0
              ? ' MathMaster ignored ' + ignoredPriorDestinations + ' older publication record' + (ignoredPriorDestinations === 1 ? '' : 's') + ' from other course mappings.'
              : ''),
        );
      }
      if (failed > 0) {
        const details = (response?.results || [])
          .filter((item) => ['failed', 'changed'].includes(item.status))
          .map((item) => (item.courseName || item.courseId) + ': ' + (item.error || 'repair failed'))
          .join(' | ');
        toastError(
          'Classroom repost needs attention',
          details || (failed + ' Classroom destination' + (failed === 1 ? '' : 's') + ' could not be repaired.'),
        );
      }
    } catch (error) {
      console.error(error);
      toastError('Could not check/repost Classroom assignment', error.message);
    }
  };

  const repairGradesByAssignmentWithCurrentGrader = ({
    gradesByAssignment = {},
    assignmentList = [],
    correctedAt = new Date().toISOString(),
  } = {}) => {
    let changed = false;
    const next = { ...(gradesByAssignment || {}) };

    (Array.isArray(assignmentList) ? assignmentList : []).forEach((assignment) => {
      if (!assignment?.id || gradesByAssignment?.[assignment.id] === undefined) return;
      const questions = getStoredAssignmentQuestions(assignment);
      if (!questions.length) return;
      const repairedTracker = repairAssignmentTrackerForCurrentGrader({
        assignmentTracker: gradesByAssignment[assignment.id],
        questions,
        correctedAt,
      });
      if (repairedTracker !== gradesByAssignment[assignment.id]) {
        next[assignment.id] = repairedTracker;
        changed = true;
      }
    });

    return {
      changed,
      gradesByAssignment: changed ? next : gradesByAssignment,
    };
  };

  // Grader corrections are monotonic. Keep the teacher-side safety net, but
  // run it only after the full academic corpus was intentionally loaded for
  // Grades; ordinary teacher navigation never pays this CPU/memory cost.
  const persistCurrentGraderCreditRepairs = async (students = [], assignmentList = []) => {
    const correctedAt = new Date().toISOString();
    const repairs = (Array.isArray(students) ? students : []).map((student) => {
      const result = repairGradesByAssignmentWithCurrentGrader({
        gradesByAssignment: student?.gradesByAssignment || {},
        assignmentList,
        correctedAt,
      });
      return result.changed
        ? { student, gradesByAssignment: result.gradesByAssignment }
        : null;
    }).filter(Boolean);

    if (!repairs.length) return 0;

    for (let start = 0; start < repairs.length; start += 400) {
      const batch = writeBatch(db);
      repairs.slice(start, start + 400).forEach(({ student, gradesByAssignment }) => {
        batch.update(doc(db, 'grades', student.id), { gradesByAssignment });
      });
      await batch.commit();
    }

    const repairedById = new Map(repairs.map(({ student, gradesByAssignment }) => [
      student.id,
      gradesByAssignment,
    ]));
    setAllStudents((current) => current.map((student) => (
      repairedById.has(student.id)
        ? { ...student, gradesByAssignment: repairedById.get(student.id) }
        : student
    )));
    return repairs.length;
  };

  const collectStudentGradeSnapshot = (querySnapshot) => querySnapshot.docs
    .filter((studentDoc) => studentDoc.id !== 'test_connection')
    .map((studentDoc) => ({ id: studentDoc.id, ...studentDoc.data(), profile: normalizeStudentProfile(studentDoc.data()?.profile || studentDoc.data()) }))
    .sort(compareStudentsByName);

  const studentGradeSourceForViewer = (viewer) => (
    viewer.isRootAdmin || !viewer.email
      ? collection(db, 'grades')
      : query(collection(db, 'grades'), where('assignedTeacherEmail', '==', viewer.email))
  );


  // normalizeTeacherRosterSummary (src/platform/teacher/teacherRosterSummary.js)
  // resolves each compact row's name rather than copying an allow-list of name
  // fields — the copy here is what dropped googleName-only students to an id.
  const fetchTeacherRosterSummaries = async () => {
    const response = await teacherAdmin.listSignInAccess();
    const summaries = (Array.isArray(response?.students) ? response.students : [])
      .map(normalizeTeacherRosterSummary)
      .filter((student) => student.id)
      .sort(compareStudentsByName);
    setTeacherRosterSummaries(summaries);
    if (!TEACHER_FULL_STUDENT_DATA_TABS.has(teacherTab) || teacherPreviewRuntimeActive) {
      setAllStudents(summaries);
      setTeacherStudentDataMode('summary');
    }
    return summaries;
  };

  // SignInAccess calls this after the server saves a corrected student name
  // or district ID. Refetching the compact roster rebuilds the identity index
  // once, which is what makes Home, Live and every id-keyed history record
  // show the new name — and every summary-roster screen the new district ID.
  // (Grade Export reads live grades documents, so it follows on its own.)
  const refreshTeacherRosterAfterNameChange = () => fetchTeacherRosterSummaries()
    .catch((error) => console.error('Could not refresh the roster after a student identity change:', error));

  useEffect(() => {
    if (user?.role !== 'teacher') return undefined;

    const needsFullStudentData = teacherWorkspaceMode === 'teacher'
      && TEACHER_FULL_STUDENT_DATA_TABS.has(teacherTab)
      && !teacherPreviewRuntimeActive;

    if (!needsFullStudentData) {
      setAllStudents(teacherRosterSummaries);
      setTeacherStudentDataMode('summary');
      return undefined;
    }

    const viewer = { email: user.email || null, isRootAdmin: user.isRootAdmin === true };
    setTeacherStudentDataMode('loading-full');
    return onSnapshot(
      studentGradeSourceForViewer(viewer),
      (snapshot) => {
        const studentData = collectStudentGradeSnapshot(snapshot);
        setAllStudents(studentData);
        setTeacherStudentDataMode('full');

        if (teacherTab === 'grades' && !teacherGraderRepairRanRef.current) {
          teacherGraderRepairRanRef.current = true;
          persistCurrentGraderCreditRepairs(studentData, assignmentsRef.current)
            .catch((error) => {
              teacherGraderRepairRanRef.current = false;
              console.error('Could not apply deferred current-grader credit repairs:', error);
            });
        }
      },
      (error) => {
        console.error('Could not watch live student grades:', error);
        setAllStudents(teacherRosterSummaries);
        setTeacherStudentDataMode('summary');
      },
    );
  // NOT `assignments`: the repair above runs once and reads the ref. Listing
  // the array tore this listener down on every write to ANY assignment —
  // another teacher's edit, a DOL unlock, a question-family seat — flipped the
  // gradebook to loading and re-read every student's grades document.
  }, [
    user?.role, user?.email, user?.isRootAdmin, teacherTab, teacherWorkspaceMode,
    teacherPreviewRuntimeActive, teacherRosterSummaries,
  ]);

  /*
   * SEATS FOR UNIQUE QUESTIONS, WRITTEN WITHOUT THE TEACHER DOING ANYTHING.
   *
   * An assignment whose family-backed questions vary per student needs every
   * student in each assigned class to hold a distinct seat
   * (functions/shared/questionGenerationIdentity.mjs). Only this app knows the
   * roster, so whenever it sees such an assignment with students missing a
   * seat, it appends their seats — inside a transaction that re-plans against
   * the freshly read document, so two teacher tabs cannot hand out one seat
   * twice. Seats are append-only and keyed by opaque learner tokens; no student
   * id is ever written to the assignment. Assignments without question
   * families are never touched.
   */
  const generationSeatSignaturesRef = useRef(new Map());
  useEffect(() => {
    if (user?.role !== 'teacher' || teacherPreviewRuntimeActive || !allStudents.length || !assignments.length) return;
    assignments.forEach((assignment) => {
      const signature = generationSeatPlanSignature({ assignment, students: allStudents });
      if (!signature || generationSeatSignaturesRef.current.get(assignment.id) === signature) return;
      generationSeatSignaturesRef.current.set(assignment.id, signature);
      if (!planGenerationSeatWrites({ assignment, students: allStudents }).length) return;
      const assignmentRef = doc(db, 'assignments', assignment.id);
      runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(assignmentRef);
        if (!snapshot.exists()) return;
        const fresh = { id: snapshot.id, ...snapshot.data() };
        const writes = planGenerationSeatWrites({ assignment: fresh, students: allStudents });
        if (!writes.length) return;
        const fieldsAndValues = [new FieldPath('generationSeats', 'version'), GENERATION_SEATS_VERSION];
        writes.forEach(({ classId, token, seat }) => {
          fieldsAndValues.push(new FieldPath('generationSeats', 'byClassId', classId, token), seat);
        });
        transaction.update(assignmentRef, ...fieldsAndValues);
      }).catch((error) => {
        // Not fatal: unseated students get provisional seats above every
        // taken seat, and the next roster or assignment change retries.
        generationSeatSignaturesRef.current.delete(assignment.id);
        console.warn('Could not seat students for unique questions:', error);
      });
    });
  }, [user?.role, teacherPreviewRuntimeActive, allStudents, assignments]);

  // Classes are the authoritative record of course, rigor and teacher of
  // record. Read-only from the client: only the audited admin callables write
  // them.
  const fetchClasses = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'classes'));
      const value = snapshot.docs.map((classDoc) => ({ classId: classDoc.id, ...classDoc.data() }));
      setClasses(value);
      classesRef.current = value;
      return value;
    } catch (error) {
      console.error('Could not load classes:', error);
      return [];
    }
  };

  const fetchClassSchedule = async () => {
    try {
      const snapshot = await getDoc(doc(db, 'settings', 'classSchedule'));
      const value = normalizeSchedule(snapshot.exists() ? snapshot.data() : DEFAULT_CLASS_SCHEDULE);
      setClassSchedule(value);
      return value;
    } catch (error) {
      console.error('Could not load class schedule:', error);
      const fallback = normalizeSchedule(DEFAULT_CLASS_SCHEDULE);
      setClassSchedule(fallback);
      return fallback;
    }
  };

  const liveScheduleSessionUid = auth.session?.uid || null;
  useEffect(() => {
    if (auth.status !== 'ready' || !liveScheduleSessionUid) return undefined;

    // The bell schedule is live operational state, not login-time metadata.
    // Friday A/B overrides can be changed after students are already signed in;
    // every open client must immediately recompute Warm-Up, DOL and the final
    // five-minute pack-up window from the same schedule.
    const unsubscribe = onSnapshot(
      doc(db, 'settings', 'classSchedule'),
      (snapshot) => {
        const value = normalizeSchedule(snapshot.exists() ? snapshot.data() : DEFAULT_CLASS_SCHEDULE);
        setClassSchedule(value);
        setNow(Date.now());
      },
      (error) => {
        console.error('Could not watch class schedule:', error);
      },
    );
    return unsubscribe;
  }, [auth.status, liveScheduleSessionUid]);

  const fetchCourseProfiles = async () => {
    try {
      const snapshot = await getDoc(doc(db, 'settings', 'courseProfiles'));
      const value = normalizeCourseProfiles(snapshot.exists() ? snapshot.data()?.profiles : {}, CLASS_PERIODS);
      setCourseProfiles(value);
      return value;
    } catch (error) {
      console.error('Could not load class course settings:', error);
      const fallback = defaultCourseProfiles(CLASS_PERIODS);
      setCourseProfiles(fallback);
      return fallback;
    }
  };

  const fetchGradingPeriodSettings = async () => {
    try {
      const snapshot = await getDoc(doc(db, 'settings', GRADING_PERIOD_SETTINGS_DOC));
      const value = normalizeGradingPeriodSettings(snapshot.exists() ? snapshot.data() : {});
      setGradingPeriodSettings(value);
      return value;
    } catch (error) {
      // A failed read must not empty the Grade Center. Normalizing {} yields the
      // default current-period bucket, which is exactly what a school that has
      // never opened the marking-period screen already sees.
      console.error('Could not load marking periods:', error);
      const fallback = normalizeGradingPeriodSettings({});
      setGradingPeriodSettings(fallback);
      return fallback;
    }
  };

  const fetchAssignmentFolders = async () => {
    try {
      const snapshot = await getDoc(doc(db, 'settings', 'assignmentFolders'));
      const value = normalizeFolderPaths(snapshot.exists() ? snapshot.data()?.paths : []);
      setAssignmentFolderPaths(value);
      return value;
    } catch (error) {
      console.error('Could not load assignment folders:', error);
      setAssignmentFolderPaths([]);
      return [];
    }
  };

  const getLiveAssignment = async (assignmentId) => {
    const assignmentSnapshot = await measurePerformanceOperation(
      'firestore_request_ms',
      () => getDoc(doc(db, 'assignments', assignmentId)),
      { flow: 'assignment_revalidation' },
    );
    if (!assignmentSnapshot.exists()) return null;
    return { id: assignmentSnapshot.id, ...assignmentSnapshot.data() };
  };

  /*
   * DELIVERING ONE CAPTURED ACTION TO CANONICAL STORAGE.
   *
   * The answer is a DISPOSITION, never a bare "rejected". That word is what
   * caused the September 14 incident: it meant "the teacher closed the section
   * a minute ago", "your roster row has not been written yet" and "you already
   * submitted this" all at once, and the outbox deleted the student's work for
   * every one of them. Each outcome is now classified, and only a PROVEN
   * duplicate, supersession or ineligibility retires anything.
   *
   * Grade-bearing work goes to the server ingestion callable, which re-reads
   * the authoritative assignment and roster and re-grades the raw response.
   * There is deliberately no browser grade-writing fallback: an unavailable
   * callable leaves the envelope in IndexedDB so grade, evidence and receipt
   * remain one atomic server decision.
   */
  const buildSubmissionEnvelopeForAction = (action) => {
    const payload = action.payload || {};
    return buildSubmissionEnvelope({
      actionId: action.actionId,
      kind: action.kind,
      studentId: action.studentId,
      assignmentId: action.assignmentId,
      questionIndex: action.questionIndex,
      questionId: payload.questionId || null,
      variantIndex: payload.variantIndex ?? normalizeQuestionRecord(payload.record).variantIndex,
      activityRole: payload.activityRole,
      capturedAt: Number(action.createdAt) || Date.now(),
      previousTotalAttempts: payload.previousTotalAttempts,
      record: payload.record,
      // The student's RAW work. Where the server can mark this question type it
      // marks this, and the browser's verdict is discarded entirely.
      response: payload.response || null,
      // Which instance of a family-backed slot this work answers. Absent for
      // every other question.
      familyDelivery: payload.familyDelivery || null,
      // A step submission's raw step, from which the server derives its credit.
      stepWork: payload.stepWork || null,
      supportUsage: payload.record?.supportUsage || null,
      assignmentSupportUsage: payload.supportUsage || null,
      hasClassworkGrade: payload.hasClassworkGrade === true,
      hasDolGrade: payload.hasDolGrade === true,
      timedSectionAccess: payload.timedSectionAccess || null,
      capturedSectionAccess: payload.capturedSectionAccess || null,
      checkpointDocumentId: payload.checkpointDocumentId || null,
      timeSpentSeconds: payload.timeSpentSeconds || payload.record?.timeSpent || 0,
      // How many times this device has already tried. The server escalates a
      // retry that has never cleared into `needs-review` from this, so leaving
      // it out means a week-old submission retries forever unseen.
      deliveryAttempts: Number(action.delivery?.attempts || 0),
    });
  };

  /**
   * Direct Firestore is restricted to response checkpoints: drafts that carry
   * no grade (firestore.rules) and that the server finalizer re-grades. Graded
   * work AND elapsed-time progress go to server ingestion, because the
   * canonical question record is server-owned — the rules refuse this
   * student's client any write to it. The guard is intentional defense in
   * depth; a future dispatcher edit cannot turn this back into a grade writer.
   */
  const reconcileThroughClientTransaction = async (action) => {
    if (INGESTIBLE_KINDS.includes(action.kind)) {
      throw new Error('Grade-bearing actions require server ingestion.');
    }
    if (action.kind !== 'responseCheckpoint') {
      throw new Error('Only response checkpoints are written directly; elapsed time requires server ingestion.');
    }
    const assignmentRef = doc(db, 'assignments', action.assignmentId);
    const gradesRef = doc(db, 'grades', action.studentId);
    let classification = { disposition: SUBMISSION_DISPOSITION.ACCEPTED, reason: null };

    await runTransaction(db, async (transaction) => {
      const [assignmentSnapshot, gradesSnapshot] = await Promise.all([
        transaction.get(assignmentRef),
        transaction.get(gradesRef),
      ]);
      const assignment = assignmentSnapshot.exists()
        ? { id: assignmentSnapshot.id, ...assignmentSnapshot.data() }
        : null;
      const saved = gradesSnapshot.exists() ? gradesSnapshot.data() || {} : null;

      // A checkpoint is stored whatever the section's CURRENT state is: it is
      // a draft, and whether the work counts is the finalizer's decision,
      // made from the server acknowledgement time against the real close. A
      // response that only reaches MathMaster after the deadline therefore
      // stays recoverable history and changes no grade.
      if (!assignment || !saved) {
        classification = { disposition: SUBMISSION_DISPOSITION.RETRYABLE, reason: 'context-unreadable' };
        return;
      }
      if (!assignmentIsForStudent(assignment, { classId: user.classId || null, classPeriod: user.classPeriod })) {
        classification = { disposition: SUBMISSION_DISPOSITION.RETRYABLE, reason: 'assignment-not-assigned-to-class' };
        return;
      }
      transaction.set(doc(db, 'studentResponseCheckpoints', action.payload.documentId), {
        ...action.payload,
        studentId: action.studentId,
        assignmentId: action.assignmentId,
        questionIndex: action.questionIndex,
        classId: user.classId || null,
        serverAcknowledgedAt: serverTimestamp(),
        candidateFinalizeAt: action.payload.candidateFinalizeAt ? new Date(action.payload.candidateFinalizeAt) : null,
        status: 'active',
      });
      classification = { disposition: SUBMISSION_DISPOSITION.ACCEPTED, reason: null };
    });

    return classification;
  };

  const reconcileDurableStudentAction = async (action) => {
    // A queue row that belongs to someone else is not this session's to judge.
    // It stays exactly where it is until its owner signs in on this device.
    if (!action || action.studentId !== user?.id) {
      return { disposition: SUBMISSION_DISPOSITION.RETRYABLE, reason: 'not-this-student' };
    }

    // Graded work, and elapsed time on a question, both land on the canonical
    // question record, which only the server writes.
    const elapsedTime = PROGRESS_KINDS.includes(action.kind);
    if (INGESTIBLE_KINDS.includes(action.kind) || elapsedTime) {
      try {
        const receipt = elapsedTime
          ? await ingestOneSubmission(buildProgressEnvelopeForAction(action))
          : await ingestOneSubmission(buildSubmissionEnvelopeForAction(action));
        return { disposition: receipt.disposition, reason: receipt.reason || null, receipt };
      } catch (error) {
        const diagnostic = callableDeliveryDiagnostic(error);
        console.warn('Server ingestion unavailable; submission remains durably queued:', diagnostic.safeReason);
        return {
          disposition: SUBMISSION_DISPOSITION.RETRYABLE,
          reason: diagnostic.safeReason,
          diagnostic,
        };
      }
    }
    // Response checkpoints are non-grade drafts the server finalizer re-grades.
    return reconcileThroughClientTransaction(action);
  };
  /*
   * SAY WHAT ACTUALLY HAPPENED TO THE STUDENT'S WORK.
   *
   * `successStatus` is only reached when NOTHING is still owed a delivery.
   * A student is never told "Submitted." while a submission is still sitting in
   * this device's queue — that is the difference the incident turned on, and it
   * is why the queued state names the count and the retry state is distinct
   * from the "not eligible" one.
   */
  const drainStudentOutbox = async ({ successStatus = 'durable' } = {}) => {
    if (user?.role !== 'student' || !user.id) return;
    const result = await drainDurableActions({ studentId: user.id, reconcile: reconcileDurableStudentAction });
    setStudentOutboxDepth(result.remaining);
    setStudentPendingGradeCount(result.remainingGrade);
    setStudentNeedsReviewCount(result.tally.needsReview);
    setStudentPersistenceStatus(
      result.remaining
        ? (result.tally.needsReview ? 'needs-review' : (navigator.onLine ? 'syncing' : 'offline'))
        : result.tally.permanentlyInvalid
          ? 'rejected'
          : successStatus,
    );
    return result;
  };

  /*
   * THE DEVICE'S OWN INCIDENT REPORT — COALESCED, AND OFF THE GRADE PATH.
   *
   * One coordinator for the whole session, so a burst of submissions cannot
   * spawn a report cycle each. A reporting failure updates a banner and
   * nothing else: it never reaches the delivery path, which is the point.
   */
  const studentReportCoordinatorRef = useRef(null);
  const reportStudentOutbox = () => {
    if (user?.role !== 'student' || !user.id) return;
    const studentId = user.id;
    if (!studentReportCoordinatorRef.current || studentReportCoordinatorRef.current.studentId !== studentId) {
      studentReportCoordinatorRef.current?.coordinator?.cancel();
      studentReportCoordinatorRef.current = {
        studentId,
        coordinator: createDeviceReportCoordinator({
          report: () => reportDeviceQueueState({ studentId }),
          onSettled: ({ ok, error }) => {
            if (ok) {
              setStudentReportingError(null);
              return;
            }
            const diagnostic = callableDeliveryDiagnostic(error);
            setStudentReportingError(diagnostic.safeReason);
            console.warn('Device queue report unavailable:', diagnostic.safeReason);
          },
        }),
      };
    }
    // Hydration, reconnect, pageshow, visibility return, newly queued work and
    // the post-drain snapshot all arrive here, and all report immediately
    // unless one is already in flight — in which case exactly one follow-up is
    // queued behind it rather than a second, third and fourth cycle.
    studentReportCoordinatorRef.current.coordinator.request({ immediate: true });
  };

  /*
   * GRADE DELIVERY IS HIGHER PRIORITY THAN DIAGNOSTICS.
   *
   * The pre-drain report starts first so the teacher gets the "before"
   * snapshot, but the drain does not wait for it: a `reportStudentDeviceQueue`
   * hanging out its full 12-second timeout while `ingestStudentSubmissions` is
   * healthy must not delay a single canonical grade. See
   * `reconcileWithDeviceReports` for the whole argument.
   */
  const reconcileAndReportStudentOutbox = (options) => reconcileWithDeviceReports({
    report: reportStudentOutbox,
    drain: () => drainStudentOutbox(options),
  });

  const leaveUnavailableAssignment = () => {
    setActiveAssignmentId(null);
    setActiveClassroomSectionKey(null);
    setAssignmentResultRoute(null);
    setActiveView('dashboard');
    setPracticeTracker({});
    setPracticeScratchpads(EMPTY_SCRATCHPAD_CACHE);
    setPreviewTracker({});
  };

  useEffect(() => {
    let cancelled = false;
    const session = auth.session;
    if (auth.status !== 'ready' || !session) {
      setUser(null);
      hydratedSessionUidRef.current = null;
      clearSignedInAssignments();
      setAllStudents([]);
      setTeacherRosterSummaries([]);
      setTeacherStudentDataMode('summary');
      setTeacherActionOpenCountCache(0);
      teacherGraderRepairRanRef.current = false;
      setProfileDrawerStudentDetail(null);
      teacherGraderRepairRanRef.current = false;
      setSessionHydrationError(null);
      setSessionHydrating(auth.status === 'loading');
      return () => { cancelled = true; };
    }

    // Another account replaced this one without a signed-out moment between
    // (a second tab signing someone else in): drop the first account's
    // screens before anything of the second is read.
    if (hydratedSessionUidRef.current && hydratedSessionUidRef.current !== session.uid) {
      setUser(null);
      clearSignedInAssignments();
    }
    hydratedSessionUidRef.current = session.uid;

    const hydrateSession = async () => {
      setSessionHydrating(true);
      setSessionHydrationError(null);
      try {
        if (session.role === 'teacher') {
          await fetchAssignments();
          if (cancelled) return;
          // Identity and classes first: the roster fetch is scoped by them, so
          // asking for students before they are known would read the school.
          viewerRef.current = { email: session.email || null, isRootAdmin: session.isRootAdmin === true };
          classesRef.current = await fetchClasses();
          if (cancelled) return;
          await Promise.all([
            fetchTeacherRosterSummaries(),
            fetchClassSchedule(),
            fetchCourseProfiles(),
            fetchAssignmentFolders(),
            fetchGradingPeriodSettings(),
            fetchPathSettings(),
          ]);
          if (cancelled) return;
          setClassroomSyncStatusByAssignment({});
          classroomSyncNoticeRef.current = {};
          setUser({
            id: session.uid,
            uid: session.uid,
            role: 'teacher',
            email: session.email,
            displayName: session.displayName,
            accessLevel: session.accessLevel,
            isRootAdmin: session.isRootAdmin === true,
          });
          setResumeAction(null);
          return;
        }

        if (session.role !== 'student' || !session.studentId) {
          throw new Error('Your signed-in account does not have a MathMaster student ID.');
        }
        const studentId = session.studentId;
        const studentSnapshot = await getDoc(doc(db, 'grades', studentId));
        if (!studentSnapshot.exists()) throw new Error('Your student record is not available. Ask your teacher to add you to the roster.');
        const studentData = studentSnapshot.data() || {};
        // The student's own class, plus anything they have work on from an
        // earlier one — never the whole collection (studentAssignmentScope.js).
        const savedResumeTarget = readResumeAction(studentId);
        // Each lesson arrives as THIS student's view (studentAssignmentScope.js)
        // and reaches state only projected with their own controls — never
        // the shared document as stored.
        const fetchedAssignments = await fetchStudentAssignments({
          db,
          studentId,
          classId: studentData.classId || null,
          gradesByAssignment: studentData.gradesByAssignment || {},
          extraIds: savedResumeTarget?.assignmentId ? [savedResumeTarget.assignmentId] : [],
        });
        if (cancelled) return;
        const studentProfile = normalizeStudentProfile(studentData.profile || studentData);
        studentClassAssignmentsRef.current = fetchedAssignments
          .filter((assignment) => Array.isArray(assignment.assignedClassIds) && assignment.assignedClassIds.includes(studentData.classId));
        studentPriorWorkAssignmentsRef.current = fetchedAssignments
          .filter((assignment) => !studentClassAssignmentsRef.current.includes(assignment));
        studentViewerRef.current = { studentId, profile: studentProfile };
        const projectedAssignments = projectStudentAssignments({
          assignments: fetchedAssignments,
          studentId,
          profile: studentProfile,
          controls: studentControlsRef.current,
        });
        setAssignments(projectedAssignments);
        const loadedCourseProfiles = await fetchCourseProfiles();
        await fetchClassSchedule();
        await fetchGradingPeriodSettings();
        // The student's class is what decides their course and rigor. The
        // period-keyed profile is only a fallback for a student nobody has
        // placed in a class yet — it cannot answer the question once two
        // classes share a period.
        const loadedClasses = await fetchClasses();
        if (cancelled) return;
        const courseContext = resolveStudentCourseContext({
          student: studentData,
          classesById: Object.fromEntries(loadedClasses.map((entry) => [entry.classId, entry])),
          courseProfiles: loadedCourseProfiles,
        });
        // studentId lets the resolver refuse a session name that is really this
        // student's id (a passcode session has no other name to offer).
        const studentDisplayName = resolveStudentDisplayName({
          rosterStudent: { ...studentData, id: studentId },
          sessionDisplayName: session.displayName,
          studentId,
        });
        setUser({
          id: studentId,
          uid: session.uid,
          role: 'student',
          email: session.email,
          // Student-facing screens should greet the person, not the SIS ID.
          // The roster is authoritative because student passcode sessions do
          // not necessarily carry a useful Firebase Auth displayName.
          displayName: studentDisplayName,
          classId: studentData.classId || null,
          className: courseContext.className,
          classPeriod: courseContext.classPeriod,
          teacherOfRecord: courseContext.teacherOfRecord,
          // Verbatim from the roster row: support evidence the student's client
          // records must name exactly this teacher (firestore.rules).
          assignedTeacherEmail: studentData.assignedTeacherEmail || null,
          profile: {
            ...studentProfile,
            course: courseContext.courseId,
            courseLevel: courseContext.courseLevel,
          },
        });
        // THE STUDENT SEES THE CANONICAL RECORD, AND NEVER REWRITES IT.
        //
        // Sign-in used to re-grade stored records with the current grader and
        // write the result back from this browser. A student's device authors
        // no grade state now (firestore.rules), so that write would be refused
        // — and refusing it here would fail the whole sign-in. The one-time
        // current-grader correction still lands, with the teacher of record's
        // authority, when their gradebook loads (persistCurrentGraderCreditRepairs).
        setTracker(studentData.gradesByAssignment || {});
        setTeacherGradeOverridesByAssignment(studentData.teacherGradeOverridesByAssignment || {});
        setSectionRecoveryByAssignment(studentData.sectionRecoveryByAssignment || {});
        setWarmupChallengeByAssignment(studentData.warmupChallengeByAssignment || {});
        setAssignmentActivity(studentData.assignmentActivity || {});
        setDolGradesByAssignment(studentData.dolGradesByAssignment || {});
        setClassworkGradesByAssignment(studentData.classworkGradesByAssignment || {});
        setSupportUsageByAssignment(studentData.supportUsageByAssignment || {});
        setTestCycleGrades(studentData.testCycleGrades || {});
        const initialClassroomSync = studentData.classroomSyncStatusByAssignment || {};
        setClassroomSyncStatusByAssignment(initialClassroomSync);
        classroomSyncNoticeRef.current = Object.fromEntries(
          Object.entries(initialClassroomSync).map(([assignmentId, status]) => [
            assignmentId,
            status?.notificationId || null,
          ]),
        );
        // WHERE THE STUDENT LEFT OFF, EVEN ON A DIFFERENT CHROMEBOOK.
        //
        // The browser copy is instant, so it is preferred when it exists. A
        // fresh device has none, and then the server's own record of the last
        // assignment worked on stands in. Neither is authority over grading:
        // the canonical tracker above already decided what is answered.
        const savedResume = readResumeAction(studentId);
        const localResumeUsable = Boolean(savedResume)
          && fetchedAssignments.some((assignment) => assignment.id === savedResume.assignmentId);
        if (localResumeUsable) {
          setResumeAction(savedResume);
        } else {
          readLatestWorkspaceResume(studentId)
            .then((serverResume) => {
              if (cancelled || !serverResume) return;
              // The lesson projected with the controls held NOW (the own-controls
              // listener has usually answered by the time this read returns):
              // its lifecycle includes the student's own extension.
              const [assignment] = projectStudentAssignments({
                assignments: fetchedAssignments.filter((entry) => entry.id === serverResume.assignmentId),
                studentId,
                profile: studentProfile,
                controls: studentControlsRef.current,
              });
              if (!assignment) return;
              setResumeAction({
                assignmentId: assignment.id,
                assignmentTitle: assignment.title,
                questionIndex: Number(serverResume.questionIndex) || 0,
                questionNumber: (Number(serverResume.questionIndex) || 0) + 1,
                dueDate: assignment.dueAt || assignment.dueDate || '',
                lateDueDate: assignment.lateDueAt || assignment.lateDueDate || '',
                lifecycleStatus: getAssignmentLifecycle(assignment, Date.now(), { studentId }).status,
                restoredFrom: 'server',
              });
            })
            .catch((error) => console.warn('Could not restore the saved resume position:', error));
          setResumeAction(null);
        }
      } catch (error) {
        if (!cancelled) {
          setUser(null);
          setSessionHydrationError(error.message || 'MathMaster could not load your account.');
        }
      } finally {
        if (!cancelled) setSessionHydrating(false);
      }
    };

    hydrateSession();
    return () => { cancelled = true; };
    // Session UID changes only when the authenticated identity changes. The
    // helper functions above intentionally read the newest Firestore state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.status, auth.session?.uid]);

  const handleLogout = async () => {
    await stopStudentSpotlight?.();
    setUser(null);
    // At once, not when the auth listener catches up: the lessons carried
    // this account's own controls (a shared Chromebook's next student must
    // never be handed them, even for a frame).
    hydratedSessionUidRef.current = null;
    clearSignedInAssignments();
    setActiveView('dashboard');
    setTeacherTab('home');
    setTeacherWorkspaceMode('teacher');
    setActiveAssignmentId(null);
    setActiveClassroomSectionKey(null);
    setAssignmentResultRoute(null);
    setPendingClassroomLaunch(null);
    setPracticeTracker({});
    setPracticeScratchpads(EMPTY_SCRATCHPAD_CACHE);
    setPreviewTracker({});
    setPreviewScratchpads(EMPTY_SCRATCHPAD_CACHE);
    setTeacherScratchpadDialog(null);
    setResumeAction(null);
    setAssignmentActivity({});
    setDolGradesByAssignment({});
    setClassworkGradesByAssignment({});
    setSupportUsageByAssignment({});
    setClassroomSyncStatusByAssignment({});
    classroomSyncNoticeRef.current = {};
    setGradebookFilter({ classId: '', classPeriod: '', assignmentId: null, student: null });
    setStudentDashboardMode('assignments');
    await auth.signOut();
  };

  const getModuleRecord = (assignmentTracker, index) =>
    normalizeQuestionRecord(assignmentTracker?.[index]);

  const getModuleStatus = (assignmentTracker, index) =>
    getModuleRecord(assignmentTracker, index).status;

  const getModuleTime = (assignmentTracker, index) =>
    getModuleRecord(assignmentTracker, index).timeSpent;

  const formatTime = (seconds) => {
    if (seconds === 0) return '0s';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${remainingSeconds}s`;
  };

  const calculateGrade = (assignmentTracker, assignmentData, { practicePassRedeemed = false, supportProfile = null } = {}) => {
    if (!assignmentTracker || !getStoredAssignmentQuestions(assignmentData).length) return 0;
    return splitGrade({ tracker: assignmentTracker, assignment: assignmentData, practicePassRedeemed, supportProfile }).score ?? 0;
  };

  const calculatePracticeProgress = (assignmentTracker, assignmentData, { hasPracticePass = false } = {}) => {
    if (!assignmentTracker || !getStoredAssignmentQuestions(assignmentData).length) {
      return { attempted: 0, correct: 0, total: 0 };
    }

    const included = studentAssignmentIndicesWithPracticePass({ assignment: assignmentData, hasPracticePass });
    let attempted = 0;
    let correct = 0;
    included.forEach((index) => {
      const status = getModuleStatus(assignmentTracker, index);
      if (status !== 'unattempted') attempted += 1;
      if (status === 'correct') correct += 1;
    });

    return { attempted, correct, total: included.length };
  };

  /*
   * The local tracker is deliberately NOT a parameter any more. This function
   * used to take it so it could compute Classwork completion from the caller's
   * in-flight overlay; that computation is the server's now, from canonical
   * records, so passing a tracker here could only mislead the next reader.
   */
  const flushAssignmentActivity = async (assignmentId = activeAssignmentId) => {
    if (user?.role !== 'student' || !assignmentId) return null;
    const assignment = assignments.find((item) => item.id === assignmentId);
    if (!assignment) return null;
    if (getAssignmentLifecycle(assignment, Date.now(), { studentId: user.id }).isPracticeOnly) {
      // Post-deadline practice is intentionally invisible to the gradebook,
      // engagement analytics, mastery engine, and teacher reports.
      pendingAssignmentSecondsRef.current = 0;
      return null;
    }
    const pendingSeconds = pendingAssignmentSecondsRef.current;
    if (pendingSeconds <= 0) return assignmentActivity[assignmentId] || null;
    pendingAssignmentSecondsRef.current = 0;
    const nextRecord = recordAssignmentActivity({
      activity: assignmentActivity[assignmentId],
      assignment,
      seconds: pendingSeconds,
      nowValue: Date.now(),
      studentId: user.id,
    });
    const updatedActivity = { ...assignmentActivity, [assignmentId]: nextRecord };
    setAssignmentActivity(updatedActivity);

    /*
     * ENGAGEMENT TIME IS THE ONLY THING THIS WRITES.
     *
     * It used to also compute Classwork completion from `tracker` and write
     * `classworkGradesByAssignment` itself. `tracker` is the LOCAL OVERLAY: it
     * contains attempts still sitting in this Chromebook's durable queue that
     * canonical grades have never seen. So a browser could mark a student
     * Classwork-complete — which opens the next assignment through
     * `prerequisiteAccess` — on the strength of work that had not been
     * recorded anywhere, and might yet be proven invalid.
     *
     * Under Persistence V3 the browser may save engagement/activity state, and
     * may not author a grade or completion projection. The projection is
     * derived from canonical attempts by the server: at ingestion for every
     * case a RESPONSE completes the rule, and by the reconciliation callable
     * below for the one case ingestion cannot see — the rule's engagement
     * term being satisfied by TIME after the last response was ingested.
     */
    try {
      await updateDoc(
        doc(db, 'grades', user.id),
        new FieldPath('assignmentActivity', assignmentId),
        nextRecord,
      );
    } catch (error) {
      pendingAssignmentSecondsRef.current += pendingSeconds;
      console.error('Could not save assignment activity:', error);
      return nextRecord;
    }

    // The activity total is canonical now, so the server can be asked to look
    // again. It re-reads the canonical tracker and the canonical activity and
    // writes the projection only if THAT evidence supports it; this call sends
    // no completion and no score. It is diagnostics-grade background work — a
    // failure leaves the projection to the next ingestion or the next flush.
    try {
      const reconciled = await reconcileAssignmentActivityProjection({ assignmentId });
      if (reconciled?.classworkGrade) {
        setClassworkGradesByAssignment((current) => (
          current?.[assignmentId] === reconciled.classworkGrade
            ? current
            : { ...current, [assignmentId]: reconciled.classworkGrade }
        ));
      }
    } catch (error) {
      console.warn('Classwork completion will be reconciled on the next canonical write:', error);
    }
    return nextRecord;
  };

  // Keep the literal Firestore record separate from the runtime compatibility
  // view. Student/teacher rendering and lifecycle decisions consume the prepared
  // view; persistence and audit code can still refer to the saved object when needed.
  const rawActiveAssignmentData = assignments.find(
    (assignment) => assignment.id === activeAssignmentId,
  );
  const activeRuntimeRepair = useMemo(
    () => (rawActiveAssignmentData
      ? prepareAssignmentForRuntime(rawActiveAssignmentData, { source: 'activeAssignmentPlayer' })
      : null),
    [rawActiveAssignmentData],
  );
  const activeAssignmentData = activeRuntimeRepair?.assignment || null;
  const activeQuestions = getStoredAssignmentQuestions(activeAssignmentData);

  useEffect(() => {
    if (user?.role !== 'student' || activeView !== 'assignment' || !rawActiveAssignmentData?.contentUpgrade) return;
    const version = Number(rawActiveAssignmentData.contentUpgrade.toVersion || 0);
    if (!activeAssignmentId || version < 2) return;
    const key = `mathmaster:content-upgrade-notice:${activeAssignmentId}:${version}`;
    try {
      if (window.localStorage.getItem(key) === 'shown') return;
      window.localStorage.setItem(key, 'shown');
    } catch {
      // The notice still appears when storage is unavailable; it simply cannot
      // remember that it was shown across another tab/session.
    }
    toastInfo(
      `Assignment corrected · Content V${version}`,
      'This assignment was corrected by your teacher. Your previous work was preserved.',
    );
  }, [user?.role, activeView, activeAssignmentId, rawActiveAssignmentData?.contentUpgrade, toastInfo]);
  const activeLifecycle = getAssignmentLifecycle(activeAssignmentData, now, {
    studentId: user?.role === 'student' ? user.id : undefined,
  });
  const isTeacherPreview = user?.role === 'teacher' && activeView === 'teacherPreview';
  const isStudentAssignment = user?.role === 'student' && activeView === 'assignment';
  const isPracticeMode = isStudentAssignment && activeLifecycle.isPracticeOnly;
  const activeSupportPresentation = getStudentSupportPresentation(user?.profile);
  // Server-timed active minutes for the support evidence report. Post-deadline
  // practice is not credit work and is never recorded (as with activity time).
  useEngagementLedger({
    db,
    enabled: isStudentAssignment && Boolean(activeAssignmentData),
    studentId: isStudentAssignment ? user.id : null,
    assignmentId: activeAssignmentId,
    creditEligible: activeLifecycle.creditEligible && !isPracticeMode,
    lastInteractionRef: lastActivityRef,
  });

  // SUPPORT EVIDENCE FROM THE STUDENT'S OWN CLIENT — platform facts only.
  //
  // Only supports this student is entitled to (the rules refuse anything
  // else), only on credit work (post-deadline practice is invisible to
  // reports, as with activity time), never in a teacher preview. "Available" and
  // "provided" records use one fixed id per assignment and profile revision;
  // "used" is de-duplicated to once per question per minute. A failed write is
  // dropped: evidence telemetry must never interrupt a student's work.
  const supportEvidenceSeenRef = useRef(new Set());
  const recordStudentSupportEvidence = ({
    supportId, eventType, questionIndex = null, activityRole = null, details = null, variant = null, profileRevisionId = null,
  }) => {
    if (user?.role !== 'student' || !user.id || !activeAssignmentId || isPracticeMode) return;
    if (!studentMayRecordSupport(user.profile, supportId)) return;
    const revisionId = profileRevisionId || user.profile?.supportRevisionId || 'legacy-unversioned';
    const deterministic = eventType !== 'used';
    const key = deterministic
      ? `${activeAssignmentId}|${revisionId}|${supportId}|${eventType}|${variant || ''}`
      : usedRecordKey({ assignmentId: activeAssignmentId, questionIndex, supportId });
    if (supportEvidenceSeenRef.current.has(key)) return;
    supportEvidenceSeenRef.current.add(key);
    saveStudentSupportEvidence({
      db,
      deterministic,
      variant,
      event: {
        studentId: user.id,
        classId: user.classId || null,
        assignmentId: activeAssignmentId,
        activityRole,
        questionIndex,
        supportId,
        eventType,
        profileRevisionId: revisionId,
        assignedTeacherEmail: user.assignedTeacherEmail,
        details,
      },
    }).catch(() => { supportEvidenceSeenRef.current.delete(key); });
  };
  const launchedSupportKeyRef = useRef('');
  useEffect(() => {
    if (!isStudentAssignment || !activeAssignmentData || isPracticeMode) return;
    const launchKey = `${activeAssignmentId}|${user?.profile?.supportRevisionId || 'legacy'}`;
    if (launchedSupportKeyRef.current === launchKey) return;
    launchedSupportKeyRef.current = launchKey;
    // What this student actually received: their own required items, and the
    // reduced-item projection (or the fact that it could not be resolved).
    let workload;
    let accommodation;
    try {
      workload = studentRequiredFor(activeAssignmentData, { hasPracticePass: hasPracticePassFor(activeAssignmentId) });
      // The reduction's own record is over the assignment's content — what the
      // teacher's report recomputes to verify it. A Practice Pass is a separate
      // projection with its own record.
      accommodation = studentRequiredFor(activeAssignmentData);
    } catch {
      workload = { failed: true, indices: activeQuestions.map((_, index) => index) };
      accommodation = { failed: true };
    }
    const required = new Set(workload.indices);
    const presentedQuestions = activeQuestions.filter((_, index) => required.has(index));
    const roles = presentedQuestions.map((question) => resolveQuestionActivityRole({ question, assignment: activeAssignmentData }));
    launchSupportRecords({ profile: user.profile, assignment: activeAssignmentData, roles, questions: presentedQuestions, workload: accommodation })
      .records.forEach((record) => recordStudentSupportEvidence(record));
  }, [isStudentAssignment, activeAssignmentId, activeAssignmentData, isPracticeMode, user?.profile?.supportRevisionId]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeDOLState = getDOLState({ assignment: activeAssignmentData, schedule: classSchedule, classId: user?.classId || null, classPeriod: user?.classPeriod, nowValue: now });
  const activeQuestionRole = resolveQuestionActivityRole({
    question: activeQuestions[currentQuestionIndex],
    assignment: activeAssignmentData,
    isDOL: activeDOLState.enabled && currentQuestionIndex === activeDOLState.questionIndex,
  });
  const activeActivityPolicy = getEffectiveActivityPolicy(isPracticeMode ? 'practice' : activeQuestionRole);

  // As the teacher moves through the exemplar with real student navigation,
  // keep the Live Teaching session's position in sync so the room's pace
  // reference is the teacher's ACTUAL position, never a stale one.
  useEffect(() => {
    if (!isTeacherPreview || !liveTeachingSession?.active) return;
    if (String(liveTeachingSession.assignmentId) !== String(activeAssignmentId)) return;
    setLiveTeachingSession((session) => advanceLiveTeachingSession(session, {
      assignment: activeAssignmentData,
      storageQuestionIndex: currentQuestionIndex,
      activityRole: activeQuestionRole,
    }));
  }, [isTeacherPreview, liveTeachingSession?.active, liveTeachingSession?.assignmentId, activeAssignmentId, activeAssignmentData, currentQuestionIndex, activeQuestionRole]);

  // "View as Student" scratchpads are wanted only while the preview is on
  // screen, or while a Live Teaching session can resume into it
  // (resumeLiveTeaching keeps them on purpose). Once neither holds — the
  // teacher left a plain preview, or ended Live Teaching away from it — nothing
  // is meant to bring them back (a new preview starts empty), so the pages are
  // released instead of held until sign-out.
  const previewScratchpadsReachable = isTeacherPreview || Boolean(liveTeachingSession?.active);
  useEffect(() => {
    if (!previewScratchpadsReachable) setPreviewScratchpads(EMPTY_SCRATCHPAD_CACHE);
  }, [previewScratchpadsReachable]);

  // All teacher tabs observe the deterministic session document. Writes occur
  // only for commands/navigation; timer seconds are derived from startedAt.
  useEffect(() => {
    if (user?.role !== 'teacher' || !liveTeachingSession?.sessionId) return undefined;
    const sessionRef = doc(db, 'walkthroughSessions', liveTeachingSession.sessionId);
    const expected = { classId: liveTeachingSession.classId, assignmentId: liveTeachingSession.assignmentId };
    return onSnapshot(sessionRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const remote = snapshot.data();
      // The document id encodes teacher + class + assignment; a record whose
      // body names a different class or assignment is not this session.
      if (String(remote?.classId || '') !== String(expected.classId || '')
        || String(remote?.assignmentId || '') !== String(expected.assignmentId || '')) return;
      if (Number(remote.updatedAt) > Number(walkthroughWriteRef.current || 0)) {
        walkthroughWriteRef.current = Number(remote.updatedAt) || 0;
        setLiveTeachingSession(remote);
      }
    });
  }, [user?.role, liveTeachingSession?.sessionId]);

  // An active session stays only while its assignment is still live work for
  // its class (assignmentAvailability.js). Archived, moved to another marking
  // period, past its final cutoff, unassigned from the class, or deleted: the
  // session is ended and its record retired, so it cannot come back. Checked
  // once a minute and whenever assignments or marking periods change.
  const liveTeachingValidityMinute = Math.floor(Number(now) / 60_000);
  useEffect(() => {
    if (user?.role !== 'teacher' || !liveTeachingSession?.active) return;
    const check = validatePersistedWalkthroughSession({
      session: liveTeachingSession,
      classId: liveTeachingSession.classId,
      assignments,
      nowValue: liveTeachingValidityMinute * 60_000,
      gradingPeriodSettings,
    });
    if (!check.valid) endLiveTeaching();
  }, [user?.role, liveTeachingSession?.active, liveTeachingSession?.classId, liveTeachingSession?.assignmentId, assignments, gradingPeriodSettings, liveTeachingValidityMinute]);

  useEffect(() => {
    if (user?.role !== 'teacher' || !liveTeachingSession?.sessionId) return;
    const updatedAt = Number(liveTeachingSession.updatedAt) || Date.now();
    if (updatedAt <= Number(walkthroughWriteRef.current || 0)) return;
    walkthroughWriteRef.current = updatedAt;
    setDoc(doc(db, 'walkthroughSessions', liveTeachingSession.sessionId), {
      ...liveTeachingSession, updatedAt,
    }).catch((error) => console.error('Could not synchronize Walkthrough:', error));
  }, [user?.role, liveTeachingSession]);

  useEffect(() => {
    if (user?.role !== 'student' || !user.id || !activeAssignmentId) {
      setCheckpointOutcomes({});
      return undefined;
    }
    let cancelled = false;
    getDocs(query(
      collection(db, 'studentResponseCheckpoints'),
      where('studentId', '==', user.id),
      where('assignmentId', '==', activeAssignmentId),
    )).then((snapshot) => {
      if (cancelled) return;
      setCheckpointOutcomes(Object.fromEntries(snapshot.docs
        .map((entry) => entry.data())
        .filter((entry) => DISPLAYED_CHECKPOINT_OUTCOMES.includes(String(entry?.status || '')))
        .map((entry) => [Number(entry.questionIndex), String(entry.status)])));
    }).catch((error) => {
      // A missing receipt is not worth interrupting the student for.
      console.warn('Could not read response checkpoint receipts:', error);
    });
    return () => { cancelled = true; };
  }, [user?.role, user?.id, activeAssignmentId]);

  /*
   * SERVER-BACKED WORKING DRAFTS.
   *
   * Local-first, always. A keystroke updates the workspace and the local
   * draft and returns; this effect notices the draft changed and coalesces a
   * single background write per debounce window. No interaction waits on it.
   *
   * RECOVERY ORDER on open, which is also the order that makes an old draft
   * unable to beat newer work:
   *   1. canonical grades — already hydrated at sign-in;
   *   2. the durable outbox — already reconciled/overlaid above;
   *   3. this server draft, applied only where it is newer than BOTH this
   *      device's copy and the question's last canonical attempt (and an
   *      entry an older build saved, whose time may be an opening's, only
   *      where this device has no dated copy — see selectRestorableDraftEntries);
   *   4. Practice Mode state, kept in its own structure so it can never reach
   *      a grade, merged per question here and on the server;
   *   5. the resume position.
   *
   * The question does NOT wait for the server's copy (PQ-044). It opens from
   * this device at once, and its workspaces write back what they read as
   * what it is — not the student's edit — so that copy keeps the time of the
   * last real edit (0 on a Chromebook that never saw this work) and cannot
   * outrank the server's on its way in, nor be sent over it. When the read
   * lands with anything newer, the question is remounted to show it. A device
   * that opened offline, or slept while the student worked on another one,
   * reads again when it is back online or back in front of the student.
   */
  useEffect(() => { trackerRef.current = tracker; }, [tracker]);

  // A yes/no, not the list: `assignments` is one live listener over the whole
  // collection, so as a dependency every edit to ANY assignment — another
  // teacher's, a seat allocation, a DOL unlock — flushed and tore down this
  // student's sync, rebuilt it and re-read the draft from the server, on every
  // open Chromebook at once.
  const activeAssignmentUsesWorkspaceDrafts = useMemo(() => {
    const assignment = assignments.find((item) => item.id === activeAssignmentId);
    // Secure Test Cycle material has its own server-owned state machine and
    // never uses ordinary draft persistence.
    return Boolean(assignment) && !isTestCycleAssignment(assignment);
  }, [assignments, activeAssignmentId]);

  useEffect(() => {
    if (user?.role !== 'student' || !user.id || !activeAssignmentId || isTeacherPreview) return undefined;
    if (!activeAssignmentUsesWorkspaceDrafts) return undefined;

    let cancelled = false;
    const sync = createWorkspaceDraftSync({
      studentId: user.id,
      assignmentId: activeAssignmentId,
      classId: user.classId || null,
      // A save that gets through while the server's copy has never been read
      // means the connection came back without the page hearing of it (no
      // `online` event). Read it then, so this device shows work done on
      // another Chromebook and the sync learns what the server holds.
      flush: async ({ document }) => {
        const result = await writeWorkspaceDraft(document);
        if (!serverCopyRead) readServerCopy();
        return result;
      },
    });
    workspaceDraftSyncRef.current = sync;
    const unsubscribe = subscribeToQuestionDrafts((event) => sync.record(event));

    let reading = false;
    let serverCopyRead = false;
    const readServerCopy = () => {
      if (cancelled || reading) return;
      reading = true;
      readWorkspaceDraft({ studentId: user.id, assignmentId: activeAssignmentId })
        .then((stored) => {
          if (cancelled) return;
          serverCopyRead = true;
          const entries = readWorkspaceDraftEntries(stored);
          const assignmentGrades = trackerRef.current?.[activeAssignmentId] || {};
          const restorable = selectRestorableDraftEntries({
            entries,
            localSavedAt: (key) => questionDraftSavedAt(key),
            // A deadline auto-submit is dated by when its work was captured,
            // so the backup of that very work is not refused as older than
            // its own submission (canonicalResponseTime.js).
            canonicalSavedAt: (entry) => canonicalResponseSavedAt(normalizeQuestionRecord(assignmentGrades[entry?.questionIndex])),
          });
          if (restoreQuestionDrafts(restorable)) {
            setDraftRestoreFocus({
              questionIndex: currentQuestionIndexRef.current,
              position: answerFocusPosition(assignmentQuestionStageRef.current),
            });
            setWorkspaceDraftGeneration((value) => value + 1);
          }
          // Only now is it known what the server holds — and so whether this
          // device has an edit it never received (see workspaceDraftSync).
          sync.noteServerCopy(entries);
          if (stored?.practice && typeof stored.practice === 'object') {
            // Per question, the record with more practice progress wins. The
            // session's tracker is usually a fresh seed with a row for every
            // question; spreading it over the saved copy erased all saved practice
            // on every reload (see practiceTrackerMerge.js).
            setPracticeTracker((current) => ({
              ...current,
              [activeAssignmentId]: mergePracticeTrackers(stored.practice || {}, current[activeAssignmentId] || {}),
            }));
          }
        })
        .catch((error) => {
          // The device's own drafts are still there. Recovery is best-effort,
          // and is tried again when the device is back (below).
          console.warn('Could not restore saved workspace drafts:', error);
        })
        .finally(() => { reading = false; });
    };
    readServerCopy();

    // Leaving the page is the moment a pending draft most needs to be written.
    const flush = () => { void sync.flushNow(); };
    // Coming back is the moment the student may have worked somewhere else:
    // online again, or in front of the student again after long enough away
    // to have used another Chromebook.
    let hiddenAt = 0;
    const flushWhenHidden = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        flush();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt >= WORKSPACE_DRAFT_REREAD_AFTER_HIDDEN_MS) readServerCopy();
      hiddenAt = 0;
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('online', readServerCopy);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('online', readServerCopy);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      void sync.flushNow();
      sync.stop();
      if (workspaceDraftSyncRef.current === sync) workspaceDraftSyncRef.current = null;
    };
  }, [user?.role, user?.id, user?.classId, activeAssignmentId, isTeacherPreview, activeAssignmentUsesWorkspaceDrafts]);

  /*
   * POST-DEADLINE PRACTICE MODE IS NOT A GRADE, AND MUST STILL SURVIVE.
   *
   * It used to live only in React state, so logging out or turning the
   * Chromebook off started the student from zero. It is persisted in the
   * workspace-draft document — never in `grades` — so it cannot reach the
   * canonical grade, the original attempt history, deadline evidence or
   * Google Classroom, and a student can carry on tomorrow where they stopped.
   */
  useEffect(() => {
    const sync = workspaceDraftSyncRef.current;
    if (!sync || !activeAssignmentId) return;
    sync.setPractice(practiceTracker[activeAssignmentId] || null);
  }, [practiceTracker, activeAssignmentId]);

  const assignmentOpenSpanRef = useRef(null);
  // Up Next at the end of an assignment, cached per assignment/tracker/minute
  // so a finished section does not rebuild the whole dashboard every render.
  const studentUpNextCacheRef = useRef({ key: null, tracker: null, dashboard: null });

  useEffect(() => {
    if (user?.role !== 'student' || !user.id) {
      setStudentOutboxDepth(0);
      return undefined;
    }
    let cancelled = false;

    const recoverAndReconcileQueuedStudentWork = async () => {
      // Test Cycle Review answers the server refused as "secure" before it
      // ingested Review go back in the queue, so they are shown and delivered
      // below with everything else. Once per page; never blocks the rest.
      await resendRetiredReviewWork({ studentId: user.id })
        .catch((error) => console.error('Could not restore refused Review work:', error));
      if (cancelled) return;
      const actions = await listDurableActions({ studentId: user.id });
      if (cancelled) return;
      setStudentOutboxDepth(actions.length);
      if (actions.length) {
        setStudentPersistenceStatus('queued');
        // A reload must restore the same visible score state immediately even
        // before Wi-Fi returns. The server remains canonical; this is only the
        // durable local envelope being overlaid until reconciliation succeeds.
        setTracker((current) => overlayDurableActionsOnGrades(current, actions));
        setSupportUsageByAssignment((current) => {
          let next = current;
          actions.forEach((action) => {
            if (!action.payload?.supportUsage) return;
            next = { ...next, [action.assignmentId]: action.payload.supportUsage };
          });
          return next;
        });
        /*
         * Queued work is overlaid onto the TRACKER above so a reload shows the
         * student their own answers immediately. It is deliberately NOT
         * overlaid onto `classworkGradesByAssignment`: that projection opens
         * the next assignment, and a queued attempt has not been recorded
         * anywhere yet. It arrives from the canonical document once the server
         * has ingested the work that supports it.
         */
        setDolGradesByAssignment((current) => {
          let next = current;
          actions.forEach((action) => {
            if (!action.payload?.hasDolGrade) return;
            next = { ...next, [action.assignmentId]: action.payload.dolGrade };
          });
          return next;
        });
      }
      // TELL THE SERVER BEFORE DELIVERY, THEN AGAIN AFTERWARD.
      //
      // An IndexedDB queue is the one part of the incident no server query can
      // see. Reporting first means a hung/failed drain cannot leave the teacher
      // with "not reported"; reporting after records what actually cleared.
      // A report failure is diagnosed locally and never blocks student work.
      await reconcileAndReportStudentOutbox();
    };

    const reconcileQueuedStudentWork = () => recoverAndReconcileQueuedStudentWork()
      .catch((error) => console.error('Could not reconcile queued student work:', error));
    const reconcileWhenVisible = () => {
      if (!document.hidden) reconcileQueuedStudentWork();
    };

    reconcileQueuedStudentWork();
    window.addEventListener('online', reconcileQueuedStudentWork);
    window.addEventListener('pageshow', reconcileQueuedStudentWork);
    document.addEventListener('visibilitychange', reconcileWhenVisible);
    // Firestore can fail transiently while navigator.onLine remains true.
    // Periodic retry prevents a student's final answer from sitting only on
    // this Chromebook until they submit again or reload.
    const retryTimer = window.setInterval(reconcileQueuedStudentWork, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(retryTimer);
      window.removeEventListener('online', reconcileQueuedStudentWork);
      window.removeEventListener('pageshow', reconcileQueuedStudentWork);
      document.removeEventListener('visibilitychange', reconcileWhenVisible);
      // Drop any deferred report. An in-flight one is left to settle: it is
      // already describing a real queue, and cancelling it would lose the
      // teacher's last view of this device for no benefit.
      studentReportCoordinatorRef.current?.coordinator?.cancel();
    };
  }, [user?.id, user?.role]);

  useEffect(() => {
    const span = startPerformanceSpan('route_transition_ms', { flow: activeView || 'unknown' });
    const frame = window.requestAnimationFrame(() => span.finish({ status: 'usable' }));
    return () => window.cancelAnimationFrame(frame);
  }, [activeView]);

  useEffect(() => {
    if (!isStudentAssignment || !activeQuestions.length) return;
    prefetchQuestionResources(activeQuestions, currentQuestionIndex, { secure: isTestCycleAssignment(activeAssignmentData) });
  }, [isStudentAssignment, activeQuestions, currentQuestionIndex, activeAssignmentData]);

  useEffect(() => {
    if (!isStudentAssignment) return undefined;
    const span = startPerformanceSpan('question_ready_ms', { flow: 'assignment' });
    const frame = window.requestAnimationFrame(() => span.finish({ status: 'usable' }));
    assignmentOpenSpanRef.current?.finish({ status: 'ready' });
    assignmentOpenSpanRef.current = null;
    return () => window.cancelAnimationFrame(frame);
  }, [isStudentAssignment, activeAssignmentId, currentQuestionIndex]);

  const activeWorkingTracker = isTeacherPreview
    ? previewTracker
    : isPracticeMode
      ? practiceTracker[activeAssignmentId] || {}
      : tracker[activeAssignmentId] || {};

  useEffect(() => {
    if (!activeQuestions.length) return;
    // Teacher Preview has no student redemption to read and must keep seeing
    // every current-content question exactly as authored.
    const included = studentRequiredFor(activeAssignmentData, {
      hasPracticePass: !isTeacherPreview
        && !isPracticeMode
        && hasPracticePassFor(activeAssignmentId),
      forStudent: !isTeacherPreview && !isPracticeMode,
    }).indices;
    if (!included.length) return;
    if (!included.includes(currentQuestionIndex)) {
      const resolved = resolveCurrentContentStorageIndex(activeAssignmentData, currentQuestionIndex);
      // `resolved` is resolved against the FULL current-content projection and
      // can itself be a waived Practice index (a real current-content question,
      // just not one this student may be required into) -- never land there.
      setCurrentQuestionIndex(resolved !== null && included.includes(resolved) ? resolved : included[0]);
    }
  }, [
    activeAssignmentData,
    activeAssignmentId,
    currentQuestionIndex,
    isTeacherPreview,
    isPracticeMode,
    studentClassPoints.redemptionsByAssignment,
    user?.profile,
  ]);

  // A question change should feel like changing pages, not like loading the
  // next page at the old scroll position. This matters most on phones where
  // a long graph/tool workspace can otherwise leave the next prompt offscreen.
  useEffect(() => {
    if (!['assignment', 'teacherPreview'].includes(activeView)) return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector('.mathmaster-question-stage')?.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
      document.querySelector('.math-tool-workspace')?.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
      if (window.innerWidth > 768) {
        document.querySelector('.mathmaster-assignment-compact-nav')?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeView, activeAssignmentId, currentQuestionIndex]);

  useEffect(() => {
    if (!isStudentAssignment || !activeAssignmentId || isPracticeMode) return undefined;
    const interval = window.setInterval(() => {
      flushAssignmentActivity(activeAssignmentId).catch((error) => console.error(error));
    }, 30000);
    return () => window.clearInterval(interval);
  }, [isStudentAssignment, activeAssignmentId, isPracticeMode, assignmentActivity, tracker, classworkGradesByAssignment]);


  useEffect(() => {
    if (user?.role !== 'student' || !activeAssignmentId || activeView !== 'assignment') return undefined;
    if (liveFocusLossRef.current.assignmentId !== activeAssignmentId) {
      liveFocusLossRef.current = { assignmentId: activeAssignmentId, count: 0, hiddenAt: null };
    }

    // Brief focus changes happen for notifications, accessibility tools,
    // Classroom resources and accidental taps. They are too ambiguous to be
    // useful. Count only a sustained hidden episode (8+ seconds), and still use
    // it only as corroboration — never as proof of off-task behavior.
    const MIN_FOCUS_LOSS_MS = 8000;
    const onVisibility = () => {
      if (liveFocusLossRef.current.assignmentId !== activeAssignmentId) return;
      if (document.hidden) {
        if (!liveFocusLossRef.current.hiddenAt) liveFocusLossRef.current.hiddenAt = Date.now();
        return;
      }
      const hiddenAt = Number(liveFocusLossRef.current.hiddenAt) || 0;
      if (hiddenAt && Date.now() - hiddenAt >= MIN_FOCUS_LOSS_MS) {
        liveFocusLossRef.current.count += 1;
      }
      liveFocusLossRef.current.hiddenAt = null;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [user?.role, activeAssignmentId, activeView]);

  // Live class monitoring. Presence stays ephemeral: one tiny document per
  // student is overwritten while they work and deleted when they leave. The
  // deletion trigger archives only one compact session summary; it does not
  // keep heartbeat history.
  //
  // IMPORTANT LIFECYCLE BOUNDARY:
  // Question/attempt changes refresh the payload but DO NOT delete presence.
  // Deletion belongs only to entering/leaving an assignment. That keeps the
  // server archive trigger to one meaningful session boundary rather than one
  // invocation per React state change.
  useEffect(() => {
    if (
      user?.role !== 'student'
      || !user.id
      || !isStudentAssignment
      || !activeAssignmentId
      || !activeAssignmentData
    ) {
      livePresencePayloadRef.current = null;
      return;
    }

    if (liveStartedAtRef.current.assignmentId !== activeAssignmentId) {
      liveStartedAtRef.current = { assignmentId: activeAssignmentId, at: Date.now() };
    }
    if (liveSessionActiveSecondsRef.current.assignmentId !== activeAssignmentId) {
      liveSessionActiveSecondsRef.current = { assignmentId: activeAssignmentId, seconds: 0 };
    }

    // This effect already runs only for a real signed-in student (guarded
    // above), so a granted Practice Pass for this assignment always applies.
    // Positions and counts stay in the class's question order (the teacher's
    // walkthrough compares section positions with its own); an item this
    // student's reduced-item-count accommodation omits is marked 'n' in
    // `questionStates`, so it reads as neither done nor still to do.
    const liveRequired = studentRequiredFor(activeAssignmentData, {
      hasPracticePass: !isPracticeMode && hasPracticePassFor(activeAssignmentId),
      forStudent: !isPracticeMode,
      assignmentTracker: activeWorkingTracker,
    });
    const included = liveRequired.baseIndices;
    const notRequired = new Set(liveRequired.omitted);
    if (liveSessionAttemptBaselineRef.current.assignmentId !== activeAssignmentId) {
      liveSessionAttemptBaselineRef.current = {
        assignmentId: activeAssignmentId,
        totalAttemptsByIndex: Object.fromEntries(included.map((index) => [
          index,
          Number(normalizeQuestionRecord(activeWorkingTracker?.[index]).totalAttempts) || 0,
        ])),
      };
    }
    const question = activeQuestions[currentQuestionIndex];
    const record = normalizeQuestionRecord(activeWorkingTracker?.[currentQuestionIndex]);
    const liveTracker = {
      ...(activeWorkingTracker || {}),
      [currentQuestionIndex]: {
        ...record,
        timeSpent: Math.max(Number(record.timeSpent) || 0, Number(activeTimeRef.current) || 0),
      },
    };
    const sessionFinalizedIndices = included.filter((index) => {
      const current = normalizeQuestionRecord(liveTracker?.[index]);
      const baselineAttempts = Number(
        liveSessionAttemptBaselineRef.current.totalAttemptsByIndex?.[index],
      ) || 0;
      return current.totalAttempts > baselineAttempts
        && ['correct', 'expired'].includes(current.status);
    });
    const rapid = summarizeRapidCorrectness({
      questions: activeQuestions,
      tracker: liveTracker,
      includedIndices: sessionFinalizedIndices,
    });
    const sectionIndices = included.filter((index) => (
      resolveQuestionActivityRole({ question: activeQuestions[index], assignment: activeAssignmentData }) === activeQuestionRole
    ));
    const focusLossCount = liveFocusLossRef.current.assignmentId === activeAssignmentId
      ? liveFocusLossRef.current.count + (
        document.hidden
        && Number(liveFocusLossRef.current.hiddenAt) > 0
        && Date.now() - Number(liveFocusLossRef.current.hiddenAt) >= 8000
          ? 1
          : 0
      )
      : 0;

    const currentTeksCode = getQuestionPrimaryTeksCodes(question || {})[0] || null;
    const payload = {
      studentId: user.id,
      // The roster name or null — never the id, and never a placeholder
      // ('Student', 'Name unavailable') a teacher's tile would show as a name.
      // Teacher screens name the tile from their own roster by studentId.
      name: formatStudentName(user, { lastFirst: false, fallbackToNeutral: false }) || null,
      classId: user.classId || null,
      classPeriod: user.classPeriod || '',
      currentTeksCode,
      ...buildLiveStatus({
        assignmentId: activeAssignmentId,
        assignmentTitle: activeAssignmentData.title,
        activityRole: activeQuestionRole,
        questionIndex: Math.max(0, included.indexOf(currentQuestionIndex)),
        questionCount: included.length,
        sectionQuestionIndex: Math.max(0, sectionIndices.indexOf(currentQuestionIndex)),
        sectionQuestionCount: sectionIndices.length,
        questionLabel: String(question?.prompt || '').slice(0, 80),
        representation: getQuestionRepresentation(question),
        questionStates: encodeQuestionStates(activeWorkingTracker, included, { notRequired }),
        currentAttempts: record.attemptCount,
        focusLossCount,
        answeredCount: rapid.answered,
        correctCount: rapid.correct,
        accuracy: rapid.accuracy,
        rapidCorrectCount: rapid.rapidCorrect,
        rapidDeepCorrectCount: rapid.rapidDeepCorrect,
        timedIndependentCorrectCount: rapid.timedIndependentCorrect,
        sessionActiveSeconds: Math.max(0, Number(liveSessionActiveSecondsRef.current.seconds) || 0),
        lastInteractionAt: lastAcademicInteractionRef.current,
        startedAt: liveStartedAtRef.current.at,
        pageVisible: document.visibilityState === 'visible',
      }),
    };

    // The heartbeat lifecycle below owns Firestore writes. Keeping question
    // changes in this ref avoids deleting/recreating presence while still
    // letting the next heartbeat publish the newest compact state.
    livePresencePayloadRef.current = payload;
  }, [
    user, isStudentAssignment, activeAssignmentId, activeAssignmentData,
    currentQuestionIndex, activeWorkingTracker, activeQuestionRole,
    studentClassPoints.redemptionsByAssignment,
  ]);

  useEffect(() => {
    if (user?.role !== 'student' || !user.id) return undefined;
    const presenceRef = doc(db, 'presence', user.id);
    const sessionAssignmentId = activeAssignmentId;
    let cancelled = false;
    let interval = null;

    const clearLiveStatus = () => {
      // Do not erase a payload that already belongs to the NEXT assignment
      // while React is cleaning up the previous assignment effect.
      if (livePresencePayloadRef.current?.assignmentId === sessionAssignmentId) {
        livePresencePayloadRef.current = null;
      }
      deleteDoc(presenceRef).catch(() => { /* sign-out races are not worth reporting */ });
    };

    if (!isStudentAssignment || !sessionAssignmentId || !activeAssignmentData?.id) {
      livePresencePayloadRef.current = null;
      deleteDoc(presenceRef).catch(() => { /* nothing live to preserve */ });
      return undefined;
    }

    const publishLatest = () => {
      if (cancelled) return;
      const payload = livePresencePayloadRef.current;
      if (!payload || payload.assignmentId !== sessionAssignmentId) return;
      // updatedAt is the connection heartbeat, not an interaction timestamp.
      // Re-stamp it for every write while preserving lastInteractionAt.
      setDoc(presenceRef, {
        ...payload,
        pageVisible: document.visibilityState === 'visible',
        updatedAt: Date.now(),
      }).catch(() => {
        /* a missed heartbeat self-heals on the next one */
      });
    };

    // A reload can leave the prior session document behind. Delete it BEFORE
    // publishing this new session. The server's delete trigger archives the old
    // compact snapshot once; after that, ordinary heartbeats are only writes and
    // do not invoke an archive function.
    const startPresence = async () => {
      try {
        await deleteDoc(presenceRef);
      } catch {
        // Missing/offline cleanup is harmless; the first successful heartbeat
        // still re-establishes presence.
      }
      if (cancelled) return;
      publishLatest();
      interval = window.setInterval(publishLatest, HEARTBEAT_INTERVAL_MS);
    };

    startPresence();
    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
      clearLiveStatus();
    };
  }, [
    user?.role,
    user?.id,
    isStudentAssignment,
    activeAssignmentId,
    activeAssignmentData?.id,
  ]);

  // Spotlight consent is its own short-lived channel. Merely opening an
  // assignment or publishing presence never creates a frame.
  useEffect(() => {
    if (user?.role !== 'student' || !user.id) {
      setStudentSpotlightRequest(null);
      return undefined;
    }
    return onSnapshot(
      activeStudentSpotlightQuery(db, { studentId: user.id }),
      (snapshot) => {
        const current = snapshot.docs
          .map((entry) => ({ id: entry.id, ...entry.data() }))
          .filter((entry) => [SPOTLIGHT_STATUS.REQUESTED, SPOTLIGHT_STATUS.ACCEPTED].includes(entry.status))
          .filter((entry) => (entry.expiresAt?.toMillis?.() || 0) > Date.now())
          .sort((left, right) => (right.requestedAt?.toMillis?.() || 0) - (left.requestedAt?.toMillis?.() || 0))[0] || null;
        setStudentSpotlightRequest(current);
      },
      () => setStudentSpotlightMessage('Presentation connection unavailable. Your MathMaster work is still safe and usable.'),
    );
  }, [user?.role, user?.id]);

  useEffect(() => {
    spotlightPublisherRef.current?.stop();
    spotlightPublisherRef.current = null;
    if (!studentSpotlightRequest || !isActiveSpotlightRequest(studentSpotlightRequest)) return undefined;
    const frameRef = doc(db, SPOTLIGHT_FRAME_COLLECTION, studentSpotlightRequest.id);
    spotlightPublisherRef.current = createSpotlightPublisher({
      publish: (frame) => setDoc(frameRef, {
        ...frame,
        requestId: studentSpotlightRequest.id,
        studentId: user.id,
        expiresAt: studentSpotlightRequest.expiresAt,
        updatedAt: serverTimestamp(),
      }).catch(() => setStudentSpotlightMessage('Presentation connection interrupted. Keep working normally while MathMaster reconnects.')),
    });
    return () => {
      spotlightPublisherRef.current?.stop();
      spotlightPublisherRef.current = null;
    };
  }, [studentSpotlightRequest?.id, studentSpotlightRequest?.status, user?.id]);

  const respondToSpotlight = useCallback(async (accepted) => {
    if (!studentSpotlightRequest || studentSpotlightRequest.status !== SPOTLIGHT_STATUS.REQUESTED) return;
    try {
      await updateDoc(doc(db, SPOTLIGHT_REQUEST_COLLECTION, studentSpotlightRequest.id), {
        status: accepted ? SPOTLIGHT_STATUS.ACCEPTED : SPOTLIGHT_STATUS.DECLINED,
        respondedAt: serverTimestamp(),
      });
      setStudentSpotlightMessage(accepted ? '' : 'You chose Not Now. No work was shared.');
    } catch {
      setStudentSpotlightMessage('Could not send your choice. Nothing will be shared unless Present Now succeeds.');
    }
  }, [studentSpotlightRequest]);

  const stopStudentSpotlight = useCallback(async () => {
    const request = studentSpotlightRequest;
    spotlightPublisherRef.current?.stop();
    spotlightPublisherRef.current = null;
    if (!request) return;
    await deleteDoc(doc(db, SPOTLIGHT_FRAME_COLLECTION, request.id)).catch(() => {});
    if (request.status === SPOTLIGHT_STATUS.ACCEPTED) {
      await updateDoc(doc(db, SPOTLIGHT_REQUEST_COLLECTION, request.id), {
        status: SPOTLIGHT_STATUS.STOPPED,
        stoppedAt: serverTimestamp(),
        stoppedBy: 'student',
      }).catch(() => setStudentSpotlightMessage('The projector connection could not be confirmed stopped. It will expire automatically.'));
    }
  }, [studentSpotlightRequest]);

  const publishSpotlightWork = useCallback(({ question, answerState }) => {
    if (!spotlightPublisherRef.current || !studentSpotlightRequest || !isActiveSpotlightRequest(studentSpotlightRequest)) return;
    spotlightPublisherRef.current.schedule(buildSpotlightFrame({
      assignmentId: activeAssignmentId,
      assignmentTitle: activeAssignmentData?.title,
      questionIndex: currentQuestionIndex,
      question,
      answerState,
      studentLabel: publicStudentLabel({ ...studentRecord, ...user }),
    }));
  }, [studentSpotlightRequest, activeAssignmentId, activeAssignmentData?.title, currentQuestionIndex, studentRecord, user]);

  useEffect(() => {
    if (!studentSpotlightRequest) return undefined;
    return scheduleSpotlightExpiry({
      request: studentSpotlightRequest,
      onExpire: () => {
        setStudentSpotlightRequest(null);
        if (studentSpotlightRequest.status === SPOTLIGHT_STATUS.ACCEPTED) stopStudentSpotlight();
      },
      setTimer: window.setTimeout,
      clearTimer: window.clearTimeout,
    });
  }, [studentSpotlightRequest?.id, studentSpotlightRequest?.status, studentSpotlightRequest?.expiresAt, stopStudentSpotlight]);

  useEffect(() => {
    if (studentSpotlightRequest?.status !== SPOTLIGHT_STATUS.ACCEPTED) return;
    if (activeView === 'assignment' && activeAssignmentId === studentSpotlightRequest.assignmentId) return;
    stopStudentSpotlight();
  }, [studentSpotlightRequest?.status, studentSpotlightRequest?.assignmentId, activeView, activeAssignmentId, stopStudentSpotlight]);

  // Persistent support/intervention history is teacher-authorized and
  // append-only. It is loaded independently of the live presence stream.
  useEffect(() => {
    if (user?.role !== 'teacher' || !user.email) {
      setStudentSupportEvents([]);
      return undefined;
    }
    if (teacherWorkspaceMode !== 'teacher' || !TEACHER_SUPPORT_STREAM_TABS.has(teacherTab)) {
      setStudentSupportEvents([]);
      return undefined;
    }
    if (teacherPreviewRuntimeActive) return undefined;
    return subscribeStudentSupportEvents({
      db,
      teacherEmail: user.email,
      onChange: setStudentSupportEvents,
      onError: (error) => console.error('Student support history failed:', error),
    });
  }, [user?.role, user?.email, teacherWorkspaceMode, teacherPreviewRuntimeActive, teacherTab]);

  // One teacher-scoped stream spans the whole roster. Firestore rules verify
  // teacher-of-record again for every appended contact; students have no access.
  useEffect(() => {
    if (user?.role !== 'teacher' || !user.email) { setParentContacts([]); return undefined; }
    if (teacherWorkspaceMode !== 'teacher' || !TEACHER_PARENT_CONTACT_STREAM_TABS.has(teacherTab)) {
      setParentContacts([]);
      return undefined;
    }
    if (teacherPreviewRuntimeActive) return undefined;
    return subscribeParentContacts({ db, teacherEmail: user.email, onChange: setParentContacts, onError: (error) => console.error('Parent contact history failed:', error) });
  }, [user?.role, user?.email, teacherWorkspaceMode, teacherPreviewRuntimeActive, teacherTab]);

  const actionGradeScope = useMemo(() => {
    if (teacherWorkspaceMode !== 'teacher' || teacherTab !== 'actionCenter') {
      return { units: [], authorizedClassIds: [] };
    }
    return projectGradeTransferUnits({
      classes, assignments, students: allStudents, teacherEmail: user?.email || '', isRootAdmin: user?.isRootAdmin === true,
      snapshots: actionGradeSnapshots, practicePasses: actionPracticePasses,
    });
  }, [teacherWorkspaceMode, teacherTab, classes, assignments, allStudents, user?.email, user?.isRootAdmin, actionGradeSnapshots, actionPracticePasses]);

  const actionReturnCheckIns = useMemo(() => {
    if (teacherWorkspaceMode !== 'teacher' || teacherTab !== 'actionCenter') return [];
    return classes.flatMap((classRecord) => resolveReturnCheckIns({
      roster: allStudents.filter((student) => student.classId === (classRecord.classId || classRecord.id)),
      supportEvents: studentSupportEvents, assignments, classId: classRecord.classId || classRecord.id,
      classPeriod: classRecord.period || classRecord.classPeriod, schedule: classSchedule,
      nonInstructionalKeys: SCHOOL_NON_INSTRUCTIONAL_KEYS, todayDateKey: localDateKeyOf(now),
    }));
  }, [teacherWorkspaceMode, teacherTab, classes, allStudents, studentSupportEvents, assignments, classSchedule, now]);

  const teacherActionItems = useMemo(() => {
    if (teacherWorkspaceMode !== 'teacher' || teacherTab !== 'actionCenter') return [];
    return buildTeacherActionItems({
      students: allStudents, classes, supportEvents: studentSupportEvents, parentContacts,
      returnCheckIns: actionReturnCheckIns, gradeTransferUnits: actionGradeScope.units,
      retestRecoveryActions, now, todayDateKey: localDateKeyOf(now),
    });
  }, [teacherWorkspaceMode, teacherTab, allStudents, classes, studentSupportEvents, parentContacts, actionReturnCheckIns, actionGradeScope.units, retestRecoveryActions, now]);
  const currentTeacherActionOpenCount = openTeacherActionCount(teacherActionItems);
  const teacherActionOpenCount = teacherTab === 'actionCenter'
    ? currentTeacherActionOpenCount
    : teacherActionOpenCountCache;

  useEffect(() => {
    if (teacherWorkspaceMode !== 'teacher' || teacherTab !== 'actionCenter') return;
    setTeacherActionOpenCountCache(currentTeacherActionOpenCount);
  }, [teacherWorkspaceMode, teacherTab, currentTeacherActionOpenCount]);

  useEffect(() => {
    const classIds = actionGradeScope.authorizedClassIds;
    if (user?.role !== 'teacher') { setActionGradeSnapshots([]); setActionPracticePasses(new Set()); return; }
    if (teacherWorkspaceMode !== 'teacher' || teacherTab !== 'actionCenter') {
      setActionGradeSnapshots([]);
      setActionPracticePasses(new Set());
      return;
    }
    if (teacherPreviewRuntimeActive) return;
    if (!classIds.length) { setActionGradeSnapshots([]); setActionPracticePasses(new Set()); return; }
    loadTeacherGradeTransferState({ classIds })
      .then(({ snapshots, practicePasses }) => {
        setActionGradeSnapshots(snapshots);
        setActionPracticePasses(practicePasses);
      })
      .catch((error) => console.error('Action Center grade-transfer projection failed:', error));
  }, [user?.role, user?.uid, user?.isRootAdmin, auth.session?.uid, actionGradeScope.authorizedClassIds.join('|'), teacherWorkspaceMode, teacherPreviewRuntimeActive, teacherTab]);

  useEffect(() => {
    if (user?.role !== 'teacher') { setRetestRecoveryActions([]); return; }
    if (teacherWorkspaceMode !== 'teacher' || teacherTab !== 'actionCenter') {
      setRetestRecoveryActions([]);
      return undefined;
    }
    if (teacherPreviewRuntimeActive) return undefined;
    let cancelled = false;
    Promise.all(assignments.filter(isTestCycleAssignment).map(async (assignment) => {
      const response = await listTeacherTestCycleRecords({ assignmentId: assignment.id });
      return projectTestCycleTeacherActions({ records: response.rows || [], assignment });
    })).then((groups) => { if (!cancelled) setRetestRecoveryActions(groups.flat()); })
      .catch((error) => console.error('Action Center Test Cycle projection failed:', error));
    return () => { cancelled = true; };
  }, [user?.role, assignments, teacherWorkspaceMode, teacherPreviewRuntimeActive, teacherTab]);

  useEffect(() => {
    if (user?.role !== 'teacher' || !user.email) {
      setStudentSessionSummaries([]);
      return undefined;
    }
    if (teacherWorkspaceMode !== 'teacher' || !TEACHER_SESSION_SUMMARY_TABS.has(teacherTab)) {
      setStudentSessionSummaries([]);
      return undefined;
    }
    if (teacherPreviewRuntimeActive) return undefined;
    return subscribeStudentSessionSummaries({
      db,
      teacherEmail: user.email,
      classIds: classes
        .filter((entry) => entry?.status !== 'archived' && entry?.classId)
        .map((entry) => entry.classId),
      onChange: setStudentSessionSummaries,
      onError: (error) => console.error('Student session summaries failed:', error),
    });
  }, [user?.role, user?.email, classes, teacherWorkspaceMode, teacherPreviewRuntimeActive, teacherTab]);

  /*
   * A per-student extension is never written as a client-side whole-map
   * replace, for two reasons at once: (1) two teachers (or two tabs)
   * granting extensions to two different students of the same assignment
   * from the same stale snapshot must not let the second write erase the
   * first, and (2) firestore.rules blocks a direct client write to
   * `studentOverrides` entirely (see that rule's comment) — only the
   * `applyStudentAttendanceExtension` Cloud Function may write it, because
   * only it can independently re-verify the caller is this student's own
   * teacher of record and that the write never shortens a cutoff already on
   * file. This function's job is just to shape the browser's already-computed
   * proposal for that callable.
   */
  const applyStudentOverridePatch = async ({ assignmentId, studentId, classId, patch }) => {
    const entry = patch?.studentOverrides?.[studentId];
    if (!entry?.lateDueAt) return;
    const proposedLateDueAtMs = entry.lateDueAt instanceof Date
      ? entry.lateDueAt.getTime()
      : new Date(entry.lateDueAt).getTime();
    await applyStudentAttendanceExtension({
      classId, studentId, assignmentId, proposedLateDueAtMs, extension: entry.extension || {},
    });
  };

  /*
   * ONE RECONCILIATION PATH FOR EVERY ATTENDANCE EVENT.
   *
   * Live Classroom's same-day quick-mark and an Attendance History
   * correction are both, underneath, "a teacher just recorded an attendance
   * mark" — so both go through this same function rather than two separate
   * ones that could drift apart. A Present/Late correction runs through here
   * too: it may remove an absence an earlier extension was based on, which
   * is exactly the "would shorten" case extensionReconciliation.js has to
   * catch. Recording the (append-only) event and reconciling any extension it
   * touches happen together, so a teacher never sees a corrected mark that
   * has not yet been reflected in the student's deadline.
   */
  const reconcileAttendanceExtensions = async (event, record) => {
    const classPeriod = classes.find((entry) => entry.classId === event.classId)?.period || null;
    const affectedAssignments = assignments
      .filter((assignment) => assignmentIsForStudent(assignment, { classId: event.classId }))
      .filter((assignment) => {
        const release = localDateKeyOf(assignment?.releaseAt || assignment?.releaseDate) || '0000-00-00';
        const due = localDateKeyOf(assignment?.dueAt || assignment?.dueDate);
        return due && event.evidence?.dateKey >= release && event.evidence?.dateKey <= due;
      });
    const windowStarts = affectedAssignments
      .map((assignment) => localDateKeyOf(assignment?.releaseAt || assignment?.releaseDate))
      .filter(Boolean);
    const windowEnds = affectedAssignments
      .map((assignment) => localDateKeyOf(assignment?.dueAt || assignment?.dueDate))
      .filter(Boolean);
    const attendanceHistory = affectedAssignments.length
      ? await fetchAttendanceForClassDateRange({
        db,
        teacherEmail: user.email,
        classId: event.classId,
        fromDateKey: windowStarts.sort()[0] || event.evidence?.dateKey,
        toDateKey: windowEnds.sort().at(-1) || event.evidence?.dateKey,
      })
      : [];
    const results = reconcileAssignmentExtensionsForCorrection({
      assignments: affectedAssignments,
      studentId: event.studentId,
      classId: event.classId,
      classPeriod,
      schedule: classSchedule,
      nonInstructionalKeys: SCHOOL_NON_INSTRUCTIONAL_KEYS,
      // The generic support subscription is capped at 750 records. Extension
      // decisions use the complete indexed attendance range instead.
      supportEvents: attendanceHistory.some((entry) => entry.id === record.id)
        ? attendanceHistory : [...attendanceHistory, record],
      correctionDateKey: event.evidence?.dateKey,
    });

    let reviewCount = 0;
    await Promise.all(results.map(async ({ assignment, resolution }) => {
      if (resolution.reviewNeeded) { reviewCount += 1; return; }
      const patch = buildStudentExtensionPatch({
        assignment, studentId: event.studentId, resolution, actorEmail: user.email,
      });
      if (patch) await applyStudentOverridePatch({ assignmentId: assignment.id, studentId: event.studentId, classId: event.classId, patch });
    }));
    return reviewCount;
  };

  const [attendanceReviewBusyKey, setAttendanceReviewBusyKey] = useState(null);

  /*
   * "KEEP CURRENT EXTENSION" — the review is resolved, nothing is written to
   * the assignment. Recording the resolution is what makes the open item on
   * Attendance History disappear (openAttendanceCorrectionReviewsForStudent
   * checks for exactly this event).
   */
  const handleKeepAttendanceExtension = async ({ student, assignment, resolution, classId, classPeriod, reviewKey }) => {
    if (user?.role !== 'teacher' || !user.email) return;
    setAttendanceReviewBusyKey(reviewKey);
    try {
      await recordStudentSupportEvent({
        db, teacherEmail: user.email,
        event: buildAttendanceCorrectionReviewEvent({
          studentId: student.id || student.studentId,
          studentName: rosterStudentNameForStorage({
            studentId: student.id || student.studentId,
            index: teacherStudentIdentityIndex,
            historicalName: formatStudentName(student, { lastFirst: false, fallbackToNeutral: false }),
          }),
          assignmentId: assignment.id, assignmentTitle: assignment.title, classId, classPeriod,
          existing: resolution.existing, proposed: resolution.proposed, resolution: 'kept', actorEmail: user.email,
        }),
      });
      toastSuccess('Extension kept', 'The existing extension stays in place; the review is resolved.');
    } catch (error) {
      console.error(error);
      toastError('Could not resolve the review', error.message);
    } finally {
      setAttendanceReviewBusyKey(null);
    }
  };

  /*
   * "APPLY SHORTER EXTENSION" — the one deliberate exception to "never
   * shorten automatically". The review-resolution event is recorded FIRST
   * (audited, teacher-authorized), and the callable independently re-checks
   * that exact record exists before it will accept a shortened cutoff — see
   * applyStudentAttendanceExtension's own comment in functions/index.js.
   */
  const handleApplyShorterAttendanceExtension = async ({ student, assignment, resolution, classId, classPeriod, reviewKey }) => {
    if (user?.role !== 'teacher' || !user.email) return;
    const studentId = student.id || student.studentId;
    setAttendanceReviewBusyKey(reviewKey);
    try {
      await recordStudentSupportEvent({
        db, teacherEmail: user.email,
        event: buildAttendanceCorrectionReviewEvent({
          studentId,
          studentName: rosterStudentNameForStorage({
            studentId,
            index: teacherStudentIdentityIndex,
            historicalName: formatStudentName(student, { lastFirst: false, fallbackToNeutral: false }),
          }),
          assignmentId: assignment.id, assignmentTitle: assignment.title, classId, classPeriod,
          existing: resolution.existing, proposed: resolution.proposed, resolution: 'shortened', actorEmail: user.email,
        }),
      });
      await applyStudentAttendanceExtension({
        classId, studentId, assignmentId: assignment.id,
        proposedLateDueAtMs: resolution.proposed.dueAt instanceof Date
          ? resolution.proposed.dueAt.getTime() : new Date(resolution.proposed.dueAt).getTime(),
        extension: {
          dateKey: resolution.proposed.dateKey,
          meetingsGranted: resolution.proposed.meetingsGranted,
          meetingsRequested: resolution.proposed.meetingsRequested,
          undetermined: resolution.proposed.undetermined,
          resolved: resolution.proposed.resolved,
          sourceAbsenceDates: resolution.proposed.sourceAbsenceDates,
        },
        allowShorten: true,
        existingDateKey: resolution.existing?.dateKey,
        proposedDateKey: resolution.proposed?.dateKey,
      });
      toastSuccess('Extension shortened', 'The student’s extension now matches the corrected attendance.');
    } catch (error) {
      console.error(error);
      toastError('Could not apply the shorter extension', error.message);
    } finally {
      setAttendanceReviewBusyKey(null);
    }
  };

  const ATTENDANCE_EVENT_KINDS = [LIVE_ATTENDANCE_EVENT_KIND, ATTENDANCE_HISTORY_EVENT_KIND];

  const handleRecordStudentSupportEvent = async (event) => {
    if (user?.role !== 'teacher' || !user.email) return null;
    const isAttendanceEvent = ATTENDANCE_EVENT_KINDS.includes(event?.kind);
    try {
      const record = await recordStudentSupportEvent({
        db,
        teacherEmail: user.email,
        event,
      });

      if (isAttendanceEvent) {
        let reviewCount;
        try {
          reviewCount = await reconcileAttendanceExtensions(event, record);
        } catch (reconciliationError) {
          console.error('Attendance extension reconciliation is pending:', reconciliationError);
          // The attendance fact is already safely append-only. Persist a
          // second append-only audit/retry record containing everything a
          // worker or teacher retry needs; never delete the attendance fact.
          try {
            await recordStudentSupportEvent({
              db,
              teacherEmail: user.email,
              event: {
                kind: SUPPORT_EVENT_KIND.ATTENDANCE_EXTENSION_RECONCILIATION_PENDING,
                stage: SUPPORT_EVENT_STAGE.SYSTEM_SIGNAL,
                studentId: event.studentId,
                studentName: event.studentName,
                classId: event.classId,
                classPeriod: event.classPeriod,
                dateKey: event.evidence?.dateKey,
                relatedEventId: record.id,
                summary: 'Attendance saved; deadline reconciliation needs retry.',
                evidence: {
                  dateKey: event.evidence?.dateKey,
                  attendanceEventId: record.id,
                  retryable: true,
                  error: String(reconciliationError?.message || reconciliationError).slice(0, 300),
                },
              },
            });
          } catch (auditError) {
            console.error('Could not persist attendance reconciliation retry audit:', auditError);
          }
          toastError(
            'Attendance saved; extension update pending',
            'The attendance record is safe. Deadline reconciliation needs a retry and was added to the support audit trail.',
          );
          return record;
        }
        toastSuccess(
          event.kind === ATTENDANCE_HISTORY_EVENT_KIND ? 'Attendance correction saved' : 'Attendance recorded',
          reviewCount > 0
            ? `${reviewCount} extension${reviewCount === 1 ? '' : 's'} would have shortened — review before changing.`
            : 'The prior mark stays in the record; any earned extension was reconciled.',
        );
        return record;
      }

      const label = event?.kind === SUPPORT_EVENT_KIND.PARENT_FOLLOW_UP
        ? 'Parent follow-up recorded'
        : event?.stage === SUPPORT_EVENT_STAGE.DISMISSED
          ? 'Signal dismissal recorded'
          : 'Student support note recorded';
      toastSuccess(label, 'The event was added to the append-only student support history.');
      return record;
    } catch (error) {
      console.error(error);
      toastError(isAttendanceEvent ? 'Could not save the attendance record' : 'Could not save support note', error.message);
      return null;
    }
  };

  // Teachers stream presence only while the live grid is on screen. Subscribe
  // to roster-owned documents individually rather than the whole collection:
  // Firestore rules can then enforce that a teacher reads only students they
  // currently teach. Presence should never become a school-wide teacher feed.
  useEffect(() => {
    if (user?.role !== 'teacher' || !['home', 'classesWorkspace'].includes(teacherTab)) {
      setPresenceById({});
      return undefined;
    }
    // Keep the last room snapshot in memory while Preview is open, but stop
    // every per-student listener. This prevents heartbeat traffic from making
    // the full interactive exemplar rerender during instruction.
    if (teacherPreviewRuntimeActive) return undefined;

    const rosterIds = [...new Set(
      (Array.isArray(allStudents) ? allStudents : [])
        .map((student) => String(student?.id || '').trim())
        .filter(Boolean),
    )];

    if (!rosterIds.length) {
      setPresenceById({});
      return undefined;
    }

    // One render per second at most, however many students heartbeat: every
    // snapshot used to re-render the whole dashboard (about 7.5 renders a
    // second for 150 students). See coalescedKeyedUpdates.js.
    const presenceBuffer = createKeyedUpdateBuffer({
      flushMs: PRESENCE_FLUSH_MS,
      onFlush: (changes) => setPresenceById((current) => applyKeyedChanges(current, changes)),
    });
    const unsubs = rosterIds.map((studentId) => onSnapshot(
      doc(db, 'presence', studentId),
      (snapshot) => {
        presenceBuffer.set(studentId, snapshot.exists() ? snapshot.data() : null);
      },
      (error) => {
        // One stale/reassigned roster row should not take the rest of the live
        // room down. The scoped roster refresh will remove it on the next load.
        console.error(`Live class update failed for ${studentId}:`, error);
      },
    ));

    return () => {
      presenceBuffer.cancel();
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [user?.role, teacherTab, allStudents, teacherPreviewRuntimeActive]);

  // The server writes one compact receipt only after Google Classroom accepts
  // a grade patch. Listening to that receipt gives students confirmation from
  // the authoritative passback result rather than assuming a network request
  // worked. The local assignment tracker is NOT replaced from this snapshot:
  // the student's own answers move it through the normal save path, and a
  // snapshot from before an ingestion lands must never roll them back. A
  // record the server holds AHEAD of this session is the exception, adopted
  // below (canonicalTrackerReconciliation.js): an attempt this device never
  // made — the Warm-Up or DOL deadline's auto-submit, or another Chromebook's.
  useEffect(() => {
    if (user?.role !== 'student' || !user.id) {
      setClassroomSyncStatusByAssignment({});
      setTestCycleGrades({});
      setTeacherGradeOverridesByAssignment({});
      setSectionRecoveryByAssignment({});
      setWarmupChallengeByAssignment({});
      setDolGradesByAssignment({});
      setClassworkGradesByAssignment({});
      classroomSyncNoticeRef.current = {};
      return undefined;
    }

    return onSnapshot(
      doc(db, 'grades', user.id),
      (snapshot) => {
        if (!snapshot.exists()) return;
        // An attempt the server recorded without this device — the deadline
        // finalizer's auto-submit above all — reaches the open question now,
        // not at the next sign-in: a closed question shows as closed, and the
        // next checkpoint carries the attempt count the server really has.
        const serverGrades = snapshot.data()?.gradesByAssignment || {};
        setTracker((current) => {
          const { grades, adopted } = adoptCanonicalAdvances(current, serverGrades);
          // Attempts the server made are not this session's attempts.
          adopted.forEach(({ assignmentId, questionIndex, totalAttempts }) => {
            const baseline = liveSessionAttemptBaselineRef.current;
            if (baseline.assignmentId === assignmentId) {
              baseline.totalAttemptsByIndex = { ...baseline.totalAttemptsByIndex, [questionIndex]: totalAttempts };
            }
          });
          return grades;
        });
        const next = snapshot.data()?.classroomSyncStatusByAssignment || {};
        setClassroomSyncStatusByAssignment(next);
        // A teacher releasing a secure Test or Retest changes this map, and the
        // student's card and Grade Center have to follow without a reload.
        setTestCycleGrades(snapshot.data()?.testCycleGrades || {});
        setTeacherGradeOverridesByAssignment(snapshot.data()?.teacherGradeOverridesByAssignment || {});
        // A Recovery the server just recorded must reach the student's grade
        // and Recovery panel without a reload.
        setSectionRecoveryByAssignment(snapshot.data()?.sectionRecoveryByAssignment || {});
        setWarmupChallengeByAssignment(snapshot.data()?.warmupChallengeByAssignment || {});
        setDolGradesByAssignment(snapshot.data()?.dolGradesByAssignment || {});
        setClassworkGradesByAssignment(snapshot.data()?.classworkGradesByAssignment || {});
        // The profile the server grades with: a revision a teacher saves while
        // this student is working reaches their required items now, not at
        // the next sign-in.
        const liveProfile = normalizeStudentProfile(snapshot.data()?.profile || snapshot.data());
        setUser((current) => (current && !sameStudentProfile(current.profile, liveProfile) ? { ...current, profile: liveProfile } : current));

        Object.entries(next).forEach(([assignmentId, receipt]) => {
          const notificationId = receipt?.notificationId;
          if (!notificationId) return;
          if (classroomSyncNoticeRef.current[assignmentId] === notificationId) return;
          classroomSyncNoticeRef.current[assignmentId] = notificationId;

          const assignment = assignmentsRef.current.find((item) => item.id === assignmentId);
          const title = assignment?.title || 'Your assignment';
          const grade = Number.isFinite(Number(receipt?.grade)) ? Number(receipt.grade) : null;
          const gradeText = grade == null ? 'Your grade' : `${grade}%`;
          const stage = String(receipt?.stage || '');
          const final = receipt?.isFinal === true || stage.startsWith('final-');
          const studentVisible = receipt?.studentVisible === true;

          if (final) {
            toastSuccess(
              'Final grade sent to Google Classroom',
              `${title}: ${gradeText} was released to you in Google Classroom as the final MathMaster grade.`,
            );
            return;
          }

          if (stage === 'due-checkpoint') {
            toastSuccess(
              'Due-date grade sent to Google Classroom',
              `${title}: ${gradeText} was released to you in Google Classroom at the regular due date. Late work can still improve it before the final cutoff.`,
            );
            return;
          }

          if (stage === 'assessment-release') {
            toastSuccess(
              'Released grade sent to Google Classroom',
              `${title}: ${gradeText} was released to you in Google Classroom after your teacher released the assessment grade.`,
            );
            return;
          }

          if (studentVisible) {
            toastSuccess(
              'Updated grade released to Google Classroom',
              `${title}: your current ${gradeText} is visible in Google Classroom. It is not final—late work can still improve it.`,
            );
            return;
          }

          toastSuccess(
            'Progress checkpoint saved to Google Classroom',
            `${title}: your current ${gradeText} was saved as a teacher draft in Classroom. Your live grade is visible here in MathMaster and is not final—keep working to raise it.`,
          );
        });
      },
      (error) => console.error('Could not watch Google Classroom grade receipts:', error),
    );
  }, [user?.role, user?.id, toastSuccess]);

  // DOL reminders are global to the student experience, not just the open
  // assignment. The persistent purple DOL card/banner is the primary notice;
  // this reminder repeats every two minutes until the student submits once.
  useEffect(() => {
    if (user?.role !== 'student' || !user.classPeriod) return;
    const activeKeys = new Set();
    assignments.forEach((assignment) => {
      if (!assignmentIsForStudent(assignment, { classId: user.classId || null, classPeriod: user.classPeriod })) return;
      const dolState = getDOLState({ assignment, schedule: classSchedule, classId: user.classId || null, classPeriod: user.classPeriod, nowValue: now });
      if (dolState.status !== 'active') return;
      const dolRecords = (dolState.questionIndices || [dolState.questionIndex])
        .filter((index) => Number.isInteger(index) && index >= 0)
        .map((index) => normalizeQuestionRecord(tracker?.[assignment.id]?.[index]));
      if (dolRecords.some((record) => record.totalAttempts > 0 || ['correct', 'expired'].includes(record.status))) return;
      const key = `${assignment.id}:${user.classPeriod}:${dolState.instructionDateKey || localDateKey(now)}`;
      activeKeys.add(key);
      const lastReminderAt = Number(dolOpenAnnouncedRef.current[key] || 0);
      if (lastReminderAt && now - lastReminderAt < 120000) return;
      const firstReminder = lastReminderAt === 0;
      dolOpenAnnouncedRef.current[key] = now;
      toastWarning(
        firstReminder ? 'DOL is open — start now' : 'DOL reminder — start now',
        `${assignment.title}: open the DOL now. The timer is running and ${formatRemainingTime(dolState.millisecondsRemaining)} remains.`,
      );
    });
    Object.keys(dolOpenAnnouncedRef.current).forEach((key) => {
      if (!activeKeys.has(key) && now - Number(dolOpenAnnouncedRef.current[key] || 0) > 15 * 60000) delete dolOpenAnnouncedRef.current[key];
    });
  }, [now, user, assignments, classSchedule, tracker, toastWarning]);

  // A REOPENED DOL OR AN EXTRA ATTEMPT MUST REACH THE STUDENT WHO ALREADY TRIED.
  // The reminder above stops once a student has attempted the DOL, which is
  // exactly who a teacher recovery is for. Tell them once per change: the
  // window reopened (and when it closes), or how many more attempts they have.
  useEffect(() => {
    if (user?.role !== 'student') return;
    assignments.forEach((assignment) => {
      if (!assignment?.dol?.enabled) return;
      if (!assignmentIsForStudent(assignment, { classId: user.classId || null, classPeriod: user.classPeriod })) return;
      const recovery = summarizeStudentRecovery({ assignment, classId: user.classId || null, studentId: user.id, now });
      const reopenKey = recovery.reopened ? `${assignment.id}:reopened:${recovery.reopened.openedAt}` : null;
      if (reopenKey && !dolRecoveryAnnouncedRef.current[reopenKey]) {
        dolRecoveryAnnouncedRef.current[reopenKey] = true;
        toastWarning('Your teacher reopened the DOL', `${assignment.title}: the DOL is open again until ${formatDateTime(recovery.reopened.closesAt)}. Your earlier work is still there.`);
      }
      // A standing grant matters while the DOL can be worked; do not repeat an
      // old grant every session on days the DOL is closed.
      const dolOpen = getDOLState({ assignment, schedule: classSchedule, classId: user.classId || null, classPeriod: user.classPeriod, nowValue: now }).status === 'active';
      const grantKey = recovery.extraAttempts && dolOpen ? `${assignment.id}:attempts:${recovery.extraAttempts}` : null;
      if (grantKey && !dolRecoveryAnnouncedRef.current[grantKey]) {
        dolRecoveryAnnouncedRef.current[grantKey] = true;
        toastSuccess('More DOL attempts', `${assignment.title}: your teacher gave you ${recovery.extraAttempts} extra ${recovery.extraAttempts === 1 ? 'attempt' : 'attempts'} on each DOL question. Your earlier attempts still count.`);
      }
    });
  }, [now, user, assignments, classSchedule, toastWarning, toastSuccess]);

  // Warm-Up reminders are student-wide, just like DOL reminders. The amber
  // countdown stays visible everywhere; this toast announces the opening and
  // repeats every two minutes while Warm-Up questions still need work.
  useEffect(() => {
    if (user?.role !== 'student' || !user.classPeriod) return;
    const activeKeys = new Set();
    const classContext = { classId: user.classId || null, classPeriod: user.classPeriod };

    assignments.forEach((assignment) => {
      if (!assignmentIsForStudent(assignment, classContext)) return;
      const warmupState = getWarmupState({
        assignment,
        schedule: classSchedule,
        ...classContext,
        nowValue: now,
      });
      if (warmupState.status !== 'active') return;

      const questions = getStoredAssignmentQuestions(assignment);
      // Only this student's own Warm-Up items (an omitted one is not unfinished).
      const warmupOmitted = new Set(studentRequiredFor(assignment).omitted);
      const warmupIndices = questions.reduce((indices, question, index) => {
        if (
          questionIsIncluded(question)
          && !warmupOmitted.has(index)
          && resolveQuestionActivityRole({ question, assignment }) === 'warmup'
        ) indices.push(index);
        return indices;
      }, []);
      if (!warmupIndices.length) return;

      const records = warmupIndices.map((index) => normalizeQuestionRecord(tracker?.[assignment.id]?.[index]));
      if (records.every((record) => ['correct', 'expired'].includes(record.status))) return;

      const key = `${assignment.id}:${user.classId || user.classPeriod}:${warmupState.instructionDateKey || localDateKey(now)}`;
      activeKeys.add(key);
      const lastReminderAt = Number(warmupOpenAnnouncedRef.current[key] || 0);
      if (lastReminderAt && now - lastReminderAt < 120000) return;

      const firstReminder = lastReminderAt === 0;
      warmupOpenAnnouncedRef.current[key] = now;
      toastWarning(
        firstReminder ? 'Warm-Up is active — start now' : 'Warm-Up reminder — timer is running',
        `${assignment.title}: the Warm-Up is open now and ${formatRemainingTime(warmupState.millisecondsRemaining)} remains.`,
      );
    });

    Object.keys(warmupOpenAnnouncedRef.current).forEach((key) => {
      if (
        !activeKeys.has(key)
        && now - Number(warmupOpenAnnouncedRef.current[key] || 0) > 15 * 60000
      ) delete warmupOpenAnnouncedRef.current[key];
    });
  }, [now, user, assignments, classSchedule, tracker, toastWarning]);


  useEffect(() => {
    if (user?.role !== 'student' || !user.classPeriod) return;
    const date = new Date(now);
    const fallbackDateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const closes = [];
    assignments.forEach((assignment) => {
      if (!assignmentIsForStudent(assignment, { classId: user.classId || null, classPeriod: user.classPeriod })) return;
      const dolState = getDOLState({ assignment, schedule: classSchedule, classId: user.classId || null, classPeriod: user.classPeriod, nowValue: now });
      const previousStatus = lastDOLStatusRef.current[assignment.id];
      lastDOLStatusRef.current[assignment.id] = dolState.status;
      if (dolState.status !== 'ended') return;
      const dateKey = dolState.instructionDateKey || fallbackDateKey;
      if (dolGradesByAssignment?.[assignment.id]?.[dateKey]?.finalized) return;
      if (previousStatus && !['active', 'waiting', 'beforeClass'].includes(previousStatus)) return;
      // This student's own DOL items (a reduced-item-count accommodation may
      // omit one; the server finalizer filters the same way).
      const studentDolOmitted = new Set(studentRequiredFor(assignment, { assignmentTracker: tracker?.[assignment.id] || null }).omitted);
      const allDolIndices = dolState.questionIndices || [dolState.questionIndex];
      const ownDolIndices = allDolIndices.filter((index) => !studentDolOmitted.has(index));
      // Never a DOL with no items (the plan keeps one; the server never empties
      // a list either): scoring the whole DOL beats finalizing a 0 over nothing.
      const questionIndices = ownDolIndices.length ? ownDolIndices : allDolIndices;
      closes.push({
        assignmentId: assignment.id,
        dateKey,
        record: {
          finalized: true,
          score: calculateDOLSectionScore(
            gradeDisplayTracker?.[assignment.id] || {},
            questionIndices,
            assignment,
          ),
          questionIndex: questionIndices[0] ?? dolState.questionIndex,
          questionIndices,
          recordedAt: new Date().toISOString(),
          status: 'section-finalized',
        },
      });
    });
    if (!closes.length) return;

    // CLIENT DOL CLOSE IS IMMEDIATE FEEDBACK, NOT AUTHORITY.
    //
    // The DOL projection is server-owned: ingestion records it as each answer
    // lands, and the checkpoint finalizer finalizes it for a response still
    // pending at the cutoff, with no browser mounted. This browser used to
    // write its own close — a score computed from its local tracker — onto
    // the grade document. It now only closes the DOL on this screen; a
    // projection the server has already finalized is never replaced, even
    // locally. (No grade reads the projection: every DOL score is computed
    // from the canonical question records.)
    closes.forEach(({ assignmentId, dateKey, record }) => {
      setDolGradesByAssignment((current) => {
        if (current?.[assignmentId]?.[dateKey]?.finalized === true) return current;
        return {
          ...current,
          [assignmentId]: {
            ...(current?.[assignmentId] || {}),
            [dateKey]: record,
          },
        };
      });
    });
  }, [now, user, assignments, classSchedule, gradeDisplayTracker, dolGradesByAssignment]);

  useEffect(() => {
    if (user?.role !== 'student' || activeView !== 'assignment' || !activeAssignmentId) return;
    const assignment = assignments.find((item) => item.id === activeAssignmentId);
    if (!assignment) return;
    if (getAssignmentLifecycle(assignment, Date.now(), { studentId: user.id }).isPracticeOnly) {
      clearResumeAction(user.id);
      setResumeAction(null);
      return;
    }
    const action = {
      assignmentId: activeAssignmentId,
      assignmentTitle: assignment.title,
      questionIndex: currentQuestionIndex,
      questionNumber: currentQuestionIndex + 1,
      dueDate: assignment.dueAt || assignment.dueDate || '',
      lateDueDate: assignment.lateDueAt || assignment.lateDueDate || '',
      lifecycleStatus: getAssignmentLifecycle(assignment, Date.now(), { studentId: user.id }).status,
    };
    saveResumeAction(user.id, action);
    // Server-backed too: the browser copy cannot follow a student to a
    // different Chromebook. It is a position, never authority over grading.
    workspaceDraftSyncRef.current?.setResume({
      questionIndex: currentQuestionIndex,
      activityRole: activeQuestionRole,
      variantIndex: normalizeQuestionRecord(tracker?.[activeAssignmentId]?.[currentQuestionIndex]).variantIndex,
      updatedAt: Date.now(),
    });
    setResumeAction(action);
  }, [user, activeView, activeAssignmentId, currentQuestionIndex, assignments, activeQuestionRole, tracker]);

  useEffect(() => {
    activeTimeRef.current = getModuleTime(activeWorkingTracker, currentQuestionIndex);
  }, [activeAssignmentId, currentQuestionIndex, activeWorkingTracker]);

  useEffect(() => {
    if (user?.role !== 'student' || activeView !== 'assignment') {
      setIsIdle(false);
      return undefined;
    }
    // THE ACCOMMODATION HIDES THE PROMPT, NOT THE CLOCK.
    //
    // "No idle timer" (inclusion, extra-time, disable-idle-timer) used to
    // return from this effect before the interval below was created, so the
    // engagement counter never ran for exactly the students whose support
    // evidence matters most — the IEP report's "0 min" on scored work. Now the
    // accommodation only suppresses the "Are you still working?" overlay.
    // Idle time (no interaction for 2 minutes) still counts for nobody.
    const suppressIdlePrompt = activeSupportPresentation.disableIdleTimer;

    const resetActivity = () => {
      lastActivityRef.current = Date.now();
      if (isIdle) setIsIdle(false);
    };
    // Browsers fire a mousemove with unchanged coordinates when content
    // appears under a resting cursor. The idle overlay itself is such content,
    // so it dismissed itself the moment it rendered and restarted the timer
    // (live QA round 2). Only a pointer that actually moved is activity.
    // Held in a ref: this effect re-subscribes when the overlay appears.
    const resetOnPointerMove = (event) => {
      const point = `${event.screenX},${event.screenY}`;
      if (point === lastPointerRef.current) return;
      lastPointerRef.current = point;
      resetActivity();
    };

    window.addEventListener('mousemove', resetOnPointerMove);
    window.addEventListener('keydown', resetActivity);
    window.addEventListener('click', resetActivity);
    // A phone or tablet student reading and scrolling never fires mousemove,
    // and a drag that ends away from where it started never fires click.
    const passive = { passive: true };
    window.addEventListener('pointerdown', resetActivity, passive);
    window.addEventListener('touchstart', resetActivity, passive);
    window.addEventListener('wheel', resetActivity, passive);

    const interval = window.setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - lastActivityRef.current > 120000) {
        if (!suppressIdlePrompt) setIsIdle(true);
        return;
      }
      if (!isIdle) {
        activeTimeRef.current += 1;
        pendingAssignmentSecondsRef.current += 1;
        if (liveSessionActiveSecondsRef.current.assignmentId === activeAssignmentId) {
          liveSessionActiveSecondsRef.current.seconds += 1;
        }
      }
    }, 1000);

    return () => {
      window.removeEventListener('mousemove', resetOnPointerMove);
      window.removeEventListener('keydown', resetActivity);
      window.removeEventListener('click', resetActivity);
      window.removeEventListener('pointerdown', resetActivity, passive);
      window.removeEventListener('touchstart', resetActivity, passive);
      window.removeEventListener('wheel', resetActivity, passive);
      window.clearInterval(interval);
    };
  }, [user, activeView, activeAssignmentId, isIdle, activeSupportPresentation.disableIdleTimer]);

  useEffect(() => {
    if (typeof window === 'undefined' || activeView !== 'assignment' || !activeAssignmentId) return undefined;
    let secondFrame = null;
    // A question the student already started opens on the live work (the
    // region a tool marks for Work View), not on the tool header: resuming
    // a systems question landed 700px above its balance board, and this
    // scroll cancelled the solver's own reveal. The task stays sticky.
    const reveal = (behavior) => {
      const stage = assignmentQuestionStageRef.current;
      const liveWork = stage?.querySelectorAll?.('[data-work-view-focus="true"]');
      const target = liveWork?.length ? liveWork[liveWork.length - 1] : null;
      // Desktop measures instead of trusting scrollIntoView: the page's
      // scroll-padding and the stage's scroll-margin add up, and aimed at the
      // stage that landed every question at scrollY 0 (see stickyReveal.js).
      if (isDesktopStickyLayout()) {
        if (target) revealBelowSticky({ target, sticky: stage?.querySelector?.('.mathmaster-desktop-question-anchor'), behavior });
        else if (stage) revealBelowSticky({ target: stage, sticky: document.querySelector('.mathmaster-assignment-unified-nav'), behavior });
        return;
      }
      if (target) target.scrollIntoView?.({ behavior, block: 'start' });
      else stage?.scrollIntoView?.({ behavior, block: 'start' });
    };
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => reveal('smooth'));
    });

    // AIM AGAIN WHILE THE NEXT QUESTION IS STILL ARRIVING.
    //
    // Between questions the page is briefly short (the previous tool is gone,
    // the next has not rendered), the browser clamps the scroll, and the scroll
    // above lands wherever the short page allowed: scrollY 93 with the tool
    // 600px down at 1536x900 (live QA round 2, intermittent because it depends
    // on how fast the question renders). For a moment after the change, the
    // stage growing re-aims — unless the student has already scrolled, typed
    // or touched, which is theirs to decide.
    let settled = false;
    const studentMoved = () => { settled = true; };
    const settleEvents = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
    settleEvents.forEach((type) => window.addEventListener(type, studentMoved, { passive: true }));
    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => { if (!settled) reveal('auto'); })
      : null;
    if (observer && assignmentQuestionStageRef.current) observer.observe(assignmentQuestionStageRef.current);
    const stopAiming = window.setTimeout(() => {
      settled = true;
      observer?.disconnect();
    }, 1500);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame != null) window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(stopAiming);
      observer?.disconnect();
      settleEvents.forEach((type) => window.removeEventListener(type, studentMoved, { passive: true }));
    };
  }, [activeView, activeAssignmentId, currentQuestionIndex]);

  const changeQuestion = async (newIndex) => {
    if (!activeAssignmentId || newIndex === currentQuestionIndex) return;
    if (user?.role === 'student') lastAcademicInteractionRef.current = Date.now();
    setAssignmentOverviewExpanded(false);
    const localAssignment = assignments.find((item) => item.id === activeAssignmentId);
    const localQuestions = getStoredAssignmentQuestions(localAssignment);
    if (localQuestions.length && !questionIsIncluded(localQuestions[newIndex])) return;
    // A student never lands on an item their reduced-item-count accommodation
    // omits (the navigation never offers one; this also covers deep links).
    if (isStudentAssignment && !isPracticeMode && localAssignment) {
      const required = studentRequiredFor(localAssignment, { hasPracticePass: hasPracticePassFor(activeAssignmentId) });
      if (required.omitted.includes(newIndex)) return;
    }

    if (isTeacherPreview) {
      setPreviewTracker((current) => ({
        ...current,
        [currentQuestionIndex]: {
          ...normalizeQuestionRecord(current[currentQuestionIndex]),
          timeSpent: 0,
        },
      }));
      setCurrentQuestionIndex(newIndex);
      return;
    }

    if (user?.role !== 'student') return;
    let assignment = assignments.find((item) => item.id === activeAssignmentId);
    if (!assignment) return;

    const dolState = getDOLState({ assignment, schedule: classSchedule, classId: user.classId || null, classPeriod: user.classPeriod, nowValue: Date.now() });
    if (!getAssignmentLifecycle(assignment, Date.now(), { studentId: user.id }).isClosed && (dolState.questionIndices || [dolState.questionIndex]).includes(newIndex) && dolState.enabled && !['active', 'ended'].includes(dolState.status)) {
      toastInfo('DOL not open yet', 'The DOL section opens during the final minutes of this class period. Keep working until the DOL banner appears.');
      return;
    }

    if (getAssignmentLifecycle(assignment, Date.now(), { studentId: user.id }).isPracticeOnly) {
      setCurrentQuestionIndex(newIndex);
      return;
    }

    const transitionSpan = startPerformanceSpan('next_question_ready_ms', { cached: true });
    const currentAssignmentGrades = tracker[activeAssignmentId] || {};
    const updatedTracker = {
      ...tracker,
      [activeAssignmentId]: {
        ...currentAssignmentGrades,
        [currentQuestionIndex]: {
          ...normalizeQuestionRecord(currentAssignmentGrades[currentQuestionIndex]),
          timeSpent: activeTimeRef.current,
        },
      },
    };

    try {
      setStudentPersistenceStatus('capturing');
      await enqueueDurableAction(createDurableAction({
        kind: 'questionProgress',
        studentId: user.id,
        assignmentId: activeAssignmentId,
        questionIndex: currentQuestionIndex,
        payload: { timeSpent: activeTimeRef.current, activityRole: activeQuestionRole },
      }));
      setStudentOutboxDepth((depth) => depth + 1);
      setStudentPersistenceStatus('queued');
    } catch (error) {
      console.error('Could not queue question progress:', error);
      setStudentPersistenceStatus('volatile');
      toastWarning('Progress not queued', 'Keep this tab open and try Next again. Your current work is still on screen.');
      return;
    }

    setTracker(updatedTracker);
    setCurrentQuestionIndex(newIndex);
    window.requestAnimationFrame(() => transitionSpan.finish({ status: 'interactive' }));

    // Navigation is a local operation after the progress envelope has crossed
    // the IndexedDB durability boundary. Server reconciliation does not hold
    // the Next button hostage to a network roundtrip.
    void (async () => {
      try {
        await drainStudentOutbox();
        await flushAssignmentActivity(activeAssignmentId);
      } catch (error) {
        console.error('Could not reconcile question navigation:', error);
      }
    })();
  };

  const exportAssignmentWorksheetPdf = async (assignmentId) => {
    const assignmentData = assignments.find((assignment) => assignment.id === assignmentId);
    const assignmentQuestions = getStoredAssignmentQuestions(assignmentData);
    if (user?.role !== 'student' || !assignmentQuestions.length) return;
    if (!assignmentIsForStudent(assignmentData, { classId: user.classId || null, classPeriod: user.classPeriod })) {
      toastWarning('PDF not available', 'This assignment is not assigned to your class.');
      return;
    }

    const now = Date.now();
    const lifecycle = getAssignmentLifecycle(assignmentData, now, { studentId: user.id });
    const access = prerequisiteAccess({ assignment: assignmentData, classworkGradesByAssignment, nowValue: now });
    const assignmentLocked = (lifecycle.isScheduled && access.reason !== 'prerequisiteMet') || !access.open;
    if (assignmentLocked) {
      toastInfo('PDF not available yet', 'The printable worksheet unlocks with the assignment.');
      return;
    }

    const classId = user.classId || null;
    const classPeriod = user.classPeriod;
    const dolState = getDOLState({ assignment: assignmentData, schedule: classSchedule, classId, classPeriod, nowValue: now });
    const warmupState = getWarmupState({ assignment: assignmentData, schedule: classSchedule, classId, classPeriod, nowValue: now });
    const warmupCanBeViewed = ['active', 'closed', 'ended'].includes(warmupState.status);
    const honors = String(user?.profile?.courseLevel || '').toLowerCase() === 'honors';
    const printableEntries = [];
    // The printed copy is the student's own required items (a reduced-item-count
    // accommodation omits some), exactly what the screen shows.
    const printOmitted = lifecycle.isPracticeOnly ? new Set() : new Set(studentRequiredFor(assignmentData).omitted);

    for (const entry of projectCurrentAssignmentContent(assignmentData).entries) {
      const index = entry.storageIndex;
      const question = assignmentQuestions[index];
      if (!question || !questionIsIncluded(question) || printOmitted.has(index)) continue;
      const sectionRole = entry.logicalRole;
      const timedDol = sectionRole === 'dol'
        && dolState.enabled
        && (dolState.questionIndices || [dolState.questionIndex]).includes(index);
      let available = true;
      if (!lifecycle.isPracticeOnly) {
        if (sectionRole === 'warmup' && warmupState.enabled && !warmupCanBeViewed) available = false;
        if (timedDol && !lifecycle.isClosed && !['active', 'ended'].includes(dolState.status)) available = false;
        const manualState = getSectionAccessState({ assignment: assignmentData, activityRole: sectionRole, classId, classPeriod, nowValue: now, studentId: user.id });
        if (manualState.enabled && !manualState.isOpen) available = false;
      }
      if (!available) continue;

      const sectionVariantMode = getSectionVariantMode(assignmentData, sectionRole);
      const generationStudentKey = sectionVariantMode === 'shared'
        ? `shared-version:${assignmentData.id}:${sectionRole}`
        : user.id || 'anonymous';
      const record = normalizeQuestionRecord(tracker?.[assignmentData.id]?.[index]);
      const runtimeActivityRole = lifecycle.isPracticeOnly ? 'practice' : sectionRole;
      const adaptation = resolveDeliveredQuestionMetadata({
        question,
        learningProfile: studentLearningProfile,
        activityRole: runtimeActivityRole,
        variationMode: sectionVariantMode,
        honors,
      });
      const generationKey = `${assignmentData.id}|${generationStudentKey}|${index}|variant:${record.variantIndex}`;
      const resolvedQuestion = normalizeContextualQuestion(generateQuestion(
        question,
        generationKey,
        adaptiveStudentProfile || user?.profile,
        adaptation,
        // The printed copy of a family-backed question is the student's own
        // pinned instance — the same numbers as on screen.
        buildStudentFamilyContext({
          assignment: assignmentData,
          question,
          storageIndex: index,
          studentId: user.id,
          classId: user.classId || null,
          sectionMode: sectionVariantMode,
          record: tracker?.[assignmentData.id]?.[index],
        }),
      ));
      printableEntries.push({
        sourceIndex: index,
        available: true,
        sectionRole,
        sectionLabel: activityTitleForRole(sectionRole),
        question: resolvedQuestion,
      });
    }

    const model = buildAssignmentWorksheetModel({
      assignment: assignmentData,
      // A blank name line on the printout rather than a placeholder for a
      // student with no name on file.
      student: { displayName: formatStudentName(user, { lastFirst: false, fallbackToNeutral: false }), classPeriod: user.classPeriod },
      entries: printableEntries,
    });
    if (!model.sections.some((section) => section.questions.length)) {
      toastInfo('Nothing to export yet', 'No currently unlocked questions are available for the printable worksheet.');
      return;
    }

    try {
      const result = await downloadAssignmentWorksheetPdf({ model });
      toastSuccess('PDF ready', `${result.pageCount} printable page${result.pageCount === 1 ? '' : 's'} exported. Locked sections and answer data were not included.`);
    } catch (error) {
      console.error('Could not export assignment PDF:', error);
      toastError('Could not export PDF', error?.message || 'MathMaster could not build the printable assignment.');
    }
  };

  const teacherWorksheetStudentsFor = (assignment) => (
    eligibleStudentsForTeacherWorksheet(assignment, allStudents)
      .slice()
      .sort(compareStudentsByName)
  );

  const exportTeacherAssignmentWorksheetPdf = async (assignment, student = null, outputMode = PRINT_OUTPUT_MODES.STUDENT) => {
    if (user?.role !== 'teacher' || !getStoredAssignmentQuestions(assignment).length) return;
    setTeacherWorksheetBusy(true);
    try {
      const masteryProfile = student ? teacherMasteryProfilesByStudentId?.[student.id] || null : null;
      // No name on file prints a blank name line, never a placeholder or id.
      const selectedStudent = student
        ? { ...student, displayName: formatStudentName(student, { fallbackToNeutral: false }) }
        : null;
      const selectedStudentProfile = selectedStudent
        ? {
            ...(selectedStudent.profile || {}),
            courseLevel: selectedStudent.profile?.courseLevel || selectedStudent.courseLevel || null,
            adaptiveInstruction: masteryProfile?.adaptiveInstruction
              || selectedStudent.profile?.adaptiveInstruction,
          }
        : null;
      const model = buildTeacherAssignmentWorksheetModel({
        assignment,
        student: selectedStudent,
        learningProfile: selectedStudent ? teacherLearningProfiles?.[selectedStudent.id] || null : null,
        studentProfile: selectedStudentProfile,
        outputMode,
      });
      const result = await downloadAssignmentWorksheetPdf({ model });
      const outputLabel = outputMode === PRINT_OUTPUT_MODES.TEACHER
        ? 'Teacher copy'
        : outputMode === PRINT_OUTPUT_MODES.ANSWER_KEY ? 'Answer key' : 'Student worksheet';
      toastSuccess(
        `${outputLabel} ready`,
        selectedStudent
          ? `${formatStudentLabel(student)} · ${result.pageCount} page${result.pageCount === 1 ? '' : 's'} exported.`
          : `${result.pageCount} page${result.pageCount === 1 ? '' : 's'} exported from the shared assignment version.`,
      );
      setTeacherWorksheetDialog(null);
    } catch (error) {
      console.error('Could not export teacher assignment PDF:', error);
      toastError('Could not export PDF', error?.message || 'MathMaster could not build the printable assignment.');
    } finally {
      setTeacherWorksheetBusy(false);
    }
  };

  const beginTeacherWorksheetExport = async (assignment) => {
    if (!getStoredAssignmentQuestions(assignment).length) {
      toastInfo('Nothing to export', 'This assignment does not currently contain printable questions.');
      return;
    }
    const requiresStudent = assignmentNeedsStudentForWorksheet(assignment);
    const students = teacherWorksheetStudentsFor(assignment);
    if (requiresStudent && !students.length) {
      toastInfo(
        'Student version needed',
        'This assignment uses personalized or adaptive sections, but no roster student is available for its current audience. Assign it to a class or add a student first.',
      );
      return;
    }
    setTeacherWorksheetDialog({ assignmentId: assignment.id, requiresStudent });
  };

  const startAssignment = (assignmentId, requestedQuestionIndex = 0, options = {}) => {
    assignmentOpenSpanRef.current?.finish({ status: 'superseded' });
    assignmentOpenSpanRef.current = startPerformanceSpan('assignment_open_ms', { flow: 'student_assignment' });
    const assignmentData = assignments.find(
      (assignment) => assignment.id === assignmentId,
    );
    /*
     * A TEST CYCLE IS NEVER ENTERED DIRECTLY.
     *
     * Every path into an assignment comes through here — Home, the Assignments
     * Center, the Grade Center's practice button, a Classroom launch. If any
     * one of them could open the raw runtime on a Test Cycle, a student could
     * reach Corrections content for a test they passed, or Review content
     * during the secure Test. So the card is the only door, and the card asks
     * the SERVER which stage is open.
     *
     * `cycleStage` is the card calling back in to open the instructional stage
     * it was told to open, which is the one case that is not a redirect.
     */
    const cycleStage = String(options.cycleStage || '').trim();
    if (isTestCycleAssignment(assignmentData) && !cycleStage) {
      setActiveTestCycleAssignmentId(assignmentId);
      return openStudentDashboardMode('testCycle');
    }
    const assignmentQuestions = getStoredAssignmentQuestions(assignmentData);
    if (!assignmentQuestions.length) return;
    if (user?.role === 'student' && !assignmentIsForStudent(assignmentData, { classId: user.classId || null, classPeriod: user.classPeriod })) {
      toastWarning('Not assigned to your class', 'This assignment is not assigned to your class period.');
      return;
    }
    const access = prerequisiteAccess({ assignment: assignmentData, classworkGradesByAssignment, nowValue: Date.now() });
    if (user?.role === 'student' && !access.open) {
      const prerequisiteTitle = assignments.find((assignment) => assignment.id === access.prerequisiteId)?.title || 'the prerequisite notes/classwork assignment';
      toastInfo('Finish the prerequisite first', `Complete ${prerequisiteTitle} first. This practice assignment also opens automatically at its scheduled release time.`);
      return;
    }
    const lifecycle = getAssignmentLifecycle(assignmentData, Date.now(), {
      studentId: user?.role === 'student' ? user.id : undefined,
    });
    if (lifecycle.isScheduled && access.reason !== 'prerequisiteMet') {
      toastInfo('Not open yet', `This assignment opens ${formatDateTime(assignmentData.releaseAt)}.`);
      return;
    }

    const currentContent = projectCurrentAssignmentContent(assignmentData);
    const requestedSectionKey = String(options?.sectionKey || '').trim().toLowerCase();
    const scopedSectionKey = ['warmup', 'classwork', 'practice', 'dol'].includes(requestedSectionKey)
      ? requestedSectionKey
      : null;

    /*
     * A GRANTED PRACTICE PASS EXCUSES PRACTICE FROM REQUIRED NAVIGATION.
     *
     * A Test Cycle assignment can never carry a Practice Pass (it is not
     * eligible for one -- see classPointRewards.mjs), so `cycleStage` and
     * `hasPracticePass` are mutually exclusive in practice; the `!cycleStage`
     * guard just keeps that explicit. Explicitly asking to open Practice as
     * required graded work is refused outright, never reopened as graded
     * Practice -- voluntary post-deadline practice is a completely separate
     * tracker this never touches.
     */
    const hasPracticePass = !cycleStage
      && !lifecycle.isPracticeOnly
      && hasPracticePassFor(assignmentId);
    if (scopedSectionKey === 'practice' && hasPracticePass) {
      toastInfo('Practice excused', 'Practice is already excused with your Practice Pass.');
      return;
    }

    // A Test Cycle stage sees only its own questions. A granted Practice Pass
    // removes Practice's own current-content questions the same way. Neither
    // filter applies to Teacher Preview or an ordinary un-redeemed assignment,
    // which keeps every existing assignment identical.
    const stageEntries = cycleStage
      ? currentContent.entries.filter((entry) => entry.logicalRole === cycleStage)
      : hasPracticePass
        ? currentContent.entries.filter((entry) => entry.logicalRole !== 'practice')
        : currentContent.entries;
    // A reduced-item-count accommodation leaves this student fewer required
    // items (never in a Test Cycle stage, a preview or voluntary practice).
    const studentRequired = !cycleStage && user?.role === 'student' && !lifecycle.isPracticeOnly
      ? new Set(studentRequiredFor(assignmentData, { hasPracticePass }).indices)
      : null;
    const includedQuestionIndices = stageEntries
      .map((entry) => entry.storageIndex)
      .filter((index) => !studentRequired || studentRequired.has(index));
    if (!includedQuestionIndices.length) {
      toastWarning('Nothing to show yet', 'This assignment does not currently contain any included questions.');
      return;
    }
    const requested = Number(requestedQuestionIndex) || 0;
    let safeQuestionIndex = resolveCurrentContentStorageIndex(assignmentData, requested)
      ?? includedQuestionIndices[0];
    // A requested index resolved against the FULL projection could still land
    // on a waived Practice question (e.g. resuming exactly where a Classroom
    // link or the Grade Center last left off) even when no section was
    // explicitly requested. Never open one for a real student who holds the pass.
    if ((hasPracticePass || studentRequired) && !includedQuestionIndices.includes(safeQuestionIndex)) {
      safeQuestionIndex = includedQuestionIndices[0];
    }

    // Enter usable work, not merely the first stored question. Warm-Up and DOL
    // have time windows of their own; Classwork and Practice use their section
    // access policy. This changes navigation only — it never opens a locked
    // section or rewrites its schedule. An explicit Classroom section launch is
    // constrained to that section rather than silently jumping elsewhere.
    if (user?.role === 'student' && !lifecycle.isPracticeOnly) {
      const entryNow = Date.now();
      const studentContext = { classId: user.classId || null, classPeriod: user.classPeriod };
      const roleIsActionable = (role) => {
        if (role === 'warmup') {
          return getWarmupState({ assignment: assignmentData, schedule: classSchedule, ...studentContext, nowValue: entryNow }).status === 'active';
        }
        if (role === 'dol') {
          return getDOLState({ assignment: assignmentData, schedule: classSchedule, ...studentContext, nowValue: entryNow }).status === 'active';
        }
        if (role === 'classwork' || role === 'practice') {
          return getSectionAccessState({
            assignment: assignmentData,
            activityRole: role,
            ...studentContext,
            studentId: user.id,
            nowValue: entryNow,
          }).isOpen;
        }
        return true;
      };
      const actionableIndex = resolveStudentAssignmentEntry({
        entries: stageEntries,
        includedQuestionIndices,
        requestedQuestionIndex: safeQuestionIndex,
        roleIsActionable,
        restrictToRole: scopedSectionKey,
        // Start/Continue lands on the first unfinished question open now;
        // Review My Work (returnToResult) keeps the question it asked for.
        isFinished: options?.returnToResult
          ? null
          : (index) => ['correct', 'expired'].includes(normalizeQuestionRecord(tracker?.[assignmentId]?.[index]).status),
      });
      if (actionableIndex === null && user?.role === 'student' && !scopedSectionKey) {
        // No dead end: with nothing open this minute, show the assignment's
        // result page — its sections, what opens when, and what to do next.
        openStudentAssignmentResult(assignmentId, { origin: 'assignments' });
        return;
      }
      if (actionableIndex === null) {
        toastInfo(
          scopedSectionKey ? 'This section is not open right now' : 'Nothing open right now',
          scopedSectionKey
            ? 'This section is currently locked or outside its class window.'
            : 'There is no student-actionable section in this assignment right now.',
        );
        return;
      }
      safeQuestionIndex = actionableIndex;
    }
    setActiveClassroomSectionKey(scopedSectionKey);
    // When Practice/Review was launched from Assignment Result, preserve that
    // route so the visible in-app Back control returns to the result instead of
    // skipping straight to the dashboard. Grade Center launches do not set this
    // flag and keep their existing Grades -> Practice -> Grades behavior.
    if (!options?.returnToResult) setAssignmentResultRoute(null);
    setActiveAssignmentId(assignmentId);
    setCurrentQuestionIndex(safeQuestionIndex);
    setAssignmentNavigationCollapsed(false);
    setAssignmentOverviewExpanded(false);
    lastActivityRef.current = Date.now();
    pendingAssignmentSecondsRef.current = 0;
    liveSessionActiveSecondsRef.current = { assignmentId, seconds: 0 };
    liveSessionAttemptBaselineRef.current = {
      assignmentId,
      totalAttemptsByIndex: Object.fromEntries(
        includedQuestionIndices.map((index) => [
          index,
          Number(normalizeQuestionRecord(tracker?.[assignmentId]?.[index]).totalAttempts) || 0,
        ]),
      ),
    };
    liveFocusLossRef.current = { assignmentId, count: 0, hiddenAt: null };
    setIsIdle(false);

    if (lifecycle.isPracticeOnly) {
      setPracticeTracker((current) => ({
        ...current,
        [assignmentId]: current[assignmentId] || createPracticeAssignmentTracker(
          assignmentQuestions,
          tracker[assignmentId] || {},
        ),
      }));
      pendingAssignmentSecondsRef.current = 0;
    } else if (!tracker[assignmentId]) {
      setTracker((current) => ({
        ...current,
        [assignmentId]: createEmptyAssignmentTracker(assignmentQuestions),
      }));
    }

    setActiveView('assignment');
  };

  /*
   * STUDENT NAVIGATION.
   *
   * Five destinations plus the assignment result, each one browser entry, so
   * Back walks Practice -> Result -> Assignments (or Grades) -> Home instead of
   * leaving MathMaster. `studentBrowserRoute` turns these state changes into
   * history entries; these helpers only have to leave the state unambiguous.
   */
  // Every student destination leaves the app in the same shape: no result
  // route, no active assignment, no Path launch left over from somewhere else.
  // Written once so a new destination cannot forget one of them.
  const openStudentDashboardMode = (mode) => {
    setAssignmentResultRoute(null);
    setActiveClassroomSectionKey(null);
    setActiveAssignmentId(null);
    if (mode !== 'mathPath') setPathLaunchTeks(null);
    if (mode !== 'testCycle') setActiveTestCycleAssignmentId(null);
    setStudentDashboardMode(mode);
    setActiveView('dashboard');
  };

  const openStudentGradeCenter = () => openStudentDashboardMode('grades');
  const openStudentAssignmentsCenter = () => openStudentDashboardMode('assignmentsCenter');

  /**
   * The one place a student destination turns into app state.
   *
   * StudentGlobalNav hands back a destination name; everything else about
   * getting there is here, so Home, Assignments, Grades and My Math Path cannot
   * disagree about what "Grades" means.
   */
  const navigateStudent = (destination) => {
    if (destination === STUDENT_DESTINATION.ASSIGNMENTS) return openStudentAssignmentsCenter();
    if (destination === STUDENT_DESTINATION.GRADES) return openStudentGradeCenter();
    if (destination === STUDENT_DESTINATION.REWARDS) return openStudentDashboardMode('rewards');
    if (destination === STUDENT_DESTINATION.MATH_PATH) return openStudentDashboardMode('mathPath');
    if (destination === STUDENT_DESTINATION.SECURE_EXAMS) return openStudentDashboardMode('secureExams');
    return openStudentDashboardMode('assignments');
  };

  const openStudentAssignmentResult = (assignmentId, options = {}) => {
    const id = String(assignmentId || '').trim();
    if (!id) return;
    const sectionKey = String(options.sectionKey || '').trim().toLowerCase() || 'whole';
    setAssignmentResultRoute({
      assignmentId: id,
      sectionKey,
      sectionLabel: options.sectionLabel || null,
      questionIndex: Number(options.questionIndex) || 0,
      // Which list sent the student here, so the visible Back control returns
      // to that list rather than guessing. Browser Back already does the right
      // thing; this is what keeps the on-screen control agreeing with it.
      origin: options.origin === 'grades' ? 'grades' : 'assignments',
    });
    setActiveClassroomSectionKey(sectionKey === 'whole' ? null : sectionKey);
    setActiveAssignmentId(id);
    setActiveView('assignmentResult');
  };

  // Starting a Recovery is the server's decision: it re-checks eligibility,
  // builds the fresh questions and pins them before anything is shown.
  const startStudentRecovery = async (assignmentId, section) => {
    if (!assignmentId || recoveryBusySection) return;
    setRecoveryBusySection(section);
    try {
      const result = await startSectionRecovery({ assignmentId, section });
      if (result?.record) mergeSectionRecoveryRecord(assignmentId, section, result.record);
      setRecoverySession({ assignmentId, section, mode: 'assessment' });
    } catch (error) {
      const code = recoveryErrorCode(error);
      toastWarning(
        'Recovery not started',
        code === 'recovery-locked'
          ? 'More Practice is needed before this Recovery unlocks.'
          : code === 'recovery-window-ended'
            ? 'The final submission date has passed, so Recovery is closed.'
            : 'A fresh Recovery could not be prepared right now. Try again in a moment.',
      );
    } finally {
      setRecoveryBusySection(null);
    }
  };

  const startTeacherPreview = (assignmentId, { lessonRuntime = false } = {}) => {
    const assignmentData = assignments.find(
      (assignment) => assignment.id === assignmentId,
    );
    // A Test Cycle is not a lesson. "View as Student" opens the student's own
    // card at every stage and the real secure Test items; the lesson runtime is
    // used only when that preview asks for it, to play the Review.
    if (!lessonRuntime && isTestCycleAssignment(assignmentData)) {
      setTestCyclePreviewAssignment(assignmentData);
      return;
    }
    const assignmentQuestions = getStoredAssignmentQuestions(assignmentData);
    if (!assignmentQuestions.length) return;

    // Preview trackers were already ephemeral, but question/tool drafts live in
    // localStorage. Clear that preview-only draft family too so "View as
    // Student" really begins at a blank first attempt every time.
    removeAssignmentDrafts({ studentId: 'teacher-preview', assignmentId });
    forgetAssignmentToolDrafts({ studentId: 'teacher-preview', assignmentId });
    setPreviewSessionId((current) => current + 1);
    setActiveAssignmentId(assignmentId);
    setCurrentQuestionIndex(getCurrentContentQuestionIndices(assignmentData)[0] ?? 0);
    setAssignmentNavigationCollapsed(false);
    setAssignmentOverviewExpanded(false);
    setPreviewTracker(createEmptyAssignmentTracker(assignmentQuestions));
    setPreviewScratchpads(EMPTY_SCRATCHPAD_CACHE);
    previewTrackerAssignmentIdRef.current = assignmentId;
    setActiveView('teacherPreview');
  };

  /*
   * LIVE TEACHING (Classroom Live, Phase 2).
   *
   * Teaching happens from the SAME preview runtime as "View as Student" — no
   * second renderer, no fake teacher-only responses, same preview isolation.
   * The only addition is a small, separate Live Teaching session record of
   * where the teacher's exemplar actually is, so the room's pace reference
   * can be the teacher's real position instead of a disconnected manual
   * counter. See platform/teacher/liveTeachingSession.js.
   */
  const teachAssignmentLive = async (assignmentId, { forceRestart = false, classId: requestedClassId = null } = {}) => {
    // The class the Live Classroom panel was showing when the teacher chose the
    // lesson. Home can show the class in session while App's activeClass is a
    // different one; teaching must never be filed under the wrong class.
    const classId = requestedClassId || activeClass?.classId || null;
    if (!classId || !assignmentId) return;
    const assignmentData = assignments.find((assignment) => assignment.id === assignmentId);
    if (!assignmentData) return;
    // Only live work for THIS class can be taught (assignmentAvailability.js) —
    // the same rule that decides what the panel offers.
    if (!walkthroughEligibility({ assignment: assignmentData, classId, nowValue: Date.now(), gradingPeriodSettings }).eligible) return;
    const startIndex = getCurrentContentQuestionIndices(assignmentData)[0] ?? 0;
    const startRole = resolveQuestionActivityRole({
      question: getStoredAssignmentQuestions(assignmentData)[startIndex],
      assignment: assignmentData,
    });
    const startFresh = () => {
      // Reuse the exact isolated student-preview runtime. This happens locally;
      // a slow/failed Firestore lookup must never block a teacher from teaching.
      // Live Teaching walks the lesson runtime, a Test Cycle's Review included;
      // the Test Cycle student preview is a different screen.
      startTeacherPreview(assignmentId, { lessonRuntime: true });
      setLiveTeachingSession(startLiveTeachingSession({
        classId,
        assignmentId,
        assignment: assignmentData,
        storageQuestionIndex: startIndex,
        activityRole: startRole,
        nowValue: Date.now(),
        teacherUid: user?.id || null,
        teacherEmail: user?.email || null,
        suggestedWorkSeconds: getStoredAssignmentQuestions(assignmentData)[startIndex]?.suggestedWorkSeconds,
      }));
    };

    if (forceRestart) {
      startFresh();
      return;
    }

    const sessionId = walkthroughSessionId({ teacherUid: user?.id || user?.email, classId, assignmentId });
    try {
      // Resume is a convenience, never a launch dependency. Give Firestore a
      // very small budget to return an already-active session; after that we
      // start locally so classroom instruction is not held hostage by network.
      const lookup = await Promise.race([
        getDoc(doc(db, 'walkthroughSessions', sessionId)),
        new Promise((resolve) => window.setTimeout(() => resolve(null), 180)),
      ]);
      const saved = lookup?.exists() ? lookup.data() : null;
      const savedCheck = saved ? validatePersistedWalkthroughSession({
        session: saved,
        classId,
        assignmentId,
        teacherUid: user?.id || null,
        assignments,
        nowValue: Date.now(),
        gradingPeriodSettings,
      }) : null;
      if (saved?.active && !savedCheck?.valid) {
        // A saved session this class can no longer use is retired, not
        // restored; the teacher gets a fresh start below.
        setDoc(doc(db, 'walkthroughSessions', sessionId), { ...saved, active: false, updatedAt: Date.now() })
          .catch((error) => console.warn('Could not retire a stale Walkthrough session:', error));
      }
      if (savedCheck?.valid) {
        const resumed = saved;
        walkthroughWriteRef.current = Number(resumed.updatedAt) || 0;
        setLiveTeachingSession(resumed);
        setActiveAssignmentId(assignmentId);
        setCurrentQuestionIndex(Math.max(0, Number(resumed.storageQuestionIndex) || 0));
        setAssignmentNavigationCollapsed(false);
        setAssignmentOverviewExpanded(false);
        setActiveView('teacherPreview');
        return;
      }
    } catch (error) {
      console.warn('Walkthrough resume lookup unavailable; starting fresh:', error);
    }

    startFresh();
  };

  // Re-enters the exemplar at the teacher's last real position without
  // resetting previewTracker/previewScratchpads/previewSessionId, which are
  // untouched by simply switching activeView away and back.
  const resumeLiveTeaching = () => {
    if (!liveTeachingSession?.active || !liveTeachingSession.assignmentId) return;
    const assignmentData = assignments.find((assignment) => assignment.id === liveTeachingSession.assignmentId);
    if (!assignmentData) return;
    setActiveAssignmentId(liveTeachingSession.assignmentId);
    setCurrentQuestionIndex(liveTeachingSession.storageQuestionIndex);
    setAssignmentNavigationCollapsed(false);
    setAssignmentOverviewExpanded(false);
    setActiveView('teacherPreview');
  };

  /*
   * BROWSER BACK AND FORWARD FOR THE TEACHER.
   *
   * The teacher workspace is state-driven, like the student side, so without
   * History API entries the browser treats every teacher screen as one page and
   * a single Back press leaves MathMaster — the classic way to lose the room
   * mid-lesson. Each screen (a sidebar tab, an Administration tab, the "View as
   * Student" / Live Teaching preview) and each panel opened over a screen (an
   * assignment's hub, a student's drawer, case review, support report, the Test
   * Cycle preview) gets its own entry. The rules live in
   * platform/teacher/teacherBrowserHistory.js.
   *
   * The arrival entry is marked as where the teacher started. Back from there
   * still leaves the site — that is the browser's, not MathMaster's, to take.
   */
  const teacherBrowserRoute = useMemo(() => {
    if (user?.role !== 'teacher') return null;
    if (activeView === 'teacherPreview') {
      return { surface: 'preview', assignmentId: activeAssignmentId || '', questionIndex: currentQuestionIndex };
    }
    const administrationVisible = teacherWorkspaceMode === 'administration'
      && (user.isRootAdmin === true || isRootAdminEmail(user.email));
    if (administrationVisible) return { surface: 'administration', adminTab };
    return {
      surface: 'workspace',
      tab: teacherTab,
      panels: {
        hubAssignmentId: assignmentHubTarget?.assignmentId,
        hubClassId: assignmentHubTarget?.classId,
        studentId: profileDrawerStudentId,
        caseReviewStudentId,
        supportReportStudentId,
        testCyclePreviewAssignmentId: testCyclePreviewAssignment?.id,
      },
    };
  }, [
    user?.role, user?.isRootAdmin, user?.email, activeView, activeAssignmentId, currentQuestionIndex,
    teacherWorkspaceMode, adminTab, teacherTab, assignmentHubTarget, profileDrawerStudentId,
    caseReviewStudentId, supportReportStudentId, testCyclePreviewAssignment?.id,
  ]);

  useEffect(() => {
    if (!teacherBrowserRoute) {
      teacherBrowserHistoryReadyRef.current = false;
      return;
    }
    // The entry the teacher arrived on (sign-in, a reload, a bookmark) becomes
    // this screen. Later screens are pushed after it.
    if (!teacherBrowserHistoryReadyRef.current) {
      teacherBrowserHistoryReadyRef.current = true;
      writeTeacherRouteState(teacherBrowserRoute, { replace: true, documentId: TEACHER_HISTORY_DOCUMENT_ID });
      return;
    }

    // A step back is in flight: the browser is about to land on the entry this
    // screen already matches, and its popstate clears the mark.
    if (Date.now() - teacherHistoryStepBackAtRef.current < 1000) return;

    const plan = planTeacherHistoryWrite({
      entry: readTeacherHistoryEntry(window.history.state),
      target: teacherBrowserRoute,
      documentId: TEACHER_HISTORY_DOCUMENT_ID,
    });
    if (plan.action === 'back') {
      teacherHistoryStepBackAtRef.current = Date.now();
      window.history.back();
      return;
    }
    if (plan.action === 'replace' || plan.action === 'push') {
      writeTeacherRouteState(teacherBrowserRoute, {
        replace: plan.action === 'replace',
        fromKey: plan.fromKey,
        documentId: plan.documentId,
      });
    }
  }, [teacherBrowserRoute]);

  // A dialog that can hold work or a decision. Back never acts underneath one:
  // the page it would reveal is not the page the dialog belongs to, and an
  // editor's unsaved changes are not something Back should be able to discard.
  // These render only over the teacher workspace, so only there do they block.
  const teacherDialogOpen = teacherBrowserRoute?.surface === 'workspace' && Boolean(
    questionEditorAssignment || contentUpgradeRequest || assignmentPreflight || deleteDialog
    || classroomSyncProposal || teacherWorksheetDialog || exportJsonAssignment
    || teacherScratchpadDialog || responseInspectorTarget,
  );

  // Re-assigned every render so the listener below always restores with the
  // newest assignments and Live Teaching session, without re-subscribing.
  teacherHistoryRestoreRef.current = (event) => {
    const ownStepBack = Date.now() - teacherHistoryStepBackAtRef.current < 1000;
    teacherHistoryStepBackAtRef.current = 0;
    const entry = readTeacherHistoryEntry(event.state);
    if (!entry) return;
    const route = entry.route;

    // The popstate from closing a panel: the screen already shows this entry
    // (that is why App stepped back to it). Nothing to restore — and a dialog
    // opened by the same click (the hub's "Edit questions") must not read it
    // as the teacher pressing Back.
    if (ownStepBack) {
      if (teacherBrowserRoute && teacherRouteSignature(route) !== teacherRouteSignature(teacherBrowserRoute)) {
        writeTeacherRouteState(teacherBrowserRoute, { replace: true, fromKey: entry.fromKey, documentId: entry.documentId });
      }
      return;
    }

    if (teacherDialogOpen) {
      // The browser has already moved; put this screen's entry back and stay.
      if (teacherBrowserRoute) {
        writeTeacherRouteState(teacherBrowserRoute, { fromKey: teacherRouteKey(route), documentId: TEACHER_HISTORY_DOCUMENT_ID });
      }
      toastInfo('Close the open window first', 'Save or close what is open, then use Back. Nothing was changed.');
      return;
    }

    setQuickSearchOpen(false);

    if (route.surface === 'preview') {
      const assignmentData = assignments.find((assignment) => String(assignment.id) === route.assignmentId);
      const isLiveLesson = liveTeachingSession?.active && String(liveTeachingSession.assignmentId) === route.assignmentId;
      if (assignmentData && isLiveLesson) {
        resumeLiveTeaching();
        return;
      }
      if (assignmentData && previewTrackerAssignmentIdRef.current === route.assignmentId) {
        // The preview's in-memory work is still this assignment's: step back
        // into it where the teacher left it.
        setActiveAssignmentId(assignmentData.id);
        setCurrentQuestionIndex(route.questionIndex);
        setActiveView('teacherPreview');
        return;
      }
      if (assignmentData && getStoredAssignmentQuestions(assignmentData).length) {
        // Preview is in-memory and always starts blank; another preview has
        // run since, so this one starts again from the top.
        startTeacherPreview(assignmentData.id, { lessonRuntime: true });
        return;
      }
      // The assignment is gone. Stay on the current screen and make this entry
      // say so, rather than leave Back pointing at a preview that cannot open.
      if (teacherBrowserRoute) {
        writeTeacherRouteState(teacherBrowserRoute, { replace: true, fromKey: entry.fromKey, documentId: entry.documentId });
      }
      return;
    }

    // Leaving the preview by Back is the same as its own exit button: the
    // Live Teaching session stays running, with Resume on Live Classroom.
    if (activeView === 'teacherPreview') setActiveAssignmentId(null);
    setActiveView('dashboard');

    if (route.surface === 'administration') {
      setTeacherWorkspaceMode('administration');
      setAdminTab(route.adminTab);
      return;
    }

    setTeacherWorkspaceMode('teacher');
    if (route.tab !== teacherTab) {
      setTeacherTab(route.tab);
      // The same one-shot hand-offs the sidebar clears on a tab change. The
      // Gradebook's class and assignment are left alone: Back into Grades
      // should show the assignment the teacher was reading.
      setHomeNavigationPeriod(null);
      setLiveFocus(null);
    }
    const { panels } = route;
    setAssignmentHubTarget((current) => {
      if (!panels.hubAssignmentId) return null;
      return current?.assignmentId === panels.hubAssignmentId
        ? current
        : { assignmentId: panels.hubAssignmentId, classId: panels.hubClassId || null };
    });
    setProfileDrawerStudentId(panels.studentId || null);
    setCaseReviewStudentId(panels.caseReviewStudentId || null);
    setSupportReportStudentId(panels.supportReportStudentId || null);
    setTestCyclePreviewAssignment((current) => {
      if (!panels.testCyclePreviewAssignmentId) return null;
      if (current?.id === panels.testCyclePreviewAssignmentId) return current;
      return assignments.find((assignment) => String(assignment.id) === panels.testCyclePreviewAssignmentId) || null;
    });
  };

  useEffect(() => {
    if (user?.role !== 'teacher') return undefined;
    const restoreTeacherFromBrowserHistory = (event) => teacherHistoryRestoreRef.current?.(event);
    window.addEventListener('popstate', restoreTeacherFromBrowserHistory);
    return () => window.removeEventListener('popstate', restoreTeacherFromBrowserHistory);
  }, [user?.role]);

  const endLiveTeaching = () => {
    if (liveTeachingSession?.sessionId) {
      setDoc(doc(db, 'walkthroughSessions', liveTeachingSession.sessionId), {
        ...liveTeachingSession, active: false, updatedAt: Date.now(),
      }).catch((error) => console.error('Could not end Walkthrough:', error));
    }
    setLiveTeachingSession(endLiveTeachingSession());
  };

  const controlWalkthroughTimer = (action, durationSeconds) => {
    setLiveTeachingSession((session) => session ? {
      ...session,
      timer: updateWalkthroughTimer(session.timer, action, { nowValue: Date.now(), durationSeconds }),
      updatedAt: Date.now(),
    } : session);
  };

  useEffect(() => {
    if (liveTeachingSession?.timer?.status !== 'running') return undefined;
    const remaining = walkthroughTimerRemaining(liveTeachingSession.timer, Date.now());
    const timeout = window.setTimeout(() => {
      setLiveTeachingSession((session) => session ? {
        ...session,
        timer: updateWalkthroughTimer(session.timer, 'tick', { nowValue: Date.now() }),
        projectorState: { ...session.projectorState, showReview: true },
        updatedAt: Date.now(),
      } : session);
      // Audio is best-effort; the synchronized visual expired state remains.
      try {
        const audio = new window.AudioContext();
        const oscillator = audio.createOscillator();
        oscillator.connect(audio.destination);
        // A running AudioContext is never garbage collected: one per expired
        // timer stayed open (and counts against the browser's limit) all day.
        oscillator.onended = () => { audio.close?.().catch?.(() => {}); };
        oscillator.start();
        oscillator.stop(audio.currentTime + 0.35);
      } catch { /* autoplay may be blocked */ }
    }, Math.max(0, remaining * 1000) + 50);
    return () => window.clearTimeout(timeout);
  }, [liveTeachingSession?.timer]);

  const getScratchpadDocumentId = (assignmentId, questionIndex) =>
    `${assignmentId}__question_${questionIndex}`;

  // How many pages the store held when this scratchpad was last read. Saving
  // needs it to know which page documents the student has since dropped.
  const loadedScratchpadPageCounts = useRef({});

  // Every page after the first lives in its own document, because a page is a
  // 700KB flattened image and a Firestore document caps at 1MiB. Page one keeps
  // the id it has always had, so scratchpads already saved in production load
  // unchanged and the teacher review dialog keeps working against them.
  const loadScratchpadRecord = async (readPage, baseId) => {
    const first = await readPage(scratchpadPageDocId(baseId, 0));
    if (!first) {
      loadedScratchpadPageCounts.current[baseId] = 0;
      return null;
    }
    const count = scratchpadPageCount(first);
    loadedScratchpadPageCounts.current[baseId] = count;
    const later = [];
    for (let index = 1; index < count; index += 1) {
      // Sequential: a scratchpad holds at most four pages, and a partial read
      // is handled by normalizeScratchpadPages rather than by failing the open.
      later.push(await readPage(scratchpadPageDocId(baseId, index)));
    }
    return { ...first, pages: normalizeScratchpadPages(first, later) };
  };

  const handleLoadScratchpad = async () => {
    if (!activeAssignmentId) return null;
    const scratchpadId = getScratchpadDocumentId(
      activeAssignmentId,
      currentQuestionIndex,
    );
    const scratchpadAssignment = assignments.find(
      (assignment) => assignment.id === activeAssignmentId,
    );

    // Opening a kept scratchpad is a use of it: it moves to the back of the
    // eviction queue, so the work a student just looked at is not the next to go.
    if (isTeacherPreview) {
      setPreviewScratchpads((current) => touchCachedScratchpad(current, scratchpadId));
      return loadScratchpadRecord(async (id) => readCachedScratchpadPage(previewScratchpads, scratchpadId, id), scratchpadId);
    }

    if (getAssignmentLifecycle(scratchpadAssignment, Date.now(), {
      studentId: user?.role === 'student' ? user.id : undefined,
    }).isPracticeOnly) {
      setPracticeScratchpads((current) => touchCachedScratchpad(current, scratchpadId));
      return loadScratchpadRecord(async (id) => readCachedScratchpadPage(practiceScratchpads, scratchpadId, id), scratchpadId);
    }

    if (user?.role !== 'student') return null;
    try {
      return await loadScratchpadRecord(async (id) => {
        const snapshot = await getDoc(doc(db, 'grades', user.id, 'scratchpads', id));
        return snapshot.exists() ? snapshot.data() : null;
      }, scratchpadId);
    } catch (error) {
      console.error('Could not load the student scratchpad:', error);
      return null;
    }
  };

  const handleSaveScratchpad = async (pages, metadata = {}) => {
    const pageList = (Array.isArray(pages) ? pages : [pages]).filter(Boolean);
    const dataUrl = pageList[0] || '';
    if (!activeAssignmentId || !dataUrl) return;
    const scratchpadId = getScratchpadDocumentId(
      activeAssignmentId,
      currentQuestionIndex,
    );
    const scratchpadAssignment = assignments.find(
      (assignment) => assignment.id === activeAssignmentId,
    );
    const practiceOnly = getAssignmentLifecycle(scratchpadAssignment, Date.now(), {
      studentId: user?.role === 'student' ? user.id : undefined,
    }).isPracticeOnly;
    const currentScratchpadTracker = isTeacherPreview
      ? previewTracker
      : practiceOnly
        ? practiceTracker[activeAssignmentId] || {}
        : tracker[activeAssignmentId] || {};
    const compactRecord = {
      dataUrl,
      assignmentId: activeAssignmentId,
      questionIndex: currentQuestionIndex,
      variantIndex: normalizeQuestionRecord(
        currentScratchpadTracker?.[currentQuestionIndex],
      ).variantIndex,
      updatedAt: new Date().toISOString(),
      metadata: {
        width: Number(metadata.width) || 0,
        height: Number(metadata.height) || 0,
        mimeType: String(
          metadata.mimeType || dataUrl.slice(5, dataUrl.indexOf(';')) || 'image/webp',
        ),
        byteLength:
          Number(metadata.byteLength ?? metadata.byteEstimate) || dataUrl.length,
      },
    };

    // A page the student removed has to be deleted, not merely left unwritten:
    // an orphaned document reappears as a page on the next load, which reads as
    // the platform resurrecting work they deliberately dropped.
    const previousPageCount = Math.max(
      Number(loadedScratchpadPageCounts.current[scratchpadId]) || 0,
      scratchpadPageCount(
        isTeacherPreview
          ? readCachedScratchpadPage(previewScratchpads, scratchpadId)
          : practiceOnly ? readCachedScratchpadPage(practiceScratchpads, scratchpadId) : null,
      ),
    );
    const { writes, deletes } = buildScratchpadWrites({
      baseId: scratchpadId,
      pages: pageList,
      metadata: { ...compactRecord, dataUrl: undefined },
      previousPageCount,
    });
    loadedScratchpadPageCounts.current[scratchpadId] = pageList.length;

    // In memory only, and within budget: the least recently used scratchpads
    // beyond it are dropped whole, never this one — it is the question on screen.
    if (isTeacherPreview) {
      setPreviewScratchpads((current) => storeCachedScratchpad(current, { baseId: scratchpadId, writes, deletes }));
      return;
    }

    if (practiceOnly) {
      setPracticeScratchpads((current) => storeCachedScratchpad(current, { baseId: scratchpadId, writes, deletes }));
      return;
    }

    if (user?.role !== 'student') return;
    try {
      await Promise.all(writes.map((entry) => setDoc(
        doc(db, 'grades', user.id, 'scratchpads', entry.docId),
        entry.data,
      )));
      // A page that will not delete is a stale extra page, not lost work, so it
      // must never fail the save the student is waiting on.
      await Promise.all(deletes.map((id) => deleteDoc(
        doc(db, 'grades', user.id, 'scratchpads', id),
      ).catch(() => {})));
    } catch (error) {
      console.error('Could not save the student scratchpad:', error);
      throw error;
    }
  };

  const openTeacherScratchpad = async (studentId, assignmentId, questionIndex) => {
    const scratchpadId = getScratchpadDocumentId(assignmentId, questionIndex);
    setTeacherScratchpadLoading(true);
    setTeacherScratchpadDialog({
      studentId,
      assignmentId,
      questionIndex,
      dataUrl: '',
      missing: false,
    });
    try {
      // A teacher reviewing three pages of working must see three pages. Reading
      // only page one would show the first third of a solution and silently call
      // it the whole answer.
      const record = await loadScratchpadRecord(async (id) => {
        const snapshot = await getDoc(doc(db, 'grades', studentId, 'scratchpads', id));
        return snapshot.exists() ? snapshot.data() : null;
      }, scratchpadId);
      const pages = (record?.pages || []).filter(Boolean);
      setTeacherScratchpadDialog({
        studentId,
        assignmentId,
        questionIndex,
        dataUrl: pages[0] || '',
        pages,
        missing: !pages.length,
      });
    } catch (error) {
      console.error('Could not load student work:', error);
      setTeacherScratchpadDialog({
        studentId,
        assignmentId,
        questionIndex,
        dataUrl: '',
        missing: true,
        error: error.message,
      });
    } finally {
      setTeacherScratchpadLoading(false);
    }
  };

  /*
   * A RESPONSE CHECKPOINT IS A DRAFT, NOT A GRADE.
   *
   * It carries the student's raw response and the identity needed to find the
   * authoritative question — and deliberately nothing else. Correctness, score,
   * partial credit, the canonical record and the evidence event are all
   * derived by the SERVER at finalization from the stored assignment, because
   * this document is student-writable and an Admin SDK function reads it.
   * responseCheckpointSchema.mjs throws if any of that tries to cross.
   *
   * `finalizeAt` is a query hint so the scheduler knows roughly when to look.
   * The server re-derives the real close; a wrong hint here costs nothing.
   */
  const checkpointFingerprintRef = useRef(new Map());

  /*
   * PIN WHAT WAS SHOWN, AND SEND THE PIN WITH THE WORK.
   *
   * QuestionEngine reports the delivery of a family-backed question the moment
   * it renders. It is pinned on this device at once (so a reload shows the same
   * numbers before anything reaches the server) and remembered here so every
   * submission for that slot and variant carries it. The server stores it on
   * the question record, after which every device reads the canonical pin and
   * the server can re-create — and grade — exactly this question.
   */
  const familyDeliveriesRef = useRef(new Map());
  const handleFamilyDelivery = useCallback((delivery, renderedQuestion) => {
    if (!delivery?.slot || user?.role !== 'student' || !user?.id || isTeacherPreview) return;
    writeLocalDeliveryPin({ studentId: user.id, delivery });
    familyDeliveriesRef.current.set(`${delivery.slot}|v${delivery.variant}`, { delivery, question: renderedQuestion || null });
  }, [user?.role, user?.id, isTeacherPreview]);

  /** The pin (and rendered question) for a family-backed slot, or null. */
  const familyDeliveryForQuestion = (assignment, questionIndex, record) => {
    const storedQuestion = getStoredAssignmentQuestions(assignment)[questionIndex];
    if (!assignment?.id || !isFamilyBackedQuestion(storedQuestion)) return null;
    const variant = normalizeQuestionRecord(record).variantIndex;
    const slotKey = familySlotKey({ assignmentId: assignment.id, question: storedQuestion, storageIndex: questionIndex });
    const remembered = familyDeliveriesRef.current.get(`${slotKey}|v${variant}`);
    const pin = normalizeDeliveryPin(remembered?.delivery)
      || readLocalDeliveryPin({ studentId: user?.id, slotKey, variant })
      || (normalizeDeliveryPin(record?.familyDelivery)?.variant === variant ? normalizeDeliveryPin(record.familyDelivery) : null);
    return pin ? { pin, renderedQuestion: remembered?.question || null } : null;
  };

  const handleResponseCheckpoint = useCallback(async (answerState) => {
    lastAcademicInteractionRef.current = Date.now();
    if (!activeAssignmentId || user?.role !== 'student' || isTeacherPreview || !answerState) return;
    const assignment = assignments.find((item) => item.id === activeAssignmentId);
    if (!assignment || isTestCycleAssignment(assignment)) return;
    // Eligibility is judged against the question the SERVER will grade: the
    // stored question, or — for a Question Family slot — the instance the
    // server will rebuild from this delivery pin. A family template itself is
    // never graded, so without the pin a family question could not be
    // finalized at a deadline at all.
    const storedQuestion = getStoredAssignmentQuestions(assignment)[currentQuestionIndex];
    const currentRecord = normalizeQuestionRecord(tracker?.[activeAssignmentId]?.[currentQuestionIndex]);
    const familyDelivery = familyDeliveryForQuestion(assignment, currentQuestionIndex, currentRecord);
    if (isFamilyBackedQuestion(storedQuestion) && !(familyDelivery?.pin && familyDelivery?.renderedQuestion)) return;
    const gradingQuestion = familyDelivery?.renderedQuestion || storedQuestion;
    if (!checkpointEligibility({ question: gradingQuestion, activityRole: activeQuestionRole }).eligible) return;

    const identity = {
      studentId: user.id,
      assignmentId: activeAssignmentId,
      questionIndex: currentQuestionIndex,
      questionId: storedQuestion?.questionId || storedQuestion?.id || '',
      variantIndex: currentRecord.variantIndex,
      generationKey: `${activeAssignmentId}|${user.id}|${currentQuestionIndex}|variant:${currentRecord.variantIndex}`,
    };
    const documentId = checkpointDocumentId(identity);
    // Coalesce: a student re-reading their own answer should not queue a write
    // for a response that has not changed.
    const fingerprint = responseFingerprint(gradingQuestion, answerState);
    if (checkpointFingerprintRef.current.get(documentId) === fingerprint) return;

    const now = Date.now();
    const close = resolveAuthoritativeClose({
      assignment,
      activityRole: activeQuestionRole,
      schedule: classSchedule,
      classId: user.classId || null,
      classPeriod: user.classPeriod || null,
      nowValue: now,
      // The student's Chromebook is in the school's timezone; the server
      // re-resolves this with the school zone regardless.
      timeZone: null,
      // This student's own final cutoff (attendance extension, individualized
      // extra time), so the finalize hint is not earlier than the server's.
      studentId: user.id,
      studentProfile: user.profile || null,
    });
    try {
      setStudentPersistenceStatus('capturing');
      const queued = await enqueueResponseCheckpoint({
        identity,
        question: gradingQuestion,
        familyDelivery: familyDelivery?.pin || null,
        activityRole: activeQuestionRole,
        answerState,
        revision: now,
        finalizeAt: close.closesAtMs ? new Date(close.closesAtMs).toISOString() : null,
        finalizationReason: close.reason,
        finalizationContext: { classId: user.classId || null, classPeriod: user.classPeriod || null },
        previousTotalAttempts: currentRecord.totalAttempts,
        supportUsage: buildSupportUsage(user?.profile, storedQuestion),
        timeSpentSeconds: activeTimeRef.current,
        capturedAt: now,
      });
      if (!queued) return;
      checkpointFingerprintRef.current.set(documentId, fingerprint);
      setStudentOutboxDepth((depth) => depth + 1);
      setStudentPersistenceStatus('queued');
      // Reconciliation happens in the background. The student keeps working.
      void drainStudentOutbox();
    } catch (error) {
      console.error('Response checkpoint remains local:', error);
      setStudentPersistenceStatus('volatile');
    }
  }, [activeAssignmentId, user, isTeacherPreview, assignments, currentQuestionIndex, tracker, classSchedule, activeQuestionRole]);

  const handleGradeSubmit = async (isCorrect, specificQuestionData, parts = [], supportUsage = null, responseKey = '', attemptMetadata = {}) => {
    if (!activeAssignmentId) return null;
    if (!isTeacherPreview) lastAcademicInteractionRef.current = Date.now();

    const localAssignment = assignments.find((item) => item.id === activeAssignmentId);
    const teacherGrantedExtraAttempts = resolveTeacherGrantedExtraAttempts({
      assignment: localAssignment,
      activityRole: activeQuestionRole,
      classId: user?.classId || null,
      studentId: user?.role === 'student' ? user.id : null,
    });
    const applyAttempt = (record) =>
      recordQuestionAttempt({
        record,
        isCorrect,
        questionDetails: specificQuestionData,
        timeSpent: activeTimeRef.current,
        parts,
        supportUsage,
        responseKey,
        partialCreditPercent: attemptMetadata.partialCreditPercent,
        maximumAttempts: resolveQuestionMaximumAttempts({
          question: activeQuestions[currentQuestionIndex],
          maximumAttempts: activeActivityPolicy.attempts,
          activityPolicy: activeActivityPolicy,
          teacherGrantedExtraAttempts,
        }),
      });

    if (isTeacherPreview) {
      const outcome = applyAttempt(previewTracker[currentQuestionIndex]);
      setPreviewTracker((current) => ({
        ...current,
        [currentQuestionIndex]: outcome.record,
      }));
      return outcome.result;
    }

    if (user?.role !== 'student') return null;

    const submissionCapturedAt = Date.now();
    const timedSectionAccess = captureTimedSectionAccess({
      activityRole: activeQuestionRole,
      assignment: localAssignment,
      schedule: classSchedule,
      classId: user.classId || null,
      classPeriod: user.classPeriod,
      capturedAt: submissionCapturedAt,
    });
    const teacherReopenedWarmupIsActive = activeQuestionRole === 'warmup'
      && warmupCaptureWasActive(timedSectionAccess, submissionCapturedAt)
      && timedSectionAccess?.teacherTimerScheduled === true;
    if (getAssignmentLifecycle(localAssignment, submissionCapturedAt, { studentId: user.id }).isPracticeOnly && !teacherReopenedWarmupIsActive) {
      const currentPractice = practiceTracker[activeAssignmentId]
        || createPracticeAssignmentTracker(getStoredAssignmentQuestions(localAssignment), tracker[activeAssignmentId] || {});
      const outcome = applyAttempt(currentPractice[currentQuestionIndex]);
      setPracticeTracker((current) => ({
        ...current,
        [activeAssignmentId]: {
          ...(current[activeAssignmentId] || currentPractice),
          [currentQuestionIndex]: outcome.record,
        },
      }));
      return outcome.result;
    }

    // The subscribed assignment is the authorization snapshot for the local
    // interaction. Revalidate it before persistence below, but do not make a
    // student's click wait for an otherwise redundant getDoc roundtrip.
    const assignment = localAssignment;
    const gradingSpan = startPerformanceSpan('grading_ms', { flow: 'ordinary_assignment' });
    const currentAssignmentGrades = tracker[activeAssignmentId] || {};
    const outcome = applyAttempt(currentAssignmentGrades[currentQuestionIndex]);
    gradingSpan.finish({ status: 'graded' });
    const updatedTracker = {
      ...tracker,
      [activeAssignmentId]: {
        ...currentAssignmentGrades,
        [currentQuestionIndex]: outcome.record,
      },
    };

    const previousSupport = supportUsageByAssignment[activeAssignmentId] || { modified: false, accommodations: [], modifications: [] };
    const updatedSupportUsage = {
      ...supportUsageByAssignment,
      [activeAssignmentId]: {
        modified: Boolean(previousSupport.modified || supportUsage?.modified),
        accommodations: [...new Set([...(previousSupport.accommodations || []), ...(supportUsage?.accommodations || [])])],
        modifications: [...new Set([...(previousSupport.modifications || []), ...(supportUsage?.modifications || [])])],
      },
    };

    /*
     * NO CLASSWORK COMPLETION IS COMPUTED HERE.
     *
     * `updatedTracker` is the local overlay and this attempt is not canonical
     * yet — it is about to be queued. Deriving completion from it and carrying
     * it forward would be the browser asserting a projection the gradebook
     * cannot support. Server ingestion derives it from canonical records in
     * the same transaction that records this attempt.
     */
    let updatedDOLGrades = dolGradesByAssignment;
    const dolState = getDOLState({ assignment, schedule: classSchedule, classId: user.classId || null, classPeriod: user.classPeriod, nowValue: Date.now() });
    if (activeQuestionRole === 'dol' && dolState.status === 'active' && (dolState.questionIndices || [dolState.questionIndex]).includes(currentQuestionIndex)) {
      const date = new Date();
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const dolOmitted = new Set(studentRequiredFor(assignment, { assignmentTracker: updatedTracker?.[activeAssignmentId] || null }).omitted);
      const studentDolIndices = (dolState.questionIndices || [dolState.questionIndex]).filter((index) => !dolOmitted.has(index));
      updatedDOLGrades = {
        ...dolGradesByAssignment,
        [activeAssignmentId]: {
          ...(dolGradesByAssignment?.[activeAssignmentId] || {}),
          [dateKey]: {
            finalized: false,
            score: calculateDOLSectionScore(
              projectTeacherOverridesForDisplay(
                updatedTracker,
                teacherGradeOverridesByAssignment,
              )[activeAssignmentId] || {},
              studentDolIndices,
              assignment,
            ),
            questionIndex: studentDolIndices[0] ?? currentQuestionIndex,
            questionIndices: studentDolIndices,
            recordedAt: new Date().toISOString(),
            status: 'section-in-progress',
          },
        },
      };
    }

    const assignmentQuestions = getStoredAssignmentQuestions(assignment);
    const evidenceEvent = assignmentQuestions[currentQuestionIndex]?.type === 'modelingLab'
      ? null
      : buildAttemptEvidenceEvent({
        studentId: user.id,
        assignment,
        question: assignmentQuestions[currentQuestionIndex],
        questionIndex: currentQuestionIndex,
        activityRole: activeQuestionRole,
        attemptRecord: outcome.record,
        attemptResult: outcome.result,
        supportUsage: outcome.record.supportUsage || supportUsage || {},
        delivered: resolveDeliveredQuestionMetadata({
          question: assignmentQuestions[currentQuestionIndex],
          learningProfile: studentLearningProfile,
          activityRole: activeQuestionRole,
          variationMode: getSectionVariantMode(assignment, activeQuestionRole),
          honors: String(user?.profile?.courseLevel || '').toLowerCase() === 'honors',
        }),
      });
    const capturedSectionAccess = captureSectionAccessProof({
      sectionAccess: getSectionAccessState({
        assignment,
        activityRole: activeQuestionRole,
        classId: user.classId || null,
        classPeriod: user.classPeriod,
        nowValue: submissionCapturedAt,
        studentId: user.id,
      }),
      capturedAt: submissionCapturedAt,
    });
    // Built from the student's own parts and response key through the SHARED
    // contract, so what the server re-grades is exactly what the browser saw.
    // A family-backed slot is answered against ITS rendered instance (type and
    // fields), and its delivery pin travels with the attempt so the server can
    // re-create exactly this question.
    const familyDelivery = familyDeliveryForQuestion(assignment, currentQuestionIndex, currentAssignmentGrades[currentQuestionIndex]);
    const capturedResponse = normalizeCheckpointResponse(
      familyDelivery?.renderedQuestion || assignmentQuestions[currentQuestionIndex],
      // A registry tool's structured raw work (built through the shared tool
      // response contract by QuestionEngine) travels as itself; the server
      // grades it with the same shared grader the browser just used.
      { parts, responseKey, isComplete: true, toolResponse: attemptMetadata?.toolResponse || null },
    );

    let queuedAction;
    try {
      setStudentPersistenceStatus('capturing');
      queuedAction = await enqueueDurableAction(createDurableAction({
        kind: 'ordinarySubmission',
        studentId: user.id,
        assignmentId: activeAssignmentId,
        questionIndex: currentQuestionIndex,
        createdAt: submissionCapturedAt,
        payload: {
          previousTotalAttempts: Number(normalizeQuestionRecord(currentAssignmentGrades[currentQuestionIndex]).totalAttempts) || 0,
          activityRole: activeQuestionRole,
          timedSectionAccess,
          // THE SECTION STATE AS IT WAS WHEN THE STUDENT PRESSED SUBMIT.
          //
          // The only witness a teacher's later close cannot rewrite. Without it
          // a Classwork answer given at 10:10 and closed at 10:15 is
          // indistinguishable from one given after the close — and the old
          // reconciler resolved that ambiguity by destroying the answer.
          capturedSectionAccess,
          // The student's RAW response, so the server can mark this itself for
          // every question type the shared grading contract supports. Where it
          // can, the browser's verdict is discarded at ingestion.
          response: capturedResponse,
          familyDelivery: familyDelivery?.pin || null,
          questionId: assignmentQuestions[currentQuestionIndex]?.questionId || assignmentQuestions[currentQuestionIndex]?.id || null,
          variantIndex: normalizeQuestionRecord(currentAssignmentGrades[currentQuestionIndex]).variantIndex,
          timeSpentSeconds: activeTimeRef.current,
          // Retiring this question's checkpoint rides the same transaction as
          // the attempt, so a deadline can never turn one response into two.
          checkpointDocumentId: checkpointDocumentId({
            studentId: user.id,
            assignmentId: activeAssignmentId,
            questionIndex: currentQuestionIndex,
            questionId: assignmentQuestions[currentQuestionIndex]?.questionId || assignmentQuestions[currentQuestionIndex]?.id || '',
            variantIndex: normalizeQuestionRecord(currentAssignmentGrades[currentQuestionIndex]).variantIndex,
            generationKey: `${activeAssignmentId}|${user.id}|${currentQuestionIndex}|variant:${normalizeQuestionRecord(currentAssignmentGrades[currentQuestionIndex]).variantIndex}`,
          }),
          record: outcome.record,
          supportUsage: updatedSupportUsage[activeAssignmentId],
          hasClassworkGrade: false,
          classworkGrade: null,
          hasDolGrade: Object.hasOwn(updatedDOLGrades, activeAssignmentId),
          dolGrade: updatedDOLGrades[activeAssignmentId] ?? null,
          evidenceEvent,
        },
      }));
      setStudentOutboxDepth((depth) => depth + 1);
      setStudentPersistenceStatus('queued');
    } catch (error) {
      console.error('Could not durably queue this response:', error);
      setStudentPersistenceStatus('volatile');
      toastWarning('Response not queued', 'Your answer is still on screen. Keep this tab open and press Submit again.');
      return null;
    }

    setTracker(updatedTracker);
    setSupportUsageByAssignment(updatedSupportUsage);
    setDolGradesByAssignment(updatedDOLGrades);

    const serverAckSpan = startPerformanceSpan('submit_server_ack_ms', { flow: 'ordinary_assignment' });
    // The immutable envelope is already durable in IndexedDB. Canonical grade
    // and idempotent evidence reconciliation can now happen without extending
    // the student's critical interaction path.
    void (async () => {
      try {
        await reconcileAndReportStudentOutbox({ successStatus: 'submitted' });
        await flushAssignmentActivity(activeAssignmentId);
        serverAckSpan.finish({ status: 'durable' });
      } catch (error) {
        serverAckSpan.finish({ status: 'failed' });
        console.error('Response remains queued for retry:', queuedAction.actionId, error);
      }
    })();

    return outcome.result;
  };

  // `stepWork` is the step's raw work (Step Algebra: the states before and
  // after, the operation, the support level — never a verdict). It travels in
  // the durable step submission so the server derives the step's credit from
  // the work itself (functions/shared/serverGrading/
  // stepAlgebraStepVerification.mjs) instead of trusting this record.
  const handleStepGrade = async ({ stepGrade, countsAttempt, statePatch, supportUsage: providedSupportUsage = null, stepWork = null }) => {
    if (!activeAssignmentId) return null;
    const supportUsage = providedSupportUsage || buildSupportUsage(user?.profile, activeQuestions[currentQuestionIndex]);
    const localAssignment = assignments.find((item) => item.id === activeAssignmentId);
    const teacherGrantedExtraAttempts = resolveTeacherGrantedExtraAttempts({
      assignment: localAssignment,
      activityRole: activeQuestionRole,
      classId: user?.classId || null,
      studentId: user?.role === 'student' ? user.id : null,
    });
    // `occurredAt` is the step's capture time on the durable path, so this
    // record and the one the server derives carry the same timestamps.
    const applyStep = (record, occurredAt = null) =>
      recordQuestionStep({
        record,
        stepGrade,
        countsAttempt,
        statePatch,
        supportUsage,
        maximumAttempts: resolveQuestionMaximumAttempts({
          question: activeQuestions[currentQuestionIndex],
          maximumAttempts: activeActivityPolicy.attempts,
          activityPolicy: activeActivityPolicy,
          teacherGrantedExtraAttempts,
        }),
        occurredAt,
      });

    if (isTeacherPreview) {
      const outcome = applyStep(previewTracker[currentQuestionIndex]);
      setPreviewTracker((current) => ({
        ...current,
        [currentQuestionIndex]: outcome.record,
      }));
      return outcome.result;
    }

    if (user?.role !== 'student') return null;
    const stepCapturedAt = Date.now();
    const stepTimedSectionAccess = captureTimedSectionAccess({
      activityRole: activeQuestionRole,
      assignment: localAssignment,
      schedule: classSchedule,
      classId: user.classId || null,
      classPeriod: user.classPeriod,
      capturedAt: stepCapturedAt,
    });
    const teacherReopenedWarmupStepIsActive = activeQuestionRole === 'warmup'
      && warmupCaptureWasActive(stepTimedSectionAccess, stepCapturedAt)
      && stepTimedSectionAccess?.teacherTimerScheduled === true;
    if (getAssignmentLifecycle(localAssignment, stepCapturedAt, { studentId: user.id }).isPracticeOnly && !teacherReopenedWarmupStepIsActive) {
      const currentPractice = practiceTracker[activeAssignmentId]
        || createPracticeAssignmentTracker(getStoredAssignmentQuestions(localAssignment), tracker[activeAssignmentId] || {});
      const outcome = applyStep(currentPractice[currentQuestionIndex]);
      setPracticeTracker((current) => ({
        ...current,
        [activeAssignmentId]: {
          ...(current[activeAssignmentId] || currentPractice),
          [currentQuestionIndex]: outcome.record,
        },
      }));
      return outcome.result;
    }
    const assignment = localAssignment;
    const currentAssignmentGrades = tracker[activeAssignmentId] || {};
    const priorRecord = normalizeQuestionRecord(currentAssignmentGrades[currentQuestionIndex]);
    const outcome = applyStep(priorRecord, stepCapturedAt);
    const updatedTracker = { ...tracker, [activeAssignmentId]: { ...currentAssignmentGrades, [currentQuestionIndex]: outcome.record } };
    const previousSupport = supportUsageByAssignment[activeAssignmentId] || { modified: false, accommodations: [], modifications: [] };
    const assignmentSupportUsage = {
      modified: Boolean(previousSupport.modified || supportUsage.modified),
      accommodations: [...new Set([...(previousSupport.accommodations || []), ...(supportUsage.accommodations || [])])],
      modifications: [...new Set([...(previousSupport.modifications || []), ...(supportUsage.modifications || [])])],
    };
    const updatedSupportUsage = { ...supportUsageByAssignment, [activeAssignmentId]: assignmentSupportUsage };
    // As above: completion is the server's projection from canonical records,
    // never this browser's from a tracker holding unqueued work.
    try {
      setStudentPersistenceStatus('capturing');
      await enqueueDurableAction(createDurableAction({
        kind: 'stepSubmission', studentId: user.id, assignmentId: activeAssignmentId, questionIndex: currentQuestionIndex,
        createdAt: stepCapturedAt,
        payload: {
          previousTotalAttempts: Number(priorRecord.totalAttempts) || 0,
          activityRole: activeQuestionRole,
          timedSectionAccess: stepTimedSectionAccess,
          // Rapid step submissions are the case that most needs capture-time
          // eligibility: several of them can be queued inside the seconds it
          // takes a teacher to close a section.
          capturedSectionAccess: captureSectionAccessProof({
            sectionAccess: getSectionAccessState({
              assignment,
              activityRole: activeQuestionRole,
              classId: user.classId || null,
              classPeriod: user.classPeriod,
              nowValue: stepCapturedAt,
              studentId: user.id,
            }),
            capturedAt: stepCapturedAt,
          }),
          questionId: activeQuestions[currentQuestionIndex]?.questionId || activeQuestions[currentQuestionIndex]?.id || null,
          variantIndex: priorRecord.variantIndex,
          familyDelivery: familyDeliveryForQuestion(assignment, currentQuestionIndex, priorRecord)?.pin || null,
          timeSpentSeconds: activeTimeRef.current,
          record: outcome.record,
          // The step's raw work, bounded (null when the surface reports none,
          // or when it cannot be read whole): with it the server derives this
          // step's credit itself; without it the record above is sanitized.
          stepWork: normalizeStepWork(stepWork),
          supportUsage: assignmentSupportUsage,
          hasClassworkGrade: false,
          classworkGrade: null,
          hasDolGrade: false,
        },
      }));
      setStudentOutboxDepth((depth) => depth + 1);
      setStudentPersistenceStatus('queued');
    } catch (error) {
      console.error('Could not durably queue this algebra step:', error);
      setStudentPersistenceStatus('volatile');
      toastWarning('Step not queued', 'Your step is still in Work View. Keep this tab open and submit it again.');
      return null;
    }
    setTracker(updatedTracker);
    setSupportUsageByAssignment(updatedSupportUsage);
    void (async () => {
      try {
        await reconcileAndReportStudentOutbox();
        await flushAssignmentActivity(activeAssignmentId);
      } catch (error) {
        console.error('Algebra step remains queued for retry:', error);
      }
    })();
    return outcome.result;
  };

  const handleRequestNewQuestion = async (options = {}) => {
    if (!activeAssignmentId) return;

    const replacementBlueprint = activeQuestions[currentQuestionIndex];
    // A replacement must be a different question. One that cannot vary would
    // come back identical, with fresh attempts, right after its solution was
    // shown (see resolveQuestionReplacementAllowed).
    if (!isPersonalizedBlueprint(replacementBlueprint)) {
      return;
    }

    if (isTeacherPreview) {
      const replacement = requestReplacementQuestion(
        previewTracker[currentQuestionIndex],
        options,
      );
      setPreviewTracker((current) => ({
        ...current,
        [currentQuestionIndex]: replacement,
      }));
      return;
    }

    if (user?.role !== 'student') return;
    const localAssignment = assignments.find((item) => item.id === activeAssignmentId);
    if (getAssignmentLifecycle(localAssignment, Date.now(), { studentId: user.id }).isPracticeOnly) {
      const currentPractice = practiceTracker[activeAssignmentId]
        || createPracticeAssignmentTracker(getStoredAssignmentQuestions(localAssignment), tracker[activeAssignmentId] || {});
      const replacement = requestReplacementQuestion(currentPractice[currentQuestionIndex], options);
      setPracticeTracker((current) => ({
        ...current,
        [activeAssignmentId]: {
          ...(current[activeAssignmentId] || currentPractice),
          [currentQuestionIndex]: replacement,
        },
      }));
      return;
    }
    const currentAssignmentGrades = tracker[activeAssignmentId] || {};
    const replacement = requestReplacementQuestion(
      currentAssignmentGrades[currentQuestionIndex],
      options,
    );
    const updatedTracker = {
      ...tracker,
      [activeAssignmentId]: {
        ...currentAssignmentGrades,
        [currentQuestionIndex]: replacement,
      },
    };

    let updatedDOLGrades = dolGradesByAssignment;
    if (options.clearHistory) {
      const date = new Date();
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const assignmentDol = { ...(dolGradesByAssignment?.[activeAssignmentId] || {}) };
      delete assignmentDol[dateKey];
      updatedDOLGrades = { ...dolGradesByAssignment, [activeAssignmentId]: assignmentDol };
    }

    try {
      setStudentPersistenceStatus('capturing');
      await enqueueDurableAction(createDurableAction({
        kind: 'questionReplacement', studentId: user.id, assignmentId: activeAssignmentId, questionIndex: currentQuestionIndex,
        payload: {
          previousTotalAttempts: Number(normalizeQuestionRecord(currentAssignmentGrades[currentQuestionIndex]).totalAttempts) || 0,
          activityRole: activeQuestionRole,
          questionId: activeQuestions[currentQuestionIndex]?.questionId || activeQuestions[currentQuestionIndex]?.id || null,
          variantIndex: Number(replacement?.variantIndex) || 0,
          record: replacement,
          supportUsage: supportUsageByAssignment[activeAssignmentId] || { modified: false, accommodations: [], modifications: [] },
          hasClassworkGrade: false,
          hasDolGrade: Boolean(options.clearHistory),
          dolGrade: updatedDOLGrades[activeAssignmentId] ?? {},
        },
      }));
      setStudentOutboxDepth((depth) => depth + 1);
      setStudentPersistenceStatus('queued');
    } catch (error) {
      console.error('Could not durably queue a replacement question:', error);
      setStudentPersistenceStatus('volatile');
      toastWarning('Replacement not queued', 'Keep this tab open and request the new question again.');
      return;
    }
    setTracker(updatedTracker);
    if (options.clearHistory) setDolGradesByAssignment(updatedDOLGrades);
    void reconcileAndReportStudentOutbox().catch((error) => console.error('Question replacement remains queued for retry:', error));
  };

  const V5_COMPILER_PLUMBING_ERROR = /missing a type\/toolId|refers to a table in its prompt, but the question contains none|refers to a graph in its prompt, but the question contains none|needs `functionSpec\.type`|needs `analysisRequests`|needs a `graph` object with functions, points or segments|cannot yet build that interactive graph from an upstream response/i;

  // Reads the one supported Assignment V5 object and reports what is wrong in
  // terms an AI can act on, rather than throwing a single opaque message.
  const readAssignmentJson = (rawText) => {
    const errors = [];
    const warnings = [];
    let parsed = null;
    try {
      parsed = parseAssignmentBlueprintText(rawText);
    } catch (error) {
      // A compile throw is not the same as unreadable input, and treating it as
      // one is what made salvage unreachable for the case it exists for. The
      // commonest V5 failure is a single question the compiler refuses — "V5
      // question 3 does not contain enough mathematical intent" — thrown from
      // the middle of the compile. The document itself is still a perfectly
      // legible V5 with nineteen good questions in it, but discarding it here
      // left the salvage check with no assignment to look at and no schema
      // version to recognise, so the teacher was told to take the whole
      // assignment back to the AI over one question.
      //
      // The raw text is re-read as plain JSON instead. This is deliberately not
      // a second compiler: it recovers the authored document so it can be saved
      // and repaired, and every question in it still has to pass Preflight
      // before anything can be published.
      let recoveredV5 = null;
      try {
        const document = JSON.parse(rawText);
        if (document && typeof document === 'object' && Number(document.schemaVersion) === 5) {
          recoveredV5 = document;
        }
      } catch {
        recoveredV5 = null;
      }

      if (!recoveredV5) {
        return { ok: false, errors: [error.message], warnings, sourceSchemaVersion: null, compilerDefect: false };
      }

      return {
        ok: false,
        errors: [error.message],
        warnings,
        parsed: { assignmentV5: recoveredV5, questions: [] },
        sourceSchemaVersion: 5,
        compilerDefect: V5_COMPILER_PLUMBING_ERROR.test(String(error.message)),
      };
    }

    try {
      validateAssignmentQuestions(parsed.questions, { variantMode: parsed.assignmentV5?.variantPolicy?.mode });
    } catch (error) {
      errors.push(error.message);
    }

    parsed.questions.forEach((question, index) => {
      const result = validateAlignments(question, { label: `Question ${index + 1}` });
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    });

    // One TEKS copied onto every question is the commonest authoring mistake an
    // AI makes, and it silently corrupts mastery evidence rather than failing.
    warnings.push(...auditAlignmentSpecificity(parsed.questions).warnings);

    // A recognized type is not enough: the renderer has to be able to show it.
    const semantic = validateQuestionsSemantics(parsed.questions);
    errors.push(...semantic.errors);
    warnings.push(...semantic.warnings);

    if (errors.length) {
      const sourceSchemaVersion = parsed.sourceSchemaVersion || null;
      const compilerDefect = Number(sourceSchemaVersion) === 5
        && errors.every((message) => V5_COMPILER_PLUMBING_ERROR.test(String(message)));
      return { ok: false, errors, warnings, parsed, sourceSchemaVersion, compilerDefect };
    }

    return {
      ok: true,
      errors,
      warnings,
      parsed,
      sourceSchemaVersion: parsed.sourceSchemaVersion || null,
      compilerDefect: false,
    };
  };


  // The teacher sets classes, dates, folder and publishing here — the JSON never
  // carries them, so there are no manual fallbacks to merge any more.
  const openAssignmentPreflight = (inspected, sourceName, draftOverrides = {}, reviewOptions = {}) => {
    try {
      const assignmentV5 = inspected.assignmentV5;
      if (!assignmentV5 || Number(assignmentV5.schemaVersion) !== 5) {
        throw new Error('Assignment Review requires a current MathMaster assignment.');
      }
      const sections = Array.isArray(assignmentV5.sections) ? assignmentV5.sections : [];
      const dolQuestionFromRole = inspected.questions.findIndex((question) => (
        resolveQuestionActivityRole({ question, assignment: assignmentV5 }) === 'dol'
      ));
      const publishingIntent = normalizeLessonPublishingIntentV5({
        classroom: assignmentV5.classroomIntegration,
        lessonResources: { notesPdf: assignmentV5.outputProfiles?.lessonNotesPdf },
      }, assignmentV5.assignment, []);
      const defaultDates = defaultAssignmentDateInputs();
      const initialDraft = {
        title: assignmentV5.assignment?.title || '',
        folder: assignmentV5.assignment?.folder || '',
        dueAt: defaultDates.dueAt,
        lateDueAt: defaultDates.lateDueAt,
        releaseAt: '',
        sectionVariantModes: getStoredSectionVariantModes(assignmentV5),
        sectionAccessDefaults: { classwork: 'open', practice: 'open' },
        guidedNotesBySection: { classwork: 'automatic', practice: 'off' },
        assignedClassPeriods: [],
        assignedClassIds: [],
        warmupEnabled: sections.some((section) => section.role === 'warmup'),
        warmupMinutesBeforeStart: 7,
        warmupInstructionDate: '',
        warmupInstructionDatesByClassPeriod: {},
        dolEnabled: sections.some((section) => section.role === 'dol'),
        dolMinutesBeforeEnd: 10,
        dolCloseMinutesBeforeEnd: 5,
        dolInstructionDate: '',
        dolInstructionDatesByClassPeriod: {},
        dolQuestionIndex: dolQuestionFromRole >= 0 ? dolQuestionFromRole : null,
        publicationStrategy: 'hybrid',
        includeWarmupInClassroom: false,
        homeworkDueAt: '',
        instructionalPurpose: assignmentV5.assignment?.instructionalPurpose || 'lesson',
        gradingPurpose: assignmentV5.assignment?.gradingPurpose || null,
        variantPolicy: assignmentV5.variantPolicy,
        differentiationPolicy: assignmentV5.differentiationPolicy,
        supportPolicy: assignmentV5.supportPolicy,
        toolPolicy: assignmentV5.toolPolicy,
        deliveryPolicy: assignmentV5.deliveryPolicy,
        gradingPolicy: assignmentV5.gradingPolicy,
        evidencePolicy: assignmentV5.evidencePolicy,
        outputProfiles: assignmentV5.outputProfiles,
        classroomIntegration: assignmentV5.classroomIntegration,
        provenance: assignmentV5.provenance,
        preflight: assignmentV5.preflight,
        ...draftOverrides,
      };
      setAssignmentPreflight({
        assignmentV5,
        initialDraft,
        questions: inspected.questions,
        authoringWarnings: inspected.authoringWarnings || [],
        sourceLabel: `${sourceName || 'Imported assignment'}`,
        mode: reviewOptions.mode === 'update' ? 'update' : 'create',
        existingAssignmentId: reviewOptions.existingAssignmentId || null,
        allowQuestionRepair: reviewOptions.allowQuestionRepair !== false,
        sourceContentLineage: reviewOptions.sourceContentLineage || null,
        // When this review started from an Incomplete draft, remember which one.
        // Publishing has to close that draft, or the same assignment sits in the
        // Library and in Incomplete Assignments at once, and the stale copy is
        // the one still holding the pre-repair question JSON.
        incompleteDraftId: reviewOptions.incompleteDraftId || null,
      });
      return true;
    } catch (error) {
      return { error: error.message };
    }
  };

  // #359: "no compatible audited CCMR item" must be a clear, teacher-facing
  // message distinguishable from a plain "nothing sourced" silence — never a
  // reason to insert an unrelated question merely to hit the 15% target.
  const ccmrAuditWarnings = (audit) => {
    const messages = [];
    const sourcedCount = Number(audit?.autoSourced || 0) + Number(audit?.replaced || 0);
    if (sourcedCount > 0) {
      messages.push(`MathMaster sourced ${sourcedCount} Practice item${sourcedCount === 1 ? '' : 's'} from the audited CCMR Fidelity V2.1 bank.`);
    }
    const gaps = Array.isArray(audit?.misses) ? audit.misses : [];
    const semanticGaps = gaps.filter((miss) => miss?.reason === 'no_semantically_compatible_audited_item'
      || (Array.isArray(miss?.details) && miss.details.some((detail) => detail?.reason === 'no_semantically_compatible_audited_item')));
    if (semanticGaps.length) {
      messages.push('MathMaster kept the teacher-authored Practice question(s) as written: the audited CCMR bank has same-TEKS items, but none that match this question\'s construct (e.g. system dimension, or linear vs. linear–quadratic), so nothing was substituted.');
    }
    return messages;
  };

  // Single entry point for pasted, uploaded and dropped JSON.
  const handleAssignmentJsonReady = async ({ text, sourceName, incompleteDraftId = null }) => {
    let sourceText = text;
    let ccmrAudit = null;

    // Every authoring route gets the same CCMR treatment. Built-in AI is
    // already bank-backed, while ChatGPT/Claude/Gemini JSON is hydrated here
    // before local V5 compilation and Preflight. If the network is temporarily
    // unavailable, import still works; Preflight will visibly flag any direct
    // exam-style item that lacks audited-bank provenance.
    try {
      const raw = JSON.parse(String(text || ''));
      const isCanonicalSelfExport = raw?.portableContract?.kind === 'mathmasterCanonicalAssignmentV5'
        && Number(raw?.portableContract?.version) === 1;
      if (
        raw
        && !Array.isArray(raw)
        && Number(raw.schemaVersion) === 5
        && Array.isArray(raw.sections)
        && !isCanonicalSelfExport
      ) {
        const hydrated = await hydrateAssignmentCcmr(raw, { ensurePracticeTarget: false });
        sourceText = JSON.stringify(hydrated.assignment);
        ccmrAudit = hydrated.audit;
      }
    } catch (error) {
      console.warn('CCMR assignment hydration was skipped', error);
    }

    const result = readAssignmentJson(sourceText);
    const bankWarnings = [...ccmrAuditWarnings(ccmrAudit)];
    const warnings = [...(result.warnings || []), ...bankWarnings];
    if (!result.ok) {
      if (!canSalvageV5IntakeResult(result)) return { ...result, warnings };

      // Publication validity and previewability are different boundaries.
      // A parseable V5 with question-level blockers still opens Preflight.
      const preflightModel = buildAssignmentV5PreflightModel(result.parsed.assignmentV5);
      const salvageResult = {
        ...result,
        ok: false,
        errors: [...new Set([...(result.errors || []), ...(preflightModel.errors || [])])],
        warnings: [...new Set([...warnings, ...(preflightModel.warnings || [])])],
        parsed: {
          ...result.parsed,
          assignmentV5: preflightModel.assignmentV5,
          questions: preflightModel.questions,
        },
      };
      const previewOpenResult = openAssignmentPreflight(
        { ...salvageResult.parsed, authoringWarnings: salvageResult.warnings },
        sourceName,
        {},
        { incompleteDraftId },
      );
      if (previewOpenResult !== true) {
        return {
          ...salvageResult,
          errors: [...salvageResult.errors, previewOpenResult?.error || 'Could not build Assignment Review from this assignment.'],
          previewOpened: false,
        };
      }
      return { ...salvageResult, previewOpened: true, ccmrAudit };
    }
    const opened = openAssignmentPreflight({ ...result.parsed, authoringWarnings: warnings }, sourceName, {}, { incompleteDraftId });
    if (opened !== true) {
      return { ok: false, errors: [opened?.error || 'Could not build Assignment Review from this assignment.'], warnings, sourceSchemaVersion: result.sourceSchemaVersion, compilerDefect: false };
    }
    return { ok: true, warnings, repairs: result.parsed.repairs || [], ccmrAudit };
  };


  const handleCreateAssignment = async (teacherReview, reviewedAssignmentV5) => {
    const sourceIncompleteDraftId = assignmentPreflight?.incompleteDraftId || null;
    try {
      if (!teacherReview || typeof teacherReview !== 'object') {
        throw new Error('Publishing requires the completed Assignment Review settings.');
      }
      const reviewedCandidate = reviewedAssignmentV5 && Number(reviewedAssignmentV5.schemaVersion) === 5
        ? reviewedAssignmentV5
        : null;
      if (!reviewedCandidate) {
        throw new Error('Publishing requires the MathMaster assignment that was reviewed before creation.');
      }

      // Creation must never be the first place a teacher learns that the
      // reviewed assignment is invalid. Re-run the same native V5 Preflight
      // model used by Assignment Review and publish only its validated,
      // persistence-safe object. This is a final race/defense check, not a
      // separate validation system.
      const finalPreflight = buildAssignmentV5PreflightModel(reviewedCandidate);
      if (!finalPreflight.isValid) {
        throw new Error(`This assignment is no longer ready to create:\n${finalPreflight.errors.join('\n')}`);
      }
      const reviewedV5 = finalPreflight.assignmentV5;

      // Final publishing consumes the exact reviewed canonical object. The
      // original pasted/uploaded JSON is intentionally not reparsed here.
      const reviewedQuestions = flattenV5Sections(reviewedV5);
      const title = String(reviewedV5.assignment?.title || '').trim();
      const dueValue = teacherReview.dueAt || '';
      const lateDueValue = teacherReview.lateDueAt || '';
      const releaseValue = teacherReview.releaseAt || '';
      const variantMode = getStoredAssignmentVariantMode(reviewedV5);
      const assignedClassIds = [...new Set((teacherReview.assignedClassIds || []).filter(Boolean))];
      const selectedClassRecords = assignedClassIds.length
        ? classes.filter((entry) => assignedClassIds.includes(entry.classId) && entry?.status !== 'archived')
        : [];
      const assignedClassPeriods = [...new Set(selectedClassRecords.map((entry) => entry.period).filter(Boolean))];
      const creationMode = resolveCreationMode({ assignedClassIds });
      if (!title) {
        throw new Error('Assignment title is missing. Add a title in Assignment Review before publishing.');
      }

      const { dueAt, lateDueAt, dueDate, releaseAt } = resolveAssignmentDates({
        mode: creationMode,
        dueValue,
        lateDueValue,
        releaseValue,
      });

      const parsedQuestions = normalizeAssignmentQuestions(
        validateAssignmentQuestions(reviewedQuestions, { variantMode }),
      );
      const authoredRoles = parsedQuestions.map((question) => resolveQuestionActivityRole({
        question,
        assignment: reviewedV5,
      }));
      const hasWarmupSection = authoredRoles.includes('warmup');
      const hasDOLSection = authoredRoles.includes('dol');
      const assignmentType = getStoredAssignmentTypeProjection(reviewedV5);

      const warmupEnabled = hasWarmupSection && teacherReview.warmupEnabled !== false;
      const requestedWarmupLeadMinutes = Number(teacherReview.warmupMinutesBeforeStart);
      const warmupMinutesBeforeStart = Math.max(
        0,
        Number.isFinite(requestedWarmupLeadMinutes) ? requestedWarmupLeadMinutes : 7,
      );
      const warmupInstructionDate = String(
        teacherReview.warmupInstructionDate
        || (releaseAt ? localDateKey(new Date(releaseAt)) : '')
        || localDateKey(Date.now()),
      ).trim() || null;
      const warmupInstructionDatesByClassPeriod = teacherReview.warmupInstructionDatesByClassPeriod || {};

      let dolQuestionIndex = Number.isInteger(Number(teacherReview.dolQuestionIndex))
        ? Number(teacherReview.dolQuestionIndex)
        : null;
      if (Number.isInteger(dolQuestionIndex)) {
        dolQuestionIndex = Math.max(0, Math.min(parsedQuestions.length - 1, dolQuestionIndex));
      } else {
        const authoredDOLIndex = authoredRoles.findIndex((role) => role === 'dol');
        dolQuestionIndex = authoredDOLIndex >= 0 ? authoredDOLIndex : null;
      }
      const dolEnabled = Boolean(
        teacherReview.dolEnabled === true
        && hasDOLSection
        && Number.isInteger(dolQuestionIndex),
      );
      const dolMinutesBeforeEnd = Math.max(1, Number(teacherReview.dolMinutesBeforeEnd) || 10);
      const dolCloseMinutesBeforeEnd = Math.max(0, Number(teacherReview.dolCloseMinutesBeforeEnd ?? 5));
      const dolInstructionDate = String(
        teacherReview.dolInstructionDate
        || (releaseAt ? localDateKey(new Date(releaseAt)) : '')
        || localDateKey(Date.now()),
      ).trim() || null;

      const folder = normalizeFolderPath(reviewedV5.assignment?.folder) || null;
      const completionRule = assignmentType === 'notesClasswork'
        ? { minEngagementMinutes: 10, minimumQuestionCompletionPercent: 80 }
        : null;
      const sourceAssignmentKey = String(reviewedV5.assignment?.assignmentKey || '').trim() || null;

      if (sourceAssignmentKey && assignments.some((assignment) => (
        assignment.assignmentKey === sourceAssignmentKey
        || String(assignment.assignmentKey || '').startsWith(`${sourceAssignmentKey}:`)
      ))) {
        throw new Error(`An assignment with assignmentKey "${sourceAssignmentKey}" already exists. Clear or change assignment.assignmentKey if you intend to create a separate copy.`);
      }

      const publishingIntent = normalizeLessonPublishingIntentV5({
        classroom: reviewedV5.classroomIntegration,
        lessonResources: { notesPdf: reviewedV5.outputProfiles?.lessonNotesPdf },
      }, {
        ...(reviewedV5.assignment || {}),
        title,
        folder,
      }, []);

      const assignmentPayloadBase = {
        schemaVersion: 5,
        title,
        courseId: reviewedV5.assignment?.courseId || null,
        dueAt,
        lateDueAt,
        dueDate,
        sectionAccess: {
          classwork: { defaultState: teacherReview.sectionAccessDefaults?.classwork === 'closed' ? 'closed' : 'open', overridesByClassId: {}, overridesByClassPeriod: {} },
          practice: { defaultState: teacherReview.sectionAccessDefaults?.practice === 'closed' ? 'closed' : 'open', overridesByClassId: {}, overridesByClassPeriod: {} },
        },
        guidedNotesBySection: {
          classwork: teacherReview.guidedNotesBySection?.classwork || 'automatic',
          practice: teacherReview.guidedNotesBySection?.practice || 'off',
        },
        releaseAt,
        prerequisiteAssignmentId: null,
        completionRule,
        warmup: {
          enabled: warmupEnabled,
          minutesBeforeStart: warmupMinutesBeforeStart,
          closeMinutesAfterStart: 10,
          instructionDate: warmupInstructionDate,
          instructionDatesByClassPeriod: warmupInstructionDatesByClassPeriod,
          closedByClassId: {},
          closedByClassPeriod: {},
        },
        dol: {
          enabled: dolEnabled,
          minutesBeforeEnd: dolMinutesBeforeEnd,
          closeMinutesBeforeEnd: dolCloseMinutesBeforeEnd,
          instructionDate: dolInstructionDate,
          instructionDatesByClassPeriod: teacherReview.dolInstructionDatesByClassPeriod || {},
          questionIndex: dolQuestionIndex,
          earlyUnlocksByClassId: {},
          earlyUnlocks: {},
        },
        folder,
        publicationSettings: {
          strategy: teacherReview.publicationStrategy || 'hybrid',
          includeWarmupInClassroom: teacherReview.includeWarmupInClassroom === true,
          homeworkDueAt: teacherReview.homeworkDueAt ? new Date(teacherReview.homeworkDueAt).toISOString() : null,
        },
        classroomPackage: publishingIntent.classroomPackage,
        lessonResources: publishingIntent.lessonResources,
        instructionalPurpose: reviewedV5.assignment?.instructionalPurpose || 'lesson',
        gradingPurpose: reviewedV5.assignment?.gradingPurpose ?? null,
        variantPolicy: reviewedV5.variantPolicy || {},
        differentiationPolicy: reviewedV5.differentiationPolicy || null,
        supportPolicy: reviewedV5.supportPolicy || null,
        toolPolicy: reviewedV5.toolPolicy || null,
        deliveryPolicy: reviewedV5.deliveryPolicy || null,
        gradingPolicy: reviewedV5.gradingPolicy || null,
        evidencePolicy: reviewedV5.evidencePolicy || null,
        outputProfiles: reviewedV5.outputProfiles || null,
        classroomIntegration: reviewedV5.classroomIntegration || null,
        provenance: reviewedV5.provenance || null,
        preflight: reviewedV5.preflight || { required: true },
        // A Test Cycle's policy, secure blueprint and secure reference are not
        // sections, and this payload used to drop all three — so a Test Cycle
        // authored here was saved as a Review with no secure Test behind it.
        ...testCycleContractFields(reviewedV5),
        ...(assignmentPreflight?.sourceContentLineage ? {
          contentLineage: assignmentPreflight?.sourceContentLineage,
        } : {}),
        createdAt: new Date(),
      };

      if (folder && !assignmentFolderPaths.includes(folder)) {
        await saveAssignmentFolderPaths([...assignmentFolderPaths, folder]);
      }

      const bundleLabs = reviewedV5
        ? (reviewedV5.sections || []).flatMap((section) => (
            (section?.questions || [])
              .filter((question) => question?.type === 'modelingLab' && question?.labDefinition)
              .map((question) => ({
                activityId: section.id || null,
                role: section.role || 'classwork',
                labDefinition: question.labDefinition,
              }))
          ))
        : [];
      const privateLabsById = new Map(bundleLabs.map((activity) => {
        const definition = normalizeLabDefinition(activity.labDefinition, { includeEvaluation: true });
        return [definition.labId, { definition, activity }];
      }));

      // Extracted so assigning a library item later runs the same split rather
      // than a second copy of it. A library save returns [] here, which is the
      // correct answer: nobody has been given it, so there is nothing to split.
      const destinationGroups = buildDestinationGroups({ assignedClassIds, classes });
      const hasHonorsDestination = destinationGroups.some((entry) => entry.courseLevel === 'honors');
      let honorsParsedQuestions = parsedQuestions;
      // The server is the source of truth for whether this authored Practice
      // section is large enough to carry the ~15% audited CCMR target.
      // Default to strict if an audit is ever unavailable.
      let honorsCcmrTargetRequired = true;
      // #359: when the target was required but nothing was sourced, name WHY
      // — same-TEKS items exist but none fit this question's construct,
      // versus no same-TEKS item existing at all — instead of a single generic
      // "could not find" message either way.
      let honorsCcmrGapMessage = '';

      // CCMR is destination-aware. Standard destinations keep the authored
      // Practice. When an Honors destination is actually selected, MathMaster
      // asks the server to source the audited V2.1 target on the same TEKS,
      // then compiles that Honors-only V5 variant through the normal pipeline.
      if (hasHonorsDestination) {
        const hydratedHonors = await hydrateAssignmentCcmr(reviewedV5, { ensurePracticeTarget: true });
        const honorsCanonical = applyCcmrHydrationToCanonicalAssignment({
          baseAssignmentV5: reviewedV5,
          hydratedAssignment: hydratedHonors.assignment,
        });
        honorsParsedQuestions = normalizeAssignmentQuestions(
          validateAssignmentQuestions(honorsCanonical.questions, { variantMode }),
        );
        if (hydratedHonors?.audit && Object.prototype.hasOwnProperty.call(hydratedHonors.audit, 'targetCount')) {
          honorsCcmrTargetRequired = Number(hydratedHonors.audit.targetCount || 0) > 0;
        }
        const honorsMisses = Array.isArray(hydratedHonors?.audit?.misses) ? hydratedHonors.audit.misses : [];
        const honorsSemanticGap = honorsMisses.some((miss) => miss?.reason === 'no_semantically_compatible_audited_item'
          || (Array.isArray(miss?.details) && miss.details.some((detail) => detail?.reason === 'no_semantically_compatible_audited_item')));
        honorsCcmrGapMessage = honorsSemanticGap
          ? 'The audited CCMR bank has items on this lesson’s TEKS, but none that match the question’s construct (for example, system dimension, or linear vs. linear–quadratic). MathMaster kept the authored Practice question rather than substitute an unrelated item.'
          : 'MathMaster could not find any audited CCMR Fidelity V2.1 Practice family on the same lesson TEKS.';
      }

      const sourceHonorsReport = inspectHonorsRigor(honorsParsedQuestions, {
        allowNarrowCheckpoint: true,
        ccmrTargetRequired: honorsCcmrTargetRequired,
      });
      const splitVariantGroupId = destinationGroups.length > 1 ? `rigor_${createQuestionId()}` : null;

      const writeAssignmentVariant = async ({ destination, questions }) => {
        const assignmentRef = doc(collection(db, 'assignments'));
        const labSuffix = `${destination.course}-${destination.courseLevel}-${assignmentRef.id.slice(0, 8)}`;
        const privateLabWrites = [];
        const variantQuestions = questions.map((question) => {
          if (question?.type !== 'modelingLab' || !question.labDefinition?.labId) return question;
          const originalLabId = question.labDefinition.labId;
          const privateSource = privateLabsById.get(originalLabId);
          if (!privateSource) {
            if (bundleLabs.length) throw new Error(`Modeling lab ${originalLabId} could not be matched to its private assignment definition.`);
            return question;
          }
          const nextLabId = `${originalLabId}-${labSuffix}`;
          if (privateSource) privateLabWrites.push({ nextLabId, ...privateSource });
          return { ...question, labDefinition: { ...question.labDefinition, labId: nextLabId } };
        });
        const payload = {
          ...assignmentPayloadBase,
          // Filed in the marking period that is current when it is assigned,
          // so moving to the next period does not drag it into "current".
          ...((destination.classIds || []).length ? currentGradingPeriodStamp(gradingPeriodSettings) : {}),
          assignedClassPeriods: destination.periods,
          assignedClassIds: destination.classIds || [],
          sections: rebuildV5SectionsFromQuestions(reviewedV5, variantQuestions),
          courseProfile: { course: destination.course, courseLevel: destination.courseLevel },
          rigorVariant: destination.courseLevel,
          rigorVariantGroupId: splitVariantGroupId,
          assignmentKey: destinationAssignmentKey({
            assignmentKey: sourceAssignmentKey,
            destination,
            destinationCount: destinationGroups.length,
          }),
          honorsContractVersion: destination.courseLevel === 'honors' ? 1 : null,
          honorsContractScope: destination.courseLevel === 'honors' ? sourceHonorsReport.scope : null,
        };
        assertFirestoreSafeAssignmentPayload(payload);
        if (privateLabWrites.length) {
          const batch = writeBatch(db);
          batch.set(assignmentRef, payload);
          privateLabWrites.forEach(({ nextLabId, definition, activity }) => batch.set(doc(db, 'modelingLabDefinitions', nextLabId), {
            ...definition,
            labId: nextLabId,
            assignmentId: assignmentRef.id,
            activityId: activity.activityId || null,
            activityRole: activity.role || 'classwork',
            updatedAt: new Date(),
          }));
          await batch.commit();
        } else {
          await setDoc(assignmentRef, payload);
        }
        return { id: assignmentRef.id, ...payload };
      };

      const destinationVariants = destinationGroups.map((destination) => {
        let destinationQuestions = parsedQuestions;
        if (destination.courseLevel === 'honors') {
          destinationQuestions = honorsParsedQuestions;
          let enrichmentQuestion = null;
          if (!sourceHonorsReport.isHonorsReady) {
            if (sourceHonorsReport.ccmrTargetRequired && !sourceHonorsReport.checks.ccmrEnrichment) {
              throw new Error(`${honorsCcmrGapMessage || 'MathMaster could not find an audited CCMR Fidelity V2.1 Practice family on the same lesson TEKS for this Honors destination.'} Review the Practice TEKS or reduce the independent Practice section below the CCMR target threshold.`);
            }
            if (!teacherReview?.honorsEnrichmentQuestion) {
              throw new Error('This Honors destination still needs additional Honors depth. Return to preflight and choose Build Honors Depth with MathMaster AI.');
            }
            // The extension the teacher reviewed in Pre-Flight extends THIS
            // assignment's mathematics, so every Honors destination gets that
            // same one, whatever course a destination class profile names. It
            // was rebuilt per destination course once, which is how an Algebra I
            // lesson was given an "Algebra II" extension. Certified again here:
            // publish never stores an extension Pre-Flight would refuse.
            enrichmentQuestion = teacherReview.honorsEnrichmentQuestion;
            const certification = certifyHonorsExtensionQuestion(enrichmentQuestion);
            if (!certification.ok) {
              throw new Error(`The Honors extension cannot be published because it does not pass MathMaster's checks. Return to Pre-Flight and add it again:\n${certification.errors.join('\n')}`);
            }
          }
          destinationQuestions = normalizeAssignmentQuestions([
            ...honorsParsedQuestions,
            ...(enrichmentQuestion ? [enrichmentQuestion] : []),
          ]);
          const finalHonorsReport = inspectHonorsRigor(destinationQuestions, {
            allowNarrowCheckpoint: true,
            ccmrTargetRequired: honorsCcmrTargetRequired,
          });
          if (!finalHonorsReport.isHonorsReady) throw new Error(`Honors preflight is still missing: ${finalHonorsReport.missing.join(', ')}.`);
          validateAssignmentQuestions(destinationQuestions, { variantMode, allowFixed: variantMode === 'shared' });
        }
        return { destination, questions: destinationQuestions };
      });

      const createdAssignments = [];
      if (creationMode === 'library') {
        // ONE canonical document, deliberately without a course/rigor variant.
        // Choosing a destination now would be guessing: the teacher has not said
        // which classes get it, and materialising a Standard variant today would
        // be wrong the moment they assign it to an Honors class. The split runs
        // when the assignment is actually assigned, through the same helper.
        createdAssignments.push(await writeAssignmentVariant({
          destination: { course: null, courseLevel: null, periods: [] },
          questions: parsedQuestions,
        }));
      } else {
        for (const variant of destinationVariants) {
          // Sequential writes keep the destination variants and their private lab
          // definitions easy to audit. A normal assignment creates one group.
          // eslint-disable-next-line no-await-in-loop
          createdAssignments.push(await writeAssignmentVariant(variant));
        }
      }

      // "Publish" in Preflight now means publish the whole authored package:
      // MathMaster assignment + mapped Google Classroom post + optional notes
      // material. Classroom is downstream, so a failure is surfaced but never
      // deletes the MathMaster assignment that was just created.
      if (creationMode !== 'library') {
        for (const createdAssignment of createdAssignments) {
          if (!shouldAutoPublishClassroomPackage(createdAssignment)) continue;
          try {
            // eslint-disable-next-line no-await-in-loop
            const classroomResult = await autoPublishAssignmentPackageToClassroom(createdAssignment);
            if (classroomResult.status === 'needs-mapping') {
              toastWarning(
                'MathMaster assignment published; Classroom needs a mapping',
                `${createdAssignment.title} was assigned in MathMaster, but no saved Google Classroom mapping matches ${createdAssignment.assignedClassPeriods.join(', ')}. Map that class once in Google Classroom Manager and publish/retry there.`,
              );
            } else if (classroomResult.status === 'failed' || classroomResult.status === 'partial') {
              toastWarning(
                'MathMaster assignment published; Classroom needs attention',
                `${createdAssignment.title} is live in MathMaster. Google Classroom published ${classroomResult.published || 0} destination(s) and failed ${classroomResult.failed || 0}. Open Google Classroom Manager for details/retry.`,
              );
            } else if (classroomResult.status === 'published') {
              toastSuccess(
                'Google Classroom published',
                `${createdAssignment.title} was posted automatically to ${classroomResult.published} mapped Classroom destination${classroomResult.published === 1 ? '' : 's'}.`,
              );
            }
          } catch (classroomError) {
            console.error('Automatic Google Classroom publication failed:', classroomError);
            toastWarning(
              'MathMaster assignment published; Classroom did not post',
              `${createdAssignment.title} is live in MathMaster, but Google Classroom returned: ${classroomError.message}`,
            );
          }
        }
      }

      // The intake is stateless now — closing preflight and clearing the held
      // JSON is the whole reset.
      setAssignmentPreflight(null);
      await fetchAssignments();
      // Creation consumes the already-reviewed canonical V5 object. There is
      // no local `parsed` result in this function; referencing one here used
      // to throw after Firestore had successfully saved the assignment, making
      // a successful library save look like a failure.
      // The draft existed to hold this assignment while it was unpublishable.
      // It is published now, so the draft's job is done. This runs after the
      // Firestore write and deliberately does not fail the publication: the
      // assignment is live either way, and a leftover draft is a tidiness
      // problem, not a reason to tell the teacher publishing failed.
      if (sourceIncompleteDraftId) {
        try {
          await markIncompleteAssignmentDraftPublished(sourceIncompleteDraftId);
        } catch (draftCleanupError) {
          console.error('Published the assignment but could not close its incomplete draft:', draftCleanupError);
          toastWarning(
            'Published, but the incomplete draft is still listed',
            `“${title}” is saved. Its Incomplete Assignments entry could not be removed automatically — delete it there so the repaired copy is the only one.`,
          );
        }
      }

      const repairMessage = '';
      const sourceMessage = 'Created with MathMaster Assignment Creator after teacher review.';
      toastSuccess(
        creationMode === 'library' ? `Saved “${title}” to the library` : `Published “${title}”`,
        creationMode === 'library'
          ? `${sourceMessage} Not assigned to any class yet, so it has no due date. Assign it when you are ready.${folder ? `\nFolder: ${folder}` : ''}${repairMessage}`
          : `${sourceMessage} Assigned to ${assignedClassPeriods.length} class period(s)${folder ? `\nFolder: ${folder}` : ''}.${repairMessage}`,
      );

    } catch (error) {
      toastError('Could not create assignment', error.message);
    }
  };

  const updateExistingAssignmentFromReview = async ({ draft, assignmentV5 }) => {
    const assignmentId = assignmentPreflight?.existingAssignmentId;
    const existing = assignments.find((item) => item.id === assignmentId);
    if (!assignmentId || !existing) throw new Error('The assignment being edited could not be found.');

    const model = buildAssignmentV5PreflightModel(assignmentV5);
    if (!model.isValid) {
      throw new Error(`This setup cannot be saved until MathMaster’s assignment checks are clean:\n${model.errors.join('\n')}`);
    }

    const assignedClassIds = [...new Set((draft.assignedClassIds || []).filter(Boolean))];
    const selectedClassRecords = assignedClassIds.length
      ? classes.filter((entry) => assignedClassIds.includes(entry.classId) && entry?.status !== 'archived')
      : [];
    const assignedClassPeriods = [...new Set(selectedClassRecords.map((entry) => entry.period).filter(Boolean))];

    if (isLibraryAssignment(existing) && assignedClassIds.length) {
      throw new Error(
        'This is a reusable library template. Use Dates & Classes to assign it; MathMaster will open Assignment Review and create the correct destination copy while keeping the template unchanged.',
      );
    }

    const targetGroups = buildDestinationGroups({ assignedClassIds, classes });
    const currentCourse = existing.courseId || existing.courseProfile?.course || null;
    const currentLevel = existing.rigorVariant || existing.courseProfile?.courseLevel || null;
    const changesDestination = targetGroups.length > 1
      || (targetGroups.length === 1 && currentCourse && targetGroups[0].course !== currentCourse)
      || (targetGroups.length === 1 && currentLevel && targetGroups[0].courseLevel !== currentLevel);
    if (changesDestination) {
      throw new Error(
        'This assignment is already a destination-specific Standard/Honors version. Duplicate it to the library, then assign the library copy through Assignment Review to create a different rigor destination.',
      );
    }

    const originalV5 = storedAssignmentToV5(existing);
    const hasStudentData = allStudents.some(
      (student) => student.gradesByAssignment?.[existing.id] !== undefined,
    );
    if (hasStudentData) {
      const originalQuestionState = flattenV5Sections(originalV5);
      const reviewedQuestionState = flattenV5Sections(model.assignmentV5);
      const questionContentChanged = JSON.stringify(originalQuestionState) !== JSON.stringify(reviewedQuestionState);
      const historicalFields = [
        'variantPolicy',
        'differentiationPolicy',
        'supportPolicy',
        'toolPolicy',
        'deliveryPolicy',
        'gradingPolicy',
        'evidencePolicy',
      ];
      const changed = historicalFields.filter((field) => (
        JSON.stringify(originalV5[field] || null) !== JSON.stringify(model.assignmentV5[field] || null)
      ));
      const audienceChanged = JSON.stringify([...(existing.assignedClassIds || [])].sort())
        !== JSON.stringify([...assignedClassIds].sort());
      if (changed.length || audienceChanged || questionContentChanged) {
        throw new Error(
          `Student records already exist. To preserve historical evidence, this setup editor cannot change ${[
            ...changed,
            ...(audienceChanged ? ['class audience'] : []),
            ...(questionContentChanged ? ['question content'] : []),
          ].join(', ')}. Duplicate the assignment for a new delivery policy or question rewrite instead.`,
        );
      }
    }

    const mode = resolveCreationMode({ assignedClassIds });
    const { dueAt, lateDueAt, dueDate, releaseAt } = resolveAssignmentDates({
      mode,
      dueValue: draft.dueAt || '',
      lateDueValue: draft.lateDueAt || '',
      releaseValue: draft.releaseAt || '',
    });

    // The Test Cycle contract is server-owned after creation (firestore.rules
    // pins it). Work out what this edit does to it BEFORE saving anything, so a
    // save that would strip it is refused rather than half-applied.
    const contractEdit = planTestCycleContractEdit({ stored: existing, reviewed: model.assignmentV5 });
    if (contractEdit.kind === TEST_CYCLE_CONTRACT_EDIT.REFUSE) throw new Error(contractEdit.message);

    const persistence = canonicalV5PersistencePatch(model.assignmentV5);
    // Firestore stores sections[] only. Derive the temporary flat runtime view
    // from the validated V5 object instead of reading a removed persistence field.
    const persistedQuestions = flattenV5Sections(model.assignmentV5);
    const authoredRoles = persistedQuestions.map((question) => resolveQuestionActivityRole({
      question,
      assignment: model.assignmentV5,
    }));
    const hasWarmup = authoredRoles.includes('warmup');
    const dolIndexFromRole = authoredRoles.findIndex((role) => role === 'dol');
    const hasDOL = dolIndexFromRole >= 0;
    const dolQuestionIndex = hasDOL
      ? Math.max(0, Math.min(
          persistedQuestions.length - 1,
          Number.isInteger(Number(draft.dolQuestionIndex))
            ? Number(draft.dolQuestionIndex)
            : dolIndexFromRole,
        ))
      : null;

    const publishingIntent = normalizeLessonPublishingIntentV5({
      classroom: model.assignmentV5.classroomIntegration,
      lessonResources: { notesPdf: model.assignmentV5.outputProfiles?.lessonNotesPdf },
    }, model.assignmentV5.assignment, []);

    const patch = {
      ...persistence,
      title: model.assignmentV5.assignment.title,
      folder: normalizeFolderPath(model.assignmentV5.assignment.folder) || null,
      dueAt,
      dueDate,
      lateDueAt,
      releaseAt,
      assignedClassIds,
      assignedClassPeriods,
      sectionAccess: {
        ...(existing.sectionAccess || {}),
        classwork: {
          ...(existing.sectionAccess?.classwork || {}),
          defaultState: draft.sectionAccessDefaults?.classwork === 'closed' ? 'closed' : 'open',
        },
        practice: {
          ...(existing.sectionAccess?.practice || {}),
          defaultState: draft.sectionAccessDefaults?.practice === 'closed' ? 'closed' : 'open',
        },
      },
      guidedNotesBySection: {
        classwork: draft.guidedNotesBySection?.classwork || 'automatic',
        practice: draft.guidedNotesBySection?.practice || 'off',
      },
      warmup: {
        ...(existing.warmup || {}),
        enabled: hasWarmup && draft.warmupEnabled !== false,
        minutesBeforeStart: Math.max(0, Number(draft.warmupMinutesBeforeStart) || 7),
        instructionDate: draft.warmupInstructionDate || existing.warmup?.instructionDate || null,
        instructionDatesByClassPeriod: draft.warmupInstructionDatesByClassPeriod || existing.warmup?.instructionDatesByClassPeriod || {},
      },
      dol: {
        ...(existing.dol || {}),
        enabled: hasDOL && draft.dolEnabled === true,
        minutesBeforeEnd: Math.max(1, Number(draft.dolMinutesBeforeEnd) || 10),
        closeMinutesBeforeEnd: Math.max(0, Number(draft.dolCloseMinutesBeforeEnd ?? existing.dol?.closeMinutesBeforeEnd ?? 5)),
        instructionDate: draft.dolInstructionDate || existing.dol?.instructionDate || null,
        instructionDatesByClassPeriod: draft.dolInstructionDatesByClassPeriod || existing.dol?.instructionDatesByClassPeriod || {},
        questionIndex: dolQuestionIndex,
      },
      publicationSettings: {
        ...(existing.publicationSettings || {}),
        strategy: draft.publicationStrategy || existing.publicationSettings?.strategy || 'hybrid',
        includeWarmupInClassroom: draft.includeWarmupInClassroom === true,
        homeworkDueAt: draft.homeworkDueAt ? new Date(draft.homeworkDueAt).toISOString() : null,
      },
      classroomPackage: publishingIntent.classroomPackage,
      lessonResources: publishingIntent.lessonResources,
      updatedAt: new Date().toISOString(),
    };

    assertFirestoreSafeAssignmentPayload({ ...existing, ...patch });
    // `dol` as the fields this edit changed, not the whole map from this tab's
    // copy (which would carry students' grants with it).
    const { dol: editedDol, ...patchWithoutDol } = patch;
    await updateDoc(doc(db, 'assignments', existing.id), {
      ...patchWithoutDol,
      ...classDolFieldPatch(existing.dol, editedDol, { deleteValue: deleteField() }),
    });
    // Then the contract, through the server, which checks the teacher of record
    // and refuses a change that would contradict released results or open
    // secure sessions. Its refusal is reported, not swallowed: the rest of the
    // setup is saved, and the teacher is told exactly what was not.
    if (contractEdit.kind === TEST_CYCLE_CONTRACT_EDIT.ATTACH) {
      await attachTestCycleContract({ assignmentId: existing.id, ...contractEdit.contract });
    } else if (contractEdit.kind === TEST_CYCLE_CONTRACT_EDIT.POLICY) {
      await updateTestCyclePolicy({ assignmentId: existing.id, policy: contractEdit.policyChanges });
    }

    if (!isLibraryAssignment(existing) && shouldAutoPublishClassroomPackage({ ...existing, ...patch })) {
      try {
        await updateAssignmentClassroomPublications({ assignmentId: existing.id });
      } catch (classroomError) {
        console.warn('Classroom sync after assignment setup edit failed:', classroomError);
        toastWarning(
          'Assignment setup saved; Classroom needs attention',
          'MathMaster saved the changes, but Google Classroom could not confirm the updated due date. Open Google Classroom Manager to review it.',
        );
      }
    }

    setAssignmentPreflight(null);
    await fetchAssignments();
    toastSuccess('Assignment setup updated', `“${patch.title}” passed MathMaster’s assignment checks and the reviewed settings were saved.`);
  };

  const confirmAssignmentPreflight = async ({ draft, assignmentV5 }) => {
    setAssignmentPreflightBusy(true);
    try {
      // References to server-only secure manifests cannot be certified by the
      // browser's pure V5 validator. Only Test Cycle candidates pay for this
      // authoritative call, and no assignment is saved/assigned before it
      // passes.
      if (isTestCycleAssignment(assignmentV5)) {
        const authoritative = await preflightTestCycleCandidate({ assignment: assignmentV5 });
        if (authoritative.preflight?.blocked) {
          throw new Error(`This Test Cycle cannot be published:\n${(authoritative.preflight.errors || []).join('\n')}`);
        }
      }
      if (assignmentPreflight?.mode === 'update') {
        await updateExistingAssignmentFromReview({ draft, assignmentV5 });
      } else {
        await handleCreateAssignment(draft, assignmentV5);
      }
    } finally {
      setAssignmentPreflightBusy(false);
    }
  };

  const openQuestionEditor = (assignment) => {
    setQuestionEditorAssignment(assignment);
  };

  const saveQuestionEditor = async ({ title, questions, liveRepairs = [], appendedSections = [] }) => {
    if (!questionEditorAssignment?.id) return;
    const normalizedQuestions = normalizeAssignmentQuestions(questions);
    const included = normalizedQuestions.filter(questionIsIncluded);
    if (!included.length) throw new Error('At least one included question is required.');

    // The FINAL candidate is what is judged: a swap's replacement goes in its
    // own appended section (so no stored index moves), and Pre-Flight judges
    // every question that stays active while setting aside the ones the
    // teacher excluded or retired (assignmentV5PreflightModel).
    const candidateV5 = storedAssignmentToV5(withAppendedQuestionSections(questionEditorAssignment, appendedSections), {
      titleOverride: title,
      questions: normalizedQuestions,
    });
    const model = buildAssignmentV5PreflightModel(candidateV5);
    if (!model.isValid) {
      throw new Error(`These question edits cannot be saved until MathMaster’s assignment checks are clean:\n${model.errors.join('\n')}`);
    }
    const persistence = canonicalV5PersistencePatch(model.assignmentV5);
    const persistedQuestions = flattenV5Sections(model.assignmentV5);
    const originalEditorQuestions = getStoredAssignmentQuestions(questionEditorAssignment);
    const weightChanges = persistedQuestions.flatMap((question, index) => {
      const before = originalEditorQuestions[index];
      if (!before || String(before.questionId || '') !== String(question.questionId || '')) return [];
      const beforeWeight = normalizeQuestionWeight(before);
      const afterWeight = normalizeQuestionWeight(question);
      return Math.abs(beforeWeight - afterWeight) > 1e-9
        ? [{ questionId: question.questionId, questionIndex: index, beforeWeight, afterWeight }]
        : [];
    });
    const dolIndex = resolveDOLQuestionIndex({
      ...questionEditorAssignment,
      questions: persistedQuestions,
    });
    const correctedAt = new Date().toISOString();
    const assignmentPatch = {
      ...persistence,
      'dol.questionIndex': dolIndex >= 0 ? dolIndex : null,
      updatedAt: correctedAt,
    };

    const needsLiveGradeTransaction = !isLibraryAssignment(questionEditorAssignment)
      && ((Array.isArray(liveRepairs) && liveRepairs.length > 0) || weightChanges.length > 0);
    // A viewport repair reframes the picture; it never rewrites a response
    // control, so it earns no correction credit and no returned attempt.
    const presentationOnlyLiveRepair = Array.isArray(liveRepairs)
      && liveRepairs.length > 0
      && liveRepairs.every((repair) => repair?.repairKind === GRAPH_VIEWPORT_REPAIR_KIND);
    // Nothing in a student's grade document can be affected by where a graph is
    // framed, so a presentation-only repair never opens one. It reads and
    // writes no student record at all: not to migrate a tracker, not to write
    // back an identical one, and not to log that it happened. The repair is
    // recorded once, on the assignment.
    const needsStudentGradeMigration = weightChanges.length > 0
      || (Array.isArray(liveRepairs) && liveRepairs.length > 0 && !presentationOnlyLiveRepair);

    if (needsLiveGradeTransaction) {
      const assignmentId = questionEditorAssignment.id;
      const assignmentRef = doc(db, 'assignments', assignmentId);
      const audienceStudents = allStudents.filter((student) => assignmentIsForStudent(
        questionEditorAssignment,
        {
          classId: student.classId || null,
          classPeriod: student.classPeriod,
        },
      ));

      if (needsStudentGradeMigration && audienceStudents.length > 450) {
        throw new Error(
          'This assignment has too many student records for a browser-side live correction. Use the server migration path so every student is updated atomically.',
        );
      }

      await runTransaction(db, async (transaction) => {
        const liveAssignmentSnapshot = await transaction.get(assignmentRef);
        if (!liveAssignmentSnapshot.exists()) {
          throw new Error('This assignment no longer exists. Nothing was changed.');
        }

        const liveAssignment = {
          id: liveAssignmentSnapshot.id,
          ...liveAssignmentSnapshot.data(),
        };
        if (
          questionEditorAssignment.updatedAt
          && liveAssignment.updatedAt
          && String(questionEditorAssignment.updatedAt) !== String(liveAssignment.updatedAt)
        ) {
          throw new Error(
            'This assignment changed after you opened the editor. Close and reopen it before applying the live repair so newer student-facing content is not overwritten.',
          );
        }

        const liveQuestions = getStoredAssignmentQuestions(liveAssignment);
        liveRepairs.forEach((repair) => {
          const index = Number(repair?.questionIndex);
          const liveQuestion = liveQuestions[index];
          const repairedQuestion = persistedQuestions[index];
          if (!Number.isInteger(index) || index < 0 || !liveQuestion || !repairedQuestion) {
            throw new Error('MathMaster could not match a live repair to its original question index.');
          }
          if (
            String(liveQuestion.questionId || '') !== String(repair.questionId || '')
            || String(repairedQuestion.questionId || '') !== String(repair.questionId || '')
          ) {
            throw new Error(
              'A question ID or position changed while the assignment was live. The repair was cancelled to protect student progress.',
            );
          }
          if (
            repair.beforeFingerprint
            && questionFingerprint(liveQuestion) !== repair.beforeFingerprint
          ) {
            throw new Error(
              'The live question changed after this repair was prepared. Reopen the editor and prepare the correction again.',
            );
          }
        });

        weightChanges.forEach((change) => {
          const liveQuestion = liveQuestions[change.questionIndex];
          const weightedQuestion = persistedQuestions[change.questionIndex];
          if (
            !liveQuestion
            || !weightedQuestion
            || String(liveQuestion.questionId || '') !== String(change.questionId || '')
            || String(weightedQuestion.questionId || '') !== String(change.questionId || '')
          ) {
            throw new Error('A weighted question moved or changed identity. Reopen the editor before changing live grade weights.');
          }
          if (Math.abs(normalizeQuestionWeight(liveQuestion) - change.beforeWeight) > 1e-9) {
            throw new Error('A question weight changed after you opened the editor. Reopen it before recalculating live grades.');
          }
        });

        const gradeEntries = needsStudentGradeMigration
          ? await Promise.all(audienceStudents.map(async (student) => {
            const studentRef = doc(db, 'grades', student.id);
            const snapshot = await transaction.get(studentRef);
            return { student, studentRef, snapshot };
          }))
          : [];

        gradeEntries.forEach(({ studentRef, snapshot }) => {
          if (!snapshot.exists()) return;
          const studentData = snapshot.data() || {};
          const gradesByAssignment = studentData.gradesByAssignment || {};
          const assignmentTracker = gradesByAssignment[assignmentId];
          if (assignmentTracker === undefined) return;

          const studentPatch = {};
          let nextTracker = assignmentTracker;
          if (Array.isArray(liveRepairs) && liveRepairs.length > 0) {
            nextTracker = repairAssignmentTrackerForLiveCorrections({
              assignmentTracker: nextTracker,
              questions: persistedQuestions,
              repairs: liveRepairs,
              correctedAt,
            });
          }
          if (weightChanges.length > 0) {
            nextTracker = repairAssignmentTrackerForGranularWorkflowCredit({
              assignmentTracker: nextTracker,
              questions: persistedQuestions,
              questionIndices: weightChanges.map((change) => change.questionIndex),
              correctedAt,
            });
          }
          if (nextTracker !== assignmentTracker || (Array.isArray(liveRepairs) && liveRepairs.length > 0)) {
            studentPatch.gradesByAssignment = {
              ...gradesByAssignment,
              [assignmentId]: nextTracker,
            };
          }
          if (weightChanges.length > 0) {
            studentPatch.classroomReleaseSignals = {
              ...(studentData.classroomReleaseSignals || {}),
              [assignmentId]: {
                reason: 'manual-retry',
                requestedAt: correctedAt,
                source: 'question-weight-change',
              },
            };
          }
          if (Object.keys(studentPatch).length > 0) transaction.update(studentRef, studentPatch);
        });

        // The live repair audit trail lives with the assignment, not with any
        // student record, so a display-only correction is recorded without
        // touching attempts, responses, grades or progress.
        const priorLiveRepairHistory = Array.isArray(liveAssignment.liveRepairHistory)
          ? liveAssignment.liveRepairHistory
          : [];
        const liveRepairAudit = (Array.isArray(liveRepairs) ? liveRepairs : []).map((repair) => ({
          kind: repair?.repairKind || 'response-entry-repair',
          questionId: repair?.questionId || null,
          questionIndex: Number(repair?.questionIndex),
          affectedFieldIds: Array.isArray(repair?.affectedFieldIds) ? repair.affectedFieldIds : [],
          changedViewportKeys: Array.isArray(repair?.changedViewportKeys) ? repair.changedViewportKeys : [],
          correctedAt,
        }));

        if (liveRepairAudit.length) {
          assignmentPatch.liveRepairHistory = [...priorLiveRepairHistory, ...liveRepairAudit].slice(-50);
        }

        transaction.update(assignmentRef, assignmentPatch);
      });

      if (weightChanges.length > 0 && Array.isArray(liveRepairs) && liveRepairs.length > 0) {
        toastSuccess(
          'Live repairs and grade weights saved',
          'Student responses and attempt history were preserved. MathMaster recalculated weighted grades and queued Google Classroom to reconcile the updated score.',
        );
      } else if (weightChanges.length > 0) {
        toastSuccess(
          'Grade weights saved',
          'Existing responses and attempts were not changed. MathMaster recalculated the assignment using the new question weights and queued Google Classroom to reconcile the updated score.',
        );
      } else if (presentationOnlyLiveRepair) {
        toastSuccess(
          'Graph viewport corrected',
          'The graph is now framed so students can see the whole picture. This is a display-only change: attempts, responses, grades and progress were left exactly as they were.',
        );
      } else {
        toastSuccess(
          'Safe live repair saved',
          'The corrected response controls are live. Existing student attempts were preserved, affected rejected responses were protected from score loss, and exhausted students received a repair retry only when they still had another incorrect part.',
        );
      }
    } else {
      await updateDoc(doc(db, 'assignments', questionEditorAssignment.id), assignmentPatch);
    }

    setQuestionEditorAssignment(null);
    await fetchAssignments();
  };

  // Students in the class the teacher is working in.
  //
  // Membership follows `classId`. A student whose record predates the class
  // migration has no classId at all, so they are matched on the period the
  // class publishes — which is a compatibility path, not the rule, and it is
  // why an unmigrated student can still appear in exactly one roster.
  const studentsInActiveClass = useMemo(() => studentsInClass({
    students: allStudents,
    classes,
    classId: activeClass.classId,
    // Only when a class is actually selected. With no class chosen the roster is
    // every student, and passing a stale period here would silently filter it.
    classPeriod: activeClass.classId ? activeClass.classPeriod : null,
  }), [allStudents, classes, activeClass.classId, activeClass.classPeriod]);

  // Analytics names students by displayName; build those copies once per roster
  // change, not on every App render.
  const teacherAnalyticsStudents = useMemo(() => (
    teacherTab === 'analytics'
      ? (activeClass.classId ? studentsInActiveClass : allStudents)
        .map((student) => ({ ...student, displayName: formatStudentName(student) }))
      : []
  ), [teacherTab, activeClass.classId, studentsInActiveClass, allStudents]);

  // THE NEEDS-ATTENTION QUEUE.
  //
  // Assembled here rather than inside Teacher Home because every input already
  // lives at this level and none of it should be recomputed per screen. The
  // engine itself is pure and lives in `platform/teacher/needsAttention.js`, so
  // what counts as worth interrupting a teacher about is testable and is not
  // buried in a component.
  //
  // Weekly-path completion is read for ONE class at a time — it is a Cloud
  // Function call per class, and firing five of them to render a landing page
  // would be a poor trade. So with a class selected the queue includes weekly
  // completion; with "All classes" selected it covers academic and system
  // findings across everyone and the panel says the weekly half is missing.
  // The queue is a statement about the week, not about this second. Keying it
  // to the start of the day keeps a thirty-second display tick from rebuilding
  // it — and from making a "3 items" badge flicker while a teacher reads it.
  // The week the Path grade belongs to, and whether it has finished. Both are
  // read by the gradebook panel; the second gates Classroom review, because a
  // student who finishes on Sunday should not be graded on Wednesday's work.
  const weeklyPathWeekKey = useMemo(() => {
    const record = classesById[activeClass.classId] || null;
    const config = storedWeeklyGoalForClassContext(weeklyGoalsByClass, {
      classId: activeClass.classId, classPeriod: record?.period || '',
    }) || {};
    return weekKeyFor(now, config.weekStartsOn || 1);
  }, [classesById, activeClass.classId, weeklyGoalsByClass, Math.floor(now / 3_600_000)]);

  const weeklyPathWeekComplete = useMemo(() => {
    const record = classesById[activeClass.classId] || null;
    const config = storedWeeklyGoalForClassContext(weeklyGoalsByClass, {
      classId: activeClass.classId, classPeriod: record?.period || '',
    }) || {};
    return now > dueAtFor(now, {
      weekStartsOn: config.weekStartsOn || 1,
      dueDayOfWeek: config.dueDayOfWeek ?? 0,
    });
  }, [classesById, activeClass.classId, weeklyGoalsByClass, Math.floor(now / 3_600_000)]);

  const queueDayStart = useMemo(() => new Date(now).setHours(0, 0, 0, 0), [Math.floor(now / 3_600_000)]);

  const needsAttentionQueue = useMemo(() => {
    if (!['home', 'classesWorkspace'].includes(teacherTab)) return [];
    const scoped = activeClass.classId ? studentsInActiveClass : allStudents;
    const weeklyLoaded = Boolean(activeClass.classId) && weeklyPathProgressLoadedFor === activeClass.classId;
    const weeklyByStudentId = !weeklyLoaded ? {} : Object.fromEntries(buildTeacherWeeklyView(
      teacherWeeklyRoster.map((student) => ({
        studentId: student.id,
        studentName: formatStudentName(student, { lastFirst: false }),
        goal: teacherWeeklyGoalsByStudent[student.id] || null,
        completions: weeklyPathCompletionsByStudent[student.id] || [],
      })).filter((entry) => entry.goal),
      { now: queueDayStart },
    ).map((row) => [row.studentId, row]));

    const classSizes = Object.fromEntries(classes.map((entry) => [
      entry.classId,
      studentsInClass({ students: allStudents, classes, classId: entry.classId }).length,
    ]));

    // How far through the week we are, so nobody is told on Monday morning that
    // a student has not finished the week's work. The week runs Monday to Sunday
    // and closes at midnight Sunday night, so Monday is 0 and Sunday is 1 — the
    // weekend is still working time, not a week already gone.
    const day = new Date(queueDayStart).getDay();
    const weekFraction = Math.min(1, Math.max(0, ((day + 6) % 7) / 6));

    return buildNeedsAttentionQueue({
      students: scoped.map((student) => ({ ...student, displayName: formatStudentName(student) })),
      profilesByStudentId: teacherLearningProfiles,
      weeklyByStudentId,
      classSizes,
      unplaceable: unplaceableStudents({ students: allStudents, classes })
        .map((student) => ({ ...student, displayName: formatStudentName(student) })),
      weeklyProgressTruncated: weeklyPathTruncated,
      classCount: classes.filter((entry) => entry?.status !== 'archived').length,
      weekFraction,
    });
  }, [
    activeClass.classId, studentsInActiveClass, allStudents, classes,
    teacherLearningProfiles, teacherWeeklyRoster, teacherWeeklyGoalsByStudent,
    weeklyPathCompletionsByStudent, weeklyPathTruncated, weeklyPathProgressLoadedFor, queueDayStart, teacherTab,
  ]);

  const profileDrawerRosterStudent = useMemo(
    () => allStudents.find((student) => student.id === profileDrawerStudentId)
      || teacherRosterSummaries.find((student) => student.id === profileDrawerStudentId)
      || null,
    [allStudents, teacherRosterSummaries, profileDrawerStudentId],
  );

  const profileDrawerStudent = profileDrawerStudentDetail?.id === profileDrawerStudentId
    ? profileDrawerStudentDetail
    : profileDrawerRosterStudent;

  useEffect(() => {
    if (user?.role !== 'teacher' || !profileDrawerStudentId) {
      setProfileDrawerStudentDetail(null);
      return undefined;
    }
    const current = allStudents.find((student) => student.id === profileDrawerStudentId);
    if (current?.gradesByAssignment !== undefined) {
      setProfileDrawerStudentDetail(current);
      return undefined;
    }

    let active = true;
    setProfileDrawerStudentDetail(null);
    getDoc(doc(db, 'grades', profileDrawerStudentId))
      .then((snapshot) => {
        if (!active || !snapshot.exists()) return;
        const data = snapshot.data() || {};
        setProfileDrawerStudentDetail({
          id: snapshot.id,
          ...data,
          profile: normalizeStudentProfile(data.profile || data),
        });
      })
      .catch((error) => {
        if (active) console.error('Could not load student profile detail:', error);
      });
    return () => { active = false; };
  }, [user?.role, profileDrawerStudentId, allStudents]);

  const profileDrawerLearningProfile = useMemo(() => {
    if (!profileDrawerStudent) return null;
    const globalProfile = teacherLearningProfiles[profileDrawerStudent.id] || null;
    if (globalProfile) return globalProfile;
    if (profileDrawerStudent.gradesByAssignment === undefined) return null;

    const rows = collectStudentEvidence({ student: profileDrawerStudent, assignments });
    const { events } = evidenceRowsToEvents(rows);
    const legacyProfile = buildStudentMasteryProfile({ student: profileDrawerStudent, assignments });
    return buildStudentLearningProfile({
      courseId: resolveStudentCourseContext({ student: profileDrawerStudent, classesById, courseProfiles }).courseId,
      evidenceEvents: events,
      masteryProfilesByTeks: adaptLegacyMasteryToPhase5({ legacyProfile, evidenceRows: rows }),
    });
  }, [profileDrawerStudent, teacherLearningProfiles, assignments, classesById, courseProfiles]);

  useEffect(() => {
    if (user?.role !== 'teacher' || !user.email || !profileDrawerStudentId) {
      setProfileSupportHistory({ studentId: null, events: [], summaries: [] });
      return undefined;
    }

    let active = true;
    setProfileSupportHistory({ studentId: profileDrawerStudentId, events: [], summaries: [] });
    fetchStudentSupportHistory({
      db,
      teacherEmail: user.email,
      studentId: profileDrawerStudentId,
    }).then((history) => {
      if (!active) return;
      setProfileSupportHistory({
        studentId: profileDrawerStudentId,
        events: history.events || [],
        summaries: history.summaries || [],
      });
    }).catch((error) => {
      if (!active) return;
      console.error('Could not load full student support history:', error);
      // Recent globally subscribed records remain available below even if this
      // focused historical read fails.
      setProfileSupportHistory({ studentId: profileDrawerStudentId, events: [], summaries: [] });
    });

    return () => { active = false; };
  }, [user?.role, user?.email, profileDrawerStudentId]);

  const profileDrawerSupportEvents = useMemo(() => {
    if (!profileDrawerStudentId) return [];
    const merged = new Map();
    [
      ...(profileSupportHistory.studentId === profileDrawerStudentId ? profileSupportHistory.events : []),
      ...studentSupportEvents.filter((event) => event.studentId === profileDrawerStudentId),
    ].forEach((event) => {
      const key = event.id || `${event.signalKey || ''}:${event.createdAt || ''}`;
      merged.set(key, event);
    });
    return [...merged.values()].sort((a, b) => (
      Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '')
    ));
  }, [profileDrawerStudentId, profileSupportHistory, studentSupportEvents]);

  const profileDrawerSessionSummaries = useMemo(() => {
    if (!profileDrawerStudentId) return [];
    const merged = new Map();
    [
      ...(profileSupportHistory.studentId === profileDrawerStudentId ? profileSupportHistory.summaries : []),
      ...studentSessionSummaries.filter((summary) => summary.studentId === profileDrawerStudentId),
    ].forEach((summary) => merged.set(summary.id || summary.sessionKey, summary));
    return [...merged.values()].sort((a, b) => Number(b.endedAt || 0) - Number(a.endedAt || 0));
  }, [profileDrawerStudentId, profileSupportHistory, studentSessionSummaries]);

  // The plan shown in the drawer is the SAME plan the student's own screen is
  // built from. If the two ever disagree, a teacher is being shown a
  // recommendation the student never received, which is worse than showing none.
  const profileDrawerPlan = useMemo(() => {
    if (!profileDrawerStudent) return null;
    const context = resolveStudentCourseContext({ student: profileDrawerStudent, classesById, courseProfiles });
    const studentAssignments = assignments.filter((assignment) => (
      assignmentIsForStudent(assignment, { classId: profileDrawerStudent.classId || null, classPeriod: profileDrawerStudent.classPeriod })
    ));
    const options = buildStudentPathOptions({
      student: profileDrawerStudent,
      assignments: studentAssignments,
      courseId: context.courseId,
      pacing: storedPacingForClassContext(pacingByClass, {
        classId: profileDrawerStudent.classId, classPeriod: profileDrawerStudent.classPeriod,
      }),
      teacherOverrides: overridesForClassContext(skillOverrides, {
        classId: profileDrawerStudent.classId, classPeriod: profileDrawerStudent.classPeriod,
      }),
    });
    return buildWeeklyPathPlan({
      options,
      courseId: context.courseId,
      profile: profileDrawerLearningProfile,
      sessions: context.courseLevel === 'honors' ? 5 : 4,
      honors: context.courseLevel === 'honors',
    });
  }, [profileDrawerStudent, classesById, courseProfiles, assignments, pacingByClass, skillOverrides, profileDrawerLearningProfile]);

  // A view that cannot answer anything across five classes gets one chosen for
  // it rather than being left on an option its own bar does not offer. Weekly
  // goals and pacing are settings that belong to one class; there is no
  // meaningful average of them.
  useEffect(() => {
    const scope = CLASS_SCOPED_TABS[teacherTab];
    if (!scope || scope.allowAllClasses !== false || activeClass.classId) return;
    const first = classes.find((entry) => entry?.status !== 'archived') || null;
    if (first) setActiveClass({ classId: first.classId, classPeriod: first.period || null });
  }, [teacherTab, activeClass.classId, classes]);

  // Cmd/Ctrl-K from anywhere in the teacher workspace. Bound at this level
  // rather than on a screen, because the whole value of the palette is that it
  // works from wherever the teacher already is.
  useEffect(() => {
    if (user?.role !== 'teacher') return undefined;
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 'k') {
        event.preventDefault();
        setQuickSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [user?.role]);

  // The Gradebook follows the class bar.
  //
  // Guarded on an actual difference rather than on the id alone: navigating
  // into one student's gradebook sets BOTH the filter (with that student) and
  // the workspace class, and an unguarded effect would then fire and throw the
  // student away — sending the teacher back to the class list they just left.
  useEffect(() => {
    const desired = activeClass.classId || '';
    setGradebookFilter((current) => (current.classId === desired ? current : {
      classId: desired,
      classPeriod: activeClass.classPeriod || '',
      // The assignment and the student belonged to the previous class. Carrying
      // either across would show one class's work under another class's name.
      assignmentId: null,
      student: null,
    }));
  }, [activeClass.classId, activeClass.classPeriod]);

  const handleViewClassGradebook = (classOrPeriod, student = null) => {
    const studentClassId = student?.classId || '';
    const classRecord = classes.find((entry) => entry.classId === studentClassId)
      || classes.find((entry) => entry.classId === classOrPeriod)
      || classes.find((entry) => entry.period === classOrPeriod)
      || null;
    const resolvedClassId = classRecord?.classId || studentClassId || '';
    const resolvedPeriod = classRecord?.period || student?.classPeriod || String(classOrPeriod || '');
    setGradebookFilter({
      classId: resolvedClassId,
      classPeriod: resolvedPeriod,
      assignmentId: null,
      student,
    });
    // Opening a class's gradebook IS choosing that class. Leaving the workspace
    // context pointed somewhere else would put the class bar and the table it
    // sits above in open disagreement.
    if (resolvedClassId) setActiveClass({ classId: resolvedClassId, classPeriod: resolvedPeriod || null });
    setTeacherTab('grades');
  };

  const handleReleaseAssignmentFeedback = async (assignment) => {
    if (!assignment?.id || !assignmentUsesTeacherReleasePolicy(assignment) || assignmentFeedbackWasReleased(assignment)) return;
    const proceedWithRelease = await confirmAction({
      title: `Release feedback for “${assignment.title}”?`,
      message: 'Students will immediately see Quiz/Test correctness, solution review, and recorded grades. This cannot make already-viewed feedback private again.',
      confirmLabel: 'Release Feedback',
    });
    if (!proceedWithRelease) return;
    setFeedbackReleaseBusyId(assignment.id);
    try {
      const releasedAt = new Date().toISOString();
      await updateDoc(doc(db, 'assignments', assignment.id), {
        feedbackReleased: true,
        feedbackReleasedAt: releasedAt,
        updatedAt: releasedAt,
      });
      toastSuccess('Feedback released', `Students in ${assignment.title} can now see their results.`);
    } catch (error) {
      console.error(error);
      toastError('Could not release assessment feedback', error.message);
    } finally {
      setFeedbackReleaseBusyId(null);
    }
  };

  const resolveTeacherClassContext = (value) => {
    const supplied = value && typeof value === 'object' ? value : {};
    const classId = String(supplied?.classId || '').trim() || null;
    const classRecord = classId ? classes.find((entry) => entry.classId === classId) || null : null;
    const classPeriod = classRecord?.period || String(supplied?.classPeriod || '').trim() || null;
    return {
      classId,
      classPeriod,
      label: classRecord?.name || classPeriod || 'this class',
      key: classId || '',
    };
  };

  const handleUnlockDOLForClass = async (assignment, classContext) => {
    const { classId, classPeriod, label: classLabel, key: classKey } = resolveTeacherClassContext(classContext);
    if (!assignment?.id || !classId || !classPeriod || !classKey) return;
    const state = getDOLState({ assignment, schedule: classSchedule, classId, classPeriod, nowValue: Date.now() });
    if (!state.enabled) {
      toastWarning('No timed DOL', 'This assignment does not have an enabled DOL section.');
      return;
    }
    const needsOpenToday = ['notToday', 'unscheduled'].includes(state.status);
    if (!state.window) {
      toastWarning('Bell schedule needed', `Set today’s A/B day and bell times for ${classPeriod} before controlling its DOL.`);
      return;
    }
    if (state.status === 'active') {
      toastInfo('DOL is already open', `${assignment.title} is already available to ${classLabel}.`);
      return;
    }

    const actionNowMs = Date.now();
    const durationMinutes = Math.max(1, Number(assignment?.dol?.minutesBeforeEnd || 10));
    const closeMinutesBeforeEnd = Math.max(0, Number(assignment?.dol?.closeMinutesBeforeEnd ?? 5));
    const derivedRegularEndMs = Math.max(
      state.window.start.getTime(),
      state.window.end.getTime() - closeMinutesBeforeEnd * 60_000,
    );
    const canRestart = state.status === 'ended' && state.canRestart === true;
    // Once the normal DOL cutoff passes, a teacher can still deliberately
    // reopen the DOL. This is stored as an audited recovery window instead of
    // pretending the original bell-time window never ended.
    // After a teacher "Close now" the DOL grade was finalized exactly as at a
    // normal end, so reopening is always an audited recovery window — the only
    // kind of window the server lets reopen a final DOL grade.
    const reopenAfterTeacherClose = state.status === 'ended' && state.teacherClosed === true;
    const recoveryAfterCutoff = reopenAfterTeacherClose || ((state.status === 'ended' || needsOpenToday)
      && actionNowMs >= (state.regularEndsAt?.getTime?.() || derivedRegularEndMs));
    const beforeClass = state.status === 'beforeClass' || actionNowMs < state.window.start.getTime();

    const proceed = await confirmAction({
      title: recoveryAfterCutoff
        ? `Reopen the DOL for ${classLabel}?`
        : canRestart
          ? `Restart the DOL for ${classLabel}?`
          : needsOpenToday
            ? `Open the DOL today for ${classLabel}?`
            : `Unlock the DOL early for ${classLabel}?`,
      message: reopenAfterTeacherClose
        ? `You closed this DOL for ${classLabel}. MathMaster will open a new ${durationMinutes}-minute teacher window for ${classLabel} only. Work in it counts, existing attempts stay intact, and both the close and the reopen stay on record.`
        : recoveryAfterCutoff
        ? `The normal DOL window has ended. MathMaster will open a new ${durationMinutes}-minute teacher recovery window for ${classLabel} only. Existing attempts and work history stay intact, and the exception is recorded on the assignment.`
        : canRestart
          ? `The earlier DOL timer ended, but instructional DOL time remains. Restart it now for ${classLabel} only. The timer will still stop before the normal DOL cutoff.`
          : needsOpenToday
            ? beforeClass
              ? `This lesson was saved for another instructional day. MathMaster will set today as the DOL date for ${classLabel} only, then open it when class begins with its ${durationMinutes}-minute timer.`
              : `This lesson was saved for another instructional day. MathMaster will set today as the DOL date for ${classLabel} only and open it now with its ${durationMinutes}-minute timer. Other classes stay unchanged.`
            : beforeClass
              ? `The DOL will open when ${classLabel} begins and its ${durationMinutes}-minute timer will start then.`
              : `The DOL will open immediately for ${classLabel} and its ${durationMinutes}-minute timer will start now. Other classes stay locked.`,
      confirmLabel: recoveryAfterCutoff ? 'Reopen DOL' : canRestart ? 'Restart DOL' : needsOpenToday ? 'Open DOL Today' : 'Unlock DOL',
    });
    if (!proceed) return;

    const busyKey = `${assignment.id}:${classKey}`;
    setDolUnlockBusyKey(busyKey);
    try {
      const writeNow = Date.now();
      const openedAt = new Date(writeNow).toISOString();
      const dateKey = localDateKey(writeNow);
      const currentRegularEndMs = state.regularEndsAt?.getTime?.() || derivedRegularEndMs;
      // Re-evaluate after confirmation. If the regular cutoff passed while the
      // dialog was open, safely convert the action into a recovery window.
      const recoveryNow = reopenAfterTeacherClose || ((state.status === 'ended' || needsOpenToday) && writeNow >= currentRegularEndMs);

      // Built by the recovery model so every opening lands in the append-only
      // audit (who, class, before, after, when) — see assessmentRecovery.js.
      // The builder makes today this class's DOL date (instructionDatesByClassId,
      // this class only) and first keeps the date it replaces
      // (scheduledInstructionDatesByClassId), so the teacher can return to it.
      const opening = buildDolWindowOpening({
        assignment,
        classId,
        classPeriod,
        recovery: recoveryNow,
        durationMinutes,
        dateKey,
        teacherId: user?.id || null,
        now: writeNow,
      });

      // Only the class's DOL fields this opening changed; never a student's grant.
      await updateDoc(doc(db, 'assignments', assignment.id), { ...classDolFieldPatch(assignment.dol, opening.dol, { deleteValue: deleteField() }), updatedAt: openedAt });
      if (recoveryNow) {
        toastSuccess('DOL reopened', `${assignment.title} has a fresh ${durationMinutes}-minute recovery window for ${classLabel}. Existing work and attempt history were preserved.`);
      } else if (canRestart) {
        toastSuccess('DOL restarted', `${assignment.title} is open again for ${classLabel} only and will still stop before the normal pack-up window.`);
      } else {
        toastSuccess('DOL unlocked', `${assignment.title} is released for ${classLabel} only. Its timer starts when the unlock takes effect.`);
      }
    } catch (error) {
      console.error(error);
      toastError('Could not open DOL', error.message);
    } finally {
      setDolUnlockBusyKey(null);
    }
  };

  const handleGrantDOLAttemptForClass = async (assignment, classContext) => {
    const { classId, label: classLabel, key: classKey } = resolveTeacherClassContext(classContext);
    if (!assignment?.id || !classId || !classKey) return;
    const currentBonus = resolveTeacherGrantedExtraAttempts({
      assignment,
      activityRole: 'dol',
      classId,
    });
    const proceed = await confirmAction({
      title: `Grant one more DOL attempt to ${classLabel}?`,
      message: `Every student in ${classLabel} will receive one additional attempt on each DOL question in this assignment. Existing attempts, scores, and response history are preserved. The class bonus will become ${currentBonus + 1}.`,
      confirmLabel: 'Grant +1 Attempt',
    });
    if (!proceed) return;

    const busyKey = `${assignment.id}:${classKey}`;
    setDolAttemptGrantBusyKey(busyKey);
    try {
      const nowMs = Date.now();
      const changedAt = new Date(nowMs).toISOString();
      const { dol } = buildDolAttemptGrant({
        assignment,
        scope: { type: 'class', classId },
        teacherId: user?.id || null,
        now: nowMs,
      });
      // The class grant only (`dol.attemptGrantsByClassId`, its audit entry).
      await updateDoc(doc(db, 'assignments', assignment.id), { ...classDolFieldPatch(assignment.dol, dol, { deleteValue: deleteField() }), updatedAt: changedAt });
      toastSuccess('Extra DOL attempt granted', `${classLabel} now has ${Math.min(20, currentBonus + 1)} teacher-granted extra DOL attempt${Math.min(20, currentBonus + 1) === 1 ? '' : 's'}.`);
    } catch (error) {
      console.error(error);
      toastError('Could not grant DOL attempt', error.message);
    } finally {
      setDolAttemptGrantBusyKey(null);
    }
  };

  /*
   * ONE MORE DOL ATTEMPT FOR SELECTED STUDENTS — an absent student, a device
   * that died mid-DOL. Adds to any class grant; prior attempts and scores are
   * untouched. A student's grant is THEIR control: the server changes their
   * private record (setStudentAssignmentControls), from the count it holds —
   * not this tab's — and records who granted it in the staff-only history.
   * This browser never writes `dol.attemptGrantsByStudentId`
   * (platform/assessment/dolAttemptGrantClient.js). Students are grouped by
   * their own class, at most 60 per call; one request per set of students is
   * in flight at a time, so a double-click grants once.
   */
  const studentControlsGateRef = useRef(null);
  if (!studentControlsGateRef.current) studentControlsGateRef.current = createControlsRequestGate();
  const handleGrantDOLAttemptForStudents = async (assignment, students = []) => {
    const chosen = (students || []).filter((student) => student?.id);
    if (!assignment?.id || !chosen.length) return;
    const requestKey = controlsRequestKey({ assignmentId: assignment.id, studentIds: chosen.map((student) => student.id), kind: 'dolAttempts' });
    // The first click is still on its way to the server: nothing to confirm twice.
    if (studentControlsGateRef.current.pending(requestKey)) return;
    const names = chosen.map((student) => formatStudentName(student)).join(', ');
    const proceed = await confirmAction({
      title: chosen.length === 1 ? `Grant one more DOL attempt to ${names}?` : `Grant one more DOL attempt to ${chosen.length} students?`,
      message: `${chosen.length === 1 ? names : names} will receive one additional attempt on each DOL question in ${assignment.title}. Existing attempts, scores, and response history are preserved, and the grant is recorded.`,
      confirmLabel: 'Grant +1 Attempt',
    });
    if (!proceed) return;
    const busyKey = `${assignment.id}:students:${chosen.map((student) => student.id).join('+')}`;
    setDolAttemptGrantBusyKey(busyKey);
    try {
      const { duplicate, promise } = studentControlsGateRef.current.run(requestKey, async () => {
        const { calls, unplaced } = planStudentDolGrant({
          assignmentId: assignment.id,
          students: chosen,
          fallbackClassId: activeClass?.classId || null,
        });
        const outcome = await runStudentControlsCalls({ call: setStudentAssignmentControls, calls });
        return { ...outcome, unplaced };
      });
      if (duplicate) return;
      const { students: granted, failures, unplaced } = await promise;
      const nameOf = (studentId) => formatStudentName(chosen.find((student) => student.id === studentId) || { id: studentId });
      if (granted.length) {
        const only = granted.length === 1 ? granted[0] : null;
        toastSuccess('Extra DOL attempt granted', only
          ? `${nameOf(only.studentId)} now has ${only.dolExtraAttempts} extra ${only.dolExtraAttempts === 1 ? 'attempt' : 'attempts'} of their own on each DOL question.`
          : `${granted.length} students have one more attempt on each DOL question.`);
      }
      if (failures.length || unplaced.length) {
        const refused = failures.flatMap((failure) => failure.studentIds.map((studentId) => `${nameOf(studentId)} — ${failure.message}`));
        const noClass = unplaced.map((studentId) => `${nameOf(studentId)} — not in a class`);
        toastError('Some DOL attempts were not granted', [...refused, ...noClass].slice(0, 6).join(' · '));
      }
    } catch (error) {
      console.error(error);
      toastError('Could not grant DOL attempt', error.message);
    } finally {
      setDolAttemptGrantBusyKey(null);
    }
  };

  /*
   * CLOSE NOW · +5 MIN · NOT TODAY · BACK TO THE SCHEDULED DAY — for one class.
   *
   * Real periods get interrupted (fire drills, assemblies, classwork that runs
   * long). Each action is built by the audited recovery model, asks first, and
   * touches only this class. When each is offered is decided in
   * platform/teacher/classLessonControls.js:
   *   - close / extend only while the DOL is open (a close is a normal end);
   *   - move / back-to-scheduled only before it opens (a date change never
   *     closes or finalizes anything, and the original day is always kept).
   */
  const handleDolControlForClass = async (assignment, classContext, control = {}) => {
    const { classId, classPeriod, label: classLabel, key: classKey } = resolveTeacherClassContext(classContext);
    if (!assignment?.id || !classId || !classKey) return;
    const action = String(control?.action || '');
    const nowMs = Date.now();
    const state = getDOLState({ assignment, schedule: classSchedule, classId, classPeriod, nowValue: nowMs });
    const todayKey = localDateKey(nowMs);
    const teacherId = user?.id || null;
    const clockOf = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const dayOf = (key) => {
      if (!key) return 'another day';
      const [year, month, day] = String(key).split('-').map(Number);
      return new Date(year, month - 1, day, 12).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    };
    const ranToday = ['active', 'ended'].includes(state.status) && state.instructionDateKey === todayKey;

    let confirmation;
    let build;
    let success;
    if (action === 'close') {
      if (state.status !== 'active') {
        toastInfo('The DOL is not open', `${assignment.title} is not open for ${classLabel} right now.`);
        return;
      }
      confirmation = {
        title: `Close the DOL now for ${classLabel}?`,
        message: `Students in ${classLabel} stop working on the DOL now, exactly as if its timer had run out: answers so far are kept and graded. Other classes are unaffected, and you can reopen it afterwards.`,
        confirmLabel: 'Close DOL',
      };
      build = () => buildDolClose({ assignment, classId, dateKey: todayKey, teacherId, now: Date.now() });
      success = ['DOL closed', `${assignment.title} · ${classLabel}`];
    } else if (action === 'extend') {
      if (state.status !== 'active') {
        toastInfo('The DOL is not open', 'Only an open DOL can be given more time. Use Reopen after it ends.');
        return;
      }
      const minutes = Math.max(1, Math.min(30, Number(control?.minutes) || 5));
      const classEndMs = state.window?.end?.getTime?.() ?? null;
      const proposedMs = Math.min(classEndMs ?? Number.POSITIVE_INFINITY, Math.max(state.endsAt.getTime(), nowMs) + minutes * 60_000);
      confirmation = {
        title: `Give ${classLabel} ${minutes} more minutes on the DOL?`,
        message: `The DOL stays open for ${classLabel} until ${clockOf(proposedMs)}${classEndMs !== null && proposedMs >= classEndMs ? ' — the end of the period' : ''}. Work in the extra time counts. Other classes are unaffected.`,
        confirmLabel: `Extend to ${clockOf(proposedMs)}`,
      };
      build = () => buildDolExtension({ assignment, classId, dateKey: todayKey, currentEndsAtMs: state.endsAt.getTime(), minutes, capAtMs: classEndMs, teacherId, now: Date.now() });
      success = ['DOL extended', `${assignment.title} · ${classLabel} · open until ${clockOf(proposedMs)}`];
    } else if (action === 'move') {
      const toDateKey = String(control?.toDateKey || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(toDateKey)) {
        toastWarning('Choose a day', 'Pick the day this class should take the DOL.');
        return;
      }
      if (ranToday) {
        toastWarning('The DOL already ran today', `Students in ${classLabel} have already had today’s DOL window, so its day stays as it is.`);
        return;
      }
      confirmation = {
        title: `Move ${classLabel}’s DOL to ${dayOf(toDateKey)}?`,
        message: `The DOL will not open for ${classLabel} ${state.instructionDateKey === todayKey ? 'today' : `on ${dayOf(state.instructionDateKey)}`}; it runs at the end of class on ${dayOf(toDateKey)} instead. Nothing is closed or graded, other classes keep their day, and the original day is kept so you can move it back.`,
        confirmLabel: 'Move DOL',
      };
      build = () => buildDolDateMove({ assignment, classId, classPeriod, toDateKey, todayKey, teacherId, now: Date.now() });
      success = ['DOL moved', `${assignment.title} · ${classLabel} · ${dayOf(toDateKey)}`];
    } else if (action === 'restore') {
      const saved = scheduledDolDateFor(assignment, classId);
      if (!saved) {
        toastInfo('Already on schedule', `${assignment.title} is on its scheduled day for ${classLabel}.`);
        return;
      }
      if (ranToday) {
        toastWarning('The DOL already ran today', `Students in ${classLabel} have used today’s DOL window, so the day change stays on record.`);
        return;
      }
      confirmation = {
        title: `Put ${classLabel}’s DOL back on its scheduled day?`,
        message: saved.resolvedDateKey
          ? `The DOL returns to ${dayOf(saved.resolvedDateKey)} and its automatic timing for ${classLabel}. Other classes are unaffected.`
          : `The DOL returns to having no scheduled day for ${classLabel}. Other classes are unaffected.`,
        confirmLabel: 'Back to schedule',
      };
      build = () => buildDolScheduleRestore({ assignment, classId, todayKey, teacherId, now: Date.now() });
      success = ['DOL back on schedule', `${assignment.title} · ${classLabel}`];
    } else {
      return;
    }

    const proceed = await confirmAction(confirmation);
    if (!proceed) return;
    const busyKey = `${assignment.id}:${classKey}`;
    setDolControlBusyKey(busyKey);
    try {
      const { dol } = build();
      await updateDoc(doc(db, 'assignments', assignment.id), { ...classDolFieldPatch(assignment.dol, dol, { deleteValue: deleteField() }), updatedAt: new Date().toISOString() });
      toastSuccess(success[0], success[1]);
    } catch (error) {
      console.error(error);
      toastError('Could not change the DOL', error.message);
    } finally {
      setDolControlBusyKey(null);
    }
  };

  /*
   * THE ASSIGNMENT'S WORLD IS ONE CLICK FROM ANYWHERE IT APPEARS.
   * Each hand-off below arrives with its context already chosen: the class,
   * the assignment, the student. Nothing asks the teacher to choose again.
   */
  const openAssignmentHub = (assignmentId, classId = null) => {
    if (!assignmentId) return;
    setAssignmentHubTarget({ assignmentId, classId: classId || activeClass.classId || null });
  };

  /*
   * Home and the class page run on the lightweight live roster (no grade
   * records) so they stay fast during class. When a teacher asks an
   * assignment's hub "who has finished?", read just that class's grade
   * documents once — the same per-student documents, and the same teacher-of-
   * record rule, the Gradebook's live query uses — instead of sending them to
   * the Gradebook. Read-only.
   */
  const loadClassGradeRecords = async (classId) => {
    const roster = studentsInClass({ students: allStudents, classes, classId });
    const snapshots = await Promise.all(roster.map((student) => getDoc(doc(db, 'grades', student.id))));
    return snapshots
      .filter((snapshot) => snapshot.exists())
      .map((snapshot) => ({ id: snapshot.id, ...snapshot.data(), profile: normalizeStudentProfile(snapshot.data()?.profile || snapshot.data()) }));
  };

  const openGradeExport = ({ classIds = [], assignmentId = null } = {}) => {
    setGradeExportScope({ classIds: (classIds || []).filter(Boolean), assignmentId: assignmentId || null, nonce: Date.now() });
    setAssignmentHubTarget(null);
    setTeacherTab('gradeTransfer');
  };

  const openGradebookFor = (classId, assignmentId = null, studentId = null) => {
    const classRecord = classes.find((entry) => entry.classId === classId) || null;
    const student = studentId ? allStudents.find((entry) => entry.id === studentId) || { id: studentId } : null;
    setGradebookFilter({
      classId: classRecord?.classId || classId || '',
      classPeriod: classRecord?.period || '',
      assignmentId: assignmentId || null,
      student,
    });
    if (classRecord?.classId) setActiveClass({ classId: classRecord.classId, classPeriod: classRecord.period || null });
    setGradebookProgressFilter('all');
    setAssignmentHubTarget(null);
    setTeacherTab('grades');
  };

  const openLiveFor = (classContext, assignmentId = null) => {
    if (classContext?.classId) setActiveClass({ classId: classContext.classId, classPeriod: classContext.classPeriod || null });
    setLiveFocus({ classId: classContext?.classId || null, classPeriod: classContext?.classPeriod || null, assignmentId: assignmentId || null, nonce: Date.now() });
    setAssignmentHubTarget(null);
    setTeacherTab('home');
  };

  const handleToggleWarmupForClass = async (assignment, classContext, control = {}) => {
    const { classId, classPeriod, label: classLabel, key: classKey } = resolveTeacherClassContext(classContext);
    if (!assignment?.id || !classId || !classPeriod || !classKey) return;
    const state = getWarmupState({ assignment, schedule: classSchedule, classId, classPeriod, nowValue: Date.now() });
    if (!state.enabled) {
      toastWarning('No Warm-Up section', 'This assignment does not have an authored Warm-Up section.');
      return;
    }
    if (!state.window) {
      toastWarning('Bell schedule needed', `Set today’s A/B day and bell times for ${classPeriod} before controlling its Warm-Up.`);
      return;
    }

    const requestedAction = String(control?.action || '').trim();
    const needsOpenToday = ['notToday', 'unscheduled'].includes(state.status);
    const action = ['close', 'reopen', 'timer'].includes(requestedAction)
      ? requestedAction
      : state.status === 'active'
        ? 'close'
        : 'reopen';
    const requestedTimerMinutes = Number(control?.autoCloseMinutes);
    const timerMinutes = Number.isFinite(requestedTimerMinutes)
      ? Math.max(1, Math.min(60, Math.round(requestedTimerMinutes)))
      : 5;
    const nowMs = Date.now();

    // A stale instructional date must not hide the teacher's live control, but
    // it also must not let a teacher reopen yesterday's class after the bell.
    if (nowMs > state.window.end.getTime()) {
      toastWarning('Class period ended', 'The Warm-Up cannot be reopened after this class period has ended.');
      return;
    }
    if (state.opensAt && nowMs < state.opensAt.getTime()) {
      toastInfo('Warm-Up has not opened yet', `It opens ${state.minutesBeforeStart} minutes before ${classLabel} begins.`);
      return;
    }
    if (state.status === 'ended') {
      toastWarning('Class period ended', 'The Warm-Up is already read-only because this class period has ended.');
      return;
    }

    const timerClosesAt = action === 'timer'
      ? new Date(Math.min(state.window.end.getTime(), nowMs + timerMinutes * 60000))
      : null;

    if (action === 'timer' && timerClosesAt.getTime() <= nowMs) {
      toastWarning('Warm-Up timer unavailable', 'This class period is ending, so there is no time left to reopen the Warm-Up.');
      return;
    }
    if (action === 'reopen' && state.status === 'active') {
      toastInfo('Warm-Up is already open', `${assignment.title} is already available to ${classLabel}.`);
      return;
    }
    if (action === 'close' && state.status === 'closed') {
      toastInfo('Warm-Up is already closed', `${assignment.title} is already read-only for ${classLabel}.`);
      return;
    }

    const closesAtLabel = timerClosesAt?.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const openVerb = needsOpenToday ? 'Open' : 'Reopen';
    const proceed = await confirmAction({
      title: action === 'timer'
        ? `${needsOpenToday ? 'Open' : state.status === 'closed' ? 'Reopen' : 'Keep'} the Warm-Up open with a timer for ${classLabel}?`
        : `${action === 'close' ? 'Close' : openVerb} the Warm-Up${needsOpenToday ? ' today' : ''} for ${classLabel}?`,
      message: action === 'close'
        ? 'Students in this class will keep their saved work for review, but they will not be able to make new Warm-Up submissions. Other classes are unaffected.'
        : action === 'reopen'
          ? needsOpenToday
            ? 'MathMaster will make today the Warm-Up instructional date for this class only. Students can continue immediately; other classes and their dates are unaffected.'
            : 'Students in this class will be able to continue the Warm-Up until you close it again or the class period ends.'
          : `Students in this class will be able to work until ${closesAtLabel}. The Warm-Up will then close automatically and saved work will remain available for review. Other classes are unaffected.`,
      confirmLabel: action === 'close'
        ? 'Close Warm-Up'
        : action === 'reopen'
          ? needsOpenToday ? 'Open Warm-Up Today' : 'Reopen Warm-Up'
          : needsOpenToday
            ? `Open for ${timerMinutes} min`
            : state.status === 'closed'
              ? `Reopen for ${timerMinutes} min`
              : `Set ${timerMinutes}-min timer`,
    });
    if (!proceed) return;

    const busyKey = `${assignment.id}:${classKey}`;
    setWarmupControlBusyKey(busyKey);
    try {
      // The Close / Reopen / Timer record itself is shared and tested
      // (applyWarmupTeacherControl): a reopen pins today's date to this real
      // class id, lifts a manual close, and stays open until this class ends
      // unless the teacher chose a timer. Student work is never touched.
      const changedAtMs = Date.now();
      const dateKey = localDateKey(changedAtMs);
      const { warmup, changedAt } = applyWarmupTeacherControl({
        assignment,
        classId,
        action,
        nowMs: changedAtMs,
        dateKey,
        windowEndMs: state.window.end.getTime(),
        // The close the confirmation showed the teacher.
        timerClosesAtMs: timerClosesAt ? timerClosesAt.getTime() : null,
        teacherIdentity: user?.email || user?.id || 'teacher',
      });
      // Opening a Warm-Up on another day moves this class's Warm-Up day. Keep
      // the day it replaces (once, on the first override) so the class page can
      // say "originally …" — the same rule the DOL follows.
      const scheduledWarmupDateKey = resolveWarmupInstructionDateKey({ assignment, classId, classPeriod });
      if (action !== 'close' && scheduledWarmupDateKey !== dateKey && !assignment.warmup?.scheduledInstructionDatesByClassId?.[classId]) {
        warmup.scheduledInstructionDatesByClassId = {
          ...(assignment.warmup?.scheduledInstructionDatesByClassId || {}),
          [classId]: {
            classDateKey: assignment.warmup?.instructionDatesByClassId?.[classId] || null,
            resolvedDateKey: scheduledWarmupDateKey || null,
            savedAt: changedAt,
          },
        };
      }
      await updateDoc(doc(db, 'assignments', assignment.id), { warmup, updatedAt: changedAt });

      if (action === 'timer') {
        toastSuccess(
          needsOpenToday ? 'Warm-Up opened for today with timer' : state.status === 'closed' ? 'Warm-Up reopened with timer' : 'Warm-Up timer set',
          `${assignment.title} · ${classLabel} · closes automatically at ${closesAtLabel}`,
        );
      } else {
        toastSuccess(
          action === 'close' ? 'Warm-Up closed' : needsOpenToday ? 'Warm-Up opened for today' : 'Warm-Up reopened',
          `${assignment.title} · ${classLabel}`,
        );
      }
    } catch (error) {
      console.error(error);
      toastError(
        action === 'timer' ? 'Could not set Warm-Up timer' : `Could not ${action} Warm-Up`,
        error.message,
      );
    } finally {
      setWarmupControlBusyKey(null);
    }
  };

  const handleToggleSectionAccessForClass = async (assignment, classContext, activityRole) => {
    const { classId, classPeriod, label: classLabel, key: classKey } = resolveTeacherClassContext(classContext);
    if (!assignment?.id || !classId || !classPeriod || !classKey || !['classwork', 'practice'].includes(activityRole)) return;
    const state = getSectionAccessState({ assignment, activityRole, classId, classPeriod, nowValue: Date.now() });
    if (!state.enabled) {
      toastWarning('Section not found', `This assignment does not have an authored ${activityRole} section.`);
      return;
    }
    if (state.practiceOnly) {
      toastInfo('Assignment is in Practice Mode', 'After the final cutoff, all sections stay available for ungraded review and practice.');
      return;
    }
    if (state.status === 'scheduled') {
      toastWarning('Assignment has not opened yet', 'Section controls become active when the assignment is released.');
      return;
    }
    if (!state.lifecycle?.isOpen) {
      toastWarning('Assignment is not open', 'This section cannot be changed while the graded assignment is closed.');
      return;
    }

    const nextState = state.isOpen ? 'closed' : 'open';
    const label = activityRole === 'classwork' ? 'Classwork' : 'Practice';
    const proceed = await confirmAction({
      title: `${nextState === 'open' ? 'Open' : 'Close'} ${label} for ${classLabel}?`,
      message: nextState === 'open'
        ? `Students in ${classLabel} will be able to work in the ${label} section. Other classes are unaffected.`
        : `Students in ${classLabel} will keep saved ${label} work for review, but new graded responses in that section will be locked until you reopen it. Other classes are unaffected.`,
      confirmLabel: `${nextState === 'open' ? 'Open' : 'Close'} ${label}`,
    });
    if (!proceed) return;

    const busyKey = `${assignment.id}:${classKey}:${activityRole}`;
    setSectionAccessBusyKey(busyKey);
    try {
      const changedAt = new Date().toISOString();
      const sectionAccess = { ...(assignment.sectionAccess || {}) };
      const config = { ...(sectionAccess[activityRole] || {}) };
      const entry = { state: nextState, changedAt, changedBy: user?.email || user?.id || 'teacher' };
      config.overridesByClassId = { ...(config.overridesByClassId || {}), [classId]: entry };
      sectionAccess[activityRole] = { ...config, defaultState: config.defaultState === 'closed' ? 'closed' : 'open' };
      await updateDoc(doc(db, 'assignments', assignment.id), { sectionAccess, updatedAt: changedAt });
      toastSuccess(`${label} ${nextState}`, `${assignment.title} · ${classLabel}`);
    } catch (error) {
      console.error(error);
      toastError(`Could not ${nextState === 'open' ? 'open' : 'close'} ${label}`, error.message);
    } finally {
      setSectionAccessBusyKey(null);
    }
  };

  const handleLoadDeliveredRigor = async (studentIds = []) => {
    const ids = (Array.isArray(studentIds) ? studentIds : []).filter(Boolean);
    if (!ids.length || classEvidenceLoading) return;
    setClassEvidenceLoading(true);
    try {
      // Settled, not all: one student with an unreadable history must not cost
      // the teacher the answer for the other twenty-nine.
      const results = await Promise.allSettled(ids.map((id) => fetchStudentEvidenceEvents(id)));
      setClassEvidenceByStudentId(Object.fromEntries(results.map((result, index) => [
        ids[index],
        result.status === 'fulfilled' ? result.value : [],
      ])));
    } finally {
      setClassEvidenceLoading(false);
    }
  };

  // A class change invalidates the loaded evidence. Showing one class's
  // delivered rigor under another class's name is worse than showing none.
  useEffect(() => {
    setClassEvidenceByStudentId({});
  }, [activeClass.classId]);

  const handleGoToClassFromHome = (classContext) => {
    const supplied = classContext && typeof classContext === 'object' ? classContext : { classPeriod: classContext };
    const classPeriod = supplied.classPeriod || null;
    const requestedClassId = supplied.classId || null;
    const matches = (classesRef.current || []).filter((entry) => entry?.status !== 'archived' && entry?.period === classPeriod);
    const resolvedClassId = requestedClassId || (matches.length === 1 ? matches[0].classId : null);
    setActiveClass({ classId: resolvedClassId, classPeriod });
    setHomeNavigationPeriod(classPeriod);
    setTeacherTab('classesWorkspace');
  };

  const handleChangeClassPeriod = async (studentId, newClassId) => {
    try {
      // Class membership is a server-owned relationship. Updating only the
      // legacy period field can leave classId/teacher authorization disagreeing.
      await teacherAdmin.setStudentClass({ studentId, classId: newClassId || null });
      await fetchTeacherRosterSummaries();
    } catch (error) {
      console.error(error);
      toastError('Could not change class', error?.message || 'Class membership could not be updated.');
    }
  };

  // A support profile is saved ONLY as an immutable, dated revision plus its
  // student-readable projection, in one batch (SupportProfileEditor →
  // supportEvidenceStore.saveSupportProfileRevision). This keeps the
  // teacher's in-memory copies in step with what was written. There is no
  // longer a path that rewrites `grades.profile` from a flat patch: with a
  // versioned plan that write would be silently overridden, and it would lose
  // the history the evidence report depends on.
  const handleSupportProfileSaved = (studentId, projection) => {
    const nextProfile = normalizeStudentProfile(projection);
    setAllStudents((current) => current.map((entry) => entry.id === studentId ? { ...entry, profile: nextProfile } : entry));
    setTeacherRosterSummaries((current) => current.map((entry) => entry.id === studentId ? { ...entry, profile: nextProfile } : entry));
  };

  const handleSaveClassSchedule = async () => {
    const normalized = normalizeSchedule(classSchedule);
    await setDoc(doc(db, 'settings', 'classSchedule'), normalized);
    setClassSchedule(normalized);
    toastSuccess('A/B schedule saved', 'DOL windows now use the selected A/B day and any date-specific bell schedule.');
  };

  const handleUpdateCourseProfile = (period, patch) => {
    setCourseProfiles((current) => normalizeCourseProfiles({
      ...current,
      [period]: { ...(current?.[period] || {}), ...patch },
    }, CLASS_PERIODS));
  };

  const handleSaveCourseProfiles = async () => {
    setCourseProfilesSaving(true);
    try {
      const normalized = normalizeCourseProfiles(courseProfiles, CLASS_PERIODS);
      await setDoc(doc(db, 'settings', 'courseProfiles'), { profiles: normalized, updatedAt: new Date().toISOString() });
      setCourseProfiles(normalized);
      toastSuccess('Course settings saved', 'Honors preflight now follows these class designations.');
    } catch (error) {
      console.error(error);
      toastError('Could not save course settings', error.message);
    } finally {
      setCourseProfilesSaving(false);
    }
  };

  const saveAssignmentFolderPaths = async (paths) => {
    const normalized = normalizeFolderPaths(paths);
    await setDoc(doc(db, 'settings', 'assignmentFolders'), { paths: normalized });
    setAssignmentFolderPaths(normalized);
    return normalized;
  };

  // Batches every assignment doc whose folder equals or is nested under
  // `path` through `updateAssignmentFolder`, chunked below the per-batch
  // write ceiling, mirroring deleteAssignmentPermanently's write pattern.
  const batchUpdateAssignmentsInFolder = async (path, updateAssignmentFolder) => {
    const affected = assignments.filter((assignment) => assignmentFolderMatches(assignment, path));
    if (!affected.length) return;
    const chunkSize = 400;
    for (let startIndex = 0; startIndex < affected.length; startIndex += chunkSize) {
      const batch = writeBatch(db);
      affected.slice(startIndex, startIndex + chunkSize).forEach((assignment) => {
        batch.update(doc(db, 'assignments', assignment.id), { folder: updateAssignmentFolder(assignment) });
      });
      await batch.commit();
    }
    await fetchAssignments();
  };

  const handleCreateFolder = async (path) => {
    await saveAssignmentFolderPaths([...assignmentFolderPaths, path]);
  };

  const handleRenameFolder = async (oldPath, newPath) => {
    await saveAssignmentFolderPaths(assignmentFolderPaths.map((existing) => renameFolderPath(existing, oldPath, newPath)));
    await batchUpdateAssignmentsInFolder(oldPath, (assignment) => renameFolderPath(assignment.folder, oldPath, newPath));
  };

  const handleDeleteFolder = async (path) => {
    await saveAssignmentFolderPaths(assignmentFolderPaths.filter((existing) => existing !== path && !existing.startsWith(`${path}/`)));
    await batchUpdateAssignmentsInFolder(path, () => null);
  };

  const handleMoveAssignmentToFolder = async (assignmentId, folderPath) => {
    await updateDoc(doc(db, 'assignments', assignmentId), { folder: folderPath ? normalizeFolderPath(folderPath) : null });
    await fetchAssignments();
  };

  const handleDuplicateAssignment = async (assignment) => {
    try {
      const duplicateQuestions = getStoredAssignmentQuestions(assignment).map((question) => ({
        ...question,
        questionId: createQuestionId(),
      }));
      const candidateV5 = storedAssignmentToV5(assignment, {
        titleOverride: `${assignment.title} (Copy)`,
        questions: duplicateQuestions,
        resetAssignmentKey: true,
      });
      const model = buildAssignmentV5PreflightModel(candidateV5);
      if (!model.isValid) {
        throw new Error(`The copy cannot be created until MathMaster’s assignment checks are clean:\n${model.errors.join('\n')}`);
      }
      const persistence = canonicalV5PersistencePatch(model.assignmentV5);
      // A copy carries the content, never the source's instance state:
      // students' overrides (which the create rule refuses anyway, so any
      // assignment with an extension could not be duplicated) and each
      // class's DOL/Warm-Up runtime state (shared/assignmentPrivacy.mjs).
      const {
        id: _id,
        archived: _archived,
        archivedAt: _archivedAt,
        archivedBy: _archivedBy,
        // A copy is a new assessment: it starts published (to whichever class
        // it is later assigned) and carries none of the source's audit history.
        unpublished: _unpublished,
        unpublishedAt: _unpublishedAt,
        unpublishedBy: _unpublishedBy,
        lifecycleHistory: _lifecycleHistory,
        assessmentPolicyHistory: _assessmentPolicyHistory,
        contentLineage: _contentLineage,
        contentUpgrade: _contentUpgrade,
        ...rest
      } = stripAssignmentInstanceState(assignment);
      await addDoc(collection(db, 'assignments'), {
        ...rest,
        ...persistence,
        assignmentKey: null,
        assignedClassIds: [],
        assignedClassPeriods: [],
        dueAt: null,
        dueDate: null,
        lateDueAt: null,
        lateDueDate: null,
        releaseAt: null,
        courseProfile: { course: model.assignmentV5.assignment.courseId, courseLevel: null },
        rigorVariant: null,
        rigorVariantGroupId: null,
        honorsContractVersion: null,
        honorsContractScope: null,
        feedbackReleased: false,
        feedbackReleasedAt: null,
        createdAt: new Date(),
      });
      await fetchAssignments();
      toastSuccess(
        `Duplicated “${assignment.title}”`,
        'The copy passed MathMaster’s assignment checks and was saved as an unassigned library item with no student records.',
      );
    } catch (error) {
      toastError('Could not duplicate assignment', error.message);
    }
  };

  /*
   * ARCHIVE AND PAUSE GO THROUGH THE SERVER, AND SAY WHAT THEY DO.
   *
   * Both used to be a silent client toggle the server never read, so an
   * "archived" Test was still open to students. They are now audited server
   * actions (manageAssignmentLifecycle) that the Test Cycle and secure exam
   * callables enforce, and each says, before it happens, what students will
   * and will not lose.
   */
  const handleToggleArchiveAssignment = async (assignment) => {
    const archiving = !assignment.archived;
    const proceed = await confirmAction({
      title: `${archiving ? 'Archive' : 'Unarchive'} “${assignment.title}”?`,
      message: archiving
        ? 'Students will no longer see it or be able to open it, including any secure Test or Retest. Their work and recorded grades are kept, and you can unarchive it at any time from the Archived view.'
        : 'It returns to your active lists and becomes available to students again according to its dates.',
      confirmLabel: archiving ? 'Archive' : 'Unarchive',
    });
    if (!proceed) return;
    try {
      await manageAssignmentLifecycle({ assignmentId: assignment.id, action: archiving ? 'archive' : 'unarchive' });
      await fetchAssignments();
      toastSuccess(archiving ? 'Archived' : 'Unarchived', `“${assignment.title}”`);
    } catch (error) {
      toastError(`Could not ${archiving ? 'archive' : 'unarchive'} the assignment`, error.message);
    }
  };

  const handleTogglePauseAssignment = async (assignment) => {
    const pausing = !assignment.unpublished;
    const proceed = await confirmAction({
      title: `${pausing ? 'Pause' : 'Resume'} “${assignment.title}” for students?`,
      message: pausing
        ? 'Students will not see it or be able to open it — including starting or continuing a secure Test — until you resume it. Nothing they have done is lost, and it stays in your lists marked Paused.'
        : 'Students will see it again and can continue where they left off.',
      confirmLabel: pausing ? 'Pause for students' : 'Resume for students',
    });
    if (!proceed) return;
    try {
      await manageAssignmentLifecycle({ assignmentId: assignment.id, action: pausing ? 'unpublish' : 'publish' });
      await fetchAssignments();
      toastSuccess(pausing ? 'Paused for students' : 'Visible to students again', `“${assignment.title}”`);
    } catch (error) {
      toastError(`Could not ${pausing ? 'pause' : 'resume'} the assignment`, error.message);
    }
  };

  const toggleAssignmentSelected = (assignmentId) => {
    setSelectedAssignmentIds((current) => {
      const next = new Set(current);
      if (next.has(assignmentId)) next.delete(assignmentId);
      else next.add(assignmentId);
      return next;
    });
  };

  const clearAssignmentSelection = () => setSelectedAssignmentIds(new Set());

  /**
   * One batched write for the whole selection rather than N sequential
   * updateDoc calls, matching how folder renames already work. Chunked at 400
   * because a Firestore batch caps at 500 operations.
   */
  const applyBulkAssignmentPatch = async (assignmentIds, patch, describe) => {
    const ids = Array.from(assignmentIds || []);
    if (!ids.length) return false;
    setBulkBusy(true);
    try {
      for (let start = 0; start < ids.length; start += 400) {
        const batch = writeBatch(db);
        ids.slice(start, start + 400).forEach((assignmentId) => {
          batch.update(doc(db, 'assignments', assignmentId), patch);
        });
        await batch.commit();
      }
      await fetchAssignments();
      clearAssignmentSelection();
      toastSuccess(describe(ids.length));
      return true;
    } catch (error) {
      console.error(error);
      toastError('Bulk update failed', error.message);
      return false;
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkArchive = async (shouldArchive) => {
    const count = selectedAssignmentIds.size;
    const verb = shouldArchive ? 'Archive' : 'Unarchive';
    const proceed = await confirmAction({
      title: `${verb} ${count} assignment${count === 1 ? '' : 's'}?`,
      message: shouldArchive
        ? 'Archived assignments are hidden from the default list and from students, but nothing is deleted and no student records change. You can unarchive them at any time.'
        : 'These assignments will reappear in the default list and become visible to students again according to their existing dates.',
      confirmLabel: verb,
    });
    if (!proceed) return;
    // One audited server action per assignment (archive is enforced on the
    // server now, so it cannot be a client batch write).
    setBulkBusy(true);
    const ids = Array.from(selectedAssignmentIds || []);
    const failures = [];
    for (const assignmentId of ids) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await manageAssignmentLifecycle({ assignmentId, action: shouldArchive ? 'archive' : 'unarchive' });
      } catch (error) {
        failures.push(`${assignments.find((item) => item.id === assignmentId)?.title || assignmentId}: ${error.message}`);
      }
    }
    await fetchAssignments();
    clearAssignmentSelection();
    setBulkBusy(false);
    if (failures.length) toastError(`${failures.length} could not be ${shouldArchive ? 'archived' : 'unarchived'}`, failures.slice(0, 3).join(' · '));
    const done = ids.length - failures.length;
    if (done) toastSuccess(`${shouldArchive ? 'Archived' : 'Unarchived'} ${done} assignment${done === 1 ? '' : 's'}`);
  };

  const handleBulkMoveToFolder = async (rawFolder) => {
    const folder = normalizeFolderPath(rawFolder);
    await applyBulkAssignmentPatch(
      selectedAssignmentIds,
      { folder: folder || null },
      (count) => `Moved ${count} assignment${count === 1 ? '' : 's'} to ${folder || 'Uncategorized'}`,
    );
  };

  /*
   * MARKING PERIODS — TEACHER WRITES.
   *
   * Two documents, and they never touch each other's business:
   *   settings/gradingPeriods  the period list and which one is current
   *   assignments/{id}         a {id,label,order} stamp, written only here
   *
   * Nothing in this group reads or writes `assignment.archived`. Closing a
   * marking period is a reporting-window decision; archiving an assignment is
   * a filing decision, and conflating them would let one quietly do the other.
   */
  const persistGradingPeriodSettings = async (next, successMessage) => {
    const normalized = normalizeGradingPeriodSettings(next);
    setGradingPeriodBusy(true);
    try {
      await setDoc(doc(db, 'settings', GRADING_PERIOD_SETTINGS_DOC), {
        periods: normalized.periods,
        currentPeriodId: normalized.currentPeriodId,
        updatedAt: new Date().toISOString(),
      });
      setGradingPeriodSettings(normalized);
      if (successMessage) toastSuccess(successMessage);
      return normalized;
    } catch (error) {
      console.error(error);
      toastError('Could not save marking periods', error.message);
      return gradingPeriodSettings;
    } finally {
      setGradingPeriodBusy(false);
    }
  };

  const handleCreateGradingPeriod = (period) => persistGradingPeriodSettings(
    {
      periods: [...gradingPeriodSettings.periods, period],
      // The first period a school creates becomes current, so creating one
      // never leaves students looking at a Grade Center with no current group.
      currentPeriodId: gradingPeriodSettings.currentPeriodId || period.id,
    },
    `Added ${period.label}`,
  );

  const handleSetCurrentGradingPeriod = (periodId) => persistGradingPeriodSettings(
    { ...gradingPeriodSettings, currentPeriodId: periodId },
    'Current marking period updated',
  );

  const handleSetGradingPeriodArchived = (periodId, archived) => persistGradingPeriodSettings(
    {
      ...gradingPeriodSettings,
      periods: gradingPeriodSettings.periods.map((period) => (
        period.id === periodId ? { ...period, archived } : period
      )),
    },
    archived
      ? 'Marking period closed. Students keep every grade in it; it simply collapses by default.'
      : 'Marking period reopened',
  );

  const handleMoveSelectedAssignmentsToGradingPeriod = async (
    period,
    assignmentIds = selectedAssignmentIds,
  ) => {
    const label = period?.label || 'the default current period';
    return applyBulkAssignmentPatch(
      assignmentIds,
      gradingPeriodAssignmentPatch(period),
      (count) => `Moved ${count} assignment${count === 1 ? '' : 's'} to ${label}`,
    );
  };

  const openStoredAssignmentForPreflight = (assignment, draftOverrides = {}) => {
    // A stored assignment is ALREADY canonical V5. Sending it back through the
    // authoring compiler used to reinterpret internal renderer contracts as new
    // AI intent. A composed function workflow could therefore collapse into the
    // legacy y=x free-plot tool while being moved from the Library to a class.
    // Reuse validates the stored canonical object directly and never recompiles
    // its questions.
    const prepared = prepareStoredAssignmentForReuse(assignment, { resetAssignmentKey: true });
    const opened = openAssignmentPreflight(
      {
        assignmentV5: prepared.assignmentV5,
        questions: prepared.questions,
        authoringWarnings: prepared.warnings,
      },
      `Library · ${assignment.title}`,
      draftOverrides,
      { sourceContentLineage: assignment.contentLineage || null },
    );
    if (opened !== true) throw new Error(opened?.error || 'Could not open Assignment Review for this saved assignment.');
    return prepared.assignmentV5;
  };

  const beginEditAssignmentSetup = (assignment) => {
    try {
      const prepared = prepareStoredAssignmentForReuse(assignment, { resetAssignmentKey: false });
      const canonicalV5 = prepared.assignmentV5;
      const currentDraft = {
        title: assignment.title || canonicalV5.assignment.title || '',
        folder: assignment.folder || canonicalV5.assignment.folder || '',
        dueAt: toDateTimeLocalInputValue(assignment.dueAt || assignment.dueDate || ''),
        lateDueAt: toDateTimeLocalInputValue(assignment.lateDueAt || assignment.lateDueDate || ''),
        releaseAt: toDateTimeLocalInputValue(assignment.releaseAt || ''),
        sectionVariantModes: getStoredSectionVariantModes(canonicalV5),
        sectionAccessDefaults: {
          classwork: assignment.sectionAccess?.classwork?.defaultState === 'closed' ? 'closed' : 'open',
          practice: assignment.sectionAccess?.practice?.defaultState === 'closed' ? 'closed' : 'open',
        },
        guidedNotesBySection: {
          classwork: assignment.guidedNotesBySection?.classwork || 'automatic',
          practice: assignment.guidedNotesBySection?.practice || 'off',
        },
        assignedClassIds: [...(assignment.assignedClassIds || [])],
        assignedClassPeriods: [...(assignment.assignedClassPeriods || [])],
        warmupEnabled: assignment.warmup?.enabled !== false,
        warmupMinutesBeforeStart: assignment.warmup?.minutesBeforeStart ?? 7,
        warmupInstructionDate: assignment.warmup?.instructionDate || '',
        warmupInstructionDatesByClassPeriod: assignment.warmup?.instructionDatesByClassPeriod || {},
        dolEnabled: assignment.dol?.enabled === true,
        dolMinutesBeforeEnd: assignment.dol?.minutesBeforeEnd ?? 10,
        dolCloseMinutesBeforeEnd: assignment.dol?.closeMinutesBeforeEnd ?? 5,
        dolInstructionDate: assignment.dol?.instructionDate || '',
        dolInstructionDatesByClassPeriod: assignment.dol?.instructionDatesByClassPeriod || {},
        dolQuestionIndex: Number.isInteger(assignment.dol?.questionIndex) ? assignment.dol.questionIndex : null,
        publicationStrategy: assignment.publicationSettings?.strategy || 'hybrid',
        includeWarmupInClassroom: assignment.publicationSettings?.includeWarmupInClassroom === true,
        homeworkDueAt: toDateTimeLocalInputValue(assignment.publicationSettings?.homeworkDueAt || ''),
        instructionalPurpose: canonicalV5.assignment.instructionalPurpose || 'lesson',
        gradingPurpose: canonicalV5.assignment.gradingPurpose || null,
        variantPolicy: canonicalV5.variantPolicy,
        differentiationPolicy: canonicalV5.differentiationPolicy,
        supportPolicy: canonicalV5.supportPolicy,
        toolPolicy: canonicalV5.toolPolicy,
        deliveryPolicy: canonicalV5.deliveryPolicy,
        gradingPolicy: canonicalV5.gradingPolicy,
        evidencePolicy: canonicalV5.evidencePolicy,
        outputProfiles: canonicalV5.outputProfiles,
        classroomIntegration: canonicalV5.classroomIntegration,
        provenance: canonicalV5.provenance,
        preflight: canonicalV5.preflight,
      };
        const opened = openAssignmentPreflight(
        {
          assignmentV5: canonicalV5,
          questions: prepared.questions,
          authoringWarnings: prepared.warnings,
        },
        `Existing · ${assignment.title}`,
        currentDraft,
        {
          mode: 'update',
          existingAssignmentId: assignment.id,
          allowQuestionRepair: !allStudents.some(
            (student) => student.gradesByAssignment?.[assignment.id] !== undefined,
          ),
        },
      );
      if (opened !== true) throw new Error(opened?.error || 'Could not open Assignment Review.');
    } catch (error) {
      toastError('Could not review assignment setup', error.message);
    }
  };

  // Switching an assignment's Warm-Up into a Live Challenge. Written with dotted
  // field paths so the rest of the warmup object — the window, the instruction
  // dates, the per-class closures — is untouched.
  const handleLinkWarmupChallenge = async (assignmentId, options = {}) => {
    if (!assignmentId) return;
    await updateDoc(doc(db, 'assignments', assignmentId), {
      'warmup.liveChallenge.enabled': true,
      'warmup.liveChallenge.roundCount': Math.max(3, Math.min(20, Number(options.roundCount) || 5)),
      'warmup.liveChallenge.roundSeconds': Math.max(15, Math.min(120, Number(options.roundSeconds) || 30)),
      'warmup.liveChallenge.standardCode': String(options.standardCode || 'mixed'),
    });
  };

  const beginEditAssignmentDates = (assignment) => {
    const toLocalInput = (value) => {
      const date = value ? new Date(value) : null;
      if (!date || Number.isNaN(date.getTime())) return '';
      const offset = date.getTimezoneOffset() * 60000;
      return new Date(date.getTime() - offset).toISOString().slice(0, 16);
    };
    const existingIds = Array.isArray(assignment.assignedClassIds)
      ? assignment.assignedClassIds.filter(Boolean)
      : [];
    const existingPeriods = [...new Set(classes
      .filter((entry) => existingIds.includes(entry.classId) && entry?.status !== 'archived')
      .map((entry) => entry.period)
      .filter(Boolean))];
    const defaultDates = defaultAssignmentDateInputs();
    setEditingAssignmentId(assignment.id);
    setEditingAssignmentDates({
      dueAt: toLocalInput(assignment.dueAt || assignment.dueDate) || defaultDates.dueAt,
      lateDueAt: toLocalInput(assignment.lateDueAt || assignment.lateDueDate) || defaultDates.lateDueAt,
      dolInstructionDate: assignment.dol?.instructionDate
        || (assignment.releaseAt ? toLocalInput(assignment.releaseAt).slice(0, 10) : localDateKey(Date.now())),
      assignedClassPeriods: existingPeriods,
      assignedClassIds: existingIds,
    });
  };

  const beginAssignLibraryAssignment = (assignment) => {
    // Give Library rows a real Assign action. The existing Dates & Classes
    // editor owns destination/date selection; saving a library item from there
    // opens canonical Preflight and then uses the normal Classroom publisher.
    setLibraryNavigation(null);
    setAssignmentSearch('');
    beginEditAssignmentDates(assignment);
    setTeacherTab('assignments');
    toastInfo(
      'Choose the class and dates',
      'This Library lesson will stay reusable. After you choose a class, Assignment Review will preserve the exact questions and publish the saved Google Classroom post, notes, resources, and grade-passback settings.',
    );
  };

  const handleRepairAssignmentFromLibrary = async (assignment) => {
    const inspection = inspectLibraryContentRepair(assignment, assignments);
    if (!inspection.source || !inspection.questionIds.length) {
      toastError(
        'No safe repair source found',
        'MathMaster could not find one unambiguous saved assignment with the same question identity and the richer workflow. No student work was changed.',
      );
      return;
    }

    const proceed = await confirmAction({
      title: `Repair ${inspection.questionIds.length} corrupted question${inspection.questionIds.length === 1 ? '' : 's'}?`,
      message: 'MathMaster will restore only the collapsed workflow question content from the matching intact assignment source. The live assignment ID, question IDs/order, dates, classes, and every other question stay unchanged. Because the corrupted question was not valid work, students receive fresh attempts on that repaired question only; they do not restart the assignment.',
      confirmLabel: 'Repair assignment',
    });
    if (!proceed) return;

    try {
      const repair = buildSafeLibraryContentRepair(assignment, inspection.source);
      const currentQuestions = getStoredAssignmentQuestions(assignment);
      const repairedIndices = repair.repairedQuestionIds
        .map((questionId) => currentQuestions.findIndex((question) => question?.questionId === questionId))
        .filter((index) => index >= 0);
      const studentsWithThisAssignment = allStudents.filter((student) => (
        student?.id && student.gradesByAssignment?.[assignment.id]
      ));

      // The assignment itself and the repaired-question attempt reset are one
      // Firestore batch. Students keep every other answer/score. Only work on a
      // question that MathMaster rendered incorrectly is cleared, because
      // carrying an "expired" attempt record into the restored workflow would
      // leave the repaired question impossible to answer.
      if (studentsWithThisAssignment.length > 450) {
        throw new Error('This assignment has too many active student grade records for one safe atomic repair. Contact the platform administrator before repairing it.');
      }
      const repairedAt = new Date().toISOString();
      const batch = writeBatch(db);
      batch.update(doc(db, 'assignments', assignment.id), {
        sections: repair.sections,
        contentRepair: {
          kind: 'libraryCanonicalWorkflowRestore',
          sourceAssignmentId: inspection.source.id,
          repairedQuestionIds: repair.repairedQuestionIds,
          repairedQuestionIndices: repairedIndices,
          repairedAt,
          studentQuestionAttemptsReset: true,
        },
      });
      studentsWithThisAssignment.forEach((student) => {
        const gradePatch = {};
        repairedIndices.forEach((questionIndex) => {
          gradePatch[`gradesByAssignment.${assignment.id}.${questionIndex}`] = emptyQuestionRecord();
        });
        // Classwork completion is a derived summary. The student's other
        // question records remain untouched, and the summary will be earned
        // again from the repaired content rather than retaining a score based
        // on the broken renderer.
        gradePatch[`classworkGradesByAssignment.${assignment.id}`] = deleteField();
        batch.update(doc(db, 'grades', student.id), gradePatch);
      });
      await batch.commit();

      await fetchAssignments();
      toastSuccess(
        'Assignment repaired without restarting students',
        `Restored ${repair.repairedQuestionIds.length} corrupted question${repair.repairedQuestionIds.length === 1 ? '' : 's'} in place. Students keep all other work and receive fresh attempts only on the repaired question${repair.repairedQuestionIds.length === 1 ? '' : 's'}.`,
      );
    } catch (error) {
      console.error(error);
      toastError('Could not repair assignment', error.message);
    }
  };

  const handleSaveAssignmentDates = async (assignmentId) => {
    const dueAt = new Date(editingAssignmentDates.dueAt);
    const hasLateDue = Boolean(String(editingAssignmentDates.lateDueAt || '').trim());
    const lateDueAt = hasLateDue ? new Date(editingAssignmentDates.lateDueAt) : null;
    if (
      Number.isNaN(dueAt.getTime())
      || (lateDueAt && (Number.isNaN(lateDueAt.getTime()) || lateDueAt <= dueAt))
    ) {
      toastError('Check the dates', 'Set a valid due date. If you use a final late due date, it must be later than the regular due date.');
      return;
    }

    const assignment = assignments.find((item) => item.id === assignmentId);
    if (!assignment) {
      toastError('Assignment not found', 'Refresh the assignment list and try again.');
      return;
    }

    const editedClassIds = Array.isArray(editingAssignmentDates.assignedClassIds)
      ? editingAssignmentDates.assignedClassIds
      : [];
    const editedClassRecords = editedClassIds.length
      ? classes.filter((entry) => editedClassIds.includes(entry.classId) && entry?.status !== 'archived')
      : [];
    const editedPeriods = [...new Set(editedClassRecords.map((entry) => entry.period).filter(Boolean))];

    // A library item is a reusable source, not a half-published assignment.
    // Selecting classes launches the same Preflight/new-destination path used by
    // fresh V5 authoring. The library template remains untouched and reusable.
    if (isLibraryAssignment(assignment) && editedClassIds.length) {
      try {
        openStoredAssignmentForPreflight(assignment, {
          title: assignment.title,
          folder: assignment.folder || '',
          dueAt: editingAssignmentDates.dueAt,
          lateDueAt: editingAssignmentDates.lateDueAt || '',
          assignedClassIds: editedClassIds,
          assignedClassPeriods: editedPeriods,
          dolInstructionDate: editingAssignmentDates.dolInstructionDate || '',
        });
        setEditingAssignmentId(null);
        toastInfo(
          'Review before assigning',
          'The library template is staying unchanged. Preflight will create the correct destination version(s) for the classes you selected.',
        );
      } catch (error) {
        toastError('Could not open assignment Preflight', error.message);
      }
      return;
    }

    // Adding another class is a NEW delivery of the same authored assignment.
    // Keep the existing class record (and therefore its due date, student
    // evidence, and Classroom post) unchanged. The edited dates belong to the
    // newly-added class(es), which are prepared from this assignment's reviewed
    // V5 source. This is what makes "Period 3 due Tuesday, Period 5 due
    // Wednesday" possible without one save silently moving both deadlines.
    const originalClassIds = Array.isArray(assignment.assignedClassIds)
      ? assignment.assignedClassIds.filter(Boolean)
      : [];
    const addedClassIds = editedClassIds.filter((classId) => !originalClassIds.includes(classId));
    const keptEveryOriginalClass = originalClassIds.every((classId) => editedClassIds.includes(classId));
    if (addedClassIds.length && keptEveryOriginalClass) {
      try {
        const addedRecords = classes.filter((entry) => addedClassIds.includes(entry.classId) && entry?.status !== 'archived');
        const addedPeriods = [...new Set(addedRecords.map((entry) => entry.period).filter(Boolean))];
        openStoredAssignmentForPreflight(assignment, {
          title: assignment.title,
          folder: assignment.folder || '',
          dueAt: editingAssignmentDates.dueAt,
          lateDueAt: editingAssignmentDates.lateDueAt || '',
          assignedClassIds: addedClassIds,
          assignedClassPeriods: addedPeriods,
          dolInstructionDate: editingAssignmentDates.dolInstructionDate || '',
        });
        setEditingAssignmentId(null);
        toastInfo(
          'Review the added class delivery',
          'The current class assignment and its dates stay unchanged. MathMaster reused the assignment for only the new class(es), so their due date and Standard/Honors depth can be managed independently.',
        );
      } catch (error) {
        toastError('Could not prepare the added class', error.message);
      }
      return;
    }

    // Existing assigned variants may move among classes with the same
    // course/rigor destination, but cannot silently change Standard/Honors
    // identity or fan out into mixed rigor without going through a fresh split.
    const targetGroups = buildDestinationGroups({ assignedClassIds: editedClassIds, classes });
    const currentCourse = assignment.courseId || assignment.courseProfile?.course || null;
    const currentLevel = assignment.rigorVariant || assignment.courseProfile?.courseLevel || null;
    const changesDestination = targetGroups.length > 1
      || (targetGroups.length === 1 && currentCourse && targetGroups[0].course !== currentCourse)
      || (targetGroups.length === 1 && currentLevel && targetGroups[0].courseLevel !== currentLevel);
    if (changesDestination) {
      toastError(
        'Use a destination copy',
        'This edit would move or mix a destination-specific Standard/Honors delivery. Add another class without removing the current class, or use the reusable Library source so MathMaster can preserve the correct rigor version.',
      );
      return;
    }

    const hasDOL = Boolean(assignment?.dol?.enabled || getStoredAssignmentQuestions(assignment).some((question) => (
      resolveQuestionActivityRole({ question, assignment }) === 'dol'
    )));
    const patch = {
      dueAt: dueAt.toISOString(),
      dueDate: dueAt.toISOString(),
      lateDueAt: lateDueAt ? lateDueAt.toISOString() : null,
      assignedClassIds: editedClassIds,
      assignedClassPeriods: editedPeriods,
    };
    if (hasDOL) {
      patch.dol = {
        ...(assignment?.dol || {}),
        enabled: assignment?.dol?.enabled ?? true,
        instructionDate: editingAssignmentDates.dolInstructionDate || localDateKey(Date.now()),
      };
    }
    // `dol` as the fields this edit changed (enabled, its day), never the
    // whole map from this tab's copy, which would carry students' grants.
    const { dol: editedDol, ...patchWithoutDol } = patch;
    await updateDoc(doc(db, 'assignments', assignmentId), {
      ...patchWithoutDol,
      ...(editedDol ? classDolFieldPatch(assignment?.dol, editedDol, { deleteValue: deleteField() }) : {}),
    });

    const nextAssignment = {
      ...assignment,
      ...patch,
      dol: patch.dol || assignment?.dol,
    };

    if (shouldAutoPublishClassroomPackage(nextAssignment)) {
      try {
        // Publishing is idempotent for courses that already have a MathMaster
        // post and creates the missing post for any class just added in Dates &
        // Classes. Only after that do we patch every existing post's due date.
        // Previously we only ran the update call, which cannot create a
        // Classroom post and made "add another class" appear not to work.
        await autoPublishAssignmentPackageToClassroom(nextAssignment);
        await updateAssignmentClassroomPublications({ assignmentId });
      } catch (classroomError) {
        console.warn('Classroom publish/sync after assignment edit failed:', classroomError);
      }
    }

    setEditingAssignmentId(null);
  };

  // The Student Support Evidence Report replaced the pop-up "IEP Support
  // Report", which listed every assignment in the library and printed
  // "0 min" where time was simply not recorded. Same entry points, new report.
  const openIEPReport = (student) => {
    if (!student?.id) return;
    setSupportReportStudentId(student.id);
  };

  const openDeleteDialog = (assignment) => {
    setDeleteDialog(assignment);
    setDeleteStep(1);
    setDeleteTitleConfirmation('');
    setDeleteAcknowledged(false);
    setDeleteClassroomAcknowledged(false);
    setDeleteError('');
    setDeleteEvidence(null);
    // Asked of the server, which can see every student's work; the teacher's
    // own roster snapshot cannot, and guessing low here is how evidence goes.
    getAssignmentEvidenceSummary({ assignmentId: assignment.id })
      .then((summary) => setDeleteEvidence(summary))
      .catch((error) => setDeleteEvidence({ error: error.message || 'Could not check this assignment for student work.' }));
  };

  const closeDeleteDialog = () => {
    if (isDeleting) return;
    setDeleteDialog(null);
    setDeleteStep(1);
    setDeleteTitleConfirmation('');
    setDeleteAcknowledged(false);
    setDeleteError('');
  };

  /*
   * DELETE IS A SERVER DECISION.
   *
   * This used to read every grade document in the school from the teacher's
   * browser (which the rules refuse for an ordinary teacher, so delete simply
   * failed) and, for the administrator, delete the assignment and strip each
   * student's work for it — evidence and grades included, with Test Cycle
   * records and secure sessions left orphaned. The server now refuses a delete
   * once any student has worked on the assignment, and offers Archive, which
   * hides it and keeps everything.
   */
  const deleteAssignmentPermanently = async () => {
    if (!deleteDialog || !deleteAcknowledged) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await manageAssignmentLifecycle({
        assignmentId: deleteDialog.id,
        action: 'delete',
        confirmTitle: deleteTitleConfirmation.trim(),
        acknowledgeClassroom: deleteClassroomAcknowledged,
      });
      await fetchAssignments();
      toastSuccess('Assignment deleted', `“${deleteDialog.title}” was deleted. No student had worked on it.`);
      setDeleteDialog(null);
      setDeleteStep(1);
      setDeleteTitleConfirmation('');
      setDeleteAcknowledged(false);
      setDeleteError('');
    } catch (error) {
      console.error(error);
      setDeleteError(error.message || 'The assignment could not be deleted.');
    } finally {
      setIsDeleting(false);
    }
  };

  const archiveFromDeleteDialog = async () => {
    if (!deleteDialog) return;
    setIsDeleting(true);
    try {
      await manageAssignmentLifecycle({ assignmentId: deleteDialog.id, action: 'archive' });
      await fetchAssignments();
      toastSuccess('Assignment archived', `“${deleteDialog.title}” is hidden from students. Their work and grades are kept, and you can unarchive it from the Archived view.`);
      setDeleteDialog(null);
    } catch (error) {
      setDeleteError(error.message || 'The assignment could not be archived.');
    } finally {
      setIsDeleting(false);
    }
  };

  const renderStudentPackUpBanner = () => {
    if (user?.role !== 'student' || !user.classPeriod) return null;
    // Drawn above everything, including a secure exam's lock overlay; a
    // student mid-Test is not interrupted by it.
    if (secureExamActive) return null;
    const packUp = getClassPackUpState({
      schedule: classSchedule,
      classPeriod: user.classPeriod,
      nowValue: now,
      minutesBeforeEnd: 5,
    });
    if (packUp.status !== 'active') return null;

    return (
      <aside
        role="alert"
        aria-live="assertive"
        style={{
          position: 'fixed',
          top: `var(${STUDENT_IDENTITY_STACK_OFFSET}, 38px)`,
          left: 0,
          right: 0,
          zIndex: 20000,
          background: '#fbbc04',
          color: 'var(--mm-text-strong)',
          borderBottom: '5px solid #d93025',
          boxShadow: '0 8px 28px rgba(0,0,0,0.28)',
          padding: '18px 24px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 'clamp(24px, 4vw, 42px)', fontWeight: 1000, lineHeight: 1.05 }}>
          ⏰ PACK UP & RETURN TECHNOLOGY
        </div>
        <div style={{ marginTop: 8, fontSize: 'clamp(16px, 2.2vw, 24px)', fontWeight: 900 }}>
          Save your work, sign out, and return your device now. The bell is in{' '}
          <DOLCountdown endsAt={packUp.endsAt} />.
        </div>
      </aside>
    );
  };

  const renderStudentWarmupBanner = () => {
    if (user?.role !== 'student' || !user.classPeriod) return null;
    // Its "Go to Warm-Up" button would take a student out of a secure exam.
    if (secureExamActive) return null;
    const classContext = { classId: user.classId || null, classPeriod: user.classPeriod };
    const active = assignments
      .filter((assignment) => assignmentIsForStudent(assignment, classContext))
      .map((assignment) => {
        const state = getWarmupState({
          assignment,
          schedule: classSchedule,
          ...classContext,
          nowValue: now,
        });
        if (state.status !== 'active') return null;
        const questions = getStoredAssignmentQuestions(assignment);
        const bannerOmitted = new Set(studentRequiredFor(assignment).omitted);
        const questionIndices = questions.reduce((indices, question, index) => {
          if (
            questionIsIncluded(question)
            && !bannerOmitted.has(index)
            && resolveQuestionActivityRole({ question, assignment }) === 'warmup'
          ) indices.push(index);
          return indices;
        }, []);
        // A student who has finished every Warm-Up question has nothing left to
        // go to. Keeping the pinned banner (and its "Go to Warm-Up" button) on
        // every Classwork and Practice question only took height from the work.
        const warmupFinished = questionIndices.every((index) => (
          ['correct', 'expired'].includes(normalizeQuestionRecord(tracker?.[assignment.id]?.[index]).status)
        ));
        return questionIndices.length && !warmupFinished ? { assignment, state, questionIndices } : null;
      })
      .filter(Boolean)
      .sort((a, b) => Number(a.state.endsAt?.getTime?.() || 0) - Number(b.state.endsAt?.getTime?.() || 0));

    if (!active.length) return null;
    const { assignment, state, questionIndices } = active[0];
    const support = getStudentSupportPresentation(user.profile);
    const alreadyInThisWarmup = activeView === 'assignment'
      && activeAssignmentId === assignment.id
      && questionIndices.includes(currentQuestionIndex);

    return (
      <aside
        role="alert"
        aria-live="polite"
        style={{
          position: 'sticky',
          top: `var(${STUDENT_IDENTITY_STACK_OFFSET}, 38px)`,
          zIndex: 19000,
          background: 'var(--mm-warning-soft)',
          color: 'var(--mm-warning-text)',
          borderBottom: '3px solid #f9ab00',
          boxShadow: '0 5px 18px rgba(0,0,0,0.16)',
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
          textAlign: 'center',
        }}
      >
        <strong>🔥 WARM-UP ACTIVE</strong>
        <span>{assignment.title}</span>
        {!support.hideCountdowns && (
          <strong style={{ fontSize: 20 }}>
            <DOLCountdown endsAt={state.endsAt} /> remaining
          </strong>
        )}
        {!alreadyInThisWarmup && (
          <button
            type="button"
            onClick={() => {
              setStudentDashboardMode('assignments');
              startAssignment(assignment.id, questionIndices[0]);
            }}
            style={{
              padding: '8px 13px',
              borderRadius: 8,
              border: 0,
              background: '#b06000',
              color: '#fff',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Go to Warm-Up
          </button>
        )}
      </aside>
    );
  };


  const renderIdleOverlay = () => {
    if (!isIdle) return null;
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="mathmaster-idle-title"
        aria-describedby="mathmaster-idle-detail"
        className="mathmaster-idle-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          // Above Work View (2147483000). At 9999 the overlay sat behind an
          // open Work View: the timer paused and the student was never told
          // (live QA round 2).
          zIndex: 2147483100,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px',
        }}
      >
        <div
          style={{
            background: 'var(--mm-surface)',
            padding: '40px',
            borderRadius: '12px',
            textAlign: 'center',
            maxWidth: '400px',
          }}
        >
          <h2 id="mathmaster-idle-title" style={{ color: 'var(--mm-danger)', marginTop: 0 }}>Are you still working?</h2>
          <p id="mathmaster-idle-detail" style={{ color: 'var(--mm-text-muted)', fontSize: '16px', marginBottom: '30px' }}>
            Your timer has been paused due to inactivity. Your work stays where you left it.
          </p>
          <button
            type="button"
            // Focused on appearance so Enter or Space resumes, and a screen
            // reader lands on the dialog instead of the paused work behind it.
            ref={(element) => element?.focus?.({ preventScroll: true })}
            onClick={() => {
              lastActivityRef.current = Date.now();
              setIsIdle(false);
            }}
            style={{
              padding: '12px 24px',
              minHeight: '44px',
              fontSize: '16px',
              background: '#1a73e8',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Yes, I&apos;m Back!
          </button>
        </div>
      </div>
    );
  };

  const renderDeleteAssignmentDialog = () => {
    if (!deleteDialog) return null;

    const evidenceLoading = deleteEvidence === null;
    const evidenceError = deleteEvidence?.error || '';
    const studentsWithWork = Number(deleteEvidence?.studentsWithWork || 0);
    const canDelete = deleteEvidence?.canDelete === true;
    const classroomPosts = Number(deleteEvidence?.classroomPublications || 0);
    const titleMatches =
      deleteTitleConfirmation.trim() === deleteDialog.title.trim();

    return (
      <div
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDeleteDialog();
        }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(32,33,36,0.72)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-assignment-title"
          style={{
            width: '100%',
            maxWidth: '560px',
            background: 'var(--mm-surface)',
            borderRadius: '16px',
            boxShadow: '0 24px 70px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            textAlign: 'left',
          }}
        >
          <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--mm-border-soft)' }}>
            <div
              style={{
                color: 'var(--mm-danger)',
                fontWeight: 'bold',
                fontSize: '13px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '8px',
              }}
            >
              Permanent deletion · Step {deleteStep} of 3
            </div>
            <h2 id="delete-assignment-title" style={{ margin: 0, color: 'var(--mm-text-strong)' }}>
              Delete “{deleteDialog.title}”?
            </h2>
          </div>

          <div style={{ padding: '28px' }}>
            {deleteStep === 1 && (
              <div data-delete-evidence={evidenceLoading ? 'loading' : canDelete ? 'none' : 'present'}>
                {evidenceLoading && (
                  <p role="status" style={{ color: 'var(--mm-text)', lineHeight: 1.55 }}>Checking whether any student has worked on this assignment…</p>
                )}
                {evidenceError && (
                  <p role="alert" style={{ color: 'var(--mm-error-text)', lineHeight: 1.55 }}>{evidenceError}</p>
                )}
                {!evidenceLoading && !evidenceError && !canDelete && (
                  <div style={{ background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)', border: '1px solid var(--mm-warning-border)', borderRadius: '10px', padding: '16px', lineHeight: 1.55 }}>
                    <strong>{studentsWithWork} student{studentsWithWork === 1 ? ' has' : 's have'} work on this assignment.</strong>{' '}
                    Deleting it would erase their answers, evidence and grades, so MathMaster will not delete it.
                    <br />
                    <strong>Archive it instead:</strong> it disappears for students and from your active lists, every
                    record and grade is kept, and you can unarchive it at any time.
                  </div>
                )}
                {!evidenceLoading && !evidenceError && canDelete && (
                  <>
                    <div style={{ background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)', border: '1px solid var(--mm-error-border-soft)', borderRadius: '10px', padding: '16px', marginBottom: '14px', lineHeight: 1.5 }}>
                      <strong>This cannot be undone.</strong> No student has worked on this assignment, so it can be
                      deleted. Any secure Test sessions opened for it (none started) are removed with it.
                    </div>
                    {classroomPosts > 0 && (
                      <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', color: 'var(--mm-text)', lineHeight: 1.5 }}>
                        <input type="checkbox" checked={deleteClassroomAcknowledged} onChange={(event) => setDeleteClassroomAcknowledged(event.target.checked)} style={{ marginTop: '4px' }} />
                        <span>It is posted to Google Classroom. Deleting it here does not remove the Classroom post; I will remove that in Classroom.</span>
                      </label>
                    )}
                  </>
                )}
              </div>
            )}

            {deleteStep === 2 && (
              <div>
                <p style={{ color: 'var(--mm-text)', lineHeight: 1.55, marginBottom: '16px' }}>
                  To confirm that you selected the correct assignment, type its exact
                  title below:
                </p>
                <div
                  style={{
                    background: 'var(--mm-surface-control)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    fontWeight: 'bold',
                    marginBottom: '12px',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {deleteDialog.title}
                </div>
                <input
                  autoFocus
                  type="text"
                  value={deleteTitleConfirmation}
                  onChange={(event) => setDeleteTitleConfirmation(event.target.value)}
                  placeholder="Type the assignment title"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '12px',
                    borderRadius: '8px',
                    border: titleMatches
                      ? '2px solid #188038'
                      : '2px solid var(--mm-border)',
                    fontSize: '16px',
                    outline: 'none',
                  }}
                />
              </div>
            )}

            {deleteStep === 3 && (
              <div>
                <div
                  style={{
                    border: '2px solid #d93025',
                    borderRadius: '10px',
                    padding: '16px',
                    marginBottom: '18px',
                  }}
                >
                  <div style={{ fontWeight: 'bold', color: 'var(--mm-danger)', marginBottom: '8px' }}>
                    Final confirmation
                  </div>
                  <div style={{ color: 'var(--mm-text)', lineHeight: 1.5 }}>
                    You are permanently deleting this assignment. No student has worked on it.
                  </div>
                </div>
                <label
                  style={{
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start',
                    color: 'var(--mm-text-strong)',
                    lineHeight: 1.5,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={deleteAcknowledged}
                    onChange={(event) =>
                      setDeleteAcknowledged(event.target.checked)
                    }
                    style={{ marginTop: '4px', width: '18px', height: '18px' }}
                  />
                  <span>
                    I understand that this assignment cannot be recovered after it is deleted.
                  </span>
                </label>
              </div>
            )}

            {deleteError && (
              <div
                style={{
                  marginTop: '18px',
                  padding: '12px',
                  background: 'var(--mm-error-bg)',
                  color: 'var(--mm-error-text)',
                  borderRadius: '8px',
                }}
              >
                {deleteError}
              </div>
            )}
          </div>

          <div
            style={{
              padding: '18px 28px',
              borderTop: '1px solid var(--mm-border-soft)',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              background: 'var(--mm-surface-sunken)',
            }}
          >
            <button
              onClick={deleteStep === 1 ? closeDeleteDialog : () => setDeleteStep((step) => step - 1)}
              disabled={isDeleting}
              style={{
                padding: '10px 18px',
                background: 'var(--mm-surface)',
                color: 'var(--mm-text)',
                border: '1px solid var(--mm-border)',
                borderRadius: '8px',
                cursor: isDeleting ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
              }}
            >
              {deleteStep === 1 ? 'Cancel' : 'Back'}
            </button>

            {deleteStep === 1 && !evidenceLoading && !evidenceError && !canDelete ? (
              <button
                onClick={archiveFromDeleteDialog}
                disabled={isDeleting}
                style={{ padding: '10px 18px', background: 'var(--mm-primary)', color: 'var(--mm-on-primary)', border: 'none', borderRadius: '8px', cursor: isDeleting ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
              >
                {isDeleting ? 'Archiving…' : 'Archive instead'}
              </button>
            ) : deleteStep < 3 ? (
              <button
                onClick={() => setDeleteStep((step) => step + 1)}
                disabled={(deleteStep === 1 && (!canDelete || (classroomPosts > 0 && !deleteClassroomAcknowledged))) || (deleteStep === 2 && !titleMatches)}
                style={{
                  padding: '10px 18px',
                  background:
                    (deleteStep === 1 && (!canDelete || (classroomPosts > 0 && !deleteClassroomAcknowledged))) || (deleteStep === 2 && !titleMatches) ? 'var(--mm-surface-control-strong)' : 'var(--mm-danger)',
                  color: (deleteStep === 1 && (!canDelete || (classroomPosts > 0 && !deleteClassroomAcknowledged))) || (deleteStep === 2 && !titleMatches) ? 'var(--mm-disabled-text)' : 'var(--mm-on-primary)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor:
                    (deleteStep === 1 && (!canDelete || (classroomPosts > 0 && !deleteClassroomAcknowledged))) || (deleteStep === 2 && !titleMatches)
                      ? 'not-allowed'
                      : 'pointer',
                  fontWeight: 'bold',
                }}
              >
                Continue
              </button>
            ) : (
              <button
                onClick={deleteAssignmentPermanently}
                disabled={!deleteAcknowledged || isDeleting}
                style={{
                  padding: '10px 18px',
                  background:
                    !deleteAcknowledged || isDeleting ? 'var(--mm-surface-control-strong)' : 'var(--mm-danger)',
                  color: !deleteAcknowledged || isDeleting ? 'var(--mm-disabled-text)' : 'var(--mm-on-primary)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor:
                    !deleteAcknowledged || isDeleting
                      ? 'not-allowed'
                      : 'pointer',
                  fontWeight: 'bold',
                }}
              >
                {isDeleting ? 'Deleting…' : 'Permanently Delete'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const closeExportJsonDialog = () => {
    setExportJsonAssignment(null);
    setExportJsonCopied(false);
  };

  const copyExportJsonToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setExportJsonCopied(true);
    } catch (error) {
      console.error(error);
      setExportJsonCopied(false);
    }
  };

  const renderExportJsonDialog = () => {
    if (!exportJsonAssignment) return null;

    const exportedText = JSON.stringify(buildCurrentContentPortablePackage(exportJsonAssignment), null, 2);

    return (
      <div
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeExportJsonDialog();
        }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(32,33,36,0.72)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-json-title"
          style={{
            width: '100%',
            maxWidth: '720px',
            background: 'var(--mm-surface)',
            borderRadius: '16px',
            boxShadow: '0 24px 70px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            textAlign: 'left',
          }}
        >
          <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--mm-border-soft)' }}>
            <h2 id="export-json-title" style={{ margin: 0, color: 'var(--mm-text-strong)' }}>
              Export Current Content V{contentVersionOf(exportJsonAssignment)} &middot; {exportJsonAssignment.title}
            </h2>
            <p style={{ margin: '8px 0 0', color: 'var(--mm-text-muted)', fontSize: '13px' }}>
              This is a portable MathMaster assignment. You can copy it into another MathMaster authoring workflow and bring it back through Assignment Creator. Student/class dates and publication records stay out of the portable assignment.
            </p>
          </div>
          <div style={{ padding: '20px 28px' }}>
            <textarea
              readOnly
              value={exportedText}
              onFocus={(event) => event.target.select()}
              style={{ width: '100%', height: '360px', padding: '12px', borderRadius: '8px', border: '1px solid var(--mm-border)', fontFamily: 'monospace', fontSize: '12px', boxSizing: 'border-box', resize: 'vertical' }}
            />
          </div>
          <div style={{ padding: '18px 28px', borderTop: '1px solid var(--mm-border-soft)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={closeExportJsonDialog}
              style={{ padding: '10px 18px', background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => copyExportJsonToClipboard(exportedText)}
              style={{ padding: '10px 18px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              {exportJsonCopied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderTeacherScratchpadDialog = () => {
    if (!teacherScratchpadDialog) return null;
    return (
      <div
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setTeacherScratchpadDialog(null);
          }
        }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10020,
          background: 'rgba(20,24,31,0.78)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="student-work-title"
          style={{
            width: 'min(1080px, 96vw)',
            maxHeight: '92vh',
            overflow: 'auto',
            background: 'var(--mm-surface)',
            borderRadius: '14px',
            boxShadow: '0 22px 70px rgba(0,0,0,0.35)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '20px',
              padding: '18px 22px',
              borderBottom: '1px solid var(--mm-border-soft)',
            }}
          >
            <div>
              <h2 id="student-work-title" style={{ margin: 0, color: 'var(--mm-text-strong)' }}>
                Student Scratchpad
              </h2>
              <div style={{ color: 'var(--mm-text-muted)', marginTop: '5px', fontSize: '14px' }}>
                {formatStudentName(allStudents.find((student) => student.id === teacherScratchpadDialog.studentId), { lastFirst: false })} · Question{' '}
                {teacherScratchpadDialog.questionIndex + 1}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTeacherScratchpadDialog(null)}
              style={{
                border: '1px solid var(--mm-border)',
                background: 'var(--mm-surface)',
                borderRadius: '999px',
                padding: '8px 14px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
          <div style={{ padding: '24px', textAlign: 'center' }}>
            {teacherScratchpadLoading ? (
              <p style={{ color: 'var(--mm-text-muted)' }}>Loading student work…</p>
            ) : (teacherScratchpadDialog.pages?.length || teacherScratchpadDialog.dataUrl) ? (
              // Pages are stacked and labelled rather than paged through: a
              // teacher grading a stack of scratchpads should not have to
              // discover that page two exists.
              <div style={{ display: 'grid', gap: '18px' }}>
                {(teacherScratchpadDialog.pages?.length
                  ? teacherScratchpadDialog.pages
                  : [teacherScratchpadDialog.dataUrl]
                ).map((page, index, all) => (
                  <figure key={index} style={{ margin: 0 }}>
                    {all.length > 1 && (
                      <figcaption style={{ marginBottom: '6px', textAlign: 'left', fontSize: '12px', fontWeight: 800, color: 'var(--mm-text-muted)' }}>
                        Page {index + 1} of {all.length}
                      </figcaption>
                    )}
                    <img
                      src={page}
                      alt={`Scratchpad work for question ${teacherScratchpadDialog.questionIndex + 1}${all.length > 1 ? `, page ${index + 1}` : ''}`}
                      style={{
                        display: 'block',
                        width: '100%',
                        height: 'auto',
                        maxHeight: '72vh',
                        objectFit: 'contain',
                        background: 'var(--mm-surface)',
                        border: '1px solid var(--mm-border)',
                        borderRadius: '10px',
                      }}
                    />
                  </figure>
                ))}
              </div>
            ) : (
              <div
                style={{
                  padding: '55px 20px',
                  border: '2px dashed var(--mm-border)',
                  borderRadius: '10px',
                  color: 'var(--mm-text-muted)',
                }}
              >
                No saved scratchpad is available for this question.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderAssignmentWorkspace = (preview = false) => {
    const assignment = activeAssignmentData;
    if (!assignment) {
      return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <p>This assignment is no longer available.</p>
          <button onClick={() => setActiveView('dashboard')} style={{ marginTop: '16px' }}>Return</button>
        </div>
      );
    }

    const questions = getStoredAssignmentQuestions(assignment);
    const currentContent = projectCurrentAssignmentContent(assignment);
    const lifecycle = getAssignmentLifecycle(assignment, now, {
      studentId: !preview && user?.role === 'student' ? user.id : undefined,
    });
    /*
     * A GRANTED PRACTICE PASS EXCUSES PRACTICE FROM THIS RUNTIME.
     *
     * Never for Teacher Preview (no student redemption to read), and never
     * once the assignment has moved into post-deadline voluntary Practice
     * Mode -- that already runs against a completely separate, already-
     * non-credit tracker (`workingTracker` below), and must remain unchanged.
     */
    const hasPracticePass = !preview && !lifecycle.isPracticeOnly && hasPracticePassFor(assignment.id);
    // This student's own required items: a reduced-item-count accommodation
    // omits some (never in a preview or voluntary practice). Omitted items are
    // not shown, not counted and never "left to do".
    const studentRequired = !preview && !lifecycle.isPracticeOnly
      ? studentRequiredFor(assignment, { hasPracticePass })
      : null;
    const studentRequiredSet = studentRequired?.omitted?.length ? new Set(studentRequired.indices) : null;
    const projectedEntries = (activeClassroomSectionKey
      ? currentContent.entries.filter((entry) => entry.logicalRole === activeClassroomSectionKey)
      : hasPracticePass
        ? currentContent.entries.filter((entry) => entry.logicalRole !== 'practice')
        : currentContent.entries)
      .filter((entry) => !studentRequiredSet || studentRequiredSet.has(entry.storageIndex));
    const includedQuestionIndices = projectedEntries.map((entry) => entry.storageIndex);
    const workspaceSupportProfile = !preview && !lifecycle.isPracticeOnly && user?.role === 'student' ? user.profile : null;
    // The RECORDED grade is the student's real grade in every mode, so it is
    // over their own required items even in post-deadline Practice Mode — the
    // number the Grade Center and Classroom show.
    const officialSupportProfile = !preview && user?.role === 'student' ? user.profile : null;
    const recordedTracker = tracker[activeAssignmentId] || {};
    const workingTracker = preview
      ? previewTracker
      : lifecycle.isPracticeOnly
        ? practiceTracker[activeAssignmentId] || createPracticeAssignmentTracker(questions, recordedTracker)
        : recordedTracker;
    const recordedGrade = calculateGrade(recordedTracker, assignment, { supportProfile: officialSupportProfile });
    const gradeSplit = splitGrade({ tracker: recordedTracker, assignment, supportProfile: officialSupportProfile });
    const classroomReceipt = !preview ? classroomSyncStatusByAssignment?.[assignment.id] || null : null;
    const classroomReceiptStage = String(classroomReceipt?.stage || '');
    const classroomReceiptFinal = classroomReceipt?.isFinal === true || classroomReceiptStage.startsWith('final-');
    const classroomReceiptStudentVisible = classroomReceipt?.studentVisible === true;
    const classroomReceiptGrade = Number.isFinite(Number(classroomReceipt?.grade))
      ? Number(classroomReceipt.grade)
      : null;
    const classroomReceiptCurrent = classroomReceiptGrade != null && classroomReceiptGrade === recordedGrade;
    const progress = calculatePracticeProgress(workingTracker, assignment, { hasPracticePass });
    const dolState = getDOLState({ assignment, schedule: classSchedule, classId: user?.classId || null, classPeriod: user?.classPeriod, nowValue: now });
    const warmupState = getWarmupState({ assignment, schedule: classSchedule, classId: user?.classId || null, classPeriod: user?.classPeriod, nowValue: now });
    // A teacher previewing an assignment is never handed into a live game.
    const warmupChallengeDecision = preview ? null : resolveWarmupChallenge({
      assignment,
      assignmentId: activeAssignmentId,
      warmupState,
      invite: liveChallengeInvite,
      playedRoomIds: warmupChallengePlayedRoomIds,
    });
    const currentRecord = normalizeQuestionRecord(workingTracker?.[currentQuestionIndex]);
    const currentIsDOL = !lifecycle.isPracticeOnly && activeQuestionRole === 'dol' && dolState.enabled && (dolState.questionIndices || [dolState.questionIndex]).includes(currentQuestionIndex);
    const currentIsWarmup = !lifecycle.isPracticeOnly && activeQuestionRole === 'warmup' && warmupState.enabled;
    // A finalization receipt ("Time ended…") describes a close. When the
    // teacher reopens the Warm-Up (or recovers the DOL), the section is open
    // again and the receipt from the earlier window no longer describes it.
    const currentSectionOpenNow = (currentIsWarmup && warmupState.status === 'active')
      || (currentIsDOL && dolState.status === 'active');
    const currentManualSectionState = getSectionAccessState({
      assignment,
      activityRole: activeQuestionRole,
      classId: user?.classId || null,
      classPeriod: user?.classPeriod,
      nowValue: now,
      studentId: !preview && user?.role === 'student' ? user.id : undefined,
    });
    const currentSectionManuallyLocked = !preview
      && !lifecycle.isPracticeOnly
      && currentManualSectionState.enabled
      && !currentManualSectionState.isOpen;
    const assignmentFeedbackHeld = !preview && !lifecycle.isPracticeOnly && assignmentHasHeldTeacherFeedback(assignment);
    const currentFeedbackReleased = lifecycle.isPracticeOnly || assignmentFeedbackWasReleased(assignment)
      || (activeActivityPolicy.feedback === 'afterAssignmentSubmit' && ['correct', 'expired'].includes(currentRecord.status));
    const runtimeActivityRole = !preview && lifecycle.isPracticeOnly ? 'practice' : activeQuestionRole;
    const runtimeActivityPolicy = getEffectiveActivityPolicy(runtimeActivityRole);
    const currentCheckpointOutcome = preview ? null : checkpointOutcomes[currentQuestionIndex] || null;
    const currentQuestionBlueprint = questions[currentQuestionIndex];
    const currentReplacementAllowed = resolveQuestionReplacementAllowed({
      question: currentQuestionBlueprint,
      activityPolicy: runtimeActivityPolicy,
      canGenerateFresh: isPersonalizedBlueprint(currentQuestionBlueprint),
    });
    const runtimeQuestionActivityPolicy = currentReplacementAllowed === runtimeActivityPolicy.allowReplacement
      ? runtimeActivityPolicy
      : { ...runtimeActivityPolicy, allowReplacement: currentReplacementAllowed };
    const currentSectionVariantMode = getSectionVariantMode(assignment, activeQuestionRole);
    const generationStudentKey = currentSectionVariantMode === 'shared'
      ? `shared-version:${assignment.id}:${activeQuestionRole}`
      : preview ? 'teacher-preview' : user?.id || 'anonymous';
    // QUESTION FAMILY SLOTS: this student's seat, the variant, and any pin that
    // already says which question they were shown. Null for every other slot,
    // which therefore generates exactly as it always has.
    const currentFamilyContext = buildStudentFamilyContext({
      assignment,
      question: questions[currentQuestionIndex],
      storageIndex: currentQuestionIndex,
      studentId: preview ? null : user?.id || null,
      classId: user?.classId || null,
      sectionMode: currentSectionVariantMode,
      record: workingTracker?.[currentQuestionIndex],
      preview,
    });

    // ADAPTATION, RESOLVED ONCE.
    //
    // The same value is used to generate the question and, at grade time, to
    // record what was actually delivered. Resolving it in two places would let
    // the evidence disagree with the question the student answered — which is
    // the defect this whole seam exists to close.
    const currentAdaptation = preview ? null : resolveDeliveredQuestionMetadata({
      question: questions[currentQuestionIndex],
      learningProfile: studentLearningProfile,
      activityRole: runtimeActivityRole,
      variationMode: currentSectionVariantMode,
      honors: String(user?.profile?.courseLevel || '').toLowerCase() === 'honors',
    });
    const draftSessionMode = preview ? 'preview' : lifecycle.isPracticeOnly ? 'post-deadline-practice' : lifecycle.isLate ? 'late' : 'graded';
    const supportPresentation = preview ? getStudentSupportPresentation({}) : activeSupportPresentation;
    const replacementWarning = currentIsDOL && dolState.status === 'active'
      ? `Requesting another DOL question will erase this DOL attempt. You will have only ${formatRemainingTime(dolState.millisecondsRemaining)} remaining to submit the replacement.`
      : '';

    if (!includedQuestionIndices.length) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
          <h2>No questions are currently included</h2>
          <p>The teacher has excluded every question from this assignment.</p>
          <button onClick={() => { setActiveView('dashboard'); setActiveAssignmentId(null); }}>Return to Dashboard</button>
        </div>
      );
    }

    const lifecycleBadge = lifecycle.isPracticeOnly
      ? { label: 'Practice only', background: 'var(--mm-surface-control)', color: 'var(--mm-text)' }
      : lifecycle.isLate
        ? { label: 'Late — still open', background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)' }
        : lifecycle.isScheduled
          ? { label: 'Scheduled', background: 'var(--mm-surface-control-strong)', color: 'var(--mm-text)' }
          : { label: 'On-time access', background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' };

    // Bundle/V5 activities are flattened for runtime compatibility, but every
    // question keeps its activityRole. Rebuild the visible sections here so a
    // student can tell when they are in the Warm-Up, Classwork, Practice, or
    // DOL instead of seeing one undifferentiated row of question numbers.
    const activitySectionMeta = {
      warmup: { label: 'Warm-Up', background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)', border: '#f9ab00' },
      classwork: { label: 'Classwork', background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', border: '#1a73e8' },
      practice: { label: 'Practice', background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)', border: '#34a853' },
      dol: { label: 'DOL / Exit Ticket', background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)', border: '#9334e6' },
      checkpoint: { label: 'Checkpoint', background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)', border: '#d93025' },
      quiz: { label: 'Quiz', background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)', border: '#d93025' },
      test: { label: 'Test', background: 'var(--mm-error-bg)', color: 'var(--mm-error-text)', border: '#d93025' },
    };
    // With fewer required items, "Question 3 of 6" counts this student's own
    // items in the section, not the class's (never "Question 5 of 3").
    const requiredSectionPosition = new Map();
    if (studentRequiredSet) {
      const seen = new Map();
      projectedEntries.forEach((entry) => {
        const position = seen.get(entry.logicalRole) || 0;
        requiredSectionPosition.set(entry.storageIndex, position);
        seen.set(entry.logicalRole, position + 1);
      });
    }
    const visibleQuestionEntries = projectedEntries.map((entry, visiblePosition) => {
      const index = entry.storageIndex;
      const question = questions[index];
      const isTimedDOLQuestion = dolState.enabled && (dolState.questionIndices || [dolState.questionIndex]).includes(index);
      const sectionPosition = studentRequiredSet ? requiredSectionPosition.get(index) : entry.logicalPosition;
      return { index, visiblePosition, sectionPosition, question, role: entry.logicalRole, isTimedDOLQuestion };
    });
    const sectionQuestionIsComplete = (index) => ['correct', 'expired'].includes(normalizeQuestionRecord(workingTracker?.[index]).status);
    const sectionQuestionIsCorrect = (index) => normalizeQuestionRecord(workingTracker?.[index]).status === 'correct';
    const visibleByStorageIndex = new Map(visibleQuestionEntries.map((entry) => [entry.index, entry]));
    const navigationSections = currentContent.logicalSections.map((logicalSection) => ({
      role: logicalSection.role,
      entries: logicalSection.entries.map((entry) => visibleByStorageIndex.get(entry.storageIndex)).filter(Boolean),
    })).filter((section) => section.entries.length).map((section) => ({
      ...section,
      complete: section.entries.length > 0 && section.entries.every((entry) => sectionQuestionIsComplete(entry.index)),
      allCorrect: section.entries.length > 0 && section.entries.every((entry) => sectionQuestionIsCorrect(entry.index)),
    }));
    const currentSectionMeta = activitySectionMeta[activeQuestionRole] || {
      label: String(activeQuestionRole || 'Activity').replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()),
      background: 'var(--mm-surface-control)', color: 'var(--mm-text)', border: 'var(--mm-border-strong)',
    };
    const currentGuidedNotesMode = assignment?.guidedNotesBySection?.[activeQuestionRole]
      || (activeQuestionRole === 'classwork' ? 'automatic' : 'off');

    const assignmentHasClasswork = visibleQuestionEntries.some((entry) => entry.role === 'classwork');
    const currentVisibleEntryPosition = visibleQuestionEntries.findIndex((entry) => entry.index === currentQuestionIndex);
    const currentVisibleEntry = currentVisibleEntryPosition >= 0 ? visibleQuestionEntries[currentVisibleEntryPosition] : null;
    const currentNavigationSection = navigationSections.find((section) => section.entries.some((entry) => entry.index === currentQuestionIndex));
    const currentSectionQuestionNumber = (currentVisibleEntry?.sectionPosition ?? 0) + 1;
    const currentSectionQuestionCount = currentNavigationSection?.entries.length || 1;
    const currentSectionCompletedCount = currentNavigationSection?.entries.filter((entry) => sectionQuestionIsComplete(entry.index)).length || 0;
    const currentSectionRemainingCount = Math.max(0, currentSectionQuestionCount - currentSectionCompletedCount);
    const currentSectionGrades = splitGradesBySection({ tracker: workingTracker, assignment, supportProfile: workspaceSupportProfile });
    const currentSectionOfficialGrades = splitGradesBySection({ tracker: recordedTracker, assignment, supportProfile: officialSupportProfile });
    const currentSectionGrade = currentSectionGrades[activeQuestionRole] || null;
    const currentSectionOfficialGrade = currentSectionOfficialGrades[activeQuestionRole] || null;
    const warmupCanBeViewed = ['active', 'closed', 'ended'].includes(warmupState.status);
    const entryIsAvailable = (entry) => {
      if (preview || lifecycle.isPracticeOnly) return true;
      if (entry?.role === 'warmup' && warmupState.enabled && !warmupCanBeViewed) return false;
      if (entry?.isTimedDOLQuestion && !lifecycle.isClosed && !['active', 'ended'].includes(dolState.status)) return false;
      const manualState = getSectionAccessState({
        assignment,
        activityRole: entry?.role,
        classId: user?.classId || null,
        classPeriod: user?.classPeriod,
        nowValue: now,
        studentId: user?.role === 'student' ? user.id : undefined,
      });
      if (manualState.enabled && !manualState.isOpen) return false;
      return true;
    };
    const compactSectionLabel = (section) => section?.role === 'dol'
      ? 'DOL'
      : (activitySectionMeta[section?.role]?.label || section?.role || 'Section');
    const sectionNavigationTarget = (section) => {
      const availableEntries = (section?.entries || []).filter((entry) => entryIsAvailable(entry));
      if (!availableEntries.length) return null;
      // A section shortcut resumes at the earliest question that is not yet
      // correct. This intentionally includes an exhausted variant so the
      // student can request a replacement rather than silently skipping it.
      const needsWork = availableEntries.find((entry) => normalizeQuestionRecord(workingTracker?.[entry.index]).status !== 'correct');
      if (needsWork) return needsWork;
      const currentEntry = availableEntries.find((entry) => entry.index === currentQuestionIndex);
      return currentEntry || availableEntries[0];
    };
    const findNeighbor = (direction) => {
      for (let position = currentVisibleEntryPosition + direction; position >= 0 && position < visibleQuestionEntries.length; position += direction) {
        if (entryIsAvailable(visibleQuestionEntries[position])) return visibleQuestionEntries[position];
      }
      return null;
    };
    const previousQuestionEntry = findNeighbor(-1);
    const nextQuestionEntry = findNeighbor(1);
    const nextQuestionSectionMeta = nextQuestionEntry ? (activitySectionMeta[nextQuestionEntry.role] || { label: nextQuestionEntry.role }) : null;
    const nextQuestionDestinationLabel = nextQuestionEntry ? `Question ${nextQuestionEntry.sectionPosition + 1} of ${navigationSections.find((section) => section.role === nextQuestionEntry.role)?.entries.length || 1}` : '';
    const currentNavigationSectionIndex = navigationSections.findIndex((section) => section.role === currentNavigationSection?.role);
    const laterNavigationSections = currentNavigationSectionIndex >= 0
      ? navigationSections.slice(currentNavigationSectionIndex + 1)
      : [];
    // When a student finishes an entire section, point the celebration CTA at
    // the next AVAILABLE unfinished section. A locked DOL is intentionally
    // skipped rather than becoming a dead-end button.
    const nextAvailableIncompleteSection = laterNavigationSections.find((section) => !section.complete && sectionNavigationTarget(section));
    // Only a section with work left: "Continue to Practice" with Practice
    // already complete was a dead loop. With none left, hand off to Up next
    // (what Home would recommend) or to this assignment's results.
    const nextAvailableSection = nextAvailableIncompleteSection
      // An EARLIER section still open with work left beats leaving the assignment.
      || navigationSections.find((section) => section.role !== currentNavigationSection?.role && !section.complete && sectionNavigationTarget(section))
      || null;
    const nextAvailableSectionTarget = nextAvailableSection ? sectionNavigationTarget(nextAvailableSection) : null;
    const nextAvailableSectionMeta = nextAvailableSection
      ? (activitySectionMeta[nextAvailableSection.role] || { label: nextAvailableSection.role })
      : null;
    const assignmentHandoff = currentNavigationSection?.allCorrect
      ? resolveAssignmentHandoff({
        nextIncompleteSection: nextAvailableSectionTarget ? nextAvailableSection : null,
        nextIncompleteSectionLabel: nextAvailableSectionMeta?.label || '',
        upNext: !preview && user?.role === 'student' && !lifecycle.isPracticeOnly && !nextAvailableSectionTarget
          ? resolveUpNext({ dashboard: studentUpNextDashboard(), assignmentId: activeAssignmentId })
          : null,
        student: !preview && user?.role === 'student',
      })
      : null;
    const continueAfterSection = !assignmentHandoff
      ? null
      : assignmentHandoff.kind === 'section'
        ? () => changeQuestion(nextAvailableSectionTarget.index)
        : assignmentHandoff.kind === 'upNext'
          ? () => (assignmentHandoff.upNext.opensResult
            ? openStudentAssignmentResult(assignmentHandoff.upNext.assignment.id, { origin: 'assignments' })
            : startAssignment(assignmentHandoff.upNext.assignment.id, assignmentHandoff.upNext.questionIndex ?? 0))
          : () => openStudentAssignmentResult(activeAssignmentId, { origin: 'assignments' });
    const returnsToAssignmentResult = !preview
      && assignmentResultRoute?.assignmentId === activeAssignmentId;
    // Name the destination, not the direction. A student who opened this from
    // the Assignments Center should be told they are going back to it.
    const studentAssignmentBackLabel = returnsToAssignmentResult
      ? 'Back to Results'
      : studentDashboardMode === 'assignmentsCenter'
        ? 'Back to Assignments'
        : studentDashboardMode === 'grades'
          ? 'Back to Grades'
          : 'Back to Home';
    const isLiveTeachingThisAssignment = preview
      && liveTeachingSession?.active
      && String(liveTeachingSession.assignmentId) === String(assignment.id);
    const leaveAssignment = () => {
      if (preview) {
        // Live Teaching returns to Live Classroom, where Resume/Restart/End
        // live; a plain "View as Student" preview still exits to Assignments.
        setTeacherTab(isLiveTeachingThisAssignment ? 'home' : 'assignments');
      } else {
        flushAssignmentActivity(activeAssignmentId).catch(() => {});
        if (returnsToAssignmentResult) {
          setActiveClassroomSectionKey(
            assignmentResultRoute.sectionKey === 'whole' ? null : assignmentResultRoute.sectionKey,
          );
          setActiveView('assignmentResult');
          return;
        }
      }
      setActiveView('dashboard');
      setActiveAssignmentId(null);
    };

    // While the Warm-Up challenge is live it IS the screen. Rendering the
    // assignment underneath would leave a student scrolling between a timed
    // round and the work it replaced.
    if (warmupChallengeDecision?.route === WARMUP_CHALLENGE_ROUTE.PLAY && warmupChallengeDecision.roomId) {
      return (
        <div className="mathmaster-assignment-screen" style={{ padding: 20 }}>
          <WarmupChallengeGate
            decision={warmupChallengeDecision}
            invite={liveChallengeInvite}
            studentProfile={{ studentId: user?.studentId, name: user?.name }}
            onExitToAssignment={() => setWarmupChallengePlayedRoomIds((previous) => (
              previous.includes(warmupChallengeDecision.roomId)
                ? previous
                : [...previous, warmupChallengeDecision.roomId]
            ))}
          />
        </div>
      );
    }

    return (
      <div
        className={`mathmaster-assignment-screen ${supportPresentation.highContrast ? 'mathmaster-support-high-contrast' : ''} ${supportPresentation.largeText ? 'mathmaster-support-large-text' : ''}`}
        style={{
          fontFamily: '"Segoe UI", sans-serif',
          backgroundColor: supportPresentation.highContrast ? 'var(--mm-surface)' : 'var(--mm-surface-control)',
          minHeight: '100vh',
          padding: '20px',
          fontSize: supportPresentation.largeText ? '120%' : undefined,
        }}
      >
        {/*
          * Teacher review controls, mounted once for the whole preview.
          *
          * They belong here rather than inside the question runtime for two
          * reasons. The point of View as Student is to see the formatting and
          * sizing a student gets, so these controls portal to a fixed overlay
          * and never enter the student layout. And a teacher needs them the
          * whole time they are looking at student-facing work — on the section
          * overview, between questions, in Focus view, and when a question
          * module fails to render at all. Mounted inside the module boundary
          * they existed only while a module was on screen, which is the one
          * moment a teacher is least likely to be judging the page.
          */}
        {preview && activeAssignmentId && (
          <TeacherQuestionReviewPanel
            assignmentId={activeAssignmentId}
            question={questions[currentQuestionIndex] || null}
            questionIndex={currentQuestionIndex}
            onAssignmentRefresh={fetchAssignments}
          />
        )}
        {!preview && renderStudentPackUpBanner()}
        {!preview && renderStudentWarmupBanner()}
        {!preview && shouldShowWarmupWaitingPanel({ decision: warmupChallengeDecision, invite: liveChallengeInvite }) && (
          <WarmupChallengeGate decision={warmupChallengeDecision} />
        )}
        {!preview && !supportPresentation.disableIdleTimer && renderIdleOverlay()}
        <div className="mathmaster-assignment-shell" style={{ maxWidth: '1120px', margin: '0 auto' }}>
          {isLiveTeachingThisAssignment && (
            <section
              role="status"
              aria-label="Live Teaching"
              style={{ marginBottom: '16px', padding: '10px 16px', borderRadius: '10px', background: '#137333', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', fontWeight: 800, fontSize: '13px' }}
            >
              <span>🔴 LIVE TEACHING · Teacher exemplar — {describeClassworkPace({ assignment, classworkQuestionPosition: liveTeachingSession?.classworkQuestionPosition ?? null })}. No student data is affected.</span>
              {questions[currentQuestionIndex]?.instructionalPhase && (
                <strong>{({ iDo: 'I DO', weDo: 'WE DO', youDo: 'YOU DO' })[questions[currentQuestionIndex].instructionalPhase]}</strong>
              )}
              <strong aria-live="polite" style={{ color: liveTeachingSession?.timer?.status === 'expired' ? '#fdd663' : '#fff' }}>
                {liveTeachingSession?.timer?.status === 'expired' ? 'TIME EXPIRED' : `${Math.floor(walkthroughTimerRemaining(liveTeachingSession?.timer, now) / 60)}:${String(walkthroughTimerRemaining(liveTeachingSession?.timer, now) % 60).padStart(2, '0')}`}
              </strong>
              {Number(liveTeachingSession?.timer?.durationSeconds || 0) > Number(questions[currentQuestionIndex]?.suggestedWorkSeconds || 0) && (
                <strong
                  aria-label="Live timer has been extended beyond the authored plan"
                  style={{ padding: '3px 7px', borderRadius: 999, background: '#fdd663', color: 'var(--mm-warning-text)', fontSize: 11 }}
                >
                  EXTENDED +{Math.floor((Number(liveTeachingSession.timer.durationSeconds) - Number(questions[currentQuestionIndex]?.suggestedWorkSeconds || 0)) / 60)}:{String((Number(liveTeachingSession.timer.durationSeconds) - Number(questions[currentQuestionIndex]?.suggestedWorkSeconds || 0)) % 60).padStart(2, '0')}
                </strong>
              )}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => controlWalkthroughTimer(liveTeachingSession?.timer?.status === 'paused' ? 'resume' : 'start')} style={{ padding: '6px 10px' }}>{liveTeachingSession?.timer?.status === 'paused' ? 'Resume' : 'Start'}</button>
                <button type="button" onClick={() => controlWalkthroughTimer('pause')} style={{ padding: '6px 10px' }}>Pause</button>
                <button type="button" onClick={() => controlWalkthroughTimer('reset', questions[currentQuestionIndex]?.suggestedWorkSeconds)} style={{ padding: '6px 10px' }}>Reset</button>
                <button type="button" onClick={() => controlWalkthroughTimer('extend', 30)} style={{ padding: '6px 10px' }}>+30 sec</button>
                <button type="button" onClick={() => controlWalkthroughTimer('extend', 60)} style={{ padding: '6px 10px' }}>+1 min</button>
                <button
                  type="button"
                  onClick={() => teachAssignmentLive(assignment.id, { forceRestart: true })}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--mm-border-soft)', background: 'transparent', color: '#fff', fontWeight: 900, cursor: 'pointer', fontSize: 12 }}
                >
                  Restart Fresh
                </button>
                <button
                  type="button"
                  onClick={() => { leaveAssignment(); endLiveTeaching(); }}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--mm-border-soft)', background: 'var(--mm-surface)', color: 'var(--mm-success-text)', fontWeight: 900, cursor: 'pointer', fontSize: 12 }}
                >
                  End Teaching
                </button>
              </div>
            </section>
          )}
          {!preview && shouldShowChallengeHandoffBanner({ invite: liveChallengeInvite, warmupDecision: warmupChallengeDecision }) && (
            <section className="mathmaster-assignment-banner" style={{ marginBottom: '16px', padding: '18px 22px', borderRadius: '13px', background: 'var(--mm-primary-soft)', border: '3px solid #1a73e8', color: 'var(--mm-primary-text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', textAlign: 'left' }}>
              <div><strong style={{ display: 'block', fontSize: '20px' }}>⚡ Live Challenge has started</strong><span>{liveChallengeInvite.title || 'Your class challenge'} is live now. Your assignment work is saved when you switch.</span></div>
              <button type="button" onClick={() => { leaveAssignment(); setStudentDashboardMode('liveChallenge'); }} style={{ padding: '11px 17px', border: 0, borderRadius: '9px', background: '#174ea6', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Join Live Challenge</button>
            </section>
          )}
          {lifecycle.isLate && !preview && (
            <section className="mathmaster-assignment-banner" style={{ marginBottom: '16px', padding: '18px 22px', borderRadius: '13px', background: 'var(--mm-warning-soft)', border: '2px solid #f9ab00', color: 'var(--mm-warning-text)', textAlign: 'left' }}>
              <strong style={{ display: 'block', fontSize: '20px' }}>Late submission window</strong>
              <span>The regular deadline passed. You have <strong>{formatRemainingTime(lifecycle.millisecondsRemaining)}</strong> before this assignment closes permanently on {studentDueDateLines(assignment, lifecycle).finalText}.</span>
            </section>
          )}

          {lifecycle.isPracticeOnly && !preview && (
            <section className="mathmaster-assignment-banner" style={{ marginBottom: '16px', padding: '18px 22px', borderRadius: '13px', background: 'var(--mm-surface-control)', border: '2px solid #5f6368', color: 'var(--mm-text)', textAlign: 'left' }}>
              <strong style={{ display: 'block', fontSize: '20px' }}>Practice Mode — grading window ended</strong>
              <span>Your recorded grade is frozen. You may keep practicing with feedback, but these attempts earn no credit and are not written to the teacher gradebook, mastery evidence, Math Path recommendations, or activity analytics. Your practice is saved, so you can pick it up again on another Chromebook, and your teacher can see it when they review your work.</span>
            </section>
          )}

          {!preview && dolState.status === 'active' && (dolState.questionIndices || [dolState.questionIndex]).some((index) => normalizeQuestionRecord(workingTracker?.[index]).totalAttempts === 0) && (
            <section className="mathmaster-assignment-banner" style={{ marginBottom: '16px', padding: '20px 22px', borderRadius: '14px', background: 'var(--mm-accent-soft)', border: '2px solid #9334e6', color: 'var(--mm-text)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap', textAlign: 'left' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '22px' }}>DOL is available now</strong>
                <span>The entire DOL section is open. Complete all {(dolState.questionIndices || [dolState.questionIndex]).length} question{(dolState.questionIndices || [dolState.questionIndex]).length === 1 ? '' : 's'} before the timer reaches zero.</span>
                {!supportPresentation.hideCountdowns && <div style={{ marginTop: '7px', fontWeight: 900, fontSize: '18px' }}><DOLCountdown endsAt={dolState.endsAt} /> remaining</div>}
              </div>
              <button type="button" onClick={() => changeQuestion((dolState.questionIndices || [dolState.questionIndex])[0])} style={{ padding: '12px 18px', border: 0, borderRadius: '10px', background: '#681da8', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Start DOL Section</button>
            </section>
          )}

          <header className="mathmaster-assignment-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--mm-surface)', padding: '18px 24px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: '22px', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'left', flex: '1 1 390px' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 5 }}>
                <button
                  onClick={leaveAssignment}
                  style={{ background: 'none', border: 'none', color: 'var(--mm-primary)', cursor: 'pointer', fontWeight: 'bold', padding: 0 }}
                >
                  &larr; {preview ? 'Back to Instructor Dashboard' : studentAssignmentBackLabel}
                </button>
                {preview && !isLiveTeachingThisAssignment && (
                  <button
                    type="button"
                    onClick={() => startTeacherPreview(assignment.id)}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #1a73e8', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 900, cursor: 'pointer', fontSize: 12 }}
                  >
                    ↻ Restart Preview Fresh
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, color: 'var(--mm-text-strong)', fontSize: '23px' }}>{assignment.title}</h1>
                <span style={{ padding: '4px 9px', borderRadius: '999px', background: lifecycleBadge.background, color: lifecycleBadge.color, fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>{lifecycleBadge.label}</span>
                {assignmentHasClasswork && assignment?.guidedNotesBySection?.classwork !== 'off' && <span style={{ padding: '4px 9px', borderRadius: '999px', background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', fontSize: '11px', fontWeight: 900 }}>GUIDED NOTES · CLASSWORK</span>}
                <span style={{ padding: '4px 9px', borderRadius: '999px', background: currentSectionVariantMode === 'shared' ? 'var(--mm-success-bg)' : 'var(--mm-accent-soft)', color: currentSectionVariantMode === 'shared' ? 'var(--mm-success-text)' : 'var(--mm-accent-text)', fontSize: '11px', fontWeight: 900 }}>{currentSectionVariantMode === 'shared' ? `${currentSectionMeta.label.toUpperCase()} · SAME VERSION` : `${currentSectionMeta.label.toUpperCase()} · PERSONALIZED VERSIONS`}</span>
              </div>
              <div style={{ color: 'var(--mm-text-muted)', fontSize: '13px', marginTop: '7px', lineHeight: 1.5 }}>
                {(() => { const dates = studentDueDateLines(assignment, lifecycle); return <>{dates.dueLabel}: {dates.dueText}<br />{dates.finalLabel}: {dates.finalText}</>; })()}
              </div>
              {!preview && user?.role === 'student' && (
                <StudentSupportTools
                  profile={user.profile}
                  onResourceOpened={(supportId) => recordStudentSupportEvidence({ supportId, eventType: 'used', activityRole: runtimeActivityRole })}
                />
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
              <div style={{ textAlign: 'right', minWidth: 190 }}>
                <div style={{ fontSize: '12px', color: 'var(--mm-text-muted)', textTransform: 'uppercase', fontWeight: 900 }}>
                  {preview
                    ? 'Preview progress'
                    : lifecycle.isPracticeOnly
                      ? 'Frozen recorded grade'
                      : lifecycle.isLate
                        ? 'Current late grade · if stopped now'
                        : 'Current grade · if stopped now'}
                </div>
                <div style={{ fontSize: '22px', fontWeight: 900, color: assignmentFeedbackHeld ? 'var(--mm-primary-text)' : recordedGrade >= 70 ? 'var(--mm-success)' : 'var(--mm-text-strong)' }}>
                  {preview ? `${progress.correct}/${progress.total}` : assignmentFeedbackHeld ? 'Awaiting teacher release' : `${recordedGrade}%`}
                </div>
                {!preview && !assignmentFeedbackHeld && classroomReceipt && classroomReceiptGrade != null && (
                  <div style={{ marginTop: 5, fontSize: 11, lineHeight: 1.35, color: classroomReceiptFinal ? 'var(--mm-success-text)' : 'var(--mm-primary-text)', fontWeight: 800 }}>
                    {classroomReceiptStudentVisible ? 'Google Classroom shows' : 'Classroom teacher draft'} {classroomReceiptGrade}% · {classroomReceiptFinal ? 'FINAL' : classroomReceiptStage === 'due-checkpoint' ? 'DUE-DATE CHECKPOINT' : classroomReceiptStudentVisible ? 'RELEASED UPDATE' : 'PROGRESS'}
                    {!classroomReceiptFinal && !classroomReceiptCurrent ? <><br />Next checkpoint will send your newer MathMaster grade.</> : null}
                    {!classroomReceiptStudentVisible ? <><br />Your live grade is shown here; this Classroom checkpoint is not released to students yet.</> : null}
                  </div>
                )}
              </div>
              {!preview && assignmentHasClasswork && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: 'var(--mm-text-muted)', textTransform: 'uppercase', fontWeight: 900 }}>Daily classwork</div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: classworkGradesByAssignment?.[assignment.id]?.score === 100 ? 'var(--mm-success)' : 'var(--mm-warning-text)' }}>{classworkGradesByAssignment?.[assignment.id]?.score === 100 ? '100 — prerequisite met' : 'In progress'}</div>
                </div>
              )}
            </div>
          </header>

          <nav ref={stickyHeightRef(ASSIGNMENT_NAV_HEIGHT_VAR)} className={`mathmaster-assignment-unified-nav${assignmentNavigationCollapsed ? ' is-collapsed' : ''}`} aria-label="Assignment navigation">
            <div className="mathmaster-assignment-unified-top">
              <button type="button" className="mathmaster-unified-nav-back" onClick={leaveAssignment} aria-label={preview ? 'Back to instructor dashboard' : returnsToAssignmentResult ? 'Back to results' : 'Back to dashboard'}>←</button>
              {!assignmentNavigationCollapsed ? (
                <div className="mathmaster-section-tabs" role="list" aria-label="Assignment sections">
                  {navigationSections.map((section) => {
                    const meta = activitySectionMeta[section.role] || { label: section.role, background: 'var(--mm-surface-control)', color: 'var(--mm-text)', border: 'var(--mm-border-strong)' };
                    const completedQuestions = section.entries.filter((entry) => sectionQuestionIsComplete(entry.index)).length;
                    const targetEntry = sectionNavigationTarget(section);
                    const sectionAvailable = Boolean(targetEntry);
                    const active = currentNavigationSection?.role === section.role;
                    return (
                      <button
                        type="button"
                        role="listitem"
                        key={`section-tab-${section.role}-${section.entries[0]?.index}`}
                        className={`mathmaster-section-tab${active ? ' is-active' : ''}${section.allCorrect ? ' is-complete' : ''}${sectionAvailable ? '' : ' is-locked'}`}
                        style={{ '--section-color': meta.color, '--section-border': meta.border, '--section-bg': meta.background }}
                        onClick={() => targetEntry && changeQuestion(targetEntry.index)}
                        disabled={!sectionAvailable}
                        aria-current={active ? 'page' : undefined}
                        title={sectionAvailable
                          ? `${compactSectionLabel(section)}: ${completedQuestions} of ${section.entries.length} complete. Open the next question that still needs a correct answer.`
                          : `${compactSectionLabel(section)} is not available yet.`}
                      >
                        {section.allCorrect && <span className="mathmaster-section-complete-medallion" aria-hidden="true">✓</span>}
                        <span className="mathmaster-section-tab-copy">
                          <span className="mathmaster-section-tab-label">{compactSectionLabel(section)}</span>
                          <small>{sectionAvailable ? (section.allCorrect ? 'Complete' : `${completedQuestions}/${section.entries.length}`) : '🔒 Locked'}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div className="mathmaster-collapsed-current-location" role="status">
                    <strong>{currentSectionMeta.label}</strong>
                    <span>Question {currentSectionQuestionNumber} of {currentSectionQuestionCount}</span>
                  </div>
                  <div className="mathmaster-unified-question-controls mathmaster-focus-inline-controls">
                    <button type="button" onClick={() => previousQuestionEntry && changeQuestion(previousQuestionEntry.index)} disabled={!previousQuestionEntry} aria-label="Previous question">‹ <span>Previous</span></button>
                    <select
                      aria-label="Choose a question"
                      value={currentQuestionIndex}
                      onChange={(event) => changeQuestion(Number(event.target.value))}
                    >
                      {visibleQuestionEntries.map((entry) => {
                        const meta = activitySectionMeta[entry.role] || { label: entry.role };
                        return <option key={entry.index} value={entry.index} disabled={!entryIsAvailable(entry)}>{meta.label} Q{entry.sectionPosition + 1}{entryIsAvailable(entry) ? '' : ' · locked'}</option>;
                      })}
                    </select>
                    <button type="button" className="mathmaster-unified-next" onClick={() => nextQuestionEntry && changeQuestion(nextQuestionEntry.index)} disabled={!nextQuestionEntry} aria-label="Next question"><span>Next</span> ›</button>
                  </div>
                </>
              )}
              {!assignmentNavigationCollapsed && (
                <button
                  type="button"
                  className="mathmaster-overview-button"
                  onClick={() => setAssignmentOverviewExpanded((current) => !current)}
                  aria-expanded={assignmentOverviewExpanded}
                >
                  <span className="mathmaster-overview-button-label">Overview</span> {assignmentOverviewExpanded ? '▴' : '▾'}
                </button>
              )}
              <button
                type="button"
                className="mathmaster-focus-view-button"
                onClick={() => {
                  setAssignmentNavigationCollapsed((current) => !current);
                  if (!assignmentNavigationCollapsed) setAssignmentOverviewExpanded(false);
                }}
                aria-expanded={!assignmentNavigationCollapsed}
                title={assignmentNavigationCollapsed ? 'Show section progress and question numbers' : 'Hide extra navigation to make more room for the problem'}
              >
                {assignmentNavigationCollapsed ? 'Show progress' : 'Focus view'}
              </button>
            </div>

            {!assignmentNavigationCollapsed && (
            <div className="mathmaster-assignment-unified-bottom">
              <div className={`mathmaster-current-section-inline${currentNavigationSection?.allCorrect ? ' is-complete' : ''}`}>
                <div className="mathmaster-current-section-summary">
                  <strong>{currentSectionMeta.label}</strong>
                  <span>
                    {currentNavigationSection?.complete
                      ? '✓ Section complete'
                      : `${currentSectionCompletedCount} of ${currentSectionQuestionCount} complete · ${currentSectionRemainingCount} remaining`}
                  </span>
                  <small>Question {currentSectionQuestionNumber} of {currentSectionQuestionCount} · {lifecycleBadge.label}</small>
                  <small style={{ marginTop: 2, fontWeight: 900, color: currentSectionMeta.color }}>
                    {preview
                      ? `${currentSectionMeta.label} section score ${currentSectionGrade?.score ?? 0}% · ${currentSectionGrade?.attempted ?? 0}/${currentSectionGrade?.total ?? 0} answered`
                      : assignmentFeedbackHeld
                        ? `${currentSectionMeta.label} section score available after teacher release`
                        : lifecycle.isPracticeOnly
                          ? `${currentSectionMeta.label} section score ${currentSectionOfficialGrade?.score ?? 0}% · official grade frozen · practice score ${currentSectionGrade?.score ?? 0}%`
                          : `${currentSectionMeta.label} section score ${currentSectionGrade?.score ?? 0}% · ${currentSectionGrade?.attempted ?? 0}/${currentSectionGrade?.total ?? 0} answered`}
                  </small>
                  <small style={{ marginTop: 2, fontWeight: 850, color: assignmentFeedbackHeld ? 'var(--mm-primary-text)' : 'var(--mm-text)' }}>
                    {preview
                      ? `Preview progress · ${progress.correct}/${progress.total} correct`
                      : assignmentFeedbackHeld
                        ? 'Score available after teacher release'
                        : lifecycle.isPracticeOnly
                          ? `Recorded grade ${recordedGrade}% · frozen`
                          : `Current grade ${recordedGrade}% if submitted now`}
                    {!preview && !assignmentFeedbackHeld && gradeSplit.attempted > 0
                      ? ` · ${gradeSplit.attempted}/${gradeSplit.total} answered · ${gradeSplit.creditOnAttempted}% on attempted work`
                      : ''}
                  </small>
                </div>
                <div className="mathmaster-question-number-strip" aria-label={`${currentSectionMeta.label} questions`}>
                  {(currentNavigationSection?.entries || []).map((entry) => {
                    const record = normalizeQuestionRecord(workingTracker?.[entry.index]);
                    const correct = record.status === 'correct';
                    const attempted = record.totalAttempts > 0 && !correct;
                    const current = entry.index === currentQuestionIndex;
                    const available = entryIsAvailable(entry);
                    const status = correct ? 'correct' : attempted ? 'needs another try' : 'not attempted';
                    return (
                      <button
                        type="button"
                        key={`section-question-${entry.index}`}
                        className={`mathmaster-question-number${current ? ' is-current' : ''}${correct ? ' is-correct' : ''}${attempted ? ' is-attempted' : ''}${available ? '' : ' is-locked'}`}
                        style={{ '--section-color': currentSectionMeta.color, '--section-border': currentSectionMeta.border, '--section-bg': currentSectionMeta.background }}
                        onClick={() => available && changeQuestion(entry.index)}
                        disabled={!available}
                        aria-current={current ? 'step' : undefined}
                        aria-label={`${currentSectionMeta.label} question ${entry.sectionPosition + 1}: ${available ? status : 'locked'}${current ? ', current question' : ''}`}
                        title={`${currentSectionMeta.label} Question ${entry.sectionPosition + 1} · ${available ? status : 'locked'}`}
                      >
                        {entry.sectionPosition + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mathmaster-unified-question-controls">
                <button type="button" onClick={() => previousQuestionEntry && changeQuestion(previousQuestionEntry.index)} disabled={!previousQuestionEntry} aria-label="Previous question">‹ <span>Previous</span></button>
                <select
                  aria-label="Choose a question"
                  value={currentQuestionIndex}
                  onChange={(event) => changeQuestion(Number(event.target.value))}
                >
                  {visibleQuestionEntries.map((entry) => {
                    const meta = activitySectionMeta[entry.role] || { label: entry.role };
                    return <option key={entry.index} value={entry.index} disabled={!entryIsAvailable(entry)}>{meta.label} Q{entry.sectionPosition + 1}{entryIsAvailable(entry) ? '' : ' · locked'}</option>;
                  })}
                </select>
                <button type="button" className="mathmaster-unified-next" onClick={() => nextQuestionEntry && changeQuestion(nextQuestionEntry.index)} disabled={!nextQuestionEntry} aria-label="Next question"><span>Next</span> ›</button>
              </div>
            </div>
            )}
            {!assignmentNavigationCollapsed && !preview && user?.role === 'student' && (
              <StudentSupportTools
                className="mathmaster-narrow-support-tools"
                profile={user.profile}
                onResourceOpened={(supportId) => recordStudentSupportEvidence({ supportId, eventType: 'used', activityRole: runtimeActivityRole })}
              />
            )}
            {!preview && dolState.status === 'active' && (
              <div className="mathmaster-unified-nav-alert">DOL open{supportPresentation.hideCountdowns ? '' : ` · ${formatRemainingTime(dolState.millisecondsRemaining)}`}</div>
            )}
          </nav>

          {assignmentOverviewExpanded && (
          <div className="mathmaster-question-navigation" style={{ display: 'grid', gap: '14px', marginBottom: '24px' }}>
            {navigationSections.map((section) => {
              const sectionMeta = activitySectionMeta[section.role] || { label: section.role, background: 'var(--mm-surface-control)', color: 'var(--mm-text)', border: 'var(--mm-border-strong)' };
              return (
                <section key={`${section.role}-${section.entries[0]?.index}`} aria-label={`${sectionMeta.label} questions`} style={{ padding: '13px', borderRadius: '12px', border: `2px solid ${section.complete ? '#188038' : sectionMeta.border}`, background: sectionMeta.background, boxShadow: section.complete ? '0 0 0 3px rgba(24,128,56,0.12)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', color: sectionMeta.color, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '15px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{sectionMeta.label}</strong>
                    {section.complete ? (
                      <span aria-label={`${sectionMeta.label} section complete`} style={{ padding: '7px 11px', borderRadius: 999, background: '#188038', color: '#fff', fontSize: '12px', fontWeight: 950, letterSpacing: '0.02em', boxShadow: '0 2px 6px rgba(24,128,56,0.28)' }}>✓ {sectionMeta.label.toUpperCase()} COMPLETE</span>
                    ) : (
                      <span style={{ fontSize: '12px', fontWeight: 800 }}>{section.entries.length} question{section.entries.length === 1 ? '' : 's'}</span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 145px), 1fr))', gap: '10px' }}>
                    {section.entries.map(({ index, sectionPosition, role: cardRole, isTimedDOLQuestion }) => {
                      const record = normalizeQuestionRecord(workingTracker?.[index]);
                      const cardAssessment = questionAssessmentFramework(questions[index] || {});
                      const cardAssessmentLabel = cardAssessment.examStyle && cardAssessment.framework
                        ? `${FRAMEWORK_LABELS[cardAssessment.framework] || cardAssessment.framework} practice`
                        : '';
                      const cardPolicy = getEffectiveActivityPolicy(cardRole);
                      const cardFeedbackHeld = !preview && !lifecycle.isPracticeOnly && cardPolicy.feedback === 'teacherRelease' && !assignmentFeedbackWasReleased(assignment);
                      const cardMaximumAttempts = resolveQuestionMaximumAttempts({
                        question: questions[index],
                        maximumAttempts: cardPolicy.attempts,
                        activityPolicy: cardPolicy,
                        teacherGrantedExtraAttempts: resolveTeacherGrantedExtraAttempts({
                          assignment,
                          activityRole: cardRole,
                          classId: user?.classId || null,
                          studentId: user?.role === 'student' ? user.id : null,
                        }),
                      });
                      const storedCardState = getQuestionCardState(workingTracker?.[index], cardMaximumAttempts);
                      const cardState = cardFeedbackHeld && ['correct', 'expired'].includes(record.status)
                        ? { background: 'var(--mm-primary-subtle)', color: 'var(--mm-primary-text)', label: 'Submitted · feedback held' }
                        : storedCardState;
                      const dolUnavailable = isTimedDOLQuestion && !preview && !lifecycle.isClosed && !['active', 'ended'].includes(dolState.status);
                      const warmupUnavailable = cardRole === 'warmup' && warmupState.enabled && !preview && !lifecycle.isPracticeOnly && !warmupCanBeViewed;
                      const manualSectionState = getSectionAccessState({ assignment, activityRole: cardRole, classId: user?.classId || null, classPeriod: user?.classPeriod, nowValue: now, studentId: !preview && user?.role === 'student' ? user.id : undefined });
                      const manualSectionUnavailable = !preview && !lifecycle.isPracticeOnly && manualSectionState.enabled && !manualSectionState.isOpen;
                      const sectionUnavailable = dolUnavailable || warmupUnavailable || manualSectionUnavailable;
                      const lockedLabel = warmupUnavailable
                        ? (warmupState.status === 'waiting' ? `Opens ${warmupState.minutesBeforeStart} min before class` : 'Warm-Up is not open today')
                        : manualSectionUnavailable
                          ? (manualSectionState.status === 'scheduled' ? 'Opens with assignment' : 'Waiting for teacher to open')
                          : 'Locked until DOL window';
                      return (
                        <button
                          type="button"
                          key={index}
                          onClick={() => !sectionUnavailable && changeQuestion(index)}
                          disabled={sectionUnavailable}
                          style={{
                            padding: '14px',
                            cursor: sectionUnavailable ? 'not-allowed' : 'pointer',
                            backgroundColor: sectionUnavailable ? 'var(--mm-surface-control)' : cardState.background,
                            color: sectionUnavailable ? 'var(--mm-text-subtle)' : cardState.color,
                            border: currentQuestionIndex === index ? `3px solid ${sectionMeta.border}` : '1px solid var(--mm-border)',
                            borderRadius: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            boxShadow: currentQuestionIndex === index ? '0 4px 12px rgba(26,115,232,0.2)' : 'none',
                            opacity: sectionUnavailable ? 0.7 : 1,
                          }}
                        >
                          <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Question {sectionPosition + 1}</div>
                          <div style={{ marginTop: '5px', padding: '3px 7px', borderRadius: '999px', background: sectionMeta.background, color: sectionMeta.color, border: `1px solid ${sectionMeta.border}`, fontSize: '10px', fontWeight: 900 }}>{sectionMeta.label}</div>
                          {cardAssessmentLabel && <div aria-label={`${cardAssessmentLabel} question`} style={{ marginTop: '5px', padding: '3px 7px', borderRadius: 999, background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)', border: '1px solid var(--mm-accent-border)', fontSize: '10px', fontWeight: 950 }}>{cardAssessmentLabel}</div>}
                          <div style={{ fontSize: '12px', marginTop: '7px', fontWeight: 'bold' }}>{sectionUnavailable ? lockedLabel : cardState.label}</div>
                          {record.totalAttempts > 0 && <div style={{ fontSize: '11px', marginTop: '3px', opacity: 0.85 }}>{record.totalAttempts} total attempt{record.totalAttempts === 1 ? '' : 's'}</div>}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          )}
          <main ref={assignmentQuestionStageRef} className="mathmaster-question-stage" style={{ background: 'var(--mm-surface)', borderRadius: '12px', padding: '10px', minHeight: '500px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            {questions[currentQuestionIndex]?.instructionalPhase
              && (preview || assignment.showInstructionalPhaseLabelsToStudents === true)
              && <div aria-label="Instructional phase" style={{ display: 'inline-block', margin: '6px 8px', padding: '5px 10px', borderRadius: 999, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', fontWeight: 950, letterSpacing: '0.08em' }}>{({ iDo: 'I DO', weDo: 'WE DO', youDo: 'YOU DO' })[questions[currentQuestionIndex].instructionalPhase]}</div>}
            <QuestionEngine
              key={`${activeAssignmentId}-${currentQuestionIndex}-${currentRecord.variantIndex}-${preview ? `preview-${previewSessionId}` : lifecycle.status}-draft${workspaceDraftGeneration}`}
              draftRestore={draftRestoreFocus?.questionIndex === currentQuestionIndex ? draftRestoreFocus : null}
              question={questions[currentQuestionIndex]}
              questionRecord={workingTracker?.[currentQuestionIndex]}
              generationKey={`${activeAssignmentId}|${generationStudentKey}|${currentQuestionIndex}|variant:${currentRecord.variantIndex}`}
              familyContext={currentFamilyContext}
              onFamilyDelivery={preview ? null : handleFamilyDelivery}
              adaptation={currentAdaptation}
              onGrade={handleGradeSubmit}
              onResponseCheckpoint={preview ? null : handleResponseCheckpoint}
              onSpotlightFrame={preview ? null : publishSpotlightWork}
              onStepGrade={handleStepGrade}
              onRequestNewQuestion={handleRequestNewQuestion}
              onLoadScratchpad={handleLoadScratchpad}
              onSaveScratchpad={handleSaveScratchpad}
              studentProfile={preview ? null : adaptiveStudentProfile || user?.profile}
              guidedMode={['classwork', 'practice'].includes(runtimeActivityRole) && currentGuidedNotesMode !== 'off'}
              guidedNotesMode={currentGuidedNotesMode}
              assignmentLocked={!preview && ((currentIsDOL && dolState.status === 'ended') || (currentIsWarmup && warmupState.status !== 'active') || currentSectionManuallyLocked)}
              assignmentLockedMessage={!preview && currentIsDOL && dolState.status === 'ended'
                ? 'The DOL timer has ended. Your saved response is available for review, but no new submission is allowed.'
                : !preview && currentIsWarmup && warmupState.status === 'closed'
                  ? 'Your teacher closed the Warm-Up for this class. Your saved work is available for review, but no new submission is allowed.'
                  : !preview && currentIsWarmup && warmupState.status === 'ended'
                    ? 'This class period has ended. Your Warm-Up is available for review only.'
                    : !preview && currentIsWarmup && warmupState.status === 'waiting'
                      ? `The Warm-Up opens ${warmupState.minutesBeforeStart} minutes before your class begins.`
                      : !preview && currentIsWarmup
                        ? 'The Warm-Up is only available on its instructional day during your class window.'
                        : currentSectionManuallyLocked
                          ? `Your teacher has closed the ${currentManualSectionState.role === 'practice' ? 'Practice' : 'Classwork'} section for this class. Saved work remains visible, but new submissions are locked until the section is reopened.`
                          : ''}
              dolMode={!preview && currentIsDOL && dolState.status === 'active'}
              maximumAttempts={resolveQuestionMaximumAttempts({
                question: questions[currentQuestionIndex],
                maximumAttempts: runtimeQuestionActivityPolicy.attempts,
                activityPolicy: runtimeQuestionActivityPolicy,
              })}
              teacherGrantedExtraAttempts={resolveTeacherGrantedExtraAttempts({
                assignment,
                activityRole: runtimeActivityRole,
                classId: user?.classId || null,
                studentId: user?.role === 'student' ? user.id : null,
              })}
              activityRole={runtimeActivityRole}
              activityPolicy={runtimeQuestionActivityPolicy}
              feedbackReleased={currentFeedbackReleased}
              replacementWarning={replacementWarning}
              draftKey={buildQuestionDraftKey({ studentId: preview ? 'teacher-preview' : user?.id || 'anonymous', assignmentId: activeAssignmentId, questionIndex: currentQuestionIndex, variantIndex: currentRecord.variantIndex, sessionMode: draftSessionMode })}
              assignmentId={activeAssignmentId}
              executionScope={preview ? 'teacherPreview' : lifecycle.isPracticeOnly ? 'postDuePractice' : 'student'}
              onNextQuestion={nextQuestionEntry ? () => changeQuestion(nextQuestionEntry.index) : null}
              nextQuestionLabel={nextQuestionDestinationLabel}
              nextQuestionSectionLabel={nextQuestionSectionMeta?.label || ''}
              sectionComplete={Boolean(currentNavigationSection?.allCorrect)}
              sectionLabel={currentSectionMeta.label}
              sectionQuestionCount={currentSectionQuestionCount}
              onContinueSection={assignmentHandoff ? continueAfterSection : null}
              continueSectionLabel={assignmentHandoff?.label || ''}
              onSupportEvidence={preview || lifecycle.isPracticeOnly
                ? null
                : (evidence) => recordStudentSupportEvidence({ ...evidence, questionIndex: currentQuestionIndex, activityRole: runtimeActivityRole })}
            />
            {/* SAVE HEALTH, IN THE STUDENT'S WORDS.
                A STUDENT IS NEVER TOLD "SUBMITTED" BEFORE THE SERVER HAS IT.
                That sentence is the whole point of this line: during the
                September 14 incident the button said the work was in and the
                teacher's gradebook never received it. "Submitted to MathMaster"
                is now reachable only from a drain that left nothing owed, and
                every other state names where the work actually is and whether
                anything is still to come. */}
            {!preview && studentPersistenceStatus !== 'idle' && (
              <p role="status" aria-live="polite" style={{ margin: '8px 4px 0', color: 'var(--mm-text-muted)', fontSize: 12 }}>
                {studentPersistenceStatus === 'capturing'
                  ? 'Saving…'
                  : studentPersistenceStatus === 'queued' || studentPersistenceStatus === 'syncing'
                    ? `Syncing · ${studentOutboxDepth} change${studentOutboxDepth === 1 ? '' : 's'} saved on this device. You may keep working.`
                    : studentPersistenceStatus === 'offline'
                      ? `Waiting for connection · ${studentPendingGradeCount || studentOutboxDepth} item${(studentPendingGradeCount || studentOutboxDepth) === 1 ? '' : 's'} saved on this device.`
                      : studentPersistenceStatus === 'needs-review'
                        ? `Needs review · ${studentPendingGradeCount || studentOutboxDepth} saved item${(studentPendingGradeCount || studentOutboxDepth) === 1 ? '' : 's'} has not been recorded yet. You may keep working.`
                      : studentPersistenceStatus === 'submitted'
                        ? 'Recorded by MathMaster.'
                        : studentPersistenceStatus === 'durable'
                          ? 'Recorded by MathMaster.'
                          : studentPersistenceStatus === 'rejected'
                            ? 'This change was not accepted because the assignment is no longer available.'
                            : 'Saved on this device only. MathMaster will finish saving when you are back online.'}
              </p>
            )}
            {!preview && studentReportingError && (
              <p role="status" style={{ margin: '2px 4px 0', color: 'var(--mm-warning-text)', fontSize: 11 }}>
                Device reporting unavailable ({studentReportingError}); locally saved work is unchanged.
              </p>
            )}
            {!preview && ['warmup', 'dol'].includes(runtimeActivityRole) && (!currentCheckpointOutcome || currentSectionOpenNow) && (
              <p style={{ margin: '8px 4px 0', color: 'var(--mm-text-muted)', fontSize: 12 }}>Your latest completed response will be submitted automatically when time ends.</p>
            )}
            {/* AFTER THE CLOSE, SAY WHAT ACTUALLY HAPPENED.
                Never "submitted" for a response that was not complete — the
                status comes from the server's own finalization receipt. */}
            {!preview && currentCheckpointOutcome && !currentSectionOpenNow && (
              <p role="status" aria-live="polite" style={{ margin: '8px 4px 0', color: 'var(--mm-text-muted)', fontSize: 12 }}>
                {currentCheckpointOutcome === 'auto-submitted'
                  ? 'Time ended. Your latest completed response was submitted automatically.'
                  : currentCheckpointOutcome === 'explicitly-submitted'
                    ? 'Time ended. Your submitted work has been saved.'
                    : 'Time ended. No completed response was available to submit.'}
              </p>
            )}
          </main>
        </div>
      </div>
    );
  };

  // The read-only "What changed" list, on Home (compact) and Grades.
  const renderWhatChangedPanel = (compact) => (
    <WhatChangedList
      items={whatChangedItems}
      compact={compact}
      onOpenAssignment={(assignmentId) => openStudentAssignmentResult(assignmentId, { origin: compact ? 'assignments' : 'grades' })}
      onMarkSeen={() => { if (user?.id) markWhatChangedSeen(user.id, Date.now()); }}
    />
  );

  // This is the authenticated-student shell boundary. Keeping identity here,
  // outside every destination, makes it survive Focus View, compact/mobile
  // assignment controls, Live Challenge, and screens that omit global nav.
  const renderStudentIdentityShell = (content, { preview = false } = {}) => (
    <div data-authenticated-student-shell={preview ? 'teacher-preview' : 'student'} style={{ minHeight: '100vh' }}>
      <StudentIdentityBar
        preview={preview}
        student={preview ? null : { ...studentRecord, ...user }}
        classPointsBalance={preview || studentClassPoints.unavailable ? null : studentClassPoints.account.balance}
        onLogout={preview ? null : handleLogout}
        // Unsent work still queued: Log Out asks first (logoutGuard.js).
        logoutRisk={preview ? null : describeLogoutRisk({
          outboxDepth: studentOutboxDepth,
          pendingGradeCount: studentPendingGradeCount,
          needsReviewCount: studentNeedsReviewCount,
          persistenceStatus: studentPersistenceStatus,
        })}
      />
      {!preview && studentSpotlightRequest?.status === SPOTLIGHT_STATUS.REQUESTED && (
        <section role="dialog" aria-label="Student Spotlight request" style={{ margin: '12px auto', maxWidth: 760, padding: '16px 18px', borderRadius: 12, border: '2px solid #681da8', background: 'var(--mm-accent-subtle)', color: 'var(--mm-text)' }}>
          <strong style={{ display: 'block', fontSize: 18 }}>{studentSpotlightRequest.teacherLabel || 'Your teacher'} would like to show your current MathMaster work to the class.</strong>
          <div style={{ marginTop: 5, fontSize: 13 }}>Nothing is visible unless you choose Present Now. This does not share your Chromebook screen.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button type="button" onClick={() => respondToSpotlight(true)} style={{ padding: '9px 14px', border: 0, borderRadius: 8, background: '#681da8', color: '#fff', fontWeight: 900 }}>Present Now</button><button type="button" onClick={() => respondToSpotlight(false)} style={{ padding: '9px 14px', border: '1px solid #681da8', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-accent-text)', fontWeight: 900 }}>Not Now</button></div>
        </section>
      )}
      {!preview && studentSpotlightRequest?.status === SPOTLIGHT_STATUS.ACCEPTED && (
        <section role="status" style={{ margin: '10px auto', maxWidth: 760, padding: '10px 14px', borderRadius: 10, background: '#681da8', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><strong>Presenting to class</strong><button type="button" onClick={stopStudentSpotlight} style={{ padding: '7px 11px', border: '1px solid var(--mm-border-soft)', borderRadius: 7, background: 'var(--mm-surface)', color: 'var(--mm-accent-text)', fontWeight: 900 }}>Stop Presenting</button></section>
      )}
      {!preview && studentSpotlightMessage && <div role="status" style={{ margin: '8px auto', maxWidth: 760, padding: '8px 12px', color: 'var(--mm-text-muted)', fontSize: 12 }}>{studentSpotlightMessage}</div>}
      {content}
    </div>
  );

  // The screen belongs to the account signed in NOW. When auth has moved on —
  // signed out in another tab, the next student signing in on a shared
  // Chromebook, another account signed in over this one — not one more frame
  // of the previous account's screens renders while its state is torn down.
  const userIsSignedInAccount = Boolean(user && auth.status === 'ready' && auth.session?.uid && auth.session.uid === user.uid);
  if (!userIsSignedInAccount) {
    if (auth.status === 'signedOut' || auth.status === 'linking') return <LoginScreen launchAssignment={launchAssignment} />;
    if (sessionHydrationError) {
      return (
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: 'var(--mm-surface-sunken)' }}>
          <section style={{ width: 'min(560px, 100%)', padding: '24px', borderRadius: '12px', border: '1px solid var(--mm-error-border-soft)', background: 'var(--mm-surface)', textAlign: 'center' }}>
            <h1 style={{ marginTop: 0, color: 'var(--mm-error-text)' }}>MathMaster could not load your account</h1>
            <p style={{ color: 'var(--mm-text-muted)' }}>{sessionHydrationError}</p>
            <button type="button" onClick={() => auth.signOut()} style={{ padding: '10px 16px', border: 0, borderRadius: '7px', background: '#174ea6', color: '#fff', fontWeight: 900 }}>Return to sign in</button>
          </section>
        </main>
      );
    }
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--mm-primary-text)', background: 'var(--mm-surface-sunken)' }}>{sessionHydrating ? 'Loading your MathMaster workspace…' : 'Finishing sign in…'}</div>;
  }

  if (isTeacherPreview) {
    return renderStudentIdentityShell(renderAssignmentWorkspace(true), { preview: true });
  }

  if (user.role === 'teacher') {
    // This only controls discoverability. Privileged operations remain
    // callable-only and re-check the immutable root identity + claims on the
    // server. The email fallback prevents a stale token from hiding Admin Mode
    // from the one account that needs to fix/deploy it.
    const rootAdminUiEligible = user.isRootAdmin === true
      || isRootAdminEmail(user.email);
    const selectedAssignment = assignments.find((assignment) => assignment.id === gradebookFilter.assignmentId) || null;
    const gradebookRigor = rigorComparability({
      evidenceByStudentId: classEvidenceByStudentId,
      assignmentId: selectedAssignment?.id || null,
    });
    const selectedGradebookClass = classes.find((entry) => entry.classId === gradebookFilter.classId) || null;
    const selectedGradebookPeriod = selectedGradebookClass?.period || gradebookFilter.classPeriod || '';
    const selectedClassStudents = allStudents.filter((student) => (
      gradebookFilter.classId
        ? student.classId === gradebookFilter.classId || (!student.classId && selectedGradebookPeriod && student.classPeriod === selectedGradebookPeriod)
        : (student.classPeriod || 'Unassigned') === selectedGradebookPeriod
    )).sort(compareStudentsByName);
    const assignmentsForSelectedClass = assignments.filter((assignment) => !selectedGradebookPeriod || assignmentIsForStudent(assignment, { classId: gradebookFilter.classId || null, classPeriod: selectedGradebookPeriod }));
    // The class summary above the gradebook table, from the same canonical
    // grade projection the table rows use. It is also the table filter.
    const gradebookProgress = teacherTab === 'grades' && selectedAssignment
      ? classGradeProgress({ assignment: selectedAssignment, roster: selectedClassStudents, hasGradeRecords: teacherStudentDataMode === 'full', nameOf: (student) => formatStudentName(student), hasPracticePass: gradebookHasPracticePass })
      : null;
    const gradebookFilterIds = gradebookProgress && gradebookProgressFilter !== 'all'
      ? new Set(({ complete: gradebookProgress.complete, inProgress: gradebookProgress.inProgress, notStarted: gradebookProgress.notStarted, below: gradebookProgress.belowThreshold }[gradebookProgressFilter] || []).map((row) => row.id))
      : null;
    const gradebookVisibleStudents = gradebookFilterIds ? selectedClassStudents.filter((student) => gradebookFilterIds.has(student.id)) : selectedClassStudents;

    // The Assignments tab list, after the Library folder/smart-view filter and
    // the free-text search. Computed once so the header count, the
    // select-all-visible checkbox and the rendered cards can never disagree.
    const visibleAssignments = assignments.filter((assignment) => (
      // The Assignments tab is class-scoped whenever the class bar names a
      // specific class. Library-only/unassigned work must not leak into a class
      // view simply because its title or folder matches the search.
      (!activeClass.classId || assignmentIsForStudent(assignment, {
        classId: activeClass.classId,
        classPeriod: activeClass.classPeriod,
      }))
      && assignmentFolderMatches(assignment, libraryNavigation?.folder)
      && matchesSmartView(assignment, libraryNavigation?.smartView, { nowValue: now, classSchedule, classes })
      && titleOrFolderMatches(assignment, assignmentSearch)
    ));
    // A search or a Library filter narrows the list: it is shown flat, so a
    // match is never folded inside a closed marking-period group.
    const assignmentListIsFiltered = Boolean(assignmentSearch.trim() || libraryNavigation?.folder || libraryNavigation?.smartView);
    const visibleAssignmentIds = visibleAssignments.map((assignment) => assignment.id);
    const allVisibleSelected = visibleAssignmentIds.length > 0
      && visibleAssignmentIds.every((id) => selectedAssignmentIds.has(id));


    if (teacherWorkspaceMode === 'administration' && rootAdminUiEligible) {
      return (
        <div style={{ fontFamily: '"Segoe UI", sans-serif', backgroundColor: 'var(--mm-surface-control)', minHeight: '100vh', padding: '20px' }}>
          <div style={{ maxWidth: 1260, margin: '0 auto', background: 'var(--mm-surface)', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,.06)', overflow: 'hidden' }}>
            <header style={{ padding: '22px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderBottom: '1px solid var(--mm-border-soft)', background: '#202124', color: '#fff' }}>
              <div><div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.08em', color: '#c6dafc' }}>ROOT ADMINISTRATOR</div><h1 style={{ margin: '4px 0 0', fontSize: 25, color: 'inherit' }}>MathMaster Administration</h1><p style={{ margin: '4px 0 0', color: '#dadce0', fontSize: 13 }}>{user.email}</p></div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><div role="group" aria-label="Root administrator workspace" style={{ display: 'inline-flex', padding: 3, borderRadius: 9, background: '#3c4043', border: '1px solid #5f6368' }}><button type="button" aria-pressed="false" onClick={() => setTeacherWorkspaceMode('teacher')} style={{ padding: '6px 10px', border: 0, borderRadius: 6, background: 'transparent', color: '#e8eaed', fontWeight: 900 }}>Teacher View</button><button type="button" aria-pressed="true" style={{ padding: '6px 10px', border: 0, borderRadius: 6, background: 'var(--mm-surface)', color: 'var(--mm-text-strong)', fontWeight: 900 }}>Administration</button></div><button type="button" onClick={() => { setTeacherWorkspaceMode('teacher'); setTeacherTab('demo'); }} style={{ padding: '9px 13px', border: '1px solid var(--mm-accent-border)', borderRadius: 8, background: 'var(--mm-accent-subtle)', color: 'var(--mm-accent-text)', fontWeight: 900 }}>Open Demo Experience</button><button onClick={handleLogout} style={{ padding: '9px 13px', background: 'transparent', color: '#f28b82', border: '1px solid var(--mm-error-border-soft)', borderRadius: 8, fontWeight: 900 }}>Log Out</button></div>
            </header>
            <div role="tablist" aria-label="Administration sections" style={{ display: 'flex', gap: 8, padding: '14px 28px 0', flexWrap: 'wrap' }}>
              {[['classes', 'Classes & rosters'], ['accounts', 'Accounts & sign-in'], ['coverage', 'Path content coverage'], ['ai', 'Assignment AI health'], ['reset', 'Pre-production reset']].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={adminTab === id}
                  onClick={() => setAdminTab(id)}
                  style={{ minHeight: 40, padding: '8px 16px', borderRadius: '9px 9px 0 0', cursor: 'pointer', border: '1px solid var(--mm-border)', borderBottom: 0, background: adminTab === id ? 'var(--mm-surface)' : 'var(--mm-surface-control)', color: adminTab === id ? 'var(--mm-primary-text)' : 'var(--mm-text)', fontWeight: 900, fontSize: 14 }}
                >
                  {label}
                </button>
              ))}
            </div>
            <main style={{ padding: 28 }}>
              {adminTab === 'classes' && <ClassesAdmin />}
              {adminTab === 'accounts' && <SignInAccess signedInEmail={user.email} mode="admin" onStudentIdentityChanged={refreshTeacherRosterAfterNameChange} />}
              {adminTab === 'coverage' && <PathCoverageAudit />}
              {adminTab === 'ai' && <AssignmentAiHealth />}
              {adminTab === 'reset' && (
                <PreproductionReset
                  onResetComplete={async () => {
                    setAssignments([]);
                    setAllStudents([]);
                    setPresenceById({});
                    setStudentSupportEvents([]);
                    setStudentSessionSummaries([]);
                    setAssignmentActivity({});
                    setDolGradesByAssignment({});
                    setClassworkGradesByAssignment({});
                    setSupportUsageByAssignment({});
                    setWeeklyPathCompletionsByStudent({});
                    setWeeklyPathGoalSnapshotsByStudent({});
                    setClassEvidenceByStudentId({});
                    await Promise.all([
                      fetchAssignments(),
                      fetchTeacherRosterSummaries(),
                    ]);
                  }}
                />
              )}
            </main>
          </div>
        </div>
      );
    }

    return (
      <div style={{ fontFamily: '"Segoe UI", sans-serif', backgroundColor: 'var(--mm-surface-sunken)', minHeight: '100vh', padding: '20px' }}>
        {renderDeleteAssignmentDialog()}
        {testCyclePreviewAssignment && (
          <Suspense fallback={<p role="status" style={{ position: 'fixed', top: 12, left: 12, zIndex: 11000 }}>Opening the student preview…</p>}>
            <TestCyclePreview
              assignment={testCyclePreviewAssignment}
              onClose={() => setTestCyclePreviewAssignment(null)}
              // Review is ordinary content: play it in the existing in-memory
              // teacher preview, which writes nothing either.
              onPreviewReview={(assignment) => {
                setTestCyclePreviewAssignment(null);
                startTeacherPreview(assignment.id, { lessonRuntime: true });
              }}
            />
          </Suspense>
        )}
        {renderExportJsonDialog()}
        {renderTeacherScratchpadDialog()}
        {teacherWorksheetDialog && (() => {
          const assignment = assignments.find((item) => item.id === teacherWorksheetDialog.assignmentId) || null;
          if (!assignment) return null;
          const students = teacherWorksheetStudentsFor(assignment);
          return (
            <TeacherAssignmentPdfDialog
              key={assignment.id}
              assignment={assignment}
              students={students}
              requiresStudent={teacherWorksheetDialog.requiresStudent === true}
              busy={teacherWorksheetBusy}
              onCancel={() => { if (!teacherWorksheetBusy) setTeacherWorksheetDialog(null); }}
              onExport={(student, outputMode) => exportTeacherAssignmentWorksheetPdf(assignment, student, outputMode)}
            />
          );
        })()}
        {assignmentPreflight && (
          <LessonPreflightModal
            key={`${assignmentPreflight.assignmentV5.assignment?.title || 'assignment-v5'}-${assignmentPreflight.sourceLabel}`}
            assignmentV5={assignmentPreflight.assignmentV5}
            initialDraft={assignmentPreflight.initialDraft}
            classPeriods={CLASS_PERIODS}
            classes={classes}
            courseProfiles={courseProfiles}
            sourceLabel={assignmentPreflight.sourceLabel}
            sourceQuestions={assignmentPreflight.questions}
            authoringWarnings={assignmentPreflight.authoringWarnings}
            onClose={() => setAssignmentPreflight(null)}
            onConfirmPublish={confirmAssignmentPreflight}
            busy={assignmentPreflightBusy}
            reviewMode={assignmentPreflight.mode || 'create'}
            allowQuestionRepair={assignmentPreflight.allowQuestionRepair !== false}
            rosterSizesByClassId={preflightRosterSizesByClassId}
            // Offers the in-place import of a Test Cycle's missing secure
            // families; seedPathQuestionBank re-checks the root identity.
            canManageSecureBank={rootAdminUiEligible}
          />
        )}
        {contentUpgradeRequest && (
          <AssignmentContentUpgradeModal
            assignment={contentUpgradeRequest.assignment}
            targetAssignment={contentUpgradeRequest.targetAssignment}
            onClose={() => setContentUpgradeRequest(null)}
            onUpgraded={async (result) => {
              const refreshResults = await Promise.allSettled([fetchAssignments(), fetchTeacherRosterSummaries()]);
              const refreshFailed = refreshResults.some((entry) => entry.status === 'rejected');
              toastSuccess(
                result?.alreadyUpgraded
                  ? `Content V${result.contentVersion} already saved`
                  : `Upgraded to Content V${result.contentVersion}`,
                refreshFailed
                  ? 'The assignment save succeeded. One dashboard panel did not refresh yet; press Done, then refresh the page.'
                  : 'Student work and Google Classroom links were preserved.',
              );
            }}
          />
        )}
        {questionEditorAssignment && (
          <AssignmentQuestionEditor
            assignment={questionEditorAssignment}
            hasLiveProtection={
              !isLibraryAssignment(questionEditorAssignment)
              || allStudents.some((student) => student.gradesByAssignment?.[questionEditorAssignment.id] !== undefined)
            }
            fullAuditAuthorized={rootAdminUiEligible || user.assignmentRepairer === true}
            studentActivityStatus={allStudents.some((student) => student.gradesByAssignment?.[questionEditorAssignment.id] !== undefined) ? 'present' : 'unavailable'}
            onSave={saveQuestionEditor}
            onClose={() => setQuestionEditorAssignment(null)}
          />
        )}
        {/*
          ONE drawer for the whole teacher workspace. Every student name on
          every screen opens this same component with the same profile, so the
          answer a teacher gets never depends on which name they clicked.
        */}
        <TeacherQuickSearch
          open={quickSearchOpen}
          // Raw roster records: teacherSearch formats names itself (structured,
          // Google and legacy names) and searches ids. Copying a formatted name
          // into displayName here rebuilt every record on every render and made
          // a nameless student match a search for "unavailable".
          students={allStudents}
          classes={classes}
          assignments={assignments}
          standards={searchableStandards}
          onClose={() => setQuickSearchOpen(false)}
          onSelect={(result) => {
            if (result.kind === 'student') { setProfileDrawerStudentId(result.payload.studentId); return; }
            if (result.kind === 'class') {
              setActiveClass({ classId: result.payload.classId, classPeriod: result.payload.classPeriod });
              setTeacherTab('classesWorkspace');
              return;
            }
            if (result.kind === 'assignment') {
              // An assignment result opens the assignment itself — its grades,
              // live room, controls and export are all one click from there.
              // (It used to jump to Grades without switching class, landing on
              // an empty "Select assignment" whenever the class differed.)
              openAssignmentHub(result.payload.assignmentId, result.payload.classId || null);
              return;
            }
            if (result.kind === 'standard') setTeacherTab('standards');
          }}
        />

        <ClassroomSyncReview
          proposal={classroomSyncProposal}
          students={allStudents}
          onClose={() => setClassroomSyncProposal(null)}
        />

        <AssignmentHub
          open={Boolean(assignmentHubTarget)}
          onClassChange={reportHubClass}
          assignment={assignmentHubTarget ? assignments.find((entry) => entry.id === assignmentHubTarget.assignmentId) || null : null}
          initialClassId={assignmentHubTarget?.classId || null}
          classes={classes}
          students={allStudents}
          presenceById={presenceById}
          classSchedule={classSchedule}
          nowValue={now}
          gradingPeriodSettings={gradingPeriodSettings}
          hasGradeRecords={teacherStudentDataMode === 'full'}
          onLoadClassGrades={loadClassGradeRecords}
          handlers={{
            onToggleWarmup: handleToggleWarmupForClass,
            onToggleSectionAccess: handleToggleSectionAccessForClass,
            onUnlockDOL: handleUnlockDOLForClass,
            onGrantDOLAttempt: handleGrantDOLAttemptForClass,
            onDolControl: handleDolControlForClass,
          }}
          busy={{ warmup: warmupControlBusyKey, section: sectionAccessBusyKey, dolUnlock: dolUnlockBusyKey, dolGrant: dolAttemptGrantBusyKey, dolControl: dolControlBusyKey }}
          onClose={() => setAssignmentHubTarget(null)}
          onOpenGrades={(classId, assignmentId) => openGradebookFor(classId, assignmentId)}
          onOpenStudentWork={(classId, assignmentId, studentId) => openGradebookFor(classId, assignmentId, studentId)}
          onOpenLive={(classContext, assignmentId) => openLiveFor(classContext, assignmentId)}
          onOpenExport={(scope) => openGradeExport(scope)}
          onOpenStudent={(studentId) => { setProfileDrawerStudentId(studentId); }}
          onOpenClass={(classContext) => { setAssignmentHubTarget(null); handleGoToClassFromHome(classContext); }}
          onPreview={(assignment) => { setAssignmentHubTarget(null); startTeacherPreview(assignment.id); }}
          onOpenTestCycleResults={(assignment) => { setAssignmentHubTarget(null); setFocusedTestCycleAssignmentId(assignment.id); setTeacherTab('exams'); }}
          onPrint={(assignment) => { setAssignmentHubTarget(null); beginTeacherWorksheetExport(assignment); }}
          onEditDates={(assignment) => { setAssignmentHubTarget(null); setTeacherTab('assignments'); beginEditAssignmentDates(assignment); }}
          onEditSetup={(assignment) => { setAssignmentHubTarget(null); beginEditAssignmentSetup(assignment); }}
          onEditQuestions={(assignment) => { setAssignmentHubTarget(null); openQuestionEditor(assignment); }}
          teacherEmail={user?.email || ''}
        />

        {/* After the hub, so a student opened from an assignment's hub stacks
            ON TOP of it (closing the student returns to the assignment). */}
        <StudentProfileDrawer
          open={Boolean(profileDrawerStudent)}
          studentId={profileDrawerStudent?.id || null}
          studentName={profileDrawerStudent ? formatStudentName(profileDrawerStudent) : ''}
          profile={profileDrawerLearningProfile}
          plan={profileDrawerPlan}
          classRecord={profileDrawerStudent ? classesById[profileDrawerStudent.classId] || null : null}
          courseContext={profileDrawerStudent
            ? resolveStudentCourseContext({ student: profileDrawerStudent, classesById, courseProfiles })
            : null}
          supportEvents={profileDrawerStudent ? profileDrawerSupportEvents : []}
          sessionSummaries={profileDrawerStudent ? profileDrawerSessionSummaries : []}
          onClose={() => setProfileDrawerStudentId(null)}
          onOpenFullRecord={(studentId) => {
            setProfileDrawerStudentId(null);
            setTeacherTab('students');
            setPathLaunchTeks(null);
            setGradebookFilter((current) => ({ ...current, student: studentId }));
          }}
          onOpenGradebook={(studentId) => {
            const student = allStudents.find((entry) => entry.id === studentId) || null;
            setProfileDrawerStudentId(null);
            if (student) handleViewClassGradebook(student.classId || student.classPeriod || '', student);
          }}
          studentRecord={profileDrawerStudent}
          assignments={profileDrawerStudent
            ? assignments.filter((assignment) => assignmentIsForStudent(assignment, { classId: profileDrawerStudent.classId || null, classPeriod: profileDrawerStudent.classPeriod || null }))
            : []}
          gradingPeriodSettings={gradingPeriodSettings}
          onOpenAssignment={(assignmentId, classId) => { setProfileDrawerStudentId(null); openAssignmentHub(assignmentId, classId); }}
          onOpenStudentWork={(classId, assignmentId, studentId) => { setProfileDrawerStudentId(null); openGradebookFor(classId, assignmentId, studentId); }}
          teacherEmail={user?.role === 'teacher' ? user.email || '' : ''}
          studentSupportProfile={profileDrawerStudent?.profile || null}
          onSupportProfileSaved={handleSupportProfileSaved}
          onOpenSupportReport={(studentId) => setSupportReportStudentId(studentId)}
          onOpenCaseReview={user?.role === 'teacher' ? (studentId) => setCaseReviewStudentId(studentId) : null}
        />

        {/* Above the drawer it was opened from (closing it returns to the
            student) and below the Support Evidence Report, which it can open. */}
        {(() => {
          const caseStudent = caseReviewStudentId
            ? allStudents.find((entry) => entry.id === caseReviewStudentId) || null
            : null;
          if (!caseStudent) return null;
          return (
            <Suspense fallback={null}>
              <StudentCaseReviewView
                open
                student={caseStudent}
                studentName={formatStudentName(caseStudent)}
                classRecord={classesById[caseStudent.classId] || null}
                assignments={assignments}
                gradingPeriodSettings={gradingPeriodSettings}
                teacherEmail={user?.email || ''}
                teacherUid={user?.uid || ''}
                onClose={() => setCaseReviewStudentId(null)}
                onInspectResponse={(target) => setResponseInspectorTarget(target)}
                onOpenSupportReport={(studentId) => setSupportReportStudentId(studentId)}
              />
            </Suspense>
          );
        })()}

        {(() => {
          const reportStudent = supportReportStudentId
            ? allStudents.find((entry) => entry.id === supportReportStudentId) || null
            : null;
          return (
            <SupportEvidenceReportView
              open={Boolean(reportStudent)}
              student={reportStudent}
              studentName={reportStudent ? formatStudentName(reportStudent) : ''}
              classRecord={reportStudent ? classesById[reportStudent.classId] || null : null}
              assignments={assignments}
              gradingPeriodSettings={gradingPeriodSettings}
              teacherEmail={user?.email || ''}
              onClose={() => setSupportReportStudentId(null)}
            />
          );
        })()}

        <div className="mm-dashboard-shell" style={{ maxWidth: '1360px', margin: '0 auto', background: 'var(--mm-surface)', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'stretch' }}>
          <TeacherSidebar
            activeTab={teacherTab}
            actionCount={teacherActionOpenCount}
            onSelectTab={(tab) => {
              setTeacherTab(tab);
              // The Gradebook inherits the workspace class rather than starting
              // blank. Clearing it here was the last place a tab change threw
              // away the teacher's context and made them choose again.
              setGradebookFilter({
                classId: activeClass.classId || '',
                classPeriod: activeClass.classPeriod || '',
                assignmentId: null,
                student: null,
              });
              // `homeNavigationPeriod` is a one-shot hand-off from Teacher Home
              // and is right to clear. `activeClass` is deliberately NOT cleared:
              // it is the class the teacher is working in, and it has to survive
              // the walk to another tab and back.
              setHomeNavigationPeriod(null);
              setLiveFocus(null);
              setGradebookProgressFilter('all');
              // Grade Export follows the class the teacher is working in, like
              // every other class-first screen; "All classes" is one click away.
              if (tab === 'gradeTransfer') {
                setGradeExportScope(activeClass.classId ? { classIds: [activeClass.classId], assignmentId: null, nonce: Date.now() } : null);
              }
              // Full academic records are loaded by the tab-scoped subscription
              // only on screens that actually need them.
            }}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
          {/* Wraps on a phone: the title and the Find / workspace / Log Out actions
              used to share one row and the actions ran past the card's edge. */}
          <header style={{ padding: 'clamp(18px, 4vw, 28px) clamp(16px, 4vw, 30px)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--mm-border-soft)', gap: '14px 20px' }}>
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <h1 style={{ margin: 0, color: 'var(--mm-text-strong)', fontSize: '25px' }}>Instructor Dashboard</h1>
              <p style={{ margin: '5px 0 0', color: 'var(--mm-text-muted)' }}>Assignments, eight class periods, DOL schedules, inclusion supports, and evidence reports</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {/*
                The shortcut is the point, but a shortcut nobody knows about is
                a feature that does not exist. The button carries its own key
                hint so the palette is discoverable without a tour.
              */}
              <button
                type="button"
                onClick={() => setQuickSearchOpen(true)}
                title="Find a student, class, assignment or TEKS code"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 13px', background: 'var(--mm-surface)', color: 'var(--mm-text)', border: '1px solid var(--mm-border)', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}
              >
                <span aria-hidden="true">🔍</span>
                <span>Find…</span>
                <kbd style={{ padding: '1px 5px', border: '1px solid var(--mm-border)', borderRadius: 4, background: 'var(--mm-surface-sunken)', color: 'var(--mm-text-muted)', fontSize: 11, fontFamily: 'inherit' }}>⌘K</kbd>
              </button>
              {rootAdminUiEligible && <div role="group" aria-label="Root administrator workspace" style={{ display: 'inline-flex', padding: 3, borderRadius: 9, background: 'var(--mm-surface-control)', border: '1px solid var(--mm-border)' }}><button type="button" aria-pressed="true" style={{ padding: '6px 10px', border: 0, borderRadius: 6, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', fontWeight: 900 }}>Teacher View</button><button type="button" aria-pressed="false" onClick={() => setTeacherWorkspaceMode('administration')} style={{ padding: '6px 10px', border: 0, borderRadius: 6, background: 'transparent', color: 'var(--mm-text)', cursor: 'pointer', fontWeight: 900 }}>Administration</button></div>}
              <button onClick={handleLogout} style={{ padding: '8px 16px', background: 'var(--mm-surface)', color: 'var(--mm-danger)', border: '1px solid #d93025', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Log Out</button>
            </div>
          </header>

          <div className="mm-dashboard-content" style={{ padding: '30px' }}>
            {/*
              CLASS FIRST, THEN FEATURE.
              The bar states one piece of application state that every
              class-scoped view below reads. It is shown only on the tabs where
              a class actually scopes what is on screen — putting it above the
              Math Tools Lab or Student Access would imply a scoping that does
              not exist there, which is worse than not showing it at all.
            */}
            {CLASS_SCOPED_TABS[teacherTab] && (
              <div style={{ marginBottom: 20 }}>
                <ClassContextBar
                  classes={classes}
                  students={allStudents}
                  activeClassId={activeClass.classId}
                  onSelectClass={setActiveClass}
                  scopeLabel={CLASS_SCOPED_TABS[teacherTab].scopeLabel}
                  allowAllClasses={CLASS_SCOPED_TABS[teacherTab].allowAllClasses !== false}
                />
              </div>
            )}

            {teacherTab === 'demo' && <DemoExperience />}

            {teacherTab === 'liveChallenge' && (
              <Suspense fallback={<div style={{ padding: 28 }}>Loading Live Challenge…</div>}>
                <LiveChallengeTeacher
                  allStudents={allStudents}
                  classes={classes}
                  courseProfiles={courseProfiles}
                  signedInEmail={user.email}
                  assignments={assignments}
                  onLinkWarmupChallenge={handleLinkWarmupChallenge}
                />
              </Suspense>
            )}

            {teacherTab === 'weeklyPath' && (
              <WeeklyPathControls
                classes={classes}
                selectedClassId={activeClass.classId || classes[0]?.classId || null}
                goalsByClass={weeklyGoalsByClass}
                // The roster's own profiles, reused rather than rebuilt: the
                // badge in this table and the badge on the Students screen have
                // to be the same badge from the same evidence, or a teacher is
                // being shown two opinions about one child.
                studentsInClass={teacherWeeklyRoster}
                goalsByStudentId={teacherWeeklyGoalsByStudent}
                completionsByStudentId={weeklyPathCompletionsByStudent}
                learningProfilesByStudentId={teacherLearningProfiles}
                progressLoading={weeklyPathProgressLoading}
                progressTruncated={weeklyPathTruncated}
                onChange={handleSaveWeeklyGoal}
                onOpenStudent={setProfileDrawerStudentId}
                saving={weeklyGoalBusy}
                now={now}
              />
            )}

            {teacherTab === 'pacing' && (
              <PacingControls
                classes={classes}
                assignments={assignments}
                courseProfiles={courseProfiles}
                pacingByClass={pacingByClass}
                overrides={skillOverrides}
                onSavePacing={handleSavePacing}
                onSaveOverrides={handleSaveOverrides}
                busy={pacingBusy}
                activeClassId={activeClass.classId}
              />
            )}

            {teacherTab === 'simulator' && (
              <PathSimulator
                assignments={assignments}
                teacherId={user?.id || 'teacher'}
                onCopyText={(text) => {
                  // Clipboard access can be blocked; a window the teacher can
                  // select from beats silently losing the package.
                  const preview = window.open('', '_blank');
                  if (preview) { preview.document.write(`<pre>${text.replace(/</g, '&lt;')}</pre>`); preview.document.close(); }
                }}
              />
            )}

            {teacherTab === 'library' && (
              <AssignmentLibrary
                assignments={assignments}
                folderPaths={assignmentFolderPaths}
                onCreateFolder={handleCreateFolder}
                onRenameFolder={handleRenameFolder}
                onDeleteFolder={handleDeleteFolder}
                onMoveAssignment={handleMoveAssignmentToFolder}
                onAssignAssignment={beginAssignLibraryAssignment}
                onNavigateToAssignments={(navigation) => { setLibraryNavigation(navigation); setTeacherTab('assignments'); }}
                nowValue={now}
                classSchedule={classSchedule}
                classes={classes}
              />
            )}
            {teacherTab === 'assignments' && (
              <div>
                {/*
                  The builder is a destination, not a header. It used to fill
                  the first ~1,700px of this screen, pushing the teacher's own
                  assignments out of sight. It stays mounted while folded, so a
                  half-written plan survives opening and closing it.
                */}
                <details className="tw-disclosure" open={assignments.length === 0} style={{ marginBottom: 8 }}>
                  <summary><span style={{ fontSize: 18 }}>Create and Assign</span> <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>build a new lesson with MathMaster, or paste/upload one</span></summary>
                  <div className="tw-disclosure__body">
                    <AssignmentIntake
                      onJsonReady={handleAssignmentJsonReady}
                      toastSuccess={toastSuccess}
                      toastError={toastError}
                      toastInfo={toastInfo}
                    />
                  </div>
                </details>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '30px', marginBottom: '14px' }}>
                  <h2 style={{ margin: 0 }}>
                    Assignments
                    <span style={{ marginLeft: '10px', fontSize: '14px', fontWeight: 600, color: 'var(--mm-ink-muted)' }}>
                      {visibleAssignments.length} {assignmentListIsFiltered ? 'shown' : 'total'}
                    </span>
                  </h2>
                  <SearchField
                    value={assignmentSearch}
                    onChange={setAssignmentSearch}
                    placeholder="Search assignments by title or folder…"
                    label="Search assignments"
                    style={{ flex: '1 1 280px', maxWidth: '420px' }}
                  />
                </div>

                {selectedAssignmentIds.size > 0 && (
                  <div className="mm-bulkbar">
                    <span className="mm-bulkbar__count">{selectedAssignmentIds.size} selected</span>
                    <span className="mm-bulkbar__spacer" />
                    <button type="button" className="mm-btn mm-btn--sm" disabled={bulkBusy} onClick={() => handleBulkArchive(true)}>Archive</button>
                    <button type="button" className="mm-btn mm-btn--sm" disabled={bulkBusy} onClick={() => handleBulkArchive(false)}>Unarchive</button>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700 }}>
                      <span className="mm-sr-only">Move selected assignments to folder</span>
                      <select
                        value=""
                        disabled={bulkBusy}
                        onChange={(event) => { handleBulkMoveToFolder(event.target.value); event.target.value = ''; }}
                        style={{ minHeight: '34px', padding: '0 8px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.14)', color: '#fff', fontWeight: 700 }}
                      >
                        <option value="" disabled style={{ color: 'var(--mm-text-strong)' }}>Move to folder…</option>
                        <option value="" style={{ color: 'var(--mm-text-strong)' }}>Uncategorized</option>
                        {assignmentFolderPaths.map((path) => <option key={path} value={path} style={{ color: 'var(--mm-text-strong)' }}>{path}</option>)}
                      </select>
                    </label>
                    <button type="button" className="mm-btn mm-btn--sm" disabled={bulkBusy} onClick={clearAssignmentSelection}>Clear</button>
                  </div>
                )}

                {visibleAssignments.length > 0 && (
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '13px', fontWeight: 700, color: 'var(--mm-ink-muted)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={() => setSelectedAssignmentIds((current) => {
                        const next = new Set(current);
                        if (allVisibleSelected) visibleAssignmentIds.forEach((id) => next.delete(id));
                        else visibleAssignmentIds.forEach((id) => next.add(id));
                        return next;
                      })}
                    />
                    Select all {visibleAssignmentIds.length}{assignmentListIsFiltered ? ' shown' : ' (including folded groups)'}
                  </label>
                )}

                {libraryNavigation && (libraryNavigation.folder || libraryNavigation.smartView) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '10px 14px', marginBottom: '14px', background: 'var(--mm-primary-soft)', border: '1px solid var(--mm-primary-border)', borderRadius: '8px', color: 'var(--mm-primary-text)', fontWeight: 'bold', fontSize: '13px' }}>
                    <span>Filtered from Library{libraryNavigation.folder ? ` · ${libraryNavigation.folder}` : ''}{libraryNavigation.smartView ? ` · ${SMART_VIEWS.find((view) => view.id === libraryNavigation.smartView)?.label || libraryNavigation.smartView}` : ''}</span>
                    <button type="button" onClick={() => setLibraryNavigation(null)} style={{ padding: '6px 10px', border: '1px solid #1a73e8', borderRadius: '6px', background: 'var(--mm-surface)', color: 'var(--mm-primary)', fontWeight: 'bold', cursor: 'pointer' }}>Clear filter</button>
                  </div>
                )}
                {visibleAssignments.length === 0 && (
                  <EmptyState
                    icon={assignmentSearch ? '🔍' : '📄'}
                    title={assignmentSearch ? `No assignments match “${assignmentSearch}”` : 'No assignments here yet'}
                    message={assignmentSearch
                      ? 'Try a shorter search, or clear the search to see everything in this view.'
                      : 'Publish one with the form above, or pick a different folder or Smart View in the Library.'}
                    action={assignmentSearch
                      ? <button type="button" className="mm-btn mm-btn--secondary" onClick={() => setAssignmentSearch('')}>Clear search</button>
                      : null}
                  />
                )}
                {(() => {
                const renderAssignmentCard = (assignment) => {
                  const lifecycle = getAssignmentLifecycle(assignment, now);
                  const affectedStudents = teacherStudentDataMode === 'full'
                    ? allStudents.filter((student) => student.gradesByAssignment?.[assignment.id] !== undefined).length
                    : null;
                  const isSelected = selectedAssignmentIds.has(assignment.id);
                  const canonicalQuestions = getStoredAssignmentQuestions(assignment);
                  const includedQuestionIndices = getCurrentContentQuestionIndices(assignment);
                  const hasDOL = Boolean(assignment?.dol?.enabled || canonicalQuestions.some((question) => resolveQuestionActivityRole({ question, assignment }) === 'dol'));
                  const assignmentType = getStoredAssignmentTypeProjection(assignment);
                  const assignmentVariantMode = getStoredAssignmentVariantMode(assignment);
                  const hasSectionVersions = Object.keys(getStoredSectionVariantModes(assignment)).length > 0;
                  const libraryRepair = inspectLibraryContentRepair(assignment, assignments);
                  const contentUpgradeTarget = isLibraryAssignment(assignment)
                    ? null
                    : latestCurrentLibraryRelease(assignments, assignment);
                  const hasContentUpgrade = Boolean(
                    contentUpgradeTarget
                    && contentVersionOf(contentUpgradeTarget) > contentVersionOf(assignment)
                  );
                  return (
                    <article key={assignment.id} data-assignment-card={assignment.id} style={{ scrollMarginTop: '16px', background: 'var(--mm-surface-sunken)', padding: '18px', marginBottom: '12px', borderRadius: '10px', border: `1px solid ${isSelected ? 'var(--mm-primary)' : lifecycle.isLate ? '#f9ab00' : lifecycle.isPracticeOnly ? '#5f6368' : 'var(--mm-border)'}`, boxShadow: isSelected ? '0 0 0 2px var(--mm-primary-soft)' : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleAssignmentSelected(assignment.id)}
                          aria-label={`Select ${assignment.title}`}
                          style={{ flex: '0 0 auto', width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <div style={{ flex: '1 1 440px', textAlign: 'left' }}>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {/* The title opens the assignment's world: its classes,
                                live room, controls, grades and export. */}
                            <button type="button" className="tw-link" style={{ fontSize: '18px' }} onClick={() => openAssignmentHub(assignment.id)}>{assignment.title}</button>
                            <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)' }}>{contentVersionLabel(assignment)}</span>
                            {hasContentUpgrade && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)' }}>V{contentVersionOf(contentUpgradeTarget)} AVAILABLE</span>}
                            <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: lifecycle.isPracticeOnly ? 'var(--mm-surface-control)' : lifecycle.isLate ? 'var(--mm-warning-soft)' : 'var(--mm-success-bg)', color: lifecycle.isPracticeOnly ? 'var(--mm-text)' : lifecycle.isLate ? 'var(--mm-warning-text)' : 'var(--mm-success-text)' }}>{lifecycle.isPracticeOnly ? 'PRACTICE ONLY' : lifecycle.status.toUpperCase()}</span>
                            <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)' }}>{assignmentType === 'notesClasswork' ? 'NOTES / CLASSWORK' : assignmentType.toUpperCase()}</span>
                            {hasSectionVersions ? <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)' }}>SECTION VERSIONS</span> : assignmentVariantMode === 'shared' && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' }}>SHARED VERSION</span>}
                            {assignment.archived && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: 'var(--mm-surface-control)', color: 'var(--mm-text-muted)' }}>ARCHIVED</span>}
                            {assignment.unpublished && !assignment.archived && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)' }}>PAUSED · HIDDEN FROM STUDENTS</span>}
                            {isTestCycleAssignment(assignment) && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)' }}>TEST CYCLE</span>}
                            {/* A library item has no audience and no due date. Saying so
                                plainly is the whole point of allowing it to exist. */}
                            {isLibraryAssignment(assignment) && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)' }}>NOT ASSIGNED</span>}
                          </div>
                          <div style={{ marginTop: '7px', color: 'var(--mm-text-muted)', fontSize: '13px', lineHeight: 1.55 }}>{includedQuestionIndices.length} included question{includedQuestionIndices.length === 1 ? '' : 's'}{canonicalQuestions.length !== includedQuestionIndices.length ? ` · ${canonicalQuestions.length - includedQuestionIndices.length} excluded` : ''} · {isLibraryAssignment(assignment) ? 'Not assigned to a class' : `Classes: ${(assignment.assignedClassIds || []).map((classId) => classesById[classId]?.name || classesById[classId]?.period).filter(Boolean).join(', ') || (assignment.assignedClassPeriods || []).join(', ')}`}<br />{isLibraryAssignment(assignment) ? 'No due date yet' : `Due ${formatDueDate(assignment)} · Late close ${formatLateDueDate(assignment)}`} · {affectedStudents === null
                            ? 'progress, grades and live activity in its details'
                            : `${affectedStudents} student record${affectedStudents === 1 ? '' : 's'}`}</div>
                        </div>
                        <AssignmentCardMenu
                          ariaLabel={`More actions for ${assignment.title}`}
                          items={[
                            { key: 'details', label: 'Open assignment details', onClick: () => openAssignmentHub(assignment.id) },
                            ...(!isLibraryAssignment(assignment) && (assignment.assignedClassIds || []).length ? [
                              { key: 'grades', label: 'Grades', onClick: () => openGradebookFor((assignment.assignedClassIds || []).includes(activeClass.classId) ? activeClass.classId : assignment.assignedClassIds[0], assignment.id) },
                              { key: 'export-grades', label: 'Export grades', onClick: () => openGradeExport({ classIds: (assignment.assignedClassIds || []).includes(activeClass.classId) ? [activeClass.classId] : [], assignmentId: assignment.id }) },
                            ] : []),
                            ...(isTestCycleAssignment(assignment) ? [{
                              key: 'test-cycle-results',
                              label: 'Test results, release & retests',
                              onClick: () => { setFocusedTestCycleAssignmentId(assignment.id); setTeacherTab('exams'); },
                            }] : []),
                            { key: 'preview', label: 'View as Student', onClick: () => startTeacherPreview(assignment.id) },
                            { key: 'edit-questions', label: 'Edit Questions', onClick: () => openQuestionEditor(assignment) },
                            { key: 'edit-setup', label: 'Review / Edit Setup', onClick: () => beginEditAssignmentSetup(assignment) },
                            { key: 'export-pdf', label: 'Print / Answer Key', onClick: () => beginTeacherWorksheetExport(assignment) },
                            { key: 'export-json', label: 'Export Assignment', onClick: () => { setExportJsonAssignment(assignment); setExportJsonCopied(false); } },
                            { key: 'dates-classes', label: isLibraryAssignment(assignment) ? 'Assign to Class / Dates' : 'Dates & Classes', onClick: () => beginEditAssignmentDates(assignment) },
                            ...(hasContentUpgrade ? [{
                              key: 'upgrade-content-version',
                              label: `Upgrade to Content V${contentVersionOf(contentUpgradeTarget)}`,
                              onClick: () => setContentUpgradeRequest({ assignment, targetAssignment: contentUpgradeTarget }),
                            }] : []),
                            ...(!isLibraryAssignment(assignment) ? [{
                              key: 'repair-classroom-post',
                              label: 'Repair / Repost Classroom',
                              onClick: () => handleRepairClassroomAssignmentPost(assignment),
                            }, {
                              key: 'force-classroom-post',
                              label: 'Force New Classroom Post…',
                              onClick: () => {
                                setClassroomManagerAssignmentId(assignment.id);
                                setTeacherTab('classroom');
                              },
                            }] : []),
                            ...(libraryRepair.source && libraryRepair.questionIds.length ? [{
                              key: 'repair-library-content',
                              label: `Repair Corrupted Question${libraryRepair.questionIds.length === 1 ? '' : 's'} from Original`,
                              onClick: () => handleRepairAssignmentFromLibrary(assignment),
                            }] : []),
                            { key: 'move-folder', label: 'Move to Folder', onClick: () => { setMovingFolderAssignmentId(assignment.id); setMovingFolderValue(assignment.folder || ''); } },
                            { key: 'duplicate', label: 'Duplicate', onClick: () => handleDuplicateAssignment(assignment) },
                            ...(!isLibraryAssignment(assignment) && !assignment.archived ? [{
                              key: 'pause',
                              label: assignment.unpublished ? 'Resume for students' : 'Pause (hide from students)',
                              onClick: () => handleTogglePauseAssignment(assignment),
                            }] : []),
                            { key: 'archive', label: assignment.archived ? 'Unarchive' : 'Archive', onClick: () => handleToggleArchiveAssignment(assignment) },
                            { key: 'delete', label: 'Delete', tone: 'danger', onClick: () => openDeleteDialog(assignment) },
                          ]}
                        />
                      </div>
                      {movingFolderAssignmentId === assignment.id && (
                        <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--mm-border)', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'end' }}>
                          <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Folder
                            <select value={movingFolderValue} onChange={(event) => setMovingFolderValue(event.target.value)} style={{ display: 'block', marginTop: '5px', padding: '9px', border: '1px solid var(--mm-border)', borderRadius: '7px', minWidth: '220px' }}>
                              <option value="">Uncategorized</option>
                              {assignmentFolderPaths.map((path) => <option key={path} value={path}>{path}</option>)}
                            </select>
                          </label>
                          <button onClick={async () => { await handleMoveAssignmentToFolder(assignment.id, movingFolderValue); setMovingFolderAssignmentId(null); }} style={{ padding: '10px 15px', background: '#188038', color: '#fff', border: 0, borderRadius: '7px', fontWeight: 'bold' }}>Save Folder</button>
                          <button onClick={() => setMovingFolderAssignmentId(null)} style={{ padding: '10px 15px', background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', borderRadius: '7px', fontWeight: 'bold' }}>Cancel</button>
                        </div>
                      )}
                      {editingAssignmentId === assignment.id && (
                        <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--mm-border)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'end' }}>
                          <label style={{ fontWeight: 'bold' }}>Regular due <input type="datetime-local" value={editingAssignmentDates.dueAt} onChange={(event) => setEditingAssignmentDates((current) => ({ ...current, dueAt: event.target.value }))} style={{ display: 'block', padding: '8px', marginTop: '5px' }} /></label>
                          <label style={{ fontWeight: 'bold' }}>Final late due <input type="datetime-local" value={editingAssignmentDates.lateDueAt} onChange={(event) => setEditingAssignmentDates((current) => ({ ...current, lateDueAt: event.target.value }))} style={{ display: 'block', padding: '8px', marginTop: '5px' }} /></label>
                          {hasDOL && <label style={{ fontWeight: 'bold' }}>DOL instructional date <input type="date" value={editingAssignmentDates.dolInstructionDate || ''} onChange={(event) => setEditingAssignmentDates((current) => ({ ...current, dolInstructionDate: event.target.value }))} style={{ display: 'block', padding: '8px', marginTop: '5px' }} /></label>}
                          <div style={{ flex: '1 1 100%', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {classes.filter((entry) => entry?.status !== 'archived' && entry?.classId).map((classRecord) => {
                              const selected = editingAssignmentDates.assignedClassIds?.includes(classRecord.classId);
                              return (
                                <label key={classRecord.classId || classRecord.period} style={{ padding: '5px 8px', borderRadius: '999px', background: selected ? 'var(--mm-primary-soft)' : 'var(--mm-surface)', border: '1px solid var(--mm-tint-border)', fontWeight: 'bold', fontSize: '12px' }}>
                                  <input type="checkbox" checked={Boolean(selected)} onChange={() => setEditingAssignmentDates((current) => {
                                    const ids = current.assignedClassIds?.includes(classRecord.classId)
                                      ? current.assignedClassIds.filter((item) => item !== classRecord.classId)
                                      : [...(current.assignedClassIds || []), classRecord.classId];
                                    const periods = [...new Set(classes.filter((entry) => ids.includes(entry.classId)).map((entry) => entry.period).filter(Boolean))];
                                    return { ...current, assignedClassIds: ids, assignedClassPeriods: periods };
                                  })} /> {classRecord.name || classRecord.period}{classRecord.name && classRecord.name !== classRecord.period ? ` · ${classRecord.period}` : ''}
                                </label>
                              );
                            })}
                          </div>
                          <button onClick={() => handleSaveAssignmentDates(assignment.id)} style={{ padding: '10px 15px', background: '#188038', color: '#fff', border: 0, borderRadius: '7px', fontWeight: 'bold' }}>Save Dates</button>
                          <button onClick={() => setEditingAssignmentId(null)} style={{ padding: '10px 15px', background: 'var(--mm-surface)', border: '1px solid var(--mm-border)', borderRadius: '7px', fontWeight: 'bold' }}>Cancel</button>
                        </div>
                      )}
                    </article>
                  );
                };
                /*
                  CURRENT WORK FIRST (platform/teacher/assignmentListGroups.js).
                  This list used to be every assignment ever made, oldest due
                  date first. Now: what is open, then what is scheduled; closed
                  work folds by marking period and library copies fold last.
                  Nothing is hidden — a search or Library filter shows one flat,
                  current-first list so a match is never folded away.
                */
                const listGroups = groupAssignmentList({
                  assignments: visibleAssignments,
                  nowValue: now,
                  gradingPeriodSettings,
                  flat: assignmentListIsFiltered,
                });
                return listGroups.map((group) => {
                  const holdsOpenEditor = group.assignments.some((assignment) => assignment.id === editingAssignmentId || assignment.id === movingFolderAssignmentId);
                  if (!group.folded) {
                    return (
                      <section key={group.id} aria-label={group.label} data-assignment-group={group.id} style={{ marginBottom: '8px' }}>
                        {listGroups.length > 1 && (
                          <h3 style={{ margin: '4px 0 10px', fontSize: '15px', textAlign: 'left' }}>
                            {group.label} <span className="tw-pill">{group.assignments.length}</span>
                            {group.hint && <span className="tw-small tw-muted" style={{ fontWeight: 600, marginLeft: 8 }}>{group.hint}</span>}
                          </h3>
                        )}
                        {group.assignments.map(renderAssignmentCard)}
                      </section>
                    );
                  }
                  const open = holdsOpenEditor || (assignmentGroupOpen[group.id] ?? false);
                  return (
                    <details
                      key={group.id}
                      className="tw-disclosure"
                      data-assignment-group={group.id}
                      open={open}
                      onToggle={(event) => {
                        const next = event.currentTarget.open;
                        if (next !== open) setAssignmentGroupOpen((current) => ({ ...current, [group.id]: next }));
                      }}
                      style={{ marginBottom: '10px' }}
                    >
                      <summary>{group.label} <span className="tw-pill">{group.assignments.length}</span>{group.hint && <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>{group.hint}</span>}</summary>
                      <div className="tw-disclosure__body">{open && group.assignments.map(renderAssignmentCard)}</div>
                    </details>
                  );
                });
                })()}
              </div>
            )}

            {teacherTab === 'students' && (
              <StudentsRoster
                // The roster inherits the workspace class instead of carrying
                // its own filter. "All classes" is still available from the bar
                // above, so nothing a teacher could see before is unreachable.
                students={activeClass.classId ? studentsInActiveClass : allStudents}
                classes={classes}
                classPeriods={CLASS_PERIODS}
                courseProfiles={courseProfiles}
                masteryProfilesByStudentId={teacherMasteryProfilesByStudentId}
                assignments={assignments}
                pacingByClass={pacingByClass}
                skillOverrides={skillOverrides}
                onChangeClassPeriod={handleChangeClassPeriod}
                teacherEmail={user?.email || ''}
                onSupportProfileSaved={handleSupportProfileSaved}
                onGenerateIEPReport={openIEPReport}
                isRootAdmin={rootAdminUiEligible}
                onOpenAdministration={() => setTeacherWorkspaceMode('administration')}
                onOpenProfileDrawer={setProfileDrawerStudentId}
                onOpenAssignment={openAssignmentHub}
                onOpenStudentWork={(classId, assignmentId, studentId) => openGradebookFor(classId, assignmentId, studentId)}
                gradingPeriodSettings={gradingPeriodSettings}
              />
            )}

            {teacherTab === 'home' && (
              <TeacherHome
                onLiveClassChange={reportLiveClass}
                allStudents={allStudents}
                studentIdentityIndex={teacherStudentIdentityIndex}
                assignments={assignments}
                classSchedule={classSchedule}
                nowValue={now}
                presenceById={presenceById}
                onSelectPeriod={handleGoToClassFromHome}
                needsAttention={needsAttentionQueue}
                needsAttentionCompletionCoverage={Boolean(activeClass.classId) && weeklyPathProgressLoadedFor === activeClass.classId}
                needsAttentionAcademicCoverage={teacherStudentDataMode === 'full'}
                learningProfilesByStudentId={teacherLearningProfiles}
                activeClassId={activeClass.classId}
                classes={classes}
                teacherUid={auth.session?.uid || user.uid || ''}
                teacherEmail={user.email || ''}
                teacherLabel={user.displayName || user.name || user.email || 'Your teacher'}
                isRootAdmin={user.isRootAdmin === true}
                studentSupportEvents={studentSupportEvents}
                studentSessionSummaries={studentSessionSummaries}
                onRecordStudentSupportEvent={handleRecordStudentSupportEvent}
                onRecommendPersonalPath={handlePersonalPathRecommendation}
                pathInterventionBusyStudentId={pathInterventionBusyStudentId}
                onOpenWeeklyPath={() => setTeacherTab('weeklyPath')}
                onOpenAdministration={() => setTeacherWorkspaceMode('administration')}
                onUnlockDOL={handleUnlockDOLForClass}
                dolUnlockBusyKey={dolUnlockBusyKey}
                onGrantDOLAttempt={handleGrantDOLAttemptForClass}
                dolAttemptGrantBusyKey={dolAttemptGrantBusyKey}
                onToggleWarmup={handleToggleWarmupForClass}
                warmupControlBusyKey={warmupControlBusyKey}
                onToggleSectionAccess={handleToggleSectionAccessForClass}
                sectionAccessBusyKey={sectionAccessBusyKey}
                // Opening a name is a question, not a navigation. It used to
                // throw the teacher into the Gradebook, losing whatever they
                // were doing on Home.
                onOpenStudent={setProfileDrawerStudentId}
                gradingPeriodSettings={gradingPeriodSettings}
                liveTeachingSession={liveTeachingSession}
                onTeachAssignment={teachAssignmentLive}
                onResumeTeaching={resumeLiveTeaching}
                onEndLiveTeaching={endLiveTeaching}
                onDolControl={handleDolControlForClass}
                dolControlBusyKey={dolControlBusyKey}
                onOpenAssignment={openAssignmentHub}
                onSelectClass={(classContext) => { setLiveFocus(null); setActiveClass(classContext); }}
                liveFocus={liveFocus}
              />
            )}

            {teacherTab === 'attendanceHistory' && (
              <AttendanceHistoryPanel
                onClassChange={reportAttendanceClass}
                db={db}
                classes={classes}
                allStudents={allStudents}
                assignments={assignments}
                classSchedule={classSchedule}
                nonInstructionalKeys={SCHOOL_NON_INSTRUCTIONAL_KEYS}
                teacherEmail={user.email || ''}
                nowValue={now}
                onRecordCorrection={handleRecordStudentSupportEvent}
                recentSupportEvents={studentSupportEvents}
                reviewBusyKey={attendanceReviewBusyKey}
                onKeepExtension={handleKeepAttendanceExtension}
                onApplyShorterExtension={handleApplyShorterAttendanceExtension}
                initialClassId={activeClass.classId}
              />
            )}

            {teacherTab === 'actionCenter' && (
              <TeacherActionCenter
                projectedItems={teacherActionItems}
                students={allStudents}
                classes={classes}
                assignments={assignments}
                supportEvents={studentSupportEvents}
                parentContacts={parentContacts}
                gradeTransferUnits={actionGradeScope.units}
                retestRecoveryActions={retestRecoveryActions}
                classSchedule={classSchedule}
                nonInstructionalKeys={SCHOOL_NON_INSTRUCTIONAL_KEYS}
                nowValue={now}
                onResolveReturnCheckIn={(candidate) => candidate && handleRecordStudentSupportEvent(buildReturnCheckInEvent({ candidate, actorEmail: user.email }))}
                onOpenWorkflow={(item) => {
                  if (item.sourceType === 'studentSupportEvent') setParentContactSourceAction(item);
                  // A grade-export row opens Grade Export on exactly that class
                  // and assignment rather than the full list of every export.
                  if (item.sourceType === 'gradeTransfer') {
                    openGradeExport({ classIds: item.classId ? [item.classId] : [], assignmentId: item.assignmentId || null });
                    return;
                  }
                  setTeacherTab(item.sourceType === 'returnCheckIn' ? 'attendanceHistory' : item.sourceType === 'testCycle' ? 'exams' : 'parentContacts');
                }}
              />
            )}

            {teacherTab === 'parentContacts' && (
              <ParentContactCenter
                students={allStudents}
                classes={classes}
                assignments={assignments}
                contacts={parentContacts}
                supportEvents={studentSupportEvents}
                sessionSummaries={studentSessionSummaries}
                masteryProfilesByStudentId={teacherMasteryProfilesByStudentId}
                classSchedule={classSchedule}
                nonInstructionalKeys={SCHOOL_NON_INSTRUCTIONAL_KEYS}
                nowValue={now}
                sourceAction={parentContactSourceAction}
                onRecordContact={async (contact) => {
                  const recorded = await recordParentContact({ db, teacherEmail: user.email, contact });
                  if (contact.sourceEventId) {
                    await handleRecordStudentSupportEvent({
                      kind: SUPPORT_EVENT_KIND.RESOLVED, stage: SUPPORT_EVENT_STAGE.RESOLVED,
                      studentId: contact.studentId, studentName: contact.studentName,
                      classId: contact.classId, classPeriod: contact.classPeriod,
                      sourceEventId: contact.sourceEventId, resolvesEventId: contact.sourceEventId,
                      summary: 'Parent follow-up completed by recorded parent contact.',
                    });
                    setParentContactSourceAction(null);
                  }
                  return recorded;
                }}
                onCompleteFollowUp={(contact) => recordParentContactResolution({ db, teacherEmail: user.email, contact })}
                onExportContacts={() => fetchAllParentContactsForExport({ db, teacherEmail: user.email })}
              />
            )}

            {teacherTab === 'classesWorkspace' && (
              <ClassesWorkspace
                classes={classes}
                allStudents={allStudents}
                assignments={assignments}
                classSchedule={classSchedule}
                nowValue={now}
                presenceById={presenceById}
                onViewGradebook={handleViewClassGradebook}
                onUnlockDOL={handleUnlockDOLForClass}
                dolUnlockBusyKey={dolUnlockBusyKey}
                onGrantDOLAttempt={handleGrantDOLAttemptForClass}
                dolAttemptGrantBusyKey={dolAttemptGrantBusyKey}
                onToggleWarmup={handleToggleWarmupForClass}
                warmupControlBusyKey={warmupControlBusyKey}
                onToggleSectionAccess={handleToggleSectionAccessForClass}
                sectionAccessBusyKey={sectionAccessBusyKey}
                onDolControl={handleDolControlForClass}
                dolControlBusyKey={dolControlBusyKey}
                onOpenAssignment={openAssignmentHub}
                onOpenLive={(classContext) => openLiveFor(classContext, null)}
                onOpenExport={(classId) => openGradeExport({ classIds: [classId] })}
                gradingPeriodSettings={gradingPeriodSettings}
                initialPeriod={homeNavigationPeriod}
                initialClassId={activeClass.classId}
                onSelectClass={setActiveClass}
                learningProfilesByStudentId={teacherLearningProfiles}
                masteryProfilesByStudentId={teacherMasteryProfilesByStudentId}
                needsAttentionCount={needsAttentionQueue.length}
                onOpenStudent={setProfileDrawerStudentId}
                evidenceByStudentId={classEvidenceByStudentId}
                onLoadDeliveredRigor={handleLoadDeliveredRigor}
                rigorLoading={classEvidenceLoading}
                academicDataLoaded={teacherStudentDataMode === 'full'}
              />
            )}

            {teacherTab === 'classes' && (
              <div>
                <h2 style={{ marginTop: 0 }}>Class & Bell Schedule Settings</h2>
                <ClassCourseSettings classPeriods={CLASS_PERIODS} courseProfiles={courseProfiles} assignments={assignments} onChange={handleUpdateCourseProfile} onSave={handleSaveCourseProfiles} saving={courseProfilesSaving} />
                <ClassScheduleSettings
                  classPeriods={CLASS_PERIODS}
                  schedule={classSchedule}
                  onChange={setClassSchedule}
                  onSave={handleSaveClassSchedule}
                  nowValue={now}
                />
              </div>
            )}

            {teacherTab === 'grades' && (
              <div>
                <h2 style={{ marginTop: 0 }}>Gradebook and Evidence</h2>

                {classes.length > 0 && !gradebookFilter.classId && !gradebookFilter.student && (
                  <GradebookClassChooser classes={classes} schedule={classSchedule} nowValue={now} onChoose={setActiveClass} />
                )}

                {/*
                  THE ASSIGNMENT FIRST. The grades used to sit behind a "Select
                  assignment" dropdown below the marking-period settings and the
                  weekly Path panel. The bar picks the most relevant current
                  assignment, and its summary is also the table's filter.
                */}
                <GradebookAssignmentBar
                  assignments={assignmentsForSelectedClass}
                  selectedAssignmentId={gradebookFilter.assignmentId}
                  onSelectAssignment={(assignmentId) => {
                    setGradebookProgressFilter('all');
                    setGradebookFilter((current) => ({ ...current, assignmentId: assignmentId || null, student: null }));
                  }}
                  gradingPeriodSettings={gradingPeriodSettings}
                  nowValue={now}
                  disabled={!selectedGradebookPeriod}
                  autoSelect={!gradebookFilter.student}
                  progress={gradebookProgress}
                  progressFilter={gradebookProgressFilter}
                  onProgressFilter={setGradebookProgressFilter}
                  classLabel={selectedGradebookClass?.name || selectedGradebookPeriod}
                  onOpenAssignment={(assignmentId) => openAssignmentHub(assignmentId, gradebookFilter.classId || null)}
                  onOpenLive={(assignmentId) => openLiveFor({ classId: gradebookFilter.classId || null, classPeriod: selectedGradebookPeriod || null }, assignmentId)}
                  onOpenExport={(assignmentId) => openGradeExport({ classIds: gradebookFilter.classId ? [gradebookFilter.classId] : [], assignmentId })}
                />
                {(!classes.length || gradebookFilter.student) && (
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
                  {/*
                    The class dropdown that stood here is gone; the class bar
                    above the page owns that choice now. The legacy period
                    picker survives only for a school with no class records at
                    all, which has no classes for the bar to offer.
                  */}
                  {!classes.length && (
                    <select
                      value={gradebookFilter.classPeriod}
                      onChange={(event) => setGradebookFilter({
                        classId: '', classPeriod: event.target.value, assignmentId: null, student: null,
                      })}
                      style={{ padding: '9px', minWidth: '220px' }}
                    >
                      <option value="">Select class period</option>
                      {CLASS_PERIODS.map((period) => <option key={period} value={period}>{period}</option>)}
                    </select>
                  )}
                  {gradebookFilter.student && <button onClick={() => setGradebookFilter((current) => ({ ...current, student: null }))} style={{ padding: '9px 14px' }}>Back to class list</button>}
                </div>
                )}

                {selectedAssignment && assignmentUsesTeacherReleasePolicy(selectedAssignment) && (
                  <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '20px', padding: '15px 17px', borderRadius: '9px', background: assignmentFeedbackWasReleased(selectedAssignment) ? 'var(--mm-success-bg)' : 'var(--mm-primary-subtle)', border: `1px solid ${assignmentFeedbackWasReleased(selectedAssignment) ? 'var(--mm-success-border)' : 'var(--mm-primary-border)'}`, textAlign: 'left' }}>
                    <div>
                      <strong style={{ color: assignmentFeedbackWasReleased(selectedAssignment) ? 'var(--mm-success-text)' : 'var(--mm-primary-text)' }}>{assignmentFeedbackWasReleased(selectedAssignment) ? 'Assessment feedback released' : 'Assessment feedback is held'}</strong>
                      <div style={{ marginTop: '4px', color: 'var(--mm-text-muted)', fontSize: '13px' }}>{assignmentFeedbackWasReleased(selectedAssignment) ? `Students can now see correctness and grades.${selectedAssignment.feedbackReleasedAt ? ` Released ${formatTimeStamp(selectedAssignment.feedbackReleasedAt)}.` : ''}` : 'You can review scores here; students see only a neutral submitted state until you release feedback.'}</div>
                    </div>
                    {!assignmentFeedbackWasReleased(selectedAssignment) && (
                      <button type="button" disabled={feedbackReleaseBusyId === selectedAssignment.id} onClick={() => handleReleaseAssignmentFeedback(selectedAssignment)} style={{ padding: '9px 14px', border: 0, borderRadius: '7px', background: feedbackReleaseBusyId === selectedAssignment.id ? '#dadce0' : '#174ea6', color: '#fff', fontWeight: 900, cursor: feedbackReleaseBusyId === selectedAssignment.id ? 'wait' : 'pointer' }}>
                        {feedbackReleaseBusyId === selectedAssignment.id ? 'Releasing…' : 'Release Feedback to Students'}
                      </button>
                    )}
                  </section>
                )}

                {/*
                  "The teacher should never have to guess whether two students'
                  scores came from identical rigor." On an adaptive assignment
                  two students can both score 80% having answered genuinely
                  different questions. That is the point of adaptation, and it
                  makes the two scores incomparable in a way nothing on this
                  screen previously admitted. Read from delivered evidence, not
                  from the assignment's declared mode.
                */}
                {selectedAssignment && !gradebookFilter.student && (
                  <div style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 9, border: '1px solid var(--mm-border)', background: gradebookRigor.state === COMPARABILITY.VARIED ? 'var(--mm-accent-subtle)' : 'var(--mm-surface-sunken)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 900, background: gradebookRigor.state === COMPARABILITY.VARIED ? 'var(--mm-accent-soft)' : gradebookRigor.state === COMPARABILITY.IDENTICAL ? 'var(--mm-success-bg)' : 'var(--mm-surface-control)', color: gradebookRigor.state === COMPARABILITY.VARIED ? 'var(--mm-accent-text)' : gradebookRigor.state === COMPARABILITY.IDENTICAL ? 'var(--mm-success-text)' : 'var(--mm-text-muted)' }}>
                      {gradebookRigor.state === COMPARABILITY.VARIED ? 'RIGOR VARIED' : gradebookRigor.state === COMPARABILITY.IDENTICAL ? 'SAME RIGOR' : 'RIGOR UNKNOWN'}
                    </span>
                    <span style={{ flex: 1, minWidth: 220, color: 'var(--mm-text)', fontSize: 12.5, lineHeight: 1.45 }}>{gradebookRigor.note}</span>
                    {gradebookRigor.state === COMPARABILITY.UNKNOWN && (
                      <button
                        type="button"
                        onClick={() => handleLoadDeliveredRigor(selectedClassStudents.map((student) => student.id))}
                        disabled={classEvidenceLoading}
                        style={{ padding: '7px 12px', border: '1px solid var(--mm-border)', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 800, fontSize: 12.5, cursor: classEvidenceLoading ? 'wait' : 'pointer' }}
                      >
                        {classEvidenceLoading ? 'Reading delivery history…' : 'Check delivered rigor'}
                      </button>
                    )}
                  </div>
                )}

                {selectedGradebookPeriod && selectedAssignment && !gradebookFilter.student && (
                  <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}><thead><tr style={{ background: 'var(--mm-surface-sunken)' }}><th style={{ padding: '12px' }}>Student</th><th>Overall</th><th>Warm-Up</th><th>Classwork</th><th>Practice</th><th>DOL</th><th>Instructional condition</th><th>Activity</th><th></th></tr></thead><tbody>{gradebookVisibleStudents.map((student) => { const grades = projectedAssignmentTrackerFor({ student, assignment: selectedAssignment }) || undefined; const assignmentOverride = assignmentGradeOverrideFor(student, selectedAssignment.id); const practicePassRedeemed = gradebookHasPracticePass(student, selectedAssignment); const supportProfile = student.profile || null; const testCycleRow = isTestCycleAssignment(selectedAssignment); /* A Test Cycle's grade is its RECORDED grade (released Test, capped retest), not its Review tracker. */ const score = testCycleRow ? canonicalPresentedAssignmentGrade({ student, assignment: selectedAssignment }) : assignmentOverride ? assignmentOverride.score : grades ? calculateGrade(grades, selectedAssignment, { practicePassRedeemed, supportProfile }) : null; const sectionGrades = splitGradesBySection({ tracker: grades, assignment: selectedAssignment, practicePassRedeemed, supportProfile }); const recoveredSections = completedRecoverySections(student, selectedAssignment.id); const heldSections = heldRecoverySections(student, selectedAssignment.id); const challengeWarmup = warmupChallengeCounts(student, selectedAssignment.id); const recoveredMark = (section) => (<>{section === 'warmup' && challengeWarmup ? <span data-warmup-challenge-mark="true" title="The Warm-Up grade is this student's Live Challenge result. Open Details for the rounds." style={{ marginLeft: 4, padding: '1px 5px', borderRadius: 999, background: 'var(--mm-info-bg)', color: 'var(--mm-info-text)', fontSize: 10, fontWeight: 900 }}>LC</span> : null}{recoveredSections.has(section) ? <span data-recovered-section={section} title="Includes a completed Practice-based Recovery. Open Details for Original, Recovery and Final." style={{ marginLeft: 4, padding: '1px 5px', borderRadius: 999, background: 'var(--mm-info-bg)', color: 'var(--mm-info-text)', fontSize: 10, fontWeight: 900 }}>R</span> : null}{heldSections.has(section) ? <span data-held-recovery-section={section} title="A Practice-based Recovery is held for you: MathMaster could not grade one or more of its questions. The original shows until you resolve it in Details; Classroom and Grade Transfer wait." style={{ marginLeft: 4, padding: '1px 5px', borderRadius: 999, background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)', fontSize: 10, fontWeight: 900 }}>Held</span> : null}</>); const gradeSplit = splitGrade({ tracker: grades, assignment: selectedAssignment, practicePassRedeemed, supportProfile }); const gradeExplanation = grades ? explainGrade(gradeSplit) : null; const usage = student.supportUsageByAssignment?.[selectedAssignment.id] || {}; const modified = Boolean(usage.modified || usage.modifications?.length); const activity = student.assignmentActivity?.[selectedAssignment.id] || {}; return <tr key={student.id} style={{ borderBottom: '1px solid var(--mm-border-soft)' }}><td style={{ padding: '12px' }}><StudentNameLink studentId={student.id} studentName={formatStudentName(student)} showMissingId={false} profile={teacherLearningProfiles[student.id]} onOpen={setProfileDrawerStudentId} showBadge /><div style={{ marginTop: 3, color: 'var(--mm-text-muted)', fontSize: 11 }}>ID {student.id}</div></td><td><strong style={{ color: modified ? 'var(--mm-accent-text)' : score >= 70 ? 'var(--mm-success)' : 'var(--mm-text-strong)' }}>{score === null ? '—' : `${score}%`}</strong>{modified && <span title={`Accommodations: ${(usage.accommodations || []).join(', ') || 'none'}; Modifications: ${(usage.modifications || []).join(', ') || 'none'}`} style={{ marginLeft: '7px', padding: '3px 6px', borderRadius: '999px', background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)', fontWeight: 900, fontSize: '11px' }}>MOD</span>}
                    {/*
                      COMPLETION AND PERFORMANCE, VISUALLY APART.
                      The grade above is unchanged. These two lines are what a
                      teacher previously reconstructed by clicking into each
                      student one at a time: how much was attempted, and how they
                      did on what they attempted. A grey completion chip is
                      deliberately NOT red — a student who missed a week has not
                      failed mathematics.
                    */}
                    {gradeSplit.shape !== 'complete' && (
                      <div style={{ marginTop: 5, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ padding: '2px 7px', borderRadius: 999, background: 'var(--mm-surface-control)', color: 'var(--mm-text)', fontSize: 10.5, fontWeight: 900 }}>
                          {gradeSplit.attempted}/{gradeSplit.total} ANSWERED
                        </span>
                        {gradeSplit.creditOnAttempted !== null && (
                          <span style={{ padding: '2px 7px', borderRadius: 999, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', fontSize: 10.5, fontWeight: 900 }}>
                            {gradeSplit.creditOnAttempted}% ON THOSE
                          </span>
                        )}
                      </div>
                    )}
                    {gradeExplanation && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--mm-text-muted)', lineHeight: 1.4, maxWidth: 280 }}>{gradeExplanation}</div>}</td><td style={{ fontSize: '12px', fontWeight: 800 }}>{sectionGrades.warmup.attempted ? `${sectionGrades.warmup.score}%` : '—'}{recoveredMark('warmup')}</td><td style={{ fontSize: '12px', fontWeight: 800 }}>{sectionGrades.classwork.attempted ? `${sectionGrades.classwork.score}%` : '—'}</td><td style={{ fontSize: '12px', fontWeight: 800 }}>{sectionGrades.practice?.excused ? <span title="The student used a Practice Pass: Practice is excused — not scored and not required." style={{ color: 'var(--mm-accent-text)' }}>Excused (Pass)</span> : sectionGrades.practice.attempted ? `${sectionGrades.practice.score}%` : '—'}</td><td style={{ fontSize: '12px', fontWeight: 800 }}>{sectionGrades.dol.attempted ? `${sectionGrades.dol.score}%` : '—'}{recoveredMark('dol')}</td><td style={{ fontSize: '12px' }}>{modified ? `Modified: ${(usage.modifications || []).join(', ')}` : (usage.accommodations || []).length ? `Accommodated: ${usage.accommodations.join(', ')}` : 'Standard'}</td><td style={{ fontSize: '12px', lineHeight: 1.45 }}>{activity.totalTimeSeconds ? <>Total {formatTime(activity.totalTimeSeconds)}<br />On time {formatTime(activity.onTimeSeconds || 0)} · Late {formatTime(activity.lateSeconds || 0)}</> : 'Time not recorded'}<br />Last on-time: {formatTimeStamp(activity.lastActiveBeforeDue)}<br />Last late: {formatTimeStamp(activity.lastActiveLate)}</td><td><button onClick={() => setGradebookFilter((current) => ({ ...current, student }))} style={{ padding: '8px 12px', border: 0, borderRadius: '6px', background: '#1a73e8', color: '#fff', fontWeight: 'bold' }}>Details</button></td></tr>; })}</tbody></table></div>
                )}

                {gradebookFilter.student && selectedAssignment && (() => { const student = allStudents.find((entry) => entry.id === gradebookFilter.student.id) || gradebookFilter.student; const studentGrades = projectedAssignmentTrackerFor({ student, assignment: selectedAssignment }) || {}; const assignmentOverride = assignmentGradeOverrideFor(student, selectedAssignment.id); const drillRequired = studentRequiredQuestions({ assignment: selectedAssignment, profile: student.profile || null, tracker: student.gradesByAssignment?.[selectedAssignment.id] || null }); const drillOmitted = new Set(drillRequired.omitted); const displayedAssignmentScore = assignmentOverride ? assignmentOverride.score : Object.keys(studentGrades).length ? calculateGrade(studentGrades, selectedAssignment, { supportProfile: student.profile || null }) : null; const usage = student.supportUsageByAssignment?.[selectedAssignment.id] || {}; const activity = student.assignmentActivity?.[selectedAssignment.id] || {}; return <div><div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px', flexWrap: 'wrap', alignItems: 'center', padding: '16px', marginBottom: '18px', background: usage.modified ? 'var(--mm-accent-soft)' : 'var(--mm-primary-soft)', borderRadius: '10px' }}><div><h3 style={{ margin: 0 }}>{formatStudentName(student)} · {selectedAssignment.title}</h3><div style={{ marginTop: 6 }}><StudentPerformanceBadge profile={teacherLearningProfiles[student.id]} size="small" studentName={formatStudentName(student)} /></div><div style={{ marginTop: 3, color: 'var(--mm-text-muted)', fontSize: 12 }}>Student ID {student.id}</div><div style={{ marginTop: '5px' }}>Score: <strong>{displayedAssignmentScore === null ? '—' : `${displayedAssignmentScore}%`}</strong> {usage.modified && <span style={{ marginLeft: '7px', padding: '3px 7px', borderRadius: '999px', background: '#6f2da8', color: '#fff', fontWeight: 900 }}>MOD</span>}</div><div style={{ marginTop: '5px', fontSize: '13px' }}>{activity.totalTimeSeconds ? `Total engagement ${formatTime(activity.totalTimeSeconds)} · Late engagement ${formatTime(activity.lateSeconds || 0)}` : 'Engagement time not recorded (see the support evidence report for server-timed minutes)'}</div><AssignmentGradeOverrideControls student={student} assignment={selectedAssignment} onChanged={() => setGradebookFilter((current) => ({ ...current, student: null }))} /><SectionRecoveryAuditTrail student={student} assignment={selectedAssignment} />{selectedAssignment?.dol?.enabled && <StudentDolRecoveryRow db={db} assignment={selectedAssignment} student={student} classId={student.classId || activeClass?.classId || null} viewer={{ email: user.email, isRootAdmin: user.isRootAdmin === true }} busy={dolAttemptGrantBusyKey === `${selectedAssignment.id}:students:${student.id}`} onGrant={() => handleGrantDOLAttemptForStudents(selectedAssignment, [student])} />}{(() => { const delivered = describeDeliveredRigor(classEvidenceByStudentId[student.id] || [], selectedAssignment.id); if (!delivered) return null; return <div style={{ marginTop: 8, padding: '9px 11px', borderRadius: 8, background: 'var(--mm-surface)', border: '1px solid var(--mm-border)' }}><div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--mm-text-muted)' }}>What this student was given</div><div style={{ marginTop: 3, fontSize: 12.5, color: 'var(--mm-text-strong)' }}>{delivered.summary}</div>{delivered.reasons.map((reason) => <div key={reason} style={{ marginTop: 4, fontSize: 12, color: 'var(--mm-text-muted)', lineHeight: 1.45 }}>{reason}</div>)}</div>; })()}</div><button onClick={() => openIEPReport(student)} style={{ padding: '10px 15px', border: '1px solid #6f2da8', borderRadius: '7px', background: 'var(--mm-surface)', color: 'var(--mm-accent-text)', fontWeight: 900 }}>Support evidence report</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '14px' }}>{drillRequired.workload?.status === 'applied' && <div data-reduced-workload-summary style={{ gridColumn: '1 / -1', padding: '9px 11px', borderRadius: 8, background: 'var(--mm-info-bg)', color: 'var(--mm-info-text)', fontSize: 12.5, fontWeight: 700 }}>Fewer items, same rigor: {describeWorkloadSummary(drillRequired.workload)}</div>}{getStoredAssignmentQuestions(selectedAssignment).map((question, index) => { if (!questionIsIncluded(question)) return null; if (drillOmitted.has(index)) return <article key={index} data-not-required-question={index} style={{ padding: '16px', borderRadius: '9px', background: 'var(--mm-surface)', border: '1px dashed var(--mm-border)', textAlign: 'left', color: 'var(--mm-text-muted)' }}><strong>Question {index + 1} · {question.type}</strong><div style={{ margin: '8px 0', fontSize: '15px', fontWeight: 800 }}>Not required for this student</div><div style={{ fontSize: '12px' }}>Fewer items, same rigor — not counted in the score.</div></article>; const record = normalizeQuestionRecord(studentGrades[index]); const credit = Math.round(getQuestionCredit(record) * 100); return <article key={index} style={{ padding: '16px', borderRadius: '9px', background: record.status === 'correct' ? 'var(--mm-success-bg)' : record.status === 'expired' && credit < 50 ? 'var(--mm-error-bg)' : credit >= 50 ? 'var(--mm-warning-soft)' : 'var(--mm-surface-control)', border: '1px solid rgba(0,0,0,.12)', textAlign: 'left' }}><strong>Question {index + 1} · {question.type} · Grade ×{normalizeQuestionWeight(question)}</strong><div style={{ margin: '8px 0', fontSize: '20px', fontWeight: 900 }}>{record.teacherGradeOverrideDisplay?.active ? (credit >= 100 ? 'Teacher assigned · Correct ✓' : `Teacher assigned · ${credit}%`) : record.status === 'correct' ? 'Correct ✓' : record.status === 'expired' ? credit >= 50 ? `Almost · ${credit}%` : `Incorrect · ${credit}%` : `${credit}% credit`}</div><div style={{ fontSize: '12px' }}>Attempts: {record.totalAttempts} · Time: {formatTime(record.timeSpent || 0)}</div>{record.partGrades?.length > 0 && <div style={{ marginTop: '10px' }}>{record.partGrades.map((part) => <div key={part.id} style={{ fontSize: '12px', color: part.isCorrect ? 'var(--mm-success-text)' : 'var(--mm-error-text)' }}>{part.isCorrect ? '✓' : '●'} {part.label}</div>)}</div>}<button type="button" onClick={() => openTeacherScratchpad(student.id, selectedAssignment.id, index)} style={{ marginTop: '12px', padding: '8px 11px', border: '1px solid var(--mm-border-strong)', borderRadius: '6px', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 'bold' }}>View Student Work</button>{studentGrades[index] && <button type="button" onClick={() => setResponseInspectorTarget({ studentId: student.id, assignmentId: selectedAssignment.id, questionIndex: index })} style={{ marginTop: '8px', marginLeft: '8px', padding: '8px 11px', border: '1px solid #1a73e8', borderRadius: '6px', background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', fontWeight: 'bold' }}>Inspect Response / Override Grade</button>}</article>; })}</div></div>; })()}

                {/*
                  Settings and the separate weekly Path grade stay one click
                  away instead of standing between the teacher and the grades.
                */}
                {activeClass.classId && (
                  <details className="tw-disclosure" style={{ marginTop: 22 }}>
                    <summary>Weekly learning path grade <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>a separate grade for this week&apos;s Path practice</span></summary>
                    <div className="tw-disclosure__body">
                      <WeeklyPathGradePanel
                        students={teacherWeeklyRoster}
                        goalsByStudentId={teacherWeeklyGoalsByStudent}
                        completionsByStudentId={weeklyPathCompletionsByStudent}
                        learningProfilesByStudentId={teacherLearningProfiles}
                        weekKey={weeklyPathWeekKey}
                        classId={activeClass.classId}
                        classroomLinked={Boolean(classesById[activeClass.classId]?.classroomCourseId)}
                        progressTruncated={weeklyPathTruncated}
                        weekComplete={weeklyPathWeekComplete}
                        onOpenStudent={setProfileDrawerStudentId}
                        onReviewClassroomSync={(proposal) => setClassroomSyncProposal(proposal)}
                        now={now}
                        progressState={weeklyPathProgressLoadedFor === activeClass.classId ? 'loaded' : weeklyPathProgressLoading ? 'loading' : 'unavailable'}
                      />
                    </div>
                  </details>
                )}
                <details className="tw-disclosure" style={{ marginTop: 12 }}>
                  <summary>Marking periods <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>add, close, and file assignments into marking periods</span></summary>
                  <div className="tw-disclosure__body">
                    <MarkingPeriodSettings
                      settings={gradingPeriodSettings}
                      assignments={assignmentsForSelectedClass}
                      classLabel={selectedGradebookClass?.name || selectedGradebookPeriod}
                      busy={gradingPeriodBusy || bulkBusy}
                      onCreatePeriod={handleCreateGradingPeriod}
                      onSetCurrentPeriod={handleSetCurrentGradingPeriod}
                      onSetPeriodArchived={handleSetGradingPeriodArchived}
                      onMoveSelectedAssignments={handleMoveSelectedAssignmentsToGradingPeriod}
                    />
                  </div>
                </details>
              </div>
            )}

            {teacherTab === 'gradeTransfer' && (
              <GradeTransferCenter
                onClassScopeChange={reportExportClasses}
                classes={classes}
                assignments={assignments}
                students={allStudents}
                teacherUid={auth.session?.uid || user.uid || ''}
                teacherEmail={user.email || ''}
                isRootAdmin={user.isRootAdmin === true}
                gradingPeriodSettings={gradingPeriodSettings}
                initialScope={gradeExportScope}
                onOpenGrades={(classId, assignmentId) => openGradebookFor(classId, assignmentId)}
                onOpenAssignment={(assignmentId, classId) => openAssignmentHub(assignmentId, classId)}
              />
            )}


            {responseInspectorTarget && (
              <StudentResponseInspector
                {...responseInspectorTarget}
                studentIdentityIndex={teacherStudentIdentityIndex}
                onClose={() => setResponseInspectorTarget(null)}
                onChanged={undefined}
              />
            )}
            {teacherTab === 'standards' && (
              <TexasStandardsDashboard
                // Scoped by the class bar. A mastery picture averaged across
                // five different classes is not a picture of anything a teacher
                // can act on.
                allStudents={activeClass.classId ? studentsInActiveClass : allStudents}
                assignments={assignments}
                classes={classes}
                learningProfilesByStudentId={teacherLearningProfiles}
                courseLevelByStudentId={courseLevelByStudentId}
                onOpenStudent={setProfileDrawerStudentId}
                className={classesById[activeClass.classId]?.name || 'this class'}
              />
            )}

            {teacherTab === 'analytics' && (
              <TeacherAnalyticsDashboard
                students={teacherAnalyticsStudents}
                masteryProfilesByStudentId={teacherMasteryProfilesByStudentId}
                learningProfilesByStudentId={teacherLearningProfiles}
                onOpenStudent={setProfileDrawerStudentId}
              />
            )}

            {teacherTab === 'exams' && (
              <TeacherSecureExamDashboard
                students={allStudents}
                classId={activeClass.classId || null}
                // The teacher's own Test Cycles, administered beside the
                // simulations they already run on this same secure runtime.
                testCycleAssignments={assignments.filter(isTestCycleAssignment)}
                focusedTestCycleAssignmentId={focusedTestCycleAssignmentId}
                onPreviewTestCycle={(assignment) => setTestCyclePreviewAssignment(assignment)}
              />
            )}

            {teacherTab === 'mathTools' && (
              <div>
                <h2 style={{ marginTop: 0 }}>Math Tools Lab</h2>
                <p style={{ color: 'var(--mm-ink-muted)', marginTop: '-4px' }}>
                  A preview bench for the interactive tools. These run standalone — nothing here is graded,
                  saved to a student record, or published to Google Classroom, so it is safe to experiment.
                </p>
                <MathToolsLab />
              </div>
            )}

            {teacherTab === 'classroom' && (
              <ClassroomManagerV2
                assignments={assignments}
                classes={classes}
                students={allStudents}
                teacherEmail={user.email}
                initialAssignmentId={classroomManagerAssignmentId}
              />
            )}

            {teacherTab === 'access' && <SignInAccess signedInEmail={user.email} mode="teacher" onStudentIdentityChanged={refreshTeacherRosterAfterNameChange} />}
          </div>
          </div>
        </div>
      </div>
    );
  }

  /*
   * ONE DASHBOARD MODEL, TWO SURFACES.
   *
   * Home reads `entries` (its own view, with the Resume/DOL/Warm-Up assignments
   * removed because each already has a card above the list) and the Assignments
   * Center reads `allEntries` (everything). Building it once here rather than
   * inside each branch is what guarantees the two screens agree about an
   * assignment's lifecycle, bucket and progress.
   *
   * Built in render flow rather than a useMemo because several of its providers
   * are component-scope helpers declared further down this file.
   */
  // A hoisted declaration (not a const) so the assignment workspace, defined
  // above, can ask for Up Next when a student finishes a section; it is only
  // called from render paths that run after everything it reads is set up.
  // eslint-disable-next-line no-inner-declarations
  function buildStudentDashboardNow() {
    return buildStudentDashboardModel({
      assignments,
      classId: user.classId || null,
      classPeriod: user.classPeriod,
      nowValue: now,
      tracker: gradeDisplayTracker,
      assignmentActivity,
      classworkGradesByAssignment,
      classSchedule,
      resumeAction,
      practicePassRedemptionsByAssignment: studentClassPoints.redemptionsByAssignment,
      supportProfile: user.profile || null,
      // Describes each Test Cycle by its server-written stage on Home and in
      // the Assignments Center; the card still asks the server what is open.
      testCycleGrades,
      // The one "Today" rule needs who the student is (their excusal) and
      // which closed sections have a Recovery they can take now.
      studentId: user.id,
      recoveryStateByAssignment: recoveryStatesFromSummaries(studentRecoverySummariesByAssignment),
      providers: {
        assignmentIsForStudent,
        // The teacher's per-class Classwork/Practice lock, for this student.
        getSectionAccessState,
        // Wrapped so the dashboard's own lifecycle bucketing (Do Now / In
        // Progress / Practice Only) sees this signed-in student's extension,
        // without changing the generic module's signature — the Path
        // Simulator's synthetic-student caller passes its own `providers` and
        // is unaffected.
        getAssignmentLifecycle: (assignment, nowValue) => getAssignmentLifecycle(assignment, nowValue, { studentId: user.id }),
        prerequisiteAccess,
        calculateGrade,
        getDOLState,
        getWarmupState,
        getIncludedQuestionIndices,
        normalizeQuestionRecord,
        questionIsIncluded,
        assignmentHasHeldTeacherFeedback,
        // Same wrap as getAssignmentLifecycle above, and for the same reason.
        matchesSmartView: (assignment, viewId, options) => matchesSmartView(assignment, viewId, { ...options, studentId: user.id }),
      },
    });
  }
  // The workspace's Up Next reads the same model, cached per assignment,
  // tracker and minute so a finished section does not rebuild it every render.
  // eslint-disable-next-line no-inner-declarations
  function studentUpNextDashboard() {
    const key = `${activeAssignmentId}|${Math.floor(now / 60000)}`;
    const cache = studentUpNextCacheRef.current;
    if (cache.dashboard && cache.key === key && cache.tracker === gradeDisplayTracker) return cache.dashboard;
    const dashboard = buildStudentDashboardNow();
    studentUpNextCacheRef.current = { key, tracker: gradeDisplayTracker, dashboard };
    return dashboard;
  }
  const studentDashboard = user.role === 'student' && activeView === 'dashboard'
    ? buildStudentDashboardNow()
    : null;

  if (user.role === 'student' && activeView === 'dashboard') {
    if (studentDashboardMode === 'liveChallenge') {
      return renderStudentIdentityShell(
        <>
          {renderStudentPackUpBanner()}
          {renderStudentWarmupBanner()}
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading Live Challenge…</div>}>
          <LiveChallengeStudent
            // One mount per room: a new invite is a new game, and nothing the
            // last game's screen held may be shown in it.
            key={liveChallengeInvite?.roomId || 'no-live-challenge'}
            invite={liveChallengeInvite}
            studentProfile={user.profile}
            onExit={() => setStudentDashboardMode('assignments')}
            // What the finished match put in the wallet, shown apart from
            // placement and game points.
            renderMatchRewards={(roomId, match = {}) => (
              <ChallengeRewardsEarned
                roomId={roomId}
                offered={match.offered}
                grants={studentClassPoints.grants}
                transactions={studentClassPoints.transactions}
                onOpenRewards={() => openStudentDashboardMode('rewards')}
              />
            )}
          />
          </Suspense>
        </>,
      );
    }
    if (studentDashboardMode === 'mathPath') {
      return renderStudentIdentityShell(
        <>
          {renderStudentPackUpBanner()}
          {renderStudentWarmupBanner()}
          <MyMathPathApp
          studentId={user.id}
          studentName={formatStudentName({ ...studentRecord, ...user }, { lastFirst: false, neutralLabel: STUDENT_SELF_NEUTRAL_LABEL })}
          studentProfile={adaptiveStudentProfile || user.profile}
          assignments={studentPathAssignments}
          launchTeksCode={pathLaunchTeks}
          pathOptions={studentPathOptions}
          weeklyGoalConfig={studentWeeklyGoalConfig}
          courseId={studentCourseId}
          studentRecord={studentRecord}
          onNavigate={navigateStudent}
          onExit={() => { setPathLaunchTeks(null); setStudentDashboardMode('assignments'); }}
          />
        </>,
      );
    }
    if (studentDashboardMode === 'assignmentsCenter') {
      return renderStudentIdentityShell(
        <>
          {renderStudentPackUpBanner()}
          {renderStudentWarmupBanner()}
          <StudentAssignmentsCenter
            dashboard={studentDashboard}
            gradeCenter={studentGradeCenter}
            gradingPeriodSettings={gradingPeriodSettings}
            supportPresentation={getStudentSupportPresentation(user.profile)}
            onNavigate={navigateStudent}
            onLogout={handleLogout}
            // Lands on the row's next unfinished open question.
            onContinue={(assignmentId, questionIndex) => startAssignment(assignmentId, questionIndex)}
            onOpenResult={(assignmentId) => openStudentAssignmentResult(assignmentId, { origin: 'assignments' })}
            onPractice={(assignmentId) => startAssignment(assignmentId)}
          />
        </>,
      );
    }
    if (studentDashboardMode === 'rewards') {
      return renderStudentIdentityShell(
        <>
          {renderStudentPackUpBanner()}
          {renderStudentWarmupBanner()}
          <StudentRewardsCenter
            student={{ ...studentRecord, ...user }}
            wallet={studentRewardWallet}
            classPoints={studentClassPoints}
            inventoryUnavailable={studentClassPoints.inventoryUnavailable}
            redemptions={studentClassPoints.redemptions}
            eligibleAssignments={studentPracticePassEligibleAssignments}
            onUsePracticePass={handleUsePracticePass}
            loadHistory={handleLoadRewardHistory}
            newGrantIds={newRewardIds}
            supportPresentation={getStudentSupportPresentation(user.profile)}
            onNavigate={navigateStudent}
            onLogout={handleLogout}
            nowMs={now}
          />
        </>,
      );
    }
    if (studentDashboardMode === 'grades') {
      return renderStudentIdentityShell(
        <>
          {renderStudentPackUpBanner()}
          {renderStudentWarmupBanner()}
          <StudentGradeCenter
            gradeCenter={studentGradeCenter}
            supportPresentation={getStudentSupportPresentation(user.profile)}
            onBackToHome={() => openStudentDashboardMode('assignments')}
            onNavigate={navigateStudent}
            onLogout={handleLogout}
            onOpenResult={(assignmentId) => openStudentAssignmentResult(assignmentId, { origin: 'grades' })}
            onPractice={(assignmentId) => startAssignment(assignmentId)}
          />
        </>,
      );
    }
    if (studentDashboardMode === 'testCycle' && activeTestCycleAssignmentId) {
      return renderStudentIdentityShell(
        <>
          {renderStudentPackUpBanner()}
          {renderStudentWarmupBanner()}
          <main style={{ padding: '24px 16px', maxWidth: 880, margin: '0 auto', boxSizing: 'border-box' }}>
            <Suspense fallback={<p role="status" style={{ margin: 0 }}>Opening your test…</p>}>
              <TestCycleCard
                assignmentId={activeTestCycleAssignmentId}
                studentId={user.id}
                studentProfile={user.profile}
                // The grade document is already live (onSnapshot). Its Test
                // Cycle projection changes when results are released or a
                // retest opens, and its tracker when Review answers land; the
                // card re-asks the server when either moves.
                refreshKey={testCycleCardRefreshKey}
                // Review is ordinary MathMaster instruction, so it opens the
                // ordinary runtime — restricted to the review questions.
                onOpenReview={(assignmentId) => startAssignment(assignmentId, 0, { cycleStage: 'review' })}
                onExit={openStudentAssignmentsCenter}
              />
            </Suspense>
          </main>
        </>,
      );
    }
    if (studentDashboardMode === 'secureExams') {
      return renderStudentIdentityShell(
        <>
          {renderStudentPackUpBanner()}
          {renderStudentWarmupBanner()}
          {/* Tests & Exams teaches the same navigation as every other
              student destination (it had none of its own). */}
          <div style={{ maxWidth: 920, margin: '0 auto', padding: '16px 14px 0', boxSizing: 'border-box' }}>
            <StudentGlobalNav current={STUDENT_DESTINATION.SECURE_EXAMS} onNavigate={navigateStudent} />
          </div>
          <StudentSecureExamDashboard
          studentProfile={user.profile}
          onExit={() => setStudentDashboardMode('assignments')}
          // A course Test/Retest is entered through its assignment card, which
          // is the only thing that knows which stage is open.
          onOpenCourseTest={(assignmentId) => startAssignment(assignmentId)}
          />
        </>,
      );
    }

    const supportPresentation = getStudentSupportPresentation(user.profile);
    // Computed by a module rather than inline, so the Teacher Path Simulator
    // can build the same dashboard from a synthetic learner without a second
    // copy of this logic drifting away from it. Shared with the Assignments
    // Center above rather than rebuilt here.
    const dashboard = studentDashboard;
    // "Caught up" is only valid after class assignments and the frozen
    // Weekly Path commitment have both been checked.
    const studentNextAction = resolveNextAction({
      dashboard,
      weeklyProgress: studentWeeklyPathProgress,
    });
    return renderStudentIdentityShell(
      <>
        {renderStudentPackUpBanner()}
        {/* No Warm-Up banner on Home: the next-action card (or its compact
            Warm-Up card) is the one place the Warm-Up is offered here. */}
        <StudentDashboardView
        dashboard={dashboard}
        // Never the student's support status: Home is read over shoulders.
        student={{ ...studentRecord, ...user }}
        onOpenResult={(assignmentId) => openStudentAssignmentResult(assignmentId, { origin: 'assignments' })}
        saveStatus={describeSaveStatus({
          persistenceStatus: studentPersistenceStatus,
          outboxDepth: studentOutboxDepth,
          pendingGradeCount: studentPendingGradeCount,
          online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
        })}
        whatChangedPanel={renderWhatChangedPanel(true)}
        supportPresentation={supportPresentation}
        classroomSyncStatusByAssignment={classroomSyncStatusByAssignment}
        onStartAssignment={startAssignment}
        onExportAssignmentPdf={exportAssignmentWorksheetPdf}
        onOpenMathPath={() => setStudentDashboardMode('mathPath')}
        onNavigate={navigateStudent}
        // The one thing this student should do next, decided by the model
        // rather than left for them to work out from six equal panels.
        nextAction={studentNextAction}
        liveChallengeInvite={liveChallengeInvite}
        onOpenLiveChallenge={() => setStudentDashboardMode('liveChallenge')}
        onLogout={handleLogout}
        classPoints={studentClassPoints}
        rewardWallet={studentRewardWallet}
        hasNewRewards={newRewardIds.size > 0}
        onOpenRewards={() => openStudentDashboardMode('rewards')}
        recommended={{
          student: studentRecord,
          assignments: studentPathAssignments,
          courseId: studentCourseId,
          pacing: studentPacing,
          pathOptions: studentPathOptions,
          onChooseSkill: handleChooseSkill,
        }}
        />
      </>,
    );
  }

  /*
   * ASSIGNMENT RESULT.
   *
   * Reached three ways, and all three land on the same screen reading the same
   * entry: a Grade Center row, a closed Google Classroom deep link, and browser
   * Back from practice. `assignmentResultRoute` holds the launch context
   * (which section the Classroom post covered) and nothing about the grade —
   * the grade comes from the Grade Center model, so this screen and the list
   * that linked to it cannot show different numbers.
   */
  if (user.role === 'student' && activeView === 'assignmentResult' && assignmentResultRoute) {
    const resultEntry = findGradeCenterEntry(studentGradeCenter, assignmentResultRoute.assignmentId);
    // The Today rule for this assignment and what comes after it: the result
    // page is where "nothing open now" lands, so it says what opens when and
    // hands off to Up next.
    const resultDashboard = buildStudentDashboardNow();
    const resultTodayEntry = resultDashboard?.allEntries.find((entry) => entry.assignment.id === assignmentResultRoute.assignmentId) || null;
    const resultUpNext = resolveUpNext({ dashboard: resultDashboard, assignmentId: assignmentResultRoute.assignmentId });
    const resultSectionLabel = assignmentResultRoute.sectionKey && assignmentResultRoute.sectionKey !== 'whole'
      ? assignmentResultRoute.sectionLabel || assignmentResultRoute.sectionKey
      : null;
    const recoveryAssignment = assignments.find((item) => item.id === assignmentResultRoute.assignmentId) || null;
    const openRecoveryEntry = recoverySession?.assignmentId === assignmentResultRoute.assignmentId
      ? studentRecoverySummary.find((entry) => entry.section === recoverySession.section) || null
      : null;
    if (recoveryAssignment && openRecoveryEntry) {
      return renderStudentIdentityShell(
        <Suspense fallback={<p role="status" style={{ padding: 24, margin: 0 }}>Opening Recovery…</p>}>
          <SectionRecoveryRunner
            mode={recoverySession.mode}
            assignment={recoveryAssignment}
            entry={openRecoveryEntry}
            studentId={user.id}
            studentProfile={user.profile}
            onExit={() => setRecoverySession(null)}
            onRecord={(section, record) => mergeSectionRecoveryRecord(recoveryAssignment.id, section, record)}
            onStartAssessment={(section) => startStudentRecovery(recoveryAssignment.id, section)}
          />
        </Suspense>,
      );
    }
    return renderStudentIdentityShell(
      <>
        {renderStudentPackUpBanner()}
        {renderStudentWarmupBanner()}
        <StudentAssignmentResult
          entry={resultEntry}
          sectionLabel={resultSectionLabel}
          supportPresentation={getStudentSupportPresentation(user.profile)}
          onReviewWork={(assignmentId) => startAssignment(assignmentId, assignmentResultRoute.questionIndex, { returnToResult: true })}
          onPractice={(assignmentId) => startAssignment(assignmentId, assignmentResultRoute.questionIndex, {
            // A split Classroom post practises its own section; a whole-assignment
            // post practises the whole assignment. Keep the result route so the
            // visible Back control returns here after practice.
            sectionKey: resultSectionLabel ? assignmentResultRoute.sectionKey : null,
            returnToResult: true,
          })}
          onViewAllGrades={openStudentGradeCenter}
          onViewAllAssignments={openStudentAssignmentsCenter}
          todayEntry={resultTodayEntry}
          upNext={resultUpNext}
          // New work, not a return trip: no returnToResult.
          onContinue={(assignmentId, questionIndex) => startAssignment(assignmentId, questionIndex)}
          onUpNext={(next) => (next.opensResult
            ? openStudentAssignmentResult(next.assignment.id, { origin: assignmentResultRoute.origin || 'assignments' })
            : startAssignment(next.assignment.id, next.questionIndex ?? 0))}
          origin={assignmentResultRoute.origin || 'assignments'}
          onBackToHome={() => openStudentDashboardMode('assignments')}
          recoveryPanel={studentRecoverySummary.length ? (
            <SectionRecoveryPanel
              summary={studentRecoverySummary}
              busySection={recoveryBusySection}
              onPractice={(section) => setRecoverySession({ assignmentId: assignmentResultRoute.assignmentId, section, mode: 'practice' })}
              onStart={(section) => startStudentRecovery(assignmentResultRoute.assignmentId, section)}
              onContinue={(section) => setRecoverySession({ assignmentId: assignmentResultRoute.assignmentId, section, mode: 'assessment' })}
            />
          ) : null}
        />
      </>,
    );
  }

  if (isStudentAssignment) {
    return renderStudentIdentityShell(renderAssignmentWorkspace(false));
  }

  return null;
}

export default App;

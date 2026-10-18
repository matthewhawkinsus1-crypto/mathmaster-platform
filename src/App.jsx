import { Fragment, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
// Stylesheets that must link before App.css, in 805b69e2's order
// (app/shell/leadingStyles.js says why and how).
import './app/shell/leadingStyles.js';
import './App.css';
import {
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
import { clearDraftSaveProblems, describeDraftSaveProblems, draftSaveProblemsFor, subscribeDraftSaveHealth } from './platform/persistence/draftSaveHealth.js';
import { SUBMISSION_NOT_QUEUED } from './platform/student/submissionNotQueued.js';
import { readLatestWorkspaceResume, readWorkspaceDraft, writeWorkspaceDraft } from './platform/persistence/workspaceDraftStore.js';
import { readWorkspaceDraftEntries, selectRestorableDraftEntries } from '../functions/shared/workspaceDraftSchema.mjs';
import { canonicalResponseSavedAt } from './platform/persistence/canonicalResponseTime.js';
import { adoptCanonicalAdvances } from './platform/persistence/canonicalTrackerReconciliation.js';
import { applyWarmupTeacherControl, resolveAuthoritativeClose, resolveWarmupInstructionDateKey } from '../functions/shared/sectionDeadline.mjs';
import useEngagementLedger from './platform/supportEvidence/useEngagementLedger.js';
import StudentSupportTools from './components/student/StudentSupportTools.jsx';
import { recordStudentSupportEvidence as saveStudentSupportEvidence } from './platform/supportEvidence/supportEvidenceStore.js';
import { launchSupportRecords, studentMayRecordSupport, usedRecordKey } from './platform/supportEvidence/studentSupportTelemetry.js';
import { buildDolAttemptGrant, buildDolClose, buildDolDateMove, buildDolExtension, buildDolScheduleRestore, buildDolWindowOpening, scheduledDolDateFor, summarizeStudentRecovery } from './platform/assessment/assessmentRecovery.js';
import { practiceSkillLaunch } from './platform/assessment/practiceSkillLaunch.js';
import { describeDolClose } from './platform/assessment/dolCloseCopy.js';
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
} from './classroomApi';

// Whether a question can come back as a different question is the one piece
// of the generator App needs while it renders. The generator itself, with the
// math engine (mathjs) under it, loads when a student prints a worksheet: a
// static import put mathjs in every student's first load before Home.
import { canGenerateDistinctVariants as isPersonalizedBlueprint } from '../functions/shared/questionVariability.mjs';
import { buildStudentFamilyContext, readLocalDeliveryPin, writeLocalDeliveryPin } from './platform/generation/familyDelivery.js';
import { familySlotKey, isFamilyBackedQuestion } from '../functions/shared/questionFamilyInstance.mjs';
import { normalizeDeliveryPin } from '../functions/shared/questionGenerationIdentity.mjs';
import {
  fetchAssignmentsById,
  fetchStudentAssignments,
  individuallyAssignedTestCycleIds,
  markIndividuallyAssigned,
  mergeStudentAssignments,
  priorWorkAssignmentIds,
  subscribeStudentClassAssignments,
  workedAssignmentKey,
} from './platform/assignments/studentAssignmentScope.js';
import { EMPTY_STUDENT_CONTROLS, STUDENT_CONTROLS_STATUS, projectStudentAssignments, sameTimingProfile } from './platform/assignments/studentAssignmentControls.js';
import { resolveStudentOverride } from '../functions/shared/studentAssignmentOverrides.mjs';
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
  normalizeQuestionRecord,
  recordQuestionAttempt,
  recordQuestionStep,
  requestReplacementQuestion,
  resolveQuestionMaximumAttempts,
  resolveQuestionReplacementAllowed,
  resolveTeacherGrantedExtraAttempts,
} from './attemptPolicy';

import {
  buildQuestionDraftKey,
  clearResumeAction,
  questionDraftSavedAt,
  readResumeAction,
  reconcileFieldRecordDrafts,
  reconcileToolWorkspaceDrafts,
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
  // The plain function, under another name: App binds `getSectionAccessState`
  // to the signed-in student's own grades below (sectionAccessForStudent).
  getSectionAccessState as getSectionAccessStateForAnyone,
  getSectionVariantMode,
  localDateKey,
  normalizeSchedule,
  prerequisiteAccess,
  recordAssignmentActivity,
  sectionAccessForStudent,
  getCurrentContentQuestionIndices,
  getIncludedQuestionIndices,
  questionIsIncluded,
  studentAssignmentIndicesWithPracticePass,
  studentDueDateLines,
  studentExtraTimeDolOpen,
  studentRequiredQuestions,
} from './assignmentLifecycle';
import { HEARTBEAT_INTERVAL_MS, buildLiveStatus, encodeQuestionStates } from './livePresence';
import { helpRequestAfterClose, helpRequestFields, nextHelpRequest } from './platform/supports/helpRequest.js';
import { useAskMyTeacher } from './platform/supports/useAskMyTeacher.js';
import { questionFor } from './platform/supports/askTeacher.js';
import TeacherAnswers from './components/student/TeacherAnswers.jsx';
import { TeacherAnswersList } from './components/student/TeacherAnswersList.jsx';
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

import { TEXAS_MATH_ACTIVE_COURSES, getTexasStandardsForCourse } from './texasStandards.js';
import QuestionAnnouncer from './components/common/QuestionAnnouncer.jsx';
import Dialog from './ui/Dialog.jsx';
import { MAIN_CONTENT_ID, SkipToContent, pageTitleFor, useDocumentTitle } from './components/common/pageChrome.jsx';
import { subscribeToReadingActivity } from './components/common/readingActivity.js';

import DOLCountdown from './components/student/DOLCountdown.jsx';
import SectionTimeLeft from './components/student/SectionTimeLeft.jsx';
import {
  outcomeWithheld,
  QUESTION_STATUS,
  SECTION_ACCESS,
  describeNavigatorQuestion,
  describeNavigatorSectionProgress,
  describeSectionAccess,
  sectionLandingEntry,
} from './platform/student/assignmentNavigator.js';
import { SR_ONLY_STYLE } from './ui/srOnly.js';

import { useToast } from './ui/Toast';
import { prefetchQuestionResources } from './platform/performance/questionPrefetch.js';
import { measurePerformanceOperation, startPerformanceSpan } from './platform/performance/performanceTelemetry.js';
import {
  createDurableAction,
  drainDurableActions,
  enqueueDurableAction,
  isGradeBearingAction,
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
import { buildStudentMasteryProfile, collectStudentEvidence } from './masteryEngine.js';
import {
  getEffectiveActivityPolicy,
  resolveQuestionActivityRole,
} from './platform/policies/activityPolicies';
import { matchesSmartView } from './assignmentSmartViews';
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
import { assignmentFolderMatches, normalizeFolderPath, normalizeFolderPaths, renameFolderPath } from './assignmentFolders';

import { isDesktopStickyLayout, revealBelowSticky } from './platform/layout/stickyReveal.js';
import {
  getStoredAssignmentQuestions,
  prepareAssignmentForRuntime,
  getStoredSectionVariantModes,
} from './platform/contract/storedAssignmentV5.js';
import {
  contentVersionOf,
} from './platform/assignments/assignmentContentVersion.js';
import {
  projectCurrentAssignmentContent,
  resolveCurrentContentStorageIndex,
} from './platform/assignments/currentContentProjection.js';
import { buildCurrentContentPortablePackage } from './platform/assignments/currentContentPortableAssignment.js';
import { normalizeLessonPublishingIntentV5 } from './platform/authoring/lessonPublishingIntent.js';
import { normalizeContextualQuestion } from './platform/context/wordProblemLayer';
import { buildAttemptEvidenceEvent } from './platform/history/evidenceEvent.js';

import { teksCodeFromSkillId } from './platform/path/skillGraph.js';
import { buildStudentPathOptions } from './platform/path/studentPathOptions.js';
import { resolveAssignmentPathLaunch } from './platform/path/assignmentPathLaunch.js';
import { LEVEL as NAV_LEVEL, normalizeOrigin, resolveBack } from './platform/student/navigationModel.js';
import { OPEN_NOTICE, describeOpenNotice, teacherClosedState } from './platform/student/studentOpenGate.js';
import { subscribeStudentServerMasteryProfiles } from './platform/mastery/serverMasteryProfiles.js';
import { fetchStudentEvidenceEvents } from './platform/history/evidencePersistence.js';
import { splitGrade, splitGradesBySection } from './platform/teacher/gradeEvidence.js';
import { projectTeacherOverridesForDisplay } from './platform/grading/canonicalGradeProjection.js';
import { projectSectionRecoveriesForDisplay } from './platform/grading/sectionRecoveryGrades.js';
import { classroomLaunchTarget, parseClassroomLaunchSearch } from './platform/classroom/classroomLaunchRoute.js';
import { buildStudentDashboardModel, resolveNextAction, resolveUpNext } from './studentDashboardModel.js';
import { resolveAssignmentHandoff, resolveSkippedQuestion } from './platform/student/assignmentHandoff.js';
import { questionIsTerminal, timedSectionWorkableNow } from './platform/student/studentWorkState.js';
import WhatChangedList from './components/student/WhatChangedList.jsx';
import {
  buildWhatChanged, countUnseenWhatChanged, markWhatChangedSeen, readWhatChangedSeenAt, rememberWhatChangedFirstSeen, untimedWhatChangedKeys,
} from './platform/student/whatChangedModel.js';
import { describeLogoutRisk } from './platform/student/logoutGuard.js';
import { shouldShowDolOpenReminder } from './platform/student/dolReminder.js';
import { describeRuntimeSaveLine, describeSaveStatus, initialSaveSubject, nextSaveSubject } from './platform/student/saveStatusModel.js';
import { buildWaysToRaise, countWaysToRaise } from './platform/student/waysToRaiseModel.js';
import { loadMyReviewWork } from './services/reviewMyWorkService.js';
import { buildRecoverySummariesByAssignment, recoveryStatesFromSummaries } from './platform/student/recoveryStates.js';
import { buildTestCycleCardRefreshKey } from './platform/student/testCycleDiscovery.js';
import {
  readRouteOwner,
  readStudentRouteState,
  studentRouteKey,
  writeStudentRouteState,
} from './platform/student/browserHistory.js';
import { resetAddressToHome, studentUrlFor, teacherUrlFor } from './app/routes/browserUrl.js';
import { parseAppPath } from './app/routes/appUrl.js';
import { ARRIVAL_MESSAGES, readUrlArrival } from './app/routes/urlArrival.js';
import { useUrlArrival } from './app/routes/useUrlArrival.js';
import { describeFeedbackRelease, releaseHoldReport } from './app/teacher/feedbackReleaseHold.js';
import { readReleaseControls } from './app/teacher/feedbackReleaseControls.js';
import { questionAddressFor, studentQuestionEntries } from './app/routes/questionAddress.js';
import {
  DISPLAYED_CHECKPOINT_OUTCOMES,
  activityTitleForRole,
  assignmentFeedbackWasReleased,
  assignmentHasHeldTeacherFeedback,
  assignmentUsesTeacherReleasePolicy,
  calculateDOLSectionScore,
  captureTimedSectionAccess,
  createEmptyAssignmentTracker,
  createPracticeAssignmentTracker,
  warmupCaptureWasActive,
} from './app/student/assignmentRuntimeHelpers.js';
import {
  CLASS_SCOPED_TABS,
  NO_RECOVERY_OPPORTUNITIES,
  RECOVERY_ANNOUNCEMENT_MODES,
  RECOVERY_DISCOVERY_ALL,
  TEACHER_CROSS_CLASS_TABS,
  TEACHER_FULL_STUDENT_DATA_TABS,
  TEACHER_PARENT_CONTACT_STREAM_TABS,
  TEACHER_SESSION_SUMMARY_TABS,
  TEACHER_SUPPORT_STREAM_TABS,
} from './app/screenScopes.js';
// Every screen loaded on demand (one chunk each), and the teacher-only
// panels, each with its own Suspense boundary (lazyScreens.js).
import {
  LiveChallengeStudent,
  MyMathPathApp,
  QuestionEngine,
  ReviewMyWork,
  SectionRecoveryRunner,
  StudentSecureExamDashboard,
  TeacherQuestionReviewPanel,
  TeacherWorkspace,
  TestCycleCard,
  WarmupChallengeGate,
} from './app/lazyScreens.js';
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
import { isSecureExamActive, useSecureExamActive } from './platform/assessment/secureExamPresence.js';
import { getAssignmentEvidenceSummary, manageAssignmentLifecycle } from './services/assessmentLifecycleService.js';
import StudentGlobalNav, { STUDENT_DESTINATION } from './components/student/StudentGlobalNav.jsx';
import StudentAssignmentResult from './components/student/StudentAssignmentResult.jsx';
import SectionRecoveryPanel from './components/student/SectionRecoveryPanel.jsx';
import { buildStudentRecoverySummary } from './platform/recovery/studentRecoveryModel.js';
import {
  buildStudentRecoveryDiscovery,
  groupRecoveryOpportunitiesByAssignment,
  markRecoveryNotified,
  markRecoverySeen,
  recoveryNotice,
  recoveryWasNotified,
} from './platform/recovery/studentRecoveryDiscovery.js';
import { RecoveryInlineNotice } from './components/student/RecoveryOpportunities.jsx';
import { recoveryErrorCode, startSectionRecovery } from './services/sectionRecoveryService.js';
import StudentIdentityBar, { STUDENT_IDENTITY_STACK_OFFSET } from './components/student/StudentIdentityBar.jsx';
import { ASSIGNMENT_NAV_HEIGHT_VAR, stickyHeightRef } from './platform/layout/stickyHeightRef.js';
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
import { useGrowthRewardSync } from './platform/rewards/useGrowthRewardSync.js';

import {
  assignmentIsExcusedForStudent,
  buildStudentGradeCenter,
  findGradeCenterEntry,
} from './platform/student/studentGradeCenterModel.js';
import {
  GRADING_PERIOD_SETTINGS_DOC,
  gradingPeriodAssignmentPatch,
  normalizeGradingPeriodSettings,
} from './platform/student/gradingPeriods.js';
import {
  ROUTE_EVENTS, buildRouteEvent, fetchClassPacing, fetchSkillOverrides, fetchWeeklyGoalSettings, fetchTeacherWeeklyPathCompletions, fetchStudentWeeklyPathGoalSnapshot, fetchMyWeeklyPathCompletions,
  interventionAsOverride, logRouteEvent, overridesForClassContext, saveClassPacing, saveSkillOverrides, saveWeeklyGoalSettings,
  setStudentPathIntervention, storedPacingForClassContext, storedWeeklyGoalForClassContext,
  subscribeStudentPathIntervention,
} from './platform/path/pathStore.js';
import { buildWeeklyPathPlan } from './platform/path/weeklyPathPlan.js';
import { buildTeacherWeeklyView, buildWeeklyGoal, dueAtFor, evaluateWeeklyGoalProgress, normalizeWeeklyGoalConfig, weekKeyFor, weeklyPlanClassInputs } from './platform/path/weeklyPathGoal.js';
import {
  blobToBase64,
  generateLessonNotesPdfBlob,
} from './platform/resources/pdfLoaders.js';
import { PRINT_OUTPUT_MODES } from './platform/resources/printOutputModes.js';
import { buildAssignmentWorksheetModel, buildTeacherAssignmentWorksheetModel, downloadAssignmentWorksheetPdf } from './platform/resources/pdfLoaders.js';
import { defaultAssignmentDateInputs } from './platform/assignments/assignmentDateDefaults.js';
import {
  assignmentNeedsStudentForWorksheet,
  eligibleStudentsForTeacherWorksheet,
} from './platform/resources/teacherWorksheetEligibility.js';
import {
  classroomPostingMode,
  mappedCourseIdsForAssignment,
  shouldAutoPublishClassroomPackage,
} from './platform/classroom/automaticClassroomPublishing.js';
import { automaticClassroomTopicName } from './platform/classroom/classroomTopicNaming.js';
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
// buildAttendanceCorrectionReviewEvent was called by "Keep current extension"
// and "Apply shorter extension" without being imported — a ReferenceError that
// made every attendance correction review impossible to resolve.
import { buildAttendanceCorrectionReviewEvent } from './platform/attendance/returnCheckIn.js';
import { resolveReturnCheckIns } from './platform/attendance/returnCheckIn.js';
import { buildTeacherActionItems, openTeacherActionCount } from './platform/teacher/teacherActionCenter.js';
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
  normalizeCourseProfiles,
} from './platform/rigor/courseRigor.js';
import SessionGate from './app/shell/SessionGate.jsx';
import { focusScreenHeading, screenAnnouncement, screenChangeMovesFocus, studentScreenKey } from './app/shell/screenChange.js';
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

  // Growth, effort and mastery rewards (Retest improvement, Corrections,
  // weekly Path goal, mastery milestones) are re-derived by the server from
  // the student's own records, once per session (functions/lib/growthRewards.js).
  useGrowthRewardSync(user?.id, { uid: user?.uid, enabled: user?.role === 'student' && Boolean(user?.classId) });

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
  // A Classroom link that could not be read: said once a student is signed
  // in (NAV-11), instead of only in the console.
  const [classroomLaunchInvalid, setClassroomLaunchInvalid] = useState(false);
  // The address the page was opened at — a reload, a bookmark, a shared link
  // or a deep link waiting through sign-in (app/routes/urlArrival.js). Held
  // until an account has loaded, then opened through the same functions a
  // click calls; until then the history writers leave the address alone.
  const [urlArrival, setUrlArrival] = useState(() => (
    typeof window === 'undefined'
      ? null
      : readUrlArrival({ pathname: window.location.pathname, search: window.location.search })
  ));
  // My Math Path's tab or session from an arrival, handed to MyMathPathApp
  // when it mounts; cleared once the student leaves My Math Path.
  const [mathPathArrival, setMathPathArrival] = useState(null);
  // An account was signed in on this page. If it goes — Log Out, an expired
  // Classroom lease, another tab — the address it left is not the next
  // person's deep link.
  const signedInOnThisPageRef = useRef(false);
  useEffect(() => {
    if (auth.status === 'ready') signedInOnThisPageRef.current = true;
    if (auth.status === 'signedOut' && signedInOnThisPageRef.current) {
      setUrlArrival(null);
      resetAddressToHome();
    }
  }, [auth.status]);
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
      setClassroomLaunchInvalid(true);
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
  // The server mastery profile: the one mastery source the Path map, Recommended
  // and the wheel all read (platform/mastery/unifiedMastery.js).
  const [studentServerMasteryProfiles, setStudentServerMasteryProfiles] = useState(null);
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
  // Which My Math Path tab a "Practise this skill" link from a test review opens.
  const [pathLaunchTab, setPathLaunchTab] = useState(null);
  const [activeAssignmentId, setActiveAssignmentId] = useState(null);
  const [tracker, setTracker] = useState({});
  const [studentOutboxDepth, setStudentOutboxDepth] = useState(0);
  // Grade-bearing work is counted separately: a pending checkpoint is not a
  // reason to worry a student, and a pending Submit is.
  const [studentPendingGradeCount, setStudentPendingGradeCount] = useState(0);
  const [studentNeedsReviewCount, setStudentNeedsReviewCount] = useState(0);
  const [studentPersistenceStatus, setStudentPersistenceStatus] = useState('idle');
  // Unfinished work this device could not save, or the backup could not take
  // (draftSaveHealth.js). Bumped on every change; the line below reads it.
  const [draftSaveHealthVersion, setDraftSaveHealthVersion] = useState(0);
  useEffect(() => subscribeDraftSaveHealth(() => setDraftSaveHealthVersion((value) => value + 1)), []);
  // A shared Chromebook: the next student never inherits this one's notice.
  useEffect(() => () => { clearDraftSaveProblems(); }, [user?.id]);
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
  const [assignmentNavigationCollapsed, setAssignmentNavigationCollapsed] = useState(true);
  const [assignmentOverviewExpanded, setAssignmentOverviewExpanded] = useState(false);
  // The phone's status chip (pass 3, NAV-5) and why a locked section tab
  // cannot open (RUN-8): both belong to one assignment, and close with it.
  const [assignmentStatusOpenFor, setAssignmentStatusOpenFor] = useState(null);
  const [sectionLockNote, setSectionLockNote] = useState(null);
  const assignmentQuestionStageRef = useRef(null);
  // A restore's cursor belongs to the question it was read on (draftRestoreFocus):
  // another question, or another assignment, opens as any question opens.
  useEffect(() => {
    currentQuestionIndexRef.current = currentQuestionIndex;
    setDraftRestoreFocus(null);
  }, [currentQuestionIndex, activeAssignmentId]);

  // THE NAVIGATOR STARTS COMPACT, ON EVERY SIZE (pass 3, RUN-7).
  // One row — back, where you are, Previous/Next — leaves the work the
  // screen; "Show progress" opens the section tabs and question numbers, and
  // "Focus view" folds them again. Every open path resets it to compact. (It
  // used to start full and compact only once the window scrolled, which a
  // phone's never does: 179px of navigator stayed above every phone question.)
  //
  // Folding or opening it keeps the work where it was on screen: the page is
  // scrolled by however far the toggle moved the work, so "Focus view" no
  // longer sends a graph further down the page.
  const navigationToggleAnchorRef = useRef(null);
  const assignmentWorkElement = () => assignmentQuestionStageRef.current?.querySelector('[data-work-view-focus="true"]')
    || assignmentQuestionStageRef.current?.querySelector('.math-tool-workspace')
    || assignmentQuestionStageRef.current;
  const toggleAssignmentNavigation = () => {
    const work = assignmentWorkElement();
    navigationToggleAnchorRef.current = work ? { element: work, top: work.getBoundingClientRect().top } : null;
    if (!assignmentNavigationCollapsed) setAssignmentOverviewExpanded(false);
    setAssignmentNavigationCollapsed((current) => !current);
  };
  // TOASTS NEVER COVER THE ACTION BAR. Toasts lift above the action bar by its
  // height, which clears it only while the bar is stuck to the bottom of the
  // screen. With the compact navigator a short question no longer fills the
  // page, and the bar sits higher, in the flow. So the assignment screen
  // publishes how far the bar's top is from the bottom of the screen
  // (--mm-action-bar-clearance), and App.css lifts toasts by that.
  useEffect(() => {
    if (activeView !== 'assignment' && activeView !== 'teacherPreview') return undefined;
    const root = document.documentElement;
    let frame = 0;
    const publish = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const bar = [...document.querySelectorAll('.mathmaster-desktop-action-bar, .portrait-action-bar, .landscape-action-bar')]
          .find((element) => element.getBoundingClientRect().height > 0);
        const clearance = bar ? Math.max(0, Math.round(window.innerHeight - bar.getBoundingClientRect().top)) : 0;
        root.style.setProperty('--mm-action-bar-clearance', `${clearance}px`);
      });
    };
    publish();
    window.addEventListener('scroll', publish, { passive: true, capture: true });
    window.addEventListener('resize', publish);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null;
    observer?.observe(document.body);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', publish, { capture: true });
      window.removeEventListener('resize', publish);
      observer?.disconnect();
      root.style.removeProperty('--mm-action-bar-clearance');
    };
  }, [activeView, activeAssignmentId, currentQuestionIndex]);

  useLayoutEffect(() => {
    const anchor = navigationToggleAnchorRef.current;
    navigationToggleAnchorRef.current = null;
    if (!anchor?.element?.isConnected) return;
    const moved = anchor.element.getBoundingClientRect().top - anchor.top;
    if (Math.abs(moved) >= 1) window.scrollBy({ top: moved, left: 0, behavior: 'instant' });
  }, [assignmentNavigationCollapsed]);

  const [resumeAction, setResumeAction] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [classSchedule, setClassSchedule] = useState(DEFAULT_CLASS_SCHEDULE);
  const [courseProfiles, setCourseProfiles] = useState(() => defaultCourseProfiles(CLASS_PERIODS));
  const [courseProfilesSaving, setCourseProfilesSaving] = useState(false);
  const [assignmentActivity, setAssignmentActivity] = useState({});
  const [dolGradesByAssignment, setDolGradesByAssignment] = useState({});
  const [classworkGradesByAssignment, setClassworkGradesByAssignment] = useState({});
  /*
   * A LESSON WHOSE PREREQUISITE IS MET OPENS CLASSWORK AND PRACTICE EARLY
   * (job I, item 4). Every getSectionAccessState call below — Home's cards,
   * entry, the worksheet PDF, the workspace's locks and the capture proofs a
   * submission carries to the server — goes through this binding, so a
   * signed-in student's own Classwork grades decide "prerequisite met"
   * everywhere at once. A teacher (and View as Student) gets the plain
   * function: sectionAccessForStudent(null) is getSectionAccessState itself.
   * DOL, Warm-Up, quizzes and tests are never manual sections, so they never
   * open early through it.
   */
  const getSectionAccessState = useMemo(
    () => sectionAccessForStudent(user?.role === 'student' ? classworkGradesByAssignment : null),
    [user?.role, classworkGradesByAssignment],
  );
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
  // Where the Test Cycle card was opened from, so its Back names and opens
  // that screen (NAV-9). Always a normalizeOrigin value.
  const [activeTestCycleOrigin, setActiveTestCycleOrigin] = useState(NAV_LEVEL.ASSIGNMENTS);
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
  // The address last written for the student's screen, to put back with it.
  const studentBrowserUrlRef = useRef(null);
  // The account signed in now, for the history handlers: an entry another
  // account wrote is never restored (platform/student/browserHistory.js).
  const historyAccountRef = useRef(null);
  historyAccountRef.current = user?.uid || null;
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
      // The test on screen and where it was opened from (NAV-9).
      ...(studentDashboardMode === 'testCycle'
        ? { testCycleAssignmentId: activeTestCycleAssignmentId || '', origin: activeTestCycleOrigin }
        : {}),
    };
  }, [user?.role, activeView, activeAssignmentId, currentQuestionIndex, studentDashboardMode, assignmentResultRoute, activeTestCycleAssignmentId, activeTestCycleOrigin]);

  useEffect(() => {
    if (!studentBrowserRoute) {
      studentBrowserHistoryReadyRef.current = false;
      return;
    }
    // The address the page opened at has not been opened yet: writing this
    // screen now would replace it with Home before sign-in finishes.
    if (urlArrival) return;

    const current = readStudentRouteState(window.history.state);
    const currentKey = current ? studentRouteKey(current) : null;
    const targetKey = studentRouteKey(studentBrowserRoute);
    // The screen's address: ids and the question's number in its section,
    // nothing about the work (app/routes/appUrl.js).
    const url = studentUrlFor(studentBrowserRoute, {
      question: studentBrowserRoute.surface === 'assignment'
        ? questionAddressFor(
          studentQuestionEntriesFor(assignments.find((assignment) => assignment.id === studentBrowserRoute.assignmentId)),
          studentBrowserRoute.questionIndex,
        )
        : null,
      testCycleAssignmentId: studentBrowserRoute.dashboardMode === 'testCycle' ? activeTestCycleAssignmentId : null,
    });

    // Mark the document entry the student arrived on as this screen. From
    // this point onward internal navigation pushes same-document entries.
    if (!studentBrowserHistoryReadyRef.current) {
      studentBrowserHistoryReadyRef.current = true;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      const ownEntry = readRouteOwner(window.history.state) === user?.uid;
      if (currentKey !== targetKey || (url && url !== currentUrl) || !ownEntry) {
        writeStudentRouteState(studentBrowserRoute, { replace: true, url, owner: user?.uid, fresh: !ownEntry });
      }
      studentBrowserUrlRef.current = url;
      return;
    }

    // A popstate restoration changes React state AFTER the browser has already
    // moved to the matching history entry. Seeing the same key here prevents
    // that restoration from immediately pushing a duplicate entry.
    if (currentKey !== targetKey) {
      writeStudentRouteState(studentBrowserRoute, { url, owner: user?.uid });
    }
    studentBrowserUrlRef.current = url;
    // Only the route decides when to write; the rest is read for its address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentBrowserRoute, urlArrival]);
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
        if (studentBrowserRouteRef.current) writeStudentRouteState(studentBrowserRouteRef.current, { url: studentBrowserUrlRef.current, owner: historyAccountRef.current });
        toastInfo('Your test is still open', 'Use Submit test when you are finished. Your answers are saved as you type.');
        return;
      }
      const route = readStudentRouteState(event.state);
      if (!route) return;
      // An entry another account wrote (the previous student on this
      // Chromebook): never restored. This screen's entry takes its place.
      if (readRouteOwner(event.state) !== historyAccountRef.current) {
        if (studentBrowserRouteRef.current) {
          writeStudentRouteState(studentBrowserRouteRef.current, {
            replace: true, url: studentBrowserUrlRef.current, owner: historyAccountRef.current, fresh: true,
          });
        }
        return;
      }

      if (route.surface === 'assignment') {
        // Back/Forward onto a lesson the teacher has since paused or archived
        // lands on its result page, like every other way in (NAV-4).
        const closedNow = teacherClosedState(assignmentsRef.current.find((item) => item.id === route.assignmentId));
        if (closedNow) {
          setPathLaunchTeks(null);
          setActiveAssignmentId(route.assignmentId);
          setActiveClassroomSectionKey(null);
          setAssignmentResultRoute({
            assignmentId: route.assignmentId,
            sectionKey: 'whole',
            sectionLabel: null,
            questionIndex: 0,
            origin: NAV_LEVEL.ASSIGNMENTS,
            notice: describeOpenNotice({ kind: closedNow }),
          });
          setActiveView('assignmentResult');
          return;
        }
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
      // Back onto a Test Cycle restores that test and its Back (NAV-9). An
      // entry written before it carried the test falls back to the address
      // (/test-cycle/<id>); with neither, Assignments rather than a blank card.
      if (route.dashboardMode === 'testCycle') {
        const fromAddress = parseAppPath(window.location.pathname)?.extras?.testCycleAssignmentId || null;
        const testCycleId = route.testCycleAssignmentId || fromAddress;
        if (!testCycleId) {
          setActiveTestCycleAssignmentId(null);
          setStudentDashboardMode('assignmentsCenter');
          return;
        }
        setActiveTestCycleAssignmentId(testCycleId);
        setActiveTestCycleOrigin(normalizeOrigin(NAV_LEVEL.TEST_CYCLE, route.origin));
      } else {
        setActiveTestCycleAssignmentId(null);
      }
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
      // The grade document's own `profile` field, as the server reads it (D7).
      studentProfile: user.timingProfile || null,
      nowValue: studentRecoveryMinute * 60000,
    })
    : {}), [user?.role, user?.id, user?.classId, user?.classPeriod, user?.timingProfile, assignments, tracker, teacherGradeOverridesByAssignment, sectionRecoveryByAssignment, classSchedule, studentRecoveryMinute]);
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
      studentProfile: user.timingProfile || null,
    });
  }, [recoveryAssignmentId, assignments, tracker, teacherGradeOverridesByAssignment, sectionRecoveryByAssignment, user?.id, user?.classId, user?.classPeriod, user?.timingProfile, classSchedule]);

  useEffect(() => {
    if (!recoveryAssignmentId) setRecoverySession(null);
  }, [recoveryAssignmentId]);

  /*
   * EVERY OPEN RECOVERY, WHERE A STUDENT WILL SEE IT.
   *
   * The summary above exists only while View Results is open, and that was the
   * only place a Recovery could be found. Home, the Assignments Center and the
   * assignment's own header read this list instead. It is built per assignment
   * by the same summary — the original read after teacher overrides and BEFORE
   * any Recovery — so no surface offers what the panel would not. `now` is a
   * dependency because a Recovery opens when a Warm-Up or DOL window closes,
   * and the precise student clock wakes at exactly that second.
   *
   * Built only for what is on screen: every assignment on the dashboard
   * screens, and inside an assignment only that one — the tracker changes with
   * every step a student saves there, and a summary costs a few milliseconds
   * per assignment on a Chromebook.
   */
  const recoveryDiscoveryScope = user?.role !== 'student' || !user?.id
    ? null
    : activeView === 'dashboard'
      ? RECOVERY_DISCOVERY_ALL
      : (activeView === 'assignment' && activeAssignmentId) || null;
  const studentRecoveryDiscovery = useMemo(() => {
    if (!recoveryDiscoveryScope) return NO_RECOVERY_OPPORTUNITIES;
    return buildStudentRecoveryDiscovery({
      assignments: recoveryDiscoveryScope === RECOVERY_DISCOVERY_ALL
        ? assignments
        : assignments.filter((assignment) => assignment.id === recoveryDiscoveryScope),
      trackerByAssignment: projectTeacherOverridesForDisplay(tracker, teacherGradeOverridesByAssignment) || {},
      sectionRecoveryByAssignment,
      studentId: user.id,
      classId: user.classId || null,
      classPeriod: user.classPeriod,
      schedule: classSchedule,
      studentProfile: user.timingProfile || null,
      nowValue: now,
    });
  }, [recoveryDiscoveryScope, user?.id, user?.classId, user?.classPeriod, user?.timingProfile, assignments, tracker, teacherGradeOverridesByAssignment, sectionRecoveryByAssignment, classSchedule, now]);
  const studentRecoveryByAssignment = useMemo(
    () => groupRecoveryOpportunitiesByAssignment(studentRecoveryDiscovery),
    [studentRecoveryDiscovery],
  );

  // Looking at a Recovery's panel (or its runner, which sits on the same
  // route) is seeing it: its NEW mark goes, and it is never announced after.
  useEffect(() => {
    if (user?.role !== 'student' || !user?.id || !recoveryAssignmentId) return;
    studentRecoverySummary.forEach((entry) => markRecoverySeen(user.id, {
      assignmentId: recoveryAssignmentId,
      section: entry.section,
      state: entry.state,
      plan: entry.plan,
    }));
  }, [studentRecoverySummary, recoveryAssignmentId, user?.role, user?.id]);

  /*
   * A RECOVERY THAT OPENS IS ANNOUNCED — ONCE.
   *
   * Like a Test Cycle result, a Recovery opening is news a student should not
   * have to go looking for. Unlike one, it is a standing offer with an end
   * date, so it is announced at the first visit that finds it as well as the
   * moment it opens while the student is signed in (the Warm-Up or DOL window
   * closing): one quiet toast per Recovery and phase — available, then
   * unlocked — per device, while the Home card keeps it in view until the end
   * date. Only where a student chooses what to do next, never over a
   * question, a Live Challenge or a secure exam.
   */
  const recoveryAnnouncedRef = useRef(new Set());
  useEffect(() => {
    if (user?.role !== 'student' || !user?.id) return;
    if (activeView !== 'dashboard' || !RECOVERY_ANNOUNCEMENT_MODES.has(studentDashboardMode)) return;
    if (isSecureExamActive()) return;
    const fresh = studentRecoveryDiscovery.filter((opportunity) => opportunity.notify
      && !recoveryAnnouncedRef.current.has(opportunity.noticeKey)
      && !recoveryWasNotified(user.id, opportunity));
    if (!fresh.length) return;
    fresh.forEach((opportunity) => {
      recoveryAnnouncedRef.current.add(opportunity.noticeKey);
      markRecoveryNotified(user.id, opportunity);
    });
    const notice = recoveryNotice(fresh);
    if (notice) (notice.tone === 'success' ? toastSuccess : toastInfo)(notice.title, notice.message);
  }, [studentRecoveryDiscovery, activeView, studentDashboardMode, user?.role, user?.id, toastInfo, toastSuccess]);

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
        ...weeklyPlanClassInputs({ config, honors }),
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
  // "Ask my teacher" (platform/supports/helpRequest.js): rides in the
  // presence payload; publishPresenceNowRef sends it without waiting a beat.
  // useAskMyTeacher (student pass 3, D6): in class the hand (kept across a
  // reload, lowered on leaving the assignment) and the teacher's "Seen" /
  // "On my way"; out of class a question left for the teacher instead.
  const askingStudentId = user?.role === 'student' ? user.id : null;
  const askMyTeacher = useAskMyTeacher({
    studentId: askingStudentId,
    classId: user?.classId || null,
    classPeriod: user?.classPeriod || null,
    teacherEmail: askingStudentId ? user.assignedTeacherEmail || null : null,
    schedule: classSchedule,
    nowValue: now,
    assignmentId: activeAssignmentId,
  });
  const { helpRequest, setHelpRequest } = askMyTeacher;
  const publishPresenceNowRef = useRef(null);
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
  // App now mounts after an account is signed in (app/shell/AppShell.jsx), so
  // the student is known at mount. The listener still opens on the account's
  // arrival, one commit after mount, exactly as when App mounted before
  // sign-in: one subscription, never one per mount pass.
  const [accountListenersReady, setAccountListenersReady] = useState(false);
  useEffect(() => { setAccountListenersReady(true); }, []);
  const studentAssignmentControls = useStudentAssignmentControls({
    db,
    // The SESSION's student, so the listener opens beside sign-in hydration
    // rather than after it; owner-checked on every projection.
    studentId: accountListenersReady && auth.status === 'ready' && auth.session?.role === 'student' ? auth.session.studentId : null,
  });
  const studentClassAssignmentsRef = useRef([]);
  const studentPriorWorkAssignmentsRef = useRef([]);
  // Whose lessons these are, for the projection: set from the session before
  // the first lesson reaches state, and cleared with the lessons themselves.
  // `timingProfile` is the grade document's own `profile` field, exactly as the
  // server's deadline readers take it (gradeData.profile || null): the
  // student's DOL window (D7) is computed from it, never from the normalized
  // copy's fallback to the whole grade document.
  const studentViewerRef = useRef({ studentId: null, profile: null, timingProfile: null });
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
      // The student's own records, before overrides are projected onto them:
      // a per-question change is listed only while it still applies.
      trackerByAssignment: tracker,
      controlsByAssignmentId: studentAssignmentControls?.byAssignmentId || {},
      nowValue: whatChangedMinute * 60000,
      seenAt: whatChangedSeenAt,
    };
    const firstSeenByKey = rememberWhatChangedFirstSeen(user.id, untimedWhatChangedKeys(buildWhatChanged(input)), input.nowValue);
    return buildWhatChanged({ ...input, firstSeenByKey });
  }, [user?.role, user?.id, user?.classId, user?.classPeriod, assignments, testCycleGrades, teacherGradeOverridesByAssignment, tracker, studentAssignmentControls, whatChangedMinute, whatChangedSeenAt]);
  // What was last projected into state, so re-running an effect with nothing
  // new projects nothing again (every projection makes new lesson objects).
  const lastPublishedRef = useRef(null);

  /*
   * A CLASSROOM LINK THAT CANNOT OPEN SAYS SO (student pass 3, NAV-11).
   *
   * The launch waited for its assignment to arrive, forever: a link posted to
   * the wrong period, or for removed work, left the student on Home in
   * silence, and a malformed link only reached the console. Once this
   * student's lessons have settled — the same test an address waits for — a
   * launch whose assignment is not among them is cleared with the same
   * message an address gets. No timer: on slow Wi-Fi a wrong "not available"
   * for a real link would be worse than waiting.
   */
  useEffect(() => {
    if (user?.role !== 'student') return;
    if (classroomLaunchInvalid) {
      setClassroomLaunchInvalid(false);
      toastInfo('That Google Classroom link could not be opened', 'It may be incomplete or out of date. You are on your Home screen.');
      return;
    }
    if (!pendingClassroomLaunch) return;
    if (assignments.some((assignment) => assignment.id === pendingClassroomLaunch.assignmentId)) return;
    const settled = [STUDENT_CONTROLS_STATUS.READY, STUDENT_CONTROLS_STATUS.UNAVAILABLE].includes(studentAssignmentControls.status)
      && lastPublishedRef.current?.[4] === studentAssignmentControls;
    if (!settled) return;
    toastInfo(ARRIVAL_MESSAGES.studentStale.title, ARRIVAL_MESSAGES.studentStale.body);
    setPendingClassroomLaunch(null);
    // toastInfo is stable for the session (ToastProvider).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, pendingClassroomLaunch, classroomLaunchInvalid, assignments, studentAssignmentControls]);
  const publishStudentAssignments = () => {
    const { studentId, profile, timingProfile } = studentViewerRef.current;
    // The controls stay at index 4: URL arrival reads lastPublishedRef.current[4].
    const inputs = [studentClassAssignmentsRef.current, studentPriorWorkAssignmentsRef.current, studentId, profile, studentControlsRef.current, timingProfile];
    if (lastPublishedRef.current && inputs.every((input, index) => input === lastPublishedRef.current[index])) return;
    lastPublishedRef.current = inputs;
    setAssignments(projectStudentAssignments({
      assignments: mergeStudentAssignments(studentClassAssignmentsRef.current, studentPriorWorkAssignmentsRef.current),
      studentId,
      profile,
      timingProfile,
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
    studentViewerRef.current = { studentId: null, profile: null, timingProfile: null };
    teacherSharedAssignmentsRef.current = [];
    lastPublishedRef.current = null;
    setAssignments([]);
  };

  // A changed control, a newly read scope, or a profile revision re-projects
  // the lessons already held: no listener is re-opened for it.
  useEffect(() => {
    if (user?.role === 'student' && user.id) {
      studentViewerRef.current = { studentId: user.id, profile: user.profile || null, timingProfile: user.timingProfile || null };
      publishStudentAssignments();
    } else if (user?.role === 'teacher') {
      publishTeacherAssignments();
    }
    // The publishers read refs; these are what change their answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.id, user?.profile, user?.timingProfile, studentAssignmentControls, teacherClassControls]);

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
  // A Test the student was added to on their own is one of them too, from the
  // moment the server says so and before they have done anything on it.
  const studentIndividualTestIds = user?.role === 'student' ? individuallyAssignedTestCycleIds(testCycleGrades) : [];
  const studentIndividualTestKey = studentIndividualTestIds.join('|');
  const studentWorkedAssignmentKey = user?.role === 'student' ? workedAssignmentKey(tracker, studentIndividualTestIds) : '';
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
        studentPriorWorkAssignmentsRef.current = mergeStudentAssignments(
          studentPriorWorkAssignmentsRef.current,
          markIndividuallyAssigned(fetched, studentIndividualTestKey ? studentIndividualTestKey.split('|') : []),
        );
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
      // Server-counted completions: the rule the teacher table and Classroom use.
      fetchMyWeeklyPathCompletions({ weekKey: currentWeekKey }),
    ]).then(([goal, weeklyFacts]) => {
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

      const completions = weeklyFacts?.completions || [];
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
      setStudentServerMasteryProfiles(null);
      return undefined;
    }
    return subscribeStudentServerMasteryProfiles({
      studentId: user.id,
      onChange: setStudentServerMasteryProfiles,
      onError: (error) => console.error('Server mastery profile failed to load:', error),
    });
  }, [user?.role, user?.id]);

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
    serverMasteryProfiles: studentServerMasteryProfiles,
  }), [studentRecord, studentPathAssignments, studentCourseId, studentStoredPacing, studentOverrides, studentServerMasteryProfiles]);

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
    // One name for both posts, so the resources and the assignment land in the
    // same topic — renamed "Week of …" when the teacher chose week topics.
    const topicName = automaticClassroomTopicName(assignment);
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
        topicName,
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
      topicName,
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
    repairAssignmentTrackerForCurrentGrader,
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
    // The grader repair is teacher-only and grades with the full math engine,
    // so it loads here, when the Grades tab first needs it, and not with Home.
    const { repairAssignmentTrackerForCurrentGrader } = await import('./platform/assignment/liveQuestionCorrection.js');
    const correctedAt = new Date().toISOString();
    const repairs = (Array.isArray(students) ? students : []).map((student) => {
      const result = repairGradesByAssignmentWithCurrentGrader({
        repairAssignmentTrackerForCurrentGrader,
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
    .map((studentDoc) => ({ id: studentDoc.id, ...studentDoc.data(), profile: normalizeStudentProfile(studentDoc.data()?.profile || studentDoc.data()), timingProfile: studentDoc.data()?.profile || null }))
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

  // WHAT THE SAVE LINE IS ABOUT: a draft, or an answer the student sent
  // (RUN-11, saveStatusModel.js). Derived during render so "Answer recorded"
  // appears with the drain that recorded it, then committed.
  const [studentSaveSubjectState, setStudentSaveSubject] = useState(initialSaveSubject);
  const studentSaveSubject = nextSaveSubject(studentSaveSubjectState, { type: 'status', status: studentPersistenceStatus, pendingGradeCount: studentPendingGradeCount });
  useEffect(() => {
    if (studentSaveSubject !== studentSaveSubjectState) setStudentSaveSubject(studentSaveSubject);
  }, [studentSaveSubject, studentSaveSubjectState]);
  const studentSaveLine = describeRuntimeSaveLine({ persistenceStatus: studentPersistenceStatus, subject: studentSaveSubject, outboxDepth: studentOutboxDepth, pendingGradeCount: studentPendingGradeCount });
  // What the save line says aloud: only when the student must act.
  const studentSaveLineAnnouncement = studentPersistenceStatus === 'rejected'
    ? 'This change was not accepted because the assignment is no longer available.'
    : ['offline', 'needs-review'].includes(studentPersistenceStatus) ? studentSaveLine || '' : '';
  const markAnswerSent = () => setStudentSaveSubject((current) => nextSaveSubject(current, { type: 'answer-sent' }));
  // The line is about this student's work in this assignment: it starts over
  // when either changes.
  useEffect(() => {
    setStudentSaveSubject(initialSaveSubject());
  }, [activeAssignmentId, user?.id]);
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
          // A secure Test this student was added to on their own.
          individualAssignmentIds: individuallyAssignedTestCycleIds(studentData.testCycleGrades),
        });
        if (cancelled) return;
        const studentProfile = normalizeStudentProfile(studentData.profile || studentData);
        studentClassAssignmentsRef.current = fetchedAssignments
          .filter((assignment) => Array.isArray(assignment.assignedClassIds) && assignment.assignedClassIds.includes(studentData.classId));
        studentPriorWorkAssignmentsRef.current = fetchedAssignments
          .filter((assignment) => !studentClassAssignmentsRef.current.includes(assignment));
        studentViewerRef.current = { studentId, profile: studentProfile, timingProfile: studentData.profile || null };
        const projectedAssignments = projectStudentAssignments({
          assignments: fetchedAssignments,
          studentId,
          profile: studentProfile,
          timingProfile: studentData.profile || null,
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
          // The grade document's own `profile` field, as the server reads it (D7).
          timingProfile: studentData.profile || null,
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
                timingProfile: studentData.profile || null,
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
    // The Today/Up-next cache holds this student's lessons and controls.
    studentUpNextCacheRef.current = { inputs: null, dashboard: null };
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
    // The next person on this Chromebook starts at their own Home, not at
    // the address this account left in the bar.
    resetAddressToHome();
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
      // The question's last submission, as the restore reads it: sent with
      // answer-by-answer drafts so the server merge keeps a submitted attempt's
      // draft out of the next attempt (workspaceDraftSchema.mjs `canonicalAt`).
      canonicalSavedAt: (questionIndex) => canonicalResponseSavedAt(normalizeQuestionRecord(trackerRef.current?.[activeAssignmentId]?.[questionIndex])),
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
          // A deadline auto-submit is dated by when its work was captured,
          // so the backup of that very work is not refused as older than
          // its own submission (canonicalResponseTime.js).
          const canonicalSavedAt = (entry) => canonicalResponseSavedAt(normalizeQuestionRecord(assignmentGrades[entry?.questionIndex]));
          const restorable = selectRestorableDraftEntries({
            entries,
            localSavedAt: (key) => questionDraftSavedAt(key),
            canonicalSavedAt,
          });
          // A tool workspace this device started from nothing — the student
          // touched it before this read landed — is settled against the
          // server's copy first: merged, so a newer copy is not then swapped
          // in over the student's edits, nor their partial copy kept over the
          // server's whole one (reconcileToolWorkspaceDrafts). Multi-answer,
          // Step Algebra and composed-step drafts this device holds are
          // settled answer by answer (reconcileFieldRecordDrafts) and are not
          // then restored whole. Neither settle reads an entry older than the
          // question's last submitted attempt: its fields are an older
          // attempt's (PR #458 review).
          const settled = reconcileToolWorkspaceDrafts(entries, { studentId: user.id, assignmentId: activeAssignmentId, canonicalSavedAt });
          const fieldRecords = reconcileFieldRecordDrafts(entries, { studentId: user.id, assignmentId: activeAssignmentId, canonicalSavedAt });
          const restored = restoreQuestionDrafts(restorable.filter((entry) => !fieldRecords.keys.has(entry.key)));
          if (restored || settled || fieldRecords.settled) {
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
  const studentUpNextCacheRef = useRef({ inputs: null, dashboard: null });
  // A shared Chromebook: the cache holds the student's lessons and their own
  // controls, so it is dropped the moment the signed-in student changes or
  // signs out — nothing of one student survives into the next session.
  useEffect(() => {
    studentUpNextCacheRef.current = { inputs: null, dashboard: null };
  }, [user?.id, user?.role]);

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
        // After a reload, an answer still in the queue is still an answer.
        if (actions.some(isGradeBearingAction)) markAnswerSent();
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
      ...helpRequestFields(helpRequest, { assignmentId: activeAssignmentId }),
    };

    // The heartbeat lifecycle below owns Firestore writes. Keeping question
    // changes in this ref avoids deleting/recreating presence while still
    // letting the next heartbeat publish the newest compact state.
    livePresencePayloadRef.current = payload;
  }, [
    user, isStudentAssignment, activeAssignmentId, activeAssignmentData,
    currentQuestionIndex, activeWorkingTracker, activeQuestionRole,
    studentClassPoints.redemptionsByAssignment, helpRequest,
  ]);

  // A help request belongs to the assignment it was made in (useAskMyTeacher
  // restores it after a reload and lowers it on leaving the assignment)…
  // …and comes down when the question it was raised on closes.
  useEffect(() => {
    setHelpRequest((current) => helpRequestAfterClose(current, activeWorkingTracker, { askingAllowed: !activeLifecycle?.isPracticeOnly }));
  }, [activeWorkingTracker, activeLifecycle?.isPracticeOnly]);

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
      // Only once the stale document is gone: an early write would be
      // deleted (and archived) by the cleanup above.
      publishPresenceNowRef.current = publishLatest;
    };

    startPresence();
    return () => {
      cancelled = true;
      if (publishPresenceNowRef.current === publishLatest) publishPresenceNowRef.current = null;
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

  // Raised or cleared: the teacher sees it now, not on the next 20 s beat.
  useEffect(() => { publishPresenceNowRef.current?.(); }, [helpRequest]);

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
  // The store is loaded on demand: imported here, it rode in every student's
  // first load (scripts/check-first-load-budget.mjs). A teacher who leaves the
  // tab before it arrives never subscribes.
  useEffect(() => {
    if (user?.role !== 'teacher' || !user.email) { setParentContacts([]); return undefined; }
    if (teacherWorkspaceMode !== 'teacher' || !TEACHER_PARENT_CONTACT_STREAM_TABS.has(teacherTab)) {
      setParentContacts([]);
      return undefined;
    }
    if (teacherPreviewRuntimeActive) return undefined;
    let stopped = false;
    let release = null;
    import('./platform/teacher/parentContactStore.js')
      .then(({ subscribeParentContacts }) => {
        if (stopped) return;
        const unsubscribe = subscribeParentContacts({ db, teacherEmail: user.email, onChange: setParentContacts, onError: (error) => console.error('Parent contact history failed:', error) });
        release = () => unsubscribe();
      })
      .catch((error) => console.error('Parent contact history failed:', error));
    return () => { stopped = true; release?.(); };
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
        // The DOL window's source (D7): the grade document's own `profile`
        // field, updated on its own so nothing else about the user changes.
        const liveTimingProfile = snapshot.data()?.profile || null;
        setUser((current) => (current && !sameTimingProfile(current.timingProfile, liveTimingProfile) ? { ...current, timingProfile: liveTimingProfile } : current));

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

          // A draft the teacher has not released is invisible to the student
          // in Classroom; announcing it only added sync jargon. No toast.
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
      // Not while the student is on that DOL's questions: it would tell them
      // to open what they have open (release-candidate QA m13).
      if (!shouldShowDolOpenReminder({
        assignmentId: assignment.id,
        dolQuestionIndices: dolState.questionIndices || [dolState.questionIndex],
        activeView,
        activeAssignmentId,
        currentQuestionIndex,
      })) return;
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
  }, [now, user, assignments, classSchedule, tracker, toastWarning, activeView, activeAssignmentId, currentQuestionIndex]);

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
      // Inside this assignment the Warm-Up's time is already on screen (the
      // banner, the section pill, the phone's status chip): a toast over the
      // Submit bar only repeated it (pass 3, RUN-14).
      if (activeView === 'assignment' && activeAssignmentId === assignment.id) return;
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
  }, [now, user, assignments, classSchedule, tracker, toastWarning, activeView, activeAssignmentId]);

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
    // A screen-reader student reading the page (./components/common/readingActivity.js).
    const stopReadingActivity = subscribeToReadingActivity(window, resetActivity);

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
      stopReadingActivity();
      window.clearInterval(interval);
    };
  }, [user, activeView, activeAssignmentId, isIdle, activeSupportPresentation.disableIdleTimer]);

  // THE LIKELY NEXT CHUNK. From Home a student almost always opens an
  // assignment, and the question runtime (QuestionEngine, with MathLive) is
  // its own chunk (app/lazyScreens.js). Fetch it once the browser is idle on
  // Home, so the first assignment does not wait on it. Nothing here joins the
  // first paint (scripts/check-first-load-budget.mjs measures that).
  const questionEnginePrefetchedRef = useRef(false);
  useEffect(() => {
    if (user?.role !== 'student' || activeView !== 'dashboard' || questionEnginePrefetchedRef.current) return undefined;
    const prefetch = () => {
      questionEnginePrefetchedRef.current = true;
      import('./QuestionEngine.jsx').catch(() => { /* the real open retries */ });
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(prefetch, { timeout: 5000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(prefetch, 2000);
    return () => window.clearTimeout(timer);
  }, [user?.role, activeView]);

  // WCAG 2.4.2: the tab names the screen (./components/common/pageChrome.jsx).
  const documentTitle = pageTitleFor({
    signedIn: Boolean(user),
    role: user?.role || null,
    view: activeView,
    studentMode: studentDashboardMode,
    teacherTab,
    assignmentTitle: assignments.find((item) => item.id === activeAssignmentId)?.title || '',
  });
  useDocumentTitle(documentTitle);

  /*
   * NAV-3: a student screen change moves focus to the new screen's heading
   * and says its name once (app/shell/screenChange.js). Not on the first
   * screen after sign-in; inside an assignment it only speaks.
   */
  const currentStudentScreenKey = studentScreenKey({
    role: user?.role || null,
    view: activeView,
    mode: studentDashboardMode,
    resultAssignmentId: assignmentResultRoute?.assignmentId || null,
    testCycleAssignmentId: activeTestCycleAssignmentId,
    assignmentId: activeAssignmentId,
  });
  const [studentScreenAnnouncement, setStudentScreenAnnouncement] = useState('');
  const lastStudentScreenKeyRef = useRef(null);
  // The change still being settled. A lazy screen can suspend the App and
  // re-run this effect with the same key; the change is finished then, not
  // dropped.
  const pendingStudentScreenRef = useRef(null);
  const documentTitleRef = useRef(documentTitle);
  documentTitleRef.current = documentTitle;
  useEffect(() => {
    const previous = lastStudentScreenKeyRef.current;
    lastStudentScreenKeyRef.current = currentStudentScreenKey;
    if (!currentStudentScreenKey) { pendingStudentScreenRef.current = null; return undefined; }
    if (previous && previous !== currentStudentScreenKey) {
      pendingStudentScreenRef.current = { key: currentStudentScreenKey, startedAt: Date.now() };
      // Cleared first, so the same name said twice in a row is still spoken.
      setStudentScreenAnnouncement('');
    }
    const pending = pendingStudentScreenRef.current;
    if (!pending || pending.key !== currentStudentScreenKey) return undefined;
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    let cancelled = false;
    let timer = null;
    const settle = () => {
      if (cancelled) return;
      // A lazy screen draws its heading a moment later: look for up to 2 s.
      const focused = screenChangeMovesFocus(pending.key) ? focusScreenHeading(document) : true;
      if (!focused && Date.now() - pending.startedAt < 2000) {
        timer = window.setTimeout(settle, 100);
        return;
      }
      if (pendingStudentScreenRef.current === pending) pendingStudentScreenRef.current = null;
      setStudentScreenAnnouncement(screenAnnouncement(documentTitleRef.current));
    };
    timer = window.setTimeout(settle, 50);
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [currentStudentScreenKey]);

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

    let generateQuestion;
    try {
      // The generator loads with the worksheet (see the import note at the top).
      ({ generateQuestion } = await import('./problemGenerator'));
    } catch (error) {
      console.error(error);
      toastError('Could not export PDF', error?.message || 'MathMaster could not build the printable assignment.');
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

    try {
      // The worksheet builder loads with the PDF (pdfLoaders.js), so a load
      // failure lands in this catch like a failed render.
      const model = await buildAssignmentWorksheetModel({
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
      const model = await buildTeacherAssignmentWorksheetModel({
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
      // Where its Back goes (NAV-9): the screen that opened it.
      setActiveTestCycleOrigin(normalizeOrigin(NAV_LEVEL.TEST_CYCLE, options.origin));
      return openStudentDashboardMode('testCycle');
    }
    const assignmentQuestions = getStoredAssignmentQuestions(assignmentData);
    if (!assignmentQuestions.length) return;
    if (user?.role === 'student' && !assignmentIsForStudent(assignmentData, { classId: user.classId || null, classPeriod: user.classPeriod })) {
      toastWarning('Not assigned to your class', 'This assignment is not assigned to your class period.');
      return;
    }
    /*
     * A START THAT CANNOT HAPPEN LANDS ON THE RESULT PAGE (NAV-4, NAV-10).
     *
     * Paused or archived by the teacher, an earlier lesson to finish first,
     * not open yet, excused: the assignment's result page says so in its
     * "what opens when" panel, where the student can read it for as long as
     * they need — not in a toast that is gone in five seconds. Every path in
     * comes through here: Home, Assignments, Grades, Ways to raise, a
     * Classroom link, an address.
     */
    const resultOrigin = normalizeOrigin(NAV_LEVEL.ASSIGNMENT_RESULT, options.origin);
    const landOnResult = (notice) => openStudentAssignmentResult(assignmentId, { origin: resultOrigin, notice });
    const closedByTeacher = user?.role === 'student' ? teacherClosedState(assignmentData) : null;
    if (closedByTeacher) {
      landOnResult(describeOpenNotice({ kind: closedByTeacher }));
      return;
    }
    const access = prerequisiteAccess({ assignment: assignmentData, classworkGradesByAssignment, nowValue: Date.now() });
    if (user?.role === 'student' && !access.open) {
      landOnResult(describeOpenNotice({
        kind: OPEN_NOTICE.PREREQUISITE,
        prerequisiteTitle: assignments.find((assignment) => assignment.id === access.prerequisiteId)?.title || '',
        opensAtText: assignmentData.releaseAt ? formatDateTime(assignmentData.releaseAt) : '',
      }));
      return;
    }
    const lifecycle = getAssignmentLifecycle(assignmentData, Date.now(), {
      studentId: user?.role === 'student' ? user.id : undefined,
    });
    if (lifecycle.isScheduled && access.reason !== 'prerequisiteMet') {
      if (user?.role === 'student') {
        landOnResult(describeOpenNotice({ kind: OPEN_NOTICE.NOT_OPEN_YET, opensAtText: assignmentData.releaseAt ? formatDateTime(assignmentData.releaseAt) : '' }));
      } else {
        toastInfo('Not open yet', `This assignment opens ${formatDateTime(assignmentData.releaseAt)}.`);
      }
      return;
    }
    // EXCUSED WORK IS NOT OPENED AS GRADED WORK. Home and Assignments leave
    // it out; a typed address, a bookmark or a Classroom link lands on its
    // result page instead. Voluntary practice and the result page's own
    // Review/Practice buttons (returnToResult) are unchanged.
    if (user?.role === 'student' && !cycleStage && !lifecycle.isPracticeOnly && !options?.returnToResult
      && resolveStudentOverride({ assignment: assignmentData, studentId: user.id })?.excused === true) {
      landOnResult(describeOpenNotice({ kind: OPEN_NOTICE.EXCUSED }));
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
        // The same predicate as Home's Today rule (studentWorkState.js): a
        // Warm-Up/DOL with its class window switched off is open like
        // Classwork; otherwise only an active window is.
        if (role === 'warmup') {
          return timedSectionWorkableNow(getWarmupState({ assignment: assignmentData, schedule: classSchedule, ...studentContext, nowValue: entryNow }));
        }
        if (role === 'dol') {
          return timedSectionWorkableNow(getDOLState({ assignment: assignmentData, schedule: classSchedule, ...studentContext, nowValue: entryNow }));
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
      // A question's own address keeps that question only while its section
      // is open now; otherwise it resolves exactly as Continue does (the first
      // unfinished question open now), never onto finished work elsewhere.
      const requestedRole = stageEntries.find((entry) => entry.storageIndex === safeQuestionIndex)?.logicalRole || null;
      const keepRequested = Boolean(options?.returnToResult)
        || Boolean(options?.keepRequestedQuestion && roleIsActionable(requestedRole));
      const actionableIndex = resolveStudentAssignmentEntry({
        entries: stageEntries,
        includedQuestionIndices,
        requestedQuestionIndex: safeQuestionIndex,
        roleIsActionable,
        restrictToRole: scopedSectionKey,
        // Start/Continue lands on the first unfinished question open now;
        // Review My Work (returnToResult) keeps the question it asked for, and
        // so does a question's own address (a reload, a link): the student
        // returns to the question they were on, if its section is open now.
        // Finished means what Home means: correct, or out of tries (a
        // teacher-granted extra DOL try reopens an expired DOL question).
        isFinished: keepRequested
          ? null
          : (index) => questionIsTerminal({
            record: tracker?.[assignmentId]?.[index],
            role: stageEntries.find((entry) => entry.storageIndex === index)?.logicalRole || null,
            question: assignmentQuestions[index],
            assignment: assignmentData,
            classId: user.classId || null,
            studentId: user.id,
          }),
      });
      if (actionableIndex === null && options?.returnToResult) {
        // Asked from the result page: going "back" to the same page would do
        // nothing visible, so say why instead.
        toastInfo('Nothing to open right now', 'None of this assignment is open to you at the moment. The result page shows what opens when.');
        return;
      }
      if (actionableIndex === null && user?.role === 'student' && !scopedSectionKey) {
        // No dead end: with nothing open this minute, show the assignment's
        // result page — its sections, what opens when, and what to do next.
        openStudentAssignmentResult(assignmentId, { origin: resultOrigin });
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
      if (options?.keepRequestedQuestion && actionableIndex !== safeQuestionIndex) {
        // A question's address names a question whose section is not open now.
        toastInfo('That question is not open right now', 'It opened where you can work now.');
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
    setAssignmentNavigationCollapsed(true);
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
    setPathLaunchTab(null);
    if (mode !== 'testCycle') setActiveTestCycleAssignmentId(null);
    setStudentDashboardMode(mode);
    setActiveView('dashboard');
  };

  // "Practise this skill" on a released test review or the Test Cycle card:
  // a course standard opens Path practice on it; a practice test's exam
  // domain opens the CCMR tab (practiceSkillLaunch).
  const practiseSkillFromResults = (destination) => {
    const launch = practiceSkillLaunch(destination);
    if (!launch) return;
    openStudentDashboardMode('mathPath');
    setPathLaunchTeks(launch.teksCode);
    setPathLaunchTab(launch.tab);
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

  // A navigation level a Back control returns to (NAV-9).
  const openStudentOriginLevel = (level) => {
    if (level === NAV_LEVEL.HOME) return openStudentDashboardMode('assignments');
    if (level === NAV_LEVEL.GRADES) return openStudentGradeCenter();
    if (level === NAV_LEVEL.SECURE_EXAMS) return openStudentDashboardMode('secureExams');
    return openStudentAssignmentsCenter();
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
      // Which screen sent the student here (Home, Assignments or Grades), so
      // the visible Back control names and returns to it rather than guessing.
      // Browser Back already does the right thing; this keeps the on-screen
      // control agreeing with it (NAV-9).
      origin: normalizeOrigin(NAV_LEVEL.ASSIGNMENT_RESULT, options.origin),
      // Why a start landed here instead of opening (studentOpenGate.js), for
      // the page's "what opens when" panel. Null for an ordinary visit.
      notice: options.notice || null,
    });
    setActiveClassroomSectionKey(sectionKey === 'whole' ? null : sectionKey);
    setActiveAssignmentId(id);
    setActiveView('assignmentResult');
  };

  /*
   * A QUESTION'S ADDRESS (app/routes/questionAddress.js).
   *
   * The student's questions in the order and numbering the workspace uses:
   * less the items a reduced-item-count accommodation omits (never in
   * voluntary practice), exactly as renderAssignmentWorkspace builds
   * `projectedEntries`. The address bar, Home's Resume and the workspace
   * header therefore name the same "Classwork Question 2".
   */
  const studentQuestionEntriesFor = (assignmentData) => {
    if (!assignmentData) return [];
    const lifecycle = getAssignmentLifecycle(assignmentData, Date.now(), {
      studentId: user?.role === 'student' ? user.id : undefined,
    });
    const required = user?.role === 'student' && !lifecycle.isPracticeOnly
      ? studentRequiredFor(assignmentData, { hasPracticePass: hasPracticePassFor(assignmentData.id) })
      : null;
    return studentQuestionEntries(assignmentData, { omittedIndices: required?.omitted || [] });
  };

  /*
   * OPENING THE ADDRESS THE PAGE ARRIVED AT.
   *
   * Once the account has loaded, the address is turned into a plan
   * (app/routes/urlArrival.js) and the plan into the call a click makes:
   * startAssignment, openStudentAssignmentResult, openStudentDashboardMode,
   * the Test Cycle card, startTeacherPreview. So a typed or reloaded URL meets
   * every gate a click meets — class membership, release and prerequisite,
   * section windows, the Test Cycle card's server check, the secure-exam
   * dashboard — and the server's authority is unchanged.
   */
  // A session or tab from an arrival applies to the My Math Path it opened.
  useEffect(() => {
    if (mathPathArrival && (studentDashboardMode !== 'mathPath' || activeView !== 'dashboard')) setMathPathArrival(null);
  }, [mathPathArrival, studentDashboardMode, activeView]);

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

  // One door into a Recovery from anywhere a student finds it — Home, the
  // Assignments Center, or the assignment's own header. It lands on the
  // assignment's Results route, where the panel and the runner already live,
  // and opens the practice, the server-built second try, or the one in
  // progress. Leaving an open assignment saves its activity first, as Back does.
  const openStudentRecovery = (opportunity) => {
    const assignmentId = opportunity?.assignmentId;
    const section = opportunity?.section;
    if (!assignmentId || !section) return;
    if (activeView === 'assignment' && activeAssignmentId) flushAssignmentActivity(activeAssignmentId).catch(() => {});
    openStudentAssignmentResult(assignmentId, { origin: 'assignments' });
    if (opportunity.action === 'start') {
      startStudentRecovery(assignmentId, section);
      return;
    }
    setRecoverySession({ assignmentId, section, mode: opportunity.action === 'continue' ? 'assessment' : 'practice' });
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
    setAssignmentNavigationCollapsed(true);
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
        setAssignmentNavigationCollapsed(true);
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
    setAssignmentNavigationCollapsed(true);
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
    // The address the page opened at has not been opened yet (urlArrival).
    if (urlArrival) return;
    // The screen's address: the tab and an open assignment monitor only —
    // never a student's drawer, case review or report (app/routes/appUrl.js).
    const url = teacherUrlFor(teacherBrowserRoute);
    // The entry the teacher arrived on (sign-in, a reload, a bookmark) becomes
    // this screen. Later screens are pushed after it.
    if (!teacherBrowserHistoryReadyRef.current) {
      teacherBrowserHistoryReadyRef.current = true;
      writeTeacherRouteState(teacherBrowserRoute, {
        replace: true, documentId: TEACHER_HISTORY_DOCUMENT_ID, url, owner: user?.uid,
        fresh: readRouteOwner(window.history.state) !== user?.uid,
      });
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
        url,
        owner: user?.uid,
      });
    }
  }, [teacherBrowserRoute, urlArrival]);

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
    // An entry another account wrote (platform/student/browserHistory.js):
    // never restored; this screen's entry takes its place.
    if (readRouteOwner(event.state) !== user?.uid) {
      if (teacherBrowserRoute) {
        writeTeacherRouteState(teacherBrowserRoute, {
          replace: true, documentId: TEACHER_HISTORY_DOCUMENT_ID, url: teacherUrlFor(teacherBrowserRoute), owner: user?.uid, fresh: true,
        });
      }
      return;
    }

    // The popstate from closing a panel: the screen already shows this entry
    // (that is why App stepped back to it). Nothing to restore — and a dialog
    // opened by the same click (the hub's "Edit questions") must not read it
    // as the teacher pressing Back.
    if (ownStepBack) {
      if (teacherBrowserRoute && teacherRouteSignature(route) !== teacherRouteSignature(teacherBrowserRoute)) {
        writeTeacherRouteState(teacherBrowserRoute, { replace: true, fromKey: entry.fromKey, documentId: entry.documentId, url: teacherUrlFor(teacherBrowserRoute), owner: user?.uid });
      }
      return;
    }

    if (teacherDialogOpen) {
      // The browser has already moved; put this screen's entry back and stay.
      if (teacherBrowserRoute) {
        writeTeacherRouteState(teacherBrowserRoute, { fromKey: teacherRouteKey(route), documentId: TEACHER_HISTORY_DOCUMENT_ID, url: teacherUrlFor(teacherBrowserRoute), owner: user?.uid });
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
        writeTeacherRouteState(teacherBrowserRoute, { replace: true, fromKey: entry.fromKey, documentId: entry.documentId, url: teacherUrlFor(teacherBrowserRoute), owner: user?.uid });
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
    // A device pin the question dropped (`familyPinNotice`) is replaced by
    // what was shown instead, so the next render cannot swap it again.
    writeLocalDeliveryPin({ studentId: user.id, delivery, devicePinDropped: Boolean(renderedQuestion?.familyPinNotice) });
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
      // The grade document's own `profile` field, as the finalizer reads it (D7).
      studentProfile: user.timingProfile || null,
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
      // An answer is on its way only once it is in the device queue: a
      // no-credit practice submit or one that could not be stored is not
      // (RUN-11, saveStatusModel.js).
      markAnswerSent();
      setStudentOutboxDepth((depth) => depth + 1);
      setStudentPersistenceStatus('queued');
    } catch (error) {
      // Nothing was recorded anywhere, so nothing was submitted: no verdict,
      // no try used, the question stays open with Submit (RUN-3). A `null`
      // here used to read as "show the device's own verdict" — "Correct!",
      // locked, and no Submit to press again.
      console.error('Could not durably queue this response:', error);
      setStudentPersistenceStatus('volatile');
      toastWarning('Not submitted', 'This device could not save your answer. No try was used. Keep this tab open and press Submit again.');
      return SUBMISSION_NOT_QUEUED;
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
      markAnswerSent();
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
      ...weeklyPlanClassInputs({
        config: storedWeeklyGoalForClassContext(weeklyGoalsByClass, {
          classId: profileDrawerStudent.classId, classPeriod: profileDrawerStudent.classPeriod,
        }) || {},
        honors: context.courseLevel === 'honors',
      }),
    });
  }, [profileDrawerStudent, classesById, courseProfiles, assignments, pacingByClass, skillOverrides, profileDrawerLearningProfile, weeklyGoalsByClass]);

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
    // One release opens worked solutions in EVERY class this is assigned to:
    // name everyone who has not finished, by class, before it goes
    // (app/teacher/feedbackReleaseHold.js; coordinator QA M3).
    // Every assigned class's extensions, not only the classes on screen.
    const privateRecords = await readReleaseControls({
      db, assignment, email: user?.email || '', isRootAdmin: user?.isRootAdmin === true,
    });
    const release = describeFeedbackRelease({
      title: assignment.title,
      ...releaseHoldReport({ assignment, privateRecords, students: allStudents, classes, nowValue: Date.now() }),
    });
    const proceedWithRelease = await confirmAction({
      title: release.title,
      message: release.message,
      confirmLabel: release.confirmLabel,
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
    // The teacher's own control: the plain rule, never a student's grades.
    const state = getSectionAccessStateForAnyone({ assignment, activityRole, classId, classPeriod, nowValue: Date.now() });
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
    // `timingProfile` is the stored projection itself (the D7 DOL window).
    const timingProfile = projection && typeof projection === 'object' ? projection : null;
    setAllStudents((current) => current.map((entry) => entry.id === studentId ? { ...entry, profile: nextProfile, timingProfile } : entry));
    setTeacherRosterSummaries((current) => current.map((entry) => entry.id === studentId ? { ...entry, profile: nextProfile, timingProfile } : entry));
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
    // Nor is a student still on their exit ticket's extra time (D7).
    if (studentExtraTimeDolOpen({ assignments, schedule: classSchedule, classId: user.classId || null, classPeriod: user.classPeriod, nowValue: now })) return null;

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
        <div style={{ fontSize: 'clamp(calc(24 * var(--mm-px)), calc(4vw * var(--mm-text-scale, 1)), calc(42 * var(--mm-px)))', fontWeight: 1000, lineHeight: 1.05 }}>
          ⏰ PACK UP & RETURN TECHNOLOGY
        </div>
        <div style={{ marginTop: 8, fontSize: 'clamp(calc(16 * var(--mm-px)), calc(2.2vw * var(--mm-text-scale, 1)), calc(24 * var(--mm-px)))', fontWeight: 900 }}>
          {/* No "Save your work": work saves as it is entered, and the save
              line says when it could not be (student pass 3). */}
          Finish up, sign out, and return your device now. The bell is in{' '}
          <DOLCountdown endsAt={packUp.endsAt} />.
        </div>
      </aside>
    );
  };

  /*
   * THE LIVE CHALLENGE LOBBY, WHEREVER THE STUDENT IS (student pass 3, P3).
   *
   * The invite showed only on Home: a student on Grades, Assignments, My
   * Rewards, My Math Path or a result page saw nothing until the game was
   * running. One line, the same action as Home's card. Never in a secure
   * exam, a Test Cycle or the game itself (those screens do not render it).
   */
  const renderStudentLiveChallengeInvite = () => {
    if (user?.role !== 'student' || secureExamActive) return null;
    if (!liveChallengeInvite || !['invited', 'joined', 'running'].includes(liveChallengeInvite.status)) return null;
    const running = liveChallengeInvite.status === 'running';
    return (
      <section
        aria-label="Live Challenge"
        data-live-challenge-invite
        style={{ maxWidth: 920, margin: '12px auto 0', padding: '10px 14px', boxSizing: 'border-box', borderRadius: 12, background: 'var(--mm-primary-soft)', border: '2px solid #1a73e8', color: 'var(--mm-primary-text)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', textAlign: 'left' }}
      >
        <span style={{ fontWeight: 900, minWidth: 0, overflowWrap: 'anywhere' }}>
          <span aria-hidden="true">⚡ </span>
          {running ? 'The Live Challenge is running now.' : 'Your teacher opened the Live Challenge lobby.'}
        </span>
        {/* openStudentDashboardMode, not the bare mode: from the result page the
            view must change too, and a pending Path launch must not survive. */}
        <button type="button" onClick={() => openStudentDashboardMode('liveChallenge')} style={{ minHeight: 44, padding: '10px 16px', border: 0, borderRadius: 10, background: 'var(--mm-primary)', color: 'var(--mm-on-primary)', fontWeight: 900, cursor: 'pointer' }}>
          {running ? 'Join Challenge Now' : 'Enter Challenge Lobby'}
        </button>
      </section>
    );
  };

  // The most urgent open Warm-Up this student has not finished, across their
  // lessons: the banner shows it, and on a phone (no banner) the assignment's
  // status chip offers it when it belongs to another lesson.
  const studentActiveWarmup = () => {
    if (user?.role !== 'student' || !user.classPeriod) return null;
    // Its "Go to Warm-Up" would take a student out of a secure exam.
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
        // Never recommend work the student cannot do for credit: excused
        // for them, or not open to them (not released yet / closed).
        if (assignmentIsExcusedForStudent(assignment, user.id)) return null;
        if (!getAssignmentLifecycle(assignment, now, { studentId: user.id }).isOpen) return null;
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
    return active[0] || null;
  };

  const renderStudentWarmupBanner = () => {
    const activeWarmup = studentActiveWarmup();
    if (!activeWarmup) return null;
    const { assignment, state, questionIndices } = activeWarmup;
    const support = getStudentSupportPresentation(user.profile);
    const alreadyInThisWarmup = activeView === 'assignment'
      && activeAssignmentId === assignment.id
      && questionIndices.includes(currentQuestionIndex);

    return (
      <aside
        role="alert"
        aria-live="polite"
        // On a phone the assignment screen hides this banner: its countdown
        // rides in the section pill there, and a Warm-Up elsewhere in the
        // lesson is a line in the status chip (pass 3, RUN-14).
        className="mathmaster-warmup-banner"
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
          <strong style={{ fontSize: 'calc(20 * var(--mm-px))' }}>
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
      <Dialog
        role="alertdialog"
        onClose={() => { lastActivityRef.current = Date.now(); setIsIdle(false); }}
        aria-labelledby="mathmaster-idle-title"
        aria-describedby="mathmaster-idle-detail"
        className="mathmaster-idle-overlay"
        data-idle-prompt=""
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
          <p id="mathmaster-idle-detail" style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(16 * var(--mm-px))', marginBottom: '30px' }}>
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
              fontSize: 'calc(16 * var(--mm-px))',
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
      </Dialog>
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
        <Dialog
          onClose={closeDeleteDialog}
          closeOnEscape={!isDeleting}
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
                fontSize: 'calc(13 * var(--mm-px))',
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
                    fontSize: 'calc(16 * var(--mm-px))',
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
        </Dialog>
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
        <Dialog
          onClose={closeExportJsonDialog}
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
            <p style={{ margin: '8px 0 0', color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))' }}>
              This is a portable MathMaster assignment. You can copy it into another MathMaster authoring workflow and bring it back through Assignment Creator. Student/class dates and publication records stay out of the portable assignment.
            </p>
          </div>
          <div style={{ padding: '20px 28px' }}>
            <textarea
              readOnly
              value={exportedText}
              onFocus={(event) => event.target.select()}
              style={{ width: '100%', height: '360px', padding: '12px', borderRadius: '8px', border: '1px solid var(--mm-border)', fontFamily: 'monospace', fontSize: 'calc(12 * var(--mm-px))', boxSizing: 'border-box', resize: 'vertical' }}
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
        </Dialog>
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
        <Dialog
          onClose={() => setTeacherScratchpadDialog(null)}
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
              <div style={{ color: 'var(--mm-text-muted)', marginTop: '5px', fontSize: 'calc(14 * var(--mm-px))' }}>
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
                      <figcaption style={{ marginBottom: '6px', textAlign: 'left', fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800, color: 'var(--mm-text-muted)' }}>
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
        </Dialog>
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
    // The DOL's lock message, open notice and close receipt: a teacher's
    // "Close now" never reads as the timer, and "when time ends" only while it is open.
    const currentDolCopy = currentIsDOL && !preview
      ? describeDolClose({ status: dolState.status, teacherClosed: dolState.teacherClosed, outcome: currentCheckpointOutcome, extendedTime: dolState.extendedTime, endsAt: dolState.endsAt })
      : null;
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
          // On time is the ordinary case: no badge (pass 3, RUN-16 — "ON-TIME
          // ACCESS" named a program state, not anything the student does).
          : { label: '', background: 'transparent', color: 'var(--mm-text)' };

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
    const visibleByStorageIndex = new Map(visibleQuestionEntries.map((entry) => [entry.index, entry]));
    const navigationSections = currentContent.logicalSections.map((logicalSection) => ({
      role: logicalSection.role,
      entries: logicalSection.entries.map((entry) => visibleByStorageIndex.get(entry.storageIndex)).filter(Boolean),
    })).filter((section) => section.entries.length).map((section) => ({
      ...section,
      complete: section.entries.length > 0 && section.entries.every((entry) => sectionQuestionIsComplete(entry.index)),
      // `progress` and `allCorrect` (the tab's "✓ Complete") are filled in
      // below from the navigator's question states, held-feedback mask included.
      progress: null,
      allCorrect: false,
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
    /*
     * WHAT EACH SECTION AND QUESTION IS DOING NOW, SAID ONE WAY (pass 3,
     * RUN-5 / RUN-8 / RUN-9; platform/student/assignmentNavigator.js).
     *
     * A section can be open, read-only (closed, its work still there to look
     * over: a Warm-Up closed for the period, an ended DOL, Classwork the
     * teacher closed) or locked (not open yet) — and a locked one says when or
     * why. A question is correct, needs another try, closed, submitted (held
     * feedback: never right or wrong) or not started. The tabs, the number
     * strip, the dropdown and the Overview all read these.
     */
    const sectionHasWork = (role) => projectedEntries.some((entry) => entry.logicalRole === role
      && normalizeQuestionRecord(workingTracker?.[entry.storageIndex]).totalAttempts > 0);
    const sectionAccessCache = new Map();
    const sectionAccessFor = (entry) => {
      const cacheKey = `${entry?.role}|${entry?.isTimedDOLQuestion ? 'timed' : ''}`;
      if (sectionAccessCache.has(cacheKey)) return sectionAccessCache.get(cacheKey);
      const access = describeSectionAccess({
        role: entry?.role,
        // Read mid-sentence ("Time is up for the Exit ticket (DOL)."); the
        // model capitalises a sentence that starts with it.
        label: entry?.role === 'dol' ? 'the Exit ticket (DOL)' : `the ${activitySectionMeta[entry?.role]?.label || entry?.role || 'section'}`,
        timedDol: Boolean(entry?.isTimedDOLQuestion),
        unrestricted: preview || lifecycle.isPracticeOnly,
        lifecycle,
        warmupState,
        dolState,
        manualState: getSectionAccessState({
          assignment,
          activityRole: entry?.role,
          classId: user?.classId || null,
          classPeriod: user?.classPeriod,
          nowValue: now,
          studentId: user?.role === 'student' ? user.id : undefined,
        }),
        hasWork: sectionHasWork(entry?.role),
        nowValue: now,
      });
      sectionAccessCache.set(cacheKey, access);
      return access;
    };
    // Viewable: a closed section stays reachable read-only.
    const entryIsAvailable = (entry) => sectionAccessFor(entry).viewable;
    const entryMaximumAttempts = (entry) => {
      const policy = getEffectiveActivityPolicy(entry.role);
      return resolveQuestionMaximumAttempts({
        question: questions[entry.index],
        maximumAttempts: policy.attempts,
        activityPolicy: policy,
        teacherGrantedExtraAttempts: resolveTeacherGrantedExtraAttempts({
          assignment,
          activityRole: entry.role,
          classId: user?.classId || null,
          studentId: user?.role === 'student' ? user.id : null,
        }),
      });
    };
    // The policy the question itself runs under (post-deadline practice runs
    // every question as Practice).
    const entryRuntimePolicy = (entry) => getEffectiveActivityPolicy(!preview && lifecycle.isPracticeOnly ? 'practice' : entry.role);
    // The held-feedback mask: wherever the question withholds its outcome — a
    // quiz or test until the teacher's release, a DOL until it is finished
    // (a teacher's extra try leaves it open) — the navigator says nothing of
    // right or wrong either (outcomeWithheld, the engine's own rule).
    const entryFeedbackHeld = (entry) => !preview && outcomeWithheld({
      feedbackMode: entryRuntimePolicy(entry).feedback,
      released: lifecycle.isPracticeOnly || assignmentFeedbackWasReleased(assignment),
      record: workingTracker?.[entry.index],
    });
    const navigatorQuestionFor = (entry) => {
      const access = sectionAccessFor(entry);
      const policy = entryRuntimePolicy(entry);
      return describeNavigatorQuestion({
        record: workingTracker?.[entry.index],
        maximumAttempts: entryMaximumAttempts(entry),
        feedbackHeld: entryFeedbackHeld(entry),
        sectionClosed: access.state === SECTION_ACCESS.READ_ONLY,
        available: access.viewable,
        lockedLabel: access.short,
        // Out of tries, the question offers "Request New Question" when its
        // policy allows a replacement (as the question decides it).
        replacementAvailable: resolveQuestionReplacementAllowed({
          question: questions[entry.index],
          activityPolicy: policy,
          canGenerateFresh: isPersonalizedBlueprint(questions[entry.index]),
        }),
      });
    };
    const compactSectionLabel = (section) => section?.role === 'dol'
      ? 'Exit ticket (DOL)'
      : (activitySectionMeta[section?.role]?.label || section?.role || 'Section');
    // A section tab lands on the first question the student can still work,
    // never on one out of tries while a workable one is left; with nothing
    // workable, a closed section opens for review.
    const sectionNavigationTarget = (section) => sectionLandingEntry({
      entries: (section?.entries || []).map((entry) => ({
        ...entry,
        viewable: entryIsAvailable(entry),
        workable: entryIsWorkableNow(entry),
        status: navigatorQuestionFor(entry).status,
      })),
      currentIndex: currentQuestionIndex,
    });
    navigationSections.forEach((section) => {
      section.progress = describeNavigatorSectionProgress({
        questions: section.entries.map((entry) => navigatorQuestionFor(entry)),
        feedbackHeld: section.entries.some((entry) => entryFeedbackHeld(entry)),
      });
      section.allCorrect = section.progress.allCorrect;
    });
    const findNeighbor = (direction) => {
      for (let position = currentVisibleEntryPosition + direction; position >= 0 && position < visibleQuestionEntries.length; position += direction) {
        if (entryIsAvailable(visibleQuestionEntries[position])) return visibleQuestionEntries[position];
      }
      return null;
    };
    const previousQuestionEntry = findNeighbor(-1);
    const nextQuestionEntry = findNeighbor(1);
    // The question's own "Next" goes to the next question the student can
    // still answer; a closed section kept viewable for review (RUN-8) is
    // reached by the arrows and tabs, not walked into after an answer.
    const engineNextEntry = visibleQuestionEntries
      .slice(currentVisibleEntryPosition + 1)
      .find((entry) => entryIsWorkableNow(entry)) || nextQuestionEntry;
    const nextQuestionSectionMeta = engineNextEntry ? (activitySectionMeta[engineNextEntry.role] || { label: engineNextEntry.role }) : null;
    const nextQuestionDestinationLabel = engineNextEntry ? `Question ${engineNextEntry.sectionPosition + 1} of ${navigationSections.find((section) => section.role === engineNextEntry.role)?.entries.length || 1}` : '';
    const currentNavigationSectionIndex = navigationSections.findIndex((section) => section.role === currentNavigationSection?.role);
    const laterNavigationSections = currentNavigationSectionIndex >= 0
      ? navigationSections.slice(currentNavigationSectionIndex + 1)
      : [];
    // When a student finishes an entire section, point the celebration CTA at
    // the next AVAILABLE unfinished section. A locked DOL is intentionally
    // skipped rather than becoming a dead-end button.
    // "Can be viewed" is not "can be worked now": a Warm-Up closed for the
    // period or an ended DOL stays viewable for review, but the continue
    // button must only ever lead to an unfinished question open right now.
    function entryIsWorkableNow(entry) {
      if (!sectionAccessFor(entry).workable) return false;
      if (preview || lifecycle.isPracticeOnly) return true;
      if (entry?.role === 'warmup' && warmupState.enabled) return warmupState.status === 'active';
      if (entry?.isTimedDOLQuestion && dolState.enabled) return dolState.status === 'active';
      return true;
    }
    const sectionWorkTarget = (section) => (section?.entries || [])
      .find((entry) => entryIsWorkableNow(entry) && !sectionQuestionIsComplete(entry.index)) || null;
    const nextAvailableIncompleteSection = laterNavigationSections.find((section) => sectionWorkTarget(section));
    // Only a section with work left: "Continue to Practice" with Practice
    // already complete was a dead loop. With none left, hand off to Up next
    // (what Home would recommend) or to this assignment's results.
    const nextAvailableSection = nextAvailableIncompleteSection
      // An EARLIER section still open with work left beats leaving the assignment.
      || navigationSections.find((section) => section.role !== currentNavigationSection?.role && sectionWorkTarget(section))
      || null;
    const nextAvailableSectionTarget = nextAvailableSection ? sectionWorkTarget(nextAvailableSection) : null;
    const nextAvailableSectionMeta = nextAvailableSection
      ? (activitySectionMeta[nextAvailableSection.role] || { label: nextAvailableSection.role })
      : null;
    // Decision 4: a section is done at ANY accuracy — out of tries counts —
    // so the hand-off follows terminal completion; `allCorrect` stays for the
    // tab's correctness styling only.
    const assignmentHandoff = currentNavigationSection?.complete
      ? resolveAssignmentHandoff({
        nextIncompleteSection: nextAvailableSectionTarget ? nextAvailableSection : null,
        nextIncompleteSectionLabel: nextAvailableSectionMeta?.label || '',
        student: !preview && user?.role === 'student',
      })
      : null;
    // Finishing lands on this assignment's results; its Up next card is the
    // second action there (RUN-12, assignmentHandoff.js).
    const continueAfterSection = !assignmentHandoff
      ? null
      : assignmentHandoff.kind === 'section'
        ? () => changeQuestion(nextAvailableSectionTarget.index)
        : () => openStudentAssignmentResult(activeAssignmentId, { origin: 'assignments' });
    // Nothing workable ahead and the section not done: the way back to the
    // question that was skipped (RUN-12).
    const skippedQuestion = !nextQuestionEntry && !currentNavigationSection?.complete
      ? resolveSkippedQuestion({
        entries: visibleQuestionEntries,
        currentIndex: currentQuestionIndex,
        currentRole: currentNavigationSection?.role,
        isWorkable: entryIsWorkableNow,
        isComplete: sectionQuestionIsComplete,
        attemptCountOf: (index) => normalizeQuestionRecord(workingTracker?.[index]).attemptCount,
        sectionLabelOf: (role) => (role === 'dol' ? 'Exit ticket (DOL)' : activitySectionMeta[role]?.label || ''),
      })
      : null;
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
    /*
     * ONE STATUS CHIP ON A PHONE (pass 3, NAV-5). A phone hides the header and
     * every banner above the work, so a late deadline, "no credit" and a live
     * challenge used to vanish there. The chip in the navigator names the most
     * urgent one; pressing it opens the full lines. (Wider screens keep the
     * banners and hide the chip.)
     */
    const dolSectionIndices = dolState.questionIndices || [dolState.questionIndex];
    const assignmentStatusLines = preview ? [] : [
      shouldShowChallengeHandoffBanner({ invite: liveChallengeInvite, warmupDecision: warmupChallengeDecision }) && {
        key: 'liveChallenge',
        tone: 'live',
        chip: '⚡ Join the challenge',
        title: 'Live Challenge has started',
        text: `${liveChallengeInvite?.title || 'Your class challenge'} is live now. Your assignment work is saved when you switch.`,
      },
      !lifecycle.isPracticeOnly && dolState.status === 'active' && !dolSectionIndices.includes(currentQuestionIndex)
        && dolSectionIndices.some((index) => normalizeQuestionRecord(workingTracker?.[index]).totalAttempts === 0) && {
        key: 'dol',
        tone: 'dol',
        chip: 'Exit ticket (DOL) open',
        title: 'The Exit ticket (DOL) is open',
        text: `Finish all ${dolSectionIndices.length} question${dolSectionIndices.length === 1 ? '' : 's'} before time runs out.`,
        action: { label: 'Go to the Exit ticket (DOL)', onClick: () => { setAssignmentStatusOpenFor(null); changeQuestion(dolSectionIndices[0]); } },
      },
      // Timed windows mean nothing in post-deadline practice.
      !lifecycle.isPracticeOnly && warmupState.status === 'active' && activeQuestionRole !== 'warmup'
        && visibleQuestionEntries.some((entry) => entry.role === 'warmup' && !['correct', 'expired'].includes(normalizeQuestionRecord(workingTracker?.[entry.index]).status)) && {
        key: 'warmup',
        tone: 'warmup',
        chip: 'Warm-Up open',
        title: 'The Warm-Up is open',
        text: `It closes at ${warmupState.endsAt ? new Date(warmupState.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'the end of its window'}.`,
        action: { label: 'Go to the Warm-Up', onClick: () => { setAssignmentStatusOpenFor(null); const first = visibleQuestionEntries.find((entry) => entry.role === 'warmup'); if (first) changeQuestion(first.index); } },
      },
      lifecycle.isLate && {
        key: 'late',
        tone: 'late',
        chip: `Late · closes ${studentDueDateLines(assignment, lifecycle).finalText}`,
        title: 'Late, still open',
        text: `The due date passed. You have ${formatRemainingTime(lifecycle.millisecondsRemaining)} before this assignment closes on ${studentDueDateLines(assignment, lifecycle).finalText}.`,
      },
      lifecycle.isPracticeOnly && {
        key: 'practice',
        tone: 'practice',
        chip: 'No credit · practice',
        title: 'Practice only, no credit',
        text: 'This assignment has closed and your grade is set. You can keep practising with feedback; it does not change your grade. Your practice is saved, and your teacher can see it.',
      },
    ].filter(Boolean);
    // Another lesson's open Warm-Up: the banner that offers it is hidden on a phone.
    const otherWarmup = preview ? null : studentActiveWarmup();
    if (otherWarmup && otherWarmup.assignment.id !== activeAssignmentId) {
      assignmentStatusLines.push({
        key: 'otherWarmup',
        tone: 'warmup',
        chip: 'Warm-Up open',
        title: `The Warm-Up is open in ${otherWarmup.assignment.title}`,
        text: `It closes at ${otherWarmup.state.endsAt ? new Date(otherWarmup.state.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'the end of its window'}.`,
        action: {
          label: 'Go to that Warm-Up',
          onClick: () => {
            setAssignmentStatusOpenFor(null);
            setStudentDashboardMode('assignments');
            startAssignment(otherWarmup.assignment.id, otherWarmup.questionIndices[0]);
          },
        },
      });
    }
    // THE GRADE LINES, MOVED FROM THE NAVIGATOR (pass 3, RUN-7): Overview on a
    // wide screen, the chip's panel on a phone. "Grade so far", never "if
    // submitted now": there is no assignment-level submit (RUN-16).
    const gradeSoFarLine = preview
      ? `Preview progress · ${progress.correct}/${progress.total} correct`
      : assignmentFeedbackHeld
        ? 'Your score shows after your teacher releases it'
        : lifecycle.isPracticeOnly
          ? `Your grade: ${recordedGrade}% · set when the assignment closed`
          : `Grade so far: ${recordedGrade}%`;
    const gradeDetailLine = !preview && !assignmentFeedbackHeld && gradeSplit.attempted > 0
      ? `${gradeSplit.attempted} of ${gradeSplit.total} answered · ${gradeSplit.creditOnAttempted}% on what you have answered`
      : '';
    // A student always has the chip on a phone: a status, or "More".
    const assignmentChipShown = !preview && user?.role === 'student';
    const assignmentStatusOpen = assignmentStatusOpenFor === activeAssignmentId && assignmentChipShown;
    // The live challenge line's action leaves the assignment, as its banner does.
    assignmentStatusLines.forEach((line) => {
      if (line.key === 'liveChallenge') {
        line.action = { label: 'Join Live Challenge', onClick: () => { setAssignmentStatusOpenFor(null); leaveAssignment(); setStudentDashboardMode('liveChallenge'); } };
      }
    });
    // A locked tab's reason, while that section is still locked.
    const lockNoteSection = sectionLockNote?.assignmentId === activeAssignmentId
      ? navigationSections.find((section) => section.role === sectionLockNote.role)
      : null;
    const visibleSectionLockNote = lockNoteSection && !sectionNavigationTarget(lockNoteSection) ? sectionLockNote.text : '';
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
            // The whole support profile, so the game gives the same Read aloud
            // a standalone game does (extended time travels on the invite).
            studentProfile={{ ...(user?.profile || {}), studentId: user?.id, name: user?.name }}
            // The same rewards card a standalone game shows when it ends —
            // without its "Open My Rewards" link: mid-Warm-Up the one way on
            // is Back to Warm-Up, which records the game and keeps the
            // assignment's own exit and flush.
            renderMatchRewards={(roomId, match = {}) => (
              <ChallengeRewardsEarned
                roomId={roomId}
                offered={match.offered}
                grants={studentClassPoints.grants}
                transactions={studentClassPoints.transactions}
                onOpenRewards={null}
              />
            )}
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
              style={{ marginBottom: '16px', padding: '10px 16px', borderRadius: '10px', background: '#137333', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', fontWeight: 800, fontSize: 'calc(13 * var(--mm-px))' }}
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
                  style={{ padding: '3px 7px', borderRadius: 999, background: '#fdd663', color: 'var(--mm-warning-text)', fontSize: 'calc(11 * var(--mm-px))' }}
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
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--mm-border-soft)', background: 'transparent', color: '#fff', fontWeight: 900, cursor: 'pointer', fontSize: 'calc(12 * var(--mm-px))' }}
                >
                  Restart Fresh
                </button>
                <button
                  type="button"
                  onClick={() => { leaveAssignment(); endLiveTeaching(); }}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--mm-border-soft)', background: 'var(--mm-surface)', color: 'var(--mm-success-text)', fontWeight: 900, cursor: 'pointer', fontSize: 'calc(12 * var(--mm-px))' }}
                >
                  End Teaching
                </button>
              </div>
            </section>
          )}
          {!preview && shouldShowChallengeHandoffBanner({ invite: liveChallengeInvite, warmupDecision: warmupChallengeDecision }) && (
            <section className="mathmaster-assignment-banner" style={{ marginBottom: '16px', padding: '18px 22px', borderRadius: '13px', background: 'var(--mm-primary-soft)', border: '3px solid #1a73e8', color: 'var(--mm-primary-text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', textAlign: 'left' }}>
              <div><strong style={{ display: 'block', fontSize: 'calc(20 * var(--mm-px))' }}>⚡ Live Challenge has started</strong><span>{liveChallengeInvite.title || 'Your class challenge'} is live now. Your assignment work is saved when you switch.</span></div>
              <button type="button" onClick={() => { leaveAssignment(); setStudentDashboardMode('liveChallenge'); }} style={{ padding: '11px 17px', border: 0, borderRadius: '9px', background: '#174ea6', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Join Live Challenge</button>
            </section>
          )}
          {lifecycle.isLate && !preview && (
            <section className="mathmaster-assignment-banner" style={{ marginBottom: '16px', padding: '18px 22px', borderRadius: '13px', background: 'var(--mm-warning-soft)', border: '2px solid #f9ab00', color: 'var(--mm-warning-text)', textAlign: 'left' }}>
              <strong style={{ display: 'block', fontSize: 'calc(20 * var(--mm-px))' }}>Late submission window</strong>
              <span>The regular deadline passed. You have <strong>{formatRemainingTime(lifecycle.millisecondsRemaining)}</strong> before this assignment closes permanently on {studentDueDateLines(assignment, lifecycle).finalText}.</span>
            </section>
          )}

          {lifecycle.isPracticeOnly && !preview && (
            <section className="mathmaster-assignment-banner" style={{ marginBottom: '16px', padding: '18px 22px', borderRadius: '13px', background: 'var(--mm-surface-control)', border: '2px solid #5f6368', color: 'var(--mm-text)', textAlign: 'left' }}>
              <strong style={{ display: 'block', fontSize: 'calc(20 * var(--mm-px))' }}>Practice Mode — grading window ended</strong>
              <span>Your recorded grade is frozen. You may keep practicing with feedback, but these attempts earn no credit and are not written to the teacher gradebook, mastery evidence, Math Path recommendations, or activity analytics. Your practice is saved, so you can pick it up again on another Chromebook, and your teacher can see it when they review your work.</span>
            </section>
          )}

          {!preview && dolState.status === 'active' && (dolState.questionIndices || [dolState.questionIndex]).some((index) => normalizeQuestionRecord(workingTracker?.[index]).totalAttempts === 0) && (
            <section className="mathmaster-assignment-banner" style={{ marginBottom: '16px', padding: '20px 22px', borderRadius: '14px', background: 'var(--mm-accent-soft)', border: '2px solid #9334e6', color: 'var(--mm-text)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap', textAlign: 'left' }}>
              <div>
                <strong style={{ display: 'block', fontSize: 'calc(22 * var(--mm-px))' }}>DOL is available now</strong>
                <span>The entire DOL section is open. Complete all {(dolState.questionIndices || [dolState.questionIndex]).length} question{(dolState.questionIndices || [dolState.questionIndex]).length === 1 ? '' : 's'} before the timer reaches zero.</span>
                {!supportPresentation.hideCountdowns && <div style={{ marginTop: '7px', fontWeight: 900, fontSize: 'calc(18 * var(--mm-px))' }}><DOLCountdown endsAt={dolState.endsAt} /> remaining</div>}
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
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #1a73e8', background: 'var(--mm-surface)', color: 'var(--mm-primary-text)', fontWeight: 900, cursor: 'pointer', fontSize: 'calc(12 * var(--mm-px))' }}
                  >
                    ↻ Restart Preview Fresh
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, color: 'var(--mm-text-strong)', fontSize: 'calc(23 * var(--mm-px))' }}>{assignment.title}</h1>
                {lifecycleBadge.label && <span style={{ padding: '4px 9px', borderRadius: '999px', background: lifecycleBadge.background, color: lifecycleBadge.color, fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, textTransform: 'uppercase' }}>{lifecycleBadge.label}</span>}
                {assignmentHasClasswork && assignment?.guidedNotesBySection?.classwork !== 'off' && <span style={{ padding: '4px 9px', borderRadius: '999px', background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900 }}>GUIDED NOTES · CLASSWORK</span>}
                {/* Which version a section hands out is the teacher's setting,
                    not something a student acts on (pass 3, RUN-16). */}
                {preview && <span style={{ padding: '4px 9px', borderRadius: '999px', background: currentSectionVariantMode === 'shared' ? 'var(--mm-success-bg)' : 'var(--mm-accent-soft)', color: currentSectionVariantMode === 'shared' ? 'var(--mm-success-text)' : 'var(--mm-accent-text)', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900 }}>{currentSectionVariantMode === 'shared' ? `${currentSectionMeta.label.toUpperCase()} · SAME VERSION` : `${currentSectionMeta.label.toUpperCase()} · PERSONALIZED VERSIONS`}</span>}
              </div>
              <div style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))', marginTop: '7px', lineHeight: 1.5 }}>
                {(() => { const dates = studentDueDateLines(assignment, lifecycle); return <>{dates.dueLabel}: {dates.dueText}<br />{dates.finalLabel}: {dates.finalText}</>; })()}
              </div>
              {/* A student who opens the assignment from a Google Classroom link
                  never passes Home or View Results; the assignment itself says
                  its Warm-Up or DOL has a second try open. */}
              {!preview && user?.role === 'student' && (
                <RecoveryInlineNotice
                  opportunities={studentRecoveryByAssignment[assignment.id]}
                  studentId={user.id}
                  onOpen={openStudentRecovery}
                />
              )}
              {!preview && user?.role === 'student' && (
                <StudentSupportTools
                  profile={user.profile}
                  onResourceOpened={(supportId) => recordStudentSupportEvidence({ supportId, eventType: 'used', activityRole: runtimeActivityRole })}
                />
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
              <div style={{ textAlign: 'right', minWidth: 190 }}>
                <div style={{ fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)', textTransform: 'uppercase', fontWeight: 900 }}>
                  {preview
                    ? 'Preview progress'
                    : lifecycle.isPracticeOnly
                      ? 'Frozen recorded grade'
                      : 'Grade so far'}
                </div>
                <div style={{ fontSize: 'calc(22 * var(--mm-px))', fontWeight: 900, color: assignmentFeedbackHeld ? 'var(--mm-primary-text)' : recordedGrade >= 70 ? 'var(--mm-success)' : 'var(--mm-text-strong)' }}>
                  {preview ? `${progress.correct}/${progress.total}` : assignmentFeedbackHeld ? 'Awaiting teacher release' : `${recordedGrade}%`}
                </div>
                {/* Only a grade the student can actually see in Classroom, in
                    plain words — never a teacher draft or sync stage. */}
                {!preview && !assignmentFeedbackHeld && classroomReceipt && classroomReceiptGrade != null && classroomReceiptStudentVisible && (
                  <div style={{ marginTop: 5, fontSize: 'calc(11 * var(--mm-px))', lineHeight: 1.35, color: classroomReceiptFinal ? 'var(--mm-success-text)' : 'var(--mm-primary-text)', fontWeight: 800 }}>
                    Google Classroom shows {classroomReceiptGrade}%{classroomReceiptFinal ? ' (final)' : ' (not final yet)'}
                    {!classroomReceiptFinal && !classroomReceiptCurrent ? <><br />Classroom will catch up with your newer grade.</> : null}
                  </div>
                )}
              </div>
              {!preview && assignmentHasClasswork && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)', textTransform: 'uppercase', fontWeight: 900 }}>Daily classwork</div>
                  <div style={{ fontSize: 'calc(18 * var(--mm-px))', fontWeight: 900, color: classworkGradesByAssignment?.[assignment.id]?.score === 100 ? 'var(--mm-success)' : 'var(--mm-warning-text)' }}>{classworkGradesByAssignment?.[assignment.id]?.score === 100 ? '100 — prerequisite met' : 'In progress'}</div>
                </div>
              )}
            </div>
          </header>

          <nav ref={stickyHeightRef(ASSIGNMENT_NAV_HEIGHT_VAR)} className={`mathmaster-assignment-unified-nav${assignmentNavigationCollapsed ? ' is-collapsed' : ''}`} aria-label="Assignment navigation">
            <div className="mathmaster-assignment-unified-top">
              <button type="button" className="mathmaster-unified-nav-back" onClick={leaveAssignment} aria-label={preview ? 'Back to instructor dashboard' : returnsToAssignmentResult ? 'Back to results' : 'Back to dashboard'}>←</button>
              {!assignmentNavigationCollapsed ? (
                <div className="mathmaster-section-tabs" role="group" aria-label="Assignment sections">
                  {navigationSections.map((section) => {
                    const meta = activitySectionMeta[section.role] || { label: section.role, background: 'var(--mm-surface-control)', color: 'var(--mm-text)', border: 'var(--mm-border-strong)' };
                    const targetEntry = sectionNavigationTarget(section);
                    const sectionAvailable = Boolean(targetEntry);
                    const access = sectionAccessFor(section.entries[0]);
                    const readOnly = sectionAvailable && access.state === SECTION_ACCESS.READ_ONLY;
                    const active = currentNavigationSection?.role === section.role;
                    const reasonId = `mathmaster-section-reason-${section.role}`;
                    // A locked tab stays focusable (aria-disabled, not
                    // disabled) so a keyboard or screen-reader student reaches
                    // its reason; pressing it shows the reason on screen.
                    return (
                      <Fragment key={`section-tab-${section.role}-${section.entries[0]?.index}`}>
                        <button
                          type="button"
                          className={`mathmaster-section-tab${active ? ' is-active' : ''}${section.allCorrect ? ' is-complete' : ''}${sectionAvailable ? '' : ' is-locked'}${readOnly ? ' is-read-only' : ''}`}
                          style={{ '--section-color': meta.color, '--section-border': meta.border, '--section-bg': meta.background }}
                          onClick={() => (targetEntry
                            ? changeQuestion(targetEntry.index)
                            : setSectionLockNote({ assignmentId: activeAssignmentId, role: section.role, text: access.reason }))}
                          aria-disabled={sectionAvailable ? undefined : 'true'}
                          aria-current={active ? 'page' : undefined}
                          aria-describedby={access.reason ? reasonId : undefined}
                          title={access.reason || `${compactSectionLabel(section)}: ${section.progress.done} of ${section.progress.total} done.`}
                        >
                          {section.allCorrect && <span className="mathmaster-section-complete-medallion" aria-hidden="true">✓</span>}
                          <span className="mathmaster-section-tab-copy">
                            <span className="mathmaster-section-tab-label">{compactSectionLabel(section)}</span>
                            <small>{sectionAvailable && !readOnly ? section.progress.label : `${sectionAvailable ? '' : '🔒 '}${access.short}`}</small>
                          </span>
                        </button>
                        {access.reason && <span id={reasonId} style={SR_ONLY_STYLE}>{access.reason}</span>}
                      </Fragment>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div className="mathmaster-collapsed-current-location" role="status">
                    <strong>{compactSectionLabel(currentNavigationSection || { role: activeQuestionRole })}</strong>
                    <span className="mathmaster-location-long">Question {currentSectionQuestionNumber} of {currentSectionQuestionCount}</span>
                    <span className="mathmaster-location-short" aria-hidden="true">Q{currentSectionQuestionNumber} of {currentSectionQuestionCount}</span>
                  </div>
                  <div className="mathmaster-unified-question-controls mathmaster-focus-inline-controls">
                    <button type="button" onClick={() => previousQuestionEntry && changeQuestion(previousQuestionEntry.index)} disabled={!previousQuestionEntry} aria-label="Previous question">‹ <span>Previous</span></button>
                    <select
                      aria-label="Choose a question"
                      value={currentQuestionIndex}
                      onChange={(event) => changeQuestion(Number(event.target.value))}
                    >
                      {visibleQuestionEntries.map((entry) => (
                        <option key={entry.index} value={entry.index} disabled={!entryIsAvailable(entry)} data-locked={entryIsAvailable(entry) ? undefined : 'true'}>{compactSectionLabel(entry)} Q{entry.sectionPosition + 1}{entryIsAvailable(entry) ? '' : ` · ${sectionAccessFor(entry).short}`}</option>
                      ))}
                    </select>
                    <button type="button" className="mathmaster-unified-next" onClick={() => nextQuestionEntry && changeQuestion(nextQuestionEntry.index)} disabled={!nextQuestionEntry} aria-label="Next question"><span>Next</span> ›</button>
                  </div>
                </>
              )}
              {/* The Warm-Up's time, beside the section, in both navigator
                  states (pass 3, RUN-14): on a phone the banner that carried
                  it covered the task card, and its 2:00 / 0:30 warnings must
                  not depend on whether "Show progress" is open. */}
              {!preview && currentIsWarmup && warmupState.status === 'active' && (
                <SectionTimeLeft compact label="Warm-Up" endsAt={warmupState.endsAt} hideCountdown={supportPresentation.hideCountdowns} />
              )}
              {/* The phone's chip (wider screens keep the header and banners):
                  the most urgent status, or "More" — where a phone student
                  finds "Grade so far" and Support tools. */}
              {assignmentChipShown && (
                <button
                  type="button"
                  className={`mathmaster-assignment-status-chip is-${assignmentStatusLines[0]?.tone || 'more'}`}
                  aria-expanded={assignmentStatusOpen}
                  aria-controls={assignmentStatusOpen ? 'mathmaster-assignment-status-panel' : undefined}
                  onClick={() => setAssignmentStatusOpenFor(assignmentStatusOpen ? null : activeAssignmentId)}
                >
                  {assignmentStatusLines.length
                    ? `${assignmentStatusLines[0].chip}${assignmentStatusLines.length > 1 ? ` +${assignmentStatusLines.length - 1}` : ''}`
                    : <>More <span aria-hidden="true">{assignmentStatusOpen ? '▴' : '▾'}</span></>}
                </button>
              )}
              <button
                type="button"
                className="mathmaster-overview-button"
                onClick={() => setAssignmentOverviewExpanded((current) => !current)}
                aria-expanded={assignmentOverviewExpanded}
              >
                <span className="mathmaster-overview-button-label">Overview</span> {assignmentOverviewExpanded ? '▴' : '▾'}
              </button>
              <button
                type="button"
                className="mathmaster-focus-view-button"
                onClick={toggleAssignmentNavigation}
                aria-expanded={!assignmentNavigationCollapsed}
                title={assignmentNavigationCollapsed ? 'Show section progress and question numbers' : 'Hide section progress to make more room for the problem'}
              >
                {assignmentNavigationCollapsed ? 'Show progress' : 'Focus view'}
              </button>
            </div>

            {!assignmentNavigationCollapsed && (
            <div className="mathmaster-assignment-unified-bottom">
              <div className={`mathmaster-current-section-inline${currentNavigationSection?.allCorrect ? ' is-complete' : ''}`}>
                {/* Where the student is and what is left. The grade lines
                    live in Overview (pass 3, RUN-7): four lines of grade text
                    here pushed the work down on every question. */}
                <div className="mathmaster-current-section-summary">
                  <strong>{compactSectionLabel(currentNavigationSection || { role: activeQuestionRole })}</strong>
                  <span>
                    {currentNavigationSection?.complete
                      ? '✓ Section done'
                      : `${currentSectionCompletedCount} of ${currentSectionQuestionCount} done · ${currentSectionRemainingCount} left`}
                  </span>
                  <small>Question {currentSectionQuestionNumber} of {currentSectionQuestionCount}</small>
                </div>
                <div className="mathmaster-question-number-strip" role="group" aria-label={`${compactSectionLabel(currentNavigationSection || { role: activeQuestionRole })} questions`}>
                  {(currentNavigationSection?.entries || []).map((entry) => {
                    const shown = navigatorQuestionFor(entry);
                    const current = entry.index === currentQuestionIndex;
                    const available = shown.status !== QUESTION_STATUS.LOCKED;
                    return (
                      <button
                        type="button"
                        key={`section-question-${entry.index}`}
                        className={`mathmaster-question-number is-${shown.status}${current ? ' is-current' : ''}${available ? '' : ' is-locked'}`}
                        style={{ '--section-color': currentSectionMeta.color, '--section-border': currentSectionMeta.border, '--section-bg': currentSectionMeta.background }}
                        onClick={() => available && changeQuestion(entry.index)}
                        disabled={!available}
                        aria-current={current ? 'step' : undefined}
                        aria-label={`${compactSectionLabel(entry)} question ${entry.sectionPosition + 1}: ${shown.spoken}${current ? ', current question' : ''}`}
                        title={`${compactSectionLabel(entry)} Question ${entry.sectionPosition + 1} · ${shown.label}`}
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
                  {visibleQuestionEntries.map((entry) => (
                    <option key={entry.index} value={entry.index} disabled={!entryIsAvailable(entry)} data-locked={entryIsAvailable(entry) ? undefined : 'true'}>{compactSectionLabel(entry)} Q{entry.sectionPosition + 1}{entryIsAvailable(entry) ? '' : ` · ${sectionAccessFor(entry).short}`}</option>
                  ))}
                </select>
                <button type="button" className="mathmaster-unified-next" onClick={() => nextQuestionEntry && changeQuestion(nextQuestionEntry.index)} disabled={!nextQuestionEntry} aria-label="Next question"><span>Next</span> ›</button>
              </div>
            </div>
            )}
            {visibleSectionLockNote && (
              <p className="mathmaster-section-lock-note" role="status">
                <span>{visibleSectionLockNote}</span>
                <button type="button" onClick={() => setSectionLockNote(null)} aria-label="Close this note">×</button>
              </p>
            )}
            {assignmentStatusOpen && (
              <div id="mathmaster-assignment-status-panel" className="mathmaster-assignment-status-panel">
                {assignmentStatusLines.map((line) => (
                  <div key={line.key} className={`mathmaster-assignment-status-line is-${line.tone}`}>
                    <strong>{line.title}</strong>
                    <span>{line.text}</span>
                    {line.action && <button type="button" onClick={line.action.onClick}>{line.action.label}</button>}
                  </div>
                ))}
                <div className="mathmaster-assignment-status-line is-grade">
                  <strong>{gradeSoFarLine}</strong>
                  {gradeDetailLine && <span>{gradeDetailLine}</span>}
                </div>
                {/* The header's Support tools (a teacher's materials, a
                    formula sheet): the header is hidden where this panel
                    shows, so the same panel rides here. */}
                {!preview && user?.role === 'student' && (
                  <StudentSupportTools
                    className="mathmaster-narrow-support-tools"
                    profile={user.profile}
                    onResourceOpened={(supportId) => recordStudentSupportEvidence({ supportId, eventType: 'used', activityRole: runtimeActivityRole })}
                  />
                )}
              </div>
            )}
            {/* The DOL's time, seconds in its last minute, with warnings at
                2:00 and 0:30 (pass 3, RUN-10). Its end is the lifecycle
                state's (a student's extra time lives there). */}
            {!preview && dolState.status === 'active' && (
              <div className="mathmaster-unified-nav-alert">
                <SectionTimeLeft label="Exit ticket (DOL)" endsAt={dolState.endsAt} hideCountdown={supportPresentation.hideCountdowns} />
              </div>
            )}
          </nav>

          {assignmentOverviewExpanded && (
          <div className="mathmaster-question-navigation" style={{ display: 'grid', gap: '14px', marginBottom: '24px' }}>
            {/* THE GRADE LINES, MOVED HERE FROM THE NAVIGATOR (pass 3, RUN-7).
                "Grade so far", never "if submitted now": there is no
                assignment-level submit (RUN-16). */}
            <section aria-label="Your grade" className="mathmaster-overview-grade" style={{ padding: '11px 13px', borderRadius: '12px', border: '1px solid var(--mm-border)', background: 'var(--mm-surface)', color: 'var(--mm-text)', display: 'grid', gap: 3, textAlign: 'left' }}>
              <strong style={{ fontSize: 'calc(15 * var(--mm-px))', color: assignmentFeedbackHeld ? 'var(--mm-primary-text)' : 'var(--mm-text-strong)' }}>
                {gradeSoFarLine}
              </strong>
              {gradeDetailLine && <span style={{ fontSize: 'calc(13 * var(--mm-px))' }}>{gradeDetailLine}</span>}
            </section>
            {navigationSections.map((section) => {
              const sectionMeta = activitySectionMeta[section.role] || { label: section.role, background: 'var(--mm-surface-control)', color: 'var(--mm-text)', border: 'var(--mm-border-strong)' };
              const sectionName = compactSectionLabel(section);
              const sectionGrade = currentSectionGrades[section.role] || null;
              const sectionOfficialGrade = currentSectionOfficialGrades[section.role] || null;
              const sectionHeld = section.entries.some((entry) => entryFeedbackHeld(entry));
              const sectionScoreLine = preview
                ? `Section score ${sectionGrade?.score ?? 0}% · ${sectionGrade?.attempted ?? 0}/${sectionGrade?.total ?? 0} answered`
                : sectionHeld
                  ? 'Score shows after your teacher releases it'
                  : lifecycle.isPracticeOnly
                    ? `Section score ${sectionOfficialGrade?.score ?? 0}% (set) · practice ${sectionGrade?.score ?? 0}%`
                    : `Section score ${sectionGrade?.score ?? 0}% · ${sectionGrade?.attempted ?? 0}/${sectionGrade?.total ?? 0} answered`;
              const sectionAccess = sectionAccessFor(section.entries[0]);
              return (
                <section key={`${section.role}-${section.entries[0]?.index}`} aria-label={`${sectionName} questions`} style={{ padding: '13px', borderRadius: '12px', border: `2px solid ${section.allCorrect ? '#188038' : sectionMeta.border}`, background: sectionMeta.background, boxShadow: section.allCorrect ? '0 0 0 3px rgba(24,128,56,0.12)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', color: sectionMeta.color, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 'calc(15 * var(--mm-px))', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{sectionName}</strong>
                    {section.allCorrect ? (
                      <span aria-label={`${sectionName} section complete`} style={{ padding: '7px 11px', borderRadius: 999, background: '#188038', color: '#fff', fontSize: 'calc(12 * var(--mm-px))', fontWeight: 950, letterSpacing: '0.02em', boxShadow: '0 2px 6px rgba(24,128,56,0.28)' }}>✓ {sectionName.toUpperCase()} COMPLETE</span>
                    ) : (
                      <span style={{ fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800 }}>{section.progress.label === 'All submitted' ? 'All submitted' : `${section.progress.done} of ${section.progress.total} done`}</span>
                    )}
                    <span style={{ flexBasis: '100%', fontSize: 'calc(12 * var(--mm-px))', fontWeight: 800 }}>{sectionScoreLine}</span>
                    {sectionAccess.reason && <span style={{ flexBasis: '100%', fontSize: 'calc(12 * var(--mm-px))', fontWeight: 700, color: 'var(--mm-text)' }}>{sectionAccess.reason}</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 145px), 1fr))', gap: '10px' }}>
                    {section.entries.map((entry) => {
                      const { index, sectionPosition } = entry;
                      const record = normalizeQuestionRecord(workingTracker?.[index]);
                      const cardAssessment = questionAssessmentFramework(questions[index] || {});
                      const cardAssessmentLabel = cardAssessment.examStyle && cardAssessment.framework
                        ? `${FRAMEWORK_LABELS[cardAssessment.framework] || cardAssessment.framework} practice`
                        : '';
                      const shown = navigatorQuestionFor(entry);
                      const sectionUnavailable = shown.status === QUESTION_STATUS.LOCKED;
                      // Colour follows the same state as the words: green only
                      // for a verdict the student may see.
                      const cardState = shown.status === QUESTION_STATUS.CORRECT
                        ? { background: 'var(--mm-success-bg)', color: 'var(--mm-success-text)' }
                        : shown.status === QUESTION_STATUS.SUBMITTED
                          ? { background: 'var(--mm-primary-subtle)', color: 'var(--mm-primary-text)' }
                          : shown.status === QUESTION_STATUS.CLOSED
                            ? { background: 'var(--mm-surface-control)', color: 'var(--mm-text)' }
                            : shown.status === QUESTION_STATUS.TRY_AGAIN
                              ? { background: 'var(--mm-warning-soft)', color: 'var(--mm-warning-text)' }
                              : { background: 'var(--mm-surface)', color: 'var(--mm-text-strong)' };
                      return (
                        <button
                          type="button"
                          key={index}
                          onClick={() => !sectionUnavailable && changeQuestion(index)}
                          disabled={sectionUnavailable}
                          aria-label={`${sectionName} question ${sectionPosition + 1}: ${shown.label}`}
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
                          <div style={{ fontSize: 'calc(14 * var(--mm-px))', fontWeight: 'bold' }}>Question {sectionPosition + 1}</div>
                          <div style={{ marginTop: '5px', padding: '3px 7px', borderRadius: '999px', background: sectionMeta.background, color: sectionMeta.color, border: `1px solid ${sectionMeta.border}`, fontSize: 'calc(10 * var(--mm-px))', fontWeight: 900 }}>{sectionName}</div>
                          {cardAssessmentLabel && <div aria-label={`${cardAssessmentLabel} question`} style={{ marginTop: '5px', padding: '3px 7px', borderRadius: 999, background: 'var(--mm-accent-soft)', color: 'var(--mm-accent-text)', border: '1px solid var(--mm-accent-border)', fontSize: 'calc(10 * var(--mm-px))', fontWeight: 950 }}>{cardAssessmentLabel}</div>}
                          <div style={{ fontSize: 'calc(12 * var(--mm-px))', marginTop: '7px', fontWeight: 'bold' }}>{shown.label}</div>
                          {record.totalAttempts > 0 && <div style={{ fontSize: 'calc(11 * var(--mm-px))', marginTop: '3px', opacity: 0.85 }}>{record.totalAttempts} {record.totalAttempts === 1 ? 'try' : 'tries'} used</div>}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          )}
          <QuestionAnnouncer
            announceKey={`${activeAssignmentId}-${currentQuestionIndex}`}
            position={`${currentSectionMeta.label}, question ${currentSectionQuestionNumber} of ${currentSectionQuestionCount}`}
            containerRef={assignmentQuestionStageRef}
          />
          <main ref={assignmentQuestionStageRef} className="mathmaster-question-stage" style={{ background: 'var(--mm-surface)', borderRadius: '12px', padding: '10px', minHeight: '500px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            {questions[currentQuestionIndex]?.instructionalPhase
              && (preview || assignment.showInstructionalPhaseLabelsToStudents === true)
              && <div aria-label="Instructional phase" style={{ display: 'inline-block', margin: '6px 8px', padding: '5px 10px', borderRadius: 999, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', fontWeight: 950, letterSpacing: '0.08em' }}>{({ iDo: 'I DO', weDo: 'WE DO', youDo: 'YOU DO' })[questions[currentQuestionIndex].instructionalPhase]}</div>}
            {/* "Ask my teacher" answers, on any question of this assignment —
                one closed since it was asked keeps its answer here. */}
            {!preview && <TeacherAnswersList questions={askMyTeacher.questions} compact />}
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
                ? currentDolCopy.lockMessage
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
              // "Practise one like this" after the last miss: Classwork and
              // Practice sections only, by the section's own role (a DOL in
              // post-due practice runs as 'practice' but is still a DOL).
              practiceLikeThisAllowed={['classwork', 'practice'].includes(activeQuestionRole)}
              activityPolicy={runtimeQuestionActivityPolicy}
              // The assignment's calculator setting (e.g. "graphing"), above the
              // question's own: calculatorPolicy.js resolveCalculatorPolicy.
              assignmentCalculatorMode={assignment?.toolPolicy?.calculator || null}
              feedbackReleased={currentFeedbackReleased}
              assessmentReviewReleased={assignmentFeedbackWasReleased(assignment)}
              replacementWarning={replacementWarning}
              draftKey={buildQuestionDraftKey({ studentId: preview ? 'teacher-preview' : user?.id || 'anonymous', assignmentId: activeAssignmentId, questionIndex: currentQuestionIndex, variantIndex: currentRecord.variantIndex, sessionMode: draftSessionMode })}
              assignmentId={activeAssignmentId}
              executionScope={preview ? 'teacherPreview' : lifecycle.isPracticeOnly ? 'postDuePractice' : 'student'}
              onNextQuestion={engineNextEntry ? () => changeQuestion(engineNextEntry.index) : null}
              nextQuestionLabel={nextQuestionDestinationLabel}
              nextQuestionSectionLabel={nextQuestionSectionMeta?.label || ''}
              sectionComplete={Boolean(currentNavigationSection?.complete)}
              sectionLabel={currentSectionMeta.label}
              sectionQuestionCount={currentSectionQuestionCount}
              onContinueSection={assignmentHandoff ? continueAfterSection : null}
              continueSectionLabel={assignmentHandoff?.label || ''}
              onGoBackToQuestion={skippedQuestion ? () => changeQuestion(skippedQuestion.index) : null}
              goBackLabel={skippedQuestion?.label || ''}
              onSupportEvidence={preview || lifecycle.isPracticeOnly
                ? null
                : (evidence) => recordStudentSupportEvidence({ ...evidence, questionIndex: currentQuestionIndex, activityRole: runtimeActivityRole })}
              onAskTeacher={preview || lifecycle.isPracticeOnly || user?.role !== 'student'
                ? null
                : (requested) => setHelpRequest(nextHelpRequest({ requested, assignmentId: activeAssignmentId, questionIndex: currentQuestionIndex }))}
              helpRequested={helpRequest?.assignmentId === activeAssignmentId && helpRequest?.questionIndex === currentQuestionIndex}
              askTeacherContext={{
                mode: askMyTeacher.mode,
                acknowledgement: askMyTeacher.acknowledgement,
                question: questionFor(askMyTeacher.questions, { assignmentId: activeAssignmentId, questionIndex: currentQuestionIndex }),
                onSendQuestion: askMyTeacher.canLeaveQuestion
                  ? ({ existing, text }) => askMyTeacher.sendQuestion({
                    existing,
                    text,
                    questionIndex: currentQuestionIndex,
                    questionLabel: `${currentSectionMeta.label} · Question ${currentSectionQuestionNumber}`,
                    assignmentTitle: assignment?.title || '',
                  })
                  : null,
              }}
            />
            {/* SAVE HEALTH, IN THE STUDENT'S WORDS.
                A STUDENT IS NEVER TOLD "SUBMITTED" BEFORE THE SERVER HAS IT.
                That sentence is the whole point of this line: during the
                September 14 incident the button said the work was in and the
                teacher's gradebook never received it. "Submitted to MathMaster"
                is now reachable only from a drain that left nothing owed, and
                every other state names where the work actually is and whether
                anything is still to come. */}
            {/* ANNOUNCED ONLY WHEN THE WORK NEEDS THE STUDENT: offline, not
                recorded, refused. A routine save is not a second announcement
                of the result the question just gave. The region is always
                mounted and only its words change — a live region that appears
                with its text is often not read at all. "Not stored" is said
                by the question and a toast already. */}
            {!preview && (
              <span role="status" aria-live="polite" data-save-line-announcement="" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
                {studentSaveLineAnnouncement}
              </span>
            )}
            {!preview && studentPersistenceStatus !== 'idle' && (
              <p data-save-line="" style={{ margin: '8px 4px 0', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' }}>
                {/* A draft is "Draft saved"; only an answer the student sent
                    is ever "Answer recorded", and only once the server has it
                    (RUN-11, saveStatusModel.describeRuntimeSaveLine). */}
                {studentSaveLine
                  ? studentSaveLine
                          : studentPersistenceStatus === 'rejected'
                            ? 'This change was not accepted because the assignment is no longer available.'
                            // The device queue could not be written: the last
                            // change is on screen only (saveStatusModel.js).
                            // Never "saved" — nothing was (RUN-3).
                            : studentPersistenceStatus === 'volatile'
                              ? 'Not saved · this device could not store your last change. Keep this tab open and try it again.'
                              : 'Saved on this device only. MathMaster will finish saving when you are back online.'}
              </p>
            )}
            {/* UNFINISHED WORK THAT IS NOT BEING SAVED IS NEVER SILENT.
                Storage full, a record the backup refuses, or a backup at its
                caps: the student is told where the work is and what to do,
                in one plain sentence, until it is saved again. */}
            {!preview && draftSaveHealthVersion >= 0 && (() => {
              const problem = describeDraftSaveProblems(draftSaveProblemsFor({ studentId: user?.id, assignmentId: activeAssignmentId }));
              return problem ? (
                <p role="alert" data-draft-save-problem={problem.kind} style={{ margin: '8px 4px 0', padding: '8px 10px', borderRadius: 8, background: 'var(--mm-warning-bg)', border: '1px solid #f9ab00', color: 'var(--mm-warning-text)', fontWeight: 700, fontSize: 'calc(13 * var(--mm-px))' }}>
                  {problem.text}
                </p>
              ) : null;
            })()}
            {!preview && studentReportingError && (
              <p role="status" style={{ margin: '2px 4px 0', color: 'var(--mm-warning-text)', fontSize: 'calc(11 * var(--mm-px))' }}>
                Device reporting unavailable ({studentReportingError}); locally saved work is unchanged.
              </p>
            )}
            {/* "When time ends" is a promise only an open window can keep. */}
            {!preview && runtimeActivityRole === 'dol' && currentDolCopy?.openNotice && (
              <p style={{ margin: '8px 4px 0', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' }}>{currentDolCopy.openNotice}</p>
            )}
            {!preview && runtimeActivityRole === 'warmup' && warmupState.status === 'active' && (
              <p style={{ margin: '8px 4px 0', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' }}>Your latest completed response will be submitted automatically when time ends.</p>
            )}
            {/* AFTER THE CLOSE, SAY WHAT ACTUALLY HAPPENED.
                Never "submitted" for a response that was not complete — the
                status comes from the server's own finalization receipt, and
                only once there is one: receipts are read when the assignment
                opens, and a question never worked on gets none, so a
                "checking" line could stand forever. A DOL that ended today
                says who closed it (describeDolClose); on another day, and for
                a Warm-Up, the receipt reads as before. */}
            {!preview && currentCheckpointOutcome && !currentSectionOpenNow && (
              <p role="status" aria-live="polite" style={{ margin: '8px 4px 0', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' }}>
                {currentDolCopy?.closeReceipt || (currentCheckpointOutcome === 'auto-submitted'
                  ? 'Time ended. Your latest completed response was submitted automatically.'
                  : currentCheckpointOutcome === 'explicitly-submitted'
                    ? 'Time ended. Your submitted work has been saved.'
                    : 'Time ended. No completed response was available to submit.')}
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
      onOpenAssignment={(assignmentId) => openStudentAssignmentResult(assignmentId, { origin: compact ? NAV_LEVEL.HOME : NAV_LEVEL.GRADES })}
      onMarkSeen={() => { if (user?.id) markWhatChangedSeen(user.id, Date.now()); }}
    />
  );

  // This is the authenticated-student shell boundary. Keeping identity here,
  // outside every destination, makes it survive Focus View, compact/mobile
  // assignment controls, Live Challenge, and screens that omit global nav.
  //
  // `main`: the screen has no main landmark of its own, so the shell wraps it
  // in one (NAV-15) — Home, Assignments, Grades, Rewards, Live Challenge,
  // Test Cycle and Recovery. Screens that draw their own <main> (the result
  // page, My Math Path, Tests & Exams, the assignment) keep the empty anchor.
  const renderStudentIdentityShell = (content, { preview = false, main = false } = {}) => (
    <div data-authenticated-student-shell={preview ? 'teacher-preview' : 'student'} style={{ minHeight: '100vh' }}>
      <SkipToContent />
      {/* NAV-3: the new screen's name, said once after a screen change. */}
      {!preview && (
        <div role="status" aria-live="polite" aria-atomic="true" data-screen-announcement className="mm-visually-hidden">
          {studentScreenAnnouncement}
        </div>
      )}
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
          <strong style={{ display: 'block', fontSize: 'calc(18 * var(--mm-px))' }}>{studentSpotlightRequest.teacherLabel || 'Your teacher'} would like to show your current MathMaster work to the class.</strong>
          <div style={{ marginTop: 5, fontSize: 'calc(13 * var(--mm-px))' }}>Nothing is visible unless you choose Present Now. This does not share your Chromebook screen.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button type="button" onClick={() => respondToSpotlight(true)} style={{ padding: '9px 14px', border: 0, borderRadius: 8, background: '#681da8', color: '#fff', fontWeight: 900 }}>Present Now</button><button type="button" onClick={() => respondToSpotlight(false)} style={{ padding: '9px 14px', border: '1px solid #681da8', borderRadius: 8, background: 'var(--mm-surface)', color: 'var(--mm-accent-text)', fontWeight: 900 }}>Not Now</button></div>
        </section>
      )}
      {!preview && studentSpotlightRequest?.status === SPOTLIGHT_STATUS.ACCEPTED && (
        <section role="status" style={{ margin: '10px auto', maxWidth: 760, padding: '10px 14px', borderRadius: 10, background: '#681da8', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><strong>Presenting to class</strong><button type="button" onClick={stopStudentSpotlight} style={{ padding: '7px 11px', border: '1px solid var(--mm-border-soft)', borderRadius: 7, background: 'var(--mm-surface)', color: 'var(--mm-accent-text)', fontWeight: 900 }}>Stop Presenting</button></section>
      )}
      {!preview && studentSpotlightMessage && <div role="status" style={{ margin: '8px auto', maxWidth: 760, padding: '8px 12px', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' }}>{studentSpotlightMessage}</div>}
      {main ? (
        // The screen's main landmark; the skip link enters it at its h1.
        <main id={MAIN_CONTENT_ID} tabIndex={-1} data-student-screen-main>
          {content}
        </main>
      ) : (
        <>
          {/* Where the skip link lands: focus here, the next Tab enters the screen. */}
          <div id={MAIN_CONTENT_ID} tabIndex={-1} />
          {content}
        </>
      )}
    </div>
  );

  // A student screen with no main landmark of its own (NAV-15).
  const renderStudentScreen = (content) => renderStudentIdentityShell(content, { main: true });

  // The address the page opened at, opened once the account has loaded
  // (app/routes/useUrlArrival.js). Called after every action it hands on is
  // declared, and before the session guard returns, as a hook must be.
  useUrlArrival({
    urlArrival,
    setUrlArrival,
    user,
    // A student's lessons carry their own controls (an extension, an
    // excusal, a reopen): the address opens once the lessons on screen were
    // projected with the controls the listener answered, not before.
    ready: user?.role !== 'student' || (
      [STUDENT_CONTROLS_STATUS.READY, STUDENT_CONTROLS_STATUS.UNAVAILABLE].includes(studentAssignmentControls.status)
      && lastPublishedRef.current?.[4] === studentAssignmentControls
    ),
    assignments,
    toastInfo,
    student: {
      isTestCycle: isTestCycleAssignment,
      questionEntriesFor: studentQuestionEntriesFor,
      startAssignment,
      openStudentAssignmentResult,
      openStudentDashboardMode,
      setActiveTestCycleAssignmentId,
      setMathPathArrival,
      setPathLaunchTeks,
    },
    teacher: {
      canAdminister: user?.isRootAdmin === true || isRootAdminEmail(user?.email),
      startTeacherPreview,
      setTeacherWorkspaceMode,
      setAdminTab,
      setTeacherTab,
      setAssignmentHubTarget,
    },
  });

  // The screen belongs to the account signed in NOW. When auth has moved on —
  // signed out in another tab, the next student signing in on a shared
  // Chromebook, another account signed in over this one — not one more frame
  // of the previous account's screens renders while its state is torn down.
  const userIsSignedInAccount = Boolean(user && auth.status === 'ready' && auth.session?.uid && auth.session.uid === user.uid);
  if (!userIsSignedInAccount) {
    return (
      <SessionGate
        authStatus={auth.status}
        hydrationError={sessionHydrationError}
        hydrating={sessionHydrating}
        launchAssignment={launchAssignment}
        onSignOut={() => { resetAddressToHome(); auth.signOut(); }}
      />
    );
  }

  if (isTeacherPreview) {
    return renderStudentIdentityShell(renderAssignmentWorkspace(true), { preview: true });
  }

  if (user.role === 'teacher') {
    // The teacher's screen, verbatim, in its own chunk (app/teacher/TeacherWorkspace.jsx):
    // every input it reads is passed by name. Like the other teacher screens
    // it suspends to AppShell's boundary while its chunk first loads.
    return (
      <TeacherWorkspace
        SCHOOL_NON_INSTRUCTIONAL_KEYS={SCHOOL_NON_INSTRUCTIONAL_KEYS}
        V5_COMPILER_PLUMBING_ERROR={V5_COMPILER_PLUMBING_ERROR}
        actionGradeScope={actionGradeScope}
        activeClass={activeClass}
        adminTab={adminTab}
        allStudents={allStudents}
        assignmentFolderPaths={assignmentFolderPaths}
        assignmentGroupOpen={assignmentGroupOpen}
        assignmentHubTarget={assignmentHubTarget}
        assignmentPreflight={assignmentPreflight}
        assignmentPreflightBusy={assignmentPreflightBusy}
        assignmentSearch={assignmentSearch}
        assignments={assignments}
        attendanceReviewBusyKey={attendanceReviewBusyKey}
        auth={auth}
        autoPublishAssignmentPackageToClassroom={autoPublishAssignmentPackageToClassroom}
        beginEditAssignmentDates={beginEditAssignmentDates}
        beginTeacherWorksheetExport={beginTeacherWorksheetExport}
        bulkBusy={bulkBusy}
        calculateGrade={calculateGrade}
        caseReviewStudentId={caseReviewStudentId}
        ccmrAuditWarnings={ccmrAuditWarnings}
        classEvidenceByStudentId={classEvidenceByStudentId}
        classEvidenceLoading={classEvidenceLoading}
        classSchedule={classSchedule}
        classes={classes}
        classesById={classesById}
        classroomManagerAssignmentId={classroomManagerAssignmentId}
        classroomSyncProposal={classroomSyncProposal}
        clearAssignmentSelection={clearAssignmentSelection}
        confirmAction={confirmAction}
        contentUpgradeRequest={contentUpgradeRequest}
        courseLevelByStudentId={courseLevelByStudentId}
        courseProfiles={courseProfiles}
        courseProfilesSaving={courseProfilesSaving}
        dolAttemptGrantBusyKey={dolAttemptGrantBusyKey}
        dolControlBusyKey={dolControlBusyKey}
        dolUnlockBusyKey={dolUnlockBusyKey}
        editingAssignmentDates={editingAssignmentDates}
        editingAssignmentId={editingAssignmentId}
        endLiveTeaching={endLiveTeaching}
        exportTeacherAssignmentWorksheetPdf={exportTeacherAssignmentWorksheetPdf}
        feedbackReleaseBusyId={feedbackReleaseBusyId}
        fetchAssignments={fetchAssignments}
        fetchTeacherRosterSummaries={fetchTeacherRosterSummaries}
        focusedTestCycleAssignmentId={focusedTestCycleAssignmentId}
        formatTime={formatTime}
        gradeExportScope={gradeExportScope}
        gradebookFilter={gradebookFilter}
        gradebookHasPracticePass={gradebookHasPracticePass}
        gradebookProgressFilter={gradebookProgressFilter}
        gradingPeriodBusy={gradingPeriodBusy}
        gradingPeriodSettings={gradingPeriodSettings}
        handleApplyShorterAttendanceExtension={handleApplyShorterAttendanceExtension}
        handleBulkArchive={handleBulkArchive}
        handleBulkMoveToFolder={handleBulkMoveToFolder}
        handleChangeClassPeriod={handleChangeClassPeriod}
        handleCreateFolder={handleCreateFolder}
        handleCreateGradingPeriod={handleCreateGradingPeriod}
        handleDeleteFolder={handleDeleteFolder}
        handleDolControlForClass={handleDolControlForClass}
        handleGoToClassFromHome={handleGoToClassFromHome}
        handleGrantDOLAttemptForClass={handleGrantDOLAttemptForClass}
        handleGrantDOLAttemptForStudents={handleGrantDOLAttemptForStudents}
        handleKeepAttendanceExtension={handleKeepAttendanceExtension}
        handleLinkWarmupChallenge={handleLinkWarmupChallenge}
        handleLoadDeliveredRigor={handleLoadDeliveredRigor}
        handleLogout={handleLogout}
        handleMoveAssignmentToFolder={handleMoveAssignmentToFolder}
        handleMoveSelectedAssignmentsToGradingPeriod={handleMoveSelectedAssignmentsToGradingPeriod}
        handlePersonalPathRecommendation={handlePersonalPathRecommendation}
        handleRecordStudentSupportEvent={handleRecordStudentSupportEvent}
        handleReleaseAssignmentFeedback={handleReleaseAssignmentFeedback}
        handleRenameFolder={handleRenameFolder}
        handleRepairClassroomAssignmentPost={handleRepairClassroomAssignmentPost}
        handleSaveClassSchedule={handleSaveClassSchedule}
        handleSaveCourseProfiles={handleSaveCourseProfiles}
        handleSaveOverrides={handleSaveOverrides}
        handleSavePacing={handleSavePacing}
        handleSaveWeeklyGoal={handleSaveWeeklyGoal}
        handleSetCurrentGradingPeriod={handleSetCurrentGradingPeriod}
        handleSetGradingPeriodArchived={handleSetGradingPeriodArchived}
        handleSupportProfileSaved={handleSupportProfileSaved}
        handleToggleArchiveAssignment={handleToggleArchiveAssignment}
        handleTogglePauseAssignment={handleTogglePauseAssignment}
        handleToggleSectionAccessForClass={handleToggleSectionAccessForClass}
        handleToggleWarmupForClass={handleToggleWarmupForClass}
        handleUnlockDOLForClass={handleUnlockDOLForClass}
        handleUpdateCourseProfile={handleUpdateCourseProfile}
        handleViewClassGradebook={handleViewClassGradebook}
        homeNavigationPeriod={homeNavigationPeriod}
        libraryNavigation={libraryNavigation}
        liveFocus={liveFocus}
        liveTeachingSession={liveTeachingSession}
        loadClassGradeRecords={loadClassGradeRecords}
        movingFolderAssignmentId={movingFolderAssignmentId}
        movingFolderValue={movingFolderValue}
        needsAttentionQueue={needsAttentionQueue}
        now={now}
        openAssignmentHub={openAssignmentHub}
        openAssignmentPreflight={openAssignmentPreflight}
        openDeleteDialog={openDeleteDialog}
        openGradeExport={openGradeExport}
        openGradebookFor={openGradebookFor}
        openIEPReport={openIEPReport}
        openLiveFor={openLiveFor}
        openTeacherScratchpad={openTeacherScratchpad}
        pacingBusy={pacingBusy}
        pacingByClass={pacingByClass}
        parentContactSourceAction={parentContactSourceAction}
        parentContacts={parentContacts}
        pathInterventionBusyStudentId={pathInterventionBusyStudentId}
        preflightRosterSizesByClassId={preflightRosterSizesByClassId}
        presenceById={presenceById}
        profileDrawerLearningProfile={profileDrawerLearningProfile}
        profileDrawerPlan={profileDrawerPlan}
        profileDrawerSessionSummaries={profileDrawerSessionSummaries}
        profileDrawerStudent={profileDrawerStudent}
        profileDrawerSupportEvents={profileDrawerSupportEvents}
        questionEditorAssignment={questionEditorAssignment}
        quickSearchOpen={quickSearchOpen}
        refreshTeacherRosterAfterNameChange={refreshTeacherRosterAfterNameChange}
        renderDeleteAssignmentDialog={renderDeleteAssignmentDialog}
        renderExportJsonDialog={renderExportJsonDialog}
        renderTeacherScratchpadDialog={renderTeacherScratchpadDialog}
        reportAttendanceClass={reportAttendanceClass}
        reportExportClasses={reportExportClasses}
        reportHubClass={reportHubClass}
        reportLiveClass={reportLiveClass}
        responseInspectorTarget={responseInspectorTarget}
        resumeLiveTeaching={resumeLiveTeaching}
        retestRecoveryActions={retestRecoveryActions}
        saveAssignmentFolderPaths={saveAssignmentFolderPaths}
        searchableStandards={searchableStandards}
        sectionAccessBusyKey={sectionAccessBusyKey}
        selectedAssignmentIds={selectedAssignmentIds}
        setActiveClass={setActiveClass}
        setAdminTab={setAdminTab}
        setAllStudents={setAllStudents}
        setAssignmentActivity={setAssignmentActivity}
        setAssignmentGroupOpen={setAssignmentGroupOpen}
        setAssignmentHubTarget={setAssignmentHubTarget}
        setAssignmentPreflight={setAssignmentPreflight}
        setAssignmentPreflightBusy={setAssignmentPreflightBusy}
        setAssignmentSearch={setAssignmentSearch}
        setAssignments={setAssignments}
        setCaseReviewStudentId={setCaseReviewStudentId}
        setClassEvidenceByStudentId={setClassEvidenceByStudentId}
        setClassSchedule={setClassSchedule}
        setClassroomManagerAssignmentId={setClassroomManagerAssignmentId}
        setClassroomSyncProposal={setClassroomSyncProposal}
        setClassworkGradesByAssignment={setClassworkGradesByAssignment}
        setContentUpgradeRequest={setContentUpgradeRequest}
        setDolGradesByAssignment={setDolGradesByAssignment}
        setEditingAssignmentDates={setEditingAssignmentDates}
        setEditingAssignmentId={setEditingAssignmentId}
        setExportJsonAssignment={setExportJsonAssignment}
        setExportJsonCopied={setExportJsonCopied}
        setFocusedTestCycleAssignmentId={setFocusedTestCycleAssignmentId}
        setGradeExportScope={setGradeExportScope}
        setGradebookFilter={setGradebookFilter}
        setGradebookProgressFilter={setGradebookProgressFilter}
        setHomeNavigationPeriod={setHomeNavigationPeriod}
        setLibraryNavigation={setLibraryNavigation}
        setLiveFocus={setLiveFocus}
        setMovingFolderAssignmentId={setMovingFolderAssignmentId}
        setMovingFolderValue={setMovingFolderValue}
        setParentContactSourceAction={setParentContactSourceAction}
        setPathLaunchTeks={setPathLaunchTeks}
        setPresenceById={setPresenceById}
        setProfileDrawerStudentId={setProfileDrawerStudentId}
        setQuestionEditorAssignment={setQuestionEditorAssignment}
        setQuickSearchOpen={setQuickSearchOpen}
        setResponseInspectorTarget={setResponseInspectorTarget}
        setSelectedAssignmentIds={setSelectedAssignmentIds}
        setSidebarCollapsed={setSidebarCollapsed}
        setStudentSessionSummaries={setStudentSessionSummaries}
        setStudentSupportEvents={setStudentSupportEvents}
        setSupportReportStudentId={setSupportReportStudentId}
        setSupportUsageByAssignment={setSupportUsageByAssignment}
        setTeacherTab={setTeacherTab}
        setTeacherWorksheetDialog={setTeacherWorksheetDialog}
        setTeacherWorkspaceMode={setTeacherWorkspaceMode}
        setTestCyclePreviewAssignment={setTestCyclePreviewAssignment}
        setWeeklyPathCompletionsByStudent={setWeeklyPathCompletionsByStudent}
        setWeeklyPathGoalSnapshotsByStudent={setWeeklyPathGoalSnapshotsByStudent}
        sidebarCollapsed={sidebarCollapsed}
        skillOverrides={skillOverrides}
        startTeacherPreview={startTeacherPreview}
        studentSessionSummaries={studentSessionSummaries}
        studentSupportEvents={studentSupportEvents}
        studentsInActiveClass={studentsInActiveClass}
        supportReportStudentId={supportReportStudentId}
        teachAssignmentLive={teachAssignmentLive}
        teacherActionItems={teacherActionItems}
        teacherActionOpenCount={teacherActionOpenCount}
        teacherAnalyticsStudents={teacherAnalyticsStudents}
        teacherLearningProfiles={teacherLearningProfiles}
        teacherMasteryProfilesByStudentId={teacherMasteryProfilesByStudentId}
        teacherStudentDataMode={teacherStudentDataMode}
        teacherStudentIdentityIndex={teacherStudentIdentityIndex}
        teacherTab={teacherTab}
        teacherWeeklyGoalsByStudent={teacherWeeklyGoalsByStudent}
        teacherWeeklyRoster={teacherWeeklyRoster}
        teacherWorksheetBusy={teacherWorksheetBusy}
        teacherWorksheetDialog={teacherWorksheetDialog}
        teacherWorksheetStudentsFor={teacherWorksheetStudentsFor}
        teacherWorkspaceMode={teacherWorkspaceMode}
        testCyclePreviewAssignment={testCyclePreviewAssignment}
        toastError={toastError}
        toastInfo={toastInfo}
        toastSuccess={toastSuccess}
        toastWarning={toastWarning}
        toggleAssignmentSelected={toggleAssignmentSelected}
        user={user}
        warmupControlBusyKey={warmupControlBusyKey}
        weeklyGoalBusy={weeklyGoalBusy}
        weeklyGoalsByClass={weeklyGoalsByClass}
        weeklyPathCompletionsByStudent={weeklyPathCompletionsByStudent}
        weeklyPathProgressLoadedFor={weeklyPathProgressLoadedFor}
        weeklyPathProgressLoading={weeklyPathProgressLoading}
        weeklyPathTruncated={weeklyPathTruncated}
        weeklyPathWeekComplete={weeklyPathWeekComplete}
        weeklyPathWeekKey={weeklyPathWeekKey}
      />
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
  // The workspace's Up Next, the result page and Grades read the same model.
  // Cached on the identity of everything it reads (and the minute), so a
  // screen that re-renders on every keystroke does not rebuild it each time.
  // eslint-disable-next-line no-inner-declarations
  function studentUpNextDashboard() {
    const inputs = [
      Math.floor(now / 60000), user, assignments, gradeDisplayTracker, assignmentActivity,
      classworkGradesByAssignment, classSchedule, resumeAction, studentClassPoints.redemptionsByAssignment,
      testCycleGrades, studentRecoverySummariesByAssignment,
    ];
    const cache = studentUpNextCacheRef.current;
    if (cache.dashboard && cache.inputs?.length === inputs.length && inputs.every((input, index) => input === cache.inputs[index])) {
      return cache.dashboard;
    }
    const dashboard = buildStudentDashboardNow();
    studentUpNextCacheRef.current = { inputs, dashboard };
    return dashboard;
  }
  // The one "Today" map Grades rows and "Ways to raise" both read.
  // eslint-disable-next-line no-inner-declarations
  function studentTodayByAssignment() {
    return Object.fromEntries((studentUpNextDashboard()?.allEntries || []).map((entry) => [entry.assignment.id, entry]));
  }
  // "Ways to raise your grade" (platform/student/waysToRaiseModel.js): missing
  // work, late windows, Test Cycle corrections/retests, Recoveries and Practice
  // Passes — filtered by the Today rule so it never promises a Start the
  // student cannot take. Grades lists them; Home shows their count.
  // eslint-disable-next-line no-inner-declarations
  function studentWaysToRaiseNow() {
    return studentGradeCenter ? buildWaysToRaise({
      gradeCenter: studentGradeCenter,
      recoverySummariesByAssignment: studentRecoverySummariesByAssignment,
      // Only offered to a student who holds a Practice Pass to use.
      practicePassEligibleAssignmentIds: studentRewardWallet?.practicePasses?.count > 0 ? studentPracticePassEligibleAssignments : [],
      todayByAssignment: studentTodayByAssignment(),
      nowValue: now,
    }) : [];
  }
  const studentDashboard = user.role === 'student' && activeView === 'dashboard'
    ? buildStudentDashboardNow()
    : null;

  if (user.role === 'student' && activeView === 'dashboard') {
    if (studentDashboardMode === 'liveChallenge') {
      return renderStudentScreen(
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
          {renderStudentLiveChallengeInvite()}
          <MyMathPathApp
          studentId={user.id}
          studentName={formatStudentName({ ...studentRecord, ...user }, { lastFirst: false, neutralLabel: STUDENT_SELF_NEUTRAL_LABEL })}
          studentProfile={adaptiveStudentProfile || user.profile}
          assignments={studentPathAssignments}
          launchTeksCode={pathLaunchTeks}
          // A reload of a My Math Path tab or session (app/routes/urlArrival.js),
          // else the tab a launch asked for (pathLaunchTab, job B).
          initialTab={mathPathArrival?.tab || pathLaunchTab || 'path'}
          initialSessionConfig={mathPathArrival?.sessionConfig || null}
          pathOptions={studentPathOptions}
          weeklyGoalConfig={studentWeeklyGoalConfig}
          courseId={studentCourseId}
          studentRecord={studentRecord}
          serverMasteryProfiles={studentServerMasteryProfiles}
          onNavigate={navigateStudent}
          onExit={() => { setPathLaunchTeks(null); setPathLaunchTab(null); setStudentDashboardMode('assignments'); }}
          />
        </>,
      );
    }
    if (studentDashboardMode === 'assignmentsCenter') {
      return renderStudentScreen(
        <>
          {renderStudentPackUpBanner()}
          {renderStudentWarmupBanner()}
          {renderStudentLiveChallengeInvite()}
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
            recoveryByAssignment={studentRecoveryByAssignment}
            studentId={user.id}
            onOpenRecovery={openStudentRecovery}
          />
        </>,
      );
    }
    if (studentDashboardMode === 'rewards') {
      return renderStudentScreen(
        <>
          {renderStudentPackUpBanner()}
          {renderStudentWarmupBanner()}
          {renderStudentLiveChallengeInvite()}
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
      return renderStudentScreen(
        <>
          {renderStudentPackUpBanner()}
          {renderStudentWarmupBanner()}
          {renderStudentLiveChallengeInvite()}
          <StudentGradeCenter
            gradeCenter={studentGradeCenter}
            supportPresentation={getStudentSupportPresentation(user.profile)}
            onBackToHome={() => openStudentDashboardMode('assignments')}
            onNavigate={navigateStudent}
            onLogout={handleLogout}
            onOpenResult={(assignmentId) => openStudentAssignmentResult(assignmentId, { origin: 'grades' })}
            onPractice={(assignmentId) => startAssignment(assignmentId, 0, { origin: NAV_LEVEL.GRADES })}
            onStart={(assignmentId, questionIndex) => startAssignment(assignmentId, questionIndex ?? 0, { origin: NAV_LEVEL.GRADES })}
            // The Today rule per row: no Start on work that cannot be done
            // now, Open Recovery, and Start lands on the next question.
            // The Today rule per row: no Start on work that cannot be done
            // now, Open Recovery, and Start lands on the next question.
            todayByAssignment={studentTodayByAssignment()}
            waysToRaise={studentWaysToRaiseNow()}
            onWayAction={(way) => {
              if (way.action === 'none') return undefined; // waiting: nothing to open
              if (way.action === 'openResult') return openStudentAssignmentResult(way.assignmentId, { origin: 'grades' });
              if (way.action === 'openRewards') return openStudentDashboardMode('rewards');
              if (way.action === 'start') return startAssignment(way.assignmentId, way.questionIndex ?? 0, { origin: NAV_LEVEL.GRADES });
              // 'openTestCycle' (startAssignment opens the cycle card)
              return startAssignment(way.assignmentId, 0, { origin: NAV_LEVEL.GRADES });
            }}
            whatChangedPanel={renderWhatChangedPanel(false)}
          />
        </>,
      );
    }
    if (studentDashboardMode === 'testCycle' && activeTestCycleAssignmentId) {
      const activeTestCycleAssignment = assignments.find((assignment) => assignment.id === activeTestCycleAssignmentId) || null;
      // THIS student's dates, not the class's: an attendance extension or an
      // individualized extra-time deadline (injected in memory by
      // projectStudentAssignments) moves them, and getAssignmentLifecycle
      // resolves them with resolveStudentDeadlines, the precedence the
      // server's assignmentFinalCloseAt uses.
      const activeTestCycleDates = activeTestCycleAssignment
        ? getAssignmentLifecycle(activeTestCycleAssignment, Date.now(), { studentId: user.id })
        : null;
      return renderStudentScreen(
        <>
          {renderStudentPackUpBanner()}
          {renderStudentWarmupBanner()}
          {/* The shell's <main> holds this screen (NAV-15). */}
          <div style={{ padding: '24px 16px', maxWidth: 880, margin: '0 auto', boxSizing: 'border-box' }}>
            <Suspense fallback={<p role="status" style={{ margin: 0 }}>Opening your test…</p>}>
              <TestCycleCard
                assignmentId={activeTestCycleAssignmentId}
                studentId={user.id}
                studentProfile={user.profile}
                // The student's own due and final late dates, so a card opened
                // after the regular due date says the work is still open and
                // until when — for an extended student, until their date.
                dueAt={activeTestCycleDates?.dueAt || null}
                lateDueAt={activeTestCycleDates?.lateDueAt || null}
                // Corrections and the Retest close at the class's date unless
                // the server's home window says otherwise.
                classLateDueAt={activeTestCycleAssignment?.lateDueAt || activeTestCycleAssignment?.lateDueDate || null}
                // The grade document is already live (onSnapshot). Its Test
                // Cycle projection changes when results are released or a
                // retest opens, and its tracker when Review answers land; the
                // card re-asks the server when either moves.
                refreshKey={testCycleCardRefreshKey}
                // Review is ordinary MathMaster instruction, so it opens the
                // ordinary runtime — restricted to the review questions.
                onOpenReview={(assignmentId) => startAssignment(assignmentId, 0, { cycleStage: 'review' })}
                onPracticeSkill={practiseSkillFromResults}
                // Back names and opens the screen the card was opened from (NAV-9).
                exitLabel={`← ${resolveBack(NAV_LEVEL.TEST_CYCLE, { origin: activeTestCycleOrigin })?.navLabel || 'Assignments'}`}
                onExit={() => openStudentOriginLevel(activeTestCycleOrigin)}
              />
            </Suspense>
          </div>
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
          onOpenCourseTest={(assignmentId) => startAssignment(assignmentId, 0, { origin: NAV_LEVEL.SECURE_EXAMS })}
          onPracticeSkill={practiseSkillFromResults}
          // The student's Test Cycles with THEIR dates, so a Test whose session
          // is not open yet is listed with when it is (PR-20).
          testCycles={assignments.filter(isTestCycleAssignment).map((assignment) => {
            const own = getAssignmentLifecycle(assignment, Date.now(), { studentId: user.id });
            return { assignment, dueAt: own.dueAt, lateDueAt: own.lateDueAt };
          })}
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
    return renderStudentScreen(
      <>
        {renderStudentPackUpBanner()}
        {/* No Warm-Up banner on Home: the next-action card (or its compact
            Warm-Up card) is the one place the Warm-Up is offered here. */}
        <StudentDashboardView
        dashboard={dashboard}
        // Never the student's support status: Home is read over shoulders.
        student={{ ...studentRecord, ...user }}
        // From Home, Back on the result page says "← Home" and goes there (NAV-9).
        onOpenResult={(assignmentId) => openStudentAssignmentResult(assignmentId, { origin: NAV_LEVEL.HOME })}
        saveStatus={describeSaveStatus({
          persistenceStatus: studentPersistenceStatus,
          outboxDepth: studentOutboxDepth,
          pendingGradeCount: studentPendingGradeCount,
          online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
        })}
        whatChangedPanel={renderWhatChangedPanel(true)}
        whatChangedUnseenCount={countUnseenWhatChanged(whatChangedItems)}
        waysToRaise={{ count: countWaysToRaise(studentWaysToRaiseNow()) }}
        supportPresentation={supportPresentation}
        classroomSyncStatusByAssignment={classroomSyncStatusByAssignment}
        onStartAssignment={(assignmentId, questionIndex) => startAssignment(assignmentId, questionIndex ?? 0, { origin: NAV_LEVEL.HOME })}
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
        recoveryOpportunities={studentRecoveryDiscovery}
        onOpenRecovery={openStudentRecovery}
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
    const resultDashboard = studentUpNextDashboard();
    const resultTodayEntry = resultDashboard?.allEntries.find((entry) => entry.assignment.id === assignmentResultRoute.assignmentId) || null;
    const resultUpNext = resolveUpNext({ dashboard: resultDashboard, assignmentId: assignmentResultRoute.assignmentId });
    const recoveryAssignment = assignments.find((item) => item.id === assignmentResultRoute.assignmentId) || null;
    // Decision 3: once the work is closed for this student and feedback is
    // released, their own answers beside the worked solutions. The callable
    // re-checks every gate; this only decides whether to show the panel.
    const resultReviewPanel = resultEntry && recoveryAssignment && resultEntry.frozen
      && !resultEntry.isTestCycle
      && !assignmentHasHeldTeacherFeedback(recoveryAssignment)
      ? (
        <Suspense fallback={<p role="status" style={{ margin: '14px 0 0' }}>Loading your work…</p>}>
          <ReviewMyWork
            assignment={recoveryAssignment}
            load={loadMyReviewWork}
            studentProfile={user.profile}
            teacherAnswers={<TeacherAnswers studentId={user.id} assignmentId={recoveryAssignment.id} />}
          />
        </Suspense>
      )
      : null;
    const resultSectionLabel = assignmentResultRoute.sectionKey && assignmentResultRoute.sectionKey !== 'whole'
      ? assignmentResultRoute.sectionLabel || assignmentResultRoute.sectionKey
      : null;
    // The skill this assignment teaches, for "Practice this skill" (NAV-8).
    // A split Classroom post's section, a Test Cycle and an assignment with no
    // Path skill have none.
    const resultPathLaunch = resolveAssignmentPathLaunch({
      assignment: recoveryAssignment,
      questionIndex: assignmentResultRoute.questionIndex,
      sectionKey: resultSectionLabel ? assignmentResultRoute.sectionKey : null,
    });
    const openRecoveryEntry = recoverySession?.assignmentId === assignmentResultRoute.assignmentId
      ? studentRecoverySummary.find((entry) => entry.section === recoverySession.section) || null
      : null;
    if (recoveryAssignment && openRecoveryEntry) {
      return renderStudentScreen(
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
          {renderStudentLiveChallengeInvite()}
        <StudentAssignmentResult
          entry={resultEntry}
          sectionLabel={resultSectionLabel}
          supportPresentation={getStudentSupportPresentation(user.profile)}
          onReviewWork={(assignmentId) => startAssignment(assignmentId, assignmentResultRoute.questionIndex, { returnToResult: true })}
          /*
           * NAV-8: two things, two buttons. "Try these questions again — no
           * credit" reopens THIS assignment (as the same words do on Home,
           * Assignments and Grades); "Practice this skill" opens My Math Path
           * on the TEKS it teaches (assignmentPathLaunch.js), and is offered
           * only when there is one.
           */
          onPractice={(assignmentId) => startAssignment(assignmentId, assignmentResultRoute.questionIndex, {
            // A split Classroom post practises its own section; a whole-assignment
            // post practises the whole assignment. Keep the result route so the
            // visible Back control returns here after practice.
            sectionKey: resultSectionLabel ? assignmentResultRoute.sectionKey : null,
            returnToResult: true,
            origin: assignmentResultRoute.origin,
          })}
          onPracticeSkill={resultPathLaunch ? () => {
            setPathLaunchTeks(resultPathLaunch.teksCode);
            openStudentDashboardMode('mathPath');
          } : null}
          notice={assignmentResultRoute.notice || null}
          changes={whatChangedItems.filter((item) => item.assignmentId === assignmentResultRoute.assignmentId)}
          onViewAllGrades={openStudentGradeCenter}
          onViewAllAssignments={openStudentAssignmentsCenter}
          // Decision 3: once the work is closed for this student and feedback
          // is released, their own answers beside the worked solutions. The
          // callable re-checks every gate; this only decides whether to show it.
          reviewPanel={resultReviewPanel}
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

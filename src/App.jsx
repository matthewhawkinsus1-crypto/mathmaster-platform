import { Suspense, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
// Stylesheets that must link before App.css, in 805b69e2's order
// (app/shell/leadingStyles.js says why and how).
import './app/shell/leadingStyles.js';
import './App.css';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { joinResponseDetail, readSplitSwitch, writeTrackerSplit } from './platform/grades/responseDetailStore.js';
import {
  buildResponseCheckpointAction,
  checkpointDocumentId,
  checkpointEligibility,
  enqueueResponseCheckpoint,
  responseFingerprint,
} from './platform/performance/responseCheckpoint.js';
import { FAMILY_PIN_SERVER_WAIT_MS, WORKSPACE_DRAFT_REREAD_AFTER_HIDDEN_MS, createWorkspaceDraftSync } from './platform/persistence/workspaceDraftSync.js';
import { describeDraftSaveProblems, draftSaveProblemAssignmentIds, draftSaveProblemsFor, draftSaveProblemsForStudent } from './platform/persistence/draftSaveHealth.js';
import { scrollMotion } from './motionPreference.js';
import { openWorkspaceDraft, readLatestWorkspaceResume, writeWorkspaceDraft } from './platform/persistence/workspaceDraftStore.js';
import { createHeldDraftReads } from './platform/persistence/heldDraftRead.js';
import { readWorkspaceDeliveryPins, readWorkspaceDraftEntries, selectRestorableDraftEntries } from '../functions/shared/workspaceDraftSchema.mjs';
import { canonicalResponseSavedAt } from './platform/persistence/canonicalResponseTime.js';
import { resolveAuthoritativeClose } from '../functions/shared/sectionDeadline.mjs';
import useEngagementLedger from './platform/supportEvidence/useEngagementLedger.js';
import { recordStudentSupportEvidence as saveStudentSupportEvidence } from './platform/supportEvidence/supportEvidenceStore.js';
import { launchSupportRecords, studentMayRecordSupport, usedRecordKey } from './platform/supportEvidence/studentSupportTelemetry.js';
// The DOL recovery builders are teacher actions: they load with the teacher
// kit (app/teacher/teacherKit.js). A student's screen reads only the summary.
// The DOL grant helpers (platform/assessment/dolAttemptGrantClient.js) are
// teacher-only: they come from the teacher kit (app/teacher/teacherKit.js).
import { teacherAdmin } from './auth/authService';
import {
  EMPTY_SCRATCHPAD_CACHE,
} from './platform/student/practiceScratchpadCache.js';
import {
  getAssignmentByLaunchId,
} from './classroomApi';

// Whether a question can come back as a different question is the one piece
// of the generator App needs while it renders. The generator itself, with the
// math engine (mathjs) under it, loads when a student prints a worksheet: a
// static import put mathjs in every student's first load before Home.
// Device pins and the two slot questions, without the family engine: the
// context builder (familyDelivery.js) walks a family to check a pin, so it
// brings every family's generator and loads with the question runtime below
// (loadFamilyDelivery), never in the first load.
import { writeLocalDeliveryPin } from './platform/generation/familyDeliveryPins.js';
import { shownDeliveryKey } from './platform/generation/shownFamilyQuestion.js';
import { isFamilyBackedQuestion } from '../functions/shared/questionFamilySlot.mjs';
import {
  fetchStudentAssignments,
  individuallyAssignedTestCycleIds,
  mergeStudentAssignments,
  studentClassAssignmentsQuery,
} from './platform/assignments/studentAssignmentScope.js';
import { EMPTY_STUDENT_CONTROLS, STUDENT_CONTROLS_STATUS, projectStudentAssignments } from './platform/assignments/studentAssignmentControls.js';
import useStudentAssignmentControls from './platform/assignments/useStudentAssignmentControls.js';
import {
  EMPTY_TEACHER_CONTROLS,
  projectTeacherAssignments,
  teacherControlsClassIds,
  teacherControlsScopeKey,
} from './platform/teacher/teacherClassControls.js';
import useTeacherClassControls from './platform/teacher/useTeacherClassControls.js';
import { mergePracticeTrackers } from './platform/student/practiceTrackerMerge.js';
import {
  normalizeQuestionRecord,
} from './attemptPolicy';

import {
  clearResumeAction,
  draftsOfQuestionChanged,
  questionDraftSavedAt,
  readResumeAction,
  reconcileFieldRecordDrafts,
  reconcileToolWorkspaceDrafts,
  restoreQuestionDrafts,
  saveResumeAction,
  subscribeToQuestionDrafts,
} from './questionDraftStorage';
// The cursor's box alone, not the answer-entry contract (Enter, focus on open,
// the math field's handoff), which loads with the question runtime (PF01).
import { answerFocusPosition } from './platform/interaction/answerFocusPosition.js';
import {
  CLASS_PERIODS,
  DEFAULT_CLASS_SCHEDULE,
  assignmentIsForStudent,
  getAssignmentLifecycle,
  getDOLState,
  getWarmupState,
  // Not the plain getSectionAccessState: App binds that name to the signed-in
  // student's own grades below (sectionAccessForStudent). The one teacher
  // handler that needs the plain function imports it itself, under another
  // name (app/teacher/controls/warmupSectionControls.js).
  normalizeSchedule,
  prerequisiteAccess,
  sectionAccessForStudent,
  getIncludedQuestionIndices,
  questionIsIncluded,
  studentAssignmentIndicesWithPracticePass,
  studentRequiredQuestions,
} from './assignmentLifecycle';
import { HEARTBEAT_INTERVAL_MS, buildLiveStatus, encodeQuestionStates } from './livePresence';
import { helpRequestAfterClose, helpRequestFields } from './platform/supports/helpRequest.js';
import { useAskMyTeacher, useTeacherQuestionsOn } from './platform/supports/useAskMyTeacher.js';
import { studentClassFields } from './platform/student/rosterMembership.js';
import TeacherAnswers from './components/student/TeacherAnswers.jsx';
// What a question shows a student, for the live-presence tile, is the one thing
// App needs of the question type catalog. The catalog is authoring metadata
// (about 13 KB gzip with the validators under it): it loads where questions are
// authored and checked, never with Home.
import { getQuestionRepresentation } from '../functions/shared/questionRepresentation.mjs';
import { getQuestionPrimaryTeksCodes } from './questionMetadata.js';
import {
  buildSupportUsage,
  getStudentSupportPresentation,
  normalizeStudentProfile,
} from './studentSupport';

import ScreenErrorBoundary from './components/common/ScreenErrorBoundary.jsx';


import { useToast } from './ui/Toast';
import { prefetchQuestionResources } from './platform/performance/questionPrefetch.js';
import { measurePerformanceOperation, startPerformanceSpan } from './platform/performance/performanceTelemetry.js';
import { sameData, useRenderStability } from './platform/performance/renderStability.js';
// One normalised view per stored record, for the render's reads of it.
import { questionRecordView } from './platform/performance/questionRecordView.js';
import {
  isGradeBearingAction,
  listDurableActions,
  overlayDurableActionsOnGrades,
  resendRetiredReviewWork,
} from './platform/performance/durableActionOutbox.js';
// The tools' parsed-workspace cache alone, not the draft hook: that loads with
// the tools (PF01, tools/shared/toolDraftCache.js).
import { buildStudentMasteryProfile, collectStudentEvidence } from './masteryEngine.js';
import {
  getEffectiveActivityPolicy,
  resolveQuestionActivityRole,
} from './platform/policies/activityPolicies';
import { matchesSmartView } from './assignmentSmartViews';
import {
  updateWalkthroughTimer,
  endLiveTeachingSession,
} from './platform/teacher/liveTeachingSession.js';
import { validatePersistedWalkthroughSession } from './platform/assignments/assignmentAvailability.js';
import { normalizeFolderPaths } from './assignmentFolders';

import {
  getStoredAssignmentQuestions,
  prepareAssignmentForRuntime,
} from './platform/contract/storedAssignmentV5.js';
import {
  projectCurrentAssignmentContent,
  resolveCurrentContentStorageIndex,
} from './platform/assignments/currentContentProjection.js';

import { teksCodeFromSkillId } from './platform/path/skillGraph.js';
import { buildStudentPathOptions } from './platform/path/studentPathOptions.js';
import { resolveAssignmentPathLaunch } from './platform/path/assignmentPathLaunch.js';
import { LEVEL as NAV_LEVEL, resolveBack } from './platform/student/navigationModel.js';
import { splitGrade } from './platform/teacher/gradeEvidence.js';
import { projectTeacherOverridesForDisplay } from './platform/grading/canonicalGradeProjection.js';
import { projectSectionRecoveriesForDisplay } from './platform/grading/sectionRecoveryGrades.js';
import { classroomLaunchTarget, parseClassroomLaunchSearch } from './platform/classroom/classroomLaunchRoute.js';
import { buildStudentDashboardModel, resolveNextAction, resolveUpNext } from './studentDashboardModel.js';
import {
  buildWhatChanged, countUnseenWhatChanged, readWhatChangedSeenAt, rememberWhatChangedFirstSeen, untimedWhatChangedKeys,
} from './platform/student/whatChangedModel.js';
import { describeRuntimeSaveLine, describeSaveStatus, initialSaveSubject, nextSaveSubject, persistenceStatusOnAssignmentChange, persistenceStatusWithQueuedWork, persistenceStatusWithUnstoredWork, saveLineIsAboutDrafts, saveLineIsRoutine, withUnstoredWork, withoutUnstoredWork } from './platform/student/saveStatusModel.js';
import { buildWaysToRaise, countWaysToRaise } from './platform/student/waysToRaiseModel.js';
import { loadMyReviewWork } from './services/reviewMyWorkService.js';
import { recoveryStatesFromSummaries } from './platform/student/recoveryStates.js';
import { buildTestCycleCardRefreshKey } from './platform/student/testCycleDiscovery.js';
import { liveChallengeExitLabel, sectionHoldsLobbyInvite } from './platform/liveChallenge/liveChallengeReturn.js';
import {
  readStudentRouteState,
  recoveryModeToRestore,
  studentRouteKey,
  writeStudentRouteState,
} from './platform/student/browserHistory.js';
import { resetAddressToHome } from './app/routes/browserUrl.js';
import { ARRIVAL_MESSAGES, readUrlArrival } from './app/routes/urlArrival.js';
import { useUrlArrival } from './app/routes/useUrlArrival.js';
import {
  assignmentFeedbackWasReleased,
  assignmentHasHeldTeacherFeedback,
} from './app/student/assignmentRuntimeHelpers.js';
import {
  NO_RECOVERY_OPPORTUNITIES,
  RECOVERY_ANNOUNCEMENT_MODES,
  RECOVERY_DISCOVERY_ALL,
  TEACHER_CROSS_CLASS_TABS,
  TEACHER_FULL_STUDENT_DATA_TABS,
} from './app/screenScopes.js';
// Every screen loaded on demand (one chunk each), and the teacher-only
// panels, each with its own Suspense boundary (lazyScreens.js). The student's
// Grades, Assignments, Rewards and result screens also carry their own way
// through code that cannot load, and are fetched while Home is idle (PF01).
import {
  LiveChallengeStudent,
  MyMathPathApp,
  ReviewMyWork,
  SectionRecoveryRunner,
  StudentAssignmentResult,
  StudentAssignmentsCenter,
  StudentGradeCenter,
  StudentRewardsCenter,
  StudentSecureExamDashboard,
  TeacherWorkspace,
  TestCycleCard,
} from './app/lazyScreens.js';
// The assessments' names alone: the crosswalk loads with the screens that use it (PF01).
import {
  STUDENT_SELF_NEUTRAL_LABEL,
  buildStudentIdentityIndex,
  compareStudentsByName,
  formatStudentName,
  resolveStudentDisplayName,
} from './platform/studentName';
// The teacher roster is RESOLVED, not copied: the compact listSignInAccess row
// is the only name a Classroom-linked legacy student has on Home and Live.
import {
  normalizeTeacherRosterSummary,
} from './platform/teacher/teacherRosterSummary.js';
import { evidenceRowsToEvents } from './platform/profile/legacyEvidenceAdapter.js';
import { buildStudentLearningProfile } from './platform/profile/studentLearningProfile.js';
import { adaptLegacyMasteryToPhase5 } from './platform/profile/legacyMasteryAdapter.js';
import StudentDashboardView from './components/student/StudentDashboardView.jsx';
import { isTestCycleAssignment } from './platform/assessment/testCycle.js';
import { isSecureExamActive, useSecureExamActive } from './platform/assessment/secureExamPresence.js';
import StudentGlobalNav, { STUDENT_DESTINATION } from './components/student/StudentGlobalNav.jsx';
import SectionRecoveryPanel from './components/student/SectionRecoveryPanel.jsx';
// Showing and announcing a Recovery list is light; DECIDING one runs the
// server's own rules and loads after Home (app/student/studentRecoveryKit.js).
import {
  groupRecoveryOpportunitiesByAssignment,
  markRecoveryNotified,
  markRecoverySeen,
  recoveryNotice,
  recoveryWasNotified,
} from './platform/recovery/studentRecoveryNotices.js';
import { loadStudentRecoveryKit, loadedStudentRecoveryKit } from './app/student/studentRecoveryKitLoader.js';
import { practicePassEligibleAssignments } from './platform/rewards/practicePassClientEligibility.js';
import {
  loadStudentRewardHistory,
  // A callable, not a hook: imported under a name rules-of-hooks reads as one.
  usePracticePass as redeemPracticePassCallable,
} from './platform/rewards/rewardsClient.js';
import { buildRewardWallet } from './platform/rewards/rewardWallet.js';
import { useRewardCelebrations } from './platform/rewards/useRewardCelebrations.js';
import { useClassPracticePasses } from './platform/rewards/useClassPracticePasses.js';
import ChallengeRewardsEarned from './components/student/rewards/ChallengeRewardsEarned.jsx';
import { useGrowthRewardSync } from './platform/rewards/useGrowthRewardSync.js';

import {
  buildStudentGradeCenter,
  findGradeCenterEntry,
} from './platform/student/studentGradeCenterModel.js';
import {
  GRADING_PERIOD_SETTINGS_DOC,
  normalizeGradingPeriodSettings,
} from './platform/student/gradingPeriods.js';
import {
  ROUTE_EVENTS, buildRouteEvent, fetchClassPacing, fetchSkillOverrides, fetchWeeklyGoalSettings,
  interventionAsOverride, logRouteEvent, overridesForClassContext,
  storedPacingForClassContext, storedWeeklyGoalForClassContext,
  studentWeeklyPath,
} from './platform/path/pathStore.js';
import { forgetSessionPathCoverage } from './platform/path/pathCoverageService.js';
// The teacher-only logic App runs (needs attention, the Action Center,
// Assignment Review's publishing intent, worksheets, Classroom publishing)
// loads for a teacher, never with a student's Home (app/teacher/teacherKit.js).
import { loadTeacherKit, loadedTeacherKit, prefetchTeacherWorkspace } from './app/teacher/teacherKitLoader.js';
import { classIdsForTeacher } from '../functions/shared/classModel.mjs';
// Only the event kinds and the live rapid-correct summary: the rest of
// teacher/studentSupportSignals.js is the teacher's (first-load budget).
import { summarizeRapidCorrectness } from './platform/teacher/rapidCorrectness.js';
import { attemptSignalCount } from './platform/signals/signalPageNotes.js';
import { SCHOOL_NON_INSTRUCTIONAL_KEYS } from './app/shell/schoolCalendarKeys.js';
// buildAttendanceCorrectionReviewEvent was called by "Keep current extension"
// and "Apply shorter extension" without being imported — a ReferenceError that
// made every attendance correction review impossible to resolve.
// The attendance helpers (returnCheckIn.js, extensionReconciliation.js) are
// teacher-only, so they come from the teacher kit (app/teacher/teacherKit.js):
// every call below is requireTeacherKit().name( or teacherKit.name(.
// From the shared day rules, not ./platform/attendance/attendanceHistory.js:
// App reads only this name, and that module is a teacher's history screen.
// The periods' course profiles alone, not courseRigor.js: its Honors checks
// load with the teacher's screens (PF01, platform/rigor/courseProfiles.js).
import {
  defaultCourseProfiles,
  normalizeCourseProfiles,
} from './platform/rigor/courseProfiles.js';
import SessionGate from './app/shell/SessionGate.jsx';
import { useAuth } from './auth/AuthProvider.jsx';

// The administrator identity comes from the same module the callables enforce,
// so the browser can never believe in a different administrator than the server.
import { isRootAdminEmail } from '../functions/shared/rolePolicy.mjs';
import { useWorkspaceArrivalNotices } from './app/student/useWorkspaceArrivalNotices.js';
import { useClassroomAnnouncement } from './app/student/useClassroomAnnouncement.js';
import { useQuestionReveal } from './app/student/useQuestionReveal.js';
import { useStudentScreenChange } from './app/shell/useStudentScreenChange.js';
import { useStudentScreenPrefetch } from './app/student/useStudentScreenPrefetch.js';
import { useFamilyDeliveryEngine } from './app/student/useFamilyDeliveryEngine.js';
import { useTimedSectionReminders } from './app/student/useTimedSectionReminders.js';
import { useActiveTimeClock } from './app/student/useActiveTimeClock.js';
import { useSchoolClock } from './app/shell/useSchoolClock.js';
import { useAssignmentNavigatorToggle } from './app/student/useAssignmentNavigatorToggle.js';
import { useRosterClassFollow } from './app/student/useRosterClassFollow.js';
import { useStudentGradeDocument } from './app/student/useStudentGradeDocument.js';
import { useStudentSpotlight } from './app/student/useStudentSpotlight.js';
import { useDolCheckpointReceipts } from './app/student/useDolCheckpointReceipts.js';
import { useStudentPathSignals } from './app/student/useStudentPathSignals.js';
import { useStudentWeeklyPathProgress } from './app/student/useStudentWeeklyPathProgress.js';
import { useAssignmentListeners } from './app/shell/useAssignmentListeners.js';
import { useLiveChallengeInvite } from './app/student/useLiveChallengeInvite.js';
import { useDraftSaveHealth } from './app/student/useDraftSaveHealth.js';
import { useStudentClassPoints } from './app/student/useStudentClassPoints.js';
import { useTeacherAnalytics } from './app/teacher/useTeacherAnalytics.js';
import { useLiveTeachingTimer } from './app/teacher/useLiveTeachingTimer.js';
import { useTeacherPresence } from './app/teacher/useTeacherPresence.js';
import { useTeacherActionCenterData } from './app/teacher/useTeacherActionCenterData.js';
import { useLiveTeachingPreviewSync } from './app/teacher/useLiveTeachingPreviewSync.js';
import { useTeacherRosterData } from './app/teacher/useTeacherRosterData.js';
import { useTeacherLearningPaths } from './app/teacher/useTeacherLearningPaths.js';
import { useTeacherBrowserHistory } from './app/teacher/useTeacherBrowserHistory.js';
import { createTeacherPreviewNavigation } from './app/teacher/teacherPreviewNavigation.js';
import { createStudentNavigation } from './app/student/studentNavigation.js';
import { useStudentBrowserHistory } from './app/student/useStudentBrowserHistory.js';
import { createGradingControls } from './app/student/gradingControls.js';
import { createScratchpadControls } from './app/student/scratchpadControls.js';
import { createStudentWorksheetExport } from './app/student/studentWorksheetExport.js';
import { createQuestionNavigation } from './app/student/questionNavigation.js';
import { createAssignmentActivityFlush } from './app/student/assignmentActivity.js';
import { createStudentOutbox } from './app/student/studentOutbox.js';
import { createAssignmentWorkspaceView } from './app/student/assignmentWorkspaceView.jsx';
import { createStudentShellViews } from './app/student/studentShellViews.jsx';

// What a teacher's controls are before the teacher kit has loaded, and for a
// student always: none. Only the teacher's screen reads them, and it waits for
// the kit (app/teacher/teacherKit.js).
const NO_TEACHER_CONTROLS = Object.freeze([]);

function App() {
  const auth = useAuth();
  // Identity is owned entirely by <AuthProvider>. `user` below is the
  // application-level profile that the rest of this component reads: the
  // roster record, class period and inclusion supports that hang off whoever
  // the auth layer says is signed in.
  const { toastSuccess, toastError, toastInfo, toastWarning, confirm: confirmAction } = useToast();
  const [user, setUser] = useState(null);

  const [sessionHydrating, setSessionHydrating] = useState(false);
  const [sessionHydrationError, setSessionHydrationError] = useState(null);

  const { studentClassPoints } = useStudentClassPoints({ user });

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
  // When it was read: an address left waiting on a signed-out page too long
  // is not the next account's (useUrlArrival, NV09).
  const urlArrivalAtRef = useRef(Date.now());
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
  // Null until the Action Center has loaded them (useTeacherActionCenterData).
  const [actionGradeSnapshots, setActionGradeSnapshots] = useState(null);
  const [actionPracticePasses, setActionPracticePasses] = useState(null);
  // Keep only the small badge count after Action Center releases its heavy
  // projections. This preserves the sidebar cue without retaining student history.
  const [teacherActionOpenCountCache, setTeacherActionOpenCountCache] = useState(0);
  // The teacher kit (app/teacher/teacherKit.js) loads once a teacher is signed
  // in; the teacher's screen waits for it (the teacher branch of the render).
  // A teacher who leaves before it arrives is never handed it, and a failed
  // load reaches AppErrorBoundary, like a failed TeacherWorkspace chunk.
  const [teacherKit, setTeacherKit] = useState(loadedTeacherKit);
  const [teacherKitError, setTeacherKitError] = useState(null);
  useEffect(() => {
    if (user?.role !== 'teacher' || teacherKit) return undefined;
    let stopped = false;
    prefetchTeacherWorkspace();
    loadTeacherKit()
      .then((kit) => { if (!stopped) setTeacherKit(kit); })
      .catch((error) => {
        console.error('The teacher workspace could not load:', error);
        if (!stopped) setTeacherKitError(error);
      });
    return () => { stopped = true; };
  }, [user?.role, teacherKit]);
  // The student's Recovery decisions (app/student/studentRecoveryKit.js) load
  // once a student is signed in, after Home. Every Recovery surface reads
  // them through the kit and offers nothing until it arrives; a failed load is
  // forgotten (the next sign-in asks again), and the server decides every
  // Recovery action whatever the browser shows.
  const [studentRecoveryKit, setStudentRecoveryKit] = useState(loadedStudentRecoveryKit);
  useEffect(() => {
    if (user?.role !== 'student' || studentRecoveryKit) return undefined;
    let stopped = false;
    loadStudentRecoveryKit()
      .then((kit) => { if (!stopped) setStudentRecoveryKit(kit); })
      .catch((error) => { console.warn('Recovery could not load yet:', error); });
    return () => { stopped = true; };
  }, [user?.role, user?.id, studentRecoveryKit]);
  // Only the teacher's screen calls these, and it renders only with the kit.
  const requireTeacherKit = () => {
    if (!teacherKit) throw new Error('The teacher workspace has not finished loading. Try again in a moment.');
    return teacherKit;
  };
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
  // The exam a practice test's "Practise this skill" starts, with the standard
  // it was set for (MP14): applied only to that same launch, so a later course
  // launch of any skill is never run in an exam's format.
  const [pathLaunchFramework, setPathLaunchFramework] = useState(null);
  const [activeAssignmentId, setActiveAssignmentId] = useState(null);
  const [tracker, setTracker] = useState({});
  const [studentOutboxDepth, setStudentOutboxDepth] = useState(0);
  // Grade-bearing work is counted separately: a pending checkpoint is not a
  // reason to worry a student, and a pending Submit is.
  const [studentPendingGradeCount, setStudentPendingGradeCount] = useState(0);
  const [studentNeedsReviewCount, setStudentNeedsReviewCount] = useState(0);
  // The assignments those answers are on, for Home to name (NV10).
  const [studentNeedsReviewAssignmentIds, setStudentNeedsReviewAssignmentIds] = useState([]);
  const [studentPersistenceStatus, setStudentPersistenceStatus] = useState('idle');
  // The assignments with a change this device could not store, until a later
  // save of that assignment's work is stored: Home and Log Out go on saying
  // it after the line has moved on (saveStatusModel.js, withUnstoredWork).
  const [studentUnstoredAssignmentIds, setStudentUnstoredAssignmentIds] = useState([]);
  const { draftSaveHealthVersion } = useDraftSaveHealth({ user });
  const [studentReportingError, setStudentReportingError] = useState(null);
  // Set only when it says something new: every Submit and Next reports the
  // device's queue twice, and "nothing went wrong" again, the same null, drew
  // App each time. The ref is the value last set (it is set nowhere else).
  const studentReportingErrorRef = useRef(null);
  const showStudentReportingError = (reason) => {
    if (studentReportingErrorRef.current === reason) return;
    studentReportingErrorRef.current = reason;
    setStudentReportingError(reason);
  };
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
  // The open assignment's server copy of its delivery pins (RT15): which
  // version of each personalized question another of this student's devices
  // showed before the first Submit. `known` once that copy has been read, or
  // could not be (FAMILY_PIN_SERVER_WAIT_MS).
  const [serverDeliveryPins, setServerDeliveryPins] = useState({ assignmentId: null, known: false, pins: null });
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
    setDraftRestoreFocus(null);
  }, [currentQuestionIndex, activeAssignmentId]);
  // WHICH QUESTION IS ON SCREEN, FROM THE COMMIT THAT PUT IT THERE (#386, after
  // R12). The server read remounts the question on screen only for a draft of
  // its own, and asks this ref which question that is (draftsOfQuestionChanged).
  // The next question reads its drafts while it renders. Set in a passive
  // effect, the ref still named the question the student had left until that
  // effect ran, and a Next (set after an await: a default update) commits in one
  // task and runs its passive effects in a later one: a read landing between
  // the two wrote the next question's newer copy, from another Chromebook,
  // into this device, decided for the old question, and left the stale copy on
  // screen for the student's next key to save over it. A layout effect runs in
  // the commit's own task, so a read lands before the next question rendered
  // (it then reads the restored copy) or after the ref names it (it is then
  // remounted). Today a state update in a layout effect of every question
  // (MobileViewportContainer's main-landmark check) makes React run the
  // passive effects inside that task as well, and nothing else kept the gap
  // shut: with that update made passive, a read let through in the gap lost
  // the other Chromebook's work every time at 4x and 6x, and none with this.
  useLayoutEffect(() => {
    currentQuestionIndexRef.current = currentQuestionIndex;
  }, [currentQuestionIndex]);

  const { toggleAssignmentNavigation } = useAssignmentNavigatorToggle({
    activeView, assignmentNavigationCollapsed, setAssignmentNavigationCollapsed, setAssignmentOverviewExpanded,
    assignmentQuestionStageRef,
  });

  const [resumeAction, setResumeAction] = useState(null);
  const [now, setNow] = useState(Date.now());
  // What App's render works out, made to change only when what it means
  // changes: QuestionEngine is memoised (app/lazyScreens.js), and App renders
  // several times on a Submit or Next and every 30 seconds for this clock; and
  // what follows its renders without one of its own (renderFold: the save
  // line's subject). platform/performance/renderStability.js.
  const [stableCallbacks, renderMemo, renderFold] = useRenderStability();
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
      document.querySelector(`[data-assignment-card="${CSS.escape(editingAssignmentId)}"]`)?.scrollIntoView?.({ behavior: scrollMotion(), block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [teacherTab, editingAssignmentId]);
  const [feedbackReleaseBusyId, setFeedbackReleaseBusyId] = useState(null);
  const [dolUnlockBusyKey, setDolUnlockBusyKey] = useState(null);
  const [dolAttemptGrantBusyKey, setDolAttemptGrantBusyKey] = useState(null);
  const [dolControlBusyKey, setDolControlBusyKey] = useState(null);
  const [warmupControlBusyKey, setWarmupControlBusyKey] = useState(null);
  const [sectionAccessBusyKey, setSectionAccessBusyKey] = useState(null);
  const [studentDashboardMode, setStudentDashboardMode] = useState('assignments');
  // Where a student joined the Live Challenge from, to go back to (NAV-25).
  const [liveChallengeReturn, setLiveChallengeReturn] = useState(null);
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
  const [studentBrowserRoute, studentQuestionEntriesFor] = useStudentBrowserHistory(
    toastInfo, user, hasPracticePassFor, studentRequiredFor, urlArrival, assignmentResultRoute,
    setAssignmentResultRoute, activeClassroomSectionKey, setActiveClassroomSectionKey, activeView, setActiveView,
    assignments, assignmentsRef, setPathLaunchTeks, activeAssignmentId, setActiveAssignmentId, currentQuestionIndex,
    setCurrentQuestionIndex, recoverySession, setRecoverySession, setStudentDashboardMode, studentDashboardMode,
    activeTestCycleAssignmentId, setActiveTestCycleAssignmentId, activeTestCycleOrigin, setActiveTestCycleOrigin,
    studentBrowserHistoryReadyRef, studentBrowserRouteRef, studentBrowserUrlRef, historyAccountRef,
  );

  const { liveChallengeInvite } = useLiveChallengeInvite({ user });
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
  /*
   * WORKED OUT WHEN A SCREEN SHOWS THEM, NOT ON EVERY SAVE.
   *
   * The Recovery summaries, the Grade Center, the assignments a Practice Pass
   * can be used on and My Math Path's options are read by Home, the
   * Assignments Center, Grades, My Rewards, My Math Path and the result page,
   * and by nothing inside an assignment. As memos keyed on the tracker they
   * ran again on each of a Submit's tracker changes there, about 60 ms of a
   * Submit at 4x CPU. Each is now asked for by the screen that shows it
   * (`…Now()`), and worked out then, once per change of what it reads
   * (renderMemo, on exactly the inputs the memo had): the screen a student
   * moves to from an assignment works it out in the render that draws it,
   * from the trackers as they are.
   */
  // Recovery for every open assignment, so Home's "Today" rule and Grades'
  // "Ways to raise your grade" see the Recoveries the result page would offer
  // (platform/student/recoveryStates.js). Refreshed once a minute at most.
  const studentRecoveryMinute = Math.floor(now / 60000);
  const studentRecoverySummariesNow = () => renderMemo('recoverySummaries', [studentRecoveryKit, user?.role, user?.id, user?.classId, user?.classPeriod, user?.timingProfile, assignments, tracker, teacherGradeOverridesByAssignment, sectionRecoveryByAssignment, classSchedule, studentRecoveryMinute], () => (user?.role === 'student' && user?.id && studentRecoveryKit
    ? studentRecoveryKit.buildRecoverySummariesByAssignment({
      assignments,
      trackerByAssignment: projectTeacherOverridesForDisplay(tracker, teacherGradeOverridesByAssignment) || {},
      sectionRecoveryByAssignment,
      overridesByAssignment: teacherGradeOverridesByAssignment || {},
      studentId: user.id,
      classId: user.classId || null,
      classPeriod: user.classPeriod,
      schedule: classSchedule,
      // The grade document's own `profile` field, as the server reads it (D7).
      studentProfile: user.timingProfile || null,
      nowValue: studentRecoveryMinute * 60000,
    })
    : {}));
  const studentRecoverySummary = useMemo(() => {
    if (!recoveryAssignmentId || !user?.id || !studentRecoveryKit) return [];
    const assignment = assignments.find((item) => item.id === recoveryAssignmentId);
    if (!assignment) return [];
    return studentRecoveryKit.buildStudentRecoverySummary({
      assignment,
      tracker: projectTeacherOverridesForDisplay(tracker, teacherGradeOverridesByAssignment)?.[recoveryAssignmentId] || {},
      recoveryForAssignment: sectionRecoveryByAssignment?.[recoveryAssignmentId] || null,
      // A Practice question a teacher graded is not the student's own evidence.
      overrides: teacherGradeOverridesByAssignment?.[recoveryAssignmentId] || null,
      studentId: user.id,
      classId: user.classId || null,
      classPeriod: user.classPeriod,
      schedule: classSchedule,
      studentProfile: user.timingProfile || null,
    });
  }, [recoveryAssignmentId, studentRecoveryKit, assignments, tracker, teacherGradeOverridesByAssignment, sectionRecoveryByAssignment, user?.id, user?.classId, user?.classPeriod, user?.timingProfile, classSchedule]);

  // A Recovery belongs to the result page it opened on: leaving that page
  // (for another screen, or another assignment's result) closes it.
  useEffect(() => {
    setRecoverySession((current) => (current && current.assignmentId !== recoveryAssignmentId ? null : current));
  }, [recoveryAssignmentId]);

  /*
   * A RECOVERY REOPENED BY BACK, FORWARD OR A RELOAD (NV14) has no mode until
   * the page's panel can say which of its buttons it offers now
   * (recoveryModeToRestore), so it opens only where a tap could. One the
   * panel no longer offers (submitted, held, closed) leaves the student on the
   * result page, and its entry becomes the page's, so Back does not walk into
   * it again.
   */
  useEffect(() => {
    if (!recoverySession || recoverySession.mode || !studentRecoveryKit || recoverySession.assignmentId !== recoveryAssignmentId) return;
    const mode = recoveryModeToRestore(studentRecoverySummary.find((entry) => entry.section === recoverySession.section));
    if (mode) {
      setRecoverySession({ ...recoverySession, mode });
      return;
    }
    const entry = readStudentRouteState(window.history.state);
    if (entry?.surface === 'assignmentResult' && entry.assignmentId === recoverySession.assignmentId && entry.recoverySection) {
      writeStudentRouteState({ ...entry, recoverySection: '' }, { replace: true, owner: user?.uid });
    }
    setRecoverySession(null);
  }, [recoverySession, studentRecoveryKit, recoveryAssignmentId, studentRecoverySummary, user?.uid]);

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
   *
   * And worked out only when what it reads changes. A summary is built only
   * for an assignment whose Warm-Up or DOL Recovery may be actionable now
   * (recoveryDiscoveryCandidates: its original has closed, or a Recovery is
   * under way), and that check reads the assignments, the Recovery records,
   * the bell schedule and the clock, never the tracker. The candidates are
   * kept until one of those changes, so a Submit's tracker changes build the
   * list again only while there is a candidate to build it for, and inside
   * an assignment with no Recovery to offer, never.
   */
  const recoveryDiscoveryScope = user?.role !== 'student' || !user?.id
    ? null
    : activeView === 'dashboard'
      ? RECOVERY_DISCOVERY_ALL
      : (activeView === 'assignment' && activeAssignmentId) || null;
  const studentRecoveryCandidates = useMemo(() => {
    if (!recoveryDiscoveryScope || !studentRecoveryKit) return NO_RECOVERY_OPPORTUNITIES;
    return studentRecoveryKit.recoveryDiscoveryCandidates({
      assignments: recoveryDiscoveryScope === RECOVERY_DISCOVERY_ALL
        ? assignments
        : assignments.filter((assignment) => assignment.id === recoveryDiscoveryScope),
      sectionRecoveryByAssignment,
      studentId: user.id,
      classId: user.classId || null,
      classPeriod: user.classPeriod,
      schedule: classSchedule,
      studentProfile: user.timingProfile || null,
      nowValue: now,
    });
  }, [recoveryDiscoveryScope, studentRecoveryKit, user?.id, user?.classId, user?.classPeriod, user?.timingProfile, assignments, sectionRecoveryByAssignment, classSchedule, now]);
  const studentRecoveryDiscovery = useMemo(() => {
    if (!recoveryDiscoveryScope || !studentRecoveryKit) return NO_RECOVERY_OPPORTUNITIES;
    // Nothing worth a summary: the same empty list, whatever the tracker says.
    if (!studentRecoveryCandidates.length) return NO_RECOVERY_OPPORTUNITIES;
    return studentRecoveryKit.buildStudentRecoveryDiscovery({
      candidates: studentRecoveryCandidates,
      trackerByAssignment: projectTeacherOverridesForDisplay(tracker, teacherGradeOverridesByAssignment) || {},
      sectionRecoveryByAssignment,
      overridesByAssignment: teacherGradeOverridesByAssignment || {},
      studentId: user.id,
      classId: user.classId || null,
      classPeriod: user.classPeriod,
      schedule: classSchedule,
      studentProfile: user.timingProfile || null,
      nowValue: now,
    });
  }, [recoveryDiscoveryScope, studentRecoveryKit, studentRecoveryCandidates, user?.id, user?.classId, user?.classPeriod, user?.timingProfile, tracker, teacherGradeOverridesByAssignment, sectionRecoveryByAssignment, classSchedule, now]);
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
      && !recoveryAnnouncedRef.current.has(`${user.id}:${opportunity.noticeKey}`)
      && !recoveryWasNotified(user.id, opportunity));
    if (!fresh.length) return;
    fresh.forEach((opportunity) => {
      // Keyed by student (RC09): the next student signing in on a shared
      // Chromebook still hears about their own Recovery.
      recoveryAnnouncedRef.current.add(`${user.id}:${opportunity.noticeKey}`);
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
   * cannot move a recorded grade. Asked for by the screens that show it
   * (WORKED OUT WHEN A SCREEN SHOWS THEM, above).
   */
  const studentGradeCenterNow = () => renderMemo('gradeCenter', [
    user, assignments, now, gradeDisplayTracker, testCycleGrades, classworkGradesByAssignment,
    gradingPeriodSettings, classroomSyncStatusByAssignment, studentClassPoints.redemptionsByAssignment,
    sectionRecoveryByAssignment, teacherGradeOverridesByAssignment,
  ], () => {
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
  });

  /*
   * WHICH ASSIGNMENTS THE WALLET OFFERS, AND THE ONE DOOR THAT SPENDS POINTS.
   *
   * `practicePassEligibleAssignments` is a best-effort UX filter over data this
   * component already holds for the dashboard (`assignments`,
   * `gradeDisplayTracker`) -- it never decides eligibility. `redeemPracticePass`
   * (functions/index.js) independently re-verifies everything before it ever
   * spends a point; a refusal surfaces through the wallet's own inline error
   * state, and the balance shown never moves until the authoritative account
   * subscription above updates it. Asked for by My Rewards and Grades' ways
   * to raise (WORKED OUT WHEN A SCREEN SHOWS THEM, above).
   */
  const studentPracticePassEligibleNow = () => renderMemo('practicePassEligible', [user, assignments, gradeDisplayTracker, studentClassPoints.redemptionsByAssignment, now], () => (
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
  ));

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

  const [
    courseLevelByStudentId, searchableStandards, teacherLearningProfiles, teacherWeeklyRoster,
    teacherWeeklyGoalsByStudent,
  ] = useTeacherLearningPaths(
    user, teacherPreviewRuntimeActive, teacherTab, classes, activeClass, assignments, allStudents,
    teacherStudentDataMode, teacherKit, pacingByClass, skillOverrides, weeklyGoalsByClass,
    setWeeklyPathCompletionsByStudent, setWeeklyPathGoalSnapshotsByStudent, weeklyPathGoalSnapshotsByStudent,
    setWeeklyPathTruncated, setWeeklyPathProgressLoadedFor, setWeeklyPathProgressLoading, now, courseProfiles,
    teacherMasteryProfilesByStudentId, classesById,
  );

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
          // The section the post named: if it is not open yet, the student
          // is told why they landed elsewhere (NAV-22).
          launchedSectionKey: target.sectionKey || null,
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
  const lastActivityRef = useRef(Date.now());
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
  // The open Recovery's questions for the teacher, for its "out of practice
  // questions" screen (RC10, SectionRecoveryRunner). Read only while a
  // Recovery is open and the student has a teacher to send to.
  const recoveryTeacherQuestions = useTeacherQuestionsOn({
    studentId: askingStudentId && user?.assignedTeacherEmail ? askingStudentId : null,
    classId: user?.classId || null,
    teacherEmail: askingStudentId ? user.assignedTeacherEmail || null : null,
    assignmentId: recoverySession?.assignmentId || null,
  });
  const publishPresenceNowRef = useRef(null);
  // Session-only active time for the live monitor/archive. Assignment question
  // timers are cumulative across resumes, and assignment-activity pending time
  // is periodically flushed/reset, so neither is a valid class-session clock.
  const liveSessionActiveSecondsRef = useRef({ assignmentId: null, seconds: 0 });
  const liveSessionAttemptBaselineRef = useRef({ assignmentId: null, totalAttemptsByIndex: {} });
  const activeTimeRef = useRef(0);
  const pendingAssignmentSecondsRef = useRef(0);
  const classroomSyncNoticeRef = useRef({});

  useSchoolClock({ user, assignments, now, setNow, classSchedule });

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

  useAssignmentListeners({
    user, tracker, setNow, testCycleGrades, studentAssignmentControls, studentClassAssignmentsRef,
    studentPriorWorkAssignmentsRef, studentViewerRef, publishStudentAssignments, teacherClassControls,
    teacherSharedAssignmentsRef, publishTeacherAssignments,
  });

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

  const { studentWeeklyPathFacts } = useStudentWeeklyPathProgress({ user, setStudentWeeklyPathProgress, now, studentDashboardMode, studentWeeklyGoalConfig });

  useStudentPathSignals({ user, setStudentPathInterventionState, setStudentServerMasteryProfiles });

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
  // Asked for by Home and My Math Path (WORKED OUT WHEN A SCREEN SHOWS THEM,
  // above): the student record under it is rebuilt with every tracker change.
  const studentPathOptionsNow = () => renderMemo('pathOptions', [studentRecord, studentPathAssignments, studentCourseId, studentStoredPacing, studentOverrides, studentServerMasteryProfiles], () => buildStudentPathOptions({
    student: studentRecord,
    assignments: studentPathAssignments,
    courseId: studentCourseId,
    pacing: studentStoredPacing,
    teacherOverrides: studentOverrides,
    serverMasteryProfiles: studentServerMasteryProfiles,
  }));

  // Downstream presentation may want to say whether timing is automatic or
  // teacher-set. The engine has already resolved that distinction for us.
  const studentPacingNow = () => studentPathOptionsNow()?.pacing || studentStoredPacing;

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

  const [handleSavePacing, handleSaveWeeklyGoal, handleSaveOverrides, handlePersonalPathRecommendation] = teacherKit ? teacherKit.createPathPacingControls(
    toastError, toastSuccess, user, requireTeacherKit, setPacingByClass, setSkillOverrides,
    setPathInterventionBusyStudentId, setPacingBusy, setWeeklyGoalsByClass, weeklyGoalsByClass, setWeeklyGoalBusy,
    teacherStudentIdentityIndex,
  ) : NO_TEACHER_CONTROLS;

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

  const [autoPublishAssignmentPackageToClassroom, handleRepairClassroomAssignmentPost] = teacherKit ? teacherKit.createClassroomPublishingControls(toastError, toastInfo, toastSuccess, toastWarning, user, requireTeacherKit) : NO_TEACHER_CONTROLS;

  const repairGradesByAssignmentWithCurrentGrader = ({
    repairAssignmentTrackerForCurrentGrader,
    gradesByAssignment = {},
    assignmentList = [],
    correctedAt = new Date().toISOString(),
    studentId = null,
    classId = null,
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
        // A repair retry is counted as the student's screen counts it.
        assignment,
        studentId,
        classId,
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
        studentId: student?.id || null,
        classId: student?.classId || null,
      });
      return result.changed
        ? { student, gradesByAssignment: result.gradesByAssignment }
        : null;
    }).filter(Boolean);

    if (!repairs.length) return 0;

    // Only the assignments a repair changed are written, each as the functions
    // write it (settings/serverGrading.splitGradeRecords): its records on the
    // grades document and, when any is split, its detail document replaced to
    // match (gradeEntryStorage.mjs). One student per batch (a detail document
    // can be large). A student whose saved work is not whole is skipped and
    // logged, never written from a summary.
    const splitAll = await readSplitSwitch(db);
    const written = [];
    for (const repair of repairs) {
      const { student, gradesByAssignment } = repair;
      const before = student?.gradesByAssignment || {};
      const changedIds = Object.keys(gradesByAssignment).filter((assignmentId) => gradesByAssignment[assignmentId] !== before[assignmentId]);
      if (!changedIds.length) continue;
      const batch = writeBatch(db);
      try {
        changedIds.forEach((assignmentId) => writeTrackerSplit({
          db, writer: batch, studentId: student.id, assignmentId, tracker: gradesByAssignment[assignmentId], splitAll,
        }));
      } catch (error) {
        console.error('Skipped a current-grader repair:', error);
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await batch.commit();
      written.push(repair);
    }

    const repairedById = new Map(written.map(({ student, gradesByAssignment }) => [
      student.id,
      gradesByAssignment,
    ]));
    setAllStudents((current) => current.map((student) => (
      repairedById.has(student.id)
        ? { ...student, gradesByAssignment: repairedById.get(student.id) }
        : student
    )));
    return written.length;
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

  useTeacherRosterData(
    user, teacherPreviewRuntimeActive, teacherTab, teacherWorkspaceMode, teacherGraderRepairRanRef, assignments,
    assignmentsRef, allStudents, setAllStudents, teacherRosterSummaries, setTeacherStudentDataMode,
    persistCurrentGraderCreditRepairs, collectStudentGradeSnapshot, studentGradeSourceForViewer,
  );

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

  // A STUDENT'S DEVICE READS ONE CLASS: THEIR OWN. What a student's screens
  // keep of a class is its record's name, period, teacher of record, course and
  // level (rosterMembership.js studentClassFields), for the class their roster
  // row names. Sign-in used to read the whole collection for it — every class
  // in the school, on every student's Chromebook — and a move to another class
  // read it all again. Fails as fetchClasses does: nothing read, the class's
  // fields fall back to the period's course settings.
  const fetchStudentClass = async (classId) => {
    const id = String(classId || '').trim();
    if (!id) {
      setClasses([]);
      classesRef.current = [];
      return [];
    }
    try {
      const snapshot = await getDoc(doc(db, 'classes', id));
      const value = snapshot.exists() ? [{ classId: snapshot.id, ...snapshot.data() }] : [];
      setClasses(value);
      classesRef.current = value;
      return value;
    } catch (error) {
      console.error('Could not load the class:', error);
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

  // WHAT THE SAVE LINE IS ABOUT: a draft, or an answer the student sent
  // (RUN-11, saveStatusModel.js). Derived during render so "Answer recorded"
  // appears with the drain that recorded it. Each render folds the status it
  // shows into the subject the last render worked out (renderFold,
  // renderStability.js): an effect committing it cost App a render of its own
  // after every change of the status, three on each Submit and Next. The
  // state holds what a handler or a reset says (an answer sent, a new
  // assignment or student); the fold starts again from it when it moves.
  const [studentSaveSubjectState, setStudentSaveSubject] = useState(initialSaveSubject);
  const studentSaveSubject = renderFold('saveSubject', studentSaveSubjectState, (subject) => nextSaveSubject(subject, { type: 'status', status: studentPersistenceStatus, pendingGradeCount: studentPendingGradeCount }));
  const studentSaveLine = describeRuntimeSaveLine({ persistenceStatus: studentPersistenceStatus, subject: studentSaveSubject, outboxDepth: studentOutboxDepth, pendingGradeCount: studentPendingGradeCount });
  // Unfinished work on this assignment that is not being saved (Batch 3,
  // draftSaveHealth.js), re-read whenever its health changes. While it
  // stands, the line does not also say "Draft saved" (saveLineIsAboutDrafts).
  const studentDraftSaveProblem = draftSaveHealthVersion >= 0
    ? describeDraftSaveProblems(draftSaveProblemsFor({ studentId: user?.id, assignmentId: activeAssignmentId }))
    : null;
  const studentSaveLineShown = studentPersistenceStatus !== 'idle'
    && !(studentDraftSaveProblem && saveLineIsAboutDrafts({ persistenceStatus: studentPersistenceStatus, subject: studentSaveSubject, pendingGradeCount: studentPendingGradeCount }));
  // A routine line is not drawn on a phone (saveStatusModel.saveLineIsRoutine).
  const studentSaveLineRoutine = saveLineIsRoutine({ persistenceStatus: studentPersistenceStatus });
  // What the save line says aloud: only when the student must act.
  const studentSaveLineAnnouncement = studentPersistenceStatus === 'rejected'
    ? 'This change was not accepted because the assignment is no longer available.'
    : ['offline', 'needs-review'].includes(studentPersistenceStatus) ? studentSaveLine || '' : '';
  // From the subject the line shows (the fold's), not the state it last started from.
  const markAnswerSent = () => setStudentSaveSubject((current) => nextSaveSubject(renderFold.from('saveSubject', current), { type: 'answer-sent' }));
  // The line is about this student's work in this assignment: it starts over
  // when either changes.
  useEffect(() => {
    setStudentSaveSubject(initialSaveSubject());
  }, [activeAssignmentId, user?.id]);
  // So does what it said about one save: "Draft saved." or "Not saved · …" on
  // the last assignment is not about this one's work. A change the device
  // could not store stays on Home (studentUnstoredAssignmentIds) until it is
  // (saveStatusModel.persistenceStatusOnAssignmentChange).
  useEffect(() => {
    setStudentPersistenceStatus(persistenceStatusOnAssignmentChange);
  }, [activeAssignmentId]);
  // Another account on this Chromebook starts with no line and no unstored
  // work of the last one's: Log Out asked first while any was left. Before a
  // drain stopped saying "saved" for nothing, its false success did this.
  useEffect(() => {
    setStudentPersistenceStatus('idle');
    setStudentUnstoredAssignmentIds([]);
  }, [user?.id]);
  /*
   * THE DEVICE'S OWN INCIDENT REPORT — COALESCED, AND OFF THE GRADE PATH.
   *
   * One coordinator for the whole session, so a burst of submissions cannot
   * spawn a report cycle each. A reporting failure updates a banner and
   * nothing else: it never reaches the delivery path, which is the point.
   */
  const studentReportCoordinatorRef = useRef(null);

  const [drainStudentOutbox, reconcileAndReportStudentOutbox] = createStudentOutbox(
    user, setAssignmentResultRoute, setActiveClassroomSectionKey, setActiveView, setActiveAssignmentId,
    setStudentOutboxDepth, setStudentPendingGradeCount, setStudentNeedsReviewCount,
    setStudentNeedsReviewAssignmentIds, setStudentPersistenceStatus, showStudentReportingError, setPracticeTracker,
    setPracticeScratchpads, setPreviewTracker, studentReportCoordinatorRef,
  );

  /*
   * SIGN-IN'S READS AND THE LISTENERS THAT FOLLOW THEM ASK THE SERVER ONCE.
   *
   * Before anything is on screen, sign-in reads a student's roster row and
   * their class's lessons, or a teacher's assignments, with one-shot reads
   * (online they wait for the server; offline they answer from the cache).
   * The screens then open listeners on exactly those documents — and each
   * listener's first snapshot read them all again, because the one-shot
   * read's target had already been let go.
   *
   * Firestore's SDK keeps one target per document or query, however many reads
   * and listeners ask for it, and asks the server for it once. So sign-in holds
   * each of those targets open with a listener that does nothing, from just
   * before its read until the screen's own listener is open on it: the read,
   * and then the listener, ride the hold's one request. What each is given,
   * and when, is unchanged. Holds are let go once the signed-in user is set
   * (by an effect declared after those listeners', so it runs after they open),
   * when sign-in fails, and when it is superseded.
   *
   * The holds are the hydration effect's own (its signInHolds, which its
   * cleanup releases); this ref reaches the same array, so the release once
   * the user is set can empty it first.
   */
  const signInHoldsRef = useRef([]);
  const releaseSignInHolds = () => {
    signInHoldsRef.current.splice(0).forEach((release) => release());
  };

  useEffect(() => {
    let cancelled = false;
    // Sign-in's holds (signInHoldsRef above): this effect's, released by its
    // cleanup, or sooner through the ref, which empties this same array.
    const signInHolds = [];
    signInHoldsRef.current = signInHolds;
    const holdSignInTarget = (target) => {
      signInHolds.push(onSnapshot(target, () => {}, () => {}));
    };
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
    // Any sign-in but the one this page last hydrated (after a sign-out, or
    // straight from another account) reads My Math Path's coverage index
    // again: a content release reaches a student at their next sign-in
    // (platform/path/pathCoverageService.js).
    if (hydratedSessionUidRef.current !== session.uid) {
      forgetSessionPathCoverage();
      studentWeeklyPath.forget();
    }
    hydratedSessionUidRef.current = session.uid;

    const hydrateSession = async () => {
      setSessionHydrating(true);
      setSessionHydrationError(null);
      try {
        if (session.role === 'teacher') {
          holdSignInTarget(collection(db, 'assignments'));
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
        holdSignInTarget(doc(db, 'grades', studentId));
        const studentSnapshot = await getDoc(doc(db, 'grades', studentId));
        if (!studentSnapshot.exists()) throw new Error('Your student record is not available. Ask your teacher to add you to the roster.');
        // Whole records: the open question restores its parts, steps and last
        // response, stored beside the grades document (gradeEntryStorage.mjs).
        const studentData = await joinResponseDetail(db, studentId, studentSnapshot.data() || {});
        // The class query fetchStudentAssignments reads first, which the
        // class's lesson listener then keeps. Not for a sign-in already
        // superseded (signed out, another account): its cleanup let go of
        // its holds, and nothing will take this one.
        if (!cancelled && String(studentData.classId || '').trim()) holdSignInTarget(studentClassAssignmentsQuery(db, studentData.classId));
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
        const loadedClasses = await fetchStudentClass(studentData.classId);
        if (cancelled) return;
        // The class, its name, period and teachers, and the course and level it sets, from the roster row
        // and the class's record; the grade document's listener keeps them following the row
        // (platform/student/rosterMembership.js).
        const { course: classCourse, courseLevel: classCourseLevel, ...classFields } = studentClassFields({
          rosterRow: studentData,
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
          // classId, className, classPeriod, teacherOfRecord, and the teacher the
          // roster row names, verbatim: support evidence the student's client
          // records must name exactly this teacher (firestore.rules).
          ...classFields,
          profile: {
            ...studentProfile,
            course: classCourse,
            courseLevel: classCourseLevel,
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
          // The error itself: SessionGate turns it into words for the person
          // (studentErrorText.js) and the technical text stays here.
          console.error('Could not load the signed-in account:', error);
          setSessionHydrationError(error || new Error('MathMaster could not load your account.'));
        }
        // No screen will open the listeners these held targets were for. This
        // sign-in's own holds: a newer one's are not this one's to let go.
        signInHolds.splice(0).forEach((release) => release());
      } finally {
        if (!cancelled) setSessionHydrating(false);
      }
    };

    hydrateSession();
    return () => {
      cancelled = true;
      // A sign-in superseded (signed out, or another account) holds nothing.
      signInHolds.forEach((release) => release());
    };
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
    questionRecordView(assignmentTracker?.[index]);

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

  const [flushAssignmentActivity] = createAssignmentActivityFlush(
    user, assignments, activeAssignmentId, assignmentActivity, setAssignmentActivity, setClassworkGradesByAssignment,
    pendingAssignmentSecondsRef,
  );

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
  // A new object per question on every call: worked out once per copy of the
  // assignment, and so the same question QuestionEngine was handed before.
  const activeQuestions = useMemo(() => getStoredAssignmentQuestions(activeAssignmentData), [activeAssignmentData]);

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
  const activeLifecycleStudentId = user?.role === 'student' ? user.id : undefined;
  const activeLifecycle = useMemo(() => getAssignmentLifecycle(activeAssignmentData, now, {
    studentId: activeLifecycleStudentId,
  }), [activeAssignmentData, now, activeLifecycleStudentId]);
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
  // The bell schedule's time-zone arithmetic, once per tick of the clock.
  const activeDOLState = useMemo(() => getDOLState({ assignment: activeAssignmentData, schedule: classSchedule, classId: user?.classId || null, classPeriod: user?.classPeriod, nowValue: now }), [activeAssignmentData, classSchedule, user?.classId, user?.classPeriod, now]);
  const activeQuestionRole = resolveQuestionActivityRole({
    question: activeQuestions[currentQuestionIndex],
    assignment: activeAssignmentData,
    isDOL: activeDOLState.enabled && currentQuestionIndex === activeDOLState.questionIndex,
  });
  const activeActivityPolicy = getEffectiveActivityPolicy(isPracticeMode ? 'practice' : activeQuestionRole, activeAssignmentData);

  useLiveTeachingPreviewSync(
    user, liveTeachingSession, setLiveTeachingSession, walkthroughWriteRef, activeAssignmentId, setPreviewScratchpads,
    currentQuestionIndex, activeAssignmentData, isTeacherPreview, activeQuestionRole,
  );

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
  const { checkpointOutcomes } = useDolCheckpointReceipts({ user, assignments, activeAssignmentId, now, classSchedule });

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
    // A personalized question this device has no pin for waits for the
    // server's pins (RT15, the question view below) — never for long: past
    // FAMILY_PIN_SERVER_WAIT_MS, or a failed read, it is dealt as before.
    // The wait ends in a transition: the question it held back mounts then,
    // and QuestionEngine's code may still be on its way (app/lazyScreens.js).
    // An ordinary update would hide the workspace already on screen behind the
    // app's "Loading your MathMaster workspace…" until it came (seconds on a
    // cold Chromebook); a transition keeps "Loading this question…" up instead.
    setServerDeliveryPins({ assignmentId: activeAssignmentId, known: false, pins: null });
    const stopWaitingForPins = () => startTransition(() => setServerDeliveryPins((current) => (
      current.assignmentId === activeAssignmentId && !current.known ? { ...current, known: true } : current
    )));
    const pinWait = window.setTimeout(() => { if (!cancelled) stopWaitingForPins(); }, FAMILY_PIN_SERVER_WAIT_MS);
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
        const result = await drafts.save(document);
        if (!serverCopyRead) readServerCopy();
        return result;
      },
    });
    workspaceDraftSyncRef.current = sync;
    const unsubscribe = subscribeToQuestionDrafts((event) => sync.record(event));
    // The server copy is read as the assignment opens, and that read is held
    // for the first save, which is merged into it in the same transaction:
    // one read of the document for both, where the opening and the first save
    // each read it (platform/persistence/heldDraftRead.js). A save never waits
    // for that read, and every later save reads for itself, as before. (The
    // sync's flush, above, saves through it; nothing saves before this line.)
    const drafts = createHeldDraftReads({
      open: () => openWorkspaceDraft({ studentId: user.id, assignmentId: activeAssignmentId }),
      write: writeWorkspaceDraft,
    });

    let reading = false;
    let serverCopyRead = false;
    const readServerCopy = () => {
      if (cancelled || reading) return;
      reading = true;
      drafts.read()
        .then((stored) => {
          if (cancelled) return;
          serverCopyRead = true;
          const entries = readWorkspaceDraftEntries(stored);
          // Which version of each personalized question another Chromebook
          // showed before its first Submit (RT15): a question this device has
          // no pin for shows the same numbers (buildStudentFamilyContext).
          const deliveryPins = readWorkspaceDeliveryPins(stored);
          startTransition(() => setServerDeliveryPins({ assignmentId: activeAssignmentId, known: true, pins: deliveryPins }));
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
          // Every draft this read changed on this device, by key. Only the
          // question on screen is remounted, and only for a draft of its own:
          // another question reads its restored work when it opens, and
          // remounting this one for it lost the key in flight, moved the caret
          // and a screen reader's place (draftsOfQuestionChanged).
          const changed = new Set();
          reconcileToolWorkspaceDrafts(entries, { studentId: user.id, assignmentId: activeAssignmentId, canonicalSavedAt, changed });
          const fieldRecords = reconcileFieldRecordDrafts(entries, { studentId: user.id, assignmentId: activeAssignmentId, canonicalSavedAt, changed });
          restoreQuestionDrafts(restorable.filter((entry) => !fieldRecords.keys.has(entry.key)), { changed });
          if (draftsOfQuestionChanged(changed, currentQuestionIndexRef.current)) {
            setDraftRestoreFocus({
              questionIndex: currentQuestionIndexRef.current,
              position: answerFocusPosition(assignmentQuestionStageRef.current),
            });
            setWorkspaceDraftGeneration((value) => value + 1);
          }
          // Only now is it known what the server holds — and so whether this
          // device has an edit (or a pin) it never received (see workspaceDraftSync).
          sync.noteServerCopy(entries, { deliveryPins });
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
          if (!cancelled) stopWaitingForPins();
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
      window.clearTimeout(pinWait);
      unsubscribe();
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('online', readServerCopy);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      void sync.flushNow();
      sync.stop();
      // A read no save took ends without writing (the last save, above, took it if it could).
      drafts.release();
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
        // Every tick finds it again: never over a save in progress or one the
        // device refused, which that queued work is not (saveStatusModel.js).
        setStudentPersistenceStatus(persistenceStatusWithQueuedWork);
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
        // Read as the heartbeat goes out: a fact is written a moment after
        // the answer that raised it, when no payload is being rebuilt.
        attemptSignalCount: Math.min(999, attemptSignalCount(payload.studentId, payload.assignmentId)),
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

  const { studentSpotlightRequest, studentSpotlightMessage, respondToSpotlight, stopStudentSpotlight, publishSpotlightWork } = useStudentSpotlight({ user, activeView, activeAssignmentId, currentQuestionIndex, studentRecord, activeAssignmentData });

  const [actionGradeScope, teacherActionItems, teacherActionOpenCount] = useTeacherActionCenterData(
    auth, user, teacherPreviewRuntimeActive, teacherTab, teacherWorkspaceMode, classes, assignments, allStudents,
    setStudentSupportEvents, studentSupportEvents, parentContacts, setParentContacts, actionGradeSnapshots,
    setActionGradeSnapshots, actionPracticePasses, setActionPracticePasses, setTeacherActionOpenCountCache,
    teacherActionOpenCountCache, teacherKit, retestRecoveryActions, setRetestRecoveryActions,
    setStudentSessionSummaries, now, classSchedule, teacherStudentDataMode,
  );

  const [attendanceReviewBusyKey, setAttendanceReviewBusyKey] = useState(null);

  const [handleKeepAttendanceExtension, handleApplyShorterAttendanceExtension, handleRecordStudentSupportEvent] = teacherKit ? teacherKit.createAttendanceExtensionControls(
    toastError, toastSuccess, user, classes, assignments, requireTeacherKit, classSchedule,
    teacherStudentIdentityIndex, setAttendanceReviewBusyKey,
  ) : NO_TEACHER_CONTROLS;

  useTeacherPresence(user, teacherPreviewRuntimeActive, teacherTab, allStudents, setPresenceById);
  const { studentRosterMembership } = useStudentGradeDocument({
    toastSuccess, setUser, user, assignmentsRef, setTracker, setDolGradesByAssignment, setClassworkGradesByAssignment,
    setClassroomSyncStatusByAssignment, setTestCycleGrades, setTeacherGradeOverridesByAssignment,
    setSectionRecoveryByAssignment, setWarmupChallengeByAssignment, liveSessionAttemptBaselineRef,
    classroomSyncNoticeRef,
  });

  useRosterClassFollow({ setUser, user, courseProfiles, classesById, fetchStudentClass, studentRosterMembership });

  // Sign-in's holds (signInHoldsRef above) end here: with the user set, the
  // listeners they were waiting for — the lesson listener and the student's own
  // grade document, both declared above, so opened first — hold the targets.
  // Not before: App mounts with sign-in already under way, and this effect's
  // first run comes in the same commit as the hydration that takes the holds.
  useEffect(() => {
    if (user) releaseSignInHolds();
  }, [user]);

  useTimedSectionReminders({
    toastSuccess, toastWarning, user, studentRequiredFor, activeView, assignments, activeAssignmentId, tracker,
    currentQuestionIndex, now, classSchedule, dolGradesByAssignment, setDolGradesByAssignment, gradeDisplayTracker,
  });

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
    // Every Submit changes the tracker and brings this effect back with the
    // same place to resume: the one this render committed stands, and App is
    // not drawn again for it.
    if (!sameData(resumeAction, action)) setResumeAction(action);
  }, [user, activeView, activeAssignmentId, currentQuestionIndex, assignments, activeQuestionRole, tracker]);

  const { isIdle, setIsIdle } = useActiveTimeClock({
    user, activeView, activeAssignmentId, currentQuestionIndex, lastActivityRef, liveSessionActiveSecondsRef,
    activeTimeRef, pendingAssignmentSecondsRef, getModuleTime, activeSupportPresentation, activeWorkingTracker,
  });

  const { familyDelivery, loadFamilyDelivery, isPersonalizedBlueprint } = useFamilyDeliveryEngine({ activeAssignmentId });

  useStudentScreenPrefetch({ user, activeView, studentDashboardMode, loadFamilyDelivery });

  const { studentScreenAnnouncement } = useStudentScreenChange({
    user, assignmentResultRoute, activeView, teacherTab, assignments, activeAssignmentId, studentDashboardMode,
    activeTestCycleAssignmentId,
  });

  useQuestionReveal({ activeView, activeAssignmentId, currentQuestionIndex, assignmentQuestionStageRef });

  const [changeQuestion] = createQuestionNavigation(
    toastInfo, toastWarning, user, hasPracticePassFor, studentRequiredFor, assignments, activeAssignmentId,
    setTracker, tracker, setStudentOutboxDepth, setStudentPersistenceStatus, setStudentUnstoredAssignmentIds,
    setPreviewTracker, currentQuestionIndex, setCurrentQuestionIndex, setAssignmentOverviewExpanded, classSchedule,
    lastAcademicInteractionRef, activeTimeRef, drainStudentOutbox, flushAssignmentActivity, isTeacherPreview,
    isStudentAssignment, isPracticeMode, activeQuestionRole,
  );

  const [exportAssignmentWorksheetPdf] = createStudentWorksheetExport(
    toastError, toastInfo, toastSuccess, toastWarning, user, studentRequiredFor, assignments, tracker,
    serverDeliveryPins, classSchedule, classworkGradesByAssignment, getSectionAccessState, studentLearningProfile,
    adaptiveStudentProfile, loadFamilyDelivery,
  );

  const [teacherWorksheetStudentsFor, exportTeacherAssignmentWorksheetPdf, beginTeacherWorksheetExport] = teacherKit ? teacherKit.createTeacherWorksheetControls(
    toastError, toastInfo, toastSuccess, user, allStudents, requireTeacherKit, setTeacherWorksheetDialog,
    setTeacherWorksheetBusy, teacherMasteryProfilesByStudentId, teacherLearningProfiles,
  ) : NO_TEACHER_CONTROLS;

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
  // So does an exam a results link started (MP14): leaving My Math Path by
  // any road, Back included, ends it.
  useEffect(() => {
    if (pathLaunchFramework && (studentDashboardMode !== 'mathPath' || activeView !== 'dashboard')) setPathLaunchFramework(null);
  }, [pathLaunchFramework, studentDashboardMode, activeView]);

  const [startTeacherPreview, teachAssignmentLive, resumeLiveTeaching] = createTeacherPreviewNavigation(
    user, setActiveView, activeClass, liveTeachingSession, setLiveTeachingSession, walkthroughWriteRef, assignments,
    setActiveAssignmentId, setPreviewTracker, setPreviewScratchpads, setPreviewSessionId, setCurrentQuestionIndex,
    setAssignmentNavigationCollapsed, setAssignmentOverviewExpanded, gradingPeriodSettings,
    previewTrackerAssignmentIdRef, setTestCyclePreviewAssignment,
  );

  useTeacherBrowserHistory(
    toastInfo, user, urlArrival, activeView, setActiveView, setTeacherTab, teacherTab, setTeacherWorkspaceMode,
    teacherWorkspaceMode, adminTab, setAdminTab, setHomeNavigationPeriod, liveTeachingSession, assignments,
    profileDrawerStudentId, setProfileDrawerStudentId, setSupportReportStudentId, supportReportStudentId,
    caseReviewStudentId, setCaseReviewStudentId, assignmentHubTarget, setAssignmentHubTarget, setLiveFocus,
    classroomSyncProposal, setQuickSearchOpen, activeAssignmentId, setActiveAssignmentId, teacherScratchpadDialog,
    responseInspectorTarget, teacherWorksheetDialog, currentQuestionIndex, setCurrentQuestionIndex,
    questionEditorAssignment, contentUpgradeRequest, teacherBrowserHistoryReadyRef, teacherHistoryStepBackAtRef,
    teacherHistoryRestoreRef, previewTrackerAssignmentIdRef, assignmentPreflight, exportJsonAssignment, deleteDialog,
    setTestCyclePreviewAssignment, testCyclePreviewAssignment, startTeacherPreview, resumeLiveTeaching,
  );

  useLiveTeachingTimer(user, liveTeachingSession, setLiveTeachingSession, teacherHistoryRestoreRef);

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

  // How many pages the store held when this scratchpad was last read. Saving
  // needs it to know which page documents the student has since dropped.
  const loadedScratchpadPageCounts = useRef({});

  const [getScratchpadDocumentId, loadScratchpadRecord, handleLoadScratchpad, handleSaveScratchpad] = createScratchpadControls(
    user, assignments, activeAssignmentId, tracker, practiceTracker, practiceScratchpads, setPracticeScratchpads,
    previewTracker, previewScratchpads, setPreviewScratchpads, currentQuestionIndex, isTeacherPreview,
    loadedScratchpadPageCounts,
  );

  const [openTeacherScratchpad] = teacherKit ? teacherKit.createTeacherScratchpadControls(setTeacherScratchpadDialog, setTeacherScratchpadLoading, getScratchpadDocumentId, loadScratchpadRecord) : NO_TEACHER_CONTROLS;

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
    // And it rides the workspace draft, so another Chromebook shows the same
    // numbers before the first Submit (RT15). The server keeps the first pin
    // saved; one this device was offered and had to drop gives way.
    workspaceDraftSyncRef.current?.recordDeliveryPin(delivery, { replace: Boolean(renderedQuestion?.familyPinNotice) });
    familyDeliveriesRef.current.set(shownDeliveryKey(delivery), { delivery, question: renderedQuestion || null });
  }, [user?.role, user?.id, isTeacherPreview]);
  // A teacher's preview deals family slots too. What it showed is kept under
  // its own key, only so its tries are counted on it (P-7): nothing is pinned.
  const handlePreviewFamilyDelivery = useCallback((delivery, renderedQuestion) => {
    if (delivery?.slot) familyDeliveriesRef.current.set(shownDeliveryKey({ ...delivery, preview: true }), { delivery, question: renderedQuestion || null });
  }, []);
  // What a slot's pin dealt, rebuilt once per pin and per copy of the
  // assignment (platform/generation/dealtFamilyQuestion.js).
  const dealtFamilyQuestionsRef = useRef(new WeakMap());

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
    const checkpoint = {
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
    };
    // Nothing to queue (no close the scheduler could finalize at): the save
    // line stays as it is. Setting "capturing" first left it reading
    // "Saving…" for a save that was not happening (RT18).
    if (!buildResponseCheckpointAction(checkpoint)) return;
    try {
      setStudentPersistenceStatus('capturing');
      const queued = await enqueueResponseCheckpoint(checkpoint);
      if (!queued) return;
      checkpointFingerprintRef.current.set(documentId, fingerprint);
      setStudentOutboxDepth((depth) => depth + 1);
      setStudentPersistenceStatus('queued');
      setStudentUnstoredAssignmentIds((ids) => withoutUnstoredWork(ids, activeAssignmentId));
      // Reconciliation happens in the background. The student keeps working.
      void drainStudentOutbox();
    } catch (error) {
      console.error('Response checkpoint remains local:', error);
      setStudentUnstoredAssignmentIds((ids) => withUnstoredWork(ids, activeAssignmentId));
      setStudentPersistenceStatus('volatile');
    }
  }, [activeAssignmentId, user, isTeacherPreview, assignments, currentQuestionIndex, tracker, classSchedule, activeQuestionRole]);

  const [
    countedQuestionFor, countedQuestionKnownFor, terminalCountingFor, familyDeliveryForQuestion, handleGradeSubmit,
    handleStepGrade, handleRequestNewQuestion,
  ] = createGradingControls(
    user, studentRequiredFor, assignments, activeAssignmentId, setTracker, tracker, setStudentOutboxDepth,
    setStudentPersistenceStatus, setStudentUnstoredAssignmentIds, practiceTracker, setPracticeTracker, previewTracker,
    setPreviewTracker, currentQuestionIndex, classSchedule, dolGradesByAssignment, setDolGradesByAssignment,
    getSectionAccessState, setSupportUsageByAssignment, supportUsageByAssignment, teacherGradeOverridesByAssignment,
    studentLearningProfile, lastAcademicInteractionRef, activeTimeRef, markAnswerSent,
    reconcileAndReportStudentOutbox, flushAssignmentActivity, activeQuestions, isTeacherPreview, activeQuestionRole,
    activeActivityPolicy, familyDelivery, isPersonalizedBlueprint, familyDeliveriesRef, dealtFamilyQuestionsRef,
  );

  const [V5_COMPILER_PLUMBING_ERROR, openAssignmentPreflight] = teacherKit ? teacherKit.createAssignmentPreflightControls(requireTeacherKit, setAssignmentPreflight) : NO_TEACHER_CONTROLS;

  const [
    studentsInActiveClass, teacherAnalyticsStudents, weeklyPathWeekKey, weeklyPathWeekComplete, needsAttentionQueue,
    profileDrawerStudent, profileDrawerLearningProfile, profileDrawerSupportEvents, profileDrawerSessionSummaries,
    profileDrawerPlan,
  ] = useTeacherAnalytics(
    user, teacherTab, classes, activeClass, setActiveClass, assignments, allStudents, teacherRosterSummaries,
    profileDrawerStudentDetail, setProfileDrawerStudentDetail, studentSupportEvents, teacherKit,
    studentSessionSummaries, pacingByClass, skillOverrides, weeklyGoalsByClass, weeklyPathCompletionsByStudent,
    profileDrawerStudentId, profileSupportHistory, setProfileSupportHistory, weeklyPathTruncated, setQuickSearchOpen,
    weeklyPathProgressLoadedFor, now, courseProfiles, classesById, teacherLearningProfiles, teacherWeeklyRoster,
    teacherWeeklyGoalsByStudent, setGradebookFilter,
  );

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

  const [
    handleReleaseAssignmentFeedback, resolveTeacherClassContext, handleUnlockDOLForClass,
    handleGrantDOLAttemptForClass, handleGrantDOLAttemptForStudents, handleDolControlForClass,
  ] = teacherKit ? teacherKit.createDolClassControls(
    confirmAction, toastError, toastInfo, toastSuccess, toastWarning, user, classes, activeClass, allStudents,
    teacherKit, requireTeacherKit, classSchedule, setFeedbackReleaseBusyId, setDolUnlockBusyKey,
    setDolAttemptGrantBusyKey, setDolControlBusyKey, studentControlsGateRef,
  ) : NO_TEACHER_CONTROLS;

  const [
    handleViewClassGradebook, openAssignmentHub, loadClassGradeRecords, openGradeExport, openGradebookFor,
    openLiveFor, handleLoadDeliveredRigor,
  ] = teacherKit ? teacherKit.createGradebookNavigation(
    setTeacherTab, classes, activeClass, setActiveClass, allStudents, setAssignmentHubTarget, setGradeExportScope,
    setLiveFocus, setGradebookProgressFilter, setClassEvidenceByStudentId, classEvidenceLoading,
    setClassEvidenceLoading, setGradebookFilter,
  ) : NO_TEACHER_CONTROLS;

  const [handleToggleWarmupForClass, handleToggleSectionAccessForClass] = teacherKit ? teacherKit.createWarmupSectionControls(
    confirmAction, toastError, toastInfo, toastSuccess, toastWarning, user, classSchedule, setWarmupControlBusyKey,
    setSectionAccessBusyKey, resolveTeacherClassContext,
  ) : NO_TEACHER_CONTROLS;

  // A class change invalidates the loaded evidence. Showing one class's
  // delivered rigor under another class's name is worse than showing none.
  useEffect(() => {
    setClassEvidenceByStudentId({});
  }, [activeClass.classId]);

  const [
    handleGoToClassFromHome, handleChangeClassPeriod, handleSupportProfileSaved, handleSaveClassSchedule,
    handleUpdateCourseProfile, handleSaveCourseProfiles,
  ] = teacherKit ? teacherKit.createClassSettingsControls(
    toastError, toastSuccess, setTeacherTab, classesRef, setActiveClass, setHomeNavigationPeriod, setAllStudents,
    setTeacherRosterSummaries, classSchedule, setClassSchedule, courseProfiles, setCourseProfiles,
    setCourseProfilesSaving, fetchTeacherRosterSummaries,
  ) : NO_TEACHER_CONTROLS;

  const [
    saveAssignmentFolderPaths, handleCreateFolder, handleRenameFolder, handleDeleteFolder,
    handleMoveAssignmentToFolder, handleToggleArchiveAssignment, handleTogglePauseAssignment,
    toggleAssignmentSelected, clearAssignmentSelection, handleBulkArchive, handleBulkMoveToFolder,
    handleCreateGradingPeriod, handleSetCurrentGradingPeriod, handleSetGradingPeriodArchived,
    handleMoveSelectedAssignmentsToGradingPeriod, handleLinkWarmupChallenge, beginEditAssignmentDates,
  ] = teacherKit ? teacherKit.createAssignmentLibraryControls(
    confirmAction, toastError, toastSuccess, classes, assignments, setEditingAssignmentId, setEditingAssignmentDates,
    assignmentFolderPaths, setAssignmentFolderPaths, gradingPeriodSettings, setGradingPeriodSettings,
    setGradingPeriodBusy, selectedAssignmentIds, setSelectedAssignmentIds, setBulkBusy, fetchAssignments,
  ) : NO_TEACHER_CONTROLS;

  // The Student Support Evidence Report replaced the pop-up "IEP Support
  // Report", which listed every assignment in the library and printed
  // "0 min" where time was simply not recorded. Same entry points, new report.
  const openIEPReport = (student) => {
    if (!student?.id) return;
    setSupportReportStudentId(student.id);
  };

  const [openDeleteDialog, closeDeleteDialog, deleteAssignmentPermanently, archiveFromDeleteDialog] = teacherKit ? teacherKit.createAssignmentDeleteControls(
    toastSuccess, deleteDialog, setDeleteDialog, setDeleteEvidence, deleteClassroomAcknowledged,
    setDeleteClassroomAcknowledged, setDeleteStep, deleteTitleConfirmation, setDeleteTitleConfirmation,
    deleteAcknowledged, setDeleteAcknowledged, isDeleting, setIsDeleting, setDeleteError, fetchAssignments,
  ) : NO_TEACHER_CONTROLS;

  /*
   * THE PACK-UP LINE (student pass 3, NAV-24): the last five minutes of the
   * period. It used to be a fixed 125–160px banner over the top of every
   * screen, which covered the assignment's sticky navigator (section tabs,
   * Previous/Next) for a student finishing their work. It is now a slim row of
   * the identity bar (StudentIdentityBar `notice`): it pins with it, and its
   * height moves every sticky surface under it down instead of covering it.
   * It says "your work is saved" only when nothing is owed: it reads the same
   * save status as Home's line (unsent work, a rejected answer, drafts that are
   * not being saved each say so instead; packUpLine.js). A secure exam and a student on DOL extra time (D7) are not
   * interrupted by it.
   */
  // The student's save status, as Home's status line shows it (Batch 3: drafts
  // that are not being saved count). The pack-up line reads the same one, so
  // the two never disagree (NAV-24 review B2).
  // Which assignments the work is on, by the titles the student sees (NV10).
  const studentAssignmentTitles = (ids) => ids
    .map((id) => assignments.find((assignment) => assignment.id === id)?.title)
    .filter(Boolean);
  const studentSaveStatusNow = () => describeSaveStatus({
    // A change this device could not store stays said here after the line
    // has moved on (saveStatusModel.persistenceStatusWithUnstoredWork).
    persistenceStatus: persistenceStatusWithUnstoredWork(studentPersistenceStatus, studentUnstoredAssignmentIds),
    outboxDepth: studentOutboxDepth,
    pendingGradeCount: studentPendingGradeCount,
    online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
    draftsUnsaved: draftSaveHealthVersion >= 0 && Boolean(describeDraftSaveProblems(draftSaveProblemsForStudent(user?.id))),
    needsReviewTitles: studentAssignmentTitles(studentNeedsReviewAssignmentIds),
    unsavedDraftTitles: studentAssignmentTitles(draftSaveHealthVersion >= 0 ? draftSaveProblemAssignmentIds(user?.id) : []),
  });

  const [closeExportJsonDialog, copyExportJsonToClipboard] = teacherKit ? teacherKit.createExportJsonDialogControls(setExportJsonAssignment, setExportJsonCopied) : NO_TEACHER_CONTROLS;

  const [renderDeleteAssignmentDialog, renderExportJsonDialog, renderTeacherScratchpadDialog] = teacherKit ? teacherKit.createTeacherDialogViews(
    allStudents, setTeacherScratchpadDialog, teacherScratchpadDialog, teacherScratchpadLoading, exportJsonAssignment,
    exportJsonCopied, deleteDialog, deleteEvidence, deleteClassroomAcknowledged, setDeleteClassroomAcknowledged,
    deleteStep, setDeleteStep, deleteTitleConfirmation, setDeleteTitleConfirmation, deleteAcknowledged,
    setDeleteAcknowledged, isDeleting, deleteError, archiveFromDeleteDialog, closeDeleteDialog,
    deleteAssignmentPermanently, closeExportJsonDialog, copyExportJsonToClipboard,
  ) : NO_TEACHER_CONTROLS;

  // The address the page opened at, opened once the account has loaded
  // (app/routes/useUrlArrival.js). Called after every action it hands on is
  // declared, and before the session guard returns, as a hook must be.
  /*
   * A NOTICE ABOUT THE WORKSPACE, SHOWN WITH THE WORKSPACE (wave-3 gate).
   *
   * Following a link to a question that has moved ("…so it opened where you
   * can work now") raised its notice as the assignment started opening, so it
   * sat over Home and then "Loading your MathMaster workspace…" for seconds
   * before the work it describes was there. It now waits for the workspace:
   * this effect is part of the commit that puts the assignment on screen —
   * while the workspace's code is still loading the App is suspended and the
   * effect does not run.
   */
  /*
   * THE LIVE CHALLENGE INVITE AND A SPOTLIGHT REQUEST ARE SAID (NAV-23): one
   * polite sentence in the shell's live region when either newly appears,
   * cleared after a few seconds so a screen change does not repeat it.
   */
  /*
   * NOT ON AN EXIT TICKET, QUIZ OR TEST (NAV-25 review B1, R1). Inside an
   * assignment the lobby invite (banner, phone chip, announcement) is offered
   * only where no question of the section the student is on withholds its outcome —
   * the navigator's own rule (outcomeWithheld): never on a DOL, quiz or test
   * before it is released or finished; Classwork and Practice keep it. Home and
   * the other screens are unchanged.
   */
  const studentWorkspaceHoldsOutcome = () => {
    if (user?.role !== 'student' || activeView !== 'assignment' || !activeAssignmentId) return false;
    const assignment = assignments.find((item) => item.id === activeAssignmentId);
    if (!assignment) return false;
    if (getAssignmentLifecycle(assignment, now, { studentId: user.id }).isPracticeOnly) return false;
    const { entries } = projectCurrentAssignmentContent(assignment);
    const role = entries.find((entry) => entry.storageIndex === currentQuestionIndex)?.logicalRole || null;
    // The whole section, not the question on screen (review R1).
    return sectionHoldsLobbyInvite({
      entries,
      role,
      feedbackMode: role ? getEffectiveActivityPolicy(role).feedback : 'immediate',
      released: assignmentFeedbackWasReleased(assignment),
      recordOf: (storageIndex) => tracker?.[activeAssignmentId]?.[storageIndex],
    });
  };
  // Once per change of what the rule reads (the open question, its
  // assignment, the clock for its lifecycle, this assignment's records), not
  // on every render.
  const lobbyInviteHeldHere = renderMemo('lobbyInviteHeld', [user?.role, user?.id, activeView, activeAssignmentId, assignments, now, currentQuestionIndex, tracker?.[activeAssignmentId]], studentWorkspaceHoldsOutcome);

  const { classroomAnnouncementText } = useClassroomAnnouncement({ user, secureExamActive, liveChallengeInvite, studentSpotlightRequest, lobbyInviteHeldHere });

  const { showWhenWorkspaceOpens } = useWorkspaceArrivalNotices({ toastInfo, activeView });

  const [
    startAssignment, openStudentDashboardMode, practiseSkillFromResults, openStudentGradeCenter,
    openStudentAssignmentsCenter, navigateStudent, openStudentOriginLevel, openStudentAssignmentResult,
    joinLiveChallenge, leaveLiveChallenge, startStudentRecovery, openStudentRecovery,
  ] = createStudentNavigation(
    toastInfo, toastWarning, user, hasPracticePassFor, studentRequiredFor, assignmentResultRoute,
    setAssignmentResultRoute, setActiveClassroomSectionKey, activeView, setActiveView, assignments, setPathLaunchTeks,
    setPathLaunchTab, setPathLaunchFramework, activeAssignmentId, setActiveAssignmentId, setTracker, tracker,
    setPracticeTracker, currentQuestionIndex, setCurrentQuestionIndex, setAssignmentNavigationCollapsed,
    setAssignmentOverviewExpanded, classSchedule, classworkGradesByAssignment, getSectionAccessState,
    setRecoverySession, recoveryBusySection, setRecoveryBusySection, setStudentDashboardMode, studentDashboardMode,
    liveChallengeReturn, setLiveChallengeReturn, setActiveTestCycleAssignmentId, setActiveTestCycleOrigin,
    mergeSectionRecoveryRecord, lastActivityRef, liveFocusLossRef, liveSessionActiveSecondsRef,
    liveSessionAttemptBaselineRef, pendingAssignmentSecondsRef, flushAssignmentActivity, assignmentOpenSpanRef,
    setIsIdle, terminalCountingFor, showWhenWorkspaceOpens,
  );
  const [
    renderStudentLiveChallengeInvite, studentActiveWarmup, renderStudentWarmupBanner, renderIdleOverlay,
    renderWhatChangedPanel, renderStudentIdentityShell, renderStudentScreen,
  ] = createStudentShellViews(
    user, studentClassPoints, studentRequiredFor, activeView, assignments, activeAssignmentId, tracker,
    studentOutboxDepth, studentPendingGradeCount, studentNeedsReviewCount, studentPersistenceStatus,
    studentUnstoredAssignmentIds, currentQuestionIndex, now, renderMemo, classSchedule, secureExamActive,
    setStudentDashboardMode, liveChallengeInvite, lastActivityRef, whatChangedItems, studentRecord, handleLogout,
    respondToSpotlight, stopStudentSpotlight, studentSpotlightMessage, studentSpotlightRequest, isIdle, setIsIdle,
    studentScreenAnnouncement, studentSaveStatusNow, classroomAnnouncementText, joinLiveChallenge,
    openStudentAssignmentResult, startAssignment,
  );
  const [renderAssignmentWorkspace] = createAssignmentWorkspaceView(
    user, studentClassPoints, hasPracticePassFor, studentRequiredFor, assignmentResultRoute,
    activeClassroomSectionKey, setActiveClassroomSectionKey, setActiveView, setTeacherTab, liveTeachingSession,
    activeAssignmentId, setActiveAssignmentId, tracker, studentPersistenceStatus, studentReportingError,
    workspaceDraftGeneration, draftRestoreFocus, serverDeliveryPins, practiceTracker, previewTracker,
    previewSessionId, currentQuestionIndex, assignmentNavigationCollapsed, assignmentOverviewExpanded,
    setAssignmentOverviewExpanded, assignmentStatusOpenFor, setAssignmentStatusOpenFor, sectionLockNote,
    setSectionLockNote, assignmentQuestionStageRef, toggleAssignmentNavigation, now, renderMemo, stableCallbacks,
    classSchedule, classworkGradesByAssignment, getSectionAccessState, classroomSyncStatusByAssignment,
    setStudentDashboardMode, studentDashboardMode, setWarmupChallengePlayedRoomIds, warmupChallengePlayedRoomIds,
    liveChallengeInvite, studentRecoveryByAssignment, studentLearningProfile, adaptiveStudentProfile, askMyTeacher,
    helpRequest, setHelpRequest, fetchAssignments, studentSaveLine, studentDraftSaveProblem, studentSaveLineShown,
    studentSaveLineRoutine, studentSaveLineAnnouncement, calculatePracticeProgress, flushAssignmentActivity,
    activeAssignmentData, activeQuestions, activeLifecycle, isTeacherPreview, activeSupportPresentation,
    recordStudentSupportEvidence, activeDOLState, activeQuestionRole, activeActivityPolicy, checkpointOutcomes,
    activeAssignmentUsesWorkspaceDrafts, publishSpotlightWork, studentSpotlightRequest, familyDelivery,
    isPersonalizedBlueprint, changeQuestion, startTeacherPreview, teachAssignmentLive, endLiveTeaching,
    controlWalkthroughTimer, handleLoadScratchpad, handleSaveScratchpad, handleFamilyDelivery,
    handlePreviewFamilyDelivery, handleResponseCheckpoint, countedQuestionFor, countedQuestionKnownFor,
    handleGradeSubmit, handleRequestNewQuestion, handleStepGrade, studentActiveWarmup, renderStudentWarmupBanner,
    renderIdleOverlay, lobbyInviteHeldHere, joinLiveChallenge, openStudentAssignmentResult, openStudentRecovery,
    startAssignment,
  );

  useUrlArrival({
    urlArrival,
    setUrlArrival,
    user,
    arrivedAt: urlArrivalAtRef.current,
    routeKey: user?.role === 'student' && studentBrowserRoute ? studentRouteKey(studentBrowserRoute) : null,
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
      showWhenWorkspaceOpens,
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
    // Until the teacher kit is here, the same "Loading your MathMaster
    // workspace…" AppShell shows while this screen's chunk loads: nothing the
    // screen shows is ever computed without the kit.
    if (teacherKitError) throw teacherKitError;
    if (!teacherKit) {
      return <SessionGate authStatus="loading" hydrationError={null} hydrating launchAssignment={null} onSignOut={() => { resetAddressToHome(); auth.signOut(); }} />;
    }
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
      recoveryStateByAssignment: recoveryStatesFromSummaries(studentRecoverySummariesNow()),
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
        // "Finished" counts a family slot on the question it dealt, as Start does.
        terminalCounting: terminalCountingFor,
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
      testCycleGrades, studentRecoverySummariesNow(),
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
    const gradeCenter = studentGradeCenterNow();
    return gradeCenter ? buildWaysToRaise({
      gradeCenter,
      recoverySummariesByAssignment: studentRecoverySummariesNow(),
      // Only offered to a student who holds a Practice Pass to use.
      practicePassEligibleAssignmentIds: studentRewardWallet?.practicePasses?.count > 0 ? studentPracticePassEligibleNow() : [],
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
          {renderStudentWarmupBanner()}
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading Live Challenge…</div>}>
          <LiveChallengeStudent
            // One mount per room: a new invite is a new game, and nothing the
            // last game's screen held may be shown in it.
            key={liveChallengeInvite?.roomId || 'no-live-challenge'}
            invite={liveChallengeInvite}
            studentProfile={user.profile}
            onExit={leaveLiveChallenge}
            exitLabel={liveChallengeExitLabel(liveChallengeReturn)}
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
          {renderStudentWarmupBanner()}
          {renderStudentLiveChallengeInvite()}
          <MyMathPathApp
          studentId={user.id}
          studentName={formatStudentName({ ...studentRecord, ...user }, { lastFirst: false, neutralLabel: STUDENT_SELF_NEUTRAL_LABEL })}
          studentProfile={adaptiveStudentProfile || user.profile}
          assignments={studentPathAssignments}
          launchTeksCode={pathLaunchTeks}
          // The exam a practice test's link starts, only for the standard it was set for.
          launchFramework={pathLaunchFramework && pathLaunchFramework.teksCode === pathLaunchTeks ? pathLaunchFramework.framework : null}
          // A reload of a My Math Path tab or session (app/routes/urlArrival.js),
          // else the tab a launch asked for (pathLaunchTab, job B).
          initialTab={mathPathArrival?.tab || pathLaunchTab || 'path'}
          initialSessionConfig={mathPathArrival?.sessionConfig || null}
          pathOptions={studentPathOptionsNow()}
          weeklyGoalConfig={studentWeeklyGoalConfig}
          weeklyPathFacts={studentWeeklyPathFacts}
          courseId={studentCourseId}
          studentRecord={studentRecord}
          serverMasteryProfiles={studentServerMasteryProfiles}
          onNavigate={navigateStudent}
          onExit={() => { setPathLaunchTeks(null); setPathLaunchTab(null); setPathLaunchFramework(null); setStudentDashboardMode('assignments'); }}
          />
        </>,
      );
    }
    if (studentDashboardMode === 'assignmentsCenter') {
      return renderStudentScreen(
        <>
          {renderStudentWarmupBanner()}
          {renderStudentLiveChallengeInvite()}
          <StudentAssignmentsCenter
            dashboard={studentDashboard}
            gradeCenter={studentGradeCenterNow()}
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
          {renderStudentWarmupBanner()}
          {renderStudentLiveChallengeInvite()}
          <StudentRewardsCenter
            student={{ ...studentRecord, ...user }}
            wallet={studentRewardWallet}
            classPoints={studentClassPoints}
            inventoryUnavailable={studentClassPoints.inventoryUnavailable}
            redemptions={studentClassPoints.redemptions}
            eligibleAssignments={studentPracticePassEligibleNow()}
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
          {renderStudentWarmupBanner()}
          {renderStudentLiveChallengeInvite()}
          <StudentGradeCenter
            gradeCenter={studentGradeCenterNow()}
            supportPresentation={getStudentSupportPresentation(user.profile)}
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
                // Corrections and the Retest close at it too (TC07), unless the
                // server's home window says otherwise.
                dueAt={activeTestCycleDates?.dueAt || null}
                lateDueAt={activeTestCycleDates?.lateDueAt || null}
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
                // Corrections and the Test review are this account's own
                // browser entries (NV14); another test is another card.
                historyOwner={user.uid}
                key={activeTestCycleAssignmentId}
              />
            </Suspense>
          </div>
        </>,
      );
    }
    if (studentDashboardMode === 'secureExams') {
      return renderStudentIdentityShell(
        <>
          {renderStudentWarmupBanner()}
          {/* Tests & Exams teaches the same navigation as every other
              student destination (it had none of its own). */}
          <div style={{ maxWidth: 920, margin: '0 auto', padding: '16px 14px 0', boxSizing: 'border-box' }}>
            <StudentGlobalNav current={STUDENT_DESTINATION.SECURE_EXAMS} onNavigate={navigateStudent} />
          </div>
          <StudentSecureExamDashboard
          studentProfile={user.profile}
          // The test this list's entry says was open goes first, focused (NV14).
          studentId={user.id}
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
        {/* No Warm-Up banner on Home: the next-action card (or its compact
            Warm-Up card) is the one place the Warm-Up is offered here. */}
        <StudentDashboardView
        dashboard={dashboard}
        // Never the student's support status: Home is read over shoulders.
        student={{ ...studentRecord, ...user }}
        // From Home, Back on the result page says "← Home" and goes there (NAV-9).
        onOpenResult={(assignmentId) => openStudentAssignmentResult(assignmentId, { origin: NAV_LEVEL.HOME })}
        saveStatus={studentSaveStatusNow()}
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
        onOpenLiveChallenge={joinLiveChallenge}
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
          pacing: studentPacingNow(),
          pathOptions: studentPathOptionsNow(),
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
    const resultEntry = findGradeCenterEntry(studentGradeCenterNow(), assignmentResultRoute.assignmentId);
    // The Today rule for this assignment and what comes after it: the result
    // page is where "nothing open now" lands, so it says what opens when and
    // hands off to Up next.
    const resultDashboard = studentUpNextDashboard();
    const resultTodayEntry = resultDashboard?.allEntries.find((entry) => entry.assignment.id === assignmentResultRoute.assignmentId) || null;
    const resultUpNext = resolveUpNext({ dashboard: resultDashboard, assignmentId: assignmentResultRoute.assignmentId });
    const recoveryAssignment = assignments.find((item) => item.id === assignmentResultRoute.assignmentId) || null;
    // Decision 3: once the work is closed for this student and feedback is
    // released, their own answers beside the worked solutions. The callable
    // re-checks every gate; this only decides whether to show the panel. The
    // panel carries its own loading line and its own boundary: code that
    // cannot arrive (offline) leaves the rest of the result page on screen
    // (app/lazyScreens.js studentPanel).
    const resultReviewPanel = resultEntry && recoveryAssignment && resultEntry.frozen
      && !resultEntry.isTestCycle
      && !assignmentHasHeldTeacherFeedback(recoveryAssignment)
      ? (
        <ReviewMyWork
          assignment={recoveryAssignment}
          load={loadMyReviewWork}
          studentProfile={user.profile}
          teacherAnswers={<TeacherAnswers studentId={user.id} assignmentId={recoveryAssignment.id} />}
        />
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
    // A Recovery reopened from its entry opens as the panel would open it
    // now, or not at all (NV14, recoveryModeToRestore).
    const openRecoveryMode = recoverySession?.mode || recoveryModeToRestore(openRecoveryEntry);
    if (recoveryAssignment && openRecoveryEntry && openRecoveryMode) {
      // Its own boundary (RC09): a Recovery screen error stays on this
      // screen, with the way back to the result page.
      const recoveryBoundary = {
        source: 'section-recovery',
        title: 'Recovery could not open',
        message: 'Something went wrong on this screen. Answers you already submitted are kept. Go back to your results and open Recovery again.',
        exitLabel: 'Back to your results',
      };
      return renderStudentScreen(
        <ScreenErrorBoundary {...recoveryBoundary} onExit={() => setRecoverySession(null)}>
        <Suspense fallback={<p role="status" style={{ padding: 24, margin: 0 }}>Opening Recovery…</p>}>
          <SectionRecoveryRunner
            mode={openRecoveryMode}
            assignment={recoveryAssignment}
            entry={openRecoveryEntry}
            studentId={user.id}
            studentProfile={user.profile}
            teacherQuestions={recoveryTeacherQuestions.questions}
            sendTeacherQuestion={recoveryTeacherQuestions.canLeaveQuestion ? recoveryTeacherQuestions.sendQuestion : null}
            onExit={() => setRecoverySession(null)}
            onRecord={(section, record) => mergeSectionRecoveryRecord(recoveryAssignment.id, section, record)}
            onStartAssessment={(section) => startStudentRecovery(recoveryAssignment.id, section)}
          />
        </Suspense>
        </ScreenErrorBoundary>,
      );
    }
    return renderStudentIdentityShell(
      <>
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
          // The printable worksheet lives with the results (NAV-20 review N3).
          onExportPdf={exportAssignmentWorksheetPdf}
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

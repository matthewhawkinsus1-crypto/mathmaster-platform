import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { teacherAdmin } from './auth/authService';
import {
  getAssignmentByLaunchId,
  listClassroomCourseMappings,
  publishAssignmentToClassrooms,
  publishClassroomMaterial,
  storeLessonNotesPdf,
  updateAssignmentClassroomPublications,
} from './classroomApi';
import ClassroomManagerV2 from './ClassroomManagerV2';
import AssignmentQuestionEditor from './AssignmentQuestionEditor';
import QuestionEngine from './QuestionEngine';
import { generateQuestion, isPersonalizedBlueprint } from './problemGenerator';
import {
  emptyQuestionRecord,
  getQuestionCardState,
  getQuestionCredit,
  isChoiceOnlyQuestion,
  normalizeQuestionRecord,
  recordQuestionAttempt,
  recordQuestionStep,
  requestReplacementQuestion,
  resolveQuestionMaximumAttempts,
  resolveQuestionReplacementAllowed,
} from './attemptPolicy';
import {
  parseAssignmentBlueprintText,
  validateAssignmentQuestions,
  assertFirestoreSafeAssignmentPayload,
} from './assignmentBlueprint';
import AssignmentIntake from './AssignmentIntake';
import { hydrateAssignmentCcmr } from './services/assignmentCcmrService.js';
import { auditAlignmentSpecificity, validateAlignments } from './platform/contract/alignments';
import { validateQuestionsSemantics } from './platform/contract/semanticValidation';
import {
  buildQuestionDraftKey,
  clearResumeAction,
  readResumeAction,
  saveResumeAction,
} from './questionDraftStorage';
import {
  CLASS_PERIODS,
  DEFAULT_CLASS_SCHEDULE,
  assignmentIsForStudent,
  evaluateClassworkCompletion,
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
  getIncludedQuestionIndices,
  questionIsIncluded,
} from './assignmentLifecycle';
import { HEARTBEAT_INTERVAL_MS, buildLiveStatus, encodeQuestionStates } from './livePresence';
import { getQuestionRepresentation } from './platform/contract/questionTypeCatalog';
import { getQuestionPrimaryTeksCodes } from './questionMetadata.js';
import {
  buildIEPReportHtml,
  buildSupportUsage,
  getStudentSupportPresentation,
  normalizeStudentProfile,
} from './studentSupport';
import TeacherSidebar from './TeacherSidebar';
import AssignmentLibrary from './AssignmentLibrary';
import AssignmentCardMenu from './AssignmentCardMenu';
import TeacherAssignmentPdfDialog from './components/teacher/TeacherAssignmentPdfDialog.jsx';
import ClassesWorkspace from './ClassesWorkspace';
import { TEXAS_MATH_ACTIVE_COURSES, getTexasStandardsForCourse } from './texasStandards.js';
import ClassContextBar from './components/teacher/ClassContextBar.jsx';
import WeeklyPathGradePanel from './components/teacher/WeeklyPathGradePanel.jsx';
import ClassroomSyncReview from './components/teacher/ClassroomSyncReview.jsx';
import TeacherQuickSearch from './components/teacher/TeacherQuickSearch.jsx';
import StudentProfileDrawer from './components/teacher/StudentProfileDrawer.jsx';
import StudentNameLink from './components/common/StudentNameLink.jsx';
import TeacherHome from './TeacherHome';
import DOLCountdown from './components/student/DOLCountdown.jsx';
import TexasStandardsDashboard from './TexasStandardsDashboard';
import MathToolsLab from './dev/MathToolsLab';
import { useToast } from './ui/Toast';
import { EmptyState, ProgressBar, SearchField, StatCard } from './ui/primitives';
import { buildStudentMasteryProfile, collectStudentEvidence } from './masteryEngine.js';
import {
  getEffectiveActivityPolicy,
  resolveQuestionActivityRole,
} from './platform/policies/activityPolicies';
import { SMART_VIEWS, matchesSmartView } from './assignmentSmartViews';
import { assignmentFolderMatches, normalizeFolderPath, normalizeFolderPaths, renameFolderPath, titleOrFolderMatches } from './assignmentFolders';
import {
  assertPublishable, buildDestinationGroups, destinationAssignmentKey,
  isLibraryAssignment, resolveAssignmentDates, resolveCreationMode,
} from './assignmentDestinations';
import LessonPreflightModal from './components/teacher/LessonPreflightModal';
import { flattenV5Sections, rebuildV5SectionsFromQuestions } from './platform/contract/assignmentSchemaV5.js';
import {
  canonicalV5PersistencePatch,
  getStoredAssignmentQuestions,
  getStoredAssignmentTypeProjection,
  getStoredAssignmentVariantMode,
  getStoredSectionVariantModes,
  storedAssignmentToV5,
} from './platform/contract/storedAssignmentV5.js';
import { buildAssignmentV5PreflightModel } from './platform/preflight/assignmentV5PreflightModel.js';
import { normalizeLessonPublishingIntentV5 } from './platform/authoring/lessonPublishingIntent.js';
import { normalizeLabDefinition } from './platform/labs/labDefinitionSchema.js';
import { normalizeContextualQuestion } from './platform/context/wordProblemLayer';
import { buildAttemptEvidenceEvent } from './platform/history/evidenceEvent.js';
import { writeImmutableEvidenceEvent } from './platform/history/evidencePersistence.js';
import MyMathPathApp from './components/student/MyMathPathApp.jsx';
import StudentSecureExamDashboard from './components/assessment/StudentSecureExamDashboard.jsx';
import TeacherSecureExamDashboard from './components/assessment/TeacherSecureExamDashboard.jsx';
import TeacherAnalyticsDashboard from './components/analytics/TeacherAnalyticsDashboard.jsx';
import DemoExperience from './components/demo/DemoExperience.jsx';
import StudentsRoster from './components/teacher/StudentsRoster.jsx';
import ClassCourseSettings from './components/teacher/ClassCourseSettings.jsx';
import ClassScheduleSettings from './components/teacher/ClassScheduleSettings.jsx';
import PathSimulator from './components/teacher/PathSimulator.jsx';
import PacingControls from './components/teacher/PacingControls.jsx';
import RecommendedSkills from './components/student/RecommendedSkills.jsx';
import { teksCodeFromSkillId } from './platform/path/skillGraph.js';
import { buildStudentPathOptions } from './platform/path/studentPathOptions.js';
import { fetchStudentEvidenceEvents } from './platform/history/evidencePersistence.js';
import { COMPARABILITY, describeDeliveredRigor, explainGrade, rigorComparability, splitGrade } from './platform/teacher/gradeEvidence.js';
import { buildStudentDashboardModel, resolveNextAction } from './studentDashboardModel.js';
import {
  readStudentRouteState,
  studentRouteKey,
  writeStudentRouteState,
} from './platform/student/browserHistory.js';
import { questionAssessmentFramework } from './platform/student/questionAlignmentInfo.js';
import { FRAMEWORK_LABELS } from './platform/ccmr/assessmentCrosswalk.js';
import { compareStudentsByName, formatStudentName } from './platform/studentName';
import { evidenceRowsToEvents } from './platform/profile/legacyEvidenceAdapter.js';
import { buildStudentLearningProfile } from './platform/profile/studentLearningProfile.js';
import { resolveDeliveredQuestionMetadata } from './platform/assignments/assignmentAdaptation.js';
import { adaptLegacyMasteryToPhase5 } from './platform/profile/legacyMasteryAdapter.js';
import StudentDashboardView from './components/student/StudentDashboardView.jsx';
import {
  ROUTE_EVENTS, buildRouteEvent, fetchClassPacing, fetchSkillOverrides, fetchWeeklyGoalSettings, fetchTeacherWeeklyPathCompletions,
  interventionAsOverride, logRouteEvent, overridesForClassContext, saveClassPacing, saveSkillOverrides, saveWeeklyGoalSettings,
  setStudentPathIntervention, storedPacingForClassContext, storedWeeklyGoalForClassContext,
  subscribeStudentPathIntervention,
} from './platform/path/pathStore.js';
import WeeklyPathControls from './components/teacher/WeeklyPathControls.jsx';
import StudentPerformanceBadge from './components/common/StudentPerformanceBadge.jsx';
import { buildWeeklyPathPlan } from './platform/path/weeklyPathPlan.js';
import { buildTeacherWeeklyView, buildWeeklyGoal, dueAtFor, weekKeyFor } from './platform/path/weeklyPathGoal.js';
import SignInAccess from './SignInAccess.jsx';
import ClassesAdmin from './components/admin/ClassesAdmin.jsx';
import PreproductionReset from './components/admin/PreproductionReset.jsx';
import PathCoverageAudit from './components/teacher/PathCoverageAudit.jsx';
import {
  blobToBase64,
  generateLessonNotesPdfBlob,
} from './platform/resources/lessonNotesPdf.js';
import { buildAssignmentWorksheetModel, PRINT_OUTPUT_MODES } from './platform/resources/assignmentWorksheetPdfModel.js';
import { downloadAssignmentWorksheetPdf } from './platform/resources/assignmentWorksheetPdf.js';
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
import { resolveStudentCourseContext, studentsInClass, unplaceableStudents } from '../functions/shared/classModel.mjs';
import { buildNeedsAttentionQueue } from './platform/teacher/needsAttention.js';
import {
  SUPPORT_EVENT_KIND,
  SUPPORT_EVENT_STAGE,
  summarizeRapidCorrectness,
} from './platform/teacher/studentSupportSignals.js';
import {
  fetchStudentSupportHistory,
  recordStudentSupportEvent,
  subscribeStudentSessionSummaries,
  subscribeStudentSupportEvents,
} from './platform/teacher/studentSupportStore.js';
import {
  buildHonorsEnrichmentQuestion,
  defaultCourseProfiles,
  inspectHonorsRigor,
  normalizeCourseProfiles,
} from './platform/rigor/courseRigor.js';
import LoginScreen from './LoginScreen.jsx';
import { useAuth } from './auth/AuthProvider.jsx';
import { watchLiveChallengeInvite } from './platform/liveChallenge/liveChallengeService.js';
// The administrator identity comes from the same module the callables enforce,
// so the browser can never believe in a different administrator than the server.
import { isRootAdminEmail } from '../functions/shared/rolePolicy.mjs';

const LiveChallengeTeacher = lazy(() => import('./components/liveChallenge/LiveChallengeTeacher.jsx'));
const LiveChallengeStudent = lazy(() => import('./components/liveChallenge/LiveChallengeStudent.jsx'));



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

const calculateDOLSectionScore = (assignmentTracker = {}, questionIndices = []) => {
  const indices = Array.isArray(questionIndices) ? questionIndices : [];
  if (!indices.length) return 0;
  const earned = indices.reduce((total, index) => total + getQuestionCredit(assignmentTracker?.[index]), 0);
  return Math.round((earned / indices.length) * 100);
};

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

  // Google Classroom launch link: ?launch=<assignmentId> drops a student
  // straight into that assignment once they log in.
  const [launchAssignment, setLaunchAssignment] = useState(null);
  const [pendingLaunchAssignmentId, setPendingLaunchAssignmentId] = useState(null);

  useEffect(() => {
    const assignmentId = new URLSearchParams(window.location.search).get('launch');
    if (!assignmentId) return;
    setPendingLaunchAssignmentId(assignmentId);
    getAssignmentByLaunchId({ assignmentId })
      .then((assignment) => setLaunchAssignment(assignment))
      .catch((err) => console.error('Failed to resolve Classroom launch link:', err));
  }, []);

  const [activeView, setActiveView] = useState('dashboard');
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
  const [assignments, setAssignments] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  // Live presence for the teacher home grid, keyed by student id. Never stored
  // alongside grades and never read outside the live view.
  const [presenceById, setPresenceById] = useState({});
  // Persistent teacher-reviewed support history. Unlike presence, these are the
  // small set of concerns, dismissals and interventions worth keeping.
  const [studentSupportEvents, setStudentSupportEvents] = useState([]);
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
  // Set when the server could not read the whole week. The Weekly Path table
  // shows grades, so an incomplete read has to be visible rather than assumed.
  // The student whose profile drawer is open, from ANY teacher surface.
  // Held here so the drawer opens OVER the teacher's current work rather than
  // navigating them away from the class monitor or gradebook they were reading.
  const [profileDrawerStudentId, setProfileDrawerStudentId] = useState(null);
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
  const [practiceTracker, setPracticeTracker] = useState({});
  const [practiceScratchpads, setPracticeScratchpads] = useState({});
  const [previewTracker, setPreviewTracker] = useState({});
  const [previewScratchpads, setPreviewScratchpads] = useState({});
  const [teacherScratchpadDialog, setTeacherScratchpadDialog] = useState(null);
  const [teacherScratchpadLoading, setTeacherScratchpadLoading] = useState(false);
  const [teacherWorksheetDialog, setTeacherWorksheetDialog] = useState(null);
  const [teacherWorksheetBusy, setTeacherWorksheetBusy] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [assignmentOverviewExpanded, setAssignmentOverviewExpanded] = useState(false);
  const assignmentQuestionStageRef = useRef(null);
  const [resumeAction, setResumeAction] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [classSchedule, setClassSchedule] = useState(DEFAULT_CLASS_SCHEDULE);
  const [courseProfiles, setCourseProfiles] = useState(() => defaultCourseProfiles(CLASS_PERIODS));
  const [courseProfilesSaving, setCourseProfilesSaving] = useState(false);
  const [assignmentActivity, setAssignmentActivity] = useState({});
  const [dolGradesByAssignment, setDolGradesByAssignment] = useState({});
  const [classworkGradesByAssignment, setClassworkGradesByAssignment] = useState({});
  const [supportUsageByAssignment, setSupportUsageByAssignment] = useState({});
  const [editingAssignmentId, setEditingAssignmentId] = useState(null);
  const [editingAssignmentDates, setEditingAssignmentDates] = useState({ dueAt: '', lateDueAt: '', assignedClassPeriods: [], assignedClassIds: [] });
  const [questionEditorAssignment, setQuestionEditorAssignment] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [assignmentFolderPaths, setAssignmentFolderPaths] = useState([]);
  const [libraryNavigation, setLibraryNavigation] = useState(null);
  const [movingFolderAssignmentId, setMovingFolderAssignmentId] = useState(null);
  const [movingFolderValue, setMovingFolderValue] = useState('');
  const [feedbackReleaseBusyId, setFeedbackReleaseBusyId] = useState(null);
  const [dolUnlockBusyKey, setDolUnlockBusyKey] = useState(null);
  const [warmupControlBusyKey, setWarmupControlBusyKey] = useState(null);
  const [sectionAccessBusyKey, setSectionAccessBusyKey] = useState(null);
  const [studentDashboardMode, setStudentDashboardMode] = useState('assignments');
  const [liveChallengeInvite, setLiveChallengeInvite] = useState(null);

  // Browser Back/Forward should move through MathMaster's logical student
  // screens before it ever considers the website that launched MathMaster.
  //
  // The app is intentionally state-driven rather than react-router driven, so
  // without these same-document History API entries Safari/Chrome sees the
  // entire student experience as one page. A Back press from a question can
  // therefore leave MathMaster altogether.
  const studentBrowserHistoryReadyRef = useRef(false);
  const studentBrowserRoute = useMemo(() => {
    if (user?.role !== 'student') return null;
    if (activeView === 'assignment') {
      return {
        surface: 'assignment',
        assignmentId: activeAssignmentId || '',
        questionIndex: currentQuestionIndex,
      };
    }
    return {
      surface: 'dashboard',
      dashboardMode: studentDashboardMode || 'assignments',
    };
  }, [user?.role, activeView, activeAssignmentId, currentQuestionIndex, studentDashboardMode]);

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

  useEffect(() => {
    if (user?.role !== 'student') return undefined;

    const restoreFromBrowserHistory = (event) => {
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

      setActiveView('dashboard');
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
    if (!allStudents.length) return {};
    return Object.fromEntries(allStudents.map((student) => {
      const profile = buildStudentMasteryProfile({ student, assignments });
      return [student.id, profile];
    }));
  }, [allStudents, assignments]);

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
  }, [allStudents, assignments, courseProfiles, classesById, teacherMasteryProfilesByStudentId]);

  // The students in the class the Weekly Path screen is looking at.
  const teacherWeeklyRoster = useMemo(() => {
    const activeId = activeClass.classId || classes[0]?.classId || null;
    if (!activeId) return [];
    return studentsInClass({ students: allStudents, classes, classId: activeId })
      .map((student) => ({ ...student, name: formatStudentName(student) }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [allStudents, classes, activeClass.classId]);

  const teacherWeeklyGoalsByStudent = useMemo(() => {
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
  }, [activeClass.classId, classes, courseProfiles, weeklyGoalsByClass, pacingByClass, skillOverrides, teacherWeeklyRoster, assignments, teacherLearningProfiles, weeklyPathGoalSnapshotsByStudent, now]);

  useEffect(() => {
    // Home needs this as much as the Weekly Path tab does: the needs-attention
    // queue reports who is behind, and reporting that from data that has not
    // loaded yet would tell a teacher the whole class is behind every time they
    // open the page.
    if (user?.role !== 'teacher' || !['weeklyPath', 'home', 'grades'].includes(teacherTab)) return undefined;
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
  }, [user?.role, teacherTab, activeClass.classId, classes, weeklyGoalsByClass]);

  useEffect(() => {
    if (!pendingLaunchAssignmentId) return;
    if (user?.role !== 'student') return;
    const targetAssignment = assignments.find(
      (assignment) => assignment.id === pendingLaunchAssignmentId
    );
    if (!targetAssignment) return;

    // A Google Classroom launch link is a doorway, not authorization. The
    // signed-in MathMaster student must still belong to an assigned class.
    if (!assignmentIsForStudent(targetAssignment, { classId: user.classId || null, classPeriod: user.classPeriod })) {
      toastWarning(
        'Assignment not available',
        'This Google Classroom assignment is not assigned to your MathMaster class.',
      );
      setPendingLaunchAssignmentId(null);
      return;
    }

    startAssignment(pendingLaunchAssignmentId);
    setPendingLaunchAssignmentId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLaunchAssignmentId, user, assignments]);

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

  const [exportJsonAssignment, setExportJsonAssignment] = useState(null);
  const [exportJsonCopied, setExportJsonCopied] = useState(false);

  const [deleteDialog, setDeleteDialog] = useState(null);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deleteTitleConfirmation, setDeleteTitleConfirmation] = useState('');
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [isIdle, setIsIdle] = useState(false);
  const lastActivityRef = useRef(Date.now());
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

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(clock);
  }, []);

  // The general dashboard clock can stay inexpensive at 30 seconds, while DOL
  // and pack-up transitions need to happen at the actual bell-derived second.
  // Schedule one precise wake-up for the next class start, DOL transition, or
  // five-minute technology-return window.
  useEffect(() => {
    if (user?.role !== 'student' || !user.classPeriod) return undefined;
    const realNow = Date.now();
    const targets = assignments
      .filter((assignment) => assignmentIsForStudent(assignment, { classId: user.classId || null, classPeriod: user.classPeriod }))
      .map((assignment) => getDOLState({ assignment, schedule: classSchedule, classId: user.classId || null, classPeriod: user.classPeriod, nowValue: realNow }))
      .map((state) => state.status === 'beforeClass' ? state.window?.start?.getTime()
        : state.status === 'waiting' ? state.opensAt?.getTime()
          : state.status === 'active' ? state.endsAt?.getTime() + 100
            : null)
      .filter((target) => Number.isFinite(target) && target > realNow);

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

  useEffect(() => {
    if (!user) return undefined;

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
        setAssignments(liveAssignments);
        // A teacher DOL unlock is an assignment update. Refresh the logical
        // clock with the snapshot so students do not wait for the next 30s
        // lifecycle tick before seeing an early release.
        setNow(Date.now());
      },
      (error) => console.error('Assignment live update failed:', error),
    );

    return unsubscribe;
  }, [user]);

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
          `${studentName || id} is back to the normal adaptive Path priorities.`,
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
            studentName: studentName || id,
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
        `${teksCode} is now a personal priority for ${studentName || id} for 48 hours. Normal prerequisite and content safeguards still apply.`,
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

  const fetchAssignments = async () => {
    const querySnapshot = await getDocs(collection(db, 'assignments'));
    const fetchedAssignments = [];
    querySnapshot.forEach((assignmentDoc) => {
      fetchedAssignments.push({ id: assignmentDoc.id, ...assignmentDoc.data() });
    });
    fetchedAssignments.sort((a, b) => String(a.dueAt || a.dueDate || '').localeCompare(String(b.dueAt || b.dueDate || '')));
    setAssignments(fetchedAssignments);
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
  const fetchStudents = async () => {
    const viewer = viewerRef.current;
    const readAll = viewer.isRootAdmin || !viewer.email;

    const collect = (querySnapshot) => querySnapshot.docs
      .filter((studentDoc) => studentDoc.id !== 'test_connection')
      .map((studentDoc) => ({ id: studentDoc.id, ...studentDoc.data(), profile: normalizeStudentProfile(studentDoc.data()?.profile || studentDoc.data()) }))
      .sort(compareStudentsByName);

    // The query is constrained to this teacher, deliberately matching the
    // security rule exactly. Filtering after an unconstrained read would look
    // identical on screen while leaving the whole school readable to anyone
    // with a console open.
    const studentData = collect(await getDocs(readAll
      ? collection(db, 'grades')
      : query(collection(db, 'grades'), where('assignedTeacherEmail', '==', viewer.email))));
    setAllStudents(studentData);
    return studentData;
  };

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
    const assignmentSnapshot = await getDoc(doc(db, 'assignments', assignmentId));
    if (!assignmentSnapshot.exists()) return null;
    return { id: assignmentSnapshot.id, ...assignmentSnapshot.data() };
  };

  const leaveUnavailableAssignment = () => {
    setActiveAssignmentId(null);
    setActiveView('dashboard');
    setPracticeTracker({});
    setPracticeScratchpads({});
    setPreviewTracker({});
  };

  useEffect(() => {
    let cancelled = false;
    const session = auth.session;
    if (auth.status !== 'ready' || !session) {
      setUser(null);
      setSessionHydrationError(null);
      setSessionHydrating(auth.status === 'loading');
      return () => { cancelled = true; };
    }

    const hydrateSession = async () => {
      setSessionHydrating(true);
      setSessionHydrationError(null);
      try {
        const fetchedAssignments = await fetchAssignments();
        if (cancelled) return;
        if (session.role === 'teacher') {
          // Identity and classes first: the roster fetch is scoped by them, so
          // asking for students before they are known would read the school.
          viewerRef.current = { email: session.email || null, isRootAdmin: session.isRootAdmin === true };
          classesRef.current = await fetchClasses();
          if (cancelled) return;
          await Promise.all([fetchStudents(), fetchClassSchedule(), fetchCourseProfiles(), fetchAssignmentFolders(), fetchPathSettings()]);
          if (cancelled) return;
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
        const studentProfile = normalizeStudentProfile(studentData.profile || studentData);
        const loadedCourseProfiles = await fetchCourseProfiles();
        await fetchClassSchedule();
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
        const rosterDisplayName = formatStudentName(
          { ...studentData, id: studentId },
          { lastFirst: false, fallbackToId: false },
        );
        setUser({
          id: studentId,
          uid: session.uid,
          role: 'student',
          email: session.email,
          // Student-facing screens should greet the person, not the SIS ID.
          // The roster is authoritative because student passcode sessions do
          // not necessarily carry a useful Firebase Auth displayName.
          displayName: rosterDisplayName || session.displayName || studentId,
          classId: studentData.classId || null,
          className: courseContext.className,
          classPeriod: courseContext.classPeriod,
          teacherOfRecord: courseContext.teacherOfRecord,
          profile: {
            ...studentProfile,
            course: courseContext.courseId,
            courseLevel: courseContext.courseLevel,
          },
        });
        setTracker(studentData.gradesByAssignment || {});
        setAssignmentActivity(studentData.assignmentActivity || {});
        setDolGradesByAssignment(studentData.dolGradesByAssignment || {});
        setClassworkGradesByAssignment(studentData.classworkGradesByAssignment || {});
        setSupportUsageByAssignment(studentData.supportUsageByAssignment || {});
        const savedResume = readResumeAction(studentId);
        setResumeAction(savedResume && fetchedAssignments.some((assignment) => assignment.id === savedResume.assignmentId) ? savedResume : null);
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
    setUser(null);
    setActiveView('dashboard');
    setTeacherTab('home');
    setTeacherWorkspaceMode('teacher');
    setActiveAssignmentId(null);
    setPracticeTracker({});
    setPracticeScratchpads({});
    setPreviewTracker({});
    setPreviewScratchpads({});
    setTeacherScratchpadDialog(null);
    setResumeAction(null);
    setAssignmentActivity({});
    setDolGradesByAssignment({});
    setClassworkGradesByAssignment({});
    setSupportUsageByAssignment({});
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

  const calculateGrade = (assignmentTracker, assignmentData) => {
    if (!assignmentTracker || !getStoredAssignmentQuestions(assignmentData).length) return 0;
    const included = getIncludedQuestionIndices(assignmentData);
    if (!included.length) return 0;
    const earnedCredit = included.reduce(
      (total, index) => total + getQuestionCredit(assignmentTracker?.[index]),
      0,
    );
    return Math.round((earnedCredit / included.length) * 100);
  };

  const calculatePracticeProgress = (assignmentTracker, assignmentData) => {
    if (!assignmentTracker || !getStoredAssignmentQuestions(assignmentData).length) {
      return { attempted: 0, correct: 0, total: 0 };
    }

    const included = getIncludedQuestionIndices(assignmentData);
    let attempted = 0;
    let correct = 0;
    included.forEach((index) => {
      const status = getModuleStatus(assignmentTracker, index);
      if (status !== 'unattempted') attempted += 1;
      if (status === 'correct') correct += 1;
    });

    return { attempted, correct, total: included.length };
  };

  const flushAssignmentActivity = async (assignmentId = activeAssignmentId) => {
    if (user?.role !== 'student' || !assignmentId) return null;
    const assignment = assignments.find((item) => item.id === assignmentId);
    if (!assignment) return null;
    if (getAssignmentLifecycle(assignment, Date.now()).isPracticeOnly) {
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
    });
    const updatedActivity = { ...assignmentActivity, [assignmentId]: nextRecord };
    setAssignmentActivity(updatedActivity);

    const completion = evaluateClassworkCompletion({
      assignment,
      assignmentTracker: tracker[assignmentId] || {},
      activity: nextRecord,
    });
    let updatedClassworkGrades = classworkGradesByAssignment;
    if (completion.met && Number(classworkGradesByAssignment?.[assignmentId]?.score) !== 100) {
      updatedClassworkGrades = {
        ...classworkGradesByAssignment,
        [assignmentId]: {
          score: 100,
          metAt: new Date().toISOString(),
          engagedSeconds: completion.engagedSeconds,
          completionPercent: completion.completionPercent,
        },
      };
      setClassworkGradesByAssignment(updatedClassworkGrades);
    }

    try {
      await updateDoc(doc(db, 'grades', user.id), {
        assignmentActivity: updatedActivity,
        classworkGradesByAssignment: updatedClassworkGrades,
      });
    } catch (error) {
      pendingAssignmentSecondsRef.current += pendingSeconds;
      console.error('Could not save assignment activity:', error);
    }
    return nextRecord;
  };

  const activeAssignmentData = assignments.find(
    (assignment) => assignment.id === activeAssignmentId,
  );
  const activeQuestions = getStoredAssignmentQuestions(activeAssignmentData);
  const activeLifecycle = getAssignmentLifecycle(activeAssignmentData, now);
  const isTeacherPreview = user?.role === 'teacher' && activeView === 'teacherPreview';
  const isStudentAssignment = user?.role === 'student' && activeView === 'assignment';
  const isPracticeMode = isStudentAssignment && activeLifecycle.isPracticeOnly;
  const activeSupportPresentation = getStudentSupportPresentation(user?.profile);
  const activeDOLState = getDOLState({ assignment: activeAssignmentData, schedule: classSchedule, classId: user?.classId || null, classPeriod: user?.classPeriod, nowValue: now });
  const activeQuestionRole = resolveQuestionActivityRole({
    question: activeQuestions[currentQuestionIndex],
    assignment: activeAssignmentData,
    isDOL: activeDOLState.enabled && currentQuestionIndex === activeDOLState.questionIndex,
  });
  const activeActivityPolicy = getEffectiveActivityPolicy(isPracticeMode ? 'practice' : activeQuestionRole);

  const activeWorkingTracker = isTeacherPreview
    ? previewTracker
    : isPracticeMode
      ? practiceTracker[activeAssignmentId] || {}
      : tracker[activeAssignmentId] || {};

  useEffect(() => {
    if (!activeQuestions.length) return;
    const included = getIncludedQuestionIndices(activeAssignmentData);
    if (!included.length) return;
    if (!included.includes(currentQuestionIndex)) setCurrentQuestionIndex(included[0]);
  }, [activeAssignmentData, currentQuestionIndex]);

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

    const included = getIncludedQuestionIndices(activeAssignmentData);
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
      name: user.name || user.id,
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
        questionStates: encodeQuestionStates(activeWorkingTracker, included),
        currentAttempts: record.attemptCount,
        focusLossCount,
        answeredCount: rapid.answered,
        correctCount: rapid.correct,
        accuracy: rapid.accuracy,
        rapidCorrectCount: rapid.rapidCorrect,
        rapidDeepCorrectCount: rapid.rapidDeepCorrect,
        timedIndependentCorrectCount: rapid.timedIndependentCorrect,
        sessionActiveSeconds: Math.max(0, Number(liveSessionActiveSecondsRef.current.seconds) || 0),
        lastInteractionAt: lastActivityRef.current,
        startedAt: liveStartedAtRef.current.at,
      }),
    };

    // The heartbeat lifecycle below owns Firestore writes. Keeping question
    // changes in this ref avoids deleting/recreating presence while still
    // letting the next heartbeat publish the newest compact state.
    livePresencePayloadRef.current = payload;
  }, [
    user, isStudentAssignment, activeAssignmentId, activeAssignmentData,
    currentQuestionIndex, activeWorkingTracker, activeQuestionRole,
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
      setDoc(presenceRef, payload).catch(() => {
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

  // Persistent support/intervention history is teacher-authorized and
  // append-only. It is loaded independently of the live presence stream.
  useEffect(() => {
    if (user?.role !== 'teacher' || !user.email) {
      setStudentSupportEvents([]);
      return undefined;
    }
    return subscribeStudentSupportEvents({
      db,
      teacherEmail: user.email,
      onChange: setStudentSupportEvents,
      onError: (error) => console.error('Student support history failed:', error),
    });
  }, [user?.role, user?.email]);

  useEffect(() => {
    if (user?.role !== 'teacher' || !user.email) {
      setStudentSessionSummaries([]);
      return undefined;
    }
    return subscribeStudentSessionSummaries({
      db,
      teacherEmail: user.email,
      classIds: classes
        .filter((entry) => entry?.status !== 'archived' && entry?.classId)
        .map((entry) => entry.classId),
      onChange: setStudentSessionSummaries,
      onError: (error) => console.error('Student session summaries failed:', error),
    });
  }, [user?.role, user?.email, classes]);

  const handleRecordStudentSupportEvent = async (event) => {
    if (user?.role !== 'teacher' || !user.email) return null;
    try {
      const record = await recordStudentSupportEvent({
        db,
        teacherEmail: user.email,
        event,
      });
      const label = event?.kind === SUPPORT_EVENT_KIND.PARENT_FOLLOW_UP
        ? 'Parent follow-up recorded'
        : event?.stage === SUPPORT_EVENT_STAGE.DISMISSED
          ? 'Signal dismissal recorded'
          : 'Student support note recorded';
      toastSuccess(label, 'The event was added to the append-only student support history.');
      return record;
    } catch (error) {
      console.error(error);
      toastError('Could not save support note', error.message);
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

    const rosterIds = [...new Set(
      (Array.isArray(allStudents) ? allStudents : [])
        .map((student) => String(student?.id || '').trim())
        .filter(Boolean),
    )];

    if (!rosterIds.length) {
      setPresenceById({});
      return undefined;
    }

    const unsubs = rosterIds.map((studentId) => onSnapshot(
      doc(db, 'presence', studentId),
      (snapshot) => {
        setPresenceById((current) => {
          if (!snapshot.exists()) {
            if (!Object.prototype.hasOwnProperty.call(current, studentId)) return current;
            const next = { ...current };
            delete next[studentId];
            return next;
          }
          return { ...current, [studentId]: snapshot.data() };
        });
      },
      (error) => {
        // One stale/reassigned roster row should not take the rest of the live
        // room down. The scoped roster refresh will remove it on the next load.
        console.error(`Live class update failed for ${studentId}:`, error);
      },
    ));

    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe());
      setPresenceById({});
    };
  }, [user?.role, teacherTab, allStudents]);

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

  useEffect(() => {
    if (user?.role !== 'student' || !user.classPeriod) return;
    const date = new Date(now);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const updates = {};
    assignments.forEach((assignment) => {
      if (!assignmentIsForStudent(assignment, { classId: user.classId || null, classPeriod: user.classPeriod })) return;
      const dolState = getDOLState({ assignment, schedule: classSchedule, classId: user.classId || null, classPeriod: user.classPeriod, nowValue: now });
      const previousStatus = lastDOLStatusRef.current[assignment.id];
      lastDOLStatusRef.current[assignment.id] = dolState.status;
      if (dolState.status !== 'ended') return;
      if (dolGradesByAssignment?.[assignment.id]?.[dateKey]?.finalized) return;
      if (previousStatus && !['active', 'waiting', 'beforeClass'].includes(previousStatus)) return;
      const questionIndices = dolState.questionIndices || [dolState.questionIndex];
      updates[assignment.id] = {
        ...(dolGradesByAssignment?.[assignment.id] || {}),
        [dateKey]: {
          finalized: true,
          score: calculateDOLSectionScore(tracker?.[assignment.id] || {}, questionIndices),
          questionIndex: questionIndices[0] ?? dolState.questionIndex,
          questionIndices,
          recordedAt: new Date().toISOString(),
          status: 'section-finalized',
        },
      };
    });
    if (!Object.keys(updates).length) return;
    const next = { ...dolGradesByAssignment, ...updates };
    setDolGradesByAssignment(next);
    updateDoc(doc(db, 'grades', user.id), { dolGradesByAssignment: next }).catch((error) => console.error('Could not finalize DOL grades:', error));
  }, [now, user, assignments, classSchedule, tracker, dolGradesByAssignment]);

  useEffect(() => {
    if (user?.role !== 'student' || activeView !== 'assignment' || !activeAssignmentId) return;
    const assignment = assignments.find((item) => item.id === activeAssignmentId);
    if (!assignment) return;
    if (getAssignmentLifecycle(assignment, Date.now()).isPracticeOnly) {
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
      lifecycleStatus: getAssignmentLifecycle(assignment, Date.now()).status,
    };
    saveResumeAction(user.id, action);
    setResumeAction(action);
  }, [user, activeView, activeAssignmentId, currentQuestionIndex, assignments]);

  useEffect(() => {
    activeTimeRef.current = getModuleTime(activeWorkingTracker, currentQuestionIndex);
  }, [activeAssignmentId, currentQuestionIndex, activeWorkingTracker]);

  useEffect(() => {
    if (user?.role !== 'student' || activeView !== 'assignment' || activeSupportPresentation.disableIdleTimer) {
      setIsIdle(false);
      return undefined;
    }

    const resetActivity = () => {
      lastActivityRef.current = Date.now();
      if (isIdle) setIsIdle(false);
    };

    window.addEventListener('mousemove', resetActivity);
    window.addEventListener('keydown', resetActivity);
    window.addEventListener('click', resetActivity);

    const interval = window.setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - lastActivityRef.current > 120000) {
        setIsIdle(true);
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
      window.removeEventListener('mousemove', resetActivity);
      window.removeEventListener('keydown', resetActivity);
      window.removeEventListener('click', resetActivity);
      window.clearInterval(interval);
    };
  }, [user, activeView, activeAssignmentId, isIdle, activeSupportPresentation.disableIdleTimer]);

  useEffect(() => {
    if (typeof window === 'undefined' || activeView !== 'assignment' || !activeAssignmentId) return undefined;
    let secondFrame = null;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        assignmentQuestionStageRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame != null) window.cancelAnimationFrame(secondFrame);
    };
  }, [activeView, activeAssignmentId, currentQuestionIndex]);

  const changeQuestion = async (newIndex) => {
    if (!activeAssignmentId || newIndex === currentQuestionIndex) return;
    setAssignmentOverviewExpanded(false);
    const localAssignment = assignments.find((item) => item.id === activeAssignmentId);
    const localQuestions = getStoredAssignmentQuestions(localAssignment);
    if (localQuestions.length && !questionIsIncluded(localQuestions[newIndex])) return;

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
    if (!getAssignmentLifecycle(assignment, Date.now()).isClosed && (dolState.questionIndices || [dolState.questionIndex]).includes(newIndex) && dolState.enabled && !['active', 'ended'].includes(dolState.status)) {
      toastInfo('DOL not open yet', 'The DOL section opens during the final minutes of this class period. Keep working until the DOL banner appears.');
      return;
    }

    if (getAssignmentLifecycle(assignment, Date.now()).isPracticeOnly) {
      setCurrentQuestionIndex(newIndex);
      return;
    }

    try {
      assignment = await getLiveAssignment(activeAssignmentId);
    } catch (error) {
      console.error('Could not verify assignment before saving progress:', error);
      return;
    }
    if (!assignment) {
      leaveUnavailableAssignment();
      return;
    }

    const flushedActivity = await flushAssignmentActivity(activeAssignmentId);
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

    setTracker(updatedTracker);
    setCurrentQuestionIndex(newIndex);

    try {
      await updateDoc(doc(db, 'grades', user.id), {
        gradesByAssignment: updatedTracker,
        assignmentActivity: flushedActivity ? { ...assignmentActivity, [activeAssignmentId]: flushedActivity } : assignmentActivity,
      });
    } catch (error) {
      console.error(error);
    }
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
    const lifecycle = getAssignmentLifecycle(assignmentData, now);
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

    for (const index of getIncludedQuestionIndices(assignmentData)) {
      const question = assignmentQuestions[index];
      if (!question || !questionIsIncluded(question)) continue;
      const sectionRole = resolveQuestionActivityRole({ question, assignment: assignmentData });
      const timedDol = sectionRole === 'dol'
        && dolState.enabled
        && (dolState.questionIndices || [dolState.questionIndex]).includes(index);
      let available = true;
      if (!lifecycle.isPracticeOnly) {
        if (sectionRole === 'warmup' && warmupState.enabled && !warmupCanBeViewed) available = false;
        if (timedDol && !lifecycle.isClosed && !['active', 'ended'].includes(dolState.status)) available = false;
        const manualState = getSectionAccessState({ assignment: assignmentData, activityRole: sectionRole, classId, classPeriod, nowValue: now });
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
      student: { displayName: user.displayName || user.id, classPeriod: user.classPeriod },
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
      const selectedStudent = student
        ? { ...student, displayName: formatStudentName(student) }
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
          ? `${formatStudentName(selectedStudent)} · ${result.pageCount} page${result.pageCount === 1 ? '' : 's'} exported.`
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

  const startAssignment = (assignmentId, requestedQuestionIndex = 0) => {
    const assignmentData = assignments.find(
      (assignment) => assignment.id === assignmentId,
    );
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
    const lifecycle = getAssignmentLifecycle(assignmentData, Date.now());
    if (lifecycle.isScheduled && access.reason !== 'prerequisiteMet') {
      toastInfo('Not open yet', `This assignment opens ${formatDateTime(assignmentData.releaseAt)}.`);
      return;
    }

    const includedQuestionIndices = getIncludedQuestionIndices(assignmentData);
    if (!includedQuestionIndices.length) {
      toastWarning('Nothing to show yet', 'This assignment does not currently contain any included questions.');
      return;
    }
    const requested = Number(requestedQuestionIndex) || 0;
    const safeQuestionIndex = includedQuestionIndices.includes(requested)
      ? requested
      : includedQuestionIndices[0];
    setActiveAssignmentId(assignmentId);
    setCurrentQuestionIndex(safeQuestionIndex);
    setAssignmentOverviewExpanded(false);
    lastActivityRef.current = Date.now();
    pendingAssignmentSecondsRef.current = 0;
    liveSessionActiveSecondsRef.current = { assignmentId, seconds: 0 };
    liveSessionAttemptBaselineRef.current = {
      assignmentId,
      totalAttemptsByIndex: Object.fromEntries(
        getIncludedQuestionIndices(assignmentData).map((index) => [
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

  const startTeacherPreview = (assignmentId) => {
    const assignmentData = assignments.find(
      (assignment) => assignment.id === assignmentId,
    );
    const assignmentQuestions = getStoredAssignmentQuestions(assignmentData);
    if (!assignmentQuestions.length) return;

    setActiveAssignmentId(assignmentId);
    setCurrentQuestionIndex(getIncludedQuestionIndices(assignmentData)[0] ?? 0);
    setAssignmentOverviewExpanded(false);
    setPreviewTracker(createEmptyAssignmentTracker(assignmentQuestions));
    setPreviewScratchpads({});
    setActiveView('teacherPreview');
  };

  const getScratchpadDocumentId = (assignmentId, questionIndex) =>
    `${assignmentId}__question_${questionIndex}`;

  const handleLoadScratchpad = async () => {
    if (!activeAssignmentId) return null;
    const scratchpadId = getScratchpadDocumentId(
      activeAssignmentId,
      currentQuestionIndex,
    );
    const scratchpadAssignment = assignments.find(
      (assignment) => assignment.id === activeAssignmentId,
    );

    if (isTeacherPreview) {
      return previewScratchpads[scratchpadId] || null;
    }

    if (getAssignmentLifecycle(scratchpadAssignment, Date.now()).isPracticeOnly) {
      return practiceScratchpads[scratchpadId] || null;
    }

    if (user?.role !== 'student') return null;
    try {
      const snapshot = await getDoc(
        doc(db, 'grades', user.id, 'scratchpads', scratchpadId),
      );
      return snapshot.exists() ? snapshot.data() : null;
    } catch (error) {
      console.error('Could not load the student scratchpad:', error);
      return null;
    }
  };

  const handleSaveScratchpad = async (dataUrl, metadata = {}) => {
    if (!activeAssignmentId || !dataUrl) return;
    const scratchpadId = getScratchpadDocumentId(
      activeAssignmentId,
      currentQuestionIndex,
    );
    const scratchpadAssignment = assignments.find(
      (assignment) => assignment.id === activeAssignmentId,
    );
    const practiceOnly = getAssignmentLifecycle(scratchpadAssignment, Date.now()).isPracticeOnly;
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

    if (isTeacherPreview) {
      setPreviewScratchpads((current) => ({
        ...current,
        [scratchpadId]: compactRecord,
      }));
      return;
    }

    if (practiceOnly) {
      setPracticeScratchpads((current) => ({ ...current, [scratchpadId]: compactRecord }));
      return;
    }

    if (user?.role !== 'student') return;
    try {
      await setDoc(
        doc(db, 'grades', user.id, 'scratchpads', scratchpadId),
        compactRecord,
      );
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
      const snapshot = await getDoc(
        doc(db, 'grades', studentId, 'scratchpads', scratchpadId),
      );
      setTeacherScratchpadDialog({
        studentId,
        assignmentId,
        questionIndex,
        dataUrl: snapshot.exists() ? snapshot.data()?.dataUrl || '' : '',
        missing: !snapshot.exists() || !snapshot.data()?.dataUrl,
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

  const handleGradeSubmit = async (isCorrect, specificQuestionData, parts = [], supportUsage = null, responseKey = '', attemptMetadata = {}) => {
    if (!activeAssignmentId) return null;

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

    const localAssignment = assignments.find((item) => item.id === activeAssignmentId);
    if (getAssignmentLifecycle(localAssignment, Date.now()).isPracticeOnly) {
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

    let assignment;
    try {
      assignment = await getLiveAssignment(activeAssignmentId);
    } catch (error) {
      console.error('Could not verify assignment before saving an answer:', error);
      return null;
    }

    if (!assignment) {
      leaveUnavailableAssignment();
      return null;
    }

    const activityRecord = await flushAssignmentActivity(activeAssignmentId);
    const currentAssignmentGrades = tracker[activeAssignmentId] || {};
    const outcome = applyAttempt(currentAssignmentGrades[currentQuestionIndex]);
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

    const completion = evaluateClassworkCompletion({
      assignment,
      assignmentTracker: updatedTracker[activeAssignmentId],
      activity: activityRecord || assignmentActivity[activeAssignmentId],
    });
    const updatedClassworkGrades = completion.met
      ? {
          ...classworkGradesByAssignment,
          [activeAssignmentId]: {
            score: 100,
            metAt: classworkGradesByAssignment?.[activeAssignmentId]?.metAt || new Date().toISOString(),
            engagedSeconds: completion.engagedSeconds,
            completionPercent: completion.completionPercent,
          },
        }
      : classworkGradesByAssignment;

    let updatedDOLGrades = dolGradesByAssignment;
    const dolState = getDOLState({ assignment, schedule: classSchedule, classId: user.classId || null, classPeriod: user.classPeriod, nowValue: Date.now() });
    if (activeQuestionRole === 'dol' && dolState.status === 'active' && (dolState.questionIndices || [dolState.questionIndex]).includes(currentQuestionIndex)) {
      const date = new Date();
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      updatedDOLGrades = {
        ...dolGradesByAssignment,
        [activeAssignmentId]: {
          ...(dolGradesByAssignment?.[activeAssignmentId] || {}),
          [dateKey]: {
            finalized: false,
            score: calculateDOLSectionScore(updatedTracker[activeAssignmentId] || {}, dolState.questionIndices || [dolState.questionIndex]),
            questionIndex: (dolState.questionIndices || [dolState.questionIndex])[0] ?? currentQuestionIndex,
            questionIndices: dolState.questionIndices || [dolState.questionIndex],
            recordedAt: new Date().toISOString(),
            status: 'section-in-progress',
          },
        },
      };
    }

    setTracker(updatedTracker);
    setSupportUsageByAssignment(updatedSupportUsage);
    setClassworkGradesByAssignment(updatedClassworkGrades);
    setDolGradesByAssignment(updatedDOLGrades);

    try {
      await updateDoc(doc(db, 'grades', user.id), {
        gradesByAssignment: updatedTracker,
        supportUsageByAssignment: updatedSupportUsage,
        classworkGradesByAssignment: updatedClassworkGrades,
        dolGradesByAssignment: updatedDOLGrades,
        assignmentActivity: activityRecord ? { ...assignmentActivity, [activeAssignmentId]: activityRecord } : assignmentActivity,
      });

      // Phase 5C is a non-blocking dual write. Assignment grading remains
      // authoritative for this UI even when the audit timeline is unavailable.
      const assignmentQuestions = getStoredAssignmentQuestions(assignment);
      if (assignmentQuestions[currentQuestionIndex]?.type !== 'modelingLab') {
        const evidenceEvent = buildAttemptEvidenceEvent({
          studentId: user.id,
          assignment,
          question: assignmentQuestions[currentQuestionIndex],
          questionIndex: currentQuestionIndex,
          activityRole: activeQuestionRole,
          attemptRecord: outcome.record,
          attemptResult: outcome.result,
          supportUsage: outcome.record.supportUsage || supportUsage || {},
          // What was actually delivered, recomputed from the same deterministic
          // inputs the generator used. Recording the template's DOK and
          // difficulty here meant every mastery conclusion downstream was drawn
          // from what the question claimed rather than what the student answered.
          delivered: resolveDeliveredQuestionMetadata({
            question: assignmentQuestions[currentQuestionIndex],
            learningProfile: studentLearningProfile,
            activityRole: activeQuestionRole,
            variationMode: getSectionVariantMode(assignment, activeQuestionRole),
            honors: String(user?.profile?.courseLevel || '').toLowerCase() === 'honors',
          }),
        });
        writeImmutableEvidenceEvent(user.id, evidenceEvent)
          .catch((evidenceError) => console.error('Could not append Phase 5C evidence history:', evidenceError));
      }
    } catch (error) {
      console.error(error);
    }

    return outcome.result;
  };

  const handleStepGrade = async ({ stepGrade, countsAttempt, statePatch, supportUsage: providedSupportUsage = null }) => {
    if (!activeAssignmentId) return null;
    const supportUsage = providedSupportUsage || buildSupportUsage(user?.profile, activeQuestions[currentQuestionIndex]);
    const applyStep = (record) =>
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
        }),
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
    const localAssignment = assignments.find((item) => item.id === activeAssignmentId);
    if (getAssignmentLifecycle(localAssignment, Date.now()).isPracticeOnly) {
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
    let assignment;
    try {
      assignment = await getLiveAssignment(activeAssignmentId);
    } catch (error) {
      console.error('Could not verify assignment before saving an algebra step:', error);
      return null;
    }
    if (!assignment) {
      leaveUnavailableAssignment();
      return null;
    }
    const activityRecord = await flushAssignmentActivity(activeAssignmentId);
    const currentAssignmentGrades = tracker[activeAssignmentId] || {};
    const outcome = applyStep(currentAssignmentGrades[currentQuestionIndex]);
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
        modified: Boolean(previousSupport.modified || supportUsage.modified),
        accommodations: [...new Set([...(previousSupport.accommodations || []), ...(supportUsage.accommodations || [])])],
        modifications: [...new Set([...(previousSupport.modifications || []), ...(supportUsage.modifications || [])])],
      },
    };
    const completion = evaluateClassworkCompletion({ assignment, assignmentTracker: updatedTracker[activeAssignmentId], activity: activityRecord || assignmentActivity[activeAssignmentId] });
    const updatedClassworkGrades = completion.met ? {
      ...classworkGradesByAssignment,
      [activeAssignmentId]: {
        score: 100,
        metAt: classworkGradesByAssignment?.[activeAssignmentId]?.metAt || new Date().toISOString(),
        engagedSeconds: completion.engagedSeconds,
        completionPercent: completion.completionPercent,
      },
    } : classworkGradesByAssignment;

    setTracker(updatedTracker);
    setSupportUsageByAssignment(updatedSupportUsage);
    setClassworkGradesByAssignment(updatedClassworkGrades);
    try {
      await updateDoc(doc(db, 'grades', user.id), {
        gradesByAssignment: updatedTracker,
        supportUsageByAssignment: updatedSupportUsage,
        classworkGradesByAssignment: updatedClassworkGrades,
        assignmentActivity: activityRecord ? { ...assignmentActivity, [activeAssignmentId]: activityRecord } : assignmentActivity,
      });
    } catch (error) {
      console.error(error);
    }
    return outcome.result;
  };

  const handleRequestNewQuestion = async (options = {}) => {
    if (!activeAssignmentId) return;

    const replacementBlueprint = activeQuestions[currentQuestionIndex];
    if (isChoiceOnlyQuestion(replacementBlueprint) && !isPersonalizedBlueprint(replacementBlueprint)) {
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
    if (getAssignmentLifecycle(localAssignment, Date.now()).isPracticeOnly) {
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
    let assignment;
    try {
      assignment = await getLiveAssignment(activeAssignmentId);
    } catch (error) {
      console.error('Could not verify assignment before replacing a question:', error);
      return;
    }
    if (!assignment) {
      leaveUnavailableAssignment();
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
      setDolGradesByAssignment(updatedDOLGrades);
    }

    setTracker(updatedTracker);
    try {
      await updateDoc(doc(db, 'grades', user.id), {
        gradesByAssignment: updatedTracker,
        dolGradesByAssignment: updatedDOLGrades,
      });
    } catch (error) {
      console.error(error);
    }
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
      return { ok: false, errors: [error.message], warnings, sourceSchemaVersion: null, compilerDefect: false };
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
      });
      return true;
    } catch (error) {
      return { error: error.message };
    }
  };

  // Single entry point for pasted, uploaded and dropped JSON.
  const handleAssignmentJsonReady = async ({ text, sourceName }) => {
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
    if (!result.ok) return result;
    const bankWarnings = [];
    if (ccmrAudit?.autoSourced > 0 || ccmrAudit?.replaced > 0) {
      bankWarnings.push(
        `MathMaster sourced ${Number(ccmrAudit.autoSourced || 0) + Number(ccmrAudit.replaced || 0)} Practice item${Number(ccmrAudit.autoSourced || 0) + Number(ccmrAudit.replaced || 0) === 1 ? '' : 's'} from the audited CCMR Fidelity V2.1 bank.`,
      );
    }
    const warnings = [...(result.warnings || []), ...bankWarnings];
    const opened = openAssignmentPreflight({ ...result.parsed, authoringWarnings: warnings }, sourceName);
    if (opened !== true) {
      return { ok: false, errors: [opened?.error || 'Could not build Assignment Review from this assignment.'], warnings, sourceSchemaVersion: result.sourceSchemaVersion, compilerDefect: false };
    }
    return { ok: true, warnings, repairs: result.parsed.repairs || [], ccmrAudit };
  };


  const handleCreateAssignment = async (teacherReview, reviewedAssignmentV5) => {
    try {
      if (!teacherReview || typeof teacherReview !== 'object') {
        throw new Error('Publishing requires the completed Assignment Review settings.');
      }
      const reviewedV5 = reviewedAssignmentV5 && Number(reviewedAssignmentV5.schemaVersion) === 5
        ? reviewedAssignmentV5
        : null;
      if (!reviewedV5) {
        throw new Error('Publishing requires the MathMaster assignment that was reviewed before creation.');
      }

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
      }

      const sourceHonorsReport = inspectHonorsRigor(honorsParsedQuestions, { allowNarrowCheckpoint: true });
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
            if (!sourceHonorsReport.checks.ccmrEnrichment) {
              throw new Error('MathMaster could not find an audited CCMR Fidelity V2.1 Practice family on the same lesson TEKS for this Honors destination. Review the Practice TEKS or use a short checkpoint that is exempt from the CCMR target.');
            }
            if (!teacherReview?.honorsEnrichmentQuestion) {
              throw new Error('This Honors destination still needs additional Honors depth. Return to preflight and choose Build Honors Depth with MathMaster AI.');
            }
            const firstHonorsDestination = destinationGroups.find((entry) => entry.courseLevel === 'honors');
            enrichmentQuestion = destination.course === firstHonorsDestination?.course
              ? teacherReview.honorsEnrichmentQuestion
              : buildHonorsEnrichmentQuestion({ questions: honorsParsedQuestions, course: destination.course });
          }
          destinationQuestions = normalizeAssignmentQuestions([
            ...honorsParsedQuestions,
            ...(enrichmentQuestion ? [enrichmentQuestion] : []),
          ]);
          const finalHonorsReport = inspectHonorsRigor(destinationQuestions, { allowNarrowCheckpoint: true });
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
    await updateDoc(doc(db, 'assignments', existing.id), patch);

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

  const saveQuestionEditor = async ({ title, questions }) => {
    if (!questionEditorAssignment?.id) return;
    const normalizedQuestions = normalizeAssignmentQuestions(questions);
    const included = normalizedQuestions.filter(questionIsIncluded);
    if (!included.length) throw new Error('At least one included question is required.');

    const candidateV5 = storedAssignmentToV5(questionEditorAssignment, {
      titleOverride: title,
      questions: normalizedQuestions,
    });
    const model = buildAssignmentV5PreflightModel(candidateV5);
    if (!model.isValid) {
      throw new Error(`These question edits cannot be saved until MathMaster’s assignment checks are clean:\n${model.errors.join('\n')}`);
    }
    const persistence = canonicalV5PersistencePatch(model.assignmentV5);
    const persistedQuestions = flattenV5Sections(model.assignmentV5);
    const dolIndex = resolveDOLQuestionIndex({
      ...questionEditorAssignment,
      questions: persistedQuestions,
    });
    await updateDoc(doc(db, 'assignments', questionEditorAssignment.id), {
      ...persistence,
      'dol.questionIndex': dolIndex >= 0 ? dolIndex : null,
      updatedAt: new Date().toISOString(),
    });
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
  // student who finishes on Friday should not be graded on Wednesday's work.
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
      dueDayOfWeek: config.dueDayOfWeek ?? 5,
    });
  }, [classesById, activeClass.classId, weeklyGoalsByClass, Math.floor(now / 3_600_000)]);

  const queueDayStart = useMemo(() => new Date(now).setHours(0, 0, 0, 0), [Math.floor(now / 3_600_000)]);

  const needsAttentionQueue = useMemo(() => {
    const scoped = activeClass.classId ? studentsInActiveClass : allStudents;
    const weeklyLoaded = Boolean(activeClass.classId) && weeklyPathProgressLoadedFor === activeClass.classId;
    const weeklyByStudentId = !weeklyLoaded ? {} : Object.fromEntries(buildTeacherWeeklyView(
      teacherWeeklyRoster.map((student) => ({
        studentId: student.id,
        studentName: student.name || student.id,
        goal: teacherWeeklyGoalsByStudent[student.id] || null,
        completions: weeklyPathCompletionsByStudent[student.id] || [],
      })).filter((entry) => entry.goal),
      { now: queueDayStart },
    ).map((row) => [row.studentId, row]));

    const classSizes = Object.fromEntries(classes.map((entry) => [
      entry.classId,
      studentsInClass({ students: allStudents, classes, classId: entry.classId }).length,
    ]));

    // How far through the school week we are, so nobody is told on Monday
    // morning that a student has not finished the week's work. Monday is 0 and
    // Friday is 1; the weekend reads as a full week gone.
    const day = new Date(queueDayStart).getDay();
    const weekFraction = Math.min(1, Math.max(0, ((day + 6) % 7) / 4));

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
    weeklyPathCompletionsByStudent, weeklyPathTruncated, weeklyPathProgressLoadedFor, queueDayStart,
  ]);

  const profileDrawerStudent = useMemo(
    () => allStudents.find((student) => student.id === profileDrawerStudentId) || null,
    [allStudents, profileDrawerStudentId],
  );

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
      profile: teacherLearningProfiles[profileDrawerStudent.id] || null,
      sessions: context.courseLevel === 'honors' ? 5 : 4,
      honors: context.courseLevel === 'honors',
    });
  }, [profileDrawerStudent, classesById, courseProfiles, assignments, pacingByClass, skillOverrides, teacherLearningProfiles]);

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
    if (state.status === 'notToday') {
      toastWarning('DOL is not scheduled today', `This DOL is scheduled for ${state.instructionDateKey || 'another date'}.`);
      return;
    }
    if (!state.window) {
      toastWarning('Bell schedule needed', `Set today’s A/B day and bell times for ${classPeriod} before unlocking its DOL.`);
      return;
    }
    if (state.status === 'ended') {
      toastWarning('DOL window ended', `The DOL window for ${classLabel} has already ended.`);
      return;
    }
    if (state.status === 'active') {
      toastInfo('DOL is already open', `${assignment.title} is already available to ${classLabel}.`);
      return;
    }

    const durationMinutes = Math.max(1, Number(assignment?.dol?.minutesBeforeEnd || 10));
    const proceed = await confirmAction({
      title: `Unlock the DOL early for ${classLabel}?`,
      message: state.status === 'beforeClass'
        ? `The DOL will open when ${classLabel} begins and its ${durationMinutes}-minute timer will start then.`
        : `The DOL will open immediately for ${classLabel} and its ${durationMinutes}-minute timer will start now. Other classes stay locked.`,
      confirmLabel: 'Unlock DOL',
    });
    if (!proceed) return;

    const busyKey = `${assignment.id}:${classKey}`;
    setDolUnlockBusyKey(busyKey);
    try {
      const unlockedAt = new Date().toISOString();
      const dol = { ...(assignment.dol || {}), enabled: true };
      const entry = {
        dateKey: localDateKey(Date.now()),
        unlockedAt,
        unlockedBy: user?.email || user?.id || 'teacher',
      };
      dol.earlyUnlocksByClassId = { ...(assignment.dol?.earlyUnlocksByClassId || {}), [classId]: entry };
      await updateDoc(doc(db, 'assignments', assignment.id), { dol, updatedAt: unlockedAt });
      toastSuccess('DOL unlocked', `${assignment.title} is released early for ${classLabel} only. Its timer starts when the unlock takes effect.`);
    } catch (error) {
      console.error(error);
      toastError('Could not unlock DOL', error.message);
    } finally {
      setDolUnlockBusyKey(null);
    }
  };

  const handleToggleWarmupForClass = async (assignment, classContext) => {
    const { classId, classPeriod, label: classLabel, key: classKey } = resolveTeacherClassContext(classContext);
    if (!assignment?.id || !classId || !classPeriod || !classKey) return;
    const state = getWarmupState({ assignment, schedule: classSchedule, classId, classPeriod, nowValue: Date.now() });
    if (!state.enabled) {
      toastWarning('No Warm-Up section', 'This assignment does not have an authored Warm-Up section.');
      return;
    }
    if (state.status === 'notToday') {
      toastWarning('Warm-Up is not scheduled today', `This Warm-Up is scheduled for ${state.instructionDateKey || 'another date'}.`);
      return;
    }
    if (!state.window) {
      toastWarning('Bell schedule needed', `Set today’s A/B day and bell times for ${classPeriod} before controlling its Warm-Up.`);
      return;
    }
    if (state.status === 'waiting') {
      toastInfo('Warm-Up has not opened yet', `It opens ${state.minutesBeforeStart} minutes before ${classLabel} begins.`);
      return;
    }
    if (state.status === 'ended') {
      toastWarning('Class period ended', 'The Warm-Up is already read-only because this class period has ended.');
      return;
    }

    const closing = state.status === 'active';
    const proceed = await confirmAction({
      title: `${closing ? 'Close' : 'Reopen'} the Warm-Up for ${classLabel}?`,
      message: closing
        ? 'Students in this class will keep their saved work for review, but they will not be able to make new Warm-Up submissions. Other classes are unaffected.'
        : 'Students in this class will be able to continue the Warm-Up until you close it again or the class period ends.',
      confirmLabel: closing ? 'Close Warm-Up' : 'Reopen Warm-Up',
    });
    if (!proceed) return;

    const busyKey = `${assignment.id}:${classKey}`;
    setWarmupControlBusyKey(busyKey);
    try {
      const changedAt = new Date().toISOString();
      const warmup = {
        ...(assignment.warmup || {}),
        enabled: true,
        minutesBeforeStart: Math.max(0, Number(assignment?.warmup?.minutesBeforeStart ?? 7)),
      };
      const closedByClassId = { ...(assignment.warmup?.closedByClassId || {}) };
      if (closing) closedByClassId[classId] = { dateKey: localDateKey(Date.now()), closedAt: changedAt, closedBy: user?.email || user?.id || 'teacher' };
      else delete closedByClassId[classId];
      warmup.closedByClassId = closedByClassId;
      await updateDoc(doc(db, 'assignments', assignment.id), { warmup, updatedAt: changedAt });
      toastSuccess(closing ? 'Warm-Up closed' : 'Warm-Up reopened', `${assignment.title} · ${classLabel}`);
    } catch (error) {
      console.error(error);
      toastError(`Could not ${closing ? 'close' : 'reopen'} Warm-Up`, error.message);
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
      await fetchStudents();
    } catch (error) {
      console.error(error);
      toastError('Could not change class', error?.message || 'Class membership could not be updated.');
    }
  };

  const handleUpdateStudentProfile = async (studentId, patch) => {
    const student = allStudents.find((entry) => entry.id === studentId);
    const nextProfile = normalizeStudentProfile({ ...(student?.profile || {}), ...patch });
    try {
      await updateDoc(doc(db, 'grades', studentId), { profile: nextProfile });
      setAllStudents((current) => current.map((entry) => entry.id === studentId ? { ...entry, profile: nextProfile } : entry));
    } catch (error) {
      console.error(error);
      toastError('Could not update support profile', error.message);
    }
  };

  const toggleStudentSupport = async (student, group, value) => {
    const currentValues = new Set(student.profile?.[group] || []);
    if (currentValues.has(value)) currentValues.delete(value);
    else currentValues.add(value);
    await handleUpdateStudentProfile(student.id, { [group]: [...currentValues] });
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
      const {
        id: _id,
        archived: _archived,
        ...rest
      } = assignment;
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

  const handleToggleArchiveAssignment = async (assignment) => {
    await updateDoc(doc(db, 'assignments', assignment.id), { archived: !assignment.archived });
    await fetchAssignments();
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
    const ids = Array.from(assignmentIds);
    if (!ids.length) return;
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
    } catch (error) {
      console.error(error);
      toastError('Bulk update failed', error.message);
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
    await applyBulkAssignmentPatch(
      selectedAssignmentIds,
      { archived: shouldArchive },
      (done) => `${shouldArchive ? 'Archived' : 'Unarchived'} ${done} assignment${done === 1 ? '' : 's'}`,
    );
  };

  const handleBulkMoveToFolder = async (rawFolder) => {
    const folder = normalizeFolderPath(rawFolder);
    await applyBulkAssignmentPatch(
      selectedAssignmentIds,
      { folder: folder || null },
      (count) => `Moved ${count} assignment${count === 1 ? '' : 's'} to ${folder || 'Uncategorized'}`,
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
    await updateDoc(doc(db, 'assignments', assignmentId), patch);

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

  const openIEPReport = (student) => {
    const reportAssignments = assignments.map((assignment) => ({
      assignment,
      score: student.gradesByAssignment?.[assignment.id]
        ? calculateGrade(student.gradesByAssignment[assignment.id], assignment)
        : '—',
      supportUsage: student.supportUsageByAssignment?.[assignment.id] || {},
      activity: student.assignmentActivity?.[assignment.id] || {},
      dol: student.dolGradesByAssignment?.[assignment.id] || {},
      classwork: student.classworkGradesByAssignment?.[assignment.id] || {},
    }));
    const reportWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!reportWindow) {
      toastWarning('Pop-up blocked', 'Allow pop-ups for this site to open the printable IEP support report.');
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(buildIEPReportHtml({ student, assignments: reportAssignments }));
    reportWindow.document.close();
  };

  const openDeleteDialog = (assignment) => {
    setDeleteDialog(assignment);
    setDeleteStep(1);
    setDeleteTitleConfirmation('');
    setDeleteAcknowledged(false);
    setDeleteError('');
    fetchStudents().catch((error) =>
      console.error('Could not refresh affected student count:', error),
    );
  };

  const closeDeleteDialog = () => {
    if (isDeleting) return;
    setDeleteDialog(null);
    setDeleteStep(1);
    setDeleteTitleConfirmation('');
    setDeleteAcknowledged(false);
    setDeleteError('');
  };

  const deleteAssignmentPermanently = async () => {
    if (!deleteDialog || !deleteAcknowledged) return;

    setIsDeleting(true);
    setDeleteError('');

    try {
      const gradeSnapshot = await getDocs(collection(db, 'grades'));
      const gradeDocs = gradeSnapshot.docs.filter(
        (gradeDoc) => gradeDoc.id !== 'test_connection',
      );
      const questionCount = Array.isArray(deleteDialog.questions)
        ? deleteDialog.questions.length
        : 0;

      // Remove the assignment first so students lose access immediately.
      await deleteDoc(doc(db, 'assignments', deleteDialog.id));

      // Then remove linked grade records and every per-question scratchpad.
      // Work is chunked to remain safely below the per-batch write ceiling.
      const operations = [];
      gradeDocs.forEach((gradeDoc) => {
        const studentData = gradeDoc.data() || {};
        const linkedUpdate = {};
        ['gradesByAssignment', 'assignmentActivity', 'dolGradesByAssignment', 'classworkGradesByAssignment', 'supportUsageByAssignment'].forEach((field) => {
          if (studentData?.[field]?.[deleteDialog.id] !== undefined) linkedUpdate[`${field}.${deleteDialog.id}`] = deleteField();
        });
        if (Object.keys(linkedUpdate).length) {
          operations.push({ kind: 'update', ref: gradeDoc.ref, data: linkedUpdate });
        }
        for (let index = 0; index < questionCount; index += 1) {
          operations.push({
            kind: 'delete',
            ref: doc(
              db,
              'grades',
              gradeDoc.id,
              'scratchpads',
              getScratchpadDocumentId(deleteDialog.id, index),
            ),
          });
        }
      });

      const chunkSize = 400;
      for (let startIndex = 0; startIndex < operations.length; startIndex += chunkSize) {
        const batch = writeBatch(db);
        operations.slice(startIndex, startIndex + chunkSize).forEach((operation) => {
          if (operation.kind === 'update') batch.update(operation.ref, operation.data);
          else batch.delete(operation.ref);
        });
        await batch.commit();
      }

      await Promise.all([fetchAssignments(), fetchStudents()]);
      setDeleteDialog(null);
      setDeleteStep(1);
      setDeleteTitleConfirmation('');
      setDeleteAcknowledged(false);
      setDeleteError('');
    } catch (error) {
      console.error(error);
      setDeleteError(
        `The assignment could not be fully deleted. ${error.message}`,
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const renderStudentPackUpBanner = () => {
    if (user?.role !== 'student' || !user.classPeriod) return null;
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
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20000,
          background: '#fbbc04',
          color: '#202124',
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

  const renderIdleOverlay = () => {
    if (!isIdle) return null;
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          zIndex: 9999,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px',
        }}
      >
        <div
          style={{
            background: '#fff',
            padding: '40px',
            borderRadius: '12px',
            textAlign: 'center',
            maxWidth: '400px',
          }}
        >
          <h2 style={{ color: '#d93025', marginTop: 0 }}>Are you still working?</h2>
          <p style={{ color: '#5f6368', fontSize: '16px', marginBottom: '30px' }}>
            Your timer has been paused due to inactivity.
          </p>
          <button
            onClick={() => {
              lastActivityRef.current = Date.now();
              setIsIdle(false);
            }}
            style={{
              padding: '12px 24px',
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

    const impactedStudentCount = allStudents.filter(
      (student) =>
        student.gradesByAssignment?.[deleteDialog.id] !== undefined,
    ).length;
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
            background: '#fff',
            borderRadius: '16px',
            boxShadow: '0 24px 70px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            textAlign: 'left',
          }}
        >
          <div style={{ padding: '24px 28px', borderBottom: '1px solid #e8eaed' }}>
            <div
              style={{
                color: '#d93025',
                fontWeight: 'bold',
                fontSize: '13px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '8px',
              }}
            >
              Permanent deletion · Step {deleteStep} of 3
            </div>
            <h2 id="delete-assignment-title" style={{ margin: 0, color: '#202124' }}>
              Delete “{deleteDialog.title}”?
            </h2>
          </div>

          <div style={{ padding: '28px' }}>
            {deleteStep === 1 && (
              <div>
                <div
                  style={{
                    background: '#fce8e6',
                    color: '#a50e0e',
                    border: '1px solid #f6aea8',
                    borderRadius: '10px',
                    padding: '16px',
                    marginBottom: '20px',
                    lineHeight: 1.5,
                  }}
                >
                  <strong>This cannot be undone.</strong> Students will immediately
                  lose access to the assignment. Their saved answers, time, progress,
                  and recorded grade for this assignment will also be permanently
                  removed.
                </div>
                <p style={{ color: '#3c4043', lineHeight: 1.55 }}>
                  Student records currently affected: <strong>{impactedStudentCount}</strong>
                </p>
              </div>
            )}

            {deleteStep === 2 && (
              <div>
                <p style={{ color: '#3c4043', lineHeight: 1.55, marginBottom: '16px' }}>
                  To confirm that you selected the correct assignment, type its exact
                  title below:
                </p>
                <div
                  style={{
                    background: '#f1f3f4',
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
                      : '2px solid #dadce0',
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
                  <div style={{ fontWeight: 'bold', color: '#d93025', marginBottom: '8px' }}>
                    Final confirmation
                  </div>
                  <div style={{ color: '#3c4043', lineHeight: 1.5 }}>
                    You are permanently deleting this assignment and its linked data
                    for {impactedStudentCount} student record
                    {impactedStudentCount === 1 ? '' : 's'}.
                  </div>
                </div>
                <label
                  style={{
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start',
                    color: '#202124',
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
                    I understand that students will lose access and that the assignment,
                    answers, progress, time records, and grade data cannot be recovered.
                  </span>
                </label>
              </div>
            )}

            {deleteError && (
              <div
                style={{
                  marginTop: '18px',
                  padding: '12px',
                  background: '#fce8e6',
                  color: '#a50e0e',
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
              borderTop: '1px solid #e8eaed',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              background: '#f8f9fa',
            }}
          >
            <button
              onClick={deleteStep === 1 ? closeDeleteDialog : () => setDeleteStep((step) => step - 1)}
              disabled={isDeleting}
              style={{
                padding: '10px 18px',
                background: '#fff',
                color: '#3c4043',
                border: '1px solid #dadce0',
                borderRadius: '8px',
                cursor: isDeleting ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
              }}
            >
              {deleteStep === 1 ? 'Cancel' : 'Back'}
            </button>

            {deleteStep < 3 ? (
              <button
                onClick={() => setDeleteStep((step) => step + 1)}
                disabled={deleteStep === 2 && !titleMatches}
                style={{
                  padding: '10px 18px',
                  background:
                    deleteStep === 2 && !titleMatches ? '#dadce0' : '#d93025',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor:
                    deleteStep === 2 && !titleMatches
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
                    !deleteAcknowledged || isDeleting ? '#dadce0' : '#d93025',
                  color: '#fff',
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

  const buildPortableAssignmentPackage = (assignment) => ({
    ...storedAssignmentToV5(assignment, {
      resetAssignmentKey: true,
    }),
    portableContract: {
      kind: 'mathmasterCanonicalAssignmentV5',
      version: 1,
    },
  });

  const renderExportJsonDialog = () => {
    if (!exportJsonAssignment) return null;

    const exportedText = JSON.stringify(buildPortableAssignmentPackage(exportJsonAssignment), null, 2);

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
            background: '#fff',
            borderRadius: '16px',
            boxShadow: '0 24px 70px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            textAlign: 'left',
          }}
        >
          <div style={{ padding: '24px 28px', borderBottom: '1px solid #e8eaed' }}>
            <h2 id="export-json-title" style={{ margin: 0, color: '#202124' }}>
              Export Assignment &middot; {exportJsonAssignment.title}
            </h2>
            <p style={{ margin: '8px 0 0', color: '#5f6368', fontSize: '13px' }}>
              This is a portable MathMaster assignment. You can copy it into another MathMaster authoring workflow and bring it back through Assignment Creator. Student/class dates and publication records stay out of the portable assignment.
            </p>
          </div>
          <div style={{ padding: '20px 28px' }}>
            <textarea
              readOnly
              value={exportedText}
              onFocus={(event) => event.target.select()}
              style={{ width: '100%', height: '360px', padding: '12px', borderRadius: '8px', border: '1px solid #ccc', fontFamily: 'monospace', fontSize: '12px', boxSizing: 'border-box', resize: 'vertical' }}
            />
          </div>
          <div style={{ padding: '18px 28px', borderTop: '1px solid #e8eaed', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={closeExportJsonDialog}
              style={{ padding: '10px 18px', background: '#fff', border: '1px solid #c9ced6', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
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
            background: '#fff',
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
              borderBottom: '1px solid #e3e7ee',
            }}
          >
            <div>
              <h2 id="student-work-title" style={{ margin: 0, color: '#202124' }}>
                Student Scratchpad
              </h2>
              <div style={{ color: '#5f6368', marginTop: '5px', fontSize: '14px' }}>
                {teacherScratchpadDialog.studentId} · Question{' '}
                {teacherScratchpadDialog.questionIndex + 1}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTeacherScratchpadDialog(null)}
              style={{
                border: '1px solid #dadce0',
                background: '#fff',
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
              <p style={{ color: '#5f6368' }}>Loading student work…</p>
            ) : teacherScratchpadDialog.dataUrl ? (
              <img
                src={teacherScratchpadDialog.dataUrl}
                alt={`Scratchpad work for question ${teacherScratchpadDialog.questionIndex + 1}`}
                style={{
                  display: 'block',
                  width: '100%',
                  height: 'auto',
                  maxHeight: '72vh',
                  objectFit: 'contain',
                  background: '#fff',
                  border: '1px solid #d8dde6',
                  borderRadius: '10px',
                }}
              />
            ) : (
              <div
                style={{
                  padding: '55px 20px',
                  border: '2px dashed #cdd5e1',
                  borderRadius: '10px',
                  color: '#5f6368',
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
    const includedQuestionIndices = getIncludedQuestionIndices(questions);
    const lifecycle = getAssignmentLifecycle(assignment, now);
    const recordedTracker = tracker[activeAssignmentId] || {};
    const workingTracker = preview
      ? previewTracker
      : lifecycle.isPracticeOnly
        ? practiceTracker[activeAssignmentId] || createPracticeAssignmentTracker(questions, recordedTracker)
        : recordedTracker;
    const recordedGrade = calculateGrade(recordedTracker, assignment);
    const gradeSplit = splitGrade({ tracker: recordedTracker, assignment });
    const progress = calculatePracticeProgress(workingTracker, assignment);
    const dolState = getDOLState({ assignment, schedule: classSchedule, classId: user?.classId || null, classPeriod: user?.classPeriod, nowValue: now });
    const warmupState = getWarmupState({ assignment, schedule: classSchedule, classId: user?.classId || null, classPeriod: user?.classPeriod, nowValue: now });
    const currentRecord = normalizeQuestionRecord(workingTracker?.[currentQuestionIndex]);
    const currentIsDOL = !lifecycle.isPracticeOnly && activeQuestionRole === 'dol' && dolState.enabled && (dolState.questionIndices || [dolState.questionIndex]).includes(currentQuestionIndex);
    const currentIsWarmup = !lifecycle.isPracticeOnly && activeQuestionRole === 'warmup' && warmupState.enabled;
    const currentManualSectionState = getSectionAccessState({
      assignment,
      activityRole: activeQuestionRole,
      classId: user?.classId || null,
      classPeriod: user?.classPeriod,
      nowValue: now,
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
      ? { label: 'Practice only', background: '#f1f3f4', color: '#3c4043' }
      : lifecycle.isLate
        ? { label: 'Late — still open', background: '#fff4ce', color: '#7a4f00' }
        : lifecycle.isScheduled
          ? { label: 'Scheduled', background: '#e8eaed', color: '#3c4043' }
          : { label: 'On-time access', background: '#e6f4ea', color: '#137333' };

    // Bundle/V5 activities are flattened for runtime compatibility, but every
    // question keeps its activityRole. Rebuild the visible sections here so a
    // student can tell when they are in the Warm-Up, Classwork, Practice, or
    // DOL instead of seeing one undifferentiated row of question numbers.
    const activitySectionMeta = {
      warmup: { label: 'Warm-Up', background: '#fff4ce', color: '#7a4f00', border: '#f9ab00' },
      classwork: { label: 'Classwork', background: '#e8f0fe', color: '#174ea6', border: '#1a73e8' },
      practice: { label: 'Practice', background: '#e6f4ea', color: '#137333', border: '#34a853' },
      dol: { label: 'DOL / Exit Ticket', background: '#f3e8fd', color: '#681da8', border: '#9334e6' },
      checkpoint: { label: 'Checkpoint', background: '#fce8e6', color: '#a50e0e', border: '#d93025' },
      quiz: { label: 'Quiz', background: '#fce8e6', color: '#a50e0e', border: '#d93025' },
      test: { label: 'Test', background: '#fce8e6', color: '#a50e0e', border: '#d93025' },
    };
    const sectionOrdinals = {};
    const visibleQuestionEntries = includedQuestionIndices.map((index, visiblePosition) => {
      const question = questions[index];
      const isTimedDOLQuestion = dolState.enabled && (dolState.questionIndices || [dolState.questionIndex]).includes(index);
      const role = resolveQuestionActivityRole({ question, assignment, isDOL: isTimedDOLQuestion });
      const sectionPosition = sectionOrdinals[role] || 0;
      sectionOrdinals[role] = sectionPosition + 1;
      return { index, visiblePosition, sectionPosition, question, role, isTimedDOLQuestion };
    });
    const sectionQuestionIsComplete = (index) => ['correct', 'expired'].includes(normalizeQuestionRecord(workingTracker?.[index]).status);
    const sectionQuestionIsCorrect = (index) => normalizeQuestionRecord(workingTracker?.[index]).status === 'correct';
    const navigationSections = visibleQuestionEntries.reduce((sections, entry) => {
      const previous = sections[sections.length - 1];
      if (previous?.role === entry.role) previous.entries.push(entry);
      else sections.push({ role: entry.role, entries: [entry] });
      return sections;
    }, []).map((section) => ({
      ...section,
      complete: section.entries.length > 0 && section.entries.every((entry) => sectionQuestionIsComplete(entry.index)),
      allCorrect: section.entries.length > 0 && section.entries.every((entry) => sectionQuestionIsCorrect(entry.index)),
    }));
    const currentSectionMeta = activitySectionMeta[activeQuestionRole] || {
      label: String(activeQuestionRole || 'Activity').replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()),
      background: '#f1f3f4', color: '#3c4043', border: '#9aa0a6',
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
    const nextAvailableSection = nextAvailableIncompleteSection
      || laterNavigationSections.find((section) => sectionNavigationTarget(section));
    const nextAvailableSectionTarget = nextAvailableSection ? sectionNavigationTarget(nextAvailableSection) : null;
    const nextAvailableSectionMeta = nextAvailableSection
      ? (activitySectionMeta[nextAvailableSection.role] || { label: nextAvailableSection.role })
      : null;
    const leaveAssignment = () => {
      if (preview) setTeacherTab('assignments');
      else flushAssignmentActivity(activeAssignmentId).catch(() => {});
      setActiveView('dashboard');
      setActiveAssignmentId(null);
    };

    return (
      <div
        className={`mathmaster-assignment-screen ${supportPresentation.highContrast ? 'mathmaster-support-high-contrast' : ''} ${supportPresentation.largeText ? 'mathmaster-support-large-text' : ''}`}
        style={{
          fontFamily: '"Segoe UI", sans-serif',
          backgroundColor: supportPresentation.highContrast ? '#ffffff' : '#f0f2f5',
          minHeight: '100vh',
          padding: '20px',
          fontSize: supportPresentation.largeText ? '120%' : undefined,
        }}
      >
        {!preview && renderStudentPackUpBanner()}
        {!preview && !supportPresentation.disableIdleTimer && renderIdleOverlay()}
        <div className="mathmaster-assignment-shell" style={{ maxWidth: '1120px', margin: '0 auto' }}>
          {!preview && liveChallengeInvite?.status === 'running' && (
            <section className="mathmaster-assignment-banner" style={{ marginBottom: '16px', padding: '18px 22px', borderRadius: '13px', background: '#e8f0fe', border: '3px solid #1a73e8', color: '#174ea6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', textAlign: 'left' }}>
              <div><strong style={{ display: 'block', fontSize: '20px' }}>⚡ Live Challenge has started</strong><span>{liveChallengeInvite.title || 'Your class challenge'} is live now. Your assignment work is saved when you switch.</span></div>
              <button type="button" onClick={() => { leaveAssignment(); setStudentDashboardMode('liveChallenge'); }} style={{ padding: '11px 17px', border: 0, borderRadius: '9px', background: '#174ea6', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Join Live Challenge</button>
            </section>
          )}
          {lifecycle.isLate && !preview && (
            <section className="mathmaster-assignment-banner" style={{ marginBottom: '16px', padding: '18px 22px', borderRadius: '13px', background: '#fff4ce', border: '2px solid #f9ab00', color: '#5f4400', textAlign: 'left' }}>
              <strong style={{ display: 'block', fontSize: '20px' }}>Late submission window</strong>
              <span>The regular deadline passed. You have <strong>{formatRemainingTime(lifecycle.millisecondsRemaining)}</strong> before this assignment closes permanently on {formatLateDueDate(assignment)}.</span>
            </section>
          )}

          {lifecycle.isPracticeOnly && !preview && (
            <section className="mathmaster-assignment-banner" style={{ marginBottom: '16px', padding: '18px 22px', borderRadius: '13px', background: '#f1f3f4', border: '2px solid #5f6368', color: '#3c4043', textAlign: 'left' }}>
              <strong style={{ display: 'block', fontSize: '20px' }}>Practice Mode — grading window ended</strong>
              <span>Your recorded grade is frozen. You may keep practicing with feedback, but these attempts earn no credit and are not written to the teacher gradebook, mastery evidence, Math Path recommendations, or activity analytics. Practice state stays only in memory for this signed-in browser session and is never saved.</span>
            </section>
          )}

          {!preview && dolState.status === 'active' && (dolState.questionIndices || [dolState.questionIndex]).some((index) => normalizeQuestionRecord(workingTracker?.[index]).totalAttempts === 0) && (
            <section className="mathmaster-assignment-banner" style={{ marginBottom: '16px', padding: '20px 22px', borderRadius: '14px', background: '#f3e8fd', border: '2px solid #9334e6', color: '#4a126b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap', textAlign: 'left' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '22px' }}>DOL is available now</strong>
                <span>The entire DOL section is open. Complete all {(dolState.questionIndices || [dolState.questionIndex]).length} question{(dolState.questionIndices || [dolState.questionIndex]).length === 1 ? '' : 's'} before the timer reaches zero.</span>
                {!supportPresentation.hideCountdowns && <div style={{ marginTop: '7px', fontWeight: 900, fontSize: '18px' }}><DOLCountdown endsAt={dolState.endsAt} /> remaining</div>}
              </div>
              <button type="button" onClick={() => changeQuestion((dolState.questionIndices || [dolState.questionIndex])[0])} style={{ padding: '12px 18px', border: 0, borderRadius: '10px', background: '#681da8', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Start DOL Section</button>
            </section>
          )}

          <header className="mathmaster-assignment-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '18px 24px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: '22px', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'left', flex: '1 1 390px' }}>
              <button
                onClick={leaveAssignment}
                style={{ background: 'none', border: 'none', color: '#1a73e8', cursor: 'pointer', fontWeight: 'bold', padding: 0, marginBottom: '5px' }}
              >
                &larr; {preview ? 'Back to Instructor Dashboard' : 'Back to Dashboard'}
              </button>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, color: '#202124', fontSize: '23px' }}>{assignment.title}</h1>
                <span style={{ padding: '4px 9px', borderRadius: '999px', background: lifecycleBadge.background, color: lifecycleBadge.color, fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>{lifecycleBadge.label}</span>
                {assignmentHasClasswork && assignment?.guidedNotesBySection?.classwork !== 'off' && <span style={{ padding: '4px 9px', borderRadius: '999px', background: '#e8f0fe', color: '#174ea6', fontSize: '11px', fontWeight: 900 }}>GUIDED NOTES · CLASSWORK</span>}
                <span style={{ padding: '4px 9px', borderRadius: '999px', background: currentSectionVariantMode === 'shared' ? '#e6f4ea' : '#f3e8fd', color: currentSectionVariantMode === 'shared' ? '#137333' : '#681da8', fontSize: '11px', fontWeight: 900 }}>{currentSectionVariantMode === 'shared' ? `${currentSectionMeta.label.toUpperCase()} · SAME VERSION` : `${currentSectionMeta.label.toUpperCase()} · PERSONALIZED VERSIONS`}</span>
              </div>
              <div style={{ color: '#5f6368', fontSize: '13px', marginTop: '7px', lineHeight: 1.5 }}>
                Regular due: {formatDueDate(assignment)}<br />Final late due: {formatLateDueDate(assignment)}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '12px', color: '#5f6368', textTransform: 'uppercase', fontWeight: 900 }}>{preview ? 'Preview progress' : lifecycle.isPracticeOnly ? 'Frozen recorded grade' : lifecycle.isLate ? 'Current late grade' : 'Current grade'}</div>
                <div style={{ fontSize: '22px', fontWeight: 900, color: assignmentFeedbackHeld ? '#174ea6' : recordedGrade >= 70 ? '#188038' : '#202124' }}>{preview ? `${progress.correct}/${progress.total}` : assignmentFeedbackHeld ? 'Awaiting teacher release' : `${recordedGrade}%`}</div>
              </div>
              {!preview && assignmentHasClasswork && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: '#5f6368', textTransform: 'uppercase', fontWeight: 900 }}>Daily classwork</div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: classworkGradesByAssignment?.[assignment.id]?.score === 100 ? '#188038' : '#8a5a00' }}>{classworkGradesByAssignment?.[assignment.id]?.score === 100 ? '100 — prerequisite met' : 'In progress'}</div>
                </div>
              )}
            </div>
          </header>

          <nav className="mathmaster-assignment-unified-nav" aria-label="Assignment navigation">
            <div className="mathmaster-assignment-unified-top">
              <button type="button" className="mathmaster-unified-nav-back" onClick={leaveAssignment} aria-label={preview ? 'Back to instructor dashboard' : 'Back to dashboard'}>←</button>
              <div className="mathmaster-section-tabs" role="list" aria-label="Assignment sections">
                {navigationSections.map((section) => {
                  const meta = activitySectionMeta[section.role] || { label: section.role, background: '#f1f3f4', color: '#3c4043', border: '#9aa0a6' };
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
              <button
                type="button"
                className="mathmaster-overview-button"
                onClick={() => setAssignmentOverviewExpanded((current) => !current)}
                aria-expanded={assignmentOverviewExpanded}
              >
                <span className="mathmaster-overview-button-label">Overview</span> {assignmentOverviewExpanded ? '▴' : '▾'}
              </button>
            </div>

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
                  <small style={{ marginTop: 2, fontWeight: 850, color: assignmentFeedbackHeld ? '#174ea6' : '#3c4043' }}>
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
            {!preview && dolState.status === 'active' && (
              <div className="mathmaster-unified-nav-alert">DOL open{supportPresentation.hideCountdowns ? '' : ` · ${formatRemainingTime(dolState.millisecondsRemaining)}`}</div>
            )}
          </nav>

          {assignmentOverviewExpanded && (
          <div className="mathmaster-question-navigation" style={{ display: 'grid', gap: '14px', marginBottom: '24px' }}>
            {navigationSections.map((section) => {
              const sectionMeta = activitySectionMeta[section.role] || { label: section.role, background: '#f1f3f4', color: '#3c4043', border: '#9aa0a6' };
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
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '10px' }}>
                    {section.entries.map(({ index, sectionPosition, role: cardRole, isTimedDOLQuestion }) => {
                      const record = normalizeQuestionRecord(workingTracker?.[index]);
                      const cardAssessment = questionAssessmentFramework(questions[index] || {});
                      const cardAssessmentLabel = cardAssessment.examStyle && cardAssessment.framework
                        ? `${FRAMEWORK_LABELS[cardAssessment.framework] || cardAssessment.framework} practice`
                        : '';
                      const cardPolicy = getEffectiveActivityPolicy(cardRole);
                      const cardFeedbackHeld = !preview && !lifecycle.isPracticeOnly && cardPolicy.feedback === 'teacherRelease' && !assignmentFeedbackWasReleased(assignment);
                      const storedCardState = getQuestionCardState(workingTracker?.[index]);
                      const cardState = cardFeedbackHeld && ['correct', 'expired'].includes(record.status)
                        ? { background: '#eef4ff', color: '#174ea6', label: 'Submitted · feedback held' }
                        : storedCardState;
                      const dolUnavailable = isTimedDOLQuestion && !preview && !lifecycle.isClosed && !['active', 'ended'].includes(dolState.status);
                      const warmupUnavailable = cardRole === 'warmup' && warmupState.enabled && !preview && !lifecycle.isPracticeOnly && !warmupCanBeViewed;
                      const manualSectionState = getSectionAccessState({ assignment, activityRole: cardRole, classId: user?.classId || null, classPeriod: user?.classPeriod, nowValue: now });
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
                            backgroundColor: sectionUnavailable ? '#f1f3f4' : cardState.background,
                            color: sectionUnavailable ? '#80868b' : cardState.color,
                            border: currentQuestionIndex === index ? `3px solid ${sectionMeta.border}` : '1px solid #dadce0',
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
                          {cardAssessmentLabel && <div aria-label={`${cardAssessmentLabel} question`} style={{ marginTop: '5px', padding: '3px 7px', borderRadius: 999, background: '#f3ecfd', color: '#5b21b6', border: '1px solid #d9c9f7', fontSize: '10px', fontWeight: 950 }}>{cardAssessmentLabel}</div>}
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
          <main ref={assignmentQuestionStageRef} className="mathmaster-question-stage" style={{ background: '#fff', borderRadius: '12px', padding: '10px', minHeight: '500px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <QuestionEngine
              key={`${activeAssignmentId}-${currentQuestionIndex}-${currentRecord.variantIndex}-${preview ? 'preview' : lifecycle.status}`}
              question={questions[currentQuestionIndex]}
              questionRecord={workingTracker?.[currentQuestionIndex]}
              generationKey={`${activeAssignmentId}|${generationStudentKey}|${currentQuestionIndex}|variant:${currentRecord.variantIndex}`}
              adaptation={currentAdaptation}
              onGrade={handleGradeSubmit}
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
              activityRole={runtimeActivityRole}
              activityPolicy={runtimeQuestionActivityPolicy}
              feedbackReleased={currentFeedbackReleased}
              replacementWarning={replacementWarning}
              draftKey={lifecycle.isPracticeOnly && !preview ? null : buildQuestionDraftKey({ studentId: preview ? 'teacher-preview' : user?.id || 'anonymous', assignmentId: activeAssignmentId, questionIndex: currentQuestionIndex, variantIndex: currentRecord.variantIndex, sessionMode: draftSessionMode })}
              assignmentId={activeAssignmentId}
              executionScope={preview ? 'teacherPreview' : lifecycle.isPracticeOnly ? 'postDuePractice' : 'student'}
              onNextQuestion={nextQuestionEntry ? () => changeQuestion(nextQuestionEntry.index) : null}
              nextQuestionLabel={nextQuestionDestinationLabel}
              nextQuestionSectionLabel={nextQuestionSectionMeta?.label || ''}
              sectionComplete={Boolean(currentNavigationSection?.allCorrect)}
              sectionLabel={currentSectionMeta.label}
              sectionQuestionCount={currentSectionQuestionCount}
              onContinueSection={nextAvailableSectionTarget ? () => changeQuestion(nextAvailableSectionTarget.index) : null}
              continueSectionLabel={nextAvailableSectionMeta?.label || ''}
            />
          </main>
        </div>
      </div>
    );
  };

  if (!user) {
    if (auth.status === 'signedOut' || auth.status === 'linking') return <LoginScreen launchAssignment={launchAssignment} />;
    if (sessionHydrationError) {
      return (
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: '#f5f7fb' }}>
          <section style={{ width: 'min(560px, 100%)', padding: '24px', borderRadius: '12px', border: '1px solid #fad2cf', background: '#fff', textAlign: 'center' }}>
            <h1 style={{ marginTop: 0, color: '#a50e0e' }}>MathMaster could not load your account</h1>
            <p style={{ color: '#5f6368' }}>{sessionHydrationError}</p>
            <button type="button" onClick={() => auth.signOut()} style={{ padding: '10px 16px', border: 0, borderRadius: '7px', background: '#174ea6', color: '#fff', fontWeight: 900 }}>Return to sign in</button>
          </section>
        </main>
      );
    }
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#174ea6', background: '#f5f7fb' }}>{sessionHydrating ? 'Loading your MathMaster workspace…' : 'Finishing sign in…'}</div>;
  }

  if (isTeacherPreview) {
    return renderAssignmentWorkspace(true);
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
    const visibleAssignmentIds = visibleAssignments.map((assignment) => assignment.id);
    const allVisibleSelected = visibleAssignmentIds.length > 0
      && visibleAssignmentIds.every((id) => selectedAssignmentIds.has(id));

    const supportOptions = {
      accommodations: [
        ['text-to-speech', 'Text to speech'],
        ['extra-time', 'Extra time / no idle timer'],
        ['visual-chunking', 'One-step reveal'],
        ['calculator', 'Calculator when the activity/question policy permits an accommodation'],
        ['calculator-override-computation', 'Calculator accommodation may override computation-skill lock'],
        ['high-contrast', 'High contrast'],
        ['large-text', '20% larger text'],
        ['no-countdown', 'Hide countdown clocks'],
        ['declutter-ui', 'Declutter interface'],
        ['algebra-auto-apply', 'Algebra operation Apply shortcut'],
      ],
      modifications: [
        ['reduce-complexity', 'Reduce mathematical complexity'],
        ['prefill-first-step', 'Prefill first step'],
      ],
    };

    if (teacherWorkspaceMode === 'administration' && rootAdminUiEligible) {
      return (
        <div style={{ fontFamily: '"Segoe UI", sans-serif', backgroundColor: '#f3f5f8', minHeight: '100vh', padding: '20px' }}>
          <div style={{ maxWidth: 1260, margin: '0 auto', background: '#fff', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,.06)', overflow: 'hidden' }}>
            <header style={{ padding: '22px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderBottom: '1px solid #e8eaed', background: '#202124', color: '#fff' }}>
              <div><div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.08em', color: '#c6dafc' }}>ROOT ADMINISTRATOR</div><h1 style={{ margin: '4px 0 0', fontSize: 25 }}>MathMaster Administration</h1><p style={{ margin: '4px 0 0', color: '#dadce0', fontSize: 13 }}>{user.email}</p></div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><div role="group" aria-label="Root administrator workspace" style={{ display: 'inline-flex', padding: 3, borderRadius: 9, background: '#3c4043', border: '1px solid #5f6368' }}><button type="button" aria-pressed="false" onClick={() => setTeacherWorkspaceMode('teacher')} style={{ padding: '6px 10px', border: 0, borderRadius: 6, background: 'transparent', color: '#e8eaed', fontWeight: 900 }}>Teacher View</button><button type="button" aria-pressed="true" style={{ padding: '6px 10px', border: 0, borderRadius: 6, background: '#fff', color: '#202124', fontWeight: 900 }}>Administration</button></div><button type="button" onClick={() => { setTeacherWorkspaceMode('teacher'); setTeacherTab('demo'); }} style={{ padding: '9px 13px', border: '1px solid #c7a9ea', borderRadius: 8, background: '#f8f0fc', color: '#6f2da8', fontWeight: 900 }}>Open Demo Experience</button><button onClick={handleLogout} style={{ padding: '9px 13px', background: 'transparent', color: '#f28b82', border: '1px solid #f28b82', borderRadius: 8, fontWeight: 900 }}>Log Out</button></div>
            </header>
            <div role="tablist" aria-label="Administration sections" style={{ display: 'flex', gap: 8, padding: '14px 28px 0', flexWrap: 'wrap' }}>
              {[['classes', 'Classes & rosters'], ['accounts', 'Accounts & sign-in'], ['coverage', 'Path content coverage'], ['reset', 'Pre-production reset']].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={adminTab === id}
                  onClick={() => setAdminTab(id)}
                  style={{ minHeight: 40, padding: '8px 16px', borderRadius: '9px 9px 0 0', cursor: 'pointer', border: '1px solid #dadce0', borderBottom: 0, background: adminTab === id ? '#fff' : '#f1f3f4', color: adminTab === id ? '#174ea6' : '#3c4043', fontWeight: 900, fontSize: 14 }}
                >
                  {label}
                </button>
              ))}
            </div>
            <main style={{ padding: 28 }}>
              {adminTab === 'classes' && <ClassesAdmin />}
              {adminTab === 'accounts' && <SignInAccess signedInEmail={user.email} mode="admin" />}
              {adminTab === 'coverage' && <PathCoverageAudit />}
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
                      fetchStudents(),
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
      <div style={{ fontFamily: '"Segoe UI", sans-serif', backgroundColor: '#f8f9fa', minHeight: '100vh', padding: '20px' }}>
        {renderDeleteAssignmentDialog()}
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
          />
        )}
        {questionEditorAssignment && (
          <AssignmentQuestionEditor
            assignment={questionEditorAssignment}
            hasStudentData={allStudents.some((student) => student.gradesByAssignment?.[questionEditorAssignment.id] !== undefined)}
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
          students={allStudents.map((student) => ({ ...student, displayName: formatStudentName(student) }))}
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
              setGradebookFilter((current) => ({ ...current, assignmentId: result.payload.assignmentId, student: null }));
              setTeacherTab('grades');
              return;
            }
            if (result.kind === 'standard') setTeacherTab('standards');
          }}
        />

        <ClassroomSyncReview
          proposal={classroomSyncProposal}
          onClose={() => setClassroomSyncProposal(null)}
        />

        <StudentProfileDrawer
          open={Boolean(profileDrawerStudent)}
          studentId={profileDrawerStudent?.id || null}
          studentName={profileDrawerStudent ? formatStudentName(profileDrawerStudent) : ''}
          profile={profileDrawerStudent ? teacherLearningProfiles[profileDrawerStudent.id] : null}
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
        />

        <div className="mm-dashboard-shell" style={{ maxWidth: '1360px', margin: '0 auto', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'stretch' }}>
          <TeacherSidebar
            activeTab={teacherTab}
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
              if (['students', 'grades', 'standards', 'analytics', 'exams'].includes(tab)) fetchStudents().catch((error) => console.error('Could not refresh student data:', error));
            }}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
          <header style={{ padding: '28px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e8eaed', gap: '20px' }}>
            <div>
              <h1 style={{ margin: 0, color: '#202124', fontSize: '25px' }}>Instructor Dashboard</h1>
              <p style={{ margin: '5px 0 0', color: '#5f6368' }}>Assignments, eight class periods, DOL schedules, inclusion supports, and evidence reports</p>
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
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 13px', background: '#fff', color: '#3c4043', border: '1px solid #dadce0', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}
              >
                <span aria-hidden="true">🔍</span>
                <span>Find…</span>
                <kbd style={{ padding: '1px 5px', border: '1px solid #dadce0', borderRadius: 4, background: '#f8f9fa', color: '#5f6368', fontSize: 11, fontFamily: 'inherit' }}>⌘K</kbd>
              </button>
              {rootAdminUiEligible && <div role="group" aria-label="Root administrator workspace" style={{ display: 'inline-flex', padding: 3, borderRadius: 9, background: '#f1f3f4', border: '1px solid #dadce0' }}><button type="button" aria-pressed="true" style={{ padding: '6px 10px', border: 0, borderRadius: 6, background: '#fff', color: '#174ea6', fontWeight: 900 }}>Teacher View</button><button type="button" aria-pressed="false" onClick={() => setTeacherWorkspaceMode('administration')} style={{ padding: '6px 10px', border: 0, borderRadius: 6, background: 'transparent', color: '#3c4043', cursor: 'pointer', fontWeight: 900 }}>Administration</button></div>}
              <button onClick={handleLogout} style={{ padding: '8px 16px', background: '#fff', color: '#d93025', border: '1px solid #d93025', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Log Out</button>
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
                <h2 style={{ marginTop: 0 }}>Create and Assign</h2>
                <AssignmentIntake
                  onJsonReady={handleAssignmentJsonReady}
                  toastSuccess={toastSuccess}
                  toastError={toastError}
                  toastInfo={toastInfo}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '30px', marginBottom: '14px' }}>
                  <h2 style={{ margin: 0 }}>
                    Assignments
                    <span style={{ marginLeft: '10px', fontSize: '14px', fontWeight: 600, color: 'var(--mm-ink-muted)' }}>
                      {visibleAssignments.length} shown
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
                        <option value="" disabled style={{ color: '#202124' }}>Move to folder…</option>
                        <option value="" style={{ color: '#202124' }}>Uncategorized</option>
                        {assignmentFolderPaths.map((path) => <option key={path} value={path} style={{ color: '#202124' }}>{path}</option>)}
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
                    Select all {visibleAssignmentIds.length} shown
                  </label>
                )}

                {libraryNavigation && (libraryNavigation.folder || libraryNavigation.smartView) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '10px 14px', marginBottom: '14px', background: '#e8f0fe', border: '1px solid #aecbfa', borderRadius: '8px', color: '#174ea6', fontWeight: 'bold', fontSize: '13px' }}>
                    <span>Filtered from Library{libraryNavigation.folder ? ` · ${libraryNavigation.folder}` : ''}{libraryNavigation.smartView ? ` · ${SMART_VIEWS.find((view) => view.id === libraryNavigation.smartView)?.label || libraryNavigation.smartView}` : ''}</span>
                    <button type="button" onClick={() => setLibraryNavigation(null)} style={{ padding: '6px 10px', border: '1px solid #1a73e8', borderRadius: '6px', background: '#fff', color: '#1a73e8', fontWeight: 'bold', cursor: 'pointer' }}>Clear filter</button>
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
                {visibleAssignments.map((assignment) => {
                  const lifecycle = getAssignmentLifecycle(assignment, now);
                  const affectedStudents = allStudents.filter((student) => student.gradesByAssignment?.[assignment.id] !== undefined).length;
                  const isSelected = selectedAssignmentIds.has(assignment.id);
                  const canonicalQuestions = getStoredAssignmentQuestions(assignment);
                  const includedQuestionIndices = getIncludedQuestionIndices(assignment);
                  const hasDOL = Boolean(assignment?.dol?.enabled || canonicalQuestions.some((question) => resolveQuestionActivityRole({ question, assignment }) === 'dol'));
                  const assignmentType = getStoredAssignmentTypeProjection(assignment);
                  const assignmentVariantMode = getStoredAssignmentVariantMode(assignment);
                  const hasSectionVersions = Object.keys(getStoredSectionVariantModes(assignment)).length > 0;
                  const libraryRepair = inspectLibraryContentRepair(assignment, assignments);
                  return (
                    <article key={assignment.id} style={{ background: '#f8f9fa', padding: '18px', marginBottom: '12px', borderRadius: '10px', border: `1px solid ${isSelected ? 'var(--mm-primary)' : lifecycle.isLate ? '#f9ab00' : lifecycle.isPracticeOnly ? '#5f6368' : '#e0e3e7'}`, boxShadow: isSelected ? '0 0 0 2px var(--mm-primary-soft)' : 'none' }}>
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
                            <strong style={{ fontSize: '18px' }}>{assignment.title}</strong>
                            <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: lifecycle.isPracticeOnly ? '#f1f3f4' : lifecycle.isLate ? '#fff4ce' : '#e6f4ea', color: lifecycle.isPracticeOnly ? '#3c4043' : lifecycle.isLate ? '#7a4f00' : '#137333' }}>{lifecycle.isPracticeOnly ? 'PRACTICE ONLY' : lifecycle.status.toUpperCase()}</span>
                            <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: '#e8f0fe', color: '#174ea6' }}>{assignmentType === 'notesClasswork' ? 'NOTES / CLASSWORK' : assignmentType.toUpperCase()}</span>
                            {hasSectionVersions ? <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: '#f3e8fd', color: '#681da8' }}>SECTION VERSIONS</span> : assignmentVariantMode === 'shared' && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: '#e6f4ea', color: '#137333' }}>SHARED VERSION</span>}
                            {assignment.archived && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: '#f1f3f4', color: '#5f6368' }}>ARCHIVED</span>}
                            {/* A library item has no audience and no due date. Saying so
                                plainly is the whole point of allowing it to exist. */}
                            {isLibraryAssignment(assignment) && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: '#fef7e0', color: '#7a4f00' }}>NOT ASSIGNED</span>}
                          </div>
                          <div style={{ marginTop: '7px', color: '#5f6368', fontSize: '13px', lineHeight: 1.55 }}>{includedQuestionIndices.length} included question{includedQuestionIndices.length === 1 ? '' : 's'}{canonicalQuestions.length !== includedQuestionIndices.length ? ` · ${canonicalQuestions.length - includedQuestionIndices.length} excluded` : ''} · {isLibraryAssignment(assignment) ? 'Not assigned to a class' : `Classes: ${(assignment.assignedClassPeriods || []).join(', ')}`}<br />{isLibraryAssignment(assignment) ? 'No due date yet' : `Due ${formatDueDate(assignment)} · Late close ${formatLateDueDate(assignment)}`} · {affectedStudents} student record{affectedStudents === 1 ? '' : 's'}</div>
                        </div>
                        <AssignmentCardMenu
                          ariaLabel={`More actions for ${assignment.title}`}
                          items={[
                            { key: 'preview', label: 'View as Student', onClick: () => startTeacherPreview(assignment.id) },
                            { key: 'edit-questions', label: 'Edit Questions', onClick: () => openQuestionEditor(assignment) },
                            { key: 'edit-setup', label: 'Review / Edit Setup', onClick: () => beginEditAssignmentSetup(assignment) },
                            { key: 'export-pdf', label: 'Print / Answer Key', onClick: () => beginTeacherWorksheetExport(assignment) },
                            { key: 'export-json', label: 'Export Assignment', onClick: () => { setExportJsonAssignment(assignment); setExportJsonCopied(false); } },
                            { key: 'dates-classes', label: isLibraryAssignment(assignment) ? 'Assign to Class / Dates' : 'Dates & Classes', onClick: () => beginEditAssignmentDates(assignment) },
                            ...(libraryRepair.source && libraryRepair.questionIds.length ? [{
                              key: 'repair-library-content',
                              label: `Repair Corrupted Question${libraryRepair.questionIds.length === 1 ? '' : 's'} from Original`,
                              onClick: () => handleRepairAssignmentFromLibrary(assignment),
                            }] : []),
                            { key: 'move-folder', label: 'Move to Folder', onClick: () => { setMovingFolderAssignmentId(assignment.id); setMovingFolderValue(assignment.folder || ''); } },
                            { key: 'duplicate', label: 'Duplicate', onClick: () => handleDuplicateAssignment(assignment) },
                            { key: 'archive', label: assignment.archived ? 'Unarchive' : 'Archive', onClick: () => handleToggleArchiveAssignment(assignment) },
                            { key: 'delete', label: 'Delete', tone: 'danger', onClick: () => openDeleteDialog(assignment) },
                          ]}
                        />
                      </div>
                      {movingFolderAssignmentId === assignment.id && (
                        <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #d8dde6', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'end' }}>
                          <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Folder
                            <select value={movingFolderValue} onChange={(event) => setMovingFolderValue(event.target.value)} style={{ display: 'block', marginTop: '5px', padding: '9px', border: '1px solid #c9ced6', borderRadius: '7px', minWidth: '220px' }}>
                              <option value="">Uncategorized</option>
                              {assignmentFolderPaths.map((path) => <option key={path} value={path}>{path}</option>)}
                            </select>
                          </label>
                          <button onClick={async () => { await handleMoveAssignmentToFolder(assignment.id, movingFolderValue); setMovingFolderAssignmentId(null); }} style={{ padding: '10px 15px', background: '#188038', color: '#fff', border: 0, borderRadius: '7px', fontWeight: 'bold' }}>Save Folder</button>
                          <button onClick={() => setMovingFolderAssignmentId(null)} style={{ padding: '10px 15px', background: '#fff', border: '1px solid #c9ced6', borderRadius: '7px', fontWeight: 'bold' }}>Cancel</button>
                        </div>
                      )}
                      {editingAssignmentId === assignment.id && (
                        <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #d8dde6', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'end' }}>
                          <label style={{ fontWeight: 'bold' }}>Regular due <input type="datetime-local" value={editingAssignmentDates.dueAt} onChange={(event) => setEditingAssignmentDates((current) => ({ ...current, dueAt: event.target.value }))} style={{ display: 'block', padding: '8px', marginTop: '5px' }} /></label>
                          <label style={{ fontWeight: 'bold' }}>Final late due <input type="datetime-local" value={editingAssignmentDates.lateDueAt} onChange={(event) => setEditingAssignmentDates((current) => ({ ...current, lateDueAt: event.target.value }))} style={{ display: 'block', padding: '8px', marginTop: '5px' }} /></label>
                          {hasDOL && <label style={{ fontWeight: 'bold' }}>DOL instructional date <input type="date" value={editingAssignmentDates.dolInstructionDate || ''} onChange={(event) => setEditingAssignmentDates((current) => ({ ...current, dolInstructionDate: event.target.value }))} style={{ display: 'block', padding: '8px', marginTop: '5px' }} /></label>}
                          <div style={{ flex: '1 1 100%', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {classes.filter((entry) => entry?.status !== 'archived' && entry?.classId).map((classRecord) => {
                              const selected = editingAssignmentDates.assignedClassIds?.includes(classRecord.classId);
                              return (
                                <label key={classRecord.classId || classRecord.period} style={{ padding: '5px 8px', borderRadius: '999px', background: selected ? '#e8f0fe' : '#fff', border: '1px solid #c5d5ef', fontWeight: 'bold', fontSize: '12px' }}>
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
                          <button onClick={() => setEditingAssignmentId(null)} style={{ padding: '10px 15px', background: '#fff', border: '1px solid #c9ced6', borderRadius: '7px', fontWeight: 'bold' }}>Cancel</button>
                        </div>
                      )}
                    </article>
                  );
                })}
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
                supportOptions={supportOptions}
                assignments={assignments}
                pacingByClass={pacingByClass}
                skillOverrides={skillOverrides}
                onChangeClassPeriod={handleChangeClassPeriod}
                onUpdateStudentProfile={handleUpdateStudentProfile}
                onToggleStudentSupport={toggleStudentSupport}
                onGenerateIEPReport={openIEPReport}
                isRootAdmin={rootAdminUiEligible}
                onOpenAdministration={() => setTeacherWorkspaceMode('administration')}
                onOpenProfileDrawer={setProfileDrawerStudentId}
              />
            )}

            {teacherTab === 'home' && (
              <TeacherHome
                allStudents={allStudents}
                assignments={assignments}
                classSchedule={classSchedule}
                nowValue={now}
                presenceById={presenceById}
                onSelectPeriod={handleGoToClassFromHome}
                needsAttention={needsAttentionQueue}
                needsAttentionCompletionCoverage={Boolean(activeClass.classId) && weeklyPathProgressLoadedFor === activeClass.classId}
                learningProfilesByStudentId={teacherLearningProfiles}
                activeClassId={activeClass.classId}
                classes={classes}
                studentSupportEvents={studentSupportEvents}
                studentSessionSummaries={studentSessionSummaries}
                onRecordStudentSupportEvent={handleRecordStudentSupportEvent}
                onOpenWeeklyPath={() => setTeacherTab('weeklyPath')}
                onOpenAdministration={() => setTeacherWorkspaceMode('administration')}
                onUnlockDOL={handleUnlockDOLForClass}
                dolUnlockBusyKey={dolUnlockBusyKey}
                onToggleWarmup={handleToggleWarmupForClass}
                warmupControlBusyKey={warmupControlBusyKey}
                onToggleSectionAccess={handleToggleSectionAccessForClass}
                sectionAccessBusyKey={sectionAccessBusyKey}
                // Opening a name is a question, not a navigation. It used to
                // throw the teacher into the Gradebook, losing whatever they
                // were doing on Home.
                onOpenStudent={setProfileDrawerStudentId}
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
                onToggleWarmup={handleToggleWarmupForClass}
                warmupControlBusyKey={warmupControlBusyKey}
                onToggleSectionAccess={handleToggleSectionAccessForClass}
                sectionAccessBusyKey={sectionAccessBusyKey}
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

                {/*
                  The weekly Path grade lives in the gradebook because it IS a
                  grade — but it is a grade about a different thing from the
                  assignment scores below it, so it gets its own panel rather
                  than a column that would read as the same kind of number.
                */}
                {activeClass.classId && (
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
                  />
                )}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px', padding: '15px', borderRadius: '9px', background: '#f1f3f4' }}>
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
                  <select value={gradebookFilter.assignmentId || ''} disabled={!selectedGradebookPeriod} onChange={(event) => setGradebookFilter((current) => ({ ...current, assignmentId: event.target.value || null, student: null }))} style={{ padding: '9px', minWidth: '280px' }}><option value="">Select assignment</option>{assignmentsForSelectedClass.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}</select>
                  {gradebookFilter.student && <button onClick={() => setGradebookFilter((current) => ({ ...current, student: null }))} style={{ padding: '9px 14px' }}>Back to class list</button>}
                </div>

                {selectedAssignment && assignmentUsesTeacherReleasePolicy(selectedAssignment) && (
                  <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '20px', padding: '15px 17px', borderRadius: '9px', background: assignmentFeedbackWasReleased(selectedAssignment) ? '#e6f4ea' : '#eef4ff', border: `1px solid ${assignmentFeedbackWasReleased(selectedAssignment) ? '#9bd2aa' : '#aecbfa'}`, textAlign: 'left' }}>
                    <div>
                      <strong style={{ color: assignmentFeedbackWasReleased(selectedAssignment) ? '#137333' : '#174ea6' }}>{assignmentFeedbackWasReleased(selectedAssignment) ? 'Assessment feedback released' : 'Assessment feedback is held'}</strong>
                      <div style={{ marginTop: '4px', color: '#5f6368', fontSize: '13px' }}>{assignmentFeedbackWasReleased(selectedAssignment) ? `Students can now see correctness and grades.${selectedAssignment.feedbackReleasedAt ? ` Released ${formatTimeStamp(selectedAssignment.feedbackReleasedAt)}.` : ''}` : 'You can review scores here; students see only a neutral submitted state until you release feedback.'}</div>
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
                  <div style={{ marginBottom: 16, padding: '11px 14px', borderRadius: 9, border: '1px solid #d8dde6', background: gradebookRigor.state === COMPARABILITY.VARIED ? '#f8f0fc' : '#f8f9fa', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 900, background: gradebookRigor.state === COMPARABILITY.VARIED ? '#f3e8fd' : gradebookRigor.state === COMPARABILITY.IDENTICAL ? '#e6f4ea' : '#f1f3f4', color: gradebookRigor.state === COMPARABILITY.VARIED ? '#6f2da8' : gradebookRigor.state === COMPARABILITY.IDENTICAL ? '#137333' : '#5f6368' }}>
                      {gradebookRigor.state === COMPARABILITY.VARIED ? 'RIGOR VARIED' : gradebookRigor.state === COMPARABILITY.IDENTICAL ? 'SAME RIGOR' : 'RIGOR UNKNOWN'}
                    </span>
                    <span style={{ flex: 1, minWidth: 220, color: '#3c4043', fontSize: 12.5, lineHeight: 1.45 }}>{gradebookRigor.note}</span>
                    {gradebookRigor.state === COMPARABILITY.UNKNOWN && (
                      <button
                        type="button"
                        onClick={() => handleLoadDeliveredRigor(selectedClassStudents.map((student) => student.id))}
                        disabled={classEvidenceLoading}
                        style={{ padding: '7px 12px', border: '1px solid #dadce0', borderRadius: 8, background: '#fff', color: '#174ea6', fontWeight: 800, fontSize: 12.5, cursor: classEvidenceLoading ? 'wait' : 'pointer' }}
                      >
                        {classEvidenceLoading ? 'Reading delivery history…' : 'Check delivered rigor'}
                      </button>
                    )}
                  </div>
                )}

                {selectedGradebookPeriod && selectedAssignment && !gradebookFilter.student && (
                  <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}><thead><tr style={{ background: '#f8f9fa' }}><th style={{ padding: '12px' }}>Student</th><th>Score</th><th>Instructional condition</th><th>Activity</th><th>DOL / Classwork</th><th></th></tr></thead><tbody>{selectedClassStudents.map((student) => { const grades = student.gradesByAssignment?.[selectedAssignment.id]; const score = grades ? calculateGrade(grades, selectedAssignment) : null; const gradeSplit = splitGrade({ tracker: grades, assignment: selectedAssignment }); const gradeExplanation = grades ? explainGrade(gradeSplit) : null; const usage = student.supportUsageByAssignment?.[selectedAssignment.id] || {}; const modified = Boolean(usage.modified || usage.modifications?.length); const activity = student.assignmentActivity?.[selectedAssignment.id] || {}; const dolEntries = Object.entries(student.dolGradesByAssignment?.[selectedAssignment.id] || {}).sort(([a], [b]) => a.localeCompare(b)); const latestDol = dolEntries.at(-1)?.[1]; const classwork = student.classworkGradesByAssignment?.[selectedAssignment.id]; return <tr key={student.id} style={{ borderBottom: '1px solid #e8eaed' }}><td style={{ padding: '12px' }}><StudentNameLink studentId={student.id} studentName={formatStudentName(student)} profile={teacherLearningProfiles[student.id]} onOpen={setProfileDrawerStudentId} showBadge /><div style={{ marginTop: 3, color: '#5f6368', fontSize: 11 }}>ID {student.id}</div></td><td><strong style={{ color: modified ? '#6f2da8' : score >= 70 ? '#188038' : '#202124' }}>{score === null ? '—' : `${score}%`}</strong>{modified && <span title={`Accommodations: ${(usage.accommodations || []).join(', ') || 'none'}; Modifications: ${(usage.modifications || []).join(', ') || 'none'}`} style={{ marginLeft: '7px', padding: '3px 6px', borderRadius: '999px', background: '#efe4ff', color: '#6f2da8', fontWeight: 900, fontSize: '11px' }}>MOD</span>}
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
                        <span style={{ padding: '2px 7px', borderRadius: 999, background: '#f1f3f4', color: '#3c4043', fontSize: 10.5, fontWeight: 900 }}>
                          {gradeSplit.attempted}/{gradeSplit.total} ANSWERED
                        </span>
                        {gradeSplit.creditOnAttempted !== null && (
                          <span style={{ padding: '2px 7px', borderRadius: 999, background: '#e8f0fe', color: '#174ea6', fontSize: 10.5, fontWeight: 900 }}>
                            {gradeSplit.creditOnAttempted}% ON THOSE
                          </span>
                        )}
                      </div>
                    )}
                    {gradeExplanation && <div style={{ marginTop: 4, fontSize: 11, color: '#5f6368', lineHeight: 1.4, maxWidth: 280 }}>{gradeExplanation}</div>}</td><td style={{ fontSize: '12px' }}>{modified ? `Modified: ${(usage.modifications || []).join(', ')}` : (usage.accommodations || []).length ? `Accommodated: ${usage.accommodations.join(', ')}` : 'Standard'}</td><td style={{ fontSize: '12px', lineHeight: 1.45 }}>Total {formatTime(activity.totalTimeSeconds || 0)}<br />On time {formatTime(activity.onTimeSeconds || 0)} · Late {formatTime(activity.lateSeconds || 0)}<br />Last on-time: {formatTimeStamp(activity.lastActiveBeforeDue)}<br />Last late: {formatTimeStamp(activity.lastActiveLate)}</td><td style={{ fontSize: '12px' }}>DOL: {latestDol ? `${latestDol.score}%` : '—'}<br />Classwork: {classwork?.score ? `${classwork.score}%` : '—'}</td><td><button onClick={() => setGradebookFilter((current) => ({ ...current, student }))} disabled={!grades} style={{ padding: '8px 12px', border: 0, borderRadius: '6px', background: grades ? '#1a73e8' : '#dadce0', color: '#fff', fontWeight: 'bold' }}>Details</button></td></tr>; })}</tbody></table></div>
                )}

                {gradebookFilter.student && selectedAssignment && (() => { const student = gradebookFilter.student; const studentGrades = student.gradesByAssignment?.[selectedAssignment.id] || {}; const usage = student.supportUsageByAssignment?.[selectedAssignment.id] || {}; const activity = student.assignmentActivity?.[selectedAssignment.id] || {}; return <div><div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px', flexWrap: 'wrap', alignItems: 'center', padding: '16px', marginBottom: '18px', background: usage.modified ? '#efe4ff' : '#e8f0fe', borderRadius: '10px' }}><div><h3 style={{ margin: 0 }}>{formatStudentName(student)} · {selectedAssignment.title}</h3><div style={{ marginTop: 6 }}><StudentPerformanceBadge profile={teacherLearningProfiles[student.id]} size="small" studentName={formatStudentName(student)} /></div><div style={{ marginTop: 3, color: '#5f6368', fontSize: 12 }}>Student ID {student.id}</div><div style={{ marginTop: '5px' }}>Score: <strong>{calculateGrade(studentGrades, selectedAssignment)}%</strong> {usage.modified && <span style={{ marginLeft: '7px', padding: '3px 7px', borderRadius: '999px', background: '#6f2da8', color: '#fff', fontWeight: 900 }}>MOD</span>}</div><div style={{ marginTop: '5px', fontSize: '13px' }}>Total engagement {formatTime(activity.totalTimeSeconds || 0)} · Late engagement {formatTime(activity.lateSeconds || 0)}</div>{(() => { const delivered = describeDeliveredRigor(classEvidenceByStudentId[student.id] || [], selectedAssignment.id); if (!delivered) return null; return <div style={{ marginTop: 8, padding: '9px 11px', borderRadius: 8, background: '#fff', border: '1px solid #d8dde6' }}><div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.06em', textTransform: 'uppercase', color: '#5f6368' }}>What this student was given</div><div style={{ marginTop: 3, fontSize: 12.5, color: '#202124' }}>{delivered.summary}</div>{delivered.reasons.map((reason) => <div key={reason} style={{ marginTop: 4, fontSize: 12, color: '#5f6368', lineHeight: 1.45 }}>{reason}</div>)}</div>; })()}</div><button onClick={() => openIEPReport(student)} style={{ padding: '10px 15px', border: '1px solid #6f2da8', borderRadius: '7px', background: '#fff', color: '#6f2da8', fontWeight: 900 }}>Generate IEP Report</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '14px' }}>{getStoredAssignmentQuestions(selectedAssignment).map((question, index) => { if (!questionIsIncluded(question)) return null; const record = normalizeQuestionRecord(studentGrades[index]); const credit = Math.round(getQuestionCredit(record) * 100); return <article key={index} style={{ padding: '16px', borderRadius: '9px', background: record.status === 'correct' ? '#e6f4ea' : record.status === 'expired' && credit < 50 ? '#fce8e6' : credit >= 50 ? '#fff4ce' : '#f1f3f4', border: '1px solid rgba(0,0,0,.12)', textAlign: 'left' }}><strong>Question {index + 1} · {question.type}</strong><div style={{ margin: '8px 0', fontSize: '20px', fontWeight: 900 }}>{record.status === 'correct' ? 'Correct ✓' : record.status === 'expired' ? credit >= 50 ? `Almost · ${credit}%` : `Incorrect · ${credit}%` : `${credit}% credit`}</div><div style={{ fontSize: '12px' }}>Attempts: {record.totalAttempts} · Time: {formatTime(record.timeSpent || 0)}</div>{record.partGrades?.length > 0 && <div style={{ marginTop: '10px' }}>{record.partGrades.map((part) => <div key={part.id} style={{ fontSize: '12px', color: part.isCorrect ? '#137333' : '#b3261e' }}>{part.isCorrect ? '✓' : '●'} {part.label}</div>)}</div>}<button type="button" onClick={() => openTeacherScratchpad(student.id, selectedAssignment.id, index)} style={{ marginTop: '12px', padding: '8px 11px', border: '1px solid #aeb8c6', borderRadius: '6px', background: '#fff', color: '#174ea6', fontWeight: 'bold' }}>View Student Work</button></article>; })}</div></div>; })()}
              </div>
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
                students={(activeClass.classId ? studentsInActiveClass : allStudents)
                  .map((student) => ({ ...student, displayName: formatStudentName(student) }))}
                masteryProfilesByStudentId={teacherMasteryProfilesByStudentId}
                learningProfilesByStudentId={teacherLearningProfiles}
                onOpenStudent={setProfileDrawerStudentId}
              />
            )}

            {teacherTab === 'exams' && (
              <TeacherSecureExamDashboard students={allStudents} />
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

            {teacherTab === 'classroom' && <ClassroomManagerV2 assignments={assignments} classes={classes} students={allStudents} teacherEmail={user.email} />}

            {teacherTab === 'access' && <SignInAccess signedInEmail={user.email} mode="teacher" />}
          </div>
          </div>
        </div>
      </div>
    );
  }

  if (user.role === 'student' && activeView === 'dashboard') {
    if (studentDashboardMode === 'liveChallenge') {
      return (
        <>
          {renderStudentPackUpBanner()}
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading Live Challenge…</div>}>
          <LiveChallengeStudent
            invite={liveChallengeInvite}
            studentProfile={user.profile}
            onExit={() => setStudentDashboardMode('assignments')}
          />
          </Suspense>
        </>
      );
    }
    if (studentDashboardMode === 'mathPath') {
      return (
        <>
          {renderStudentPackUpBanner()}
          <MyMathPathApp
          studentId={user.id}
          studentName={user.displayName || user.id}
          studentProfile={adaptiveStudentProfile || user.profile}
          assignments={studentPathAssignments}
          launchTeksCode={pathLaunchTeks}
          pathOptions={studentPathOptions}
          weeklyGoalConfig={studentWeeklyGoalConfig}
          courseId={studentCourseId}
          studentRecord={studentRecord}
          onExit={() => { setPathLaunchTeks(null); setStudentDashboardMode('assignments'); }}
          />
        </>
      );
    }
    if (studentDashboardMode === 'secureExams') {
      return (
        <>
          {renderStudentPackUpBanner()}
          <StudentSecureExamDashboard
          studentProfile={user.profile}
          onExit={() => setStudentDashboardMode('assignments')}
          />
        </>
      );
    }

    const supportPresentation = getStudentSupportPresentation(user.profile);
    // Computed by a module rather than inline, so the Teacher Path Simulator
    // can build the same dashboard from a synthetic learner without a second
    // copy of this logic drifting away from it.
    const dashboard = buildStudentDashboardModel({
      assignments,
      classId: user.classId || null,
      classPeriod: user.classPeriod,
      nowValue: now,
      tracker,
      assignmentActivity,
      classworkGradesByAssignment,
      classSchedule,
      resumeAction,
      providers: {
        assignmentIsForStudent,
        getAssignmentLifecycle,
        prerequisiteAccess,
        calculateGrade,
        getDOLState,
  getWarmupState,
        getIncludedQuestionIndices,
        normalizeQuestionRecord,
        questionIsIncluded,
        assignmentHasHeldTeacherFeedback,
        matchesSmartView,
      },
    });
    // Home decides ONE thing for the student. The weekly-Path fallback is
    // omitted deliberately: this screen does not fetch Path evidence, and a
    // "your week is done" claim nobody checked is worse than not mentioning it.
    const studentNextAction = resolveNextAction({ dashboard });
    return (
      <>
        {renderStudentPackUpBanner()}
        <StudentDashboardView
        dashboard={dashboard}
        student={{ id: user.id, displayName: user.displayName, classPeriod: user.classPeriod, inclusionStatus: user.profile?.inclusionStatus }}
        supportPresentation={supportPresentation}
        onStartAssignment={startAssignment}
        onExportAssignmentPdf={exportAssignmentWorksheetPdf}
        onOpenMathPath={() => setStudentDashboardMode('mathPath')}
        onOpenSecureExams={() => setStudentDashboardMode('secureExams')}
        // The one thing this student should do next, decided by the model
        // rather than left for them to work out from six equal panels.
        nextAction={studentNextAction}
        liveChallengeInvite={liveChallengeInvite}
        onOpenLiveChallenge={() => setStudentDashboardMode('liveChallenge')}
        onLogout={handleLogout}
        recommended={{
          student: studentRecord,
          assignments: studentPathAssignments,
          courseId: studentCourseId,
          pacing: studentPacing,
          pathOptions: studentPathOptions,
          onChooseSkill: handleChooseSkill,
        }}
        />
      </>
    );
  }

  if (isStudentAssignment) {
    return renderAssignmentWorkspace(false);
  }

  return null;
}

export default App;

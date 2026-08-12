import { useEffect, useMemo, useRef, useState } from 'react';
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
import { getAssignmentByLaunchId } from './classroomApi';
import ClassroomSync from './ClassroomSync';
import AssignmentQuestionEditor from './AssignmentQuestionEditor';
import QuestionEngine from './QuestionEngine';
import {
  emptyQuestionRecord,
  getQuestionCardState,
  getQuestionCredit,
  normalizeQuestionRecord,
  recordQuestionAttempt,
  recordQuestionStep,
  requestReplacementQuestion,
} from './attemptPolicy';
import {
  parseAssignmentBlueprintText,
  validateAssignmentQuestions,
  normalizeAssignmentPackageMetadata,
  assertFirestoreSafeAssignmentPayload,
} from './assignmentBlueprint';
import AssignmentIntake from './AssignmentIntake';
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
  getDOLState,
  normalizeSchedule,
  prerequisiteAccess,
  recordAssignmentActivity,
  resolveDOLQuestionIndex,
  getIncludedQuestionIndices,
  questionIsIncluded,
} from './assignmentLifecycle';
import { HEARTBEAT_INTERVAL_MS, buildLiveStatus, encodeQuestionStates } from './livePresence';
import { getQuestionRepresentation } from './platform/contract/questionTypeCatalog';
import {
  buildIEPReportHtml,
  buildSupportUsage,
  getStudentSupportPresentation,
  normalizeStudentProfile,
} from './studentSupport';
import TeacherSidebar from './TeacherSidebar';
import AssignmentLibrary from './AssignmentLibrary';
import AssignmentCardMenu from './AssignmentCardMenu';
import ClassesWorkspace from './ClassesWorkspace';
import TeacherHome from './TeacherHome';
import TexasStandardsDashboard from './TexasStandardsDashboard';
import MathToolsLab from './dev/MathToolsLab';
import { useToast } from './ui/Toast';
import { EmptyState, ProgressBar, SearchField, StatCard } from './ui/primitives';
import { buildStudentMasteryProfile } from './masteryEngine.js';
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
import { normalizeLessonBundle } from './platform/schemas/BundleDefinition';
import { normalizeLabDefinition } from './platform/labs/labDefinitionSchema.js';
import { buildAttemptEvidenceEvent } from './platform/history/evidenceEvent.js';
import { writeImmutableEvidenceEvent } from './platform/history/evidencePersistence.js';
import MyMathPathApp from './components/student/MyMathPathApp.jsx';
import StudentSecureExamDashboard from './components/assessment/StudentSecureExamDashboard.jsx';
import TeacherSecureExamDashboard from './components/assessment/TeacherSecureExamDashboard.jsx';
import TeacherAnalyticsDashboard from './components/analytics/TeacherAnalyticsDashboard.jsx';
import DemoExperience from './components/demo/DemoExperience.jsx';
import StudentsRoster from './components/teacher/StudentsRoster.jsx';
import ClassCourseSettings from './components/teacher/ClassCourseSettings.jsx';
import PathSimulator from './components/teacher/PathSimulator.jsx';
import PacingControls from './components/teacher/PacingControls.jsx';
import RecommendedSkills from './components/student/RecommendedSkills.jsx';
import { teksCodeFromSkillId } from './platform/path/skillGraph.js';
import { buildStudentPathOptions } from './platform/path/studentPathOptions.js';
import { buildStudentDashboardModel } from './studentDashboardModel.js';
import StudentDashboardView from './components/student/StudentDashboardView.jsx';
import {
  ROUTE_EVENTS, buildRouteEvent, fetchClassPacing, fetchSkillOverrides,
  logRouteEvent, normalizePacingByClass, overridesForClass, saveClassPacing, saveSkillOverrides,
} from './platform/path/pathStore.js';
import SignInAccess from './SignInAccess.jsx';
import ClassesAdmin from './components/admin/ClassesAdmin.jsx';
import PathCoverageAudit from './components/teacher/PathCoverageAudit.jsx';
import PromoteToPathBank from './components/teacher/PromoteToPathBank.jsx';
import { resolveStudentCourseContext } from '../functions/shared/classModel.mjs';
import {
  buildHonorsEnrichmentQuestion,
  defaultCourseProfiles,
  inspectHonorsRigor,
  normalizeCourseProfiles,
  splitClassPeriodsByRigor,
} from './platform/rigor/courseRigor.js';
import LoginScreen from './LoginScreen.jsx';
import { useAuth } from './auth/AuthProvider.jsx';

const ROOT_ADMIN_EMAIL = 'matthew.hawkins@desotoisd.org';


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
  (assignment?.questions || []).some((question) => {
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
  const [promoteAssignment, setPromoteAssignment] = useState(null);
  // Who is looking, and at which classes. Read by fetchStudents, which runs
  // during sign-in before `user` state exists.
  const viewerRef = useRef({ email: null, isRootAdmin: false });
  const classesRef = useRef([]);
  const [homeNavigationPeriod, setHomeNavigationPeriod] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  // Live presence for the teacher home grid, keyed by student id. Never stored
  // alongside grades and never read outside the live view.
  const [presenceById, setPresenceById] = useState({});
  // Curriculum pacing and per-class skill overrides. Teacher-owned inputs to
  // the adaptive path engine, read by the student's Path, Recommended for You
  // and CCMR — a change here changes what a student is offered.
  const [pacingByClass, setPacingByClass] = useState({});
  const [skillOverrides, setSkillOverrides] = useState([]);
  const [pacingBusy, setPacingBusy] = useState(false);
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
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
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
  const [editingAssignmentDates, setEditingAssignmentDates] = useState({ dueAt: '', lateDueAt: '', assignedClassPeriods: [] });
  const [questionEditorAssignment, setQuestionEditorAssignment] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [assignmentFolderPaths, setAssignmentFolderPaths] = useState([]);
  const [libraryNavigation, setLibraryNavigation] = useState(null);
  const [movingFolderAssignmentId, setMovingFolderAssignmentId] = useState(null);
  const [movingFolderValue, setMovingFolderValue] = useState('');
  const [feedbackReleaseBusyId, setFeedbackReleaseBusyId] = useState(null);
  const [studentDashboardMode, setStudentDashboardMode] = useState('assignments');
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

  useEffect(() => {
    if (!pendingLaunchAssignmentId) return;
    if (user?.role !== 'student') return;
    if (!assignments.some((assignment) => assignment.id === pendingLaunchAssignmentId)) return;
    startAssignment(pendingLaunchAssignmentId);
    setPendingLaunchAssignmentId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLaunchAssignmentId, user, assignments]);

  // Holds the normalized text of the JSON currently in preflight. Nothing edits
  // it by hand any more; it exists so publishing can re-parse exactly what the
  // teacher reviewed.
  const [newAssignmentJSON, setNewAssignmentJSON] = useState('');
  const [assignmentPreflight, setAssignmentPreflight] = useState(null);
  const [assignmentPreflightBusy, setAssignmentPreflightBusy] = useState(false);

  const [gradebookFilter, setGradebookFilter] = useState({
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
  const activeTimeRef = useRef(0);
  const pendingAssignmentSecondsRef = useRef(0);
  const lastDOLStatusRef = useRef({});
  // One "your exit ticket just opened" toast per assignment per period.
  const dolOpenAnnouncedRef = useRef({});

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(clock);
  }, []);

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
      },
      (error) => console.error('Assignment live update failed:', error),
    );

    return unsubscribe;
  }, [user]);

  // Pacing and overrides are advisory: a failure here must not stop a teacher
  // signing in, so it degrades to defaults rather than rejecting the login.
  const fetchPathSettings = async () => {
    try {
      const [pacing, overrides] = await Promise.all([fetchClassPacing(), fetchSkillOverrides()]);
      setPacingByClass(pacing);
      setSkillOverrides(overrides);
    } catch (error) {
      console.error('Could not load curriculum pacing:', error);
    }
  };

  // Inputs for the student's independent path. Students read pacing and
  // overrides (settings/ is student-readable); they never write them.
  const studentPacing = useMemo(() => {
    if (user?.role !== 'student' || !user.classPeriod) return null;
    // No entry means the teacher has not set a position for this class, and
    // the panel stays hidden rather than recommending from a placeholder
    // calendar nobody has confirmed.
    return normalizePacingByClass(pacingByClass)[user.classPeriod] || null;
  }, [user, pacingByClass]);

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
  const studentPathOptions = useMemo(() => (
    studentPacing
      ? buildStudentPathOptions({
        student: studentRecord,
        assignments,
        courseId: studentCourseId,
        pacing: studentPacing,
        teacherOverrides: overridesForClass(skillOverrides, user?.classPeriod),
      })
      : null
  ), [studentRecord, assignments, studentCourseId, studentPacing, skillOverrides, user]);

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
      .map((studentDoc) => ({ id: studentDoc.id, ...studentDoc.data(), profile: normalizeStudentProfile(studentDoc.data()?.profile || studentDoc.data()) }));

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
        setUser({
          id: studentId,
          uid: session.uid,
          role: 'student',
          email: session.email,
          displayName: session.displayName || studentId,
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
    setGradebookFilter({ classPeriod: '', assignmentId: null, student: null });
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
    if (!assignmentTracker || !assignmentData?.questions?.length) return 0;
    const included = getIncludedQuestionIndices(assignmentData);
    if (!included.length) return 0;
    const earnedCredit = included.reduce(
      (total, index) => total + getQuestionCredit(assignmentTracker?.[index]),
      0,
    );
    return Math.round((earnedCredit / included.length) * 100);
  };

  const calculatePracticeProgress = (assignmentTracker, assignmentData) => {
    if (!assignmentTracker || !assignmentData?.questions?.length) {
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
  const activeLifecycle = getAssignmentLifecycle(activeAssignmentData, now);
  const isTeacherPreview = user?.role === 'teacher' && activeView === 'teacherPreview';
  const isStudentAssignment = user?.role === 'student' && activeView === 'assignment';
  const isPracticeMode = isStudentAssignment && activeLifecycle.isPracticeOnly;
  const activeSupportPresentation = getStudentSupportPresentation(user?.profile);
  const activeDOLState = getDOLState({ assignment: activeAssignmentData, schedule: classSchedule, classPeriod: user?.classPeriod, nowValue: now });
  const activeQuestionRole = resolveQuestionActivityRole({
    question: activeAssignmentData?.questions?.[currentQuestionIndex],
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
    if (!activeAssignmentData?.questions?.length) return;
    const included = getIncludedQuestionIndices(activeAssignmentData);
    if (!included.length) return;
    if (!included.includes(currentQuestionIndex)) setCurrentQuestionIndex(included[0]);
  }, [activeAssignmentData, currentQuestionIndex]);

  useEffect(() => {
    if (!isStudentAssignment || !activeAssignmentId || isPracticeMode) return undefined;
    const interval = window.setInterval(() => {
      flushAssignmentActivity(activeAssignmentId).catch((error) => console.error(error));
    }, 30000);
    return () => window.clearInterval(interval);
  }, [isStudentAssignment, activeAssignmentId, isPracticeMode, assignmentActivity, tracker, classworkGradesByAssignment]);


  // Live class monitoring. The student's client publishes a tiny snapshot of
  // where it is — assignment, question, per-question progress — onto its own
  // grades document, which teachers can already read. No new collection, no
  // rules change, no stored history: the field is overwritten each heartbeat
  // and cleared when the student leaves the assignment.
  useEffect(() => {
    if (user?.role !== 'student' || !user.id) return undefined;

    // A dedicated presence document rather than a field on the grades doc:
    // teachers stream this collection continuously, and a grades document
    // carries a student's whole history, so putting a 20-second heartbeat on
    // it would re-send all of that to every watching teacher each time.
    const presenceRef = doc(db, 'presence', user.id);
    const clearLiveStatus = () => {
      deleteDoc(presenceRef).catch(() => { /* sign-out races are not worth reporting */ });
    };

    if (!isStudentAssignment || !activeAssignmentId || !activeAssignmentData) {
      clearLiveStatus();
      return undefined;
    }

    if (liveStartedAtRef.current.assignmentId !== activeAssignmentId) {
      liveStartedAtRef.current = { assignmentId: activeAssignmentId, at: Date.now() };
    }

    const publish = () => {
      const included = getIncludedQuestionIndices(activeAssignmentData);
      const question = activeAssignmentData.questions?.[currentQuestionIndex];
      const record = normalizeQuestionRecord(activeWorkingTracker?.[currentQuestionIndex]);
      const payload = buildLiveStatus({
        assignmentId: activeAssignmentId,
        assignmentTitle: activeAssignmentData.title,
        activityRole: activeQuestionRole,
        questionIndex: Math.max(0, included.indexOf(currentQuestionIndex)),
        questionCount: included.length,
        questionLabel: String(question?.prompt || '').slice(0, 80),
        representation: getQuestionRepresentation(question),
        questionStates: encodeQuestionStates(activeWorkingTracker, included),
        currentAttempts: record.attemptCount,
        // The idle timer already tracks real interaction — mouse, keys,
        // clicks — so the live grid and the time-on-task accounting agree
        // about what "working" means.
        lastInteractionAt: lastActivityRef.current,
        startedAt: liveStartedAtRef.current.at,
      });
      setDoc(presenceRef, {
        studentId: user.id,
        name: user.name || user.id,
        classPeriod: user.classPeriod || '',
        ...payload,
      }).catch(() => { /* a missed heartbeat self-heals on the next one */ });
    };

    publish();
    const interval = window.setInterval(publish, HEARTBEAT_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      clearLiveStatus();
    };
  }, [
    user, isStudentAssignment, activeAssignmentId, activeAssignmentData,
    currentQuestionIndex, activeWorkingTracker, activeQuestionRole,
  ]);

  // Teachers stream presence only while the live grid is on screen, so a
  // teacher sitting on Grades or Analytics is not paying for a listener.
  useEffect(() => {
    if (user?.role !== 'teacher' || teacherTab !== 'home') return undefined;
    return onSnapshot(
      collection(db, 'presence'),
      (snapshot) => {
        setPresenceById(Object.fromEntries(snapshot.docs.map((presenceDoc) => [
          presenceDoc.id,
          presenceDoc.data(),
        ])));
      },
      (error) => console.error('Live class update failed:', error),
    );
  }, [user, teacherTab]);

  // The DOL banner already appears once the window opens, but a student heads
  // down at their work never sees it change. Announce the transition once.
  useEffect(() => {
    if (user?.role !== 'student' || !isStudentAssignment) return;
    const key = `${activeAssignmentId}:opened`;
    if (activeDOLState.status !== 'active') {
      if (dolOpenAnnouncedRef.current[key] && activeDOLState.status === 'ended') {
        delete dolOpenAnnouncedRef.current[key];
      }
      return;
    }
    if (dolOpenAnnouncedRef.current[key]) return;
    dolOpenAnnouncedRef.current[key] = true;
    toastInfo(
      'Your exit ticket is open',
      `Question ${activeDOLState.questionIndex + 1} is the DOL. You get one attempt and it closes when the period ends.`,
    );
  }, [activeDOLState.status, activeDOLState.questionIndex, activeAssignmentId, isStudentAssignment, user, toastInfo]);

  useEffect(() => {
    if (user?.role !== 'student' || !user.classPeriod) return;
    const date = new Date(now);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const updates = {};
    assignments.forEach((assignment) => {
      if (!assignmentIsForStudent(assignment, user.classPeriod)) return;
      const dolState = getDOLState({ assignment, schedule: classSchedule, classPeriod: user.classPeriod, nowValue: now });
      const previousStatus = lastDOLStatusRef.current[assignment.id];
      lastDOLStatusRef.current[assignment.id] = dolState.status;
      if (dolState.status !== 'ended') return;
      if (dolGradesByAssignment?.[assignment.id]?.[dateKey]?.finalized) return;
      if (previousStatus && !['active', 'waiting', 'beforeClass'].includes(previousStatus)) return;
      const questionIndex = dolState.questionIndex;
      const record = normalizeQuestionRecord(tracker?.[assignment.id]?.[questionIndex]);
      updates[assignment.id] = {
        ...(dolGradesByAssignment?.[assignment.id] || {}),
        [dateKey]: {
          finalized: true,
          score: Math.round(getQuestionCredit(record) * 100),
          questionIndex,
          recordedAt: new Date().toISOString(),
          status: record.status,
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
      }
    }, 1000);

    return () => {
      window.removeEventListener('mousemove', resetActivity);
      window.removeEventListener('keydown', resetActivity);
      window.removeEventListener('click', resetActivity);
      window.clearInterval(interval);
    };
  }, [user, activeView, isIdle, activeSupportPresentation.disableIdleTimer]);

  const changeQuestion = async (newIndex) => {
    if (!activeAssignmentId || newIndex === currentQuestionIndex) return;
    const localAssignment = assignments.find((item) => item.id === activeAssignmentId);
    if (localAssignment?.questions && !questionIsIncluded(localAssignment.questions[newIndex])) return;

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

    const dolState = getDOLState({ assignment, schedule: classSchedule, classPeriod: user.classPeriod, nowValue: Date.now() });
    if (!getAssignmentLifecycle(assignment, Date.now()).isClosed && newIndex === dolState.questionIndex && dolState.enabled && !['active', 'ended'].includes(dolState.status)) {
      toastInfo('DOL not open yet', 'The DOL question opens during the final minutes of this class period. Keep working the practice questions until the DOL banner appears.');
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

  const startAssignment = (assignmentId, requestedQuestionIndex = 0) => {
    const assignmentData = assignments.find(
      (assignment) => assignment.id === assignmentId,
    );
    if (!assignmentData?.questions) return;
    if (user?.role === 'student' && !assignmentIsForStudent(assignmentData, user.classPeriod)) {
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
    lastActivityRef.current = Date.now();
    pendingAssignmentSecondsRef.current = 0;
    setIsIdle(false);

    if (lifecycle.isPracticeOnly) {
      setPracticeTracker((current) => ({
        ...current,
        [assignmentId]: current[assignmentId] || createPracticeAssignmentTracker(
          assignmentData.questions,
          tracker[assignmentId] || {},
        ),
      }));
      pendingAssignmentSecondsRef.current = 0;
    } else if (!tracker[assignmentId]) {
      setTracker((current) => ({
        ...current,
        [assignmentId]: createEmptyAssignmentTracker(assignmentData.questions),
      }));
    }

    setActiveView('assignment');
  };

  const startTeacherPreview = (assignmentId) => {
    const assignmentData = assignments.find(
      (assignment) => assignment.id === assignmentId,
    );
    if (!assignmentData?.questions) return;

    setActiveAssignmentId(assignmentId);
    setCurrentQuestionIndex(getIncludedQuestionIndices(assignmentData)[0] ?? 0);
    setPreviewTracker(createEmptyAssignmentTracker(assignmentData.questions));
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
        maximumAttempts: activeActivityPolicy.attempts,
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
        || createPracticeAssignmentTracker(localAssignment?.questions || [], tracker[activeAssignmentId] || {});
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
    const dolState = getDOLState({ assignment, schedule: classSchedule, classPeriod: user.classPeriod, nowValue: Date.now() });
    if (activeQuestionRole === 'dol' && dolState.status === 'active' && currentQuestionIndex === dolState.questionIndex) {
      const date = new Date();
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      updatedDOLGrades = {
        ...dolGradesByAssignment,
        [activeAssignmentId]: {
          ...(dolGradesByAssignment?.[activeAssignmentId] || {}),
          [dateKey]: {
            finalized: false,
            score: outcome.result.isCorrect ? 100 : Math.round(Number(outcome.result.partialCredit) || 0),
            questionIndex: currentQuestionIndex,
            recordedAt: new Date().toISOString(),
            status: outcome.record.status,
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
      if (assignment.questions?.[currentQuestionIndex]?.type !== 'modelingLab') {
        const evidenceEvent = buildAttemptEvidenceEvent({
          studentId: user.id,
          assignment,
          question: assignment.questions?.[currentQuestionIndex],
          questionIndex: currentQuestionIndex,
          activityRole: activeQuestionRole,
          attemptRecord: outcome.record,
          attemptResult: outcome.result,
          supportUsage: outcome.record.supportUsage || supportUsage || {},
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
    const supportUsage = providedSupportUsage || buildSupportUsage(user?.profile, activeAssignmentData?.questions?.[currentQuestionIndex]);
    const applyStep = (record) =>
      recordQuestionStep({
        record,
        stepGrade,
        countsAttempt,
        statePatch,
        supportUsage,
        maximumAttempts: activeActivityPolicy.attempts,
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
        || createPracticeAssignmentTracker(localAssignment?.questions || [], tracker[activeAssignmentId] || {});
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
        || createPracticeAssignmentTracker(localAssignment?.questions || [], tracker[activeAssignmentId] || {});
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

  // Reads authored JSON of any accepted vintage and reports what is wrong in
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
      validateAssignmentQuestions(parsed.questions, { variantMode: parsed.assignment?.variantMode });
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

    const metadata = parsed.isPackage
      ? normalizeAssignmentPackageMetadata(parsed.assignment, parsed.questions)
      : null;
    return { ok: true, errors, warnings, parsed: { ...parsed, metadata }, sourceSchemaVersion: parsed.sourceSchemaVersion || null, compilerDefect: false };
  };

  const buildPreflightBundle = (parsed, metadata) => {
    if (parsed.isBundle && parsed.bundleSource) return normalizeLessonBundle(parsed.bundleSource);

    const activityGroups = new Map();
    parsed.questions.forEach((question, questionIndex) => {
      const isDOL = Boolean(metadata?.dol?.enabled && Number(metadata?.dol?.questionIndex) === questionIndex);
      const role = resolveQuestionActivityRole({
        question,
        assignment: { assignmentType: metadata?.assignmentType || 'practice' },
        isDOL,
      });
      if (!activityGroups.has(role)) {
        activityGroups.set(role, {
          role,
          title: activityTitleForRole(role),
          questions: [],
        });
      }
      activityGroups.get(role).questions.push(question);
    });

    return normalizeLessonBundle({
      lessonMetadata: {
        title: metadata?.title || 'Untitled Lesson',
        course: metadata?.curriculum?.course || 'Unknown Course',
        topic: metadata?.curriculum?.topic || null,
      },
      activities: [...activityGroups.values()],
    });
  };

  // The teacher sets classes, dates, folder and publishing here — the JSON never
  // carries them, so there are no manual fallbacks to merge any more.
  const openAssignmentPreflight = (inspected, sourceName) => {
    try {
      const { metadata } = inspected;
      const lessonBundle = buildPreflightBundle(inspected, metadata);
      const dolQuestionFromRole = inspected.questions.findIndex((question) => (
        resolveQuestionActivityRole({ question, assignment: { assignmentType: metadata?.assignmentType || 'practice' } }) === 'dol'
      ));
      const initialDraft = {
        title: metadata?.title || lessonBundle.lessonMetadata?.title || '',
        folder: metadata?.folder || '',
        dueAt: toDateTimeLocalInputValue(metadata?.dueAt || ''),
        lateDueAt: toDateTimeLocalInputValue(metadata?.lateDueAt || ''),
        releaseAt: toDateTimeLocalInputValue(metadata?.releaseAt || ''),
        assignmentType: metadata?.assignmentType || 'practice',
        variantMode: metadata?.variantMode || 'personalized',
        assignedClassPeriods: [...(metadata?.assignedClassPeriods || [])],
        dolEnabled: metadata?.dol?.enabled ?? lessonBundle.activities.some((activity) => activity.role === 'dol'),
        dolMinutesBeforeEnd: metadata?.dol?.minutesBeforeEnd ?? 10,
        dolQuestionIndex: Number.isInteger(metadata?.dol?.questionIndex)
          ? metadata.dol.questionIndex
          : dolQuestionFromRole >= 0 ? dolQuestionFromRole : null,
        publicationStrategy: 'hybrid',
        includeWarmupInClassroom: false,
        homeworkDueAt: '',
      };
      setAssignmentPreflight({
        lessonBundle,
        initialDraft,
        questions: inspected.questions,
        authoringWarnings: inspected.authoringWarnings || [],
        sourceLabel: `${sourceName || 'Pasted JSON'} · ${inspected.isBundle ? 'Bundle V3' : inspected.isPackage ? `Package V${inspected.schemaVersion}` : 'Legacy array'}`,
      });
      return true;
    } catch (error) {
      return { error: error.message };
    }
  };

  // Single entry point for pasted, uploaded and dropped JSON.
  const handleAssignmentJsonReady = async ({ text, sourceName }) => {
    const result = readAssignmentJson(text);
    if (!result.ok) return result;
    setNewAssignmentJSON(result.parsed.normalizedText);
    const opened = openAssignmentPreflight({ ...result.parsed, authoringWarnings: result.warnings }, sourceName);
    if (opened !== true) {
      return { ok: false, errors: [opened?.error || 'Could not build the preflight review from this JSON.'], warnings: result.warnings, sourceSchemaVersion: result.sourceSchemaVersion, compilerDefect: false };
    }
    return { ok: true, warnings: result.warnings, repairs: result.parsed.repairs || [] };
  };


  const resolvePackagePrerequisiteId = (metadata) => {
    if (!metadata) return null;
    if (metadata.prerequisiteAssignmentId) return metadata.prerequisiteAssignmentId;
    if (metadata.prerequisiteTitle) {
      const match = assignments.find(
        (assignment) => String(assignment.title || '').trim().toLowerCase() === metadata.prerequisiteTitle.toLowerCase(),
      );
      if (!match) {
        throw new Error(`Prerequisite assignment "${metadata.prerequisiteTitle}" was not found. Create it first, use its prerequisiteAssignmentId, or remove the prerequisite from the package.`);
      }
      return match.id;
    }
    return null;
  };

  const handleCreateAssignment = async (event, overrideVariantMode, teacherReview = null) => {
    if (event?.preventDefault) event.preventDefault();

    try {
      const parsed = parseAssignmentBlueprintText(newAssignmentJSON);
      const packageMetadata = parsed.isPackage
        ? normalizeAssignmentPackageMetadata(parsed.assignment, parsed.questions)
        : null;

      const title = String(teacherReview?.title ?? packageMetadata?.title ?? '').trim();
      const dueValue = teacherReview ? teacherReview.dueAt : packageMetadata?.dueAt || '';
      const lateDueValue = teacherReview ? teacherReview.lateDueAt : packageMetadata?.lateDueAt || '';
      const releaseValue = teacherReview ? teacherReview.releaseAt : packageMetadata?.releaseAt || '';
      const assignmentType = teacherReview?.assignmentType || packageMetadata?.assignmentType || 'practice';
      const requestedVariantMode = teacherReview?.variantMode || packageMetadata?.variantMode || 'personalized';
      const variantMode = overrideVariantMode || requestedVariantMode;
      const assignedClassPeriods = teacherReview
        ? [...(teacherReview.assignedClassPeriods || [])]
        : [...(packageMetadata?.assignedClassPeriods || CLASS_PERIODS)];
      // A teacher-reviewed creation says exactly which classes it goes to,
      // including none. Only the no-review path falls back to every period.

      // Two paths from here, decided by one predicate: no classes means Save to
      // Library, which needs a title and nothing else. Selecting a class turns
      // it into Create & Assign, and the due date becomes required.
      const creationMode = resolveCreationMode({ assignedClassPeriods });

      if (!title) {
        throw new Error('Assignment title is missing. Add a title in the preflight review before publishing.');
      }

      // Throws with the teacher-facing message when an assigned creation is
      // missing its date, and returns nulls for a library save rather than
      // inventing a due date nobody chose.
      const { dueAt, lateDueAt, dueDate, releaseAt } = resolveAssignmentDates({
        mode: creationMode,
        dueValue,
        lateDueValue,
        releaseValue,
      });

      const parsedQuestions = normalizeAssignmentQuestions(
        validateAssignmentQuestions(parsed.questions, { variantMode }),
      );

      const prerequisiteAssignmentId = resolvePackagePrerequisiteId(packageMetadata);
      let dolQuestionIndex = null;
      let dolEnabled = assignmentType === 'practice' && (teacherReview ? teacherReview.dolEnabled === true : Boolean(packageMetadata?.dol?.enabled));
      let dolMinutesBeforeEnd = Math.max(1, Number(teacherReview ? teacherReview.dolMinutesBeforeEnd : packageMetadata?.dol?.minutesBeforeEnd) || 10);

      if (teacherReview) {
        dolQuestionIndex = Number.isInteger(Number(teacherReview.dolQuestionIndex))
          ? Number(teacherReview.dolQuestionIndex)
          : null;
      } else if (packageMetadata?.provided?.dol) {
        dolEnabled = packageMetadata.dol.enabled;
        dolMinutesBeforeEnd = packageMetadata.dol.minutesBeforeEnd;
        dolQuestionIndex = packageMetadata.dol.questionIndex;
        if (packageMetadata.dol.questionId) {
          const matchedIndex = parsedQuestions.findIndex(
            (question) => question.questionId === packageMetadata.dol.questionId || question.id === packageMetadata.dol.questionId,
          );
          if (matchedIndex < 0) throw new Error(`DOL questionId "${packageMetadata.dol.questionId}" was not found in the package questions.`);
          dolQuestionIndex = matchedIndex;
        }
      } else {
        dolQuestionIndex = Number.isInteger(packageMetadata?.dol?.questionIndex)
          ? packageMetadata.dol.questionIndex
          : null;
      }

      if (Number.isInteger(dolQuestionIndex)) {
        dolQuestionIndex = Math.max(0, Math.min(parsedQuestions.length - 1, dolQuestionIndex));
      } else {
        dolQuestionIndex = null;
      }

      const folder = teacherReview
        ? normalizeFolderPath(teacherReview.folder) || null
        : normalizeFolderPath(packageMetadata?.folder) || null;
      const completionRule = packageMetadata?.provided?.completionRule
        ? packageMetadata.completionRule
        : assignmentType === 'notesClasswork'
          ? { minEngagementMinutes: 10, minimumQuestionCompletionPercent: 80 }
          : null;

      if (packageMetadata?.assignmentKey && assignments.some((assignment) => (
        assignment.assignmentKey === packageMetadata.assignmentKey
        || String(assignment.assignmentKey || '').startsWith(`${packageMetadata.assignmentKey}:`)
      ))) {
        throw new Error(`An assignment with assignmentKey "${packageMetadata.assignmentKey}" already exists. Change or remove assignment.assignmentKey if you intend to create a separate copy.`);
      }

      const assignmentPayloadBase = {
        title,
        dueAt,
        lateDueAt,
        dueDate,
        assignmentType,
        variantMode,
        releaseAt,
        prerequisiteAssignmentId,
        completionRule,
        dol: {
          enabled: assignmentType === 'practice' && dolEnabled,
          minutesBeforeEnd: dolMinutesBeforeEnd,
          questionIndex: dolQuestionIndex,
        },
        folder,
        assignmentPackageSchemaVersion: parsed.isPackage ? parsed.schemaVersion : 1,
        assignmentTemplate: packageMetadata?.template || null,
        standards: packageMetadata?.standards || [],
        curriculum: packageMetadata?.curriculum || null,
        lessonBundleId: parsed.isBundle ? parsed.bundleSource?.bundleId || null : null,
        publicationSettings: teacherReview ? {
          strategy: teacherReview.publicationStrategy || 'hybrid',
          includeWarmupInClassroom: teacherReview.includeWarmupInClassroom === true,
          homeworkDueAt: teacherReview.homeworkDueAt ? new Date(teacherReview.homeworkDueAt).toISOString() : null,
        } : null,
        createdAt: new Date(),
      };

      if (folder && !assignmentFolderPaths.includes(folder)) {
        await saveAssignmentFolderPaths([...assignmentFolderPaths, folder]);
      }

      const bundleLabs = parsed.isBundle
        ? (parsed.bundleSource?.activities || []).filter((activity) => activity?.labDefinition || activity?.isModelingLab)
        : [];
      const privateLabsById = new Map(bundleLabs.map((activity) => {
        const definition = normalizeLabDefinition(activity.labDefinition || activity, { includeEvaluation: true });
        return [definition.labId, { definition, activity }];
      }));

      // Extracted so assigning a library item later runs the same split rather
      // than a second copy of it. A library save returns [] here, which is the
      // correct answer: nobody has been given it, so there is nothing to split.
      const destinationGroups = buildDestinationGroups({ assignedClassPeriods, courseProfiles });
      const sourceHonorsReport = inspectHonorsRigor(parsedQuestions, { allowNarrowCheckpoint: true });
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
            if (bundleLabs.length) throw new Error(`Modeling lab ${originalLabId} could not be matched to its private Bundle V3 definition.`);
            return question;
          }
          const nextLabId = `${originalLabId}-${labSuffix}`;
          if (privateSource) privateLabWrites.push({ nextLabId, ...privateSource });
          return { ...question, labDefinition: { ...question.labDefinition, labId: nextLabId } };
        });
        const payload = {
          ...assignmentPayloadBase,
          assignedClassPeriods: destination.periods,
          questions: variantQuestions,
          courseProfile: { course: destination.course, courseLevel: destination.courseLevel },
          rigorVariant: destination.courseLevel,
          rigorVariantGroupId: splitVariantGroupId,
          assignmentKey: destinationAssignmentKey({
            assignmentKey: packageMetadata?.assignmentKey,
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
      };

      const destinationVariants = destinationGroups.map((destination) => {
        let destinationQuestions = parsedQuestions;
        if (destination.courseLevel === 'honors') {
          let enrichmentQuestion = null;
          if (!sourceHonorsReport.isHonorsReady) {
            if (!teacherReview?.honorsEnrichmentQuestion) {
              throw new Error('This Honors destination does not yet meet the Honors rigor/CCMR contract. Return to preflight and choose Build Honors Enrichment.');
            }
            enrichmentQuestion = destination.course === courseProfiles?.[splitClassPeriodsByRigor(assignedClassPeriods, courseProfiles).honors[0]]?.course
              ? teacherReview.honorsEnrichmentQuestion
              : buildHonorsEnrichmentQuestion({ questions: parsedQuestions, course: destination.course });
          }
          destinationQuestions = normalizeAssignmentQuestions([
            ...parsedQuestions,
            ...(enrichmentQuestion ? [enrichmentQuestion] : []),
          ]);
          const finalHonorsReport = inspectHonorsRigor(destinationQuestions, { allowNarrowCheckpoint: true });
          if (!finalHonorsReport.isHonorsReady) throw new Error(`Honors preflight is still missing: ${finalHonorsReport.missing.join(', ')}.`);
          validateAssignmentQuestions(destinationQuestions, { variantMode, allowFixed: variantMode === 'shared' });
        }
        return { destination, questions: destinationQuestions };
      });

      if (creationMode === 'library') {
        // ONE canonical document, deliberately without a course/rigor variant.
        // Choosing a destination now would be guessing: the teacher has not said
        // which classes get it, and materialising a Standard variant today would
        // be wrong the moment they assign it to an Honors class. The split runs
        // when the assignment is actually assigned, through the same helper.
        await writeAssignmentVariant({
          destination: { course: null, courseLevel: null, periods: [] },
          questions: parsedQuestions,
        });
      } else {
        for (const variant of destinationVariants) {
          // Sequential writes keep the destination variants and their private lab
          // definitions easy to audit. A normal assignment creates one group.
          // eslint-disable-next-line no-await-in-loop
          await writeAssignmentVariant(variant);
        }
      }

      // The intake is stateless now — closing preflight and clearing the held
      // JSON is the whole reset.
      setAssignmentPreflight(null);
      setNewAssignmentJSON('');
      await fetchAssignments();
      const repairMessage = parsed.repairs.length
        ? `\n\nPaste formatting repaired automatically: ${parsed.repairs.join('; ')}.`
        : '';
      const sourceMessage = parsed.isBundle ? 'Created from Lesson Bundle V3 JSON after teacher pre-flight review.' : parsed.isPackage ? 'Created from Assignment Package JSON.' : 'Created from legacy question-array JSON.';
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

  const confirmAssignmentPreflight = async ({ draft }) => {
    setAssignmentPreflightBusy(true);
    try {
      await handleCreateAssignment(null, null, draft);
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
    validateAssignmentQuestions(included, {
      variantMode: questionEditorAssignment.variantMode,
      allowFixed: questionEditorAssignment.variantMode === 'shared',
    });
    const dolIndex = resolveDOLQuestionIndex({
      ...questionEditorAssignment,
      questions: normalizedQuestions,
    });
    await updateDoc(doc(db, 'assignments', questionEditorAssignment.id), {
      title,
      questions: normalizedQuestions,
      'dol.questionIndex': dolIndex >= 0 ? dolIndex : null,
      updatedAt: new Date().toISOString(),
    });
    setQuestionEditorAssignment(null);
    await fetchAssignments();
  };

  const handleViewClassGradebook = (period, student = null) => {
    setGradebookFilter({ classPeriod: period, assignmentId: null, student });
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

  const handleGoToClassFromHome = (period) => {
    setHomeNavigationPeriod(period);
    setTeacherTab('classesWorkspace');
  };

  const handleChangeClassPeriod = async (studentId, newPeriod) => {
    try {
      await updateDoc(doc(db, 'grades', studentId), { classPeriod: newPeriod });
      await fetchStudents();
    } catch (error) {
      console.error(error);
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

  const updateSchedulePeriod = (period, field, value, modified = false) => {
    setClassSchedule((currentValue) => {
      const current = normalizeSchedule(currentValue);
      if (!modified) {
        return {
          ...current,
          periods: {
            ...current.periods,
            [period]: { ...current.periods[period], [field]: value },
          },
        };
      }
      const date = new Date();
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const day = current.modifiedSchedules?.[dateKey] || { periods: JSON.parse(JSON.stringify(current.periods)) };
      return {
        ...current,
        modifiedSchedules: {
          ...current.modifiedSchedules,
          [dateKey]: {
            ...day,
            periods: {
              ...day.periods,
              [period]: { ...(day.periods?.[period] || current.periods[period]), [field]: value },
            },
          },
        },
      };
    });
  };

  const handleSaveClassSchedule = async () => {
    const normalized = normalizeSchedule(classSchedule);
    await setDoc(doc(db, 'settings', 'classSchedule'), normalized);
    setClassSchedule(normalized);
    toastSuccess('Schedule saved', 'DOL windows now use these period times.');
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
    const { id: _id, archived: _archived, ...rest } = assignment;
    const duplicateQuestions = (assignment.questions || []).map((question) => ({ ...question, questionId: createQuestionId() }));
    await addDoc(collection(db, 'assignments'), {
      ...rest,
      assignmentKey: null,
      title: `${assignment.title} (Copy)`,
      questions: duplicateQuestions,
      createdAt: new Date(),
    });
    await fetchAssignments();
    toastSuccess(`Duplicated “${assignment.title}”`, 'The copy is unpublished from Google Classroom and has no student records.');
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

  const beginEditAssignmentDates = (assignment) => {
    const toLocalInput = (value) => {
      const date = value ? new Date(value) : null;
      if (!date || Number.isNaN(date.getTime())) return '';
      const offset = date.getTimezoneOffset() * 60000;
      return new Date(date.getTime() - offset).toISOString().slice(0, 16);
    };
    setEditingAssignmentId(assignment.id);
    setEditingAssignmentDates({
      dueAt: toLocalInput(assignment.dueAt || assignment.dueDate),
      lateDueAt: toLocalInput(assignment.lateDueAt || assignment.lateDueDate || assignment.dueAt || assignment.dueDate),
      assignedClassPeriods: Array.isArray(assignment.assignedClassPeriods) ? assignment.assignedClassPeriods : [...CLASS_PERIODS],
    });
  };

  const handleSaveAssignmentDates = async (assignmentId) => {
    const dueAt = new Date(editingAssignmentDates.dueAt);
    const lateDueAt = new Date(editingAssignmentDates.lateDueAt);
    if (Number.isNaN(dueAt.getTime()) || Number.isNaN(lateDueAt.getTime()) || lateDueAt <= dueAt) {
      toastError('Check the dates', 'The final late due date must be later than the regular due date.');
      return;
    }
    await updateDoc(doc(db, 'assignments', assignmentId), {
      dueAt: dueAt.toISOString(),
      dueDate: dueAt.toISOString(),
      lateDueAt: lateDueAt.toISOString(),
      assignedClassPeriods: editingAssignmentDates.assignedClassPeriods || [],
    });
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
    schemaVersion: 2,
    assignment: {
      assignmentKey: assignment.assignmentKey || assignment.id || null,
      title: assignment.title || '',
      folder: assignment.folder || null,
      template: assignment.assignmentTemplate || null,
      assignmentType: assignment.assignmentType || 'practice',
      variantMode: assignment.variantMode || 'personalized',
      classes: assignment.assignedClassPeriods || [],
      releaseAt: assignment.releaseAt || null,
      dueAt: assignment.dueAt || assignment.dueDate || null,
      lateDueAt: assignment.lateDueAt || assignment.lateDueDate || null,
      prerequisiteAssignmentId: assignment.prerequisiteAssignmentId || null,
      completionRule: assignment.completionRule || null,
      dol: assignment.dol || { enabled: false, minutesBeforeEnd: 10, questionIndex: null },
      standards: assignment.standards || [],
      curriculum: assignment.curriculum || null,
    },
    questions: assignment.questions || [],
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
              Export JSON &middot; {exportJsonAssignment.title}
            </h2>
            <p style={{ margin: '8px 0 0', color: '#5f6368', fontSize: '13px' }}>
              This portable Assignment Package can be re-imported into MathMaster. It includes the assignment metadata, dates, class periods, folder, DOL settings, and questions without Firestore-only fields.
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

    const questions = assignment.questions || [];
    const includedQuestionIndices = getIncludedQuestionIndices(questions);
    const lifecycle = getAssignmentLifecycle(assignment, now);
    const recordedTracker = tracker[activeAssignmentId] || {};
    const workingTracker = preview
      ? previewTracker
      : lifecycle.isPracticeOnly
        ? practiceTracker[activeAssignmentId] || createPracticeAssignmentTracker(questions, recordedTracker)
        : recordedTracker;
    const recordedGrade = calculateGrade(recordedTracker, assignment);
    const progress = calculatePracticeProgress(workingTracker, assignment);
    const dolState = getDOLState({ assignment, schedule: classSchedule, classPeriod: user?.classPeriod, nowValue: now });
    const currentRecord = normalizeQuestionRecord(workingTracker?.[currentQuestionIndex]);
    const currentIsDOL = !lifecycle.isPracticeOnly && activeQuestionRole === 'dol' && dolState.enabled && currentQuestionIndex === dolState.questionIndex;
    const assignmentFeedbackHeld = !preview && !lifecycle.isPracticeOnly && assignmentHasHeldTeacherFeedback(assignment);
    const currentFeedbackReleased = lifecycle.isPracticeOnly || assignmentFeedbackWasReleased(assignment)
      || (activeActivityPolicy.feedback === 'afterAssignmentSubmit' && ['correct', 'expired'].includes(currentRecord.status));
    const runtimeActivityRole = !preview && lifecycle.isPracticeOnly ? 'practice' : activeQuestionRole;
    const runtimeActivityPolicy = getEffectiveActivityPolicy(runtimeActivityRole);
    const generationStudentKey = assignment.variantMode === 'shared'
      ? `shared-version:${assignment.id}`
      : preview ? 'teacher-preview' : user?.id || 'anonymous';
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
    const visibleQuestionEntries = includedQuestionIndices.map((index, visiblePosition) => {
      const question = questions[index];
      const isTimedDOLQuestion = dolState.enabled && index === dolState.questionIndex;
      const role = resolveQuestionActivityRole({ question, assignment, isDOL: isTimedDOLQuestion });
      return { index, visiblePosition, question, role, isTimedDOLQuestion };
    });
    const navigationSections = visibleQuestionEntries.reduce((sections, entry) => {
      const previous = sections[sections.length - 1];
      if (previous?.role === entry.role) previous.entries.push(entry);
      else sections.push({ role: entry.role, entries: [entry] });
      return sections;
    }, []);
    const currentSectionMeta = activitySectionMeta[activeQuestionRole] || {
      label: String(activeQuestionRole || 'Activity').replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()),
      background: '#f1f3f4', color: '#3c4043', border: '#9aa0a6',
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
        {!preview && !supportPresentation.disableIdleTimer && renderIdleOverlay()}
        <div className="mathmaster-assignment-shell" style={{ maxWidth: '1120px', margin: '0 auto' }}>
          {lifecycle.isLate && !preview && (
            <section style={{ marginBottom: '16px', padding: '18px 22px', borderRadius: '13px', background: '#fff4ce', border: '2px solid #f9ab00', color: '#5f4400', textAlign: 'left' }}>
              <strong style={{ display: 'block', fontSize: '20px' }}>Late submission window</strong>
              <span>The regular deadline passed. You have <strong>{formatRemainingTime(lifecycle.millisecondsRemaining)}</strong> before this assignment closes permanently on {formatLateDueDate(assignment)}.</span>
            </section>
          )}

          {lifecycle.isPracticeOnly && !preview && (
            <section style={{ marginBottom: '16px', padding: '18px 22px', borderRadius: '13px', background: '#f1f3f4', border: '2px solid #5f6368', color: '#3c4043', textAlign: 'left' }}>
              <strong style={{ display: 'block', fontSize: '20px' }}>Practice Mode — grading window ended</strong>
              <span>Your recorded grade is frozen. You may keep practicing with feedback, but these attempts earn no credit and are not written to the teacher gradebook, mastery evidence, Math Path recommendations, or activity analytics. Practice state stays only in memory for this signed-in browser session and is never saved.</span>
            </section>
          )}

          {!preview && dolState.status === 'active' && (
            <section style={{ marginBottom: '16px', padding: '20px 22px', borderRadius: '14px', background: '#f3e8fd', border: '2px solid #9334e6', color: '#4a126b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap', textAlign: 'left' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '22px' }}>DOL is available now</strong>
                <span>Question {Math.max(1, includedQuestionIndices.indexOf(dolState.questionIndex) + 1)} records today&apos;s DOL grade.</span>
                {!supportPresentation.hideCountdowns && <div style={{ marginTop: '7px', fontWeight: 900, fontSize: '18px' }}>{formatRemainingTime(dolState.millisecondsRemaining)} remaining</div>}
              </div>
              <button type="button" onClick={() => changeQuestion(dolState.questionIndex)} style={{ padding: '12px 18px', border: 0, borderRadius: '10px', background: '#681da8', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>Go to DOL Question</button>
            </section>
          )}

          <header className="mathmaster-assignment-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '18px 24px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: '22px', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'left', flex: '1 1 390px' }}>
              <button
                onClick={() => {
                  if (preview) setTeacherTab('assignments');
                  else flushAssignmentActivity(activeAssignmentId).catch(() => {});
                  setActiveView('dashboard');
                  setActiveAssignmentId(null);
                }}
                style={{ background: 'none', border: 'none', color: '#1a73e8', cursor: 'pointer', fontWeight: 'bold', padding: 0, marginBottom: '5px' }}
              >
                &larr; {preview ? 'Back to Instructor Dashboard' : 'Back to Dashboard'}
              </button>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, color: '#202124', fontSize: '23px' }}>{assignment.title}</h1>
                <span style={{ padding: '4px 9px', borderRadius: '999px', background: lifecycleBadge.background, color: lifecycleBadge.color, fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>{lifecycleBadge.label}</span>
                {assignment.assignmentType === 'notesClasswork' && <span style={{ padding: '4px 9px', borderRadius: '999px', background: '#e8f0fe', color: '#174ea6', fontSize: '11px', fontWeight: 900 }}>GUIDED NOTES / CLASSWORK</span>}
                {assignment.variantMode === 'shared' && <span style={{ padding: '4px 9px', borderRadius: '999px', background: '#e6f4ea', color: '#137333', fontSize: '11px', fontWeight: 900 }}>SAME VERSION FOR EVERY STUDENT</span>}
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
              {!preview && assignment.assignmentType === 'notesClasswork' && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: '#5f6368', textTransform: 'uppercase', fontWeight: 900 }}>Daily classwork</div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: classworkGradesByAssignment?.[assignment.id]?.score === 100 ? '#188038' : '#8a5a00' }}>{classworkGradesByAssignment?.[assignment.id]?.score === 100 ? '100 — prerequisite met' : 'In progress'}</div>
                </div>
              )}
            </div>
          </header>

          <div className="mathmaster-question-navigation" style={{ display: 'grid', gap: '14px', marginBottom: '24px' }}>
            {navigationSections.map((section) => {
              const sectionMeta = activitySectionMeta[section.role] || { label: section.role, background: '#f1f3f4', color: '#3c4043', border: '#9aa0a6' };
              return (
                <section key={`${section.role}-${section.entries[0]?.index}`} aria-label={`${sectionMeta.label} questions`} style={{ padding: '13px', borderRadius: '12px', border: `2px solid ${sectionMeta.border}`, background: sectionMeta.background }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', color: sectionMeta.color }}>
                    <strong style={{ fontSize: '15px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{sectionMeta.label}</strong>
                    <span style={{ fontSize: '12px', fontWeight: 800 }}>{section.entries.length} question{section.entries.length === 1 ? '' : 's'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '10px' }}>
                    {section.entries.map(({ index, visiblePosition, role: cardRole, isTimedDOLQuestion }) => {
                      const record = normalizeQuestionRecord(workingTracker?.[index]);
                      const cardPolicy = getEffectiveActivityPolicy(cardRole);
                      const cardFeedbackHeld = !preview && !lifecycle.isPracticeOnly && cardPolicy.feedback === 'teacherRelease' && !assignmentFeedbackWasReleased(assignment);
                      const storedCardState = getQuestionCardState(workingTracker?.[index]);
                      const cardState = cardFeedbackHeld && ['correct', 'expired'].includes(record.status)
                        ? { background: '#eef4ff', color: '#174ea6', label: 'Submitted · feedback held' }
                        : storedCardState;
                      const dolUnavailable = isTimedDOLQuestion && !preview && !lifecycle.isClosed && !['active', 'ended'].includes(dolState.status);
                      return (
                        <button
                          type="button"
                          key={index}
                          onClick={() => !dolUnavailable && changeQuestion(index)}
                          disabled={dolUnavailable}
                          style={{
                            padding: '14px',
                            cursor: dolUnavailable ? 'not-allowed' : 'pointer',
                            backgroundColor: dolUnavailable ? '#f1f3f4' : cardState.background,
                            color: dolUnavailable ? '#80868b' : cardState.color,
                            border: currentQuestionIndex === index ? `3px solid ${sectionMeta.border}` : '1px solid #dadce0',
                            borderRadius: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            boxShadow: currentQuestionIndex === index ? '0 4px 12px rgba(26,115,232,0.2)' : 'none',
                            opacity: dolUnavailable ? 0.7 : 1,
                          }}
                        >
                          <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Question {visiblePosition + 1}</div>
                          <div style={{ marginTop: '5px', padding: '3px 7px', borderRadius: '999px', background: sectionMeta.background, color: sectionMeta.color, border: `1px solid ${sectionMeta.border}`, fontSize: '10px', fontWeight: 900 }}>{sectionMeta.label}</div>
                          <div style={{ fontSize: '12px', marginTop: '7px', fontWeight: 'bold' }}>{dolUnavailable ? 'Locked until DOL window' : cardState.label}</div>
                          {record.totalAttempts > 0 && <div style={{ fontSize: '11px', marginTop: '3px', opacity: 0.85 }}>{record.totalAttempts} total attempt{record.totalAttempts === 1 ? '' : 's'}</div>}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          <section aria-label="Current assignment section" style={{ marginBottom: '12px', padding: '12px 16px', borderRadius: '10px', borderLeft: `6px solid ${currentSectionMeta.border}`, background: currentSectionMeta.background, color: currentSectionMeta.color, textAlign: 'left' }}>
            <strong style={{ fontSize: '16px' }}>{currentSectionMeta.label}</strong>
            <span style={{ marginLeft: '8px', fontSize: '13px' }}>You are working in this section now.</span>
          </section>

          <main className="mathmaster-question-stage" style={{ background: '#fff', borderRadius: '12px', padding: '10px', minHeight: '500px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <QuestionEngine
              key={`${activeAssignmentId}-${currentQuestionIndex}-${currentRecord.variantIndex}-${preview ? 'preview' : lifecycle.status}`}
              question={questions[currentQuestionIndex]}
              questionRecord={workingTracker?.[currentQuestionIndex]}
              generationKey={`${activeAssignmentId}|${generationStudentKey}|${currentQuestionIndex}|variant:${currentRecord.variantIndex}`}
              onGrade={handleGradeSubmit}
              onStepGrade={handleStepGrade}
              onRequestNewQuestion={handleRequestNewQuestion}
              onLoadScratchpad={handleLoadScratchpad}
              onSaveScratchpad={handleSaveScratchpad}
              studentProfile={preview ? null : adaptiveStudentProfile || user?.profile}
              guidedMode={assignment.assignmentType === 'notesClasswork'}
              assignmentLocked={false}
              dolMode={!preview && currentIsDOL && dolState.status === 'active'}
              maximumAttempts={runtimeActivityPolicy.attempts}
              activityRole={runtimeActivityRole}
              activityPolicy={runtimeActivityPolicy}
              feedbackReleased={currentFeedbackReleased}
              replacementWarning={replacementWarning}
              draftKey={lifecycle.isPracticeOnly && !preview ? null : buildQuestionDraftKey({ studentId: preview ? 'teacher-preview' : user?.id || 'anonymous', assignmentId: activeAssignmentId, questionIndex: currentQuestionIndex, variantIndex: currentRecord.variantIndex, sessionMode: draftSessionMode })}
              assignmentId={activeAssignmentId}
              executionScope={preview ? 'teacherPreview' : lifecycle.isPracticeOnly ? 'postDuePractice' : 'student'}
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
      || String(user.email || '').trim().toLowerCase() === ROOT_ADMIN_EMAIL;
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const todayOverride = classSchedule.modifiedSchedules?.[todayKey]?.periods || null;
    const selectedAssignment = assignments.find((assignment) => assignment.id === gradebookFilter.assignmentId) || null;
    const selectedClassStudents = allStudents.filter((student) => (student.classPeriod || 'Unassigned') === gradebookFilter.classPeriod);
    const assignmentsForSelectedClass = assignments.filter((assignment) => !gradebookFilter.classPeriod || assignmentIsForStudent(assignment, gradebookFilter.classPeriod));

    // The Assignments tab list, after the Library folder/smart-view filter and
    // the free-text search. Computed once so the header count, the
    // select-all-visible checkbox and the rendered cards can never disagree.
    const visibleAssignments = assignments.filter((assignment) => (
      assignmentFolderMatches(assignment, libraryNavigation?.folder)
      && matchesSmartView(assignment, libraryNavigation?.smartView, { nowValue: now, classSchedule })
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
              {[['classes', 'Classes & rosters'], ['accounts', 'Accounts & sign-in'], ['coverage', 'Path content coverage']].map(([id, label]) => (
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
        {assignmentPreflight && (
          <LessonPreflightModal
            key={`${assignmentPreflight.lessonBundle.bundleId}-${assignmentPreflight.sourceLabel}`}
            lessonBundle={assignmentPreflight.lessonBundle}
            initialDraft={assignmentPreflight.initialDraft}
            classPeriods={CLASS_PERIODS}
            courseProfiles={courseProfiles}
            sourceLabel={assignmentPreflight.sourceLabel}
            sourceQuestions={assignmentPreflight.questions}
            authoringWarnings={assignmentPreflight.authoringWarnings}
            onClose={() => setAssignmentPreflight(null)}
            onConfirmPublish={confirmAssignmentPreflight}
            busy={assignmentPreflightBusy}
          />
        )}
        {promoteAssignment && (
          <PromoteToPathBank assignment={promoteAssignment} onClose={() => setPromoteAssignment(null)} />
        )}
        {questionEditorAssignment && (
          <AssignmentQuestionEditor
            assignment={questionEditorAssignment}
            hasStudentData={allStudents.some((student) => student.gradesByAssignment?.[questionEditorAssignment.id] !== undefined)}
            onSave={saveQuestionEditor}
            onClose={() => setQuestionEditorAssignment(null)}
          />
        )}
        <div className="mm-dashboard-shell" style={{ maxWidth: '1360px', margin: '0 auto', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'stretch' }}>
          <TeacherSidebar
            activeTab={teacherTab}
            onSelectTab={(tab) => {
              setTeacherTab(tab);
              setGradebookFilter({ classPeriod: '', assignmentId: null, student: null });
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
              {rootAdminUiEligible && <div role="group" aria-label="Root administrator workspace" style={{ display: 'inline-flex', padding: 3, borderRadius: 9, background: '#f1f3f4', border: '1px solid #dadce0' }}><button type="button" aria-pressed="true" style={{ padding: '6px 10px', border: 0, borderRadius: 6, background: '#fff', color: '#174ea6', fontWeight: 900 }}>Teacher View</button><button type="button" aria-pressed="false" onClick={() => setTeacherWorkspaceMode('administration')} style={{ padding: '6px 10px', border: 0, borderRadius: 6, background: 'transparent', color: '#3c4043', cursor: 'pointer', fontWeight: 900 }}>Administration</button></div>}
              <button onClick={handleLogout} style={{ padding: '8px 16px', background: '#fff', color: '#d93025', border: '1px solid #d93025', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Log Out</button>
            </div>
          </header>

          <div className="mm-dashboard-content" style={{ padding: '30px' }}>
            {teacherTab === 'demo' && <DemoExperience />}

            {teacherTab === 'pacing' && (
              <PacingControls
                courseProfiles={courseProfiles}
                pacingByClass={pacingByClass}
                overrides={skillOverrides}
                onSavePacing={handleSavePacing}
                onSaveOverrides={handleSaveOverrides}
                busy={pacingBusy}
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
                onNavigateToAssignments={(navigation) => { setLibraryNavigation(navigation); setTeacherTab('assignments'); }}
                nowValue={now}
                classSchedule={classSchedule}
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
                            <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: '#e8f0fe', color: '#174ea6' }}>{assignment.assignmentType === 'notesClasswork' ? 'NOTES / CLASSWORK' : 'PRACTICE'}</span>
                            {assignment.variantMode === 'shared' && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: '#e6f4ea', color: '#137333' }}>SHARED VERSION</span>}
                            {assignment.archived && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: '#f1f3f4', color: '#5f6368' }}>ARCHIVED</span>}
                            {/* A library item has no audience and no due date. Saying so
                                plainly is the whole point of allowing it to exist. */}
                            {isLibraryAssignment(assignment) && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: '#fef7e0', color: '#7a4f00' }}>NOT ASSIGNED</span>}
                          </div>
                          <div style={{ marginTop: '7px', color: '#5f6368', fontSize: '13px', lineHeight: 1.55 }}>{getIncludedQuestionIndices(assignment).length} included question{getIncludedQuestionIndices(assignment).length === 1 ? '' : 's'}{(assignment.questions?.length || 0) !== getIncludedQuestionIndices(assignment).length ? ` · ${assignment.questions.length - getIncludedQuestionIndices(assignment).length} excluded` : ''} · {isLibraryAssignment(assignment) ? 'Not assigned to a class' : `Classes: ${(assignment.assignedClassPeriods || []).join(', ')}`}<br />{isLibraryAssignment(assignment) ? 'No due date yet' : `Due ${formatDueDate(assignment)} · Late close ${formatLateDueDate(assignment)}`} · {affectedStudents} student record{affectedStudents === 1 ? '' : 's'}</div>
                        </div>
                        <AssignmentCardMenu
                          ariaLabel={`More actions for ${assignment.title}`}
                          items={[
                            { key: 'preview', label: 'View as Student', onClick: () => startTeacherPreview(assignment.id) },
                            { key: 'edit-questions', label: 'Edit Questions', onClick: () => openQuestionEditor(assignment) },
                            { key: 'export-json', label: 'Export JSON', onClick: () => { setExportJsonAssignment(assignment); setExportJsonCopied(false); } },
                            { key: 'path-bank', label: 'Add to Path Bank…', onClick: () => setPromoteAssignment(assignment) },
                            { key: 'dates-classes', label: 'Dates & Classes', onClick: () => beginEditAssignmentDates(assignment) },
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
                          <div style={{ flex: '1 1 100%', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{CLASS_PERIODS.map((period) => <label key={period} style={{ padding: '5px 8px', borderRadius: '999px', background: editingAssignmentDates.assignedClassPeriods?.includes(period) ? '#e8f0fe' : '#fff', border: '1px solid #c5d5ef', fontWeight: 'bold', fontSize: '12px' }}><input type="checkbox" checked={editingAssignmentDates.assignedClassPeriods?.includes(period)} onChange={() => setEditingAssignmentDates((current) => ({ ...current, assignedClassPeriods: current.assignedClassPeriods?.includes(period) ? current.assignedClassPeriods.filter((item) => item !== period) : [...(current.assignedClassPeriods || []), period] }))} /> {period}</label>)}</div>
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
                students={allStudents}
                classPeriods={CLASS_PERIODS}
                courseProfiles={courseProfiles}
                masteryProfilesByStudentId={teacherMasteryProfilesByStudentId}
                supportOptions={supportOptions}
                onChangeClassPeriod={handleChangeClassPeriod}
                onUpdateStudentProfile={handleUpdateStudentProfile}
                onToggleStudentSupport={toggleStudentSupport}
                onGenerateIEPReport={openIEPReport}
                isRootAdmin={rootAdminUiEligible}
                onOpenAdministration={() => setTeacherWorkspaceMode('administration')}
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
                onOpenStudent={(studentId) => {
                  const student = allStudents.find((entry) => entry.id === studentId);
                  if (student) handleViewClassGradebook(student.classPeriod || '', student);
                }}
              />
            )}

            {teacherTab === 'classesWorkspace' && (
              <ClassesWorkspace
                allStudents={allStudents}
                assignments={assignments}
                classSchedule={classSchedule}
                nowValue={now}
                onViewGradebook={handleViewClassGradebook}
                initialPeriod={homeNavigationPeriod}
              />
            )}

            {teacherTab === 'classes' && (
              <div>
                <h2 style={{ marginTop: 0 }}>Eight-Period Class Schedule</h2>
                <p style={{ color: '#5f6368' }}>The DOL window opens during the configured final minutes of each period. A temporary schedule can override today without changing the normal schedule.</p>
                <ClassCourseSettings classPeriods={CLASS_PERIODS} courseProfiles={courseProfiles} assignments={assignments} onChange={handleUpdateCourseProfile} onSave={handleSaveCourseProfiles} saving={courseProfilesSaving} />
                <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr style={{ background: '#f8f9fa' }}><th style={{ padding: '11px', textAlign: 'left' }}>Period</th><th>Enabled</th><th>Start</th><th>End</th></tr></thead><tbody>{CLASS_PERIODS.map((period) => { const item = classSchedule.periods?.[period] || {}; return <tr key={period} style={{ borderBottom: '1px solid #e8eaed' }}><td style={{ padding: '11px', fontWeight: 'bold' }}>{period}</td><td style={{ textAlign: 'center' }}><input type="checkbox" checked={Boolean(item.enabled)} onChange={(event) => updateSchedulePeriod(period, 'enabled', event.target.checked)} /></td><td style={{ textAlign: 'center' }}><input type="time" value={item.start || ''} onChange={(event) => updateSchedulePeriod(period, 'start', event.target.value)} /></td><td style={{ textAlign: 'center' }}><input type="time" value={item.end || ''} onChange={(event) => updateSchedulePeriod(period, 'end', event.target.value)} /></td></tr>; })}</tbody></table></div>
                <div style={{ marginTop: '18px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}><button onClick={handleSaveClassSchedule} style={{ padding: '10px 16px', border: 0, borderRadius: '7px', background: '#1a73e8', color: '#fff', fontWeight: 900 }}>Save Normal Schedule</button><button onClick={() => setClassSchedule((current) => ({ ...normalizeSchedule(current), modifiedSchedules: { ...normalizeSchedule(current).modifiedSchedules, [todayKey]: { periods: JSON.parse(JSON.stringify(normalizeSchedule(current).periods)) } } }))} style={{ padding: '10px 16px', border: '1px solid #f9ab00', borderRadius: '7px', background: '#fff4ce', color: '#5f4400', fontWeight: 900 }}>Create / Reset Today&apos;s Modified Schedule</button></div>
                {todayOverride && <section style={{ marginTop: '28px', padding: '18px', background: '#fff8e1', border: '2px solid #f9ab00', borderRadius: '10px' }}><h3 style={{ marginTop: 0 }}>Temporary schedule for {todayKey}</h3><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={{ textAlign: 'left' }}>Period</th><th>Enabled</th><th>Start</th><th>End</th></tr></thead><tbody>{CLASS_PERIODS.map((period) => { const item = todayOverride[period] || {}; return <tr key={period}><td style={{ padding: '8px', fontWeight: 'bold' }}>{period}</td><td style={{ textAlign: 'center' }}><input type="checkbox" checked={Boolean(item.enabled)} onChange={(event) => updateSchedulePeriod(period, 'enabled', event.target.checked, true)} /></td><td style={{ textAlign: 'center' }}><input type="time" value={item.start || ''} onChange={(event) => updateSchedulePeriod(period, 'start', event.target.value, true)} /></td><td style={{ textAlign: 'center' }}><input type="time" value={item.end || ''} onChange={(event) => updateSchedulePeriod(period, 'end', event.target.value, true)} /></td></tr>; })}</tbody></table><div style={{ marginTop: '14px', display: 'flex', gap: '10px' }}><button onClick={handleSaveClassSchedule} style={{ padding: '9px 14px', border: 0, borderRadius: '7px', background: '#188038', color: '#fff', fontWeight: 900 }}>Save Today&apos;s Schedule</button><button onClick={() => setClassSchedule((current) => { const next = normalizeSchedule(current); const modifiedSchedules = { ...next.modifiedSchedules }; delete modifiedSchedules[todayKey]; return { ...next, modifiedSchedules }; })} style={{ padding: '9px 14px', border: '1px solid #d93025', borderRadius: '7px', background: '#fff', color: '#d93025', fontWeight: 900 }}>Remove Today Override</button></div></section>}
              </div>
            )}

            {teacherTab === 'grades' && (
              <div>
                <h2 style={{ marginTop: 0 }}>Gradebook and Evidence</h2>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '20px', padding: '15px', borderRadius: '9px', background: '#f1f3f4' }}>
                  <select value={gradebookFilter.classPeriod} onChange={(event) => setGradebookFilter({ classPeriod: event.target.value, assignmentId: null, student: null })} style={{ padding: '9px', minWidth: '180px' }}><option value="">Select class period</option>{CLASS_PERIODS.map((period) => <option key={period} value={period}>{period}</option>)}</select>
                  <select value={gradebookFilter.assignmentId || ''} disabled={!gradebookFilter.classPeriod} onChange={(event) => setGradebookFilter((current) => ({ ...current, assignmentId: event.target.value || null, student: null }))} style={{ padding: '9px', minWidth: '280px' }}><option value="">Select assignment</option>{assignmentsForSelectedClass.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}</select>
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

                {gradebookFilter.classPeriod && selectedAssignment && !gradebookFilter.student && (
                  <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}><thead><tr style={{ background: '#f8f9fa' }}><th style={{ padding: '12px' }}>Student</th><th>Score</th><th>Instructional condition</th><th>Activity</th><th>DOL / Classwork</th><th></th></tr></thead><tbody>{selectedClassStudents.map((student) => { const grades = student.gradesByAssignment?.[selectedAssignment.id]; const score = grades ? calculateGrade(grades, selectedAssignment) : null; const usage = student.supportUsageByAssignment?.[selectedAssignment.id] || {}; const modified = Boolean(usage.modified || usage.modifications?.length); const activity = student.assignmentActivity?.[selectedAssignment.id] || {}; const dolEntries = Object.entries(student.dolGradesByAssignment?.[selectedAssignment.id] || {}).sort(([a], [b]) => a.localeCompare(b)); const latestDol = dolEntries.at(-1)?.[1]; const classwork = student.classworkGradesByAssignment?.[selectedAssignment.id]; return <tr key={student.id} style={{ borderBottom: '1px solid #e8eaed' }}><td style={{ padding: '12px', fontWeight: 'bold' }}>{student.id}</td><td><strong style={{ color: modified ? '#6f2da8' : score >= 70 ? '#188038' : '#202124' }}>{score === null ? '—' : `${score}%`}</strong>{modified && <span title={`Accommodations: ${(usage.accommodations || []).join(', ') || 'none'}; Modifications: ${(usage.modifications || []).join(', ') || 'none'}`} style={{ marginLeft: '7px', padding: '3px 6px', borderRadius: '999px', background: '#efe4ff', color: '#6f2da8', fontWeight: 900, fontSize: '11px' }}>MOD</span>}</td><td style={{ fontSize: '12px' }}>{modified ? `Modified: ${(usage.modifications || []).join(', ')}` : (usage.accommodations || []).length ? `Accommodated: ${usage.accommodations.join(', ')}` : 'Standard'}</td><td style={{ fontSize: '12px', lineHeight: 1.45 }}>Total {formatTime(activity.totalTimeSeconds || 0)}<br />On time {formatTime(activity.onTimeSeconds || 0)} · Late {formatTime(activity.lateSeconds || 0)}<br />Last on-time: {formatTimeStamp(activity.lastActiveBeforeDue)}<br />Last late: {formatTimeStamp(activity.lastActiveLate)}</td><td style={{ fontSize: '12px' }}>DOL: {latestDol ? `${latestDol.score}%` : '—'}<br />Classwork: {classwork?.score ? `${classwork.score}%` : '—'}</td><td><button onClick={() => setGradebookFilter((current) => ({ ...current, student }))} disabled={!grades} style={{ padding: '8px 12px', border: 0, borderRadius: '6px', background: grades ? '#1a73e8' : '#dadce0', color: '#fff', fontWeight: 'bold' }}>Details</button></td></tr>; })}</tbody></table></div>
                )}

                {gradebookFilter.student && selectedAssignment && (() => { const student = gradebookFilter.student; const studentGrades = student.gradesByAssignment?.[selectedAssignment.id] || {}; const usage = student.supportUsageByAssignment?.[selectedAssignment.id] || {}; const activity = student.assignmentActivity?.[selectedAssignment.id] || {}; return <div><div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px', flexWrap: 'wrap', alignItems: 'center', padding: '16px', marginBottom: '18px', background: usage.modified ? '#efe4ff' : '#e8f0fe', borderRadius: '10px' }}><div><h3 style={{ margin: 0 }}>{student.id} · {selectedAssignment.title}</h3><div style={{ marginTop: '5px' }}>Score: <strong>{calculateGrade(studentGrades, selectedAssignment)}%</strong> {usage.modified && <span style={{ marginLeft: '7px', padding: '3px 7px', borderRadius: '999px', background: '#6f2da8', color: '#fff', fontWeight: 900 }}>MOD</span>}</div><div style={{ marginTop: '5px', fontSize: '13px' }}>Total engagement {formatTime(activity.totalTimeSeconds || 0)} · Late engagement {formatTime(activity.lateSeconds || 0)}</div></div><button onClick={() => openIEPReport(student)} style={{ padding: '10px 15px', border: '1px solid #6f2da8', borderRadius: '7px', background: '#fff', color: '#6f2da8', fontWeight: 900 }}>Generate IEP Report</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '14px' }}>{selectedAssignment.questions.map((question, index) => { if (!questionIsIncluded(question)) return null; const record = normalizeQuestionRecord(studentGrades[index]); const credit = Math.round(getQuestionCredit(record) * 100); return <article key={index} style={{ padding: '16px', borderRadius: '9px', background: record.status === 'correct' ? '#e6f4ea' : record.status === 'expired' && credit < 50 ? '#fce8e6' : credit >= 50 ? '#fff4ce' : '#f1f3f4', border: '1px solid rgba(0,0,0,.12)', textAlign: 'left' }}><strong>Question {index + 1} · {question.type}</strong><div style={{ margin: '8px 0', fontSize: '20px', fontWeight: 900 }}>{record.status === 'correct' ? 'Correct ✓' : record.status === 'expired' ? credit >= 50 ? `Almost · ${credit}%` : `Incorrect · ${credit}%` : `${credit}% credit`}</div><div style={{ fontSize: '12px' }}>Attempts: {record.totalAttempts} · Time: {formatTime(record.timeSpent || 0)}</div>{record.partGrades?.length > 0 && <div style={{ marginTop: '10px' }}>{record.partGrades.map((part) => <div key={part.id} style={{ fontSize: '12px', color: part.isCorrect ? '#137333' : '#b3261e' }}>{part.isCorrect ? '✓' : '●'} {part.label}</div>)}</div>}<button type="button" onClick={() => openTeacherScratchpad(student.id, selectedAssignment.id, index)} style={{ marginTop: '12px', padding: '8px 11px', border: '1px solid #aeb8c6', borderRadius: '6px', background: '#fff', color: '#174ea6', fontWeight: 'bold' }}>View Student Work</button></article>; })}</div></div>; })()}
              </div>
            )}

            {teacherTab === 'standards' && (
              <TexasStandardsDashboard allStudents={allStudents} assignments={assignments} />
            )}

            {teacherTab === 'analytics' && (
              <TeacherAnalyticsDashboard students={allStudents} masteryProfilesByStudentId={teacherMasteryProfilesByStudentId} />
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

            {teacherTab === 'access' && <SignInAccess signedInEmail={user.email} />}

            {teacherTab === 'classroom' && <ClassroomSync assignments={assignments} />}

            {teacherTab === 'access' && <SignInAccess signedInEmail={user.email} mode="teacher" />}
          </div>
          </div>
        </div>
      </div>
    );
  }

  if (user.role === 'student' && activeView === 'dashboard') {
    if (studentDashboardMode === 'mathPath') {
      return (
        <MyMathPathApp
          studentId={user.id}
          studentName={user.displayName || user.id}
          studentProfile={adaptiveStudentProfile || user.profile}
          assignments={assignments}
          launchTeksCode={pathLaunchTeks}
          pathOptions={studentPathOptions}
          courseId={studentCourseId}
          studentRecord={studentRecord}
          onExit={() => { setPathLaunchTeks(null); setStudentDashboardMode('assignments'); }}
        />
      );
    }
    if (studentDashboardMode === 'secureExams') {
      return (
        <StudentSecureExamDashboard
          studentProfile={user.profile}
          onExit={() => setStudentDashboardMode('assignments')}
        />
      );
    }

    const supportPresentation = getStudentSupportPresentation(user.profile);
    // Computed by a module rather than inline, so the Teacher Path Simulator
    // can build the same dashboard from a synthetic learner without a second
    // copy of this logic drifting away from it.
    const dashboard = buildStudentDashboardModel({
      assignments,
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
        getIncludedQuestionIndices,
        normalizeQuestionRecord,
        questionIsIncluded,
        assignmentHasHeldTeacherFeedback,
        matchesSmartView,
      },
    });
    return (
      <StudentDashboardView
        dashboard={dashboard}
        student={{ id: user.id, classPeriod: user.classPeriod, inclusionStatus: user.profile?.inclusionStatus }}
        supportPresentation={supportPresentation}
        onStartAssignment={startAssignment}
        onOpenMathPath={() => setStudentDashboardMode('mathPath')}
        onOpenSecureExams={() => setStudentDashboardMode('secureExams')}
        onLogout={handleLogout}
        recommended={{
          student: studentRecord,
          assignments,
          courseId: studentCourseId,
          pacing: studentPacing,
          pathOptions: studentPathOptions,
          onChooseSkill: handleChooseSkill,
        }}
      />
    );
  }

  if (isStudentAssignment) {
    return renderAssignmentWorkspace(false);
  }

  return null;
}

export default App;

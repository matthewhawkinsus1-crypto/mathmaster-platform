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
  setDoc,
  updateDoc,
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
  DEFAULT_ASSIGNMENT_BLUEPRINT,
  MATH_BLUEPRINT_GUIDE,
  parseAssignmentBlueprintText,
  validateAssignmentQuestions,
  normalizeAssignmentPackageMetadata,
  assertFirestoreSafeAssignmentPayload,
} from './assignmentBlueprint';
import { isPersonalizedBlueprint } from './problemGenerator';
import {
  buildPracticeTrackerKey,
  buildQuestionDraftKey,
  readQuestionDraft,
  readResumeAction,
  saveResumeAction,
  writeQuestionDraft,
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
import { buildStudentMasteryProfile } from './masteryEngine.js';
import {
  getEffectiveActivityPolicy,
  resolveQuestionActivityRole,
} from './platform/policies/activityPolicies';
import { SMART_VIEWS, matchesSmartView } from './assignmentSmartViews';
import { assignmentFolderMatches, normalizeFolderPath, normalizeFolderPaths, renameFolderPath } from './assignmentFolders';
import LessonPreflightModal from './components/teacher/LessonPreflightModal';
import { normalizeLessonBundle } from './platform/schemas/BundleDefinition';
import { normalizeLabDefinition } from './platform/labs/labDefinitionSchema.js';
import { buildAttemptEvidenceEvent } from './platform/history/evidenceEvent.js';
import { writeImmutableEvidenceEvent } from './platform/history/evidencePersistence.js';
import MyMathPathApp from './components/student/MyMathPathApp.jsx';
import StudentSecureExamDashboard from './components/assessment/StudentSecureExamDashboard.jsx';
import TeacherSecureExamDashboard from './components/assessment/TeacherSecureExamDashboard.jsx';
import TeacherAnalyticsDashboard from './components/analytics/TeacherAnalyticsDashboard.jsx';
import ShowcaseClassroomDashboard from './components/analytics/ShowcaseClassroomDashboard.jsx';
import LoginScreen from './LoginScreen.jsx';
import { useAuth } from './auth/AuthProvider.jsx';



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

const isAssignmentExpired = (assignment, now = Date.now()) =>
  getAssignmentLifecycle(assignment, now).isClosed;

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
  const [homeNavigationPeriod, setHomeNavigationPeriod] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [activeAssignmentId, setActiveAssignmentId] = useState(null);
  const [tracker, setTracker] = useState({});
  const [practiceTracker, setPracticeTracker] = useState({});
  const [previewTracker, setPreviewTracker] = useState({});
  const [previewScratchpads, setPreviewScratchpads] = useState({});
  const [teacherScratchpadDialog, setTeacherScratchpadDialog] = useState(null);
  const [teacherScratchpadLoading, setTeacherScratchpadLoading] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [resumeAction, setResumeAction] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [classSchedule, setClassSchedule] = useState(DEFAULT_CLASS_SCHEDULE);
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

  const [newAssignmentTitle, setNewAssignmentTitle] = useState('');
  const [newAssignmentDate, setNewAssignmentDate] = useState('');
  const [newAssignmentLateDate, setNewAssignmentLateDate] = useState('');
  const [newAssignmentClasses, setNewAssignmentClasses] = useState([...CLASS_PERIODS]);
  const [newAssignmentType, setNewAssignmentType] = useState('practice');
  const [newAssignmentVariantMode, setNewAssignmentVariantMode] = useState('personalized');
  const [newAssignmentFolder, setNewAssignmentFolder] = useState('');
  const [fixedBlueprintConfirmation, setFixedBlueprintConfirmation] = useState(null);
  const [newAssignmentReleaseAt, setNewAssignmentReleaseAt] = useState('');
  const [newAssignmentPrerequisite, setNewAssignmentPrerequisite] = useState('');
  const [newAssignmentDolEnabled, setNewAssignmentDolEnabled] = useState(true);
  const [newAssignmentDolMinutes, setNewAssignmentDolMinutes] = useState(10);
  const [newAssignmentDolQuestion, setNewAssignmentDolQuestion] = useState('');
  const [newAssignmentJSON, setNewAssignmentJSON] = useState(
    DEFAULT_ASSIGNMENT_BLUEPRINT,
  );
  const [assignmentPackagePreview, setAssignmentPackagePreview] = useState(null);
  const [assignmentJsonFileName, setAssignmentJsonFileName] = useState('');
  const [assignmentPreflight, setAssignmentPreflight] = useState(null);
  const [assignmentPreflightBusy, setAssignmentPreflightBusy] = useState(false);
  const [assignmentJsonDropActive, setAssignmentJsonDropActive] = useState(false);

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
  const activeTimeRef = useRef(0);
  const pendingAssignmentSecondsRef = useRef(0);
  const lastDOLStatusRef = useRef({});

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

  const fetchStudents = async () => {
    const querySnapshot = await getDocs(collection(db, 'grades'));
    const studentData = [];
    querySnapshot.forEach((studentDoc) => {
      if (studentDoc.id !== 'test_connection') {
        studentData.push({ id: studentDoc.id, ...studentDoc.data(), profile: normalizeStudentProfile(studentDoc.data()?.profile || studentDoc.data()) });
      }
    });
    setAllStudents(studentData);
    return studentData;
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
          await Promise.all([fetchStudents(), fetchClassSchedule(), fetchAssignmentFolders()]);
          if (cancelled) return;
          setUser({
            id: session.uid,
            uid: session.uid,
            role: 'teacher',
            email: session.email,
            displayName: session.displayName,
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
        await fetchClassSchedule();
        if (cancelled) return;
        setUser({
          id: studentId,
          uid: session.uid,
          role: 'student',
          email: session.email,
          displayName: session.displayName || studentId,
          classPeriod: studentData.classPeriod || 'Unassigned',
          profile: studentProfile,
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
    setTeacherTab('assignments');
    setActiveAssignmentId(null);
    setPracticeTracker({});
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
  const activeIsExpired = activeLifecycle.isClosed;
  const isTeacherPreview = user?.role === 'teacher' && activeView === 'teacherPreview';
  const isStudentAssignment = user?.role === 'student' && activeView === 'assignment';
  const isPracticeMode = false;
  const activeSupportPresentation = getStudentSupportPresentation(user?.profile);
  const activeDOLState = getDOLState({ assignment: activeAssignmentData, schedule: classSchedule, classPeriod: user?.classPeriod, nowValue: now });
  const activeQuestionRole = resolveQuestionActivityRole({
    question: activeAssignmentData?.questions?.[currentQuestionIndex],
    assignment: activeAssignmentData,
    isDOL: activeDOLState.enabled && currentQuestionIndex === activeDOLState.questionIndex,
  });
  const activeActivityPolicy = getEffectiveActivityPolicy(activeQuestionRole);

  const activeWorkingTracker = isTeacherPreview
    ? previewTracker
    : tracker[activeAssignmentId] || {};

  useEffect(() => {
    if (!activeAssignmentData?.questions?.length) return;
    const included = getIncludedQuestionIndices(activeAssignmentData);
    if (!included.length) return;
    if (!included.includes(currentQuestionIndex)) setCurrentQuestionIndex(included[0]);
  }, [activeAssignmentData, currentQuestionIndex]);

  useEffect(() => {
    if (!isStudentAssignment || !activeAssignmentId) return undefined;
    const interval = window.setInterval(() => {
      flushAssignmentActivity(activeAssignmentId).catch((error) => console.error(error));
    }, 30000);
    return () => window.clearInterval(interval);
  }, [isStudentAssignment, activeAssignmentId, assignmentActivity, tracker, classworkGradesByAssignment]);


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
      window.alert('The DOL question opens during the final minutes of this class period. Continue the practice questions until the DOL banner appears.');
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
    const lifecycle = getAssignmentLifecycle(assignment, Date.now());
    if (lifecycle.isClosed) {
      setCurrentQuestionIndex(newIndex);
      return;
    }

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
      window.alert('This assignment is not assigned to your class period.');
      return;
    }
    const access = prerequisiteAccess({ assignment: assignmentData, classworkGradesByAssignment, nowValue: Date.now() });
    if (user?.role === 'student' && !access.open) {
      const prerequisiteTitle = assignments.find((assignment) => assignment.id === access.prerequisiteId)?.title || 'the prerequisite notes/classwork assignment';
      window.alert(`Complete ${prerequisiteTitle} first. This practice assignment will also open automatically at its scheduled release time.`);
      return;
    }
    const lifecycle = getAssignmentLifecycle(assignmentData, Date.now());
    if (lifecycle.isScheduled && access.reason !== 'prerequisiteMet') {
      window.alert(`This assignment opens ${formatDateTime(assignmentData.releaseAt)}.`);
      return;
    }

    const includedQuestionIndices = getIncludedQuestionIndices(assignmentData);
    if (!includedQuestionIndices.length) {
      window.alert('This assignment does not currently contain any included questions.');
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

    if (!tracker[assignmentId]) {
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

    if (isTeacherPreview) {
      return previewScratchpads[scratchpadId] || null;
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
    const currentScratchpadTracker = isTeacherPreview
      ? previewTracker
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

    const lifecycle = getAssignmentLifecycle(assignment, Date.now());
    if (lifecycle.isClosed) {
      return { isCorrect: false, status: 'closed', expired: true, remainingAttempts: 0, partialCredit: 0 };
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
    if (getAssignmentLifecycle(assignment, Date.now()).isClosed) {
      return { status: 'closed', remainingAttempts: 0, expired: true, partialCredit: 0 };
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
    if (getAssignmentLifecycle(assignment, Date.now()).isClosed) return;

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

  const inspectAssignmentJson = (rawText = newAssignmentJSON) => {
    try {
      const parsed = parseAssignmentBlueprintText(rawText);
      const metadata = parsed.isPackage
        ? normalizeAssignmentPackageMetadata(parsed.assignment, parsed.questions)
        : null;
      setNewAssignmentJSON(parsed.normalizedText);
      setAssignmentPackagePreview({
        isPackage: parsed.isPackage,
        isBundle: parsed.isBundle === true,
        questionCount: parsed.questions.length,
        repairs: parsed.repairs,
        metadata,
      });
      return { ...parsed, metadata };
    } catch (error) {
      setAssignmentPackagePreview({ error: error.message });
      return null;
    }
  };

  const buildPreflightBundle = (parsed, metadata) => {
    if (parsed.isBundle && parsed.bundleSource) return normalizeLessonBundle(parsed.bundleSource);

    const activityGroups = new Map();
    parsed.questions.forEach((question, questionIndex) => {
      const isDOL = Boolean(metadata?.dol?.enabled && Number(metadata?.dol?.questionIndex) === questionIndex);
      const role = resolveQuestionActivityRole({
        question,
        assignment: { assignmentType: metadata?.assignmentType || newAssignmentType },
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
        title: metadata?.title || newAssignmentTitle || 'Untitled Lesson',
        course: metadata?.curriculum?.course || 'Unknown Course',
        topic: metadata?.curriculum?.topic || null,
      },
      activities: [...activityGroups.values()],
    });
  };

  const openAssignmentPreflight = (rawText = newAssignmentJSON, sourceName = assignmentJsonFileName) => {
    const inspected = inspectAssignmentJson(rawText);
    if (!inspected) return false;
    try {
      const { metadata } = inspected;
      const lessonBundle = buildPreflightBundle(inspected, metadata);
      const dolQuestionFromRole = inspected.questions.findIndex((question) => (
        resolveQuestionActivityRole({ question, assignment: { assignmentType: metadata?.assignmentType || newAssignmentType } }) === 'dol'
      ));
      const packageClassesWereProvided = Boolean(metadata?.provided?.classes);
      const assignedClassPeriods = packageClassesWereProvided
        ? [...(metadata.assignedClassPeriods || [])]
        : [...newAssignmentClasses];
      const initialDraft = {
        title: metadata?.provided?.title ? metadata.title : (metadata?.title || lessonBundle.lessonMetadata?.title || newAssignmentTitle),
        folder: metadata?.provided?.folder ? (metadata.folder || '') : newAssignmentFolder,
        dueAt: toDateTimeLocalInputValue(metadata?.provided?.dueAt ? metadata.dueAt : newAssignmentDate),
        lateDueAt: toDateTimeLocalInputValue(metadata?.provided?.lateDueAt ? metadata.lateDueAt : newAssignmentLateDate),
        releaseAt: toDateTimeLocalInputValue(metadata?.provided?.releaseAt ? metadata.releaseAt : newAssignmentReleaseAt),
        assignmentType: metadata?.provided?.assignmentType ? metadata.assignmentType : newAssignmentType,
        variantMode: metadata?.provided?.variantMode ? metadata.variantMode : (metadata?.variantMode || newAssignmentVariantMode),
        assignedClassPeriods,
        dolEnabled: metadata?.provided?.dol ? metadata.dol.enabled : (lessonBundle.activities.some((activity) => activity.role === 'dol') || newAssignmentDolEnabled),
        dolMinutesBeforeEnd: metadata?.provided?.dol ? metadata.dol.minutesBeforeEnd : newAssignmentDolMinutes,
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
        sourceLabel: `${sourceName || 'Pasted JSON'} · ${inspected.isBundle ? 'Bundle V3' : inspected.isPackage ? `Package V${inspected.schemaVersion}` : 'Legacy array'}`,
      });
      return true;
    } catch (error) {
      setAssignmentPackagePreview({ error: error.message });
      return false;
    }
  };

  const loadAssignmentJsonFile = async (file) => {
    if (!file) return;
    try {
      if (!/\.json$/i.test(file.name || '')) throw new Error('Drop or choose a .json file.');
      if (file.size > 5 * 1024 * 1024) throw new Error('JSON files larger than 5 MB are not accepted in the browser editor.');
      const text = await file.text();
      setAssignmentJsonFileName(file.name);
      setNewAssignmentJSON(text);
      openAssignmentPreflight(text, file.name);
    } catch (error) {
      setAssignmentPackagePreview({ error: `Could not read ${file.name}: ${error.message}` });
    }
  };

  const handleAssignmentJsonFileUpload = async (event) => {
    const file = event.target.files?.[0];
    await loadAssignmentJsonFile(file);
    event.target.value = '';
  };

  const handleAssignmentJsonDrop = async (event) => {
    event.preventDefault();
    setAssignmentJsonDropActive(false);
    await loadAssignmentJsonFile(event.dataTransfer?.files?.[0]);
  };

  const handleAssignmentPreflightRequest = (event) => {
    event?.preventDefault?.();
    openAssignmentPreflight(newAssignmentJSON, assignmentJsonFileName);
  };

  const resolvePackagePrerequisiteId = (metadata) => {
    if (!metadata) return newAssignmentPrerequisite || null;
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
    return metadata.provided?.prerequisite ? null : (newAssignmentPrerequisite || null);
  };

  const handleCreateAssignment = async (event, overrideVariantMode, teacherReview = null) => {
    if (event?.preventDefault) event.preventDefault();

    try {
      const parsed = parseAssignmentBlueprintText(newAssignmentJSON);
      const packageMetadata = parsed.isPackage
        ? normalizeAssignmentPackageMetadata(parsed.assignment, parsed.questions)
        : null;

      const title = String(teacherReview?.title ?? (packageMetadata?.provided?.title ? packageMetadata.title : newAssignmentTitle)).trim();
      const dueValue = teacherReview ? teacherReview.dueAt : packageMetadata?.provided?.dueAt ? packageMetadata.dueAt : newAssignmentDate;
      const lateDueValue = teacherReview ? teacherReview.lateDueAt : packageMetadata?.provided?.lateDueAt ? packageMetadata.lateDueAt : newAssignmentLateDate;
      const releaseValue = teacherReview ? teacherReview.releaseAt : packageMetadata?.provided?.releaseAt ? packageMetadata.releaseAt : newAssignmentReleaseAt;
      const assignmentType = teacherReview?.assignmentType || (packageMetadata?.provided?.assignmentType
        ? packageMetadata.assignmentType
        : newAssignmentType);
      const requestedVariantMode = teacherReview?.variantMode || (packageMetadata?.provided?.variantMode
        ? packageMetadata.variantMode
        : parsed.isPackage
          ? packageMetadata.variantMode
          : newAssignmentVariantMode);
      const variantMode = overrideVariantMode || requestedVariantMode;
      const assignedClassPeriods = teacherReview
        ? [...(teacherReview.assignedClassPeriods || [])]
        : packageMetadata?.provided?.classes
        ? packageMetadata.assignedClassPeriods
        : newAssignmentClasses;

      if (teacherReview && assignedClassPeriods.length === 0) {
        throw new Error('Select at least one class period in the JSON pre-flight review.');
      }

      if (!title) {
        throw new Error('Assignment title is missing. Add assignment.title to the JSON package or enter it under Manual details.');
      }
      if (!dueValue || !lateDueValue) {
        throw new Error('Regular due date and final late due date are required. Put assignment.dueAt and assignment.lateDueAt in the JSON package or enter them under Manual details.');
      }

      const dueAt = new Date(dueValue);
      const lateDueAt = new Date(lateDueValue);
      if (Number.isNaN(dueAt.getTime()) || Number.isNaN(lateDueAt.getTime()) || lateDueAt <= dueAt) {
        throw new Error('The late due date must be later than the regular due date. ISO date-time strings with a timezone offset are recommended in Assignment Package JSON.');
      }

      let releaseAt = null;
      if (releaseValue) {
        const parsedRelease = new Date(releaseValue);
        if (Number.isNaN(parsedRelease.getTime())) throw new Error('The assignment releaseAt value is not a valid date/time.');
        releaseAt = parsedRelease.toISOString();
      }

      if (variantMode === 'personalized' && parsed.questions.some((question) => !isPersonalizedBlueprint(question))) {
        setNewAssignmentJSON(parsed.normalizedText);
        setAssignmentPackagePreview({
          isPackage: parsed.isPackage,
          questionCount: parsed.questions.length,
          repairs: parsed.repairs,
          metadata: packageMetadata,
        });
        setFixedBlueprintConfirmation({
          repairs: parsed.repairs,
          teacherReview: teacherReview ? { ...teacherReview, variantMode: 'shared' } : null,
        });
        return;
      }

      const parsedQuestions = normalizeAssignmentQuestions(
        validateAssignmentQuestions(parsed.questions, { variantMode }),
      );

      const prerequisiteAssignmentId = resolvePackagePrerequisiteId(packageMetadata);
      let dolQuestionIndex = null;
      let dolEnabled = assignmentType === 'practice' && (teacherReview ? teacherReview.dolEnabled === true : newAssignmentDolEnabled);
      let dolMinutesBeforeEnd = Math.max(1, Number(teacherReview ? teacherReview.dolMinutesBeforeEnd : newAssignmentDolMinutes) || 10);

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
        const dolQuestionNumber = Number(newAssignmentDolQuestion);
        dolQuestionIndex = Number.isInteger(dolQuestionNumber) && dolQuestionNumber > 0
          ? Math.min(parsedQuestions.length - 1, dolQuestionNumber - 1)
          : null;
      }

      if (Number.isInteger(dolQuestionIndex)) {
        dolQuestionIndex = Math.max(0, Math.min(parsedQuestions.length - 1, dolQuestionIndex));
      } else {
        dolQuestionIndex = null;
      }

      const folder = teacherReview
        ? normalizeFolderPath(teacherReview.folder) || null
        : packageMetadata?.provided?.folder
        ? normalizeFolderPath(packageMetadata.folder)
        : normalizeFolderPath(newAssignmentFolder) || null;
      const completionRule = packageMetadata?.provided?.completionRule
        ? packageMetadata.completionRule
        : assignmentType === 'notesClasswork'
          ? { minEngagementMinutes: 10, minimumQuestionCompletionPercent: 80 }
          : null;

      if (packageMetadata?.assignmentKey && assignments.some((assignment) => assignment.assignmentKey === packageMetadata.assignmentKey)) {
        throw new Error(`An assignment with assignmentKey "${packageMetadata.assignmentKey}" already exists. Change or remove assignment.assignmentKey if you intend to create a separate copy.`);
      }

      const assignmentPayload = {
        title,
        dueAt: dueAt.toISOString(),
        lateDueAt: lateDueAt.toISOString(),
        dueDate: dueAt.toISOString(),
        assignedClassPeriods,
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
        questions: parsedQuestions,
        folder,
        assignmentKey: packageMetadata?.assignmentKey || null,
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

      assertFirestoreSafeAssignmentPayload(assignmentPayload);

      if (folder && !assignmentFolderPaths.includes(folder)) {
        await saveAssignmentFolderPaths([...assignmentFolderPaths, folder]);
      }

      const bundleLabs = parsed.isBundle
        ? (parsed.bundleSource?.activities || []).filter((activity) => activity?.labDefinition || activity?.isModelingLab)
        : [];
      if (bundleLabs.length) {
        const assignmentRef = doc(collection(db, 'assignments'));
        const batch = writeBatch(db);
        batch.set(assignmentRef, assignmentPayload);
        bundleLabs.forEach((activity) => {
          const privateDefinition = normalizeLabDefinition(activity.labDefinition || activity, { includeEvaluation: true });
          batch.set(doc(db, 'modelingLabDefinitions', privateDefinition.labId), {
            ...privateDefinition,
            assignmentId: assignmentRef.id,
            activityId: activity.activityId || null,
            activityRole: activity.role || 'classwork',
            updatedAt: new Date(),
          });
        });
        await batch.commit();
      } else {
        await addDoc(collection(db, 'assignments'), assignmentPayload);
      }

      if (variantMode !== newAssignmentVariantMode) setNewAssignmentVariantMode(variantMode);
      setNewAssignmentTitle('');
      setNewAssignmentDate('');
      setNewAssignmentLateDate('');
      setNewAssignmentReleaseAt('');
      setNewAssignmentPrerequisite('');
      setNewAssignmentDolQuestion('');
      setNewAssignmentFolder('');
      setAssignmentPackagePreview(null);
      setAssignmentJsonFileName('');
      setAssignmentPreflight(null);
      setNewAssignmentJSON(DEFAULT_ASSIGNMENT_BLUEPRINT);
      await fetchAssignments();
      const repairMessage = parsed.repairs.length
        ? `\n\nPaste formatting repaired automatically: ${parsed.repairs.join('; ')}.`
        : '';
      const sourceMessage = parsed.isBundle ? 'Created from Lesson Bundle V3 JSON after teacher pre-flight review.' : parsed.isPackage ? 'Created from Assignment Package JSON.' : 'Created from legacy question-array JSON.';
      window.alert(`${sourceMessage}\n\n${title}\nAssigned to ${assignedClassPeriods.length || 'all'} class period(s)${folder ? `\nFolder: ${folder}` : ''}.${repairMessage}`);
    } catch (error) {
      setAssignmentPackagePreview({ error: error.message });
      window.alert(`Could not create assignment. ${error.message}`);
    }
  };

  const confirmSwitchToSharedAndPublish = () => {
    const teacherReview = fixedBlueprintConfirmation?.teacherReview || null;
    setFixedBlueprintConfirmation(null);
    setNewAssignmentVariantMode('shared');
    handleCreateAssignment(null, 'shared', teacherReview);
  };

  const confirmAssignmentPreflight = async ({ draft }) => {
    setAssignmentPreflightBusy(true);
    try {
      await handleCreateAssignment(null, null, draft);
    } finally {
      setAssignmentPreflightBusy(false);
    }
  };

  const cancelFixedBlueprintConfirmation = () => {
    setFixedBlueprintConfirmation(null);
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
    if (!window.confirm(`Release Quiz/Test correctness, solution review, and recorded grades for “${assignment.title}” to students now? This cannot make already-viewed feedback private again.`)) return;
    setFeedbackReleaseBusyId(assignment.id);
    try {
      const releasedAt = new Date().toISOString();
      await updateDoc(doc(db, 'assignments', assignment.id), {
        feedbackReleased: true,
        feedbackReleasedAt: releasedAt,
        updatedAt: releasedAt,
      });
    } catch (error) {
      console.error(error);
      window.alert(`Could not release assessment feedback. ${error.message}`);
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
      window.alert(`Could not update the student support profile. ${error.message}`);
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
    window.alert('Class schedule saved. DOL windows now use these period times.');
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
    window.alert('Duplicated. The copy is unpublished from Google Classroom and has no student records.');
  };

  const handleToggleArchiveAssignment = async (assignment) => {
    await updateDoc(doc(db, 'assignments', assignment.id), { archived: !assignment.archived });
    await fetchAssignments();
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
      window.alert('The late due date must be later than the regular due date.');
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
      window.alert('Allow pop-ups to open the printable IEP support report.');
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

  const renderFixedBlueprintConfirmation = () => {
    if (!fixedBlueprintConfirmation) return null;
    return (
      <div
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) cancelFixedBlueprintConfirmation();
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
          aria-labelledby="fixed-blueprint-title"
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
                color: '#b06000',
                fontWeight: 'bold',
                fontSize: '13px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '8px',
              }}
            >
              This blueprint has fixed questions
            </div>
            <h2 id="fixed-blueprint-title" style={{ margin: 0, color: '#202124' }}>
              Switch to Shared exact version?
            </h2>
          </div>

          <div style={{ padding: '28px' }}>
            <div
              style={{
                background: '#fef7e0',
                color: '#7a4f01',
                border: '1px solid #fce8a2',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '16px',
                lineHeight: 1.5,
              }}
            >
              One or more questions in this blueprint are fixed (no generator and
              fewer than two variants), but Problem versions is set to{' '}
              <strong>Different stable version per student</strong>. Personalized mode
              needs every question to be able to generate a different version for
              each student, so this assignment can&apos;t publish as written.
            </div>
            <p style={{ color: '#3c4043', lineHeight: 1.55, margin: 0 }}>
              Switching to <strong>Shared exact version</strong> lets fixed questions
              publish as-is, and every student sees the same version. Questions that
              already have a generator or two or more variants will keep generating
              different versions per student either way.
            </p>
          </div>

          <div
            style={{
              padding: '18px 28px',
              borderTop: '1px solid #e8eaed',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              background: '#f8f9fa',
            }}
          >
            <button
              type="button"
              onClick={cancelFixedBlueprintConfirmation}
              style={{
                padding: '10px 18px',
                background: '#fff',
                color: '#3c4043',
                border: '1px solid #dadce0',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Return to Assignment
            </button>
            <button
              type="button"
              onClick={confirmSwitchToSharedAndPublish}
              style={{
                padding: '10px 18px',
                background: '#1a73e8',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Switch and Publish
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
    const workingTracker = preview ? previewTracker : recordedTracker;
    const recordedGrade = calculateGrade(recordedTracker, assignment);
    const progress = calculatePracticeProgress(workingTracker, assignment);
    const dolState = getDOLState({ assignment, schedule: classSchedule, classPeriod: user?.classPeriod, nowValue: now });
    const currentRecord = normalizeQuestionRecord(workingTracker?.[currentQuestionIndex]);
    const currentIsDOL = activeQuestionRole === 'dol' && dolState.enabled && currentQuestionIndex === dolState.questionIndex;
    const assignmentFeedbackHeld = !preview && assignmentHasHeldTeacherFeedback(assignment);
    const currentFeedbackReleased = assignmentFeedbackWasReleased(assignment)
      || (activeActivityPolicy.feedback === 'afterAssignmentSubmit' && ['correct', 'expired'].includes(currentRecord.status));
    const generationStudentKey = assignment.variantMode === 'shared'
      ? `shared-version:${assignment.id}`
      : preview ? 'teacher-preview' : user?.id || 'anonymous';
    const draftSessionMode = preview ? 'preview' : lifecycle.isClosed ? 'closed-review' : lifecycle.isLate ? 'late' : 'graded';
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

    const lifecycleBadge = lifecycle.isClosed
      ? { label: 'Permanently closed', background: '#fce8e6', color: '#a50e0e' }
      : lifecycle.isLate
        ? { label: 'Late — still open', background: '#fff4ce', color: '#7a4f00' }
        : lifecycle.isScheduled
          ? { label: 'Scheduled', background: '#e8eaed', color: '#3c4043' }
          : { label: 'On-time access', background: '#e6f4ea', color: '#137333' };

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

          {lifecycle.isClosed && !preview && (
            <section style={{ marginBottom: '16px', padding: '18px 22px', borderRadius: '13px', background: '#f1f3f4', border: '2px solid #5f6368', color: '#3c4043', textAlign: 'left' }}>
              <strong style={{ display: 'block', fontSize: '20px' }}>Assignment permanently closed</strong>
              <span>The final late deadline expired. Saved work and solution reviews remain available, but answers, graphs, scratchpads, Undo, and replacement questions are read-only.</span>
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
                <div style={{ fontSize: '12px', color: '#5f6368', textTransform: 'uppercase', fontWeight: 900 }}>{preview ? 'Preview progress' : lifecycle.isClosed ? 'Final recorded grade' : lifecycle.isLate ? 'Current late grade' : 'Current grade'}</div>
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

          <div className="mathmaster-question-navigation" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            {includedQuestionIndices.map((index, visiblePosition) => {
              const question = questions[index];
              const record = normalizeQuestionRecord(workingTracker?.[index]);
              const isDOLQuestion = dolState.enabled && index === dolState.questionIndex;
              const cardRole = resolveQuestionActivityRole({ question, assignment, isDOL: isDOLQuestion });
              const cardPolicy = getEffectiveActivityPolicy(cardRole);
              const cardFeedbackHeld = !preview && cardPolicy.feedback === 'teacherRelease' && !assignmentFeedbackWasReleased(assignment);
              const storedCardState = getQuestionCardState(workingTracker?.[index]);
              const cardState = cardFeedbackHeld && ['correct', 'expired'].includes(record.status)
                ? { background: '#eef4ff', color: '#174ea6', label: 'Submitted · feedback held' }
                : storedCardState;
              const dolUnavailable = isDOLQuestion && !preview && !lifecycle.isClosed && !['active', 'ended'].includes(dolState.status);
              return (
                <button
                  type="button"
                  key={index}
                  onClick={() => changeQuestion(index)}
                  style={{
                    padding: '14px',
                    cursor: dolUnavailable ? 'not-allowed' : 'pointer',
                    backgroundColor: dolUnavailable ? '#f1f3f4' : cardState.background,
                    color: dolUnavailable ? '#80868b' : cardState.color,
                    border: currentQuestionIndex === index ? '3px solid #1a73e8' : isDOLQuestion ? '2px solid #9334e6' : '1px solid #dadce0',
                    borderRadius: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    boxShadow: currentQuestionIndex === index ? '0 4px 12px rgba(26,115,232,0.2)' : 'none',
                    opacity: dolUnavailable ? 0.7 : 1,
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Question {visiblePosition + 1}</div>
                  <div style={{ fontSize: '12px', marginTop: '4px', textTransform: 'capitalize' }}>{question.type}</div>
                  {isDOLQuestion && <div style={{ marginTop: '5px', padding: '3px 7px', borderRadius: '999px', background: '#f3e8fd', color: '#681da8', fontSize: '10px', fontWeight: 900 }}>{dolUnavailable ? 'DOL opens later' : 'DOL'}</div>}
                  <div style={{ fontSize: '12px', marginTop: '7px', fontWeight: 'bold' }}>{dolUnavailable ? 'Locked until DOL window' : cardState.label}</div>
                  {record.totalAttempts > 0 && <div style={{ fontSize: '11px', marginTop: '3px', opacity: 0.85 }}>{record.totalAttempts} total attempt{record.totalAttempts === 1 ? '' : 's'}</div>}
                </button>
              );
            })}
          </div>

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
              assignmentLocked={!preview && lifecycle.isClosed}
              dolMode={!preview && currentIsDOL && dolState.status === 'active'}
              maximumAttempts={activeActivityPolicy.attempts}
              activityRole={activeQuestionRole}
              activityPolicy={activeActivityPolicy}
              feedbackReleased={currentFeedbackReleased}
              replacementWarning={replacementWarning}
              draftKey={buildQuestionDraftKey({
                studentId: preview ? 'teacher-preview' : user?.id || 'anonymous',
                assignmentId: activeAssignmentId,
                questionIndex: currentQuestionIndex,
                variantIndex: currentRecord.variantIndex,
                sessionMode: draftSessionMode,
              })}
              assignmentId={activeAssignmentId}
              executionScope={preview ? 'teacherPreview' : 'student'}
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
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const todayOverride = classSchedule.modifiedSchedules?.[todayKey]?.periods || null;
    const selectedAssignment = assignments.find((assignment) => assignment.id === gradebookFilter.assignmentId) || null;
    const selectedClassStudents = allStudents.filter((student) => (student.classPeriod || 'Unassigned') === gradebookFilter.classPeriod);
    const assignmentsForSelectedClass = assignments.filter((assignment) => !gradebookFilter.classPeriod || assignmentIsForStudent(assignment, gradebookFilter.classPeriod));
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

    return (
      <div style={{ fontFamily: '"Segoe UI", sans-serif', backgroundColor: '#f8f9fa', minHeight: '100vh', padding: '20px' }}>
        {renderDeleteAssignmentDialog()}
        {renderExportJsonDialog()}
        {renderFixedBlueprintConfirmation()}
        {renderTeacherScratchpadDialog()}
        {assignmentPreflight && (
          <LessonPreflightModal
            key={`${assignmentPreflight.lessonBundle.bundleId}-${assignmentPreflight.sourceLabel}`}
            lessonBundle={assignmentPreflight.lessonBundle}
            initialDraft={assignmentPreflight.initialDraft}
            classPeriods={CLASS_PERIODS}
            sourceLabel={assignmentPreflight.sourceLabel}
            onClose={() => setAssignmentPreflight(null)}
            onConfirmPublish={confirmAssignmentPreflight}
            busy={assignmentPreflightBusy}
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
        <div style={{ maxWidth: '1360px', margin: '0 auto', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'stretch' }}>
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
            <button onClick={handleLogout} style={{ padding: '8px 16px', background: '#fff', color: '#d93025', border: '1px solid #d93025', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Log Out</button>
          </header>

          <div style={{ padding: '30px' }}>
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
                <form onSubmit={handleAssignmentPreflightRequest} style={{ marginBottom: '38px', background: '#f8f9fa', padding: '22px', borderRadius: '10px', border: '1px solid #e8eaed' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
                    <div style={{ textAlign: 'left', maxWidth: '760px' }}>
                      <h3 style={{ margin: '0 0 5px', color: '#202124' }}>Assignment / Bundle JSON</h3>
                      <p style={{ margin: 0, color: '#5f6368', lineHeight: 1.55, fontSize: '13px' }}>
                        Drop, upload, or paste Assignment Package / Bundle V3 JSON. JSON supplies the starting plan; the teacher reviews and can override assignment details and class periods before anything is created.
                      </p>
                    </div>
                  </div>

                  <div
                    className="mathmaster-json-dropzone"
                    onDragEnter={(event) => { event.preventDefault(); setAssignmentJsonDropActive(true); }}
                    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setAssignmentJsonDropActive(true); }}
                    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setAssignmentJsonDropActive(false); }}
                    onDrop={handleAssignmentJsonDrop}
                    style={{ marginBottom: 14, padding: '18px', border: `2px dashed ${assignmentJsonDropActive ? '#1a73e8' : '#9fb8dd'}`, borderRadius: 11, background: assignmentJsonDropActive ? '#e8f0fe' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', textAlign: 'left', transition: 'background 120ms ease, border-color 120ms ease' }}
                  >
                    <div><strong style={{ color: '#174ea6' }}>↥ Drag &amp; drop a .json file here</strong><div style={{ marginTop: 3, color: '#5f6368', fontSize: 12 }}>The pre-flight review opens automatically after the file is read.</div></div>
                    <label style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 15px', border: '1px solid #1a73e8', borderRadius: 8, background: '#fff', color: '#1a73e8', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Browse .json
                      <input type="file" accept="application/json,.json" onChange={handleAssignmentJsonFileUpload} style={{ display: 'none' }} />
                    </label>
                  </div>

                  {assignmentJsonFileName && <div style={{ textAlign: 'left', margin: '0 0 10px', color: '#5f6368', fontSize: '12px' }}>Loaded file: <strong>{assignmentJsonFileName}</strong></div>}

                  <textarea
                    value={newAssignmentJSON}
                    onChange={(event) => { setNewAssignmentJSON(event.target.value); setAssignmentPackagePreview(null); }}
                    aria-label="Assignment Package JSON"
                    style={{ width: '100%', height: '280px', padding: '12px', borderRadius: '8px', border: '1px solid #c7cdd6', fontFamily: 'monospace', boxSizing: 'border-box', lineHeight: 1.45, background: '#fff' }}
                  />

                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
                    <button type="button" onClick={() => inspectAssignmentJson()} style={{ padding: '9px 14px', border: '1px solid #1a73e8', borderRadius: '7px', background: '#fff', color: '#1a73e8', cursor: 'pointer', fontWeight: 'bold' }}>Read JSON Details</button>
                    <button type="submit" style={{ padding: '10px 20px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 'bold' }}>Preview &amp; Assign</button>
                  </div>

                  {assignmentPackagePreview?.error && (
                    <div style={{ marginTop: '14px', padding: '12px 14px', borderRadius: '8px', background: '#fce8e6', border: '1px solid #f1a5a0', color: '#a50e0e', textAlign: 'left', fontSize: '13px' }}>
                      <strong>JSON needs attention:</strong> {assignmentPackagePreview.error}
                    </div>
                  )}

                  {assignmentPackagePreview && !assignmentPackagePreview.error && (
                    <div style={{ marginTop: '14px', padding: '14px', borderRadius: '10px', background: assignmentPackagePreview.isPackage ? '#e6f4ea' : '#fff8e1', border: `1px solid ${assignmentPackagePreview.isPackage ? '#9bd2aa' : '#f0c761'}`, textAlign: 'left' }}>
                      <div style={{ fontWeight: 900, color: assignmentPackagePreview.isPackage ? '#137333' : '#7a4f00', marginBottom: '8px' }}>
                        {assignmentPackagePreview.isBundle ? 'Lesson Bundle V3 detected' : assignmentPackagePreview.isPackage ? 'Assignment Package detected' : 'Legacy question-array JSON detected'} · {assignmentPackagePreview.questionCount} question(s)
                      </div>
                      {assignmentPackagePreview.isPackage && assignmentPackagePreview.metadata && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '8px 14px', color: '#3c4043', fontSize: '12px' }}>
                          <span><strong>Title:</strong> {assignmentPackagePreview.metadata.title || 'Use manual fallback'}</span>
                          <span><strong>Folder:</strong> {assignmentPackagePreview.metadata.folder || 'Uncategorized'}</span>
                          <span><strong>Type:</strong> {assignmentPackagePreview.metadata.assignmentType === 'notesClasswork' ? 'Guided Notes / Classwork' : 'Practice / Homework'}</span>
                          <span><strong>Versions:</strong> {assignmentPackagePreview.metadata.variantMode === 'shared' ? 'Shared exact version' : 'Personalized'}</span>
                          <span><strong>Classes:</strong> {assignmentPackagePreview.metadata.provided?.classes ? (assignmentPackagePreview.metadata.assignedClassPeriods.join(', ') || 'All periods') : 'Use manual fallback'}</span>
                          <span><strong>Due:</strong> {assignmentPackagePreview.metadata.dueAt || 'Use manual fallback'}</span>
                          <span><strong>Late close:</strong> {assignmentPackagePreview.metadata.lateDueAt || 'Use manual fallback'}</span>
                          <span><strong>DOL:</strong> {assignmentPackagePreview.metadata.dol?.enabled ? `Enabled · final ${assignmentPackagePreview.metadata.dol.minutesBeforeEnd} min` : 'Off'}</span>
                        </div>
                      )}
                      {assignmentPackagePreview.repairs?.length > 0 && <div style={{ marginTop: '8px', fontSize: '11px', color: '#5f6368' }}>Paste repairs: {assignmentPackagePreview.repairs.join('; ')}</div>}
                    </div>
                  )}

                  <details style={{ marginTop: '16px', border: '1px solid #dfe3e7', borderRadius: '8px', background: '#fff', textAlign: 'left' }}>
                    <summary style={{ cursor: 'pointer', padding: '12px 14px', fontWeight: 'bold', color: '#3c4043' }}>Manual details and fallbacks (optional)</summary>
                    <div style={{ padding: '0 14px 14px' }}>
                      <p style={{ margin: '0 0 14px', color: '#5f6368', fontSize: '12px' }}>Use these as starting values for legacy JSON or omitted package fields. The pre-flight review is the final authority before creation.</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '15px', marginBottom: '18px' }}>
                        <label style={{ fontWeight: 'bold' }}>Assignment title
                          <input type="text" value={newAssignmentTitle} onChange={(event) => setNewAssignmentTitle(event.target.value)} placeholder="Optional when JSON has assignment.title" style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', boxSizing: 'border-box', border: '1px solid #c9ced6', borderRadius: '6px' }} />
                        </label>
                        <label style={{ fontWeight: 'bold' }}>Library folder
                          <input type="text" list="assignment-folder-options" value={newAssignmentFolder} onChange={(event) => setNewAssignmentFolder(event.target.value)} placeholder="Algebra I/Module 1/Topic 1" style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', boxSizing: 'border-box', border: '1px solid #c9ced6', borderRadius: '6px' }} />
                          <datalist id="assignment-folder-options">{assignmentFolderPaths.map((path) => <option key={path} value={path} />)}</datalist>
                        </label>
                        <label style={{ fontWeight: 'bold' }}>Regular due date and time
                          <input type="datetime-local" value={newAssignmentDate} onChange={(event) => setNewAssignmentDate(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', boxSizing: 'border-box', border: '1px solid #c9ced6', borderRadius: '6px' }} />
                        </label>
                        <label style={{ fontWeight: 'bold' }}>Final late due date and time
                          <input type="datetime-local" value={newAssignmentLateDate} onChange={(event) => setNewAssignmentLateDate(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', boxSizing: 'border-box', border: '1px solid #c9ced6', borderRadius: '6px' }} />
                        </label>
                        <label style={{ fontWeight: 'bold' }}>Assignment type
                          <select value={newAssignmentType} onChange={(event) => setNewAssignmentType(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', border: '1px solid #c9ced6', borderRadius: '6px' }}>
                            <option value="practice">Practice / Homework with DOL</option>
                            <option value="notesClasswork">Guided Notes / Classwork</option>
                          </select>
                        </label>
                        <label style={{ fontWeight: 'bold' }}>Problem versions
                          <select value={newAssignmentVariantMode} onChange={(event) => setNewAssignmentVariantMode(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', border: '1px solid #c9ced6', borderRadius: '6px' }}>
                            <option value="personalized">Different stable version per student</option>
                            <option value="shared">Exact same version for every student</option>
                          </select>
                        </label>
                        <label style={{ fontWeight: 'bold' }}>Automatic release time
                          <input type="datetime-local" value={newAssignmentReleaseAt} onChange={(event) => setNewAssignmentReleaseAt(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', boxSizing: 'border-box', border: '1px solid #c9ced6', borderRadius: '6px' }} />
                        </label>
                        {newAssignmentType === 'practice' && (
                          <label style={{ fontWeight: 'bold' }}>Prerequisite notes/classwork
                            <select value={newAssignmentPrerequisite} onChange={(event) => setNewAssignmentPrerequisite(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', border: '1px solid #c9ced6', borderRadius: '6px' }}>
                              <option value="">No prerequisite</option>
                              {assignments.filter((assignment) => assignment.assignmentType === 'notesClasswork').map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}
                            </select>
                          </label>
                        )}
                      </div>

                      <fieldset style={{ margin: '0 0 18px', padding: '15px', border: '1px solid #d8dde6', borderRadius: '8px' }}>
                        <legend style={{ fontWeight: 900 }}>Assign to class periods</legend>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                          {CLASS_PERIODS.map((period) => <label key={period} style={{ padding: '7px 10px', background: newAssignmentClasses.includes(period) ? '#e8f0fe' : '#fff', border: '1px solid #c5d5ef', borderRadius: '999px', fontWeight: 'bold' }}><input type="checkbox" checked={newAssignmentClasses.includes(period)} onChange={() => setNewAssignmentClasses((current) => current.includes(period) ? current.filter((item) => item !== period) : [...current, period])} /> {period}</label>)}
                        </div>
                      </fieldset>

                      {newAssignmentType === 'practice' && (
                        <fieldset style={{ margin: 0, padding: '15px', border: '1px solid #d8dde6', borderRadius: '8px' }}>
                          <legend style={{ fontWeight: 900 }}>DOL configuration</legend>
                          <label style={{ fontWeight: 'bold', marginRight: '18px' }}><input type="checkbox" checked={newAssignmentDolEnabled} onChange={(event) => setNewAssignmentDolEnabled(event.target.checked)} /> Enable DOL during final minutes</label>
                          <label style={{ display: 'inline-block', fontWeight: 'bold', margin: '8px 18px 0 0' }}>Minutes before class ends <input type="number" min="1" max="30" value={newAssignmentDolMinutes} onChange={(event) => setNewAssignmentDolMinutes(event.target.value)} style={{ width: '70px', marginLeft: '6px', padding: '7px' }} /></label>
                          <label style={{ display: 'inline-block', fontWeight: 'bold', marginTop: '8px' }}>DOL question number <input type="number" min="1" value={newAssignmentDolQuestion} onChange={(event) => setNewAssignmentDolQuestion(event.target.value)} placeholder="Auto" style={{ width: '80px', marginLeft: '6px', padding: '7px' }} /></label>
                        </fieldset>
                      )}
                    </div>
                  </details>

                  <details style={{ marginTop: '12px', border: '1px solid #dfe3e7', borderRadius: '8px', background: '#fff', textAlign: 'left' }}>
                    <summary style={{ cursor: 'pointer', padding: '12px 14px', fontWeight: 'bold', color: '#174ea6' }}>Assignment Package and question guide</summary>
                    <pre style={{ margin: 0, padding: '0 14px 16px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '12px', lineHeight: 1.55, color: '#3c4043' }}>{MATH_BLUEPRINT_GUIDE}</pre>
                  </details>
                </form>

                <h2>Assignments</h2>
                {libraryNavigation && (libraryNavigation.folder || libraryNavigation.smartView) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '10px 14px', marginBottom: '14px', background: '#e8f0fe', border: '1px solid #aecbfa', borderRadius: '8px', color: '#174ea6', fontWeight: 'bold', fontSize: '13px' }}>
                    <span>Filtered from Library{libraryNavigation.folder ? ` · ${libraryNavigation.folder}` : ''}{libraryNavigation.smartView ? ` · ${SMART_VIEWS.find((view) => view.id === libraryNavigation.smartView)?.label || libraryNavigation.smartView}` : ''}</span>
                    <button type="button" onClick={() => setLibraryNavigation(null)} style={{ padding: '6px 10px', border: '1px solid #1a73e8', borderRadius: '6px', background: '#fff', color: '#1a73e8', fontWeight: 'bold', cursor: 'pointer' }}>Clear filter</button>
                  </div>
                )}
                {assignments.filter((assignment) => (
                  assignmentFolderMatches(assignment, libraryNavigation?.folder)
                  && matchesSmartView(assignment, libraryNavigation?.smartView, { nowValue: now, classSchedule })
                )).map((assignment) => {
                  const lifecycle = getAssignmentLifecycle(assignment, now);
                  const affectedStudents = allStudents.filter((student) => student.gradesByAssignment?.[assignment.id] !== undefined).length;
                  return (
                    <article key={assignment.id} style={{ background: '#f8f9fa', padding: '18px', marginBottom: '12px', borderRadius: '10px', border: `1px solid ${lifecycle.isLate ? '#f9ab00' : lifecycle.isClosed ? '#d93025' : '#e0e3e7'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ flex: '1 1 440px', textAlign: 'left' }}>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <strong style={{ fontSize: '18px' }}>{assignment.title}</strong>
                            <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: lifecycle.isClosed ? '#fce8e6' : lifecycle.isLate ? '#fff4ce' : '#e6f4ea', color: lifecycle.isClosed ? '#a50e0e' : lifecycle.isLate ? '#7a4f00' : '#137333' }}>{lifecycle.status.toUpperCase()}</span>
                            <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: '#e8f0fe', color: '#174ea6' }}>{assignment.assignmentType === 'notesClasswork' ? 'NOTES / CLASSWORK' : 'PRACTICE'}</span>
                            {assignment.variantMode === 'shared' && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: '#e6f4ea', color: '#137333' }}>SHARED VERSION</span>}
                            {assignment.archived && <span style={{ padding: '4px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 900, background: '#f1f3f4', color: '#5f6368' }}>ARCHIVED</span>}
                          </div>
                          <div style={{ marginTop: '7px', color: '#5f6368', fontSize: '13px', lineHeight: 1.55 }}>{getIncludedQuestionIndices(assignment).length} included question{getIncludedQuestionIndices(assignment).length === 1 ? '' : 's'}{(assignment.questions?.length || 0) !== getIncludedQuestionIndices(assignment).length ? ` · ${assignment.questions.length - getIncludedQuestionIndices(assignment).length} excluded` : ''} · Classes: {(assignment.assignedClassPeriods || CLASS_PERIODS).join(', ')}<br />Due {formatDueDate(assignment)} · Late close {formatLateDueDate(assignment)} · {affectedStudents} student record{affectedStudents === 1 ? '' : 's'}</div>
                        </div>
                        <AssignmentCardMenu
                          ariaLabel={`More actions for ${assignment.title}`}
                          items={[
                            { key: 'preview', label: 'View as Student', onClick: () => startTeacherPreview(assignment.id) },
                            { key: 'edit-questions', label: 'Edit Questions', onClick: () => openQuestionEditor(assignment) },
                            { key: 'export-json', label: 'Export JSON', onClick: () => { setExportJsonAssignment(assignment); setExportJsonCopied(false); } },
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
              <div>
                <h2 style={{ marginTop: 0 }}>Students and Inclusion Supports</h2>
                <p style={{ color: '#5f6368' }}>Inclusion accommodations change how a student learns. Modifications change question generation and are reported separately with a MOD indicator.</p>
                {allStudents.map((student) => (
                  <article key={student.id} style={{ marginBottom: '14px', padding: '18px', border: '1px solid #d8dde6', borderRadius: '10px', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                      <div><strong style={{ fontSize: '18px' }}>{student.id}</strong><div style={{ color: '#5f6368', marginTop: '4px' }}>{student.classPeriod || 'Unassigned'}</div>{(() => { const mastery = teacherMasteryProfilesByStudentId[student.id]; return <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '7px' }}><span style={{ padding: '3px 7px', borderRadius: '999px', background: '#e8f0fe', color: '#174ea6', fontSize: '10px', fontWeight: 900 }}>Estimated {mastery?.overall?.performance?.shortLabel || 'Insufficient'}</span><span style={{ padding: '3px 7px', borderRadius: '999px', background: '#f1f3f4', color: '#5f6368', fontSize: '10px', fontWeight: 900 }}>{mastery?.overall?.confidence || 'Low'} confidence</span><span style={{ padding: '3px 7px', borderRadius: '999px', background: '#e6f4ea', color: '#137333', fontSize: '10px', fontWeight: 900 }}>Recommended Band {mastery?.overall?.recommendedGeneratorBand || 3}</span></div>; })()}</div>
                      <select value={student.classPeriod || 'Unassigned'} onChange={(event) => handleChangeClassPeriod(student.id, event.target.value)} style={{ padding: '9px', borderRadius: '6px', border: '1px solid #ccc' }}><option value="Unassigned">Unassigned</option>{CLASS_PERIODS.map((period) => <option key={period} value={period}>{period}</option>)}</select>
                      <label style={{ padding: '9px 12px', borderRadius: '999px', background: student.profile?.inclusionStatus ? '#efe4ff' : '#f1f3f4', color: student.profile?.inclusionStatus ? '#6f2da8' : '#3c4043', fontWeight: 900 }}><input type="checkbox" checked={Boolean(student.profile?.inclusionStatus)} onChange={(event) => handleUpdateStudentProfile(student.id, { inclusionStatus: event.target.checked })} /> Inclusion</label>
                      <button onClick={() => openIEPReport(student)} style={{ padding: '9px 13px', border: '1px solid #6f2da8', borderRadius: '7px', background: '#fff', color: '#6f2da8', fontWeight: 900, cursor: 'pointer' }}>Generate IEP Report</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginTop: '15px' }}>
                      {Object.entries(supportOptions).map(([group, options]) => (
                        <fieldset key={group} style={{ border: '1px solid #d8dde6', borderRadius: '8px', padding: '12px' }}><legend style={{ fontWeight: 900, textTransform: 'capitalize' }}>{group}</legend>{options.map(([value, label]) => <label key={value} style={{ display: 'block', margin: '8px 0' }}><input type="checkbox" checked={(student.profile?.[group] || []).includes(value)} onChange={() => toggleStudentSupport(student, group, value)} /> {label}</label>)}</fieldset>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}

            {teacherTab === 'home' && (
              <TeacherHome
                allStudents={allStudents}
                assignments={assignments}
                classSchedule={classSchedule}
                nowValue={now}
                onSelectPeriod={handleGoToClassFromHome}
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
              <div style={{ display: 'grid', gap: '34px' }}>
                <TeacherAnalyticsDashboard students={allStudents} masteryProfilesByStudentId={teacherMasteryProfilesByStudentId} />
                <ShowcaseClassroomDashboard />
              </div>
            )}

            {teacherTab === 'exams' && (
              <TeacherSecureExamDashboard students={allStudents} />
            )}

            {teacherTab === 'classroom' && <ClassroomSync assignments={assignments} />}
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
          onExit={() => setStudentDashboardMode('assignments')}
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
    const visibleAssignments = assignments.filter((assignment) => assignmentIsForStudent(assignment, user.classPeriod));
    const canResumeAssignment = (assignment) => {
      const lifecycle = getAssignmentLifecycle(assignment, now);
      const access = prerequisiteAccess({ assignment, classworkGradesByAssignment, nowValue: now });
      return lifecycle.isClosed || (access.open && (!lifecycle.isScheduled || access.reason === 'prerequisiteMet'));
    };
    const savedResumeAssignment = visibleAssignments.find((assignment) => assignment.id === resumeAction?.assignmentId && canResumeAssignment(assignment));
    const fallbackResumeAssignment = visibleAssignments.find((assignment) => {
      if (!canResumeAssignment(assignment)) return false;
      const assignmentTracker = tracker[assignment.id];
      if (!assignmentTracker) return false;
      return assignment.questions?.some((question, index) => questionIsIncluded(question) && !['correct', 'expired'].includes(normalizeQuestionRecord(assignmentTracker[index]).status));
    });
    const resumeAssignment = savedResumeAssignment || fallbackResumeAssignment || null;
    const fallbackQuestionIndex = resumeAssignment?.questions?.findIndex((question, index) => questionIsIncluded(question) && !['correct', 'expired'].includes(normalizeQuestionRecord(tracker[resumeAssignment.id]?.[index]).status)) ?? -1;
    const savedResumeIncluded = savedResumeAssignment ? getIncludedQuestionIndices(savedResumeAssignment) : [];
    const requestedResumeIndex = Number(resumeAction?.questionIndex) || 0;
    const resumeQuestionIndex = savedResumeAssignment
      ? (savedResumeIncluded.includes(requestedResumeIndex) ? requestedResumeIndex : (savedResumeIncluded[0] ?? 0))
      : Math.max(0, fallbackQuestionIndex);
    const resumeLifecycle = getAssignmentLifecycle(resumeAssignment, now);
    const activeDols = visibleAssignments.map((assignment) => ({ assignment, lifecycle: getAssignmentLifecycle(assignment, now), state: getDOLState({ assignment, schedule: classSchedule, classPeriod: user.classPeriod, nowValue: now }) })).filter(({ state, lifecycle }) => lifecycle.isOpen && state.status === 'active');
    const activeDolIds = new Set(activeDols.map(({ assignment }) => assignment.id));

    // Every assignment is bucketed once here so the same lifecycle/access
    // computation isn't repeated per section, and so the card below always
    // renders from this one source of truth regardless of which section
    // it lands in.
    const isAssignmentDone = (assignment, assignmentTracker, lifecycle) => {
      if (assignment.assignmentType === 'notesClasswork') {
        return classworkGradesByAssignment[assignment.id]?.score === 100 || lifecycle.isClosed;
      }
      const included = getIncludedQuestionIndices(assignment);
      const fullyTerminal = included.length > 0 && assignmentTracker
        && included.every((index) => ['correct', 'expired'].includes(normalizeQuestionRecord(assignmentTracker[index]).status));
      return fullyTerminal || lifecycle.isClosed;
    };
    const assignmentEntries = visibleAssignments
      .filter((assignment) => assignment.id !== resumeAssignment?.id && !activeDolIds.has(assignment.id))
      .map((assignment) => {
        const assignmentTracker = tracker[assignment.id];
        const isAttempted = !!assignmentTracker;
        const lifecycle = getAssignmentLifecycle(assignment, now);
        const access = prerequisiteAccess({ assignment, classworkGradesByAssignment, nowValue: now });
        const recordedGrade = calculateGrade(assignmentTracker, assignment);
        const activity = assignmentActivity[assignment.id] || {};
        const classwork = classworkGradesByAssignment[assignment.id];
        const dol = getDOLState({ assignment, schedule: classSchedule, classPeriod: user.classPeriod, nowValue: now });
        const disabled = (lifecycle.isScheduled && access.reason !== 'prerequisiteMet') || !access.open;
        const done = isAssignmentDone(assignment, assignmentTracker, lifecycle);
        const feedbackHeld = assignmentHasHeldTeacherFeedback(assignment);
        const dueSoon = matchesSmartView(assignment, 'today', { nowValue: now }) || lifecycle.isLate;
        const bucket = done ? 'completed' : (!lifecycle.isScheduled && access.open && dueSoon) ? 'doNow' : 'comingUp';
        return { assignment, assignmentTracker, isAttempted, lifecycle, access, recordedGrade, activity, classwork, dol, disabled, feedbackHeld, bucket };
      });
    const doNowEntries = assignmentEntries.filter((entry) => entry.bucket === 'doNow');
    const comingUpEntries = assignmentEntries.filter((entry) => entry.bucket === 'comingUp');
    const completedEntries = assignmentEntries.filter((entry) => entry.bucket === 'completed');

    const renderAssignmentCard = ({ assignment, isAttempted, lifecycle, access, recordedGrade, activity, classwork, dol, disabled, feedbackHeld }) => {
      const statusStyle = lifecycle.isClosed ? { border: '#d93025', bg: '#fce8e6', color: '#a50e0e', label: 'Permanently closed' } : lifecycle.isLate ? { border: '#f9ab00', bg: '#fff4ce', color: '#7a4f00', label: 'Late' } : lifecycle.isScheduled ? { border: '#9aa0a6', bg: '#f1f3f4', color: '#3c4043', label: 'Scheduled' } : { border: '#d8dde6', bg: '#e6f4ea', color: '#137333', label: 'On time' };
      return (
        <article key={assignment.id} style={{ background: '#fff', padding: '21px 26px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap', border: `2px solid ${statusStyle.border}` }}>
          <div style={{ textAlign: 'left', flex: '1 1 470px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}><h3 style={{ margin: 0, color: '#202124' }}>{assignment.title}</h3><span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', padding: '4px 8px', borderRadius: '999px', background: statusStyle.bg, color: statusStyle.color }}>{statusStyle.label}</span><span style={{ fontSize: '11px', fontWeight: 900, padding: '4px 8px', borderRadius: '999px', background: '#e8f0fe', color: '#174ea6' }}>{assignment.assignmentType === 'notesClasswork' ? 'NOTES / CLASSWORK' : 'PRACTICE'}</span>{assignment.variantMode === 'shared' && <span style={{ fontSize: '11px', fontWeight: 900, padding: '4px 8px', borderRadius: '999px', background: '#e6f4ea', color: '#137333' }}>SAME CLASS VERSION</span>}</div>
            <div style={{ color: '#5f6368', fontSize: '13px', lineHeight: 1.55 }}>Regular due: {formatDueDate(assignment)} · Final late due: {formatLateDueDate(assignment)}{lifecycle.isLate && <><br /><strong style={{ color: '#7a4f00' }}>Late work remains open for {formatRemainingTime(lifecycle.millisecondsRemaining)}.</strong></>}{!access.open && <><br /><strong style={{ color: '#a50e0e' }}>Complete the prerequisite notes/classwork first. It opens automatically at {formatDateTime(assignment.releaseAt)} if not completed.</strong></>}{assignment.assignmentType === 'notesClasswork' && <><br />Engaged: {formatTime(activity.totalTimeSeconds || 0)} · Daily grade: {classwork?.score === 100 ? '100 — prerequisite met' : 'In progress'}</>}{dol.enabled && dol.status === 'waiting' && <><br />DOL opens during the final {assignment.dol?.minutesBeforeEnd || 10} minutes of class.</>}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
            {isAttempted && <div style={{ textAlign: 'right' }}><div style={{ fontSize: '11px', color: '#5f6368', textTransform: 'uppercase', fontWeight: 'bold' }}>{feedbackHeld ? 'Grade status' : lifecycle.isClosed ? 'Final grade' : 'Current grade'}</div><div style={{ fontSize: '19px', fontWeight: 900, color: feedbackHeld ? '#174ea6' : recordedGrade >= 70 ? '#188038' : '#202124' }}>{feedbackHeld ? 'Awaiting teacher release' : `${recordedGrade}%`}</div></div>}
            <button disabled={disabled} onClick={() => startAssignment(assignment.id)} style={{ padding: '10px 20px', background: disabled ? '#dadce0' : lifecycle.isClosed ? '#5f6368' : lifecycle.isLate ? '#8a5a00' : '#1a73e8', color: '#fff', border: 'none', borderRadius: '8px', cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>{lifecycle.isClosed ? 'Review' : lifecycle.isLate ? 'Continue Late Work' : disabled ? 'Locked' : isAttempted ? 'Continue' : 'Start'}</button>
          </div>
        </article>
      );
    };

    return (
      <div className={`${supportPresentation.highContrast ? 'mathmaster-support-high-contrast' : ''} ${supportPresentation.largeText ? 'mathmaster-support-large-text' : ''}`} style={{ fontFamily: '"Segoe UI", sans-serif', backgroundColor: supportPresentation.highContrast ? '#fff' : '#f0f2f5', minHeight: '100vh', padding: '34px 20px', fontSize: supportPresentation.largeText ? '120%' : undefined }}>
        <div style={{ maxWidth: '920px', margin: '0 auto' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '20px 30px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: '24px', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'left' }}><h1 style={{ margin: 0, color: '#1a73e8', fontSize: '25px' }}>Welcome, {user.id}</h1><p style={{ margin: '4px 0 0', color: '#5f6368' }}>{user.classPeriod}{user.profile?.inclusionStatus ? ' · Inclusion supports active' : ''}</p></div>
            <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setStudentDashboardMode('mathPath')} style={{ padding: '9px 15px', background: '#174ea6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 900 }}>My Math Path</button>
              <button type="button" onClick={() => setStudentDashboardMode('secureExams')} style={{ padding: '9px 15px', background: '#3c4043', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 900 }}>Secure Exams</button>
              <button type="button" onClick={handleLogout} style={{ padding: '8px 16px', background: '#f1f3f4', color: '#5f6368', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Log Out</button>
            </div>
          </header>

          {activeDols.map(({ assignment, state }) => (
            <section key={assignment.id} style={{ marginBottom: '18px', padding: '22px 25px', borderRadius: '16px', background: '#f3e8fd', border: '3px solid #9334e6', color: '#4a126b', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
              <div><div style={{ fontSize: '13px', fontWeight: 900, textTransform: 'uppercase' }}>DOL available now</div><h2 style={{ margin: '4px 0' }}>{assignment.title} · Question {state.questionIndex + 1}</h2><p style={{ margin: 0 }}>Submit this question before class ends for today&apos;s DOL grade.</p>{!supportPresentation.hideCountdowns && <div style={{ marginTop: '8px', fontSize: '22px', fontWeight: 1000 }}>{formatRemainingTime(state.millisecondsRemaining)} remaining</div>}</div>
              <button onClick={() => startAssignment(assignment.id, state.questionIndex)} style={{ padding: '13px 20px', border: 0, borderRadius: '10px', background: '#681da8', color: '#fff', fontWeight: 900, fontSize: '16px' }}>Open DOL</button>
            </section>
          ))}

          {resumeAssignment && (
            <section aria-label="Resume assignment" style={{ marginBottom: '28px', padding: '28px 30px', borderRadius: '18px', background: 'linear-gradient(135deg, #174ea6 0%, #1a73e8 62%, #4f8fe8 100%)', color: '#fff', boxShadow: '0 16px 38px rgba(26,115,232,0.28)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '24px', flexWrap: 'wrap', textAlign: 'left' }}>
              <div style={{ flex: '1 1 450px' }}><div style={{ fontSize: '13px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.82, marginBottom: '7px' }}>Resume Action</div><h2 style={{ margin: 0, fontSize: 'clamp(25px, 4vw, 38px)', lineHeight: 1.12 }}>Resume {resumeAssignment.title}</h2><p style={{ margin: '10px 0 0', fontSize: '17px', lineHeight: 1.5, opacity: 0.94 }}>Continue at Question {resumeQuestionIndex + 1}. Your typed responses, plotted points, graph sketch, endpoint symbols, multipart analysis, and algebra work are restored from this browser.</p><div style={{ marginTop: '12px', fontSize: '13px', fontWeight: 'bold', opacity: 0.88 }}>{resumeLifecycle.isClosed ? 'Permanently closed · review saved work' : resumeLifecycle.isLate ? `Late · ${formatRemainingTime(resumeLifecycle.millisecondsRemaining)} until final close` : `Due ${formatDueDate(resumeAssignment)}`}</div></div>
              <button type="button" onClick={() => startAssignment(resumeAssignment.id, resumeQuestionIndex)} style={{ padding: '15px 24px', border: 'none', borderRadius: '12px', background: '#fff', color: '#174ea6', fontSize: '17px', fontWeight: 900, cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }}>{resumeLifecycle.isClosed ? 'Review Question' : 'Resume Question'} {resumeQuestionIndex + 1} →</button>
            </section>
          )}

          {visibleAssignments.length === 0 ? <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', textAlign: 'center', color: '#5f6368' }}>No assignments are assigned to {user.classPeriod}.</div> : (
            <>
              <h2 style={{ color: '#202124', textAlign: 'left' }}>Do Now</h2>
              {doNowEntries.length === 0 ? (
                <div style={{ background: '#fff', padding: '22px', borderRadius: '12px', textAlign: 'center', color: '#5f6368', marginBottom: '10px' }}>Nothing needs immediate action right now.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '10px' }}>{doNowEntries.map(renderAssignmentCard)}</div>
              )}

              <h2 style={{ color: '#202124', textAlign: 'left', marginTop: '30px' }}>Coming Up</h2>
              {comingUpEntries.length === 0 ? (
                <div style={{ background: '#fff', padding: '22px', borderRadius: '12px', textAlign: 'center', color: '#5f6368', marginBottom: '10px' }}>Nothing else scheduled.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '10px' }}>{comingUpEntries.map(renderAssignmentCard)}</div>
              )}

              {completedEntries.length > 0 && (
                <details style={{ marginTop: '30px', textAlign: 'left' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 900, fontSize: '19px', color: '#202124', padding: '4px 0' }}>Completed ({completedEntries.length})</summary>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '15px' }}>{completedEntries.map(renderAssignmentCard)}</div>
                </details>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  if (isStudentAssignment) {
    return renderAssignmentWorkspace(false);
  }

  return null;
}

export default App;

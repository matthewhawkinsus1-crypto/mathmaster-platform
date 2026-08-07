import { useEffect, useRef, useState } from 'react';
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
import { SMART_VIEWS, matchesSmartView } from './assignmentSmartViews';
import { assignmentFolderMatches, normalizeFolderPath, normalizeFolderPaths, renameFolderPath } from './assignmentFolders';



const createQuestionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeAssignmentQuestions = (questions = []) => questions.map((question) => ({
  ...question,
  questionId: question.questionId || createQuestionId(),
  teacherExcluded: question.teacherExcluded === true,
}));

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

function App() {
  const [studentIdInput, setStudentIdInput] = useState('');
  const [user, setUser] = useState(null);

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
  const [teacherTab, setTeacherTab] = useState('assignments');
  const [assignments, setAssignments] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [activeAssignmentId, setActiveAssignmentId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
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
  const [fixedBlueprintConfirmation, setFixedBlueprintConfirmation] = useState(null);
  const [newAssignmentReleaseAt, setNewAssignmentReleaseAt] = useState('');
  const [newAssignmentPrerequisite, setNewAssignmentPrerequisite] = useState('');
  const [newAssignmentDolEnabled, setNewAssignmentDolEnabled] = useState(true);
  const [newAssignmentDolMinutes, setNewAssignmentDolMinutes] = useState(10);
  const [newAssignmentDolQuestion, setNewAssignmentDolQuestion] = useState('');
  const [newAssignmentJSON, setNewAssignmentJSON] = useState(
    DEFAULT_ASSIGNMENT_BLUEPRINT,
  );

  const [gradebookFilter, setGradebookFilter] = useState({
    classPeriod: '',
    assignmentId: null,
    student: null,
  });

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

  const handleLogin = async (event) => {
    event.preventDefault();
    if (!studentIdInput.trim()) return;

    const cleanInput = studentIdInput.trim();
    setLoading(true);
    setErrorMessage(null);

    try {
      const fetchedAssignments = await fetchAssignments();
      if (cleanInput.toUpperCase() === 'TEACHER') {
        await Promise.all([fetchStudents(), fetchClassSchedule(), fetchAssignmentFolders()]);
        setUser({ id: 'TEACHER', role: 'teacher' });
        setResumeAction(null);
      } else {
        const studentDocRef = doc(db, 'grades', cleanInput);
        const docSnap = await getDoc(studentDocRef);
        let studentData;

        if (docSnap.exists()) {
          studentData = docSnap.data();
        } else {
          studentData = {
            classPeriod: 'Unassigned',
            profile: normalizeStudentProfile({}),
            gradesByAssignment: {},
            assignmentActivity: {},
            dolGradesByAssignment: {},
            classworkGradesByAssignment: {},
            supportUsageByAssignment: {},
          };
          await setDoc(studentDocRef, studentData);
        }

        const studentProfile = normalizeStudentProfile(studentData.profile || studentData);
        setUser({
          id: cleanInput,
          role: 'student',
          classPeriod: studentData.classPeriod || 'Unassigned',
          profile: studentProfile,
        });
        setTracker(studentData.gradesByAssignment || {});
        setAssignmentActivity(studentData.assignmentActivity || {});
        setDolGradesByAssignment(studentData.dolGradesByAssignment || {});
        setClassworkGradesByAssignment(studentData.classworkGradesByAssignment || {});
        setSupportUsageByAssignment(studentData.supportUsageByAssignment || {});
        await fetchClassSchedule();
        const savedResume = readResumeAction(cleanInput);
        setResumeAction(savedResume && fetchedAssignments.some((assignment) => assignment.id === savedResume.assignmentId) ? savedResume : null);
      }
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setStudentIdInput('');
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

  const handleGradeSubmit = async (isCorrect, specificQuestionData, parts = [], supportUsage = null, responseKey = '') => {
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
    if (dolState.status === 'active' && currentQuestionIndex === dolState.questionIndex) {
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
    } catch (error) {
      console.error(error);
    }

    return outcome.result;
  };

  const handleStepGrade = async ({ stepGrade, countsAttempt, statePatch }) => {
    if (!activeAssignmentId) return null;
    const supportUsage = buildSupportUsage(user?.profile, activeAssignmentData?.questions?.[currentQuestionIndex]);
    const applyStep = (record) =>
      recordQuestionStep({
        record,
        stepGrade,
        countsAttempt,
        statePatch,
        supportUsage,
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

  const handleCreateAssignment = async (event, overrideVariantMode) => {
    if (event?.preventDefault) event.preventDefault();
    if (!newAssignmentTitle || !newAssignmentDate || !newAssignmentLateDate) {
      window.alert('Enter both the regular due date and the final late due date.');
      return;
    }
    const dueAt = new Date(newAssignmentDate);
    const lateDueAt = new Date(newAssignmentLateDate);
    if (Number.isNaN(dueAt.getTime()) || Number.isNaN(lateDueAt.getTime()) || lateDueAt <= dueAt) {
      window.alert('The late due date must be later than the regular due date.');
      return;
    }

    const variantMode = overrideVariantMode || newAssignmentVariantMode;

    try {
      const { questions, normalizedText, repairs } =
        parseAssignmentBlueprintText(newAssignmentJSON);

      if (variantMode === 'personalized' && questions.some((question) => !isPersonalizedBlueprint(question))) {
        setNewAssignmentJSON(normalizedText);
        setFixedBlueprintConfirmation({ repairs });
        return;
      }

      const parsedQuestions = normalizeAssignmentQuestions(validateAssignmentQuestions(questions, { variantMode }));
      setNewAssignmentJSON(normalizedText);
      const dolQuestionNumber = Number(newAssignmentDolQuestion);
      const dolQuestionIndex = Number.isInteger(dolQuestionNumber) && dolQuestionNumber > 0
        ? Math.min(parsedQuestions.length - 1, dolQuestionNumber - 1)
        : null;

      await addDoc(collection(db, 'assignments'), {
        title: newAssignmentTitle.trim(),
        dueAt: dueAt.toISOString(),
        lateDueAt: lateDueAt.toISOString(),
        dueDate: dueAt.toISOString(),
        assignedClassPeriods: newAssignmentClasses,
        assignmentType: newAssignmentType,
        variantMode,
        releaseAt: newAssignmentReleaseAt ? new Date(newAssignmentReleaseAt).toISOString() : null,
        prerequisiteAssignmentId: newAssignmentPrerequisite || null,
        completionRule: newAssignmentType === 'notesClasswork'
          ? { minEngagementMinutes: 10, minimumQuestionCompletionPercent: 80 }
          : null,
        dol: {
          enabled: newAssignmentType === 'practice' && newAssignmentDolEnabled,
          minutesBeforeEnd: Math.max(1, Number(newAssignmentDolMinutes) || 10),
          questionIndex: dolQuestionIndex,
        },
        questions: parsedQuestions,
        createdAt: new Date(),
      });

      if (variantMode !== newAssignmentVariantMode) setNewAssignmentVariantMode(variantMode);
      setNewAssignmentTitle('');
      setNewAssignmentDate('');
      setNewAssignmentLateDate('');
      setNewAssignmentReleaseAt('');
      setNewAssignmentPrerequisite('');
      setNewAssignmentDolQuestion('');
      await fetchAssignments();
      const repairMessage = repairs.length
        ? `\n\nPaste formatting repaired automatically: ${repairs.join('; ')}.`
        : '';
      window.alert(`Assignment created and assigned to ${newAssignmentClasses.length || 'all'} class period(s).${repairMessage}`);
    } catch (error) {
      window.alert(`Invalid JSON blueprint. Error: ${error.message}`);
    }
  };

  const confirmSwitchToSharedAndPublish = () => {
    setFixedBlueprintConfirmation(null);
    setNewAssignmentVariantMode('shared');
    handleCreateAssignment(null, 'shared');
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
    const currentIsDOL = dolState.enabled && currentQuestionIndex === dolState.questionIndex;
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
        className={`${supportPresentation.highContrast ? 'mathmaster-support-high-contrast' : ''} ${supportPresentation.largeText ? 'mathmaster-support-large-text' : ''}`}
        style={{
          fontFamily: '"Segoe UI", sans-serif',
          backgroundColor: supportPresentation.highContrast ? '#ffffff' : '#f0f2f5',
          minHeight: '100vh',
          padding: '20px',
          fontSize: supportPresentation.largeText ? '120%' : undefined,
        }}
      >
        {!preview && !supportPresentation.disableIdleTimer && renderIdleOverlay()}
        <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
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

          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '18px 24px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: '22px', gap: '20px', flexWrap: 'wrap' }}>
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
                <div style={{ fontSize: '22px', fontWeight: 900, color: recordedGrade >= 70 ? '#188038' : '#202124' }}>{preview ? `${progress.correct}/${progress.total}` : `${recordedGrade}%`}</div>
              </div>
              {!preview && assignment.assignmentType === 'notesClasswork' && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: '#5f6368', textTransform: 'uppercase', fontWeight: 900 }}>Daily classwork</div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: classworkGradesByAssignment?.[assignment.id]?.score === 100 ? '#188038' : '#8a5a00' }}>{classworkGradesByAssignment?.[assignment.id]?.score === 100 ? '100 — prerequisite met' : 'In progress'}</div>
                </div>
              )}
            </div>
          </header>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            {includedQuestionIndices.map((index, visiblePosition) => {
              const question = questions[index];
              const cardState = getQuestionCardState(workingTracker?.[index]);
              const record = normalizeQuestionRecord(workingTracker?.[index]);
              const isDOLQuestion = dolState.enabled && index === dolState.questionIndex;
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

          <main style={{ background: '#fff', borderRadius: '12px', padding: '10px', minHeight: '500px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
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
              studentProfile={preview ? null : user?.profile}
              guidedMode={assignment.assignmentType === 'notesClasswork'}
              assignmentLocked={!preview && lifecycle.isClosed}
              dolMode={!preview && currentIsDOL && dolState.status === 'active'}
              replacementWarning={replacementWarning}
              draftKey={buildQuestionDraftKey({
                studentId: preview ? 'teacher-preview' : user?.id || 'anonymous',
                assignmentId: activeAssignmentId,
                questionIndex: currentQuestionIndex,
                variantIndex: currentRecord.variantIndex,
                sessionMode: draftSessionMode,
              })}
            />
          </main>
        </div>
      </div>
    );
  };

  if (!user) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: '"Segoe UI", sans-serif',
          backgroundColor: '#f0f2f5',
        }}
      >
        <div
          style={{
            padding: '40px',
            borderRadius: '12px',
            width: '350px',
            maxWidth: 'calc(100vw - 40px)',
            boxSizing: 'border-box',
            textAlign: 'center',
            background: '#fff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
          }}
        >
          <h2 style={{ color: '#1a73e8', margin: '0 0 10px 0', fontSize: '28px' }}>
            MathMaster LMS
          </h2>
          <p style={{ color: '#5f6368', fontSize: '14px', marginBottom: '25px' }}>
            Student ID or &apos;TEACHER&apos; to login
          </p>

          {launchAssignment && (
            <div style={{ marginBottom: '20px', padding: '12px', background: '#e8f0fe', color: '#1a73e8', fontSize: '13px', borderRadius: '8px', textAlign: 'left' }}>
              Assigned from Google Classroom: <strong>{launchAssignment.title}</strong>
              {launchAssignment.dueAt && <> (due {new Date(launchAssignment.dueAt).toLocaleDateString()})</>}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <input
              type="text"
              placeholder="Enter ID"
              value={studentIdInput}
              onChange={(event) => setStudentIdInput(event.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '16px',
                marginBottom: '20px',
                boxSizing: 'border-box',
                textAlign: 'center',
                borderRadius: '8px',
                border: '2px solid #e8eaed',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '16px',
                cursor: 'pointer',
                background: '#1a73e8',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
              }}
            >
              {loading ? 'Connecting...' : 'Log In'}
            </button>
          </form>
          {errorMessage && (
            <div style={{ marginTop: '20px', color: '#c5221f' }}>
              <strong>Error:</strong> {errorMessage}
            </div>
          )}
        </div>
      </div>
    );
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
        {renderFixedBlueprintConfirmation()}
        {renderTeacherScratchpadDialog()}
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
            onSelectTab={(tab) => { setTeacherTab(tab); setGradebookFilter({ classPeriod: '', assignmentId: null, student: null }); }}
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
                <form onSubmit={handleCreateAssignment} style={{ marginBottom: '38px', background: '#f8f9fa', padding: '22px', borderRadius: '10px', border: '1px solid #e8eaed' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '15px', marginBottom: '18px' }}>
                    <label style={{ fontWeight: 'bold', textAlign: 'left' }}>Assignment title
                      <input type="text" value={newAssignmentTitle} onChange={(event) => setNewAssignmentTitle(event.target.value)} required style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', boxSizing: 'border-box', border: '1px solid #c9ced6', borderRadius: '6px' }} />
                    </label>
                    <label style={{ fontWeight: 'bold', textAlign: 'left' }}>Regular due date and time
                      <input type="datetime-local" value={newAssignmentDate} onChange={(event) => setNewAssignmentDate(event.target.value)} required style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', boxSizing: 'border-box', border: '1px solid #c9ced6', borderRadius: '6px' }} />
                    </label>
                    <label style={{ fontWeight: 'bold', textAlign: 'left' }}>Final late due date and time
                      <input type="datetime-local" value={newAssignmentLateDate} onChange={(event) => setNewAssignmentLateDate(event.target.value)} required style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', boxSizing: 'border-box', border: '1px solid #c9ced6', borderRadius: '6px' }} />
                    </label>
                    <label style={{ fontWeight: 'bold', textAlign: 'left' }}>Assignment type
                      <select value={newAssignmentType} onChange={(event) => setNewAssignmentType(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', border: '1px solid #c9ced6', borderRadius: '6px' }}>
                        <option value="practice">Practice / Homework with DOL</option>
                        <option value="notesClasswork">Guided Notes / Classwork</option>
                      </select>
                    </label>
                    <label style={{ fontWeight: 'bold', textAlign: 'left' }}>Problem versions
                      <select value={newAssignmentVariantMode} onChange={(event) => setNewAssignmentVariantMode(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', border: '1px solid #c9ced6', borderRadius: '6px' }}>
                        <option value="personalized">Different stable version per student</option>
                        <option value="shared">Exact same version for every student</option>
                      </select>
                    </label>
                    <label style={{ fontWeight: 'bold', textAlign: 'left' }}>Automatic release time (optional)
                      <input type="datetime-local" value={newAssignmentReleaseAt} onChange={(event) => setNewAssignmentReleaseAt(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', boxSizing: 'border-box', border: '1px solid #c9ced6', borderRadius: '6px' }} />
                    </label>
                    {newAssignmentType === 'practice' && (
                      <label style={{ fontWeight: 'bold', textAlign: 'left' }}>Prerequisite notes/classwork (optional)
                        <select value={newAssignmentPrerequisite} onChange={(event) => setNewAssignmentPrerequisite(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', border: '1px solid #c9ced6', borderRadius: '6px' }}>
                          <option value="">No prerequisite</option>
                          {assignments.filter((assignment) => assignment.assignmentType === 'notesClasswork').map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}
                        </select>
                      </label>
                    )}
                  </div>

                  <fieldset style={{ margin: '0 0 18px', padding: '15px', border: '1px solid #d8dde6', borderRadius: '8px', textAlign: 'left' }}>
                    <legend style={{ fontWeight: 900 }}>Assign to class periods</legend>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                      {CLASS_PERIODS.map((period) => <label key={period} style={{ padding: '7px 10px', background: newAssignmentClasses.includes(period) ? '#e8f0fe' : '#fff', border: '1px solid #c5d5ef', borderRadius: '999px', fontWeight: 'bold' }}><input type="checkbox" checked={newAssignmentClasses.includes(period)} onChange={() => setNewAssignmentClasses((current) => current.includes(period) ? current.filter((item) => item !== period) : [...current, period])} /> {period}</label>)}
                    </div>
                  </fieldset>

                  {newAssignmentType === 'practice' && (
                    <fieldset style={{ margin: '0 0 18px', padding: '15px', border: '1px solid #d8dde6', borderRadius: '8px', textAlign: 'left' }}>
                      <legend style={{ fontWeight: 900 }}>DOL configuration</legend>
                      <label style={{ fontWeight: 'bold', marginRight: '18px' }}><input type="checkbox" checked={newAssignmentDolEnabled} onChange={(event) => setNewAssignmentDolEnabled(event.target.checked)} /> Enable DOL during final minutes</label>
                      <label style={{ display: 'inline-block', fontWeight: 'bold', margin: '8px 18px 0 0' }}>Minutes before class ends <input type="number" min="1" max="30" value={newAssignmentDolMinutes} onChange={(event) => setNewAssignmentDolMinutes(event.target.value)} style={{ width: '70px', marginLeft: '6px', padding: '7px' }} /></label>
                      <label style={{ display: 'inline-block', fontWeight: 'bold', marginTop: '8px' }}>DOL question number <input type="number" min="1" value={newAssignmentDolQuestion} onChange={(event) => setNewAssignmentDolQuestion(event.target.value)} placeholder="Auto" style={{ width: '80px', marginLeft: '6px', padding: '7px' }} /></label>
                    </fieldset>
                  )}

                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', textAlign: 'left' }}>Paste AI Assignment Blueprint (JSON)</label>
                  <textarea value={newAssignmentJSON} onChange={(event) => setNewAssignmentJSON(event.target.value)} style={{ width: '100%', height: '220px', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                  <details style={{ marginTop: '12px', border: '1px solid #dfe3e7', borderRadius: '8px', background: '#fff', textAlign: 'left' }}>
                    <summary style={{ cursor: 'pointer', padding: '12px 14px', fontWeight: 'bold', color: '#174ea6' }}>Question and assignment blueprint guide</summary>
                    <pre style={{ margin: 0, padding: '0 14px 16px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '12px', lineHeight: 1.55, color: '#3c4043' }}>{MATH_BLUEPRINT_GUIDE}</pre>
                  </details>
                  <button type="submit" style={{ marginTop: '18px', padding: '11px 22px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontWeight: 'bold' }}>Publish Assignment</button>
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
                      <div><strong style={{ fontSize: '18px' }}>{student.id}</strong><div style={{ color: '#5f6368', marginTop: '4px' }}>{student.classPeriod || 'Unassigned'}</div></div>
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

                {gradebookFilter.classPeriod && selectedAssignment && !gradebookFilter.student && (
                  <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}><thead><tr style={{ background: '#f8f9fa' }}><th style={{ padding: '12px' }}>Student</th><th>Score</th><th>Instructional condition</th><th>Activity</th><th>DOL / Classwork</th><th></th></tr></thead><tbody>{selectedClassStudents.map((student) => { const grades = student.gradesByAssignment?.[selectedAssignment.id]; const score = grades ? calculateGrade(grades, selectedAssignment) : null; const usage = student.supportUsageByAssignment?.[selectedAssignment.id] || {}; const modified = Boolean(usage.modified || usage.modifications?.length); const activity = student.assignmentActivity?.[selectedAssignment.id] || {}; const dolEntries = Object.entries(student.dolGradesByAssignment?.[selectedAssignment.id] || {}).sort(([a], [b]) => a.localeCompare(b)); const latestDol = dolEntries.at(-1)?.[1]; const classwork = student.classworkGradesByAssignment?.[selectedAssignment.id]; return <tr key={student.id} style={{ borderBottom: '1px solid #e8eaed' }}><td style={{ padding: '12px', fontWeight: 'bold' }}>{student.id}</td><td><strong style={{ color: modified ? '#6f2da8' : score >= 70 ? '#188038' : '#202124' }}>{score === null ? '—' : `${score}%`}</strong>{modified && <span title={`Accommodations: ${(usage.accommodations || []).join(', ') || 'none'}; Modifications: ${(usage.modifications || []).join(', ') || 'none'}`} style={{ marginLeft: '7px', padding: '3px 6px', borderRadius: '999px', background: '#efe4ff', color: '#6f2da8', fontWeight: 900, fontSize: '11px' }}>MOD</span>}</td><td style={{ fontSize: '12px' }}>{modified ? `Modified: ${(usage.modifications || []).join(', ')}` : (usage.accommodations || []).length ? `Accommodated: ${usage.accommodations.join(', ')}` : 'Standard'}</td><td style={{ fontSize: '12px', lineHeight: 1.45 }}>Total {formatTime(activity.totalTimeSeconds || 0)}<br />On time {formatTime(activity.onTimeSeconds || 0)} · Late {formatTime(activity.lateSeconds || 0)}<br />Last on-time: {formatTimeStamp(activity.lastActiveBeforeDue)}<br />Last late: {formatTimeStamp(activity.lastActiveLate)}</td><td style={{ fontSize: '12px' }}>DOL: {latestDol ? `${latestDol.score}%` : '—'}<br />Classwork: {classwork?.score ? `${classwork.score}%` : '—'}</td><td><button onClick={() => setGradebookFilter((current) => ({ ...current, student }))} disabled={!grades} style={{ padding: '8px 12px', border: 0, borderRadius: '6px', background: grades ? '#1a73e8' : '#dadce0', color: '#fff', fontWeight: 'bold' }}>Details</button></td></tr>; })}</tbody></table></div>
                )}

                {gradebookFilter.student && selectedAssignment && (() => { const student = gradebookFilter.student; const studentGrades = student.gradesByAssignment?.[selectedAssignment.id] || {}; const usage = student.supportUsageByAssignment?.[selectedAssignment.id] || {}; const activity = student.assignmentActivity?.[selectedAssignment.id] || {}; return <div><div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px', flexWrap: 'wrap', alignItems: 'center', padding: '16px', marginBottom: '18px', background: usage.modified ? '#efe4ff' : '#e8f0fe', borderRadius: '10px' }}><div><h3 style={{ margin: 0 }}>{student.id} · {selectedAssignment.title}</h3><div style={{ marginTop: '5px' }}>Score: <strong>{calculateGrade(studentGrades, selectedAssignment)}%</strong> {usage.modified && <span style={{ marginLeft: '7px', padding: '3px 7px', borderRadius: '999px', background: '#6f2da8', color: '#fff', fontWeight: 900 }}>MOD</span>}</div><div style={{ marginTop: '5px', fontSize: '13px' }}>Total engagement {formatTime(activity.totalTimeSeconds || 0)} · Late engagement {formatTime(activity.lateSeconds || 0)}</div></div><button onClick={() => openIEPReport(student)} style={{ padding: '10px 15px', border: '1px solid #6f2da8', borderRadius: '7px', background: '#fff', color: '#6f2da8', fontWeight: 900 }}>Generate IEP Report</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '14px' }}>{selectedAssignment.questions.map((question, index) => { if (!questionIsIncluded(question)) return null; const record = normalizeQuestionRecord(studentGrades[index]); const credit = Math.round(getQuestionCredit(record) * 100); return <article key={index} style={{ padding: '16px', borderRadius: '9px', background: record.status === 'correct' ? '#e6f4ea' : record.status === 'expired' && credit < 50 ? '#fce8e6' : credit >= 50 ? '#fff4ce' : '#f1f3f4', border: '1px solid rgba(0,0,0,.12)', textAlign: 'left' }}><strong>Question {index + 1} · {question.type}</strong><div style={{ margin: '8px 0', fontSize: '20px', fontWeight: 900 }}>{record.status === 'correct' ? 'Correct ✓' : record.status === 'expired' ? credit >= 50 ? `Almost · ${credit}%` : `Incorrect · ${credit}%` : `${credit}% credit`}</div><div style={{ fontSize: '12px' }}>Attempts: {record.totalAttempts} · Time: {formatTime(record.timeSpent || 0)}</div>{record.partGrades?.length > 0 && <div style={{ marginTop: '10px' }}>{record.partGrades.map((part) => <div key={part.id} style={{ fontSize: '12px', color: part.isCorrect ? '#137333' : '#b3261e' }}>{part.isCorrect ? '✓' : '●'} {part.label}</div>)}</div>}<button type="button" onClick={() => openTeacherScratchpad(student.id, selectedAssignment.id, index)} style={{ marginTop: '12px', padding: '8px 11px', border: '1px solid #aeb8c6', borderRadius: '6px', background: '#fff', color: '#174ea6', fontWeight: 'bold' }}>View Student Work</button></article>; })}</div></div>; })()}
              </div>
            )}

            {teacherTab === 'classroom' && <ClassroomSync assignments={assignments} />}
          </div>
          </div>
        </div>
      </div>
    );
  }

  if (user.role === 'student' && activeView === 'dashboard') {
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

    return (
      <div className={`${supportPresentation.highContrast ? 'mathmaster-support-high-contrast' : ''} ${supportPresentation.largeText ? 'mathmaster-support-large-text' : ''}`} style={{ fontFamily: '"Segoe UI", sans-serif', backgroundColor: supportPresentation.highContrast ? '#fff' : '#f0f2f5', minHeight: '100vh', padding: '34px 20px', fontSize: supportPresentation.largeText ? '120%' : undefined }}>
        <div style={{ maxWidth: '920px', margin: '0 auto' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '20px 30px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: '24px', gap: '20px', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'left' }}><h1 style={{ margin: 0, color: '#1a73e8', fontSize: '25px' }}>Welcome, {user.id}</h1><p style={{ margin: '4px 0 0', color: '#5f6368' }}>{user.classPeriod}{user.profile?.inclusionStatus ? ' · Inclusion supports active' : ''}</p></div>
            <button onClick={handleLogout} style={{ padding: '8px 16px', background: '#f1f3f4', color: '#5f6368', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Log Out</button>
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

          <h2 style={{ color: '#202124', textAlign: 'left' }}>Your Assignments</h2>
          {visibleAssignments.length === 0 ? <div style={{ background: '#fff', padding: '30px', borderRadius: '12px', textAlign: 'center', color: '#5f6368' }}>No assignments are assigned to {user.classPeriod}.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {visibleAssignments.map((assignment) => {
                const assignmentTracker = tracker[assignment.id];
                const isAttempted = !!assignmentTracker;
                const lifecycle = getAssignmentLifecycle(assignment, now);
                const access = prerequisiteAccess({ assignment, classworkGradesByAssignment, nowValue: now });
                const recordedGrade = calculateGrade(assignmentTracker, assignment);
                const activity = assignmentActivity[assignment.id] || {};
                const classwork = classworkGradesByAssignment[assignment.id];
                const dol = getDOLState({ assignment, schedule: classSchedule, classPeriod: user.classPeriod, nowValue: now });
                const disabled = (lifecycle.isScheduled && access.reason !== 'prerequisiteMet') || !access.open;
                const statusStyle = lifecycle.isClosed ? { border: '#d93025', bg: '#fce8e6', color: '#a50e0e', label: 'Permanently closed' } : lifecycle.isLate ? { border: '#f9ab00', bg: '#fff4ce', color: '#7a4f00', label: 'Late' } : lifecycle.isScheduled ? { border: '#9aa0a6', bg: '#f1f3f4', color: '#3c4043', label: 'Scheduled' } : { border: '#d8dde6', bg: '#e6f4ea', color: '#137333', label: 'On time' };
                return (
                  <article key={assignment.id} style={{ background: '#fff', padding: '21px 26px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap', border: `2px solid ${statusStyle.border}` }}>
                    <div style={{ textAlign: 'left', flex: '1 1 470px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}><h3 style={{ margin: 0, color: '#202124' }}>{assignment.title}</h3><span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', padding: '4px 8px', borderRadius: '999px', background: statusStyle.bg, color: statusStyle.color }}>{statusStyle.label}</span><span style={{ fontSize: '11px', fontWeight: 900, padding: '4px 8px', borderRadius: '999px', background: '#e8f0fe', color: '#174ea6' }}>{assignment.assignmentType === 'notesClasswork' ? 'NOTES / CLASSWORK' : 'PRACTICE'}</span>{assignment.variantMode === 'shared' && <span style={{ fontSize: '11px', fontWeight: 900, padding: '4px 8px', borderRadius: '999px', background: '#e6f4ea', color: '#137333' }}>SAME CLASS VERSION</span>}</div>
                      <div style={{ color: '#5f6368', fontSize: '13px', lineHeight: 1.55 }}>Regular due: {formatDueDate(assignment)} · Final late due: {formatLateDueDate(assignment)}{lifecycle.isLate && <><br /><strong style={{ color: '#7a4f00' }}>Late work remains open for {formatRemainingTime(lifecycle.millisecondsRemaining)}.</strong></>}{!access.open && <><br /><strong style={{ color: '#a50e0e' }}>Complete the prerequisite notes/classwork first. It opens automatically at {formatDateTime(assignment.releaseAt)} if not completed.</strong></>}{assignment.assignmentType === 'notesClasswork' && <><br />Engaged: {formatTime(activity.totalTimeSeconds || 0)} · Daily grade: {classwork?.score === 100 ? '100 — prerequisite met' : 'In progress'}</>}{dol.enabled && dol.status === 'waiting' && <><br />DOL opens during the final {assignment.dol?.minutesBeforeEnd || 10} minutes of class.</>}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
                      {isAttempted && <div style={{ textAlign: 'right' }}><div style={{ fontSize: '11px', color: '#5f6368', textTransform: 'uppercase', fontWeight: 'bold' }}>{lifecycle.isClosed ? 'Final grade' : 'Current grade'}</div><div style={{ fontSize: '19px', fontWeight: 900, color: recordedGrade >= 70 ? '#188038' : '#202124' }}>{recordedGrade}%</div></div>}
                      <button disabled={disabled} onClick={() => startAssignment(assignment.id)} style={{ padding: '10px 20px', background: disabled ? '#dadce0' : lifecycle.isClosed ? '#5f6368' : lifecycle.isLate ? '#8a5a00' : '#1a73e8', color: '#fff', border: 'none', borderRadius: '8px', cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>{lifecycle.isClosed ? 'Review' : lifecycle.isLate ? 'Continue Late Work' : disabled ? 'Locked' : isAttempted ? 'Continue' : 'Start'}</button>
                    </div>
                  </article>
                );
              })}
            </div>
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

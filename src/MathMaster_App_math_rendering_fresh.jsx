import { useEffect, useRef, useState } from 'react';
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
import QuestionEngine from './QuestionEngine';


const DEFAULT_ASSIGNMENT_BLUEPRINT = `[
  {
    "type": "algebra",
    "prompt": "Solve for $x$.",
    "a": 2,
    "b": 4,
    "c": 10
  },
  {
    "type": "literal",
    "prompt": "Use the formula to solve for $h$.",
    "formula": "A = 1/2 b h",
    "solveFor": "h",
    "acceptedAnswers": ["\\\\frac{2A}{b}", "2A/b"]
  },
  {
    "type": "graphing",
    "prompt": "Use the graph to identify the slope and y-intercept.",
    "m": 2,
    "b": 1,
    "showEquation": false,
    "graph": {
      "xMin": -5,
      "xMax": 5,
      "yMin": -5,
      "yMax": 5,
      "functions": [{ "type": "line", "m": 2, "b": 1 }],
      "points": [{ "coordinates": [0, 1], "label": "(0, 1)" }]
    }
  }
]`;

const MATH_BLUEPRINT_GUIDE = `FORMATTED MATH

1. In directions, wrap math in dollar signs:
   "prompt": "Simplify $sqrt(x^2 + 9)$ and evaluate $log_2(x)$."

2. Existing formula fields use ASCII math automatically:
   "formula": "A = 1/2 b h"
   "formula": "y = sqrt(x - 3) + 2"
   "formula": "f(x) = x^2 - 4x + 3"

3. For exact LaTeX, use a dedicated LaTeX field and escape each backslash:
   "formulaLatex": "\\\\frac{-b \\\\pm \\\\sqrt{b^2-4ac}}{2a}"
   "equationLatex": "x^2 + y^2 = r^2"

4. Add an extra formatted expression to any question:
   "mathDisplay": { "value": "sqrt(49) = 7", "format": "ascii-math" }

GRAPHS

Add a graph object to any question. Supported function types are:
line, quadratic, absolute, squareRoot, exponential, and reciprocal.

Example:
"graph": {
  "xMin": -10,
  "xMax": 10,
  "yMin": -10,
  "yMax": 10,
  "functions": [
    { "type": "quadratic", "a": 1, "b": 0, "c": -4 }
  ],
  "points": [
    { "coordinates": [-2, 0], "label": "(-2, 0)" },
    { "coordinates": [2, 0], "label": "(2, 0)" }
  ],
  "caption": "Graph of y = x^2 - 4"
}

For graphing-line questions, "showGraph": true automatically graphs m and b.
Use "showEquation": false when students should work only from the graph.`;

const emptyQuestionRecord = () => ({
  status: 'unattempted',
  timeSpent: 0,
  questionDetails: '',
});

const createEmptyAssignmentTracker = (questions = []) => {
  const initialTracker = {};
  questions.forEach((_, index) => {
    initialTracker[index] = emptyQuestionRecord();
  });
  return initialTracker;
};

const getDueDateEnd = (dueDate) => {
  if (!dueDate) return null;
  const [year, month, day] = dueDate.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 23, 59, 59, 999);
};

const isAssignmentExpired = (assignment, now = Date.now()) => {
  const deadline = getDueDateEnd(assignment?.dueDate);
  return deadline ? now > deadline.getTime() : false;
};

const formatDueDate = (dueDate) => {
  const deadline = getDueDateEnd(dueDate);
  if (!deadline) return dueDate || 'No due date';
  return deadline.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

function App() {
  const [studentIdInput, setStudentIdInput] = useState('');
  const [user, setUser] = useState(null);

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
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [now, setNow] = useState(Date.now());

  const [newAssignmentTitle, setNewAssignmentTitle] = useState('');
  const [newAssignmentDate, setNewAssignmentDate] = useState('');
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
          (a.dueDate || '').localeCompare(b.dueDate || ''),
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
    fetchedAssignments.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    setAssignments(fetchedAssignments);
    return fetchedAssignments;
  };

  const fetchStudents = async () => {
    const querySnapshot = await getDocs(collection(db, 'grades'));
    const studentData = [];
    querySnapshot.forEach((studentDoc) => {
      if (studentDoc.id !== 'test_connection') {
        studentData.push({ id: studentDoc.id, ...studentDoc.data() });
      }
    });
    setAllStudents(studentData);
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
      await fetchAssignments();
      if (cleanInput.toUpperCase() === 'TEACHER') {
        await fetchStudents();
        setUser({ id: 'TEACHER', role: 'teacher' });
      } else {
        const studentDocRef = doc(db, 'grades', cleanInput);
        const docSnap = await getDoc(studentDocRef);
        let studentData;

        if (docSnap.exists()) {
          studentData = docSnap.data();
        } else {
          studentData = { classPeriod: 'Unassigned', gradesByAssignment: {} };
          await setDoc(studentDocRef, studentData);
        }

        setUser({
          id: cleanInput,
          role: 'student',
          classPeriod: studentData.classPeriod,
        });
        setTracker(studentData.gradesByAssignment || {});
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
    setGradebookFilter({ classPeriod: '', assignmentId: null, student: null });
  };

  const getModuleStatus = (assignmentTracker, index) => {
    const data = assignmentTracker?.[index];
    if (!data) return 'unattempted';
    return typeof data === 'string' ? data : data.status || 'unattempted';
  };

  const getModuleTime = (assignmentTracker, index) => {
    const data = assignmentTracker?.[index];
    if (!data || typeof data === 'string') return 0;
    return data.timeSpent || 0;
  };

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
    let correctCount = 0;
    assignmentData.questions.forEach((_, index) => {
      if (getModuleStatus(assignmentTracker, index) === 'correct') correctCount += 1;
    });
    return Math.round((correctCount / assignmentData.questions.length) * 100);
  };

  const calculatePracticeProgress = (assignmentTracker, assignmentData) => {
    if (!assignmentTracker || !assignmentData?.questions?.length) {
      return { attempted: 0, correct: 0, total: 0 };
    }

    let attempted = 0;
    let correct = 0;
    assignmentData.questions.forEach((_, index) => {
      const status = getModuleStatus(assignmentTracker, index);
      if (status !== 'unattempted') attempted += 1;
      if (status === 'correct') correct += 1;
    });

    return { attempted, correct, total: assignmentData.questions.length };
  };

  const activeAssignmentData = assignments.find(
    (assignment) => assignment.id === activeAssignmentId,
  );
  const activeIsExpired = isAssignmentExpired(activeAssignmentData, now);
  const isTeacherPreview = user?.role === 'teacher' && activeView === 'teacherPreview';
  const isStudentAssignment = user?.role === 'student' && activeView === 'assignment';
  const isPracticeMode = isStudentAssignment && activeIsExpired;

  const activeWorkingTracker = isTeacherPreview
    ? previewTracker
    : isPracticeMode
      ? practiceTracker
      : tracker[activeAssignmentId] || {};

  const getTrackerColor = (index) => {
    const status = getModuleStatus(activeWorkingTracker, index);
    if (status === 'correct') return '#28a745';
    if (status === 'incorrect') return '#dc3545';
    return '#fff';
  };

  useEffect(() => {
    activeTimeRef.current = getModuleTime(activeWorkingTracker, currentQuestionIndex);
  }, [activeAssignmentId, currentQuestionIndex, activeWorkingTracker]);

  useEffect(() => {
    if (user?.role !== 'student' || activeView !== 'assignment') return undefined;

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
      if (!isIdle) activeTimeRef.current += 1;
    }, 1000);

    return () => {
      window.removeEventListener('mousemove', resetActivity);
      window.removeEventListener('keydown', resetActivity);
      window.removeEventListener('click', resetActivity);
      window.clearInterval(interval);
    };
  }, [user, activeView, isIdle]);

  const changeQuestion = async (newIndex) => {
    if (!activeAssignmentId || newIndex === currentQuestionIndex) return;

    if (isTeacherPreview) {
      const currentStatus = getModuleStatus(previewTracker, currentQuestionIndex);
      const currentDetails =
        previewTracker[currentQuestionIndex]?.questionDetails || '';
      setPreviewTracker((current) => ({
        ...current,
        [currentQuestionIndex]: {
          status: currentStatus,
          timeSpent: 0,
          questionDetails: currentDetails,
        },
      }));
      setCurrentQuestionIndex(newIndex);
      return;
    }

    if (user?.role !== 'student') return;

    let assignment = assignments.find((item) => item.id === activeAssignmentId);
    let expired = isAssignmentExpired(assignment);

    if (!expired) {
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
      expired = isAssignmentExpired(assignment);
    }

    if (expired) {
      const currentStatus = getModuleStatus(practiceTracker, currentQuestionIndex);
      const currentDetails =
        practiceTracker[currentQuestionIndex]?.questionDetails || '';
      setPracticeTracker((current) => ({
        ...current,
        [currentQuestionIndex]: {
          status: currentStatus,
          timeSpent: activeTimeRef.current,
          questionDetails: currentDetails,
        },
      }));
      setCurrentQuestionIndex(newIndex);
      return;
    }

    const currentAssignmentGrades = tracker[activeAssignmentId] || {};
    const currentStatus = getModuleStatus(
      tracker[activeAssignmentId],
      currentQuestionIndex,
    );
    const currentDetails =
      currentAssignmentGrades[currentQuestionIndex]?.questionDetails || '';
    const updatedTracker = {
      ...tracker,
      [activeAssignmentId]: {
        ...currentAssignmentGrades,
        [currentQuestionIndex]: {
          status: currentStatus,
          timeSpent: activeTimeRef.current,
          questionDetails: currentDetails,
        },
      },
    };

    setTracker(updatedTracker);
    setCurrentQuestionIndex(newIndex);

    try {
      await updateDoc(doc(db, 'grades', user.id), {
        gradesByAssignment: updatedTracker,
      });
    } catch (error) {
      console.error(error);
    }
  };

  const startAssignment = (assignmentId) => {
    const assignmentData = assignments.find(
      (assignment) => assignment.id === assignmentId,
    );
    if (!assignmentData?.questions) return;

    setActiveAssignmentId(assignmentId);
    setCurrentQuestionIndex(0);
    lastActivityRef.current = Date.now();
    setIsIdle(false);

    if (isAssignmentExpired(assignmentData)) {
      setPracticeTracker(createEmptyAssignmentTracker(assignmentData.questions));
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
    setCurrentQuestionIndex(0);
    setPreviewTracker(createEmptyAssignmentTracker(assignmentData.questions));
    setActiveView('teacherPreview');
  };

  const handleGradeSubmit = async (isCorrect, specificQuestionData) => {
    if (!activeAssignmentId) return;

    const newStatus = isCorrect ? 'correct' : 'incorrect';

    if (isTeacherPreview) {
      setPreviewTracker((current) => ({
        ...current,
        [currentQuestionIndex]: {
          status: newStatus,
          timeSpent: 0,
          questionDetails: specificQuestionData,
        },
      }));
      return;
    }

    if (user?.role !== 'student') return;

    let assignment;
    try {
      assignment = await getLiveAssignment(activeAssignmentId);
    } catch (error) {
      console.error('Could not verify assignment before saving an answer:', error);
      return;
    }

    if (!assignment) {
      leaveUnavailableAssignment();
      return;
    }

    const expired = isAssignmentExpired(assignment);

    if (expired) {
      setPracticeTracker((current) => ({
        ...current,
        [currentQuestionIndex]: {
          status: newStatus,
          timeSpent: activeTimeRef.current,
          questionDetails: specificQuestionData,
        },
      }));
      return;
    }

    const currentAssignmentGrades = tracker[activeAssignmentId] || {};
    const updatedTracker = {
      ...tracker,
      [activeAssignmentId]: {
        ...currentAssignmentGrades,
        [currentQuestionIndex]: {
          status: newStatus,
          timeSpent: activeTimeRef.current,
          questionDetails: specificQuestionData,
        },
      },
    };

    setTracker(updatedTracker);

    try {
      await updateDoc(doc(db, 'grades', user.id), {
        gradesByAssignment: updatedTracker,
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleCreateAssignment = async (event) => {
    event.preventDefault();
    if (!newAssignmentTitle || !newAssignmentDate) return;

    try {
      const parsedQuestions = JSON.parse(newAssignmentJSON);
      if (!Array.isArray(parsedQuestions)) {
        throw new Error('JSON must be an array [ ]');
      }

      await addDoc(collection(db, 'assignments'), {
        title: newAssignmentTitle,
        dueDate: newAssignmentDate,
        questions: parsedQuestions,
        createdAt: new Date(),
      });

      setNewAssignmentTitle('');
      setNewAssignmentDate('');
      await fetchAssignments();
      window.alert('Assignment created from blueprint.');
    } catch (error) {
      window.alert(`Invalid JSON blueprint. Error: ${error.message}`);
    }
  };

  const handleChangeClassPeriod = async (studentId, newPeriod) => {
    try {
      await updateDoc(doc(db, 'grades', studentId), { classPeriod: newPeriod });
      await fetchStudents();
    } catch (error) {
      console.error(error);
    }
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
      const impactedGradeDocs = gradeSnapshot.docs.filter(
        (gradeDoc) =>
          gradeDoc.data()?.gradesByAssignment?.[deleteDialog.id] !== undefined,
      );

      const assignmentRef = doc(db, 'assignments', deleteDialog.id);

      if (impactedGradeDocs.length <= 499) {
        const batch = writeBatch(db);
        batch.delete(assignmentRef);
        impactedGradeDocs.forEach((gradeDoc) => {
          batch.update(gradeDoc.ref, {
            [`gradesByAssignment.${deleteDialog.id}`]: deleteField(),
          });
        });
        await batch.commit();
      } else {
        // Remove access first for unusually large rosters, then clean linked records
        // in safe batches below Firestore's 500-write limit.
        await deleteDoc(assignmentRef);
        const chunkSize = 450;
        for (let start = 0; start < impactedGradeDocs.length; start += chunkSize) {
          const batch = writeBatch(db);
          impactedGradeDocs.slice(start, start + chunkSize).forEach((gradeDoc) => {
            batch.update(gradeDoc.ref, {
              [`gradesByAssignment.${deleteDialog.id}`]: deleteField(),
            });
          });
          await batch.commit();
        }
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

  const renderAssignmentWorkspace = (preview = false) => {
    const assignment = activeAssignmentData;
    const questions = assignment?.questions || [];
    const expired = isAssignmentExpired(assignment, now);
    const recordedTracker = tracker[activeAssignmentId];
    const recordedGrade = calculateGrade(recordedTracker, assignment);
    const hasRecordedGrade = !!recordedTracker;
    const workingTracker = preview
      ? previewTracker
      : expired
        ? practiceTracker
        : recordedTracker || {};
    const practiceProgress = calculatePracticeProgress(workingTracker, assignment);

    if (!assignment) {
      return (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <p>This assignment is no longer available.</p>
          <button
            onClick={() => setActiveView(preview ? 'dashboard' : 'dashboard')}
            style={{ marginTop: '16px' }}
          >
            Return
          </button>
        </div>
      );
    }

    return (
      <div
        style={{
          fontFamily: '"Segoe UI", sans-serif',
          backgroundColor: '#f0f2f5',
          minHeight: '100vh',
          padding: '20px',
        }}
      >
        {!preview && renderIdleOverlay()}
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          {preview && (
            <div
              style={{
                background: '#e8f0fe',
                color: '#174ea6',
                border: '1px solid #aecbfa',
                padding: '14px 18px',
                borderRadius: '10px',
                marginBottom: '14px',
                fontWeight: 'bold',
                lineHeight: 1.45,
              }}
            >
              Student Preview — you are viewing and testing the assignment exactly as a
              student would. Nothing entered here is saved to a student record or the
              gradebook.
            </div>
          )}

          {expired && (
            <div
              role="status"
              style={{
                background: '#fff4ce',
                color: '#5f4400',
                border: '2px solid #f9ab00',
                padding: '16px 20px',
                borderRadius: '10px',
                marginBottom: '14px',
                lineHeight: 1.5,
              }}
            >
              <div
                style={{
                  fontSize: '13px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 'bold',
                  marginBottom: '4px',
                }}
              >
                Practice Mode
              </div>
              <strong>The due date has passed.</strong> You may keep practicing and will
              still receive answer feedback, but this work will not change the recorded
              grade, answers, or progress in the gradebook.
            </div>
          )}

          <header
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#fff',
              padding: '15px 25px',
              borderRadius: '12px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
              marginBottom: '25px',
              gap: '20px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <button
                onClick={() => {
                  if (preview) {
                    setActiveView('dashboard');
                    setTeacherTab('assignments');
                  } else {
                    setActiveView('dashboard');
                  }
                  setActiveAssignmentId(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#1a73e8',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  padding: 0,
                  marginBottom: '5px',
                }}
              >
                &larr; {preview ? 'Back to Instructor Dashboard' : 'Back to Dashboard'}
              </button>
              <h1 style={{ margin: 0, color: '#202124', fontSize: '22px' }}>
                {assignment.title}
              </h1>
              <div style={{ color: '#5f6368', fontSize: '13px', marginTop: '5px' }}>
                Due: {formatDueDate(assignment.dueDate)}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              {preview ? (
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#5f6368',
                      textTransform: 'uppercase',
                    }}
                  >
                    Preview Progress
                  </div>
                  <div
                    style={{
                      fontSize: '18px',
                      fontWeight: 'bold',
                      color: '#174ea6',
                    }}
                  >
                    {practiceProgress.correct}/{practiceProgress.total} correct
                  </div>
                </div>
              ) : expired ? (
                <>
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#5f6368',
                        textTransform: 'uppercase',
                      }}
                    >
                      Recorded Grade
                    </div>
                    <div
                      style={{
                        fontSize: '20px',
                        fontWeight: 'bold',
                        color:
                          hasRecordedGrade && recordedGrade >= 70
                            ? '#188038'
                            : '#202124',
                      }}
                    >
                      {hasRecordedGrade ? `${recordedGrade}%` : '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#5f6368',
                        textTransform: 'uppercase',
                      }}
                    >
                      Practice Session
                    </div>
                    <div
                      style={{
                        fontSize: '18px',
                        fontWeight: 'bold',
                        color: '#8a5a00',
                      }}
                    >
                      {practiceProgress.correct}/{practiceProgress.total} correct
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#5f6368',
                      textTransform: 'uppercase',
                    }}
                  >
                    Score
                  </div>
                  <div
                    style={{
                      fontSize: '20px',
                      fontWeight: 'bold',
                      color: recordedGrade >= 70 ? '#188038' : '#202124',
                    }}
                  >
                    {recordedGrade}%
                  </div>
                </div>
              )}
            </div>
          </header>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: '15px',
              marginBottom: '30px',
            }}
          >
            {questions.map((question, index) => (
              <div
                key={index}
                onClick={() => changeQuestion(index)}
                style={{
                  padding: '15px',
                  cursor: 'pointer',
                  backgroundColor: getTrackerColor(index),
                  color:
                    getModuleStatus(workingTracker, index) === 'unattempted'
                      ? '#202124'
                      : '#fff',
                  border:
                    currentQuestionIndex === index
                      ? '3px solid #1a73e8'
                      : '1px solid #dadce0',
                  borderRadius: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  boxShadow:
                    currentQuestionIndex === index
                      ? '0 4px 12px rgba(26,115,232,0.2)'
                      : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 'bold', opacity: 0.9 }}>
                  Question {index + 1}
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    marginTop: '5px',
                    textTransform: 'capitalize',
                  }}
                >
                  {question.type}
                </div>
              </div>
            ))}
          </div>

          <main
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '10px',
              minHeight: '500px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
            }}
          >
            <QuestionEngine
              key={`${activeAssignmentId}-${currentQuestionIndex}-${preview ? 'preview' : expired ? 'practice' : 'graded'}`}
              question={questions[currentQuestionIndex]}
              onGrade={handleGradeSubmit}
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
    return (
      <div
        style={{
          fontFamily: '"Segoe UI", sans-serif',
          backgroundColor: '#f8f9fa',
          minHeight: '100vh',
          padding: '20px',
        }}
      >
        {renderDeleteAssignmentDialog()}
        <div
          style={{
            maxWidth: '1000px',
            margin: '0 auto',
            background: '#fff',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          }}
        >
          <header
            style={{
              padding: '30px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid #e8eaed',
              gap: '20px',
            }}
          >
            <div>
              <h1 style={{ margin: 0, color: '#202124', fontSize: '24px' }}>
                Instructor Dashboard
              </h1>
            </div>
            <button
              onClick={handleLogout}
              style={{
                padding: '8px 16px',
                background: '#fff',
                color: '#d93025',
                border: '1px solid #d93025',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Log Out
            </button>
          </header>

          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid #e8eaed',
              background: '#f8f9fa',
            }}
          >
            {['assignments', 'students', 'grades'].map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setTeacherTab(tab);
                  setGradebookFilter({
                    classPeriod: '',
                    assignmentId: null,
                    student: null,
                  });
                }}
                style={{
                  flex: 1,
                  padding: '15px',
                  border: 'none',
                  background: teacherTab === tab ? '#fff' : 'transparent',
                  borderBottom:
                    teacherTab === tab
                      ? '3px solid #1a73e8'
                      : '3px solid transparent',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  color: teacherTab === tab ? '#1a73e8' : '#5f6368',
                  textTransform: 'capitalize',
                  fontSize: '16px',
                }}
              >
                Manage {tab}
              </button>
            ))}
          </div>

          <div style={{ padding: '30px' }}>
            {teacherTab === 'assignments' && (
              <div>
                <h2 style={{ marginTop: 0 }}>Create New Assignment (CMS)</h2>
                <form
                  onSubmit={handleCreateAssignment}
                  style={{
                    marginBottom: '40px',
                    background: '#f8f9fa',
                    padding: '20px',
                    borderRadius: '8px',
                    border: '1px solid #e8eaed',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: '15px',
                      marginBottom: '20px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ flex: '2 1 300px' }}>
                      <label
                        style={{
                          display: 'block',
                          fontWeight: 'bold',
                          marginBottom: '5px',
                        }}
                      >
                        Assignment Title
                      </label>
                      <input
                        type="text"
                        value={newAssignmentTitle}
                        onChange={(event) => setNewAssignmentTitle(event.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px',
                          borderRadius: '4px',
                          border: '1px solid #ccc',
                          boxSizing: 'border-box',
                        }}
                        required
                      />
                    </div>
                    <div style={{ flex: '1 1 180px' }}>
                      <label
                        style={{
                          display: 'block',
                          fontWeight: 'bold',
                          marginBottom: '5px',
                        }}
                      >
                        Due Date
                      </label>
                      <input
                        type="date"
                        value={newAssignmentDate}
                        onChange={(event) => setNewAssignmentDate(event.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px',
                          borderRadius: '4px',
                          border: '1px solid #ccc',
                          boxSizing: 'border-box',
                        }}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontWeight: 'bold',
                        marginBottom: '10px',
                      }}
                    >
                      Paste AI Assignment Blueprint (JSON):
                    </label>
                    <textarea
                      value={newAssignmentJSON}
                      onChange={(event) => setNewAssignmentJSON(event.target.value)}
                      style={{
                        width: '100%',
                        height: '200px',
                        padding: '10px',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                        fontFamily: 'monospace',
                        boxSizing: 'border-box',
                      }}
                    />
                    <details
                      style={{
                        marginTop: '12px',
                        border: '1px solid #dfe3e7',
                        borderRadius: '8px',
                        background: '#f8f9fa',
                        textAlign: 'left',
                      }}
                    >
                      <summary
                        style={{
                          cursor: 'pointer',
                          padding: '12px 14px',
                          fontWeight: 'bold',
                          color: '#174ea6',
                        }}
                      >
                        Math formatting and graph blueprint guide
                      </summary>
                      <pre
                        style={{
                          margin: 0,
                          padding: '0 14px 16px',
                          whiteSpace: 'pre-wrap',
                          overflowWrap: 'anywhere',
                          fontSize: '12px',
                          lineHeight: 1.55,
                          color: '#3c4043',
                          fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                        }}
                      >
                        {MATH_BLUEPRINT_GUIDE}
                      </pre>
                    </details>
                  </div>
                  <button
                    type="submit"
                    style={{
                      padding: '10px 20px',
                      background: '#1a73e8',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    Publish Assignment
                  </button>
                </form>

                <h2>Assignments</h2>
                {assignments.length === 0 ? (
                  <p>No assignments created yet.</p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {assignments.map((assignment) => {
                      const expired = isAssignmentExpired(assignment, now);
                      const affectedStudents = allStudents.filter(
                        (student) =>
                          student.gradesByAssignment?.[assignment.id] !== undefined,
                      ).length;

                      return (
                        <li
                          key={assignment.id}
                          style={{
                            background: '#f8f9fa',
                            padding: '18px',
                            marginBottom: '12px',
                            borderRadius: '10px',
                            border: '1px solid #e0e3e7',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '18px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ flex: '1 1 280px', textAlign: 'left' }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                flexWrap: 'wrap',
                                marginBottom: '5px',
                              }}
                            >
                              <strong style={{ fontSize: '17px' }}>
                                {assignment.title}
                              </strong>
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 'bold',
                                  textTransform: 'uppercase',
                                  padding: '4px 8px',
                                  borderRadius: '999px',
                                  background: expired ? '#fff4ce' : '#e6f4ea',
                                  color: expired ? '#7a4f00' : '#137333',
                                }}
                              >
                                {expired ? 'Practice mode' : 'Graded access'}
                              </span>
                            </div>
                            <span
                              style={{
                                display: 'block',
                                fontSize: '13px',
                                color: '#5f6368',
                              }}
                            >
                              {assignment.questions?.length || 0} questions · Due{' '}
                              {formatDueDate(assignment.dueDate)} · {affectedStudents}{' '}
                              student record{affectedStudents === 1 ? '' : 's'}
                            </span>
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              gap: '10px',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                            }}
                          >
                            <button
                              onClick={() => startTeacherPreview(assignment.id)}
                              style={{
                                padding: '9px 14px',
                                color: '#174ea6',
                                background: '#e8f0fe',
                                border: '1px solid #aecbfa',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                              }}
                            >
                              View as Student
                            </button>
                            <button
                              onClick={() => openDeleteDialog(assignment)}
                              style={{
                                padding: '9px 14px',
                                color: '#d93025',
                                background: '#fff',
                                border: '1px solid #d93025',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {teacherTab === 'students' && (
              <table
                style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}
              >
                <thead>
                  <tr style={{ borderBottom: '2px solid #ddd' }}>
                    <th style={{ padding: '12px' }}>Student ID</th>
                    <th style={{ padding: '12px' }}>Class Period</th>
                  </tr>
                </thead>
                <tbody>
                  {allStudents.map((student) => (
                    <tr key={student.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '12px', fontWeight: 'bold' }}>
                        {student.id}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <select
                          value={student.classPeriod || 'Unassigned'}
                          onChange={(event) =>
                            handleChangeClassPeriod(student.id, event.target.value)
                          }
                          style={{
                            padding: '8px',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                          }}
                        >
                          <option value="Unassigned">Unassigned</option>
                          <option value="Period 1">Period 1</option>
                          <option value="Period 2">Period 2</option>
                          <option value="Period 3">Period 3</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {teacherTab === 'grades' && (
              <div>
                <div
                  style={{
                    marginBottom: '20px',
                    padding: '15px',
                    background: '#e8eaed',
                    borderRadius: '8px',
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    onClick={() =>
                      setGradebookFilter({
                        classPeriod: '',
                        assignmentId: null,
                        student: null,
                      })
                    }
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#1a73e8',
                      fontWeight: 'bold',
                      fontSize: '16px',
                      padding: 0,
                    }}
                  >
                    All Classes
                  </button>
                  {gradebookFilter.classPeriod && (
                    <>
                      <span style={{ color: '#5f6368' }}>/</span>
                      <button
                        onClick={() =>
                          setGradebookFilter({
                            ...gradebookFilter,
                            assignmentId: null,
                            student: null,
                          })
                        }
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#1a73e8',
                          fontWeight: 'bold',
                          fontSize: '16px',
                          padding: 0,
                        }}
                      >
                        {gradebookFilter.classPeriod}
                      </button>
                    </>
                  )}
                  {gradebookFilter.assignmentId && (
                    <>
                      <span style={{ color: '#5f6368' }}>/</span>
                      <button
                        onClick={() =>
                          setGradebookFilter({
                            ...gradebookFilter,
                            student: null,
                          })
                        }
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#1a73e8',
                          fontWeight: 'bold',
                          fontSize: '16px',
                          padding: 0,
                        }}
                      >
                        {
                          assignments.find(
                            (assignment) =>
                              assignment.id === gradebookFilter.assignmentId,
                          )?.title
                        }
                      </button>
                    </>
                  )}
                  {gradebookFilter.student && (
                    <>
                      <span style={{ color: '#5f6368' }}>/</span>
                      <span
                        style={{
                          color: '#202124',
                          fontWeight: 'bold',
                          fontSize: '16px',
                        }}
                      >
                        {gradebookFilter.student.id}
                      </span>
                    </>
                  )}
                </div>

                {!gradebookFilter.classPeriod && (
                  <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                    {[...new Set(allStudents.map((student) => student.classPeriod || 'Unassigned'))]
                      .sort()
                      .map((classPeriod) => (
                        <button
                          key={classPeriod}
                          onClick={() =>
                            setGradebookFilter({
                              ...gradebookFilter,
                              classPeriod,
                            })
                          }
                          style={{
                            padding: '20px 30px',
                            background: '#fff',
                            border: '1px solid #dadce0',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '18px',
                            fontWeight: 'bold',
                            boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                          }}
                        >
                          {classPeriod}
                        </button>
                      ))}
                  </div>
                )}

                {gradebookFilter.classPeriod && !gradebookFilter.assignmentId && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {assignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        onClick={() =>
                          setGradebookFilter({
                            ...gradebookFilter,
                            assignmentId: assignment.id,
                          })
                        }
                        style={{
                          padding: '20px',
                          background: '#fff',
                          border: '1px solid #dadce0',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '16px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '18px',
                            fontWeight: 'bold',
                            color: '#1a73e8',
                          }}
                        >
                          {assignment.title}
                        </span>
                        <span style={{ color: '#5f6368', fontWeight: 'bold' }}>
                          Due: {formatDueDate(assignment.dueDate)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {gradebookFilter.classPeriod &&
                  gradebookFilter.assignmentId &&
                  !gradebookFilter.student && (
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        textAlign: 'left',
                        background: '#fff',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        border: '1px solid #dadce0',
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            background: '#f8f9fa',
                            borderBottom: '2px solid #ddd',
                          }}
                        >
                          <th style={{ padding: '15px' }}>Student ID</th>
                          <th style={{ padding: '15px' }}>Status</th>
                          <th style={{ padding: '15px' }}>Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allStudents
                          .filter(
                            (student) =>
                              (student.classPeriod || 'Unassigned') ===
                              gradebookFilter.classPeriod,
                          )
                          .map((student) => {
                            const studentGrades =
                              student.gradesByAssignment?.[
                                gradebookFilter.assignmentId
                              ];
                            const isStarted = !!studentGrades;
                            return (
                              <tr
                                key={student.id}
                                style={{ borderBottom: '1px solid #eee' }}
                              >
                                <td style={{ padding: '15px', fontWeight: 'bold' }}>
                                  {student.id}
                                </td>
                                <td
                                  style={{
                                    padding: '15px',
                                    color: isStarted ? '#188038' : '#5f6368',
                                    fontWeight: 'bold',
                                  }}
                                >
                                  {isStarted ? 'Attempted' : 'Not Started'}
                                </td>
                                <td style={{ padding: '15px' }}>
                                  {isStarted ? (
                                    <button
                                      onClick={() =>
                                        setGradebookFilter({
                                          ...gradebookFilter,
                                          student,
                                        })
                                      }
                                      style={{
                                        padding: '8px 16px',
                                        background: '#1a73e8',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: 'bold',
                                      }}
                                    >
                                      {calculateGrade(
                                        studentGrades,
                                        assignments.find(
                                          (assignment) =>
                                            assignment.id ===
                                            gradebookFilter.assignmentId,
                                        ),
                                      )}
                                      % - View Details
                                    </button>
                                  ) : (
                                    <span style={{ color: '#ccc' }}>-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  )}

                {gradebookFilter.student && gradebookFilter.assignmentId && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                      gap: '15px',
                    }}
                  >
                    {(() => {
                      const selectedAssignment = assignments.find(
                        (assignment) =>
                          assignment.id === gradebookFilter.assignmentId,
                      );
                      const studentGrades =
                        gradebookFilter.student.gradesByAssignment?.[
                          gradebookFilter.assignmentId
                        ];

                      return (selectedAssignment?.questions || []).map(
                        (question, index) => {
                          const status = getModuleStatus(studentGrades, index);
                          return (
                            <div
                              key={index}
                              style={{
                                background:
                                  status === 'correct'
                                    ? '#e6f4ea'
                                    : status === 'incorrect'
                                      ? '#fce8e6'
                                      : '#e8eaed',
                                color:
                                  status === 'correct'
                                    ? '#137333'
                                    : status === 'incorrect'
                                      ? '#c5221f'
                                      : '#3c4043',
                                padding: '20px',
                                borderRadius: '8px',
                                border: '1px solid rgba(0,0,0,0.1)',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: '14px',
                                  opacity: 0.8,
                                  textTransform: 'uppercase',
                                  fontWeight: 'bold',
                                }}
                              >
                                Question {index + 1} ({question.type})
                              </div>
                              <div
                                style={{
                                  fontSize: '20px',
                                  fontWeight: 'bold',
                                  margin: '10px 0',
                                }}
                              >
                                {status === 'correct'
                                  ? 'Correct ✓'
                                  : status === 'incorrect'
                                    ? 'Incorrect ✗'
                                    : 'Unattempted'}
                              </div>
                              {status !== 'unattempted' && (
                                <>
                                  <div
                                    style={{
                                      fontSize: '14px',
                                      marginTop: '10px',
                                      background: 'rgba(255,255,255,0.6)',
                                      padding: '10px',
                                      borderRadius: '6px',
                                      border: '1px solid rgba(0,0,0,0.05)',
                                    }}
                                  >
                                    <strong>Prompt:</strong>{' '}
                                    {studentGrades?.[index]?.questionDetails ||
                                      'Not provided.'}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: '14px',
                                      marginTop: '12px',
                                      fontWeight: 'bold',
                                    }}
                                  >
                                    ⏱ Time: {formatTime(getModuleTime(studentGrades, index))}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        },
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (user.role === 'student' && activeView === 'dashboard') {
    return (
      <div
        style={{
          fontFamily: '"Segoe UI", sans-serif',
          backgroundColor: '#f0f2f5',
          minHeight: '100vh',
          padding: '40px 20px',
        }}
      >
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <header
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#fff',
              padding: '20px 30px',
              borderRadius: '12px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
              marginBottom: '30px',
              gap: '20px',
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <h1 style={{ margin: 0, color: '#1a73e8', fontSize: '24px' }}>
                Welcome, {user.id}
              </h1>
              <p style={{ margin: '4px 0 0 0', color: '#5f6368' }}>
                {user.classPeriod}
              </p>
            </div>
            <button
              onClick={handleLogout}
              style={{
                padding: '8px 16px',
                background: '#f1f3f4',
                color: '#5f6368',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Log Out
            </button>
          </header>

          <h2 style={{ color: '#202124', textAlign: 'left' }}>Your Assignments</h2>
          {assignments.length === 0 ? (
            <div
              style={{
                background: '#fff',
                padding: '30px',
                borderRadius: '12px',
                textAlign: 'center',
                color: '#5f6368',
              }}
            >
              No assignments available.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {assignments.map((assignment) => {
                const isAttempted = !!tracker[assignment.id];
                const expired = isAssignmentExpired(assignment, now);
                const recordedGrade = calculateGrade(tracker[assignment.id], assignment);

                return (
                  <div
                    key={assignment.id}
                    style={{
                      background: '#fff',
                      padding: '20px 30px',
                      borderRadius: '12px',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '20px',
                      flexWrap: 'wrap',
                      border: expired ? '2px solid #f9ab00' : '1px solid transparent',
                    }}
                  >
                    <div style={{ textAlign: 'left', flex: '1 1 280px' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          flexWrap: 'wrap',
                          marginBottom: '6px',
                        }}
                      >
                        <h3 style={{ margin: 0, color: '#202124' }}>
                          {assignment.title}
                        </h3>
                        {expired && (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 'bold',
                              textTransform: 'uppercase',
                              padding: '4px 8px',
                              borderRadius: '999px',
                              background: '#fff4ce',
                              color: '#7a4f00',
                            }}
                          >
                            Practice Mode
                          </span>
                        )}
                      </div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: '14px',
                          color: expired ? '#7a4f00' : '#d93025',
                          fontWeight: 'bold',
                        }}
                      >
                        Due: {formatDueDate(assignment.dueDate)}
                      </p>
                      {expired && (
                        <p
                          style={{
                            margin: '8px 0 0',
                            color: '#5f4400',
                            fontSize: '13px',
                            lineHeight: 1.45,
                          }}
                        >
                          The recorded grade is frozen. Practice answers will not update
                          the gradebook.
                        </p>
                      )}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '20px',
                        flexWrap: 'wrap',
                      }}
                    >
                      {isAttempted && (
                        <div style={{ textAlign: 'right' }}>
                          <div
                            style={{
                              fontSize: '11px',
                              color: '#5f6368',
                              textTransform: 'uppercase',
                              fontWeight: 'bold',
                            }}
                          >
                            {expired ? 'Recorded Grade' : 'Current Grade'}
                          </div>
                          <div
                            style={{
                              fontSize: '18px',
                              fontWeight: 'bold',
                              color: recordedGrade >= 70 ? '#188038' : '#202124',
                            }}
                          >
                            {recordedGrade}%
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => startAssignment(assignment.id)}
                        style={{
                          padding: '10px 20px',
                          background: expired ? '#8a5a00' : '#1a73e8',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                        }}
                      >
                        {expired ? 'Practice' : isAttempted ? 'Continue' : 'Start'}
                      </button>
                    </div>
                  </div>
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

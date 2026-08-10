import React, { useEffect, useMemo, useRef, useState } from 'react';
import StudentDashboardView from '../student/StudentDashboardView.jsx';
import { MyMathPathExperience } from '../student/MyMathPathApp.jsx';
import { buildStudentDashboardModel } from '../../studentDashboardModel.js';
import { buildStudentPathOptions } from '../../platform/path/studentPathOptions.js';
import { buildStudentMasteryProfile, collectStudentEvidence } from '../../masteryEngine.js';
import { adaptLegacyMasteryToPhase5 } from '../../services/masteryStateService.js';
import {
  assignmentIsForStudent, getAssignmentLifecycle, getDOLState, getIncludedQuestionIndices,
  prerequisiteAccess, questionIsIncluded,
} from '../../assignmentLifecycle';
import { getQuestionCredit, normalizeQuestionRecord } from '../../attemptPolicy';
import { matchesSmartView } from '../../assignmentSmartViews.js';
import { createTeacherPathRuntime } from '../../platform/simulation/teacherPathRuntime.js';

// The same arithmetic App.jsx uses for a real student's recorded grade. It is
// three lines and lives on App's closure there; duplicating those three lines
// is better than exporting App's internals into the simulator.
const calculateGrade = (assignmentTracker, assignmentData) => {
  if (!assignmentTracker || !assignmentData?.questions?.length) return 0;
  const included = getIncludedQuestionIndices(assignmentData);
  if (!included.length) return 0;
  const earned = included.reduce((total, index) => total + getQuestionCredit(assignmentTracker?.[index]), 0);
  return Math.round((earned / included.length) * 100);
};

// What the simulated student is actually looking at.
//
// These are the student's own components — the same dashboard, the same Path,
// the same CCMR wheels — rendered from a synthetic learner document instead of
// a real one. Nothing is copied: if it renders here, a student is seeing the
// same thing, and if it changes for a student it changes here.
//
// Everything is driven by `nowValue`. A simulated date reaches the calendar
// provider, the assignment lifecycle and the path engine together, so moving
// the date really does move the class through the course rather than relabelling
// a heading.

const VIEWS = [
  ['assignments', 'Assignments'],
  ['path', 'My Math Path'],
];

export default function SimulatedStudentExperience({
  learner,
  assignments = [],
  courseId = 'algebra1',
  classPeriod = 'Period 1',
  pacing = null,
  teacherOverrides = [],
  nowValue = Date.now(),
  assessmentEvidence = {},
  directIndex = null,
  onStartAssignment = null,
  onChooseSkill = null,
  // Evidence the simulated student produces by actually answering questions,
  // handed back so the slot's learner — and therefore the Path, the wheel and
  // the recommendation panel — moves with it.
  onSimulatedEvidence = null,
}) {
  const [view, setView] = useState('assignments');
  // Work done inside a path session lives here until the parent takes it,
  // which is what makes the Path visibly react to a real answer.
  const [sessionAssignments, setSessionAssignments] = useState([]);

  const evidenceRef = useRef(onSimulatedEvidence);
  evidenceRef.current = onSimulatedEvidence;

  // One runtime per learner. The student's own container calls it exactly as
  // it calls the live service, so nothing below this line knows the difference.
  const runtime = useMemo(() => createTeacherPathRuntime({
    assignments,
    courseId,
    learner,
    onChange: ({ learner: nextLearner, sessionAssignment }) => {
      setSessionAssignments((current) => [
        ...current.filter((entry) => entry.id !== sessionAssignment.id),
        sessionAssignment,
      ]);
      evidenceRef.current?.({ learner: nextLearner, sessionAssignment });
    },
  }), [assignments, courseId, learner]);

  useEffect(() => { setSessionAssignments([]); }, [runtime]);

  // Everything the engines read: the teacher's assignments plus whatever the
  // simulated student has done in a path session.
  const allAssignments = useMemo(
    () => [...assignments, ...sessionAssignments],
    [assignments, sessionAssignments],
  );

  // The real engines, over the synthetic document. No mocks anywhere in here.
  const pathOptions = useMemo(() => (pacing ? buildStudentPathOptions({
    student: learner,
    assignments: allAssignments,
    courseId,
    pacing,
    teacherOverrides,
    nowValue,
  }) : null), [learner, allAssignments, courseId, pacing, teacherOverrides, nowValue]);

  const masteryData = useMemo(() => {
    const legacyProfile = buildStudentMasteryProfile({ student: learner, assignments: allAssignments });
    const evidenceRows = collectStudentEvidence({ student: learner, assignments: allAssignments });
    return {
      masteryProfilesByTEKS: adaptLegacyMasteryToPhase5({ legacyProfile, evidenceRows, retentionSchedulesByTEKS: {} }),
      retentionSchedulesByTEKS: {},
    };
  }, [learner, allAssignments]);

  const dashboard = useMemo(() => buildStudentDashboardModel({
    assignments,
    classPeriod,
    nowValue,
    tracker: learner?.gradesByAssignment || {},
    assignmentActivity: {},
    classworkGradesByAssignment: {},
    classSchedule: null,
    resumeAction: null,
    providers: {
      assignmentIsForStudent,
      getAssignmentLifecycle,
      prerequisiteAccess,
      calculateGrade,
      getDOLState,
      getIncludedQuestionIndices,
      normalizeQuestionRecord,
      questionIsIncluded,
      assignmentHasHeldTeacherFeedback: () => false,
      matchesSmartView,
    },
  }), [assignments, classPeriod, nowValue, learner]);

  // The forced CCMR evidence, handed straight to the student's own CCMR
  // screens: a teacher who sets SAT proficiency to 45% should watch the real
  // wheel become a transfer gap, not read a number in an inspector.
  const assessmentContext = useMemo(() => ({
    assessmentEvidence,
    directIndex,
    goals: [],
    teacherPriorities: [],
  }), [assessmentEvidence, directIndex]);

  return (
    <div>
      <div role="group" aria-label="Simulated student view" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            aria-pressed={view === id}
            style={{
              minHeight: 40, padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
              border: `1px solid ${view === id ? '#1a73e8' : '#c5d5ef'}`,
              background: view === id ? '#e8f0fe' : '#fff',
              color: view === id ? '#174ea6' : '#3c4043', fontWeight: 800, fontSize: 13,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'assignments' && (
        <StudentDashboardView
          dashboard={dashboard}
          student={{ id: learner?.displayName || 'Simulated student', classPeriod, inclusionStatus: false }}
          supportPresentation={{}}
          onStartAssignment={(assignmentId, questionIndex) => onStartAssignment?.(assignmentId, questionIndex)}
          onOpenMathPath={() => setView('path')}
          onOpenSecureExams={null}
          onLogout={null}
          recommended={{
            student: learner,
            assignments,
            courseId,
            pacing,
            pathOptions,
            onChooseSkill: (card) => onChooseSkill?.(card),
          }}
        />
      )}

      {view === 'path' && (
        <MyMathPathExperience
          studentId={learner?.id || 'simulated'}
          studentName={learner?.displayName || 'Simulated student'}
          assignments={assignments}
          pathOptions={pathOptions}
          courseId={courseId}
          studentRecord={learner}
          masteryData={masteryData}
          sessionProvider={runtime}
          evidenceEvents={[]}
          loading={false}
          assessmentContextOverride={assessmentContext}
          onExit={() => setView('assignments')}
        />
      )}
    </div>
  );
}

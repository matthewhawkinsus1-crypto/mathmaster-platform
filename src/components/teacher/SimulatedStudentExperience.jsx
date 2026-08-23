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
import { fetchTeacherPathBankSnapshot } from '../../platform/path/pathBankSimulationService.js';
import { buildSimulatorCoverageIndex } from '../../platform/simulation/simulatorCoverageIndex.js';

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
  evidenceAssignments = null,
  // Kept for backward compatibility with older callers. My Math Path no
  // longer uses classroom assignments as its question source; Student
  // Experience reads the secure pathQuestionBank just like production.
  pathQuestionAssignments = null, // eslint-disable-line no-unused-vars
  courseId = 'algebra1',
  classPeriod = 'Period 1',
  pacing = null,
  teacherOverrides = [],
  nowValue = Date.now(),
  assessmentEvidence = {},
  directIndex = null,
  // Retention schedules the teacher has forced on. These used to be hardcoded
  // empty, which pinned `retentionSignal` to 'stable' forever: no retention
  // state was reachable in the simulator at all, so a teacher could not verify
  // the one behaviour they most need to trust — that previously mastered work
  // gets re-checked rather than assumed.
  retentionSchedulesByTEKS = {},
  onStartAssignment = null,
  onChooseSkill = null,
  // Evidence the simulated student produces by actually answering questions,
  // handed back so the slot's learner — and therefore the Path, the wheel and
  // the recommendation panel — moves with it.
  onSimulatedEvidence = null,
  onPathBankLoaded = null,
  onSimulationController = null,
  onSimulationEvent = null,
}) {
  const [view, setView] = useState(() => (assignments.length ? 'assignments' : 'path'));
  const availableViews = assignments.length ? VIEWS : VIEWS.filter(([id]) => id === 'path');
  // Work done inside a path session lives here until the parent takes it,
  // which is what makes the Path visibly react to a real answer.
  const [sessionAssignments, setSessionAssignments] = useState([]);

  const evidenceRef = useRef(onSimulatedEvidence);
  evidenceRef.current = onSimulatedEvidence;
  const bankLoadedRef = useRef(onPathBankLoaded);
  bankLoadedRef.current = onPathBankLoaded;

  // Student Experience uses the ACTUAL secure Path bank, not whatever classroom
  // assignments happen to exist. This is the critical distinction: a student
  // with zero assignments still has My Math Path work, while an empty Path bank
  // is honestly shown as an empty Path bank.
  const [pathBankQuestions, setPathBankQuestions] = useState(null);
  const [pathBankError, setPathBankError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setPathBankQuestions(null);
    setPathBankError(null);
    fetchTeacherPathBankSnapshot().then((records) => {
      if (!cancelled) {
        setPathBankQuestions(records);
        bankLoadedRef.current?.(records);
      }
    }).catch((error) => {
      if (!cancelled) setPathBankError(error?.message || 'Could not read the secure Path bank.');
    });
    return () => { cancelled = true; };
  }, [courseId]);

  // One runtime per learner/bank snapshot. The student's own container calls it
  // exactly as it calls the live service, so the renderer below does not know
  // whether the learner is synthetic or real.
  // The learner is read through a ref at construction time and SYNCED
  // afterwards, deliberately. It used to sit in the dependency array — but the
  // runtime mutates the learner on every recorded attempt and publishes it back
  // up, so the learner prop changed after every answer, the memo re-ran, and a
  // brand-new runtime with an empty session map replaced the one the student
  // container was still holding a session id for. The second question of every
  // simulated session died on "That simulated session no longer exists."
  const learnerRef = useRef(learner);
  learnerRef.current = learner;
  const runtime = useMemo(() => (pathBankQuestions ? createTeacherPathRuntime({
    assignments,
    pathBankQuestions,
    courseId,
    learner: learnerRef.current,
    onChange: ({ learner: nextLearner, sessionAssignment }) => {
      setSessionAssignments((current) => [
        ...current.filter((entry) => entry.id !== sessionAssignment.id),
        sessionAssignment,
      ]);
      evidenceRef.current?.({ learner: nextLearner, sessionAssignment });
    },
    // A deliberate reset (new slot, or "Reset simulated student") DOES replace
    // the runtime, because the learner identity changed.
  }) : null), [assignments, pathBankQuestions, courseId, learner?.id]);

  // Teacher force-skill actions rewrite the learner without changing its id.
  // Hand those through rather than rebuilding.
  useEffect(() => { runtime?.syncLearner?.(learner); }, [runtime, learner]);

  // Flatten the synthetic learner's recorded attempts into the evidence-event
  // shape the practice-history timeline reads.
  const simulatedEvidenceEvents = useMemo(() => {
    const events = [];
    sessionAssignments.forEach((assignment) => {
      const grades = learner?.gradesByAssignment?.[assignment.id] || {};
      Object.entries(grades).forEach(([index, record]) => {
        const question = assignment.questions?.[Number(index)];
        if (!question) return;
        events.push({
          eventKey: `${assignment.id}:${index}`,
          occurredAt: record?.lastAttemptAt || record?.recordedAt || nowValue,
          alignmentKeys: question.alignmentKeys || [],
          questionSnapshot: {
            familyId: question.familyId || null,
            dok: question.dok || null,
            difficultyBand: question.difficultyBand || null,
          },
          source: { kind: 'myMathPath', activityRole: 'practice', activitySessionId: assignment.id },
          performance: {
            score: record?.status === 'correct' ? 1 : 0,
            isCorrect: record?.status === 'correct',
            attemptNumber: record?.totalAttempts || 1,
            status: 'finalized',
            isMathematicallyIndependent: record?.supportUsage?.isMathematicallyIndependent !== false,
          },
          supportUsage: record?.supportUsage || {},
        });
      });
    });
    return events;
  }, [sessionAssignments, learner, nowValue]);

  const simulatorCoverage = useMemo(
    () => (pathBankQuestions ? buildSimulatorCoverageIndex(pathBankQuestions, { courseId }) : null),
    [pathBankQuestions, courseId],
  );
  useEffect(() => { setSessionAssignments([]); }, [runtime]);
  useEffect(() => { if (!assignments.length) setView('path'); }, [assignments.length]);

  // Everything the engines read: the teacher's assignments plus whatever the
  // simulated student has done in a path session.
  const allAssignments = useMemo(
    () => [...(evidenceAssignments || assignments), ...sessionAssignments],
    [evidenceAssignments, assignments, sessionAssignments],
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
      masteryProfilesByTEKS: adaptLegacyMasteryToPhase5({ legacyProfile, evidenceRows, retentionSchedulesByTEKS }),
      retentionSchedulesByTEKS,
    };
  }, [learner, allAssignments, retentionSchedulesByTEKS]);

  const dashboard = useMemo(() => buildStudentDashboardModel({
    assignments,
    classId: learner?.classId || null,
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
        {availableViews.map(([id, label]) => (
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

      {view === 'path' && pathBankError && (
        <div role="alert" style={{ padding: 18, border: '1px solid #f0b4b2', borderRadius: 10, background: '#fce8e6', color: '#a50e0e', lineHeight: 1.55 }}>
          <strong>Could not load the secure Path bank.</strong><br />{pathBankError}
        </div>
      )}

      {view === 'path' && !pathBankError && !runtime && (
        <div style={{ padding: 32, textAlign: 'center', color: '#174ea6', fontWeight: 800 }}>Loading the secure My Math Path question bank…</div>
      )}

      {view === 'path' && runtime && (
        <>
          <div style={{ marginBottom: 10, padding: '9px 11px', borderRadius: 8, background: pathBankQuestions.length ? '#e6f4ea' : '#fef7e0', color: pathBankQuestions.length ? '#137333' : '#7a4f00', fontSize: 12, lineHeight: 1.45 }}>
            <strong>Production Path-bank simulation.</strong> {pathBankQuestions.length
              ? `${pathBankQuestions.length} active secure bank questions loaded. Classroom assignments are evidence only; they are not the Path content source.`
              : 'The secure Path bank is empty. Initialize it in Administration → Path content coverage before expecting students to have Path practice.'}
          </div>
          <MyMathPathExperience
            studentId={learner?.id || 'simulated'}
            studentName={learner?.displayName || 'Simulated student'}
            assignments={assignments}
            pathOptions={pathOptions}
            courseId={courseId}
            studentRecord={learner}
            masteryData={masteryData}
            sessionProvider={runtime}
            coverageOverride={simulatorCoverage}
            onSimulationController={onSimulationController}
            onSimulationEvent={onSimulationEvent}
            // The simulated learner's OWN evidence, so the practice-history
            // timeline shows a teacher what each forced outcome actually
            // recorded. Hardcoding this empty meant "Force Hint Usage" could
            // not be checked against the evidence it produced.
            evidenceEvents={simulatedEvidenceEvents}
            loading={false}
            assessmentContextOverride={assessmentContext}
            onExit={assignments.length ? () => setView('assignments') : null}
          />
        </>
      )}
    </div>
  );
}

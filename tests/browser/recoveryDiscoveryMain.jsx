// WHERE A STUDENT FINDS AN OPEN RECOVERY — THE REAL SCREENS, REAL MODEL.
//
// Home (StudentDashboardView) and the Assignments Center, fed by
// buildStudentRecoveryDiscovery over the family-backed Multiple
// Representations lesson as a teacher imports it. Nothing is mocked between
// the lesson and the screen: the same import chain, the same summary the
// Results panel renders, the same components a student sees.
//
// HOW TO RUN: see tests/browser/recoveryDiscovery.mjs.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import '../../src/App.css';
import { installMathMasterTheme } from '../../src/theme/mathMasterTheme.js';
import lessonText from '../../docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json?raw';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { getAssignmentLifecycle } from '../../src/assignmentLifecycle.js';
import { planSeatAdditions } from '../../functions/shared/questionGenerationIdentity.mjs';
import { BUCKET } from '../../src/studentDashboardModel.js';
import {
  buildStudentRecoveryDiscovery,
  groupRecoveryOpportunitiesByAssignment,
} from '../../src/platform/recovery/studentRecoveryDiscovery.js';
import StudentDashboardView from '../../src/components/student/StudentDashboardView.jsx';
import StudentAssignmentsCenter from '../../src/components/student/StudentAssignmentsCenter.jsx';

installMathMasterTheme();

const STUDENT = 'student-07';
const CLASS = 'class-1';
const ROSTER = Array.from({ length: 24 }, (_, index) => `student-${String(index).padStart(2, '0')}`);

const parsed = parseAssignmentBlueprintText(lessonText);
const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}), {});
const assignment = {
  id: 'asg-lmr',
  ...model.assignmentV5,
  title: 'Algebra I — Multiple Representations of Linear Equations',
  assignedClassIds: [CLASS],
  // Taught Monday 10/5; due Friday; final submission date (the Recovery end
  // date) the next Friday.
  dueAt: '2026-10-09T23:59:00-05:00',
  lateDueAt: '2026-10-16T23:59:00-05:00',
  warmup: { enabled: true, instructionDate: '2026-10-05' },
  dol: { enabled: true, instructionDate: '2026-10-05' },
};
assignment.generationSeats = { byClassId: { [CLASS]: planSeatAdditions({ assignment, classId: CLASS, studentIds: ROSTER }) } };

// Every question answered; the Warm-Up sorts and the DOL board wrong.
const tracker = {};
getStoredAssignmentQuestions(assignment).forEach((question, index) => {
  const missed = ['warmup', 'dol'].includes(question.activityRole);
  tracker[index] = { status: missed ? 'expired' : 'correct', attemptCount: 1, totalAttempts: 1, variantIndex: 0 };
});

const SCENES = {
  // The day after the lesson: both closed, nothing practised yet.
  available: { nowValue: Date.parse('2026-10-06T15:00:00Z'), records: {} },
  // The DOL practice reached mastery; the Warm-Up has not started.
  unlocked: { nowValue: Date.parse('2026-10-06T15:00:00Z'), records: { dol: { section: 'dol', status: 'unlocked' } } },
  // The DOL second try is under way.
  inProgress: { nowValue: Date.parse('2026-10-06T15:00:00Z'), records: { dol: { section: 'dol', status: 'inProgress', opportunitiesUsed: 1 } } },
  // Lesson day, class still on: nothing is offered yet.
  lessonDay: { nowValue: Date.parse('2026-10-05T15:00:00Z'), records: {} },
};

const opened = [];
window.__mmRecoveryOpened = opened;

function Harness() {
  const [scene, setScene] = useState(() => new URLSearchParams(window.location.search).get('scene') || 'available');
  const [view, setView] = useState(() => new URLSearchParams(window.location.search).get('view') || 'home');
  useEffect(() => {
    window.__mmRecoveryScene = (next, nextView) => { setScene(next); if (nextView) setView(nextView); };
  }, []);
  const { nowValue, records } = SCENES[scene] || SCENES.available;
  const opportunities = buildStudentRecoveryDiscovery({
    assignments: [assignment],
    trackerByAssignment: { [assignment.id]: tracker },
    sectionRecoveryByAssignment: { [assignment.id]: records },
    studentId: STUDENT,
    classId: CLASS,
    classPeriod: 'Period 3',
    nowValue,
  });
  window.__mmRecoveryOpportunities = opportunities;
  const lifecycle = getAssignmentLifecycle(assignment, nowValue);
  const questions = getStoredAssignmentQuestions(assignment);
  const entry = {
    assignment,
    lifecycle,
    access: { open: true },
    recordedGrade: 62,
    activity: {},
    classwork: null,
    dol: { enabled: false },
    disabled: false,
    feedbackHeld: false,
    bucket: BUCKET.COMPLETED,
    questionsTotal: questions.length,
    questionsDone: questions.length,
    questionsAttempted: questions.length,
    started: false,
    isAttempted: true,
  };
  const dashboard = {
    visibleAssignments: [assignment],
    allEntries: [entry],
    entries: [entry],
    resumeAssignment: null,
    resumeQuestionIndex: 0,
    resumeLifecycle: lifecycle,
    activeDols: [],
    activeWarmups: [],
    doNowEntries: [],
    comingUpEntries: [],
    completedEntries: [entry],
    groups: { [BUCKET.COMPLETED]: [entry] },
  };
  const onOpen = (opportunity) => { opened.push({ section: opportunity.section, action: opportunity.action }); };
  const student = { id: STUDENT, displayName: 'Jordan Rivera', firstName: 'Jordan', lastName: 'Rivera', classPeriod: 'Period 3' };
  return view === 'center' ? (
    <StudentAssignmentsCenter
      dashboard={dashboard}
      gradeCenter={null}
      recoveryByAssignment={groupRecoveryOpportunitiesByAssignment(opportunities)}
      studentId={STUDENT}
      onOpenRecovery={onOpen}
    />
  ) : (
    <StudentDashboardView
      dashboard={dashboard}
      student={student}
      nextAction={{ kind: 'clear', headline: 'You are caught up', detail: 'All assigned class work is complete.', actionLabel: null, urgency: 'none' }}
      recoveryOpportunities={opportunities}
      onOpenRecovery={onOpen}
      onStartAssignment={() => {}}
      recommended={{ pathOptions: { recommended: [], priority: [], available: [], extension: [] } }}
    />
  );
}

createRoot(document.getElementById('root')).render(<Harness />);

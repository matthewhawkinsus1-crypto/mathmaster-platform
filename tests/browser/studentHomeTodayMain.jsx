// Home ("what should I do now?") in a real browser, on a real dashboard.
//
// The dashboard is built by the REAL buildStudentDashboardModel and the next
// action by the REAL resolveNextAction, from synthetic lessons covering every
// card the "Today" rule can produce: an in-progress lesson (Resume), late work
// already started, late work not started, Practice locked by the teacher with
// Classwork done, a DOL that opens later today, a Recovery, an excused lesson,
// a finished lesson that was late, and a lesson closed by its deadline. The
// clock is the real one, and the class schedule is built around it so the DOL
// windows are genuinely waiting / active.
//
// Every callback the screen fires is recorded on window.__mmHomeCalls so the
// driver can check that Start lands on the question the model chose.
//
// HOW TO RUN: see tests/browser/studentHomeToday.mjs.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import StudentDashboardView from '../../src/components/student/StudentDashboardView.jsx';
import { buildStudentDashboardModel, resolveNextAction } from '../../src/studentDashboardModel.js';
import {
  assignmentIsForStudent, getAssignmentLifecycle, getDOLState, getWarmupState,
  getIncludedQuestionIndices, getSectionAccessState, prerequisiteAccess, questionIsIncluded,
} from '../../src/assignmentLifecycle.js';
import { normalizeQuestionRecord } from '../../src/attemptPolicy.js';
import { matchesSmartView } from '../../src/assignmentSmartViews.js';

const CLASS_ID = 'class-1';
const PERIOD = 'Period 1';
const STUDENT_ID = 's1';
const NOW = Date.now();
const MINUTE = 60e3;
const HOUR = 60 * MINUTE;
const at = (ms) => new Date(NOW + ms).toISOString();
const pad = (value) => String(value).padStart(2, '0');
const dateKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const clock = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const TODAY = dateKey(NOW);
const YESTERDAY = dateKey(NOW - 24 * HOUR);

// Period 1 runs around "now". The DOL works the last 10 minutes before a
// 5-minute pack-up, so a period ending in 60 minutes has its DOL waiting and
// one ending in 12 minutes has it open.
const scheduleEndingIn = (minutes) => ({
  version: 2,
  dayTypeOverrides: { [TODAY]: 'A' },
  daySchedules: {
    A: { periods: { [PERIOD]: { enabled: true, start: clock(NOW - 30 * MINUTE), end: clock(NOW + minutes * MINUTE) } } },
    B: { periods: {} },
  },
});

const q = (role, n) => ({ type: 'algebra', prompt: `${role} ${n}`, equationLatex: `x=${n}`, activityRole: role });
const lesson = (id, title, roles, overrides = {}) => ({
  schemaVersion: 5,
  id,
  title,
  assignedClassIds: [CLASS_ID],
  dueAt: at(4 * HOUR),
  lateDueAt: at(7 * 24 * HOUR),
  sections: Object.entries(roles).map(([role, count]) => ({
    id: role, role, title: role, questions: Array.from({ length: count }, (_, i) => q(role, i + 1)),
  })),
  ...overrides,
});

const correct = { status: 'correct', attemptCount: 1, totalAttempts: 1 };
const expired = { status: 'expired', attemptCount: 3, totalAttempts: 3 };
const tried = { status: 'attempted', attemptCount: 1, totalAttempts: 1 };

const A = {
  inprog: lesson('inprog', 'Systems of Equations — Substitution', { classwork: 2, practice: 2 }),
  pastdueStarted: lesson('pastdue-started', 'Slope from Two Points', { classwork: 1, practice: 2 }, { dueAt: at(-3 * HOUR), lateDueAt: at(4 * 24 * HOUR) }),
  pastdue: lesson('pastdue', 'Graphing Linear Inequalities', { classwork: 1, practice: 1 }, { dueAt: at(-26 * HOUR), lateDueAt: at(4 * 24 * HOUR) }),
  locked: lesson('locked', 'Exponent Rules', { classwork: 1, practice: 2 }, { sectionAccess: { practice: { defaultState: 'closed' } } }),
  dolwait: lesson('dolwait', 'Domain and Range', { classwork: 1, dol: 1 }, { dol: { enabled: true, instructionDate: TODAY } }),
  later: lesson('later', 'Arithmetic Sequences', { classwork: 1, practice: 1 }, { dueAt: at(5 * 24 * HOUR), lateDueAt: at(12 * 24 * HOUR) }),
  recovery: lesson('recovery', 'Function Notation', { classwork: 1, dol: 1 }, { dol: { enabled: true, instructionDate: YESTERDAY } }),
  excused: lesson('excused', 'Scatter Plots', { classwork: 1, practice: 1 }, { dueAt: at(-24 * HOUR), lateDueAt: at(5 * 24 * HOUR), studentOverrides: { [STUDENT_ID]: { excused: true } } }),
  finished: lesson('finished', 'Solving Two-Step Equations', { classwork: 1, practice: 2 }, { dueAt: at(-24 * HOUR), lateDueAt: at(5 * 24 * HOUR) }),
  closed: lesson('closed', 'Order of Operations', { classwork: 1, practice: 2 }, { dueAt: at(-10 * 24 * HOUR), lateDueAt: at(-3 * 24 * HOUR) }),
  dollive: lesson('dollive', 'Rate of Change', { classwork: 1, dol: 2 }, { dol: { enabled: true, instructionDate: TODAY } }),
};

const TRACKER = {
  inprog: { 0: correct },
  'pastdue-started': { 0: expired },
  locked: { 0: correct },
  dolwait: { 0: correct },
  recovery: { 0: correct },
  finished: { 0: correct, 1: correct, 2: expired },
  closed: { 0: correct, 1: tried },
  dollive: { 0: correct },
};

const PROVIDERS = {
  assignmentIsForStudent,
  getAssignmentLifecycle,
  prerequisiteAccess,
  // A fixed, plausible grade: this harness measures the screen, not grading.
  calculateGrade: (tracker) => (tracker ? 82 : 0),
  getDOLState,
  getWarmupState,
  getIncludedQuestionIndices,
  normalizeQuestionRecord,
  questionIsIncluded,
  assignmentHasHeldTeacherFeedback: () => false,
  matchesSmartView,
  getSectionAccessState,
};

const build = (assignments, { scheduleMinutes = 60 } = {}) => {
  const dashboard = buildStudentDashboardModel({
    assignments,
    classId: CLASS_ID,
    classPeriod: PERIOD,
    nowValue: NOW,
    tracker: TRACKER,
    classSchedule: scheduleEndingIn(scheduleMinutes),
    studentId: STUDENT_ID,
    recoveryStateByAssignment: { recovery: { dol: 'unlocked' } },
    providers: PROVIDERS,
  });
  const nextAction = resolveNextAction({ dashboard, weeklyProgress: { completed: 1, required: 2, remaining: 1 } });
  return { dashboard, nextAction };
};

window.__mmHomeCalls = [];
const record = (fn) => (...args) => { window.__mmHomeCalls.push({ fn, args }); };

const WhatChanged = () => (
  <section aria-label="What changed" style={{ marginBottom: 20, padding: '14px 18px', borderRadius: 12, background: 'var(--mm-surface)', textAlign: 'left' }}>
    <h2 style={{ margin: 0, fontSize: 16 }}>What changed</h2>
    <p style={{ margin: '6px 0 0', fontSize: 14 }}>Your teacher released results for Scatter Plots.</p>
  </section>
);

const home = ({ assignments, scheduleMinutes, supportPresentation = {}, extras = {} }) => {
  const { dashboard, nextAction } = build(assignments, { scheduleMinutes });
  window.__mmHomeModel = {
    nextAction: { kind: nextAction.kind, assignmentId: nextAction.assignment?.id ?? null, questionIndex: nextAction.questionIndex ?? null, opensResult: Boolean(nextAction.opensResult) },
    entries: dashboard.allEntries.map((entry) => ({
      id: entry.assignment.id, bucket: entry.bucket, actionable: entry.actionable, finished: entry.finished,
      nextQuestionIndex: entry.nextQuestionIndex, waitText: entry.waitText, action: entry.action,
    })),
    resume: dashboard.resumeAssignment?.id ?? null,
    resumeQuestionIndex: dashboard.resumeQuestionIndex,
    activeDols: dashboard.activeDols.map(({ assignment }) => assignment.id),
  };
  return (
    <StudentDashboardView
      dashboard={dashboard}
      // inclusionStatus is passed on purpose: Home must never print it.
      student={{ id: STUDENT_ID, displayName: 'Jordan Rivera', classPeriod: PERIOD, inclusionStatus: true }}
      supportPresentation={supportPresentation}
      nextAction={nextAction}
      onStartAssignment={record('start')}
      onOpenResult={record('result')}
      onOpenMathPath={record('mathPath')}
      onNavigate={record('navigate')}
      onExportAssignmentPdf={async (id) => record('pdf')(id)}
      onLogout={record('logout')}
      classroomSyncStatusByAssignment={{
        finished: { stage: 'final-complete', grade: 82, studentVisible: true },
        'pastdue-started': { stage: 'late-progress', grade: 40, studentVisible: false },
      }}
      {...extras}
    />
  );
};

const TODAY_SET = [A.inprog, A.pastdueStarted, A.pastdue, A.locked, A.dolwait, A.later, A.excused, A.finished, A.closed];

const SCENES = {
  today: () => home({
    assignments: TODAY_SET,
    extras: {
      saveStatus: { tone: 'saved', text: 'All work saved' },
      whatChangedPanel: <WhatChanged />,
      waysToRaise: { count: 2 },
    },
  }),
  dol: () => home({ assignments: [A.inprog, A.dollive, A.later], scheduleMinutes: 12 }),
  dolHidden: () => home({ assignments: [A.inprog, A.dollive, A.later], scheduleMinutes: 12, supportPresentation: { hideCountdowns: true } }),
  recovery: () => home({ assignments: [A.recovery, A.finished] }),
};

const listeners = new Set();
let current = 'today';
window.__mmHomeScene = (name) => { current = name; window.__mmHomeCalls = []; listeners.forEach((notify) => notify(name)); };
window.__mmHomeScenes = Object.keys(SCENES);

class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <div data-mm-crashed="1">CRASH: {String(this.state.error?.stack || this.state.error)}</div>;
    return this.props.children;
  }
}

function Harness() {
  const [scene, setScene] = useState(current);
  useEffect(() => {
    listeners.add(setScene);
    return () => listeners.delete(setScene);
  }, []);
  const render = SCENES[scene];
  return (
    <div data-mm-scene={scene}>
      <Boundary key={scene}>{render ? render() : null}</Boundary>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);

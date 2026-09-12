// The Grade Center and the Assignment Result, on a phone, in a real browser.
//
// The headless suite proves the grade rules. It cannot see whether the screen
// those rules feed shoves sideways at 390px, or puts a 28px button under a
// student's thumb — and "check my grade on my phone" is the single most common
// thing this feature will ever be asked to do.
//
// The model is built by the REAL buildStudentGradeCenter from synthetic
// assignments, so this harness cannot measure a layout driven by numbers the
// product would never produce.
//
// HOW TO RUN: see tests/browser/gradeCenterMobile.mjs.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import StudentGradeCenter from '../../src/components/student/StudentGradeCenter.jsx';
import StudentAssignmentResult from '../../src/components/student/StudentAssignmentResult.jsx';
import {
  buildStudentGradeCenter,
  findGradeCenterEntry,
} from '../../src/platform/student/studentGradeCenterModel.js';

const CLASS_ID = 'class-alg1-a';

const section = (id, role, questions) => ({ id, role, title: role, questions });

const assignments = [
  {
    id: 'lesson-1',
    // Deliberately long: a title that cannot wrap is the usual cause of a page
    // that scrolls sideways on a phone.
    title: 'Functions & Domain/Range — Interval Notation and Piecewise Behaviour',
    schemaVersion: 5,
    assignedClassIds: [CLASS_ID],
    dueAt: '2026-09-08',
    lateDueAt: '2026-09-10',
    gradingPeriod: { id: '2026-mp1', label: 'Marking Period 1', order: 2 },
    sections: [
      section('warmup', 'warmup', [{ id: 'w1' }, { id: 'w2' }]),
      section('classwork', 'classwork', [{ id: 'c1', questionWeight: 2 }]),
      section('practice', 'practice', [{ id: 'p1' }]),
      section('dol', 'dol', [{ id: 'd1' }]),
    ],
  },
  {
    id: 'lesson-2',
    title: 'Systems of Equations',
    schemaVersion: 5,
    assignedClassIds: [CLASS_ID],
    dueAt: '2026-09-09',
    lateDueAt: '2026-09-11',
    gradingPeriod: { id: '2026-mp1', label: 'Marking Period 1', order: 2 },
    sections: [section('classwork', 'classwork', [{ id: 'c1' }, { id: 'c2' }])],
  },
  {
    id: 'lesson-0',
    title: 'Linear Relationships',
    schemaVersion: 5,
    assignedClassIds: [CLASS_ID],
    dueAt: '2026-08-10',
    lateDueAt: '2026-08-12',
    gradingPeriod: { id: '2026-mp0', label: 'Marking Period 0', order: 1 },
    sections: [section('classwork', 'classwork', [{ id: 'c1' }])],
  },
];

const correct = { status: 'correct', attemptCount: 1, totalAttempts: 1 };
const partial = { status: 'expired', attemptCount: 3, totalAttempts: 3, bestPartialCredit: 50 };

const tracker = {
  'lesson-1': { 0: correct, 1: correct, 2: partial, 3: correct, 4: correct },
  'lesson-2': { 0: correct, 1: partial },
  'lesson-0': { 0: correct },
};

const gradingPeriodSettings = {
  periods: [
    { id: '2026-mp0', label: 'Marking Period 0', order: 1, archived: true },
    { id: '2026-mp1', label: 'Marking Period 1', order: 2 },
  ],
  currentPeriodId: '2026-mp1',
};

const buildFor = (nowValue) => buildStudentGradeCenter({
  assignments,
  classId: CLASS_ID,
  classPeriod: 'Period 3',
  studentId: 'student-1',
  courseLabel: 'Algebra I',
  nowValue,
  tracker,
  gradingPeriodSettings,
  classroomSyncStatusByAssignment: {
    'lesson-1': { stage: 'due-checkpoint', grade: 84, studentVisible: true },
  },
});

const LIVE = Date.parse('2026-09-09T12:00:00.000Z');
const CLOSED = Date.parse('2026-09-20T12:00:00.000Z');

const SCENES = {
  gradeCenter: () => <StudentGradeCenter gradeCenter={buildFor(LIVE)} />,
  gradeCenterClosed: () => <StudentGradeCenter gradeCenter={buildFor(CLOSED)} />,
  assignmentResult: () => (
    <StudentAssignmentResult entry={findGradeCenterEntry(buildFor(CLOSED), 'lesson-1')} sectionLabel="DOL" />
  ),
  assignmentResultOpen: () => (
    <StudentAssignmentResult entry={findGradeCenterEntry(buildFor(LIVE), 'lesson-2')} />
  ),
};

const listeners = new Set();
let current = 'gradeCenter';
window.__mmGradeScene = (name) => { current = name; listeners.forEach((notify) => notify(name)); };
window.__mmGradeScenes = Object.keys(SCENES);

class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <div data-mm-crashed="1">CRASH: {String(this.state.error?.message || this.state.error)}</div>;
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

// Grades with "Ways to raise your grade", the row actions and the grade math,
// in a real browser.
//
// The model is built by the REAL buildStudentGradeCenter and buildWaysToRaise
// from the same synthetic fixture the unit tests reason about
// (tests/platform/fixtures/studentGradesRaiseFixtures.mjs): missing and open,
// late and in progress, graded, pending, excused, closed, not started, not
// open yet, and a Test Cycle in corrections.
//
// HOW TO RUN: see tests/browser/studentGradesRaise.mjs.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import StudentGradeCenter from '../../src/components/student/StudentGradeCenter.jsx';
import { buildStudentGradeCenter } from '../../src/platform/student/studentGradeCenterModel.js';
import { buildWaysToRaise, countWaysToRaise } from '../../src/platform/student/waysToRaiseModel.js';
import {
  NOW,
  gradeCenterOptions,
  practicePassEligibleAssignments,
  recoverySummariesByAssignment,
} from '../platform/fixtures/studentGradesRaiseFixtures.mjs';

const gradeCenter = buildStudentGradeCenter(gradeCenterOptions());
const waysToRaise = buildWaysToRaise({
  gradeCenter,
  recoverySummariesByAssignment,
  practicePassEligibleAssignmentIds: practicePassEligibleAssignments,
  nowValue: NOW,
});

window.__mmGrades = {
  summaryScore: gradeCenter.currentSummary.score,
  waysCount: countWaysToRaise(waysToRaise),
  clicks: [],
};
const record = (kind) => (value) => window.__mmGrades.clicks.push({ kind, value: typeof value === 'object' ? value?.id : value });

// A stand-in for the coordinator's "What changed" panel, to prove placement.
const whatChanged = (
  <section aria-label="What changed" data-what-changed style={{ padding: 12, marginBottom: 18, borderRadius: 12, background: 'var(--mm-surface)', border: '1px solid var(--mm-border)' }}>
    What changed (sample panel)
  </section>
);

const screen = (props) => (
  <StudentGradeCenter
    gradeCenter={gradeCenter}
    onNavigate={() => {}}
    onLogout={() => {}}
    onBackToHome={record('home')}
    onOpenResult={record('openResult')}
    onPractice={record('practice')}
    onStart={record('start')}
    onWayAction={record('way')}
    {...props}
  />
);

const SCENES = {
  grades: () => screen({ waysToRaise, whatChangedPanel: whatChanged }),
  gradesNothingToRaise: () => screen({ waysToRaise: [] }),
  gradesNotWired: () => screen({}),
};

const listeners = new Set();
let current = 'grades';
window.__mmGradesScene = (name) => { current = name; listeners.forEach((notify) => notify(name)); };

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

// The Assignments Center and the Assignment Result, reading the one "Today"
// rule, in a real browser.
//
// Both screens are mounted from tests/platform/fixtures/studentTodayScreens.mjs,
// which is built by the REAL buildStudentDashboardModel, buildStudentGradeCenter
// and resolveUpNext — the same fixture the node tests assert — so the browser
// measures rows and next steps the product actually produces: a lesson waiting
// on its DOL, a Practice the teacher has locked, actionable work, closed work,
// excused work, a Recovery.
//
// Every callback is recorded on window.__mmCalls so the driver can prove what
// a button press hands to App (assignment id AND question index).
//
// HOW TO RUN: see tests/browser/studentResultUpNext.mjs.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
// The real theme tokens, so the cards are measured and shot as students see them.
import '../../src/theme/tokens.css';
import StudentAssignmentsCenter from '../../src/components/student/StudentAssignmentsCenter.jsx';
import StudentAssignmentResult from '../../src/components/student/StudentAssignmentResult.jsx';
import StudentGradeCenter from '../../src/components/student/StudentGradeCenter.jsx';
import { NOW, buildScreens } from '../platform/fixtures/studentTodayScreens.mjs';
import { describeOpenNotice } from '../../src/platform/student/studentOpenGate.js';

const screens = buildScreens();
window.__mmCalls = [];
const record = (type) => (...args) => {
  window.__mmCalls.push({ type, args: JSON.parse(JSON.stringify(args.map((value) => (
    value && typeof value === 'object' && value.assignment
      ? { kind: value.kind, assignmentId: value.assignment.id, questionIndex: value.questionIndex ?? null, opensResult: Boolean(value.opensResult) }
      : value ?? null
  )))) });
};

const result = (id, extra = {}) => (
  <StudentAssignmentResult
    entry={screens.gradeEntryOf(id)}
    todayEntry={screens.todayEntryOf(id)}
    upNext={screens.upNextAfter(id)}
    nowValue={NOW}
    onContinue={record('continue')}
    onUpNext={record('upNext')}
    onPractice={record('practice')}
    onReviewWork={record('review')}
    onViewAllGrades={record('grades')}
    onViewAllAssignments={record('assignments')}
    onBackToHome={record('home')}
    {...extra}
  />
);

const SCENES = {
  center: () => (
    <StudentAssignmentsCenter
      dashboard={screens.dashboard}
      gradeCenter={screens.gradeCenter}
      onNavigate={record('navigate')}
      onLogout={() => {}}
      onContinue={record('continue')}
      onOpenResult={record('openResult')}
      onPractice={record('practice')}
    />
  ),
  // Grades with the dashboard's entries: Start/Continue follows the same
  // "Today" rule as the Assignments Center.
  grades: () => (
    <StudentGradeCenter
      gradeCenter={screens.gradeCenter}
      todayByAssignment={Object.fromEntries(screens.dashboard.allEntries.map((entry) => [entry.assignment.id, entry]))}
      onNavigate={record('navigate')}
      onLogout={() => {}}
      onOpenResult={record('openResult')}
      onPractice={record('practice')}
      onStart={record('continue')}
    />
  ),
  resultWaiting: () => result('waiting-dol'),
  resultLocked: () => result('locked-practice', { origin: 'grades' }),
  resultActionable: () => result('actionable'),
  resultFinished: () => result('finished'),
  resultFinishedAlone: () => result('finished', { upNext: null }),
  resultClosed: () => result('closed', { sectionLabel: 'DOL' }),
  resultClosedReview: () => result('closed', {
    reviewPanel: <div data-test-review-panel style={{ padding: 12, border: '1px dashed var(--mm-border)' }}>Your recorded answers</div>,
  }),
  resultExcused: () => result('excused'),
  // NAV-8 and NAV-9: opened from Home, a closed lesson that teaches a Path skill.
  resultClosedFromHome: () => result('closed', { origin: 'home', onPracticeSkill: record('practiceSkill') }),
  // NAV-4: a start on a paused lesson landed here.
  resultPaused: () => result('closed', { origin: 'grades', onPracticeSkill: null, notice: describeOpenNotice({ kind: 'paused' }) }),
};

const listeners = new Set();
let current = 'center';
window.__mmScene = (name) => { current = name; window.__mmCalls = []; listeners.forEach((notify) => notify(name)); };
window.__mmScenes = Object.keys(SCENES);

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

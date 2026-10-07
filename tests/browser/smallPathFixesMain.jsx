// The Path map's Mastered section and the weekly panel, in a real browser.
//
// The headless suite proves the rules: every mastered skill is on the map,
// the weekly goal asks for the cards the week holds, the note names the day
// the teacher chose. It cannot see whether "Show all 9 mastered skills" is a
// real, tappable control at 390px, or whether "0 of 3" is what the panel
// actually draws. This renders the REAL components from synthetic props built
// by the REAL pure modules (buildPathMap via StudentLearningPath,
// buildWeeklyGoal, evaluateWeeklyGoalProgress), so nothing here is a mock-up.
//
// HOW TO RUN: see tests/browser/smallPathFixes.mjs.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import StudentLearningPath from '../../src/components/student/StudentLearningPath.jsx';
import WeeklyPathGoalPanel from '../../src/components/student/WeeklyPathGoalPanel.jsx';
import { getSkillGraph } from '../../src/platform/path/skillGraph.js';
import {
  buildWeeklyGoal,
  evaluateWeeklyGoalProgress,
  matchWeeklyGoalCompletions,
} from '../../src/platform/path/weeklyPathGoal.js';

const skills = getSkillGraph('algebra1');
const row = (skill, status) => ({ skillId: skill.skillId, status, score: 0.6, mastery: status === 'mastered' ? 0.95 : 0.5, reasons: [] });

// Nine mastered skills, and two open ones so the map is not the empty state.
const pathOptions = {
  courseId: 'algebra1',
  available: [row(skills[30], 'available'), row(skills[31], 'available')],
  mastered: skills.slice(0, 9).map((skill) => row(skill, 'mastered')),
};

// A week due on a FRIDAY, in the future whatever day this runs: 11:59pm in
// Chicago, which is already Saturday in UTC.
const FRIDAY_CLOSE = Date.parse('2027-01-15T23:59:59.999-06:00');
const PLAN = {
  sessions: ['A.5A', 'A.3A', 'A.9A'].map((code, index) => ({
    skillId: `teks:${code}`,
    teksCode: code,
    purpose: index === 2 ? 'retention' : 'current_learning',
    studentLabel: ['Solving linear equations', 'Rate of change and slope', 'Exponential functions'][index],
    dok: 2,
    difficultyBand: 3,
  })),
  profile: null,
  suppressed: [],
};

// The teacher asked for four; the planner found three.
const shortWeek = {
  ...buildWeeklyGoal({ plan: PLAN, config: { sessions: 4, dueDayOfWeek: 5 }, studentId: 'S1', now: Date.parse('2027-01-12T15:00:00Z') }),
  dueAt: FRIDAY_CLOSE,
  assignmentState: 'assigned',
};

// A snapshot frozen BEFORE the fix: goalSessions 4 over three slots, all done.
const preFixSnapshot = { ...shortWeek, goalSessions: 4 };
const finished = preFixSnapshot.sessions.map((slot, index) => ({
  status: 'completed',
  sessionId: `P${index + 1}`,
  weekKey: preFixSnapshot.weekKey,
  weeklySlotKey: slot.weeklySlotKey,
  teksCode: slot.teksCode,
  completedAt: FRIDAY_CLOSE - (index + 1) * 60 * 60 * 1000,
  accuracy: 0.9,
}));

const panel = (goal, completions) => (
  <div style={{ maxWidth: 940, margin: '0 auto', padding: '20px 16px' }}>
    <WeeklyPathGoalPanel
      goal={goal}
      progress={evaluateWeeklyGoalProgress({ goal, completions })}
      completions={completions}
      completedSlots={matchWeeklyGoalCompletions({ goal, completions }).matched.map((entry) => entry.matchedSlot)}
      inProgress={[]}
      onStartSession={() => {}}
      onChooseAlternative={() => {}}
    />
  </div>
);

const SCENES = {
  masteredMap: () => <StudentLearningPath pathOptions={pathOptions} onChooseSkill={() => {}} />,
  weeklyShort: () => panel(shortWeek, []),
  weeklyPreFixDone: () => panel(preFixSnapshot, finished),
};

const listeners = new Set();
let current = 'masteredMap';
window.__mmSmallScene = (name) => { current = name; listeners.forEach((notify) => notify(name)); };
window.__mmSmallScenes = Object.keys(SCENES);

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

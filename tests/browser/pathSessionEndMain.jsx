// The My Math Path session end screen, rendered for real in a browser.
//
// The REAL MyMathPathProductionContainer, handed a synthetic session runtime
// shaped like the Teacher Path Simulator's (the container cannot tell the
// difference — that is the point of the injected runtime). The recap is built
// by the real shared rules (functions/shared/pathSessionRecap.mjs) and the
// weekly next step by the real describeWeeklySessionEnd, so the screen is
// measured on data the product would actually produce.
//
// HOW TO RUN: see tests/browser/pathSessionEnd.mjs.
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
// Both stylesheets, in the order main.jsx loads them: the theme tokens and the
// body reset production relies on (see assignmentMobileMain.jsx).
import '../../src/index.css';
import '../../src/App.css';
import MyMathPathProductionContainer from '../../src/components/student/MyMathPathProductionContainer.jsx';
import MyMathPathSkillsMoved from '../../src/components/student/MyMathPathSkillsMoved.jsx';
import { buildPathRecapEntry, buildPathSessionRecap } from '../../functions/shared/pathSessionRecap.mjs';
import { describeWeeklySessionEnd } from '../../src/platform/path/pathSessionEnd.js';
import { SKILLS_MOVED_STATE } from '../../src/platform/mastery/sessionSkillMovement.js';

const WEEK = '2026-10-05';
const slot = (n, teksCode, studentLabel, purpose = 'currentLearning') => ({
  slot: n,
  weeklySlotKey: `${n}|teks:${teksCode}|${teksCode}|${purpose}|course|2|3`,
  skillId: `teks:${teksCode}`,
  teksCode,
  studentLabel,
  purpose,
  context: 'course',
});
const goal = {
  weekKey: WEEK,
  goalSessions: 4,
  assignmentState: 'assigned',
  sessions: [
    slot(1, 'A.5A', 'Solving linear equations'),
    slot(2, 'A.2C', 'Writing linear equations'),
    slot(3, 'A.3B', 'Interpreting rate of change', 'responsiveReview'),
    slot(4, 'A.7A', 'Graphing quadratic functions'),
  ],
};
const completion = (n) => ({
  status: 'completed', sessionId: `done-${n}`, completedAt: Date.parse(`${WEEK}T15:00:00Z`) + n, teksCode: goal.sessions[n - 1].teksCode,
  weekKey: WEEK, weeklySlotKey: goal.sessions[n - 1].weeklySlotKey, weeklySlot: n,
});

const session = (overrides = {}) => ({
  sessionId: 'harness-session',
  studentId: 'harness-student',
  status: 'completed',
  sessionKind: 'practice',
  requiredQuestions: 5,
  target: { alignmentKey: 'texas:A.5A' },
  summary: { completedQuestions: 5, correctQuestions: 2, independentSuccesses: 1 },
  route: [{ skillId: 'teks:A.5A' }, { skillId: 'teks:8.8C' }],
  completedAt: Date.now(),
  ...overrides,
});
const weeklySession = (n) => session({
  sessionId: `harness-weekly-${n}`,
  weekKey: WEEK,
  weeklySlotKey: goal.sessions[n - 1].weeklySlotKey,
  weeklySlot: n,
  weeklyPurpose: goal.sessions[n - 1].purpose,
  target: { alignmentKey: `texas:${goal.sessions[n - 1].teksCode}` },
});

// Three missed questions of the kinds the Path issues: a multiple-choice item
// with a long option, a typed answer about a table, and a tool question.
const entries = [
  buildPathRecapEntry({
    sessionId: 'harness-session', questionInstanceId: 'q1', questionNumber: 1, skillCode: 'A.4B', closedAt: 1,
    publicQuestion: {
      prompt: 'Cold drink sales and beach rescue incidents both rise during hot months. Which explanation best shows why correlation does not establish causation?',
      choices: [
        { id: 'c1', label: 'The first variable must cause the second, because both increase together every single summer without exception' },
        { id: 'c2', label: 'Hot weather can influence both variables' },
        { id: 'c3', label: 'Correlation proves the variables are identical' },
      ],
      responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'choice' }],
    },
    privateGrading: { fields: [{ id: 'answer', expected: 'c2' }] },
    responsePayload: { responses: { answer: 'c1' } },
    grading: { isCorrect: false, score: 0, attemptNumber: 1, attemptsAllowed: 1 },
    solutionReview: {
      headline: 'A third variable can drive both quantities.',
      reasoning: ['Two variables can move together because a third variable affects both.', 'Seasonal temperature is a plausible lurking variable here.'],
      answerSummary: 'Hot weather can influence both variables.',
      commonError: 'Reading "they rise together" as "one causes the other".',
    },
  }),
  buildPathRecapEntry({
    sessionId: 'harness-session', questionInstanceId: 'q2', questionNumber: 3, skillCode: 'A.5A', closedAt: 3,
    publicQuestion: {
      prompt: 'The table shows the cost $C$ of renting a kayak for $h$ hours. Solve $12 + 8h = 52$ to find how many hours were rented.',
      stimulus: {
        kind: 'table',
        title: 'Kayak rental',
        table: { headers: ['Hours, h', 'Cost, C'], rows: [{ cells: ['1', '20'] }, { cells: ['2', '28'] }, { cells: ['3', '36'] }] },
      },
      responseFields: [{ id: 'answer', label: 'h =', inputProfile: 'number' }],
    },
    privateGrading: { fields: [{ id: 'answer', expected: '5' }] },
    responsePayload: { responses: { answer: '\\frac{52}{8}' } },
    grading: { isCorrect: false, score: 0, attemptNumber: 3, attemptsAllowed: 3 },
    solutionReview: {
      headline: 'Undo the addition before the multiplication.',
      reasoning: ['Subtract 12 from both sides: $8h = 40$.', 'Divide both sides by 8: $h = 5$.'],
      answerSummary: null,
    },
  }),
  buildPathRecapEntry({
    sessionId: 'harness-session', questionInstanceId: 'q3', questionNumber: 4, skillCode: '8.8C', closedAt: 4,
    publicQuestion: {
      prompt: 'Write the domain and range of the reasonable values as inequalities.',
      responseFields: [
        { id: 'domain', label: 'Domain', inputProfile: 'inequality' },
        { id: 'range', label: 'Range', inputProfile: 'inequality' },
      ],
    },
    privateGrading: { fields: [{ id: 'domain', expected: '0<=h and h<=12' }, { id: 'range', expected: '15<=C and C<=111' }] },
    responsePayload: { responses: { domain: '0\\le h\\le12', range: 'C\\ge15' } },
    grading: { isCorrect: false, score: 0.5, attemptNumber: 3, attemptsAllowed: 3 },
    solutionReview: null,
  }),
  buildPathRecapEntry({
    sessionId: 'harness-session', questionInstanceId: 'q4', questionNumber: 2, skillCode: 'A.5A', closedAt: 2,
    publicQuestion: { prompt: 'Solve $3x = 12$.', responseFields: [{ id: 'answer', label: 'x =', inputProfile: 'number' }] },
    privateGrading: { fields: [{ id: 'answer', expected: '4' }] },
    responsePayload: { responses: { answer: '4' } },
    grading: { isCorrect: true, score: 1, attemptNumber: 1, attemptsAllowed: 3 },
  }),
];

const profile = (estimate, status) => ({ mastery: { estimate, status } });
const BEFORE = { 'A.5A': profile(62, 'Developing'), '8.8C': profile(80, 'Secure'), 'A.4B': profile(45, 'Needs Attention') };
const AFTER = { 'A.5A': profile(71, 'Secure'), '8.8C': profile(76, 'Secure'), 'A.4B': profile(45, 'Needs Attention') };

const runtimeFor = ({ finished, recapEntries = entries, recapError = false }) => ({
  startOrResumePathSession: async () => ({ success: true, session: finished }),
  fetchNextSanitizedQuestion: async () => { throw new Error('The harness session is already finished.'); },
  submitStudentResponse: async () => { throw new Error('The harness session is already finished.'); },
  fetchPathSessionRecap: async ({ sessionId }) => {
    if (recapError) throw new Error('The review could not load (harness).');
    return buildPathSessionRecap({ session: { ...finished, sessionId }, entries: recapEntries.map((entry) => ({ ...entry, sessionId })) });
  },
});

const SCENES = {
  // A weekly session that leaves slots in the week: Start session 3 of 4.
  weeklyNext: () => ({ finished: weeklySession(2), completions: [completion(1)], config: { weekKey: WEEK, weeklySlotKey: goal.sessions[1].weeklySlotKey, weeklySlot: 2 } }),
  // The session that completes the week.
  weeklyGoalDone: () => ({ finished: weeklySession(4), completions: [completion(1), completion(2), completion(3)], config: { weekKey: WEEK, weeklySlotKey: goal.sessions[3].weeklySlotKey, weeklySlot: 4, completesWeeklyGoal: true, weeklyGoalRequired: 4 } }),
  // Open practice, every question right: nothing to review.
  practiceAllCorrect: () => ({ finished: session({ coursePassLevel: 2, summary: { completedQuestions: 1, correctQuestions: 1, independentSuccesses: 1 } }), recapEntries: [entries[3]], noMoves: true }),
  // The review could not load: the screen says so and offers a retry.
  recapError: () => ({ finished: session({ coursePassLevel: 1 }), recapError: true }),
};

function ContainerScene({ name }) {
  const scene = useMemo(() => SCENES[name](), [name]);
  const runtime = useMemo(() => runtimeFor(scene), [scene]);
  const [profiles, setProfiles] = useState(BEFORE);
  const [finishedSession, setFinishedSession] = useState(null);
  const weeklySessionEnd = useMemo(() => describeWeeklySessionEnd({
    goal, completions: scene.completions || [], inProgress: [], finishedSession,
  }), [scene, finishedSession]);
  const [started, setStarted] = useState(null);

  return (
    <>
      <MyMathPathProductionContainer
        targetAlignmentKey={scene.finished.target.alignmentKey}
        {...(scene.config || {})}
        studentProfile={{}}
        sessionProvider={runtime}
        masteryProfilesByTEKS={profiles}
        weeklySessionEnd={weeklySessionEnd}
        onStartNextWeeklySession={(next) => setStarted(next)}
        onReturnToDashboard={() => setStarted({ studentLabel: 'My Math Path' })}
        onSessionComplete={(finished) => {
          setFinishedSession(finished);
          // The simulator's mastery moves with the answers; here it moves when
          // the session reports completion.
          if (!scene.noMoves) setProfiles(AFTER);
        }}
      />
      {started && <p data-mm-started="1" style={{ textAlign: 'center' }}>Started: {started.studentLabel}</p>}
    </>
  );
}

function SkillsScene({ state }) {
  return (
    <div style={{ maxWidth: 650, margin: '36px auto', padding: '0 16px' }}>
      <MyMathPathSkillsMoved skillsMoved={{ state, moves: [] }} />
    </div>
  );
}

const ALL = {
  ...Object.fromEntries(Object.keys(SCENES).map((name) => [name, () => <ContainerScene name={name} />])),
  skillsPending: () => <SkillsScene state={SKILLS_MOVED_STATE.PENDING} />,
  skillsDelayed: () => <SkillsScene state={SKILLS_MOVED_STATE.DELAYED} />,
};

let current = new URLSearchParams(window.location.search).get('scene') || 'weeklyNext';
const listeners = new Set();
window.__mmPathEndScene = (name) => { current = name; listeners.forEach((notify) => notify(name)); };
window.__mmPathEndScenes = Object.keys(ALL);

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
  React.useEffect(() => { listeners.add(setScene); return () => listeners.delete(setScene); }, []);
  const Scene = ALL[scene] || ALL.weeklyNext;
  return (
    <div data-mm-scene={scene} style={{ minHeight: '100vh', background: 'var(--mm-surface-sunken, #f6f7f9)' }}>
      <Boundary key={scene}><Scene /></Boundary>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);

// "Swap a skill" on the student's weekly panel, in a real browser.
//
// The week is composed exactly as MyMathPathApp composes it: the REAL
// buildWeeklyGoal proposes it, the server's own freeze rule
// (freezeWeeklyPathGoalProposal) freezes it, mergeWeeklyGoalSnapshot puts the
// frozen copy on top, and resolveWeeklySlotChoices + applyWeeklySlotChoices
// apply the student's swaps. The REAL WeeklyPathGoalPanel renders it.
//
// Pressing Start does not launch anything: the harness checks the launch the
// screen would send with the server's authorizeWeeklySlotLaunch and prints the
// verdict, so a swap the screen offers can be proved to be one the server runs.
// It sends what MyMathPathApp.startWeeklySession sends: nothing until the
// week's sessions are known, and an opened slot on the standard it was opened
// with (weeklyLaunchSession).
//
// HOW TO RUN: see tests/browser/weeklyPathSwap.mjs. No network is used.
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import WeeklyPathGoalPanel from '../../src/components/student/WeeklyPathGoalPanel.jsx';
import { buildWeeklyGoal, evaluateWeeklyGoalProgress, matchWeeklyGoalCompletions } from '../../src/platform/path/weeklyPathGoal.js';
import { PURPOSE, PURPOSE_LABEL, STUDENT_EXPLANATION } from '../../src/platform/path/recommendationV2.js';
import {
  applyWeeklySlotChoices, mergeWeeklyGoalSnapshot, resolveWeeklySlotChoices, weeklyLaunchSession,
} from '../../src/platform/path/weeklyPathChoice.js';
import {
  authorizeWeeklySlotLaunch, freezeWeeklyPathGoalProposal,
} from '../../functions/shared/weeklyPathSlotAuthority.mjs';
import { toCanonicalKey } from '../../src/utils/teksUtils.js';

const NOW = Date.parse('2026-10-07T15:00:00Z');

const row = (teksCode, purpose, score, studentLabel, extra = {}) => ({
  skillId: `teks:${teksCode}`,
  teksCode,
  purpose,
  purposeLabel: PURPOSE_LABEL[purpose],
  studentExplanation: STUDENT_EXPLANATION[purpose],
  studentLabel,
  score,
  context: 'course',
  dok: 2,
  difficultyBand: 3,
  eligibility: { eligible: true },
  ...extra,
});

const SESSIONS = [
  row('A.5A', PURPOSE.CURRENT_LEARNING, 0.92, 'Solve linear equations with variables on both sides'),
  row('A.3B', PURPOSE.RETENTION, 0.81, 'Find rate of change from a table or graph'),
  row('A.2C', PURPOSE.TRANSFER, 0.74, 'Write linear equations from two points', { context: 'digitalSAT', dok: 3, difficultyBand: 4 }),
  row('A.9C', PURPOSE.EXTENSION, 0.7, 'Model exponential growth and decay', { dok: 3, difficultyBand: 4 }),
];

const plan = {
  sessions: SESSIONS,
  considered: [
    ...SESSIONS,
    row('A.5B', PURPOSE.CURRENT_LEARNING, 0.88, 'Solve linear inequalities'),
    row('A.2I', PURPOSE.CURRENT_LEARNING, 0.86, 'Write systems of two linear equations'),
    row('A.2A', PURPOSE.RETENTION, 0.77, 'Domain and range of linear functions'),
    row('A.2B', PURPOSE.TRANSFER, 0.72, 'Write linear equations in different forms', { context: 'digitalSAT', dok: 3, difficultyBand: 4 }),
    // A transfer candidate whose SAT practice is not published: never offered.
    row('A.3C', PURPOSE.TRANSFER, 0.71, 'Graph linear functions', { context: 'course' }),
  ],
};

const proposed = buildWeeklyGoal({
  plan,
  config: { sessions: 4, ccmrExpectation: 'recommended' },
  studentId: 'harness-student',
  courseId: 'algebra1',
  now: NOW,
});
const snapshot = {
  ...freezeWeeklyPathGoalProposal(proposed, { studentId: 'harness-student', classId: 'harness-class', courseId: 'algebra1' }),
  assignmentState: 'assigned',
};
// A week frozen before swaps existed: schema 1, no alternatives on any slot.
const legacySnapshot = {
  ...snapshot,
  schemaVersion: 1,
  sessions: snapshot.sessions.map(({ alternatives: _omitted, ...slot }) => slot),
};
const slotKey = (index) => snapshot.sessions[index].weeklySlotKey;

function WeekScene({
  // The week as the SCREEN has it: null while the frozen copy has not loaded.
  frozen,
  // The week as the SERVER has it, which authorizes the launch either way.
  serverWeek = frozen || snapshot,
  inProgress = [],
  completions = [],
  compact = false,
  // Whether the student's sessions for the week have loaded.
  initialFactsStatus = 'ready',
}) {
  const [choices, setChoices] = useState({});
  const [launch, setLaunch] = useState(null);
  const [factsStatus, setFactsStatus] = useState(initialFactsStatus);
  // Until the facts load (or when the load failed) MyMathPathApp has no
  // completions (null: no grade card, no progress) and no open sessions.
  const settled = factsStatus === 'ready';
  const knownCompletions = settled ? completions : null;
  const knownInProgress = settled ? inProgress : [];
  const week = useMemo(() => mergeWeeklyGoalSnapshot({ proposed, snapshot: frozen }), [frozen]);
  const progress = useMemo(
    () => (knownCompletions ? evaluateWeeklyGoalProgress({ goal: week, completions: knownCompletions, now: NOW }) : null),
    [week, knownCompletions],
  );
  const completedSlots = useMemo(
    () => (knownCompletions ? matchWeeklyGoalCompletions({ goal: week, completions: knownCompletions }).matched.map((entry) => entry.matchedSlot) : []),
    [week, knownCompletions],
  );
  const goal = useMemo(() => applyWeeklySlotChoices({
    goal: week,
    choices: resolveWeeklySlotChoices({ goal: week, choices, inProgress: knownInProgress, completions: knownCompletions || [] }),
  }), [week, choices, knownInProgress, knownCompletions]);

  const onStart = (card) => {
    // The launch MyMathPathApp.startWeeklySession would send.
    if (factsStatus !== 'ready') {
      setLaunch('Launch held: the week’s sessions are not loaded yet');
      return;
    }
    const session = weeklyLaunchSession({ session: card, inProgress: knownInProgress });
    const verdict = authorizeWeeklySlotLaunch({
      goal: serverWeek,
      weeklySlotKey: session.weeklySlotKey,
      targetAlignmentKey: toCanonicalKey(session.teksCode),
      requestedFramework: session.context && session.context !== 'course' ? session.context : null,
      chosenSkillId: session.studentChose ? session.chosenSkillId : null,
    });
    setLaunch(verdict.ok
      ? `Launch authorized: ${session.teksCode}${verdict.swapped ? ` instead of ${verdict.swappedFromTeks}` : ''} · ${verdict.assessmentFramework || 'course'} · DOK ${verdict.intendedDok}, band ${verdict.intendedDifficultyBand}`
      : `Launch refused: ${verdict.message}`);
  };
  // "Try again" reloads the facts; here the reload succeeds after a beat.
  const onRetryFacts = () => {
    setFactsStatus('loading');
    setTimeout(() => setFactsStatus('ready'), 300);
  };
  const onChoose = (session, skillId) => setChoices((current) => {
    const next = { ...current };
    if (skillId) next[session.weeklySlotKey] = skillId;
    else delete next[session.weeklySlotKey];
    return next;
  });

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', padding: '20px 16px 40px' }}>
      <WeeklyPathGoalPanel
        goal={goal}
        progress={progress}
        completions={knownCompletions}
        completedSlots={completedSlots}
        inProgress={knownInProgress}
        factsStatus={factsStatus}
        onRetryFacts={onRetryFacts}
        onStartSession={onStart}
        onChooseAlternative={onChoose}
        compact={compact}
      />
      {launch && <p data-mm-launch="1" role="status" style={{ margin: '14px 0 0', fontWeight: 800 }}>{launch}</p>}
    </div>
  );
}

const SCENES = {
  swappable: () => <WeekScene frozen={snapshot} />,
  legacyWeek: () => <WeekScene frozen={legacySnapshot} />,
  resumeSwapped: () => (
    <WeekScene
      frozen={snapshot}
      inProgress={[{ status: 'active', weekKey: snapshot.weekKey, weeklySlotKey: slotKey(0), weeklySlot: 1, teksCode: 'A.5B', answeredQuestions: 2, requiredQuestions: 5 }]}
    />
  ),
  doneSwapped: () => (
    <WeekScene
      frozen={snapshot}
      completions={[{ status: 'completed', sessionId: 'p1', weekKey: snapshot.weekKey, weeklySlotKey: slotKey(0), weeklySlot: 1, teksCode: 'A.5B', accuracy: 0.8, completedAt: NOW - 3600000 }]}
    />
  ),
  compactSwappable: () => <WeekScene frozen={snapshot} compact />,
  compactLegacy: () => <WeekScene frozen={legacySnapshot} compact />,
  // Fix pass, finding 1: the panel before the student's sessions arrive, when
  // that load failed, and a Resume on a week whose frozen copy (and so the
  // swap) is not on screen yet.
  checking: () => <WeekScene frozen={snapshot} initialFactsStatus="loading" />,
  factsFailed: () => <WeekScene frozen={snapshot} initialFactsStatus="failed" />,
  resumeUnfrozen: () => (
    <WeekScene
      frozen={null}
      serverWeek={snapshot}
      inProgress={[{ status: 'active', weekKey: snapshot.weekKey, weeklySlotKey: slotKey(0), weeklySlot: 1, teksCode: 'A.5B', answeredQuestions: 2, requiredQuestions: 5 }]}
    />
  ),
};

const listeners = new Set();
let current = 'swappable';
window.__mmSwapScene = (name) => { current = name; listeners.forEach((notify) => notify(name)); };
window.__mmSwapScenes = Object.keys(SCENES);

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
    <div data-mm-scene={scene} style={{ minHeight: '100vh', background: 'var(--mm-surface-sunken)' }}>
      <Boundary key={scene}>{render ? render() : null}</Boundary>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);

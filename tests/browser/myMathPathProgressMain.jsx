// My Progress and Practice History, in a real browser, at desk and phone width.
//
// The headless suite proves the numbers. It cannot see whether the growth
// tiles shove sideways at 390px or put a 30px button under a thumb.
//
// Every number on screen is built by the REAL modules from synthetic answers:
// the weekly snapshots by buildMasteryHistoryDocument (the trigger's own
// builder, run once per synthetic week), the past weeks and streak by
// buildWeeklyPathHistory (the callable's builder) over frozen goals and
// production-shaped Path sessions, and Practice History by the real timeline.
// Nothing here reaches Firestore: the runner aborts every non-localhost request.
//
// HOW TO RUN: see tests/browser/myMathPathProgress.mjs.
import React, { Component, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
// Both stylesheets, in main.jsx's order: the design tokens these screens are
// drawn with, and the body reset production measures against.
import '../../src/index.css';
import '../../src/App.css';
import MyMathPathProgress from '../../src/components/student/MyMathPathProgress.jsx';
import StudentPracticeHistory from '../../src/components/student/StudentPracticeHistory.jsx';
import { buildMasteryHistoryDocument } from '../../functions/shared/masteryHistory.mjs';
import { buildWeeklyPathHistory } from '../../functions/shared/weeklyPathHistory.mjs';
import { dueAtFor } from '../../src/platform/path/weeklyPathGoal.js';

const DAY = 86400000;
// Wednesday 7 October 2026: this week is 5 October.
const NOW = Date.parse('2026-10-07T15:00:00Z');
const WEEKS = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'];

// --- Weekly mastery snapshots, one trigger write per synthetic week ---------
const profile = (estimate, events) => ({
  mastery: { estimate },
  accumulator: { eligibleEvents: events, effectiveWeight: events, independentSuccesses: Math.min(3, events) },
  dimensions: { dokRepresented: events >= 4 ? [2, 3] : [1, 2] },
});
const ESTIMATES = {
  'A.5A': [52, 61, 70, 78, 86, 91],
  'A.2C': [70, 72, 75, 80, 84, 88],
  'A.3B': [40, 44, 52, 58, 63, 66],
  'A.4A': [80, 79, 76, 74, 72, 71],
  'A.6A': [null, null, null, 45, 55, 62],
  'A.10A': [null, null, null, null, null, 35],
};
let masteryHistory = null;
WEEKS.forEach((weekKey, index) => {
  const at = Date.parse(`${weekKey}T15:00:00Z`) + 2 * DAY;
  const profiles = Object.fromEntries(Object.entries(ESTIMATES)
    .filter(([, series]) => series[index] !== null)
    .map(([code, series]) => [code, profile(series[index], 2 + index)]));
  masteryHistory = buildMasteryHistoryDocument({
    existing: masteryHistory, profiles, studentId: 'S-demo',
    authorization: { classId: 'class-a', authorizedTeacherEmails: ['teacher@example.test'] },
    occurredAt: Math.min(at, NOW), now: Math.min(at, NOW),
  });
});

// --- Frozen weekly goals and production-shaped Path sessions -----------------
const TEKS = ['A.5A', 'A.2C', 'A.3B', 'A.6A'];
const slot = (n, teks) => ({ slot: n, weeklySlotKey: `${n}|skill-${teks}|${teks}|current|course|2|3`, teksCode: teks, purpose: 'current', context: 'course', dok: 2, difficultyBand: 3, status: 'notStarted' });
const goalFor = (weekKey) => ({
  schemaVersion: 1, studentId: 'S-demo', classId: 'class-a', courseId: 'algebra1', weekKey,
  dueAt: dueAtFor(Date.parse(`${weekKey}T12:00:00Z`)), goalSessions: 4,
  sessions: TEKS.map((teks, index) => slot(index + 1, teks)), assignmentState: 'assigned',
});
const goalsByWeekKey = Object.fromEntries(WEEKS.slice(1).map((weekKey) => [weekKey, goalFor(weekKey)]));
let sessionNumber = 0;
const sessionsFor = (weekKey, finished, correct = 4) => goalsByWeekKey[weekKey].sessions.slice(0, finished).map((target, index) => {
  sessionNumber += 1;
  const completedAt = Date.parse(`${weekKey}T16:00:00Z`) + index * DAY;
  return {
    id: `path-${sessionNumber}`,
    data: {
      studentId: 'S-demo', status: 'completed', completedAt, updatedAt: completedAt, weekKey,
      weeklySlotKey: target.weeklySlotKey, weeklySlot: target.slot, requiredQuestions: 5,
      target: { alignmentKey: `texas:${target.teksCode}` }, summary: { completedQuestions: 5, correctQuestions: correct },
    },
  };
});
const sessions = [
  ...sessionsFor('2026-09-07', 4, 4),
  ...sessionsFor('2026-09-14', 2, 3),
  ...sessionsFor('2026-09-21', 4, 5),
  ...sessionsFor('2026-09-28', 4, 4),
  ...sessionsFor('2026-10-05', 1, 5),
];
const weeklyHistory = buildWeeklyPathHistory({ goalsByWeekKey, sessions, now: NOW });

// --- Practice History: 300 answers, with the raw ids the log used to print ---
const supportCycle = [
  { presented: ['textToSpeech', 'largeText'], used: ['textToSpeech'] },
  { presented: ['glossary', 'modification:reduce-complexity'], used: ['hint'], modified: true },
  { presented: ['text-to-speech'], used: ['workedExample'] },
  { presented: [], used: [] },
];
const evidenceEvents = Array.from({ length: 300 }, (_, index) => {
  const cycle = supportCycle[index % supportCycle.length];
  const occurredAt = NOW - index * 3 * 3600000;
  const correct = index % 3 !== 0;
  return {
    eventKey: `ev-${index}`,
    occurredAt,
    alignmentKeys: [`texas:${TEKS[index % TEKS.length]}`],
    source: { activityRole: index % 5 === 0 ? 'retention' : 'practice' },
    performance: { score: correct ? 1 : 0, isCorrect: correct, attemptNumber: 1 + (index % 2) },
    supportUsage: {
      hintUsed: cycle.used.includes('hint'),
      workedExampleUsed: cycle.used.includes('workedExample'),
      ...(cycle.modified ? { modified: true, modifications: ['reduce-complexity'] } : {}),
    },
    supportTelemetry: [
      ...cycle.presented.map((supportType) => ({ stage: 'presented', supportType })),
      ...cycle.used.map((supportType) => ({ stage: 'used', supportType })),
    ],
  };
});

// --- Scenes ------------------------------------------------------------------
const resolved = (value) => () => Promise.resolve(value);
const loaders = {
  history: resolved(masteryHistory),
  weekly: resolved(weeklyHistory),
  none: resolved(null),
  emptyWeekly: resolved(buildWeeklyPathHistory({ goalsByWeekKey: {}, sessions: [], now: NOW })),
  failing: () => Promise.reject(new Error('synthetic outage')),
};

function ShellScene() {
  const [Experience, setExperience] = useState(null);
  useEffect(() => {
    // Loaded on demand so a problem in the full shell cannot blank the others.
    import('../../src/components/student/MyMathPathApp.jsx').then((module) => setExperience(() => module.MyMathPathExperience));
  }, []);
  if (!Experience) return <div>Loading shell…</div>;
  return (
    <Experience
      studentId="S-demo"
      studentName="Demo Student"
      initialTab="progress"
      courseId="algebra1"
      masteryData={{ masteryProfilesByTEKS: {}, retentionSchedulesByTEKS: {} }}
      evidenceEvents={evidenceEvents.slice(0, 20)}
      // The simulator's surface: no production calls, sessions handed over.
      sessionProvider={{ listPathSessions: () => sessions }}
      coverageOverride={{ skills: {} }}
      loading={false}
      onExit={() => {}}
    />
  );
}

const SCENES = {
  progress: () => <MyMathPathProgress now={NOW} loadMasteryHistory={loaders.history} loadWeeklyHistory={loaders.weekly} onOpenPath={() => {}} />,
  progressNewStudent: () => <MyMathPathProgress now={NOW} loadMasteryHistory={loaders.none} loadWeeklyHistory={loaders.emptyWeekly} onOpenPath={() => {}} />,
  progressTeacher: () => (
    <MyMathPathProgress
      now={NOW}
      loadMasteryHistory={loaders.history}
      loadWeeklyHistory={null}
      weeklyUnavailableMessage="The student sees their past weekly goals and grades here. Past weekly grades go to Google Classroom when publishing is on."
    />
  ),
  progressOutage: () => <MyMathPathProgress now={NOW} loadMasteryHistory={loaders.failing} loadWeeklyHistory={loaders.weekly} />,
  practiceHistory: () => <StudentPracticeHistory evidenceEvents={evidenceEvents} availableTeks={TEKS} eventLimit={300} />,
  shell: () => <ShellScene />,
};

class Boundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <pre data-mm-crashed>{String(this.state.error?.stack || this.state.error)}</pre>;
    return this.props.children;
  }
}

function Harness() {
  const [scene, setScene] = useState(null);
  useEffect(() => { window.__mmProgressScene = (name) => setScene(name); }, []);
  if (!scene) return <div>Choose a scene.</div>;
  const Scene = SCENES[scene];
  return (
    <div data-mm-scene={scene} key={scene} style={{ background: 'var(--mm-surface-sunken, #f6f7f9)', minHeight: '100vh' }}>
      <Boundary>{Scene ? <Scene /> : <div data-mm-crashed>Unknown scene {scene}</div>}</Boundary>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);

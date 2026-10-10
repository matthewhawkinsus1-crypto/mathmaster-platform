// Retention checks, on the real student screens, from synthetic data only.
//
// The Path map's "Quick retention check" section, the weekly Retention card
// (not started, half done, done), the Overview banner and focus card, and the
// screen a finished check ends on. Every number comes from the shared rules the
// server uses (the retention scheduler over unified mastery profiles, the
// weekly completion collector, the shared retention verdict), and every button
// records what it would launch so the driver can check it is a two-question
// retentionProbe. HOW TO RUN: see tests/browser/pathRetention.mjs.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import StudentLearningPath from '../../src/components/student/StudentLearningPath.jsx';
import WeeklyPathGoalPanel from '../../src/components/student/WeeklyPathGoalPanel.jsx';
import MyMathPathDashboard from '../../src/components/student/MyMathPathDashboard.jsx';
import MyMathPathProductionContainer from '../../src/components/student/MyMathPathProductionContainer.jsx';
import { getStudentPathOptions } from '../../src/platform/path/recommendationEngine.js';
import { getSkillGraph, teksCodeFromSkillId } from '../../src/platform/path/skillGraph.js';
import { sequenceProvider } from '../../src/platform/path/curriculumPacing.js';
import { studentLabelForTeks } from '../../src/platform/path/skillLabels.js';
import { buildUnifiedMasteryProfiles, masteryBySkillFromProfiles } from '../../src/platform/mastery/unifiedMastery.js';
import { evaluateStudentRetentionSchedule } from '../../src/platform/retention/retentionScheduler.js';
import { pathCardLaunchOptions, weeklySessionLaunchOptions } from '../../src/platform/path/pathSessionLaunch.js';
import { PURPOSE, PURPOSE_LABEL, STUDENT_EXPLANATION } from '../../src/platform/path/recommendationV2.js';
import { collectWeeklyPathSessions } from '../../functions/shared/weeklyPathCompletion.mjs';
import { evaluateWeeklyGoalProgress, matchWeeklyGoalCompletions, weekKeyFor } from '../../functions/shared/weeklyPathGrade.mjs';
import { retentionCheckOutcome } from '../../functions/shared/pathRetentionCheck.mjs';
// The real theme tokens, so contrast and spacing are the product's own.
import '../../src/index.css';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const COURSE = 'algebra1';
const skills = getSkillGraph(COURSE);
const codes = skills.slice(3, 6).map((skill) => teksCodeFromSkillId(skill.skillId));

// What the launch would have been. The driver reads it after a click.
const record = (launch) => { window.__mmLastLaunch = JSON.parse(JSON.stringify(launch)); };

// --- One student's retention state -------------------------------------------

const masteredProfile = (daysAgo) => ({
  mastery: { estimate: 92, confidence: 'High' },
  accumulator: { eligibleEvents: 6, effectiveWeight: 6, independentSuccesses: 4 },
  dimensions: { eligibleGradeLevelEvents: 6, dokRepresented: [2, 3], lastIndependentSuccessAt: NOW - daysAgo * DAY },
});
// codes[1] missed its last check: a concern. codes[0] is simply due.
const missed = retentionCheckOutcome({ teksCode: codes[1], summary: { completedQuestions: 2, independentSuccesses: 1 }, currentSchedule: {}, now: NOW - DAY });
const schedules = { [codes[1]]: missed.schedule };
const profiles = buildUnifiedMasteryProfiles({
  serverProfiles: { [codes[0]]: masteredProfile(20), [codes[1]]: masteredProfile(12), [codes[2]]: masteredProfile(2) },
  retentionSchedulesByTEKS: schedules,
});
const report = evaluateStudentRetentionSchedule(profiles, schedules, NOW);
const pathOptions = getStudentPathOptions({
  courseId: COURSE,
  masteryBySkill: masteryBySkillFromProfiles(profiles),
  pacing: { windowIndex: 2, windowCount: 6, accelerationRadius: 1 },
  pacingProvider: sequenceProvider({ skills, windowCount: 6 }),
});

// --- This week ---------------------------------------------------------------

const WEEK = weekKeyFor(NOW);
const slot = (n, teks, purpose) => ({
  slot: n,
  weeklySlotKey: `${n}|teks:${teks}|${teks}|${purpose}|course|2|3`,
  skillId: `teks:${teks}`,
  teksCode: teks,
  purpose,
  purposeLabel: PURPOSE_LABEL[purpose],
  studentExplanation: STUDENT_EXPLANATION[purpose],
  studentLabel: studentLabelForTeks(teks),
  context: 'course',
  dok: 2,
  difficultyBand: 3,
  alternatives: [],
});
const goal = {
  weekKey: WEEK,
  goalSessions: 3,
  assignmentState: 'assigned',
  dueAt: NOW + 3 * DAY,
  sessions: [slot(1, 'A.5A', PURPOSE.CURRENT_LEARNING), slot(2, codes[0], PURPOSE.RETENTION), slot(3, 'A.2C', PURPOSE.CURRENT_LEARNING)],
};
const sessionDoc = (status, entry, extra = {}) => ({
  studentId: 's',
  status,
  sessionKind: entry.purpose === PURPOSE.RETENTION ? 'retentionProbe' : 'practice',
  weekKey: WEEK,
  weeklySlotKey: entry.weeklySlotKey,
  weeklySlot: entry.slot,
  requiredQuestions: entry.purpose === PURPOSE.RETENTION ? 2 : 5,
  target: { alignmentKey: `texas:${entry.teksCode}` },
  createdAt: NOW - 2 * 3600000,
  updatedAt: NOW - 3600000,
  completedAt: status === 'completed' ? NOW - 3600000 : null,
  ...extra,
});
const weekFacts = (docs) => {
  const { completions, inProgress } = collectWeeklyPathSessions({ sessions: docs.map((data, index) => ({ id: `s${index}`, data })), weekKey: WEEK });
  return {
    completions,
    inProgress,
    progress: evaluateWeeklyGoalProgress({ goal, completions, now: NOW }),
    completedSlots: matchWeeklyGoalCompletions({ goal, completions }).matched.map((entry) => entry.matchedSlot),
  };
};
const WeeklyScene = ({ docs }) => {
  const facts = weekFacts(docs);
  return (
    <WeeklyPathGoalPanel
      goal={goal}
      progress={facts.progress}
      completions={facts.completions}
      completedSlots={facts.completedSlots}
      inProgress={facts.inProgress}
      onStartSession={(session) => record({ teksCode: session.teksCode, ...weeklySessionLaunchOptions(session, { weekKey: WEEK }) })}
      onChooseAlternative={() => {}}
    />
  );
};

// --- The end of a check: a stub runtime returning the finished session ------

const finishedCheck = (outcome) => ({
  sessionId: `check-${outcome}`,
  status: 'completed',
  sessionKind: 'retentionProbe',
  requiredQuestions: 2,
  weekKey: WEEK,
  weeklySlotKey: goal.sessions[1].weeklySlotKey,
  weeklySlot: 2,
  weeklyPurpose: PURPOSE.RETENTION,
  target: { alignmentKey: `texas:${codes[0]}` },
  summary: { completedQuestions: 2, correctQuestions: outcome === 'passed' ? 2 : 1, independentSuccesses: outcome === 'passed' ? 2 : 1 },
  retentionOutcome: outcome,
});
// Module-level so their identities are stable across renders.
const providerFor = (session) => ({
  startOrResumePathSession: async () => ({ success: true, session }),
  fetchNextSanitizedQuestion: async () => { throw new Error('A finished check has no next question.'); },
  submitStudentResponse: async () => { throw new Error('A finished check takes no answers.'); },
});
const PASSED_PROVIDER = providerFor(finishedCheck('passed'));
const MISSED_PROVIDER = providerFor(finishedCheck('failed'));
const CheckEnd = ({ provider }) => (
  <MyMathPathProductionContainer
    targetAlignmentKey={`texas:${codes[0]}`}
    sessionKind="retentionProbe"
    requiredQuestions={2}
    weekKey={WEEK}
    weeklySlotKey={goal.sessions[1].weeklySlotKey}
    weeklySlot={2}
    weeklyPurpose={PURPOSE.RETENTION}
    weeklyGoalRequired={3}
    sessionProvider={provider}
    studentProfile={null}
    onReturnToDashboard={() => {}}
    onSessionComplete={() => {}}
  />
);

const scenes = {
  // The Path tab's map: the scheduler's two pending checks, the concern first.
  pathMap: () => (
    <StudentLearningPath
      pathOptions={pathOptions}
      retentionDue={report.pendingProbes}
      isCovered={() => true}
      skillProgressByTEKS={{ [codes[0]]: { passesCompleted: 2 } }}
      onChooseSkill={(card) => record({ teksCode: teksCodeFromSkillId(card.skillId), ...pathCardLaunchOptions(card) })}
    />
  ),
  weeklyRetention: () => <WeeklyScene docs={[]} />,
  weeklyRetentionResume: () => (
    <WeeklyScene docs={[
      sessionDoc('completed', goal.sessions[0], { summary: { completedQuestions: 5, correctQuestions: 4 } }),
      sessionDoc('active', goal.sessions[1], { summary: { completedQuestions: 1, correctQuestions: 1, independentSuccesses: 1 } }),
    ]} />
  ),
  weeklyRetentionDone: () => (
    <WeeklyScene docs={[
      sessionDoc('completed', goal.sessions[1], { summary: { completedQuestions: 2, correctQuestions: 2, independentSuccesses: 2 }, retentionOutcome: 'passed' }),
    ]} />
  ),
  overview: () => {
    const facts = weekFacts([]);
    return (
      <MyMathPathDashboard
        studentName="Avery"
        masteryProfilesByTEKS={profiles}
        retentionSchedulesByTEKS={schedules}
        retentionReport={report}
        recommendedTeks="A.5A"
        courseId={COURSE}
        pathOptions={pathOptions}
        weeklyGoal={goal}
        weeklyProgress={facts.progress}
        weeklyCompletions={facts.completions}
        completedSlots={facts.completedSlots}
        weeklyInProgress={facts.inProgress}
        onStartSession={(teksCode, options) => record({ teksCode, ...options })}
        onStartWeeklySession={(session) => record({ teksCode: session.teksCode, ...weeklySessionLaunchOptions(session, { weekKey: WEEK }) })}
        onOpenPath={() => {}}
      />
    );
  },
  checkPassed: () => <CheckEnd provider={PASSED_PROVIDER} />,
  checkMissed: () => <CheckEnd provider={MISSED_PROVIDER} />,
};

class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() { return this.state.error ? <div data-mm-crashed>{String(this.state.error?.message || this.state.error)}</div> : this.props.children; }
}

function Harness() {
  const [name, setName] = useState(null);
  useEffect(() => {
    window.__mmRetentionScene = (next) => { window.__mmLastLaunch = null; setName(next); };
    window.__mmRetentionFacts = { codes, pending: report.pendingProbes.map((probe) => ({ teksCode: probe.teksCode, priority: probe.priority })) };
  }, []);
  if (!name) return <div>ready</div>;
  const Scene = scenes[name];
  return <div data-mm-scene={name} style={{ background: 'var(--mm-surface-sunken)' }}><Boundary key={name}>{Scene ? <Scene /> : <div data-mm-crashed>unknown scene</div>}</Boundary></div>;
}

createRoot(document.getElementById('root')).render(<Harness />);

// The weekly panel and the skill card, rendered from the SAME shared rules the
// server uses (weeklyPathCompletion.mjs, weeklyPathGrade.mjs, masteryRule.mjs),
// with synthetic data only. HOW TO RUN: see tests/browser/pathProgressTruth.mjs.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import WeeklyPathGoalPanel from '../../src/components/student/WeeklyPathGoalPanel.jsx';
import { SkillDetailCardModal } from '../../src/components/student/SkillDetailCardModal.jsx';
import { collectWeeklyPathSessions } from '../../functions/shared/weeklyPathCompletion.mjs';
import { evaluateWeeklyGoalProgress, matchWeeklyGoalCompletions } from '../../functions/shared/weeklyPathGrade.mjs';
import { buildUnifiedMasteryProfiles } from '../../src/platform/mastery/unifiedMastery.js';

const WEEK = '2026-10-05';
const NOW = Date.parse('2026-10-07T18:00:00Z');
const slot = (n, teks, label, purpose = 'currentLearning') => ({
  slot: n, weeklySlotKey: `${n}|skill:${teks}|${teks}|${purpose}|course|2|3`, skillId: `teks:${teks}`, teksCode: teks,
  purpose, context: 'course', dok: 2, difficultyBand: 3, studentLabel: label,
  purposeLabel: 'Current learning', studentExplanation: 'Your class is working on this now.',
});
const goal = {
  weekKey: WEEK, goalSessions: 3, assignmentState: 'assigned', dueAt: Date.parse('2026-10-12T04:59:59Z'),
  settings: undefined,
  sessions: [slot(1, 'A.5A', 'Solve linear equations'), slot(2, 'A.2C', 'Write linear equations'), slot(3, 'A.3B', 'Rate of change')],
};
const sessionDoc = (status, slotEntry, extra = {}) => ({
  studentId: 's', status, weekKey: WEEK, weeklySlotKey: slotEntry.weeklySlotKey, weeklySlot: slotEntry.slot,
  requiredQuestions: 5, target: { alignmentKey: `texas:${slotEntry.teksCode}` },
  summary: { completedQuestions: status === 'completed' ? 5 : 1, correctQuestions: status === 'completed' ? 4 : 1 },
  createdAt: NOW - 3600000, updatedAt: NOW - 1800000, completedAt: status === 'completed' ? NOW - 1800000 : null, ...extra,
});

const scenes = {
  // One completed session and one opened with a single answer. The opened one
  // must read "Resume", must NOT be ticked, and the count must say 1 of 3.
  weeklyHalfDone: () => {
    const { completions, inProgress } = collectWeeklyPathSessions({
      sessions: [{ id: 'a', data: sessionDoc('completed', goal.sessions[0]) }, { id: 'b', data: sessionDoc('active', goal.sessions[1]) }],
      weekKey: WEEK,
    });
    const progress = evaluateWeeklyGoalProgress({ goal, completions, now: NOW });
    const completedSlots = matchWeeklyGoalCompletions({ goal, completions }).matched.map((entry) => entry.matchedSlot);
    return <WeeklyPathGoalPanel goal={goal} progress={progress} completions={completions} completedSlots={completedSlots} inProgress={inProgress} />;
  },
  weeklyHalfDoneCompact: () => {
    const { completions, inProgress } = collectWeeklyPathSessions({
      sessions: [{ id: 'b', data: sessionDoc('active', goal.sessions[1]) }], weekKey: WEEK,
    });
    const progress = evaluateWeeklyGoalProgress({ goal, completions, now: NOW });
    return <WeeklyPathGoalPanel goal={goal} progress={progress} completions={completions} completedSlots={[]} inProgress={inProgress} compact />;
  },
  skillCardNotYet: () => {
    const profiles = buildUnifiedMasteryProfiles({ serverProfiles: { 'A.5A': {
      mastery: { estimate: 90, confidence: 'Medium' },
      accumulator: { eligibleEvents: 5, effectiveWeight: 5, independentSuccesses: 1 },
      dimensions: { eligibleGradeLevelEvents: 5, dokRepresented: [1, 2] },
    } } });
    return <SkillDetailCardModal teksCode="A.5A" masteryProfile={profiles['A.5A']} pathPassProgress={{ passesCompleted: 2 }} onClose={() => {}} onStartPractice={() => {}} />;
  },
  skillCardMastered: () => {
    const profiles = buildUnifiedMasteryProfiles({ serverProfiles: { 'A.5A': {
      mastery: { estimate: 91, confidence: 'High' },
      accumulator: { eligibleEvents: 8, effectiveWeight: 8, independentSuccesses: 5 },
      dimensions: { eligibleGradeLevelEvents: 8, dokRepresented: [2, 3] },
    } } });
    return <SkillDetailCardModal teksCode="A.5A" masteryProfile={profiles['A.5A']} pathPassProgress={{ passesCompleted: 1 }} onClose={() => {}} onStartPractice={() => {}} />;
  },
};

class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() { return this.state.error ? <div data-mm-crashed>{String(this.state.error?.message || this.state.error)}</div> : this.props.children; }
}

function Harness() {
  const [name, setName] = useState(null);
  useEffect(() => { window.__mmPathScene = (next) => setName(next); }, []);
  if (!name) return <div>ready</div>;
  const Scene = scenes[name];
  return <div data-mm-scene={name} style={{ padding: 12 }}><Boundary key={name}>{Scene ? <Scene /> : <div data-mm-crashed>unknown scene</div>}</Boundary></div>;
}

createRoot(document.getElementById('root')).render(<Harness />);

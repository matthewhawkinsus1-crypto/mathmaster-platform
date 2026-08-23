import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWeeklyGoal, evaluateWeeklyGoalProgress, gradeWeeklyGoal, matchWeeklyGoalCompletions,
} from '../../src/platform/path/weeklyPathGoal.js';
import { PURPOSE } from '../../src/platform/path/recommendationV2.js';

const now = Date.parse('2026-08-17T12:00:00Z');
const goal = { ...buildWeeklyGoal({
  studentId: 'S1', courseId: 'algebra1', now,
  config: { sessions: 3, ccmrExpectation: 'recommended' },
  plan: { sessions: [
    { skillId: 'a2a', teksCode: 'A.2A', purpose: PURPOSE.CURRENT_LEARNING, context: 'course', dok: 2, difficultyBand: 3 },
    { skillId: 'a2a', teksCode: 'A.2A', purpose: PURPOSE.RETENTION, context: 'course', dok: 2, difficultyBand: 3 },
    { skillId: 'a2a', teksCode: 'A.2A', purpose: PURPOSE.TRANSFER, context: 'digitalSAT', dok: 3, difficultyBand: 4 },
  ] },
}), assignmentState: 'assigned' };

test('weekly goal assigns a stable identity to every slot, even when TEKS repeats', () => {
  assert.equal(goal.sessions.length, 3);
  assert.equal(new Set(goal.sessions.map((slot) => slot.weeklySlotKey)).size, 3);
  assert.deepEqual(goal.sessions.map((slot) => slot.slot), [1, 2, 3]);
});

test('one completed session can satisfy only one same-TEKS weekly slot', () => {
  const first = goal.sessions[0];
  const result = matchWeeklyGoalCompletions({
    goal,
    completions: [{ status: 'completed', sessionId: 'P1', weekKey: goal.weekKey, weeklySlotKey: first.weeklySlotKey, teksCode: 'A.2A', accuracy: 1, completedAt: now + 1000 }],
  });
  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0].matchedSlot, 1);
});

test('unassigned extra practice never inflates weekly completion or grade quality', () => {
  const assigned = goal.sessions.slice(0, 2).map((slot, index) => ({
    status: 'completed', sessionId: `assigned-${index}`, weekKey: goal.weekKey,
    weeklySlotKey: slot.weeklySlotKey, teksCode: slot.teksCode, accuracy: 0.75,
    completedAt: now + (index + 1) * 1000,
  }));
  const extra = { status: 'completed', sessionId: 'extra', teksCode: 'A.2A', assessmentFramework: 'course', accuracy: 1, completedAt: now + 5000 };
  const progress = evaluateWeeklyGoalProgress({ goal, completions: [...assigned, extra], now });
  assert.equal(progress.completed, 2);
  assert.equal(progress.extraPracticeCompletions.length, 1);
  const grade = gradeWeeklyGoal({ goal, completions: [...assigned, extra], now });
  assert.equal(grade.components.qualityRatio, 0.75);
});

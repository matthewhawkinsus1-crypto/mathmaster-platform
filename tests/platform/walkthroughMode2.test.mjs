import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLiveStatus, classifyLiveActivity, classifyLiveStudent, LIVE_ACTIVITY,
} from '../../src/livePresence.js';
import {
  buildProjectorState, startLiveTeachingSession, advanceLiveTeachingSession,
  updateWalkthroughTimer, walkthroughTimerRemaining,
} from '../../src/platform/teacher/liveTeachingSession.js';

const NOW = 2_000_000;
const live = (overrides = {}) => buildLiveStatus({
  assignmentId: 'a1', nowValue: NOW, lastInteractionAt: NOW - 130_000,
  pageVisible: true, ...overrides,
});

test('activity separates connection, visibility, and academic interaction', () => {
  assert.equal(classifyLiveActivity(live(), NOW), LIVE_ACTIVITY.VIEWING);
  assert.match(classifyLiveStudent({ id: 's1', liveStatus: live() }, { nowValue: NOW }).headline, /^Viewing/);
  assert.equal(classifyLiveActivity(live({ lastInteractionAt: NOW - 20_000 }), NOW), LIVE_ACTIVITY.WORKING);
  assert.equal(classifyLiveActivity(live({ lastInteractionAt: NOW - 70_000 }), NOW), LIVE_ACTIVITY.RECENT);
  assert.equal(classifyLiveActivity(live({ pageVisible: false }), NOW), LIVE_ACTIVITY.AWAY);
  assert.equal(classifyLiveActivity(live({ nowValue: NOW - 80_000 }), NOW), LIVE_ACTIVITY.DISCONNECTED);
});

test('one deterministic walkthrough session advances without losing its timer', () => {
  const assignment = { questions: [{ activityRole: 'classwork', instructionalPhase: 'iDo', suggestedWorkSeconds: 90 }, { activityRole: 'classwork', instructionalPhase: 'weDo' }] };
  const session = startLiveTeachingSession({ teacherUid: 't1', classId: 'c1', assignmentId: 'a1', assignment, suggestedWorkSeconds: 90, nowValue: NOW });
  const next = advanceLiveTeachingSession(session, { assignment, storageQuestionIndex: 1, activityRole: 'classwork' });
  assert.equal(next.sessionId, session.sessionId);
  assert.deepEqual(next.timer, session.timer);
  assert.equal(next.instructionalPhase, 'weDo');
});

test('walkthrough timer starts, pauses, resumes, extends, resets, and expires from timestamps', () => {
  let timer = updateWalkthroughTimer(null, 'reset', { durationSeconds: 90, nowValue: NOW });
  timer = updateWalkthroughTimer(timer, 'start', { nowValue: NOW });
  assert.equal(walkthroughTimerRemaining(timer, NOW + 30_000), 60);
  timer = updateWalkthroughTimer(timer, 'pause', { nowValue: NOW + 30_000 });
  assert.equal(timer.remainingSeconds, 60);
  timer = updateWalkthroughTimer(timer, 'extend', { durationSeconds: 30, nowValue: NOW + 30_000 });
  assert.equal(timer.remainingSeconds, 90);
  timer = updateWalkthroughTimer(timer, 'resume', { nowValue: NOW + 40_000 });
  timer = updateWalkthroughTimer(timer, 'tick', { nowValue: NOW + 131_000 });
  assert.equal(timer.status, 'expired');
  assert.equal(updateWalkthroughTimer(timer, 'reset').status, 'idle');
});

test('projector projection cannot expose private monitoring or demo state', () => {
  const projected = buildProjectorState({ active: true, storageQuestionIndex: 2, timer: { status: 'running' }, projectorState: { showTimer: true, showInstructionalPhase: false }, students: [{ name: 'Private' }], grades: {}, demoResponse: 'secret' });
  assert.deepEqual(Object.keys(projected).sort(), ['active', 'activityRole', 'classworkQuestionPosition', 'instructionalPhase', 'reviewVisible', 'storageQuestionIndex', 'timer'].sort());
  assert.doesNotMatch(JSON.stringify(projected), /Private|secret|grade|student/i);
});

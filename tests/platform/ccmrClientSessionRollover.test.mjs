import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CCMR_CONTENT_RELEASE_CHANGE_REASON,
  fetchQuestionWithContentReleaseRollover,
} from '../../src/platform/path/sessionContentReleaseRollover.js';

const config = {
  targetAlignmentKey: 'ALG1.A.2A',
  sessionKind: 'practice',
  requiredQuestions: 5,
  assessmentFramework: 'digitalSAT',
  weekKey: '2026-08-24',
  weeklySlotKey: 'slot-2',
  weeklySlot: 2,
};

const activeSession = (id, overrides = {}) => ({
  sessionId: id,
  status: 'active',
  assessmentFramework: 'digitalSAT',
  target: { alignmentKey: 'ALG1.A.2A' },
  ...overrides,
});

test('ordinary next-question response passes through without restarting', async () => {
  const calls = [];
  const result = await fetchQuestionWithContentReleaseRollover({
    session: activeSession('old-session'),
    sessionConfig: config,
    fetchNextSanitizedQuestion: async ({ sessionId }) => {
      calls.push(['issue', sessionId]);
      return { questionInstance: { questionInstanceId: 'q-1' } };
    },
    startOrResumePathSession: async () => {
      calls.push(['start']);
      throw new Error('should not restart');
    },
  });

  assert.deepEqual(calls, [['issue', 'old-session']]);
  assert.equal(result.rolledOver, false);
  assert.equal(result.session.sessionId, 'old-session');
  assert.equal(result.questionInstance.questionInstanceId, 'q-1');
});

test('content release rollover restarts the exact launch and issues from the new session', async () => {
  const calls = [];
  const result = await fetchQuestionWithContentReleaseRollover({
    session: activeSession('old-session'),
    sessionConfig: config,
    fetchNextSanitizedQuestion: async ({ sessionId }) => {
      calls.push(['issue', sessionId]);
      if (sessionId === 'old-session') {
        return {
          rollover: {
            reason: CCMR_CONTENT_RELEASE_CHANGE_REASON,
            assessmentFramework: 'digitalSAT',
            targetAlignmentKey: 'ALG1.A.2A',
            currentRelease: 'ccmr-fidelity-v2.1-authentic-language',
          },
        };
      }
      return { questionInstance: { questionInstanceId: 'q-new' } };
    },
    startOrResumePathSession: async (received) => {
      calls.push(['start', received]);
      return { session: activeSession('new-session') };
    },
  });

  assert.deepEqual(calls, [
    ['issue', 'old-session'],
    ['start', config],
    ['issue', 'new-session'],
  ]);
  assert.equal(result.rolledOver, true);
  assert.equal(result.session.sessionId, 'new-session');
  assert.equal(result.questionInstance.questionInstanceId, 'q-new');
  assert.equal(result.rollover.currentRelease, 'ccmr-fidelity-v2.1-authentic-language');
});

test('a non-release rollover is refused instead of silently restarting', async () => {
  await assert.rejects(
    fetchQuestionWithContentReleaseRollover({
      session: activeSession('old-session'),
      sessionConfig: config,
      fetchNextSanitizedQuestion: async () => ({ rollover: { reason: 'unknown-rollover' } }),
      startOrResumePathSession: async () => ({ session: activeSession('new-session') }),
    }),
    /unknown session rollover/i,
  );
});

test('rollover refuses a replacement session that is not active', async () => {
  await assert.rejects(
    fetchQuestionWithContentReleaseRollover({
      session: activeSession('old-session'),
      sessionConfig: config,
      fetchNextSanitizedQuestion: async () => ({
        rollover: { reason: CCMR_CONTENT_RELEASE_CHANGE_REASON },
      }),
      startOrResumePathSession: async () => ({ session: activeSession('new-session', { status: 'completed' }) }),
    }),
    /replacement.*active|active.*replacement/i,
  );
});

test('a second release rollover in the same handoff fails closed instead of looping', async () => {
  let starts = 0;
  await assert.rejects(
    fetchQuestionWithContentReleaseRollover({
      session: activeSession('old-session'),
      sessionConfig: config,
      fetchNextSanitizedQuestion: async () => ({
        rollover: { reason: CCMR_CONTENT_RELEASE_CHANGE_REASON },
      }),
      startOrResumePathSession: async () => {
        starts += 1;
        return { session: activeSession('new-session') };
      },
    }),
    /changed again|release.*again/i,
  );
  assert.equal(starts, 1);
});

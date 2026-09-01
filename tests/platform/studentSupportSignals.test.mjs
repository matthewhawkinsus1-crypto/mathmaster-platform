import test from 'node:test';
import assert from 'node:assert/strict';

import { LIVE_FLAGS, LIVE_SEVERITY } from '../../src/livePresence.js';
import {
  SUPPORT_EVENT_KIND,
  SUPPORT_EVENT_STAGE,
  buildArchivedIntegrityReviewSignal,
  buildIntegrityReviewSignal,
  buildParentFollowUpCandidates,
  buildSuggestedSmallGroups,
  buildWatchPracticeList,
  hasDismissedSignal,
  rapidCorrectThresholdSeconds,
  sessionProductivitySignal,
  summarizeRapidCorrectness,
} from '../../src/platform/teacher/studentSupportSignals.js';

const NOW = Date.parse('2026-09-01T15:00:00.000Z');

const row = (overrides = {}) => ({
  id: 's1',
  name: 'Student One',
  isOnline: true,
  flags: [],
  severity: LIVE_SEVERITY.OK,
  idleMs: 0,
  counts: { answered: 6, accuracy: 100 },
  live: {
    assignmentId: 'a1',
    assignmentTitle: 'Lesson',
    startedAt: NOW - 20 * 60000,
    answeredCount: 6,
    accuracy: 100,
    rapidCorrectCount: 4,
    rapidDeepCorrectCount: 2,
    timedIndependentCorrectCount: 6,
    rapidCorrectShare: 4 / 6,
    focusLossCount: 0,
  },
  ...overrides,
});

const establishedOnLevel = (overrides = {}) => ({
  baseline: { established: true, events: 20 },
  instructionalBand: 'on',
  dokProfile: {
    1: { attempts: 8, accuracy: 0.9, confident: true },
    2: { attempts: 6, accuracy: 0.75, confident: true },
  },
  ...overrides,
});

test('rapid thresholds scale with cognitive demand instead of using one magic number', () => {
  assert.equal(rapidCorrectThresholdSeconds({ dok: 1, difficultyBand: 1, type: 'multipleChoice' }), 5);
  assert.equal(rapidCorrectThresholdSeconds({ dok: 2, difficultyBand: 3, type: 'response' }), 8);
  assert.equal(rapidCorrectThresholdSeconds({ dok: 3, difficultyBand: 4, type: 'functionGraph' }), 12);
});

test('rapid-correct summary counts only timed independent correct work', () => {
  const questions = [
    { dok: 1, difficultyBand: 1, type: 'multipleChoice' },
    { dok: 2, difficultyBand: 3, type: 'response' },
    { dok: 3, difficultyBand: 4, type: 'functionGraph' },
    { dok: 2, difficultyBand: 3, type: 'response' },
  ];
  const tracker = {
    0: { status: 'correct', timeSpent: 4, supportUsage: { isMathematicallyIndependent: true } },
    1: { status: 'correct', timeSpent: 7, supportUsage: { isMathematicallyIndependent: true } },
    2: { status: 'correct', timeSpent: 10, supportUsage: { isMathematicallyIndependent: true } },
    3: { status: 'correct', timeSpent: 3, supportUsage: { teacherAssisted: true, isMathematicallyIndependent: false } },
  };
  const summary = summarizeRapidCorrectness({ questions, tracker });
  assert.equal(summary.answered, 4);
  assert.equal(summary.correct, 4);
  assert.equal(summary.timedIndependentCorrect, 3);
  assert.equal(summary.rapidCorrect, 3);
  assert.equal(summary.rapidDeepCorrect, 2);
});

test('speed alone does not create an integrity review from an ordinary short pattern', () => {
  const signal = buildIntegrityReviewSignal({
    row: row(),
    profile: establishedOnLevel(),
  });
  assert.equal(signal, null);
});

test('a thin sample never creates an integrity review', () => {
  const signal = buildIntegrityReviewSignal({
    row: row({
      counts: { answered: 4, accuracy: 100 },
      live: {
        ...row().live,
        answeredCount: 4,
        rapidCorrectCount: 4,
        rapidDeepCorrectCount: 3,
        timedIndependentCorrectCount: 4,
        focusLossCount: 5,
      },
    }),
    profile: establishedOnLevel(),
  });
  assert.equal(signal, null);
});

test('rapid higher-demand work plus repeated focus loss produces review, not a cheating verdict', () => {
  const signal = buildIntegrityReviewSignal({
    row: row({ live: { ...row().live, focusLossCount: 4 } }),
    profile: establishedOnLevel(),
  });
  assert.ok(signal);
  assert.equal(signal.kind, SUPPORT_EVENT_KIND.INTEGRITY_REVIEW);
  assert.match(signal.label, /review/i);
  assert.doesNotMatch(JSON.stringify(signal), /cheat/i);
  assert.ok(signal.reasons.some((reason) => /focus-loss/i.test(reason)));
});

test('rapid pattern may be corroborated by a large mismatch with established performance', () => {
  const profile = establishedOnLevel({
    instructionalBand: 'below',
    dokProfile: {
      1: { attempts: 8, accuracy: 0.65, confident: true },
      2: { attempts: 8, accuracy: 0.3, confident: true },
    },
  });
  const signal = buildIntegrityReviewSignal({ row: row(), profile });
  assert.ok(signal);
  assert.equal(signal.evidence.profileMismatch, true);
});

test('an extreme repeated pattern can reach review without focus telemetry but still is not a verdict', () => {
  const signal = buildIntegrityReviewSignal({
    row: row({
      counts: { answered: 8, accuracy: 100 },
      live: {
        ...row().live,
        answeredCount: 8,
        rapidCorrectCount: 6,
        rapidDeepCorrectCount: 3,
        timedIndependentCorrectCount: 8,
        focusLossCount: 0,
      },
    }),
    profile: establishedOnLevel(),
  });
  assert.ok(signal);
  assert.equal(signal.confidence, 'strong-review-signal');
});

test('archived sessions preserve only an extreme pattern for later Integrity Review', () => {
  assert.equal(buildArchivedIntegrityReviewSignal({
    answered: 6,
    accuracy: 100,
    rapidCorrectCount: 4,
    rapidDeepCorrectCount: 2,
    timedIndependentCorrectCount: 6,
  }), null, 'ordinary fast work is too weak without live corroboration');

  const signal = buildArchivedIntegrityReviewSignal({
    answered: 8,
    accuracy: 100,
    rapidCorrectCount: 7,
    rapidDeepCorrectCount: 4,
    timedIndependentCorrectCount: 8,
    focusLossCount: 0,
  });
  assert.ok(signal);
  assert.equal(signal.confidence, 'strong-review-signal');
  assert.equal(signal.evidence.archivedSession, true);
  assert.doesNotMatch(JSON.stringify(signal), /cheat/i);
});

test('productivity telemetry stays silent for short sessions and legitimate active work', () => {
  assert.equal(sessionProductivitySignal({
    startedAt: NOW - 8 * 60000,
    endedAt: NOW,
    activeSeconds: 60,
    answered: 0,
    focusLossCount: 5,
    activityRole: 'practice',
  }), null, 'less than ten minutes is too thin');

  assert.equal(sessionProductivitySignal({
    startedAt: NOW - 30 * 60000,
    endedAt: NOW,
    activeSeconds: 20 * 60,
    answered: 2,
    focusLossCount: 4,
    activityRole: 'practice',
  }), null, 'healthy active time does not become an off-task signal');
});

test('low activity needs corroborating low progress or repeated focus loss', () => {
  const signal = sessionProductivitySignal({
    assignmentId: 'a1',
    startedAt: NOW - 30 * 60000,
    endedAt: NOW,
    activeSeconds: 8 * 60,
    answered: 1,
    focusLossCount: 0,
    activityRole: 'practice',
  });
  assert.ok(signal);
  assert.equal(signal.kind, 'productivityReview');

  assert.equal(sessionProductivitySignal({
    startedAt: NOW - 30 * 60000,
    endedAt: NOW,
    activeSeconds: 8 * 60,
    answered: 8,
    focusLossCount: 0,
    activityRole: 'practice',
  }), null, 'low mouse/keyboard activity with real progress can be paper work or reading');
});

test('platform session telemetry alone can never place a student on Parent Follow-Up', () => {
  const sessions = [
    {
      studentId: 's1', studentName: 'Student One', assignmentId: 'a1',
      startedAt: NOW - 2 * 86400000 - 30 * 60000, endedAt: NOW - 2 * 86400000,
      activeSeconds: 5 * 60, answered: 1, focusLossCount: 4, activityRole: 'practice',
    },
    {
      studentId: 's1', studentName: 'Student One', assignmentId: 'a2',
      startedAt: NOW - 86400000 - 30 * 60000, endedAt: NOW - 86400000,
      activeSeconds: 5 * 60, answered: 1, focusLossCount: 4, activityRole: 'practice',
    },
  ];
  assert.deepEqual(buildParentFollowUpCandidates({
    sessionSummaries: sessions,
    nowValue: NOW,
  }), []);
});

test('one teacher-confirmed productivity concern plus independent corroboration can suggest Parent Follow-Up', () => {
  const supportEvents = [{
    kind: SUPPORT_EVENT_KIND.OFF_TASK_CONCERN,
    stage: SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED,
    studentId: 's1',
    studentName: 'Student One',
    createdAt: '2026-08-31T15:00:00.000Z',
  }];
  const sessions = [{
    studentId: 's1', studentName: 'Student One', assignmentId: 'a1',
    startedAt: NOW - 30 * 60000, endedAt: NOW,
    activeSeconds: 5 * 60, answered: 1, focusLossCount: 4, activityRole: 'practice',
  }];
  const candidates = buildParentFollowUpCandidates({
    supportEvents,
    sessionSummaries: sessions,
    nowValue: NOW,
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].studentId, 's1');
});

test('a recent completed parent contact suppresses another suggestion', () => {
  const supportEvents = [
    {
      kind: SUPPORT_EVENT_KIND.OFF_TASK_CONCERN,
      stage: SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED,
      studentId: 's1',
      studentName: 'Student One',
      createdAt: '2026-08-30T15:00:00.000Z',
    },
    {
      kind: SUPPORT_EVENT_KIND.OFF_TASK_CONCERN,
      stage: SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED,
      studentId: 's1',
      studentName: 'Student One',
      createdAt: '2026-08-31T15:00:00.000Z',
    },
    {
      kind: SUPPORT_EVENT_KIND.PARENT_FOLLOW_UP,
      stage: SUPPORT_EVENT_STAGE.ACTION_TAKEN,
      studentId: 's1',
      studentName: 'Student One',
      createdAt: '2026-09-01T14:00:00.000Z',
    },
  ];
  assert.deepEqual(buildParentFollowUpCandidates({ supportEvents, nowValue: NOW }), []);
});

test('small groups are academic-only and require at least two students in a shared pattern', () => {
  const groups = buildSuggestedSmallGroups({
    needsAttention: [
      {
        id: 'class:reasoning',
        kind: 'academic',
        rule: 'reasoningGap',
        classId: 'c1',
        students: [
          { studentId: 's1', studentName: 'One' },
          { studentId: 's2', studentName: 'Two' },
          { studentId: 's3', studentName: 'Three' },
        ],
        headline: 'Reasoning',
      },
      {
        id: 'completion:s4',
        kind: 'completion',
        rule: 'weeklyPathBehind',
        classId: 'c1',
        studentId: 's4',
        studentName: 'Four',
      },
      {
        id: 'academic:s5',
        kind: 'academic',
        rule: 'belowLevel',
        classId: 'c1',
        studentId: 's5',
        studentName: 'Five',
      },
    ],
  });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].rule, 'reasoningGap');
  assert.equal(groups[0].students.length, 3);
});

test('Watch Practice is short and prioritizes students with active classroom need', () => {
  const rows = Array.from({ length: 9 }, (_, index) => ({
    id: `s${index}`,
    name: `Student ${index}`,
    isOnline: true,
    flags: index < 4 ? [LIVE_FLAGS.STUCK] : [LIVE_FLAGS.BEHIND_PACE],
    severity: index < 4 ? LIVE_SEVERITY.WATCH : LIVE_SEVERITY.ALERT,
    counts: { answered: 3, accuracy: 70 },
    live: { assignmentId: 'a1', currentAttempts: index < 4 ? 3 : 1 },
  }));
  const watch = buildWatchPracticeList({ rows, maxStudents: 6 });
  assert.equal(watch.length, 6);
  assert.ok(watch.slice(0, 4).every((entry) => entry.reasons.includes('repeated attempts')));
});


test('teacher-added Parent Follow-Up appears immediately without pretending telemetry caused it', () => {
  const candidates = buildParentFollowUpCandidates({
    supportEvents: [{
      kind: SUPPORT_EVENT_KIND.PARENT_FOLLOW_UP,
      stage: SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED,
      studentId: 's1',
      studentName: 'Student One',
      createdAt: '2026-09-01T14:30:00.000Z',
    }],
    nowValue: NOW,
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].manualParentFollowUp, true);
});

test('resolved Watch Practice does not keep pinning the student for seven days', () => {
  const supportEvents = [
    {
      kind: SUPPORT_EVENT_KIND.WATCH_PRACTICE,
      stage: SUPPORT_EVENT_STAGE.ACTION_TAKEN,
      studentId: 's1',
      createdAt: '2026-09-01T14:00:00.000Z',
    },
    {
      kind: SUPPORT_EVENT_KIND.RESOLVED,
      stage: SUPPORT_EVENT_STAGE.RESOLVED,
      studentId: 's1',
      createdAt: '2026-09-01T14:10:00.000Z',
    },
  ];
  const neutral = row({ flags: [], severity: LIVE_SEVERITY.OK });
  const watch = buildWatchPracticeList({
    rows: [neutral],
    supportEvents,
    nowValue: NOW,
  });
  assert.deepEqual(watch, []);
});

test('a later Watch Practice action can intentionally put a resolved student back on the list', () => {
  const supportEvents = [
    {
      kind: SUPPORT_EVENT_KIND.RESOLVED,
      stage: SUPPORT_EVENT_STAGE.RESOLVED,
      studentId: 's1',
      createdAt: '2026-09-01T14:00:00.000Z',
    },
    {
      kind: SUPPORT_EVENT_KIND.WATCH_PRACTICE,
      stage: SUPPORT_EVENT_STAGE.ACTION_TAKEN,
      studentId: 's1',
      createdAt: '2026-09-01T14:10:00.000Z',
    },
  ];
  const neutral = row({ flags: [], severity: LIVE_SEVERITY.OK });
  const watch = buildWatchPracticeList({
    rows: [neutral],
    supportEvents,
    nowValue: NOW,
  });
  assert.equal(watch.length, 1);
  assert.ok(watch[0].reasons.includes('teacher watch-list'));
});

test('dismissed signals stay quiet for the same session but do not suppress a later session', () => {
  const events = [{
    kind: SUPPORT_EVENT_KIND.SIGNAL_DISMISSED,
    stage: SUPPORT_EVENT_STAGE.DISMISSED,
    studentId: 's1',
    assignmentId: 'a1',
    sessionKey: 'a1:1000',
    createdAt: '2026-09-01T14:00:00.000Z',
  }];
  assert.equal(hasDismissedSignal({
    supportEvents: events,
    studentId: 's1',
    assignmentId: 'a1',
    sessionKey: 'a1:1000',
  }), true);
  assert.equal(hasDismissedSignal({
    supportEvents: events,
    studentId: 's1',
    assignmentId: 'a1',
    sessionKey: 'a1:2000',
    afterMs: Date.parse('2026-09-01T14:30:00.000Z'),
  }), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLiveStatus, classifyLiveStudent, countQuestionStates, summarizeLiveClass,
  LIVE_FLAGS, LIVE_SEVERITY, IDLE_AFTER_MS, OFFLINE_AFTER_MS,
} from '../../src/livePresence.js';

const NOW = 1_700_000_000_000;
const student = (id, liveStatus) => ({ id, name: id, classPeriod: 'Period 1', liveStatus });
const live = (overrides = {}) => buildLiveStatus({
  assignmentId: 'a1', assignmentTitle: 'Lesson 1', questionCount: 10,
  nowValue: NOW, ...overrides,
});

test('question states compress a whole assignment into a few bytes', () => {
  const counts = countQuestionStates('ccxa..');
  assert.deepEqual(
    { ...counts },
    { correct: 2, incorrect: 1, attempted: 1, untouched: 2, answered: 3, accuracy: 67 },
  );
  assert.equal(countQuestionStates('').accuracy, null, 'no answers means no accuracy, not zero');
  assert.equal(countQuestionStates(null).untouched, 0);
});

test('a student with no live status reads as Not started', () => {
  const row = classifyLiveStudent(student('s1', null), { nowValue: NOW });
  assert.deepEqual(row.flags, [LIVE_FLAGS.NOT_STARTED]);
  assert.equal(row.severity, LIVE_SEVERITY.ALERT);
  assert.equal(row.isOnline, false);
});

test('a stale heartbeat reads as offline, not as idle', () => {
  const row = classifyLiveStudent(
    student('s1', live({ questionStates: 'ccc.......' })),
    { nowValue: NOW + OFFLINE_AFTER_MS + 1000 },
  );
  assert.ok(row.flags.includes(LIVE_FLAGS.OFFLINE));
  assert.ok(!row.flags.includes(LIVE_FLAGS.IDLE), 'offline supersedes idle — one signal, not two');
  assert.equal(row.headline, 'Offline');
});

test('a heartbeat with no interaction reads as idle', () => {
  // Still sending heartbeats, but has not touched anything.
  const at = NOW + IDLE_AFTER_MS + 60000;
  const row = classifyLiveStudent(
    student('s1', { ...live({ questionStates: 'c.........' }), updatedAt: at }),
    { nowValue: at },
  );
  assert.ok(row.flags.includes(LIVE_FLAGS.IDLE));
  assert.equal(row.severity, LIVE_SEVERITY.ALERT);
  assert.match(row.headline, /^Idle \d+ min$/);
});

test('classwide quiet suppresses individual idle alarms during likely teacher talk or paper work', () => {
  const roster = Array.from({ length: 6 }, (_, index) => student(`s${index}`, live({
    questionStates: 'c.........',
    lastInteractionAt: NOW - IDLE_AFTER_MS - 60000,
    nowValue: NOW,
  })));
  const { rows, classStats } = summarizeLiveClass(roster, { nowValue: NOW, assignmentId: 'a1' });
  assert.equal(classStats.idleShare, 1);
  assert.ok(rows.every((entry) => !entry.flags.includes(LIVE_FLAGS.IDLE)));
});

test('one quiet student is still flagged when the rest of the room is working', () => {
  const roster = [
    student('idle', live({
      questionStates: 'c.........',
      lastInteractionAt: NOW - IDLE_AFTER_MS - 60000,
      nowValue: NOW,
    })),
    ...['a', 'b', 'c', 'd', 'e'].map((id) => student(id, live({
      questionStates: 'cccc......',
      lastInteractionAt: NOW,
      nowValue: NOW,
    }))),
  ];
  const { rows, classStats } = summarizeLiveClass(roster, { nowValue: NOW, assignmentId: 'a1' });
  assert.ok(classStats.idleShare < 0.67);
  assert.ok(rows.find((entry) => entry.id === 'idle').flags.includes(LIVE_FLAGS.IDLE));
});

test('repeated attempts on one question flag as stuck', () => {
  const row = classifyLiveStudent(
    student('s1', live({ questionStates: 'cc........', currentAttempts: 3, questionIndex: 2 })),
    { nowValue: NOW },
  );
  assert.ok(row.flags.includes(LIVE_FLAGS.STUCK));
  assert.equal(row.headline, 'Stuck on Q3');
  assert.equal(row.severity, LIVE_SEVERITY.WATCH, 'stuck is amber — the student is working, not adrift');
});

test('behind pace is measured against this room, not a fixed number', () => {
  const roster = [
    student('fast1', live({ questionStates: 'cccccccc..' })),
    student('fast2', live({ questionStates: 'ccccccc...' })),
    student('fast3', live({ questionStates: 'cccccccc..' })),
    student('slow', live({ questionStates: 'cc........' })),
  ];
  const { rows, classStats } = summarizeLiveClass(roster, { nowValue: NOW, assignmentId: 'a1' });
  assert.equal(classStats.medianAnswered, 7.5);
  const slow = rows.find((row) => row.id === 'slow');
  assert.ok(slow.flags.includes(LIVE_FLAGS.BEHIND_PACE));
  assert.equal(rows[0].id, 'slow', 'the student who needs the teacher sorts first');
  assert.ok(rows.slice(1).every((row) => row.severity === LIVE_SEVERITY.OK));
});

test('a slow whole class flags nobody', () => {
  // Everyone is on question 2 because the teacher is still talking.
  const roster = ['a', 'b', 'c'].map((id) => student(id, live({ questionStates: 'c.........' })));
  const { rows } = summarizeLiveClass(roster, { nowValue: NOW, assignmentId: 'a1' });
  assert.ok(rows.every((row) => !row.flags.includes(LIVE_FLAGS.BEHIND_PACE)));
});

test('accuracy well below the class average flags as struggling', () => {
  const roster = [
    student('a', live({ questionStates: 'cccc......' })),
    student('b', live({ questionStates: 'cccc......' })),
    student('c', live({ questionStates: 'xxxc......' })),
  ];
  const { rows } = summarizeLiveClass(roster, { nowValue: NOW, assignmentId: 'a1' });
  const struggling = rows.find((row) => row.id === 'c');
  assert.ok(struggling.flags.includes(LIVE_FLAGS.STRUGGLING));
  assert.equal(struggling.headline, '25% correct');
});

test('one or two answers is not enough to call a student struggling', () => {
  const roster = [
    student('a', live({ questionStates: 'cccccc....' })),
    student('b', live({ questionStates: 'cccccc....' })),
    student('slowStarter', live({ questionStates: 'x.........' })),
  ];
  const { rows } = summarizeLiveClass(roster, { nowValue: NOW, assignmentId: 'a1' });
  const row = rows.find((r) => r.id === 'slowStarter');
  assert.ok(!row.flags.includes(LIVE_FLAGS.STRUGGLING), 'a single wrong answer is not evidence');
});

test('students on another assignment are excluded from the comparison', () => {
  const roster = [
    student('here1', live({ questionStates: 'cccc......' })),
    student('here2', live({ questionStates: 'ccc.......' })),
    student('elsewhere', live({ assignmentId: 'other', questionStates: 'cccccccccc' })),
  ];
  const { rows, classStats } = summarizeLiveClass(roster, { nowValue: NOW, assignmentId: 'a1' });
  assert.equal(rows.length, 2);
  assert.equal(classStats.activeCount, 2);
  assert.equal(classStats.medianAnswered, 3.5);
});

test('the summary counts what the teacher reads at a glance', () => {
  const roster = [
    student('ok', live({ questionStates: 'cccc......' })),
    student('missing', null),
    student('gone', { ...live({ questionStates: 'cc........' }), updatedAt: NOW - 10 * 60000 }),
  ];
  const { counts } = summarizeLiveClass(roster, { nowValue: NOW, assignmentId: 'a1' });
  assert.equal(counts.total, 3);
  assert.equal(counts.online, 1);
  assert.equal(counts.needsAttention, 2, 'not started and offline both need a look');
});

test('the payload carries only coarse monitoring telemetry and no student response text', () => {
  const payload = buildLiveStatus({
    assignmentId: 'a1', questionStates: 'cc', nowValue: NOW,
    questionLabel: 'Solve for x', representation: 'graph',
    focusLossCount: 3,
    rapidCorrectCount: 2,
    rapidDeepCorrectCount: 1,
    timedIndependentCorrectCount: 4,
    sessionActiveSeconds: 420,
  });
  const serialized = JSON.stringify(payload);
  assert.ok(serialized.length < 650, `payload should stay compact, was ${serialized.length} bytes`);
  assert.ok(!('response' in payload) && !('answers' in payload));
  assert.ok(!('url' in payload) && !('activeUrl' in payload) && !('keystrokes' in payload));
  assert.equal(payload.focusLossCount, 3);
  assert.equal(payload.rapidCorrectCount, 2);
  assert.equal(payload.sessionActiveSeconds, 420);
  assert.equal(payload.updatedAt, NOW);
});

test('hostile and missing input never throws', () => {
  for (const bad of [null, undefined, 42, 'x', [], {}, { liveStatus: 'nope' }]) {
    assert.doesNotThrow(() => classifyLiveStudent(bad, { nowValue: NOW }));
  }
  assert.doesNotThrow(() => summarizeLiveClass(null));
  assert.doesNotThrow(() => summarizeLiveClass('nope'));
  assert.doesNotThrow(() => buildLiveStatus());
  assert.deepEqual(summarizeLiveClass([]).rows, []);
});

test('pace is measured against students who are actually working', () => {
  // Three students left early with 1 answer each. If they counted, the median
  // would collapse and nobody still in the room would ever look behind.
  const goneAt = NOW - 10 * 60000;
  const roster = [
    ...['gone1', 'gone2', 'gone3'].map((id) => student(id, {
      ...live({ questionStates: 'c.........' }), updatedAt: goneAt,
    })),
    student('working1', live({ questionStates: 'cccccccc..' })),
    student('working2', live({ questionStates: 'ccccccc...' })),
    student('lagging', live({ questionStates: 'ccc.......' })),
  ];
  const { rows, classStats } = summarizeLiveClass(roster, { nowValue: NOW, assignmentId: 'a1' });
  assert.equal(classStats.activeCount, 3, 'only the three still working set the pace');
  assert.equal(classStats.medianAnswered, 7);
  assert.ok(rows.find((row) => row.id === 'lagging').flags.includes(LIVE_FLAGS.BEHIND_PACE));
});

test('encodeQuestionStates mirrors the attempt-policy statuses', async () => {
  const { encodeQuestionStates } = await import('../../src/livePresence.js');
  const tracker = {
    0: { status: 'correct' },
    1: { status: 'attempted' },
    2: { status: 'expired' },
    4: { status: 'unattempted' },
  };
  assert.equal(encodeQuestionStates(tracker, [0, 1, 2, 3, 4]), 'cax..');
  assert.equal(encodeQuestionStates({ 0: 'correct' }, [0]), 'c', 'legacy string records still read');
  assert.equal(encodeQuestionStates(null, [0, 1]), '..');
  assert.equal(encodeQuestionStates({}, []), '');
});

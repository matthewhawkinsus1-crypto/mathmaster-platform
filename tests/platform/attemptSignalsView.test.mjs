// "WORTH A CONVERSATION": WHAT THE TEACHER READS, AND WHO READS IT
// (docs/platform/SHOWING_THE_PROCESS.md, section 7; build plan SP-2).
//
// A signal is shown to teachers only, in Live Classroom and in the student's
// results, as a fact with a dismiss: never a verdict, never on the projector,
// never on a student's screen.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  ATTEMPT_SIGNAL_TITLE, WORTH_A_CONVERSATION, WORTH_A_CONVERSATION_NOTE, describeAttemptSignal, openAttemptSignals,
} from '../../src/platform/teacher/attemptSignalsView.js';
import { ATTEMPT_SIGNAL_KINDS } from '../../src/platform/signals/attemptSignalFacts.js';
import { buildLiveStatus } from '../../src/livePresence.js';
import { chainTo, firstLoadGraph, repo } from './helpers/firstLoadGraph.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (file) => readFileSync(path.join(repo, file), 'utf8');

const SIGNALS = [
  { id: 'a-1__3__leftThenRight', kind: 'leftThenRight', assignmentId: 'a-1', questionIndex: 3, activityRole: 'classwork', partCount: 3, awaySeconds: 45, attemptNumber: 1, recordedAt: 3000 },
  { id: 'a-1__3__pasted__1', kind: 'pasted', assignmentId: 'a-1', questionIndex: 3, activityRole: 'classwork', partIndex: 1, attemptNumber: 2, recordedAt: 2000 },
  { id: 'a-2__0__hardFirstTry', kind: 'hardFirstTry', assignmentId: 'a-2', questionIndex: 0, activityRole: 'dol', partCount: 4, difficultyBand: 4, attemptNumber: 1, recordedAt: { seconds: 1 } },
];
const ASSIGNMENTS = new Map([['a-1', { id: 'a-1', title: 'Slope and intercept' }]]);

test('each signal reads as a title, its place and the facts recorded', () => {
  const [left, pasted, hard] = SIGNALS.map((signal) => describeAttemptSignal(signal, { assignmentsById: ASSIGNMENTS }));
  assert.equal(left.title, 'Left the page, then a burst of right parts');
  assert.equal(left.where, 'Slope and intercept · Classwork · Question 4');
  assert.match(left.facts, /hidden for about 45 seconds/);
  assert.match(left.facts, /3 parts were answered and marked right/);
  assert.equal(pasted.title, 'Pasted into a math box');
  assert.equal(pasted.where, 'Slope and intercept · Classwork · Question 4 · try 2');
  assert.match(pasted.facts, /part 2/);
  assert.match(pasted.facts, /What was pasted is not recorded/);
  assert.equal(hard.title, 'Right first time on a hard question, with no tool work');
  assert.equal(hard.where, 'DOL · Question 1', 'an assignment the caller does not have is left out, not guessed');
  assert.match(hard.facts, /All 4 parts were right on the first try/);
  assert.match(hard.facts, /difficulty band 4/);
  assert.match(describeAttemptSignal({ ...SIGNALS[0], awaySeconds: 600 }).facts, /about 10 minutes/);
  assert.match(describeAttemptSignal({ ...SIGNALS[2], partCount: 1 }).facts, /^The answer was right on the first try/);
});

test('a fact, never a verdict: no wording accuses the student', () => {
  const words = [
    WORTH_A_CONVERSATION, WORTH_A_CONVERSATION_NOTE, ...Object.values(ATTEMPT_SIGNAL_TITLE),
    ...SIGNALS.map((signal) => describeAttemptSignal(signal).facts),
  ].join(' ');
  assert.doesNotMatch(words, /cheat|dishonest|integrity|suspicious|copied|caught|violation|misconduct|\bAI\b/i);
  assert.equal(WORTH_A_CONVERSATION, 'Worth a conversation');
  assert.match(WORTH_A_CONVERSATION_NOTE, /never change a score, an attempt or mastery/);
  assert.deepEqual(Object.keys(ATTEMPT_SIGNAL_TITLE).sort(), [...ATTEMPT_SIGNAL_KINDS].sort(), 'every kind has a title');
});

test('the open list: newest first, one assignment when asked, dismissed and unknown records left out', () => {
  const withOthers = [
    ...SIGNALS,
    { id: 'a-1__5__pasted__0', kind: 'pasted', assignmentId: 'a-1', questionIndex: 5, partIndex: 0, attemptNumber: 1, recordedAt: 9000, dismissedAt: 9500, dismissedByEmail: 'teacher.a@example.test' },
    { id: 'a-1__6__keystrokes', kind: 'keystrokes', assignmentId: 'a-1', questionIndex: 6, recordedAt: 9900 },
    null,
  ];
  assert.deepEqual(openAttemptSignals(withOthers).map((entry) => entry.id), ['a-1__3__leftThenRight', 'a-1__3__pasted__1', 'a-2__0__hardFirstTry']);
  assert.deepEqual(openAttemptSignals(withOthers, { assignmentId: 'a-2' }).map((entry) => entry.id), ['a-2__0__hardFirstTry']);
  assert.deepEqual(openAttemptSignals(null), []);
  assert.equal(describeAttemptSignal({ kind: 'keystrokes' }), null);
});

test('the heartbeat carries the count of signals, never a signal', () => {
  assert.equal(buildLiveStatus({ assignmentId: 'a-1', attemptSignalCount: 3 }).attemptSignalCount, 3);
  assert.equal(buildLiveStatus({ assignmentId: 'a-1' }).attemptSignalCount, 0);
  assert.equal(buildLiveStatus({ assignmentId: 'a-1', attemptSignalCount: 'pasted y = 2x' }).attemptSignalCount, 0);
  assert.equal(buildLiveStatus({ assignmentId: 'a-1', attemptSignalCount: 5000 }).attemptSignalCount, 999);
  assert.equal(buildLiveStatus({ assignmentId: 'a-1', attemptSignalCount: -4 }).attemptSignalCount, 0);
});

const panel = executableSource(read('src/components/teacher/WorthAConversation.jsx'));
const drawer = executableSource(read('src/components/teacher/StudentProfileDrawer.jsx'));
const monitor = executableSource(read('src/components/teacher/LiveClassMonitor.jsx'));

test('the panel lists the open signals, each with a Dismiss that records who dismissed it', () => {
  assert.match(panel, /watchAttemptSignals\(\{ db, studentId, assignmentId, onChange: setSignals \}\)/);
  assert.match(panel, /openAttemptSignals\(signals, \{ assignmentId, assignmentsById \}\)/);
  const dismiss = region(panel, 'const dismiss = async (signal) => {', '};', 'the dismiss handler');
  assert.match(dismiss, /dismissAttemptSignal\(\{ db, studentId, signalId: signal\.id, teacherEmail \}\)/);
  const store = executableSource(read('src/platform/teacher/attemptSignalsStore.js'));
  const write = region(store, 'export const dismissAttemptSignal', '};', 'dismissAttemptSignal');
  assert.match(write, /updateDoc\(doc\(db, 'grades', student, ATTEMPT_SIGNALS_SUBCOLLECTION, id\), \{\s*dismissedAt: serverTimestamp\(\),\s*dismissedByEmail: email,\s*\}\)/);
  // A dismiss is the only write a teacher's screen makes to a signal.
  assert.doesNotMatch(store, /\b(?:setDoc|addDoc|deleteDoc|writeBatch)\b/);
});

test("in the student's results: the drawer shows the panel to a signed-in teacher, beside fast-and-right", () => {
  const use = region(drawer, '<WorthAConversation', '/>', "the drawer's panel");
  assert.match(use, /studentId=\{studentId\}/);
  assert.match(use, /teacherEmail=\{teacherEmail\}/);
  assert.match(use, /fastAndRight=\{fastAndRight\}/);
  // Guarded by the teacher's email, as every teacher-only section here is.
  assert.match(drawer, /\{teacherEmail && studentId && \(\s*<WorthAConversation/);
  // Fast-and-right is today's rule, not a second one.
  assert.match(drawer, /const signal = buildArchivedIntegrityReviewSignal\(summary\);/);
});

test('in Live Classroom: on the tile of a student who has signals, and never on the projector', () => {
  const tile = region(monitor, 'function StudentTile({', 'function withClassworkStates', 'StudentTile');
  assert.match(
    tile,
    /\{showAttemptSignals && !roomMode && teacherEmail && live\?\.assignmentId && Number\(live\?\.attemptSignalCount\) > 0 && \(\s*<WorthAConversation\s+compact/,
    'the tile reads signals only for a student whose heartbeat says there are some, and not in the room view',
  );
  assert.match(region(tile, '<WorthAConversation', '/>', "the tile's panel"), /assignmentId=\{live\.assignmentId\}/);
  assert.match(tile, /showAttemptSignals = false,/, 'off unless the monitor turns it on');
  const tiles = region(monitor, '{visibleRows.map((row) => (', '))}', 'the tiles');
  assert.match(tiles, /showAttemptSignals=\{!projecting\}/);
});

test("no student's first load carries the teacher's side of the signals", () => {
  const graph = firstLoadGraph();
  for (const file of [
    'src/platform/teacher/attemptSignalsView.js',
    'src/platform/teacher/attemptSignalsStore.js',
    'src/components/teacher/WorthAConversation.jsx',
  ]) {
    const absolute = path.join(repo, file);
    assert.ok(!graph.has(absolute), `${file} is in a student's first load: ${graph.has(absolute) ? chainTo(graph, absolute) : ''}`);
  }
  // The student's side is there: the engine's hook and the one writer.
  assert.ok(graph.has(path.join(repo, 'src/platform/signals/attemptSignalWriter.js')));
});

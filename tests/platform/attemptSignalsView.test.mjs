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
  ATTEMPT_SIGNAL_TITLE, NOT_CONCLUSIVE, WORTH_A_CONVERSATION, WORTH_A_CONVERSATION_NOTE, describeAttemptSignal, describeAttemptSignals,
  openAttemptSignals, questionAttemptSignals, reviewedAttemptSignals,
} from '../../src/platform/teacher/attemptSignalsView.js';
import { ATTEMPT_SIGNAL_KINDS } from '../../src/platform/signals/attemptSignalFacts.js';
import { buildLiveStatus } from '../../src/livePresence.js';
import { chainTo, firstLoadGraph, repo, teacherFirstLoadGraph } from './helpers/firstLoadGraph.mjs';
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
  assert.match(left.facts, /hidden \(another tab or app, or the screen turned off\) for about 45 seconds/);
  assert.match(left.facts, /3 parts were answered and marked right/);
  assert.equal(pasted.title, 'Pasted into a math box');
  assert.equal(pasted.where, 'Slope and intercept · Classwork · Question 4 · try 2');
  assert.match(pasted.facts, /part 2/);
  assert.match(pasted.facts, /What was pasted is not recorded/);
  assert.equal(hard.title, 'Right first time on a hard question, with no tool work');
  assert.equal(hard.where, 'DOL · Question 1', 'an assignment the caller does not have is left out, not guessed');
  assert.match(hard.facts, /All 4 parts were right on the first try/);
  assert.match(hard.facts, /difficulty band 4/);
  assert.match(describeAttemptSignal({ ...SIGNALS[0], awaySeconds: 240 }).facts, /about 4 minutes/);
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

test('the list that needs attention: newest first, one assignment when asked, reviewed and unknown records left out', () => {
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

test('the panel lists the signals that need attention, each with Mark reviewed (who, when, an optional note)', () => {
  assert.match(panel, /watchAttemptSignals\(\{ db, studentId, assignmentId, onChange: setSignals, onError: \(\) => setReadFailed\(true\) \}\)/);
  // A read that was refused says so: it is never shown as "nothing is waiting".
  assert.match(panel, /\{readFailed \? \(\s*<p role="alert" data-attempt-signals-unavailable=""/);
  // The root administrator reads them too: the panel does not say "only you".
  assert.doesNotMatch(panel, /Only you see/);
  assert.match(panel, /Students never see them\./);
  assert.match(panel, /describeAttemptSignals\(signals, \{ assignmentId, assignmentsById, formatWhen: signalWhen \}\)/);
  const control = region(panel, 'export function ReviewSignalControl(', '\n}\n', 'the review control');
  assert.match(control, /reviewAttemptSignal\(\{ db, studentId, signalId: signal\.id, teacherEmail, note \}\)/);
  assert.match(control, /maxLength=\{REVIEW_NOTE_MAX\}/);
  assert.match(control, /aria-label=\{`Mark reviewed: \$\{named\}`\}/);
  // Nothing on a teacher's screen says "dismiss": a reviewed fact is kept.
  assert.doesNotMatch(panel, />\s*Dismiss|Dismiss:/);
  const store = executableSource(read('src/platform/teacher/attemptSignalsStore.js'));
  const write = region(store, 'export const reviewAttemptSignal', '};', 'reviewAttemptSignal');
  assert.match(write, /updateDoc\(doc\(db, 'grades', student, ATTEMPT_SIGNALS_SUBCOLLECTION, id\), \{\s*dismissedAt: serverTimestamp\(\),\s*dismissedByEmail: email,\s*\.\.\.\(words \? \{ reviewNote: words \} : \{\}\),\s*\}\)/);
  assert.match(write, /const words = clean\(note\)\.slice\(0, REVIEW_NOTE_MAX\);/);
  // The email goes as signed in: the rules compare it with the token's own.
  assert.doesNotMatch(write, /toLowerCase/);
  // Both reads are bounded.
  const watch = region(store, 'export const watchAttemptSignals', 'return onSnapshot(', 'watchAttemptSignals');
  assert.match(watch, /query\(signals, where\('assignmentId', '==', clean\(assignmentId\)\), limit\(ASSIGNMENT_SIGNAL_LIMIT\)\)/);
  assert.match(watch, /query\(signals, orderBy\('recordedAt', 'desc'\), limit\(STUDENT_SIGNAL_LIMIT\)\)/);
  assert.doesNotMatch(watch, /onSnapshot\(\s*signals\b/, 'the whole collection is never watched');
  // A review is the only write a teacher's screen makes to a signal, and nothing deletes one.
  assert.doesNotMatch(store, /\b(?:setDoc|addDoc|deleteDoc|writeBatch)\b/);
});

test('reviewed is not deleted: it leaves what needs attention and stays, with who, when and the note', () => {
  const stored = [
    ...SIGNALS,
    { id: 'a-1__5__pasted__0', kind: 'pasted', assignmentId: 'a-1', questionIndex: 5, partIndex: 0, attemptNumber: 1, recordedAt: 9000, dismissedAt: 9500, dismissedByEmail: 'teacher.a@example.test', reviewNote: 'Talked with her on Tuesday.' },
  ];
  assert.deepEqual(openAttemptSignals(stored).map((entry) => entry.id), ['a-1__3__leftThenRight', 'a-1__3__pasted__1', 'a-2__0__hardFirstTry']);
  const [kept] = reviewedAttemptSignals(stored);
  assert.equal(kept.id, 'a-1__5__pasted__0');
  assert.deepEqual([kept.reviewed, kept.reviewedBy, kept.reviewedAtMs, kept.reviewNote], [true, 'teacher.a@example.test', 9500, 'Talked with her on Tuesday.']);
  assert.equal(describeAttemptSignals(stored).length, 4, 'every signal is still in the record');
  // The drawer keeps them under "Reviewed"; the Live tile shows only what needs attention.
  assert.match(panel, /\{!readFailed && reviewed\.length > 0 && \(\s*<details data-reviewed-signals=""/);
  const compact = region(panel, 'if (compact) {', 'const count = open.length + fastAndRight.length;', 'the Live tile');
  assert.doesNotMatch(compact, /reviewed\.map|data-reviewed-signals/);
});

test('every place a signal is shown says it is not conclusive, with its time, class time and supports', () => {
  assert.equal(NOT_CONCLUSIVE, 'Not conclusive');
  assert.match(WORTH_A_CONVERSATION_NOTE, /not conclusive/);
  const described = describeAttemptSignal(
    { ...SIGNALS[1], duringClass: false, supports: ['extra-time', 'text-to-speech'] },
    { assignmentsById: ASSIGNMENTS, formatWhen: (ms) => `at ${ms}` },
  );
  assert.equal(described.notConclusive, 'Not conclusive');
  assert.equal(described.when, 'at 2000');
  assert.equal(described.classTime, "Outside the class's scheduled time");
  assert.match(described.supports, /^Supports in effect: /);
  assert.equal(described.partIndex, 1);
  assert.equal(describeAttemptSignal({ ...SIGNALS[0], duringClass: true, supports: [] }).classTime, "During the class's scheduled time");
  assert.equal(describeAttemptSignal({ ...SIGNALS[0], duringClass: true, supports: [] }).supports, 'No supports in effect');
  // Not recorded is said by silence, never guessed.
  assert.deepEqual([describeAttemptSignal(SIGNALS[0]).classTime, describeAttemptSignal(SIGNALS[0]).supports], ['', '']);
  // Nothing about where the student was beyond the class's scheduled time.
  assert.doesNotMatch(`${described.classTime} ${describeAttemptSignal({ ...SIGNALS[0], duringClass: true }).classTime}`, /home|school|location|device|phone/i);
  // One drawing of a signal's facts, with the label, for every teacher surface.
  const facts = region(panel, 'export function SignalFacts(', '\n}\n', 'SignalFacts');
  assert.match(facts, /<span data-not-conclusive="" style=\{tagStyle\}>\{NOT_CONCLUSIVE\}<\/span>/);
  assert.match(facts, /\[signal\.classTime, signal\.supports\]/);
  assert.match(panel, /<li key=\{signal\.id\} data-attempt-signal=\{signal\.kind\} style=\{cardStyle\}>\s*<SignalFacts signal=\{signal\} \/>/);
  const notes = executableSource(read('src/components/teacher/QuestionSignalNotes.jsx'));
  assert.match(notes, /<SignalFacts signal=\{/);
  const tab = executableSource(read('src/components/teacher/caseReview/CaseSignalsTab.jsx'));
  assert.match(tab, /data-not-conclusive=""/);
  assert.match(tab, /\(\{section\.notConclusive\.toLowerCase\(\)\}\)/);
});

test("in the assignment's results: a student's signals beside the question they belong to, from one shared read", async () => {
  // What happened, when, and in which part, in the order it happened.
  const stored = [
    { id: 'a-1__3__pasted__1', kind: 'pasted', assignmentId: 'a-1', questionIndex: 3, partIndex: 1, attemptNumber: 1, recordedAt: 2000 },
    { id: 'a-1__3__leftThenRight', kind: 'leftThenRight', assignmentId: 'a-1', questionIndex: 3, partCount: 2, awaySeconds: 20, attemptNumber: 1, recordedAt: 3000, dismissedAt: 4000, dismissedByEmail: 't@example.test' },
    { id: 'a-1__4__pasted__0', kind: 'pasted', assignmentId: 'a-1', questionIndex: 4, partIndex: 0, attemptNumber: 1, recordedAt: 2500 },
    { id: 'a-2__3__pasted__0', kind: 'pasted', assignmentId: 'a-2', questionIndex: 3, partIndex: 0, attemptNumber: 1, recordedAt: 2600 },
  ];
  const forQuestion = questionAttemptSignals(stored, { assignmentId: 'a-1', questionIndex: 3, formatWhen: (ms) => `at ${ms}` });
  assert.deepEqual(forQuestion.map((entry) => [entry.id, entry.when, entry.reviewed]), [['a-1__3__pasted__1', 'at 2000', false], ['a-1__3__leftThenRight', 'at 3000', true]]);
  assert.match(forQuestion[0].facts, /part 2/);
  assert.deepEqual(questionAttemptSignals(stored, { assignmentId: 'a-1', questionIndex: 9 }), []);
  // Drawn inside each question's card of the gradebook's student view, on demand.
  const workspace = executableSource(read('src/app/teacher/TeacherWorkspace.jsx'));
  assert.match(workspace, /<QuestionSignalNotes studentId=\{student\.id\} assignmentId=\{selectedAssignment\.id\} questionIndex=\{index\} teacherEmail=\{user\?\.role === 'teacher' \? user\.email \|\| '' : ''\} \/><\/article>/);
  const panels = executableSource(read('src/app/teacher/teacherPanels.js'));
  assert.match(panels, /^export const QuestionSignalNotes = drawnPanel\(\(\) => import\('\.\.\/\.\.\/components\/teacher\/QuestionSignalNotes\.jsx'\), ""\);$/m);
  const graph = teacherFirstLoadGraph();
  assert.ok(!graph.has(path.join(repo, 'src/components/teacher/QuestionSignalNotes.jsx')), "the notes are not in a teacher's first load");
  // A dozen notes on one screen share one watch, started by the first and stopped with the last.
  const notes = executableSource(read('src/components/teacher/QuestionSignalNotes.jsx'));
  assert.match(notes, /useSyncExternalStore\(source\.subscribe, source\.read, source\.read\)/);
  assert.match(notes, /if \(!studentId \|\| !assignmentId \|\| !signals\.length\) return null;/, 'nothing for a question with none');
  const store = executableSource(read('src/platform/teacher/attemptSignalsStore.js'));
  const shared = region(store, 'export const subscribeSharedAttemptSignals', '\n};\n', 'subscribeSharedAttemptSignals');
  assert.match(shared, /const first = !shared\.has\(key\);/);
  assert.match(shared, /const stop = first\s*\? watchAttemptSignals\(\{/, 'only the first reader opens the watch');
  assert.match(shared, /if \(entry\.listeners\.size\) return;\s*if \(stop\) stop\(\);\s*else entry\.stop\?\.\(\);/, 'whoever leaves last closes it');
  assert.match(shared, /onError: \(\) => publish\(\{ signals: \[\], failed: true, loaded: true \}\)/);
});

test("in the student's results: the drawer shows the panel to a signed-in teacher, beside fast-and-right", () => {
  const use = region(drawer, '<WorthAConversation', '/>', "the drawer's panel");
  assert.match(use, /studentId=\{studentId\}/);
  assert.match(use, /teacherEmail=\{teacherEmail\}/);
  assert.match(use, /fastAndRight=\{fastAndRight\}/);
  // Guarded by the teacher's email, as every teacher-only section here is.
  assert.match(drawer, /\{teacherEmail && studentId && !roomProjected && \(\s*<WorthAConversation/);
  // Opened over projected tiles, the drawer withholds it and says so.
  assert.match(drawer, /\{teacherEmail && studentId && roomProjected && \(\s*<p data-worth-a-conversation-withheld=""/);
  assert.match(drawer, /const roomProjected = useSyncExternalStore\(subscribeRoomProjected, isRoomProjected, isRoomProjected\);/);
  // Home says when its tiles are projected, and that it has left the screen.
  const home = executableSource(read('src/TeacherHome.jsx'));
  assert.match(region(home, '<LiveClassMonitor', '/>', "Home's monitor"), /onProjectingChange=\{reportRoomProjected\}/);
  assert.match(region(home, 'const reportRoomProjected = useCallback(', '}, []);', 'reportRoomProjected'), /shareRoomProjected\(projected\);/);
  assert.match(home, /useEffect\(\(\) => \(\) => shareRoomProjected\(false\), \[\]\);/);
  // Fast-and-right is today's rule, not a second one.
  assert.match(drawer, /const signal = buildArchivedIntegrityReviewSignal\(summary\);/);
});

test('in Live Classroom: on the tile of a student who has signals, and never on the projector', () => {
  const tile = region(monitor, 'function StudentTile({', 'function withClassworkStates', 'StudentTile');
  assert.match(
    tile,
    /\{showAttemptSignals && !roomMode && teacherEmail && live\?\.assignmentId && Number\(live\?\.attemptSignalCount\) > 0 && \(\s*<WorthAConversationTile\s+compact/,
    'the tile reads signals only for a student whose heartbeat says there are some, and not in the room view',
  );
  assert.match(region(tile, '<WorthAConversationTile', '/>', "the tile's panel"), /assignmentId=\{live\.assignmentId\}/);
  // The tile's panel is the same component, fetched when a tile first draws it.
  const panels = executableSource(read('src/app/teacher/teacherPanels.js'));
  assert.match(panels, /^export const WorthAConversationTile = drawnPanel\(\(\) => import\('\.\.\/\.\.\/components\/teacher\/WorthAConversation\.jsx'\), "This device is offline\. Worth a conversation shows when it is back online\."\);$/m);
  assert.match(tile, /showAttemptSignals = false,/, 'off unless the monitor turns it on');
  const tiles = region(monitor, '{visibleRows.map((row) => (', '))}', 'the tiles');
  assert.match(tiles, /showAttemptSignals=\{!projecting\}/);
});

test("the panel is not in a teacher's first load either: Home draws before any tile needs it", () => {
  const graph = teacherFirstLoadGraph();
  assert.ok(graph.size > 200, `only ${graph.size} modules reached`);
  const absolute = path.join(repo, 'src/components/teacher/WorthAConversation.jsx');
  assert.ok(!graph.has(absolute), `WorthAConversation.jsx is in a teacher's first load: ${graph.has(absolute) ? chainTo(graph, absolute) : ''}`);
  // And it is fetched while the browser is idle, so the first tile draws at once.
  const prefetch = executableSource(read('src/app/teacher/teacherPanelPrefetch.js'));
  assert.match(region(prefetch, 'export const TEACHER_PANEL_PREFETCH = Object.freeze([', ']);', 'the prefetch list'), /\bWorthAConversationTile\b/);
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
  // Of the student's side, only the few lines App needs at once are there;
  // the recorder arrives with the question engine.
  assert.ok(graph.has(path.join(repo, 'src/platform/signals/signalPageNotes.js')));
  for (const file of ['src/platform/signals/attemptSignalWriter.js', 'src/platform/signals/attemptSignalFacts.js', 'src/platform/signals/useAttemptSignals.js']) {
    const absolute = path.join(repo, file);
    assert.ok(!graph.has(absolute), `${file} is in a student's first load: ${graph.has(absolute) ? chainTo(graph, absolute) : ''}`);
  }
});

test('the page holds one answer to "are the tiles projected?", and tells whoever is listening when it changes', async () => {
  const { isRoomProjected, setRoomProjected, subscribeRoomProjected } = await import('../../src/platform/teacher/roomProjection.js');
  let told = 0;
  const stop = subscribeRoomProjected(() => { told += 1; });
  assert.equal(isRoomProjected(), false);
  setRoomProjected(true);
  assert.equal(isRoomProjected(), true);
  setRoomProjected(true);
  assert.equal(told, 1, 'told once per change');
  setRoomProjected(false);
  assert.equal(isRoomProjected(), false);
  stop();
  setRoomProjected(true);
  assert.equal(told, 2, 'not after it stops listening');
  setRoomProjected(false);
});

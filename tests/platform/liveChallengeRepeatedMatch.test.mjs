import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

import { acceptChallengeSnapshot } from '../../functions/shared/liveChallengeParity.mjs';
import { publicLeaderboard } from '../../functions/shared/liveChallenge.mjs';
import { leaderboardOptionsFor } from '../../functions/shared/liveChallengeScoring.mjs';
import { region } from './helpers/sourceContract.mjs';

/*
 * THE SECOND AND THIRD GAME OF A CLASS PERIOD.
 *
 * A student's screen used to keep the first game. The student component was
 * not keyed by room and only reset its room when the invite disappeared, and
 * the snapshot guard compared round numbers without asking which room they
 * belonged to — so room A, finished on round 9, rejected room B's lobby
 * snapshot (round -1) as "older". The student sat on A's "Challenge complete"
 * screen over B's zeroed players, and never auto-joined B because the room it
 * believed in had finished.
 *
 * These tests hold the pieces that make a repeated match start clean.
 */

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const student = read('src/components/liveChallenge/LiveChallengeStudent.jsx');
const teacher = read('src/components/liveChallenge/LiveChallengeTeacher.jsx');
const consoleParts = read('src/components/liveChallenge/ChallengeHostConsole.jsx');
const projector = read('src/components/liveChallenge/LiveChallengeArenaProjector.jsx');
const app = read('src/App.jsx');
const gate = read('src/components/liveChallenge/WarmupChallengeGate.jsx');
const dryRun = read('src/components/liveChallenge/ChallengeDryRun.jsx');

const loadFresh = (relative) => import(`${pathToFileURL(path.resolve(relative)).href}?test=${Date.now()}-${Math.random()}`);

/* ---------- a new room is a new game ---------- */

test('a snapshot of a different room replaces the finished one, whatever its round', () => {
  const finishedA = { roomId: 'room-a', status: 'finished', currentRound: 9, roundVersion: 10, phase: 'finished' };
  const lobbyB = { roomId: 'room-b', status: 'lobby', currentRound: -1, roundVersion: 0, phase: 'lobby' };
  assert.equal(acceptChallengeSnapshot(finishedA, lobbyB), lobbyB);
  // Within one room the round order still protects against a stale snapshot.
  const staleA = { ...finishedA, status: 'running', currentRound: 8, roundVersion: 9, phase: 'answering' };
  assert.equal(acceptChallengeSnapshot(finishedA, staleA), finishedA);
});

test('every student game screen is mounted once per room', () => {
  const dashboard = region(app, '<LiveChallengeStudent', '/>', 'dashboard Live Challenge');
  assert.match(dashboard, /key=\{liveChallengeInvite\?\.roomId \|\| 'no-live-challenge'\}/);
  const warmup = region(gate, '<LiveChallengeStudent', '/>', 'Warm-Up Live Challenge');
  assert.match(warmup, /key=\{decision\.roomId\}/);
});

test('the student screen starts each room from nothing, even without a remount', () => {
  const listener = region(student, 'useEffect(() => {\n    // A different room is a different game.', '}, [roomId]);', 'student room listener');
  const reset = listener.indexOf('setRoom(null);');
  const subscribe = listener.indexOf('watchLiveChallengeRoom(roomId');
  assert.ok(reset > -1 && subscribe > reset, 'the old room is dropped before the new one is watched');
  assert.match(listener, /setError\(''\);/, 'an error about the last room is not shown in this one');
});

/* ---------- the listener is not torn down by the clock ---------- */

test('clock calibration never re-subscribes the room listener', () => {
  // The listener used to depend on clock.offsetMs, so every 30-second
  // calibration closed and re-opened it — a fresh snapshot read per student
  // per half minute, and a window where a round change could be missed.
  const listener = region(student, 'useEffect(() => {\n    // A different room is a different game.', '\n  useEffect(', 'student room listener');
  assert.match(listener, /\}, \[roomId\]\);/);
  assert.doesNotMatch(listener, /clock\.offsetMs/);
  assert.match(listener, /Date\.now\(\) \+ clockOffsetRef\.current/);
  assert.match(student, /clockOffsetRef\.current = clock\.offsetMs;/);
});

test('a refused join is not retried on every snapshot', () => {
  // The guard line may hold more than one reason to skip (a join that already
  // succeeded is one); what matters is that a refusal is among them.
  const join = region(student, 'if (joinRefusedForRef.current === roomId', '}, [roomId, room,', 'automatic join');
  assert.match(join, /^if \(joinRefusedForRef\.current === roomId[^\n]*\) return;/);
  assert.match(join, /permission-denied\|failed-precondition\|not-found\|invalid-argument/);
  assert.match(join, /joinRefusedForRef\.current = roomId;/);
  const guard = region(student, 'useEffect(() => {\n    if (!roomId || joining || !room', 'joinLiveChallenge(', 'join guard');
  assert.match(guard, /room\.roomId !== roomId/, 'never join on the strength of another room\'s snapshot');
  assert.ok(guard.indexOf('joinRefusedForRef.current === roomId') > -1);
});

/* ---------- a refresh after answering ---------- */

test('a refresh after answering keeps the round locked', () => {
  // `result` lived only in memory, so a refresh reopened the question; a second
  // answer was then refused by the server and shown as an error.
  const round = region(student, 'export function ChallengeRound(', 'export default function LiveChallengeStudent', 'ChallengeRound');
  assert.match(round, /const answeredOnServer = Number\(currentSelf\?\.answeredRound\) === roundIndex;/);
  assert.match(round, /const locked = answerRecorded \|\| Boolean\(pending\);/);
  assert.match(round, /const answerRecorded = Boolean\(result\) \|\| answeredOnServer \|\| alreadyRecorded;/);
  assert.match(round, /assignmentLocked=\{locked \|\| expired \|\| !roundStarted\}/);
  assert.match(round, /<LiveChallengeFieldQuestion question=\{question\} disabled=\{locked \|\| expired \|\| !roundStarted\}/);
  const submit = region(round, 'const submit = async', 'const retryPending', 'submit');
  assert.match(
    submit,
    /const submit = async[^\n]*\n\s*if \(resultRef\.current \|\| pendingRef\.current \|\| submissionLockRef\.current \|\| answeredOnServerRef\.current \|\|/,
    'a recorded round never sends another answer',
  );
  // Nor does the buzzer, which finalizes work through the same submit.
  assert.match(submit, /if \(!transitionedToExpired \|\| !secureQuestion \|\| resultRef\.current \|\| pendingRef\.current \|\| answeredOnServerRef\.current \|\|/);
  assert.match(submit, /\/already-exists\/\.test\(String\(error\?\.code \|\| ''\)\)\) settleAsAlreadyRecorded\(\);/);
  const retry = region(round, 'const retryPending', 'useEffect(', 'retry');
  assert.match(retry, /if \(\/already-exists\/\.test\(code\)\) settleAsAlreadyRecorded\(\);/);
  const recorded = region(round, 'const settleAsAlreadyRecorded = () => {', '};', 'already recorded');
  assert.match(recorded, /window\.localStorage\.removeItem\(pendingKey\);/);
  assert.doesNotMatch(recorded, /setSubmitError/, 'a recorded answer is information, not an error');
});

test('the server\'s answer survives a refresh in a live room, never in a rehearsal', () => {
  const round = region(student, 'export function ChallengeRound(', 'export default function LiveChallengeStudent', 'ChallengeRound');
  assert.match(round, /const resultKey = persistResult \? challengeResultKey\(room\.roomId, roundIndex, room\.roundVersion\) : null;/);
  assert.match(round, /const \[result, setResult\] = useState\(\(\) => readStoredJson\(resultKey\)\);/);
  const settle = region(round, 'const settle = (grading) => {', '};', 'settle');
  assert.match(settle, /writeStoredJson\(resultKey, grading\);/);
  // The live screen opts in; the dry run (which can revisit a round) does not.
  const live = region(student, '<ChallengeRound\n            key=', '/>', 'live round');
  assert.match(live, /\n\s*persistResult\n/);
  const rehearsal = region(dryRun, '<ChallengeRound', '/>', 'dry-run round');
  assert.doesNotMatch(rehearsal, /persistResult/);
  // Kept results are cleared once their round is no longer on screen.
  const cleanup = region(student, 'const currentResult = challengeResultKey(', '}, [roomId, activeRound, room?.roundVersion]);', 'result cleanup');
  assert.match(cleanup, /key\?\.startsWith\('live-challenge-result-'\) && key !== currentResult/);
});

test('a round the host closed locks the question without firing the buzzer', () => {
  const round = region(student, 'export function ChallengeRound(', 'export default function LiveChallengeStudent', 'ChallengeRound');
  assert.match(round, /const roundClosed = room\.roundState === 'closed';\s*const expired = roundClosed \|\| \(endsAtMs > 0 && remainingMs <= 0\);/);
  const buzzer = region(round, 'const transitionedToExpired', 'const retryPending', 'buzzer');
  assert.match(buzzer, /if \(roundClosed\) return;/);
  assert.ok(buzzer.indexOf('if (roundClosed) return;') < buzzer.indexOf('void submit('), 'checked before anything is sent');
});

/* ---------- the board ranks the way the room scores ---------- */

test('student and teacher boards rank by the room\'s scoring strategy', () => {
  for (const [name, source] of [['student', student], ['teacher', teacher]]) {
    assert.match(
      source,
      /publicLeaderboard\(players, \{ activeRound, \.\.\.leaderboardOptionsFor\(scoringStrategyId\) \}\)/,
      `${name} board must use the room's ranking`,
    );
    assert.match(source, /const scoringStrategyId = room\?\.scoringStrategyId \|\| null;/);
  }
  // A Grand Prix board ranks championship points, not raw round score.
  const players = [
    { playerKey: 'a', alias: 'A', score: 12, matchPoints: 12, roundWins: 0, rawScore: 3000 },
    { playerKey: 'b', alias: 'B', score: 15, matchPoints: 15, roundWins: 1, rawScore: 1200 },
  ];
  const board = publicLeaderboard(players, { activeRound: 1, ...leaderboardOptionsFor('grandPrix') });
  assert.deepEqual(board.map((row) => row.playerKey), ['b', 'a']);
  assert.equal(board[0].provisionalPoints, 0, 'placement scoring never adds in-round provisional points');
});

/* ---------- one command at a time from the teacher ---------- */

test('the teacher sends one lifecycle command at a time', () => {
  // End Session used to stay enabled while Next Round (which can finish the
  // game) was in flight, because each button watched only its own busy key.
  const control = region(teacher, 'const control = async (key, action) => {', '\n  };', 'control');
  assert.match(control, /if \(controlLockRef\.current\) return null;\s*controlLockRef\.current = true;/);
  assert.match(control, /finally \{ controlLockRef\.current = false; \}/);
  assert.match(teacher, /const controlBusy = LIFECYCLE_CONTROLS\.includes\(busy\);/);
  // Every control that can send one is disabled while ANY is in flight: the
  // console's primary and secondary controls (HostControlBar), the header's
  // Cancel Session and End Game, the confirmation's own button, and the
  // projector's strip.
  const bar = region(consoleParts, 'export function HostControlBar(', '\n}\n', 'console control bar');
  assert.match(bar, /data-mm-primary-action=\{action\.command\}\s*disabled=\{action\.disabled \|\| controlBusy/);
  assert.match(bar, /disabled=\{control\.disabled \|\| controlBusy\}/);
  const header = region(teacher, 'data-mm-host-console=', '</header>', 'console header');
  for (const label of ['Cancel Session', "'End Game'"]) {
    const line = header.split('\n').find((text) => text.includes(label));
    assert.ok(line, `${label} is on the console`);
    assert.match(line, /disabled=\{controlBusy\}/, `${label} must be disabled while any command is in flight`);
  }
  assert.match(region(teacher, 'const confirmDialog = (', '\n  );', 'confirmation'), /busy=\{controlBusy\}/);
  const strip = region(projector, 'function HostStrip(', '\nexport const formatArenaClock', 'projector strip');
  const lifecycleButtons = strip.split('\n').filter((text) => /<button/.test(text) && !/onNewChallenge\}/.test(text));
  assert.ok(lifecycleButtons.length >= 3);
  lifecycleButtons.forEach((text) => assert.match(text, /disabled=\{[^}]*controlBusy/, `projector control must respect the lock: ${text.trim().slice(0, 80)}`));
});

test('round commands carry the round the teacher saw', () => {
  const control = region(teacher, 'const control = async (key, action) => {', '\n  };', 'control');
  assert.match(control, /ROUND_SCOPED_CONTROLS\.includes\(key\) && room\?\.status === 'running'/);
  assert.match(control, /expectedRoundIndex: Number\(room\.currentRound\), expectedRoundVersion: Number\(room\.roundVersion\) \|\| 0/);
  assert.match(control, /action\(\{ roomId, \.\.\.expectation \}\)/);
  assert.match(teacher, /const ROUND_SCOPED_CONTROLS = Object\.freeze\(\['advance', 'close'\]\);/);
});

test('the lobby lists who is here without ranking anyone', async () => {
  // With honest ties every lobby player is "#1", which reads as nonsense; the
  // lobby has no order to show. The console lists the class by name, with
  // who has joined — never a rank or a score.
  const lobby = region(teacher, '{lobby && (', '{(roundOpen || stage === CHALLENGE_STAGE.ROUND_RESULTS) && (', 'teacher lobby');
  assert.match(lobby, /<HostRosterPanel roster=\{roster\}/);
  assert.doesNotMatch(lobby, /<StandingsBoard|<Leaderboard|\.rank\b/);
  const panel = region(consoleParts, 'export function HostRosterPanel(', '\nexport function NotJoinedLine', 'roster panel');
  assert.doesNotMatch(panel, /\.rank\b|\.score\b|place/);
  const { hostRoster } = await loadFresh('src/platform/liveChallenge/challengePresenceModel.js');
  const roster = hostRoster({
    roster: [{ playerKey: 'z', name: 'Zoe Park' }, { playerKey: 'a', name: 'Ana Ruiz' }, { playerKey: 'm', name: 'Mo Diaz' }],
    players: [{ playerKey: 'z', alias: 'Nova', joined: true, score: 900 }, { playerKey: 'a', alias: 'Atlas', joined: true, score: 10 }],
  });
  assert.deepEqual(roster.entries.map((entry) => entry.name), ['Ana Ruiz', 'Mo Diaz', 'Zoe Park'], 'by name, whatever the scores');
  assert.ok(roster.entries.every((entry) => !('rank' in entry) && !('score' in entry)));
  assert.deepEqual(roster.summary.notJoined, ['Mo Diaz']);
});

/* ---------- the projector and the podium ---------- */

test('tied players each take their own podium step and keep their shared rank', async () => {
  const { podiumRows, belowPodiumRows, projectorGameLabel } = await loadFresh('src/platform/liveChallenge/liveChallengeProjectorModel.js');
  const board = publicLeaderboard([
    { playerKey: 'p1', alias: 'Nova', score: 900 },
    { playerKey: 'p2', alias: 'Atlas', score: 900 },
    { playerKey: 'p3', alias: 'Comet', score: 900 },
    { playerKey: 'p4', alias: 'Delta', score: 900 },
    { playerKey: 'p5', alias: 'Echo', score: 100 },
  ]);
  const podium = podiumRows(board);
  const onPodium = [podium.first, podium.second, podium.third].map((row) => row.playerKey);
  assert.equal(new Set(onPodium).size, 3, 'nobody stands on two steps');
  assert.ok([podium.first, podium.second, podium.third].every((row) => row.rank === 1 && row.tied));
  // The fourth tied player is not dropped: they head the list below the podium.
  const below = belowPodiumRows(board);
  assert.deepEqual(below.map((row) => row.rank), [1, 5]);
  assert.equal(new Set([...onPodium, ...below.map((row) => row.playerKey)]).size, 5);

  // The game names itself through the mode registry.
  assert.equal(projectorGameLabel({ challengeMode: 'solverRace' }), 'Solver Race');
  assert.equal(projectorGameLabel({ challengeMode: 'standard' }), 'Live Challenge');
  assert.equal(projectorGameLabel({ challengeMode: 'no-such-mode' }), 'Live Challenge');
});

test('the podium labels each step by its player\'s rank, not by the step', () => {
  const arena = read('src/components/liveChallenge/LiveChallengeArenaProjector.jsx');
  const place = region(arena, 'function PodiumPlace(', '\nfunction FinalPodium(', 'podium place');
  assert.match(place, /const rank = Math\.max\(1, Math\.min\(3, Number\(row\.rank\) \|\| place\)\);/);
  assert.match(place, /const \{ medal, accent \} = PODIUM_RANKS\[rank\];/);
  assert.match(place, /row\.tied \? ' · Tied' : ''/);
  const finale = region(arena, 'function FinalPodium(', '\nfunction LobbyView(', 'final podium');
  assert.match(finale, /const remaining = belowPodiumRows\(leaderboard\)\.slice\(0, 9\);/);
});

/* ---------- host audio forgets the last game ---------- */

test('host audio treats a new room as a new game', async () => {
  const created = [];
  class FakeAudio {
    constructor(src) { this.src = src; this.volume = 0; created.push(this); }
    addEventListener() {}
    play() { return Promise.resolve(); }
    pause() {}
  }
  const { LiveChallengeAudioDirector } = await loadFresh('src/platform/liveChallenge/liveChallengeAudio.js');
  const director = new LiveChallengeAudioDirector({ AudioClass: FakeAudio, fetchImpl: async () => ({ ok: false }) });
  await director.prime();
  const roundStarts = () => created.filter((audio) => audio.src.endsWith('/round_start.wav')).length;

  director.sync({ room: { roomId: 'room-a', status: 'running', currentRound: 0, roundCount: 3, roundEndsAt: { seconds: 10 } }, remainingMs: 5000 });
  assert.equal(roundStarts(), 1);
  // The teacher's next game opens on round 1 too. Compared against the last
  // game's state it looked like "no change" and its first round went unannounced.
  director.sync({ room: { roomId: 'room-b', status: 'running', currentRound: 0, roundCount: 3, roundEndsAt: { seconds: 90 } }, remainingMs: 5000 });
  assert.equal(roundStarts(), 2, 'the new game\'s first round is announced');
  assert.equal(director.roomKey, 'room-b');
  director.dispose();
});

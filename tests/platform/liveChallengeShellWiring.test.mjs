import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { SHELL_CSS } from '../../src/components/liveChallenge/challengeShellCss.js';

/*
 * THE LIVE CHALLENGE SCREENS ARE WIRED TO THE SHELL.
 *
 * The shell's behaviour is tested as functions (liveChallengeShellModel,
 * liveChallengeStandingsModel, liveChallengePresenceReplay). Node cannot render
 * the .jsx screens, so what they must DO with those functions is held here,
 * each assertion bound to the region that does the work and broken once to
 * prove it can fail (see AGENTS.md and the source-contract playbook).
 */

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const student = read('src/components/liveChallenge/LiveChallengeStudent.jsx');
const teacher = read('src/components/liveChallenge/LiveChallengeTeacher.jsx');
const projector = read('src/components/liveChallenge/LiveChallengeArenaProjector.jsx');
const parts = read('src/components/liveChallenge/ChallengeShellParts.jsx');
const studentShell = read('src/components/liveChallenge/ChallengeStudentShell.jsx');
const rushRound = read('src/components/liveChallenge/GraphFeatureRushRound.jsx');
const studentMain = region(student, 'export default function LiveChallengeStudent(', null, 'student screen');

/* ------------------------------ a student's screen ------------------------------ */

test('a student\'s screen is a function of the match\'s stage, read at its calibrated server time', () => {
  assert.match(studentMain, /const stageClock = useChallengeClock\(room, clock\.offsetMs\);/);
  // Each stage shows its own card: the lobby, the round (only while it is
  // open), the round's results (only once it closed), the end.
  assert.match(studentMain, /\{room\.status === 'lobby' && \(\s*<StudentLobbyCard /);
  assert.match(studentMain, /const roundOpen = room\.status === 'running' && room\.roundState !== 'closed';/);
  assert.match(studentMain, /\{!rushRoom && room\.status === 'running' && room\.currentQuestion && roundOpen && clockReady && \(\s*<ChallengeRound/);
  assert.match(studentMain, /\{stage === CHALLENGE_STAGE\.ROUND_RESULTS && \(\s*<StudentRoundResults /);
  const finished = region(studentMain, "{room.status === 'finished' && (", "{room.status === 'cancelled' && (", 'final screen');
  assert.match(finished, /<StudentFinalCard/);
  // Working points are on the board only while the round takes answers.
  assert.match(studentMain, /const activeRound = room && stage === CHALLENGE_STAGE\.ROUND_ACTIVE \? Number\(room\.currentRound\) : null;/);
});

test('a live round says what comes next — its results — and when you finished early', () => {
  const round = region(student, 'export function ChallengeRound(', 'export default function LiveChallengeStudent', 'ChallengeRound');
  assert.match(student, /\n\s*persistResult\n\s*liveShell\n/, 'the live screen opts into the live wording');
  assert.match(round, /liveShell \? 'Time is up! The results are coming\.' : 'Time is up\. Wait for your teacher to start the next round\.'/);
  assert.match(round, /\{liveShell && result && !expired && <div [^>]*data-mm-finished-early="1"/);
  // 3 · 2 · 1 over the question, which stays mounted but unseen until GO.
  assert.match(round, /\{\(!roundStarted \|\| elapsedMs < GO_FLASH_MS\) && \(\s*<div data-mm-round-countdown=/);
  assert.match(round, /<div style=\{\{ visibility: roundStarted \? 'visible' : 'hidden' \}\}>/);
  assert.match(round, /assignmentLocked=\{locked \|\| expired \|\| !roundStarted\}/, 'and nothing can be answered before it');
});

test('the student\'s connection status comes from the listener itself, honestly', () => {
  const listener = region(studentMain, '    return watchLiveChallengeRoom(roomId,', '}, [roomId]);', 'room listener');
  assert.match(listener, /\{ includeMetadataChanges: true \}/);
  // Only the server's word counts: a cached copy proves neither that the
  // device is in sync nor that the room is gone.
  assert.match(listener, /setRoomFromCache\(fromCache\);\s*if \(!fromCache\) \{\s*setEverInSync\(true\);\s*setRoomMissing\(!next\);\s*\}/);
  // A room the server says does not exist is said so in words, with the way
  // out — never "Opening…" forever.
  const missing = region(studentMain, '  if (!room || roomMissing) {', '\n  }\n', 'missing room screen');
  assert.match(missing, /This Live Challenge is no longer available\./);
  assert.match(missing, /\(roomMissing \|\| error\) && \(\s*<button type="button" onClick=\{onExit\}/);
  assert.match(studentMain, /const connection = studentConnectionState\(\{ online, fromCache: roomFromCache, everInSync \}\);/);
  assert.match(studentMain, /<ConnectionPill state=\{connection\} look="student" \/>/);
  const onlineEffect = region(studentMain, "window.addEventListener('online', update);", '}, []);', 'online listener');
  assert.match(onlineEffect, /window\.removeEventListener\('online', update\);/);
  assert.match(onlineEffect, /window\.removeEventListener\('offline', update\);/);
});

test('the heartbeat names its tab, and stops when the game is over', () => {
  assert.match(studentMain, /const calibrating = !room \|\| room\.status === 'lobby' \|\| room\.status === 'running';/);
  const calibration = region(studentMain, 'if (!roomId || !calibrating) return undefined;', '}, [roomId, calibrating, sessionId]);', 'calibration');
  assert.match(calibration, /calibrateLiveChallengeClock\(\{ roomId, quality: estimate\.quality, sessionId \}\)/);
  assert.match(calibration, /return \(\) => \{ stopped = true; window\.clearTimeout\(timer\); \};/);
  // One id per tab, kept across a refresh of that tab (sessionStorage).
  assert.match(student, /window\.sessionStorage\.getItem\(CHALLENGE_SESSION_KEY\)/);
  assert.match(studentMain, /const sessionId = useMemo\(\(\) => challengeSessionId\(\), \[\]\);/);
});

test('a student who arrives after the start is told they play from this round', () => {
  const join = region(studentMain, 'joinLiveChallenge({ roomId })', '.finally(', 'join');
  assert.match(join, /reply\.rejoined === false && room\.status === 'running' && room\.roundState !== 'closed'/);
  assert.match(join, /setJoinedAtRound\(Number\(room\.currentRound\) \|\| 0\)/);
  assert.match(studentMain, /studentGuidance\(\{ room, stage, joinedAtRound \}\)/);
});

test('a finished game: your place, then what reached your wallet, then the top of the class', () => {
  const finalCard = region(studentShell, 'export function StudentFinalCard(', '\n}\n', 'final card');
  const order = ['{selfRow.place.ordinal}', '{rewardsSlot}', '<StandingsBoard'].map((needle) => finalCard.indexOf(needle));
  assert.ok(order.every((at) => at > -1), 'all three are shown');
  assert.deepEqual([...order].sort((left, right) => left - right), order, 'in that order');
  assert.match(finalCard, /selfRow\.tied \? `tied for \$\{ordinal\(selfRow\.rank\)\} ` : ''/, 'a shared place says so');
  // What the game counts for, said truthfully: a Warm-Up game's accuracy is
  // the Warm-Up grade; a standalone game changes no grade (challengeRecapModel).
  assert.match(finalCard, /\{gameGradeSentence\(\{ warmup \}\)\}/);
  assert.doesNotMatch(executableSource(finalCard), /does not change your assignment grade/i, 'never the old, false sentence');
  // Until the standings arrive (a refresh on the podium) the card waits in
  // words; it never tells a player who was there that they joined too late.
  assert.match(finalCard, /\{loading \? 'Loading your final place…' : 'You joined after the last round\.'\}/);
  const finished = region(studentMain, "{room.status === 'finished' && (", "{room.status === 'cancelled' && (", 'finished view');
  assert.match(finished, /loading=\{!finalStandings\}/);
  assert.match(finished, /warmup=\{Boolean\(room\.assignmentId\)\}/, 'a Warm-Up game is one with an assignment');
  // The final place and podium come from the FINAL snapshot only — the one
  // written from the match result — never from a live one still on screen.
  assert.match(studentMain, /const finalStandings = room\.status === 'finished' && standings\?\.kind === PROJECTION_KIND\.FINAL \? standings : null;/);
  assert.match(finished, /totalPlayers=\{finalStandings\?\.count \|\| 0\}/);
});

/* ------------------------------ the boards themselves ------------------------------ */

test('every number on a board is the real value — no count-up, no animation frames', () => {
  for (const [name, source] of [['student', student], ['shell parts', parts], ['student shell', studentShell], ['projector', projector], ['teacher', teacher]]) {
    assert.doesNotMatch(executableSource(source), /requestAnimationFrame|useCountUp/, `${name} must not animate scores through values nobody had`);
  }
  const board = region(parts, 'export function StandingsBoard(', '\nexport const roundPerformanceText', 'standings board');
  assert.match(board, /\{formatPoints\(row\.score\)\}/);
  assert.match(board, /<strong key=\{row\.score\} className="mm-shell-bump"/, 'a change flashes once, in CSS');
});

test('motion is decoration only, and off under reduced motion', () => {
  const reduced = SHELL_CSS.slice(SHELL_CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.ok(reduced.length > 30, 'the shell styles honour reduced motion');
  assert.match(reduced, /\.mm-shell-count-number, \.mm-shell-bump, \.mm-shell-pulse \{ animation: none !important; \}/);
  assert.match(reduced, /\.mm-shell-confetti \{ display: none; \}/);
  assert.match(rushRound, /\.mm-rush-found-fresh, \.mm-rush-in-a, \.mm-rush-in-b, \.mm-rush-count \{ animation: none; \}/);
});

test('the clock digits tick in their own component; the screens re-derive only at boundaries', () => {
  const digits = region(parts, 'export function ChallengeClockText(', '\nexport function useLowTime(', 'clock text');
  assert.match(digits, /const now = useTicker\(250, ticking\);/);
  // The round screens no longer re-render every 250 ms for a clock.
  assert.doesNotMatch(executableSource(teacher), /setInterval\(\(\) => setNow|useMonotonicNow/);
  assert.doesNotMatch(executableSource(projector), /setInterval/);
});

test('the question engine is not redrawn by the round around it', () => {
  const wrapper = region(student, 'function QuestionEngine(props) {', '\n}\n', 'stable engine');
  assert.match(wrapper, /latest\.current = props;/);
  assert.match(wrapper, /const handlers = useMemo\(\(\) => \(\{[\s\S]*?\}\), \[\]\);/, 'callbacks are stable, routed to the latest handler');
  const deps = wrapper.slice(wrapper.lastIndexOf('), ['));
  assert.doesNotMatch(deps, /onStepGrade|onGrade|onResponseStateChange|props/, 'only what the engine SHOWS redraws it');
});

/* ---------------------------------- the host ---------------------------------- */

test('destructive host actions are confirmed once; harmless ones never ask', () => {
  const confirmations = region(teacher, 'const CONFIRMATIONS = {', '\n  };', 'confirmations');
  for (const key of ['finish', 'cancel', 'close']) assert.match(confirmations, new RegExp(`\\n    ${key}: \\{`), `${key} is confirmed`);
  assert.match(confirmations, /run: \(\) => control\('close', forceCloseRound\)/);
  const header = region(teacher, 'data-mm-host-console=', '</header>', 'console header');
  assert.match(header, /onClick=\{\(\) => \(joinedCount > 0 \? setConfirming\('cancel'\) : control\('cancel', cancelLiveChallenge\)\)\}/, 'an empty lobby cancels without a question');
  assert.match(header, /onClick=\{\(\) => setConfirming\('finish'\)\}/);
  const primary = region(teacher, 'const runPrimaryAction = () => {', '\n  };', 'primary control');
  assert.doesNotMatch(primary, /setConfirming/, 'Start and Next Round never ask');
});

test('a confirmation keeps keyboard focus where the teacher put it, and Tab inside it', () => {
  const dialog = region(parts, 'export function ConfirmDialog(', '\nconst CONFETTI_COLORS', 'confirm dialog');
  // The console hands a new onCancel every time a student's progress arrives:
  // read through a ref, it can never re-run the focus effect (which put focus
  // back on "Keep playing" under a teacher tabbing to the red button).
  assert.match(dialog, /const onCancelRef = useLatest\(onCancel\);/);
  assert.match(dialog, /\}, \[open, onCancelRef\]\);/);
  assert.doesNotMatch(dialog, /\[open, onCancel\]/);
  // aria-modal is kept: Tab and Shift+Tab wrap inside the dialog.
  assert.match(dialog, /if \(event\.key !== 'Tab'\) return;/);
  assert.match(dialog, /\(event\.shiftKey \? last : first\)\.focus\(\);/);
});

test('Play Again is a fresh match with the same settings; its name settings are secured or it is cancelled', () => {
  const replay = region(teacher, 'const playAgain = async () => {', '\n  };', 'play again');
  assert.match(replay, /const request = replayRequestFromRoom\(room, \{ rewardPolicy: buildChallengeRewardPolicy\(rewardChoice\) \}\);/);
  assert.match(replay, /created = await createLiveChallenge\(request\);/);
  assert.match(replay, /configureLiveChallengeExperience\(\{ roomId: created\.roomId, \.\.\.replayExperienceFromRoom\(room\) \}\)/);
  assert.match(replay, /await cancelLiveChallenge\(\{ roomId: created\.roomId \}\)\.catch\(\(\) => \{\}\);/);
  // The new room is not announced as a "reconnect" while it is being made.
  assert.match(replay, /creatingRef\.current = true;[\s\S]*creatingRef\.current = false;/);
  assert.match(replay, /setRoomId\(result\.roomId\);/);
});

/*
 * NAMES ON THE CONSOLE — IN THE LOBBY, DURING THE GAME AND AFTER IT. The final
 * standings are when a teacher most needs to know who "Algebra Hawk 91" is;
 * the roster used to be read only while the game was live (a refresh on the
 * podium lost it for good). Never for a cancelled game, asked again a few
 * times while it knows fewer names than the room invited, and released on
 * unmount. The projector is never handed names.
 */
test('names reach the console only — in the lobby, during the game and after it', () => {
  assert.match(teacher, /const rosterWanted = Boolean\(room\) && room\.status !== 'cancelled';/);
  const rosterEffect = region(teacher, '  // The names behind the game aliases, for this console:', '}, [roomId, rosterWanted, eligibleRef]);', 'roster read');
  assert.match(rosterEffect, /if \(!roomId \|\| !rosterWanted\) return undefined;/);
  assert.match(rosterEffect, /getLiveChallengeHostRoster\(\{ roomId \}\)/);
  assert.match(rosterEffect, /names\.length < eligibleRef\.current && attempts < 4/);
  assert.match(rosterEffect, /return \(\) => \{ cancelled = true; window\.clearTimeout\(timer\); \};/);
  // The final standings pair names with places only behind the console's
  // "keep off while projected" switch.
  const finished = region(teacher, '      {finished && (', '      {cancelled && (', 'finished stage');
  assert.match(finished, /namesByKey=\{showAliases \? rosterNameByKey : null\}/);
  // The projector receives neither the roster nor a name map.
  const projectorCall = region(teacher, '    return <ChallengeProjector\n      room={room}', '/>;', 'projector render');
  assert.doesNotMatch(projectorCall, /roster|namesByKey|rosterName/i);
  assert.doesNotMatch(executableSource(projector), /getLiveChallengeHostRoster|namesByKey|rosterNames/);
});

test('the host reopens what it was hosting: a live game from the server, a finished one from this tab', () => {
  const recovery = region(teacher, 'useEffect(() => watchTeacherActiveChallenge(', '}), [signedInEmail, roomIdRef]);', 'host recovery');
  assert.match(recovery, /if \(roomIdRef\.current \|\| creatingRef\.current\) return;/);
  assert.match(recovery, /!missingRoomsRef\.current\.has\(active\.roomId\)/, 'a room the server no longer has is never reopened');
  assert.match(recovery, /const remembered = rememberedHostedRoom\(\);/);
  assert.match(teacher, /Date\.now\(\) - Number\(saved\.savedAt\) < LAST_ROOM_MAX_AGE_MS/, 'only a recent one');
});

/* -------------------------------- the projector -------------------------------- */

test('the projector shows one view per stage, from the room\'s own clock', () => {
  const component = region(projector, 'export default function LiveChallengeArenaProjector(', null, 'projector');
  assert.match(component, /const clock = useChallengeClock\(room, clockOffsetMs\);/);
  assert.match(component, /stage === CHALLENGE_STAGE\.LOBBY && <LobbyView /);
  assert.match(component, /stage === CHALLENGE_STAGE\.COUNTDOWN && <CountdownView /);
  assert.match(component, /stage === CHALLENGE_STAGE\.ROUND_RESULTS && <ResultsView /);
  assert.match(component, /stage === CHALLENGE_STAGE\.COMPLETED && \(\s*<>\s*<Confetti \/>\s*<FinalPodium /);
  // Full screen is offered, never required; a refusal leaves the CSS viewport.
  assert.match(component, /try \{ await shellRef\.current\?\.requestFullscreen\?\.\(\); \} catch \{ setNativeFullscreen\(false\); \}/);
  assert.match(component, /aria-pressed=\{audioMuted\} onClick=\{onToggleMute\}/, 'sound can always be muted');
});

test('the final standings under the podium show only rows that fit whole, and the note under them', () => {
  // The viewport's row budget asked for five rows at 1366×768 where three
  // fit; the rest, and "Everyone sees their own final place", were cut off.
  const finale = region(projector, 'function FinalPodium(', '\nfunction LobbyView(', 'final podium');
  // `remaining` is already bounded by the screen's row budget (and the room's
  // standings choice) in finalBoardRows; the fit measures what is left.
  assert.match(finale, /const board = finalBoardRows\(room, leaderboard, rows\);/);
  assert.match(finale, /const fit = useRowsThatFit\(boardRef, remaining\.length\);/);
  assert.match(finale, /const shownBelow = fit\.room \? remaining\.slice\(0, fit\.rows\) : \[\];/);
  assert.match(finale, /<div ref=\{boardRef\} style=\{\{ minHeight: 0, overflow: 'hidden'/);
  // With no room under the podium at all (150% zoom), the note moves into
  // the podium's heading rather than vanishing.
  assert.match(finale, /\{!fit\.room && someoneUnseen && <span data-mm-final-more="header">/);
  const fit = region(projector, 'function useRowsThatFit(', '\nfunction FinalPodium(', 'row fit');
  assert.match(fit, /Math\.floor\(\(space - FINAL_NOTE_PX \+ 6\) \/ rowHeight\)/);
  assert.match(fit, /const room = space >= FINAL_NOTE_PX;/);
  assert.match(fit, /new ResizeObserver\(measure\)/);
  assert.match(fit, /return \(\) => observer\.disconnect\(\);/);
});

test('the podium handles ties and shows what placement earns', () => {
  const podium = region(projector, 'function PodiumPlace(', '\nfunction LobbyView(', 'podium');
  assert.match(podium, /const rank = Math\.max\(1, Math\.min\(3, Number\(row\.rank\) \|\| place\)\);/, 'the medal is the rank tied players share');
  assert.match(podium, /\$\{row\.tied \? ' · Tied' : ''\}/);
  assert.match(podium, /rewardsByKey|rewards/);
});

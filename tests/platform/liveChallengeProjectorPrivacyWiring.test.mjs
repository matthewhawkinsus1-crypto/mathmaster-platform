// The projector, the host console and the create panel are wired to the
// privacy, solution, recognition and extended-time models
// (liveChallengeProjectorStandings.test.mjs tests those models). Node cannot
// render .jsx, so these read the components as source, each assertion bound
// to the region that does the work (docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const projector = read('src/components/liveChallenge/LiveChallengeArenaProjector.jsx');
const teacher = read('src/components/liveChallenge/LiveChallengeTeacher.jsx');
const consoleParts = read('src/components/liveChallenge/ChallengeHostConsole.jsx');
const shellParts = read('src/components/liveChallenge/ChallengeShellParts.jsx');
const rewardSettings = read('src/components/liveChallenge/ChallengeRewardSettings.jsx');

test('the projector stays presentation-only: it reads no solution, room or callable itself', () => {
  const code = executableSource(projector);
  assert.doesNotMatch(code, /from ['"][^'"]*(firebase|liveChallengeService)[^'"]*['"]/, 'no Firebase or service import');
  assert.doesNotMatch(code, /useRoundSolution|readLiveChallengeSolution|getLiveChallengeMatchRecap|httpsCallable/);
  // The solution arrives as props.
  const props = region(projector, 'export default function LiveChallengeArenaProjector({', '}) {', 'projector props');
  assert.match(props, /\n\s*solution = null,/);
  assert.match(props, /\n\s*solutionState = SOLUTION_STATE\.NONE,/);
});

test('the worked solution is drawn only on a closed round\'s results', () => {
  // Only ResultsView renders ProjectorSolution …
  const uses = executableSource(projector).match(/<ProjectorSolution\b/g) || [];
  const results = region(projector, 'function ResultsView(', '\n/** Host controls along the bottom', 'results view');
  assert.equal((results.match(/<ProjectorSolution\b/g) || []).length, uses.length, 'every ProjectorSolution is inside ResultsView');
  assert.ok(uses.length >= 1);
  // … gated by the model (results stage, a real state) and the teacher's hide …
  assert.match(results, /const showSolution = !solutionHidden && projectorShowsSolution\(\{ stage: clock\.stage, solutionState \}\);/);
  assert.match(results, /const solutionFills = showSolution && solutionState === SOLUTION_STATE\.READY;/);
  assert.match(results, /\{showSolution && <ProjectorSolution /);
  // … and ResultsView is mounted only at the results stage.
  const main = region(projector, '<main style=', '</main>', 'projector stage switch');
  const resultsLine = main.split('\n').find((line) => line.includes('<ResultsView'));
  assert.ok(resultsLine, 'ResultsView is on the projector');
  assert.match(resultsLine, /^\s*\{!loading && stage === CHALLENGE_STAGE\.ROUND_RESULTS && <ResultsView /);
  assert.match(resultsLine, /solution=\{solution\} solutionState=\{solutionState\} solutionHidden=\{solutionHidden\}/);
  // The solution's math is typeset.
  const panel = region(projector, 'function ProjectorSolution(', '\n/** A closed round:', 'projector solution');
  assert.match(panel, /<MathText>\{step\}<\/MathText>/);
  assert.match(panel, /solutionStateMessage\(state\)/, 'a held solution says why');
});

test('the console reads the solution only for a published round at results, and hands it to the projector', () => {
  const read = region(teacher, '// THE WORKED SOLUTION, between rounds only.', 'roundSolutionState({', 'console solution read');
  assert.match(read, /const solutionRound = showingResults && Number\.isInteger\(currentRound\) \? currentRound : null;/);
  assert.match(read, /useRoundSolution\(roomId, solutionRound, solutionRound !== null && solutionRevealed\(room, solutionRound\)\)/);
  const projectorCall = region(teacher, "if (projector && ['lobby', 'running', 'finished'].includes(room.status))", '\n  return (', 'projector delegation');
  assert.match(projectorCall, /solution=\{solutionState \? roundSolution : null\}/);
  assert.match(projectorCall, /solutionState=\{solutionState \|\| undefined\}/);
  // The console shows it too, on the results screen only.
  const resultsBlock = region(teacher, '{stage === CHALLENGE_STAGE.ROUND_RESULTS && (\n            <>', '</>', 'console results');
  assert.match(resultsBlock, /\{solutionState && <HostSolutionPanel solution=\{roundSolution\} state=\{solutionState\} \/>\}/);
  assert.match(consoleParts, /export function HostSolutionPanel\(/);
});

test('every class-wide list on the projector goes through the one public rule', () => {
  // Each board hands its rows to publicStandingsRows (never a count limit)
  // and draws what it returns.
  const code = executableSource(projector);
  assert.doesNotMatch(code, /projectorBoardLimit|belowPodiumLimit|upToLastButOne/, 'no count-based limit is left');
  const running = region(projector, 'function RunningView(', '\nfunction RushRunningView(', 'running view');
  assert.match(running, /const liveBoard = publicStandingsRows\(room, liveRows, \{ spaceForRows: rows \}\);/);
  assert.match(running, /<StandingsBoard board=\{liveBoard\} /);
  const rush = region(projector, 'function RushRunningView(', '\n/*\n * THE WORKED SOLUTION', 'rush view');
  assert.match(rush, /const raceBoard = publicStandingsRows\(room, rushRaceRanked\(rushRaceRows\(players, roundIndex\)\), \{ spaceForRows: rows \}\);\s*const boardLimit = raceBoard\.rows\.length;\s*const racersMore = raceBoard\.moreText;/);
  assert.match(rush, /\{boardLimit > 0 && <RushRaceBoard [^\n]*limit=\{boardLimit\}/);
  const results = region(projector, 'function ResultsView(', '\n/** Host controls along the bottom', 'results view');
  assert.match(results, /const standingsBoard = standings \? publicStandingsRows\(room, standings, \{ spaceForRows: rows \}\) : null;/);
  assert.match(results, /const roundBoard = roundView \? publicStandingsRows\(room, roundView\.rows, \{ spaceForRows: Math\.max\(3, rows - 1\) \}\) : null;/);
  assert.match(results, /<RoundResultsTable view=\{roundView\} board=\{roundBoard\} /);
  assert.match(results, /<StandingsBoard board=\{standingsBoard\} /);
  // Every StandingsBoard / RoundResultsTable on the projector draws a decided board.
  for (const tag of code.match(/<(StandingsBoard|RoundResultsTable)\b[^\n]*/g) || []) {
    if (/rows=\{standingsRows\(shownBelow\)\}/.test(tag)) continue; // under the podium: rows finalBoardRows decided, fitted to the space
    assert.match(tag, /board=\{/, tag);
  }
  // The podium's steps come from the same list, not the raw leaderboard.
  const finale = region(projector, 'function FinalPodium(', '\nfunction LobbyView(', 'final podium');
  assert.match(finale, /const board = finalBoardRows\(room, leaderboard, rows\);\s*const remaining = board\.rows;\s*const podium = board\.podium;/);
  assert.doesNotMatch(executableSource(finale), /podiumRows\(/);
  assert.match(finale, /\{hasPodium \? \(/);
  assert.match(projector, /<FinalPodium room=\{room\} /);
  // The shell draws a decided board as it is: its rows, own row, count and note.
  const board = region(shellParts, 'export function StandingsBoard(', '\n/** What one player did', 'standings board');
  assert.match(board, /const visible = board\s*\? \{ top: board\.rows, self: board\.self, hiddenCount: board\.hiddenCount \+ \(board\.self \? 1 : 0\), total: board\.totalCount \}/);
  assert.match(board, /board\?\.moreText \|\|/);
  const table = region(shellParts, 'export function RoundResultsTable(', '\nexport function ConfirmDialog', 'round results');
  assert.match(table, /const shown = board \? board\.rows : rows\.slice\(0, limit\);/);
  assert.match(table, /const unseen = board \? board\.hiddenCount :/);
});

test('recognitions sit under the podium by alias, never by player key', () => {
  const finale = region(projector, 'function FinalPodium(', '\nfunction LobbyView(', 'final podium');
  assert.match(finale, /<PodiumRecognitions room=\{room\} \/>/);
  const recognitions = region(projector, 'function PodiumRecognitions(', '\nfunction FinalPodium(', 'recognitions');
  assert.match(recognitions, /const recognitions = podiumRecognitionRows\(room\);/);
  assert.match(recognitions, /if \(!recognitions\.length\) return null;/);
  assert.doesNotMatch(executableSource(recognitions), /playerKey/);
});

test('extended time reads "still finishing" on the projector and the console, and End Round Now stays', () => {
  const clock = region(projector, 'function ArenaClock(', '\nconst PODIUM_RANKS', 'arena clock');
  assert.match(clock, /if \(finishing\) \{[\s\S]*\{STILL_FINISHING_MESSAGE\}/);
  const running = region(projector, 'function RunningView(', '\nfunction RushRunningView(', 'running view');
  assert.match(running, /const finishing = roundStillFinishing\(\{ room, locked, joinedCount, answeredCount \}\);/);
  assert.match(running, /<ArenaClock [^\n]*finishing=\{finishing\}/);
  const strip = region(projector, 'function HostStrip(', '\nexport const formatArenaClock', 'projector strip');
  assert.match(strip, /const endableRound = [^\n]*\|\| finishing;/);
  // The strip is inside the full-screen projector: its words are the neutral hint.
  assert.match(strip, /\{finishing \? STILL_FINISHING_HOST_HINT : primaryAction\.hint\}/);
  const status = region(teacher, 'export function ChallengeLiveStatus(', '\nconst STANDINGS_DISPLAY_KEY', 'console status');
  assert.match(status, /const extendedTime = roundWaitingOnExtendedTime\(\{ room, locked, joinedCount, answeredCount \}\);/);
  assert.match(status, /extendedTime\s*\?\s*<div data-mm-extended-time="1"[^\n]*\{EXTENDED_TIME_MESSAGE\}/);
  const controls = region(teacher, 'const extendedTime = roundWaitingOnExtendedTime({ room, locked: stage === CHALLENGE_STAGE.ROUND_LOCKED', 'const roundAction', 'console controls');
  assert.match(controls, /stage === CHALLENGE_STAGE\.ROUND_ACTIVE \|\| stage === CHALLENGE_STAGE\.ROUND_PAUSED \|\| extendedTime\s*\?\s*\{ key: 'close', label: 'End Round Now'/);
  // The explicit reason stays on the teacher's private console …
  assert.match(teacher, /const roundAction = extendedTime && primaryAction \? \{ \.\.\.primaryAction, hint: EXTENDED_TIME_HOST_HINT \} : primaryAction;/);
  assert.match(teacher, /<HostControlBar action=\{roundAction\} [^\n]*secondary=\{secondaryControls\}/);
  // … and the projector is handed the plain action, never the console's hint.
  const projectorCall = region(teacher, "if (projector && ['lobby', 'running', 'finished'].includes(room.status))", '\n    />;', 'projector delegation');
  assert.match(projectorCall, /\n\s*primaryAction=\{primaryAction\}\n/);
  assert.doesNotMatch(projectorCall, /roundAction|EXTENDED_TIME_HOST_HINT/);
});

/*
 * NOTHING THE CLASS READS SAYS WHO HAS AN ACCOMMODATION. The projector's
 * full-screen element holds the stage AND the host strip, so every word it
 * renders is projected. "The round waits for students with extended time"
 * beside "Locked in 23 / 24" names the student still typing. So: no such word
 * in the projector's code (comments may explain the boundary), and none in
 * any string it imports from a model and renders.
 */
const FORBIDDEN = /extended|accommodat|extra time|support plan|\bIEP\b|\b504\b/i;
test('the projector never says "extended time" or "accommodation", in any stage', async () => {
  const code = executableSource(projector);
  assert.doesNotMatch(code, FORBIDDEN, 'the projector\'s own code and words');
  // Every name it imports from a .js/.mjs model, and the value behind it.
  const imports = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+\.m?js)'/g)];
  assert.ok(imports.length >= 5, 'the projector imports its models');
  let strings = 0;
  for (const [, names, from] of imports) {
    const module = await import(new URL(from, new URL('../../src/components/liveChallenge/', import.meta.url)));
    for (const name of names.split(',').map((part) => part.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
      assert.doesNotMatch(name, FORBIDDEN, `imports ${name} from ${from}`);
      const value = module[name];
      if (typeof value === 'string') {
        strings += 1;
        assert.doesNotMatch(value, FORBIDDEN, `${name} (${from}) renders "${value}"`);
      }
    }
  }
  assert.ok(strings >= 2, 'the still-finishing words are among them');
  // The components it renders from .jsx files say none of it either.
  for (const part of ['ChallengeShellParts.jsx', 'GraphFeatureRushHost.jsx']) {
    assert.doesNotMatch(executableSource(read(`src/components/liveChallenge/${part}`)), FORBIDDEN, part);
  }
  // The neutral words are what it renders at that moment, in the clock, the
  // question panel and the host strip.
  assert.equal((code.match(/\{STILL_FINISHING_MESSAGE\}|\$\{STILL_FINISHING_MESSAGE\}/g) || []).length, 2);
  assert.match(code, /STILL_FINISHING_HOST_HINT/);
});

test('the create panel offers the projector choice and sends it with every new game', () => {
  const select = region(teacher, '<label style={{ fontWeight: 800 }}>Projector shows', '</label>', 'projector choice');
  assert.match(select, /value=\{standingsDisplay\} onChange=\{\(event\) => setStandingsDisplay\(event\.target\.value\)\}/);
  assert.match(select, /<option value=\{STANDINGS_DISPLAY\.TOP_FEW\}>Top 5 only \(recommended\)<\/option>/);
  assert.match(select, /<option value=\{STANDINGS_DISPLAY\.FULL\}>Full standings<\/option>/);
  const create = region(teacher, "const result = await run('create', async () => {", '\n    creatingRef.current = false;', 'create');
  const calls = create.split('createLiveChallenge({').slice(1).map((call) => call.slice(0, call.indexOf('});')));
  assert.equal(calls.length, 2, 'a rush and a classic create');
  calls.forEach((call) => assert.match(call, /\n\s*standingsDisplay,\n/));
  // Remembered on this device, read defensively.
  assert.match(teacher, /normalizeStandingsDisplay\(window\.localStorage\.getItem\(STANDINGS_DISPLAY_KEY\)\)/);
});

test('the Rewards panel switches Recognition awards on and off', () => {
  const toggle = rewardSettings.split('\n').find((line) => line.includes('data-mm-recognitions-toggle'));
  assert.ok(toggle, 'the switch is on the panel');
  assert.match(toggle, /checked=\{choice\.recognitions !== false\}/);
  assert.match(toggle, /onChange=\{\(event\) => set\(\{ recognitions: event\.target\.checked \}\)\}/);
  assert.match(rewardSettings, /\{RECOGNITIONS_LABEL\}/);
});

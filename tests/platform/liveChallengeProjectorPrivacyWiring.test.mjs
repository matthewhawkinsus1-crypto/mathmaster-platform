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
  const panel = region(projector, 'function ProjectorSolution(', '\nfunction ResultsView(', 'projector solution');
  assert.match(panel, /<MathText>\{step\}<\/MathText>/);
  // Numbered steps read down a left edge, though the page around them is
  // centred (#root): every list of steps on the projector says so.
  const lists = executableSource(panel).match(/<ol style=\{\{[^}]*\}\}>/g) || [];
  assert.ok(lists.length >= 2, 'a bank question\'s steps and a revealed line\'s');
  lists.forEach((list) => assert.match(list, /textAlign: 'left'/, list));
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

// LC03 (decided 2026-10-25). Beside a ready worked solution the projector keeps
// the round's table (a championship game's points for the round) and the
// standings in view, one above the other, with no press of "Hide solution";
// on a narrow screen everything stacks in one column.
test('with a worked solution ready the projector keeps the round table and the standings beside it, and stacks them on a narrow screen', () => {
  const results = region(projector, 'function ResultsView(', '\n/** Host controls along the bottom', 'results view');
  // One definition of each panel, used by both layouts.
  assert.equal((results.match(/const roundPanel = \(/g) || []).length, 1);
  assert.equal((results.match(/const standingsPanel = \(/g) || []).length, 1);
  const roundPanel = region(results, 'const roundPanel = (', '</ResultsPanel>', 'round panel');
  const standingsPanel = region(results, 'const standingsPanel = (', '</ResultsPanel>', 'standings panel');
  assert.match(roundPanel, /<RoundResultsTable view=\{roundView\} board=\{/);
  assert.match(standingsPanel, /<StandingsBoard board=\{/);
  // The solution layout: the solution on the left, both panels in a column on the right.
  const beside = region(results, 'if (solutionFills) {', '\n  return (\n    <div style={{ height', 'the solution layout');
  assert.match(beside, /data-mm-results-layout="solution"/);
  assert.match(beside, /<ProjectorSolution solution=\{solution\} state=\{solutionState\} \/>/);
  const column = region(beside, 'data-mm-results-tables="stacked"', '</div>\n      </div>', 'the tables column');
  assert.match(column, /\{fit\.roundShown && roundPanel\}\s*\{standingsPanel\}/, 'the round table above the standings, unless it stepped aside');
  assert.match(column, /gridTemplateRows: fit\.roundShown \? 'minmax\(0,auto\) minmax\(0,1fr\)' : 'minmax\(0,1fr\)'/, 'the round table as tall as its rows, the standings the rest');
  assert.match(column, /data-mm-round-table=\{fit\.roundShown \? 'beside' : 'aside'\}/, 'the column says where the round table is');
  assert.match(beside, /<div\s*ref=\{columnRef\}\s*className="mm-arena-results-tables"\s*data-mm-results-tables="stacked"/, 'the column is what a resize or a zoom is watched on');
  // Without one (none, held, or hidden), the two sit side by side as before.
  const alone = region(results, 'data-mm-results-layout="tables"', '\n  );\n}', 'the two-table layout');
  assert.match(alone, /\{roundPanel\}\s*\{standingsPanel\}/);
  // The compact rows, and the measuring, are for the shared column only.
  for (const [name, source] of [['round', roundPanel], ['standings', standingsPanel]]) {
    assert.match(source, /compact=\{solutionFills\}/, `${name}: compact rows only beside a solution`);
  }
  assert.match(results, /\{ roundCeiling, standingsCeiling, standingsFirst: plan\.standingsFirst, resetKey, enabled: solutionFills \}/, 'measured only beside a solution, again for a new round');
  // Each list is drawn for the rows the fitting gave it, and is measured through its own panel.
  assert.match(roundPanel, /panelRef=\{roundRef\}\s*space=\{fit\.round\}/);
  assert.match(standingsPanel, /panelRef=\{standingsRef\}\s*space=\{fit\.standings\}/);
  // A narrow screen: one column, rows as tall as their content, and it scrolls.
  const css = region(projector, '@media (max-width: 900px) {', '@media (prefers-reduced-motion', 'the narrow-screen rules');
  assert.match(css, /\.mm-arena-running-grid,\s*\.mm-arena-lobby-grid \{\s*grid-template-columns: 1fr !important;\s*overflow-y: auto;/);
  assert.match(css, /\.mm-arena-solution-grid,\s*\.mm-arena-tables-grid \{ grid-auto-rows: max-content; \}/);
  assert.match(css, /\.mm-arena-results-tables \{ grid-template-rows: auto auto !important; \}/);
  assert.match(beside, /className="mm-arena-running-grid mm-arena-solution-grid"/);
  assert.match(beside, /className="mm-arena-results-tables"/);
  assert.match(results, /className="mm-arena-running-grid mm-arena-tables-grid" data-mm-results-layout="tables"/);
  // "Hide solution" is still the teacher's to press: it brings the two-table layout back for this round.
  assert.match(results, /const showSolution = !solutionHidden && projectorShowsSolution\(/);
});

// LC03. How many rows each stacked table shows is what FITS it, measured from
// the panel itself: a table of screen heights was right in the font it was
// measured in and cut off in the one a classroom's machine has.
test('a stacked results panel shows the rows that fit it whole, measured from the panel itself', () => {
  const results = region(projector, 'function ResultsView(', '\n/** Host controls along the bottom', 'results view');
  // The most each list may show: the public rule's top few (the screen's rows for full standings) when two
  // share a column, the screen's rows when a list is alone.
  assert.match(results, /const plan = stackedResultsPlan\(room, rows\);/);
  assert.match(results, /const roundCeiling = solutionFills \? plan\.rowCeiling : Math\.max\(3, rows - 1\);/);
  assert.match(results, /const standingsCeiling = solutionFills \? plan\.rowCeiling : rows;/);
  assert.match(results, /const resetKey = `\$\{room\?\.roomId \|\| room\?\.id \|\| ''\}:\$\{room\?\.currentRound\}:\$\{room\?\.roundVersion \|\| 0\}`;/);
  // The panel clips what does not fit, so the panel is what is measured.
  assert.match(region(results, 'const panel = {', '};', 'the panel style'), /overflow: 'hidden'/);
  // The decision is the panel's own overflow, one row at a time, through the model's step ...
  const hook = region(projector, 'function useStackedRowsThatFit(', '\n/** One of the results moment', 'the fitting hook');
  // Both panels are measured, and the model's step decides which list gives up a row
  // (the standings keep their top three longest: fitStackedStep) ...
  assert.match(hook, /const overflowOf = \(panel\) => \(panel \? panel\.scrollHeight - panel\.clientHeight : 0\);/);
  assert.match(hook, /fitStackedStep\(\{\s*\.\.\.have,\s*overflowPx: Math\.max\(overflowOf\(roundRef\.current\), overflowOf\(standingsRef\.current\)\),\s*standingsCeiling,\s*standingsFirst,\s*\}\)/);
  // ... after every render (no dependency list), so the rows just drawn are measured at once ...
  assert.match(hook, /useLayoutEffect\(\(\) => \{\s*if \(!enabled \|\| !columnRef\.current\) return;/);
  // ... a new ceiling or round, or the stacking switched on again, starts again from the top ...
  assert.match(hook, /const current = fitted\.roundCeiling === roundCeiling && fitted\.standingsCeiling === standingsCeiling\s*&& fitted\.resetKey === resetKey && fitted\.enabled === enabled;/);
  assert.match(hook, /\? \{ round: Math\.min\(fitted\.round, roundCeiling\), standings: Math\.min\(fitted\.standings, standingsCeiling\), roundShown: fitted\.roundShown \}\s*: top;/);
  assert.match(hook, /const top = \{ round: roundCeiling, standings: standingsCeiling, roundShown: true \};/);
  // ... and so does a change in the column's size (a resize, a zoom): a bigger screen shows more.
  assert.match(hook, /const column = columnRef\.current;\s*if \(!enabled \|\| !column \|\| typeof ResizeObserver !== 'function'\) return undefined;/);
  assert.match(hook, /new ResizeObserver\(/);
  // (the first callback only reports the size it started with)
  assert.match(hook, /if \(!seen\) \{ seen = true; return; \}\s*setFitted\(\{ roundCeiling, standingsCeiling, resetKey, enabled, round: roundCeiling, standings: standingsCeiling, roundShown: true \}\);/);
  assert.match(hook, /observer\.observe\(column\);/);
  assert.match(hook, /observer\.disconnect\(\)/);
  // Not enabled (the tables side by side): the ceilings, nothing measured.
  assert.match(hook, /return enabled \? have : top;/);
  // The view fits the two together; each panel draws its list for what it was given.
  assert.match(results, /const fit = useStackedRowsThatFit\(\s*\{ columnRef, roundRef, standingsRef \},/);
  const panel = region(projector, 'function ResultsPanel(', '\n/**\n * A closed round', 'the results panel');
  assert.match(panel, /<section ref=\{panelRef\} data-mm-results-panel=\{kind\} style=\{panelStyle\}>/);
  assert.match(panel, /\{children\(space\)\}/);
  // No table of screen heights is left, and no panel fits itself alone.
  assert.doesNotMatch(executableSource(projector), /stackedBoardRows|useViewportHeight|useRowsThatFitPanel|fitRowsStep/);
});

// LC03. The smaller rows that let two tables share a column belong to the
// projector's look alone, and only the shared column asks for them: a console
// or a student's device never gets them, and a table alone keeps its full rows.
test('compact rows are the projector look\'s, and a table draws them only when asked', () => {
  const looks = region(shellParts, 'export const SHELL_LOOKS = Object.freeze({', '\n});', 'the shell looks');
  const lookOf = (name) => region(looks, `  ${name}: Object.freeze({`, '\n  }),', `the ${name} look`);
  for (const key of ['compactSize', 'compactRowHeight']) {
    assert.match(lookOf('projector'), new RegExp(`\\n    ${key}: `), `the projector look has ${key}`);
    assert.doesNotMatch(lookOf('console'), new RegExp(key), `the console look has no ${key}`);
    assert.doesNotMatch(lookOf('student'), new RegExp(key), `the student look has no ${key}`);
  }
  // Both tables: full size unless asked, the look's own compact size when asked,
  // and the rows and the gaps between them really use what was chosen.
  const tables = [
    ['StandingsBoard', region(shellParts, 'export function StandingsBoard({', '\n/** What one player did in a round', 'StandingsBoard')],
    ['RoundResultsTable', region(shellParts, 'export function RoundResultsTable({', '\n/**\n * A destructive action', 'RoundResultsTable')],
  ];
  for (const [name, source] of tables) {
    assert.match(source, /\bcompact = false\b/, `${name} is full size unless asked`);
    assert.match(source, /const rowHeight = compact && style\.compactRowHeight \? style\.compactRowHeight : style\.rowHeight;/, `${name}: row height`);
    assert.match(source, /const rowSize = compact && style\.compactSize \? style\.compactSize : style\.size;/, `${name}: text size`);
    assert.match(source, /minHeight: rowHeight,/, `${name}: a row is as tall as chosen`);
    assert.match(source, /fontSize: rowSize,/, `${name}: a row's text is as large as chosen`);
    assert.match(source, /padding: compact \? '3px 12px' : '6px 12px'/, `${name}: a compact row has less padding`);
    assert.match(source, /const rowGap = compact \? 4 : 6;/, `${name}: compact rows sit closer together`);
    assert.ok((source.match(/gap: rowGap/g) || []).length >= 2, `${name}: the gaps between rows follow the choice`);
    assert.doesNotMatch(source, /minHeight: style\.rowHeight|fontSize: style\.size,/, `${name}: no row ignores the choice`);
  }
  // The line under a list that leaves players off is tighter in compact rows, in both tables.
  const more = region(shellParts, 'const moreLineStyle = (look, style, compact) => ({', '\n});', 'the more-line style');
  assert.match(more, /lineHeight: compact \? 1\.25 : undefined/);
  assert.match(more, /fontSize: look !== 'projector'\s*\? 'calc\(13 \* var\(--mm-px\)\)'\s*: compact\s*\? 'clamp\(calc\(13 \* var\(--mm-px\)\), calc\(1\.15vw/);
  for (const [name, source] of tables) {
    assert.match(source, /data-mm-board-more=\{unseen\} style=\{moreLineStyle\(look, style, compact\)\}/, `${name}: the more-line follows the choice`);
  }
  // Only the results view asks, for the shared column alone: one ask per table.
  const asks = executableSource(projector).match(/\bcompact=\{[^}]*\}/g) || [];
  assert.deepEqual(asks, ['compact={solutionFills}', 'compact={solutionFills}']);
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
  assert.match(results, /board=\{publicStandingsRows\(room, standings, \{ spaceForRows: space \}\)\}/);
  assert.match(results, /board=\{roundView \? publicStandingsRows\(room, roundView\.rows, \{ spaceForRows: space \}\) : null\}/);
  // The space is the screen's rows when a list is alone, and what fits the
  // panel when two share a column beside a worked solution (LC03: the panel
  // measures, then hands its list the rows that fit).
  assert.match(results, /const roundCeiling = solutionFills \? plan\.rowCeiling : Math\.max\(3, rows - 1\);/);
  assert.match(results, /const standingsCeiling = solutionFills \? plan\.rowCeiling : rows;/);
  assert.match(results, /<RoundResultsTable view=\{roundView\} board=\{/);
  assert.match(results, /<StandingsBoard board=\{/);
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

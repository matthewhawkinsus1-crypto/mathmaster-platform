// THE SCORING CHOICE FOR THE CLASSIC GAMES (LC16).
//
// Standard Challenge and Solver Race could be created only as Accuracy First,
// although the server and every results screen already ran them as Grand Prix
// (and Standard as Correct Count). The create panel now offers the choice.
// Held here:
//   - the choices are the ones the game mode allows, and a choice the mode
//     refuses (Correct Count for Solver Race) is never sent;
//   - Accuracy First sends nothing, so the request is the one teachers always
//     made; the other two send their id;
//   - speed influence stays Accuracy First's: Grand Prix and Correct Count send
//     the platform default, not a number a hidden control left behind;
//   - what the teacher is told a round pays is what the strategies pay, checked
//     against the strategies themselves;
//   - the console is wired to all of it (source contracts, each bound to the
//     region that does the work, and each broken once).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { executableSource, region } from './helpers/sourceContract.mjs';
import {
  CLASSIC_SECOND_CHANCE_NOTE,
  classicAllowsSecondChance,
  classicPlacementLadder,
  classicScoringHelp,
  classicScoringOptions,
  classicScoringRequest,
  classicSecondChanceFor,
  classicShowsSpeedInfluence,
  classicSpeedInfluence,
  resolveClassicScoring,
} from '../../src/platform/liveChallenge/classicScoringModel.js';
import { getChallengeMode, resolveModeScoringStrategy } from '../../functions/shared/liveChallengeModes.mjs';
import { correctCountStrategy, getScoringStrategy, grandPrixStrategy, leaderboardOptionsFor } from '../../functions/shared/liveChallengeScoring.mjs';
import { publicLeaderboard } from '../../functions/shared/liveChallenge.mjs';
import { replayExperienceFromRoom, replayRequestFromRoom } from '../../src/platform/liveChallenge/challengeReplayModel.js';

const idsOf = (modeId) => classicScoringOptions(modeId).map((option) => option.id);

test('the choices are the ones the game allows, Accuracy First first', () => {
  // Written out, so adding or removing a strategy for a mode is a decision made here too.
  assert.deepEqual(idsOf('standard'), ['accuracyFirst', 'grandPrix', 'correctCount']);
  assert.deepEqual(idsOf('solverRace'), ['accuracyFirst', 'grandPrix']);
  // An unknown or missing game is the standard game, as it is on the server.
  assert.deepEqual(idsOf(undefined), idsOf('standard'));
  assert.deepEqual(idsOf('somethingNew'), idsOf('standard'));
  for (const modeId of ['standard', 'solverRace']) {
    const mode = getChallengeMode(modeId);
    for (const option of classicScoringOptions(modeId)) {
      assert.equal(resolveModeScoringStrategy(mode, option.id), option.id, `${modeId}: the server accepts ${option.id}`);
      assert.ok(option.label.length > 0 && option.description.length > 40, `${modeId}/${option.id}: words`);
    }
  }
  assert.deepEqual(classicScoringOptions('standard').map((option) => option.label), ['Accuracy First', 'Grand Prix', 'Correct Count']);
});

test('a choice the game refuses is never sent: Solver Race has no Correct Count', () => {
  assert.equal(resolveClassicScoring('solverRace', 'correctCount'), 'accuracyFirst');
  assert.deepEqual(classicScoringRequest('solverRace', 'correctCount'), {});
  // The server would read it as the default too, so the control hides nothing.
  assert.equal(resolveModeScoringStrategy(getChallengeMode('solverRace'), 'correctCount'), 'accuracyFirst');
  assert.equal(resolveClassicScoring('solverRace', 'grandPrix'), 'grandPrix');
  assert.equal(resolveClassicScoring('standard', 'correctCount'), 'correctCount');
  // Anything else is the default.
  for (const junk of [undefined, null, '', 'bogus', 42]) assert.equal(resolveClassicScoring('standard', junk), 'accuracyFirst', String(junk));
});

test('Accuracy First sends nothing, so the request is the one teachers always made; the others send their id', () => {
  assert.deepEqual(classicScoringRequest('standard', 'accuracyFirst'), {});
  assert.deepEqual(classicScoringRequest('standard', undefined), {});
  assert.deepEqual(classicScoringRequest('standard', 'grandPrix'), { scoringStrategyId: 'grandPrix' });
  assert.deepEqual(classicScoringRequest('standard', 'correctCount'), { scoringStrategyId: 'correctCount' });
  assert.deepEqual(classicScoringRequest('solverRace', 'grandPrix'), { scoringStrategyId: 'grandPrix' });
});

test('speed influence is Accuracy First\'s: the other two send the default, whatever the hidden control last said', () => {
  assert.equal(classicShowsSpeedInfluence('accuracyFirst'), true);
  assert.equal(classicShowsSpeedInfluence('grandPrix'), false);
  assert.equal(classicShowsSpeedInfluence('correctCount'), false);
  assert.equal(classicSpeedInfluence({ strategyId: 'accuracyFirst', speedInfluencePercent: 35 }), 35);
  assert.equal(classicSpeedInfluence({ strategyId: 'accuracyFirst', speedInfluencePercent: 0 }), 0, 'Off is a choice');
  assert.equal(classicSpeedInfluence({ strategyId: 'accuracyFirst', speedInfluencePercent: 90 }), 50, 'the server\'s own cap');
  assert.equal(classicSpeedInfluence({ strategyId: 'grandPrix', speedInfluencePercent: 35 }), 20);
  assert.equal(classicSpeedInfluence({ strategyId: 'correctCount', speedInfluencePercent: 0 }), 20);
});

test('Grand Prix: the card\'s placement points are what the strategy pays, and no credit pays nothing', () => {
  const pays = (rank) => grandPrixStrategy.matchPointsForPlacement({ rank, participated: true, performance: 1, fieldSize: 12 });
  const [first, second, third] = [pays(1), pays(2), pays(3)];
  const grandPrix = classicScoringOptions('standard').find((option) => option.id === 'grandPrix');
  assert.ok(grandPrix.description.includes(`1st ${first}, 2nd ${second}, 3rd ${third}`), grandPrix.description);
  assert.equal(classicPlacementLadder().startsWith(`1st ${first}, 2nd ${second}, 3rd ${third}`), true);
  // The last place on the table, and the one-point floor beyond it.
  assert.ok(classicPlacementLadder().endsWith(`then down to ${pays(12)}`), classicPlacementLadder());
  assert.equal(pays(30), pays(12), 'beyond the table pays the floor');
  assert.match(grandPrix.description, /No credit, no points/);
  assert.equal(grandPrixStrategy.matchPointsForPlacement({ rank: 1, participated: true, performance: 0, fieldSize: 12 }), 0, 'a round with no credit pays nothing');
  assert.equal(grandPrixStrategy.matchPointsForPlacement({ rank: 1, participated: false, performance: 1, fieldSize: 12 }), 0, 'and so does sitting it out');
  const help = classicScoringHelp({ strategyId: 'grandPrix' }).join(' ');
  assert.ok(help.includes(`1st ${first}`) && help.includes('championship points'), help);
});

test('Correct Count: one point for a fully correct answer, none for a partly right one, none for speed, and fewer answers break a tie', () => {
  const answer = (fields) => correctCountStrategy.scoreResponse({ gradeScore: 1, remainingMs: 0, totalMs: 10_000, elapsedMs: 10_000, previousStreak: 0, ...fields }).pointsAwarded;
  assert.equal(answer({ isCorrect: true }), 1);
  assert.equal(answer({ isCorrect: true, remainingMs: 9_500, elapsedMs: 500 }), 1, 'a fast answer pays the same');
  assert.equal(answer({ isCorrect: false, gradeScore: 0.6 }), 0, 'a partly right answer earns nothing');
  assert.equal(answer({ isCorrect: true, previousStreak: 4 }), 1, 'a streak adds nothing');
  const rows = [
    { playerKey: 'wide', alias: 'Wide', joined: true, score: 3, correctCount: 3, roundsAnswered: 5 },
    { playerKey: 'tight', alias: 'Tight', joined: true, score: 3, correctCount: 3, roundsAnswered: 3 },
    { playerKey: 'ahead', alias: 'Ahead', joined: true, score: 4, correctCount: 4, roundsAnswered: 6 },
  ];
  const ranked = publicLeaderboard(rows, { activeRound: null, ...leaderboardOptionsFor('correctCount') });
  assert.deepEqual(ranked.map((row) => row.playerKey), ['ahead', 'tight', 'wide'], 'the same total: fewer answers first');
  const help = classicScoringHelp({ strategyId: 'correctCount' }).join(' ');
  assert.match(help, /One point for every fully correct answer/);
  assert.match(help, /partly right answer earns nothing/);
  assert.match(help, /fewer questions/);
});

test('the lines under the choice: none for Accuracy First (it has its points table), two for each of the others', () => {
  assert.deepEqual(classicScoringHelp({ strategyId: 'accuracyFirst' }), []);
  assert.deepEqual(classicScoringHelp({}), []);
  for (const strategyId of ['grandPrix', 'correctCount']) assert.equal(classicScoringHelp({ strategyId }).length, 2, strategyId);
});

test('Second Chance is Accuracy First\'s: it replays missed questions for recovery points, which the others do not pay', () => {
  // The reason, from the strategies: only Accuracy First pays recovery points.
  const recovery = (scoring) => scoring.scoreResponse({ isCorrect: true, gradeScore: 1, secondChance: true, missedOriginally: true, remainingMs: 5_000, totalMs: 10_000, elapsedMs: 5_000, previousStreak: 0 }).recoveryPoints;
  assert.ok(recovery(getScoringStrategy('accuracyFirst')) > 0, 'Accuracy First pays recovery points');
  assert.equal(recovery(grandPrixStrategy), 0);
  assert.equal(recovery(correctCountStrategy), 0);
  assert.equal(classicAllowsSecondChance('accuracyFirst'), true);
  assert.equal(classicAllowsSecondChance('grandPrix'), false);
  assert.equal(classicAllowsSecondChance('correctCount'), false);
  // What a room is created with: the teacher's choice under Accuracy First, off otherwise.
  assert.equal(classicSecondChanceFor({ strategyId: 'accuracyFirst', secondChanceMode: 'automatic' }), 'automatic');
  assert.equal(classicSecondChanceFor({ strategyId: 'accuracyFirst', secondChanceMode: 'off' }), 'off');
  assert.equal(classicSecondChanceFor({ strategyId: 'accuracyFirst', secondChanceMode: 'on' }), 'off', 'only the server\'s own word turns it on');
  assert.equal(classicSecondChanceFor({ strategyId: 'grandPrix', secondChanceMode: 'automatic' }), 'off');
  assert.equal(classicSecondChanceFor({ strategyId: 'correctCount', secondChanceMode: 'automatic' }), 'off');
  assert.match(CLASSIC_SECOND_CHANCE_NOTE, /off for Grand Prix and Correct Count/);
});

test('Play Again keeps the choice: a Grand Prix classic game replays as Grand Prix, at the default speed', () => {
  const room = {
    classId: 'c1', challengeMode: 'standard', roundCount: 10, requestedRoundCount: 10, roundSeconds: 45,
    scoringStrategyId: 'grandPrix', speedInfluencePercent: classicSpeedInfluence({ strategyId: 'grandPrix', speedInfluencePercent: 35 }),
  };
  assert.equal(replayRequestFromRoom(room).scoringStrategyId, 'grandPrix');
  assert.equal(replayExperienceFromRoom(room).speedInfluencePercent, 20);
  assert.equal(replayRequestFromRoom({ ...room, challengeMode: 'solverRace', scoringStrategyId: 'grandPrix' }).scoringStrategyId, 'grandPrix');
});

/* ----------------------------- the console is wired to it ----------------------------- */

const teacher = readFileSync(new URL('../../src/components/liveChallenge/LiveChallengeTeacher.jsx', import.meta.url), 'utf8');
const create = region(teacher, '  const create = async () => {', '  const control = async (key, action) => {', 'the create handler');
const classicBranch = region(create, "      if (warmupAssignmentId && warmupDeliveryMode === 'standard') {", '      return created;\n    });', 'the classic branch of create');
// The games with their own settings (Graph Feature Rush, Inequality Graphing
// Rush, Graph the Line) share one branch of create.
const gameBranch = region(create, '      if (ownSettingsGame) {', "      if (warmupAssignmentId && warmupDeliveryMode === 'standard') {", 'the own-settings branch of create');

test('the console sends the choice with a classic game\'s create request, and never with a rush or a line game', () => {
  assert.match(executableSource(classicBranch), /await createLiveChallenge\(\{[\s\S]*\.\.\.classicScoringRequest\(challengeMode, classicScoringId\),[\s\S]*\}\);/);
  assert.doesNotMatch(executableSource(gameBranch), /classicScoring/, 'a rush and a line game have their own scoring setting');
  // The state starts as the game it always was.
  assert.match(teacher, /const \[classicScoringId, setClassicScoringId\] = useState\('accuracyFirst'\);/);
  assert.match(teacher, /const classicStrategyId = resolveClassicScoring\(challengeMode, classicScoringId\);/);
});

test('the room\'s Second Chance is the teacher\'s under Accuracy First and off otherwise, and the control says why when it is off', () => {
  assert.match(classicBranch, /secondChanceMode: classicSecondChanceFor\(\{ strategyId: classicStrategyId, secondChanceMode \}\),/);
  const control = region(teacher, '}}>Second Chance\n', '</label>', 'the Second Chance control');
  assert.match(control, /value=\{classicSecondChanceFor\(\{ strategyId: classicStrategyId, secondChanceMode \}\)\}/);
  assert.match(control, /\sdisabled=\{!classicAllowsSecondChance\(classicStrategyId\)\}/);
  assert.match(control, /\saria-disabled=\{!classicAllowsSecondChance\(classicStrategyId\)\}/);
  assert.match(control, /classicAllowsSecondChance\(classicStrategyId\) \? '[^']*' : CLASSIC_SECOND_CHANCE_NOTE/);
});

test('the room\'s speed influence follows the strategy: the teacher\'s under Accuracy First, the default otherwise; a rush and a line send none', () => {
  assert.match(classicBranch, /configureLiveChallengeExperience\(\{\s*roomId: created\.roomId,[^}]*speedInfluencePercent: classicSpeedInfluence\(\{ strategyId: classicStrategyId, speedInfluencePercent \}\),\s*playerDisplayMode,\s*\}\)/);
  assert.match(gameBranch, /configureLiveChallengeExperience\(\{ roomId: created\.roomId, speedInfluencePercent: 0, playerDisplayMode \}\)/);
});

test('the setup panel offers the choice to the classic games only, hides speed influence outside Accuracy First, and says what a round pays', () => {
  const panelSource = region(teacher, "<label style={{ fontWeight: 800 }}>Player display", '<label style={{ fontWeight: 800, gridColumn: \'1 / -1\' }}>Challenge title', 'the classic settings');
  const choice = region(panelSource, '{!ownSettingsGame && <label style={{ fontWeight: 800 }}>Scoring', '</label>}', 'the Scoring choice');
  assert.match(choice, /value=\{classicStrategyId\} onChange=\{\(event\) => setClassicScoringId\(event\.target\.value\)\}/);
  assert.match(choice, /classicScoringOptions\(challengeMode\)\.map\(/);
  const speed = region(panelSource, '<label style={{ fontWeight: 800 }}>Speed influence', '</label>}', 'the Speed influence control');
  assert.match(panelSource, /\{!ownSettingsGame && classicShowsSpeedInfluence\(classicStrategyId\) && <label style=\{\{ fontWeight: 800 \}\}>Speed influence/);
  assert.match(speed, /setSpeedInfluencePercent/);
  // The card under the panel is told the strategy and whether Second Chance is on.
  assert.match(teacher, /\{!ownSettingsGame && <ScoringCompetitionCard roundSeconds=\{roundSeconds\} speedInfluencePercent=\{speedInfluencePercent\} strategyId=\{classicStrategyId\} \/>\}/);
  const card = region(teacher, 'function ScoringCompetitionCard(', '\nfunction AudioMixer(', 'the scoring card');
  assert.match(card, /const help = classicScoringHelp\(\{ strategyId \}\);\s*if \(help\.length\) \{/);
  // Changing a setting closes a dry run that no longer matches it.
  assert.match(teacher, /useEffect\(\(\) => \{ setDryRunOpen\(false\); \}, \[[^\]]*classicScoringId[^\]]*\]\);/);
});

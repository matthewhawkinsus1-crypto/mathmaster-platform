import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { getChallengeMode, modeScoringConfig, normalizeModeConfig, normalizeModeRoundCount, normalizeModeRoundSeconds, resolveModeScoringStrategy } from '../../functions/shared/liveChallengeModes.mjs';
import { evaluateRewardPolicy } from '../../functions/shared/liveChallengeRewardRules.mjs';
import { GRAPH_FEATURE_RUSH_PRESETS } from '../../functions/shared/graphFeatureRushConfig.mjs';
import { RUSH_MODE_ID } from '../../functions/shared/graphFeatureRushRules.mjs';
import { rushPlayingCount, rushRaceRows, rushRoundFacts, rushRoundResultRows, rushScoreUnit } from '../../src/platform/liveChallenge/rushStandingsModel.js';
import { changeRushSetup, defaultRushSetup, grandPrixLadder, rushCreateRequest, rushSetupFromPreset } from '../../src/platform/liveChallenge/rushSetupModel.js';
import { PASS_RULE_ID, buildChallengeRewardPolicy } from '../../src/platform/rewards/challengeRewardPolicy.js';

/*
 * GRAPH FEATURE RUSH ON EVERY SCREEN.
 *
 * The models behind the teacher's setup and the round results are tested as
 * functions. The screens themselves are .jsx, which node cannot render, so
 * their wiring is held by source contracts — each bound to the region that
 * does the work, each asserting what the screen must DO, each broken once to
 * prove it can fail (see AGENTS.md).
 */

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

/* ------------------------------ round results ----------------------------- */

const players = [
  { playerKey: 'a', alias: 'Ada', joined: true, score: 22, rushRound: 1, rushRoundCompleted: 9, lastRound: { roundIndex: 0, rank: 1, fieldSize: 4, completed: 11, accuracyPercent: 92, matchPointsAwarded: 12, participated: true } },
  { playerKey: 'b', alias: 'Bo', joined: true, score: 18, rushRound: 1, rushRoundCompleted: 12, lastRound: { roundIndex: 0, rank: 2, fieldSize: 4, completed: 8, accuracyPercent: 80, matchPointsAwarded: 9, participated: true } },
  { playerKey: 'c', alias: 'Cy', joined: true, score: 3, rushRound: 0, rushRoundCompleted: 30, lastRound: { roundIndex: 0, rank: null, fieldSize: 4, completed: 0, accuracyPercent: null, matchPointsAwarded: 0, participated: false } },
  { playerKey: 'd', alias: 'Di', joined: false, score: 0 },
];

test('the live race counts only the round now running, most graphs first', () => {
  const rows = rushRaceRows(players, 1);
  assert.deepEqual(rows.map((row) => [row.alias, row.completed]), [['Bo', 12], ['Ada', 9], ['Cy', 0]], 'last round\'s 30 is not this round\'s');
  assert.equal(rushPlayingCount(players, 1), 2);
  assert.ok(!rows.some((row) => row.alias === 'Di'), 'a player who left is not racing');
  // Ties read in a stable order.
  assert.deepEqual(rushRaceRows([{ playerKey: 'z', alias: 'Zed', joined: true }, { playerKey: 'y', alias: 'Amy', joined: true }], 0).map((row) => row.alias), ['Amy', 'Zed']);
});

test('a closed round\'s facts belong to that round, and the board ranks them', () => {
  assert.deepEqual(rushRoundFacts(players, 'a', 0), { roundIndex: 0, participated: true, completed: 11, accuracyPercent: 92, rank: 1, fieldSize: 4, matchPointsAwarded: 12 });
  assert.equal(rushRoundFacts(players, 'a', 1), null, 'last round\'s facts are not this round\'s');
  assert.equal(rushRoundFacts(players, 'c', 0).rank, null, 'no rank without taking part');
  assert.deepEqual(rushRoundResultRows(players, 0).map((row) => row.alias), ['Ada', 'Bo', 'Cy'], 'by rank, non-players last');
  assert.deepEqual(rushScoreUnit('grandPrix'), { short: 'pts', long: 'championship points', placement: true });
  assert.equal(rushScoreUnit('correctCount').placement, false);
});

/* --------------------------------- setup ---------------------------------- */

test('a course starts from its preset, and a preset stays named only while it still fits', () => {
  assert.equal(defaultRushSetup('algebra1').presetId, 'algebra1Quick');
  assert.equal(defaultRushSetup('algebra2').presetId, 'algebra2Mixed');
  const start = defaultRushSetup('algebra1');
  assert.equal(changeRushSetup(start, { roundCount: 5 }).presetId, 'algebra1Quick', 'rounds are not part of a preset\'s identity');
  const changed = changeRushSetup(start, { features: ['xIntercept'] });
  assert.equal(changed.presetId, 'custom');
  assert.equal(changeRushSetup(changed, { features: [...start.features].reverse() }).presetId, 'custom', 'a custom setup does not drift back to a name');
  assert.equal(changeRushSetup(start, { families: [...start.families].reverse() }).presetId, 'algebra1Quick', 'order does not matter');
});

test('every preset becomes a request the server accepts unchanged', () => {
  const mode = getChallengeMode(RUSH_MODE_ID);
  for (const preset of GRAPH_FEATURE_RUSH_PRESETS) {
    const setup = rushSetupFromPreset(preset);
    const request = rushCreateRequest(setup);
    assert.equal(request.challengeMode, RUSH_MODE_ID);
    const config = normalizeModeConfig(mode, request).graphFeatureRush;
    assert.equal(config.presetId, preset.id, `${preset.id} survives normalization`);
    assert.equal(normalizeModeRoundCount(mode, request.roundCount), preset.roundCount);
    assert.equal(normalizeModeRoundSeconds(mode, request.roundSeconds), preset.roundSeconds);
    assert.equal(resolveModeScoringStrategy(mode, request.scoringStrategyId), preset.scoringStrategyId);
    assert.ok(!('rewardPolicy' in request), 'no reward choice sends no policy: the default rules apply');
  }
  // Grand Prix in a rush scales to the class.
  assert.equal(modeScoringConfig(getChallengeMode(RUSH_MODE_ID), 'grandPrix', {}).placementCurve, 'field');
});

test('the Grand Prix ladder a teacher reads is the field curve the server pays', () => {
  assert.deepEqual(grandPrixLadder(2), [{ place: 1, points: 12 }, { place: 2, points: 3 }]);
  assert.deepEqual(grandPrixLadder(4).map((row) => row.points), [12, 8, 6, 3]);
  const class24 = grandPrixLadder(24);
  assert.deepEqual(class24.map((row) => row.place), [1, 2, 3, 12, 24]);
  assert.equal(class24[0].points, 12);
  assert.equal(class24.at(-1).points, 3);
});

test('a rush offers the same Rewards choice as every Live Challenge', () => {
  // The shared Rewards choice (Practice Pass for the top places) reads the
  // rush's final ranking like any match's: placement, ties sharing a place.
  const podium = buildChallengeRewardPolicy({ passPlaces: 3, passExpiryDays: 14, championBadge: false });
  const standings = [
    { studentId: 's1', joined: true, rank: 1, roundsAnswered: 3, answeredRounds: [0, 1, 2] },
    { studentId: 's2', joined: true, rank: 2, roundsAnswered: 3, answeredRounds: [0, 1, 2] },
    { studentId: 's3', joined: true, rank: 2, roundsAnswered: 2, answeredRounds: [1, 2] },
    { studentId: 's4', joined: true, rank: 4, roundsAnswered: 3, answeredRounds: [0, 1, 2] },
    { studentId: 's5', joined: true, rank: 3, roundsAnswered: 0, answeredRounds: [] },
  ];
  const awards = evaluateRewardPolicy({ matchResult: { roomId: 'r', scheduledRoundCount: 3, standings }, policy: podium });
  assert.deepEqual(awards.filter((award) => award.ruleId === PASS_RULE_ID).map((award) => award.studentId), ['s1', 's2', 's3']);
  const create = rushCreateRequest(defaultRushSetup('algebra1'), { rewardPolicy: podium });
  assert.equal(create.rewardPolicy, podium);
  assert.ok(!('rewardPolicy' in rushCreateRequest(defaultRushSetup('algebra1'), { rewardPolicy: buildChallengeRewardPolicy({}) })), 'no choice, no policy');
});

/* --------------------------- the student's screen -------------------------- */

test('the student screen plays a rush on its own surface, loaded only for a rush', () => {
  const student = read('../../src/components/liveChallenge/LiveChallengeStudent.jsx');
  // Lazy: a classic game never downloads it; a rush lobby fetches it early.
  assert.match(student, /const loadGraphFeatureRushRound = \(\) => import\('\.\/GraphFeatureRushRound\.jsx'\);/);
  assert.match(student, /const GraphFeatureRushRound = lazy\(loadGraphFeatureRushRound\);/);
  assert.match(region(student, 'useEffect(() => {\n    if (rushRoom)', '}, [rushRoom]);', 'rush preload'), /loadGraphFeatureRushRound\(\)/);
  // An open rush round renders the rush; the classic round never renders for a rush room.
  const rushRender = region(student, '{rushRoundOpen && room.currentQuestion', '</Suspense>', 'rush round render');
  assert.match(rushRender, /<GraphFeatureRushRound\b/);
  assert.match(rushRender, /serverNowAtRender: Date\.now\(\) \+ clock\.offsetMs/, 'the round is timed on the calibrated clock');
  assert.match(student, /\{!rushRoom && room\.status === 'running' && room\.currentQuestion[^\n]*\n\s*<ChallengeRound/);
});

test('the class\'s taps do not wake every student\'s screen during a rush round', () => {
  const student = read('../../src/components/liveChallenge/LiveChallengeStudent.jsx');
  const listener = region(student, '  useEffect(() => {\n    if (!roomId) { setPlayers([]); return undefined; }', '}, [roomId, rushRoundOpen]);', 'standings listener');
  // Paused while a rush round is open, resumed (fresh) when it closes.
  assert.ok(listener.indexOf('if (rushRoundOpen) return undefined;') > 0 && listener.indexOf('if (rushRoundOpen) return undefined;') < listener.indexOf('watchLiveChallengePlayers('), 'the pause comes before the subscription');
  assert.match(listener, /setPlayersFresh\(false\)[\s\S]*setPlayersFresh\(true\)/);
  assert.match(student, /<RushRoundResults [^>]*fresh=\{playersFresh\}/);
  // With the listener paused, a successful join must not be asked again.
  const join = region(student, 'if (joinRefusedForRef.current === roomId', '.finally(', 'automatic join');
  assert.match(join, /joinedRoomRef\.current === roomId\) return;/);
  assert.match(join, /\.then\(\(\) => \{ joinedRoomRef\.current = roomId; \}\)/);
});

test('the rush round: refs for the tap handler, one clock anchor, a persisted queue', () => {
  const round = read('../../src/components/liveChallenge/GraphFeatureRushRound.jsx');
  // The tap handler is memoized for the graph; reading `phase` state there
  // once refused every tap of the round (it saw "loading" forever).
  const accepting = region(round, 'const accepting = () =>', 'const act =', 'input gate');
  assert.match(accepting, /phaseRef\.current === 'ready'/);
  assert.doesNotMatch(executableSource(accepting), /\bphase ===/);
  // The deadline is anchored once, on the monotonic clock.
  assert.match(region(round, 'const [timing] = useState(() => {', '});', 'timing anchor'), /monotonicRoundOrigin\(/);
  // Every change to the queue is stored before anything is sent.
  assert.match(region(round, 'const commit = useCallback(', '}, [queueKey]);', 'commit'), /writeQueue\(queueKey, next\.queue\)/);
  // At the buzzer the queue goes at once; a refusal is dropped, not retried.
  assert.match(round, /useEffect\(\(\) => \{\n\s+if \(over\) flushRef\.current\(\);\n\s+\}, \[over\]\);/);
  const failure = region(round, '} catch (error) {\n      if (!mountedRef.current) return;\n      const code', '} finally {', 'send failure');
  assert.match(failure, /if \(isFinalRefusal\(error\) \|\| timeIsUp\) \{[\s\S]*dropQueue\(/);
  assert.match(failure, /flushTimerRef\.current = window\.setTimeout\(\(\) => flushRef\.current\(\), retryDelayRef\.current\)/, 'anything else is retried');
});

/* --------------------------- the teacher's screens ------------------------- */

test('the teacher console offers the rush and creates it with its own settings', () => {
  const teacher = read('../../src/components/liveChallenge/LiveChallengeTeacher.jsx');
  assert.match(teacher, /<option value=\{RUSH_MODE_ID\}>Graph Feature Rush<\/option>/);
  assert.match(teacher, /const GraphFeatureRushSetup = lazy\(\(\) => import\('\.\/GraphFeatureRushSetup\.jsx'\)\);/);
  const create = region(teacher, 'if (rushMode) {', 'if (warmupAssignmentId && warmupDeliveryMode', 'rush create');
  assert.match(create, /if \(rushProblem\) throw new Error\(rushProblem\);/, 'an impossible game is not sent');
  assert.match(create, /rushCreateRequest\(rushSetup, \{ rewardPolicy: buildChallengeRewardPolicy\(rewardChoice\) \}\)/);
  // The Rewards choice is shown for every game type, the rush included.
  assert.match(teacher, /\{!rushMode && <ScoringCompetitionCard [^\n]*\n\s*<ChallengeRewardSettings choice=\{rewardChoice\} onChange=\{setRewardChoice\} \/>/);
  assert.doesNotMatch(executableSource(create), /assignmentId/, 'a rush is never linked to a Warm-Up');
  assert.match(teacher, /\{!rushMode && <label style=\{\{ fontWeight: 800 \}\}>Run as a Warm-Up/);
});

test('a rush round closes itself after its deadline, and moves on only once closed', () => {
  const teacher = read('../../src/components/liveChallenge/LiveChallengeTeacher.jsx');
  assert.match(teacher, /export const RUSH_AUTO_CLOSE_DELAY_MS = 1_500;/);
  const autoClose = region(teacher, 'const autoClosedRef = useRef', '}, [rushRoom, room?.status', 'auto close');
  assert.match(autoClose, /if \(!rushRoom \|\| room\?\.status !== 'running' \|\| room\?\.roundState === 'closed' \|\| !hasRoundDeadline\) return;/);
  assert.match(autoClose, /if \(serverNow < roundEndsAtMs \+ RUSH_AUTO_CLOSE_DELAY_MS\) return;/);
  assert.match(autoClose, /control\('close', closeLiveChallengeRound\)/);
  assert.match(teacher, /\|\| \(!rushRoom && challengeCanAdvance\(\{/, 'a rush never skips its own results');
});

test('the projector shows the race, never a graph or an answer', () => {
  const projector = read('../../src/components/liveChallenge/LiveChallengeArenaProjector.jsx');
  const host = read('../../src/components/liveChallenge/GraphFeatureRushHost.jsx');
  assert.match(projector, /room\?\.challengeMode === RUSH_MODE_ID && <RushRunningView /);
  assert.match(projector, /\{projectorShowsClosingThreshold\(room\) && <label/);
  assert.equal(getChallengeMode(RUSH_MODE_ID).capabilities.closingThreshold, false);
  for (const [name, source] of [['projector', projector], ['host', host]]) {
    const code = executableSource(source);
    assert.doesNotMatch(code, /GraphFeatureRushGraph|graphFeatureGenerator|\.targets\b|seed/, `${name} must not reach for a graph or its answers`);
  }
});

test('the client service and the bridge harness expose the rush callables', () => {
  const service = read('../../src/platform/liveChallenge/liveChallengeService.js');
  const bridge = read('../browser/emulator/liveChallengeBridgeService.js');
  for (const name of ['getGraphFeatureRushRound', 'submitGraphFeatureRushAttempts', 'previewGraphFeatureRush']) {
    assert.match(service, new RegExp(`export const ${name} = call\\('${name}'\\);`));
    assert.match(bridge, new RegExp(`export const ${name} = call\\('${name}'\\);`));
  }
});

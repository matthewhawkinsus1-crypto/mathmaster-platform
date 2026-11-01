import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { MAX_QUESTIONS_PER_ROUND } from '../../functions/shared/liveChallengeResponses.mjs';
import { ROUND_STRUCTURE, getChallengeMode, listChallengeModes, normalizeModeConfig, normalizeModeRoundCount, normalizeModeRoundSeconds, resolveModeScoringStrategy, roundStructureFor } from '../../functions/shared/liveChallengeModes.mjs';
import { LINE_GRAPH_PRESETS, LINE_ROUND_LIMITS, lineGraphConfigProblem, normalizeLineGraphConfig, suggestedLineRoundSeconds } from '../../functions/shared/lineGraphConfig.mjs';
import { LINE_GRAPH_FORMAT, LINE_GRAPH_FORMAT_IDS, LINE_GRAPH_MODE_ID, LINE_GRAPH_MODE_IDS, lineGraphModeOfFormat } from '../../functions/shared/lineGraphRules.mjs';
import { RUSH_MODE_ID } from '../../functions/shared/graphFeatureRushRules.mjs';
import {
  CHALLENGE_STAGE,
  QUESTION_SET_GAME,
  hostPrimaryAction,
  questionSetGameOf,
  roomRoundsEndOnTheClock,
  roomRunsQuestionSets,
  roundCloseDue,
} from '../../src/platform/liveChallenge/challengeShellModel.js';
import { SOLUTION_STATE, roundSolutionState } from '../../src/platform/liveChallenge/challengeSolutionModel.js';
import { replayExperienceFromRoom, replayRequestFromRoom, replaySummary } from '../../src/platform/liveChallenge/challengeReplayModel.js';
import { raceRoundFinished, rushRaceRows } from '../../src/platform/liveChallenge/rushStandingsModel.js';
import { roundWaitingOnExtendedTime } from '../../src/platform/liveChallenge/liveChallengeProjectorModel.js';
import {
  LINE_GRAPH_GAME,
  applyLinePreset,
  changeLineFormat,
  changeLineSetup,
  defaultLineSetup,
  lineCreateRequest,
  lineSetupConfig,
  lineSetupProblem,
} from '../../src/platform/liveChallenge/lineGraphSetupModel.js';

/*
 * GRAPH THE LINE ON EVERY SCREEN.
 *
 * The models behind the screens are tested as functions: the teacher's setup
 * and the request it sends, Play Again, which rooms a screen treats as a
 * question-set game, when a round may close early, what a solution panel says.
 * The screens are .jsx, which node cannot render, so their wiring is held by
 * source contracts — each bound to the region that does the work, each
 * asserting what the screen must DO, each broken once to prove it can fail
 * (AGENTS.md).
 */

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

/* --------------------------------- setup ---------------------------------- */

test('every preset in every format becomes a request the server accepts unchanged', () => {
  for (const format of LINE_GRAPH_FORMAT_IDS) {
    for (const preset of LINE_GRAPH_PRESETS) {
      const setup = applyLinePreset(defaultLineSetup('algebra1', format), preset.id);
      assert.equal(lineSetupProblem(setup), null, `${format}/${preset.id}`);
      const request = lineCreateRequest(setup);
      const mode = getChallengeMode(request.challengeMode);
      assert.equal(mode.id, lineGraphModeOfFormat(format), 'the format is the mode');
      const normalized = normalizeModeConfig(mode, request).lineGraph;
      assert.deepEqual(
        { ...normalized, format: undefined },
        { ...normalizeLineGraphConfig(lineSetupConfig(setup), { format }), format: undefined },
      );
      assert.equal(normalized.presetId, preset.id, `${preset.id} survives normalization`);
      assert.equal(normalizeModeRoundCount(mode, request.roundCount), request.roundCount, 'the rounds are the mode\'s to allow');
      assert.equal(normalizeModeRoundSeconds(mode, request.roundSeconds), request.roundSeconds);
      assert.equal(resolveModeScoringStrategy(mode, request.scoringStrategyId), 'grandPrix');
      assert.ok(!('rewardPolicy' in request), 'no reward choice sends no policy');
    }
  }
  assert.equal(defaultLineSetup('algebra1').presetId, 'allThreeForms');
  assert.equal(defaultLineSetup('algebra2').presetId, 'graphAndName');
  const policy = { rules: [] };
  assert.equal(lineCreateRequest(defaultLineSetup('algebra1'), { rewardPolicy: policy }).rewardPolicy, policy);
});

test('a format brings its own rounds, time and default for the same equations', () => {
  const classic = defaultLineSetup('algebra1', LINE_GRAPH_FORMAT.CLASSIC);
  assert.equal(classic.sameEquations, true, 'Classic: the class graphs one line together');
  const sprint = changeLineFormat(classic, LINE_GRAPH_FORMAT.SPRINT);
  assert.equal(sprint.sameEquations, false);
  assert.equal(sprint.roundCount, LINE_ROUND_LIMITS.sprint.defaultRounds);
  assert.equal(sprint.roundSeconds, suggestedLineRoundSeconds('sprint', { sprintLength: sprint.sprintLength }));
  assert.equal(changeLineFormat(sprint, LINE_GRAPH_FORMAT.SPRINT), sprint, 'the same format changes nothing');
  assert.deepEqual(sprint.forms, classic.forms, 'the questions carry over');
  // A Sprint's suggested time follows its length — until the teacher sets one.
  const longer = changeLineSetup(sprint, { sprintLength: 20 });
  assert.equal(longer.roundSeconds, suggestedLineRoundSeconds('sprint', { sprintLength: 20 }));
  const chosen = changeLineSetup({ ...sprint, roundSeconds: 90 }, { sprintLength: 20 });
  assert.equal(chosen.roundSeconds, 90, 'a time the teacher chose stays');
  assert.ok(!('sprintLength' in lineSetupConfig(classic)), 'only a Sprint has a length');
});

test('a preset stays named only while it still fits, and an impossible game says why', () => {
  const start = defaultLineSetup('algebra1');
  assert.equal(changeLineSetup(start, { roundCount: 5 }).presetId, 'allThreeForms', 'rounds are not part of a preset');
  const custom = changeLineSetup(start, { forms: ['standard'] });
  assert.equal(custom.presetId, 'custom');
  assert.equal(changeLineSetup(start, { forms: [...start.forms].reverse() }).presetId, 'allThreeForms', 'order does not matter');
  const none = changeLineSetup(start, { forms: [] });
  assert.equal(lineSetupProblem(none), lineGraphConfigProblem({ forms: [] }, { format: 'classic' }), 'the server\'s own words');
  assert.match(lineSetupProblem(none), /at least one form/);
});

/* ---------------------------- the shell model ---------------------------- */

test('the client names question-set games in one place, held to the registry', () => {
  for (const mode of listChallengeModes()) {
    const questionSet = roundStructureFor(mode).id === ROUND_STRUCTURE.QUESTION_SET;
    assert.equal(roomRunsQuestionSets({ challengeMode: mode.id }), questionSet, mode.id);
    assert.equal(questionSetGameOf({ challengeMode: mode.id }) !== null, questionSet, mode.id);
    // A round holding the engine's largest pool outlasts everyone: it ends on the clock.
    assert.equal(roomRoundsEndOnTheClock({ challengeMode: mode.id }), questionSet && mode.questionSpecs.length === MAX_QUESTIONS_PER_ROUND, mode.id);
  }
  assert.equal(questionSetGameOf({ challengeMode: RUSH_MODE_ID }), QUESTION_SET_GAME.GRAPH_FEATURE_RUSH);
  LINE_GRAPH_MODE_IDS.forEach((id) => assert.equal(questionSetGameOf({ challengeMode: id }), QUESTION_SET_GAME.LINE_GRAPH));
  assert.equal(questionSetGameOf(null), null);
  assert.equal(LINE_GRAPH_GAME, 'lineGraph');
  assert.ok(!LINE_GRAPH_MODE_IDS.includes(LINE_GRAPH_GAME), 'the menu value is never itself a mode');
});

test('a Classic or Sprint round closes once everyone has finished; a Rush only at its deadline', () => {
  const room = (challengeMode) => ({ status: 'running', roundState: 'open', challengeMode, currentRound: 0, roundCount: 3, startsAt: 1_000, endsAt: 121_000 });
  for (const mode of [LINE_GRAPH_MODE_ID.CLASSIC, LINE_GRAPH_MODE_ID.SPRINT]) {
    const due = roundCloseDue({ room: room(mode), joinedCount: 3, finishedCount: 3, allFinishedSinceMs: 40_000 });
    assert.equal(due.reason, 'allFinished', mode);
    assert.equal(roundCloseDue({ room: room(mode), joinedCount: 3, finishedCount: 2, allFinishedSinceMs: 40_000 }).reason, 'deadline', `${mode}: not until everyone has`);
    const hint = hostPrimaryAction({ room: room(mode), stage: CHALLENGE_STAGE.ROUND_ACTIVE, joinedCount: 3, finishedCount: 1 }).hint;
    assert.match(hint, /everyone has finished/, `${mode}: the host is told it may end early`);
    assert.doesNotMatch(hint, /until time runs out\. /);
    assert.match(hostPrimaryAction({ room: room(mode), stage: CHALLENGE_STAGE.ROUND_ACTIVE, joinedCount: 3, finishedCount: 3 }).hint, /Everyone has finished/);
  }
  const rush = roundCloseDue({ room: room(LINE_GRAPH_MODE_ID.RUSH), joinedCount: 3, finishedCount: 3, allFinishedSinceMs: 40_000 });
  assert.equal(rush.reason, 'deadline', 'a Rush outlasts everyone');
  assert.match(hostPrimaryAction({ room: room(LINE_GRAPH_MODE_ID.RUSH), stage: CHALLENGE_STAGE.ROUND_ACTIVE }).hint, /until time runs out/);
});

test('who has finished comes from each public row, for the round now running', () => {
  const players = [
    { playerKey: 'a', alias: 'Ada', joined: true, rushRound: 1, rushRoundCompleted: 5, rushRoundFinished: true },
    { playerKey: 'b', alias: 'Bo', joined: true, rushRound: 1, rushRoundCompleted: 3, rushRoundFinished: false },
    { playerKey: 'c', alias: 'Cy', joined: true, rushRound: 0, rushRoundCompleted: 5, rushRoundFinished: true },
  ];
  assert.equal(raceRoundFinished(players[0], 1), true);
  assert.equal(raceRoundFinished(players[2], 1), false, 'last round\'s finish is not this round\'s');
  assert.deepEqual(rushRaceRows(players, 1).map((row) => [row.alias, row.finished]), [['Ada', true], ['Bo', false], ['Cy', false]]);
});

/* ----------------------------- the other models ---------------------------- */

test('a question-set round is never "held for a Second Chance": its line comes at its close or not at all', () => {
  const closed = { status: 'running', roundState: 'closed', currentRound: 0, revealedSolutionRounds: [] };
  for (const challengeMode of [...LINE_GRAPH_MODE_IDS, RUSH_MODE_ID]) {
    assert.equal(roundSolutionState({ room: { ...closed, challengeMode }, roundIndex: 0, solution: undefined }), SOLUTION_STATE.NONE, challengeMode);
  }
  const revealed = { ...closed, challengeMode: LINE_GRAPH_MODE_ID.CLASSIC, revealedSolutionRounds: [0] };
  assert.equal(roundSolutionState({ room: revealed, roundIndex: 0, solution: undefined }), SOLUTION_STATE.LOADING);
  assert.equal(roundSolutionState({ room: revealed, roundIndex: 0, solution: { available: true, solutionReview: { headline: 'h' }, lineGraph: {} } }), SOLUTION_STATE.READY);
  // A bank round still waits for a Second Chance replay.
  assert.equal(roundSolutionState({ room: { ...closed, challengeMode: 'standard' }, roundIndex: 0 }), SOLUTION_STATE.HELD);
});

test('past the buzzer, a Classic or Sprint round waiting on extra time says "still finishing"; a Rush never waits', () => {
  // Extra time after the buzzer (liveChallengeAccommodations.mjs): the round
  // is held for a student finishing their set, and the screens say only that
  // someone is — never who. A Rush (and Graph Feature Rush) has no extra time.
  const held = (challengeMode) => roundWaitingOnExtendedTime({ room: { challengeMode, extendedTimeInPlay: true }, locked: true, joinedCount: 3, answeredCount: 1 });
  assert.equal(held(LINE_GRAPH_MODE_ID.CLASSIC), true);
  assert.equal(held(LINE_GRAPH_MODE_ID.SPRINT), true);
  assert.equal(held(LINE_GRAPH_MODE_ID.RUSH), false);
  assert.equal(held(RUSH_MODE_ID), false);
  // Not before the buzzer, not when nobody has extra time, not once everyone has finished.
  assert.equal(roundWaitingOnExtendedTime({ room: { challengeMode: LINE_GRAPH_MODE_ID.SPRINT, extendedTimeInPlay: true }, locked: false, joinedCount: 3, answeredCount: 1 }), false);
  assert.equal(roundWaitingOnExtendedTime({ room: { challengeMode: LINE_GRAPH_MODE_ID.SPRINT, extendedTimeInPlay: false }, locked: true, joinedCount: 3, answeredCount: 1 }), false);
  assert.equal(roundWaitingOnExtendedTime({ room: { challengeMode: LINE_GRAPH_MODE_ID.SPRINT, extendedTimeInPlay: true }, locked: true, joinedCount: 3, answeredCount: 3 }), false);
});

test('Play Again replays a Graph the Line room with every one of its settings', () => {
  for (const format of LINE_GRAPH_FORMAT_IDS) {
    const config = normalizeLineGraphConfig({ presetId: 'graphAndName', nameStyle: 'build', triesPerItem: 0, sprintLength: 15, showMethod: true, specialLines: true }, { format });
    const room = { classId: 'c1', classPeriod: '2', courseId: 'algebra1', title: 'T', challengeMode: lineGraphModeOfFormat(format), roundCount: 2, roundSeconds: 120, scoringStrategyId: 'correctCount', standingsDisplay: 'full', lineGraph: { config, generatorVersion: 1 } };
    const request = replayRequestFromRoom(room);
    const mode = getChallengeMode(request.challengeMode);
    assert.deepEqual(normalizeModeConfig(mode, request).lineGraph, config, `${format}: the same game again`);
    assert.equal(request.triesPerItem, undefined, 'settings travel inside lineGraph');
    assert.equal(request.lineGraph.triesPerItem, 0, '"until right" survives (0 is not missing)');
    assert.ok(!('standardCode' in request) && !('assignmentId' in request), 'never a bank or Warm-Up field');
    assert.equal(replayExperienceFromRoom(room).speedInfluencePercent, 0);
    assert.match(replaySummary(room), /^Graph the Line/);
  }
  assert.equal(replayRequestFromRoom({ classId: 'c1', challengeMode: LINE_GRAPH_MODE_ID.SPRINT }), null, 'a room without its settings is not guessed at');
});

/* ------------------------------ the student ------------------------------ */

test('the student screen plays Graph the Line on its own surface, loaded only for its rooms', () => {
  const student = read('../../src/components/liveChallenge/LiveChallengeStudent.jsx');
  assert.match(student, /const loadLineGraphRound = \(\) => import\('\.\/LineGraphRound\.jsx'\);/);
  assert.match(student, /const LineGraphRound = lazy\(loadLineGraphRound\);/);
  assert.match(region(student, 'useEffect(() => {\n    if (lineRoom)', '}, [lineRoom]);', 'line preload'), /loadLineGraphRound\(\)/);
  assert.match(student, /const lineRoom = questionSetGame === QUESTION_SET_GAME\.LINE_GRAPH;/);
  assert.match(student, /const lineRoundOpen = lineRoom && questionSetRoundOpen;/);
  const render = region(student, '{lineRoundOpen && room.currentQuestion', '</Suspense>', 'line round render');
  assert.match(render, /<LineGraphRound\b/);
  assert.match(render, /serverNowAtRender: Date\.now\(\) \+ clock\.offsetMs/, 'timed on the calibrated clock');
  assert.match(render, /key=\{`\$\{room\.roomId\}-\$\{room\.currentRound\}-\$\{room\.roundVersion\}`\}/, 'one mount per round');
  // The results and final cards count lines.
  assert.match(student, /<StudentRoundResults [^\n]*lineRound=\{lineRoom\}/);
  assert.match(region(student, '<StudentFinalCard', '/>', 'final card'), /lines=\{lineRoom\}/);
});

test('the line round: refs at the input gate, one clock anchor, a stored queue, and the server\'s word', () => {
  const round = read('../../src/components/liveChallenge/LineGraphRound.jsx');
  const accepting = region(round, 'const accepting = () =>', 'const act =', 'input gate');
  assert.match(accepting, /phaseRef\.current === 'ready'/);
  assert.doesNotMatch(executableSource(accepting), /\bphase ===/, 'the memoized handler never reads stale state');
  assert.match(region(round, 'const [timing] = useState(() => {', '});', 'timing anchor'), /monotonicRoundOrigin\(/);
  assert.match(region(round, 'const commit = useCallback(', '}, [queueKey]);', 'commit'), /writeQueue\(queueKey, next\.queue\)/);
  assert.match(round, /useEffect\(\(\) => \{\n\s+if \(over\) flushRef\.current\(\);\n\s+\}, \[over\]\);/, 'at the buzzer the queue goes at once');
  assert.match(round, /useEffect\(\(\) => \{\n\s+if \(finished\) flushRef\.current\(\);\n\s+\}, \[finished\]\);/, 'a finished set goes at once: the round may close early');
  const failure = region(round, '} catch (error) {\n      if (!mountedRef.current) return;\n      const code', '} finally {', 'send failure');
  assert.match(failure, /if \(isFinalRefusal\(error\) \|\| timeIsUp\) \{[\s\S]*dropQueue\(/);
  assert.match(failure, /rushRefusalIsTimeUp\(code, timing\.endMono - performance\.now\(\), error\?\.details\?\.reason\)/);
  assert.match(failure, /flushTimerRef\.current = window\.setTimeout\(\(\) => flushRef\.current\(\), retryDelayRef\.current\)/, 'anything else is retried');
  // Skip is a Sprint's and a Rush's; a Classic line is worked until right or shown.
  assert.match(round, /const canSkip = format !== LINE_GRAPH_FORMAT\.CLASSIC;/);
  assert.match(round, /\{canSkip && <button [^\n]*onClick=\{onSkip\}>Skip<\/button>\}/);
  // A line is recorded only from the canvas's completed line.
  assert.match(round, /onLine=\{onLine\}/);
  assert.match(region(round, 'const onLine = useCallback(', '}, [commit, scheduleFlush]);', 'onLine'), /recordLine\(current, \{ \.\.\.context, points \}\)/);
});

test('the canvas checks a line only when a point is let go, never mid-drag', () => {
  const canvas = executableSource(read('../../src/components/liveChallenge/LineGraphCanvas.jsx'));
  const settle = region(canvas, 'const settle = ({ draft: next, outcome }) => {', '\n  };', 'release outcome');
  assert.match(settle, /if \(outcome === DRAFT_OUTCOME\.LINE\) \{[\s\S]*onLine\?\.\(next\.points\);/, 'a completed or changed line is checked');
  assert.equal((canvas.match(/onLine\?\.\(/g) || []).length, 1, 'and nowhere else');
  assert.match(region(canvas, 'const handlePointerUp = (event) => {', '\n  };', 'pointer up'), /settle\(releaseDraft\(draftRef\.current\)\);/);
  const move = region(canvas, 'const handlePointerMove = (event) => {', '\n  };', 'pointer move');
  assert.doesNotMatch(move, /settle\(|onLine|releaseDraft/, 'a drag only moves the point');
  const down = region(canvas, 'const handlePointerDown = (event) => {', '\n  };', 'pointer down');
  assert.match(down, /setPointerCapture/);
  assert.doesNotMatch(down, /settle\(|onLine|releaseDraft/, 'a press only picks up or starts a point');
  assert.match(canvas, /touchAction: 'none'/, 'a vertical drag never scrolls the page and drops the point');
});

test('the canvas floats its labels and badge where the model places them, and draws its own keyboard ring', () => {
  const canvas = executableSource(read('../../src/components/liveChallenge/LineGraphCanvas.jsx'));
  // Placement is the model's (lineGraphModel.js, tested there), not the component's.
  const badge = region(canvas, 'function VerdictBadge(', '\n}\n', 'the badge');
  assert.match(badge, /pointBox\(at\), pointLabelSpot\(\{ at, side, text: formatPoint\(point\) \}\)\.box/, 'it keeps off each point and its coordinates');
  assert.match(badge, /verdictBadgeSpot\(\{ from, to, avoid, side \}\)/);
  assert.match(region(canvas, 'function PointMark(', '\n}\n', 'a placed point'), /const spot = pointLabelSpot\(\{ at, side, text \}\);/, 'the coordinates it keeps off are where they are drawn');
  assert.match(region(canvas, 'function HeldLabel(', '\n}\n', 'the held label'), /heldLabelSpot\(\{ at: toScreen\(view, side, point\), side, holder, width, height: 30 \}\)/);
  assert.match(region(canvas, '<VerdictBadge', '/>', 'the badge in use'), /points=\{points\}/);
  // The page's :focus-visible ring would stay on through a mouse or a finger
  // after the focus given when play begins; the grid's own ring does not.
  const svg = region(canvas, '<svg', '>\n', 'the grid');
  assert.match(svg, /data-focus-ring="own"/);
  assert.match(svg, /outline: cursorVisible \? '3px solid var\(--mm-focus\)' : 'none'/);
  assert.match(region(canvas, 'const handlePointerDown = (event) => {', '\n  };', 'pointer down'), /setCursorVisible\(false\);/, 'a press takes the ring away');
  assert.match(svg, /onFocus=\{\(\) => setCursorVisible\(drawing && lastModality === 'keyboard'\)\}/, 'a keyboard student sees it on arrival');
  const css = read('../../src/index.css');
  assert.match(region(css, 'body :is(', '}', 'the global focus ring'), /\):not\(\[data-focus-ring="container"\]\):not\(\[data-focus-ring="own"\]\):focus-visible \{/);
});

// A new item resets the keyboard cursor, a held point and what was announced.
// As a passive effect that reset ran a moment AFTER the commit, so an arrow
// pressed in that moment was moved and announced by its handler and then undone
// by the late effect: the first key on a new item said nothing and moved
// nothing. The Rush graph had the same race (CI06, graphFeatureRushScreens
// .test.mjs). A layout effect has run before the browser can deliver any key.
test('the canvas resets its cursor, held point and announcement before a key can reach the new item', () => {
  const canvas = executableSource(read('../../src/components/liveChallenge/LineGraphCanvas.jsx'));
  const reset = region(canvas, 'useLayoutEffect(() => {', '[resetKey, view]);', 'the new-item reset');
  assert.match(reset, /pointerRef\.current = null;/, 'a press still held from the last item is let go');
  assert.match(reset, /setDraft\(emptyDraft\(\)\);/, 'the grid starts empty');
  assert.match(reset, /setCursor\(initialLineCursor\(view\)\);/, 'the cursor goes back to its start');
  assert.match(reset, /setAnnouncement\(''\);/, 'what was announced is cleared');
  assert.match(canvas, /import \{[^}]*\buseLayoutEffect\b[^}]*\} from 'react';/);
  // That is the only place the cursor goes back to its start: a passive effect
  // doing it as well would run late and undo a key.
  assert.equal((canvas.match(/setCursor\(initialLineCursor\(view\)\)/g) || []).length, 1, 'no passive effect resets the cursor');
});

/* ------------------------------ the teacher ------------------------------ */

// One switch: the modes' own teacherSelectable. Launched, every teacher's
// console offers the game; set back to a preview, the server launches it for
// the administrator only and the console offers it to the administrator alone.
test('the console offers Graph the Line to every teacher once its modes are launched, and to the administrator alone in a preview', () => {
  const teacher = read('../../src/components/liveChallenge/LiveChallengeTeacher.jsx');
  assert.match(teacher, /const LINE_GRAPH_LAUNCHED = LINE_GRAPH_MODE_IDS\.every\(\(id\) => getChallengeMode\(id\)\.teacherSelectable\);/);
  assert.match(teacher, /const lineGraphOffered = LINE_GRAPH_LAUNCHED \|\| isRootAdminEmail\(signedInEmail\);/);
  assert.match(teacher, /\{lineGraphOffered && <option value=\{LINE_GRAPH_GAME\}>\{LINE_GRAPH_LAUNCHED \? 'Graph the Line' : 'Graph the Line \(preview\)'\}<\/option>\}/);
  assert.match(teacher, /\{LINE_GRAPH_LAUNCHED \? '' : ' In preview: only you can launch it\.'\}/);
  assert.match(teacher, /const lineMode = lineGraphOffered && challengeMode === LINE_GRAPH_GAME;/);
  assert.match(teacher, /import \{ isRootAdminEmail \} from '\.\.\/\.\.\/\.\.\/functions\/shared\/rolePolicy\.mjs';/);
  LINE_GRAPH_MODE_IDS.forEach((id) => assert.equal(getChallengeMode(id).teacherSelectable, true, `${id} is launched`));
  // The server's gate stays for any mode that is not offered yet.
  const server = executableSource(read('../../functions/index.js'));
  assert.match(server, /if \(!mode\.teacherSelectable && !authLib\.isRootAdminEmail\(teacherEmail\)\) \{\s*throw new HttpsError\("failed-precondition", `\$\{mode\.label\} is still in preview/);
  assert.match(teacher, /const LineGraphSetup = lazy\(\(\) => import\('\.\/LineGraphSetup\.jsx'\)\);/);
  assert.match(teacher, /const LineGraphPractice = lazy\(\(\) => import\('\.\/LineGraphPractice\.jsx'\)\);/);
});

test('the console creates Graph the Line with its own settings and the shared Rewards choice', () => {
  const teacher = read('../../src/components/liveChallenge/LiveChallengeTeacher.jsx');
  assert.match(teacher, /const lineProblem = lineMode \? lineSetupProblem\(lineSetup\) : null;/);
  const create = region(teacher, 'if (ownSettingsGame) {', 'if (warmupAssignmentId && warmupDeliveryMode', 'own-settings create');
  assert.match(teacher, /const ownSettingsGame = [^;]*\blineMode\b[^;]*;/, 'Graph the Line is a game with its own settings');
  assert.match(create, /if \(lineProblem\) throw new Error\(lineProblem\);/, 'an impossible game is not sent');
  assert.match(create, /:\s*lineCreateRequest\(lineSetup, \{ rewardPolicy: buildChallengeRewardPolicy\(rewardChoice\) \}\)/);
  assert.match(create, /\n\s*standingsDisplay,\n/);
  assert.doesNotMatch(executableSource(create), /assignmentId/, 'never linked to a Warm-Up');
  assert.match(create, /speedInfluencePercent: 0/, 'no speed setting');
  // The practice round plays the teacher's own settings.
  assert.match(region(teacher, 'if (dryRunOpen && lineMode) {', '\n    }', 'line practice'), /<LineGraphPractice setup=\{lineSetup\}/);
});

test('the host counts a Classic or Sprint player finished from their row, and closes early when all are', () => {
  const teacher = read('../../src/components/liveChallenge/LiveChallengeTeacher.jsx');
  const finished = region(teacher, 'const finishedKeys = useMemo(', '[players, roundOpen, roundsEndOnTheClock, questionSetRoom, currentRound]);', 'finished players');
  assert.match(finished, /questionSetRoom\s*\?\s*raceRoundFinished\(player, currentRound\)\s*:\s*Number\(player\.answeredRound\) === currentRound/);
  assert.match(finished, /roundOpen && !roundsEndOnTheClock/, 'a rush finishes nobody before its deadline');
  assert.match(teacher, /const roundsEndOnTheClock = roomRoundsEndOnTheClock\(room\);/);
  assert.match(teacher, /const everyoneFinished = roundOpen && !roundsEndOnTheClock && joinedCount > 0 && answeredCount >= joinedCount;/);
  assert.match(teacher, /lineRoom && <LineGraphHostStatus room=\{room\} players=\{players\} clockOffsetMs=\{clockOffsetMs\} joinedCount=\{joinedCount\} finishedCount=\{answeredCount\}/);
  assert.match(teacher, /\{report\.lineGraph && <LineGraphReport report=\{report\} \/>\}/);
});

/* ------------------------------ the projector ----------------------------- */

test('the projector shows the race and, after a Classic round, its line — never an item while it can be answered', () => {
  const projector = read('../../src/components/liveChallenge/LiveChallengeArenaProjector.jsx');
  assert.match(projector, /questionSetGameOf\(room\) === QUESTION_SET_GAME\.LINE_GRAPH && <LineRunningView /);
  assert.match(projector, /!roomRunsQuestionSets\(room\) && <RunningView/, 'the classic view is for classic rooms only');
  const running = region(projector, 'function LineRunningView(', '\n}\n', 'line running view');
  assert.doesNotMatch(executableSource(running), /currentQuestion|equation|\.line\b/, 'nothing about an item');
  // The line is drawn only inside the worked solution, which only a closed
  // round's results render.
  const solution = region(projector, 'function ProjectorSolution(', '\n}\n', 'projector solution');
  assert.match(solution, /if \(solution\?\.lineGraph\) \{[\s\S]*<RevealedLine lineGraph=\{solution\.lineGraph\}/);
  assert.equal((executableSource(projector).match(/<RevealedLine\b/g) || []).length, 1);
  for (const file of ['LiveChallengeArenaProjector.jsx', 'LineRevealGraph.jsx', 'RevealedLine.jsx', 'LineGraphHost.jsx']) {
    const code = executableSource(read(`../../src/components/liveChallenge/${file}`));
    assert.doesNotMatch(code, /liveChallengeService|firebase|lineGraphGenerator|lineGraphGrading|seed/, `${file} reads nothing and grades nothing`);
  }
});

// Every room's results can show a revealed line; only a Classic line game has
// one. Its grid and equation drawing load on first use, never with every room.
test('the revealed line is loaded only when a round has one', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const root = new URL('../../src/', import.meta.url);
  const files = [];
  const walk = (dir) => readdirSync(dir).forEach((name) => {
    const entry = new URL(name, dir);
    if (statSync(entry).isDirectory()) walk(new URL(`${name}/`, dir));
    else if (/\.(jsx?|mjs)$/.test(name)) files.push(entry);
  });
  walk(root);
  const importers = files.filter((file) => /\bimport\s[^;]*['"][./]*LineRevealGraph\.jsx['"]/.test(executableSource(readFileSync(file, 'utf8'))));
  assert.deepEqual(importers, [], 'nothing imports the reveal graph up front');
  const wrapper = executableSource(read('../../src/components/liveChallenge/RevealedLine.jsx'));
  assert.match(wrapper, /const LineRevealGraph = lazy\(\(\) => import\('\.\/LineRevealGraph\.jsx'\)\);/);
  assert.match(wrapper, /<Suspense fallback=/);
  for (const file of ['ChallengeSolutionParts.jsx', 'ChallengeHostConsole.jsx', 'LiveChallengeArenaProjector.jsx']) {
    const code = executableSource(read(`../../src/components/liveChallenge/${file}`));
    assert.match(code, /import RevealedLine from '\.\/RevealedLine\.jsx';/, file);
    assert.match(code, /<RevealedLine lineGraph=\{/, `${file} draws it`);
  }
});

/* ------------------------------- the server ------------------------------- */

test('the server: the finished flag on the public row, and a shared line captured at its opening, published at its close', () => {
  const server = read('../../functions/index.js');
  const submit = region(server, 'exports.submitLineGraphAttempts = onCall', '\nexports.', 'line submit');
  const publicWrite = region(submit, 'transaction.set(roomRef.collection("players")', '}, { merge: true });', 'public row');
  // The race's own state: work a student does in extra time after the buzzer
  // never moves their public row (it would name them, and it is not the race).
  assert.match(publicWrite, /rushRoundCompleted: applied\.raceState\.questionsCorrect,/);
  assert.match(publicWrite, /rushRoundFinished: applied\.raceState\.finished === true,/);
  assert.doesNotMatch(publicWrite, /submissionReceipts|studentId|answeredRound|extraTime/);
  assert.match(submit, /if \(raceRecorded > 0\) \{\s*transaction\.set\(roomRef\.collection\("players"\)/, 'a batch made only in extra time writes no public row');
  assert.match(submit, /\.\.\.\(raceRecorded > 0 \? \{\s*submissionReceipts: applied\.receipts,/, 'the race\'s receipts change only with race attempts');
  const planner = region(server, 'const LINE_GRAPH_PLANNER = Object.freeze({', '\n});', 'line planner');
  assert.match(planner, /const sharedLineKeys = lineGraphSharesRounds\(config\)/);
  assert.match(planner, /privateFields: \{ lineGraph: \{ seed, config, generatorVersion, \.\.\.\(sharedLineKeys \? \{ sharedLineKeys \} : \{\}\) \} \}/);
  assert.match(planner, /roomFields: \{ lineGraph: \{ config, generatorVersion \} \}/, 'never the seed or the lines on the room');
  assert.match(region(planner, 'async openRound(', 'return {', 'open'), /engine\.lineReveal\.lineRoundSolutionRecord\(/);
  assert.doesNotMatch(executableSource(planner), /\.set\(|\.add\(/, 'the planner writes nothing itself');
  assert.match(server, /const lineGraphSharesRounds = \(config = \{\}\) => config\.format === "classic" && config\.sameEquations === true;/);
  const reveal = region(server, 'function liveChallengeRevealableRounds(', '\n}\n', 'revealable rounds');
  assert.match(reveal, /const sharedLineKeys = privateState\.lineGraph\?\.sharedLineKeys;\s*if \(!Array\.isArray\(sharedLineKeys\)\) return \[\];/);
  assert.match(reveal, /questionKeys: sharedLineKeys\.map\(/, 'held while a later round asks the same line');
  const apply = region(server, 'function applyLiveChallengeSolutionReveals(', '\n}\n', 'apply reveals');
  assert.match(apply, /stored\?\.lineGraph \? engine\.lineReveal\.withClassLineFacts\(\{ record: stored, players, roundIndex: round \}\) : stored/);
  // Every closing path hands over the players whose receipts it counts.
  const calls = server.split('applyLiveChallengeSolutionReveals(transaction, {\n').slice(1).map((call) => call.slice(0, call.indexOf('});')));
  assert.equal(calls.length, 3, 'close, advance and finish');
  calls.forEach((call) => assert.match(call, /\n\s*players(: roundPlayers)?,\n/));
  assert.match(server, /import\("\.\/shared\/lineGraphReveal\.mjs"\),/);
});

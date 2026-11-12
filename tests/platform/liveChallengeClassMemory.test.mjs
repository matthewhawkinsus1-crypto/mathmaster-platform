import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as M from '../../functions/shared/liveChallengeClassMemory.mjs';
import { buildRushReport } from '../../functions/shared/graphFeatureRush.mjs';
import { normalizeGraphFeatureRushConfig } from '../../functions/shared/graphFeatureRushConfig.mjs';
import { INEQUALITY_REPORT_LABELS, normalizeInequalityRushConfig } from '../../functions/shared/inequalityRush.mjs';
import { buildLineGraphReport } from '../../functions/shared/lineGraphAttempts.mjs';
import { LINE_ROUND_LIMITS, normalizeLineGraphConfig } from '../../functions/shared/lineGraphConfig.mjs';
import { LINE_GRAPH_MODE_ID } from '../../functions/shared/lineGraphRules.mjs';
import { buildChallengeReport } from '../../functions/shared/liveChallengeReport.mjs';
import { CLASSIC_SETUP_CHOICES } from '../../functions/shared/liveChallengeModes.mjs';
import { SOLVER_RACE_DIFFICULTIES, SOLVER_RACE_FOCUS, planSolverRace } from '../../functions/shared/solverRace.mjs';
import { LINE_GRAPH_GAME, defaultLineSetup, lineCreateRequest, lineSetupProblem } from '../../src/platform/liveChallenge/lineGraphSetupModel.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

/*
 * CLASS MEMORY (liveChallengeClassMemory.mjs): what a finished rush game
 * leaves its class, and the rule for what to try next —
 *   85% or higher: step up · 65–85%: repeat · below 65%: step down, or drop
 *   the weakest feature.
 */

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const OCT_28 = Date.UTC(2026, 9, 28, 17, 0);
const NOV_1 = Date.UTC(2026, 10, 1, 17, 0);

const graphMemory = (accuracy, settings = {}, weakest = { key: 'vertex', label: 'vertex', completionPercent: 41, accuracyPercent: 55 }) => ({
  version: 1,
  game: 'graphFeatureRush',
  classId: 'class-5',
  classLabel: 'Period 5',
  playedAtMs: OCT_28,
  settings: {
    presetId: 'algebra1Quick',
    families: ['linear', 'quadratic'],
    features: ['xIntercept', 'yIntercept', 'vertex'],
    difficulty: 'standard',
    offScreen: false,
    roundCount: 3,
    roundSeconds: 60,
    scoringStrategyId: 'grandPrix',
    ...settings,
  },
  results: { accuracyPercent: accuracy, completedPerStudent: 4.2, players: 24, weakest },
});

const inequalityMemory = (accuracy, settings = {}, weakest = { key: 'absolute', label: 'Absolute value (Algebra II)', completionPercent: 30, accuracyPercent: 40 }) => ({
  version: 1,
  game: 'inequalityRush',
  classId: 'class-2',
  classLabel: 'Period 2',
  playedAtMs: OCT_28,
  settings: { presetId: 'absoluteValue', itemTypes: ['compoundAnd', 'compoundOr', 'absolute'], difficulty: 'standard', roundCount: 3, roundSeconds: 90, scoringStrategyId: 'grandPrix', ...settings },
  results: { accuracyPercent: accuracy, completedPerStudent: 5, players: 20, weakest },
});

/* --------------------------------- the rule -------------------------------- */

test('85% or higher steps up, 65% up to 85% repeats, below 65% steps down — at exactly those lines', () => {
  assert.equal(M.STEP_UP_AT, 85);
  assert.equal(M.REPEAT_FROM, 65);
  const kindAt = (accuracy) => M.suggestNextSettings(graphMemory(accuracy)).kind;
  assert.equal(kindAt(100), 'stepUp');
  assert.equal(kindAt(85), 'stepUp', '85% or higher');
  assert.equal(kindAt(84), 'repeat');
  assert.equal(kindAt(65), 'repeat', '65–85%');
  assert.equal(kindAt(64), 'stepDown', 'below 65%');
  assert.equal(kindAt(0), 'stepDown');
  const up = M.suggestNextSettings(graphMemory(86));
  assert.equal(up.settings.difficulty, 'challenge');
  assert.equal(up.phrase, 'try Challenge');
  const repeat = M.suggestNextSettings(graphMemory(70));
  assert.ok(M.sameSettings(repeat.settings, graphMemory(70).settings), 'a repeat is the same game');
  const down = M.suggestNextSettings(graphMemory(60));
  assert.equal(down.settings.difficulty, 'easy');
  assert.equal(down.phrase, 'try Easy');
  // Everything else about the game stays as it was.
  assert.deepEqual([up.settings.roundCount, up.settings.roundSeconds, up.settings.scoringStrategyId], [3, 60, 'grandPrix']);
  assert.deepEqual(up.settings.features, ['xIntercept', 'yIntercept', 'vertex']);
});

test('at the top a step up is a shorter clock, at the bottom a step down drops the weakest feature, then a longer clock', () => {
  const faster = M.suggestNextSettings(graphMemory(92, { difficulty: 'challenge' }));
  assert.equal(faster.kind, 'faster');
  assert.equal(faster.settings.roundSeconds, 45);
  assert.equal(faster.phrase, 'try 45 s rounds');
  assert.equal(M.suggestNextSettings(graphMemory(92, { difficulty: 'challenge', roundSeconds: 30 })).kind, 'repeat', 'nowhere further up');
  const dropped = M.suggestNextSettings(graphMemory(50, { difficulty: 'easy' }));
  assert.equal(dropped.kind, 'drop');
  assert.deepEqual(dropped.settings.features, ['xIntercept', 'yIntercept']);
  assert.equal(dropped.phrase, 'try it without the vertex');
  assert.equal(dropped.settings.presetId, 'custom', 'no preset is named over settings it no longer describes');
  const slower = M.suggestNextSettings(graphMemory(50, { difficulty: 'easy', features: ['xIntercept'] }, { key: 'xIntercept', label: 'x-intercepts', completionPercent: 30, accuracyPercent: 40 }));
  assert.equal(slower.kind, 'slower', 'one feature left: more time instead');
  assert.equal(slower.settings.roundSeconds, 90);
  assert.equal(M.suggestNextSettings(graphMemory(50, { difficulty: 'easy', features: ['xIntercept'], roundSeconds: 120 })).kind, 'repeat', 'nowhere further down');
  // Mixed ramps from Easy to Challenge: up is Challenge, down is Easy.
  assert.equal(M.suggestNextSettings(graphMemory(90, { difficulty: 'mixed' })).settings.difficulty, 'challenge');
  assert.equal(M.suggestNextSettings(graphMemory(40, { difficulty: 'mixed' })).settings.difficulty, 'easy');
});

test('a suggestion is always a game the server would create: an easier difficulty that cannot play the settings drops the weakest feature instead', () => {
  // Rational graphs start at Standard: stepping a rational game down is refused by the settings rule.
  const asymptotes = graphMemory(50, { families: ['rational'], features: ['asymptote', 'yIntercept'], presetId: 'custom' }, { key: 'asymptote', label: 'asymptotes', completionPercent: 20, accuracyPercent: 30 });
  assert.throws(() => normalizeGraphFeatureRushConfig({ ...asymptotes.settings, difficulty: 'easy' }));
  const next = M.suggestNextSettings(asymptotes);
  assert.equal(next.kind, 'drop');
  assert.deepEqual(next.settings.features, ['yIntercept']);
  // Off-screen features start at Standard: stepping down to Easy leaves them behind.
  const offScreen = M.suggestNextSettings(graphMemory(50, { offScreen: true, presetId: 'custom' }));
  assert.equal(offScreen.kind, 'stepDown');
  assert.equal(offScreen.settings.offScreen, false);
  // Over many memories, every suggestion passes the game's own rule.
  const difficulties = ['easy', 'standard', 'challenge', 'mixed'];
  let checked = 0;
  for (let accuracy = 0; accuracy <= 100; accuracy += 7) {
    for (const difficulty of difficulties) {
      for (const memory of [graphMemory(accuracy, { difficulty }), inequalityMemory(accuracy, { difficulty })]) {
        const next = M.suggestNextSettings(memory);
        const normalize = memory.game === 'graphFeatureRush' ? normalizeGraphFeatureRushConfig : normalizeInequalityRushConfig;
        assert.doesNotThrow(() => normalize(next.settings), `${memory.game} ${difficulty} ${accuracy}%`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 100);
});

test('Inequality Graphing Rush steps the same way and drops its weakest kind', () => {
  assert.equal(M.suggestNextSettings(inequalityMemory(90)).phrase, 'try Challenge');
  const dropped = M.suggestNextSettings(inequalityMemory(52, { difficulty: 'easy' }));
  assert.equal(dropped.kind, 'drop');
  assert.deepEqual(dropped.settings.itemTypes, ['compoundAnd', 'compoundOr']);
  assert.equal(dropped.phrase, 'try it without absolute value');
  assert.equal(M.suggestNextSettings({ ...inequalityMemory(80), results: { accuracyPercent: null } }), null, 'no accuracy, no suggestion');
  assert.equal(M.suggestNextSettings({ game: 'standard', settings: {}, results: { accuracyPercent: 90 } }), null, 'no memory for other games');
});

/* -------------------------------- the words -------------------------------- */

test('the card reads like the plan: who, when, at what, how long, how accurate → what to try', () => {
  const memory = graphMemory(86);
  assert.equal(M.classMemorySentence(memory, M.suggestNextSettings(memory), { nowMs: NOV_1 }),
    'Period 5 last played this on Oct 28 at Standard, 3 × 60 s, 86% accuracy → try Challenge.');
  assert.equal(M.classMemoryDetail(memory), '4.2 graphs per student · weakest: vertex (41% completed)');
  assert.equal(M.memoryDate(Date.UTC(2025, 4, 3, 17), NOV_1), 'May 3, 2025', 'another year names it');
  assert.equal(M.classMemorySentence({ ...memory, classLabel: null }, null, { nowMs: NOV_1 }), 'This class last played this on Oct 28 at Standard, 3 × 60 s, 86% accuracy.');
  assert.equal(M.classMemoryDetail(inequalityMemory(70)), '5 inequalities per student · weakest: Absolute value (Algebra II) (30% completed)');
  assert.equal(M.classMemoryDetail({ ...inequalityMemory(70), results: { completedPerStudent: 1, weakest: null } }), '1 inequality per student');
});

test('the setup takes a memory\'s settings as its own, held to the choices it offers', () => {
  const memory = graphMemory(86);
  assert.deepEqual(M.setupFromMemory('graphFeatureRush', memory.settings), memory.settings);
  assert.equal(M.setupFromMemory('graphFeatureRush', { ...memory.settings, roundSeconds: 75 }).roundSeconds, 60, 'the nearest choice');
  assert.equal(M.setupFromMemory('inequalityRush', { ...inequalityMemory(70).settings, roundCount: 40 }).roundCount, 8, 'at most the most rounds');
  assert.equal(M.setupFromMemory('standard', {}), null);
  assert.ok(M.sameSettings({ features: ['a', 'b'], presetId: 'x' }, { features: ['b', 'a'], presetId: 'custom' }), 'the preset name and the order do not make another game');
  assert.ok(!M.sameSettings({ difficulty: 'easy' }, { difficulty: 'standard' }));
});

/* ------------------------------- the record -------------------------------- */

const standing = (studentId, joined, summary) => ({ studentId, alias: studentId, joined, rank: 1, score: 1, questionSetSummary: summary });
const finishedResult = (modeId, extra = {}) => ({
  roomId: 'room-1',
  modeId,
  status: 'finished',
  classId: 'class-5',
  className: 'Period 5',
  classPeriod: '5',
  teacherEmail: 'teacher@example.test',
  roomRoundCount: 3,
  roundSeconds: 60,
  scoringStrategyId: 'grandPrix',
  finalizedAtMs: OCT_28,
  standings: [
    standing('s1', true, { questions: 6, completed: 5, attempts: 8, hits: 6, byFeature: { vertex: { questions: 3, completed: 2, attempts: 5, hits: 3 }, yIntercept: { questions: 3, completed: 3, attempts: 3, hits: 3 } }, byFamily: { oneStep: { questions: 3, completed: 2, attempts: 5, hits: 3 }, simple: { questions: 3, completed: 3, attempts: 3, hits: 3 } } }),
    standing('s2', true, { questions: 4, completed: 3, attempts: 4, hits: 3, byFeature: { vertex: { questions: 2, completed: 1, attempts: 2, hits: 1 }, yIntercept: { questions: 2, completed: 2, attempts: 2, hits: 2 } }, byFamily: { oneStep: { questions: 2, completed: 1, attempts: 2, hits: 1 }, simple: { questions: 2, completed: 2, attempts: 2, hits: 2 } } }),
    standing('s3', false, {}),
  ],
  ...extra,
});
const graphRoom = { roundCount: 3, roundSeconds: 60, scoringStrategyId: 'grandPrix', graphFeatureRush: { config: { presetId: 'custom', families: ['quadratic'], features: ['yIntercept', 'vertex'], difficulty: 'standard', offScreen: false } } };

test('a finished game leaves its class totals: accuracy, per student, the weakest feature — and nothing about any student', () => {
  const result = finishedResult('graphFeatureRush');
  const memory = M.buildClassMemory({ result, room: graphRoom, report: buildRushReport(result) });
  assert.equal(memory.game, 'graphFeatureRush');
  assert.equal(memory.classId, 'class-5');
  assert.equal(memory.classLabel, 'Period 5');
  assert.equal(memory.teacherEmail, 'teacher@example.test');
  assert.equal(memory.playedAtMs, OCT_28);
  assert.deepEqual(memory.settings, { presetId: 'custom', families: ['quadratic'], features: ['yIntercept', 'vertex'], difficulty: 'standard', offScreen: false, roundCount: 3, roundSeconds: 60, scoringStrategyId: 'grandPrix' });
  assert.equal(memory.results.accuracyPercent, 75, '9 of 12 attempts right');
  assert.equal(memory.results.players, 2, 'who joined, not who was invited');
  assert.equal(memory.results.completedPerStudent, 4, '8 completed by 2 students');
  assert.deepEqual(memory.results.weakest, { key: 'vertex', label: 'vertex', completionPercent: 60, accuracyPercent: 57 });
  assert.doesNotMatch(JSON.stringify(memory), /s1|s2|s3/, 'no student in it');
  // The inequality game's weakest is a kind, named for teachers.
  const inequality = finishedResult('inequalityRush');
  const room = { ...graphRoom, inequalityRush: { config: { presetId: 'custom', itemTypes: ['simple', 'oneStep'], difficulty: 'standard' } } };
  const remembered = M.buildClassMemory({ result: inequality, room, report: buildRushReport(inequality, INEQUALITY_REPORT_LABELS) });
  assert.deepEqual(remembered.settings.itemTypes, ['simple', 'oneStep']);
  assert.equal(remembered.results.weakest.label, 'Solve first: one step');
  // Nothing to remember: another game, a cancelled one, no class, no settings, nobody playing.
  assert.equal(M.buildClassMemory({ result: finishedResult('standard'), room: graphRoom, report: buildRushReport(result) }), null);
  assert.equal(M.buildClassMemory({ result: { ...result, status: 'cancelled' }, room: graphRoom, report: buildRushReport(result) }), null);
  assert.equal(M.buildClassMemory({ result: { ...result, classId: null }, room: graphRoom, report: buildRushReport(result) }), null);
  assert.equal(M.buildClassMemory({ result, room: {}, report: buildRushReport(result) }), null);
  const nobody = finishedResult('graphFeatureRush', { standings: [standing('s1', false, {})] });
  assert.equal(M.buildClassMemory({ result: nobody, room: graphRoom, report: buildRushReport(nobody) }), null);
  // One memory per class and game; an older game never replaces a newer one.
  assert.equal(M.classMemoryId('class-5', 'graphFeatureRush'), 'class-5__graphFeatureRush');
  assert.ok(M.memoryIsNewer({ roomId: 'b', playedAtMs: 2 }, { roomId: 'a', playedAtMs: 1 }));
  assert.ok(!M.memoryIsNewer({ roomId: 'a', playedAtMs: 2 }, { roomId: 'a', playedAtMs: 1 }), 'the same game rewrites itself');
  assert.ok(!M.memoryIsNewer({ roomId: 'a', playedAtMs: 1 }, { roomId: 'b', playedAtMs: 2 }));
  // Storable: no array directly inside an array (Firestore refuses one).
  const nests = (value) => (Array.isArray(value) ? value.some((entry) => Array.isArray(entry) || nests(entry)) : Boolean(value) && typeof value === 'object' && Object.values(value).some(nests));
  assert.equal(nests(memory), false);
});

/* -------------------------------- the wiring -------------------------------- */

test('the server writes the memory as a finalization effect, from the result and the room, never over a newer one', () => {
  const index = executableSource(read('functions/index.js'));
  assert.match(index, /const LIVE_CHALLENGE_CLASS_MEMORY = "liveChallengeClassMemory";/);
  assert.match(index, /const LIVE_CHALLENGE_EFFECT_ORDER = Object\.freeze\(\[[^\]]*"report", "classMemory",/);
  const effects = region(index, 'async function runLiveChallengeFinalizationEffects', 'async function finalizeLiveChallengeMatch', 'the effects');
  assert.match(effects, /classMemory: \(\) => writeClassMemoryFromResult\(db, result\),/);
  assert.match(region(index, 'function liveChallengeFinalizationEffects(', '\n}\n', 'the effects a match needs'), /classMemory: challengeFinished \? "pending" : "notApplicable",/);
  const writer = region(index, 'async function writeClassMemoryFromResult(db, result) {', '\n}\n', 'the writer');
  assert.match(writer, /if \(!game \|\| result\.status !== "finished" \|\| !result\.classId\) return;/);
  assert.match(writer, /db\.collection\(LIVE_CHALLENGE_ROOMS\)\.doc\(String\(result\.roomId \|\| ""\)\)\.get\(\)/, 'the settings come from the room');
  // The totals come from the durable result: each game's report (its
  // `report`) is built from the match result, as the teacher's report is.
  assert.match(writer, /const report = await classMemoryReportFromResult\(game, result\);/);
  const reports = region(index, 'async function classMemoryReportFromResult(game, result) {', '\n}\n', 'the report each memory reads');
  assert.match(reports, /if \(game\.report === "lineGraph"\) return \(await lineGraphModules\(\)\)\.attempts\.buildLineGraphReport\(result\);/, 'Graph the Line\'s report');
  assert.match(reports, /if \(game\.report === "classic"\) return classicChallengeReportFromResult\(result\);/, 'the classic report, for Solver Race');
  assert.match(reports, /buildRushReport\(result, labels\)/, 'a rush\'s report');
  const classic = region(index, 'async function classicChallengeReportFromResult(result) {', '\n}\n', 'the classic report');
  assert.match(classic, /reportRules\.buildChallengeReport\(\{\s*room: result,/);
  assert.match(region(index, 'async function writeLiveChallengeReportFromResult(db, result) {', '\n}\n', 'the teacher\'s report'), /const report = await classicChallengeReportFromResult\(result\);/, 'the same report the teacher reads');
  for (const source of [writer, reports, classic]) assert.doesNotMatch(source, /LIVE_CHALLENGE_PRIVATE|liveChallengePrivate/, 'never private state');
  assert.match(writer, /if \(stored\.exists && memoryRules\.memoryIsNewer\(stored\.data\(\), memory\)\) return;/);
  assert.equal(M.CLASS_MEMORY_COLLECTION, 'liveChallengeClassMemory');
});

test('the console reads the chosen class\'s memory and the setup shows the card with its two buttons', () => {
  const teacher = read('src/components/liveChallenge/LiveChallengeTeacher.jsx');
  assert.match(teacher, /watchClassGameMemory\(\s*classId,\s*memoryGame,\s*setClassMemory,/, 'followed, not read once');
  assert.match(teacher, /\}, \[memoryGame, classId, roomId\]\);/, 'followed again when the class or the game changes, and only while setup is open');
  assert.match(teacher, /<GraphFeatureRushSetup [^\n]*memory=\{classMemory\?\.game === 'graphFeatureRush' \? classMemory : null\}/);
  assert.match(teacher, /<InequalityRushSetup [^\n]*memory=\{classMemory\?\.game === 'inequalityRush' \? classMemory : null\}/);
  for (const setup of ['GraphFeatureRushSetup', 'InequalityRushSetup']) {
    assert.match(read(`src/components/liveChallenge/${setup}.jsx`), /\{memory && <ClassMemoryCard memory=\{memory\} onUse=\{onChange\}[^>]*\/>\}/, setup);
  }
  const card = read('src/components/liveChallenge/ClassMemoryCard.jsx');
  assert.match(card, />Use last settings<\/button>/);
  // Each button fills in its game, whole (pressed in liveChallengeConsoleAnnouncements.test.mjs).
  assert.match(card, /\{offerSuggestion && <button [^>]*onClick=\{\(\) => use\(next\.settings, [^)]*\)\}>Use suggestion<\/button>\}/);
  assert.match(card, /const setup = setupFromMemory\(memory\.game, settings\);\s*onUse\(setup\);/);
  assert.match(read('src/platform/liveChallenge/liveChallengeService.js'), /getDoc\(doc\(db, CLASS_MEMORY_COLLECTION, id\)\)/);
});

test('the setup card follows the memory: a game finishing after New Challenge was chosen updates it (P2 on PR 530)', () => {
  // A fake database: one document, many listeners, like onSnapshot.
  const listeners = new Set();
  const listen = (collectionName, id, next) => {
    assert.equal(collectionName, M.CLASS_MEMORY_COLLECTION);
    assert.equal(id, M.classMemoryId('class-5', 'graphFeatureRush'));
    listeners.add(next);
    next(null); // the first snapshot: nothing written yet
    return () => listeners.delete(next);
  };
  const shown = [];
  const stop = M.watchClassMemory({ classId: 'class-5', game: 'graphFeatureRush', listen, onValue: (value) => shown.push(value) });
  assert.deepEqual(shown, [null], 'no card yet');
  // The finalization writes the memory after the teacher is already on setup.
  const memory = graphMemory(86);
  listeners.forEach((next) => next(memory));
  assert.deepEqual(shown, [null, memory], 'the card appears without leaving setup');
  const newer = graphMemory(70);
  listeners.forEach((next) => next(newer));
  assert.equal(shown.at(-1), newer, 'and follows a later write');
  stop();
  assert.equal(listeners.size, 0, 'leaving setup (a room opens) closes the listener');
  // No class or no game: nothing is listened to, and the card is empty.
  const none = [];
  M.watchClassMemory({ classId: '', game: 'graphFeatureRush', listen: () => assert.fail('no listener'), onValue: (v) => none.push(v) });
  assert.deepEqual(none, [null]);
});

/* ------------- Graph the Line, Solver Race — and not Standard (N80) ------------- */

const lineMemory = (accuracy, settings = {}, weakest = { key: 'pointSlope', label: 'Point-slope form', completionPercent: 40, accuracyPercent: 52 }) => ({
  version: 1,
  game: 'lineGraph',
  classId: 'class-5',
  classLabel: 'Period 5',
  playedAtMs: OCT_28,
  settings: {
    format: 'sprint', presetId: 'allThreeForms', itemTypes: ['graph'], forms: ['slopeIntercept', 'standard', 'pointSlope'], specialLines: false,
    difficulty: 'standard', nameStyle: 'choice', triesPerItem: 3, sprintLength: 10, sameEquations: false, showMethod: false, slopeHelper: false,
    roundCount: 2, roundSeconds: 180, scoringStrategyId: 'grandPrix',
    ...settings,
  },
  results: { accuracyPercent: accuracy, completedPerStudent: 6, players: 22, weakest },
});

const raceMemory = (accuracy, settings = {}) => ({
  version: 1,
  game: 'solverRace',
  classId: 'class-5',
  classLabel: 'Period 5',
  playedAtMs: OCT_28,
  settings: { focus: 'linearEquation', difficulty: 'developing', timingMode: 'timed', roundCount: 10, roundSeconds: 45, scoringStrategyId: 'accuracyFirst', ...settings },
  results: { accuracyPercent: accuracy, completedPerStudent: 7.5, players: 24, weakest: null },
});

test('Standard Challenge has no memory: nothing easier or harder to suggest; the other games each have one', () => {
  // Every game on a difficulty ladder has one — Systems of Equations Rush,
  // the third rush, too — and Standard Challenge none.
  assert.deepEqual([...M.CLASS_MEMORY_GAME_IDS].sort(), ['graphFeatureRush', 'inequalityRush', 'lineGraph', 'solverRace', 'systemsRush']);
  assert.equal(M.classMemoryGameOfMode('systemsRush').id, 'systemsRush');
  assert.equal(M.classMemoryGameOfMode('standard'), null);
  assert.equal(M.classMemoryGameOfMode('solverRace').id, 'solverRace');
  for (const modeId of Object.values(LINE_GRAPH_MODE_ID)) assert.equal(M.classMemoryGameOfMode(modeId).id, 'lineGraph', `${modeId}: one memory for the three formats`);
  assert.equal(M.getClassMemoryGame(LINE_GRAPH_GAME)?.id, LINE_GRAPH_GAME, 'the console names the game the memory keeps');
  // A finished Standard Challenge, with its whole report, leaves nothing.
  const standard = { ...finishedResult('standard'), standings: [{ studentId: 's1', alias: 's1', joined: true, roundsAnswered: 5, correctCount: 2, score: 2000 }] };
  const report = buildChallengeReport({ room: standard, scheduledRoundCount: 5, roundMisses: { 0: 1 }, answeredCounts: { 0: 2 }, roundStandards: { 0: 'A.5A' }, players: standard.standings });
  assert.equal(report.classAccuracyPercent, 50, 'a report with an accuracy and a weakest standard …');
  assert.equal(report.weakestStandard.standard, 'A.5A');
  assert.equal(M.buildClassMemory({ result: standard, room: { challengeMode: 'standard', standardCode: 'mixed', roundSeconds: 45 }, report }), null, '… and still no memory');
  assert.equal(M.suggestNextSettings({ game: 'standard', settings: { difficulty: 'standard', roundCount: 10, roundSeconds: 45 }, results: { accuracyPercent: 40 } }), null);
});

test('Graph the Line steps the same way, keeps its format, and drops its weakest form', () => {
  const up = M.suggestNextSettings(lineMemory(88));
  assert.equal(up.kind, 'stepUp');
  assert.equal(up.phrase, 'try Challenge');
  assert.equal(up.settings.difficulty, 'challenge');
  assert.equal(up.settings.format, 'sprint', 'a Sprint stays a Sprint');
  assert.deepEqual([up.settings.roundCount, up.settings.roundSeconds, up.settings.sprintLength], [2, 180, 10]);
  assert.equal(M.suggestNextSettings(lineMemory(70)).kind, 'repeat');
  assert.equal(M.suggestNextSettings(lineMemory(50)).settings.difficulty, 'easy');
  // At the top, a shorter clock from the format's own choices.
  const faster = M.suggestNextSettings(lineMemory(95, { difficulty: 'challenge' }));
  assert.deepEqual([faster.kind, faster.settings.roundSeconds, faster.phrase], ['faster', 120, 'try 120 s rounds']);
  assert.ok(LINE_ROUND_LIMITS.sprint.secondsOptions.includes(120));
  const classicFaster = M.suggestNextSettings(lineMemory(95, { format: 'classic', difficulty: 'challenge', roundCount: 8, roundSeconds: 45, sameEquations: true }));
  assert.equal(classicFaster.settings.roundSeconds, 30, 'Classic\'s clock is its own');
  // At the bottom, the weakest form goes; with one form left, more time.
  const dropped = M.suggestNextSettings(lineMemory(50, { difficulty: 'easy' }));
  assert.equal(dropped.kind, 'drop');
  assert.deepEqual(dropped.settings.forms, ['slopeIntercept', 'standard']);
  assert.equal(dropped.phrase, 'try it without point-slope form');
  assert.equal(dropped.settings.presetId, 'custom');
  const slower = M.suggestNextSettings(lineMemory(50, { difficulty: 'easy', forms: ['pointSlope'] }));
  assert.deepEqual([slower.kind, slower.settings.roundSeconds], ['slower', 240]);
  // Every suggestion is a game the server would create.
  let checked = 0;
  for (const format of ['classic', 'sprint', 'rush']) {
    for (const difficulty of ['easy', 'standard', 'challenge', 'mixed']) {
      for (let accuracy = 0; accuracy <= 100; accuracy += 9) {
        const seconds = LINE_ROUND_LIMITS[format].defaultSeconds;
        const next = M.suggestNextSettings(lineMemory(accuracy, { format, difficulty, roundSeconds: seconds }));
        assert.doesNotThrow(() => normalizeLineGraphConfig(next.settings, { format: next.settings.format }), `${format} ${difficulty} ${accuracy}%`);
        assert.equal(next.settings.format, format);
        assert.ok(LINE_ROUND_LIMITS[format].secondsOptions.includes(next.settings.roundSeconds), `${format}: ${next.settings.roundSeconds} s is a choice`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 100);
});

test('Graph the Line\'s card names the format, and either button fills in a setup the console can create', () => {
  const memory = lineMemory(86);
  assert.equal(M.classMemorySentence(memory, M.suggestNextSettings(memory), { nowMs: NOV_1 }),
    'Period 5 last played this on Oct 28 at Standard, Sprint, 2 × 180 s, 86% accuracy → try Challenge.');
  assert.equal(M.classMemoryDetail(memory), '6 lines per student · weakest: Point-slope form (40% completed)');
  const setup = M.setupFromMemory('lineGraph', memory.settings);
  assert.deepEqual(Object.keys(setup).sort(), Object.keys(defaultLineSetup('algebra1', 'sprint')).sort(), 'every field the setup holds');
  assert.equal(lineSetupProblem(setup), null);
  assert.equal(lineCreateRequest(setup).challengeMode, LINE_GRAPH_MODE_ID.SPRINT);
  const next = M.setupFromMemory('lineGraph', M.suggestNextSettings(memory).settings);
  assert.equal(lineSetupProblem(next), null);
  assert.equal(next.difficulty, 'challenge');
  assert.equal(M.setupFromMemory('lineGraph', { ...memory.settings, roundSeconds: 200 }).roundSeconds, 180, 'the nearest of the format\'s choices');
  assert.equal(M.setupFromMemory('lineGraph', { ...memory.settings, format: 'rush', roundCount: 40 }).roundCount, LINE_ROUND_LIMITS.rush.maxRounds);
});

test('Solver Race steps along its bands; a Pace Race has no clock to change', () => {
  assert.deepEqual([M.suggestNextSettings(raceMemory(90)).kind, M.suggestNextSettings(raceMemory(90)).phrase, M.suggestNextSettings(raceMemory(90)).settings.difficulty], ['stepUp', 'try Advanced', 'advanced']);
  assert.equal(M.suggestNextSettings(raceMemory(84)).kind, 'repeat');
  assert.equal(M.suggestNextSettings(raceMemory(64)).phrase, 'try Foundation');
  // Ramp Up climbs from Foundation to Challenge: up is Challenge, down Foundation.
  assert.equal(M.suggestNextSettings(raceMemory(90, { difficulty: 'ramp' })).settings.difficulty, 'challenge');
  assert.equal(M.suggestNextSettings(raceMemory(40, { difficulty: 'ramp' })).settings.difficulty, 'foundation');
  // At the top a shorter clock, at the bottom a longer one — the console's own choices.
  const faster = M.suggestNextSettings(raceMemory(92, { difficulty: 'challenge' }));
  assert.deepEqual([faster.kind, faster.settings.roundSeconds], ['faster', 30]);
  const slower = M.suggestNextSettings(raceMemory(40, { difficulty: 'foundation' }));
  assert.deepEqual([slower.kind, slower.settings.roundSeconds, slower.phrase], ['slower', 60, 'try 60 s rounds']);
  assert.equal(M.suggestNextSettings(raceMemory(92, { difficulty: 'challenge', timingMode: 'pace' })).kind, 'repeat', 'no clock to shorten');
  assert.equal(M.suggestNextSettings(raceMemory(40, { difficulty: 'foundation', timingMode: 'pace' })).kind, 'repeat', 'no clock to lengthen');
  // The focus is the teacher's: no suggestion changes it.
  let checked = 0;
  for (const focus of SOLVER_RACE_FOCUS) {
    for (const difficulty of SOLVER_RACE_DIFFICULTIES) {
      for (const timingMode of ['timed', 'pace']) {
        for (let accuracy = 0; accuracy <= 100; accuracy += 11) {
          const next = M.suggestNextSettings(raceMemory(accuracy, { focus, difficulty, timingMode }));
          assert.equal(next.settings.focus, focus);
          assert.ok(SOLVER_RACE_DIFFICULTIES.includes(next.settings.difficulty));
          assert.ok(CLASSIC_SETUP_CHOICES.roundSeconds.includes(next.settings.roundSeconds), `${next.settings.roundSeconds} s is a choice`);
          // A race the server plans: every round has its question.
          const plan = planSolverRace({ roundCount: next.settings.roundCount, focus: next.settings.focus, difficulty: next.settings.difficulty, seed: `${focus}-${difficulty}` });
          assert.equal(plan.filter(Boolean).length, next.settings.roundCount, `${focus} ${next.settings.difficulty}`);
          checked += 1;
        }
      }
    }
  }
  assert.ok(checked > 400);
});

test('Solver Race\'s card names the focus and the band, and its buttons fill in the race', () => {
  const memory = raceMemory(78);
  assert.equal(M.classMemorySentence(memory, M.suggestNextSettings(memory), { nowMs: NOV_1 }),
    'Period 5 last played this on Oct 28 at Developing, 10 × 45 s, 78% accuracy → run it again.');
  assert.equal(M.classMemoryDetail(memory), 'Linear Equations · 7.5 rounds solved per student');
  const pace = raceMemory(88, { timingMode: 'pace', difficulty: 'advanced' });
  assert.equal(M.classMemorySentence(pace, M.suggestNextSettings(pace), { nowMs: NOV_1 }),
    'Period 5 last played this on Oct 28 at Advanced, 10 rounds, Pace Race, 88% accuracy → try Challenge.');
  assert.equal(M.classMemoryDetail({ ...memory, settings: { ...memory.settings, focus: 'mixed' }, results: { ...memory.results, completedPerStudent: 1 } }), 'Mixed Solver Race · 1 round solved per student');
  assert.deepEqual(M.setupFromMemory('solverRace', memory.settings), memory.settings, 'the race as it was');
  const odd = M.setupFromMemory('solverRace', { ...memory.settings, roundCount: 7, roundSeconds: 50 });
  assert.deepEqual([odd.roundCount, odd.roundSeconds], [8, 45], 'the nearest of the console\'s choices');
  assert.equal(M.setupFromMemory('solverRace', { ...memory.settings, focus: 'somethingElse', difficulty: 'impossible' }).difficulty, 'ramp');
});

const lineStanding = (studentId, joined, summary) => ({ studentId, alias: studentId, joined, rank: 1, score: 1, questionSetSummary: summary });

test('a finished Graph the Line game or Solver Race leaves its class totals — and nothing about any student', () => {
  // Graph the Line, a Sprint: forms hardest first from its own report.
  const line = finishedResult(LINE_GRAPH_MODE_ID.SPRINT, {
    roundSeconds: 180,
    roomRoundCount: 2,
    standings: [
      lineStanding('s1', true, { questions: 10, completed: 8, skipped: 1, attempts: 12, hits: 8, byTag: { form: { slopeIntercept: { questions: 5, completed: 5, attempts: 5, hits: 5 }, pointSlope: { questions: 5, completed: 3, attempts: 7, hits: 3 } } } }),
      lineStanding('s2', true, { questions: 6, completed: 4, attempts: 8, hits: 4, byTag: { form: { slopeIntercept: { questions: 3, completed: 3, attempts: 3, hits: 3 }, pointSlope: { questions: 3, completed: 1, attempts: 5, hits: 1 } } } }),
      lineStanding('s3', false, {}),
    ],
  });
  const lineRoom = { roundCount: 2, roundSeconds: 180, lineGraph: { config: normalizeLineGraphConfig({ presetId: 'allThreeForms', sprintLength: 10 }, { format: 'sprint' }) } };
  const remembered = M.buildClassMemory({ result: line, room: lineRoom, report: buildLineGraphReport(line) });
  assert.equal(remembered.game, 'lineGraph');
  assert.equal(remembered.modeId, LINE_GRAPH_MODE_ID.SPRINT);
  assert.equal(remembered.settings.format, 'sprint');
  assert.deepEqual([remembered.settings.roundCount, remembered.settings.roundSeconds, remembered.settings.sprintLength], [2, 180, 10]);
  assert.equal(remembered.results.accuracyPercent, 60, '12 of 20 checks right');
  assert.equal(remembered.results.completedPerStudent, 6, '12 lines by 2 students');
  assert.equal(remembered.results.weakest.key, 'pointSlope');
  assert.equal(remembered.results.weakest.label, 'Point-slope form');
  assert.doesNotMatch(JSON.stringify(remembered), /s1|s2|s3/);
  assert.equal(M.buildClassMemory({ result: line, room: {}, report: buildLineGraphReport(line) }), null, 'no settings, no memory');
  // A Solver Race: the classic report's accuracy and each student's rounds solved.
  const race = finishedResult('solverRace', {
    roundSeconds: 45,
    roomRoundCount: 5,
    scoringStrategyId: 'accuracyFirst',
    standings: [
      { studentId: 's1', alias: 's1', joined: true, roundsAnswered: 5, correctCount: 4, score: 4200 },
      { studentId: 's2', alias: 's2', joined: true, roundsAnswered: 4, correctCount: 2, score: 2100 },
      { studentId: 's3', alias: 's3', joined: false, roundsAnswered: 0, correctCount: 0, score: 0 },
    ],
  });
  const raceReport = buildChallengeReport({
    room: race, scheduledRoundCount: 5, roundMisses: { 0: 0, 1: 1, 2: 1, 3: 1, 4: 0 }, answeredCounts: { 0: 2, 1: 2, 2: 2, 3: 2, 4: 1 }, players: race.standings,
  });
  const raceRoom = { challengeMode: 'solverRace', solverRaceFocus: 'linearInequality', solverRaceDifficulty: 'advanced', timingMode: 'timed', roundCount: 5, roundSeconds: 45 };
  const raced = M.buildClassMemory({ result: race, room: raceRoom, report: raceReport });
  assert.equal(raced.game, 'solverRace');
  assert.deepEqual(raced.settings, { focus: 'linearInequality', difficulty: 'advanced', timingMode: 'timed', roundCount: 5, roundSeconds: 45, scoringStrategyId: 'accuracyFirst' });
  assert.equal(raced.results.accuracyPercent, raceReport.classAccuracyPercent);
  assert.equal(raced.results.accuracyPercent, 67, '6 of 9 answers right');
  assert.equal(raced.results.completedPerStudent, 3, '6 rounds solved by 2 students');
  assert.equal(raced.results.players, 2);
  assert.equal(raced.results.weakest, null, 'its rounds record no standard: nothing to drop');
  assert.doesNotMatch(JSON.stringify(raced), /s1|s2|s3/);
  const nobody = { ...race, standings: [{ studentId: 's1', alias: 's1', joined: true, roundsAnswered: 0, correctCount: 0 }] };
  assert.equal(M.buildClassMemory({ result: nobody, room: raceRoom, report: buildChallengeReport({ room: nobody, scheduledRoundCount: 5, players: nobody.standings }) }), null, 'nobody answered');
  const nests = (value) => (Array.isArray(value) ? value.some((entry) => Array.isArray(entry) || nests(entry)) : Boolean(value) && typeof value === 'object' && Object.values(value).some(nests));
  assert.equal(nests(remembered) || nests(raced), false);
});

test('the console follows the memory of Graph the Line and Solver Race too, and their cards fill in the setup', () => {
  const teacher = executableSource(read('src/components/liveChallenge/LiveChallengeTeacher.jsx'));
  const games = region(teacher, 'let memoryGame = null;', 'useEffect(() => {', 'the game whose memory is followed');
  assert.match(games, /else if \(lineMode\) memoryGame = LINE_GRAPH_GAME;/);
  assert.match(games, /else if \(challengeMode === 'solverRace'\) memoryGame = 'solverRace';/);
  assert.doesNotMatch(games, /'standard'/, 'Standard Challenge has no memory to follow');
  assert.match(teacher, /<LineGraphSetup [^\n]*memory=\{classMemory\?\.game === LINE_GRAPH_GAME \? classMemory : null\}/);
  assert.match(read('src/components/liveChallenge/LineGraphSetup.jsx'), /\{memory && <ClassMemoryCard memory=\{memory\} onUse=\{onChange\}[^>]*\/>\}/);
  assert.match(teacher, /\{challengeMode === 'solverRace' && classMemory\?\.game === 'solverRace' && \(\s*<Suspense fallback=\{null\}>\s*<ClassMemoryCard memory=\{classMemory\} onUse=\{takeSolverRaceSetup\}[^>]*\/>/);
  const take = region(teacher, 'const takeSolverRaceSetup = (setup) => {', '\n  };', 'a Solver Race card\'s buttons');
  for (const call of ['setSolverRaceFocus(setup.focus)', 'setSolverRaceDifficulty(setup.difficulty)', 'setRoundCount(setup.roundCount)', 'setRoundSeconds(setup.roundSeconds)', 'setTimingMode(setup.timingMode)', 'setClassicScoringId(setup.scoringStrategyId)']) {
    assert.ok(take.includes(call), call);
  }
  // The classic setup offers exactly the choices the memory fills in.
  assert.match(teacher, /CLASSIC_SETUP_CHOICES\.roundCounts\.map\(\(count\) => <option key=\{count\} value=\{count\}>/);
  assert.match(teacher, /CLASSIC_SETUP_CHOICES\.roundSeconds\.map\(\(seconds\) => <option key=\{seconds\} value=\{seconds\}>/);
  // And names the race the way the card does.
  const focus = region(teacher, 'Race focus', '</select>', 'the race focus');
  Object.entries(M.SOLVER_RACE_FOCUS_LABEL).forEach(([id, label]) => assert.ok(focus.includes(`<option value="${id}">${label}</option>`), `${id}: ${label}`));
  const band = region(teacher, "{challengeMode === 'solverRace' && <label style={{ fontWeight: 800 }}>Difficulty", '</select>', 'the race difficulty');
  Object.entries(M.SOLVER_RACE_DIFFICULTY_LABEL).forEach(([id, label]) => assert.ok(band.includes(`<option value="${id}">${label}</option>`), `${id}: ${label}`));
});

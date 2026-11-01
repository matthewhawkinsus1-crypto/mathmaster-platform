import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as M from '../../functions/shared/liveChallengeClassMemory.mjs';
import { buildRushReport } from '../../functions/shared/graphFeatureRush.mjs';
import { normalizeGraphFeatureRushConfig } from '../../functions/shared/graphFeatureRushConfig.mjs';
import { INEQUALITY_REPORT_LABELS, normalizeInequalityRushConfig } from '../../functions/shared/inequalityRush.mjs';
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
  assert.match(writer, /buildRushReport\(result, labels\)/, 'the totals from the durable result');
  assert.match(writer, /if \(stored\.exists && memoryRules\.memoryIsNewer\(stored\.data\(\), memory\)\) return;/);
  assert.doesNotMatch(writer, /LIVE_CHALLENGE_PRIVATE/, 'never private state');
  assert.equal(M.CLASS_MEMORY_COLLECTION, 'liveChallengeClassMemory');
});

test('the console reads the chosen class\'s memory and the setup shows the card with its two buttons', () => {
  const teacher = read('src/components/liveChallenge/LiveChallengeTeacher.jsx');
  assert.match(teacher, /readClassGameMemory\(classId, memoryGame\)/);
  assert.match(teacher, /\}, \[memoryGame, classId, roomId\]\);/, 'read again when the class, the game, or a game\'s end changes it');
  assert.match(teacher, /<GraphFeatureRushSetup [^\n]*memory=\{classMemory\?\.game === 'graphFeatureRush' \? classMemory : null\}/);
  assert.match(teacher, /<InequalityRushSetup [^\n]*memory=\{classMemory\?\.game === 'inequalityRush' \? classMemory : null\}/);
  for (const setup of ['GraphFeatureRushSetup', 'InequalityRushSetup']) {
    assert.match(read(`src/components/liveChallenge/${setup}.jsx`), /\{memory && <ClassMemoryCard memory=\{memory\} onUse=\{onChange\} \/>\}/, setup);
  }
  const card = read('src/components/liveChallenge/ClassMemoryCard.jsx');
  assert.match(card, />Use last settings<\/button>/);
  assert.match(card, /\{offerSuggestion && <button [^>]*onClick=\{\(\) => onUse\(setupFromMemory\(memory\.game, next\.settings\)\)\}>Use suggestion<\/button>\}/);
  assert.match(read('src/platform/liveChallenge/liveChallengeService.js'), /getDoc\(doc\(db, CLASS_MEMORY_COLLECTION, id\)\)/);
});

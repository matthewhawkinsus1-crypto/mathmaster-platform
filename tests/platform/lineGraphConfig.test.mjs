import test from 'node:test';
import assert from 'node:assert/strict';

import { MAX_QUESTIONS_PER_ROUND } from '../../functions/shared/liveChallengeResponses.mjs';
import { LINE_FORM_IDS } from '../../functions/shared/lineGraphForms.mjs';
import {
  DEFAULT_SPRINT_LENGTH,
  LINE_GRAPH_PRESETS,
  LINE_ROUND_LIMITS,
  LINE_RUSH_POOL,
  LINE_SPRINT_LENGTHS,
  LINE_SPRINT_MAX_POOL,
  LineGraphConfigError,
  defaultLineGraphPresetFor,
  lineGraphConfigProblem,
  lineRoundQuestionCount,
  normalizeLineGraphConfig,
  suggestedLineRoundSeconds,
} from '../../functions/shared/lineGraphConfig.mjs';
import {
  DEFAULT_LINE_TRIES,
  LINE_ANSWER_STYLE,
  LINE_AUTO_SKIP_MISSES,
  LINE_GRAPH_FORMAT,
  LINE_GRAPH_FORMAT_IDS,
  LINE_GRAPH_MODE_IDS,
  isLineGraphMode,
  lineGraphFormatOfMode,
  lineGraphModeOfFormat,
  lineLockoutMs,
  missesAllowed,
} from '../../functions/shared/lineGraphRules.mjs';

/*
 * WHAT A TEACHER CHOOSES, AND WHAT THE GAME REFUSES.
 */

const { CLASSIC, SPRINT, RUSH } = LINE_GRAPH_FORMAT;

test('each format starts from sensible defaults', () => {
  const classic = normalizeLineGraphConfig({}, { format: CLASSIC });
  assert.equal(classic.format, CLASSIC);
  assert.equal(classic.sameEquations, true, 'a Classic class talks about one line');
  assert.equal(classic.sprintLength, null);
  assert.equal(classic.triesPerItem, DEFAULT_LINE_TRIES);
  assert.deepEqual(classic.itemTypes, ['graph']);
  assert.deepEqual(classic.forms, LINE_FORM_IDS);
  assert.equal(classic.nameStyle, 'choice');
  assert.equal(classic.showMethod, false);

  const sprint = normalizeLineGraphConfig({}, { format: SPRINT });
  assert.equal(sprint.sameEquations, false);
  assert.equal(sprint.sprintLength, DEFAULT_SPRINT_LENGTH);

  const rush = normalizeLineGraphConfig({ sprintLength: 5 }, { format: RUSH });
  assert.equal(rush.sprintLength, null, 'only a Sprint has a length');

  // The slope helper is a scaffold: on at Easy unless the teacher says otherwise.
  assert.equal(normalizeLineGraphConfig({ difficulty: 'easy' }).slopeHelper, true);
  assert.equal(normalizeLineGraphConfig({ difficulty: 'challenge' }).slopeHelper, false);
  assert.equal(normalizeLineGraphConfig({ difficulty: 'easy', slopeHelper: false }).slopeHelper, false);
});

test('the format is the mode\'s, never the request\'s', () => {
  assert.equal(normalizeLineGraphConfig({ format: RUSH }, { format: CLASSIC }).format, CLASSIC);
  assert.throws(() => normalizeLineGraphConfig({}, { format: 'marathon' }), LineGraphConfigError);
});

test('an impossible game is explained before it is created', () => {
  assert.throws(() => normalizeLineGraphConfig({ itemTypes: [] }), /Graph it, Name it, or both/);
  assert.throws(() => normalizeLineGraphConfig({ forms: ['notAForm'] }), /at least one form/);
  assert.match(lineGraphConfigProblem({ forms: [] }), /at least one form/);
  assert.equal(lineGraphConfigProblem({ presetId: 'graphAndName' }), null);
});

test('unknown values fall back to defaults, and lists come back in canonical order', () => {
  const config = normalizeLineGraphConfig({
    itemTypes: ['name', 'graph', 'graph', 'dance'],
    forms: ['pointSlope', 'slopeIntercept', 'pointSlope'],
    difficulty: 'impossible',
    triesPerItem: 7,
    nameStyle: 'essay',
    sprintLength: 12,
  }, { format: SPRINT });
  assert.deepEqual(config.itemTypes, ['graph', 'name']);
  assert.deepEqual(config.forms, ['slopeIntercept', 'pointSlope']);
  assert.equal(config.difficulty, 'standard');
  assert.equal(config.triesPerItem, DEFAULT_LINE_TRIES);
  assert.equal(config.nameStyle, 'choice');
  assert.equal(config.sprintLength, DEFAULT_SPRINT_LENGTH);
  assert.equal(normalizeLineGraphConfig({ triesPerItem: 0 }).triesPerItem, 0, '"until right" is a choice');
});

test('a preset is remembered only while the settings still match it', () => {
  for (const preset of LINE_GRAPH_PRESETS) {
    for (const format of LINE_GRAPH_FORMAT_IDS) {
      const config = normalizeLineGraphConfig({ presetId: preset.id }, { format });
      assert.equal(config.presetId, preset.id, `${preset.id} as ${format}`);
      assert.equal(config.difficulty, preset.difficulty);
      assert.equal(config.specialLines, preset.specialLines);
    }
  }
  assert.equal(normalizeLineGraphConfig({ presetId: 'graphAndName', difficulty: 'challenge' }).presetId, 'custom');
  assert.equal(normalizeLineGraphConfig({ presetId: 'graphAndName', forms: ['standard'] }).presetId, 'custom');
  assert.equal(defaultLineGraphPresetFor('algebra1').id, 'allThreeForms');
  assert.equal(defaultLineGraphPresetFor('algebra2').id, 'graphAndName');
});

test('round limits are consistent, and the suggested time is one a teacher can pick', () => {
  for (const format of LINE_GRAPH_FORMAT_IDS) {
    const limits = LINE_ROUND_LIMITS[format];
    assert.ok(limits.minRounds >= 1 && limits.minRounds <= limits.defaultRounds && limits.defaultRounds <= limits.maxRounds);
    assert.ok(limits.minSeconds >= 5 && limits.minSeconds <= limits.defaultSeconds && limits.defaultSeconds <= limits.maxSeconds);
    assert.ok(limits.secondsOptions.includes(limits.defaultSeconds));
    limits.secondsOptions.forEach((seconds) => assert.ok(seconds >= limits.minSeconds && seconds <= limits.maxSeconds));
  }
  for (const sprintLength of LINE_SPRINT_LENGTHS) {
    const seconds = suggestedLineRoundSeconds(SPRINT, { sprintLength });
    assert.ok(LINE_ROUND_LIMITS[SPRINT].secondsOptions.includes(seconds), `${sprintLength} graphs → ${seconds} s`);
    assert.ok(seconds / sprintLength >= 10, 'at least ten seconds a graph');
  }
  assert.equal(suggestedLineRoundSeconds(RUSH), LINE_ROUND_LIMITS[RUSH].defaultSeconds);
});

test('a round holds one item (Classic), its length (Sprint) or more than anyone finishes (Rush)', () => {
  assert.equal(LINE_RUSH_POOL, MAX_QUESTIONS_PER_ROUND);
  assert.ok(LINE_SPRINT_MAX_POOL <= MAX_QUESTIONS_PER_ROUND);
  assert.equal(lineRoundQuestionCount(CLASSIC), 1);
  assert.equal(lineRoundQuestionCount(SPRINT, { sprintLength: 15 }), 15);
  assert.equal(lineRoundQuestionCount(SPRINT, {}), DEFAULT_SPRINT_LENGTH);
  assert.equal(lineRoundQuestionCount(RUSH), LINE_RUSH_POOL);
});

test('each format is its own permanent mode id', () => {
  assert.deepEqual(LINE_GRAPH_MODE_IDS, ['lineGraphClassic', 'lineGraphSprint', 'lineGraphRush']);
  for (const format of LINE_GRAPH_FORMAT_IDS) {
    const mode = lineGraphModeOfFormat(format);
    assert.ok(isLineGraphMode(mode));
    assert.equal(lineGraphFormatOfMode(mode), format);
  }
  assert.equal(isLineGraphMode('graphFeatureRush'), false);
  assert.equal(isLineGraphMode('toString'), false, 'not fooled by the prototype');
  assert.equal(lineGraphFormatOfMode(undefined), null);
});

test('tries: a chosen equation gets one; a line gets the teacher\'s number; "until right" still moves a stuck student on', () => {
  assert.equal(missesAllowed({ triesPerItem: 3, answerStyle: LINE_ANSWER_STYLE.CHOICE }), 1);
  assert.equal(missesAllowed({ triesPerItem: 1 }), 1);
  assert.equal(missesAllowed({ triesPerItem: 2 }), 2);
  assert.equal(missesAllowed({ triesPerItem: 3, answerStyle: LINE_ANSWER_STYLE.BUILD }), 3);
  assert.equal(missesAllowed({ triesPerItem: 0 }), LINE_AUTO_SKIP_MISSES);
  assert.equal(missesAllowed({ triesPerItem: 9 }), DEFAULT_LINE_TRIES);
  assert.equal(missesAllowed(), DEFAULT_LINE_TRIES);
});

test('repeated mistakes pause input for longer, never more than four seconds', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(lineLockoutMs), [0, 0, 1_000, 2_000, 3_000, 4_000, 4_000]);
});

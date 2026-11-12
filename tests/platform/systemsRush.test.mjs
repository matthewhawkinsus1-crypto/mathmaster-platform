import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as S from '../../functions/shared/systemsRush.mjs';
import * as G from '../../functions/shared/systemsGenerator.mjs';
import * as I from '../../functions/shared/inequalityRush.mjs';
import * as M from '../../functions/shared/liveChallengeClassMemory.mjs';
import { SYSTEMS_GUIDE_TITLE, SYSTEMS_READING, systemsReadingGuide, systemsRoundSolutionRecord } from '../../functions/shared/systemsReading.mjs';
import { applyRushAttempts, buildRushReport, rushTapDiagnosis } from '../../functions/shared/graphFeatureRush.mjs';
import { generateRushQuestion, publicRushQuestion } from '../../functions/shared/graphFeatureGenerator.mjs';
import { normalizeGraphFeatureRushConfig } from '../../functions/shared/graphFeatureRushConfig.mjs';
import {
  RUSH_ATTEMPT_KIND,
  RUSH_AUTO_SKIP_MISSES,
  RUSH_MODE_ID,
  RUSH_REVEAL_PAUSE_MS,
  RUSH_SET_AUTO_SKIP_MISSES,
  SYSTEMS_RUSH_MODE_ID,
  isRushModeId,
  rushAutoSkipMisses,
  rushPressAnswer,
} from '../../functions/shared/graphFeatureRushRules.mjs';
import {
  CHALLENGE_MODE_ID,
  QUESTION_ISSUE,
  QUESTION_SOURCE,
  ROUND_STRUCTURE,
  getChallengeMode,
  listChallengeModes,
  normalizeModeConfig,
} from '../../functions/shared/liveChallengeModes.mjs';
import { correctCountStrategy } from '../../functions/shared/liveChallengeScoring.mjs';
import { REPORT_STUDENT_ROW_PATHS, reportRowsWithout, reportStudentIds } from '../../functions/shared/liveChallengeReport.mjs';
import { questionSetMatchSummary } from '../../functions/shared/liveChallengeResults.mjs';
import { publicSolutionDocument } from '../../functions/shared/liveChallengeSolutionReveal.mjs';
import { projectorSteps, solutionTitle } from '../../src/platform/liveChallenge/challengeSolutionModel.js';
import { QUESTION_SET_GAME, isRushGame, questionSetGameOf, roomRoundsEndOnTheClock, roomRunsQuestionSets, rushGameWords } from '../../src/platform/liveChallenge/challengeShellModel.js';
import { replayRequestFromRoom, replaySummary } from '../../src/platform/liveChallenge/challengeReplayModel.js';
import { changeSystemsSetup, defaultSystemsSetup, systemsCreateRequest, systemsSetupFromPreset, systemsSetupProblem } from '../../src/platform/liveChallenge/systemsSetupModel.js';
import { SYSTEM_LABEL_CLEARANCE, SYSTEM_LABEL_INSET, describeCursor, graphDrawing, systemDrawing, systemLineExits, unitX, unitY } from '../../src/platform/liveChallenge/rushGraphModel.js';
import {
  RUSH_FEEDBACK,
  RUSH_INPUT,
  SYSTEM_INTERCEPT_KIND,
  SYSTEM_SOLUTION_KIND,
  acknowledge,
  createRushSession,
  currentQuestion,
  differsFromServer,
  feedbackMessage,
  feedbackReserve,
  inputState,
  newAttemptId,
  nextBatch,
  promptReserve,
  recordCannotDetermine,
  recordDoesNotExist,
  recordInfinitelyMany,
  recordSkip,
  recordTap,
  rushItemKind,
  rushRoundKinds,
  settle,
} from '../../src/platform/liveChallenge/rushSession.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

/*
 * SYSTEMS OF EQUATIONS RUSH (docs/architecture/systems-rush.md).
 *
 * Every item is checked against an INDEPENDENT ORACLE that reads only what a
 * student's device receives — the two lines in plain numbers — and works the
 * system out again from scratch: each line as A·x + B·y = C, the system by
 * Cramer's rule (a zero determinant is parallel lines, or one line twice when
 * the equations are multiples), each intercept where its line meets the
 * axis. The generator's exact answer, its kind, its targets and its press
 * must agree with the oracle on every item of every slot at every tier.
 */

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const TIERS = ['easy', 'standard', 'challenge'];
const near = (a, b, epsilon = 1e-9) => Math.abs(a - b) <= epsilon;

/* --------------------------------- oracle --------------------------------- */

const standardForm = (line) => {
  if (line.orientation === 'vertical') return [1, 0, line.x];
  if (line.orientation === 'horizontal') return [0, 1, line.y];
  return [-line.m, 1, line.b];
};
const oracleSolve = (left, right) => {
  const [a1, b1, c1] = standardForm(left);
  const [a2, b2, c2] = standardForm(right);
  const det = a1 * b2 - a2 * b1;
  if (Math.abs(det) < 1e-12) {
    const same = near(a1 * c2, a2 * c1) && near(b1 * c2, b2 * c1);
    return { kind: same ? 'infinite' : 'none' };
  }
  return { kind: 'one', x: (c1 * b2 - c2 * b1) / det, y: (a1 * c2 - a2 * c1) / det };
};
const oracleIntercept = (line, axis) => {
  const [a, b, c] = standardForm(line);
  if (axis === 'y') return b === 0 ? null : { x: 0, y: c / b };
  return a === 0 ? null : { x: c / a, y: 0 };
};
const oracleIntercepts = (lines, axis) => {
  const points = [];
  lines.map((line) => oracleIntercept(line, axis)).filter(Boolean).forEach((point) => {
    if (!points.some((other) => near(other.x, point.x) && near(other.y, point.y))) points.push(point);
  });
  return points;
};
const onLine = (line, point) => {
  const [a, b, c] = standardForm(line);
  return near(a * point.x + b * point.y, c, 1e-9);
};
// Inside a grid square: both coordinates a quarter to 0.4 of a square from a
// grid line, and the point at least 0.4 of a square from every grid point.
const offGridBy = (value) => {
  const fraction = value - Math.floor(value);
  return Math.min(fraction, 1 - fraction);
};
const insideASquare = (point) => [point.x, point.y].every((value) => offGridBy(value) >= 0.25 - 1e-9 && offGridBy(value) <= 0.4 + 1e-9)
  && Math.hypot(offGridBy(point.x), offGridBy(point.y)) >= 0.4 - 1e-9;
const onGrid = (value, denominator) => near(value * denominator, Math.round(value * denominator));
const insetFrom = (point, view, inset) => {
  const span = view.xMax - view.xMin;
  return point.x - view.xMin >= inset * span - 1e-9 && view.xMax - point.x >= inset * span - 1e-9
    && point.y - view.yMin >= inset * span - 1e-9 && view.yMax - point.y >= inset * span - 1e-9;
};
const angleBetween = (left, right) => {
  const direction = (line) => (line.orientation === 'vertical' ? [0, 1] : [1, line.orientation === 'horizontal' ? 0 : line.m]);
  const [ax, ay] = direction(left);
  const [bx, by] = direction(right);
  return (Math.acos(Math.min(1, Math.abs(ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by)))) * 180) / Math.PI;
};

// Every slot a game can draw: each kind's variants, each question it is asked with, each tier from its first.
const ALL_SLOTS = S.SYSTEM_KIND_IDS.flatMap((kind) => G.systemVariantsOf(kind).flatMap((variant) => variant.questions.flatMap((question) => TIERS
  .filter((tier) => TIERS.indexOf(tier) >= TIERS.indexOf(variant.minTier))
  .map((tier) => ({ question, kind, variant: variant.id, tier, solutions: variant.solutions, pastEdge: variant.pastEdge === true })))));

const EXPECTED_SOLUTIONS = Object.freeze({ one: 'one', none: 'none', infinite: 'infinite' });

/* ------------------------------- the answers ------------------------------- */

test('every item, of every slot at every tier, is exactly what an independent reading of its two lines says', () => {
  let items = 0;
  let worst = 0;
  for (const slot of ALL_SLOTS) {
    for (let seed = 0; seed < 30; seed += 1) {
      const item = G.generateSystemItem({ slot, seedText: `oracle-${seed}` });
      const where = `${slot.kind}/${slot.variant}/${slot.question}/${slot.tier} #${seed}`;
      items += 1;
      worst = Math.max(worst, item.attempts);
      assert.equal(item.fallback, false, `${where}: built, never a fallback`);
      assert.equal(item.kind, S.SYSTEM_ITEM_KIND);
      const { lines, view, targets } = item;
      assert.equal(lines.length, 2);
      // The window: a square around the origin, a grid line at every whole number.
      assert.deepEqual([view.xMin, view.yMin, view.xStep, view.yStep], [-view.xMax, -view.yMax, 1, 1], `${where}: a square unit grid around the origin`);
      assert.equal(view.xMax, view.yMax);
      assert.ok(view.xMax <= 10);
      // Never an axis, never too steep or too flat to read where it crosses one.
      lines.forEach((line) => {
        if (line.orientation === 'vertical') assert.notEqual(line.x, 0, `${where}: a line is never the y-axis`);
        if (line.orientation === 'horizontal') assert.notEqual(line.y, 0, `${where}: a line is never the x-axis`);
        if (line.orientation === 'slanted') assert.ok(Math.abs(line.m) <= 3 + 1e-9 && Math.abs(line.m) >= 1 / 3 - 1e-9, `${where}: slope ${line.m}`);
      });
      const solved = oracleSolve(lines[0], lines[1]);
      assert.equal(solved.kind, EXPECTED_SOLUTIONS[slot.solutions], `${where}: the system has ${slot.solutions} solution(s)`);
      if (slot.kind === S.SYSTEM_KIND.SAME_LINE) assert.equal(solved.kind, 'infinite');
      if (slot.kind === S.SYSTEM_KIND.PARALLEL) assert.equal(solved.kind, 'none');
      if (slot.question === S.SYSTEM_QUESTION.SOLUTION) {
        if (S.CROSSING_KINDS.includes(slot.kind)) {
          // One solution, at a grid point, well inside: the one target.
          assert.equal(targets.length, 1, where);
          assert.ok(near(targets[0].x, solved.x) && near(targets[0].y, solved.y), `${where}: the target is the crossing`);
          assert.ok(Number.isInteger(targets[0].x) && Number.isInteger(targets[0].y), `${where}: a grid point`);
          assert.ok(insetFrom(targets[0], view, 0.1), `${where}: well inside`);
          assert.ok(angleBetween(lines[0], lines[1]) >= 15 - 1e-9, `${where}: a clear crossing`);
          assert.equal(rushPressAnswer(item), null, 'tapped, not pressed');
        } else if (slot.kind === S.SYSTEM_KIND.CANNOT_DETERMINE) {
          assert.deepEqual(targets, [], where);
          assert.equal(rushPressAnswer(item), RUSH_ATTEMPT_KIND.CANNOT_DETERMINE, where);
          assert.ok(near(item.crossing.x, solved.x) && near(item.crossing.y, solved.y), `${where}: the crossing it names is the system's`);
          assert.ok(insideASquare(solved), `${where}: (${solved.x}, ${solved.y}) is plainly inside a grid square`);
          assert.ok(item.crossingText.length <= S.MAX_CROSSING_TEXT, item.crossingText);
          if (slot.pastEdge) {
            assert.equal(item.pastEdge, true);
            const far = Math.max(Math.abs(solved.x), Math.abs(solved.y));
            assert.ok(far >= 1.35 * view.xMax - 1e-9 && far <= 2.5 * view.xMax + 1e-9, `${where}: plainly past the edge (a third of a half-side out), not far past it`);
            assert.ok(angleBetween(lines[0], lines[1]) >= 20 - 1e-9, `${where}: plainly closing in`);
          } else {
            assert.ok(insetFrom(solved, view, 0.15), `${where}: well inside the view`);
            assert.ok(view.xMax <= 7, `${where}: grid squares never small`);
            assert.ok(angleBetween(lines[0], lines[1]) >= 25 - 1e-9, `${where}: a plainly placed crossing`);
          }
        } else if (slot.kind === S.SYSTEM_KIND.PARALLEL) {
          assert.deepEqual(targets, [], where);
          assert.equal(rushPressAnswer(item), RUSH_ATTEMPT_KIND.DOES_NOT_EXIST, `${where}: No Solution`);
        } else {
          assert.deepEqual(targets, [], where);
          assert.equal(rushPressAnswer(item), RUSH_ATTEMPT_KIND.INFINITELY_MANY, `${where}: Infinitely Many`);
        }
      } else {
        // An intercept question: exactly each line's intercept with the axis, once each.
        const axis = slot.question === S.SYSTEM_QUESTION.Y_INTERCEPT ? 'y' : 'x';
        const expected = oracleIntercepts(lines, axis);
        assert.equal(targets.length, expected.length, `${where}: ${expected.length} intercept(s)`);
        expected.forEach((point) => assert.ok(targets.some((target) => near(target.x, point.x) && near(target.y, point.y)), `${where}: (${point.x}, ${point.y})`));
        if (!expected.length) {
          assert.equal(rushPressAnswer(item), RUSH_ATTEMPT_KIND.DOES_NOT_EXIST, `${where}: Does Not Exist`);
          assert.notEqual(slot.tier, 'easy', 'Easy always has an intercept to find');
        }
        const grid = slot.tier === 'easy' ? 1 : 2;
        targets.forEach((target) => {
          assert.ok(onGrid(target.x, grid) && onGrid(target.y, grid), `${where}: on the grid`);
          assert.ok(insetFrom(target, view, 0.08), `${where}: well inside`);
          if (slot.tier === 'easy') assert.ok(target.x !== 0 || target.y !== 0, `${where}: never the origin at Easy`);
        });
        if (slot.tier === 'easy' && slot.kind !== S.SYSTEM_KIND.SAME_LINE) {
          assert.equal(lines.map((line) => oracleIntercept(line, axis)).filter(Boolean).length, targets.length, `${where}: no shared intercept at Easy`);
        }
      }
      // Targets a fingertip apart.
      for (let i = 0; i < targets.length; i += 1) {
        for (let j = i + 1; j < targets.length; j += 1) {
          assert.ok(Math.hypot(targets[i].x - targets[j].x, targets[i].y - targets[j].y) / (view.xMax - view.xMin) >= 0.15 - 1e-9, `${where}: targets apart`);
        }
      }
      // Each target is on a line, and every one is worth a point.
      targets.forEach((target) => assert.ok(lines.some((line) => onLine(line, target)), `${where}: on a line`));
      assert.equal(item.weight, Math.max(1, targets.length));
      assert.equal(item.targetCount, Math.max(1, targets.length));
    }
  }
  assert.ok(items > 2000, `${items} items`);
  assert.ok(worst < G.MAX_SYSTEM_ATTEMPTS / 2, `the worst slot took ${worst} attempts of ${G.MAX_SYSTEM_ATTEMPTS}`);
});

test('parallel lines are plainly apart, and every line crosses most of its graph', () => {
  for (const slot of ALL_SLOTS) {
    for (let seed = 0; seed < 12; seed += 1) {
      const item = G.generateSystemItem({ slot, seedText: `visible-${seed}` });
      const span = item.view.xMax - item.view.xMin;
      item.lines.forEach((line) => assert.ok(S.chordFraction(line, item.view) >= (slot.kind === S.SYSTEM_KIND.SAME_LINE ? 0.7 : 0.6) - 1e-9, `${slot.kind}/${slot.variant}: a line barely shown`));
      if (oracleSolve(item.lines[0], item.lines[1]).kind === 'none') {
        assert.ok(S.parallelGap(item.lines[0], item.lines[1]) >= Math.max(1.5, 0.1 * span) - 1e-9, `${slot.kind}/${slot.variant}: parallel lines apart`);
      }
    }
  }
});

test('the kinds follow the levels: Easy asks plainly, Standard brings shared intercepts and "Does Not Exist", Challenge meets past the edge', () => {
  const variantIds = (kind, tier, question) => G.systemsSlotCatalog({ questions: [question], kinds: [kind] }, tier).map((slot) => slot.variant);
  assert.deepEqual(variantIds('slanted', 'easy', 'yIntercept'), ['cross']);
  assert.deepEqual(variantIds('slanted', 'standard', 'yIntercept'), ['cross', 'shareY', 'shareX']);
  assert.deepEqual(variantIds('levelUpright', 'easy', 'xIntercept'), ['uprightSlanted', 'levelSlanted', 'uprightLevel']);
  assert.deepEqual(variantIds('levelUpright', 'standard', 'xIntercept'), ['uprightSlanted', 'levelSlanted', 'uprightLevel', 'twoLevel', 'twoUpright']);
  assert.deepEqual(variantIds('levelUpright', 'standard', 'solution'), ['uprightSlanted', 'levelSlanted', 'uprightLevel'], 'two level lines are never a solution question of this kind: No Solution belongs to parallel lines');
  assert.deepEqual(variantIds('cannotDetermine', 'standard', 'solution'), ['between']);
  assert.deepEqual(variantIds('cannotDetermine', 'challenge', 'solution'), ['between', 'pastEdge']);
  assert.deepEqual(variantIds('cannotDetermine', 'challenge', 'xIntercept'), ['between'], 'past the edge is a solution question\'s');
  assert.deepEqual(variantIds('parallel', 'easy', 'solution'), ['slanted']);
  assert.deepEqual(variantIds('sameLine', 'standard', 'solution'), ['slanted', 'level', 'upright']);
  // The words: Easy asks where the lines intersect; Challenge, the solution of the system.
  const prompts = (tier) => new Set(Array.from({ length: 40 }, (_, index) => G.generateSystemItem({ slot: { question: 'solution', kind: 'slanted', variant: 'cross', tier }, seedText: `words-${index}` }).prompt));
  assert.deepEqual([...prompts('easy')], ['Find where the two lines intersect']);
  assert.deepEqual([...prompts('standard')].sort(), ['Find the solution of the system', 'Find where the two lines intersect']);
  assert.deepEqual([...prompts('challenge')], ['Find the solution of the system']);
  // Every prompt a round can ask is in its room, and nothing else.
  for (const preset of S.SYSTEMS_RUSH_PRESETS) {
    const config = S.normalizeSystemsRushConfig({ presetId: preset.id });
    const room = new Set(promptReserve({ systems: config }).map((ask) => ask.prompt));
    for (let index = 0; index < 36; index += 1) {
      const item = G.generateSystemsQuestion({ seed: `room-${preset.id}`, studentKey: 'a', roundIndex: 0, questionIndex: index, config });
      assert.ok(room.has(item.prompt), `${preset.id}: "${item.prompt}" is in the room`);
    }
  }
});

test('items are deterministic, every student shares each block\'s slots in their own order, and none repeats its neighbour', () => {
  const config = S.normalizeSystemsRushConfig({ presetId: 'everySystem' });
  const make = (studentKey, questionIndex) => G.generateSystemsQuestion({ seed: 'det', studentKey, roundIndex: 0, questionIndex, config });
  assert.deepEqual(make('a', 3), make('a', 3), 'the same inputs, the same item');
  for (let block = 0; block < 3; block += 1) {
    const slotsOf = (studentKey) => Array.from({ length: G.SYSTEMS_BLOCK_SIZE }, (_, offset) => {
      const slot = G.systemsSlot({ seed: 'det', studentKey, roundIndex: 0, questionIndex: block * G.SYSTEMS_BLOCK_SIZE + offset, config });
      return `${slot.question}|${slot.kind}|${slot.variant}|${slot.tier}`;
    });
    assert.deepEqual(slotsOf('a').sort(), slotsOf('b').sort(), `block ${block}: the same six slots`);
  }
  for (let index = 1; index < 60; index += 1) {
    const [before, after] = [make('a', index - 1), make('a', index)];
    if (before.feature === after.feature && before.family === after.family) assert.notDeepEqual(before.lines, after.lines, `item ${index} repeats item ${index - 1}`);
  }
  assert.notEqual(G.generateSystemsQuestion({ seed: 'other', studentKey: 'a', roundIndex: 0, questionIndex: 0, config }).lines, make('a', 0).lines);
  // A device receives the lines and the answer — never the graph's other features.
  const item = make('a', 0);
  const device = G.publicSystemsQuestion(item);
  assert.equal(device.graphFeatures, undefined);
  assert.equal(device.fallback, undefined);
  assert.deepEqual(device.lines, item.lines);
});

test('each question gets its share, each kind its weight, and the Mixed ramp starts gentle', () => {
  const config = S.normalizeSystemsRushConfig({ presetId: 'everySystem' });
  const catalog = G.systemsSlotCatalog(config, 'standard');
  const share = (filter) => catalog.filter(filter).reduce((sum, slot) => sum + slot.weight, 0);
  assert.ok(near(share(() => true), 1));
  for (const question of S.SYSTEM_QUESTION_IDS) assert.ok(near(share((slot) => slot.question === question), 1 / 3), question);
  // Of the solution questions, the two kinds to tap get twice the special ones' share.
  const solution = (kind) => share((slot) => slot.question === 'solution' && slot.kind === kind);
  assert.ok(near(solution('slanted'), 2 * solution('parallel')) && near(solution('parallel'), solution('sameLine')));
  assert.deepEqual(G.systemsBlockTiers('mixed', 0), ['easy', 'easy', 'standard', 'easy', 'standard', 'standard']);
  assert.deepEqual(G.systemsBlockTiers('easy', 4), Array(6).fill('easy'));
});

/* ------------------------------ the two lines ------------------------------ */

test('the same line twice is drawn as two lines, one on the other, labelled at opposite ends', () => {
  let checked = 0;
  for (const variant of ['slanted', 'level', 'upright']) {
    for (let seed = 0; seed < 20; seed += 1) {
      const item = G.publicSystemsQuestion(G.generateSystemItem({ slot: { question: 'solution', kind: 'sameLine', variant, tier: 'standard' }, seedText: `same-${seed}` }));
      const drawing = graphDrawing(item);
      assert.equal(drawing, systemDrawing(item) && graphDrawing(item), 'drawn once per item');
      const [one, two] = drawing.system;
      assert.deepEqual([one.id, two.id], [1, 2], 'both lines are drawn');
      assert.deepEqual([one.from, one.to], [two.from, two.to], 'on the same place');
      // Labelled at opposite ends: 1 by one exit, 2 by the other — on the line, or just beside it.
      const distance = Math.hypot(one.label.u - two.label.u, one.label.v - two.label.v);
      assert.ok(distance >= 0.45, `${variant}: the labels sit ${distance.toFixed(2)} apart`);
      const byEnd = (label, end) => Math.hypot(label.u - end.u, label.v - end.v) <= 2 * SYSTEM_LABEL_INSET + 0.06;
      assert.ok(byEnd(one.label, one.to) && byEnd(two.label, two.from), `${variant}: line 1 at its right (top) end, line 2 at its left (bottom) end`);
      // Each keeps going both ways: an arrowhead at both exits, pointing out.
      [one, two].forEach((line) => {
        assert.equal(line.arrows.length, 2);
        line.arrows.forEach((arrow) => assert.ok(arrow.u <= 1e-9 || arrow.u >= 1 - 1e-9 || arrow.v <= 1e-9 || arrow.v >= 1 - 1e-9, 'an arrow on the edge'));
      });
      checked += 1;
    }
  }
  assert.equal(checked, 60);
  // The strokes: line 1 solid and wide; line 2 dashed and narrow on top, inside a casing narrower than line 1,
  // so line 1 shows at both edges of every dash and whole in every gap.
  const graph = read('src/components/liveChallenge/GraphFeatureRushGraph.jsx');
  const stroke = /export const SYSTEM_STROKE = Object\.freeze\(\{ line1: (\d+(?:\.\d+)?), casing: (\d+(?:\.\d+)?), line2: (\d+(?:\.\d+)?), dash: '(\d+) (\d+)' \}\);/.exec(graph);
  assert.ok(stroke, 'the strokes are declared');
  const [line1, casing, line2] = stroke.slice(1, 4).map(Number);
  assert.ok(line1 - casing >= 2 && casing - line2 >= 2, `line 1 ${line1}px > casing ${casing}px > line 2 ${line2}px, each a clear step`);
  const lines = region(graph, 'function SystemLines(', '\n}\n', 'the two lines');
  assert.ok(lines.indexOf('var(--mm-rush-line1)') < lines.indexOf('var(--mm-rush-line2)'), 'line 2 is drawn over line 1');
  assert.match(lines, /<line \{\.\.\.ends\(line\)\} stroke="var\(--mm-graph-bg\)" strokeWidth=\{SYSTEM_STROKE\.casing\} strokeDasharray=\{SYSTEM_STROKE\.dash\} data-mm-plane-part="halo" \/>\s*<line \{\.\.\.ends\(line\)\} stroke="var\(--mm-rush-line2\)" strokeWidth=\{SYSTEM_STROKE\.line2\} strokeDasharray=\{SYSTEM_STROKE\.dash\} data-mm-plane-part="line" \/>/, 'line 2: its casing, then its dashes');
  assert.doesNotMatch(region(lines, 'line.id === 1 ?', ') : (', 'line 1'), /strokeDasharray/, 'line 1 is solid');
  // In a contrast theme both lines are the text colour, and the casing the board's.
  const forced = read('src/theme/forcedColors.css');
  assert.match(forced, /--mm-rush-line1: CanvasText !important;\s*--mm-rush-line2: CanvasText !important;/);
  assert.match(forced, /\[data-mm-plane-part="halo"\] \{\s*stroke: Canvas !important;/);
});

test('every system\'s lines run edge to edge, labelled clear of every target and of each other', () => {
  const config = S.normalizeSystemsRushConfig({ presetId: 'everySystem' });
  for (let index = 0; index < 600; index += 1) {
    const item = G.publicSystemsQuestion(G.generateSystemsQuestion({ seed: 'labels', studentKey: `s${index % 5}`, roundIndex: 0, questionIndex: index, config }));
    const drawing = systemDrawing(item);
    assert.equal(drawing.system.length, 2);
    drawing.system.forEach((line, which) => {
      const exits = systemLineExits(item.view, item.lines[which]);
      assert.deepEqual([line.from, line.to], exits);
      [line.from, line.to].forEach((end) => assert.ok(end.u <= 1e-9 || end.u >= 1 - 1e-9 || end.v <= 1e-9 || end.v >= 1 - 1e-9, 'exits on the edge'));
    });
    const taps = [...item.targets, ...(item.crossing ? [item.crossing] : [])].map((point) => ({ u: unitX(item.view, point.x), v: unitY(item.view, point.y) }));
    const [one, two] = drawing.system.map((line) => line.label);
    const clearOf = (label, points) => points.every((point) => Math.hypot(label.u - point.u, label.v - point.v) >= SYSTEM_LABEL_CLEARANCE - 1e-9);
    // Clear of everything a student taps, and of each other; and whole inside the plot.
    assert.ok(clearOf(one, taps) && clearOf(two, [...taps, one]), `item ${index}: labels clear`);
    [one, two].forEach((label) => assert.ok(label.u > 0.03 && label.u < 0.97 && label.v > 0.03 && label.v < 0.97, `item ${index}: a label whole on the plot`));
  }
});

test('a screen reader hears where each line is at the cursor — what is there, never what it means', () => {
  const slanted = { kind: 'system', lines: [{ id: 1, orientation: 'slanted', m: 2, b: -1 }, { id: 2, orientation: 'vertical', x: 3 }], view: { xMin: -6, xMax: 6, yMin: -6, yMax: 6, xStep: 1, yStep: 1 }, targets: [] };
  assert.equal(describeCursor(slanted, { x: 1, y: 0 }), 'Pointer at (1, 0). Line 1 is at y 1. Line 2 is the vertical line x = 3.');
  assert.equal(describeCursor(slanted, { x: 3, y: 0 }), 'Pointer at (3, 0). Line 1 is at y 5. Line 2 runs straight up and down through this x.');
  const same = { ...slanted, lines: [{ id: 1, orientation: 'horizontal', y: 2 }, { id: 2, orientation: 'horizontal', y: 2 }] };
  const heard = describeCursor(same, { x: -2, y: 1 });
  assert.equal(heard, 'Pointer at (−2, 1). Line 1 is at y 2. Line 2 is at y 2.');
  assert.doesNotMatch(heard, /same|infinit|parallel|solution/i, 'never the answer');
  // The graph's own name says which line is which.
  assert.match(read('src/components/liveChallenge/GraphFeatureRushRound.jsx'), /if \(systemItem\) graphLabel = `\$\{question\.prompt\}\. Two lines: line 1 solid, line 2 dashed\. Tap the graph, or use the arrow keys and Enter\.`;/);
});

/* --------------------------------- settings -------------------------------- */

test('settings: the levels follow the class\'s order, presets fill in and stay named only while they match', () => {
  assert.deepEqual(S.SYSTEMS_RUSH_PRESETS.map((preset) => preset.id), ['intercepts', 'whereTheyIntersect', 'solutionOfTheSystem', 'horizontalVertical', 'cannotDetermine', 'noneOrInfinite', 'everySystem']);
  const level = (id) => S.normalizeSystemsRushConfig({ presetId: id });
  assert.deepEqual([level('intercepts').questions, level('intercepts').kinds, level('intercepts').difficulty], [['yIntercept', 'xIntercept'], ['slanted'], 'easy']);
  assert.ok(level('whereTheyIntersect').questions.includes('solution'));
  assert.deepEqual(level('solutionOfTheSystem').questions, ['solution']);
  assert.ok(level('horizontalVertical').kinds.includes('levelUpright'));
  assert.deepEqual(level('cannotDetermine').kinds, ['slanted', 'cannotDetermine']);
  assert.deepEqual(level('noneOrInfinite').kinds, ['slanted', 'parallel', 'sameLine']);
  assert.deepEqual([level('everySystem').questions.length, level('everySystem').kinds.length, level('everySystem').difficulty], [3, 5, 'mixed']);
  // Canonical order, and a preset only while the settings match it.
  assert.deepEqual(S.normalizeSystemsRushConfig({ questions: ['solution', 'yIntercept'], kinds: ['parallel', 'slanted'], difficulty: 'easy' }), { presetId: 'custom', questions: ['yIntercept', 'solution'], kinds: ['slanted', 'parallel'], difficulty: 'easy' });
  assert.equal(S.normalizeSystemsRushConfig({ presetId: 'intercepts', difficulty: 'standard' }).presetId, 'custom');
  // Refusals a teacher can act on.
  assert.equal(S.systemsConfigProblem({ questions: [], kinds: ['slanted'] }), 'Choose at least one question for students to answer.');
  assert.equal(S.systemsConfigProblem({ questions: ['yIntercept'], kinds: [] }), 'Choose at least one kind of system.');
  assert.match(S.systemsConfigProblem({ questions: ['solution'], kinds: ['parallel', 'sameLine'] }), /need some systems with one solution to tap/);
  assert.equal(S.systemsConfigProblem({ questions: ['yIntercept'], kinds: ['parallel'] }), null, 'parallel lines have intercepts to find');
  assert.throws(() => S.normalizeSystemsRushConfig({ questions: ['solution'], kinds: ['cannotDetermine'] }), (error) => error.name === 'SystemsRushConfigError');
  // The buttons a solution question offers are the game's special kinds, in one order.
  assert.deepEqual(S.systemAnswerButtons(level('everySystem')).map((button) => button.label), ['No Solution', 'Infinitely Many', 'Can\'t Be Determined']);
  assert.deepEqual(S.systemAnswerButtons(level('solutionOfTheSystem')), []);
  assert.deepEqual(S.systemAnswerButtons(level('cannotDetermine')).map((button) => button.press), [RUSH_ATTEMPT_KIND.CANNOT_DETERMINE]);
});

test('the mode is a per-player question-set race on the rush\'s terms, with its own source and settings', () => {
  const mode = getChallengeMode(SYSTEMS_RUSH_MODE_ID);
  const rush = getChallengeMode(RUSH_MODE_ID);
  assert.equal(mode.id, CHALLENGE_MODE_ID.SYSTEMS_RUSH);
  assert.equal(mode.label, 'Systems of Equations Rush');
  assert.equal(mode.questionSource, QUESTION_SOURCE.SYSTEMS_GENERATOR);
  assert.equal(mode.roundStructure, ROUND_STRUCTURE.QUESTION_SET);
  assert.equal(mode.questionIssue, QUESTION_ISSUE.PER_PLAYER);
  assert.equal(mode.questionSpecs.length, rush.questionSpecs.length, 'the rush\'s pool');
  assert.deepEqual(mode.scoringStrategies, rush.scoringStrategies);
  assert.deepEqual(mode.scoringDefaults, rush.scoringDefaults, 'Grand Prix on the field curve');
  assert.equal(mode.teacherSelectable, true);
  assert.ok(listChallengeModes({ teacherSelectable: true }).some((entry) => entry.id === SYSTEMS_RUSH_MODE_ID));
  assert.equal(mode.capabilities.warmupLink, false);
  assert.equal(mode.capabilities.secondChance, false);
  assert.equal(normalizeModeConfig(mode, { systemsRush: { presetId: 'noneOrInfinite' } }).systemsRush.presetId, 'noneOrInfinite');
  assert.throws(() => normalizeModeConfig(mode, { systemsRush: { questions: [] } }), (error) => error.name === 'SystemsRushConfigError');
  // The client's one place for mode ids agrees.
  assert.ok(isRushModeId(SYSTEMS_RUSH_MODE_ID));
  assert.equal(questionSetGameOf({ challengeMode: SYSTEMS_RUSH_MODE_ID }), QUESTION_SET_GAME.SYSTEMS_RUSH);
  assert.equal(isRushGame(QUESTION_SET_GAME.SYSTEMS_RUSH), true);
  assert.equal(roomRunsQuestionSets({ challengeMode: SYSTEMS_RUSH_MODE_ID }), true);
  assert.equal(roomRoundsEndOnTheClock({ challengeMode: SYSTEMS_RUSH_MODE_ID }), true, 'a rush ends on the clock');
  const words = rushGameWords({ challengeMode: SYSTEMS_RUSH_MODE_ID });
  assert.equal(words.game, 'Systems of Equations Rush');
  assert.deepEqual([words.one, words.many], ['system', 'systems']);
});

/* --------------------------------- grading --------------------------------- */

const itemOf = (slot, test = () => true, prefix = 'pick') => {
  for (let index = 0; index < 400; index += 1) {
    const item = G.generateSystemItem({ slot, seedText: `${prefix}-${index}` });
    if (test(item)) return item;
  }
  throw new Error(`no ${slot.kind}/${slot.variant}/${slot.question} item passed the test`);
};
const asItem = (question, questionIndex) => G.publicSystemsQuestion({ ...question, questionIndex });
const grade = (questions, attempts, player = {}) => applyRushAttempts({
  player,
  roundIndex: 0,
  roundVersion: 1,
  attempts,
  questionFor: (index) => questions[index] || null,
  arrivedAtMs: 600_000,
  arrivalElapsedMs: 600_000,
  roundDurationMs: 600_000,
  strategy: correctCountStrategy,
  poolSize: questions.length,
});
const TOLERANCE = Object.freeze({ x: 0.4, y: 0.4 });
const tap = (questionIndex, point) => ({ attemptId: newAttemptId(), questionIndex, kind: RUSH_ATTEMPT_KIND.TAP, x: point.x, y: point.y, tolerance: TOLERANCE, pointer: 'mouse' });
const press = (questionIndex, kind) => ({ attemptId: newAttemptId(), questionIndex, kind });
const verdictOf = (question, attempt) => grade([{ ...question, questionIndex: 0 }], [{ ...attempt, questionIndex: 0 }]).verdicts[0].verdict;

const ONE = { question: 'solution', kind: 'slanted', variant: 'cross', tier: 'standard' };
const NONE = { question: 'solution', kind: 'parallel', variant: 'slanted', tier: 'standard' };
const SAME = { question: 'solution', kind: 'sameLine', variant: 'slanted', tier: 'standard' };
const BETWEEN = { question: 'solution', kind: 'cannotDetermine', variant: 'between', tier: 'standard' };
const PAST = { question: 'solution', kind: 'cannotDetermine', variant: 'pastEdge', tier: 'challenge' };

test('the server grades each press only where it is the answer, and a tap on the solution or each intercept', () => {
  const answers = [
    [itemOf(ONE), null],
    [itemOf(NONE), RUSH_ATTEMPT_KIND.DOES_NOT_EXIST],
    [itemOf(SAME), RUSH_ATTEMPT_KIND.INFINITELY_MANY],
    [itemOf(BETWEEN), RUSH_ATTEMPT_KIND.CANNOT_DETERMINE],
    [itemOf(PAST), RUSH_ATTEMPT_KIND.CANNOT_DETERMINE],
    [itemOf({ question: 'xIntercept', kind: 'levelUpright', variant: 'twoLevel', tier: 'standard' }), RUSH_ATTEMPT_KIND.DOES_NOT_EXIST],
  ];
  const presses = [RUSH_ATTEMPT_KIND.DOES_NOT_EXIST, RUSH_ATTEMPT_KIND.INFINITELY_MANY, RUSH_ATTEMPT_KIND.CANNOT_DETERMINE];
  for (const [question, answer] of answers) {
    for (const kind of presses) {
      assert.equal(verdictOf(question, press(0, kind)), kind === answer ? 'hit' : 'miss', `${question.family}/${question.variant}: ${kind}`);
    }
  }
  // A tap: the solution, each intercept; the crossing of a system the graph can't show is a miss.
  const one = itemOf(ONE);
  assert.equal(verdictOf(one, tap(0, one.targets[0])), 'hit');
  assert.equal(grade([{ ...one, questionIndex: 0 }], [tap(0, one.targets[0])]).verdicts[0].completesQuestion, true);
  const between = itemOf(BETWEEN);
  assert.equal(verdictOf(between, tap(0, between.crossing)), 'miss', 'between grid lines: Can\'t Be Determined, not a tap');
  const intercepts = itemOf({ question: 'yIntercept', kind: 'slanted', variant: 'cross', tier: 'easy' }, (item) => item.targets.length === 2);
  const both = grade([{ ...intercepts, questionIndex: 0 }], intercepts.targets.map((target) => tap(0, target)));
  assert.deepEqual(both.verdicts.map((row) => [row.verdict, row.completesQuestion]), [['hit', false], ['hit', true]], 'two y-intercepts, a point each');
  assert.equal(both.state.scoreTotal, 2);
});

test('a graph or an inequality answers exactly as before: the new presses are misses there, "Does Not Exist" unchanged', () => {
  const inequalityConfig = I.normalizeInequalityRushConfig({ presetId: 'everything' });
  const graphConfig = normalizeGraphFeatureRushConfig({ presetId: 'algebra2Challenge' });
  let none = 0;
  let found = 0;
  for (let index = 0; index < 120; index += 1) {
    const inequality = I.generateInequalityQuestion({ seed: 'unchanged', studentKey: 'a', roundIndex: 0, questionIndex: index, config: inequalityConfig });
    const graph = generateRushQuestion({ seed: 'unchanged', studentKey: 'a', roundIndex: 0, questionIndex: index, config: graphConfig });
    for (const question of [inequality, graph]) {
      const nothingToFind = question.targets.length === 0 && question.offScreen !== true;
      if (nothingToFind) none += 1; else found += 1;
      assert.equal(verdictOf(question, press(0, RUSH_ATTEMPT_KIND.DOES_NOT_EXIST)), nothingToFind ? 'hit' : 'miss', 'Does Not Exist: the rule it always had');
      assert.equal(verdictOf(question, press(0, RUSH_ATTEMPT_KIND.INFINITELY_MANY)), 'miss');
      assert.equal(verdictOf(question, press(0, RUSH_ATTEMPT_KIND.CANNOT_DETERMINE)), 'miss');
      assert.equal(rushPressAnswer(publicRushQuestion(question) || question), rushPressAnswer(question), 'the device\'s copy is answered the same way');
    }
  }
  assert.ok(none > 10 && found > 100, `${none} with nothing to find, ${found} with something`);
  // A feature past the edge is never "Does Not Exist", whatever answerPress a question might claim.
  assert.equal(rushPressAnswer({ offScreen: true, targets: [], answerPress: RUSH_ATTEMPT_KIND.INFINITELY_MANY }), RUSH_ATTEMPT_KIND.OFF_SCREEN);
  assert.equal(rushPressAnswer({ targets: [], answerPress: 'tap' }), RUSH_ATTEMPT_KIND.DOES_NOT_EXIST, 'only the two named presses');
});

test('three wrong answers on a solution show the answer and move on — eight taps on an intercept question — on the device and the server alike', () => {
  const same = itemOf(SAME);
  assert.equal(rushAutoSkipMisses(same), RUSH_SET_AUTO_SKIP_MISSES);
  assert.equal(rushAutoSkipMisses(itemOf({ question: 'xIntercept', kind: 'slanted', variant: 'cross', tier: 'easy' })), RUSH_AUTO_SKIP_MISSES);
  const wrong = [press(0, RUSH_ATTEMPT_KIND.DOES_NOT_EXIST), press(0, RUSH_ATTEMPT_KIND.CANNOT_DETERMINE), tap(0, { x: 0.5, y: 0.5 })];
  const server = grade([{ ...same, questionIndex: 0 }, { ...same, questionIndex: 1 }], wrong);
  assert.deepEqual(server.verdicts.map((row) => row.verdict), ['miss', 'miss', 'miss']);
  assert.equal(server.verdicts[2].autoSkipped, true);
  assert.equal(server.state.cursor, 1, 'moved on');
  // The device: the same skip, holding the answer on screen long enough to read.
  let session = createRushSession({ roundIndex: 0, questions: [asItem(same, 0), asItem(same, 1)], poolSize: 2 });
  let now = 0;
  const context = () => ({ nowMs: now, elapsedMs: now, attemptId: newAttemptId() });
  session = recordDoesNotExist(session, context()).session;
  now = Math.max(now, session.lockedUntil) + 1;
  session = recordCannotDetermine(session, context()).session;
  now = Math.max(now, session.lockedUntil) + 1;
  session = recordTap(session, { ...context(), x: 0.5, y: 0.5, tolerance: TOLERANCE, pointer: 'mouse' }).session;
  assert.equal(session.feedback.kind, RUSH_FEEDBACK.AUTO_SKIPPED);
  assert.equal(session.transition.until - now, RUSH_REVEAL_PAUSE_MS);
  assert.equal(feedbackMessage(session.feedback, session.questions[0]), 'The same line twice: infinitely many solutions. Next graph.');
});

test('device and server agree on every step of random play on systems', () => {
  const config = S.normalizeSystemsRushConfig({ presetId: 'everySystem' });
  let replies = 0;
  let resyncs = 0;
  let presses = 0;
  let hits = 0;
  for (let student = 0; student < 8; student += 1) {
    const studentKey = `agree-sys-${student}`;
    const serverQuestion = (index) => G.generateSystemsQuestion({ seed: 'agree-sys', studentKey, roundIndex: 0, questionIndex: index, config });
    const questions = Array.from({ length: 30 }, (_, index) => G.publicSystemsQuestion(serverQuestion(index)));
    let seed = 7 + student * 419;
    const random = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    let session = createRushSession({ roundIndex: 0, serverState: { cursor: 0 }, questions, poolSize: 30 });
    let player = {};
    let now = 0;
    const deliver = () => {
      while (session.queue.length) {
        const batch = nextBatch(session).slice(0, 1 + Math.floor(random() * Math.min(5, session.queue.length)));
        const outcome = applyRushAttempts({ player, roundIndex: 0, roundVersion: 1, attempts: batch, questionFor: serverQuestion, arrivedAtMs: now, arrivalElapsedMs: now, roundDurationMs: 600_000, strategy: correctCountStrategy, poolSize: 30 });
        player = { ...player, submissionReceipts: outcome.receipts, attemptSequence: outcome.attemptSequence };
        hits += outcome.verdicts.filter((row) => row.verdict === 'hit').length;
        const acked = acknowledge(session, { sent: batch, reply: { verdicts: outcome.verdicts, state: outcome.state } });
        replies += 1;
        if (acked.resynced) resyncs += 1;
        session = acked.session;
      }
    };
    for (let step = 0; step < 300 && session.cursor < 28; step += 1) {
      now += 60 + Math.floor(random() * 900);
      session = settle(session, now);
      if (inputState(session, now) === RUSH_INPUT.LOCKED) now = session.lockedUntil;
      if (inputState(session, now) !== RUSH_INPUT.READY) continue;
      const question = currentQuestion(session);
      const context = { nowMs: now, elapsedMs: now, attemptId: newAttemptId() };
      const roll = random();
      const target = question.targets[Math.floor(random() * Math.max(1, question.targets.length))];
      let input;
      if (roll < 0.04) input = recordSkip(session, context);
      else if (roll < 0.14) { input = recordDoesNotExist(session, context); presses += 1; }
      else if (roll < 0.22) { input = recordInfinitelyMany(session, context); presses += 1; }
      else if (roll < 0.30) { input = recordCannotDetermine(session, context); presses += 1; }
      else if (roll < 0.6 && target) input = recordTap(session, { ...context, x: target.x + (random() - 0.5) * 0.6, y: target.y + (random() - 0.5) * 0.6, tolerance: TOLERANCE, pointer: 'touch' });
      else if (roll < 0.7 && question.crossing) input = recordTap(session, { ...context, x: question.crossing.x, y: question.crossing.y, tolerance: TOLERANCE, pointer: 'touch' });
      else input = recordTap(session, { ...context, x: question.view.xMin + random() * (question.view.xMax - question.view.xMin), y: question.view.yMin + random() * (question.view.yMax - question.view.yMin), tolerance: TOLERANCE, pointer: 'mouse' });
      session = input.session;
      if (random() < 0.4) deliver();
    }
    deliver();
    assert.equal(differsFromServer(session, applyRushAttempts({ player, roundIndex: 0, attempts: [], questionFor: serverQuestion, poolSize: 30, strategy: correctCountStrategy }).state), false, studentKey);
  }
  assert.ok(presses > 100, `${presses} presses`);
  assert.ok(hits > 80, `${hits} hits`);
  assert.ok(replies > 100, `${replies} replies`);
  assert.equal(resyncs, 0, 'the device never had to be corrected');
});

/* ---------------------------------- words ---------------------------------- */

test('a student is told what is there — the line a tap landed on, a question back for a wrong press — never the button that is right', () => {
  const one = asItem(itemOf(ONE, (item) => item.lines.every((line) => line.orientation === 'slanted')), 0);
  const [first] = one.lines;
  // A point on line 1, well away from the crossing.
  const x = one.targets[0].x + (one.targets[0].x > 0 ? -3 : 3);
  const onFirst = { x, y: first.m * x + first.b };
  assert.equal(S.systemTapNote(one, onFirst, TOLERANCE), 'That point is on line 1, not line 2.');
  const same = asItem(itemOf(SAME), 0);
  const along = same.lines[0].orientation === 'vertical' ? { x: same.lines[0].x, y: 1.5 } : { x: 1.5, y: same.lines[0].orientation === 'horizontal' ? same.lines[0].y : same.lines[0].m * 1.5 + same.lines[0].b };
  assert.equal(S.systemTapNote(same, along, TOLERANCE), 'That point is on both lines — and it is not the only one.');
  const between = asItem(itemOf(BETWEEN), 0);
  assert.equal(S.systemTapNote(between, between.crossing, TOLERANCE), 'They cross between grid lines there — can you read that point exactly?');
  assert.equal(S.systemTapNote(asItem(itemOf({ question: 'xIntercept', kind: 'slanted', variant: 'cross', tier: 'easy' }), 0), onFirst, TOLERANCE), null, 'an intercept question is told the rush\'s words');
  // A wrong press is asked about what is there; no hint ever names its game's right button.
  const labels = S.SYSTEM_ANSWER_BUTTONS.map((button) => button.label.toLowerCase());
  for (const slot of [ONE, NONE, SAME, BETWEEN, PAST]) {
    const item = asItem(itemOf(slot), 0);
    for (const button of S.SYSTEM_ANSWER_BUTTONS) {
      if (rushPressAnswer(item) === button.press) continue;
      const hint = S.systemPressHint(item, button.press);
      assert.ok(hint, `${slot.kind}: ${button.label} gets a hint`);
      labels.forEach((label) => assert.ok(!hint.toLowerCase().includes(label), `"${hint}" names a button`));
    }
  }
  // Right answers, in the system's own words.
  assert.match(feedbackMessage({ kind: RUSH_FEEDBACK.COMPLETE, targetId: 'sol', questionIndex: 0 }, one), /^Correct — \(-?−?\d+, −?\d+\) is on both lines: the solution\.$/);
  assert.equal(feedbackMessage({ kind: RUSH_FEEDBACK.COMPLETE, doesNotExist: true, questionIndex: 0 }, asItem(itemOf(NONE), 0)), 'Correct — parallel lines never meet: no solution.');
  assert.equal(feedbackMessage({ kind: RUSH_FEEDBACK.COMPLETE, press: RUSH_ATTEMPT_KIND.INFINITELY_MANY, questionIndex: 0 }, same), 'Correct — the same line: every point on it is a solution.');
  assert.equal(feedbackMessage({ kind: RUSH_FEEDBACK.COMPLETE, press: RUSH_ATTEMPT_KIND.CANNOT_DETERMINE, questionIndex: 0 }, between), `Correct — they cross at ${between.crossingText}, between grid lines.`);
  assert.match(feedbackMessage({ kind: RUSH_FEEDBACK.COMPLETE, press: RUSH_ATTEMPT_KIND.CANNOT_DETERMINE, questionIndex: 0 }, asItem(itemOf(PAST), 0)), /^Correct — they meet at \(.+\), past the edge of the graph\.$/);
  assert.equal(feedbackMessage({ kind: RUSH_FEEDBACK.MISS, questionIndex: 0 }, one), 'Not the solution — try again.');
});

test('the feedback line keeps the room of the longest thing a round can say, and the kinds are the round\'s own', () => {
  const longest = (lines) => Math.max(...lines.map((line) => line.length));
  for (const preset of S.SYSTEMS_RUSH_PRESETS) {
    const config = S.normalizeSystemsRushConfig({ presetId: preset.id });
    const room = longest(feedbackReserve({ systems: config }));
    const kinds = rushRoundKinds({ systems: config });
    // The presses this round offers: on an intercept question "Does Not Exist", on a solution question its own buttons.
    const offered = (item) => (item.feature === 'solution' ? S.systemAnswerButtons(config).map((button) => button.press) : [RUSH_ATTEMPT_KIND.DOES_NOT_EXIST]);
    for (let index = 0; index < 48; index += 1) {
      const item = G.publicSystemsQuestion(G.generateSystemsQuestion({ seed: `reserve-${preset.id}`, studentKey: 'a', roundIndex: 0, questionIndex: index, config }));
      assert.ok(kinds.includes(rushItemKind(item)), `${preset.id}: the item's kind is one the round deals`);
      const answer = rushPressAnswer(item);
      const said = [
        feedbackMessage({ kind: RUSH_FEEDBACK.AUTO_SKIPPED, questionIndex: 0 }, item),
        feedbackMessage({ kind: RUSH_FEEDBACK.MISS, questionIndex: 0 }, item),
        ...item.targets.map((target) => feedbackMessage({ kind: RUSH_FEEDBACK.COMPLETE, targetId: target.id, questionIndex: 0 }, item)),
        // Each offered press, wrong — and the right one, said right.
        ...offered(item).filter((kind) => kind !== answer).map((kind) => feedbackMessage({ kind: RUSH_FEEDBACK.MISS, press: kind, questionIndex: 0 }, item)),
        ...(answer ? [feedbackMessage({ kind: RUSH_FEEDBACK.COMPLETE, press: answer, questionIndex: 0 }, item)] : []),
      ];
      said.forEach((words) => assert.ok(words.length <= room, `${preset.id}: "${words}" (${words.length}) fits the room (${room})`));
    }
  }
  assert.deepEqual(rushRoundKinds({ systems: { questions: ['yIntercept', 'solution'] } }), [SYSTEM_INTERCEPT_KIND, SYSTEM_SOLUTION_KIND]);
  assert.deepEqual(rushRoundKinds({ systems: { questions: ['solution'] } }), [SYSTEM_SOLUTION_KIND]);
});

/* --------------------------------- report ---------------------------------- */

test('the report counts each press, names questions and kinds of system, and where wrong taps landed; student rows leave with a deletion', () => {
  const intercepts = itemOf({ question: 'yIntercept', kind: 'slanted', variant: 'cross', tier: 'standard' }, (item) => item.targets.every((target) => Math.hypot(target.x - item.graphFeatures.solution[0].x, target.y - item.graphFeatures.solution[0].y) > 2));
  // A wrong tap on the crossing, asked for the y-intercepts: the report names it.
  assert.equal(rushTapDiagnosis({ question: intercepts, tap: intercepts.graphFeatures.solution[0], tolerance: TOLERANCE }), 'solution');
  // A wrong tap on a y-intercept, asked for the solution (one the graph shows: only those are named).
  const inView = (item) => item.graphFeatures.yIntercept.filter((point) => Math.abs(point.y) < item.view.yMax);
  const one = itemOf(ONE, (item) => inView(item).length > 0 && inView(item).every((point) => Math.hypot(point.x - item.targets[0].x, point.y - item.targets[0].y) > 2));
  const shownIntercept = inView(one)[0];
  assert.equal(rushTapDiagnosis({ question: one, tap: shownIntercept, tolerance: TOLERANCE }), 'yIntercept');
  const offView = one.graphFeatures.yIntercept.find((point) => Math.abs(point.y) > one.view.yMax);
  if (offView) assert.equal(rushTapDiagnosis({ question: one, tap: offView, tolerance: TOLERANCE }), null, 'a feature off the graph is never named');
  assert.equal(G.publicSystemsQuestion(one).graphFeatures, undefined, 'the device never has them');
  const questions = [intercepts, itemOf(SAME), itemOf(BETWEEN), one].map((question, questionIndex) => ({ ...question, questionIndex }));
  const played = grade(questions, [
    tap(0, intercepts.graphFeatures.solution[0]),
    ...intercepts.targets.map((target) => tap(0, target)),
    press(1, RUSH_ATTEMPT_KIND.DOES_NOT_EXIST),
    press(1, RUSH_ATTEMPT_KIND.INFINITELY_MANY),
    press(2, RUSH_ATTEMPT_KIND.CANNOT_DETERMINE),
    tap(3, shownIntercept),
  ]);
  const summary = questionSetMatchSummary({ submissionReceipts: played.receipts });
  assert.deepEqual([summary.infinitePresses, summary.infiniteCorrect, summary.undeterminedPresses, summary.undeterminedCorrect, summary.dnePresses, summary.dneCorrect], [1, 1, 1, 1, 1, 0]);
  const report = buildRushReport({ standings: [{ studentId: 's1', alias: 's1', joined: true, rank: 1, score: 3, questionSetSummary: summary }] }, S.SYSTEMS_REPORT_LABELS);
  assert.deepEqual([report.infinitelyMany.presses, report.infinitelyMany.accuracyPercent, report.cannotDetermine.presses], [1, 100, 1]);
  assert.deepEqual(new Set(report.byFeature.map((row) => row.label)), new Set(['y-intercepts', 'Solution of the system']));
  assert.ok(report.byFamily.some((row) => row.label === 'Infinitely many solutions'));
  assert.deepEqual(report.wrongTaps.map((row) => row.label).sort(), ['Tapped a y-intercept when asked for the solution', 'Tapped where the lines cross when asked for the y-intercepts']);
  // Every other game's report has them too, at zero.
  const graphReport = buildRushReport({ standings: [] });
  assert.deepEqual([graphReport.infinitelyMany.presses, graphReport.cannotDetermine.presses], [0, 0]);
  // A deleted student leaves this report's rows too (SI07).
  assert.ok(REPORT_STUDENT_ROW_PATHS.includes('systemsRush.players'));
  const stored = { studentIds: ['s1', 's2'], systemsRush: { players: [{ studentId: 's1' }, { studentId: 's2' }], graphsCompleted: 5 } };
  assert.deepEqual(reportStudentIds(stored), ['s1', 's2']);
  const patch = reportRowsWithout(stored, (id) => id === 's1');
  assert.deepEqual(patch.systemsRush.players, [{ studentId: 's2' }]);
  assert.equal(patch.systemsRush.graphsCompleted, 5, 'the class\'s totals stay');
});

test('a round publishes a guide to reading a system, titled as one, short enough for the projector', () => {
  const everything = systemsReadingGuide({ questions: S.SYSTEM_QUESTION_IDS, kinds: S.SYSTEM_KIND_IDS, difficulty: 'mixed' }).solutionReview.reasoning;
  assert.deepEqual(everything, [
    SYSTEMS_READING.intercepts,
    SYSTEMS_READING.solution,
    SYSTEMS_READING.levelUprightNone,
    SYSTEMS_READING.cannotDeterminePastEdge,
    SYSTEMS_READING.parallel,
    SYSTEMS_READING.sameLine,
  ]);
  assert.ok(everything.length <= 7, 'every line fits the projector');
  Object.values(SYSTEMS_READING).forEach((line) => assert.ok(line.length <= 110, line));
  const easy = systemsReadingGuide({ questions: ['yIntercept'], kinds: ['slanted', 'levelUpright'], difficulty: 'easy' });
  assert.deepEqual(easy.solutionReview.reasoning, [SYSTEMS_READING.yIntercept, SYSTEMS_READING.levelUpright], 'Easy has no "Does Not Exist" to explain');
  assert.equal(systemsReadingGuide({ questions: [], kinds: ['slanted'] }), null);
  const record = systemsRoundSolutionRecord({ questions: ['solution'], kinds: ['slanted', 'sameLine'], difficulty: 'standard' });
  assert.equal(record.guide, true);
  const published = publicSolutionDocument({ roundIndex: 0, record });
  assert.equal(solutionTitle(published), SYSTEMS_GUIDE_TITLE);
  assert.deepEqual(projectorSteps(published), [...record.solutionReview.reasoning]);
  assert.ok(record.solutionReview.commonError.length <= 110);
});

/* ------------------------------ the server ------------------------------ */

test('the server plans, issues, grades, reveals and reports a systems room through the rush\'s own code', () => {
  const index = executableSource(read('functions/index.js'));
  const planners = region(index, 'const GENERATED_QUESTION_PLANNERS = Object.freeze({', '\n});', 'the generated planners');
  assert.match(planners, /\bsystemsGenerator: SYSTEMS_RUSH_PLANNER,/);
  const planner = region(index, 'const SYSTEMS_RUSH_PLANNER = Object.freeze({', '\n});\n', 'the planner');
  assert.match(planner, /privateFields: \{ systemsRush: \{ seed: crypto\.randomUUID\(\), config, generatorVersion \} \}/, 'the seed stays on the server');
  assert.match(planner, /roomFields: \{ systemsRush: \{ config, generatorVersion \} \}/);
  assert.match(planner, /solution: reading\.systemsRoundSolutionRecord\(\{ questions: config\.questions, kinds: config\.kinds, difficulty: config\.difficulty \}\)/);
  assert.doesNotMatch(region(planner, 'currentQuestion: {', '},', 'the round card'), /lines|targets|crossing/, 'the round\'s card names no system');
  // Issued and graded by the rush's two callables, from this game's generator.
  const games = region(index, 'const RUSH_QUESTION_SOURCES = Object.freeze({', '\n});\n', 'the rush games');
  const systems = region(games, 'systemsGenerator: Object.freeze({', '\n  }),', 'the systems game');
  assert.match(systems, /stateKey: "systemsRush",/);
  assert.match(systems, /return \{ version: generator\.SYSTEMS_GENERATOR_VERSION, generate: generator\.generateSystemsQuestion, publicQuestion: generator\.publicSystemsQuestion \};/);
  // Its guide is published at the round's close, as a rush's is.
  const revealable = region(index, 'function liveChallengeRevealableRounds(', '\n}\n', 'revealable rounds');
  const guideSources = /if \(((?:\s*(?:\|\|\s*)?mode\.questionSource === engine\.modes\.QUESTION_SOURCE\.[A-Z_]+)+)\) \{\s*const scheduled = /.exec(revealable);
  assert.ok(guideSources && /QUESTION_SOURCE\.SYSTEMS_GENERATOR\b/.test(guideSources[1]), 'its guide is published');
  // Its report: the rush's, named for systems, under its own key — and its class memory reads it so.
  const report = region(index, 'async function questionSetModeReport(', '\n}\n', 'the mode report');
  assert.match(report, /if \(mode\.questionSource === "systemsGenerator"\) \{[\s\S]*?return \{ key: "systemsRush", report: \(await graphFeatureRushRules\(\)\)\.rush\.buildRushReport\(result, rules\.SYSTEMS_REPORT_LABELS\) \};/);
  assert.match(region(index, 'async function classMemoryReportFromResult(', '\n}\n', 'the memory report'), /if \(game\.report === "systemsRush"\) labels = \(await systemsRushRules\(\)\)\.rules\.SYSTEMS_REPORT_LABELS;/);
  // A teacher's settings errors are a sentence, not a crash.
  assert.match(index, /const LIVE_CHALLENGE_CONFIG_ERRORS = new Set\(\[[^\]]*"SystemsRushConfigError"/);
  // The preview is a teacher's, writes nothing, and names the settings it used.
  const preview = region(index, 'exports.previewSystemsRush = onCall(', '\n});\n', 'the preview');
  assert.match(preview, /await requireTeacher\(request\);/);
  assert.doesNotMatch(preview, /\.set\(|\.update\(|runTransaction/);
  const service = read('src/platform/liveChallenge/liveChallengeService.js');
  const bridge = read('tests/browser/emulator/liveChallengeBridgeService.js');
  [service, bridge].forEach((source) => assert.match(source, /export const previewSystemsRush = call\('previewSystemsRush'\);/));
  // The generator never ships to a browser: the device's code reads only the light module.
  ['src/platform/liveChallenge/rushSession.js', 'src/platform/liveChallenge/rushGraphModel.js', 'src/components/liveChallenge/GraphFeatureRushRound.jsx', 'src/components/liveChallenge/SystemsRushSetup.jsx', 'src/platform/liveChallenge/systemsSetupModel.js']
    .forEach((path) => assert.doesNotMatch(read(path), /systemsGenerator\.mjs/, `${path} does not import the generator`));
  assert.doesNotMatch(read('functions/shared/systemsRush.mjs'), /from '\.\/(systemsGenerator|graphFeatureRational|seededRandom)\.mjs'/, 'the light module carries no generator');
});

/* ------------------------------- the screens ------------------------------- */

test('the teacher sets it up from its levels, practises it, plays it again with the same settings, and its class remembers', () => {
  const setup = defaultSystemsSetup('algebra1');
  assert.equal(setup.presetId, 'intercepts', 'Algebra I starts at Level 1');
  assert.equal(defaultSystemsSetup('algebra2').presetId, 'everySystem');
  const toggled = changeSystemsSetup(setup, { kinds: [...setup.kinds, 'levelUpright'] });
  assert.equal(toggled.presetId, 'custom');
  assert.equal(changeSystemsSetup(toggled, { kinds: setup.kinds }).presetId, 'custom', 'and stays custom once changed');
  assert.equal(systemsSetupProblem({ ...setup, questions: [] }), 'Choose at least one question for students to answer.');
  const request = systemsCreateRequest(systemsSetupFromPreset(S.getSystemsPreset('noneOrInfinite')), { rewardPolicy: { rule: 'x' } });
  assert.deepEqual(request, {
    challengeMode: SYSTEMS_RUSH_MODE_ID,
    systemsRush: { presetId: 'noneOrInfinite', questions: ['solution'], kinds: ['slanted', 'parallel', 'sameLine'], difficulty: 'standard' },
    roundCount: 3,
    roundSeconds: 60,
    scoringStrategyId: 'grandPrix',
    rewardPolicy: { rule: 'x' },
  });
  // Play Again: the same questions, kinds and difficulty.
  const room = { classId: 'c1', challengeMode: SYSTEMS_RUSH_MODE_ID, roundCount: 3, roundSeconds: 60, scoringStrategyId: 'grandPrix', systemsRush: { config: { presetId: 'custom', questions: ['solution'], kinds: ['slanted', 'cannotDetermine'], difficulty: 'challenge' } } };
  assert.deepEqual(replayRequestFromRoom(room).systemsRush, { presetId: 'custom', questions: ['solution'], kinds: ['slanted', 'cannotDetermine'], difficulty: 'challenge' });
  assert.equal(replayRequestFromRoom({ ...room, systemsRush: undefined }), null, 'a room without its settings cannot be replayed');
  assert.match(replaySummary(room), /^Systems of Equations Rush · 3 rounds · 60s each · Grand Prix/);
  // The console offers it, sets it up and practises it on the rush's practice screen.
  const teacher = read('src/components/liveChallenge/LiveChallengeTeacher.jsx');
  assert.match(teacher, /<option value=\{SYSTEMS_RUSH_MODE_ID\}>Systems of Equations Rush<\/option>/);
  assert.match(teacher, /const SystemsRushSetup = lazy\(\(\) => import\('\.\/SystemsRushSetup\.jsx'\)\);/);
  const create = region(teacher, 'if (ownSettingsGame) {', 'if (warmupAssignmentId && warmupDeliveryMode', 'own-settings create');
  assert.match(create, /if \(systemsProblem\) throw new Error\(systemsProblem\);/);
  assert.match(create, /systemsMode\s*\?\s*systemsCreateRequest\(systemsSetup, \{ rewardPolicy: buildChallengeRewardPolicy\(rewardChoice\) \}\)/);
  const practice = region(teacher, 'if (dryRunOpen && systemsMode) {', '\n    }', 'practice');
  assert.match(practice, /<GraphFeatureRushPractice\s+game=\{SYSTEMS_RUSH_MODE_ID\}\s+config=\{systemsCreateRequest\(systemsSetup\)\.systemsRush\}/);
  assert.match(read('src/components/liveChallenge/GraphFeatureRushPractice.jsx'), /\[SYSTEMS_RUSH_MODE_ID\]: Object\.freeze\(\{ key: 'systemsRush', preview: \(config, count\) => previewSystemsRush\(\{ systemsRush: config, count \}\)/);
  const rushReport = /\{\(([^)]*)\) && <RushReport report=\{report\} \/>\}/.exec(teacher);
  assert.ok(rushReport && /\breport\.systemsRush\b/.test(rushReport[1]), 'its report is the rush\'s');
  assert.match(teacher, /useEffect\(\(\) => \{ setSystemsSetup\(defaultSystemsSetup\(courseId\)\); \}, \[courseId\]\);/);
  // Its class remembers: the card's suggestion drops the weakest kind of system, never one its rule needs.
  const memory = M.buildClassMemory({
    result: { modeId: SYSTEMS_RUSH_MODE_ID, status: 'finished', classId: 'c1', roomId: 'r1', roomRoundCount: 3, roundSeconds: 60, scoringStrategyId: 'grandPrix', finalizedAtMs: 1 },
    room: { systemsRush: { config: S.normalizeSystemsRushConfig({ presetId: 'noneOrInfinite' }) } },
    report: { accuracyPercent: 40, graphsCompleted: 12, attempts: 30, players: [{ joined: true }], byFamily: [{ key: 'sameLine', label: 'Infinitely many solutions', questions: 6, completionPercent: 20, accuracyPercent: 30 }] },
  });
  assert.equal(memory.game, 'systemsRush');
  const step = M.suggestNextSettings(memory);
  assert.equal(step.kind, 'stepDown', 'Standard steps down to Easy first');
  const easyMemory = { ...memory, settings: { ...memory.settings, difficulty: 'easy' } };
  const drop = M.suggestNextSettings(easyMemory);
  assert.equal(drop.kind, 'drop');
  assert.equal(drop.phrase, 'try it without the same line twice');
  assert.deepEqual(drop.settings.kinds, ['slanted', 'parallel']);
  const slantedWeakest = { ...easyMemory, results: { ...easyMemory.results, weakest: { key: 'slanted', label: 'Two slanted lines' } } };
  assert.notEqual(M.suggestNextSettings(slantedWeakest).kind, 'drop', 'never a game whose solutions have nothing to tap');
});

test('students race on the rush\'s screen with two lines, the game\'s own buttons and a key; every screen says systems', () => {
  const round = read('src/components/liveChallenge/GraphFeatureRushRound.jsx');
  // The game's buttons on every solution question, its other kind's row held unseen beside them.
  const controls = region(round, ') : shownKind.system ? (', ') : (', 'the system controls');
  assert.match(controls, /\{systemButtonRow\(shownKind, true\)\}/);
  assert.match(controls, /\{roundKinds\.filter\(\(kind\) => kind\.system && kind\.solution !== shownKind\.solution\)\.map\(\(kind\) => systemButtonRow\(kind, false\)\)\}/);
  const row = region(round, 'const systemButtonRow = (kind, live) => {', '\n  };', 'a row');
  assert.match(row, /const presses = kind\.solution \? systemButtons : \[\{ press: RUSH_ATTEMPT_KIND\.DOES_NOT_EXIST, label: 'Does Not Exist' \}\];/);
  assert.match(row, /\{\.\.\.\(live \? \{\} : \{ 'aria-hidden': 'true' \}\)\}/, 'the held row is never read');
  assert.match(round, /const systemButtons = useMemo\(\(\) => \(systemsConfig \? systemAnswerButtons\(systemsConfig\) : \[\]\), \[systemsConfig\]\);/, 'from the room\'s settings, never the item\'s');
  assert.match(round, /\[RUSH_ATTEMPT_KIND\.INFINITELY_MANY\]: onInfinitelyMany,\s*\[RUSH_ATTEMPT_KIND\.CANNOT_DETERMINE\]: onCannotDetermine,/);
  // The key: which line is which, on every graph of the game.
  assert.match(round, /\{systemsGame && \(\s*<p className="mm-rush-legend" aria-hidden="true">/);
  // The answer, marked as the item moves on after its last allowed miss.
  assert.match(round, /const shownFound = revealingSystem \? \(question\.targets \|\| \[\]\)\.map\(\(target\) => String\(target\.id\)\) : session\?\.found;/);
  assert.match(round, /found=\{shownFound\}/);
  // The held rows are kept, unseen, only where the screen is tall for its text, as the others are.
  assert.match(round, /\.mm-rush-buttons-held \{ display: none; \}/);
  assert.match(round, /@media \(min-height: 36em\) \{[^}]*\}\s*\.mm-rush-buttons-held \{ display: grid; visibility: hidden; \}/);
  // The theme's two line colours.
  assert.match(read('src/components/liveChallenge/grandPrixTheme.js'), /`--mm-rush-line1: \$\{ARENA_MARKS\.curve\}`,\s*`--mm-rush-line2: \$\{ARENA_MARKS\.second\}`,/);
  // Host and projector: its questions as badges, its kinds in the settings line.
  const host = read('src/components/liveChallenge/GraphFeatureRushHost.jsx');
  assert.match(region(host, 'export function rushBadges(', '\n}\n', 'badges'), /if \(systemsRoom\(room\)\) return \(config\.questions \|\| \[\]\)\.map\(\(id\) => systemQuestionLabel\(id\) \|\| id\);/);
  assert.match(region(host, 'export function RushReport(', '\n}\n', 'the report'), /"Can't Be Determined" right/);
});

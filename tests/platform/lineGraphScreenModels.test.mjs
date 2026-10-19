import test from 'node:test';
import assert from 'node:assert/strict';

import * as Q from '../../functions/shared/graphFeatureRational.mjs';
import { containsPoint, latticePointsInView, lineThroughPoints, sameLine, slopeOf, yInterceptOf } from '../../functions/shared/lineGraphMath.mjs';
import { lineRoundQuestionCount, normalizeLineGraphConfig } from '../../functions/shared/lineGraphConfig.mjs';
import { generateLineQuestion, publicLineQuestion } from '../../functions/shared/lineGraphGenerator.mjs';
import { applyLineGraphAttempts, lineRoundState } from '../../functions/shared/lineGraphAttempts.mjs';
import {
  LINE_ANSWER_STYLE,
  LINE_ATTEMPT_KIND,
  LINE_CORRECT_FLASH_MS,
  LINE_GRAPH_FORMAT,
  LINE_ITEM_TYPE,
  LINE_REVEAL_MS,
  LINE_VERDICT,
  lineLockoutMs,
} from '../../functions/shared/lineGraphRules.mjs';
import { getScoringStrategy } from '../../functions/shared/liveChallengeScoring.mjs';
import { createRng } from '../../functions/shared/seededRandom.mjs';
import { TOKEN_KIND } from '../../functions/shared/lineGraphForms.mjs';
import { lineOfText } from './helpers/lineEquationOracle.mjs';
import {
  DRAFT_OUTCOME,
  EQUATION_TOKEN_KIND,
  cancelDraft,
  describeLineCursor,
  draftPoints,
  emptyDraft,
  HELD_LABEL_OFFSET,
  formatPoint,
  graphPointAt,
  heldLabelSpot,
  keyboardEnter,
  lineAxisLabels,
  lineGrid,
  lineSegmentInView,
  lineThrough,
  moveDraft,
  moveLineCursor,
  pointBox,
  pointLabelSpot,
  pointerPoint,
  pointsKey,
  pressDraft,
  releaseDraft,
  slopeStepText,
  snapToGrid,
  unitX,
  unitY,
  verdictBadgeSpot,
} from '../../src/platform/liveChallenge/lineGraphModel.js';
import {
  LINE_FEEDBACK,
  LINE_INPUT,
  acknowledge,
  answerEquation,
  createLineSession,
  currentQuestion,
  effectiveCursor,
  inputState,
  lineFeedbackMessage,
  lineQueueKey,
  newLineAttemptId,
  nextBatch,
  parseStoredLineQueue,
  prefetchRequest,
  recordChoice,
  recordEquation,
  recordLine,
  recordSkip,
  settle,
  triesLeft,
} from '../../src/platform/liveChallenge/lineGraphSession.js';

/*
 * THE STUDENT'S GRID AND ROUND, AS FUNCTIONS.
 *
 * The canvas and the round screen are .jsx; everything they decide is here:
 * where a finger lands, when a line is checked (only on a release that
 * completes or changes it), what is sent, and what the student is told. The
 * device's verdicts are the server's — the last test plays whole rounds on
 * the device and replays every attempt it sent through the server's pipeline.
 */

const VIEW = Object.freeze({ xMin: -6, xMax: 6, yMin: -6, yMax: 6 });

/* -------------------------------- geometry -------------------------------- */

test('unit space round-trips, and a finger snaps to the nearest grid point inside the view', () => {
  assert.equal(unitX(VIEW, -6), 0);
  assert.equal(unitX(VIEW, 6), 1);
  assert.equal(unitY(VIEW, 6), 0, 'v grows downward');
  assert.equal(unitY(VIEW, -6), 1);
  const back = graphPointAt(VIEW, unitX(VIEW, 2.5), unitY(VIEW, -1.25));
  assert.ok(Math.abs(back.x - 2.5) < 1e-9 && Math.abs(back.y + 1.25) < 1e-9);
  assert.deepEqual(snapToGrid(VIEW, { x: 2.49, y: -1.51 }), { x: 2, y: -2 });
  assert.deepEqual(snapToGrid(VIEW, { x: 9, y: -40 }), { x: 6, y: -6 }, 'kept inside the view');
  assert.ok(Object.is(snapToGrid(VIEW, { x: -0.2, y: -0.4 }).x, 0), 'never a negative zero');
  // A press in the margin is not a point; a drag past the edge holds at the edge.
  const rect = { left: 100, top: 50, width: 240, height: 240 };
  assert.equal(pointerPoint({ clientX: 99, clientY: 60, rect, view: VIEW }), null);
  assert.deepEqual(snapToGrid(VIEW, pointerPoint({ clientX: 99, clientY: 60, rect, view: VIEW, clamp: true })), { x: -6, y: 6 });
  assert.deepEqual(snapToGrid(VIEW, pointerPoint({ clientX: 220, clientY: 170, rect, view: VIEW })), { x: 0, y: 0 });
  assert.equal(pointerPoint({ clientX: 1, clientY: 1, rect: { width: 0, height: 0 }, view: VIEW }), null);
});

test('the grid has a line at every whole number, and labels thin out on a small plot', () => {
  const grid = lineGrid(VIEW);
  assert.equal(grid.verticals.length, 13);
  assert.equal(grid.horizontals.length, 13);
  assert.equal(grid.axisU, 0.5);
  assert.equal(grid.axisV, 0.5);
  const roomy = lineAxisLabels(VIEW, 600);
  assert.deepEqual(roomy.x, [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5], 'zero once at the origin, the edges unlabelled');
  const tight = lineAxisLabels({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 }, 300);
  assert.ok(tight.x.every((value) => value % 2 === 0), 'every other line when the spacing is tight');
});

test('a line is drawn edge to edge, through exactly the points it was drawn from', () => {
  const steep = lineThrough({ x: 0, y: -3 }, { x: 1, y: -1 });
  assert.ok(sameLine(lineThroughPoints({ x: 0, y: -3 }, { x: 1, y: -1 }), { a: steep.a, b: steep.b, c: steep.c }) || steep.a * 1 + steep.b * -1 === steep.c);
  for (const point of [{ x: 0, y: -3 }, { x: 1, y: -1 }]) assert.equal(steep.a * point.x + steep.b * point.y, steep.c);
  const [from, to] = lineSegmentInView(steep, VIEW);
  assert.ok(Math.abs(from.y + 6) < 1e-9 && Math.abs(to.y - 6) < 1e-9, 'a steep line leaves through the top and bottom');
  assert.ok(Math.abs(from.x - -1.5) < 1e-9 && Math.abs(to.x - 4.5) < 1e-9);
  assert.deepEqual(lineSegmentInView({ a: 1, b: 0, c: 2 }, VIEW), [{ x: 2, y: -6 }, { x: 2, y: 6 }], 'vertical');
  assert.deepEqual(lineSegmentInView({ a: 0, b: 1, c: -4 }, VIEW), [{ x: -6, y: -4 }, { x: 6, y: -4 }], 'horizontal');
  assert.equal(lineSegmentInView({ a: 0, b: 1, c: 9 }, VIEW), null, 'a line outside the view draws nothing');
  assert.equal(lineSegmentInView({ a: 0, b: 0, c: 1 }, VIEW), null, 'not a line');
  // Through a corner: one crossing point, counted once.
  assert.equal(lineSegmentInView({ a: 1, b: -1, c: 0 }, VIEW).length, 2);
  assert.equal(lineThrough({ x: 1, y: 1 }, { x: 1, y: 1 }), null);
});

test('the slope helper reads the step from the first point to the second', () => {
  assert.equal(slopeStepText({ x: 0, y: -3 }, { x: 3, y: -1 }), 'up 2, right 3');
  assert.equal(slopeStepText({ x: 2, y: 4 }, { x: 1, y: 1 }), 'down 3, left 1');
  assert.equal(slopeStepText({ x: 0, y: 2 }, { x: 4, y: 2 }), 'right 4');
  assert.equal(slopeStepText({ x: 3, y: 0 }, { x: 3, y: 5 }), 'up 5');
  assert.equal(slopeStepText({ x: 3, y: 0 }, { x: 3, y: 0 }), null);
  assert.equal(formatPoint({ x: -2, y: 0 }), '(−2, 0)');
});

/* ------------------------ what floats over the plot ----------------------- */

const LABEL_HEIGHT = 30;
const boxOfLabel = (spot, width) => ({ left: spot.x - width / 2, right: spot.x + width / 2, top: spot.y - LABEL_HEIGHT / 2, bottom: spot.y + LABEL_HEIGHT / 2 });

test('a held point\'s coordinates float above the finger, or beside it at the top edge — never under the hand', () => {
  let above = 0;
  let beside = 0;
  for (const side of [288, 320, 360, 480]) {
    for (const [holder, offset] of Object.entries(HELD_LABEL_OFFSET)) {
      // "(−1, 4)" and "(−10, −10)", as the canvas measures them.
      for (const width of [14 + 7 * 9.5, 14 + 10 * 9.5]) {
        const roomForASide = side >= 2 * (offset.beside + width + 2);
        for (let y = 0; y <= side; y += 6) {
          for (let x = 0; x <= side; x += 6) {
            const at = { x, y };
            const spot = heldLabelSpot({ at, side, holder, width, height: LABEL_HEIGHT });
            const box = boxOfLabel(spot, width);
            const label = `${holder} at (${x}, ${y}) on ${side}px, ${width}px wide`;
            assert.ok(box.left >= 2 - 1e-9 && box.right <= side - 2 + 1e-9 && box.top >= 2 - 1e-9, `${label}: inside the plot`);
            if (y - offset.above >= LABEL_HEIGHT / 2 + 2) {
              above += 1;
              assert.equal(spot.place, 'above', label);
              assert.equal(spot.y, y - offset.above, `${label}: lifted by what holds it`);
              assert.ok(box.bottom < y, `${label}: wholly above the point`);
              assert.equal(spot.x, Math.min(side - width / 2 - 2, Math.max(width / 2 + 2, x)), `${label}: centred on the point unless an edge is near`);
            } else {
              beside += 1;
              assert.notEqual(spot.place, 'above', label);
              assert.equal(spot.y, LABEL_HEIGHT / 2 + 2, `${label}: against the top edge`);
              if (spot.place === 'right') assert.ok(x - offset.beside - width - 2 < 0, `${label}: right only when the left is too close`);
              if (roomForASide) {
                const gap = spot.place === 'left' ? x - box.right : box.left - x;
                assert.ok(gap >= offset.beside - 1e-9, `${label}: clear of the fingertip (${gap}px)`);
              }
            }
          }
        }
      }
    }
  }
  assert.ok(above > 1000 && beside > 1000, `${above} above, ${beside} beside`);
  // What the phone showed: a finger near the top — no longer under the finger.
  const top = heldLabelSpot({ at: { x: 200, y: 30 }, side: 360, holder: 'touch', width: 80.5 });
  assert.equal(top.place, 'left');
  assert.ok(top.y + LABEL_HEIGHT / 2 <= 32 && top.x + 80.5 / 2 <= 200 - 36);
  assert.equal(heldLabelSpot({ at: { x: 20, y: 30 }, side: 360, holder: 'touch', width: 80.5 }).place, 'right', 'at the left edge, to the right');
  assert.deepEqual(heldLabelSpot({ at: { x: 180, y: 200 }, side: 360, holder: 'stylus', width: 80 }), heldLabelSpot({ at: { x: 180, y: 200 }, side: 360, holder: 'mouse', width: 80 }), 'an unknown holder is a mouse');
});

test('a placed point\'s coordinates sit up and to its right, and turn away from the edges', () => {
  const middle = pointLabelSpot({ at: { x: 100, y: 100 }, side: 360, text: '(−1, 4)' });
  assert.deepEqual([middle.x, middle.y, middle.anchor], [112, 89, 'start']);
  assert.ok(middle.box.left === 112 && middle.box.right > 112 + 40 && middle.box.bottom > 89 && middle.box.top < 89 - 10);
  const right = pointLabelSpot({ at: { x: 330, y: 100 }, side: 360, text: '(5, 4)' });
  assert.equal(right.anchor, 'end');
  assert.ok(right.box.right === 318 && right.box.left < 318 - 30, 'to the left near the right edge');
  assert.equal(pointLabelSpot({ at: { x: 100, y: 10 }, side: 360, text: '(1, 6)' }).y, 32, 'under it near the top');
});

// How far the badge is from the nearest thing it must stay off.
const clearance = (spot, avoid) => Math.min(...avoid.map((box) => Math.hypot(Math.max(box.left - spot.x, 0, spot.x - box.right), Math.max(box.top - spot.y, 0, spot.y - box.bottom))));
const BADGE_RADIUS = 14.25; // 13, and half its 2.5px outline
const pixel = (view, side, point) => ({ x: unitX(view, point.x) * side, y: unitY(view, point.y) * side });
const keepOff = (view, side, points) => points.flatMap((point) => {
  const at = pixel(view, side, point);
  return [pointBox(at), pointLabelSpot({ at, side, text: formatPoint(point) }).box];
});
const badgeFor = (view, side, points) => {
  const [from, to] = lineSegmentInView(lineThrough(points[0], points[1]), view).map((point) => pixel(view, side, point));
  const avoid = keepOff(view, side, points);
  return { from, to, avoid, spot: verdictBadgeSpot({ from, to, avoid, side }) };
};

test('a judged line\'s ✓ or ✗ sits on the line, inside the plot, off the points and their coordinates', () => {
  // What the Chromebook showed: a point a third of the way along, where the
  // badge used to go. Now it covers neither point nor either label.
  const side = 360;
  const points = [{ x: -2, y: 0 }, { x: 2, y: 0 }];
  assert.equal(unitX(VIEW, -2), 1 / 3, 'the old spot was the point itself');
  const level = badgeFor(VIEW, side, points);
  assert.equal(level.spot.y, 180, 'on the line');
  assert.ok(clearance(level.spot, level.avoid) > BADGE_RADIUS + 20, `clear by ${clearance(level.spot, level.avoid)}px`);
  // Far-apart points: between them, not off at an edge.
  const wide = badgeFor(VIEW, side, [{ x: -4, y: 0 }, { x: 4, y: 0 }]);
  assert.ok(Math.abs(wide.spot.x - 180) <= side / 48, `between the points (${wide.spot.x})`);
  // Nothing to stay off: the first spot inside the plot from where the line starts.
  assert.deepEqual(verdictBadgeSpot({ from: { x: 0, y: 180 }, to: { x: 360, y: 180 }, avoid: [], side }), { x: 18, y: 180 });
  // A line through a corner, with only a short stretch far enough inside: on that stretch.
  const steep = verdictBadgeSpot({ from: { x: 300, y: 0 }, to: { x: 360, y: 60 }, avoid: [], side });
  assert.ok(Math.abs(steep.x - steep.y - 300) < 1e-9 && steep.x <= 342 && steep.y >= 18, JSON.stringify(steep));
  // A line that only clips a corner still gets a badge inside the plot, beside it.
  assert.deepEqual(verdictBadgeSpot({ from: { x: 350, y: 0 }, to: { x: 360, y: 10 }, avoid: [], side }), { x: 342, y: 18 });
  // A line along the plot's very edge: beside it, and still off its points and their coordinates.
  const edge = badgeFor(VIEW, side, [{ x: -4, y: -6 }, { x: -3, y: -6 }]);
  assert.equal(edge.spot.y, side - 18);
  assert.ok(clearance(edge.spot, edge.avoid) > BADGE_RADIUS, `clear by ${clearance(edge.spot, edge.avoid)}px`);

  // Every pair of grid points a student could place, on every view the
  // generator makes: on the line, inside the plot, and the clearest spot the
  // line has (to within one step of the walk) — so wherever a spot clear of
  // everything exists, the badge is clear of everything.
  let pairs = 0;
  let possible = 0;
  let clear = 0;
  for (const view of [VIEW, { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }, { xMin: -8, xMax: 8, yMin: -8, yMax: 8 }]) {
    for (const plot of [288, 420]) {
      const grid = latticePointsInView({ a: 0, b: 1, c: 0 }, view).map(({ x }) => x);
      for (const x1 of grid) {
        for (const y1 of grid) {
          for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [2, 1], [1, -2], [3, -1], [-1, 4]]) {
            const second = { x: x1 + dx, y: y1 + dy };
            if (second.x > view.xMax || second.y > view.yMax || second.x < view.xMin || second.y < view.yMin) continue;
            const pair = [{ x: x1, y: y1 }, second];
            const { from, to, avoid, spot } = badgeFor(view, plot, pair);
            pairs += 1;
            const label = `${JSON.stringify(pair)} on ${plot}px`;
            assert.ok(spot.x >= 18 - 1e-9 && spot.x <= plot - 18 + 1e-9 && spot.y >= 18 - 1e-9 && spot.y <= plot - 18 + 1e-9, `${label}: inside the plot`);
            let best = -1;
            for (let step = 0; step <= 960; step += 1) {
              const t = step / 960;
              const at = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
              if (at.x < 18 || at.x > plot - 18 || at.y < 18 || at.y > plot - 18) continue;
              best = Math.max(best, clearance(at, avoid));
            }
            const length = Math.hypot(to.x - from.x, to.y - from.y);
            const cross = ((to.x - from.x) * (spot.y - from.y) - (to.y - from.y) * (spot.x - from.x)) / length;
            if (best < 0) {
              // Along an edge or across a corner: beside the line, never far from it.
              assert.ok(Math.abs(cross) <= 18 * Math.SQRT2 + 1e-9, `${label}: beside the line`);
              continue;
            }
            assert.ok(Math.abs(cross) < 1e-6, `${label}: on the line`);
            const tolerance = length / 48 / 2;
            assert.ok(clearance(spot, avoid) >= best - tolerance - 1e-9, `${label}: ${clearance(spot, avoid)} of a possible ${best}`);
            if (best >= BADGE_RADIUS + tolerance) {
              possible += 1;
              if (clearance(spot, avoid) >= BADGE_RADIUS) clear += 1;
            }
          }
        }
      }
    }
  }
  assert.ok(pairs > 2000 && possible > pairs * 0.9, `${pairs} pairs, ${possible} with room for a clear badge`);
  assert.equal(clear, possible, 'wherever there is room, the badge covers nothing');
});

/* ------------------------------ the gestures ------------------------------ */

const place = (draft, point) => releaseDraft(pressDraft(draft, point, { view: VIEW }));

test('a line is checked only when a release completes or changes it — never on a press or mid-drag', () => {
  let step = place(emptyDraft(), { x: 0.2, y: -2.8 });
  assert.equal(step.outcome, DRAFT_OUTCOME.PLACED);
  assert.deepEqual(step.draft.points, [{ x: 0, y: -3 }]);
  // The second point follows the finger; nothing is decided while it moves.
  let held = pressDraft(step.draft, { x: 3, y: 3 }, { view: VIEW });
  held = moveDraft(held, { x: 1.1, y: -0.9 }, { view: VIEW });
  assert.deepEqual(draftPoints(held), [{ x: 0, y: -3 }, { x: 1, y: -1 }], 'the held point is drawn where the finger is');
  assert.equal(held.points.length, 1, 'but not placed yet');
  step = releaseDraft(held);
  assert.equal(step.outcome, DRAFT_OUTCOME.LINE, 'the second release completes a line: check it');
  assert.equal(pointsKey(step.draft.points), '0,-3;1,-1');

  // Picking a point up and letting go where it was is not a new attempt.
  const regrabbed = pressDraft(step.draft, { x: 1.2, y: -1.1 }, { view: VIEW });
  assert.deepEqual(regrabbed.active.origin, { x: 1, y: -1 }, 'a press on a placed point picks it up');
  assert.equal(releaseDraft(regrabbed).outcome, DRAFT_OUTCOME.UNCHANGED);
  // Dragged somewhere new, it is a changed line.
  const moved = releaseDraft(moveDraft(regrabbed, { x: 2, y: 1 }, { view: VIEW }));
  assert.equal(moved.outcome, DRAFT_OUTCOME.LINE);
  assert.deepEqual(moved.draft.points, [{ x: 0, y: -3 }, { x: 2, y: 1 }]);
  // Dropped on the other point, it goes back: a line needs two points.
  const onto = releaseDraft(moveDraft(pressDraft(moved.draft, { x: 2, y: 1 }, { view: VIEW }), { x: 0, y: -3 }, { view: VIEW }));
  assert.equal(onto.outcome, DRAFT_OUTCOME.SAME_POINT);
  assert.deepEqual(onto.draft.points, moved.draft.points);
  // A cancelled gesture puts the held point back.
  const cancelled = cancelDraft(moveDraft(pressDraft(moved.draft, { x: 2, y: 1 }, { view: VIEW }), { x: 5, y: 5 }, { view: VIEW }));
  assert.deepEqual(draftPoints(cancelled), moved.draft.points);
  assert.equal(releaseDraft(cancelled).outcome, DRAFT_OUTCOME.NONE);
});

test('with two points down, pressing on empty grid moves the nearer one there', () => {
  const two = place(place(emptyDraft(), { x: 0, y: 2 }).draft, { x: 1, y: 3 }).draft;
  const fixSlope = place(two, { x: 1, y: 4 });
  assert.equal(fixSlope.outcome, DRAFT_OUTCOME.LINE);
  assert.deepEqual(fixSlope.draft.points, [{ x: 0, y: 2 }, { x: 1, y: 4 }], 'the point at (1, 3) moved');
  const fixStart = place(two, { x: 0, y: -1 });
  assert.deepEqual(fixStart.draft.points, [{ x: 0, y: -1 }, { x: 1, y: 3 }], 'the point at (0, 2) moved');
  const tie = place(place(place(emptyDraft(), { x: 0, y: 0 }).draft, { x: 4, y: 4 }).draft, { x: 4, y: 0 });
  assert.deepEqual(tie.draft.points, [{ x: 0, y: 0 }, { x: 4, y: 0 }], 'a tie moves the point placed last');
});

test('the keyboard places, picks up and drops points with the same rules', () => {
  let cursor = moveLineCursor(VIEW, { x: 0, y: 0 }, 'ArrowDown');
  cursor = moveLineCursor(VIEW, cursor, 'ArrowDown');
  assert.deepEqual(cursor, { x: 0, y: -2 });
  assert.deepEqual(moveLineCursor(VIEW, { x: 5, y: 0 }, 'ArrowRight', { large: true }), { x: 6, y: 0 }, 'kept inside the view');
  assert.deepEqual(moveLineCursor(VIEW, { x: 5, y: 3 }, 'Home'), { x: 0, y: 0 });
  let step = keyboardEnter(emptyDraft(), cursor, { view: VIEW });
  assert.equal(step.outcome, DRAFT_OUTCOME.PLACED);
  assert.match(describeLineCursor(cursor, step.draft), /first point is here/);
  step = keyboardEnter(step.draft, { x: 2, y: 2 }, { view: VIEW });
  assert.equal(step.outcome, DRAFT_OUTCOME.LINE);
  // Enter on a placed point picks it up; arrows move it; Enter drops it.
  const picked = keyboardEnter(step.draft, { x: 2, y: 2 }, { view: VIEW });
  assert.equal(picked.outcome, DRAFT_OUTCOME.PICKED_UP);
  assert.match(describeLineCursor({ x: 2, y: 2 }, picked.draft), /Holding a point/);
  const dropped = keyboardEnter(moveDraft(picked.draft, { x: 2, y: 3 }, { view: VIEW }), { x: 2, y: 3 }, { view: VIEW });
  assert.equal(dropped.outcome, DRAFT_OUTCOME.LINE);
  assert.deepEqual(dropped.draft.points, [{ x: 0, y: -2 }, { x: 2, y: 3 }]);
});

/* -------------------------------- the round -------------------------------- */

const SEED = 'screen-room';

const roundFor = (settings = {}, { format = LINE_GRAPH_FORMAT.SPRINT, studentKey = 'ana', count = 12 } = {}) => {
  const config = normalizeLineGraphConfig({ presetId: 'allThreeForms', ...settings }, { format });
  const poolSize = lineRoundQuestionCount(format, config);
  const issued = Array.from({ length: Math.min(count, poolSize) }, (_, questionIndex) => generateLineQuestion({ seed: SEED, studentKey, roundIndex: 0, questionIndex, config }));
  return { config, poolSize, issued, questions: issued.map(publicLineQuestion) };
};

const sessionFor = (round, overrides = {}) => createLineSession({
  roundIndex: 0,
  questions: round.questions,
  poolSize: round.poolSize,
  rules: { triesPerItem: round.config.triesPerItem, showMethod: round.config.showMethod },
  ...overrides,
});

let ids = 0;
const nextId = () => `id-${(ids += 1)}`;

const rightPoints = (question) => latticePointsInView(question.line, question.view).slice(0, 2);
const wrongPoints = (question, offset = 1) => {
  const [first, second] = rightPoints(question);
  const moved = { x: second.x, y: second.y + (second.y + offset <= question.view.yMax ? offset : -offset) };
  return [first, moved];
};

const graphItemSession = (settings = {}) => {
  const round = roundFor({ itemTypes: ['graph'], ...settings });
  return { round, session: sessionFor(round) };
};

test('a right line completes the item once: a flash, then the next item', () => {
  const { session } = graphItemSession();
  const question = currentQuestion(session);
  const outcome = recordLine(session, { points: rightPoints(question), nowMs: 1_000, elapsedMs: 900, attemptId: nextId() });
  assert.equal(outcome.verdict, LINE_VERDICT.CORRECT);
  assert.equal(outcome.attempt.kind, LINE_ATTEMPT_KIND.LINE);
  assert.deepEqual(outcome.attempt.points, rightPoints(question));
  assert.equal(outcome.session.counts.completed, 1);
  assert.equal(outcome.session.feedback.kind, LINE_FEEDBACK.CORRECT);
  assert.equal(outcome.session.feedback.firstTry, true);
  assert.equal(inputState(outcome.session, 1_100), LINE_INPUT.TRANSITION, 'no input during the flash');
  assert.equal(effectiveCursor(outcome.session), 1);
  assert.equal(settle(outcome.session, 1_000 + LINE_CORRECT_FLASH_MS - 1), outcome.session, 'the flash runs its length');
  const next = settle(outcome.session, 1_000 + LINE_CORRECT_FLASH_MS);
  assert.equal(next.cursor, 1);
  assert.equal(lineFeedbackMessage(outcome.session.feedback, question), 'Correct!');
});

test('a wrong line is one miss with its hint; the same wrong line again is not a second miss', () => {
  const { session } = graphItemSession();
  const question = currentQuestion(session);
  const miss = recordLine(session, { points: wrongPoints(question), nowMs: 1_000, elapsedMs: 900, attemptId: nextId() });
  assert.equal(miss.verdict, LINE_VERDICT.INCORRECT);
  assert.ok(miss.attempt, 'a miss is sent');
  assert.equal(miss.session.feedback.kind, LINE_FEEDBACK.MISS);
  assert.ok(miss.session.feedback.message.length > 10, 'with the hint the grader wrote');
  assert.equal(triesLeft(miss.session), 2);
  assert.match(lineFeedbackMessage(miss.session.feedback, question, { left: triesLeft(miss.session) }), /2 tries left\.$/);
  // The same wrong line through two other of its points is the same answer.
  const studentLine = lineThroughPoints(...wrongPoints(question));
  const others = latticePointsInView(studentLine, question.view);
  assert.ok(others.length >= 3, 'the wrong line has another pair of points');
  const again = recordLine(miss.session, { points: [others[others.length - 1], others[others.length - 2]], nowMs: 2_000, elapsedMs: 1_900, attemptId: nextId() });
  assert.equal(again.verdict, LINE_VERDICT.REPEATED);
  assert.equal(again.attempt, null, 'nothing is sent');
  assert.equal(again.session.missesOnItem, 1);
  assert.equal(again.session.queue.length, 1);
  assert.match(lineFeedbackMessage(again.session.feedback, question), /same line/);
});

test('three wrong lines show the answer and move on; the pause grows with misses in a row', () => {
  const { session } = graphItemSession({ triesPerItem: 3 });
  const question = currentQuestion(session);
  const first = recordLine(session, { points: wrongPoints(question, 1), nowMs: 1_000, elapsedMs: 1, attemptId: nextId() }).session;
  assert.equal(first.lockedUntil, 0, 'no pause after one miss');
  const second = recordLine(first, { points: wrongPoints(question, 2), nowMs: 2_000, elapsedMs: 2, attemptId: nextId() }).session;
  assert.equal(second.lockedUntil, 2_000 + lineLockoutMs(2));
  assert.equal(inputState(second, 2_500), LINE_INPUT.LOCKED);
  assert.equal(recordLine(second, { points: rightPoints(question), nowMs: 2_500, elapsedMs: 3, attemptId: nextId() }).attempt, null, 'refused while paused');
  const third = recordLine(second, { points: wrongPoints(question, 3), nowMs: 4_000, elapsedMs: 4, attemptId: nextId() });
  assert.equal(third.session.feedback.kind, LINE_FEEDBACK.REVEALED);
  assert.equal(third.session.transition.kind, LINE_FEEDBACK.REVEALED);
  assert.equal(third.session.counts.ended, 1);
  assert.equal(third.session.counts.completed, 0);
  assert.equal(settle(third.session, 4_000 + LINE_REVEAL_MS).cursor, 1);
  assert.match(lineFeedbackMessage(third.session.feedback, question), /Here is the line/);
});

test('"until right" never says how many tries are left, and still moves a stuck student on', () => {
  const { session } = graphItemSession({ triesPerItem: 0 });
  assert.equal(triesLeft(session), Number.POSITIVE_INFINITY);
  const question = currentQuestion(session);
  let current = session;
  let now = 0;
  for (let miss = 1; miss <= 8; miss += 1) {
    now += 10_000;
    current = recordLine(current, { points: wrongPoints(question, miss % 2 ? 1 : 2), nowMs: now, elapsedMs: now, attemptId: nextId() }).session;
    if (miss < 8) assert.doesNotMatch(lineFeedbackMessage(current.feedback, question, { left: triesLeft(current) }), /tries? left/);
  }
  assert.equal(current.feedback.kind, LINE_FEEDBACK.REVEALED, 'the eighth miss ends the item');
});

test('show your method: the right line past the key points is neither credit nor a miss', () => {
  const round = roundFor({ itemTypes: ['graph'], forms: ['standard'], difficulty: 'standard', showMethod: true });
  const session = sessionFor(round);
  const question = currentQuestion(session);
  assert.ok(question.anchors.length === 2, 'a standard-form item graphed by its intercepts');
  const elsewhere = latticePointsInView(question.line, question.view).filter((point) => !question.anchors.some((anchor) => anchor.x === point.x && anchor.y === point.y));
  if (elsewhere.length >= 2) {
    const outcome = recordLine(session, { points: elsewhere.slice(0, 2), nowMs: 1_000, elapsedMs: 1, attemptId: nextId() });
    assert.equal(outcome.verdict, LINE_VERDICT.METHOD);
    assert.equal(outcome.attempt, null);
    assert.match(lineFeedbackMessage(outcome.session.feedback, question), /Right line!/);
  }
  const through = recordLine(session, { points: question.anchors, nowMs: 1_000, elapsedMs: 1, attemptId: nextId() });
  assert.equal(through.verdict, LINE_VERDICT.CORRECT);
});

test('naming: a chosen equation gets one try; a built one is checked on Enter, and unfinished boxes are not a miss', () => {
  const chosen = roundFor({ itemTypes: ['name'], nameStyle: 'choice' });
  let session = sessionFor(chosen);
  let question = currentQuestion(session);
  assert.equal(question.answerStyle, LINE_ANSWER_STYLE.CHOICE);
  const wrongChoice = question.choices.find((choice) => choice.id !== question.answerChoice).id;
  const miss = recordChoice(session, { choiceId: wrongChoice, nowMs: 1_000, elapsedMs: 1, attemptId: nextId() });
  assert.equal(miss.session.feedback.kind, LINE_FEEDBACK.REVEALED, 'one try');
  assert.equal(miss.attempt.choice, wrongChoice);
  assert.match(lineFeedbackMessage(miss.session.feedback, question), /right equation is marked/);
  const right = recordChoice(session, { choiceId: question.answerChoice, nowMs: 1_000, elapsedMs: 1, attemptId: nextId() });
  assert.equal(right.verdict, LINE_VERDICT.CORRECT);

  const built = roundFor({ itemTypes: ['name'], nameStyle: 'build', forms: ['slopeIntercept'] });
  session = sessionFor(built);
  question = currentQuestion(session);
  assert.equal(question.answerStyle, LINE_ANSWER_STYLE.BUILD);
  const empty = recordEquation(session, { fields: { m: '2', b: '' }, nowMs: 1_000, elapsedMs: 1, attemptId: nextId() });
  assert.equal(empty.verdict, LINE_VERDICT.FORM);
  assert.equal(empty.attempt, null);
  assert.equal(empty.session.feedback.field, 'b', 'the box to fix');
  const m = slopeOf(question.line);
  const b = yInterceptOf(question.line);
  const text = (value) => (value.d === 1 ? String(value.n) : `${value.n}/${value.d}`);
  const answer = recordEquation(session, { fields: { m: text(m), b: text(b) }, nowMs: 1_000, elapsedMs: 1, attemptId: nextId() });
  assert.equal(answer.verdict, LINE_VERDICT.CORRECT);
  assert.deepEqual(answer.attempt.fields, { m: text(m), b: text(b) });
  const off = recordEquation(session, { fields: { m: text(Q.add(m, 1)), b: text(b) }, nowMs: 1_000, elapsedMs: 1, attemptId: nextId() });
  assert.equal(off.verdict, LINE_VERDICT.INCORRECT);
  assert.equal(recordEquation(off.session, { fields: { m: text(Q.add(m, 1)), b: text(b) }, nowMs: 9_000, elapsedMs: 9, attemptId: nextId() }).verdict, LINE_VERDICT.REPEATED);
});

test('skipping ends the item; a finished Sprint takes no more input', () => {
  const round = roundFor({ itemTypes: ['graph'], sprintLength: 5 }, { count: 5 });
  let session = sessionFor(round);
  let now = 0;
  for (let index = 0; index < 5; index += 1) {
    now += 5_000;
    const outcome = recordSkip(session, { nowMs: now, elapsedMs: now, attemptId: nextId() });
    assert.equal(outcome.attempt.kind, LINE_ATTEMPT_KIND.SKIP);
    session = settle(outcome.session, now + 5_000);
  }
  assert.equal(session.counts.ended, 5);
  assert.equal(inputState(session, now + 6_000), LINE_INPUT.FINISHED);
  assert.equal(prefetchRequest(session), null, 'nothing more to fetch');
  assert.equal(nextBatch(session).length, 5);
});

test('the server\'s word: a drained queue takes its counts, and its place when they differ', () => {
  const { session } = graphItemSession();
  const question = currentQuestion(session);
  const sent = recordLine(session, { points: wrongPoints(question), nowMs: 1_000, elapsedMs: 1, attemptId: nextId() });
  const agreed = acknowledge(sent.session, { sent: [sent.attempt], reply: { state: { cursor: 0, cursorMisses: 1, questionsCorrect: 0, ended: 0, attempts: 1, hits: 0 } } });
  assert.equal(agreed.resynced, false);
  assert.equal(agreed.session.queue.length, 0);
  const elsewhere = acknowledge(sent.session, { sent: [sent.attempt], reply: { state: { cursor: 2, cursorMisses: 0, questionsCorrect: 2, ended: 0, attempts: 3, hits: 2 } } });
  assert.equal(elsewhere.resynced, true);
  assert.equal(elsewhere.session.cursor, 2);
  assert.equal(elsewhere.session.counts.completed, 2);
  assert.equal(elsewhere.session.feedback.kind, LINE_FEEDBACK.RESYNCED);
  // While attempts are still waiting, the device's own count stands.
  const twoQueued = recordLine(sent.session, { points: wrongPoints(question, 2), nowMs: 3_000, elapsedMs: 3, attemptId: nextId() });
  assert.equal(acknowledge(twoQueued.session, { sent: [sent.attempt], reply: { state: { cursor: 5 } } }).session.cursor, 0);
});

test('a stored queue is shape-checked, and attempt ids fit the server\'s pattern', () => {
  const stored = JSON.stringify([
    { attemptId: 'ok-1', questionIndex: 0, kind: 'line', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
    { attemptId: 'x'.repeat(41), questionIndex: 0, kind: 'line' },
    { attemptId: 'bad kind', questionIndex: 0, kind: 'tap' },
    { attemptId: 'ok-2', questionIndex: 1.5, kind: 'skip' },
    null,
  ]);
  assert.deepEqual(parseStoredLineQueue(stored).map((attempt) => attempt.attemptId), ['ok-1']);
  assert.deepEqual(parseStoredLineQueue('not json'), []);
  assert.match(newLineAttemptId(), /^[A-Za-z0-9_-]{1,40}$/);
  assert.match(newLineAttemptId({}), /^[A-Za-z0-9_-]{1,40}$/, 'without randomUUID too');
  assert.equal(lineQueueKey('room', 2, 1), 'graph-the-line-queue-room-2-1');
});

/*
 * THE DEVICE AND THE SERVER AGREE. Random play — right lines, wrong lines,
 * the same wrong line twice, chosen and typed equations, unfinished boxes,
 * skips — on the device session; everything it sends goes through the
 * server's own pipeline against the server's own items. After every batch
 * the two agree on where the student is and what they have done.
 */
test('the device\'s verdicts are the server\'s, over whole random rounds', () => {
  const strategy = getScoringStrategy('correctCount');
  for (const [trial, settings] of [
    [1, { presetId: 'graphAndName', nameStyle: 'choice', triesPerItem: 3 }],
    [2, { presetId: 'unitReview', nameStyle: 'build', triesPerItem: 2 }],
    [3, { presetId: 'graphAndName', nameStyle: 'build', triesPerItem: 0 }],
    [4, { presetId: 'allThreeForms', showMethod: true, triesPerItem: 1 }],
  ]) {
    const rng = createRng(`parity-${trial}`);
    const round = roundFor({ ...settings, sprintLength: 10 }, { count: 10, studentKey: `p${trial}` });
    let session = sessionFor(round);
    let player = { submissionReceipts: {}, attemptSequence: 0 };
    let now = 10_000;
    let lastWrong = null;
    for (let step = 0; step < 120 && inputState(session, now) !== LINE_INPUT.FINISHED; step += 1) {
      now += 3_000;
      session = settle(session, now);
      if (inputState(session, now) !== LINE_INPUT.READY) continue;
      const question = currentQuestion(session);
      const context = { nowMs: now, elapsedMs: now - 10_000, attemptId: nextId() };
      const roll = rng.next();
      let outcome;
      if (roll < 0.06 && question.answerStyle !== LINE_ANSWER_STYLE.CHOICE) {
        outcome = recordSkip(session, context);
      } else if (question.itemType === LINE_ITEM_TYPE.GRAPH) {
        const points = roll < 0.45 ? rng.shuffle(rightPoints(question))
          : roll < 0.6 && lastWrong ? lastWrong
            : wrongPoints(question, rng.int(1, 3));
        if (roll >= 0.45) lastWrong = points;
        outcome = recordLine(session, { ...context, points });
      } else if (question.answerStyle === LINE_ANSWER_STYLE.CHOICE) {
        outcome = recordChoice(session, { ...context, choiceId: rng.pick(question.choices).id });
      } else {
        const right = { m: slopeOf(question.line), b: yInterceptOf(question.line) };
        const text = (value) => (value.d === 1 ? String(value.n) : `${value.n}/${value.d}`);
        let fields;
        if (question.build.form === 'slopeIntercept') fields = { m: text(right.m), b: roll < 0.5 ? text(right.b) : text(Q.add(right.b, 1)) };
        else if (question.build.form === 'standard') fields = { A: String(question.line.a), B: String(question.line.b), C: String(question.line.c + (roll < 0.5 ? 0 : 1)) };
        else {
          const at = question.marked || rightPoints(question)[0];
          fields = { x1: String(at.x), y1: String(at.y), m: roll < 0.5 ? text(slopeOf(question.line)) : text(Q.neg(slopeOf(question.line))) };
        }
        if (roll > 0.92) fields = Object.fromEntries(Object.keys(fields).map((key, index) => [key, index ? fields[key] : '']));
        outcome = recordEquation(session, { ...context, fields });
      }
      session = outcome.session;
      if (!outcome.attempt) continue;
      // The server grades the batch against its own copy of each item.
      const batch = nextBatch(session);
      const applied = applyLineGraphAttempts({
        player,
        roundIndex: 0,
        roundVersion: 0,
        attempts: batch,
        questionFor: (index) => round.issued[index] || generateLineQuestion({ seed: SEED, studentKey: `p${trial}`, roundIndex: 0, questionIndex: index, config: round.config }),
        config: round.config,
        arrivedAtMs: now,
        arrivalElapsedMs: now - 10_000,
        roundDurationMs: 600_000,
        strategy,
        poolSize: round.poolSize,
      });
      batch.forEach((attempt, index) => {
        const verdict = applied.verdicts[index].verdict;
        assert.ok([LINE_VERDICT.CORRECT, LINE_VERDICT.INCORRECT, LINE_VERDICT.SKIPPED].includes(verdict), `trial ${trial}: the server recorded what the device sent (${verdict})`);
      });
      player = { ...player, submissionReceipts: applied.receipts, attemptSequence: applied.attemptSequence };
      const reply = { verdicts: applied.verdicts, state: applied.state };
      const acknowledged = acknowledge(session, { sent: batch, reply });
      assert.equal(acknowledged.resynced, false, `trial ${trial}, step ${step}: the device never had to be corrected`);
      session = acknowledged.session;
      const server = lineRoundState({ receipts: player.submissionReceipts, roundIndex: 0, poolSize: round.poolSize });
      assert.equal(effectiveCursor(session), server.cursor);
      assert.equal(session.counts.completed, server.questionsCorrect);
      assert.equal(session.counts.ended, server.ended);
    }
    assert.ok(session.counts.completed + session.counts.ended > 0, `trial ${trial} played`);
  }
});

test('a shown answer is the item\'s own line, written in the form the item asked for', () => {
  for (const nameStyle of ['choice', 'build']) {
    const config = normalizeLineGraphConfig({ presetId: 'unitReview', itemTypes: ['graph', 'name'], nameStyle }, { format: LINE_GRAPH_FORMAT.RUSH });
    for (let index = 0; index < 150; index += 1) {
      const question = publicLineQuestion(generateLineQuestion({ seed: `answers-${nameStyle}`, studentKey: `s${index % 7}`, roundIndex: 0, questionIndex: index, config }));
      const equation = answerEquation(question);
      assert.ok(equation?.tokens?.length, `${question.itemType}/${question.form} has an answer to show`);
      assert.ok(sameLine(lineOfText(equation.text), question.line), `${equation.text} is the item's line`);
      if (question.itemType === LINE_ITEM_TYPE.NAME && question.answerStyle === LINE_ANSWER_STYLE.BUILD && question.form === 'standard') {
        assert.match(equation.text, /^-?−?\d*x [+−] \d*y = −?\d+$/, `${equation.text} is written in standard form`);
      }
    }
  }
  assert.equal(answerEquation(null), null);
});

test('the equation renderer reads the same token kinds the forms module writes', () => {
  assert.deepEqual({ ...EQUATION_TOKEN_KIND }, { ...TOKEN_KIND });
});

test('nothing on the line grid or in the round imports the generator', async () => {
  const { readFileSync } = await import('node:fs');
  const { executableSource } = await import('./helpers/sourceContract.mjs');
  for (const file of ['lineGraphModel.js', 'lineGraphSession.js']) {
    const source = executableSource(readFileSync(new URL(`../../src/platform/liveChallenge/${file}`, import.meta.url), 'utf8'));
    assert.doesNotMatch(source, /lineGraphGenerator|lineGraphAttempts|seededRandom/, `${file} ships to students: items come from the server`);
  }
  // The device reads a line's points the way the grader does.
  assert.ok(containsPoint({ a: 2, b: -1, c: 3 }, { x: 0, y: -3 }));
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeLineGraphConfig } from '../../functions/shared/lineGraphConfig.mjs';
import { generateLineQuestion, publicLineQuestion } from '../../functions/shared/lineGraphGenerator.mjs';
import { checkChoiceAnswer, checkEquationAnswer, checkLineAnswer } from '../../functions/shared/lineGraphGrading.mjs';
import { LINE_ANSWER_STYLE, LINE_GRAPH_FORMAT_IDS, LINE_VERDICT } from '../../functions/shared/lineGraphRules.mjs';
import { LINE_PLAN, drawnLineKey, lineActionsFor } from '../integration/support/liveChallengeSimLineRound.mjs';

/*
 * WHAT THE LAUNCH CERTIFICATION'S STUDENTS DO, CHECKED BEFORE A CLASS DOES IT.
 *
 * The Graph the Line launch runs (tests/integration/lineGraphLaunch) give
 * each simulated student a plan — right first time, a slip fixed, the class's
 * common mistake, out of tries — and then hold the server's receipts to each
 * plan's exact count of attempts. That only proves anything if every plan
 * does what it says on EVERY item the generator can make: a "wrong" line that
 * is wrong, three different ones for a stuck student (the same line twice is
 * `repeated`, never a second miss), and the same common mistake for everyone
 * given the same line. A key point on the grid's edge once left a stuck
 * student two wrong lines on one item in twenty: a class-scale flake, caught
 * here deterministically.
 */

const verdictOf = (item, action) => {
  if (action.kind === 'line') return checkLineAnswer({ question: item, points: action.points, showMethod: false }).verdict;
  if (action.kind === 'choice') return checkChoiceAnswer({ question: item, choiceId: action.choiceId }).verdict;
  if (action.kind === 'equation') return checkEquationAnswer({ question: item, fields: action.fields }).verdict;
  return 'skip';
};
const keyOf = (action) => (action.kind === 'line' ? drawnLineKey(action.points) : JSON.stringify(action));

const C = LINE_VERDICT.CORRECT;
const I = LINE_VERDICT.INCORRECT;
const expected = (choose) => ({
  [LINE_PLAN.RIGHT]: [C],
  // One try for a chosen equation: a slip there is just the answer.
  [LINE_PLAN.FIX]: choose ? [C] : [I, C],
  [LINE_PLAN.COMMON]: choose ? [I] : [I, C],
  [LINE_PLAN.STUCK]: choose ? [I] : [I, I, I],
});

test('every plan does what it says on every kind of item, in every format', () => {
  let items = 0;
  for (const format of LINE_GRAPH_FORMAT_IDS) {
    for (const difficulty of ['easy', 'standard', 'challenge', 'mixed']) {
      for (const nameStyle of ['choice', 'build']) {
        const config = { ...normalizeLineGraphConfig({ presetId: 'graphAndName', difficulty, nameStyle, specialLines: true }, { format }), format };
        for (let seed = 0; seed < 24; seed += 1) {
          for (let index = 0; index < 6; index += 1) {
            const item = publicLineQuestion(generateLineQuestion({ seed: `plans-${format}-${difficulty}-${nameStyle}-${seed}`, studentKey: `s${seed}`, roundIndex: index, questionIndex: format === 'classic' ? 0 : index, config }));
            const label = `${format}/${difficulty}/${nameStyle} ${item.itemType}/${item.form}/${item.answerStyle}`;
            const choose = item.answerStyle === LINE_ANSWER_STYLE.CHOICE;
            for (const [plan, verdicts] of Object.entries(expected(choose))) {
              const actions = lineActionsFor(item, plan, { itemNumber: index, canSkip: true });
              assert.deepEqual(actions.slice(0, verdicts.length).map((action) => verdictOf(item, action)), verdicts, `${label}: ${plan}`);
              if (plan === LINE_PLAN.STUCK && !choose) {
                assert.equal(new Set(actions.slice(0, 3).map(keyOf)).size, 3, `${label}: a stuck student's three wrong answers are three different ones`);
              }
            }
            if (!choose) {
              const [common] = lineActionsFor(item, LINE_PLAN.COMMON);
              const [slip] = lineActionsFor(item, LINE_PLAN.FIX);
              assert.notEqual(keyOf(common), keyOf(slip), `${label}: the class's common mistake is not a slip's`);
              assert.deepEqual(lineActionsFor(item, LINE_PLAN.COMMON), lineActionsFor(item, LINE_PLAN.COMMON), `${label}: the same for everyone`);
            }
            // Skipping is offered only where the format has Skip.
            assert.equal(lineActionsFor(item, LINE_PLAN.SKIP, { itemNumber: 1, canSkip: false })[0].kind === 'skip', false);
            items += 1;
          }
        }
      }
    }
  }
  assert.ok(items >= 3_000, `${items} items`);
});

test('a key point on the grid\'s edge still leaves a stuck student three different wrong lines', () => {
  // The right line through (-3, 8) on a ±8 grid: every offset upward leaves it.
  const item = {
    answerStyle: LINE_ANSWER_STYLE.GRAPH,
    line: { a: 4, b: -1, c: -20 },
    view: { xMin: -8, xMax: 8, yMin: -8, yMax: 8 },
    reveal: { points: [{ x: -4, y: 4 }, { x: -3, y: 8 }] },
  };
  const right = drawnLineKey(item.reveal.points);
  const wrong = lineActionsFor(item, LINE_PLAN.STUCK).slice(0, 3);
  assert.ok(wrong.every((action) => action.kind === 'line' && keyOf(action) !== right), 'three wrong lines before any right one');
  assert.equal(new Set(wrong.map(keyOf)).size, 3);
  wrong.forEach((action) => action.points.forEach((point) => assert.ok(point.y <= 8 && point.y >= -8, 'on the grid')));
});

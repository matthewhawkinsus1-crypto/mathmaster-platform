import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { referenceLineOf, referenceLineProblem } from '../../functions/shared/toolMath/graphing2/graphingMath.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { buildQuestionHints } from '../../src/platform/supports/hints/questionHints.js';
import * as linesAndSlope from '../../src/platform/supports/families/linesAndSlope.js';
import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';

/*
 * GRAPHING 2'S REFERENCE-LINE MODE (TL20, walkthrough R-7).
 *
 * A perpendicular-slope item asked "Graph the line through (2, 1) with slope
 * −1/2": the tool printed the very slope the item assesses (l3-pr-6 stated it
 * in its prompt for that reason). A point-slope question may now carry
 * `referenceLine: { m, b, relation }`: the tool draws the given line, asks for
 * the line through the point that is perpendicular (or parallel) to it, and
 * prints no slope — nor do its hints, whose first rung names the rule. The
 * target is still the authored point and slope, so grading does not change.
 */

const base = { type: 'graphing2', toolId: 'graphing2', questionId: 'g2-reference', mode: 'pointSlope', prompt: 'Line k passes through the given point. Graph line k.' };
const perpendicular = { ...base, point: [2, 1], slope: -0.5, referenceLine: { m: 2, b: -3, relation: 'perpendicular' } };
const parallel = { ...base, point: [0, 3], slope: 2, referenceLine: { m: 2, b: -3, relation: 'parallel' } };
const withoutReference = ({ referenceLine: _reference, ...question }) => question;

// Every way the slope −1/2 (or 2, for the parallel line) could be written.
const SLOPE_TEXT = {
  perpendicular: /(?:−|-)\s*1\s*\/\s*2|(?:−|-)0?\.5\b|\\frac\{-?1\}\{2\}|\bslope (?:of )?(?:−|-)/,
  parallel: /\bslope (?:is |of )?2\b|\bslope 2\b/,
};

test('a reference line must agree with the slope it grades, or it is not one', () => {
  assert.equal(referenceLineProblem(perpendicular), null);
  assert.equal(referenceLineProblem(parallel), null);
  assert.deepEqual(referenceLineOf(perpendicular), { kind: 'slopeIntercept', m: 2, b: -3, relation: 'perpendicular' });
  assert.equal(referenceLineOf(withoutReference(perpendicular)), null);
  assert.equal(referenceLineProblem(withoutReference(perpendicular)), null, 'no reference line, nothing to check');
  // Negative reciprocals that are not short decimals still agree.
  assert.equal(referenceLineProblem({ ...base, point: [-3, 1], slope: 3, referenceLine: { m: -1 / 3, b: 2, relation: 'perpendicular' } }), null);
  const refused = {
    'perpendicular slopes that do not multiply to −1': { ...perpendicular, slope: 2 },
    'a parallel slope that differs': { ...parallel, slope: -0.5 },
    'perpendicular to a horizontal line (the answer is vertical)': { ...perpendicular, referenceLine: { m: 0, b: 1, relation: 'perpendicular' } },
    'parallel through a point on the given line (the answer is already drawn)': { ...parallel, point: [1, -1] },
    'an unknown relation': { ...perpendicular, referenceLine: { m: 2, b: -3, relation: 'skew' } },
    'a missing intercept': { ...perpendicular, referenceLine: { m: 2, relation: 'perpendicular' } },
    'a non-numeric slope': { ...perpendicular, referenceLine: { m: '2x', b: -3, relation: 'perpendicular' } },
    'another mode': { ...base, mode: 'slopeIntercept', line: { m: -0.5, b: 2 }, referenceLine: { m: 2, b: -3, relation: 'perpendicular' } },
  };
  for (const [label, question] of Object.entries(refused)) {
    assert.ok(referenceLineProblem(question), `${label}: a problem is named`);
    assert.equal(referenceLineOf(question), null, `${label}: no reference line is drawn`);
    const { errors } = validateToolQuestion(question);
    assert.ok(errors.some((error) => error.startsWith('graphing2 referenceLine: ')), `${label}: toolSchemas refuses it`);
  }
  // The author is told why: the line they want is vertical, which point-slope cannot ask for.
  assert.match(referenceLineProblem(refused['perpendicular to a horizontal line (the answer is vertical)']), /vertical/);
  assert.deepEqual(validateToolQuestion(perpendicular).errors, []);
  assert.deepEqual(validateToolQuestion(parallel).errors, []);
  // A given line the drawn window never shows is refused too.
  const offScreen = { ...perpendicular, point: [0, 0], slope: -0.5, referenceLine: { m: 2, b: 40, relation: 'perpendicular' } };
  assert.ok(validateToolQuestion(offScreen).errors.some((error) => /referenceLine never crosses the drawn window/.test(error)));
});

test('grading is unchanged: the target is still the line through the point with the authored slope', () => {
  const works = (question) => {
    const [x, y] = question.point;
    const m = question.slope;
    return {
      right: { points: [[x, y], [x + 2, y + 2 * m]] },
      rightElsewhere: { points: [[x + 2, y + 2 * m], [x - 2, y - 2 * m]] },
      givenLinesSlope: { points: [[x, y], [x + 1, y + question.referenceLine.m]] },
      negativeOfGiven: { points: [[x, y], [x + 1, y - question.referenceLine.m]] },
      onePoint: { points: [[x, y]] },
    };
  };
  for (const question of [perpendicular, parallel]) {
    for (const [label, work] of Object.entries(works(question))) {
      const withReference = gradeToolWork({ toolId: 'graphing2', question, work });
      const plain = gradeToolWork({ toolId: 'graphing2', question: withoutReference(question), work });
      assert.deepEqual(withReference, plain, `${question.referenceLine.relation} ${label}: the same verdict as the plain point-slope question`);
    }
    assert.equal(gradeToolWork({ toolId: 'graphing2', question, work: works(question).right }).isCorrect, true);
  }
  assert.equal(gradeToolWork({ toolId: 'graphing2', question: perpendicular, work: works(perpendicular).givenLinesSlope }).isCorrect, false, 'the given line\'s own slope is the classic miss');
});

test('the platform hint ladder names the rule and never states the slope', () => {
  for (const [relation, question] of [['perpendicular', perpendicular], ['parallel', parallel]]) {
    const ladder = buildQuestionHints(question).map((hint) => hint.text);
    assert.ok(ladder.length >= 3, `${relation}: a ladder`);
    assert.match(ladder[0], relation === 'perpendicular' ? /negative reciprocals/ : /Parallel lines have the same slope/, `${relation}: the first rung names the rule`);
    for (const hint of ladder) assert.doesNotMatch(hint, SLOPE_TEXT[relation], `${relation}: no rung states the slope: ${hint}`);
    // The slope is an answer the guard holds back, even where the given line
    // prints the same number (a parallel line).
    assert.ok(linesAndSlope.expectedValues(question).includes(relation === 'perpendicular' ? '-1/2' : '2'), `${relation}: the slope is an answer`);
    const backUp = linesAndSlope.backUpQuestion(question);
    assert.match(backUp.prompt, new RegExp(`A line ${relation} to the given line has which slope`));
    assert.equal(backUp.correct, relation === 'perpendicular' ? 'The negative reciprocal of its slope' : 'The same slope');
    // "Try a similar one" is a reference-line question too, with other numbers.
    const sibling = linesAndSlope.similarProblem(question, { seed: 4 });
    assert.match(sibling.prompt, new RegExp(`that is ${relation} to y = `));
  }
  // Without a reference line the point-slope ladder still quotes its printed slope.
  assert.ok(buildQuestionHints(withoutReference(perpendicular)).some((hint) => /The slope -1\/2 is rise over run/.test(hint.text)));
});

test('the worked solution, once the question is closed, finds the slope from the given line first', () => {
  const review = buildToolSolutionReviewModel(perpendicular);
  assert.equal(review.steps[0], 'The given line y = 2x − 3 has slope 2. Perpendicular lines have slopes that are negative reciprocals, so this line\'s slope is −1/2.');
  assert.match(buildToolSolutionReviewModel(parallel).steps[0], /Parallel lines have the same slope, so this line's slope is 2 too\./);
  assert.match(linesAndSlope.workedSolution(perpendicular).steps[0], /negative reciprocals, so this line's slope is -1\/2\./);
  assert.doesNotMatch(buildToolSolutionReviewModel(withoutReference(perpendicular)).steps.join(' '), /negative reciprocals/);
});

test('a V5 graphing2 question keeps its reference line through the compiler, and one without it gains nothing', () => {
  const compile = (lineIntent) => compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'Perpendicular lines', courseId: 'algebra1' },
    sections: [{ role: 'practice', questions: [{
      standard: 'A.2C', prompt: 'Graph line k through (2, 1), perpendicular to y = 2x − 3.', studentActions: ['constructLine'], lineIntent,
    }] }],
  }).package.sections[0].questions[0];
  const intent = { mode: 'pointSlope', point: [2, 1], slope: -0.5 };
  const referenced = compile({ ...intent, referenceLine: { m: 2, b: -3, relation: 'perpendicular' } });
  assert.equal(referenced.type, 'graphing2');
  assert.deepEqual(referenced.referenceLine, { m: 2, b: -3, relation: 'perpendicular' });
  assert.equal(referenceLineProblem(referenced), null);
  assert.equal('referenceLine' in compile(intent), false, 'existing content compiles exactly as before');
});

/* ------------------------------------------------------------ the tool */

const withVite = async (run) => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const hadWindow = 'window' in globalThis;
  const before = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => 'open', setItem() {} } };
  try {
    return await run((path) => server.ssrLoadModule(path));
  } finally {
    if (hadWindow) globalThis.window = before;
    else delete globalThis.window;
    await server.close();
  }
};
const words = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ');

test('the tool draws the given line, asks for the perpendicular (or parallel) line, and prints no slope', async () => {
  await withVite(async (load) => {
    const { ToolRuntimeProvider } = await load('/src/tools/shared/ToolRuntimeContext.jsx');
    const graphing2 = await load('/src/tools/graphing2/Graphing2.jsx');
    const render = (questionData) => renderToStaticMarkup(React.createElement(
      ToolRuntimeProvider,
      { hintsAllowed: true, verdictsWithheld: false },
      React.createElement(graphing2.default, { questionData }),
    ));

    const html = render(perpendicular);
    const text = words(html);
    assert.ok(text.includes('Graph the line through (2, 1) that is perpendicular to y = 2x − 3.'), 'the task names the given line');
    assert.ok(text.includes('Perpendicular line'), 'the badge names the relation');
    assert.ok(text.includes('The dashed grey line is the given line, y = 2x − 3.'), 'the legend names the drawn line in words');
    // On the plane, sloped (the legend's own swatch is flat), grey and dashed.
    const greyDashed = [...html.matchAll(/<line ([^>]*)>/g)].map(([, attributes]) => attributes)
      .filter((attributes) => attributes.includes('stroke="#5f6b7a"') && attributes.includes('stroke-dasharray="9 6"'));
    const sloped = greyDashed.filter((attributes) => /y1="([^"]+)"/.exec(attributes)?.[1] !== /y2="([^"]+)"/.exec(attributes)?.[1]);
    assert.equal(sloped.length, 1, 'the given line is drawn across the plane, dashed');
    assert.doesNotMatch(text, SLOPE_TEXT.perpendicular, 'no slope anywhere on the screen');
    assert.doesNotMatch(text, /nearest 0\.5/, 'not even the snap note that would say it is not whole');
    assert.ok(text.includes('Points snap to the grid as you place them.'));

    const parallelText = words(render(parallel));
    assert.ok(parallelText.includes('Graph the line through (0, 3) that is parallel to y = 2x − 3.'));
    assert.ok(parallelText.includes('Parallel line'));

    // Its own rungs (shown where a host has no ladder): the rule first, no slope.
    for (const [relation, question] of [['perpendicular', perpendicular], ['parallel', parallel]]) {
      const hints = graphing2.hintsForMode('pointSlope', null, question);
      assert.match(hints[0], relation === 'perpendicular' ? /negative reciprocals/ : /^Parallel lines have the same slope\.$/);
      for (const hint of hints) assert.doesNotMatch(hint, /\d/, `${relation}: a rung quotes no number at all: ${hint}`);
    }

    // Without a reference line — or with one that disagrees with the slope —
    // the plain point-slope question, which prints the slope it grades.
    const plain = words(render(withoutReference(perpendicular)));
    assert.ok(plain.includes('Graph the line through (2, 1) with slope -0.5.'));
    assert.ok(plain.includes('Point-slope form'));
    assert.doesNotMatch(render(withoutReference(perpendicular)), /stroke-dasharray="9 6"/);
    assert.ok(words(render({ ...perpendicular, slope: 2 })).includes('Graph the line through (2, 1) with slope 2.'), 'an inconsistent reference line is ignored, never shown over another target');
  });
});

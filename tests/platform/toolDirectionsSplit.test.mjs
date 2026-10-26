/*
 * STUDENT PASS 3, W6-4: A TOOL'S DIRECTIONS ON AN ASSESSMENT.
 *
 * W4-1 (R-10) withheld a tool's "How to do this" steps wherever the activity
 * withholds hints or verdicts (an exit ticket, quiz or test before release).
 * A list was either all method (withheld) or all controls (`stepsAreControls`,
 * kept). Mixed lists lost their control lines too: on an exit ticket Linear
 * Intercepts, Rewrite Linear Form, the Constraint Function Builder and
 * Representation Match's grouping board said nothing about how to work them,
 * and Data Modeling's regression modes had no secure list at all.
 *
 * Now a step wrapped in `controlStep()` stays where the method goes; a plain
 * string is method (fail closed). Each tool is rendered whole (Vite SSR) on
 * practice and on a DOL, and the steps are asserted by their words: the
 * control lines are there on both, the method lines only on practice.
 *
 * Also here: the Work View instruction banner fails closed on an assessment
 * (only one a tool marks `controlsOnly`), and the Representation Bridge's
 * "a is the rate…" lines, highlight buttons and Representation Match's
 * "Representation reasoning" fold are withheld there (W4-1's round-2 notes).
 *
 * The browser half (390x844, Work View Help, practice beside DOL) is
 * tests/browser/workViewHelpReach.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { instructionShown, mergeWorkViewCapabilities, taskShown } from '../../src/platform/workView/workViewCapabilities.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const code = (path) => executableSource(read(path));

// The card's fold remembers whether it was open (QuietDisclosure). Rendered
// with that memory saying "open", so every step the card shows is in the
// markup — a step the card withholds still is not.
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

const PRACTICE = { hintsAllowed: true, verdictsWithheld: false };
const DOL = { hintsAllowed: false, verdictsWithheld: true };

const renderTool = async (load, path, questionData, runtime) => {
  const { ToolRuntimeProvider } = await load('/src/tools/shared/ToolRuntimeContext.jsx');
  const Tool = (await load(path)).default;
  return renderToStaticMarkup(React.createElement(ToolRuntimeProvider, runtime, React.createElement(Tool, { questionData })));
};
// MathText may split a step into spans; the words are compared without tags.
const words = (html) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const stepCount = (html) => Number((/How to do this \((\d+) steps?\)/.exec(html) || [])[1] || 0);

// Asserts a tool's card on practice and on a DOL: the control steps on both,
// the method steps (and the tool's directions sentence) only on practice.
const assertSplit = async (load, { path, question, controls, method, directions = null, label }) => {
  const practice = words(await renderTool(load, path, question, PRACTICE));
  const dol = words(await renderTool(load, path, question, DOL));
  for (const step of [...controls, ...method]) assert.ok(practice.includes(step), `${label} practice shows: ${step}`);
  assert.equal(stepCount(practice), controls.length + method.length, `${label} practice counts every step`);
  for (const step of controls) assert.ok(dol.includes(step), `${label} DOL keeps the control step: ${step}`);
  for (const step of method) assert.ok(!dol.includes(step), `${label} DOL withholds the method step: ${step}`);
  assert.equal(stepCount(dol), controls.length, `${label} DOL counts only the control steps`);
  if (directions) {
    assert.ok(practice.includes(directions), `${label} practice shows the directions sentence`);
    assert.ok(!dol.includes(directions), `${label} DOL withholds the directions sentence (it may name the route)`);
  }
  return { practice, dol };
};

test('W6-4: taskCardSupport keeps the control steps of a mixed list where the method is withheld', async () => {
  await withVite(async (load) => {
    const { controlStep, taskCardSupport } = await load('/src/tools/shared/ToolShell.jsx');
    const steps = [controlStep('Tap two rows.'), 'Compute the rate yourself.', controlStep('Press Record.')];
    const base = { task: 'Classify the table.', steps, note: 'A note.', question: { prompt: 'Is it linear?' } };
    const practice = taskCardSupport({ ...base, methodWithheld: false });
    assert.deepEqual(practice.steps, ['Tap two rows.', 'Compute the rate yourself.', 'Press Record.'], 'practice: every step, in its written order');
    assert.equal(practice.summary, 'How to do this (3 steps)');
    assert.equal(practice.showsDirections, true);
    assert.equal(practice.note, 'A note.');
    const dol = taskCardSupport({ ...base, methodWithheld: true });
    assert.deepEqual(dol.steps, ['Tap two rows.', 'Press Record.'], 'DOL: the control steps only');
    assert.equal(dol.summary, 'How to do this (2 steps)');
    assert.equal(dol.showsDirections, false, 'the tool-written directions sentence stays withheld beside a split list');
    assert.equal(dol.note, null, 'the note stays withheld');
    // A list the tool marks controls-only as a whole keeps W4-1's behaviour.
    assert.equal(taskCardSupport({ ...base, steps: ['Click the grid.'], methodWithheld: true, stepsAreControls: true }).steps.length, 1);
    // Plain strings are method: nothing is kept that is not marked.
    assert.deepEqual(taskCardSupport({ ...base, steps: ['Compute.', 'Record.'], methodWithheld: true }).steps, []);
  });
});

// Wave 7 (D9): the finishing step names the button as it reads. Where the
// press spends a try the button says "Submit — …" and the step "press
// Submit"; a secure host's own label is used as it is; elsewhere (a
// composed stage, the tools lab, the runtimes above) "Check equation".
test('W7-4: Rewrite Linear Form says the name its button shows', async () => {
  await withVite(async (load) => {
    const question = { type: 'stepAlgebra2', mode: 'rewriteLinearForm', targetForm: 'slopeIntercept', equation: '2x - 4y = 8', prompt: 'Rewrite 2x - 4y = 8.' };
    const path = '/src/tools/stepAlgebra2/RewriteLinearForm.jsx';
    for (const [runtime, name, button] of [
      [{ ...PRACTICE, submitCost: 'uses 1 of 3 tries' }, 'Submit', 'Submit — uses 1 of 3 tries'],
      [{ ...DOL, submitLabel: 'Record answer' }, 'Record answer', 'Record answer'],
      [PRACTICE, 'Check equation', 'Check equation'],
    ]) {
      const html = words(await renderTool(load, path, question, runtime));
      assert.ok(html.includes(`When the equation reads y = mx + b, press ${name}. Undo takes back the last step.`), `the step says "press ${name}"`);
      assert.ok(html.includes(`>${button}</button>`) || html.includes(button), `the button reads "${button}"`);
      if (name !== 'Check equation') assert.ok(!/press Check/.test(html), `no "press Check" beside ${button}`);
    }
  });
});

test('W7-4: the Transformations Lab names its own button in its last step', async () => {
  await withVite(async (load) => {
    const path = '/src/tools/transformations/TransformationsLab.jsx';
    const base = { type: 'transformationsLab', family: 'linear', function: { type: 'linear', a: 1, h: 2, k: -1 }, sourcePoints: [[-2, -2], [0, 0], [2, 2]], graphBounds: { xMin: -8, xMax: 8, yMin: -8, yMax: 8 } };
    for (const [mode, step, own] of [
      ['match', (name) => `When the two graphs overlap, press ${name}.`, 'Check transformation'],
      ['identify', (name) => `Enter all four, then press ${name}.`, 'Check parameters'],
      ['plotTransform', (name) => `Connect them in the same order as the source graph, then press ${name}.`, 'Check graph'],
    ]) {
      const charged = words(await renderTool(load, path, { ...base, mode }, { ...PRACTICE, submitCost: 'uses 1 of 3 tries' }));
      assert.ok(charged.includes(step('Submit')), `${mode}: "press Submit" where the press spends a try`);
      assert.ok(!/press Check|Press Check|\{action\}/.test(charged), `${mode}: never "press Check" beside Submit`);
      const free = words(await renderTool(load, path, { ...base, mode }, PRACTICE));
      assert.ok(free.includes(step(own)), `${mode}: the lab's own button name where nothing is spent`);
    }
  });
});

test('W6-4: Linear Table Workbench, Rewrite Linear Form, Linear Intercepts and the Constraint Function Builder split their lists', async () => {
  await withVite(async (load) => {
    await assertSplit(load, {
      label: 'Linear Table Workbench',
      path: '/src/tools/linearTableWorkbench/LinearTableWorkbench.jsx',
      question: { type: 'linearTableWorkbench', mode: 'deriveEquation', rows: [[1, 5], [2, 8], [3, 11], [4, 14]], requiredComparisons: 3, prompt: 'Is the rate constant?' },
      controls: ['Select two rows to form an interval (click or tap, or Tab to a row and press Enter).', 'Enter Δx, Δy and Δy/Δx for that interval in the boxes below, then record it.', 'Record 3 different intervals; the questions below the table open after that.'],
      method: ['Work out each value yourself from the two rows, then repeat with a different pair of rows.', 'If the rate is constant, determine m and b and write the equation.'],
      directions: 'Select pairs of rows, compute Δx, Δy, and the rate',
    });
    for (const [targetForm, equation, method, form] of [
      ['slopeIntercept', '2x - 4y = 8', ['Get y alone on the left with balanced operations and cancellation.', 'If a whole numerator sits over one denominator, use Split fraction, then Cancel factors in each fraction.', 'Optionally Arrange terms into mx + b.'], 'y = mx + b'],
      ['factoredLinear', 'y = 15x - 45', ['Get y alone on the left with balanced operations.', 'Use Factor: choose the terms, write them as primes, choose the factors every term shares, and pull them out.', 'Write what is left of each term inside the parentheses.'], 'y = a(x − c)'],
    ]) {
      await assertSplit(load, {
        label: `Rewrite Linear Form (${targetForm})`,
        path: '/src/tools/stepAlgebra2/RewriteLinearForm.jsx',
        question: { type: 'stepAlgebra2', mode: 'rewriteLinearForm', targetForm, equation, prompt: `Rewrite ${equation}.` },
        controls: ['+ − × ÷ do the same thing to both sides. The Rewrite menu changes the shape of a part without changing its value.', `When the equation reads ${form}, press Check equation. Undo takes back the last step.`],
        method,
      });
    }
    await assertSplit(load, {
      label: 'Linear Intercepts',
      path: '/src/tools/stepAlgebra2/LinearIntercepts.jsx',
      question: { type: 'stepAlgebra2', mode: 'linearIntercepts', standard: { A: 2, B: 3, C: 12 }, prompt: 'Find the intercepts of 2x + 3y = 12.' },
      controls: ['Place the 0 on a variable (drag it, or select the 0 and then the variable: click or tap, or Tab to each and press Enter), then press Substitute and solve.', 'Solve the one-variable equation with the operation buttons. Return to substitution starts the substitution again.', 'Write the x-intercept as an ordered pair and press Check x-intercept.'],
      method: ['Decide which coordinate is always 0 at the x-intercept.'],
      // The same sentence is this tool's Work View `task`, drawn in the header
      // of a figure with no question around it: withheld there too on a DOL
      // (TS11, taskShown). Under QuestionEngine the authored task replaces it.
      directions: 'Decide which variable becomes 0, place the 0 on that variable',
    });
    await assertSplit(load, {
      label: 'Constraint Function Builder',
      path: '/src/tools/constraintFunctionBuilder/ConstraintFunctionBuilder.jsx',
      question: { type: 'constraintFunctionBuilder', prompt: 'Build an increasing linear function.', allowedFamilies: ['linear'], constraints: [{ id: 'family', kind: 'family', value: 'linear', label: 'Linear function' }] },
      controls: ['Choose a family, then adjust the coefficients/parameters while watching the graph update.', 'Submit when every constraint is satisfied.'],
      method: ['Read the characteristics first — identify which families are even possible.', 'Use the constraint checklist as a target, not as an answer key'],
      directions: 'Choose a family and adjust its parameters until the graph satisfies every constraint.',
    });
  });
});

test('W6-4: Data Modeling\'s regression modes and association have a secure list of controls; it never names the route', async () => {
  const MODEL_ENTRY = {
    linearFit: 'Enter the slope and intercept of your model in the Slope m and Intercept b boxes.',
    quadraticFit: 'Enter a, b and c of y = ax² + bx + c in the three boxes.',
    // MathText draws ^x as a superscript, so the words are matched up to it.
    exponentialFit: 'Enter a and the base b of y = a(b)',
    linearFitPrediction: 'Enter the slope and intercept of your model in the Slope m and Intercept b boxes.',
    quadraticFitPrediction: 'Enter a, b and c of y = ax² + bx + c in the three boxes.',
    exponentialFitPrediction: 'Enter a and the base b of y = a(b)',
    squareRootFitPrediction: 'Enter a, h and k of y = a√(x-h)+k in the three boxes.',
  };
  const ROUTE = /\b(?:Run|Use)\b[^.]*\b(?:regression|fit)\b|regression technology|residual display to confirm/i;
  await withVite(async (load) => {
    for (const [mode, entry] of Object.entries(MODEL_ENTRY)) {
      const question = { type: 'dataModelingLab', mode, points: [[1, 2], [2, 3], [3, 5], [4, 5], [5, 7], [6, 8], [7, 10]], predictionX: 9, prompt: 'Model the data.' };
      const dol = words(await renderTool(load, '/src/tools/dataModeling/DataModelingLab.jsx', question, DOL));
      const expected = mode.endsWith('Prediction') ? 2 : 1;
      assert.equal(stepCount(dol), expected, `${mode}: the secure list on a test (${expected} steps)`);
      assert.ok(dol.includes(entry), `${mode}: names the boxes`);
      // Not the tune-against-the-residuals loop (review S3).
      assert.doesNotMatch(dol, /redraw|residual table/, `${mode}: no step points at the residuals`);
      if (mode.endsWith('Prediction')) assert.ok(dol.includes('Enter your predicted y in the Predicted y box, then classify the prediction.'), `${mode}: the prediction boxes`);
      assert.doesNotMatch(dol, ROUTE, `${mode}: no step and no directions sentence names how the coefficients are found`);
      const practice = words(await renderTool(load, '/src/tools/dataModeling/DataModelingLab.jsx', question, PRACTICE));
      assert.match(practice, /Run (?:a |an |the )?(?:linear |quadratic |exponential |square-root )?(?:regression|fit)/, `${mode}: practice keeps the teaching list`);
    }
    const association = { type: 'dataModelingLab', mode: 'association', points: [[1, 2], [2, 3], [3, 5], [4, 5]], prompt: 'Describe the association.' };
    const dol = words(await renderTool(load, '/src/tools/dataModeling/DataModelingLab.jsx', association, DOL));
    assert.equal(stepCount(dol), 2);
    assert.ok(dol.includes('Choose the direction and the strength of the association.'));
    assert.ok(!dol.includes('Look at whether the points rise or fall'), 'association: the teaching steps stay on practice');
    // A secure step is a control step, never a whole list `stepsAreControls`:
    // the directions sentence ("Use … regression technology") stays withheld.
    const secure = words(await renderTool(load, '/src/tools/dataModeling/DataModelingLab.jsx', { type: 'dataModelingLab', mode: 'correlation', points: [[1, 2], [2, 3], [3, 5], [4, 5]], prompt: 'Find r.' }, DOL));
    // Correlation and prediction say which box, not how the answer is found (review S3).
    assert.ok(secure.includes('Enter r, to at least the thousandths place, in the Correlation coefficient r box.'), 'correlation names the box');
    assert.doesNotMatch(secure, /Run a correlation calculation/);
    const prediction = words(await renderTool(load, '/src/tools/dataModeling/DataModelingLab.jsx', { type: 'dataModelingLab', mode: 'prediction', points: [[1, 2], [2, 3], [3, 5], [4, 5]], predictionX: 6, prompt: 'Predict.' }, DOL));
    assert.ok(prediction.includes('Enter the predicted y in the Predicted y box.'), 'prediction names the box');
    assert.ok(!prediction.includes('Use the model to compute the predicted y'), 'and not how to compute it');
    assert.ok(!secure.includes('Use statistical technology to calculate the correlation coefficient r'), 'and its directions sentence does not');
  });
});

test('W6-4 / W4-1 round 2: the Representation Bridge withholds "a is the rate", the plotting route and the highlight buttons on a DOL', async () => {
  const question = {
    type: 'representationBridge', mode: 'linear', prompt: 'Connect the representations.',
    source: { kind: 'table', rows: [{ x: 0, y: -20 }, { x: 2, y: -10 }, { x: 4, y: 0 }, { x: 6, y: 10 }] },
  };
  const LINES = ['a is the rate, c is the zero/x-intercept', 'Plot the x-intercept from your factored form, then a second point using the slope.'];
  await withVite(async (load) => {
    const { practice, dol } = await assertSplit(load, {
      label: 'Representation Bridge',
      path: '/src/tools/representationBridge/RepresentationBridge.jsx',
      question,
      controls: ['Table: select two rows to form an interval (click or tap, or Tab to a row and press Enter), enter Δx, Δy and the rate, and record it. Record more than one.', 'Then fill in each panel below in order: the equations, the graph, and what the parts mean.'],
      method: ['Work out each value yourself, then conclude whether the rate is constant and state m.', 'General form: write y = mx + b using the b you determine yourself.', 'Factored form: rewrite your equation as y = a(x − c).', 'Graph: plot the x-intercept from your factored form, then a second point using the slope.', 'Meaning: connect m, b, and c to their units, contextual meanings, and mathematical roles.'],
      directions: 'Build the same linear relationship across every representation',
    });
    for (const line of LINES) {
      assert.ok(practice.includes(line), `practice keeps: ${line}`);
      assert.ok(!dol.includes(line), `DOL withholds: ${line}`);
    }
    assert.ok(dol.includes('Rewrite your own general-form equation as y = a(x − c).'), 'the factored panel still says what to write');
    // The graph stage grades the x-intercept as an anchor (graphQuestionFor):
    // a DOL says that requirement, not how to find the points.
    assert.ok(dol.includes('This question requires the x-intercept as one of your points, and a second point on your line.'), 'the graph panel states what is graded');
    // RATE / SLOPE lights m and a together: the same rule without words.
    const practiceHtml = await renderTool(load, '/src/tools/representationBridge/RepresentationBridge.jsx', question, PRACTICE);
    const dolHtml = await renderTool(load, '/src/tools/representationBridge/RepresentationBridge.jsx', question, DOL);
    assert.match(practiceHtml, /aria-label="Highlight a connection across every panel"/);
    assert.doesNotMatch(dolHtml, /Highlight a connection across every panel|RATE \/ SLOPE|ZERO \/ X-INTERCEPT/);
    assert.ok(!dol.includes('Use the highlight buttons below'), 'the note about the buttons goes with them');
    // What a screen reader says for the b and c fields (review S1).
    assert.match(practiceHtml, /aria-label="Zero c in factored form"/);
    assert.match(practiceHtml, /aria-label="y-intercept b in general form"/);
    assert.match(dolHtml, /aria-label="c in factored form"/);
    assert.match(dolHtml, /aria-label="b in general form"/);
    assert.doesNotMatch(dolHtml, /aria-label="[^"]*(?:Zero c|y-intercept b)[^"]*"/);
  });
  // A highlight chosen before cannot be drawn on an assessment either.
  const bridge = code('src/tools/representationBridge/RepresentationBridge.jsx');
  assert.match(bridge, /const shownHighlight = methodWithheld \? null : activeHighlight;/);
  assert.equal((bridge.match(/\bactiveHighlight\b/g) || []).length, 2, 'only the state and the gate read the raw choice');
});

test('W6-4 / W4-1 round 2: Representation Match keeps how to work the grouping board and withholds the reasoning fold on a DOL', async () => {
  const linear = {
    type: 'representationMatch', mode: 'linearConnections', task: 'group', prompt: 'Sort every card.',
    cardKinds: ['context', 'slopeIntercept', 'slope', 'table'],
    sets: [
      { id: 'plan', context: 'A phone plan costs $10 a month plus $2 for each gigabyte used.', slopeIntercept: 'y = 2x + 10', slope: 2, table: [{ x: 0, y: 10 }, { x: 1, y: 12 }, { x: 2, y: 14 }] },
      { id: 'candle', context: 'A 20 cm candle burns down 3 cm every hour.', slopeIntercept: 'y = -3x + 20', slope: -3, table: [{ x: 0, y: 20 }, { x: 1, y: 17 }, { x: 2, y: 14 }] },
    ],
  };
  await withVite(async (load) => {
    const { practice, dol } = await assertSplit(load, {
      label: 'Representation Match (linearConnections)',
      path: '/src/tools/representationMatch/RepresentationMatch.jsx',
      question: linear,
      controls: ['Choose a group at the top, then select every card that belongs to it', 'Choose the next group and repeat.'],
      method: ['Compare the numbers each card gives you rather than how the card looks.'],
    });
    assert.ok(practice.includes('Representation reasoning'), 'practice keeps the fold');
    assert.ok(!dol.includes('Representation reasoning') && !dol.includes('check them against each other'), 'a DOL does not show it');
    // Every mode: the fold is the same panel.
    const complete = words(await renderTool(load, '/src/tools/representationMatch/RepresentationMatch.jsx', { type: 'representationMatch', mode: 'completeSet', targetId: 'linear', prompt: 'Pick the set.' }, DOL));
    assert.ok(!complete.includes('Representation reasoning'));
  });
});

test('W6-4: a tool\'s Work View instruction banner fails closed where the method is withheld', async () => {
  const platform = { help: { authoritative: true, withholdsMethod: true }, instruction: { text: 'Stage 2: graph your line.', authoritative: true } };
  const method = { instruction: { text: 'Choose which variable becomes zero, place the zero on that variable, solve.' } };
  const controls = { instruction: { text: 'Plot your first point: click or tap the grid.', controlsOnly: true } };
  // Under QuestionEngine's Help on a DOL: a method banner gives way to the
  // platform's own stage prompt, or to none; a controls-only one stays.
  assert.equal(mergeWorkViewCapabilities(platform, method).instruction.text, 'Stage 2: graph your line.');
  assert.equal(mergeWorkViewCapabilities({ help: platform.help }, method).instruction, undefined);
  assert.equal(mergeWorkViewCapabilities(platform, controls).instruction.text, 'Plot your first point: click or tap the grid.');
  // Practice (Help not withholding): the tool's banner, as before.
  assert.equal(mergeWorkViewCapabilities({ help: { authoritative: true, withholdsMethod: false } }, method).instruction.text, method.instruction.text);
  assert.equal(mergeWorkViewCapabilities({}, method).instruction.text, method.instruction.text);
  assert.equal(instructionShown(method.instruction, true), undefined);
  assert.equal(instructionShown({ text: 'authored', authoritative: true }, true).text, 'authored');

  // A tool shell with no question around it reads the runtime itself.
  await withVite(async (load) => {
    const { ToolRuntimeProvider } = await load('/src/tools/shared/ToolRuntimeContext.jsx');
    const Figure = (await load('/src/components/common/EnlargeableFigure.jsx')).default;
    const render = (runtime, capabilities) => renderToStaticMarkup(React.createElement(ToolRuntimeProvider, runtime,
      React.createElement(Figure, { openEnlarged: true, label: 'workspace', capabilities }, React.createElement('div', null, 'work'))));
    assert.ok(render(PRACTICE, method).includes(method.instruction.text), 'practice: the banner');
    assert.ok(!render(DOL, method).includes(method.instruction.text), 'DOL: no method banner');
    assert.ok(render(DOL, controls).includes(controls.instruction.text), 'DOL: a controls-only banner stays');
  });

  // The figure draws only what instructionShown allows.
  const figure = code('src/components/common/EnlargeableFigure.jsx');
  assert.match(figure, /const shownInstruction = instructionShown\(registeredCapabilities\.instruction, methodWithheld\);/);
  assert.match(figure, /const instruction = shownInstruction\?\.content \|\| shownInstruction\?\.text;/);
  // QuestionEngine's authored stage prompt is the platform's own.
  assert.match(code('src/QuestionEngine.jsx'), /instruction: taskContextPresentation\.currentStagePrompt \? \{ text:taskContextPresentation\.currentStagePrompt, authoritative:true \} : null,/);
});

test('TS11: a tool\'s Work View task fails closed where the method is withheld, in a shell with no question around it', async () => {
  const ROUTE = 'Find the x-intercept. Decide which variable becomes 0, place the 0 on that variable, solve, then write the intercept as an ordered pair.';
  const method = { task: { text: ROUTE } };
  assert.equal(taskShown(method.task, true), undefined);
  assert.equal(taskShown(method.task, false).text, ROUTE);
  assert.equal(taskShown({ text: 'authored', authoritative: true }, true).text, 'authored');
  assert.equal(taskShown({ text: 'Click the line.', controlsOnly: true }, true).text, 'Click the line.');
  // Under QuestionEngine the authored task replaces the tool's on every activity.
  assert.equal(mergeWorkViewCapabilities({ task: { text: 'Find the intercepts of 2x + 3y = 12.', authoritative: true } }, method).task.text, 'Find the intercepts of 2x + 3y = 12.');

  await withVite(async (load) => {
    const { ToolRuntimeProvider } = await load('/src/tools/shared/ToolRuntimeContext.jsx');
    const Figure = (await load('/src/components/common/EnlargeableFigure.jsx')).default;
    const render = (runtime, props) => words(renderToStaticMarkup(React.createElement(ToolRuntimeProvider, runtime,
      React.createElement(Figure, { openEnlarged: true, label: 'Intercept workspace', ...props }, React.createElement('div', null, 'work')))));
    // Practice: the tool's own task, from its capability or its taskText.
    assert.ok(render(PRACTICE, { capabilities: method }).includes(ROUTE), 'practice: the tool\'s task');
    assert.ok(render(PRACTICE, { taskText: ROUTE }).includes(ROUTE), 'practice: the tool\'s taskText');
    // DOL: neither, and the header names the figure instead.
    const dol = render(DOL, { capabilities: method, taskText: ROUTE });
    assert.ok(!dol.includes('Decide which variable'), 'DOL: no task that names the route');
    assert.ok(dol.includes('Intercept workspace'), 'DOL: the header names the figure');
    // A task marked authoritative is the platform's, and stays.
    assert.ok(render(DOL, { capabilities: { task: { text: 'Find the intercepts of 2x + 3y = 12.', authoritative: true } }, taskText: ROUTE }).includes('Find the intercepts of 2x + 3y = 12.'));
  });

  const figure = code('src/components/common/EnlargeableFigure.jsx');
  assert.match(figure, /const shownTask = taskShown\(registeredCapabilities\.task, methodWithheld\);/);
  assert.match(figure, /const task = shownTask\?\.content \|\| shownTask\?\.text \|\| \(methodWithheld \? '' : taskText\);/);
});

test('W6-4: the banners kept on an assessment are the ones that only say how to work the controls', () => {
  // Each read and judged: where to click and how many points (Graphing2); the
  // builder's controls and finish line; the 3D model's controls; the balance
  // controls; the graph workspace's and the inequality build's current stage.
  const kept = {
    'src/tools/graphing2/Graphing2.jsx': /instruction: \{ text: nextInstruction\(points\.length, requiredPointCount, hostSubmitLabel\), controlsOnly: true \}/,
    'src/tools/constraintFunctionBuilder/ConstraintFunctionBuilder.jsx': /instruction: \{ text: 'Adjust the family and its parameters until every constraint in the checklist is satisfied\.', controlsOnly: true \}/,
    'src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx': /instruction: \{ text: 'Rotate the model, show or hide each plane, and explore how the three planes relate\.', controlsOnly: true \}/,
    'src/tools/stepAlgebra2/StepAlgebra2.jsx': /instruction: \{ text: 'Choose an operation, apply it to both sides, and simplify until x is isolated\.', controlsOnly: true \}/,
    'src/InteractiveGraphWorkspace.jsx': /instruction: \{ text: currentInstruction, controlsOnly: true \}/,
    'src/tools/systemsWorkspace/StudentBuildInequalityMode.jsx': /instruction: \{ text: currentInstruction, controlsOnly: true \}/,
  };
  for (const [file, pattern] of Object.entries(kept)) assert.match(code(file), pattern, file);
  // Banners that name the route stay unmarked, so an assessment drops them.
  for (const [file, text] of [
    ['src/tools/stepAlgebra2/LinearIntercepts.jsx', 'Choose which variable becomes zero'],
    ['src/LinearInterceptsOrchestrator.jsx', 'Choose which variable becomes zero'],
    ['src/tools/stepAlgebra2/RewriteLinearForm.jsx', 'Apply balanced operations and structural steps'],
    ['src/tools/systemsWorkspace/AlgebraicSystemMode.jsx', 'Solve the system with substitution or elimination'],
    ['src/tools/systemsWorkspace/SystemsWorkspace.jsx', 'Test points against both inequalities'],
    ['src/tools/functionInvestigation2/FunctionInvestigation2.jsx', 'instruction: { text: (MODE_STEPS[mode]'],
  ]) {
    const source = code(file);
    const at = source.indexOf(text);
    assert.ok(at > -1, `${file} still has: ${text}`);
    const line = source.slice(source.lastIndexOf('\n', at), source.indexOf('\n', at));
    assert.doesNotMatch(line, /controlsOnly|authoritative/, `${file}: ${text} is not kept on an assessment`);
  }
  const shell = region(code('src/tools/shared/ToolShell.jsx'), 'export const taskCardSupport', 'return {', 'the support decision');
  assert.match(shell, /const shownSteps = \(showMethod \? steps : steps\.filter\(isControlStep\)\)\.map\(stepText\);/);
});

// FOUND ON THE BASE, FIXED HERE (W6-4): Data Modeling's error readouts are a
// verdict. On an exit ticket the live "Current MAE · RMSE" under the student's
// model let them tune until the numbers bottomed out, and modelCompare's
// "RMSE · MAE" beside each candidate ranked them — nearly the answer to
// "Select the best model". Each role's runtime is derived the way
// QuestionEngine derives it from the activity policy.
test('W6-4: Data Modeling shows no error readout where the activity withholds verdicts and the method', async () => {
  const { getEffectiveActivityPolicy } = await import('../../src/platform/policies/activityPolicies.js');
  const runtimeFor = (role) => {
    const policy = getEffectiveActivityPolicy(role);
    return { hintsAllowed: policy.hintsAllowed !== false, verdictsWithheld: policy.feedback !== 'immediate' };
  };
  const points = [[1, 2], [2, 3], [3, 5], [4, 5], [5, 7], [6, 8], [7, 10]];
  const questions = {
    fit: { type: 'dataModelingLab', mode: 'linearFitPrediction', points, predictionX: 9, prompt: 'Model the data.' },
    compare: { type: 'dataModelingLab', mode: 'modelCompare', points, prompt: 'Choose the best model.' },
    full: { type: 'dataModelingLab', mode: 'full', points, predictionX: 8, prompt: 'Model the data.' },
    // The Algebra I hand fit says it in words (walkthrough 2026-10-22).
    lineFit: { type: 'dataModelingLab', mode: 'lineFit', points, predictionX: 8, prompt: 'Fit a line.' },
  };
  await withVite(async (load) => {
    // Inputs a student has typed, so the live readout has numbers to show.
    for (const [name, question] of Object.entries(questions)) {
      for (const role of ['practice', 'classwork']) {
        const html = await renderTool(load, '/src/tools/dataModeling/DataModelingLab.jsx', question, runtimeFor(role));
        assert.match(html, /data-model-error-readout/, `${name} ${role}: the readouts stay`);
        assert.match(words(html), { compare: /RMSE [\d.]+ · MAE [\d.]+/, lineFit: /Average distance from your line to the points: [\d.]+/ }[name] || /Current MAE: /, `${name} ${role}`);
        if (name === 'lineFit') assert.doesNotMatch(words(html), /\bMAE\b|\bRMSE\b/, 'lineFit: no jargon');
      }
      for (const role of ['dol', 'quiz', 'test']) {
        const html = words(await renderTool(load, '/src/tools/dataModeling/DataModelingLab.jsx', question, runtimeFor(role)));
        assert.doesNotMatch(html, /\bMAE\b|\bRMSE\b|Average distance from your line/, `${name} ${role}: no error readout`);
      }
    }
    // Released (feedback shown again, hints still off) is also method-withheld.
    assert.doesNotMatch(words(await renderTool(load, '/src/tools/dataModeling/DataModelingLab.jsx', questions.compare, { hintsAllowed: false, verdictsWithheld: false })), /\bRMSE\b/);
    // The model choice itself is still offered on a test.
    assert.match(words(await renderTool(load, '/src/tools/dataModeling/DataModelingLab.jsx', questions.compare, runtimeFor('test'))), /Compare model families/);
  });
  assert.match(code('src/tools/dataModeling/DataModelingLab.jsx'), /const methodWithheld = useMethodWithheld\(\);[\s\S]*const errorReadouts = !methodWithheld;/);
});

// Review S2, answered with the grader: the inequality build's slope-intercept
// sentence ("…plot the y-intercept and use the slope to plot a second point")
// is that build method's grading requirement, not a route among others, so it
// stays on every activity (the owner rule with Graphing2's anchor note, N2).
// Two points on the right line that are not the y-intercept and a slope step
// from it build no line; the "points" method's own sentence asks only for two
// points, and that method accepts any two.
test('W6-4 review S2: the Bridge graph stage requires the x-intercept, as its DOL line says', async () => {
  const { graphQuestionFor } = await import('../../functions/shared/toolMath/representationBridge/representationBridgeMath.mjs');
  assert.equal(graphQuestionFor({}, { m: 5, b: -20, zero: 4, rows: [] }).constructionPolicy.requiredAnchor, 'xIntercept');
});

test('W6-4 review S2: the slope-intercept build sentence states what its grader requires', async () => {
  const { studentBoundaryLineFromEntry } = await import('../../functions/shared/toolMath/systemsWorkspace/inequalityBuilderAdapter.mjs');
  const { boundaryInstruction } = await withVite((load) => load('/src/tools/systemsWorkspace/InequalityBuildPanels.jsx'));
  // The boundary y = 2x + 1.
  const plotted = (x1, y1, x2, y2, extra) => ({ point1Plotted: true, point2Plotted: true, x1, y1, x2, y2, ...extra });
  const slopeIntercept = { method: 'slopeIntercept', slope: '2', intercept: '1' };
  assert.ok(studentBoundaryLineFromEntry(plotted(0, 1, 1, 3, slopeIntercept)), 'the y-intercept, then a slope step: a line');
  assert.equal(studentBoundaryLineFromEntry(plotted(1, 3, 2, 5, slopeIntercept)), null, 'two other points on the same line: no line');
  assert.ok(studentBoundaryLineFromEntry(plotted(1, 3, 2, 5, { method: 'points' })), 'the points method takes any two');
  assert.match(boundaryInstruction('slopeIntercept'), /plot the y-intercept and use the slope to plot a second point/);
  assert.equal(boundaryInstruction('points'), 'Tap the grid to plot two points on the boundary line.');
});

// Review N3: Data Modeling's teaching notes followed hints alone, so where
// verdicts are withheld with hints on, "A good residual plot should look
// randomly scattered…" still showed.
test('W6-4 review N3: Data Modeling\'s teaching notes are withheld wherever the method is', async () => {
  const question = { type: 'dataModelingLab', mode: 'full', points: [[1, 2], [2, 3], [3, 5], [4, 5], [5, 7]], predictionX: 8, prompt: 'Model the data.' };
  await withVite(async (load) => {
    const NOTE = 'A good residual plot should look randomly scattered';
    assert.ok(words(await renderTool(load, '/src/tools/dataModeling/DataModelingLab.jsx', question, PRACTICE)).includes(NOTE));
    assert.ok(!words(await renderTool(load, '/src/tools/dataModeling/DataModelingLab.jsx', question, { hintsAllowed: true, verdictsWithheld: true })).includes(NOTE), 'verdicts withheld, hints on');
    assert.ok(!words(await renderTool(load, '/src/tools/dataModeling/DataModelingLab.jsx', question, DOL)).includes(NOTE));
  });
});

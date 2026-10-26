/*
 * STUDENT PASS 3, TOOL-3 AND R-10: WHAT WORK VIEW'S HELP HOLDS, AND WHAT AN
 * ASSESSMENT WITHHOLDS.
 *
 * TOOL-3. On a phone, inside Work View, a student could not reach the tool's
 * "How to do this" or "Ask my teacher": Work View hides the TaskCard, a phone
 * hides the tool header ("About this tool"), and a registry tool's generic
 * Help sentence replaced the platform's Help. The drawer is now three parts —
 * the tool's description and steps, the platform's Help (never replaced), the
 * tool's own Help — on phones and desktops alike.
 *
 * R-10. An exit ticket showed each tool's method card: Matrix Lab's DOL 3
 * listed the rule that tells "no solution" from "infinitely many". Where the
 * activity withholds hints or verdicts the steps are left out, in the card and
 * in Work View's Help; directions that say how to work the controls stay.
 *
 * The browser half (390x844, Help pressed, practice beside DOL) is
 * tests/browser/workViewHelpReach.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const code = (path) => executableSource(read(path));

const withVite = async (run) => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    return await run((path) => server.ssrLoadModule(path));
  } finally {
    await server.close();
  }
};

// Matrix Lab's DOL 3 card, as MatrixLab.jsx writes it.
const METHOD_STEPS = [
  'A system with a coefficient row that is a multiple of another row has no inverse.',
  'If the constant follows the same multiple, the equations agree: infinitely many solutions.',
  'If the constant does not, the equations contradict each other: no solution.',
];
const QUESTION = { prompt: 'Two of the three equations of a system are given. Write a third.' };
const TASK = 'Write a third equation that gives the system the kind of solution asked for.';

const DESCRIPTION = 'Design a system: what makes it have no solution, or infinitely many?';
const NOTE = 'A value that makes the denominator zero is never part of the solution.';

// The card as a tool draws it: inside its ToolShell (which hands it the
// tool's description), under the activity's runtime.
const renderCard = async (load, { runtime = null, stepsAreControls = false, note = null } = {}) => {
  const { default: ToolShell, TaskCard } = await load('/src/tools/shared/ToolShell.jsx');
  const { ToolRuntimeProvider } = await load('/src/tools/shared/ToolRuntimeContext.jsx');
  const card = React.createElement(TaskCard, { question: QUESTION, task: TASK, steps: METHOD_STEPS, stepsAreControls, note });
  const shell = React.createElement(ToolShell, { title: 'Matrix Lab', subtitle: DESCRIPTION, badge: 'Singular systems', focusOnOpen: false }, card);
  return renderToStaticMarkup(runtime ? React.createElement(ToolRuntimeProvider, runtime, shell) : shell);
};

// What the card hands to Work View's Help: the same pure decision, drawn by
// the component the card publishes (TaskCardDirections). Rendered open, so
// every line it holds is in the markup.
const renderPublished = async (load, { methodWithheld, stepsAreControls = false, note = NOTE } = {}) => {
  const { taskCardSupport, TaskCardDirections } = await load('/src/tools/shared/ToolShell.jsx');
  const support = taskCardSupport({ task: TASK, steps: METHOD_STEPS, note, question: QUESTION, stepsAreControls, methodWithheld, description: DESCRIPTION, badge: 'Singular systems' });
  return renderToStaticMarkup(React.createElement(TaskCardDirections, { support })).replace('<details', '<details open');
};

const DOL = { hintsAllowed: false, verdictsWithheld: true };

test('R-10: practice offers the steps; a DOL, quiz or test card is the authored prompt alone', async () => {
  await withVite(async (load) => {
    // Practice (and the tools lab, with no provider): the steps, counted.
    assert.match(await renderCard(load), /How to do this \(3 steps\)/);
    assert.match(await renderCard(load, { runtime: { hintsAllowed: true } }), /How to do this \(3 steps\)/);
    const dol = await renderCard(load, { runtime: DOL });
    // The prompt stays; no steps, no "How to do this", no tool description
    // (header fold included) — tool-written text names the method too often.
    assert.match(dol, /Two of the three equations of a system are given/);
    assert.doesNotMatch(dol, /How to do this|About this tool|step/i);
    assert.ok(!dol.includes(DESCRIPTION));
    // Hints off with verdicts shown (a DOL after release) and verdicts held
    // with hints on: each withholds it.
    assert.doesNotMatch(await renderCard(load, { runtime: { hintsAllowed: false, verdictsWithheld: false } }), /How to do this/);
    assert.doesNotMatch(await renderCard(load, { runtime: { hintsAllowed: true, verdictsWithheld: true } }), /How to do this/);
  });
});

test('R-10: steps that only say how to work the controls stay on an assessment, with their directions — the description does not', async () => {
  await withVite(async (load) => {
    const dol = await renderCard(load, { runtime: DOL, stepsAreControls: true });
    assert.match(dol, /How to do this \(3 steps\)/);
    const published = await renderPublished(load, { methodWithheld: true, stepsAreControls: true });
    assert.ok(published.includes(TASK), 'the directions sentence stays beside control steps');
    assert.ok(published.includes(METHOD_STEPS[0]));
    assert.ok(!published.includes(DESCRIPTION), 'the description is withheld even beside control steps');
  });
});

test('R-10 / TOOL-3: what the card hands to Work View Help is what the card may show', async () => {
  await withVite(async (load) => {
    const practice = await renderPublished(load, { methodWithheld: false });
    for (const line of [DESCRIPTION, TASK, ...METHOD_STEPS, NOTE]) assert.ok(practice.includes(line), `practice Help carries: ${line}`);
    assert.match(practice, /How to do this \(3 steps\)/);
    // On an assessment: nothing — no steps, no note, no directions, no
    // description, so no fold either.
    assert.equal(await renderPublished(load, { methodWithheld: true }), '');
  });
  // The card draws and publishes the one decision.
  const card = region(code('src/tools/shared/ToolShell.jsx'), 'export const TaskCard', 'return (', 'the task card');
  assert.match(card, /const support = taskCardSupport\(\{[^}]*methodWithheld[^}]*\}\);/);
  assert.match(card, /const supportText = JSON\.stringify\(support\);/);
  assert.match(card, /<TaskCardDirections support=\{published\} \/>/);
});

test('R-10: the header does not offer the description on an assessment', () => {
  const shell = region(code('src/tools/shared/ToolShell.jsx'), 'export default function ToolShell', 'export const ToolGrid', 'the tool shell');
  assert.match(shell, /const methodWithheld = useMethodWithheld\(\);/);
  assert.match(shell, /\{subtitle && !methodWithheld \? \(/);
  assert.match(shell, /subtitle && !methodWithheld && taskCards === 0 \? \{\s*directions:/);
});

test('R-10: the gate is the activity\'s own hint and verdict signals', () => {
  const context = code('src/tools/shared/ToolRuntimeContext.jsx');
  const hook = region(context, 'export const useMethodWithheld', '};', 'the method gate');
  assert.match(hook, /runtime\.hintsAllowed === false \|\| runtime\.verdictsWithheld === true/);
  // Each tool whose steps are only controls says so; Matrix Lab's do not.
  for (const file of [
    'src/tools/graphing2/Graphing2.jsx',
    'src/tools/intervalNumberLine/IntervalNumberLine.jsx',
    'src/tools/relationMapping/RelationMapping.jsx',
    'src/tools/openSortBoard/OpenSortBoard.jsx',
    'src/tools/stepAlgebra2/StepAlgebra2.jsx',
    'src/tools/expressionMeaning/ExpressionMeaning.jsx',
  ]) assert.match(code(file), /<TaskCard\s(?:(?!\/>)[\s\S])*?\bstepsAreControls\b/, file);
  assert.doesNotMatch(code('src/tools/matrixLab/MatrixLab.jsx'), /stepsAreControls/);
  // Lists written to say what to do, not how (review S2): the inequality
  // build's process steps and graph mode's construct steps (find points,
  // decide, enter), Data Modeling's secure lists.
  assert.match(code('src/tools/systemsWorkspace/SystemsWorkspace.jsx'), /<TaskCard [^>]*stepsAreControls=\{taskKey === 'inequalitiesConstruct' \|\| taskKey === 'linearConstruct'\}/);
  // Data Modeling's secure lists are marked step by step since W6-4
  // (controlStep, so the directions sentence stays withheld): pinned and
  // rendered per mode in toolDirectionsSplit.test.mjs.
  assert.match(code('src/tools/dataModeling/DataModelingLab.jsx'), /const taskSteps = secureSteps \? wordedSteps\.map\(controlStep\) : wordedSteps;/);
  // A solver's Help that is the student's own work history stays on a DOL
  // (review B1: everything else a tool declares as Help is withheld there).
  for (const file of ['src/StepByStepAlgebra.jsx', 'src/MultiRelationAlgebra.jsx']) {
    assert.match(code(file), /help: \{ content: focusPanel, controlsOnly: true \}/, file);
  }
  // Graphing2's snap note is worked out from the answer line; on an
  // assessment it says only that points snap (review N2).
  // (A reference-line question, whose slope is the answer, says the same: TL20.)
  assert.match(code('src/tools/graphing2/Graphing2.jsx'), /methodWithheld(?: \|\| reference)?\s*\?\s*'Points snap to the grid as you place them\.'/);
});

test('R-10: Transformations Lab withholds its bridge and its first step where the method is withheld', () => {
  const lab = code('src/tools/transformations/TransformationsLab.jsx');
  assert.match(lab, /const methodWithheld = useMethodWithheld\(\);/);
  assert.match(lab, /instruction: methodWithheld \? null : \{ text: \(MODE_STEPS\[mode\]/);
  assert.match(lab, /help: methodWithheld \? null : \{\s*content: \(\s*<>\s*<TransformationBridge \/>/);
  assert.match(lab, /\{methodWithheld \|\| BRIDGE_IN_HELP_ONLY\.includes\(mode\) \? null : \(\s*<div className="mathmaster-work-view-secondary">\s*<Panel title="Transformation bridge"/);
});

test('Transformations Lab keeps its bridge in Help only where the mapping rule is the answer (owner decision 2026-10-22)', () => {
  // A Warm-Up point-map item showed "(x/b + h, ay + k)" open beside the
  // question. There the bridge stays in Help, after the item's hints.
  const lab = code('src/tools/transformations/TransformationsLab.jsx');
  const listed = JSON.parse(lab.match(/BRIDGE_IN_HELP_ONLY = Object\.freeze\((\[[^\]]*\])\)/)[1].replace(/'/g, '"'));
  assert.deepEqual(listed.sort(), ['plotTransform', 'pointMap']);
  // Help still carries it wherever the method may be shown.
  assert.match(lab, /help: methodWithheld \? null : \{\s*content: \(\s*<>\s*<TransformationBridge \/>/);
});

test('TOOL-3: a tool with no TaskCard still describes itself in Work View Help', () => {
  const shell = code('src/tools/shared/ToolShell.jsx');
  assert.match(region(shell, 'export const TaskCard', 'return (', 'the task card'), /usePublishWorkViewCapabilities\(`task-card-\$\{useId\(\)\}`, workViewDirections\);/);
  const toolShell = region(shell, 'export default function ToolShell', 'export const ToolGrid', 'the tool shell');
  assert.match(toolShell, /usePublishWorkViewCapabilities\(`tool-shell-about-\$\{useId\(\)\}`, aboutDirections\);/);
});

test('B2: "Hints are not part of this activity" only where hints are off; a server-graded practice tool keeps its own Help', () => {
  const engine = code('src/QuestionEngine.jsx');
  const help = region(engine, 'const workViewPlatformHelp =', '\n\n', 'the platform help');
  // The sentence sits under the `!toolHintsAllowed` branch and nowhere else.
  assert.match(help, /: !toolHintsAllowed\s*\?\s*\{ label: 'Help', text: 'Hints are not part of this activity\./);
  assert.equal((engine.match(/Hints are not part of this activity/g) || []).length, 1);
  // With hints on and nothing of its own to say (server-graded practice), the
  // platform declares no Help, so the tool's ladder is the Help.
  assert.match(help, /: methodWithheldHere \? \{ authoritative: true, withholdsMethod: true \} : null;/);
  assert.match(engine, /const methodWithheldHere = !toolHintsAllowed \|\| !showOutcomeFeedback;/);
  assert.match(engine, /help: workViewPlatformHelp,/);
});

test('TOOL-3: the Help drawer is the directions, then the platform Help, then the tool\'s', () => {
  const figure = code('src/components/common/EnlargeableFigure.jsx');
  assert.match(figure, /const directionsHelp = helpPart\(registeredCapabilities\.directions\);/);
  assert.match(figure, /const platformHelp = helpPart\(registeredCapabilities\.help\);/);
  assert.match(figure, /const toolHelp = helpPart\(registeredCapabilities\.toolHelp\);/);
  const drawer = region(figure, 'const help = directionsHelp || platformHelp || toolHelp ?', ') : null;', 'the help drawer');
  const order = ['data-work-view-directions', '{platformHelp}', 'data-work-view-tool-help'].map((needle) => drawer.indexOf(needle));
  assert.ok(order.every((at) => at > -1), `every part is drawn: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'directions, platform Help, tool Help — in that order');
  // QuestionEngine's Help is authoritative, so no tool replaces it.
  const engine = code('src/QuestionEngine.jsx');
  assert.match(engine, /\? \{ \.\.\.workspaceActions\.help, authoritative: true, withholdsMethod: methodWithheldHere \}/);
});

// Integrator round 2: withholding the method must not leave a tool that
// cannot be worked. Linear Table Workbench and the Representation Bridge's
// table stage said "tap two rows" only in withheld text, and the Regression
// Calculator had no operating text at all. Each tool rendered whole (Vite
// SSR) under a DOL's runtime and under practice's.
const renderTool = async (load, path, questionData, runtime) => {
  const { ToolRuntimeProvider } = await load('/src/tools/shared/ToolRuntimeContext.jsx');
  const Tool = (await load(path)).default;
  return renderToStaticMarkup(React.createElement(ToolRuntimeProvider, runtime, React.createElement(Tool, { questionData })));
};
const PRACTICE = { hintsAllowed: true, verdictsWithheld: false };
const TABLE = { type: 'linearTableWorkbench', mode: 'constantRate', rows: [[1, 5], [2, 8], [3, 11], [4, 14]], requiredComparisons: 3, prompt: 'Is the rate constant?' };

test('round 2: Linear Table Workbench keeps how to work the table on a DOL, not the method', async () => {
  await withVite(async (load) => {
    assert.match(await renderTool(load, '/src/tools/linearTableWorkbench/LinearTableWorkbench.jsx', TABLE, PRACTICE), /How to do this \(5 steps\)/);
    assert.match(await renderTool(load, '/src/tools/linearTableWorkbench/LinearTableWorkbench.jsx', TABLE, DOL), /How to do this \(3 steps\)/);
  });
  // Since W6-4 one list, each control step marked; which steps a DOL keeps is
  // asserted by text in toolDirectionsSplit.test.mjs.
  const source = code('src/tools/linearTableWorkbench/LinearTableWorkbench.jsx');
  // The list opens with the step that says rows are picked in pairs (how, in toolDirectionsNameKeyboardRoute.test.mjs).
  assert.match(source, /steps=\{\[\s*controlStep\('Select two rows to form an interval/);
});

test('round 2: the Representation Bridge keeps how to work its panels on a DOL', async () => {
  await withVite(async (load) => {
    const question = { type: 'representationBridge', mode: 'linear', prompt: 'Connect the representations.', source: { kind: 'table', rows: [{ x: 0, y: -20 }, { x: 2, y: -10 }, { x: 4, y: 0 }, { x: 6, y: 10 }] } };
    // Practice: the five method steps and the two control steps (W6-4).
    assert.match(await renderTool(load, '/src/tools/representationBridge/RepresentationBridge.jsx', question, PRACTICE), /How to do this \(7 steps\)/);
    assert.match(await renderTool(load, '/src/tools/representationBridge/RepresentationBridge.jsx', question, DOL), /How to do this \(2 steps\)/);
  });
  assert.match(code('src/tools/representationBridge/RepresentationBridge.jsx'), /steps=\{\[\s*controlStep\('Table: select two rows to form an interval/);
});

test('round 2: the Regression Calculator says how to work it, on every activity', async () => {
  await withVite(async (load) => {
    const question = { type: 'regressionCalculator', questionId: 'r', prompt: 'Run the regression.', sourceData: [{ x: 1, y: 2 }, { x: 2, y: 4.5 }, { x: 3, y: 5 }, { x: 4, y: 8 }] };
    for (const runtime of [PRACTICE, DOL]) {
      assert.match(await renderTool(load, '/src/tools/regressionCalculator/RegressionCalculator.jsx', question, runtime), /How to do this \(3 steps\)/);
    }
  });
  assert.match(code('src/tools/regressionCalculator/RegressionCalculator.jsx'), /stepsAreControls\s*steps=\{\[\s*'Press \+ \(Add Item\), choose table/);
});

test('round 2: Complex Plane rotation does not state the rotation rule on a DOL', async () => {
  const RULE = 'One multiplication by i is a 90° counterclockwise rotation.';
  await withVite(async (load) => {
    const question = { type: 'complexPlaneLab', mode: 'rotation', prompt: 'Multiply by i.', z: { re: 3, im: 1 }, quarterTurns: 1 };
    assert.ok((await renderTool(load, '/src/tools/complexPlane/ComplexPlaneLab.jsx', question, PRACTICE)).includes(RULE));
    assert.ok(!(await renderTool(load, '/src/tools/complexPlane/ComplexPlaneLab.jsx', question, DOL)).includes(RULE));
  });
});

// TL21 (owner decision): the free "How to do this" steps of the linear and
// matrix systems asked for the decision AND named the way to make it ("Compare
// the two slopes…", "Work out the determinant…"), the strategy rung of the
// recorded hints. They now ask only for the decision; the method stays in the
// hint ladders, where using it is recorded.
test('TL21: the linear and matrix systems steps say what to decide, not how', () => {
  const source = code('src/tools/systemsWorkspace/SystemsWorkspace.jsx');
  const steps = region(source, 'const MODE_STEPS = {', '\n};', 'MODE_STEPS');
  const list = (key) => steps.match(new RegExp(`^\\s*${key}: \\[(.*)\\],$`, 'm'))?.[1] || '';
  for (const key of ['linear', 'matrix']) {
    assert.ok(list(key), `${key}: the step list is found`);
    assert.match(list(key), /'Decide how many solutions the system has: exactly one, none, or infinitely many\.'/, `${key}: the decision is asked for`);
  }
  assert.doesNotMatch(list('linear'), /slope/i, 'linear: no step names the slopes');
  assert.doesNotMatch(list('matrix'), /determinant|a₁₁a₂₂/i, 'matrix: no step names the determinant');
  // The method is still offered, in each mode's recorded hints.
  const hintsOf = (mode, next) => region(region(source, `function ${mode}(`, `function ${next}(`, mode), '<HintPanel', 'onHintUsed', `${mode} hints`);
  assert.match(hintsOf('LinearMode', 'InequalityMode'), /'Compare the slopes\. Different slopes cross exactly once\./);
  assert.match(hintsOf('MatrixMode', 'SystemsWorkspace'), /'Compute a₁₁a₂₂ − a₁₂a₂₁\. If it is not zero there is one solution/);
});

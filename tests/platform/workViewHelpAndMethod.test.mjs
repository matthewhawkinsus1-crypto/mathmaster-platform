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

const renderCard = async (load, { runtime = null, stepsAreControls = false } = {}) => {
  const { TaskCard } = await load('/src/tools/shared/ToolShell.jsx');
  const { ToolRuntimeProvider } = await load('/src/tools/shared/ToolRuntimeContext.jsx');
  const card = React.createElement(TaskCard, { question: QUESTION, task: TASK, steps: METHOD_STEPS, stepsAreControls });
  return renderToStaticMarkup(runtime ? React.createElement(ToolRuntimeProvider, runtime, card) : card);
};

test('R-10: the method steps are offered on practice and withheld where the activity withholds hints or verdicts', async () => {
  await withVite(async (load) => {
    // Practice (and the tools lab, with no provider): the steps, counted.
    assert.match(await renderCard(load), /How to do this \(3 steps\)/);
    assert.match(await renderCard(load, { runtime: { hintsAllowed: true } }), /How to do this \(3 steps\)/);
    // A DOL, quiz or test withholds hints: no steps, and no count of steps.
    const dol = await renderCard(load, { runtime: { hintsAllowed: false, verdictsWithheld: true } });
    assert.doesNotMatch(dol, /step/i);
    // The directions sentence is not the method, so the card still offers it.
    assert.match(dol, /How to do this/);
    // Verdicts withheld alone (feedback held for release) withholds it too.
    assert.doesNotMatch(await renderCard(load, { runtime: { hintsAllowed: true, verdictsWithheld: true } }), /\(3 steps\)/);
  });
});

test('R-10: steps that only say how to work the controls stay on an assessment', async () => {
  await withVite(async (load) => {
    const dol = await renderCard(load, { runtime: { hintsAllowed: false, verdictsWithheld: true }, stepsAreControls: true });
    assert.match(dol, /How to do this \(3 steps\)/);
  });
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
});

test('R-10: Transformations Lab withholds its bridge and its first step where the method is withheld', () => {
  const lab = code('src/tools/transformations/TransformationsLab.jsx');
  assert.match(lab, /const methodWithheld = useMethodWithheld\(\);/);
  assert.match(lab, /instruction: methodWithheld \? null : \{ text: \(MODE_STEPS\[mode\]/);
  assert.match(lab, /help: methodWithheld \? null : \{\s*content: \(\s*<>\s*<TransformationBridge \/>/);
  assert.match(lab, /\{methodWithheld \? null : \(\s*<div className="mathmaster-work-view-secondary">\s*<Panel title="Transformation bridge"/);
});

test('TOOL-3: the TaskCard hands the support it shows to Work View\'s Help', () => {
  const shell = code('src/tools/shared/ToolShell.jsx');
  const card = region(shell, 'export const TaskCard', 'return (', 'the task card');
  // The same steps the card shows — never the withheld ones.
  assert.match(card, /const shownSteps = showMethod \? steps : \[\];/);
  assert.match(card, /\.\.\.shownSteps\.map\(String\)/);
  assert.match(card, /directions: \{\s*content: \(/);
  assert.match(card, /usePublishWorkViewCapabilities\(`task-card-\$\{useId\(\)\}`, workViewDirections\);/);
  // A tool with no TaskCard still describes itself there.
  const toolShell = region(shell, 'export default function ToolShell', 'export const ToolGrid', 'the tool shell');
  assert.match(toolShell, /subtitle && taskCards === 0 \? \{\s*directions:/);
  assert.match(toolShell, /usePublishWorkViewCapabilities\(`tool-shell-about-\$\{useId\(\)\}`, aboutDirections\);/);
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
  assert.match(engine, /help: \{ \.\.\.\(workspaceActions\.help \|\| \{[\s\S]{0,500}?\}\), authoritative: true \},/);
});

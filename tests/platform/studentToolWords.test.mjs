/*
 * THE WORDS A STUDENT READS ON A TOOL (student pass 3, TOOL-4 / TOOL-6;
 * findings A3-105 and VH-36).
 *
 *   A3-105  "Check" never spends a try while "Submit" always does, and the
 *           words for beginning again are one phrase
 *   VH-36   five tools named their final action "Submit …" in their own words
 *           while the other twenty say "Check …"
 *
 * Every registry tool is rendered through Vite the way its question mounts it:
 * once where a press spends no try (a composed question's stage, a closed
 * question, the tools lab) and once where it spends one of three, and the
 * words a student reads on its buttons are held to the rules. The words
 * themselves are src/platform/student/studentWords.js.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';

import { closeEngine, loadEngine } from './helpers/actionBarRender.mjs';
import { buttonsOf, render, withBrowser } from './helpers/studentToolRender.mjs';
import { executableSource } from './helpers/sourceContract.mjs';
import { START_OVER, START_QUESTION_OVER, STARTING_OVER } from '../../src/platform/student/studentWords.js';

after(closeEngine);

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/* ------------------------------------------------- TOOL-4: Check, Submit */

// Every registry tool, rendered the way its question mounts it: once where a
// press spends no try (a composed question's stage, a closed question, the
// tools lab) and once where it spends one of three.
const COST = 'uses 1 of 3 tries';
const BOARD = { questionId: 's-1', type: 'representationBridge', mode: 'linearMultipleRepresentations', activityRole: 'classwork', standard: 'A.2B', source: { kind: 'slopeIntercept', equation: 'y = 2x + 1' } };
let renderedTools = null;
const toolMarkup = async () => {
  if (renderedTools) return renderedTools;
  const { server } = await loadEngine();
  const registry = await server.ssrLoadModule('/src/tools/toolRegistry.js');
  const { ToolRuntimeProvider } = await server.ssrLoadModule('/src/tools/shared/ToolRuntimeContext.jsx');
  const lab = await server.ssrLoadModule('/src/dev/MathToolsLab.jsx');
  const renderTool = (toolId, questionData, submitCost) => withBrowser(() => render(
    React.createElement(ToolRuntimeProvider, { submitCost }, React.createElement(registry.getToolDefinition(toolId).component, { questionData, onAction() {}, attemptRecord: null })),
  ));
  const scenes = [
    ...registry.listTools().map((tool) => ({ id: tool.toolId, toolId: tool.toolId, questionData: lab.SAMPLE_SPECS[tool.toolId] || {} })),
    { id: 'multiple representations board', toolId: 'representationBridge', questionData: BOARD },
  ];
  renderedTools = [];
  for (const scene of scenes) {
    renderedTools.push({
      id: scene.id,
      free: buttonsOf(await renderTool(scene.toolId, scene.questionData, null)),
      spending: buttonsOf(await renderTool(scene.toolId, scene.questionData, COST)),
    });
  }
  return renderedTools;
};

test('TOOL-4 / VH-36: where a press spends no try every tool\'s final action says Check; where it spends one it says Submit and the cost', async () => {
  const tools = await toolMarkup();
  assert.ok(tools.length >= 26, `${tools.length} scenes rendered`);
  let finalActions = 0;
  for (const tool of tools) {
    // The read-only review has nothing to check or submit; every other tool
    // has a final action in both scenes, whatever marks its button.
    if (tool.id !== 'solutionReview2') {
      assert.ok(tool.free.some((button) => /^Check\b/.test(button.text)), `${tool.id}: a Check where nothing is spent`);
      assert.ok(tool.spending.some((button) => button.text === `Submit — ${COST}`), `${tool.id}: a Submit with its cost where a try is spent`);
    }
    for (const button of tool.free) {
      assert.doesNotMatch(button.text, /^Submit/, `${tool.id}: "${button.text}" would tell a student a free press spends a try`);
      if (button.finalAction) { finalActions += 1; assert.match(button.text, /^Check\b/, `${tool.id}: "${button.text}"`); }
    }
    for (const button of tool.spending) {
      if (button.finalAction) assert.equal(button.text, `Submit — ${COST}`, `${tool.id}: the final action says what it costs`);
    }
  }
  assert.ok(finalActions >= 20, `${finalActions} final actions read`);
  // The five that named it in their own words now read like the rest.
  const wording = new Map(tools.map((tool) => [tool.id, tool.free.filter((button) => button.finalAction || /^Check\b/.test(button.text)).map((button) => button.text)]));
  assert.ok(wording.get('regressionCalculator').includes('Check my regression'));
  assert.ok(wording.get('constraintFunctionBuilder').includes('Check this model'));
  assert.ok(wording.get('expressionMeaning').includes('Check meaning map'));
  assert.ok(wording.get('representationBridge').includes('Check the bridge'));
  assert.ok(wording.get('multiple representations board').includes('Check board'));
});

test('TOOL-4: the free checks beside the final action keep "Check" while the final action says Submit', async () => {
  const tools = await toolMarkup();
  const bridge = tools.find((tool) => tool.id === 'representationBridge');
  assert.ok(bridge.spending.some((button) => button.text === 'Check this stage'), 'a stage check is free, so it is still a Check');
  assert.ok(bridge.spending.some((button) => button.finalAction && button.text === `Submit — ${COST}`));
  const board = tools.find((tool) => tool.id === 'multiple representations board');
  assert.ok(board.spending.some((button) => button.text === 'Check'), 'the board\'s card checks are free');
  assert.ok(board.spending.some((button) => button.text === `Submit — ${COST}`));
});

/* ------------------------------------------------ TOOL-4: one reset word */

// What a reset is called when it is one: not "Reset …" (but "Reset view" moves
// the camera and never the work), not a bare or "all" Clear, not Delete All.
const NOT_THE_WORD = /^(?:↺\s*)?(?:Reset(?! view\b)\b.*|Resetting.*|Clear(?: [Aa]ll)?|Delete [Aa]ll|Restart.*)$/;

test('TOOL-4: the words for beginning again are one phrase, in every tool a student can open', async () => {
  const tools = await toolMarkup();
  const resets = new Map();
  for (const tool of tools) {
    for (const button of [...tool.free, ...tool.spending]) {
      assert.doesNotMatch(button.name, NOT_THE_WORD, `${tool.id}: "${button.name}"`);
      assert.doesNotMatch(button.text, NOT_THE_WORD, `${tool.id}: "${button.text}"`);
      if (button.name === START_OVER || button.text === START_OVER) resets.set(tool.id, true);
    }
  }
  // Not vacuous: the tools that begin again offer that phrase.
  for (const id of ['transformationsLab', 'graphing2', 'stepAlgebra2', 'intervalNumberLine', 'linearTableWorkbench', 'representationBridge', 'multiple representations board']) {
    assert.ok(resets.get(id), `${id} offers ${START_OVER}`);
  }
  // The regression calculator's is the icon beside Settings: named for a screen reader.
  assert.ok(tools.find((tool) => tool.id === 'regressionCalculator').free.some((button) => button.name === START_OVER));
});

const jsxUnder = (relative) => readdirSync(path.join(repo, relative)).flatMap((entry) => {
  const child = path.join(relative, entry);
  if (statSync(path.join(repo, child)).isDirectory()) return jsxUnder(child);
  return entry.endsWith('.jsx') ? [child] : [];
});
const renderedStrings = (source) => {
  const code = executableSource(source);
  const found = [];
  // JSX text up to a tag: it starts after a tag or after an expression (a
  // comment, once stripped, leaves `{}`). "Clear {label}" is not a label alone.
  for (const match of code.matchAll(/[>}]([^<>{}]+)(?=<)/g)) found.push(match[1].trim());
  for (const match of code.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`$]*)`/g)) found.push((match[1] ?? match[2] ?? match[3]).trim());
  return found.filter(Boolean);
};

test('TOOL-4: no student control in a tool, a solver or the work bar is labelled with another word for beginning again', () => {
  const files = [
    ...jsxUnder('src/tools'), ...jsxUnder('src/platform/workflow'),
    'src/QuestionEngine.jsx', 'src/StepByStepAlgebraCore.jsx', 'src/MultiRelationAlgebraCore.jsx', 'src/InteractiveGraphWorkspace.jsx', 'src/GraphScenarioMatch.jsx',
  ];
  assert.ok(files.length > 40, `${files.length} files`);
  const offenders = files.flatMap((file) => renderedStrings(readFileSync(path.join(repo, file), 'utf8'))
    .filter((label) => NOT_THE_WORD.test(label))
    .map((label) => `${file}: "${label}"`));
  assert.deepEqual(offenders, [], 'a control that begins again says "Start over" (studentWords.js); one that clears a single kind of mark says "Clear <what>"');
});

test('TOOL-4: the work bar restarts the question under the same phrase, and says what it restarts', () => {
  const engine = executableSource(readFileSync(path.join(repo, 'src/QuestionEngine.jsx'), 'utf8'));
  assert.equal(START_OVER, 'Start over');
  assert.equal(START_QUESTION_OVER, 'Start question over');
  assert.equal(STARTING_OVER, 'Starting over…');
  // The work bar's accessible name is the long form; a phone shows the short
  // one, "Start over", under the icon (A11Y-10); the confirmation and its
  // button use the phrase too.
  assert.match(engine, /aria-label=\{resettingQuestion \? STARTING_OVER : START_QUESTION_OVER\}/);
  assert.match(engine, /> Start<span className="mathmaster-action-label-long"> question<\/span> over<\/span>/);
  assert.match(engine, /title: 'Start this question over\?',[\s\S]*confirmLabel: START_OVER,/);
});

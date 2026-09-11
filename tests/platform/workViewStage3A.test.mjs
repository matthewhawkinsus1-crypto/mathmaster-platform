/*
 * STAGE 3A: TRANSFORMATIONS, GRAPHING2 AND THE FUNCTION INVESTIGATION FAMILY.
 *
 * Two kinds of assertion live here and they answer different questions.
 *
 * The undo-stack tests run the real module, so "press Undo three times and get
 * three edits back" is executed rather than described. That is the half that
 * has to be right before any local Undo control is allowed to be deleted.
 *
 * The rest are source contracts, because node cannot render a .jsx. They are
 * written against the CAPABILITY — that a tool registers Undo, that a plane
 * inside a wrapped split does not open a second shell — and bound to the region
 * that does the work, so a rename does not read as a removal. See
 * docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CAMERA_STATE_KEYS,
  EMPTY_MATH_UNDO_STACK,
  canUndoMath,
  mathUndoDepth,
  mathematicalSnapshot,
  recordMathUndoEntry,
  undoMathUndoEntry,
} from '../../src/platform/workView/mathUndoStack.js';
import { combinePublishedCapabilities, workViewCapabilitySummary } from '../../src/platform/workView/workViewCapabilities.js';
import { questionUndoResetKey } from '../../src/platform/workView/useMathUndoHistory.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const source = (relativePath) => readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

// Every tool this stage migrated, with the shell it registers against. The list
// is the deliverable: a tool added to it and not migrated fails immediately.
const MIGRATED = [
  { file: 'src/tools/transformations/TransformationsLab.jsx', label: 'Transformation workspace' },
  { file: 'src/tools/graphing2/Graphing2.jsx', label: 'Graphing workspace' },
  { file: 'src/tools/functionInvestigation2/FunctionInvestigation2.jsx', label: 'Function investigation workspace' },
  { file: 'src/tools/constraintFunctionBuilder/ConstraintFunctionBuilder.jsx', label: 'Function construction workspace' },
  { file: 'src/InteractiveGraphWorkspace.jsx', label: 'Coordinate plane workspace' },
];

// The tools whose mathematical Undo is now the platform's. These are the ones
// allowed to have lost a local Undo button, and the ones that must not grow one
// back.
const UNIVERSAL_UNDO_TOOLS = [
  'src/tools/transformations/TransformationsLab.jsx',
  'src/tools/graphing2/Graphing2.jsx',
  'src/tools/functionInvestigation2/FunctionInvestigation2.jsx',
  'src/tools/constraintFunctionBuilder/ConstraintFunctionBuilder.jsx',
];

test('Undo walks back through several edits, one edit per press', () => {
  // A student sets a, then h, then k. Three presses give back three values, in
  // the order they were entered. This is the behaviour the local "Undo point"
  // buttons never had — each of them took back one KIND of action only.
  const edits = [
    { a: '1', h: '0', k: '0' },
    { a: '2', h: '0', k: '0' },
    { a: '2', h: '3', k: '0' },
    { a: '2', h: '3', k: '-4' },
  ];
  let stack = EMPTY_MATH_UNDO_STACK;
  edits.forEach((next, index) => {
    if (index === 0) return;
    stack = recordMathUndoEntry(stack, edits[index - 1], next);
  });
  assert.equal(mathUndoDepth(stack), 3);

  const restored = [];
  for (let press = 0; press < 3; press += 1) {
    const step = undoMathUndoEntry(stack);
    assert.equal(step.changed, true);
    stack = step.stack;
    restored.push(step.restored);
  }
  assert.deepEqual(restored, [edits[2], edits[1], edits[0]]);
  assert.equal(canUndoMath(stack), false);

  // One more press past the bottom is a no-op, not a crash. The button is
  // disabled from `canUndo`, but a press can race a re-render.
  const past = undoMathUndoEntry(stack);
  assert.equal(past.changed, false);
  assert.equal(mathUndoDepth(past.stack), 0);
});

test('camera moves never enter mathematical Undo', () => {
  const plotted = { points: [[1, 2]], view: { xMin: -7, xMax: 7 } };
  // Fit, pan and zoom all land here: the same points, a different window.
  const zoomed = { points: [[1, 2]], view: { xMin: 0, xMax: 3 } };
  const fitted = { points: [[1, 2]], view: null };

  let stack = recordMathUndoEntry(EMPTY_MATH_UNDO_STACK, plotted, zoomed);
  assert.equal(mathUndoDepth(stack), 0, 'zooming is not an edit');
  stack = recordMathUndoEntry(stack, zoomed, fitted);
  assert.equal(mathUndoDepth(stack), 0, 'Fit View is not an edit');

  // The point that follows still is.
  stack = recordMathUndoEntry(stack, fitted, { points: [[1, 2], [4, -1]], view: null });
  assert.equal(mathUndoDepth(stack), 1);
  assert.deepEqual(undoMathUndoEntry(stack).restored.points, [[1, 2]]);
});

test('Work View presentation state is stripped before anything is compared', () => {
  // Opening Work View, rotating the phone and opening the Task drawer all
  // change what is on screen and none of them is an edit. Nested too, because a
  // tool that keeps its camera under a key of its own must be covered without
  // registering anything.
  const before = { model: { a: 2 }, graph: { view: { xMin: -8 } }, workView: 'closed', drawer: null, orientation: 'portrait' };
  const after = { model: { a: 2 }, graph: { view: { xMin: 1 } }, workView: 'open', drawer: 'task', orientation: 'landscape' };
  assert.equal(mathematicalSnapshot(before), mathematicalSnapshot(after));
  assert.equal(mathUndoDepth(recordMathUndoEntry(EMPTY_MATH_UNDO_STACK, before, after)), 0);

  // And the one real difference is still seen through all of it.
  const edited = { ...after, model: { a: 3 } };
  assert.equal(mathUndoDepth(recordMathUndoEntry(EMPTY_MATH_UNDO_STACK, after, edited)), 1);
});

test('a state object rebuilt on every render is not an edit', () => {
  // Tools build their snapshot inline, so the object identity changes on every
  // render. Key order changes with it when a branch adds a field. Neither is a
  // student decision and neither may fill the undo stack with nothing.
  const first = { h: '1', a: '2', points: [[0, 0]] };
  const sameFactsDifferentOrder = { points: [[0, 0]], a: '2', h: '1' };
  assert.notEqual(first, sameFactsDifferentOrder);
  assert.equal(mathematicalSnapshot(first), mathematicalSnapshot(sameFactsDifferentOrder));
  assert.equal(recordMathUndoEntry(EMPTY_MATH_UNDO_STACK, first, sameFactsDifferentOrder), EMPTY_MATH_UNDO_STACK);
});

test('the undo reset key is the question\u2019s identity, never its wording', () => {
  // The canonical V5 boundary synthesises a unique `questionId` for every
  // question and usually leaves question-level `id` unset, so a chain that
  // checks `id` then `prompt` falls through to the prompt on every canonical
  // item. A drill repeats one sentence over different givens: two consecutive
  // questions would then share a key, and Undo on the second would hand the
  // student work recorded for the first.
  const first = { questionId: 'q_practice_1_3', prompt: 'Graph the line through the two given points.' };
  const second = { questionId: 'q_practice_1_4', prompt: 'Graph the line through the two given points.' };
  assert.equal(questionUndoResetKey(first), 'q_practice_1_3');
  assert.notEqual(questionUndoResetKey(first), questionUndoResetKey(second));

  // An authored bank item with an `id` and no canonical identity still works,
  // and a bare question falls back to its prompt rather than to nothing.
  assert.equal(questionUndoResetKey({ id: 'authored-7', prompt: 'Same words' }), 'authored-7');
  assert.equal(questionUndoResetKey({ prompt: 'Same words' }), 'Same words');
  assert.equal(questionUndoResetKey({}), null);
  assert.equal(questionUndoResetKey(undefined), null);
});

test('the undo hook clears its history before it records a question change', async () => {
  const hook = await source('src/platform/workView/useMathUndoHistory.js');
  // Order matters: the reset has to run in the same flush as — and ahead of —
  // the recording effect, or swapping one question's answers for the next is
  // itself recorded as an edit and Undo hands back the previous question.
  const resetAt = hook.indexOf('resetKeyRef.current = resetKey;');
  const recordAt = hook.indexOf('const previous = previousRef.current;');
  assert.ok(resetAt > 0 && recordAt > 0, 'both effects are present');
  assert.ok(resetAt < recordAt, 'the reset effect is declared before the recording effect');
  const reset = region(hook, 'if (resetKeyRef.current === resetKey) return;', '}, [resetKey', 'the reset');
  assert.match(reset, /stackRef\.current = EMPTY_MATH_UNDO_STACK/);
  assert.match(reset, /previousRef\.current = state/, 're-baselines, so the swap itself is not an edit');
  assert.match(reset, /setDepth\(0\)/);
});

test('the undo history is bounded and drops the oldest entry first', () => {
  let stack = EMPTY_MATH_UNDO_STACK;
  for (let step = 0; step < 10; step += 1) {
    stack = recordMathUndoEntry(stack, { n: step }, { n: step + 1 }, { limit: 4 });
  }
  assert.equal(mathUndoDepth(stack), 4);
  // The four most recent, not the four oldest: a student's last few actions are
  // the ones they are trying to take back.
  assert.deepEqual(stack.entries, [{ n: 6 }, { n: 7 }, { n: 8 }, { n: 9 }]);
});

test('the camera key list names the things a student looks through, not decides', () => {
  ['view', 'zoom', 'pan', 'camera', 'viewport', 'drawer'].forEach((key) => {
    assert.ok(CAMERA_STATE_KEYS.includes(key), `${key} is camera or presentation state`);
  });
  // A key wrongly listed here silently drops real work out of Undo, so the
  // answer-bearing names a tool actually uses must stay out of it.
  ['points', 'placements', 'model', 'answers', 'selections', 'steps', 'plottedPoints', 'strokes'].forEach((key) => {
    assert.ok(!CAMERA_STATE_KEYS.includes(key), `${key} is student work and must reach Undo`);
  });
});

test('a plane inside a wrapped split reaches the shell around it', () => {
  // The port exists so CoordinatePlane keeps owning Fit View when it renders no
  // shell of its own. Two publishers merge without either losing its controls.
  const resetLeft = () => {};
  const resetRight = () => {};
  const merged = combinePublishedCapabilities({
    'coordinate-plane:b': { fitView: { label: 'Fit View', onAction: resetRight, cameraOnly: true } },
    'coordinate-plane:a': { pointEditing: { label: 'Plot points', studentState: true }, fitView: { label: 'Fit View', onAction: resetLeft, cameraOnly: true } },
  });
  assert.deepEqual(workViewCapabilitySummary(merged), ['fitView', 'pointEditing']);
  // Sorted by id, so the result does not depend on which effect ran first.
  assert.equal(merged.fitView.onAction, resetRight);
  assert.equal(merged.fitView.cameraOnly, true);

  // Withdrawing one publisher takes only its own controls away.
  const afterUnmount = combinePublishedCapabilities({ 'coordinate-plane:b': { fitView: { label: 'Fit View', onAction: resetRight } } });
  assert.deepEqual(workViewCapabilitySummary(afterUnmount), ['fitView']);
});

test('CoordinatePlane publishes its camera upward exactly when it draws no shell of its own', async () => {
  const plane = await source('src/tools/shared/CoordinatePlane.jsx');
  const published = region(plane, 'const publishedCapabilities', 'usePublishWorkViewCapabilities', 'the published capability set');
  // Publishing while it ALSO renders its own figure would report a Fit button on
  // an outer shell, two shells away from the graph it moves.
  assert.match(published, /enlargeable\s*\?\s*null\s*:/);
  assert.match(published, /fitView[\s\S]*onAction:\s*resetView[\s\S]*cameraOnly:\s*true/);
  assert.match(published, /pointEditing:\s*interactive\s*\?/);
  assert.match(plane, /usePublishWorkViewCapabilities\(/);
  assert.match(plane, /import\s*\{[^}]*usePublishWorkViewCapabilities[^}]*\}\s*from\s*'\.\.\/\.\.\/platform\/workView\/workViewCapabilities\.js'/);
});

test('QuestionEngine opens the Undo channel the registry tools reach it through', async () => {
  const engine = await source('src/QuestionEngine.jsx');
  // App.jsx-class failure: a call with no import passes lint, passes the build
  // and throws at runtime. Assert the import beside the call site.
  assert.match(engine, /import\s*\{\s*WorkViewUndoProvider\s*\}\s*from\s*'\.\/platform\/workView\/useMathUndoHistory\.js'/);
  const toolCall = region(engine, 'const Tool = missingToolDefinition.component', '</ToolRuntimeProvider>', 'the registry tool call site');
  assert.match(toolCall, /<Tool\b/);
  const renderedEngine = region(engine, '<WorkViewUndoProvider register={setUndoController}', '</WorkViewUndoProvider>', 'the enclosing Undo provider');
  assert.match(renderedEngine, /\{renderModule\(\)\}/, 'the provider encloses registry and legacy module rendering');
  assert.match(renderedEngine, /<ScratchpadOverlay\b/, 'the same provider encloses temporary editing surfaces');
  assert.match(engine, /onUndoStateChange:\s*registerUndo/, 'legacy modules register the persistent base owner');
  assert.match(engine, /baseController=\{baseUndoController\}/, 'temporary ownership cannot discard that base owner');
  // The same controller the platform work bar reads, so the bar and the Work
  // View rail cannot disagree about whether there is anything to undo.
  assert.match(engine, /controller=\{undoController\}/);
});

for (const { file, label } of MIGRATED) {
  test(`${file.split('/').pop()} registers Work View capabilities for its activity`, async () => {
    const text = await source(file);
    const figure = region(text, `label="${label}"`, '>', 'the Work View registration');
    assert.match(figure, /capabilities=\{workspaceCapabilities\}/);

    const registration = region(text, 'const workspaceCapabilities', 'return (', 'the capability descriptor');
    // Enlarging has to carry the activity: the task, what to do next, and a way
    // to act on it. A Work View holding only a bigger graph is the failure this
    // stage exists to end.
    assert.match(registration, /instruction:/, 'the current instruction travels with the workspace');
    assert.match(registration, /task:/, 'the original task is reachable from the enlarged view');
  });
}

for (const file of UNIVERSAL_UNDO_TOOLS) {
  test(`${file.split('/').pop()} registers its real mathematical Undo and keeps no duplicate`, async () => {
    const text = await source(file);
    assert.match(text, /import useMathUndoHistory(?:,\s*\{[^}]*\})?\s+from '[^']*useMathUndoHistory\.js'/);
    const hook = region(text, 'useMathUndoHistory({', '});', 'the undo registration');
    assert.match(hook, /state:\s*mathState/);
    assert.match(hook, /onRestore:\s*restoreMathState/);
    // A NEW QUESTION STARTS WITH AN EMPTY HISTORY. `PathSessionPlayer` renders
    // one QuestionEngine and swaps the question under it, so a registry tool is
    // not always remounted between questions — and a history that survived that
    // would answer Undo on question 4 with question 3's work.
    // Bound to the shared helper rather than to any spelling of the chain, so
    // four tools cannot drift into four different ideas of question identity.
    assert.match(hook, /resetKey:\s*questionUndoResetKey\(questionData\)/, 'the undo history is keyed to the question identity');
    assert.match(text, /import useMathUndoHistory, \{ questionUndoResetKey \} from/);

    // The snapshot has to be the answer, not a fragment of it: a restore that
    // puts back fewer fields than the snapshot recorded loses student work.
    const restore = region(text, 'const restoreMathState', 'useMathUndoHistory', 'the restore');
    const snapshotRegion = region(text, 'const mathState', 'const restoreMathState', 'the snapshot');
    // Whatever the formatting, the snapshot is the object literal handed to
    // useMemo. Read the shorthand keys out of it rather than pinning a layout.
    const literal = snapshotRegion.match(/\(\{([\s\S]*?)\}\)/);
    assert.ok(literal, 'the snapshot is an object literal of the fields it captures');
    const fields = [...new Set(
      literal[1]
        .split(/[,\n]/)
        .map((entry) => entry.trim().split(':')[0].trim())
        .filter((name) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(name)),
    )];
    assert.ok(fields.length > 0, 'the snapshot names the fields it captures');
    fields.forEach((field) => {
      assert.match(
        restore,
        new RegExp(`previous\\.${field}\\b|previous\\?\\.${field}\\b`),
        `${field} is recorded in the undo snapshot, so the restore has to put it back`,
      );
    });

    // The duplicate local control is gone. Matched against executable source so
    // the comment explaining WHY it went does not fail its own test.
    const code = executableSource(text);
    assert.doesNotMatch(
      code,
      /<button[^>]*>[^<]*Undo[^<]*<\/button>|>\s*Undo (?:point|last point)\s*</,
      'the platform supplies the one student-facing Undo; a second button here would take back a different amount of work',
    );
  });
}

test('no migrated tool opens a Work View inside a Work View', async () => {
  // A wrapped split plus an enlargeable plane is a shell inside a shell: the
  // inner backdrop covers the Check button the outer one was opened to reach.
  for (const file of ['src/tools/transformations/TransformationsLab.jsx', 'src/tools/graphing2/Graphing2.jsx', 'src/tools/functionInvestigation2/FunctionInvestigation2.jsx', 'src/tools/constraintFunctionBuilder/ConstraintFunctionBuilder.jsx', 'src/tools/dataModeling/DataModelingLab.jsx']) {
    // Comments stripped first: several of these files EXPLAIN the opt-out right
    // above it, and counting the explanation as a second opt-out would let a
    // plane that kept its shell pass.
    const code = executableSource(await source(file));
    const planes = (code.match(/<CoordinatePlane/g) || []).length;
    const optedOut = (code.match(/enlargeable=\{false\}/g) || []).length;
    assert.ok(planes > 0, `${file}: expected to find the planes this contract is about`);
    assert.equal(optedOut, planes, `${file}: every plane inside the wrapped split must decline a shell of its own (${optedOut}/${planes})`);
  }
});

test('InteractiveGraphWorkspace draws its axis from the shared scale service', async () => {
  const workspace = await source('src/InteractiveGraphWorkspace.jsx');
  assert.match(workspace, /import\s*\{\s*majorTicks\s*\}\s*from '\.\/platform\/graph\/graphScaleService\.js'/);
  assert.match(workspace, /const buildTicks = \([^)]*\) => majorTicks\(/);
  // The tool-specific loop is gone, and with it the readability ceiling of 200
  // that let a blueprint window grey out an axis with numbers.
  const code = executableSource(workspace);
  assert.doesNotMatch(code, /MAX_TICKS/, 'the local tick ceiling is the shared service’s job now');
  assert.doesNotMatch(code, /for \(let value = first;/, 'no tool-specific tick-generation loop');
});

test('the Work View shell keeps the current instruction on a phone', async () => {
  const figure = await source('src/components/common/EnlargeableFigure.jsx');
  const css = await source('src/components/common/WorkViewShell.css');
  // The instruction used to share the chip class with the capability labels, and
  // the mobile rule that drops those chips took the instruction with it.
  assert.match(figure, /className="mathmaster-work-view-instruction"/);
  const mobileChips = region(css, '[data-layout="mobile"] .mathmaster-work-view-capability', '\n', 'the mobile chip rule');
  assert.match(mobileChips, /display:\s*none/);
  assert.doesNotMatch(mobileChips, /instruction/);
});

test('mobile Work View stands the assignment chrome down and never floats controls over the graph', async () => {
  const css = await source('src/components/common/WorkViewShell.css');
  const chrome = region(css, 'html[data-work-view-open="true"] .mathmaster-section-tabs', '}', 'the chrome suppression rule');
  ['mathmaster-section-tabs', 'mathmaster-question-number-strip', 'mathmaster-question-alignment', 'mathmaster-assignment-unified-nav']
    .forEach((chromeClass) => assert.match(chrome, new RegExp(chromeClass), `${chromeClass} must not sit over the workspace on a phone`));

  // The badge row the rule targets has to carry that class, or the selector
  // matches nothing and the rule quietly does not apply.
  const badge = await source('src/components/common/StandardBadge.jsx');
  assert.match(badge, /className="mathmaster-question-alignment"/);

  // The action region is a grid ROW, so it takes height from the workspace
  // instead of floating over the graph.
  const bottomRail = region(css, '[data-open="true"][data-controls="bottom"] .mathmaster-work-view-actions {', '}', 'the bottom action row');
  assert.match(bottomRail, /flex:\s*0 0 auto/);
  assert.match(bottomRail, /max-height/);
  // Against the DECLARATIONS, not the block. The comment above this rule says
  // in so many words that sticky controls must never cover graph content, and a
  // check run over the whole block fails on the sentence explaining the rule it
  // enforces — which can only be made to pass by deleting the explanation.
  assert.doesNotMatch(executableSource(bottomRail), /position:\s*(?:absolute|fixed|sticky)/);
  const body = region(css, '[data-open="true"][data-controls="bottom"] > .mathmaster-work-view-body {', '}', 'the mobile body grid');
  assert.match(body, /grid-template-rows:\s*minmax\(0, 1fr\) auto/);
});

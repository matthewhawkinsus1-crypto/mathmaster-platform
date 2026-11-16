/*
 * A VALUE A STUDENT TYPED NEVER CRASHES THE SCREEN THAT DRAWS IT.
 *
 * Nov 16, 2026 (#553): a value typed in Step Algebra's radical check reached
 * the screen as MathLive's LaTeX ("\frac12", "\sqrt{36}") and was drawn
 * through a parser that throws on it. It threw inside render, the question
 * crashed, and because the value was in the saved draft it crashed again on
 * every reload. "Start this question fresh" sets the student's work aside,
 * and the student met the crash again when they redid the step.
 *
 * The same rule everywhere a student's typed or picked value is drawn: drawn
 * the way it always was when it can be read, shown as written when it cannot
 * (src/platform/math/typedMathLatex.js), never thrown. Two places broke it:
 *
 *   - Step Algebra's board drew the committed equation through
 *     equationToLatex / expressionToLatex. A side is the student's own typed
 *     simplification when they type one, and the check accepts a side it can
 *     read only in context: "1) + (2" is 3 inside "(1) + (2) - (3)". A host
 *     that grades no step (a composed question's balance step, the systems
 *     workspace, Rewrite Linear Form) commits it, and the board threw on it;
 *     a saved draft or record holding such a side threw on every load. Its
 *     drag preview drew the operand still being typed ("2x +") the same way,
 *     and threw as the student dragged it.
 *   - The relation workspace drew its expressions through
 *     relationExpressionToLatex. An expression the student typed (an operand,
 *     a rewrite) is read and written out again in the parser's own spelling,
 *     which can be longer than the parser reads (3,900 characters typed,
 *     7,800 written), and drawing it threw.
 *
 * The sweep draws a corpus of hostile typed values through each of them, and
 * through everything else a student types into: every registry tool with each
 * string its saved draft can hold set to the value, the ordinary response
 * modules the same way, and the primitives every drawn value passes through
 * (MathDisplay, MathText, MathInput). Rendered through Vite SSR, as a saved
 * draft comes back on a reload: the first render, the one that crashed.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { prerenderToNodeStream } from 'react-dom/static';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { equationLatexOrText, expressionLatexOrText, latexOrAsWritten, latexText, typedLatex } from '../../src/platform/math/typedMathLatex.js';
import { relationLatex, relationStateLatex, typedValueLatex } from '../../src/relationRadicalToolsModel.js';
import { equationToLatex, expressionToLatex } from '../../src/algebraAstEngine.js';
import { normalizeRelationExpressionInput, parseRelationSource, relationExpressionToLatex, relationStateToLatex } from '../../src/algebraRelationFoundation.js';
import { MAX_EXPRESSION_LENGTH } from '../../functions/shared/algebra/safeMath.mjs';
import { REGISTRY_TOOL_QUESTIONS } from './fixtures/registryToolQuestions.mjs';
import { PATH_TOOL_QUESTIONS } from './fixtures/pathToolQuestions.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

// What a student's math box and keyboard can hand a screen.
const CORPUS = Object.freeze([
  // MathLive's LaTeX
  '\\frac12', '-\\frac{1}{2}', '\\sqrt{36}', '\\sqrt[3]{x}', 'x^{2}', '\\left(', '\\pi', '\\le',
  // half typed
  '2x +', '(', '1/', '=', '1) + (2', '\\frac{', '}{', '\\',
  // unicode from a keyboard or a paste
  '√', '−', '×', 'π', '²',
  // nothing
  '', ' ', '\t\n',
  // very long: past what the parser reads
  `${'x+'.repeat(2500)}1`, '9'.repeat(400),
  // numbers mathjs reads its own way
  '1e999', '0x10', '1,000', 'NaN', 'Infinity', '1/0',
]);
// Short enough for the relation reader (3,901 characters), written out again
// longer than the parser reads (7,801). Drawn by the helpers and the relation
// workspace below; not typed into every box, because a readable expression of
// 1,300 like terms is worked out in full by a screen's checks (time, not a
// crash: mathjs simplify grows with every like term).
const LONG_SUM = `${'2x+'.repeat(1300)}1`;

// Outside the repository: lint scans the tree.
const VITE_CACHE = join(tmpdir(), 'mathmaster-vite-ssr-typed-values');

/* ------------------------------------------------- what the first render sees */

// The initial value of every field a registry tool keeps in its draft
// (usePersistentToolState), and the fallback of every draft an ordinary module
// reads (readQuestionDraft): what this sweep fills with typed values. Seen in
// the test's own server only.
const CAPTURE = Symbol.for('mathmaster.typedValueRenderSweep');
const capture = {
  name: 'typed-value-sweep-capture',
  enforce: 'pre',
  transform(code, id) {
    const file = id.split('?')[0];
    const inject = (marker, line) => {
      if (!code.includes(marker)) throw new Error(`typedValueRenderSweep: "${marker}" is not in ${file}; update the sweep's capture.`);
      return code.replace(marker, `${marker}\n${line}`);
    };
    if (file.endsWith('/src/tools/shared/usePersistentToolState.js')) {
      return inject(
        'export default function usePersistentToolState(field, initialValue, options = {}) {',
        `  globalThis[Symbol.for('mathmaster.typedValueRenderSweep')]?.field?.(field, typeof initialValue === 'function' ? initialValue() : initialValue);`,
      );
    }
    if (file.endsWith('/src/questionDraftStorage.js')) {
      return inject(
        'export const readQuestionDraft = (key, fallback = null) => {',
        `  globalThis[Symbol.for('mathmaster.typedValueRenderSweep')]?.draft?.(key, fallback);`,
      );
    }
    return null;
  },
};

let serverPromise = null;
const vite = () => {
  serverPromise ||= createServer({
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    cacheDir: VITE_CACHE,
    plugins: [capture],
  });
  return serverPromise;
};
const load = async (path) => (await vite()).ssrLoadModule(path);
after(async () => { if (serverPromise) await (await serverPromise).close(); });

const memoryStorage = (seed = {}) => {
  const values = new Map(Object.entries(seed));
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
  };
};
const envelope = (value) => JSON.stringify({ version: 2, savedAt: Date.now(), touchedAt: Date.now(), value });

// One server render with these drafts in the browser's storage. Every error
// React reports is collected; the render itself never rejects the test.
const draw = async (element, drafts = {}) => {
  const previous = globalThis.window;
  globalThis.window = {
    localStorage: memoryStorage(drafts),
    sessionStorage: memoryStorage(),
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    innerWidth: 1366,
    innerHeight: 768,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
  };
  const errors = [];
  let html = '';
  try {
    const { prelude } = await prerenderToNodeStream(element, { onError: (error) => { errors.push(error); } });
    for await (const chunk of prelude) html += chunk;
  } catch (error) {
    if (!errors.includes(error)) errors.push(error);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
  return { html, errors };
};

const where = (value) => String(JSON.stringify(value) ?? value).slice(0, 40);
const assertDrawn = (result, scene) => {
  assert.deepEqual(result.errors.map((error) => String(error?.message || error)), [], `${scene}: the render threw`);
};

// Every string in a draft's value replaced by the typed value: the shape the
// screen saved, holding what a student could have typed into it. A record's
// id, type and kind are the screen's own (a row's uuid, 'expression'), never
// typed, and keep theirs.
const STRUCTURAL = new Set(['id', 'type', 'kind']);
const typedInto = (initial, value) => {
  if (typeof initial === 'string') return value;
  if (Array.isArray(initial)) return initial.map((entry) => typedInto(entry, value));
  if (initial && typeof initial === 'object') {
    return Object.fromEntries(Object.entries(initial).map(([key, entry]) => [key, STRUCTURAL.has(key) ? entry : typedInto(entry, value)]));
  }
  return initial;
};
const stringsIn = (initial) => {
  if (typeof initial === 'string') return 1;
  if (Array.isArray(initial)) return initial.reduce((total, entry) => total + stringsIn(entry), 0);
  if (initial && typeof initial === 'object') {
    return Object.entries(initial).reduce((total, [key, entry]) => total + (STRUCTURAL.has(key) ? 0 : stringsIn(entry)), 0);
  }
  return 0;
};

/* ------------------------------------------------------------- the helpers */

test('the drawing helpers never throw, whatever was typed, and draw what they can read as before', () => {
  const unreadable = [];
  for (const value of [...CORPUS, LONG_SUM, null, undefined, 12, -0.5]) {
    for (const [name, drawn] of [
      ['expressionLatexOrText', () => expressionLatexOrText(value)],
      ['equationLatexOrText', () => equationLatexOrText({ left: value, right: value })],
      ['typedLatex', () => typedLatex(value)],
      ['latexOrAsWritten', () => latexOrAsWritten(expressionToLatex, value)],
      ['relationLatex', () => relationLatex(value)],
      ['typedValueLatex', () => typedValueLatex(value)],
    ]) {
      let latex;
      assert.doesNotThrow(() => { latex = drawn(); }, `${name}(${where(value)})`);
      assert.equal(typeof latex, 'string', `${name}(${where(value)}) is text to draw`);
    }
    try { expressionToLatex(value); } catch { unreadable.push(value); }
  }
  // Not vacuous: the parsers underneath throw on most of the corpus.
  assert.ok(unreadable.length >= 20, `${unreadable.length} corpus values the expression parser cannot read`);
  assert.throws(() => equationToLatex({ left: '1) + (2', right: 'x' }));
  assert.throws(() => expressionToLatex('2x +'));
  // Readable values are drawn exactly as the parsers draw them.
  for (const expression of ['2 x + 3', '(x + 1) / 4', '-3 * (x - 2)', '236000', 'sqrt(x + 4)']) {
    assert.equal(expressionLatexOrText(expression), expressionToLatex(expression), expression);
    assert.equal(relationLatex(expression), relationExpressionToLatex(expression), expression);
  }
  assert.equal(equationLatexOrText({ left: '2 x + 3', right: '7' }), equationToLatex({ left: '2 x + 3', right: '7' }));
  // Unreadable text is shown as written: LaTeX as the LaTeX it is, anything else as text.
  assert.equal(expressionLatexOrText('\\frac12'), '\\frac12');
  assert.equal(expressionLatexOrText('2x +'), '\\text{2x +}');
  assert.equal(equationLatexOrText({ left: '1) + (2', right: '3' }), '\\text{1) + (2} = 3');
  assert.equal(typedLatex(' \\sqrt{36} '), '\\sqrt{36}');
  assert.equal(latexText('a_{1} \\$ %'), '\\text{a1  }');
});

test('a relation the workspace writes out longer than the parser reads is still drawn', () => {
  const written = normalizeRelationExpressionInput(LONG_SUM);
  assert.ok(LONG_SUM.length < MAX_EXPRESSION_LENGTH && written.length > MAX_EXPRESSION_LENGTH, 'typed short enough to read, written too long to read again');
  assert.throws(() => relationExpressionToLatex(written), 'the parser underneath cannot draw it');
  const state = { kind: 'relation', variable: 'x', branches: [{ expressions: [written, '5'], relations: ['<'] }] };
  assert.throws(() => relationStateToLatex(state));
  assert.match(relationStateLatex(state), /^\\text\{/, 'shown as text instead');
  assert.match(relationLatex(written), /^\\text\{/);
  // A state it can draw is drawn exactly as before: the work history's classroom math.
  const readable = parseRelationSource('|2x - 3| <= 7', 'x');
  assert.equal(relationStateLatex(readable), relationStateToLatex(readable));
});

/* ------------------------------------------- what every drawn value goes through */

test('MathDisplay, MathText and MathInput draw every typed value', async () => {
  const { default: MathDisplay } = await load('/src/MathDisplay.jsx');
  const { default: MathText } = await load('/src/components/common/MathText.jsx');
  const { default: MathInput } = await load('/src/MathInput.jsx');
  for (const value of [...CORPUS, null, undefined, 12]) {
    for (const format of ['latex', 'ascii-math', 'auto']) {
      assertDrawn(await draw(React.createElement(MathDisplay, { value, format, inline: true })), `MathDisplay ${format} ${where(value)}`);
    }
    assertDrawn(await draw(React.createElement(MathText, null, value)), `MathText ${where(value)}`);
    assertDrawn(await draw(React.createElement(MathInput, { value, onChange() {}, ariaLabel: 'Answer' })), `MathInput ${where(value)}`);
  }
});

/* ---------------------------------------------------- Step Algebra's board */

const SOLVE = Object.freeze({ id: 'typed-sweep', questionId: 'typed-sweep', prompt: 'Solve for x.', equation: '2x + 3 = 7', objective: { kind: 'solve', variable: 'x' } });

test('Step Algebra draws a committed side it cannot read as the student wrote it, after a reload too', async () => {
  const { default: StepByStepAlgebra } = await load('/src/StepByStepAlgebraCore.jsx');
  const { ToolRuntimeProvider } = await load('/src/tools/shared/ToolRuntimeContext.jsx');
  const { ALGEBRA_DRAFT_VERSION } = await load('/src/algebraDraftState.js');
  let board = 0;
  const reopen = async (draft) => {
    board += 1;
    const draftKey = `typed-sweep-board-${board}`;
    return draw(React.createElement(ToolRuntimeProvider, { showImmediateFeedback: true },
      React.createElement(StepByStepAlgebra, { question: SOLVE, draftKey, onStateChange() {}, showPrompt: false })),
    { [`${draftKey}:step-algebra`]: envelope({ algebraDraftVersion: ALGEBRA_DRAFT_VERSION, ...draft }) });
  };
  for (const value of CORPUS) {
    assertDrawn(await reopen({ equation: { left: value, right: '4', variable: 'x' } }), `committed left side ${where(value)}`);
    assertDrawn(await reopen({ equation: { left: '2 x', right: value, variable: 'x' } }), `committed right side ${where(value)}`);
    // What the student was still typing when they left: the operation and its operand.
    assertDrawn(await reopen({ equation: { left: '2 x + 3', right: '7', variable: 'x' }, operand: value, armedTile: { operation: 'subtract', sourceSide: 'left' } }), `armed operand ${where(value)}`);
    assertDrawn(await reopen({ equation: { left: '2 x + 3', right: '7', variable: 'x' }, pendingMove: { operation: 'subtract', operandExpression: '3' }, simplificationAnswers: { left: value, right: value } }), `simplification answers ${where(value)}`);
  }
  // The side is on the board as written, and the solver still offers its moves.
  const shown = await reopen({ equation: { left: '1) + (2', right: 'x', variable: 'x' } });
  assertDrawn(shown, 'a committed "1) + (2"');
  assert.match(shown.html, /\\text\{1\) \+ \(2\}/);
});

test('Step Algebra draws the drag preview and the board through the never-throw forms', () => {
  // The preview is drawn only during a drag or a one-sided drop (a gesture a
  // server render cannot make), so its wiring is read here; the helpers it
  // calls are drawn with the whole corpus above.
  const core = executableSource(componentSource('src/StepByStepAlgebraCore.jsx'));
  const preview = region(core, 'const renderPlacementMathPreview = (side) =>', 'const armedOperationLabel =', 'placement preview');
  assert.match(preview, /const operandLatex = expressionLatexOrText\(parsedOperand\);/, 'the operand still being typed');
  assert.match(preview, /const sourceLatex = expressionLatexOrText\(sideExpression\(side\)\);/, 'the side it lands on');
  assert.doesNotMatch(preview, /expressionToLatex\((?:parsedOperand|operand|sideExpression)/);
  assert.match(core, /const displayedSideLatex = \(side\) => pendingMove \? pendingMove\.unsimplifiedLatex\[side\] : expressionLatexOrText\(equation\[side\]\);/);
  assert.match(core, /const equationLatex = useMemo\(\(\) => \(equation \? equationLatexOrText\(equation\) : ''\), \[equation\]\);/);
  assert.doesNotMatch(core, /\bequationToLatex\(/, 'nothing draws the committed equation through the throwing form');
});

/* --------------------------------------------------- the relation workspace */

test('the relation workspace draws an expression longer than the parser reads, and never calls the throwing forms', async () => {
  const { default: MultiRelationAlgebraCore } = await load('/src/MultiRelationAlgebraCore.jsx');
  const { ToolRuntimeProvider } = await load('/src/tools/shared/ToolRuntimeContext.jsx');
  // The question opens on the relation a typed operand or rewrite leaves: an
  // expression written out past the parser's limit.
  for (const [index, equation] of [`${LONG_SUM} < 5`, `${LONG_SUM} = 5`, `|${'x+'.repeat(1900)}1| <= 5`].entries()) {
    const question = { id: `typed-sweep-relation-${index}`, prompt: 'Solve.', equation, objective: { kind: 'solve', variable: 'x' } };
    assertDrawn(await draw(React.createElement(ToolRuntimeProvider, { showImmediateFeedback: true },
      React.createElement(MultiRelationAlgebraCore, { question, onStateChange() {}, draftKey: `typed-sweep-relation-${index}` }))), `relation ${index}`);
  }
  const core = executableSource(componentSource('src/MultiRelationAlgebraCore.jsx'));
  for (const throwing of ['relationExpressionToLatex', 'relationStateToLatex', 'expressionToLatex', 'equationToLatex']) {
    assert.doesNotMatch(core, new RegExp(`\\b${throwing}\\(`), `MultiRelationAlgebraCore draws nothing through ${throwing}`);
  }
  assert.match(core, /onRelationDisplayChange\?\.\(relationStateLatex\(relationState\)\)/, 'the work history is fed the never-throw form');
});

/* ------------------------------------------------------ every registry tool */

// Each tool's preview-bench question, the captured fixtures, and the modes
// whose boxes differ most from it.
const EXTRA_MODES = [
  { type: 'systemsWorkspace', mode: 'algebraic' },
  { type: 'systemsWorkspace', mode: 'inequalities', inequalities: [{ orientation: 'vertical', x: 1, relation: '>=' }, { orientation: 'horizontal', y: 3, relation: '<' }], studentBuild: { boundary: true, lineStyle: true, shading: true }, reasoning: { classifyRegion: true }, graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 10 } },
  { type: 'polynomialWorkshop', mode: 'longDivision', dividend: 'y^4-3y^3+2y^2-20', divisor: 'y^2+y-5' },
  { type: 'polynomialWorkshop', mode: 'syntheticDivision', dividend: '4y^3-6y^2+4y-1', divisor: '2y-1' },
  { type: 'polynomialWorkshop', mode: 'multiplyArea', leftFactor: 'x^2-3x+4', rightFactor: 'x-5' },
  { type: 'signSolutionAnalyzer', mode: 'radicalSolve', radicalEquation: { variable: 'm', index: 6, coefficient: 7, radicand: { m: 5, b: 4 }, outside: -4, rhs: { m: 0, b: 10 } } },
  { type: 'sequenceExplorer', mode: 'fullBridge', sequence: { kind: 'arithmetic', first: 3, difference: 2 }, displayCount: 5, targetN: 8 },
  { type: 'matrixLab', mode: 'operate', operation: 'subtract', left: 'A', right: 'B', matrices: { A: { rows: [[1, 2], [3, 4]] }, B: { rows: [[0, 1], [1, 0]] } } },
  { type: 'matrixLab', mode: 'completeSystem', targets: [{ id: 'none', classification: 'none' }, { id: 'many', classification: 'many' }], equations: ['5x - 3y + z = -4', 'x + 2y - 3z = 0'] },
  { type: 'transformationsLab', mode: 'identify', family: 'exponential', function: { type: 'exponential', a: 2, h: 1, k: -3, base: 2 } },
  { type: 'transformationsLab', mode: 'match', family: 'quadratic', target: { a: 2, h: -1, k: 3 }, initial: { a: 1, h: 0, k: 0 } },
  { type: 'exponentialLogBridge', mode: 'solveExponential', equation: { base: 2, m: 2, c: -1, rhs: 16 } },
  { type: 'complexPlaneLab', mode: 'operations', operation: 'add', z: { re: 3, im: 1 }, w: { re: 2, im: -1 } },
  { type: 'representationBridge', mode: 'linearMultipleRepresentations', source: { kind: 'slopeIntercept', m: -0.75, b: 2 }, feedbackTiming: 'guided' },
  { type: 'stepAlgebra2', mode: 'rewriteLinearForm', targetForm: 'factoredLinear', equation: 'y = 15x - 45' },
  { type: 'stepAlgebra2', mode: 'linearIntercepts', standard: { A: 2, B: 3, C: 12 } },
  { type: 'linearTableWorkbench', mode: 'repairValue', rows: [{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 9 }] },
  { type: 'functionOperationsLab', f: { type: 'linear', m: 2, b: 3 }, g: { type: 'linear', m: 1, b: -4 }, operations: ['sum', 'difference', 'product', 'quotient'] },
];

test('every registry tool draws every string its draft can hold set to a typed value', async (t) => {
  const registry = await load('/src/tools/toolRegistry.js');
  const { ToolRuntimeProvider } = await load('/src/tools/shared/ToolRuntimeContext.jsx');
  const { ToolDraftScopeProvider } = await load('/src/tools/shared/usePersistentToolState.js');
  const { SAMPLE_SPECS } = await load('/src/dev/MathToolsLab.jsx');
  const toolIds = registry.listTools().map((tool) => tool.toolId);
  const scenes = [
    ...toolIds.map((toolId) => ({ ...SAMPLE_SPECS[toolId], type: toolId })),
    ...Object.values(REGISTRY_TOOL_QUESTIONS),
    ...Object.values(PATH_TOOL_QUESTIONS).filter((question) => toolIds.includes(question.type)),
    ...EXTRA_MODES,
  ].map((question, index) => ({ questionId: `typed-sweep-tool-${index}`, prompt: 'Prompt.', ...question, toolId: question.type }));
  let opened = 0;
  let typedStrings = 0;
  const sweptTools = new Set();
  for (const question of scenes) {
    const Tool = registry.getToolDefinition(question.toolId).component;
    const mount = (draftKey) => React.createElement(ToolRuntimeProvider, { showImmediateFeedback: true },
      React.createElement(ToolDraftScopeProvider, { draftKey },
        React.createElement(Tool, { questionData: question, onAction() {}, draftKey })));
    opened += 1;
    const fields = {};
    globalThis[CAPTURE] = { field: (name, initial) => { if (!(name in fields)) fields[name] = initial; } };
    let first;
    try {
      first = await draw(mount(`typed-sweep-tool-${opened}`));
    } finally {
      delete globalThis[CAPTURE];
    }
    assertDrawn(first, `${question.toolId} ${question.mode || ''} opens`);
    const strings = stringsIn(fields);
    if (!strings) continue;
    typedStrings += strings;
    sweptTools.add(question.toolId);
    for (const value of CORPUS) {
      opened += 1;
      const draftKey = `typed-sweep-tool-${opened}`;
      const result = await draw(mount(draftKey), { [`${draftKey}:work:tool`]: envelope(typedInto(fields, value)) });
      assertDrawn(result, `${question.toolId} ${question.mode || ''} with ${where(value)} in every box`);
    }
  }
  // Not vacuous: the draft fields were found, in most tools.
  t.diagnostic(`${scenes.length} questions, ${sweptTools.size} tools, ${typedStrings} typed strings, ${CORPUS.length} values`);
  assert.ok(sweptTools.size >= 20, `${sweptTools.size} tools had typed boxes to fill`);
  assert.ok(typedStrings >= 200, `${typedStrings} typed strings filled per value`);
});

/* ------------------------------------------------- the ordinary modules */

const MODULES = [
  ['/src/FractionGrader.jsx', { type: 'fraction', prompt: 'Simplify 14/4.', answer: '7/2' }],
  ['/src/FractionGrader.jsx', { type: 'fraction', prompt: 'Add.', n1: 3, d1: 2, n2: 2, d2: 1 }],
  ['/src/LiteralGrader.jsx', { type: 'literal', prompt: 'Solve A = lw for w.', formula: 'A = l*w', solveFor: 'w', acceptedAnswers: ['A/l'] }],
  ['/src/OrderedPairGrader.jsx', { type: 'orderedPair', prompt: 'Where do y = x + 1 and y = 3 meet?', answer: '(2,3)' }],
  ['/src/SystemGrader.jsx', { type: 'system', prompt: 'Solve the system: y = x + 1 and y = -x + 5.', equations: ['y = x + 1', 'y = -x + 5'], solution: [2, 3] }],
  ['/src/TableGrader.jsx', { type: 'table', prompt: 'Complete the table for f(x) = 2x + 1.', table: { columns: [{ key: 'x', label: 'x' }, { key: 'y', label: 'f(x)' }], rows: [{ x: 0, y: null }, { x: 1, y: null }, { x: 2, y: null }], answers: { '0:y': 1, '1:y': 3, '2:y': 5 } } }],
  ['/src/MultiAnswerGrader.jsx', { type: 'multiAnswer', prompt: 'Find the slope and the y-intercept.', answerFields: [{ id: 'slope', label: 'Slope', answer: '3/4' }, { id: 'intercept', label: 'y-intercept', answer: '1' }, { id: 'set', label: 'Solution set', answer: '{1, 2}', inputType: 'set' }] }],
  ['/src/GraphLine.jsx', { type: 'graphing', prompt: 'Read the slope and the y-intercept.', m: 2, b: -3 }],
  ['/src/RelationshipModel.jsx', { type: 'relationshipModel', prompt: 'Identify x, y, and association.', correctIndependentId: 'x', correctDependentId: 'y' }],
  ['/src/ContextInterpretation.jsx', { type: 'contextInterpretation', prompt: 'What does the highlighted point mean?', scenario: 'A car travels at a steady speed.', target: { kind: 'arbitraryPoint', coordinates: [3, 45] }, quantities: { x: { id: 'time', name: 'Time', unit: 'hours' }, y: { id: 'distance', name: 'Distance', unit: 'kilometres' } } }],
  ['/src/GraphStory.jsx', { type: 'graphStory', prompt: 'Sketch a graph for a story.', requireSketch: true }],
];

// A draft that starts as an empty map is keyed by the question's boxes.
const boxesOf = (question) => [
  ...(Array.isArray(question.answerFields) ? question.answerFields.map((field) => field.id) : []),
  ...Object.keys(question.table?.answers || {}),
];

test('every ordinary response module draws a typed value in every box it saves', async (t) => {
  const { ToolRuntimeProvider } = await load('/src/tools/shared/ToolRuntimeContext.jsx');
  let opened = 0;
  let filled = 0;
  for (const [path, base] of MODULES) {
    const { default: Module } = await load(path);
    const question = { id: `typed-sweep-module-${opened}`, questionId: `typed-sweep-module-${opened}`, ...base };
    const mount = (draftKey) => React.createElement(ToolRuntimeProvider, { showImmediateFeedback: true },
      React.createElement(Module, { question, draftKey, onStateChange() {}, onUndoStateChange() {}, feedback: null }));
    opened += 1;
    const baseKey = `typed-sweep-module-${opened}`;
    const drafts = new Map();
    globalThis[CAPTURE] = { draft: (key, fallback) => { if (key && !drafts.has(key)) drafts.set(key, fallback); } };
    let first;
    try {
      first = await draw(mount(baseKey));
    } finally {
      delete globalThis[CAPTURE];
    }
    assertDrawn(first, `${path} opens`);
    assert.ok(drafts.size > 0, `${path}: its saved draft was found`);
    for (const value of CORPUS) {
      opened += 1;
      const draftKey = `typed-sweep-module-${opened}`;
      const seeded = Object.fromEntries([...drafts].map(([key, fallback]) => {
        const empty = fallback && typeof fallback === 'object' && !Array.isArray(fallback) && !Object.keys(fallback).length;
        const typed = fallback === '' || fallback === null ? value
          : empty ? Object.fromEntries(boxesOf(question).map((box) => [box, value]))
            : typedInto(fallback, value);
        return [key.replace(baseKey, draftKey), envelope(typed)];
      }));
      filled += 1;
      assertDrawn(await draw(mount(draftKey), seeded), `${path} with ${where(value)} in every box`);
    }
  }
  t.diagnostic(`${MODULES.length} modules, ${filled} renders`);
  assert.ok(filled >= MODULES.length * CORPUS.length);
});

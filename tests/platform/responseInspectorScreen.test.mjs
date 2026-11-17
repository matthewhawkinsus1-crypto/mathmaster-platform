/*
 * THE RESPONSE INSPECTOR'S SCREEN, RENDERED (#249, #554 item 8).
 *
 * The inspector's model is built on the server (functions/shared/
 * responseInspector.mjs); this renders what the teacher's screen draws from
 * it, through Vite SSR as the app's own modules load: the reasons under "Why
 * was this marked wrong?" from a real model, and from values a student could
 * have typed — markup, right-to-left digits, LaTeX, text far longer than a box
 * — which must be drawn as written and never throw.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { buildInspectorModel, captureAutomaticGradingEvidence } from '../../functions/shared/responseInspector.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';

// Outside the repository: lint scans the tree.
let serverPromise = null;
const vite = () => {
  serverPromise ||= createServer({
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
    logLevel: 'silent',
    cacheDir: join(tmpdir(), 'mathmaster-vite-ssr-response-inspector'),
  });
  return serverPromise;
};
const load = async (path) => (await vite()).ssrLoadModule(path);
after(async () => { if (serverPromise) await (await serverPromise).close(); });

const HOSTILE = Object.freeze([
  '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '١٢ + x', '\\frac{', '}{', '\\', '$$', '{{x}}',
  'x'.repeat(5000), '', ' ', '‮evil', 'null', '__proto__',
]);

const inspected = ({ question, values }) => {
  const response = { kind: 'fields', type: 'multiAnswer', value: '', fields: Object.entries(values).map(([id, value]) => ({ id, value })) };
  const grading = gradeServerResponse({ question, response });
  return buildInspectorModel({
    question,
    record: { status: 'expired', totalAttempts: 1, attemptCount: 1, partGrades: grading.parts },
    gradingEvidence: captureAutomaticGradingEvidence({ response, grading, question }),
  });
};

test('the reasons are drawn from the model, values as written, in the order found', async () => {
  const { default: ResponseInspectorReasons } = await load('/src/components/teacher/ResponseInspectorReasons.jsx');
  const model = inspected({
    question: { questionId: 'q', type: 'multiAnswer', prompt: 'Answer.', answerFields: [{ id: 'x', label: 'x', answer: -5 }, { id: 'e', label: 'Expression', answer: '2x+2' }] },
    values: { x: '‒5', e: '2(x+1)' },
  });
  const html = renderToStaticMarkup(React.createElement(ResponseInspectorReasons, { diagnosis: model.diagnosis }));
  const order = [...html.matchAll(/data-reason="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(order, ['parser-changed-input', 'equivalent-answer-rejected', 'multipart-partial']);
  assert.match(html, /Read differently from how it was typed/);
  assert.match(html, /<bdi data-inspector-value=""[^>]*>‒5<\/bdi>/, 'the typed dash, exactly as typed');
  assert.match(html, /Same value as the key, but not accepted/);
  assert.match(html, /To accept it, use Grant Credit for Expression under Grading Actions\./);
});

test('a diagnosis from a server that predates the reasons list is still drawn: its one explanation', async () => {
  const { default: ResponseInspectorReasons } = await load('/src/components/teacher/ResponseInspectorReasons.jsx');
  const html = renderToStaticMarkup(React.createElement(ResponseInspectorReasons, { diagnosis: { code: 'genuinely-incorrect', explanation: 'The stored submitted response does not match.' } }));
  assert.match(html, /data-reason="genuinely-incorrect"/);
  assert.match(html, /The stored submitted response does not match\./);
  assert.match(renderToStaticMarkup(React.createElement(ResponseInspectorReasons, { diagnosis: null })), /No diagnosis is available for this attempt\./);
});

test('hostile values in a reason are drawn as text and never throw', async () => {
  const { default: ResponseInspectorReasons } = await load('/src/components/teacher/ResponseInspectorReasons.jsx');
  for (const value of [...HOSTILE, null, undefined, 12, { toString: null }, ['nested']]) {
    const diagnosis = { reasons: [{ code: 'hostile', title: value, lines: [[{ text: value }, { value }], 'not a line', null, [null, 7, { value: { deep: value } }]], action: value }, null, 'text'] };
    let html = '';
    assert.doesNotThrow(() => { html = renderToStaticMarkup(React.createElement(ResponseInspectorReasons, { diagnosis })); }, JSON.stringify(value)?.slice(0, 30));
    assert.doesNotMatch(html, /<script>|<img /, 'markup a student typed is text, never markup');
  }
});

/* ==========================================================================
 * THE FIELD-BY-FIELD VIEW, RENDERED FOR EVERY KIND OF QUESTION.
 * ======================================================================== */

const { gradeToolWork } = await import('../../functions/shared/serverGrading/serverResponseGrading.mjs');
const { buildToolResponse } = await import('../../functions/shared/serverGrading/toolResponseContract.mjs');
const { PATH_TOOL_QUESTIONS } = await import('./fixtures/pathToolQuestions.mjs');
const { readFileSync } = await import('node:fs');
const CAPTURED = JSON.parse(readFileSync(new URL('./fixtures/capturedToolResponses.json', import.meta.url), 'utf8'));

const modelFor = ({ question, response, grading = gradeServerResponse({ question, response }), workspace = null }) => buildInspectorModel({
  question,
  record: { status: grading.isCorrect ? 'correct' : 'expired', totalAttempts: 1, attemptCount: 1, partGrades: grading.parts },
  workspace,
  gradingEvidence: captureAutomaticGradingEvidence({ response, grading, question }),
});
const fieldsOf = (values, type = 'multiAnswer') => ({ kind: 'fields', type, value: '', fields: Object.entries(values).map(([id, value]) => ({ id, value })) });

// A render with the browser globals the math primitives look for, as the
// typed-value sweep draws them (typedValueRenderSweep.test.mjs).
const drawn = (element) => {
  const previous = globalThis.window;
  globalThis.window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), requestAnimationFrame: () => 0, cancelAnimationFrame() {} };
  try {
    return renderToStaticMarkup(element);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
};
const outsideRaw = (html) => html.split(/<summary[^>]*>Raw stored response<\/summary>/)[0];

const STEP_QUESTION = { questionId: 'step', type: 'stepAlgebra', prompt: 'Solve for x.', equation: '2x + 3 = 7', objective: { kind: 'solve', variable: 'x' } };
const CASES = () => [
  ['multi-answer boxes and a choice', modelFor({
    question: { questionId: 'q', type: 'multiAnswer', prompt: 'p', answerFields: [{ id: 'f', label: 'Fraction', answer: '\\frac{1}{2}' }, { id: 'kind', label: 'Kind', type: 'choice', options: [{ id: 'lin', label: 'Linear' }, { id: 'exp', label: 'Exponential' }], answer: 'exp' }] },
    response: fieldsOf({ f: '\\frac{2}{4}', kind: 'lin' }),
  })],
  ['a table', modelFor({
    question: { questionId: 'q', type: 'table', prompt: 'p', table: { columns: [{ key: 'x', label: 'x' }, { key: 'y', label: 'y' }], rows: [{ x: 0, y: null }, { x: 2, y: null }], answers: { '0:y': 1, '1:y': 5 } } },
    response: fieldsOf({ '0:y': '1', '1:y': '4' }, 'table'),
  })],
  ['an ordered pair', modelFor({ question: { questionId: 'q', type: 'orderedPair', prompt: 'p', answer: '(2,3)' }, response: { kind: 'scalar', type: 'orderedPair', value: '(2, 4)', fields: [] } })],
  ['a system', modelFor({ question: { questionId: 'q', type: 'system', prompt: 'p', solution: { x: 3, y: 2 } }, response: { kind: 'scalar', type: 'system', value: '(3, 2)', fields: [] } })],
  ['a literal', modelFor({ question: { questionId: 'q', type: 'literal', prompt: 'p', solveFor: 'y', acceptedAnswers: ['5'] }, response: { kind: 'scalar', type: 'literal', value: '5.0', fields: [] } })],
  ['a graph', (() => { const graded = gradeToolWork({ toolId: 'graphing2', question: PATH_TOOL_QUESTIONS.graphing2, work: CAPTURED.graphing2.rawWork }); return modelFor({ question: PATH_TOOL_QUESTIONS.graphing2, response: graded.toolResponse, grading: graded }); })()],
  ['an inequality construction', (() => { const question = PATH_TOOL_QUESTIONS.systemsWorkspaceInequalityConstruct; const graded = gradeToolWork({ toolId: 'systemsWorkspace', question, work: CAPTURED.systemsWorkspaceInequalityConstruct.rawWork }); return modelFor({ question, response: graded.toolResponse, grading: graded }); })()],
  ['a number line', (() => { const question = PATH_TOOL_QUESTIONS.intervalNumberLine; const graded = gradeToolWork({ toolId: 'intervalNumberLine', question, work: CAPTURED.intervalNumberLine.rawWork }); return modelFor({ question, response: graded.toolResponse, grading: graded }); })()],
  ['Step Algebra with its steps', modelFor({
    question: STEP_QUESTION,
    response: buildToolResponse({ question: STEP_QUESTION, toolId: 'stepAlgebra', work: { equation: { left: 'x', right: '2' }, promptAnswers: [] } }),
    workspace: { available: true, relationToSubmission: 'older', entries: [{ key: 'k', scope: 'step-algebra', value: { workSteps: [{ description: 'Subtract 3 from both sides', before: { left: '2 x + 3', right: '7' }, after: { left: '2 x', right: '4' } }] } }] },
  })],
];

test('every kind of question is drawn field by field, as a headed table and facts, never as its raw JSON', async () => {
  const { default: ResponseInspectorFieldView } = await load('/src/components/teacher/ResponseInspectorFieldView.jsx');
  for (const [name, model] of CASES()) {
    const html = drawn(React.createElement(ResponseInspectorFieldView, { model }));
    const shown = outsideRaw(html);
    assert.match(shown, /<div role="region" aria-label="Field comparison" tabindex="0"/, `${name}: the table scrolls in its own named region`);
    assert.match(shown, /<caption style="[^"]*position:absolute[^"]*">Each part: what was saved, what was graded, how the grader read it, the expected answer and the result\.<\/caption>/, `${name}: the table is named for a screen reader`);
    // Part, what was graded and the result always; saved, read and expected when any row has one.
    const optional = ['saved', 'read', 'expected'].filter((column) => model.view.rows.some((entry) => entry[column])).length;
    assert.equal((shown.match(/<th scope="col"/g) || []).length, 3 + optional, `${name}: a column header for each column shown`);
    assert.equal((shown.match(/<th scope="row"/g) || []).length, model.view.rows.length, `${name}: each row headed by its part`);
    assert.equal((shown.match(/<td /g) || []).length, model.view.rows.length * (2 + optional), `${name}: every row has a cell under each column`);
    assert.match(shown, /Keystrokes are not recorded\. The submitted response is the closest record of what the student typed\./, name);
    const rawJson = model.states.submitted?.value;
    if (typeof rawJson === 'string' && rawJson.startsWith('{')) assert.ok(!shown.includes(rawJson.replaceAll('"', '&quot;')), `${name}: the raw work is only behind its details control`);
  }
});

test('a value written in LaTeX is drawn as mathematics too; a typed value keeps its exact characters', async () => {
  const { default: ResponseInspectorFieldView } = await load('/src/components/teacher/ResponseInspectorFieldView.jsx');
  const [[, model]] = CASES();
  const html = drawn(React.createElement(ResponseInspectorFieldView, { model }));
  assert.match(html, /<bdi data-inspector-value=""[^>]*>\\frac\{2\}\{4\}<\/bdi><span[^>]*data-inspector-drawn=""/, 'as written, then drawn');
  assert.match(html, /Linear/, 'a choice by its option\'s text');
  const percent = drawn(React.createElement(ResponseInspectorFieldView, { model: { ...model, view: { ...model.view, rows: [{ id: 'p', label: 'Percentage', submitted: { text: '49%' } }] } } }));
  assert.match(percent, />49%<\/bdi>/);
  assert.doesNotMatch(percent, /data-inspector-drawn/, 'plain text is not redrawn (the math drawing would write 49% as a fraction)');
});

test('the steps the student took are an ordered list, each step\'s equations as written', async () => {
  const { default: ResponseInspectorFieldView } = await load('/src/components/teacher/ResponseInspectorFieldView.jsx');
  const model = CASES().find(([name]) => name.startsWith('Step Algebra'))[1];
  const html = drawn(React.createElement(ResponseInspectorFieldView, { model }));
  assert.match(html, /<h4 id="inspector-work-steps"[^>]*>Steps the student took<\/h4>/);
  assert.match(html, /From the saved workspace, saved before the submission\./);
  assert.match(html, /<ol[^>]*><li[^>]*><span[^>]*>Subtract 3 from both sides<\/span>/);
  assert.match(html, />2 x \+ 3 = 7<\/bdi>/);
  assert.match(html, /<h4 id="inspector-work-final"[^>]*>Where the work ended<\/h4>/);
});

test('a stored Graphing line reads as the readout writes it in the graded column', async () => {
  const { default: ResponseInspectorFieldView } = await load('/src/components/teacher/ResponseInspectorFieldView.jsx');
  const model = { question: { type: 'graphing2' }, view: { kind: 'tool', snapshotLabel: 'Recorded grader response (legacy)', rows: [{ id: 'line', label: 'Line', submitted: { text: 'y = 1x + 0' } }], facts: [], final: [], steps: [] } };
  const html = drawn(React.createElement(ResponseInspectorFieldView, { model }));
  assert.match(html, />y = x<\/bdi>/);
  assert.doesNotMatch(html, /1x \+ 0/);
});

test('a model from a server that predates the view is still drawn field by field', async () => {
  const { default: ResponseInspectorFieldView, viewFromOlderModel } = await load('/src/components/teacher/ResponseInspectorFieldView.jsx');
  const older = {
    question: { type: 'multiAnswer' },
    automaticResult: { parts: [{ id: 'r2', label: 'r²', isCorrect: false }] },
    states: { submitted: { kind: 'fields', fields: [{ id: 'r2', value: '0.5' }] }, workspace: { available: false }, gradingTrace: { fields: [{ id: 'r2', normalizedAvailable: true, normalized: { kind: 'number', student: 0.5 }, expected: [0.49] }] } },
    expectedAvailable: true,
  };
  assert.equal(viewFromOlderModel(older).rows[0].submitted.text, '0.5');
  const html = drawn(React.createElement(ResponseInspectorFieldView, { model: older }));
  assert.match(html, /<th scope="row"[^>]*>r²<\/th>/);
  assert.match(html, />0\.5<\/bdi>/);
});

test('hostile values in the view are drawn as text and never throw', async () => {
  const { default: ResponseInspectorFieldView } = await load('/src/components/teacher/ResponseInspectorFieldView.jsx');
  for (const value of [...HOSTILE, null, undefined, 12, { toString: null }, ['nested']]) {
    const view = {
      kind: value, snapshotLabel: value, savedTiming: value, stepsTiming: value, unreadable: value,
      rows: [{ id: value, label: value, saved: { text: value }, submitted: { text: value, option: value }, read: { text: value, note: value }, expected: { unavailable: true, text: value }, result: { status: value, label: value, credit: value } }, null, value],
      facts: [{ label: value, value }, null], final: [{ label: value, value }], steps: [{ description: value, before: value, after: value }, null], savedFacts: [{ label: value, value }],
    };
    let html = '';
    assert.doesNotThrow(() => { html = drawn(React.createElement(ResponseInspectorFieldView, { model: { question: { type: value }, view, states: { submitted: value } } })); }, JSON.stringify(value)?.slice(0, 30));
    assert.doesNotMatch(html, /<script>|<img /);
    assert.doesNotThrow(() => drawn(React.createElement(ResponseInspectorFieldView, { model: value })));
  }
});

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

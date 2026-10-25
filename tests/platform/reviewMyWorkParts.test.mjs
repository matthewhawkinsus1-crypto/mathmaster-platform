// REVIEW MY WORK SAYS WHICH PART WAS RIGHT.
//
// FB21 (audit A3-93). A multi-part question showed the whole-row chip ("Partly
// correct · 50%") and the student's answers, and the student had to work out
// which of the answers earned the credit. The server already holds the grader's
// mark on each part (record.partGrades); functions/lib/reviewMyWork.js now
// sends the part's id, label and verdict on the row (`parts`, tested in
// reviewMyWorkServer.test.mjs), reviewMyWorkModel.js puts each verdict beside
// the field it names (reviewMyWorkModel.test.mjs), and this file renders the
// screen's "Your answer" box to pin what the student reads: the mark in
// words, beside its own part, and nothing where the server sent no marks.

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PART_VERDICT, buildReviewMyWorkModel, formatSubmittedAnswer, withPartVerdicts } from '../../src/platform/student/reviewMyWorkModel.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const server = require('../../functions/lib/reviewMyWork.js');

let vite = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

const QUESTION = {
  type: 'multiAnswer',
  prompt: 'Give the slope, the y-intercept, the form and the rate of change.',
  answerFields: [
    { id: 'slope', label: 'Slope' },
    { id: 'intercept', label: 'y-intercept' },
    { id: 'form', label: 'Form' },
    { id: 'rate', label: 'Rate of change' },
  ],
};
const RESPONSE = {
  kind: 'fields',
  type: 'multiAnswer',
  value: '',
  fields: [
    { id: 'slope', value: '2', isComplete: true },
    { id: 'intercept', value: '5', isComplete: true },
    { id: 'form', value: '', isComplete: false },
    { id: 'rate', value: '2', isComplete: true },
  ],
};
// What the server sends for it (functions/lib/reviewMyWork.js partVerdicts).
const PARTS = [
  { id: 'slope', label: 'Slope', verdict: 'correct' },
  { id: 'intercept', label: 'y-intercept', verdict: 'incorrect' },
  { id: 'form', label: 'Form', verdict: 'notAnswered' },
  { id: 'rate', label: 'Rate of change', verdict: 'partial' },
];

const render = async (answer) => {
  const { YourAnswer } = await vite.ssrLoadModule('/src/components/student/ReviewMyWork.jsx');
  return renderToStaticMarkup(React.createElement(YourAnswer, { answer }));
};

// One entry per listed part: its id, and the marker drawn inside that part's own row.
const partRows = (html) => [...html.matchAll(/<li [^>]*data-part-row="([^"]*)"[^>]*>(.*?)<\/li>/gs)].map(([, id, inner]) => {
  const marker = inner.match(/<span data-part-verdict="([^"]*)"[^>]*><span aria-hidden="true">([^<]*)<\/span>([^<]*)<\/span>/s);
  return { id, verdict: marker?.[1] ?? null, symbol: marker?.[2] ?? null, words: marker?.[3] ?? null, inner };
});

test('the server\'s four marks are the screen\'s four, spelled the same', () => {
  assert.deepEqual(server.PART_VERDICT, { CORRECT: 'correct', PARTIAL: 'partial', INCORRECT: 'incorrect', NOT_ANSWERED: 'notAnswered' });
  assert.deepEqual({ ...PART_VERDICT }, { ...server.PART_VERDICT });
});

test('each part of a multi-part answer shows its own mark, in words', async () => {
  const html = await render(withPartVerdicts(formatSubmittedAnswer(RESPONSE, QUESTION), PARTS));
  const rows = partRows(html);
  assert.deepEqual(rows.map((row) => [row.id, row.verdict, row.words]), [
    ['slope', 'correct', 'Correct'],
    ['intercept', 'incorrect', 'Not correct'],
    ['form', 'notAnswered', 'Not answered'],
    ['rate', 'partial', 'Partly correct'],
  ]);
  // Beside the part it names: the label and the student's own answer are in that row.
  assert.match(rows[1].inner, /y-intercept:<\/strong>[^]*5[^]*Not correct/);
  assert.match(rows[2].inner, /Form:<\/strong>[^]*No answer recorded[^]*Not answered/);
  // A symbol is a second cue and is hidden from a screen reader; the words are what is read.
  assert.deepEqual(rows.map((row) => row.symbol), ['✓ ', '✗ ', '– ', '~ ']);
  assert.equal(new Set(rows.map((row) => row.symbol)).size, 4, 'four marks, four different symbols: not colour alone');
  rows.forEach((row) => assert.ok(row.words.trim().length > 0, `${row.id}: the mark has words`));
});

test('a server that sends no marks shows the answers exactly as before', async () => {
  for (const parts of [undefined, [], [{ id: 'slope', verdict: 'unheard-of' }]]) {
    // eslint-disable-next-line no-await-in-loop
    const html = await render(withPartVerdicts(formatSubmittedAnswer(RESPONSE, QUESTION), parts));
    const rows = partRows(html);
    assert.deepEqual(rows.map((row) => row.id), ['slope', 'intercept', 'form', 'rate'], 'every part is still listed');
    assert.ok(rows.every((row) => row.verdict === null), `parts: ${JSON.stringify(parts)}`);
    assert.doesNotMatch(html, /data-part-verdict/);
    // Each row is its label and the student's own words and nothing else: not even an empty chip.
    assert.deepEqual(rows.map((row) => row.inner.replace(/<[^>]*>/g, '')), ['Slope: 2', 'y-intercept: 5', 'Form: No answer recorded', 'Rate of change: 2']);
    rows.forEach((row) => assert.equal((row.inner.match(/<span/g) || []).length, 1, `${row.id}: only the answer's own span`));
  }
});

test('a one-answer question shows no part marks, even if marks arrive', async () => {
  const single = withPartVerdicts(formatSubmittedAnswer({ kind: 'value', type: 'literal', value: '6', fields: [] }), PARTS);
  const html = await render(single);
  assert.doesNotMatch(html, /data-part-/);
  assert.match(html, />6</);
  assert.doesNotMatch(await render(withPartVerdicts(formatSubmittedAnswer(null), PARTS)), /data-part-/);
});

test('the marks reach the screen through the model, from the row the server sent', async () => {
  const assignment = { id: 'a', sections: [{ id: 's', role: 'classwork', title: 'Classwork', questions: [QUESTION] }] };
  const row = (extra) => ({
    index: 0, questionId: 'q', sectionTitle: 'Classwork', sectionRole: 'classwork', prompt: QUESTION.prompt, deliveredQuestion: null,
    solutionSource: 'assignment', submittedResponse: RESPONSE, outcome: 'partial', credit: 50, teacherChanged: false, teacherReason: null, ...extra,
  });
  const withMarks = buildReviewMyWorkModel({ result: { questions: [row({ parts: PARTS })] }, assignment });
  assert.deepEqual(partRows(await render(withMarks.items[0].answer)).map((part) => part.verdict), ['correct', 'incorrect', 'notAnswered', 'partial']);
  const without = buildReviewMyWorkModel({ result: { questions: [row({})] }, assignment });
  assert.deepEqual(partRows(await render(without.items[0].answer)).map((part) => part.verdict), [null, null, null, null]);
  // The screen draws the model's answer; it does not read the marks itself.
  const screen = executableSource(readFileSync(new URL('../../src/components/student/ReviewMyWork.jsx', import.meta.url), 'utf8'));
  assert.match(screen, /<YourAnswer answer=\{item\.answer\} \/>/);
  assert.doesNotMatch(region(screen, 'function ReviewQuestion', '\n}\n'), /\.parts\b/);
});

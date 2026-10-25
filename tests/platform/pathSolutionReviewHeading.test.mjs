/*
 * A PATH SOLUTION REVIEW'S HEADING SITS BELOW THE SECTION THAT HOLDS IT (MP14).
 *
 * On a question's own screen the review is a section of the page (an h2).
 * Inside the session recap it is part of one missed question, under the
 * recap's "Review what you missed" h2, so it is an h3: a screen reader's
 * heading list must not show each question's review as a sibling of the recap.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let vite;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

const REVIEW = { headline: 'Undo the multiplication by dividing both sides by 2.', answerSummary: 'x = 2' };
// The headings in document order, as a screen reader lists them.
const headings = (html) => [...html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g)].map((match) => `h${match[1]} ${match[2].replace(/<[^>]+>/g, '').trim()}`);

test('the review is an h2 unless the caller names a level from 2 to 6', async () => {
  const { PathSolutionReview } = await vite.ssrLoadModule('/src/components/student/PathSolutionReview.jsx');
  const render = (props) => headings(renderToStaticMarkup(React.createElement(PathSolutionReview, { review: REVIEW, ...props })));
  assert.deepEqual(render({}), ['h2 How this one works']);
  assert.deepEqual(render({ wasCorrect: true, headingLevel: 3 }), ['h3 Why that works']);
  assert.deepEqual(render({ headingLevel: 6 }), ['h6 How this one works']);
  for (const headingLevel of [1, 7, 2.5, '3', null]) assert.deepEqual(render({ headingLevel }), ['h2 How this one works'], String(headingLevel));
});

test("in the session recap each missed question's review is an h3 under the recap's h2", async () => {
  const Recap = (await vite.ssrLoadModule('/src/components/student/MyMathPathSessionRecap.jsx')).default;
  const item = (n) => ({
    questionInstanceId: `q-${n}`,
    questionNumber: n,
    outcome: 'missed',
    question: { prompt: `Solve ${n}x = ${2 * n}.` },
    response: { entries: [{ label: 'x', value: '3' }] },
    solutionReview: REVIEW,
  });
  const html = renderToStaticMarkup(React.createElement(Recap, { recap: { status: 'ready', data: { items: [item(1), item(2)] } } }));
  assert.deepEqual(headings(html), ['h2 Review what you missed', 'h3 How this one works', 'h3 How this one works']);
});

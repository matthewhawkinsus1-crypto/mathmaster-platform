// TC06 (D9): in Test Cycle Corrections every press of an item's button spends
// one of its tries, so it says Submit and what it costs, the way every other
// graded press does (submitCost.js). It said "Check my answer" / "Check my
// answer again", the word that never costs a try.

import test from 'node:test';
import assert from 'node:assert/strict';

const QUESTION = Object.freeze({
  questionInstanceId: 'qi-1',
  prompt: 'Solve $2x + 3 = 11$.',
  responseFields: [{ id: 'x', label: 'x', inputProfile: 'number' }],
});

test('a Corrections item says Submit and what it costs, never "Check my answer"', async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { default: RichQuestionRuntime } = await server.ssrLoadModule('/src/components/question/RichQuestionRuntime.jsx');
    const { default: React } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const button = (props) => {
      const html = renderToStaticMarkup(React.createElement(RichQuestionRuntime, { question: QUESTION, mode: 'corrections', onSubmit: () => {}, ...props }));
      return html.match(/<button type="submit"[^>]*>([^<]*)<\/button>/)?.[1] ?? null;
    };
    assert.equal(button({ attempt: { used: 0, allowed: 3 } }), 'Submit — uses 1 of 3 tries');
    assert.equal(button({ attempt: { used: 1, allowed: 3 }, feedback: { isCorrect: false } }), 'Submit — uses 1 of 2 tries left');
    assert.equal(button({ attempt: { used: 2, allowed: 3 }, feedback: { isCorrect: false } }), 'Submit — last try');
    assert.equal(button({ attempt: { used: 0, allowed: 3 }, busy: true }), 'Submitting…');
    // A host that gives no try count still never says the free word.
    assert.equal(button({}), 'Submit');
    // A secure Test keeps its host's words.
    assert.match(button({ mode: 'secureTest' }) || '', /^(Answer to continue|Record answer & continue)$/);
  } finally {
    await server.close();
  }
});

// A TEST'S RELEASED WORKED SOLUTION, RENDERED (student pass 3, H-6 and H-14).
//
// SecureExamReview and RichQuestionRuntime used PathSolutionReview, which had
// no Read aloud or Translate and a fixed <h2> under the results page's <h3>.
// Both now use SolutionReviewPanel — the one worked-solution panel — given
// ONLY the review the server released. These render it the way the results
// page does and check what a student gets: the released lines and nothing
// built from elsewhere, a heading under "Question N", and the two actions
// only for a student whose plan grants them on a test.

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { secureAccessEntitlement } from '../../src/platform/assessment/secureItemAccess.js';
import { workedSolutionSupports } from '../../src/platform/supports/workedSolutionSupports.js';

let vite = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

const RELEASED = {
  headline: 'Distribute, then collect like terms.',
  reasoning: ['Multiply 3 by EVERY term: $3x + 6$.', 'Subtract 6 from both sides.'],
  commonError: 'Multiplying only the first term.',
  connection: null,
  answerSummary: null,
};

const renderResult = async (props) => {
  const SolutionReviewPanel = (await vite.ssrLoadModule('/src/SolutionReviewPanel.jsx')).default;
  return renderToStaticMarkup(React.createElement(SolutionReviewPanel, {
    question: { solutionReview: RELEASED }, wasCorrect: false, headingLevel: 4, showIntro: false, ...props,
  }));
};

test('the results page\'s panel: an h4 under "Question N", the released lines, no classroom intro', async () => {
  const html = await renderResult({});
  assert.match(html, /<h4[^>]*>Worked solution<\/h4>/);
  assert.doesNotMatch(html, /<h[1-3][\s>]/, 'no heading above the card\'s own h3');
  assert.match(html, /Distribute, then collect like terms\./);
  assert.match(html, /Multiply 3 by EVERY term/);
  assert.match(html, /Watch out: /);
  assert.doesNotMatch(html, /This question is closed|Compare each step/, 'the page already said whether it was right');
  // Only what was released: no family steps, no legacy review, no tool review.
  assert.match(html, /data-review-source="authored"/);
  assert.doesNotMatch(html, /data-review-source="tool"|data-part-review/);
});

test('Read aloud and Translate only for a student whose plan grants them on a test', async () => {
  const granted = workedSolutionSupports(secureAccessEntitlement({ accommodations: ['text-to-speech'], translationLanguage: 'es' }), { speechReady: true });
  assert.deepEqual(granted, { readAloud: { language: 'en' }, translation: { language: 'es' } });
  const withSupports = await renderResult(granted);
  assert.match(withSupports, /aria-label="Read the worked solution aloud"/);

  const none = workedSolutionSupports(secureAccessEntitlement(null), { speechReady: true });
  assert.deepEqual(none, { readAloud: null, translation: null });
  assert.doesNotMatch(await renderResult(none), /Read the worked solution aloud|Translate/);

  // A plan that limits Read aloud to practice gives none on a test's results.
  const practiceOnly = {
    supportPlan: { windows: [{ effectiveStart: '2026-01-01', status: 'active', revision: 1, translationLanguage: null, accommodations: [{ id: 'text-to-speech', appliesTo: ['practice'] }] }] },
  };
  assert.equal(workedSolutionSupports(secureAccessEntitlement(practiceOnly), { speechReady: true }).readAloud, null);
  // A language without Translate is no translation (H-6 review S4). On the
  // results page secureAccessEntitlement already drops the language; in
  // Corrections the entitlement can carry one, so the check is this helper's.
  assert.equal(workedSolutionSupports({ tools: ['read-aloud'], language: 'es' }, { speechReady: true }).translation, null);
  assert.deepEqual(workedSolutionSupports({ tools: ['translate'], language: 'es' }, { speechReady: true }).translation, { language: 'es' });
  assert.equal(workedSolutionSupports({ tools: ['translate'], language: '' }, { speechReady: true }).translation, null, 'Translate with no language');
  // Entitled, but this browser cannot speak: no dead button.
  assert.equal(workedSolutionSupports(secureAccessEntitlement({ accommodations: ['text-to-speech'] }), { speechReady: false }).readAloud, null);
});

test('a figure\'s title sits at the level it is given: h4 on a Test result, h2 on the Path', async () => {
  const PathQuestionStimulus = (await vite.ssrLoadModule('/src/components/student/PathQuestionStimulus.jsx')).default;
  const stimulus = { kind: 'table', title: 'Hours and scores', table: { headers: ['x', 'y'], rows: [['1', '8'], ['2', '13']] } };
  assert.match(renderToStaticMarkup(React.createElement(PathQuestionStimulus, { stimulus, headingLevel: 4 })), /<h4[^>]*>.*Hours and scores/);
  assert.match(renderToStaticMarkup(React.createElement(PathQuestionStimulus, { stimulus })), /<h2[^>]*>.*Hours and scores/, 'the Path keeps its h2');
});

test('the runtime shows a worked solution only where the mode allows one, and only once it is released (H-6 review S4)', async () => {
  const { componentSource, executableSource, region } = await import('./helpers/sourceContract.mjs');
  const runtime = componentSource('src/components/question/RichQuestionRuntime.jsx');
  const support = region(runtime, 'const InstructionalSupport = (', '\n};\n', 'InstructionalSupport');
  // Nothing without feedback, and the panel only under the mode's capability
  // AND a review the server sent back.
  assert.match(support, /\n\s*if \(!feedback\) return null;/);
  assert.match(support, /\{caps\.workedSolution && feedback\.solutionReview && \(\s*<SolutionReviewPanel/);
  assert.equal((executableSource(support).match(/<SolutionReviewPanel/g) || []).length, 1);
  assert.equal((executableSource(runtime).match(/<SolutionReviewPanel/g) || []).length, 1, 'no other way in');
  // A secure mode's capability is off: the policy itself says so.
  const { resolveQuestionRuntimePolicy } = await import('../../src/platform/assessment/questionRuntimePolicy.js');
  for (const mode of ['secureTest', 'secureRetest']) assert.equal(resolveQuestionRuntimePolicy(mode).capabilities.workedSolution, false, mode);
  assert.equal(resolveQuestionRuntimePolicy('corrections').capabilities.workedSolution, true);
});

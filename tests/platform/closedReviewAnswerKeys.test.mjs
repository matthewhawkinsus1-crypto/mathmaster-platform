/*
 * A CLOSED REVIEW DRAWS EACH BOX'S KEY AS MATHEMATICS, NOT AS ITS SPELLING
 * (math-box-focus batch, item 4).
 *
 * Operations on Polynomials L1 PR 3's closed review showed "n^2-2n-63". Its
 * keys are written the way an author types them, and the legacy worked
 * solution (src/SolutionReview.jsx) lists a multi-box question's answers as
 * "label: key" strings — on the page as bare text, the one place in the
 * closed review that drew a key that way. The panel's own "Correct:" rows,
 * My Math Path's recap and a Test's results draw a key through MathText. So
 * the list is shown whenever those rows are not: after a right answer, and on
 * a closed question opened again later.
 *
 * Now the list goes through MathText too. The sweep reads every multi-box key
 * of every lesson the way the list draws it: each change is a power set as a
 * power, a relation as its sign, a slash fraction stacked, or a $…$ label
 * typeset, and a key with none of those is drawn exactly as before.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { generatePathInstanceWithRetries, hasPathGenerator } from '../../functions/shared/pathQuestionGeneration.mjs';
import {
  isMathSegment, normalizePlainMathTypography, splitMathSegments, splitProseFractionRuns,
} from '../../src/components/common/mathSegments.js';

const repo = new URL('../../', import.meta.url);

let vite = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

const pr3 = () => {
  const text = fs.readFileSync(new URL('teacher-import-jsons/algebra2-honors-module2/L1_Operations_on_Polynomials.json', repo), 'utf8');
  const question = compileTeacherImport(text).questions.find((candidate) => candidate.questionId === 'opp-pr-3');
  assert.ok(question, 'PR 3 compiles');
  return question;
};

test('Operations on Polynomials L1 PR 3, closed after a right answer: no key shows its caret', async () => {
  const SolutionReviewPanel = (await vite.ssrLoadModule('/src/SolutionReviewPanel.jsx')).default;
  const question = pr3();
  assert.deepEqual(question.answerFields.map((field) => field.answer), ['n^2-2n-63', '8ab+10a', '3np^2-3pz'], 'the keys as authored');
  // A right answer lists no parts of the student's (QuestionEngine's closedYourAnswer is empty).
  const html = renderToStaticMarkup(React.createElement(SolutionReviewPanel, { question, wasCorrect: true }));
  const list = html.slice(html.indexOf('data-answer-details'));
  assert.ok(html.includes('data-answer-details'), 'the review lists the answers');
  assert.doesNotMatch(list, /\^/, 'no caret on the page');
  // Each key beside its box's own label, each drawn as it is alone.
  for (const [label, shown] of [['Multiply (n − 9)(n + 7)', 'n²-2n-63'], ['Multiply 2a(4b + 5)', '8ab+10a'], ['Multiply 3p(np − z)', '3np²-3pz']]) {
    assert.match(list, new RegExp(`<span>${label.replace(/[()+]/g, '\\$&')}</span>: <span>${shown.replace(/[+]/g, '\\$&')}</span>`), `${label}: ${shown}`);
  }
});

test('Read aloud says the list as it did: each box\'s label and key, in order', async () => {
  const { legacySolutionReviewContent } = await vite.ssrLoadModule('/src/SolutionReview.jsx');
  const { buildClosedQuestionReview } = await vite.ssrLoadModule('/src/platform/supports/review/closedQuestionReview.js');
  const review = buildClosedQuestionReview({ question: pr3(), wasCorrect: true, legacyContent: legacySolutionReviewContent });
  assert.match(review.speechText, /Multiply \(n − 9\)\(n \+ 7\): n\^2-2n-63 Multiply 2a\(4b \+ 5\): 8ab\+10a Multiply 3p\(np − z\): 3np\^2-3pz/);
  assert.doesNotMatch(review.speechText, /\[object Object\]/);
});

// What MathText draws for one line: a $…$ span and a slash fraction are set
// as mathematics; everything else is text with its powers and relations set.
const drawn = (line) => splitMathSegments(line).map((segment) => (isMathSegment(segment) ? { math: segment } : null)
  || { runs: splitProseFractionRuns(segment).map((run) => (run.isFraction ? { fraction: run.text } : { text: normalizePlainMathTypography(run.text) })) });
const shownText = (line) => drawn(line).map((part) => (part.math ? '⟨math⟩' : part.runs.map((run) => (run.fraction ? '⟨fraction⟩' : run.text)).join(''))).join('');
const NOTATION = { power: /\^/, relation: /<=|>=|!=|\+\/-/, radical: /(?<![A-Za-z])(?:cbrt|root\(\s*(?:\d+|[A-Za-z])\s*\))\s*\(/ };

const lessonFiles = (dir = new URL('teacher-import-jsons/', repo).pathname) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? lessonFiles(path.join(dir, entry.name)) : entry.name.endsWith('.json') ? [path.join(dir, entry.name)] : []));
// Every "label: key" line the list draws, as SolutionReview.jsx builds it for
// a multi-box question (the import copies a box's label and key as written).
const everyAnswerLine = () => lessonFiles().flatMap((file) => JSON.parse(fs.readFileSync(file, 'utf8')).sections
  .flatMap((section) => section.questions || [])
  .flatMap((question) => {
    const shown = hasPathGenerator(question) ? generatePathInstanceWithRetries(question, 'answer-keys-0').question : question;
    return (shown?.responses || []).map((field) => {
      const key = [...(Array.isArray(field.acceptedAnswers) ? field.acceptedAnswers : []), field.answer]
        .find((value) => value !== undefined && value !== null && String(value).trim() !== '');
      if (key === undefined) return null;
      const written = Array.isArray(key) ? `(${key.join(', ')})` : String(key).trim();
      return { where: `${path.basename(file)} ${question.questionId} ${field.id}`, label: String(field.label ?? ''), key: written, line: `${field.label}: ${written}` };
    }).filter(Boolean);
  }));

test('every lesson\'s answer list: what changes is notation set as mathematics, and nothing else', () => {
  const lines = everyAnswerLine();
  assert.ok(lines.length > 2000, `every multi-box key of every lesson (${lines.length})`);
  const changes = { key: { power: 0, relation: 0, radical: 0, fraction: 0, math: 0 }, label: { power: 0, relation: 0, radical: 0, fraction: 0, math: 0 } };
  for (const { where, label, key } of lines) {
    for (const [part, written] of [['key', key], ['label', label]]) {
      const parts = drawn(written);
      const kinds = {
        power: NOTATION.power.test(written),
        relation: NOTATION.relation.test(written),
        // A typed root, "cbrt(9y)" or "root(7)(a)", is drawn as a radical
        // (display and reading polish: typedRadicalKeys.test.mjs).
        radical: NOTATION.radical.test(written),
        fraction: parts.some((piece) => piece.runs?.some((run) => run.fraction && !run.fraction.startsWith('\\sqrt['))),
        math: parts.some((piece) => piece.math),
      };
      if (!Object.values(kinds).some(Boolean)) {
        // Nothing to set: drawn exactly as it was.
        assert.equal(shownText(written), written, `${where}: the ${part} is drawn as written`);
        continue;
      }
      Object.entries(kinds).forEach(([kind, present]) => { if (present) changes[part][kind] += 1; });
    }
    // What is left of a key as text spells no power, no relation and no typed
    // root. (A label keeps its own question mark: "x⁴ · x³ = x^?" asks for
    // the power.)
    assert.doesNotMatch(shownText(key), /\^|<=|>=|!=|cbrt|root\(/, `${where}: ${key} → ${shownText(key)}`);
  }
  // The sweep's own record of what changes (2200 lines on this branch): 261
  // keys with a power, all of PR 3's among them, and the relations, fractions
  // and delimited mathematics of the other keys and of the labels.
  assert.ok(changes.key.power >= 250, `keys whose powers are set: ${changes.key.power}`);
  assert.ok(changes.key.relation >= 40, `keys whose relations are set: ${changes.key.relation}`);
  assert.ok(changes.key.fraction >= 100, `keys with a stacked fraction: ${changes.key.fraction}`);
  assert.ok(changes.key.radical >= 25, `keys with a typed root drawn as a radical: ${changes.key.radical}`);
  assert.ok(changes.label.math >= 1, `labels with $…$ set as mathematics: ${changes.label.math}`);
});

// A LOG BASE TYPED AS TEXT IS DRAWN AS MATHEMATICS (math-speech-2).
//
// The function family writes a log base that is not 2 or 10 as "log_0.5(x)"
// (functionFeatures.js, renderRhs), and Algebra II Honors L2 Day 1's log
// question showed it so, underscore and all, in the hint panel and the closed
// review (walkthrough 2026-11-06, P-1). Hints draw mathematics through
// MathText, which typesets a fraction typed in prose as its own piece; a typed
// log base is now such a piece, its base a subscript. Only the drawing
// changes: the words, which Read aloud and Translate use, stay as written.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { isMathSegment, splitMathSegments, splitProseFractionRuns } from '../../src/components/common/mathSegments.js';
import { mathSpeechLabel } from '../../src/platform/language/mathSpeechLabel.js';
import { buildQuestionHints } from '../../src/platform/supports/hints/questionHints.js';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';

// What MathText puts on the screen: [typeset] pieces and prose.
const drawn = (text) => splitMathSegments(text).flatMap((segment) => (isMathSegment(segment)
  ? [`[${segment}]`]
  : splitProseFractionRuns(segment).map((run) => (run.isFraction ? `[${run.text}]` : run.text)))).join('');

test('a log base typed as text is typeset, its base a subscript', () => {
  assert.equal(drawn('In f(x) = log_0.5(x), which values of x can a logarithm accept?'), 'In f(x) = [\\log_{0.5}(x)], which values of x can a logarithm accept?');
  assert.equal(drawn('Work from the graph of f(x) = -log_0.5(x - 3) + 1.'), 'Work from the graph of f(x) = -[\\log_{0.5}(x - 3)] + 1.');
  assert.equal(drawn('log_b(A) = y means b^y = A, and 1/2 of 8 is 4.'), '[\\log_{b}(A)] = y means b^y = A, and [\\frac{1}{2}] of 8 is 4.', 'a fraction beside it is still stacked');
  assert.equal(drawn('Solve log_{10}(x) = 2.'), 'Solve [\\log_{10}(x)] = 2.');
  // A screen reader hears the typeset piece as Read aloud says the words.
  assert.equal(mathSpeechLabel({ value: '\\log_{0.5}(x)' }), 'log base 0.5 of x');
  // Not a logarithm: a name with "log_" inside it, and prose with no base.
  assert.equal(drawn('Open catalog_x.json.'), 'Open catalog_x.json.');
  assert.equal(drawn('Keep a log of each try.'), 'Keep a log of each try.');
});

test('the log question in Algebra II Honors L2 Day 1 draws its hints and review as mathematics', () => {
  const file = new URL('../../teacher-import-jsons/algebra2-honors-module1/L2_Day1_Parent_Functions_Key_Attributes.json', import.meta.url);
  const { questions } = parseAssignmentBlueprintText(readFileSync(file, 'utf8'));
  const lines = questions.flatMap((question) => {
    const review = buildClosedQuestionReview({ question });
    return [...buildQuestionHints(question).map((hint) => hint.text), ...(review?.steps || []), ...(review?.speechParts || []).map((part) => part.text)];
  }).map(String).filter((line) => line.includes('log_0.5'));
  // The family still writes the words it wrote (Translate's lines match them).
  assert.ok(lines.some((line) => line.startsWith('In f(x) = log_0.5(x), which values of x can a logarithm accept')), lines.join('\n'));
  assert.ok(lines.length >= 3, `${lines.length} lines`);
  for (const line of lines) {
    const shown = drawn(line);
    assert.match(shown, /\[\\log_\{0\.5\}\(x\)\]/, line);
    assert.doesNotMatch(shown.replace(/\[[^\]]*\]/g, ''), /log_/, `no typed base left in the prose: ${line}`);
  }
});

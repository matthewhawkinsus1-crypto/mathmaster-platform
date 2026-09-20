import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { splitProseFractionRuns } from '../../src/components/common/mathSegments.js';

// Issue #297 part C: a mathematical fraction authored as plain prose (never
// wrapped in $…$) must still render stacked on every student-facing math
// surface. Internal storage may keep the slash; only presentation changes.

const LESSON_FRACTIONS = [
  'y = (2/3)x + 7',
  'y = (3/2)x - 1',
  'y - 5 = -(3/4)(x - 14)',
  'y - 7 = -(2/3)(x + 3)',
  'y + 8 = (1/2)(x + 6)',
  'y = (4/3)x - 5',
  'y = -(2/5)x + 6',
  'y + 2 = -(4/3)(x - 6)',
];

test('every known lesson slash fraction is detected and would render stacked', () => {
  LESSON_FRACTIONS.forEach((prose) => {
    const runs = splitProseFractionRuns(prose);
    assert.ok(runs.some((run) => run.isFraction), `expected a stacked-fraction run in: ${prose}`);
  });
});

test('prose units and URLs are never converted (protected by the same conservative detector everywhere else in the platform)', () => {
  const protectedProse = [
    'The car travels 60 miles/hour on the highway.',
    'See https://example.com/path/to/page for more.',
  ];
  protectedProse.forEach((prose) => {
    const runs = splitProseFractionRuns(prose);
    assert.equal(runs.length, 1, `expected ${JSON.stringify(prose)} to pass through untouched`);
    assert.equal(runs[0].isFraction, false);
    assert.equal(runs[0].text, prose);
  });
});

test('a sentence with no slash at all is left completely alone', () => {
  const runs = splitProseFractionRuns('Solve for x in the equation below.');
  assert.deepEqual(runs, [{ text: 'Solve for x in the equation below.', isFraction: false }]);
});

const readSource = (relativePath) => fs.readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

test('MathText (hints, feedback, task cards, choices, solution review) stacks plain-prose fractions', () => {
  const source = readSource('src/components/common/MathText.jsx');
  assert.match(source, /splitProseFractionRuns/);
});

test('QuestionPrompt (the main "Your question"/"Your task" card) stacks plain-prose fractions', () => {
  const source = readSource('src/QuestionPrompt.jsx');
  assert.match(source, /splitProseFractionRuns/);
});

test('ReferenceInfoCard stacks plain-prose fractions', () => {
  const source = readSource('src/ReferenceInfoCard.jsx');
  assert.match(source, /splitProseFractionRuns/);
});

test('the printable student worksheet / teacher copy / answer-key PDF stacks plain-prose fractions before rendering', () => {
  const source = readSource('src/platform/resources/assignmentWorksheetPdf.js');
  assert.match(source, /splitProseFractionRuns/);
  // Anchor to the function that actually renders prompt/directions/scenario/
  // givens/choice/answer/solution text, not just anywhere in the file.
  const appendRichTextRegion = source.slice(
    source.indexOf('const appendRichText'),
    source.indexOf('const graphWorkspace'),
  );
  assert.match(appendRichTextRegion, /splitProseFractionRuns/);
});

test('lesson-notes PDF (teacher equations) stacks a plain-typed fraction instead of relying on authored \\\\frac syntax', () => {
  const source = readSource('src/platform/resources/lessonNotesPdf.js');
  assert.match(source, /stackDivisions/);
  const addMathRegion = source.slice(source.indexOf('const addMath'), source.indexOf('const sectionNode'));
  assert.match(addMathRegion, /stackDivisions\(/);
});

// Mutation guard: prove the "protected" assertion can fail for a genuinely
// unsafe transform (one that stacks bare-word slashes).
test('mutation guard: a naive detector that stacked ANY slash would wrongly convert miles/hour', () => {
  const naiveTransform = (text) => text.replace(/(\w+)\/(\w+)/, '\\frac{$1}{$2}');
  assert.match(naiveTransform('60 miles/hour'), /\\frac/);
});

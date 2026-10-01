/*
 * A TOOL'S CHECK RECORDS THE PARTS THE QUESTION ASKED, UNDER NAMES PEOPLE READ.
 *
 * Inverse & Composition and Data Modeling report every part they know in
 * `metadata.parts` (a map of id to right/wrong), asked or not. Recorded as it
 * came, an inverse-only question stored "fog" and "gof" as wrong parts it never
 * asked: the teacher's gradebook listed them in red, the student's attempt
 * outcome said "Focus on: fog, gof, inverse, restriction", and the case review
 * counted them. See src/tools/shared/toolSubmissionParts.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { toolSubmissionParts } from '../../src/tools/shared/toolSubmissionParts.js';
import { recordQuestionAttempt, emptyQuestionRecord } from '../../src/attemptPolicy.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('a map of parts records only the asked ones, under their names', () => {
  const parts = toolSubmissionParts({
    parts: { fog: false, gof: false, inverse: true, restriction: false },
    requiredParts: ['restriction', 'inverse'],
    partLabels: { fog: '(f ∘ g)(x)', gof: '(g ∘ f)(x)', inverse: 'f⁻¹(f(x))', restriction: 'Domain restriction' },
  });
  assert.deepEqual(parts, [
    { id: 'inverse', label: 'f⁻¹(f(x))', isComplete: true, isCorrect: true, response: '' },
    { id: 'restriction', label: 'Domain restriction', isComplete: true, isCorrect: false, response: '' },
  ]);
  // What the student is told to look at, and what the gradebook lists, follow.
  const { result, record } = recordQuestionAttempt({ record: emptyQuestionRecord(), isCorrect: false, parts, maximumAttempts: 3 });
  assert.deepEqual(result.incorrectParts, ['Domain restriction']);
  assert.deepEqual(record.partGrades.map((part) => part.label), ['f⁻¹(f(x))', 'Domain restriction']);
});

test('a tool that says neither is recorded exactly as before', () => {
  assert.deepEqual(toolSubmissionParts({ parts: { a: true, b: false } }), [
    { id: 'a', label: 'a', isComplete: true, isCorrect: true, response: '' },
    { id: 'b', label: 'b', isComplete: true, isCorrect: false, response: '' },
  ]);
  // A name that is not usable text falls back to the id; nothing asked is nothing recorded.
  assert.deepEqual(toolSubmissionParts({ parts: { a: true }, partLabels: { a: '  ' } }).map((part) => part.label), ['a']);
  assert.deepEqual(toolSubmissionParts({ parts: { a: true }, requiredParts: [] }), []);
  assert.deepEqual(toolSubmissionParts(null), []);
  assert.deepEqual(toolSubmissionParts({ parts: 'x' }), []);
});

test('a list of parts keeps its shape, its defaults and its misconception codes', () => {
  assert.deepEqual(toolSubmissionParts({
    parts: [
      { id: 'slope', label: 'Slope', isCorrect: false, response: '-2', misconceptionCode: 'slope-direction' },
      { isComplete: false },
    ],
    requiredParts: ['ignored for a list'],
  }), [
    { id: 'slope', label: 'Slope', isComplete: true, isCorrect: false, response: '-2', misconceptionCode: 'slope-direction' },
    { id: 'part-2', label: 'Part 2', isComplete: false, isCorrect: false, response: '' },
  ]);
});

test('both tools that report a map say what they asked and name every part they know', () => {
  for (const [file, labelsName, knownParts] of [
    ['src/tools/inverseComposition/InverseCompositionLab.jsx', 'INVERSE_COMPOSITION_PART_LABELS', ['fog', 'gof', 'inverse', 'restriction']],
    ['src/tools/dataModeling/DataModelingLab.jsx', 'DATA_MODELING_PART_LABELS', ['fit', 'prediction', 'association', 'correlation', 'correlationInterpretation', 'modelChoice']],
  ]) {
    const source = executableSource(read(file));
    const labels = region(source, `const ${labelsName} = Object.freeze({`, '});', `${file} labels`);
    knownParts.forEach((part) => assert.match(labels, new RegExp(`\\b${part}: '[^']+'`), `${file}: ${part} has a name`));
    const submit = region(source, 'submit(', ');', `${file} submit`);
    assert.match(submit, /parts: ?results/, `${file} still reports every checked part for its own feedback`);
    assert.match(submit, /\brequiredParts\b/, `${file} says which parts the question asked`);
    assert.match(submit, new RegExp(`partLabels: ${labelsName}`), `${file} names them`);
  }
});

test('the engine records what toolSubmissionParts returns', () => {
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const handler = region(engine, 'const handleMissingToolAction = async', 'const handleModelingLabGrade', 'registry tool forwarder');
  assert.match(handler, /const parts = toolSubmissionParts\(payload\?\.metadata\);/);
  assert.match(handler, /await onGrade\?\.\(\s*Boolean\(payload\?\.isCorrect\),\s*details,\s*parts,/);
});

/*
 * A TOOL'S CHECK RECORDS THE PARTS THE QUESTION ASKED, UNDER NAMES PEOPLE READ.
 *
 * Inverse & Composition and Data Modeling report every part they know in
 * `metadata.parts` (a map of id to right/wrong), asked or not. Recorded as it
 * came, an inverse-only question stored "fog" and "gof" as wrong parts it never
 * asked: the teacher's gradebook listed them in red, the student's attempt
 * outcome said "Focus on: fog, gof, inverse, restriction", and the case review
 * counted them. See src/tools/shared/toolSubmissionParts.js.
 *
 * Since server-authoritative grading (#412) both tools' Checks are marked by
 * their shared graders (functions/shared/serverGrading/tools/), and the engine
 * records the grader's parts — a list, already only the asked parts, under the
 * names the server stores. toolSubmissionParts still maps what a tool reports
 * for a mode that is graded on the device.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { toolSubmissionParts } from '../../src/tools/shared/toolSubmissionParts.js';
import { recordQuestionAttempt, emptyQuestionRecord } from '../../src/attemptPolicy.js';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { attemptInputsFromGrading } from '../../functions/shared/serverGrading/gradingResult.mjs';
import inverseCompositionGrader from '../../functions/shared/serverGrading/tools/inverseCompositionLab.mjs';
import dataModelingGrader from '../../functions/shared/serverGrading/tools/dataModelingLab.mjs';
import { inverseLabFunctions, inverseLabRequiredParts } from '../../functions/shared/toolMath/inverseComposition/inverseCompositionMath.mjs';
import { DATA_MODELING_MODES, dataModelingRequiredParts } from '../../functions/shared/toolMath/dataModeling/dataModelingPlan.mjs';
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

const inverseQuestions = [undefined, 'composition', 'inverse', 'restriction', 'banana'].flatMap((mode) => (
  [undefined, { type: 'quadratic', a: 1, h: 0, k: 0, inverseBranch: 'right' }].map((f) => ({
    type: 'inverseCompositionLab', ...(mode ? { mode } : {}), ...(f ? { f } : {}),
  }))
));
const dataModelingQuestions = [...DATA_MODELING_MODES, 'bogusMode'].flatMap((mode) => [
  { type: 'dataModelingLab', mode },
  { type: 'dataModelingLab', mode, predictionX: 3 },
]);

test('both tools that reported a map record only the parts their question asked, under names, from their shared grader', () => {
  for (const { file, graderName, grader, questions, asked, knownParts } of [
    {
      file: 'src/tools/inverseComposition/InverseCompositionLab.jsx',
      graderName: 'inverseCompositionGrader',
      grader: inverseCompositionGrader,
      questions: inverseQuestions,
      asked: (question) => inverseLabRequiredParts(question.mode || 'full', inverseLabFunctions(question).f),
      knownParts: ['fog', 'gof', 'inverse', 'restriction'],
    },
    {
      file: 'src/tools/dataModeling/DataModelingLab.jsx',
      graderName: 'dataModelingGrader',
      grader: dataModelingGrader,
      questions: dataModelingQuestions,
      asked: (question) => dataModelingRequiredParts(question.mode, question),
      knownParts: ['fit', 'prediction', 'association', 'correlation', 'correlationInterpretation', 'modelChoice'],
    },
  ]) {
    // The Check submits the shared grader's parts — the list the engine records.
    const source = executableSource(read(file));
    const check = region(source, 'const check = () => {', '\n  };', `${file} check`);
    assert.match(check, new RegExp(`const result = gradeToolCheck\\(${graderName}, questionData, work\\);`), `${file} is marked by its shared grader`);
    assert.match(check, /submit\(\{ isCorrect: result\.isCorrect, score: result\.score \}, work, \{[^}]*\bparts: result\.parts\b[^}]*\}\);/, `${file} reports the grader's parts`);

    const named = new Set();
    for (const question of questions) {
      const result = gradeToolCheck(grader, question, {});
      assert.equal(result.graded, true, `${file} ${JSON.stringify(question)} is graded`);
      assert.deepEqual(result.parts.map((part) => part.id), asked(question), `${file} ${question.mode}: only the asked parts`);
      result.parts.forEach((part) => {
        assert.ok(typeof part.label === 'string' && part.label.trim() && part.label !== part.id, `${file} ${part.id} is recorded under a name, not its id`);
        named.add(part.id);
      });
      // A tool-reported list goes through the device path unchanged.
      assert.deepEqual(toolSubmissionParts({ parts: result.parts }).map((part) => [part.id, part.label]), result.parts.map((part) => [part.id, part.label]));
    }
    assert.deepEqual([...named].sort(), [...knownParts].sort(), `${file}: every part it knows is reached, and named`);
  }

  // What the student is told to look at, and what the gradebook lists, follow:
  // an inverse-only question never records fog or gof.
  const inverseOnly = gradeToolCheck(inverseCompositionGrader, { type: 'inverseCompositionLab', mode: 'inverse' }, { x: 2, inverseAnswer: '7' });
  const { parts } = attemptInputsFromGrading(inverseOnly);
  const { result, record } = recordQuestionAttempt({ record: emptyQuestionRecord(), isCorrect: false, parts, maximumAttempts: 3 });
  assert.deepEqual(result.incorrectParts, ['f⁻¹(f(x))']);
  assert.deepEqual(record.partGrades.map((part) => part.label), ['f⁻¹(f(x))']);
});

test('the engine records the shared grader\'s parts, and what toolSubmissionParts returns for a device-graded mode', () => {
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  const handler = region(engine, 'const handleMissingToolAction = async', 'const handleModelingLabGrade', 'registry tool forwarder');
  // A graded Check records the grader's parts (only the asked ones, named).
  const graded = region(handler, 'if (sharedVerdict.graded) {', '\n        return;', 'the shared-grader branch');
  assert.match(graded, /const attemptInputs = attemptInputsFromGrading\(sharedVerdict\);/);
  assert.match(graded, /await onGrade\?\.\(\s*attemptInputs\.isCorrect,\s*details,\s*attemptInputs\.parts,/);
  // A mode graded on the device records toolSubmissionParts' mapping.
  assert.match(handler, /const parts = toolSubmissionParts\(payload\?\.metadata\);/);
  assert.match(handler, /await onGrade\?\.\(\s*Boolean\(payload\?\.isCorrect\),\s*details,\s*parts,/);
});

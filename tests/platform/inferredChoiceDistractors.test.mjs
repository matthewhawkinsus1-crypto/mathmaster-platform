// GR12: A YES/NO CHOICE THE PLATFORM INFERRED KEEPS ITS DISTRACTORS.
//
// A field the author wrote with no options but a label that names its choices
// ("Yes or no?", "True or false?", "Discrete or continuous?") is a choice the
// platform infers, and the screen gives it two more options that name a
// misconception ("both yes and no", "cannot be determined"). Choices the author
// wrote stay exactly as written. The V5 compile and the JSON import wrote the
// inferred pair into `options`, so it was read as authored: two choices, an
// even guess, and nothing to diagnose. They now mark it `optionsInferred`.
//
// The mark is who wrote the options, not what the question asks: the same
// question compiled before and after it is one question to the content-upgrade
// and live-repair classifiers.

import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { flattenV5Sections } from '../../src/platform/contract/assignmentSchemaV5.js';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { choiceOptionsForField } from '../../src/platform/interaction/choiceOptions.js';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { classifyContentQuestionChange } from '../../functions/shared/assignmentContentUpgradePolicy.mjs';
import { analyzeSafeResponseEntryRepair } from '../../functions/shared/liveResponseRepairPolicy.mjs';

const v5 = (fields) => ({
  schemaVersion: 5,
  assignment: { title: 'Choices', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  sections: [{
    role: 'classwork',
    title: 'Classwork',
    questions: [{
      standard: 'A.12A',
      prompt: 'The relation is {(1, 2), (2, 3), (3, 4)}. Decide whether it is a function and whether its graph is discrete.',
      studentActions: ['multipleResponses'],
      responses: fields,
      dok: 1,
      difficultyBand: 1,
    }],
  }],
});
const compiledFields = (fields) => flattenV5Sections(compileAuthoringIntentV5(v5(fields)).package)[0].answerFields;
const sorted = (options) => [...options].sort();

test('the V5 compile marks a Yes/No pair it inferred, and the screen adds the distractors', () => {
  const [isFunction, kind] = compiledFields([
    { id: 'isFunction', label: 'Is the relation a function? Yes or no', answer: 'yes' },
    { id: 'kind', label: 'Discrete or continuous?', answer: 'discrete' },
  ]);
  assert.deepEqual([isFunction.type, isFunction.options, isFunction.optionsInferred], ['choice', ['yes', 'no'], true]);
  assert.deepEqual(sorted(choiceOptionsForField(isFunction)), sorted(['yes', 'no', 'both yes and no', 'cannot be determined']));
  assert.equal(kind.optionsInferred, true);
  assert.deepEqual(sorted(choiceOptionsForField(kind)), sorted(['discrete', 'continuous', 'both discrete and continuous', 'neither discrete nor continuous']));
});

test('choices the author wrote are never changed, in any case or order', () => {
  const [yesNo, lowerPair] = compiledFields([
    { id: 'isFunction', label: 'Is the relation a function? Yes or no', answer: 'Yes', options: ['Yes', 'No'] },
    { id: 'kind', label: 'Discrete or continuous', type: 'choice', options: ['discrete', 'continuous'], answer: 'discrete' },
  ]);
  for (const field of [yesNo, lowerPair]) {
    assert.equal(field.optionsInferred, undefined, field.id);
    assert.deepEqual(sorted(choiceOptionsForField(field)), sorted(field.options), field.id);
  }
});

test('the JSON import marks the pair it inferred too (a portable export, which is not recompiled)', () => {
  const imported = parseAssignmentBlueprintText(JSON.stringify({
    schemaVersion: 5,
    portableContract: { kind: 'mathmasterCanonicalAssignmentV5', version: 1 },
    assignment: { title: 'Import', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
    sections: [{
      role: 'classwork',
      title: 'Classwork',
      questions: [{
        questionId: 'q1',
        type: 'multiAnswer',
        prompt: 'Decide.',
        answerFields: [
          { id: 'claim', label: 'True or false: every line is a function', answer: 'false' },
          { id: 'given', label: 'True or false?', answer: 'true', options: ['True', 'False'] },
        ],
      }],
    }],
  }));
  assert.ok(imported.repairs.some((repair) => /portable export/.test(repair)), 'read as a portable export');
  const [claim, given] = imported.questions[0].answerFields;
  assert.deepEqual([claim.options, claim.optionsInferred], [['true', 'false'], true]);
  assert.deepEqual(sorted(choiceOptionsForField(claim)), sorted(['true', 'false', 'both true and false', 'cannot be determined']));
  assert.equal(given.optionsInferred, undefined);
  assert.deepEqual(sorted(choiceOptionsForField(given)), ['False', 'True']);
});

test('only the key is right; a distractor the screen added is wrong', () => {
  const [field] = compiledFields([{ id: 'isFunction', label: 'Is the relation a function? Yes or no', answer: 'yes' }]);
  assert.equal(matchesFieldAnswer('yes', field), true);
  for (const wrong of ['no', 'both yes and no', 'cannot be determined']) assert.equal(matchesFieldAnswer(wrong, field), false, wrong);
});

test('the mark alone is no change to a question: an upgrade or a live repair reads it as the same question', () => {
  const [marked] = compiledFields([{ id: 'isFunction', label: 'Is the relation a function? Yes or no', answer: 'yes' }]);
  const { optionsInferred: _mark, ...unmarked } = marked;
  const question = (field) => ({ questionId: 'q1', type: 'multiAnswer', prompt: 'Decide.', answerFields: [field] });
  assert.equal(classifyContentQuestionChange(question(unmarked), question(marked)).classification, 'unchanged');
  assert.equal(classifyContentQuestionChange(question(marked), question(unmarked)).classification, 'unchanged');
  // A real repair beside it is still read as one: a plain-language box made a choice.
  const before = { questionId: 'q1', type: 'multiAnswer', prompt: 'Decide.', answerFields: [unmarked, { id: 'why', label: 'Why', answer: 'one output for each input', inputProfile: 'text' }] };
  const after = { ...before, answerFields: [marked, { id: 'why', label: 'Why', answer: 'one output for each input', type: 'choice', inputProfile: 'choice', options: ['one output for each input', 'one input for each output'] }] };
  assert.deepEqual(analyzeSafeResponseEntryRepair(before, after), { safe: true, affectedFieldIds: ['why'] });
  assert.equal(classifyContentQuestionChange(before, after).classification, 'safeResponseControl');
});

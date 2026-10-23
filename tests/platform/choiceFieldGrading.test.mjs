/*
 * A CHOICE IS THE OPTION PICKED, NOT ITS VALUE (GR06).
 *
 * Choice fields were graded by value, so an option equal to the key in value
 * was marked right: the unsimplified (2a²b)(4a³b) for 8a⁵b², 2/4 for 1/2, and
 * in five live lesson fields a WRONG option the value reader could not tell
 * from the key ("f(3x) − 2" for "3f(x) − 2"; "Every number from 0 to 300" for
 * "Whole numbers of student tickets from 0 to 600"). These tests pin:
 *
 *   - only the key's own option is right; a key spelled differently from its
 *     option (1/2 for \frac{1}{2}) still names it, by being the value of
 *     exactly one option;
 *   - the five live fields, compiled from their lessons and graded the way the
 *     server grades them: every option but the key is wrong;
 *   - every choice field in every lesson: the key right, no other option;
 *   - a field that is not a choice is graded exactly as before.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import { matchesFieldAnswer, isChoiceAnswerField, choiceFieldOptions } from '../../functions/shared/answerUtils.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';

const ROOT = new URL('../../', import.meta.url);

test('only the key\'s own option is right, whatever the other options are worth', () => {
  const simplify = { id: 'product', type: 'choice', answer: '8a^5b^2', options: ['8a^5b^2', '(2a^2b)(4a^3b)', '6a^5b', '8a^6b^2'] };
  assert.equal(matchesFieldAnswer('8a^5b^2', simplify), true);
  assert.equal(matchesFieldAnswer('(2a^2b)(4a^3b)', simplify), false, 'the unsimplified distractor has the key\'s value and is not the key');
  assert.equal(matchesFieldAnswer('6a^5b', simplify), false);
  const half = { id: 'half', type: 'choice', answer: '1/2', options: ['1/2', '2/4', '1/3'] };
  assert.equal(matchesFieldAnswer('2/4', half), false);
  assert.equal(matchesFieldAnswer('1/2', half), true);
  assert.equal(matchesFieldAnswer(' 1/2 ', half), true, 'spacing is not a different option');
  // A key spelled another way names the one option with its value.
  const spelled = { id: 'frac', type: 'choice', answer: '1/2', options: ['\\frac{1}{2}', '\\frac{1}{3}'] };
  assert.equal(matchesFieldAnswer('\\frac{1}{2}', spelled), true);
  assert.equal(matchesFieldAnswer('\\frac{1}{3}', spelled), false);
  // A Path choice names its option by id.
  const path = { id: 'relationship', inputProfile: 'choice', expected: 'inverse', choices: [{ id: 'inverse', label: 'g = f⁻¹' }, { id: 'reciprocal', label: 'g = 1/f' }] };
  assert.deepEqual(choiceFieldOptions(path), ['inverse', 'reciprocal']);
  assert.equal(matchesFieldAnswer('inverse', path), true);
  assert.equal(matchesFieldAnswer('reciprocal', path), false);
  assert.equal(matchesFieldAnswer('', simplify), false, 'no pick is not an answer');
});

test('a field that is not a choice is graded exactly as before', () => {
  assert.equal(isChoiceAnswerField({ type: 'text' }), false);
  assert.equal(matchesFieldAnswer('2/4', { id: 'n', answer: '1/2' }), true, 'a typed value is still read as a value');
  assert.equal(matchesFieldAnswer('8a^5b^2', { id: 'e', answer: '8a^5b^2' }), true);
});

const choiceFieldsOf = (questions) => questions.flatMap((question, index) => (question.answerFields || [])
  .filter(isChoiceAnswerField)
  .map((field) => ({ question, index, field })));

test('the five live fields: every option but the key is wrong, graded as the server grades them', () => {
  const live = [
    ['teacher-import-jsons/algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json', ['hTerms']],
    ['teacher-import-jsons/algebra1-module3/T2_L1_Solving_Systems_by_Graphing.json', ['realDomain', 'realRange']],
    ['teacher-import-jsons/algebra1-module3/T2_L1_Solving_Systems_by_Graphing_Honors.json', ['realDomain', 'realRange']],
  ];
  let checked = 0;
  for (const [file, ids] of live) {
    const { questions } = compileTeacherImport(readFileSync(new URL(file, ROOT), 'utf8'));
    for (const { question, field } of choiceFieldsOf(questions).filter((entry) => ids.includes(entry.field.id))) {
      const key = String(field.answer);
      const others = choiceFieldOptions(field).filter((option) => option !== key);
      const graded = (value) => gradeMultiAnswerResponse({ ...question, answerFields: [field] }, { [field.id]: value }).parts[0].isCorrect;
      assert.equal(graded(key), true, `${file} ${field.id}: the key`);
      others.forEach((option) => assert.equal(graded(option), false, `${file} ${field.id}: "${option}" is not the key`));
      checked += 1;
    }
  }
  assert.equal(checked, 5, 'all five live fields were found');
});

test('every choice field in every lesson: the key is right and no other option is', () => {
  const files = execFileSync('git', ['ls-files', 'teacher-import-jsons', 'docs/assignments'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((file) => file.endsWith('.json'));
  let fields = 0;
  const walk = (node, file) => {
    if (Array.isArray(node)) return node.forEach((child) => walk(child, file));
    if (!node || typeof node !== 'object') return;
    if (isChoiceAnswerField(node) && Array.isArray(node.options) && node.options.length > 1 && node.answer != null) {
      fields += 1;
      const key = String(node.answer);
      assert.equal(matchesFieldAnswer(key, node), true, `${file} ${node.id}: the key`);
      choiceFieldOptions(node).filter((option) => option.trim() !== key.trim())
        .forEach((option) => assert.equal(matchesFieldAnswer(option, node), false, `${file} ${node.id}: "${option}"`));
    }
    Object.values(node).forEach((child) => walk(child, file));
  };
  files.forEach((file) => {
    let parsed = null;
    try { parsed = JSON.parse(readFileSync(new URL(file, ROOT), 'utf8')); } catch { return; }
    walk(parsed, file);
  });
  assert.ok(fields > 500, `read the lessons' choice fields (${fields})`);
});

test('Pre-Flight lists a choice option worth the same as the key, as advice, never for words or function notation', async () => {
  const { choiceOptionsWithKeyValue, auditAssignmentChoiceOptions } = await import('../../src/platform/preflight/choiceOptionPreflight.js');
  assert.deepEqual(choiceOptionsWithKeyValue({ type: 'choice', answer: '8a^5b^2', options: ['8a^5b^2', '(2a^2b)(4a^3b)', '6a^5b'] }), ['(2a^2b)(4a^3b)']);
  assert.deepEqual(choiceOptionsWithKeyValue({ type: 'choice', answer: '1/2', options: ['1/2', '2/4', '\\frac{3}{6}', '1/3'] }), ['2/4', '\\frac{3}{6}']);
  assert.deepEqual(choiceOptionsWithKeyValue({ type: 'choice', answer: '3f(x) − 2', options: ['3f(x) − 2', 'f(3x) − 2'] }), [], 'function notation is not compared');
  assert.deepEqual(choiceOptionsWithKeyValue({ type: 'choice', answer: 'Whole numbers from 0 to 600', options: ['Whole numbers from 0 to 600', 'Every number from 0 to 300'] }), [], 'words are not compared');
  assert.deepEqual(choiceOptionsWithKeyValue({ answer: '1/2', options: ['1/2', '2/4'] }), [], 'only a choice field');
  const { warnings } = auditAssignmentChoiceOptions([
    { answerFields: [{ id: 'p', type: 'choice', label: 'Product', answer: '8a^5b^2', options: ['8a^5b^2', '(2a^2b)(4a^3b)'] }] },
    { teacherExcluded: true, answerFields: [{ id: 'q', type: 'choice', answer: '1/2', options: ['1/2', '2/4'] }] },
  ], { deliveredOnly: true });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^Question 1 \(Product\): "\(2a\^2b\)\(4a\^3b\)" has the same value as the key "8a\^5b\^2"\./);

  // Wired: in the Pre-Flight model as advice, and shown in its own panel.
  const { componentSource, executableSource, region } = await import('./helpers/sourceContract.mjs');
  const model = executableSource(readFileSync(new URL('src/platform/preflight/assignmentV5PreflightModel.js', ROOT), 'utf8'));
  assert.match(model, /\n\s*const choiceOptions = auditAssignmentChoiceOptions\(questions, deliveredOnly\);/);
  assert.match(model, /\n\s*choiceOptions,\n/);
  const modal = executableSource(componentSource('src/components/teacher/LessonPreflightModal.jsx'));
  const panel = region(modal, '{preflightModel.choiceOptions?.warnings?.length > 0 && (', '\n      )}', 'the choice-option panel');
  assert.match(panel, />Choices worth the same as the key</);
  assert.match(panel, /preflightModel\.choiceOptions\.warnings\.map\(\(warning\) => <li key=\{warning\}>\{warning\}<\/li>\)/);
  assert.match(panel, /This does not stop you publishing\./);
});

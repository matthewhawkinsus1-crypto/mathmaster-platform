/*
 * ONE-TRY CHOICE ITEMS GET A REASON PER OPTION (FB05; the owner, batch 4,
 * 2026-10-16; student pass 3, HELP-18 and C1-24).
 *
 * A question made only of choices has one try. After it, oneTryChoice.js
 * shows the author's one line for the option the student chose
 * (answerFields[].optionRationales), but no lesson wrote any and the AI
 * authoring contract never asked for them. Now:
 *
 *   - the contract asks for a reason per option, in the shape the platform
 *     reads;
 *   - every one-try choice item in teacher-import-jsons has a reason for every
 *     option, Pre-Flight finds nothing it could not show, and no wrong option's
 *     reason states the right answer;
 *   - an assignment template's options are templates ("{{t}}"), so its family
 *     fills the reason keys as it fills the options: every generated version
 *     finds a reason for whatever the student chose.
 *
 * Algebra I Module 3's two one-try Warm-Ups are built by the platform family
 * inequalities.translatePhrase, which writes their options. A family writes
 * questions only (no hints, steps or worked solutions), so they have none.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAuthoringContract } from '../../src/platform/contract/authoringContract.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { chosenOptionReasons, optionRationaleProblems } from '../../src/platform/supports/feedback/oneTryChoice.js';
import { isChoiceOnlyQuestion } from '../../functions/shared/attemptPolicy.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';

const IMPORTS = fileURLToPath(new URL('../../teacher-import-jsons/', import.meta.url));
const text = (value) => String(value ?? '').trim();

/** Every one-try choice item in the real lessons: { lesson, question }. */
const oneTryChoiceItems = (() => {
  const items = [];
  readdirSync(IMPORTS).sort().forEach((folder) => readdirSync(join(IMPORTS, folder))
    .filter((name) => name.endsWith('.json')).sort()
    .forEach((name) => {
      const source = JSON.parse(readFileSync(join(IMPORTS, folder, name), 'utf8'));
      compileAuthoringIntentV5(source).package.sections.forEach((section) => section.questions.forEach((question) => {
        if (isChoiceOnlyQuestion(question)) items.push({ lesson: `${folder}/${name}`, question });
      }));
    }));
  return items;
})();

test('the AI authoring contract asks for a reason per option on a one-try choice question, in the shape the platform shows', () => {
  const contract = buildAuthoringContract({ courseId: 'algebra2' });
  const rule = contract.split('\n').find((line) => line.includes('"optionRationales"'));
  assert.ok(rule, 'the contract asks for optionRationales');
  assert.match(rule, /finite-choice question has one try/);
  assert.match(rule, /wrong option's reason names the mistake .* without stating the right answer/);
  assert.match(rule, /platform family builds takes none/, 'a family writes its own answer fields');
  // The example an outside AI copies is keyed by option text, which is what
  // Pre-Flight accepts and what the student is shown after the try.
  const { optionRationales } = JSON.parse(`{${rule.match(/`("optionRationales": \{[^`]*\})`/)[1]}}`);
  const field = { id: 'trend', label: 'Trend', type: 'choice', options: Object.keys(optionRationales), answer: 'decreasing', optionRationales };
  assert.deepEqual(optionRationaleProblems({ answerFields: [field] }), []);
  assert.equal(chosenOptionReasons({ question: { answerFields: [field] }, parts: [{ id: 'trend', response: 'mixed', isCorrect: false }] }).length, 1);
});

test('every one-try choice item in the lessons has a reason for every option, and no wrong option\'s reason states the answer', () => {
  // About sixty such items (Algebra II Honors Module 1 holds most); none at
  // all would mean this test had stopped looking.
  assert.ok(oneTryChoiceItems.length >= 55, `${oneTryChoiceItems.length} one-try choice items found`);
  for (const { lesson, question } of oneTryChoiceItems) {
    assert.deepEqual(optionRationaleProblems(question), [], `${lesson}: Pre-Flight can show every reason`);
    for (const field of question.answerFields) {
      const where = `${lesson} ${question.questionId || question.id || ''} ${field.id}`;
      const reasons = field.optionRationales || {};
      const answer = text(field.answer);
      for (const option of (field.options || []).map(text)) {
        assert.ok(text(reasons[option]), `${where}: "${option}" has a reason`);
        if (option !== answer && answer.length >= 3) {
          assert.ok(!reasons[option].toLowerCase().includes(answer.toLowerCase()), `${where}: the reason for "${option}" does not state the answer`);
        }
      }
    }
  }
});

test('an assignment template fills its reason keys as it fills its options, so every version finds the chosen option\'s reason', () => {
  const templates = oneTryChoiceItems.filter(({ question }) => question.questionFamily?.scope === 'assignment'
    && question.answerFields.some((field) => (field.options || []).some((option) => /\{\{/.test(option))));
  assert.ok(templates.length >= 5, `${templates.length} templated one-try items`);
  for (const { lesson, question } of templates) {
    for (let seat = 0; seat < 12; seat += 1) {
      const walked = resolveFamilyQuestionInstance({ question, assignmentId: 'fb05-rationales', storageIndex: 0, allocation: { seat } });
      assert.equal(walked.error, null, `${lesson} seat ${seat} resolves`);
      for (const field of walked.question.answerFields) {
        for (const option of field.options) {
          const [reason] = chosenOptionReasons({ question: walked.question, parts: [{ id: field.id, response: String(option), isCorrect: null }] });
          assert.ok(reason, `${lesson} seat ${seat}: the generated option ${option} finds its reason`);
          assert.doesNotMatch(reason.rationale, /\{\{|\}\}/, `${lesson} seat ${seat}: the reason is filled with this version's numbers`);
        }
      }
    }
  }
});

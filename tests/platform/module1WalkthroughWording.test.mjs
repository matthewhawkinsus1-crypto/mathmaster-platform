/*
 * WORDING, STEP QUESTIONS AND HINTS THAT FIT THEIR ITEM (student walkthrough
 * 2026-11-06, Algebra II Honors module 1 and the Algebra I District DOL 1
 * review, part 1, "Wording and display").
 *
 *   - The District review's exponential items (CW 9, CW 10, PR 5, DOL 5)
 *     offered "Exponential growth / Exponential decay" under "Where is this
 *     function increasing and where is it decreasing?". The step now asks
 *     growth or decay. Its question is authored (`behaviorPrompt`), which the
 *     import used to drop.
 *   - The District sorts (WU 2, WU 4, PR 7), its vertex choice (WU 3), its
 *     sequences (CW 12, PR 8) and the ALEKS bridge's |x| item (PR 3) showed the
 *     generic hints ("Look at one card at a time…"). Each has its own now, and
 *     each asks before it tells: hint 1 is a question.
 *   - Algebra II Honors L1 Day 1 PR 2 asked to "write the interval" for a
 *     union, where CW 2 and WU 3 say "the compound interval".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { buildQuestionHints, fallbackHints, questionHintAudit } from '../../src/platform/supports/hints/questionHints.js';
import { readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';

const read = (path) => readFileSync(new URL(`../../teacher-import-jsons/${path}`, import.meta.url), 'utf8');
const DISTRICT_PATH = 'algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json';
const DISTRICT = parseAssignmentBlueprintText(read(DISTRICT_PATH)).questions;
const ALEKS = parseAssignmentBlueprintText(read('algebra2-honors-module1/L1_Absolute_Value_ALEKS_Bridge_20260828.json')).questions;
const DAY1 = JSON.parse(read('algebra2-honors-module1/L1_Day1_Interval_Domain_Range.json'));
const GROWTH = ['Exponential growth', 'Exponential decay'];

test('a growth-or-decay step asks growth or decay, and the import keeps the step\'s own question', () => {
  const asked = DISTRICT.flatMap((question) => {
    const { composed, workflow } = readComposedQuestion(question);
    if (!composed) return [];
    return workflow.filter((stage) => stage.id === 'behavior').map((stage) => ({ id: question.questionId, stage }));
  });
  const growth = asked.filter(({ stage }) => GROWTH.every((choice) => stage.choices.includes(choice)));
  assert.deepEqual(growth.map(({ id }) => id), ['q_section-2_2_9', 'q_section-2_2_10', 'q_section-3_3_5', 'q_section-4_4_5'], 'CW 9, CW 10, PR 5, DOL 5');
  growth.forEach(({ id, stage }) => {
    assert.match(stage.prompt, /exponential growth or exponential decay\?$/, id);
    assert.doesNotMatch(stage.prompt, /where is it decreasing/i, id);
  });
  // Every other behaviour step keeps the recipe's question about intervals.
  asked.filter((entry) => !growth.includes(entry)).forEach(({ id, stage }) => {
    assert.equal(stage.prompt, 'Where is this function increasing and where is it decreasing?', id);
  });
  // The compiler carries an authored step question (CW 9's); with none
  // authored, the step keeps the recipe's.
  const document = JSON.parse(read(DISTRICT_PATH));
  const cw9 = (doc) => compileAuthoringIntentV5(doc).package.sections.find((section) => section.role === 'classwork').questions[8];
  assert.match(cw9(document).behaviorPrompt, /exponential growth or exponential decay\?$/);
  delete document.sections.find((section) => section.role === 'classwork').questions[8].behaviorPrompt;
  assert.equal(cw9(document).behaviorPrompt, undefined);
  assert.equal(readComposedQuestion(cw9(document)).workflow.find((stage) => stage.id === 'behavior').prompt, 'Where is this function increasing and where is it decreasing?');
});

const NAMED = [
  // [lesson, question id, what it is]
  [DISTRICT, 'q_section-1_1_2', 'District WU 2, the family sort'],
  [DISTRICT, 'q_section-1_1_3', 'District WU 3, the vertex choice'],
  [DISTRICT, 'q_section-1_1_4', 'District WU 4, the growth or decay sort'],
  [DISTRICT, 'q_section-3_3_7', 'District PR 7, the function sort'],
  [DISTRICT, 'q_section-2_2_12', 'District CW 12, the arithmetic sequence'],
  [DISTRICT, 'q_section-3_3_8', 'District PR 8, the geometric sequence'],
  [ALEKS, 'q_practice-absolute-value-focus_3_3', 'ALEKS bridge PR 3, |x|'],
];

test('the walkthrough\'s generic-hint items have their own hints, each ladder opening with a question', () => {
  NAMED.forEach(([lesson, id, what]) => {
    const question = lesson.find((entry) => entry.questionId === id);
    assert.ok(question, what);
    const ladder = buildQuestionHints(question);
    const generic = new Set(fallbackHints(question));
    assert.ok(ladder.length >= 3, `${what}: ${ladder.length} hints`);
    ladder.forEach((hint) => assert.ok(!generic.has(hint.text), `${what}: a generic hint is shown: ${hint.text}`));
    assert.equal(ladder[0].source, 'authored', what);
    assert.match(ladder[0].text, /\?$/, `${what}: hint 1 asks before it tells`);
    // None is held back for stating an answer, so the student sees all of them.
    questionHintAudit(question).filter((hint) => hint.source === 'authored')
      .forEach((hint) => assert.equal(hint.shown, true, `${what}: ${hint.text} (${hint.reason})`));
  });
});

// The exit ticket's union too (2026-11-06 re-walk: it still said "write the
// interval"); its Recovery is checked in module1ExitTicketWording.test.mjs.
test('L1 Day 1\'s unions, in every section, are asked as compound intervals', () => {
  const unions = DAY1.sections
    .flatMap((section) => section.questions.map((question, index) => ({ at: `${section.role} ${index + 1}`, question })))
    .filter(({ question }) => (question.intervals || []).length === 2);
  assert.deepEqual(unions.map(({ at }) => at), ['warmup 3', 'classwork 2', 'practice 2', 'dol 1']);
  unions.forEach(({ at, question }) => assert.match(question.prompt, /write the compound interval in interval notation\.$/, at));
});

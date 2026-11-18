// PRE-FLIGHT NOTES A PROMPT THAT NEEDS ANOTHER QUESTION'S ANSWER (#554 item 6;
// #383 R9 and its authoring observation, "the intercepts you just found").
//
// "Use the prices you found." works only in the order the lesson was written.
// Questions are shown one at a time or reordered, given as Recovery versions,
// or left out for a student with fewer items, so the question can reach a
// student who never found the prices. Pre-Flight now says so, as ADVICE in its
// own panel (never a readiness warning, never a block), and only where it is
// sure: a multi-part question whose parts point at each other, a value given
// with the reference, a drawing that is named again, and a quoted claim are
// all left alone. The library sweep is in promptPreflightLibrarySweep.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  auditAssignmentOtherQuestionReferences,
  backReferences,
  otherQuestionReference,
  otherQuestionReferenceWarning,
} from '../../src/platform/preflight/otherQuestionReferencePreflight.js';
import { questionScreenText } from '../../src/platform/preflight/questionScreenText.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { AUTHORING_STATES } from '../../src/platform/preflight/authoringStates.js';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';
import { chainTo, firstLoadGraph, repo } from './helpers/firstLoadGraph.mjs';

const item = (prompt, extra = {}) => ({ type: 'multiAnswer', prompt, answerFields: [{ id: 'a', label: 'Answer', answer: '1' }], ...extra });
const quoteOf = (question) => otherQuestionReference(question)?.quote ?? null;

test('a prompt that points back at a result it does not give is noted, with its own words', () => {
  const noted = [
    // The library's one case (T2 L2 Classwork 18), and #383's observation.
    ['The next customer in Mia’s line buys 5 student tickets and 3 adult tickets. Use the prices you found.', 'Use the prices you found'],
    ['Use the intercepts you just found to write the equation of the line.', 'Use the intercepts you just found to write the equation of the line'],
    ['Check what you just found by substituting it into the equation.', 'Check what you just found by substituting it into the equation'],
    ['Use the vertex you’ve found to write the function in vertex form.', 'Use the vertex you’ve found to write the function in vertex form'],
    ['Use the equation you wrote to predict the cost of 8 tickets.', 'Use the equation you wrote to predict the cost of 8 tickets'],
    ['Check the answer you got by substituting it.', 'Check the answer you got by substituting it'],
    ['The slope you found is the rate of change. What does it mean here?', 'The slope you found is the rate of change'],
    // The question's own instruction is not what produced the value it points at.
    ['Find c(4) using the value you found.', 'Find c(4) using the value you found'],
    // Another question, named.
    ['Using your answer from the previous question, find c(4).', 'Using your answer from the previous question, find c(4)'],
    ['In the previous problem, you graphed f. Now find its range.', 'In the previous problem, you graphed f'],
    ['Use your answer to Question 3 to find the total cost.', 'Use your answer to Question 3 to find the total cost'],
    ['Use the slope from Problem 2 to write the equation.', 'Use the slope from Problem 2 to write the equation'],
    ['Take the value from #2 and double it.', 'Take the value from #2 and double it'],
    // An equation later in the sentence is not the value it points at.
    ['Use the value you found to solve x + 3 = 9.', 'Use the value you found to solve x + 3 = 9'],
    ['Use the prices you found to check that the total is 48.', 'Use the prices you found to check that the total is 48'],
  ];
  for (const [prompt, quote] of noted) assert.equal(quoteOf(item(prompt)), quote, prompt);
  assert.deepEqual(otherQuestionReference(item(noted[0][0])), { field: 'prompt', quote: 'Use the prices you found' });
});

test('the multi-part question is left alone: a part may point at an earlier part on the same screen', () => {
  const reference = 'Using the price you found, what should Mia charge?';
  // A later answer box points at an earlier one.
  assert.equal(otherQuestionReference(item('Mia sells tickets.', { answerFields: [{ id: 's', label: 'Price of a student ticket' }, { id: 't', label: reference }] })), null);
  // The first box points at what the prompt asked for.
  assert.equal(otherQuestionReference(item('Solve 2s + 2a = 48 and 3s + a = 40 for the ticket prices.', { answerFields: [{ id: 't', label: reference }] })), null);
  // The same first box under a prompt that asks for nothing: there is nothing to point at.
  assert.equal(otherQuestionReference(item('Mia sells tickets at the arena.', { answerFields: [{ id: 't', label: reference }, { id: 'u', label: 'Why?' }] }))?.field, 'answerFields[0].label');
  // "Answer each question." asks for nothing a part could point back at.
  assert.equal(otherQuestionReference(item('Answer each question.', { answerFields: [{ id: 't', label: reference }] }))?.quote, reference);
  // A composed question's later step, and a later "Break it down" direction.
  assert.equal(otherQuestionReference({ type: 'functionGraph', prompt: 'A taxi charges by the mile.', workflow: [{ id: 'e', kind: 'equationInput', prompt: 'Write the cost equation.' }, { id: 'g', kind: 'functionGraph', prompt: 'Graph the equation you wrote.' }] }), null);
  assert.equal(otherQuestionReference(item('Graph the line.', { directionSteps: ['Find the two intercepts.', 'Plot the two intercepts you found.'] })), null);
  // An earlier instruction in the prompt's own words: a new sentence, ", then", "and use".
  for (const prompt of [
    'Find the slope of the line through (1, 2) and (3, 6). Then use the slope you found to write the equation.',
    'Find the slope, then use the slope you found to write the equation.',
    'Find the slope and use the slope you found to write the equation.',
    'How many real roots? For each, give the number of real roots, then the root or roots you found: the fourth roots of −81.',
    'Factor $x^3 - 2x^2 - 5x + 6$ completely. Step 1: list the possible rational zeros. Step 2: test $x = 1$. Step 3: divide by the factor you found. Step 4: factor the quotient.',
  ]) assert.equal(quoteOf(item(prompt)), null, prompt);
  // A numbered question the item has as many parts as may be its own part.
  assert.equal(quoteOf(item('Use your answer to question 1 to answer question 2.', { answerFields: [{ id: 'a', label: '1.' }, { id: 'b', label: '2.' }] })), null);
  // Pointing inside the question.
  assert.equal(quoteOf(item('Use the value you found in Part A to answer Part B.', { answerFields: [{ id: 'a', label: 'Part A' }, { id: 'b', label: 'Part B' }] })), null);
  assert.equal(quoteOf(item('Use the slope you found above to write the equation.')), null);
});

test('a reference that carries its value, or is not a reference at all, is left alone', () => {
  for (const prompt of [
    // The value given with it: the fix the note asks for, already made.
    'Use the snack prices you found: a hot dog costs $2 and a drink costs $3.',
    'From the last problem: $x^3 + 4x^2 - 15x - 18 = (x - 3)(x^2 + 7x + 6)$. Factor the depressed polynomial.',
    'The slope you found is 3/4. Use it to write the equation.',
    'In the previous question, you found that x = 4. Use it to find y.',
    'In the previous question, your answer was 12. Double it.',
    'Use the prices you found, which are $8 and $16, to find the total.',
    'Use the prices you found to fill in the table: student $8, adult $16.',
    'Use the slope you found, 3/4, to write the equation.',
    'Use the slope you found (m = 3/4) to write the equation.',
    'x = 4, the value you found, makes the equation true. Explain why.',
    'Factoring a quartic, step 3. You found $x^4 - 2x^3 = (x - 2)(x - 3)$. Finish the factoring.',
    'Your solution is b ≥ 860/3, about 286.67. How many boxes does Elijah need to sell?',
    // A drawing, named again: what was graphed is in the prompt.
    'Describe the key characteristics of g(x) = 3x − 8, the line you just graphed.',
    'Describe the transformation that maps f(x) = x onto four of the functions you just graphed.',
    // The story's own question, a step, a textbook citation, a section title.
    '{{situation}} Write a system of equations for the situation, solve it by substitution, and answer the last question.',
    'Solve the system, then reread the last question before you answer it.',
    'Kai’s last step divides both sides by a negative number. Is he right?',
    'In the previous step you isolated x. Now check it.',
    'Use long division to find $(x^2 - 6x - 20) \\div (x + 2)$ (Exercise 3).',
    'On DOL #2 you will graph lines. Graph y = 2x + 1.',
    // Not a pointer: a verb with its own object, a story, a heading, a quoted claim.
    'If you found the slope correctly, the line rises.',
    'Last week you found a $20 bill. How much is left after you spend $7.50?',
    'On the day you found the lost dog, you walked 3 miles. How far is that in kilometers?',
    'Show Me What You’ve Got! Each graph is a transformation of f(x) = x.',
    'You have got to check both equations.',
    'Maria says, "The slope you found is wrong." Who is right?',
  ]) assert.equal(quoteOf(item(prompt)), null, prompt);
});

test('every version a student can be given is read: a static variant and a family slot\'s generated words', () => {
  const base = item('Solve for the price.', { variants: [{ prompt: 'Solve 2p = 16 for the price.' }, { prompt: 'Use the price you found to fill the table.' }] });
  assert.equal(quoteOf(base), 'Use the price you found to fill the table');
  // A family slot is read through the version it generates (semanticValidation.js
  // reads the same preview): b is drawn from 2–5, where the template's own
  // {{b}} would read as 1.
  const slot = {
    type: 'stepAlgebra',
    prompt: 'Use the value you found to solve x + {{b}} = 9.',
    equationLatex: 'x + {{b}} = 9',
    solveFor: 'x',
    generator: { parameters: { b: { type: 'int', min: 2, max: 5 } } },
    questionFamily: { scope: 'assignment' },
  };
  assert.match(quoteOf(slot), /^Use the value you found to solve x \+ [2-5] = 9$/);
  assert.equal(quoteOf({ ...slot, prompt: 'Solve x + {{b}} = 9.' }), null);
  // What a student reads: the prompt and the panels drawn with it, then the parts in order.
  const text = questionScreenText({ prompt: 'Complete every response.', stimulus: { kind: 'panels', panels: [{ title: 'Linear graph features', note: 'Use this one graph.' }] }, answerFields: [{ id: 'x', label: 'x-intercept' }], directionSteps: ['Find where y = 0.'] });
  assert.deepEqual(text.stem.map((segment) => segment.field), ['prompt', 'stimulus.panels[0].title', 'stimulus.panels[0].note']);
  assert.deepEqual(text.parts.map((segment) => segment.field), ['answerFields[0].label', 'directionSteps[0]']);
});

test('backReferences finds the pointer itself, and nothing in plain mathematics', () => {
  const text = 'Use the slope you found and your answer to Question 2.';
  assert.deepEqual(backReferences(text).map(({ start, end }) => text.slice(start, end)), ['the slope you found', 'to Question 2']);
  assert.deepEqual(backReferences('Solve 3x + 4 = 19 and check your solution in the equation.'), []);
});

test('the note says what is wrong, why it matters to a student and how to fix it', () => {
  assert.equal(
    otherQuestionReferenceWarning(21, { quote: 'Use the prices you found' }),
    'Question 21 says "Use the prices you found", which needs an answer from another question. A student who meets this question first, or without that one, has nothing to use. Repeat the value in this prompt, or make the two questions one multi-part question.',
  );
  const audit = auditAssignmentOtherQuestionReferences([
    item('Solve 2s + 2a = 48 and 3s + a = 40.'),
    item('Use the prices you found.'),
    { ...item('Use the prices you found.'), teacherExcluded: true },
  ]);
  assert.deepEqual(audit.findings, [{ questionNumber: 2, questionId: null, field: 'prompt', quote: 'Use the prices you found' }]);
  assert.deepEqual(audit.warnings, [otherQuestionReferenceWarning(2, { quote: 'Use the prices you found' })]);
  // An excluded question is never delivered, so it is not judged (Pre-Flight's deliveredOnly).
  assert.equal(auditAssignmentOtherQuestionReferences([{ ...item('Use the prices you found.'), teacherExcluded: true }]).warnings.length, 0);
  assert.equal(auditAssignmentOtherQuestionReferences([{ ...item('Use the prices you found.'), teacherExcluded: true }], { deliveredOnly: false }).warnings.length, 1);
});

const lessonWith = (questions) => ({
  schemaVersion: 5,
  assignment: { title: 'Ticket prices', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  sections: [{
    id: 'classwork',
    role: 'classwork',
    title: 'Classwork',
    questions: questions.map((question, index) => ({ questionId: `q${index + 1}`, dok: 2, alignments: [{ framework: 'teks', code: 'A.5C', role: 'primary', evidenceLevel: 'assessed' }], ...question })),
  }],
});
const ticketQuestions = (secondPrompt) => [
  { type: 'multiAnswer', prompt: 'Two student tickets and two adult tickets cost $48. Three student tickets and one adult ticket cost $40. Find each price.', answerFields: [{ id: 's', label: 'Student ticket ($)', answer: '8', inputProfile: 'number' }, { id: 'a', label: 'Adult ticket ($)', answer: '16', inputProfile: 'number' }] },
  { type: 'multiAnswer', prompt: secondPrompt, answerFields: [{ id: 'c', label: 'What should Mia charge for 5 student and 3 adult tickets, in dollars?', answer: '88', inputProfile: 'number' }] },
];

test('Pre-Flight carries the note as advice: counted, never a readiness warning, never a block', () => {
  const flagged = buildAssignmentV5PreflightModel(lessonWith(ticketQuestions('Use the prices you found.')));
  const plain = buildAssignmentV5PreflightModel(lessonWith(ticketQuestions('Use the prices you found: a student ticket costs $8 and an adult ticket costs $16.')));
  assert.deepEqual(flagged.otherQuestionReferences.warnings, [otherQuestionReferenceWarning(2, { quote: 'Use the prices you found' })]);
  assert.deepEqual(plain.otherQuestionReferences.warnings, []);
  // Readiness is exactly the fixed lesson's: no warning, no error, no "Needs Review".
  assert.deepEqual(flagged.errors, plain.errors);
  assert.deepEqual(flagged.warnings, plain.warnings);
  assert.equal(flagged.isValid, true);
  // The control is clean, so "ready" here is the note changing nothing: a
  // warning diagnostic would have made it needsReview.
  assert.equal(plain.authoringState, AUTHORING_STATES.READY);
  assert.equal(flagged.authoringState, AUTHORING_STATES.READY);
  assert.ok(!flagged.diagnostics.some((entry) => /another question/.test(entry.message)));
  // Counted with the other suggestions.
  assert.equal(flagged.advisory.groups.find(({ id }) => id === 'otherQuestionReferences')?.count, 1);
  assert.equal(flagged.advisory.total - plain.advisory.total, 1);
});

test('the Pre-Flight screen shows the note in its own panel, saying it does not stop publishing', () => {
  const modal = executableSource(componentSource('src/components/teacher/LessonPreflightModal.jsx'));
  const panel = region(modal, '{preflightModel.otherQuestionReferences?.warnings?.length > 0 && (', '\n      )}', 'the other-question panel');
  assert.match(panel, /data-other-question-reference-panel="true"/);
  assert.match(panel, />Questions that need another question&apos;s answer</);
  assert.match(panel, /preflightModel\.otherQuestionReferences\.warnings\.map\(\(warning\) => <li key=\{warning\}>\{warning\}<\/li>\)/);
  assert.match(panel, /This does not stop you publishing\./);
  const model = executableSource(componentSource('src/platform/preflight/assignmentV5PreflightModel.js'));
  const groups = region(model, 'const diagnosticGroups = [', '  ];', 'diagnostic groups');
  assert.doesNotMatch(groups, /otherQuestionReferences/);
});

test('the prompt notes are teacher code: none of them is in a student\'s first load', () => {
  const graph = firstLoadGraph();
  assert.ok(graph.has(path.join(repo, 'src/App.jsx')) && graph.size > 200, `only ${graph.size} modules reached`);
  for (const file of [
    'src/platform/preflight/questionScreenText.js',
    'src/platform/preflight/otherQuestionReferencePreflight.js',
    'src/platform/preflight/graphingCalculatorPromptPreflight.js',
  ]) {
    const key = path.join(repo, file);
    assert.ok(!graph.has(key), `${file} is in the first load: ${graph.has(key) ? chainTo(graph, key) : ''}`);
  }
});

// A GRADER'S DETAILS TEXT NEVER CARRIES ITS ANSWER KEY (student pass 3, wave 7
// review, B1).
//
// Each grader publishes `questionDetails` with its answer state. QuestionEngine
// hands it to the Work View's scratchpad, which shows it to the student under
// "Current question" — before they answer, and on an exit ticket or a test too.
// OrderedPairGrader's ended "Plotted coordinate: (2, 3)." — the answer.
//
// Each grader below is run once (helpers/shallowComponent.mjs: its hooks run,
// its effect publishes) with a distinctive key that appears nowhere in its
// task, and the details it publishes on that first render, before anything is
// typed, must not contain the key. The task itself (the prompt, a system's
// equations, a literal formula) may be quoted: the student is shown it.

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startShallowLoader } from './helpers/shallowComponent.mjs';

let loader = null;
before(async () => { loader = await startShallowLoader(); });
after(async () => { await loader?.close(); });

/** What a grader publishes on its first render, with no answer typed. */
const publishedDetails = async (file, question) => {
  const Grader = (await loader.ssrLoadModule(file)).default;
  const published = [];
  Grader({ question, onStateChange: (state) => published.push(state), onUndoStateChange: () => {}, feedback: null, draftKey: null });
  assert.ok(published.length, `${file} published its answer state`);
  return String(published.at(-1).questionDetails ?? '');
};

// Distinctive numbers that no prompt below contains.
const CASES = [
  ['/src/OrderedPairGrader.jsx', 'an ordered pair keyed [x, y]', { type: 'orderedPair', prompt: 'Where do the two lines meet?', answer: [47, -83] }, ['47', '83']],
  ['/src/OrderedPairGrader.jsx', 'an ordered pair keyed as text', { type: 'orderedPair', prompt: 'Where do the two lines meet?', answer: '(47,-83)' }, ['47', '83']],
  ['/src/OrderedPairGrader.jsx', 'an ordered pair keyed as a solution', { type: 'orderedPair', prompt: 'Where do the two lines meet?', solution: [47, -83] }, ['47', '83']],
  ['/src/SystemGrader.jsx', 'a system', { type: 'system', prompt: 'Solve the system.', solution: [61, -29], equationsLatex: ['x+y=32', 'x-y=90'] }, ['61', '29']],
  ['/src/LiteralGrader.jsx', 'a literal equation', { type: 'literal', prompt: 'Solve for w.', formula: 'P = 2l + 2w', solveFor: 'w', acceptedAnswers: ['w=(P-2l)/2', '7319'] }, ['(P-2l)/2', '7319']],
  ['/src/MultiAnswerGrader.jsx', 'answer fields', { type: 'multiAnswer', prompt: 'Find the slope and the intercept.', answerFields: [{ id: 'm', label: 'Slope', answer: '-8317/5' }, { id: 'b', label: 'Intercept', answer: '6421' }] }, ['8317', '6421']],
  ['/src/FractionGrader.jsx', 'an authored fraction', { type: 'fraction', prompt: 'Simplify the fraction on the card.', answer: '53/71' }, ['53', '71']],
  ['/src/TableGrader.jsx', 'a table', { type: 'table', prompt: 'Complete the table.', table: { columns: [{ key: 'x', label: 'x' }, { key: 'y', label: 'y' }], rows: [{ x: 1, y: 2 }, { x: 4, y: null }], answers: { '1:y': 9137 } } }, ['9137']],
  ['/src/NumberLine.jsx', 'a number line', { type: 'numberLine', prompt: 'Plot the temperature from the story.', target: 7.375 }, ['7.375']],
];

for (const [file, label, question, keyParts] of CASES) {
  test(`${label}: the details the Work View shows never contain the key (${file.split('/').at(-1)})`, async () => {
    const details = await publishedDetails(file, question);
    assert.ok(details.startsWith(String(question.prompt)), `the details still name the task: ${details}`);
    keyParts.forEach((part) => assert.ok(!details.includes(part), `"${part}" (the key) is in: ${details}`));
  });
}

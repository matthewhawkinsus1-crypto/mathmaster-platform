/*
 * THE CARD SORT, AS A STUDENT MEETS IT (student UX pass, R-9).
 *
 *   - Groups are named for what is being sorted: PR #397's second warm-up
 *     asked students to sort cards "into the situation it describes" under
 *     buttons that said Line A and Line B.
 *   - A TABLE card kind: compact read-only x/y rows, validated against the
 *     set's line like every other card, opt-in so no existing assignment
 *     changes.
 *   - Every card's accessible name says what the card SAYS; every equation
 *     used to be read as "Slope-intercept equation card, currently
 *     Unassigned".
 *   - Cards are laid out in bands of like size, so a graph no longer leaves
 *     250px of empty space under the equations in its row.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LINEAR_CARD_KINDS,
  buildLinearConnectionCards,
  canonicalLineForSet,
  describeLinearCard,
  inconsistentLinearCardKinds,
  linearGroupLabels,
  linearGroupNoun,
  linearTableRows,
  scoreLinearConnectionGrouping,
} from '../../src/tools/representationMatch/representationMath.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { executableSource } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const final = JSON.parse(read('docs/assignments/algebra1-linear-multiple-representations-final-v5.json'));
const warmup = (id) => final.sections[0].questions.find((question) => question.questionId === id).representations;

test('groups are named for what the task sorts', () => {
  // WU-2 sorts two situations; WU-1 sorts two lines.
  assert.deepEqual(linearGroupLabels(warmup('lmr-wu-2'), warmup('lmr-wu-2').sets), ['Situation A', 'Situation B']);
  assert.deepEqual(linearGroupLabels(warmup('lmr-wu-1'), warmup('lmr-wu-1').sets), ['Line A', 'Line B']);
  assert.equal(linearGroupNoun({ groupNoun: 'plan' }, []), 'Plan');
  assert.deepEqual(linearGroupLabels({}, [{ label: "Maya's savings" }, {}]), ["Maya's savings", 'Line B']);
});

test('the sort UI uses those names and no hard-coded "Line"', () => {
  const source = executableSource(read('src/tools/representationMatch/RepresentationMatch.jsx'));
  const sort = source.slice(source.indexOf("linearTask === 'group' ? <div className=\"mathmaster-line-sort\""), source.indexOf("linearTask === 'findMismatch' ? <>"));
  assert.ok(sort.length > 500, 'found the sort block');
  assert.doesNotMatch(sort, /Line \{/, 'no "Line {label}" left in the sort');
  assert.match(sort, /\{lineLabels\.map\(\(label, index\) => \(/);
  assert.match(source, /const lineLabels = useMemo\(\(\) => linearGroupLabels\(questionData, sets\), \[questionData, sets\]\);/);
});

test('a table card is built only where the author wrote one, in any accepted shape', () => {
  assert.ok(LINEAR_CARD_KINDS.includes('table'));
  const set = { id: 'a', slopeIntercept: 'y = 2x + 10', graphSpec: { type: 'linear', a: 2, h: 0, k: 10 } };
  assert.deepEqual(buildLinearConnectionCards([set]).map((card) => card.kind).sort(), ['graph', 'slopeIntercept'], 'no table authored, no table card');
  for (const table of [
    [{ x: 0, y: 10 }, { x: 1, y: 12 }],
    [[0, 10], [1, 12]],
    { points: [{ x: 0, y: 10 }, { x: 1, y: 12 }] },
    '(0, 10), (1, 12)',
    { xValues: [0, 1] },
  ]) {
    assert.deepEqual(linearTableRows(table, set), [[0, 10], [1, 12]], JSON.stringify(table));
    const card = buildLinearConnectionCards([{ ...set, table }]).find((entry) => entry.kind === 'table');
    assert.deepEqual(card?.value, [[0, 10], [1, 12]]);
  }
  assert.equal(linearTableRows([[0, 10], [0, 12]], set), null, 'repeated x');
  assert.equal(linearTableRows([[0, 10]], set), null, 'one row is not a table');
  assert.equal(linearTableRows(Array.from({ length: 7 }, (_, x) => [x, x]), set), null, 'a card holds at most six rows');
});

test('a table card is checked against its line like any other card, and can define one', () => {
  const set = { id: 'a', slopeIntercept: 'y = -3x + 20', table: [{ x: 0, y: 20 }, { x: 1, y: 17 }] };
  assert.deepEqual(inconsistentLinearCardKinds(set), []);
  assert.deepEqual(inconsistentLinearCardKinds({ ...set, table: [{ x: 0, y: 20 }, { x: 1, y: 18 }] }), ['table']);
  const tableOnly = { id: 't', context: 'A tub drains.', table: [{ x: 0, y: 40 }, { x: 2, y: 32 }] };
  assert.equal(canonicalLineForSet(tableOnly)?.m?.n, -4);
});

test('the authoring validator accepts a table and a group name and explains a bad one', () => {
  const question = (sets, extra = {}) => ({ type: 'representationMatch', mode: 'linearConnections', task: 'group', cardKinds: ['context', 'table', 'slopeIntercept'], sets, ...extra });
  const good = [
    { id: 'p', label: 'Phone plan', context: 'A plan costs $10 plus $2 per GB.', slopeIntercept: 'y = 2x + 10', table: [{ x: 0, y: 10 }, { x: 1, y: 12 }] },
    { id: 'c', context: 'A candle burns 3 cm an hour.', slopeIntercept: 'y = -3x + 20', table: { xValues: [0, 1, 2] } },
  ];
  const accepted = validateToolQuestion(question(good, { groupNoun: 'Situation' }));
  assert.deepEqual(accepted.errors, []);
  const badTable = validateToolQuestion(question([{ ...good[0], table: [{ x: 1, y: 12 }] }, good[1]])).errors;
  assert.ok(badTable.some((error) => /table must list 2–6 rows/.test(error)), badTable.join('\n'));
  const badLabel = validateToolQuestion(question([{ ...good[0], label: '' }, good[1]])).errors;
  assert.ok(badLabel.some((error) => /label must be a short name/.test(error)), badLabel.join('\n'));
  const badNoun = validateToolQuestion(question(good, { groupNoun: 'x'.repeat(30) })).errors;
  assert.ok(badNoun.some((error) => /groupNoun must be a short word/.test(error)), badNoun.join('\n'));
});

test('every card is announced with what it says', () => {
  const bounds = { xMin: -6, xMax: 6, yMin: -6, yMax: 6 };
  assert.equal(describeLinearCard({ kind: 'slopeIntercept', value: 'y = 2x - 4' }), 'y = 2x - 4');
  assert.equal(describeLinearCard({ kind: 'slope', value: -4 }), 'm = -4');
  assert.equal(describeLinearCard({ kind: 'xIntercept', value: [2, 0] }), '(2, 0)');
  assert.equal(describeLinearCard({ kind: 'table', value: [[0, 20], [1, 17]] }), 'x and y values 0, 20; 1, 17');
  assert.equal(describeLinearCard({ kind: 'graph', value: { type: 'linear', a: 2, h: 0, k: -4 } }, { bounds }), 'a line through (0, -4) and (1, -2)');
  const source = executableSource(read('src/tools/representationMatch/RepresentationMatch.jsx'));
  assert.match(source, /aria-label=\{`\$\{LINEAR_KIND_LABELS\[card\.kind\]\}: \$\{describeLinearCard\(card, \{ bounds: linearGraphBounds \}\)\}\./);
});

test('cards are laid out in bands of like size, and the deck keeps its shuffle', () => {
  const source = executableSource(read('src/tools/representationMatch/RepresentationMatch.jsx'));
  const bands = source.slice(source.indexOf('const LINEAR_CARD_BANDS = ['), source.indexOf('];', source.indexOf('const LINEAR_CARD_BANDS = [')));
  // Every kind a card can be is in exactly one band — no card can vanish.
  const kinds = [...bands.matchAll(/kinds: \[([^\]]*)\]/g)].flatMap((match) => [...match[1].matchAll(/'([a-zA-Z]+)'/g)].map((kind) => kind[1]));
  assert.deepEqual([...kinds].sort(), [...LINEAR_CARD_KINDS].sort());
  assert.match(source, /const bandCards = linearGroupCards\.filter\(\(card\) => band\.kinds\.includes\(card\.kind\)\);/, 'bands filter the shuffled deck in order');
});

test('grading is unchanged: the partition, not the slot names, is scored', () => {
  const sets = warmup('lmr-wu-2').sets;
  const cards = buildLinearConnectionCards(sets, warmup('lmr-wu-2').cardKinds);
  const bySet = Object.fromEntries(cards.map((card) => [card.id, card.setId === sets[0].id ? 1 : 0]));
  assert.equal(scoreLinearConnectionGrouping(cards, bySet).isCorrect, true);
});

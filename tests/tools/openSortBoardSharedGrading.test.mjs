import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import openSortBoardGrader from '../../functions/shared/serverGrading/tools/openSortBoard.mjs';
import declaration from '../../functions/shared/serverGrading/declarations/openSortBoard.mjs';
import { GRADING_AUTHORITY, GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse, serverResponseGradingSupport } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { openSortSettings } from '../../functions/shared/toolMath/openSortBoard/openSortMath.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * OPEN SORT BOARD IS MARKED BY ONE SHARED GRADER, ON BOTH SIDES.
 *
 * The board's Check (gradeToolCheck) and the server's ingestion
 * (gradeServerResponse, fed the exact toolResponse the browser produced) must
 * reach the same verdict, completeness, score and parts for both boards — and
 * that verdict is the one the board's old inline Check reached: an exact
 * authored partition (open) or exact categories (controlled), with every used
 * group named and explained, scored 1 for an exact sort and otherwise by
 * agreement scaled by the share of cards placed.
 */

const COMPONENT = 'src/tools/openSortBoard/OpenSortBoard.jsx';
const code = executableSource(fs.readFileSync(COMPONENT, 'utf8'));

const TYPE = 'openSortBoard';

/** Grade through the browser path and the server path; assert they agree exactly. */
const grade = (question, work) => {
  const browser = gradeToolCheck(openSortBoardGrader, question, work);
  assert.ok(browser.toolResponse, 'the browser path always produces a tool response for the server');
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded, browser.graded, 'graded');
  assert.equal(server.isCorrect, browser.isCorrect, 'isCorrect');
  assert.equal(server.isComplete, browser.isComplete, 'isComplete');
  assert.equal(server.score, browser.score, 'score');
  assert.deepEqual(server.parts, browser.parts, 'parts');
  if (!browser.graded) assert.equal(server.reason, browser.reason, 'ungraded reason');
  return { ...browser, mode: server.mode, serverReason: server.reason };
};
const part = (result, id) => result.parts.find((entry) => entry.id === id);

/* ------------------------------------------------------------------ */
/* fixtures                                                            */
/* ------------------------------------------------------------------ */

const ITEMS = ['A', 'B', 'C', 'D', 'E', 'F'].map((id) => ({ id, label: `Card ${id}`, text: `graph ${id}` }));
const SCHEMES = [
  { id: 'family', groups: [{ itemIds: ['A', 'B'] }, { itemIds: ['C', 'D'] }, { itemIds: ['E', 'F'] }] },
  { id: 'behavior', groups: [{ itemIds: ['A', 'E'] }, { itemIds: ['B', 'F'] }, { itemIds: ['C', 'D'] }] },
];
const openQuestion = (fields = {}) => ({ type: TYPE, items: ITEMS, validSchemes: SCHEMES, ...fields });

const named = (itemIds, index = 0, extra = {}) => ({
  id: `group-${index + 1}`,
  name: ['increasing', 'decreasing', 'turning', 'flat', 'other'][index] || 'group',
  rationale: 'every graph here rises from left to right',
  itemIds,
  ...extra,
});
const board = (...partition) => ({ groups: partition.map((itemIds, index) => named(itemIds, index)) });

const CATEGORIES = [
  { id: 'positive', label: 'Positive correlation' },
  { id: 'negative', label: 'Negative correlation' },
  { id: 'none', label: 'No correlation' },
];
const CONTROLLED_SCHEMES = [{
  id: 'direction',
  groups: [
    { id: 'positive', itemIds: ['A', 'D'] },
    { id: 'negative', itemIds: ['B', 'E'] },
    { id: 'none', itemIds: ['C', 'F'] },
  ],
}];
const controlledQuestion = (fields = {}) => ({
  type: TYPE, mode: 'controlled', items: ITEMS, categories: CATEGORIES, validSchemes: CONTROLLED_SCHEMES, ...fields,
});
// The controlled board starts with one group per category (id = category id,
// name = its label, rationale '').
const bins = (placement) => ({
  groups: CATEGORIES.map((category) => ({ id: category.id, name: category.label, rationale: '', itemIds: placement[category.id] || [] })),
});

/* ------------------------------------------------------------------ */
/* declaration and mode resolution                                     */
/* ------------------------------------------------------------------ */

test('both boards are declared shared-server, contract v1, default open', () => {
  assert.equal(GRADING_MANIFEST.openSortBoard, declaration);
  assert.equal(declaration.contractVersion, 1);
  assert.equal(declaration.defaultMode, 'open');
  assert.deepEqual(Object.keys(declaration.modes).sort(), ['controlled', 'open']);
  Object.values(declaration.modes).forEach((entry) => assert.equal(entry.authority, GRADING_AUTHORITY.SHARED_SERVER));
  assert.deepEqual([...openSortBoardGrader.problems], []);
  assert.equal(serverResponseGradingSupport(controlledQuestion()).supported, true);
  assert.equal(serverResponseGradingSupport(openQuestion()).supported, true);
});

test('the declaration resolves exactly the board the component renders', () => {
  // The component picks its board from openSortSettings(questionData).controlled
  // and renders `{controlled ? <fixed categories> : <open sort>}`.
  assert.match(code, /const settings = openSortSettings\(questionData\);/);
  assert.match(code, /const \{ controlled,[^}]*\} = settings;/);
  assert.match(code, /\{controlled \? \(/, 'the render branches on the same `controlled`');
  const componentMode = (question) => (openSortSettings(question).controlled ? 'controlled' : 'open');
  for (const mode of [undefined, null, '', 'controlled', 'open', 'Controlled', ' controlled', 'sort', 5, true]) {
    const question = { type: TYPE, mode };
    assert.equal(resolveToolMode(declaration, question), componentMode(question), `mode ${JSON.stringify(mode)}`);
  }
  assert.equal(resolveToolMode(declaration, { mode: 'controlled' }), 'controlled');
  assert.equal(resolveToolMode(declaration, { mode: 'Controlled' }), 'open', 'mis-cased renders the open sort');
});

/* ------------------------------------------------------------------ */
/* open sort                                                           */
/* ------------------------------------------------------------------ */

test('open: an authored partition, named and explained, is correct in any group order, card order or naming', () => {
  const result = grade(openQuestion(), board(['A', 'B'], ['C', 'D'], ['E', 'F']));
  assert.equal(result.graded, true);
  assert.equal(result.mode, 'open');
  assert.equal(result.isCorrect, true);
  assert.equal(result.isComplete, true);
  assert.equal(result.score, 1);
  assert.deepEqual(result.parts.map((entry) => entry.id), ['partition', 'names', 'rationale']);
  assert.equal(part(result, 'names').graded, false, 'names are required, not judged');
  assert.equal(part(result, 'rationale').graded, false, 'explanations are required, not judged');

  // The second authored scheme, groups and cards shuffled, own group ids.
  const reordered = {
    groups: [
      named(['D', 'C'], 2, { id: 'group-1712345678901' }),
      named(['F', 'B'], 1),
      named(['E', 'A'], 0, { name: 'zz' }),
    ],
  };
  const second = grade(openQuestion(), reordered);
  assert.equal(second.isCorrect, true);
  assert.equal(second.score, 1);

  // Numeric authored item ids are placed as their string ids by the board.
  const numeric = grade(
    { type: TYPE, items: [1, 2, 3, 4].map((id) => ({ id })), validSchemes: [{ id: 's', groups: [{ itemIds: [1, 2] }, { itemIds: [3, 4] }] }] },
    board(['2', '1'], ['4', '3']),
  );
  assert.equal(numeric.isCorrect, true);
});

test('open: a complete partition that matches no scheme is incorrect with pair-agreement credit', () => {
  const result = grade(openQuestion(), board(['A', 'B', 'C'], ['D', 'E', 'F']));
  assert.equal(result.isCorrect, false);
  assert.equal(result.isComplete, true, 'every card placed, named and explained');
  // Best scheme (family) of 15 card pairs: together in both A–B, E–F; apart in
  // both for 8 more; the response joins A–C, B–C, D–E, D–F and splits C–D → 10/15.
  // ("behavior" agrees on only 6/15.)
  assert.equal(result.score, 10 / 15);
  assert.equal(part(result, 'partition').isCorrect, false);
  assert.equal(part(result, 'partition').credit, 10 / 15);
});

test('open: unplaced cards are incomplete, and credit is scaled by the share placed', () => {
  // A,B | C,D placed; E,F unplaced. Against "family" only the E–F pair
  // disagrees (14/15), scaled by the 4 of 6 cards placed.
  const result = grade(openQuestion(), board(['A', 'B'], ['C', 'D']));
  assert.equal(result.isComplete, false);
  assert.equal(result.isCorrect, false);
  assert.equal(part(result, 'partition').isComplete, false);
  assert.ok(Math.abs(result.score - (14 / 15) * (4 / 6)) < 1e-12, String(result.score));

  const empty = grade(openQuestion(), { groups: [named([], 0), named([], 1)] });
  assert.equal(empty.graded, true, 'an explicit Check on an empty board is still graded');
  assert.equal(empty.isComplete, false);
  assert.equal(empty.isCorrect, false);
  assert.equal(empty.score, 0);
});

test('open: an exact partition with a missing name or a short explanation is not correct, exactly as before', () => {
  const unnamed = board(['A', 'B'], ['C', 'D'], ['E', 'F']);
  unnamed.groups[1].name = ' x ';
  const noName = grade(openQuestion(), unnamed);
  assert.equal(noName.isCorrect, false);
  assert.equal(noName.isComplete, false);
  assert.equal(part(noName, 'partition').isCorrect, true);
  assert.equal(part(noName, 'names').isComplete, false);
  // The board scored an exact partition 1 regardless (its Check was disabled
  // until names and explanations were complete, so this never reached a grade).
  assert.equal(noName.score, 1);

  const terse = board(['A', 'B'], ['C', 'D'], ['E', 'F']);
  terse.groups[0].rationale = 'goes up';
  const short = grade(openQuestion(), terse);
  assert.equal(short.isCorrect, false);
  assert.equal(part(short, 'rationale').isComplete, false);

  // The authored minimum and the opt-outs are honoured.
  assert.equal(grade(openQuestion({ rationaleMinLength: 5 }), terse).isCorrect, true);
  assert.equal(grade(openQuestion({ requireRationale: false }), terse).isCorrect, true);
  assert.equal(grade(openQuestion({ requireGroupNames: false }), unnamed).isCorrect, true);
  // An unused (empty) group needs neither a name nor an explanation.
  const withSpare = board(['A', 'B'], ['C', 'D'], ['E', 'F']);
  withSpare.groups.push({ id: 'group-9', name: '', rationale: '', itemIds: [] });
  assert.equal(grade(openQuestion(), withSpare).isCorrect, true);
});

test('open: completeness is the board\'s Check gate, including the authored minimum number of groups', () => {
  const twoGroups = { type: TYPE, items: ITEMS, validSchemes: [{ id: 'halves', groups: [{ itemIds: ['A', 'B', 'C'] }, { itemIds: ['D', 'E', 'F'] }] }] };
  const halves = board(['A', 'B', 'C'], ['D', 'E', 'F']);
  assert.equal(grade(twoGroups, halves).isComplete, true);
  const needsThree = grade({ ...twoGroups, minGroups: 3 }, halves);
  assert.equal(needsThree.isComplete, false, 'two used groups when three are required');
  assert.equal(needsThree.isCorrect, true, 'the partition itself is still an authored scheme');
  const oneGroup = grade(twoGroups, board(['A', 'B', 'C', 'D', 'E', 'F']));
  assert.equal(oneGroup.isComplete, false, 'the default minimum is two groups');
});

test('open: an unauthored question grades nothing as correct, with the board\'s defaults', () => {
  const noSchemes = grade({ type: TYPE, items: ITEMS }, board(['A', 'B'], ['C', 'D'], ['E', 'F']));
  assert.equal(noSchemes.graded, true);
  assert.equal(noSchemes.isCorrect, false);
  assert.equal(noSchemes.score, 0);
  assert.equal(noSchemes.isComplete, true, 'default: two groups, names of 2+, explanations of 12+');
  const bare = grade({ type: TYPE }, { groups: [] });
  assert.equal(bare.graded, true);
  assert.equal(bare.isCorrect, false);
  assert.equal(bare.score, 0);
  assert.equal(bare.isComplete, false, 'no cards, no groups: fewer than the default two groups');
  assert.deepEqual(
    { ...openSortSettings({}), categories: undefined },
    { controlled: false, categories: undefined, minGroups: 2, maxGroups: 5, rationaleMinLength: 12, requireRationale: true, requireGroupNames: true },
  );
});

/* ------------------------------------------------------------------ */
/* controlled sort                                                     */
/* ------------------------------------------------------------------ */

test('controlled: every card in its category is correct, in any card order; names are not required', () => {
  const result = grade(controlledQuestion(), bins({ positive: ['D', 'A'], negative: ['E', 'B'], none: ['F', 'C'] }));
  assert.equal(result.mode, 'controlled');
  assert.equal(result.isCorrect, true);
  assert.equal(result.isComplete, true);
  assert.equal(result.score, 1);
  assert.equal(part(result, 'names').isComplete, true);
  assert.equal(part(result, 'rationale').isComplete, true);
});

test('controlled: swapped bins are wrong, scored by the share of cards in their category', () => {
  const swapped = grade(controlledQuestion(), bins({ positive: ['B', 'E'], negative: ['A', 'D'], none: ['C', 'F'] }));
  assert.equal(swapped.isCorrect, false);
  assert.equal(swapped.isComplete, true);
  assert.equal(swapped.score, 2 / 6);
  const oneOff = grade(controlledQuestion(), bins({ positive: ['A', 'D', 'C'], negative: ['B', 'E'], none: ['F'] }));
  assert.equal(oneOff.score, 5 / 6);
});

test('controlled: unplaced cards are incomplete and scaled by the share placed', () => {
  const partial = grade(controlledQuestion(), bins({ positive: ['A', 'D'], negative: ['B'] }));
  assert.equal(partial.isComplete, false);
  assert.equal(partial.isCorrect, false);
  assert.equal(part(partial, 'partition').isComplete, false);
  assert.equal(partial.score, (3 / 6) * (3 / 6));
  const empty = grade(controlledQuestion(), bins({}));
  assert.equal(empty.graded, true);
  assert.equal(empty.isComplete, false);
  assert.equal(empty.score, 0);
});

test('controlled: a group whose id is not an authored category earns nothing', () => {
  const result = grade(controlledQuestion(), {
    groups: [
      { id: 'positive', name: 'Positive correlation', rationale: '', itemIds: ['A', 'D'] },
      { id: 'negative', name: 'Negative correlation', rationale: '', itemIds: ['B', 'E'] },
      { id: 'invented', name: 'No correlation', rationale: '', itemIds: ['C', 'F'] },
    ],
  });
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, 4 / 6);
});

/* ------------------------------------------------------------------ */
/* discrimination                                                      */
/* ------------------------------------------------------------------ */

test('discrimination: correct work fails against a question whose key was altered', () => {
  const work = board(['A', 'B'], ['C', 'D'], ['E', 'F']);
  assert.equal(grade(openQuestion({ validSchemes: [SCHEMES[0]] }), work).isCorrect, true);
  const altered = openQuestion({ validSchemes: [{ id: 'family', groups: [{ itemIds: ['A', 'C'] }, { itemIds: ['B', 'D'] }, { itemIds: ['E', 'F'] }] }] });
  assert.equal(grade(altered, work).isCorrect, false);

  const sorted = bins({ positive: ['A', 'D'], negative: ['B', 'E'], none: ['C', 'F'] });
  assert.equal(grade(controlledQuestion(), sorted).isCorrect, true);
  const flipped = controlledQuestion({
    validSchemes: [{ id: 'direction', groups: [
      { id: 'positive', itemIds: ['B', 'E'] },
      { id: 'negative', itemIds: ['A', 'D'] },
      { id: 'none', itemIds: ['C', 'F'] },
    ] }],
  });
  assert.equal(grade(flipped, sorted).isCorrect, false);
});

/* ------------------------------------------------------------------ */
/* malformed, tampered and oversize work                                */
/* ------------------------------------------------------------------ */

test('tampered verdict and key fields are dropped and change nothing', () => {
  const wrong = board(['A', 'B', 'C'], ['D', 'E', 'F']);
  const tampered = { ...wrong, isCorrect: true, score: 1, expected: SCHEMES, answerKey: SCHEMES, verdict: 'correct' };
  assert.deepEqual(boundToolWork(tampered).dropped.sort(), ['answerKey', 'expected', 'isCorrect', 'score', 'verdict']);
  const result = grade(openQuestion(), tampered);
  assert.equal(result.isCorrect, false);
  assert.equal(result.score, grade(openQuestion(), wrong).score);
  // Injected per-group verdicts are dropped too.
  const groupTamper = { groups: wrong.groups.map((group) => ({ ...group, correct: true, checks: [true] })) };
  assert.equal(grade(openQuestion(), groupTamper).isCorrect, false);
});

test('SECURITY: a card id not on the board, or a card in several groups, is no placement', () => {
  // Before: the shared scorers counted every id in the work towards "the share
  // of cards placed", and a controlled sort credited a card for every bin it
  // sat in. Neither can come from the board: it only offers the question's
  // cards, and placing one removes it from every other group.
  const invented = ['X1', 'X2', 'X3', 'X4', 'X5', 'X6'];
  const phantom = grade(openQuestion(), board(invented.slice(0, 3), invented.slice(3)));
  assert.equal(phantom.score, 0, 'six invented ids on an untouched board earned 0.8');
  assert.equal(phantom.isComplete, false);
  assert.equal(part(phantom, 'partition').response, '', 'no group holds a card');

  const everywhere = grade(controlledQuestion(), bins({ positive: ['A', 'B', 'C', 'D', 'E', 'F'], negative: ['A', 'B', 'C', 'D', 'E', 'F'], none: ['A', 'B', 'C', 'D', 'E', 'F'] }));
  assert.equal(everywhere.score, 0, 'every card in every bin earned full partial credit');
  assert.equal(everywhere.isCorrect, false);
  assert.equal(everywhere.isComplete, false);

  // Padding a real but partial sort with invented ids buys nothing: it scores
  // exactly the cards actually placed.
  const honest = grade(controlledQuestion(), bins({ positive: ['A'], negative: ['B'] }));
  const padded = grade(controlledQuestion(), bins({ positive: ['A', 'X1', 'X2', 'X3'], negative: ['B', 'X4'] }));
  assert.equal(padded.score, honest.score);
  assert.equal(honest.score, (2 / 6) * (2 / 6));

  // A card claimed twice is unplaced; the rest of the board is scored as is.
  const twice = grade(openQuestion(), board(['A', 'B', 'C', 'D'], ['C', 'D', 'E', 'F']));
  const withoutCD = grade(openQuestion(), board(['A', 'B'], ['E', 'F']));
  assert.equal(twice.isComplete, false);
  assert.equal(twice.score, withoutCD.score);
  // A card listed twice inside ONE group is still one placement.
  assert.equal(grade(openQuestion(), board(['A', 'B', 'A'], ['C', 'D'], ['E', 'F'])).isCorrect, true);
  // A stale id (a card removed from the question after the board was saved)
  // no longer makes an otherwise exact sort wrong.
  assert.equal(grade(openQuestion(), board(['A', 'B', 'retired-card'], ['C', 'D'], ['E', 'F'])).isCorrect, true);
});

test('malformed work is graded as the empty values it stands for, never crashes', () => {
  const cases = [
    { groups: 'A,B|C,D' },
    { groups: { 0: { itemIds: ['A'] } } },
    { groups: [null, 7, 'x', ['A', 'B']] },
    { groups: [{ id: 3, name: 42, rationale: ['why'], itemIds: 'AB' }] },
    { groups: [{ itemIds: [{ id: 'A' }, null, true] }] },
    {},
  ];
  cases.forEach((work) => {
    const result = grade(openQuestion(), work);
    assert.equal(result.graded, true, JSON.stringify(work));
    assert.equal(result.isCorrect, false, JSON.stringify(work));
    assert.equal(result.isComplete, false, JSON.stringify(work));
    assert.equal(result.score, 0, JSON.stringify(work));
  });
  // A numeric group name is no name: the partition is right but not complete.
  const numericNames = { groups: board(['A', 'B'], ['C', 'D'], ['E', 'F']).groups.map((group) => ({ ...group, name: 12345 })) };
  const named12345 = grade(openQuestion(), numericNames);
  assert.equal(part(named12345, 'partition').isCorrect, true);
  assert.equal(named12345.isCorrect, false);
});

test('non-object work is not gradable', () => {
  for (const work of [null, undefined, 'groups', 42, [board(['A'])]]) {
    const result = grade(openQuestion(), work);
    assert.equal(result.graded, false, JSON.stringify(work));
    assert.equal(result.isCorrect, false);
    assert.equal(result.score, 0);
  }
});

test('oversize work is refused, and realistic maximal work fits the response limits', () => {
  // The largest realistic open board: the default five groups, 24 cards with
  // long ids, every explanation at the contract's 1,000-character cap.
  const items = Array.from({ length: 24 }, (_, index) => ({ id: `scatter-plot-card-${index + 1}` }));
  const ids = items.map((item) => item.id);
  const question = { type: TYPE, items, validSchemes: [{ id: 'five', groups: [0, 1, 2, 3, 4].map((g) => ({ itemIds: ids.filter((_, index) => index % 5 === g) })) }] };
  const maximal = {
    groups: [0, 1, 2, 3, 4].map((g) => ({
      id: `group-${1712345678901 + g}`,
      name: `A long but honest group name ${g}`,
      rationale: 'x'.repeat(1000),
      itemIds: ids.filter((_, index) => index % 5 === g),
    })),
  };
  const bounded = boundToolWork(maximal);
  assert.deepEqual(bounded.dropped, []);
  assert.equal(bounded.truncated, false);
  assert.ok(canonicalToolWorkJson(maximal).length < TOOL_RESPONSE_LIMITS.maxJsonLength);
  assert.equal(grade(question, maximal).isCorrect, true);

  const oversize = { groups: Array.from({ length: 30 }, (_, g) => ({ id: `g${g}`, name: 'name', rationale: 'y'.repeat(1000), itemIds: [] })) };
  assert.ok(canonicalToolWorkJson(oversize).length > TOOL_RESPONSE_LIMITS.maxJsonLength);
  const refused = grade(question, oversize);
  assert.equal(refused.graded, false);
  assert.equal(refused.reason, 'oversize-response');
  assert.equal(refused.serverReason, 'oversize-response');
});

test('realistic work carries no key and loses nothing at the boundary', () => {
  for (const work of [
    board(['A', 'B'], ['C', 'D'], ['E', 'F']),
    bins({ positive: ['A', 'D'], negative: ['B', 'E'], none: ['C', 'F'] }),
  ]) {
    const bounded = boundToolWork(work);
    assert.deepEqual(bounded.dropped, []);
    assert.equal(bounded.truncated, false);
    assert.deepEqual(bounded.work, work);
  }
});

/* ------------------------------------------------------------------ */
/* the board is wired to the shared grader                             */
/* ------------------------------------------------------------------ */

test('the board\'s Check computes its verdict only through the shared grader and submits its own work', () => {
  assert.match(code, /import openSortBoardGrader from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/openSortBoard\.mjs';/);
  assert.match(code, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';/);
  assert.match(code, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js';/);
  const check = region(code, 'const check = () => {', '\n  };', 'Check handler');
  assert.match(check, /const result = gradeToolCheck\(openSortBoardGrader, questionData, work\);/);
  assert.match(check, /submit\(\s*\{ isCorrect: result\.isCorrect, score: result\.score \},\s*work,/);
  assert.match(check, /parts: result\.parts/);
  assert.doesNotMatch(check, /score(?:Open|Controlled)Sort|matchedSchemeId|validSchemes/, 'no inline verdict and no key in the metadata');
  assert.doesNotMatch(code, /scoreOpenSort|scoreControlledSort/, 'the old inline scoring is gone');
  // The same work object is reported live (for deadlines) and submitted.
  assert.match(code, /const work = \{ groups: groups\.map\(\(\{ id, name, rationale, itemIds \}\) => \(\{ id, name, rationale, itemIds \}\)\) \};\s*useReportToolWork\(work\);/);
  // The Check gate is the grader's completeness.
  assert.match(code, /= openSortProgress\(\{ settings, items, groups \}\);/);
  assert.match(code, /onClick=\{check\} disabled=\{!ready\}/);
});

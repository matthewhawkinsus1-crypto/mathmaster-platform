/*
 * MY MATH PATH'S TOOL GRADERS AGAINST THE SHARED GRADERS, ON THE LIVE ITEMS (MP07).
 *
 * A My Math Path tool item is graded by its Path contract
 * (functions/shared/pathToolContracts.mjs); the same tool in an assignment is
 * graded by the shared grader the tool itself runs
 * (functions/shared/serverGrading/). Where the two disagree, one answer is
 * right in one place and wrong in the other. Every live item of the four tools
 * MP07 names — relation mapping, the systems workspace, the data modeling lab
 * and Step Algebra — is drawn by the production generator, issued as a student
 * meets it, answered with the tool's own work and graded both ways
 * (scripts/lib/pathToolParity.mjs).
 *
 * What this pins:
 *   - every right answer the tool can send is right on the Path. The one the
 *     Path marked wrong — a domain or range with a value typed twice, such as
 *     the range of a grade 8 relation typed as its pairs give it — is now read
 *     by the relation's one set rule (toolMath/relationMapping/relationSets.mjs);
 *   - no wrong answer the tool can send is right on the Path;
 *   - the disagreements still open on live items are exactly
 *     KNOWN_DIVERGENCES, each with the side that is right said beside it: a new
 *     one fails here, and so does closing one without taking it off the list;
 *   - the documented divergences no live item reaches stay unreached.
 *
 * Verdicts that move when a Path contract changes are listed, item by item, by
 * scripts/sweep-path-tool-verdicts.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARITY_TOOL_IDS,
  divergenceKey,
  liveToolItems,
  parityRows,
  pathVerdict,
  sharedVerdict,
  systemsModes,
} from '../../scripts/lib/pathToolParity.mjs';
import { buildPrivateToolGrading } from '../../functions/shared/pathToolContracts.mjs';
import { parseList } from '../../functions/shared/serverGrading/tools/relationMapping.mjs';
import { FUNCTION_STATUS_CHOICES } from '../../functions/shared/relationFunctionChoice.mjs';

const DRAWS = 3;
const { items, skipped } = await liveToolItems({ draws: DRAWS });
const rows = parityRows(items);
const where = (row) => `${row.courseId} ${row.id} ${row.draw ?? 'fixed'} ${row.mode ? `${row.mode} ` : ''}[${row.tag}]`;
const pathRight = (row) => !row.path.rejected && row.path.isCorrect;

/*
 * THE DISAGREEMENTS STILL OPEN ON LIVE ITEMS, and which side is right. None
 * is a right answer the Path marks wrong; each is a decision for its owner.
 */
const KNOWN_DIVERGENCES = Object.freeze({
  // Shapes today's tools never send.
  'relationMapping · a bare yes / no verdict · path-only':
    'The Yes / No select from before the reasons: the Path still reads a bare verdict (relationFunctionChoice.mjs); the lab sends only reasons.',
  'relationMapping · arrows sent as {x, y} · path-only':
    'Firestore\'s pair shape: the Path reads both shapes; the lab sends [x, y] and its grader reads only that.',
  'systemsWorkspace · inequalities · the test-point choice left blank · path-refuses':
    'The Path refuses work missing an asked part (no attempt spent); the shared grader marks it wrong. The workspace sends neither.',
  'systemsWorkspace · matrix3 · sent without the RREF technology · path-refuses':
    'As above, for the 3×3 technology step.',
  // Tolerances. Moving either onto the shared grader would turn a live right
  // answer wrong, so neither moves this way.
  'systemsWorkspace · linear · each coordinate a tenth off · path-only':
    'Right: the Path honours the item\'s numericTolerance (0.15 on the "estimate to the nearest tenth" items); the shared linear grader always uses 0.05.',
  'dataModelingLab · linearFitPrediction · the intercept 0.9 off · path-only':
    'Policy: the Path\'s typed-line intercept tolerance is max(0.8, 8% of |b|); the lab\'s is 0.8.',
});

test('the live items in scope were drawn, every tool MP07 names among them', (t) => {
  const byTool = Object.fromEntries(PARITY_TOOL_IDS.map((toolId) => [toolId, items.filter((item) => item.toolId === toolId)]));
  t.diagnostic(`${items.length} issued instances, ${rows.length} probes: ${PARITY_TOOL_IDS.map((toolId) => `${toolId} ${byTool[toolId].length}`).join(', ')}`);
  PARITY_TOOL_IDS.forEach((toolId) => assert.ok(byTool[toolId].length > 0, `no live ${toolId} item was drawn`));
  // A family that did not compile, or a draw that did not generate or issue,
  // would drop out of every check below.
  assert.deepEqual(skipped.map((entry) => `${entry.courseId} ${entry.id} ${entry.draw ?? 'fixed'}: ${entry.reason}`), []);
  // The three live relation families: the Algebra I domain-and-range and
  // non-function items, and the grade 8 mapping, whose range repeats a value.
  assert.deepEqual(
    [...new Set(byTool.relationMapping.map((item) => item.id))].sort(),
    ['mm_A_12A_v2_mapping-nonfunction', 'mm_A_2A_v2_discrete-mapping-domain-range', 'mm_gen_8_8_5G_mapping-function'],
  );
  assert.ok(rows.length > 1000, 'every live item was answered with several probes');
});

test('every key is right on the Path and in the shared grader', () => {
  const keys = rows.filter((row) => row.tag === 'key');
  assert.equal(keys.length, items.length, 'every item has a key probe');
  assert.deepEqual(keys.filter((row) => !pathRight(row) || !row.shared.isCorrect).map(where), []);
});

test('every right answer the tool can send is right on the Path', () => {
  const right = rows.filter((row) => row.intent === 'right');
  assert.ok(right.length > 500);
  assert.deepEqual(right.filter((row) => !pathRight(row)).map(where), []);
});

test('no wrong answer the tool can send is right on the Path, or in the shared grader', () => {
  const wrong = rows.filter((row) => row.intent === 'wrong');
  assert.ok(wrong.length > 300);
  assert.deepEqual(wrong.filter((row) => pathRight(row) || row.shared.isCorrect).map(where), []);
});

test('the graders disagree on live items exactly where KNOWN_DIVERGENCES says, and nowhere else', () => {
  const found = new Map();
  rows.forEach((row) => {
    const key = divergenceKey(row);
    if (key && !found.has(key)) found.set(key, where(row));
  });
  const unexpected = [...found.keys()].filter((key) => !KNOWN_DIVERGENCES[key]).map((key) => `${key} (first: ${found.get(key)})`);
  const closed = Object.keys(KNOWN_DIVERGENCES).filter((key) => !found.has(key));
  assert.deepEqual(unexpected, [], 'a new disagreement between the Path and the shared grader');
  assert.deepEqual(closed, [], 'a known disagreement no longer happens: take it off KNOWN_DIVERGENCES');
});

// --- MP07's move: a relation's domain and range are sets on the Path too -------

const relationItem = (id, predicate = () => true) => items.find((item) => item.id === id && predicate(item));
const pairsOf = (item) => item.question.pairs.map((pair) => [Number(pair.x), Number(pair.y)]);
const repeatsAnOutput = (item) => new Set(pairsOf(item).map(([, y]) => y)).size < pairsOf(item).length;

// Exactly what RelationMapping.jsx submits for typed boxes and drawn arrows.
const labWork = ({ arrows = [], domainText = '', rangeText = '', isFunction = '' }) => ({
  plottedPoints: [], arrows, domainText, rangeText, domain: parseList(domainText), range: parseList(rangeText), isFunction, fields: [],
});
const bothVerdicts = (item, work) => ({
  path: pathVerdict(item.stored.privateGrading, work),
  shared: sharedVerdict('relationMapping', item.question, work),
});

test('the range of a grade 8 relation typed as its pairs give it is right on the Path, as in the lab', () => {
  const item = relationItem('mm_gen_8_8_5G_mapping-function', repeatsAnOutput);
  assert.ok(item, 'the grade 8 mapping draws a relation that sends two inputs to one output');
  const pairs = pairsOf(item);
  const distinct = (values) => [...new Set(values)];
  const answer = {
    arrows: pairs,
    domainText: distinct(pairs.map(([x]) => x)).join(', '),
    isFunction: FUNCTION_STATUS_CHOICES.YES_DEFINITION,
  };
  // Every output, in the order the pairs give them: the repeated output twice.
  const asListed = bothVerdicts(item, labWork({ ...answer, rangeText: pairs.map(([, y]) => y).join(', ') }));
  assert.equal(asListed.shared.isCorrect, true, 'the lab (and an assignment) marks it right');
  assert.equal(asListed.path.isCorrect, true, 'and so does the Path');
  // Listed once each, it was always right; an output left out is still wrong.
  const once = bothVerdicts(item, labWork({ ...answer, rangeText: distinct(pairs.map(([, y]) => y)).join(', ') }));
  assert.equal(once.path.isCorrect, true);
  const missing = bothVerdicts(item, labWork({ ...answer, rangeText: String(pairs[1][1]) }));
  assert.deepEqual([missing.path.isCorrect, missing.shared.isCorrect], [false, false]);
});

test('on the Path a domain is the same set however often a value is typed, and a different number is wrong', () => {
  const item = relationItem('mm_A_2A_v2_discrete-mapping-domain-range');
  const pairs = pairsOf(item);
  const xs = pairs.map(([x]) => x);
  const ys = pairs.map(([, y]) => y);
  const verdict = (domainText) => bothVerdicts(item, labWork({
    domainText, rangeText: ys.join(', '), isFunction: FUNCTION_STATUS_CHOICES.YES_DEFINITION,
  }));
  for (const typed of [xs.join(', '), [...xs].reverse().join('; '), [...xs, xs[0], xs[1]].join(', ')]) {
    const result = verdict(typed);
    assert.deepEqual([result.path.isCorrect, result.shared.isCorrect], [true, true], typed);
  }
  // Five ten-millionths off is another number: the Path's old 1e-6 list
  // comparison accepted it; the set rule (within 1e-9) does not.
  // …and so is a value missing, or one the relation does not have.
  for (const typed of [[xs[0] + 5e-7, ...xs.slice(1)].join(', '), xs.slice(1).join(', '), [...xs, Math.max(...xs) + 1].join(', ')]) {
    const result = verdict(typed);
    assert.deepEqual([result.path.isCorrect, result.shared.isCorrect], [false, false], typed);
  }
});

test('a relation question issued before the move is graded by the set rule from its stored definition', () => {
  // The private grading is stored when the question is issued, and its shape
  // did not change: { ask, arrows, domain, range, isFunction }, the sets once
  // each. A session issued under version 2 is answered under version 3.
  const item = relationItem('mm_gen_8_8_5G_mapping-function', repeatsAnOutput);
  const stored = buildPrivateToolGrading(item.question);
  assert.deepEqual(Object.keys(stored.definition).sort(), ['arrows', 'ask', 'domain', 'isFunction', 'range']);
  assert.equal(new Set(stored.definition.range).size, stored.definition.range.length, 'the stored range lists each output once');
  const pairs = pairsOf(item);
  const work = labWork({
    arrows: pairs,
    domainText: pairs.map(([x]) => x).join(', '),
    rangeText: pairs.map(([, y]) => y).join(', '),
    isFunction: FUNCTION_STATUS_CHOICES.YES_DEFINITION,
  });
  assert.equal(pathVerdict(stored, work).isCorrect, true);
});

// --- Documented divergences no live item reaches ------------------------------------

test('no live relation item asks for a plot or analysis fields, which the Path neither serves nor grades', () => {
  // The Path's public payload carries no `answerFields`, and its grader has no
  // `plot` part: an item asking for either would be graded on less than the
  // student was asked for. None is live; authoring one needs that built first.
  const relations = items.filter((item) => item.toolId === 'relationMapping');
  assert.deepEqual(relations.filter((item) => (item.question.ask || []).includes('plot') || (item.question.answerFields || []).length).map((item) => item.id), []);
});

test('every live systems item is a mode the Path grades, and the shared grader resolves the same mode', () => {
  // The Path knows linear, inequalities and matrix3 and reads any other mode as
  // linear; the shared grader also resolves algebraic, linearQuadratic, matrix
  // and spatial (resolveSystemsWorkspaceMode).
  const systems = items.filter((item) => item.toolId === 'systemsWorkspace');
  const modes = systems.map((item) => systemsModes(item.question));
  assert.deepEqual([...new Set(modes.map((mode) => mode.path))].sort(), ['inequalities', 'linear', 'matrix3']);
  assert.deepEqual(modes.filter((mode) => mode.path !== mode.shared), []);
});

test('no live data modeling item is in a mode where the documented causation or line-fit prediction divergences live', () => {
  const dataModels = items.filter((item) => item.toolId === 'dataModelingLab');
  const modes = new Set(dataModels.map((item) => String(item.question.mode)));
  ['full', 'association', 'lineFit', 'prediction', 'modelCompare'].forEach((mode) => assert.equal(modes.has(mode), false, mode));
});

test('no live Step Algebra item asks for a form, a relation or typed prompts, where the shared grader checks more than the Path', () => {
  const steps = items.filter((item) => item.toolId === 'stepAlgebra');
  assert.deepEqual(steps.filter(({ question }) => question.objective || question.targetForm || question.solverGrader
    || question.expectedFinalRelation != null || (question.algebraPrompts || []).length).map((item) => item.id), []);
});

test('scores: a wrong relation or linear-system answer scores 0 on the Path and the share of its right parts in the shared grader', () => {
  // Not moved: a Path evidence event records `performance.score`, and mastery
  // credits it (masteryScoring.mjs), so partial credit here would change what a
  // wrong answer earns toward mastery. Recorded so the move is a decision.
  const partial = (toolId, tag) => rows.find((row) => row.toolId === toolId && row.tag === tag && !pathRight(row) && row.shared.score > 0);
  for (const [toolId, tag] of [['relationMapping', 'the opposite verdict'], ['systemsWorkspace', 'a coordinate off by one']]) {
    const row = partial(toolId, tag);
    assert.ok(row, `${toolId}: a live item with a partly right answer`);
    assert.equal(row.path.score, 0, where(row));
    assert.ok(row.shared.score > 0 && row.shared.score < 1, where(row));
  }
});

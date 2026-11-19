/*
 * INTERVAL ANSWERS ON A GRAPH: AT A TURNING POINT AN OPEN OR A CLOSED END IS
 * RIGHT, AND PIECES MAY BE JOINED BY ∪, "AND" OR COMMAS (the owner, 2026-11-19,
 * a platform rule for every lesson).
 *
 * The walkthrough of 2026-11-06 (Algebra II Honors module 1, part 2, P-6)
 * found the graph-analysis grader refusing true answers:
 *
 *   - x² is increasing on [0, ∞), but only (0, ∞) was accepted (L2 Day 1
 *     WU 2), and the same for (x − 2)² − 4 on [2, ∞) (L1 Day 2 CW 1, CW 3,
 *     PR 1 and exit ticket 1). −√x's [0, ∞) was accepted (L2 Day 1 PR 3) only
 *     because 0 ends its domain: the key is written with the domain's own end,
 *     or with every end open, and a vertex inside the domain was always open;
 *   - 1/x decreases on (−∞, 0) and on (0, ∞), but only the union was accepted,
 *     on a one-try exit ticket (L2 Day 1 DOL 1). The union claim is not quite
 *     true of 1/x (f(−1) < f(1)), so the "and" and comma forms are, if
 *     anything, the more exact ones.
 *
 * The rule lives in the shared code the browser and the server both run:
 * getMonotonicAcceptedAnswers (interactiveGraphEngine.mjs) keys a closed end
 * at a turning point inside the domain, and pathAnalysisTextMatches
 * (pathToolContracts.mjs) reads pieces joined by "and" or commas for where a
 * function increases, decreases, is constant, positive or negative. Nothing
 * else is accepted that was not: a closed end where the function is undefined,
 * a wrong end, one piece of two, or an interval where the function does not do
 * what the box asks all stay wrong; and a domain or a range, one set, keeps ∪.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import graphWorkspaceGrader from '../../functions/shared/serverGrading/tools/graphWorkspace.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { gradeAnalysisPart, normalizeAnalysisRequests } from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import { getMonotonicAcceptedAnswers } from '../../functions/shared/toolMath/graphWorkspace/interactiveGraphEngine.mjs';
import { buildPrivateToolGrading, gradePathResponse, pathAnalysisTextMatches } from '../../functions/shared/pathToolContracts.mjs';
import * as functionFeatures from '../../src/platform/supports/families/functionFeatures.js';
import { speechTextFor } from '../../src/platform/language/speechText.js';

const lesson = (file) => parseAssignmentBlueprintText(readFileSync(new URL(`../../teacher-import-jsons/algebra2-honors-module1/${file}`, import.meta.url), 'utf8')).questions;
const L2_DAY1 = lesson('L2_Day1_Parent_Functions_Key_Attributes.json');
const L1_DAY2 = lesson('L1_Day2_Function_Attributes_Relations.json');
const item = (questions, id) => {
  const question = questions.find((entry) => entry.questionId === id);
  assert.ok(question, `${id} is in the lesson`);
  return question;
};
const clone = (value) => JSON.parse(JSON.stringify(value));

/*
 * One analysis box typed in, graded as the student's screen grades it
 * (gradeToolCheck over the shared grader) and as the server grades the bytes
 * that screen sends: the two must agree, part for part.
 */
const verdict = (question, kind, typed) => {
  const part = (question.analysisRequests || []).find((request) => request.kind === kind);
  assert.ok(part, `${question.questionId} asks for ${kind}`);
  const work = { analysis: { answers: { [part.id]: typed } } };
  const browser = gradeToolCheck(graphWorkspaceGrader, question, work);
  const server = gradeServerResponse({ question, response: clone(browser.toolResponse) });
  assert.deepEqual(server.parts, browser.parts, `${question.questionId} ${kind} ${typed}: the server and the screen agree`);
  return browser.parts.find((entry) => entry.id === part.id).isCorrect;
};
const right = (question, kind, answers) => answers.forEach((typed) => assert.equal(verdict(question, kind, typed), true, `${question.questionId} ${kind}: ${typed} is right`));
const wrong = (question, kind, answers) => answers.forEach((typed) => assert.equal(verdict(question, kind, typed), false, `${question.questionId} ${kind}: ${typed} stays wrong`));

test('L2 Day 1 WU 2: x² is increasing on [0, ∞) and decreasing on (−∞, 0], as well as on the open intervals', () => {
  const x2 = item(L2_DAY1, 'q_warmup-1_1_2');
  assert.deepEqual(x2.functionSpec, { type: 'quadratic', a: 1, h: 0, k: 0 });
  right(x2, 'increasing', ['[0, ∞)', '[0,\\infty)', '\\left[0,\\infty\\right)', '(0,\\infty)']);
  right(x2, 'decreasing', ['(−∞, 0]', '(-\\infty,0]', '(-\\infty,0)']);
  // Not where it increases, a wrong end, the whole line. (A ] at ∞ is read
  // as ), as for every interval answer, so [0, ∞] is this same answer.)
  wrong(x2, 'increasing', ['(-\\infty,0]', '[1,\\infty)', '(-1,\\infty)', '(-\\infty,\\infty)', '[-0.5,\\infty)']);
  wrong(x2, 'decreasing', ['[0,\\infty)', '(-\\infty,1]', '(-\\infty,0]\\cup[0,\\infty)']);
});

test('L1 Day 2: (x − 2)² − 4 and the Vs and parabolas of CW 3, PR 1 and the exit ticket take a closed end at the turning point', () => {
  const cw1 = item(L1_DAY2, 'q_classwork-2_2_1');
  right(cw1, 'increasing', ['[2,\\infty)', '(2,\\infty)']);
  right(cw1, 'decreasing', ['(-\\infty,2]', '(-\\infty,2)']);
  wrong(cw1, 'increasing', ['(-\\infty,2]', '[3,\\infty)', '[-4,\\infty)']);
  wrong(cw1, 'decreasing', ['[2,\\infty)', '(-\\infty,-4]']);

  const cw3 = item(L1_DAY2, 'q_classwork-2_2_3'); // |x + 2| − 3
  right(cw3, 'increasing', ['[-2,\\infty)', '(-2,\\infty)']);
  right(cw3, 'decreasing', ['(-\\infty,-2]', '(-\\infty,-2)']);
  // Where it is positive or negative a zero is never included, turning or not.
  wrong(cw3, 'negative', ['[-5,1]', '[-5,1)', '(-5,-2]\\cup[-2,1)']);
  wrong(cw3, 'positive', ['(-\\infty,-5]\\cup[1,\\infty)']);

  const pr1 = item(L1_DAY2, 'q_practice-3_3_1'); // −2|x − 1| + 6
  right(pr1, 'increasing', ['(-\\infty,1]', '(-\\infty,1)']);
  right(pr1, 'decreasing', ['[1,\\infty)', '(1,\\infty)']);
  wrong(pr1, 'increasing', ['[1,\\infty)', '(-\\infty,6]']);

  const ticket = item(L1_DAY2, 'q_dol-4_4_1'); // −(x − 2)² + 9
  right(ticket, 'increasing', ['(-\\infty,2]']);
  right(ticket, 'decreasing', ['[2,\\infty)']);
  wrong(ticket, 'positive', ['[-1,5]', '(-1,5]']);
});

test('L2 Day 1 PR 3: −√x was already right with [0, ∞), its domain\'s end — unchanged', () => {
  const root = item(L2_DAY1, 'q_practice-3_3_3');
  right(root, 'decreasing', ['[0,\\infty)', '(0,\\infty)']);
  wrong(root, 'decreasing', ['(-\\infty,0]', '[1,\\infty)']);
});

test('L2 Day 1 DOL 1: 1/x\'s decreasing pieces may be joined by ∪, "and" or a comma', () => {
  const reciprocal = item(L2_DAY1, 'q_dol-4_4_1');
  assert.deepEqual(reciprocal.functionSpec, { type: 'rational', a: 1, h: 0, k: 0 });
  right(reciprocal, 'decreasing', [
    '(-\\infty,0)\\cup(0,\\infty)',
    '(−∞, 0) and (0, ∞)',
    '(−∞, 0), (0, ∞)',
    // What the math editor holds when "and" is typed between them (its
    // inline shortcut makes ∧ of it), as a word, and with \left…\right.
    '(-\\infty,0)\\land(0,\\infty)',
    '(-\\infty,0),\\land(0,\\infty)',
    '(-\\infty,0)\\text{ and }(0,\\infty)',
    '\\left(-\\infty,0\\right),\\left(0,\\infty\\right)',
    '(-\\infty,0)and(0,\\infty)',
    '(0, ∞) and (−∞, 0)',
  ]);
  wrong(reciprocal, 'decreasing', [
    // A closed end where 1/x is undefined.
    '(-\\infty,0],(0,\\infty)',
    '(−∞, 0) and [0, ∞)',
    '(-\\infty,0]\\cup[0,\\infty)',
    // One piece of two, or the whole line.
    '(-\\infty,0)',
    '(0,\\infty)',
    '(-\\infty,\\infty)',
    // A wrong end.
    '(−∞, 1) and (1, ∞)',
    '(−∞, 0) and (1, ∞)',
    // Not a list: "or", a semicolon, pieces side by side, a list left open.
    '(−∞, 0) or (0, ∞)',
    '(-\\infty,0)\\lor(0,\\infty)',
    '(−∞, 0); (0, ∞)',
    '(-\\infty,0)(0,\\infty)',
    '(−∞, 0) and',
    '(−∞, 0), (0, ∞),',
  ]);
  // Its domain and range are one set each, and keep ∪ (the rule is the
  // owner's for where a function rises, falls or has a sign).
  right(reciprocal, 'domain', ['(-\\infty,0)\\cup(0,\\infty)']);
  wrong(reciprocal, 'domain', ['(−∞, 0) and (0, ∞)', '(−∞, 0), (0, ∞)']);
  wrong(reciprocal, 'range', ['(−∞, 0) and (0, ∞)']);
});

test('the pieces where a function is positive or negative may be listed too, each still graded exactly', () => {
  const cw2 = item(L1_DAY2, 'q_classwork-2_2_2'); // −(x − 1)² + 4: zeros −1 and 3
  right(cw2, 'negative', ['(-\\infty,-1)\\cup(3,\\infty)', '(−∞, −1) and (3, ∞)', '(−∞, −1), (3, ∞)']);
  right(cw2, 'positive', ['(-1,3)']);
  wrong(cw2, 'negative', ['(−∞, −1] and [3, ∞)', '(−∞, −1)', '(−∞, −1) and (4, ∞)', '(-1,3)']);
  wrong(cw2, 'positive', ['(−1, 1) and (1, 3)', '(−1, 1), [1, 3)']);
});

test('a restricted graph: the turning point inside the domain is either way; the domain\'s own ends and undefined points are as before', () => {
  const window = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
  const graded = (spec, kind, typed) => {
    const [part] = normalizeAnalysisRequests({ analysisRequests: [{ id: 'p', kind, notation: 'interval' }] }, spec, window, false);
    return gradeAnalysisPart(part, { answers: { p: typed } }).isCorrect;
  };
  const cup = { type: 'quadratic', a: 1, h: 1, k: -4, domain: { min: -3, max: 5, minInclusive: true, maxInclusive: true } };
  for (const typed of ['(1,5]', '(1,5)', '[1,5]', '[1,5)']) assert.equal(graded(cup, 'increasing', typed), true, typed);
  for (const typed of ['[-3,1)', '(-3,1)', '[-3,1]', '(-3,1]']) assert.equal(graded(cup, 'decreasing', typed), true, typed);
  for (const typed of ['[-3,5]', '[0,5]', '[1,6]', '(1,\\infty)', '[1,\\infty)']) assert.equal(graded(cup, 'increasing', typed), false, typed);
  // The vertex at an open end of the domain is not on the graph.
  const openStart = { type: 'quadratic', a: 1, h: 0, k: 0, domain: { min: 0, max: 5, minInclusive: false, maxInclusive: true } };
  assert.equal(graded(openStart, 'increasing', '(0,5]'), true);
  assert.equal(graded(openStart, 'increasing', '[0,5]'), false);
  // A reciprocal drawn across its asymptote: each branch, never x = 0.
  const branches = { type: 'rational', a: 6, h: 0, k: 0, domain: { min: -3, max: 3, minInclusive: true, maxInclusive: true } };
  for (const typed of ['[-3,0)\\cup(0,3]', '[−3, 0) and (0, 3]', '(−3, 0), (0, 3)']) assert.equal(graded(branches, 'decreasing', typed), true, typed);
  for (const typed of ['[−3, 0] and [0, 3]', '[−3, 0) and (0, 3]]', '[-3,3]', '[−3, 0) and (0, 4]']) assert.equal(graded(branches, 'decreasing', typed), false, typed);
});

test('the key the solution review shows first is unchanged; the closed turning-point forms come after it', () => {
  assert.deepEqual(getMonotonicAcceptedAnswers({ type: 'quadratic', a: 1, h: 0, k: 0 }, 'increasing'), ['(0,inf)', '[0,inf)']);
  assert.deepEqual(getMonotonicAcceptedAnswers({ type: 'absolute', a: -2, h: 1, k: 6 }, 'decreasing'), ['(1,inf)', '[1,inf)']);
  // No turning point, nothing new: a square root, a reciprocal, a line.
  assert.deepEqual(getMonotonicAcceptedAnswers({ type: 'squareRoot', a: -1, h: 0, k: 0 }, 'decreasing'), ['[0,inf)', '(0,inf)']);
  assert.deepEqual(getMonotonicAcceptedAnswers({ type: 'rational', a: 1, h: 0, k: 0 }, 'decreasing'), ['(-inf,0)u(0,inf)']);
  assert.deepEqual(getMonotonicAcceptedAnswers({ type: 'line', m: 2, b: 1 }, 'increasing'), ['(-inf,inf)']);
});

test('the shared matcher reads a list only where the box asks where a function rises, falls or has a sign', () => {
  for (const kind of ['increasing', 'decreasing', 'constant', 'positive', 'negative']) {
    assert.equal(pathAnalysisTextMatches('(-∞, 0) and (0, ∞)', ['(-inf,0)u(0,inf)'], { kind }), true, kind);
    assert.equal(pathAnalysisTextMatches('(-∞, 0), and (0, ∞)', ['(-inf,0)u(0,inf)'], { kind }), true, kind);
  }
  for (const kind of ['domain', 'range', 'value', '']) {
    assert.equal(pathAnalysisTextMatches('(-∞, 0) and (0, ∞)', ['(-inf,0)u(0,inf)'], { kind, notation: kind === 'value' || !kind ? '' : 'interval' }), false, kind || 'no kind');
  }
  // A list is read only between a closing and an opening bracket.
  assert.equal(pathAnalysisTextMatches('(-∞, 0 and 0, ∞)', ['(-inf,0)u(0,inf)'], { kind: 'decreasing' }), false);
});

test('My Math Path\'s function investigation reads the same lists (one matcher, both places)', () => {
  const question = {
    type: 'functionInvestigation',
    prompt: 'Graph f(x) = 1/x, then state where it is decreasing.',
    functionSpec: { type: 'rational', a: 1, h: 0, k: 0 },
    pointTasks: [{ id: 'left', x: -1, expected: [-1, -1] }, { id: 'right', x: 1, expected: [1, 1] }],
    analysisRequests: [{ id: 'decreasing', label: 'Where is f decreasing?', kind: 'decreasing', notation: 'interval', acceptedAnswers: ['(-inf,0)u(0,inf)'] }],
  };
  const graded = (typed) => gradePathResponse({
    privateGrading: buildPrivateToolGrading(question),
    raw: { placements: { left: [-1, -1], right: [1, 1] }, markerPlacements: {}, selections: {}, answers: { decreasing: typed } },
  }).isCorrect;
  assert.equal(graded('(-\\infty,0)\\land(0,\\infty)'), true);
  assert.equal(graded('(-\\infty,0),(0,\\infty)'), true);
  assert.equal(graded('(-\\infty,0],(0,\\infty)'), false);
});

test('the worked step says 1/x decreases on each piece, not on their union, and Read aloud says both as intervals', () => {
  const worked = functionFeatures.workedSolution(item(L2_DAY1, 'q_dol-4_4_1'));
  const text = [...worked.steps, worked.answerSummary].join(' ');
  assert.match(text, /decreasing on \(-∞, 0\) and on \(0, ∞\)/);
  assert.doesNotMatch(text, /decreasing on \(-∞, 0\) ∪ \(0, ∞\)/);
  // The domain is one set and keeps its ∪.
  assert.match(text, /the domain is \(-∞, 0\) ∪ \(0, ∞\)/);
  // A finite piece after "and on" is an interval, as it was after ∪.
  assert.equal(
    speechTextFor('So it is decreasing on (−3, 0) and on (0, 3).'),
    'So it is decreasing on the interval from negative 3 to 0, not including negative 3 or 0 and on the interval from 0 to 3, not including 0 or 3.',
  );
  // Not after a pair that was not an interval.
  assert.match(speechTextFor('Plot (1, 2) and on (3, 4) draw a dot.'), /the point 3, 4/);
});

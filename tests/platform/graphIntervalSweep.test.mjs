/*
 * THE VERDICT SWEEP'S GRAPH SECTION (scripts/lib/graphIntervalSweep.mjs) TELLS
 * A RIGHT ANSWER FROM A NEAR MISS WITHOUT ASKING THE CODE UNDER TEST.
 *
 * scripts/sweep-equivalence-verdicts.mjs grades the interval boxes on a graph
 * with the base tree and this one. Whether a built response is right is read
 * from the BASE's accepted answers and from the function itself (a turning
 * point is where it is defined around x and has a strict local extremum), so a
 * grader that accepts too much shows up as a near miss let through. Pinned
 * here: how the 2026-11-06 walkthrough's answers are classed, and that the
 * sweep reports a near miss accepted, a right answer refused and the rule's
 * own forms, each by class.
 *
 * The base is played by this tree's graders with the keys the base gave
 * (BASE_KEYS: no closed end at a turning point) and no lists read.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  createGraphQuestionCorpus,
  graphGradersFrom,
  graphPartResponses,
  sweepGraphIntervals,
} from '../../scripts/lib/graphIntervalSweep.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const graders = await graphGradersFrom(ROOT);

// What the base keyed (getMonotonicAcceptedAnswers before the owner's rule).
const BASE_KEYS = Object.freeze({
  'quadratic:increasing': ['(0,inf)'],
  'quadratic:decreasing': ['(-inf,0)'],
  'restricted:increasing': ['(1,5)'],
  'rational:decreasing': ['(-inf,0)u(0,inf)'],
  'rational:domain': ['(-inf,0)u(0,inf)'],
});
const keyOf = (question, part) => `${question.functionSpec.domain ? 'restricted' : question.functionSpec.type}:${part.kind}`;
const LIST = / and |\\land|,\s*[([]/;
const base = {
  ...graders,
  modelFor: (question) => {
    const model = graders.modelFor(question);
    return { ...model, analysisParts: model.analysisParts.map((part) => ({ ...part, acceptedAnswers: BASE_KEYS[keyOf(question, part)] || part.acceptedAnswers })) };
  },
  grade: (model, part, response) => !LIST.test(response) && graders.grade(model, part, response),
};

const ask = (functionSpec, kinds) => ({ type: 'graphAnalysis', functionSpec, analysisRequests: kinds.map((kind) => ({ id: kind, kind, notation: 'interval' })) });
const responsesFor = (question, kind) => {
  const partsByKind = new Map(base.modelFor(question).analysisParts.map((part) => [String(part.kind), part]));
  return new Map(graphPartResponses({ part: partsByKind.get(kind), partsByKind, spec: question.functionSpec, base })
    .map((entry) => [entry.response, entry]));
};

test('x²: a closed end at the vertex is built right ("turning"); a closed end anywhere else, or the other side, is a near miss', () => {
  const built = responsesFor(ask({ type: 'quadratic', a: 1, h: 0, k: 0 }, ['increasing', 'decreasing']), 'increasing');
  assert.deepEqual(built.get('[0, ∞)'), { response: '[0, ∞)', built: 'right', responseClass: 'turning' });
  assert.equal(built.get('(0,inf)').responseClass, 'key');
  assert.deepEqual(built.get('(−∞, 0)'), { response: '(−∞, 0)', built: 'wrong', responseClass: 'swap' });
  assert.equal(built.get('(1, ∞)').built, 'wrong');
  assert.equal(built.get('(−1, ∞)').built, 'wrong');
});

test('a restricted parabola: its vertex inside is a turning point; a closed end at the domain\'s open end is not', () => {
  const spec = { type: 'quadratic', a: 1, h: 1, k: -4, domain: { min: -3, max: 5, minInclusive: false, maxInclusive: false } };
  const built = responsesFor(ask(spec, ['increasing']), 'increasing');
  assert.deepEqual(built.get('[1, 5)'), { response: '[1, 5)', built: 'right', responseClass: 'turning' });
  assert.equal(built.get('(1, 5]').built, 'wrong');
  assert.equal(built.get('[1, 5]').built, 'wrong');
});

test('1/x: its pieces joined by "and" or commas are built right ("list"), a closed end at 0 or one piece is a near miss, and its domain written as a list is one too', () => {
  const question = ask({ type: 'rational', a: 1, h: 0, k: 0 }, ['decreasing', 'domain']);
  const decreasing = responsesFor(question, 'decreasing');
  for (const response of ['(−∞, 0) and (0, ∞)', '(−∞, 0), (0, ∞)', '(-\\infty,0)\\land(0,\\infty)']) {
    assert.deepEqual(decreasing.get(response), { response, built: 'right', responseClass: 'list' }, response);
  }
  assert.equal(decreasing.get('(−∞, 0] and (0, ∞)').built, 'wrong');
  assert.equal(decreasing.get('(−∞, 0) or (0, ∞)').responseClass, 'or');
  assert.equal(decreasing.get('(0, ∞)').responseClass, 'drop');
  const domain = responsesFor(question, 'domain');
  assert.deepEqual(domain.get('(−∞, 0) and (0, ∞)'), { response: '(−∞, 0) and (0, ∞)', built: 'wrong', responseClass: 'setList' });
});

test('the sweep reports what moved by class, and counts a near miss let through and a right answer refused', () => {
  const corpus = createGraphQuestionCorpus();
  corpus.offer(ask({ type: 'rational', a: 1, h: 0, k: 0 }, ['decreasing', 'domain']), 'test');
  corpus.offer(ask({ type: 'quadratic', a: 1, h: 0, k: 0 }, ['increasing', 'decreasing']), 'test');
  // The base against this tree: the rule's forms move, and only they.
  const moved = sweepGraphIntervals({ corpus, base, current: graders });
  assert.ok(moved.movedByClass.list > 0 && moved.movedByClass.turning > 0, JSON.stringify(moved.movedByClass));
  assert.deepEqual(Object.keys(moved.movedByClass).sort(), ['list', 'turning']);
  assert.equal(moved.counts.graphNearMissNowRight, 0);
  assert.equal(moved.counts.graphRightToWrong, 0);
  assert.deepEqual(moved.ruleFormsRefused, []);
  // This tree against itself: nothing moves.
  assert.equal(sweepGraphIntervals({ corpus, base: graders, current: graders }).changes.length, 0);
  // A tree that takes "or" as well lets near misses through; one that refuses
  // a list loses right answers and refuses one of the rule's forms.
  const lenient = { ...graders, grade: (model, part, response) => / or |\\lor/.test(response) || graders.grade(model, part, response) };
  const loose = sweepGraphIntervals({ corpus, base, current: lenient });
  assert.ok(loose.counts.graphNearMissNowRight > 0);
  assert.deepEqual(loose.unexpectedClasses, ['or']);
  const strict = { ...graders, grade: (model, part, response) => !/ and /.test(response) && graders.grade(model, part, response) };
  assert.deepEqual(sweepGraphIntervals({ corpus, base, current: strict }).ruleFormsRefused, ['list']);
  assert.ok(sweepGraphIntervals({ corpus, base: graders, current: strict }).counts.graphRightToWrong > 0);
});

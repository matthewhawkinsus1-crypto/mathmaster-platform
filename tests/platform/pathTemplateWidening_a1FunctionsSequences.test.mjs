/*
 * WIDENED ALGEBRA I FUNCTION / SEQUENCE TEMPLATES (job J, "Content that teaches").
 *
 * Six My Math Path templates drew fewer than 8 distinct questions in the 30
 * recap probe draws, so their recap had to withhold the answer
 * (functions/shared/pathRecapWithheld.mjs). Their generators were widened in
 * the Fidelity V2 DRAFTS — the source of truth the seed mirrors are rebuilt
 * from — by varying only numbers and context nouns of the kind each template
 * already varied:
 *
 *   A.12A mapping-nonfunction      NOT widened: see below
 *   A.12D geometric-decay formula   first term: any multiple of 8 in 16..200
 *   A.12E solve-area-height         k in 2..12, companion letter b or w
 *   A.2A  discrete-mapping          the drawn pairs are now named in the prompt
 *   A.9B  growth-factor             factor 2..8, time unit of the period
 *   A.9D  context-decay-graph       start 20..56 (step 4), retains 25/50/75%
 *
 * A.12A is left as committed, on purpose. Its only graded answer, "not a
 * function", is the same on every draw, so a recap showing that answer would be
 * the key to every later draw of the family, retention re-checks included.
 * Naming its drawn pairs in the prompt raised its probe count to 30 and would
 * have taken it off the withheld list without removing that key. It stays
 * withheld until it gains draws with a different verdict (a content-design
 * change: function variants with their own solution texts).
 *
 * This file proves, against the drafts themselves:
 *   - a template whose correct answer never changes stays below the recap
 *     floor (so its recap keeps withholding the answer) and is on the withheld
 *     list; every other template draws at least 12 distinct questions in the 30
 *     probe draws (measured exactly as tests/platform/pathRecapWithheld.test.mjs
 *     does);
 *   - for 120 further draws, every expected answer is recomputed by an
 *     independent mathjs oracle from the numbers the STUDENT sees, every solution
 *     text agrees with it, and the production grader marks the instance's own
 *     key correct and a typical wrong answer incorrect;
 *   - every plotted point, the y-intercept and the asymptote lie inside the graph
 *     window and on its snap grid;
 *   - identity, metadata and response shape are unchanged (pinned literals taken
 *     from the committed versions before the widening).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as math from 'mathjs';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';
import {
  RECAP_INSTANCE_DRAWS,
  RECAP_MIN_DISTINCT_INSTANCES,
  RECAP_WITHHELD_TEMPLATE_IDS,
} from '../../functions/shared/pathRecapWithheld.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

const DRAFTS = 'drafts/fidelity-v2/algebra1';
const TARGET_DISTINCT = 12;
const ORACLE_DRAWS = 120;

const loadTemplate = (standard, id) => {
  const payload = JSON.parse(readFileSync(new URL(`../../${DRAFTS}/${standard}.json`, import.meta.url), 'utf8'));
  const template = payload.documents.find((doc) => doc.id === id);
  assert.ok(template, `${id} is staged in ${DRAFTS}/${standard}.json`);
  return template;
};

// Identical to the content key in pathRecapWithheld.test.mjs: what a student
// sees of a question.
const contentKey = (question) => JSON.stringify({
  p: question.prompt,
  s: question.stimulus,
  sc: question.scenario,
  c: (Array.isArray(question.choices) ? question.choices : [])
    .map((choice) => (choice && typeof choice === 'object') ? (choice.text ?? choice.label ?? choice.latex ?? choice.value ?? '') : choice),
  f: (Array.isArray(question.responseFields) ? question.responseFields : [])
    .map((field) => (field && typeof field === 'object') ? (field.label ?? field.prompt ?? '') : field),
});

const distinctProbeQuestions = (template) => {
  const seen = new Set();
  for (let draw = 0; draw < RECAP_INSTANCE_DRAWS; draw += 1) {
    const generated = generatePathInstance(template, `recap-probe-${draw}`);
    assert.ok(generated.question, `${template.id} probe ${draw} generated (${generated.reason})`);
    seen.add(contentKey(generated.question));
  }
  return seen.size;
};

// Two expressions agree when they agree at several unrelated points.
const sameExpression = (left, right, scopeFor) => [0, 1, 2, 3, 4].every((index) => {
  const scope = scopeFor(index);
  const a = math.evaluate(left, scope);
  const b = math.evaluate(right, scope);
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
});

const numeric = (value) => Number(value);

// --- The independent oracles -----------------------------------------------------
//
// Each reads the student-visible numbers back out of the generated question
// (never the generator's parameters), recomputes the answer, checks every
// solution text that states it, and returns a correct response plus wrong ones
// for the production grader, and `key`: the correct answer itself, so a family
// whose answer never changes can be recognised.

const ORACLES = {
  'mm_A_12A_v2_mapping-nonfunction': (q) => {
    // The prompt names no numbers: the student reads the relation off the mapping.
    assert.equal(q.prompt, 'Use the mapping to decide whether the relation is a function.');
    const shown = q.pairs.map((pair) => [numeric(pair.x), numeric(pair.y)]);
    const outputs = new Map();
    let isFunction = true;
    for (const [x, y] of shown) {
      if (outputs.has(x) && outputs.get(x) !== y) isFunction = false;
      outputs.set(x, y);
    }
    assert.equal(isFunction, false, 'this family is always a non-function');
    const reason = /^The input (-?\d+) is paired with both (-?\d+) and (-?\d+)\.$/.exec(q.solutionReview.reasoning[0]);
    assert.ok(reason, q.solutionReview.reasoning[0]);
    const reached = shown.filter(([x]) => x === +reason[1]).map(([, y]) => y).sort((a, b) => a - b);
    assert.deepEqual(reached, [+reason[2], +reason[3]].sort((a, b) => a - b));
    assert.notEqual(+reason[2], +reason[3]);
    return {
      key: 'no-input-repeat',
      correct: [{ raw: { isFunction: 'no-input-repeat' } }],
      wrong: [{ raw: { isFunction: 'yes-definition' } }, { raw: { isFunction: 'no-output-repeat' } }],
    };
  },

  'mm_A_12D_v2_geometric-decay-terms-to-formula': (q) => {
    const match = /^A geometric sequence begins \$(\d+), (\d+), (\d+), (\d+), \\ldots\$\./.exec(q.prompt);
    assert.ok(match, q.prompt);
    const terms = match.slice(1).map(Number);
    assert.ok(terms.every((term) => Number.isInteger(term) && term > 0), `whole-number terms ${terms}`);
    const ratio = math.fraction(terms[1], terms[0]);
    assert.ok(math.equal(ratio, math.fraction(1, 2)), 'common ratio is 1/2 (the texts say "half")');
    for (let index = 1; index < 4; index += 1) {
      assert.ok(math.equal(math.fraction(terms[index], terms[index - 1]), ratio), 'constant ratio');
    }
    const truth = `${terms[0]} * (1/2)^(n-1)`;
    const field = q.responseFields[0];
    for (const key of [field.expected, ...field.accepted]) {
      assert.ok(sameExpression(key, truth, (index) => ({ n: index + 1 })), `${key} is ${truth}`);
    }
    terms.forEach((term, index) => assert.equal(math.evaluate(field.expected, { n: index + 1 }), term));
    assert.equal(q.solutionReview.answerSummary, `$f(n)=${terms[0]}(1/2)^{n-1}$`);
    assert.match(q.solutionReview.reasoning[1], new RegExp(`starts with ${terms[0]} `));
    // Equivalent spellings a student writes, which the form-preserving grader
    // only accepts when they are listed.
    const spellings = [`${terms[0]}*0.5^(n-1)`, `${terms[0]}/2^(n-1)`];
    for (const spelling of spellings) assert.ok(sameExpression(spelling, truth, (index) => ({ n: index + 1 })));
    return {
      key: field.expected,
      correct: [field.expected, ...field.accepted, ...spellings].map((answer) => ({ responses: { formula: answer } })),
      wrong: [{ responses: { formula: `${terms[0]}*(2)^(n-1)` } }, { responses: { formula: `${terms[1]}*(0.5)^(n-1)` } }],
    };
  },

  'mm_A_12E_v2_solve-area-height': (q) => {
    const match = /^A student solves \$A=(\d+)([a-z])h\$ for \$h\$ by dividing by (\d+) but forgets that \$h\$ is also multiplied by \$([a-z])\$\./.exec(q.prompt);
    assert.ok(match, q.prompt);
    assert.equal(match[1], match[3], 'the student divided by the coefficient shown');
    assert.equal(match[2], match[4], 'the companion letter is named consistently');
    const k = Number(match[1]);
    const letter = match[2];
    assert.ok(['b', 'w'].includes(letter));
    assert.ok(k >= 2 && k <= 12);
    const field = q.responseFields[0];
    // h is right when k * letter * h reproduces A, for unrelated A and letter.
    for (const key of [field.expected, ...field.accepted]) {
      const explicit = key.replace(new RegExp(`(\\d)${letter}`, 'g'), `$1*${letter}`);
      for (const [A, other] of [[3.1, 1.7], [10, 2.5], [7.3, 0.9]]) {
        const h = math.evaluate(explicit, { A, [letter]: other });
        assert.ok(Math.abs(k * other * h - A) < 1e-9, `${key} solves A=${k}${letter}h`);
      }
    }
    assert.equal(q.solutionReview.answerSummary, `$h=A/(${k}${letter})$`);
    assert.equal(q.solutionReview.reasoning[0], `In $A=${k}${letter}h$, the target $h$ is multiplied by both ${k} and $${letter}$.`);
    assert.equal(q.solutionReview.reasoning[1], `Divide by the entire product $${k}${letter}$ to obtain $h=A/(${k}${letter})$.`);
    const otherLetter = letter === 'b' ? 'w' : 'b';
    // Equivalent spellings a student writes: either factor order, either
    // division order, with or without grouping.
    const spellings = [`A/(${k}*${letter})`, `A/(${letter}*${k})`, `(A/${k})/${letter}`, `A/${letter}/${k}`, `(A/${letter})/${k}`];
    for (const spelling of spellings) {
      const h = math.evaluate(spelling, { A: 10, [letter]: 2.5 });
      assert.ok(Math.abs(k * 2.5 * h - 10) < 1e-9, `${spelling} solves A=${k}${letter}h`);
    }
    return {
      key: field.expected,
      correct: [field.expected, ...field.accepted, ...spellings].map((answer) => ({ responses: { answer } })),
      wrong: [{ responses: { answer: `A/${k}` } }, { responses: { answer: `A/(${k}${otherLetter})` } }],
    };
  },

  'mm_A_2A_v2_discrete-mapping-domain-range': (q) => {
    const named = [...q.prompt.matchAll(/\$\((-?\d+), (-?\d+)\)\$/g)].map((match) => [+match[1], +match[2]]);
    const shown = q.pairs.map((pair) => [numeric(pair.x), numeric(pair.y)]);
    assert.deepEqual(named, shown, 'the prompt names exactly the mapped pairs, in order');
    const xs = shown.map(([x]) => x);
    const ys = shown.map(([, y]) => y);
    assert.equal(new Set(xs).size, xs.length, 'every input appears once: a function, as the prompt says');
    // Linear, as the prompt says: an independent least-squares fit is exact.
    const X = math.matrix(xs.map((x) => [1, x]));
    const beta = math.lusolve(math.multiply(math.transpose(X), X), math.multiply(math.transpose(X), math.matrix(ys)));
    xs.forEach((x, index) => {
      assert.ok(Math.abs(beta.get([0, 0]) + beta.get([1, 0]) * x - ys[index]) < 1e-9, 'pairs lie on one line');
    });
    const domain = [...new Set(xs)].sort((a, b) => a - b);
    const range = [...new Set(ys)].sort((a, b) => a - b);
    assert.notDeepEqual(domain, range, 'a domain/range swap is never also correct');
    return {
      key: JSON.stringify({ domain, range }),
      correct: [{ raw: { domain, range, isFunction: 'yes-definition' } }],
      wrong: [
        { raw: { domain: range, range: domain, isFunction: 'yes-definition' } },
        { raw: { domain, range, isFunction: 'no-input-repeat' } },
      ],
    };
  },

  'mm_A_9B_v2_growth-factor': (q) => {
    const match = /^A student says a model that multiplies by (\d+) each (\w+) has a growth factor of (\d+)%\./.exec(q.prompt);
    assert.ok(match, q.prompt);
    assert.equal(match[1], match[3]);
    const factor = Number(match[1]);
    const unit = match[2];
    assert.ok(['period', 'year', 'month', 'week', 'day', 'hour'].includes(unit));
    // The growth factor of y = a * b^t is y(t + 1) / y(t), whatever a is.
    const a = 37;
    const ratio = math.divide(math.multiply(a, math.pow(factor, 5)), math.multiply(a, math.pow(factor, 4)));
    assert.equal(Number(q.responseFields[0].expected), ratio);
    assert.equal(q.solutionReview.reasoning[0], `The factor is the number multiplied by the previous value each ${unit}.`);
    assert.equal(q.solutionReview.reasoning[1], `Because the quantity is multiplied by ${factor}, the model's growth factor is ${factor}.`);
    assert.equal(q.solutionReview.answerSummary, `Growth factor ${factor}.`);
    return {
      key: String(ratio),
      correct: [{ responses: { answer: String(ratio) } }],
      wrong: [{ responses: { answer: String(factor / 100) } }, { responses: { answer: String(factor - 1) } }],
    };
  },

  'mm_A_9D_v2_context-decay-graph': (q) => {
    const match = /^A measured quantity starts at (\d+) and retains (\d+)% each period\./.exec(q.prompt);
    assert.ok(match, q.prompt);
    const start = Number(match[1]);
    const percent = Number(match[2]);
    assert.ok(percent > 0 && percent < 100, 'decay retains between 0% and 100%');
    const base = math.fraction(percent, 100);
    assert.equal(numeric(q.functionSpec.a), start);
    assert.equal(numeric(q.functionSpec.base), percent / 100);
    assert.equal(numeric(q.functionSpec.k), 0);
    const { graph } = q;
    const inWindow = (x, y) => x >= graph.xMin && x <= graph.xMax && y >= graph.yMin && y <= graph.yMax;
    const onGrid = (value) => Math.abs(Math.round(value / graph.snapStep) * graph.snapStep - value) < 1e-12;
    const placements = {};
    q.pointTasks.forEach((task, index) => {
      const x = index;
      const y = math.number(math.multiply(math.fraction(start), math.pow(base, x)));
      assert.equal(numeric(task.x), x);
      assert.deepEqual(task.expected.map(numeric), [x, y], `${task.id} is (${x}, ${y})`);
      assert.ok(inWindow(x, y), `${task.id} (${x}, ${y}) is inside the window`);
      assert.ok(onGrid(x) && onGrid(y), `${task.id} (${x}, ${y}) is on the ${graph.snapStep} snap grid`);
      placements[task.id] = [x, y];
    });
    const yint = q.analysisRequests.find((part) => part.id === 'yint');
    const asym = q.analysisRequests.find((part) => part.id === 'asym');
    assert.equal(numeric(yint.expected[0]), math.evaluate(`${start} * (${percent}/100)^0`));
    assert.equal(numeric(asym.expected[0]), 0);
    assert.ok(inWindow(0, start), 'the y-intercept is inside the window');
    assert.ok(graph.yMin < 0 && graph.yMax > 0, 'the asymptote y = 0 is inside the window');
    assert.equal(q.solutionReview.reasoning[0], `${percent}% retained corresponds to base ${percent / 100}, so each plotted output is ${percent / 100} times the previous one.`);
    assert.equal(q.solutionReview.answerSummary, `y-intercept ${start}; asymptote $y=0$.`);
    return {
      key: JSON.stringify(placements),
      correct: [{ raw: { placements, answers: { yint: String(start), asym: '0' } } }],
      wrong: [
        { raw: { placements, answers: { yint: String(start), asym: String(start) } } },
        { raw: { placements: { ...placements, p1: [1, start] }, answers: { yint: String(start), asym: '0' } } },
      ],
    };
  },
};

// --- Pinned committed values -----------------------------------------------------
//
// Taken from the committed drafts before the widening. Widening varies numbers
// and context nouns only; nothing below may move.

const COMMITTED = {
  'A.12A': { id: 'mm_A_12A_v2_mapping-nonfunction', familyId: 'mathmaster:A.12A:v2-mapping-nonfunction', familyVersion: 3, courseId: 'algebra1', alignmentKeys: ['texas:A.12A'], assessedConstruct: 'A.12A', type: 'relationMapping', questionType: 'response', representation: 'orderedPairs', taskType: 'conceptual', difficultyBand: 2, dok: 1, activityRole: 'practice', calculatorPolicy: 'inherit', ask: ['isFunction'], pairCount: 3 },
  'A.12D': { id: 'mm_A_12D_v2_geometric-decay-terms-to-formula', familyId: 'mathmaster:A.12D:v2-geometric-decay-terms-to-formula', familyVersion: 3, courseId: 'algebra1', alignmentKeys: ['texas:A.12D'], assessedConstruct: 'A.12D', questionType: 'response', representation: 'verbal', taskType: 'representationTranslation', difficultyBand: 3, dok: 2, activityRole: 'practice', calculatorPolicy: 'inherit', responseFields: [{ id: 'formula', label: '$f(n)=$', inputProfile: 'expression' }] },
  'A.12E': { id: 'mm_A_12E_v2_solve-area-height', familyId: 'mathmaster:A.12E:v2-solve-area-height', familyVersion: 3, courseId: 'algebra1', alignmentKeys: ['texas:A.12E'], assessedConstruct: 'A.12E', questionType: 'response', representation: 'symbolic', taskType: 'errorAnalysis', difficultyBand: 3, dok: 3, activityRole: 'practice', calculatorPolicy: 'inherit', responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'expression' }] },
  'A.2A': { id: 'mm_A_2A_v2_discrete-mapping-domain-range', familyId: 'mathmaster:A.2A:v2-discrete-mapping-domain-range', familyVersion: 3, courseId: 'algebra1', alignmentKeys: ['texas:A.2A'], assessedConstruct: 'A.2A', type: 'relationMapping', questionType: 'response', representation: 'orderedPairs', taskType: 'representationTranslation', difficultyBand: 3, dok: 2, activityRole: 'practice', calculatorPolicy: 'inherit', ask: ['domain', 'range', 'isFunction'], pairCount: 4 },
  'A.9B': { id: 'mm_A_9B_v2_growth-factor', familyId: 'mathmaster:A.9B:v2-growth-factor', familyVersion: 3, courseId: 'algebra1', alignmentKeys: ['texas:A.9B'], assessedConstruct: 'A.9B', questionType: 'response', representation: 'verbal', taskType: 'errorAnalysis', difficultyBand: 3, dok: 2, activityRole: 'practice', calculatorPolicy: 'inherit', responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number' }] },
  'A.9D': { id: 'mm_A_9D_v2_context-decay-graph', familyId: 'mathmaster:A.9D:v2-context-decay-graph', familyVersion: 3, courseId: 'algebra1', alignmentKeys: ['texas:A.9D'], assessedConstruct: 'A.9D', type: 'functionInvestigation', questionType: 'response', representation: 'context', taskType: 'modeling', difficultyBand: 3, dok: 3, activityRole: 'practice', calculatorPolicy: 'inherit', pointTasks: [{ id: 'p0', label: 'Period 0', x: 0 }, { id: 'p1', label: 'Period 1', x: 1 }, { id: 'p2', label: 'Period 2', x: 2 }], analysisRequests: [{ id: 'yint', label: 'y-intercept value', kind: 'value', responseMode: 'text' }, { id: 'asym', label: 'horizontal asymptote y-value', kind: 'value', responseMode: 'text' }], graph: { xMin: -1, xMax: 6, yMin: -2, yMax: 60, snapStep: 0.25 }, functionSpecType: 'exponential' },
};

const IDENTITY_FIELDS = ['id', 'familyId', 'familyVersion', 'courseId', 'alignmentKeys', 'assessedConstruct', 'type', 'questionType', 'representation', 'taskType', 'difficultyBand', 'dok', 'activityRole', 'calculatorPolicy'];

const shapeOf = (template) => {
  const shape = {};
  for (const field of IDENTITY_FIELDS) if (template[field] !== undefined) shape[field] = template[field];
  if (template.responseFields) shape.responseFields = template.responseFields.map((field) => ({ id: field.id, label: field.label, inputProfile: field.inputProfile }));
  if (template.pointTasks) shape.pointTasks = template.pointTasks.map((task) => ({ id: task.id, label: task.label, x: task.x }));
  if (template.analysisRequests) {
    shape.analysisRequests = template.analysisRequests.map((part) => {
      const out = { id: part.id, label: part.label, kind: part.kind, responseMode: part.responseMode };
      if (part.notation !== undefined) out.notation = part.notation;
      return out;
    });
  }
  if (template.ask) shape.ask = template.ask;
  if (template.graph) shape.graph = template.graph;
  if (template.functionSpec) shape.functionSpecType = template.functionSpec.type;
  if (template.pairs) shape.pairCount = template.pairs.length;
  return shape;
};

const TEMPLATES = Object.entries(COMMITTED).map(([standard, pinned]) => ({
  standard,
  pinned,
  template: loadTemplate(standard, pinned.id),
}));

const grade = async (question, payload) => {
  const plan = await mathPath.buildIssuePlan(question);
  assert.equal(plan.issuable, true, `${question.id} instance is issuable (${plan.reason})`);
  return mathPath.gradePathToolResponse(plan.privateGrading, payload);
};

for (const { standard, pinned, template } of TEMPLATES) {
  test(`${pinned.id}: identity, metadata and response shape are unchanged`, () => {
    assert.deepEqual(shapeOf(template), pinned);
    // No answer is ever pinned in plain text: every key that varies is templated.
    if (template.type === 'functionInvestigation') {
      assert.deepEqual(template.analysisRequests.find((part) => part.id === 'asym').expected, ['0']);
    }
  });

  test(`${pinned.id}: widened to ${TARGET_DISTINCT}+ distinct probe draws, or withheld while its answer never changes`, (t) => {
    const distinct = distinctProbeQuestions(template);
    const answers = new Set();
    for (let draw = 0; draw < ORACLE_DRAWS; draw += 1) {
      answers.add(ORACLES[pinned.id](generatePathInstance(template, `widening-oracle-${draw}`).question).key);
    }
    t.diagnostic(`${standard} ${pinned.id}: ${distinct} distinct of ${RECAP_INSTANCE_DRAWS}; ${answers.size} distinct correct answers in ${ORACLE_DRAWS} draws`);
    if (answers.size === 1) {
      // One answer for every draw: a recap that showed it would be the key to
      // the next draw. It must stay below the floor so its recap withholds it.
      assert.ok(distinct < RECAP_MIN_DISTINCT_INSTANCES, `${pinned.id} has one answer for every draw, so it must stay withheld (drew ${distinct} distinct)`);
      assert.ok(RECAP_WITHHELD_TEMPLATE_IDS.includes(pinned.id), `${pinned.id} is on the recap withheld list`);
      return;
    }
    assert.ok(distinct >= RECAP_MIN_DISTINCT_INSTANCES, `${pinned.id} is above the recap floor of ${RECAP_MIN_DISTINCT_INSTANCES} (drew ${distinct})`);
    assert.ok(distinct >= TARGET_DISTINCT, `${pinned.id} reaches the widening target of ${TARGET_DISTINCT} (drew ${distinct})`);
  });

  test(`${pinned.id}: ${ORACLE_DRAWS} draws are correct by an independent oracle and graded correctly in production`, async () => {
    const oracle = ORACLES[pinned.id];
    for (let draw = 0; draw < ORACLE_DRAWS; draw += 1) {
      const generated = generatePathInstance(template, `widening-oracle-${draw}`);
      assert.ok(generated.question, `${pinned.id} draw ${draw} generated (${generated.reason})`);
      const question = generated.question;
      const text = JSON.stringify(question);
      assert.doesNotMatch(text, /\{\{|NaN|undefined|Infinity/, `${pinned.id} draw ${draw} is fully substituted`);
      const { correct, wrong } = oracle(question);
      for (const payload of correct) {
        // eslint-disable-next-line no-await-in-loop
        const result = await grade(question, payload);
        assert.equal(result.isCorrect, true, `${pinned.id} draw ${draw}: its own key ${JSON.stringify(payload)} is marked correct`);
      }
      for (const payload of wrong) {
        // eslint-disable-next-line no-await-in-loop
        const result = await grade(question, payload);
        assert.equal(result.isCorrect, false, `${pinned.id} draw ${draw}: ${JSON.stringify(payload)} is marked wrong`);
      }
    }
  });

  test(`${pinned.id}: passes the production template issue gate`, async () => {
    const plan = await mathPath.buildTemplateIssuePlan(template, { samples: 16 });
    assert.deepEqual(plan, { issuable: true, reason: null, samples: 16 });
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { create, all } from 'mathjs';
import Fraction from 'fraction.js';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import mathPath from '../../functions/lib/mathPath.js';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { gradeComposedWorkflowWork } from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import { resolveComposedWorkflow } from '../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import { resolveWorkflowGraphStages, workflowTableArtifact } from '../../functions/shared/toolMath/workflow/workflowGraphStage.mjs';
import { POINT_INPUT_NONE_TOKEN } from '../../functions/shared/toolMath/workflow/workflowGrading.mjs';
import { graphWorkspaceModelFor } from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import { resolveGraphWorkspaceMode } from '../../functions/shared/serverGrading/declarations/graphWorkspace.mjs';

/*
 * JOB K SWEEP — EVERY AUTHORED V5 / TEACHER-IMPORT ASSIGNMENT, GRADED THE WAY A
 * STUDENT IS GRADED.
 *
 * The shard: teacher-import-jsons/** (District DOL1 and the seven Algebra 2
 * Honors module-1 lessons), drafts/district-dol2/assignment.json (7 review
 * tasks × 48 variants), the secure DOL2 bank in functions/seeds/
 * secureAssessments (13 families × 64 variants) and src/demo/
 * demoAssignmentBank.json (14 assignments). The other JSON under drafts/** is
 * Path / CCMR bank documents, swept by their own lanes. The V5 lessons kept
 * under docs/assignments/ and SAMPLE_AUTHORING_INTENT_V5.json are swept by
 * kSweep_v5DocsAssignments.test.mjs.
 *
 * Each V5 file is compiled through parseAssignmentBlueprintText (the teacher
 * import path, which runs compileAuthoringIntentV5), then every item is graded
 * by the production grader for its surface: gradeServerResponse for ordinary
 * fields and composed workflows, gradeToolWork for the registry tools,
 * mathPath.gradeResponse for the secure bank, and generateQuestion followed by
 * gradeServerResponse for the demo bank (QuestionEngine generates every
 * question before it renders). For each item:
 *
 *   - the item's key, recomputed HERE from the prompt (mathjs / fraction.js or
 *     by hand in the tables below), never read back from the compiled key;
 *   - every distractor of a choice field is graded wrong;
 *   - the equivalent spellings a student types are graded right.
 *
 * Spellings deliberately NOT asserted, because the grader that owns them is
 * outside this lane and the fix is reported instead: a thousands separator in
 * a number box ("25,000"), "+∞" in a graph-analysis interval, a lowercase "u"
 * union in the number-line tool, braces or "−" in the relation tool's domain
 * and range boxes, "−" in the polynomial coefficient list, and re-spelled
 * coordinates in the secure bank's ordered-pair fields.
 *
 * Two item-data fixes are pinned here, and each test below fails on the old
 * data:
 *   - DOL2 review "Linear graph features": the intercept fields now declare
 *     answerFormat 'orderedPair', so "(-3.0, 0)" or "-3, 0" are the point
 *     (-3, 0) and not a text mismatch;
 *   - the demo bank's fifteen "Solve ax + b = c" items were type 'algebra'
 *     with no equation: generateQuestion re-drew a, b, c and graded a random
 *     generatedAnswer the student never saw, and the balance workspace had no
 *     equation to open. They now author the equation the prompt states.
 */

const math = create(all, {});
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const readJson = (path) => JSON.parse(read(path));

const V5_FILES = [
  'teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json',
  ...['L1_Absolute_Value_ALEKS_Bridge_20260828', 'L1_Day1_Interval_Domain_Range', 'L1_Day2_Function_Attributes_Relations',
    'L2_Day1_Parent_Functions_Key_Attributes', 'L2_Day2_Transformations', 'L3_Inverse_Linear_Functions',
    'L4_Operations_on_Functions_Composition'].map((name) => `teacher-import-jsons/algebra2-honors-module1/${name}.json`),
];
const SHORT = { District_DOL1_Technology_Graph_Analysis_Review: 'DOL1', L1_Absolute_Value_ALEKS_Bridge_20260828: 'ABS',
  L1_Day1_Interval_Domain_Range: 'L1D1', L1_Day2_Function_Attributes_Relations: 'L1D2', L2_Day1_Parent_Functions_Key_Attributes: 'L2D1',
  L2_Day2_Transformations: 'L2D2', L3_Inverse_Linear_Functions: 'L3', L4_Operations_on_Functions_Composition: 'L4' };

// Every compiled question, keyed "<lesson>#<position>", with its authored source.
const ITEMS = new Map(V5_FILES.flatMap((file) => {
  const text = read(file);
  const source = JSON.parse(text).sections.flatMap((section) => section.questions);
  const short = SHORT[file.split('/').pop().replace(/\.json$/, '')];
  return parseAssignmentBlueprintText(text).questions.map((question, index) => [`${short}#${index}`, { question, source: source[index] }]);
}));
const item = (id, promptFragment) => {
  const found = ITEMS.get(id);
  assert.ok(found, `${id} exists`);
  if (promptFragment) assert.ok(String(found.question.prompt).includes(promptFragment), `${id} is the item that asks "${promptFragment}"`);
  return found.question;
};

/* ------------------------------------------------------------ spellings -- */

const minus = (value) => String(value).replace(/-/g, '−');
// A number as a student may type it: padded, signed, a trailing zero, an
// unreduced fraction, a reduced fraction for a decimal, a leading-dot decimal.
const numberSpellings = (raw) => {
  const text = String(raw).trim();
  const exact = new Fraction(text);
  const out = new Set([text, ` ${text} `]);
  if (exact.s > 0n) out.add(`+${text}`); else out.add(minus(text));
  if (exact.d === 1n) {
    out.add(`${exact.toFraction()}.0`);
    out.add(`${exact.mul(2).toFraction()}/2`);
  } else {
    out.add(exact.toFraction());
    out.add(`${exact.n * 2n * exact.s}/${exact.d * 2n}`);
    out.add(`${text}0`);
    if (Math.abs(Number(text)) < 1) out.add(text.replace(/^(-?)0\./, '$1.'));
  }
  return [...out];
};
// A finite set: spaced, reversed, MathLive braces, a "−", one element re-spelled.
const setSpellings = (values) => {
  const items = values.map(String);
  const out = new Set([`{${items.join(',')}}`, `{${items.join(', ')}}`, `{ ${[...items].reverse().join(' , ')} }`,
    `\\{${items.join(',')}\\}`, `\\left\\{${items.join(',')}\\right\\}`, `{${items.map(minus).join(', ')}}`]);
  items.forEach((entry, index) => numberSpellings(entry).filter((alt) => !/\s/.test(alt)).forEach((alt) => {
    const copy = [...items]; copy[index] = alt; out.add(`{${copy.join(', ')}}`);
  }));
  return [...out];
};
// An ordered pair as typed: spaced, "−", a re-spelled coordinate, MathLive, no parentheses.
const pairSpellings = ([x, y]) => [`(${x},${y})`, `(${x}, ${y})`, ` ( ${x} , ${y} ) `, `(${minus(x)}, ${minus(y)})`,
  `(${x}.0, ${y})`, `(${x}, ${y}.0)`, `(${2 * x}/2, ${y})`, `(${x}, +${y})`.replace('+-', '-'), `\\left(${x},${y}\\right)`, `${x}, ${y}`];
// Interval notation from pieces [[lo, hi, loClosed, hiClosed]] (null = infinite).
const intervalText = (pieces, { inf = '∞', sep = ', ', join = ' ∪ ', neg = '-' } = {}) => pieces.map(([lo, hi, loC, hiC]) => (
  `${lo === null || !loC ? '(' : '['}${lo === null ? `${neg}${inf}` : String(lo).replace('-', neg)}${sep}${hi === null ? inf : String(hi).replace('-', neg)}${hi === null || !hiC ? ')' : ']'}`
)).join(join);
const intervalSpellings = (pieces) => [...new Set([
  intervalText(pieces), intervalText(pieces, { sep: ',', join: '∪' }), intervalText(pieces, { inf: '\\infty', sep: ',', join: '\\cup ' }),
  intervalText(pieces, { join: ' U ', neg: '−' }), intervalText(pieces, { sep: ' , ' }), intervalText([...pieces].reverse()),
  pieces.map((piece) => intervalText([piece], { inf: '\\infty', sep: ',' }).replace(/^([[(])(.*)([\])])$/, '\\left$1$2\\right$3')).join('\\cup'),
])];

/* --------------------------------------------- V5 imports: ordinary fields -- */

// Independent keys, worked from each prompt with mathjs. A number is the
// field's value; an expression is checked by evaluation at sample inputs —
// `inverseOf` keys must undo the stated f, `equals` keys must agree with the
// expression built here from the stated f and g.
const NUMBER_KEYS = {
  'DOL1#15': ['starts at 7 and each term is 4 more', { a2: '7+4', a3: '7+2*4', a5: '7+4*4' }],
  'DOL1#24': ['starts at 3 and each term is twice', { g2: '3*2', g3: '3*2^2', g5: '3*2^4' }],
  'DOL1#34': ['starts at 20 and each term is 3 less', { a4: '20-3*3' }],
  'L3#0': ['ordered pairs and function notation', { eval: '2*4-5' }],
  'L3#4': ['If f(6)=2', { input: '2', output: '6' }],
  'L3#9': ['E(s)=2200+0.05s', { sales: '(3450-2200)/0.05' }],
  'L3#14': ['C(h)=40+65h', { time: '(235-40)/65' }],
  'L3#18': ['C(m)=15m+25', { months: '(115-25)/15' }],
  'L4#1': ['f(2)=7 and g(2)=−3', { sum: '7+(-3)', difference: '7-(-3)' }],
  'L4#2': ['g(4)=2 and f(2)=9', { inside: '2', composition: '9' }],
  'L4#9': ['r(x)=x−100 and t(x)=0.96x', { beforeTax: '0.96*(1500-100)', afterTax: '0.96*1500-100' }],
};
const EXPRESSION_KEYS = {
  'L3#5': ['f(x)=3x−7', { inverse: { inverseOf: '3x-7' } }],
  'L3#6': ['f(x)=−4x+12', { inverse: { inverseOf: '-4x+12' }, slope: { equals: '-1/4' } }],
  'L3#8': ['f(x)=12−9x', { inverse: { inverseOf: '12-9x' } }],
  'L3#9': ['E(s)=2200+0.05s', { inverse: { inverseOf: '2200+0.05x' } }],
  'L3#11': ['f(x)=5x+10', { inverse: { inverseOf: '5x+10' }, slope: { equals: '1/5' } }],
  'L3#12': ['f(x)=−2x−6', { inverse: { inverseOf: '-2x-6' } }],
  'L3#14': ['C(h)=40+65h', { inverse: { inverseOf: '40+65x' } }],
  'L3#17': ['f(x)=4x−9', { inverse: { inverseOf: '4x-9' } }],
  'L3#18': ['C(m)=15m+25', { inverse: { inverseOf: '15x+25' } }],
  'L4#0': ['f(x)=2x+5', { inverse: { inverseOf: '2x+5' } }],
  'L4#3': ['f(x)=3x²+7x and g(x)=2x²−x−1', { sum: { equals: '(3x^2+7x)+(2x^2-x-1)' }, difference: { equals: '(3x^2+7x)-(2x^2-x-1)' } }],
  'L4#4': ['f(x)=3x²−2x+1 and g(x)=x−4', { product: { equals: '(3x^2-2x+1)*(x-4)' } }],
  'L4#6': ['f(x)=3x²−2x+1 and g(x)=x−4', { quotient: { equals: '(3x^2-2x+1)/(x-4)' } }],
  'L4#8': ['f(x)=3x²−x+4 and g(x)=2x−1', { fog: { equals: '3(2x-1)^2-(2x-1)+4' }, gof: { equals: '2(3x^2-x+4)-1' } }],
  'L4#10': ['f(x)=3x−6 and g(x)=(x+6)/3', { fog: { equals: '3((x+6)/3)-6' }, gof: { equals: '((3x-6)+6)/3' } }],
  'L4#11': ['f(x)=2x²+5x+2 and g(x)=3x²+3x−4', { sum: { equals: '(2x^2+5x+2)+(3x^2+3x-4)' }, difference: { equals: '(2x^2+5x+2)-(3x^2+3x-4)' } }],
  'L4#13': ['f(x)=2x²+3x−1 and g(x)=x+2', { quotient: { equals: '(2x^2+3x-1)/(x+2)' } }],
  'L4#15': ['f(x)=x²+2x+3 and g(x)=x+5', { fog: { equals: '(x+5)^2+2(x+5)+3' }, gof: { equals: '(x^2+2x+3)+5' } }],
  'L4#16': ['f(x)=0.5x+4 and g(x)=2x−8', { fog: { equals: '0.5(2x-8)+4' }, gof: { equals: '2(0.5x+4)-8' } }],
  'L4#17': ['f(x)=x²−2x+3 and g(x)=2x+1', { fog: { equals: '(2x+1)^2-2(2x+1)+3' }, gof: { equals: '2(x^2-2x+3)+1' } }],
  'L4#18': ['f(x)=x+4 and g(x)=x−4', { product: { equals: '(x+4)(x-4)' } }],
  'L4#19': ['f(x)=4x+1 and g(x)=(x−1)/4', { fog: { equals: '4((x-1)/4)+1' }, gof: { equals: '((4x+1)-1)/4' } }],
};
const asMathjs = (text) => String(text).replace(/[−–]/g, '-').replace(/²/g, '^2').replace(/³/g, '^3').replace(/⁴/g, '^4');
const SAMPLES = [-3, -0.5, 1.25, 2, 7];
const sameAt = (left, right) => SAMPLES.every((x) => Math.abs(math.evaluate(asMathjs(left), { x }) - math.evaluate(asMathjs(right), { x })) < 1e-9);
const undoes = (inverse, f) => SAMPLES.every((x) => Math.abs(math.evaluate(asMathjs(inverse), { x: math.evaluate(asMathjs(f), { x }) }) - x) < 1e-9);

const fieldsResponse = (question, overrides = {}) => ({
  kind: 'fields',
  type: 'multiAnswer',
  value: '',
  fields: question.answerFields.map((field) => ({ id: field.id, value: String(overrides[field.id] ?? field.answer), isComplete: true })),
});

test('V5 imports: every multiAnswer key is the prompt\'s answer, every distractor is wrong, numeric spellings are right', () => {
  const counts = { items: 0, fields: 0, spellings: 0 };
  for (const [id, { question }] of ITEMS) {
    if (question.type !== 'multiAnswer' || question.generator) continue;
    counts.items += 1;
    const [numberFragment, numberKeys = {}] = NUMBER_KEYS[id] || [];
    const [expressionFragment, expressionKeys = {}] = EXPRESSION_KEYS[id] || [];
    if (numberFragment) item(id, numberFragment);
    if (expressionFragment) item(id, expressionFragment);
    // The independent value goes in, not the compiled key.
    const independent = Object.fromEntries(Object.entries(numberKeys).map(([fieldId, expression]) => [fieldId, String(math.evaluate(expression))]));
    const key = gradeServerResponse({ question, response: fieldsResponse(question, independent) });
    assert.equal(key.isCorrect, true, `${id}: the prompt's answer grades right`);
    for (const field of question.answerFields) {
      counts.fields += 1;
      if (field.options) {
        const check = expressionKeys[field.id];
        if (check?.inverseOf) assert.ok(undoes(field.answer, check.inverseOf), `${id}.${field.id}: ${field.answer} undoes ${check.inverseOf}`);
        if (check?.equals) assert.ok(sameAt(field.answer, check.equals), `${id}.${field.id}: ${field.answer} = ${check.equals}`);
        for (const option of field.options) {
          counts.spellings += 1;
          const result = gradeServerResponse({ question, response: fieldsResponse(question, { [field.id]: option }) });
          assert.equal(result.isCorrect, option === field.answer, `${id}.${field.id}: option "${option}"`);
        }
        continue;
      }
      assert.ok(numberKeys[field.id], `${id}.${field.id} has an independent key`);
      for (const spelling of numberSpellings(independent[field.id])) {
        counts.spellings += 1;
        const result = gradeServerResponse({ question, response: fieldsResponse(question, { ...independent, [field.id]: spelling }) });
        assert.equal(result.isCorrect, true, `${id}.${field.id}: "${spelling}"`);
      }
    }
  }
  assert.ok(counts.items >= 60 && counts.fields >= 150, JSON.stringify(counts));
  console.log('kSweep V5 multiAnswer', counts);
});

test('V5 imports: the generated "maximum of |x| on [−a, b]" item grades max(a, b) on every sampled seat', () => {
  const template = item('ABS#17', 'maximum value of $p$');
  for (let seat = 0; seat < 8; seat += 1) {
    const { question } = resolveFamilyQuestionInstance({ question: template, assignmentId: 'k-sweep', storageIndex: 17, allocation: { seat } });
    const [, a, b] = question.prompt.match(/\$-(\d+)\\le x\\le (\d+)\$/).map(Number);
    for (const spelling of numberSpellings(Math.max(a, b))) {
      const result = gradeServerResponse({ question, response: { kind: 'fields', type: 'multiAnswer', value: '', fields: [{ id: 'answer', value: spelling, isComplete: true }] } });
      assert.equal(result.isCorrect, true, `seat ${seat}: "${spelling}" for [−${a}, ${b}]`);
    }
    const wrong = gradeServerResponse({ question, response: { kind: 'fields', type: 'multiAnswer', value: '', fields: [{ id: 'answer', value: String(Math.min(a, b)), isComplete: true }] } });
    assert.equal(wrong.isCorrect, false, `seat ${seat}: the smaller endpoint is wrong`);
  }
});

/* ---------------------------------------------------- V5 imports: tools -- */

const INTERVAL_LINE = {
  'L1D1#0': ['Graph −4 ≤ x < 3', [[-4, 3, true, false]]],
  'L1D1#1': ['Graph x > 2', [[2, null, false, false]]],
  'L1D1#2': ['Graph x ≤ −5 or x > 1', [[null, -5, false, true], [1, null, false, false]]],
  'L1D1#3': ['Graph −3 ≤ x < 5', [[-3, 5, true, false]]],
  'L1D1#4': ['Graph x < −2 or x ≥ 4', [[null, -2, false, false], [4, null, true, false]]],
  'L1D1#9': ['Graph −1 < x ≤ 6', [[-1, 6, false, true]]],
  'L1D1#10': ['Graph x ≤ −4 or x ≥ 3', [[null, -4, false, true], [3, null, true, false]]],
  'L1D1#14': ['Graph x < −1 or 2 ≤ x ≤ 5', [[null, -1, false, false], [2, 5, true, true]]],
  'L1D2#1': ['Graph −2 ≤ x < 4', [[-2, 4, true, false]]],
};

test('V5 imports: number-line items accept the graph and every interval spelling of the stated inequality', () => {
  let spellings = 0;
  for (const [id, [fragment, pieces]] of Object.entries(INTERVAL_LINE)) {
    const question = item(id, fragment);
    assert.equal(question.type, 'intervalNumberLine');
    const graph = pieces.map(([min, max, minClosed, maxClosed]) => ({ min: min ?? -Infinity, max: max ?? Infinity, minClosed, maxClosed }));
    for (const intervals of [graph, [...graph].reverse()]) {
      for (const notation of intervalSpellings(pieces)) {
        spellings += 1;
        const result = gradeToolWork({ toolId: 'intervalNumberLine', question, work: { intervals, notation } });
        assert.equal(result.isCorrect, true, `${id}: ${notation}`);
      }
    }
  }
  assert.equal(Object.keys(INTERVAL_LINE).length, [...ITEMS.values()].filter(({ question }) => question.type === 'intervalNumberLine').length);
  console.log('kSweep number line', { items: Object.keys(INTERVAL_LINE).length, spellings });
});

// Worked by hand from each stated function. Pieces as above; 'none' is an
// interval the function never has; a point list is a clicked feature.
const R = [[null, null]];
const GRAPH_ANALYSIS = {
  'L1D1#5': ['f(x) = 2x − 1 restricted to −3 ≤ x < 4', { domain: [[-3, 4, true, false]], range: [[-7, 7, true, false]] }],
  'L1D1#6': ['f(x) = −(x − 1)² + 4', { domain: R, range: [[null, 4, false, true]] }],
  'L1D1#7': ['f(x) = √(x + 2) + 1', { domain: [[-2, null, true]], range: [[1, null, true]] }],
  'L1D1#11': ['f(x) = |x − 2| − 3', { domain: R, range: [[-3, null, true]] }],
  'L1D1#12': ['f(x) = 1/(x + 1)', { domain: [[null, -1], [-1, null]], range: [[null, 0], [0, null]] }],
  'L1D1#15': ['f(x) = (x + 2)² − 5', { domain: R, range: [[-5, null, true]] }],
  'L1D2#0': ['f(x) = |x + 1| − 2', { domain: R, range: [[-2, null, true]] }],
  'L1D2#3': ['f(x) = (x − 2)² − 4', { increasing: [[2, null]], decreasing: [[null, 2]] }],
  'L1D2#4': ['f(x) = −(x − 1)² + 4', { positive: [[-1, 3]], negative: [[null, -1], [3, null]] }],
  'L1D2#5': ['f(x) = |x + 2| − 3', { increasing: [[-2, null]], decreasing: [[null, -2]], positive: [[null, -5], [1, null]], negative: [[-5, 1]] }],
  'L1D2#10': ['f(x) = −2|x − 1| + 6', { increasing: [[null, 1]], decreasing: [[1, null]] }],
  'L1D2#11': ['f(x) = (x + 3)² − 9', { positive: [[null, -6], [0, null]], negative: [[-6, 0]] }],
  'L1D2#15': ['f(x) = −(x − 2)² + 9', { increasing: [[null, 2]], decreasing: [[2, null]], positive: [[-1, 5]], negative: [[null, -1], [5, null]] }],
  'L2D1#0': ['f(x) = |x|', { domain: R, range: [[0, null, true]] }],
  'L2D1#1': ['f(x) = x²', { increasing: [[0, null]], decreasing: [[null, 0]] }],
  'L2D1#3': ['f(x)=|x|', { domain: R, range: [[0, null, true]], vertex: [[0, 0]], minimum: [[0, 0]] }],
  'L2D1#4': ['f(x)=√x', { domain: [[0, null, true]], range: [[0, null, true]], 'x-intercepts': [[0, 0]], 'y-intercept': [[0, 0]] }],
  'L2D1#5': ['f(x)=x³', { domain: R, range: R, increasing: R }],
  'L2D1#6': ['f(x)=∛x', { domain: R, range: R, increasing: R }],
  'L2D1#7': ['f(x)=1/x', { domain: [[null, 0], [0, null]], range: [[null, 0], [0, null]], positive: [[0, null]], negative: [[null, 0]] }],
  'L2D1#8': ['f(x)=2ˣ', { domain: R, range: [[0, null]], increasing: R, 'y-intercept': [[0, 1]] }],
  'L2D1#9': ['f(x)=log₂(x)', { domain: [[0, null]], range: R, increasing: [[0, null]], 'x-intercepts': [[1, 0]] }],
  'L2D1#13': ['f(x)=−√x', { domain: [[0, null, true]], range: [[null, 0, false, true]], increasing: 'none', decreasing: [[0, null, true]] }],
  'L2D1#14': ['f(x)=(1/2)ˣ', { domain: R, range: [[0, null]], increasing: 'none', decreasing: R }],
  'L2D1#15': ['f(x)=log₁⁄₂(x)', { domain: [[0, null]], range: R, increasing: 'none', decreasing: [[0, null]] }],
  'L2D1#16': ['f(x)=1/x', { domain: [[null, 0], [0, null]], range: [[null, 0], [0, null]], decreasing: [[null, 0], [0, null]] }],
};
const POINT_PART = /vertex|minimum|intercept/;

test('V5 imports: graph-analysis items accept every interval spelling of the stated function\'s features', () => {
  let spellings = 0;
  for (const [id, [fragment, expected]] of Object.entries(GRAPH_ANALYSIS)) {
    const question = item(id, fragment);
    const model = graphWorkspaceModelFor(question, { analysisMode: resolveGraphWorkspaceMode(question) === 'analysis' });
    assert.deepEqual(model.analysisParts.map((part) => part.id).sort(), Object.keys(expected).sort(), `${id}: the parts asked`);
    const asText = (value) => (value === 'none' ? '∅' : intervalText(value.map(([lo, hi, loC = false, hiC = false]) => [lo, hi, loC, hiC])));
    const answers = {};
    const selections = {};
    Object.entries(expected).forEach(([partId, value]) => { if (POINT_PART.test(partId)) selections[partId] = value; else answers[partId] = asText(value); });
    const grade = (overrides) => gradeToolWork({ toolId: 'graphAnalysis', question, work: { analysis: { answers: { ...answers, ...overrides }, selections } } });
    assert.equal(grade({}).isCorrect, true, `${id}: the worked answers`);
    for (const [partId, value] of Object.entries(expected)) {
      if (POINT_PART.test(partId)) continue;
      const alternates = value === 'none' ? ['∅', 'none', '\\emptyset']
        : intervalSpellings(value.map(([lo, hi, loC = false, hiC = false]) => [lo, hi, loC, hiC]));
      for (const spelling of alternates) {
        spellings += 1;
        assert.equal(grade({ [partId]: spelling }).isCorrect, true, `${id}.${partId}: "${spelling}"`);
      }
    }
  }
  assert.equal(Object.keys(GRAPH_ANALYSIS).length, [...ITEMS.values()].filter(({ question }) => question.type === 'graphAnalysis').length);
  console.log('kSweep graph analysis', { items: Object.keys(GRAPH_ANALYSIS).length, spellings });
});

test('V5 imports: relation items accept the mapping in any order and the domain and range listed in any order', () => {
  let spellings = 0;
  const relations = [...ITEMS].filter(([, { question }]) => question.type === 'relationMapping');
  assert.equal(relations.length, 10);
  for (const [id, { question, source }] of relations) {
    // The pairs as the prompt (or, for DOL1, the authored relation) states them.
    const stated = String(source.prompt).match(/\{(\(.*\))\}/);
    const pairs = stated
      ? [...stated[1].matchAll(/\(([−-]?\d+),\s*([−-]?\d+)\)/g)].map((match) => [Number(match[1].replace('−', '-')), Number(match[2].replace('−', '-'))])
      : source.pairs.map(({ x, y }) => [x, y]);
    const xs = [...new Set(pairs.map(([x]) => x))].sort((a, b) => a - b);
    const ys = [...new Set(pairs.map(([, y]) => y))].sort((a, b) => a - b);
    const work = { arrows: pairs, plottedPoints: pairs, domainText: xs.join(', '), rangeText: ys.join(', '),
      isFunction: xs.length === pairs.length ? 'yes-definition' : 'no-input-repeat' };
    const grade = (overrides) => gradeToolWork({ toolId: 'relationMapping', question, work: { ...work, ...overrides } });
    assert.equal(grade({}).isCorrect, true, `${id}: the stated relation`);
    assert.equal(grade({ arrows: [...pairs].reverse() }).isCorrect, true, `${id}: arrows in another order`);
    for (const [box, values] of [['domainText', xs], ['rangeText', ys]]) {
      for (const spelling of [values.join(','), [...values].reverse().join(', '), values.join('; ')]) {
        spellings += 1;
        assert.equal(grade({ [box]: spelling }).isCorrect, true, `${id}.${box}: "${spelling}"`);
      }
    }
  }
  console.log('kSweep relations', { items: relations.length, spellings });
});

// Hand-worked. Images of the shown points under y = a·f(b(x − h)) + k are
// (x/b + h, a·y + k); match mode also takes another parameter set that draws
// the same graph; describe uses the lab's own option codes.
const DESCRIBE = (reflection, scaleKind, scaleFactor, horizontalDirection, horizontalDistance, verticalDirection, verticalDistance) => ({
  reflection, scaleKind, scaleFactor, horizontalReflection: 'no', horizontalScaleKind: 'unchanged', horizontalScaleFactor: '1',
  horizontalDirection, horizontalDistance, verticalDirection, verticalDistance,
});
const TRANSFORMATIONS = {
  'ABS#3': ['y=f(−x)', [{ plottedPoints: [[4, -5], [-4, -3]] }]],
  'ABS#4': ['y=−g(x)', [{ plottedPoints: [[-7, -5], [-4, -2], [4, -6]] }]],
  'ABS#5': ['y=−(x+3)³+2', [{ a: '-1', h: '-3', k: '2' }]],
  'ABS#6': ['y=(1/2)f(x)', [{ plottedPoints: [[-2, 2], [0, 0], [2, 2]] }]],
  'ABS#7': ['y=g((1/2)x)', [{ plottedPoints: [[-4, 2], [4, 4]] }]],
  'ABS#9': ['y=−|x−2|+3', [DESCRIBE('yes', 'unchanged', '1', 'right', '2', 'up', '3')]],
  'ABS#10': ['y=−g(x)+3', [{ plottedPoints: [[0, 3], [2, -1], [4, 3]] }]],
  'ABS#11': ['y=2h(x+1)', [{ plottedPoints: [[-3, -8], [-1, 0], [3, -4]] }]],
  'ABS#13': ['y=|x+2|−4', [{ a: '1', h: '-2', k: '-4' }]],
  'ABS#14': ['Graph y=−|x−2|+3', [{ plottedPoints: [[0, 1], [1, 2], [2, 3], [3, 2], [4, 1]] }]],
  'ABS#16': ['y=|2x|−4', [{ a: '1', b: '2', h: '0', k: '-4' }, { a: '2', b: '1', h: '0', k: '-4' }, { a: '1', b: '-2', h: '0', k: '-4' }]],
  'ABS#19': ['y=(1/2)|x−4|−2', [{ a: '0.5', h: '4', k: '-2' }, { a: '.5', h: '4', k: '-2' }]],
  'L2D2#3': ['absolute-value graph', [{ a: '2', h: '3', k: '-1' }]],
  'L2D2#4': ['vertical reflection, vertical scale', [DESCRIBE('yes', 'compression', '0.5', 'left', '2', 'up', '3'), DESCRIBE('yes', 'compression', '1/2', 'left', '2', 'up', '3')]],
  'L2D2#5': ['y = 2(x − 1)³ − 1', [{ mappedX: '2', mappedY: '1' }, { mappedX: '2.0', mappedY: '1' }]],
  'L2D2#6': ['exponential graph matches', [{ a: '0.5', h: '-1', k: '2' }, { a: '1', h: '0', k: '2' }]],
  'L2D2#11': ['reciprocal graph', [{ a: '3', h: '-1', k: '2' }]],
  'L2D2#12': ['transformed exponential graph', [DESCRIBE('yes', 'stretch', '2', 'right', '2', 'up', '1')]],
  'L2D2#13': ['y = 0.5√(x − 3) + 2', [{ mappedX: '7', mappedY: '3' }, { mappedX: '7', mappedY: '3.0' }]],
  'L2D2#17': ['cube-root graph', [{ a: '-2', h: '1', k: '-3' }]],
  'L2D2#19': ['$y=-3*2^(x-2)+1$', [{ mappedX: '2', mappedY: '-2' }, { mappedX: '2.0', mappedY: '-2.0' }]],
};

test('V5 imports: transformation-lab items grade the hand-worked transformation, and equivalent work, right', () => {
  for (const [id, [fragment, works]] of Object.entries(TRANSFORMATIONS)) {
    const question = item(id, fragment);
    works.forEach((work) => {
      const result = gradeToolWork({ toolId: 'transformationsLab', question, work });
      assert.equal(result.isCorrect, true, `${id} ${question.mode}: ${JSON.stringify(work)}`);
    });
  }
  assert.equal(Object.keys(TRANSFORMATIONS).length, [...ITEMS.values()].filter(({ question }) => question.type === 'transformationsLab').length);
});

const LABS = {
  'L3#7': ['undo f(x)=2x+3', 'inverseCompositionLab', { inverseAnswer: '4' }],
  'L3#13': ['undo f(x)=−3x+9', 'inverseCompositionLab', { inverseAnswer: '2' }],
  'L4#7': ['f(x)=2x+3 and g(x)=x−4', 'inverseCompositionLab', { fogAnswer: String(2 * (5 - 4) + 3), gofAnswer: String(2 * 5 + 3 - 4) }],
  'L4#14': ['f(x)=−x+6 and g(x)=3x+1 at x=2', 'inverseCompositionLab', { fogAnswer: String(-(3 * 2 + 1) + 6), gofAnswer: String(3 * (-2 + 6) + 1) }],
  'L4#5': ['f(x)=2x+3 and g(x)=x−4', 'polynomialWorkshop', { cells: ['2', '-8', '3', '-12'], expanded: '2, -5, -12' }],
  'L4#12': ['f(x)=x+5 and g(x)=2x−3', 'polynomialWorkshop', { cells: ['2', '-3', '10', '-15'], expanded: '2, 7, -15' }],
};

test('V5 imports: composition, inverse and area-model items grade the hand-worked values and their spellings right', () => {
  for (const [id, [fragment, toolId, work]] of Object.entries(LABS)) {
    const question = item(id, fragment);
    assert.equal(question.type, toolId);
    assert.equal(gradeToolWork({ toolId, question, work }).isCorrect, true, `${id}: the worked values`);
    for (const [field, value] of Object.entries(work)) {
      if (Array.isArray(value)) continue;
      const alternates = field === 'expanded' ? [value.replace(/ /g, ''), `${value},`, ` ${value} `] : [`${value}.0`, ` ${value} `];
      alternates.forEach((spelling) => assert.equal(gradeToolWork({ toolId, question, work: { ...work, [field]: spelling } }).isCorrect, true, `${id}.${field}: "${spelling}"`));
    }
  }
});

/* ---------------------------------------- V5 imports: composed workflows -- */

const ARTIFACT = '__mathmasterWorkflowArtifact';
const featureSelection = (points) => ({ [ARTIFACT]: 'featureSelection', feature: 'x', selections: points || [], none: !points, isComplete: true });
const pointsText = (points) => points.map(([x, y]) => `(${x}, ${y})`).join(', ');
const roundTo = (value) => Math.round(value * 1e9) / 1e9;

// The features of the authored function, worked here (not read from the
// compiled grading): y = mx + b, y = a(x − h)² + k, y = a·base^x + k.
const featuresOf = (fn) => {
  if (fn.family === 'linear') {
    const { m, b, domain } = fn;
    const at = (x) => m * x + b;
    const zero = -b / m;
    const inDomain = (x) => !domain || ((x > domain.min || (domain.minClosed && x === domain.min)) && (x < domain.max || (domain.maxClosed && x === domain.max)));
    const ends = domain ? [[at(domain.min), domain.minClosed], [at(domain.max), domain.maxClosed]].sort((p, q) => p[0] - q[0]) : null;
    return {
      xIntercepts: inDomain(zero) ? [[roundTo(zero), 0]] : null,
      yIntercept: [0, b],
      behavior: m > 0 ? 'Increasing everywhere' : 'Decreasing everywhere',
      domain: domain && `${domain.min} ${domain.minClosed ? '<=' : '<'} x ${domain.maxClosed ? '<=' : '<'} ${domain.max}`,
      range: ends && `${ends[0][0]} ${ends[0][1] ? '<=' : '<'} y ${ends[1][1] ? '<=' : '<'} ${ends[1][0]}`,
    };
  }
  if (fn.family === 'quadratic') {
    const { a, h, k } = fn;
    const spread = Math.sqrt(-k / a);
    return {
      xIntercepts: Number.isFinite(spread) ? [[h - spread, 0], [h + spread, 0]] : null,
      yIntercept: [0, a * h * h + k],
      extreme: { kind: a > 0 ? 'Minimum' : 'Maximum', point: [h, k] },
      axis: `x = ${h}`,
      behavior: a > 0 ? 'Decreasing, then increasing' : 'Increasing, then decreasing',
      domain: 'all real numbers',
      range: `y ${a > 0 ? '>=' : '<='} ${k}`,
    };
  }
  const { a, base, k = 0 } = fn;
  const zero = -k / a > 0 ? Math.log(-k / a) / Math.log(base) : null;
  return {
    xIntercepts: zero === null ? null : [[roundTo(zero), 0]],
    yIntercept: [0, a + k],
    asymptote: `y = ${k}`,
    behavior: base > 1 ? 'Exponential growth' : 'Exponential decay',
    domain: 'all real numbers',
    range: `y ${a > 0 ? '>' : '<'} ${k}`,
  };
};

const characteristicsResponses = (fn) => {
  const f = featuresOf(fn);
  return {
    xInterceptExists: f.xIntercepts ? 'Yes' : 'No',
    xIntercept: featureSelection(f.xIntercepts),
    xInterceptValue: f.xIntercepts ? pointsText(f.xIntercepts) : POINT_INPUT_NONE_TOKEN,
    zeros: f.xIntercepts ? `{${f.xIntercepts.map(([x]) => x).join(', ')}}` : undefined,
    yInterceptExists: 'Yes',
    yIntercept: featureSelection([f.yIntercept]),
    yInterceptValue: pointsText([f.yIntercept]),
    extremeKind: f.extreme?.kind,
    extremePoint: f.extreme && featureSelection([f.extreme.point]),
    extremeValue: f.extreme && pointsText([f.extreme.point]),
    axisOfSymmetry: f.axis,
    asymptote: f.asymptote,
    behavior: f.behavior,
    domain: f.domain,
    range: f.range,
  };
};

// Every other item, by hand from its prompt.
const COMPOSED = {
  'DOL1#1': ['function family it belongs to', { sort: { assignments: { w2a: 'linear', w2b: 'exponential', w2c: 'quadratic', w2d: 'linear' } } }],
  'DOL1#2': ['vertex of the graph shown', { choice: 'w3a' }],
  'DOL1#3': ['growth or decay', { sort: { assignments: { w4a: 'growth', w4b: 'decay', w4c: 'growth', w4d: 'decay', w4e: 'growth', w4f: 'decay' } } }],
  'DOL1#23': ['whether it is a function', { sort: { assignments: { p7a: 'function', p7b: 'notFunction', p7c: 'function', p7d: 'notFunction' } } }],
  'DOL1#5': ['at most 48 students', { continuity: 'discrete', domainDiscrete: '{0, 1, 2, ..., 48}' }],
  'DOL1#16': ['at most 30 boxes', { continuity: 'discrete', domainDiscrete: '{0, 1, 2, ..., 30}', rangeDiscrete: '{0, 4, 8, ..., 120}' }],
  'DOL1#26': ['0 gallons to 60 gallons', { continuity: 'continuous', domainContinuous: '0 <= x <= 10', rangeContinuous: '0 <= y <= 60' }],
  'L1D2#7': ['f(x) = 0.5x + 1 over x ∈ {−2, 0, 2, 4}', { rule: (x) => 0.5 * x + 1, continuity: 'discrete', domainDiscrete: '{-2, 0, 2, 4}', rangeDiscrete: '{0, 1, 2, 3}' }],
  'L1D2#8': ['chocolate bars', { quantities: { independent: 'bars', dependent: 'money' }, equation: 'M(x)=2x', rule: (x) => 2 * x, continuity: 'discrete', domainDiscrete: '{0, 1, 2, 3, ...}', rangeDiscrete: '{0, 2, 4, 6, ...}' }],
  'L1D2#13': ['f(x) = −x + 4 over x ∈ {0, 1, 2, 3, 4}', { rule: (x) => -x + 4, continuity: 'discrete', rangeDiscrete: '{0, 1, 2, 3, 4}' }],
};
// The one item not swept end to end: its graph step is a continuous sketch,
// which needs strokes (graphWorkspace's own tests cover the sketch check).
const COMPOSED_SKIPPED = ['L1D2#9'];

const composedAlternates = (stageKind, value) => {
  const text = String(value);
  const out = new Set([text.replace(/\s+/g, ''), minus(text)]);
  if (/<=|>=/.test(text)) { out.add(text.replace(/<=/g, '≤').replace(/>=/g, '≥')); out.add(text.replace(/<=/g, '\\le ').replace(/>=/g, '\\ge ')); }
  const simple = text.match(/^([xy]) (<=|>=|<|>) (-?[\d.]+)$/);
  if (simple) out.add(`${simple[3]} ${{ '<=': '>=', '>=': '<=', '<': '>', '>': '<' }[simple[2]]} ${simple[1]}`);
  if (text === 'all real numbers') ['All Real Numbers', '\\text{All Real Numbers}'].forEach((spelling) => out.add(spelling));
  if (/^\{.*\}$/.test(text) && !text.includes('...')) out.add(`{${text.slice(1, -1).split(', ').reverse().join(', ')}}`);
  if (/^\{.*\.\.\..*\}$/.test(text)) out.add(text.replace('...', '…'));
  if (/^[xy] = /.test(text)) { out.add(text.replace(' = ', '=')); out.add(text.split(' = ').reverse().join(' = ')); }
  if (stageKind === 'pointInput' && text.includes('), (')) out.add(text.split(', (').map((part, index) => (index ? `(${part}` : part)).reverse().join(', '));
  return [...out];
};

test('V5 imports: composed workflows grade the worked answers right, every distractor wrong, and accept equivalent spellings', () => {
  let spellings = 0;
  let swept = 0;
  for (const [id, { question, source }] of ITEMS) {
    if (!['figureMatch', 'graphChoicePreview', 'functionCharacteristics', 'relationshipModel', 'functionGraph'].includes(question.type)) continue;
    if (COMPOSED_SKIPPED.includes(id)) continue;
    const { composed } = resolveComposedWorkflow(question);
    let worked;
    if (question.type === 'functionCharacteristics') worked = characteristicsResponses(source.function);
    else {
      const [fragment, values] = COMPOSED[id] || [];
      assert.ok(fragment, `${id} has worked answers`);
      item(id, fragment);
      worked = values;
    }
    const responses = {};
    for (const stage of composed.workflow) {
      if (stage.kind === 'tableInput') {
        const cells = Object.fromEntries((stage.xValues || []).map((x, row) => [`${row}:y`, String(worked.rule(x))]));
        responses[stage.id] = workflowTableArtifact({ stage, cells, isComplete: true, sourceModel: worked.equation || null, content: composed.content });
      } else if (stage.kind !== 'functionGraph' && worked[stage.id] !== undefined) responses[stage.id] = worked[stage.id];
    }
    // The plotted points of a discrete graph step, at the task's x, on the rule worked above.
    resolveWorkflowGraphStages({ workflow: composed.workflow, content: composed.content, grading: composed.grading, responses }).forEach((resolution, stageId) => {
      assert.equal(resolution.status, 'ready', `${id}: the graph step opens`);
      const model = graphWorkspaceModelFor(resolution.question, {});
      assert.equal(model.pointOnly, true, `${id}: a discrete plot`);
      const placements = Object.fromEntries(model.tasks.map((task) => [task.id, [Number(task.x), worked.rule(Number(task.x))]]));
      responses[stageId] = { [ARTIFACT]: 'graph', isComplete: true, isCorrect: true, construction: { placements, pointsLocked: true }, analysis: {} };
    });
    const grade = (overrides) => gradeComposedWorkflowWork(question, { responses: { ...responses, ...overrides } });
    const key = grade({});
    assert.equal(key.isCorrect, true, `${id}: ${JSON.stringify(key.parts?.filter((part) => !part.isCorrect).map((part) => part.id))}`);
    swept += 1;
    for (const stage of composed.workflow) {
      if (!(stage.id in responses) || composed.grading?.[stage.id] === undefined) continue;
      if (Array.isArray(stage.choices) && stage.choices.length) {
        for (const choice of stage.choices) {
          const value = typeof choice === 'object' ? (choice.id ?? choice.label) : choice;
          spellings += 1;
          assert.equal(grade({ [stage.id]: value }).isCorrect, value === responses[stage.id], `${id}.${stage.id}: "${value}"`);
        }
        continue;
      }
      if (stage.kind === 'graphFeatureSelect' && responses[stage.id].selections.length > 1) {
        spellings += 1;
        assert.equal(grade({ [stage.id]: featureSelection([...responses[stage.id].selections].reverse()) }).isCorrect, true, `${id}.${stage.id}: other order`);
      }
      if (!['domainInput', 'rangeInput', 'valueSet', 'equationInput', 'pointInput'].includes(stage.kind) || responses[stage.id] === POINT_INPUT_NONE_TOKEN) continue;
      for (const spelling of composedAlternates(stage.kind, responses[stage.id])) {
        spellings += 1;
        assert.equal(grade({ [stage.id]: spelling }).isCorrect, true, `${id}.${stage.id}: "${spelling}"`);
      }
    }
  }
  assert.equal(swept, 32);
  console.log('kSweep composed workflows', { items: swept, skipped: COMPOSED_SKIPPED, spellings });
});

/* ----------------------------------------------------- District DOL #2 -- */

const DOL2 = readJson('drafts/district-dol2/assignment.json');
const DOL2_BANK = readJson('functions/seeds/secureAssessments/algebra1_district_dol2.json');
const numbersIn = (text) => String(text).replace(/[{}]/g, '').split(',').map(Number).sort((a, b) => a - b);
const near = (actual, expected, where) => assert.ok(Math.abs(Number(actual) - expected) < 1e-6, `${where}: ${actual} ≠ ${expected}`);
const pairOf = (text) => String(text).replace(/[()]/g, '').split(',').map(Number);
// The least-squares line through the table, in exact fractions: a prediction
// that lands on .5 (14 review fields do) must be rounded from the exact value,
// not from a float that may sit just below it.
const regressionAt = (rows) => {
  const mean = (values) => values.reduce((sum, value) => sum.add(value), new Fraction(0)).div(values.length);
  const mx = mean(rows.map(([x]) => new Fraction(x)));
  const my = mean(rows.map(([, y]) => new Fraction(y)));
  const slope = rows.reduce((sum, [x, y]) => sum.add(new Fraction(x).sub(mx).mul(new Fraction(y).sub(my))), new Fraction(0))
    .div(rows.reduce((sum, [x]) => sum.add(new Fraction(x).sub(mx).pow(2)), new Fraction(0)));
  return (x) => my.add(slope.mul(new Fraction(x).sub(mx)));
};
// "Round to the nearest whole item", a .5 rounded up.
const roundHalfUp = (value) => value.add(new Fraction(1, 2)).floor();
let regressionTies = 0;

// Each review variant's key, recomputed from what the student is shown.
const checkReviewKey = (taskIndex, variant) => {
  const key = Object.fromEntries(variant.answerFields.map((field) => [field.id, field.answer]));
  const panels = variant.stimulus.panels;
  if (taskIndex === 1) {
    const terms = panels[0].expressions[0].split(',').map(Number);
    near(key.Part_1_coefficient, terms[1] - terms[0], 'coefficient');
    near(key.Part_1_constant, terms[0] - (terms[1] - terms[0]), 'constant');
    const [, first, step] = panels[1].note.match(/a₁ = ([\d.-]+) and aₙ = aₙ₋₁ \+ ([\d.-]+)/).map(Number);
    [2, 3, 4].forEach((n) => near(key[`Part_2_a${n}`], new Fraction(first).add(new Fraction(step).mul(n - 1)).valueOf(), `a${n}`));
  }
  if (taskIndex === 2) {
    const [p, q] = panels[0].graph.lines[0].points;
    const slope = new Fraction(q.y).sub(p.y).div(new Fraction(q.x).sub(p.x));
    const intercept = new Fraction(p.y).sub(slope.mul(p.x));
    const zero = intercept.neg().div(slope).valueOf();
    near(pairOf(key.xIntercept)[0], zero, 'x-intercept'); near(pairOf(key.xIntercept)[1], 0, 'x-intercept y');
    near(pairOf(key.yIntercept)[0], 0, 'y-intercept x'); near(pairOf(key.yIntercept)[1], intercept.valueOf(), 'y-intercept');
    near(key.zero, zero, 'zero');
  }
  if (taskIndex === 3) {
    const [, perPerson, vehicle, low, high] = panels[0].note.match(/\$([\d.]+) per person plus \$([\d.]+).*carry (\d+) through (\d+)/).map(Number);
    const costs = Array.from({ length: high - low + 1 }, (_, i) => new Fraction(perPerson).mul(low + i).add(vehicle).valueOf());
    assert.deepEqual(numbersIn(key.Part_1_range), costs);
    near(key.Part_2_lower, Math.min(...panels[1].graph.points.map((point) => point.y)), 'lower');
    near(key.Part_2_upper, Math.max(...panels[1].graph.points.map((point) => point.y)), 'upper');
    const [, rate, durations] = panels[2].note.match(/costs \$(\d+) per hour.*durations: ([\d, ]+)\./);
    const hours = durations.split(',').map(Number).sort((a, b) => a - b);
    assert.deepEqual(numbersIn(key.Part_3_domain), hours);
    assert.deepEqual(numbersIn(key.Part_3_range), hours.map((h) => h * Number(rate)));
  }
  if (taskIndex === 4) {
    // Three samples of the drawn parabola fix it exactly; its zeros by the quadratic formula.
    const curve = panels[0].graph.curves[0].points;
    const [a, b, c] = math.lusolve([0, 16, 32].map((i) => [curve[i].x ** 2, curve[i].x, 1]), [0, 16, 32].map((i) => curve[i].y)).map(([value]) => value);
    const root = Math.sqrt(b * b - 4 * a * c);
    const zeros = [(-b - root) / (2 * a), (-b + root) / (2 * a)].sort((x, y) => x - y);
    numbersIn(key.Part_1_zeros).forEach((value, i) => near(value, zeros[i], 'zero'));
    near(key.Part_2_value, (panels[1].graph.points[0].x + panels[1].graph.points[1].x) / 2, 'axis');
  }
  if (taskIndex === 5) {
    const relations = panels[0].panels.map((panel) => panel.graph?.points.map((point) => [point.x, point.y]) || panel.table.rows.map((row) => row.cells));
    const conflicts = relations.flatMap((pairs) => pairs.filter(([x, y]) => pairs.some(([xx, yy]) => x === xx && y !== yy)).map(([x]) => x));
    assert.deepEqual([...new Set(conflicts)], [key.conflictInput], 'exactly one input has two outputs, and it is the key');
  }
  if (taskIndex === 6) {
    const at = regressionAt(panels[0].table.rows.map((row) => row.cells));
    const prices = [...panels[0].note.matchAll(/\$(\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]));
    prices.slice(0, 2).forEach((price, i) => {
      const exact = at(price);
      if (exact.sub(exact.floor()).equals(new Fraction(1, 2))) regressionTies += 1;
      near(key[`prediction${i + 1}`], roundHalfUp(exact).valueOf(), `prediction ${i + 1}`);
    });
  }
};

test('DOL2 review: all 336 variants grade their recomputed keys, every distractor wrong and every typed spelling right', () => {
  const counts = { variants: 0, spellings: 0 };
  DOL2.sections[0].questions.forEach((task, taskIndex) => {
    assert.equal(task.variants.length, 48);
    for (const variant of task.variants) {
      counts.variants += 1;
      checkReviewKey(taskIndex, variant);
      const base = Object.fromEntries(variant.answerFields.map((field) => [field.id, String(field.answer)]));
      assert.equal(gradeMultiAnswerResponse(variant, base).isCorrect, true, task.questionId);
      for (const field of variant.answerFields) {
        let alternates;
        if (field.options) {
          for (const option of field.options) {
            counts.spellings += 1;
            assert.equal(gradeMultiAnswerResponse(variant, { ...base, [field.id]: option }).isCorrect, option === field.answer, `${task.questionId}.${field.id}: ${option}`);
          }
          continue;
        }
        if (field.inputProfile === 'number') alternates = numberSpellings(field.answer);
        if (field.inputProfile === 'set') alternates = setSpellings(String(field.answer).slice(1, -1).split(','));
        if (field.inputProfile === 'orderedPair') alternates = pairSpellings(pairOf(field.answer));
        assert.ok(alternates, `${task.questionId}.${field.id}: a known profile`);
        for (const spelling of alternates) {
          counts.spellings += 1;
          assert.equal(gradeMultiAnswerResponse(variant, { ...base, [field.id]: spelling }).isCorrect, true, `${task.questionId}.${field.id}: "${spelling}" for ${field.answer}`);
        }
      }
    }
  });
  // The intercept fields are graded as points, not as text (the item fix).
  const intercept = DOL2.sections[0].questions[2].variants[0].answerFields.find((field) => field.id === 'xIntercept');
  assert.equal(intercept.answerFormat, 'orderedPair');
  // Fourteen predictions land exactly on .5; each key rounds it up. (The other
  // direction is graded wrong here — school rounding — while the secure bank's
  // numericTolerance 1 credits key ± 1 everywhere: reported, not changed.)
  assert.equal(regressionTies, 14);
  console.log('kSweep DOL2 review', { ...counts, regressionTies });
});

test('DOL2 secure retest: every variant grades its key, every choice distractor wrong and typed numbers and sets in any spelling', async () => {
  const counts = { variants: 0, spellings: 0, spellingVariantsSampled: 0 };
  for (const family of DOL2_BANK.documents) {
    for (const [index, variant] of family.variants.entries()) {
      counts.variants += 1;
      const question = { ...family, ...variant };
      const grading = mathPath.privateGradingDefinition(question);
      const base = Object.fromEntries(grading.fields.map((field) => [field.id, String(field.expected)]));
      assert.equal((await mathPath.gradeResponse(grading, { responses: base })).isCorrect, true, family.id);
      // A choice travels as the runtime id the sanitized question shows.
      const shownChoices = new Map((mathPath.buildSanitizedQuestion(question).responseFields || []).map((field) => [field.id, field.choices]));
      // Spellings on every fourth variant keeps this under a few seconds; the
      // keys themselves are recomputed for all 832 in districtDOL2Content.
      if (index % 4) continue;
      counts.spellingVariantsSampled += 1;
      for (const field of question.responseFields) {
        let alternates = [];
        if (field.choices) {
          for (const choice of shownChoices.get(field.id)) {
            counts.spellings += 1;
            const result = await mathPath.gradeResponse(grading, { responses: { ...base, [field.id]: choice.id } });
            assert.equal(result.isCorrect, choice.label === field.expected, `${family.id}.${field.id}: ${choice.label}`);
          }
          continue;
        }
        if (field.inputProfile === 'number') alternates = numberSpellings(field.expected);
        if (field.inputProfile === 'set') alternates = setSpellings(String(field.expected).slice(1, -1).split(','));
        for (const spelling of alternates) {
          counts.spellings += 1;
          const result = await mathPath.gradeResponse(grading, { responses: { ...base, [field.id]: spelling } });
          assert.equal(result.isCorrect, true, `${family.id}.${field.id}: "${spelling}" for ${field.expected}`);
        }
      }
    }
  }
  assert.equal(counts.variants, 832);
  console.log('kSweep DOL2 secure', counts);
});

/* ---------------------------------------------------------- demo bank -- */

// What each demo item's accepted answer must satisfy, read from its prompt
// and formula. `v` is the accepted answer.
const DEMO_CHECKS = {
  'systems-dol-q1': 'v+2 == 3v-4', 'systems-dol-q2': '2v+1 == -v+10', 'systems-dol-q3': 'v+(v-2) == 12', 'systems-dol-q4': '2v+1 == 13', 'systems-dol-q5': '4v-7 == v+2',
  'exponents-adaptive-q1': '2^v == 16', 'exponents-adaptive-q2': '3^v == 27', 'exponents-adaptive-q3': '5^2*5^3 == 5^v', 'exponents-adaptive-q4': '2^3*2^4 == 2^v', 'exponents-adaptive-q5': '10^6/10^2 == 10^v',
  'phone-modeling-q1': 'v == 25+5*4', 'phone-modeling-q2': '20+6v == 32+3v', 'phone-modeling-q3': 'v == 18+4*6', 'phone-modeling-q4': '15+7v == 50', 'phone-modeling-q5': '30+2v == 18+5v',
  'systems-quiz-q1': 'v+5 == 2v+1', 'systems-quiz-q2': 'v+(v+1) == 11', 'systems-quiz-q3': '5v-8 == 2v+1', 'systems-quiz-q4': '3v+2 == 14', 'systems-quiz-q5': '-v+9 == v+1',
  'college-readiness-q1': '18+4v == 50', 'college-readiness-q2': '60v == 180', 'college-readiness-q3': '12+8v == 60', 'college-readiness-q4': '40+15v == 100', 'college-readiness-q5': '3.5v+7 == 28',
  'honors-modeling-q1': '12+4v == 30+v', 'honors-modeling-q2': '2v+9 == -v+24', 'honors-modeling-q3': '75+12v == 120+7v', 'honors-modeling-q4': '4v-13 == v+8', 'honors-modeling-q5': '22+6v == 10+8v',
  'ccmr-practice-q1': '2.5v+15 == 50', 'ccmr-practice-q2': '6v+18 == 90', 'ccmr-practice-q3': '55v == 220', 'ccmr-practice-q4': '28+9v == 100', 'ccmr-practice-q5': '1.2v+6 == 30',
  'a2-inverse-q1': '2v+3 == 11', 'a2-inverse-q2': '5v-1 == 24', 'a2-inverse-q3': '3v+7 == 28', 'a2-inverse-q4': '4v-6 == 18', 'a2-inverse-q5': '7v+2 == 37',
  'a2-lq-q1': 'v^2 == 4', 'a2-lq-q2': 'v^2 == 9', 'a2-lq-q3': 'v^2-1 == 8', 'a2-lq-q4': 'v^2+2 == 18', 'a2-lq-q5': 'v^2-5 == 20',
  'a2-exp-q1': '2^v == 32', 'a2-exp-q2': '10^v == 1000', 'a2-exp-q3': '3^v == 81', 'a2-exp-q4': '2^v == 64', 'a2-exp-q5': '5^v == 125',
  'a2-honors-q1': 'abs(120*1.05^v - 153.15) < 0.01', 'a2-honors-q2': '2^v == 128', 'a2-honors-q3': '3^v == 243', 'a2-honors-q4': 'abs(500*1.1^v - 605) < 1e-9', 'a2-honors-q5': '4^v == 1024',
};

test('demo bank: every item, generated as QuestionEngine generates it, grades the answer to the equation its prompt shows', () => {
  const demo = readJson('src/demo/demoAssignmentBank.json');
  const counts = { items: 0, spellings: 0 };
  for (const assignment of demo) {
    for (const authored of assignment.questions) {
      counts.items += 1;
      const question = generateQuestion(authored, `k-sweep|${authored.questionId}`);
      const solve = authored.prompt.match(/[Ss]olve (-?\d+)x ([+-]) (\d+) = (-?\d+)\.$/);
      if (solve) {
        const [, a, sign, b, c] = solve;
        const x = new Fraction(c).sub(new Fraction(b).mul(sign === '-' ? -1 : 1)).div(a);
        // The workspace opens on the prompt's equation, and its solution is the key.
        assert.equal(String(question.equation ?? '').replace(/\s+/g, ''), authored.prompt.match(/[Ss]olve (.*)\.$/)[1].replace(/\s+/g, ''), `${authored.questionId}: the equation the workspace opens`);
        for (const spelling of [`x=${x.toFraction()}`, `x = ${x.toFraction()}`, `${x.toFraction()} = x`, `x=${x.mul(2).toFraction()}/2`]) {
          counts.spellings += 1;
          const result = gradeServerResponse({ question, response: { kind: 'opaque', type: question.type, value: spelling, fields: [] } });
          assert.equal(result.isCorrect, true, `${authored.questionId}: "${spelling}"`);
        }
        const wrong = gradeServerResponse({ question, response: { kind: 'opaque', type: question.type, value: `x=${x.add(1).toFraction()}`, fields: [] } });
        assert.equal(wrong.isCorrect, false, `${authored.questionId}: a wrong solution`);
        continue;
      }
      assert.equal(question.type, 'literal', authored.questionId);
      const check = DEMO_CHECKS[authored.questionId];
      assert.ok(check, `${authored.questionId} has an independent check`);
      for (const accepted of question.acceptedAnswers) {
        assert.equal(math.evaluate(check, { v: Number(accepted) }), true, `${authored.questionId}: ${accepted} satisfies ${check}`);
        for (const spelling of numberSpellings(accepted)) {
          counts.spellings += 1;
          const result = gradeServerResponse({ question, response: { kind: 'scalar', type: 'literal', value: spelling, fields: [] } });
          assert.equal(result.isCorrect, true, `${authored.questionId}: "${spelling}"`);
        }
      }
    }
  }
  assert.equal(counts.items, 70);
  console.log('kSweep demo bank', counts);
});

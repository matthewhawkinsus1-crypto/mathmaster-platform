/*
 * THE SCHOOL MY MATH PATH BANKS, GRADED THE WAY A STUDENT MEETS THEM.
 *
 * Every family in the course release (grade 6, 7, 8, Algebra I, Algebra II) is
 * compiled by the Path content compiler, drawn by the production generator,
 * issued, stored and served as issueNextQuestion does it, and graded by
 * mathPath.gradePathToolResponse (scripts/lib/pathBankAnswerSweep.mjs). A
 * choice is answered with the option id the browser was served; an open field
 * with its key and with spellings a student types into the math editor; a tool
 * item with work built from the authored item by arithmetic done here. Each
 * spelling is confirmed equivalent by mathjs / fraction.js before it is sent.
 *
 * What this pins, each found by the sweep and fixed in the bank data:
 *   - nine generated choice families could serve two options with the same
 *     label, a twin of the key graded wrong (a = b, p = q, h = k ..., and
 *     8.3B only at x = y = k = 2), and three a distractor worth exactly the
 *     key (3 ÷ (9/3) beside (9/3) ÷ 3; 100 - 10 - 5 for 10% off $100; "$65$",
 *     a product printed as digits);
 *   - factored answers with the factors the other way round, a compound
 *     inequality written as one chain (-10 ≤ y ≤ -1), and an explicit
 *     formula with its terms swapped, were rejected where sibling variants of
 *     the same family already accepted them;
 *   - answer boxes for one of an unordered pair ("Root 2", "First solution")
 *     did not say which one, while the key expected one order.
 * The false negatives that remain are grader gaps, reported to the functions
 * lane, and are listed by family in KNOWN_OPEN_FALSE_NEGATIVES.
 *
 * Generated families are SAMPLED: three seeded draws per variant row here
 * (the full audit, scripts/audit-correct-answer-acceptance.mjs, takes more).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHOOL_COURSES,
  compiledCourseDocuments,
  duplicateServedOptions,
  equivalentSpellings,
  independentKeyCheck,
  sameExpressionIndependently,
  sweepCourses,
  unexpectedFindings,
} from '../../scripts/lib/pathBankAnswerSweep.mjs';
import { effectivePathVariants, generatePathInstance, hasPathGenerator } from '../../functions/shared/pathQuestionGeneration.mjs';

const DRAWS = 3;
const sweep = await sweepCourses({ draws: DRAWS });

const describe = (finding) => `${finding.courseId} ${finding.id}#${finding.variant ?? 'base'} ${finding.fieldId || finding.toolId || ''} [${finding.kind}] ${finding.expected ?? ''} -> ${finding.rejected ?? finding.detail ?? ''}`;

test('every family issues, and its own key grades right as served: options, fields and tool work', (t) => {
  const { totals, findings } = sweep;
  t.diagnostic(`sampled ${DRAWS} draws per generated row: ${JSON.stringify(totals)}`);
  const keyDefects = findings.filter((finding) => finding.class === 'KEY DEFECT');
  assert.deepEqual(keyDefects.map(describe), []);
  assert.ok(totals.families > 1000 && totals.instances >= totals.variantRows, 'the whole course release was swept');
  assert.equal(totals.toolSkipped, 0, 'every tool item was answered with tool work');
  assert.ok(totals.choiceFields > 1000 && totals.toolWorks > 1000 && totals.spellings > 20000);
});

test('a correct answer written another way is accepted, apart from the grader gaps reported upstream', () => {
  assert.deepEqual(unexpectedFindings(sweep.findings).map(describe), []);
});

// Twins appear only for some parameter values (8.3B: x = y = k = 2 only, 1 in
// 1280 draws), so every combination is enumerated where the space allows.
test('no served multiple-choice item shows a twin of an option: one label twice, or a numeric option worth the key', (t) => {
  const { found, coverage } = duplicateServedOptions(SCHOOL_COURSES, 400);
  t.diagnostic(`${coverage.enumeratedRows} choice rows checked at every parameter combination (${coverage.combinations})`);
  t.diagnostic(`${coverage.sampledRows} rows sampled at 400 draws (space too large): ${coverage.sampled.join(', ')}`);
  assert.ok(coverage.enumeratedRows > 600 && coverage.combinations > 400000, 'the generated choice rows were enumerated');
  assert.deepEqual(found.map((entry) => `${entry.id}#${entry.variant ?? 'base'} ${entry.at} [${entry.kind}]: ${entry.labels.join(' | ')}`), []);
});

test('where the prompt can be recomputed, the key is the answer to it', (t) => {
  const rules = {};
  const wrong = [];
  for (const courseId of SCHOOL_COURSES) {
    for (const document of compiledCourseDocuments(courseId).documents) {
      for (const row of effectivePathVariants(document)) {
        // Recomputing is cheap, so this takes twice the grading sweep's draws.
        const draws = hasPathGenerator(row.template) ? 2 * DRAWS : 1;
        for (let draw = 0; draw < draws; draw += 1) {
          const question = hasPathGenerator(row.template) ? generatePathInstance(row.template, `k-sweep-${draw}`).question : row.template;
          const check = question && independentKeyCheck(question);
          if (!check) continue;
          rules[check.rule] = (rules[check.rule] || 0) + 1;
          if (!check.ok) wrong.push(`${document.id}#${row.variantIndex ?? 'base'}: ${check.detail}`);
        }
      }
    }
  }
  t.diagnostic(`recomputed keys by rule: ${JSON.stringify(rules)}`);
  assert.deepEqual(wrong, []);
  assert.ok(Object.values(rules).reduce((sum, count) => sum + count, 0) > 200, 'enough prompts were recomputed to mean something');
});

// Each box names its place in the order, and the key keeps that order in every draw.
const ORDERED_BOXES = [
  ['algebra1', 'mm_A_10E_v2_reverse-factor-from-root-structure', 1, ['factor1', 'factor2'], /smaller/, (value) => Number(String(value).replace(/^x\+/, ''))],
  ['algebra2', 'mm_A2_3C_v2_no-real-solution', 1, ['point1', 'point2'], /smaller x-value/, (value) => Number(String(value).slice(1).split(',')[0])],
  ['algebra2', 'mm_A2_3C_v2_error-finish-ordered-pairs', 0, ['point1', 'point2'], /smaller x-value/, (value) => Number(String(value).slice(1).split(',')[0])],
  ['algebra2', 'mm_A2_3C_v2_error-finish-ordered-pairs', 1, ['point1', 'point2'], /smaller x-value/, (value) => Number(String(value).slice(1).split(',')[0])],
  ['algebra2', 'mm_A2_7D_v2_cubic-integer-roots-synthetic', 0, ['root-1', 'root-2', 'root-3'], /least/, Number],
  ['algebra2', 'mm_A2_7D_v2_cubic-integer-roots-synthetic', 1, ['root-1', 'root-2', 'root-3'], /least/, Number],
  ['algebra2', 'mm_A2_7D_v2_quartic-four-integer-roots', null, ['root-1', 'root-2', 'root-3', 'root-4'], /least/, Number],
  ['algebra2', 'mm_A2_7D_v2_synthetic-sign-error-full-repair', 0, ['root-1', 'root-2', 'root-3', 'root-4'], /least/, Number],
  ['algebra2', 'mm_A2_7D_v2_synthetic-sign-error-full-repair', 1, ['root-1', 'root-2', 'root-3', 'root-4'], /least/, Number],
];

test('an answer box for one of an unordered set says which one, and the key keeps that order', () => {
  const documents = new Map(SCHOOL_COURSES.flatMap((courseId) => compiledCourseDocuments(courseId).documents.map((document) => [document.id, document])));
  for (const [, id, variant, fieldIds, firstLabel, read] of ORDERED_BOXES) {
    const row = effectivePathVariants(documents.get(id)).find((entry) => entry.variantIndex === variant);
    assert.ok(row, `${id}#${variant}`);
    for (let draw = 0; draw < 40; draw += 1) {
      const { question } = generatePathInstance(row.template, `k-sweep-order-${draw}`);
      const fields = fieldIds.map((fieldId) => question.responseFields.find((field) => field.id === fieldId));
      assert.match(fields[0].label, firstLabel, `${id}#${variant} ${fieldIds[0]} names its place`);
      const values = fields.map((field) => read(field.expected));
      assert.ok(values.every(Number.isFinite), `${id}#${variant}: ${JSON.stringify(values)}`);
      values.slice(1).forEach((value, index) => assert.ok(values[index] < value, `${id}#${variant} draw ${draw}: ${values.join(' < ')}`));
    }
  }
  // The two conjugate boxes and the two canceled factors are named by their source instead.
  const conjugates = effectivePathVariants(documents.get('mm_A_10F_v2_reverse-conjugates-to-factor'))[1].template.responseFields;
  assert.deepEqual(conjugates.slice(0, 2).map((field) => [field.label, field.expected]), [['Subtracting factor', 'x-{{a}}'], ['Adding factor', 'x+{{a}}']]);
  const canceled = effectivePathVariants(documents.get('mm_A2_7F_v2_product-rational-degree-variants'))[1].template.responseFields;
  assert.deepEqual(canceled.slice(0, 2).map((field) => field.label), ['Canceled factor from the first numerator', 'Canceled factor from the first denominator']);
});

test('the independent checks refuse what is not equivalent', () => {
  // A spelling the graders happen to accept is still refused when it means something else.
  assert.equal(sameExpressionIndependently('3sqrt(3)', '3sqrt3'), false);
  assert.equal(sameExpressionIndependently('(x+4)*(x+5)', '(x+5)(x+4)'), true);
  assert.equal(sameExpressionIndependently('(x+4)*(x+5)', '(x+4)(x-5)'), false);
  const spellings = equivalentSpellings('x>15', 'inequality').spellings.map((entry) => entry.spelling);
  assert.ok(spellings.includes('15<x') && !spellings.includes('15>x'));
  assert.ok(equivalentSpellings('-10<=y and y<=-1', 'inequality').spellings.some((entry) => entry.spelling === '-10\\le y\\le -1'));
  assert.deepEqual(equivalentSpellings('0.75', 'number').spellings.map((entry) => entry.spelling).filter((spelling) => spelling.includes('frac')), ['\\frac{3}{4}', '\\frac{6}{8}']);
  // A wrong key is caught by the recomputation.
  const solve = (key) => independentKeyCheck({ prompt: 'Solve $2x+5=13$.', responseFields: [{ id: 'answer', inputProfile: 'number', expected: key }] });
  assert.equal(solve(4).ok, true);
  assert.equal(solve(5).ok, false);
  const factor = (key) => independentKeyCheck({ prompt: 'Factor $x^2+9x+20$.', responseFields: [{ id: 'answer', inputProfile: 'expression', expected: key }] });
  assert.equal(factor('(x+4)(x+5)').ok, true);
  assert.equal(factor('(x+4)(x+6)').ok, false);
});

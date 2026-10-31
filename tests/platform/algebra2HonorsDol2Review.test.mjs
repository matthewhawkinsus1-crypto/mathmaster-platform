/*
 * ALGEBRA II HONORS · DISTRICT DOL #2 REVIEW — EVERY BLUEPRINT STANDARD,
 * WORKED IN A TOOL THAT DOES THE MATHEMATICS, READY FOR REGULAR AND HONORS.
 *
 * DeSoto ISD's Algebra II Honors DOL #2 blueprint (SY26-27, 20 items) tests
 * A2.2A (3 items), A2.3A (2), A2.3B (2), A2.6C (3), A2.6D (3), A2.6E (3) and
 * A2.6F (3). It strikes the √x, 1/x, x³, ∛x, bˣ and log_b(x) parent
 * functions, asymptotic behavior, and linear-quadratic systems. The review
 * students take before the district DOL in Eduphoria is one teacher-import
 * file, written by scripts/content/build_algebra2_honors_dol2_review.py.
 *
 * What this holds:
 *   - Pre-Flight: valid with no errors or warnings, and the Warm-Up and DOL
 *     are Recovery-ready from their own families on the server's key check.
 *   - Blueprint: Classwork, Practice and the DOL each cover exactly the seven
 *     standards, the DOL readiness check has one item per standard, and
 *     nothing the blueprint struck appears in any version a student is dealt.
 *   - Tools: each standard is worked in the tool that does its mathematics
 *     (staged graph analysis, Transformations Lab, the solving workspace with
 *     a number line and interval notation, Systems Workspace, Matrix Lab).
 *   - Versions: every Warm-Up, Practice and DOL item is a Question Family, and
 *     sampled versions are checked against mathematics computed here,
 *     independently of the template that wrote them.
 *   - Import: no answer box becomes a set box (teacherImportTemplateKeyFields).
 *   - Honors: the candidate is READY and keeps every authored item, because
 *     the three audited Digital SAT items in Practice meet the 15% CCMR share.
 *     Both versions pass with no warning for a class of up to 70: every
 *     Practice and DOL item has at least 70 versions. The real Review and
 *     Create: tests/browser/teacherWorkflow/dol2ReviewHonorsJourneys.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { create, all } from 'mathjs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { collectReviewBlockers, summarizePreflightReadiness } from '../../src/components/teacher/preflightSteps.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import {
  HONORS_CCMR_STATUS,
  buildHonorsCcmrCandidate,
  composeHonorsCcmrCandidate,
  confirmHonorsCandidateForCreate,
  selectHonorsCcmrItems,
} from '../../src/platform/assignments/canonicalCcmrHydration.js';
import { creationRecoveryContent } from '../../src/platform/recovery/recoveryContentAuthoring.js';
import { assignmentRecoveryContent } from '../../functions/shared/recoveryContent.mjs';
import { planAssignmentRecoveryContent } from '../../functions/shared/recoveryContentPlan.mjs';
import { serverRecoveryKeyCheck } from '../../functions/shared/recoveryCertificationGrading.mjs';
import { isFamilyBackedQuestion, resolveQuestionFamilyDefinition } from '../../functions/shared/questionFamilyInstance.mjs';
import { buildFamilyQuestion, buildParameterSpace, decodeParameterIndex, evaluateFamilyCandidate } from '../../functions/shared/questionFamilyEngine.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { sameIntervalNotation } from '../../functions/shared/answerEquivalence.mjs';
import { inequalitySolutionRepresentationStages } from '../../functions/shared/toolMath/algebra-relations/inequalityRepresentationPolicy.mjs';
import transformationsLab from '../../functions/shared/serverGrading/tools/transformationsLab.mjs';
import matrixLab from '../../functions/shared/serverGrading/tools/matrixLab.mjs';
import { questionReadingParts, questionReadingText } from '../../src/platform/language/questionReading.js';
import { speechTextFor } from '../../src/platform/language/speechText.js';

const require = createRequire(import.meta.url);
const bank = require('../../functions/lib/ccmrAssignmentBank.js');

const REVIEW = 'teacher-import-jsons/algebra2-honors-dol2/District_DOL2_Absolute_Value_and_3x3_Systems_Review.json';
const BLUEPRINT = ['A2.2A', 'A2.3A', 'A2.3B', 'A2.6C', 'A2.6D', 'A2.6E', 'A2.6F'];
const SAT_ITEMS = [
  'mm_sat_A2_2A_absolute-value-interval-maximum_v21',
  'mm_sat_A2_6E_challenge_sum_of_solutions_scaled_v21',
  'mm_sat_A2_6F_tolerance_context_v21',
];
const clone = (value) => JSON.parse(JSON.stringify(value));

/** The review as Assignment Review holds it: imported, reviewed, Pre-Flight valid. */
let reviewedModel = null;
const reviewed = () => {
  if (!reviewedModel) {
    const parsed = parseAssignmentBlueprintText(readFileSync(new URL(`../../${REVIEW}`, import.meta.url), 'utf8'));
    reviewedModel = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}), { classSize: 30 });
  }
  return reviewedModel;
};

// Built once: ranking the bank for 18 Practice places takes seconds, and no test changes it.
let honorsCache = null;
const honorsCandidate = () => {
  if (!honorsCache) {
    const base = reviewed().assignmentV5;
    const hydration = clone(bank.replaceDirectCcmrQuestionsWithAuditedBank(clone(base), { ensurePracticeTarget: true, includeCandidates: true }));
    honorsCache = { base, hydration, candidate: buildHonorsCcmrCandidate({ baseAssignmentV5: base, hydration, honorsEnrichmentQuestion: null }) };
  }
  return honorsCache;
};

const sectionQuestions = (sections, role) => sections.filter((section) => section.role === role).flatMap((section) => section.questions);
const standardOf = (question) => question.standard || question.alignments?.find((entry) => entry.role === 'primary')?.code;
const keyOf = (question) => JSON.stringify({ id: question.questionId, prompt: question.prompt, fields: (question.answerFields || []).map((field) => [field.id, field.label, field.answer]) });

const asPayload = (assignmentV5, level) => ({
  ...clone(assignmentV5),
  id: `dol2r-${level}`,
  title: assignmentV5.assignment.title,
  courseProfile: { course: 'algebra2', courseLevel: level },
  rigorVariant: level,
  assignedClassIds: [`class-${level}`],
});

/*
 * Versions of a family question, spread across its whole parameter space: a
 * step coprime with the space's size reaches every tuple before repeating, and
 * one near 0.618 of the size moves every parameter, not only the first.
 */
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const versionsOf = (question, limit) => {
  const definition = resolveQuestionFamilyDefinition(question, { slotKey: `test|${question.questionId}` });
  assert.ok(!definition.error, `${question.questionId}: ${definition.error}`);
  const space = buildParameterSpace(definition.family, definition.constraintValues);
  let step = Math.max(1, Math.round(space.size * 0.6180339887));
  while (gcd(step, space.size) !== 1) step += 1;
  const versions = [];
  for (let k = 0; k < space.size && versions.length < limit; k += 1) {
    const candidate = evaluateFamilyCandidate(definition.family, definition.constraintValues, decodeParameterIndex(space, (k * step) % space.size));
    if (!candidate.valid) continue;
    versions.push({
      values: candidate.instance.values,
      question: buildFamilyQuestion({ family: definition.family, instance: candidate.instance, constraintValues: definition.constraintValues, authored: question, tool: definition.tool }),
      local: definition.family.scope === 'assignment',
    });
  }
  return versions;
};

/** Every question a student can be dealt: each static question, and sampled versions of each family. */
let dealtCache = null;
const dealt = () => {
  if (!dealtCache) {
    dealtCache = reviewed().sections.flatMap((section) => section.questions.flatMap((question) => (isFamilyBackedQuestion(question)
      ? versionsOf(question, 120).map((version) => ({ role: section.role, id: question.questionId, ...version }))
      : [{ role: section.role, id: question.questionId, values: {}, question, local: true }])));
  }
  return dealtCache;
};

const STUDENT_TEXT_KEYS = ['prompt', 'equation', 'equationLatex', 'inequality', 'inequalityText', 'equations', 'answerFields', 'hints', 'attemptFeedback', 'scaffold', 'guidedNotes', 'solutionReview', 'behaviorChoices', 'behavior', 'axisOfSymmetry', 'correctRange', 'correctDomain', 'graph', 'functions', 'function', 'target'];
const studentText = (question) => {
  const strings = [];
  const collect = (value) => {
    if (typeof value === 'string') strings.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  STUDENT_TEXT_KEYS.forEach((key) => collect(question[key]));
  return strings;
};

/* ------------------------------------------------------------- the math */

const math = create(all);
const near = (a, b, tolerance = 1e-9) => Math.abs(Number(a) - Number(b)) <= tolerance;
const absToCall = (text) => {
  let out = String(text);
  for (let guard = 0; guard < 6 && out.includes('|'); guard += 1) out = out.replace(/\|([^|]*)\|/, 'abs($1)');
  return out;
};
const toMathjs = (text) => absToCall(String(text)
  .replace(/\\left|\\right/g, '')
  .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '(($1)/($2))')
  .replace(/[−–]/g, '-')
  .replace(/·/g, '*')
  .replace(/\\cdot/g, '*'));
const compileExpr = (text) => {
  const code = math.parse(toMathjs(text)).compile();
  return (x) => code.evaluate({ x });
};
const RELATIONS = ['>=', '<=', '≥', '≤', '>', '<', '='];
const splitRelation = (text) => {
  const source = String(text);
  for (const relation of RELATIONS) {
    const at = source.indexOf(relation);
    if (at > 0) return { left: source.slice(0, at), relation: relation.replace('≥', '>=').replace('≤', '<='), right: source.slice(at + relation.length) };
  }
  throw new Error(`no relation in ${text}`);
};
const holds = (relation, l, r) => ({ '=': near(l, r), '<': l < r - 1e-12, '>': l > r + 1e-12, '<=': l <= r + 1e-12, '>=': l >= r - 1e-12 }[relation]);
const promptMath = (prompt) => [...String(prompt).matchAll(/\$([^$]+)\$/g)].map((match) => match[1]);
const functionFromPrompt = (prompt, name) => {
  const span = promptMath(prompt).find((text) => new RegExp(`^${name}\\(x\\)=`).test(text));
  return compileExpr(span.slice(span.indexOf('=') + 1));
};
// Every solution on a quarter-unit grid (each key in this review is a multiple of 1/4).
const solutionsOfEquation = (text, reach = 200) => {
  const { left, right } = splitRelation(text);
  const [l, r] = [compileExpr(left), compileExpr(right)];
  const roots = [];
  for (let i = -reach * 4; i <= reach * 4; i += 1) if (near(l(i / 4), r(i / 4))) roots.push(i / 4);
  return roots;
};
const relationTruth = (text) => {
  const { left, relation, right } = splitRelation(text);
  const [l, r] = [compileExpr(left), compileExpr(right)];
  return (x) => holds(relation, l(x), r(x));
};
const det3 = ([[a, b, c], [d, e, f], [g, h, i]]) => a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
// A linear equation in x, y, z (any arrangement) -> [a, b, c, d] for ax + by + cz = d.
const linearRow = (equation) => {
  const [left, right] = equation.split('=');
  const side = (text) => { const code = math.parse(toMathjs(text)).compile(); return (x, y, z) => code.evaluate({ x, y, z }); };
  const [L, R] = [side(left), side(right)];
  const g = (x, y, z) => L(x, y, z) - R(x, y, z);
  const d0 = g(0, 0, 0);
  const row = [g(1, 0, 0) - d0, g(0, 1, 0) - d0, g(0, 0, 1) - d0, -d0];
  // Linear means the row predicts the equation everywhere, not only at the unit points.
  const linear = [[2, -3, 5], [-4, 7, 1], [6, 2, -9]].every(([x, y, z]) => near(g(x, y, z), row[0] * x + row[1] * y + row[2] * z - row[3]));
  return { row, linear };
};

/*
 * Each item's mathematics, recomputed from what the student sees. A check
 * reports through `fail`; values are the version's parameters, for the report.
 */
const checksFor = (fail) => {
  const fieldsById = (question) => Object.fromEntries((question.answerFields || []).map((field) => [field.id, field]));
  const expectField = (id, values, question, fieldId, expected) => {
    const field = fieldsById(question)[fieldId];
    if (!field) return fail(id, values, `missing field ${fieldId}`);
    if (!matchesFieldAnswer(String(expected), field)) fail(id, values, `field ${fieldId}: key ${JSON.stringify(field.answer)} is not ${JSON.stringify(expected)}`);
    (field.acceptedAnswers || []).forEach((alternative) => {
      if (!matchesFieldAnswer(String(alternative), field)) fail(id, values, `field ${fieldId}: accepted ${alternative} does not grade`);
    });
    return undefined;
  };
  const expectChoice = (id, values, question, fieldId, isTrue) => {
    const field = fieldsById(question)[fieldId];
    if (!field) return fail(id, values, `missing choice ${fieldId}`);
    const options = field.options || [];
    if (new Set(options).size !== options.length) fail(id, values, `choice ${fieldId} repeats an option: ${JSON.stringify(options)}`);
    const truths = options.filter((option) => isTrue(option));
    if (truths.length !== 1 || truths[0] !== field.answer) fail(id, values, `choice ${fieldId}: true options ${JSON.stringify(truths)}, key ${JSON.stringify(field.answer)}`);
    return undefined;
  };
  const sameSetOnGrid = (id, values, truth, member) => {
    for (let i = -320; i <= 320; i += 1) {
      const x = i / 8;
      if (Boolean(truth(x)) !== Boolean(member(x))) return fail(id, values, `solution set differs at x = ${x}`);
    }
    return undefined;
  };
  const checkSystem = (id, values, equations, solution) => {
    const rows = equations.map((equation) => linearRow(equation).row);
    if (near(det3(rows.map((row) => row.slice(0, 3))), 0)) fail(id, values, `singular system ${JSON.stringify(equations)}`);
    rows.forEach((row, i) => {
      if (!near(row[0] * solution[0] + row[1] * solution[1] + row[2] * solution[2], row[3])) fail(id, values, `(${solution}) fails ${equations[i]}`);
    });
  };
  const xs = Array.from({ length: 161 }, (_, i) => -20 + i / 4);

  return {
    'dol2r-wu-1': (q, v, id) => {
      const g = functionFromPrompt(q.prompt, 'g');
      const top = xs.reduce((best, x) => (g(x) > g(best) ? x : best), xs[0]);
      expectField(id, v, q, 'vertex', `(${top}, ${g(top)})`);
      expectField(id, v, q, 'axis', `x=${top}`);
      expectField(id, v, q, 'range', `(-∞, ${g(top)}]`);
      expectField(id, v, q, 'yint', `(0, ${g(0)})`);
      if (!(g(top + 5) < g(top))) fail(id, v, 'expected a downward V');
    },
    'dol2r-wu-2': (q, v, id) => {
      const g = functionFromPrompt(q.prompt, 'g');
      const point = promptMath(q.prompt)[0].replace(/[()]/g, '').split(',').map(Number);
      if (!near(point[1], Math.abs(point[0]))) fail(id, v, `(${point}) is not on y = |x|`);
      const image = [point[0] + q.function.h, q.function.a * point[1] + q.function.k];
      if (!near(g(image[0]), image[1])) fail(id, v, 'the image is not on the prompt\'s g');
      if (!transformationsLab.grade(q, { mappedX: String(image[0]), mappedY: String(image[1]) })?.isCorrect) fail(id, v, `the lab refuses the image ${image}`);
    },
    'dol2r-wu-3': (q, v, id) => {
      const roots = solutionsOfEquation(q.equationLatex || q.equation);
      if (roots.length !== 2 || !roots.every(Number.isInteger)) fail(id, v, `roots ${roots}`);
    },
    'dol2r-wu-4': (q, v, id) => {
      const label = (fieldId) => fieldsById(q)[fieldId].label;
      const N = Number(label('total').match(/sold (\d+) tickets/)[1]);
      const [pa, ps, pc] = [...label('money').matchAll(/\$(\d+)/g)].map((match) => Number(match[1]));
      const R = Number(label('money').match(/totaled \$(\d+)/)[1]);
      const m = Number(label('compare').match(/sold (\d+) times/)[1]);
      expectField(id, v, q, 'total', `a+s+c=${N}`);
      expectField(id, v, q, 'money', `${pa}a+${ps}s+${pc}c=${R}`);
      expectField(id, v, q, 'compare', `s=${m}c`);
      // The story has a whole-number solution, found from the three facts alone.
      const A = [[1, 1, 1], [pa, ps, pc], [0, 1, -m]];
      const B = [N, R, 0];
      const D = det3(A);
      const solution = [0, 1, 2].map((k) => det3(A.map((row, r) => row.map((value, c) => (c === k ? B[r] : value)))) / D);
      if (near(D, 0) || !solution.every((n) => Number.isInteger(n) && n > 0)) fail(id, v, `story solution ${solution}`);
    },
    'dol2r-pr-1': (q, v, id) => {
      const { a, h, k } = q.functionSpec || q.function;
      const f = (x) => a * Math.abs(x - h) + k;
      const intercepts = (q.xIntercepts || []).map((point) => (Array.isArray(point) ? point[0] : point.x));
      if (intercepts.length !== 2 || intercepts.some((x) => !near(f(x), 0))) fail(id, v, `x-intercepts ${intercepts}`);
      if (!near(q.yIntercept[1], f(0))) fail(id, v, 'y-intercept');
      if (q.extreme.kind !== 'minimum' || !near(q.extreme.point[0], h) || !near(q.extreme.point[1], k) || a <= 0) fail(id, v, 'minimum');
      if (q.axisOfSymmetry !== `x = ${h}`) fail(id, v, 'axis of symmetry');
      if (!sameIntervalNotation(q.correctRange, `[${k}, ∞)`)) fail(id, v, 'range');
      if (q.behavior !== `Decreasing on (−∞, ${h}) and increasing on (${h}, ∞)`) fail(id, v, 'behavior');
      const g = q.graph;
      if ([[intercepts[0], 0], [intercepts[1], 0], [0, f(0)], [h, k]].some(([x, y]) => x <= g.xMin || x >= g.xMax || y <= g.yMin || y >= g.yMax)) fail(id, v, 'a feature is off the graph');
    },
    'dol2r-pr-2': (q, v, id) => {
      const f = functionFromPrompt(q.prompt, 'f');
      const [p, r] = promptMath(q.prompt).find((span) => span.includes('\\le')).split('\\le').map((s) => s.trim()).filter((s) => s !== 'x').map(Number);
      let best = { max: -Infinity, min: Infinity };
      for (let i = 0; i <= Math.round((r - p) * 4); i += 1) {
        const x = p + i / 4;
        if (f(x) > best.max) best = { ...best, max: f(x), maxX: x };
        if (f(x) < best.min) best = { ...best, min: f(x), minX: x };
      }
      expectField(id, v, q, 'maxValue', best.max);
      expectField(id, v, q, 'maxX', best.maxX);
      expectField(id, v, q, 'minValue', best.min);
      expectField(id, v, q, 'minX', best.minX);
      expectField(id, v, q, 'range', `[${best.min}, ${best.max}]`);
      if (near(f(p), f(r))) fail(id, v, 'tied endpoints make "where" ambiguous');
    },
    'dol2r-pr-3': (q, v, id) => {
      const { a, h, k } = q.function;
      if (!transformationsLab.grade(q, { a: String(a), b: '1', h: String(h), k: String(k) })?.isCorrect) fail(id, v, 'the lab refuses the drawn parameters');
    },
    'dol2r-pr-4': (q, v, id) => {
      const g = functionFromPrompt(q.prompt, 'g');
      const t = q.target;
      for (let x = -8; x <= 8; x += 0.25) if (!near(g(x), t.a * Math.abs(t.b * (x - t.h)) + t.k)) return fail(id, v, 'the dashed target is not the prompt\'s g');
      if (!transformationsLab.grade(q, { a: String(t.a), b: String(t.b), h: String(t.h), k: String(t.k) })?.isCorrect) fail(id, v, 'the lab refuses the target');
      // |b(x − h)| = |b|·|x − h|: the same graph written with b = 1 is right too.
      if (!transformationsLab.grade(q, { a: String(t.a * t.b), b: '1', h: String(t.h), k: String(t.k) })?.isCorrect) fail(id, v, 'the lab refuses the b = 1 form of the same graph');
      return undefined;
    },
    'dol2r-pr-5': (q, v, id) => {
      const W = Number(q.prompt.match(/weigh (\d+) grams/)[1]);
      const t = Number(q.prompt.match(/at most (\d+) grams/)[1]);
      expectField(id, v, q, 'equation', `|w-${W}|=${t}`);
      expectField(id, v, q, 'lightest', W - t);
      expectField(id, v, q, 'heaviest', W + t);
    },
    'dol2r-pr-6': (q, v, id) => {
      const [p, r] = promptMath(q.prompt).slice(0, 2).map((span) => Number(span.split('=')[1]));
      expectField(id, v, q, 'center', (p + r) / 2);
      expectField(id, v, q, 'distance', (r - p) / 2);
      const roots = solutionsOfEquation(fieldsById(q).equation.answer);
      if (roots.length !== 2 || !near(roots[0], p) || !near(roots[1], r)) fail(id, v, `the key equation has roots ${roots}`);
    },
    'dol2r-pr-7': (q, v, id) => {
      const roots = solutionsOfEquation(q.equationLatex || q.equation);
      if (roots.length !== 2 || !near(roots[0], v.x1) || !near(roots[1], v.x2)) fail(id, v, `roots ${roots}`);
    },
    'dol2r-pr-8': (q, v, id) => {
      const roots = solutionsOfEquation(q.equationLatex || q.equation);
      if (roots.length !== (v.d < 0 ? 0 : 2)) fail(id, v, `roots ${roots}`);
    },
    'dol2r-pr-9': (q, v, id) => sameSetOnGrid(id, v, relationTruth(q.inequalityText || q.inequality), (x) => x >= v.lo - 1e-12 && x <= v.hi + 1e-12),
    'dol2r-pr-10': (q, v, id) => sameSetOnGrid(id, v, relationTruth(q.inequalityText || q.inequality), (x) => x < v.lo - 1e-12 || x > v.hi + 1e-12),
    'dol2r-pr-11': (q, v, id) => {
      const [lo, hi] = promptMath(q.prompt).find((span) => span.includes('\\le')).split('\\le x\\le').map(Number);
      let max = -Infinity;
      for (let i = 0; i <= (hi - lo) * 8; i += 1) max = Math.max(max, Math.abs(lo + i / 8));
      expectField(id, v, q, 'answer', max);
    },
    'dol2r-pr-12': (q, v, id) => {
      const roots = solutionsOfEquation(promptMath(q.prompt).find((span) => span.includes('|')));
      if (roots.length !== 2) return fail(id, v, `roots ${roots}`);
      return expectChoice(id, v, q, 'answer', (option) => near(Number(option), roots[0] + roots[1]));
    },
    'dol2r-pr-13': (q, v, id) => {
      const [, target, tolerance] = q.prompt.match(/differs from (\d+) by at most (\d+)/).map(Number);
      expectField(id, v, q, 'answer', target + tolerance);
    },
    'dol2r-pr-14': (q, v, id) => {
      const N = Number(q.prompt.match(/sold (\d+) drinks/)[1]);
      const prices = [...q.prompt.matchAll(/\$(\d+) each/g)].map((match) => Number(match[1]));
      const R = Number(q.prompt.match(/totaled \$(\d+)/)[1]);
      const more = Number(q.prompt.match(/sold (\d+) more medium/)[1]);
      const solution = [v.s, v.md, v.l];
      checkSystem(id, v, q.equations, solution);
      if (v.s + v.md + v.l !== N || prices.length !== 3 || prices[0] * v.s + prices[1] * v.md + prices[2] * v.l !== R || v.md - v.l !== more) fail(id, v, 'the story does not match the solution');
    },
    'dol2r-pr-15': (q, v, id) => {
      const m = Number(q.prompt.match(/is (\d+) times/)[1]);
      const c = Number(q.prompt.match(/is (\d+) degrees more/)[1]);
      const x = (180 - c) / (m + 2);
      expectField(id, v, q, 'xA', x);
      expectField(id, v, q, 'yB', m * x);
      expectField(id, v, q, 'zC', x + c);
      if (!(Number.isInteger(x) && x > 0)) fail(id, v, 'the angles are not positive whole numbers');
    },
    'dol2r-pr-16': (q, v, id) => checkSystem(id, v, q.equations, [v.x0, v.y0, v.z0]),
    'dol2r-pr-17': (q, v, id) => checkSystem(id, v, q.equations, v.solution),
    'dol2r-pr-18': (q, v, id) => {
      const text = q.equationLatex || q.equation;
      const { left, right } = splitRelation(text);
      const [l, r] = [compileExpr(left), compileExpr(right)];
      const roots = solutionsOfEquation(text);
      if (roots.length !== 1 || !near(roots[0], v.good)) fail(id, v, `roots ${roots}`);
      // The other case's candidate solves the split but not the original: extraneous.
      if (!near(l(v.bad), -r(v.bad)) || !(r(v.bad) < 0)) fail(id, v, `${v.bad} is not an extraneous candidate`);
    },
    'dol2r-dol-1': (q, v, id) => {
      const f = functionFromPrompt(q.prompt, 'f');
      const [p, r] = fieldsById(q).maxOnInterval.label.match(/(-?\d+) ≤ x ≤ (-?\d+)/).slice(1).map(Number);
      let max = -Infinity;
      for (let i = 0; i <= (r - p) * 4; i += 1) max = Math.max(max, f(p + i / 4));
      expectField(id, v, q, 'maxOnInterval', max);
      const low = xs.reduce((best, x) => (f(x) < f(best) ? x : best), xs[0]);
      expectField(id, v, q, 'range', `[${f(low)}, ∞)`);
      expectChoice(id, v, q, 'statement', (option) => {
        const symmetry = option.match(/symmetric about the line ([xy]) = (-?\d+)/);
        if (symmetry) return symmetry[1] === 'x' && [1, 2, 3, 4.5].every((dx) => near(f(Number(symmetry[2]) - dx), f(Number(symmetry[2]) + dx)));
        const maximum = option.match(/maximum at \((-?\d+), (-?\d+)\)/);
        if (maximum) return xs.every((x) => f(x) <= Number(maximum[2]) + 1e-9) && near(f(Number(maximum[1])), Number(maximum[2]));
        return false;
      });
    },
    'dol2r-dol-2': (q, v, id) => {
      const g = functionFromPrompt(q.prompt, 'g');
      const top = xs.reduce((best, x) => (g(x) > g(best) ? x : best), xs[0]);
      expectField(id, v, q, 'vertex', `(${top}, ${g(top)})`);
      expectChoice(id, v, q, 'describe', (option) => {
        const words = option.match(/^Reflected across the ([xy])-axis, stretched vertically by a factor of (\d+), shifted (\d+) units (left|right) and (\d+) units (up|down)$/);
        if (!words) return false;
        const a = (words[1] === 'x' ? -1 : 1) * Number(words[2]);
        const h = (words[4] === 'right' ? 1 : -1) * Number(words[3]);
        const k = (words[6] === 'up' ? 1 : -1) * Number(words[5]);
        return [-3, -1, 0, 2, 5].every((x) => near(a * Math.abs(x - h) + k, g(x)));
      });
    },
    'dol2r-dol-3': (q, v, id) => {
      const V = Number(q.prompt.match(/with (\d+) milliliters/)[1]);
      const t = Number(q.prompt.match(/at most (\d+) milliliters/)[1]);
      expectField(id, v, q, 'greatest', V + t);
      expectChoice(id, v, q, 'equation', (option) => {
        const roots = solutionsOfEquation(option.replace(/v/g, 'x'), 1100);
        return roots.length === 2 && near(roots[0], V - t) && near(roots[1], V + t);
      });
    },
    'dol2r-dol-4': (q, v, id) => {
      const roots = solutionsOfEquation(q.equationLatex || q.equation);
      if (roots.length !== 2 || !near(roots[0], v.x1) || !near(roots[1], v.x2)) fail(id, v, `roots ${roots}`);
    },
    'dol2r-dol-5': (q, v, id) => sameSetOnGrid(id, v, relationTruth(q.inequalityText || q.inequality), (x) => x <= v.lo + 1e-12 || x >= v.hi - 1e-12),
    'dol2r-dol-6': (q, v, id) => {
      const N = Number(q.prompt.match(/sold (\d+) items/)[1]);
      const R = Number(q.prompt.match(/totaled \$(\d+)/)[1]);
      const m = Number(q.prompt.match(/sold (\d+) times/)[1]);
      const truth = [[1, 1, 1, N], [1, 2, 3, R], [1, 0, -m, 0]];
      const A = truth.map((row) => row.slice(0, 3));
      const B = truth.map((row) => row[3]);
      const n = det3(A.map((row, r) => row.map((value, c) => (c === 2 ? B[r] : value)))) / det3(A);
      if (!(Number.isInteger(n) && n > 0)) fail(id, v, `notebooks ${n}`);
      expectField(id, v, q, 'notebooks', n);
      expectChoice(id, v, q, 'system', (option) => option.split(/,\s*(?:and\s+)?/).map((equation) => equation.trim().replace(/p/g, 'x').replace(/f/g, 'y').replace(/n/g, 'z'))
        .every((equation, i) => {
          const { row } = linearRow(equation);
          const scale = row.find((value) => Math.abs(value) > 1e-9) / truth[i].find((value) => Math.abs(value) > 1e-9);
          return row.every((value, j) => near(value, truth[i][j] * scale));
        }));
    },
    'dol2r-dol-7': (q, v, id) => checkSystem(id, v, q.equations, v.solution),
  };
};

/* ------------------------------------------------------------- the tests */

test('Pre-Flight: valid with no errors or warnings, and the Warm-Up and DOL are Recovery-ready', () => {
  const model = reviewed();
  assert.equal(model.isValid, true, model.errors.join('\n'));
  assert.deepEqual(model.errors, []);
  assert.deepEqual(model.warnings || [], []);
  assert.equal(model.authoringState, 'ready');
  const generation = model.questionGeneration;
  assert.equal(generation.recoveryReadiness.fullyReady, true);
  assert.equal(generation.recovery.warmup.status, 'ready');
  assert.equal(generation.recovery.dol.status, 'ready');
});

test('blueprint: Classwork, Practice and the DOL each cover exactly the seven standards, one DOL item per standard', () => {
  const { sections } = reviewed();
  ['classwork', 'practice', 'dol'].forEach((role) => {
    assert.deepEqual([...new Set(sectionQuestions(sections, role).map(standardOf))].sort(), BLUEPRINT, role);
  });
  assert.deepEqual(sectionQuestions(sections, 'dol').map(standardOf).sort(), BLUEPRINT, 'the readiness check: one item per standard');
  sectionQuestions(sections, 'warmup').forEach((question) => assert.ok(BLUEPRINT.includes(standardOf(question)), question.questionId));
});

test('blueprint: no version a student can be dealt uses a struck parent function or a non-linear system', () => {
  const STRUCK = [
    [/√|∛|\\sqrt|sqrt\(|cbrt/, 'a root function'],
    [/\blog|\bln\b/, 'a logarithm'],
    [/[a-z]\s*\^|[a-z][²³]/i, 'a power of a variable'],
    [/\d\s*\^\s*\{?\s*[a-z]|[0-9][ˣʸ]/i, 'an exponential'],
    [/(?:^|[^\d.])1\s*\/\s*x\b|\\frac\{1\}\{x\}/, 'the reciprocal function'],
    // ("Reciprocal" stays allowed: a factor inside the bars acts as 1/|b|.)
    [/asymptot|quadratic|parabola|exponential|logarithm|radical|cubic/i, 'a struck topic'],
  ];
  const problems = [];
  dealt().forEach(({ id, values, question }) => {
    studentText(question).forEach((text) => STRUCK.forEach(([pattern, what]) => {
      if (pattern.test(text)) problems.push(`${id} ${JSON.stringify(values)}: ${what} in ${JSON.stringify(text)}`);
    }));
    (Array.isArray(question.equations) ? question.equations : []).forEach((equation) => {
      if (!linearRow(equation).linear) problems.push(`${id} ${JSON.stringify(values)}: ${equation} is not linear`);
    });
  });
  assert.deepEqual(problems.slice(0, 10), []);
});

test('tools: every standard is worked in the tool that does its mathematics, in Classwork and in Practice', () => {
  const { sections } = reviewed();
  const TOOLS = {
    'A2.2A': ['functionCharacteristics'],
    'A2.6C': ['transformationsLab'],
    'A2.6E': ['stepAlgebra'],
    'A2.6F': ['stepAlgebra'],
    'A2.3A': ['matrixLab'],
    'A2.3B': ['systemsWorkspace', 'matrixLab'],
  };
  ['classwork', 'practice'].forEach((role) => {
    const questions = sectionQuestions(sections, role);
    Object.entries(TOOLS).forEach(([standard, tools]) => tools.forEach((tool) => {
      assert.ok(questions.some((question) => standardOf(question) === standard && question.type === tool), `${role}: ${standard} in ${tool}`);
    }));
    // Formulating an absolute value equation is typed, not picked from a list.
    assert.ok(questions.some((question) => standardOf(question) === 'A2.6D'
      && (question.answerFields || []).some((field) => field.inputProfile === 'equation')), `${role}: A2.6D writes an equation`);
  });
  // A solved inequality is graphed on a number line and written in interval notation, as on the DOL.
  const inequalities = sections.flatMap((section) => section.questions).filter((question) => standardOf(question) === 'A2.6F' && question.type === 'stepAlgebra');
  assert.ok(inequalities.length >= 5);
  inequalities.forEach((question) => assert.deepEqual(inequalitySolutionRepresentationStages(question), ['graph', 'interval'], question.questionId));
  // The DOL's systems item uses technology with matrices, as the blueprint names it.
  assert.equal(sectionQuestions(sections, 'dol').find((question) => standardOf(question) === 'A2.3B').type, 'matrixLab');
});

test('versions: every Warm-Up, Practice and DOL item deals each student their own numbers', () => {
  const { sections } = reviewed();
  ['warmup', 'practice', 'dol'].forEach((role) => sectionQuestions(sections, role).forEach((question) => {
    assert.ok(isFamilyBackedQuestion(question), `${question.questionId} is a Question Family`);
    const versions = versionsOf(question, 12);
    assert.ok(new Set(versions.map((version) => JSON.stringify(version.values))).size >= 12, `${question.questionId} has at least 12 versions`);
  }));
});

test('versions: sampled versions of every item are mathematically right, and read cleanly', () => {
  const problems = [];
  const perItem = new Map();
  const fail = (id, values, message) => {
    perItem.set(id, (perItem.get(id) || 0) + 1);
    if (perItem.get(id) <= 3) problems.push(`${id} ${JSON.stringify(values)}: ${message}`);
  };
  const CHECKS = checksFor(fail);
  const LINT = [
    [/\{\{|\}\}/, 'an unfilled placeholder'],
    [/(^|[^-])--\s*\d|\+\s*-\s*\d|-\s+-\s*\d|\+\s*\+/, 'stacked signs'],
    [/(^|[^\d.\w])1[xyz](?![\w])/, 'a coefficient of 1 written out'],
    [/(^|[^\d.\w])0[xyz](?![\w])/, 'a zero coefficient written out'],
    [/NaN|undefined|Infinity|null/, 'a non-number in the text'],
  ];
  const familyIds = new Set();
  dealt().forEach(({ id, values, question, local }) => {
    if (!isFamilyBackedQuestion(reviewed().questions.find((entry) => entry.questionId === id))) return;
    familyIds.add(id);
    const check = CHECKS[id];
    if (!check) return fail(id, values, 'no check for this item');
    if (local) {
      studentText(question).forEach((text) => LINT.forEach(([pattern, what]) => {
        if (pattern.test(text.replace(/[xy]-(intercept|axis|value|coordinate)s?/g, ''))) fail(id, values, `${what}: ${JSON.stringify(text)}`);
      }));
    }
    try {
      check(question, values, id);
    } catch (error) {
      fail(id, values, `threw ${error.message}`);
    }
    return undefined;
  });
  assert.deepEqual(problems, []);
  assert.equal(familyIds.size, Object.keys(CHECKS).length, 'every family item was sampled and checked');
});

/*
 * READ ALOUD HEARS THE EQUATION (CT21 / D-60). Read aloud says the prompt, the
 * choices and the field labels (questionReading.js); it never says the
 * equation a solving workspace draws for itself. Eight cards used to say only
 * "Solve the equation." or "Solve the inequality." (Practice 18, "Honors
 * challenge: solve the equation.", was found by this sweep; the audit had
 * listed seven) and left the equation to the workspace, so a student who
 * listens heard no equation. A card now writes it in the task, as the
 * Classwork cards always did ("Solve $-3|2x-5|+4=-11$.").
 *
 * The eight are listed by hand, and each must be among the cards found by
 * the sweep: the sweep reads every question that opens the solving workspace,
 * so a card added later is held to the same rule, while a card dropped from
 * the sweep (or renamed) cannot pass by never being looked at.
 */
const SOLVING_CARDS_THAT_NAME_THEIR_EQUATION = ['dol2r-wu-3', 'dol2r-pr-7', 'dol2r-pr-8', 'dol2r-pr-9', 'dol2r-pr-10', 'dol2r-pr-18', 'dol2r-dol-4', 'dol2r-dol-5'];
const opensSolvingWorkspace = (question) => (question.studentActions || []).some((action) => action === 'solveStepByStep' || action === 'solveInequality');
// What the workspace draws, written as the prompt's own math, then said the way Read aloud says it.
const saidAsMath = (relation) => speechTextFor(`$${String(relation).replace(/>=/g, '\\ge ').replace(/<=/g, '\\le ')}$`);
const heardWholeCard = (question) => speechTextFor(questionReadingText(questionReadingParts(question)));

test('Read aloud: every card that opens the solving workspace says its equation or inequality, in every version', () => {
  const cards = dealt().filter(({ question }) => opensSolvingWorkspace(question));
  const ids = new Set(cards.map(({ id }) => id));
  SOLVING_CARDS_THAT_NAME_THEIR_EQUATION.forEach((id) => assert.ok(ids.has(id), `${id} is among the cards that open the solving workspace`));
  assert.ok(cards.length >= SOLVING_CARDS_THAT_NAME_THEIR_EQUATION.length * 12, `${cards.length} versions of ${ids.size} cards were read`);
  const silent = [];
  cards.forEach(({ id, values, question }) => {
    // The same fields the sampled-version checks read (a built version may keep the workspace's text under either name).
    const relation = question.inequalityText || question.inequality || question.equationLatex || question.equation;
    if (!relation) return silent.push(`${id}: no equation or inequality field to compare with`);
    const heard = heardWholeCard(question);
    if (!heard.includes(saidAsMath(relation))) silent.push(`${id} ${JSON.stringify(values)}: the workspace draws ${relation}, Read aloud says "${heard.slice(0, 120)}"`);
    return undefined;
  });
  const silentCards = [...new Set(silent.map((line) => line.split(/[ :]/)[0]))];
  assert.deepEqual(silentCards, [], `${silent.length} version(s) of these cards do not say their equation: ${silent.slice(0, 2).join(' | ')}`);
});

test('Classwork: the matrix error-analysis item grades the fixed equation right and finds both of Marcus\'s rows', () => {
  const question = reviewed().questions.find((entry) => entry.questionId === 'dol2r-cw-11');
  // Marcus's matrix equation, as the lab pre-fills it.
  const marcus = question.startFrom.A.map((row) => (Array.isArray(row) ? row : row.cells).map(String));
  const B = question.startFrom.B.map(String);
  const fixed = [['3', '-2', '-4'], ['1', '-2', '4'], ['2', '1', '1']];
  const right = matrixLab.grade(question, { A: fixed, B, classification: 'one', values: ['2', '-1', '3'] });
  assert.equal(right.isCorrect, true, JSON.stringify(right.parts.filter((part) => !part.isCorrect)));
  const his = [-0.25, 4.875, 1.625];
  const unchanged = matrixLab.grade(question, { A: marcus, B, classification: 'one', values: his.map(String) });
  assert.equal(unchanged.isCorrect, false);
  assert.deepEqual(unchanged.parts.filter((part) => part.id.startsWith('row') && !part.isCorrect).map((part) => part.id), ['row1', 'row2'], 'exactly the two rows the prompt says are wrong');
  // His calculator's answer is the true solution of his matrix equation, as the prompt says.
  marcus.forEach((row, i) => assert.ok(near(row.reduce((sum, cell, j) => sum + Number(cell) * his[j], 0), Number(B[i])), `his answer solves his row ${i + 1}`));
  assert.ok(!near(3 * his[0] - 2 * his[1], 4 * his[2] - 4), 'and it fails the first equation as printed');
  assert.match(question.prompt, /x = −0\.25, y = 4\.875, z = 1\.625/);
});

test('import: no answer box in any version becomes a set box', () => {
  const sets = dealt().flatMap(({ id, question }) => (question.answerFields || [])
    .filter((field) => field.type === 'set' || field.toolProfile === 'set' || field.inputProfile === 'set')
    .map((field) => `${id}.${field.id}`));
  assert.deepEqual([...new Set(sets)], []);
});

test('Honors: the candidate is READY, meets every depth check, and keeps every authored item', () => {
  const { base, candidate } = honorsCandidate();
  assert.equal(candidate.status, HONORS_CCMR_STATUS.READY, candidate.errors.join('\n'));
  assert.equal(candidate.model.isValid, true, candidate.errors.join('\n'));
  assert.deepEqual(candidate.model.warnings || [], []);
  assert.equal(candidate.honorsReport.isHonorsReady, true);
  assert.deepEqual(candidate.honorsReport.missing, []);
  assert.equal(candidate.honorsReport.depthCount, 4, 'DOK 3 reasoning, representations, justification (error analysis), modeling');
  // 18 Practice items: round(18 × 0.15) = 3, met by the three audited Digital SAT items already there.
  assert.equal(sectionQuestions(base.sections, 'practice').length, 18);
  assert.equal(candidate.targetCount, 3);
  assert.deepEqual(candidate.sourced || [], [], 'nothing had to be sourced');
  const audited = sectionQuestions(base.sections, 'practice').filter((question) => question.ccmrSource?.source === 'auditedBank');
  assert.deepEqual(audited.map((question) => question.ccmrSource.documentId), SAT_ITEMS);
  audited.forEach((question) => assert.ok(BLUEPRINT.includes(standardOf(question)), question.questionId));
  ['warmup', 'classwork', 'practice', 'dol'].forEach((role) => {
    assert.deepEqual(sectionQuestions(candidate.assignmentV5.sections, role).map(keyOf), sectionQuestions(base.sections, role).map(keyOf), `${role} is the Regular version's`);
  });
});

test('Standard and Honors: a class of up to 70 gets its own version of every Practice and DOL item, in both versions', () => {
  // Uniqueness is judged per class, against the largest roster Review is given
  // (LessonPreflightModal.jsx); any warning would hold the assignment at Needs Review.
  const classSize = 70;
  const parsed = parseAssignmentBlueprintText(readFileSync(new URL(`../../${REVIEW}`, import.meta.url), 'utf8'));
  const standard = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}), { classSize });
  assert.deepEqual(standard.warnings || [], [], 'the Standard version');
  // The Honors version as Review builds it for an Honors class of that size:
  // the bank's answer does not depend on the class, the two stages do.
  const { base, hydration } = honorsCandidate();
  const selection = selectHonorsCcmrItems({ baseAssignmentV5: base, hydration, honorsEnrichmentQuestion: null, excludedDocumentIds: [], classSize });
  const candidate = composeHonorsCcmrCandidate({ baseAssignmentV5: base, selection, honorsEnrichmentQuestion: null, keepAuthored: false, classSize });
  assert.equal(candidate.status, HONORS_CCMR_STATUS.READY, candidate.errors.join('\n'));
  assert.deepEqual(buildAssignmentV5PreflightModel(candidate.assignmentV5, { classSize }).warnings || [], [], 'the Honors version');
});

test('Honors: Pre-Flight says the Honors version can be created, and Create accepts exactly the object it previewed', () => {
  const { base, candidate } = honorsCandidate();
  const readiness = summarizePreflightReadiness({
    blockers: collectReviewBlockers({
      draft: { title: 'DOL #2 Review', assignedClassIds: ['honors-1'], dueAt: '2099-01-01T12:00' },
      honorsSelected: true,
      honorsReport: candidate.honorsReport,
      honorsCcmr: { status: candidate.status, errors: candidate.errors },
    }),
    validationErrors: [],
    bundleIsValid: true,
  });
  assert.equal(readiness.canCreate, true);
  const created = confirmHonorsCandidateForCreate({ honorsCandidate: candidate, reviewedAssignmentV5: base, honorsEnrichmentQuestion: null });
  assert.deepEqual(created.assignmentV5, candidate.assignmentV5);
});

test('Recovery: the Warm-Up and DOL run from their own families, fully ready on the server\'s key check, Regular and Honors', () => {
  const { base, candidate } = honorsCandidate();
  for (const [level, assignmentV5] of [['standard', base], ['honors', candidate.assignmentV5]]) {
    const payload = asPayload(assignmentV5, level);
    // Each item carries its family, so creation has nothing to bind; whatever it stores must still plan ready.
    const content = creationRecoveryContent(payload, { at: '2026-10-22T12:00:00Z', actorUid: 'teacher-uid' });
    const stored = content ? { ...payload, recoveryContent: content } : payload;
    if (content) assert.equal(assignmentRecoveryContent(stored).version, 1);
    const plan = planAssignmentRecoveryContent({ assignment: stored, gradeSample: serverRecoveryKeyCheck });
    assert.equal(plan.fullyReady, true, `${level}: both sections ready on the server's full key check`);
    assert.equal(plan.sections.warmup.status, 'ready');
    assert.equal(plan.sections.dol.status, 'ready');
  }
});

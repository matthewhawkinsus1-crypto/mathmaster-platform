import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { create, all } from 'mathjs';
import Fraction from 'fraction.js';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { gradeServerResponse, gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { resolveRequiredCards } from '../../functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';
import { keyProcessLog } from '../../functions/shared/toolMath/representationBridge/lmrProcessVerify.mjs';
import { gradeComposedWorkflowWork } from '../../functions/shared/serverGrading/questionGraders/composedWorkflow.mjs';
import { resolveComposedWorkflow } from '../../functions/shared/toolMath/workflow/composedWorkflowContract.mjs';
import { resolveWorkflowGraphStages, workflowTableArtifact } from '../../functions/shared/toolMath/workflow/workflowGraphStage.mjs';
import { GRAPH_WORKSPACE_VIEWBOX, graphWorkspaceModelFor } from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';

/*
 * JOB K SWEEP, PART 2 — THE V5 ASSIGNMENTS THAT LIVE OUTSIDE THE IMPORT
 * FOLDERS.
 *
 * kSweep_v5AssignmentBanks.test.mjs sweeps teacher-import-jsons/**, the DOL2
 * review and secure bank and the demo bank. A repo-wide search for V5
 * assignment JSON ("studentActions" or the canonical-assignment marker) also
 * finds six lessons outside those folders; this file sweeps them the same way:
 *
 *   docs/assignments/Algebra_II_Honors_3x3_Systems_Day1_V5_FINAL.json   13 systems items
 *   docs/assignments/Algebra_II_Honors_3x3_Systems_Day2_V5{,_FINAL}.json 12 each (6 systems, 6 multiAnswer)
 *   docs/assignments/algebra1-linear-multiple-representations-final-v5.json  8 (sort + board)
 *   docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json  the same 8 as families
 *   SAMPLE_AUTHORING_INTENT_V5.json                                       3 (relation, model, graph)
 *
 * (tests/browser/day1SystemsJourneyQuestions.json also matches the search but
 * is a browser fixture the V5 parser refuses, so it is not an assignment.)
 *
 * Each file is compiled through parseAssignmentBlueprintText, the teacher
 * import path. Every key is worked HERE from the prompt or the authored
 * system — Cramer's rule in fraction.js, mathjs evaluation, or by hand in the
 * tables below — never read back from the compiled question, and then graded
 * by the production grader for its surface (gradeToolWork for the registry
 * tools, gradeServerResponse for ordinary fields), together with the
 * equivalent work a student may produce and at least one wrong answer that
 * must stay wrong.
 */

const math = create(all, {});
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const compile = (path) => parseAssignmentBlueprintText(read(path)).questions;

const SYSTEMS_DAY1 = 'docs/assignments/Algebra_II_Honors_3x3_Systems_Day1_V5_FINAL.json';
const SYSTEMS_DAY2 = ['docs/assignments/Algebra_II_Honors_3x3_Systems_Day2_V5.json', 'docs/assignments/Algebra_II_Honors_3x3_Systems_Day2_V5_FINAL.json'];

const minus = (value) => String(value).replace(/-/g, '−');

/* ------------------------------------------------------------- systems -- */

// An equation's coefficients, read by evaluating (left − right) with mathjs at
// the origin and at each unit vector — not by the workspace's own parser.
const coefficientsOf = (equation, variables) => {
  const [left, right] = equation.replace(/[−–]/g, '-').split('=');
  const at = (scope) => new Fraction(math.evaluate(`(${left}) - (${right})`, scope));
  const zero = Object.fromEntries(variables.map((name) => [name, 0]));
  const origin = at(zero);
  return { row: variables.map((name) => at({ ...zero, [name]: 1 }).sub(origin)), constant: origin.neg() };
};
const det = (m) => (m.length === 2
  ? m[0][0].mul(m[1][1]).sub(m[0][1].mul(m[1][0]))
  : m[0].reduce((sum, entry, column) => sum.add(entry.mul(det(m.slice(1).map((row) => row.filter((_, c) => c !== column)))).mul(column % 2 ? -1 : 1)), new Fraction(0)));
// Cramer's rule in exact fractions: the one solution, or null for a singular system.
const solveSystem = (equations, variables) => {
  const rows = equations.map((equation) => coefficientsOf(equation, variables));
  const matrix = rows.map(({ row }) => row);
  const d = det(matrix);
  if (d.equals(0)) return null;
  return Object.fromEntries(variables.map((name, column) => [name, det(matrix.map((row, r) => row.map((entry, c) => (c === column ? rows[r].constant : entry)))).div(d)]));
};
// How each pair of planes meets, from proportional coefficient rows.
const planeRelations = (equations, variables) => {
  const rows = equations.map((equation) => coefficientsOf(equation, variables));
  const relation = (a, b) => {
    const pivot = a.row.findIndex((entry) => !entry.equals(0));
    const ratio = b.row[pivot].div(a.row[pivot]);
    if (!a.row.every((entry, i) => entry.mul(ratio).equals(b.row[i]))) return { kind: 'line' };
    const k = b.constant.sub(a.constant.mul(ratio));
    return { kind: k.equals(0) ? 'coincident' : 'parallel', k };
  };
  return { '1-2': relation(rows[0], rows[1]), '1-3': relation(rows[0], rows[2]), '2-3': relation(rows[1], rows[2]) };
};

// A side of an original equation evaluated at the solution, as a student may
// type it: the value, a "−", the substitution written out (×, ·, LaTeX \cdot
// and \left( \right)), and an unreduced fraction for a fractional value.
const substituted = (side, values, { times = '', open = '(', close = ')' } = {}) => side.replace(/[−–]/g, '-')
  .replace(/(\d*)\s*([a-z])/g, (_, digits, name) => `${digits}${digits ? times : ''}${open}${values[name]}${close}`);
const sideSpellings = (side, values) => {
  const value = new Fraction(math.evaluate(side.replace(/[−–]/g, '-'), Object.fromEntries(Object.entries(values).map(([name, v]) => [name, Number(v)]))));
  const text = value.toFraction();
  const out = new Set([text, minus(text), ` ${text} `, `${value.mul(2).toFraction()}/2`]);
  if (!/^[\d\s.+-]+$/.test(side.trim())) {
    out.add(substituted(side, values));
    out.add(substituted(side, values, { times: '*' }));
    out.add(substituted(side, values, { times: '\\cdot ', open: '\\left(', close: '\\right)' }));
  }
  return [...out];
};

// Day 1 and Day 2 algebraic items: solved as authored, by Cramer's rule.
const ALGEBRAIC = {
  [`${SYSTEMS_DAY1}#10`]: 'x + y = 11 and 2x - y = 4',
};

test('systems lessons: every algebraic item grades its solved values and verification right, in any typed spelling, and a wrong value wrong', () => {
  const counts = { items: 0, spellings: 0, methods: 0 };
  for (const file of [SYSTEMS_DAY1, ...SYSTEMS_DAY2]) {
    compile(file).forEach((question, index) => {
      if (question.type !== 'systemsWorkspace' || question.mode !== 'algebraic') return;
      const { equations, variables } = question;
      const stated = ALGEBRAIC[`${file}#${index}`];
      if (stated) assert.ok(question.prompt.includes(stated) && stated.split(' and ').every((e, i) => e === equations[i]), `${file}#${index}: the system the prompt states`);
      const solution = solveSystem(equations, variables);
      if (!solution) return; // the dependent / inconsistent systems: next test
      counts.items += 1;
      const values = Object.fromEntries(variables.map((name) => [name, solution[name].valueOf()]));
      const exact = Object.fromEntries(variables.map((name) => [name, solution[name].toFraction()]));
      const verification = Object.fromEntries(equations.map((equation, i) => {
        const [left, right] = equation.split('=');
        return [`E${i + 1}`, { left: sideSpellings(left, exact)[0], right: sideSpellings(right, exact)[0] }];
      }));
      const methods = question.method === 'studentChoice' ? ['elimination', 'substitution'] : [question.method];
      const grade = (work) => gradeToolWork({ toolId: 'systemsWorkspace', question, work: { dimension: variables.length, method: methods[0], values, verification, ...work } });
      for (const method of methods) {
        counts.methods += 1;
        const result = grade({ method });
        assert.equal(result.isCorrect, true, `${file}#${index} by ${method}: ${JSON.stringify(result.parts?.filter((part) => !part.isCorrect))}`);
      }
      // One value off by one is wrong.
      assert.equal(grade({ values: { ...values, [variables[0]]: values[variables[0]] + 1 } }).isCorrect, false, `${file}#${index}: a wrong ${variables[0]}`);
      if (!question.requireVerification) return;
      equations.forEach((equation, i) => {
        const id = `E${i + 1}`;
        const [left, right] = equation.split('=');
        for (const [sideName, side] of [['left', left], ['right', right]]) {
          for (const spelling of sideSpellings(side, exact)) {
            counts.spellings += 1;
            const result = grade({ verification: { ...verification, [id]: { ...verification[id], [sideName]: spelling } } });
            assert.equal(result.isCorrect, true, `${file}#${index} ${id}.${sideName}: "${spelling}"`);
          }
        }
        // A side typed one off is wrong (unless that side is a given number).
        const off = new Fraction(math.evaluate(left.replace(/[−–]/g, '-'), values)).add(1).toFraction();
        if (/[a-z]/.test(left)) assert.equal(grade({ verification: { ...verification, [id]: { ...verification[id], left: off } } }).isCorrect, false, `${file}#${index} ${id}: a wrong left side`);
      });
    });
  }
  // Day 1: 3 two-variable + 6 three-variable; Day 2 (each copy): 3 three-variable with one solution.
  assert.equal(counts.items, 9 + 3 * 2, JSON.stringify(counts));
  console.log('kSweep systems algebraic', counts);
});

test('systems lessons: the dependent and inconsistent 3×3 items grade the statement elimination reaches, its meaning and every plane pair', () => {
  let swept = 0;
  let spellings = 0;
  for (const file of SYSTEMS_DAY2) {
    compile(file).forEach((question, index) => {
      if (question.type !== 'systemsWorkspace' || question.mode !== 'algebraic' || solveSystem(question.equations, question.variables)) return;
      swept += 1;
      const relations = planeRelations(question.equations, question.variables);
      const parallel = Object.values(relations).find((relation) => relation.kind === 'parallel');
      const type = parallel ? 'none' : 'infinite';
      // The statement a pair of proportional planes leaves: 0 = k.
      const k = (parallel || Object.values(relations).find((relation) => relation.kind === 'coincident')).k;
      const planes = Object.fromEntries(Object.entries(relations).map(([id, { kind }]) => [id, kind]));
      const outcome = { statement: `0 = ${k.toFraction()}`, classificationChoice: type, classificationKind: parallel ? 'contradiction' : 'identity', planes };
      const grade = (overrides) => gradeToolWork({ toolId: 'systemsWorkspace', question, work: { dimension: 3, method: 'elimination', outcome: { ...outcome, ...overrides } } });
      const key = grade({});
      assert.equal(key.isCorrect, true, `${file}#${index}: ${JSON.stringify(key.parts?.filter((part) => !part.isCorrect))}`);
      // The same statement as written: no spaces, a "−", reversed, from the
      // other subtraction, and with the constants left uncombined (8 = 11).
      for (const statement of new Set([`0=${k.toFraction()}`, minus(`0 = ${k.neg().toFraction()}`), `${k.toFraction()} = 0`, `0 = ${k.neg().toFraction()}`, `8 = ${k.add(8).toFraction()}`])) {
        spellings += 1;
        assert.equal(grade({ statement }).isCorrect, true, `${file}#${index}: "${statement}"`);
      }
      // Every other meaning, reading and plane answer is wrong.
      for (const choice of ['unique', 'infinite', 'none'].filter((value) => value !== type)) assert.equal(grade({ classificationChoice: choice }).isCorrect, false, `${file}#${index}: ${choice}`);
      assert.equal(grade({ classificationKind: parallel ? 'identity' : 'contradiction' }).isCorrect, false, `${file}#${index}: the wrong reading`);
      for (const id of Object.keys(planes)) {
        for (const kind of ['line', 'parallel', 'coincident'].filter((value) => value !== planes[id])) {
          assert.equal(grade({ planes: { ...planes, [id]: kind } }).isCorrect, false, `${file}#${index} planes ${id}: ${kind}`);
        }
      }
      assert.equal(grade({ statement: parallel ? '0 = 0' : '0 = 1' }).isCorrect, false, `${file}#${index}: the other kind of statement`);
    });
  }
  assert.equal(swept, 4);
  console.log('kSweep systems nonunique', { items: swept, spellings });
});

// The 3D-model and Day 2 choice items, keyed by hand from each prompt.
const CHOICE_KEYS = {
  [`${SYSTEMS_DAY1}#2`]: { meaning: 'A point that lies on all three planes.' },
  [`${SYSTEMS_DAY1}#4`]: { connection: 'The ordered triple satisfies all three equations, so the point lies on all three planes.' },
  [`${SYSTEMS_DAY1}#8`]: { classification: 'The three planes share one common point.' },
  [`${SYSTEMS_DAY1}#12`]: { geometry: 'Its coordinates make all three equations true at the same time.' },
  '#0': { geometric_meaning: 'An ordered triple that satisfies all three equations simultaneously.' },
  // Equations 1 and 3 both carry +2z; Equation 2's −z needs only ×2.
  '#1': { strategy_first_variable: 'z (since both equations have +2z, subtracting eliminates z immediately)',
    strategy_second_pair: 'Pair Equation 2 (-z) with Equation 1 (+2z) or Equation 3 (+2z), multiplying only Equation 2 by 2.' },
  '#6': { case1_identity: 'Those two planes coincide. The system has infinitely many solutions only if the remaining equation produces no contradiction, so it must still be checked.',
    case2_contradiction: 'Those two planes are parallel and distinct, so no point lies on both. The system has no solution, whatever the remaining equation says.' },
  '#7': { modeling_eq1: 's + m = l + 8', modeling_eq2: 'm + l = 3s + 4', modeling_eq3: 's + m + l = 72' },
  // 3·(1) is 6x + 3y − 9z = 15; with c = 20, 3·(1) − (3) leaves 0 = −5.
  '#9': { param_infinite: 'c = 15', param_none: 'No solution (Equation 3 is parallel to and distinct from Equation 1, creating a contradiction 0 = -5).' },
  '#10': { dol1_classification: 'Inconsistent (no solution)', dol1_reason: '0 = 8 is a contradiction (false for all values of x, y, z), meaning the planes share no common intersection.' },
  '#11': { dol2_algebra_connection: 'A contradiction such as 0 = k (where k ≠ 0) when combining the two parallel plane equations.', dol2_solution_count: 'No solution (the three planes share no point in common).' },
};

test('systems lessons: every 3D-model and choice item grades its hand-worked key right and every distractor wrong', () => {
  let options = 0;
  let swept = 0;
  for (const file of [SYSTEMS_DAY1, ...SYSTEMS_DAY2]) {
    compile(file).forEach((question, index) => {
      const spatial = question.type === 'systemsWorkspace' && question.mode === 'spatial';
      if (!spatial && question.type !== 'multiAnswer') return;
      const keys = CHOICE_KEYS[`${file}#${index}`] || (file !== SYSTEMS_DAY1 && CHOICE_KEYS[`#${index}`]);
      assert.ok(keys, `${file}#${index} has a hand-worked key`);
      swept += 1;
      const grade = (answers) => (spatial
        ? gradeToolWork({ toolId: 'systemsWorkspace', question, work: { responses: Object.entries(answers).map(([id, value]) => ({ id, value })) } })
        : gradeServerResponse({ question, response: { kind: 'fields', type: 'multiAnswer', value: '', fields: Object.entries(answers).map(([id, value]) => ({ id, value, isComplete: true })) } }));
      assert.deepEqual(question.answerFields.map((field) => field.id).sort(), Object.keys(keys).sort(), `${file}#${index}: fields`);
      assert.equal(grade(keys).isCorrect, true, `${file}#${index}: the key`);
      for (const field of question.answerFields) {
        for (const option of field.options) {
          options += 1;
          assert.equal(grade({ ...keys, [field.id]: option }).isCorrect, option === keys[field.id], `${file}#${index}.${field.id}: "${option}"`);
        }
      }
    });
  }
  // The modeling item's key is the system the next item solves.
  const day2 = compile(SYSTEMS_DAY2[1]);
  const modeled = Object.values(CHOICE_KEYS['#7']);
  const solved = solveSystem(day2[8].equations, day2[8].variables);
  modeled.forEach((equation) => {
    const [left, right] = equation.split('=');
    assert.equal(new Fraction(math.evaluate(`(${left}) - (${right})`, Object.fromEntries(Object.entries(solved).map(([name, value]) => [name, value.valueOf()])))).valueOf(), 0, `(17, 23, 32) satisfies ${equation}`);
  });
  assert.deepEqual(Object.values(solved).map(String), ['17', '23', '32']);
  assert.equal(swept, 4 + 2 * 7);
  console.log('kSweep systems choices', { items: swept, options });
});

/* ------------------------------------------- multiple representations -- */

const LMR_FINAL = 'docs/assignments/algebra1-linear-multiple-representations-final-v5.json';
const LMR_FAMILY = 'docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json';
// Generated versions sampled per family item (seats 0 … SEATS − 1).
const SEATS = 6;
const versionsOf = (file) => compile(file).map((template, index) => (template.questionFamily
  ? Array.from({ length: SEATS }, (_, seat) => ({ id: `${file}#${index} seat ${seat}`,
    question: resolveFamilyQuestionInstance({ question: template, assignmentId: 'k-sweep', storageIndex: index, allocation: { seat } }).question }))
  : [{ id: `${file}#${index}`, question: template }]));

const frac = (value) => new Fraction(String(value).replace(/[−–]/g, '-'));
const lineOfEquation = (text) => {
  const { row: [a, b], constant } = coefficientsOf(String(text), ['x', 'y']);
  return { m: a.neg().div(b), b: constant.div(b) };
};
const sameLine = (line, m, b) => line.m.equals(m) && line.b.equals(b);
// A situation card: "has $12 saved and adds $4" / "holds 40 gallons … drains 5".
const lineOfContext = (text) => {
  const [start, rate] = [...String(text).matchAll(/\d+(?:\.\d+)?/g)].map((match) => frac(match[0]));
  return { m: /drain|burn|lose/.test(text) ? rate.neg() : rate, b: start };
};

// Every card a sort deals, checked against the line it should describe.
const checkSetCard = (set, kind, { m, b }, where) => {
  const ok = {
    slopeIntercept: () => sameLine(lineOfEquation(set.slopeIntercept), m, b),
    standard: () => sameLine(lineOfEquation(set.standard), m, b),
    pointSlope: () => sameLine(lineOfEquation(set.pointSlope), m, b),
    factoredLinear: () => sameLine(lineOfEquation(set.factoredLinear), m, b),
    graph: () => set.graphSpec.type === 'linear' && frac(set.graphSpec.a).equals(m) && frac(set.graphSpec.k).sub(frac(set.graphSpec.a).mul(set.graphSpec.h)).equals(b),
    xIntercept: () => frac(set.xIntercept[1]).equals(0) && m.mul(set.xIntercept[0]).add(b).equals(0),
    yIntercept: () => frac(set.yIntercept[0]).equals(0) && frac(set.yIntercept[1]).equals(b),
    point: () => m.mul(set.point[0]).add(b).equals(set.point[1]),
    slope: () => frac(set.slope).equals(m),
    context: () => sameLine(lineOfContext(set.context), m, b),
  }[kind];
  assert.ok(ok, `${where}: a ${kind} card is checked`);
  assert.ok(ok(), `${where}: the ${kind} card of ${set.id} describes y = ${m.toFraction()}x + ${b.toFraction()}`);
};

test('multiple representations: every sort deals cards of the lines it names, and grades the right sort right, with the groups either way round, and a misplaced card wrong', () => {
  let versions = 0;
  let cards = 0;
  for (const file of [LMR_FINAL, LMR_FAMILY]) {
    for (const { id, question } of versionsOf(file).flat()) {
      if (question.type !== 'representationMatch') continue;
      versions += 1;
      // The lines: the two the prompt names, or the two situations.
      const named = [...question.prompt.matchAll(/y = [^.]*?(?= and |\. )/g)].map((match) => lineOfEquation(match[0]));
      const lines = named.length ? named : question.sets.map((set) => lineOfContext(set.context));
      assert.equal(lines.length, 2, `${id}: two lines`);
      if (!named.length) assert.ok(question.prompt.includes('grows and one shrinks') && lines[0].m.s !== lines[1].m.s, `${id}: one grows, one shrinks`);
      question.sets.forEach((set, slot) => question.cardKinds.forEach((kind) => checkSetCard(set, kind, lines[slot], id)));
      const placements = (slotOf) => question.sets.flatMap((set, slot) => question.cardKinds.map((kind) => ({ cardId: `${set.id}:${kind}`, slot: slotOf(slot) })));
      const grade = (assignments) => gradeToolWork({ toolId: 'representationMatch', question, work: { assignments } });
      const sorted = placements((slot) => slot);
      cards += sorted.length;
      assert.equal(grade(sorted).isCorrect, true, `${id}: the sort`);
      assert.equal(grade(placements((slot) => 1 - slot)).isCorrect, true, `${id}: the same groups, the other way round`);
      for (let index = 0; index < sorted.length; index += 1) {
        const moved = sorted.map((placement, i) => (i === index ? { ...placement, slot: 1 - placement.slot } : placement));
        assert.equal(grade(moved).isCorrect, false, `${id}: ${sorted[index].cardId} in the wrong group`);
      }
    }
  }
  assert.equal(versions, 2 + 2 * SEATS);
  console.log('kSweep representation sorts', { versions, cards, sampledSeatsPerFamily: SEATS });
});

// The line a board gives, read from what the student is shown: the equation
// in the prompt, the table, or the situation's two numbers.
const givenLine = (question, id) => {
  const { source } = question;
  if (source.kind === 'table') {
    const [first, second] = source.rows;
    const m = frac(second.y).sub(first.y).div(frac(second.x).sub(first.x));
    const line = { m, b: frac(first.y).sub(m.mul(first.x)) };
    source.rows.forEach((row) => assert.ok(line.m.mul(row.x).add(line.b).equals(row.y), `${id}: row (${row.x}, ${row.y}) is on the line`));
    return line;
  }
  if (source.kind === 'scenario') {
    const line = lineOfContext(source.prompt);
    assert.ok(frac(source.m).equals(line.m) && frac(source.b).equals(line.b), `${id}: the board's line is the situation's`);
    return line;
  }
  const shown = question.prompt.match(/equation (.*)\. Build/)[1];
  const line = lineOfEquation(shown);
  assert.ok(sameLine(lineOfEquation(source.equation), line.m, line.b), `${id}: the board's equation is the prompt's`);
  return line;
};

// A terminating decimal (1/4 → 0.25), or null.
const decimalOf = (value) => (value.d !== 1n && 10n ** 6n % value.d === 0n ? String(value.valueOf()) : null);
const latexFrac = (value) => (value.d === 1n ? value.toFraction() : `${value.s < 0n ? '-' : ''}\\frac{${value.n}}{${value.d}}`);
const coefficientText = (value, name, toText = (v) => v.toFraction()) => (value.equals(1) ? name : value.equals(-1) ? `-${name}` : `${toText(value)}${name}`);
const plus = (value, toText = (v) => v.toFraction()) => (value.equals(0) ? '' : value.s < 0n ? ` - ${toText(value.abs())}` : ` + ${toText(value)}`);
const pairText = ([x, y]) => `(${x.toFraction()}, ${y.toFraction()})`;
// Standard form Ax + By = C: whole numbers, no common factor, A > 0 (or A = 0, B > 0).
const standardOf = ({ m, b }) => {
  const scale = m.d * b.d;
  let [A, B, C] = [m.neg().mul(scale), new Fraction(scale), b.mul(scale)];
  const common = [A, B, C].reduce((g, v) => g.gcd(v), new Fraction(0));
  [A, B, C] = [A, B, C].map((v) => v.div(common));
  if (A.s < 0n || (A.equals(0) && B.s < 0n)) [A, B, C] = [A, B, C].map((v) => v.neg());
  return { A, B, C };
};

// A complete board for y = mx + b, as typed, with the spellings each card
// must also take. `through` is the point the point-slope card (and Graph 3)
// starts from.
const boardFor = (question, { m, b }) => {
  const step = new Fraction(m.d);
  const at = (x) => [x, m.mul(x).add(b)];
  const yIntercept = at(new Fraction(0));
  const second = at(step);
  const zero = b.neg().div(m);
  const { A, B, C } = standardOf({ m, b });
  const given = question.source.kind === 'pointSlope' ? lineOfPointSlope(question.source.equation) : null;
  const anchor = given || second;
  const ahead = (point, k = 1) => [point[0].add(step.mul(k)), point[1].add(m.mul(step).mul(k))].map(Number);
  const pointSlope = (point, toText = (v) => v.toFraction(), open = '(', close = ')') => `y${plus(point[1].neg())} = ${toText(m)}${open}x${plus(point[0].neg())}${close}`;
  const board = {
    standardFormEquation: `${A.equals(0) ? '' : `${coefficientText(A, 'x')} `}${B.s < 0n ? '- ' : A.equals(0) ? '' : '+ '}${coefficientText(B.abs(), 'y')} = ${C.toFraction()}`,
    slopeInterceptEquation: `y = ${coefficientText(m, 'x')}${plus(b)}`,
    pointSlopeEquation: pointSlope(second),
    featureSlope: m.toFraction(),
    featureXIntercept: pairText([zero, new Fraction(0)]),
    featureYIntercept: pairText(yIntercept),
    featurePoint1: pairText(yIntercept),
    featurePoint2: pairText(second),
    tableRows: [-1, 0, 1, 2].map((k) => at(step.mul(k))).map(([x, y]) => ({ x: x.toFraction(), y: y.toFraction() })),
    graph1Points: [[Number(zero), 0], [0, Number(b)]],
    graph2Points: [yIntercept.map(Number), second.map(Number)],
    graph3Points: [anchor.map(Number), ahead(anchor)],
  };
  const pairSpellings = ([x, y]) => [`(${x.toFraction()},${y.toFraction()})`, `${x.toFraction()}, ${y.toFraction()}`, `\\left(${x.toFraction()},${y.toFraction()}\\right)`,
    `(${x.mul(2).toFraction()}/2, ${y.toFraction()})`, `( ${x.toFraction()} , ${y.toFraction()} )`];
  const alternates = {
    standardFormEquation: [board.standardFormEquation.replace(/\s/g, ''), `${coefficientText(B, 'y')} + ${coefficientText(A, 'x')} = ${C.toFraction()}`.replace('+ -', '- '),
      board.standardFormEquation.replace(/(\d)([xy])/g, '$1\\cdot $2')],
    slopeInterceptEquation: [board.slopeInterceptEquation.replace(/\s/g, ''), `y = ${coefficientText(m, 'x', latexFrac)}${plus(b)}`, `y = ${b.toFraction()} + ${coefficientText(m, 'x')}`.replace('+ -', '- '),
      `y = (${m.toFraction()})x${plus(b)}`, ...(decimalOf(m) ? [`y = ${decimalOf(m)}x${plus(b)}`] : [])],
    featureSlope: [latexFrac(m), `${m.s * m.n * 2n}/${m.d * 2n}`, ` ${m.toFraction()} `, ...(decimalOf(m) ? [decimalOf(m)] : []), ...(m.s > 0n ? [`+${m.toFraction()}`] : [])],
    featureXIntercept: pairSpellings([zero, new Fraction(0)]),
    featureYIntercept: pairSpellings(yIntercept),
  };
  // Point-slope through another point of the line, with Graph 3 starting there too.
  const pointSlopeWork = [yIntercept, at(step.neg()), at(step.mul(3))].flatMap((point) => [
    { pointSlopeEquation: pointSlope(point), graph3Points: [(given || point).map(Number), ahead(given || point)] },
    { pointSlopeEquation: pointSlope(point, latexFrac, '\\left(', '\\right)'), graph3Points: [(given || point).map(Number), ahead(given || point)] },
  ]);
  const otherWork = [
    { featurePoint1: board.featurePoint2, featurePoint2: board.featurePoint1 },
    { featurePoint1: pairText(at(step.mul(-2))), featurePoint2: pairText(at(step.mul(5))) },
    { tableRows: [...board.tableRows].reverse() },
    { tableRows: [3, -2, 5, 10].map((k) => at(step.mul(k))).map(([x, y]) => ({ x: x.toFraction(), y: y.toFraction() })) },
    { graph1Points: [...board.graph1Points].reverse() },
    { graph2Points: [yIntercept.map(Number), ahead(yIntercept, -1)] },
    { graph3Points: [anchor.map(Number), ahead(anchor, -1)] },
  ];
  return { board, alternates, pointSlopeWork, otherWork, wrongLine: { slopeInterceptEquation: `y = ${coefficientText(m, 'x')}${plus(b.add(1))}` } };
};
const lineOfPointSlope = (text) => {
  const [, y1, x1] = String(text).replace(/[−–]/g, '-').replace(/\s/g, '').match(/^y([+-]\d+)=.*\(x([+-]\d+)\)$/);
  return [frac(x1).neg(), frac(y1).neg()];
};

// The meanings, worked from the situation's own numbers: the rate, the start
// and when it runs out (start ÷ rate).
const contextKey = (question, { m, b }) => {
  const rate = m.neg().toFraction();
  const start = b.toFraction();
  const out = b.div(m.neg()).toFraction();
  const unit = question.source.prompt.match(/\d+ (\w+) (?:tall|of water)/)[1];
  const candle = /candle/.test(question.source.prompt);
  return {
    independentQuantity: candle ? 'time since the candle was lit (hours)' : undefined,
    dependentQuantity: candle ? `height of the candle (${unit})` : undefined,
    slopeMeaning: candle ? `The candle gets ${rate} ${unit} shorter every hour.` : `The tank loses ${rate} ${unit} of water every minute.`,
    yInterceptMeaning: candle ? `The candle is ${start} ${unit} tall when it is lit.` : `The tank holds ${start} ${unit} when it starts draining.`,
    xInterceptMeaning: candle ? `The candle is completely burned down after ${out} hours.` : undefined,
    domain: `0 ≤ x ≤ ${out}`,
  };
};
const CONTEXT_FIELDS = { independentQuantity: 'contextIndependent', dependentQuantity: 'contextDependent', slopeMeaning: 'contextSlopeMeaning',
  yInterceptMeaning: 'contextYInterceptMeaning', xInterceptMeaning: 'contextXInterceptMeaning', domain: 'contextDomain' };

test('multiple representations: every board grades the given line\'s representations right, in the spellings and with the points a student may choose, and a different line wrong', () => {
  const counts = { versions: 0, process: 0, spellings: 0, work: 0, choices: 0 };
  for (const file of [LMR_FINAL, LMR_FAMILY]) {
    for (const { id, question } of versionsOf(file).flat()) {
      if (question.type !== 'representationBridge') continue;
      counts.versions += 1;
      const process = question.interactionMode === 'process';
      if (process) counts.process += 1;
      const line = givenLine(question, id);
      const { board, alternates, pointSlopeWork, otherWork, wrongLine } = boardFor(question, line);
      // Process Mode establishes the key facts by a process, not by typing
      // them: the board carries the process that reaches this version's facts.
      const processLog = process ? { processLog: keyProcessLog(question) } : {};
      const context = {};
      if (question.context) {
        const key = contextKey(question, line);
        for (const [name, field] of Object.entries(CONTEXT_FIELDS)) {
          if (!question.context[name]) continue;
          assert.equal(question.context[name].value, key[name], `${id}: the ${name} key`);
          context[field] = key[name];
        }
      }
      const required = new Set(resolveRequiredCards(question));
      const grade = (overrides = {}) => gradeToolWork({ toolId: 'representationBridge', question, work: { ...board, ...context, ...processLog, ...overrides } });
      const key = grade();
      assert.equal(key.isCorrect, true, `${id}: ${JSON.stringify(key.parts?.filter((part) => !part.isCorrect).map((part) => part.id))}`);
      assert.equal(grade(wrongLine).isCorrect, !required.has('slopeIntercept'), `${id}: a parallel line`);
      for (const [field, spellings] of Object.entries(alternates)) {
        const card = { standardFormEquation: 'standardForm', slopeInterceptEquation: 'slopeIntercept', featureSlope: 'slope', featureXIntercept: 'xIntercept', featureYIntercept: 'yIntercept' }[field];
        // A typed fact is not read in Process Mode; the process establishes it.
        if (!required.has(card) || (process && field.startsWith('feature'))) continue;
        for (const spelling of spellings) {
          counts.spellings += 1;
          assert.equal(grade({ [field]: spelling }).isCorrect, true, `${id}.${field}: "${spelling}"`);
        }
      }
      for (const work of [...(required.has('pointSlope') ? pointSlopeWork : []), ...(process ? [] : otherWork)]) {
        if (Object.keys(work).some((field) => !required.has({ featurePoint1: 'twoPoints', featurePoint2: 'twoPoints', tableRows: 'table', graph1Points: 'graphIntercepts', graph2Points: 'graphSlopeIntercept', graph3Points: 'graphPointSlope', pointSlopeEquation: 'pointSlope' }[field]))) continue;
        counts.work += 1;
        assert.equal(grade(work).isCorrect, true, `${id}: ${JSON.stringify(work)}`);
      }
      for (const [name, field] of Object.entries(CONTEXT_FIELDS)) {
        for (const choice of question.context?.[name]?.choices || []) {
          counts.choices += 1;
          assert.equal(grade({ [field]: choice }).isCorrect, choice === context[field], `${id}.${field}: "${choice}"`);
        }
      }
    }
  }
  assert.equal(counts.versions, 6 + 6 * SEATS);
  console.log('kSweep representation boards', { ...counts, sampledSeatsPerFamily: SEATS });
});

/* ------------------------------------------------- the authoring sample -- */

const SAMPLE = compile('SAMPLE_AUTHORING_INTENT_V5.json');
const ARTIFACT = '__mathmasterWorkflowArtifact';
// A freehand stroke along y = f(x) for x in [x0, x1], in the workspace's
// viewBox units under the authored window (the screen mapping of
// InteractiveGraphWorkspace: padding inside a 760 × 540 box).
const sketchAlong = (view, f, x0, x1, samples = 60) => Array.from({ length: samples + 1 }, (_, i) => x0 + ((x1 - x0) * i) / samples)
  .map((x) => [x, f(x)])
  .filter(([, y]) => y >= view.yMin && y <= view.yMax)
  .map(([x, y]) => [
    GRAPH_WORKSPACE_VIEWBOX.padding + ((x - view.xMin) / (view.xMax - view.xMin)) * (GRAPH_WORKSPACE_VIEWBOX.width - 2 * GRAPH_WORKSPACE_VIEWBOX.padding),
    GRAPH_WORKSPACE_VIEWBOX.padding + ((view.yMax - y) / (view.yMax - view.yMin)) * (GRAPH_WORKSPACE_VIEWBOX.height - 2 * GRAPH_WORKSPACE_VIEWBOX.padding),
  ]);
const cameraOf = (view) => ({ xMin: view.xMin, xMax: view.xMax, yMin: view.yMin, yMax: view.yMax });

test('authoring sample: the relation, the refill model and the graph of f(x) = 2x + 1 on x ≥ 0 grade their worked answers and equivalent work right, and a wrong answer wrong', () => {
  let spellings = 0;
  // The relation {(−2, 3), (1, 2), (3, −1)}: three inputs, each with one output.
  const relation = SAMPLE[0];
  const pairs = [[-2, 3], [1, 2], [3, -1]];
  assert.deepEqual(relation.pairs.map(({ x, y }) => [x, y]), pairs);
  const relationWork = { arrows: pairs, plottedPoints: pairs, domainText: '-2, 1, 3', rangeText: '-1, 2, 3', isFunction: 'yes-definition' };
  const gradeRelation = (overrides) => gradeToolWork({ toolId: 'relationMapping', question: relation, work: { ...relationWork, ...overrides } });
  assert.equal(gradeRelation({}).isCorrect, true, 'the relation');
  for (const overrides of [{ arrows: [...pairs].reverse() }, { domainText: '3, 1, -2' }, { domainText: '-2,1,3' }, { rangeText: '3; 2; -1' }]) {
    spellings += 1;
    assert.equal(gradeRelation(overrides).isCorrect, true, `the relation: ${JSON.stringify(overrides)}`);
  }
  assert.equal(gradeRelation({ isFunction: 'no-input-repeat' }).isCorrect, false, 'the relation: not a function');
  assert.equal(gradeRelation({ rangeText: '-1, 2' }).isCorrect, false, 'the relation: a missing output');

  // The refill station: 5 liters a minute from empty, so W(t) = 5t, time ≥ 0, water ≥ 0, continuous.
  const model = SAMPLE[1];
  assert.match(model.scenario, /adds 5 liters of water per minute to an empty container/);
  const { composed } = resolveComposedWorkflow(model);
  const rule = (t) => 5 * t;
  const responses = { quantities: { independent: 'time', dependent: 'water' }, equation: 'W(t)=5t', continuity: 'continuous', domainContinuous: 't>=0', rangeContinuous: 'W>=0' };
  const tableStage = composed.workflow.find((stage) => stage.kind === 'tableInput');
  responses.table = workflowTableArtifact({ stage: tableStage, cells: Object.fromEntries(tableStage.xValues.map((x, row) => [`${row}:y`, String(rule(x))])), isComplete: true, sourceModel: responses.equation, content: composed.content });
  const [[graphStageId, resolution]] = [...resolveWorkflowGraphStages({ workflow: composed.workflow, content: composed.content, grading: composed.grading, responses })];
  assert.equal(resolution.status, 'ready', 'the graph step opens');
  const stageModel = graphWorkspaceModelFor(resolution.question, {});
  // Time starts at 0: the plotted table points, and the line drawn from t = 0 only.
  const graphWork = (f, from = 0) => ({ [ARTIFACT]: 'graph', isComplete: true, analysis: {}, construction: {
    placements: Object.fromEntries(stageModel.tasks.map((task) => [task.id, [Number(task.x), f(Number(task.x))]])), pointsLocked: true,
    strokes: [sketchAlong(stageModel.viewWindow, f, from, 5)], sketchView: cameraOf(stageModel.viewWindow), sketchLocked: true } });
  responses[graphStageId] = graphWork(rule);
  const gradeModel = (overrides) => gradeComposedWorkflowWork(model, { responses: { ...responses, ...overrides } });
  const key = gradeModel({});
  assert.equal(key.isCorrect, true, `the refill model: ${JSON.stringify(key.parts?.filter((part) => !part.isCorrect).map((part) => part.id))}`);
  const alternates = {
    equation: ['W(t) = 5t', 'W(t)=5\\cdot t', 'W(t)=5*t', 'W(t)=t*5', 'W = 5t', 'y = 5x'],
    domainContinuous: ['t ≥ 0', 't \\ge 0', '0 <= t', '0 ≤ t', 'x >= 0'],
    rangeContinuous: ['W ≥ 0', 'W\\ge 0', '0 <= W', 'W(t) >= 0', 'y >= 0'],
  };
  for (const [stageId, list] of Object.entries(alternates)) {
    for (const spelling of list) {
      spellings += 1;
      assert.equal(gradeModel({ [stageId]: spelling }).isCorrect, true, `the refill model.${stageId}: "${spelling}"`);
    }
  }
  assert.equal(gradeModel({ [graphStageId]: graphWork(rule, -1.5) }).isCorrect, true, 'the refill model: the line drawn across the window');
  for (const [what, overrides] of [['roles swapped', { quantities: { independent: 'water', dependent: 'time' } }], ['4 liters a minute', { equation: 'W(t)=4t' }],
    ['discrete', { continuity: 'discrete' }], ['t > 0', { domainContinuous: 't > 0' }], ['W > 0', { rangeContinuous: 'W > 0' }],
    ['the graph of 4t', { [graphStageId]: graphWork((t) => 4 * t) }], ['the graph of 5t + 3', { [graphStageId]: { ...graphWork((t) => 5 * t + 3), isCorrect: true } }]]) {
    assert.equal(gradeModel(overrides).isCorrect, false, `the refill model: ${what}`);
  }

  // f(x) = 2x + 1 for x ≥ 0: the student picks the x-values; a closed dot at
  // (0, 1) and an arrow where the line leaves the window.
  const graph = SAMPLE[2];
  const f = (x) => 2 * x + 1;
  const graphModel = graphWorkspaceModelFor(graph, {});
  const [start, end] = graphModel.endpointRequirements;
  assert.deepEqual([start.marker, start.point, end.marker], ['closed', [0, 1], 'arrow']);
  assert.ok(Math.abs(f(end.point[0]) - end.point[1]) < 1e-2 && end.point[0] > 0, 'the arrow end is on the line, to the right');
  const studentPoints = graphModel.tasks.filter((task) => task.studentChoosesX).map((task) => task.id);
  const constructionFor = (xs, overrides = {}) => ({
    chosenXValues: Object.fromEntries(studentPoints.map((id, i) => [id, String(xs[i])])),
    placements: { ...Object.fromEntries(studentPoints.map((id, i) => [id, [xs[i], f(xs[i])]])), 'point-key': [0, f(0)] },
    pointsLocked: true, strokes: [sketchAlong(graphModel.viewWindow, f, 0, 5)], sketchView: cameraOf(graphModel.viewWindow), sketchLocked: true,
    markerPlacements: { [start.id]: { marker: 'closed', point: [0, 1] }, [end.id]: { marker: 'arrow', point: end.point } },
    ...overrides,
  });
  const gradeGraph = (construction) => gradeToolWork({ toolId: 'functionGraph', question: graph, work: { construction, analysis: {} } });
  for (const xs of [[1, 2, 3, 4], [0.5, 1.5, 2.5, 4.5], [4, 3, 2, 1]]) {
    spellings += 1;
    const result = gradeGraph(constructionFor(xs));
    assert.equal(result.isCorrect, true, `f(x) = 2x + 1 at x = ${xs}: ${JSON.stringify(result.parts?.filter((part) => !part.isCorrect).map((part) => part.id))}`);
  }
  for (const [what, construction] of [['an x outside the domain', constructionFor([-1, 2, 3, 4])],
    ['an open dot at (0, 1)', constructionFor([1, 2, 3, 4], { markerPlacements: { [start.id]: { marker: 'open', point: [0, 1] }, [end.id]: { marker: 'arrow', point: end.point } } })],
    ['a point off the line', { ...constructionFor([1, 2, 3, 4]), placements: { ...constructionFor([1, 2, 3, 4]).placements, [studentPoints[0]]: [1, 4] } }],
    ['the line y = x + 1', constructionFor([1, 2, 3, 4], { strokes: [sketchAlong(graphModel.viewWindow, (x) => x + 1, 0, 9)] })]]) {
    assert.equal(gradeGraph(construction).isCorrect, false, `f(x) = 2x + 1: ${what}`);
  }
  console.log('kSweep authoring sample', { items: SAMPLE.length, spellings });
});

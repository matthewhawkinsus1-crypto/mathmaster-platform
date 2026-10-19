/*
 * HOW A STUDENT ANSWERS EACH CERTIFIED RICH TOOL — FROM WHAT THEY CAN SEE.
 *
 * The secure certification (the platform matrix and the emulator suite) must
 * never read an answer key: a fixture that needed `privateGrading` to answer
 * would prove the wrong thing. Every builder here reads only the PUBLIC tool
 * payload a browser receives and produces the raw work the tool itself submits
 * — the plotted points, the constructed boundary, the final equation — exactly
 * as a student working the item would.
 *
 * `answer` is right; `wrong` is a plausible wrong answer of the same shape.
 * Shared by tests/platform/secureRichToolMatrix.test.mjs and
 * tests/integration/testCycleRichToolCertification.test.mjs. TEST-ONLY.
 */
import { evaluate } from 'mathjs';

import { pathCorrelation, pathCorrelationDescriptor } from '../../functions/shared/pathDataModelingGrading.mjs';
import { correctFunctionChoice } from '../../functions/shared/relationFunctionChoice.mjs';
import { regressionCalculatorStats } from '../../functions/shared/pathRegressionCalculatorGrading.mjs';

// Solve a linear relation in x by checking candidates — from the public text only.
const latexToMath = (text) => String(text)
  .replace(/\\le(q)?/g, '<=').replace(/\\ge(q)?/g, '>=')
  .replace(/\\cdot/g, '*').replace(/\$/g, '')
  .replace(/(\d)\s*x/g, '$1*x').replace(/-\s*x/g, '-1*x');
const sides = (text, operator) => text.split(operator).map((side) => side.trim());

export const solveLinearEquation = (equation) => {
  const [left, right] = sides(latexToMath(equation), '=');
  for (let x = -60; x <= 60; x += 0.5) {
    if (Math.abs(evaluate(left, { x }) - evaluate(right, { x })) < 1e-9) return x;
  }
  throw new Error(`no solution found for ${equation}`);
};

export const solveLinearInequality = (inequality) => {
  const text = latexToMath(inequality);
  const operator = ['<=', '>=', '<', '>'].find((candidate) => text.includes(candidate));
  const [left, right] = sides(text, operator);
  const boundary = solveLinearEquation(`${left} = ${right}`);
  const holds = (x) => evaluate(`(${left}) ${operator} (${right})`, { x });
  const closed = holds(boundary);
  return holds(boundary - 1)
    ? { min: null, max: boundary, minClosed: false, maxClosed: closed }
    : { min: boundary, max: null, minClosed: closed, maxClosed: false };
};

const promptMath = (prompt) => (/\$([^$]+)\$/.exec(prompt) || [])[1];

export const RICH_TOOL_ANSWERS = Object.freeze({
  graphing2: {
    answer: ({ tool }) => ({ points: [[tool.value, 0], [tool.value, 2]] }),
    wrong: ({ tool }) => ({ points: [[tool.value + 1, 0], [tool.value + 1, 2]] }),
  },
  functionInvestigation: {
    answer: ({ tool }) => {
      const { m, b } = tool.functionSpec;
      return {
        placements: Object.fromEntries(tool.pointTasks.map((task) => [task.id, [task.x, m * task.x + b]])),
        markerPlacements: {},
        answers: Object.fromEntries(tool.analysisRequests.map((part) => [part.id, String(m)])),
        selections: {},
      };
    },
    wrong: ({ tool }) => ({
      placements: Object.fromEntries(tool.pointTasks.map((task) => [task.id, [task.x, 99]])),
      markerPlacements: {},
      answers: Object.fromEntries(tool.analysisRequests.map((part) => [part.id, '42'])),
      selections: {},
    }),
  },
  systemsWorkspace: {
    answer: ({ tool }) => ({
      construction: tool.inequalities.map(({ m, b, relation }) => ({
        points: [{ x: 0, y: b }, { x: 2, y: 2 * m + b }],
        boundaryStyle: relation.includes('=') ? 'solid' : 'dashed',
        shade: relation.startsWith('>') ? 'above' : 'below',
      })),
    }),
    wrong: ({ tool }) => ({
      construction: tool.inequalities.map(({ m, b, relation }) => ({
        points: [{ x: 0, y: b }, { x: 2, y: 2 * m + b }],
        boundaryStyle: relation.includes('=') ? 'solid' : 'dashed',
        shade: relation.startsWith('>') ? 'below' : 'above',
      })),
    }),
  },
  dataModelingLab: {
    // "Use statistical technology": the lab computes r from the visible data.
    answer: ({ tool }) => {
      const r = pathCorrelation(tool.points);
      const { direction, strength } = pathCorrelationDescriptor(r);
      return { r: Number(r.toFixed(3)), direction, strength };
    },
    wrong: () => ({ r: -0.2, direction: 'negative', strength: 'weak' }),
  },
  stepAlgebra: {
    answer: ({ tool }) => ({ finalEquation: `x = ${solveLinearEquation(tool.equation)}` }),
    wrong: ({ tool }) => ({ finalEquation: `x = ${solveLinearEquation(tool.equation) + 1}` }),
  },
  intervalNumberLine: {
    answer: ({ tool }) => ({ intervals: [solveLinearInequality(promptMath(tool.prompt))], notation: '' }),
    wrong: ({ tool }) => {
      const right = solveLinearInequality(promptMath(tool.prompt));
      return { intervals: [{ ...right, minClosed: !right.minClosed, maxClosed: !right.maxClosed }], notation: '' };
    },
  },
  relationMapping: {
    answer: ({ tool }) => {
      const xs = [...new Set(tool.pairs.map((pair) => pair.x))];
      return {
        arrows: tool.pairs.map((pair) => [pair.x, pair.y]),
        domain: xs,
        range: [...new Set(tool.pairs.map((pair) => pair.y))],
        isFunction: correctFunctionChoice(xs.length === tool.pairs.length),
      };
    },
    wrong: ({ tool }) => ({
      arrows: tool.pairs.map((pair) => [pair.y, pair.x]),
      domain: tool.pairs.map((pair) => pair.y),
      range: tool.pairs.map((pair) => pair.x),
      isFunction: correctFunctionChoice(false),
    }),
  },
  system: {
    answer: () => ({ x: 1, y: 2, value: '(1, 2)' }),
    wrong: () => ({ x: 2, y: 1, value: '(2, 1)' }),
  },
  multiAnswer: {
    answer: () => ({ responses: { slope: '3', intercept: '-4' } }),
    wrong: () => ({ responses: { slope: '-4', intercept: '3' } }),
  },
  regressionCalculator: {
    // The data is the question; running the regression on it is the process
    // the item assesses, and the calculator does that for the student.
    answer: ({ tool }) => {
      const stats = regressionCalculatorStats(tool.sourceData);
      return {
        table: tool.sourceData,
        regressionRun: { operation: 'linearRegression', table: tool.sourceData, m: stats.m, b: stats.b, r: stats.r },
        interpretation: { direction: stats.r > 0 ? 'positive' : 'negative', strength: Math.abs(stats.r) >= 0.8 ? 'strong' : 'moderate' },
      };
    },
    wrong: ({ tool }) => ({
      table: tool.sourceData,
      regressionRun: { operation: 'linearRegression', table: tool.sourceData, m: 0, b: 0, r: 0 },
      interpretation: { direction: 'negative', strength: 'weak' },
    }),
  },
  algebra: {
    answer: ({ tool }) => ({ finalEquation: `x = ${solveLinearEquation(tool.equationLatex)}` }),
    wrong: () => ({ finalEquation: 'x = 4' }),
  },
});

/** One real bank family per certified tool that the bank uses. */
export const BANK_FAMILY_BY_TOOL = Object.freeze({
  graphing2: 'mm_A_2G_v2_vertical-graph',
  functionInvestigation: 'mm_A_3A_v2_graph-slope',
  systemsWorkspace: 'mm_A_3D_v2_graph-solid-above',
  dataModelingLab: 'mm_A_4A_v2_correlation-positive-noisy',
  stepAlgebra: 'mm_A_5A_v2_balance-workspace',
  intervalNumberLine: 'mm_A_5B_v2_negative-coefficient-number-line',
  relationMapping: 'mm_A_2A_v2_discrete-mapping-domain-range',
});

/** Authored items for certified tools no bank family uses yet. */
export const AUTHORED_RICH_ITEMS = Object.freeze({
  system: { id: 'matrix-system', type: 'system', prompt: 'Solve the system.', equations: ['y = x + 1', 'y = -x + 3'], answer: '(1, 2)' },
  multiAnswer: { id: 'matrix-multi', type: 'multiAnswer', prompt: 'Find the slope and the y-intercept of y = 3x - 4.', answerFields: [{ id: 'slope', label: 'Slope', expected: '3' }, { id: 'intercept', label: 'y-intercept', expected: '-4' }] },
  regressionCalculator: { id: 'matrix-regression', type: 'regressionCalculator', prompt: 'Enter the data, run linear regression, and interpret r.', sourceMode: 'data', sourceData: [[1, 2], [2, 4.1], [3, 5.9], [4, 8.2], [5, 9.8]] },
  algebra: { id: 'matrix-algebra', type: 'algebra', prompt: 'Solve 4x - 3 = 9.', equationLatex: '4x - 3 = 9', variable: 'x', answer: 3 },
});

/** The seeded Path bank, read the way the server's fallback reads it. */
export const loadBankFamilies = async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const dir = new URL('../../functions/seeds/pathQuestionBank/', import.meta.url);
  return readdirSync(dir)
    .filter((name) => name.endsWith('_seed.json'))
    .flatMap((name) => JSON.parse(readFileSync(new URL(name, dir), 'utf8')).documents || []);
};

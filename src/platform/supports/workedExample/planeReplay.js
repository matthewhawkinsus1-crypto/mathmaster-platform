/*
 * THE PLANE AND INEQUALITY REPLAY (WE-E; docs/platform/WORKED_EXAMPLES.md
 * sections 4 and 9).
 *
 * A worked example for a question the student answers ON THE PLANE plays as
 * what their own tool records, one move per slide:
 *
 *   constructLine          (Graphing, y = mx + b): plot the y-intercept, rise
 *                          and run to a second point, the line, a check;
 *   graphSystem            (Systems Workspace, two lines to draw): each line
 *                          the same way, where they cross (or why they never
 *                          do, or why they are one line), the check in both
 *                          equations;
 *   solveInequalitySystem  (the inequality builder): for each inequality the
 *                          y-intercept, rise and run, the boundary line SOLID
 *                          or DASHED, a test point, the shading; for a system,
 *                          the overlap and a point checked in every inequality.
 *                          An inequality given in standard form is solved for
 *                          y first, on a slide of its own.
 *
 * THE EXAMPLE DRAWS WHAT THE STUDENT'S TOOL RECORDS. Each replay builds the
 * record the tool itself would hold for a sibling question (the plotted
 * points, the style, the shading point, the classification, the test point's
 * answers) and hands it to that tool's own grader, the one the browser, the
 * question and the server run:
 *
 *   graphing2 grader            (serverGrading/tools/graphing2.mjs)
 *   systemsWorkspace grader     (serverGrading/tools/systemsWorkspace.mjs)
 *
 * A record the grader does not mark correct is REFUSED: replayPlaneExample
 * returns { ok: false, error } and nothing is played. What a slide draws is
 * the engine's too: the line through two plotted points (lineFromPoints,
 * studentBoundaryLineFromEntry), the crossing point (solveTwoLines), a test
 * point's verdict (satisfiesBoundary) and the shaded region
 * (feasibleRegionPolygon).
 *
 * A step carries `board.plane`, the picture, and `board.lines`, the same move
 * in words and numbers (so nothing rests on the picture alone).
 */
import { lineFromPoints, linesEquivalent } from '../../../../functions/shared/toolMath/graphing2/graphingMath.mjs';
import { solveTwoLines } from '../../../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  boundaryFromSlopeIntercept,
  boundaryLinesMatch,
  feasibleRegionPolygon,
  satisfiesBoundary,
  studentBoundaryLineFromEntry,
  studentBuildInequalityEnabled,
} from '../../../../functions/shared/toolMath/systemsWorkspace/inequalityBuilderAdapter.mjs';
import graphing2Grader from '../../../../functions/shared/serverGrading/tools/graphing2.mjs';
import systemsWorkspaceGrader from '../../../../functions/shared/serverGrading/tools/systemsWorkspace.mjs';

export const PLANE_REPLAY_TOOL = Object.freeze({ LINE: 'constructLine', SYSTEM: 'graphSystem', INEQUALITY: 'solveInequalitySystem' });
export const PLANE_BOUNDS = Object.freeze({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
export const PLANE_BOARD = Object.freeze({ MOVE: 'move', CHECK: 'check' });
/** The least area, in square units of the −10 to 10 plane, a system's overlap is shaded with. */
export const OVERLAP_MIN_AREA = 4;
/** A polygon's area (the shoelace formula), its corners in order. */
export const polygonArea = (points) => Math.abs(points.reduce((sum, [x, y], index) => {
  const [nx, ny] = points[(index + 1) % points.length];
  return sum + x * ny - nx * y;
}, 0)) / 2;

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const lower = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
const refused = (error) => ({ ok: false, error });
const EPS = 1e-9;
const near = (a, b) => Math.abs(a - b) <= 1e-6;

/* ------------------------------------------------------------------ slopes */

// Tried in this order: a slope of 1 is the plainest, so it comes last among the whole ones.
const SLOPES = Object.freeze([[2, 1], [3, 1], [1, 1], [1, 2], [3, 2], [1, 3], [2, 3]]);
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
/** A slope as rise over run in lowest terms (run > 0), or null where it is not a small fraction. */
export const riseAndRun = (m) => {
  const value = Number(m);
  if (!Number.isFinite(value) || Math.abs(value) < EPS) return null;
  for (let run = 1; run <= 6; run += 1) {
    const rise = value * run;
    if (Math.abs(rise - Math.round(rise)) < 1e-6) {
      const divisor = gcd(Math.round(rise), run) || 1;
      return { rise: Math.round(rise) / divisor, run: run / divisor };
    }
  }
  return null;
};

const numberLatex = (value) => (value < 0 ? `-${Math.abs(value)}` : String(value));
const fractionLatex = (rise, run) => (run === 1 ? numberLatex(rise) : `${rise < 0 ? '-' : ''}\\frac{${Math.abs(rise)}}{${run}}`);
const slopeTermLatex = (rise, run, variable = 'x') => {
  if (run === 1 && Math.abs(rise) === 1) return `${rise < 0 ? '-' : ''}${variable}`;
  return `${fractionLatex(rise, run)}${variable}`;
};
const lineRightLatex = ({ rise, run, b }) => `${slopeTermLatex(rise, run)}${b === 0 ? '' : b < 0 ? ` - ${Math.abs(b)}` : ` + ${b}`}`;
const RELATION_LATEX = Object.freeze({ '<': '<', '<=': '\\le', '>': '>', '>=': '\\ge' });
const FLIP = Object.freeze({ '<': '>', '<=': '>=', '>': '<', '>=': '<=' });
const pointLatex = ([x, y]) => `(${numberLatex(x)}, ${numberLatex(y)})`;
const valueOf = (line, x) => (line.rise / line.run) * x + line.b;
const whole = (value) => Math.abs(value - Math.round(value)) < 1e-6;

const lineOf = (rise, run, b) => ({ rise, run, b, m: rise / run });
const inBounds = ([x, y]) => x >= PLANE_BOUNDS.xMin && x <= PLANE_BOUNDS.xMax && y >= PLANE_BOUNDS.yMin && y <= PLANE_BOUNDS.yMax;
const secondPointOf = (line) => [line.run, line.b + line.rise];

/* ------------------------------------------------------------ the pictures */

const line = (id, name, latex, result = false) => ({ id, name, latex, ...(result ? { result: true } : {}) });
// A step: a sentence, a why, the picture so far and the same move in words.
const stepOf = ({ op, label, why, show, lines, plane, kind = PLANE_BOARD.MOVE }) => ({
  show,
  why,
  board: { kind, operation: op, label, lines, plane: { bounds: PLANE_BOUNDS, points: [], arrows: [], lines: [], regions: [], ...plane } },
});

export const PLANE_WHY = Object.freeze({
  intercept: 'The number added to the x-term is where the line crosses the y-axis: the value of y when x is 0.',
  slope: 'The slope is rise over run: how far up or down the line goes for each step to the right.',
  line: 'Two points fix one straight line.',
  check: 'A point is on the line when its coordinates make the equation true.',
  cross: 'The solution of a system is the point that is on both lines.',
  parallel: 'Lines with the same slope and different y-intercepts never meet.',
  same: 'The same slope and the same y-intercept give the same line: every point of it is a solution.',
  rewrite: 'Get y alone so the slope and the y-intercept can be read. Dividing or multiplying by a negative number turns the inequality sign around.',
  solid: 'The sign includes "or equal to", so points on the line are solutions: the line is solid.',
  dashed: 'The sign does not include "equal to", so points on the line are not solutions: the line is dashed.',
  test: 'A point not on the line is on one side of it. If it makes the inequality true, its whole side does.',
  shadeTrue: 'The test point makes the inequality true, so its side of the line is the solution.',
  shadeFalse: 'The test point makes the inequality false, so the other side of the line is the solution.',
  overlap: 'A solution of the system has to make every inequality true: it is in every shaded side at once.',
  member: 'A point is a solution of the system only if it makes every inequality true.',
});

// The three moves that draw y = mx + b from its intercept and its slope.
const drawLineSteps = ({ target, name, equationLatex, before, style = 'solid', styleWhy = '', index = '', given = 'The equation' }) => {
  const first = [0, target.b];
  const second = secondPointOf(target);
  const drawn = [...before.lines];
  const points = [...before.points];
  const base = { regions: before.regions };
  const up = target.rise > 0 ? `up $${target.rise}$` : `down $${Math.abs(target.rise)}$`;
  const steps = [];
  steps.push(stepOf({
    op: 'plotIntercept',
    label: `${name}: plot the y-intercept`,
    why: PLANE_WHY.intercept,
    show: `${name}, $${equationLatex}$: the y-intercept is $${numberLatex(target.b)}$. Plot $${pointLatex(first)}$.`,
    lines: [line('before', given, equationLatex), line('after', 'Plotted', pointLatex(first), true)],
    plane: { ...base, lines: drawn, points: [...points, { x: first[0], y: first[1], label: pointLatex(first), mark: `p${index}1` }] },
  }));
  steps.push(stepOf({
    op: 'riseAndRun',
    label: `${name}: use the slope to plot a second point`,
    why: PLANE_WHY.slope,
    show: `The slope is $${fractionLatex(target.rise, target.run)}$: from $${pointLatex(first)}$ go ${up} and right $${target.run}$. Plot $${pointLatex(second)}$.`,
    lines: [
      line('before', 'Start at', pointLatex(first)),
      line('applied', 'Rise and run', `\\text{rise } ${numberLatex(target.rise)},\\ \\text{run } ${target.run}`),
      line('after', 'Plotted', pointLatex(second), true),
    ],
    plane: {
      ...base,
      lines: drawn,
      points: [...points, { x: first[0], y: first[1], label: pointLatex(first), mark: `p${index}1` }, { x: second[0], y: second[1], label: pointLatex(second), mark: `p${index}2` }],
      arrows: [{ from: first, to: [first[0], second[1]] }, { from: [first[0], second[1]], to: second }],
    },
  }));
  const through = lineFromPoints(first, second);
  if (!through || !linesEquivalent(through, { kind: 'slopeIntercept', m: target.m, b: target.b })) throw new Error('the two plotted points do not give the line');
  steps.push(stepOf({
    op: style === 'dashed' ? 'drawDashed' : 'drawLine',
    label: `${name}: draw the ${styleWhy ? `${style} ` : ''}line through the two points`,
    why: styleWhy || PLANE_WHY.line,
    show: `Draw the ${styleWhy ? `${style} ` : ''}line through $${pointLatex(first)}$ and $${pointLatex(second)}$.`,
    lines: [
      line('before', 'Through', `${pointLatex(first)} \\text{ and } ${pointLatex(second)}`),
      line('after', styleWhy ? `The line, ${style}` : 'The line', `y = ${lineRightLatex(target)}`, true),
    ],
    plane: {
      ...base,
      lines: [...drawn, { m: target.m, b: target.b, style, mark: `l${index}` }],
      points: [...points, { x: first[0], y: first[1], label: pointLatex(first), mark: `p${index}1` }, { x: second[0], y: second[1], label: pointLatex(second), mark: `p${index}2` }],
    },
  }));
  return { steps, first, second, after: { lines: [...drawn, { m: target.m, b: target.b, style, mark: `l${index}` }], points, regions: before.regions } };
};

const substitutionLatex = (target, x) => `${target.run === 1 && Math.abs(target.rise) === 1 ? (target.rise < 0 ? '-' : '') : fractionLatex(target.rise, target.run)}(${numberLatex(x)})${target.b === 0 ? '' : target.b < 0 ? ` - ${Math.abs(target.b)}` : ` + ${target.b}`}`;
const graded = (grader, question, work) => {
  let result;
  try {
    result = grader.grade(question, work);
  } catch {
    return false;
  }
  return result?.isCorrect === true;
};

/* ----------------------------------------------------------- constructLine */

const lineReplay = (question) => {
  const frame = riseAndRun(question?.line?.m);
  const b = Number(question?.line?.b);
  if (!frame || !Number.isInteger(b)) return refused('its line is not y = mx + b with a slope that is a small fraction and a whole-number y-intercept.');
  const target = lineOf(frame.rise, frame.run, b);
  if (!inBounds([0, b]) || !inBounds(secondPointOf(target))) return refused('its two points are off the plane.');
  const equationLatex = `y = ${lineRightLatex(target)}`;
  const drawn = drawLineSteps({ target, name: 'The line', equationLatex, before: { lines: [], points: [], regions: [] } });
  // What the Graphing tool records: the plotted points, in the order they were plotted.
  const work = { points: [drawn.first, drawn.second] };
  if (!graded(graphing2Grader, question, work)) return refused('the Graphing tool does not mark its two points as the line.');
  const [x, y] = drawn.second;
  const check = stepOf({
    op: 'check',
    kind: PLANE_BOARD.CHECK,
    label: `Check $${pointLatex(drawn.second)}$ in the equation`,
    why: PLANE_WHY.check,
    show: `Check: put $x = ${numberLatex(x)}$ into $${equationLatex}$. It gives $y = ${numberLatex(y)}$, so $${pointLatex(drawn.second)}$ is on the line.`,
    lines: [
      line('before', 'The equation', equationLatex),
      line('applied', 'With the value put in', `y = ${substitutionLatex(target, x)}`),
      line('after', 'The point is on the line', `y = ${numberLatex(y)}`, true),
    ],
    plane: { ...drawn.after, points: [{ x: 0, y: b, label: pointLatex(drawn.first) }, { x, y, label: pointLatex(drawn.second) }] },
  });
  return {
    ok: true,
    tool: PLANE_REPLAY_TOOL.LINE,
    prompt: `Graph $${equationLatex}$. Start at the y-intercept, then use the slope.`,
    steps: [...drawn.steps, check],
    answer: `The line $${equationLatex}$, through $${pointLatex(drawn.first)}$ and $${pointLatex(drawn.second)}$.`,
    record: work,
    fadeLimit: 2,
  };
};

/* ------------------------------------------------------------- graphSystem */

const SOLUTION_WORDS = Object.freeze({ one: 'Exactly one solution', none: 'No solution', infinite: 'Infinitely many solutions' });

const systemReplay = (question) => {
  const system = question?.system;
  const frames = [[system?.m1, system?.b1], [system?.m2, system?.b2]].map(([m, b]) => ({ frame: riseAndRun(m), b: Number(b) }));
  if (frames.some(({ frame, b }) => !frame || !Number.isInteger(b))) return refused('its lines are not y = mx + b with small-fraction slopes and whole-number y-intercepts.');
  const targets = frames.map(({ frame, b }) => lineOf(frame.rise, frame.run, b));
  if (targets.some((target) => !inBounds([0, target.b]) || !inBounds(secondPointOf(target)))) return refused('a plotted point is off the plane.');
  const equations = targets.map((target) => `y = ${lineRightLatex(target)}`);
  const steps = [];
  let picture = { lines: [], points: [], regions: [] };
  const construction = [];
  targets.forEach((target, index) => {
    const drawn = drawLineSteps({ target, name: `Equation ${index + 1}`, equationLatex: equations[index], before: picture, index: String(index + 1) });
    steps.push(...drawn.steps);
    picture = drawn.after;
    construction.push({ points: [{ x: drawn.first[0], y: drawn.first[1] }, { x: drawn.second[0], y: drawn.second[1] }] });
  });
  const solution = solveTwoLines(system);
  // One line written twice is not a system a student is given to graph: such an item keeps its family's example.
  if (solution.type === 'infinite') return refused('its two equations are the same line.');
  const work = { construction, classification: solution.type, ...(solution.type === 'one' ? { x: String(solution.x), y: String(solution.y) } : {}) };
  if (!graded(systemsWorkspaceGrader, question, work)) return refused('the Systems Workspace does not mark its record correct.');
  let answer;
  if (solution.type === 'one') {
    if (!whole(solution.x) || !whole(solution.y) || !inBounds([solution.x, solution.y])) return refused('its lines do not cross at a grid point on the plane.');
    const at = [Math.round(solution.x), Math.round(solution.y)];
    steps.push(stepOf({
      op: 'intersection',
      label: 'Find where the lines cross',
      why: PLANE_WHY.cross,
      show: `The slopes are different, so the lines cross at a single point: $${pointLatex(at)}$.`,
      lines: [line('before', 'The lines', `${equations[0]} \\text{ and } ${equations[1]}`), line('after', 'They cross at', pointLatex(at), true)],
      plane: { ...picture, points: [{ x: at[0], y: at[1], label: pointLatex(at), mark: 'cross' }] },
    }));
    steps.push(stepOf({
      op: 'check',
      kind: PLANE_BOARD.CHECK,
      label: `Check $${pointLatex(at)}$ in both equations`,
      why: PLANE_WHY.check,
      show: `Check: put $x = ${numberLatex(at[0])}$ into each equation. Both give $y = ${numberLatex(at[1])}$, so $${pointLatex(at)}$ is the solution.`,
      lines: [
        ...targets.map((target, index) => line(`equation-${index + 1}`, `Equation ${index + 1}`, `y = ${substitutionLatex(target, at[0])} = ${numberLatex(Math.round(valueOf(target, at[0])))}`)),
        line('after', 'Both equations are true at', pointLatex(at), true),
      ],
      plane: { ...picture, points: [{ x: at[0], y: at[1], label: pointLatex(at), mark: 'cross' }] },
    }));
    if (!targets.every((target) => near(valueOf(target, at[0]), at[1]))) return refused('its crossing point does not check in both equations.');
    // The crossing point only: how many solutions the student's own system has is theirs to decide.
    answer = `$${pointLatex(at)}$`;
  } else {
    const none = solution.type === 'none';
    steps.push(stepOf({
      op: 'classify',
      label: none ? 'Compare the slopes and the y-intercepts' : 'Compare the two lines',
      why: none ? PLANE_WHY.parallel : PLANE_WHY.same,
      show: none
        ? `Both lines have slope $${fractionLatex(targets[0].rise, targets[0].run)}$, and their y-intercepts are different ($${numberLatex(targets[0].b)}$ and $${numberLatex(targets[1].b)}$). They are parallel and never cross: no solution.`
        : `Both equations have slope $${fractionLatex(targets[0].rise, targets[0].run)}$ and y-intercept $${numberLatex(targets[0].b)}$. They are the same line: infinitely many solutions.`,
      lines: [
        line('before', 'The slopes', `${fractionLatex(targets[0].rise, targets[0].run)} \\text{ and } ${fractionLatex(targets[1].rise, targets[1].run)}`),
        line('applied', 'The y-intercepts', `${numberLatex(targets[0].b)} \\text{ and } ${numberLatex(targets[1].b)}`),
        line('after', 'Number of solutions', none ? '\\text{none: the lines are parallel}' : '\\text{infinitely many: one line}', true),
      ],
      plane: picture,
    }));
    answer = `${SOLUTION_WORDS[solution.type]}.`;
  }
  return {
    ok: true,
    tool: PLANE_REPLAY_TOOL.SYSTEM,
    prompt: `Graph the system $${equations[0]}$ and $${equations[1]}$, and find where the lines cross.`,
    steps,
    answer,
    record: work,
    fadeLimit: 3,
  };
};

/* --------------------------------------------------- solveInequalitySystem */

// The source a constraint is given in: y alone, or standard form to solve for y first.
const standardFormOf = (constraint) => {
  const source = constraint?.source;
  if (!isObject(source)) return null;
  const { A, B, C, relation } = source;
  if (![A, B, C].every(Number.isInteger) || !B || !RELATION_LATEX[relation]) return null;
  const term = (coefficient, variable, lead) => {
    if (!coefficient) return '';
    const size = Math.abs(coefficient) === 1 ? '' : Math.abs(coefficient);
    return `${coefficient < 0 ? (lead ? '-' : ' - ') : (lead ? '' : ' + ')}${size}${variable}`;
  };
  return { A, B, C, relation, latex: `${term(A, 'x', true)}${term(B, 'y', !A)} ${RELATION_LATEX[relation]} ${numberLatex(C)}` };
};
const sameHalfPlane = (standard, boundary) => {
  const holds = { '<': (v) => v < -EPS, '<=': (v) => v <= EPS, '>': (v) => v > EPS, '>=': (v) => v >= -EPS }[standard.relation];
  for (let x = -6; x <= 6; x += 3) {
    for (let y = -7; y <= 7; y += 2) {
      const value = standard.A * x + standard.B * y - standard.C;
      if (Math.abs(value) < 1e-6) continue;
      if (holds(value) !== satisfiesBoundary(boundary, x, y)) return false;
    }
  }
  return true;
};

const inequalityReplay = (question) => {
  const constraints = list(question?.expectedConstraints);
  if (!constraints.length || constraints.length > 2) return refused('it has no inequality, or more than two.');
  if (!studentBuildInequalityEnabled(question) || question.modeling) return refused('it is not a build-the-graph inequality question.');
  const bounds = PLANE_BOUNDS;
  const steps = [];
  const build = [];
  let picture = { lines: [], points: [], regions: [] };
  const boundaries = [];
  const texts = [];
  for (let index = 0; index < constraints.length; index += 1) {
    const constraint = constraints[index];
    const frame = riseAndRun(constraint?.m);
    const b = Number(constraint?.b);
    const relation = constraint?.relation;
    if (!frame || !Number.isInteger(b) || !b || !RELATION_LATEX[relation]) return refused('an inequality is not y compared with mx + b, with a small-fraction slope and a whole, non-zero y-intercept.');
    const target = lineOf(frame.rise, frame.run, b);
    if (!inBounds([0, b]) || !inBounds(secondPointOf(target))) return refused('a plotted point is off the plane.');
    const boundary = boundaryFromSlopeIntercept(target.m, target.b, relation);
    const name = constraints.length > 1 ? `Inequality ${index + 1}` : 'The inequality';
    const yForm = `y ${RELATION_LATEX[relation]} ${lineRightLatex(target)}`;
    const standard = standardFormOf(constraint);
    texts.push(standard ? standard.latex : yForm);
    if (standard) {
      if (!sameHalfPlane(standard, boundary)) return refused('an inequality in standard form is not the same half-plane as its y-form.');
      const flipped = standard.B < 0;
      steps.push(stepOf({
        op: 'rewrite',
        label: `${name}: solve for y`,
        why: PLANE_WHY.rewrite,
        show: `${name}, $${standard.latex}$: solve for $y$${flipped ? ', turning the sign around when dividing by a negative' : ''}. It is $${yForm}$.`,
        lines: [line('before', 'Start with', standard.latex), line('after', flipped ? 'Solved for y (the sign turns around)' : 'Solved for y', yForm, true)],
        plane: picture,
      }));
    }
    const included = relation.includes('=');
    const style = included ? 'solid' : 'dashed';
    const drawn = drawLineSteps({ target, name, equationLatex: yForm, before: picture, style, styleWhy: included ? PLANE_WHY.solid : PLANE_WHY.dashed, index: String(index + 1), given: 'The inequality' });
    steps.push(...drawn.steps);
    // What the builder records for this boundary: both plotted points, with the slope and intercept they were planned from.
    const entry = {
      method: 'slopeIntercept',
      slope: String(target.m),
      intercept: String(target.b),
      x1: String(drawn.first[0]),
      y1: String(drawn.first[1]),
      x2: String(drawn.second[0]),
      y2: String(drawn.second[1]),
      point1Plotted: true,
      point2Plotted: true,
      style,
      boundaryAttempts: 1,
      styleAttempts: 1,
      shadeAttempts: 1,
    };
    if (!boundaryLinesMatch(studentBoundaryLineFromEntry(entry), boundary, bounds)) return refused('the builder does not read its two points as the boundary.');
    // The test point: the origin, which is never on a line with a non-zero y-intercept.
    const test = [0, 0];
    const holds = satisfiesBoundary(boundary, test[0], test[1]);
    const testLatex = `${numberLatex(test[1])} ${RELATION_LATEX[relation]} ${substitutionLatex(target, test[0])}`;
    const lineOnly = { ...drawn.after };
    steps.push(stepOf({
      op: 'testPoint',
      label: `${name}: test the point $${pointLatex(test)}$`,
      why: PLANE_WHY.test,
      show: `Test $${pointLatex(test)}$ in $${yForm}$: $${testLatex}$ is ${holds ? 'true' : 'false'}.`,
      lines: [
        line('before', 'The inequality', yForm),
        line('applied', 'With the point put in', testLatex),
        line('after', holds ? 'True' : 'False', `${numberLatex(test[1])} ${holds ? RELATION_LATEX[relation] : `\\not${RELATION_LATEX[relation]}`} ${numberLatex(target.b)}`, true),
      ],
      plane: { ...lineOnly, points: [{ x: test[0], y: test[1], label: pointLatex(test), mark: 'test' }] },
    }));
    // The shading point the builder records: a grid point on the solution side.
    const above = satisfiesBoundary(boundary, 0, target.b + 3);
    const shadePoint = [0, target.b + (above ? 3 : -3)];
    if (!satisfiesBoundary(boundary, shadePoint[0], shadePoint[1]) || !inBounds(shadePoint)) return refused('no grid point marks its solution side.');
    const region = feasibleRegionPolygon([boundary], bounds).map((point) => (Array.isArray(point) ? [point[0], point[1]] : [point.x, point.y]));
    if (region.length < 3) return refused('its solution side is not on the plane.');
    steps.push(stepOf({
      op: 'shade',
      label: `${name}: shade the side of solutions`,
      why: holds ? PLANE_WHY.shadeTrue : PLANE_WHY.shadeFalse,
      show: `${holds ? `$${pointLatex(test)}$ makes it true, so shade the side with $${pointLatex(test)}$` : `$${pointLatex(test)}$ makes it false, so shade the side without $${pointLatex(test)}$`}: ${above ? 'above' : 'below'} the line.`,
      lines: [
        line('before', 'The test point', `${pointLatex(test)} \\text{ is ${holds ? 'a solution' : 'not a solution'}}`),
        line('after', 'Shaded', `\\text{${above ? 'above' : 'below'} the ${style} line}`, true),
      ],
      plane: { ...lineOnly, regions: [...picture.regions, { points: region, mark: `r${index + 1}` }], points: [{ x: test[0], y: test[1], label: pointLatex(test), mark: 'test' }] },
    }));
    build.push({ ...entry, shadePoint });
    boundaries.push(boundary);
    picture = { lines: lineOnly.lines, points: [], regions: [...picture.regions, { points: region, mark: `r${index + 1}` }] };
  }
  // The marked point, answered for each inequality and for the system.
  const marked = isObject(question.testPoint) ? [Number(question.testPoint.x), Number(question.testPoint.y)] : null;
  const membership = marked ? boundaries.map((boundary) => satisfiesBoundary(boundary, marked[0], marked[1])) : [];
  const work = {
    build,
    outcomesWithheld: false,
    ...(marked ? { teacherPointResponse: { perInequality: membership.map((member) => (member ? 'yes' : 'no')), overall: membership.every(Boolean) ? 'yes' : 'no' } } : {}),
  };
  if (!graded(systemsWorkspaceGrader, question, work)) return refused('the inequality builder does not mark its record correct.');
  if (boundaries.length > 1) {
    const overlap = feasibleRegionPolygon(boundaries, bounds).map((point) => (Array.isArray(point) ? [point[0], point[1]] : [point.x, point.y]));
    // A corner the two lines meet at on the plane's edge is not an overlap a student can see:
    // the solution has to be a shaded piece of the board (OVERLAP_MIN_AREA square units).
    if (overlap.length < 3 || polygonArea(overlap) < OVERLAP_MIN_AREA) return refused('its shaded sides do not overlap on the plane.');
    steps.push(stepOf({
      op: 'overlap',
      label: 'Find where the shaded sides overlap',
      why: PLANE_WHY.overlap,
      show: 'The solution of the system is the part of the plane shaded for both inequalities: where the two shaded sides overlap.',
      lines: [line('before', 'Shaded for', texts.join(' \\text{ and } ')), line('after', 'The solution', '\\text{where both shaded sides overlap}', true)],
      plane: { lines: picture.lines, points: [], regions: [{ points: overlap, mark: 'overlap' }] },
    }));
    picture = { lines: picture.lines, points: [], regions: [{ points: overlap, mark: 'overlap' }] };
  }
  if (marked) {
    const all = membership.every(Boolean);
    steps.push(stepOf({
      op: 'check',
      kind: PLANE_BOARD.CHECK,
      label: `Check the point $${pointLatex(marked)}$`,
      why: PLANE_WHY.member,
      show: `Check $${pointLatex(marked)}$: ${membership.map((member, index) => `it makes ${boundaries.length > 1 ? `inequality ${index + 1}` : 'the inequality'} ${member ? 'true' : 'false'}`).join(', and ')}. So it is ${all ? '' : 'not '}a solution${boundaries.length > 1 ? ' of the system' : ''}.`,
      lines: [
        ...membership.map((member, index) => line(`inequality-${index + 1}`, boundaries.length > 1 ? `Inequality ${index + 1}` : 'The inequality', `${pointLatex(marked)} \\text{ makes it ${member ? 'true' : 'false'}}`)),
        line('after', all ? 'A solution' : 'Not a solution', pointLatex(marked), true),
      ],
      plane: { ...picture, points: [{ x: marked[0], y: marked[1], label: pointLatex(marked), mark: 'marked' }] },
    }));
  }
  return {
    ok: true,
    tool: PLANE_REPLAY_TOOL.INEQUALITY,
    prompt: boundaries.length > 1
      ? `Graph the system of inequalities $${texts[0]}$ and $${texts[1]}$: each boundary line, solid or dashed, and its shading. The solution is where the shadings overlap.`
      : `Graph the inequality $${texts[0]}$: the boundary line, solid or dashed, and the shading.`,
    steps,
    answer: boundaries.length > 1
      ? 'The solution is the part of the plane where the two shaded sides overlap.'
      : `The solution is the shaded side of the ${build[0].style} line, ${satisfiesBoundary(boundaries[0], 0, Number(constraints[0].b) + 3) ? 'above' : 'below'} it.`,
    record: work,
    // A faded example stops after the first boundary's two points: the line, its style and the shading are the student's.
    fadeLimit: (standardFormOf(constraints[0]) ? 1 : 0) + 2,
  };
};

/* --------------------------------------------------------------- the replay */

const toolOf = (question) => {
  const type = lower(question?.type);
  const mode = lower(question?.mode);
  if (type === 'graphing2' && (mode === 'slopeintercept' || (!mode && isObject(question?.line))) && isObject(question?.line)) return PLANE_REPLAY_TOOL.LINE;
  if (type === 'systemsworkspace' && mode === 'linear' && question?.interaction === 'construct' && isObject(question?.system)) return PLANE_REPLAY_TOOL.SYSTEM;
  if (type === 'systemsworkspace' && mode === 'inequalities' && list(question?.expectedConstraints).length) return PLANE_REPLAY_TOOL.INEQUALITY;
  return null;
};

/** The plane tool a question is answered on, where its example can be replayed: 'constructLine', 'graphSystem', 'solveInequalitySystem' or null. */
export const planeReplayToolOf = (question) => toolOf(question);

/**
 * Play a plane question (a sibling) as its tool's own record.
 *
 *   replayPlaneExample(siblingQuestion)
 *     → { ok: true, tool, prompt, steps: [{ show, why, board: { lines, plane } }], answer, record, fadeLimit }
 *     | { ok: false, error }
 */
export const replayPlaneExample = (question) => {
  const tool = toolOf(question);
  try {
    if (tool === PLANE_REPLAY_TOOL.LINE) return lineReplay(question);
    if (tool === PLANE_REPLAY_TOOL.SYSTEM) return systemReplay(question);
    if (tool === PLANE_REPLAY_TOOL.INEQUALITY) return inequalityReplay(question);
  } catch (error) {
    return refused(`${String(error?.message || 'the tool cannot play it')}.`);
  }
  return refused('it is not a question answered on the plane that the replay covers.');
};

/* -------------------------------------------------------------- the sibling */

const slopeKind = (m) => {
  const frame = riseAndRun(m);
  if (!frame) return null;
  return { sign: Math.sign(frame.rise), fraction: frame.run !== 1 };
};
// A slope of the same kind (its sign, and whole or a fraction) that is not the item's.
const slopesLike = (m) => {
  const kind = slopeKind(m);
  if (!kind) return [];
  return SLOPES.filter(([, run]) => (run !== 1) === kind.fraction)
    .map(([rise, run]) => lineOf(kind.sign * rise, run, 0))
    .filter((candidate) => !near(candidate.m, Number(m)));
};
const pickFrom = (options, seed, offset = 0) => (options.length ? options[(((Number(seed) || 0) + offset) % options.length + options.length) % options.length] : null);
const INTERCEPTS = Object.freeze([2, -3, 4, -1, 3, -4, 1, -2, 5, -5]);

const lineSibling = (question, seed) => {
  const item = question.line;
  if (!Number.isFinite(Number(item?.m)) || !Number.isFinite(Number(item?.b))) return null;
  for (let turn = 0; turn < 12; turn += 1) {
    const slope = pickFrom(slopesLike(item.m), seed, turn);
    const b = pickFrom(INTERCEPTS.filter((value) => value !== Number(item.b) && Math.sign(value) === (Math.sign(Number(item.b)) || 1)), seed, turn);
    if (!slope || b === null) return null;
    const sibling = { type: 'graphing2', mode: 'slopeIntercept', line: { m: slope.m, b }, graphBounds: { ...PLANE_BOUNDS } };
    if (replayPlaneExample(sibling).ok) return sibling;
  }
  return null;
};

const systemSibling = (question, seed) => {
  const item = question.system;
  // Always two lines that cross once, as the family's own example is: an
  // example that kept the item's number of solutions would give that part of
  // its answer away (similarExampleIsSafe reads the case names as answers).
  const type = 'one';
  const first = slopesLike(item.m1);
  const second = slopesLike(item.m2);
  for (let turn = 0; turn < 40; turn += 1) {
    const one = pickFrom(first, seed, turn);
    if (!one) return null;
    let system = null;
    {
      const two = pickFrom((second.length ? second : first).filter((candidate) => !near(candidate.m, one.m)), seed + turn, Math.floor(turn / 3));
      if (!two) continue;
      // The lines cross at a grid point: its x is a multiple of both runs.
      const step = one.run * two.run;
      const x0 = step * pickFrom([1, -1, 2, -2], seed, turn);
      const y0 = pickFrom([1, -2, 3, 2, -1, -3, 4], seed, turn + 1);
      const b1 = y0 - one.m * x0;
      const b2 = y0 - two.m * x0;
      if (!whole(b1) || !whole(b2) || near(b1, b2)) continue;
      system = { m1: one.m, b1: Math.round(b1), m2: two.m, b2: Math.round(b2) };
      const solved = solveTwoLines(item);
      if (near(x0, Number(solved.x)) && near(y0, Number(solved.y))) continue;
    }
    const sibling = { type: 'systemsWorkspace', mode: 'linear', interaction: 'construct', system, graph: { ...PLANE_BOUNDS, xStep: 1, yStep: 1 } };
    if (replayPlaneExample(sibling).ok) return sibling;
  }
  return null;
};

// An item's constraint as y compared with mx + b, and whether it is given in standard form (and the sign of its y-term).
const itemConstraint = (constraint, source) => {
  if (!isObject(constraint)) return null;
  const relation = String(constraint.relation || '').replace('≤', '<=').replace('≥', '>=');
  let m;
  let b;
  let rel = relation;
  if (Number.isFinite(Number(constraint.m)) && Number.isFinite(Number(constraint.b)) && constraint.A === undefined) {
    m = Number(constraint.m);
    b = Number(constraint.b);
  } else if (Number.isFinite(Number(constraint.B)) && Math.abs(Number(constraint.B)) > EPS) {
    // A·x + B·y + C rel 0, as the engine holds it.
    m = -Number(constraint.A) / Number(constraint.B);
    b = -Number(constraint.C) / Number(constraint.B);
    rel = Number(constraint.B) < 0 ? FLIP[relation] : relation;
  } else return null;
  if (!RELATION_LATEX[rel] || !slopeKind(m)) return null;
  const text = String(source || '').replace(/\s+/g, '');
  const yAlone = /^y(<=|>=|<|>|≤|≥)/.test(text) || /(<=|>=|<|>|≤|≥)y$/.test(text);
  return { m, b, relation: rel, standard: Boolean(text) && !yAlone, negativeY: /-\d*y/.test(text) };
};

const inequalitySibling = (question, seed) => {
  if (!studentBuildInequalityEnabled(question) || question.modeling) return null;
  const build = isObject(question.studentBuild) ? question.studentBuild : {};
  if (build.boundary !== true || build.lineStyle !== true || build.shading !== true) return null;
  const constraints = list(question.expectedConstraints).length ? list(question.expectedConstraints) : list(question.inequalities);
  if (!constraints.length || constraints.length > 2) return null;
  const items = constraints.map((constraint, index) => itemConstraint(constraint, list(question.sourceConstraints)[index]));
  if (items.some((item) => !item)) return null;
  for (let turn = 0; turn < 24; turn += 1) {
    const used = [];
    const expected = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const slope = pickFrom(slopesLike(item.m).filter((candidate) => !used.some((other) => near(other, candidate.m))), seed + index, turn);
      const b = pickFrom(INTERCEPTS.filter((value) => !near(value, item.b) && !expected.some((other) => other.b === value)), seed + index * 2, turn);
      if (!slope || b === null) return null;
      used.push(slope.m);
      const constraint = { m: slope.m, b, relation: item.relation };
      if (item.standard) {
        // The same half-plane in standard form, with the y-term's sign the item's.
        const q = slope.run;
        const p = slope.rise;
        constraint.source = item.negativeY
          ? { A: p, B: -q, C: -q * b, relation: FLIP[item.relation] }
          : { A: -p, B: q, C: q * b, relation: item.relation };
      }
      expected.push(constraint);
    }
    // A marked point, where the item marks one: a grid point off both lines, in the solution where there is one.
    const boundaries = expected.map((constraint) => boundaryFromSlopeIntercept(constraint.m, constraint.b, constraint.relation));
    const candidates = [[2, 1], [-2, 1], [1, -2], [-1, 3], [3, -1], [-3, -2], [2, 4], [-4, 2]].filter(([x, y]) => expected.every((constraint) => Math.abs(y - (constraint.m * x + constraint.b)) > 0.5));
    const inside = candidates.filter(([x, y]) => boundaries.every((boundary) => satisfiesBoundary(boundary, x, y)));
    const marked = question.testPoint || question.reasoning?.testPoint ? pickFrom(inside.length ? inside : candidates, seed, turn) : null;
    const sibling = {
      type: 'systemsWorkspace',
      mode: 'inequalities',
      expectedConstraints: expected,
      sourceConstraints: expected.map((constraint) => `y ${constraint.relation} ${constraint.m}x + ${constraint.b}`),
      studentBuild: { rewrite: false, boundary: true, lineStyle: true, shading: true },
      reasoning: { testPoint: Boolean(marked), classifyRegion: false, vertices: false },
      ...(marked ? { testPoint: { x: marked[0], y: marked[1] } } : {}),
      graph: { ...PLANE_BOUNDS },
    };
    if (replayPlaneExample(sibling).ok) return sibling;
  }
  return null;
};

/**
 * A sibling for a question answered on the plane: the same tool and the same
 * kind of problem with other numbers, or null. A line keeps its slope's sign
 * and whether it is whole or a fraction; a system is always two lines that
 * cross once (its number of solutions is part of the item's answer, so the
 * example does not say the item's); an inequality keeps its sign (so solid or dashed, above or below),
 * whether it is given in standard form (and the sign of its y-term, so the
 * sign turns around where the item's does), and whether a point is marked to
 * check. It is drawn on a plain −10 to 10 plane.
 */
export const planeSiblingFor = (question, { seed = 0 } = {}) => {
  const tool = toolOf(question) || (lower(question?.type) === 'systemsworkspace' && lower(question?.mode) === 'inequalities' ? PLANE_REPLAY_TOOL.INEQUALITY : null);
  try {
    if (tool === PLANE_REPLAY_TOOL.LINE) return lineSibling(question, seed);
    if (tool === PLANE_REPLAY_TOOL.SYSTEM) return systemSibling(question, seed);
    if (tool === PLANE_REPLAY_TOOL.INEQUALITY) return inequalitySibling(question, seed);
  } catch {
    return null;
  }
  return null;
};

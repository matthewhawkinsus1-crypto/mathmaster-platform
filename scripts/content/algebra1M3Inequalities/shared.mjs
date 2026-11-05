/*
 * SHAPES THE ALGEBRA I MODULE 3 INEQUALITY LESSONS REPEAT.
 *
 * Every graph in Lessons 4 and 5 is built in the Systems Workspace's
 * inequality mode, step by step and checked step by step: the boundary line
 * (two points, or slope and y-intercept), solid or dashed, the half-plane to
 * shade, and — where the item asks — a test point, the kind of region and its
 * corners. A context item starts one step earlier: the student writes the
 * model's coefficients, symbol and constant in the tool before graphing it.
 * Nothing is drawn, placed or chosen for the student.
 */
import { teks } from '../lib/lessonKit.mjs';
import { parsePolynomial } from '../../../functions/shared/algebraicForm.mjs';

// `\${{a}}` writes a math span that opens on a placeholder ($ then {{a}}): in a
// template literal a bare `${` would interpolate.
export const tex = (strings, ...values) => String.raw(strings, ...values).replace(/\\\$/g, '$');

export const WINDOW = Object.freeze({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });

/**
 * One Systems Workspace inequality item. `constraints` are the hidden grading
 * canon ({ m, b, relation } or { A, B, C, relation }, A·x + B·y + C relation
 * 0); `source` is what the student reads (strings), or omitted for a model the
 * student writes (`modeling`).
 */
export const inequalityBuild = ({
  questionId, alignment, dok = 2, difficultyBand = 2, prompt, source = null, constraints, modeling = null,
  rewrite = false, build = true, testPoint = null, studentTestPoint = false, probe = false, classify = false, vertices = false, graph = WINDOW,
  ...rest
}) => ({
  questionId,
  ...alignment,
  studentActions: ['solveInequalitySystem'],
  dok,
  difficultyBand,
  mode: 'inequalities',
  prompt,
  ...(modeling
    ? { modeling: { variables: modeling.variables, expectedConstraints: constraints } }
    : { sourceConstraints: source, expectedConstraints: constraints }),
  // `build: false` is a system the tool draws for the student, who then
  // reasons about it (overlap, points, region): for boundaries with no
  // whole-number points to plot, such as 6.9x + 10.4y = 400.
  studentBuild: { rewrite: Boolean(rewrite), boundary: Boolean(build), lineStyle: Boolean(build), shading: Boolean(build) },
  ...(testPoint || studentTestPoint || classify || vertices
    ? {
      reasoning: {
        testPoint: Boolean(testPoint || studentTestPoint),
        // A test point ON a boundary also asks whether that boundary is
        // part of the solution (solid or dashed there): an intersection
        // point is not automatically a solution.
        ...(probe ? { boundaryProbe: true } : {}),
        classifyRegion: Boolean(classify),
        vertices: Boolean(vertices),
      },
    }
    : {}),
  ...(testPoint ? { testPoint } : {}),
  ...(studentTestPoint ? { allowStudentTestPoint: true } : {}),
  ...(classify ? { askClassification: true } : {}),
  ...(vertices ? { askVertices: true } : {}),
  graph,
  ...rest,
});

export const A3D = teks('A.3D', 'A.2H');
export const A2H = teks('A.2H', 'A.3D');
export const A3H = teks('A.3H', 'A.3D');
export const A3H_MODEL = teks('A.3H', 'A.2H');

/**
 * A choice whose answer is a template that resolves, in every generated
 * version, to exactly one of its options — "({{xa}}, {{ya}})" is whichever
 * point the version made the solution. `choice()` cannot check that before
 * the numbers exist; the lesson tests grade every version's key instead.
 */
export const computedChoice = (id, label, options, answer) => ({ id, label, type: 'choice', options, answer });

/*
 * THE GRAPH A KEY HOLDS (N38, F-GRAPH-IN-WORDS in
 * docs/qa/2026-11-03-pr537-walkthrough/findings.md). "Write the inequality for
 * graphs a, b and c" showed no graph: each was a sentence ("a DASHED boundary
 * line through (0, 2) and (1, 6); the shaded half-plane contains (0, 0)"). The
 * figure is now drawn from the inequality the item's own key holds, read with
 * the platform's polynomial parser: its boundary line, solid for ≤ and ≥ and
 * dashed for < and >, and the side where the key is true, shaded. The figure
 * and the key cannot disagree; algebra1Module3InequalityFigures.test.mjs
 * checks every drawn line and shaded side against the key anyway.
 */
const FLIP = Object.freeze({ '<': '>', '<=': '>=', '>': '<', '>=': '<=' });
const tidy = (value) => Number(Number(value).toFixed(9)) + 0;

/** "y < 4x + 2" → { m: 4, b: 2, relation: '<' }; "x < 3" → a vertical boundary. */
export const keyInequality = (key) => {
  const [left, relation, right, ...rest] = String(key).replace(/≤/g, '<=').replace(/≥/g, '>=').split(/(<=|>=|<|>)/);
  const sides = [parsePolynomial(left), parsePolynomial(right)];
  if (rest.length || !relation || sides.some((side) => !side)) throw new Error(`Not one linear inequality: ${key}`);
  const coefficient = (name) => (sides[0].get(name) || 0) - (sides[1].get(name) || 0);
  const [A, B, C] = [coefficient('x'), coefficient('y'), coefficient('')];
  if (Math.abs(B) > 1e-12) return { m: tidy(-A / B), b: tidy(-C / B), relation: B < 0 ? FLIP[relation] : relation };
  if (Math.abs(A) > 1e-12) return { orientation: 'vertical', x: tidy(-C / A), relation: A < 0 ? FLIP[relation] : relation };
  throw new Error(`No boundary line: ${key}`);
};

// The window every drawn figure in these lessons shares: the tool's own −10 to
// 10, drawn with one unit the same length both ways (R-1), so a slope looks
// its size.
export const FIGURE_WINDOW = Object.freeze({ ...WINDOW, equalUnits: true });

/**
 * The figure of the inequalities `keys` hold: each boundary line, dashed when
 * its relation is strict, and the shading — each half-plane on its own
 * (`shade: 'each'`), or only the region where all of them hold (`'overlap'`, a
 * system's solution set). `strokes` colours the lines in the Systems
 * Workspace's constraint order; a half-plane takes its line's colour.
 */
export const inequalityFigure = (keys, { shade = 'each', strokes = [], points = [] } = {}) => {
  const inequalities = keys.map(keyInequality);
  const style = (inequality, index) => ({
    ...(inequality.relation.includes('=') ? {} : { dashed: true }),
    ...(strokes[index] ? { stroke: strokes[index] } : {}),
  });
  const functions = inequalities.flatMap((inequality, index) => (inequality.orientation === 'vertical' ? [] : [{ type: 'line', m: inequality.m, b: inequality.b, ...style(inequality, index) }]));
  const verticalLines = inequalities.flatMap((inequality, index) => (inequality.orientation === 'vertical' ? [{ x: inequality.x, ...style(inequality, index) }] : []));
  return {
    ...FIGURE_WINDOW,
    ...(functions.length ? { functions } : {}),
    ...(verticalLines.length ? { verticalLines } : {}),
    ...(points.length ? { points } : {}),
    ...(shade === 'none' ? {} : { shading: shade === 'overlap' ? [{ inequalities }] : inequalities }),
  };
};

/**
 * Graphs a prompt names ("graphs a, b and c"), each drawn from the key of the
 * box that asks about it (`keys[id]`), in the order written: they are figures
 * to read, not choices to shuffle (MultiAnswerGrader).
 */
export const keyedGraphs = (keys, ids, label = (id) => `Graph ${id}`) => ({
  candidateGraphs: ids.map((id) => ({ id, label: label(id), graph: inequalityFigure([keys[id]]) })),
  candidateGraphsInOrder: true,
});

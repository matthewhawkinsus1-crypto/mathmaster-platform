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

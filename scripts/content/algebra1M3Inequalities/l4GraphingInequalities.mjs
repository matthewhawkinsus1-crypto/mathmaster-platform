/*
 * ALGEBRA I · MODULE 3 · TOPIC 2 · LESSON 4 — GRAPHING INEQUALITIES IN TWO
 * VARIABLES (A.2H, A.3D), REGULAR AND HONORS.
 *
 * From the district's Lesson 4 slides (two 45-minute days): Making a
 * Statement (Getting Started), Activity 4.1 Linear Inequalities in Two
 * Variables (Kai's points per game), Activity 4.2 Determining the Graphs of
 * Linear Inequalities (half-planes, boundary lines, test points, matching,
 * graphing, writing an inequality from a graph), Activity 4.3 Interpreting
 * the Graph of a Linear Inequality (César's phone card) and Talk the Talk
 * (There's a Fine Line). One change of order: Activity 4.2's first graph,
 * y > 4x − 6, comes right after CW 1, so the first graph a student builds is
 * an inequality with no story, before Kai's goal is graphed.
 *
 * The Warm-Up climbs from what students know to the lesson: a one-variable
 * solution statement on a number line (open or closed circle — tomorrow's
 * dashed or solid line), the boundary as a line they can already graph, and
 * testing a point in an inequality (tomorrow's test point).
 *
 * The Honors file is the same lesson from the same slides, with Honors depth:
 * fractional slopes and standard forms whose y-coefficient is not ±1 in the
 * Warm-Up, Practice and Exit Ticket, parameters, boundaries from two points,
 * and two audited Digital SAT items from MathMaster's CCMR bank in Practice.
 */
import { auditedCcmrQuestion, backUp, choice, guidedNotes, inequality, number, review, teks } from '../lib/lessonKit.mjs';
import {
  A2H, A3D, SLIP, computedChoice, graphSlips, inequalityBuild, inequalityFigure, keyedGraphs, otherInterceptSign, otherSymbols, restyled, slip,
  symbolSlip, tex, turned, withOwnHint,
} from './shared.mjs';

const FOLDER = 'Algebra I/Module 3/Topic 2/Lesson 4';

/*
 * The example in an empty box that asks for the inequality a graph (or a
 * description of one) shows. The platform's example for any inequality box is
 * "0 ≤ x ≤ 4", a compound inequality in one variable, not one inequality in x
 * and y (F-GRAPH-IN-WORDS, docs/qa/2026-11-03-pr537-walkthrough/findings.md).
 * This one is no item's answer in any version, nor a graph a student builds in
 * this lesson (algebra1Module3InequalityLessons.test.mjs).
 */
const GRAPH_INEQUALITY_EXAMPLE = 'y ≥ 3x + 5';
const graphInequality = (id, label, answer) => inequality(id, label, answer, { placeholder: GRAPH_INEQUALITY_EXAMPLE });

/*
 * The keys of the items that ask for the inequality a graph shows. Each graph
 * is drawn from its box's key (inequalityFigure, N38), so these are the only
 * place the inequality is written.
 */
const SHARED_BOUNDARY_KEYS = Object.freeze({ a: 'y > 1/2x - 3', b: 'y <= 1/2x - 3', c: 'y < 1/2x - 3', d: 'y >= 1/2x - 3' });
const WORKED_EXAMPLE_KEY = 'y >= -3/2x - 5';
const THREE_GRAPHS_KEYS = Object.freeze({ a: 'y < 4x + 2', b: 'y >= 1/2x - 3', c: 'y < 3/4x - 2' });
const VERTICAL_HORIZONTAL_KEYS = Object.freeze({ a: 'x < 3', b: 'y >= -2' });
const MARCUS_GRAPH_KEY = 'y <= -2x + 1';
const NOT_THE_ORIGIN_KEY = 'y >= -2x + 4';
// Two more lines read from what the student sees: César's table and Honors PR 15's two points.
const CESAR_KEY = 'y <= -0.4x + 100';
const TWO_POINTS_KEY = 'y <= -x + 3';

/* ----------------------------------------------------------- Warm-Up */

const numberLineWarmup = (id) => ({
  questionId: id,
  ...teks('A.5B'),
  studentActions: ['constructInterval'],
  dok: 1,
  difficultyBand: 1,
  prompt: tex`Making a statement. Graph the solution set of $x < {{a}}$ on the number line. Is {{a}} itself a solution? Your circle should say so.`,
  directionSteps: ['Decide whether the circle is open or closed.', 'Decide which way to shade.'],
  intervals: [{ min: null, max: '{{a}}', minInclusive: false, maxInclusive: false }],
  ask: ['graph'],
  hints: [
    'Is a number ever less than itself? So is the circle open or closed?',
    'An open circle leaves the number out. x < a is true for every number to the left of a, so shade to the left.',
  ],
  scaffold: backUp('For x < 2, the number 2 is…', ['not a solution', 'a solution'], 'not a solution'),
  guidedNotes: guidedNotes(
    ['Solution statements', 'x = 2 is one point; x < 2 and x > 2 leave 2 out (open circle); x ≤ 2 and x ≥ 2 include it (closed circle).'],
    ['Coming up', 'In two variables, the open circle becomes a dashed boundary line and the closed circle a solid one.'],
  ),
  solutionReview: {
    headline: 'Open circle at {{a}}, shaded to the left.',
    reasoning: ['< is strict, so {{a}} is not a solution: use an open circle.', 'Every number less than {{a}} is a solution, so shade to the left.'],
    answerSummary: 'open circle at {{a}}, shaded left',
    commonError: 'Using a closed circle: {{a}} < {{a}} is false, so {{a}} is not in the solution set.',
  },
  generator: { parameters: { a: { type: 'int', min: -12, max: 12 } } },
  questionFamily: { scope: 'assignment' },
});

const boundaryLineWarmup = (id, honors) => ({
  questionId: id,
  ...teks('A.3C'),
  studentActions: ['constructLine'],
  dok: 1,
  difficultyBand: honors ? 2 : 1,
  prompt: 'Graph {{equation}}. Plot its y-intercept, then use the slope to plot a second point. In this lesson a line like this becomes the boundary of an inequality.',
  directionSteps: ['Plot the y-intercept.', 'Use the slope to plot a second point.', 'Draw the line through both points.'],
  questionFamily: { id: 'linear.graphFromSlopeIntercept', ...(honors ? { constraints: { slope: 'fraction' } } : {}) },
  hints: [
    'Where does the line cross the y-axis? Which number in the equation tells you?',
    honors ? 'A fraction slope is rise over run. Which part of the fraction is the rise, and which is the run?' : 'The slope is rise over run. From the y-intercept, how far up or down do you move for each 1 to the right?',
    honors
      ? 'Plot the y-intercept, the constant term. Then move up or down by the numerator and right by the denominator, and check your second point in the equation.'
      : 'Plot the y-intercept, the constant term. Then move up or down by the slope for each 1 to the right, and check your second point in the equation.',
  ],
  scaffold: honors
    ? backUp('A slope of 2/3 means…', ['up 2, right 3', 'up 3, right 2'], 'up 2, right 3')
    : backUp('A slope of 3 means…', ['up 3, right 1', 'up 1, right 3'], 'up 3, right 1'),
  solutionReview: {
    reasoning: ['Plot the y-intercept, (0, b).', 'Use the slope as rise over run to plot a second point.', 'Draw the line through both points.'],
    commonError: 'Starting at the slope instead of the y-intercept.',
  },
});

const testPointWarmup = (id, honors) => ({
  questionId: id,
  ...A3D,
  studentActions: ['multipleResponses'],
  dok: honors ? 2 : 1,
  difficultyBand: 2,
  prompt: honors
    ? tex`Test points. Substitute each point into $ {{A}}x + {{B}}y \le {{C}} $. Which point is a solution?`
    : tex`Test points. For $y \ge {{m|coef}}x {{b|signed}}$, find the value of the right side at each point's x-coordinate. Which point is a solution?`,
  directionSteps: ['Substitute the first point.', 'Substitute the second point.', 'Decide which point makes the inequality true.'],
  responses: honors
    ? [
      number('v1', 'At ({{x1}}, {{y1}}): {{A}}x + {{B}}y =', '{{v1}}'),
      number('v2', 'At ({{x2}}, {{y2}}): {{A}}x + {{B}}y =', '{{v2}}'),
      computedChoice('which', 'Which point is a solution?', ['({{x1}}, {{y1}})', '({{x2}}, {{y2}})', 'Both points', 'Neither point'], '({{xa}}, {{ya}})'),
    ]
    : [
      number('r1', 'At x = {{x1}}: {{m|coef}}x {{b|signed}} =', '{{r1}}'),
      number('r2', 'At x = {{x2}}: {{m|coef}}x {{b|signed}} =', '{{r2}}'),
      computedChoice('which', 'Which point is a solution?', ['({{x1}}, {{y1}})', '({{x2}}, {{y2}})', 'Both points', 'Neither point'], '({{xa}}, {{ya}})'),
    ],
  hints: [
    'What do you get when you put each point’s coordinates into the inequality: a true statement or a false one?',
    'Put the x-coordinate in for x and the y-coordinate in for y, then compare the two sides. A point is a solution when the inequality is true there.',
  ],
  scaffold: backUp('A point is a solution of an inequality when, substituted, it makes the inequality…', ['true', 'equal to zero'], 'true'),
  solutionReview: honors
    ? {
      headline: 'Substitute and compare with {{C}}.',
      reasoning: ['At ({{x1}}, {{y1}}): {{A}}({{x1}}) + {{B}}({{y1}}) = {{v1}}.', 'At ({{x2}}, {{y2}}): {{A}}({{x2}}) + {{B}}({{y2}}) = {{v2}}.', 'Only ({{xa}}, {{ya}}) gives a value of at most {{C}}.'],
      answerSummary: '({{xa}}, {{ya}})',
      commonError: 'Substituting the coordinates in the wrong order: x comes first.',
    }
    : {
      headline: 'Compare each y-coordinate with the boundary’s value.',
      reasoning: ['At x = {{x1}} the right side is {{r1}}; at x = {{x2}} it is {{r2}}.', 'Only ({{xa}}, {{ya}}) has a y-coordinate at least as large as the right side.'],
      answerSummary: '({{xa}}, {{ya}})',
      commonError: 'Comparing the x-coordinate with the right side instead of the y-coordinate.',
    },
  generator: honors
    ? {
      parameters: { A: { type: 'int', min: 2, max: 5 }, B: { type: 'int', min: 2, max: 5 }, x1: { type: 'int', min: -4, max: 4 }, x2: { type: 'int', min: -4, max: 4 }, y0: { type: 'int', min: -3, max: 3 }, s: { type: 'int', min: 0, max: 1 }, d: { type: 'int', min: 1, max: 4 } },
      derived: {
        y1: 'y0', y2: 'y0 + 1',
        C: 's*(A*x1 + B*y0 + d) + (1 - s)*(A*x2 + B*(y0 + 1) + d)',
        v1: 'A*x1 + B*y0', v2: 'A*x2 + B*(y0 + 1)',
        xa: 's*x1 + (1 - s)*x2', ya: 's*y0 + (1 - s)*(y0 + 1)',
      },
      constraints: ['x1 != x2', 's*(A*x2 + B*(y0 + 1)) + (1 - s)*(A*x1 + B*y0) > s*(A*x1 + B*y0 + d) + (1 - s)*(A*x2 + B*(y0 + 1) + d)'],
    }
    : {
      parameters: { m: { type: 'int', min: -3, max: 3, exclude: [0] }, b: { type: 'int', min: -4, max: 4, exclude: [0] }, x1: { type: 'int', min: -3, max: 3 }, x2: { type: 'int', min: -3, max: 3 }, s: { type: 'int', min: 0, max: 1 }, d: { type: 'int', min: 1, max: 3 } },
      derived: {
        r1: 'm*x1 + b', r2: 'm*x2 + b',
        y1: 'm*x1 + b + d*(2*s - 1)', y2: 'm*x2 + b - d*(2*s - 1)',
        xa: 's*x1 + (1 - s)*x2', ya: 's*(m*x1 + b + d*(2*s - 1)) + (1 - s)*(m*x2 + b - d*(2*s - 1))',
      },
      constraints: ['x1 != x2'],
    },
  questionFamily: { scope: 'assignment' },
});

/* --------------------------------------------------------- Classwork */

const kaiStory = 'Coach Garcia is analyzing the scoring patterns of players on his basketball team. Kai averages 20 points per game from two-point and three-point shots. Let x be the number of two-point shots and y the number of three-point shots.';

const classwork = (P) => [
  {
    questionId: `${P}-cw-1`,
    ...A2H,
    studentActions: ['multipleResponses'],
    dok: 1,
    difficultyBand: 1,
    prompt: `Activity 4.1 — Linear Inequalities in Two Variables. ${kaiStory} Find Kai’s points for each game, and write an equation for every combination that totals exactly 20 points.`,
    directionSteps: ['Find the points for each game.', 'Decide whether Kai meets the average.', 'Write the equation for exactly 20 points.'],
    responses: [
      number('game1', '6 two-point shots and 2 three-point shots: total points', '18'),
      choice('meet1', 'Does Kai meet her average in that game?', ['No — 18 is less than 20', 'Yes — 18 is at least 20', 'Yes — she made 8 shots', 'No — she needs exactly 26'], 'No — 18 is less than 20'),
      number('game2', '7 two-point shots and 2 three-point shots: total points', '20'),
      number('game3', '7 two-point shots and 4 three-point shots: total points', '26'),
      { id: 'equation', label: 'Equation for exactly 20 points', answer: '2x + 3y = 20', inputProfile: 'equation', equivalence: 'polynomialRelation' },
    ],
    hints: ['How many points does each kind of shot score? How many of each did Kai make?', 'Multiply each count by its point value, then add. Which expression in x and y gives Kai’s total?', 'Two-point shots score 2x points and three-point shots 3y. Set their total equal to Kai’s average.'],
    scaffold: backUp('Points from x two-point shots is…', ['2x', 'x + 2'], '2x'),
    guidedNotes: guidedNotes(['Two variables', 'One equation in two variables has many solutions: every pair (x, y) that makes it true. 2x + 3y = 20 is true for (7, 2), (10, 0), (4, 4) and more.']),
    solutionReview: review(
      'Multiply each count by its point value, then add.',
      ['2(6) + 3(2) = 18, which is less than 20.', '2(7) + 3(2) = 20 meets the average exactly; 2(7) + 3(4) = 26 is more than 20.', 'Every combination worth exactly 20 points satisfies 2x + 3y = 20.'],
      '18; 20; 26; 2x + 3y = 20',
      'Switching the point values: the two-point shots are x, so the term is 2x.',
    ),
  },
  // The first bare graph (Activity 4.2's y > 4x − 6) comes right after CW 1, so a
  // student builds one inequality in the tool before modeling Kai's goal with it
  // (CW 2): the L4 pacing note in docs/qa/2026-11-03-pr537-walkthrough/findings.md.
  // Every id keeps its number.
  inequalityBuild({
    questionId: `${P}-cw-6`,
    alignment: A3D,
    dok: 2,
    difficultyBand: 2,
    prompt: tex`Activity 4.2 — Determining the Graphs of Linear Inequalities. Consider $y > 4x - 6$. Its boundary line is determined by the equation of the line. Build the boundary line, decide whether it is solid or dashed, and shade the correct half-plane. Then test the point (0, 0).`,
    source: ['y > 4x - 6'],
    constraints: [{ m: 4, b: -6, relation: '>' }],
    testPoint: { x: 0, y: 0 },
    directionSteps: ['Build the boundary line.', 'Choose solid or dashed.', 'Shade the half-plane of solutions.', 'Test the point.'],
    hints: ['What are the slope and the y-intercept of the boundary line y = 4x − 6?', 'Does > include the points on the line itself? Which line style shows that?', 'Plot (0, −6) and go up 4, right 1. > leaves the line out, so it is dashed. Then substitute (0, 0): is 0 > 4(0) − 6 true?'],
    scaffold: backUp('For > or <, the boundary line is…', ['dashed', 'solid'], 'dashed'),
    guidedNotes: guidedNotes(
      ['Boundary line', 'The boundary line divides the plane into two half-planes; the symbol says which half-plane holds the solutions.'],
      ['Solid or dashed', '≥ or ≤: solid, because points on the line are solutions. > or <: dashed, because no point on the line is.'],
      ['Test point', 'If (0, 0) is a solution, shade its half-plane; if not, shade the other one. (Use another point if the line passes through the origin.)'],
    ),
    solutionReview: review(
      'Boundary, style, shading, test.',
      ['Boundary y = 4x − 6: plot (0, −6) and (1, −2).', '> is strict, so the line is dashed.', '0 > 4(0) − 6 is true, so shade the half-plane containing (0, 0): above the line.'],
      'dashed line y = 4x − 6, shaded above',
      'Shading below because the slope is positive: the symbol decides the side, not the slope.',
    ),
  }),
  inequalityBuild({
    questionId: `${P}-cw-2`,
    alignment: A2H,
    dok: 2,
    difficultyBand: 2,
    prompt: `${kaiStory} Coach Garcia believes the team can win the district playoffs if Kai scores AT LEAST 20 points per game. Write the inequality in the tool, then graph it: build the boundary line, choose solid or dashed, and shade the half-plane of combinations that meet the goal. Then test the point (6, 4).`,
    modeling: { variables: [{ symbol: 'x', label: 'two-point shots' }, { symbol: 'y', label: 'three-point shots' }] },
    constraints: [{ A: 2, B: 3, C: -20, relation: '>=' }],
    testPoint: { x: 6, y: 4 },
    graph: { xMin: 0, xMax: 12, yMin: 0, yMax: 10 },
    directionSteps: ['Write the inequality for at least 20 points.', 'Build the boundary line.', 'Choose solid or dashed.', 'Shade the half-plane that meets the goal.', 'Test the point.'],
    // Hint 2 used to give the boundary's points, (10, 0) and (4, 4): the whole
    // boundary step (F-HINT-GIVES-STEP). It now asks for one, and the last
    // hint says how to find them.
    hints: [
      'Does "at least 20" include exactly 20 points? Which symbol says "20 or more"?',
      'Combinations worth exactly 20 points lie on the boundary line. How many two-point shots make 20 points with no three-point shots?',
      'Exactly 20 points means 2x + 3y = 20: draw the line through two whole-number combinations that make it true. Then test (6, 4) to choose the side.',
    ],
    scaffold: backUp('"At least 20" means…', ['≥ 20', '≤ 20'], '≥ 20'),
    guidedNotes: guidedNotes(
      ['From an equation to an inequality', 'Replace "=" with the symbol the situation needs: at least ≥, no more than ≤, more than >, fewer than <.'],
      ['Half-plane', 'The graph of a linear inequality in two variables is a half-plane, half of the coordinate plane, on one side of a boundary line.'],
    ),
    solutionReview: review(
      'Model, boundary, style, shading, test.',
      ['At least 20 points: 2x + 3y ≥ 20.', 'The boundary 2x + 3y = 20 passes through (10, 0) and (4, 4); ≥ includes 20, so it is solid.', 'Shade above: (6, 4) gives 24 ≥ 20, so it is in the shaded half-plane.'],
      '2x + 3y ≥ 20, solid, shaded above',
      'Drawing a dashed line: exactly 20 points meets the goal, so the boundary is part of the solution.',
    ),
  }),
  {
    questionId: `${P}-cw-3`,
    ...A3D,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: 'Complete the table of Kai’s total points for each combination of shots. Then decide where on your graph the combinations that meet or exceed her average lie.',
    table: {
      columns: [{ key: 'two', label: 'Two-point shots, x' }, { key: 'three', label: 'Three-point shots, y' }, { key: 'total', label: 'Total points' }],
      rows: [
        { two: '4', three: '1', total: '?' }, { two: '6', three: '1', total: '?' }, { two: '7', three: '1', total: '?' },
        { two: '8', three: '2', total: '?' }, { two: '6', three: '4', total: '?' }, { two: '9', three: '5', total: '?' },
      ],
    },
    directionSteps: ['Find the total for each row of the table.', 'Decide where the combinations that meet the average lie.'],
    responses: [
      number('t1', '(4, 1)', '11'),
      number('t2', '(6, 1)', '15'),
      number('t3', '(7, 1)', '17'),
      number('t4', '(8, 2)', '22'),
      number('t5', '(6, 4)', '24'),
      number('t6', '(9, 5)', '33'),
      choice('where', 'The combinations that meet or exceed 20 points are…', [
        'on or above the line 2x + 3y = 20',
        'below the line 2x + 3y = 20',
        'only on the line 2x + 3y = 20',
        'on or below the line 2x + 3y = 20',
      ], 'on or above the line 2x + 3y = 20'),
    ],
    hints: ['How many points is each two-point shot worth? Each three-point shot?', 'Multiply each count by its point value and add. Which totals are 20 or more?', 'Total = 2 · (two-point shots) + 3 · (three-point shots). The rows worth 20 or more lie on one side of the line 2x + 3y = 20.'],
    scaffold: backUp('The total for (8, 2) is…', ['2(8) + 3(2)', '8 + 2'], '2(8) + 3(2)'),
    solutionReview: review(
      'Evaluate 2x + 3y for each row.',
      ['Totals: 11, 15, 17 (below 20) and 22, 24, 33 (20 or more).', 'The combinations with 20 or more points lie on or above the line 2x + 3y = 20.'],
      '11, 15, 17, 22, 24, 33; on or above the line',
      'Adding the shot counts (x + y) instead of the points.',
    ),
  },
  {
    questionId: `${P}-cw-4`,
    ...A3D,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 3,
    prompt: 'Interpret the solutions. Compare the solutions of 2x + 3y = 20 with those of 2x + 3y ≥ 20. Then decide whether (6.5, 5.5) makes sense for Kai, and find Kai’s points for a point below the line and a point on it.',
    directionSteps: ['Compare the two solution sets.', 'Decide whether the decimal point makes sense in the situation.', 'Find the points for each of the other two combinations.', 'Explain what those two points mean.'],
    responses: [
      // Every option is a claim with a reason, each wrong one wrong in one
      // way, so the key is not the longest (F-LONGEST-IS-RIGHT).
      choice('compare', 'How do the solutions differ?', [
        'The equation’s solutions are only the points on the line; the inequality’s are the line and the half-plane above it',
        'The equation’s solutions are only the points on the line; the inequality’s are the half-plane above it, not the line',
        'The equation’s solutions are the line and the half-plane above it; the inequality’s are only the points on the line',
        'The equation’s solutions are the points on the line; the inequality’s are the same points, since both use 2x + 3y',
      ], 'The equation’s solutions are only the points on the line; the inequality’s are the line and the half-plane above it'),
      number('decimalValue', '2(6.5) + 3(5.5) =', '29.5'),
      choice('decimal', 'Does (6.5, 5.5) make sense as a solution for Kai?', [
        'No — it satisfies the inequality, but Kai cannot make half of a shot',
        'Yes — it satisfies the inequality, so it is a combination Kai can make',
        'No — it is below the line, because 6.5 + 5.5 is less than 20',
        'Yes — Kai can make any number of shots, so decimals make sense too',
      ], 'No — it satisfies the inequality, but Kai cannot make half of a shot'),
      number('below', 'Kai’s points for 2 two-point shots and 3 three-point shots, (2, 3)', '13'),
      number('onLine', 'Kai’s points for 1 two-point shot and 6 three-point shots, (1, 6)', '20'),
      choice('meaning', 'What do those two points mean?', [
        '(2, 3) is below the line and misses the goal; (1, 6) is on the line and meets it exactly',
        '(2, 3) is on the line and meets the goal exactly; (1, 6) is below the line and misses it',
        '(2, 3) is below the line and misses the goal; (1, 6) is on the line, so it misses it too',
        '(2, 3) is above the line and beats the goal; (1, 6) is on the line and meets it exactly',
      ], '(2, 3) is below the line and misses the goal; (1, 6) is on the line and meets it exactly'),
    ],
    hints: ['Where is the equation true: only on its line, or off it too? Where is the inequality true?', 'Substitute each point into 2x + 3y. Is the total below Kai’s goal, equal to it or above it? What do x and y count?', 'An equation is true only on its line; an inequality with ≥ is true on the line and on one side of it. x and y count shots, so only whole numbers make sense.'],
    scaffold: backUp('The number of shots Kai makes must be…', ['a whole number', 'any real number'], 'a whole number'),
    solutionReview: review(
      'A solution must make the inequality true and make sense.',
      ['2x + 3y = 20 is true only on the line; 2x + 3y ≥ 20 is true on the line and above it.', '(6.5, 5.5) gives 29.5 ≥ 20, but half a shot is impossible.', '(2, 3) gives 13, less than 20 (below the line); (1, 6) gives exactly 20 (on the line).'],
      'line only vs. line and above; 29.5, but no; 13; 20',
      'Accepting every point in the shaded region in a situation that counts whole things.',
    ),
  },
  {
    questionId: `${P}-cw-5`,
    ...A2H,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: 'Like linear equations, linear inequalities take different forms: ax + by < c, ax + by ≤ c, ax + by > c and ax + by ≥ c. Write each statement about Kai’s game as an inequality, where x is her two-point shots and y her three-point shots.',
    directionSteps: ['Decide what each statement counts: points or shots.', 'Choose the symbol each phrase describes.', 'Write each inequality.'],
    responses: [
      inequality('atLeast', 'She scores at least 20 points.', '2x + 3y >= 20'),
      inequality('noMore', 'She scores no more than 30 points.', '2x + 3y <= 30'),
      inequality('fewer', 'She makes fewer than 12 shots in all.', 'x + y < 12'),
      inequality('more', 'Her two-point shots outnumber her three-point shots by more than 4.', 'x - y > 4'),
    ],
    hints: ['Does each statement count points or shots? Does its phrase include the number itself?', '"At least" and "no more than" include the number; "more than" and "fewer than" leave it out. Which way does each symbol point?', 'Points come from 2x + 3y and the number of shots from x + y. "Outnumber by more than 4" compares x − y with 4.'],
    // Four boxes: each names every wrong symbol in one sentence (six to an item).
    misconceptions: [
      slip('atLeast', otherSymbols('2x + 3y >= 20'), '"At least 20" means 20 or more, and 20 itself counts.'),
      slip('noMore', otherSymbols('2x + 3y <= 30'), '"No more than 30" means 30 or less, and 30 itself counts.'),
      slip('fewer', otherSymbols('x + y < 12'), '"Fewer than 12" means less than 12, and 12 itself does not count.'),
      slip('more', otherSymbols('x - y > 4'), '"More than 4" means greater than 4, and 4 itself does not count.'),
    ],
    scaffold: backUp('"No more than" includes the number itself?', ['yes', 'no'], 'yes'),
    solutionReview: review(
      'Include the number or leave it out.',
      ['At least ≥ and no more than ≤ include the number; more than > and fewer than < leave it out.', '2x + 3y ≥ 20; 2x + 3y ≤ 30; x + y < 12; x − y > 4.'],
      '2x + 3y ≥ 20; 2x + 3y ≤ 30; x + y < 12; x − y > 4',
      'Reading "no more than" as <: the number itself is allowed.',
    ),
  },
  {
    questionId: `${P}-cw-7`,
    ...A3D,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: 'Graphs a, b and c share one boundary line, y = (1/2)x − 3. Write the inequality each graph shows, and the fourth inequality with this boundary, which none of them shows.',
    ...keyedGraphs(SHARED_BOUNDARY_KEYS, ['a', 'b', 'c']),
    directionSteps: ['Use solid or dashed to narrow the symbol.', 'Use the shaded side to finish each inequality.', 'Write the fourth inequality with this boundary.'],
    responses: [
      graphInequality('a', 'Graph a', SHARED_BOUNDARY_KEYS.a),
      graphInequality('b', 'Graph b', SHARED_BOUNDARY_KEYS.b),
      graphInequality('c', 'Graph c', SHARED_BOUNDARY_KEYS.c),
      graphInequality('d', 'The inequality no graph shows (you graph it next)', SHARED_BOUNDARY_KEYS.d),
    ],
    hints: ['Which graphs have a dashed line, and which a solid one? Which side of the line is shaded in each?', 'Dashed goes with < or >, solid with ≤ or ≥. With y alone, > and ≥ shade above, and < and ≤ shade below.'],
    // The prompt prints the boundary, so only the symbol can slip; graph d's
    // wrong symbols are the three the graphs show.
    misconceptions: [
      ...['a', 'b', 'c'].map((id) => symbolSlip(id, SHARED_BOUNDARY_KEYS[id])),
      slip('d', otherSymbols(SHARED_BOUNDARY_KEYS.d), 'The line is right, but graphs a, b and c already show that inequality. Which symbol is left?'),
    ],
    scaffold: backUp('Solved for y, y < mx + b shades…', ['below the line', 'above the line'], 'below the line'),
    solutionReview: review(
      'Line style, then side.',
      ['a: dashed and above → y > (1/2)x − 3. b: solid and below → y ≤ (1/2)x − 3. c: dashed and below → y < (1/2)x − 3.', 'The one left is y ≥ (1/2)x − 3: solid and above.'],
      'a >, b ≤, c <, d ≥',
      'Choosing by the line alone: all four inequalities share the same boundary line.',
    ),
  },
  inequalityBuild({
    questionId: `${P}-cw-8`,
    alignment: A3D,
    dok: 2,
    difficultyBand: 2,
    prompt: tex`Graph d. Graph $y \ge \frac{1}{2}x - 3$, the inequality no graph showed. Consider the symbol and which half-plane will be shaded before you test any points.`,
    source: ['y >= (1/2)x - 3'],
    constraints: [{ m: 0.5, b: -3, relation: '>=' }],
    directionSteps: ['Build the boundary line.', 'Choose solid or dashed.', 'Shade the half-plane of solutions.'],
    hints: ['Where does the boundary cross the y-axis, and what is its rise over run?', 'Does ≥ include the points on the line? Which side of the line has the greater y-values?', 'Plot (0, −3), then go up 1 and right 2. ≥ includes the line, so it is solid, and it shades above.'],
    scaffold: backUp('A slope of 1/2 means…', ['up 1, right 2', 'up 2, right 1'], 'up 1, right 2'),
    solutionReview: review(
      'Solid line, shaded above.',
      ['Plot (0, −3), then up 1 and right 2 to (2, −2).', '≥ includes equality: solid line.', 'Shade above; (0, 0) gives 0 ≥ −3, true.'],
      'solid line y = (1/2)x − 3, shaded above',
      'Using a rise of 2 and a run of 1 for the slope 1/2.',
    ),
  }),
  inequalityBuild({
    questionId: `${P}-cw-9`,
    alignment: A3D,
    dok: 2,
    difficultyBand: 2,
    prompt: tex`Graph $y > x + 3$.`,
    source: ['y > x + 3'],
    constraints: [{ m: 1, b: 3, relation: '>' }],
    directionSteps: ['Build the boundary line.', 'Choose solid or dashed.', 'Shade the half-plane of solutions.'],
    hints: ['What are the slope and the y-intercept of y = x + 3?', 'Which symbols use a dashed line? Is (0, 0) above or below the boundary?', 'Plot (0, 3) and go up 1, right 1: > means a dashed line. Test (0, 0): 0 > 0 + 3 is false, so shade the side without (0, 0).'],
    scaffold: backUp('For y > x + 3, the point (0, 0) is…', ['not a solution', 'a solution'], 'not a solution'),
    solutionReview: review(
      'Dashed line, shaded above.',
      ['Boundary y = x + 3 through (0, 3) and (1, 4); > means dashed.', '0 > 0 + 3 is false, so shade the side without (0, 0): above.'],
      'dashed, above',
      'Shading the side with (0, 0) after the test said it was not a solution.',
    ),
  }),
  inequalityBuild({
    questionId: `${P}-cw-10`,
    alignment: A3D,
    dok: 2,
    difficultyBand: 2,
    prompt: tex`Graph $y \le -\frac{1}{3}x + 4$.`,
    source: ['y <= -(1/3)x + 4'],
    constraints: [{ m: -1 / 3, b: 4, relation: '<=' }],
    directionSteps: ['Build the boundary line.', 'Choose solid or dashed.', 'Shade the half-plane of solutions.'],
    hints: ['From the y-intercept, what does a slope of −1/3 tell you to do: up or down, and how far to the right?', 'Does ≤ include the line? Is (0, 0) a solution of y ≤ −(1/3)x + 4?', 'Plot (0, 4), then go down 1 and right 3. ≤ includes the line, so it is solid; 0 ≤ 4 is true, so shade the side with (0, 0).'],
    scaffold: backUp('A slope of −1/3 means…', ['down 1, right 3', 'down 3, right 1'], 'down 1, right 3'),
    solutionReview: review(
      'Solid line, shaded below.',
      ['Plot (0, 4), then down 1 and right 3 to (3, 3).', '≤ includes equality: solid.', '0 ≤ 4 is true, so shade the side with (0, 0): below.'],
      'solid, below',
      'Moving down 3 and right 1 for the slope −1/3.',
    ),
  }),
  inequalityBuild({
    questionId: `${P}-cw-11`,
    alignment: A3D,
    dok: 3,
    difficultyBand: 3,
    prompt: tex`Graph $2x - y < 4$. First rewrite it with y alone in the tool — watch what happens to the symbol — then graph it.`,
    source: ['2x - y < 4'],
    constraints: [{ A: 2, B: -1, C: -4, relation: '<' }],
    rewrite: true,
    directionSteps: ['Rewrite the inequality with y alone.', 'Build the boundary line.', 'Choose solid or dashed.', 'Shade the half-plane of solutions.'],
    hints: ['To get y alone, what do you do to each side first?', 'Subtract 2x from each side. Then you divide by −1: what happens to the symbol?', 'Subtracting 2x gives −y < −2x + 4. Divide each side by −1 and reverse the symbol, then check your side with (0, 0) in 2x − y < 4.'],
    scaffold: backUp('When you divide both sides of an inequality by −1, the symbol…', ['reverses', 'stays the same'], 'reverses'),
    solutionReview: review(
      'Rewrite, reverse, graph.',
      ['2x − y < 4 → −y < −2x + 4 → y > 2x − 4 (dividing by −1 reverses the symbol).', 'Dashed line through (0, −4) and (2, 0); shade above.', 'Check (0, 0): 2(0) − 0 < 4 is true, and (0, 0) is above the line.'],
      'y > 2x − 4: dashed, above',
      'Keeping < after dividing by −1, which shades the wrong half-plane.',
    ),
  }),
  {
    questionId: `${P}-cw-12`,
    ...A2H,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: 'Worked example — write a linear inequality for the graph. Write the boundary’s equation pieces, choose the symbol, and check with a test point.',
    graph: inequalityFigure([WORKED_EXAMPLE_KEY]),
    directionSteps: ['Find the slope of the boundary line.', 'Find its y-intercept.', 'Choose the symbol from the line style and the shaded side.', 'Write the inequality and check it with a test point.'],
    responses: [
      number('slope', 'Slope of the boundary line', '-3/2'),
      number('intercept', 'y-intercept', '-5'),
      choice('symbol', 'Solid line, shaded above: the symbol is', ['≥', '>', '≤', '<'], '≥'),
      graphInequality('inequality', 'The inequality', WORKED_EXAMPLE_KEY),
      choice('check', 'Test (0, 0): 0 ≥ −(3/2)(0) − 5 is…', [
        'true, and (0, 0) is in the shaded half-plane',
        'false, so (0, 0) is not in the shaded half-plane',
        'true, but (0, 0) is not in the shaded half-plane',
        'true, so the boundary line must be dashed',
      ], 'true, and (0, 0) is in the shaded half-plane'),
    ],
    hints: ['Which two points on the line sit exactly where grid lines cross? How much do y and x change between them?', 'The slope is the change in y divided by the change in x. Where does the line cross the y-axis?', 'Write y = mx + b with your slope and y-intercept. Solid means the line is included, and shaded above means y is greater.'],
    misconceptions: graphSlips('inequality', WORKED_EXAMPLE_KEY),
    scaffold: backUp('A solid boundary line means the points on the line are…', ['solutions', 'not solutions'], 'solutions'),
    guidedNotes: guidedNotes(['Writing an inequality from a graph', 'Write the boundary’s equation as you would for a line, then replace = with the symbol the line style and the shaded side call for. Test a point to check.']),
    solutionReview: review(
      'Equation of the line, then the symbol.',
      ['Slope = (−8 − (−5))/(2 − 0) = −3/2; the y-intercept is −5.', 'Solid and above: y ≥ −(3/2)x − 5.', 'Check (0, 0): 0 ≥ −5 is true, and (0, 0) is shaded.'],
      'y ≥ −(3/2)x − 5',
      'Using > for a solid line.',
    ),
  },
  {
    questionId: `${P}-cw-13`,
    ...A2H,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: 'Write a linear inequality for graphs a, b and c.',
    ...keyedGraphs(THREE_GRAPHS_KEYS, ['a', 'b', 'c']),
    directionSteps: ['Find each boundary line’s slope and y-intercept.', 'Choose each symbol from the line style and the shaded side.', 'Write each inequality.'],
    responses: [
      graphInequality('a', 'Graph a', THREE_GRAPHS_KEYS.a),
      graphInequality('b', 'Graph b', THREE_GRAPHS_KEYS.b),
      graphInequality('c', 'Graph c', THREE_GRAPHS_KEYS.c),
    ],
    hints: ['Where does each line cross the y-axis? Between two grid points on it, what is the rise over the run?', 'Is each line dashed or solid? Is the shaded side above or below the line?', 'Write each line as y = mx + b. Dashed is < or >, solid is ≤ or ≥, and a test point such as (0, 0) tells you the side.'],
    // Three boxes: every wrong symbol in one sentence, and the y-intercept's sign.
    misconceptions: ['a', 'b', 'c'].flatMap((id) => [symbolSlip(id, THREE_GRAPHS_KEYS[id]), slip(id, otherInterceptSign(THREE_GRAPHS_KEYS[id]), SLIP.intercept)]),
    scaffold: backUp('A dashed boundary uses…', ['< or >', '≤ or ≥'], '< or >'),
    solutionReview: review(
      'Line first, then the symbol.',
      ['a: slope 4, intercept 2; dashed; (0, 0) shaded and 0 < 2, so y < 4x + 2.', 'b: slope 1/2, intercept −3; solid, above: y ≥ (1/2)x − 3.', 'c: slope 3/4, intercept −2; dashed, below: y < (3/4)x − 2.'],
      'y < 4x + 2; y ≥ (1/2)x − 3; y < (3/4)x − 2',
      'For a steep line, reading "to the right" as "above": test (0, 0) to be sure of the side.',
    ),
  },
  {
    questionId: `${P}-cw-14`,
    ...A2H,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: 'Activity 4.3 — Interpreting Graphs of Linear Inequalities. César has a $50 prepaid phone card. The table shows combinations of minutes for calls within the United States, x, and calls to Mexico, y, that use up the whole card. Write an inequality for the minutes he can use.',
    table: {
      columns: [{ key: 'us', label: 'Calls within the United States, x (minutes)' }, { key: 'mx', label: 'Calls to Mexico, y (minutes)' }],
      rows: [{ us: '0', mx: '100' }, { us: '50', mx: '80' }, { us: '140', mx: '44' }, { us: '200', mx: '20' }, { us: '240', mx: '4' }],
    },
    directionSteps: ['Find the rate of change from the table.', 'Find the y-intercept.', 'Write the inequality.', 'Explain the symbol.'],
    responses: [
      number('rate', 'Rate of change (Mexico minutes per United States minute)', '-0.4'),
      number('intercept', 'y-intercept', '100'),
      inequality('inequality', 'Inequality for the minutes César can use', CESAR_KEY),
      choice('why', 'Why that symbol?', [
        'He can use the whole card or less, so the combinations are on or below the line',
        'He must use more than the whole card, so the combinations are above the line',
        'He must use exactly the whole card, so the combinations are only on the line',
        'He can use less than the card but not all of it, so they are only below the line',
      ], 'He can use the whole card or less, so the combinations are on or below the line'),
    ],
    hints: ['From one row to the next, how much do the Mexico minutes change? How much do the United States minutes change?', 'The rate of change is the change in y divided by the change in x. Which row has x = 0?', 'Write y = (rate of change)x + (y-intercept). He cannot spend more than the card holds, so the combinations are on or below the line.'],
    misconceptions: graphSlips('inequality', CESAR_KEY, {
      turnedMessage: 'The symbol points the wrong way: can César spend more than the card holds?',
      lineMessage: 'Using up the whole card is allowed, so the points on the line count: your symbol should include them.',
      interceptMessage: 'Check the sign of the y-intercept: with no calls in the United States, how many minutes to Mexico does the card buy?',
    }),
    scaffold: backUp('The card is worth $50, so he can spend…', ['at most $50', 'at least $50'], 'at most $50'),
    solutionReview: review(
      'A line from the table, then "at most".',
      ['(80 − 100)/(50 − 0) = −0.4, and the y-intercept is 100.', 'The card limits him to the line or below: y ≤ −0.4x + 100.'],
      'y ≤ −0.4x + 100',
      'Using ≥: combinations above the line cost more than $50.',
    ),
  },
  inequalityBuild({
    questionId: `${P}-cw-15`,
    alignment: A2H,
    dok: 2,
    difficultyBand: 3,
    prompt: 'Graph César’s inequality, written in standard form. Each minute within the United States costs $0.20 and each minute to Mexico costs $0.50 (250 United States minutes, or 100 Mexico minutes, use the whole $50). Enter the model in the tool — coefficients, symbol and the $50 — then build the boundary, choose solid or dashed, and shade. Then test the point (100, 80).',
    modeling: { variables: [{ symbol: 'x', label: 'minutes within the United States' }, { symbol: 'y', label: 'minutes to Mexico' }] },
    constraints: [{ A: 0.2, B: 0.5, C: -50, relation: '<=' }],
    testPoint: { x: 100, y: 80 },
    graph: { xMin: 0, xMax: 260, yMin: 0, yMax: 110 },
    directionSteps: ['Enter the model in the tool.', 'Build the boundary line.', 'Choose solid or dashed.', 'Shade the half-plane of combinations he can afford.', 'Test the point.'],
    hints: ['What do x minutes within the United States cost at $0.20 a minute? And y minutes to Mexico at $0.50?', 'Their total cost can be at most $50. Where does the boundary cross each axis? The prompt says how many minutes of each kind use the whole card.', 'The boundary crosses the axes where the whole $50 buys one kind of call: 250 minutes, or 100 minutes. Shade the side that costs at most $50, and substitute (100, 80) to check.'],
    scaffold: backUp('The cost of x minutes at $0.20 per minute is…', ['0.2x', 'x + 0.2'], '0.2x'),
    solutionReview: review(
      'Cost model, then graph.',
      ['0.2x + 0.5y ≤ 50: the boundary passes through (250, 0) and (0, 100) and is solid.', 'Shade below; (100, 80) costs 20 + 40 = $60, so it is not in the shaded region.'],
      '0.2x + 0.5y ≤ 50: solid, below',
      'Shading above: those combinations cost more than the card holds.',
    ),
  }),
  {
    questionId: `${P}-cw-16`,
    ...A3D,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 3,
    prompt: 'Interpret César’s graph. Use 0.2x + 0.5y ≤ 50, where x is minutes within the United States and y is minutes to Mexico. Answer each question and explain what each part of his graph means.',
    directionSteps: ['Find the most United States minutes left after the Mexico call.', 'Decide whether each pair of calls fits on the card.', 'Explain the meaning of points on, above and below the line.'],
    responses: [
      number('aunt', 'He talks to his aunt in Mexico for 70 minutes. The most minutes he can then talk to his cousin in New York', '75'),
      choice('uncle', '100 minutes to San Antonio and 80 minutes to Juárez, Mexico?', ['No — that costs $60, more than the card', 'Yes — 180 minutes at $0.20 cost only $36', 'Yes — 180 minutes is less than 250', 'No — calls to Mexico are not allowed'], 'No — that costs $60, more than the card'),
      choice('brother', '55 minutes to Mexico City and 90 minutes to Denver?', [
        'Yes — that costs $45.50, which is at most $50',
        'No — that costs $56, which is more than $50',
        'No — (90, 55) is above the line, so it costs too much',
        'Yes — 145 minutes is fewer than 250, so it fits',
      ], 'Yes — that costs $45.50, which is at most $50'),
      choice('on', 'Points on the line mean…', ['combinations that use exactly the whole $50', 'combinations that cost more than he can afford', 'combinations that leave money on the card', 'only calls to Mexico'], 'combinations that use exactly the whole $50'),
      choice('above', 'Points above the line mean…', ['combinations that cost more than $50', 'combinations that use exactly $50', 'combinations that leave money on the card', 'free calls'], 'combinations that cost more than $50'),
      choice('belowLine', 'Points below the line (in the first quadrant) mean…', ['combinations that leave money on the card', 'combinations that cost more than the $50 card', 'combinations that use exactly $50', 'negative minutes'], 'combinations that leave money on the card'),
    ],
    hints: ['How much of the $50 do 70 minutes to Mexico use? How many $0.20 minutes does the rest buy?', 'Find the total cost of each pair of calls. Is it more than $50, or at most $50?', '70 minutes to Mexico cost $35, which leaves $15 at $0.20 a minute. On the line the cost is exactly $50; above it, more; below it, less.'],
    scaffold: backUp('70 minutes to Mexico costs…', ['$35', '$14'], '$35'),
    solutionReview: review(
      'Cost decides: on the line $50, above more, below less.',
      ['0.5(70) = 35, leaving $15: 15 ÷ 0.2 = 75 minutes.', '0.2(100) + 0.5(80) = 60 > 50: no. 0.2(90) + 0.5(55) = 45.5 ≤ 50: yes.', 'On the line: exactly $50. Above: more than $50. Below: money left over.'],
      '75 minutes; no; yes',
      'Comparing total minutes with 250: the two kinds of minutes cost different amounts.',
    ),
  },
  {
    questionId: `${P}-cw-17`,
    ...A3D,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: 'Talk the Talk — There’s a Fine Line. Use the line x + y = 12. Describe how to graph each inequality. Then use the line x + y = 0: write the inequality whose solution set each description gives.',
    directionSteps: ['Describe the graph of each inequality with the line x + y = 12.', 'Write the inequality for each solution set with the line x + y = 0.'],
    responses: [
      // Each option names the line, the side and the test that decides it;
      // a wrong one gets one of the three wrong (F-LONGEST-IS-RIGHT).
      choice('lt12', 'x + y < 12', [
        'dashed line, shade below (test (0, 0): 0 < 12 is true)',
        'solid line, shade below (test (0, 0): 0 < 12 is true)',
        'dashed line, shade above (test (0, 0): 0 < 12 is true)',
        'dashed line, shade above (test (0, 0): 0 < 12 is false)',
      ], 'dashed line, shade below (test (0, 0): 0 < 12 is true)'),
      choice('le12', 'x + y ≤ 12', [
        'solid line, shade below (test (0, 0): 0 ≤ 12 is true)',
        'dashed line, shade below (test (0, 0): 0 ≤ 12 is true)',
        'solid line, shade above (test (0, 0): 0 ≤ 12 is true)',
        'solid line, shade above (test (0, 0): 0 ≤ 12 is false)',
      ], 'solid line, shade below (test (0, 0): 0 ≤ 12 is true)'),
      choice('gt12', 'x + y > 12', [
        'dashed line, shade above (test (0, 0): 0 > 12 is false)',
        'solid line, shade above (test (0, 0): 0 > 12 is false)',
        'dashed line, shade below (test (0, 0): 0 > 12 is false)',
        'dashed line, shade below (test (0, 0): 0 > 12 is true)',
      ], 'dashed line, shade above (test (0, 0): 0 > 12 is false)'),
      graphInequality('ge0', 'The line x + y = 0 and the half-plane above it', 'x + y >= 0'),
      graphInequality('lt0', 'The half-plane below the line x + y = 0, without the line', 'x + y < 0'),
      graphInequality('le0', 'The line x + y = 0 and the half-plane below it', 'x + y <= 0'),
    ],
    hints: ['Which symbols make the line solid, and which make it dashed? Which side does a test point tell you to shade?', 'The line x + y = 0 passes through (0, 0), so (0, 0) cannot tell you a side. Which other point could you test?', 'Test (1, 1): x + y = 2, which is greater than 0, so (1, 1) is above the line. Include the line with ≤ or ≥, and leave it out with < or >.'],
    // The labels print the line, so only the symbol can slip: its side, or the line kept or left out.
    misconceptions: [
      slip('ge0', turned('x + y >= 0'), 'The symbol points the wrong way. Test a point above the line, such as (1, 1): it should make your inequality true.'),
      slip('ge0', restyled('x + y >= 0'), 'This set includes the line, so your symbol should include it too.'),
      slip('lt0', turned('x + y < 0'), 'The symbol points the wrong way. Test a point below the line, such as (−1, −1): it should make your inequality true.'),
      slip('lt0', restyled('x + y < 0'), 'This set leaves the line out, so your symbol should leave it out too.'),
      slip('le0', turned('x + y <= 0'), 'The symbol points the wrong way. Test a point below the line, such as (−1, −1): it should make your inequality true.'),
      slip('le0', restyled('x + y <= 0'), 'This set includes the line, so your symbol should include it too.'),
    ],
    scaffold: backUp('x + y = 0 passes through (0, 0), so to test a side use…', ['another point, such as (1, 1)', '(0, 0)'], 'another point, such as (1, 1)'),
    solutionReview: review(
      'Same line, different symbols.',
      ['x + y < 12: dashed, below; x + y ≤ 12: solid, below; x + y > 12: dashed, above.', 'With the line x + y = 0: the line and above is x + y ≥ 0; below without the line is x + y < 0; the line and below is x + y ≤ 0.'],
      null,
      'Testing (0, 0) for x + y ≥ 0: the origin is on the line, so it cannot tell you which side to shade.',
    ),
  },
];

/* ---------------------------------------------------------- Practice */

const practiceRegular = (P) => [
  inequalityBuild({
    questionId: `${P}-p-1`,
    alignment: A3D,
    dok: 2,
    difficultyBand: 2,
    prompt: tex`Graph $y > {{m|coef}}x {{b|signed}}$. Then test the point (0, 0).`,
    source: ['y > {{m|coef}}x {{b|signed}}'],
    constraints: [{ m: '{{m}}', b: '{{b}}', relation: '>' }],
    testPoint: { x: 0, y: 0 },
    directionSteps: ['Build the boundary line.', 'Choose solid or dashed.', 'Shade the half-plane of solutions.', 'Test the point.'],
    hints: ['Where does the boundary cross the y-axis, and which way does the slope take you from there?', 'Does > include the points on the line? So is the line solid or dashed?', 'Plot the y-intercept, then use the slope as rise over run. Draw a dashed line, and substitute (0, 0) to decide the side.'],
    scaffold: backUp('For y > mx + b, the line is…', ['dashed', 'solid'], 'dashed'),
    solutionReview: review('Dashed line, shaded above.', ['Boundary y = {{m|coef}}x {{b|signed}}: plot (0, {{b}}) and (1, {{mb}}).', '> is strict: dashed. Solved for y with >, shade above.'], 'dashed, above', 'Using the slope’s sign to pick the side.'),
    generator: { parameters: { m: { type: 'int', min: -4, max: 4, exclude: [0] }, b: { type: 'int', min: -6, max: 6, exclude: [0] } }, derived: { mb: 'm + b' } },
    questionFamily: { scope: 'assignment' },
  }),
  inequalityBuild({
    questionId: `${P}-p-2`,
    alignment: A3D,
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Graph $y \le {{sg|coef}}\frac{ {{pa}} }{ {{q}} }x {{b|signed}}$.`,
    source: ['y <= {{sg|coef}}({{pa}}/{{q}})x {{b|signed}}'],
    constraints: [{ m: '{{m}}', b: '{{b}}', relation: '<=' }],
    directionSteps: ['Build the boundary line.', 'Choose solid or dashed.', 'Shade the half-plane of solutions.'],
    hints: ['In a fraction slope, which number is the rise and which is the run?', 'Does ≤ include the line? With y alone, does ≤ shade above or below?', 'From the y-intercept, rise by the numerator and run by the denominator. ≤ includes the line, so it is solid, and it shades below.'],
    scaffold: backUp('A slope of p/q means…', ['rise p, run q', 'rise q, run p'], 'rise p, run q'),
    solutionReview: review('Solid line, shaded below.', ['Plot (0, {{b}}), then use a rise of {{p}} and a run of {{q}} to reach ({{q}}, {{bp}}).', '≤ includes equality: solid; shade below.'], 'solid, below', 'Swapping the rise and the run.'),
    generator: { parameters: { pa: { type: 'int', min: 1, max: 3 }, sg: { type: 'choice', values: [-1, 1] }, q: { type: 'int', min: 2, max: 4 }, b: { type: 'int', min: -5, max: 5, exclude: [0] } }, derived: { p: 'sg*pa', m: 'sg*pa/q', bp: 'b + sg*pa' }, constraints: ['gcd(pa, q) == 1'] },
    questionFamily: { scope: 'assignment' },
  }),
  inequalityBuild({
    questionId: `${P}-p-3`,
    alignment: A3D,
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Graph $ {{A}}x - y < {{C}} $. Rewrite it with y alone in the tool first.`,
    source: ['{{A}}x - y < {{C}}'],
    constraints: [{ A: '{{A}}', B: -1, C: '{{nC}}', relation: '<' }],
    rewrite: true,
    directionSteps: ['Rewrite the inequality with y alone.', 'Build the boundary line.', 'Choose solid or dashed.', 'Shade the half-plane of solutions.'],
    hints: ['To get y alone, what do you subtract from both sides first? What is left in front of y?', 'Subtract the x-term from both sides, then divide by −1: dividing by a negative number reverses the symbol.'],
    scaffold: backUp('−y < 6 becomes…', ['y > −6', 'y < −6'], 'y > −6'),
    solutionReview: review('Rewrite, reverse, graph.', ['{{A}}x − y < {{C}} → −y < −{{A}}x {{C|signed}} → y > {{A}}x {{nC|signed}} (dividing by −1 reverses the symbol).', 'Dashed line, shaded above.'], 'y > {{A}}x {{nC|signed}}', 'Forgetting to reverse the symbol.'),
    generator: { parameters: { A: { type: 'int', min: 2, max: 5 }, C: { type: 'int', min: -6, max: 6, exclude: [0] } }, derived: { nC: '0 - C' } },
    questionFamily: { scope: 'assignment' },
  }),
  {
    questionId: `${P}-p-4`,
    ...A2H,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: 'A club sells muffins for ${{p}} each and smoothies for ${{q}} each. It needs to raise at least ${{T}}. Let x be the number of muffins and y the number of smoothies. Write the inequality, then check one plan: {{x0}} muffins and {{y0}} smoothies.',
    directionSteps: ['Write the inequality.', 'Find the money the plan raises.', 'Find how much more than the goal it raises.'],
    responses: [
      inequality('model', 'Inequality', '{{p}}x + {{q}}y >= {{T}}'),
      number('money', 'Money raised by {{x0}} muffins and {{y0}} smoothies ($)', '{{R}}'),
      number('extra', 'How many dollars over the goal is that?', '{{E}}'),
    ],
    hints: ['How much money do x muffins bring in? And y smoothies? Does "at least" include the goal itself?', 'Price times count for each, added, is at least the goal, so the symbol is ≥. For the plan, multiply each count by its price and add.'],
    misconceptions: [
      slip('model', turned('{{p}}x + {{q}}y >= {{T}}'), '"At least" means the club raises the goal or more.'),
      slip('model', restyled('{{p}}x + {{q}}y >= {{T}}'), '"At least" includes raising exactly the goal.'),
    ],
    scaffold: backUp('"At least" means…', ['≥', '≤'], '≥'),
    solutionReview: review('Price times count, then "at least".', ['{{p}}x + {{q}}y ≥ {{T}}.', '{{p}}({{x0}}) + {{q}}({{y0}}) = {{R}}, which is {{E}} over the goal.'], '{{p}}x + {{q}}y ≥ {{T}}', 'Using ≤ for "at least".'),
    generator: {
      parameters: { p: { type: 'int', min: 2, max: 4 }, q: { type: 'int', min: 5, max: 7 }, k: { type: 'int', min: 20, max: 40, step: 5 }, x0: { type: 'int', min: 20, max: 40 }, y0: { type: 'int', min: 10, max: 30 } },
      derived: { T: 'k*10', R: 'p*x0 + q*y0', E: 'p*x0 + q*y0 - k*10' },
      constraints: ['p*x0 + q*y0 > k*10'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: `${P}-p-5`,
    ...A3D,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: tex`Which point is a solution of $ {{A}}x + {{B}}y \le {{C}} $? Substitute each point.`,
    directionSteps: ['Substitute the first point.', 'Substitute the second point.', 'Decide which point makes the inequality true.'],
    responses: [
      number('v1', 'At ({{x1}}, {{y1}}): {{A}}x + {{B}}y =', '{{v1}}'),
      number('v2', 'At ({{x2}}, {{y2}}): {{A}}x + {{B}}y =', '{{v2}}'),
      computedChoice('which', 'Which point is a solution?', ['({{x1}}, {{y1}})', '({{x2}}, {{y2}})', 'Both points', 'Neither point'], '({{xa}}, {{ya}})'),
    ],
    hints: ['What is the value of the left side at each point? Is it at most the constant?', 'Substitute each point’s x and y into the left side. ≤ is true when that value is less than or equal to the constant.'],
    scaffold: backUp('8 ≤ 8 is…', ['true', 'false'], 'true'),
    solutionReview: review('Substitute and compare.', ['({{x1}}, {{y1}}) gives {{v1}}; ({{x2}}, {{y2}}) gives {{v2}}.', 'Only ({{xa}}, {{ya}}) is at most {{C}}.'], '({{xa}}, {{ya}})', 'Reversing the comparison.'),
    generator: {
      parameters: { A: { type: 'int', min: 2, max: 5 }, B: { type: 'int', min: 2, max: 5 }, x1: { type: 'int', min: -4, max: 4 }, x2: { type: 'int', min: -4, max: 4 }, y0: { type: 'int', min: -3, max: 3 }, s: { type: 'int', min: 0, max: 1 }, d: { type: 'int', min: 1, max: 4 } },
      derived: {
        y1: 'y0', y2: 'y0 + 1',
        v1: 'A*x1 + B*y0', v2: 'A*x2 + B*(y0 + 1)',
        C: 's*(A*x1 + B*y0 + d) + (1 - s)*(A*x2 + B*(y0 + 1) + d)',
        xa: 's*x1 + (1 - s)*x2', ya: 's*y0 + (1 - s)*(y0 + 1)',
      },
      constraints: ['x1 != x2', 's*(A*x2 + B*(y0 + 1)) + (1 - s)*(A*x1 + B*y0) > s*(A*x1 + B*y0 + d) + (1 - s)*(A*x2 + B*(y0 + 1) + d)'],
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: `${P}-p-6`,
    ...A2H,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: 'Vertical and horizontal boundaries. Write an inequality for graphs a and b.',
    ...keyedGraphs(VERTICAL_HORIZONTAL_KEYS, ['a', 'b']),
    directionSteps: ['Use the line and its style to choose the symbol.', 'Write each inequality.'],
    responses: [graphInequality('a', 'Graph a', VERTICAL_HORIZONTAL_KEYS.a), graphInequality('b', 'Graph b', VERTICAL_HORIZONTAL_KEYS.b)],
    hints: ['Which variable does a vertical line fix, x or y? And a horizontal line? Is each line dashed or solid?', 'A vertical line is x = c, and to its left x is less than c. A horizontal line is y = c, and above it y is greater than c.'],
    misconceptions: [
      ...graphSlips('a', VERTICAL_HORIZONTAL_KEYS.a, { interceptMessage: 'Check the sign: is the line to the left or the right of the y-axis?' }),
      ...graphSlips('b', VERTICAL_HORIZONTAL_KEYS.b, { interceptMessage: 'Check the sign: is the line above or below the x-axis?' }),
    ],
    scaffold: backUp('Points to the left of x = 3 have x-coordinates…', ['less than 3', 'greater than 3'], 'less than 3'),
    solutionReview: review('Vertical: compare x. Horizontal: compare y.', ['Left of the dashed line x = 3: x < 3.', 'Above the solid line y = −2: y ≥ −2.'], 'x < 3; y ≥ −2', 'Writing y < 3 for a vertical boundary.'),
  },
  inequalityBuild({
    questionId: `${P}-p-7`,
    alignment: A3D,
    dok: 2,
    difficultyBand: 2,
    prompt: tex`Graph $x \ge -2$ in the coordinate plane.`,
    source: ['x >= -2'],
    constraints: [{ orientation: 'vertical', x: -2, relation: '>=' }],
    directionSteps: ['Build the vertical boundary line.', 'Choose solid or dashed.', 'Shade the half-plane of solutions.'],
    hints: ['Which points have x = −2? What kind of line do they make?', 'Does ≥ include the line? Which side has x-coordinates greater than −2?', 'x = −2 is a vertical line: use the vertical-line method. ≥ includes it, so it is solid; shade to the right, where x is greater.'],
    scaffold: backUp('The graph of x = −2 in the plane is…', ['a vertical line', 'a horizontal line'], 'a vertical line'),
    solutionReview: review('Solid vertical line, shaded right.', ['Boundary x = −2 (vertical), solid because ≥.', 'Shade to the right, where x ≥ −2.'], 'solid x = −2, shaded right', 'Drawing a horizontal line y = −2.'),
  }),
  {
    questionId: `${P}-p-8`,
    ...A2H,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: 'Write an inequality for each statement. Let x and y be the two numbers. (a) The sum of two numbers is at most 12. (b) Twice the first number minus the second number is more than 4.',
    directionSteps: ['Translate the first statement.', 'Translate the second statement.'],
    responses: [inequality('a', '(a)', 'x + y <= 12'), inequality('b', '(b)', '2x - y > 4')],
    hints: ['Which phrase includes the number itself: "at most" or "more than"? Which expression is twice the first number minus the second?', '"At most" means ≤ and "more than" means >. "Twice the first" is 2x, and "minus the second" subtracts y.'],
    misconceptions: [
      slip('a', turned('x + y <= 12'), '"At most 12" means 12 or less.'),
      slip('a', restyled('x + y <= 12'), '"At most 12" includes 12 itself.'),
      slip('b', turned('2x - y > 4'), '"More than 4" means greater than 4.'),
      slip('b', restyled('2x - y > 4'), '"More than 4" leaves 4 itself out.'),
      // The item's own common error: the difference the other way round.
      slip('b', 'y - 2x > 4', 'Check the order: start from twice the first number, then subtract the second.'),
    ],
    scaffold: backUp('"At most 12" means…', ['≤ 12', '≥ 12'], '≤ 12'),
    solutionReview: review('Words to symbols.', ['(a) x + y ≤ 12. (b) 2x − y > 4.'], 'x + y ≤ 12; 2x − y > 4', 'Writing y − 2x for "twice the first minus the second".'),
  },
  inequalityBuild({
    questionId: `${P}-p-9`,
    alignment: A2H,
    dok: 2,
    difficultyBand: 3,
    prompt: 'A food truck sells tacos for $3 and burritos for $8. The owner wants to take in at least $240 today. Let x be the number of tacos and y the number of burritos. Enter the model in the tool, graph it, and test the point (40, 20).',
    modeling: { variables: [{ symbol: 'x', label: 'tacos' }, { symbol: 'y', label: 'burritos' }] },
    constraints: [{ A: 3, B: 8, C: -240, relation: '>=' }],
    testPoint: { x: 40, y: 20 },
    graph: { xMin: 0, xMax: 90, yMin: 0, yMax: 35 },
    directionSteps: ['Enter the model in the tool.', 'Build the boundary line.', 'Choose solid or dashed.', 'Shade the half-plane that meets the goal.', 'Test the point.'],
    // Hint 2 used to give the boundary's points, (80, 0) and (0, 30): the whole
    // boundary step (F-HINT-GIVES-STEP).
    hints: [
      'How much money do x tacos bring in at $3 each? And y burritos at $8? Does "at least" include $240?',
      'Taco money plus burrito money is at least $240. How many tacos alone make $240? How many burritos alone?',
      'Those two numbers give the points where the boundary crosses the axes. Then substitute (40, 20): is 3(40) + 8(20) at least 240?',
    ],
    scaffold: backUp('Money from x tacos at $3 each is…', ['3x', 'x + 3'], '3x'),
    solutionReview: review('Model, graph, test.', ['3x + 8y ≥ 240; boundary through (80, 0) and (0, 30), solid.', 'Shade above; (40, 20) gives 280 ≥ 240, so it meets the goal.'], '3x + 8y ≥ 240', 'Shading below the line, where the money is less than $240.'),
  }),
  {
    questionId: `${P}-p-10`,
    ...A3D,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 3,
    prompt: 'Error analysis. Marcus graphed y < −2x + 1, and his graph is shown. Write the inequality his graph actually shows, identify his error, and check his shading with the point (0, 0).',
    graph: inequalityFigure([MARCUS_GRAPH_KEY]),
    directionSteps: ['Write the inequality Marcus’s graph shows.', 'Decide which part of the graph is wrong.', 'Check the shading with the test point.'],
    responses: [
      graphInequality('graphed', 'The inequality Marcus’s graph shows', MARCUS_GRAPH_KEY),
      choice('error', 'Marcus’s error:', [
        'The line should be dashed, because < does not include the boundary',
        'The shading should be above the line, because the slope is negative',
        'The slope should be 2, because the line falls from left to right',
        'There is no error, because < includes the points on the boundary',
      ], 'The line should be dashed, because < does not include the boundary'),
      choice('test', 'Test (0, 0): 0 < −2(0) + 1 is…', [
        'true, so the shading below (with the origin) is correct',
        'false, so the shading below (with the origin) is wrong',
        'true, so the solid line and the shading are both correct',
        'not useful here, because the origin is on the boundary',
      ], 'true, so the shading below (with the origin) is correct'),
    ],
    hints: ['Is Marcus’s line solid or dashed? Which side did he shade?', 'Which symbols go with a solid line? Is that the < he was graphing?', 'A solid line shaded below shows ≤, but < needs a dashed line. Check his shading with (0, 0) in y < −2x + 1.'],
    misconceptions: graphSlips('graphed', MARCUS_GRAPH_KEY, { lineMessage: 'That is the inequality Marcus meant to graph. His line is solid, so it shows a symbol that includes the line.' }),
    scaffold: backUp('For <, the boundary is…', ['dashed', 'solid'], 'dashed'),
    solutionReview: review('Check style, then side.', ['A solid line shaded below shows y ≤ −2x + 1, which includes the line.', '< is strict, so the boundary must be dashed.', '(0, 0): 0 < 1 is true and the origin is below the line, so the shading is right.'], 'y ≤ −2x + 1; the line should be dashed', 'Fixing the shading too: it was already correct.'),
  },
  {
    questionId: `${P}-p-11`,
    ...A3D,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: 'Which points are solutions of 4x − 2y ≤ 8? Find 4x − 2y at each point, then decide.',
    directionSteps: ['Find 4x − 2y at each point.', 'Decide which point is not a solution.', 'Decide which point is on the boundary line.'],
    responses: [
      number('v1', '(0, 0): 4x − 2y =', '0'),
      number('v2', '(3, 1): 4x − 2y =', '10'),
      number('v3', '(2, 0): 4x − 2y =', '8'),
      number('v4', '(5, 7): 4x − 2y =', '6'),
      choice('notSolution', 'Which point is NOT a solution?', ['(0, 0)', '(3, 1)', '(2, 0)', '(5, 7)'], '(3, 1)'),
      choice('onBoundary', 'Which point is on the boundary line?', ['(0, 0)', '(3, 1)', '(2, 0)', '(5, 7)'], '(2, 0)'),
    ],
    hints: ['What is the value of 4x − 2y at each point? How does it compare with the right side?', 'Substitute x and y and compare the value with the right side. A point where the two sides are equal is on the solid boundary, and ≤ includes it.'],
    scaffold: backUp('At (1, 1), 4x − 2y equals…', ['2', '4'], '2'),
    solutionReview: review('Substitute and compare with 8.', ['(0, 0): 0 ≤ 8 yes. (3, 1): 10 ≤ 8 no. (2, 0): 8 ≤ 8 yes, on the line. (5, 7): 6 ≤ 8 yes.'], '0, 10, 8, 6; (3, 1) is not a solution; (2, 0) is on the line', 'Calling (2, 0) not a solution: ≤ includes the boundary.'),
  },
  {
    questionId: `${P}-p-12`,
    ...A2H,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 3,
    prompt: 'Write the inequality the graph shows. Find the slope of its boundary line first.',
    graph: inequalityFigure([NOT_THE_ORIGIN_KEY]),
    directionSteps: ['Find the boundary line.', 'Use a test point to choose the side.', 'Write the inequality.'],
    responses: [
      number('slope', 'Slope', '-2'),
      graphInequality('inequality', 'Inequality', NOT_THE_ORIGIN_KEY),
    ],
    hints: ['Which two points on the line sit where grid lines cross? What are the rise and the run between them?', 'Where does the line cross the y-axis? Is (0, 0) in the shaded region, and so is the inequality true or false there?', 'Write y = mx + b for the line. (0, 0) is not shaded, so choose the symbol that makes the inequality false at (0, 0); solid means ≤ or ≥.'],
    misconceptions: graphSlips('inequality', NOT_THE_ORIGIN_KEY, { turnedMessage: 'The symbol points the wrong way: (0, 0) is not shaded, so it should make your inequality false.' }),
    scaffold: backUp('Is 0 ≤ −2(0) + 4 true?', ['yes', 'no'], 'yes'),
    solutionReview: review('Line, then the side without the origin.', ['Slope −2, y-intercept 4: y = −2x + 4.', '0 ≤ 4 is true, but (0, 0) is not shaded, so the symbol is ≥: y ≥ −2x + 4.'], 'y ≥ −2x + 4', 'Choosing ≤ because the origin is "below": the origin must be excluded.'),
  },
];

const practiceHonors = (P) => [
  ...practiceRegular(P).filter((question) => !['-p-1', '-p-5'].some((suffix) => question.questionId.endsWith(suffix))),
  inequalityBuild({
    questionId: `${P}-p-13`,
    alignment: A3D,
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Graph $ {{A|coef}}x - {{b}}y \ge {{C}} $. Rewrite it with y alone in the tool first.`,
    source: ['{{A|coef}}x - {{b}}y >= {{C}}'],
    constraints: [{ A: '{{A}}', B: '{{nb}}', C: '{{nC}}', relation: '>=' }],
    rewrite: true,
    testPoint: { x: 0, y: 0 },
    directionSteps: ['Rewrite the inequality with y alone.', 'Build the boundary line.', 'Choose solid or dashed.', 'Shade the half-plane of solutions.', 'Test the point.'],
    hints: ['To get y alone, what do you subtract from both sides first, and what do you divide by?', 'The coefficient of y is negative. What happens to the symbol when you divide both sides by a negative number?', 'Subtract the x-term from both sides, then divide by the coefficient of y and reverse the symbol. Use the test point to check your side.'],
    scaffold: backUp('Dividing both sides of −3y ≥ 6 by −3 gives…', ['y ≤ −2', 'y ≥ −2'], 'y ≤ −2'),
    solutionReview: review(
      'Rewrite, reverse, graph.',
      ['{{A|coef}}x − {{b}}y ≥ {{C}} → −{{b}}y ≥ −{{A|coef}}x {{C|signed}} → y ≤ ({{A}}/{{b}})x {{k|signed}} (dividing by −{{b}} reverses the symbol).', 'Solid line, shaded below; (0, 0) checks the side.'],
      'y ≤ ({{A}}/{{b}})x {{k|signed}}',
      'Dividing by −{{b}} without reversing the symbol.',
    ),
    generator: { parameters: { A: { type: 'int', min: 1, max: 4 }, b: { type: 'int', min: 2, max: 4 }, k: { type: 'int', min: -3, max: 3, exclude: [0] } }, derived: { nb: '0 - b', C: '0 - b*k', nC: 'b*k' }, constraints: ['gcd(A, b) == 1'] },
    questionFamily: { scope: 'assignment' },
  }),
  {
    questionId: `${P}-p-14`,
    ...A3D,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: 'Honors extension — a parameter. For which values of k is the point (2, 3) a solution of y > kx − 1? Then decide what happens when k equals the boundary value, and justify.',
    directionSteps: ['Substitute the point.', 'Solve for k.', 'Decide what happens at the boundary value and justify.'],
    responses: [
      inequality('k', 'Values of k', 'k < 2'),
      choice('boundary', 'When k = 2, the point (2, 3) is…', ['on the dashed boundary, so it is not a solution', 'a solution', 'below the line', 'above the line'], 'on the dashed boundary, so it is not a solution'),
    ],
    // The box takes 3 > 2k − 1 as k < 2 unsolved, so only the last hint writes it.
    hints: ['What do you get when you put x = 2 and y = 3 into y > kx − 1?', 'Solve the inequality you get for k, as you would an equation. Do you multiply or divide by a negative number on the way?', 'Substituting gives 3 > 2k − 1, so 4 > 2k. At the boundary value the two sides are equal, and > leaves that value out.'],
    misconceptions: [
      slip('k', turned('k < 2'), 'The symbol points the wrong way: try k = 0, and check whether (2, 3) is then a solution.'),
      slip('k', restyled('k < 2'), 'At k = 2 the point is on the boundary, and > leaves the boundary out.'),
    ],
    // Not "3 > 2k − 1 becomes… 4 > 2k": the k box takes 4 > 2k as its answer.
    scaffold: backUp('To find the values of k, substitute the point (2, 3) for…', ['x and y', 'k and y'], 'x and y'),
    solutionReview: review('Substitute, then solve for the parameter.', ['3 > 2k − 1 → 4 > 2k → k < 2.', 'When k = 2, 3 = 2(2) − 1: the point is on the boundary, which > leaves out.'], 'k < 2', 'Including k = 2: the boundary of a strict inequality is not part of the solution.'),
  },
  {
    questionId: `${P}-p-15`,
    ...A2H,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: 'Honors extension — a boundary from two points. The boundary line passes through (−2, 5) and (4, −1), it is solid, and the shaded half-plane contains the origin. Write the inequality.',
    directionSteps: ['Find the slope.', 'Find the y-intercept.', 'Use the origin to choose the symbol.', 'Write the inequality.'],
    responses: [
      number('slope', 'Slope', '-1'),
      number('intercept', 'y-intercept', '3'),
      graphInequality('inequality', 'Inequality', TWO_POINTS_KEY),
    ],
    hints: ['How much does y change between the two given points? How much does x change?', 'The slope is the change in y over the change in x. Which number b makes y = mx + b true at one of the two points?', 'Substitute one point and the slope into y = mx + b and solve for b. The line is solid and the origin is shaded: choose the symbol that is true at (0, 0).'],
    misconceptions: graphSlips('inequality', TWO_POINTS_KEY, {
      turnedMessage: 'The symbol points the wrong way: the origin is shaded, so it should make your inequality true.',
      interceptMessage: 'Check the sign of b: substitute one of the two points and the slope into y = mx + b again.',
    }),
    // Not "The slope … is −1": that is the slope box's own answer.
    scaffold: backUp('From (−2, 5) to (4, −1), the change in y is…', ['−6', '6'], '−6'),
    solutionReview: review('Line from two points, then the origin’s side.', ['Slope −6/6 = −1; 5 = −1(−2) + b gives b = 3.', '0 ≤ 3 is true, the line is solid: y ≤ −x + 3.'], 'y ≤ −x + 3', 'Using < for a solid boundary.'),
  },
  {
    questionId: `${P}-p-16`,
    ...A2H,
    studentActions: ['multipleResponses'],
    dok: 4,
    difficultyBand: 5,
    prompt: 'Honors extension — reason from the description. A linear inequality has boundary line 3x − 4y = 12. The boundary is not part of the solution set, and the origin is not in it. Write the inequality in standard form and with y alone, and explain why the symbol changes.',
    directionSteps: ['Use the origin to choose the symbol in standard form.', 'Solve for y.', 'Explain why the symbol changes.'],
    responses: [
      inequality('standard', 'Standard form', '3x - 4y > 12'),
      inequality('slopeIntercept', 'With y alone', 'y < 3/4x - 3'),
      choice('why', 'Why does the symbol change?', [
        'Dividing both sides by −4 reverses the inequality',
        'Subtracting 3x from both sides reverses the inequality',
        'The slope 3/4 is positive, so the inequality reverses',
        'It does not change: dividing keeps the symbol the same',
      ], 'Dividing both sides by −4 reverses the inequality'),
    ],
    hints: ['At the origin, 3x − 4y = 0. Which strict symbol makes 0 ? 12 false?', 'Subtract 3x from both sides, then divide each side by −4: dividing by a negative number reverses the symbol.'],
    misconceptions: [
      slip('standard', turned('3x - 4y > 12'), 'The symbol points the wrong way: the origin is not in the solution set, so it should make your inequality false.'),
      slip('standard', restyled('3x - 4y > 12'), 'The boundary is not part of the solution set, so your symbol should leave it out.'),
      slip('slopeIntercept', turned('y < 3/4x - 3'), 'Dividing both sides by −4 reverses the symbol.'),
      slip('slopeIntercept', restyled('y < 3/4x - 3'), 'The boundary is not part of the solution set, so your symbol should leave it out.'),
      slip('slopeIntercept', otherInterceptSign('y < 3/4x - 3'), 'Check the sign of the y-intercept: what is 12 divided by −4?'),
    ],
    scaffold: backUp('Is 0 > 12 true?', ['no', 'yes'], 'no'),
    solutionReview: review('Exclude the origin, then solve for y.', ['0 > 12 is false, so the origin is excluded by 3x − 4y > 12 (strict, because the boundary is excluded).', '−4y > −3x + 12 → y < (3/4)x − 3 (dividing by −4 reverses the symbol).'], '3x − 4y > 12; y < (3/4)x − 3', 'Keeping > after dividing by −4.'),
  },
  withOwnHint('A point ON the boundary line makes the equation of the line true, not just the inequality. What equation in k do you get when you substitute the point?', auditedCcmrQuestion({
    documentId: 'mm_sat_A_3D_challenge_1_parameter-boundary-point_v21',
    questionId: `${P}-p-17`,
    scaffold: backUp('A point on the boundary line of y ≤ kx + 2 makes…', ['y = kx + 2 true', 'y < kx + 2 true'], 'y = kx + 2 true'),
  })),
  withOwnHint('What is the boundary’s y-value at this x? With >, can y equal that value, or must it be greater?', auditedCcmrQuestion({
    documentId: 'mm_sat_A_3D_challenge_3_minimum-integer-y_v21',
    questionId: `${P}-p-18`,
    scaffold: backUp('For y > 4, is y = 4 a solution?', ['no', 'yes'], 'no'),
    commonError: 'Choosing the boundary value itself: > leaves the boundary out, so the least integer is one more than it.',
    // One try: a reason for each option, in the bank's option order.
    optionRationales: {
      answer: [
        'Right: at x = {{x}} the boundary value is {{boundary}}, and the least integer greater than it is one more.',
        'This is the boundary value itself. The symbol > leaves the boundary out, so y must be greater than it.',
        'This changes the sign of the slope term: at x = {{x}}, {{m}}x is {{m}}({{x}}).',
        'This changes the sign of the constant: the boundary is {{m}}x {{b|signed}}.',
      ],
    },
  })),
];

/* ------------------------------------------------------ Exit Ticket */

const dolRegular = (P) => [
  inequalityBuild({
    questionId: `${P}-dol-1`,
    alignment: A3D,
    dok: 2,
    difficultyBand: 2,
    prompt: tex`Graph $y < {{m|coef}}x {{b|signed}}$. Then test the point (0, 0).`,
    source: ['y < {{m|coef}}x {{b|signed}}'],
    constraints: [{ m: '{{m}}', b: '{{b}}', relation: '<' }],
    testPoint: { x: 0, y: 0 },
    directionSteps: ['Build the boundary line.', 'Choose solid or dashed.', 'Shade the half-plane of solutions.', 'Test the point.'],
    solutionReview: review('Dashed line, shaded below.', ['Boundary y = {{m|coef}}x {{b|signed}} through (0, {{b}}) and (1, {{mb}}).', '< is strict: dashed. Shade below.'], 'dashed, below', 'Using a solid line for <.'),
    generator: { parameters: { m: { type: 'int', min: -4, max: 4, exclude: [0] }, b: { type: 'int', min: -6, max: 6, exclude: [0] } }, derived: { mb: 'm + b' } },
    questionFamily: { scope: 'assignment' },
  }),
  inequalityBuild({
    questionId: `${P}-dol-2`,
    alignment: A3D,
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Graph $ {{A}}x - y \ge {{C}} $. Rewrite it with y alone in the tool first.`,
    source: ['{{A}}x - y >= {{C}}'],
    constraints: [{ A: '{{A}}', B: -1, C: '{{nC}}', relation: '>=' }],
    rewrite: true,
    directionSteps: ['Rewrite the inequality with y alone.', 'Build the boundary line.', 'Choose solid or dashed.', 'Shade the half-plane of solutions.'],
    solutionReview: review('Rewrite, reverse, graph.', ['{{A}}x − y ≥ {{C}} → −y ≥ −{{A}}x {{C|signed}} → y ≤ {{A}}x {{nC|signed}} (dividing by −1 reverses the symbol).', 'Solid line, shaded below.'], 'y ≤ {{A}}x {{nC|signed}}', 'Forgetting to reverse the symbol.'),
    generator: { parameters: { A: { type: 'int', min: 2, max: 5 }, C: { type: 'int', min: -6, max: 6, exclude: [0] } }, derived: { nC: '0 - C' } },
    questionFamily: { scope: 'assignment' },
  }),
  {
    questionId: `${P}-dol-3`,
    ...A2H,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: 'A class can spend at most ${{T}} on movie tickets. Student tickets cost ${{p}} and adult tickets cost ${{q}}. Let x be the number of student tickets and y the number of adult tickets. Write the inequality, then find the greatest number of adult tickets they can buy with no student tickets.',
    directionSteps: ['Write the inequality.', 'Find the greatest number of adult tickets with no student tickets.'],
    responses: [
      inequality('model', 'Inequality', '{{p}}x + {{q}}y <= {{T}}'),
      number('most', 'Greatest number of adult tickets with no student tickets', '{{M}}'),
    ],
    // Said on a miss only once the teacher releases feedback (feedbackOpenForItem).
    misconceptions: [
      slip('model', turned('{{p}}x + {{q}}y <= {{T}}'), '"At most" means the class spends the budget or less.'),
      slip('model', restyled('{{p}}x + {{q}}y <= {{T}}'), '"At most" includes spending exactly the budget.'),
    ],
    solutionReview: review('Price times count, then "at most".', ['{{p}}x + {{q}}y ≤ {{T}}.', 'With x = 0: {{q}}y ≤ {{T}}, so y ≤ {{T}}/{{q}}; the greatest whole number is {{M}}.'], '{{p}}x + {{q}}y ≤ {{T}}; {{M}}', 'Rounding up: that many tickets would cost more than ${{T}}.'),
    generator: {
      parameters: { p: { type: 'int', min: 5, max: 8 }, q: { type: 'int', min: 9, max: 13 }, T: { type: 'int', min: 100, max: 200, step: 5 } },
      derived: { M: 'floor(T/q)' },
      constraints: ['T % q != 0'],
    },
    questionFamily: { scope: 'assignment' },
  },
];

const dolHonors = (P) => [
  inequalityBuild({
    questionId: `${P}-dol-1`,
    alignment: A3D,
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Graph $y \ge {{sg|coef}}\frac{ {{pa}} }{ {{q}} }x {{b|signed}}$. Then test the point (0, 0).`,
    source: ['y >= {{sg|coef}}({{pa}}/{{q}})x {{b|signed}}'],
    constraints: [{ m: '{{m}}', b: '{{b}}', relation: '>=' }],
    testPoint: { x: 0, y: 0 },
    directionSteps: ['Build the boundary line.', 'Choose solid or dashed.', 'Shade the half-plane of solutions.', 'Test the point.'],
    solutionReview: review('Solid line, shaded above.', ['Plot (0, {{b}}), then use a rise of {{p}} and a run of {{q}}.', '≥ includes equality: solid. Shade above.'], 'solid, above', 'Swapping the rise and the run.'),
    generator: { parameters: { pa: { type: 'int', min: 1, max: 3 }, sg: { type: 'choice', values: [-1, 1] }, q: { type: 'int', min: 2, max: 4 }, b: { type: 'int', min: -5, max: 5, exclude: [0] } }, derived: { p: 'sg*pa', m: 'sg*pa/q' }, constraints: ['gcd(pa, q) == 1'] },
    questionFamily: { scope: 'assignment' },
  }),
  inequalityBuild({
    questionId: `${P}-dol-2`,
    alignment: A3D,
    dok: 3,
    difficultyBand: 4,
    prompt: tex`Graph $ {{A|coef}}x - {{B}}y < {{C}} $. Rewrite it with y alone in the tool first.`,
    source: ['{{A|coef}}x - {{B}}y < {{C}}'],
    constraints: [{ A: '{{A}}', B: '{{nB}}', C: '{{nC}}', relation: '<' }],
    rewrite: true,
    directionSteps: ['Rewrite the inequality with y alone.', 'Build the boundary line.', 'Choose solid or dashed.', 'Shade the half-plane of solutions.'],
    solutionReview: review('Rewrite, reverse, graph.', ['Subtract {{A|coef}}x from both sides, then divide by −{{B}} and reverse the symbol: y > ({{A}}/{{B}})x {{nk|signed}}.', 'Dashed line, shaded above.'], null, 'Dividing by −{{B}} without reversing the symbol.'),
    generator: { parameters: { A: { type: 'int', min: 1, max: 4 }, B: { type: 'int', min: 2, max: 4 }, k: { type: 'int', min: -3, max: 3, exclude: [0] } }, derived: { nB: '0 - B', C: 'B*k', nC: '0 - B*k', nk: '0 - k' }, constraints: ['gcd(A, B) == 1'] },
    questionFamily: { scope: 'assignment' },
  }),
  {
    questionId: `${P}-dol-3`,
    ...A2H,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: 'A theater club must take in at least ${{T}} from a show. Student tickets cost ${{p}} and adult tickets cost ${{q}}. Let x be the number of student tickets and y the number of adult tickets. Write the inequality, then find the least number of adult tickets the club must sell if it sells {{x0}} student tickets.',
    directionSteps: ['Write the inequality.', 'Substitute the student tickets.', 'Find the least whole number of adult tickets.'],
    responses: [
      inequality('model', 'Inequality', '{{p}}x + {{q}}y >= {{T}}'),
      number('least', 'Least number of adult tickets', '{{L}}'),
    ],
    // Said on a miss only once the teacher releases feedback (feedbackOpenForItem).
    misconceptions: [
      slip('model', turned('{{p}}x + {{q}}y >= {{T}}'), '"At least" means the club takes in the goal or more.'),
      slip('model', restyled('{{p}}x + {{q}}y >= {{T}}'), '"At least" includes taking in exactly the goal.'),
    ],
    solutionReview: review('Model, substitute, round up.', ['{{p}}x + {{q}}y ≥ {{T}}.', 'With x = {{x0}}: {{q}}y ≥ {{rest}}, so y ≥ {{rest}}/{{q}}; the least whole number is {{L}}.'], '{{p}}x + {{q}}y ≥ {{T}}; {{L}}', 'Rounding down: that many tickets falls short of ${{T}}.'),
    generator: {
      parameters: { p: { type: 'int', min: 4, max: 7 }, q: { type: 'int', min: 9, max: 12 }, T: { type: 'int', min: 400, max: 600, step: 10 }, x0: { type: 'int', min: 20, max: 40 } },
      derived: { rest: 'T - p*x0', L: 'ceil((T - p*x0)/q)' },
      constraints: ['T - p*x0 > 0', '(T - p*x0) % q != 0'],
    },
    questionFamily: { scope: 'assignment' },
  },
];

/* -------------------------------------------------------- the files */

const assignment = (honors) => ({
  title: `Graphing Inequalities in Two Variables${honors ? ' Honors' : ''} (M3 T2 L4)`,
  courseId: 'algebra1',
  folder: FOLDER,
  instructionalPurpose: 'lesson',
  gradingPurpose: 'classwork',
  essentialQuestion: 'What does the graph of a linear inequality in two variables look like? How does it compare to the graph of a linear equation?',
  instructions: 'Graphing inequalities in two variables. Every graph is built in the graphing workspace one step at a time — the boundary line, solid or dashed, the side to shade, and a test point — and each step is checked. For a word problem, write the inequality in the tool before you graph it. You have 3 tries on each Warm-Up, Classwork and Practice question, with hints. The Exit Ticket is one try with no hints.',
  teacherNotes: `Algebra I Module 3 Topic 2 Lesson 4, from the district slides (two 45-minute days), TEKS A.2H and A.3D.${honors ? ' Honors version: the same lesson with fractional slopes and y-coefficients other than ±1 in the Warm-Up, Practice and Exit Ticket, parameters (P14), boundaries from two points (P15), reasoning from a description (P16), and two audited Digital SAT items from the CCMR bank (P17, P18), so the Honors version is ready as written.' : ''} Classwork order: Activity 4.2's first graph, y > 4x − 6 (CW 6), comes right after CW 1, before Kai's goal is graphed. Warm-Up rebuilt as readiness: a number-line solution statement (open/closed circle → dashed/solid), graphing the boundary line, and testing points. Every graph is built in the Systems Workspace's inequality builder (boundary, line style, shading, test point), and context items have students write the model in the tool first. Warm-Up and Exit Ticket are generated per student and back Recovery. Slide note: the worked example's title reads "Write a linear equality"; it means inequality.`,
});

const P = 'm3t2l4';
const H = 'm3t2l4h';

export const L4_REGULAR = {
  file: 'teacher-import-jsons/algebra1-module3/T2_L4_Graphing_Inequalities_in_Two_Variables.json',
  lesson: {
    schemaVersion: 5,
    assignment: assignment(false),
    variantPolicy: { mode: 'personalized', sectionModes: { warmup: 'shared', classwork: 'shared', practice: 'personalized', dol: 'personalized' } },
    sections: [
      { id: 'warmup', role: 'warmup', title: 'Warm-Up — From Number Lines to Half-Planes', recommendedMinutes: 10, questions: [numberLineWarmup(`${P}-wu-1`), boundaryLineWarmup(`${P}-wu-2`, false), testPointWarmup(`${P}-wu-3`, false)] },
      { id: 'classwork', role: 'classwork', title: 'Classwork — Graphing Linear Inequalities in Two Variables', recommendedMinutes: 70, questions: classwork(P) },
      { id: 'practice', role: 'practice', title: 'Practice — Graphing and Writing Linear Inequalities', recommendedMinutes: 45, questions: practiceRegular(P) },
      { id: 'dol', role: 'dol', title: 'Exit Ticket (DOL) — Graphing Inequalities in Two Variables', recommendedMinutes: 10, questions: dolRegular(P) },
    ],
  },
};

export const L4_HONORS = {
  file: 'teacher-import-jsons/algebra1-module3/T2_L4_Graphing_Inequalities_in_Two_Variables_Honors.json',
  lesson: {
    schemaVersion: 5,
    assignment: assignment(true),
    variantPolicy: { mode: 'personalized', sectionModes: { warmup: 'shared', classwork: 'shared', practice: 'personalized', dol: 'personalized' } },
    sections: [
      { id: 'warmup', role: 'warmup', title: 'Warm-Up — From Number Lines to Half-Planes', recommendedMinutes: 10, questions: [numberLineWarmup(`${H}-wu-1`), boundaryLineWarmup(`${H}-wu-2`, true), testPointWarmup(`${H}-wu-3`, true)] },
      { id: 'classwork', role: 'classwork', title: 'Classwork — Graphing Linear Inequalities in Two Variables', recommendedMinutes: 70, questions: classwork(H) },
      { id: 'practice', role: 'practice', title: 'Practice — Graphing, Writing and Reasoning with Linear Inequalities', recommendedMinutes: 45, questions: practiceHonors(H) },
      { id: 'dol', role: 'dol', title: 'Exit Ticket (DOL) — Graphing Inequalities in Two Variables', recommendedMinutes: 10, questions: dolHonors(H) },
    ],
  },
};


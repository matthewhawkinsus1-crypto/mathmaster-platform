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
import { A2H, A3D, computedChoice, inequalityBuild, tex } from './shared.mjs';

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
    'An open circle means the number is not a solution; a closed circle means it is.',
    'x < a is true for every number to the left of a on the number line.',
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
    'The constant term is the y-intercept: plot that point on the y-axis first.',
    honors ? 'A fraction slope is rise over run: move up or down by the numerator and right by the denominator.' : 'The slope is rise over run: from the y-intercept, move up (or down) and right.',
    'Check your second point by substituting it into the equation.',
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
    'Substitute the x-coordinate (and the y-coordinate) of each point.',
    'A point is a solution when the inequality is a true statement there.',
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
    hints: ['A two-point shot is worth 2 points: multiply each count by its value.', 'Add the two products to get the total.', 'For the equation, set the total of the two kinds of shots equal to Kai’s average.'],
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
    hints: ['The boundary of y > 4x − 6 is the line with slope 4 and y-intercept −6.', '> leaves the line itself out of the solutions.', 'Substitute (0, 0): is 0 > 4(0) − 6 true?'],
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
    hints: ['"At least" means greater than or equal to.', 'Points that make exactly 20 points are on the boundary line, such as (10, 0) and (4, 4).', 'A point that meets the goal is on the side you shade.'],
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
        'on the y-axis',
      ], 'on or above the line 2x + 3y = 20'),
    ],
    hints: ['Total = 2 · (two-point shots) + 3 · (three-point shots).', 'Compare each total with 20.', 'The points with totals of 20 or more fall on one side of the boundary.'],
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
      choice('compare', 'How do the solutions differ?', [
        'The equation’s solutions are only the points on the line; the inequality’s are the line and the half-plane above it',
        'They are the same points',
        'The inequality has fewer solutions than the equation',
        'The equation’s solutions are the half-plane above the line',
      ], 'The equation’s solutions are only the points on the line; the inequality’s are the line and the half-plane above it'),
      number('decimalValue', '2(6.5) + 3(5.5) =', '29.5'),
      choice('decimal', 'Does (6.5, 5.5) make sense as a solution for Kai?', [
        'No — it satisfies the inequality, but Kai cannot make half of a shot, so only whole numbers make sense',
        'Yes — every point in the shaded half-plane makes sense',
        'No — it is below the line',
        'Yes — Kai can make any number of shots',
      ], 'No — it satisfies the inequality, but Kai cannot make half of a shot, so only whole numbers make sense'),
      number('below', 'Kai’s points for 2 two-point shots and 3 three-point shots, (2, 3)', '13'),
      number('onLine', 'Kai’s points for 1 two-point shot and 6 three-point shots, (1, 6)', '20'),
      choice('meaning', 'What do those two points mean?', [
        '(2, 3) is below the line and misses the goal; (1, 6) is on the line and meets it exactly',
        '(2, 3) is on the line; (1, 6) is below it',
        'Both points miss the goal',
        'Both points are above the line',
      ], '(2, 3) is below the line and misses the goal; (1, 6) is on the line and meets it exactly'),
    ],
    hints: ['An equation is true only on its line; an inequality with ≥ is true on the line and on one side of it.', 'Substitute each point into 2x + 3y and compare the total with Kai’s goal.', 'Think about what x and y count.'],
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
    hints: ['"At least" and "no more than" include the number itself.', '"More than" and "fewer than" leave the number out.', 'Points come from 2x + 3y; the number of shots is x + y.'],
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
    prompt: 'Four graphs share one boundary line, y = (1/2)x − 3, through (0, −3) and (6, 0). Graph a: dashed line, the half-plane above it shaded. Graph b: solid line, the half-plane below it shaded. Graph c: dashed line, the half-plane below it shaded. Write the inequality graphs a, b and c show, and the fourth inequality with this boundary, which none of them shows.',
    directionSteps: ['Use solid or dashed to narrow the symbol.', 'Use the shaded side to finish each inequality.', 'Write the fourth inequality with this boundary.'],
    responses: [
      graphInequality('a', 'Graph a', 'y > 1/2x - 3'),
      graphInequality('b', 'Graph b', 'y <= 1/2x - 3'),
      graphInequality('c', 'Graph c', 'y < 1/2x - 3'),
      graphInequality('d', 'The inequality no graph shows (you graph it next)', 'y >= 1/2x - 3'),
    ],
    hints: ['Dashed goes with < or >; solid with ≤ or ≥.', 'Solved for y, > and ≥ shade above; < and ≤ shade below.'],
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
    hints: ['Start at the y-intercept and use the slope as rise over run.', '≥ includes the boundary.', 'Solved for y, ≥ shades above.'],
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
    hints: ['The boundary has slope 1 and y-intercept 3.', 'Which symbols use a dashed line?', 'Test a point that is not on the line.'],
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
    hints: ['A slope of −1/3: down 1, right 3 (or up 1, left 3).', '≤ includes the boundary.', 'Test (0, 0).'],
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
    hints: ['Subtract 2x from each side first.', 'Dividing (or multiplying) both sides by a negative number reverses the symbol.', 'Check the side you shade with a test point in the original inequality.'],
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
    prompt: 'Worked example — write a linear inequality for a graph. A graph has a SOLID boundary line through (0, −5) and (2, −8), and the half-plane ABOVE the line is shaded. Write the boundary’s equation pieces, choose the symbol, and check with a test point.',
    directionSteps: ['Find the slope of the boundary line.', 'Find its y-intercept.', 'Choose the symbol from the line style and the shaded side.', 'Write the inequality and check it with a test point.'],
    responses: [
      number('slope', 'Slope of the boundary line', '-3/2'),
      number('intercept', 'y-intercept', '-5'),
      choice('symbol', 'Solid line, shaded above: the symbol is', ['≥', '>', '≤', '<'], '≥'),
      graphInequality('inequality', 'The inequality', 'y >= -3/2x - 5'),
      choice('check', 'Test (0, 0): 0 ≥ −(3/2)(0) − 5 is…', ['true, and (0, 0) is in the shaded half-plane', 'false, so (0, 0) is not shaded', 'true, so the line is dashed', 'impossible to test'], 'true, and (0, 0) is in the shaded half-plane'),
    ],
    hints: ['Slope = change in y ÷ change in x between the two points.', 'The point with x = 0 gives the y-intercept.', 'Solid means the boundary is included; above means y is greater.'],
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
    prompt: 'Write a linear inequality for graphs a, b and c. Graph a: a DASHED boundary line through (0, 2) and (1, 6); the shaded half-plane contains (0, 0). Graph b: a SOLID boundary line through (0, −3) and (6, 0); the half-plane above it is shaded. Graph c: a DASHED boundary line through (0, −2) and (4, 1); the half-plane below it is shaded.',
    directionSteps: ['Find each boundary line’s slope and y-intercept.', 'Choose each symbol from the line style and the shaded side.', 'Write each inequality.'],
    responses: [
      graphInequality('a', 'Graph a', 'y < 4x + 2'),
      graphInequality('b', 'Graph b', 'y >= 1/2x - 3'),
      graphInequality('c', 'Graph c', 'y < 3/4x - 2'),
    ],
    hints: ['Find each slope from the two points, and read the y-intercept at x = 0.', 'Dashed: < or >. Solid: ≤ or ≥.', 'For graph a, test (0, 0): which symbol makes 0 ? 4(0) + 2 true?'],
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
      inequality('inequality', 'Inequality for the minutes César can use', 'y <= -0.4x + 100'),
      choice('why', 'Why that symbol?', [
        'He can use the whole card or less of it, so the combinations are on or below the line',
        'He must spend more than $50',
        'He must use exactly $50',
        'Calls to Mexico cost less',
      ], 'He can use the whole card or less of it, so the combinations are on or below the line'),
    ],
    hints: ['Rate of change = change in y ÷ change in x between two rows.', 'The row with x = 0 gives the y-intercept.', 'He cannot spend more than the card holds.'],
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
    hints: ['Cost of calls within the United States plus cost of calls to Mexico is at most 50.', 'The intercepts from the table are on the boundary.', 'Substitute (100, 80) into the cost.'],
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
      choice('uncle', '100 minutes to San Antonio and 80 minutes to Juárez, Mexico?', ['No — that costs $60, more than the card', 'Yes — it costs $45.50', 'Yes — 180 minutes is less than 250', 'No — calls to Mexico are not allowed'], 'No — that costs $60, more than the card'),
      choice('brother', '55 minutes to Mexico City and 90 minutes to Denver?', ['Yes — that costs $45.50, which is at most $50', 'No — that costs $60', 'No — the point is above the line', 'Yes — any 145 minutes fit'], 'Yes — that costs $45.50, which is at most $50'),
      choice('on', 'Points on the line mean…', ['combinations that use exactly the whole $50', 'combinations he cannot afford', 'combinations that leave money on the card', 'only calls to Mexico'], 'combinations that use exactly the whole $50'),
      choice('above', 'Points above the line mean…', ['combinations that cost more than $50', 'combinations that use exactly $50', 'combinations that leave money on the card', 'free calls'], 'combinations that cost more than $50'),
      choice('belowLine', 'Points below the line (in the first quadrant) mean…', ['combinations that leave money on the card', 'combinations that cost more than $50', 'combinations that use exactly $50', 'negative minutes'], 'combinations that leave money on the card'),
    ],
    hints: ['70 minutes to Mexico costs 0.5 · 70 dollars; what is left pays for minutes at $0.20 each.', 'Find the total cost of each pair of calls and compare it with $50.', 'On the line the cost is exactly $50.'],
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
      choice('lt12', 'x + y < 12', ['dashed line, shade below (test (0, 0): 0 < 12 is true)', 'solid line, shade below', 'dashed line, shade above', 'solid line, shade above'], 'dashed line, shade below (test (0, 0): 0 < 12 is true)'),
      choice('le12', 'x + y ≤ 12', ['solid line, shade below', 'dashed line, shade below', 'solid line, shade above', 'dashed line, shade above'], 'solid line, shade below'),
      choice('gt12', 'x + y > 12', ['dashed line, shade above (test (0, 0): 0 > 12 is false)', 'solid line, shade above', 'dashed line, shade below', 'solid line, shade below'], 'dashed line, shade above (test (0, 0): 0 > 12 is false)'),
      graphInequality('ge0', 'The line x + y = 0 and the half-plane above it', 'x + y >= 0'),
      graphInequality('lt0', 'The half-plane below the line x + y = 0, without the line', 'x + y < 0'),
      graphInequality('le0', 'The line x + y = 0 and the half-plane below it', 'x + y <= 0'),
    ],
    hints: ['The symbol decides solid or dashed.', 'The second line passes through the origin, so test a different point, such as (1, 1).', 'Solved for y, > and ≥ are above; < and ≤ are below.'],
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
    hints: ['Plot the y-intercept, then use the slope.', '> leaves the boundary out.', 'Substitute (0, 0) to decide the side.'],
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
    hints: ['From the y-intercept, rise by the numerator and run by the denominator.', '≤ includes the boundary.', 'Solved for y, ≤ shades below.'],
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
    hints: ['Subtract the x-term from both sides first.', 'Dividing by a negative number reverses the symbol.'],
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
    hints: ['Money from muffins plus money from smoothies is at least the goal.', 'Multiply each count by its price, then add.'],
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
    hints: ['Substitute x and y, then compare the value with the constant.', '≤ is true when the value is less than or equal to the constant.'],
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
    prompt: 'Vertical and horizontal boundaries. Write an inequality for graphs a and b. Graph a: a dashed vertical line x = 3, the half-plane to its left shaded. Graph b: a solid horizontal line y = −2, the half-plane above it shaded.',
    directionSteps: ['Use the line and its style to choose the symbol.', 'Write each inequality.'],
    responses: [graphInequality('a', 'Graph a', 'x < 3'), graphInequality('b', 'Graph b', 'y >= -2')],
    hints: ['A vertical line x = c: left means x is less than c.', 'A horizontal line y = c: above means y is greater than c.'],
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
    hints: ['x = −2 is a vertical line: use the vertical-line method.', '≥ includes the line.', 'Points to the right have larger x-coordinates.'],
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
    hints: ['"At most" means less than or equal to.', '"Twice the first" is 2x; "minus the second" subtracts y.'],
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
    hints: ['Taco money plus burrito money is at least 240.', 'The intercepts (80, 0) and (0, 30) are on the boundary.', '3(40) + 8(20) = ?'],
    scaffold: backUp('Money from x tacos at $3 each is…', ['3x', 'x + 3'], '3x'),
    solutionReview: review('Model, graph, test.', ['3x + 8y ≥ 240; boundary through (80, 0) and (0, 30), solid.', 'Shade above; (40, 20) gives 280 ≥ 240, so it meets the goal.'], '3x + 8y ≥ 240', 'Shading below the line, where the money is less than $240.'),
  }),
  {
    questionId: `${P}-p-10`,
    ...A3D,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 3,
    prompt: 'Error analysis. Marcus graphed y < −2x + 1 with a SOLID boundary line and shaded the half-plane below it. Write the inequality his graph actually shows, identify his error, and check his shading with the point (0, 0).',
    directionSteps: ['Write the inequality Marcus’s graph shows.', 'Decide which part of the graph is wrong.', 'Check the shading with the test point.'],
    responses: [
      graphInequality('graphed', 'The inequality Marcus’s graph shows', 'y <= -2x + 1'),
      choice('error', 'Marcus’s error:', ['The line should be dashed, because < does not include the boundary', 'The shading should be above the line', 'The slope should be 2', 'There is no error'], 'The line should be dashed, because < does not include the boundary'),
      choice('test', 'Test (0, 0): 0 < −2(0) + 1 is…', ['true, so the shading below (with the origin) is correct', 'false, so the shading is wrong', 'true, so the line is solid', 'not useful here'], 'true, so the shading below (with the origin) is correct'),
    ],
    hints: ['A solid line shaded below shows ≤.', 'Check the line style against the symbol.', 'Check the side with a test point.'],
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
    hints: ['Substitute x and y, then compare the value with the right side.', 'A point that makes the two sides equal is on the solid boundary — and ≤ includes it.'],
    scaffold: backUp('At (1, 1), 4x − 2y equals…', ['2', '4'], '2'),
    solutionReview: review('Substitute and compare with 8.', ['(0, 0): 0 ≤ 8 yes. (3, 1): 10 ≤ 8 no. (2, 0): 8 ≤ 8 yes, on the line. (5, 7): 6 ≤ 8 yes.'], '0, 10, 8, 6; (3, 1) is not a solution; (2, 0) is on the line', 'Calling (2, 0) not a solution: ≤ includes the boundary.'),
  },
  {
    questionId: `${P}-p-12`,
    ...A2H,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 3,
    prompt: 'A boundary line passes through (0, 4) and (2, 0). It is solid, and (0, 0) is NOT in the shaded half-plane. Write the inequality.',
    directionSteps: ['Find the boundary line.', 'Use the test point to choose the side.', 'Write the inequality.'],
    responses: [
      number('slope', 'Slope', '-2'),
      graphInequality('inequality', 'Inequality', 'y >= -2x + 4'),
    ],
    hints: ['Find the slope from the two points; the y-intercept is where x = 0.', '(0, 0) is not shaded, so the inequality is false at (0, 0).', 'Solid: ≤ or ≥.'],
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
    hints: ['Subtract the x-term from both sides, then divide by the coefficient of y.', 'Dividing by a negative number reverses the symbol.', 'Use the test point to check your side.'],
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
    hints: ['Substitute x = 2 and y = 3 into y > kx − 1.', 'Solve 3 > 2k − 1 for k.', 'At the boundary value, the two sides are equal.'],
    scaffold: backUp('3 > 2k − 1 becomes…', ['4 > 2k', '2 > 2k'], '4 > 2k'),
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
      graphInequality('inequality', 'Inequality', 'y <= -x + 3'),
    ],
    hints: ['Slope = change in y ÷ change in x between the two given points.', 'Substitute one point and the slope into y = mx + b and solve for b.', 'The line is solid and the origin is shaded: which symbol makes the statement true at (0, 0)?'],
    scaffold: backUp('The slope through (−2, 5) and (4, −1) is…', ['−1', '1'], '−1'),
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
      choice('why', 'Why does the symbol change?', ['Dividing both sides by −4 reverses the inequality', 'Subtracting 3x reverses it', 'The slope is positive', 'It does not change'], 'Dividing both sides by −4 reverses the inequality'),
    ],
    hints: ['At the origin, 3x − 4y = 0. Which strict symbol makes 0 ? 12 false?', 'Subtract 3x from both sides, then divide by −4.'],
    scaffold: backUp('Is 0 > 12 true?', ['no', 'yes'], 'no'),
    solutionReview: review('Exclude the origin, then solve for y.', ['0 > 12 is false, so the origin is excluded by 3x − 4y > 12 (strict, because the boundary is excluded).', '−4y > −3x + 12 → y < (3/4)x − 3 (dividing by −4 reverses the symbol).'], '3x − 4y > 12; y < (3/4)x − 3', 'Keeping > after dividing by −4.'),
  },
  auditedCcmrQuestion({
    documentId: 'mm_sat_A_3D_challenge_1_parameter-boundary-point_v21',
    questionId: `${P}-p-17`,
    scaffold: backUp('A point on the boundary line of y ≤ kx + 2 makes…', ['y = kx + 2 true', 'y < kx + 2 true'], 'y = kx + 2 true'),
  }),
  auditedCcmrQuestion({
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
  }),
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


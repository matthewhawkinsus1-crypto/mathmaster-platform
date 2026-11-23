/*
 * UNITS 8–10: systems by graphing; systems by substitution; inequalities in
 * two variables and systems of them.
 */
import { WINDOW, inequalityGraph, item, teks, unit } from './shared.mjs';

/* ------------------------------------------------------------------ Unit 8 */

const graphSystem = ({ system, labels, graph = WINDOW, snapStep = null, ...rest }) => item({
  actions: ['graphSystem'],
  system,
  graph,
  interaction: 'construct',
  equationLabels: labels,
  ...(snapStep ? { snapStep } : {}),
  ...rest,
});

const PASS_GRAPH = Object.freeze({ xMin: 0, xMax: 10, yMin: 0, yMax: 20, xStep: 1, yStep: 2 });

const UNIT_8 = unit({
  number: 8,
  title: 'Unit 8 — Solving systems by graphing',
  minutes: 36,
  honorsMinutes: 44,
  questions: [
    graphSystem({
      id: 'tg-u8-q1',
      alignment: teks('A.3F', 'A.5C'),
      dok: 1,
      band: 1,
      prompt: 'Graph both equations of the system y = x + 2 and y = −x + 6. Then tell how many solutions the system has and give the solution.',
      system: { m1: 1, b1: 2, m2: -1, b2: 6 },
      labels: ['y = x + 2', 'y = −x + 6'],
      hints: [
        'Graph each line from two points. The y-intercept is the easiest first point.',
        'Use each slope to find a second point: one line goes up 1 for each step right, the other goes down 1.',
        'The solution is the point where the two lines cross. Read its x-coordinate first.',
      ],
      backUp: ['The solution of a system of two lines is the point where the lines…', ['cross', 'start'], 'cross'],
      notes: [
        ['Solving a system by graphing', 'Graph both lines on the same plane. The point where they cross makes both equations true: it is the solution.'],
        ['Worked example', 'y = 3x and y = x + 6 cross at (3, 9). Check: 9 = 3(3) and 9 = 3 + 6.'],
      ],
      solution: {
        reasoning: [
          'Graph y = x + 2 through (0, 2) and (1, 3).',
          'Graph y = −x + 6 through (0, 6) and (1, 5).',
          'The lines have different slopes, so they cross once: at (2, 4).',
          'Check: 4 = 2 + 2 and 4 = −2 + 6. The system has exactly one solution, (2, 4).',
        ],
        commonError: 'Writing the solution as (4, 2); the x-coordinate comes first, and the lines cross where x = 2 and y = 4.',
      },
      example: 'ex-graph-system',
    }),
    graphSystem({
      id: 'tg-u8-q2',
      alignment: teks('A.3F', 'A.5C'),
      dok: 2,
      band: 2,
      prompt: 'Graph both equations of the system y = 2x − 4 and y = −(1/2)x + 1. Then tell how many solutions the system has and give the solution.',
      system: { m1: 2, b1: -4, m2: -0.5, b2: 1 },
      labels: ['y = 2x − 4', 'y = −(1/2)x + 1'],
      hints: [
        'Start each line at its y-intercept.',
        'For a fraction slope, the top number is the rise and the bottom number is the run. A negative rise goes down.',
        'Find the point that is on both lines. Check it in both equations.',
      ],
      backUp: ['A slope of −1/2 means…', ['down 1, right 2', 'down 2, right 1'], 'down 1, right 2'],
      solution: {
        reasoning: [
          'Graph y = 2x − 4 through (0, −4) and (1, −2).',
          'Graph y = −(1/2)x + 1 through (0, 1) and (2, 0).',
          'The lines cross at (2, 0).',
          'Check: 0 = 2(2) − 4 and 0 = −(1/2)(2) + 1. The system has exactly one solution, (2, 0).',
        ],
        commonError: 'Using a rise of −2 and a run of 1 for the slope −1/2; the top number is the rise, so the line goes down 1 for every 2 to the right.',
      },
    }),
    graphSystem({
      id: 'tg-u8-q3',
      alignment: teks('A.3F', 'A.5C'),
      dok: 2,
      band: 2,
      prompt: 'Graph both equations of the system y = 3x + 2 and y = 3x − 4. Then tell how many solutions the system has.',
      system: { m1: 3, b1: 2, m2: 3, b2: -4 },
      labels: ['y = 3x + 2', 'y = 3x − 4'],
      hints: [
        'Graph each line from its y-intercept and its slope.',
        'Compare the two slopes. What does that tell you about the lines?',
        'A solution is a point on both lines. Do these lines ever share a point?',
      ],
      backUp: ['Two different lines with the same slope are…', ['parallel', 'perpendicular'], 'parallel'],
      notes: [
        ['How many solutions?', 'Different slopes: the lines cross once, one solution. Same slope, different y-intercepts: parallel lines, no solution. Same slope and same y-intercept: the same line, infinitely many solutions.'],
        ['Worked example', 'y = 2x + 1 and y = 2x + 5 have the same slope and different y-intercepts, so they never meet: no solution.'],
      ],
      solution: {
        reasoning: [
          'Graph y = 3x + 2 through (0, 2) and (1, 5).',
          'Graph y = 3x − 4 through (0, −4) and (1, −1).',
          'Both lines have slope 3 but different y-intercepts, so they are parallel.',
          'Parallel lines never cross, so the system has no solution.',
        ],
        commonError: 'Giving a y-intercept, such as (0, 2), as the solution; a solution must be on both lines, and parallel lines share no point.',
      },
    }),
    item({
      id: 'tg-u8-q4',
      alignment: teks('A.2I', 'A.2C'),
      actions: ['multipleResponses'],
      dok: 2,
      band: 3,
      prompt: 'A climbing gym sells two passes. Pass A costs $6 to join plus $2 for each visit. Pass B costs $2 to join plus $3 for each visit. Let x be the number of visits and y be the total cost in dollars. Write an equation for each pass.',
      responses: [
        { id: 'passA', label: 'An equation for the cost of Pass A', answer: 'y = 2x + 6', inputProfile: 'equation', equivalence: 'polynomialRelation' },
        { id: 'passB', label: 'An equation for the cost of Pass B', answer: 'y = 3x + 2', inputProfile: 'equation', equivalence: 'polynomialRelation' },
      ],
      hints: [
        'Each pass is its own line in the form y = mx + b.',
        'The cost for each visit is the rate of change, so it multiplies x.',
        'The cost to join is paid once, even with no visits, so it is added on.',
      ],
      backUp: ['In y = mx + b, the amount paid one time is…', ['b', 'm'], 'b'],
      notes: [
        ['Writing a system', 'Name a variable for each unknown. Then write one equation for each fact or each plan. Two equations about the same two variables make a system.'],
        ['Worked example', 'Taxi A charges $3 plus $2 for each mile, and Taxi B charges $5 plus $1 for each mile: y = 2x + 3 and y = x + 5.'],
      ],
      solution: {
        reasoning: [
          'Pass A: $2 for each visit is the slope, and the $6 to join is the y-intercept.',
          'So Pass A is y = 2x + 6.',
          'Pass B: $3 for each visit is the slope, and the $2 to join is the y-intercept.',
          'So Pass B is y = 3x + 2. The two equations together are the system.',
        ],
        commonError: 'Writing Pass A as y = 6x + 2; the $6 is paid once, so it is added, and the $2 for each visit multiplies x.',
      },
      example: 'ex-write-system-rules',
    }),
    graphSystem({
      id: 'tg-u8-q5',
      alignment: teks('A.3G', 'A.3F', 'A.5C'),
      dok: 2,
      band: 3,
      prompt: 'The climbing passes cost y = 2x + 6 (Pass A) and y = 3x + 2 (Pass B), where x is the number of visits and y is the total cost in dollars. Graph both. Then find when the two passes cost the same.',
      system: { m1: 2, b1: 6, m2: 3, b2: 2 },
      labels: ['y = 2x + 6', 'y = 3x + 2'],
      graph: PASS_GRAPH,
      snapStep: 1,
      hints: [
        'Each line starts at its joining cost on the y-axis.',
        'Find a second point on each line by putting a number of visits in place of x.',
        'The passes cost the same where the lines cross. Read the visits first, then the dollars.',
      ],
      backUp: ['On this graph, the y-intercept of each line is…', ['the cost to join', 'the cost of each visit'], 'the cost to join'],
      notes: [
        ['Systems in a situation', 'Each line is one rule. Where the lines cross, both rules give the same y for the same x: that point answers "when are they the same?"'],
        ['Worked example', 'y = 5x + 10 and y = 10x cross at (2, 20): at x = 2, both rules give 20.'],
      ],
      solution: {
        reasoning: [
          'Graph y = 2x + 6 through (0, 6) and (2, 10).',
          'Graph y = 3x + 2 through (0, 2) and (2, 8).',
          'The lines cross at (4, 14).',
          'Check: 2(4) + 6 = 14 and 3(4) + 2 = 14. After 4 visits, both passes cost $14.',
        ],
        commonError: 'Reading the crossing as (14, 4); the horizontal axis is visits, so the solution is 4 visits and $14.',
      },
      example: 'ex-graph-system-context',
    }),
  ],
  honors: [
    graphSystem({
      id: 'tg-u8-h1',
      alignment: teks('A.3F', 'A.5C'),
      dok: 2,
      band: 4,
      prompt: 'Honors. Graph both equations of the system y = 2x − 3 and 4x − 2y = 6. Then tell how many solutions the system has.',
      system: { m1: 2, b1: -3, m2: 2, b2: -3 },
      labels: ['y = 2x − 3', '4x − 2y = 6'],
      hints: [
        'For 4x − 2y = 6, find the intercepts, or solve it for y.',
        'Plot two points for each equation. What do you notice about the two lines?',
        'If every point of one line is also on the other, how many points do the lines share?',
      ],
      backUp: ['Solving −2y = −4x + 6 for y gives…', ['y = 2x − 3', 'y = −2x + 3'], 'y = 2x − 3'],
      solution: {
        reasoning: [
          'Graph y = 2x − 3 through (0, −3) and (1, −1).',
          'Solve 4x − 2y = 6 for y: −2y = −4x + 6, so y = 2x − 3.',
          'Both equations describe the same line.',
          'Every point on that line makes both equations true, so the system has infinitely many solutions.',
        ],
        commonError: 'Answering "no solution" because the lines do not cross at one point; they lie on top of each other, so every point of the line is a solution.',
      },
    }),
  ],
});

/* ------------------------------------------------------------------ Unit 9 */

const A5C = teks('A.5C');
const substitution = ({ equations, variables = ['x', 'y'], ...rest }) => item({
  actions: ['solveSystem'],
  equations,
  variables,
  method: 'substitution',
  requireVerification: true,
  ...rest,
});

const UNIT_9 = unit({
  number: 9,
  title: 'Unit 9 — Solving systems by substitution',
  minutes: 40,
  honorsMinutes: 48,
  questions: [
    substitution({
      id: 'tg-u9-q1',
      alignment: A5C,
      dok: 1,
      band: 2,
      prompt: 'Solve the system y = 2x and x + y = 12 by substitution. Then check your solution in both equations.',
      equations: ['y = 2x', 'x + y = 12'],
      hints: [
        'The first equation says y is the same as 2x.',
        'In the second equation, write 2x in place of y. Now there is only one variable.',
        'Solve for x. Then use the first equation to find y, and check the pair in both equations.',
      ],
      backUp: ['If y = 2x, then in x + y = 12 you can replace y with…', ['2x', '12'], '2x'],
      notes: [
        ['Substitution', 'If one equation is solved for a variable, put that expression in place of the variable in the OTHER equation. Solve, then go back to find the second variable.'],
        ['Worked example', 'y = 6x and x + y = 63: x + 6x = 63, so 7x = 63 and x = 9. Then y = 6(9) = 54. The solution is (9, 54).'],
      ],
      solution: {
        reasoning: [
          'Substitute 2x for y in x + y = 12: x + 2x = 12.',
          'Combine like terms: 3x = 12, so x = 4.',
          'Find y from the first equation: y = 2(4) = 8.',
          'Check: 8 = 2(4) and 4 + 8 = 12. The solution is (4, 8).',
        ],
        commonError: 'Stopping at x = 4; a solution of a system is an ordered pair, so the y-value is needed too.',
      },
      example: 'ex-substitution',
    }),
    substitution({
      id: 'tg-u9-q2',
      alignment: A5C,
      dok: 2,
      band: 2,
      prompt: 'Solve the system y = x − 2 and 3x + y = 10 by substitution. Then check your solution in both equations.',
      equations: ['y = x - 2', '3x + y = 10'],
      hints: [
        'The first equation is already solved for y.',
        'Write x − 2, in parentheses, in place of y in the second equation.',
        'Combine like terms and solve for x. Then find y.',
      ],
      backUp: ['Which equation is already solved for a variable?', ['y = x − 2', '3x + y = 10'], 'y = x − 2'],
      solution: {
        reasoning: [
          'Substitute x − 2 for y: 3x + (x − 2) = 10.',
          'Combine like terms: 4x − 2 = 10, so 4x = 12 and x = 3.',
          'Find y: y = 3 − 2 = 1.',
          'Check: 1 = 3 − 2 and 3(3) + 1 = 10. The solution is (3, 1).',
        ],
        commonError: 'Substituting into the same equation the expression came from, which only gives a true statement; substitute into the OTHER equation.',
      },
    }),
    substitution({
      id: 'tg-u9-q3',
      alignment: A5C,
      dok: 2,
      band: 3,
      prompt: 'Solve the system x = 2y + 1 and 3x − 2y = 11 by substitution. Then check your solution in both equations.',
      equations: ['x = 2y + 1', '3x - 2y = 11'],
      hints: [
        'This time the first equation is solved for x.',
        'Write 2y + 1, in parentheses, in place of x in the second equation. The 3 multiplies the whole expression.',
        'Solve for y first. Then find x.',
      ],
      backUp: ['3(2y + 1) is equal to…', ['6y + 3', '6y + 1'], '6y + 3'],
      solution: {
        reasoning: [
          'Substitute 2y + 1 for x: 3(2y + 1) − 2y = 11.',
          'Distribute: 6y + 3 − 2y = 11. Combine like terms: 4y + 3 = 11.',
          'Subtract 3 and divide by 4: y = 2.',
          'Find x: x = 2(2) + 1 = 5. Check: 3(5) − 2(2) = 11. The solution is (5, 2).',
        ],
        commonError: 'Substituting without parentheses and writing 3 · 2y + 1; the 3 multiplies both terms of 2y + 1.',
      },
    }),
    item({
      id: 'tg-u9-q4',
      alignment: teks('A.2I', 'A.5C'),
      actions: ['multipleResponses'],
      dok: 2,
      band: 3,
      prompt: 'A food truck sold 40 items at lunch. Tacos cost $3 and burritos cost $5, and the truck collected $150. Let t be the number of tacos and b be the number of burritos. Write a system of two equations.',
      responses: [
        { id: 'items', label: 'An equation for the number of items sold', answer: 't + b = 40', inputProfile: 'equation', equivalence: 'polynomialRelation' },
        { id: 'money', label: 'An equation for the money collected, in dollars', answer: '3t + 5b = 150', inputProfile: 'equation', equivalence: 'polynomialRelation' },
      ],
      hints: [
        'One fact counts items. The other fact adds up money.',
        'The number of tacos plus the number of burritos is the total number of items.',
        'Each taco brings in $3 and each burrito brings in $5. Multiply each price by its variable.',
      ],
      backUp: ['The money from t tacos at $3 each is…', ['3t', 't + 3'], '3t'],
      notes: [
        ['A count and a total', 'Many situations give two facts: how many items there are, and what they are worth together. Write one equation for each fact.'],
        ['Worked example', '30 tickets sold; adult tickets $8, child tickets $4; $200 in all. With a adults and c children: a + c = 30 and 8a + 4c = 200.'],
      ],
      solution: {
        reasoning: [
          'Items: tacos plus burritos is 40, so t + b = 40.',
          'Money: t tacos bring in 3t dollars and b burritos bring in 5b dollars.',
          'The total is $150, so 3t + 5b = 150.',
        ],
        commonError: 'Writing 5t + 3b = 150; the $3 goes with the tacos and the $5 goes with the burritos.',
      },
      example: 'ex-write-system',
    }),
    substitution({
      id: 'tg-u9-q5',
      alignment: teks('A.5C', 'A.2I'),
      dok: 2,
      band: 3,
      prompt: 'The food truck’s system is t + b = 40 and 3t + 5b = 150, where t is the number of tacos and b is the number of burritos. Solve it by substitution to find how many of each were sold.',
      equations: ['t + b = 40', '3t + 5b = 150'],
      variables: ['t', 'b'],
      hints: [
        'Neither equation is solved for a variable yet. Which equation is easy to solve for t?',
        'Write that expression, in parentheses, in place of t in the other equation.',
        'Solve for b. Then go back for t, and check both numbers in both equations.',
      ],
      backUp: ['Solving t + b = 40 for t gives…', ['t = 40 − b', 't = 40 + b'], 't = 40 − b'],
      solution: {
        reasoning: [
          'Solve the first equation for t: t = 40 − b.',
          'Substitute into the second: 3(40 − b) + 5b = 150, so 120 − 3b + 5b = 150.',
          'Combine like terms: 120 + 2b = 150, so 2b = 30 and b = 15.',
          'Find t: t = 40 − 15 = 25. Check: 25 + 15 = 40 and 3(25) + 5(15) = 150. The truck sold 25 tacos and 15 burritos.',
        ],
        commonError: 'Distributing 3(40 − b) as 120 − b; the 3 multiplies both terms, giving 120 − 3b.',
      },
    }),
  ],
  honors: [
    substitution({
      id: 'tg-u9-h1',
      alignment: teks('A.5C', 'A.3F'),
      dok: 2,
      band: 4,
      prompt: 'Honors. Solve the system y = 3x − 2 and 6x − 2y = 10 by substitution. Decide whether it has one solution, no solution or infinitely many solutions.',
      equations: ['y = 3x - 2', '6x - 2y = 10'],
      hints: [
        'Substitute 3x − 2, in parentheses, for y in the second equation.',
        'Distribute the −2 carefully. What happens to the x-terms?',
        'A statement with no variable left is always true or never true. Decide which.',
      ],
      backUp: ['If substituting leaves a false statement such as 0 = 5, the system has…', ['no solution', 'one solution'], 'no solution'],
      notes: [
        ['Special systems', 'When substitution removes every variable, read what is left. A false statement (like 4 = 10) means no solution: the lines are parallel. A true statement (like 6 = 6) means infinitely many solutions: the same line.'],
        ['Worked example', 'y = 2x + 1 and 4x − 2y = 6: 4x − 2(2x + 1) = 6 gives −2 = 6, which is false, so there is no solution.'],
      ],
      solution: {
        reasoning: [
          'Substitute: 6x − 2(3x − 2) = 10.',
          'Distribute: 6x − 6x + 4 = 10.',
          'The x-terms cancel and leave 4 = 10, which is false.',
          'No ordered pair makes both equations true: the system has no solution. The lines are parallel.',
        ],
        commonError: 'Treating 4 = 10 as the solution x = 0; a false statement with no variable means there is no solution.',
      },
      example: 'ex-substitution-no-solution',
    }),
  ],
});

/* ----------------------------------------------------------------- Unit 10 */

const A3D = teks('A.3D', 'A.2H');
const A3H = teks('A.3H', 'A.3D');
const graphInequality = (rest) => item({ actions: ['solveInequalitySystem'], ...rest });

const ONE_BUILD = ['Build the boundary line.', 'Choose solid or dashed.', 'Shade the half-plane of solutions.'];
const TWO_BUILD = ['Build both boundary lines.', 'Choose solid or dashed for each.', 'Shade each half-plane and find the overlap.'];

const UNIT_10 = unit({
  number: 10,
  title: 'Unit 10 — Inequalities in two variables and their systems',
  minutes: 48,
  honorsMinutes: 64,
  questions: [
    graphInequality({
      id: 'tg-u10-q1',
      alignment: A3D,
      dok: 2,
      band: 2,
      prompt: 'Graph $y \\le 2x + 1$. Build the boundary line, choose solid or dashed, and shade. Then test the point (0, 0).',
      ...inequalityGraph({
        source: ['y <= 2x + 1'],
        constraints: [{ m: 2, b: 1, relation: '<=' }],
        testPoint: { x: 0, y: 0 },
        directionSteps: [...ONE_BUILD, 'Test the point.'],
      }),
      hints: [
        'The boundary is the line y = 2x + 1. What are its y-intercept and its slope?',
        'Does ≤ include the points on the line itself? Which line style shows that?',
        'Put (0, 0) into the inequality. If it makes a true statement, shade the side that holds (0, 0).',
      ],
      backUp: ['For ≤ or ≥, the boundary line is…', ['solid', 'dashed'], 'solid'],
      notes: [
        ['Graphing an inequality in two variables', 'Graph the boundary line: solid for ≤ or ≥, dashed for < or >. Then shade the half-plane where the inequality is true.'],
        ['Test point', 'Put (0, 0) into the inequality. True: shade the side with (0, 0). False: shade the other side. Example: for y > x + 3, 0 > 3 is false, so shade the side away from (0, 0).'],
      ],
      solution: {
        headline: 'Boundary, style, shading, test.',
        reasoning: [
          'Boundary y = 2x + 1: plot (0, 1), then go up 2 and right 1 to (1, 3).',
          '≤ includes the points on the line, so the line is solid.',
          'Test (0, 0): 0 ≤ 2(0) + 1 is 0 ≤ 1, which is true.',
          '(0, 0) is a solution, so shade the half-plane that holds it: below the line.',
        ],
        answerSummary: 'solid line y = 2x + 1, shaded below',
        commonError: 'Drawing a dashed line; ≤ means the points on the line are solutions too, so the boundary is solid.',
      },
      example: 'ex-graph-inequality',
    }),
    graphInequality({
      id: 'tg-u10-q2',
      alignment: A3D,
      dok: 2,
      band: 2,
      prompt: 'Graph $y > -x + 3$. Build the boundary line, choose solid or dashed, and shade. Then test the point (0, 0).',
      ...inequalityGraph({
        source: ['y > -x + 3'],
        constraints: [{ m: -1, b: 3, relation: '>' }],
        testPoint: { x: 0, y: 0 },
        directionSteps: [...ONE_BUILD, 'Test the point.'],
      }),
      hints: [
        'The boundary is the line y = −x + 3. A slope of −1 means down 1 for each step right.',
        'Does > include the points on the line itself?',
        'Put (0, 0) into the inequality. If it makes a false statement, shade the side that does NOT hold (0, 0).',
      ],
      backUp: ['For < or >, the boundary line is…', ['dashed', 'solid'], 'dashed'],
      solution: {
        headline: 'Dashed line, shaded above.',
        reasoning: [
          'Boundary y = −x + 3: plot (0, 3), then go down 1 and right 1 to (1, 2).',
          '> does not include the points on the line, so the line is dashed.',
          'Test (0, 0): 0 > −0 + 3 is 0 > 3, which is false.',
          '(0, 0) is not a solution, so shade the other half-plane: above the line.',
        ],
        answerSummary: 'dashed line y = −x + 3, shaded above',
        commonError: 'Shading the side that holds (0, 0); the test is false, so (0, 0) is not a solution and the other side is shaded.',
      },
    }),
    graphInequality({
      id: 'tg-u10-q3',
      alignment: A3D,
      dok: 2,
      band: 3,
      prompt: 'Graph $x - y \\ge 3$. First rewrite it with y alone in the tool, and watch what happens to the symbol. Then graph it.',
      ...inequalityGraph({
        source: ['x - y >= 3'],
        constraints: [{ A: 1, B: -1, C: -3, relation: '>=' }],
        rewrite: true,
        directionSteps: ['Rewrite the inequality with y alone.', ...ONE_BUILD],
      }),
      hints: [
        'To get y alone, first subtract x from both sides.',
        'Now −y is alone. Divide both sides by −1. What happens to the symbol?',
        'Graph your new inequality. Then check (0, 0) in the ORIGINAL inequality.',
      ],
      backUp: ['When you divide both sides of an inequality by −1, the symbol…', ['reverses', 'stays the same'], 'reverses'],
      solution: {
        headline: 'Rewrite, reverse, graph.',
        reasoning: [
          'Subtract x from both sides: −y ≥ −x + 3.',
          'Divide both sides by −1 and reverse the symbol: y ≤ x − 3.',
          'Boundary y = x − 3: plot (0, −3) and (1, −2). ≤ makes the line solid.',
          'Shade below the line. Check (0, 0) in the original: 0 − 0 ≥ 3 is false, and (0, 0) is above the line.',
        ],
        answerSummary: 'y ≤ x − 3: solid, shaded below',
        commonError: 'Keeping ≥ after dividing by −1 and shading above; dividing by a negative number reverses the symbol.',
      },
    }),
    graphInequality({
      id: 'tg-u10-q4',
      alignment: teks('A.2H', 'A.3D'),
      dok: 2,
      band: 3,
      prompt: 'Notebooks cost $2 each and pens cost $1 each. Ava can spend at most $10. Let x be the number of notebooks and y be the number of pens. Enter the inequality in the tool: its coefficients, its symbol and the $10. Then graph it and test the point (3, 2).',
      ...inequalityGraph({
        modeling: [{ symbol: 'x', label: 'notebooks' }, { symbol: 'y', label: 'pens' }],
        constraints: [{ A: 2, B: 1, C: -10, relation: '<=' }],
        testPoint: { x: 3, y: 2 },
        graph: { xMin: 0, xMax: 10, yMin: 0, yMax: 12 },
        directionSteps: ['Enter the inequality in the tool.', ...ONE_BUILD, 'Test the point.'],
      }),
      hints: [
        'What do x notebooks cost at $2 each? What do y pens cost at $1 each?',
        'The two costs together can be at most $10. Which symbol means "at most"?',
        'To graph the boundary, find where it crosses each axis: let x = 0, then let y = 0.',
      ],
      backUp: ['"At most $10" means the total cost is…', ['less than or equal to 10', 'greater than or equal to 10'], 'less than or equal to 10'],
      notes: [
        ['Writing an inequality from words', 'Multiply each price by its variable and add. "At most" means ≤, "at least" means ≥, "less than" means <, and "more than" means >.'],
        ['Worked example', 'Apples cost $1 and melons cost $4, with at least $12 in sales: x + 4y ≥ 12.'],
      ],
      solution: {
        headline: 'Model, then graph.',
        reasoning: [
          'x notebooks cost 2x dollars and y pens cost y dollars, so the total is 2x + y.',
          '"At most $10" means 2x + y ≤ 10.',
          'The boundary crosses the axes at (5, 0) and (0, 10). ≤ makes it solid, and the side toward (0, 0) is shaded.',
          'Test (3, 2): 2(3) + 2 = 8, and 8 ≤ 10 is true. Ava can buy 3 notebooks and 2 pens.',
        ],
        answerSummary: '2x + y ≤ 10: solid, shaded below',
        commonError: 'Writing 2x + y ≥ 10; "at most $10" means the cost cannot go over 10, so the symbol is ≤.',
      },
      example: 'ex-model-inequality',
    }),
    graphInequality({
      id: 'tg-u10-q5',
      alignment: A3H,
      dok: 2,
      band: 3,
      prompt: 'Graph the system $y \\ge x - 2$ and $y < -x + 4$. Build each boundary line, choose solid or dashed for each, and shade. Then test the point (0, 0).',
      ...inequalityGraph({
        source: ['y >= x - 2', 'y < -x + 4'],
        constraints: [{ m: 1, b: -2, relation: '>=' }, { m: -1, b: 4, relation: '<' }],
        testPoint: { x: 0, y: 0 },
        directionSteps: [...TWO_BUILD, 'Test the point.'],
      }),
      hints: [
        'Graph one inequality at a time, just as you did before.',
        'One boundary is solid and one is dashed. Which symbol goes with which?',
        'A solution of the system must make BOTH inequalities true. Test (0, 0) in each one.',
      ],
      backUp: ['A point is a solution of a system of inequalities when it makes…', ['every inequality true', 'at least one inequality true'], 'every inequality true'],
      notes: [
        ['Systems of inequalities', 'Graph each inequality on the same plane. The solutions of the system are the points in the region where the shadings overlap.'],
        ['Worked example', 'For y > x and y ≤ 3, the point (1, 2) is a solution: 2 > 1 is true and 2 ≤ 3 is true.'],
      ],
      solution: {
        headline: 'Two half-planes, one overlap.',
        reasoning: [
          'y ≥ x − 2: solid line through (0, −2) and (1, −1), shaded above.',
          'y < −x + 4: dashed line through (0, 4) and (1, 3), shaded below.',
          'The solution set is the region where the two shadings overlap.',
          'Test (0, 0): 0 ≥ −2 is true and 0 < 4 is true, so (0, 0) is a solution of the system.',
        ],
        commonError: 'Shading only one inequality; the solutions of a system are only the points in BOTH shaded half-planes.',
      },
      example: 'ex-inequality-system',
    }),
    graphInequality({
      id: 'tg-u10-q6',
      alignment: A3H,
      dok: 3,
      band: 3,
      prompt: 'Graph the system $2x + y \\le 6$ and $x - y < 3$. Rewrite each inequality with y alone in the tool. Then build both boundaries, shade, and test the point (4, 2).',
      ...inequalityGraph({
        source: ['2x + y <= 6', 'x - y < 3'],
        constraints: [{ A: 2, B: 1, C: -6, relation: '<=' }, { A: 1, B: -1, C: -3, relation: '<' }],
        rewrite: true,
        testPoint: { x: 4, y: 2 },
        directionSteps: ['Rewrite each inequality with y alone.', ...TWO_BUILD, 'Test the point.'],
      }),
      hints: [
        'Get y alone in each inequality. In one of them you will divide by a negative number.',
        'When you divide by a negative number, reverse the symbol.',
        'Test (4, 2) in both of the ORIGINAL inequalities. It must make both true to be a solution.',
      ],
      backUp: ['−y < −x + 3 becomes…', ['y > x − 3', 'y < x − 3'], 'y > x − 3'],
      solution: {
        headline: 'Rewrite, build, shade, test.',
        reasoning: [
          '2x + y ≤ 6 becomes y ≤ −2x + 6: solid line, shaded below.',
          'x − y < 3 becomes −y < −x + 3, then y > x − 3: dashed line, shaded above.',
          'The solution set is the overlap of the two shaded half-planes.',
          'Test (4, 2): 2(4) + 2 = 10, and 10 ≤ 6 is false. The point fails the first inequality, so it is not a solution of the system.',
        ],
        commonError: 'Calling (4, 2) a solution because it makes x − y < 3 true; a solution must make both inequalities true, and 2(4) + 2 ≤ 6 is false.',
      },
    }),
  ],
  honors: [
    graphInequality({
      id: 'tg-u10-h1',
      alignment: teks('A.3H', 'A.2H'),
      dok: 3,
      band: 4,
      prompt: 'Honors. A club sells small candles for $4 and large candles for $8. It can make at most 10 candles, and it wants to collect at least $48. Let x be the number of small candles and y be the number of large candles. Enter the system in the tool and graph it. Then test the point (4, 5).',
      ...inequalityGraph({
        modeling: [{ symbol: 'x', label: 'small candles' }, { symbol: 'y', label: 'large candles' }],
        constraints: [{ A: 1, B: 1, C: -10, relation: '<=' }, { A: 4, B: 8, C: -48, relation: '>=' }],
        testPoint: { x: 4, y: 5 },
        graph: { xMin: 0, xMax: 14, yMin: 0, yMax: 12 },
        directionSteps: ['Enter both inequalities.', ...TWO_BUILD, 'Test the point.'],
      }),
      hints: [
        'There are two limits: one on the number of candles and one on the money.',
        '"At most" and "at least" use different symbols. Which goes with which limit?',
        'For each boundary, find where it crosses each axis. Then test (4, 5) in both inequalities.',
      ],
      backUp: ['The money from x small candles at $4 each is…', ['4x', 'x + 4'], '4x'],
      solution: {
        headline: 'Model, graph, test.',
        reasoning: [
          'Candles: x + y ≤ 10. Money: 4x + 8y ≥ 48.',
          'x + y = 10 crosses the axes at (10, 0) and (0, 10): solid, shaded below.',
          '4x + 8y = 48 crosses the axes at (12, 0) and (0, 6): solid, shaded above.',
          'Test (4, 5): 4 + 5 = 9 ≤ 10 is true, and 4(4) + 8(5) = 56 ≥ 48 is true. Making 4 small and 5 large candles works.',
        ],
        answerSummary: 'x + y ≤ 10 and 4x + 8y ≥ 48',
        commonError: 'Writing 4x + 8y ≤ 48; "at least $48" means the money must be 48 or more, so the symbol is ≥.',
      },
    }),
    graphInequality({
      id: 'tg-u10-h2',
      alignment: A3H,
      dok: 3,
      band: 4,
      prompt: 'Honors. Graph the system $y \\ge -2$, $x \\le 3$ and $y \\le x + 1$. Then classify the solution region and find its corners.',
      ...inequalityGraph({
        source: ['y >= -2', 'x <= 3', 'y <= x + 1'],
        constraints: [
          { orientation: 'horizontal', y: -2, relation: '>=' },
          { orientation: 'vertical', x: 3, relation: '<=' },
          { m: 1, b: 1, relation: '<=' },
        ],
        classify: true,
        vertices: true,
        directionSteps: ['Build all three boundary lines.', 'Choose solid or dashed for each.', 'Shade each half-plane and find the overlap.', 'Classify the region and find its corners.'],
      }),
      hints: [
        'y = −2 is a horizontal line and x = 3 is a vertical line.',
        'Shade each half-plane. Is the overlap closed in on every side?',
        'Each corner is where two boundary lines meet. To find one, use two of the boundary equations together.',
      ],
      backUp: ['The graph of x = 3 is…', ['a vertical line', 'a horizontal line'], 'a vertical line'],
      solution: {
        headline: 'A triangle.',
        reasoning: [
          'Shade above y = −2, to the left of x = 3 and below y = x + 1. All three lines are solid.',
          'The overlap is closed in on every side, so the region is bounded: a triangle.',
          'y = −2 and x = 3 meet at (3, −2). x = 3 and y = x + 1 meet at (3, 4).',
          'y = −2 and y = x + 1 meet where −2 = x + 1, so x = −3: the corner (−3, −2). Every corner is on solid lines, so all three are solutions.',
        ],
        answerSummary: 'bounded; corners (3, −2), (3, 4), (−3, −2)',
        commonError: 'Giving (0, 1), the y-intercept of y = x + 1, as a corner; a corner is where two of the boundary lines cross.',
      },
    }),
  ],
});

export const UNITS_8_TO_10 = [UNIT_8, UNIT_9, UNIT_10];

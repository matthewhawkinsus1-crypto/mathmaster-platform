/*
 * ALGEBRA I · MODULE 3 · TOPIC 2 · LESSON 5 — SYSTEMS OF LINEAR INEQUALITIES
 * (A.3H, with A.2H for writing the constraints), REGULAR AND HONORS.
 *
 * From the district's Lesson 5 slides (three 45-minute days): A River Runs
 * Through It (Noah's raft, Getting Started), Activity 5.1 Determining
 * Solutions to Systems of Linear Inequalities, Activity 5.2 Analyzing Graphs
 * of Systems of Linear Inequalities (x + y > 1 and −x + y ≤ 3, Ava's error,
 * the parallel and vertical systems), Activity 5.3 Applying Systems of Linear
 * Inequalities (Emma's workout), Activity 5.4 Identifying Systems of Linear
 * Inequalities (systems A–D, Isabella's error) and Talk the Talk (Get to Know
 * the Region). The order changes once: Classwork opens with a plain system,
 * y > x − 2 and y ≤ −x + 4 (CW 17, not on the slides), then Activity 5.2's
 * x + y > 1 and −x + y ≤ 3, then Noah's raft (Getting Started and Activity
 * 5.1), so the first system a student builds is not a word problem in
 * standard form.
 *
 * The Warm-Up climbs from Lesson 4 to this lesson: one inequality graphed in
 * the tool, then a point checked against two inequalities at once, then two
 * constraints written for one situation — a system before it has the name.
 *
 * Every system a student graphs is built in the Systems Workspace: each
 * boundary, solid or dashed, each half-plane, then the overlap and, where the
 * item asks, a test point, the student's own point, the kind of region and
 * its corners. Emma's calorie line, 6.9x + 10.4y = 400, passes through no
 * whole-number point a student could plot, so her system is drawn by the
 * tool (the slides say "use technology") and the student tests points on it.
 *
 * The Honors file is the same lesson from the same slides, with Honors depth:
 * standard-form systems to rewrite in the Warm-Up, Practice and Exit Ticket,
 * a parameter, a bounded region with its corners and area, a sort of systems
 * by the shape of their solution sets, Emma's corners found algebraically,
 * and two audited Digital SAT items from MathMaster's CCMR bank in Practice.
 */
import { auditedCcmrQuestion, backUp, choice, guidedNotes, inequality, number, review, sortBoard, teks } from '../lib/lessonKit.mjs';
import { A3D, A3H, A3H_MODEL, FIGURE_WINDOW, computedChoice, inequalityBuild, inequalityFigure, tex } from './shared.mjs';

const FOLDER = 'Algebra I/Module 3/Topic 2/Lesson 5';
// Writing the constraints of a situation (A.2H) for the system it makes (A.3H).
const A2H_SYSTEM = teks('A.2H', 'A.3H');

const BOTH_OR_NOT = ['Yes — it meets both constraints', 'No — it fails only the first constraint', 'No — it fails only the second constraint', 'No — it fails both constraints'];

/* ----------------------------------------------------------- Warm-Up */

const oneInequalityWarmup = (id, honors) => inequalityBuild({
  questionId: id,
  alignment: A3D,
  dok: 1,
  difficultyBand: 2,
  prompt: honors
    ? tex`One inequality first. Graph $y \ge {{sg|coef}}\frac{ {{pa}} }{ {{q}} }x {{b|signed}}$ and test the point (0, 0). In this lesson you graph two inequalities on one plane, and the solutions are where the shading overlaps.`
    : tex`One inequality first. Graph $y \le {{m|coef}}x {{b|signed}}$ and test the point (0, 0). In this lesson you graph two inequalities on one plane, and the solutions are where the shading overlaps.`,
  source: honors ? ['y >= {{sg|coef}}({{pa}}/{{q}})x {{b|signed}}'] : ['y <= {{m|coef}}x {{b|signed}}'],
  constraints: [{ m: '{{m}}', b: '{{b}}', relation: honors ? '>=' : '<=' }],
  testPoint: { x: 0, y: 0 },
  directionSteps: ['Build the boundary line.', 'Choose solid or dashed.', 'Shade the half-plane of solutions.', 'Test the point.'],
  hints: [
    'Plot the y-intercept first, then use the slope.',
    honors ? '≥ includes the boundary; solved for y, it shades above.' : '≤ includes the boundary; solved for y, it shades below.',
    'Substitute (0, 0) to check the side you shaded.',
  ],
  scaffold: backUp('For ≤ or ≥, the boundary line is…', ['solid', 'dashed'], 'solid'),
  guidedNotes: guidedNotes(
    ['One inequality', 'Boundary line, then solid (≤, ≥) or dashed (<, >), then the side that makes the inequality true.'],
    ['Coming up', 'A system graphs two inequalities on one plane. Its solutions are the points in BOTH shaded half-planes.'],
  ),
  solutionReview: honors
    ? review('Solid line, shaded above.', ['Plot (0, {{b}}), then use a rise of {{p}} and a run of {{q}}.', '≥ includes the line: solid. Shade above; (0, 0) checks the side.'], 'solid, above', 'Swapping the rise and the run.')
    : review('Solid line, shaded below.', ['Boundary y = {{m|coef}}x {{b|signed}}: plot (0, {{b}}) and (1, {{mb}}).', '≤ includes the line: solid. Shade below; (0, 0) checks the side.'], 'solid, below', 'Choosing the side from the slope: the symbol decides the side.'),
  generator: honors
    ? { parameters: { pa: { type: 'int', min: 1, max: 3 }, sg: { type: 'choice', values: [-1, 1] }, q: { type: 'int', min: 2, max: 4 }, b: { type: 'int', min: -5, max: 5, exclude: [0] } }, derived: { p: 'sg*pa', m: 'sg*pa/q' }, constraints: ['gcd(pa, q) == 1'] }
    : { parameters: { m: { type: 'int', min: -3, max: 3, exclude: [0] }, b: { type: 'int', min: -6, max: 6, exclude: [0] } }, derived: { mb: 'm + b' } },
  questionFamily: { scope: 'assignment' },
});

const twoConditionsWarmup = (id) => ({
  questionId: id,
  ...A3H,
  studentActions: ['multipleResponses'],
  dok: 2,
  difficultyBand: 2,
  prompt: tex`Two conditions at once. A point is a solution of a system only when it makes EVERY inequality true. Check both points in the system $y > x {{b1|signed}}$ and $y \le -x {{b2|signed}}$.`,
  directionSteps: ['Substitute the first point into both inequalities.', 'Substitute the second point into both inequalities.', 'Decide which point solves the system.'],
  responses: [
    number('c1', 'How many of the two inequalities does ({{p1x}}, {{p1y}}) make true?', '{{c1}}'),
    number('c2', 'How many of the two inequalities does ({{p2x}}, {{p2y}}) make true?', '{{c2}}'),
    computedChoice('which', 'Which point is a solution of the system?', ['({{p1x}}, {{p1y}})', '({{p2x}}, {{p2y}})', 'Both points', 'Neither point'], '({{x1}}, {{yA}})'),
  ],
  hints: [
    'Substitute the point’s x-coordinate into each right side, then compare the result with its y-coordinate.',
    'A point that makes only one of the inequalities true is not a solution of the system.',
  ],
  scaffold: backUp('A solution of a system must make…', ['every inequality true', 'at least one inequality true'], 'every inequality true'),
  guidedNotes: guidedNotes(['Solution of a system', 'A point solves a system of inequalities only when it makes every inequality in the system true.']),
  solutionReview: {
    headline: 'Check each point in BOTH inequalities.',
    reasoning: [
      '({{x1}}, {{yA}}): {{yA}} > {{x1}} {{b1|signed}} and {{yA}} ≤ −({{x1}}) {{b2|signed}}, so it makes both true.',
      '({{x2}}, {{yB}}) makes y > x {{b1|signed}} true but y ≤ −x {{b2|signed}} false, so it is not a solution of the system.',
    ],
    answerSummary: '({{x1}}, {{yA}})',
    commonError: 'Calling a point a solution of the system when it makes only one of the inequalities true.',
  },
  generator: {
    parameters: {
      b1: { type: 'int', min: -4, max: 2, exclude: [0] },
      g: { type: 'int', min: 3, max: 6 },
      x1: { type: 'int', min: -3, max: 3 },
      t: { type: 'int', min: 0, max: 2 },
      x2: { type: 'int', min: -3, max: 3 },
      u: { type: 'int', min: 0, max: 2 },
      s: { type: 'int', min: 0, max: 1 },
    },
    derived: {
      // At x1 the region runs from x1 + b1 (left out) up to x1 + b1 + g (kept).
      b2: '2*x1 + b1 + g',
      yA: 'x1 + b1 + 1 + t',
      // Above both lines at x2: true for the first inequality only.
      yB: 'max(x2 + b1, 2*x1 + b1 + g - x2) + 1 + u',
      p1x: 's*x1 + (1 - s)*x2',
      p1y: 's*yA + (1 - s)*yB',
      p2x: 's*x2 + (1 - s)*x1',
      p2y: 's*yB + (1 - s)*yA',
      c1: '1 + s',
      c2: '2 - s',
    },
    constraints: ['x1 != x2', '2*x1 + b1 + g != 0'],
  },
  questionFamily: { scope: 'assignment' },
});

const twoConstraintsWarmup = (id) => ({
  questionId: id,
  ...A2H_SYSTEM,
  studentActions: ['multipleResponses'],
  dok: 2,
  difficultyBand: 2,
  prompt: 'Two constraints, one situation. A van holds at most {{n}} people. Adults pay ${{p}} and students pay ${{q}} for a museum trip, and the trip must collect at least ${{M}}. Let x be the number of adults and y the number of students. Write an inequality for each constraint, then find what {{x0}} adults and {{y0}} students would pay.',
  directionSteps: ['Write the inequality for the seats in the van.', 'Write the inequality for the money.', 'Find the money the group would pay.'],
  responses: [
    inequality('seats', 'Seats in the van', 'x + y <= {{n}}'),
    inequality('money', 'Money for the trip', '{{p}}x + {{q}}y >= {{M}}'),
    number('paid', 'Money paid by {{x0}} adults and {{y0}} students ($)', '{{R}}'),
  ],
  hints: ['People: adults plus students is at most the number of seats.', 'Money: each group’s price times its count, added, is at least the goal.', '"At most" is ≤; "at least" is ≥.'],
  scaffold: backUp('"At most" means…', ['≤', '≥'], '≤'),
  solutionReview: review(
    'One inequality for each constraint.',
    ['Seats: x + y ≤ {{n}}.', 'Money: {{p}}x + {{q}}y ≥ {{M}}.', '{{p}}({{x0}}) + {{q}}({{y0}}) = {{R}}.'],
    'x + y ≤ {{n}}; {{p}}x + {{q}}y ≥ {{M}}; {{R}}',
    'Using the same symbol for both constraints: the seats are a ceiling, the money is a floor.',
  ),
  generator: {
    parameters: { n: { type: 'int', min: 10, max: 15 }, p: { type: 'int', min: 12, max: 20 }, q: { type: 'int', min: 5, max: 10 }, k: { type: 'int', min: 10, max: 20 }, x0: { type: 'int', min: 2, max: 5 }, y0: { type: 'int', min: 3, max: 8 } },
    derived: { M: 'k*10', R: 'p*x0 + q*y0' },
    constraints: ['x0 + y0 <= n'],
  },
  questionFamily: { scope: 'assignment' },
});

/* --------------------------------------------------------- Classwork */

const noahStory = 'Noah guides groups of adults and children down a river. His raft holds 800 pounds; more weight can make it sink, hit more rocks or maneuver more slowly. Each adult weighs about 200 pounds and each child about 100 pounds. Noah charges adults $75 and children $50, and his goal is to earn at least $150 each trip. Let x be the number of adults and y the number of children.';

/*
 * Activity 5.4's four systems, and what each one is matched with. The graphs
 * and the solution sets are drawn from these tables (N38), the same ones the
 * keys are written from, so a figure cannot show another system than its key.
 */
const SYSTEM_KEYS = Object.freeze({
  A: ['y < (3/5)x + 3', 'y > −(3/5)x + 3'],
  B: ['y > (3/5)x + 3', 'y > −(3/5)x + 3'],
  C: ['y > (3/5)x + 3', 'y < −(3/5)x + 3'],
  D: ['y < (3/5)x + 3', 'y < −(3/5)x + 3'],
});
const systemText = (name) => `System ${name}: ${SYSTEM_KEYS[name][0]} and ${SYSTEM_KEYS[name][1]}.`;
const SYSTEM_A = systemText('A');
const SYSTEM_B = systemText('B');
const SYSTEM_C = systemText('C');
const SYSTEM_D = systemText('D');
const FOUR_SYSTEMS = `The four systems use the same two dashed boundary lines, the rising line y = (3/5)x + 3 and the falling line y = −(3/5)x + 3, which cross at (0, 3). ${SYSTEM_A} ${SYSTEM_B} ${SYSTEM_C} ${SYSTEM_D}`;
// CW 12: the graph each system shades. Graph D is blank: CW 14 graphs System B on it.
const GRAPH_OF_SYSTEM = Object.freeze({ A: 'C', B: 'D', C: 'B', D: 'A' });
const GRAPH_OPTIONS = ['Graph A', 'Graph B', 'Graph C', 'Graph D (the blank one)'];
const graphOption = (graph) => GRAPH_OPTIONS.find((option) => option.startsWith(`Graph ${graph}`));
const systemOfGraph = (graph) => Object.keys(GRAPH_OF_SYSTEM).find((system) => GRAPH_OF_SYSTEM[system] === graph);
const SYSTEM_GRAPHS = Object.freeze({
  candidateGraphs: ['A', 'B', 'C', 'D'].map((graph) => ({
    id: graph,
    label: `Graph ${graph}`,
    graph: graph === 'D' ? { ...FIGURE_WINDOW } : inequalityFigure(SYSTEM_KEYS[systemOfGraph(graph)], { shade: 'overlap' }),
  })),
  candidateGraphsInOrder: true,
});
// CW 13: Possible Solutions A–C, each plotted with the systems' two boundary
// lines, and the system each set solves. D is blank: the student completes it.
const POSSIBLE_SOLUTIONS = Object.freeze({ A: [[0, -6], [4, -4]], B: [[0, 7.5], [-4, 10]], C: [[-6, 4], [-10, 8]], D: [] });
const SOLUTIONS_OF_SYSTEM = Object.freeze({ A: 'D', B: 'B', C: 'C', D: 'A' });
const SOLUTION_OPTIONS = ['Possible Solutions A', 'Possible Solutions B', 'Possible Solutions C', 'Possible Solutions D (to complete)'];
const solutionOption = (set) => SOLUTION_OPTIONS.find((option) => option.startsWith(`Possible Solutions ${set}`));
const pairText = ([x, y]) => `(${x}, ${y})`.replace(/-/g, '−');
const SOLUTION_GRAPHS = Object.freeze({
  candidateGraphs: ['A', 'B', 'C', 'D'].map((set) => ({
    id: set,
    label: `Possible Solutions ${set}`,
    graph: inequalityFigure(SYSTEM_KEYS[Object.keys(SOLUTIONS_OF_SYSTEM).find((system) => SOLUTIONS_OF_SYSTEM[system] === set)], {
      shade: 'none',
      points: POSSIBLE_SOLUTIONS[set].map(([x, y]) => ({ x, y, label: pairText([x, y]) })),
    }),
  })),
  candidateGraphsInOrder: true,
});
const REGIONS = ['A region above both lines', 'A region below both lines', 'A region between the lines', 'No solution'];
// PR 10: the system its graph shows, one box per boundary.
const SYSTEM_FROM_GRAPH_KEYS = Object.freeze({ solid: 'y >= x + 2', dashed: 'y < -x + 5' });

const classwork = (P) => [
  // The plainest system first (F-L5-HARDEST-FIRST in
  // docs/qa/2026-11-03-pr537-walkthrough/findings.md): two slope-intercept
  // boundaries with whole-number slopes and an overlap, the case Practice 1 and
  // Exit Ticket 1 test. Activity 5.2's system follows (each inequality rewritten
  // first), then Noah's raft, a word problem in standard form, with his four
  // items together and in order. Every other id keeps its number.
  inequalityBuild({
    questionId: `${P}-cw-17`,
    alignment: A3H,
    dok: 2,
    difficultyBand: 2,
    prompt: tex`Graph a system of two inequalities: $y > x - 2$ and $y \le -x + 4$. Build each boundary line, choose solid or dashed for each, and shade each half-plane — the overlap is the solution set. Then test the point (0, 0), and choose a point of your own in the overlap.`,
    source: ['y > x - 2', 'y <= -x + 4'],
    constraints: [{ m: 1, b: -2, relation: '>' }, { m: -1, b: 4, relation: '<=' }],
    testPoint: { x: 0, y: 0 },
    studentTestPoint: true,
    directionSteps: ['Build both boundary lines.', 'Choose solid or dashed for each.', 'Shade each half-plane and find the overlap.', 'Test the marked point.', 'Choose a point of your own in the overlap.'],
    hints: ['Build each boundary from its y-intercept and slope.', 'One boundary is dashed and one is solid: which symbol leaves its line out?', 'The solutions are the points shaded by BOTH inequalities.'],
    scaffold: backUp('A point is a solution of a system when it is…', ['in both shaded half-planes', 'in at least one shaded half-plane'], 'in both shaded half-planes'),
    guidedNotes: guidedNotes(
      ['Solution set of a system', 'The solution set of a system of linear inequalities is the intersection of the solutions of its inequalities: every point in the overlap satisfies every inequality.'],
      ['Shade each one', 'Shade each half-plane in its own way; the region shaded twice is the solution set.'],
    ),
    solutionReview: review(
      'Two half-planes, one overlap.',
      ['y > x − 2: a dashed boundary through (0, −2) and (2, 0), shaded above. y ≤ −x + 4: a solid boundary through (0, 4) and (4, 0), shaded below.', '(0, 0) is in the overlap: 0 > −2 and 0 ≤ 4. The boundaries meet at (3, 1), on the dashed line, so that corner is not a solution.'],
      'above the dashed line and on or below the solid line',
      'Shading only one inequality: the solution set is where both shadings overlap.',
    ),
  }),
  inequalityBuild({
    questionId: `${P}-cw-5`,
    alignment: A3H,
    dok: 3,
    difficultyBand: 3,
    prompt: tex`Activity 5.2 — Analyzing Graphs of Systems of Linear Inequalities. Graph the system $x + y > 1$ and $-x + y \le 3$. Rewrite each inequality with y alone in the tool (notice the symbols), build both boundaries and shade. Then test the point (−8, 2), choose a point of your own, classify the solution region and find its corner.`,
    source: ['x + y > 1', '-x + y <= 3'],
    constraints: [{ A: 1, B: 1, C: -1, relation: '>' }, { A: -1, B: 1, C: -3, relation: '<=' }],
    rewrite: true,
    testPoint: { x: -8, y: 2 },
    studentTestPoint: true,
    classify: true,
    vertices: true,
    directionSteps: ['Rewrite each inequality with y alone.', 'Build both boundary lines.', 'Choose solid or dashed for each.', 'Shade each half-plane and find the overlap.', 'Test the marked point and a point of your own.', 'Classify the region and find its corner.'],
    hints: ['x + y > 1 becomes y > −x + 1; −x + y ≤ 3 becomes y ≤ x + 3.', 'One boundary is dashed and one is solid: which is which?', 'The corner is where the boundary lines meet. Is it on a dashed line?'],
    scaffold: backUp('For x + y > 1, the boundary is…', ['dashed', 'solid'], 'dashed'),
    solutionReview: review(
      'Rewrite, build, shade, reason.',
      ['y > −x + 1 (dashed, above) and y ≤ x + 3 (solid, below).', '(−8, 2) satisfies neither inequality. The region is unbounded, and its corner (−1, 2) is on the dashed line, so it is not a solution.'],
      null,
      'Including the corner (−1, 2): it fails x + y > 1, because 1 is not greater than 1.',
    ),
  }),
  {
    questionId: `${P}-cw-6`,
    ...A3H,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 3,
    prompt: 'Use the system x + y > 1 and −x + y ≤ 3. The two boundary lines cut the plane into four regions, and each point below lies in a different one: decide which inequalities it makes true. Then evaluate Ava’s claim: "The intersection point is always a solution to a system of inequalities because that is where the two lines meet."',
    directionSteps: ['Substitute each point into both inequalities.', 'Decide which inequalities each point makes true.', 'Check the point where the two boundary lines meet.', 'Explain why Ava is wrong.'],
    responses: [
      choice('p1', '(2, 2)', ['both inequalities — it is in the overlap', 'only x + y > 1', 'only −x + y ≤ 3', 'neither inequality'], 'both inequalities — it is in the overlap'),
      choice('p2', '(0, 5)', ['both inequalities — it is in the overlap', 'only x + y > 1', 'only −x + y ≤ 3', 'neither inequality'], 'only x + y > 1'),
      choice('p3', '(0, −2)', ['both inequalities — it is in the overlap', 'only x + y > 1', 'only −x + y ≤ 3', 'neither inequality'], 'only −x + y ≤ 3'),
      choice('p4', '(−8, 2)', ['both inequalities — it is in the overlap', 'only x + y > 1', 'only −x + y ≤ 3', 'neither inequality'], 'neither inequality'),
      number('s1', 'At the intersection (−1, 2): x + y =', '1'),
      number('s2', 'At (−1, 2): −x + y =', '3'),
      // Every option is a claim with a reason, each wrong one wrong in one
      // way, so the key is not the longest (F-LONGEST-IS-RIGHT).
      choice('ava', 'Why is Ava wrong?', [
        'At (−1, 2), x + y is not greater than 1: the point is on the dashed boundary, so it is not a solution',
        'Ava is right: (−1, 2) is on both boundary lines, and a point on a boundary always makes its inequality true',
        'At (−1, 2), −x + y is not at most 3: the point is on the solid boundary, so it is not a solution',
        'An intersection point is never a solution of a system, because it sits on both boundary lines',
      ], 'At (−1, 2), x + y is not greater than 1: the point is on the dashed boundary, so it is not a solution'),
    ],
    hints: ['Substitute each point into x + y and into −x + y, then compare with each right side.', 'Only the region shaded by both inequalities holds solutions of the system.', 'On a dashed boundary, the inequality is false.'],
    scaffold: backUp('Is 1 > 1 true?', ['no', 'yes'], 'no'),
    solutionReview: review(
      'Each region, then the corner.',
      ['(2, 2): 4 > 1 and 0 ≤ 3, both. (0, 5): 5 > 1 but 5 ≤ 3 is false. (0, −2): −2 > 1 is false, −2 ≤ 3 true. (−8, 2): neither.', '(−1, 2): x + y = 1, and 1 > 1 is false, so the intersection point is not a solution, even though both lines pass through it.'],
      'both; only the first; only the second; neither; Ava is wrong',
      'Treating the intersection as a solution because the lines meet there: check it in every inequality.',
    ),
  },
  {
    questionId: `${P}-cw-1`,
    ...A2H_SYSTEM,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: `Getting Started — A River Runs Through It. ${noahStory} Write an inequality for the most weight the raft can carry and one for the money Noah wants to collect. Together they make a system of linear inequalities that models Noah’s trips.`,
    directionSteps: ['Write the inequality for the weight.', 'Write the inequality for the money.', 'Explain why both inequalities use x and y the same way.'],
    responses: [
      inequality('weight', 'Weight in the raft', '200x + 100y <= 800'),
      inequality('money', 'Money Noah collects', '75x + 50y >= 150'),
      choice('same', 'Why must x and y mean the same thing in both inequalities?', [
        'A solution must meet both constraints at once, so x and y must count the same people in each',
        'Each inequality is about a different trip, so x and y can count different people in each of them',
        'Only the weight inequality needs x and y, because the money depends on the prices alone',
        'The money inequality should use other letters, because it counts dollars, not people',
      ], 'A solution must meet both constraints at once, so x and y must count the same people in each'),
    ],
    hints: [
      'Weight: (pounds per adult)(adults) + (pounds per child)(children) is at most the raft’s limit.',
      'Money: (price per adult)(adults) + (price per child)(children) is at least Noah’s goal.',
      '"Holds" a limit means at most (≤); a goal of "at least" means ≥.',
    ],
    scaffold: backUp('The weight of x adults at about 200 pounds each is…', ['200x', 'x + 200'], '200x'),
    guidedNotes: guidedNotes(
      ['Constraints', 'In a system of linear inequalities, the inequalities are called constraints: they "constrain" the solutions to one region of the graph.'],
      ['Same variables', 'Every inequality in a system uses the same variables, defined the same way.'],
    ),
    solutionReview: review(
      'One inequality per constraint, with the same variables.',
      ['Weight: 200x + 100y ≤ 800 (at most the raft’s 800 pounds).', 'Money: 75x + 50y ≥ 150 (at least Noah’s goal).', 'The system is both together: a trip must meet both.'],
      '200x + 100y ≤ 800 and 75x + 50y ≥ 150',
      'Reversing a symbol: the raft’s limit is a ceiling (≤), the money goal is a floor (≥).',
    ),
  },
  {
    questionId: `${P}-cw-2`,
    ...A3H,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 2,
    prompt: 'Activity 5.1 — Determining Solutions to Systems of Linear Inequalities. Noah’s system is 200x + 100y ≤ 800 (weight) and 75x + 50y ≥ 150 (money). Decide whether each trip is a solution of the system, and what that means. First trip: 2 adults and 2 children. Second trip: 5 adults.',
    directionSteps: ['Find the weight and the money for the first trip.', 'Decide whether the first trip is a solution.', 'Do the same for the second trip.', 'Explain what the results mean for Noah.'],
    responses: [
      number('w1', 'First trip: weight (pounds)', '600'),
      number('m1', 'First trip: money ($)', '250'),
      choice('trip1', 'Is the first trip a solution of the system?', BOTH_OR_NOT, 'Yes — it meets both constraints'),
      number('w2', 'Second trip: weight (pounds)', '1000'),
      number('m2', 'Second trip: money ($)', '375'),
      choice('trip2', 'Is the second trip a solution of the system?', BOTH_OR_NOT, 'No — it fails only the first constraint'),
      choice('meaning', 'What do the results mean for Noah?', [
        'The first trip is safe and meets his goal; the second earns enough but is too heavy for the raft',
        'The first trip is safe and meets his goal; the second is safe too, because it earns even more',
        'The first trip is too heavy for the raft; the second is safe and earns more than enough',
        'The first trip is safe but misses his goal; the second earns enough but is too heavy for the raft',
      ], 'The first trip is safe and meets his goal; the second earns enough but is too heavy for the raft'),
    ],
    hints: ['Weight: multiply each count by its weight and add.', 'Money: multiply each count by its price and add.', 'A trip solves the system only when it meets every constraint.'],
    scaffold: backUp('A combination is a solution of a system when it meets…', ['every constraint', 'one constraint'], 'every constraint'),
    solutionReview: review(
      'Substitute each trip into both constraints.',
      ['First trip: 200(2) + 100(2) = 600 ≤ 800 and 75(2) + 50(2) = 250 ≥ 150 — a solution.', 'Second trip: 200(5) = 1000, more than 800, though 75(5) = 375 ≥ 150 — not a solution: the raft is overloaded.'],
      'first trip: yes; second trip: no (too heavy)',
      'Calling the second trip a solution because it earns more: it must also meet the weight limit.',
    ),
  },
  inequalityBuild({
    questionId: `${P}-cw-3`,
    alignment: A3H_MODEL,
    dok: 2,
    difficultyBand: 3,
    prompt: `Graph Noah’s system. ${noahStory} Enter both constraints of the model in the tool, then build each boundary line, choose solid or dashed, and shade each half-plane — the overlap is the solution set. Test the marked point (2, 2), then choose a point of your own in the overlap.`,
    modeling: { variables: [{ symbol: 'x', label: 'adults' }, { symbol: 'y', label: 'children' }] },
    constraints: [{ A: 200, B: 100, C: -800, relation: '<=' }, { A: 75, B: 50, C: -150, relation: '>=' }],
    testPoint: { x: 2, y: 2 },
    studentTestPoint: true,
    graph: { xMin: 0, xMax: 10, yMin: 0, yMax: 10 },
    directionSteps: ['Enter both constraints.', 'Build each boundary line.', 'Choose solid or dashed for each.', 'Shade each half-plane and find the overlap.', 'Test the marked point.', 'Choose a point of your own in the overlap.'],
    // Hint 1 asks for the intercepts and says how to find them; it used to give
    // all four, which is the whole boundary step (F-HINT-GIVES-STEP).
    hints: ['Where does each boundary line cross the axes? Find y when x = 0, and x when y = 0.', 'Both symbols include equality.', 'The solutions are the points shaded by BOTH inequalities.'],
    scaffold: backUp('The solution set of a system is…', ['where the shaded half-planes overlap', 'everything either inequality shades'], 'where the shaded half-planes overlap'),
    solutionReview: review(
      'Two constraints, one overlap.',
      ['Weight: solid boundary through (4, 0) and (0, 8), shaded below. Money: solid boundary through (2, 0) and (0, 3), shaded above.', 'The overlap lies between the two lines; (2, 2) is in it: 600 ≤ 800 and 250 ≥ 150.'],
      'the region between the two solid lines',
      'Shading only one inequality: the solution set is where both are shaded.',
    ),
  }),
  {
    questionId: `${P}-cw-4`,
    ...A3H,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 3,
    prompt: 'Analyze Noah’s graph. The two boundary lines, 200x + 100y = 800 and 75x + 50y = 150, intersect at (10, −12), outside the first quadrant. Is the intersection point a solution? Describe the possible number of solutions of a system, and find a combination of rafters that is not a solution.',
    directionSteps: ['Substitute the intersection point into both expressions.', 'Decide whether it is a solution, and whether it makes sense for Noah.', 'Describe how many solutions a system can have.', 'Find the combination that is not a solution.'],
    responses: [
      number('wInt', 'At (10, −12): 200x + 100y =', '800'),
      number('mInt', 'At (10, −12): 75x + 50y =', '150'),
      choice('intSol', 'Is (10, −12) a solution of the system?', [
        'Yes — it makes both inequalities true, because each one includes its boundary',
        'No — the lines only cross there, and a crossing point is never a solution',
        'Yes — every intersection point is a solution of every system of two inequalities',
        'No — it makes the weight inequality false, because 800 is not less than 800',
      ], 'Yes — it makes both inequalities true, because each one includes its boundary'),
      choice('context', 'Does (10, −12) make sense for Noah?', [
        'No — there cannot be −12 children: only whole numbers, 0 or more, make sense',
        'Yes — it is a solution of the system, so it is a trip Noah can take with his raft',
        'No — 10 adults would weigh 2,000 pounds, more than the raft holds',
        'Yes — the raft holds exactly its 800-pound limit, so the trip is safe',
      ], 'No — there cannot be −12 children: only whole numbers, 0 or more, make sense'),
      choice('count', 'How many solutions can a system of two linear inequalities have?', ['none, or infinitely many', 'exactly one', 'exactly two', 'always infinitely many'], 'none, or infinitely many'),
      choice('notSol', 'Which combination is NOT a solution for Noah?', ['1 adult and 2 children', '3 adults and 3 children', '0 adults and 4 children', '2 adults and 1 child'], '3 adults and 3 children'),
    ],
    hints: ['Substitute the point into each expression and compare with the raft’s limit and Noah’s goal.', 'A solid boundary (≤ or ≥) includes its points.', 'Check each combination of rafters in both constraints.'],
    scaffold: backUp('A point on a solid boundary line makes that inequality…', ['true', 'false'], 'true'),
    solutionReview: review(
      'On both solid lines: a solution, but not a sensible one.',
      ['200(10) + 100(−12) = 800 ≤ 800 and 75(10) + 50(−12) = 150 ≥ 150, so (10, −12) solves the system — but −12 children is impossible.', 'Two inequalities either share no points or share a whole region, so a system has no solution or infinitely many.', '3 adults and 3 children weigh 900 pounds, more than 800.'],
      'yes, but not for Noah; none or infinitely many; 3 adults and 3 children',
      'Assuming an intersection point is never a solution: it is when both boundaries are solid.',
    ),
  },
  inequalityBuild({
    questionId: `${P}-cw-7`,
    alignment: A3H,
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Solve the system by graphing: $y > 5x + 3$ and $y < 5x - 3$. Build both boundaries and shade, then classify the solution region.`,
    source: ['y > 5x + 3', 'y < 5x - 3'],
    constraints: [{ m: 5, b: 3, relation: '>' }, { m: 5, b: -3, relation: '<' }],
    classify: true,
    directionSteps: ['Build both boundary lines.', 'Choose solid or dashed for each.', 'Shade each half-plane.', 'Classify the solution region.'],
    hints: ['Compare the slopes of the two boundaries.', 'One inequality shades above the higher line; the other shades below the lower line.', 'Do the shaded half-planes overlap anywhere?'],
    scaffold: backUp('Two boundary lines with the same slope are…', ['parallel', 'perpendicular'], 'parallel'),
    solutionReview: review(
      'Parallel boundaries, shading away from each other.',
      ['Both lines have slope 5: they are parallel, 6 units apart on the y-axis.', 'The shading is above the upper line and below the lower line, so nothing is shaded twice: no solution.'],
      'No solution',
      'Assuming every system has solutions: parallel boundaries can shade away from each other.',
    ),
  }),
  inequalityBuild({
    questionId: `${P}-cw-8`,
    alignment: A3H,
    dok: 2,
    difficultyBand: 2,
    prompt: tex`Solve the system by graphing: $x \ge -5$ and $x \ge 1$. Then classify the solution region and choose a point of your own that is a solution.`,
    source: ['x >= -5', 'x >= 1'],
    constraints: [{ orientation: 'vertical', x: -5, relation: '>=' }, { orientation: 'vertical', x: 1, relation: '>=' }],
    classify: true,
    studentTestPoint: true,
    directionSteps: ['Build both vertical boundary lines.', 'Choose solid or dashed for each.', 'Shade each half-plane.', 'Classify the region and choose a solution of your own.'],
    hints: ['x = c is a vertical line: use the vertical-line method.', 'x ≥ c shades to the right of the line.', 'Which shading lies inside the other?'],
    scaffold: backUp('The graph of x ≥ 1 is the half-plane…', ['to the right of x = 1', 'above y = 1'], 'to the right of x = 1'),
    solutionReview: review(
      'One half-plane inside the other.',
      ['Both boundaries are solid vertical lines; both shade to the right.', 'Every point with x ≥ 1 also has x ≥ −5, so the solution set is x ≥ 1: an unbounded region.'],
      'x ≥ 1 (unbounded)',
      'Shading between the lines: both inequalities shade to the right.',
    ),
  }),
  {
    questionId: `${P}-cw-9`,
    ...A2H_SYSTEM,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: 'Activity 5.3 — Applying Systems of Linear Inequalities. Emma and her friends use the fitness room after school, where a sign gives the calories burned per minute. Emma uses the stair stepper. She has at most 45 minutes to exercise and wants to burn at least 400 calories. Let x be her minutes at light effort and y her minutes at vigorous effort. Write the system that models Emma’s workout.',
    table: {
      columns: [{ key: 'exercise', label: 'Exercise' }, { key: 'calories', label: 'Calories burned per minute' }],
      rows: [
        { exercise: 'Treadmill — light effort', calories: '7.6' },
        { exercise: 'Treadmill — vigorous effort', calories: '12.4' },
        { exercise: 'Stair stepper — light effort', calories: '6.9' },
        { exercise: 'Stair stepper — vigorous effort', calories: '10.4' },
        { exercise: 'Stationary bike — light effort', calories: '5.5' },
        { exercise: 'Stationary bike — vigorous effort', calories: '11.1' },
      ],
    },
    directionSteps: ['Find the stair stepper rows of the table.', 'Write the inequality for the minutes.', 'Write the inequality for the calories.'],
    responses: [
      inequality('time', 'Minutes of exercise', 'x + y <= 45'),
      inequality('calories', 'Calories burned', '6.9x + 10.4y >= 400'),
      number('allVigorous', 'Calories burned in 45 minutes, all at vigorous effort', '468'),
    ],
    hints: ['Only the stair stepper rows matter for Emma.', 'Minutes: light plus vigorous is at most her time.', 'Calories: calories per minute times minutes, for each effort, added.'],
    scaffold: backUp('Calories burned in y minutes at 10.4 calories per minute are…', ['10.4y', 'y + 10.4'], '10.4y'),
    solutionReview: review(
      'Time is a ceiling, calories a floor.',
      ['Minutes: x + y ≤ 45.', 'Calories: 6.9x + 10.4y ≥ 400 (stair stepper rows).', 'All vigorous: 10.4(45) = 468 calories.'],
      'x + y ≤ 45 and 6.9x + 10.4y ≥ 400',
      'Using the treadmill or bike rates: Emma uses the stair stepper.',
    ),
  },
  inequalityBuild({
    questionId: `${P}-cw-10`,
    alignment: A3H_MODEL,
    dok: 2,
    difficultyBand: 3,
    prompt: 'Emma’s system is graphed for you in the tool, the way technology would graph it: x + y ≤ 45 (minutes) and 6.9x + 10.4y ≥ 400 (calories), where x is minutes at light effort and y is minutes at vigorous effort. Show where the shaded regions overlap, decide whether the marked point — 10 minutes light and 30 minutes vigorous — is a solution, then choose a solution of your own.',
    source: ['x + y <= 45', '6.9x + 10.4y >= 400'],
    constraints: [{ A: 1, B: 1, C: -45, relation: '<=' }, { A: 6.9, B: 10.4, C: -400, relation: '>=' }],
    build: false,
    testPoint: { x: 10, y: 30 },
    studentTestPoint: true,
    graph: { xMin: 0, xMax: 60, yMin: 0, yMax: 50 },
    directionSteps: ['Show where the two shaded regions overlap.', 'Check the marked point in both inequalities.', 'Choose a point of your own in the overlap and check it.'],
    hints: ['Substitute the marked point into both inequalities.', 'A point solves the system only if it makes both inequalities true.', 'The overlap is below the time line and above the calorie line.'],
    scaffold: backUp('Emma’s calories for x minutes light and y minutes vigorous are…', ['6.9x + 10.4y', 'x + y'], '6.9x + 10.4y'),
    solutionReview: review(
      'Check the point in both inequalities.',
      ['(10, 30): 10 + 30 = 40 ≤ 45 is true, but 6.9(10) + 10.4(30) = 69 + 312 = 381, which is less than 400 — not a solution.', 'A solution is below the time line and above the calorie line, for example (5, 38): 43 ≤ 45 and 34.5 + 395.2 = 429.7 ≥ 400.'],
      'not a solution; any point in the overlap',
      'Checking only the time: (10, 30) fits in 45 minutes but burns too few calories.',
    ),
  }),
  {
    questionId: `${P}-cw-11`,
    ...A3H,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: 'Algebraically prove whether each workout satisfies Emma’s system, x + y ≤ 45 (minutes) and 6.9x + 10.4y ≥ 400 (calories). Workout 1: 10 minutes light and 35 minutes vigorous. Workout 2: 20 minutes light and 25 minutes vigorous. Workout 3: 30 minutes light and 20 minutes vigorous.',
    directionSteps: ['Find the calories for each workout.', 'Check the minutes for each workout.', 'Decide whether each workout solves the system.', 'Interpret a solution.'],
    responses: [
      number('cal1', 'Workout 1 calories', '433'),
      choice('ok1', 'Workout 1', BOTH_OR_NOT, 'Yes — it meets both constraints'),
      number('cal2', 'Workout 2 calories', '398'),
      choice('ok2', 'Workout 2', BOTH_OR_NOT, 'No — it fails only the second constraint'),
      number('cal3', 'Workout 3 calories', '415'),
      choice('ok3', 'Workout 3', BOTH_OR_NOT, 'No — it fails only the first constraint'),
      choice('meaning', 'What does the solution (10, 35) mean?', [
        'Emma can do 10 minutes light and 35 minutes vigorous, 45 minutes in all, and burn more than 400 calories',
        'Emma burns 10 calories at light effort and 35 at vigorous effort, 45 calories in all',
        'Emma can do 10 minutes light and 35 minutes vigorous, but that is more than her 45 minutes',
        'Emma can do 10 minutes light and 35 minutes vigorous, 45 minutes in all, and burn fewer than 400 calories',
      ], 'Emma can do 10 minutes light and 35 minutes vigorous, 45 minutes in all, and burn more than 400 calories'),
    ],
    hints: ['Calories: 6.9 times the light minutes plus 10.4 times the vigorous minutes.', 'Minutes: add the two times and compare with the time she has.', 'A workout solves the system only if it meets both constraints.'],
    scaffold: backUp('The first constraint, x + y ≤ 45, is about…', ['minutes', 'calories'], 'minutes'),
    solutionReview: review(
      'Substitute each workout into both inequalities.',
      ['Workout 1: 45 ≤ 45 and 69 + 364 = 433 ≥ 400 — a solution.', 'Workout 2: 45 ≤ 45, but 138 + 260 = 398 < 400 — not enough calories.', 'Workout 3: 207 + 208 = 415 ≥ 400, but 50 minutes is more than 45 — not enough time.'],
      'yes; no (calories); no (time)',
      'Rounding 398 up to 400: a workout must burn at least 400 calories.',
    ),
  },
  {
    questionId: `${P}-cw-12`,
    ...A3H,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 3,
    prompt: `Activity 5.4 — Identifying Systems of Linear Inequalities. ${FOUR_SYSTEMS} Graphs A, B and C each shade the solutions of one system, and Graph D is blank. Match each system to its graph, check a point, and evaluate Isabella’s claim.`,
    ...SYSTEM_GRAPHS,
    directionSteps: ['Use each system’s symbols to decide above or below each line.', 'Match each system to its graph.', 'Check the given point against both lines.', 'Explain why Isabella is wrong.'],
    responses: [
      choice('sysA', 'System A', GRAPH_OPTIONS, graphOption(GRAPH_OF_SYSTEM.A)),
      choice('sysB', 'System B', GRAPH_OPTIONS, graphOption(GRAPH_OF_SYSTEM.B)),
      choice('sysC', 'System C', GRAPH_OPTIONS, graphOption(GRAPH_OF_SYSTEM.C)),
      choice('sysD', 'System D', GRAPH_OPTIONS, graphOption(GRAPH_OF_SYSTEM.D)),
      number('rise4', 'At x = 4, the rising line’s y-value, (3/5)(4) + 3, is', '5.4'),
      number('fall4', 'At x = 4, the falling line’s y-value is', '0.6'),
      choice('check', 'So the point (4, −4) is…', ['below both lines: a solution of System D', 'between the lines: a solution of System A', 'above both lines: a solution of System B', 'on a boundary line'], 'below both lines: a solution of System D'),
      choice('isabella', 'Isabella says: "Since the equations in each system are the same, the graphs and solutions should all be identical." Why is she wrong?', [
        'The boundary lines are the same, but the symbols differ, so each system shades a different region',
        'The boundary lines differ from system to system, so each system shades a different region',
        'She is right: the boundary lines in each system are the same, so the graphs and solutions are identical',
        'The boundary lines are the same, so the graphs are identical, but the solutions differ',
      ], 'The boundary lines are the same, but the symbols differ, so each system shades a different region'),
    ],
    hints: ['> shades above a line and < shades below it.', 'Read each system one inequality at a time: above or below the rising line, then above or below the falling line.', 'Compare the point’s y-coordinate with each line’s value at its x-coordinate.'],
    scaffold: backUp('y > (3/5)x + 3 shades…', ['above the rising line', 'below the rising line'], 'above the rising line'),
    solutionReview: review(
      'The symbols, not the lines, tell the systems apart.',
      ['A: below rising, above falling → Graph C. B: above both → the blank Graph D. C: above rising, below falling → Graph B. D: below both → Graph A.', 'At x = 4 the lines are at 5.4 and 0.6; −4 is below both, so (4, −4) solves System D.'],
      'A–C, B–D, C–B, D–A',
      'Matching by the lines alone: all four systems share the same two lines.',
    ),
  },
  {
    questionId: `${P}-cw-13`,
    ...A3H,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: `Match a possible solution set to each system. ${SYSTEM_A} ${SYSTEM_B} ${SYSTEM_C} ${SYSTEM_D} Possible Solutions A, B and C are plotted with the systems’ two dashed boundary lines. Possible Solutions D is blank: complete it for the system with no solution set yet. Check the point (5, 3) for System A.`,
    ...SOLUTION_GRAPHS,
    directionSteps: ['Test a point from each solution set in the systems.', 'Match each system to its solution set.', 'Check (5, 3) for System A.'],
    responses: [
      choice('solA', 'System A', SOLUTION_OPTIONS, solutionOption(SOLUTIONS_OF_SYSTEM.A)),
      choice('solB', 'System B', SOLUTION_OPTIONS, solutionOption(SOLUTIONS_OF_SYSTEM.B)),
      choice('solC', 'System C', SOLUTION_OPTIONS, solutionOption(SOLUTIONS_OF_SYSTEM.C)),
      choice('solD', 'System D', SOLUTION_OPTIONS, solutionOption(SOLUTIONS_OF_SYSTEM.D)),
      number('rise5', 'At x = 5, (3/5)x + 3 =', '6'),
      number('fall5', 'At x = 5, −(3/5)x + 3 =', '0'),
      choice('check', '(5, 3) for System A:', [
        'a solution — it is below the rising line and above the falling line, so it can complete Possible Solutions D',
        'not a solution — it is above the rising line and above the falling line, like the points in Possible Solutions B',
        'not a solution — it is below the rising line and below the falling line, like the points in Possible Solutions A',
        'not a solution — it is on the falling line, so it is on a boundary of Possible Solutions D',
      ], 'a solution — it is below the rising line and above the falling line, so it can complete Possible Solutions D'),
    ],
    hints: ['Substitute a point from a solution set into both inequalities of a system.', 'Each solution set fits exactly one system.', 'Compare y = 3 with each line’s value at x = 5.'],
    scaffold: backUp('A point is in a system’s solution set when it makes…', ['both inequalities true', 'one inequality true'], 'both inequalities true'),
    solutionReview: review(
      'Test the points.',
      ['(0, 7.5) and (−4, 10) are above both lines: System B. (−6, 4) and (−10, 8) are above the rising and below the falling line: System C. (0, −6) and (4, −4) are below both: System D.', 'System A is left for Possible Solutions D. At x = 5 the lines are at 6 and 0, and 3 is between them, so (5, 3) works.'],
      'A–D, B–B, C–C, D–A; (5, 3) completes D',
      'Testing a point in only one inequality of a system.',
    ),
  },
  inequalityBuild({
    questionId: `${P}-cw-14`,
    alignment: A3H,
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Complete the blank Graph D: graph System B, $y > \frac{3}{5}x + 3$ and $y > -\frac{3}{5}x + 3$. Then test the point (−4, 10) from Possible Solutions B, classify the region and choose another solution of your own.`,
    source: ['y > (3/5)x + 3', 'y > -(3/5)x + 3'],
    constraints: [{ m: 0.6, b: 3, relation: '>' }, { m: -0.6, b: 3, relation: '>' }],
    testPoint: { x: -4, y: 10 },
    studentTestPoint: true,
    classify: true,
    directionSteps: ['Build both boundary lines.', 'Choose solid or dashed for each.', 'Shade each half-plane and find the overlap.', 'Test the marked point and a point of your own.', 'Classify the region.'],
    hints: ['Both lines pass through (0, 3): one rises 3 for every 5 to the right, the other falls 3.', 'Both symbols are >.', 'The overlap is above both lines.'],
    scaffold: backUp('A slope of 3/5 means…', ['up 3, right 5', 'up 5, right 3'], 'up 3, right 5'),
    solutionReview: review(
      'Above both dashed lines.',
      ['Both boundaries are dashed through (0, 3), one through (5, 6) and one through (5, 0).', 'Shade above each; the overlap above both lines is unbounded, and (−4, 10) is in it.'],
      'above both lines (unbounded)',
      'Using solid lines: > leaves both boundaries out.',
    ),
  }),
  {
    questionId: `${P}-cw-15`,
    ...A3H,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 3,
    prompt: 'Talk the Talk — Get to Know the Region. The solution set of a system of two linear inequalities can be a region above both lines, a region below both lines, a region between the lines, or no solution. Rewrite each system with y alone to decide which. a. y < 8 + 2x and 3 + 2x > y. b. 5 + x < y and y > 7 + x. c. y > 12 − 3x and 10 − 3x > y. d. 6 − x < y and y < 9 − x.',
    directionSteps: ['Rewrite system c with y alone in each inequality.', 'Compare the slopes and the y-intercepts in each system.', 'Decide which region each system has.', 'Compare with systems of equations.'],
    responses: [
      inequality('c1', 'System c, first inequality with y alone', 'y > -3x + 12'),
      inequality('c2', 'System c, second inequality with y alone', 'y < -3x + 10'),
      choice('a', 'System a', REGIONS, 'A region below both lines'),
      choice('b', 'System b', REGIONS, 'A region above both lines'),
      choice('c', 'System c', REGIONS, 'No solution'),
      choice('d', 'System d', REGIONS, 'A region between the lines'),
      choice('compare', 'How is the solution of a system of linear inequalities different from the solution of a system of linear equations?', [
        'Equations: usually one solution, the intersection point. Inequalities: a whole region or none, which may not include that point',
        'Equations: usually one solution, the intersection point. Inequalities: that same point, where the boundaries cross',
        'Equations: a whole region of solutions or none. Inequalities: usually one solution, the intersection point',
        'Equations: usually one solution, the intersection point. Inequalities: a whole region, which always includes the intersection point',
      ], 'Equations: usually one solution, the intersection point. Inequalities: a whole region or none, which may not include that point'),
    ],
    hints: ['Each system’s boundary lines are parallel: they have the same slope.', 'Decide above or below each line, then whether the shadings overlap.', '"10 − 3x > y" is the same as "y < 10 − 3x".'],
    scaffold: backUp('"3 + 2x > y" with y alone is…', ['y < 2x + 3', 'y > 2x + 3'], 'y < 2x + 3'),
    solutionReview: review(
      'Parallel boundaries: compare the intercepts.',
      ['a: y < 2x + 8 and y < 2x + 3 — below both. b: y > x + 5 and y > x + 7 — above both.', 'c: y > −3x + 12 and y < −3x + 10 — the shadings never meet: no solution. d: y > −x + 6 and y < −x + 9 — between the lines.'],
      'a below both; b above both; c no solution; d between',
      'Reading "10 − 3x > y" as y > 10 − 3x: the inequality points at y from the other side.',
    ),
  },
  inequalityBuild({
    questionId: `${P}-cw-16`,
    alignment: A3H,
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Graph system d from Talk the Talk: $6 - x < y$ and $y < 9 - x$. Rewrite each inequality with y alone in the tool, build and shade, then classify the region and choose a solution of your own.`,
    source: ['6 - x < y', 'y < 9 - x'],
    constraints: [{ m: -1, b: 6, relation: '>' }, { m: -1, b: 9, relation: '<' }],
    rewrite: true,
    classify: true,
    studentTestPoint: true,
    directionSteps: ['Rewrite each inequality with y alone.', 'Build both boundary lines.', 'Choose solid or dashed for each.', 'Shade each half-plane and find the overlap.', 'Classify the region and choose a solution of your own.'],
    hints: ['6 − x < y is the same as y > −x + 6.', 'Both boundaries are parallel and dashed.', 'The overlap lies between the lines.'],
    scaffold: backUp('6 − x < y with y alone is…', ['y > −x + 6', 'y < −x + 6'], 'y > −x + 6'),
    solutionReview: review(
      'Between two parallel dashed lines.',
      ['y > −x + 6 and y < −x + 9: dashed, parallel lines.', 'The overlap is the strip between them — unbounded, and no point on either line is included.'],
      'between the lines (unbounded)',
      'Shading outside the strip: one inequality is above its line, the other below.',
    ),
  }),
];

/* ---------------------------------------------------------- Practice */

const intersectingSystem = ({ questionId, first, second, dok = 2, difficultyBand = 3, testPoint = { x: 0, y: 0 }, vertices = false, prompt }) => inequalityBuild({
  questionId,
  alignment: A3H,
  dok,
  difficultyBand,
  prompt,
  source: [`y ${first} {{m1|coef}}x {{b1|signed}}`, `y ${second} {{m2|coef}}x {{b2|signed}}`],
  constraints: [{ m: '{{m1}}', b: '{{b1}}', relation: first }, { m: '{{m2}}', b: '{{b2}}', relation: second }],
  testPoint,
  vertices,
  directionSteps: [
    'Build both boundary lines.',
    'Choose solid or dashed for each.',
    'Shade each half-plane and find the overlap.',
    'Test the point.',
    ...(vertices ? ['Find the corner and decide whether it is included.'] : []),
  ],
  solutionReview: review(
    'Two half-planes, one overlap.',
    [
      `Boundary 1: y = {{m1|coef}}x {{b1|signed}}, ${first.includes('=') ? 'solid' : 'dashed'}, shaded ${first.startsWith('>') ? 'above' : 'below'}. Boundary 2: y = {{m2|coef}}x {{b2|signed}}, ${second.includes('=') ? 'solid' : 'dashed'}, shaded ${second.startsWith('>') ? 'above' : 'below'}.`,
      'The lines meet at ({{h}}, {{k}}); the solution set is the region shaded by both.',
    ],
    null,
    'Shading only one inequality: the solutions are where both shadings overlap.',
  ),
  generator: {
    parameters: { h: { type: 'int', min: -3, max: 3 }, k: { type: 'int', min: -3, max: 3 }, m1: { type: 'int', min: -3, max: 3, exclude: [0] }, m2: { type: 'int', min: -3, max: 3, exclude: [0] } },
    // Both boundaries pass through the whole-number point (h, k).
    derived: { b1: 'k - m1*h', b2: 'k - m2*h' },
    constraints: ['m1 != m2', 'k - m1*h != 0', 'k - m2*h != 0', 'abs(k - m1*h) <= 8', 'abs(k - m2*h) <= 8'],
  },
  questionFamily: { scope: 'assignment' },
});

const practiceRegular = (P) => [
  {
    ...intersectingSystem({
      questionId: `${P}-p-1`,
      first: '>',
      second: '<=',
      vertices: true,
      prompt: tex`Graph the system $y > {{m1|coef}}x {{b1|signed}}$ and $y \le {{m2|coef}}x {{b2|signed}}$. Test the point (0, 0), then find the corner of the solution region and decide whether it is a solution.`,
    }),
    hints: ['Build each boundary from its y-intercept and slope.', '> is dashed and ≤ is solid.', 'The corner is where the lines meet. Is it on the dashed line?'],
    scaffold: backUp('A corner on a dashed boundary is…', ['not a solution', 'a solution'], 'not a solution'),
  },
  inequalityBuild({
    questionId: `${P}-p-2`,
    alignment: A3H,
    dok: 3,
    difficultyBand: 3,
    prompt: tex`Graph the system $ {{a|coef}}x + y > {{c}} $ and $ -x + y \le {{d}} $. Rewrite each inequality with y alone in the tool first. Then test the marked point, where the boundary lines meet: is it a solution?`,
    source: ['{{a|coef}}x + y > {{c}}', '-x + y <= {{d}}'],
    constraints: [{ A: '{{a}}', B: 1, C: '{{nc}}', relation: '>' }, { A: -1, B: 1, C: '{{nd}}', relation: '<=' }],
    rewrite: true,
    testPoint: { x: '{{h}}', y: '{{k}}' },
    probe: true,
    directionSteps: ['Rewrite each inequality with y alone.', 'Build both boundary lines.', 'Choose solid or dashed for each.', 'Shade each half-plane and find the overlap.', 'Test the marked point on the boundaries.'],
    hints: ['Subtract the x-term from both sides of each inequality.', 'The marked point is on both lines: is each boundary solid or dashed there?', 'A point on a dashed boundary fails that inequality.'],
    scaffold: backUp('A point on the dashed boundary of y > −x + 1 makes the inequality…', ['false', 'true'], 'false'),
    solutionReview: review(
      'Rewrite, build, then the corner.',
      ['{{a|coef}}x + y > {{c}} becomes y > −{{a|coef}}x {{c|signed}}; −x + y ≤ {{d}} becomes y ≤ x {{d|signed}}.', 'The lines meet at ({{h}}, {{k}}), which is on the dashed boundary, so it is not a solution.'],
      'not a solution',
      'Calling the intersection a solution because both lines pass through it.',
    ),
    generator: {
      parameters: { a: { type: 'int', min: 1, max: 3 }, h: { type: 'int', min: -3, max: 3 }, k: { type: 'int', min: -3, max: 3 } },
      // Both boundaries pass through (h, k), the marked point.
      derived: { c: 'k + a*h', d: 'k - h', nc: '0 - (k + a*h)', nd: '0 - (k - h)' },
      constraints: ['k + a*h != 0', 'k - h != 0', 'abs(k + a*h) <= 9'],
    },
    questionFamily: { scope: 'assignment' },
  }),
  inequalityBuild({
    questionId: `${P}-p-3`,
    alignment: A3H,
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Graph the system $y > {{m|coef}}x {{b1|signed}}$ and $y < {{m|coef}}x {{b2|signed}}$, then classify its solution region.`,
    source: ['y > {{m|coef}}x {{b1|signed}}', 'y < {{m|coef}}x {{b2|signed}}'],
    constraints: [{ m: '{{m}}', b: '{{b1}}', relation: '>' }, { m: '{{m}}', b: '{{b2}}', relation: '<' }],
    classify: true,
    directionSteps: ['Build both boundary lines.', 'Choose solid or dashed for each.', 'Shade each half-plane.', 'Classify the solution region.'],
    hints: ['The two boundaries have the same slope: they are parallel.', 'Is the line you shade above lower than the line you shade below?', 'If the shadings never meet, the system has no solution.'],
    scaffold: backUp('Two lines with the same slope and different y-intercepts…', ['never meet', 'meet once'], 'never meet'),
    solutionReview: review(
      'Parallel boundaries: compare the y-intercepts.',
      ['Both boundaries have slope {{m}}. The system shades above y = {{m|coef}}x {{b1|signed}} and below y = {{m|coef}}x {{b2|signed}}.', 'The shadings overlap only when the line shaded above is the lower one; otherwise there is no solution.'],
      null,
      'Assuming parallel boundaries always mean no solution: they can also bound a strip.',
    ),
    generator: {
      parameters: { m: { type: 'int', min: -3, max: 3, exclude: [0] }, b1: { type: 'int', min: -5, max: 5, exclude: [0] }, g: { type: 'int', min: 2, max: 5 }, s: { type: 'int', min: 0, max: 1 } },
      // s = 1: a strip between the lines; s = 0: no solution.
      derived: { b2: 'b1 + g*(2*s - 1)' },
      constraints: ['b1 + g*(2*s - 1) != 0', 'abs(b1 + g*(2*s - 1)) <= 9'],
    },
    questionFamily: { scope: 'assignment' },
  }),
  {
    questionId: `${P}-p-4`,
    ...A2H_SYSTEM,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: 'The art club sells small prints for ${{p}} and large prints for ${{q}}. It can make at most {{n}} prints, and it needs to raise at least ${{M}}. Let x be the number of small prints and y the number of large prints. Write the system that models the club’s plan, then check the plan of {{x0}} small prints and {{y0}} large prints.',
    directionSteps: ['Write the inequality for the number of prints.', 'Write the inequality for the money.', 'Find the money the plan raises.', 'Count the constraints the plan meets.'],
    responses: [
      inequality('count', 'Number of prints', 'x + y <= {{n}}'),
      inequality('money', 'Money raised', '{{p}}x + {{q}}y >= {{M}}'),
      number('raised', 'Money the plan raises ($)', '{{R}}'),
      number('met', 'How many of the two constraints does the plan meet?', '{{cnt}}'),
    ],
    hints: ['Prints: small plus large is at most the number the club can make.', 'Money: price times count for each size, added, is at least the goal.', 'The plan is a solution only if it meets both constraints.'],
    scaffold: backUp('"At least" means…', ['≥', '≤'], '≥'),
    solutionReview: review(
      'Write both constraints, then test the plan in each.',
      ['x + y ≤ {{n}} and {{p}}x + {{q}}y ≥ {{M}}.', 'The plan has {{x0}} + {{y0}} prints and raises {{p}}({{x0}}) + {{q}}({{y0}}) = {{R}} dollars, so it meets {{cnt}} of the 2 constraints.'],
      'x + y ≤ {{n}}; {{p}}x + {{q}}y ≥ {{M}}; {{R}}; {{cnt}}',
      'Checking only the number of prints: a plan must also raise enough money.',
    ),
    generator: {
      parameters: { p: { type: 'int', min: 3, max: 6 }, q: { type: 'int', min: 8, max: 12 }, x0: { type: 'int', min: 10, max: 20 }, y0: { type: 'int', min: 5, max: 15 }, e: { type: 'int', min: 1, max: 5 }, dd: { type: 'int', min: 5, max: 20 }, s: { type: 'int', min: 0, max: 1 } },
      // s = 1: the plan meets the money goal too; s = 0: it falls short.
      derived: { n: 'x0 + y0 + e', R: 'p*x0 + q*y0', M: 'p*x0 + q*y0 + dd*(1 - 2*s)', cnt: '1 + s' },
    },
    questionFamily: { scope: 'assignment' },
  },
  {
    questionId: `${P}-p-5`,
    ...A3H,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: 'Use the system y ≥ 2x − 1 and y < −x + 5. Decide which inequalities each point makes true.',
    directionSteps: ['Substitute each point into both inequalities.', 'Decide which inequalities each point makes true.'],
    responses: [
      choice('o', '(0, 0)', ['both — a solution of the system', 'only y ≥ 2x − 1', 'only y < −x + 5', 'neither'], 'both — a solution of the system'),
      choice('corner', '(2, 3), where the boundary lines meet', ['both — a solution of the system', 'only y ≥ 2x − 1', 'only y < −x + 5', 'neither'], 'only y ≥ 2x − 1'),
      choice('right', '(4, 0)', ['both — a solution of the system', 'only y ≥ 2x − 1', 'only y < −x + 5', 'neither'], 'only y < −x + 5'),
      number('v1', 'At (4, 2): 2x − 1 =', '7'),
      number('v2', 'At (4, 2): −x + 5 =', '1'),
      choice('far', '(4, 2)', ['both — a solution of the system', 'only y ≥ 2x − 1', 'only y < −x + 5', 'neither'], 'neither'),
    ],
    hints: ['Substitute x into each right side, then compare with y.', 'The point where the lines meet is on both boundaries: which boundary is dashed?'],
    scaffold: backUp('At (2, 3), is 3 < −2 + 5 true?', ['no', 'yes'], 'no'),
    solutionReview: review(
      'Substitute and compare.',
      ['(0, 0): 0 ≥ −1 and 0 < 5 — both. (2, 3): 3 ≥ 3 is true but 3 < 3 is false — only the first.', '(4, 0): 0 ≥ 7 is false, 0 < 1 is true — only the second. (4, 2): 2 ≥ 7 and 2 < 1 are both false — neither.'],
      'both; only the first; only the second; neither',
      'Counting the corner (2, 3) as a solution: it is on the dashed boundary.',
    ),
  },
  inequalityBuild({
    questionId: `${P}-p-6`,
    alignment: A3H,
    dok: 2,
    difficultyBand: 3,
    prompt: tex`Graph the system $y \le -x + 6$, $y \ge 0$ and $x \ge 0$. Then classify the solution region and find its corners.`,
    source: ['y <= -x + 6', 'y >= 0', 'x >= 0'],
    constraints: [{ m: -1, b: 6, relation: '<=' }, { orientation: 'horizontal', y: 0, relation: '>=' }, { orientation: 'vertical', x: 0, relation: '>=' }],
    classify: true,
    vertices: true,
    directionSteps: ['Build all three boundary lines.', 'Choose solid or dashed for each.', 'Shade each half-plane and find the overlap.', 'Classify the region and find its corners.'],
    hints: ['y ≥ 0 is the x-axis and above; x ≥ 0 is the y-axis and to its right.', 'All three boundaries are solid.', 'The corners are where two boundaries meet.'],
    scaffold: backUp('The boundary of y ≥ 0 is…', ['the x-axis', 'the y-axis'], 'the x-axis'),
    solutionReview: review(
      'Three half-planes make a triangle.',
      ['Shade below y = −x + 6, above the x-axis and to the right of the y-axis.', 'The overlap is a bounded triangle with corners (0, 0), (6, 0) and (0, 6), all included.'],
      'bounded; corners (0, 0), (6, 0), (0, 6)',
      'Leaving out a corner: every boundary here is solid.',
    ),
  }),
  {
    questionId: `${P}-p-7`,
    ...A3H,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 3,
    prompt: 'Error analysis. For the system y ≥ x − 1 and y < 2x − 4, Jordan says (3, 2) is a solution "because it is where the two boundary lines cross." Decide which inequalities (3, 2) makes true and whether Jordan is right. Then change only the second symbol so that its boundary is included and (3, 2) becomes a solution.',
    directionSteps: ['Substitute (3, 2) into each inequality.', 'Decide whether Jordan is right.', 'Change the second symbol so its boundary is included.'],
    responses: [
      choice('which', 'Which inequalities does (3, 2) make true?', ['only y ≥ x − 1', 'only y < 2x − 4', 'both', 'neither'], 'only y ≥ x − 1'),
      choice('jordan', 'Is Jordan right?', [
        'No — (3, 2) is on the dashed boundary of y < 2x − 4, so it fails that inequality',
        'Yes — (3, 2) is on both boundary lines, so it makes both inequalities true',
        'No — (3, 2) is on the solid boundary of y ≥ x − 1, so it does not satisfy that inequality',
        'No — (3, 2) is not on either line, so the two lines do not cross there',
      ], 'No — (3, 2) is on the dashed boundary of y < 2x − 4, so it fails that inequality'),
      inequality('fixed', 'The second inequality with its boundary included', 'y <= 2x - 4'),
    ],
    hints: ['At (3, 2), compare 2 with 3 − 1 and with 2(3) − 4.', 'A point on a dashed boundary fails that inequality.', 'Including the boundary turns < into ≤.'],
    scaffold: backUp('Is 2 < 2 true?', ['no', 'yes'], 'no'),
    solutionReview: review(
      'Check the crossing point in both inequalities.',
      ['2 ≥ 3 − 1 is true; 2 < 2(3) − 4 is false, because 2 < 2 is false.', 'So (3, 2) is not a solution. With y ≤ 2x − 4 the boundary is included, and (3, 2) solves both.'],
      'only the first; Jordan is wrong; y ≤ 2x − 4',
      'Changing the symbol to >: that flips the shading instead of including the boundary.',
    ),
  },
  inequalityBuild({
    questionId: `${P}-p-8`,
    alignment: A3H_MODEL,
    dok: 2,
    difficultyBand: 3,
    prompt: 'Kim tutors for $15 an hour and lifeguards for $10 an hour. She can work at most 20 hours a week and wants to earn at least $240. Let x be her tutoring hours and y her lifeguarding hours. Enter the model in the tool and graph it. Test the marked point (6, 12), then choose a solution of your own.',
    modeling: { variables: [{ symbol: 'x', label: 'tutoring hours' }, { symbol: 'y', label: 'lifeguarding hours' }] },
    constraints: [{ A: 1, B: 1, C: -20, relation: '<=' }, { A: 15, B: 10, C: -240, relation: '>=' }],
    testPoint: { x: 6, y: 12 },
    studentTestPoint: true,
    graph: { xMin: 0, xMax: 25, yMin: 0, yMax: 25 },
    directionSteps: ['Enter both constraints.', 'Build each boundary line.', 'Choose solid or dashed for each.', 'Shade each half-plane and find the overlap.', 'Test the marked point and choose a solution of your own.'],
    hints: ['Hours: tutoring plus lifeguarding is at most her limit.', 'Money: each job’s pay times its hours, added, is at least her goal.', 'The earnings boundary passes through (16, 0) and (0, 24).'],
    scaffold: backUp('Kim’s earnings for x hours of tutoring at $15 an hour are…', ['15x', 'x + 15'], '15x'),
    solutionReview: review(
      'Model, graph, test.',
      ['x + y ≤ 20 and 15x + 10y ≥ 240: both solid, shaded below the hours line and above the earnings line.', '(6, 12): 18 hours, but 90 + 120 = $210, less than $240 — not a solution.'],
      'x + y ≤ 20 and 15x + 10y ≥ 240',
      'Accepting (6, 12) because it fits the hours: it does not earn enough.',
    ),
  }),
  {
    questionId: `${P}-p-9`,
    ...A3H,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 3,
    prompt: 'Use Kim’s system, x + y ≤ 20 (hours) and 15x + 10y ≥ 240 (dollars), where x is tutoring hours and y lifeguarding hours. Check two schedules, then reason about one more.',
    directionSteps: ['Find the earnings for each schedule.', 'Decide whether each schedule solves the system.', 'Find the tutoring hours that work for the last schedule.'],
    responses: [
      number('e1', '10 hours tutoring and 10 hours lifeguarding: earnings ($)', '250'),
      choice('ok1', '10 hours tutoring and 10 hours lifeguarding', BOTH_OR_NOT, 'Yes — it meets both constraints'),
      number('e2', '4 hours tutoring and 15 hours lifeguarding: earnings ($)', '210'),
      choice('ok2', '4 hours tutoring and 15 hours lifeguarding', BOTH_OR_NOT, 'No — it fails only the second constraint'),
      number('least', 'If Kim lifeguards 12 hours, the only number of tutoring hours that meets both constraints', '8'),
    ],
    hints: ['Earnings: 15 times the tutoring hours plus 10 times the lifeguarding hours.', 'With 12 hours of lifeguarding, find the most tutoring hours the hours constraint allows.', 'Then find the fewest tutoring hours the earnings constraint needs.'],
    scaffold: backUp('With 12 hours lifeguarding, Kim earns from lifeguarding…', ['$120', '$12'], '$120'),
    solutionReview: review(
      'Both constraints, every time.',
      ['(10, 10): 20 ≤ 20 and 150 + 100 = 250 ≥ 240 — a solution. (4, 15): 19 ≤ 20, but 60 + 150 = 210 < 240 — not enough money.', 'With y = 12: x ≤ 8 (hours) and 15x ≥ 120, so x ≥ 8 (money). Only x = 8 works — the corner (8, 12).'],
      '250, yes; 210, no; 8',
      'Using only the earnings constraint: x ≥ 8 alone would allow too many hours.',
    ),
  },
  {
    questionId: `${P}-p-10`,
    ...A2H_SYSTEM,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 3,
    prompt: 'Write the system the graph shows. Then decide whether the corner where the lines meet, (1.5, 3.5), is a solution.',
    // The second boundary in the Systems Workspace's second colour, its shading with it.
    graph: inequalityFigure([SYSTEM_FROM_GRAPH_KEYS.solid, SYSTEM_FROM_GRAPH_KEYS.dashed], { strokes: [null, '#d93025'] }),
    directionSteps: ['Write the inequality for the solid boundary.', 'Write the inequality for the dashed boundary.', 'Decide whether the corner is a solution.'],
    responses: [
      inequality('solid', 'Inequality for the solid boundary', SYSTEM_FROM_GRAPH_KEYS.solid),
      inequality('dashed', 'Inequality for the dashed boundary', SYSTEM_FROM_GRAPH_KEYS.dashed),
      choice('corner', 'Is the corner (1.5, 3.5) a solution?', [
        'No — it is on the dashed boundary, which is not included',
        'Yes — it is on the solid boundary, which is included',
        'Yes — corners are always solutions, since both lines meet there',
        'No — it is above both lines, so it is outside the overlap',
      ], 'No — it is on the dashed boundary, which is not included'),
    ],
    hints: ['Write each boundary’s equation from its slope and y-intercept.', 'Solid: ≤ or ≥. Dashed: < or >.', 'Above: y is greater. Below: y is less.'],
    scaffold: backUp('A dashed boundary with the half-plane below it shaded uses…', ['<', '≤'], '<'),
    solutionReview: review(
      'Each boundary, its style and its side.',
      ['Solid, above: y ≥ x + 2. Dashed, below: y < −x + 5.', 'At (1.5, 3.5): 3.5 ≥ 3.5 is true, but 3.5 < 3.5 is false, so the corner is not a solution.'],
      'y ≥ x + 2 and y < −x + 5; no',
      'Using ≤ for the dashed boundary.',
    ),
  },
];

const practiceHonors = (P) => [
  ...practiceRegular(P).filter((question) => !['-p-5', '-p-6'].some((suffix) => question.questionId.endsWith(suffix))),
  {
    questionId: `${P}-p-11`,
    ...A3H,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: 'Honors extension — a parameter. For which values of k does the system y ≥ 2x + k and y ≤ 2x + 3 have solutions? Then describe the solution set when k = 3, and when k = 5.',
    directionSteps: ['Compare the two parallel boundaries.', 'Decide when the shadings overlap.', 'Describe the solution set for each value of k.'],
    responses: [
      inequality('k', 'Values of k that give solutions', 'k <= 3'),
      choice('k3', 'When k = 3, the solution set is…', ['only the points on the line y = 2x + 3', 'the whole plane', 'empty', 'the region above the line'], 'only the points on the line y = 2x + 3'),
      choice('k5', 'When k = 5, the solution set is…', [
        'empty — above y = 2x + 5 and below y = 2x + 3 never meet',
        'the strip between y = 2x + 3 and y = 2x + 5, where both hold',
        'only the line y = 2x + 5, where the two boundaries meet',
        'empty — parallel boundaries always give a system no solutions',
      ], 'empty — above y = 2x + 5 and below y = 2x + 3 never meet'),
    ],
    hints: ['Both boundaries have slope 2, so they are parallel.', 'The system shades above y = 2x + k and below y = 2x + 3.', 'The shadings overlap only when the lower line is the one shaded above.'],
    scaffold: backUp('y ≥ 2x + k and y ≤ 2x + 3 can both be true only if 2x + k is…', ['at most 2x + 3', 'more than 2x + 3'], 'at most 2x + 3'),
    solutionReview: review(
      'A strip between parallel lines, if the order is right.',
      ['A point needs 2x + k ≤ y ≤ 2x + 3, which is possible exactly when k ≤ 3.', 'k = 3: both boundaries are the same solid line, so the solutions are just that line. k = 5: the shadings never meet.'],
      'k ≤ 3',
      'Writing k < 3: when k = 3 the solid boundary itself is a solution set.',
    ),
  },
  inequalityBuild({
    questionId: `${P}-p-12`,
    alignment: A3H,
    dok: 3,
    difficultyBand: 4,
    prompt: tex`Honors extension — a bounded region. Graph the system $x \ge 0$, $y \ge 0$ and $x + 2y \le 8$. Then classify the region and find its corners.`,
    source: ['x >= 0', 'y >= 0', 'x + 2y <= 8'],
    constraints: [{ orientation: 'vertical', x: 0, relation: '>=' }, { orientation: 'horizontal', y: 0, relation: '>=' }, { A: 1, B: 2, C: -8, relation: '<=' }],
    classify: true,
    vertices: true,
    directionSteps: ['Build all three boundary lines.', 'Choose solid or dashed for each.', 'Shade each half-plane and find the overlap.', 'Classify the region and find its corners.'],
    hints: ['x + 2y = 8 passes through (8, 0) and (0, 4).', 'All three boundaries are solid.', 'The corners are where two boundaries meet.'],
    scaffold: backUp('The boundary x + 2y = 8 crosses the y-axis where y is…', ['4', '8'], '4'),
    solutionReview: review(
      'A triangle in the first quadrant.',
      ['Shade to the right of the y-axis, above the x-axis and below x + 2y = 8.', 'The overlap is bounded, with corners (0, 0), (8, 0) and (0, 4), all included.'],
      'bounded; corners (0, 0), (8, 0), (0, 4)',
      'Reading the y-intercept of x + 2y = 8 as 8: when x = 0, 2y = 8.',
    ),
  }),
  {
    questionId: `${P}-p-13`,
    ...A3H,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: 'Honors extension — reason with the corners. The region x ≥ 0, y ≥ 0 and x + 2y ≤ 8 is a triangle with corners (0, 0), (8, 0) and (0, 4). Find its area, find the greatest value of x + y anywhere in the region, and decide whether (3, 3) is in the region.',
    directionSteps: ['Find the legs of the triangle.', 'Find its area.', 'Compare x + y at the corners.', 'Check (3, 3).'],
    responses: [
      number('area', 'Area of the region (square units)', '16'),
      number('most', 'Greatest value of x + y in the region', '8'),
      choice('point', 'Is (3, 3) in the region?', ['No — 3 + 2(3) = 9 is more than 8', 'Yes — both coordinates are positive', 'Yes — it is below the line', 'No — it is on the line'], 'No — 3 + 2(3) = 9 is more than 8'),
    ],
    hints: ['The legs lie along the axes, from the origin to each intercept.', 'A greatest value of x + y over a triangle occurs at a corner.', 'Substitute (3, 3) into x + 2y.'],
    scaffold: backUp('The area of a right triangle is…', ['half the product of its legs', 'the product of its legs'], 'half the product of its legs'),
    solutionReview: review(
      'Corners carry the extremes.',
      ['The legs are 8 and 4, so the area is (1/2)(8)(4) = 16.', 'x + y is 0, 8 and 4 at the corners; the greatest is 8, at (8, 0).', '3 + 2(3) = 9 > 8, so (3, 3) is outside.'],
      '16; 8; no',
      'Forgetting the 1/2 in the area of a triangle.',
    ),
  },
  {
    questionId: `${P}-p-14`,
    ...A3H,
    studentActions: ['openSort'],
    dok: 3,
    difficultyBand: 4,
    prompt: 'Honors extension — sort the systems. Every system below has parallel boundary lines. Sort each one by its solution set: a region above both lines, a region below both lines, a region between the lines, or no solution. Rewrite an inequality with y alone whenever it is not already.',
    directionSteps: ['Rewrite each inequality with y alone.', 'Compare the y-intercepts of the parallel boundaries.', 'Decide above or below each line, then sort the system.'],
    ...sortBoard([
      { id: 'above', label: 'A region above both lines', cards: [['s1', 'y > 2x + 1 and y > 2x − 3'], ['s7', '−4x + 2y > 6 and y > 2x − 5']] },
      { id: 'below', label: 'A region below both lines', cards: [['s2', 'y < −x + 4 and y < −x − 2'], ['s8', '6x + 3y ≤ 9 and y < −2x + 8']] },
      { id: 'between', label: 'A region between the lines', cards: [['s4', 'y > x − 2 and y < x + 6'], ['s6', 'x + y ≥ 3 and x + y ≤ 7']] },
      { id: 'none', label: 'No solution', cards: [['s3', 'y > 3x + 5 and y < 3x − 1'], ['s5', '2x − y > 4 and 2x − y < −1']] },
    ], ['s5', 's1', 's6', 's2', 's7', 's3', 's8', 's4']),
    hints: ['−4x + 2y > 6 becomes y > 2x + 3; 6x + 3y ≤ 9 becomes y ≤ −2x + 3.', '2x − y > 4 becomes y < 2x − 4 (dividing by −1 reverses the symbol).', 'Shading above a higher line and below a lower line never overlaps.'],
    scaffold: backUp('2x − y < −1 with y alone is…', ['y > 2x + 1', 'y < 2x + 1'], 'y > 2x + 1'),
    solutionReview: review(
      'Rewrite, then compare the intercepts.',
      ['Above both: y > 2x + 1 and y > 2x − 3; y > 2x + 3 and y > 2x − 5. Below both: y < −x + 4 and y < −x − 2; y ≤ −2x + 3 and y < −2x + 8.', 'Between: y > x − 2 and y < x + 6; y ≥ −x + 3 and y ≤ −x + 7. No solution: y > 3x + 5 and y < 3x − 1; y < 2x − 4 and y > 2x + 1.'],
      null,
      'Forgetting to reverse the symbol when dividing by −1, which turns "no solution" into a strip.',
    ),
  },
  {
    questionId: `${P}-p-15`,
    ...A3H,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 5,
    prompt: 'Honors extension — Emma’s corners. Add x ≥ 0 and y ≥ 0 to Emma’s system, x + y ≤ 45 and 6.9x + 10.4y ≥ 400, so that the region is bounded. Find its corners algebraically, to the nearest hundredth, and the least whole number of vigorous minutes that works when she does no light effort.',
    directionSteps: ['Find where the calorie boundary crosses the y-axis.', 'Find where the time and calorie boundaries meet.', 'Find the least whole number of vigorous minutes with no light minutes.'],
    responses: [
      number('yCal', 'The calorie boundary crosses the y-axis at y =', '38.46', { numericTolerance: 0.01 }),
      number('xMeet', 'The time and calorie boundaries meet at x =', '19.43', { numericTolerance: 0.01 }),
      number('yMeet', '…and y =', '25.57', { numericTolerance: 0.01 }),
      number('least', 'Least whole number of vigorous minutes with no light minutes', '39'),
    ],
    hints: ['On the y-axis, x = 0: solve 10.4y = 400.', 'Substitute y = 45 − x into 6.9x + 10.4y = 400 and solve for x.', 'With x = 0 she needs 10.4y to be at least 400, in whole minutes.'],
    scaffold: backUp('On the y-axis, the value of x is…', ['0', '45'], '0'),
    solutionReview: review(
      'Corners by substitution.',
      ['x = 0: 10.4y = 400, so y ≈ 38.46. The third corner is (0, 45), on the time line.', '6.9x + 10.4(45 − x) = 400 → −3.5x = −68 → x ≈ 19.43 and y ≈ 25.57.', 'With no light effort she needs y ≥ 38.46, so at least 39 whole minutes.'],
      '(0, 38.46), (0, 45), (19.43, 25.57); 39',
      'Rounding 38.46 down to 38: 38 minutes burns only 395.2 calories.',
    ),
  },
  auditedCcmrQuestion({
    documentId: 'mm_sat_A_3H_challenge_1_parameter-feasible-point_v21',
    questionId: `${P}-p-16`,
    scaffold: backUp('Solving y ≥ 2x + k for k gives…', ['k ≤ y − 2x', 'k ≥ y − 2x'], 'k ≤ y − 2x'),
    commonError: 'Adding {{m}}({{x}}) to y instead of subtracting it when solving for k.',
    // One try: a reason for each option, in the bank's option order.
    optionRationales: {
      answer: [
        'Right: y ≥ {{m}}x + k gives k ≤ y − {{m}}x, and at ({{x}}, {{y}}) the greatest integer k is this value.',
        'This adds the x-term to y instead of subtracting it: y ≥ {{m}}x + k gives k ≤ y − {{m}}x.',
        'This leaves out the x-term: at x = {{x}}, the boundary’s {{m}}x term is {{m}}({{x}}).',
        'This swaps the coordinates: in ({{x}}, {{y}}), x is {{x}} and y is {{y}}.',
      ],
    },
  }),
  auditedCcmrQuestion({
    documentId: 'mm_sat_A_3H_challenge_2_integer-points-vertical-slice_v21',
    questionId: `${P}-p-17`,
    scaffold: backUp('How many integers are there from 2 to 5, including both?', ['4', '3'], '4'),
    commonError: 'Subtracting the bounds without adding 1: both bounds are included, so both endpoints count.',
    // One try: a reason for each option, in the bank's option order.
    optionRationales: {
      answer: [
        'Right: the integers from {{low}} to {{high}}, counting both ends, number {{high}} − ({{low}}) + 1.',
        'This is the difference of the bounds. Both bounds are included, so add 1 to count both ends.',
        'This uses {{c}} as the lower bound and leaves out the {{m}}x term: at x = {{x}} the lower bound is {{low}}.',
        'This adds 2: the difference already counts one end, so adding 1 includes the other.',
      ],
    },
  }),
];

/* ------------------------------------------------------ Exit Ticket */

const pointsOfSystem = (questionId) => ({
  questionId,
  ...A3H,
  studentActions: ['multipleResponses'],
  dok: 2,
  difficultyBand: 3,
  prompt: tex`Check both points in the system $y \ge -x {{b1|signed}}$ and $y < x {{b2|signed}}$.`,
  directionSteps: ['Substitute the first point into both inequalities.', 'Substitute the second point into both inequalities.', 'Decide which point solves the system.'],
  responses: [
    number('c1', 'How many of the two inequalities does ({{p1x}}, {{p1y}}) make true?', '{{c1}}'),
    number('c2', 'How many of the two inequalities does ({{p2x}}, {{p2y}}) make true?', '{{c2}}'),
    computedChoice('which', 'Which point is a solution of the system?', ['({{p1x}}, {{p1y}})', '({{p2x}}, {{p2y}})', 'Both points', 'Neither point'], '({{x1}}, {{yA}})'),
  ],
  solutionReview: {
    headline: 'Check each point in BOTH inequalities.',
    reasoning: [
      '({{x1}}, {{yA}}): {{yA}} ≥ −({{x1}}) {{b1|signed}} and {{yA}} < {{x1}} {{b2|signed}}, so it makes both true.',
      '({{x2}}, {{yB}}) makes y ≥ −x {{b1|signed}} true but y < x {{b2|signed}} false, so it is not a solution of the system.',
    ],
    answerSummary: '({{x1}}, {{yA}})',
    commonError: 'Calling a point a solution of the system when it makes only one inequality true.',
  },
  generator: {
    parameters: {
      b1: { type: 'int', min: -4, max: 4, exclude: [0] },
      g: { type: 'int', min: 3, max: 6 },
      x1: { type: 'int', min: -3, max: 3 },
      t: { type: 'int', min: 0, max: 2 },
      x2: { type: 'int', min: -3, max: 3 },
      u: { type: 'int', min: 0, max: 2 },
      s: { type: 'int', min: 0, max: 1 },
    },
    derived: {
      // At x1 the region runs from −x1 + b1 (kept) up to −x1 + b1 + g (left out).
      b2: '-2*x1 + b1 + g',
      yA: '-x1 + b1 + t',
      // On or above both lines at x2: true for the first inequality only.
      yB: 'max(b1 - x2, x2 - 2*x1 + b1 + g) + u',
      p1x: 's*x1 + (1 - s)*x2',
      p1y: 's*yA + (1 - s)*yB',
      p2x: 's*x2 + (1 - s)*x1',
      p2y: 's*yB + (1 - s)*yA',
      c1: '1 + s',
      c2: '2 - s',
    },
    constraints: ['x1 != x2', '-2*x1 + b1 + g != 0'],
  },
  questionFamily: { scope: 'assignment' },
});

const dolRegular = (P) => [
  intersectingSystem({
    questionId: `${P}-dol-1`,
    first: '>=',
    second: '<',
    prompt: tex`Graph the system $y \ge {{m1|coef}}x {{b1|signed}}$ and $y < {{m2|coef}}x {{b2|signed}}$. Then test the point (0, 0).`,
  }),
  pointsOfSystem(`${P}-dol-2`),
  {
    questionId: `${P}-dol-3`,
    ...A2H_SYSTEM,
    studentActions: ['multipleResponses'],
    dok: 2,
    difficultyBand: 3,
    prompt: 'A theater has at most {{n}} seats for a show. Adult tickets cost ${{p}} and student tickets cost ${{q}}, and the show must collect at least ${{M}}. Let x be the number of adult tickets and y the number of student tickets. Write the system, then check selling {{x0}} adult and {{y0}} student tickets.',
    directionSteps: ['Write the inequality for the seats.', 'Write the inequality for the money.', 'Count the constraints the sale meets.'],
    responses: [
      inequality('seats', 'Seats', 'x + y <= {{n}}'),
      inequality('money', 'Money collected', '{{p}}x + {{q}}y >= {{M}}'),
      number('met', 'How many of the two constraints does the sale meet?', '{{cnt}}'),
    ],
    solutionReview: review(
      'Write both constraints, then test the sale in each.',
      ['x + y ≤ {{n}} and {{p}}x + {{q}}y ≥ {{M}}.', '{{x0}} + {{y0}} = {{T}} tickets and {{p}}({{x0}}) + {{q}}({{y0}}) = {{R}} dollars, so the sale meets {{cnt}} of the 2 constraints.'],
      'x + y ≤ {{n}}; {{p}}x + {{q}}y ≥ {{M}}; {{cnt}}',
      'Checking only the seats: a sale must also collect enough money.',
    ),
    generator: {
      parameters: { p: { type: 'int', min: 8, max: 15 }, q: { type: 'int', min: 4, max: 7 }, x0: { type: 'int', min: 20, max: 60 }, y0: { type: 'int', min: 20, max: 60 }, e: { type: 'int', min: 5, max: 30 }, dd: { type: 'int', min: 10, max: 60 }, s: { type: 'int', min: 0, max: 1 } },
      // s = 1: the sale meets the money goal too; s = 0: it falls short.
      derived: { n: 'x0 + y0 + e', T: 'x0 + y0', R: 'p*x0 + q*y0', M: 'p*x0 + q*y0 + dd*(1 - 2*s)', cnt: '1 + s' },
    },
    questionFamily: { scope: 'assignment' },
  },
];

const dolHonors = (P) => [
  inequalityBuild({
    questionId: `${P}-dol-1`,
    alignment: A3H,
    dok: 2,
    difficultyBand: 4,
    prompt: tex`Graph the system $ {{a|coef}}x + y \ge {{c}} $ and $ x - y > {{d}} $. Rewrite each inequality with y alone in the tool first. Then test the point (0, 0).`,
    source: ['{{a|coef}}x + y >= {{c}}', 'x - y > {{d}}'],
    constraints: [{ A: '{{a}}', B: 1, C: '{{nc}}', relation: '>=' }, { A: 1, B: -1, C: '{{nd}}', relation: '>' }],
    rewrite: true,
    testPoint: { x: 0, y: 0 },
    directionSteps: ['Rewrite each inequality with y alone.', 'Build both boundary lines.', 'Choose solid or dashed for each.', 'Shade each half-plane and find the overlap.', 'Test the point.'],
    solutionReview: review(
      'Rewrite, build, shade.',
      ['{{a|coef}}x + y ≥ {{c}} becomes y ≥ −{{a|coef}}x {{c|signed}} (solid, above); x − y > {{d}} becomes y < x {{nd|signed}} (dashed, below; dividing by −1 reverses the symbol).', 'The solution set is the region shaded by both.'],
      null,
      'Keeping > after dividing x − y > {{d}} by −1.',
    ),
    generator: {
      parameters: { a: { type: 'int', min: 1, max: 3 }, h: { type: 'int', min: -3, max: 3 }, k: { type: 'int', min: -3, max: 3 } },
      // Both boundaries pass through the whole-number point (h, k).
      derived: { c: 'k + a*h', d: 'h - k', nc: '0 - (k + a*h)', nd: '0 - (h - k)' },
      constraints: ['k + a*h != 0', 'h - k != 0', 'abs(k + a*h) <= 9'],
    },
    questionFamily: { scope: 'assignment' },
  }),
  inequalityBuild({
    questionId: `${P}-dol-2`,
    alignment: A3H,
    dok: 3,
    difficultyBand: 4,
    prompt: tex`Graph the system $ {{m|coef}}x - y > {{c1}} $ and $y > {{m|coef}}x {{b2|signed}}$. Rewrite the first inequality with y alone in the tool first, then classify the solution region.`,
    source: ['{{m|coef}}x - y > {{c1}}', 'y > {{m|coef}}x {{b2|signed}}'],
    constraints: [{ A: '{{m}}', B: -1, C: '{{nc1}}', relation: '>' }, { m: '{{m}}', b: '{{b2}}', relation: '>' }],
    rewrite: true,
    classify: true,
    directionSteps: ['Rewrite each inequality with y alone.', 'Build both boundary lines.', 'Choose solid or dashed for each.', 'Shade each half-plane.', 'Classify the solution region.'],
    solutionReview: review(
      'Rewrite, then compare the parallel boundaries.',
      ['{{m|coef}}x − y > {{c1}} becomes y < {{m|coef}}x {{nc1|signed}} (dividing by −1 reverses the symbol).', 'The system shades below y = {{m|coef}}x {{nc1|signed}} and above y = {{m|coef}}x {{b2|signed}}: a strip if the second line is lower, no solution if it is higher.'],
      null,
      'Keeping > after dividing by −1, which shades both inequalities above.',
    ),
    generator: {
      parameters: { m: { type: 'int', min: 1, max: 3 }, c1: { type: 'int', min: -5, max: 5, exclude: [0] }, g: { type: 'int', min: 2, max: 5 }, s: { type: 'int', min: 0, max: 1 } },
      // s = 1: the second boundary is below the first, a strip; s = 0: no solution.
      derived: { nc1: '0 - c1', b2: '0 - c1 - g*(2*s - 1)' },
      constraints: ['0 - c1 - g*(2*s - 1) != 0', 'abs(c1 + g*(2*s - 1)) <= 9'],
    },
    questionFamily: { scope: 'assignment' },
  }),
  {
    questionId: `${P}-dol-3`,
    ...A2H_SYSTEM,
    studentActions: ['multipleResponses'],
    dok: 3,
    difficultyBand: 4,
    prompt: 'A club can make at most {{n}} prints in all and can spend at most ${{B}} on supplies. A small print costs ${{p}} to make and a large print costs ${{q}}. Let x be the number of small prints and y the number of large prints. Write the system, then find the greatest number of large prints the club can make if it makes {{x0}} small prints.',
    directionSteps: ['Write the inequality for the number of prints.', 'Write the inequality for the supplies.', 'Find the most large prints each constraint allows.', 'Choose the greatest number that meets both.'],
    responses: [
      inequality('count', 'Number of prints', 'x + y <= {{n}}'),
      inequality('budget', 'Supply cost', '{{p}}x + {{q}}y <= {{B}}'),
      number('most', 'Greatest number of large prints', '{{G}}'),
    ],
    solutionReview: review(
      'Each constraint gives a limit; the smaller limit wins.',
      ['x + y ≤ {{n}} and {{p}}x + {{q}}y ≤ {{B}}.', 'With x = {{x0}}: the count allows y ≤ {{cnt}}; the budget allows {{q}}y ≤ {{bud}}, so y ≤ {{bf}} whole prints.', 'Both must hold, so the greatest is {{G}}.'],
      'x + y ≤ {{n}}; {{p}}x + {{q}}y ≤ {{B}}; {{G}}',
      'Using only one constraint: the answer must satisfy both.',
    ),
    generator: {
      parameters: { p: { type: 'int', min: 2, max: 4 }, q: { type: 'int', min: 5, max: 8 }, n: { type: 'int', min: 20, max: 30 }, x0: { type: 'int', min: 5, max: 12 }, B: { type: 'int', min: 100, max: 200, step: 5 } },
      derived: { cnt: 'n - x0', bud: 'B - p*x0', bf: 'floor((B - p*x0)/q)', G: 'min(n - x0, floor((B - p*x0)/q))' },
      constraints: ['B - p*x0 > 0'],
    },
    questionFamily: { scope: 'assignment' },
  },
];

/* -------------------------------------------------------- the files */

const assignment = (honors) => ({
  title: `Systems of Linear Inequalities${honors ? ' Honors' : ''} (M3 T2 L5)`,
  courseId: 'algebra1',
  folder: FOLDER,
  instructionalPurpose: 'lesson',
  gradingPurpose: 'classwork',
  essentialQuestion: 'What does the graph of a system of linear inequalities look like, and how can you describe the solution set?',
  instructions: 'Systems of linear inequalities. Every system is graphed in the graphing workspace: each boundary line, solid or dashed, each half-plane, and the overlap where the solutions are — then you test points and describe the region. For a word problem, write the constraints in the tool before you graph them. You have 3 tries on each Warm-Up, Classwork and Practice question, with hints. The Exit Ticket is one try with no hints.',
  teacherNotes: `Algebra I Module 3 Topic 2 Lesson 5, from the district slides (three 45-minute days), TEKS A.3H with A.2H for writing the constraints.${honors ? ' Honors version: the same lesson with standard-form systems to rewrite in the Warm-Up, Practice and Exit Ticket, a parameter (P11), a bounded region with its corners and area (P12, P13), a sort of systems by their solution sets (P14), Emma’s corners found algebraically (P15), and two audited Digital SAT items from the CCMR bank (P16, P17), so the Honors version is ready as written.' : ''} Classwork order: a plain system, y > x − 2 and y ≤ −x + 4 (CW 17, added), comes first, then Activity 5.2's x + y > 1 and −x + y ≤ 3 (CW 5–6), then Noah's raft (Getting Started and Activity 5.1, CW 1–4), so students build the plain case before the word problem. Warm-Up rebuilt as readiness: one inequality graphed (Lesson 4), a point checked against two inequalities, and two constraints written for one situation. Every system is built in the Systems Workspace except Emma’s: her calorie line, 6.9x + 10.4y = 400, has no whole-number points to plot, so the tool draws her system and students test a point and choose their own (the slide says to use technology). Warm-Up and Exit Ticket are generated per student and back Recovery. Slide notes: the Getting Started "Think about…" box names Chase; the guide is Noah. On the Activity 5.4 slide the pictures of Systems B and C overlap; this file uses B: y > (3/5)x + 3 and y > −(3/5)x + 3, C: y > (3/5)x + 3 and y < −(3/5)x + 3, which match Possible Solutions B and C.`,
});

const P = 'm3t2l5';
const H = 'm3t2l5h';

export const L5_REGULAR = {
  file: 'teacher-import-jsons/algebra1-module3/T2_L5_Systems_of_Linear_Inequalities.json',
  lesson: {
    schemaVersion: 5,
    assignment: assignment(false),
    variantPolicy: { mode: 'personalized', sectionModes: { warmup: 'shared', classwork: 'shared', practice: 'personalized', dol: 'personalized' } },
    sections: [
      { id: 'warmup', role: 'warmup', title: 'Warm-Up — From One Inequality to Two', recommendedMinutes: 10, questions: [oneInequalityWarmup(`${P}-wu-1`, false), twoConditionsWarmup(`${P}-wu-2`), twoConstraintsWarmup(`${P}-wu-3`)] },
      { id: 'classwork', role: 'classwork', title: 'Classwork — Systems of Linear Inequalities', recommendedMinutes: 100, questions: classwork(P) },
      { id: 'practice', role: 'practice', title: 'Practice — Graphing and Interpreting Systems of Inequalities', recommendedMinutes: 45, questions: practiceRegular(P) },
      { id: 'dol', role: 'dol', title: 'Exit Ticket (DOL) — Systems of Linear Inequalities', recommendedMinutes: 10, questions: dolRegular(P) },
    ],
  },
};

export const L5_HONORS = {
  file: 'teacher-import-jsons/algebra1-module3/T2_L5_Systems_of_Linear_Inequalities_Honors.json',
  lesson: {
    schemaVersion: 5,
    assignment: assignment(true),
    variantPolicy: { mode: 'personalized', sectionModes: { warmup: 'shared', classwork: 'shared', practice: 'personalized', dol: 'personalized' } },
    sections: [
      { id: 'warmup', role: 'warmup', title: 'Warm-Up — From One Inequality to Two', recommendedMinutes: 10, questions: [oneInequalityWarmup(`${H}-wu-1`, true), twoConditionsWarmup(`${H}-wu-2`), twoConstraintsWarmup(`${H}-wu-3`)] },
      { id: 'classwork', role: 'classwork', title: 'Classwork — Systems of Linear Inequalities', recommendedMinutes: 100, questions: classwork(H) },
      { id: 'practice', role: 'practice', title: 'Practice — Graphing, Interpreting and Reasoning with Systems of Inequalities', recommendedMinutes: 50, questions: practiceHonors(H) },
      { id: 'dol', role: 'dol', title: 'Exit Ticket (DOL) — Systems of Linear Inequalities', recommendedMinutes: 10, questions: dolHonors(H) },
    ],
  },
};

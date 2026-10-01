// One authored question per Path-eligible tool, shared by the browser capture
// harness and the server contract tests.
//
// It matters that this is ONE file. The interval bug survived because the test
// invented a response by hand and the browser built a different one; if the
// harness and the grader can be pointed at different questions, the same gap
// reopens somewhere else. The harness renders these, a student answers them in
// a real browser, and the captured work is graded against these same objects.

export const PATH_TOOL_QUESTIONS = {
  algebra: {
    type: 'algebra',
    prompt: 'Solve for x.',
    equationLatex: '2x + 5 = 13',
    variable: 'x',
    answer: '4',
    acceptedAnswers: ['4.0'],
  },

  system: {
    type: 'system',
    prompt: 'Solve the system.',
    equationsLatex: ['y = 2x + 1', 'y = -x + 4'],
    graph: { xMin: -5, xMax: 5 },
    answer: '(1, 3)',
    // No `classification` here on purpose: the systems grader collects an
    // ordered pair and offers no way to classify, so a classification would be
    // marked wrong on work the student was never asked to do. Classifying is
    // what `systemsWorkspace` is for, and that fixture does ask for it.
  },

  relationMapping: {
    type: 'relationMapping',
    prompt: 'Build the mapping diagram, then give the domain, the range and whether it is a function.',
    // Stored the Firestore-safe way, which is how a real bank document looks.
    pairs: [{ x: -2, y: 3 }, { x: 1, y: 2 }, { x: 3, y: -1 }],
    ask: ['mapping', 'domain', 'range', 'isFunction'],
    domainLabel: 'x',
    rangeLabel: 'y',
  },

  intervalNumberLine: {
    type: 'intervalNumberLine',
    prompt: 'Graph -3 ≤ x < 5 on the number line, then write it in interval notation.',
    min: -8,
    max: 8,
    step: 1,
    variable: 'x',
    ask: ['graph', 'interval'],
    intervals: [{ min: -3, max: 5, minClosed: true, maxClosed: false }],
  },

  // The same tool asked for a union of two rays. Worth capturing separately
  // because JSON has no Infinity: a ray drawn to ±∞ in the browser arrives at
  // the server as null, and the union may be drawn in either order.
  intervalNumberLineRays: {
    type: 'intervalNumberLine',
    prompt: 'Graph x ≤ -3 or x > 2, then write it in interval notation.',
    min: -8,
    max: 8,
    step: 1,
    variable: 'x',
    ask: ['graph', 'interval'],
    inequalityText: 'x ≤ -3 or x > 2',
    intervals: [
      { min: null, max: -3, minClosed: false, maxClosed: true },
      { min: 2, max: null, minClosed: false, maxClosed: false },
    ],
  },

  multiAnswer: {
    type: 'multiAnswer',
    prompt: 'Analyse the function y = 3x - 2.',
    answerFields: [
      { id: 'slope', label: 'Slope', expected: '3' },
      { id: 'intercept', label: 'y-intercept', expected: '-2' },
    ],
  },

  regressionCalculator: {
    type: 'regressionCalculator',
    prompt: 'Read the scatterplot, enter the ordered pairs, run linear regression, and interpret the produced correlation.',
    sourceData: [[1, 2], [2, 4], [3, 5], [4, 8]],
    sourceMode: 'scatterplot',
    sourceGraphBounds: { xMin: 0, xMax: 5, yMin: 0, yMax: 9 },
    requireInterpretation: true,
  },

  systemsWorkspace: {
    type: 'systemsWorkspace',
    prompt: 'Solve and classify the system.',
    mode: 'linear',
    system: { m1: 2, b1: 1, m2: -1, b2: 7 },
  },

  // The Systems Workspace's other Path modes, each as the shipped bank authors
  // it (A2.3B matrix technology; A2.3G read the region; A.3D / A2.3F graph the
  // system). The server re-solves each from the public question.
  //
  // 3×3 by RREF technology: x = 1, y = 2, z = 3. The workspace makes the
  // student run the RREF before the work counts (requireTechnology).
  systemsWorkspaceMatrix3: {
    type: 'systemsWorkspace',
    prompt: 'Use matrix technology to compute the RREF of this augmented matrix, then classify the system and report x, y and z.',
    mode: 'matrix3',
    requireTechnology: true,
    matrix: { rows: [[1, 1, 1, 6], [2, -1, 1, 3], [1, 2, -1, 2]] },
  },

  // Read the region: the marked point (5, 1) is outside y ≥ x, so the answer
  // is "no" — the answer a blank choice used to be read as.
  systemsWorkspaceInequalities: {
    type: 'systemsWorkspace',
    prompt: 'Use the solution region for y ≥ x and y < -x + 4. Decide whether the marked point is a solution, then enter a feasible ordered pair.',
    mode: 'inequalities',
    interaction: 'analyze',
    ask: ['testPoint', 'candidate'],
    inequalities: [{ m: 1, b: 0, relation: '>=' }, { m: -1, b: 4, relation: '<' }],
    testPoint: { x: 5, y: 1 },
    graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 10 },
  },

  // Graph the system: two points on each boundary, solid or dashed, and the
  // side to shade, for both inequalities.
  systemsWorkspaceInequalityConstruct: {
    type: 'systemsWorkspace',
    prompt: 'Graph the system y ≥ x and y < -x + 4: construct each boundary and shade the side that solves it.',
    mode: 'inequalities',
    interaction: 'construct',
    ask: ['construction'],
    inequalities: [{ m: 1, b: 0, relation: '>=' }, { m: -1, b: 4, relation: '<' }],
    graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 10 },
  },

  dataModelingLab: {
    type: 'dataModelingLab',
    prompt: 'Calculate and interpret the correlation coefficient.',
    mode: 'correlation',
    points: [[1, 3], [2, 5], [3, 7], [4, 9]],
    correlationTolerance: 0.02,
  },

  graphing2: {
    type: 'graphing2',
    prompt: 'Graph y = 2x + 1 using two points.',
    mode: 'slopeIntercept',
    line: { m: 2, b: 1 },
    graphBounds: { xMin: -6, xMax: 6, yMin: -8, yMax: 10 },
    tolerance: 0.12,
  },

  stepAlgebra: {
    type: 'stepAlgebra',
    prompt: 'Solve on the balance workspace.',
    // Authored the way the platform's own catalogue documents it: `equationLatex`
    // and nothing else. Nothing translated that into what the workspace parser
    // reads, so this exact question used to reach the student as an error card.
    equationLatex: 'x - 6 = 9',
    variable: 'x',
    // Guided. The support level changes how much the workspace does for the
    // student; it does not change the shape of what it submits.
    workspaceDifficulty: 1,
    answer: '15',
  },

  functionInvestigation: {
    type: 'functionInvestigation',
    prompt: 'Graph y = 2x + 1, then describe it.',
    functionSpec: { type: 'linear', m: 2, b: 1 },
    pointTasks: [
      { id: 'p1', label: 'Plot the point where x = 0', x: 0, expected: [0, 1] },
      { id: 'p2', label: 'Plot the point where x = 2', x: 2, expected: [2, 5] },
    ],
    // `domain` is one of the kinds the workspace renders as a typed notation
    // box. A kind it does not recognise silently becomes a click-a-point task,
    // which is why the contract refuses to issue one.
    analysisParts: [
      { id: 'domain', kind: 'domain', notation: 'interval', acceptedAnswers: ['(-∞, ∞)', '(-inf, inf)'] },
    ],
  },
};

export default PATH_TOOL_QUESTIONS;

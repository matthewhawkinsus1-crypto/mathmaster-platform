// One authored question for each registry tool the Path capture never reached
// (CI02, finding C2-58): Polynomial Workshop, Representation Bridge,
// Representation Match and Matrix Lab. These tools are not Path tools, so
// tests/browser/captureToolResponses.mjs (which captures what a Path tool sends)
// could not drive them. What they send is the structured tool response
// QuestionEngine records with an attempt (`toolResponse`) and the server
// re-grades.
//
// ONE file, for the same reason as pathToolQuestions.mjs: the browser harness
// (tests/browser/captureRegistryToolResponsesMain.jsx) renders these, a student
// who knows the answer completes them in Chromium, and
// tests/platform/registryToolCapturedResponses.test.mjs grades the captured
// responses against these same objects.

export const REGISTRY_TOOL_QUESTIONS = Object.freeze({
  // x² − 5x + 6 = (x − 2)(x − 3): p and q are −2 and −3.
  polynomialWorkshop: Object.freeze({
    questionId: 'capture-polynomial-workshop',
    type: 'polynomialWorkshop',
    mode: 'factorQuadratic',
    prompt: 'Factor x² − 5x + 6 as (x + p)(x + q).',
    coefficients: [1, -5, 6],
  }),

  // The booth table rises 10 every 2 items: y = 5x − 20, zero at x = 4, so
  // y = 5(x − 4). Only the two equation stages are asked.
  representationBridge: Object.freeze({
    questionId: 'capture-representation-bridge',
    type: 'representationBridge',
    prompt: 'Write the profit as an equation in general form and in factored linear form.',
    mode: 'linear',
    source: { kind: 'table', rows: [{ x: 0, y: -20 }, { x: 2, y: -10 }, { x: 4, y: 0 }, { x: 6, y: 10 }] },
    context: {
      inputLabel: 'items sold', outputLabel: 'profit', inputUnit: 'items', outputUnit: 'dollars',
      rateUnit: 'dollars per item', rateMeaning: 'profit earned for each item sold',
      yInterceptMeaning: 'starting profit after paying the booth fee',
      zeroMeaning: 'number of items that must be sold to break even',
    },
    requiredStages: ['generalForm', 'factoredForm'],
    graphBounds: { xMin: -2, xMax: 8, yMin: -25, yMax: 15 },
    feedbackTiming: 'submitOnly',
  }),

  // The point-slope card y − 1 = −2(x + 2) does not describe y = −2x + 5; the
  // correction that does is y − 1 = −2(x − 2).
  representationMatch: Object.freeze({
    questionId: 'capture-representation-match',
    type: 'representationMatch',
    mode: 'linearConnections',
    task: 'findMismatch',
    prompt: 'One card does not describe the same line as the others. Find it and correct it.',
    sets: [{ id: 'm', slopeIntercept: 'y=-2x+5', factoredLinear: 'y=-2(x-2.5)', pointSlope: 'y-1=-2(x+2)', standard: '2x+y=5' }],
    mismatchSetId: 'm',
    correctionOptions: [{ id: 'minus', label: 'y-1=-2(x-2)' }, { id: 'plus', label: 'y+1=-2(x+2)' }],
    correctionAnswerId: 'minus',
  }),

  // A · X = B for the system, written from its equations.
  matrixLab: Object.freeze({
    questionId: 'capture-matrix-lab',
    type: 'matrixLab',
    mode: 'equation',
    prompt: 'Write the system as the matrix equation A · X = B.',
    equations: ['2x - 3y + z = 7', 'x + y + z = -5', 'x + 2y + 4z = -17'],
    variables: ['x', 'y', 'z'],
  }),
});

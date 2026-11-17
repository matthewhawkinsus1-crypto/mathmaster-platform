/*
 * QUESTIONS THAT OPEN EVERY DRAFT-BACKED FIELD OF EVERY REGISTRY TOOL.
 *
 * The draft-shape tests (toolDraftRestoreSweep.test.mjs,
 * toolDraftDamagedRestore.test.mjs) open each registry tool on these, beside the
 * preview bench's question (SAMPLE_SPECS in src/dev/MathToolsLab.jsx), the
 * captured fixtures (registryToolQuestions.mjs, pathToolQuestions.mjs) and the
 * draft-persistence journey's questions (tests/browser/draftPersistenceScenes.mjs),
 * so that every field a tool keeps in its draft is rendered by at least one
 * question: toolDraftRestoreSweep fails when a field is not. The first group
 * is the typed-value render sweep's own extra modes; the rest reach the modes
 * and stages those do not (a 3×3 method, the three-plane view, each Polynomial
 * Workshop and Complex Plane mode). All data is synthetic.
 */
export const TOOL_DRAFT_EXTRA_SCENES = Object.freeze([
  { id: 'systemsWorkspace-algebraic', type: 'systemsWorkspace', mode: 'algebraic' },
  { id: 'systemsWorkspace-inequalities', type: 'systemsWorkspace', mode: 'inequalities', inequalities: [{ orientation: 'vertical', x: 1, relation: '>=' }, { orientation: 'horizontal', y: 3, relation: '<' }], studentBuild: { boundary: true, lineStyle: true, shading: true }, reasoning: { classifyRegion: true }, graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 10 } },
  { id: 'polynomialWorkshop-longDivision', type: 'polynomialWorkshop', mode: 'longDivision', dividend: 'y^4-3y^3+2y^2-20', divisor: 'y^2+y-5' },
  { id: 'polynomialWorkshop-syntheticDivision', type: 'polynomialWorkshop', mode: 'syntheticDivision', dividend: '4y^3-6y^2+4y-1', divisor: '2y-1' },
  { id: 'polynomialWorkshop-multiplyArea', type: 'polynomialWorkshop', mode: 'multiplyArea', leftFactor: 'x^2-3x+4', rightFactor: 'x-5' },
  { id: 'signSolutionAnalyzer-radicalSolve', type: 'signSolutionAnalyzer', mode: 'radicalSolve', radicalEquation: { variable: 'm', index: 6, coefficient: 7, radicand: { m: 5, b: 4 }, outside: -4, rhs: { m: 0, b: 10 } } },
  { id: 'sequenceExplorer-fullBridge', type: 'sequenceExplorer', mode: 'fullBridge', sequence: { kind: 'arithmetic', first: 3, difference: 2 }, displayCount: 5, targetN: 8 },
  { id: 'matrixLab-operate', type: 'matrixLab', mode: 'operate', operation: 'subtract', left: 'A', right: 'B', matrices: { A: { rows: [[1, 2], [3, 4]] }, B: { rows: [[0, 1], [1, 0]] } } },
  { id: 'matrixLab-completeSystem', type: 'matrixLab', mode: 'completeSystem', targets: [{ id: 'none', classification: 'none' }, { id: 'many', classification: 'many' }], equations: ['5x - 3y + z = -4', 'x + 2y - 3z = 0'] },
  { id: 'transformationsLab-identify', type: 'transformationsLab', mode: 'identify', family: 'exponential', function: { type: 'exponential', a: 2, h: 1, k: -3, base: 2 } },
  { id: 'transformationsLab-match', type: 'transformationsLab', mode: 'match', family: 'quadratic', target: { a: 2, h: -1, k: 3 }, initial: { a: 1, h: 0, k: 0 } },
  { id: 'exponentialLogBridge-solveExponential', type: 'exponentialLogBridge', mode: 'solveExponential', equation: { base: 2, m: 2, c: -1, rhs: 16 } },
  { id: 'complexPlaneLab-operations', type: 'complexPlaneLab', mode: 'operations', operation: 'add', z: { re: 3, im: 1 }, w: { re: 2, im: -1 } },
  { id: 'representationBridge-linearMultipleRepresentations', type: 'representationBridge', mode: 'linearMultipleRepresentations', source: { kind: 'slopeIntercept', m: -0.75, b: 2 }, feedbackTiming: 'guided' },
  { id: 'stepAlgebra2-rewriteLinearForm', type: 'stepAlgebra2', mode: 'rewriteLinearForm', targetForm: 'factoredLinear', equation: 'y = 15x - 45' },
  { id: 'stepAlgebra2-linearIntercepts', type: 'stepAlgebra2', mode: 'linearIntercepts', standard: { A: 2, B: 3, C: 12 } },
  { id: 'linearTableWorkbench-repairValue', type: 'linearTableWorkbench', mode: 'repairValue', rows: [{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 9 }] },
  { id: 'functionOperationsLab-default', type: 'functionOperationsLab', f: { type: 'linear', m: 2, b: 3 }, g: { type: 'linear', m: 1, b: -4 }, operations: ['sum', 'difference', 'product', 'quotient'] },
  { id: 'sequenceExplorer-ruleBridge', type: 'sequenceExplorer', mode: 'ruleBridge', sequence: { kind: 'arithmetic', first: 3, difference: 4 } },
  { id: 'sequenceExplorer-missingTerm', type: 'sequenceExplorer', mode: 'missingTerm', sequence: { kind: 'geometric', first: 2, ratio: 3 }, missingIndex: 3 },
  { id: 'sequenceExplorer-partialSum', type: 'sequenceExplorer', mode: 'partialSum', kind: 'geometric', sequence: { first: 3, ratio: 2 }, sumN: 5 },
  { id: 'exponentialLogBridge-solveLogarithmic', type: 'exponentialLogBridge', mode: 'solveLogarithmic', equation: { base: 2, m: 3, c: -1, result: 3 } },
  { id: 'exponentialLogBridge-composition', type: 'exponentialLogBridge', mode: 'composition' },
  { id: 'exponentialLogBridge-equivalentForms', type: 'exponentialLogBridge', mode: 'equivalentForms' },
  { id: 'ax32-locate', type: 'matrixLab', mode: 'locate', prompt: 'Read the matrix.', matrix: 'A', askDimensions: true, matrices: { A: { name: 'A', rows: [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]] } }, targets: [{ id: 'a23', kind: 'tap', row: 2, col: 3 }, { id: 'a14', kind: 'tap', row: 1, col: 4 }, { id: 'n1', kind: 'notation', row: 3, col: 2, description: 'the entry in row 3 and column 2' }] },
  { id: 'parabolaGeometryLab-equidistance', type: 'parabolaGeometryLab', mode: 'equidistance', h: 0, k: 0, p: 1, point: [3, 4] },
  { id: 'parabolaGeometryLab-fromGeometry', type: 'parabolaGeometryLab', mode: 'fromGeometry' },
  { id: 'parabolaGeometryLab-equation', type: 'parabolaGeometryLab', mode: 'equation', h: -2, k: 1, p: 1.5, orientation: 'vertical' },
  { id: 'complexPlaneLab-division', type: 'complexPlaneLab', mode: 'division', z: { re: 4, im: 2 }, w: { re: 1, im: -1 } },
  { id: 'complexPlaneLab-powers', type: 'complexPlaneLab', mode: 'powers', z: { re: 1, im: 1 }, exponent: 3 },
  { id: 'complexPlaneLab-quadraticRoots', type: 'complexPlaneLab', mode: 'quadraticRoots', quadratic: { a: 1, b: -4, c: 13 } },
  { id: 'inverseCompositionLab-deriveInverse', type: 'inverseCompositionLab', mode: 'deriveInverse', function: { family: 'linear', m: 2, b: 3 } },
  { id: 'polynomialWorkshop-factorZero', type: 'polynomialWorkshop', mode: 'factorZero', coefficients: [1, -5, 6], candidateRoot: 1 },
  { id: 'polynomialWorkshop-multiplyArea-2', type: 'polynomialWorkshop', mode: 'multiplyArea' },
  { id: 'polynomialWorkshop-addSubtract', type: 'polynomialWorkshop', mode: 'addSubtract', operation: 'subtract', firstPolynomial: '3x^2+2x-5', secondPolynomial: 'x^2-4x+1' },
  { id: 'polynomialWorkshop-division', type: 'polynomialWorkshop', mode: 'division', dividend: [1, 0, -7, 6], divisor: [1, 3] },
  { id: 'polynomialWorkshop-rationalFeatures', type: 'polynomialWorkshop', mode: 'rationalFeatures', numeratorRoots: [2, -1], denominatorRoots: [2, 4], targetValue: 2 },
  { id: 'polynomialWorkshop-synthetic', type: 'polynomialWorkshop', mode: 'synthetic', dividend: [1, 0, -7, 6], divisor: [1, 3] },
  { id: 'polynomialWorkshop-synthetic-2', type: 'polynomialWorkshop', mode: 'synthetic', dividend: [1, 6, 2], candidateRoot: 4, ask: ['value', 'quotient'] },
  { id: 'systemsWorkspace-algebraic-substitution', type: 'systemsWorkspace', mode: 'algebraic', method: 'substitution', variables: ['x', 'y', 'z'], equations: ['x + y + z = 6', '2x - y + 3z = 9', '3x + 2y - z = 4'], requireVerification: true },
  { id: 'systemsWorkspace-algebraic-elimination', type: 'systemsWorkspace', mode: 'algebraic', method: 'elimination', variables: ['x', 'y', 'z'], equations: ['x + y + z = 6', '2x - y + 3z = 9', '3x + 2y - z = 4'], requireVerification: true },
  { id: 'systemsWorkspace-algebraic-studentChoice', type: 'systemsWorkspace', mode: 'algebraic', method: 'studentChoice', variables: ['x', 'y', 'z'], equations: ['2x = 2', '3y = 6', 'z = 3'], requireVerification: true },
  { id: 'systemsWorkspace-spatial', type: 'systemsWorkspace', mode: 'spatial', equations: ['x + y + z = 6', 'x - y + z = 2', '2x + y - z = 1'], variables: ['x', 'y', 'z'] },
  { id: 'systemsWorkspace-linear-construct', type: 'systemsWorkspace', mode: 'linear', interaction: 'construct', system: { m1: 2, b1: -1, m2: -1, b2: 5 } },
  { id: 'complexPlaneLab-features', type: 'complexPlaneLab', mode: 'features', z: { re: 3, im: -4 } },
  { id: 'journey-sub-2x2', type: 'systemsWorkspace', mode: 'algebraic', method: 'substitution', equations: ['2x + y = 7', 'x - y = -1'], variables: ['x', 'y'], requireVerification: true },
  { id: 'journey-elim-2x2', type: 'systemsWorkspace', mode: 'algebraic', method: 'elimination', equations: ['3x + 2y = 12', 'x - 2y = -4'], variables: ['x', 'y'], requireVerification: true },
  { id: 'journey-choice-2x2', type: 'systemsWorkspace', mode: 'algebraic', method: 'studentChoice', equations: ['x + y = 5', 'x - y = 1'], variables: ['x', 'y'], requireVerification: true },
  { id: 'journey-special-2x2', type: 'systemsWorkspace', mode: 'algebraic', method: 'substitution', equations: ['y = 2x + 1', '2y - 4x = 2'], variables: ['x', 'y'] },
].map((question) => Object.freeze(question)));

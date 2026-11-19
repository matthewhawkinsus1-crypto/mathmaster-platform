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
import { DRAFT_SCENES } from '../../browser/draftPersistenceScenes.mjs';

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

/*
 * QUESTIONS THAT OPEN EVERY RESPONSE MODULE OUTSIDE THE TOOL REGISTRY.
 *
 * The question engine's own response kinds read their drafts under keys of
 * their own (`${draftKey}:multi-answer`, `:step-algebra`, `:workflow-responses`),
 * through checkedQuestionDraft.js. moduleDraftDamagedRestore.test.mjs mounts
 * each `module` (its default export) as QuestionEngine does, for `question`
 * (with `props` beside the engine's), on hostile and damaged drafts and on the
 * valid ones: `valid` below, and those recorded in Chromium
 * (moduleDraftValidRecords.json). The lab and the secure field item take
 * their saved work another way (`kind`). All data is synthetic.
 */
const LINE_GRAPH = (m, b) => ({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, functions: [{ type: 'line', m, b }] });
const CHOCOLATE_QUANTITIES = [{ id: 'bars', label: 'Bars sold', unit: 'bars' }, { id: 'money', label: 'Money raised', unit: 'dollars' }];
export const RESPONSE_MODULE_SCENES = Object.freeze([
  { id: 'fraction-simplify', module: '/src/FractionGrader.jsx', question: { type: 'fraction', prompt: 'Simplify 14/4.', answer: '7/2' }, valid: { ':fraction': ['\\frac72', '7/2'] } },
  { id: 'fraction-add', module: '/src/FractionGrader.jsx', question: { type: 'fraction', prompt: 'Add.', n1: 3, d1: 2, n2: 2, d2: 1 }, valid: { ':fraction': ['\\frac72'] } },
  { id: 'literal', module: '/src/LiteralGrader.jsx', question: { type: 'literal', prompt: 'Solve A = lw for w.', formula: 'A = l*w', solveFor: 'w', acceptedAnswers: ['A/l'] }, valid: { ':literal': ['\\frac{A}{l}'] } },
  { id: 'ordered-pair', module: '/src/OrderedPairGrader.jsx', question: { type: 'orderedPair', prompt: 'Where do y = x + 1 and y = 3 meet?', answer: '(2,3)' }, valid: { ':ordered-pair': ['\\left(2,3\\right)'] } },
  { id: 'system', module: '/src/SystemGrader.jsx', question: { type: 'system', prompt: 'Solve the system: y = x + 1 and y = -x + 5.', equations: ['y = x + 1', 'y = -x + 5'], solution: [2, 3] }, valid: { ':system': ['(2,3)'] } },
  { id: 'table', module: '/src/TableGrader.jsx', question: { type: 'table', prompt: 'Complete the table for f(x) = 2x + 1.', table: { columns: [{ key: 'x', label: 'x' }, { key: 'y', label: 'f(x)' }], rows: [{ x: 0, y: null }, { x: 1, y: null }, { x: 2, y: null }], answers: { '0:y': 1, '1:y': 3, '2:y': 5 } } }, valid: { ':table': [{ '0:y': '1', '1:y': '3', '2:y': '5' }] } },
  { id: 'multi-answer', module: '/src/MultiAnswerGrader.jsx', question: { type: 'multiAnswer', prompt: 'Find the slope and the y-intercept.', answerFields: [{ id: 'slope', label: 'Slope', answer: '3/4' }, { id: 'intercept', label: 'y-intercept', answer: '1' }, { id: 'set', label: 'Solution set', answer: '{1, 2}', inputType: 'set' }] }, valid: { ':multi-answer': [{ slope: '\\frac34', intercept: '1', set: '\\{1,2\\}' }] } },
  { id: 'multi-answer-choice', module: '/src/MultiAnswerGrader.jsx', question: { type: 'multiAnswer', prompt: 'Is the relation a function? Then name its domain.', answerFields: [{ id: 'fn', label: 'Function?', choices: ['Yes', 'No'], answer: 'Yes' }, { id: 'words', label: 'Explain', answer: 'each input has one output', type: 'text' }, { id: 'domain', label: 'Domain', answer: '[-4, 4]' }] }, valid: { ':multi-answer': [{ fn: 'Yes', words: 'each input has one output', domain: '[-4,4]' }] } },
  { id: 'graph-line', module: '/src/GraphLine.jsx', question: { type: 'graphing', prompt: 'Read the slope and the y-intercept.', m: 2, b: -3 }, valid: { ':line': [{ slope: '2', intercept: '-3' }] } },
  { id: 'number-line', module: '/src/NumberLine.jsx', question: { type: 'numberLine', prompt: 'Select 5 on the number line.', target: 5, choices: [-10, -5, 0, 5, 10] }, valid: { ':number-line': [5, -10] } },
  { id: 'relationship-model', module: '/src/RelationshipModel.jsx', question: { type: 'relationshipModel', prompt: 'Identify x, y, and association.', correctIndependentId: 'x', correctDependentId: 'y' }, valid: { ':relationship-model': [{ independentId: 'x', dependentId: 'y', relationshipType: 'positive', xLabel: 'Time', xUnit: 'hours', yLabel: 'Distance', yUnit: 'km', xStep: '1', yStep: '10', originMeaning: 'start', pointMeaning: { xQuantityId: 'x', xValue: '3', xUnit: 'hours', yQuantityId: 'y', yValue: '45', yUnit: 'km', openText: '' } }] } },
  { id: 'context-interpretation', module: '/src/ContextInterpretation.jsx', question: { type: 'contextInterpretation', prompt: 'What does the highlighted point mean?', scenario: 'A car travels at a steady speed.', target: { kind: 'arbitraryPoint', coordinates: [3, 45] }, quantities: { x: { id: 'time', name: 'Time', unit: 'hours' }, y: { id: 'distance', name: 'Distance', unit: 'kilometres' } } }, valid: { ':context-interpretation': [{ xQuantityId: 'time', xValue: '3', xUnit: 'hours', yQuantityId: 'distance', yValue: '45', yUnit: 'kilometres', openText: 'After 3 hours the car has gone 45 km.' }] } },
  { id: 'graph-story', module: '/src/GraphStory.jsx', question: { type: 'graphStory', prompt: 'Sketch a graph for a story.', requireSketch: true }, valid: { ':graph-story': [{ scenario: 'A walk.', independent: 'time', dependent: 'distance', xLabel: 'Time', xUnit: 'min', yLabel: 'Distance', yUnit: 'm', explanation: 'Steady.', strokes: [[{ x: 60, y: 300 }, { x: 120, y: 250 }, { x: 180, y: 200 }], [{ x: 200, y: 180 }]] }] } },
  { id: 'graph-comparison', module: '/src/GraphComparison.jsx', question: { type: 'graphComparison', prompt: 'Which pair of lines is perpendicular?', graphs: [{ id: 'a', label: 'A', graph: { ...LINE_GRAPH(2, 1), functions: [{ type: 'line', m: 2, b: 1 }, { type: 'line', m: -0.5, b: 1 }] } }, { id: 'b', label: 'B', graph: { ...LINE_GRAPH(2, 1), functions: [{ type: 'line', m: 2, b: 1 }, { type: 'line', m: 2, b: -3 }] } }], fields: [{ id: 'rel', label: 'Which pair is perpendicular?', type: 'choice', options: ['a', 'b'], answer: 'a' }, { id: 'why', label: 'Explain.', type: 'text' }] }, valid: { ':graph-comparison': [{ rel: 'a', why: 'Their slopes multiply to -1.' }] } },
  { id: 'graph-scenario-match', module: '/src/GraphScenarioMatch.jsx', question: { type: 'graphScenarioMatch', prompt: 'Match each scenario to its graph.', scenarios: [{ id: 's1', text: 'A car speeds up.' }, { id: 's2', text: 'A car stops.' }], graphs: [{ id: 'g1', graph: { ...LINE_GRAPH(1, 0), xMin: 0, yMin: 0 } }, { id: 'g2', graph: { ...LINE_GRAPH(0, 5), xMin: 0, yMin: 0 } }], correctMatches: { s1: 'g1', s2: 'g2' } }, valid: { ':graph-scenario-match': [{ s1: 'g1', s2: 'g2' }] } },
  { id: 'function-graph', module: '/src/FunctionGraphBuilder.jsx', question: { id: 'draft-graph', type: 'functionGraph', prompt: 'Graph y = 2x + 1, then give its domain.', functionSpec: { type: 'linear', m: 2, b: 1 }, pointTasks: [{ id: 'p1', label: 'Plot the point where x = 0', x: 0, expected: [0, 1] }, { id: 'p2', label: 'Plot the point where x = 2', x: 2, expected: [2, 5] }], analysisParts: [{ id: 'domain', kind: 'domain', notation: 'interval', acceptedAnswers: ['(-∞, ∞)', '(-inf, inf)'] }] }, valid: {
    // An older draft's end marker is its symbol alone; this build's, the symbol and where it was dropped.
    ':graph-construction': [{ placements: { p1: [0, 1], p2: [2, 5] }, chosenXValues: { p1: '0', p2: '2' }, pointsValidated: true, strokes: [[[120, 300], [180, 240], [240, 180]]], sketchView: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 }, snapped: true, markerPlacements: { 'endpoint-0-start': 'arrow', 'endpoint-1-end': { marker: 'arrow', point: [4, 9] } } }],
    ':graph-analysis': [{ selections: { domain: [[0, 1]] }, answers: { domain: '(-∞, ∞)' }, typedPoints: {}, noneSelections: { domain: false }, inversePointsValidated: false, inverseStrokes: [], inverseSketchView: null, inverseSnapped: false }],
    ':graph-stage': ['analysis'],
  } },
  // A square root's "Undefined 1" card placed with "Not Real / Undefined" (stored as the word), recorded in Chromium.
  { id: 'function-graph-square-root', module: '/src/FunctionGraphBuilder.jsx', question: { id: 'draft-graph-root', type: 'functionGraph', prompt: 'Graph y = √(x − 2).', functionSpec: { type: 'squareRoot', a: 1, h: 2, k: 0 } }, valid: {
    ':graph-construction': [
      { placements: { 'undefined-1': 'undefined' }, chosenXValues: { 'point-1': '3', 'point-2': '6', 'point-key': '2', 'point-4': '11', 'point-5': '18', 'undefined-1': '1' }, pointsValidated: false, strokes: [], sketchView: null, snapped: false, markerPlacements: {} },
      { placements: { 'point-key': [2, 0], 'point-1': [3, 1], 'undefined-1': 'undefined' }, chosenXValues: { 'point-1': '3', 'point-2': '6', 'point-key': '2', 'point-4': '11', 'point-5': '18', 'undefined-1': '1' }, pointsValidated: false, strokes: [], sketchView: null, snapped: false, markerPlacements: {} },
    ],
  } },
  { id: 'graph-analysis', module: '/src/GraphAnalysis.jsx', question: { id: 'draft-analysis', type: 'graphAnalysis', prompt: 'Give the domain and range of the graph.', graph: { xMin: -5, xMax: 7, yMin: -1, yMax: 8 }, functionSpec: { type: 'linear', m: -1, b: 5, domain: { min: -2, max: 5, minClosed: true, maxClosed: true } }, analysisParts: [{ id: 'domain', kind: 'domain', notation: 'interval', acceptedAnswers: ['[-2, 5]'] }, { id: 'range', kind: 'range', notation: 'interval', acceptedAnswers: ['[0, 7]'] }] } },
  { id: 'step-algebra', module: '/src/StepByStepAlgebra.jsx', question: { questionId: 'draft-step', type: 'stepAlgebra', prompt: 'Solve 2x + 5 = 19 and show each balanced step.', equation: '2*x + 5 = 19', variable: 'x', answer: '7', supportPresentation: { algebraAutoApply: true } }, valid: {
    // A committed step whose words hold mathematics ({ latex }), and an operation picked up from the tray (no side yet).
    ':step-algebra': [{ algebraDraftVersion: 2, equation: { left: '2*x', right: '14', variable: 'x', objective: { kind: 'isolate', variable: 'x', simplifyRequired: true, requireSimplifiedFinalForm: false, targetForm: null } }, supportLevel: 3, operand: '2', distributionState: null, structureTool: null, workSteps: [{ kind: 'step', description: 'Subtracted 5 from both sides', parts: ['Subtracted ', { latex: '5' }, ' from both sides'], before: { left: '2*x + 5', right: '19' }, after: { left: '2*x', right: '14' } }], armedTile: { operation: 'divide', sourceSide: null }, pendingMove: null, crossedSides: [], cancelledPairIds: {}, selectedCancellationIndices: {}, simplificationAnswers: {}, promptAnswers: {}, simplifyTool: null }],
  } },
  { id: 'relation', module: '/src/MultiRelationAlgebra.jsx', question: { questionId: 'draft-relation-symbol', type: 'stepAlgebra', prompt: 'Solve −2x + 3 > 7 and show each balanced step.', equation: '-2x + 3 > 7', variable: 'x' } },
  { id: 'linear-intercepts', module: '/src/LinearInterceptsOrchestrator.jsx', question: { questionId: 'draft-intercepts', type: 'stepAlgebra', mode: 'linearIntercepts', prompt: 'Find both intercepts.', standard: { A: 2, B: -4, C: 8 } } },
  { id: 'workflow', module: '/src/platform/workflow/WorkflowRunner.jsx', question: { id: 'draft-workflow', type: 'graphAnalysis', recipe: { name: 'functionCharacteristics', ask: ['domain', 'range', 'behavior'] }, prompt: 'Analyze the restricted linear graph.', graph: { xMin: -5, xMax: 7, yMin: -1, yMax: 8, xStep: 1, yStep: 1 }, functionSpec: { type: 'linear', m: -1, b: 5, domain: { min: -2, max: 5, minClosed: true, maxClosed: true } }, functionFamily: 'Linear', correctDomain: '-2 <= x <= 5', correctRange: '0 <= y <= 7', behavior: 'Decreasing everywhere' } },
  { id: 'workflow-rich', module: '/src/platform/workflow/WorkflowRunner.jsx', question: {
    type: 'relationshipModel',
    content: { scenario: 'A student group sells chocolate bars for $2 each.' },
    workflow: [
      { id: 'roles', kind: 'quantityRoles', prompt: 'Which quantity depends on the other?', quantities: CHOCOLATE_QUANTITIES },
      { id: 'equation', kind: 'equationInput', prompt: 'Write a function for the money raised.' },
      { id: 'table', kind: 'tableInput', xValues: [0, 1, 2, 3], source: { fromStage: 'equation' } },
      { id: 'axes', kind: 'axisSetup', prompt: 'Label the axes.', quantities: CHOCOLATE_QUANTITIES },
      { id: 'point', kind: 'pointInput', prompt: 'Give a point on the graph.' },
      { id: 'interpretation', kind: 'interpretation', prompt: 'What does your table show?' },
      { id: 'classification', kind: 'classification', choices: ['discrete', 'continuous'] },
    ],
    grading: { roles: { independent: 'bars', dependent: 'money' }, equation: 'f(x)=2x', table: { consistentWith: 'equation' }, axes: { xLabel: ['Bars sold'], yLabel: ['Money raised'], xUnit: ['bars'], yUnit: ['dollars'] }, point: '(1,2)', interpretation: { manual: true }, classification: 'discrete' },
  }, valid: { ':workflow-responses': [{
    roles: { independent: 'bars', dependent: 'money' },
    equation: 'f(x)=2x',
    table: { __mathmasterWorkflowArtifact: 'table', isComplete: true, cells: { '0:y': '0', '1:y': '2', '2:y': '4', '3:y': '6' }, xValues: [0, 1, 2, 3], points: [[0, 0], [1, 2], [2, 4], [3, 6]], sourceModel: 'f(x)=2x', sourceFunctionSpec: null, sourceChecked: 4, sourceConsistent: true },
    axes: { xLabel: 'Bars sold', xUnit: 'bars', yLabel: 'Money raised', yUnit: 'dollars', __mathmasterWorkflowArtifact: 'axes', isComplete: true },
    point: '(1,2)',
    interpretation: 'Each bar adds $2.',
    classification: 'discrete',
  }], ':workflow-stage': [3] } },
  { id: 'workflow-features', module: '/src/platform/workflow/WorkflowRunner.jsx', question: {
    type: 'graphAnalysis',
    recipe: { name: 'functionCharacteristics', ask: ['xInterceptExists', 'xIntercept', 'xInterceptValue', 'zeros', 'yInterceptExists', 'yIntercept', 'yInterceptValue', 'behavior', 'domain', 'range'] },
    prompt: 'Analyze the graph.',
    pairs: [[-2, 0], [0, 2], [2, 4]],
    graph: { xMin: -5, xMax: 5, yMin: -2, yMax: 8 },
    functionSpec: { type: 'linear', m: 1, b: 2 },
    behavior: 'Increasing everywhere',
    correctDomain: 'all real numbers',
    correctRange: 'all real numbers',
  }, valid: { ':workflow-responses': [{
    xInterceptExists: 'Yes',
    xIntercept: { __mathmasterWorkflowArtifact: 'feature-selection', feature: 'xIntercept', selections: [[-2, 0]], none: false, isComplete: true },
    xInterceptValue: '-2',
    zeros: '-2',
    yInterceptExists: 'Yes',
    yIntercept: { __mathmasterWorkflowArtifact: 'feature-selection', feature: 'yIntercept', selections: [[0, 2]], none: false, isComplete: true },
    yInterceptValue: '2',
  }] } },
  { id: 'guided-coach', module: '/src/GuidedClassworkCoach.jsx', question: { questionId: 'guided', prompt: 'Solve.', guidedNotes: { steps: [{ title: 'One', text: 'First.' }, { title: 'Two', text: 'Second.' }] } }, props: { enabled: true, mode: 'manual' }, valid: { ':guided-step': [1], ':guided-collapsed': [false] } },
  // The lab keeps its work in a tool scope (usePersistentToolState).
  { id: 'modeling-lab', module: '/src/components/labs/InteractiveModelingLabPlayer.jsx', kind: 'lab', question: { labId: 'lab-sweep', title: 'Growth', scenario: 'Explore growth.', parameters: [{ id: 'r', label: 'Rate', symbol: 'r', min: 1, max: 3, step: 1, defaultValue: 2 }, { id: 'k', label: 'Start', symbol: 'k', min: 0, max: 10, step: 1, defaultValue: 4 }], targets: [{ id: 't', prompt: 'Predict.' }] }, valid: { ':work:tool': [{ paramValues: { r: 3, k: 5 }, hypothesis: 'It doubles.', justification: 'Because the rate is 2.', trialHistory: [{ trialNumber: 1, recordedAt: 1700000000000, parameters: { r: 2, k: 4 } }, { trialNumber: 2, recordedAt: 1700000001000, parameters: { r: 3, k: 5 } }] }] } },
  // A secure field item's saved answer is its initial payload (the server's draft or this device's copy).
  { id: 'secure-field-item', module: '/src/components/question/RichQuestionRuntime.jsx', kind: 'secure', question: { questionInstanceId: 'secure-1', prompt: 'Solve 2x = 6.', responseFields: [{ id: 'answer', label: 'x', inputProfile: 'number' }, { id: 'choice', label: 'Which?', choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }], permittedTools: ['linearRegression'] }, valid: { payload: [{ responses: { answer: '3', choice: 'a' }, toolState: { linearRegression: { rows: [['1', '2'], ['2', '4'], ['3', '6'], ['4', '8'], ['5', '10'], ['6', '12']], ran: true } } }, { responses: { answer: '3' }, toolState: { linearRegression: { rows: [{ cells: ['1', '2'] }, { cells: ['2', '4'] }], ran: false } } }] } },
  // The questions whose drafts were recorded in Chromium (moduleDraftValidRecords.json):
  // the draft-persistence journey's own, and the cross-device journey's two.
  ...[
    ['literal-input', '/src/LiteralGrader.jsx'], ['multi-answer', '/src/MultiAnswerGrader.jsx'], ['table', '/src/TableGrader.jsx'],
    ['composed-workflow', '/src/platform/workflow/WorkflowRunner.jsx'], ['interactive-graph', '/src/FunctionGraphBuilder.jsx'],
    ['step-algebra', '/src/StepByStepAlgebra.jsx'], ['step-algebra-mid-move', '/src/StepByStepAlgebra.jsx'], ['relation-symbol-pending', '/src/MultiRelationAlgebra.jsx'],
  ].map(([id, module]) => ({ id: `journey:${id}`, module, question: DRAFT_SCENES.find((scene) => scene.id === id).question })),
  { id: 'cross-device-fraction', module: '/src/MultiAnswerGrader.jsx', question: { questionId: 'cross-device-c1', type: 'multiAnswer', prompt: 'Write 6/8 in lowest terms.', answerFields: [{ id: 'f', label: 'Fraction', answer: '3/4' }] } },
  { id: 'cross-device-line', module: '/src/MultiAnswerGrader.jsx', question: { questionId: 'cross-device-c2', type: 'multiAnswer', prompt: 'A line passes through (0, 4) and (3, 2).', answerFields: [{ id: 'm', label: 'Slope', answer: '-2/3' }, { id: 'b', label: 'y-intercept', answer: '4' }] } },
].map((scene) => Object.freeze(scene)));

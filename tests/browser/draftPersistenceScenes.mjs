/*
 * WHAT A STUDENT HAS TYPED, PLOTTED OR BUILT WHEN THEY WALK AWAY.
 *
 * One scene per family the brief certifies. Each is a REAL question of that
 * type — the harness mounts it through QuestionEngine exactly as App.jsx does —
 * plus `edit`, the actions a student takes on it before leaving.
 *
 * `edit` is deliberately expressed as data rather than as a function per scene:
 * the driver replays the same list before navigating away, after coming back,
 * after a reload and after a close/reopen, and a comparison is only meaningful
 * if the edit was identical each time.
 *
 * Shared by tests/browser/draftPersistenceMain.jsx (in the page) and
 * tests/browser/draftPersistence.mjs (the driver), so the two can never drift.
 */

const fill = (index, value) => ({ kind: 'fill', index, value });
const choose = (index, value) => ({ kind: 'choose', index, value });
const math = (index, value) => ({ kind: 'math', index, value });
const plane = (fx, fy) => ({ kind: 'plane', fx, fy });
const press = (label) => ({ kind: 'press', label });

export const DRAFT_SCENES = [
  {
    id: 'literal-input',
    label: 'Basic literal/input question',
    family: 'LiteralGrader',
    question: {
      questionId: 'draft-literal', type: 'literal',
      prompt: 'Solve A = lw for w.',
      formula: 'A = l*w', solveFor: 'w', acceptedAnswers: ['A/l'],
    },
    edit: [math(0, 'A/l')],
  },
  {
    id: 'multi-answer',
    label: 'multiAnswer',
    family: 'MultiAnswerGrader',
    question: {
      questionId: 'draft-multi', type: 'multiAnswer',
      prompt: 'Give the domain and the range of the relation.',
      answerFields: [
        { id: 'domain', label: 'Domain', answer: '[-4, 4]' },
        { id: 'range', label: 'Range', answer: '[0, 16]' },
      ],
    },
    edit: [math(0, '[-4,4]'), math(1, '[0,16]')],
  },
  {
    id: 'table',
    label: 'table',
    family: 'TableGrader',
    question: {
      questionId: 'draft-table', type: 'table',
      prompt: 'Complete the table for f(x) = 2x + 1.',
      table: {
        columns: [{ key: 'x', label: 'x' }, { key: 'y', label: 'f(x)' }],
        rows: [{ x: 0, y: null }, { x: 1, y: null }, { x: 2, y: null }],
        answers: { '0:y': 1, '1:y': 3, '2:y': 5 },
      },
    },
    edit: [fill(0, '1'), fill(1, '3'), fill(2, '5')],
  },
  {
    id: 'composed-workflow',
    label: 'Workflow/composed question',
    family: 'WorkflowRunner',
    question: {
      id: 'draft-workflow', type: 'graphAnalysis',
      recipe: { name: 'functionCharacteristics', ask: ['domain', 'range', 'behavior'] },
      prompt: 'Analyze the restricted linear graph.',
      graph: { xMin: -5, xMax: 7, yMin: -1, yMax: 8, xStep: 1, yStep: 1 },
      functionSpec: { type: 'linear', m: -1, b: 5, domain: { min: -2, max: 5, minClosed: true, maxClosed: true } },
      functionFamily: 'Linear',
      correctDomain: '-2 <= x <= 5',
      correctRange: '0 <= y <= 7',
      behavior: 'Decreasing everywhere',
    },
    edit: [math(0, '[-2,5]')],
  },
  {
    id: 'interactive-graph',
    label: 'Interactive graph workspace (mixed: points + typed answer)',
    family: 'InteractiveGraphWorkspace',
    mixed: true,
    question: {
      id: 'draft-graph', type: 'functionGraph',
      prompt: 'Graph y = 2x + 1, then give its domain.',
      functionSpec: { type: 'linear', m: 2, b: 1 },
      pointTasks: [
        { id: 'p1', label: 'Plot the point where x = 0', x: 0, expected: [0, 1] },
        { id: 'p2', label: 'Plot the point where x = 2', x: 2, expected: [2, 5] },
      ],
      analysisParts: [
        { id: 'domain', kind: 'domain', notation: 'interval', acceptedAnswers: ['(-∞, ∞)', '(-inf, inf)'] },
      ],
    },
    // A point task has to be picked up before the plane will take a point —
    // the same two gestures a student makes.
    edit: [press('Plot the point where x = 0'), plane(0.35, 0.45), press('Plot the point where x = 2'), plane(0.62, 0.3)],
  },
  {
    id: 'step-algebra',
    label: 'Step Algebra',
    family: 'StepByStepAlgebra',
    question: {
      questionId: 'draft-step', type: 'stepAlgebra',
      prompt: 'Solve 2x + 5 = 19 and show each balanced step.',
      equation: '2*x + 5 = 19', variable: 'x', answer: '7',
      supportPresentation: { algebraAutoApply: true },
    },
    // Pick up "subtract", then type what to subtract. Neither has become a
    // committed step, and both have to be there on the way back.
    edit: [press('−'), press('Show math tools'), math(0, '5')],
  },
  {
    id: 'function-operations',
    label: 'Function Operations Workbench',
    family: 'functionOperationsLab',
    question: {
      questionId: 'draft-function-operations', type: 'functionOperationsLab',
      prompt: 'Combine f and g.',
      f: { type: 'linear', m: 2, b: 3 },
      g: { type: 'linear', m: 1, b: -4 },
      operations: ['sum', 'difference', 'product', 'quotient'],
    },
    edit: [math(0, '3x-1'), math(1, 'x+7'), math(2, '2x^2-5x-12'), math(3, '(2x+3)/(x-4)'), fill(0, '4')],
  },
  {
    id: 'function-investigation',
    label: 'Function Investigation 2',
    family: 'functionInvestigation2',
    question: {
      id: 'draft-function-investigation', type: 'functionInvestigation2',
      prompt: 'Find every point where this graph crosses an axis.',
      mode: 'intercepts',
      function: { type: 'quadratic', a: 1, h: 2, k: -4 },
      graphBounds: { xMin: -7, xMax: 9, yMin: -9, yMax: 9 },
    },
    edit: [fill(0, '0, 4'), fill(1, '0')],
  },
  {
    id: 'graphing2',
    label: 'Graphing 2',
    family: 'graphing2',
    question: {
      id: 'draft-graphing2', type: 'graphing2',
      prompt: 'Graph y = 2x + 1 using two points.',
      mode: 'slopeIntercept', line: { m: 2, b: 1 },
      graphBounds: { xMin: -6, xMax: 6, yMin: -8, yMax: 10 },
      tolerance: 0.12,
    },
    edit: [plane(0.4, 0.5), plane(0.62, 0.34)],
  },
  {
    id: 'sequence-explorer',
    label: 'Sequence Explorer (fullBridge — mixed: table + plot + dropdown + rules)',
    family: 'sequenceExplorer',
    mixed: true,
    question: {
      questionId: 'draft-sequence', type: 'sequenceExplorer', mode: 'fullBridge',
      prompt: 'Complete the table, plot the terms, and write both sequence rules.',
      sequence: { kind: 'arithmetic', first: 3, difference: 2 },
      displayCount: 5, targetN: 8,
      studentActions: ['buildSequenceTable', 'plotSequence', 'analyzeSequence', 'writeExplicit', 'writeRecursive', 'findSequenceTerm'],
    },
    edit: [
      fill(0, '3'), fill(1, '5'), fill(2, '7'),
      plane(0.3, 0.6),
      choose(0, 'arithmetic'),
    ],
  },
  {
    id: 'systems-workspace',
    label: 'Systems Workspace',
    family: 'systemsWorkspace',
    question: {
      questionId: 'draft-systems', type: 'systemsWorkspace', mode: 'linear',
      prompt: 'Classify the system and give its solution.',
      system: { m1: 2, b1: 1, m2: -1, b2: 7 },
      graph: { xMin: -6, xMax: 8, yMin: -6, yMax: 12 },
    },
    edit: [fill(0, '2'), fill(1, '5')],
  },
  {
    id: 'transformations',
    label: 'Transformations Lab',
    family: 'transformationsLab',
    question: {
      id: 'draft-transformations', type: 'transformationsLab',
      prompt: 'Change a, h and k until your graph sits on the dashed target.',
      mode: 'match', family: 'quadratic',
      target: { a: 2, h: -1, k: 3 }, initial: { a: 1, h: 0, k: 0 },
      graphBounds: { xMin: -7, xMax: 7, yMin: -7, yMax: 9 },
    },
    edit: [fill(0, '2'), fill(1, '-1'), fill(2, '3')],
  },
  {
    id: 'interval-number-line',
    label: 'Number line and intervals (drag-rate workspace)',
    family: 'intervalNumberLine',
    // The one registry tool that writes at display rate: an endpoint follows
    // the finger. Certified here for the same navigate/reload/reopen journeys,
    // and measured separately for what those writes cost.
    question: {
      questionId: 'draft-interval', type: 'intervalNumberLine',
      prompt: 'Graph x ≥ 3 and write it in interval notation.',
      inequalityText: 'x ≥ 3',
      min: -5, max: 8, snapStep: 1,
      ask: ['graph', 'interval'],
      intervals: [{ min: 3, max: null, minClosed: true, maxClosed: false }],
    },
    edit: [plane(0.62, 0.5)],
  },
  {
    id: 'data-modeling',
    label: 'Data/modeling tool',
    family: 'dataModelingLab',
    question: {
      questionId: 'draft-data-modeling', type: 'dataModelingLab',
      prompt: 'Describe the association and predict.',
      mode: 'full',
      points: [[1, 2], [2, 4.2], [3, 5.8], [4, 8.1], [5, 9.9]],
    },
    edit: [choose(0, 'negative')],
  },
];

export const SCENE_IDS = DRAFT_SCENES.map((scene) => scene.id);

export const sceneById = (id) => DRAFT_SCENES.find((scene) => scene.id === id) || null;

export { fill, choose, math, plane, press };

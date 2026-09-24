/*
 * MATHMASTER INTERACTIVE CAPABILITY MANIFEST — WHAT A STUDENT MUST BE ABLE TO DO.
 *
 * Machine-readable, React-free, and the single list three gates read:
 *
 *   tests/platform/interactiveCapabilityCertification.test.mjs (every PR)
 *     compiles each fixture through the production V5 compiler and the runtime
 *     repair the player applies, asserts the route a student reaches lands on
 *     an engine that owns the capability, runs the capability's pure model on
 *     the fixture's mathematics, and checks the engine is wired to that model.
 *
 *   tests/browser/capabilityCertification.mjs (+ the older journey harnesses)
 *     mounts the same fixture in the real QuestionEngine and performs the
 *     student's actions in Chromium.
 *
 *   scripts/certify-interactive-capabilities.mjs
 *     runs the browser harnesses and prints the certification report.
 *
 * A component existing in the source tree does not pass. The capability passes
 * only when a question a teacher can author reaches it and a student can use it.
 *
 * Removing a capability from this list is a product decision, not a refactor:
 * the certification test also fails when a listed capability loses its browser
 * journey or its CI step.
 */

export const CERTIFICATION_SUBSYSTEMS = Object.freeze([
  'CORE STUDENT FLOW',
  'STEPALGEBRA',
  'SYSTEMS',
  'GRAPHING',
  'STATISTICS',
  'PERSISTENCE',
  'ASSESSMENTS',
  'TEACHER EXPERIENCE',
  'MOBILE/WORK VIEW',
]);

/*
 * THE QUESTIONS. Authoring JSON as a teacher (or the assignment AI) writes it;
 * `stored` fixtures are records as they already sit in Firestore, mounted raw
 * (`host: 'raw'`) the way non-player hosts hand them to QuestionEngine.
 */
export const INTERACTIVE_CAPABILITY_FIXTURES = Object.freeze([
  { id: 'distribute', authoring: { prompt: 'Solve 3(2x − 4) = 18.', studentActions: ['solveStepByStep'], equation: '3(2x - 4) = 18', solveFor: 'x' } },
  { id: 'combine-like-terms', authoring: { prompt: 'Solve 2x + 3x − 4 = 11.', studentActions: ['solveStepByStep'], equation: '2x + 3x - 4 = 11', solveFor: 'x' } },
  { id: 'exact-fraction', authoring: { prompt: 'Solve 9x = 20.', studentActions: ['solveStepByStep'], equation: '9x = 20', solveFor: 'x' } },
  { id: 'balanced-solve', authoring: { prompt: 'Solve 4x + 7 = 23.', studentActions: ['solveStepByStep'], equation: '4x + 7 = 23', solveFor: 'x' } },
  { id: 'inequality-reversal', standard: 'A.5B', authoring: { prompt: 'Solve −2x + 3 > 7.', studentActions: ['solveInequality'], inequality: '-2x + 3 > 7' } },
  { id: 'inequality-distribute', standard: 'A.5B', authoring: { prompt: 'Solve −3(x − 4) > 2x + 7.', studentActions: ['solveInequality'], inequality: '-3(x - 4) > 2x + 7' } },
  { id: 'inequality-like-terms', standard: 'A.5B', authoring: { prompt: 'Solve 2x + 3x − 4 ≤ 11.', studentActions: ['solveInequality'], inequality: '2x + 3x - 4 <= 11' } },
  { id: 'absolute-value-equation', standard: 'A2.6E', courseId: 'algebra2', authoring: { prompt: 'Solve |2x − 3| = 7.', studentActions: ['solveEquation'], equation: '|2x - 3| = 7', solveFor: 'x' } },
  { id: 'absolute-value-inequality', standard: 'A2.6F', courseId: 'algebra2', authoring: { prompt: 'Solve |x − 2| < 5.', studentActions: ['solveInequality'], inequality: '|x - 2| < 5' } },
  { id: 'xy-intercepts', standard: 'A.3C', authoring: { prompt: 'Find the x- and y-intercepts of 3x + 4y = 24.', studentActions: ['interactiveAlgebra'], mode: 'linearIntercepts', equation: '3x + 4y = 24' } },
  { id: 'slope-intercept', standard: 'A.2C', authoring: { prompt: 'Rewrite 5x + 2y = 6 in slope-intercept form.', studentActions: ['interactiveAlgebra'], mode: 'rewriteLinearForm', equation: '5x + 2y = 6' } },
  { id: 'factor-gcf', standard: 'A.10D', authoring: { prompt: 'Write y = 15x − 45 in factored form.', studentActions: ['interactiveAlgebra'], mode: 'rewriteLinearForm', targetForm: 'factoredLinear', equation: 'y = 15x - 45' } },
  { id: 'systems-substitution', standard: 'A.5C', authoring: { prompt: 'Solve the system by substitution.', studentActions: ['solveSystem'], mode: 'algebraic', equations: ['y = 2x - 1', '3x + 2y = 12'] } },
  { id: 'stored-legacy-intercepts', host: 'raw', stored: { type: 'stepAlgebra2', toolId: 'stepAlgebra2', mode: 'linearIntercepts', standard: { A: 3, B: 4, C: 24 }, prompt: 'Find both intercepts of 3x + 4y = 24.' } },
  { id: 'stored-factorless-sign-analyzer', host: 'raw', stored: { type: 'signSolutionAnalyzer', mode: 'polynomial', prompt: 'Solve −2x + 3 > 7.' } },
]);

/*
 * THE CAPABILITIES. `requires` names an engine capability from
 * src/platform/algebra/algebraWorkspaceRoute.js; `wiring` anchors the engine
 * to the module that does the work; `browser` names the journey that performs
 * it in Chromium and the harness file that owns the journey.
 */
export const INTERACTIVE_CAPABILITIES = Object.freeze([
  {
    id: 'distribution',
    label: 'Distribution',
    subsystem: 'STEPALGEBRA',
    fixture: 'distribute',
    expectedRoute: 'stepAlgebra',
    requires: 'distribution',
    wiring: [
      { file: 'src/StepByStepAlgebraCore.jsx', pattern: /from '\.\/algebraDistributionModel(\.js)?'/ },
      { file: 'src/StepByStepAlgebraCore.jsx', pattern: /algebra-inline-factor-token/ },
    ],
    browser: { harness: 'tests/browser/capabilityCertification.mjs', journey: 'distribution' },
  },
  {
    id: 'combine-like-terms',
    label: 'Combine Like Terms',
    subsystem: 'STEPALGEBRA',
    fixture: 'combine-like-terms',
    expectedRoute: 'stepAlgebra',
    requires: 'combineLikeTerms',
    wiring: [
      { file: 'src/StepByStepAlgebraCore.jsx', pattern: /from '\.\/algebraLikeTermsModel(\.js)?'/ },
      { file: 'src/StepByStepAlgebraCore.jsx', pattern: /Enter the single term these selected terms combine to/ },
    ],
    browser: { harness: 'tests/browser/capabilityCertification.mjs', journey: 'combine-like-terms' },
  },
  {
    id: 'exact-fractions',
    label: 'Exact Fractions',
    subsystem: 'STEPALGEBRA',
    fixture: 'exact-fraction',
    expectedRoute: 'stepAlgebra',
    requires: 'exactFractions',
    wiring: [
      { file: 'src/algebraFractionReductionModel.js', pattern: /from '\.\/algebraExactRational(\.js)?'/ },
    ],
    browser: { harness: 'tests/browser/capabilityCertification.mjs', journey: 'exact-fractions' },
  },
  {
    id: 'undo',
    label: 'Undo',
    subsystem: 'STEPALGEBRA',
    fixture: 'balanced-solve',
    expectedRoute: 'stepAlgebra',
    requires: 'undo',
    wiring: [
      { file: 'src/StepByStepAlgebraCore.jsx', pattern: /onUndoStateChange/ },
    ],
    browser: { harness: 'tests/browser/capabilityCertification.mjs', journey: 'undo' },
  },
  {
    id: 'factoring',
    label: 'Factoring',
    subsystem: 'STEPALGEBRA',
    fixture: 'factor-gcf',
    expectedRoute: 'stepAlgebra2.rewriteLinearForm',
    requires: 'factoring',
    wiring: [
      { file: 'src/tools/stepAlgebra2/RewriteLinearForm.jsx', pattern: /<StepByStepAlgebraCore/ },
      { file: 'src/StepAlgebraStructureTools.jsx', pattern: /Factor to primes/ },
    ],
    browser: { harness: 'tests/browser/stepAlgebraStructureTools.mjs', journey: 'factored-15x-45' },
  },
  {
    id: 'slope-intercept',
    label: 'Slope-Intercept Conversion',
    subsystem: 'STEPALGEBRA',
    fixture: 'slope-intercept',
    expectedRoute: 'stepAlgebra',
    requires: 'slopeInterceptConversion',
    wiring: [
      { file: 'src/StepAlgebraStructureTools.jsx', pattern: /Split fraction/ },
      { file: 'src/StepAlgebraStructureTools.jsx', pattern: /Cancel factors/ },
    ],
    browser: { harness: 'tests/browser/stepAlgebraStructureTools.mjs', journey: 'slope-5x-2y-6' },
  },
  {
    id: 'inequality-sign-reversal',
    label: 'Inequality Sign Reversal',
    subsystem: 'STEPALGEBRA',
    fixture: 'inequality-reversal',
    expectedRoute: 'relation',
    requires: 'inequalitySignReversal',
    wiring: [
      { file: 'src/MultiRelationAlgebraCore.jsx', pattern: /setPendingRelationFlip\(/ },
    ],
    browser: { harness: 'tests/browser/capabilityCertification.mjs', journey: 'inequality-sign-reversal' },
  },
  {
    id: 'inequality-distribution',
    label: 'Distribution in Inequalities',
    subsystem: 'STEPALGEBRA',
    fixture: 'inequality-distribute',
    expectedRoute: 'relation',
    requires: 'distribution',
    wiring: [
      { file: 'src/MultiRelationAlgebraCore.jsx', pattern: /<RelationDistributionPanel/ },
      { file: 'src/RelationStructureTools.jsx', pattern: /from '\.\/algebraDistributionModel\.js'/ },
    ],
    browser: { harness: 'tests/browser/capabilityCertification.mjs', journey: 'inequality-distribution' },
  },
  {
    id: 'inequality-like-terms',
    label: 'Combine Like Terms in Inequalities',
    subsystem: 'STEPALGEBRA',
    fixture: 'inequality-like-terms',
    expectedRoute: 'relation',
    requires: 'combineLikeTerms',
    wiring: [
      { file: 'src/MultiRelationAlgebraCore.jsx', pattern: /<RelationLikeTermsPanel/ },
      { file: 'src/algebraRelationStructureModel.js', pattern: /from '\.\/algebraLikeTermsModel\.js'/ },
    ],
    browser: { harness: 'tests/browser/capabilityCertification.mjs', journey: 'inequality-like-terms' },
  },
  {
    id: 'absolute-value',
    label: 'Absolute Value',
    subsystem: 'STEPALGEBRA',
    fixture: 'absolute-value-equation',
    expectedRoute: 'relation',
    requires: 'absoluteValueBranching',
    wiring: [
      { file: 'src/MultiRelationAlgebraCore.jsx', pattern: /buildStudentAuthoredAbsoluteValueSplit\(/ },
    ],
    browser: { harness: 'tests/browser/capabilityCertification.mjs', journey: 'absolute-value' },
  },
  {
    id: 'absolute-value-inequality',
    label: 'Absolute Value Inequality',
    subsystem: 'STEPALGEBRA',
    fixture: 'absolute-value-inequality',
    expectedRoute: 'relation',
    requires: 'absoluteValueBranching',
    wiring: [
      { file: 'src/MultiRelationAlgebraCore.jsx', pattern: /absoluteValueSplitInputModel\(/ },
    ],
    browser: { harness: 'tests/browser/capabilityCertification.mjs', journey: 'absolute-value-inequality' },
  },
  {
    id: 'xy-intercepts',
    label: 'X/Y Intercepts',
    subsystem: 'STEPALGEBRA',
    fixture: 'xy-intercepts',
    expectedRoute: 'linearIntercepts',
    requires: 'interceptZeroSubstitution',
    wiring: [
      { file: 'src/LinearInterceptsOrchestrator.jsx', pattern: /<StepByStepAlgebraCore/ },
    ],
    browser: { harness: 'tests/browser/capabilityCertification.mjs', journey: 'xy-intercepts' },
  },
  {
    id: 'substitution',
    label: 'Substitution',
    subsystem: 'SYSTEMS',
    fixture: 'systems-substitution',
    expectedRoute: 'systemsWorkspace',
    requires: 'substitution',
    wiring: [
      { file: 'src/tools/systemsWorkspace/AlgebraicSystemMode.jsx', pattern: /function SubstitutionToken\(/ },
    ],
    browser: { harness: 'tests/browser/algebraicSubstitutionHandoff.mjs', journey: 'student-fresh' },
  },
  {
    id: 'elimination',
    label: 'Elimination',
    subsystem: 'SYSTEMS',
    fixture: 'systems-substitution',
    expectedRoute: 'systemsWorkspace',
    requires: 'elimination',
    wiring: [
      { file: 'src/tools/systemsWorkspace/AlgebraicSystemMode.jsx', pattern: /applyEquationMultiplier\(/ },
      { file: 'src/tools/systemsWorkspace/AlgebraicSystemMode.jsx', pattern: /eliminatesVariable\(/ },
    ],
    browser: { harness: 'tests/browser/algebraicSubstitutionHandoff.mjs', journey: 'preview-elimination-direct' },
  },
  {
    id: 'three-variable-substitution',
    label: '3×3 Substitution',
    subsystem: 'SYSTEMS',
    fixture: 'systems-substitution',
    expectedRoute: 'systemsWorkspace',
    requires: 'threeVariableSubstitution',
    wiring: [
      { file: 'src/tools/systemsWorkspace/SystemsWorkspace.jsx', pattern: /<SubstitutionReductionMode/ },
    ],
    browser: { harness: 'tests/browser/algebraicSystems3x3.mjs', journey: 'student-3x3' },
  },
  {
    id: 'work-persistence',
    label: 'Work Persistence',
    subsystem: 'PERSISTENCE',
    fixture: 'balanced-solve',
    expectedRoute: 'stepAlgebra',
    requires: 'draftPersistence',
    wiring: [
      { file: 'src/StepByStepAlgebraCore.jsx', pattern: /writeQuestionDraft|useLocalDraftState|readQuestionDraft/ },
    ],
    browser: { harness: 'tests/browser/capabilityCertification.mjs', journey: 'work-persistence' },
  },
  {
    id: 'relation-persistence',
    label: 'Inequality Work Persistence',
    subsystem: 'PERSISTENCE',
    fixture: 'inequality-reversal',
    expectedRoute: 'relation',
    requires: 'draftPersistence',
    wiring: [
      { file: 'src/MultiRelationAlgebraCore.jsx', pattern: /writeQuestionDraft\(draftKeyFor\(draftKey\)/ },
    ],
    browser: { harness: 'tests/browser/capabilityCertification.mjs', journey: 'relation-persistence' },
  },
  {
    id: 'draft-recovery',
    label: 'Malformed Draft Recovery',
    subsystem: 'PERSISTENCE',
    fixture: 'inequality-reversal',
    expectedRoute: 'relation',
    requires: 'draftPersistence',
    wiring: [
      { file: 'src/MultiRelationAlgebraCore.jsx', pattern: /const relationState = restorableRelationState\(saved\.relationState\)/ },
    ],
    browser: { harness: 'tests/browser/capabilityCertification.mjs', journey: 'draft-recovery' },
  },
  {
    id: 'work-view',
    label: 'Work View',
    subsystem: 'MOBILE/WORK VIEW',
    fixture: 'balanced-solve',
    expectedRoute: 'stepAlgebra',
    requires: 'balancedOperations',
    wiring: [
      { file: 'src/StepByStepAlgebra.jsx', pattern: /<EnlargeableFigure/ },
    ],
    browser: { harness: 'tests/browser/capabilityCertification.mjs', journey: 'work-view' },
  },
  {
    id: 'history-notation',
    label: 'Classroom History Notation',
    subsystem: 'STEPALGEBRA',
    fixture: 'inequality-reversal',
    expectedRoute: 'relation',
    requires: 'classroomRelationHistory',
    wiring: [
      { file: 'src/MultiRelationAlgebra.jsx', pattern: /<MathDisplay value=\{relation\} format="latex"/ },
    ],
    browser: { harness: 'tests/browser/capabilityCertification.mjs', journey: 'history-notation' },
  },
  {
    id: 'host-parity',
    label: 'Same Engine In Every Host',
    subsystem: 'TEACHER EXPERIENCE',
    fixture: 'stored-legacy-intercepts',
    expectedRoute: 'linearIntercepts',
    requires: 'interceptZeroSubstitution',
    wiring: [
      { file: 'src/QuestionEngine.jsx', pattern: /prepareQuestionForRuntimeRouting\(stableQuestion/ },
    ],
    browser: { harness: 'tests/browser/capabilityCertification.mjs', journey: 'host-parity' },
  },
  {
    id: 'prompt-tool-match',
    label: 'Prompt Matches Tool',
    subsystem: 'CORE STUDENT FLOW',
    fixture: 'stored-factorless-sign-analyzer',
    expectedRoute: 'relation',
    requires: 'inequalitySignReversal',
    wiring: [
      { file: 'src/platform/assignments/assignmentRuntimeRepair.js', pattern: /openSignAnalyzerWithoutFactors\(repaired\)/ },
    ],
    browser: { harness: 'tests/browser/capabilityCertification.mjs', journey: 'prompt-tool-match' },
  },
]);

/*
 * THE BROWSER SUITES AND THEIR TIERS (Job 7).
 *
 *   pr       node gates only — every capability's route, wiring and model
 *            (tests/platform/interactiveCapabilityCertification.test.mjs runs
 *            inside the full platform suite on every PR). Seconds.
 *   merge    + the interactive algebra journeys in Chromium. Every PR that
 *            touches runtime code; about ten minutes.
 *   release  + persistence, assessment, statistics and Work View suites that
 *            already exist. Before a production deploy and nightly.
 *
 * `server: true` suites need the Vite harness on AUDIT_ORIGIN; the others
 * start their own. `results` names a JSON file with per-journey outcomes when
 * the suite writes one; otherwise the suite passes or fails as a whole.
 */
export const CERTIFICATION_SUITES = Object.freeze([
  {
    id: 'interactive-capabilities',
    label: 'Interactive capability journeys',
    tier: 'merge',
    server: true,
    command: ['node', 'tests/browser/capabilityCertification.mjs'],
    results: 'tests/browser/artifacts/capabilityCertification/results.json',
    artifacts: 'tests/browser/artifacts/capabilityCertification',
  },
  {
    id: 'structure-tools',
    label: 'Factoring, fraction splitting and slope-intercept',
    tier: 'merge',
    server: true,
    command: ['node', 'tests/browser/stepAlgebraStructureTools.mjs'],
    artifacts: 'tests/browser/artifacts/stepAlgebraStructureTools',
  },
  {
    id: 'systems-substitution',
    label: 'Systems substitution, distribution and elimination',
    tier: 'merge',
    server: true,
    command: ['node', 'tests/browser/algebraicSubstitutionHandoff.mjs'],
    artifacts: 'tests/browser/artifacts/algebraicSubstitutionHandoff',
  },
  {
    id: 'systems-3x3',
    label: '3×3 substitution and no staged previews',
    tier: 'merge',
    server: true,
    command: ['node', 'tests/browser/algebraicSystems3x3.mjs'],
    artifacts: 'tests/browser/artifacts/algebraicSystems3x3',
  },
  {
    id: 'draft-persistence',
    label: 'Unfinished work survives navigation, reload and reopen',
    subsystem: 'PERSISTENCE',
    tier: 'release',
    server: false,
    command: ['node', 'scripts/run-draft-persistence-certification.mjs'],
  },
  {
    id: 'durable-outbox',
    label: 'Queued actions survive a reload (IndexedDB)',
    subsystem: 'PERSISTENCE',
    tier: 'release',
    server: true,
    command: ['node', 'tests/browser/durableOutboxRecovery.mjs'],
  },
  {
    id: 'test-cycle-device',
    label: 'Test Cycle on Chromebook and phone',
    subsystem: 'ASSESSMENTS',
    tier: 'release',
    server: false,
    command: ['node', 'scripts/run-test-cycle-device-certification.mjs'],
  },
  {
    id: 'regression-calculator-phone',
    label: 'Regression calculator at 390px',
    subsystem: 'STATISTICS',
    tier: 'release',
    server: true,
    command: ['node', 'tests/browser/regressionCalculatorPhone.mjs'],
  },
  {
    id: 'work-view-certification',
    label: 'Work View opens, keeps the task, and closes cleanly',
    subsystem: 'MOBILE/WORK VIEW',
    tier: 'release',
    server: true,
    command: ['node', 'tests/browser/workViewCertification.mjs'],
  },
  {
    id: 'work-view-graph-matrix',
    label: 'Graphing tools in Work View',
    subsystem: 'GRAPHING',
    tier: 'release',
    server: true,
    command: ['node', 'tests/browser/workViewMatrix.mjs'],
  },
]);

export const CERTIFICATION_TIERS = Object.freeze(['pr', 'merge', 'release']);

export const suitesForTier = (tier) => {
  const rank = CERTIFICATION_TIERS.indexOf(tier);
  return CERTIFICATION_SUITES.filter((suite) => CERTIFICATION_TIERS.indexOf(suite.tier) <= rank);
};

export const capabilityFixture = (capability) => (
  INTERACTIVE_CAPABILITY_FIXTURES.find((fixture) => fixture.id === capability?.fixture) || null
);

export default INTERACTIVE_CAPABILITIES;

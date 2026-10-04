/*
 * WHERE BUILT-IN (NO-AI) HONORS CANNOT GO YET — AND EXACTLY WHY.
 *
 * The audit behind the deterministic-Honors coverage report
 * (honorsRecipeCoverage.js, docs/honors/DETERMINISTIC_HONORS_COVERAGE.md).
 * READY is never written here: it is computed from the recipe registry. This
 * file holds every other verdict, one per registered Question Family and
 * course, plus the classroom concepts that have no registered family at all:
 *
 *   CAPABLE          the family and its tool could carry a genuine Honors task
 *                    today; the recipe has not been written
 *   BLOCKED          they cannot, and `missingCapability` names the knob,
 *                    answer form or family that would let them
 *   NOT APPROPRIATE  built-in Honors for this family in this course would
 *                    mislead (the content belongs to the other course)
 *
 * Every verdict was reached by reading the family's own parameters, rules and
 * tools (functions/shared/questionFamilies*.mjs) and the grading manifest
 * (functions/shared/serverGrading/gradingManifest.mjs). "Larger numbers" is
 * never counted as rigor: a family whose only remaining lever is wider ranges
 * is BLOCKED, not CAPABLE.
 *
 * `teacherReason` is the sentence a teacher reads when no extension is
 * available (honorsExtensionRecipes.js). `missingCapability` is written for
 * the Question Family capability work that would unblock the concept.
 *
 * Pure data. No imports, so the recipe module can read it without a cycle.
 */

export const HONORS_COVERAGE_STATUS = Object.freeze({
  READY: 'READY',
  CAPABLE: 'CAPABLE',
  BLOCKED: 'BLOCKED',
  NOT_APPROPRIATE: 'NOT APPROPRIATE',
});

const { BLOCKED, NOT_APPROPRIATE } = HONORS_COVERAGE_STATUS;

const ALGEBRA_I_ONLY = (concept) => ({
  status: NOT_APPROPRIATE,
  reason: `${concept} is Algebra I content. A built-in Algebra II Honors extension anchored on it would teach Algebra I mathematics under an Algebra II label, so an Algebra II lesson that reviews it is given none.`,
  teacherReason: `${concept} is Algebra I content, so MathMaster does not build an Algebra II Honors extension on it.`,
});

/**
 * The verdict for every registered family that is not READY, by course.
 * A family id missing here for a course must be READY in the registry; the
 * coverage tests fail otherwise.
 */
export const HONORS_FAMILY_AUDIT = Object.freeze({
  'linear.twoStepEquation': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'The family draws a·x + b = c with an integer solution and nothing else. Its only levers are wider number ranges, and the deeper equation work an Honors extension needs (variable terms that cancel, rational coefficients, a coefficient found from a stated solution) is refused or absent in both linear equation families.',
      missingCapability: 'linear.multiStepEquation: a `solutionCase` knob (one | none | infinite | mixed) — its rule a = c → no_solution refuses these instances today — with an answer key for "No solution" / "All real numbers" that gradeStepAlgebraFinalAnswer can mark (the Step Algebra workspace grader already recognises both outcomes). Or linear.twoStepEquation: `coefficientForm: "fraction"` (rational a and b with an integer solution) or a reverse mode that asks for the coefficient giving a stated solution.',
      teacherReason: 'MathMaster\'s equation generators only make equations with one whole-number solution, so they cannot yet ask the no-solution, infinitely-many-solutions or rational-coefficient cases an Honors extension needs.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Solving a two-step linear equation')),
  }),
  'linear.multiStepEquation': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'Every instance has exactly one integer solution: the rule a = c → no_solution refuses each equation whose variable terms cancel, so the family cannot ask students to distinguish one, no and infinitely many solutions. Its remaining knobs only widen number ranges.',
      missingCapability: 'A `solutionCase` knob (one | none | infinite | mixed) with a special-outcome answer key that gradeStepAlgebraFinalAnswer accepts ("No solution" / "All real numbers"; the workspace grader already marks both), and optionally `distribute: true` (a(x + b) on one side, the distributive-property case of A.5A).',
      teacherReason: 'MathMaster\'s equation generator only makes equations with exactly one whole-number solution, so it cannot yet ask the no-solution and infinitely-many-solutions cases an Honors extension needs.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Solving a linear equation with the variable on both sides')),
  }),
  'linear.slopeFromPoints': Object.freeze({
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Slope from two points')),
  }),
  'functions.identifyIntercepts': Object.freeze({
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Intercepts of a line')),
  }),
  'linear.multipleRepresentations': Object.freeze({
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Multiple representations of a linear relationship')),
  }),
  'linear.representationSort': Object.freeze({
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Sorting the representations of two lines')),
  }),
  'systems.elimination': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'Every instance is a one-solution system with an integer intersection (det = 0 is refused as coincident), answered as a single ordered pair. requireMatchingCoefficient is already false by default, so the only lever left is larger numbers.',
      missingCapability: 'A Question Family for systemsWorkspace mode "algebraic" 2×2 systems with a `solutionCase` knob (one | none | infinite | mixed). The workspace and its server grader (systemsWorkspace/algebraic: elimination, substitution and special-case outcomes) already exist; only the generator is missing. Optionally `solutionForm: "fraction"` for non-integer intersections.',
      teacherReason: 'MathMaster\'s systems generator only makes systems with exactly one whole-number solution, answered as one ordered pair, so it cannot yet ask the no-solution and infinitely-many-solutions cases an Honors extension needs.',
    }),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Algebra II systems (A2.3A–B) are systems of three linear equations in three variables; a two-variable elimination drill has no Algebra II Honors depth.',
      missingCapability: 'A Question Family that generates 3×3 systems for systemsWorkspace (mode "algebraic" 3×3, "matrix3" or "spatial"). Those modes and their server graders exist, and MathMaster\'s Algebra II Honors 3×3 lessons already use them as hand-authored questions.',
      teacherReason: 'MathMaster has no generator for three-variable systems yet, so it cannot build a no-AI Algebra II Honors extension for systems.',
    }),
  }),
  'systems.substitution': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'Every instance is a one-solution system with an integer intersection (det = 0 is refused as coincident), answered as a single ordered pair; its knobs only widen ranges.',
      missingCapability: 'The same systemsWorkspace "algebraic" 2×2 family with a `solutionCase` knob (one | none | infinite | mixed) described for systems.elimination; substitution is one of that workspace\'s graded methods.',
      teacherReason: 'MathMaster\'s systems generator only makes systems with exactly one whole-number solution, answered as one ordered pair, so it cannot yet ask the no-solution and infinitely-many-solutions cases an Honors extension needs.',
    }),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Algebra II substitution is used on linear-quadratic systems (A2.3C–D), which no registered family generates.',
      missingCapability: 'A Question Family for systemsWorkspace mode "linearQuadratic" (the mode and its server grader exist), with a knob for the number of intersections (0, 1 or 2).',
      teacherReason: 'MathMaster has no generator for linear-quadratic systems yet, so it cannot build a no-AI Algebra II Honors extension for systems by substitution.',
    }),
  }),
  'quadratics.identifyVertex': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'The vertex is always an integer point read from standard or vertex form, answered as one ordered pair; the deeper forms of the question cannot be generated.',
      missingCapability: '`vertexForm: "half"` (h = p/2, so −b/2a is a genuine fraction), `form: "factored"` (the vertex found from the zeros), and a multi-field answer (vertex, axis of symmetry, maximum or minimum value, range) on quadratics.identifyVertex.',
      teacherReason: 'MathMaster\'s vertex generator only makes whole-number vertices read from a single equation, so it cannot yet ask the fractional-vertex or vertex-from-zeros work an Honors extension needs.',
    }),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Algebra II vertex work (A2.4B, A2.4D) rewrites ax² + bx + c in vertex form or writes a parabola from its focus and directrix; this family only asks for the vertex point.',
      missingCapability: 'A `form: "completeTheSquare"` mode answered with the vertex-form equation, or a Question Family for parabolaGeometryLab (modes features, equidistance, fromGeometry, equation — the lab and its server grader exist).',
      teacherReason: 'MathMaster has no generator for completing the square or for parabolas from their geometry yet, so it cannot build a no-AI Algebra II Honors extension for vertex work.',
    }),
  }),
  'functions.identifyZeros': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'Zeros are always two distinct integers of a quadratic with leading coefficient ±1 or ±2, entered as two numbers; "small" leading coefficients only add a common factor of 2.',
      missingCapability: '`zeroForm: "rational"` (zeros p/q from a non-unit leading coefficient, factored as (ax + p)(x + q)) and `zeroForm: "irrational"` (quadratic formula) with fraction and radical answer fields; or a Question Family for polynomialWorkshop mode "factorQuadratic" (the workshop and its server grader exist).',
      teacherReason: 'MathMaster\'s zeros generator only makes whole-number zeros, so it cannot yet ask the rational or irrational zeros an Honors extension needs.',
    }),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Algebra II solves quadratics with irrational and complex solutions (A2.4F, A2.7A); this family only produces two integer zeros.',
      missingCapability: '`zeroForm: "irrational" | "complex"` with radical and complex answer fields, or a Question Family for complexPlaneLab mode "quadraticRoots" (the lab and its server grader exist).',
      teacherReason: 'MathMaster\'s zeros generator only makes whole-number zeros, so it cannot yet ask the irrational or complex solutions an Algebra II Honors extension needs.',
    }),
  }),
  'absoluteValue.solveEquation': Object.freeze({
    algebra1: Object.freeze({
      status: NOT_APPROPRIATE,
      reason: 'Absolute value equations are Algebra II (A2.6E); Texas Algebra I does not teach them. An Algebra I-labelled lesson aligned to A2.6E is the course/TEKS conflict selection already refuses.',
      teacherReason: 'Absolute value equations are Algebra II content, so MathMaster does not build an Algebra I Honors extension on them.',
    }),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every instance has exactly two integer solutions h ± d, entered as two numbers. The depth Honors needs — an equation with no solution or one solution, an extraneous root, or the inequality |x − h| ≤ c (A2.6F) — cannot be generated.',
      missingCapability: 'A `solutionCase` knob (two | one | none | mixed) with a "No solution" answer the multiAnswer key can state, and an `inequality` knob (<, ≤, >, ≥) answered on intervalNumberLine (the number-line tool and its server grader exist).',
      teacherReason: 'MathMaster\'s absolute value generator only makes equations with two whole-number solutions, so it cannot yet ask the no-solution, one-solution or inequality cases an Honors extension needs.',
    }),
  }),
});

/**
 * Classroom concepts with NO registered Question Family. Each is BLOCKED by
 * the missing family alone: the rich tool and its server grader already exist
 * (`tools` names each tool and mode; the coverage tests check every one is in
 * the grading manifest and marked by the server).
 */
export const HONORS_CONCEPT_BACKLOG = Object.freeze([
  { courseId: 'algebra1', concept: 'Literal equations', teks: ['A.12E'], tools: [{ surface: 'literalWorkspace' }], missingCapability: 'A Question Family for literal equations (solve a formula for a named variable) on the literal workspace.' },
  { courseId: 'algebra1', concept: 'Linear inequalities', teks: ['A.5B'], tools: [{ surface: 'intervalNumberLine', mode: 'numberLine' }], missingCapability: 'A Question Family for one-variable linear inequalities, answered on intervalNumberLine (including reversing the inequality for a negative coefficient).' },
  { courseId: 'algebra1', concept: 'Systems of linear inequalities', teks: ['A.3H'], tools: [{ surface: 'systemsWorkspace', mode: 'inequalities' }], missingCapability: 'A Question Family for systemsWorkspace mode "inequalities".' },
  { courseId: 'algebra1', concept: 'Domain and range of functions', teks: ['A.2A', 'A.12A'], tools: [{ surface: 'functionInvestigation2', mode: 'domainRange' }, { surface: 'relationMapping', mode: 'default' }], missingCapability: 'A Question Family for functionInvestigation2 mode "domainRange" (or relationMapping).' },
  { courseId: 'algebra1', concept: 'Key features of graphs', teks: ['A.3C', 'A.7A'], tools: [{ surface: 'functionInvestigation2', mode: 'features' }, { surface: 'graphing2', mode: 'slopeIntercept' }], missingCapability: 'A Question Family for functionInvestigation2 mode "features". (graphFeatureFamilies.mjs generates the Graph Feature Rush game, not assignment questions.)' },
  { courseId: 'algebra1', concept: 'Correlation and linear regression', teks: ['A.4A', 'A.4B', 'A.4C'], tools: [{ surface: 'dataModelingLab', mode: 'correlation' }, { surface: 'dataModelingLab', mode: 'linearFitPrediction' }, { surface: 'regressionCalculator', mode: 'data' }], missingCapability: 'A Question Family that generates data sets for dataModelingLab (correlation, linear fit and prediction).' },
  { courseId: 'algebra1', concept: 'Arithmetic and geometric sequences', teks: ['A.12C', 'A.12D'], tools: [{ surface: 'sequenceExplorer', mode: 'ruleBridge' }, { surface: 'sequenceExplorer', mode: 'missingTerm' }], missingCapability: 'A Question Family for sequenceExplorer (rule bridge and missing terms).' },
  { courseId: 'algebra2', concept: 'Function transformations', teks: ['A2.4C', 'A2.6A', 'A2.6C'], tools: [{ surface: 'transformationsLab', mode: 'identify' }, { surface: 'transformationsLab', mode: 'plotTransform' }], missingCapability: 'A Question Family for transformationsLab.' },
  { courseId: 'algebra2', concept: 'Function operations', teks: ['A2.7B'], tools: [{ surface: 'functionOperationsLab', mode: 'functionOperations' }], missingCapability: 'A Question Family for functionOperationsLab.' },
  { courseId: 'algebra2', concept: 'Inverses and composition', teks: ['A2.2A', 'A2.2B', 'A2.2C', 'A2.2D'], tools: [{ surface: 'inverseCompositionLab', mode: 'deriveInverse' }, { surface: 'inverseCompositionLab', mode: 'composition' }], missingCapability: 'A Question Family for inverseCompositionLab (derive an inverse, verify by composition, restrict a domain).' },
  { courseId: 'algebra2', concept: 'Sequences and series', teks: [], note: 'Texas places sequences in Algebra I (A.12C–D); an Algebra II course that extends them to series uses the same tool.', tools: [{ surface: 'sequenceExplorer', mode: 'partialSum' }, { surface: 'sequenceExplorer', mode: 'fullBridge' }], missingCapability: 'A Question Family for sequenceExplorer (full bridge and partial sums).' },
  { courseId: 'algebra2', concept: 'Exponential and logarithmic functions', teks: ['A2.5A', 'A2.5B', 'A2.5C', 'A2.5D', 'A2.5E'], tools: [{ surface: 'exponentialLogBridge', mode: 'solveExponential' }, { surface: 'exponentialLogBridge', mode: 'solveLogarithmic' }, { surface: 'exponentialLogBridge', mode: 'inverse' }], missingCapability: 'A Question Family for exponentialLogBridge (equivalent forms, exponential and logarithmic equations, inverses).' },
  { courseId: 'algebra2', concept: 'Polynomials', teks: ['A2.7B', 'A2.7C', 'A2.7D', 'A2.7E'], tools: [{ surface: 'polynomialWorkshop', mode: 'factorZero' }, { surface: 'polynomialWorkshop', mode: 'division' }], missingCapability: 'A Question Family for polynomialWorkshop (factor-and-zero, division, graph connection).' },
  { courseId: 'algebra2', concept: 'Rational functions and equations', teks: ['A2.6G', 'A2.6I', 'A2.6K'], tools: [{ surface: 'signSolutionAnalyzer', mode: 'rational' }, { surface: 'polynomialWorkshop', mode: 'rationalFeatures' }], missingCapability: 'A Question Family for signSolutionAnalyzer mode "rational".' },
  { courseId: 'algebra2', concept: 'Square root equations and extraneous solutions', teks: ['A2.4F', 'A2.4G'], tools: [{ surface: 'signSolutionAnalyzer', mode: 'radicalCheck' }], missingCapability: 'A Question Family for signSolutionAnalyzer mode "radicalCheck".' },
  { courseId: 'algebra2', concept: 'Quadratic inequalities', teks: ['A2.4H'], tools: [{ surface: 'signSolutionAnalyzer', mode: 'polynomial' }], missingCapability: 'A Question Family for signSolutionAnalyzer mode "polynomial".' },
  { courseId: 'algebra2', concept: 'Nonlinear systems', teks: ['A2.3C', 'A2.3D'], tools: [{ surface: 'systemsWorkspace', mode: 'linearQuadratic' }], missingCapability: 'A Question Family for systemsWorkspace mode "linearQuadratic".' },
  { courseId: 'algebra2', concept: 'Systems of linear inequalities', teks: ['A2.3E', 'A2.3F', 'A2.3G'], tools: [{ surface: 'systemsWorkspace', mode: 'inequalities' }], missingCapability: 'A Question Family for systemsWorkspace mode "inequalities".' },
  { courseId: 'algebra2', concept: 'Complex numbers', teks: ['A2.7A'], tools: [{ surface: 'complexPlaneLab', mode: 'operations' }, { surface: 'complexPlaneLab', mode: 'quadraticRoots' }], missingCapability: 'A Question Family for complexPlaneLab.' },
  { courseId: 'algebra2', concept: 'Regression with quadratic and exponential models', teks: ['A2.8A', 'A2.8B', 'A2.8C'], tools: [{ surface: 'dataModelingLab', mode: 'quadraticFitPrediction' }, { surface: 'dataModelingLab', mode: 'exponentialFitPrediction' }], missingCapability: 'A Question Family that generates data sets for dataModelingLab (quadratic and exponential fits and predictions).' },
].map((entry) => Object.freeze({ ...entry, status: BLOCKED, teks: Object.freeze([...entry.teks]), tools: Object.freeze(entry.tools.map((tool) => Object.freeze({ ...tool }))) })));

/** The audit verdict for a registered family in a course, or null (READY, or not audited). */
export const honorsFamilyAuditFor = (familyId, courseId) => HONORS_FAMILY_AUDIT[String(familyId || '')]?.[String(courseId || '')] || null;

/** The sentence a teacher reads when no built-in extension exists for this concept and course. */
export const honorsUnavailableReason = (familyId, courseId) => honorsFamilyAuditFor(familyId, courseId)?.teacherReason || '';

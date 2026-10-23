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

const { BLOCKED, CAPABLE, NOT_APPROPRIATE } = HONORS_COVERAGE_STATUS;

const ALGEBRA_I_ONLY = (concept) => ({
  status: NOT_APPROPRIATE,
  reason: `${concept} is Algebra I content. A built-in Algebra II Honors extension anchored on it would teach Algebra I mathematics under an Algebra II label, so an Algebra II lesson that reviews it is given none.`,
  teacherReason: `${concept} is Algebra I content, so MathMaster does not build an Algebra II Honors extension on it.`,
});

const ALGEBRA_II_ONLY = (concept, teks) => ({
  status: NOT_APPROPRIATE,
  reason: `${concept} is Algebra II content (${teks}); Texas Algebra I does not teach it. An Algebra I-labelled lesson aligned to ${teks} is the course/TEKS conflict selection already refuses.`,
  teacherReason: `${concept} is Algebra II content, so MathMaster does not build an Algebra I Honors extension on it.`,
});

// A skill Algebra I also teaches, in a family aligned to Algebra II's A2.7B (or
// `teks`): an Algebra I lesson's questions (aligned to A.10/A.11) never bind to it.
const ALIGNED_TO_ALGEBRA_II = (concept, algebraOneTeks, noun, teks = 'A2.7B') => ({
  status: BLOCKED,
  reason: `${concept} is taught in Algebra I too (${algebraOneTeks}), but this family is aligned to Algebra II's ${teks}, so an Algebra I lesson's questions never bind to it and no Algebra I recipe can anchor on it.`,
  missingCapability: `An Algebra I alignment (${algebraOneTeks}) — a sibling family within Algebra I's limits — so an Algebra I Honors task on ${noun} can anchor on it.`,
  teacherReason: `MathMaster's generator for ${noun} is written for Algebra II, so it cannot yet carry a built-in Algebra I Honors extension.`,
});

/**
 * The verdict for every registered family that is not READY, by course.
 * A family id missing here for a course must be READY in the registry; the
 * coverage tests fail otherwise.
 */
export const HONORS_FAMILY_AUDIT = Object.freeze({
  'linear.twoStepEquation': Object.freeze({
    algebra1: Object.freeze({
      status: CAPABLE,
      reason: 'Version 2 (pinned with "version": 2) adds the distributive case a(x + b) = c (`distribute`), exact rational coefficients (`coefficientForm: "fraction"`) and exact fraction answers (`solutionForm: "fraction"`), keyed exactly and marked by the shared Step Algebra grader in the browser and on the server. a·x + b = c always has one solution, so an Honors task that needs no-solution or identity equations anchors here and targets linear.multiStepEquation v2. No vetted recipe has been written yet.',
      teacherReason: 'MathMaster can now generate the distributive and fraction-coefficient equations an Honors extension on this skill needs, but no vetted built-in Honors recipe has been written for it yet, so none is added.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Solving a two-step linear equation')),
  }),
  'linear.multiStepEquation': Object.freeze({
    algebra1: Object.freeze({
      status: CAPABLE,
      reason: 'Version 2 (pinned with "version": 2) generates `solutionCase` one | none | infinite | mixed — equations whose variable terms cancel to a false statement or an identity, each verified exactly from the displayed equation — with `distribute` and exact fraction coefficients and answers. The answer key states "No solution" / "All real numbers", and the shared Step Algebra grader marks it identically in the browser and on the server. No vetted recipe has been written yet.',
      teacherReason: 'MathMaster can now generate the no-solution and infinitely-many-solutions equations an Honors extension on this skill needs, but no vetted built-in Honors recipe has been written for it yet, so none is added.',
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
  // Recovery V2 families: written so a static Warm-Up or DOL question can be
  // recovered with fresh versions of itself (recoveryContent.mjs). Each asks
  // exactly the original's skill at its rigor, which is why none carries an
  // Honors task yet.
  'linear.graphFromSlopeIntercept': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'The line is always given in slope-intercept form, with a whole-number or unit-fraction slope and a whole-number intercept, so the student only reads m and b off the equation; the remaining levers are wider ranges, which are not rigor.',
      missingCapability: 'A `form` knob that states the line in standard form (Ax + By = C) or point-slope form, so the student must rewrite it before graphing, answered in the same graphing2 slopeIntercept board.',
      teacherReason: 'MathMaster\'s line-graphing generator only graphs equations already in slope-intercept form, so it cannot yet build the rewrite-then-graph work a built-in Honors extension needs.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Graphing a line from slope-intercept form')),
  }),
  'linear.keyCharacteristics': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'Every version is an unrestricted line, so the domain and range are always all real numbers; the fraction slopes and intercepts it already writes are the original skill, not an extension of it.',
      missingCapability: 'A `domain` knob (a closed interval, or a domain restricted by a context) with the range answered as an inequality or interval in the answer fields.',
      teacherReason: 'MathMaster\'s key-characteristics generator only writes unrestricted lines, so it cannot yet ask the restricted-domain work a built-in Honors extension needs.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Key characteristics of a line')),
  }),
  'transformations.linearPlotImages': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'It plots the images of three points under one transformation of f(x) = x at a time; Honors depth combines a shift with a stretch, where the order of the moves matters.',
      missingCapability: 'A `moves: 2` knob that composes a shift with a vertical or horizontal scale (g(x) = a·f(b(x − h)) + k), answered with the same plotted images in the Transformations Lab.',
      teacherReason: 'MathMaster\'s transformations generator plots one transformation at a time, so it cannot yet build the combined-transformation work a built-in Honors extension needs.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Plotting a transformation of f(x) = x')),
  }),
  'transformations.linearHorizontalShiftAlgebra': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'For a line, a horizontal shift is always equivalent to a vertical one, and that equivalence is the skill this family assesses; the Honors question — why it fails for other parents — needs a parent that is not a line.',
      missingCapability: 'A non-linear parent (absolute value or quadratic) for r(x) = j(x − c), with a field asking whether an equivalent vertical shift exists.',
      teacherReason: 'MathMaster\'s horizontal-shift generator only uses linear functions, so it cannot yet ask the compare-the-parents work a built-in Honors extension needs.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Horizontal shifts of a linear function')),
  }),
  'transformations.linearCompareEffects': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'It compares, with three choice fields, whether a transformation of f(x) = x acts on the inputs or the outputs; the choices are fixed, so no deeper reasoning can be generated from it.',
      missingCapability: 'A second parent function to compare against, or a server-marked justification field explaining why the two effects coincide for f(x) = x.',
      teacherReason: 'MathMaster\'s transformation-comparison generator only asks fixed-choice questions about f(x) = x, so it cannot yet build a built-in Honors extension.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Comparing horizontal and vertical transformations of f(x) = x')),
  }),
  'linear.representationSort': Object.freeze({
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Sorting the representations of two lines')),
  }),
  'systems.elimination': Object.freeze({
    algebra1: Object.freeze({
      status: CAPABLE,
      reason: 'This family still makes one-solution systems answered as one ordered pair, but systems.algebraic2x2 v1 now generates 2×2 systems with `solutionCase` one | none | infinite | mixed (and exact fractional intersections) in the Systems Workspace\'s algebraic mode, whose shared server grader marks elimination, substitution and the special-case readings. A recipe anchored on this family can target it; none has been written yet.',
      teacherReason: 'MathMaster can now generate the no-solution and infinitely-many-solutions systems an Honors extension on this skill needs, but no vetted built-in Honors recipe has been written for it yet, so none is added.',
    }),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Algebra II systems (A2.3A–B) are systems of three linear equations in three variables; a two-variable elimination drill has no Algebra II Honors depth.',
      missingCapability: 'A Question Family that generates 3×3 systems for systemsWorkspace (mode "algebraic" 3×3, "matrix3" or "spatial"). Those modes and their server graders exist, and MathMaster\'s Algebra II Honors 3×3 lessons already use them as hand-authored questions. (matrices.solveSystem3x3 generates 3×3 systems only for the Matrix Lab, solved with technology.)',
      teacherReason: 'MathMaster has no generator for three-variable systems in the Systems Workspace yet, so it cannot build a no-AI Algebra II Honors extension for systems.',
    }),
  }),
  'systems.substitution': Object.freeze({
    algebra1: Object.freeze({
      status: CAPABLE,
      reason: 'This family still makes one-solution systems answered as one ordered pair, but systems.algebraic2x2 v1 (pinnable to `method: "substitution"`) now generates 2×2 systems with `solutionCase` one | none | infinite | mixed in the Systems Workspace\'s algebraic mode, where substitution — isolating, substituting, solving and reading 0 = c — is marked by the shared server grader. A recipe anchored on this family can target it; none has been written yet.',
      teacherReason: 'MathMaster can now generate the no-solution and infinitely-many-solutions systems an Honors extension on this skill needs, but no vetted built-in Honors recipe has been written for it yet, so none is added.',
    }),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Algebra II substitution is used on linear-quadratic systems (A2.3C–D), which no registered family generates.',
      missingCapability: 'A Question Family for systemsWorkspace mode "linearQuadratic" (the mode and its server grader exist), with a knob for the number of intersections (0, 1 or 2).',
      teacherReason: 'MathMaster has no generator for linear-quadratic systems yet, so it cannot build a no-AI Algebra II Honors extension for systems by substitution.',
    }),
  }),
  'systems.algebraic2x2': Object.freeze({
    algebra1: Object.freeze({
      status: CAPABLE,
      reason: 'Generates 2×2 systems with `solutionCase` one | none | infinite | mixed — parallel distinct lines, equivalent equations written differently, or an intersection (integer or, with `solutionForm: "fraction"`, exact halves, thirds and quarters) — each classified exactly from the displayed system, answered in the Systems Workspace\'s algebraic mode by substitution or elimination and marked by its shared server grader. No vetted recipe has been written yet.',
      teacherReason: 'MathMaster can generate the no-solution and infinitely-many-solutions systems an Honors extension on this skill needs, but no vetted built-in Honors recipe has been written for it yet, so none is added.',
    }),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Algebra II systems (A2.3A–B) are systems of three linear equations in three variables; two-variable systems, even with no or infinitely many solutions, are Algebra I depth (A.5C).',
      missingCapability: 'A Question Family that generates 3×3 systems for systemsWorkspace (mode "algebraic" 3×3, "matrix3" or "spatial"). Those modes and their server graders exist, and MathMaster\'s Algebra II Honors 3×3 lessons already use them as hand-authored questions. (matrices.solveSystem3x3 generates 3×3 systems only for the Matrix Lab, solved with technology.)',
      teacherReason: 'MathMaster has no generator for three-variable systems in the Systems Workspace yet, so it cannot build a no-AI Algebra II Honors extension for systems.',
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
  // Recovery V2 families for Algebra II Honors "Solving Systems with Matrices"
  // (questionFamiliesMatrices.mjs). Like the Algebra I ones above, each asks
  // exactly its original's skill at its rigor.
  'matrices.arrayRecordTotals': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Reading records as matrices', 'A2.3B')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'It reads two sales records as arrays — two totals, whether the arrays hold the same numbers, and which kind sold fewest — with no matrix operation; the remaining levers are other card values and wider counts, which are not rigor.',
      missingCapability: 'A context product (a quantity matrix times a price column, giving revenue) answered in the Matrix Lab\'s operate mode, so the student decides what the product means as well as computing it.',
      teacherReason: 'MathMaster\'s sales-record generator only asks for totals read from the arrays, so it cannot yet build the matrix-product-in-context work a built-in Honors extension needs.',
    }),
  }),
  'matrices.addition': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Adding matrices', 'A2.3B')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'It adds two 3×2 sales matrices entry by entry; the Matrix Lab\'s operate mode adds or multiplies only, so neither a scalar multiple nor a difference (k·A − B) can be asked.',
      missingCapability: 'Scalar multiples and differences in the Matrix Lab\'s operate mode (with their server grader), and a family knob that asks for a combination such as 2·Dec − Nov.',
      teacherReason: 'MathMaster\'s matrix-addition generator only adds two matrices, so it cannot yet build the matrix-combination work a built-in Honors extension needs.',
    }),
  }),
  'numbers.multiplicativeInverse': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Multiplicative inverses as the idea behind an inverse matrix', 'A2.3B')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'It is the lesson\'s Warm-Up review: the inverse of a whole number and of a fraction, that a number times its inverse is 1, and that 0 has none. Its Honors depth is the inverse of a matrix, which this family does not generate.',
      missingCapability: 'A Question Family for the Matrix Lab\'s inverse work (judgeInverse / askInverse): find or verify A⁻¹ for a 2×2 matrix, and recognize a matrix with no inverse.',
      teacherReason: 'MathMaster\'s inverse generator only works with numbers, so it cannot yet build the inverse-matrix work a built-in Honors extension needs.',
    }),
  }),
  'matrices.multiplication': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Multiplying matrices', 'A2.3B')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version is a 2×3 times a 3×2, always defined, computed once; the depth Honors needs — that Q · P differs from P · Q, or is not even defined — cannot be generated.',
      missingCapability: 'An `order` knob that asks for both P · Q and Q · P (or whether one is defined, with the Matrix Lab\'s askDefined), so the student shows matrix multiplication is not commutative.',
      teacherReason: 'MathMaster\'s matrix-multiplication generator computes one product in one order, so it cannot yet build the does-order-matter work a built-in Honors extension needs.',
    }),
  }),
  'matrices.solveSystem3x3': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Solving a system of three equations with matrices', 'A2.3B')),
    algebra2: Object.freeze({
      status: CAPABLE,
      reason: 'This family makes one-solution 3×3 systems solved with technology, but matrices.singularSystem3x3 now generates the systems whose coefficient matrix has no inverse — no solution or infinitely many, decided from the constants and justified by the row that is a multiple of another — marked by the Matrix Lab\'s shared server grader. A recipe anchored on this family can target it; none has been written yet.',
      teacherReason: 'MathMaster can now generate the singular systems an Honors extension on this skill needs, but no vetted built-in Honors recipe has been written for it yet, so none is added.',
    }),
  }),
  'matrices.singularSystem3x3': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Systems of three equations with no inverse', 'A2.3B')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'It already asks the deeper reading (no inverse; no solution or infinitely many; which row is a multiple of which). What remains is reasoning about a parameter, which it cannot generate.',
      missingCapability: 'A `parameter` knob that writes one constant or coefficient as k and asks for the value(s) of k that give no solution or infinitely many, with the answer field the Matrix Lab\'s solve mode would need to mark it.',
      teacherReason: 'MathMaster\'s singular-system generator uses fixed numbers, so it cannot yet build the find-the-parameter work a built-in Honors extension needs.',
    }),
  }),
  // Recovery V2 families for Algebra I "Slopes of Perpendicular Lines and
  // Horizontal & Vertical Lines" (questionFamiliesPerpendicular.mjs). Like the
  // other Algebra I ones above, each asks exactly its original's skill at its
  // rigor: BLOCKED in Algebra I, NOT APPROPRIATE in Algebra II.
  'lines.rotationImages': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'Every version rotates one point about the origin through a quarter, half or three-quarter turn, counterclockwise; the remaining levers are other points, which are not rigor.',
      missingCapability: 'A `center` knob that rotates about a point other than the origin, and a `direction` knob for clockwise turns, answered as the same ordered pairs.',
      teacherReason: 'MathMaster\'s rotation generator only turns a point about the origin, so it cannot yet build the rotate-about-another-point work a built-in Honors extension needs.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Rotating a point to see perpendicular slopes')),
  }),
  'lines.rotationSlopes': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'It asks the slopes of one segment and its three rotations and the pattern between them, with whole-number coordinates; the remaining levers are bigger coordinates, which are not rigor.',
      missingCapability: 'A `symbolic` knob that gives B as (a, b) and answers each slope as an expression, so the student shows the quarter-turn slope is −a/b in general.',
      teacherReason: 'MathMaster\'s rotated-slopes generator only uses numbers, so it cannot yet build the prove-it-for-any-point work a built-in Honors extension needs.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Slopes of a rotated segment')),
  }),
  'numbers.reciprocals': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'It is the lesson\'s Warm-Up review: reciprocals of whole numbers and fractions and one negative reciprocal. Its Honors depth is the negative reciprocal of an expression, which this family does not generate.',
      missingCapability: 'A `form` knob that writes the values as variable fractions (a/b, −2/3x), graded as expressions in the answer fields.',
      teacherReason: 'MathMaster\'s reciprocal generator only works with numbers, so it cannot yet build the reciprocal-of-an-expression work a built-in Honors extension needs.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Reciprocals and negative reciprocals')),
  }),
  'lines.perpendicularFromEquation': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'The given line is always in slope-intercept form with a whole-number slope, and the answer\'s y-intercept is always whole; the remaining levers are other numbers, which are not rigor.',
      missingCapability: 'A `form` knob that gives the line in standard form (Ax + By = C), allows fractional intercepts, and accepts the answer in standard form.',
      teacherReason: 'MathMaster\'s perpendicular-line generator only starts from slope-intercept form with whole answers, so it cannot yet build the standard-form work a built-in Honors extension needs.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('The line perpendicular to a given line through a point')),
  }),
  'lines.horizontalVertical': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'It writes the horizontal and the vertical line through one named point and the vertical line\'s slope; there is no deeper reading of the same skill to ask.',
      missingCapability: 'A `given` knob that names two points (which may share an x or a y) and asks the student to classify the line they determine and write it, answered with the same equation fields.',
      teacherReason: 'MathMaster\'s horizontal-and-vertical generator only names one point, so it cannot yet build the classify-the-line-through-two-points work a built-in Honors extension needs.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Horizontal and vertical lines')),
  }),
  'lines.perpendicularFromPoints': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'The line through two points always has a unit-fraction slope and the perpendicular passes through one of those points; the next depth is the perpendicular bisector, which needs a midpoint.',
      missingCapability: 'A `bisector` knob that asks for the perpendicular bisector of the segment (through the midpoint, with fractional midpoints and intercepts), answered in the same equation field.',
      teacherReason: 'MathMaster\'s two-point perpendicular generator only passes through a given point, so it cannot yet build the perpendicular-bisector work a built-in Honors extension needs.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('The line perpendicular to the line through two points')),
  }),
  // Recovery V2 families for Algebra II Honors "Dividing Polynomials"
  // (questionFamiliesPolynomialDivision.mjs). Each asks exactly its original's
  // skill at its rigor, aligned to A2.7C.
  'polynomials.divideMonomials': Object.freeze({
    algebra1: Object.freeze(ALIGNED_TO_ALGEBRA_II('Dividing monomials', 'A.11B', 'dividing monomials', 'A2.7C')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'It is the lesson\'s Warm-Up review of the quotient of powers with every exponent left positive. The Honors depth — zero and negative exponents, and a quotient raised to a power — needs an answer that is not a polynomial, which typed answers compare only as text.',
      missingCapability: 'A quotient-of-monomials answer form graded by value (x³ ÷ x⁵ = x⁻² = 1/x²), so the family can ask zero and negative exponents as well.',
      teacherReason: 'MathMaster\'s monomial-division generator only writes quotients with positive exponents, so it cannot yet build the negative-exponent work a built-in Honors extension needs.',
    }),
  }),
  'polynomials.distributeMonomial': Object.freeze({
    algebra1: Object.freeze(ALIGNED_TO_ALGEBRA_II('Multiplying a polynomial by a monomial', 'A.10B', 'multiplying by a monomial', 'A2.7C')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'It is the lesson\'s Warm-Up review of multiplying back: a monomial times a trinomial and a negative monomial times x + q. Larger factors are its only remaining lever, which is not rigor.',
      missingCapability: 'A `divisor` knob that multiplies a quotient term by a quadratic divisor (−4y(y² + y − 5), textbook 5-2 #6), the multiply-back step of dividing by a degree-2 polynomial.',
      teacherReason: 'MathMaster\'s multiply-back generator only uses linear divisors, so it cannot yet build the quadratic-divisor work a built-in Honors extension needs.',
    }),
  }),
  'polynomials.subtractForDivision': Object.freeze({
    algebra1: Object.freeze(ALIGNED_TO_ALGEBRA_II('Subtracting polynomials', 'A.10A', 'subtracting polynomials', 'A2.7C')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'It is the lesson\'s Warm-Up review: one two-letter difference with a missing term and one long-division subtraction whose leading terms cancel. Wider coefficients are its only remaining lever, which is not rigor.',
      missingCapability: 'A `lines: three` knob writing the subtraction of a quadratic divisor\'s product (three terms, a placeholder brought down), as dividing by a degree-2 polynomial needs.',
      teacherReason: 'MathMaster\'s subtraction generator only writes two-term long-division lines, so it cannot yet build the three-term work a built-in Honors extension needs.',
    }),
  }),
  'polynomials.divideByMonomial': Object.freeze({
    algebra1: Object.freeze(ALIGNED_TO_ALGEBRA_II('Dividing a polynomial by a monomial', 'A.11B', 'dividing by a monomial', 'A2.7C')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version divides a trinomial by a two-letter monomial, one term of it the divisor itself. A term that does not divide evenly (−w² + 16w + 1000 over w, textbook 5-2 #19) gives a quotient that is not a polynomial, which this family does not write.',
      missingCapability: 'A `remainderTerm` knob that leaves one term over the monomial (1000/w), answered as the polynomial part plus that term\'s numerator, with a judgment that the quotient is not a polynomial.',
      teacherReason: 'MathMaster\'s divide-by-a-monomial generator only writes terms that divide evenly, so it cannot yet build the not-a-polynomial work a built-in Honors extension needs.',
    }),
  }),
  'polynomials.longDivisionLinear': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Long division of a cubic polynomial', 'A2.7C')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version divides a cubic with one missing term by x − r. The Honors depth — a quartic divided by a quadratic (textbook 5-2 #6) or a divisor ax + b — is a knob this family does not have, though the Polynomial Workshop\'s long division already draws both.',
      missingCapability: 'A `divisor: quadratic | scaled` knob writing a quadratic or an ax + b divisor, answered in the Workshop\'s long division round by round.',
      teacherReason: 'MathMaster\'s long-division generator only divides by x − r, so it cannot yet build the quadratic-divisor work a built-in Honors extension needs.',
    }),
  }),
  'polynomials.syntheticDivision': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Synthetic division', 'A2.7C')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version divides a quartic with one missing term by x − r. The Honors depth — a divisor ax + b, divided through by a first (the lesson\'s Example 5) — is a knob this family does not have, though the Polynomial Workshop\'s synthetic division already draws it.',
      missingCapability: 'A `leading` knob writing the divisor as ax + b (a = 2 or 3), answered in the Workshop\'s synthetic division with its remainder-over-ax + b box.',
      teacherReason: 'MathMaster\'s synthetic-division generator only divides by x − r, so it cannot yet build the divide-through-first work a built-in Honors extension needs.',
    }),
  }),
  // Recovery V2 families for Algebra II Honors "Operations on Polynomials"
  // (questionFamiliesPolynomials.mjs). Each asks exactly its original's skill
  // at its rigor.
  'polynomials.multiplyMonomials': Object.freeze({
    algebra1: Object.freeze(ALIGNED_TO_ALGEBRA_II('Multiplying monomials', 'A.11B', 'multiplying monomials')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'It is the lesson\'s Warm-Up review of the product of powers with whole-number exponents. The Honors depth — quotients, negative and zero exponents — needs an answer that is a quotient of monomials, which typed answers compare only as text.',
      missingCapability: 'A quotient-of-monomials answer form graded by value (y⁴/(81x⁴), negative and zero exponents), so the family can ask the quotient and power-of-a-power rules as well.',
      teacherReason: 'MathMaster\'s monomial generator only multiplies with whole-number exponents, so it cannot yet build the quotient and negative-exponent work a built-in Honors extension needs.',
    }),
  }),
  'polynomials.oppositeAndLikeTerms': Object.freeze({
    algebra1: Object.freeze(ALIGNED_TO_ALGEBRA_II('Combining like terms and the opposite of a polynomial', 'A.10A', 'combining like terms')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'It is the lesson\'s Warm-Up review: the opposite of one polynomial and two pairs of like terms. Wider coefficients are its only remaining lever, which is not rigor.',
      missingCapability: 'A `scaled` knob that subtracts multiples, k·P − m·Q (textbook 5-1 #34), so the opposite is a distribution as well as a sign change.',
      teacherReason: 'MathMaster\'s like-terms generator only changes signs and combines pairs, so it cannot yet build the distribute-then-subtract work a built-in Honors extension needs.',
    }),
  }),
  'polynomials.likeTermPairs': Object.freeze({
    algebra1: Object.freeze(ALIGNED_TO_ALGEBRA_II('Recognizing like terms', 'A.10A', 'like terms')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'It is the lesson\'s Warm-Up vocabulary check — like terms, or not and why — with every term already simplified, so recognizing it never needs any algebra.',
      missingCapability: 'An `unsimplified` knob that writes like terms in disguise (x · x² beside 4x³, 2x · 3y beside xy), so deciding needs simplifying first.',
      teacherReason: 'MathMaster\'s like-terms generator only shows simplified terms, so it cannot yet build the like-terms-in-disguise work a built-in Honors extension needs.',
    }),
  }),
  'polynomials.subtractMissingTerm': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Subtracting cubic polynomials', 'A2.7B')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version is two cubics in one letter, one with a missing term. The Polynomial Workshop\'s add & subtract mode lines up terms in several letters, but this family does not write them.',
      missingCapability: 'A `letters: two` knob writing both polynomials in two letters (3a²b − 2ab² + …), which the Workshop\'s add & subtract mode already lines up by kind of term.',
      teacherReason: 'MathMaster\'s subtraction generator uses one letter, so it cannot yet build the several-letter work a built-in Honors extension needs.',
    }),
  }),
  'polynomials.multiplyTrinomialBinomial': Object.freeze({
    algebra1: Object.freeze(ALIGNED_TO_ALGEBRA_II('Multiplying a trinomial by a binomial', 'A.10B', 'multiplying polynomials')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version is a trinomial times a binomial in one letter. The area model draws up to 16 cells, but this family never asks a product of three factors, a trinomial squared or a binomial cubed.',
      missingCapability: 'A `shape` knob for a trinomial times a trinomial and for (an + b)³ as two area models in turn (textbook 5-1 #58–60), answered in the Workshop\'s area model.',
      teacherReason: 'MathMaster\'s area-model generator multiplies one trinomial by one binomial, so it cannot yet build the larger-product work a built-in Honors extension needs.',
    }),
  }),
  'polynomials.profitModel': Object.freeze({
    algebra1: Object.freeze(ALIGNED_TO_ALGEBRA_II('Writing a profit polynomial', 'A.10A', 'profit polynomials')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'It writes profit = revenue − cost, simplifies it and evaluates it once. The Honors question — how many sales make the most profit, or break even — needs the vertex or zeros of the profit, which this family does not ask.',
      missingCapability: 'A `question: maximize | breakEven` knob that asks for the vertex or the zeros of the profit polynomial, answered by value.',
      teacherReason: 'MathMaster\'s profit generator only evaluates the profit at one number of sales, so it cannot yet build the maximize-the-profit work a built-in Honors extension needs.',
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

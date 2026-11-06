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
      reason: 'Version 1 makes one-solution systems answered as one ordered pair. Version 2 (pinned with "version": 2) opens the Systems Workspace\'s algebraic mode on systems built for substitution — one equation solved for a variable, or with a coefficient of 1 or −1 (`form`) — with `solutionCase` one | none | infinite | mixed, each classified exactly from the displayed rows; isolating, substituting, solving, back-substituting, checking both equations and reading 0 = c are marked by the shared server grader. systems.algebraic2x2 v1 (pinnable to `method: "substitution"`) adds exact fractional intersections. No vetted recipe has been written yet.',
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
  'systems.classifyByStructure': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'It shows a system with whole-number slopes and intercepts, the second equation in standard form, and asks for the four values, the number of solutions and the classification; once the second equation is rewritten the answer is read off, and the remaining levers are wider ranges, which are not rigor.',
      missingCapability: 'A parameter mode: a system with one unknown coefficient or constant (k), answered with the value of k that makes it have no solution or infinitely many solutions, marked as a number field.',
      teacherReason: 'MathMaster\'s system-classification generator only classifies systems whose numbers are all given, so it cannot yet ask the find-the-parameter reasoning a built-in Honors extension needs.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Classifying a system of two linear equations')),
  }),
  'systems.graphical2x2': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'The student graphs both lines in the Systems Workspace\'s construct form and reads the system (`solutionCase` one | none | infinite | mixed, the second equation in slope-intercept or standard form), but every intersection is a whole-number point inside the −10..10 grid, so the graph alone gives the exact answer.',
      missingCapability: 'A `solutionForm: "fraction"` knob (an intersection between grid lines) with the graph read as an estimate and the exact solution confirmed algebraically in a second, server-marked part.',
      teacherReason: 'MathMaster\'s graphing-systems generator only makes systems whose solution lands on the grid, so it cannot yet ask the estimate-then-confirm work a built-in Honors extension needs.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Solving a system of two linear equations by graphing')),
  }),
  'systems.knownValue': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'One equation already gives x as a number or as y plus a constant, so the substitution is a single step: it is the readiness check before the method, not a task an extension can deepen.',
      missingCapability: 'None on this family: an Honors task on substitution anchors on systems.substitution version 2 or systems.algebraic2x2, which generate the full method and the special cases.',
      teacherReason: 'This generator is a one-step substitution warm-up, so MathMaster does not build a built-in Honors extension on it.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Substituting a known value into a system')),
  }),
  'systems.contextModel': Object.freeze({
    algebra1: Object.freeze({
      status: CAPABLE,
      reason: 'It writes a system for a count-and-total, a one-quantity-defined or an equal-cost situation (`shape`), with each equation answered in any equivalent form (`equivalence: "polynomialRelation"`, graded the same in the browser and on the server), the solution, and one more number the solution answers. Every version is built from a whole-number solution and checked from the displayed equations. No vetted recipe has been written yet.',
      teacherReason: 'MathMaster can generate the write-and-solve situations an Honors extension on modeling with systems needs, but no vetted built-in Honors recipe has been written for it yet, so none is added.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Writing and solving a system of two linear equations for a situation')),
  }),
  'equations.verifySolution': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'It substitutes one given value into each side of a linear equation with the variable on both sides and asks whether the two values agree; the value and the equation are the whole task, so no deeper reasoning can be generated.',
      missingCapability: 'A `solutionCase: "none" | "infinite"` knob (an equation that no value, or every value, satisfies) with a server-marked part asking what the check shows about every other value.',
      teacherReason: 'MathMaster\'s solution-check generator only asks whether one given value works, so it cannot yet build a built-in Honors extension.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Checking a solution of a linear equation')),
  }),
  'inequalities.solveLinear': Object.freeze({
    algebra1: Object.freeze({
      status: CAPABLE,
      reason: 'It generates linear inequalities with variables on both sides and the distributive property (`bothSides`, `distribute`), with the sign reversal required, absent or mixed (`reversal`), solved in Step Algebra\'s relation workspace with its number-line stage, checked from the displayed inequality, and marked by the shared grader in the browser and on the server. No vetted recipe has been written yet.',
      teacherReason: 'MathMaster can generate the multi-step inequalities an Honors extension on this skill needs, but no vetted built-in Honors recipe has been written for it yet, so none is added.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Solving a linear inequality in one variable')),
  }),
  'inequalities.translatePhrase': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'Each version asks for four single phrases (exceeds, under, at least, cannot be more than) as choices among the four symbols, so the reasoning is fixed recognition.',
      missingCapability: 'Compound statements (between, at least … and less than …) answered as a typed compound inequality, graded by its solution set.',
      teacherReason: 'MathMaster\'s phrase-to-inequality generator only asks single phrases as choices, so it cannot yet build a built-in Honors extension.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Writing an inequality from words')),
  }),
  'inequalities.contextModel': Object.freeze({
    algebra1: Object.freeze({
      status: CAPABLE,
      reason: 'It models growing and shrinking situations (`direction`; the shrinking ones reverse the symbol when solved), solves exactly to hundredths, and asks for the whole number the situation needs — rounding up or down from the boundary, which the situation decides. No vetted recipe has been written yet.',
      teacherReason: 'MathMaster can generate the inequality situations an Honors extension on this skill needs, but no vetted built-in Honors recipe has been written for it yet, so none is added.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Modeling a situation with a linear inequality')),
  }),
  'linear.contextFunction': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'It writes f(x) = mx + b for a starting amount and a constant rate, names the independent and dependent quantities, and interprets the slope and the intercept by choice; every situation is unrestricted, so its reasonable domain and range are never asked.',
      missingCapability: 'A reasonable-domain-and-range part (the situation\'s limits, answered as inequalities) or a second situation to compare with the first (which one is greater, and from when).',
      teacherReason: 'MathMaster\'s situation-to-function generator only writes and interprets one unrestricted function, so it cannot yet build a built-in Honors extension.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Writing and interpreting a linear function for a situation')),
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
  // The Recovery V2 family for the static number-line Warm-Up and DOL
  // questions of Algebra II Honors Module 1, Lesson 1 (questionFamiliesIntervals.mjs,
  // RC01). It asks exactly its originals' skill at their rigor, aligned to A2.7I.
  'intervals.graphAndWrite': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Writing an inequality in interval notation', 'A2.7I')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version states one inequality with whole-number ends (an interval, a ray, two rays, or a ray and an interval) and asks for its graph and its interval notation; the remaining levers are other ends, which are not rigor.',
      missingCapability: 'A `represent` knob that gives the set as a graph or as a function\'s domain or range and asks for the inequality and set-builder notation too (the number line\'s `inequality` stage), so the student moves between all three notations A2.7I names.',
      teacherReason: 'MathMaster\'s interval generator only writes a stated inequality in interval notation, so it cannot yet build the move-between-notations work a built-in Honors extension needs.',
    }),
  }),
  // The Recovery V2 families for the exit ticket of Algebra II Honors Module 1,
  // Lesson 2 Day 2 (questionFamiliesParentTransformations.mjs, RC01). Each asks
  // exactly its original's skill at its rigor, aligned to A2.2A.
  'transformations.identifyCubeRoot': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Transforming the cube-root parent function', 'A2.2A')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version is one reflected, stretched and shifted cube root drawn on the lab\'s grid, whose a, h and k the student reads back; the remaining levers are other whole numbers, which are not rigor.',
      missingCapability: 'A `parent` knob over the other parent functions, or a horizontal factor b read from the graph, so the student identifies a transformation they have not been shown the family of.',
      teacherReason: 'MathMaster\'s cube-root generator only asks for a, h and k of one graph, so it cannot yet build a built-in Honors extension.',
    }),
  }),
  'transformations.describeEveryChange': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Describing the transformations of a parent function', 'A2.2A')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version is g(x) = ±f(±B(x − C)) + D described in five fixed choices (each reflection, the horizontal compression by 1/B, both translations); the choices fix the reasoning.',
      missingCapability: 'A vertical stretch A and a typed description of the combined effect on a named point or feature, graded by the server, so the student composes the changes rather than naming each one.',
      teacherReason: 'MathMaster\'s transformation-description generator only asks fixed-choice questions, so it cannot yet build a built-in Honors extension.',
    }),
  }),
  'transformations.mapExponentialPoint': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Mapping a point through a transformed exponential function', 'A2.2A')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version maps the reference point (0, 1) of 2^x through y = a·2^(x − h) + k with whole-number a, h and k; the remaining levers are other whole numbers, which are not rigor.',
      missingCapability: 'Other parent points and a horizontal factor b (x/b + h), or a mapped asymptote, so the student carries a whole transformation rather than one point.',
      teacherReason: 'MathMaster\'s point-mapping generator only maps the point (0, 1) of 2^x, so it cannot yet build a built-in Honors extension.',
    }),
  }),
  // The Recovery V2 families for the Algebra II Honors ALEKS bridge lesson
  // (questionFamiliesTransformationLanguage.mjs, RC01's next shapes), A2.6C.
  'transformations.describeTranslations': Object.freeze({
    algebra1: Object.freeze(ALIGNED_TO_ALGEBRA_II('Describing the translations of a function', 'A.3E, A.7C', 'translations', 'A2.6C')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version names the two translations of g(x) = f(x − C) + D, chosen from three words each; it is the class rule\'s readiness check, not a task an extension can deepen.',
      missingCapability: 'None on this family: an Honors task anchors on one that graphs or writes the transformed function (transformations.describeEveryChange, extended).',
      teacherReason: 'MathMaster\'s translation generator only names two shifts, so it cannot carry a built-in Honors extension.',
    }),
  }),
  'transformations.describeScaleChange': Object.freeze({
    algebra1: Object.freeze(ALIGNED_TO_ALGEBRA_II('Describing a reflection and a stretch or compression of a function', 'A.3E, A.7C', 'reflections and stretches', 'A2.6C')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version names one reflection, one stretch or compression by a whole number or its reciprocal, and (outside f) one translation, chosen from three words each; the remaining levers are other factors, which are not rigor.',
      missingCapability: 'A factor inside and outside f together, and the graph drawn or the equation written from a description, so the student applies the rule rather than naming it.',
      teacherReason: 'MathMaster\'s class-rule generator only names one change of each kind, so it cannot yet build a built-in Honors extension.',
    }),
  }),
  'absoluteValue.analyzeTransformed': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Analyzing a transformed absolute value function', 'A2.6C')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version is y = −a|x − h| + k with a whole-number a, analyzed from six sets of three choices; the remaining levers are other whole numbers, which are not rigor.',
      missingCapability: 'A fractional or positive a, a horizontal factor, and the vertex, range and intercepts typed, so the student works the analysis rather than choosing it.',
      teacherReason: 'MathMaster\'s absolute-value generator only offers its analysis as choices, so it cannot yet build a built-in Honors extension.',
    }),
  }),
  'transformations.matchAbsoluteValue': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Transforming the absolute value parent function', 'A2.6C')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version matches y = (1/n)|x − h| + k in the Transformations Lab from y = |x|; the remaining levers are other targets, which are not rigor.',
      missingCapability: 'Targets with a reflection or a horizontal factor, matched from another starting graph, so the student plans the order of the changes.',
      teacherReason: 'MathMaster\'s match generator only draws compressed, translated absolute values, so it cannot yet build a built-in Honors extension.',
    }),
  }),
  // The Recovery V2 families for Algebra II Honors Module 1 Lesson 1 Day 2's
  // exit ticket (questionFamiliesGraphReading.mjs and
  // questionFamiliesFunctionContexts.mjs, RC01's next shapes), A2.7I.
  'functions.intervalsFromGraph': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Writing where a graphed parabola increases, decreases, and is positive or negative in interval notation', 'A2.7I')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version is a parabola opening down with whole-number zeros, so the four intervals always follow one pattern from the vertex and the zeros; the remaining levers are other vertices, which are not rigor.',
      missingCapability: 'Other parents (cubic, square root, absolute value) and parabolas with irrational zeros or opening up, so the student reads each interval from the graph rather than recalling the pattern.',
      teacherReason: 'MathMaster\'s interval-reading generator only draws parabolas opening down with whole-number zeros, so it cannot yet build a built-in Honors extension.',
    }),
  }),
  'functions.fillingTankAttributes': Object.freeze({
    algebra1: Object.freeze(ALIGNED_TO_ALGEBRA_II('A situation\'s domain and range', 'A.2A', 'domain and range in context', 'A2.7I')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version is the same filling tank with a new rate and time, its domain and range chosen from written-out sets; the remaining levers are other numbers, which are not rigor.',
      missingCapability: 'Situations whose domain is discrete or open at one end, with the domain and range typed, so the student decides them from the situation rather than choosing a bracket form.',
      teacherReason: 'MathMaster\'s situation generator only writes the filling tank, so it cannot yet build a built-in Honors extension.',
    }),
  }),
  // The Recovery V2 families for the inverse boards of Algebra II Honors
  // Module 1 Lessons 3 and 4 (questionFamiliesInverses.mjs, RC01's next
  // shapes), A2.2B and A2.7I.
  'functions.swapPairAndEvaluate': Object.freeze({
    algebra1: Object.freeze(ALIGNED_TO_ALGEBRA_II('Swapping an ordered pair and evaluating a function', 'A.12B', 'ordered pairs and function notation', 'A2.7I')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version swaps one ordered pair and evaluates one linear function at one input; it is the readiness check before inverses, not a task an extension can deepen.',
      missingCapability: 'None on this family: an Honors task on inverses anchors on a family that writes the inverse itself (functions.inverseOfLinear, extended).',
      teacherReason: 'MathMaster\'s ordered-pair review generator only swaps one pair and evaluates one line, so it cannot carry a built-in Honors extension.',
    }),
  }),
  'relations.inverseOfSet': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Inverse relations', 'A2.2B')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version swaps the coordinates of three listed ordered pairs, chosen from three written-out sets; the remaining levers are other pairs, which are not rigor.',
      missingCapability: 'A relation given as a graph or a table, or a set whose inverse is not a function, so the student also decides whether the inverse is a function.',
      teacherReason: 'MathMaster\'s inverse-relation generator only swaps short lists of ordered pairs, so it cannot yet build a built-in Honors extension.',
    }),
  }),
  'functions.inverseOfLinear': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Inverse functions', 'A2.2B')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version inverts f(x) = ax + b with whole numbers, chosen from four written-out expressions, and checks one value; the remaining levers are other whole numbers, which are not rigor.',
      missingCapability: 'A typed inverse marked by expression equivalence, and inverses of quadratic and square root functions on a restricted domain (A2.2C), so the student writes and restricts the inverse rather than recognizing it.',
      teacherReason: 'MathMaster\'s inverse generator only offers inverses of whole-number lines as choices, so it cannot yet build a built-in Honors extension.',
    }),
  }),
  'functions.inverseInContext': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Inverse functions in context', 'A2.2B')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version is a subscription cost C(m) = rm + f whose inverse is chosen from four written-out expressions and evaluated once; the remaining levers are other rates and fees, which are not rigor.',
      missingCapability: 'A typed inverse marked by expression equivalence, with the meaning of the inverse\'s input and output and a domain the context restricts, so the student interprets the inverse rather than recognizing it.',
      teacherReason: 'MathMaster\'s inverse-in-context generator only offers the inverse of one kind of cost as choices, so it cannot yet build a built-in Honors extension.',
    }),
  }),
  // The Recovery V2 families for the numeric Warm-Up of Algebra II Honors
  // Module 1 Lesson 4 (questionFamiliesFunctionValues.mjs, RC01), A2.2D.
  'functions.pointwiseFromValues': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Operations on functions', 'A2.2D')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version adds and subtracts two given function values at one input; it is the readiness check before operations on functions, not a task an extension can deepen.',
      missingCapability: 'None on this family: an Honors task on operations anchors on a family that writes the functions themselves (sum, difference, product, quotient and the quotient\'s excluded inputs).',
      teacherReason: 'MathMaster\'s function-values generator only combines two given numbers, so it cannot carry a built-in Honors extension.',
    }),
  }),
  'functions.compositionFromValues': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Composing functions', 'A2.2D')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version reads f(g(a)) from two given values; it is the readiness check before composition, not a task an extension can deepen.',
      missingCapability: 'None on this family: an Honors task on composition anchors on a family that composes the functions themselves (f∘g and g∘f, and whether they are inverses).',
      teacherReason: 'MathMaster\'s function-values generator only chains two given values, so it cannot carry a built-in Honors extension.',
    }),
  }),
  // The Recovery V2 families for Algebra II Honors Module 1 Lesson 4's exit
  // ticket Q1 and Q2 (questionFamiliesFunctionOperations.mjs, RC01's next
  // shapes), A2.2D.
  'functions.composeQuadraticLinear': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Composing functions', 'A2.2D')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version composes x² + bx + c with mx + n both ways, chosen from four polynomials each; the remaining levers are other coefficients, which are not rigor.',
      missingCapability: 'The compositions typed, a leading coefficient on f, and the domain of a composition with a root or a quotient, so the student writes the composition rather than choosing it.',
      teacherReason: 'MathMaster\'s composition generator only offers its compositions as choices, so it cannot yet build a built-in Honors extension.',
    }),
  }),
  'functions.conjugateProductQuotient': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Operations on functions', 'A2.2D')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version multiplies x + p by x − p and names the input one of their quotients excludes, chosen from four each; the remaining levers are other values of p, which are not rigor.',
      missingCapability: 'Products and quotients of other functions, typed, with every excluded input of a quotient whose denominator has two zeros.',
      teacherReason: 'MathMaster\'s operations generator only offers one pair of linear functions as choices, so it cannot yet build a built-in Honors extension.',
    }),
  }),
  // The Recovery V2 family for the graphed domain and range of Algebra II
  // Honors Module 1 Lesson 1 (questionFamiliesGraphReading.mjs, RC01), A2.7I.
  'functions.domainRangeFromGraph': Object.freeze({
    algebra1: Object.freeze(ALGEBRA_II_ONLY('Writing a graphed domain and range in interval notation', 'A2.7I')),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version is an unrestricted parabola or absolute value with a moved vertex, so the domain is always all real numbers and only the range\'s end moves; the remaining levers are other vertices, which are not rigor.',
      missingCapability: 'A restricted domain (a closed or half-open interval, as Lesson 1\'s own restricted line has) and other parents (square root, rational), so the domain and range are both found, not recalled.',
      teacherReason: 'MathMaster\'s graphed domain-and-range generator only draws unrestricted parabolas and absolute values, so it cannot yet build a built-in Honors extension.',
    }),
  }),
  // The Recovery V2 family for the static Mapping Diagram Warm-Up and DOL
  // questions (questionFamiliesRelations.mjs, RC01): Algebra II Honors Module 1
  // Lesson 1 (A2.7I) and the Algebra I District DOL 1 review (A.12A).
  'relations.mappingDiagram': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'Every version is three or four ordered pairs of whole numbers whose arrows, domain and range the student reads off, and whose function verdict follows from one repeated input or output; the remaining levers are other pairs, which are not rigor.',
      missingCapability: 'A relation given as a graph, a table or a rule to map first (the Mapping Diagram\'s plot stage), or a pair to add or remove so it becomes a function, so the student reasons about the definition rather than spotting a repeat.',
      teacherReason: 'MathMaster\'s mapping-diagram generator only writes short lists of ordered pairs, so it cannot yet build a built-in Honors extension.',
    }),
    algebra2: Object.freeze({
      status: BLOCKED,
      reason: 'Every version is three or four ordered pairs of whole numbers whose arrows, domain and range the student reads off, and whose function verdict follows from one repeated input or output; the remaining levers are other pairs, which are not rigor.',
      missingCapability: 'A relation given as a graph, a table or a rule to map first (the Mapping Diagram\'s plot stage), or a pair to add or remove so it becomes a function, so the student reasons about the definition rather than spotting a repeat.',
      teacherReason: 'MathMaster\'s mapping-diagram generator only writes short lists of ordered pairs, so it cannot yet build a built-in Honors extension.',
    }),
  }),
  // The Recovery V2 families for the Algebra I District DOL 1 review's Warm-Up
  // Q2–Q4 (questionFamiliesGraphRecognition.mjs, RC01's next shapes): A.3C,
  // A.7A and A.9D, Algebra I content.
  'functions.familySortFromGraphs': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'Every version sorts two lines, a parabola and an exponential growth curve by family in one window; it is a recognition warm-up, and the remaining levers are other curves, which are not rigor.',
      missingCapability: 'Families told apart from a table or an equation as well as a graph, with curves that look alike near the origin, so the student reasons from rates of change rather than from shape alone.',
      teacherReason: 'MathMaster\'s graph-sort generator only draws one curve of each kind, so it cannot yet build a built-in Honors extension.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Telling linear, quadratic and exponential graphs apart')),
  }),
  'quadratics.vertexChoiceFromGraph': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'Every version chooses the vertex of y = ±(x − h)² + k read off its graph, from the vertex, its sign-flipped point and the two x-intercepts; the remaining levers are other parabolas, which are not rigor.',
      missingCapability: 'The vertex typed, a stretched parabola, and the vertex form written from the graph, so the student reads the graph rather than recognizing a choice.',
      teacherReason: 'MathMaster\'s vertex-choice generator only offers the vertex among four points, so it cannot yet build a built-in Honors extension.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Reading the vertex of a graphed parabola')),
  }),
  'exponential.sortGrowthDecay': Object.freeze({
    algebra1: Object.freeze({
      status: BLOCKED,
      reason: 'Every version sorts three growth and three decay curves a·bˣ by direction in one window; the remaining levers are other starts and bases, which are not rigor.',
      missingCapability: 'Growth and decay told from a table, an equation or a situation, with the growth or decay rate named, so the student explains the base rather than the curve\'s direction.',
      teacherReason: 'MathMaster\'s growth-and-decay generator only sorts curves by direction, so it cannot yet build a built-in Honors extension.',
    }),
    algebra2: Object.freeze(ALGEBRA_I_ONLY('Telling exponential growth from decay on a graph')),
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

// Within-course prerequisite edges, and the strength of every dependency.
//
// WHY THIS FILE EXISTS. The TEKS registry's vertical alignment only links a
// standard to the PRIOR COURSE — Algebra I standards point back to grade 8.
// There are no edges between two Algebra I standards, so out of the box the
// graph is flat inside a course: a student weak at solving linear equations
// (A.5A) would still be offered solving systems (A.5C), because nothing
// records that one depends on the other. The adaptive design does not work
// without these edges.
//
// WHAT THIS IS AND IS NOT. Every edge below is a *mathematical* dependency —
// you cannot solve a system without solving a linear equation, you cannot
// solve a quadratic by factoring without factoring. That is a different kind
// of claim from curriculum pacing, which is why pacing is left to an authored
// data file and these are stated here.
//
// STRENGTH, AND WHY IT MATTERS MORE THAN THE EDGE LIST.
// Each edge is hard, soft, or reinforcement (see prerequisiteStrength.js). Only
// hard edges may lock. The audit that introduced strength changed several calls
// that had been marked "required", and each of those is a case worth reading,
// because they are the shape of mistake this whole distinction exists to catch:
//
//   A.10E → A.8A  was hard, now SOFT. A.8A is "solve quadratic equations by
//                 factoring, taking square roots, completing the square, and
//                 applying the quadratic formula". Factoring is ONE of four
//                 methods. Locking A.8A behind factoring denies a student the
//                 three methods that do not need it.
//   A.11B → A.9D  was hard, now SOFT. Graphing exponential growth and decay
//                 does not require the laws of exponents; it is easier with
//                 them.
//   A.10B → A.10F was hard, now SOFT. Recognising a difference of two squares
//                 is pattern recognition that can be taught directly.
//   A2.7I → A2.7A was an outright error: interval notation was recorded as a
//                 prerequisite for adding complex numbers. It is a prerequisite
//                 for describing domain and range (A2.2A), which is where it
//                 now points.
//
// STILL: this is curriculum content authored by a tool, and a teacher should
// review it. It is deliberately small, conservative, and in one file so it can
// be read in a sitting and edited without touching the engine.
//
// Adding a course means adding a key. Nothing else changes.

import { STRENGTH, minimumMasteryFor, normalizeStrength } from './pathPrerequisiteStrength.mjs';

const edge = (from, to, strength) => ({ from, to, strength });
const hard = (from, to) => edge(from, to, STRENGTH.HARD);
const soft = (from, to) => edge(from, to, STRENGTH.SOFT);
const reinforces = (from, to) => edge(from, to, STRENGTH.REINFORCEMENT);

export const COURSE_PREREQUISITE_EDGES = Object.freeze({
  algebra1: [
    // --- Solving ------------------------------------------------------------
    // Inequalities and systems both rest on the one-equation procedure.
    hard('A.5A', 'A.5B'),
    hard('A.5A', 'A.5C'),
    hard('A.5A', 'A.12E'),

    // --- Slope and writing linear relationships -----------------------------
    hard('A.3A', 'A.3B'),
    hard('A.3A', 'A.2B'),
    hard('A.3A', 'A.2C'),
    hard('A.2B', 'A.2E'),
    hard('A.2B', 'A.2F'),
    // Horizontal and vertical lines are a special case of reading slope, not a
    // procedure built on writing point-slope equations.
    soft('A.3A', 'A.2G'),

    // --- Graphing -----------------------------------------------------------
    hard('A.3C', 'A.3D'),
    hard('A.3C', 'A.3F'),
    hard('A.3D', 'A.3H'),
    // Estimating a solution graphically is a reading skill layered on graphing
    // the system, and a student can estimate before they can solve exactly.
    soft('A.3F', 'A.3G'),
    reinforces('A.3E', 'A.7C'),

    // --- Polynomials --------------------------------------------------------
    hard('A.10B', 'A.10E'),
    soft('A.10B', 'A.10F'),
    hard('A.10E', 'A.7B'),
    // See the header: factoring is one of four methods for A.8A.
    soft('A.10E', 'A.8A'),
    soft('A.10D', 'A.10B'),
    reinforces('A.10A', 'A.10B'),

    // --- Quadratics ---------------------------------------------------------
    hard('A.7A', 'A.6B'),
    hard('A.7A', 'A.6C'),
    soft('A.6A', 'A.7A'),
    soft('A.7A', 'A.8B'),

    // --- Exponentials -------------------------------------------------------
    soft('A.11B', 'A.9D'),
    soft('A.11B', 'A.9C'),
    soft('A.9D', 'A.9B'),
    reinforces('A.9A', 'A.9D'),

    // --- Function concept ---------------------------------------------------
    hard('A.12A', 'A.12B'),

    // --- Modelling from data ------------------------------------------------
    // You must be able to write the function you are fitting.
    soft('A.2C', 'A.4C'),
    reinforces('A.4A', 'A.4B'),
  ],

  algebra2: [
    // Authored in the Batch 8 audit. Algebra II had exactly one within-course
    // edge before this, and it was wrong (see the header), so every skill in the
    // course was reachable in any order. Conservative on purpose: hard only
    // where the target procedure literally consumes the source procedure.

    // --- Functions and inverses --------------------------------------------
    hard('A2.2B', 'A2.2C'),
    soft('A2.2B', 'A2.2D'),
    soft('A2.2A', 'A2.2B'),
    soft('A2.7I', 'A2.2A'),

    // --- Systems ------------------------------------------------------------
    // Formulating and solving are separable — a student can be handed a system
    // to solve — so these rank rather than gate.
    soft('A2.3A', 'A2.3B'),
    soft('A2.3A', 'A2.3C'),
    hard('A2.3C', 'A2.3D'),
    soft('A2.3E', 'A2.3F'),
    hard('A2.3F', 'A2.3G'),

    // --- Quadratic and square root -----------------------------------------
    soft('A2.4D', 'A2.4B'),
    hard('A2.4F', 'A2.4G'),
    hard('A2.4F', 'A2.4H'),
    soft('A2.4E', 'A2.4A'),
    reinforces('A2.4C', 'A2.4F'),
    reinforces('A2.7A', 'A2.4F'),

    // --- Exponential and logarithmic ----------------------------------------
    hard('A2.5C', 'A2.5D'),
    hard('A2.5D', 'A2.5E'),
    soft('A2.5A', 'A2.5B'),

    // --- Cubic, absolute value, rational ------------------------------------
    soft('A2.6A', 'A2.6B'),
    soft('A2.6C', 'A2.6D'),
    soft('A2.6D', 'A2.6E'),
    hard('A2.6E', 'A2.6F'),
    soft('A2.6H', 'A2.6I'),
    hard('A2.6I', 'A2.6J'),
    hard('A2.7F', 'A2.6I'),
    soft('A2.6K', 'A2.6I'),
    soft('A2.6G', 'A2.6K'),
    soft('A2.7I', 'A2.6K'),
    reinforces('A2.6L', 'A2.6G'),

    // --- Number and algebraic methods ---------------------------------------
    hard('A2.7B', 'A2.7C'),
    hard('A2.7B', 'A2.7E'),
    hard('A2.7C', 'A2.7D'),
    soft('A2.7E', 'A2.7D'),
    hard('A2.7G', 'A2.7H'),

    // --- Data ---------------------------------------------------------------
    soft('A2.8A', 'A2.8B'),
    hard('A2.8B', 'A2.8C'),
  ],
});

// ---------------------------------------------------------------------------
// The vertical (cross-course) ladder.
// ---------------------------------------------------------------------------
//
// THE AUDIT. `TEXAS_VERTICAL_ALIGNMENT` is a *relatedness* map: A2.2A lists
// seven Algebra I priors, A2.6I lists four, A.9C lists four grade-8 standards.
// It answers "what earlier work does this grow out of", which is the right
// question for reporting and the wrong question for gating. Treating all of it
// as hard meant one weak grade-8 standard could lock a dozen Algebra I skills,
// and every Algebra II student with a rough patch in Algebra I would arrive to
// find the course closed.
//
// So the default for a registry vertical edge is SOFT: it ranks, it explains,
// it suggests where to look — it never locks. Locking across a course boundary
// requires a deliberate claim, listed below and reviewable by a teacher.
//
// Read each entry as: "you genuinely cannot do the target until you can do the
// source." Anything weaker belongs in the default.

export const VERTICAL_DEFAULT_STRENGTH = STRENGTH.SOFT;

const verticalKey = (from, to) => `${from}->${to}`;

export const HARD_VERTICAL_EDGES = Object.freeze([
  // Grade 7 → grade 8
  verticalKey('7.7', '8.5I'),
  verticalKey('7.11A', '8.8C'),

  // Grade 8 → Algebra I
  verticalKey('8.8C', 'A.5A'),
  verticalKey('8.4A', 'A.3A'),
  verticalKey('8.5I', 'A.2B'),
  verticalKey('8.5G', 'A.12A'),

  // Algebra I → Algebra II
  verticalKey('A.5A', 'A2.6E'),
  verticalKey('A.5A', 'A2.6I'),
  verticalKey('A.5B', 'A2.6F'),
  verticalKey('A.5C', 'A2.3B'),
  verticalKey('A.5C', 'A2.3C'),
  verticalKey('A.6B', 'A2.4D'),
  verticalKey('A.8A', 'A2.4F'),
  verticalKey('A.9C', 'A2.5B'),
  verticalKey('A.10B', 'A2.7B'),
  verticalKey('A.10C', 'A2.7C'),
  verticalKey('A.10E', 'A2.7E'),
  verticalKey('A.10F', 'A2.7E'),
  verticalKey('A.11A', 'A2.7G'),
  verticalKey('A.11B', 'A2.7H'),
  verticalKey('A.12B', 'A2.2B'),
]);

const HARD_VERTICAL_SET = new Set(HARD_VERTICAL_EDGES);

/**
 * The strength of a registry vertical-alignment edge. Soft unless a human has
 * claimed otherwise above.
 */
export const getVerticalStrength = (priorCode, code) => (
  HARD_VERTICAL_SET.has(verticalKey(priorCode, code)) ? STRENGTH.HARD : VERTICAL_DEFAULT_STRENGTH
);

/**
 * Edges pointing INTO a standard, i.e. what it depends on. Returned in the
 * prerequisite shape the skill graph uses. `required` is kept as a derived
 * field because it is exactly "may lock", and callers that only need that
 * question should not have to know the vocabulary.
 */
export const getWithinCoursePrerequisites = (courseId, code) => (
  (COURSE_PREREQUISITE_EDGES[courseId] || [])
    .filter((entry) => entry.to === code)
    .map((entry) => {
      const strength = normalizeStrength(entry);
      return {
        code: entry.from,
        strength,
        required: strength === STRENGTH.HARD,
        minimumMastery: minimumMasteryFor(strength),
      };
    })
);

export const getWithinCourseDependents = (courseId, code) => (
  (COURSE_PREREQUISITE_EDGES[courseId] || [])
    .filter((entry) => entry.from === code)
    .map((entry) => entry.to)
);

/**
 * Every authored within-course edge, flattened, for validation and for the
 * teacher-facing graph review screen.
 */
export const listCourseEdges = (courseId) => (COURSE_PREREQUISITE_EDGES[courseId] || []).map((entry) => ({
  ...entry,
  strength: normalizeStrength(entry),
}));

export const listAuthoredCourseIds = () => Object.keys(COURSE_PREREQUISITE_EDGES);

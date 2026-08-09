// Within-course prerequisite edges.
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
// STILL: this is curriculum content authored by a tool, and a teacher should
// review it. It is deliberately small, conservative, and in one file so it can
// be read in a sitting and edited without touching the engine. Edges marked
// `required: false` influence ranking but never lock a skill.
//
// Adding a course means adding a key. Nothing else changes.

const required = (from, to) => ({ from, to, required: true });
const supportive = (from, to) => ({ from, to, required: false });

export const COURSE_PREREQUISITE_EDGES = Object.freeze({
  algebra1: [
    // Solving. Inequalities and systems both rest on solving one equation.
    required('A.5A', 'A.5B'),
    required('A.5A', 'A.5C'),
    required('A.5A', 'A.12E'),

    // Slope underpins writing and interpreting linear relationships.
    required('A.3A', 'A.3B'),
    required('A.3A', 'A.2B'),
    required('A.3A', 'A.2C'),
    required('A.2B', 'A.2E'),
    required('A.2B', 'A.2F'),

    // Graphing lines before graphing regions and systems of them.
    required('A.3C', 'A.3D'),
    required('A.3C', 'A.3F'),
    required('A.3D', 'A.3H'),
    supportive('A.3F', 'A.3G'),

    // Polynomials: multiply before factor, factor before solving by factoring.
    required('A.10B', 'A.10E'),
    required('A.10B', 'A.10F'),
    required('A.10E', 'A.8A'),
    required('A.10E', 'A.7B'),
    supportive('A.10D', 'A.10B'),

    // Quadratics: read a graph's key attributes before writing one from them.
    required('A.7A', 'A.6B'),
    required('A.7A', 'A.6C'),
    supportive('A.6A', 'A.7A'),

    // Exponentials rest on exponent laws.
    required('A.11B', 'A.9D'),
    supportive('A.11B', 'A.9C'),
    supportive('A.9D', 'A.9B'),

    // Function concept before function notation.
    required('A.12A', 'A.12B'),

    // Modelling from data assumes you can write the function being fitted.
    supportive('A.2C', 'A.4C'),
    supportive('A.7A', 'A.8B'),
  ],
  algebra2: [
    // Kept intentionally sparse until an Algebra II teacher reviews it; the
    // cross-course edges from Algebra I already carry most of the weight.
    supportive('A2.7I', 'A2.7A'),
  ],
});

/**
 * Edges pointing INTO a standard, i.e. what it depends on. Returned in the
 * prerequisite shape the skill graph uses.
 */
export const getWithinCoursePrerequisites = (courseId, code) => (
  (COURSE_PREREQUISITE_EDGES[courseId] || [])
    .filter((edge) => edge.to === code)
    .map((edge) => ({ code: edge.from, required: edge.required }))
);

export const getWithinCourseDependents = (courseId, code) => (
  (COURSE_PREREQUISITE_EDGES[courseId] || [])
    .filter((edge) => edge.from === code)
    .map((edge) => edge.to)
);

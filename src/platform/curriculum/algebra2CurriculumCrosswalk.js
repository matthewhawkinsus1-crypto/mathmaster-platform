// Algebra II skill -> district curriculum node.
//
// Same responsibilities split as Algebra I: texasStandards.js says what a
// standard means, this says where it belongs instructionally, the calendar says
// when that node occurs.
//
// Algebra II is the harder case and it is what forced the calendar layer to
// grow up. Its year is not Module 1..5: it opens with four locally named Units,
// then moves into Bluebonnet Modules 3-5, and Modules 3, 4 and 5 each recur in
// a second window. Two consequences the mapping has to respect:
//
//   A revisit must never relock. A student who learned logarithms in December
//   keeps that access in February; the March window raises relevance, it does
//   not close the door.
//
//   Function-family exposure is not mastery access. A2.2A analyses the parent
//   graphs of every family in August. That must not open rational-equation
//   solving in September — those skills keep their own later homes, and A2.2A
//   merely reinforces there.

export const ALGEBRA_II_CURRICULUM_CROSSWALK = Object.freeze({
  // --- Unit 1: Foundations of Functions -------------------------------------
  'A2.2A': { primaryCurriculumId: 'alg2.u1.t1', reinforcementCurriculumIds: ['alg2.u2.t1', 'alg2.m3', 'alg2.m4', 'alg2.m5'] },
  'A2.7I': { primaryCurriculumId: 'alg2.u1.t1', reinforcementCurriculumIds: ['alg2.m3', 'alg2.m4', 'alg2.m5'] },
  'A2.2B': { primaryCurriculumId: 'alg2.u1.t2', reinforcementCurriculumIds: ['alg2.m3'] },
  'A2.2C': { primaryCurriculumId: 'alg2.u1.t2', reinforcementCurriculumIds: ['alg2.m3', 'alg2.m5'] },
  'A2.2D': { primaryCurriculumId: 'alg2.u1.t2', reinforcementCurriculumIds: ['alg2.m3'] },

  // --- Unit 2: Absolute Value -----------------------------------------------
  'A2.6C': { primaryCurriculumId: 'alg2.u2.t1' },
  'A2.6D': { primaryCurriculumId: 'alg2.u2.t2' },
  'A2.6E': { primaryCurriculumId: 'alg2.u2.t2' },
  'A2.6F': { primaryCurriculumId: 'alg2.u2.t2' },

  // --- Unit 3: Systems ------------------------------------------------------
  'A2.3A': { primaryCurriculumId: 'alg2.u3' },
  'A2.3B': { primaryCurriculumId: 'alg2.u3' },
  'A2.3C': { primaryCurriculumId: 'alg2.u3' },
  'A2.3D': { primaryCurriculumId: 'alg2.u3' },
  'A2.3E': { primaryCurriculumId: 'alg2.u3' },
  'A2.3F': { primaryCurriculumId: 'alg2.u3' },
  'A2.3G': { primaryCurriculumId: 'alg2.u3' },

  // --- Unit 4: Expressions, Factoring, Rational Exponents -------------------
  'A2.7A': { primaryCurriculumId: 'alg2.u4' },
  'A2.7B': { primaryCurriculumId: 'alg2.u4', reinforcementCurriculumIds: ['alg2.m3'] },
  'A2.7C': { primaryCurriculumId: 'alg2.u4', reinforcementCurriculumIds: ['alg2.m3'] },
  'A2.7D': { primaryCurriculumId: 'alg2.u4', reinforcementCurriculumIds: ['alg2.m3'] },
  'A2.7E': { primaryCurriculumId: 'alg2.u4', reinforcementCurriculumIds: ['alg2.m3'] },
  'A2.7G': { primaryCurriculumId: 'alg2.u4', reinforcementCurriculumIds: ['alg2.m4'] },
  'A2.7H': { primaryCurriculumId: 'alg2.u4', reinforcementCurriculumIds: ['alg2.m4'] },

  // --- Module 2: Exploring Quadratic Functions ------------------------------
  // The node exists and is mapped; the calendar has no first-teach window for
  // it, which surfaces as UNSCHEDULED rather than as an invented date.
  'A2.4A': { primaryCurriculumId: 'alg2.m2' },
  'A2.4B': { primaryCurriculumId: 'alg2.m2' },
  'A2.4D': { primaryCurriculumId: 'alg2.m2' },
  // These two span quadratic AND square-root work, so the radical half
  // resurfaces with Module 4.
  'A2.4E': { primaryCurriculumId: 'alg2.m2', reinforcementCurriculumIds: ['alg2.m4'] },
  'A2.4F': { primaryCurriculumId: 'alg2.m2', reinforcementCurriculumIds: ['alg2.m4'] },
  'A2.4H': { primaryCurriculumId: 'alg2.m2' },

  // --- Module 3: Analyzing Structure ----------------------------------------
  'A2.6A': { primaryCurriculumId: 'alg2.m3' },
  'A2.6B': { primaryCurriculumId: 'alg2.m3' },

  // --- Module 4: Extending Beyond Polynomials -------------------------------
  'A2.4C': { primaryCurriculumId: 'alg2.m4' },
  'A2.4G': { primaryCurriculumId: 'alg2.m4' },
  'A2.6G': { primaryCurriculumId: 'alg2.m4' },
  'A2.6H': { primaryCurriculumId: 'alg2.m4' },
  'A2.6I': { primaryCurriculumId: 'alg2.m4' },
  'A2.6J': { primaryCurriculumId: 'alg2.m4' },
  'A2.6K': { primaryCurriculumId: 'alg2.m4' },
  'A2.6L': { primaryCurriculumId: 'alg2.m4' },
  'A2.7F': { primaryCurriculumId: 'alg2.m4' },

  // --- Module 5: Exponentials and Logarithms --------------------------------
  'A2.5A': { primaryCurriculumId: 'alg2.m5' },
  'A2.5B': { primaryCurriculumId: 'alg2.m5' },
  'A2.5C': { primaryCurriculumId: 'alg2.m5' },
  'A2.5D': { primaryCurriculumId: 'alg2.m5' },
  'A2.5E': { primaryCurriculumId: 'alg2.m5' },

  // --- Embedded: data modelling across families -----------------------------
  // Deliberately not forced into one family. `alg2.modeling` is an embedded
  // node with no dates, so these are always in scope rather than gated.
  'A2.8A': { primaryCurriculumId: 'alg2.modeling', reinforcementCurriculumIds: ['alg2.m2', 'alg2.m5'] },
  'A2.8B': { primaryCurriculumId: 'alg2.modeling', reinforcementCurriculumIds: ['alg2.m2', 'alg2.m5'] },
  'A2.8C': { primaryCurriculumId: 'alg2.modeling', reinforcementCurriculumIds: ['alg2.m2', 'alg2.m5'] },
});

export const isAlgebraIICoursewideStandard = (code) => /^A2\.1[A-G]$/.test(String(code || ''));

export const ALGEBRA_II_CROSSWALK_CODES = Object.freeze(Object.keys(ALGEBRA_II_CURRICULUM_CROSSWALK));

export const buildAlgebraIISkillCurriculumLinks = (toSkillId) => Object.fromEntries(
  Object.entries(ALGEBRA_II_CURRICULUM_CROSSWALK)
    .map(([code, entry]) => [toSkillId(code), entry.primaryCurriculumId]),
);

export const buildAlgebraIIReinforcementLinks = (toSkillId) => Object.fromEntries(
  Object.entries(ALGEBRA_II_CURRICULUM_CROSSWALK)
    .filter(([, entry]) => (entry.reinforcementCurriculumIds || []).length)
    .map(([code, entry]) => [toSkillId(code), entry.reinforcementCurriculumIds]),
);

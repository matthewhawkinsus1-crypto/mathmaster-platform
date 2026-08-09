// Algebra I skill -> Bluebonnet curriculum node.
//
// This answers "where does this TEKS live instructionally?", which is a
// different question from "what is this TEKS?" — that stays in
// texasStandards.js. Keeping them apart is what lets 2027-28 arrive as a new
// calendar without touching a single skill definition:
//
//   TEKS -> crosswalk -> curriculum node -> calendar -> future/upcoming/current/review
//
// PRIMARY HOME vs REINFORCEMENT. A TEKS is often useful in several modules,
// but its calendar gate must come from exactly one. Copying the gate into every
// module where a skill is *used* would relock it: function notation introduced
// in Module 1 and used all year would go back to "future" every time a later
// module reopened. So `primaryCurriculumId` gates, and
// `reinforcementCurriculumIds` only adds relevance when that module comes
// round again. Reinforcement never gates.
//
// The mapping follows the district's own module organisation rather than TEKS
// strand numbers — A.5A is strand 5 but its content is linear equation solving,
// so its home is Module 3; A.10E is strand 10 but factoring belongs to the
// Module 5 quadratic work.

export const ALGEBRA_I_CURRICULUM_CROSSWALK = Object.freeze({
  // --- Module 1: Searching for Patterns -------------------------------------
  'A.12A': { primaryCurriculumId: 'alg1.m1.t1' },
  'A.12B': { primaryCurriculumId: 'alg1.m1.t1' },
  // Literal relationships are foundational to reasoning about quantities, so
  // they open in Module 1 and are reinforced when Module 3 rearranges them.
  'A.12E': { primaryCurriculumId: 'alg1.m1.t1', reinforcementCurriculumIds: ['alg1.m3.t1'] },
  // Geometric sequences are a discrete route into growth and decay, but their
  // instructional home stays at the start of the year.
  'A.12C': { primaryCurriculumId: 'alg1.m1.t2', reinforcementCurriculumIds: ['alg1.m4.t1'] },
  'A.12D': { primaryCurriculumId: 'alg1.m1.t2', reinforcementCurriculumIds: ['alg1.m4.t1'] },

  // --- Module 2: Exploring Constant Rate of Change --------------------------
  'A.2A': { primaryCurriculumId: 'alg1.m2.t1' },
  'A.2B': { primaryCurriculumId: 'alg1.m2.t1', reinforcementCurriculumIds: ['alg1.m3.t1'] },
  'A.2C': { primaryCurriculumId: 'alg1.m2.t1', reinforcementCurriculumIds: ['alg1.m3.t1'] },
  'A.2D': { primaryCurriculumId: 'alg1.m2.t1' },
  'A.2G': { primaryCurriculumId: 'alg1.m2.t1' },
  'A.3A': { primaryCurriculumId: 'alg1.m2.t1' },
  'A.3B': { primaryCurriculumId: 'alg1.m2.t1' },
  'A.3C': { primaryCurriculumId: 'alg1.m2.t1' },
  'A.2E': { primaryCurriculumId: 'alg1.m2.t2' },
  'A.2F': { primaryCurriculumId: 'alg1.m2.t2' },
  'A.3E': { primaryCurriculumId: 'alg1.m2.t2' },
  'A.4A': { primaryCurriculumId: 'alg1.m2.t2' },
  'A.4B': { primaryCurriculumId: 'alg1.m2.t2' },
  'A.4C': { primaryCurriculumId: 'alg1.m2.t2' },

  // --- Module 3: Modeling Linear Equations and Inequalities -----------------
  'A.2H': { primaryCurriculumId: 'alg1.m3.t1' },
  'A.3D': { primaryCurriculumId: 'alg1.m3.t1' },
  'A.5A': { primaryCurriculumId: 'alg1.m3.t1' },
  'A.5B': { primaryCurriculumId: 'alg1.m3.t1' },
  'A.2I': { primaryCurriculumId: 'alg1.m3.t2' },
  'A.3F': { primaryCurriculumId: 'alg1.m3.t2' },
  'A.3G': { primaryCurriculumId: 'alg1.m3.t2' },
  'A.3H': { primaryCurriculumId: 'alg1.m3.t2' },
  'A.5C': { primaryCurriculumId: 'alg1.m3.t2' },

  // --- Module 4: Investigating Growth and Decay -----------------------------
  'A.9A': { primaryCurriculumId: 'alg1.m4.t1' },
  'A.9B': { primaryCurriculumId: 'alg1.m4.t1' },
  'A.9D': { primaryCurriculumId: 'alg1.m4.t1' },
  'A.9C': { primaryCurriculumId: 'alg1.m4.t2' },
  'A.9E': { primaryCurriculumId: 'alg1.m4.t2' },
  // Exponent laws are placed with exponential reasoning as their pacing home.
  // Earlier classroom use is unaffected: this controls the normal path-opening
  // window, not every appearance of the skill.
  'A.11B': { primaryCurriculumId: 'alg1.m4.t2' },

  // --- Module 5: Maximizing and Minimizing ----------------------------------
  'A.6A': { primaryCurriculumId: 'alg1.m5.t1' },
  'A.6B': { primaryCurriculumId: 'alg1.m5.t1' },
  'A.6C': { primaryCurriculumId: 'alg1.m5.t1' },
  'A.7A': { primaryCurriculumId: 'alg1.m5.t1' },
  'A.7C': { primaryCurriculumId: 'alg1.m5.t1' },
  'A.8B': { primaryCurriculumId: 'alg1.m5.t1' },
  'A.10A': { primaryCurriculumId: 'alg1.m5.t1' },
  'A.10B': { primaryCurriculumId: 'alg1.m5.t1' },
  'A.10C': { primaryCurriculumId: 'alg1.m5.t1' },
  'A.10D': { primaryCurriculumId: 'alg1.m5.t1' },
  'A.7B': { primaryCurriculumId: 'alg1.m5.t2' },
  'A.8A': { primaryCurriculumId: 'alg1.m5.t2' },
  'A.10E': { primaryCurriculumId: 'alg1.m5.t2' },
  'A.10F': { primaryCurriculumId: 'alg1.m5.t2' },
  'A.11A': { primaryCurriculumId: 'alg1.m5.t2' },
});

// The seven mathematical-process standards run through the whole course. They
// are never date-gated: "A.1D is locked until Module 3" would be absurd.
export const COURSEWIDE_SCOPE = 'coursewide';

export const isCoursewideStandard = (code) => /^A\.1[A-G]$/.test(String(code || ''));

export const getCurriculumLink = (code) => {
  const normalized = String(code || '').toUpperCase();
  if (isCoursewideStandard(normalized)) {
    return { primaryCurriculumId: null, curriculumScope: COURSEWIDE_SCOPE, reinforcementCurriculumIds: [] };
  }
  const entry = ALGEBRA_I_CURRICULUM_CROSSWALK[normalized];
  if (!entry) return null;
  return {
    primaryCurriculumId: entry.primaryCurriculumId,
    reinforcementCurriculumIds: entry.reinforcementCurriculumIds || [],
    curriculumScope: 'module',
  };
};

/**
 * skillId -> curriculumId, in the shape the calendar provider consumes.
 * `toSkillId` keeps this file free of any dependency on how skill ids are
 * spelled, so a future sub-skill scheme changes one caller rather than this.
 */
export const buildSkillCurriculumLinks = (toSkillId) => Object.fromEntries(
  Object.entries(ALGEBRA_I_CURRICULUM_CROSSWALK)
    .map(([code, entry]) => [toSkillId(code), entry.primaryCurriculumId]),
);

export const buildReinforcementLinks = (toSkillId) => Object.fromEntries(
  Object.entries(ALGEBRA_I_CURRICULUM_CROSSWALK)
    .filter(([, entry]) => (entry.reinforcementCurriculumIds || []).length)
    .map(([code, entry]) => [toSkillId(code), entry.reinforcementCurriculumIds]),
);

export const CROSSWALK_CODES = Object.freeze(Object.keys(ALGEBRA_I_CURRICULUM_CROSSWALK));

// The skill graph: what a student could learn, and what each thing depends on.
//
// The specification calls for skills finer-grained than a TEKS code — "solve
// exponential equations" rather than "exponential functions". MathMaster does
// not have that content authored yet, and inventing 272 sub-skill breakdowns
// would be fabricating curriculum. So this layer is built to hold fine-grained
// skills from day one, and is *seeded* from the TEKS registry plus its existing
// vertical alignment, which is a real prerequisite graph across courses.
//
// A skill therefore has a stable `skillId`. Today one TEKS code produces one
// skill (`teks:A.5A`); when sub-skills are authored they slot in beside it as
// `alg1.equations.multi-step` with the TEKS code kept as an alignment, and
// nothing downstream changes — the engine only ever reasons about skillIds and
// prerequisite edges.
//
// Deliberately NOT stored here: student mastery, teacher overrides, class
// pacing position. Those are separate sources of truth (see §30 of the brief),
// because a teacher's local decision must never mutate the global graph.

import {
  ALL_TEXAS_MATH_STANDARDS,
  getTexasStandard,
  getTexasVerticalAlignment,
  normalizeTeksCode,
} from '../../texasStandards.js';
import {
  getVerticalStrength,
  getWithinCourseDependents,
  getWithinCoursePrerequisites,
} from './coursePrerequisites.js';
import { STRENGTH, canLock, minimumMasteryFor, normalizeStrength } from './prerequisiteStrength.js';

export const TEKS_SKILL_PREFIX = 'teks:';

export const teksSkillId = (code) => `${TEKS_SKILL_PREFIX}${normalizeTeksCode(code)}`;
export const isTeksSkillId = (skillId) => String(skillId || '').startsWith(TEKS_SKILL_PREFIX);
export const teksCodeFromSkillId = (skillId) => (
  isTeksSkillId(skillId) ? String(skillId).slice(TEKS_SKILL_PREFIX.length) : null
);

// How much of a prerequisite a student needs before the dependent skill is
// mathematically reachable. Expressed on the same 0-1 scale the mastery store
// uses so nothing has to convert between percentages and fractions.
export const DEFAULT_REQUIRED_MASTERY = minimumMasteryFor(STRENGTH.HARD);
export const DEFAULT_SUPPORTIVE_MASTERY = minimumMasteryFor(STRENGTH.SOFT);

// `required` is derived, never authored: it means "this edge may lock", which
// is true of hard edges and of nothing else. Keeping it on the object lets
// older callers keep asking the boolean question without being able to create a
// locking edge by accident.
const prerequisite = (skillId, { strength = STRENGTH.HARD, minimumMastery } = {}) => {
  const resolved = normalizeStrength(strength);
  return {
    skillId,
    strength: resolved,
    required: resolved === STRENGTH.HARD,
    minimumMastery: minimumMastery ?? minimumMasteryFor(resolved),
  };
};

/**
 * Build the graph for a course. Process standards (the "mathematical process"
 * strand) are deliberately excluded as path targets: they are ways of working
 * that run through every skill, not destinations a student is routed to.
 */
export const buildSkillGraphForCourse = (courseId) => {
  const standards = ALL_TEXAS_MATH_STANDARDS.filter((standard) => standard.courseId === courseId);
  return standards
    .filter((standard) => standard.classification !== 'process')
    .map((standard) => {
      const alignment = getTexasVerticalAlignment(standard.code);
      return {
        skillId: teksSkillId(standard.code),
        courseId: standard.courseId,
        title: standard.description,
        domain: standard.strandLabel || null,
        classification: standard.classification,
        reportingCategory: standard.reportingCategory ?? null,
        standards: {
          teks: [standard.code],
          // The exam frameworks already crosswalk from TEKS elsewhere; they are
          // reporting dimensions, not routing inputs, so they stay empty here
          // rather than being duplicated into the graph.
          sat: [], act: [], asvab: [],
        },
        // Two sources, both real dependencies. The TEKS registry supplies
        // prior-COURSE links; coursePrerequisites.js supplies the within-course
        // ones the registry has never carried, without which the graph is flat
        // inside a course and no Algebra I skill can gate another.
        //
        // The registry's links are a relatedness map, not a gating map, so they
        // arrive SOFT unless the vertical audit has explicitly promoted one.
        // Otherwise a single weak grade-8 standard closes half of Algebra I.
        prerequisites: [
          ...alignment.prior.map((prior) => prerequisite(teksSkillId(prior.code), {
            strength: getVerticalStrength(prior.code, standard.code),
          })),
          ...getWithinCoursePrerequisites(standard.courseId, standard.code)
            .map((entry) => prerequisite(teksSkillId(entry.code), { strength: entry.strength })),
        ],
        // Kept so acceleration can look forward without re-deriving it.
        leadsTo: [
          ...alignment.next.map((next) => teksSkillId(next.code)),
          ...getWithinCourseDependents(standard.courseId, standard.code).map(teksSkillId),
        ],
        adaptivePolicy: {
          previewAllowed: false,
          accelerationAllowed: true,
        },
      };
    });
};

const GRAPH_CACHE = new Map();

export const getSkillGraph = (courseId) => {
  if (!courseId) return [];
  if (!GRAPH_CACHE.has(courseId)) GRAPH_CACHE.set(courseId, buildSkillGraphForCourse(courseId));
  return GRAPH_CACHE.get(courseId);
};

export const getSkill = (courseId, skillId) => getSkillGraph(courseId).find((skill) => skill.skillId === skillId) || null;

/**
 * Resolve a skill from anywhere in the registry, not only the current course.
 * Prerequisites routinely point at a prior course, and a student's remediation
 * target is frequently a grade-8 standard while they sit in Algebra I.
 */
export const resolveSkillAnywhere = (skillId) => {
  const code = teksCodeFromSkillId(skillId);
  if (!code) return null;
  const standard = getTexasStandard(code);
  if (!standard) return null;
  const [skill] = getSkillGraph(standard.courseId).filter((item) => item.skillId === skillId);
  return skill || null;
};

/**
 * The prerequisites that can actually close a door, in the order they are
 * authored. Every "why is this locked?" answer starts here.
 */
export const hardPrerequisitesOf = (skill) => (skill?.prerequisites || [])
  .filter((entry) => canLock(entry.strength));

export const prerequisitesByStrength = (skill, strength) => (skill?.prerequisites || [])
  .filter((entry) => entry.strength === strength);

/**
 * Skills inside a course that name `skillId` as a prerequisite. Used to answer
 * what a remediation excursion actually affects — and, just as importantly,
 * what it does not.
 */
export const getDependentSkills = (courseId, skillId, { strength = null } = {}) => (
  getSkillGraph(courseId).filter((skill) => (skill.prerequisites || []).some((entry) => (
    entry.skillId === skillId && (!strength || entry.strength === strength)
  )))
);

export const describeSkill = (skillId) => {
  const code = teksCodeFromSkillId(skillId);
  const standard = code ? getTexasStandard(code) : null;
  if (!standard) return { skillId, label: skillId, code: null, courseId: null };
  return {
    skillId,
    code: standard.code,
    courseId: standard.courseId,
    label: `${standard.code} — ${standard.description}`,
    shortLabel: standard.code,
  };
};

// Graph validation.
//
// The prerequisite graph is authored curriculum data, and authored data drifts.
// A typo turns into a skill nobody can reach; a well-meaning "this really is
// required" turns into a cycle; a process standard slips in as a gate and every
// student is locked behind "apply mathematics to problems arising in everyday
// life", which is not a thing anybody masters on a date.
//
// These checks run in the test suite, so a bad edge fails before it ships
// rather than after a student hits it.

import { ALL_TEXAS_MATH_STANDARDS, getTexasStandard, normalizeTeksCode } from '../../texasStandards.js';
import {
  HARD_VERTICAL_EDGES,
  listAuthoredCourseIds,
  listCourseEdges,
} from './coursePrerequisites.js';
import { getSkillGraph, hardPrerequisitesOf, teksCodeFromSkillId } from './skillGraph.js';
import { STRENGTH, isStrength } from './prerequisiteStrength.js';
import { MAX_DESCENT_DEPTH, planRemediation } from './remediationPlan.js';

export const SEVERITY = Object.freeze({ ERROR: 'error', WARNING: 'warning' });

// Above this many hard prerequisites a skill is effectively unreachable: every
// one of them is another way for the door to stay shut. It is a warning, not an
// error, because a legitimately deep skill can exist — but it should be looked at.
export const HARD_FAN_IN_WARNING = 4;

const issue = (severity, code, message, detail = {}) => ({ severity, code, message, ...detail });

/**
 * Structural checks on the authored within-course edge lists, before they are
 * ever turned into a graph.
 */
export const validateAuthoredEdges = (courseId) => {
  const issues = [];
  const seen = new Set();

  listCourseEdges(courseId).forEach((edge) => {
    const key = `${edge.from}->${edge.to}`;

    if (!isStrength(edge.strength)) {
      issues.push(issue(SEVERITY.ERROR, 'invalid_strength', `${key} has strength "${edge.strength}", which is not hard/soft/reinforcement.`, { edge: key }));
    }
    if (edge.from === edge.to) {
      issues.push(issue(SEVERITY.ERROR, 'self_edge', `${key} makes a skill its own prerequisite.`, { edge: key }));
    }
    if (seen.has(key)) {
      issues.push(issue(SEVERITY.ERROR, 'duplicate_edge', `${key} is listed more than once.`, { edge: key }));
    }
    seen.add(key);

    [edge.from, edge.to].forEach((code) => {
      const standard = getTexasStandard(code);
      if (!standard) {
        issues.push(issue(SEVERITY.ERROR, 'unknown_standard', `${key} references ${code}, which is not in the TEKS registry.`, { edge: key, code }));
        return;
      }
      if (standard.courseId !== courseId) {
        issues.push(issue(SEVERITY.ERROR, 'cross_course_edge', `${key} is listed under ${courseId} but ${code} belongs to ${standard.courseId}. Cross-course links belong in the vertical ladder.`, { edge: key, code }));
      }
      // The rule the brief calls out by name: a process standard is a way of
      // working, not a destination, and must never gate access to content.
      if (standard.classification === 'process' && edge.strength === STRENGTH.HARD) {
        issues.push(issue(SEVERITY.ERROR, 'process_standard_gate', `${key} makes the process standard ${code} a hard prerequisite.`, { edge: key, code }));
      }
    });
  });

  return issues;
};

/**
 * The curated hard vertical promotions must correspond to real registry links.
 * A promotion for an edge that does not exist is silently doing nothing, which
 * is worse than being wrong out loud.
 */
export const validateVerticalOverrides = () => {
  const issues = [];
  HARD_VERTICAL_EDGES.forEach((key) => {
    const [from, to] = key.split('->');
    const target = getTexasStandard(to);
    const source = getTexasStandard(from);
    if (!source || !target) {
      issues.push(issue(SEVERITY.ERROR, 'unknown_standard', `Hard vertical override ${key} references a standard that is not in the registry.`, { edge: key }));
      return;
    }
    const priors = (target.courseId ? getSkillGraph(target.courseId) : [])
      .find((skill) => teksCodeFromSkillId(skill.skillId) === normalizeTeksCode(to));
    const hasEdge = Boolean(priors) && (priors.prerequisites || [])
      .some((entry) => teksCodeFromSkillId(entry.skillId) === normalizeTeksCode(from));
    if (!hasEdge) {
      issues.push(issue(SEVERITY.ERROR, 'orphan_vertical_override', `Hard vertical override ${key} does not match any registry vertical-alignment edge, so it has no effect.`, { edge: key }));
    }
    if (source.classification === 'process') {
      issues.push(issue(SEVERITY.ERROR, 'process_standard_gate', `Hard vertical override ${key} gates on the process standard ${from}.`, { edge: key }));
    }
  });
  return issues;
};

/**
 * Cycle detection over HARD edges only. A soft cycle is harmless — soft edges
 * rank, and ranking cannot deadlock. A hard cycle means two skills each wait
 * for the other forever.
 */
export const findHardCycles = (courseId) => {
  const graph = getSkillGraph(courseId);
  const bySkill = new Map(graph.map((skill) => [skill.skillId, skill]));
  const state = new Map();
  const cycles = [];

  const visit = (skillId, stack) => {
    if (state.get(skillId) === 'done') return;
    if (state.get(skillId) === 'open') {
      const start = stack.indexOf(skillId);
      cycles.push([...stack.slice(start), skillId]);
      return;
    }
    const skill = bySkill.get(skillId);
    if (!skill) return;
    state.set(skillId, 'open');
    hardPrerequisitesOf(skill).forEach((entry) => visit(entry.skillId, [...stack, skillId]));
    state.set(skillId, 'done');
  };

  graph.forEach((skill) => visit(skill.skillId, []));
  return cycles;
};

/**
 * Remediation must terminate for every skill in the course, from any state.
 * The hostile case is "every prerequisite looks weak", which is exactly what a
 * student at the bottom of a bad week looks like.
 */
export const validateRemediationTermination = (courseId) => {
  const issues = [];
  const graph = getSkillGraph(courseId);
  // Everything, everywhere, at zero. If a plan can loop, it loops here.
  const allWeak = {};
  ALL_TEXAS_MATH_STANDARDS.forEach((standard) => {
    allWeak[`teks:${standard.code}`] = { mastery: 0.1, attempts: 8, recentAccuracy: 0.1, evidenceStrength: 1 };
  });

  graph.forEach((skill) => {
    const plan = planRemediation({ courseId, skillId: skill.skillId, masteryBySkill: allWeak });
    if (plan.depth > MAX_DESCENT_DEPTH) {
      issues.push(issue(SEVERITY.ERROR, 'remediation_too_deep', `Remediation from ${skill.skillId} descended ${plan.depth} levels.`, { skillId: skill.skillId }));
    }
    const unique = new Set(plan.path);
    if (unique.size !== plan.path.length) {
      issues.push(issue(SEVERITY.ERROR, 'remediation_loop', `Remediation from ${skill.skillId} revisited a skill: ${plan.path.join(' → ')}.`, { skillId: skill.skillId }));
    }
    if (plan.targetSkillId === skill.skillId && plan.action !== 'reteach_in_place') {
      issues.push(issue(SEVERITY.ERROR, 'remediation_self_target', `Remediation from ${skill.skillId} targeted itself without reteaching.`, { skillId: skill.skillId }));
    }
  });

  return issues;
};

/**
 * Skills nobody can open because too much has to be true first.
 */
export const validateFanIn = (courseId) => getSkillGraph(courseId)
  .filter((skill) => hardPrerequisitesOf(skill).length > HARD_FAN_IN_WARNING)
  .map((skill) => issue(
    SEVERITY.WARNING,
    'excessive_hard_prerequisites',
    `${skill.skillId} has ${hardPrerequisitesOf(skill).length} hard prerequisites; each one is another way for it to stay closed.`,
    { skillId: skill.skillId },
  ));

export const validateCourseGraph = (courseId) => {
  const issues = [
    ...validateAuthoredEdges(courseId),
    ...findHardCycles(courseId).map((cycle) => issue(SEVERITY.ERROR, 'hard_cycle', `Circular hard dependency: ${cycle.join(' → ')}.`, { cycle })),
    ...validateRemediationTermination(courseId),
    ...validateFanIn(courseId),
  ];
  return {
    courseId,
    issues,
    errors: issues.filter((entry) => entry.severity === SEVERITY.ERROR),
    warnings: issues.filter((entry) => entry.severity === SEVERITY.WARNING),
    ok: issues.every((entry) => entry.severity !== SEVERITY.ERROR),
  };
};

export const validateAllGraphs = () => {
  const courses = listAuthoredCourseIds().map(validateCourseGraph);
  const verticalIssues = validateVerticalOverrides();
  const errors = [...courses.flatMap((result) => result.errors), ...verticalIssues.filter((entry) => entry.severity === SEVERITY.ERROR)];
  return {
    courses,
    vertical: verticalIssues,
    errors,
    ok: errors.length === 0,
  };
};

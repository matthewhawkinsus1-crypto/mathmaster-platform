// Diagnose before you descend.
//
// THE FAILURE MODE THIS PREVENTS. A student misses three questions on solving
// quadratics. The naive response is to walk the prerequisite chain to its
// deepest ancestor and start them on grade-7 rational-number arithmetic. That is
// the behaviour every adaptive system is accused of, and it is wrong twice over:
//
//   1. It assumes the cause. The student may factor perfectly well and simply
//      not know the quadratic formula. Nothing in the evidence said otherwise —
//      there was no evidence about factoring at all.
//   2. It is demoralising and slow. Six weeks of descent to fix a forty-minute
//      gap.
//
// So descent requires evidence, at every step:
//
//   evidence says the prerequisite is weak   → DESCEND (this is a real gap)
//   there is no evidence about it            → DIAGNOSE (find out first)
//   evidence says the prerequisites are fine → RETEACH IN PLACE (the gap is
//                                              here, not underneath)
//
// And descent is bounded. A depth limit plus a visited set means the plan
// always terminates, which is the guardrail against a student circling inside
// remediation forever.

import {
  describeSkill,
  getDependentSkills,
  getSkillGraph,
  hardPrerequisitesOf,
  resolveSkillAnywhere,
} from './skillGraph.js';
import { SEVERE_GAP_MASTERY } from './recommendationEngine.js';
import { STRENGTH } from './prerequisiteStrength.js';

export const REMEDIATION_ACTION = Object.freeze({
  NONE: 'none',
  RETEACH_IN_PLACE: 'reteach_in_place',
  DIAGNOSE: 'diagnose_prerequisite',
  DESCEND: 'descend_to_prerequisite',
});

// Three levels is already a long way down — Algebra II → Algebra I → grade 8.
// Past that a teacher should be involved, not an algorithm.
export const MAX_DESCENT_DEPTH = 3;

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const masteryOf = (masteryBySkill, skillId) => {
  const entry = masteryBySkill?.[skillId];
  if (entry == null) return null;
  if (typeof entry === 'number') return { mastery: clamp01(entry), attempts: 0 };
  return { mastery: clamp01(entry.mastery), attempts: Math.max(0, Number(entry.attempts) || 0) };
};

const skillFor = (courseId, skillId) => (
  getSkillGraph(courseId).find((skill) => skill.skillId === skillId) || resolveSkillAnywhere(skillId)
);

/**
 * Sort the hard prerequisites of one skill into what the evidence actually
 * says about them. `unknown` is the important bucket: it is not a gap, and
 * treating it as one is the bug.
 */
export const classifyPrerequisiteEvidence = (skill, masteryBySkill) => {
  const weak = [];
  const unknown = [];
  const solid = [];
  hardPrerequisitesOf(skill).forEach((entry) => {
    const state = masteryOf(masteryBySkill, entry.skillId);
    if (!state) { unknown.push({ ...entry, mastery: null }); return; }
    if (state.mastery < entry.minimumMastery) weak.push({ ...entry, mastery: state.mastery });
    else solid.push({ ...entry, mastery: state.mastery });
  });
  weak.sort((a, b) => a.mastery - b.mastery);
  return { weak, unknown, solid };
};

/**
 * Where a struggling student should actually go, and why.
 *
 * Returns one action, one target, and the trail of skills that were examined to
 * get there — so "why did MathMaster send me here" has a literal answer rather
 * than a rationalisation.
 */
export const planRemediation = ({
  courseId,
  skillId,
  masteryBySkill = {},
  maxDepth = MAX_DESCENT_DEPTH,
} = {}) => {
  const origin = skillFor(courseId, skillId);
  if (!origin) {
    return {
      action: REMEDIATION_ACTION.NONE,
      originSkillId: skillId || null,
      targetSkillId: null,
      target: null,
      path: [],
      depth: 0,
      examined: [],
      reason: 'unknown_skill',
      explanation: 'This skill is not in the graph, so there is nothing to route from.',
      loopGuarded: false,
    };
  }

  const visited = new Set([origin.skillId]);
  const path = [origin.skillId];
  const examined = [];
  let current = origin;
  let depth = 0;
  let loopGuarded = false;

  for (;;) {
    const evidence = classifyPrerequisiteEvidence(current, masteryBySkill);
    examined.push({
      skillId: current.skillId,
      weak: evidence.weak.map((entry) => entry.skillId),
      unknown: evidence.unknown.map((entry) => entry.skillId),
      solid: evidence.solid.map((entry) => entry.skillId),
    });

    // Bottom of the ladder: nothing underneath this can be the cause.
    if (!evidence.weak.length && !evidence.unknown.length) {
      return finish(REMEDIATION_ACTION.RETEACH_IN_PLACE, current, {
        reason: depth === 0 ? 'prerequisites_intact' : 'descent_bottomed_out',
        explanation: depth === 0
          ? 'Every prerequisite this skill depends on is already solid, so the difficulty is with this skill itself rather than something underneath it.'
          : 'The descent reached a skill whose own prerequisites are solid, so this is where the work belongs.',
      });
    }

    if (evidence.weak.length) {
      const weakest = evidence.weak[0];
      const next = skillFor(courseId, weakest.skillId);

      // Depth limit or an unresolvable skill: stop AT the prerequisite rather
      // than continuing past it.
      if (!next || depth + 1 >= maxDepth || visited.has(weakest.skillId)) {
        loopGuarded = visited.has(weakest.skillId);
        return finish(REMEDIATION_ACTION.DESCEND, next || { skillId: weakest.skillId }, {
          reason: loopGuarded ? 'loop_guard' : (!next ? 'prerequisite_outside_graph' : 'descent_depth_limit'),
          explanation: loopGuarded
            ? 'This prerequisite was already on the path, so the descent stops here rather than circling.'
            : 'Evidence shows this prerequisite is weak, and the descent limit has been reached — a teacher should decide whether to go further.',
          masteryAtTarget: weakest.mastery,
        });
      }

      // Real evidence of a real gap: descend one level and ask again.
      visited.add(weakest.skillId);
      path.push(weakest.skillId);
      current = next;
      depth += 1;
      continue;
    }

    // Nothing is known to be weak, but something is unknown. Do NOT assume it
    // is the problem — check it.
    const unknownEntry = evidence.unknown[0];
    return finish(REMEDIATION_ACTION.DIAGNOSE, skillFor(courseId, unknownEntry.skillId) || { skillId: unknownEntry.skillId }, {
      reason: 'no_evidence_for_prerequisite',
      explanation: 'There is no evidence either way about this prerequisite, so the next step is a short check rather than a full unit of remediation.',
      masteryAtTarget: null,
    });
  }

  function finish(action, target, extra) {
    const targetSkillId = target?.skillId || null;
    if (targetSkillId && path[path.length - 1] !== targetSkillId) path.push(targetSkillId);
    return {
      action,
      originSkillId: origin.skillId,
      origin: describeSkill(origin.skillId),
      targetSkillId,
      target: targetSkillId ? describeSkill(targetSkillId) : null,
      path: [...path],
      depth,
      examined,
      loopGuarded,
      severe: extra.masteryAtTarget != null && extra.masteryAtTarget < SEVERE_GAP_MASTERY,
      ...extra,
    };
  }
};

/**
 * What a remediation excursion actually touches.
 *
 * The brief's requirement is that being sent to strengthen one thing must not
 * quietly shut the rest of the course. So this names the skills genuinely
 * downstream of the gap — the ones that legitimately wait — and confirms
 * everything else stays open.
 */
export const describeBranchImpact = ({ courseId, skillId, masteryBySkill = {} } = {}) => {
  const graph = getSkillGraph(courseId);
  const blocked = new Set();
  const queue = [skillId];
  const seen = new Set([skillId]);

  // Only hard edges propagate. A soft dependent is not waiting on anything.
  while (queue.length) {
    const currentId = queue.shift();
    getDependentSkills(courseId, currentId, { strength: STRENGTH.HARD }).forEach((dependent) => {
      if (seen.has(dependent.skillId)) return;
      seen.add(dependent.skillId);
      blocked.add(dependent.skillId);
      queue.push(dependent.skillId);
    });
  }

  const unrelated = graph
    .filter((skill) => skill.skillId !== skillId && !blocked.has(skill.skillId))
    .map((skill) => skill.skillId);

  return {
    courseId,
    skillId,
    // Downstream of the gap: these are the ones that genuinely wait.
    blockedSkillIds: [...blocked],
    // Everything else. The student keeps working here while they remediate.
    unrelatedSkillIds: unrelated,
    // A blunt sanity number for the graph audit: if remediating one skill
    // closes most of the course, the graph has too many hard edges.
    blockedShare: graph.length ? Number((blocked.size / graph.length).toFixed(3)) : 0,
    masteryConsidered: Object.keys(masteryBySkill || {}).length,
  };
};

/**
 * The path options a student keeps while remediating. Deliberately expressed as
 * a filter over the engine's own output rather than a second engine, so it
 * cannot disagree with what the panel shows.
 */
export const preserveUnrelatedBranches = ({ options, courseId, remediationSkillId }) => {
  const impact = describeBranchImpact({ courseId, skillId: remediationSkillId });
  const blocked = new Set(impact.blockedSkillIds);
  const keep = (rows) => (Array.isArray(rows) ? rows.filter((row) => !blocked.has(row.skillId)) : []);
  return {
    impact,
    stillOpen: [
      ...keep(options?.recommended),
      ...keep(options?.available),
      ...keep(options?.priority),
      ...keep(options?.extension),
    ],
    waitingOnRemediation: [...blocked],
  };
};

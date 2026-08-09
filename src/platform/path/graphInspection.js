// Graph inspection: the two questions a teacher actually asks.
//
//   "Why is this locked?"
//   "What happens if I instantly master this prerequisite?"
//
// Both are answered by running the real engine, not by describing it. The
// second in particular is a counterfactual, and the only trustworthy way to
// produce one is to patch the mastery map and re-run — which is cheap, because
// the whole path stack is pure.

import { describeSkill, getSkillGraph, hardPrerequisitesOf, resolveSkillAnywhere } from './skillGraph.js';
import { STRENGTH, describeStrength } from './prerequisiteStrength.js';
import { CONFIDENT_ATTEMPTS, SEVERE_GAP_MASTERY, STATUS, getStudentPathOptions } from './recommendationEngine.js';

const OPTION_BUCKETS = ['required', 'remediation', 'priority', 'recommended', 'available', 'extension', 'future', 'locked', 'mastered'];

export const flattenOptions = (options) => OPTION_BUCKETS.flatMap((bucket) => options?.[bucket] || []);

export const findOptionRow = (options, skillId) => flattenOptions(options).find((row) => row.skillId === skillId) || null;

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const masteryValue = (masteryBySkill, skillId) => {
  const entry = masteryBySkill?.[skillId];
  if (entry == null) return null;
  return clamp01(typeof entry === 'number' ? entry : entry.mastery);
};

const skillFor = (courseId, skillId) => (
  getSkillGraph(courseId).find((skill) => skill.skillId === skillId) || resolveSkillAnywhere(skillId)
);

/**
 * "Why is this locked?" — the chain of hard prerequisites responsible, with the
 * mastery that produced each verdict.
 *
 * Soft and reinforcement edges are reported too, clearly separated, because the
 * most common teacher confusion is expecting a helpful-but-not-required skill
 * to be the cause. Naming it as "helpful, not blocking" answers the question
 * better than omitting it.
 */
export const explainLock = ({ courseId, skillId, masteryBySkill = {}, maxDepth = 3 } = {}) => {
  const skill = skillFor(courseId, skillId);
  if (!skill) {
    return { skillId, found: false, blocking: [], helpful: [], related: [], chain: [], summary: 'That skill is not in this course graph.' };
  }

  const blocking = [];
  const chain = [];
  const seen = new Set([skill.skillId]);

  const walk = (currentSkill, depth) => {
    if (depth > maxDepth) return;
    hardPrerequisitesOf(currentSkill).forEach((entry) => {
      const mastery = masteryValue(masteryBySkill, entry.skillId);
      const isSevere = mastery != null && mastery < SEVERE_GAP_MASTERY;
      const isShort = mastery != null && mastery < entry.minimumMastery;
      if (!isShort) return;

      if (depth === 0) {
        blocking.push({
          skillId: entry.skillId,
          label: describeSkill(entry.skillId).label,
          mastery,
          minimumMastery: entry.minimumMastery,
          severity: isSevere ? 'severe' : 'short',
        });
      }
      chain.push({ depth, from: currentSkill.skillId, skillId: entry.skillId, mastery, severity: isSevere ? 'severe' : 'short' });

      if (seen.has(entry.skillId)) return;
      seen.add(entry.skillId);
      const next = skillFor(courseId, entry.skillId);
      if (next) walk(next, depth + 1);
    });
  };
  walk(skill, 0);

  const describeEdge = (entry) => ({
    skillId: entry.skillId,
    label: describeSkill(entry.skillId).label,
    strength: entry.strength,
    strengthNote: describeStrength(entry.strength),
    mastery: masteryValue(masteryBySkill, entry.skillId),
    minimumMastery: entry.minimumMastery,
  });

  const helpful = (skill.prerequisites || []).filter((entry) => entry.strength === STRENGTH.SOFT).map(describeEdge);
  const related = (skill.prerequisites || []).filter((entry) => entry.strength === STRENGTH.REINFORCEMENT).map(describeEdge);
  const severeCount = blocking.filter((entry) => entry.severity === 'severe').length;

  return {
    skillId,
    found: true,
    label: describeSkill(skillId).label,
    blocking,
    helpful,
    related,
    chain,
    summary: blocking.length
      ? `${blocking.length} required skill${blocking.length === 1 ? '' : 's'} ${blocking.length === 1 ? 'is' : 'are'} below the bar${severeCount ? `, ${severeCount} of them severely` : ''}.`
      : 'Nothing required is holding this closed. If it is not being offered, the reason is pacing or a teacher setting rather than readiness.',
  };
};

// A patched mastery entry that reads as genuinely mastered: full credit, enough
// attempts to be trusted, and maximum evidence strength. Anything less and the
// counterfactual would be answering a different question.
const masteredEntry = (mastery = 1) => ({
  mastery,
  attempts: CONFIDENT_ATTEMPTS,
  recentAccuracy: mastery,
  evidenceStrength: 1,
});

/**
 * "What happens if I instantly master this prerequisite?"
 *
 * Runs the real engine twice — once as things stand, once with the prerequisite
 * patched to mastered — and reports the difference. Nothing is written; the
 * caller's mastery map is untouched.
 */
export const simulateInstantMastery = ({ pathInput, skillId, prerequisiteSkillId, mastery = 1 } = {}) => {
  if (!pathInput || !skillId || !prerequisiteSkillId) {
    return { changed: false, before: null, after: null, summary: 'Choose a skill and one of its prerequisites.' };
  }

  const before = findOptionRow(getStudentPathOptions(pathInput), skillId);
  const patchedInput = {
    ...pathInput,
    masteryBySkill: {
      ...pathInput.masteryBySkill,
      [prerequisiteSkillId]: masteredEntry(clamp01(mastery)),
    },
  };
  const after = findOptionRow(getStudentPathOptions(patchedInput), skillId);

  const statusChanged = before?.status !== after?.status;
  const opened = before?.status === STATUS.LOCKED && after?.status !== STATUS.LOCKED;

  return {
    before,
    after,
    changed: statusChanged || before?.score !== after?.score,
    statusChanged,
    opened,
    scoreDelta: Number(((after?.score ?? 0) - (before?.score ?? 0)).toFixed(4)),
    summary: !before || !after
      ? 'That skill is not in this course graph.'
      : opened
        ? `Mastering ${describeSkill(prerequisiteSkillId).shortLabel || prerequisiteSkillId} opens this skill (${before.status} → ${after.status}).`
        : statusChanged
          ? `Status changes from ${before.status} to ${after.status}.`
          : `Status stays ${after.status}. This prerequisite is not what is holding it.`,
  };
};

/**
 * Every prerequisite of a skill, in one list, for a picker. Ordered so the ones
 * that can actually lock come first.
 */
export const listPrerequisiteChoices = ({ courseId, skillId } = {}) => {
  const skill = skillFor(courseId, skillId);
  if (!skill) return [];
  const rank = { [STRENGTH.HARD]: 0, [STRENGTH.SOFT]: 1, [STRENGTH.REINFORCEMENT]: 2 };
  return [...(skill.prerequisites || [])]
    .sort((a, b) => (rank[a.strength] ?? 3) - (rank[b.strength] ?? 3))
    .map((entry) => ({
      skillId: entry.skillId,
      label: describeSkill(entry.skillId).label,
      strength: entry.strength,
      strengthNote: describeStrength(entry.strength),
    }));
};

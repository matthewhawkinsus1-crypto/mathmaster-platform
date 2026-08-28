// Bridge: the mastery engine's TEKS profile -> the path engine's masteryBySkill.
//
// These are two different shapes for good reasons. The mastery engine reports
// in instructional language on a 0-100 scale (score, performance level,
// confidence label) because that is what gradebooks and STAAR-style reporting
// need. The path engine reasons in 0-1 fractions with an explicit evidence
// strength because that is what threshold comparisons need.
//
// Converting in one named place means neither has to know about the other, and
// there is exactly one line to change when a scale moves. Everything here is
// pure, so the simulated learner and a real student go through the same
// conversion — the simulator only differs in which document it reads.

import { buildStudentMasteryProfile } from '../../masteryEngine.js';
import { teksSkillId } from './skillGraph.js';

// Weighted evidence at which the path engine treats mastery as trustworthy.
// Matches CONFIDENT_ATTEMPTS in the recommendation engine.
export const CONFIDENT_EVIDENCE = 6;

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const fromPercent = (value) => (value == null ? null : clamp01(Number(value) / 100));

/**
 * Convert one TEKS summary into the path engine's per-skill mastery record.
 */
export const toSkillMastery = (summary) => {
  if (!summary || typeof summary !== 'object') return null;
  return {
    mastery: fromPercent(summary.score) ?? 0,
    attempts: Math.max(0, Number(summary.itemCount) || 0),
    // First-attempt rate is the honest "can they do this unaided" signal;
    // eventual-correct includes retries and would overstate independence.
    recentAccuracy: fromPercent(summary.firstAttemptCorrectRate),
    // Weighted rather than raw: four DOK-1 items are not the same evidence as
    // four DOK-3 items, and effectiveEvidence already carries that weighting.
    evidenceStrength: clamp01((Number(summary.effectiveEvidence) || 0) / CONFIDENT_EVIDENCE),
    performanceKey: summary.performance?.key || 'insufficient',
    performanceLabel: summary.performance?.label || 'Insufficient Evidence',
  };
};

/**
 * The whole map, keyed by skillId. Skills with no evidence are deliberately
 * absent rather than present with mastery 0 — the path engine distinguishes
 * "unproven" from "deficient", and a zero would read as a severe gap.
 */
export const buildMasteryBySkill = (profile) => {
  const teks = profile?.teks && typeof profile.teks === 'object' ? profile.teks : {};
  const map = {};
  Object.entries(teks).forEach(([code, summary]) => {
    const record = toSkillMastery(summary);
    if (!record) return;
    // An entry with no items at all carries no information.
    if (record.attempts <= 0) return;
    map[teksSkillId(code)] = record;
  });
  return map;
};

/**
 * One call from a student (or simulated) document to path-engine input.
 */
export const buildMasteryBySkillForStudent = ({ student, assignments = [] }) => (
  buildMasteryBySkill(buildStudentMasteryProfile({ student, assignments }))
);

/**
 * Which skills a set of assignments actually targets, so the engine can weight
 * "this is what your class is working on right now".
 */
export const collectAssignmentSkillIds = (assignments = [], { normalizeStandards } = {}) => {
  const ids = new Set();
  (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
    if (assignment?.evidencePolicy?.recommendationEligible === false) return;
    (Array.isArray(assignment?.questions) ? assignment.questions : []).forEach((question) => {
      const codes = typeof normalizeStandards === 'function'
        ? normalizeStandards(question)
        : (question?.alignments || [])
          .filter((entry) => String(entry?.framework || 'teks') === 'teks' && String(entry?.role || 'primary') === 'primary')
          .map((entry) => entry.code);
      (codes || []).filter(Boolean).forEach((code) => ids.add(teksSkillId(code)));
    });
  });
  return [...ids];
};

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

import { teksSkillId } from './skillGraph.js';
import { buildStudentMasteryProfile } from '../../masteryEngine.js';
import { buildUnifiedMasteryProfiles, masteryBySkillFromProfiles } from '../mastery/unifiedMastery.js';
import { MASTERY_STATUS, classifyMasteryStatus } from '../../../functions/shared/masteryRule.mjs';

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

// The cut-off the Path engine applied to a record with no verdict (main's
// assignment record): recommendationEngine.js MASTERED_THRESHOLD.
const LEGACY_MASTERED = 0.9;
const better = (a, b) => (a == null ? b : (b == null ? a : Math.max(a, b)));

/**
 * NO STUDENT LOSES, ON DEPLOY DAY, WHAT MAIN GAVE THEM (product decision 8).
 *
 * The server used to count EVERY attempt as an event, so a question right on
 * the second try read 50% where the assignment record (one score per
 * question, right on any try = 100%) read 100%. Fed alone to the Path engine
 * it took a student's Mastered status away overnight and locked the skills
 * built on it, so the Path engine read the MORE FAVOURABLE of the two per
 * skill while the wheel kept the server's number — and the two disagreed.
 *
 * The server now scores each question once, by its final attempt
 * (functions/shared/masteryScoring.mjs), and an owner-run backfill rescored
 * every stored profile, writing a floor wherever main had given the student
 * more (scripts/backfill-mastery-scoring.mjs). So the bridge is narrowed to
 * what is still needed:
 *
 *   a skill the backfill rescored (`serverScored`) — the unified record as
 *     it is, which is what the wheel, its card and the planner read: one
 *     number and one verdict everywhere. The floor already holds what main
 *     gave.
 *   any other skill — a student the backfill has not reached yet, or the
 *     Teacher Path Simulator (no server document) — the more favourable of
 *     the two, as before.
 *
 * Either way, a skill only Path evidence knows was unproven to main's engine,
 * which never locks on unproven. So such a record adds its Mastered verdict
 * but never a lock and never a lower readiness (`gate: false`).
 */
export const favourableMasteryBySkill = ({ legacy = {}, unified = {} } = {}) => {
  const result = {};
  new Set([...Object.keys(legacy || {}), ...Object.keys(unified || {})]).forEach((skillId) => {
    const old = legacy?.[skillId] || null;
    const now = unified?.[skillId] || null;
    if (!now) { result[skillId] = old; return; }
    if (!old) { result[skillId] = now.mastered ? now : { ...now, gate: false }; return; }
    if (now.serverScored === true) { result[skillId] = now; return; }
    const mastered = now.mastered === true || Number(old.mastery) >= LEGACY_MASTERED;
    const oldLeads = Number(old.mastery) > Number(now.mastery);
    result[skillId] = {
      ...now,
      mastery: Math.max(Number(old.mastery) || 0, Number(now.mastery) || 0),
      // The questions the shown number rests on.
      attempts: oldLeads ? old.attempts : now.attempts,
      recentAccuracy: better(old.recentAccuracy, now.recentAccuracy),
      evidenceStrength: better(old.evidenceStrength, now.evidenceStrength),
      mastered,
      // The shared rule's band for the number shown; only the verdict above
      // may say Mastered.
      status: mastered ? MASTERY_STATUS.MASTERED : (oldLeads ? classifyMasteryStatus({
        estimate: Number(old.mastery) * 100,
        eligibleEvents: Number(old.attempts) || 0,
        effectiveWeight: Number(old.attempts) || 0,
      }) : now.status),
    };
  });
  return result;
};

/**
 * One call from a student (or simulated) document to path-engine input: the
 * more favourable of main's assignment record and the unified profile the
 * wheel reads (favourableMasteryBySkill). `serverProfiles` is the student's
 * studentMasteryProfiles map; a simulated learner has none and passes nothing.
 */
export const buildMasteryBySkillForStudent = ({ student, assignments = [], serverProfiles = {} }) => favourableMasteryBySkill({
  legacy: buildMasteryBySkill(buildStudentMasteryProfile({ student, assignments })),
  unified: masteryBySkillFromProfiles(buildUnifiedMasteryProfiles({ student, assignments, serverProfiles })),
});

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

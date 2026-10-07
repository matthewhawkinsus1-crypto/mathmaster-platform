// ONE MASTERY SOURCE.
//
// The mastery wheel and the weekly planner read the server's Path-evidence
// profile (studentMasteryProfiles) merged over an assignment-derived fallback.
// The Path map, Recommended for You, prerequisite locks and Challenge unlocks
// used to read the assignment-only fallback alone, with its own 0.9 cut-off —
// so the same skill could be "Mastered" on one screen and "Secure" on the next.
//
// Every screen now reads the profiles built here, and every status comes from
// the shared rule (functions/shared/masteryRule.mjs) the server trigger uses.
// Pure apart from its inputs: the live app passes the server document, the
// Teacher Path Simulator passes none, and both go through the same code.

import { buildStudentMasteryProfile, collectStudentEvidence } from '../../masteryEngine.js';
import { toDisplayCode } from '../../utils/teksUtils.js';
import { adaptLegacyMasteryToPhase5, retentionSignal } from '../profile/legacyMasteryAdapter.js';
import { teksSkillId } from '../path/skillGraph.js';
import {
  MASTERY_STATUS,
  classifyMasteryStatus,
  masteryFactsFromProfile,
} from '../../../functions/shared/masteryRule.mjs';

// Weighted evidence at which the path engine treats mastery as trustworthy.
// Matches CONFIDENT_ATTEMPTS in the recommendation engine.
export const CONFIDENT_EVIDENCE = 6;

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

/** Server fields win over the fallback; the status is re-derived from the rule. */
export const mergeMasteryProfile = (fallback = {}, server = {}, schedule = {}) => {
  const merged = {
    ...fallback,
    ...server,
    mastery: { ...fallback?.mastery, ...server?.mastery },
    dimensions: { ...fallback?.dimensions, ...server?.dimensions },
    recommendation: { ...fallback?.recommendation, ...server?.recommendation },
    signals: {
      ...fallback?.signals,
      ...server?.signals,
      retention: retentionSignal(schedule || {}),
    },
  };
  merged.mastery.status = classifyMasteryStatus(masteryFactsFromProfile(merged));
  return merged;
};

/**
 * Display-code → profile, for one student. `serverProfiles` is the `profiles`
 * map of the student's studentMasteryProfiles document (or {} when there is
 * none, as for a simulated learner).
 */
export const buildUnifiedMasteryProfiles = ({
  student = {},
  assignments = [],
  serverProfiles = {},
  retentionSchedulesByTEKS = {},
} = {}) => {
  const safeStudent = student && typeof student === 'object' ? student : {};
  const safeAssignments = Array.isArray(assignments) ? assignments : [];
  const legacyProfile = buildStudentMasteryProfile({ student: safeStudent, assignments: safeAssignments });
  const evidenceRows = collectStudentEvidence({ student: safeStudent, assignments: safeAssignments });
  const fallbackProfiles = adaptLegacyMasteryToPhase5({ legacyProfile, evidenceRows, retentionSchedulesByTEKS });
  // The adapter keeps the legacy shape; the rule also needs the evidence weight
  // and the COUNT of independent successes, which the legacy summary has.
  Object.entries(legacyProfile?.teks || {}).forEach(([rawCode, summary]) => {
    const code = toDisplayCode(rawCode);
    const profile = fallbackProfiles[code];
    if (!profile) return;
    const independentSuccesses = evidenceRows.filter((row) => (
      toDisplayCode(row.teks) === code && row.eventuallyCorrect && row.isMathematicallyIndependent
    )).length;
    profile.dimensions = {
      ...(profile.dimensions || {}),
      effectiveWeight: Number(summary?.effectiveEvidence) || 0,
      independentSuccesses,
      firstAttemptCorrectRate: summary?.firstAttemptCorrectRate ?? null,
    };
  });
  const server = serverProfiles && typeof serverProfiles === 'object' ? serverProfiles : {};
  const codes = new Set([...Object.keys(fallbackProfiles), ...Object.keys(server)].map(toDisplayCode).filter(Boolean));
  const result = {};
  codes.forEach((code) => {
    result[code] = mergeMasteryProfile(
      fallbackProfiles[code],
      server[code] || server[`texas:${code}`],
      retentionSchedulesByTEKS?.[code] || retentionSchedulesByTEKS?.[`texas:${code}`],
    );
  });
  return result;
};

/**
 * The path engine's per-skill record, from one unified profile. `mastered` is
 * the rule's verdict, so the engine never applies a threshold of its own.
 */
export const toPathSkillMastery = (profile) => {
  if (!profile || typeof profile !== 'object') return null;
  const facts = masteryFactsFromProfile(profile);
  if (facts.eligibleEvents <= 0 && facts.estimate == null) return null;
  const status = classifyMasteryStatus(facts);
  const firstAttempt = profile?.dimensions?.firstAttemptCorrectRate;
  return {
    mastery: facts.estimate == null ? 0 : clamp01(Number(facts.estimate) / 100),
    attempts: facts.eligibleEvents,
    recentAccuracy: firstAttempt == null ? null : clamp01(Number(firstAttempt) / 100),
    evidenceStrength: clamp01(facts.effectiveWeight / CONFIDENT_EVIDENCE),
    mastered: status === MASTERY_STATUS.MASTERED,
    status,
  };
};

export const masteryBySkillFromProfiles = (profiles = {}) => {
  const map = {};
  Object.entries(profiles || {}).forEach(([code, profile]) => {
    const record = toPathSkillMastery(profile);
    // An entry with no evidence carries no information; the engine reads
    // absence as "unproven", which is different from a gap.
    if (!record || record.attempts <= 0) return;
    map[teksSkillId(toDisplayCode(code))] = record;
  });
  return map;
};

/*
 * FOLDING A COMPLETED RECOVERY INTO THE GRADE THE PLATFORM ALREADY COMPUTES.
 *
 * There is no Recovery gradebook. A section score is weighted question credit
 * over the section's questions (gradeEvidence.js on the browser, the Classroom
 * sync on the server). A completed Recovery changes exactly one input to that
 * calculation: every question of the recovered section is credited at the
 * recorded score. Each keeps its own weight, so
 *
 *   - the assignment denominator does not change,
 *   - the other sections do not change,
 *   - no weight changes, and a Recovery never becomes an extra assignment or
 *     an extra question — it is the same Warm-Up or DOL, rescored.
 *
 * The recorded score is computed HERE, at read time, from the live original
 * section score (after any teacher correction of an original answer) and the
 * raw Recovery score stored on the record — never from a number written once
 * and left to go stale. Precedence, read from the outside in:
 *
 *   assignment-level teacher override  >  Recovery  >  per-question overrides
 *
 * The caller applies per-question overrides BEFORE this (they shape the
 * original score) and the assignment-level override AFTER it (it replaces the
 * whole grade).
 *
 * A Live Challenge Warm-Up result enters the same way (warmupChallengeGrade.mjs):
 * the Warm-Up questions are credited at the challenge score — the higher of it
 * and any authored Warm-Up work — before any Recovery is considered.
 *
 * Pure: no Firestore.
 */

import { normalizeRecoveryPolicy } from './recoveryPolicy.mjs';
import { buildSectionRecoveryGradeState } from './sectionRecoveryGrade.mjs';
import { RECOVERY_RECORD_STATUS, normalizeRecoveryRecord } from './sectionRecoveryRecord.mjs';
import { WARMUP_GRADE_SOURCE, buildWarmupChallengeGradeState } from './warmupChallengeGrade.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** A Recovery score that exists. `null` is "no score", and Number(null) is 0. */
const hasRecoveryScore = (record) => record?.rawScore !== null
  && record?.rawScore !== undefined
  && record?.rawScore !== ''
  && Number.isFinite(Number(record.rawScore));

/**
 * The completed Recovery records for one assignment, by section — only those
 * with a Recovery score. A HELD Recovery is not here (nothing was scored), and
 * neither is one a teacher closed keeping the original: in both the original
 * section score stands, exactly as if no Recovery had been taken.
 */
export const completedSectionRecoveries = (recoveriesForAssignment = null) => {
  const found = {};
  if (!isObject(recoveriesForAssignment)) return found;
  ['warmup', 'dol'].forEach((section) => {
    const record = normalizeRecoveryRecord(recoveriesForAssignment[section], section);
    if (record?.status === RECOVERY_RECORD_STATUS.COMPLETED && hasRecoveryScore(record)) {
      found[section] = record;
    }
  });
  return found;
};

/**
 * The HELD Recovery records for one assignment, by section: submitted, not
 * gradable enough to score, waiting for a teacher. Every surface that would
 * otherwise treat the assignment's grade as finished — Classroom passback,
 * Grade Transfer, the student's Grade Center — asks this first.
 */
export const heldSectionRecoveries = (recoveriesForAssignment = null) => {
  const found = {};
  if (!isObject(recoveriesForAssignment)) return found;
  ['warmup', 'dol'].forEach((section) => {
    const record = normalizeRecoveryRecord(recoveriesForAssignment[section], section);
    if (record?.status === RECOVERY_RECORD_STATUS.HELD) found[section] = record;
  });
  return found;
};

const creditedRecord = (record, recordedScore) => {
  const recorded = Number(recordedScore);
  const base = isObject(record) ? record : {};
  return {
    ...base,
    status: recorded >= 100 ? 'correct' : 'attempted',
    partialCredit: recorded,
    bestPartialCredit: recorded,
    // Step credit would otherwise be re-derived on top of the recorded score.
    stepGrades: [],
  };
};

const challengeRecord = (record, state) => ({
  ...creditedRecord(record, state.recordedScore),
  warmupChallengeDisplay: {
    challengeScore: state.challengeScore,
    correct: state.correct,
    roundsAvailable: state.roundsAvailable,
    recordedScore: state.recordedScore,
    originalScore: state.originalScore,
  },
});

const projectedRecord = (record, state) => {
  return {
    ...creditedRecord(record, state.recordedScore),
    sectionRecoveryDisplay: {
      section: state.section,
      type: state.type,
      recordedScore: state.recordedScore,
      originalScore: state.originalScore,
      rawRecoveryScore: state.rawRecoveryScore,
      source: state.source,
    },
  };
};

/**
 * Apply a Live Challenge Warm-Up result and completed Recoveries to one
 * assignment's (already override-projected) tracker.
 *
 *   sectionIndices    { warmup: [storage indices], dol: [...] } — current content
 *   sectionOriginals  { warmup: { score, attempted }, dol: {...} } — the live
 *                     section split of `tracker`, computed by the caller with
 *                     its own (identical) weighting
 *   recoveries        completedSectionRecoveries(...)
 *   challengeCredit   the Live Challenge Warm-Up credit, if any
 *
 * Returns the projected tracker, the grade state of each recovered section,
 * and the Warm-Up challenge state. With neither it returns the tracker
 * unchanged (same identity).
 */
export const applySectionRecoveriesToTracker = ({
  tracker = null,
  sectionIndices = {},
  sectionOriginals = {},
  recoveries = {},
  assignment = null,
  // The student's `warmupChallengeByAssignment[assignmentId]` credit, when the
  // Warm-Up was played as a Live Challenge (warmupChallengeGrade.mjs).
  challengeCredit = null,
} = {}) => {
  const sections = Object.keys(recoveries || {});
  const warmupIndices = Array.isArray(sectionIndices?.warmup) ? sectionIndices.warmup : [];
  const challenge = warmupIndices.length
    ? buildWarmupChallengeGradeState({ credit: challengeCredit, originalScore: sectionOriginals?.warmup?.score ?? null })
    : null;
  if ((!sections.length && !challenge) || !tracker) return { tracker, states: {}, challenge: null };
  const policy = normalizeRecoveryPolicy(assignment || {});
  let next = tracker;
  const states = {};
  const originals = { ...sectionOriginals };
  // The Live Challenge result is the Warm-Up grade: it credits the Warm-Up
  // questions first, and anything else about the Warm-Up compares against it.
  if (challenge) {
    if (challenge.source === WARMUP_GRADE_SOURCE.CHALLENGE) {
      next = { ...next };
      warmupIndices.forEach((index) => {
        next[index] = challengeRecord(next[index], challenge);
      });
    }
    originals.warmup = { ...originals.warmup, score: challenge.recordedScore, attempted: 1 };
  }
  sections.forEach((section) => {
    const record = recoveries[section];
    const indices = Array.isArray(sectionIndices?.[section]) ? sectionIndices[section] : [];
    if (!indices.length) return;
    const original = originals?.[section] || {};
    const state = buildSectionRecoveryGradeState({
      section,
      originalScore: original.score ?? null,
      originalAttempted: Number(original.attempted) > 0,
      rawRecoveryScore: record.rawScore,
      type: record.type,
      policy,
      capOverride: record.cap,
    });
    states[section] = state;
    if (state.recordedScore === null) return;
    next = next === tracker ? { ...tracker } : next;
    indices.forEach((index) => {
      next[index] = projectedRecord(next[index], state);
    });
  });
  return { tracker: next, states, challenge };
};

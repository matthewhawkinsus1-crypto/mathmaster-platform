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
 * Pure: no Firestore.
 */

import { normalizeRecoveryPolicy } from './recoveryPolicy.mjs';
import { buildSectionRecoveryGradeState } from './sectionRecoveryGrade.mjs';
import { RECOVERY_RECORD_STATUS, normalizeRecoveryRecord } from './sectionRecoveryRecord.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** The completed Recovery records for one assignment, by section. */
export const completedSectionRecoveries = (recoveriesForAssignment = null) => {
  const found = {};
  if (!isObject(recoveriesForAssignment)) return found;
  ['warmup', 'dol'].forEach((section) => {
    const record = normalizeRecoveryRecord(recoveriesForAssignment[section], section);
    if (record?.status === RECOVERY_RECORD_STATUS.COMPLETED && Number.isFinite(Number(record.rawScore))) {
      found[section] = record;
    }
  });
  return found;
};

const projectedRecord = (record, state) => {
  const recorded = Number(state.recordedScore);
  const base = isObject(record) ? record : {};
  return {
    ...base,
    status: recorded >= 100 ? 'correct' : 'attempted',
    partialCredit: recorded,
    bestPartialCredit: recorded,
    // Step credit would otherwise be re-derived on top of the recorded score.
    stepGrades: [],
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
 * Apply completed Recoveries to one assignment's (already override-projected)
 * tracker.
 *
 *   sectionIndices    { warmup: [storage indices], dol: [...] } — current content
 *   sectionOriginals  { warmup: { score, attempted }, dol: {...} } — the live
 *                     section split of `tracker`, computed by the caller with
 *                     its own (identical) weighting
 *   recoveries        completedSectionRecoveries(...)
 *
 * Returns the projected tracker and the grade state of each recovered section.
 * With no completed Recovery it returns the tracker unchanged (same identity).
 */
export const applySectionRecoveriesToTracker = ({
  tracker = null,
  sectionIndices = {},
  sectionOriginals = {},
  recoveries = {},
  assignment = null,
} = {}) => {
  const sections = Object.keys(recoveries || {});
  if (!sections.length || !tracker) return { tracker, states: {} };
  const policy = normalizeRecoveryPolicy(assignment || {});
  let next = tracker;
  const states = {};
  sections.forEach((section) => {
    const record = recoveries[section];
    const indices = Array.isArray(sectionIndices?.[section]) ? sectionIndices[section] : [];
    if (!indices.length) return;
    const original = sectionOriginals?.[section] || {};
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
  return { tracker: next, states };
};

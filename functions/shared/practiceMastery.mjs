/*
 * RECENT INDEPENDENT PRACTICE MASTERY — THE RECOVERY GATE.
 *
 * Not a lifetime percentage. A student who struggled on Monday and has it
 * cold by Thursday must be able to unlock Recovery; a lifetime average would
 * hold their Monday against them indefinitely. So the gate looks only at the
 * most recent window of Practice items, and counts an item as mastery only
 * when it is real evidence:
 *
 *   UNIQUE        an item is one distinct question (its fingerprint). Answering
 *                 the same question again — after a refresh, or a repeated
 *                 variant — is not new evidence, so only its first answer
 *                 counts.
 *   INDEPENDENT   answered without a hint, worked example, scaffold or teacher
 *                 help, and not on a modified version. Help is fine to use; it
 *                 just is not evidence of independent mastery.
 *   UNSEEN ANSWER answered before its solution was shown. An item that ended
 *                 with the solution displayed was not solved.
 *   COVERAGE      every skill the original section assessed has at least one
 *                 correct item in the window, so seven right answers on one
 *                 skill cannot unlock a two-skill DOL.
 *
 * The window, the required count and the rules come from recoveryPolicy.mjs.
 *
 * Pure: no Firestore. `now` is a parameter.
 */

import { normalizeRecoveryPolicy } from './recoveryPolicy.mjs';

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const DAY_MS = 86_400_000;

const toMillis = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * One Practice item outcome in the gate's vocabulary. Anything without a key
 * is dropped: an item the gate cannot identify cannot be counted once.
 */
export const normalizePracticeOutcome = (raw = {}) => {
  const key = clean(raw.key || raw.fingerprint || raw.instanceFingerprint || raw.questionInstanceId);
  if (!key) return null;
  return {
    key,
    familyId: clean(raw.familyId) || null,
    coverageKey: clean(raw.coverageKey || raw.familyId) || null,
    correct: raw.correct === true,
    firstAttemptCorrect: raw.firstAttemptCorrect === true || (raw.correct === true && Number(raw.attempts || 1) <= 1),
    independent: raw.independent !== false,
    solutionViewed: raw.solutionViewed === true,
    at: toMillis(raw.at),
  };
};

/** Does this outcome count as a correct, independent item under the policy? */
export const outcomeCountsAsMastery = (outcome, policy) => (
  Boolean(outcome)
  && outcome.correct
  && outcome.independent
  && !outcome.solutionViewed
  && (policy.mastery.correctOn !== 'firstAttempt' || outcome.firstAttemptCorrect)
);

/**
 * Evaluate the gate.
 *
 * `requiredCoverage` lists the coverage keys (family equivalence groups) the
 * original section assessed. Returns every number the student panel and the
 * teacher audit trail show, plus the exact item keys used, so the evidence
 * behind an unlock is stored rather than re-derived later.
 */
export const evaluateRecentPracticeMastery = ({
  outcomes = [],
  requiredCoverage = [],
  policy = null,
  now = Date.now(),
} = {}) => {
  const normalizedPolicy = policy?.version ? policy : normalizeRecoveryPolicy(policy || {});
  const { windowSize, requiredCorrect, lookbackDays, requireSkillCoverage } = normalizedPolicy.mastery;
  const earliest = Number(now) - lookbackDays * DAY_MS;
  const coverage = [...new Set(list(requiredCoverage).map(clean).filter(Boolean))];

  // First occurrence of each distinct question only.
  const firstByKey = new Map();
  list(outcomes)
    .map(normalizePracticeOutcome)
    .filter(Boolean)
    .filter((outcome) => !outcome.at || outcome.at >= earliest)
    .filter((outcome) => !coverage.length || !outcome.coverageKey || coverage.includes(outcome.coverageKey))
    .sort((a, b) => a.at - b.at)
    .forEach((outcome) => {
      if (!firstByKey.has(outcome.key)) firstByKey.set(outcome.key, outcome);
    });

  const window = [...firstByKey.values()]
    .sort((a, b) => b.at - a.at)
    .slice(0, windowSize);
  const correctItems = window.filter((outcome) => outcomeCountsAsMastery(outcome, normalizedPolicy));
  const covered = coverage.filter((key) => correctItems.some((outcome) => outcome.coverageKey === key));
  const missing = coverage.filter((key) => !covered.includes(key));

  const enoughItems = window.length >= windowSize;
  const enoughCorrect = correctItems.length >= requiredCorrect;
  const coverageMet = !requireSkillCoverage || missing.length === 0;
  const met = enoughItems && enoughCorrect && coverageMet;

  return {
    met,
    percent: Math.round((correctItems.length / windowSize) * 100),
    correct: correctItems.length,
    considered: window.length,
    windowSize,
    requiredCorrect,
    remainingItems: Math.max(0, windowSize - window.length),
    coverage: { required: coverage, covered, missing },
    itemKeys: window.map((outcome) => outcome.key),
    reason: met
      ? 'mastery-met'
      : !enoughItems
        ? 'more-items-needed'
        : !enoughCorrect ? 'more-correct-needed' : 'skill-coverage-needed',
  };
};

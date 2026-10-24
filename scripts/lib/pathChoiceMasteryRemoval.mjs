/*
 * REMOVING PRE-#456 MY MATH PATH CHOICE MISSES FROM MASTERY, AS A PURE PLAN.
 *
 * Before hotfix #456 every multiple-choice answer on My Math Path was recorded
 * wrong, the right option included (scripts/lib/pathChoiceIdRegradePlan.mjs
 * explains why, and why no stored record can be re-graded). The owner decided
 * (MP19, 2026-10-23): after the read-only report, remove those answers from
 * mastery AS NOT ATTEMPTED. scripts/remove-path-choice-misses-from-mastery.mjs
 * reads and writes; this module decides, one student at a time. No Firestore,
 * no clock.
 *
 * WHAT "NOT ATTEMPTED" MEANS HERE. A mastery profile entry keeps one row per
 * question (functions/shared/masteryScoring.mjs): the contribution of the
 * question's final attempt, and sums that are the rows' total. A question whose
 * counted row is a listed answer loses that row and its share of the sums,
 * and every number the entry derives (estimate, status, confidence, the
 * dimensions) is computed again exactly as the trigger computes it — so the
 * entry equals the one the trigger would have built had that question never
 * been answered (tests/platform/pathChoiceMasteryRemoval.test.mjs proves it
 * against applyMasteryEvent). A DOK level or question family the listed
 * answers alone represented goes with them.
 *
 * WHAT IS LEFT ALONE, AND WHY. Each listed answer is one evidence event, and an
 * event is removed whole or not at all:
 *
 *   superseded       a later attempt at the same question is the one counted:
 *                    the listed answer no longer counts, nothing to remove;
 *   never applied    the trigger never applied it (no application marker, no
 *                    row): nothing to remove;
 *   awaiting rescore the skill's entry predates per-question rows (the old
 *                    trigger's sums): its share cannot be told apart. The void
 *                    is recorded, and scripts/backfill-mastery-scoring.mjs
 *                    leaves voided answers out when it rescores that student;
 *   REFUSED          the row was compacted away (its share is folded into the
 *                    sums for good), or the question has an attempt that is not
 *                    listed: removing only part of it would invent a final
 *                    attempt. Nothing about that answer changes; the report
 *                    names it for the owner.
 *
 * WHAT IT RECORDS. `voidedEvidence` on studentMasteryProfiles/{studentId}, one
 * entry per removed answer (keyed by its application-marker id): the event, why
 * it was voided, and what it changed in each skill. Evidence events, their
 * markers, grades and Path sessions are never written. Idempotent: an answer
 * already in `voidedEvidence` is skipped, so a second run writes nothing.
 */
import { classifyMasteryStatus } from '../../functions/shared/masteryRule.mjs';
import { masteredEvidenceSnapshot, masteryEventFacts } from '../../functions/shared/masteryScoring.mjs';

export const PATH_CHOICE_VOID_REASON = 'path-choice-id-before-hotfix-456';
export const VOIDED_EVIDENCE_FIELD = 'voidedEvidence';

export const REMOVAL_OUTCOME = Object.freeze({
  REMOVED: 'removed',
  SUPERSEDED: 'superseded-by-a-later-attempt',
  NEVER_APPLIED: 'never-applied',
  AWAITING_RESCORE: 'awaiting-rescore',
  SKILL_NOT_IN_PROFILE: 'skill-not-in-profile',
  // Refusals: nothing about the answer changes.
  ROW_COMPACTED: 'refused-row-compacted',
  OTHER_ATTEMPTS: 'refused-question-has-unlisted-attempts',
  EVIDENCE_NOT_FOUND: 'refused-evidence-not-found',
});

const REFUSALS = new Set([REMOVAL_OUTCOME.ROW_COMPACTED, REMOVAL_OUTCOME.OTHER_ATTEMPTS, REMOVAL_OUTCOME.EVIDENCE_NOT_FOUND]);
export const isRefusal = (outcome) => REFUSALS.has(outcome);

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const SUM_KEYS = Object.freeze([
  ['effectiveWeight', 'w'],
  ['weightedScoreSum', 'c'],
  ['eligibleEvents', 'e'],
  ['modifiedEvents', 'm'],
  ['independentSuccesses', 's'],
]);

/** The key a voided answer is recorded under: its mastery application marker's id. */
export const voidRecordKey = (studentId, eventKey, helpers) => helpers.opaqueId('mastery', studentId, eventKey);

// The trigger's own confidence bands (masteryScoring.mjs confidenceFor), and
// its entry, rebuilt from sums that lost a question. The parity test holds
// these to applyMasteryEvent.
const confidenceFor = ({ eligibleEvents, effectiveWeight, dokRepresented }) => (
  eligibleEvents >= 8 && effectiveWeight >= 5 && dokRepresented.length >= 2 ? 'High'
    : eligibleEvents >= 4 && effectiveWeight >= 2.4 ? 'Medium' : 'Low'
);

const entryWithout = (prior, { questionIds, dokRepresented, familiesRepresented, code, now }) => {
  const questions = { ...prior.questions };
  const accumulator = prior.accumulator || {};
  const sums = Object.fromEntries(SUM_KEYS.map(([key]) => [key, num(accumulator[key])]));
  questionIds.forEach((id) => {
    const row = questions[id];
    SUM_KEYS.forEach(([key, short]) => { sums[key] -= num(row?.[short]); });
    delete questions[id];
  });
  // Floating-point subtraction can leave -1e-17; nothing here is negative.
  Object.keys(sums).forEach((key) => { sums[key] = Math.max(0, Math.round(sums[key] * 1e9) / 1e9); });
  const estimate = sums.effectiveWeight > 0 ? Math.round((sums.weightedScoreSum / sums.effectiveWeight) * 100) : null;
  const status = classifyMasteryStatus({
    estimate,
    eligibleEvents: sums.eligibleEvents,
    effectiveWeight: sums.effectiveWeight,
    independentSuccesses: sums.independentSuccesses,
    dokRepresented,
  });
  const entry = {
    ...prior,
    teksCode: code,
    mastery: { estimate, observedPerformance: estimate, status, confidence: confidenceFor({ ...sums, dokRepresented }) },
    signals: { ...prior.signals, breadth: dokRepresented.length >= 2 ? 'broad' : 'developing', retention: prior.signals?.retention || 'stable' },
    dimensions: {
      ...prior.dimensions,
      eligibleGradeLevelEvents: sums.eligibleEvents,
      modifiedEvidenceEvents: sums.modifiedEvents,
      independentSuccesses: sums.independentSuccesses,
      dokRepresented,
      familiesRepresented,
      // A listed answer was recorded wrong, so it was never an independent success.
      lastIndependentSuccessAt: prior.dimensions?.lastIndependentSuccessAt || null,
    },
    accumulator: sums,
    questions,
    recommendation: { reason: status === 'Needs Attention' ? 'Rebuild this skill with targeted grade-level support.' : 'Continue building independent accuracy and breadth.' },
    updatedAt: now,
  };
  // Kept once reached (growth rewards read it), as the trigger keeps it.
  const masteredEvidence = masteredEvidenceSnapshot(entry);
  if (masteredEvidence) entry.masteredEvidence = masteredEvidence;
  return entry;
};

const summaryOf = (entry) => (entry ? {
  estimate: entry.mastery?.estimate ?? null,
  status: entry.mastery?.status ?? null,
  confidence: entry.mastery?.confidence ?? null,
  eligibleEvents: num(entry.accumulator?.eligibleEvents ?? entry.dimensions?.eligibleGradeLevelEvents),
} : null);

/**
 * One student's plan.
 *
 *   stored   the studentMasteryProfiles document (or null)
 *   events   [{ id, evidence }] — every grades/{studentId}/evidenceEvents document
 *   listed   [{ eventId, eventKey, evidencePath, submissionDocId, applied }] —
 *            the report's flagged answers for this student (`applied`: the
 *            report found the event's mastery application marker)
 *   helpers  functions/lib/mathPath.js
 *
 * Returns { action: 'write'|'nothing', document?, answers, changes, counts }.
 */
export const planStudentChoiceMissRemoval = ({ studentId, stored = null, events = [], listed = [], helpers, now = Date.now() }) => {
  const answers = [];
  const counts = { listed: 0, alreadyVoided: 0, voided: 0, refused: 0, rowsRemoved: 0 };
  const priorVoids = isObject(stored?.[VOIDED_EVIDENCE_FIELD]) ? stored[VOIDED_EVIDENCE_FIELD] : {};
  const profiles = isObject(stored?.profiles) ? stored.profiles : null;
  const eventsById = new Map((Array.isArray(events) ? events : []).map((entry) => [String(entry.id), entry.evidence || {}]));
  const factsOf = (id, evidence) => masteryEventFacts(evidence, helpers, { eventId: id });

  // The listed answers still to consider, with their mastery facts.
  const pending = [];
  (Array.isArray(listed) ? listed : []).forEach((item) => {
    counts.listed += 1;
    const eventId = String(item.eventId || '');
    const evidence = eventsById.get(eventId);
    const eventKey = String(evidence?.eventKey || item.eventKey || eventId);
    const key = voidRecordKey(studentId, eventKey, helpers);
    if (priorVoids[key]) {
      counts.alreadyVoided += 1;
      answers.push({ eventId, eventKey, outcome: 'already-voided' });
      return;
    }
    if (!evidence) {
      counts.refused += 1;
      answers.push({ eventId, eventKey, outcome: REMOVAL_OUTCOME.EVIDENCE_NOT_FOUND });
      return;
    }
    pending.push({ ...item, eventId, eventKey, key, evidence, facts: factsOf(eventId, evidence) });
  });
  if (!pending.length || !profiles) {
    if (!profiles) {
      pending.forEach((item) => answers.push({ eventId: item.eventId, eventKey: item.eventKey, outcome: 'no-mastery-profile' }));
    }
    return { action: 'nothing', answers, changes: [], counts };
  }

  const pendingIds = new Set(pending.map((item) => item.eventId));
  // Every evidence event of this student that is NOT being voided now (and
  // was not voided before), with its facts: the attempts that still count.
  const priorVoidedKeys = new Set(Object.values(priorVoids).map((entry) => String(entry?.eventKey || '')));
  const remaining = [...eventsById.entries()]
    .filter(([id, evidence]) => !pendingIds.has(id) && !priorVoidedKeys.has(String(evidence?.eventKey || id)))
    .map(([id, evidence]) => factsOf(id, evidence));

  // Decide each (skill, question) a listed answer touches.
  const groups = new Map();
  pending.forEach((item) => item.facts.codes.forEach((code) => {
    const groupKey = `${code}\u0000${item.facts.questionId}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { code, questionId: item.facts.questionId, items: [] });
    groups.get(groupKey).items.push(item);
  }));
  const outcomeOf = new Map();
  groups.forEach((group) => {
    const entry = profiles[group.code];
    const row = entry?.questions?.[group.questionId];
    const counted = row && group.items.some((item) => item.facts.attemptNumber === num(row.n) && item.facts.occurredAt === num(row.t));
    let outcome;
    if (!entry) outcome = REMOVAL_OUTCOME.SKILL_NOT_IN_PROFILE;
    else if (!isObject(entry.questions)) outcome = REMOVAL_OUTCOME.AWAITING_RESCORE;
    else if (!row) outcome = group.items.some((item) => item.applied === true) ? REMOVAL_OUTCOME.ROW_COMPACTED : REMOVAL_OUTCOME.NEVER_APPLIED;
    else if (!counted) outcome = REMOVAL_OUTCOME.SUPERSEDED;
    else if (remaining.some((facts) => facts.questionId === group.questionId && facts.codes.includes(group.code))) outcome = REMOVAL_OUTCOME.OTHER_ATTEMPTS;
    else outcome = REMOVAL_OUTCOME.REMOVED;
    group.outcome = outcome;
    group.items.forEach((item) => {
      const previous = outcomeOf.get(item.eventId) || [];
      outcomeOf.set(item.eventId, [...previous, { code: group.code, outcome }]);
    });
  });

  // An answer is voided whole, or not at all.
  const voidedNow = pending.filter((item) => !(outcomeOf.get(item.eventId) || []).some(({ outcome }) => isRefusal(outcome)));
  const voidedIds = new Set(voidedNow.map((item) => item.eventId));
  pending.forEach((item) => {
    const skills = outcomeOf.get(item.eventId) || [];
    const refused = !voidedIds.has(item.eventId);
    if (refused) counts.refused += 1;
    else counts.voided += 1;
    answers.push({ eventId: item.eventId, eventKey: item.eventKey, outcome: refused ? 'refused' : 'voided', skills });
  });
  if (!voidedNow.length) return { action: 'nothing', answers, changes: [], counts };

  // Rows to remove, per skill: groups whose answers are all voided now.
  const removeBySkill = new Map();
  groups.forEach((group) => {
    if (group.outcome !== REMOVAL_OUTCOME.REMOVED) return;
    if (!group.items.every((item) => voidedIds.has(item.eventId))) return;
    if (!removeBySkill.has(group.code)) removeBySkill.set(group.code, []);
    removeBySkill.get(group.code).push(group.questionId);
  });

  const nextProfiles = { ...profiles };
  const changes = [];
  removeBySkill.forEach((questionIds, code) => {
    const prior = profiles[code];
    // A DOK level or family the voided answers alone stood for goes with them.
    const stillShown = remaining.filter((facts) => facts.codes.includes(code));
    const voidedHere = voidedNow.filter((item) => item.facts.codes.includes(code));
    const onlyVoided = (pick) => new Set(voidedHere.map((item) => pick(item.facts)).filter((value) => value != null
      && !stillShown.some((facts) => pick(facts) === value)));
    const droppedDok = onlyVoided((facts) => facts.dok);
    const droppedFamilies = onlyVoided((facts) => facts.familyId);
    const dokRepresented = (prior.dimensions?.dokRepresented || []).filter((dok) => !droppedDok.has(Number(dok)));
    const familiesRepresented = (prior.dimensions?.familiesRepresented || []).filter((family) => !droppedFamilies.has(family));
    const next = entryWithout(prior, { questionIds, dokRepresented, familiesRepresented, code, now });
    nextProfiles[code] = next;
    counts.rowsRemoved += questionIds.length;
    changes.push({ code, questionsRemoved: questionIds.length, from: summaryOf(prior), to: summaryOf(next) });
  });

  const records = { ...priorVoids };
  voidedNow.forEach((item) => {
    records[item.key] = {
      eventKey: item.eventKey,
      evidencePath: item.evidencePath || `grades/${studentId}/evidenceEvents/${item.eventId}`,
      submissionDocId: item.submissionDocId || null,
      reason: PATH_CHOICE_VOID_REASON,
      skills: outcomeOf.get(item.eventId) || [],
      voidedAt: now,
    };
  });
  return {
    action: 'write',
    answers,
    changes,
    counts,
    document: { ...stored, profiles: nextProfiles, [VOIDED_EVIDENCE_FIELD]: records, studentId, updatedAt: now },
  };
};

/** Is `status` lower than `previous` (Mastered … Not Enough Evidence)? */
export const statusFell = (previous, status) => {
  const order = ['Not Enough Evidence', 'Needs Attention', 'Developing', 'Secure', 'Mastered'];
  return order.indexOf(status) < order.indexOf(previous);
};

/** The evidence events a stored profile has voided, for a rescore to leave out. */
export const voidedEventKeys = (stored) => new Set(Object.values(isObject(stored?.[VOIDED_EVIDENCE_FIELD]) ? stored[VOIDED_EVIDENCE_FIELD] : {})
  .map((entry) => String(entry?.eventKey || ''))
  .filter(Boolean));

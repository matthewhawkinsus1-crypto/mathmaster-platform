/*
 * WHAT "MASTERED" MEANS — ONE DEFINITION, READ BY EVERY SCREEN.
 *
 * Before this module there were two. The Path map, Recommended for You,
 * prerequisite locks and Challenge unlocks called a skill mastered at an
 * assignment-only score of 0.9; the mastery wheel and the weekly planner read
 * the server's Path evidence, where Mastered needs 85+ AND four eligible
 * events AND two independent successes AND a DOK-3 item. A student could be
 * "Mastered" on the map and "Secure" on the wheel for the same skill.
 *
 * The server trigger (updateMyMathPathMasteryFromEvidence) classifies with
 * this function, the client's assignment-evidence fallback classifies with it,
 * and the path engine reads the resulting status — so there is one rule.
 *
 * Pure: no Firestore. Shared by Cloud Functions and the browser.
 */

export const MASTERY_STATUS = Object.freeze({
  MASTERED: 'Mastered',
  SECURE: 'Secure',
  DEVELOPING: 'Developing',
  NEEDS_ATTENTION: 'Needs Attention',
  NOT_ENOUGH_EVIDENCE: 'Not Enough Evidence',
});

export const MASTERY_RULE = Object.freeze({
  // Before any label: at least two eligible events carrying real weight.
  minimumEvents: 2,
  minimumWeight: 1.1,
  // Mastered.
  masteredEstimate: 85,
  masteredEvents: 4,
  masteredIndependentSuccesses: 2,
  masteredDok: 3,
  // The bands below Mastered.
  secureEstimate: 70,
  developingEstimate: 50,
});

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const doks = (value) => (Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : []);

// Lowest to highest. "Not Enough Evidence" sits lowest: it is never a reason
// to raise a status, and the more favourable record never sets it.
const STATUS_ORDER = [
  MASTERY_STATUS.NOT_ENOUGH_EVIDENCE,
  MASTERY_STATUS.NEEDS_ATTENTION,
  MASTERY_STATUS.DEVELOPING,
  MASTERY_STATUS.SECURE,
  MASTERY_STATUS.MASTERED,
];

/** 0 (Not Enough Evidence) … 4 (Mastered); -1 for anything else. */
export const masteryStatusRank = (status) => STATUS_ORDER.indexOf(status);

/*
 * THE MORE FAVOURABLE RECORD (product decision 8, coordinator decision on
 * PR #467): every screen reads a skill as "the higher number, and Mastered
 * when either record says so" — the server's evidence profile or the student's
 * assignment record (one score per question; Mastered at 0.9, the cut-off main's
 * Path engine applied). The browser attaches the assignment record's side to a
 * profile as `favourableRecord` (src/platform/mastery/unifiedMastery.js), and
 * because every reader classifies through this rule, the wheel, its card, the
 * weekly planner, the Path map, locks and the topic browser all agree. It only
 * ever raises: a status, the score and the evidence weight. The server never
 * stores it.
 */
const validRecord = (record) => (record && typeof record === 'object' && !Array.isArray(record) ? record : null);
/**
 * The status for one skill's evidence. Inputs are the accumulator facts the
 * server keeps: estimate (0–100), eligible events, effective weight,
 * independent successes and the DOK levels represented.
 */
export const classifyMasteryStatus = ({
  estimate = null,
  eligibleEvents = 0,
  effectiveWeight = 0,
  independentSuccesses = 0,
  dokRepresented = [],
  favourableRecord = null,
} = {}) => {
  const earned = classifyEarnedStatus({ estimate, eligibleEvents, effectiveWeight, independentSuccesses, dokRepresented });
  const record = validRecord(favourableRecord);
  // Only a real status raises one: a record never sets "Not Enough Evidence".
  return record && masteryStatusRank(record.status) > Math.max(0, masteryStatusRank(earned)) ? record.status : earned;
};

const classifyEarnedStatus = ({ estimate, eligibleEvents, effectiveWeight, independentSuccesses, dokRepresented }) => {
  const rule = MASTERY_RULE;
  if (num(eligibleEvents) < rule.minimumEvents || num(effectiveWeight) < rule.minimumWeight) {
    return MASTERY_STATUS.NOT_ENOUGH_EVIDENCE;
  }
  const score = num(estimate);
  if (
    score >= rule.masteredEstimate
    && num(eligibleEvents) >= rule.masteredEvents
    && num(independentSuccesses) >= rule.masteredIndependentSuccesses
    && doks(dokRepresented).some((value) => value >= rule.masteredDok)
  ) return MASTERY_STATUS.MASTERED;
  if (score >= rule.secureEstimate) return MASTERY_STATUS.SECURE;
  if (score >= rule.developingEstimate) return MASTERY_STATUS.DEVELOPING;
  return MASTERY_STATUS.NEEDS_ATTENTION;
};

/**
 * The facts the rule reads, from a Phase 5 mastery profile. The more
 * favourable record lifts the score and the evidence weight to its own, so a
 * screen that shows either number agrees with the status.
 */
export const masteryFactsFromProfile = (profile = {}) => {
  const record = validRecord(profile?.favourableRecord);
  const stored = profile?.mastery?.estimate ?? null;
  const weight = num(profile?.accumulator?.effectiveWeight ?? profile?.dimensions?.effectiveWeight
    ?? profile?.dimensions?.eligibleGradeLevelEvents);
  const recordEstimate = record && record.estimate != null && Number.isFinite(Number(record.estimate)) ? Number(record.estimate) : null;
  // At or above the stored number: a merged profile already shows the
  // record's number as its own (unifiedMastery.js), and it is still the
  // record's number.
  const recordLeads = recordEstimate != null && (stored == null || Number(stored) <= recordEstimate);
  const events = num(profile?.accumulator?.eligibleEvents ?? profile?.dimensions?.eligibleGradeLevelEvents);
  return {
    estimate: recordLeads ? recordEstimate : stored,
    // The questions the shown number rests on: the record's when its number
    // is the one shown (as the Path map has always counted them).
    eligibleEvents: recordLeads && Number(record.items) > 0 ? num(record.items) : events,
    effectiveWeight: record ? Math.max(weight, num(record.effectiveWeight)) : weight,
    independentSuccesses: num(profile?.accumulator?.independentSuccesses ?? profile?.dimensions?.independentSuccesses),
    dokRepresented: doks(profile?.dimensions?.dokRepresented),
    favourableRecord: record,
  };
};

export const isMasteredProfile = (profile) => (
  classifyMasteryStatus(masteryFactsFromProfile(profile)) === MASTERY_STATUS.MASTERED
);

/**
 * "What's left to master this", straight from the rule. Every item is a fact
 * the student can act on; nothing here reveals a question or an answer.
 */
export const masteryChecklist = (profile = {}) => {
  const rule = MASTERY_RULE;
  const facts = masteryFactsFromProfile(profile);
  const estimate = facts.estimate == null ? null : Math.round(num(facts.estimate));
  const highestDok = facts.dokRepresented.length ? Math.max(...facts.dokRepresented) : null;
  const items = [
    {
      key: 'questions',
      label: `Answer at least ${rule.masteredEvents} questions on this skill`,
      met: facts.eligibleEvents >= rule.masteredEvents,
      progress: `${Math.min(facts.eligibleEvents, rule.masteredEvents)} of ${rule.masteredEvents}`,
    },
    {
      key: 'accuracy',
      label: `Reach ${rule.masteredEstimate}% or higher`,
      met: estimate != null && estimate >= rule.masteredEstimate,
      progress: estimate == null ? 'No score yet' : `Now ${estimate}%`,
    },
    {
      key: 'independent',
      label: `Get ${rule.masteredIndependentSuccesses} right on your own — no hints, worked steps or read-aloud of the math`,
      met: facts.independentSuccesses >= rule.masteredIndependentSuccesses,
      progress: `${Math.min(facts.independentSuccesses, rule.masteredIndependentSuccesses)} of ${rule.masteredIndependentSuccesses}`,
    },
    {
      key: 'dok3',
      label: 'Work a harder, multi-step question (DOK 3)',
      met: highestDok != null && highestDok >= rule.masteredDok,
      progress: highestDok == null ? 'Not yet' : `Hardest so far: DOK ${highestDok}`,
    },
  ];
  const status = classifyMasteryStatus(facts);
  const mastered = status === MASTERY_STATUS.MASTERED;
  // Mastered on the more favourable record (the assignment work) while the
  // evidence checklist is not all met: the card says so in one line instead
  // of "You have mastered this skill" above unmet counts.
  const byRecord = mastered && classifyMasteryStatus({ ...facts, favourableRecord: null }) !== MASTERY_STATUS.MASTERED
    && items.some((item) => !item.met);
  return {
    status,
    mastered,
    masteredBy: mastered ? (byRecord ? 'assignmentRecord' : 'evidence') : null,
    items: byRecord
      ? [{ key: 'assignmentRecord', label: 'Mastered in your assignment work', met: true, progress: estimate == null ? 'Mastered' : `${estimate}%` }]
      : items,
    remaining: byRecord ? 0 : items.filter((item) => !item.met).length,
  };
};

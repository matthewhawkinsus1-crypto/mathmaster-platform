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
// to keep a floor up, and a floor never sets it.
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
 * A FLOOR: what deploy day guaranteed this student (product decision 8).
 *
 * When the server began scoring each question once, a one-off backfill
 * (scripts/backfill-mastery-scoring.mjs) wrote, per skill, the status and
 * score the student already had — on the server's profile or on main's Path
 * map — wherever the new scoring gives less. Every reader classifies through
 * this rule, so the map, the wheel, its card and the planner all honour it,
 * and the trigger removes it once the student's own evidence reaches it
 * (masteryScoring.mjs). A floor only ever raises a status.
 */
const validFloor = (floor) => (floor && typeof floor === 'object' && !Array.isArray(floor) ? floor : null);

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
  floor = null,
} = {}) => {
  const earned = classifyEarnedStatus({ estimate, eligibleEvents, effectiveWeight, independentSuccesses, dokRepresented });
  const kept = validFloor(floor);
  // Only a real status raises one: a floor never sets "Not Enough Evidence".
  return kept && masteryStatusRank(kept.status) > Math.max(0, masteryStatusRank(earned)) ? kept.status : earned;
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
 * The facts the rule reads, from a stored Phase 5 mastery profile. A floor
 * lifts the score and the evidence weight to what it guarantees, so a screen
 * that shows either number agrees with the status.
 */
export const masteryFactsFromProfile = (profile = {}) => {
  const floor = validFloor(profile?.floor);
  const stored = profile?.mastery?.estimate ?? null;
  const weight = num(profile?.accumulator?.effectiveWeight ?? profile?.dimensions?.effectiveWeight
    ?? profile?.dimensions?.eligibleGradeLevelEvents);
  const floorEstimate = floor && floor.estimate != null && Number.isFinite(Number(floor.estimate)) ? Number(floor.estimate) : null;
  return {
    estimate: floorEstimate != null && (stored == null || Number(stored) < floorEstimate) ? floorEstimate : stored,
    eligibleEvents: num(profile?.accumulator?.eligibleEvents ?? profile?.dimensions?.eligibleGradeLevelEvents),
    effectiveWeight: floor ? Math.max(weight, num(floor.effectiveWeight)) : weight,
    independentSuccesses: num(profile?.accumulator?.independentSuccesses ?? profile?.dimensions?.independentSuccesses),
    dokRepresented: doks(profile?.dimensions?.dokRepresented),
    floor,
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
  return {
    status,
    mastered: status === MASTERY_STATUS.MASTERED,
    items,
    remaining: items.filter((item) => !item.met).length,
  };
};

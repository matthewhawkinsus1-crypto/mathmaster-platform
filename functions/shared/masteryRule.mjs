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
} = {}) => {
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

/** The facts the rule reads, from a stored Phase 5 mastery profile. */
export const masteryFactsFromProfile = (profile = {}) => ({
  estimate: profile?.mastery?.estimate ?? null,
  eligibleEvents: num(profile?.accumulator?.eligibleEvents ?? profile?.dimensions?.eligibleGradeLevelEvents),
  effectiveWeight: num(profile?.accumulator?.effectiveWeight ?? profile?.dimensions?.effectiveWeight
    ?? profile?.dimensions?.eligibleGradeLevelEvents),
  independentSuccesses: num(profile?.accumulator?.independentSuccesses ?? profile?.dimensions?.independentSuccesses),
  dokRepresented: doks(profile?.dimensions?.dokRepresented),
});

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

// The Student Learning Profile — one answer to "how is this student doing?"
//
// WHY THIS EXISTS. An audit of this repository found FOUR independently written
// tables mapping the same mastery status to the same labels, TWO functions
// named `resolveAdaptiveRigor` with different return shapes, and five separate
// vocabularies for confidence. Every screen that wanted to say something about
// a student worked it out again, slightly differently. That is how a roster and
// a Path panel come to disagree about the same child.
//
// This module does not invent a new source of truth. It DERIVES one view from
// the existing authoritative records:
//
//   studentMasteryProfiles/{id}.profiles[teks]  the server's per-TEKS mastery
//   grades/{id}/evidenceEvents                  the immutable evidence trail
//   studentRetentionSchedules/{id}              the retention schedule
//
// Four of the dimensions below were already being computed somewhere and thrown
// away every render — difficulty capacity, CCMR transfer, foundation depth, and
// the performance projection. Three were genuinely missing: per-DOK
// performance, the instructional band, and a named baseline state.
//
// Pure. No clock unless one is passed, no storage, no React.

/** Not enough evidence to say anything a teacher should act on. */
export const BASELINE = 'establishingBaseline';

export const INSTRUCTIONAL_BAND = Object.freeze({
  BELOW: 'below',
  ON: 'on',
  ABOVE: 'above',
  BASELINE,
});

export const PERFORMANCE_PROJECTION = Object.freeze({
  DID_NOT_MEET: 'didNotMeet',
  APPROACHES: 'approaches',
  MEETS: 'meets',
  MASTERS: 'masters',
  BASELINE,
});

export const BAND_LABEL = Object.freeze({
  [INSTRUCTIONAL_BAND.BELOW]: 'Below Level',
  [INSTRUCTIONAL_BAND.ON]: 'On Level',
  [INSTRUCTIONAL_BAND.ABOVE]: 'Above Level',
  [BASELINE]: 'Establishing Baseline',
});

export const PROJECTION_LABEL = Object.freeze({
  [PERFORMANCE_PROJECTION.DID_NOT_MEET]: 'Did Not Meet',
  [PERFORMANCE_PROJECTION.APPROACHES]: 'Approaches',
  [PERFORMANCE_PROJECTION.MEETS]: 'Meets',
  [PERFORMANCE_PROJECTION.MASTERS]: 'Masters',
  [BASELINE]: 'Establishing Baseline',
});

/** Completion is an ENGAGEMENT signal and is never mixed into the academic ones. */
export const ENGAGEMENT = Object.freeze({
  ON_TRACK: 'onTrack',
  INCONSISTENT: 'inconsistentCompletion',
  NEEDS_FOLLOW_UP: 'needsFollowUp',
});

export const ENGAGEMENT_LABEL = Object.freeze({
  [ENGAGEMENT.ON_TRACK]: 'On Track',
  [ENGAGEMENT.INCONSISTENT]: 'Inconsistent Completion',
  [ENGAGEMENT.NEEDS_FOLLOW_UP]: 'Needs Follow-Up',
});

/**
 * How much evidence is needed before a teacher-facing label is shown.
 *
 * A brand-new student must not be called Below Level after four questions.
 * These are the brief's starting figures and are deliberately configurable:
 * they are a policy, not a law of nature.
 */
export const BASELINE_REQUIREMENT = Object.freeze({
  events: 12,
  distinctSkills: 3,
  distinctSources: 2,
});

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const list = (value) => (Array.isArray(value) ? value : []);
const ratio = (correct, total) => (total > 0 ? clamp01(correct / total) : null);

/**
 * Evidence that can support a classification.
 *
 * Deliberately strict. A teacher-forced correction is not the student's
 * mathematics; a modified task measures a different construct; an unfinished
 * question is MISSING evidence, not wrong evidence. Counting any of those would
 * turn a completion problem into an academic verdict, which is the single
 * confusion this module exists to prevent.
 */
/**
 * TWO WRITERS, TWO VOCABULARIES, ONE RULE.
 *
 * My Math Path evidence is written by the server and says `finalized` or
 * `attempted`. Assignment evidence is written by the browser and carries the
 * attempt record's own status — `correct`, `incorrect`, `expired`,
 * `attempted`, `unattempted`.
 *
 * Accepting only `finalized` meant EVERY piece of assignment evidence was
 * silently dropped from the profile: classwork, practice, DOL, quizzes and
 * tests — the overwhelming majority of what a student actually does — while
 * only Path sessions counted. The badge, the bands and every recommendation
 * drawn from them were built from a small and unrepresentative slice.
 *
 * `expired` is deliberately terminal-and-counting: the student ran out of time
 * on a timed question, which is a real outcome, not an absence. `attempted` is
 * deliberately not: the question is still open.
 */
const TERMINAL_STATUSES = new Set(['finalized', 'correct', 'incorrect', 'expired']);

export const isClassifyingEvidence = (event) => {
  if (!event || typeof event !== 'object') return false;
  if (!TERMINAL_STATUSES.has(String(event.performance?.status || ''))) return false;
  if (event.supportUsage?.modified) return false;
  if (event.teacherForced || event.source?.teacherForced) return false;
  return true;
};

/** Which activity produced this evidence — used for the "two sources" rule. */
const sourceOf = (event) => String(
  event?.source?.activityRole || event?.source?.kind || 'unknown',
);

/**
 * Per-DOK performance. Genuinely new: the platform tracked WHICH DOK levels a
 * student had met, never how they did at each.
 *
 * This is the dimension that separates "cannot do the arithmetic" from "cannot
 * plan an approach", and neither is visible from an overall percentage.
 */
export const buildDokProfile = (events = []) => {
  const buckets = {};
  list(events).filter(isClassifyingEvidence).forEach((event) => {
    const dok = Number(event.questionSnapshot?.dok);
    if (!Number.isFinite(dok) || dok < 1 || dok > 4) return;
    if (!buckets[dok]) buckets[dok] = { attempts: 0, correct: 0 };
    buckets[dok].attempts += 1;
    if (event.performance?.isCorrect) buckets[dok].correct += 1;
  });
  const profile = {};
  Object.entries(buckets).forEach(([dok, bucket]) => {
    profile[dok] = {
      attempts: bucket.attempts,
      accuracy: ratio(bucket.correct, bucket.attempts),
      // Below this the number is a rumour, and a diagnosis built on it would be
      // one too.
      confident: bucket.attempts >= 4,
    };
  });
  return profile;
};

/**
 * Difficulty capacity: the highest band at which the student is reliably
 * succeeding, plus the band they are working at.
 *
 * `stableBand` is the honest answer to "what can this student do unaided right
 * now", and it moves slowly on purpose.
 */
export const buildDifficultyProfile = (events = []) => {
  const buckets = {};
  list(events).filter(isClassifyingEvidence).forEach((event) => {
    const band = Number(event.questionSnapshot?.difficultyBand);
    if (!Number.isFinite(band) || band < 1 || band > 5) return;
    if (!buckets[band]) buckets[band] = { attempts: 0, correct: 0 };
    buckets[band].attempts += 1;
    if (event.performance?.isCorrect) buckets[band].correct += 1;
  });

  const byBand = {};
  Object.entries(buckets).forEach(([band, bucket]) => {
    byBand[band] = { attempts: bucket.attempts, accuracy: ratio(bucket.correct, bucket.attempts) };
  });

  // The highest band with enough evidence AND a solid success rate. Walked from
  // the top so a student who has genuinely moved up is credited for it.
  let stableBand = null;
  for (let band = 5; band >= 1; band -= 1) {
    const bucket = byBand[band];
    if (bucket && bucket.attempts >= 3 && bucket.accuracy >= 0.7) { stableBand = band; break; }
  }
  // No band qualifies yet: report the band they are actually being given, so a
  // caller can say "working at 3, not yet stable" rather than nothing at all.
  const attemptedBands = Object.keys(byBand).map(Number).sort((a, b) => a - b);
  return {
    byBand,
    stableBand,
    workingBand: stableBand ?? (attemptedBands.length ? attemptedBands[attemptedBands.length - 1] : null),
    evidenceCount: Object.values(buckets).reduce((sum, bucket) => sum + bucket.attempts, 0),
  };
};

/**
 * CCMR transfer, per framework.
 *
 * Only DIRECT exam-style evidence counts. A crosswalk says a standard is
 * related to an exam; it does not say the student can do the exam's version of
 * it, and treating the two the same is how a transfer gap gets hidden.
 */
export const buildTransferProfile = (events = []) => {
  const buckets = {};
  list(events).filter(isClassifyingEvidence).forEach((event) => {
    const framework = event.source?.assessmentFramework || event.assessmentFramework;
    if (!framework) return;
    const key = String(framework);
    if (!buckets[key]) buckets[key] = { attempts: 0, correct: 0 };
    buckets[key].attempts += 1;
    if (event.performance?.isCorrect) buckets[key].correct += 1;
  });
  const profile = {};
  Object.entries(buckets).forEach(([framework, bucket]) => {
    profile[framework] = {
      attempts: bucket.attempts,
      proficiency: ratio(bucket.correct, bucket.attempts),
      provisional: bucket.attempts < 5,
    };
  });
  return profile;
};

/** Course mastery and confidence, rolled up from the server's per-TEKS records. */
export const rollUpMastery = (profilesByTeks = {}) => {
  const entries = Object.values(profilesByTeks || {}).filter((entry) => (
    entry && Number.isFinite(Number(entry.mastery?.estimate))
  ));
  if (!entries.length) return { courseMastery: null, masteryConfidence: 0, skillsWithEvidence: 0 };

  const weighted = entries.reduce((total, entry) => {
    const events = Number(entry.dimensions?.eligibleGradeLevelEvents) || 1;
    return total + (Number(entry.mastery.estimate) / 100) * events;
  }, 0);
  const weight = entries.reduce((total, entry) => total + (Number(entry.dimensions?.eligibleGradeLevelEvents) || 1), 0);

  // Confidence is about the BREADTH and DEPTH of the evidence, not the score.
  const highConfidence = entries.filter((entry) => entry.mastery?.confidence === 'High').length;
  const mediumConfidence = entries.filter((entry) => entry.mastery?.confidence === 'Medium').length;
  const masteryConfidence = clamp01(
    (highConfidence * 1 + mediumConfidence * 0.6) / Math.max(1, entries.length),
  );

  return {
    courseMastery: weight > 0 ? clamp01(weighted / weight) : null,
    masteryConfidence,
    skillsWithEvidence: entries.length,
  };
};

/**
 * Is there enough evidence to put a label on this student?
 *
 * Three conditions, all of which must hold: enough events, across enough
 * different skills, from more than one kind of activity. One long warm-up is
 * not a picture of a learner.
 */
export const evaluateBaseline = (events = [], requirement = BASELINE_REQUIREMENT) => {
  const usable = list(events).filter(isClassifyingEvidence);
  const skills = new Set();
  const sources = new Set();
  usable.forEach((event) => {
    list(event.alignmentKeys).forEach((key) => skills.add(String(key)));
    sources.add(sourceOf(event));
  });
  const met = usable.length >= requirement.events
    && skills.size >= requirement.distinctSkills
    && sources.size >= requirement.distinctSources;
  return {
    established: met,
    events: usable.length,
    distinctSkills: skills.size,
    distinctSources: sources.size,
    requirement,
    // What is still missing, so a teacher screen can say so rather than just
    // showing a grey chip.
    shortfall: met ? null : {
      events: Math.max(0, requirement.events - usable.length),
      distinctSkills: Math.max(0, requirement.distinctSkills - skills.size),
      distinctSources: Math.max(0, requirement.distinctSources - sources.size),
    },
  };
};

/**
 * The instructional band, from difficulty capacity and cognitive demand.
 *
 * Band 3 is the anchor: it IS the normal independent course expectation, so
 * reliable success there is what "On Level" means. Above Level additionally
 * requires evidence of reasoning, because doing hard arithmetic quickly is not
 * the same as working above grade level.
 */
export const deriveInstructionalBand = ({
  difficultyProfile, dokProfile, foundationGapDepth = 0, baselineEstablished = false,
}) => {
  const stable = difficultyProfile?.stableBand ?? null;
  if (stable == null) {
    // NO STABLE BAND IS NOT THE SAME AS NO INFORMATION.
    //
    // A student who has attempted plenty and is holding at 70% nowhere is not
    // an open question — that IS the finding, and it is Below Level. Returning
    // Baseline here meant a struggling student with fourteen pieces of evidence
    // never resolved to a band, so the Foundation Bridge slot their weekly mix
    // depends on could not be requested for the students who most needed it.
    //
    // Thin evidence still yields Baseline: the distinction is whether we looked
    // and found nothing holding, or have not yet looked enough.
    const attempts = Number(difficultyProfile?.evidenceCount) || 0;
    if (baselineEstablished && attempts >= 6) return INSTRUCTIONAL_BAND.BELOW;
    return INSTRUCTIONAL_BAND.BASELINE;
  }

  const dok2 = dokProfile?.['2'];
  const dok3 = dokProfile?.['3'];
  const reasoningEvidence = (dok2?.confident && dok2.accuracy >= 0.7)
    || (dok3?.confident && dok3.accuracy >= 0.6);

  // A confirmed foundation gap is a statement about access to the course, and
  // it outranks a good run at an easy band.
  if (foundationGapDepth >= 2) return INSTRUCTIONAL_BAND.BELOW;
  if (stable <= 2) return INSTRUCTIONAL_BAND.BELOW;
  if (stable >= 4 && reasoningEvidence) return INSTRUCTIONAL_BAND.ABOVE;
  return INSTRUCTIONAL_BAND.ON;
};

/** The projection, from course mastery — labelled as a projection, never a result. */
export const deriveProjection = (courseMastery) => {
  if (courseMastery == null) return PERFORMANCE_PROJECTION.BASELINE;
  const percent = courseMastery * 100;
  if (percent >= 85) return PERFORMANCE_PROJECTION.MASTERS;
  if (percent >= 70) return PERFORMANCE_PROJECTION.MEETS;
  if (percent >= 55) return PERFORMANCE_PROJECTION.APPROACHES;
  return PERFORMANCE_PROJECTION.DID_NOT_MEET;
};

/** Engagement, from completion — kept strictly out of the academic labels. */
export const deriveEngagement = ({ assigned = 0, completed = 0, overdue = 0 }) => {
  if (assigned <= 0) return ENGAGEMENT.ON_TRACK;
  const rate = completed / assigned;
  if (overdue >= 3 || rate < 0.5) return ENGAGEMENT.NEEDS_FOLLOW_UP;
  if (overdue >= 1 || rate < 0.8) return ENGAGEMENT.INCONSISTENT;
  return ENGAGEMENT.ON_TRACK;
};

/**
 * Keep a visible label still.
 *
 * The internal estimate may move on every question; the teacher-facing band
 * must not. A label that flickers between Below and On Level after two answers
 * is worse than no label, because a teacher cannot plan around it.
 *
 * A change is accepted only when the new reading has held for enough new
 * evidence, OR when a meaningful independent assessment has landed.
 */
export const stabilizeBand = ({
  previous = null,
  candidate,
  eventsSincePreviousChange = 0,
  significantAssessment = false,
  minimumEvents = 6,
}) => {
  if (!previous || previous === BASELINE) {
    return { band: candidate, changed: previous !== candidate, reason: 'first_classification' };
  }
  if (candidate === previous) return { band: previous, changed: false, reason: 'unchanged' };
  if (significantAssessment) return { band: candidate, changed: true, reason: 'assessment_evidence' };
  if (eventsSincePreviousChange >= minimumEvents) {
    return { band: candidate, changed: true, reason: 'sustained_evidence' };
  }
  return {
    band: previous,
    changed: false,
    reason: 'held_pending_more_evidence',
    pendingCandidate: candidate,
  };
};

/**
 * Build the whole profile.
 *
 * Everything above, assembled — and nothing computed twice. A caller asks this
 * once and every screen shows the same answer.
 */
export const buildStudentLearningProfile = ({
  courseId = 'algebra1',
  masteryProfilesByTeks = {},
  evidenceEvents = [],
  retentionSchedules = {},
  foundationGapDepth = 0,
  completion = null,
  previousBand = null,
  eventsSincePreviousChange = 0,
  significantAssessment = false,
  baselineRequirement = BASELINE_REQUIREMENT,
} = {}) => {
  const baseline = evaluateBaseline(evidenceEvents, baselineRequirement);
  const dokProfile = buildDokProfile(evidenceEvents);
  const difficultyProfile = buildDifficultyProfile(evidenceEvents);
  const ccmrTransfer = buildTransferProfile(evidenceEvents);
  const { courseMastery, masteryConfidence, skillsWithEvidence } = rollUpMastery(masteryProfilesByTeks);

  // Retention strength: how much of what was mastered is still holding.
  const schedules = Object.values(retentionSchedules || {});
  const retained = schedules.filter((entry) => ['scheduled', 'retained'].includes(String(entry?.status))).length;
  const retentionStrength = schedules.length ? clamp01(retained / schedules.length) : null;

  // Until baseline is established, NOTHING teacher-facing is asserted. The
  // dimensions are still computed and returned, because a teacher may want to
  // see the evidence accumulating — but the labels stay honest.
  const candidateBand = baseline.established
    ? deriveInstructionalBand({
      difficultyProfile, dokProfile, foundationGapDepth, baselineEstablished: true,
    })
    : INSTRUCTIONAL_BAND.BASELINE;

  const stabilized = stabilizeBand({
    previous: previousBand,
    candidate: candidateBand,
    eventsSincePreviousChange,
    significantAssessment,
  });

  const projection = baseline.established
    ? deriveProjection(courseMastery)
    : PERFORMANCE_PROJECTION.BASELINE;
  const engagement = completion ? deriveEngagement(completion) : ENGAGEMENT.ON_TRACK;

  return {
    courseId,
    baseline,
    instructionalBand: stabilized.band,
    instructionalBandLabel: BAND_LABEL[stabilized.band],
    bandStability: stabilized,
    performanceProjection: projection,
    performanceProjectionLabel: PROJECTION_LABEL[projection],
    courseMastery,
    masteryConfidence,
    skillsWithEvidence,
    dokProfile,
    difficultyProfile,
    retentionStrength,
    ccmrTransfer,
    foundationGapDepth,
    // Engagement is returned beside the academic labels and never folded into
    // them. A student can be Above Level and Needs Follow-Up at the same time,
    // and a teacher needs to see both facts separately.
    engagement,
    engagementLabel: ENGAGEMENT_LABEL[engagement],
  };
};

export default buildStudentLearningProfile;

// --- Diagnosis ----------------------------------------------------------------
//
// The point of keeping DOK, difficulty, retention and transfer apart is that
// they answer different questions. Once they are separate, the shape of a
// student's evidence names the problem — and "62% overall" never could.

export const GAP = Object.freeze({
  PROCEDURAL: 'proceduralGap',
  CONCEPTUAL: 'conceptualGap',
  STRATEGIC: 'strategicReasoningGap',
  DIFFICULTY: 'difficultyComplexityGap',
  FOUNDATION: 'foundationGap',
  RETENTION: 'retentionGap',
  TRANSFER: 'ccmrTransferGap',
});

export const GAP_LABEL = Object.freeze({
  [GAP.PROCEDURAL]: 'Procedural gap',
  [GAP.CONCEPTUAL]: 'Conceptual gap',
  [GAP.STRATEGIC]: 'Strategic reasoning gap',
  [GAP.DIFFICULTY]: 'Difficulty / complexity gap',
  [GAP.FOUNDATION]: 'Foundation gap',
  [GAP.RETENTION]: 'Retention gap',
  [GAP.TRANSFER]: 'CCMR transfer gap',
});

/**
 * Name the gaps this evidence actually supports.
 *
 * Every branch requires CONFIDENT evidence on both sides of its comparison.
 * Diagnosing a reasoning gap from two DOK 3 questions would be worse than
 * saying nothing: a teacher would act on it.
 */
export const diagnoseGaps = (profile, { transferGapDelta = 0.2 } = {}) => {
  const found = [];
  if (!profile || !profile.baseline?.established) return found;

  const dok = profile.dokProfile || {};
  const dok1 = dok['1'];
  const dok2 = dok['2'];
  const dok3 = dok['3'];

  // Strong on recall and procedure, weak when a strategy has to be chosen.
  if (dok3?.confident && dok3.accuracy < 0.5
    && ((dok1?.confident && dok1.accuracy >= 0.8) || (dok2?.confident && dok2.accuracy >= 0.75))) {
    found.push({
      type: GAP.STRATEGIC,
      label: GAP_LABEL[GAP.STRATEGIC],
      detail: 'Recall and familiar procedures are holding; choosing an approach on an unfamiliar task is not.',
    });
  }

  // The inverse shape: reasoning is fine, execution is the bottleneck.
  if (dok1?.confident && dok1.accuracy < 0.7
    && dok3?.confident && dok3.accuracy >= 0.75) {
    found.push({
      type: GAP.PROCEDURAL,
      label: GAP_LABEL[GAP.PROCEDURAL],
      detail: 'Reasoning is stronger than execution — the mathematics is understood but the mechanics are costing marks.',
    });
  }

  // Can do the standard when it is presented plainly, cannot when the structure
  // gets heavier. That is a complexity problem, NOT a prerequisite gap, and
  // treating it as one sends the student backwards for no reason.
  const bands = profile.difficultyProfile?.byBand || {};
  const easy = bands['2'];
  const hard = bands['4'];
  if (easy?.attempts >= 3 && easy.accuracy >= 0.75 && hard?.attempts >= 3 && hard.accuracy < 0.45) {
    found.push({
      type: GAP.DIFFICULTY,
      label: GAP_LABEL[GAP.DIFFICULTY],
      detail: 'The standard is secure at accessible complexity and falls apart as the structure gets heavier.',
    });
  }

  if ((profile.foundationGapDepth || 0) >= 1) {
    found.push({
      type: GAP.FOUNDATION,
      label: GAP_LABEL[GAP.FOUNDATION],
      detail: 'A confirmed earlier skill is blocking current work.',
    });
  }

  if (profile.retentionStrength != null && profile.retentionStrength < 0.6) {
    found.push({
      type: GAP.RETENTION,
      label: GAP_LABEL[GAP.RETENTION],
      detail: 'Skills that were mastered are not holding when they are checked later.',
    });
  }

  // Course knowledge is there; the exam's version of it is not. This must never
  // be read as a course gap — the fix is exam-style practice, not more of the
  // same course questions.
  Object.entries(profile.ccmrTransfer || {}).forEach(([framework, entry]) => {
    if (entry.provisional || entry.proficiency == null) return;
    if (profile.courseMastery == null || profile.courseMastery < 0.7) return;
    if (profile.courseMastery - entry.proficiency >= transferGapDelta) {
      found.push({
        type: GAP.TRANSFER,
        label: GAP_LABEL[GAP.TRANSFER],
        framework,
        detail: `Course mastery is strong but ${framework} transfer is behind it.`,
      });
    }
  });

  return found;
};

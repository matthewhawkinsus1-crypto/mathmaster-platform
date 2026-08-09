// 9C and 9D — assessment path eligibility, and adaptive recommendations inside
// a framework.
//
// THE ARCHITECTURAL RULE, WHICH IS THE WHOLE POINT.
// This is a contextual layer on top of the Batch 8 path engine, not a second
// adaptive engine beside it. It never asks whether a student is ready — it
// reads the answer the core engine already produced. So the input here is the
// `getStudentPathOptions` result, and CCMR consumes its rows:
//
//   row.status               required / locked / recommended / mastered / …
//   row.unmetPrerequisites   the Batch 8 hard-edge verdict
//   row.curriculumTiming     where the class is, from the real calendar
//   row.mastery              core mastery
//
// If the prerequisite graph changes, CCMR changes with it, because there is
// nothing here to keep in step. There are deliberately no SAT prerequisites,
// no ACT prerequisites, and no separate CCMR skill ids — one mathematics, four
// contexts.

import { STATUS } from '../path/recommendationEngine.js';
import { describeSkill } from '../path/skillGraph.js';
import { ASSESSMENT_FRAMEWORKS, FRAMEWORK_LABELS, listFrameworkAlignments, resolveAlignment } from './assessmentCrosswalk.js';
import { EVIDENCE_BASIS, getEvidence, hasPractised } from './assessmentEvidence.js';
import { getAssessmentProfile } from './assessmentProfiles.js';

export const READINESS = Object.freeze({
  NOT_AVAILABLE: 'not_available',
  NOT_PRACTICED: 'not_practiced',
  READY: 'ready',
  RECOMMENDED: 'recommended',
  STRENGTHEN: 'strengthen',
  TRANSFER_GAP: 'transfer_gap',
  STRONG: 'strong',
});

export const CCMR_REASON = Object.freeze({
  ALIGNMENT_EXISTS: 'assessment-alignment-exists',
  DIRECT_ALIGNMENT: 'direct-assessment-alignment',
  CORE_READY: 'core-skill-ready',
  CORE_NOT_READY: 'core-skill-not-ready',
  CORE_MASTERED: 'core-skill-mastered',
  GOAL_SELECTED: 'assessment-goal-selected',
  TEACHER_PRIORITY: 'teacher-assessment-priority',
  LOW_EVIDENCE: 'assessment-context-low-evidence',
  TRANSFER_GAP: 'transfer-gap-detected',
  CONTEXT_STRONG: 'assessment-context-strong',
  CONTEXT_BELOW_CORE: 'assessment-context-performance-lower-than-core',
  NOT_PRACTISED: 'not-yet-practiced',
  NO_ALIGNMENT: 'no-meaningful-alignment',
  BEYOND_PACING: 'beyond-course-pacing',
  HIGH_RELEVANCE: 'high-relevance-to-selected-framework',
});

// Core mastery at or above this is "the student can do the mathematics", which
// is the precondition for a transfer gap meaning anything.
export const CORE_READY_MASTERY = 0.7;
export const CORE_MASTERED = 0.9;
export const CONTEXT_STRONG = 0.8;
export const CONTEXT_WEAK = 0.65;
// How far assessment proficiency must fall below core mastery before the
// difference is a finding rather than noise.
export const TRANSFER_GAP_DELTA = 0.2;

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

/**
 * §8 — pacing is looser in CCMR, but not absent.
 *
 * A skill taught in October stays available for SAT practice in March, which
 * the course path would call REVIEW and rank down. What CCMR must not do is
 * open far-future content simply because the SAT happens to test it.
 */
export const isWithinCcmrPacing = (row) => {
  if (!row) return false;
  if (row.status === STATUS.FUTURE) return Boolean(row.teacherPriority);
  return true;
};

/**
 * Has the core engine said this student can mathematically attempt the skill?
 * Read, never recomputed.
 */
export const isCoreReady = (row) => {
  if (!row) return false;
  if (row.status === STATUS.LOCKED) return false;
  if (Array.isArray(row.unmetPrerequisites) && row.unmetPrerequisites.length) return false;
  // No mastery evidence is not a bar. A student can practise an SAT linear
  // equation before MathMaster has watched them do a course one.
  if (row.mastery == null) return true;
  return row.mastery >= CORE_READY_MASTERY;
};

const weightFor = ({ framework, goals, teacherPriorities }) => {
  let weight = 1;
  if ((goals || []).includes(framework)) weight += 0.35;
  if ((teacherPriorities || []).includes(framework)) weight += 0.5;
  return weight;
};

/**
 * Classify one skill against one framework. The single place any status is
 * decided, so the hub, the skill menu and the teacher report cannot disagree.
 */
export const classifyAssessmentSkill = ({
  row,
  framework,
  alignment,
  evidence,
  goals = [],
  teacherPriorities = [],
}) => {
  const reasons = [];
  const coreMastery = row?.mastery ?? null;
  const proficiency = evidence?.proficiency ?? null;
  const practised = hasPractised(evidence);

  if (!alignment) {
    return {
      status: READINESS.NOT_AVAILABLE,
      available: false,
      score: 0,
      reasons: [CCMR_REASON.NO_ALIGNMENT],
      coreMastery,
      proficiency: null,
      practised: false,
    };
  }

  reasons.push(CCMR_REASON.ALIGNMENT_EXISTS);
  if (alignment.alignmentType === 'direct') reasons.push(CCMR_REASON.DIRECT_ALIGNMENT);

  if (!isWithinCcmrPacing(row)) {
    return {
      status: READINESS.NOT_AVAILABLE,
      available: false,
      score: 0,
      reasons: [...reasons, CCMR_REASON.BEYOND_PACING],
      coreMastery,
      proficiency,
      practised,
    };
  }

  if (!isCoreReady(row)) {
    // §7 and §24 — this is a mathematics gap, not an assessment-format gap, and
    // sending the student to SAT practice would be answering the wrong question.
    return {
      status: READINESS.NOT_AVAILABLE,
      available: false,
      score: 0,
      reasons: [...reasons, CCMR_REASON.CORE_NOT_READY],
      coreMastery,
      proficiency,
      practised,
    };
  }

  reasons.push(CCMR_REASON.CORE_READY);
  if (coreMastery != null && coreMastery >= CORE_MASTERED) reasons.push(CCMR_REASON.CORE_MASTERED);
  if ((goals || []).includes(framework)) reasons.push(CCMR_REASON.GOAL_SELECTED);
  if ((teacherPriorities || []).includes(framework)) reasons.push(CCMR_REASON.TEACHER_PRIORITY);

  const weight = weightFor({ framework, goals, teacherPriorities });
  let status;
  let base;

  if (!practised) {
    // §25 — never rendered as weakness. A skill nobody has practised in ACT
    // format is an opportunity, and it is ranked as one.
    reasons.push(CCMR_REASON.NOT_PRACTISED);
    status = READINESS.NOT_PRACTICED;
    base = coreMastery != null && coreMastery >= CORE_MASTERED ? 0.62 : 0.5;
    if (coreMastery != null && coreMastery >= CORE_MASTERED) reasons.push(CCMR_REASON.HIGH_RELEVANCE);
  } else if (
    coreMastery != null
    && coreMastery >= CORE_READY_MASTERY
    && proficiency != null
    && evidence?.basis === EVIDENCE_BASIS.DIRECT
    && coreMastery - proficiency >= TRANSFER_GAP_DELTA
  ) {
    // The finding the whole layer exists to produce.
    reasons.push(CCMR_REASON.TRANSFER_GAP, CCMR_REASON.CONTEXT_BELOW_CORE);
    status = READINESS.TRANSFER_GAP;
    base = 0.9;
  } else if (proficiency != null && proficiency >= CONTEXT_STRONG) {
    reasons.push(CCMR_REASON.CONTEXT_STRONG);
    status = READINESS.STRONG;
    base = 0.25;
  } else if (proficiency != null && proficiency < CONTEXT_WEAK) {
    status = READINESS.STRENGTHEN;
    base = 0.75;
  } else {
    status = READINESS.READY;
    base = 0.55;
  }

  if (evidence?.provisional) reasons.push(CCMR_REASON.LOW_EVIDENCE);

  return {
    status,
    available: true,
    score: Number(clamp01(base * weight).toFixed(4)),
    reasons,
    coreMastery,
    proficiency,
    practised,
    alignmentType: alignment.alignmentType,
    evidenceBasis: evidence?.basis || null,
    provisional: Boolean(evidence?.provisional),
  };
};

/**
 * 9C — every assessment pathway legitimately available for one skill.
 */
export const getAssessmentPathOptions = ({
  skillId,
  pathOptions = null,
  assessmentEvidence = {},
  directIndex = null,
  goals = [],
  teacherPriorities = [],
} = {}) => {
  const row = findPathRow(pathOptions, skillId);
  const pathways = ASSESSMENT_FRAMEWORKS.map((framework) => {
    const alignment = resolveAlignment({ skillId, framework, directIndex });
    const evidence = getEvidence(assessmentEvidence, skillId, framework);
    const verdict = classifyAssessmentSkill({ row, framework, alignment, evidence, goals, teacherPriorities });
    return {
      framework,
      label: FRAMEWORK_LABELS[framework],
      blurb: getAssessmentProfile(framework)?.blurb || '',
      available: verdict.available,
      alignmentType: alignment?.alignmentType || null,
      domainTitle: alignment?.domainTitle || null,
      practised: verdict.practised,
      proficiency: verdict.proficiency,
      status: verdict.status,
      score: verdict.score,
      reasonCodes: verdict.reasons,
    };
  });

  return {
    skillId,
    label: describeSkill(skillId).label,
    coreMastery: row?.mastery ?? null,
    coreStatus: row?.status || null,
    coreReady: isCoreReady(row),
    // §16 — mastery opens transfer, it does not close the skill.
    masteredAndBranchable: row?.status === STATUS.MASTERED,
    pathways,
    availablePathways: pathways.filter((entry) => entry.available),
  };
};

function findPathRow(pathOptions, skillId) {
  if (!pathOptions) return null;
  const buckets = Object.values(pathOptions).filter(Array.isArray);
  for (const bucket of buckets) {
    const match = bucket.find((entry) => entry?.skillId === skillId);
    if (match) return match;
  }
  return null;
}

const BUCKET_FOR_STATUS = {
  [READINESS.TRANSFER_GAP]: 'recommended',
  [READINESS.STRENGTHEN]: 'strengthen',
  [READINESS.NOT_PRACTICED]: 'recommended',
  [READINESS.READY]: 'available',
  [READINESS.STRONG]: 'challenge',
  [READINESS.NOT_AVAILABLE]: 'unavailable',
};

/**
 * 9D — the adaptive skill list inside one framework.
 *
 * Same shape as the course path deliberately: recommended / strengthen /
 * available / challenge / unavailable, so the student's CCMR screen and their
 * course screen are the same idea in a different context rather than two
 * different products.
 */
export const getAssessmentRecommendations = ({
  framework,
  pathOptions = null,
  assessmentEvidence = {},
  directIndex = null,
  goals = [],
  teacherPriorities = [],
} = {}) => {
  const rows = Object.values(pathOptions || {}).filter(Array.isArray).flat();
  const items = rows.map((row) => {
    const alignment = resolveAlignment({ skillId: row.skillId, framework, directIndex });
    const evidence = getEvidence(assessmentEvidence, row.skillId, framework);
    const verdict = classifyAssessmentSkill({ row, framework, alignment, evidence, goals, teacherPriorities });
    return {
      skillId: row.skillId,
      label: row.label,
      framework,
      domainId: alignment?.domainId || null,
      domainTitle: alignment?.domainTitle || null,
      coreMastery: verdict.coreMastery,
      assessmentProficiency: verdict.proficiency,
      status: verdict.status,
      alignmentType: verdict.alignmentType || null,
      evidenceBasis: verdict.evidenceBasis,
      provisional: verdict.provisional,
      score: verdict.score,
      reasons: verdict.reasons,
    };
  });

  const bucketed = { recommended: [], strengthen: [], available: [], challenge: [], unavailable: [] };
  items.forEach((item) => {
    const bucket = BUCKET_FOR_STATUS[item.status] || 'available';
    bucketed[bucket].push(item);
  });
  Object.values(bucketed).forEach((list) => list.sort((a, b) => b.score - a.score || a.skillId.localeCompare(b.skillId)));

  const eligible = items.filter((item) => item.status !== READINESS.NOT_AVAILABLE);
  return {
    framework,
    profile: getAssessmentProfile(framework),
    ...bucketed,
    summary: {
      readySkills: eligible.length,
      practisedSkills: eligible.filter((item) => item.evidenceBasis === EVIDENCE_BASIS.DIRECT).length,
      strongSkills: eligible.filter((item) => item.status === READINESS.STRONG).length,
      transferGaps: eligible.filter((item) => item.status === READINESS.TRANSFER_GAP).length,
    },
    // §38 — assessment domains are a presentation grouping over canonical
    // skill ids, never a second skill taxonomy.
    byDomain: groupByDomain(eligible),
  };
};

function groupByDomain(items) {
  const groups = new Map();
  items.forEach((item) => {
    const key = item.domainId || 'other';
    if (!groups.has(key)) groups.set(key, { domainId: key, domainTitle: item.domainTitle || 'Other', items: [] });
    groups.get(key).items.push(item);
  });
  return [...groups.values()];
}

/**
 * §33 — the student-facing sentence for one CCMR recommendation. Generated
 * from reason codes so no screen has to write its own.
 */
export const explainAssessmentRecommendation = (item) => {
  if (!item) return '';
  const name = getAssessmentProfile(item.framework)?.displayName || item.framework;
  switch (item.status) {
    case READINESS.TRANSFER_GAP:
      return `You know the math — practice the format. Your course performance on this is strong, but ${name}-style questions have been harder. Let's work on transferring what you know.`;
    case READINESS.STRENGTHEN:
      return `${name}-style questions on this have been going less well than the rest. A short set here will help.`;
    case READINESS.NOT_PRACTICED:
      return item.coreMastery != null && item.coreMastery >= CORE_MASTERED
        ? `You've already shown strong understanding of this. This practice helps you apply that skill in ${name}-style questions.`
        : `You haven't tried this one in ${name} format yet.`;
    case READINESS.STRONG:
      return `You're doing well with this on the ${name}. Keep it warm, or try it in another format.`;
    case READINESS.READY:
      return `This skill is ready to practise in ${name} format.`;
    default:
      return item.reasons?.includes(CCMR_REASON.CORE_NOT_READY)
        ? 'Strengthen the math first. This pathway uses a skill you\'re still developing — build the skill, then come back to this version.'
        : `This isn't part of the ${name} yet.`;
  }
};

export { ASSESSMENT_FRAMEWORKS, FRAMEWORK_LABELS, listFrameworkAlignments };

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
import { describeSkill, teksCodeFromSkillId } from '../path/skillGraph.js';
import { ASSESSMENT_FRAMEWORKS, FRAMEWORK_LABELS, listFrameworkAlignments, resolveAlignment } from './assessmentCrosswalk.js';
import { EVIDENCE_BASIS, getEvidence, hasPractised } from './assessmentEvidence.js';
import { getAssessmentProfile } from './assessmentProfiles.js';
import { CCMR_STAGE, resolveAssessmentPracticeStage } from './assessmentFidelity.js';
import { getAssessmentStandardReferences } from './assessmentStandardReferences.js';
import {
  frameworkCoverageKnown,
  frameworkCoverageRecord,
} from '../../../functions/shared/pathCoverage.mjs';

export const READINESS = Object.freeze({
  NOT_AVAILABLE: 'not_available',
  NOT_PRACTICED: 'not_practiced',
  READY: 'ready',
  RECOMMENDED: 'recommended',
  STRENGTHEN: 'strengthen',
  TRANSFER_GAP: 'transfer_gap',
  STRONG: 'strong',
  CHALLENGE_READY: 'challenge_ready',
  MAINTENANCE: 'maintenance',
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
  DIRECT_PRACTICE_COMPLETE: 'direct-practice-complete',
  CHALLENGE_PASSED: 'assessment-challenge-passed',
  ADVANCED_CHALLENGE_PASSED: 'advanced-assessment-challenge-passed',
  COOLED_DOWN: 'assessment-skill-cooled-down',
  CONTEXT_BELOW_CORE: 'assessment-context-performance-lower-than-core',
  NOT_PRACTISED: 'not-yet-practiced',
  NO_ALIGNMENT: 'no-meaningful-alignment',
  // The ASVAB gets its own code because its exclusions are the ones under
  // review, and a teacher reading a reason list needs to see which "no" came
  // from the scope decision rather than from an absent mapping.
  NO_ASVAB_ALIGNMENT: 'no-meaningful-asvab-alignment',
  BEYOND_PACING: 'beyond-course-pacing',
  HIGH_RELEVANCE: 'high-relevance-to-selected-framework',
  COVERAGE_UNKNOWN: 'assessment-publication-coverage-unknown',
  PUBLISHED_ASSESSMENT_PRACTICE: 'published-assessment-practice',
  CROSSWALK_WITHOUT_PUBLISHED_PRACTICE: 'crosswalk-without-published-assessment-practice',
  PUBLISHED_WITHOUT_CROSSWALK: 'published-assessment-practice-without-crosswalk',
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
 * Publication is a fact about the active secure bank, not about the crosswalk.
 * Undefined preserves old pure-unit callers; an explicit null/old index fails
 * closed in production until coverage has been rebuilt to schema 2.
 */
export const resolveAssessmentPublication = ({ coverage = undefined, skillId, framework, alignment }) => {
  if (coverage === undefined) {
    return { known: false, legacy: true, published: true, familyCount: null, state: 'legacy_assumed' };
  }
  const teksCode = teksCodeFromSkillId(skillId) || String(skillId || '').replace(/^teks:/i, '');
  if (!frameworkCoverageKnown(coverage, framework)) {
    return { known: false, legacy: false, published: false, familyCount: 0, state: 'coverage_unknown' };
  }
  const record = frameworkCoverageRecord(coverage, teksCode, framework);
  const published = record?.published === true;
  let state = published ? 'published' : 'not_published';
  if (alignment && !published) state = 'crosswalk_without_published_practice';
  if (!alignment && published) state = 'published_without_crosswalk';
  return {
    known: true,
    legacy: false,
    published,
    familyCount: Number(record?.familyCount || 0),
    issuableCount: Number(record?.issuableCount || 0),
    state,
  };
};

const applyPublicationGate = ({ verdict, alignment, publication }) => {
  if (publication.legacy) return verdict;
  if (!publication.known) {
    return {
      ...verdict,
      status: READINESS.NOT_AVAILABLE,
      available: false,
      score: 0,
      reasons: [...new Set([...(verdict.reasons || []), CCMR_REASON.COVERAGE_UNKNOWN])],
    };
  }
  if (!alignment && publication.published) {
    return {
      ...verdict,
      status: READINESS.NOT_AVAILABLE,
      available: false,
      score: 0,
      reasons: [...new Set([...(verdict.reasons || []), CCMR_REASON.PUBLISHED_WITHOUT_CROSSWALK])],
    };
  }
  if (alignment && !publication.published) {
    return {
      ...verdict,
      status: READINESS.NOT_AVAILABLE,
      available: false,
      score: 0,
      reasons: [...new Set([...(verdict.reasons || []), CCMR_REASON.CROSSWALK_WITHOUT_PUBLISHED_PRACTICE])],
    };
  }
  if (alignment && publication.published) {
    return {
      ...verdict,
      reasons: [...new Set([...(verdict.reasons || []), CCMR_REASON.PUBLISHED_ASSESSMENT_PRACTICE])],
    };
  }
  return verdict;
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
      reasons: framework === 'asvab'
        ? [CCMR_REASON.NO_ALIGNMENT, CCMR_REASON.NO_ASVAB_ALIGNMENT]
        : [CCMR_REASON.NO_ALIGNMENT],
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
    const stage = resolveAssessmentPracticeStage(evidence);
    if (stage.stage === CCMR_STAGE.MAINTENANCE) {
      reasons.push(CCMR_REASON.ADVANCED_CHALLENGE_PASSED, CCMR_REASON.COOLED_DOWN);
      status = READINESS.MAINTENANCE;
      base = 0.08;
    } else if (stage.stage === CCMR_STAGE.ADVANCED_CHALLENGE) {
      reasons.push(CCMR_REASON.CHALLENGE_PASSED);
      status = READINESS.CHALLENGE_READY;
      base = 0.2;
    } else if (stage.stage === CCMR_STAGE.CHALLENGE_READY) {
      reasons.push(CCMR_REASON.DIRECT_PRACTICE_COMPLETE);
      status = READINESS.CHALLENGE_READY;
      base = 0.32;
    } else {
      status = READINESS.STRONG;
      base = 0.25;
    }
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
  coverage = undefined,
  goals = [],
  teacherPriorities = [],
} = {}) => {
  const row = findPathRow(pathOptions, skillId);
  const pathways = ASSESSMENT_FRAMEWORKS.map((framework) => {
    const alignment = resolveAlignment({ skillId, framework, directIndex });
    const evidence = getEvidence(assessmentEvidence, skillId, framework);
    const publication = resolveAssessmentPublication({ coverage, skillId, framework, alignment });
    const rawVerdict = classifyAssessmentSkill({ row, framework, alignment, evidence, goals, teacherPriorities });
    const verdict = applyPublicationGate({ verdict: rawVerdict, alignment, publication });
    const practiceStage = resolveAssessmentPracticeStage(evidence);
    return {
      framework,
      label: FRAMEWORK_LABELS[framework],
      blurb: getAssessmentProfile(framework)?.blurb || '',
      available: verdict.available,
      alignmentType: alignment?.alignmentType || null,
      domainTitle: alignment?.domainTitle || null,
      references: getAssessmentStandardReferences(skillId, framework),
      practised: verdict.practised,
      proficiency: verdict.proficiency,
      status: verdict.status,
      score: verdict.score,
      reasonCodes: verdict.reasons,
      publicationState: publication.state,
      publishedFamilyCount: publication.familyCount,
      practiceStage,
      evidence,
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
  [READINESS.CHALLENGE_READY]: 'challenge',
  [READINESS.MAINTENANCE]: 'challenge',
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
  coverage = undefined,
  goals = [],
  teacherPriorities = [],
} = {}) => {
  const rows = Object.values(pathOptions || {}).filter(Array.isArray).flat();
  const items = rows.map((row) => {
    const alignment = resolveAlignment({ skillId: row.skillId, framework, directIndex });
    const evidence = getEvidence(assessmentEvidence, row.skillId, framework);
    const publication = resolveAssessmentPublication({ coverage, skillId: row.skillId, framework, alignment });
    const rawVerdict = classifyAssessmentSkill({ row, framework, alignment, evidence, goals, teacherPriorities });
    const verdict = applyPublicationGate({ verdict: rawVerdict, alignment, publication });
    const practiceStage = resolveAssessmentPracticeStage(evidence);
    return {
      skillId: row.skillId,
      label: row.label,
      framework,
      domainId: alignment?.domainId || null,
      domainTitle: alignment?.domainTitle || null,
      references: getAssessmentStandardReferences(row.skillId, framework),
      coreMastery: verdict.coreMastery,
      assessmentProficiency: verdict.proficiency,
      status: verdict.status,
      alignmentType: verdict.alignmentType || null,
      evidenceBasis: verdict.evidenceBasis,
      provisional: verdict.provisional,
      score: verdict.score,
      reasons: verdict.reasons,
      publicationState: publication.state,
      publishedFamilyCount: publication.familyCount,
      practiceStage,
      evidence,
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
      strongSkills: eligible.filter((item) => [READINESS.STRONG, READINESS.CHALLENGE_READY, READINESS.MAINTENANCE].includes(item.status)).length,
      challengeReadySkills: eligible.filter((item) => item.status === READINESS.CHALLENGE_READY).length,
      maintainedSkills: eligible.filter((item) => item.status === READINESS.MAINTENANCE).length,
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
  if (item.reasons?.includes(CCMR_REASON.COVERAGE_UNKNOWN)) {
    return `MathMaster is checking which ${name} practice is published. Try again in a moment.`;
  }
  if (item.reasons?.includes(CCMR_REASON.CROSSWALK_WITHOUT_PUBLISHED_PRACTICE)) {
    return `${name} practice is not available for this skill.`;
  }
  if (item.reasons?.includes(CCMR_REASON.NO_ALIGNMENT) || item.reasons?.includes(CCMR_REASON.PUBLISHED_WITHOUT_CROSSWALK)) {
    return `This skill is not part of ${name} math practice.`;
  }
  switch (item.status) {
    case READINESS.TRANSFER_GAP:
      return `You know the math — practice the format. Your course performance on this is strong, but ${name}-style questions have been harder. Let's work on transferring what you know.`;
    case READINESS.STRENGTHEN:
      return `${name}-style questions on this have been going less well than the rest. A short set here will help.`;
    case READINESS.NOT_PRACTICED:
      return item.coreMastery != null && item.coreMastery >= CORE_MASTERED
        ? `You've already shown strong understanding of this. This practice helps you apply that skill in ${name}-style questions.`
        : `You haven't tried this one in ${name} format yet.`;
    case READINESS.CHALLENGE_READY:
      return item.practiceStage?.stage === CCMR_STAGE.ADVANCED_CHALLENGE
        ? `You passed the first ${name} challenge. The next set is the advanced challenge, with harder families only.`
        : `You completed the direct ${name} practice. The next set gets harder instead of repeating the same level.`;
    case READINESS.MAINTENANCE:
      return `You have already passed the advanced ${name} challenge for this skill. It stays available for maintenance, but MathMaster will prioritize other needs first.`;
    case READINESS.STRONG:
      return `You're doing well with this on the ${name}. Finish the direct set to unlock a harder challenge.`;
    case READINESS.READY:
      return `This skill is ready to practise in ${name} format.`;
    default:
      return item.reasons?.includes(CCMR_REASON.CORE_NOT_READY)
        ? 'Strengthen the math first. This pathway uses a skill you\'re still developing — build the skill, then come back to this version.'
        : `This skill is not part of ${name} math practice.`;
  }
};

export { ASSESSMENT_FRAMEWORKS, FRAMEWORK_LABELS, listFrameworkAlignments };

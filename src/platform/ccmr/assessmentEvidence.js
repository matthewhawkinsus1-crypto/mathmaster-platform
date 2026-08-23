// 9B — assessment-context evidence, kept separate from core mastery.
//
// THE DISTINCTION THIS FILE EXISTS TO PROTECT.
// Core mastery answers "can this student do the mathematics". Assessment
// proficiency answers "can this student do it when it is dressed as an SAT
// question". Those are different, and the whole value of CCMR practice is that
// the second can be lower than the first — that is a transfer gap, and it is
// the most useful thing the layer can tell anybody.
//
// Which means the two numbers must be computed from different evidence. If
// every ordinary course question counted as SAT evidence, SAT proficiency would
// converge on core mastery and a transfer gap could never be detected. So:
//
//   direct items      an item authored in the assessment's style. This is what
//                     assessment proficiency is measured from.
//   crosswalk items   ordinary course items whose mathematics overlaps the
//                     assessment. Counted and reported, but proficiency built
//                     from them is marked `basis: 'crosswalk'` and provisional,
//                     and never used to claim a transfer gap — comparing it to
//                     core mastery would be comparing a number to itself.
//
// Nothing here writes to core mastery. The mastery engine keeps reading the
// TEKS alignments on the same items exactly as it did before Batch 9, so a
// student who answers an SAT-style linear-equation item still moves A.5A. That
// is the "shared mathematical evidence" edge of the architecture diagram, and
// it works because it was already true — assessment context is metadata on an
// item, not a separate item store.

import { getQuestionCredit, normalizeQuestionRecord } from '../../attemptPolicy.js';
import { normalizeAssessmentContext, normalizeQuestionAlignments } from '../contract/alignments.js';
import { teksSkillId } from '../path/skillGraph.js';
import { ALIGNMENT_TYPE, ASSESSMENT_FRAMEWORKS, getSkillCrosswalk } from './assessmentCrosswalk.js';

// Enough assessment-context items before proficiency is treated as settled.
// Deliberately low: assessment practice is expensive and a student will not sit
// thirty SAT items about slope.
export const CONFIDENT_ASSESSMENT_ITEMS = 5;

export const EVIDENCE_BASIS = Object.freeze({
  DIRECT: 'direct',
  CROSSWALK: 'crosswalk',
});

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const emptyEvidence = (skillId, framework) => ({
  skillId,
  framework,
  attempts: 0,
  correct: 0,
  recentAccuracy: null,
  directItemsAttempted: 0,
  crosswalkItemsAttempted: 0,
  // null, not 0. A student who has never practised this in ACT format has not
  // scored zero on it, and showing 0% would be a lie with a number on it.
  proficiency: null,
  basis: null,
  provisional: false,
  evidenceStrength: 0,
  lastAttemptAt: null,
});

/**
 * The framework an item produces assessment-context evidence for, and how
 * strongly. An item declares this; it is never guessed from the mathematics.
 */
export const resolveItemAssessmentContext = (question) => {
  const context = normalizeAssessmentContext(question?.assessmentContext);
  if (context.framework && context.framework !== 'course' && ASSESSMENT_FRAMEWORKS.includes(context.framework)) {
    return { framework: context.framework, alignmentType: ALIGNMENT_TYPE.DIRECT };
  }

  // An item may instead declare an exam-domain alignment directly rather than
  // setting assessmentContext. Only `direct` counts — the crosswalk entries
  // appended automatically by normalizeQuestionAlignments are derived, and
  // treating derived entries as authored would defeat the whole separation.
  const declared = normalizeQuestionAlignments(question, { includeCrosswalks: false })
    .find((entry) => ASSESSMENT_FRAMEWORKS.includes(entry.framework) && entry.evidenceMode === 'direct');
  if (declared) return { framework: declared.framework, alignmentType: ALIGNMENT_TYPE.DIRECT };

  return { framework: null, alignmentType: ALIGNMENT_TYPE.CROSSWALK };
};

const skillIdsForQuestion = (question) => normalizeQuestionAlignments(question, { includeCrosswalks: false })
  .filter((entry) => entry.framework === 'teks' && entry.code && entry.role !== 'prerequisite')
  .map((entry) => teksSkillId(entry.code));

/**
 * Build every (skill, framework) evidence record for one student.
 *
 * Returns a nested map: evidence[skillId][framework]. Absent means unpractised,
 * which callers must render as "not practised yet" rather than as a score.
 */
export const buildAssessmentEvidence = ({ student, assignments = [], evidenceEvents = [] } = {}) => {
  const safeAssignments = Array.isArray(assignments) ? assignments : [];
  const safeEvidenceEvents = Array.isArray(evidenceEvents) ? evidenceEvents : [];
  const grades = student?.gradesByAssignment || {};
  const evidence = {};

  const bucket = (skillId, framework) => {
    if (!evidence[skillId]) evidence[skillId] = {};
    if (!evidence[skillId][framework]) evidence[skillId][framework] = emptyEvidence(skillId, framework);
    return evidence[skillId][framework];
  };

  safeAssignments.forEach((assignment) => {
    const assignmentGrades = grades[assignment?.id] || {};
    (assignment?.questions || []).forEach((question, index) => {
      const record = assignmentGrades[index];
      if (!record) return;
      const normalized = normalizeQuestionRecord(record);
      if (!normalized.totalAttempts) return;

      const skillIds = skillIdsForQuestion(question);
      if (!skillIds.length) return;

      const item = resolveItemAssessmentContext(question);
      const credit = getQuestionCredit(normalized);

      skillIds.forEach((skillId) => {
        // A direct item feeds only the framework it was authored for. A course
        // item feeds every framework the skill is crosswalked to, as crosswalk
        // evidence.
        const frameworks = item.framework
          ? [item.framework]
          : Object.keys(getSkillCrosswalk(skillId).frameworks);

        frameworks.forEach((framework) => {
          const entry = bucket(skillId, framework);
          entry.attempts += 1;
          entry.correct += credit;
          if (item.framework) entry.directItemsAttempted += 1;
          else entry.crosswalkItemsAttempted += 1;
          if (normalized.lastAttemptAt && (!entry.lastAttemptAt || normalized.lastAttemptAt > entry.lastAttemptAt)) {
            entry.lastAttemptAt = normalized.lastAttemptAt;
          }
          // Recent accuracy is kept per basis so a run of course items cannot
          // paper over a bad run of real SAT items.
          const key = item.framework ? '_directCredit' : '_crosswalkCredit';
          entry[key] = (entry[key] || 0) + credit;
        });
      });
    });
  });

  // My Math Path and released secure-exam evidence are immutable
  // event records rather than assignment tracker rows. They must feed the same
  // CCMR proficiency model or a student can complete authentic SAT/ACT/etc.
  // practice and see the readiness wheel remain unchanged. Assignment-origin
  // events are intentionally ignored here because the assignment tracker loop
  // above already counted them.
  safeEvidenceEvents.forEach((event) => {
    const sourceKind = String(event?.source?.kind || '');
    if (!['myMathPath', 'secureExam'].includes(sourceKind)) return;
    if (event?.performance?.status && event.performance.status !== 'finalized') return;

    const skillIds = [...new Set((event?.masteryEvidenceKeys?.length ? event.masteryEvidenceKeys : event?.alignmentKeys || [])
      .map((key) => String(key || '').replace(/^texas:/i, ''))
      .filter(Boolean)
      .map((code) => teksSkillId(code)))];
    if (!skillIds.length) return;

    const sourceFramework = sourceKind === 'secureExam'
      ? String(event?.source?.examType || '')
      : String(event?.source?.assessmentFramework || '');
    const directFramework = ASSESSMENT_FRAMEWORKS.includes(sourceFramework) ? sourceFramework : null;
    const rawScore = Number(event?.performance?.score);
    const credit = clamp01(Number.isFinite(rawScore) ? (rawScore > 1 ? rawScore / 100 : rawScore) : (event?.performance?.isCorrect ? 1 : 0));
    const occurredAt = event?.occurredAt || null;

    skillIds.forEach((skillId) => {
      const frameworks = directFramework
        ? [directFramework]
        : Object.keys(getSkillCrosswalk(skillId).frameworks);
      frameworks.forEach((framework) => {
        const entry = bucket(skillId, framework);
        entry.attempts += 1;
        entry.correct += credit;
        if (directFramework) entry.directItemsAttempted += 1;
        else entry.crosswalkItemsAttempted += 1;
        if (occurredAt != null) entry.lastAttemptAt = occurredAt;
        const key = directFramework ? '_directCredit' : '_crosswalkCredit';
        entry[key] = (entry[key] || 0) + credit;
      });
    });
  });

  Object.values(evidence).forEach((byFramework) => {
    Object.values(byFramework).forEach((entry) => {
      const direct = entry.directItemsAttempted;
      const crosswalk = entry.crosswalkItemsAttempted;

      if (direct > 0) {
        entry.proficiency = clamp01((entry._directCredit || 0) / direct);
        entry.basis = EVIDENCE_BASIS.DIRECT;
        entry.provisional = direct < CONFIDENT_ASSESSMENT_ITEMS;
        entry.evidenceStrength = clamp01(direct / CONFIDENT_ASSESSMENT_ITEMS);
      } else if (crosswalk > 0) {
        entry.proficiency = clamp01((entry._crosswalkCredit || 0) / crosswalk);
        entry.basis = EVIDENCE_BASIS.CROSSWALK;
        // Always provisional: this is course performance wearing the
        // assessment's name, and the UI must be able to say so.
        entry.provisional = true;
        entry.evidenceStrength = 0;
      }
      entry.recentAccuracy = entry.attempts ? clamp01(entry.correct / entry.attempts) : null;
      delete entry._directCredit;
      delete entry._crosswalkCredit;
    });
  });

  return evidence;
};

export const getEvidence = (evidence, skillId, framework) => evidence?.[skillId]?.[framework] || null;

/**
 * Has the student done real assessment-context work here? Crosswalk-only
 * evidence deliberately answers no: nothing in it was an SAT question.
 */
export const hasPractised = (entry) => Boolean(entry && entry.directItemsAttempted > 0);

/**
 * A merge helper for the simulator and for seeded demo data, so synthetic
 * evidence travels through the same shape as real evidence rather than being a
 * parallel model of it.
 */
export const withSimulatedEvidence = (evidence, { skillId, framework, proficiency, items = CONFIDENT_ASSESSMENT_ITEMS }) => {
  if (!skillId || !framework) return evidence;
  const value = clamp01(proficiency);
  return {
    ...evidence,
    [skillId]: {
      ...evidence?.[skillId],
      [framework]: {
        ...emptyEvidence(skillId, framework),
        attempts: items,
        correct: value * items,
        recentAccuracy: value,
        directItemsAttempted: items,
        proficiency: value,
        basis: EVIDENCE_BASIS.DIRECT,
        provisional: items < CONFIDENT_ASSESSMENT_ITEMS,
        evidenceStrength: clamp01(items / CONFIDENT_ASSESSMENT_ITEMS),
        lastAttemptAt: new Date().toISOString(),
      },
    },
  };
};

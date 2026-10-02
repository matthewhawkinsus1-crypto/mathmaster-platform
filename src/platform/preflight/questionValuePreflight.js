/*
 * PRE-FLIGHT: WILL THIS ASSIGNMENT BE SCORED THE WAY THE TEACHER EXPECTS?
 *
 * Question values (`questionWeight`) are set when questions are created
 * (functions/shared/questionValue.mjs). This audit reads them back, before a
 * student sees the assignment, and says in a teacher's words what would make
 * the grade wrong:
 *
 *   BLOCKING   a Question Family whose generated versions do not carry the
 *              question's value (students graded on different scales);
 *              a DOL in which nothing can earn credit.
 *   WARNING    a value MathMaster could not measure (counted as ×1); one
 *              question deciding most of the grade; a written value far from
 *              the work the question assesses (a likely typo); values written
 *              on a different scale from MathMaster's ×1 standard; family
 *              versions that do not all require the same work; a section in
 *              which nothing can earn credit.
 *   NOTE       questions created before values existed (they count ×1, as
 *              they always have); the section totals.
 *
 * An unusable written value (zero, negative, not a number, templated) is
 * refused by the assignment schema (assignmentSchemaV5.validateAssignmentV5)
 * on every path, so it is not repeated here.
 *
 * Read-only: it never sets or changes a value. Opening an old assignment in
 * Pre-Flight reports; it does not rewrite.
 */

import {
  QUESTION_VALUE_SOURCE,
  STANDARD_QUESTION_VALUE,
  describeQuestionValue,
  estimateQuestionValue,
  explicitQuestionValue,
  questionValueBasis,
} from '../../../functions/shared/questionValue.mjs';
import { isFamilyBackedQuestion, resolveFamilyPreviewInstance } from '../../../functions/shared/questionFamilyInstance.mjs';
import { normalizeQuestionWeight } from '../grading/questionWeights.js';

const clean = (value) => String(value ?? '').trim();
const SECTION_LABEL = Object.freeze({ warmup: 'Warm-Up', classwork: 'Classwork', practice: 'Practice', dol: 'DOL', quiz: 'Quiz', test: 'Test', review: 'Review', corrections: 'Corrections' });
const sectionLabel = (role) => SECTION_LABEL[role] || 'Section';
const formatValue = (value) => `×${Math.round(Number(value) * 100) / 100}`;
const percent = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

// One question deciding more than this share of the whole grade is worth a
// second look, once the assignment has enough questions for that to be odd.
export const DOMINANT_SHARE_PERCENT = 50;
export const DOMINANT_MIN_QUESTIONS = 4;
// A written value this many times larger (or smaller) than the work it
// assesses is far more often a typo than a judgement.
export const EXTREME_VALUE_RATIO = 4;
// Generated versions sampled for a family slot's value checks.
export const FAMILY_VALUE_SAMPLE = 6;

/** The value checks a family slot needs: every version carries the slot's value and the same work. */
const auditFamilyValues = (question) => {
  const slotValue = normalizeQuestionWeight(question);
  const lost = [];
  const estimates = [];
  for (let index = 0; index < FAMILY_VALUE_SAMPLE; index += 1) {
    const preview = resolveFamilyPreviewInstance(question, { index });
    if (preview.error) break;
    const built = preview.question;
    const carried = explicitQuestionValue(question).present
      ? explicitQuestionValue(built).valid && Math.abs(normalizeQuestionWeight(built) - slotValue) <= 1e-9
      : !explicitQuestionValue(built).present;
    if (!carried) lost.push(preview.instance.params);
    estimates.push(estimateQuestionValue(built).value);
  }
  return { lost, low: estimates.length ? Math.min(...estimates) : null, high: estimates.length ? Math.max(...estimates) : null };
};

/**
 * The audit. `questions` are the flattened runtime questions in order, each
 * carrying `activityRole` (the same list every other Pre-Flight audit reads,
 * so "Question N" means the same question everywhere).
 */
export const auditAssignmentQuestionValues = (assignment = {}, questions = []) => {
  const list = Array.isArray(questions) ? questions : [];
  const errors = [];
  const warnings = [];
  const notes = [];
  const positionInSection = {};
  const rows = [];

  list.forEach((question, flatIndex) => {
    const role = clean(question?.activityRole).toLowerCase() || 'classwork';
    positionInSection[role] = (positionInSection[role] || 0) + 1;
    const where = `Question ${flatIndex + 1} (${sectionLabel(role)} Q${positionInSection[role]})`;
    if (question?.teacherExcluded === true) return;
    const explicit = explicitQuestionValue(question);
    const basis = questionValueBasis(question);
    const estimate = estimateQuestionValue(question);
    rows.push({
      questionIndex: flatIndex,
      questionId: clean(question?.questionId) || null,
      role,
      label: where,
      value: explicit.valid ? explicit.value : STANDARD_QUESTION_VALUE,
      valid: !explicit.present || explicit.valid,
      source: basis.legacy ? 'legacy' : basis.source,
      explicit: Boolean(basis.explicit),
      estimate: estimate.value,
      measured: estimate.measured,
      gradable: estimate.gradable,
      work: estimate.summary,
      sentence: describeQuestionValue(question).sentence,
      familyBacked: isFamilyBackedQuestion(question),
    });
  });

  const included = rows.filter((row) => row.valid);
  const total = included.reduce((sum, row) => sum + row.value, 0);

  // 1. Values MathMaster could not measure.
  rows.filter((row) => row.source === QUESTION_VALUE_SOURCE.DEFAULT).forEach((row) => {
    warnings.push(`${row.label}: MathMaster could not measure the work in this question, so it counts as one standard question (×1). If it asks for more than one answer, set its grade value in the question editor.`);
  });

  // 2. One question deciding most of the grade.
  if (included.length >= DOMINANT_MIN_QUESTIONS) {
    included.forEach((row) => {
      const share = percent(row.value, total);
      if (share > DOMINANT_SHARE_PERCENT) {
        warnings.push(`${row.label} counts ${formatValue(row.value)}, which is ${share}% of the whole assignment grade. Check that one question should decide that much of the grade.`);
      }
    });
  }

  // 3. A written value far from the work it assesses.
  included.filter((row) => row.explicit && row.measured && row.gradable).forEach((row) => {
    const ratio = row.value / row.estimate;
    if (ratio >= EXTREME_VALUE_RATIO || ratio <= 1 / EXTREME_VALUE_RATIO) {
      warnings.push(`${row.label} counts ${formatValue(row.value)}, but the work it assesses (${row.work}) is about ${formatValue(row.estimate)}. If that value was a typo it changes every student's grade; correct it, or keep it if the question deserves it.`);
    }
  });

  // 4. Values written on a different scale from MathMaster's.
  const written = included.filter((row) => row.explicit && row.measured && row.gradable);
  const automatic = included.filter((row) => row.source === QUESTION_VALUE_SOURCE.AUTO);
  if (written.length && automatic.length) {
    const median = (values) => {
      const sorted = [...values].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    };
    const writtenScale = median(written.map((row) => row.value / row.estimate));
    if (writtenScale >= EXTREME_VALUE_RATIO) {
      warnings.push(`The grade values written for ${written.length} question${written.length === 1 ? '' : 's'} look like points on a larger scale (about ${Math.round(writtenScale)} times MathMaster's ×1 standard question), while ${automatic.length} question${automatic.length === 1 ? '' : 's'} got automatic values on that standard scale — so the automatic ones will count very little. Write values with ×1 meaning one standard question, or delete them and let MathMaster set them all.`);
    }
  }

  // 5. Question Family slots: every version carries the slot's value, and needs the same work.
  rows.filter((row) => row.familyBacked).forEach((row) => {
    const question = list[row.questionIndex];
    const audit = auditFamilyValues(question);
    if (audit.lost.length) {
      errors.push(`${row.label}: ${audit.lost.length} of its generated versions do not carry the question's grade value, so students would be graded on different scales. Report this to MathMaster support — a family must never change a question's value.`);
    }
    if (audit.low !== null && audit.high !== null && audit.high > audit.low) {
      warnings.push(`${row.label}: its generated versions do not all require the same amount of work (from about ${formatValue(audit.low)} to ${formatValue(audit.high)}), but every version counts ${formatValue(row.value)}. Make the versions equivalent so no student does more work for the same credit.`);
    }
  });

  // 6. Sections in which nothing can earn credit.
  const roles = [...new Set(rows.map((row) => row.role))];
  roles.forEach((role) => {
    const sectionRows = rows.filter((row) => row.role === role);
    if (!sectionRows.length || sectionRows.some((row) => row.gradable)) return;
    const message = `${sectionLabel(role)} has no question MathMaster can grade, so its ${sectionRows.length} question${sectionRows.length === 1 ? '' : 's'} count toward the grade but no student can earn those points. Give it a graded question, or exclude ${sectionRows.length === 1 ? 'it' : 'them'} from grading.`;
    if (role === 'dol') errors.push(message);
    else warnings.push(message);
  });

  // Notes: legacy questions, and the totals.
  const legacy = rows.filter((row) => row.source === 'legacy');
  if (legacy.length) {
    notes.push(`${legacy.length} question${legacy.length === 1 ? ' was' : 's were'} created before grade values were set automatically and count${legacy.length === 1 ? 's' : ''} as one standard question (×1), as before. MathMaster will not change ${legacy.length === 1 ? 'it' : 'them'} on its own; set values in the question editor if you want them to differ.`);
  }
  const sections = roles.map((role) => {
    const sectionRows = included.filter((row) => row.role === role);
    const sectionTotal = sectionRows.reduce((sum, row) => sum + row.value, 0);
    return {
      role,
      label: sectionLabel(role),
      questions: sectionRows.length,
      total: Math.round(sectionTotal * 100) / 100,
      share: percent(sectionTotal, total),
    };
  }).filter((section) => section.questions > 0);
  if (sections.length && total > 0) {
    notes.push(`Question values: ${sections.map((section) => `${section.label} ${formatValue(section.total)} (${section.share}%)`).join(' · ')} — ${formatValue(Math.round(total * 100) / 100)} in all. Each section's own grade is unaffected by the others.`);
  }

  return {
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    notes,
    rows,
    sections,
    total: Math.round(total * 100) / 100,
  };
};

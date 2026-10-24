import { studentLabelForTeks } from '../path/skillLabels.js';
import { toDisplayCode } from '../../utils/teksUtils.js';

const clean = (value) => String(value ?? '').trim();
const NAMESPACED = /^[a-z][a-z0-9_-]*:/i;

/* ---------------------------------------------------------------------------
 * WHAT A SKILL IS CALLED ON A STUDENT'S SCREEN.
 *
 * One rule for the card ("What's on your Test", the Review by skill),
 * Corrections and this review, so a standard has one name everywhere:
 *
 *   1. the teacher's own name for a blueprint target — unless it is not a
 *      name at all. normalizeTestBlueprint fills a missing label with the
 *      standard's code ("texas:A.5A") or "Target 3", and a code is an index
 *      entry, not a skill;
 *   2. the student-facing name of the standard (skillLabels.js);
 *   3. for a standard nobody has named or described (much of Geometry and
 *      Precalculus today), "Standard G.9A". The generic "This skill" made
 *      three different standards three identical rows, each with its own
 *      practise button; the code at least tells them apart, and the review
 *      already shows each question's TEKS code on its badge;
 *   4. the caller's fallback, when there is no standard either.
 *
 * functions/lib/testCycle.js applies rule 1 before a label leaves the server
 * (`isCodeLikeTargetLabel`); tests/platform/testCycleSkillNames.test.mjs holds
 * the two predicates to the same answers.
 * ------------------------------------------------------------------------- */

const GENERIC_SKILL_LABEL = studentLabelForTeks('');
const STANDARD_CODE_LABEL = /^(?:teks\s+)?(?:texas:)?[A-Z0-9]+\.\d+[A-Z]?$/i;
const SYNTHESIZED_TARGET_LABEL = /^target\s*\d+$/i;
const NAMESPACED_KEY_LABEL = /^[a-z][a-z0-9_-]*:\S+$/i;
// Letters and digits only, so "A5A", "a.5a" and "A.5A" are the same code.
const squash = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');

/** True when a "label" is really a code: the key itself, a TEKS code, or "Target N". */
export const isCodeLikeSkillLabel = (label, alignmentKey = null) => {
  const text = clean(label);
  if (!text) return false;
  const key = clean(alignmentKey);
  if (key && (squash(text) === squash(key) || squash(text) === squash(toDisplayCode(key)))) return true;
  return STANDARD_CODE_LABEL.test(text) || SYNTHESIZED_TARGET_LABEL.test(text) || NAMESPACED_KEY_LABEL.test(text);
};

export const studentSkillName = ({ label = null, alignmentKey = null } = {}, fallback = 'Other questions') => {
  const teacherLabel = clean(label);
  if (teacherLabel && !isCodeLikeSkillLabel(teacherLabel, alignmentKey)) return teacherLabel;
  // A code standing in for a label still names the standard when no key came with it.
  const source = clean(alignmentKey) || (STANDARD_CODE_LABEL.test(teacherLabel) ? teacherLabel.replace(/^teks\s+/i, '') : '');
  const code = source ? clean(toDisplayCode(source)) : '';
  if (!code || NAMESPACED.test(code)) return fallback;
  const named = studentLabelForTeks(code);
  return named && named !== GENERIC_SKILL_LABEL ? named : `Standard ${code}`;
};

export const studentSkillLabel = (alignmentKey) => studentSkillName({ alignmentKey });

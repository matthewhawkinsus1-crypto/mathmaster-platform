/*
 * WHY THIS ANSWER WAS PROBABLY MISSED — FOR THE STUDENT'S SCREEN ONLY.
 *
 *   diagnoseMiss({ question, grading, response, familyValues }) → { source, code, message } | null
 *
 * Runs AFTER the attempt was graded and recorded, on a copy of the grader's
 * own result:
 *
 *   1. the server's pure misconception classifiers
 *      (functions/shared/misconceptionClassifiers.mjs) — the same code the
 *      server would record at ingestion, here only to choose a message
 *      (misconceptionStudentMessages.mjs);
 *   2. where no classifier fires, the cheap generic checks
 *      (genericMissChecks.js) on each wrong part against its key.
 *
 * NEVER A GRADE, NEVER EVIDENCE. Nothing returned here is stored, sent with
 * the attempt or read by the attempt policy; the attempt was already recorded
 * before this runs (QuestionEngine). A correct or ungraded result returns
 * null, and so does anything that throws.
 */
import { classifyMisconceptions } from '../../../../functions/shared/misconceptionClassifiers.mjs';
import { studentMisconceptionMessage } from '../../../../functions/shared/misconceptionStudentMessages.mjs';
import { answerCandidatesForField } from '../../../../functions/shared/answerUtils.mjs';
import { fractionAnswerCandidates } from '../../../../functions/shared/fractionAnswer.mjs';
import { reproduceFamilyQuestionFromPin } from '../../../../functions/shared/questionFamilyInstance.mjs';
import { getPlatformQuestionFamily } from '../../../../functions/shared/questionFamilyRegistry.mjs';
import { genericMissCheck } from './genericMissChecks.js';

const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? '').trim();

/** A part the grader marked complete and wrong. */
const wrongParts = (grading) => list(grading?.parts)
  .filter((part) => part && part.graded !== false && part.isComplete !== false && part.isCorrect !== true);

/*
 * THE KEY FOR ONE PART, for the generic checks — read the way the legacy
 * graders read it (see ordinaryResponseGrading.mjs). Null when a part has no
 * single comparable key (an equation, a graph, a table cell with several).
 */
export const expectedForPart = (question = {}, part = {}) => {
  const id = text(part.id);
  const type = text(question?.type);
  if (type === 'multiAnswer') {
    const field = list(question.answerFields).find((entry) => text(entry?.id) === id);
    if (!field) return null;
    return answerCandidatesForField(field)[0] ?? null;
  }
  if (type === 'orderedPair' || type === 'system') {
    const pair = question.answer || question.solution;
    if (!Array.isArray(pair) || pair.length !== 2) return null;
    if (id.endsWith('-x')) return pair[0];
    if (id.endsWith('-y')) return pair[1];
    return pair;
  }
  if (type === 'fraction') return fractionAnswerCandidates(question)[0] ?? null;
  if (type === 'numberLine') return question.target ?? null;
  return null;
};

/*
 * A Question Family instance's generated values, for its classifier — the
 * values the server would reproduce from the same pin. Only a registered
 * platform family has a classifier; an assignment-local template gets none
 * (the server gets none either). Never throws.
 */
export const displayFamilyValues = ({ template = null, delivered = null, assignmentId = '', storageIndex = 0 } = {}) => {
  try {
    const pin = delivered?.familyDelivery;
    if (!template || !pin) return null;
    const replay = reproduceFamilyQuestionFromPin({ question: template, assignmentId, storageIndex, pin });
    if (replay?.error || !replay?.instance?.values) return null;
    if (getPlatformQuestionFamily(replay.family?.id, replay.family?.version) !== replay.family) return null;
    // The instance on screen, not another one the same pin could describe.
    if (text(replay.delivery?.fingerprint) && text(replay.delivery.fingerprint) !== text(pin.fingerprint)) return null;
    return replay.instance.values;
  } catch {
    return null;
  }
};

export const diagnoseMiss = ({ question = null, grading = null, response = null, familyValues = null } = {}) => {
  try {
    if (!question || !grading || grading.graded !== true || grading.isCorrect === true) return null;
    // A copy: the classifier never touches the caller's result, and this
    // function cannot either.
    const copy = JSON.parse(JSON.stringify(grading));
    const classified = classifyMisconceptions({ question, response, grading: copy, familyValues });
    const finding = list(classified?.findings).find((entry) => studentMisconceptionMessage(entry?.code));
    if (finding) return { source: 'classifier', code: finding.code, message: studentMisconceptionMessage(finding.code) };
    for (const part of wrongParts(copy)) {
      const expected = expectedForPart(question, part);
      if (expected === null || expected === undefined) continue;
      const hit = genericMissCheck({ student: part.response, expected });
      if (hit) return { source: 'generic', code: hit.check, message: hit.message };
    }
    return null;
  } catch {
    return null;
  }
};

export default diagnoseMiss;

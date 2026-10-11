/*
 * MY MATH PATH MULTIPLE-CHOICE ANSWERS RECORDED WRONG BEFORE HOTFIX #456.
 *
 * The decisions behind scripts/report-path-choice-id-regrade.mjs. Pure: no
 * Firestore, no clock. Unit-tested in
 * tests/platform/kGrading_pathChoiceIdRegradeReport.test.mjs.
 *
 * THE BUG. issueNextQuestion stores an issued item SANITIZED (its options carry
 * opaque runtime ids `choice_<28 hex>`, and `privateGrading` names those ids)
 * and, before #456, sanitized the stored item AGAIN for the browser. The second
 * pass hashed each runtime id once more, with the stored item as namespace, so
 * the browser held ids the answer key had never seen and every option, the
 * right one included, was graded wrong. #456 (2541109, c00418d) re-sends the
 * stored item with `issued: true`, which keeps its ids.
 *
 * WHAT CAN BE KNOWN FROM WHAT WAS STORED. This is the part that limits the
 * report, and it is a property of the data, not of this module:
 *
 *   - `pathSubmissions/{id}` has never held the response. Before the recap
 *     (merged with PR #459, after the hotfix) it was
 *     `{ studentId, sessionId, submissionId, createdAt, result }`, and `result`
 *     carries the verdict and field ids only. After it, `recapJson` holds the
 *     student's answer as DISPLAY text: a choice id becomes its option's label,
 *     and an id that matches no option the stored item carries is dropped.
 *   - A closed question is cleared off `pathSessions/{id}.currentQuestion`, so
 *     the issued item and its `privateGrading` do not survive either.
 *
 * So no stored record says WHICH option a pre-fix student clicked, and no
 * stored record can be re-graded into "would be correct". The report never
 * guesses: such an answer is `undeterminable` with reason
 * `submitted-option-not-stored`, and it is listed, because its recorded "wrong"
 * carries no information (no option could have been graded right).
 *
 * `classifyChoiceSubmission` is the re-grade itself, for when the submitted
 * ids and the issued item ARE in hand (an export, a log, a client record): it
 * maps each submitted id back through the old second hash and grades it with
 * the current, fixed grader.
 */

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

export const PATH_CHOICE_ID_CLASS = Object.freeze({
  WOULD_BE_CORRECT: 'would-be-correct',
  STILL_WRONG: 'still-wrong',
  ALREADY_CORRECT: 'already-correct',
  UNDETERMINABLE: 'undeterminable',
  // Not one of the four outcomes: an item with no choice field was never
  // affected, and is counted apart so it cannot dilute the others.
  NOT_A_CHOICE_ITEM: 'not-a-choice-item',
});

export const PATH_CHOICE_ID_REASON = Object.freeze({
  RECORDED_VERDICT_MISSING: 'recorded-verdict-missing',
  ISSUED_ITEM_NOT_STORED: 'issued-item-not-stored',
  SUBMITTED_RESPONSE_NOT_STORED: 'submitted-response-not-stored',
  SUBMITTED_ID_UNRECOGNIZED: 'submitted-id-unrecognized',
  CURRENT_GRADER_DISAGREES: 'current-grader-disagrees-with-recorded-verdict',
  GRADER_REJECTED: 'current-grader-rejected-the-response',
  EVIDENCE_EVENT_NOT_FOUND: 'evidence-event-not-found',
  ITEM_SHAPE_UNKNOWN: 'issued-item-shape-unknown',
  // The flagged case: recorded wrong on a choice item, through ids the answer
  // key could not match, and which option it was was never stored.
  SUBMITTED_OPTION_NOT_STORED: 'submitted-option-not-stored',
  GRADED_AFTER_WINDOW: 'graded-outside-the-pre-fix-window',
  // The report found a choice item recorded RIGHT inside the operator's
  // window, which the bug made impossible: the window is not trusted.
  WINDOW_CONTRADICTED: 'window-contradicted',
});

// How a flagged answer is known to have gone through the double hash.
export const PATH_CHOICE_ID_BASIS = Object.freeze({
  // The recap was recorded and its choice answer is missing: the submitted id
  // matched no option of the stored item (or nothing was submitted).
  RECAP_OPTION_MATCHED_NOTHING: 'recap-option-matched-no-stored-option',
  // No recap; submitted inside the window the operator gave as "pre-fix code
  // was serving", on an item whose bank document is a choice item.
  GRADED_BEFORE_FIX: 'graded-before-fix-deploy',
});

const RUNTIME_CHOICE_ID = /^choice_[0-9a-f]{28}$/;
const CHOICE_PROFILE = 'choice';
const MAX_CHOICES = 12;

const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value) => (value === null || value === undefined ? '' : String(value));

const isChoiceField = (field) => text(field?.inputProfile).toLowerCase() === CHOICE_PROFILE;

// The label exactly as the pre-fix sanitizer read it (authoredChoiceLabel).
const choiceLabel = (choice) => (
  isObject(choice) ? text(choice.label ?? choice.text ?? choice.value ?? '') : text(choice)
);
const choiceId = (choice, index) => (
  isObject(choice) ? text(choice.id || choice.value || `choice-${index + 1}`) : text(choice)
);

/**
 * The id the PRE-FIX browser was handed for one stored option: the stored
 * runtime id hashed again, with the stored item as namespace. Written out
 * here rather than borrowed from mathPath, whose sanitizer no longer does
 * this for an issued item; the unit test pins it to ids produced by the
 * pre-fix mathPath.js (f002678) itself.
 */
const preFixServedId = (storedItem, sourceKey, choices, choice, index) => {
  const namespace = [
    storedItem.id || storedItem.familyId || storedItem.questionType || 'path-question',
    storedItem.prompt || '',
    sourceKey,
    list(choices).slice(0, MAX_CHOICES).map(choiceLabel).join('␟'),
  ].join('|');
  const digest = createHash('sha256')
    .update([namespace, choiceId(choice, index), String(index)].join('|'))
    .digest('hex')
    .slice(0, 28);
  return `choice_${digest}`;
};

/**
 * Every option source of a stored item: the question's own options and each
 * field's, with the source key the sanitizer namespaces them under.
 */
const choiceSources = (storedItem) => {
  const sources = [];
  if (list(storedItem.choices).length) sources.push({ sourceKey: 'question', fieldId: null, choices: storedItem.choices });
  list(storedItem.responseFields).forEach((field, index) => {
    if (!Array.isArray(field?.choices) || !field.choices.length) return;
    const id = text(field?.id || `response-${index + 1}`);
    sources.push({ sourceKey: `field:${id}`, fieldId: id, choices: field.choices });
  });
  return sources;
};

/**
 * For one stored (already sanitized) item: each option's stored runtime id,
 * and the id the pre-fix browser showed for it.
 */
export const preFixServedChoiceIds = (storedItem) => {
  if (!isObject(storedItem)) return [];
  return choiceSources(storedItem).flatMap(({ sourceKey, fieldId, choices }) => (
    list(choices).slice(0, MAX_CHOICES).map((choice, index) => ({
      sourceKey,
      fieldId,
      label: choiceLabel(choice),
      runtimeId: choiceId(choice, index),
      servedId: preFixServedId(storedItem, sourceKey, choices, choice, index),
    })).filter((entry) => entry.label !== '')
  ));
};

// The options a choice field is answered from: its own, or the question's.
const optionsForField = (field, index) => {
  const id = text(field?.id || `response-${index + 1}`);
  const own = Array.isArray(field?.choices) && field.choices.length;
  const sourceKey = own ? `field:${id}` : 'question';
  return { id, sourceKey };
};

const undeterminable = (reason, extra = {}) => ({ classification: PATH_CHOICE_ID_CLASS.UNDETERMINABLE, reason, ...extra });

/**
 * THE RE-GRADE. Given the stored issued item (with its privateGrading), the
 * responses the browser submitted, and the verdict that was recorded:
 *
 *   already-correct   recorded right; nothing to do
 *   would-be-correct  recorded wrong; a submitted id is the pre-fix hash of a
 *                     stored option, and with each such id mapped back to its
 *                     runtime id the CURRENT grader marks the answer right
 *   still-wrong       recorded wrong, and wrong under the current grader with
 *                     the ids mapped back (a wrong option was picked)
 *   undeterminable    anything missing or inconsistent; never a guess
 *
 * Non-choice fields of a multi-field item pass through unchanged.
 */
export const classifyChoiceSubmission = async ({ storedItem = null, responses = null, recordedIsCorrect } = {}) => {
  if (recordedIsCorrect === true) return { classification: PATH_CHOICE_ID_CLASS.ALREADY_CORRECT, reason: null };
  if (recordedIsCorrect !== false) return undeterminable(PATH_CHOICE_ID_REASON.RECORDED_VERDICT_MISSING);
  if (!isObject(storedItem) || !isObject(storedItem.privateGrading)) {
    return undeterminable(PATH_CHOICE_ID_REASON.ISSUED_ITEM_NOT_STORED);
  }
  const choiceFields = list(storedItem.responseFields)
    .map((field, index) => ({ field, ...optionsForField(field, index) }))
    .filter(({ field }) => isChoiceField(field));
  if (!choiceFields.length || storedItem.privateGrading.pathToolId) {
    return { classification: PATH_CHOICE_ID_CLASS.NOT_A_CHOICE_ITEM, reason: null };
  }
  if (!isObject(responses)) return undeterminable(PATH_CHOICE_ID_REASON.SUBMITTED_RESPONSE_NOT_STORED);

  const options = preFixServedChoiceIds(storedItem);
  const mapped = { ...responses };
  const mappings = [];
  for (const { id, sourceKey } of choiceFields) {
    const submitted = text(responses[id]);
    const own = options.filter((option) => option.sourceKey === sourceKey);
    if (own.some((option) => option.runtimeId === submitted)) {
      mappings.push({ fieldId: id, via: 'issued-id' });
      continue;
    }
    const preFix = own.find((option) => option.servedId === submitted);
    if (!preFix || !RUNTIME_CHOICE_ID.test(preFix.runtimeId)) {
      return undeterminable(PATH_CHOICE_ID_REASON.SUBMITTED_ID_UNRECOGNIZED, { fieldId: id });
    }
    mapped[id] = preFix.runtimeId;
    mappings.push({ fieldId: id, via: 'pre-fix-served-id', label: preFix.label });
  }

  const regraded = await mathPath.gradePathToolResponse(storedItem.privateGrading, { responses: mapped });
  if (regraded?.rejected) return undeterminable(PATH_CHOICE_ID_REASON.GRADER_REJECTED);
  const remapped = mappings.some((entry) => entry.via === 'pre-fix-served-id');
  if (regraded?.isCorrect === true) {
    // Ids already in the key's space, graded wrong then and right now: the
    // record does not match the grader, which is not this bug. Say so.
    return remapped
      ? { classification: PATH_CHOICE_ID_CLASS.WOULD_BE_CORRECT, reason: null, mappings, score: regraded.score }
      : undeterminable(PATH_CHOICE_ID_REASON.CURRENT_GRADER_DISAGREES, { mappings });
  }
  return { classification: PATH_CHOICE_ID_CLASS.STILL_WRONG, reason: null, mappings, score: regraded?.score ?? 0 };
};

// --- what the stored records allow ------------------------------------------

/**
 * Whether a bank document (pathQuestionBank) issues choice items: `choice`
 * when every variant it can issue has a choice field, `not-choice` when none
 * does, `unknown` otherwise (no document, or variants that differ). A variant
 * is merged over the base exactly as generation merges it (a shallow spread).
 * The bank is read today, so an item edited since issue reads as it is now.
 */
export const bankItemChoiceShape = (bankDoc) => {
  if (!isObject(bankDoc)) return 'unknown';
  const { variants, ...base } = bankDoc;
  const rows = list(variants).filter(isObject);
  const shapes = (rows.length ? rows.map((variant) => ({ ...base, ...variant })) : [base]).map((shape) => {
    if (shape.pathToolId || shape.toolId || shape.tool?.id) return false;
    const questionChoices = list(shape.choices).length > 0;
    return list(shape.responseFields).some((field) => isChoiceField(field)
      && ((Array.isArray(field?.choices) && field.choices.length > 0) || questionChoices));
  });
  if (shapes.every(Boolean)) return 'choice';
  if (shapes.every((shape) => !shape)) return 'not-choice';
  return 'unknown';
};

/**
 * What a stored recap entry (pathSessionRecap.mjs, `v: 1`) says about the
 * choice answer: which choice fields it shows and which of them it shows an
 * answer for. A choice answer appears only when the submitted id matched an
 * option of the STORED item, i.e. the ids the answer key names.
 */
export const recapChoiceAnswers = (entry) => {
  if (!isObject(entry) || !isObject(entry.question)) return null;
  const question = entry.question;
  const fields = list(question.responseFields).length
    ? question.responseFields
    : [{ id: 'answer', label: 'Answer', inputProfile: list(question.choices).length ? CHOICE_PROFILE : 'text' }];
  const answeredLabels = new Set(list(entry.response?.entries).map((item) => text(item?.label)));
  const choiceFields = fields.filter((field) => isChoiceField(field)
    && (list(field.choices).length > 0 || list(question.choices).length > 0));
  // The serializer sheds options and fields from an oversize entry; then the
  // recap cannot say what was asked.
  const shed = list(question.responseFields).length === 0 && list(question.choices).length === 0;
  return {
    shed,
    choiceFieldIds: choiceFields.map((field) => text(field.id)),
    // Matched by the field's label, which is how describeRecapResponse names
    // an entry. Two choice fields sharing a label cannot be told apart.
    unanswered: choiceFields.filter((field) => !answeredLabels.has(text(field.label))).map((field) => text(field.id)),
    ambiguous: new Set(choiceFields.map((field) => text(field.label))).size !== choiceFields.length,
  };
};

/**
 * One stored submission, classified from what Firestore actually holds:
 *
 *   submission         the pathSubmissions document (projected)
 *   recapEntry         its parsed recapJson, or null
 *   bankDoc            pathQuestionBank/{questionId} for its evidence event, or
 *                      null (only consulted when there is no recap)
 *   evidenceFound      whether its evidence event was found
 *   gradedBeforeFix    submitted inside the operator's pre-fix window
 */
export const planStoredSubmission = ({
  submission = null,
  recapEntry = null,
  bankDoc = null,
  evidenceFound = false,
  gradedBeforeFix = false,
} = {}) => {
  const recorded = submission?.result?.grading?.isCorrect;
  if (recorded === true) return { classification: PATH_CHOICE_ID_CLASS.ALREADY_CORRECT, reason: null, basis: null };
  if (recorded !== false) return { ...undeterminable(PATH_CHOICE_ID_REASON.RECORDED_VERDICT_MISSING), basis: null };

  const recap = recapChoiceAnswers(recapEntry);
  if (recap && !recap.shed) {
    if (!recap.choiceFieldIds.length) return { classification: PATH_CHOICE_ID_CLASS.NOT_A_CHOICE_ITEM, reason: null, basis: null };
    if (recap.ambiguous) return { ...undeterminable(PATH_CHOICE_ID_REASON.ITEM_SHAPE_UNKNOWN), basis: null };
    if (!recap.unanswered.length) {
      // Every choice answer named a stored option: the ids were the key's own,
      // so the recorded verdict is the fixed grader's.
      return { classification: PATH_CHOICE_ID_CLASS.STILL_WRONG, reason: null, basis: null };
    }
    return {
      ...undeterminable(PATH_CHOICE_ID_REASON.SUBMITTED_OPTION_NOT_STORED),
      basis: PATH_CHOICE_ID_BASIS.RECAP_OPTION_MATCHED_NOTHING,
      fieldIds: recap.unanswered,
    };
  }

  // No recap (every pre-hotfix submission): the item is known only from the
  // bank document its evidence event names.
  if (!evidenceFound) return { ...undeterminable(PATH_CHOICE_ID_REASON.EVIDENCE_EVENT_NOT_FOUND), basis: null };
  const shape = bankItemChoiceShape(bankDoc);
  if (shape === 'not-choice') return { classification: PATH_CHOICE_ID_CLASS.NOT_A_CHOICE_ITEM, reason: null, basis: null };
  if (shape !== 'choice') return { ...undeterminable(PATH_CHOICE_ID_REASON.ITEM_SHAPE_UNKNOWN), basis: null };
  if (!gradedBeforeFix) return { ...undeterminable(PATH_CHOICE_ID_REASON.GRADED_AFTER_WINDOW), basis: null };
  return {
    ...undeterminable(PATH_CHOICE_ID_REASON.SUBMITTED_OPTION_NOT_STORED),
    basis: PATH_CHOICE_ID_BASIS.GRADED_BEFORE_FIX,
  };
};

/** True for the answers the report lists: recorded wrong, verdict void. */
export const isFlaggedPlan = (plan) => (
  plan?.classification === PATH_CHOICE_ID_CLASS.WOULD_BE_CORRECT
  || (plan?.classification === PATH_CHOICE_ID_CLASS.UNDETERMINABLE
    && plan?.reason === PATH_CHOICE_ID_REASON.SUBMITTED_OPTION_NOT_STORED)
);

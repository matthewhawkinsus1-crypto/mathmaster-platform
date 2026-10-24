/*
 * AUDITED CCMR ON A REVIEWED ASSIGNMENT — CHOSEN, THEN PROVEN.
 *
 * An Honors destination replaces about 15% of Practice with audited CCMR
 * Fidelity V2.1 items on the same TEKS. The server chooses them; only the
 * client can run MathMaster's assignment checks (Pre-Flight). This used to
 * happen for the first time at Create Assignment: the server's single choice
 * per place was compiled, checked, and — when it failed ("Question 24 refers
 * to a graph in its prompt, but the question contains none") — Create threw,
 * after Pre-Flight had already told the teacher the lesson was ready.
 *
 * Now it happens in Pre-Flight, in two stages:
 *
 *   selectHonorsCcmrItems    For each place the server's plan offers, compile
 *                            its ranked audited candidates in turn and keep the
 *                            first one the WHOLE assignment passes Pre-Flight
 *                            with — no new blocker anywhere, and no Honors
 *                            depth the lesson had is lost. A candidate that
 *                            fails is recorded with the actual question and
 *                            the checks it failed, and the next is tried.
 *   composeHonorsCcmrCandidate  Lay those choices on the exact reviewed
 *                            assignment (plus the Honors extension) and run
 *                            Pre-Flight once more on that final object. That
 *                            object is what the teacher previews and what
 *                            Create publishes; nothing is chosen at Create.
 *
 * Nothing here invents content or relaxes a check. A place with no passing
 * audited item keeps the teacher's own (already validated) question, and when
 * the CCMR target cannot be met the result says so — NEEDS_DECISION — for the
 * teacher to resolve in Pre-Flight.
 */
import { compileAuthoringIntentV5 } from '../contract/authoringIntentV5.js';
import { normalizeAssignmentV5 } from '../contract/assignmentSchemaV5.js';
import { buildAssignmentV5PreflightModel } from '../preflight/assignmentV5PreflightModel.js';
import { newlyIntroducedPreflightErrors } from '../preflight/preflightQuestionRepair.js';
import { validateQuestionSemantics } from '../contract/semanticValidation.js';
import { inspectHonorsRigor } from '../rigor/courseRigor.js';
import { withHonorsExtension } from '../rigor/honorsExtensionRecipes.js';
import { keepExplicitQuestionValue } from '../../../functions/shared/questionValue.mjs';

const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const asArray = (value) => (Array.isArray(value) ? value : []);

export const CCMR_RELEASE_TARGET = 'ccmr-fidelity-v2.1-authentic-language';

export const HONORS_CCMR_STATUS = Object.freeze({
  // The Practice section is short enough that the server sets no target.
  NOT_REQUIRED: 'notRequired',
  // The target is met by audited items that passed Pre-Flight in place.
  READY: 'ready',
  // No audited item passed for enough places: the teacher decides.
  NEEDS_DECISION: 'needsDecision',
  // The teacher chose to publish Honors with the authored Practice.
  KEPT_AUTHORED: 'keptAuthored',
  // The final Honors assignment did not pass Pre-Flight (never published).
  INVALID: 'invalid',
});

const HONORS_DEPTH_CHECKS = Object.freeze(['coreTeks', 'higherOrderReasoning', 'multipleRepresentations', 'justification', 'modelingApplication']);

const bankDocumentId = (question = {}) => (
  clean(question?.ccmrSource?.source) === 'auditedBank'
    ? clean(question?.ccmrSource?.documentId)
    : ''
);

const isAuditedReleaseItem = (question = {}) => (
  clean(question?.ccmrSource?.source) === 'auditedBank'
  && clean(question?.ccmrSource?.releaseTarget) === CCMR_RELEASE_TARGET
);

const countAuditedPractice = (assignment = {}) => asArray(assignment.sections)
  .filter((section) => clean(section?.role).toLowerCase() === 'practice')
  .flatMap((section) => asArray(section?.questions))
  .filter((question) => question?.teacherExcluded !== true && isAuditedReleaseItem(question))
  .length;

// FNV-1a, the hash the server seeds its choices with.
const fnv1a = (text) => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/** A short fingerprint of any JSON value: equal fingerprints, equal objects. */
export const assignmentFingerprint = (value) => {
  const text = JSON.stringify(value ?? null);
  return `${fnv1a(text).toString(36)}.${text.length.toString(36)}`;
};

/**
 * What the server's choice depends on: the questions and where they sit.
 * Retitling an assignment does not change which items fit it.
 */
export const ccmrSourcingKey = (assignmentV5 = {}) => assignmentFingerprint(asArray(assignmentV5?.sections));

/**
 * What a selection's validation depends on: everything Pre-Flight reads,
 * except the title and folder a teacher types while reviewing.
 */
export const ccmrSelectionKey = (assignmentV5 = {}) => {
  const assignment = { ...(isObject(assignmentV5?.assignment) ? assignmentV5.assignment : {}) };
  delete assignment.title;
  delete assignment.folder;
  return assignmentFingerprint({ ...assignmentV5, assignment });
};

const flatNumber = (assignment, sectionIndex, questionIndex) => asArray(assignment.sections)
  .slice(0, sectionIndex)
  .reduce((count, section) => count + asArray(section?.questions).length, 0) + questionIndex + 1;

const replaceAt = (assignment, sectionIndex, questionIndex, question) => ({
  ...assignment,
  sections: asArray(assignment.sections).map((section, index) => (index !== sectionIndex ? section : {
    ...section,
    questions: asArray(section.questions).map((existing, position) => (position === questionIndex ? question : existing)),
  })),
});

const questionAt = (assignment, sectionIndex, questionIndex) => asArray(assignment?.sections)[sectionIndex]?.questions?.[questionIndex];

/*
 * Where the Honors extension sits, the way Create has always put it: an
 * extension an AI added to a named section goes back to that section (its
 * Pre-Flight check ran there); the no-AI recipe, which names none, ends
 * Classwork (withHonorsExtension). Returns the assignment and the place.
 */
export const placeHonorsExtension = (assignment = {}, question = null) => {
  if (!isObject(question)) return { assignment, location: null };
  const sections = asArray(assignment.sections);
  const named = clean(question.sectionId) ? sections.findIndex((section) => clean(section?.id) === clean(question.sectionId)) : -1;
  let placed;
  let sectionIndex;
  if (named >= 0) {
    sectionIndex = named;
    placed = {
      ...assignment,
      sections: sections.map((section, index) => (index !== named ? section : {
        ...section,
        questions: [...asArray(section.questions), { ...question, activityRole: question.activityRole || section.role }],
      })),
    };
  } else {
    // withHonorsExtension's rule: the end of Classwork, or a new last section.
    const classwork = sections.findIndex((section) => clean(section?.role).toLowerCase() === 'classwork');
    placed = withHonorsExtension(assignment, question);
    sectionIndex = classwork >= 0 ? classwork : asArray(placed.sections).length - 1;
  }
  const questionIndex = asArray(placed.sections?.[sectionIndex]?.questions).length - 1;
  return { assignment: placed, location: questionIndex >= 0 ? { sectionIndex, questionIndex } : null };
};

/*
 * One audited intent compiled where it will sit: the lesson's course and
 * lesson-depth profile (the compiler's instructional-scope check reads both)
 * and its section's role. Compiling it alone, rather than recompiling the
 * mixed reviewed assignment around it, keeps one candidate's failure from
 * failing every other question.
 */
const compileAuditedCandidate = (assignment, sectionIndex, intent) => {
  const section = asArray(assignment.sections)[sectionIndex] || {};
  const compiled = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: isObject(assignment.assignment) ? assignment.assignment : {},
    ...(isObject(assignment.lessonMetadata) ? { lessonMetadata: assignment.lessonMetadata } : {}),
    sections: [{ id: section.id, role: section.role, title: section.title, questions: [intent] }],
  });
  const question = compiled?.package?.sections?.[0]?.questions?.[0];
  if (!isObject(question)) throw new Error('the assignment compiler returned no question for it');
  return question;
};

// The audited item takes the place of the authored question; an explicit
// grade value written for that place stays with the place.
const placedAuditedQuestion = (baseQuestion, compiled) => keepExplicitQuestionValue(baseQuestion, {
  ...compiled,
  teacherExcluded: false,
});

/*
 * A first look that costs one question, not the whole assignment: the checks
 * an item fails on its own (a graph or table its prompt promises and it lacks
 * — most of the bank's failures), seen on the candidate alone in its section
 * as Pre-Flight sees it (its runtime view), under its real number. It can only
 * refuse; whatever it passes is still proven in place.
 */
const failsOnItsOwn = (assignment, sectionIndex, placed, questionNumber, classSize = null) => {
  try {
    const section = asArray(assignment.sections)[sectionIndex] || {};
    const probe = buildAssignmentV5PreflightModel({ ...assignment, sections: [{ ...section, questions: [placed] }] }, { classSize });
    return probe.questions[0] ? validateQuestionSemantics(probe.questions[0], { label: `Question ${questionNumber}` }).errors : [];
  } catch {
    return [];
  }
};

const describeSourced = ({ slot, baseQuestion, question, questionNumber }) => ({
  kind: slot.kind,
  sectionIndex: slot.sectionIndex,
  questionIndex: slot.questionIndex,
  questionNumber,
  questionId: clean(question?.questionId) || null,
  replacedQuestionId: clean(baseQuestion?.questionId) || null,
  replacedPrompt: clean(baseQuestion?.prompt || baseQuestion?.title),
  documentId: bankDocumentId(question),
  framework: clean(question?.ccmrSource?.framework || question?.assessmentContext?.framework) || null,
  domainId: clean(question?.ccmrSource?.domainId) || null,
  teksCodes: asArray(question?.ccmrSource?.matchProvenance?.teksCodes).length
    ? question.ccmrSource.matchProvenance.teksCodes
    : asArray(slot.teksCodes),
  prompt: clean(question?.prompt),
});

/*
 * The places the server offered, in its order. A server that predates the
 * plan returns its choices in place; each becomes a place with one
 * candidate, validated like any other.
 */
const readPlan = (hydration, base) => {
  const audit = isObject(hydration?.audit) ? hydration.audit : null;
  const plan = isObject(audit?.plan) ? audit.plan : null;
  if (plan && Array.isArray(plan.slots)) {
    return {
      targetCount: Math.max(0, Number(plan.targetCount ?? audit.targetCount ?? 0) || 0),
      slots: plan.slots.filter(isObject),
    };
  }
  const hydratedSections = asArray(hydration?.assignment?.sections);
  const slots = [];
  asArray(base.sections).forEach((section, sectionIndex) => {
    asArray(section?.questions).forEach((question, questionIndex) => {
      const hydrated = hydratedSections[sectionIndex]?.questions?.[questionIndex];
      const documentId = bankDocumentId(hydrated);
      if (!documentId || documentId === bankDocumentId(question)) return;
      slots.push({
        kind: 'practiceTarget',
        sectionIndex,
        questionIndex,
        questionId: clean(question?.questionId) || null,
        candidates: [hydrated],
      });
    });
  });
  return { targetCount: Math.max(0, Number(audit?.targetCount || 0) || 0), slots };
};

const honorsDepthLost = (before, after) => HONORS_DEPTH_CHECKS.filter((key) => before?.[key] === true && after?.[key] !== true);

const DEPTH_LABELS = Object.freeze({
  coreTeks: 'Core TEKS',
  higherOrderReasoning: 'DOK 3+ reasoning',
  multipleRepresentations: 'multiple representations',
  justification: 'explanation / justification',
  modelingApplication: 'modeling / application',
});

/**
 * Stage 1: which audited item goes where, each one proven in place.
 *
 * `hydration` is the callable's answer ({ assignment, audit }); its
 * `audit.plan` carries the ranked candidates for every place. Returns
 * placements (compiled questions keyed by the place they fill) and the
 * record of what was used, what was skipped and why, and which places had
 * nothing to offer.
 */
export const selectHonorsCcmrItems = ({
  baseAssignmentV5,
  hydration = null,
  honorsEnrichmentQuestion = null,
  excludedDocumentIds = [],
  classSize = null,
} = {}) => {
  const base = normalizeAssignmentV5(baseAssignmentV5 || {});
  const withExtension = (assignment) => placeHonorsExtension(assignment, honorsEnrichmentQuestion).assignment;
  const modelOf = (assignment) => buildAssignmentV5PreflightModel(withExtension(assignment), { classSize });
  const depthOf = (model) => inspectHonorsRigor(model.questions, { allowNarrowCheckpoint: true, ccmrTargetRequired: false }).checks;

  const { targetCount, slots } = readPlan(hydration, base);
  const selection = {
    selectionKey: ccmrSelectionKey(baseAssignmentV5 || {}),
    targetCount,
    placements: [],
    sourced: [],
    skipped: [],
    gaps: [],
    keptAuthoredClaims: [],
    baseErrors: [],
  };

  let working = base;
  let workingModel = modelOf(working);
  if (!workingModel.isValid) {
    // Pre-Flight already blocks on these; nothing can be proven on top of them.
    selection.baseErrors = workingModel.errors;
    return selection;
  }
  const baselineDepth = depthOf(workingModel);
  const setAside = new Set(asArray(excludedDocumentIds).map(clean).filter(Boolean));
  const failedEverywhere = new Set();
  const used = new Set(asArray(base.sections).flatMap((section) => asArray(section?.questions)).map(bankDocumentId).filter(Boolean));


  const tryPlace = (slot) => {
    const baseQuestion = questionAt(working, slot.sectionIndex, slot.questionIndex);
    if (!isObject(baseQuestion) || baseQuestion.teacherExcluded === true) return false;
    // The plan was made for this exact question in this exact place.
    if (clean(slot.questionId) && clean(slot.questionId) !== clean(baseQuestion.questionId)) return false;
    for (const intent of asArray(slot.candidates)) {
      const documentId = bankDocumentId(intent);
      if (!documentId || used.has(documentId) || setAside.has(documentId) || failedEverywhere.has(documentId)) continue;
      const questionNumber = flatNumber(withExtension(working), slot.sectionIndex, slot.questionIndex);
      const record = {
        kind: slot.kind,
        sectionIndex: slot.sectionIndex,
        questionIndex: slot.questionIndex,
        questionNumber,
        replacedQuestionId: clean(baseQuestion.questionId) || null,
        documentId,
        framework: clean(intent?.ccmrSource?.framework || intent?.assessmentContext?.framework) || null,
        prompt: clean(intent?.prompt),
      };
      let placed;
      try {
        placed = placedAuditedQuestion(baseQuestion, compileAuditedCandidate(working, slot.sectionIndex, intent));
      } catch (error) {
        failedEverywhere.add(documentId);
        selection.skipped.push({ ...record, errors: [`Question ${questionNumber} could not be built from this audited item: ${String(error?.message || error)}`] });
        continue;
      }
      const ownErrors = failsOnItsOwn(working, slot.sectionIndex, placed, questionNumber, classSize);
      if (ownErrors.length) {
        failedEverywhere.add(documentId);
        selection.skipped.push({ ...record, errors: ownErrors, question: placed });
        continue;
      }
      const trial = replaceAt(working, slot.sectionIndex, slot.questionIndex, placed);
      const trialModel = modelOf(trial);
      const newErrors = newlyIntroducedPreflightErrors(workingModel.errors, trialModel.errors);
      if (newErrors.length) {
        // The item itself fails MathMaster's checks; it will fail anywhere.
        failedEverywhere.add(documentId);
        selection.skipped.push({ ...record, errors: newErrors, question: placed });
        continue;
      }
      const lost = honorsDepthLost(baselineDepth, depthOf(trialModel));
      if (lost.length) {
        // The item is sound, but this place carried Honors depth the lesson
        // needs. Another place may take it.
        selection.skipped.push({
          ...record,
          errors: [`Question ${questionNumber} is the lesson's ${lost.map((key) => DEPTH_LABELS[key] || key).join(' and ')}; replacing it would remove Honors depth, so the authored question stays.`],
          depthOnly: true,
        });
        continue;
      }
      working = trial;
      workingModel = trialModel;
      used.add(documentId);
      selection.placements.push({
        sectionIndex: slot.sectionIndex,
        questionIndex: slot.questionIndex,
        replacedQuestionId: clean(baseQuestion.questionId) || null,
        question: placed,
      });
      selection.sourced.push(describeSourced({ slot, baseQuestion, question: placed, questionNumber }));
      return true;
    }
    return false;
  };

  const gapFor = (slot) => ({
    kind: slot.kind,
    sectionIndex: slot.sectionIndex,
    questionIndex: slot.questionIndex,
    questionNumber: flatNumber(withExtension(working), slot.sectionIndex, slot.questionIndex),
    questionId: clean(slot.questionId) || null,
    teksCodes: asArray(slot.teksCodes),
    reason: clean(slot.reason) || (asArray(slot.candidates).length ? 'no_candidate_passed' : 'no_candidate'),
    sameTeksCount: Number.isFinite(Number(slot.sameTeksCount)) ? Number(slot.sameTeksCount) : null,
    semanticallyCompatibleCount: Number.isFinite(Number(slot.semanticallyCompatibleCount)) ? Number(slot.semanticallyCompatibleCount) : null,
  });

  // A question written to look like exam practice is upgraded to the audited
  // item it imitates when one passes; otherwise the teacher's own question
  // (which Pre-Flight already passed) stays where it is.
  slots.filter((slot) => slot.kind === 'directClaim').forEach((slot) => {
    if (!tryPlace(slot)) selection.keptAuthoredClaims.push(gapFor(slot));
  });

  for (const slot of slots.filter((entry) => entry.kind !== 'directClaim')) {
    if (countAuditedPractice(working) >= targetCount) break;
    if (isAuditedReleaseItem(questionAt(working, slot.sectionIndex, slot.questionIndex))) continue;
    if (!tryPlace(slot) && !asArray(slot.candidates).length) selection.gaps.push(gapFor(slot));
  }
  return selection;
};

const explainNeedsDecision = ({ targetCount, sourcedCount, selection, ccmrEnrichment }) => {
  const missing = Math.max(0, targetCount - sourcedCount);
  const semanticGap = [...selection.gaps, ...selection.keptAuthoredClaims].some((gap) => gap.reason === 'no_semantically_compatible_audited_item');
  const noSameTeks = selection.gaps.length > 0 && selection.gaps.every((gap) => gap.reason === 'no_same_teks_audited_item');
  const failedCount = new Set(selection.skipped.filter((entry) => !entry.depthOnly).map((entry) => entry.documentId)).size;
  const depthOnly = selection.skipped.some((entry) => entry.depthOnly);
  const parts = [];
  if (missing > 0) {
    parts.push(`This Honors version needs ${targetCount} audited CCMR Practice item${targetCount === 1 ? '' : 's'}; MathMaster found ${sourcedCount === 0 ? 'none' : sourcedCount} that pass${sourcedCount === 1 ? 'es' : ''} its checks.`);
  } else if (!ccmrEnrichment) {
    parts.push('The audited items found do not practice a TEKS this lesson teaches elsewhere, so they cannot count as CCMR transfer.');
  }
  if (failedCount) parts.push(`${failedCount === 1 ? 'One audited candidate' : `${failedCount} audited candidates`} offered on this lesson’s TEKS failed MathMaster’s assignment checks; the questions and the reasons are listed below.`);
  if (depthOnly) parts.push('Some audited items would fit, but only in place of a question that carries Honors depth this lesson needs, so MathMaster kept that question.');
  if (semanticGap) parts.push('The audited bank has items on this lesson’s TEKS, but none that match the question’s construct (for example, a sequence rather than function evaluation, a matrix task, or a system’s dimension).');
  if (noSameTeks) parts.push('The audited CCMR Fidelity V2.1 bank has no Practice family on this lesson’s TEKS.');
  return parts.join(' ');
};

/**
 * Stage 2: the final Honors assignment, from the exact reviewed assignment.
 *
 * Pre-Flight runs on the result; `assignmentV5` is the object the teacher
 * previews and Create publishes, and `baseFingerprint` names the reviewed
 * assignment it was built from so Create can refuse anything else.
 */
export const composeHonorsCcmrCandidate = ({
  baseAssignmentV5,
  selection,
  honorsEnrichmentQuestion = null,
  keepAuthored = false,
  classSize = null,
} = {}) => {
  const base = normalizeAssignmentV5(baseAssignmentV5 || {});
  const chosen = selection || { targetCount: 0, placements: [], sourced: [], skipped: [], gaps: [], keptAuthoredClaims: [], baseErrors: [] };
  let working = base;
  const stale = [];
  asArray(chosen.placements).forEach((placement) => {
    const current = questionAt(working, placement.sectionIndex, placement.questionIndex);
    if (!isObject(current) || clean(current.questionId) !== clean(placement.replacedQuestionId)) {
      stale.push(placement);
      return;
    }
    working = replaceAt(working, placement.sectionIndex, placement.questionIndex, placement.question);
  });
  const { assignment: finalAssignment, location: extensionLocation } = placeHonorsExtension(working, honorsEnrichmentQuestion);
  const model = buildAssignmentV5PreflightModel(finalAssignment, { classSize });
  const targetCount = Math.max(0, Number(chosen.targetCount) || 0);
  const sourcedCount = countAuditedPractice(model.assignmentV5);
  const requiresCcmr = targetCount > 0;
  const metTarget = requiresCcmr
    && sourcedCount >= targetCount
    && inspectHonorsRigor(model.questions, { allowNarrowCheckpoint: true, ccmrTargetRequired: true }).checks.ccmrEnrichment;

  let status;
  if (!model.isValid || stale.length || asArray(chosen.baseErrors).length) status = HONORS_CCMR_STATUS.INVALID;
  else if (!requiresCcmr) status = HONORS_CCMR_STATUS.NOT_REQUIRED;
  else if (metTarget) status = HONORS_CCMR_STATUS.READY;
  else if (keepAuthored === true) status = HONORS_CCMR_STATUS.KEPT_AUTHORED;
  else status = HONORS_CCMR_STATUS.NEEDS_DECISION;

  // CCMR stays a requirement unless the server set none, or the teacher, told
  // that no audited item passes, chose the authored Practice for this lesson.
  const ccmrTargetRequired = requiresCcmr && status !== HONORS_CCMR_STATUS.KEPT_AUTHORED;
  const honorsReport = inspectHonorsRigor(model.questions, { allowNarrowCheckpoint: true, ccmrTargetRequired });
  const errors = [
    ...asArray(chosen.baseErrors),
    ...(stale.length ? ['The Honors version was prepared for an earlier copy of this assignment. MathMaster is preparing it again.'] : []),
    ...model.errors,
  ];
  return {
    status,
    baseFingerprint: assignmentFingerprint(baseAssignmentV5 || {}),
    extensionFingerprint: isObject(honorsEnrichmentQuestion) ? assignmentFingerprint(honorsEnrichmentQuestion) : null,
    extensionLocation: extensionLocation
      ? { ...extensionLocation, questionNumber: flatNumber(finalAssignment, extensionLocation.sectionIndex, extensionLocation.questionIndex) }
      : null,
    selectionKey: chosen.selectionKey || null,
    classSize: classSize ?? null,
    assignmentV5: model.assignmentV5,
    model,
    questions: model.questions,
    honorsReport,
    targetCount,
    sourcedCount,
    ccmrTargetRequired,
    sourced: asArray(chosen.sourced),
    skipped: asArray(chosen.skipped),
    gaps: asArray(chosen.gaps),
    keptAuthoredClaims: asArray(chosen.keptAuthoredClaims),
    errors: [...new Set(errors)],
    explanation: status === HONORS_CCMR_STATUS.NEEDS_DECISION || status === HONORS_CCMR_STATUS.KEPT_AUTHORED
      ? explainNeedsDecision({ targetCount, sourcedCount, selection: chosen, ccmrEnrichment: honorsReport.checks.ccmrEnrichment })
      : '',
  };
};

/** Both stages at once, for callers that do not cache the selection. */
export const buildHonorsCcmrCandidate = (options = {}) => composeHonorsCcmrCandidate({
  ...options,
  selection: selectHonorsCcmrItems(options),
});

const PUBLISHABLE_STATUSES = new Set([
  HONORS_CCMR_STATUS.READY,
  HONORS_CCMR_STATUS.NOT_REQUIRED,
  HONORS_CCMR_STATUS.KEPT_AUTHORED,
]);

/**
 * Create Assignment's half of the contract: publish the Honors version
 * Pre-Flight prepared — the one the teacher previewed — or nothing.
 *
 * It must have been built from exactly this reviewed assignment and this
 * Honors extension, be in a publishable state, and pass the same Pre-Flight
 * model and Honors contract again. Throws before anything is written when it
 * does not; it never sources, swaps or repairs a question.
 */
export const confirmHonorsCandidateForCreate = ({
  honorsCandidate,
  reviewedAssignmentV5,
  honorsEnrichmentQuestion = null,
} = {}) => {
  if (!isObject(honorsCandidate) || !isObject(honorsCandidate.assignmentV5)) {
    throw new Error('The Honors version has not been prepared yet. Nothing was created. In Assignment Review, wait for “Honors version checked” under Course rigor destinations, then create again.');
  }
  if (honorsCandidate.baseFingerprint !== assignmentFingerprint(reviewedAssignmentV5 || {})) {
    throw new Error('The Honors version was prepared for an earlier copy of this assignment, so nothing was created. Assignment Review is preparing it again; create again when it says “Honors version checked”.');
  }
  const extensionFingerprint = isObject(honorsEnrichmentQuestion) ? assignmentFingerprint(honorsEnrichmentQuestion) : null;
  if ((honorsCandidate.extensionFingerprint || null) !== extensionFingerprint) {
    throw new Error('The Honors extension changed after the Honors version was checked, so nothing was created. Assignment Review is checking it again.');
  }
  if (!PUBLISHABLE_STATUSES.has(honorsCandidate.status)) {
    throw new Error(honorsCandidate.status === HONORS_CCMR_STATUS.NEEDS_DECISION
      ? 'No audited CCMR Practice item passed MathMaster’s checks for this Honors version, and no choice has been made about it. Nothing was created. Choose how to continue under Course rigor destinations.'
      : `The Honors version does not pass MathMaster’s checks, so nothing was created:\n${asArray(honorsCandidate.errors).join('\n')}`);
  }
  const model = buildAssignmentV5PreflightModel(honorsCandidate.assignmentV5, { classSize: honorsCandidate.classSize ?? null });
  if (!model.isValid) {
    throw new Error(`The Honors version no longer passes MathMaster’s checks, so nothing was created:\n${model.errors.join('\n')}`);
  }
  const honorsReport = inspectHonorsRigor(model.questions, {
    allowNarrowCheckpoint: true,
    ccmrTargetRequired: honorsCandidate.ccmrTargetRequired !== false,
  });
  if (!honorsReport.isHonorsReady) {
    throw new Error(`The Honors version is still missing: ${honorsReport.missing.join(', ')}. Nothing was created.`);
  }
  return { assignmentV5: model.assignmentV5, model, honorsReport, record: honorsCcmrRecord(honorsCandidate) };
};

/**
 * The record a published Honors variant keeps of how its CCMR was decided:
 * which audited items it carries, or that the teacher kept the authored
 * Practice after MathMaster found no audited item that passes.
 */
export const honorsCcmrRecord = (candidate = null) => {
  if (!isObject(candidate)) return null;
  return {
    status: candidate.status,
    releaseTarget: CCMR_RELEASE_TARGET,
    targetCount: Number(candidate.targetCount) || 0,
    sourced: asArray(candidate.sourced).map((entry) => ({
      documentId: entry.documentId || null,
      framework: entry.framework || null,
      questionId: entry.questionId || null,
      replacedQuestionId: entry.replacedQuestionId || null,
    })),
    skippedDocumentIds: [...new Set(asArray(candidate.skipped).filter((entry) => !entry.depthOnly).map((entry) => entry.documentId).filter(Boolean))],
    ...(candidate.status === HONORS_CCMR_STATUS.KEPT_AUTHORED ? { teacherDecision: 'keepAuthoredPractice', explanation: candidate.explanation || '' } : {}),
  };
};

/*
 * IMPORT: DIRECT EXAM-STYLE CLAIMS, PROVEN BEFORE THEY ENTER THE LESSON.
 *
 * Pasted or uploaded JSON can hold questions written as SAT, ACT or TSIA2
 * practice. Import replaces each with the audited item it imitates, for every
 * class, before Review compiles the lesson. That used to be the server's
 * first choice, unchecked, so an item promising a graph it lacks arrived in
 * Review as a blocker the teacher had not caused. Here each claim keeps the
 * first audited item offered for it (the server's plan) that the assignment
 * passes MathMaster's checks with where it sits; a claim no offered item
 * passes for stays as written, and the audit says so.
 *
 * It edits the raw JSON the import compiles next, so the item proven is the
 * item Review sees. `authoredAssignmentV5` is that JSON compiled as written.
 * Without it (the JSON does not compile) or without a plan (an older server),
 * the server's own answer is kept, as before.
 */
export const proveImportedCcmrClaims = ({
  rawAssignment,
  authoredAssignmentV5 = null,
  hydration = null,
  classSize = null,
} = {}) => {
  const audit = isObject(hydration?.audit) ? { ...hydration.audit } : null;
  const plan = isObject(audit?.plan) ? audit.plan : null;
  if (audit) delete audit.plan;
  if (!plan || !isObject(rawAssignment) || !isObject(authoredAssignmentV5)) {
    return { assignment: isObject(hydration?.assignment) ? hydration.assignment : rawAssignment, audit, proven: false };
  }

  const raw = JSON.parse(JSON.stringify(rawAssignment));
  let working = normalizeAssignmentV5(authoredAssignmentV5);
  let workingModel = buildAssignmentV5PreflightModel(working, { classSize });
  const used = new Set(asArray(working.sections).flatMap((section) => asArray(section?.questions)).map(bankDocumentId).filter(Boolean));
  const failed = new Set();
  const replaced = [];
  const skipped = [];
  const misses = [...asArray(audit?.misses)];

  for (const slot of asArray(plan.slots).filter((entry) => isObject(entry) && entry.kind === 'directClaim')) {
    const authored = questionAt(working, slot.sectionIndex, slot.questionIndex);
    const rawQuestion = raw.sections?.[slot.sectionIndex]?.questions?.[slot.questionIndex];
    if (!isObject(authored) || !isObject(rawQuestion)) continue;
    // The plan names the question it was made for, written and compiled alike.
    if (clean(slot.questionId) && (clean(slot.questionId) !== clean(authored.questionId) || clean(slot.questionId) !== clean(rawQuestion.questionId))) continue;
    const questionNumber = flatNumber(working, slot.sectionIndex, slot.questionIndex);
    const offered = asArray(slot.candidates).filter((intent) => bankDocumentId(intent));
    let accepted = null;
    for (const intent of offered) {
      const documentId = bankDocumentId(intent);
      if (used.has(documentId) || failed.has(documentId)) continue;
      const record = {
        sectionIndex: slot.sectionIndex,
        questionIndex: slot.questionIndex,
        questionNumber,
        documentId,
        framework: clean(intent?.ccmrSource?.framework || intent?.assessmentContext?.framework) || null,
        prompt: clean(intent?.prompt),
      };
      let compiled;
      try {
        compiled = compileAuditedCandidate(working, slot.sectionIndex, intent);
      } catch (error) {
        failed.add(documentId);
        skipped.push({ ...record, errors: [`Question ${questionNumber} could not be built from this audited item: ${String(error?.message || error)}`] });
        continue;
      }
      const ownErrors = failsOnItsOwn(working, slot.sectionIndex, compiled, questionNumber, classSize);
      const trial = ownErrors.length ? null : replaceAt(working, slot.sectionIndex, slot.questionIndex, compiled);
      const trialModel = trial ? buildAssignmentV5PreflightModel(trial, { classSize }) : null;
      const errors = ownErrors.length ? ownErrors : newlyIntroducedPreflightErrors(workingModel.errors, trialModel.errors);
      if (errors.length) {
        failed.add(documentId);
        skipped.push({ ...record, errors });
        continue;
      }
      accepted = { intent, documentId, framework: record.framework, trial, trialModel };
      break;
    }
    if (accepted) {
      working = accepted.trial;
      workingModel = accepted.trialModel;
      used.add(accepted.documentId);
      raw.sections[slot.sectionIndex].questions[slot.questionIndex] = accepted.intent;
      replaced.push({ questionNumber, questionId: clean(rawQuestion.questionId) || null, documentId: accepted.documentId, framework: accepted.framework });
    } else if (offered.length) {
      misses.push({
        sectionIndex: slot.sectionIndex,
        questionIndex: slot.questionIndex,
        questionNumber,
        framework: clean(slot.framework) || null,
        domainId: clean(slot.domainId) || null,
        teksCodes: asArray(slot.teksCodes),
        reason: 'no_audited_item_passed_checks',
      });
    }
  }

  return {
    assignment: raw,
    audit: { ...audit, replaced: replaced.length, misses, directClaims: { replaced, skipped } },
    proven: true,
  };
};

const assertSameShape = (baseSections, hydratedSections) => {
  if (baseSections.length !== hydratedSections.length) {
    throw new Error('CCMR hydration changed the assignment section structure. MathMaster stopped before changing the reviewed lesson.');
  }
  baseSections.forEach((baseSection, sectionIndex) => {
    if (asArray(baseSection?.questions).length !== asArray(hydratedSections[sectionIndex]?.questions).length) {
      throw new Error('CCMR hydration changed the assignment question count. MathMaster stopped before changing the reviewed lesson.');
    }
  });
};

/**
 * The strict form: lay the server's in-place choices on the reviewed
 * canonical assignment and require every one of them to pass. Unchanged
 * questions stay byte-for-byte. Throws when an injected item fails — callers
 * that can recover use selectHonorsCcmrItems instead.
 */
export const applyCcmrHydrationToCanonicalAssignment = ({
  baseAssignmentV5,
  hydratedAssignment,
} = {}) => {
  const base = normalizeAssignmentV5(baseAssignmentV5);
  const hydrated = isObject(hydratedAssignment) ? hydratedAssignment : base;
  assertSameShape(asArray(base.sections), asArray(hydrated.sections));
  const selection = selectHonorsCcmrItems({
    baseAssignmentV5: base,
    hydration: { assignment: hydrated, audit: { targetCount: Infinity } },
  });
  const failures = selection.skipped.flatMap((entry) => entry.errors);
  if (selection.baseErrors.length || failures.length) {
    throw new Error(
      `The audited CCMR enrichment did not pass MathMaster's assignment checks:\n${[...selection.baseErrors, ...failures].join('\n')}`,
    );
  }
  const candidate = composeHonorsCcmrCandidate({ baseAssignmentV5: base, selection });
  if (!candidate.model.isValid) {
    throw new Error(
      `The audited CCMR enrichment did not pass MathMaster's assignment checks:\n${candidate.model.errors.join('\n')}`,
    );
  }
  return {
    assignmentV5: candidate.assignmentV5,
    questions: candidate.questions,
    replacements: selection.placements.length,
  };
};

export default applyCcmrHydrationToCanonicalAssignment;

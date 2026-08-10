// Promoting an authored question into the secure Path bank.
//
// THE TWO BANKS ARE NOT THE SAME BANK, and that is the point. An assignment
// question is something a teacher wrote for their class this week. A Path bank
// question is content MathMaster will hand to any student, at any time, as the
// basis of a mastery claim and a routing decision. Creating the first must
// never silently produce the second: a teacher writing a warm-up has not
// volunteered to have it become the evidence that a child has mastered A.5A.
//
// So promotion is explicit, and it is a gate rather than a copy. Everything
// below has to be true before a question can count as coverage, and each check
// exists because failing it produces a specific, real harm:
//
//   serverGradeable      otherwise the browser decides whether a child is right
//   schemaValid          otherwise the renderer shows a broken or empty tool
//   alignment            otherwise mastery is recorded against nothing
//   gradingData          otherwise every student is marked wrong forever
//   toolCanRepresent     otherwise a correct answer is impossible to enter
//   noAnswerLeak         otherwise the answer travels to the browser
//   variantSupport       otherwise "practice more" repeats one item verbatim
//   eligible             otherwise inactive or draft content reaches students
//
// A question that fails any check is not promoted and is told exactly which
// one, because "invalid" that does not say why is a dead end for the author
// too.

import {
  buildPrivateToolGrading, buildPublicToolPayload, getPathToolContract,
  isPathEligible, resolvePathToolId,
} from './pathToolContracts.mjs';
import { declaredToolId, hasFieldGradableDefinition } from './legacyFieldGrading.mjs';

const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Keys that must never appear anywhere in a payload bound for a browser. */
const FORBIDDEN_PUBLIC_KEYS = Object.freeze([
  'answer', 'answers', 'acceptedAnswers', 'acceptedExpressions', 'expected',
  'expectedIntervals', 'expectedNotation', 'expectedInequality', 'solution',
  'solutions', 'grading', 'privateGrading', 'classification', 'correct',
  'isCorrect', 'answerKey', 'marker',
]);

const collectKeys = (value, found = new Set()) => {
  if (Array.isArray(value)) { value.forEach((entry) => collectKeys(entry, found)); return found; }
  if (isObject(value)) {
    Object.entries(value).forEach(([key, entry]) => { found.add(key); collectKeys(entry, found); });
  }
  return found;
};

const check = (id, label, passed, detail = null) => ({ id, label, passed, detail });

/** What a field-graded question shows the browser: labels, never answers. */
const publicResponseFields = (question = {}) => list(question.responseFields).map((field, index) => ({
  id: String(field?.id || `response-${index + 1}`),
  label: String(field?.label || `Response ${index + 1}`),
  inputProfile: field?.inputProfile || 'text',
  unit: field?.unit || null,
}));

/** TEKS codes this question claims to assess, from either authoring shape. */
export const primaryStandardsOf = (question = {}) => {
  const fromAlignments = list(question.alignments)
    .filter((entry) => String(entry?.framework || '').toLowerCase() === 'teks')
    .filter((entry) => !entry.role || entry.role === 'primary')
    .map((entry) => entry.code);
  const fromKeys = list(question.alignmentKeys).map((key) => String(key).replace(/^texas:/i, ''));
  const legacy = question.teks ? [question.teks] : [];
  return [...new Set([...fromAlignments, ...fromKeys, ...legacy]
    .map((code) => String(code || '').trim().toUpperCase())
    .filter(Boolean))];
};

/**
 * Whether "practice more on this skill" can produce a genuinely different item.
 *
 * A question with a generator or a declared variant set can. A single fixed
 * item cannot, and that is allowed — it just means the skill needs several
 * families before it reads as adequately covered, which the coverage index
 * already measures. So this is reported, not enforced.
 */
export const supportsVariants = (question = {}) => Boolean(
  question.variantMode === 'generated'
  || question.generator
  || list(question.variants).length > 1
  || question.parameterized === true,
);

/**
 * Every check, with its verdict.
 *
 * Pure and shared: the server enforces it before writing to the bank, and the
 * teacher's screen runs the same function so the reasons shown before pressing
 * the button are the reasons the server will give.
 */
export const evaluatePromotion = (question = {}, { schemaResult = null } = {}) => {
  const toolId = resolvePathToolId(question);
  const contract = toolId ? getPathToolContract(toolId) : null;
  // A question that declares NO tool is the legacy field-graded kind, and the
  // server grades it without any contract. This gate must not be stricter than
  // production `buildIssuePlan`: rejecting those would reject the entire
  // starter bank, which is deliberately field-graded.
  const declared = declaredToolId(question);
  const fieldGraded = !declared && hasFieldGradableDefinition(question);
  const checks = [];

  checks.push(check(
    'serverGradeable',
    'The server can grade this question',
    Boolean(contract) || fieldGraded,
    (contract || fieldGraded)
      ? null
      : declared
        ? `"${declared}" has no secure server grader, so a browser would decide whether the student was right.`
        : 'This question declares no tool and no gradeable response fields, so the server has no way to mark it.',
  ));

  // Schema validation lives with the renderers on the client. When the caller
  // has run it, its verdict travels; when it has not, the check is reported as
  // unverified rather than quietly passed.
  checks.push(check(
    'schemaValid',
    'The question matches its tool schema',
    schemaResult ? schemaResult.isValid === true : null,
    schemaResult?.errors?.length ? schemaResult.errors.join(' ') : null,
  ));

  const standards = primaryStandardsOf(question);
  checks.push(check(
    'alignment',
    'A primary standard is declared',
    standards.length > 0,
    standards.length ? null : 'Without a standard, any mastery evidence this question produces belongs to nothing.',
  ));

  const definition = contract ? buildPrivateToolGrading(question) : null;
  const gradable = contract ? isPathEligible(question) : fieldGraded;
  checks.push(check(
    'gradingData',
    'The answer the server grades against is present',
    gradable,
    gradable ? null : 'The question carries no answer the server can grade against, so every student would be marked wrong.',
  ));

  // The public payload is what the tool renders from. If the contract cannot
  // build one, the tool has nothing to draw and the student sees an empty
  // workspace rather than the question.
  const payload = contract ? buildPublicToolPayload(question) : null;
  checks.push(check(
    'toolCanRepresent',
    contract ? 'The interactive tool can present this question' : 'The question renders as labelled response fields',
    contract ? Boolean(payload?.tool && Object.keys(payload.tool).length > 0) : fieldGraded,
    contract && !payload?.tool
      ? 'The tool has nothing to render from, so a student would be shown an empty workspace.'
      : null,
  ));

  // A field-graded question's public payload is built by buildSanitizedQuestion,
  // which names the fields that may travel and never copies `expected`. The
  // check still runs over what the browser would receive.
  const publicShape = contract ? payload : { responseFields: publicResponseFields(question), prompt: question.prompt };
  const leakedKeys = publicShape ? [...collectKeys(publicShape)].filter((key) => FORBIDDEN_PUBLIC_KEYS.includes(key)) : [];
  checks.push(check(
    'noAnswerLeak',
    'No answer data reaches the browser',
    publicShape ? leakedKeys.length === 0 : false,
    leakedKeys.length ? `The public payload would carry ${leakedKeys.join(', ')}.` : null,
  ));

  const variants = supportsVariants(question);
  checks.push(check(
    'variantSupport',
    'Repeat practice can vary',
    // Informational: a fixed item is legitimate, it just does not carry a skill
    // on its own.
    variants ? true : null,
    variants ? null : 'This is a single fixed item. It is usable, but a skill needs several families before repeat practice stops repeating.',
  ));

  const eligible = question.active !== false && question.status !== 'draft';
  checks.push(check(
    'eligible',
    'The question is active',
    eligible,
    eligible ? null : 'Draft or inactive questions are not issued to students.',
  ));

  const blocking = checks.filter((entry) => entry.passed === false);
  const unverified = checks.filter((entry) => entry.passed === null);

  return {
    toolId,
    standards,
    checks,
    blocking,
    unverified,
    canPromote: blocking.length === 0,
    // What the bank document would hold, so the caller can show it and the
    // server can write exactly what was reviewed.
    preview: blocking.length === 0 ? {
      pathToolId: toolId,
      alignmentKeys: standards.map((code) => `texas:${code}`),
      responseShape: payload?.responseShape || (fieldGraded ? 'fields' : null),
      hasPrivateGrading: Boolean(definition?.definition) || fieldGraded,
      supportsVariants: variants,
    } : null,
  };
};

/**
 * The bank document for a promoted question.
 *
 * Built from the authored question, never from anything a browser sends
 * alongside it: the caller nominates WHICH question to promote, and the server
 * decides what the promoted record contains.
 */
export const buildPathBankRecord = (question = {}, { promotedBy, sourceAssignmentId = null, sourceQuestionIndex = null, now = Date.now() } = {}) => {
  const evaluation = evaluatePromotion(question);
  if (!evaluation.canPromote) return null;
  return {
    ...question,
    active: true,
    alignmentKeys: evaluation.standards.map((code) => `texas:${code}`),
    difficultyBand: Number(question.difficultyBand) || 3,
    dok: Number(question.dok) || 1,
    familyId: String(question.familyId || question.toolId || question.type || 'path-question'),
    familyVersion: Number(question.familyVersion) || 1,
    pathToolId: evaluation.toolId,
    supportsVariants: evaluation.preview.supportsVariants,
    // Provenance, so a question that turns out to be wrong can be traced back
    // to the assignment it came from and the person who vouched for it.
    promotedFrom: sourceAssignmentId ? { assignmentId: sourceAssignmentId, questionIndex: sourceQuestionIndex } : null,
    promotedBy: promotedBy || null,
    promotedAt: now,
  };
};

/** A stable id, so promoting the same question twice updates rather than duplicates. */
export const pathBankIdFor = ({ sourceAssignmentId, sourceQuestionIndex, fallback }) => (
  sourceAssignmentId != null && sourceQuestionIndex != null
    ? `assignment_${sourceAssignmentId}_q${sourceQuestionIndex}`
    : String(fallback || '')
);

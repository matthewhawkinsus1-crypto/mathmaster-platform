const crypto = require('crypto');

const DAY_MS = 24 * 60 * 60 * 1000;

function canonicalAlignmentKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^[a-z][a-z0-9_-]*:/i.test(raw)) {
    const [namespace, ...rest] = raw.split(':');
    return `${namespace.toLowerCase()}:${rest.join(':').trim().toUpperCase()}`;
  }
  return `texas:${raw.toUpperCase().replace(/\s+/g, '')}`;
}

function displayAlignmentKey(value) {
  return String(value || '').replace(/^texas:/i, '').trim().toUpperCase();
}

function opaqueId(prefix, ...parts) {
  const hash = crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 28);
  return `${prefix}_${hash}`;
}

function runtimeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function normalizeResponseFields(fields = []) {
  return (Array.isArray(fields) ? fields : []).map((field, index) => ({
    id: String(field?.id || `response-${index + 1}`),
    label: String(field?.label || `Response ${index + 1}`),
    inputProfile: field?.inputProfile || 'text',
    unit: field?.unit || null,
  }));
}

function sanitizeContext(context) {
  if (!context || typeof context !== 'object') return null;
  return {
    scenario: String(context.scenario || ''),
    quantities: (Array.isArray(context.quantities) ? context.quantities : []).map((quantity, index) => ({
      id: String(quantity?.id || `quantity-${index + 1}`),
      name: String(quantity?.name || quantity?.label || `Quantity ${index + 1}`),
      symbol: String(quantity?.symbol || 'x'),
      unit: String(quantity?.unit || ''),
      isGiven: Boolean(quantity?.isGiven),
      givenValue: quantity?.isGiven ? (quantity?.givenValue ?? quantity?.value ?? null) : null,
      isUnknown: Boolean(quantity?.isUnknown),
    })),
    scaffold: {
      enabled: context.scaffold?.enabled !== false,
      showQuantitiesStep: context.scaffold?.showQuantitiesStep !== false,
      showRelationshipStep: context.scaffold?.showRelationshipStep !== false,
    },
    interpretation: context.interpretation ? {
      prompt: String(context.interpretation.prompt || 'What does this answer represent in the context?'),
      acceptedUnits: Array.isArray(context.interpretation.acceptedUnits) ? context.interpretation.acceptedUnits.slice(0, 12) : [],
      checkReasonableness: Boolean(context.interpretation.checkReasonableness),
      discreteDomainConstraint: Boolean(context.interpretation.discreteDomainConstraint),
    } : null,
  };
}

function buildSanitizedQuestion(question, { questionInstanceId, attemptsAllowed, attemptsUsed = 0 } = {}) {
  return {
    questionInstanceId,
    familyId: String(question.familyId || question.questionType || 'path-question'),
    familyVersion: Number(question.familyVersion) || 1,
    questionType: String(question.questionType || 'response'),
    activityRole: String(question.activityRole || 'practice'),
    difficultyBand: Number(question.difficultyBand) || 3,
    dok: Number(question.dok) || 1,
    calculatorPolicy: String(question.calculatorPolicy || 'inherit'),
    assessedConstruct: question.assessedConstruct || null,
    prompt: String(question.prompt || ''),
    choices: Array.isArray(question.choices) ? question.choices.slice(0, 12).map((choice, index) => {
      if (choice && typeof choice === 'object') return { id: String(choice.id || choice.value || `choice-${index + 1}`), label: String(choice.label || choice.text || choice.value || '') };
      return { id: String(choice), label: String(choice) };
    }) : [],
    formulaLatex: question.formulaLatex ? String(question.formulaLatex) : null,
    responseFields: normalizeResponseFields(question.responseFields),
    context: sanitizeContext(question.context),
    attemptsAllowed,
    attemptsUsed,
  };
}

function privateGradingDefinition(question) {
  const explicit = question.grading && typeof question.grading === 'object' ? question.grading : {};
  const fields = (Array.isArray(question.responseFields) ? question.responseFields : []).map((field, index) => ({
    id: String(field?.id || `response-${index + 1}`),
    expected: field?.expected,
    accepted: Array.isArray(field?.accepted) ? field.accepted : null,
    numericTolerance: Number(field?.numericTolerance ?? explicit.numericTolerance ?? 1e-6),
    caseSensitive: Boolean(field?.caseSensitive ?? explicit.caseSensitive),
  }));
  return { ...explicit, fields };
}

function hasGradeableDefinition(question) {
  const grading = privateGradingDefinition(question);
  return grading.fields.length > 0 && grading.fields.every((field) => field.expected !== undefined || field.accepted?.length);
}

function valuesEquivalent(actual, field) {
  const candidates = field.accepted?.length ? field.accepted : [field.expected];
  return candidates.some((expected) => {
    const actualNumber = Number(actual);
    const expectedNumber = Number(expected);
    if (String(actual ?? '').trim() !== '' && Number.isFinite(actualNumber) && Number.isFinite(expectedNumber)) {
      return Math.abs(actualNumber - expectedNumber) <= Math.max(0, Number(field.numericTolerance) || 0);
    }
    const left = String(actual ?? '').trim();
    const right = String(expected ?? '').trim();
    return field.caseSensitive ? left === right : left.toLowerCase() === right.toLowerCase();
  });
}

function gradeResponse(grading, responsePayload = {}) {
  const responses = responsePayload.responses && typeof responsePayload.responses === 'object'
    ? responsePayload.responses
    : {};
  const fields = Array.isArray(grading?.fields) ? grading.fields : [];
  if (!fields.length) return { isCorrect: false, score: 0, fieldResults: [] };
  const fieldResults = fields.map((field) => ({ id: field.id, isCorrect: valuesEquivalent(responses[field.id], field) }));
  const correctCount = fieldResults.filter((field) => field.isCorrect).length;
  return { isCorrect: correctCount === fields.length, score: correctCount / fields.length, fieldResults };
}

function mathematicalIndependence(supportUsage = {}) {
  return supportUsage.isMathematicallyIndependent !== false
    && !supportUsage.hintUsed
    && !supportUsage.teacherAssisted
    && !supportUsage.scaffoldUsed
    && !supportUsage.remediationUsed
    && !supportUsage.workedExampleUsed;
}

function supportTelemetry(supportUsage = {}) {
  const result = [];
  (supportUsage.accommodations || []).forEach((supportType) => result.push({ stage: 'presented', supportType: String(supportType), reducesMathematicalIndependence: false }));
  const used = [
    ['hintUsed', 'hint', true],
    ['teacherAssisted', 'teacherAssistance', true],
    ['scaffoldUsed', 'mathScaffold', true],
    ['contextScaffoldUsed', 'contextScaffold', false],
    ['remediationUsed', 'remediation', true],
    ['workedExampleUsed', 'workedExample', true],
    ['calculatorUsed', 'calculator', false],
  ];
  used.forEach(([key, supportType, reducesMathematicalIndependence]) => {
    if (supportUsage[key]) result.push({ stage: 'used', supportType, reducesMathematicalIndependence });
  });
  return result;
}

function nextRetentionDue(now, successfulCheckCount) {
  const days = successfulCheckCount <= 0 ? 14 : successfulCheckCount === 1 ? 30 : 60;
  return now + days * DAY_MS;
}

module.exports = {
  buildSanitizedQuestion,
  canonicalAlignmentKey,
  displayAlignmentKey,
  gradeResponse,
  hasGradeableDefinition,
  mathematicalIndependence,
  nextRetentionDue,
  opaqueId,
  privateGradingDefinition,
  runtimeId,
  supportTelemetry,
};

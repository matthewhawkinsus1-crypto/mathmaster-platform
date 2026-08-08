const POLICY_OVERRIDE_KEYS = new Set([
  'attempts',
  'attemptsAllowed',
  'maximumAttempts',
  'feedback',
  'feedbackMode',
  'hintsAllowed',
  'remediation',
  'remediationAllowed',
  'adaptiveDuringAttempt',
  'allowReplacement',
  'enforcedPolicy',
]);

const CALCULATOR_POLICIES = new Set([
  'none',
  'basic',
  'scientific',
  'graphing',
  'teacherChoice',
  'inherit',
  'questionSpecific',
]);

const cloneJson = (value) => {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
};

export const QUESTION_DEFINITION_SCHEMA_VERSION = 1;

const normalizeResponseFields = (fields) => (Array.isArray(fields) ? fields : []).map((field, index) => {
  const source = field && typeof field === 'object' && !Array.isArray(field) ? field : {};
  return {
    ...cloneJson(source),
    id: String(source.id || `response-${index + 1}`),
    label: String(source.label || `Response ${index + 1}`),
    inputProfile: source.inputProfile ?? null,
    gradingProfile: source.gradingProfile ?? null,
    unit: source.unit ?? null,
    expected: source.expected ?? null,
  };
});

export const stripQuestionPolicyOverrides = (question = {}) => {
  const ignoredPolicyOverrides = [];
  const clean = {};
  Object.entries(question && typeof question === 'object' && !Array.isArray(question) ? question : {}).forEach(([key, value]) => {
    if (POLICY_OVERRIDE_KEYS.has(key)) {
      ignoredPolicyOverrides.push(key);
      return;
    }
    clean[key] = cloneJson(value);
  });
  return { clean, ignoredPolicyOverrides };
};

export const normalizeQuestionDefinition = (rawQuestion = {}, { questionId = null } = {}) => {
  if (!rawQuestion || typeof rawQuestion !== 'object' || Array.isArray(rawQuestion)) {
    throw new TypeError('Question definitions must be JSON objects.');
  }
  const { clean, ignoredPolicyOverrides } = stripQuestionPolicyOverrides(rawQuestion);
  const requestedCalculatorPolicy = String(clean.calculatorPolicy || 'inherit');
  const calculatorPolicy = CALCULATOR_POLICIES.has(requestedCalculatorPolicy)
    ? requestedCalculatorPolicy
    : 'inherit';
  const resolvedQuestionId = String(clean.questionId || clean.id || questionId || '').trim();
  const questionType = String(clean.questionType || clean.type || clean.toolId || '').trim();
  const primaryStandards = Array.isArray(clean.standards?.primary)
    ? clean.standards.primary.map((entry) => entry?.code || entry).filter(Boolean)
    : [];

  return {
    ...clean,
    schemaVersion: QUESTION_DEFINITION_SCHEMA_VERSION,
    questionId: resolvedQuestionId || null,
    type: clean.type || clean.toolId || questionType,
    familyId: String(clean.familyId || clean.toolId || clean.type || questionType || 'question'),
    familyVersion: clean.familyVersion ?? 1,
    questionType,
    teks: cloneJson(clean.teks ?? primaryStandards),
    alignments: cloneJson(clean.alignments ?? clean.standards ?? {}),
    dok: clean.dok ?? clean.complexity?.level ?? null,
    difficultyBand: clean.difficultyBand ?? clean.difficulty?.generatorBand ?? null,
    calculatorPolicy,
    assessedConstruct: clean.assessedConstruct || null,
    responseFields: normalizeResponseFields(clean.responseFields),
    generator: cloneJson(clean.generator ?? null),
    rawSpec: cloneJson(clean),
    ignoredPolicyOverrides,
    normalizationWarnings: [
      ...(requestedCalculatorPolicy !== calculatorPolicy
        ? [`Unsupported calculatorPolicy "${requestedCalculatorPolicy}" was replaced with inherit.`]
        : []),
      ...(clean.schemaVersion != null && Number(clean.schemaVersion) !== QUESTION_DEFINITION_SCHEMA_VERSION
        ? [`Question schemaVersion ${clean.schemaVersion} was normalized to ${QUESTION_DEFINITION_SCHEMA_VERSION}.`]
        : []),
    ],
  };
};

import {
  answerSymbolSpec,
  inferRequiredAnswerSymbols,
  resolveRequiredAnswerSymbols,
} from './answerEntryTools.js';

const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const PROFILE_ALIASES = Object.freeze({
  multiplechoice: 'choice',
  'multiple-choice': 'choice',
  select: 'choice',
  numeric: 'number',
  integer: 'number',
  decimal: 'number',
  symbolic: 'expression',
  math: 'expression',
  formula: 'equation',
  intervalnotation: 'interval',
  setnotation: 'set',
  'ordered-pair': 'orderedPair',
  point: 'orderedPair',
});

export const normalizeInteractionInputProfile = (value) => {
  const raw = clean(value);
  if (!raw) return '';
  const normalized = PROFILE_ALIASES[raw.toLowerCase()] || raw;
  return ['choice','text','number','expression','equation','interval','inequality','set','orderedPair'].includes(normalized)
    ? normalized
    : raw;
};

export const toolProfileForInputProfile = (value) => {
  const profile = normalizeInteractionInputProfile(value);
  return ({
    interval: 'interval',
    inequality: 'inequality',
    set: 'set',
    equation: 'equation',
    expression: 'expression',
    orderedPair: 'expression',
    number: 'expression',
  })[profile] || 'expression';
};

const formatForProfile = (profile) => ({
  orderedPair: 'orderedPair',
  interval: 'interval',
  inequality: 'inequality',
  set: 'set',
  equation: 'equation',
  expression: 'expression',
  number: 'number',
}[profile] || '');

const profileForAnswerFormat = (format) => {
  const token = clean(format).toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (['orderedpair','coordinate','coordinates','point'].includes(token)) return 'orderedPair';
  if (['interval','intervalnotation'].includes(token)) return 'interval';
  if (['set','setnotation'].includes(token)) return 'set';
  if (['inequality','inequalitynotation'].includes(token)) return 'inequality';
  if (['equation','formula'].includes(token)) return 'equation';
  if (['expression','symbolic','math'].includes(token)) return 'expression';
  if (['number','numeric','integer','decimal'].includes(token)) return 'number';
  return '';
};

const valueCandidate = (source = {}) => {
  const candidates = [
    source.expected,
    source.expectedAnswer,
    source.correctAnswer,
    source.answer,
    source.value,
  ];
  for (const candidate of candidates) {
    if (candidate != null && candidate !== '') return candidate;
  }
  if (Array.isArray(source.acceptedAnswers) && source.acceptedAnswers.length) return source.acceptedAnswers[0];
  if (Array.isArray(source.accepted) && source.accepted.length) return source.accepted[0];
  return null;
};

const answerText = (value) => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 2 && value.every((item) => ['string','number'].includes(typeof item))) {
      return `(${value[0]},${value[1]})`;
    }
    return value.map(answerText).filter(Boolean).join(',');
  }
  if (isObject(value)) {
    if ('x' in value && 'y' in value) return `(${answerText(value.x)},${answerText(value.y)})`;
    if ('re' in value && 'im' in value) return `${value.re}+${value.im}i`;
  }
  return '';
};

const normalizedMathText = (value) => answerText(value)
  .replace(/\\left|\\right/g, '')
  .replace(/\\,/g, '')
  .trim();

export const inferAnswerFormatFromExpected = (value) => {
  const text = normalizedMathText(value);
  if (!text) return '';
  if (/\\cup|∪|\\infty|∞/.test(text)) return 'interval';
  if (/^[\[(].*,.*[\])]$/.test(text) && /\[|\]/.test(text)) return 'interval';
  if (/^\{.*\}$|\\lbrace|\\rbrace/.test(text)) return 'set';
  if (/(?:<=|>=|!=|≤|≥|≠|\\le\b|\\ge\b|\\ne\b|<|>)/.test(text) && !/=/.test(text.replace(/<=|>=|!=/g, ''))) return 'inequality';
  if (/^[\(].*,.*[\)]$/.test(text)) return 'orderedPair';
  if (/=/.test(text)) return 'equation';
  if (/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return 'number';
  // Genuine words such as "continuous", "increasing", or "no solution" are
  // language responses, not symbolic expressions merely because they contain letters.
  if (/^[A-Za-z]+(?:\s+[A-Za-z]+){0,4}$/.test(text) && !/^[A-Za-z]$/.test(text)) return '';
  if (/[A-Za-z]|\\frac|\\sqrt|\^|[+\-*/]/.test(text)) return 'expression';
  return '';
};

export const inferRequiredSymbolsFromExpected = (value) => (
  inferRequiredAnswerSymbols(value)
);

const inferredProfileForExpected = (value) => {
  const format = inferAnswerFormatFromExpected(value);
  if (format === 'orderedPair') return 'orderedPair';
  if (format === 'interval') return 'interval';
  if (format === 'set') return 'set';
  if (format === 'inequality') return 'inequality';
  if (format === 'equation') return 'equation';
  if (format === 'number') return 'number';
  if (format === 'expression') return 'expression';
  return '';
};

const mergeRequiredSymbols = (...groups) => [...new Set(
  groups.flatMap((group) => asArray(group).map(clean).filter(Boolean)),
)];

const isChoiceProfile = (profile) => profile === 'choice';
const isTextProfile = (profile) => profile === 'text';

export const normalizeResponseFieldInteractionContract = (field = {}) => {
  if (!isObject(field)) return field;
  const expected = valueCandidate(field);
  const inferredProfile = inferredProfileForExpected(expected);
  const authoredProfile = normalizeInteractionInputProfile(field.inputProfile || field.inputMode || field.type);
  const authoredFormat = clean(
    field.answerFormat
    ?? field.inputContract?.format
    ?? field.notation
    ?? field.inputMode
    ?? '',
  );
  const formatProfile = profileForAnswerFormat(authoredFormat);
  const profile = authoredProfile || formatProfile || inferredProfile || 'text';

  if (isChoiceProfile(profile)) return { ...field, inputProfile: profile };

  const inferredFormat = inferAnswerFormatFromExpected(expected);
  const answerFormat = authoredFormat || formatForProfile(profile) || inferredFormat;
  const inferredSymbols = inferRequiredSymbolsFromExpected(expected);
  const requiredSymbols = mergeRequiredSymbols(
    field.requiredSymbols,
    field.inputContract?.requiredSymbols,
    inferredSymbols,
  );

  return {
    ...field,
    inputProfile: profile,
    ...(answerFormat ? { answerFormat } : {}),
    ...(requiredSymbols.length ? { requiredSymbols } : {}),
    inputContract: {
      ...(isObject(field.inputContract) ? field.inputContract : {}),
      ...(answerFormat ? { format: answerFormat } : {}),
      ...(requiredSymbols.length ? { requiredSymbols } : {}),
    },
  };
};

export const normalizeQuestionInteractionContracts = (question = {}) => {
  if (!isObject(question)) return question;
  const out = { ...question };
  if (Array.isArray(question.responseFields)) {
    out.responseFields = question.responseFields.map(normalizeResponseFieldInteractionContract);
  }
  if (Array.isArray(question.responses)) {
    out.responses = question.responses.map((field) => (
      isObject(field) && (
        field.inputProfile
        || field.inputContract
        || field.answerFormat
        || field.type
        || valueCandidate(field) != null
      )
        ? normalizeResponseFieldInteractionContract(field)
        : field
    ));
  }
  if (Array.isArray(question.answerFields)) {
    out.answerFields = question.answerFields.map((field) => (
      isObject(field) ? normalizeResponseFieldInteractionContract(field) : field
    ));
  }
  return out;
};

const profileCanRepresent = (profile, inferredProfile) => {
  if (!inferredProfile) return true;
  if (!profile) return false;
  if (profile === inferredProfile) return true;
  if (profile === 'expression' && ['number','orderedPair'].includes(inferredProfile)) return true;
  if (profile === 'equation' && ['expression','number'].includes(inferredProfile)) return true;
  return false;
};

const validateField = (field = {}, label) => {
  const errors = [];
  const warnings = [];
  if (!isObject(field)) return { errors, warnings };

  const profile = normalizeInteractionInputProfile(field.inputProfile || field.inputMode || field.type);
  if (isChoiceProfile(profile)) return { errors, warnings };
  const expected = valueCandidate(field);
  const inferredProfile = inferredProfileForExpected(expected);
  const inferredSymbols = inferRequiredSymbolsFromExpected(expected);
  const answerFormat = clean(field.answerFormat ?? field.inputContract?.format ?? field.notation ?? field.inputMode ?? formatForProfile(profile));
  const semanticProfile = profileForAnswerFormat(answerFormat) || inferredProfile;
  const required = resolveRequiredAnswerSymbols({
    answerFormat,
    toolProfile: profile === 'orderedPair' || profile === 'number' ? 'expression' : profile,
    requiredSymbols: mergeRequiredSymbols(field.requiredSymbols, field.inputContract?.requiredSymbols, inferredSymbols),
  });

  if (profile && isTextProfile(profile) && semanticProfile && semanticProfile !== 'text') {
    errors.push(`${label} expects mathematical notation but uses inputProfile "text". Use ${semanticProfile} (or another MathInput profile) so mobile students receive a mathematical keypad.`);
  } else if (profile && profile !== 'text' && !profileCanRepresent(profile, semanticProfile)) {
    errors.push(`${label} uses inputProfile "${profile}" but the response contract is ${semanticProfile}. Align the input profile with the mathematical answer.`);
  }

  const unsupported = required.filter((symbol) => !answerSymbolSpec(symbol));
  if (unsupported.length) {
    errors.push(`${label} requires unsupported answer symbol${unsupported.length === 1 ? '' : 's'}: ${unsupported.join(', ')}. Add a supported MathInput key before publishing.`);
  }

  const missingDeclared = inferredSymbols.filter((symbol) => !required.includes(symbol) && !['(',')'].includes(symbol));
  if (missingDeclared.length) {
    errors.push(`${label} cannot guarantee required symbol${missingDeclared.length === 1 ? '' : 's'} on mobile: ${missingDeclared.join(', ')}.`);
  }

  if (!profile && inferredProfile) {
    warnings.push(`${label} has no inputProfile; MathMaster should normalize it to "${inferredProfile}" before delivery.`);
  }
  return { errors, warnings };
};

export const validateQuestionInteractionContracts = (question = {}, { label = 'Question' } = {}) => {
  const errors = [];
  const warnings = [];
  const groups = [
    ['responseFields', Array.isArray(question.responseFields) ? question.responseFields : []],
    ['responses', Array.isArray(question.responses) ? question.responses.filter(isObject) : []],
    ['answerFields', Array.isArray(question.answerFields) ? question.answerFields : []],
  ];

  groups.forEach(([collection, fields]) => {
    fields.forEach((field, index) => {
      const fieldName = clean(field?.label || field?.id) || `response ${index + 1}`;
      const result = validateField(field, `${label} · ${collection}[${index}] · ${fieldName}`);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    });
  });
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
};

export const validateAssignmentInteractionContracts = (questions = []) => {
  const errors = [];
  const warnings = [];
  asArray(questions).forEach((question, index) => {
    const result = validateQuestionInteractionContracts(question, { label: `Question ${index + 1}` });
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  });
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
};

import { sameValue } from '../../../functions/shared/answerEquivalence.mjs';
import { sameEquivalentExpression } from '../../equivalentExpression.js';

const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const FIELD_COLLECTIONS = Object.freeze([
  ['answerFields', 'answer', 'acceptedAnswers'],
  ['responseFields', 'expected', 'accepted'],
  ['responses', 'expected', 'accepted'],
]);

const FORM_SPECIFIC = /\b(factored\s+form|factor\s+completely|vertex\s+form|standard\s+form|slope[- ]intercept\s+form|point[- ]slope\s+form|simplest\s+radical\s+form|fully\s+factored)\b/i;

const isPresent = (value) => value !== undefined && value !== null && clean(value) !== '';

const gradingMode = (field = {}) => clean(field.gradingMode || field.grading?.mode);

const isManualReview = (field = {}) => (
  field.autoGrade === false
  || field.teacherReviewed === true
  || field.grading?.autoGrade === false
  || ['manual', 'teacherreview', 'teacher-reviewed', 'rubric'].includes(gradingMode(field).toLowerCase())
);

const primaryValue = (field = {}, preferredKey) => {
  const candidates = [
    field[preferredKey],
    field.answer,
    field.expected,
    field.expectedAnswer,
    field.correctAnswer,
  ];
  return candidates.find(isPresent);
};

const acceptedValues = (field = {}, preferredKey) => {
  const preferred = field[preferredKey];
  if (Array.isArray(preferred) && preferred.length) return preferred.filter(isPresent);

  const alternateKey = preferredKey === 'acceptedAnswers' ? 'accepted' : 'acceptedAnswers';
  const alternate = field[alternateKey];
  if (Array.isArray(alternate) && alternate.length) return alternate.filter(isPresent);
  return [];
};

const comparableScalar = (value) => ['string', 'number', 'boolean'].includes(typeof value);

const comparatorForField = (field = {}) => {
  const mode = gradingMode(field);
  if (modeToken === 'equivalentexpression') {
    return (left, right) => sameEquivalentExpression(left, right);
  }
  return (left, right) => sameValue(left, right);
};

const equivalent = (field, left, right) => {
  if (!comparableScalar(left) || !comparableScalar(right)) {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  }
  return comparatorForField(field)(left, right);
};

const dedupeByEquivalence = (field, values = []) => {
  const unique = [];
  values.forEach((value) => {
    if (!unique.some((candidate) => equivalent(field, value, candidate))) unique.push(value);
  });
  return unique;
};

const fieldName = (field = {}, index = 0) => clean(field.label || field.id) || `response ${index + 1}`;

const optionsForField = (field = {}) => {
  const source = Array.isArray(field.options) && field.options.length
    ? field.options
    : Array.isArray(field.choices) ? field.choices : [];
  return source.map((option) => {
    if (isObject(option)) return option.id ?? option.value ?? option.label ?? option.text;
    return option;
  }).filter(isPresent);
};

const validateTolerance = (field, key, label, errors) => {
  if (field[key] == null || field[key] === '') return;
  const value = Number(field[key]);
  if (!Number.isFinite(value) || value < 0) {
    errors.push(`${label} has invalid ${key} "${field[key]}". Tolerances must be finite numbers greater than or equal to 0.`);
  }
};

const validateField = (field, {
  collection,
  index,
  preferredPrimary,
  preferredAccepted,
  questionPrompt,
  label,
}) => {
  const errors = [];
  const warnings = [];
  if (!isObject(field)) return { errors, warnings };

  const display = `${label} · ${collection}[${index}] · ${fieldName(field, index)}`;
  const mode = gradingMode(field);
  const modeToken = mode.toLowerCase();
  const primary = primaryValue(field, preferredPrimary);
  const accepted = acceptedValues(field, preferredAccepted);
  const autoGraded = !isManualReview(field);

  validateTolerance(field, 'numericTolerance', display, errors);
  validateTolerance(field, 'relativeTolerance', display, errors);

  if (mode && !['equivalentexpression', 'manual', 'teacherreview', 'teacher-reviewed', 'rubric'].includes(modeToken)) {
    errors.push(
      `${display} uses unsupported gradingMode "${mode}". MathMaster currently supports the default mathematical grader or "equivalentExpression" for expression fields.`,
    );
  }

  if (autoGraded && !isPresent(primary) && accepted.length === 0) {
    errors.push(
      `${display} has no grading key. Add the mathematically intended answer/expected value, or explicitly mark the response for teacher review.`,
    );
  }

  if (modeToken === 'equivalentexpression') {
    const allKeys = [primary, ...accepted].filter(isPresent).map((value) => clean(value));
    if (allKeys.some((value) => value.includes('='))) {
      errors.push(
        `${display} uses gradingMode "equivalentExpression" for an equation. That grader intentionally refuses equations; use the default equation grader instead.`,
      );
    }
    const formText = [questionPrompt, field.label, field.prompt].map(clean).filter(Boolean).join(' ');
    if (FORM_SPECIFIC.test(formText)) {
      errors.push(
        `${display} asks for a specific algebraic form but uses gradingMode "equivalentExpression", which can accept a different equivalent form. Remove that grading mode so MathMaster preserves the requested form.`,
      );
    }
  }

  // The runtime gives the accepted list precedence over the single key. If they
  // disagree, the visible/intended key can never earn credit.
  if (isPresent(primary) && accepted.length && !accepted.some((value) => equivalent(field, primary, value))) {
    errors.push(
      `${display} has a primary grading key that is not represented by its ${preferredAccepted} list. The runtime reads the list first, so the declared correct answer could be marked wrong. Remove the stale list or include a mathematically equivalent key.`,
    );
  }

  if (accepted.length > 1) {
    const unique = dedupeByEquivalence(field, accepted);
    if (unique.length < accepted.length) {
      warnings.push(
        `${display} contains redundant accepted-answer variants that MathMaster already treats as equivalent. Keep only genuinely different correct answers.`,
      );
    }
  }

  const options = optionsForField(field);
  const looksChoice = clean(field.type || field.inputProfile).toLowerCase() === 'choice' || options.length > 0;
  if (looksChoice && autoGraded && (isPresent(primary) || accepted.length)) {
    const keys = accepted.length ? accepted : [primary];
    const missing = keys.filter((key) => !options.some((option) => equivalent(field, key, option)));
    if (options.length && missing.length === keys.length) {
      errors.push(
        `${display} has no correct key that matches a displayed choice. Students could select every visible option and still be marked wrong.`,
      );
    }
  }

  return { errors, warnings };
};

export const validateQuestionGradingContracts = (question = {}, { label = 'Question' } = {}) => {
  const errors = [];
  const warnings = [];
  if (!isObject(question)) return { errors, warnings };

  FIELD_COLLECTIONS.forEach(([collection, preferredPrimary, preferredAccepted]) => {
    const fields = Array.isArray(question[collection]) ? question[collection] : [];
    fields.forEach((field, index) => {
      const result = validateField(field, {
        collection,
        index,
        preferredPrimary,
        preferredAccepted,
        questionPrompt: question.prompt,
        label,
      });
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    });
  });

  return {
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
};

export const validateAssignmentGradingContracts = (questions = []) => {
  const errors = [];
  const warnings = [];
  asArray(questions).forEach((question, index) => {
    const result = validateQuestionGradingContracts(question, { label: `Question ${index + 1}` });
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  });
  return {
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
};

export default validateQuestionGradingContracts;

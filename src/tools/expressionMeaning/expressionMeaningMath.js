export const EXPRESSION_MEANING_DIMENSIONS = Object.freeze(['unit', 'contextMeaning', 'mathRole']);

const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** A small deterministic PRNG so a choice bank's on-screen order is stable for a
 * given question (same seed every render/reload/device) without persisting the
 * shuffled order itself — the same technique representationMath.js uses for its
 * linearConnections card deck. */
const deterministicRandom = (seed) => {
  let state = Number(seed) || 1;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
};

export const seedFromString = (text) => {
  const value = String(text ?? '');
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 33) ^ value.charCodeAt(index)) >>> 0;
  }
  return hash || 1;
};

/** Deterministically orders a choice bank for one expression/dimension pair.
 * Never re-derived from Math.random, so the same question shows the same
 * order every time — a shuffle that changed on reload would let a student
 * infer the answer from "the one that used to be third." */
export const deterministicShuffle = (items = [], seed = 1) => {
  const shuffled = [...items];
  const nextRandom = deterministicRandom(seed);
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export const orderedChoiceBank = (bank = [], seedKey = '') => deterministicShuffle(bank, seedFromString(seedKey));

const dimensionBankKey = { unit: 'units', contextMeaning: 'contextMeanings', mathRole: 'mathRoles' };

export const choiceBankFor = (question = {}, dimension) => {
  const key = dimensionBankKey[dimension];
  const bank = Array.isArray(question.choiceBanks?.[key]) ? question.choiceBanks[key] : [];
  return orderedChoiceBank(bank, `${question.questionId || question.id || 'expressionMeaning'}:${dimension}`);
};

/**
 * Deterministic client-side grading, scored per expression AND per dimension
 * so feedback can say which piece of a specific expression needs another
 * look without ever stating what the right answer is.
 */
export const scoreExpressionMeaning = (question = {}, response = {}) => {
  const expressions = Array.isArray(question.expressions) ? question.expressions : [];
  const assignments = response.assignments && typeof response.assignments === 'object' ? response.assignments : {};

  const perExpression = expressions.map((expr) => {
    const given = assignments[expr?.id] || {};
    const checks = {};
    EXPRESSION_MEANING_DIMENSIONS.forEach((dimension) => {
      const answered = normalize(given[dimension]);
      checks[dimension] = answered !== '' && answered === normalize(expr?.[dimension]);
    });
    const complete = EXPRESSION_MEANING_DIMENSIONS.every((dimension) => checks[dimension]);
    return { id: expr?.id, checks, complete };
  });

  const totalChecks = perExpression.length * EXPRESSION_MEANING_DIMENSIONS.length;
  const correctChecks = perExpression.reduce(
    (sum, entry) => sum + EXPRESSION_MEANING_DIMENSIONS.filter((dimension) => entry.checks[dimension]).length,
    0,
  );

  return {
    isCorrect: perExpression.length > 0 && perExpression.every((entry) => entry.complete),
    score: totalChecks ? correctChecks / totalChecks : 0,
    perExpression,
  };
};

export const validateExpressionMeaningQuestion = (question = {}) => {
  const errors = [];
  const expressions = Array.isArray(question.expressions) ? question.expressions : null;
  if (!expressions || expressions.length < 2) {
    errors.push('expressionMeaning requires at least two authored expressions.');
    return errors;
  }

  const ids = new Set();
  expressions.forEach((expr, index) => {
    const id = String(expr?.id ?? '').trim();
    if (!id) errors.push(`expressionMeaning expression ${index + 1} needs a unique id.`);
    else if (ids.has(id)) errors.push(`expressionMeaning expression id "${id}" is used more than once.`);
    ids.add(id);
    if (!String(expr?.expression ?? '').trim()) errors.push(`expressionMeaning expression ${index + 1} needs a display expression.`);
    EXPRESSION_MEANING_DIMENSIONS.forEach((dimension) => {
      if (!String(expr?.[dimension] ?? '').trim()) errors.push(`expressionMeaning expression ${index + 1} is missing "${dimension}".`);
    });
  });

  const banks = question.choiceBanks && typeof question.choiceBanks === 'object' ? question.choiceBanks : {};
  Object.entries(dimensionBankKey).forEach(([dimension, bankKey]) => {
    const bank = Array.isArray(banks[bankKey]) ? banks[bankKey] : null;
    if (!bank || bank.length < 2) {
      errors.push(`expressionMeaning choiceBanks.${bankKey} needs at least two options.`);
      return;
    }
    const normalizedBank = new Set(bank.map(normalize));
    if (normalizedBank.size !== bank.length) errors.push(`expressionMeaning choiceBanks.${bankKey} has a duplicate option.`);
    expressions.forEach((expr, index) => {
      const answer = normalize(expr?.[dimension]);
      if (answer && !normalizedBank.has(answer)) {
        errors.push(`expressionMeaning choiceBanks.${bankKey} is missing the authored answer for expression ${index + 1}, so it could never be selected.`);
      }
    });
  });

  return errors;
};

/*
 * Where the assignment panel goes once a row is complete.
 *
 * The matrix sits above the panel, so choosing each next expression meant
 * scrolling up to the matrix and back down to the choices — six times per
 * question (live QA round 2, 1536x900). Completing a row now opens the next
 * incomplete one (in order, wrapping). Null when every row is complete.
 */
export const nextIncompleteExpressionId = (expressions = [], assignments = {}, currentId = null) => {
  const complete = (expr) => EXPRESSION_MEANING_DIMENSIONS.every((dimension) => String(assignments?.[expr.id]?.[dimension] || '').trim());
  const start = Math.max(0, expressions.findIndex((expr) => expr.id === currentId));
  for (let step = 1; step <= expressions.length; step += 1) {
    const candidate = expressions[(start + step) % expressions.length];
    if (candidate && !complete(candidate)) return candidate.id;
  }
  return null;
};

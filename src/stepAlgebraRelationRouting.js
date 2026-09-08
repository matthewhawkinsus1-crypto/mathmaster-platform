const RELATION_TOKEN_RE = /(?:<=|>=|[<>=≤≥]|\\leq?|\\geq?)/;
const INEQUALITY_TOKEN_RE = /(?:<=|>=|[<>≤≥]|\\leq?|\\geq?)/;
const ABSOLUTE_VALUE_RE = /\|[^|]+\|/;

const normalizePrompt = (value) => String(value ?? '')
  .replace(/\$/g, '')
  .replace(/\\\(|\\\)|\\\[|\\\]/g, '')
  .replace(/\u2212/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

const hasStructuredRelation = (question = {}) => [
  question.equation,
  question.inequality,
  question.relation,
  question.expression,
  question?.metadata?.equation,
  question?.metadata?.inequality,
  question?.metadata?.relation,
  question?.metadata?.expression,
].some((value) => typeof value === 'string' && value.trim());

export const extractPromptRelationSource = (question = {}) => {
  const type = String(question?.type || '').trim();
  if (type && !['stepAlgebra', 'stepAlgebra2'].includes(type)) return '';

  const prompt = normalizePrompt(question?.prompt);
  if (!prompt) return '';

  const match = prompt.match(
    /\b(?:solve|determine(?:\s+the\s+solution(?:\s+set)?)?|find(?:\s+the\s+solution(?:\s+set)?)?)\s+(.+?)(?=,\s*(?:then\b|and\b)|;\s*|[.?!]\s*$|$)/i,
  );
  const candidate = String(match?.[1] || '')
    .trim()
    .replace(/[.?!]+$/, '')
    .trim();

  if (!candidate || !RELATION_TOKEN_RE.test(candidate)) return '';
  if (!INEQUALITY_TOKEN_RE.test(candidate) && !ABSOLUTE_VALUE_RE.test(candidate)) return '';

  return candidate;
};

export const withPromptRelationSource = (question = {}) => {
  if (hasStructuredRelation(question)) return question;
  const source = extractPromptRelationSource(question);
  return source ? { ...question, equation: source } : question;
};

const RELATION_TOKEN_RE = /(?:<=|>=|[<>=≤≥]|\\leq?|\\geq?)/;
const INEQUALITY_TOKEN_RE = /(?:<=|>=|[<>≤≥]|\\leq?|\\geq?)/;
const ABSOLUTE_VALUE_RE = /\|[^|]+\|/;

const normalizePrompt = (value) => String(value ?? '')
  .replace(/\$/g, '')
  .replace(/\\\(|\\\)|\\\[|\\\]/g, '')
  .replace(/\u2212/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

const relationSourceDescriptor = (question = {}) => {
  const candidates = [
    [question.equation, false],
    [question.inequalityText, true],
    [question.inequality, true],
    [question.equationAscii, false],
    [question.initialEquation, false],
    [question.formula, false],
    [question.equationLatex, false],
    [question?.metadata?.equation, false],
    [question?.metadata?.inequalityText, true],
    [question?.metadata?.inequality, true],
  ];

  const match = candidates.find(([value]) => (
    typeof value === 'string' && value.trim() && RELATION_TOKEN_RE.test(value)
  ));
  if (!match) return null;
  return { source: String(match[0]).trim(), promoteToEquation: match[1] };
};

export const inferRelationVariable = (source) => {
  const identifiers = String(source ?? '').match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  const variables = [...new Set(
    identifiers
      .filter((identifier) => identifier.length === 1)
      .filter((identifier) => identifier.toLowerCase() !== 'e'),
  )];
  return variables.length === 1 ? variables[0] : null;
};

export const extractPromptRelationSource = (question = {}) => {
  const type = String(question?.type || '').trim();
  if (type && !['stepAlgebra', 'stepAlgebra2'].includes(type)) return '';

  const prompt = normalizePrompt(question?.prompt);
  if (!prompt) return '';

  const match = prompt.match(
    /\b(?:solve|determine(?:\s+the\s+solution(?:\s+set)?)?|find(?:\s+the\s+solution(?:\s+set)?)?)\s+(.+?)(?=,\s*(?:then\b|and\b)|\s+(?:step\s+by\s+step|then\s+(?:graph|write|state)\b|and\s+(?:graph|write|state)\b)|;\s*|[.?!](?:\s|$)|$)/i,
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
  const type = String(question?.type || '').trim();
  if (type && !['stepAlgebra', 'stepAlgebra2'].includes(type)) return question;

  const structured = relationSourceDescriptor(question);
  const promptSource = structured ? '' : extractPromptRelationSource(question);
  const source = structured?.source || promptSource;
  if (!source) return question;

  const additions = {};
  if (!question.equation && (structured?.promoteToEquation || promptSource)) {
    additions.equation = source;
  }

  const authoredVariable = question.solveFor
    || question.variable
    || question.objective?.variable;
  if (!authoredVariable) {
    const inferredVariable = inferRelationVariable(source);
    // x is already the relation workspace's legacy default. Only materialize a
    // solveFor field when the fallback would otherwise choose the WRONG letter.
    if (inferredVariable && inferredVariable !== 'x') additions.solveFor = inferredVariable;
  }

  return Object.keys(additions).length ? { ...question, ...additions } : question;
};

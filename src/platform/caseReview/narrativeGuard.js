/*
 * WHAT A CASE REVIEW MAY NEVER SAY.
 *
 * "Facts available for teacher narrative" are sentences a teacher may lift
 * into a parent, administrator or ARD narrative. They state what MathMaster
 * recorded. They never state a verdict about a plan or a person:
 *
 *   IEP implemented / not implemented        teacher complied / failed to comply
 *   a support caused the grade               the student chose not to try
 *   a disability caused the result           the student would have passed with/without a support
 *
 * Every narrative sentence is produced from a fixed template. The template is
 * checked against these families BEFORE any teacher-written text (an
 * assignment title) is put into it, so a title that happens to contain "IEP"
 * or "failed" cannot trip the guard, and no title can smuggle a conclusion
 * past it — the conclusion would have to be in the template, and the
 * template is refused.
 *
 * The same check runs over every finished narrative fact in tests.
 */

export const FORBIDDEN_CONCLUSIONS = Object.freeze([
  {
    id: 'compliance-verdict',
    reason: 'A compliance verdict about a plan or a person (implemented, complied, violated). MathMaster records events; it does not determine compliance.',
    pattern: /\b(?:implement(?:ed|ation|ing)?|(?:non-?)?complian(?:ce|t)|compl(?:y|ied|ies|ying)|violat\w*|fail(?:ed|s|ing|ure)?|in accordance with)\b/i,
  },
  {
    id: 'negative-from-absence',
    reason: 'A missing record stated as something that did not happen. Say "No MathMaster record …" instead.',
    pattern: /\b(?:(?:did|does|do|was|were|has|have|had)\s+not|didn't|doesn't|don't|wasn't|weren't|hasn't|haven't|hadn't)\s+(?:provide|provided|receive|received|give|given|deliver|delivered|work|worked|try|tried|attempt|attempted|complete|completed|open|opened|use|used|engage|engaged|participate|participated|follow|followed|implement|implemented|get|got)\b|\bnot\s+(?:provided|implemented|followed|given|delivered|received|offered|honou?red)\b|\bnever\b/i,
  },
  {
    id: 'causation',
    reason: 'A cause attributed to a support, a condition or a student. The case review reports co-occurring facts, never why.',
    pattern: /\b(?:caus(?:e|ed|es|ing)|led to|leads to|resulted in|results in|as a result of|because of|due to|attributable|explains? (?:the|why))\b/i,
  },
  {
    id: 'motive-or-effort',
    reason: 'A judgement of motive, effort or character (chose not to try, refused, unmotivated, lazy, gave up).',
    pattern: /\b(?:chos(?:e|en)|choos(?:e|es|ing))\s+(?:not\s+)?to\b|\b(?:refus(?:e|ed|es|ing|al)|unwilling\w*|lazy|laziness|unmotivated|motivat\w*|effort|apath\w*|careless\w*|persever\w*|grit|defian\w*|gave up|give up|gives up|giving up|not trying)\b/i,
  },
  {
    id: 'disability-attribution',
    reason: 'A disability, diagnosis or impairment named as a reason for a result.',
    pattern: /\b(?:disabilit\w*|disabled|disorder|diagnos\w*|ADHD|dyslexi\w*|dyscalcul\w*|autis\w*|impair\w*|deficit)\b/i,
  },
  {
    id: 'counterfactual',
    reason: 'What would have happened with or without a support. No record can show that.',
    pattern: /\b(?:would|could|should|might)(?:\s+not|n't)?\s+have\b|\bwould\s+(?:pass|fail|succeed|score|improve)\b|\bwithout (?:the|a|an|this|that|these|those|their|his|her) (?:support|accommodation|modification)s?\b/i,
  },
  {
    id: 'proof-claim',
    reason: 'A claim that the records prove something. They are records, not proof.',
    pattern: /\b(?:prove[sd]?|proving|proof)\b/i,
  },
]);

/** The forbidden families a sentence trips; empty when it is safe. */
export const narrativeViolations = (text) => {
  const sentence = String(text ?? '');
  return FORBIDDEN_CONCLUSIONS
    .filter((rule) => rule.pattern.test(sentence))
    .map((rule) => ({ id: rule.id, reason: rule.reason }));
};

export class ForbiddenNarrativeError extends Error {
  constructor(template, violations) {
    super(`A narrative template contains a forbidden conclusion (${violations.map((entry) => entry.id).join(', ')}): ${template}`);
    this.name = 'ForbiddenNarrativeError';
    this.violations = violations;
  }
}

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

/**
 * Render a narrative template. The template (with its placeholders still in
 * place) is checked first; values are inserted only into a template that
 * passed. A missing value is an error — never the word "undefined" in a
 * document a teacher may sign.
 */
export const renderNarrativeTemplate = (template, values = {}) => {
  const text = String(template ?? '');
  const violations = narrativeViolations(text.replace(PLACEHOLDER, ' '));
  if (violations.length) throw new ForbiddenNarrativeError(text, violations);
  return text.replace(PLACEHOLDER, (match, name) => {
    const value = values?.[name];
    if (value === undefined || value === null || (typeof value === 'number' && !Number.isFinite(value))) {
      throw new Error(`Narrative template value "${name}" is missing.`);
    }
    return String(value);
  });
};

export default renderNarrativeTemplate;

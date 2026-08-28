const cleanText = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const comparisonText = (value) => cleanText(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\b(?:a|an|the)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const substantiallyRepeatsPrompt = (promptValue, statementValue) => {
  const prompt = comparisonText(promptValue);
  const statement = comparisonText(statementValue);
  if (!prompt || !statement) return false;
  if (prompt.includes(statement) || statement.includes(prompt)) return true;

  const stem = (token) => {
    if (token.length <= 4) return token;
    return token
      .replace(/ing$/, '')
      .replace(/ed$/, '')
      .replace(/es$/, '')
      .replace(/s$/, '');
  };
  const statementTokens = statement.split(' ').filter((token) => token.length > 2).map(stem);
  if (statementTokens.length < 3) return false;
  const promptTokens = prompt.split(' ').filter((token) => token.length > 2).map(stem);
  const tokenMatchesPrompt = (token) => promptTokens.some((candidate) => (
    candidate === token
    || (token.length >= 3 && candidate.length >= 3 && (candidate.includes(token) || token.includes(candidate)))
  ));
  const overlap = statementTokens.filter(tokenMatchesPrompt).length / statementTokens.length;
  return overlap >= 0.72;
};

const authoredInfoMostlyRepeatsPrompt = (prompt, statements = []) => {
  if (!prompt || !statements.length) return false;
  const repeats = statements.filter((entry) => substantiallyRepeatsPrompt(prompt, entry?.text)).length;
  if (repeats >= Math.max(1, Math.ceil(statements.length * 0.6))) return true;

  // Authors often split one prompt into several short "reference" lines. No
  // single line necessarily repeats enough words to cross the threshold, even
  // though the card as a whole is just the prompt rewritten in fragments.
  // Compare the combined card as well so that pattern is removed.
  const combined = statements.map((entry) => cleanText(entry?.text)).filter(Boolean).join(' ');
  return substantiallyRepeatsPrompt(prompt, combined);
};

const normalizeStatement = (entry) => {
  if (typeof entry === 'string' || typeof entry === 'number') {
    const text = cleanText(entry);
    return text ? { text } : null;
  }
  if (!entry || typeof entry !== 'object') return null;
  const text = cleanText(entry.text || entry.statement || entry.value || entry.content);
  if (!text) return null;
  return {
    text,
    ...(entry.label ? { label: cleanText(entry.label) } : {}),
    ...(entry.emphasis === true ? { emphasis: true } : {}),
  };
};

export const resolveReferenceInfo = (question = {}) => {
  // Authors may explicitly opt out when the task itself is the reference.
  if (question?.referenceInfo === false) return null;

  const prompt = cleanText(question?.prompt);
  const authored = question?.referenceInfo;
  if (authored) {
    if (typeof authored === 'string') {
      const text = cleanText(authored);
      if (text) return { title: 'Information you need', statements: [{ text }], source: 'authored' };
    }
    if (typeof authored === 'object') {
      const statements = asArray(authored.statements || authored.items || authored.lines || authored.text)
        .map(normalizeStatement)
        .filter(Boolean);
      const summary = cleanText(authored.summary);
      if (summary && !statements.some((entry) => entry.text === summary)) statements.unshift({ text: summary, emphasis: true });
      if (statements.length) {
        // "Information you need" is a reference card, not a second copy of the
        // question and not a place to pre-solve the student's first step.
        // If most authored lines simply restate the task, the sticky task card
        // is the better reference and this card stays out of the way.
        if (authoredInfoMostlyRepeatsPrompt(prompt, statements)) return null;
        return {
          title: cleanText(authored.title) || 'Information you need',
          statements,
          source: 'authored',
        };
      }
    }
  }

  const scenario = cleanText(question?.scenario || question?.context?.scenario);
  if (scenario && !substantiallyRepeatsPrompt(prompt, scenario)) {
    return {
      title: 'Information you need',
      statements: [{ text: scenario, emphasis: true }],
      source: 'scenario',
    };
  }

  return null;
};

export default resolveReferenceInfo;

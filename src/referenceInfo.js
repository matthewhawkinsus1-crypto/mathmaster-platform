const cleanText = (value) => String(value ?? '').trim();
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

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
        return {
          title: cleanText(authored.title) || 'Information you need',
          statements,
          source: 'authored',
        };
      }
    }
  }

  const prompt = cleanText(question?.prompt);
  const scenario = cleanText(question?.scenario || question?.context?.scenario);
  if (scenario && scenario !== prompt) {
    return {
      title: 'Information you need',
      statements: [{ text: scenario, emphasis: true }],
      source: 'scenario',
    };
  }

  return null;
};

export default resolveReferenceInfo;

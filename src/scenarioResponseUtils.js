export const normalizeResponseText = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9+\-./ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const matchesAcceptedText = (value, accepted = []) => {
  const normalized = normalizeResponseText(value);
  return (Array.isArray(accepted) ? accepted : [accepted]).some(
    (candidate) => normalizeResponseText(candidate) === normalized,
  );
};

/**
 * Each required concept may be a string or an array of acceptable alternatives.
 * All concept groups must be represented somewhere in the response.
 */
export const matchesConceptGroups = (value, conceptGroups = []) => {
  const normalized = normalizeResponseText(value);
  const groups = Array.isArray(conceptGroups) ? conceptGroups : [];
  if (!groups.length) return normalized.length > 0;
  return groups.every((group) => {
    const alternatives = Array.isArray(group) ? group : [group];
    return alternatives.some((candidate) => {
      const concept = normalizeResponseText(candidate);
      return concept && normalized.includes(concept);
    });
  });
};

export const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
};

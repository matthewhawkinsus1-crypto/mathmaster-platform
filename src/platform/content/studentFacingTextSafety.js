const AUTHORING_TOKEN = /\{\{\s*[A-Za-z_][A-Za-z0-9_]*(?:\s*\|\s*[A-Za-z]+)?\s*\}\}/;

export const containsUnresolvedAuthoringToken = (value, seen = new Set()) => {
  if (typeof value === 'string') return AUTHORING_TOKEN.test(value);
  if (value == null || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((entry) => containsUnresolvedAuthoringToken(entry, seen));
  }
  return Object.values(value).some((entry) => containsUnresolvedAuthoringToken(entry, seen));
};

export const studentSafePromptText = (value) => {
  const text = String(value ?? '');
  if (!containsUnresolvedAuthoringToken(text)) return text;
  return 'This question is temporarily unavailable because its generated values were not finalized. Please let your teacher know.';
};

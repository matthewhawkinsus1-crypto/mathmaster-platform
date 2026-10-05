// An external original is teacher-entered evidence, never a browser verdict.
export const validateExternalOriginalScore = (value) => {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') {
    throw new Error('Enter an original score from 0 through 100.');
  }
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error('Enter an original score from 0 through 100.');
  }
  return score;
};

export const normalizeExternalOriginal = (value) => {
  if (!value || typeof value !== 'object') return null;
  let originalScore = null;
  try { originalScore = validateExternalOriginalScore(value.originalScore); } catch { /* Missing evidence remains missing. */ }
  return {
    originalScore,
    source: String(value.source || '').trim().slice(0, 80),
    recordedBy: String(value.recordedBy || '').trim() || null,
    recordedAt: Number(value.recordedAt) || null,
  };
};

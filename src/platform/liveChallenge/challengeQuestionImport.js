// Pure package/assignment extraction for the Live Challenge Question Library.
// Server-side Path validation remains authoritative; this module only finds the
// question documents a teacher asked to import.

const parseMaybeJson = (value) => {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) throw new Error('Paste valid JSON containing at least one question.');
  try { return JSON.parse(text); }
  catch { throw new Error('Paste valid JSON before importing questions.'); }
};

export const normalizeChallengeQuestionPackage = (value) => {
  const parsed = parseMaybeJson(value);
  let questions = null;
  if (Array.isArray(parsed)) questions = parsed;
  else if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.documents)) questions = parsed.documents;
    else if (Array.isArray(parsed.items)) questions = parsed.items;
    else if (Array.isArray(parsed.questions)) questions = parsed.questions;
    else throw new Error('Question JSON must be an array or an object with documents, items, or questions.');
  } else {
    throw new Error('Question JSON must be an array or an object with documents, items, or questions.');
  }
  const usable = questions.filter((question) => question && typeof question === 'object' && !Array.isArray(question));
  if (!usable.length) throw new Error('Import at least one question.');
  return usable;
};

const bucketQuestions = (bucket) => {
  if (Array.isArray(bucket)) return bucket;
  if (Array.isArray(bucket?.questions)) return bucket.questions;
  if (Array.isArray(bucket?.items)) return bucket.items;
  return [];
};

export const challengeQuestionsFromAssignment = (assignment = {}) => {
  const source = assignment && typeof assignment === 'object' ? assignment : {};
  const collected = [];

  if (Array.isArray(source.sections)) {
    source.sections.forEach((section) => collected.push(...bucketQuestions(section)));
  } else if (Array.isArray(source.questions)) {
    collected.push(...source.questions);
  } else {
    ['warmup', 'classwork', 'practice', 'dol'].forEach((key) => collected.push(...bucketQuestions(source[key])));
  }

  const seenIds = new Set();
  const result = [];
  collected.forEach((question) => {
    if (!question || typeof question !== 'object' || Array.isArray(question)) return;
    const id = String(question.id || question.questionId || question.templateId || '').trim();
    if (id && seenIds.has(id)) return;
    if (id) seenIds.add(id);
    result.push(question);
  });
  return result;
};

export const summarizeChallengeImport = (result = {}) => ({
  total: Math.max(0, Number(result.total) || 0),
  accepted: Math.max(0, Number(result.accepted) || 0),
  rejected: Math.max(0, Number(result.rejected) || 0),
  reasonCounts: result.reasonCounts && typeof result.reasonCounts === 'object' ? result.reasonCounts : {},
});

export default normalizeChallengeQuestionPackage;

import { analyzeSafeResponseEntryRepair } from './liveResponseRepairPolicy.mjs';

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
};
const stable = (value) => JSON.stringify(canonicalize(value));
const clean = (value) => String(value ?? '').trim();
const isToleranceKey = (key) => key === 'tolerance' || /Tolerance$/.test(key);
const finite = (value) => Number.isFinite(Number(value));

const normalizeAnswer = (value) => {
  if (typeof value === 'string') return value.trim().replace(/\s+/g, ' ').toLowerCase();
  return stable(value);
};

const acceptedList = (value) => Array.isArray(value) ? value.map(normalizeAnswer) : [];
const isSuperset = (before, after) => {
  const oldSet = new Set(acceptedList(before));
  const newSet = new Set(acceptedList(after));
  for (const value of oldSet) if (!newSet.has(value)) return false;
  return true;
};

const leastSquares = (points = []) => {
  const rows = (Array.isArray(points) ? points : [])
    .map((point) => Array.isArray(point)
      ? ({ x: Number(point[0]), y: Number(point[1]) })
      : ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (rows.length < 2) return null;
  const meanX = rows.reduce((sum, p) => sum + p.x, 0) / rows.length;
  const meanY = rows.reduce((sum, p) => sum + p.y, 0) / rows.length;
  const denominator = rows.reduce((sum, p) => sum + ((p.x - meanX) ** 2), 0);
  if (!(denominator > 0)) return null;
  const slope = rows.reduce((sum, p) => sum + ((p.x - meanX) * (p.y - meanY)), 0) / denominator;
  return { slope, intercept: meanY - slope * meanX };
};

const effectiveTopLevelTolerance = (question, key) => {
  if (finite(question?.[key])) return Number(question[key]);
  if (question?.type !== 'dataModelingLab') return null;
  const regression = leastSquares(question.points);
  if (key === 'interceptTolerance') return 0.8;
  if (key === 'correlationTolerance') return 0.03;
  if (key === 'slopeTolerance' && regression) return Math.max(0.2, Math.abs(regression.slope) * 0.12);
  if (key === 'predictionTolerance' && regression && finite(question.predictionX)) {
    const expected = regression.slope * Number(question.predictionX) + regression.intercept;
    return Math.max(0.5, Math.abs(expected) * 0.08);
  }
  return null;
};

const stripWordingAndGrading = (question = {}) => {
  const copy = {};
  for (const [key, value] of Object.entries(question)) {
    if (key === 'prompt' || key === 'guidedNotes' || key === 'acceptedAnswers' || isToleranceKey(key)) continue;
    if (key === 'answerFields' && Array.isArray(value)) {
      copy[key] = value.map((field) => Object.fromEntries(
        Object.entries(field).filter(([fieldKey]) => fieldKey !== 'acceptedAnswers' && !isToleranceKey(fieldKey)),
      ));
      continue;
    }
    copy[key] = value;
  }
  return copy;
};

const gradingExpansion = (before = {}, after = {}) => {
  if (!before?.questionId || before.questionId !== after?.questionId) return { safe: false };
  if (stable(stripWordingAndGrading(before)) !== stable(stripWordingAndGrading(after))) return { safe: false };

  const gradingKeys = [];
  if (stable(before.acceptedAnswers ?? []) !== stable(after.acceptedAnswers ?? [])) {
    if (!isSuperset(before.acceptedAnswers, after.acceptedAnswers)) return { safe: false };
    gradingKeys.push('acceptedAnswers');
  }

  const topToleranceKeys = new Set([
    ...Object.keys(before).filter(isToleranceKey),
    ...Object.keys(after).filter(isToleranceKey),
  ]);
  for (const key of topToleranceKeys) {
    if (stable(before[key] ?? null) === stable(after[key] ?? null)) continue;
    const oldValue = effectiveTopLevelTolerance(before, key);
    const newValue = effectiveTopLevelTolerance(after, key);
    if (!Number.isFinite(oldValue) || !Number.isFinite(newValue) || newValue < oldValue) return { safe: false };
    gradingKeys.push(key);
  }

  const beforeFields = Array.isArray(before.answerFields) ? before.answerFields : [];
  const afterFields = Array.isArray(after.answerFields) ? after.answerFields : [];
  if (beforeFields.length !== afterFields.length) return { safe: false };
  for (let index = 0; index < beforeFields.length; index += 1) {
    const oldField = beforeFields[index];
    const newField = afterFields[index];
    if (clean(oldField?.id) !== clean(newField?.id)) return { safe: false };

    if (stable(oldField?.acceptedAnswers ?? []) !== stable(newField?.acceptedAnswers ?? [])) {
      if (!isSuperset(oldField?.acceptedAnswers, newField?.acceptedAnswers)) return { safe: false };
      gradingKeys.push(`answerFields.${clean(oldField.id)}.acceptedAnswers`);
    }

    const toleranceKeys = new Set([
      ...Object.keys(oldField || {}).filter(isToleranceKey),
      ...Object.keys(newField || {}).filter(isToleranceKey),
    ]);
    for (const key of toleranceKeys) {
      if (stable(oldField?.[key] ?? null) === stable(newField?.[key] ?? null)) continue;
      if (!finite(oldField?.[key]) || !finite(newField?.[key]) || Number(newField[key]) < Number(oldField[key])) return { safe: false };
      gradingKeys.push(`answerFields.${clean(oldField.id)}.${key}`);
    }
  }

  return gradingKeys.length ? { safe: true, gradingKeys } : { safe: false };
};

const clarificationOnly = (before = {}, after = {}) => {
  if (!before?.questionId || before.questionId !== after?.questionId) return false;
  const strip = (question) => {
    const copy = { ...question };
    delete copy.prompt;
    delete copy.guidedNotes;
    return copy;
  };
  return stable(strip(before)) === stable(strip(after));
};

export function classifyContentQuestionChange(before = {}, after = {}) {
  if (stable(before) === stable(after)) return { classification: 'unchanged', safe: true };

  const responseRepair = analyzeSafeResponseEntryRepair(before, after);
  if (responseRepair.safe) {
    return {
      classification: 'safeResponseControl',
      safe: true,
      affectedFieldIds: responseRepair.affectedFieldIds || [],
    };
  }

  const expansion = gradingExpansion(before, after);
  if (expansion.safe) {
    return { classification: 'gradingExpansion', safe: true, gradingKeys: expansion.gradingKeys };
  }

  if (clarificationOnly(before, after)) {
    return { classification: 'clarificationOnly', safe: true };
  }

  return {
    classification: 'fundamental',
    safe: false,
    reason: 'The scored task or protected structure changed.',
  };
}

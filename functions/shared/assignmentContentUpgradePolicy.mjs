import {
  GRAPH_VIEWPORT_REPAIR_KIND,
  SYSTEMS_WORKSPACE_UPGRADE_REPAIR_KIND,
  analyzeSafeResponseEntryRepair,
} from './liveResponseRepairPolicy.mjs';
import { getPlatformQuestionFamily } from './questionFamilyRegistry.mjs';

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

/*
 * `questionWeightBasis` records WHO set a question's grade value (the author,
 * a teacher, or MathMaster's allocator — functions/shared/questionValue.mjs).
 * It is provenance, not the scored task: two questions that differ only in it
 * are the same question with the same value, and must never be classified as
 * a fundamental change (which retires and replaces a question that already has
 * student work). The value itself, `questionWeight`, is compared as before.
 */
const withoutValueProvenance = (question) => {
  if (!question || typeof question !== 'object' || !Object.prototype.hasOwnProperty.call(question, 'questionWeightBasis')) return question;
  const { questionWeightBasis: _basis, ...rest } = question;
  return rest;
};

/*
 * A RECOVERY-CAPABILITY UPGRADE IS NOT A NEW QUESTION.
 *
 * A newer release of a lesson may turn a static Warm-Up or DOL question into
 * a Question Family slot so that it can be recovered. Applied to a live
 * assignment that would change the question every student is given — the
 * classifier is right to call that fundamental, and retiring a question
 * students answered merely to enable Recovery is exactly what must not
 * happen. So, for the Content V2 live upgrade only (opt-in), such a change is
 * its own classification:
 *
 *   recoveryCapability   the live question is kept BYTE FOR BYTE, and the
 *                        target's family becomes its Recovery binding in the
 *                        assignment's separately versioned recoveryContent
 *                        (recoveryContent.mjs), certified at commit like any
 *                        other binding. No tracker is migrated; no grade can
 *                        change.
 *
 * Scoped tightly: the live question is static, the target is the same
 * question id and role as a platform family slot answered in the same tool,
 * and that family RECOGNIZES the live question — it can say which of its own
 * versions is the original's mathematics. Anything else stays fundamental.
 */
const TEMPLATE_FIELDS = Object.freeze(['questionFamily', 'generator', 'generatorVersion', 'variants']);

export function recoveryCapabilityChange(beforeQuestion = {}, afterQuestion = {}) {
  const before = beforeQuestion || {};
  const after = afterQuestion || {};
  const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  if (!before.questionId || before.questionId !== after.questionId) return { safe: false };
  if (isObject(before.questionFamily) || !isObject(after.questionFamily)) return { safe: false };
  if (clean(before.activityRole || after.activityRole) && clean(before.activityRole) !== clean(after.activityRole)) return { safe: false };
  const familyId = clean(after.questionFamily.id || after.questionFamily.familyId);
  const version = Number.isInteger(Number(after.questionFamily.version)) && Number(after.questionFamily.version) >= 1
    ? Number(after.questionFamily.version)
    : null;
  const family = familyId ? getPlatformQuestionFamily(familyId, version) : null;
  if (!family || typeof family.recognize !== 'function' || !family.recovery?.eligible) return { safe: false };
  const tool = clean(after.questionFamily.tool) || clean(after.type);
  if (tool && tool !== clean(before.type)) return { safe: false };
  let recognized = null;
  try {
    recognized = family.recognize(before);
  } catch {
    recognized = null;
  }
  if (!recognized) return { safe: false };
  return {
    safe: true,
    questionFamily: {
      id: family.id,
      version: family.version,
      constraints: { ...(isObject(after.questionFamily.constraints) ? after.questionFamily.constraints : {}) },
      ...(clean(after.questionFamily.tool) ? { tool: clean(after.questionFamily.tool) } : {}),
    },
  };
}

export function classifyContentQuestionChange(beforeQuestion = {}, afterQuestion = {}, { recoveryCapability = false } = {}) {
  const before = withoutValueProvenance(beforeQuestion) || {};
  const after = withoutValueProvenance(afterQuestion) || {};
  if (stable(before) === stable(after)) return { classification: 'unchanged', safe: true };

  const responseRepair = analyzeSafeResponseEntryRepair(before, after);
  if (responseRepair.safe && responseRepair.repairKind === GRAPH_VIEWPORT_REPAIR_KIND) {
    // Reframing the same graph is display-only: no response field changed, so
    // nothing is regraded and no attempt is returned.
    return {
      classification: 'graphViewportRepair',
      safe: true,
      presentationOnly: true,
      affectedFieldIds: [],
      changedViewportKeys: responseRepair.changedViewportKeys || [],
    };
  }
  if (responseRepair.safe && responseRepair.repairKind === SYSTEMS_WORKSPACE_UPGRADE_REPAIR_KIND) {
    return {
      classification: 'systemsWorkspaceUpgrade',
      safe: true,
      affectedFieldIds: [],
      repairKind: SYSTEMS_WORKSPACE_UPGRADE_REPAIR_KIND,
    };
  }
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

  if (recoveryCapability) {
    const capability = recoveryCapabilityChange(before, after);
    if (capability.safe) {
      return {
        classification: 'recoveryCapability',
        safe: true,
        // The live question is kept as it is; only Recovery is added.
        keepsLiveQuestion: true,
        presentationOnly: true,
        affectedFieldIds: [],
        recoveryFamily: capability.questionFamily,
      };
    }
  }

  return {
    classification: 'fundamental',
    safe: false,
    reason: 'The scored task or protected structure changed.',
  };
}

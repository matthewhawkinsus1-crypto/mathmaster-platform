"use strict";

const clamp = (value) => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));

function parseStoredResponse(record = {}) {
  const raw = String(record?.lastResponseKey || "").trim();
  if (!raw || (!raw.startsWith("{") && !raw.startsWith("["))) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function regressionFor(points = []) {
  const rows = (Array.isArray(points) ? points : [])
    .map((point) => Array.isArray(point)
      ? ({ x: Number(point[0]), y: Number(point[1]) })
      : ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (rows.length < 2) return null;
  const meanX = rows.reduce((sum, point) => sum + point.x, 0) / rows.length;
  const meanY = rows.reduce((sum, point) => sum + point.y, 0) / rows.length;
  const denominator = rows.reduce((sum, point) => sum + ((point.x - meanX) ** 2), 0);
  if (!(denominator > 0)) return null;
  const m = rows.reduce((sum, point) => sum + ((point.x - meanX) * (point.y - meanY)), 0) / denominator;
  return { m, b: meanY - m * meanX };
}

function dataModelingFitIsCorrect(question = {}, response = {}) {
  if (String(question.type || "") !== "dataModelingLab") return null;
  const mode = String(question.mode || "full");
  if (!["lineFit", "linearFit", "linearFitPrediction"].includes(mode)) return null;
  const regression = regressionFor(question.points);
  const m = Number(response.m);
  const b = Number(response.b);
  if (!regression || !Number.isFinite(m) || !Number.isFinite(b)) return null;
  const slopeTolerance = Number(
    question.slopeTolerance ?? Math.max(0.2, Math.abs(regression.m) * 0.12)
  );
  const interceptTolerance = Number(question.interceptTolerance ?? 0.8);
  if (!Number.isFinite(slopeTolerance) || !Number.isFinite(interceptTolerance)) return null;
  return Math.abs(m - regression.m) <= slopeTolerance
    && Math.abs(b - regression.b) <= interceptTolerance;
}

const normalizeText = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

function fieldAccepts(field = {}, response) {
  const answers = [
    ...(field.answer !== undefined && field.answer !== null ? [field.answer] : []),
    ...(Array.isArray(field.acceptedAnswers) ? field.acceptedAnswers : []),
  ];
  if (!answers.length) return null;

  const numericResponse = Number(response);
  const numericAnswer = Number(field.answer);
  const tolerance = Number(field.tolerance);
  if (Number.isFinite(numericResponse) && Number.isFinite(numericAnswer) && Number.isFinite(tolerance)) {
    return Math.abs(numericResponse - numericAnswer) <= Math.abs(tolerance);
  }

  const normalized = normalizeText(response);
  return answers.some((answer) => normalizeText(answer) === normalized);
}

function recalcPartCredit(record, partGrades) {
  const scorable = partGrades.filter((part) => part?.graded !== false);
  const totalWeight = scorable.reduce((sum, part) => sum + Math.max(0, Number(part?.weight) || 1), 0);
  const earned = scorable.reduce((sum, part) => {
    if (!part?.isComplete) return sum;
    const weight = Math.max(0, Number(part?.weight) || 1);
    const credit = Number.isFinite(Number(part?.credit))
      ? Math.max(0, Math.min(1, Number(part.credit)))
      : (part?.isCorrect ? 1 : 0);
    return sum + (part?.isCorrect ? Math.max(credit, 1) : credit) * weight;
  }, 0);
  return totalWeight > 0 ? Math.min(90, Math.round((earned / totalWeight) * 100)) : 0;
}

function compactHistory(history, entry) {
  return [...(Array.isArray(history) ? history : []), entry].slice(-20);
}

function migrateResponseControlRecord(record = {}, change = {}, correctedAt) {
  const affected = new Set((change.affectedFieldIds || []).map(String));
  if (!affected.size || !Array.isArray(record.partGrades) || !record.partGrades.length) return record;
  if (record.status === "correct") return record;

  let changed = false;
  const partGrades = record.partGrades.map((part) => {
    if (!affected.has(String(part?.id)) || !part?.isComplete || part?.isCorrect) return part;
    changed = true;
    return { ...part, isCorrect: true, credit: 1, liveCorrectionCredit: true };
  });
  if (!changed) return record;

  const allComplete = partGrades.length > 0 && partGrades.every((part) => part?.isComplete);
  const allCorrect = allComplete && partGrades.every((part) => part?.graded === false || part?.isCorrect);
  const recalculated = recalcPartCredit(record, partGrades);
  const wasExpired = record.status === "expired";
  return {
    ...record,
    status: allCorrect ? "correct" : (wasExpired ? "attempted" : record.status),
    attemptCount: allCorrect ? Number(record.attemptCount || 0)
      : (wasExpired ? Math.max(0, Number(record.attemptCount || 0) - 1) : Number(record.attemptCount || 0)),
    partialCredit: allCorrect ? 100 : Math.max(clamp(record.partialCredit), recalculated),
    bestPartialCredit: allCorrect ? 100 : Math.max(clamp(record.bestPartialCredit), recalculated),
    partGrades,
    liveCorrectionHistory: compactHistory(record.liveCorrectionHistory, {
      kind: "content-version-response-repair",
      questionId: change.questionId,
      affectedFieldIds: [...affected],
      correctedAt,
      preservedTotalAttempts: Number(record.totalAttempts || 0),
      grantedRepairRetry: wasExpired && !allCorrect,
    }),
  };
}

function migrateMultiAnswerExpansion(record = {}, change = {}, correctedAt) {
  const question = change.afterQuestion || {};
  if (!Array.isArray(question.answerFields) || !Array.isArray(record.partGrades) || !record.partGrades.length) {
    return { record, provable: false };
  }
  const gradingKeys = new Set(change.gradingKeys || []);
  const fields = new Map(question.answerFields.map((field) => [String(field.id), field]));
  let improved = false;
  const partGrades = record.partGrades.map((part) => {
    const id = String(part?.id || "");
    const relevant = [...gradingKeys].some((key) => key.startsWith(`answerFields.${id}.`));
    if (!relevant || !part?.isComplete || part?.isCorrect || !fields.has(id)) return part;
    const accepted = fieldAccepts(fields.get(id), part.response);
    if (accepted !== true) return part;
    improved = true;
    return { ...part, isCorrect: true, credit: 1, contentVersionRegraded: true };
  });
  if (!improved) return { record, provable: true };

  const allComplete = partGrades.length > 0 && partGrades.every((part) => part?.isComplete);
  const allCorrect = allComplete && partGrades.every((part) => part?.graded === false || part?.isCorrect);
  const recalculated = recalcPartCredit(record, partGrades);
  return {
    provable: true,
    record: {
      ...record,
      status: allCorrect ? "correct" : record.status,
      partialCredit: allCorrect ? 100 : Math.max(clamp(record.partialCredit), recalculated),
      bestPartialCredit: allCorrect ? 100 : Math.max(clamp(record.bestPartialCredit), recalculated),
      partGrades,
      contentVersionRegradeHistory: compactHistory(record.contentVersionRegradeHistory, {
        kind: "grading-expansion",
        questionId: change.questionId,
        correctedAt,
        previousBestPartialCredit: clamp(record.bestPartialCredit),
        newBestPartialCredit: allCorrect ? 100 : Math.max(clamp(record.bestPartialCredit), recalculated),
      }),
    },
  };
}

function migrateGradingExpansionRecord(record = {}, change = {}, correctedAt) {
  if (!record || record.status === "unattempted" || record.status === "correct") return record;
  const response = parseStoredResponse(record);
  if (response) {
    const fitCorrect = dataModelingFitIsCorrect(change.afterQuestion, response);
    if (fitCorrect === true) {
      return {
        ...record,
        status: "correct",
        partialCredit: 100,
        bestPartialCredit: 100,
        contentVersionRegradeHistory: compactHistory(record.contentVersionRegradeHistory, {
          kind: "grading-expansion",
          questionId: change.questionId,
          correctedAt,
          previousBestPartialCredit: clamp(record.bestPartialCredit),
          newBestPartialCredit: 100,
          preservedTotalAttempts: Number(record.totalAttempts || 0),
        }),
      };
    }
    if (fitCorrect === false) {
      const wasExpired = record.status === "expired";
      return wasExpired ? {
        ...record,
        status: "attempted",
        attemptCount: Math.max(0, Number(record.attemptCount || 0) - 1),
        contentVersionRegradeHistory: compactHistory(record.contentVersionRegradeHistory, {
          kind: "grading-expansion",
          questionId: change.questionId,
          correctedAt,
          previousBestPartialCredit: clamp(record.bestPartialCredit),
          newBestPartialCredit: clamp(record.bestPartialCredit),
          preservedTotalAttempts: Number(record.totalAttempts || 0),
          grantedRepairRetry: true,
        }),
      } : record;
    }
  }

  const multipart = migrateMultiAnswerExpansion(record, change, correctedAt);
  return multipart.provable ? multipart.record : record;
}

function migrateTrackerForContentUpgrade({
  tracker = {},
  plan,
  correctedAt = new Date().toISOString(),
} = {}) {
  if (!plan || !Array.isArray(plan.changes)) throw new Error("A content upgrade plan is required.");
  let changed = false;
  let gradeMayChange = false;
  const next = { ...(tracker || {}) };

  for (const change of plan.changes) {
    const index = Number(change.flatIndex);
    if (!Number.isInteger(index) || index < 0 || next[index] === undefined) continue;
    const before = next[index];
    let after = before;
    if (change.classification === "safeResponseControl") {
      after = migrateResponseControlRecord(before, change, correctedAt);
    } else if (change.classification === "gradingExpansion") {
      after = migrateGradingExpansionRecord(before, change, correctedAt);
    }
    if (after !== before) {
      next[index] = after;
      changed = true;
      if (clamp(after.bestPartialCredit) !== clamp(before.bestPartialCredit) || after.status !== before.status) {
        gradeMayChange = true;
      }
    }
  }

  return { tracker: changed ? next : tracker, changed, gradeMayChange };
}

module.exports = {
  dataModelingFitIsCorrect,
  migrateTrackerForContentUpgrade,
};

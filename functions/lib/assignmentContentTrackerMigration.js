"use strict";

const { normalizeStoredQuestionRecord } = require("./classroomGradeRuntime");

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
  // The fit is all this regrade can verify. A question whose grade also
  // required a prediction (always for linearFitPrediction; for a line fit when
  // a predictionX is authored) cannot be marked correct on the fit alone —
  // that credited wrong predictions in full. Not provable here: the record is
  // left as it was, and a teacher can still correct it from the Inspector.
  const asksPrediction = mode === "linearFitPrediction"
    || (question.predictionX !== undefined && question.predictionX !== null && String(question.predictionX).trim() !== "");
  if (asksPrediction) return null;
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

/*
 * THE SERVER'S OWN GRADER FOR A MULTI-ANSWER REGRADE (GR07).
 *
 * A grading expansion (more accepted answers, a wider tolerance) re-marks a
 * part with ordinaryResponseGrading.mjs gradeMultiAnswerResponse — what
 * ingestion and the deadline finalizer run — against the upgraded question,
 * so a part is credited exactly when the server would credit the same
 * response today. The reader this replaces compared text and a `tolerance`
 * key: it refused the same answer in another spelling (`5cm` for an added
 * `5 cm`), never read `numericTolerance`, and credited numbers within a
 * `tolerance` that no grader reads. A question the server does not mark from
 * its stored copy (generated, a family slot, variants; serverGradingSupport)
 * is not provable here and keeps its record.
 *
 * An ES module, so the caller loads it (loadServerGrading, once per upgrade)
 * and passes it in; without it a multi-answer expansion is not provable.
 */
const loadServerGrading = () => import("../shared/ordinaryResponseGrading.mjs");

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

/*
 * A REPAIR GIVES BACK AN ATTEMPT, NEVER AN ATTEMPT NUMBER.
 *
 * A returned attempt lowers attemptCount (what is left to spend); the attempts
 * made still happened. A record from before totalAttempts existed counts them
 * in attemptCount alone, so lowering it lowered the number too: the next
 * attempt reused the last one's number and evidence key, overwrote that
 * event, the create trigger never fired, and the redone work never reached
 * mastery (GR20). So every migrated record writes its number down, read as
 * every grader reads it, as the browser's own correction
 * (liveQuestionCorrection.js) already keeps it.
 */
const attemptNumberOf = (record) => normalizeStoredQuestionRecord(record).totalAttempts;

/*
 * A SAFE RESPONSE CONTROL (a free-text box made a choice) credits every
 * complete part of a converted field, whatever was typed. Not re-marked by a
 * server grader, by design (GR07): the old box was free text no grader could
 * read reliably ("existing bad prose grading is credited"), the browser's live
 * correction credits it the same way (liveQuestionCorrection.js), and the new
 * choice's key is one of the old box's keys, so a server grader would read
 * the typed text as before and take that credit away.
 */
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
    totalAttempts: attemptNumberOf(record),
    partialCredit: allCorrect ? 100 : Math.max(clamp(record.partialCredit), recalculated),
    bestPartialCredit: allCorrect ? 100 : Math.max(clamp(record.bestPartialCredit), recalculated),
    partGrades,
    liveCorrectionHistory: compactHistory(record.liveCorrectionHistory, {
      kind: "content-version-response-repair",
      questionId: change.questionId,
      affectedFieldIds: [...affected],
      correctedAt,
      preservedTotalAttempts: attemptNumberOf(record),
      grantedRepairRetry: wasExpired && !allCorrect,
    }),
  };
}

function migrateMultiAnswerExpansion(record = {}, change = {}, correctedAt, serverGrading = null) {
  const question = change.afterQuestion || {};
  if (!Array.isArray(question.answerFields) || !Array.isArray(record.partGrades) || !record.partGrades.length) {
    return { record, provable: false };
  }
  // Marked by the server's own grader (loadServerGrading), or not at all.
  if (typeof serverGrading?.gradeMultiAnswerResponse !== "function"
    || serverGrading.serverGradingSupport?.(question)?.supported !== true) {
    return { record, provable: false };
  }
  const gradingKeys = new Set(change.gradingKeys || []);
  const fieldIds = new Set(question.answerFields.map((field) => String(field?.id)));
  const marked = new Map(serverGrading.gradeMultiAnswerResponse(question, Object.fromEntries(record.partGrades
    .map((part) => [String(part?.id || ""), String(part?.response ?? "")])))
    .parts.map((part) => [String(part.id), part.isCorrect === true]));
  let improved = false;
  const partGrades = record.partGrades.map((part) => {
    const id = String(part?.id || "");
    const relevant = [...gradingKeys].some((key) => key.startsWith(`answerFields.${id}.`));
    if (!relevant || !part?.isComplete || part?.isCorrect || !fieldIds.has(id)) return part;
    if (marked.get(id) !== true) return part;
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

function migrateGradingExpansionRecord(record = {}, change = {}, correctedAt, serverGrading = null) {
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
        totalAttempts: attemptNumberOf(record),
        contentVersionRegradeHistory: compactHistory(record.contentVersionRegradeHistory, {
          kind: "grading-expansion",
          questionId: change.questionId,
          correctedAt,
          previousBestPartialCredit: clamp(record.bestPartialCredit),
          newBestPartialCredit: clamp(record.bestPartialCredit),
          preservedTotalAttempts: attemptNumberOf(record),
          grantedRepairRetry: true,
        }),
      } : record;
    }
  }

  const multipart = migrateMultiAnswerExpansion(record, change, correctedAt, serverGrading);
  return multipart.provable ? multipart.record : record;
}

function migrateSystemsWorkspaceUpgradeRecord(record = {}, change = {}, correctedAt) {
  if (!record || record.status === "unattempted" || record.status === "correct") return record;

  // The old renderer collected only an ordered-pair answer. The corrected
  // renderer requires the full substitution/elimination workflow. Historical
  // score and total-attempt evidence are preserved exactly; only an exhausted
  // student receives one returned attempt so the fixed workspace is usable.
  // Nothing is re-marked, by design (GR07): the old ordered-pair answer is not
  // work the restored workspace's grader can read.
  if (record.status !== "expired") return record;

  return {
    ...record,
    status: "attempted",
    attemptCount: Math.max(0, Number(record.attemptCount || 0) - 1),
    totalAttempts: attemptNumberOf(record),
    contentVersionRegradeHistory: compactHistory(record.contentVersionRegradeHistory, {
      kind: "systems-workspace-upgrade",
      questionId: change.questionId,
      correctedAt,
      previousBestPartialCredit: clamp(record.bestPartialCredit),
      newBestPartialCredit: clamp(record.bestPartialCredit),
      preservedTotalAttempts: attemptNumberOf(record),
      grantedRepairRetry: true,
    }),
  };
}
function migrateTrackerForContentUpgrade({
  tracker = {},
  plan,
  correctedAt = new Date().toISOString(),
  // ordinaryResponseGrading.mjs, from loadServerGrading (GR07).
  serverGrading = null,
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
    } else if (change.classification === "systemsWorkspaceUpgrade") {
      after = migrateSystemsWorkspaceUpgradeRecord(before, change, correctedAt);
    } else if (change.classification === "gradingExpansion") {
      after = migrateGradingExpansionRecord(before, change, correctedAt, serverGrading);
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
  loadServerGrading,
  migrateTrackerForContentUpgrade,
};

"use strict";

/*
 * THE STUDENT'S REQUIRED ITEMS, AS THE CLOUD FUNCTIONS COUNT THEM.
 *
 * A student whose support profile carries the `reduced-item-count-same-rigor`
 * accommodation with a percentage is not responsible for the items it omits
 * (functions/shared/reducedWorkload.mjs). The browser already counts only the
 * student's required items (src/assignmentLifecycle.js studentRequiredQuestions,
 * src/platform/teacher/gradeEvidence.js). Every server path that turns a
 * tracker into a denominator — the Classroom passback (whole assignment and
 * section columns), the classwork completion rule, the DOL projection,
 * Recovery — reads the same omission from here, so a reduced student's
 * Classroom grade is the grade MathMaster shows, and their classwork can be
 * complete when everything they were assigned is done.
 *
 * Section-level readers filter their own indices with the omitted set: the
 * plan is content-only and answered work is always kept, so the omitted set
 * over the whole content, intersected with any base (with or without a
 * Practice Pass), is exactly what the student's projection omits from it.
 *
 * A student without the accommodation gets an empty set, and an empty set
 * changes nothing. Grading must never break because of a malformed profile:
 * any failure here is the unfiltered indices.
 */

let reducedWorkloadModule = null;
async function reducedWorkload() {
  if (!reducedWorkloadModule) reducedWorkloadModule = await import("../shared/reducedWorkload.mjs");
  return reducedWorkloadModule;
}

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/**
 * The storage indices this student's accommodation omits from `assignment`.
 *
 * `gradeData` is the student's `grades/{id}` document (its `.profile` and its
 * `.gradesByAssignment[assignmentId]` tracker). `answeredIndex` names the
 * question an attempt being recorded right now answers: answered work is
 * always required, so the projection is computed as it will read once that
 * attempt lands — the same answer the browser reaches from the written
 * tracker. `onError` is told about a failure that was absorbed.
 *
 * Never throws; resolves to an empty Set when nothing is omitted.
 */
async function studentOmittedFor({
  assignment = null,
  gradeData = null,
  assignmentId = null,
  answeredIndex = null,
  nowValue = Date.now(),
  onError = null,
} = {}) {
  const profile = gradeData?.profile;
  if (!isObject(profile) || !isObject(assignment)) return new Set();
  try {
    const id = String(assignmentId ?? assignment.id ?? "").trim();
    const stored = gradeData?.gradesByAssignment?.[id];
    const tracker = { ...(isObject(stored) ? stored : {}) };
    const answered = answeredIndex === null || answeredIndex === undefined ? NaN : Number(answeredIndex);
    if (Number.isInteger(answered) && answered >= 0) {
      const current = tracker[String(answered)];
      const status = typeof current === "string" ? current : current?.status;
      if (!status || status === "unattempted") tracker[String(answered)] = { status: "attempted" };
    }
    const { studentOmittedIndices } = await reducedWorkload();
    // The plan is seeded by the assignment id, exactly as the browser's
    // `{ id: snapshot.id, ...snapshot.data() }` carries it.
    const omitted = studentOmittedIndices({
      assignment: { id, ...assignment },
      profile,
      tracker,
      nowValue,
    });
    return omitted instanceof Set ? omitted : new Set();
  } catch (error) {
    if (typeof onError === "function") {
      try { onError(error); } catch { /* reporting must not break grading */ }
    }
    return new Set();
  }
}

/**
 * `indices` minus what the accommodation omits, order kept. A non-empty list
 * is never emptied: the plan always leaves every section at least one item,
 * and should anything ever disagree, grading the full section beats a column
 * with no denominator.
 */
function studentRequiredIndices(indices, omitted) {
  const list = Array.isArray(indices) ? indices : [];
  if (!(omitted instanceof Set) || omitted.size === 0) return list;
  const required = list.filter((index) => !omitted.has(Number(index)));
  return required.length ? required : list;
}

module.exports = {
  reducedWorkload,
  studentOmittedFor,
  studentRequiredIndices,
};

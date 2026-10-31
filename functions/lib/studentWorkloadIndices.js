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
 * tracker. `resetIndex` names a question an authorized replacement is about to
 * reset to unattempted. `onError` is told about a failure that was absorbed.
 *
 * Never throws; resolves to an empty Set when nothing is omitted.
 */
async function studentOmittedFor({
  assignment = null,
  gradeData = null,
  assignmentId = null,
  answeredIndex = null,
  resetIndex = null,
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
    // An authorized replacement writes its question back as unattempted, so
    // the projection reads it that way too (exactly as every later read will).
    const reset = resetIndex === null || resetIndex === undefined ? NaN : Number(resetIndex);
    if (Number.isInteger(reset) && reset >= 0) tracker[String(reset)] = { status: "unattempted" };
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

const sameSet = (left, right) => left.size === right.size && [...left].every((value) => right.has(value));

/*
 * A SUPPORT-PROFILE CHANGE THAT MOVES THE ITEMS A STUDENT OWES (TT23).
 *
 * Classroom is told a grade when a grade is written: a changed answer, an
 * override, a release. Saving a student's support profile writes
 * `grades/{id}.profile` and nothing else, so a reduced-item-count accommodation
 * added (or taken off) on work that is still open changed the grade MathMaster
 * shows at once and left Classroom on the old one until the next answer or the
 * due-date checkpoint. The two Classroom triggers ask this which assignments
 * the profile change moved and give them the same push an answer would.
 *
 * Only the profile's effect is looked for, in three narrowing steps, so the
 * common edit (a note, another accommodation) costs nothing:
 *   1. the profile's item-reduction key is the same before and after: stop;
 *   2. the reduction each assignment resolves to (percent and activities),
 *      read from its date fields alone, is the same before and after: skip it;
 *   3. only for the rest, the assignment itself is read and the items omitted
 *      before and after are compared: an assignment whose omitted items are the
 *      same has the same grade, so it is not woken.
 * Never throws: anything unexpected is "nothing moved", which is what happened
 * before this existed.
 */
async function assignmentsWithChangedWorkload({
  beforeData = null,
  afterData = null,
  readAnchors,
  readAssignment,
  nowValue = Date.now(),
  onError = null,
} = {}) {
  const beforeProfile = beforeData?.profile;
  const afterProfile = afterData?.profile;
  if (!isObject(beforeProfile) && !isObject(afterProfile)) return [];
  try {
    const {
      profileItemReductionKey,
      itemReductionPolicySummary,
      resolveItemReductionPolicy,
    } = await reducedWorkload();
    if (profileItemReductionKey(beforeProfile) === profileItemReductionKey(afterProfile)) return [];
    const ids = Object.keys(isObject(afterData?.gradesByAssignment) ? afterData.gradesByAssignment : {});
    if (!ids.length) return [];
    const anchors = await readAnchors(ids);
    const candidates = ids.filter((id) => {
      const assignment = anchors.get(id);
      if (!assignment) return false;
      return itemReductionPolicySummary(resolveItemReductionPolicy({ profile: beforeProfile, assignment, nowValue }))
        !== itemReductionPolicySummary(resolveItemReductionPolicy({ profile: afterProfile, assignment, nowValue }));
    });
    const moved = [];
    for (const id of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const assignment = await readAssignment(id);
      if (!isObject(assignment)) continue;
      // eslint-disable-next-line no-await-in-loop
      const was = await studentOmittedFor({ assignment, gradeData: { ...afterData, profile: beforeProfile }, assignmentId: id, nowValue, onError });
      // eslint-disable-next-line no-await-in-loop
      const now = await studentOmittedFor({ assignment, gradeData: afterData, assignmentId: id, nowValue, onError });
      if (!sameSet(was, now)) moved.push(id);
    }
    return moved;
  } catch (error) {
    if (typeof onError === "function") {
      try { onError(error); } catch { /* reporting must not break grading */ }
    }
    return [];
  }
}

// Just what picks the profile that governs an assignment (workloadAnchorDateKey).
const ASSIGNMENT_DATE_FIELDS = ["dueAt", "dueDate", "releaseAt", "releaseDate"];

/** The date fields of many assignments, read without their questions. */
async function readAssignmentAnchors(db, ids) {
  const anchors = new Map();
  for (let start = 0; start < ids.length; start += 100) {
    // eslint-disable-next-line no-await-in-loop
    const snapshots = await db.getAll(
      ...ids.slice(start, start + 100).map((id) => db.doc(`assignments/${id}`)),
      { fieldMask: ASSIGNMENT_DATE_FIELDS },
    );
    snapshots.forEach((snapshot) => {
      if (snapshot.exists) anchors.set(snapshot.id, snapshot.data() || {});
    });
  }
  return anchors;
}

/** The assignments the profile change moved, read from Firestore. */
function profileMovedAssignmentIds({ db, beforeData, afterData, nowValue = Date.now(), onError = null }) {
  return assignmentsWithChangedWorkload({
    beforeData,
    afterData,
    nowValue,
    onError,
    readAnchors: (ids) => readAssignmentAnchors(db, ids),
    readAssignment: async (id) => {
      const snapshot = await db.doc(`assignments/${id}`).get();
      return snapshot.exists ? snapshot.data() || null : null;
    },
  });
}

/**
 * Does a push that only a profile change asked for still have to go out? Only
 * when Classroom already holds a grade MathMaster pushed (`prior.status` is
 * "synced") and the grade now differs from it. A profile change corrects a grade
 * Classroom has; it never starts a column, retries a failed one, or sends the
 * same number again.
 */
function profileChangeNeedsPush(prior, grade) {
  return prior?.status === "synced" && Number(prior.grade) !== Number(grade);
}

module.exports = {
  assignmentsWithChangedWorkload,
  profileChangeNeedsPush,
  profileMovedAssignmentIds,
  reducedWorkload,
  studentOmittedFor,
  studentRequiredIndices,
};

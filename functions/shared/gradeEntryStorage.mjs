/*
 * WHERE A QUESTION'S RECORD IS STORED: A SUMMARY ON THE STUDENT, THE DETAIL BESIDE IT.
 *
 * Every question a student answers is a record in grades/{studentId}
 * .gradesByAssignment[assignmentId][questionIndex]. One document holds every
 * assignment a student has done, and Firestore caps a document at 1 MiB. On
 * Nov 16, 2026 the largest was at 86% and growing 100-170 KB a week; 14
 * students would reach the cap within two weeks, after which every write to
 * their grades fails (their work waits on the device, but their grades stop).
 * 95% of the bytes were per-question detail: the parts and steps graded, the
 * last response, its readable form, the support flags and the algebra state.
 *
 * So a record is stored in two halves:
 *
 *   grades/{studentId}.gradesByAssignment[a][q]           the SUMMARY: status,
 *       credit, attempts, time, variant, timestamps ... plus `detailRef` and,
 *       when steps earned any, `stepCredit`.
 *   grades/{studentId}/responseDetail/{a}.questions[q]     the DETAIL: the
 *       DETAIL_FIELDS below, plus the same `detailRef`.
 *
 * Both halves are written in one transaction or batch with a fresh detailRef.
 * A reader joins them with mergeQuestionRecord, which attaches the detail ONLY
 * when the two detailRefs match. Whatever else wrote the summary (a record from
 * before the split, which still carries its detail inline, or an older client
 * that resets a question to an empty record) is read exactly as written, and a
 * detail it does not match is never shown.
 *
 * The summary alone is enough to grade: `stepCredit` is the credit the steps
 * earned (calculateStepPartialCredit, the rule every credit function shares),
 * computed when the record is split, so a reader that never loads the detail
 * (the Classroom triggers, the class-wide reports) grades exactly as it would
 * with it. tests/platform/gradeEntryStorage.test.mjs holds that, and a
 * read-only check against every production record held it before release.
 */
import {
  calculateStepPartialCredit,
  getQuestionCardState,
  getQuestionCredit,
  normalizeQuestionRecord,
} from './attemptPolicy.mjs';

export const RESPONSE_DETAIL_COLLECTION = 'responseDetail';

/** The fields of a question record that live in the detail document. */
export const DETAIL_FIELDS = Object.freeze([
  'partGrades',
  'stepGrades',
  'supportUsage',
  'lastResponseKey',
  'questionDetails',
  'algebraState',
  'familyDelivery',
  'familyDeliveryVerification',
  'liveCorrectionHistory',
]);
const DETAIL = new Set(DETAIL_FIELDS);
/** Fields the split adds to a summary; never copied from the record being split. */
const SPLIT_MARKERS = new Set(['detailRef', 'stepCredit']);

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const responseDetailPath = (studentId, assignmentId) => (
  `grades/${String(studentId)}/${RESPONSE_DETAIL_COLLECTION}/${String(assignmentId)}`
);

/** A fresh, unguessable-enough stamp that ties a summary to its detail. */
export const newDetailRef = () => {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return random.replace(/-/g, '').slice(0, 20);
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
};

/** A summary written by the split (it names its detail). */
export const isSplitSummary = (entry) => isPlainObject(entry)
  && typeof entry.detailRef === 'string' && entry.detailRef !== '';

/** Whether a stored record still carries any detail field inline. */
export const hasInlineDetail = (entry) => isPlainObject(entry)
  && DETAIL_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(entry, field));

/**
 * One full question record → { summary, detail }. A record that is not an
 * object (a legacy status string, null) is not split: { summary: record, detail: null }.
 */
export const splitQuestionRecord = (record, { detailRef = newDetailRef() } = {}) => {
  if (!isPlainObject(record)) return { summary: record, detail: null };
  const summary = {};
  const detail = { detailRef };
  for (const [field, value] of Object.entries(record)) {
    if (SPLIT_MARKERS.has(field)) continue;
    if (value === undefined) continue;
    if (DETAIL.has(field)) detail[field] = value;
    else summary[field] = value;
  }
  summary.detailRef = detailRef;
  const stepCredit = calculateStepPartialCredit(record.stepGrades, record.variantIndex ?? 0);
  if (stepCredit > 0) summary.stepCredit = stepCredit;
  return { summary, detail };
};

/**
 * The full record a reader sees. A summary is joined with its detail only when
 * their detailRefs match; anything else is returned as it was stored.
 */
export const mergeQuestionRecord = (summary, detailEntry) => {
  if (!isSplitSummary(summary)) return summary;
  if (!isPlainObject(detailEntry) || detailEntry.detailRef !== summary.detailRef) return { ...summary };
  const merged = { ...summary };
  for (const field of DETAIL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(detailEntry, field)) merged[field] = detailEntry[field];
  }
  return merged;
};

/**
 * A tracker as it reads with no trace of how it is stored: each record without
 * `detailRef` / `stepCredit`. A joined record minus these is the record that
 * was split (checked over every production record), so a fingerprint taken
 * over this is the fingerprint the unsplit record had.
 */
export const trackerWithoutSplitMarkers = (tracker) => {
  if (!isPlainObject(tracker)) return tracker;
  const out = {};
  for (const [questionKey, record] of Object.entries(tracker)) {
    if (!isPlainObject(record)) { out[questionKey] = record; continue; }
    const { detailRef: _detailRef, stepCredit: _stepCredit, ...rest } = record;
    out[questionKey] = rest;
  }
  return out;
};

/** A whole assignment's tracker, joined with its detail document's data. */
export const mergeTracker = (tracker, detailDocument) => {
  if (!isPlainObject(tracker)) return tracker;
  const questions = isPlainObject(detailDocument?.questions) ? detailDocument.questions : {};
  const merged = {};
  for (const [questionKey, entry] of Object.entries(tracker)) merged[questionKey] = mergeQuestionRecord(entry, questions[questionKey]);
  return merged;
};

/** Assignment ids whose tracker has any summary that names a detail (so a detail read is needed). */
export const assignmentsWithSplitRecords = (gradeData, onlyAssignmentIds = null) => {
  const byAssignment = isPlainObject(gradeData?.gradesByAssignment) ? gradeData.gradesByAssignment : {};
  const wanted = onlyAssignmentIds ? new Set([...onlyAssignmentIds].map(String)) : null;
  return Object.entries(byAssignment)
    .filter(([assignmentId, tracker]) => (!wanted || wanted.has(assignmentId))
      && isPlainObject(tracker) && Object.values(tracker).some(isSplitSummary))
    .map(([assignmentId]) => assignmentId);
};

/**
 * A grades document with the named assignments' trackers joined to their
 * detail (detailByAssignment: { [assignmentId]: detail document data }). Other
 * assignments, and every other field, are returned untouched.
 */
export const hydrateGradeDocument = (gradeData, detailByAssignment = {}) => {
  if (!isPlainObject(gradeData) || !isPlainObject(gradeData.gradesByAssignment)) return gradeData;
  const ids = Object.keys(detailByAssignment || {});
  if (!ids.length) return gradeData;
  const gradesByAssignment = { ...gradeData.gradesByAssignment };
  for (const assignmentId of ids) {
    if (gradesByAssignment[assignmentId] !== undefined) {
      gradesByAssignment[assignmentId] = mergeTracker(gradesByAssignment[assignmentId], detailByAssignment[assignmentId]);
    }
  }
  return { ...gradeData, gradesByAssignment };
};

/**
 * What a writer stores for one question: the summary for the grades document
 * and the detail entry for responseDetail/{assignmentId}.questions[questionKey].
 */
export const questionRecordWrite = (record, options = {}) => {
  const { summary, detail } = splitQuestionRecord(record, options);
  return { summary, detail };
};

/**
 * A whole tracker split for writing: { summaries, details } keyed by question.
 * A question whose record is not an object keeps it as the summary, with no detail.
 */
export const splitTracker = (tracker, options = {}) => {
  const summaries = {};
  const details = {};
  for (const [questionKey, record] of Object.entries(isPlainObject(tracker) ? tracker : {})) {
    const { summary, detail } = splitQuestionRecord(record, { detailRef: options.detailRefFor?.(questionKey) ?? newDetailRef() });
    summaries[questionKey] = summary;
    if (detail) details[questionKey] = detail;
  }
  return { summaries, details };
};

/** A record still stored whole on the grades document (its detail inline, no detailRef). */
export const isInlineRecord = (record) => hasInlineDetail(record) && !isSplitSummary(record);

/** Whether any record of a grades document is still stored whole (raw document data, not joined). */
export const anyInlineRecords = (gradeData) => {
  const byAssignment = isPlainObject(gradeData?.gradesByAssignment) ? gradeData.gradesByAssignment : {};
  return Object.values(byAssignment).some((tracker) => isPlainObject(tracker) && Object.values(tracker).some(isInlineRecord));
};

const stable = (value) => JSON.stringify(value, (key, item) => (
  isPlainObject(item) ? Object.fromEntries(Object.keys(item).sort().map((name) => [name, item[name]])) : item
));
const withoutMarkers = (record) => {
  if (!isPlainObject(record)) return record;
  const { detailRef: _detailRef, stepCredit: _stepCredit, ...rest } = record;
  return rest;
};

/**
 * Whether a split is faithful for this record: joined back it is the record,
 * and its summary alone grades exactly as the record does (credit, card,
 * normalized attempts and credit). `extraChecks` adds the caller's own grading
 * views ([name, fn] pairs). A record that fails is left stored whole.
 */
export const splitIsFaithful = (record, { summary, detail }, extraChecks = []) => {
  if (stable(withoutMarkers(mergeQuestionRecord(summary, detail))) !== stable(record)) return false;
  const views = [
    (x) => getQuestionCredit(x),
    (x) => stable(getQuestionCardState(x)),
    (x) => { const n = normalizeQuestionRecord(x); return stable([n.status, n.attemptCount, n.totalAttempts, n.partialCredit, n.bestPartialCredit, n.variantIndex, n.timeSpent, n.lastAttemptAt]); },
    ...extraChecks,
  ];
  return views.every((view) => {
    try { return stable(view(summary)) === stable(view(record)); } catch { return false; }
  });
};

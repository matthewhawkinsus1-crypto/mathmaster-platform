// AN IMPORTED GRADEBOOK SNAPSHOT, SAVED WITH ONE STUDENT'S CASE FILE.
//
// grades/{studentId}/sisGradebookSnapshots/{snapshotId} — written only when a
// teacher chooses "Save with this student's case file" after importing a
// gradebook export into the Student Case Review. It holds ONE student's rows
// (sisGradebookImport.js drops every other student before anything is saved),
// the file name and layout, and the teacher's confirmed item matches.
//
// Read-only analysis: nothing here, and nothing that reads it, changes a grade.
// The teacher of record (or the root administrator) creates and reads it;
// students cannot read it; nobody can edit or delete it. A newer import is a
// new document. It leaves with the student when grades/{studentId} is erased.
//
// This builder mirrors firestore.rules `sisGradebookSnapshotValid` field for
// field; tests/rules/caseReviewRules.test.mjs proves the two agree.

export const SIS_SNAPSHOT_SUBCOLLECTION = 'sisGradebookSnapshots';
export const SIS_SNAPSHOT_SCHEMA_VERSION = 1;
export const SIS_SNAPSHOT_LIMITS = Object.freeze({
  items: 300,
  categories: 30,
  confirmedMatches: 300,
  fileName: 160,
  itemName: 120,
  category: 60,
  scoreText: 20,
  dueDate: 20,
  id: 160,
});
export const SIS_SNAPSHOT_LAYOUTS = Object.freeze(['wide', 'long', 'mathmaster-teams']);
export const SIS_SNAPSHOT_MATCHED_BY = Object.freeze(['sis-id', 'mathmaster-id', 'teacher-confirmed-row']);
const SCORE_KINDS = ['number', 'percent', 'points', 'excused', 'missing-mark', 'incomplete-mark', 'blank', 'text'];

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const numberOrNull = (value) => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value));
const textOrNull = (value, max) => clean(value).slice(0, max) || null;

const itemOf = (item) => ({
  name: clean(item?.name).slice(0, SIS_SNAPSHOT_LIMITS.itemName),
  category: textOrNull(item?.category, SIS_SNAPSHOT_LIMITS.category),
  score: numberOrNull(item?.score),
  scoreText: clean(item?.scoreText).slice(0, SIS_SNAPSHOT_LIMITS.scoreText),
  scoreKind: SCORE_KINDS.includes(item?.scoreKind) ? item.scoreKind : 'text',
  pointsPossible: numberOrNull(item?.pointsPossible),
  weight: numberOrNull(item?.weight),
  dueDate: textOrNull(item?.dueDate, SIS_SNAPSHOT_LIMITS.dueDate),
  excused: item?.excused === true,
});

/**
 * The document to save, or the reasons it cannot be saved. `createdByEmail`
 * is the signed-in teacher; the client adds `importedAt: serverTimestamp()`.
 */
export const buildSisSnapshotDocument = ({
  studentId, classId = null, extracted = {}, layout, fileName = '', confirmedMatches = {}, createdByEmail,
} = {}) => {
  const errors = [];
  const email = clean(createdByEmail).toLowerCase();
  const id = clean(studentId).slice(0, SIS_SNAPSHOT_LIMITS.id);
  if (!id) errors.push('A student is required.');
  if (!email) errors.push('The signed-in teacher\'s email is required.');
  if (!SIS_SNAPSHOT_LAYOUTS.includes(layout)) errors.push('Only a recognised gradebook layout can be saved.');
  if (!SIS_SNAPSHOT_MATCHED_BY.includes(extracted?.matchedBy)) errors.push('The student\'s row was not identified in this file.');
  const items = list(extracted?.items).filter((item) => clean(item?.name)).map(itemOf);
  if (!items.length) errors.push('The file has no items for this student.');
  if (items.length > SIS_SNAPSHOT_LIMITS.items) errors.push(`At most ${SIS_SNAPSHOT_LIMITS.items} items can be saved.`);
  const matches = Object.fromEntries(Object.entries(confirmedMatches || {})
    .filter(([name]) => clean(name))
    .slice(0, SIS_SNAPSHOT_LIMITS.confirmedMatches)
    .map(([name, choice]) => [clean(name).slice(0, SIS_SNAPSHOT_LIMITS.itemName), choice?.none
      ? { none: true }
      : { assignmentId: clean(choice?.assignmentId).slice(0, SIS_SNAPSHOT_LIMITS.id), sectionKey: clean(choice?.sectionKey).slice(0, 20) }]));
  const payload = {
    schemaVersion: SIS_SNAPSHOT_SCHEMA_VERSION,
    studentId: id,
    classId: clean(classId) || null,
    fileName: clean(fileName).slice(0, SIS_SNAPSHOT_LIMITS.fileName),
    layout,
    matchedBy: extracted?.matchedBy || null,
    items: items.slice(0, SIS_SNAPSHOT_LIMITS.items),
    categories: list(extracted?.categories).slice(0, SIS_SNAPSHOT_LIMITS.categories).map((category) => ({
      name: clean(category?.name).slice(0, SIS_SNAPSHOT_LIMITS.category), weight: numberOrNull(category?.weight),
    })),
    categoryAverages: list(extracted?.categoryAverages).slice(0, SIS_SNAPSHOT_LIMITS.categories).map((entry) => ({
      name: clean(entry?.name).slice(0, SIS_SNAPSHOT_LIMITS.category), average: numberOrNull(entry?.average),
    })),
    officialAverage: numberOrNull(extracted?.officialAverage),
    confirmedMatches: matches,
    importedByEmail: email,
    authorizedTeacherEmails: [email],
  };
  return { payload, errors };
};

/** A stored snapshot, in the shape the case review reads. */
export const snapshotFromDocument = (id, data = {}, importedAtMs = null) => ({
  id: clean(id),
  source: { fileName: clean(data.fileName), layout: clean(data.layout) },
  importedAtMs,
  importedByEmail: clean(data.importedByEmail) || null,
  matchedBy: data.matchedBy || null,
  items: list(data.items),
  categories: list(data.categories),
  categoryAverages: list(data.categoryAverages),
  officialAverage: numberOrNull(data.officialAverage),
  confirmedMatches: data.confirmedMatches && typeof data.confirmedMatches === 'object' ? data.confirmedMatches : {},
  saved: true,
});

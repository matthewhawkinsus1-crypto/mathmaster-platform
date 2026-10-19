/*
 * EXPORTING GRADES IS REPEATABLE. REMEMBERING AN EXPORT NEVER FORBIDS ANOTHER.
 *
 * Grade Transfer keeps an immutable snapshot of every file it hands a teacher
 * (gradeTransferSnapshots, written by persistGradeTransferSnapshot). The state
 * machine in gradeTransferModel.js uses the snapshots a teacher has CONFIRMED as
 * uploaded as the baseline for "send only what changed" update files — that is
 * the reason the history exists, and it stays exactly as it was.
 *
 * What the old screen got wrong was reading that history as a lock: once a unit
 * was EXPORTED (or UPLOAD_CONFIRMED) its export button was disabled. A teacher
 * whose file was lost, whose SIS rejected the import, who picked the wrong
 * class, or whose student finished late work before the upload was confirmed
 * had no way to produce the file again.
 *
 * This module answers the teacher's questions from the same history without
 * changing it:
 *
 *   - What happened last?   Not exported / Exported <when> / Uploaded <when>
 *   - Did grades move since? "Changed since export" is measured against what was
 *                           last EXPORTED (confirmed or not), so a Tuesday grade
 *                           change after a Monday export is visible even if the
 *                           teacher never pressed "Mark uploaded".
 *   - Can I send it again?  Always, when there are finalized grades:
 *                             * export again  = every current finalized grade
 *                             * download again = the exact bytes of a past file
 *
 * A re-export is a new immutable snapshot like any other. Its identity is a hash
 * of its rows (transferSnapshotId), so re-exporting unchanged grades writes
 * nothing new on the server — the same file simply comes back.
 *
 * Pure: reads units and snapshots, writes nothing.
 */
import { TRANSFER_STATE } from './gradeTransferModel.js';

const text = (value) => String(value ?? '').trim();
const millis = (value) => {
  if (!value) return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

export const EXPORT_STATUS = Object.freeze({
  NOT_DUE: 'notDue',
  READY: 'ready',
  EXPORTED: 'exported',
  UPLOADED: 'uploaded',
  CHANGED: 'changed',
  WAITING_EXTENSION: 'waitingExtension',
  NEEDS_REVIEW: 'needsReview',
  ID_PROBLEM: 'idProblem',
  NOTHING_TO_SEND: 'nothingToSend',
});

/** The transfer files a unit is made of: its sections, or itself. */
export const transferParts = (unit) => (
  Array.isArray(unit?.sectionUnits) && unit.sectionUnits.length ? unit.sectionUnits : [unit].filter(Boolean)
);

/** Every snapshot for exactly this class + assignment + section, newest first. */
export const snapshotsForPart = (part, snapshots = []) => (snapshots || [])
  .filter((snapshot) => snapshot
    && snapshot.classId === part.classId
    && snapshot.assignmentId === part.assignmentId
    && text(snapshot.sectionKey) === text(part.sectionKey))
  .slice()
  .sort((left, right) => (millis(right.createdAt) || 0) - (millis(left.createdAt) || 0));

/**
 * What each student's value was the last time a file carrying them was
 * exported. Chronological, latest wins — an update file only carries changed
 * students, so the exported picture is the running merge of every file.
 */
export const lastExportedRowsByStudent = (history = []) => {
  const byStudent = new Map();
  history.slice().reverse().forEach((snapshot) => {
    (snapshot?.rows || []).forEach((row) => byStudent.set(text(row.studentId), row));
  });
  return byStudent;
};

/** Current finalized rows that differ from what was last exported. */
export const rowsChangedSinceExport = (part, history = []) => {
  if (!history.length) return [];
  const exported = lastExportedRowsByStudent(history);
  return (part?.allRows || []).filter((row) => {
    const previous = exported.get(text(row.studentId));
    return !previous || previous.grade !== row.grade || previous.sisStudentId !== row.sisStudentId;
  });
};

/*
 * A DISTRICT ID CORRECTED AFTER A FILE WENT OUT.
 *
 * A teacher may correct a student's district ID (Student Access, or the
 * district IDs list here) after grades were already exported under the old
 * number — the account was made with a mistyped number, and every file so far
 * carried it. The student's rows are then "changed since export" although no
 * grade moved: the destination did. The teacher needs to know that, because
 * the corrected file is only half of the fix — a grade TEAMS accepted under
 * the old number stays on that record until someone removes it there.
 *
 * Returns [{ studentId, previousSisStudentId, sisStudentId }] for each row of
 * `rows` whose student was last exported (in `history`) under another ID.
 */
export const rowsReidentifiedSince = (rows = [], history = []) => {
  if (!history.length) return [];
  const exported = lastExportedRowsByStudent(history);
  return (rows || []).flatMap((row) => {
    const previous = exported.get(text(row?.studentId));
    const before = text(previous?.sisStudentId);
    return before && before !== text(row?.sisStudentId)
      ? [{ studentId: text(row.studentId), previousSisStudentId: before, sisStudentId: text(row.sisStudentId) }]
      : [];
  });
};

const uniqueReidentified = (entries) => {
  const seen = new Map();
  entries.forEach((entry) => {
    const key = `${entry.studentId}|${entry.previousSisStudentId}|${entry.sisStudentId}`;
    if (!seen.has(key)) seen.set(key, entry);
  });
  return [...seen.values()];
};

/**
 * The rows of the LAST file per part ("Download last file") that carry a
 * district ID the student no longer has. That copy is reproduced byte for
 * byte, so it still says the old number; the teacher is told before relying
 * on it. Compared with the current finalized rows by studentId.
 */
export const lastFileRowsWithOutdatedDistrictId = ({ unit, snapshots = [] } = {}) => uniqueReidentified(
  transferParts(unit).flatMap((part) => {
    const latest = snapshotsForPart(part, snapshots)[0];
    if (!latest) return [];
    const current = new Map((part?.allRows || []).map((row) => [text(row.studentId), text(row.sisStudentId)]));
    return (latest.rows || []).flatMap((row) => {
      const now = current.get(text(row?.studentId));
      return now && now !== text(row?.sisStudentId)
        ? [{ studentId: text(row.studentId), previousSisStudentId: text(row.sisStudentId), sisStudentId: now }]
        : [];
    });
  }),
);

const latestTime = (values) => {
  const numbers = values.map(millis).filter((value) => value !== null);
  return numbers.length ? Math.max(...numbers) : null;
};

/**
 * One unit's export story in teacher language, plus what the teacher can do.
 * `unit` may be a single-file unit or an aggregated lesson with sectionUnits.
 */
export const describeUnitExport = ({ unit, snapshots = [] } = {}) => {
  const parts = transferParts(unit);
  const partHistories = parts.map((part) => ({ part, history: snapshotsForPart(part, snapshots) }));
  const everyHistory = partHistories.flatMap((entry) => entry.history);
  const pendingUploads = partHistories
    .map(({ history }) => history[0])
    .filter((latest) => latest && !latest.uploadConfirmedAt);
  const changedRows = partHistories.flatMap(({ part, history }) => rowsChangedSinceExport(part, history));
  const reidentified = uniqueReidentified(partHistories.flatMap(({ part, history }) => rowsReidentifiedSince(part?.allRows, history)));
  // Changed rows whose GRADE is what it was: only the district ID moved. They
  // are not "grades changed", and the status line must not call them that.
  const idOnlyChangedCount = partHistories.reduce((count, { part, history }) => {
    if (!history.length) return count;
    const exported = lastExportedRowsByStudent(history);
    return count + (part?.allRows || []).filter((row) => {
      const previous = exported.get(text(row.studentId));
      return previous && previous.grade === row.grade && text(previous.sisStudentId) !== text(row.sisStudentId);
    }).length;
  }, 0);
  const fullRowCount = parts.reduce((sum, part) => sum + (part?.allRows?.length || 0), 0);
  const lastExportedAt = latestTime(everyHistory.map((snapshot) => snapshot.createdAt));
  const lastUploadedAt = latestTime(everyHistory.map((snapshot) => snapshot.uploadConfirmedAt));
  const exported = everyHistory.length > 0;
  const state = unit?.state;

  let status;
  if (state === TRANSFER_STATE.ROSTER_ID_PROBLEM) status = EXPORT_STATUS.ID_PROBLEM;
  else if (state === TRANSFER_STATE.REVIEW_REQUIRED) status = EXPORT_STATUS.NEEDS_REVIEW;
  else if (!exported) {
    if (state === TRANSFER_STATE.READY_TO_EXPORT || state === TRANSFER_STATE.UPDATE_REQUIRED) status = EXPORT_STATUS.READY;
    else if (state === TRANSFER_STATE.WAITING_ON_EXTENDED_STUDENTS) status = EXPORT_STATUS.WAITING_EXTENSION;
    else if (state === TRANSFER_STATE.NO_TRANSFER_REQUIRED) status = EXPORT_STATUS.NOTHING_TO_SEND;
    else status = EXPORT_STATUS.NOT_DUE;
  } else if (changedRows.length) status = EXPORT_STATUS.CHANGED;
  else if (!pendingUploads.length) status = EXPORT_STATUS.UPLOADED;
  else status = EXPORT_STATUS.EXPORTED;

  // Blocking problems are the only thing that stops an export: a missing SIS
  // number cannot be written into a file, and a unit with no finalized grade
  // has nothing to write. Having exported before is never one of them.
  const blocked = status === EXPORT_STATUS.ID_PROBLEM || status === EXPORT_STATUS.NEEDS_REVIEW;
  return {
    status,
    exported,
    lastExportedAt,
    lastUploadedAt,
    // One export writes a snapshot per section file (Warm-Up, Classwork, …),
    // so "how many times was this exported" counts packages, not files.
    exportCount: new Set(everyHistory.map((snapshot) => snapshot.packageId || snapshot.transferId || snapshot.id)).size,
    pendingUploads,
    changedCount: changedRows.length,
    // Students whose district ID was corrected after their grade was last
    // exported (each counted once, however many section files carry them).
    reidentified,
    reidentifiedCount: new Set(reidentified.map((entry) => entry.studentId)).size,
    idOnlyChangedCount,
    fullRowCount,
    canExport: !blocked && fullRowCount > 0,
    canExportChanges: !blocked && exported && changedRows.length > 0,
    canDownloadAgain: exported,
    history: everyHistory,
  };
};

const shortDate = (value) => {
  const at = millis(value);
  if (at === null) return '';
  return new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/** The words on the status chip and the line under it. */
export const exportStatusLabel = (summary) => {
  switch (summary?.status) {
    case EXPORT_STATUS.READY: return { label: 'Not exported', tone: 'primary', detail: 'Final grades are ready to export.' };
    case EXPORT_STATUS.EXPORTED: return { label: `Exported ${shortDate(summary.lastExportedAt)}`, tone: 'neutral', detail: 'Not marked uploaded yet. You can export it again at any time.' };
    case EXPORT_STATUS.UPLOADED: return { label: `Uploaded ${shortDate(summary.lastUploadedAt)}`, tone: 'success', detail: 'No grade has changed since the last export.' };
    case EXPORT_STATUS.CHANGED: {
      const since = shortDate(summary.lastExportedAt);
      const corrected = Number(summary.reidentifiedCount) || 0;
      // A row whose only change is its district ID is not a changed grade.
      const gradeChanges = Math.max(0, (Number(summary.changedCount) || 0) - (Number(summary.idOnlyChangedCount) || 0));
      const sentences = [
        gradeChanges ? `${gradeChanges} grade${gradeChanges === 1 ? '' : 's'} changed or newly finalized since ${since}.` : '',
        corrected ? `District ID corrected for ${corrected} student${corrected === 1 ? '' : 's'} since ${gradeChanges ? 'then' : since} — export again so TEAMS gets their grades under the corrected ID.` : '',
      ].filter(Boolean);
      return {
        label: `Changed since export · ${summary.changedCount}`,
        tone: 'warning',
        detail: sentences.join(' ') || `${summary.changedCount} grade${summary.changedCount === 1 ? '' : 's'} changed or newly finalized since ${since}.`,
      };
    }
    case EXPORT_STATUS.WAITING_EXTENSION: return { label: 'Waiting on extensions', tone: 'neutral', detail: 'Students with an active extension are held back until their own deadline.' };
    case EXPORT_STATUS.NEEDS_REVIEW: return { label: 'Needs review', tone: 'danger', detail: 'No finalized grade could be produced yet. Open the grades to check.' };
    case EXPORT_STATUS.ID_PROBLEM: return { label: 'Student ID missing', tone: 'danger', detail: 'Add the district student ID for the students listed, then export.' };
    case EXPORT_STATUS.NOTHING_TO_SEND: return { label: 'Nothing to send', tone: 'neutral', detail: 'Every student is excused for this section.' };
    default: return { label: 'Not due yet', tone: 'neutral', detail: 'Grades finalize after the final (late) deadline.' };
  }
};

/**
 * The package units for "export again": every current finalized grade for
 * every section, flagged as a re-export so the manifest says to overwrite.
 * `exportKind` stays 'initial' — a full file — so an identical re-export hashes
 * to the snapshot that already exists and the server records nothing new.
 */
export const buildFullExportUnits = ({ unit, snapshots = [] } = {}) => transferParts(unit)
  .filter((part) => (part?.allRows || []).length)
  .map((part) => ({
    ...part,
    rows: part.allRows.map((row) => ({ ...row })),
    exportKind: 'initial',
    // Only a part that has been sent before can already be in the SIS.
    reexport: snapshotsForPart(part, snapshots).length > 0,
  }));

/**
 * Package units that reproduce a past file byte-for-byte from its snapshot, for
 * "download again". Nothing is persisted: the file already exists in history.
 */
export const buildSnapshotDownloadUnits = ({ unit, snapshots = [] } = {}) => {
  const byPart = transferParts(unit).map((part) => ({ part, latest: snapshotsForPart(part, snapshots)[0] || null }));
  return byPart
    .filter(({ latest }) => latest && (latest.rows || []).length)
    .map(({ part, latest }) => ({
      ...part,
      rows: latest.rows.map((row) => ({ ...row })),
      withheld: (latest.withheld || []).map((row) => ({ ...row })),
      excused: [],
      exportKind: latest.exportKind === 'delta' ? 'delta' : 'initial',
      reexport: false,
      downloadedFromSnapshot: latest.transferId || latest.id || null,
    }));
};

/**
 * "Only what changed since the last confirmed upload" — the established update
 * file. Only parts whose state machine says UPDATE_REQUIRED contribute, with
 * exactly the delta rows the model computed.
 */
export const buildChangesOnlyUnits = (unit) => transferParts(unit)
  .filter((part) => part?.state === TRANSFER_STATE.UPDATE_REQUIRED && (part.rows || []).length)
  .map((part) => ({ ...part, rows: part.rows.map((row) => ({ ...row })), exportKind: 'delta', reexport: false }));

const unique = (values) => [...new Set(values.filter(Boolean))];
const dedupeStudents = (rows) => {
  const seen = new Map();
  rows.forEach((row) => { if (row?.studentId && !seen.has(row.studentId)) seen.set(row.studentId, row); });
  return [...seen.values()];
};

/**
 * Everything a teacher should see BEFORE a file is made: which classes, which
 * assignments, how many files and grades, who is held back or excused, whether
 * the SIS will be asked to overwrite, and which marking period(s) it covers.
 *
 * `entries` is [{ unit, mode: 'full' | 'changes' }]. `periodFor(unit)` is
 * optional and returns a marking-period label.
 */
export const buildExportPlan = ({ entries = [], snapshots = [], periodFor = null } = {}) => {
  // Each file says which of its students were last exported under another
  // district ID (the MANIFEST prints it; the review step names them).
  const withReidentified = (part) => ({ ...part, reidentified: rowsReidentifiedSince(part.rows, snapshotsForPart(part, snapshots)) });
  const planned = entries.map(({ unit, mode }) => ({
    unit,
    mode: mode === 'changes' ? 'changes' : 'full',
    packageUnits: (mode === 'changes' ? buildChangesOnlyUnits(unit) : buildFullExportUnits({ unit, snapshots })).map(withReidentified),
  }));
  const packageUnits = planned.flatMap((entry) => entry.packageUnits);
  const units = planned.map((entry) => entry.unit);
  return {
    entries: planned,
    packageUnits,
    classLabels: unique(units.map((unit) => text(unit.classLabel))),
    assignmentTitles: unique(units.map((unit) => text(unit.assignmentTitle))),
    periodLabels: periodFor ? unique(units.map((unit) => text(periodFor(unit)))) : [],
    fileCount: packageUnits.length,
    gradeCount: packageUnits.reduce((sum, unit) => sum + unit.rows.length, 0),
    withheld: dedupeStudents(units.flatMap((unit) => unit.withheld || [])),
    excused: dedupeStudents(units.flatMap((unit) => unit.excused || [])),
    overwrite: packageUnits.some((unit) => unit.exportKind === 'delta' || unit.reexport),
    // TEAMS asks "Overwrite existing grades?" per file. A package can mix files
    // already sent (answer YES) with first-time files (answer NO).
    overwriteFileCount: packageUnits.filter((unit) => unit.exportKind === 'delta' || unit.reexport).length,
    reexportCount: planned.filter((entry) => entry.packageUnits.some((unit) => unit.reexport)).length,
    // One entry per student whose district ID was corrected since a file
    // carrying them went out: this package sends them under the new ID.
    reidentified: dedupeStudents(packageUnits.flatMap((unit) => unit.reidentified || [])),
    empty: packageUnits.length === 0,
  };
};

/** Snapshot ids a "mark uploaded" should confirm for the unit. */
export const pendingUploadIds = (summary) => (summary?.pendingUploads || [])
  .map((snapshot) => snapshot.transferId || snapshot.id)
  .filter(Boolean);

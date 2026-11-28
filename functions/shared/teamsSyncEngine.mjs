// MathMaster -> Frontline TEAMS gradebook sync engine (issues #612, #613).
//
// Shared by the browser and the Cloud Functions backend (teamsSyncServer.mjs),
// so the server that plans a sync and the tests that prove it run the same
// code. Pure: no Firestore, no network, no clock except what is passed in.
//
// A deterministic reconciler that runs without AI. Each step:
//
//   1. reads the TEAMS gradebook back (persisted values, never a "saved" toast:
//      the earlier browser pilot saw a save indication followed by a blank
//      cell on reopening),
//   2. plans the smallest set of operations that moves TEAMS toward what
//      MathMaster's final grades say, without touching anything a teacher
//      owns, and
//   3. applies them through an adapter, then reads back again.
//
// The adapter is the only part that knows how TEAMS is reached:
// `readGradebook`, `createColumn`, `setColumnWeight`, `importScores` (the
// two-column file TEAMS's own per-assignment Import takes, exactly what Grade
// Transfer already ships), `setColumnDates`, `deleteColumn` and optionally
// `clearScores`. The teacher's Chrome
// extension (route E), a vendor API, and the test gradebook in
// tests/platform/helpers/teamsTestGradebook.mjs all implement that one shape.
//
// One MathMaster class can be several TEAMS sections: DeSoto keeps inclusion
// students in their own TEAMS section (two 5th periods, two 8th periods)
// while MathMaster has one class. A target lists every section it is linked
// to, and each student goes to the one section TEAMS has them in on the due
// date (routeTeamsTargets). Each section gets its own column and its own
// ledger entry, keyed `${target.key}@${sectionRef}`.
//
// What is kept (the ledger) is deliberately small: the column a lesson
// section maps to, whether its weight has been switched from provisional to
// counted, and per cell the value MathMaster last wrote and whether a
// read-back has confirmed it. That last part is what lets a re-run tell
// "MathMaster's own value, safe to correct" from "a teacher typed this, leave
// it". Nothing else in the gradebook is mirrored: a read-back is cheap and
// always newer than a copy.

import { teamsImportCsv } from './teamsImportFile.mjs';

export const PROVISIONAL_MODE = Object.freeze({
  // A column MathMaster created is posted at assignment weight 0 while the
  // lesson is open, then switched to its normal weight once, on closure.
  // In TEAMS the per-assignment weight is the "#Count" field (default 1).
  // DeSoto's TEAMS accepts #Count 0 when an assignment is created (observed
  // 2026-11-26), and the teacher confirms a #Count-0 grade is not factored
  // into the average. A tenant where either fails uses NONE.
  ASSIGNMENT_WEIGHT_ZERO: 'assignment-weight-zero',
  // The closest workable behaviour when the tenant cannot hold a score at
  // zero weight: the column (with dates) appears right away, scores arrive
  // on closure, and provisional scores stay visible in MathMaster only.
  NONE: 'none',
});

export const TEAMS_CELL_STATUS = Object.freeze({
  QUEUED: 'queued', // planned, not yet acknowledged by TEAMS
  DELIVERED: 'delivered', // TEAMS acknowledged it, a read-back has not shown it yet
  VERIFIED: 'verified', // a read-back shows the intended value
  PRESERVED: 'preserved', // TEAMS holds a teacher's value or code; MathMaster left it
  HELD: 'held', // nothing to send yet (lesson open, extension, reopened)
  EXCUSED: 'excused', // no numeric row by design (Practice Pass, not required)
  BLOCKED: 'blocked', // cannot be written (not on the TEAMS roster for that date)
});

export const TEAMS_EXCEPTION = Object.freeze({
  CLASS_NOT_MAPPED: 'CLASS_NOT_MAPPED',
  NO_MARKING_PERIOD: 'NO_MARKING_PERIOD',
  MARKING_PERIOD_LOCKED: 'MARKING_PERIOD_LOCKED',
  MAPPED_COLUMN_MISSING: 'MAPPED_COLUMN_MISSING',
  AMBIGUOUS_COLUMN: 'AMBIGUOUS_COLUMN',
  CATEGORY_MISMATCH: 'CATEGORY_MISMATCH',
  NOT_ENROLLED: 'NOT_ENROLLED',
  ENROLLED_IN_SEVERAL: 'ENROLLED_IN_SEVERAL',
  MANUAL_GRADE_DIFFERS: 'MANUAL_GRADE_DIFFERS',
  TEACHER_OVERRIDE: 'TEACHER_OVERRIDE',
  TEACHER_CLEARED: 'TEACHER_CLEARED',
  SAVE_NOT_PERSISTING: 'SAVE_NOT_PERSISTING',
  PROVISIONAL_WEIGHT_NOT_ZERO: 'PROVISIONAL_WEIGHT_NOT_ZERO',
  REOPENED_AFTER_COUNTED: 'REOPENED_AFTER_COUNTED',
  COUNT_HELD_FOR_FINAL_GRADE: 'COUNT_HELD_FOR_FINAL_GRADE',
  DUE_DATE_OTHER_PERIOD: 'DUE_DATE_OTHER_PERIOD',
  DATES_NOT_PERSISTING: 'DATES_NOT_PERSISTING',
  REMOVAL_NEEDS_CONFIRMATION: 'REMOVAL_NEEDS_CONFIRMATION',
  REMOVAL_LEFT_TEACHER_COLUMN: 'REMOVAL_LEFT_TEACHER_COLUMN',
  REMOVAL_NOT_PERSISTING: 'REMOVAL_NOT_PERSISTING',
});

const EXCEPTION_MESSAGES = Object.freeze({
  CLASS_NOT_MAPPED: 'This class is not linked to a TEAMS section yet.',
  NO_MARKING_PERIOD: 'No TEAMS marking period contains the due date.',
  MARKING_PERIOD_LOCKED: 'The TEAMS marking period is closed to changes.',
  MAPPED_COLUMN_MISSING: 'The TEAMS assignment MathMaster used is gone. It was not recreated. Confirm before a new one is made.',
  AMBIGUOUS_COLUMN: 'More than one TEAMS assignment has this name, so MathMaster cannot tell which to use.',
  CATEGORY_MISMATCH: 'The matching TEAMS assignment is in a different category. It was left as the teacher set it.',
  NOT_ENROLLED: 'The district ID is not on this TEAMS section for the due date.',
  ENROLLED_IN_SEVERAL: 'The district ID is on more than one of this class\'s TEAMS sections for the due date, so MathMaster cannot tell which one holds the grade.',
  MANUAL_GRADE_DIFFERS: 'TEAMS already holds a different grade that MathMaster did not write. It was kept.',
  TEACHER_OVERRIDE: 'A teacher changed the grade in TEAMS after MathMaster wrote it. The newer MathMaster grade was not applied.',
  TEACHER_CLEARED: 'A grade MathMaster had confirmed in TEAMS was cleared there. It was not re-entered.',
  SAVE_NOT_PERSISTING: 'TEAMS accepted this grade several times, but it is still blank when read back.',
  PROVISIONAL_WEIGHT_NOT_ZERO: 'The provisional TEAMS assignment no longer has #Count 0, so open-lesson scores were not posted.',
  REOPENED_AFTER_COUNTED: 'The lesson reopened after its grades started counting. Scores in TEAMS stay as posted until it closes again.',
  COUNT_HELD_FOR_FINAL_GRADE: 'This student has no final grade yet, and their provisional score is still in TEAMS, so #Count stays 0 for this assignment. It switches by itself once their final grade replaces that score, or once you clear that cell in TEAMS.',
  DUE_DATE_OTHER_PERIOD: 'The new due date is in a different TEAMS marking period, so the TEAMS assignment was not moved. Change its dates in TEAMS, or move the due date back into its marking period.',
  DATES_NOT_PERSISTING: 'TEAMS was given the new dates several times, but the old ones still show when read back.',
  REMOVAL_NEEDS_CONFIRMATION: 'This TEAMS assignment has grades in it. Confirm in Grade Export before MathMaster removes it from TEAMS.',
  REMOVAL_LEFT_TEACHER_COLUMN: 'This TEAMS assignment was made in TEAMS, not by MathMaster, so it was left there. MathMaster no longer sends grades to it.',
  REMOVAL_NOT_PERSISTING: 'MathMaster asked for this TEAMS assignment to be removed several times, but it is still in TEAMS.',
});

const DEFAULT_MAX_ATTEMPTS = 3;
const text = (value) => String(value ?? '').trim();
const isBlank = (value) => value === null || value === undefined || text(value) === '';
const asScore = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = text(value);
  return /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : null;
};
// A non-blank, non-numeric TEAMS value is a code the teacher chose (exempt,
// missing, incomplete...). Codes are never overwritten.
const isCode = (value) => !isBlank(value) && asScore(value) === null;
// Observed on DeSoto's TEAMS (2026-11-26): the assignment-name editor stops
// taking input at 64 characters and stores at most 64. A longer name would be
// cut by TEAMS, stop matching its own column and get duplicated on the next
// run, so names are fitted here. A cut name keeps its section label and gains
// a short hash of the full name, so two long lesson titles that share their
// first 50 characters still get different columns.
export const TEAMS_ASSIGNMENT_NAME_MAX = 64;
const shortHash = (value) => {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36).padStart(4, '0').slice(-4);
};
export const teamsAssignmentName = (title, label = '') => {
  const cleanTitle = text(title).replace(/\s+/g, ' ');
  const cleanLabel = text(label).replace(/\s+/g, ' ');
  const full = cleanLabel ? `${cleanTitle} - ${cleanLabel}` : cleanTitle;
  if (full.length <= TEAMS_ASSIGNMENT_NAME_MAX) return full;
  const suffix = ` ~${shortHash(full)}${cleanLabel ? ` - ${cleanLabel}` : ''}`;
  return `${cleanTitle.slice(0, Math.max(0, TEAMS_ASSIGNMENT_NAME_MAX - suffix.length)).trimEnd()}${suffix}`.slice(0, TEAMS_ASSIGNMENT_NAME_MAX);
};

const sameName = (left, right) => text(left).toLowerCase().replace(/\s+/g, ' ') === text(right).toLowerCase().replace(/\s+/g, ' ');

/**
 * The Import file that clears cells: one "id," row (blank grade) per student,
 * imported with "Overwrite existing grades?" Yes. Only ever built for cells
 * MathMaster owns and has just read back unchanged.
 */
export const teamsClearCsv = (sisStudentIds = []) => {
  const ids = (sisStudentIds || []).map(text);
  if (ids.some((id) => !/^\d+$/.test(id))) throw new Error('Invalid TEAMS clear row.');
  return ids.map((id) => `${id},`).join('\r\n') + (ids.length ? '\r\n' : '');
};

/**
 * What DeSoto ISD's TEAMS supports, as observed on one live test assignment
 * (2026-11-26) and confirmed by the teacher (2026-11-27):
 * - #Count 0 is accepted at creation; the score shows to students and
 *   parents but is not factored into the average.
 * - No clear through the Import. The teacher expected a blank grade with
 *   Overwrite Yes to clear a cell, but on a live test assignment (2026-11-27,
 *   an empty cell) TEAMS refused the line: "Error finding student Id/Grade in
 *   the File for line number: 1", "Total number of grades added: 0". So a
 *   provisional score with no final grade cannot be cleared: the #Count
 *   switch waits for it (COUNT_HELD_FOR_FINAL_GRADE, the owner's decision of
 *   2026-11-27), so a provisional score never counts.
 */
export const DESOTO_TEAMS_CAPABILITIES = Object.freeze({
  provisional: 'assignment-weight-zero',
  canClearCells: false,
});

/** A calendar date in the district's zone. TEAMS dates are days, not instants. */
export const teamsDay = (value, timeZone = 'America/Chicago') => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const millis = typeof value?.toMillis === 'function' ? value.toMillis() : new Date(value).getTime();
  if (!Number.isFinite(millis)) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(millis));
};

/*
 * Does this read-back show the marking period a ledger entry's column is in?
 * The extension reads the marking period TEAMS has open, so a column in
 * another period is simply not in it: that is "not read", never "gone". The
 * period is the one recorded for the column, else the due date's.
 */
const showsPeriodOf = (gradebook, entry = {}, dueDate = '') => {
  const periods = gradebook?.markingPeriods || [];
  const id = text(entry.markingPeriod || entry.pendingDelete?.markingPeriod);
  if (id) return periods.some((period) => period.id === id);
  const due = text(dueDate);
  return Boolean(due) && periods.some((period) => period.start <= due && due <= period.end);
};

const enrolledOn = (gradebook, sisStudentId, date) => (gradebook.roster || []).some((entry) => (
  text(entry.sisStudentId) === text(sisStudentId)
  && (!entry.enteredOn || entry.enteredOn <= date)
  && (!entry.leftOn || entry.leftOn >= date)
));

/**
 * The plan for one lesson section in one class. Pure: the same target,
 * ledger entry and read-back always give the same operations, so a retry
 * or an overlapping nightly run cannot do anything a first run would not.
 */
export const planTeamsTarget = ({ target, ledgerEntry = {}, gradebook, capabilities = {}, claimedColumnIds = new Set() }) => {
  const mode = capabilities.provisional === PROVISIONAL_MODE.ASSIGNMENT_WEIGHT_ZERO
    ? PROVISIONAL_MODE.ASSIGNMENT_WEIGHT_ZERO
    : PROVISIONAL_MODE.NONE;
  const maxAttempts = capabilities.maxAttempts || DEFAULT_MAX_ATTEMPTS;
  const countedWeight = target.countedWeight ?? 1;
  // A lesson section removed from TEAMS and then sent again starts afresh:
  // its old column is gone, so nothing of the old entry applies.
  const entry = ledgerEntry?.removed && !(target.removal && typeof target.removal === 'object') ? {} : (ledgerEntry || {});
  const result = {
    key: target.key, columnId: null, columnSource: null, markingPeriod: null,
    weight: null, ops: [], cells: [], exceptions: [],
  };
  const exception = (code, detail = {}) => result.exceptions.push({ key: target.key, code, message: EXCEPTION_MESSAGES[code], ...detail });
  const removal = target.removal && typeof target.removal === 'object' ? target.removal : null;
  const cell = (row, status, detail = '') => result.cells.push({
    studentId: row.studentId || '', sisStudentId: text(row.sisStudentId), status, detail,
  });
  const holdAll = (detail) => (target.rows || []).forEach((row) => cell(row, TEAMS_CELL_STATUS.HELD, detail));

  if (!gradebook) { exception(TEAMS_EXCEPTION.CLASS_NOT_MAPPED); holdAll('Class not linked to TEAMS'); return result; }

  // REMOVED FROM TEAMS (the teacher's "Remove from TEAMS" in Grade Export).
  // Only a column MathMaster created is deleted, and one that holds grades
  // only once the teacher has confirmed at least that many. A teacher's own
  // column is left in TEAMS and no longer written to. Nothing is ever
  // created for a removed lesson section.
  if (removal) {
    // `removal`: where the removal stands, for Grade Export's list.
    result.removal = { state: 'removed' };
    if (entry.removed) {
      result.removal = { state: entry.leftColumnId ? 'left' : 'removed', ...(entry.removedGradeCount ? { gradeCount: entry.removedGradeCount } : {}) };
      holdAll(entry.leftColumnId ? 'Removed from TEAMS (left in TEAMS)' : 'Removed from TEAMS');
      return result;
    }
    const mapped = entry.columnId ? (gradebook.columns || []).find((item) => item.id === entry.columnId) || null : null;
    const pendingName = entry.pendingColumn ? teamsAssignmentName(target.name) : '';
    const landed = !entry.columnId && pendingName
      ? (gradebook.columns || []).filter((item) => !claimedColumnIds.has(item.id) && sameName(item.name, pendingName))
      : [];
    if (landed.length > 1) { exception(TEAMS_EXCEPTION.AMBIGUOUS_COLUMN, { columnIds: landed.map((item) => item.id) }); holdAll('Ambiguous TEAMS assignment'); return result; }
    const column = mapped || landed[0] || null;
    const created = column && (mapped ? entry.created === true : true);
    if (!column && (entry.columnId || entry.pendingDelete) && !showsPeriodOf(gradebook, entry, target.dueDate)) {
      // TEAMS has another marking period open: the column was not read, so
      // nothing is known about it yet. Open its marking period in TEAMS.
      result.removal = { state: 'otherPeriod' };
      holdAll('TEAMS shows another marking period');
      return result;
    }
    if (!column) {
      if (entry.pendingColumn) result.removal = { state: 'removing' };
      holdAll('Removed from TEAMS');
      return result;
    }
    result.columnId = column.id;
    result.columnSource = created ? 'created' : 'matched';
    if (!created) {
      result.removal = { state: 'left' };
      exception(TEAMS_EXCEPTION.REMOVAL_LEFT_TEACHER_COLUMN, { columnId: column.id });
      holdAll('Removed from TEAMS (left in TEAMS)');
      return result;
    }
    const values = gradebook.cells?.[column.id] || {};
    const gradeCount = Object.values(values).filter((value) => !isBlank(value)).length;
    const confirmed = Number.isInteger(removal.confirmedGradeCount) ? removal.confirmedGradeCount : 0;
    if (gradeCount > confirmed) {
      result.removal = { state: 'confirm', gradeCount };
      exception(TEAMS_EXCEPTION.REMOVAL_NEEDS_CONFIRMATION, { columnId: column.id, gradeCount });
      holdAll('Waiting for you to confirm removing it from TEAMS');
      return result;
    }
    if ((entry.pendingDelete?.attempts || 0) >= maxAttempts) {
      result.removal = { state: 'stuck', gradeCount };
      exception(TEAMS_EXCEPTION.REMOVAL_NOT_PERSISTING, { columnId: column.id, attempts: entry.pendingDelete.attempts });
      holdAll('Removal not taking in TEAMS');
      return result;
    }
    result.ops.push({
      type: 'deleteColumn', key: target.key, sectionRef: target.teamsSectionRef, columnId: column.id,
      name: column.name, dueDate: column.dueDate || '', markingPeriod: column.markingPeriod || '', gradeCount,
    });
    result.removal = { state: 'removing', gradeCount };
    holdAll('Being removed from TEAMS');
    return result;
  }

  const columnName = teamsAssignmentName(target.name);
  const dueDate = text(target.dueDate);
  const periods = gradebook.markingPeriods || [];
  const period = target.markingPeriod
    ? periods.find((item) => item.id === target.markingPeriod)
    : periods.find((item) => item.start <= dueDate && dueDate <= item.end);
  if (!period) { exception(TEAMS_EXCEPTION.NO_MARKING_PERIOD, { dueDate }); holdAll('No marking period'); return result; }
  result.markingPeriod = period.id;
  if (period.locked) { exception(TEAMS_EXCEPTION.MARKING_PERIOD_LOCKED, { markingPeriod: period.id }); holdAll('Marking period closed'); return result; }

  // Column: the mapped one, else a single same-named column in this marking
  // period. A same-named column found after MathMaster tried to create one
  // is that attempt landing (a lost response), not a teacher's column.
  let column = null;
  if (entry.columnId) {
    column = (gradebook.columns || []).find((item) => item.id === entry.columnId) || null;
    if (!column) { exception(TEAMS_EXCEPTION.MAPPED_COLUMN_MISSING, { columnId: entry.columnId }); holdAll('TEAMS assignment missing'); return result; }
    result.columnSource = entry.created ? 'created' : 'matched';
  } else {
    // A column another lesson section already maps to is never matched by
    // name, even when the names collide.
    const named = (gradebook.columns || []).filter((item) => item.markingPeriod === period.id
      && !claimedColumnIds.has(item.id)
      && sameName(item.name, columnName));
    if (named.length > 1) {
      exception(TEAMS_EXCEPTION.AMBIGUOUS_COLUMN, { columnIds: named.map((item) => item.id) });
      holdAll('Ambiguous TEAMS assignment');
      return result;
    }
    if (named.length === 1) {
      column = named[0];
      result.columnSource = entry.pendingColumn ? 'created' : 'matched';
    }
  }

  if (!column) {
    // Provisional mode creates at weight 0 even on closure, so the final
    // scores land before anything counts and the switch happens once.
    const weight = mode === PROVISIONAL_MODE.ASSIGNMENT_WEIGHT_ZERO ? 0 : countedWeight;
    result.ops.push({
      type: 'createColumn', key: target.key, sectionRef: target.teamsSectionRef,
      spec: {
        name: columnName, category: target.category, markingPeriod: period.id,
        // TEAMS needs both dates inside the marking period (teacher, 2026-11-27).
        // The period is chosen by due date; a lesson assigned in the previous
        // period starts on this period's first day.
        assignedDate: [text(target.assignedDate) || dueDate, period.start].filter(Boolean).sort().pop(),
        dueDate, weight, maxScore: 100,
      },
    });
    (target.rows || []).forEach((row) => cell(row, TEAMS_CELL_STATUS.QUEUED, 'Waiting for the TEAMS assignment'));
    return result;
  }

  result.columnId = column.id;
  result.weight = Number(column.weight);
  if (column.category && target.category && column.category !== target.category) {
    exception(TEAMS_EXCEPTION.CATEGORY_MISMATCH, { teamsCategory: column.category, intended: target.category });
  }

  // DATES. A column MathMaster created follows the lesson's due date (the
  // teacher's Dates & Classes). The assign date stays as it is unless it would
  // fall after the new due date. TEAMS needs both inside the column's marking
  // period, so a due date moved into another period is reported, never moved.
  // A teacher's own column keeps the dates the teacher gave it.
  if (result.columnSource === 'created' && column.dueDate && dueDate) {
    if (column.markingPeriod && column.markingPeriod !== period.id) {
      exception(TEAMS_EXCEPTION.DUE_DATE_OTHER_PERIOD, { columnId: column.id, teamsDueDate: column.dueDate, dueDate, markingPeriod: column.markingPeriod });
    } else {
      const columnAssigned = text(column.assignedDate);
      const assignedDate = columnAssigned && columnAssigned <= dueDate && (!period.start || columnAssigned >= period.start)
        ? columnAssigned
        : [[text(target.assignedDate) || dueDate, dueDate].sort()[0], period.start].filter(Boolean).sort().pop();
      if (column.dueDate !== dueDate || columnAssigned !== assignedDate) {
        const pendingDates = entry.pendingDates;
        if (pendingDates && pendingDates.dueDate === dueDate && pendingDates.assignedDate === assignedDate && (pendingDates.attempts || 0) >= maxAttempts) {
          exception(TEAMS_EXCEPTION.DATES_NOT_PERSISTING, { columnId: column.id, teamsDueDate: column.dueDate, dueDate, attempts: pendingDates.attempts });
        } else {
          result.ops.push({
            type: 'setColumnDates', key: target.key, sectionRef: target.teamsSectionRef, columnId: column.id,
            from: { assignedDate: columnAssigned, dueDate: column.dueDate }, assignedDate, dueDate,
          });
        }
      }
    }
  }

  // Weight is managed only on a column MathMaster created. A teacher's own
  // column, once matched, keeps the weight the teacher gave it, and only
  // final scores go into it.
  const manageWeight = result.columnSource === 'created' && mode === PROVISIONAL_MODE.ASSIGNMENT_WEIGHT_ZERO;
  const counted = entry.weightState === 'counted' || Number(column.weight) !== 0;
  let posting = Boolean(target.closed);
  if (!target.closed) {
    if (!manageWeight) {
      holdAll(mode === PROVISIONAL_MODE.NONE
        ? 'Posts on closure (provisional grades are off for this district)'
        : 'Posts on closure (existing teacher assignment)');
    } else if (counted) {
      exception(entry.weightState === 'counted' ? TEAMS_EXCEPTION.REOPENED_AFTER_COUNTED : TEAMS_EXCEPTION.PROVISIONAL_WEIGHT_NOT_ZERO, { weight: Number(column.weight) });
      holdAll('Open lesson, assignment already counts');
    } else {
      posting = true;
    }
  }

  const current = gradebook.cells?.[column.id] || {};
  const ledgerCells = entry.cells || {};
  const fresh = [];
  const corrections = [];
  const clears = [];

  if (posting) {
    for (const row of target.rows || []) {
      const sis = text(row.sisStudentId);
      const desired = row.grade;
      const value = current[sis];
      const mine = ledgerCells[sis];
      if (!enrolledOn(gradebook, sis, dueDate)) {
        exception(TEAMS_EXCEPTION.NOT_ENROLLED, { studentId: row.studentId, sisStudentId: sis, dueDate });
        cell(row, TEAMS_CELL_STATUS.BLOCKED, 'Not on the TEAMS section for the due date');
        continue;
      }
      if (isCode(value)) { cell(row, TEAMS_CELL_STATUS.PRESERVED, `TEAMS code ${text(value)} kept`); continue; }
      const score = asScore(value);
      const pending = mine?.pending || null;
      const ownedValues = [mine?.value, pending?.value].filter((item) => item !== undefined && item !== null);

      if (score === null) {
        // Blank. A grade MathMaster wrote and a read-back confirmed, now
        // blank, was cleared by someone. A grade that never showed up is a
        // save that did not persist: send again, a bounded number of times.
        if (mine && mine.verifiedAt && !pending) {
          exception(TEAMS_EXCEPTION.TEACHER_CLEARED, { studentId: row.studentId, sisStudentId: sis, mathmaster: desired });
          cell(row, TEAMS_CELL_STATUS.PRESERVED, 'Cleared in TEAMS');
          continue;
        }
        if (pending && pending.value === desired && (pending.attempts || 0) >= maxAttempts) {
          exception(TEAMS_EXCEPTION.SAVE_NOT_PERSISTING, { studentId: row.studentId, sisStudentId: sis, attempts: pending.attempts });
          cell(row, TEAMS_CELL_STATUS.DELIVERED, 'Accepted but not persisting');
          continue;
        }
        fresh.push({ sisStudentId: sis, grade: desired });
        cell(row, TEAMS_CELL_STATUS.QUEUED, pending ? 'Retrying: not yet in TEAMS' : 'New grade');
        continue;
      }

      if (ownedValues.includes(score)) {
        if (score === desired) {
          const confirmed = mine?.verifiedAt && mine.value === desired && !pending;
          cell(row, confirmed ? TEAMS_CELL_STATUS.VERIFIED : TEAMS_CELL_STATUS.DELIVERED, confirmed ? '' : 'Awaiting read-back');
        } else {
          corrections.push({ sisStudentId: sis, grade: desired });
          cell(row, TEAMS_CELL_STATUS.QUEUED, `Correction ${score} → ${desired}`);
        }
        continue;
      }

      // A number MathMaster did not write.
      if (score === desired) {
        cell(row, TEAMS_CELL_STATUS.VERIFIED, mine ? 'Teacher entered the same grade' : 'Already in TEAMS (entered by a teacher)');
        continue;
      }
      exception(mine ? TEAMS_EXCEPTION.TEACHER_OVERRIDE : TEAMS_EXCEPTION.MANUAL_GRADE_DIFFERS, {
        studentId: row.studentId, sisStudentId: sis, teams: score, mathmaster: desired,
      });
      cell(row, TEAMS_CELL_STATUS.PRESERVED, `TEAMS keeps ${score}; MathMaster has ${desired}`);
    }
  }

  // Students with nothing final to send: withheld (extension, reopened),
  // excused, unresolved (Recovery held, needs review), or anyone else whose
  // provisional value is still in TEAMS (for example a student who left the
  // class). That value must not quietly count after closure. It is cleared
  // where the route can, and stays a reported exception where it cannot.
  // Every provisional value in the ledger is checked, not only the listed
  // students, so a list the caller forgot cannot leak one into the average.
  // Only values written while the lesson was open are provisional; a final
  // grade posted before a student was reopened is left as it was.
  const stillProvisional = manageWeight && !counted;
  const provisionalValue = (mine) => {
    if (mine?.pending) return mine.pending.provisional ? mine.pending.value : null;
    return mine?.provisional ? mine.value : null;
  };
  const finalIds = new Set((target.rows || []).map((row) => text(row.sisStudentId)));
  const listed = new Map();
  const listAs = (rows, status, fallback) => (rows || []).forEach((row) => {
    const sis = text(row.sisStudentId);
    const key = sis || `student:${row.studentId}`;
    if (!finalIds.has(sis) && !listed.has(key)) listed.set(key, { row, status, detail: row.reason || fallback });
  });
  listAs(target.withheld, TEAMS_CELL_STATUS.HELD, 'Not final yet');
  listAs(target.excused, TEAMS_CELL_STATUS.EXCUSED, 'Excused');
  listAs(target.unresolved, TEAMS_CELL_STATUS.HELD, 'Needs teacher review');
  if (target.closed && manageWeight) {
    Object.keys(ledgerCells).forEach((sis) => {
      if (!finalIds.has(sis) && !listed.has(sis)) listed.set(sis, { row: { sisStudentId: sis }, status: TEAMS_CELL_STATUS.HELD, detail: 'No final grade to send', unlisted: true });
    });
  }
  // A provisional score still in TEAMS for a student with no final grade
  // would count the moment #Count switches. Where it cannot be cleared, the
  // switch waits (the owner, 2026-11-27): for the final grade to replace it,
  // or for a teacher to clear the cell.
  let holdCount = false;
  for (const { row, status, detail, unlisted } of listed.values()) {
    const sis = text(row.sisStudentId);
    const mine = sis ? ledgerCells[sis] : null;
    const score = asScore(current[sis]);
    const ownsProvisional = target.closed && manageWeight && score !== null && provisionalValue(mine) === score;
    if (unlisted && !ownsProvisional) continue;
    if (ownsProvisional && capabilities.canClearCells) {
      clears.push(sis);
      cell(row, TEAMS_CELL_STATUS.QUEUED, `${detail}; clearing provisional ${score}`);
    } else if (ownsProvisional) {
      holdCount = true;
      exception(TEAMS_EXCEPTION.COUNT_HELD_FOR_FINAL_GRADE, { studentId: row.studentId, sisStudentId: sis, teams: score });
      cell(row, status, `${detail}; provisional ${score} remains, so #Count stays 0`);
    } else {
      cell(row, status, detail);
    }
  }

  // Two files, never one: new grades go in with "Overwrite existing grades?"
  // NO, so a grade a teacher typed between read-back and upload survives. Only
  // cells MathMaster owns go in the overwriting file.
  const provisional = !target.closed;
  if (fresh.length) result.ops.push({ type: 'importScores', key: target.key, columnId: column.id, overwrite: false, provisional, rows: fresh });
  if (corrections.length) result.ops.push({ type: 'importScores', key: target.key, columnId: column.id, overwrite: true, provisional, rows: corrections });
  if (clears.length) result.ops.push({ type: 'clearScores', key: target.key, columnId: column.id, sisStudentIds: clears });

  // The one weight change: only on closure, only once every final score is
  // confirmed and every provisional leftover is resolved (cleared, replaced
  // by a final grade, or cleared by a teacher), and never again once the
  // ledger records it as counted.
  const unsettled = result.cells.some((item) => item.status === TEAMS_CELL_STATUS.QUEUED || item.status === TEAMS_CELL_STATUS.DELIVERED);
  if (target.closed && stillProvisional && !result.ops.length && !unsettled && !holdCount) {
    result.ops.push({ type: 'setWeight', key: target.key, columnId: column.id, weight: countedWeight });
  }
  return result;
};

// Fold a read-back into the ledger: pending writes that now show are
// verified, a weight switch that shows is recorded as done.
const reconcileEntry = ({ entry, plan, gradebook, at, target }) => {
  // A removal that shows: the column MathMaster asked to delete is gone.
  // Only a read-back of the column's own marking period can show it gone.
  if (target?.removal && !entry.removed && !showsPeriodOf(gradebook, entry, target.dueDate) && (entry.columnId || entry.pendingDelete)) return entry;
  if (target?.removal && entry.pendingDelete) {
    const gone = !(gradebook.columns || []).some((item) => item.id === entry.pendingDelete.columnId);
    if (gone) return { removed: true, removedAt: at, removedColumnId: entry.pendingDelete.columnId, removedGradeCount: entry.pendingDelete.gradeCount ?? 0 };
  }
  if (target?.removal && !plan.columnId && !entry.removed && !entry.pendingColumn) {
    // Never in TEAMS (or a teacher's column, left there): nothing to delete.
    return { ...entry, removed: true, removedAt: at };
  }
  if (target?.removal && plan.columnSource === 'matched') {
    return { removed: true, removedAt: at, leftColumnId: plan.columnId };
  }
  if (!plan.columnId || target?.removal) return entry;
  const next = { ...entry, cells: { ...entry.cells } };
  if (!next.columnId) {
    next.columnId = plan.columnId;
    next.created = plan.columnSource === 'created';
  }
  delete next.pendingColumn;
  const column = (gradebook.columns || []).find((item) => item.id === plan.columnId);
  // The column's marking period, so a later read of another period is not
  // taken for the column being gone (Remove from TEAMS).
  if (column?.markingPeriod) next.markingPeriod = column.markingPeriod;
  if (next.pendingDates && column && column.dueDate === next.pendingDates.dueDate && text(column.assignedDate) === next.pendingDates.assignedDate) {
    delete next.pendingDates;
  }
  const current = gradebook.cells?.[plan.columnId] || {};
  for (const [sis, value] of Object.entries(next.cells)) {
    const score = asScore(current[sis]);
    if (value.pendingClear) {
      if (isBlank(current[sis])) delete next.cells[sis];
      continue;
    }
    if (value.pending && score === value.pending.value) {
      next.cells[sis] = { value: value.pending.value, verifiedAt: at, provisional: value.pending.provisional === true };
    } else if (!value.pending && value.value !== undefined && score === value.value && !value.verifiedAt) {
      next.cells[sis] = { ...value, verifiedAt: at };
    }
  }
  // On closure, a provisional value that already equals the student's final
  // grade, and still reads back unchanged, is that final grade. It needs no
  // new write, but it must stop being provisional, or reopening the student
  // later would clear a counted final grade as a leftover.
  if (target?.closed) {
    (target.rows || []).forEach((row) => {
      const sis = text(row.sisStudentId);
      const value = next.cells[sis];
      if (value?.provisional && !value.pending && value.value === row.grade && asScore(current[sis]) === row.grade) {
        next.cells[sis] = { ...value, provisional: false, finalizedAt: at };
      }
    });
  }
  if (column && next.created && next.weightState !== 'counted') {
    if (Number(column.weight) === 0) next.weightState = 'provisional';
    else {
      next.weightState = 'counted';
      next.countedAt = at;
      next.countedWeight = Number(column.weight);
      delete next.pendingWeight;
    }
  }
  return next;
};

/**
 * The Import file for grades: "id,grade" rows, no header, CRLF. Exactly the
 * TEAMS Import defaults (comma, no text qualifier, ID column 1, grade column
 * 2, no header row; observed 2026-11-26). Grade Transfer's ZIP uses the same
 * function (gradeTransferModel.teamsCsv).
 */
// Defined in teamsImportFile.mjs, so Grade Transfer's ZIP loads the file
// format without the whole engine (the teacher's first load).
export { teamsImportCsv } from './teamsImportFile.mjs';

/** The file an op sends, for an adapter that only has the Import. */
export const teamsOpFile = (op) => {
  if (op.type === 'importScores') return { body: teamsImportCsv(op.rows), overwrite: op.overwrite === true };
  if (op.type === 'clearScores') return { body: teamsClearCsv(op.sisStudentIds), overwrite: true };
  return null;
};

export const teamsLedgerKey = (targetKey, sectionRef) => `${targetKey}@${sectionRef}`;

const sectionRefsOf = (target) => [...new Set(
  (Array.isArray(target.teamsSectionRefs) ? target.teamsSectionRefs : [target.teamsSectionRef]).map(text).filter(Boolean),
)];

/** Every TEAMS section the targets need read back. */
export const teamsSectionRefsFor = (targets = []) => [...new Set(targets.flatMap(sectionRefsOf))];

/**
 * Split each target into one per TEAMS section. With a single section every
 * student goes there (the planner reports anyone not on its roster). With
 * several, each student goes to the section whose roster has them on the due
 * date; a student on none or on more than one is reported and not written.
 */
export const routeTeamsTargets = ({ targets = [], gradebooks = new Map() }) => {
  const units = [];
  const routingPlans = [];
  for (const target of targets) {
    const refs = sectionRefsOf(target);
    const base = { targetKey: target.key };
    if (!refs.length) {
      routingPlans.push({ ...base, key: target.key, sectionRef: null, columnId: null, ops: [], cells: (target.rows || []).map((row) => ({ studentId: row.studentId || '', sisStudentId: text(row.sisStudentId), status: TEAMS_CELL_STATUS.HELD, detail: 'Class not linked to TEAMS' })), exceptions: [{ key: target.key, code: TEAMS_EXCEPTION.CLASS_NOT_MAPPED, message: EXCEPTION_MESSAGES.CLASS_NOT_MAPPED }] });
      continue;
    }
    if (refs.length === 1) {
      units.push({ ...target, ...base, key: teamsLedgerKey(target.key, refs[0]), teamsSectionRef: refs[0] });
      continue;
    }
    const routing = { key: target.key, ...base, sectionRef: null, columnId: null, ops: [], cells: [], exceptions: [] };
    const unread = refs.filter((ref) => !gradebooks.get(ref));
    if (unread.length) {
      // Without every roster, a student's section cannot be known.
      routing.exceptions.push({ key: target.key, code: TEAMS_EXCEPTION.CLASS_NOT_MAPPED, message: EXCEPTION_MESSAGES.CLASS_NOT_MAPPED, sectionRefs: unread });
      (target.rows || []).forEach((row) => routing.cells.push({ studentId: row.studentId || '', sisStudentId: text(row.sisStudentId), status: TEAMS_CELL_STATUS.HELD, detail: 'A linked TEAMS section was not read' }));
      routingPlans.push(routing);
      continue;
    }
    const dueDate = text(target.dueDate);
    const bySection = new Map(refs.map((ref) => [ref, { rows: [], withheld: [], excused: [], unresolved: [] }]));
    for (const list of ['rows', 'withheld', 'excused', 'unresolved']) {
      for (const row of target[list] || []) {
        const sis = text(row.sisStudentId);
        const homes = sis ? refs.filter((ref) => enrolledOn(gradebooks.get(ref), sis, dueDate)) : [];
        if (homes.length === 1) { bySection.get(homes[0])[list].push(row); continue; }
        if (list !== 'rows') continue;
        const code = homes.length ? TEAMS_EXCEPTION.ENROLLED_IN_SEVERAL : TEAMS_EXCEPTION.NOT_ENROLLED;
        routing.exceptions.push({ key: target.key, code, message: EXCEPTION_MESSAGES[code], studentId: row.studentId, sisStudentId: sis, dueDate, ...(homes.length ? { sectionRefs: homes } : {}) });
        routing.cells.push({ studentId: row.studentId || '', sisStudentId: sis, status: TEAMS_CELL_STATUS.BLOCKED, detail: homes.length ? 'On more than one linked TEAMS section' : 'Not on any linked TEAMS section for the due date' });
      }
    }
    refs.forEach((ref) => units.push({ ...target, ...base, key: teamsLedgerKey(target.key, ref), teamsSectionRef: ref, teamsSectionRefs: undefined, ...bySection.get(ref) }));
    if (routing.cells.length || routing.exceptions.length) routingPlans.push(routing);
  }
  return { units, routingPlans };
};

const claimedColumns = (ledger, key) => new Set(Object.entries(ledger || {})
  .filter(([other, entry]) => other !== key && entry?.columnId)
  .map(([, entry]) => entry.columnId));

/**
 * Plan every target against the read-backs. `units` are the per-section
 * targets the plans (other than routing reports) belong to.
 */
export const planTeamsSync = ({ targets = [], ledger = {}, gradebooks = new Map(), capabilities = {} }) => {
  const { units, routingPlans } = routeTeamsTargets({ targets, gradebooks });
  const plans = units.map((unit) => ({
    ...planTeamsTarget({
      target: unit, ledgerEntry: ledger[unit.key], gradebook: gradebooks.get(unit.teamsSectionRef), capabilities,
      claimedColumnIds: claimedColumns(ledger, unit.key),
    }),
    targetKey: unit.targetKey,
    sectionRef: unit.teamsSectionRef,
  }));
  return { units, plans: [...plans, ...routingPlans] };
};

/** Fold read-backs into the ledger (verifications, column ids, weight state). */
export const reconcileTeamsLedger = ({ units = [], plans = [], ledger = {}, gradebooks = new Map(), at }) => {
  const next = { ...ledger };
  for (const unit of units) {
    const plan = plans.find((item) => item.key === unit.key);
    const gradebook = gradebooks.get(unit.teamsSectionRef);
    if (plan && gradebook) next[unit.key] = reconcileEntry({ entry: next[unit.key] || {}, plan, gradebook, at, target: unit });
  }
  return next;
};

/**
 * Write-ahead: record what an op is about to do BEFORE it is sent, so a write
 * that lands after a lost response is still recognised as MathMaster's own
 * value, never as a teacher's, and a lost create is found, not duplicated.
 */
export const recordTeamsIntent = (ledger, op, at) => {
  // Sent to TEAMS again after a removal: the new column starts a new entry.
  if (op.type === 'createColumn' && ledger[op.key]?.removed) ledger[op.key] = {};
  const entry = (ledger[op.key] ||= {});
  entry.cells ||= {};
  if (op.type === 'createColumn') entry.pendingColumn = { name: op.spec.name, attemptedAt: at };
  if (op.type === 'importScores') {
    op.rows.forEach((row) => {
      const previous = entry.cells[row.sisStudentId] || {};
      const attempts = previous.pending?.value === row.grade ? (previous.pending.attempts || 0) + 1 : 1;
      entry.cells[row.sisStudentId] = { ...previous, pending: { value: row.grade, provisional: op.provisional === true, attempts, attemptedAt: at } };
    });
  }
  if (op.type === 'clearScores') op.sisStudentIds.forEach((sis) => { entry.cells[sis] = { ...entry.cells[sis], pendingClear: true }; });
  if (op.type === 'setWeight') entry.pendingWeight = op.weight;
  if (op.type === 'setColumnDates') {
    const same = entry.pendingDates?.dueDate === op.dueDate && entry.pendingDates?.assignedDate === op.assignedDate;
    entry.pendingDates = { assignedDate: op.assignedDate, dueDate: op.dueDate, attempts: same ? (entry.pendingDates.attempts || 0) + 1 : 1, attemptedAt: at };
  }
  if (op.type === 'deleteColumn') {
    const same = entry.pendingDelete?.columnId === op.columnId;
    entry.pendingDelete = { columnId: op.columnId, gradeCount: op.gradeCount, ...(op.markingPeriod ? { markingPeriod: op.markingPeriod } : {}), attempts: same ? (entry.pendingDelete.attempts || 0) + 1 : 1, attemptedAt: at };
  }
  return ledger;
};

/**
 * Record what TEAMS answered: a created column's id, or which rows an Import
 * accepted. A failure records nothing beyond the intent; the next read-back
 * decides.
 */
export const recordTeamsOutcome = (ledger, op, outcome = {}, at) => {
  const entry = (ledger[op.key] ||= {});
  entry.cells ||= {};
  if (!outcome.ok) return ledger;
  if (op.type === 'createColumn' && text(outcome.columnId)) {
    Object.assign(entry, { columnId: text(outcome.columnId), created: true });
    delete entry.pendingColumn;
  }
  if (op.type === 'importScores') {
    const errors = Array.isArray(outcome.errors) ? outcome.errors : [];
    const refused = new Map(errors.map((item) => [text(item.sisStudentId), text(item.reason) || 'refused']));
    op.rows.forEach((row) => {
      const pending = entry.cells[row.sisStudentId]?.pending;
      if (!pending) return;
      if (refused.has(row.sisStudentId)) pending.error = refused.get(row.sisStudentId);
      else pending.deliveredAt = at;
    });
  }
  return ledger;
};

export const summarizeTeamsPlans = (plans = []) => {
  const summary = Object.fromEntries(Object.values(TEAMS_CELL_STATUS).map((status) => [status, 0]));
  plans.forEach((plan) => plan.cells.forEach((item) => { summary[item.status] += 1; }));
  return summary;
};

/**
 * Run read-back → plan → apply until nothing is left to do or `maxPasses`
 * is spent, with the adapter in-process (tests, the demo, a vendor API).
 * The server runs the same steps one at a time (teamsSyncServer.mjs), with
 * the teacher's browser applying each batch.
 */
export const runTeamsSync = async ({
  targets = [], ledger = {}, adapter, capabilities = {}, now = () => new Date().toISOString(), maxPasses = 6,
}) => {
  let state = structuredClone(ledger || {});
  const log = [];
  let plans = [];
  for (let pass = 1; pass <= maxPasses; pass += 1) {
    const gradebooks = new Map();
    for (const ref of teamsSectionRefsFor(targets)) gradebooks.set(ref, await adapter.readGradebook(ref));
    const first = planTeamsSync({ targets, ledger: state, gradebooks, capabilities });
    state = reconcileTeamsLedger({ units: first.units, plans: first.plans, ledger: state, gradebooks, at: now() });
    ({ plans } = planTeamsSync({ targets, ledger: state, gradebooks, capabilities }));
    const ops = plans.flatMap((plan) => plan.ops);
    if (!ops.length) break;
    for (const op of ops) {
      recordTeamsIntent(state, op, now());
      try {
        let outcome = { ok: true };
        if (op.type === 'createColumn') {
          outcome.columnId = await adapter.createColumn(op.sectionRef, op.spec);
        } else if (op.type === 'importScores') {
          const response = await adapter.importScores(op.columnId, teamsImportCsv(op.rows), { overwrite: op.overwrite });
          outcome = { ok: true, ...response };
        } else if (op.type === 'clearScores') {
          // TEAMS has no clear action of its own on the Import route. A blank
          // grade imported with "Overwrite existing grades?" Yes clears the
          // cell (teacher, 2026-11-27). An adapter with a real clear uses it.
          if (typeof adapter.clearScores === 'function') await adapter.clearScores(op.columnId, op.sisStudentIds);
          else await adapter.importScores(op.columnId, teamsClearCsv(op.sisStudentIds), { overwrite: true });
        } else if (op.type === 'setWeight') {
          await adapter.setColumnWeight(op.columnId, op.weight);
        } else if (op.type === 'setColumnDates') {
          await adapter.setColumnDates(op.columnId, { assignedDate: op.assignedDate, dueDate: op.dueDate });
        } else if (op.type === 'deleteColumn') {
          await adapter.deleteColumn(op.columnId);
        }
        recordTeamsOutcome(state, op, outcome, now());
        log.push({ pass, op: op.type, key: op.key, ok: true, ...(op.rows ? { rows: op.rows.length, overwrite: op.overwrite } : {}) });
      } catch (error) {
        log.push({ pass, op: op.type, key: op.key, ok: false, error: String(error?.message || error) });
      }
    }
  }
  return {
    ledger: state,
    plans,
    log,
    exceptions: plans.flatMap((plan) => plan.exceptions),
    summary: summarizeTeamsPlans(plans),
    complete: plans.every((plan) => !plan.ops.length),
  };
};

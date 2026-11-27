// MathMaster -> Frontline TEAMS gradebook sync (issue #612, discovery).
//
// A deterministic reconciler that runs without AI and does not depend on the route. Each run:
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
// Transfer already ships) and optionally `clearScores`. A vendor API, a
// teacher-session browser assistant and the test gradebook in
// tests/platform/helpers/teamsTestGradebook.mjs all implement that one shape.
//
// What is kept locally (the ledger) is deliberately small: the column a
// lesson section maps to, whether its weight has been switched from
// provisional to counted, and per cell the value MathMaster last wrote and
// whether a read-back has confirmed it. That last part is what lets a re-run
// tell "MathMaster's own value, safe to correct" from "a teacher typed this,
// leave it". Nothing else in the gradebook is mirrored: a read-back is
// cheap and always newer than a copy.

import { isTestCycleAssignment } from '../assessment/testCycle.js';
import {
  MISSING_SIS_TRANSFER_REASON,
  SECTION_TRANSFER_LABELS,
  SHARED_SIS_TRANSFER_REASON,
  teamsCsv,
} from './gradeTransferModel.js';

const ROSTER_ID_REASONS = new Set([MISSING_SIS_TRANSFER_REASON, SHARED_SIS_TRANSFER_REASON]);

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
  MANUAL_GRADE_DIFFERS: 'MANUAL_GRADE_DIFFERS',
  TEACHER_OVERRIDE: 'TEACHER_OVERRIDE',
  TEACHER_CLEARED: 'TEACHER_CLEARED',
  SAVE_NOT_PERSISTING: 'SAVE_NOT_PERSISTING',
  PROVISIONAL_WEIGHT_NOT_ZERO: 'PROVISIONAL_WEIGHT_NOT_ZERO',
  REOPENED_AFTER_COUNTED: 'REOPENED_AFTER_COUNTED',
  PROVISIONAL_SCORE_WILL_COUNT: 'PROVISIONAL_SCORE_WILL_COUNT',
});

const EXCEPTION_MESSAGES = Object.freeze({
  CLASS_NOT_MAPPED: 'This class is not linked to a TEAMS section yet.',
  NO_MARKING_PERIOD: 'No TEAMS marking period contains the due date.',
  MARKING_PERIOD_LOCKED: 'The TEAMS marking period is closed to changes.',
  MAPPED_COLUMN_MISSING: 'The TEAMS assignment MathMaster used is gone. It was not recreated. Confirm before a new one is made.',
  AMBIGUOUS_COLUMN: 'More than one TEAMS assignment has this name, so MathMaster cannot tell which to use.',
  CATEGORY_MISMATCH: 'The matching TEAMS assignment is in a different category. It was left as the teacher set it.',
  NOT_ENROLLED: 'The district ID is not on this TEAMS section for the due date.',
  MANUAL_GRADE_DIFFERS: 'TEAMS already holds a different grade that MathMaster did not write. It was kept.',
  TEACHER_OVERRIDE: 'A teacher changed the grade in TEAMS after MathMaster wrote it. The newer MathMaster grade was not applied.',
  TEACHER_CLEARED: 'A grade MathMaster had confirmed in TEAMS was cleared there. It was not re-entered.',
  SAVE_NOT_PERSISTING: 'TEAMS accepted this grade several times, but it is still blank when read back.',
  PROVISIONAL_WEIGHT_NOT_ZERO: 'The provisional TEAMS assignment no longer has #Count 0, so open-lesson scores were not posted.',
  REOPENED_AFTER_COUNTED: 'The lesson reopened after its grades started counting. Scores in TEAMS stay as posted until it closes again.',
  PROVISIONAL_SCORE_WILL_COUNT: 'This student has no final grade yet, and their provisional score in TEAMS will count once #Count changes. It cannot be cleared by this route.',
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

/** A calendar date in the district's zone. TEAMS dates are days, not instants. */
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
 * - A blank grade imported with Overwrite Yes clears that cell.
 */
export const DESOTO_TEAMS_CAPABILITIES = Object.freeze({
  provisional: 'assignment-weight-zero',
  canClearCells: true,
});

export const teamsDay = (value, timeZone = 'America/Chicago') => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const millis = typeof value?.toMillis === 'function' ? value.toMillis() : new Date(value).getTime();
  if (!Number.isFinite(millis)) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(millis));
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
  const entry = ledgerEntry || {};
  const result = {
    key: target.key, columnId: null, columnSource: null, markingPeriod: null,
    weight: null, ops: [], cells: [], exceptions: [],
  };
  const exception = (code, detail = {}) => result.exceptions.push({ key: target.key, code, message: EXCEPTION_MESSAGES[code], ...detail });
  const cell = (row, status, detail = '') => result.cells.push({
    studentId: row.studentId || '', sisStudentId: text(row.sisStudentId), status, detail,
  });
  const holdAll = (detail) => (target.rows || []).forEach((row) => cell(row, TEAMS_CELL_STATUS.HELD, detail));

  if (!gradebook) { exception(TEAMS_EXCEPTION.CLASS_NOT_MAPPED); holdAll('Class not linked to TEAMS'); return result; }

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
      exception(TEAMS_EXCEPTION.PROVISIONAL_SCORE_WILL_COUNT, { studentId: row.studentId, sisStudentId: sis, teams: score });
      cell(row, status, `${detail}; provisional ${score} remains`);
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
  // confirmed and every provisional leftover is resolved, and never again
  // once the ledger records it as counted.
  const unsettled = result.cells.some((item) => item.status === TEAMS_CELL_STATUS.QUEUED || item.status === TEAMS_CELL_STATUS.DELIVERED);
  if (target.closed && stillProvisional && !result.ops.length && !unsettled) {
    result.ops.push({ type: 'setWeight', key: target.key, columnId: column.id, weight: countedWeight });
  }
  return result;
};

// Fold a read-back into the ledger: pending writes that now show are
// verified, a weight switch that shows is recorded as done.
const reconcileEntry = ({ entry, plan, gradebook, at, target }) => {
  if (!plan.columnId) return entry;
  const next = { ...entry, cells: { ...entry.cells } };
  if (!next.columnId) {
    next.columnId = plan.columnId;
    next.created = plan.columnSource === 'created';
  }
  delete next.pendingColumn;
  const column = (gradebook.columns || []).find((item) => item.id === plan.columnId);
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

const sectionRefs = (targets) => [...new Set(targets.map((target) => target.teamsSectionRef).filter(Boolean))];

const planAll = ({ targets, ledger, gradebooks, capabilities }) => targets.map((target) => planTeamsTarget({
  target, ledgerEntry: ledger[target.key], gradebook: gradebooks.get(target.teamsSectionRef), capabilities,
  claimedColumnIds: new Set(Object.entries(ledger)
    .filter(([key, entry]) => key !== target.key && entry?.columnId)
    .map(([, entry]) => entry.columnId)),
}));

/**
 * Run read-back → plan → apply until nothing is left to do or `maxPasses`
 * is spent. Whatever is left stays queued in the returned ledger and the next
 * run, whether immediate or nightly, picks it up from a fresh read-back.
 */
export const runTeamsSync = async ({
  targets = [], ledger = {}, adapter, capabilities = {}, now = () => new Date().toISOString(), maxPasses = 6,
}) => {
  const state = structuredClone(ledger || {});
  const log = [];
  let plans = [];
  let gradebooks = new Map();
  for (let pass = 1; pass <= maxPasses; pass += 1) {
    gradebooks = new Map();
    for (const ref of sectionRefs(targets)) gradebooks.set(ref, await adapter.readGradebook(ref));
    const at = now();
    planAll({ targets, ledger: state, gradebooks, capabilities }).forEach((plan) => {
      const target = targets.find((item) => item.key === plan.key);
      const gradebook = gradebooks.get(target.teamsSectionRef);
      if (gradebook) state[plan.key] = reconcileEntry({ entry: state[plan.key] || {}, plan, gradebook, at, target });
    });
    plans = planAll({ targets, ledger: state, gradebooks, capabilities });
    const ops = plans.flatMap((plan) => plan.ops);
    if (!ops.length) break;
    for (const op of ops) {
      const entry = (state[op.key] ||= {});
      entry.cells ||= {};
      try {
        if (op.type === 'createColumn') {
          entry.pendingColumn = { name: op.spec.name, attemptedAt: now() };
          const columnId = await adapter.createColumn(op.sectionRef, op.spec);
          Object.assign(entry, { columnId, created: true });
          delete entry.pendingColumn;
        } else if (op.type === 'importScores') {
          // Write-ahead: the intent is recorded before the file goes, so a
          // write that lands after a lost response is still recognised as
          // MathMaster's own value, never as a teacher's.
          op.rows.forEach((row) => {
            const previous = entry.cells[row.sisStudentId] || {};
            const attempts = previous.pending?.value === row.grade ? (previous.pending.attempts || 0) + 1 : 1;
            entry.cells[row.sisStudentId] = { ...previous, pending: { value: row.grade, provisional: op.provisional === true, attempts, attemptedAt: now() } };
          });
          const response = await adapter.importScores(op.columnId, teamsCsv(op.rows), { overwrite: op.overwrite });
          const refused = new Set((response?.errors || []).map((item) => text(item.sisStudentId)));
          op.rows.forEach((row) => {
            const pending = entry.cells[row.sisStudentId].pending;
            if (refused.has(row.sisStudentId)) pending.error = response.errors.find((item) => text(item.sisStudentId) === row.sisStudentId)?.reason || 'refused';
            else pending.deliveredAt = now();
          });
        } else if (op.type === 'clearScores') {
          op.sisStudentIds.forEach((sis) => { entry.cells[sis] = { ...entry.cells[sis], pendingClear: true }; });
          // TEAMS has no clear action of its own on this route. A blank grade
          // imported with "Overwrite existing grades?" Yes clears the cell
          // (teacher, 2026-11-27). An adapter with a real clear uses that.
          if (typeof adapter.clearScores === 'function') await adapter.clearScores(op.columnId, op.sisStudentIds);
          else await adapter.importScores(op.columnId, teamsClearCsv(op.sisStudentIds), { overwrite: true });
        } else if (op.type === 'setWeight') {
          entry.pendingWeight = op.weight;
          await adapter.setColumnWeight(op.columnId, op.weight);
        }
        log.push({ pass, op: op.type, key: op.key, ok: true, ...(op.rows ? { rows: op.rows.length, overwrite: op.overwrite } : {}) });
      } catch (error) {
        log.push({ pass, op: op.type, key: op.key, ok: false, error: String(error?.message || error) });
      }
    }
  }
  const summary = Object.fromEntries(Object.values(TEAMS_CELL_STATUS).map((status) => [status, 0]));
  plans.forEach((plan) => plan.cells.forEach((item) => { summary[item.status] += 1; }));
  return {
    ledger: state,
    plans,
    log,
    exceptions: plans.flatMap((plan) => plan.exceptions),
    summary,
    complete: plans.every((plan) => !plan.ops.length),
  };
};

/**
 * One sync target from a Grade Transfer section unit (buildTransferUnit),
 * so the sync posts exactly the grades the export already would: the same
 * finality, extension, Recovery-hold, excusal and district-ID rules.
 * `provisionalRows` are open-lesson scores; they are used only while the
 * unit is not final yet.
 */
export const teamsTargetFromTransferUnit = ({
  unit, assignment = {}, teamsSectionRef, students = [], provisionalRows = [], now = Date.now(),
  timeZone = 'America/Chicago', category = null, countedWeight = 1,
}) => {
  const sisOf = new Map((students || []).map((student) => [text(student.id), text(student.sisStudentId || student.id)]));
  const person = (row) => ({ studentId: row.studentId, sisStudentId: row.sisStudentId || sisOf.get(text(row.studentId)) || '', reason: row.reason });
  const closed = unit.ordinaryDeadline !== null && unit.ordinaryDeadline !== undefined && now >= unit.ordinaryDeadline;
  const label = unit.sectionLabel || SECTION_TRANSFER_LABELS[unit.sectionKey] || '';
  return {
    key: unit.key,
    classId: unit.classId,
    teamsSectionRef,
    name: teamsAssignmentName(unit.assignmentTitle, label),
    category: category || (isTestCycleAssignment(assignment) ? 'Test' : 'Daily'),
    assignedDate: teamsDay(assignment.assignedAt || assignment.startAt || assignment.createdAt, timeZone),
    dueDate: teamsDay(assignment.dueAt || assignment.dueDate || unit.ordinaryDeadline, timeZone),
    closed,
    countedWeight,
    rows: (closed ? unit.allRows : provisionalRows || []).map((row) => ({
      studentId: row.studentId,
      sisStudentId: text(row.sisStudentId),
      grade: Math.max(0, Math.min(100, Math.round(Number(row.grade)))),
    })),
    withheld: closed ? (unit.withheld || []).map(person) : [],
    excused: (unit.excused || []).map(person),
    // Recovery held, no finalized grade, needs review. A district-ID problem
    // is left out: its ID cannot address a TEAMS row safely.
    unresolved: closed
      ? (unit.problems || []).filter((row) => !ROSTER_ID_REASONS.has(row.reason)).map(person)
      : [],
  };
};

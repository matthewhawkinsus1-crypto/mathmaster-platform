// What the extension read from TEAMS's pages, as the read-back MathMaster's
// server takes (functions/shared/teamsSyncServer.mjs normalizeTeamsReadback):
//
//   { markingPeriods: [{ id, start, end, locked }],
//     roster: [{ sisStudentId, enteredOn, leftOn }],
//     columns: [{ id, name, category, markingPeriod, assignedDate, dueDate, weight }],
//     cells: { [columnId]: { [sisStudentId]: number | code } } }
//
// Two TEAMS pages hold it (observed on DeSoto's TEAMS, 2026-11-27):
//   - the gradebook ("Enter Classroom Grading", one marking-period tab): each
//     column's stable id (the header link's assignmentId), its name,
//     "100x1" (Maximum Value × #Count), category and due day without a year;
//     the roster by Local ID; every cell.
//   - the Assignments grid of the same section and grading cycle: full assign
//     and due dates, #Count and the cycle, plus the cycle's own date range.
// A column is matched to its Assignments row by name (TEAMS keeps the spaces
// a teacher typed on that page and collapses them in the gradebook) and due
// day. A column with no single match keeps the gradebook's own facts and no
// dates; the server then plans by name and marking period alone.
//
// Pure: no DOM, no chrome.*. The page functions (teamsPage.js) gather the raw
// facts; this turns them into the read-back.

const text = (value) => String(value ?? '').trim();
export const normalizeTeamsName = (value) => text(value).replace(/\s+/g, ' ');

/** "15041/01 - Alg II Honors - S1 , S2 - A/03" → "15041/01"; "15000-I/02 - …" → "15000-I/02". */
export const sectionRefFromSelectedText = (value) => {
  const match = /^\s*([A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9]+)\b/.exec(text(value));
  return match ? match[1] : '';
};

/** TEAMS's screen date (MM-DD-YYYY) → YYYY-MM-DD, or '' for anything else. */
export const isoFromTeamsDate = (value) => {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text(value));
  if (!match) return '';
  const iso = `${match[3]}-${match[1]}-${match[2]}`;
  return Number.isFinite(Date.parse(`${iso}T00:00:00Z`)) ? iso : '';
};

/** "100x1" → { max: 100, count: 1 }; "100x0" → count 0. */
export const parseMaxCount = (value) => {
  const match = /^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*$/i.exec(text(value));
  return match ? { max: Number(match[1]), count: Number(match[2]) } : null;
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** The gradebook's "Nov 02" → "11-02" (month-day, no year). */
export const monthDayFromLabel = (value) => {
  const match = /^([A-Za-z]{3})\w*\s+(\d{1,2})$/.exec(text(value));
  if (!match) return '';
  const month = MONTHS.indexOf(match[1].toLowerCase());
  return month < 0 ? '' : `${String(month + 1).padStart(2, '0')}-${match[2].padStart(2, '0')}`;
};

/** "MP3" (the gradebook tab) or "3" (the Assignments grid's cycle) → "3". */
export const markingPeriodId = (value) => {
  const match = /(\d+)\s*$/.exec(text(value));
  return match ? match[1] : '';
};

/**
 * A cell as TEAMS shows it: a number stays a number; a code (EX, M, I…) stays
 * text; a blank is no value, so it is left out.
 */
export const cellValue = (value) => {
  const raw = text(value);
  if (!raw) return undefined;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  return raw.length <= 8 ? raw : undefined;
};

// As the server checks a district ID (studentDistrictId.mjs): 1–20 digits.
const DISTRICT_ID = /^\d{1,20}$/;
// The roster groups that are on the section: "Scheduled Students With
// Ownership" and "… Without Ownership" (DeSoto, 2026-11-27).
const SCHEDULED = /^Scheduled Students\b/i;

/**
 * Build one section's read-back.
 *
 * `gradebook`: { sectionText, markingPeriod, columns: [{ id, name, maxCount,
 *   category, dueLabel }], roster: [{ label } | { id, group }] (one per
 *   gradebook row), cells: { [columnId]: [value per roster row] } }
 * `assignments`: { cycle: { id, start, end }, rows: [{ name, category,
 *   assignedDate, dueDate, maxValue, count, cycle }] } (dates MM-DD-YYYY), or
 *   null when the Assignments grid was not read.
 *
 * Returns { sectionRef, readback, notes }: `notes` lists what could not be
 * matched, for the extension's own log. Nothing in it names a student.
 */
export const buildTeamsReadback = ({ gradebook, assignments = null }) => {
  const notes = [];
  const sectionRef = sectionRefFromSelectedText(gradebook?.sectionText);
  if (!sectionRef) throw new Error('The TEAMS gradebook shows no course/section.');
  const periodId = markingPeriodId(gradebook.markingPeriod);
  if (!periodId) throw new Error('The TEAMS gradebook shows no marking period tab.');

  const cycle = assignments?.cycle || null;
  const cycleId = markingPeriodId(cycle?.id);
  if (assignments && cycleId && cycleId !== periodId) {
    throw new Error(`The Assignments grid is grading cycle ${cycleId}, the gradebook tab is ${periodId}.`);
  }
  const markingPeriods = [{
    id: periodId,
    start: isoFromTeamsDate(cycle?.start),
    end: isoFromTeamsDate(cycle?.end),
    // TEAMS showed no lock on either page; a closed period is refused by TEAMS
    // itself, and the import receipt reports it.
    locked: false,
  }];
  if (!markingPeriods[0].start || !markingPeriods[0].end) notes.push(`Marking period ${periodId} has no dates (the Assignments grid was not read).`);

  // Assignments rows by name, for the dates and #Count.
  const rowsByName = new Map();
  for (const row of assignments?.rows || []) {
    if (markingPeriodId(row.cycle) && markingPeriodId(row.cycle) !== periodId) continue;
    const key = normalizeTeamsName(row.name).toLowerCase();
    if (!rowsByName.has(key)) rowsByName.set(key, []);
    rowsByName.get(key).push(row);
  }

  const columns = [];
  for (const column of gradebook.columns || []) {
    const id = text(column.id);
    if (!/^[A-Za-z0-9_.:/-]{1,80}$/.test(id)) { notes.push(`A column without a TEAMS id was skipped ("${normalizeTeamsName(column.name).slice(0, 40)}").`); continue; }
    const name = normalizeTeamsName(column.name);
    const header = parseMaxCount(column.maxCount);
    const dueDay = monthDayFromLabel(column.dueLabel);
    const candidates = (rowsByName.get(name.toLowerCase()) || [])
      .filter((row) => !dueDay || isoFromTeamsDate(row.dueDate).slice(5) === dueDay);
    const row = candidates.length === 1 ? candidates[0] : null;
    if (assignments && !row) notes.push(`"${name.slice(0, 40)}": ${candidates.length ? 'more than one' : 'no'} Assignments row matches; its dates are left out.`);
    const rowCount = row && text(row.count) !== '' ? Number(row.count) : NaN;
    const weight = Number.isFinite(rowCount) ? rowCount : (header ? header.count : NaN);
    if (!Number.isFinite(weight)) { notes.push(`"${name.slice(0, 40)}": no #Count could be read; skipped.`); continue; }
    columns.push({
      id,
      name,
      category: text(row?.category || column.category),
      markingPeriod: periodId,
      assignedDate: isoFromTeamsDate(row?.assignedDate),
      dueDate: isoFromTeamsDate(row?.dueDate),
      weight,
    });
  }

  // One entry per gradebook row, so the grade grid lines up: { label } for a
  // group's label row, { id, group } for a student (or a bare Local ID).
  const rows = (gradebook.roster || []).map((entry) => {
    if (entry && typeof entry === 'object' && entry.label !== undefined) return { label: true, id: '' };
    return entry && typeof entry === 'object'
      ? { id: text(entry.id), group: normalizeTeamsName(entry.group) }
      : { id: text(entry), group: '' };
  });
  const ids = rows.map((row) => row.id);
  const roster = [];
  const seen = new Set();
  let dropped = 0;
  let unusable = 0;
  rows.forEach(({ label, id, group }) => {
    if (label) return;
    if (!DISTRICT_ID.test(id) || seen.has(id)) { unusable += 1; return; }
    seen.add(id);
    // TEAMS lists dropped students under their own labels. Only a scheduled
    // student is on the section now; entry and withdrawal dates are not on
    // the gradebook, so a dropped student is not routed here at all.
    if (group && !SCHEDULED.test(group)) { dropped += 1; return; }
    roster.push({ sisStudentId: id, enteredOn: '', leftOn: '' });
  });
  if (dropped) notes.push(`${dropped} dropped student(s) are listed in TEAMS and were not counted as on this section.`);
  if (unusable) notes.push(`${unusable} roster row(s) had no usable Local ID or repeated one, and were left out.`);

  const cells = {};
  const kept = new Set(columns.map((column) => column.id));
  for (const [columnId, values] of Object.entries(gradebook.cells || {})) {
    if (!kept.has(columnId)) continue;
    const out = {};
    (values || []).forEach((value, index) => {
      const sis = ids[index];
      const parsed = cellValue(value);
      if (parsed !== undefined && sis && DISTRICT_ID.test(sis)) out[sis] = parsed;
    });
    cells[columnId] = out;
  }

  return { sectionRef, readback: { markingPeriods, roster, columns, cells }, notes };
};

/** The TEAMS id of a column just created: the one named `name` that was not there before. */
export const newColumnId = ({ before = [], after = [], name }) => {
  const known = new Set(before.map((column) => text(column.id)));
  const wanted = normalizeTeamsName(name).toLowerCase();
  const fresh = after.filter((column) => !known.has(text(column.id)) && normalizeTeamsName(column.name).toLowerCase() === wanted);
  return fresh.length === 1 ? text(fresh[0].id) : '';
};

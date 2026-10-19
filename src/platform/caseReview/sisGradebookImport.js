/*
 * IMPORT A CURRENT GRADEBOOK SNAPSHOT — READ-ONLY, ONE STUDENT.
 *
 * A teacher may give the case review a CSV exported from the official
 * gradebook (TEAMS, Skyward or similar) so MathMaster can compare its own
 * grades with what the gradebook holds. The import changes nothing: no grade,
 * no export, no roster.
 *
 * MathMaster has never parsed an official gradebook export before (it only
 * writes the two-column TEAMS upload files), and the exact layout differs by
 * district and by export screen. So this reader is deliberately tolerant and
 * deliberately literal:
 *
 *   * delimiter (comma, tab, semicolon, bar), quotes, BOM, preamble rows;
 *   * WIDE files — one row per student, one column per gradebook item, with
 *     optional "Category" / "Points Possible" / "Weight" / "Due" rows under
 *     the header and an "Average" column;
 *   * LONG files — one row per student per item, with optional category,
 *     points possible, category weight and due date columns;
 *   * MathMaster's own TEAMS upload file, recognised and labelled as what
 *     MathMaster SENT, never as the gradebook.
 *
 * MINIMISATION: a class gradebook holds every student's grades. Only the
 * selected student's row is kept; every other row is counted and dropped
 * here, in the browser, before anything is shown or saved.
 *
 * A student is matched by SIS id or MathMaster id only. A name match is
 * offered to the teacher and applies only when they confirm that row. A
 * MathMaster id whose district ID was corrected away from it is never a match
 * key: that number is known not to be this student's district number, and may
 * be another child's (functions/shared/studentDistrictId.mjs).
 *
 * Nothing here interprets a score. "EX", "M" and blanks are kept as the marks
 * they are; a percentage is computed from points only when the file gives
 * both numbers.
 */
import {
  accountIdIsSupersededDistrictId,
  districtIdMatchKeys,
  effectiveDistrictStudentId,
  studentAccountIdOf,
} from '../../../functions/shared/studentDistrictId.mjs';
import { resolveStudentIdentity, studentNameParts } from '../studentName.js';

export const GRADEBOOK_LAYOUT = Object.freeze({
  WIDE: 'wide',
  LONG: 'long',
  MATHMASTER_TEAMS: 'mathmaster-teams',
  UNKNOWN: 'unknown',
});

export const IMPORT_LIMITS = Object.freeze({
  maxBytes: 5 * 1024 * 1024,
  maxRows: 20000,
  maxCells: 400,
  headerSearchRows: 15,
  maxItems: 300,
  itemName: 120,
  category: 60,
});

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const norm = (value) => clean(value).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%#]+/g, ' ').trim();

// --- Parsing ------------------------------------------------------------------------------

const DELIMITERS = [',', '\t', ';', '|'];

const countOutsideQuotes = (line, delimiter) => {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') quoted = !quoted;
    else if (character === delimiter && !quoted) count += 1;
  }
  return count;
};

const detectDelimiter = (text) => {
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim()).slice(0, 20);
  let best = ',';
  let bestScore = -1;
  DELIMITERS.forEach((delimiter) => {
    const counts = lines.map((line) => countOutsideQuotes(line, delimiter));
    const withAny = counts.filter((count) => count > 0).length;
    if (!withAny) return;
    const mode = counts.filter((count) => count > 0).sort((a, b) => counts.filter((c) => c === b).length - counts.filter((c) => c === a).length)[0];
    const consistent = counts.filter((count) => count === mode).length;
    const score = withAny * 10 + consistent;
    if (score > bestScore) { best = delimiter; bestScore = score; }
  });
  return best;
};

/** RFC 4180-style parse; quotes open only at the start of a field. */
export const parseDelimitedText = (input) => {
  const text = String(input ?? '').replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let fieldStart = true;
  const endField = () => {
    if (row.length < IMPORT_LIMITS.maxCells) row.push(field.trim());
    field = '';
    fieldStart = true;
  };
  const endRow = () => {
    endField();
    if (row.some((cell) => cell !== '') && rows.length < IMPORT_LIMITS.maxRows) rows.push(row);
    row = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1; } else quoted = false;
      } else field += character;
      continue;
    }
    if (character === '"' && fieldStart && !field.trim()) { quoted = true; field = ''; fieldStart = false; continue; }
    if (character === delimiter) { endField(); continue; }
    if (character === '\r' || character === '\n') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      endRow();
      continue;
    }
    field += character;
    fieldStart = false;
  }
  if (field !== '' || row.length) endRow();
  return { delimiter, rows };
};

/** One gradebook cell, as the mark it is. */
export const parseScoreCell = (input) => {
  const text = clean(input);
  if (!text) return { value: null, kind: 'blank', text: '' };
  if (/^(ex|exc|excused)$/i.test(text)) return { value: null, kind: 'excused', text };
  if (/^(m|msg|missing)$/i.test(text)) return { value: null, kind: 'missing-mark', text };
  if (/^(i|inc|incomplete)$/i.test(text)) return { value: null, kind: 'incomplete-mark', text };
  const percentMatch = text.match(/^(-?\d+(?:\.\d+)?)\s*%$/);
  if (percentMatch) return { value: Number(percentMatch[1]), kind: 'percent', text };
  const pointsMatch = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (pointsMatch && Number(pointsMatch[2]) > 0) {
    const earned = Number(pointsMatch[1]);
    const possible = Number(pointsMatch[2]);
    return { value: Math.round((earned / possible) * 1000) / 10, kind: 'points', earned, possible, text };
  }
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return { value: Number(text), kind: 'number', text };
  return { value: null, kind: 'text', text };
};

const numberOf = (input) => {
  const parsed = parseScoreCell(input);
  return Number.isFinite(parsed.value) ? parsed.value : null;
};

// --- Layout --------------------------------------------------------------------------------

const ALIASES = Object.freeze({
  studentId: ['student id', 'studentid', 'student number', 'student no', 'student #', 'local id', 'local student id', 'student local id', 'id', 'sis id', 'district id', 'other id', 'stu id', 'perm id', 'permanent id'],
  name: ['student', 'student name', 'name', 'full name', 'last first', 'last name first name', 'students'],
  lastName: ['last name', 'last', 'surname'],
  firstName: ['first name', 'first'],
  item: ['assignment', 'assignment name', 'assignment title', 'item', 'gradebook item', 'grade item', 'title', 'description', 'column name'],
  score: ['score', 'grade', 'points earned', 'earned', 'mark', 'percent', 'percentage', 'result', 'points'],
  pointsPossible: ['points possible', 'max points', 'possible', 'possible points', 'total points', 'out of', 'max score', 'maximum points', 'pts possible'],
  category: ['category', 'category name', 'assignment type', 'assignment category', 'type', 'grade type'],
  weight: ['weight', 'category weight', 'weight %', 'weight percent', 'percent of grade', 'weighting', 'category percent', 'category %'],
  dueDate: ['due date', 'date due', 'due', 'date', 'assigned date'],
});

const aliasKey = (cell) => {
  const value = norm(cell);
  return Object.keys(ALIASES).find((key) => ALIASES[key].includes(value)) || null;
};

const AVERAGE_WORD = /\b(average|avg)\b/;
const OVERALL_PREFIX = /^(cycle|term|overall|current|final|grading cycle|marking period|grading period|semester|nine weeks|six weeks|quarter|class)?\s*(grade\s+)?(average|avg)$/;

const isOfficialAverageHeader = (cell) => {
  const value = norm(cell);
  return OVERALL_PREFIX.test(value) || ['cycle grade', 'term grade', 'overall grade', 'current grade', 'final grade', 'average grade'].includes(value);
};

const categoryAverageName = (cell) => {
  const value = clean(cell);
  const match = value.match(/^(.+?)\s*(?:category\s*)?(?:average|avg)\.?$/i);
  if (!match || isOfficialAverageHeader(cell)) return null;
  return clean(match[1]).replace(/[-–—:]+$/, '').trim() || null;
};

const METADATA_ROW = Object.freeze([
  ['category', /^(category|category name|type|assignment type|grade type)$/],
  ['pointsPossible', /^(points possible|max points|maximum points|possible|possible points|out of|pts possible|total points)$/],
  ['weight', /^(weight|weight %|weight percent|category weight|percent of grade)$/],
  ['dueDate', /^(due|due date|date|date due|assigned date)$/],
]);

const metadataKind = (row) => {
  const first = row.find((cell) => clean(cell)) || '';
  const value = norm(first);
  const found = METADATA_ROW.find(([, pattern]) => pattern.test(value));
  return found ? found[0] : null;
};

const isTeamsExportRow = (row) => row.length === 2 && /^\d{1,20}$/.test(clean(row[0])) && /^\d{1,3}$/.test(clean(row[1])) && Number(row[1]) <= 100;

/**
 * What kind of file this is, which row is the header, and which column means
 * what. The teacher sees (and can correct) this before anything is used.
 */
export const detectGradebookLayout = (rows = [], { fileName = '' } = {}) => {
  const data = list(rows);
  if (data.length && data.every(isTeamsExportRow)) {
    return { layout: GRADEBOOK_LAYOUT.MATHMASTER_TEAMS, headerIndex: -1, columns: { studentId: 0, score: 1 }, itemColumns: [], metadataRows: {}, categoryAverageColumns: [], fileName: clean(fileName), reason: '' };
  }
  const limit = Math.min(data.length, IMPORT_LIMITS.headerSearchRows);
  for (let headerIndex = 0; headerIndex < limit; headerIndex += 1) {
    const header = data[headerIndex];
    if (header.filter((cell) => clean(cell)).length < 2) continue;
    const columns = {};
    header.forEach((cell, index) => {
      const key = aliasKey(cell);
      if (key && columns[key] === undefined) columns[key] = index;
    });
    if (columns.studentId === undefined && columns.name === undefined && columns.lastName === undefined) continue;
    const officialAverage = header.findIndex(isOfficialAverageHeader);
    if (officialAverage >= 0) columns.officialAverage = officialAverage;

    if (columns.item !== undefined && columns.score !== undefined) {
      return { layout: GRADEBOOK_LAYOUT.LONG, headerIndex, columns, itemColumns: [], metadataRows: {}, categoryAverageColumns: [], fileName: clean(fileName), reason: '' };
    }

    // Wide: every other named column is a gradebook item, a category average
    // or the official average.
    const identity = new Set(['studentId', 'name', 'lastName', 'firstName'].map((key) => columns[key]).filter((value) => value !== undefined));
    const categoryAverageColumns = [];
    const itemColumns = [];
    header.forEach((cell, index) => {
      if (identity.has(index) || index === columns.officialAverage || !clean(cell)) return;
      const categoryName = categoryAverageName(cell);
      if (categoryName && AVERAGE_WORD.test(norm(cell))) { categoryAverageColumns.push({ index, name: categoryName }); return; }
      itemColumns.push({ index, name: clean(cell).slice(0, IMPORT_LIMITS.itemName) });
    });
    if (!itemColumns.length && columns.officialAverage === undefined) continue;
    const metadataRows = {};
    for (let index = headerIndex + 1; index < data.length; index += 1) {
      const kind = metadataKind(data[index]);
      if (!kind) break;
      if (metadataRows[kind] === undefined) metadataRows[kind] = index;
    }
    return { layout: GRADEBOOK_LAYOUT.WIDE, headerIndex, columns, itemColumns: itemColumns.slice(0, IMPORT_LIMITS.maxItems), metadataRows, categoryAverageColumns, fileName: clean(fileName), reason: '' };
  }
  return {
    layout: GRADEBOOK_LAYOUT.UNKNOWN,
    headerIndex: -1,
    columns: {},
    itemColumns: [],
    metadataRows: {},
    categoryAverageColumns: [],
    fileName: clean(fileName),
    reason: `No header row naming the student (Student ID, Local ID or Student Name) was found in the first ${IMPORT_LIMITS.headerSearchRows} rows.`,
  };
};

// --- The student's row ----------------------------------------------------------------------

const sameId = (left, right) => {
  const a = clean(left);
  const b = clean(right);
  if (!a || !b) return false;
  if (a === b) return true;
  return /^\d+$/.test(a) && /^\d+$/.test(b) && a.replace(/^0+/, '') === b.replace(/^0+/, '');
};

// The student's resolved name (first/last, displayName, googleName, legacy
// fields) — never an id: a nameless student offers no name candidates at all.
// A single full name is split for display so a "Last, First" SIS row can be
// offered; a name match is only ever a candidate the teacher confirms.
const nameKeys = (student) => {
  const record = student && typeof student === 'object' ? student : {};
  const { firstName: first, lastName: last } = studentNameParts(record);
  const display = resolveStudentIdentity(record).displayName;
  return new Set([
    first && last ? norm(`${last} ${first}`) : '',
    first && last ? norm(`${first} ${last}`) : '',
    display ? norm(display) : '',
  ].filter(Boolean));
};

const rowName = (row, columns) => {
  if (columns.name !== undefined) return clean(row[columns.name]);
  const last = columns.lastName !== undefined ? clean(row[columns.lastName]) : '';
  const first = columns.firstName !== undefined ? clean(row[columns.firstName]) : '';
  return [last, first].filter(Boolean).join(', ');
};

const toItem = ({ name, cell, category = null, pointsPossible = null, weight = null, dueDate = null }) => {
  const score = parseScoreCell(cell);
  let value = score.value;
  let pointsEarned = score.kind === 'points' ? score.earned : null;
  const possible = score.kind === 'points' ? score.possible : (Number.isFinite(pointsPossible) && pointsPossible > 0 ? pointsPossible : null);
  // A bare number beside a points-possible value is points earned — unless it
  // is larger than the possible points, in which case it can only be a percent.
  if (score.kind === 'number' && possible && possible !== 100 && score.value <= possible) {
    pointsEarned = score.value;
    value = Math.round((score.value / possible) * 1000) / 10;
  }
  return {
    name: clean(name).slice(0, IMPORT_LIMITS.itemName),
    category: clean(category).slice(0, IMPORT_LIMITS.category) || null,
    score: Number.isFinite(value) ? value : null,
    scoreText: score.text.slice(0, 20),
    scoreKind: score.kind,
    pointsEarned,
    pointsPossible: possible,
    weight: Number.isFinite(weight) ? weight : null,
    dueDate: clean(dueDate).slice(0, 20) || null,
    excused: score.kind === 'excused',
    blank: score.kind === 'blank',
  };
};

const categoriesFrom = (items, notes) => {
  const byName = new Map();
  items.forEach((item) => {
    if (!item.category) return;
    if (!byName.has(item.category)) byName.set(item.category, new Set());
    if (item.weight !== null) byName.get(item.category).add(item.weight);
  });
  return [...byName.entries()].map(([name, weights]) => {
    if (weights.size > 1) notes.push(`Category "${name}" has more than one weight in the file, so no weight is used for it.`);
    return { name, weight: weights.size === 1 ? [...weights][0] : null };
  });
};

/**
 * The selected student's gradebook items, and nothing about anyone else.
 * `confirmedRowIndex` is a row the teacher confirmed after a name match.
 */
export const extractStudentGradebook = ({ rows = [], layout, student, confirmedRowIndex = null, fileName = '' } = {}) => {
  const data = list(rows);
  const notes = [];
  // The district ID first, then the MathMaster id — unless it is a district
  // number this student's district ID was corrected away from.
  const ids = districtIdMatchKeys(student);
  const districtId = effectiveDistrictStudentId(student);
  const accountId = studentAccountIdOf(student);
  const supersededId = accountIdIsSupersededDistrictId(student) ? accountId : '';
  const supersededNote = () => `A row carries ${accountId ? `MathMaster ID ${accountId}` : 'this student’s MathMaster ID'}, which is not this student’s district ID (it was corrected to district ID ${districtId}), so that row is not used. It may be from a file made before the correction, or belong to another student.`;
  const empty = { matchedBy: null, items: [], categories: [], categoryAverages: [], officialAverage: null, otherStudentRowsDiscarded: 0, nameCandidates: [], notes };

  if (!layout || layout.layout === GRADEBOOK_LAYOUT.UNKNOWN) return { ...empty, notes: [layout?.reason || 'The file layout was not recognised.'] };

  if (layout.layout === GRADEBOOK_LAYOUT.MATHMASTER_TEAMS) {
    const match = data.findIndex((row) => ids.some((id) => sameId(row[0], id)));
    notes.push('This is a MathMaster grade export (a TEAMS upload file). It shows what MathMaster sent, not what the official gradebook holds.');
    if (match < 0 && supersededId && data.some((row) => sameId(row[0], supersededId))) notes.push(supersededNote());
    if (match < 0) return { ...empty, otherStudentRowsDiscarded: data.length, notes };
    return {
      ...empty,
      matchedBy: 'sis-id',
      items: [toItem({ name: clean(fileName || layout.fileName) || 'MathMaster grade file', cell: data[match][1] })],
      otherStudentRowsDiscarded: data.length - 1,
      notes,
    };
  }

  const { columns, headerIndex } = layout;
  const metadataIndexes = new Set(Object.values(layout.metadataRows || {}));
  const dataRows = data
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter(({ rowIndex }) => rowIndex > headerIndex && !metadataIndexes.has(rowIndex));
  const idOf = (row) => (columns.studentId !== undefined ? clean(row[columns.studentId]) : '');

  let matched = [];
  let matchedBy = null;
  if (Number.isInteger(confirmedRowIndex) && dataRows.some((entry) => entry.rowIndex === confirmedRowIndex)) {
    const confirmed = dataRows.find((entry) => entry.rowIndex === confirmedRowIndex);
    const key = idOf(confirmed.row) || rowName(confirmed.row, columns);
    matched = dataRows.filter((entry) => (idOf(entry.row) || rowName(entry.row, columns)) === key);
    matchedBy = 'teacher-confirmed-row';
  } else if (columns.studentId !== undefined) {
    const sis = districtId ? dataRows.filter((entry) => sameId(idOf(entry.row), districtId)) : [];
    const accountKey = ids.includes(accountId) ? accountId : '';
    const local = sis.length || !accountKey ? sis : dataRows.filter((entry) => sameId(idOf(entry.row), accountKey));
    matched = local;
    if (local.length) matchedBy = sis.length ? 'sis-id' : 'mathmaster-id';
    if (!local.length && supersededId && dataRows.some((entry) => sameId(idOf(entry.row), supersededId))) notes.push(supersededNote());
  }

  const studentKeys = new Set(dataRows.map(({ row }) => idOf(row) || norm(rowName(row, columns))).filter(Boolean));
  const matchedKey = matched.length ? (idOf(matched[0].row) || norm(rowName(matched[0].row, columns))) : null;
  const otherStudentRowsDiscarded = [...studentKeys].filter((key) => key !== matchedKey).length;

  if (!matched.length) {
    const keys = nameKeys(student);
    const nameCandidates = dataRows
      .filter(({ row }) => keys.has(norm(rowName(row, columns))))
      .slice(0, 3)
      .map(({ row, rowIndex }) => ({ rowIndex, name: rowName(row, columns) }));
    if (!nameCandidates.length) notes.push('No row in this file carries the student\'s SIS id or MathMaster id.');
    else notes.push('A row with the student\'s name was found. Names are not unique, so it is used only if you confirm it.');
    return { ...empty, otherStudentRowsDiscarded: studentKeys.size, nameCandidates, notes };
  }
  if (layout.layout === GRADEBOOK_LAYOUT.WIDE && matched.length > 1) notes.push('The student appears on more than one row; the first row is used.');

  let items = [];
  let officialAverage = null;
  let categoryAverages = [];
  if (layout.layout === GRADEBOOK_LAYOUT.WIDE) {
    const { row } = matched[0];
    const meta = (kind, index) => (layout.metadataRows?.[kind] !== undefined ? data[layout.metadataRows[kind]][index] : null);
    items = layout.itemColumns.map(({ index, name }) => toItem({
      name,
      cell: row[index],
      category: meta('category', index),
      pointsPossible: numberOf(meta('pointsPossible', index)),
      weight: numberOf(meta('weight', index)),
      dueDate: meta('dueDate', index),
    }));
    if (columns.officialAverage !== undefined) officialAverage = numberOf(row[columns.officialAverage]);
    categoryAverages = list(layout.categoryAverageColumns)
      .map(({ index, name }) => ({ name, average: numberOf(row[index]) }))
      .filter((entry) => entry.average !== null);
  } else {
    matched.forEach(({ row }) => {
      const name = clean(row[columns.item]);
      if (!name) return;
      if (isOfficialAverageHeader(name)) { officialAverage = numberOf(row[columns.score]); return; }
      const categoryAverage = categoryAverageName(name);
      if (categoryAverage && AVERAGE_WORD.test(norm(name))) {
        const average = numberOf(row[columns.score]);
        if (average !== null) categoryAverages.push({ name: categoryAverage, average });
        return;
      }
      items.push(toItem({
        name,
        cell: row[columns.score],
        category: columns.category !== undefined ? row[columns.category] : null,
        pointsPossible: columns.pointsPossible !== undefined ? numberOf(row[columns.pointsPossible]) : null,
        weight: columns.weight !== undefined ? numberOf(row[columns.weight]) : null,
        dueDate: columns.dueDate !== undefined ? row[columns.dueDate] : null,
      }));
    });
  }
  if (items.length > IMPORT_LIMITS.maxItems) {
    notes.push(`Only the first ${IMPORT_LIMITS.maxItems} items are used.`);
    items = items.slice(0, IMPORT_LIMITS.maxItems);
  }
  return {
    matchedBy,
    items,
    categories: categoriesFrom(items, notes),
    categoryAverages,
    officialAverage,
    otherStudentRowsDiscarded,
    nameCandidates: [],
    notes,
  };
};

export default extractStudentGradebook;

// --- Teacher-corrected column roles ------------------------------------------------------------

export const COLUMN_ROLES = Object.freeze({
  wide: ['ignore', 'studentId', 'name', 'lastName', 'firstName', 'item', 'officialAverage'],
  long: ['ignore', 'studentId', 'name', 'lastName', 'firstName', 'item', 'score', 'pointsPossible', 'category', 'weight', 'dueDate'],
});

export const COLUMN_ROLE_LABEL = Object.freeze({
  ignore: 'Not used',
  studentId: 'Student ID',
  name: 'Student name',
  lastName: 'Last name',
  firstName: 'First name',
  item: 'Gradebook item',
  score: 'Score',
  pointsPossible: 'Points possible',
  category: 'Category',
  weight: 'Category weight',
  dueDate: 'Due date',
  officialAverage: 'Official average',
});

/** The role each header column plays in a detected layout. */
export const columnRolesFromLayout = (layout, header = []) => {
  const columns = layout?.columns || {};
  const items = new Set(list(layout?.itemColumns).map((column) => column.index));
  return list(header).map((cell, index) => {
    const key = Object.keys(columns).find((name) => columns[name] === index);
    if (key) return key;
    return items.has(index) ? 'item' : 'ignore';
  });
};

/**
 * A layout rebuilt from roles the teacher chose. Nothing is inferred: a column
 * is an item only if the teacher (or the detection they accepted) says so.
 */
export const applyColumnRoles = (layout, header = [], roles = []) => {
  if (!layout || ![GRADEBOOK_LAYOUT.WIDE, GRADEBOOK_LAYOUT.LONG].includes(layout.layout)) return layout;
  const allowed = new Set(COLUMN_ROLES[layout.layout]);
  const columns = {};
  const itemColumns = [];
  list(roles).forEach((role, index) => {
    if (!allowed.has(role) || role === 'ignore') return;
    if (role === 'item' && layout.layout === GRADEBOOK_LAYOUT.WIDE) {
      itemColumns.push({ index, name: clean(header[index]).slice(0, IMPORT_LIMITS.itemName) || `Column ${index + 1}` });
      return;
    }
    if (columns[role] === undefined) columns[role] = index;
  });
  const hasStudent = columns.studentId !== undefined || columns.name !== undefined || columns.lastName !== undefined;
  const complete = layout.layout === GRADEBOOK_LAYOUT.LONG ? columns.item !== undefined && columns.score !== undefined : itemColumns.length > 0 || columns.officialAverage !== undefined;
  return {
    ...layout,
    columns,
    itemColumns: itemColumns.slice(0, IMPORT_LIMITS.maxItems),
    categoryAverageColumns: layout.layout === GRADEBOOK_LAYOUT.WIDE ? list(layout.categoryAverageColumns).filter((column) => !itemColumns.some((item) => item.index === column.index) && roles[column.index] === 'ignore') : [],
    reason: hasStudent && complete ? '' : 'Choose a student column and, for this layout, the item and score columns.',
    teacherAdjusted: true,
  };
};

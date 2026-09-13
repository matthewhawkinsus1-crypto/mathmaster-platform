// Firestore does not allow an array to contain another array directly.
// Path table stimuli are authored naturally as rows of cells (a 2-D array),
// so convert that storage boundary into an array of row maps. Maps may
// contain arrays, which preserves the table exactly while remaining valid
// Firestore data. Readers accept both the authored legacy shape and this
// persisted shape so the conversion is backward-compatible.
//
// Firestore also rejects `undefined` anywhere inside a document. Path
// authoring uses ordinary JavaScript objects, where optional properties may
// legitimately be undefined. Strip those values at the Firestore boundary.
// For arrays, preserve positions by converting an undefined slot to null.

function primitiveCell(value) {
  if (value === null) return null;
  if (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }
  if (value === undefined) return '';
  return String(value);
}

function cellsForRow(row) {
  if (Array.isArray(row)) return row;
  if (row && typeof row === 'object' && Array.isArray(row.cells)) return row.cells;
  return [];
}

/**
 * Normalize table rows everywhere in a Path record, not only at the top-level
 * stimulus.
 *
 * Families may carry alternate stimuli inside `variants[]`. The old storage
 * boundary only rewrote `record.stimulus.table.rows`, which meant a variant
 * with `rows: [[...], [...]]` passed issuer validation and then caused the
 * entire Firestore batch to fail with:
 *
 *   INVALID_ARGUMENT: Property array contains an invalid nested entity.
 *
 * Recurse through plain authored objects/arrays and rewrite every table.rows
 * collection to row maps. A row map may contain its `cells` array, so the
 * resulting shape is legal Firestore data and remains readable by the existing
 * row helpers.
 */
function normalizeTableRowsDeep(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeTableRowsDeep(entry));
  }

  if (!value || typeof value !== 'object') return value;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;

  const output = {};
  Object.entries(value).forEach(([key, entry]) => {
    output[key] = normalizeTableRowsDeep(entry);
  });

  if (
    output.table
    && typeof output.table === 'object'
    && !Array.isArray(output.table)
    && Array.isArray(output.table.rows)
  ) {
    output.table = {
      ...output.table,
      rows: output.table.rows.map((row) => ({
        cells: cellsForRow(row).map(primitiveCell),
      })),
    };
  }

  return output;
}

function firestoreSafeValue(value, inArray = false) {
  if (value === undefined) return inArray ? null : undefined;
  if (value === null) return null;

  const valueType = typeof value;

  if (
    valueType === 'string'
    || valueType === 'number'
    || valueType === 'boolean'
  ) {
    return value;
  }

  if (valueType === 'bigint') return String(value);

  if (Array.isArray(value)) {
    return value.map((entry) => {
      const safe = firestoreSafeValue(entry, true);
      return safe === undefined ? null : safe;
    });
  }

  if (valueType === 'object') {
    // Preserve Firestore-native/special class instances such as Timestamp,
    // GeoPoint, DocumentReference, Date, and FieldValue. Path seed content is
    // otherwise composed of plain objects.
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;

    const output = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (entry === undefined) return;
      const safe = firestoreSafeValue(entry, false);
      if (safe !== undefined) output[key] = safe;
    });
    return output;
  }

  return inArray ? null : undefined;
}

function firestoreSafeStimulus(stimulus) {
  if (!stimulus || typeof stimulus !== 'object') return stimulus;
  return firestoreSafeValue(normalizeTableRowsDeep(stimulus));
}

function firestoreSafePathRecord(record) {
  if (!record || typeof record !== 'object') return record;

  // Normalize BEFORE the generic Firestore-safe walk so a table nested inside a
  // variant is converted just like a top-level table.
  return firestoreSafeValue(normalizeTableRowsDeep(record));
}

module.exports = {
  firestoreSafeValue,
  cellsForRow,
  normalizeTableRowsDeep,
  firestoreSafeStimulus,
  firestoreSafePathRecord,
};

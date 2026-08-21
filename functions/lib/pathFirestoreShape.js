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

function firestoreSafeStimulus(stimulus) {
  if (!stimulus || typeof stimulus !== 'object') return stimulus;

  let normalized = stimulus;

  if (
    stimulus.table
    && typeof stimulus.table === 'object'
    && Array.isArray(stimulus.table.rows)
  ) {
    normalized = {
      ...stimulus,
      table: {
        ...stimulus.table,
        rows: stimulus.table.rows.map((row) => ({
          cells: cellsForRow(row).map(primitiveCell),
        })),
      },
    };
  }

  return firestoreSafeValue(normalized);
}

function firestoreSafePathRecord(record) {
  if (!record || typeof record !== 'object') return record;

  return firestoreSafeValue({
    ...record,
    stimulus: firestoreSafeStimulus(record.stimulus),
  });
}

module.exports = {
  firestoreSafeValue,
  cellsForRow,
  firestoreSafeStimulus,
  firestoreSafePathRecord,
};

// Firestore does not allow an array to contain another array directly.
// Path table stimuli are authored naturally as rows of cells (a 2-D array),
// so convert only that storage boundary into an array of row maps. Maps may
// contain arrays, which preserves the table exactly while remaining valid
// Firestore data. Readers accept both the authored legacy shape and this
// persisted shape so the conversion is backward-compatible.

function primitiveCell(value) {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
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
  if (!stimulus.table || typeof stimulus.table !== 'object' || !Array.isArray(stimulus.table.rows)) {
    return stimulus;
  }
  return {
    ...stimulus,
    table: {
      ...stimulus.table,
      rows: stimulus.table.rows.map((row) => ({
        cells: cellsForRow(row).map(primitiveCell),
      })),
    },
  };
}

function firestoreSafePathRecord(record) {
  if (!record || typeof record !== 'object') return record;
  return {
    ...record,
    stimulus: firestoreSafeStimulus(record.stimulus),
  };
}

module.exports = {
  cellsForRow,
  firestoreSafeStimulus,
  firestoreSafePathRecord,
};

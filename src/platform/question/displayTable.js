/*
 * THE TABLE A QUESTION SHOWS — one model for the screen and for Read aloud
 * (pass 3, wave 7: Read aloud skipped tables).
 *
 *   displayTableFor(question, { editable }) → { columns: [{ key, label }], rows: [[cell]] } | null
 *
 * QuestionVisual draws the read-only table any question may carry; TableGrader
 * draws a fillable one from the same field. The reader (questionReading.js)
 * reads the same rows, so it can never read a cell the screen does not show.
 *
 * A cell the student fills in (`table.answers` or `table.blanks`, the keys
 * `${row}:${column.key}`) is `null`: never its value. On a fillable table that
 * value is the answer, whatever the row data holds.
 *
 * Pure: no React.
 */

const BLANK = null;

const editableKeySet = (table) => new Set([
  ...Object.keys(table.answers && typeof table.answers === 'object' ? table.answers : {}),
  ...(Array.isArray(table.blanks) ? table.blanks.map(String) : []),
]);

/**
 * `editable`: the fillable table (TableGrader) — its columns come from
 * `table.columns` only, as TableGrader draws them. Otherwise the read-only
 * table, from `columns` or `headers` as QuestionVisual draws it.
 */
export const displayTableFor = (question, { editable = false } = {}) => {
  const table = question?.table;
  if (!table || typeof table !== 'object' || Array.isArray(table)) return null;

  const columns = Array.isArray(table.columns) && table.columns.length
    ? table.columns.map((column, index) => ({
        key: String(column?.key ?? index),
        // TableGrader heads a column with `label || key`; QuestionVisual with `label ?? key`.
        label: String((editable ? column?.label || column?.key : column?.label ?? column?.key) ?? `Column ${index + 1}`),
      }))
    : (!editable && Array.isArray(table.headers) ? table.headers : []).map((header, index) => ({
        key: String(index),
        label: String(header ?? `Column ${index + 1}`),
      }));
  if (!columns.length) return null;

  const rawRows = Array.isArray(table.rows) ? table.rows : [];
  const filled = editableKeySet(table);
  const rows = rawRows.map((row, rowIndex) => columns.map((column, columnIndex) => {
    if (filled.has(`${rowIndex}:${column.key}`)) return BLANK;
    // The header shape pairs positionally, so column keys are the indices.
    const value = Array.isArray(row) ? row[columnIndex] : (row && typeof row === 'object' ? row[column.key] : undefined);
    return value === null || value === undefined || value === '' ? BLANK : value;
  }));
  if (!rows.length) return null;

  return { columns, rows };
};

export default displayTableFor;

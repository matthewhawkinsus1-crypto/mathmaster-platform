"use strict";

// Calculator work is a bounded student-authored draft, never grading evidence.
function sanitizeSecureExamToolDraft(toolState) {
  const source = toolState?.linearRegression;
  const rows = Array.isArray(source?.rows) ? source.rows.map((row) => Array.isArray(row) ? row : row?.cells) : [];
  if (rows.length !== 6 || !rows.every((row) => Array.isArray(row) && row.length === 2
    && row.every((cell) => typeof cell === "string" || typeof cell === "number"))) return null;
  return { linearRegression: {
    rows: rows.map((row) => ({ cells: row.map((cell) => String(cell).slice(0, 40)) })),
    ran: source.ran === true,
  } };
}
module.exports = { sanitizeSecureExamToolDraft };

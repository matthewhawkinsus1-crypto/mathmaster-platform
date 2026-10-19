/*
 * THE MATRICES A QUESTION SHOWS, AND HOW THEY ARE LAID OUT.
 *
 * A question of any ordinary type may carry named `matrices` to show the
 * student — the lacrosse team's November and December sales, a system's
 * coefficient matrix:
 *
 *   "matrices": { "Nov": { "rows": [[230, 112], …], "rowLabels": ["$20 cards", …],
 *                          "colLabels": ["Gas", "Grocery"], "caption": "November" } },
 *   "matrixLayout": ["Nov", "+", "Dec"]
 *
 * `matrixLayout` is optional: a list of matrix names and the symbols between
 * them (+, ·, =). Without it every matrix is drawn in authored order. A name
 * the layout uses that is not a matrix is dropped, and so is a matrix with no
 * rows, so a half-written question never draws an empty bracket.
 *
 * Pure: QuestionVisual renders the result, the tests read it.
 */
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value) => String(value ?? '').trim();

const readMatrix = (name, spec) => {
  const source = Array.isArray(spec) ? { rows: spec } : (isObject(spec) ? spec : null);
  if (!source || !Array.isArray(source.rows) || !source.rows.length) return null;
  // A saved row is { cells: [...] } (Firestore holds no array inside an array).
  const cellsOf = (row) => (Array.isArray(row) ? row : (isObject(row) && Array.isArray(row.cells) ? row.cells : []));
  const rows = source.rows.map((row) => cellsOf(row).map((cell) => text(cell)));
  if (!rows[0].length || rows.some((row) => row.length !== rows[0].length)) return null;
  const labels = (value, length) => (Array.isArray(value) && value.length === length ? value.map(text) : null);
  return {
    name: source.showName === false ? '' : text(source.displayName || name),
    rows,
    rowLabels: labels(source.rowLabels, rows.length),
    colLabels: labels(source.colLabels, rows[0].length),
    rowTitle: text(source.rowTitle) || null,
    colTitle: text(source.colTitle) || null,
    caption: text(source.caption) || null,
  };
};

export const readDisplayMatrices = (question) => {
  const source = isObject(question?.matrices) ? question.matrices : null;
  if (!source) return [];
  const matrices = Object.fromEntries(Object.entries(source)
    .map(([name, spec]) => [name, readMatrix(name, spec)])
    .filter(([, matrix]) => matrix));
  const layout = Array.isArray(question?.matrixLayout) && question.matrixLayout.length
    ? question.matrixLayout.map(text).filter(Boolean)
    : Object.keys(matrices);
  return layout
    .map((entry) => (matrices[entry] ? { kind: 'matrix', name: entry, matrix: matrices[entry] } : { kind: 'symbol', text: entry }))
    .filter((entry, index, all) => entry.kind === 'matrix' || (index > 0 && index < all.length - 1 && /^[+−\-·×=]$/.test(entry.text)));
};

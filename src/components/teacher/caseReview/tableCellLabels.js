/*
 * ON A PHONE, EVERY TABLE ROW IS A CARD — EACH VALUE UNDER ITS COLUMN'S NAME.
 *
 * caseReview.css stacks the case review's tables at phone width and prints
 * each cell's column name from its `data-label`. This copies the header text
 * onto every body cell of every table under `root`, so no tab repeats its
 * column names cell by cell, and a renamed column can never leave a stale
 * label behind. Presentation only: it reads header text and writes one
 * attribute; no record, value or answer is read.
 */

const headerLabels = (table) => {
  const row = table?.tHead?.rows?.[0];
  if (!row) return null;
  const labels = [];
  [...row.cells].forEach((cell) => {
    const text = String(cell.textContent ?? '').replace(/\s+/g, ' ').trim();
    const span = Math.max(1, Number(cell.colSpan) || 1);
    for (let index = 0; index < span; index += 1) labels.push(text);
  });
  return labels;
};

/** Label every body cell under `root` with its column's header. Idempotent; returns how many cells changed. */
export const labelTableCells = (root) => {
  if (!root?.querySelectorAll) return 0;
  let changed = 0;
  root.querySelectorAll('table').forEach((table) => {
    const labels = headerLabels(table);
    if (!labels) return;
    [...(table.tBodies || [])].forEach((body) => {
      [...body.rows].forEach((row) => {
        let column = 0;
        [...row.cells].forEach((cell) => {
          const label = labels[column] ?? '';
          if (cell.getAttribute('data-label') !== label) {
            cell.setAttribute('data-label', label);
            changed += 1;
          }
          column += Math.max(1, Number(cell.colSpan) || 1);
        });
      });
    });
  });
  return changed;
};

/**
 * Keep `root`'s tables labelled while rows come and go (a page, a filter, a
 * rebuild). Returns the function that stops watching.
 */
export const keepTableCellsLabelled = (root) => {
  if (!root) return () => {};
  labelTableCells(root);
  if (typeof MutationObserver === 'undefined') return () => {};
  // Writing an attribute is not a childList or text change, so this never
  // triggers itself.
  const observer = new MutationObserver(() => labelTableCells(root));
  observer.observe(root, { childList: true, characterData: true, subtree: true });
  return () => observer.disconnect();
};

export default labelTableCells;

// THE "ADD ITEM" MENU, AS PURE FUNCTIONS (KEYBOARD_SWEEP.md T5).
//
// Two halves, both pure so node can test them without React:
//
//   1. Which item the keyboard is on. The menu follows the WAI-ARIA menu
//      button pattern: opening it focuses the first item (ArrowUp on the
//      trigger: the last); ArrowDown / ArrowUp move with wrap; Home / End.
//      Disabled items are skipped — they stay native `disabled` buttons so a
//      pointer press on them does exactly what it always did (nothing).
//
//   2. What choosing an item does to the calculator. A pointer click and a
//      keyboard Enter / Space on a menu item both reach the item's onClick,
//      which calls `resolveAddMenuChoice` — so the state a key records is the
//      state a click records, by construction. The component applies the
//      returned outcome; it does not compute rows itself.

export const ADD_MENU_ITEMS = Object.freeze(['expression', 'table', 'inference']);

const isBlankExpression = (row) => row?.type === 'expression' && !String(row.value).trim();

// Which items can be chosen right now, in ADD_MENU_ITEMS order.
export const addMenuEnabled = (rows = []) => ADD_MENU_ITEMS.map((item) => (
  item === 'expression' ? true
    : item === 'table' ? !rows.some((row) => row.type === 'table')
      : false
));

const enabledIndexes = (enabled) => enabled.map((on, index) => (on ? index : -1)).filter((index) => index >= 0);

// The item focused when the menu opens. `key` is the key that opened it, or
// null for a pointer click: ArrowUp opens on the last item, everything else on
// the first.
export const addMenuOpenIndex = (key, enabled) => {
  const indexes = enabledIndexes(enabled);
  if (!indexes.length) return -1;
  return key === 'ArrowUp' ? indexes.at(-1) : indexes[0];
};

// The item a key moves to from `current`, or null when the key does not move.
export const addMenuMoveIndex = (key, current, enabled) => {
  const indexes = enabledIndexes(enabled);
  if (!indexes.length) return null;
  if (key === 'Home') return indexes[0];
  if (key === 'End') return indexes.at(-1);
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return null;
  const position = indexes.indexOf(current);
  if (position < 0) return key === 'ArrowDown' ? indexes[0] : indexes.at(-1);
  const step = key === 'ArrowDown' ? 1 : -1;
  return indexes[(position + step + indexes.length) % indexes.length];
};

// Keys on the trigger that open the menu.
export const ADD_MENU_OPEN_KEYS = Object.freeze(['Enter', ' ', 'ArrowDown', 'ArrowUp']);

/*
 * What choosing `choice` does. Returns null when the choice changes nothing
 * but closing the menu (a table already exists), otherwise:
 *   { rows, selectedId, notice, events: [[type, detail]], focusId }
 * `rows` is the same array when the rows did not change.
 */
export const resolveAddMenuChoice = (choice, { rows, selectedId = null, sourceLength = 0, makeId }) => {
  if (choice === 'expression') {
    const existingBlank = rows.find(isBlankExpression);
    if (existingBlank) {
      return { rows, selectedId: existingBlank.id, notice: '', events: [], focusId: existingBlank.id };
    }
    const row = { id: makeId(), type: 'expression', value: '' };
    return { rows: [...rows, row], selectedId: row.id, notice: '', events: [['expressionAdded', {}]], focusId: row.id };
  }
  if (choice === 'table') {
    if (rows.some((row) => row.type === 'table')) return null;
    const table = {
      id: makeId(),
      type: 'table',
      rows: Array.from({ length: Math.max(4, sourceLength || 0) }, () => ['', '']),
    };
    const selectedIndex = rows.findIndex((row) => row.id === selectedId);
    const fallbackBlankIndex = rows.findIndex(isBlankExpression);
    const replaceIndex = selectedIndex >= 0 && isBlankExpression(rows[selectedIndex])
      ? selectedIndex
      : fallbackBlankIndex;
    const next = replaceIndex >= 0
      ? rows.map((row, index) => (index === replaceIndex ? table : row))
      : [...rows, table];
    if (!next.some(isBlankExpression)) {
      next.push({ id: makeId(), type: 'expression', value: '' });
    }
    return { rows: next, selectedId: table.id, notice: 'Table created.', events: [['tableCreated', { fromAddMenu: true }]], focusId: null };
  }
  return null;
};

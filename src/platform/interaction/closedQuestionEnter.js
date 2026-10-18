/*
 * ENTER ON A CLOSED QUESTION (student pass 3, Batch 5).
 *
 * A closed question with a way on (Next, Continue, the way back to a skipped
 * question) goes on with Enter — the "press Enter again to continue" its cards
 * promise. Enter on a control keeps that control's own meaning: a button
 * presses, a <summary> opens its details ("See why it works", "The hint you
 * read"), a radio, tab or option picks, a box types. Only Enter on the page,
 * the closed card or other plain text goes on.
 *
 *   'own'      the target is the way on itself: its own click does it
 *   'control'  another control owns this Enter
 *   'advance'  go on
 */
export const CLOSED_QUESTION_WAY_ON_SELECTOR = [
  '.mathmaster-bar-continue',
  '.mathmaster-success-next-question',
  '.mathmaster-section-completion-continue',
  '.mathmaster-go-back-question',
].join(', ');

export const ENTER_OWNER_SELECTOR = [
  'input', 'button', 'a[href]', 'select', 'textarea', 'summary', 'math-field',
  '[contenteditable="true"]', '[data-mm-enter-owner]',
  // Widgets that are not native controls but take keys of their own.
  ...['button', 'link', 'textbox', 'tab', 'radio', 'checkbox', 'switch', 'option', 'menuitem',
    'menuitemradio', 'menuitemcheckbox', 'combobox', 'listbox', 'slider', 'spinbutton',
    'treeitem', 'gridcell', 'searchbox'].map((role) => `[role="${role}"]`),
  // Anything put in the Tab order on purpose is something to operate.
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export const closedQuestionEnterAction = (target) => {
  if (target?.closest?.(CLOSED_QUESTION_WAY_ON_SELECTOR)) return 'own';
  if (target?.closest?.(ENTER_OWNER_SELECTOR)) return 'control';
  return 'advance';
};

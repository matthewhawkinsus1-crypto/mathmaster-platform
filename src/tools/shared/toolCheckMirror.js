/*
 * THE TOOL'S OWN CHECK, IN THE WORK VIEW RAIL (student pass 3, TOOL-13).
 *
 * Fifteen registry tools (RegisteredToolWorkView) each draw their own Check
 * button deep inside a mode component, and none published it to Work View, so
 * a student in Work View had to scroll back through the tool to find it. The
 * rail now offers that same button: the same words (the host's "Submit — uses
 * 1 of 3 tries" or "Record answer" when SubmitText puts them there), the same
 * disabled state, and pressing it presses the button. Nothing new is decided
 * here — on an exit ticket, quiz or test the tool's own press records the
 * attempt and withholds the verdict exactly as before, because it IS that
 * press.
 *
 * Which button: the one on screen marked as the tool's answer action
 * (data-primary-answer-action, data-mm-enter-action="submit") or, for the
 * tools whose button carries neither, data-work-view-check. Only one is on
 * screen at a time (one per mode).
 */
export const TOOL_CHECK_SELECTOR = [
  'button[data-primary-answer-action="true"]',
  'button[data-mm-enter-action="submit"]',
  'button[data-work-view-check="true"]',
].join(', ');

const onScreen = (button) => {
  try { return button.getClientRects().length > 0; } catch { return false; }
};

// Disabled for real: its own `disabled`, a `<fieldset disabled>` around it, or
// an `inert` ancestor (a closed question's work area is both). `button.disabled`
// alone reads the first only, so a closed question's Check looked live.
export const toolCheckButtonDisabled = (button) => {
  if (!button) return true;
  if (button.disabled) return true;
  try {
    if (typeof button.matches === 'function' && button.matches(':disabled')) return true;
  } catch { /* an old engine without :disabled on buttons */ }
  return Boolean(typeof button.closest === 'function' && button.closest('[inert]'));
};

export const findToolCheckButton = (root) => {
  if (!root?.querySelectorAll) return null;
  return [...root.querySelectorAll(TOOL_CHECK_SELECTOR)].find(onScreen) || null;
};

/** { label, disabled } of the tool's Check now, or null when it has none on screen. */
export const readToolCheck = (root) => {
  const button = findToolCheckButton(root);
  if (!button) return null;
  const label = String(button.textContent || '').replace(/\s+/g, ' ').trim();
  if (!label) return null;
  return { label, disabled: toolCheckButtonDisabled(button) };
};

export const sameToolCheck = (a, b) => (a === b) || Boolean(a && b && a.label === b.label && a.disabled === b.disabled);

/** The rail action for it: pressing it presses the tool's own button. */
export const toolCheckRailAction = (check, root) => (check ? {
  id: 'tool-check',
  label: check.label,
  disabled: check.disabled,
  // Already in the host's words (SubmitText): never relabelled again.
  spendsTry: false,
  onAction: () => {
    const button = findToolCheckButton(root);
    if (button && !toolCheckButtonDisabled(button)) button.click();
  },
} : null);

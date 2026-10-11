/**
 * Keyboard model for a single-select radio group (WAI-ARIA APG "Radio Group").
 *
 *   - One tab stop: the checked option, or the first option when none is.
 *   - ArrowDown / ArrowRight move to the next option, ArrowUp / ArrowLeft to
 *     the previous one, wrapping at the ends; Home / End go to the first /
 *     last. Moving focus also SELECTS the option it lands on.
 *   - Space selects the focused option.
 *
 * ASSESSMENT SAFETY: no key here ever submits. Selecting is not answering —
 * locking an answer in stays an explicit press of the screen's own submit
 * button. `radioGroupKeyAction` therefore has no "submit" outcome at all, and
 * Enter is deliberately not handled (a native button turns it into the same
 * click a pointer makes, which only selects).
 */

/** Index of the option that carries the group's single tab stop. */
export const radioTabStopIndex = (optionIds = [], value) => {
  if (!Array.isArray(optionIds) || optionIds.length === 0) return -1;
  const selected = optionIds.findIndex((id) => String(id) === String(value ?? ''));
  return selected >= 0 ? selected : 0;
};

/**
 * What a key does inside the group.
 * Returns { type: 'move', index } | { type: 'select', index } | null.
 */
export const radioGroupKeyAction = (key, currentIndex, count) => {
  const total = Number(count) || 0;
  if (total <= 0) return null;
  const current = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < total ? currentIndex : 0;
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return { type: 'move', index: (current + 1) % total };
    case 'ArrowUp':
    case 'ArrowLeft':
      return { type: 'move', index: (current - 1 + total) % total };
    case 'Home':
      return { type: 'move', index: 0 };
    case 'End':
      return { type: 'move', index: total - 1 };
    case ' ':
    case 'Spacebar':
      return { type: 'select', index: current };
    default:
      return null;
  }
};

import { useState } from 'react';

/*
 * A BUTTON THAT RUNS OUT OF THINGS TO DO WHILE FOCUSED KEEPS THE FOCUS.
 *
 * Undo disables itself on the press that takes back the last step. A natively
 * disabled button cannot hold focus, so the browser drops it to the page: a
 * student working by keyboard, or with a screen reader, loses their place at
 * exactly that moment and has to tab back from the top. While the button has
 * focus it therefore stays focusable and reports itself unavailable
 * (aria-disabled); as soon as focus moves on it is disabled as before.
 *
 * The caller must still ignore a press while it is unavailable — aria-disabled
 * does not stop a click.
 */
export const useFocusSafeDisabled = (enabled) => {
  const [focused, setFocused] = useState(false);
  return {
    disabled: !enabled && !focused,
    'aria-disabled': enabled ? undefined : 'true',
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  };
};

export default useFocusSafeDisabled;

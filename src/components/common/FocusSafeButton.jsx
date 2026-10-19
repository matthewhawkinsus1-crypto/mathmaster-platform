import React from 'react';
import { useFocusSafeDisabled } from './useFocusSafeDisabled.js';

/*
 * A BUTTON THAT MAY DISABLE ITSELF ON THE PRESS THAT USES IT UP.
 *
 * Clear, a tool's own Undo, "Place selected card here": each runs out of things
 * to do on the press that uses it, and a natively disabled button drops focus to
 * the page (useFocusSafeDisabled.js). This is that hook as a drop-in <button>:
 * `enabled` replaces `disabled`, a press while unavailable does nothing, and
 * every other prop passes through.
 */
const FocusSafeButton = React.forwardRef(function FocusSafeButton({ enabled = true, onClick, onFocus, onBlur, children, type = 'button', ...rest }, ref) {
  const availability = useFocusSafeDisabled(Boolean(enabled));
  return (
    <button
      ref={ref}
      type={type}
      {...rest}
      disabled={availability.disabled}
      aria-disabled={availability['aria-disabled']}
      onFocus={(event) => { availability.onFocus(); onFocus?.(event); }}
      onBlur={(event) => { availability.onBlur(); onBlur?.(event); }}
      onClick={(event) => { if (enabled) onClick?.(event); }}
    >
      {children}
    </button>
  );
});

export default FocusSafeButton;

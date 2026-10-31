import { useEffect } from 'react';

/*
 * CONTENT ON HOVER OR FOCUS CAN BE PUT AWAY (WCAG 1.4.13).
 *
 * While `active`, Escape anywhere on the page calls `dismiss`, without the
 * pointer or focus moving. It never takes the key (no preventDefault, no
 * stopPropagation): Escape still does whatever else it does where focus is,
 * so a dialog around the content still closes on the first press. The shared
 * plane's hover readout follows the same rule (CoordinatePlane.jsx).
 *
 * Pass a stable `dismiss` (a state setter wrapped in useCallback), or the
 * listener is attached again on every render.
 */
export const escapeDismissListener = (dismiss) => (event) => {
  if (event?.key === 'Escape') dismiss();
};

export default function useEscapeToDismiss(active, dismiss) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined;
    const listener = escapeDismissListener(dismiss);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [active, dismiss]);
}

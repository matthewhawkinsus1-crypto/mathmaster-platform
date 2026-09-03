import { useEffect, useState } from 'react';

/*
 * The window's current width, kept current.
 *
 * Read once at mount it is wrong the moment a Chromebook is rotated or a window
 * is resized, and every decision made from it — which layout to use, whether a
 * figure is worth opening at full size — silently keeps the answer for a screen
 * the student no longer has.
 *
 * Returns 0 where there is no window, so callers comparing against a minimum
 * width fall through to their embedded layout rather than throwing.
 */
const measure = () => (typeof window === 'undefined' ? 0 : Number(window.innerWidth) || 0);

export const useViewportWidth = () => {
  const [width, setWidth] = useState(measure);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const update = () => setWidth(measure());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return width;
};

export default useViewportWidth;

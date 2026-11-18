import { useLayoutEffect, useState } from 'react';

/*
 * WHAT "OPEN WORK VIEW" COVERS OF A PLANE, IN THE PLANE'S OWN UNITS.
 *
 * Work View's opener floats over the top right corner of the figure it opens
 * (EnlargeableFigure.jsx), which on a plane is the plot's corner: a curve's
 * name put there is drawn under the button (curveLabels.js keeps names clear of
 * this box). { left, right, top, bottom } in the plane's viewBox units, or null
 * where no opener lies over it (the figure is enlarged, or has none). Measured
 * only while `enabled` (a plane that names a curve), as the plane is laid out
 * and again when it changes size, which it does as Work View opens and closes;
 * the opener is looked up each time, since closing Work View draws a new one.
 */
const OPENER = ':scope > .mathmaster-work-view-opener';
// Room round the button, in viewBox units: a letter's ascender reaches over its box.
const ROOM = 8;

const sameBox = (a, b) => (a === b) || (Boolean(a) && Boolean(b)
  && ['left', 'right', 'top', 'bottom'].every((side) => Math.abs(a[side] - b[side]) < 0.5));

export const useCoveredByOpener = (planeRef, viewBoxWidth, enabled = true) => {
  const [covered, setCovered] = useState(null);
  useLayoutEffect(() => {
    const element = planeRef.current;
    const svg = element?.matches?.('svg') ? element : element?.querySelector?.('svg');
    if (!enabled || !svg) {
      setCovered(null);
      return undefined;
    }
    const measure = () => {
      const opener = svg.closest('.mathmaster-work-view-surface')?.querySelector(OPENER) || null;
      const plane = svg.getBoundingClientRect();
      const button = opener?.getBoundingClientRect();
      let next = null;
      if (button && plane.width > 0 && button.width > 0
        && button.right > plane.left && button.left < plane.right && button.bottom > plane.top && button.top < plane.bottom) {
        const unit = Number(viewBoxWidth) / plane.width;
        next = {
          left: (button.left - plane.left) * unit - ROOM,
          right: (button.right - plane.left) * unit + ROOM,
          top: (button.top - plane.top) * unit - ROOM,
          bottom: (button.bottom - plane.top) * unit + ROOM,
        };
      }
      setCovered((current) => (sameBox(current, next) ? current : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    // The button grows as its font loads, or with the text size.
    const opener = svg.closest('.mathmaster-work-view-surface')?.querySelector(OPENER);
    if (opener) observer.observe(opener);
    return () => observer.disconnect();
  }, [planeRef, viewBoxWidth, enabled]);
  return covered;
};

export default useCoveredByOpener;

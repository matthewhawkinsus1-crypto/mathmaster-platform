import { useLayoutEffect, useState } from 'react';

/*
 * HOW SMALL A PLANE IS DRAWN: ITS viewBox UNITS TO ONE CSS PIXEL.
 *
 * curveLabels.js keeps room round a curve's name in ems of the name's own text,
 * a gap the eye sees at any size a student reads a plane at. Drawn much smaller
 * (the graph workspace on its own on a phone, its board squeezed beside its
 * panel), that room is a pixel, and a name so close to a point's name reads as
 * part of it; told how small the plane is drawn, it keeps two pixels. 0 until
 * measured and where not `enabled` (a plane that names no curve): the room in
 * ems alone. Measured as the plane is laid out and again when it changes size,
 * as Work View opens and closes.
 */
export const useDrawnUnit = (planeRef, viewBoxWidth, enabled = true) => {
  const [unit, setUnit] = useState(0);
  useLayoutEffect(() => {
    const element = planeRef.current;
    const svg = element?.matches?.('svg') ? element : element?.querySelector?.('svg');
    if (!enabled || !svg) {
      setUnit(0);
      return undefined;
    }
    const measure = () => {
      const width = svg.getBoundingClientRect().width;
      const next = width > 0 ? Number(viewBoxWidth) / width : 0;
      setUnit((current) => (Math.abs(current - next) <= current * 0.005 ? current : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [planeRef, viewBoxWidth, enabled]);
  return unit;
};

export default useDrawnUnit;

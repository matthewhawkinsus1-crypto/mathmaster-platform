/*
 * PLANE TEXT A STUDENT CAN READ ON A PHONE.
 *
 * The plane is drawn in a 560-unit viewBox and scaled to its box, so text
 * authored at 11 units rendered at about 6–7 CSS px in a 390px phone column
 * (pass 3, TOOL-11). SVG text does not follow the large-text setting (by
 * decision, STUDENT_PUSH_N_LARGE_TEXT.md), so the plane keeps its own floor:
 * when the plane is drawn narrower than its viewBox, text grows in viewBox
 * units so it renders at no less than MIN_PLANE_TEXT_PX. It never shrinks, and
 * a wide plane keeps its authored size.
 */
export const MIN_PLANE_TEXT_PX = 12;
// Beyond this the labels would crowd the ticks they name.
const MAX_GROWTH = 2.25;

/** The viewBox font size that renders `authored` at no less than the floor. */
export const planeFontSize = (authored, viewBoxWidth, renderedWidth, floorPx = MIN_PLANE_TEXT_PX) => {
  const size = Number(authored);
  const rendered = Number(renderedWidth);
  const box = Number(viewBoxWidth);
  if (!(rendered > 0) || !(box > 0)) return size;
  const scale = rendered / box;
  if (size * scale >= floorPx) return size;
  return Math.round(Math.min(size * MAX_GROWTH, floorPx / scale) * 10) / 10;
};

/** The CSS px a viewBox font size renders at. */
export const renderedFontPx = (fontSize, viewBoxWidth, renderedWidth) => Number(fontSize) * (Number(renderedWidth) / Number(viewBoxWidth));

/*
 * Where a number below an axis sits. Its baseline is `authoredOffset` below
 * the axis at the authored size; text grown for a phone pushes it down by its
 * own size, so the digits never reach up over the axis line.
 */
export const baselineBelowAxis = (fontSize, authoredOffset, gap) => Math.max(Number(authoredOffset), Number(fontSize) + Number(gap));

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

/*
 * POINT DOTS A STUDENT CAN SEE ON A PHONE (PH09, finding C1-130).
 *
 * A dot is drawn in the same 560-unit viewBox, radius 6: 3.5 CSS px in a 390px
 * phone column, a 7px dot under a fingertip. It grows by the rule the text does
 * (never smaller, never more than 2.25 times, untouched where the plane is wide)
 * until the standard dot has a radius of 5 CSS px. Every dot grows by that same
 * factor, not to the same floor: Sequence Explorer draws its two series as a
 * radius 8 and a radius 5 dot, and that difference is a cue that does not
 * depend on colour. How far a press reaches to pick a point up is a separate
 * rule (a press is snapped to the grid first), and is not changed.
 */
export const MIN_PLANE_DOT_RADIUS_PX = 5;
export const STANDARD_PLANE_DOT_RADIUS = 6;

/** How many times larger a plane draws every dot: 1 where it is wide, up to 2.25. */
export const planeDotGrowth = (viewBoxWidth, renderedWidth) => (
  planeFontSize(STANDARD_PLANE_DOT_RADIUS, viewBoxWidth, renderedWidth, MIN_PLANE_DOT_RADIUS_PX) / STANDARD_PLANE_DOT_RADIUS
);

/** The CSS px a viewBox font size renders at. */
export const renderedFontPx = (fontSize, viewBoxWidth, renderedWidth) => Number(fontSize) * (Number(renderedWidth) / Number(viewBoxWidth));

/*
 * Where a number below an axis sits. Its baseline is `authoredOffset` below
 * the axis at the authored size; text grown for a phone pushes it down by its
 * own size, so the digits never reach up over the axis line.
 */
export const baselineBelowAxis = (fontSize, authoredOffset, gap) => Math.max(Number(authoredOffset), Number(fontSize) + Number(gap));

/*
 * WHERE THE ORIGIN'S "0" GOES (PH02).
 *
 * It sits below the x axis, left of the y axis, in small text. Phone text grows
 * (above), so on a 390px phone the "0" is 21 units tall and the first number
 * under the axis on the y axis ("-1", 23 units, one tick down, 30 units away)
 * starts before the "0" ends: the two were drawn through each other.
 *
 * The "0" keeps its place while nothing is there. When the first number under
 * the axis would touch it, it moves to the right of the y axis, in the row of
 * the numbers along the x axis; when the first of those would touch it there
 * too, it is left out: the axes and the numbers beside them still say where
 * zero is, and a "0" drawn over a number is worse than none.
 *
 * `firstBelow` is the first labelled y tick under the axis ({ y, text }, y in
 * viewBox units), `firstRight` the first labelled x tick right of it
 * ({ x, text }, x in viewBox units).
 */
const DIGIT_HEIGHT = 0.72;
// A digit's advance. A "-" is narrower; counting it as a digit errs toward moving.
const DIGIT_WIDTH = 0.56;
const GAP = 2;

const textBox = ({ left, right, baseline, fontSize, characters }) => {
  const width = characters * DIGIT_WIDTH * fontSize;
  return {
    left: left != null ? left : right - width,
    right: right != null ? right : left + width,
    top: baseline - DIGIT_HEIGHT * fontSize,
    bottom: baseline,
  };
};

const touches = (a, b) => a.left < b.right + GAP && a.right > b.left - GAP && a.top < b.bottom + GAP && a.bottom > b.top - GAP;

export const originLabelPlacement = ({ axisX, axisY, originFont, tickFont, firstBelow = null, firstRight = null }) => {
  const baseline = axisY + baselineBelowAxis(originFont, 15, 5);
  const onLeft = textBox({ right: axisX - 6, baseline, fontSize: originFont, characters: 1 });
  const below = firstBelow
    ? textBox({ right: axisX - 9, baseline: firstBelow.y + 4, fontSize: tickFont, characters: String(firstBelow.text).length })
    : null;
  if (!below || !touches(onLeft, below)) return { x: axisX - 6, y: baseline, anchor: 'end' };
  const onRight = textBox({ left: axisX + 6, baseline, fontSize: originFont, characters: 1 });
  const along = firstRight
    ? textBox({
      left: firstRight.x - (String(firstRight.text).length * DIGIT_WIDTH * tickFont) / 2,
      baseline: axisY + baselineBelowAxis(tickFont, 17, 6),
      fontSize: tickFont,
      characters: String(firstRight.text).length,
    })
    : null;
  if (!along || !touches(onRight, along)) return { x: axisX + 6, y: baseline, anchor: 'start' };
  return null;
};

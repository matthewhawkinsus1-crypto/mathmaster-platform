/*
 * DOES THE "OPEN WORK VIEW" BUTTON HAVE A ROW TO SHARE, OR DOES IT TAKE ONE (PH01).
 *
 * The button floats over the top-right corner of the work, and the first row of
 * the work (a heading, a tool's title) keeps clear of its width. That holds
 * while the row has room for both. It stops holding when the text grows: the
 * button is 160px wide at 100% text and 257px at 200%, on a 322px-wide work
 * area, and nothing readable fits in the 49px that is left.
 *
 * "Room" is measured in ems of the button's own text, so it grows with the text
 * the way the rows beside the button do: seven ems is about 90px at 100% and
 * 180px at 200%, enough for a short heading or the start of a title.
 *
 *   surfaceWidth   the width of the work area the button floats over
 *   openerWidth    the button's own width, without the gap kept beside it
 *   fontSize       the button's font size in px
 */
export const OPENER_MIN_ROOM_EM = 7;
// What the rows beside the button keep between them and it.
export const OPENER_GAP = 16;

export const openerSharesRow = ({ surfaceWidth, openerWidth, fontSize }) => {
  const room = Number(surfaceWidth) - (Number(openerWidth) + OPENER_GAP);
  const em = Number(fontSize) > 0 ? Number(fontSize) : 13;
  // A work area that has no width yet (not laid out) is not a reason to move the button.
  if (!(Number(surfaceWidth) > 0)) return true;
  return room >= OPENER_MIN_ROOM_EM * em;
};

export default openerSharesRow;

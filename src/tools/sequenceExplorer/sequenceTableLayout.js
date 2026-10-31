/*
 * HOW WIDE THE "BUILD THE SEQUENCE MODEL" TABLE'S COLUMN MUST BE (TL40,
 * finding D-52).
 *
 * The table is one row of boxes, one box per term, so it is as wide as the term
 * count makes it. Each box was 72px with 5px either side, and the screen put
 * the table beside the "Analyze the pattern" panel whenever the page was twice
 * 360px wide, whatever the table needed. Measured at 1366x768 in the question
 * stage, a six-term table (the DOL #3 Review, question 13) was 573px wide in a
 * 474px column: the fifth and sixth boxes sat past the column's edge, behind a
 * sideways scroll nobody is told about. Even the default five terms were cut.
 *
 * Two things now keep a box on the screen. The boxes are 56px (room for "−12.5"
 * or "−3/4" at 16px, and the keyboard and touch targets are unchanged: the
 * height is the same), so six terms are 453px and sit in the half-column a
 * laptop gives them. And the screen is told what the table needs: the columns
 * only go side by side when each is wide enough for it, and stack when they are
 * not (seven and eight terms at 1366), so a table is never wider than its
 * column. A page narrower than the table still scrolls it, as before, on a
 * phone: there the column is one row of the screen.
 *
 * Pure: no React, no DOM.
 */

/** The narrowest a term box is drawn. */
export const TABLE_BOX_MIN_WIDTH = 56;
/** Space either side of a box in its cell. */
export const TABLE_CELL_SIDE = 3;
/** One term across: its box and the space either side. */
export const TABLE_CELL_WIDTH = TABLE_BOX_MIN_WIDTH + 2 * TABLE_CELL_SIDE;
/** The row labels' column ("Domain input n" / "Output aₙ"), measured 81px, with room to spare. */
export const TABLE_LABEL_COLUMN = 88;
/** A panel's own padding, both sides (the table sits inside it). */
export const PANEL_PADDING = 34;
/** What a column holds when the table has few terms: the screen's usual minimum. */
export const COLUMN_FLOOR = 360;

/** The width (px) of the table for `count` terms, at the narrowest it is drawn. */
export const sequenceTableWidth = (count) => TABLE_LABEL_COLUMN + Math.max(0, Math.floor(Number(count) || 0)) * TABLE_CELL_WIDTH;

/**
 * The minimum width of each column of the two-panel layout: the table's width
 * and its panel's padding, and never less than the usual column.
 */
export const sequenceTableColumn = (count) => Math.max(COLUMN_FLOOR, sequenceTableWidth(count) + PANEL_PADDING);

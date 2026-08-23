import {
  BASELINE, ENGAGEMENT, INSTRUCTIONAL_BAND, PERFORMANCE_PROJECTION,
} from './studentLearningProfile.js';

/*
 * THE ONE COLOUR TABLE.
 *
 * This repository has carried up to five independently written tables mapping
 * the same performance vocabulary to colours. They were never identical, which
 * is how a student could read as one thing on the roster and another on the
 * standards dashboard in the same minute — the labels agreed and the colours
 * did not, and colour is what a teacher scanning a table actually reads.
 *
 *   "Do not display two different performance-band systems."
 *
 * These are exported as data rather than as a component because not everything
 * that needs the tone is a badge: a table cell, a heat map square and a
 * dashboard chip all need the same colour for the same meaning without
 * borrowing the badge's shape. What they must NOT do is invent the colour.
 *
 * THREE FAMILIES, DELIBERATELY DISTINCT.
 *
 *   Band       — where the student is working (Below / On / Above).
 *   Projection — where that points on the state assessment.
 *   Engagement — whether they are completing enough work to read at all.
 *
 * Engagement is drawn as an outline rather than a fill, on purpose. A student
 * can be Above Level and Needs Follow-Up at the same time; both are true,
 * neither implies the other, and if they shared a visual family a teacher would
 * read them as one combined verdict about the child.
 */

export const BAND_TONE = Object.freeze({
  [INSTRUCTIONAL_BAND.BELOW]: { bg: '#fdf1ec', fg: '#9a3412', border: '#f6d4c4' },
  [INSTRUCTIONAL_BAND.ON]: { bg: '#eef3fb', fg: '#174ea6', border: '#c9daf8' },
  [INSTRUCTIONAL_BAND.ABOVE]: { bg: '#eefaf1', fg: '#12633a', border: '#c3e8d1' },
  [BASELINE]: { bg: '#f3f4f6', fg: '#4b5563', border: '#dcdfe4' },
});

export const PROJECTION_TONE = Object.freeze({
  [PERFORMANCE_PROJECTION.DID_NOT_MEET]: { bg: '#fdecec', fg: '#9f1239', border: '#f6cdcd' },
  [PERFORMANCE_PROJECTION.APPROACHES]: { bg: '#fdf6e3', fg: '#854d0e', border: '#f0e0b4' },
  [PERFORMANCE_PROJECTION.MEETS]: { bg: '#eef3fb', fg: '#174ea6', border: '#c9daf8' },
  [PERFORMANCE_PROJECTION.MASTERS]: { bg: '#eefaf1', fg: '#12633a', border: '#c3e8d1' },
  [BASELINE]: { bg: '#f3f4f6', fg: '#4b5563', border: '#dcdfe4' },
});

export const ENGAGEMENT_TONE = Object.freeze({
  [ENGAGEMENT.ON_TRACK]: { bg: '#fff', fg: '#3c4043', border: '#dcdfe4' },
  [ENGAGEMENT.INCONSISTENT]: { bg: '#fff', fg: '#854d0e', border: '#f0e0b4' },
  [ENGAGEMENT.NEEDS_FOLLOW_UP]: { bg: '#fff', fg: '#9f1239', border: '#f6cdcd' },
});

/**
 * The legacy per-TEXAS-standard performance keys, mapped onto the same tones.
 *
 * The Standards dashboard speaks in `didNotMeet | approaches | meets | masters
 * | insufficient` and carried its own colours for them. The vocabulary was
 * already the profile's; only the table was separate. This is the bridge, so
 * there is one place to change a colour and it changes everywhere.
 */
export const legacyPerformanceTone = (key) => ({
  didNotMeet: PROJECTION_TONE[PERFORMANCE_PROJECTION.DID_NOT_MEET],
  approaches: PROJECTION_TONE[PERFORMANCE_PROJECTION.APPROACHES],
  meets: PROJECTION_TONE[PERFORMANCE_PROJECTION.MEETS],
  masters: PROJECTION_TONE[PERFORMANCE_PROJECTION.MASTERS],
  // "Insufficient" and "establishing baseline" are the same statement: we have
  // not seen enough to say. They must not be two different greys.
  insufficient: PROJECTION_TONE[BASELINE],
}[key] || PROJECTION_TONE[BASELINE]);

/** The chip style every surface shares, so a chip is a chip everywhere. */
export const toneChip = (tone, size = 'normal') => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: size === 'small' ? '2px 8px' : '4px 10px',
  borderRadius: 999,
  fontSize: size === 'small' ? 10.5 : 11.5,
  fontWeight: 900,
  letterSpacing: '.02em',
  lineHeight: 1.55,
  whiteSpace: 'nowrap',
  background: tone.bg,
  color: tone.fg,
  border: `1px solid ${tone.border}`,
});

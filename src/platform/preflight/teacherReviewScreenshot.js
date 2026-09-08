/*
 * Screenshots attached to a teacher's repair note.
 *
 * A written note says what is wrong; a screenshot shows it. Some faults are
 * almost impossible to describe and instant to point at — a graph whose labels
 * collide, a choice list that wraps off the card, a keypad covering the answer
 * box. The screenshot supplements the note, never replaces it: a picture with
 * no words tells a repairing AI nothing it can act on, and the note is what
 * becomes the repair constraint.
 *
 * WHERE THE BYTES LIVE, AND WHY NOT WITH THE NOTE.
 *
 * Review context is one document per teacher per assignment, and it is read
 * every time the review panel opens. Firestore documents stop at 1 MiB. Base64
 * image data inside that document would blow the limit after one or two
 * screenshots, and would make every read of a teacher's notes drag the images
 * along with it.
 *
 * So a flag carries a screenshot ID — a short string — and the image lives in
 * its own document in its own collection, fetched only when something actually
 * displays it.
 *
 * That split also settles the AI-cost requirement structurally rather than by
 * discipline. The compact repair package is built from the review context and
 * the question JSON. Because the image is not in either, no amount of editing
 * the package builder can accidentally start sending base64 to a model: there
 * is nothing there to send. A rule that has to be remembered eventually is not.
 */

const text = (value) => String(value ?? '').trim();

export const TEACHER_REVIEW_SCREENSHOTS_COLLECTION = 'assignmentReviewScreenshots';

/** What a browser can render inline and a phone camera roll actually produces. */
export const SCREENSHOT_MEDIA_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);

/*
 * Firestore's hard limit is 1 MiB for the whole document. The cap here is the
 * data URL, leaving room for the ownership and provenance fields beside it and
 * for the base64 expansion already counted in the string. Anything larger is
 * refused with an explanation rather than written and rejected by the server,
 * because a teacher pasting a 4K screenshot should be told to let MathMaster
 * shrink it, not shown a Firestore error.
 */
export const MAX_SCREENSHOT_DATA_URL_BYTES = 700_000;

const DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;

export const screenshotByteSize = (dataUrl) => {
  const value = text(dataUrl);
  const match = DATA_URL.exec(value);
  if (!match) return 0;
  // Bytes of the encoded string, which is what Firestore stores and counts.
  return value.length;
};

/**
 * Validate a captured screenshot and shape it for storage.
 *
 * Ownership is recorded on the document itself rather than inferred from where
 * it sits, so the rules can check it the same way the review notes are checked.
 */
export const buildTeacherReviewScreenshotRecord = ({
  dataUrl,
  ownerUid,
  assignmentId,
  questionId = null,
  flagId = null,
  screenshotId = null,
  capturedAt = new Date().toISOString(),
} = {}) => {
  const value = text(dataUrl);
  const match = DATA_URL.exec(value);
  if (!match) {
    throw new Error(`A review screenshot must be a base64 image data URL (${SCREENSHOT_MEDIA_TYPES.join(', ')}).`);
  }

  const owner = text(ownerUid);
  if (!owner) throw new Error('A review screenshot must record the teacher who captured it.');

  const assignment = text(assignmentId);
  if (!assignment) throw new Error('A review screenshot must record the assignment it belongs to.');

  const byteSize = screenshotByteSize(value);
  if (byteSize > MAX_SCREENSHOT_DATA_URL_BYTES) {
    throw new Error(
      `This screenshot is ${Math.round(byteSize / 1000)}KB, over the ${Math.round(MAX_SCREENSHOT_DATA_URL_BYTES / 1000)}KB limit for a single review image. Let MathMaster shrink it, or capture just the part of the screen that is wrong.`,
    );
  }

  return {
    id: text(screenshotId) || `shot_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
    ownerUid: owner,
    assignmentId: assignment,
    questionId: text(questionId) || null,
    flagId: text(flagId) || null,
    mediaType: match[1],
    byteSize,
    dataUrl: value,
    capturedAt: text(capturedAt) || new Date().toISOString(),
  };
};

const mapFlags = (context, flagId, update) => {
  const id = text(flagId);
  const flags = Array.isArray(context?.flags) ? context.flags : [];
  const index = flags.findIndex((flag) => text(flag?.id) === id);
  if (index === -1) throw new Error(`No teacher review flag with id "${flagId}" exists on this assignment.`);
  const next = flags.slice();
  next[index] = update(next[index]);
  return { ...context, flags: next };
};

/**
 * Point a flag at a stored screenshot.
 *
 * Only the ID is written onto the flag, which is what keeps the review context
 * small and keeps image data out of anything built from it.
 */
export const attachScreenshotToFlag = (context, flagId, screenshotId, { nowIso = new Date().toISOString() } = {}) => {
  const id = text(screenshotId);
  if (!id) throw new Error('Attaching a screenshot needs the stored screenshot id.');
  return mapFlags(context, flagId, (flag) => ({ ...flag, screenshotId: id, updatedAt: text(nowIso) }));
};

/**
 * Remove the reference. Replacing is detach-then-attach, so a replacement is
 * never half-applied: the flag points at exactly one screenshot or none.
 */
export const detachScreenshotFromFlag = (context, flagId, { nowIso = new Date().toISOString() } = {}) => (
  mapFlags(context, flagId, (flag) => ({ ...flag, screenshotId: null, updatedAt: text(nowIso) }))
);

export const screenshotIdForFlag = (flag) => text(flag?.screenshotId) || null;

/** Every screenshot referenced by a context, for loading them in one pass. */
export const screenshotIdsInContext = (context) => [...new Set(
  (Array.isArray(context?.flags) ? context.flags : [])
    .map(screenshotIdForFlag)
    .filter(Boolean),
)];

export default {
  TEACHER_REVIEW_SCREENSHOTS_COLLECTION,
  SCREENSHOT_MEDIA_TYPES,
  MAX_SCREENSHOT_DATA_URL_BYTES,
  screenshotByteSize,
  buildTeacherReviewScreenshotRecord,
  attachScreenshotToFlag,
  detachScreenshotFromFlag,
  screenshotIdForFlag,
  screenshotIdsInContext,
};

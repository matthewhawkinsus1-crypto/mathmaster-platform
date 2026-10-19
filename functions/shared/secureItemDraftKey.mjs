/*
 * WHERE A SECURE ITEM'S RICH TOOL KEEPS ITS WORK ON THE DEVICE.
 *
 * QuestionEngine and every registry tool persist unfinished work under one
 * `draftKey` (questionDraftStorage.js): a graph's points, an algebra
 * workspace's lines, a table's cells. On a secure item that key is built here,
 * from the secure session and the issued instance, so:
 *
 *   - the device copy survives a refresh, a Chromebook sleep, a dropped
 *     connection or a proctor lock, because it is ordinary draft storage;
 *   - the server copy (saveSecureExamDraft) accepts entries ONLY under this
 *     prefix, so a session can never be used to carry anything else back to a
 *     device, and a reopened Test on another device restores exactly this
 *     item's construction;
 *   - it deliberately does NOT match the `mathmaster:draft:v2:` format, so the
 *     ordinary assignment workspace sync never copies secure work into the
 *     general draft collection.
 *
 * Shared by the browser and Cloud Functions so the two can never disagree on
 * the prefix the server is willing to accept.
 */

export const SECURE_ITEM_DRAFT_PREFIX = 'mm-secure-work';

const part = (value) => encodeURIComponent(String(value ?? '').trim()).slice(0, 120);

/** The draft key of one issued secure item on one surface. */
export const secureItemDraftKey = ({ surface = 'exam', sessionId, questionInstanceId }) => (
  [SECURE_ITEM_DRAFT_PREFIX, part(surface), part(sessionId), part(questionInstanceId)].join(':')
);

/** True for a key that belongs to that item's draft family (the key or a child of it). */
export const belongsToSecureItemDraft = (key, draftKey) => {
  const text = String(key || '');
  return Boolean(draftKey) && (text === draftKey || text.startsWith(`${draftKey}:`));
};

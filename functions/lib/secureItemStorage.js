"use strict";

/*
 * HOW AN ISSUED RICH TOOL ITEM IS STORED ON A SECURE DOCUMENT.
 *
 * Firestore cannot hold an array directly inside an array, and a Rich Tool
 * item's two tool-shaped fields are full of them: the Data Modeling Lab's
 * private definition and public payload carry its points as [[x, y], …], a
 * Mapping Diagram's private definition its arrows the same way. Writing such
 * an item onto an exam session (its open `currentQuestion`, a recorded
 * response's `questionSnapshot`) or a correction plan (`activeQuestions`)
 * fails the whole transaction with "Cannot convert an array value in an array
 * value" — which is how the emulator certification found it.
 *
 * So those two fields are stored as ONE canonical JSON string each
 * (`privateGradingJson`, `toolJson`) — the same choice the durable tool
 * response contract made for student work — and decoded where they are read.
 * Every other field of the item is untouched, and a document written before
 * this encoding (plain `privateGrading`/`tool`) reads back exactly as it was.
 *
 * Plain CommonJS with no dependencies, so `secureExam.js` (synchronous) and
 * `secureItems.js` share it.
 */

const ENCODED_FIELDS = Object.freeze(["privateGrading", "tool"]);

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** The item as a secure document may store it. */
function storableItem(item) {
  if (!isObject(item)) return item;
  const stored = { ...item };
  ENCODED_FIELDS.forEach((field) => {
    if (stored[field] !== undefined && stored[field] !== null && typeof stored[field] === "object") {
      stored[`${field}Json`] = JSON.stringify(stored[field]);
      delete stored[field];
    }
  });
  return stored;
}

/** The item as it was before storage. Accepts either form. */
function readStoredItem(item) {
  if (!isObject(item)) return item;
  const read = { ...item };
  ENCODED_FIELDS.forEach((field) => {
    const key = `${field}Json`;
    if (typeof read[key] !== "string") return;
    try {
      const parsed = JSON.parse(read[key]);
      if (parsed !== null && typeof parsed === "object") read[field] = parsed;
    } catch {
      // An unreadable copy is left absent rather than half-parsed.
    }
    delete read[key];
  });
  return read;
}

module.exports = { ENCODED_FIELDS, readStoredItem, storableItem };

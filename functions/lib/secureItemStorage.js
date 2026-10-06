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
 * ONLY A FIELD THAT NEEDS IT IS ENCODED: one holding an array inside an array.
 * Everything else — every field-graded item, every SAT/ACT/TSIA2/ASVAB item,
 * most tool items — is stored exactly as before, so a function instance that
 * predates the codec (a deploy window, a rollback) reads it the way it always
 * did.
 *
 * AND AN ENCODED ITEM FAILS CLOSED ON SUCH AN INSTANCE. Left without a
 * `privateGrading`, an older grader would have scored the student's answer 0
 * without a word — spending an attempt and writing evidence. So the encoded
 * form keeps a stand-in that no grader accepts: the Path grader finds no
 * contract for its tool and refuses the response (nothing recorded), the field
 * grader cannot read its field and errors. `readStoredItem` replaces it with
 * the real definition.
 *
 * Plain CommonJS with no dependencies, so `secureExam.js` (synchronous) and
 * `secureItems.js` share it.
 */

const ENCODED_FIELDS = Object.freeze(["privateGrading", "tool"]);

/** What an encoded item's `privateGrading` reads as to code that predates the codec. */
const ENCODED_GRADING_STAND_IN = Object.freeze({ pathToolId: "__stored_as_json__", fields: Object.freeze([null]) });

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Whether Firestore would refuse this value: an array directly inside an array, at any depth. */
function holdsNestedArray(value, insideArray = false, depth = 0) {
  if (depth > 64 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    if (insideArray) return true;
    return value.some((entry) => holdsNestedArray(entry, true, depth + 1));
  }
  return Object.values(value).some((entry) => holdsNestedArray(entry, false, depth + 1));
}

/** The item as a secure document may store it. */
function storableItem(item) {
  if (!isObject(item)) return item;
  const stored = { ...item };
  ENCODED_FIELDS.forEach((field) => {
    if (holdsNestedArray(stored[field])) {
      stored[`${field}Json`] = JSON.stringify(stored[field]);
      if (field === "privateGrading") stored[field] = { ...ENCODED_GRADING_STAND_IN, fields: [null] };
      else delete stored[field];
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
      // An unreadable copy is never half-parsed: the stand-in stays, and every
      // grader refuses it.
    }
    delete read[key];
  });
  return read;
}

module.exports = { ENCODED_FIELDS, ENCODED_GRADING_STAND_IN, holdsNestedArray, readStoredItem, storableItem };

/*
 * HOW MANY BYTES FIRESTORE COUNTS TOWARD A DOCUMENT'S 1 MiB CAP.
 *
 * Firestore's storage size rules:
 *
 *   document   its name + every field + 32
 *   name       every collection and document id in its path, as a string, + 16
 *   field      its name, as a string, + its value
 *   string     its UTF-8 bytes + 1
 *   boolean, null                     1
 *   integer, double, timestamp        8
 *   geopoint                          16
 *   bytes      their length
 *   reference  the name of the document it points to
 *   map        every key, as a string, + every value
 *   array      every value
 *
 * This reads data as the Admin SDK returns it. It is an estimate the callers
 * leave far more room around than any difference from Firestore's own count.
 */
const DOCUMENT_CAP_BYTES = 1_048_576;

const stringBytes = (value) => Buffer.byteLength(String(value), "utf8") + 1;

const documentNameBytes = (documentPath) => String(documentPath || "")
  .split("/")
  .filter(Boolean)
  .reduce((total, segment) => total + stringBytes(segment), 16);

const isTimestamp = (value) => typeof value.toDate === "function"
  && typeof value.seconds === "number" && typeof value.nanoseconds === "number";
const isGeoPoint = (value) => typeof value.latitude === "number" && typeof value.longitude === "number"
  && typeof value.isEqual === "function";
const isReference = (value) => typeof value.path === "string" && typeof value.collection === "function";

function valueBytes(value) {
  if (value === null || value === undefined) return 1;
  switch (typeof value) {
    case "boolean": return 1;
    case "number":
    case "bigint": return 8;
    case "string": return stringBytes(value);
    case "object": break;
    default: return 1;
  }
  if (value instanceof Date || isTimestamp(value)) return 8;
  if (value instanceof Uint8Array) return value.length;
  if (isGeoPoint(value)) return 16;
  if (isReference(value)) return documentNameBytes(value.path);
  if (Array.isArray(value)) return value.reduce((total, item) => total + valueBytes(item), 0);
  let total = 0;
  for (const [key, item] of Object.entries(value)) total += stringBytes(key) + valueBytes(item);
  return total;
}

/** The bytes Firestore counts for the document at `documentPath` holding `data`. */
function firestoreDocumentBytes(documentPath, data) {
  return documentNameBytes(documentPath) + valueBytes(data && typeof data === "object" ? data : {}) + 32;
}

module.exports = {
  DOCUMENT_CAP_BYTES,
  documentNameBytes,
  firestoreDocumentBytes,
  valueBytes,
};

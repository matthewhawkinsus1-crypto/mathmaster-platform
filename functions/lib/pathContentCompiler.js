"use strict";

// THE canonical Path content compiler.
//
// Every Path question document that reaches Firestore passes through this one
// boundary: build-time certification, the production release control plane, the
// legacy seed importer, and the tests all call it. Before it existed, the
// "make this safe for Firestore" rules lived in more than one place and drifted,
// which is how a variant table reached production and failed the whole batch
// with a generic
//
//   INVALID_ARGUMENT: Property array contains an invalid nested entity.
//
// Two jobs live here and they are deliberately separate:
//
//   COMPILE   authored document -> the exact object that will be stored.
//   CERTIFY   stored object     -> every reason Firestore would reject it,
//                                 each with the exact property path.
//
// Compile never guesses. Where a storage shape is defined (a table's rows) it
// applies it; where authoring produced something with no legal storage shape
// (an arbitrary array of arrays) it FAILS with the property path rather than
// inventing a representation nobody reads back.

const crypto = require("crypto");

/**
 * Bumped when the compiled storage shape changes in a way that makes previously
 * compiled documents non-equivalent. The release manifest records it, and the
 * production release service refuses an artifact compiled by a schema it does
 * not support.
 */
const PATH_COMPILER_SCHEMA_VERSION = 2;

/** Every supported schema version this build can activate. */
const SUPPORTED_COMPILER_SCHEMA_VERSIONS = Object.freeze([2]);

const COMPILER_ERROR = Object.freeze({
  MISSING_DOCUMENT_ID: "path-compiler/missing-document-id",
  INVALID_DOCUMENT_ID: "path-compiler/invalid-document-id",
  NOT_AN_OBJECT: "path-compiler/not-an-object",
  NESTED_ARRAY: "firestore/nested-array",
  UNDEFINED_VALUE: "firestore/undefined-value",
  NON_FINITE_NUMBER: "firestore/non-finite-number",
  UNSUPPORTED_VALUE: "firestore/unsupported-value",
  UNSUPPORTED_PROTOTYPE: "firestore/unsupported-prototype",
  INVALID_FIELD_NAME: "firestore/invalid-field-name",
  DOCUMENT_TOO_LARGE: "firestore/document-too-large",
  CIRCULAR_REFERENCE: "path-compiler/circular-reference",
});

const COMPILER_ERROR_EXPLANATION = Object.freeze({
  [COMPILER_ERROR.MISSING_DOCUMENT_ID]:
    "Every Path question document needs a non-empty string id; this one has none.",
  [COMPILER_ERROR.INVALID_DOCUMENT_ID]:
    "Firestore document IDs cannot contain a slash, cannot be \".\" or \"..\", cannot use the reserved __name__ form, and must be under 1500 bytes.",
  [COMPILER_ERROR.NOT_AN_OBJECT]:
    "A Path question document must be a plain object.",
  [COMPILER_ERROR.NESTED_ARRAY]:
    "Firestore cannot store an array directly inside another array. Tables have a defined row-map storage shape; any other array of arrays has none, so authoring must name the rows.",
  [COMPILER_ERROR.UNDEFINED_VALUE]:
    "Firestore rejects undefined. Object keys holding undefined are dropped and array slots become null; a value that survives as undefined is a compiler defect.",
  [COMPILER_ERROR.NON_FINITE_NUMBER]:
    "NaN and Infinity are not storable Path content; a generator produced a non-finite number.",
  [COMPILER_ERROR.UNSUPPORTED_VALUE]:
    "Functions, symbols and other non-data values cannot be stored in Firestore.",
  [COMPILER_ERROR.UNSUPPORTED_PROTOTYPE]:
    "Only plain objects and the allowed Firebase value classes (Timestamp, GeoPoint, DocumentReference, FieldValue, Date, Buffer) may be stored.",
  [COMPILER_ERROR.INVALID_FIELD_NAME]:
    "Firestore reserves field names of the form __name__ and rejects empty field names.",
  [COMPILER_ERROR.DOCUMENT_TOO_LARGE]:
    "A single Firestore document must stay under 1 MiB including field names and overhead.",
  [COMPILER_ERROR.CIRCULAR_REFERENCE]:
    "The authored document contains a cycle, which cannot be stored or hashed.",
});

// Firestore's hard document ceiling is 1,048,576 bytes including field-name and
// per-field overhead. Certify below that so a document that only just fits the
// estimate cannot fail in production on overhead this estimate does not model.
const DOCUMENT_SIZE_LIMIT_BYTES = 1000000;
const DOCUMENT_ID_LIMIT_BYTES = 1500;
const RESERVED_NAME_PATTERN = /^__.*__$/;

/**
 * Firebase value classes that are legal Firestore field values even though they
 * are not plain objects. Recognised by constructor name so this module never
 * has to require firebase-admin — it stays a dependency-free, unit-testable
 * boundary that the browser-side tests can import too.
 */
const ALLOWED_VALUE_CLASSES = Object.freeze([
  "Timestamp",
  "GeoPoint",
  "DocumentReference",
  "FieldValue",
  "NumericIncrementTransform",
  "ServerTimestampTransform",
  "ArrayUnionTransform",
  "ArrayRemoveTransform",
  "DeleteTransform",
  "VectorValue",
  "Bytes",
]);

function isAllowedValueClass(value) {
  if (value instanceof Date) return true;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return true;
  if (value instanceof Uint8Array) return true;
  let constructorName = null;
  try {
    constructorName = value?.constructor?.name || null;
  } catch {
    return false;
  }
  if (constructorName && ALLOWED_VALUE_CLASSES.includes(constructorName)) return true;
  // Firestore sentinels created by FieldValue.* are instances of internal
  // transform classes whose names vary across SDK versions. Duck-type the
  // documented marker rather than pinning a private class list.
  if (constructorName && constructorName.endsWith("Transform")) return true;
  return false;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** `variants[2].stimulus.table.rows[1]` — the path a human can go and look at. */
function joinPath(parent, key) {
  if (typeof key === "number") return `${parent}[${key}]`;
  if (!parent) return String(key);
  return `${parent}.${key}`;
}

/** `items[3].variants[2].stimulus…` for a failure inside a whole package. */
function packagePath(index, path) {
  if (!path || path === "$") return `items[${index}]`;
  if (path.startsWith("[")) return `items[${index}]${path}`;
  if (path.startsWith("$.")) return `items[${index}].${path.slice(2)}`;
  return `items[${index}].${path}`;
}

function compilerError({ code, path, questionId = null, familyId = null, detail = null }) {
  return {
    code,
    path: path === "" ? "" : (path || "$"),
    questionId,
    familyId,
    message: detail
      ? `${COMPILER_ERROR_EXPLANATION[code] || code} (${detail})`
      : (COMPILER_ERROR_EXPLANATION[code] || code),
    detail,
  };
}

/** Human-readable one-liner used by the admin UI and the build report. */
function formatCompilerError(error = {}) {
  const location = error.path && error.path !== "$" ? ` at ${error.path}` : "";
  const owner = error.questionId ? `${error.questionId}` : "document";
  return `${owner}${location}: ${error.message || error.code}`;
}

// ---------------------------------------------------------------------------
// Table rows: the one authored shape with a defined Firestore storage form.
// ---------------------------------------------------------------------------

function primitiveCell(value) {
  if (value === null) return null;
  if (
    typeof value === "string"
    || typeof value === "number"
    || typeof value === "boolean"
  ) {
    return value;
  }
  if (value === undefined) return "";
  return String(value);
}

/** Accepts the authored 2-D form and the persisted row-map form alike. */
function cellsForRow(row) {
  if (Array.isArray(row)) return row;
  if (row && typeof row === "object" && Array.isArray(row.cells)) return row.cells;
  return [];
}

/**
 * The authored array-of-arrays shapes that have a DEFINED Firestore storage
 * form, chosen by the key the array is authored under.
 *
 *   rows    -> [{ cells: [...] }]   every table in the platform already reads
 *                                   this form (`cellsForRow`), including the
 *                                   ASVAB `{ kind: 'table', rows }` stimulus and
 *                                   the Algebra II augmented `matrix.rows`.
 *   points  -> [{ x, y }]           the graph renderer, the regression grader
 *                                   and the coordinate plane already read this
 *                                   form (`graphPoint`, `cleanRegressionPoints`).
 *
 * Anything else that nests an array inside an array has no storage form and no
 * reader, so it fails compilation with its exact property path instead of being
 * silently reshaped into something nothing reads back.
 */
const NESTED_ARRAY_SHAPE = Object.freeze({ ROWS: "rows", POINTS: "points" });

function nestedArrayShapeForKey(key) {
  if (key === "rows") return NESTED_ARRAY_SHAPE.ROWS;
  if (key === "points") return NESTED_ARRAY_SHAPE.POINTS;
  return null;
}

function compileRowEntry(entry) {
  if (Array.isArray(entry)) return { cells: entry.map(primitiveCell) };
  if (isPlainObject(entry) && Array.isArray(entry.cells)) {
    return { ...entry, cells: entry.cells.map(primitiveCell) };
  }
  return null;
}

function compilePointEntry(entry) {
  if (Array.isArray(entry)) {
    if (entry.length !== 2) return null;
    const [x, y] = entry;
    return { x: primitiveCell(x), y: primitiveCell(y) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// COMPILE
// ---------------------------------------------------------------------------

/**
 * Compile one authored value into its exact Firestore storage form.
 *
 * Returns `{ value, errors }`. The source object is never mutated: every
 * container is rebuilt. Errors carry the exact property path.
 */
function compilePathValue(value, {
  path = "$",
  questionId = null,
  familyId = null,
  errors = [],
  seen = new Set(),
  inArray = false,
  nestedArrayShape = null,
} = {}) {
  if (value === undefined) {
    // An undefined array slot keeps its position as null; an undefined object
    // key is dropped by the object branch below and never reaches here.
    if (inArray) return { value: null, errors };
    return { value: undefined, errors };
  }
  if (value === null) return { value: null, errors };

  const valueType = typeof value;

  if (valueType === "string" || valueType === "boolean") return { value, errors };

  if (valueType === "number") {
    if (!Number.isFinite(value)) {
      errors.push(compilerError({
        code: COMPILER_ERROR.NON_FINITE_NUMBER,
        path,
        questionId,
        familyId,
        detail: String(value),
      }));
      return { value: null, errors };
    }
    // -0 and 0 are the same stored number; normalising keeps the content hash
    // stable no matter which one a generator produced.
    return { value: value === 0 ? 0 : value, errors };
  }

  if (valueType === "bigint") return { value: String(value), errors };

  if (valueType === "function" || valueType === "symbol") {
    errors.push(compilerError({
      code: COMPILER_ERROR.UNSUPPORTED_VALUE,
      path,
      questionId,
      familyId,
      detail: valueType,
    }));
    return { value: null, errors };
  }

  if (seen.has(value)) {
    errors.push(compilerError({
      code: COMPILER_ERROR.CIRCULAR_REFERENCE,
      path,
      questionId,
      familyId,
    }));
    return { value: null, errors };
  }

  if (Array.isArray(value)) {
    const nextSeen = new Set(seen).add(value);
    const compiled = value.map((entry, index) => {
      const entryPath = joinPath(path, index);
      if (Array.isArray(entry)) {
        const shaped = nestedArrayShape === NESTED_ARRAY_SHAPE.ROWS
          ? compileRowEntry(entry)
          : (nestedArrayShape === NESTED_ARRAY_SHAPE.POINTS ? compilePointEntry(entry) : null);
        if (shaped) return shaped;
        errors.push(compilerError({
          code: COMPILER_ERROR.NESTED_ARRAY,
          path: entryPath,
          questionId,
          familyId,
          detail: nestedArrayShape === NESTED_ARRAY_SHAPE.POINTS
            ? `a point needs exactly two values, found ${entry.length}`
            : `array of ${entry.length} inside an array`,
        }));
        return null;
      }
      if (nestedArrayShape === NESTED_ARRAY_SHAPE.ROWS && isPlainObject(entry) && Array.isArray(entry.cells)) {
        return compileRowEntry(entry);
      }
      const result = compilePathValue(entry, {
        path: entryPath,
        questionId,
        familyId,
        errors,
        seen: nextSeen,
        inArray: true,
        nestedArrayShape: null,
      });
      return result.value === undefined ? null : result.value;
    });
    return { value: compiled, errors };
  }

  if (!isPlainObject(value)) {
    if (isAllowedValueClass(value)) return { value, errors };
    errors.push(compilerError({
      code: COMPILER_ERROR.UNSUPPORTED_PROTOTYPE,
      path,
      questionId,
      familyId,
      detail: value?.constructor?.name || "unknown class",
    }));
    return { value: null, errors };
  }

  const nextSeen = new Set(seen).add(value);
  const output = {};
  for (const key of Object.keys(value)) {
    const entry = value[key];
    // Firestore rejects undefined outright. Dropping the key is the storage
    // form of "this optional property was not authored".
    if (entry === undefined) continue;
    const entryPath = joinPath(path, key);
    if (!key || RESERVED_NAME_PATTERN.test(key)) {
      errors.push(compilerError({
        code: COMPILER_ERROR.INVALID_FIELD_NAME,
        path: entryPath,
        questionId,
        familyId,
        detail: key ? `reserved field name ${key}` : "empty field name",
      }));
      continue;
    }
    const result = compilePathValue(entry, {
      path: entryPath,
      questionId,
      familyId,
      errors,
      seen: nextSeen,
      inArray: false,
      nestedArrayShape: nestedArrayShapeForKey(key),
    });
    if (result.value !== undefined) output[key] = result.value;
  }
  return { value: output, errors };
}

// ---------------------------------------------------------------------------
// CERTIFY — an independent recursive read of the COMPILED value.
// ---------------------------------------------------------------------------

/**
 * Every reason Firestore would reject this already-compiled value.
 *
 * Deliberately independent of the compiler: it re-derives the verdict from the
 * output rather than trusting the transform that produced it, so a compiler bug
 * fails the build instead of reaching production.
 */
function certifyFirestoreValue(value, {
  path = "$",
  questionId = null,
  familyId = null,
  errors = [],
  seen = new Set(),
  inArray = false,
} = {}) {
  if (value === undefined) {
    errors.push(compilerError({
      code: COMPILER_ERROR.UNDEFINED_VALUE,
      path,
      questionId,
      familyId,
    }));
    return errors;
  }
  if (value === null) return errors;

  const valueType = typeof value;
  if (valueType === "string" || valueType === "boolean") return errors;
  if (valueType === "number") {
    if (!Number.isFinite(value)) {
      errors.push(compilerError({
        code: COMPILER_ERROR.NON_FINITE_NUMBER,
        path,
        questionId,
        familyId,
        detail: String(value),
      }));
    }
    return errors;
  }
  if (valueType === "bigint" || valueType === "function" || valueType === "symbol") {
    errors.push(compilerError({
      code: COMPILER_ERROR.UNSUPPORTED_VALUE,
      path,
      questionId,
      familyId,
      detail: valueType,
    }));
    return errors;
  }

  if (seen.has(value)) {
    errors.push(compilerError({
      code: COMPILER_ERROR.CIRCULAR_REFERENCE,
      path,
      questionId,
      familyId,
    }));
    return errors;
  }

  if (Array.isArray(value)) {
    const nextSeen = new Set(seen).add(value);
    value.forEach((entry, index) => {
      const entryPath = joinPath(path, index);
      if (Array.isArray(entry)) {
        errors.push(compilerError({
          code: COMPILER_ERROR.NESTED_ARRAY,
          path: entryPath,
          questionId,
          familyId,
          detail: `array of ${entry.length} inside an array`,
        }));
        return;
      }
      certifyFirestoreValue(entry, {
        path: entryPath,
        questionId,
        familyId,
        errors,
        seen: nextSeen,
        inArray: true,
      });
    });
    return errors;
  }

  if (!isPlainObject(value)) {
    if (!isAllowedValueClass(value)) {
      errors.push(compilerError({
        code: COMPILER_ERROR.UNSUPPORTED_PROTOTYPE,
        path,
        questionId,
        familyId,
        detail: value?.constructor?.name || "unknown class",
      }));
    }
    return errors;
  }

  const nextSeen = new Set(seen).add(value);
  for (const key of Object.keys(value)) {
    const entryPath = joinPath(path, key);
    if (!key || RESERVED_NAME_PATTERN.test(key)) {
      errors.push(compilerError({
        code: COMPILER_ERROR.INVALID_FIELD_NAME,
        path: entryPath,
        questionId,
        familyId,
        detail: key ? `reserved field name ${key}` : "empty field name",
      }));
      continue;
    }
    certifyFirestoreValue(value[key], {
      path: entryPath,
      questionId,
      familyId,
      errors,
      seen: nextSeen,
      inArray: false,
    });
  }
  void inArray;
  return errors;
}

/** Firestore's document-ID rules, checked where the human can still fix them. */
function certifyDocumentId(id, { questionId = null, familyId = null } = {}) {
  const errors = [];
  const text = typeof id === "string" ? id : "";
  if (!text.trim()) {
    errors.push(compilerError({
      code: COMPILER_ERROR.MISSING_DOCUMENT_ID,
      path: "id",
      questionId,
      familyId,
    }));
    return errors;
  }
  const detail = (() => {
    if (text.includes("/")) return "contains \"/\"";
    if (text === "." || text === "..") return `is "${text}"`;
    if (RESERVED_NAME_PATTERN.test(text)) return "uses the reserved __name__ form";
    if (Buffer.byteLength(text, "utf8") > DOCUMENT_ID_LIMIT_BYTES) return "is longer than 1500 bytes";
    if (text !== text.trim()) return "has leading or trailing whitespace";
    return null;
  })();
  if (detail) {
    errors.push(compilerError({
      code: COMPILER_ERROR.INVALID_DOCUMENT_ID,
      path: "id",
      questionId: questionId || text,
      familyId,
      detail,
    }));
  }
  return errors;
}

/** A close estimate of what Firestore will charge this document against 1 MiB. */
function estimateDocumentBytes(value) {
  if (value === null || value === undefined) return 1;
  const valueType = typeof value;
  if (valueType === "boolean") return 1;
  if (valueType === "number") return 8;
  if (valueType === "string") return Buffer.byteLength(value, "utf8") + 1;
  if (valueType === "bigint") return Buffer.byteLength(String(value), "utf8") + 1;
  if (value instanceof Date) return 8;
  if (Array.isArray(value)) {
    return value.reduce((total, entry) => total + estimateDocumentBytes(entry), 0);
  }
  if (!isPlainObject(value)) return 16;
  return Object.keys(value).reduce(
    (total, key) => total + Buffer.byteLength(key, "utf8") + 1 + estimateDocumentBytes(value[key]),
    0,
  );
}

/**
 * Certify one compiled document. This is the gate requirement B describes: a
 * malformed record fails the build with question id, family id, property path,
 * machine code and an explanation a human can act on.
 */
function certifyCompiledDocument(document, { id = null, familyId = null } = {}) {
  const questionId = id || document?.id || null;
  const family = familyId || document?.familyId || null;
  const errors = certifyDocumentId(questionId, { questionId, familyId: family });
  if (!isPlainObject(document)) {
    errors.push(compilerError({
      code: COMPILER_ERROR.NOT_AN_OBJECT,
      path: "",
      questionId,
      familyId: family,
    }));
    return errors;
  }
  certifyFirestoreValue(document, { path: "", questionId, familyId: family, errors });
  const bytes = estimateDocumentBytes(document);
  if (bytes > DOCUMENT_SIZE_LIMIT_BYTES) {
    errors.push(compilerError({
      code: COMPILER_ERROR.DOCUMENT_TOO_LARGE,
      path: "",
      questionId,
      familyId: family,
      detail: `${bytes} bytes`,
    }));
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Stable content hashing
// ---------------------------------------------------------------------------

/**
 * Canonical JSON: object keys sorted at every depth so two documents that differ
 * only in authored key order hash identically and the incremental release does
 * not rewrite them.
 */
function canonicalJson(value) {
  if (value === null || value === undefined) return "null";
  const valueType = typeof value;
  if (valueType === "number") return Number.isFinite(value) ? JSON.stringify(value === 0 ? 0 : value) : "null";
  if (valueType === "string" || valueType === "boolean") return JSON.stringify(value);
  if (valueType === "bigint") return JSON.stringify(String(value));
  if (value instanceof Date) return JSON.stringify(`date:${value.toISOString()}`);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (!isPlainObject(value)) return JSON.stringify(`class:${value?.constructor?.name || "unknown"}`);
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

/** Fields written by the release machinery itself, never by authoring. */
const VOLATILE_DOCUMENT_FIELDS = Object.freeze([
  "seededAt",
  "seededBy",
  "pathReleaseId",
  "pathReleaseActivatedAt",
  "pathReleaseSchemaVersion",
  "pathContentHash",
  "builtInPathSeedRelease",
  "updatedAt",
  "withdrawnAt",
]);

function hashableDocument(document) {
  if (!isPlainObject(document)) return document;
  const output = {};
  for (const key of Object.keys(document)) {
    if (VOLATILE_DOCUMENT_FIELDS.includes(key)) continue;
    if (document[key] === undefined) continue;
    output[key] = document[key];
  }
  return output;
}

/** Deterministic content hash of any compiled value. */
function pathContentHash(value) {
  return crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

/** The hash a release compares: content only, never release bookkeeping. */
function pathDocumentContentHash(document) {
  return pathContentHash(hashableDocument(document));
}

// ---------------------------------------------------------------------------
// The compile + certify entry point everything else calls
// ---------------------------------------------------------------------------

/**
 * Compile one authored Path family into the record that will be stored.
 *
 * Returns the compiled document, its stable content hash, and every compile or
 * certification error with an exact property path. The authored object is left
 * exactly as it was found.
 */
function compilePathQuestionDocument(authored, { defaults = null } = {}) {
  const questionId = typeof authored?.id === "string" ? authored.id.trim() : "";
  const familyId = typeof authored?.familyId === "string" ? authored.familyId : null;

  if (!isPlainObject(authored)) {
    return {
      ok: false,
      id: questionId || null,
      familyId,
      document: null,
      contentHash: null,
      errors: [compilerError({
        code: COMPILER_ERROR.NOT_AN_OBJECT,
        path: "",
        questionId: questionId || null,
        familyId,
      })],
    };
  }

  const idErrors = certifyDocumentId(questionId, { questionId: questionId || null, familyId });
  // Document-rooted paths carry no "$" prefix: a failure reports
  // `variants[2].stimulus.table.rows[1]`, which is the property an author opens.
  const { value: compiled, errors } = compilePathValue(authored, {
    path: "",
    questionId: questionId || null,
    familyId,
  });

  const document = isPlainObject(compiled) ? { ...compiled } : compiled;
  if (isPlainObject(document)) {
    document.id = questionId;
    if (document.active === undefined) document.active = authored.active !== false;
    if (defaults && isPlainObject(defaults)) {
      for (const key of Object.keys(defaults)) {
        if (document[key] === undefined) document[key] = defaults[key];
      }
    }
  }

  const certification = isPlainObject(document)
    ? certifyCompiledDocument(document, { id: questionId, familyId })
    : [];

  const allErrors = [...idErrors, ...errors, ...certification];
  return {
    ok: allErrors.length === 0,
    id: questionId || null,
    familyId,
    courseId: typeof authored?.courseId === "string" ? authored.courseId : null,
    document: allErrors.length === 0 ? document : null,
    contentHash: allErrors.length === 0 ? pathDocumentContentHash(document) : null,
    errors: allErrors,
  };
}

/**
 * Compile a whole authored package.
 *
 * All-or-nothing by design: the caller receives every actionable error at once
 * rather than the first one, because a content lead fixing a release wants the
 * complete list, and production must never see a half-compiled package.
 */
function compilePathQuestionPackage(items = [], { defaults = null } = {}) {
  const documents = [];
  const errors = [];
  const seenIds = new Map();
  (Array.isArray(items) ? items : []).forEach((item, index) => {
    const compiled = compilePathQuestionDocument(item, { defaults });
    if (!compiled.ok) {
      compiled.errors.forEach((error) => errors.push({ ...error, path: packagePath(index, error.path) }));
      return;
    }
    if (seenIds.has(compiled.id)) {
      errors.push(compilerError({
        code: COMPILER_ERROR.INVALID_DOCUMENT_ID,
        path: `items[${index}].id`,
        questionId: compiled.id,
        familyId: compiled.familyId,
        detail: `duplicates items[${seenIds.get(compiled.id)}]`,
      }));
      return;
    }
    seenIds.set(compiled.id, index);
    documents.push(compiled);
  });
  return { ok: errors.length === 0, documents, errors };
}

module.exports = {
  PATH_COMPILER_SCHEMA_VERSION,
  SUPPORTED_COMPILER_SCHEMA_VERSIONS,
  COMPILER_ERROR,
  COMPILER_ERROR_EXPLANATION,
  DOCUMENT_SIZE_LIMIT_BYTES,
  VOLATILE_DOCUMENT_FIELDS,
  cellsForRow,
  NESTED_ARRAY_SHAPE,
  compilePathValue,
  compilePathQuestionDocument,
  compilePathQuestionPackage,
  certifyFirestoreValue,
  certifyCompiledDocument,
  certifyDocumentId,
  estimateDocumentBytes,
  canonicalJson,
  pathContentHash,
  pathDocumentContentHash,
  formatCompilerError,
  isPlainObject,
};

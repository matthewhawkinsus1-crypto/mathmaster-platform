"use strict";

// The Firestore storage boundary for Path content.
//
// This file used to CONTAIN the sanitization rules. It no longer does: every
// rule now lives in one place, `pathContentCompiler.js`, which build-time
// certification, the Path Release V2 control plane, the legacy seed importer and
// the tests all share. Two copies of "what is safe to store" is how a variant
// table reached production and failed a whole batch with
//
//   INVALID_ARGUMENT: Property array contains an invalid nested entity.
//
// What remains here is the historical API, kept so every existing caller and
// contract test keeps working, expressed in terms of the one compiler.

const compiler = require("./pathContentCompiler");

const {
  cellsForRow,
  compilePathValue,
  compilePathQuestionDocument,
  certifyCompiledDocument,
  formatCompilerError,
} = compiler;

/**
 * The stored form of any authored value.
 *
 * Lenient by design: this is the legacy signature, it returns a value rather
 * than a verdict, and nothing that calls it is prepared to handle an error. Use
 * `compilePathRecordForStorage` when the caller can report a rejection — that is
 * the path that turns a malformed document into an exact property path instead
 * of a generic Firestore failure.
 */
function firestoreSafeValue(value, inArray = false) {
  const { value: compiled } = compilePathValue(value, { path: "$", inArray });
  return compiled;
}

/**
 * Normalize table rows everywhere in a record, including inside `variants[]`.
 *
 * Retained for callers that want only the row-shape pass. The compiler performs
 * this as part of compilation, so this is now a thin alias over it.
 */
function normalizeTableRowsDeep(value) {
  return firestoreSafeValue(value);
}

function firestoreSafeStimulus(stimulus) {
  if (!stimulus || typeof stimulus !== "object") return stimulus;
  return firestoreSafeValue(stimulus);
}

function firestoreSafePathRecord(record) {
  if (!record || typeof record !== "object") return record;
  return firestoreSafeValue(record);
}

/**
 * Compile one authored Path record AND certify its stored shape.
 *
 * Returns `{ ok, document, contentHash, errors }` where every error names the
 * question, the family, the exact property path (`variants[2].stimulus.table.rows[1]`),
 * a machine code and a human-readable explanation.
 */
function compilePathRecordForStorage(record, options = {}) {
  return compilePathQuestionDocument(record, options);
}

module.exports = {
  firestoreSafeValue,
  cellsForRow,
  normalizeTableRowsDeep,
  firestoreSafeStimulus,
  firestoreSafePathRecord,
  compilePathRecordForStorage,
  certifyCompiledDocument,
  formatCompilerError,
  compiler,
};

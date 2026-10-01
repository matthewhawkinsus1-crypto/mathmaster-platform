// Moved to functions/shared so the server grades a point interpretation with
// the same config normalization and checks the browser uses
// (server-authoritative grading parity). This shim keeps every existing src
// import path working.
export * from '../functions/shared/toolMath/scenario/contextInterpretationUtils.mjs';

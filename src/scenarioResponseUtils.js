// Moved to functions/shared so the server grades with the same text matching
// the browser uses (server-authoritative grading parity). This shim keeps every
// existing src import path working.
export * from '../functions/shared/toolMath/scenario/scenarioResponseUtils.mjs';

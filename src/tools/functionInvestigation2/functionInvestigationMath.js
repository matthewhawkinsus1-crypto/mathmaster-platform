// Moved to functions/shared so the server grades with the same math the
// browser uses (server-authoritative grading parity). This shim keeps every
// existing src import path working.
export * from '../../../functions/shared/toolMath/functionInvestigation2/functionInvestigationMath.mjs';

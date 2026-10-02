// Moved to functions/shared so the server grades a relation solve with the
// same mathematics MultiRelationAlgebraCore uses (server-authoritative grading
// parity). This shim keeps every existing src import path working.
export * from '../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';

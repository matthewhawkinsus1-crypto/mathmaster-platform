// Moved to functions/shared so the server awards Step Algebra step credit with
// the same move judgement the workspace uses (server-verified step credit).
// This shim keeps every existing src import path working.
export * from '../functions/shared/algebra/algebraSupportLevels.mjs';

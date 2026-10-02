// Algebraic equivalence moved to functions/shared/toolMath/workflow/equivalence.mjs
// so the server grades composed workflows with the same code the browser runs
// (server-authoritative grading parity). This shim keeps every existing src
// import path working.
export * from '../../functions/shared/toolMath/workflow/equivalence.mjs';

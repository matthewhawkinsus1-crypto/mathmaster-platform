// Composed-question normalisation, branching and recipe expansion moved to functions/shared/toolMath/workflow/questionWorkflow.mjs
// so the server grades composed workflows with the same code the browser runs
// (server-authoritative grading parity). This shim keeps every existing src
// import path working.
export * from '../../../functions/shared/toolMath/workflow/questionWorkflow.mjs';

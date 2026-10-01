// Moved to functions/shared so the server grades a solved inequality's
// representations against the same stages the workspace asked for. This shim
// keeps every existing src import path working.
export * from '../../../functions/shared/toolMath/algebra-relations/inequalityRepresentationPolicy.mjs';

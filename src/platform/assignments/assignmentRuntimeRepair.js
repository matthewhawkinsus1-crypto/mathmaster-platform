// Moved to functions/shared/runtime: server grading must see the SAME
// runtime-repaired question the student runtime renders, so the pure repair
// now lives where both can import it. This shim keeps every src import path.
export * from '../../../functions/shared/runtime/assignmentRuntimeRepair.mjs';
export { default } from '../../../functions/shared/runtime/assignmentRuntimeRepair.mjs';

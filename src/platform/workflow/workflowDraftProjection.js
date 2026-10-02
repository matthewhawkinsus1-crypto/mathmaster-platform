// The server copy's view of a composed question's answers moved to
// functions/shared/toolMath/workflow/workflowDraftProjection.mjs, because the
// shared composed-question rules read it (server-authoritative grading
// parity). This shim keeps every existing src import path working.
export * from '../../../functions/shared/toolMath/workflow/workflowDraftProjection.mjs';

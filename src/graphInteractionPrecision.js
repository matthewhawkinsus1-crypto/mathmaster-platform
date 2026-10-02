// Moved to functions/shared/toolMath/graphWorkspace: the reachable snap step
// sets the graph workspace's grading tolerances, so the server resolves it with
// the same code (server-authoritative grading parity). This shim keeps every
// existing src import path working.
export * from '../functions/shared/toolMath/graphWorkspace/graphInteractionPrecision.mjs';

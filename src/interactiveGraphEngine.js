// Moved to functions/shared/toolMath/graphWorkspace so the server grades the
// graph workspace with the same point, feature and interval mathematics the
// browser uses (server-authoritative grading parity). This shim keeps every
// existing src import path working.
export * from '../functions/shared/toolMath/graphWorkspace/interactiveGraphEngine.mjs';

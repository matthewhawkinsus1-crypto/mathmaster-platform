// Moved to functions/shared so the shared graders the server runs read the
// same "unanswered is never an answer" rule as the tools (server-authoritative
// grading parity). This shim keeps every existing src import path working.
export * from '../../../functions/shared/toolMath/shared/judgmentChoices.mjs';

// Moved to functions/shared so the server reads a student's LaTeX exactly as
// the browser does (server-authoritative grading parity). This shim keeps
// every existing src import path working.
export * from '../../../functions/shared/algebra/latexToExpression.mjs';

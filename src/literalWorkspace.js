// Solving a formula for one of its letters, on the balance.
//
// The mathematics moved to functions/shared so the SERVER builds the same
// workspace question the student solved on and grades the final equation
// against it (functions/shared/toolMath/algebra-literal/literalWorkspace.mjs).
// This module keeps every existing src import path working.

export {
  LITERAL_WORKSPACE_SURFACE,
  buildLiteralWorkspaceQuestion,
  expandImplicitProducts,
  literalSymbols,
  readLiteralEquation,
  readLiteralVariable,
} from '../functions/shared/toolMath/algebra-literal/literalWorkspace.mjs';

// Does this question want the workspace? Shared with the server, which must
// route (and grade) a workspace literal the same way: see
// functions/shared/runtime/literalWorkspaceRoute.mjs.
export { usesLiteralWorkspace } from '../functions/shared/runtime/literalWorkspaceRoute.mjs';

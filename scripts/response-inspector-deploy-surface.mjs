/*
 * Targeted deployment surface for the teacher Student Response Inspector.
 *
 * These two callables are invoked from a browser, so their Gen 2 Cloud Run
 * services must keep the public transport binding. Authorization still happens
 * inside each callable after Firebase Auth is verified.
 */
export const RESPONSE_INSPECTOR_FUNCTIONS = Object.freeze([
  Object.freeze({
    name: 'inspectStudentResponse',
    browserCallable: true,
    why: 'Reads the canonical response, graded workspace, answer authority, and audit history for the teacher of record.',
  }),
  Object.freeze({
    name: 'overrideStudentResponseGrade',
    browserCallable: true,
    why: 'Applies/restores a server-authoritative teacher grade correction and recalculates downstream grade projections.',
  }),
]);

export const responseInspectorFunctionNames = () =>
  RESPONSE_INSPECTOR_FUNCTIONS.map((entry) => entry.name);

export const firebaseFunctionTargets = (names = responseInspectorFunctionNames()) =>
  names.map((name) => `functions:${name}`).join(',');

export const browserCallableServiceIds = () =>
  RESPONSE_INSPECTOR_FUNCTIONS
    .filter((entry) => entry.browserCallable)
    .map((entry) => entry.name.toLowerCase());

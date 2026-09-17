/*
 * Targeted deployment surface for the teacher Student Response Inspector.
 *
 * This feature is not only two new callables: future response evidence is
 * captured by ordinary submission ingestion and deadline auto-submit, and an
 * override reaches Google Classroom through the existing grade-sync trigger.
 * Keeping the complete surface here prevents a "UI deployed, backend stale"
 * partial release.
 */
export const RESPONSE_INSPECTOR_FUNCTIONS = Object.freeze([
  Object.freeze({
    name: 'inspectStudentResponse',
    browserCallable: true,
    why: 'Reads canonical response evidence for the teacher of record.',
  }),
  Object.freeze({
    name: 'overrideStudentResponseGrade',
    browserCallable: true,
    why: 'Applies/restores the server-authoritative teacher correction.',
  }),
  Object.freeze({
    name: 'applyAcademicIntegrityGradeOverride',
    browserCallable: true,
    why: 'Applies/restores a teacher-confirmed persistent academic-integrity consequence.',
  }),
  Object.freeze({
    name: 'ingestStudentSubmissions',
    browserCallable: true,
    why: 'Persists future submitted-response inspection evidence during ordinary assignment ingestion.',
  }),
  Object.freeze({
    name: 'finalizeStudentResponseCheckpoints',
    browserCallable: false,
    why: 'Persists inspection evidence when a complete checkpoint is auto-submitted at a deadline.',
  }),
  Object.freeze({
    name: 'syncGradeToClassroom',
    browserCallable: false,
    why: 'Recomputes Google Classroom passback from authoritative teacher overrides.',
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

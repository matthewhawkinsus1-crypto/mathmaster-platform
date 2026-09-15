/*
 * EVERY PRODUCTION SURFACE PR #247 CHANGES, IN ONE PLACE.
 *
 * The first version of the persistence deploy shipped two callables and called
 * it done. It was not done: the same release changes the Classroom passback
 * trigger, the teacher recovery report, a Firestore composite index and the
 * hosted client. Deploying half a release is how you get a browser calling a
 * contract the server has not been given, or a passback gate reading an index
 * that does not exist yet.
 *
 * The answer is NOT `firebase deploy --only functions`. Redeploying the whole
 * fleet to ship four functions puts every unrelated function on this codebase
 * through a cold start and a new revision, which is a far larger production
 * event than the change being released.
 *
 * So: the exact list, verified against the exports in `functions/index.js`, and
 * a test that fails when this file and that file disagree.
 */

/**
 * ORDER MATTERS, AND IT IS THE ORDER BELOW.
 *
 * `indexDependent` functions run a query that needs a composite index this
 * release adds. Deploying one before its index is ENABLED gives you a function
 * that throws FAILED_PRECONDITION on the exact query the release exists to
 * add — in the case of `syncGradeToClassroom`, on the safety check that decides
 * whether a final grade may reach Google Classroom. A failing safety check is
 * not a safe default; it is an outage on the finalization path.
 *
 * `clientFacing` functions are called directly by a student's browser, so their
 * Gen 2 Cloud Run services must grant `allUsers` the transport-only
 * `roles/run.invoker`. A deploy that silently drops that binding turns every
 * Submit into a 403 that looks, from the classroom, exactly like lost work.
 */
export const PERSISTENCE_FUNCTIONS = Object.freeze([
  Object.freeze({
    name: 'ingestStudentSubmissions',
    kind: 'callable',
    clientFacing: true,
    indexDependent: false,
    why: 'The only canonical writer for grade-bearing student work.',
  }),
  Object.freeze({
    name: 'reportStudentDeviceQueue',
    kind: 'callable',
    clientFacing: true,
    indexDependent: false,
    why: 'Stores each device queue report as a replaceable snapshot so a drained assignment key disappears.',
  }),
  Object.freeze({
    name: 'reconcileAssignmentActivityProjection',
    kind: 'callable',
    clientFacing: true,
    indexDependent: false,
    why: 'Derives Classwork completion from canonical attempts now that the browser no longer writes it.',
  }),
  Object.freeze({
    name: 'syncGradeToClassroom',
    kind: 'trigger',
    clientFacing: false,
    indexDependent: true,
    why: 'Withholds a final Classroom passback while persistence evidence is unresolved.',
  }),
  Object.freeze({
    name: 'getStudentPersistenceRecoveryReport',
    kind: 'callable',
    clientFacing: false,
    indexDependent: false,
    why: 'The teacher recovery report, which now also reports resolved persistence holds.',
  }),
  Object.freeze({
    name: 'resolveStudentPersistenceHold',
    kind: 'callable',
    clientFacing: false,
    indexDependent: true,
    why: 'The audited teacher-of-record resolution for an unrecoverable session/canonical discrepancy.',
  }),
]);

export const persistenceFunctionNames = () => PERSISTENCE_FUNCTIONS.map((entry) => entry.name);

/** `--only functions:a,functions:b` — never a bare `--only functions`. */
export const firebaseFunctionTargets = (names = persistenceFunctionNames()) =>
  names.map((name) => `functions:${name}`).join(',');

/** Deploy these only after the composite indexes below report ENABLED. */
export const indexDependentFunctionNames = () =>
  PERSISTENCE_FUNCTIONS.filter((entry) => entry.indexDependent).map((entry) => entry.name);

/** Cloud Run service ids are the function name, lowercased. */
export const clientFacingServiceIds = () => PERSISTENCE_FUNCTIONS
  .filter((entry) => entry.clientFacing)
  .map((entry) => entry.name.toLowerCase());

/*
 * THE COMPOSITE INDEX THE FINAL-GRADE SAFETY CHECK QUERIES.
 *
 * `readPersistencePending` counts a student's ACTIVE response checkpoints for
 * one assignment: studentId == , assignmentId == , status == . Without this
 * index that query throws, and it is the query standing between an incomplete
 * record and a final Google Classroom grade.
 */
export const REQUIRED_PERSISTENCE_INDEXES = Object.freeze([
  Object.freeze({
    collectionGroup: 'studentResponseCheckpoints',
    fields: Object.freeze(['studentId', 'assignmentId', 'status']),
    queriedBy: Object.freeze(['syncGradeToClassroom', 'resolveStudentPersistenceHold']),
  }),
]);

/** Does a listed live index satisfy a required one? */
export const indexSatisfiesRequirement = (index, requirement) => {
  if (!index || typeof index !== 'object') return false;
  const collectionGroup = String(index.collectionGroup || String(index.name || '').split('/collectionGroups/')[1] || '')
    .split('/')[0];
  if (collectionGroup !== requirement.collectionGroup) return false;
  const fields = (Array.isArray(index.fields) ? index.fields : [])
    // Firestore appends `__name__` to every composite index; it is not part of
    // what the query asked for, so it is not part of the match.
    .filter((field) => field?.fieldPath && field.fieldPath !== '__name__')
    .map((field) => field.fieldPath);
  return requirement.fields.length === fields.length
    && requirement.fields.every((fieldPath, position) => fields[position] === fieldPath);
};

/**
 * Which required indexes are live and ENABLED, given whatever
 * `gcloud firestore indexes composite list` returned.
 *
 * An index that exists but is still CREATING is NOT ready: the query fails the
 * same way it does when the index is absent. Anything other than a definitely
 * ready state is treated as not ready, because the cost of guessing wrong is a
 * final grade that cannot be computed.
 */
export const READY_INDEX_STATES = Object.freeze(['READY', 'ENABLED', 'STATE_READY']);

export const assessRequiredIndexes = (liveIndexes = []) => REQUIRED_PERSISTENCE_INDEXES.map((requirement) => {
  const match = (Array.isArray(liveIndexes) ? liveIndexes : [])
    .find((index) => indexSatisfiesRequirement(index, requirement));
  return {
    collectionGroup: requirement.collectionGroup,
    fields: [...requirement.fields],
    queriedBy: [...requirement.queriedBy],
    found: Boolean(match),
    state: match ? String(match.state || 'UNKNOWN') : null,
    ready: Boolean(match) && READY_INDEX_STATES.includes(String(match.state || '').toUpperCase()),
  };
});

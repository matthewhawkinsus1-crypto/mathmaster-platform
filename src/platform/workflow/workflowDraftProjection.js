/*
 * A COMPOSED QUESTION'S ANSWERS, AS THE SERVER BACKUP MAY HOLD THEM.
 *
 * WorkflowRunner keeps every step's answer in one draft,
 * `<draftKey>:workflow-responses`. A graph step's answer is the plotting
 * workspace's own report — `{ isComplete, isCorrect, responseKey, parts }`,
 * each part with its own `isCorrect` — and that verdict is what grades the
 * step (workflowGrading: a `useStageVerdict` rule, and `gradePlottedPairs`
 * when no plotted point can be read). It is finer than anything the grader
 * could rebuild, so ON THE DEVICE it stays exactly as it is: the same work is
 * graded the same way, before and after a reload.
 *
 * The SERVER copy is another matter. Drafts are student-readable, and on a
 * DOL, quiz or test a stored verdict would tell the student whether the graph
 * is right before anything is released — which is why
 * `sanitizeWorkspaceDraftValue` refuses any record with an `isCorrect` in it.
 * It refused this one from the moment a graph step first reported (on mount,
 * `isCorrect: false`), so every answer of the question stayed on the device
 * and a Chromebook swap lost all of them (PQ-043; PR #397's board failure in
 * another record).
 *
 * So the server copy carries a graph step WITHOUT its verdict, marked
 * `rederiveOnOpen`. Nothing is lost by that: the workspace keeps its own
 * construction in its own draft (`…:<stage>:graph-construction`, backed up
 * like any other), and when the step is opened it reports its state from that
 * construction again — the same verdict, from the same work, by the same code.
 * Until then the step is not an answer (`hasStageResponse`), so it is never
 * graded and the question cannot be submitted around it; and because it is
 * not an answer it cannot be closed by a later step (`lockedStageIds`), so it
 * can always be opened. A device built before this change reads it the same
 * way: `isComplete: false`, a step to finish — never a step to mark wrong.
 */

export const WORKFLOW_ARTIFACT = '__mathmasterWorkflowArtifact';
export const WORKFLOW_RESPONSES_DRAFT_SUFFIX = ':workflow-responses';
export const REDERIVE_ON_OPEN = 'rederiveOnOpen';

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const isGraphArtifact = (value) => isPlainObject(value) && value[WORKFLOW_ARTIFACT] === 'graph';

/**
 * A graph step whose verdict is not here: restored from the server copy (or
 * any graph answer without a boolean verdict). It waits for its workspace.
 */
export const graphArtifactAwaitsVerdict = (value) => isGraphArtifact(value)
  && (value[REDERIVE_ON_OPEN] === true || typeof value.isCorrect !== 'boolean');

/*
 * Only what is the student's own work crosses, and only as plain values. A
 * field added to a part later (a misconception code, a credit) stays on the
 * device until someone decides it may travel — failing closed is the point.
 * The `responseKey` stays behind too: it repeats the workspace's construction
 * (raw strokes included), which travels in its own draft, and nothing reads it
 * from a step that is waiting to be opened.
 */
const PART_FIELDS = ['id', 'label', 'isComplete', 'response'];
const isPlainValue = (value) => ['string', 'number', 'boolean'].includes(typeof value);

const projectPart = (part) => Object.fromEntries(
  PART_FIELDS
    .filter((field) => Object.prototype.hasOwnProperty.call(part, field) && isPlainValue(part[field]))
    .map((field) => [field, part[field]]),
);

/** One graph step's answer as the server copy holds it: no verdict, open me. */
export const projectGraphArtifactForServer = (artifact) => ({
  [WORKFLOW_ARTIFACT]: 'graph',
  isComplete: false,
  [REDERIVE_ON_OPEN]: true,
  parts: (Array.isArray(artifact?.parts) ? artifact.parts : []).filter(isPlainObject).map(projectPart),
});

/**
 * The whole `workflow-responses` record for the server copy. Every other
 * step's answer is carried unchanged; the record on the device is never
 * touched (a new object is returned when anything changed).
 */
export const projectWorkflowResponsesForServer = (responses) => {
  if (!isPlainObject(responses)) return responses;
  let changed = false;
  const projected = {};
  Object.entries(responses).forEach(([stageId, value]) => {
    if (isGraphArtifact(value)) {
      projected[stageId] = projectGraphArtifactForServer(value);
      changed = true;
    } else {
      projected[stageId] = value;
    }
  });
  return changed ? projected : responses;
};

/** Which steps came back without their verdict, in workflow order. */
export const stagesAwaitingVerdict = (stages = [], responses = {}) => (Array.isArray(stages) ? stages : [])
  .filter((stage) => stage?.id && graphArtifactAwaitsVerdict(responses?.[stage.id]));

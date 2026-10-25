/*
 * Shared grader for the `composedWorkflow` question surface:
 *   accepts(response) -> can this response shape be marked by this grader?
 *   grade(question, response) -> gradingResult.mjs shape
 * A response this grader does not accept (e.g. one queued by an older client)
 * takes the bounded legacy path at ingestion instead of being blocked.
 *
 * ONE MARKING, TWO CALLERS. WorkflowRunner marks a student's stages through
 * gradeComposedWorkflowCheck — which serializes the work into the exact tool
 * response the server will read and then calls `grade` below — and ingestion,
 * the deadline finalizer and Recovery reach `grade` through
 * questionResponseGrading.mjs. Both read the question the way WorkflowRunner
 * renders it (readComposedQuestion: runtime repair, then recipe expansion) and
 * mark it with gradeWorkflow, stage by stage, so the parts, partial credit and
 * verdict a student sees on Submit are the ones the gradebook records.
 *
 * The score is the workflow's own: weighted stage credit over the graded
 * stages, rounded to a whole percent and held at 90 until every graded stage
 * is right (workflowGrading.mjs gradeWorkflow). A stage nobody can mark (an
 * interpretation, a manual rubric) is reported `graded: false` and never
 * counts for or against the student.
 *
 * A GRAPH-CONSTRUCTION STAGE IS RE-MARKED, NEVER BELIEVED. Its response is the
 * workspace's raw work. The graph the stage showed — built from the student's
 * own table or equation, the window, the continuity choice, the domain's
 * boundary rule — is rebuilt from the authoritative question and the other
 * responses (workflowGraphStage.mjs resolveWorkflowGraphStages, the function
 * WorkflowRunner renders it with), and the construction is marked against it
 * by the shared graph-workspace grader, through the same bytes the workspace
 * marks itself with. That verdict — complete, correct — is what gradeStage
 * reads for the stage, exactly where it used to read the workspace's own
 * claim, so the stage's credit, weight, completeness and graded flag follow
 * the same rule as before (the credit stays all-or-nothing, as the claim it
 * replaces was). A stage whose graph cannot be built (its source reopened, a
 * table that disagrees with its function, no function at all) or that carries
 * no work is unanswered.
 */
import { gradedResult, ungradedResult } from '../gradingResult.mjs';
import { LINE_FORMS, isVerticalLine, requestedLineForm, sameLine, writtenLineForm } from '../../linearEquationForm.mjs';
import { studentMisconceptionMessage } from '../../misconceptionStudentMessages.mjs';
import { buildToolResponse, isToolResponse, readToolWork } from '../toolResponseContract.mjs';
import { gradeWorkWithGrader } from '../toolWorkGrading.mjs';
import graphWorkspaceGrader from '../tools/graphWorkspace.mjs';
import {
  COMPOSED_WORKFLOW_CONTRACT_VERSION,
  COMPOSED_WORKFLOW_TOOL_ID,
  resolveComposedWorkflow,
  withDerivedTableSources,
} from '../../toolMath/workflow/composedWorkflowContract.mjs';
import { unsafeExpressionStage } from '../../toolMath/workflow/expressionSafety.mjs';
import { activeStageIds } from '../../toolMath/workflow/questionWorkflow.mjs';
import { resolveWorkflowGraphStages, workflowGraphStageWork } from '../../toolMath/workflow/workflowGraphStage.mjs';
import { WORKFLOW_ARTIFACT } from '../../toolMath/workflow/workflowStageWork.mjs';
import { gradeWorkflow } from '../../toolMath/workflow/workflowGrading.mjs';

const text = (value) => String(value ?? '');
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * The verdict of one graph-construction stage, as gradeStage reads it: the
 * shared graph-workspace grader's mark of the stage's work against the
 * rebuilt sub-question, in the shape the workspace's own report took
 * (answerStateFromSharedGrading: complete and correct only when graded).
 * null when the stage is unanswered — no buildable graph, or no work.
 */
const graphStageVerdict = (resolution, response) => {
  const work = workflowGraphStageWork(response);
  if (resolution?.status !== 'ready' || !work) return null;
  const marked = gradeWorkWithGrader({ grader: graphWorkspaceGrader, question: resolution.question, work });
  const graded = marked.graded === true;
  return {
    [WORKFLOW_ARTIFACT]: 'graph',
    isComplete: graded && marked.isComplete === true,
    isCorrect: graded && marked.isCorrect === true,
  };
};

/**
 * The responses gradeWorkflow marks: the student's, with every graph stage the
 * student is on replaced by the server's own verdict on its work.
 */
const withGraphStageVerdicts = ({ composed, responses, outcomesWithheld = false }) => {
  const graphStages = resolveWorkflowGraphStages({
    workflow: composed.workflow,
    content: composed.content,
    grading: composed.grading,
    responses,
    outcomesWithheld,
  });
  if (!graphStages.size) return responses;
  const marking = { ...responses };
  graphStages.forEach((resolution, stageId) => {
    marking[stageId] = graphStageVerdict(resolution, responses[stageId]);
  });
  return marking;
};

/*
 * WHY A STAGE MISSED, FOR THE SCREEN (student pass 3, wave 7).
 *
 * Every marked stage has a `detail` that gradedResult does not keep: a part
 * record is what an attempt stores. The browser's Check asks for the screen's
 * reasons separately (`stageReasons`), keyed by stage id, for the stages
 * graded wrong. The server's grade never asks, so what it records is
 * unchanged.
 *
 * AN ALLOWLIST, BY STAGE KIND (review B1). A reason is shown only when no
 * failing outcome's words — or their absence — let the student work out the
 * key or another step's answer. For each kind, each detail shape the grader
 * can produce on a miss is listed with what the screen says for it: the
 * detail itself (PASS), or one fixed sentence that every failure of that
 * shape shares. A kind or a shape not listed shows nothing.
 *
 *   graphFeatureSelect, pointInput  nothing, for every failure. The grader's
 *     own lines ("This graph does not have one." / "…does have one." /
 *     "1 of 2 correct.") tell whether the graph has the feature at all, which
 *     answers the step that asks that, and any wording that differs between
 *     an existence miss and a points miss does the same.
 *   quantityRoles, axisSetup  one sentence whatever is wrong: naming the one
 *     wrong role (or axis field) among two choices names its answer.
 *   tableInput  against the student's own function, the count (it says
 *     nothing about the key); against an authored key, one sentence.
 *   coordinatePlot, functionGraph  the workspace's own fixed lines; a count of
 *     plotted pairs becomes one sentence.
 *   mappingDiagram, valueSet, domainInput, rangeInput  their single fixed
 *     line for any miss.
 *   figureMatch  the count, which the step already turns into named figures
 *     (P2-4, an owner decision).
 *   equationInput  the FORM, never the value (FB08, an owner decision). The
 *     right line written in another form than the step asks for ("Right line,
 *     wrong form: write it as y = mx + b."), or a bare number or expression
 *     where the key is an equation (a fixed sentence about the = sign). Both
 *     are fixed text that no number of the key reaches, and a line that is not
 *     the key's line shows nothing, so a wrong equation reads as red only.
 * Every other kind ("Not correct yet.") shows nothing. How much a reason may
 * say is this list, confirmed as built (owner, October 2026, FB12, W7 decision
 * 14), as is Data Modeling naming which half of a part held.
 */
const PASS = (detail) => detail;
const PLOT_POINTS_OFF = 'Some points are not where the ordered pairs put them.';
const PLOT_LINES = [
  [/^Some points are not where the (table puts|ordered pairs put) them\.$/, PASS],
  [/^Revise the graph so it matches the model and table you built\.$/, PASS],
  [/^\d+ of \d+ ordered pairs are plotted(, with \d+ points? that (is|are) not in the relation)?\.$/, () => PLOT_POINTS_OFF],
];
// The axis fields a student can see (AxisSetupStage: units unless the stage
// says requireUnits: false, a scale only when it says requireScale) AND that
// are graded (gradeAxes: units unless the rule says requireUnits: false, a
// scale only when it says requireScale: true). Only those are named.
const axisFieldsSentence = (stage, rule) => {
  const units = stage?.requireUnits !== false && rule?.requireUnits !== false;
  const scale = stage?.requireScale === true && rule?.requireScale === true;
  const fields = ['its quantity', ...(units ? ['its unit'] : []), ...(scale ? ['its scale'] : [])];
  const list = fields.length > 2 ? `${fields.slice(0, -1).join(', ')} and ${fields.at(-1)}` : fields.join(' and ');
  return `Check each axis: ${list}.`;
};
const SET_LINE = [[/^That is not the set of values in this relation — list each one once\.$/, PASS]];

/*
 * AN EQUATION STEP SAYS ITS FORM (FB08). gradeStage reports every equation
 * miss as "Not correct yet.", so the reason is read from what the student
 * wrote and the step's own words (the same reading the ordinary multi-answer
 * classifier gives a line field: misconceptionClassifiers.mjs fieldLineForm).
 *
 *   - the student's equation has the key's graph, so the line is right, and
 *     the form the step asks for — named in its own words, else the form its
 *     key is written in — is not the one written: the form is named, with the
 *     words every "right line, wrong form" miss uses. When the step's words
 *     and a key disagree about the form, or the keys are written in different
 *     forms, nothing is named: the student cannot be told which one is wanted.
 *     A vertical line is never told to use a form that needs a slope.
 *   - there is no relation sign at all and every key is an equation (a bare
 *     "2" for x = 2): one fixed sentence about the = sign. Not on a function
 *     rule (`acceptEquivalentFunctionRule`), which takes a bare right side.
 *
 * Neither sentence holds a number, and a line that is not the key's graph
 * shows nothing, so no sentence tells one wrong equation from another.
 */
const LINE_FORM_CODES = Object.freeze({
  [LINE_FORMS.SLOPE_INTERCEPT]: 'line-wrong-form-slope-intercept',
  [LINE_FORMS.POINT_SLOPE]: 'line-wrong-form-point-slope',
  [LINE_FORMS.STANDARD]: 'line-wrong-form-standard',
});
const NOT_AN_EQUATION = 'Write this step as an equation, with an = sign.';
const INEQUALITY_SIGN = /[<>≤≥≠]|\\(?:leq?|geq?|neq?|ne)(?![A-Za-z])/;
const hasRelationSign = (value) => value.includes('=') || INEQUALITY_SIGN.test(value);
const isEquationText = (value) => value.includes('=') && !INEQUALITY_SIGN.test(value);
// The keys gradeStage compares against: `anyOf`, else `equals`, else the rule.
const equationKeys = (rule) => {
  const expected = isPlainObject(rule) ? (rule.anyOf ?? rule.equals) : rule;
  return (Array.isArray(expected) ? expected : [expected]).filter((key) => typeof key === 'string' && key.trim() !== '');
};
const equationStepSentence = (stage, rule, response) => {
  const written = typeof response === 'string' ? response.trim() : '';
  const keys = equationKeys(rule);
  if (!written || !keys.length) return '';
  const lineKeys = keys.filter((key) => sameLine(written, key));
  if (!lineKeys.length) {
    const bare = !hasRelationSign(written) && stage?.acceptEquivalentFunctionRule !== true;
    return bare && keys.every(isEquationText) ? NOT_AN_EQUATION : '';
  }
  const keyForms = [...new Set(lineKeys.map((key) => writtenLineForm(key)).filter(Boolean))];
  const asked = requestedLineForm([stage?.prompt, stage?.placeholder, stage?.stepLabel]);
  if (keyForms.length > 1 || (asked && keyForms.length && asked !== keyForms[0])) return '';
  const form = asked || keyForms[0];
  if (!form || writtenLineForm(written) === form) return '';
  if (form !== LINE_FORMS.STANDARD && isVerticalLine(lineKeys[0])) return '';
  return studentMisconceptionMessage(LINE_FORM_CODES[form]) || '';
};

export const STAGE_REASON_ALLOWLIST = Object.freeze({
  graphFeatureSelect: [],
  pointInput: [],
  quantityRoles: [[/^Check the .+ quantity\.$/, () => 'Check which quantity is independent and which is dependent.']],
  axisSetup: [[/^Check the .+\.$/, (detail, stage, rule) => axisFieldsSentence(stage, rule)]],
  tableInput: [
    [/^\d+ value\(s\) do not follow the function you wrote\.$/, PASS],
    [/^\d+ of \d+ values do not match\.$/, () => 'Some values in your table do not match.'],
  ],
  coordinatePlot: PLOT_LINES,
  functionGraph: PLOT_LINES,
  mappingDiagram: [[/^The arrows do not match the relation — check which value each one is joined to\.$/, PASS]],
  valueSet: SET_LINE,
  domainInput: SET_LINE,
  rangeInput: SET_LINE,
  figureMatch: [[/^\d+ of \d+ figures are in the right category\.$/, PASS]],
  equationInput: [[/^Not correct yet\.$/, (detail, stage, rule, response) => equationStepSentence(stage, rule, response)]],
});

/**
 * What the screen says for one failed stage's detail: a sentence, or ''. The
 * student's own response is read only by a kind whose reason is about how it
 * was written (equationInput).
 */
export const stageReasonFor = (stage, detail, gradingRule = null, response = undefined) => {
  const text = typeof detail === 'string' ? detail.trim() : '';
  const entry = (STAGE_REASON_ALLOWLIST[stage?.kind] || []).find(([shape]) => shape.test(text));
  return entry ? String(entry[1](text, stage, gradingRule, response) || '').slice(0, 240) : '';
};

/** `{ [stageId]: sentence }` for the stages graded wrong that may say why. */
export const failedStageReasons = (parts, stages = [], grading = null, responses = null) => {
  const byId = new Map((Array.isArray(stages) ? stages : []).filter((stage) => stage?.id).map((stage) => [String(stage.id), stage]));
  const rules = grading && typeof grading === 'object' ? grading : {};
  const written = isPlainObject(responses) ? responses : {};
  return Object.fromEntries((Array.isArray(parts) ? parts : [])
    .filter((part) => part && part.graded !== false && part.isCorrect !== true && part.id)
    .map((part) => [String(part.id), stageReasonFor(byId.get(String(part.id)), part.detail, rules[String(part.id)] ?? null, written[String(part.id)])])
    .filter(([, reason]) => reason));
};

/**
 * Mark normalized work (`{ responses }`) against the authoritative question.
 * Pure. The work must already have crossed the contract (readToolWork) — use
 * `grade` or gradeComposedWorkflowCheck, never raw browser state.
 */
export const gradeComposedWorkflowWork = (question, work, { stageReasons = false } = {}) => {
  const { composed, support } = resolveComposedWorkflow(question);
  if (!support.supported) return ungradedResult(support.reason, { mode: support.mode || null });
  if (!isPlainObject(work)) return ungradedResult('empty-response', { mode: support.mode });
  // A tampered response with no stage map is a submission with nothing in it:
  // every stage unanswered, exactly what an empty workflow reports. What each
  // table was built from is rebuilt from the responses it copies, never read
  // from the work (composedWorkflowContract.mjs withDerivedTableSources).
  const sent = isPlainObject(work.responses) ? work.responses : {};
  const responses = withDerivedTableSources({ workflow: composed.workflow, content: composed.content, responses: sent });
  // Student text that would make the expression engine allocate, loop or
  // reconfigure itself is never run here (expressionSafety.mjs): no verdict,
  // and ingestion holds the attempt for review.
  const unsafeStage = unsafeExpressionStage({
    workflow: composed.workflow,
    grading: composed.grading,
    responses,
    active: activeStageIds(composed.workflow, responses),
  });
  if (unsafeStage) return ungradedResult('unsafe-expression', { mode: support.mode, detail: `stage:${unsafeStage}`.slice(0, 120) });
  const marked = gradeWorkflow({
    stages: composed.workflow,
    responses: withGraphStageVerdicts({ composed, responses, outcomesWithheld: work.outcomesWithheld === true }),
    grading: composed.grading,
  });
  const percent = Number(marked.partialCreditPercent);
  return {
    ...gradedResult({
      parts: marked.parts.map((part) => ({ ...part, response: sent[part.id] ?? '' })),
      isComplete: marked.isComplete,
      isCorrect: marked.isCorrect,
      // The workflow's own number (capped at 90 until all graded stages are
      // right); attemptInputsFromGrading turns it back into the same percent.
      score: marked.partialCreditPercent !== null && Number.isFinite(percent) ? percent / 100 : 0,
    }),
    mode: support.mode,
    ...(stageReasons ? { stageReasons: failedStageReasons(marked.parts, composed.workflow, composed.grading, responses) } : {}),
  };
};

const grade = (question, response, options = {}) => {
  if (!isToolResponse(response) || text(response.toolId) !== COMPOSED_WORKFLOW_TOOL_ID) {
    return ungradedResult('response-tool-mismatch');
  }
  const claimedVersion = Math.max(1, Math.floor(Number(response.contractVersion) || 1));
  // A newer client than this server: the work is kept, the verdict waits.
  if (claimedVersion > COMPOSED_WORKFLOW_CONTRACT_VERSION) return ungradedResult('response-contract-newer-than-server');
  const read = readToolWork(response);
  if (!read.ok) return ungradedResult(read.reason);
  return gradeComposedWorkflowWork(question, read.work, options);
};

/**
 * The browser's Check: mark the work through the exact bytes the server will
 * parse (the same bounding, dropped keys and oversize refusal), and return the
 * tool response that travels with the attempt. `supported: false` means the
 * question is declared client-graded (see composedWorkflowContract.mjs) and
 * carries no shared verdict.
 */
export const gradeComposedWorkflowCheck = (question, work) => {
  const { support } = resolveComposedWorkflow(question);
  const toolResponse = buildToolResponse({
    question,
    toolId: COMPOSED_WORKFLOW_TOOL_ID,
    mode: support.mode,
    contractVersion: COMPOSED_WORKFLOW_CONTRACT_VERSION,
    work,
  });
  if (!support.supported) {
    return { ...ungradedResult(support.reason), mode: support.mode || null, supported: false, toolResponse };
  }
  return { ...grade(question, toolResponse, { stageReasons: true }), supported: true, toolResponse };
};

export default Object.freeze({
  // Only the structured composed-workflow response. A pre-contract client's
  // opaque `JSON.stringify(responses)` keeps the bounded legacy path.
  accepts: (response) => isToolResponse(response) && text(response.toolId) === COMPOSED_WORKFLOW_TOOL_ID,
  // The server's grade: two arguments, never the screen's stage reasons.
  grade: (question, response) => grade(question, response),
});

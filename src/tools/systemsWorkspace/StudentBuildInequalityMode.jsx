import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import useMathUndoHistory, { questionUndoResetKey } from '../../platform/workView/useMathUndoHistory.js';
import { ResultPill, HintPanel } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { parseNumericAnswer } from '../shared/toolMath';
import { useToolRuntimeContext } from '../shared/ToolRuntimeContext';
import {
  INEQUALITY_STEP_COMPLETION_TEXT,
  REASONING_COMPLETION_TEXT,
  resolveInequalityBuildGate,
} from './inequalityBuildPolicy.js';
import {
  boundaryWithChosenSide,
  classifyFeasibleRegion,
  explicitBooleanAnswerMatches,
  feasibleRegionPolygon as feasibleRegionPolygonGeneral,
  feasibleRegionVertices,
  modelingEntryToCanonical,
  pointMembership,
  pointOnBoundaryIndex,
  pointOnBoundaryLine,
  sideOfBoundaryLine,
  studentBoundaryLineFromEntry,
  studentBuildConstraintStatus,
  studentBuildInequalityTask,
  studentBuildWorkingConstraints,
  vertexInclusionExpected,
} from './inequalityBuilderAdapter';
import useToolSubmission from '../shared/useToolSubmission';
import { UNANSWERED } from '../shared/judgmentChoices.js';
import useReportToolWork from '../shared/useReportToolWork.js';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import systemsWorkspaceGrader from '../../../functions/shared/serverGrading/tools/systemsWorkspace.mjs';
import EmbeddedInequalityRewrite from './EmbeddedInequalityRewrite.jsx';
import { formatSlopeInterceptInequality } from './linearInequalityEngine.js';
import { formatInequality, formatModelingConstraint, formatPoint } from './inequalityFormat.js';
import {
  STEP_LABELS,
  buildFlowPlan,
  constraintPosition,
  cursorAfterCheck,
  cursorForConstraint,
  graphTapAction,
  reasoningSignature,
  resolveBuildFlow,
  stepCheckPatch,
  stepCheckedAsItStands,
  stepPosition,
} from './inequalityBuildFlow.js';
import { ChoiceGroup, InequalityLayout, StepFeedback, revealStep } from './InequalityControls.jsx';
import { POINT_COLORS, constraintColor } from './constraintPalette.js';
import {
  BoundaryStepFields,
  CLASSIFICATION_OPTIONS,
  ConstraintCard,
  InequalityGraphLayers,
  LINE_STYLE_OPTIONS,
  ModelingFields,
  PhaseCard,
  STEP_INSTRUCTIONS,
  StepHeading,
  StepRow,
  TestPointQuestions,
  VertexList,
  boundaryInstruction,
} from './InequalityBuildPanels.jsx';

// ============================================================================
// STUDENT-BUILD INEQUALITY MODE
//
// Behind the explicit `questionData.studentBuild` / `reasoning` / `modeling`
// opt-in (studentBuildInequalityEnabled), a student builds every constraint of
// the system on the graph — rewrite, boundary, solid or dashed, which side to
// shade — combines them and reasons about the region.
//
// THE SCREEN IS ONE STEP AT A TIME (inequalityBuildFlow.js). The current step
// is the only thing expanded; finished steps are one-line summaries the student
// can reopen; a tap on the graph does whatever the current step needs, so no
// "Place point 1 on graph" button has to arm it first; a passing Check moves
// on by itself. The graph is a pinned stage beside (or above) the steps, so it
// never leaves the screen while it is being built or reasoned about
// (InequalityWorkspace.css).
//
// WHAT DID NOT CHANGE: what the student must do and how it is graded. Every
// step still has its own Check; nothing is drawn, placed or chosen for the
// student; the work sent to the shared grader is the same record (each build
// entry also carries what its last Check was about, which the grader does not
// read); and on a DOL, quiz or test every check still says only whether a step
// is finished (resolveInequalityBuildGate).
// ============================================================================

const emptyBuildEntry = () => ({
  method: '', x1: '', y1: '', x2: '', y2: '', slope: '', intercept: '', constant: '',
  point1Plotted: false, point2Plotted: false,
  boundaryAttempts: 0, style: '', styleAttempts: 0, shadePoint: null, shadeAttempts: 0, visible: true,
});

const emptyRewriteEntry = (source = '') => ({ source, steps: [], committedText:source, draft:source, pendingFlip:null, verifiedText:'', verifiedConstraint:null });

// The relation is the student's choice of symbol, so it starts unanswered: it
// opened on ≥, which was already right for every "at least" constraint.
const emptyModelingEntry = () => ({ coeffA: '', coeffB: '', relation: UNANSWERED, constant: '' });

const emptyTestPointResponse = (count) => ({
  overall: '', perInequality: Array.from({ length: count }, () => ''), onBoundary: '', boundaryIncluded: '',
});

// First miss stays neutral — a nudge to re-examine the work, not the rule
// itself. Only a repeated miss earns a more pointed (still non-revealing)
// follow-up. Matches the platform's staged-feedback philosophy: wrong answers
// do not immediately morph into the right one.
const staged = (attempts, first, later) => (attempts <= 1 ? first : later);

export default function StudentBuildInequalityMode({ questionData, onAction, draftKey = null }) {
  // What the question asks — build steps, reasoning, modeling, the hidden
  // expected constraints — resolved by the same function the shared grader
  // uses, so the steps shown here are exactly the steps that are marked.
  // Source constraints are presentation; expected constraints are hidden,
  // canonical grading truth. Never derive a student-facing label from the
  // latter merely because the canonical engine consumes it.
  const task = useMemo(() => studentBuildInequalityTask(questionData), [questionData]);
  const {
    buildConfig, hasBuildSteps, bounds, modeling, variables, sourceConstraints, expectedConstraints, constraintCount,
    boundaryProbeEnabled, teacherTestPoint, allowStudentTestPoint,
  } = task;
  const plan = useMemo(() => buildFlowPlan(task), [task]);

  const [modelingEntries, setModelingEntries] = usePersistentToolState('modelingEntries', () => (
    modeling ? Array.from({ length: constraintCount }, emptyModelingEntry) : []
  ));
  const [modelingSent, setModelingSent] = usePersistentToolState('modelingSent', !modeling);
  const [build, setBuild] = usePersistentToolState('build', () => Array.from({ length: constraintCount }, emptyBuildEntry));
  const [rewriteEntries, setRewriteEntries] = usePersistentToolState('rewriteEntries', () => (
    sourceConstraints.map((constraint) => emptyRewriteEntry(typeof constraint === 'string' ? constraint : formatInequality(constraint)))
  ));
  const modeledConstraints = useMemo(() => (
    modeling ? modelingEntries.map(modelingEntryToCanonical) : []
  ), [modeling, modelingEntries]);
  const workingConstraints = useMemo(() => studentBuildWorkingConstraints({
    task,
    modelingEntries,
    modelingSent,
    rewriteConstraints: buildConfig.rewrite ? rewriteEntries.map((entry) => entry?.verifiedConstraint || null) : [],
  }), [task, modelingEntries, modelingSent, buildConfig.rewrite, rewriteEntries]);
  const workingClassification = useMemo(() => classifyFeasibleRegion(workingConstraints), [workingConstraints]);
  const workingVertices = useMemo(() => feasibleRegionVertices(workingConstraints), [workingConstraints]);
  const modelingEntriesReady = !modeling || modeledConstraints.length === constraintCount && modeledConstraints.every(Boolean);
  // Which step is open (inequalityBuildFlow.js): navigation, not mathematics,
  // kept with the draft so a reload or a reopened Work View lands on it again.
  const [activeStep, setActiveStep] = usePersistentToolState('activeStep', null);
  const [combined, setCombined] = usePersistentToolState('combined', false);
  const [regionClassification, setRegionClassification] = usePersistentToolState('regionClassification', '');
  const [regionClassificationAttempts, setRegionClassificationAttempts] = usePersistentToolState('regionClassificationAttempts', 0);
  const [teacherPointResponse, setTeacherPointResponse] = usePersistentToolState('teacherPointResponse', () => emptyTestPointResponse(constraintCount));
  const [studentTestPoint, setStudentTestPoint] = usePersistentToolState('studentTestPoint', null);
  const [studentPointResponse, setStudentPointResponse] = usePersistentToolState('studentPointResponse', () => emptyTestPointResponse(constraintCount));
  const [vertices, setVertices] = usePersistentToolState('vertices', []);
  // The answer each reasoning Check was about, so its line (and its step's
  // mark) belongs to that answer and goes when the answer changes, instead of
  // re-judging every edit live.
  const [reasoningChecks, setReasoningChecks] = usePersistentToolState('reasoningChecks', {});
  // Why a tap on the graph did nothing, shown where the student is working.
  const [tapNotice, setTapNotice] = useState(null);
  const { feedback, submit } = useToolSubmission(onAction);
  // False on a DOL, quiz or test: there every check below says only whether
  // the work is finished (resolveInequalityBuildGate).
  const { showImmediateFeedback } = useToolRuntimeContext();

  const mathState = useMemo(() => ({
    modelingEntries, modelingSent, rewriteEntries, build, combined, regionClassification, regionClassificationAttempts,
    teacherPointResponse, studentTestPoint, studentPointResponse, vertices,
  }), [modelingEntries, modelingSent, rewriteEntries, build, combined, regionClassification, regionClassificationAttempts, teacherPointResponse, studentTestPoint, studentPointResponse, vertices]);
  const restore = useCallback((value) => {
    setModelingEntries(value?.modelingEntries || (modeling ? Array.from({ length: constraintCount }, emptyModelingEntry) : []));
    setModelingSent(value?.modelingSent ?? !modeling);
    setRewriteEntries(value?.rewriteEntries || sourceConstraints.map((constraint) => emptyRewriteEntry(typeof constraint === 'string' ? constraint : formatInequality(constraint))));
    setBuild(value?.build || Array.from({ length: constraintCount }, emptyBuildEntry));
    setCombined(Boolean(value?.combined));
    setRegionClassification(value?.regionClassification || '');
    setRegionClassificationAttempts(Number(value?.regionClassificationAttempts) || 0);
    setTeacherPointResponse(value?.teacherPointResponse || emptyTestPointResponse(constraintCount));
    setStudentTestPoint(value?.studentTestPoint || null);
    setStudentPointResponse(value?.studentPointResponse || emptyTestPointResponse(constraintCount));
    setVertices(value?.vertices || []);
  }, [constraintCount, modeling, sourceConstraints]);
  const undoHistory = useMathUndoHistory({ label: 'Undo the last student-build edit', state: mathState, onRestore: restore, resetKey: questionUndoResetKey(questionData) });

  const reopenModeling = () => {
    if (!modeling) return;
    setModelingSent(false);
    setCombined(false);
    setRegionClassification('');
    setRegionClassificationAttempts(0);
    setTeacherPointResponse(emptyTestPointResponse(constraintCount));
    setStudentTestPoint(null);
    setStudentPointResponse(emptyTestPointResponse(constraintCount));
    setVertices([]);
    setReasoningChecks({});
    setActiveStep('model');
  };

  const inequalityLabel = (index) => {
    if (modeling) return formatModelingConstraint(modelingEntries[index], variables);
    if (buildConfig.rewrite && rewriteEntries[index]?.verifiedConstraint) {
      return formatSlopeInterceptInequality(rewriteEntries[index].verifiedConstraint);
    }
    const source = sourceConstraints[index];
    return formatInequality(source);
  };

  const updateBuildEntry = (index, patch) => {
    // The step on screen stays there while the student works in it. With no
    // step chosen yet the screen shows the first one not done; where outcomes
    // are withheld a step is done the moment it is finished, so without this
    // the second boundary point moved the student on before they pressed Check.
    if (activeStep == null) setActiveStep(cursor);
    setBuild((current) => current.map((entry, i) => (i === index ? { ...entry, ...(typeof patch === 'function' ? patch(entry) : patch) } : entry)));
  };
  const updateModelingEntry = (index, key, value) => setModelingEntries((current) => current.map((entry, i) => (i === index ? { ...entry, [key]: value } : entry)));

  const studentLines = build.map(studentBoundaryLineFromEntry);
  const rewriteVerified = (index) => !buildConfig.rewrite || Boolean(rewriteEntries[index]?.verifiedConstraint);
  // A boundary the question provides is drawn once the constraint it belongs
  // to exists in the student's work: after their rewrite where they rewrite it.
  // Drawn before, a rewrite-only question showed the slope and intercept the
  // student was being asked to find.
  const effectiveLines = build.map((entry, index) => (
    buildConfig.boundary ? studentLines[index] : (rewriteVerified(index) ? workingConstraints[index] : null)
  ));
  // Whether each step's work is right comes from the SAME rule the shared
  // grader marks with (studentBuildConstraintStatus).
  const constraintStatus = Array.from({ length: constraintCount }, (_, index) => studentBuildConstraintStatus({
    buildConfig,
    entry: build[index],
    workingConstraint: workingConstraints[index],
    bounds,
    rewriteVerified: rewriteVerified(index),
  }));
  const stepStatus = (index, step) => constraintStatus[index]?.[step] === true;
  const boundaryCorrect = (index) => stepStatus(index, 'boundaryCorrect');
  const styleCorrect = (index) => stepStatus(index, 'styleCorrect');
  const shadeCorrect = (index) => stepStatus(index, 'shadeCorrect');
  // Whether a step's work is all there — never compared with the answer.
  const stepFinished = (index, step) => {
    const entry = build[index] || {};
    if (step === 'boundary') return Boolean(studentLines[index]);
    if (step === 'lineStyle') return entry.style === 'solid' || entry.style === 'dashed';
    const line = effectiveLines[index];
    return Boolean(line && entry.shadePoint && sideOfBoundaryLine(line, entry.shadePoint[0], entry.shadePoint[1]) !== 0);
  };
  const stepCorrect = (index, step) => (
    step === 'boundary' ? boundaryCorrect(index) : step === 'lineStyle' ? styleCorrect(index) : shadeCorrect(index)
  );
  // EVERY PLACE THIS MODE COULD SAY "RIGHT OR WRONG" BEFORE SUBMIT, DECIDED
  // ONCE: the step marks, the overlap lock, each check's line and the vertex
  // magnet. Where outcomes are shown a step is done once it was checked and is
  // right (the status's "verified", which the grader marks practice with) —
  // and only while its work is still the work that was checked; where they are
  // withheld, once it is finished. The grade itself is the shared grader's,
  // told by the work below which of the two applies.
  const buildGate = resolveInequalityBuildGate({
    showImmediateFeedback,
    buildConfig,
    build,
    constraintCount,
    rewriteVerified,
    stepCorrect,
    stepFinished,
    stepCheckedAsItStands: (index, step) => stepCheckedAsItStands(build[index], step),
  });
  const allConstraintsComplete = buildGate.allConstraintsDone;
  const completionLine = (report, text) => (report?.kind === 'completion' ? (report.complete ? text.complete : text.incomplete) : null);

  const studentBoundaries = build.map((entry, index) => {
    const line = effectiveLines[index];
    if (!line) return null;
    if (!buildConfig.shading) return workingConstraints[index];
    if (!entry.shadePoint) return null;
    const side = sideOfBoundaryLine(line, entry.shadePoint[0], entry.shadePoint[1]);
    if (side === 0) return null;
    const strict = buildConfig.lineStyle
      ? entry.style === 'dashed'
      : !String(workingConstraints[index]?.relation || '>=').includes('=');
    return boundaryWithChosenSide(line, side, strict);
  });
  const studentPolygon = combined && studentBoundaries.every(Boolean) ? feasibleRegionPolygonGeneral(studentBoundaries, bounds) : [];

  const onBoundaryIndex = (point) => pointOnBoundaryIndex(workingConstraints, point);
  const membership = (point) => pointMembership(workingConstraints, point);
  // Which boundary the student's OWN test point sits on, for its boundary
  // questions: a true one where outcomes are shown, one the student built where
  // they are withheld (probeFromOwnLines in inequalityBuildPolicy.js).
  const ownBoundaryIndex = (point) => (point ? effectiveLines.findIndex((line) => Boolean(line) && pointOnBoundaryLine(line, point[0], point[1], 0.12)) : -1);
  const studentProbeIndex = (point) => (buildGate.probeFromOwnLines ? ownBoundaryIndex(point) : onBoundaryIndex(point));

  // Where outcomes are withheld a step's Check says only whether the step is
  // finished, in the same words for right and wrong work. A line belongs to the
  // work it was about: edit the step and it goes until the next Check.
  const boundaryMessage = (index) => {
    const entry = build[index];
    if (!entry.boundaryAttempts) return null;
    if (!buildGate.verdictsShown) return completionLine(buildGate.stepReport(index, 'boundary'), INEQUALITY_STEP_COMPLETION_TEXT.boundary);
    if (!buildGate.stepReport(index, 'boundary')) return null;
    if (boundaryCorrect(index)) return 'Correct boundary.';
    return staged(entry.boundaryAttempts,
      'Check whether the points you used satisfy the boundary equation.',
      'Replace the inequality with = to get the boundary equation, then confirm both of your points make that equation true.');
  };
  const styleMessage = (index) => {
    const entry = build[index];
    if (!buildGate.verdictsShown) return completionLine(buildGate.stepReport(index, 'lineStyle'), INEQUALITY_STEP_COMPLETION_TEXT.lineStyle);
    if (!entry.styleAttempts || !entry.style || !buildGate.stepReport(index, 'lineStyle')) return null;
    if (styleCorrect(index)) return 'Correct line style.';
    return staged(entry.styleAttempts,
      'Check whether points on the boundary are included.',
      'Look at the relation symbol itself — does it allow the two sides to be equal?');
  };
  const shadeMessage = (index) => {
    const entry = build[index];
    if (!buildGate.verdictsShown) return completionLine(buildGate.stepReport(index, 'shading'), INEQUALITY_STEP_COMPLETION_TEXT.shading);
    if (!entry.shadeAttempts || !entry.shadePoint || !buildGate.stepReport(index, 'shading')) return null;
    if (shadeCorrect(index)) return 'Correct shading.';
    return staged(entry.shadeAttempts,
      'Use a test point or compare the inequality to its boundary.',
      'Substitute the coordinates you shaded into the original inequality. If it is false, shade the other side instead.');
  };
  const stepMessage = (index, step) => (step === 'boundary' ? boundaryMessage(index) : step === 'lineStyle' ? styleMessage(index) : shadeMessage(index));
  const stepTone = (index, step) => (!buildGate.verdictsShown ? 'recorded' : stepCorrect(index, step) ? 'correct' : 'revise');

  // What the student said about a point, judged only once they check it.
  // `probeIndex`: the boundary the point's boundary questions were shown for
  // (the student's own point: studentProbeIndex).
  const pointReport = (point, response, probeIndex = onBoundaryIndex(point)) => {
    if (!point) return null;
    const boundaryIndex = onBoundaryIndex(point);
    if (!buildGate.verdictsShown) {
      // Recorded, not judged: every question about the point answered or not —
      // the boundary questions exactly when they are on screen.
      const complete = response.perInequality.every((value) => value === 'yes' || value === 'no')
        && (response.overall === 'yes' || response.overall === 'no')
        && (!boundaryProbeEnabled || probeIndex < 0 || (Boolean(response.onBoundary) && Boolean(response.boundaryIncluded)));
      return { done: complete, tone: 'recorded', text: completionLine(buildGate.reasoningReport({ pressed: true, complete }), REASONING_COMPLETION_TEXT) };
    }
    const expectedMembership = membership(point);
    const perInequalityCorrect = response.perInequality.every((value, index) => explicitBooleanAnswerMatches(value, expectedMembership[index]));
    const overallCorrect = explicitBooleanAnswerMatches(response.overall, expectedMembership.every(Boolean));
    const boundaryProbeCorrect = !boundaryProbeEnabled || boundaryIndex < 0 || (
      (response.onBoundary === 'yes') && explicitBooleanAnswerMatches(response.boundaryIncluded, expectedMembership.every(Boolean))
    );
    if (perInequalityCorrect && overallCorrect && boundaryProbeCorrect) return { done: true, tone: 'correct', text: 'Correct — every part of your reasoning about this point checks out.' };
    if (!perInequalityCorrect) return { done: false, tone: 'revise', text: 'At least one individual inequality is misjudged. Substitute the point into that inequality by itself and see whether the statement is true.' };
    if (!overallCorrect) return { done: false, tone: 'revise', text: 'Your individual inequality answers are right, but the system verdict is not. A point solves the system only when it satisfies every inequality at once.' };
    return {
      done: false,
      tone: 'revise',
      text: boundaryProbeEnabled && boundaryIndex >= 0
        ? 'Re-examine whether this exact boundary is drawn solid or dashed at this point.'
        : 'Not quite — recheck your reasoning.',
    };
  };

  const vertexIncludedExpected = (vertex) => vertexInclusionExpected(workingVertices, vertex);
  const vertexReport = (vertex) => {
    if (!buildGate.verdictsShown) {
      // Not even whether the tap landed on a true corner: that is a verdict.
      const complete = vertex?.includedAnswer === 'yes' || vertex?.includedAnswer === 'no';
      return { done: complete, tone: 'recorded', text: completionLine(buildGate.reasoningReport({ pressed: true, complete }), REASONING_COMPLETION_TEXT) };
    }
    const expected = vertexIncludedExpected(vertex);
    if (expected == null) return { done: false, tone: 'revise', text: 'That point does not look like a corner of this system yet. Try tapping exactly where two boundary lines cross.' };
    const correct = explicitBooleanAnswerMatches(vertex.includedAnswer, expected);
    return correct
      ? { done: true, tone: 'correct', text: 'Correct — you identified whether this corner is actually part of the solution set.' }
      : { done: false, tone: 'revise', text: 'Look at the two boundaries meeting at that exact point. If either one is dashed there, the corner is excluded even though the lines still cross.' };
  };

  // The classification line, once checked and only for the answer that was.
  const classificationReport = () => {
    if (regionClassificationAttempts <= 0 || reasoningChecks.classify !== reasoningSignature(regionClassification)) return null;
    if (!buildGate.verdictsShown) {
      return { done: Boolean(regionClassification), tone: 'recorded', text: completionLine(buildGate.reasoningReport({ pressed: true, complete: Boolean(regionClassification) }), REASONING_COMPLETION_TEXT) };
    }
    if (!regionClassification) return null;
    return regionClassification === workingClassification
      ? { done: true, tone: 'correct', text: 'Correct classification.' }
      : {
        done: false,
        tone: 'revise',
        text: staged(regionClassificationAttempts,
          'Look at whether the shaded overlap keeps going forever in some direction, closes into a polygon, or never forms at all.',
          'A region is unbounded when the constraints leave a direction open forever. If no point satisfies every inequality at once, there is no solution.'),
      };
  };
  const teacherPointSignature = reasoningSignature(teacherPointResponse);
  const studentPointSignature = reasoningSignature({ point: studentTestPoint, response: studentPointResponse });
  const verticesSignature = reasoningSignature(vertices);
  const teacherPointChecked = Boolean(teacherTestPoint) && reasoningChecks.teacherPoint === teacherPointSignature;
  const studentPointChecked = Boolean(studentTestPoint) && reasoningChecks.studentPoint === studentPointSignature;
  const verticesChecked = vertices.length > 0 && reasoningChecks.vertices === verticesSignature;
  const teacherReport = teacherPointChecked ? pointReport([teacherTestPoint.x, teacherTestPoint.y], teacherPointResponse) : null;
  const studentReport = studentPointChecked ? pointReport(studentTestPoint, studentPointResponse, studentProbeIndex(studentTestPoint)) : null;
  const vertexReports = verticesChecked ? vertices.map(vertexReport) : [];
  const reasoningDone = (phase) => {
    if (phase === 'classify') return Boolean(classificationReport()?.done);
    if (phase === 'teacherPoint') return Boolean(teacherReport?.done);
    if (phase === 'studentPoint') return Boolean(studentReport?.done);
    if (phase === 'vertices') return vertexReports.length > 0 && vertexReports.every((report) => report.done);
    return false;
  };

  // ------------------------------------------------------------ the steps
  const flowContext = {
    plan,
    modelingSent,
    stepDone: (index, step) => (step === 'rewrite' ? rewriteVerified(index) : buildGate.stepDone(index, step)),
    combined,
    reasoningDone,
    cursor: activeStep,
  };
  const flow = resolveBuildFlow(flowContext);
  const cursor = flow.cursor;
  const parsedCursor = flow.parsedCursor;
  const tapAction = graphTapAction({ cursor, build, plan, rewriteVerified });

  // A step that opens because a Check passed takes focus, so the next thing a
  // keyboard or screen-reader student meets is the step they are now on.
  const focusNextStep = useRef(false);
  const sideRef = useRef(null);
  const moveCursor = (next, { focus = false } = {}) => {
    setTapNotice(null);
    setActiveStep(next);
    focusNextStep.current = focus;
  };
  useEffect(() => {
    if (!focusNextStep.current) return;
    focusNextStep.current = false;
    const heading = sideRef.current?.querySelector?.('[data-step-heading="current"]');
    if (!heading) return;
    heading.focus?.({ preventScroll: true });
    revealStep(heading);
  }, [cursor]);

  const checkStep = (index, step) => {
    const entry = build[index] || {};
    const doneNow = buildGate.verdictsShown ? stepCorrect(index, step) : stepFinished(index, step);
    updateBuildEntry(index, stepCheckPatch(entry, step));
    const position = stepPosition(index, step);
    const next = cursorAfterCheck(flowContext, position, doneNow);
    if (next !== position) moveCursor(next, { focus: true });
  };

  const checkReasoning = (phase) => {
    const signature = phase === 'classify' ? reasoningSignature(regionClassification)
      : phase === 'teacherPoint' ? teacherPointSignature
        : phase === 'studentPoint' ? studentPointSignature
          : verticesSignature;
    setReasoningChecks((current) => ({ ...current, [phase]: signature }));
    if (phase === 'classify') setRegionClassificationAttempts((n) => n + 1);
    // Whether this Check completes the step, from the answer as it stands.
    const report = phase === 'classify'
      ? (!buildGate.verdictsShown ? { done: Boolean(regionClassification) } : { done: Boolean(regionClassification) && regionClassification === workingClassification })
      : phase === 'teacherPoint' ? pointReport([teacherTestPoint.x, teacherTestPoint.y], teacherPointResponse)
        : phase === 'studentPoint' ? pointReport(studentTestPoint, studentPointResponse, studentProbeIndex(studentTestPoint))
          : { done: vertices.length > 0 && vertices.map(vertexReport).every((item) => item.done) };
    const next = cursorAfterCheck(flowContext, phase, Boolean(report?.done));
    if (next !== phase) moveCursor(next, { focus: true });
  };

  const combineRegions = () => {
    setCombined(true);
    moveCursor(cursorAfterCheck(flowContext, 'combine', true), { focus: true });
  };

  const sendModel = () => {
    setModelingSent(true);
    moveCursor(cursorAfterCheck(flowContext, 'model', true), { focus: true });
  };

  const onRewriteChange = (index, next) => {
    setRewriteEntries((current) => current.map((item, i) => (i === index ? next : item)));
    // The rewrite has no Check: the solver verifies it the moment y is alone in
    // an equivalent form, and the boundary step opens.
    if (next?.verifiedConstraint && !rewriteEntries[index]?.verifiedConstraint && cursor === stepPosition(index, 'rewrite')) {
      moveCursor(cursorAfterCheck(flowContext, stepPosition(index, 'rewrite'), true), { focus: true });
    }
  };

  // ------------------------------------------------------- the graph's taps
  const handlePlot = (point) => {
    const [px, py] = point;
    if (tapAction.kind === 'boundaryPoint') {
      const { index, which } = tapAction;
      if (!rewriteVerified(index)) return;
      updateBuildEntry(index, (entry) => ({
        method: entry.method || 'points',
        ...(which === 1 ? { x1: px, y1: py, point1Plotted: true } : { x2: px, y2: py, point2Plotted: true }),
      }));
      setTapNotice(null);
    } else if (tapAction.kind === 'boundaryFull') {
      setTapNotice('Both points are on the graph. Drag a point to move it, or remove one with × and tap to plot it again.');
    } else if (tapAction.kind === 'shade') {
      const { index } = tapAction;
      const line = effectiveLines[index];
      if (!line) {
        setTapNotice('This constraint has no boundary line on the graph yet.');
        return;
      }
      if (sideOfBoundaryLine(line, px, py) === 0) {
        setTapNotice('That point is on the boundary line. Tap a point on the side you want to shade.');
        return;
      }
      updateBuildEntry(index, { shadePoint: [px, py] });
      setTapNotice(null);
    } else if (tapAction.kind === 'vertex') {
      const snapTolerance = Math.max(bounds.xMax - bounds.xMin, bounds.yMax - bounds.yMin) * 0.05;
      let best = null;
      let bestDistance = Infinity;
      // The true corners are a magnet only where outcomes are shown: landing a
      // tap exactly on the answer is a verdict. The student's own region's
      // corners are their work and always snap.
      [...(buildGate.snapToExpectedVertices ? workingVertices : []), ...feasibleRegionVertices(studentBoundaries.filter(Boolean))].forEach((v) => {
        const distance = Math.hypot(v.x - px, v.y - py);
        if (distance < bestDistance) { bestDistance = distance; best = v; }
      });
      const landed = best && bestDistance <= snapTolerance ? { x: best.x, y: best.y } : { x: px, y: py };
      setVertices((current) => {
        if (current.some((v) => Math.hypot(v.x - landed.x, v.y - landed.y) <= 1e-6)) return current;
        return [...current, { x: landed.x, y: landed.y, includedAnswer: '' }];
      });
    } else if (tapAction.kind === 'testPoint') {
      setStudentTestPoint([px, py]);
      setStudentPointResponse(emptyTestPointResponse(constraintCount));
    }
  };

  const removeBoundaryPoint = (index, which) => {
    updateBuildEntry(index, which === 1 ? { x1: '', y1: '', point1Plotted: false } : { x2: '', y2: '', point2Plotted: false });
    setTapNotice(null);
  };

  // The student's work — every piece of state the final check marks: what
  // Check grades and what a deadline would submit. Answer reasoning about a
  // point is sent only when that point is in play, as before. On a DOL, quiz
  // or test no step Check here was a verdict, so the work says so and the
  // shared grader marks each constraint from its work as it stands.
  const teacherPointApplicable = Boolean(teacherTestPoint);
  const studentPointApplicable = allowStudentTestPoint && Boolean(studentTestPoint);
  const work = {
    ...(modeling ? { modelingEntries, modelingSent: Boolean(modelingSent) } : {}),
    ...(buildConfig.rewrite ? {
      rewrite: rewriteEntries.map((entry) => ({
        relation: String(entry?.committedText ?? '').slice(0, 300),
        // The student's rewritten inequality in graphing form ({A, B: 1, C,
        // relation}), or null while y is not yet alone on the left. Drafts
        // saved before this field existed kept it only once verified.
        graphingForm: entry?.graphingForm !== undefined ? entry.graphingForm : (entry?.verifiedConstraint || null),
      })),
    } : {}),
    build,
    regionClassification,
    ...(teacherPointApplicable ? { teacherPointResponse } : {}),
    ...(studentPointApplicable ? { studentTestPoint, studentPointResponse } : {}),
    vertices,
    ...(buildGate.verdictsShown ? {} : { outcomesWithheld: true }),
  };
  useReportToolWork(work);

  const finalCheck = () => {
    const result = gradeToolCheck(systemsWorkspaceGrader, questionData, work);
    submit({ isCorrect: result.isCorrect, score: result.score }, work, { mode: 'inequalities-studentBuild', parts: result.parts });
  };

  // ------------------------------------------------------------- the graph
  // Only the constraint being built shows its boundary points, as handles the
  // student can drag; finished constraints are their lines. Labels are drawn
  // below with the theme's graph-label colour (the plane's own labels are a
  // fixed dark ink that disappears on the dark graph).
  const boundaryStepIndex = parsedCursor.kind === 'step' && parsedCursor.step === 'boundary' ? parsedCursor.index : null;
  const graphPoints = [];
  const graphPointRoles = [];
  if (boundaryStepIndex != null) {
    const entry = build[boundaryStepIndex] || {};
    [1, 2].forEach((which) => {
      if (!entry[`point${which}Plotted`]) return;
      const x = parseNumericAnswer(entry[`x${which}`]);
      const y = parseNumericAnswer(entry[`y${which}`]);
      if (x == null || y == null) return;
      graphPoints.push({ x, y, fill: constraintColor(boundaryStepIndex), r: 7 });
      graphPointRoles.push({ kind: 'boundary', index: boundaryStepIndex, which, label: String(which) });
    });
  }
  if (teacherTestPoint) {
    graphPoints.push({ x: teacherTestPoint.x, y: teacherTestPoint.y, fill: POINT_COLORS.teacherPoint, movable: false });
    graphPointRoles.push({ kind: 'teacher', label: formatPoint(teacherTestPoint.x, teacherTestPoint.y) });
  }
  if (studentTestPoint) {
    graphPoints.push({ x: studentTestPoint[0], y: studentTestPoint[1], fill: POINT_COLORS.studentPoint, movable: false });
    graphPointRoles.push({ kind: 'student', label: 'Your point' });
  }
  vertices.forEach((v, index) => {
    graphPoints.push({ x: v.x, y: v.y, fill: POINT_COLORS.vertex, movable: false });
    graphPointRoles.push({ kind: 'vertex', label: String.fromCharCode(65 + index) });
  });
  const handleMovePoint = (planeIndex, point) => {
    const role = graphPointRoles[planeIndex];
    if (role?.kind !== 'boundary') return;
    const [px, py] = point;
    updateBuildEntry(role.index, role.which === 1 ? { x1: px, y1: py, point1Plotted: true } : { x2: px, y2: py, point2Plotted: true });
    setTapNotice(null);
  };
  const graphInteractive = tapAction.kind !== 'none';
  // The active constraint stands out while it is being built; in the combine
  // and reasoning steps every constraint is drawn alike.
  const emphasised = (index) => flow.activeIndex == null || flow.activeIndex === index;
  const hatchId = `mm-ineq-overlap-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  // Named for what a tap will do, after a fixed prefix the browser gates find
  // the plane by.
  const graphLabel = `Student-constructed graph of the inequality system${(() => {
    if (tapAction.kind === 'boundaryPoint') return `. Plot ${tapAction.method === 'slopeIntercept' && tapAction.which === 1 ? 'the y-intercept' : `boundary point ${tapAction.which}`} for constraint ${tapAction.index + 1}`;
    if (tapAction.kind === 'boundaryFull') return `. Both boundary points of constraint ${tapAction.index + 1} are placed`;
    if (tapAction.kind === 'shade') return `. Choose the side to shade for constraint ${tapAction.index + 1}`;
    if (tapAction.kind === 'testPoint') return '. Place your own test point';
    if (tapAction.kind === 'vertex') return '. Mark a vertex of the solution region';
    return '';
  })()}`;

  // ------------------------------------------------------------ rendering
  const stepCount = plan.constraintSteps.length;
  const constraintState = (index) => {
    if (flow.activeIndex === index) return 'current';
    return flow.constraintDone(index) ? 'done' : flow.isAvailable(constraintPosition(index)) ? 'open' : 'locked';
  };
  const stepSummary = (index, step) => {
    const entry = build[index] || {};
    if (step === 'rewrite') return rewriteEntries[index]?.verifiedConstraint ? formatSlopeInterceptInequality(rewriteEntries[index].verifiedConstraint) : '';
    if (step === 'boundary') {
      if (entry.method === 'vertical') return `x = ${entry.constant}`;
      if (entry.method === 'horizontal') return `y = ${entry.constant}`;
      const points = [1, 2].filter((which) => entry[`point${which}Plotted`]).map((which) => formatPoint(entry[`x${which}`], entry[`y${which}`]));
      return points.length ? `Through ${points.join(' and ')}` : '';
    }
    if (step === 'lineStyle') return entry.style === 'solid' ? 'Solid' : entry.style === 'dashed' ? 'Dashed' : '';
    if (step === 'shading') return Array.isArray(entry.shadePoint) ? `Shaded the side with ${formatPoint(entry.shadePoint[0], entry.shadePoint[1])}` : '';
    return '';
  };
  const doneMark = buildGate.verdictsShown ? '✓' : '●';
  const doneTone = buildGate.verdictsShown ? 'verdict' : 'recorded';

  const renderStepBody = (index, step) => {
    const position = stepPosition(index, step);
    const count = `Step ${plan.constraintSteps.indexOf(step) + 1} of ${stepCount}`;
    if (step === 'rewrite') {
      return (
        <div className="mm-ineq-step-body" data-step-body={position}>
          <StepHeading label={STEP_LABELS.rewrite} count={count} />
          <EmbeddedInequalityRewrite
            source={rewriteEntries[index]?.source || inequalityLabel(index)}
            expectedConstraint={expectedConstraints[index]}
            value={rewriteEntries[index]}
            onChange={(next) => onRewriteChange(index, next)}
            draftKey={draftKey ? `${draftKey}:systems-rewrite:${index}` : null}
          />
        </div>
      );
    }
    const entry = build[index] || {};
    return (
      <div className="mm-ineq-step-body" data-step-body={position}>
        <StepHeading label={STEP_LABELS[step]} count={count} />
        {step === 'boundary' ? (
          <BoundaryStepFields
            entry={entry}
            index={index}
            onPatch={(patch) => updateBuildEntry(index, patch)}
            onRemovePoint={(which) => removeBoundaryPoint(index, which)}
          />
        ) : null}
        {step === 'lineStyle' ? (
          <ChoiceGroup
            name="line-style"
            legend={STEP_INSTRUCTIONS.lineStyle}
            options={LINE_STYLE_OPTIONS}
            value={entry.style}
            onChange={(style) => updateBuildEntry(index, { style })}
          />
        ) : null}
        {step === 'shading' ? (
          <>
            <p className="mm-ineq-instruction">{STEP_INSTRUCTIONS.shading}</p>
            {entry.shadePoint ? <p className="mm-ineq-note">Shaded the side with {formatPoint(entry.shadePoint[0], entry.shadePoint[1])}. Tap the other side to change it.</p> : null}
          </>
        ) : null}
        {tapNotice ? <p className="mm-ineq-note" role="status">{tapNotice}</p> : null}
        <div className="mm-ineq-actions">
          <button type="button" className="mm-ineq-action" onClick={() => checkStep(index, step)}>
            {{ boundary: 'Check boundary', lineStyle: 'Check line style', shading: 'Check shading' }[step]}
          </button>
        </div>
        <StepFeedback tone={stepTone(index, step)}>{stepMessage(index, step)}</StepFeedback>
      </div>
    );
  };

  const renderConstraintCard = (index) => {
    const expanded = flow.activeIndex === index;
    const progress = flow.constraintProgress(index);
    const finished = Boolean(stepCount) && progress.done === progress.total;
    const visible = build[index]?.visible !== false;
    const segmentState = (state) => (state === 'done' ? (buildGate.verdictsShown ? 'done' : 'recorded') : state === 'current' ? 'current' : undefined);
    return (
      <ConstraintCard
        key={index}
        index={index}
        label={inequalityLabel(index)}
        expanded={expanded}
        state={constraintState(index)}
        progress={plan.constraintSteps.map((step) => ({ step, state: segmentState(flow.positionState(stepPosition(index, step))) }))}
        statusText={!stepCount ? 'Given' : finished ? (buildGate.verdictsShown ? '✓ Done' : '● Recorded') : `${progress.done} of ${progress.total} steps`}
        statusTone={finished ? (buildGate.verdictsShown ? 'done' : 'recorded') : undefined}
        visible={visible}
        disabled={!stepCount}
        onToggle={() => moveCursor(cursorForConstraint(flowContext, index))}
        onToggleVisible={() => updateBuildEntry(index, { visible: !visible })}
      >
        {expanded && stepCount ? (
          <ol className="mm-ineq-steps">
            {plan.constraintSteps.map((step) => {
              const position = stepPosition(index, step);
              const state = flow.positionState(position);
              if (state === 'current') return <li key={step} data-build-step={step} data-step-state="current">{renderStepBody(index, step)}</li>;
              return (
                <StepRow
                  key={step}
                  step={step}
                  label={STEP_LABELS[step]}
                  order={plan.constraintSteps.indexOf(step) + 1}
                  state={state}
                  summary={state === 'done' ? stepSummary(index, step) : ''}
                  doneMark={doneMark}
                  doneTone={doneTone}
                  verdictsShown={buildGate.verdictsShown}
                  constraintNumber={index + 1}
                  onOpen={() => moveCursor(position, { focus: true })}
                />
              );
            })}
          </ol>
        ) : null}
      </ConstraintCard>
    );
  };

  // Combine and each reasoning step: one row until it is the step being worked on.
  const phaseCard = (phase, title, body, summary = '') => (
    <PhaseCard
      key={phase}
      phase={phase}
      title={title}
      state={flow.positionState(phase)}
      summary={summary}
      doneMark={doneMark}
      doneTone={doneTone}
      onOpen={() => moveCursor(phase, { focus: true })}
    >
      {body}
    </PhaseCard>
  );

  const inequalityLabels = Array.from({ length: constraintCount }, (_, i) => inequalityLabel(i));
  // The reasoning still to come, named on the Combine row until the regions are
  // combined: one line instead of a locked card per step.
  const reasoningTitle = (phase) => (phase === 'teacherPoint' ? `Test the point ${formatPoint(teacherTestPoint.x, teacherTestPoint.y)}` : STEP_LABELS[phase]);
  const reasoningPreview = plan.reasoningSteps.map((phase) => reasoningTitle(phase).toLowerCase()).join(' · ');
  const classification = classificationReport();
  const currentInstruction = (() => {
    if (parsedCursor.kind === 'step') {
      const prefix = `Constraint ${parsedCursor.index + 1}: `;
      if (parsedCursor.step === 'rewrite') return `${prefix}rewrite the inequality so y is alone on the left.`;
      if (parsedCursor.step === 'boundary') return `${prefix}${boundaryInstruction(build[parsedCursor.index]?.method).toLowerCase()}`;
      return `${prefix}${STEP_INSTRUCTIONS[parsedCursor.step].toLowerCase()}`;
    }
    if (cursor === 'model') return 'Write each constraint, then graph them.';
    if (cursor === 'combine') return 'Show where the shaded regions overlap.';
    if (cursor === 'classify') return 'Classify the combined solution region.';
    if (cursor === 'teacherPoint') return 'Test the marked point against each inequality.';
    if (cursor === 'studentPoint') return 'Tap the graph to place a test point of your own, then test it.';
    if (cursor === 'vertices') return 'Tap each corner of the solution region and say whether it is included.';
    return hasBuildSteps
      ? 'Build each constraint, combine them, and reason about the result.'
      : 'Use the provided system to combine regions and complete the requested reasoning.';
  })();

  return (
    <EnlargeableFigure label="Student-build inequality workspace" enlargeLabel="Enlarge system workspace" style={{ width:'100%' }} capabilities={{
      undo: undoHistory.capability,
      equationInput: { label: modeling ? 'Constraints you write' : 'Every inequality', studentState: true },
      numericControls: { label: 'Boundary, style, shading and reasoning controls', studentState: true },
      pointEditing: { label: 'Boundary points, shading side, test points and vertices', studentState: true },
      // The step being worked on, so the enlarged view's header says what the
      // graph is waiting for.
      instruction: { text: currentInstruction },
      primaryActions: [{ id: 'check-student-build', label: 'Check my work', onAction: finalCheck }],
    }}>
      <InequalityLayout
        sideRef={sideRef}
        stageLabel="Your inequality graph"
        data-tap-action={tapAction.kind}
        data-cursor={cursor}
        data-focus={parsedCursor.kind === 'step' && parsedCursor.step === 'rewrite' ? 'steps' : undefined}
        stage={(
          <CoordinatePlane
            xMin={bounds.xMin ?? -6} xMax={bounds.xMax ?? 8} yMin={bounds.yMin ?? -4} yMax={bounds.yMax ?? 10}
            onPlot={graphInteractive ? handlePlot : null}
            onMovePoint={tapAction.kind === 'boundaryPoint' || tapAction.kind === 'boundaryFull' ? handleMovePoint : null}
            panZoom
            // The whole-number grid stays drawn between the steps that plot and
            // the steps that do not, so the plane does not change under the
            // student when a step opens.
            readableGrid
            // What a tap does is said by the step beside the graph; the plane
            // keeps only its keyboard sentence, shown while it has keyboard focus.
            showPlotHelp="keyboard"
            cursorLabel={tapAction.kind === 'boundaryPoint' ? `Point ${tapAction.which}` : 'Point'}
            points={graphPoints}
            ariaLabel={graphLabel}
            viewResetKey={questionData?.questionId ?? null}
            enlargeable={false}
          >
            {({ sx, sy, plotClip }) => (
              <InequalityGraphLayers
                sx={sx}
                sy={sy}
                plotClip={plotClip}
                build={build}
                effectiveLines={effectiveLines}
                buildConfig={buildConfig}
                workingConstraints={workingConstraints}
                bounds={bounds}
                combined={combined}
                studentPolygon={studentPolygon}
                emphasised={emphasised}
                hatchId={hatchId}
                graphPoints={graphPoints}
                graphPointRoles={graphPointRoles}
              />
            )}
          </CoordinatePlane>
        )}
      >
          {modeling ? phaseCard('model', STEP_LABELS.model, (
            <>
              <p className="mm-ineq-instruction">
                Using {variables.map((v) => `${v.symbol} = ${v.label || v.symbol}`).join(' and ')}, write each constraint.
              </p>
              <ModelingFields entries={modelingEntries} variables={variables} onChange={updateModelingEntry} />
              <div className="mm-ineq-actions">
                <button type="button" className="mm-ineq-action" onClick={sendModel} disabled={!modelingEntriesReady}>Graph these constraints</button>
              </div>
              {!modelingEntriesReady ? <p className="mm-ineq-note">Every constraint needs both coefficients, a relation and a constant.</p> : null}
            </>
          ), modelingSent ? modelingEntries.map((entry) => formatModelingConstraint(entry, variables)).join(';  ') : '') : null}
          {modeling && modelingSent ? (
            <div className="mm-ineq-actions" style={{ justifyContent: 'flex-end', marginTop: -4 }}>
              <button type="button" className="mm-ineq-link" onClick={reopenModeling}>Edit constraints</button>
            </div>
          ) : null}

          {flow.modelReady ? Array.from({ length: constraintCount }, (_, index) => renderConstraintCard(index)) : null}

          <div data-combine-ready={allConstraintsComplete ? 'true' : 'false'}>
            {phaseCard('combine', 'Combine the regions', (
              <>
                <p className="mm-ineq-instruction">
                  {buildGate.verdictsShown
                    ? (allConstraintsComplete ? 'Every constraint checks out. Combine them to see your overlap region.' : 'Locked until every constraint above is correct.')
                    // Opens on finished work, right or wrong: the lock would be the verdict.
                    : (allConstraintsComplete ? 'Every constraint is built. Combine them to see your overlap region.' : 'Finish every constraint above first.')}
                </p>
                <div className="mm-ineq-actions">
                  <button type="button" className="mm-ineq-action" onClick={combineRegions} disabled={!allConstraintsComplete}>Find overlap / Combine regions</button>
                </div>
              </>
            ), combined
              ? 'Your overlap is hatched on the graph.'
              : `${buildGate.verdictsShown ? 'Locked until every constraint above is correct.' : 'Finish every constraint above first.'}${reasoningPreview ? ` Then: ${reasoningPreview}.` : ''}`)}
          </div>

          {combined && plan.reasoningSteps.includes('classify') ? phaseCard('classify', STEP_LABELS.classify, (
            <>
              <ChoiceGroup
                name="region-classification"
                legend="How would you classify the combined solution region?"
                options={CLASSIFICATION_OPTIONS}
                value={regionClassification}
                onChange={setRegionClassification}
              />
              <div className="mm-ineq-actions">
                <button type="button" className="mm-ineq-action" onClick={() => checkReasoning('classify')} disabled={!regionClassification}>Check classification</button>
              </div>
              <StepFeedback tone={classification?.tone}>{classification?.text}</StepFeedback>
            </>
          ), CLASSIFICATION_OPTIONS.find((option) => option.value === regionClassification)?.label || '') : null}

          {combined && plan.reasoningSteps.includes('teacherPoint') ? phaseCard('teacherPoint', `Test the point ${formatPoint(teacherTestPoint.x, teacherTestPoint.y)}`, (
            <>
              <p className="mm-ineq-instruction">Substitute the point into each inequality.</p>
              <TestPointQuestions
                point={[teacherTestPoint.x, teacherTestPoint.y]}
                response={teacherPointResponse}
                setResponse={setTeacherPointResponse}
                count={constraintCount}
                inequalityLabels={inequalityLabels}
                showBoundaryProbe={boundaryProbeEnabled && onBoundaryIndex([teacherTestPoint.x, teacherTestPoint.y]) >= 0}
              />
              <div className="mm-ineq-actions">
                <button type="button" className="mm-ineq-action" onClick={() => checkReasoning('teacherPoint')}>Check this point</button>
              </div>
              <StepFeedback tone={teacherReport?.tone}>{teacherReport?.text}</StepFeedback>
            </>
          )) : null}

          {combined && plan.reasoningSteps.includes('studentPoint') ? phaseCard('studentPoint', STEP_LABELS.studentPoint, (
            <>
              <p className="mm-ineq-instruction">{studentTestPoint ? `Your point: ${formatPoint(studentTestPoint[0], studentTestPoint[1])}. Tap the graph again to move it.` : 'Pick your own test point: tap anywhere on the graph.'}</p>
              {studentTestPoint ? (
                <>
                  <TestPointQuestions
                    point={studentTestPoint}
                    response={studentPointResponse}
                    setResponse={setStudentPointResponse}
                    count={constraintCount}
                    inequalityLabels={inequalityLabels}
                    showBoundaryProbe={boundaryProbeEnabled && studentProbeIndex(studentTestPoint) >= 0}
                  />
                  <div className="mm-ineq-actions">
                    <button type="button" className="mm-ineq-action" onClick={() => checkReasoning('studentPoint')}>Check this point</button>
                  </div>
                  <StepFeedback tone={studentReport?.tone}>{studentReport?.text}</StepFeedback>
                </>
              ) : null}
            </>
          ), studentTestPoint ? `Your point ${formatPoint(studentTestPoint[0], studentTestPoint[1])}` : '') : null}

          {combined && plan.reasoningSteps.includes('vertices') ? phaseCard('vertices', STEP_LABELS.vertices, (
            <>
              <p className="mm-ineq-instruction">Tap each point where two boundary lines meet at a corner of the solution region.</p>
              <VertexList
                vertices={vertices}
                reports={vertexReports}
                onAnswer={(index, value) => setVertices((current) => current.map((v, i) => (i === index ? { ...v, includedAnswer: value } : v)))}
                onRemove={(index) => setVertices((current) => current.filter((_, i) => i !== index))}
              />
              <div className="mm-ineq-actions">
                <button type="button" className="mm-ineq-action" onClick={() => checkReasoning('vertices')} disabled={!vertices.length}>Check vertices</button>
              </div>
            </>
          ), vertices.length ? `${vertices.length} marked` : '') : null}

          <button type="button" className="mm-ineq-submit" data-ready={flow.complete ? 'true' : 'false'} onClick={finalCheck} data-primary-answer-action="true">Check my work</button>
          {feedback ? <div><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill></div> : null}

          <HintPanel
            hints={[
              'Replace the inequality symbol with = to find the boundary line. Any two points that satisfy that equation determine it — you do not need the exact points a teacher would pick.',
              'Solid means the boundary is included (≤ or ≥). Dashed means it is not (< or >). Shade the side where a point makes the original inequality true, then check a point in that shaded region against every inequality to find the system solution.',
              'A region that never closes up in some direction is unbounded. A vertex is only part of the solution when every boundary meeting there is solid — a dashed boundary at that exact corner excludes it, even though the lines still cross there.',
            ]}
            onHintUsed={() => onAction?.('HINT_USED')}
          />
      </InequalityLayout>
    </EnlargeableFigure>
  );
}


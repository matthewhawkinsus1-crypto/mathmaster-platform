/*
 * THE STUDENT-BUILD INEQUALITY WORKSPACE AS ONE SEQUENCE OF STEPS.
 *
 * The workspace used to show every step of every constraint at once: a method
 * select, two "Place point N on graph" buttons, Check boundary, Solid / Dashed,
 * Check line style, "Tap the side of the graph to shade", Check shading — all
 * the same blue, all on screen before any of them could be used — and the graph
 * did nothing until one of the "place" buttons armed it. A student finishing
 * constraint 1 had to find constraint 2's header to continue.
 *
 * Here the question's work is an ordered list of positions:
 *
 *   model                      write the constraints (modeling questions only)
 *   c0:rewrite … c0:shading    each constraint's enabled build steps, in order
 *   c1:…                       the next constraint
 *   combine                    show where the constraints overlap
 *   classify, teacherPoint,    the reasoning the question asks about the
 *   studentPoint, vertices     combined region
 *
 * One position is current (the cursor, persisted with the draft). Only its step
 * is expanded, and the graph's tap means whatever that step needs — the next
 * boundary point, the side to shade, a test point, a vertex — so there is
 * nothing to arm. A passing Check moves the cursor to the next open position.
 *
 * WHAT THIS MODULE NEVER DECIDES: whether work is right. "Done" comes from the
 * caller (resolveInequalityBuildGate's stepDone — checked-and-right where
 * outcomes are shown, finished where they are withheld), so the order in which
 * steps open can never say more than the gate already says.
 *
 * Steps of one constraint open in order (a line is styled and shaded after it
 * exists). Constraints are independent: a student stuck on constraint 1 can
 * work on constraint 2. Combine opens when every constraint is done, and the
 * reasoning steps once the regions are combined, in any order.
 *
 * No React here: tests/platform/inequalityBuildFlow.test.mjs runs it in node.
 */

export const CONSTRAINT_STEPS = Object.freeze(['rewrite', 'boundary', 'lineStyle', 'shading']);
export const REASONING_STEPS = Object.freeze(['classify', 'teacherPoint', 'studentPoint', 'vertices']);

export const STEP_LABELS = Object.freeze({
  model: 'Write the constraints',
  rewrite: 'Rewrite',
  boundary: 'Boundary line',
  lineStyle: 'Solid or dashed',
  shading: 'Shade',
  combine: 'Combine',
  classify: 'Classify the region',
  teacherPoint: 'Test the marked point',
  studentPoint: 'Test a point of your own',
  vertices: 'Mark the vertices',
});

export const NO_CURSOR = 'none';

export const stepPosition = (index, step) => `c${index}:${step}`;
export const constraintPosition = (index) => `c${index}`;

/** { kind: 'step', index, step } | { kind: 'constraint', index } | { kind: 'phase', phase } | { kind: 'none' } */
export const parsePosition = (position) => {
  const text = typeof position === 'string' ? position : '';
  const step = /^c(\d+):(\w+)$/.exec(text);
  if (step && CONSTRAINT_STEPS.includes(step[2])) return { kind: 'step', index: Number(step[1]), step: step[2] };
  const constraint = /^c(\d+)$/.exec(text);
  if (constraint) return { kind: 'constraint', index: Number(constraint[1]) };
  if (text === 'model' || text === 'combine' || REASONING_STEPS.includes(text)) return { kind: 'phase', phase: text };
  return { kind: 'none' };
};

/**
 * Which steps this question asks for, in order — from the shared task
 * (studentBuildInequalityTask), so the steps on screen are the steps graded.
 */
export const buildFlowPlan = (task = {}) => {
  const buildConfig = task.buildConfig || {};
  const testPoints = Boolean(task.testPointReasoningEnabled);
  return {
    modeling: Boolean(task.modeling),
    constraintCount: Math.max(0, Number(task.constraintCount) || 0),
    constraintSteps: CONSTRAINT_STEPS.filter((step) => Boolean(buildConfig[step])),
    reasoningSteps: REASONING_STEPS.filter((step) => (
      step === 'classify' ? Boolean(task.askClassification)
        : step === 'teacherPoint' ? testPoints && Boolean(task.teacherTestPoint)
          : step === 'studentPoint' ? testPoints && Boolean(task.allowStudentTestPoint)
            : Boolean(task.askVertices)
    )),
  };
};

/** Every position of the plan, in the order the work is done. */
export const flowPositions = (plan) => [
  ...(plan.modeling ? ['model'] : []),
  ...Array.from({ length: plan.constraintCount }, (_, index) => plan.constraintSteps.map((step) => stepPosition(index, step))).flat(),
  'combine',
  ...plan.reasoningSteps,
];

/**
 * The state of the work, as predicates. `stepDone(index, step)` is the gate's
 * (the rewrite step: its rewrite is verified); `reasoningDone(phase)` says a
 * reasoning step was checked as it stands.
 */
const flowState = ({ plan, modelingSent = true, stepDone = () => false, combined = false, reasoningDone = () => false }) => {
  const modelReady = !plan.modeling || Boolean(modelingSent);
  const constraintDone = (index) => plan.constraintSteps.every((step) => Boolean(stepDone(index, step)));
  const allConstraintsDone = modelReady && plan.constraintCount > 0
    && Array.from({ length: plan.constraintCount }, (_, index) => index).every(constraintDone);
  const done = (position) => {
    const parsed = parsePosition(position);
    if (parsed.kind === 'step') return Boolean(stepDone(parsed.index, parsed.step));
    if (parsed.kind === 'constraint') return constraintDone(parsed.index);
    if (parsed.kind !== 'phase') return false;
    if (parsed.phase === 'model') return modelReady;
    if (parsed.phase === 'combine') return Boolean(combined);
    return Boolean(combined) && Boolean(reasoningDone(parsed.phase));
  };
  const available = (position) => {
    const parsed = parsePosition(position);
    if (parsed.kind === 'none') return false;
    if (parsed.kind === 'phase') {
      if (parsed.phase === 'model') return plan.modeling;
      if (!modelReady) return false;
      if (parsed.phase === 'combine') return allConstraintsDone || Boolean(combined);
      return plan.reasoningSteps.includes(parsed.phase) && Boolean(combined);
    }
    if (!modelReady || parsed.index < 0 || parsed.index >= plan.constraintCount) return false;
    if (parsed.kind === 'constraint') return true;
    const order = plan.constraintSteps.indexOf(parsed.step);
    if (order < 0) return false;
    // A constraint's steps open in order: the line exists before it is styled
    // and shaded. Done steps stay open, so finished work can be revisited.
    return plan.constraintSteps.slice(0, order).every((step) => Boolean(stepDone(parsed.index, step)));
  };
  return { modelReady, constraintDone, allConstraintsDone, done, available };
};

/** The first position that is open and not yet done, searching from `after` (exclusive) and wrapping. */
export const nextOpenPosition = (context, after = null) => {
  const positions = flowPositions(context.plan);
  const state = flowState(context);
  const start = after == null ? 0 : positions.indexOf(after) + 1;
  const ordered = [...positions.slice(Math.max(0, start)), ...positions.slice(0, Math.max(0, start))];
  return ordered.find((position) => state.available(position) && !state.done(position)) || NO_CURSOR;
};

/**
 * Everything the screen reads: the cursor it should show (the persisted one if
 * it is still open, otherwise the first open step), the constraint that is
 * expanded, and a state for every position:
 *   'current' | 'done' | 'open' (can be opened, not done) | 'locked'.
 */
export const resolveBuildFlow = (context) => {
  const { plan, cursor = null } = context;
  const state = flowState(context);
  const requested = parsePosition(cursor);
  const requestedOpen = requested.kind !== 'none' && state.available(cursor);
  const effective = cursor === NO_CURSOR
    ? NO_CURSOR
    : requestedOpen ? cursor : nextOpenPosition(context);
  const parsed = parsePosition(effective);
  const positionState = (position) => {
    if (position === effective) return 'current';
    if (!state.available(position)) return 'locked';
    return state.done(position) ? 'done' : 'open';
  };
  const positions = flowPositions(plan);
  return {
    plan,
    cursor: effective,
    parsedCursor: parsed,
    // The constraint whose card is expanded: the cursor's, or none in a phase.
    activeIndex: parsed.kind === 'step' || parsed.kind === 'constraint' ? parsed.index : null,
    modelReady: state.modelReady,
    allConstraintsDone: state.allConstraintsDone,
    constraintDone: state.constraintDone,
    isDone: state.done,
    isAvailable: state.available,
    positionState,
    // How many of a constraint's steps are done, for its header.
    constraintProgress: (index) => ({
      done: plan.constraintSteps.filter((step) => state.done(stepPosition(index, step))).length,
      total: plan.constraintSteps.length,
    }),
    // Everything the question asks has been done: the moment to check the work.
    complete: positions.every((position) => state.done(position)),
  };
};

/**
 * Where the cursor goes after the student checks `position`, given whether that
 * check completed it (`doneNow`: right where outcomes are shown, finished where
 * they are withheld). A check that did not complete it stays put.
 */
export const cursorAfterCheck = (context, position, doneNow) => {
  if (!doneNow) return position;
  const parsed = parsePosition(position);
  const stepDone = parsed.kind === 'step'
    ? (index, step) => (index === parsed.index && step === parsed.step) || Boolean(context.stepDone?.(index, step))
    : context.stepDone;
  const reasoningDone = parsed.kind === 'phase' && REASONING_STEPS.includes(parsed.phase)
    ? (phase) => phase === parsed.phase || Boolean(context.reasoningDone?.(phase))
    : context.reasoningDone;
  const combined = parsed.kind === 'phase' && parsed.phase === 'combine' ? true : context.combined;
  const modelingSent = parsed.kind === 'phase' && parsed.phase === 'model' ? true : context.modelingSent;
  return nextOpenPosition({ ...context, stepDone, reasoningDone, combined, modelingSent }, position);
};

/**
 * Where a constraint's header takes the student: its first open step that is
 * not done, or — when every step is done — the constraint's overview, which
 * lists the finished steps without arming the graph, so a stray tap cannot
 * change finished work. Pressing the expanded header again collapses it.
 */
export const cursorForConstraint = (context, index) => {
  const flow = resolveBuildFlow(context);
  if (flow.activeIndex === index) return NO_CURSOR;
  const firstOpen = context.plan.constraintSteps
    .map((step) => stepPosition(index, step))
    .find((position) => flow.isAvailable(position) && !flow.isDone(position));
  return firstOpen || constraintPosition(index);
};

/*
 * WHAT A TAP ON THE GRAPH MEANS, FROM THE CURRENT STEP ALONE.
 *
 *   boundaryPoint  the next empty boundary point of the current constraint
 *                  (two points, or the intercept then a second point)
 *   boundaryFull   both points are placed: a tap changes nothing (drag a point
 *                  or remove one to re-place it)
 *   shade          the side of the current constraint's line to shade
 *   testPoint      the student's own test point
 *   vertex         a corner of the combined region
 *   none           this step has nothing to place
 *
 * Never a mathematically derived point: the graph only records where the
 * student taps.
 */
export const graphTapAction = ({ cursor, build = [], plan, rewriteVerified = () => true }) => {
  const parsed = parsePosition(cursor);
  if (parsed.kind === 'phase') {
    if (parsed.phase === 'studentPoint') return { kind: 'testPoint' };
    if (parsed.phase === 'vertices') return { kind: 'vertex' };
    return { kind: 'none' };
  }
  if (parsed.kind !== 'step' || !plan?.constraintSteps?.includes(parsed.step)) return { kind: 'none' };
  if (!rewriteVerified(parsed.index)) return { kind: 'none' };
  const entry = build[parsed.index] || {};
  if (parsed.step === 'shading') return { kind: 'shade', index: parsed.index };
  if (parsed.step !== 'boundary') return { kind: 'none' };
  const method = entry.method || 'points';
  if (method !== 'points' && method !== 'slopeIntercept') return { kind: 'none' };
  if (!entry.point1Plotted) return { kind: 'boundaryPoint', index: parsed.index, which: 1, method };
  if (!entry.point2Plotted) return { kind: 'boundaryPoint', index: parsed.index, which: 2, method };
  return { kind: 'boundaryFull', index: parsed.index, method };
};

/*
 * THE WORK A STEP'S CHECK WAS ABOUT.
 *
 * A Check is about the work on screen when it was pressed. Where outcomes are
 * shown, a step used to count as right whenever its CURRENT work was right and
 * it had been checked at least once — so after one Check, dragging a boundary
 * point flipped the step's tick on and off live, without a second Check. The
 * signature of the checked work is stored with the step; the step counts as
 * checked only while its work still matches it (the gate's
 * `stepCheckedAsItStands`), and its feedback line goes with it.
 *
 * A step checked before signatures existed has none stored and keeps counting
 * as checked, exactly as it did.
 */
export const STEP_CHECK_FIELDS = Object.freeze({
  boundary: { attempts: 'boundaryAttempts', checked: 'boundaryCheckedWork' },
  lineStyle: { attempts: 'styleAttempts', checked: 'styleCheckedWork' },
  shading: { attempts: 'shadeAttempts', checked: 'shadeCheckedWork' },
});

const coordinate = (value) => (value === '' || value == null ? '' : String(Number(value)));

export const stepWorkSignature = (entry = {}, step) => {
  if (step === 'boundary') {
    const method = entry.method || '';
    if (method === 'vertical' || method === 'horizontal') return `${method}|${String(entry.constant ?? '').trim()}`;
    const points = [
      entry.point1Plotted ? `${coordinate(entry.x1)},${coordinate(entry.y1)}` : '',
      entry.point2Plotted ? `${coordinate(entry.x2)},${coordinate(entry.y2)}` : '',
    ].join('|');
    return method === 'slopeIntercept'
      ? `${method}|${String(entry.slope ?? '').trim()}|${String(entry.intercept ?? '').trim()}|${points}`
      : `${method || 'points'}|${points}`;
  }
  if (step === 'lineStyle') return String(entry.style || '');
  if (step === 'shading') return Array.isArray(entry.shadePoint) ? entry.shadePoint.map(coordinate).join(',') : '';
  return '';
};

/** Whether the step's work is the work its last Check was about. */
export const stepCheckedAsItStands = (entry = {}, step) => {
  const fields = STEP_CHECK_FIELDS[step];
  if (!fields) return true;
  const stored = entry[fields.checked];
  return stored === undefined || stored === null ? true : stored === stepWorkSignature(entry, step);
};

/** The build-entry patch a Check makes: one more attempt, and what was checked. */
export const stepCheckPatch = (entry = {}, step) => {
  const fields = STEP_CHECK_FIELDS[step];
  if (!fields) return {};
  return {
    [fields.attempts]: (Number(entry[fields.attempts]) || 0) + 1,
    [fields.checked]: stepWorkSignature(entry, step),
  };
};

/** A stable signature of a reasoning response, for "checked as it stands". */
export const reasoningSignature = (value) => {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return '';
  }
};

import React, { useMemo } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import ToolShell, { Panel, ResultPill, ToolGrid, TaskCard, HintPanel } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { correlation, linearRegression, parseNumericAnswer, round } from '../shared/toolMath';
import {
  buildCandidateModels,
  chooseBestModel,
  formatCorrelation,
  modelMetrics,
} from './dataModelingMath';
import useToolSubmission from '../shared/useToolSubmission';
import { OWN_CHOICES, UNANSWERED } from '../shared/judgmentChoices.js';
import useReportToolWork from '../shared/useReportToolWork.js';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import dataModelingGrader from '../../../functions/shared/serverGrading/tools/dataModelingLab.mjs';
import {
  FIT_PREDICTION_MODELS,
  FORCED_FIT_MODELS,
  dataModelingFixedPredictionTarget,
  dataModelingPoints,
  dataModelingRequiredParts,
  dataModelingStartingLine,
  lineFitNamesPrediction,
  lineFitUsesRegressionTechnology,
  numberVisiblePanels,
} from './dataModelingPlan.js';
import { fitAdjustmentPlan, fitDataBounds, interactionIncrements, residualScale, stepFitControl } from '../../platform/graph/graphScaleService.js';

const Field = ({ label, children }) => (
  <label style={{ display:'block', fontSize:13, color:'var(--mm-text-muted)', fontWeight:700 }}>
    {label}
    <div style={{ marginTop:5 }}>{children}</div>
  </label>
);

const inputStyle = { width:'100%', boxSizing:'border-box', padding:'9px 10px', border:'1px solid var(--mm-tint-border)', borderRadius:8, background:'var(--mm-surface)' };

const decimalsForStep = (step) => {
  const value = Math.abs(Number(step));
  if (!Number.isFinite(value) || value <= 0) return 2;
  return Math.max(0, Math.min(6, Math.ceil(-Math.log10(value)) + (value < 1 ? 0 : 0)));
};

const FitStepper = ({ label, value, control, onChange }) => {
  const decimals = decimalsForStep(control?.step);
  const display = Number(value).toFixed(decimals);
  const lowerDisabled = Number(value) <= Number(control?.min) + Number(control?.step) * 0.25;
  const upperDisabled = Number(value) >= Number(control?.max) - Number(control?.step) * 0.25;
  const change = (direction) => onChange(stepFitControl(value, direction, control));
  return (
    <div role="group" aria-label={label} style={{ border:'1px solid var(--mm-tint-border)', borderRadius:10, padding:10, background:'var(--mm-surface)' }}>
      <div style={{ fontSize:13, color:'var(--mm-text-muted)', fontWeight:800, marginBottom:7 }}>{label}</div>
      <div style={{ display:'grid', gridTemplateColumns:'52px minmax(86px,1fr) 52px', gap:8, alignItems:'center' }}>
        <button type="button" aria-label={`Decrease ${label}`} disabled={lowerDisabled} onClick={() => change(-1)}
          style={{ minHeight:48, border:'1px solid var(--mm-primary-border)', borderRadius:9, background:'var(--mm-primary-subtle)', color:'var(--mm-primary-text)', fontSize:24, fontWeight:900 }}>−</button>
        <output aria-live="polite" style={{ minHeight:48, display:'grid', placeItems:'center', borderRadius:9, background:'var(--mm-surface-sunken)', color:'var(--mm-text-strong)', fontWeight:900, fontVariantNumeric:'tabular-nums', fontSize:18 }}>
          {display}
        </output>
        <button type="button" aria-label={`Increase ${label}`} disabled={upperDisabled} onClick={() => change(1)}
          style={{ minHeight:48, border:'1px solid var(--mm-primary-border)', borderRadius:9, background:'var(--mm-primary-subtle)', color:'var(--mm-primary-text)', fontSize:24, fontWeight:900 }}>+</button>
      </div>
      <div style={{ marginTop:6, color:'var(--mm-text-muted)', fontSize:12 }}>Each tap changes the value by {Number(control?.step).toFixed(decimals)}.</div>
    </div>
  );
};

const MODE_TASKS = {'full': 'Fit a line to the data, describe the association, choose the best model family, and make a prediction you can defend.', 'lineFit': 'Find the slope and intercept of a line that fits this data well.', 'linearFit': 'Use linear regression technology to write the line of best fit for the complete data set.', 'quadraticFit': 'Use quadratic regression technology to write a quadratic function that fits the complete data set.', 'exponentialFit': 'Use exponential regression technology to write an exponential function that fits the complete data set.', 'linearFitPrediction': 'Use regression technology to write a linear function that fits the data, then use your model to make the requested prediction.', 'quadraticFitPrediction': 'Use quadratic regression technology to write a quadratic function that fits the data, then use your model to make the requested prediction.', 'exponentialFitPrediction': 'Use exponential regression technology to write an exponential function that fits the data, then use your model to make the requested prediction.', 'squareRootFitPrediction': 'Use square-root regression technology to write y = a√(x-h)+k from the table, then use your model to make the requested prediction.', 'association': 'Describe the direction and strength of the association, and say what this data can justify.', 'correlation': 'Use statistical technology to calculate the correlation coefficient r, then interpret its direction and strength.', 'prediction': 'Use the model to predict a value, and say whether that prediction is interpolation or extrapolation.', 'modelCompare': 'Decide which model family fits this data best.'};
const MODE_STEPS = {'full': ['Adjust the slope and intercept until the residuals are small and evenly scattered.', 'Read the correlation to describe direction and strength.', 'Compare the model families, then predict and classify.'], 'lineFit': ['Move the slope until the line matches the overall trend.', 'Move the intercept until the line sits through the middle of the points.', 'Watch the residual plot — you want it scattered around zero with no pattern.'], 'linearFit': ['Run linear regression on all observations.', 'Enter the regression slope m and intercept b.', 'Use the residual display to confirm the entered regression line matches the data.'], 'quadraticFit': ['Run quadratic regression on all observations.', 'Enter a, b, and c in y = ax² + bx + c.', 'Use the residual display to confirm the entered regression model matches the data.'], 'exponentialFit': ['Run exponential regression on all observations.', 'Enter a and base b in y = a(b)^x.', 'Use the residual display to confirm the entered regression model matches the data.'], 'linearFitPrediction': ['Run a linear regression on the data.', 'Enter the regression coefficients to write y = mx + b.', 'Use that model at the requested x-value and classify the prediction as interpolation or extrapolation.'], 'quadraticFitPrediction': ['Run a quadratic regression on the data.', 'Enter the regression coefficients to write y = ax² + bx + c.', 'Use that model at the requested x-value and classify the prediction.'], 'exponentialFitPrediction': ['Run an exponential regression on the data.', 'Enter the regression coefficients to write y = a(b)^x.', 'Use that model at the requested x-value and classify the prediction.'], 'squareRootFitPrediction': ['Run the square-root fit on the full table.', 'Enter a, h, and k in y = a√(x-h)+k.', 'Use the fitted model at the requested x-value and classify the prediction.'], 'association': ['Look at whether the points rise or fall from left to right.', 'Look at how tightly they cluster around a line.', 'Decide whether this data could show cause and effect, or only a relationship.'], 'correlation': ['Run a correlation calculation on the x- and y-data using statistical technology.', 'Record r to at least the thousandths place.', 'Use the sign and magnitude of r to interpret direction and strength.'], 'prediction': ['Enter the x-value you are predicting at.', 'Use the model to compute the predicted y.', 'Decide whether that x is inside or outside the observed data.'], 'modelCompare': ['Compare the residual error of each candidate.', 'Check that the shape is reasonable for what the data describes.', 'Select the best model and check.']};
const HINTS = {'full': ['Work through the panels in order — each one builds on the last.', 'A good fit has residuals scattered above and below zero with no curve or pattern in them.', 'Correlation describes how tightly the points follow a line. It never proves that one variable causes the other.'], 'lineFit': ['Get the slope roughly right first, then slide the intercept to centre the line.', 'Slope is rise over run: pick two points far apart on the trend and compare how much y changes to how much x changes.', 'If the residual plot curves, a straight line is the wrong shape for this data — that is information, not failure.'], 'linearFit': ['Use the linear-regression command on the full data list.', 'Record both m and b from technology.', 'Do not replace regression with a line through two hand-picked points.'], 'quadraticFit': ['Use the quadratic-regression command on the full data list.', 'Record all three coefficients a, b, and c from technology.', 'Do not replace regression with a hand-fit through only three selected points.'], 'exponentialFit': ['Use exponential regression on the full data list.', 'Record both a and the multiplicative base b.', 'For decay the base should be between 0 and 1; for growth it should exceed 1.'], 'linearFitPrediction': ['Use the linear-regression feature of your approved technology; the model coefficients should come from the full data set, not two hand-picked points.', 'Write the complete function before predicting.', 'Use the x-value named in the task; changing the prediction target changes the question.'], 'quadraticFitPrediction': ['Use quadratic regression and record all three coefficients a, b and c.', 'A quadratic model needs the x² term, x term and constant even when a coefficient is near zero.', 'Substitute the requested x into the fitted quadratic, then decide whether that x lies inside or outside the observed range.'], 'exponentialFitPrediction': ['Use exponential regression and record both the initial factor a and multiplicative base b.', 'For decay, the fitted base should be between 0 and 1; for growth it should be greater than 1.', 'Use the requested x-value rather than choosing one of the observed data points.'], 'squareRootFitPrediction': ['Use the square-root regression feature on the complete table rather than selecting two convenient points.', 'Record all three fitted parameters a, h, and k in y = a√(x-h)+k.', 'The endpoint-anchored fit uses the smallest x-value as h and the endpoint output as k, then fits a from all remaining observations.'], 'association': ['Direction is about which way the cloud of points tilts.', 'Strength is about how close the points sit to a single line, not how steep that line is.', 'Observational data can only establish an association. Only a controlled experiment can establish cause and effect.'], 'correlation': ['Use the statistical correlation or linear-regression feature of your approved technology; do not estimate r from the picture.', 'The sign of r gives direction. The size of |r| describes how tightly the points follow a line.', 'Correlation can support an association claim, but correlation alone cannot establish cause and effect.'], 'prediction': ['Substitute your x into the model and compute the y it gives.', 'Interpolation means predicting inside the range of x-values you actually observed.', 'Extrapolation goes beyond the data, where the pattern may not hold — treat those predictions cautiously.'], 'modelCompare': ['Smaller residual error means the model is closer to the points on average.', 'RMSE punishes large misses more than MAE does, so a model with one big error will look worse under RMSE.', 'Also ask whether the shape makes sense: a model that fits well but predicts a negative quantity is still wrong.']};

function ResidualPlot({ rows, xMin, xMax }) {
  const scale = residualScale(rows.map((row) => row.residual));
  return (
    <CoordinatePlane xMin={xMin} xMax={xMax} yMin={scale.min} yMax={scale.max} height={250}
      points={rows.map((row) => ({ x:row.x, y:row.residual, label:'' }))}
      horizontalLines={[0]} enlargeable={false} />
  );
}

export default function DataModelingLab({ questionData = {}, onAction }) {
  const points = dataModelingPoints(questionData);
  const mode = questionData.mode || 'full';
  // A hand fit that names a prediction target also asks for the prediction.
  const lineFitPrediction = lineFitNamesPrediction(mode, questionData);
  const lineFitRegressionTechnology = lineFitUsesRegressionTechnology(mode, questionData);
  const regression = useMemo(() => linearRegression(points), [points]);
  const candidateModels = useMemo(() => buildCandidateModels(points, regression), [points, regression]);
  const bestModel = useMemo(() => chooseBestModel(candidateModels, questionData.modelMetric || 'rmse'), [candidateModels, questionData.modelMetric]);
  const r = useMemo(() => correlation(points), [points]);
  const xs = points.map(([x]) => Number(x));
  const ys = points.map(([, y]) => Number(y));
  const dataXMin = Math.min(...xs);
  const dataXMax = Math.max(...xs);
  const dataYMin = Math.min(...ys);
  const dataYMax = Math.max(...ys);
  const xScale = fitDataBounds(xs, { include:[0] });
  const yScale = fitDataBounds(ys, { include:[0] });
  const { min:xMin, max:xMax } = xScale;
  const { min:yMin, max:yMax } = yScale;

  const startingModel = questionData.startingModel || {};
  const exploratoryLineFit = mode === 'lineFit' || mode === 'full';
  const fitControls = useMemo(() => fitAdjustmentPlan({
    targetSlope: regression.m,
    targetIntercept: regression.b,
    xMin: dataXMin,
    xMax: dataXMax,
    yMin: dataYMin,
    yMax: dataYMax,
    slopeTolerance: exploratoryLineFit ? questionData.slopeTolerance : undefined,
    interceptTolerance: exploratoryLineFit ? questionData.interceptTolerance : undefined,
    slopeStep: questionData.slopeStep,
    interceptStep: questionData.interceptStep,
    challengeClicks: questionData.fitChallengeClicks,
  }), [regression.m, regression.b, dataXMin, dataXMax, dataYMin, dataYMax, exploratoryLineFit, questionData.slopeTolerance, questionData.interceptTolerance, questionData.slopeStep, questionData.interceptStep, questionData.fitChallengeClicks]);

  // The starting line and choices come from the plan the shared grader reads,
  // so it can tell this untouched lab from finished work.
  const startingLine = dataModelingStartingLine(mode, questionData, { regression, stepperPlan: exploratoryLineFit ? fitControls : null });
  const [m, setM] = usePersistentToolState('m', startingLine.m);
  const [b, setB] = usePersistentToolState('b', startingLine.b);
  const slopeIncrements = interactionIncrements(regression.m);
  const interceptIncrements = interactionIncrements(Math.max(Math.abs(regression.b), yMax - yMin));
  // Every judgment starts unanswered ("Choose…", judgmentChoices.js). They
  // opened on "positive", "moderate", "association" and "linear", which credited
  // a student who never chose whenever the question's answer was the default.
  // DATA_MODELING_STARTING_CHOICES, the start the shared grader reads, says
  // the same (tests/tools/dataModelingLabSharedGrading.test.mjs holds the two
  // together).
  const [direction, setDirection] = usePersistentToolState('direction', UNANSWERED);
  const [strength, setStrength] = usePersistentToolState('strength', UNANSWERED);
  const [causation, setCausation] = usePersistentToolState('causation', UNANSWERED);
  const [modelChoice, setModelChoice] = usePersistentToolState('modelChoice', UNANSWERED);
  // Keep the default prediction target tied to the observed data, not to display/camera bounds.
  // Work View and graph fitting are presentation concerns and must not change submitted math state.
  const defaultPredictionX = Math.ceil(Math.max(...xs, 1) + 1);
  const [predictionX, setPredictionX] = usePersistentToolState('predictionX', questionData.predictionX ?? defaultPredictionX);
  const [predictionY, setPredictionY] = usePersistentToolState('predictionY', '');
  const [predictionType, setPredictionType] = usePersistentToolState('predictionType', UNANSWERED);
  const [correlationEntry, setCorrelationEntry] = usePersistentToolState('correlationEntry', '');
  // Technology starts closed. The regression coefficients are not visible until
  // the student deliberately runs regression, preserving the estimate-first
  // portion of a lineFit task while keeping the calculator in this workspace.
  const [regressionTechnologyRun, setRegressionTechnologyRun] = usePersistentToolState('regressionTechnologyRun', false);
  // The student's own estimate, kept beside the regression line it is compared
  // with once running regression makes that line their model.
  const [regressionEstimate, setRegressionEstimate] = usePersistentToolState('regressionEstimate', null);
  // Neutral defaults are deliberate. Initialising these fields from the
  // regression result would put most of the answer in the boxes before the
  // student used technology to calculate it.
  const [quadraticA, setQuadraticA] = usePersistentToolState('quadraticA', startingModel.a ?? '');
  const [quadraticB, setQuadraticB] = usePersistentToolState('quadraticB', startingModel.b ?? '');
  const [quadraticC, setQuadraticC] = usePersistentToolState('quadraticC', startingModel.c ?? '');
  const [exponentialA, setExponentialA] = usePersistentToolState('exponentialA', startingModel.a ?? '');
  const [exponentialBase, setExponentialBase] = usePersistentToolState('exponentialBase', startingModel.base ?? '');
  const [squareRootA, setSquareRootA] = usePersistentToolState('squareRootA', startingModel.a ?? '');
  const [squareRootH, setSquareRootH] = usePersistentToolState('squareRootH', startingModel.h ?? '');
  const [squareRootK, setSquareRootK] = usePersistentToolState('squareRootK', startingModel.k ?? '');
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);

  const studentPredict = useMemo(() => {
    if ((mode === 'quadraticFitPrediction' || mode === 'quadraticFit')) {
      const values = [quadraticA, quadraticB, quadraticC].map(parseNumericAnswer);
      if (values.some((value) => value == null)) return () => Number.NaN;
      return (x) => values[0] * Number(x) ** 2 + values[1] * Number(x) + values[2];
    }
    if ((mode === 'exponentialFitPrediction' || mode === 'exponentialFit')) {
      const a = parseNumericAnswer(exponentialA);
      const base = parseNumericAnswer(exponentialBase);
      if (a == null || base == null) return () => Number.NaN;
      return (x) => a * base ** Number(x);
    }
    if (mode === 'squareRootFitPrediction') {
      const a = parseNumericAnswer(squareRootA);
      const h = parseNumericAnswer(squareRootH);
      const k = parseNumericAnswer(squareRootK);
      if (a == null || h == null || k == null) return () => Number.NaN;
      return (x) => Number(x) < h ? Number.NaN : a * Math.sqrt(Number(x) - h) + k;
    }
    const slope = parseNumericAnswer(m);
    const intercept = parseNumericAnswer(b);
    if (slope == null || intercept == null) return () => Number.NaN;
    return (x) => slope * Number(x) + intercept;
  }, [mode, m, b, quadraticA, quadraticB, quadraticC, exponentialA, exponentialBase, squareRootA, squareRootH, squareRootK]);
  const studentResiduals = useMemo(() => points.map(([x, y]) => {
    const predicted = Number(studentPredict(x));
    return { x:Number(x), y:Number(y), predicted, residual:Number(y) - predicted };
  }), [points, studentPredict]);
  const studentMetrics = useMemo(() => modelMetrics(points, studentPredict), [points, studentPredict]);

  // An authored prediction target is the question's own x, shown read-only —
  // the shared grader marks the prediction at that x.
  const fixedPredictionTarget = dataModelingFixedPredictionTarget(mode, questionData);
  const asksPredictionType = !lineFitPrediction;
  const showModelEntry = mode === 'full' || mode === 'lineFit' || Boolean(FORCED_FIT_MODELS[mode]);
  const showAssociationPanel = mode === 'full' || mode === 'association' || mode === 'correlation';
  const showResidualPanel = mode === 'full' || mode === 'lineFit' || Boolean(FORCED_FIT_MODELS[mode]);
  const showModelComparePanel = mode === 'full' || mode === 'modelCompare';
  const showPredictionPanel = mode === 'full' || mode === 'prediction' || Boolean(FIT_PREDICTION_MODELS[mode]) || lineFitPrediction;
  const panelNumbers = numberVisiblePanels([
    ['model', true],
    ['association', showAssociationPanel],
    ['residual', showResidualPanel],
    ['compare', showModelComparePanel],
    ['prediction', showPredictionPanel],
  ]);
  const linearModelReady = parseNumericAnswer(m) != null && parseNumericAnswer(b) != null;
  const nonlinearModelReady = (mode === 'quadraticFitPrediction' || mode === 'quadraticFit')
    ? [quadraticA, quadraticB, quadraticC].every((value) => parseNumericAnswer(value) != null)
    : (mode === 'exponentialFitPrediction' || mode === 'exponentialFit')
      ? [exponentialA, exponentialBase].every((value) => parseNumericAnswer(value) != null)
      : mode === 'squareRootFitPrediction'
        ? [squareRootA, squareRootH, squareRootK].every((value) => parseNumericAnswer(value) != null)
        : false;
  const studentModelReady = ['quadraticFit', 'quadraticFitPrediction', 'exponentialFit', 'exponentialFitPrediction', 'squareRootFitPrediction'].includes(mode)
    ? nonlinearModelReady
    : linearModelReady;

  /*
   * THE STUDENT'S WORK, EXACTLY AS THE LAB HOLDS IT.
   *
   * Raw input values, never Number()-coerced: a cleared box stays blank ('' is
   * not 0) and the grader parses each one the way the lab always has. The
   * keys are the ones the lab has always sent — My Math Path's server grader
   * reads them too — and the fitted function is sent only when this mode
   * grades one. The SAME object is reported live (for a deadline) and
   * submitted on Check, and the verdict comes only from the shared grader the
   * server runs.
   */
  const fitWork = (mode === 'quadraticFitPrediction' || mode === 'quadraticFit')
    ? { a: quadraticA, b: quadraticB, c: quadraticC }
    : (mode === 'exponentialFitPrediction' || mode === 'exponentialFit')
      ? { a: exponentialA, base: exponentialBase }
      : mode === 'squareRootFitPrediction'
        ? { a: squareRootA, h: squareRootH, k: squareRootK }
        : { m, b };
  const work = {
    ...(dataModelingRequiredParts(mode, questionData).includes('fit') ? fitWork : {}),
    r: correlationEntry,
    direction,
    strength,
    causation,
    modelChoice,
    predictionX,
    predictionY,
    predictionType,
    // Every judgment here opens unanswered, so whatever one holds the student
    // chose (OWN_CHOICES) — even the options an earlier lab pre-selected.
    ...OWN_CHOICES,
  };
  useReportToolWork(work);

  // The shared grader marks exactly the parts this mode asks for, under the
  // names the gradebook shows, so the record carries nothing the question did
  // not ask (B-25).
  const check = () => {
    const result = gradeToolCheck(dataModelingGrader, questionData, work);
    submit({ isCorrect: result.isCorrect, score: result.score }, work, { mode, parts: result.parts });
  };

  // WIDE WHEN IT SAVES A ROW (platform quirks audit). The full lab is six
  // panels: in the standard 1180px shell that is three rows of two, and at
  // 1920x1080 or a Chromebook zoomed to ~67% the wide shell makes it two rows
  // of three — the tool 1715px -> 1313px tall, panels still ~450px wide. With
  // only two panels wide would just stretch each line to ~700px, so those
  // modes keep the standard width.
  // The steppers show a value to their step's precision ("1.13"), but their
  // starting value sits a whole number of steps from the regression line and
  // is NOT on that grid, so "Your model" printed y = 1.12571428571x −
  // 0.128571428571 under a stepper reading 1.13 — two different slopes on one
  // screen (platform quirks audit). Shown at the steppers' precision; the
  // model, residuals and grading still use the exact value.
  const steppersDriveModel = exploratoryLineFit;
  const shownSlope = steppersDriveModel ? Number(m).toFixed(decimalsForStep(fitControls.slope.step)) : m;
  const shownInterceptMagnitude = steppersDriveModel
    ? Math.abs(Number(b)).toFixed(decimalsForStep(fitControls.intercept.step))
    : Math.abs(Number(b));

  const visiblePanelCount = [true, showAssociationPanel, showResidualPanel, showModelComparePanel, showPredictionPanel]
    .filter(Boolean).length + 1;

  return (
    <ToolShell
      title="Data Modeling Lab"
      subtitle="Build a model, inspect residuals, compare functions, and make defensible predictions without confusing association with causation."
      badge="Algebra I / II · Data Modeling"
      widthProfile={visiblePanelCount >= 3 ? 'wide' : 'standard'}
    >
      <TaskCard question={questionData} task={MODE_TASKS[mode] || MODE_TASKS.full} steps={MODE_STEPS[mode] || MODE_STEPS.full} />
      <ToolGrid min={350}>
        <Panel title={`${panelNumbers.model} · Scatter plot and your model`}>
          <CoordinatePlane
            xMin={xMin} xMax={xMax} yMin={yMin} yMax={yMax}
            points={points.map(([x,y]) => ({ x, y }))}
            lines={showModelEntry && !['quadraticFit', 'quadraticFitPrediction', 'exponentialFit', 'exponentialFitPrediction', 'squareRootFitPrediction'].includes(mode) && linearModelReady ? [{ m:Number(m), b:Number(b) }] : []}
            functions={['quadraticFit', 'quadraticFitPrediction', 'exponentialFit', 'exponentialFitPrediction', 'squareRootFitPrediction'].includes(mode) && nonlinearModelReady ? [studentPredict] : []}
            enlargeable={false}
          />
          {showModelEntry ? (
            <>
              {(mode === 'quadraticFitPrediction' || mode === 'quadraticFit') ? (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:10, marginTop:12 }}>
                  <Field label="a in y = ax² + bx + c"><input type="number" step="0.01" value={quadraticA} onChange={(e)=>{setQuadraticA(e.target.value);clearFeedback();}} style={inputStyle}/></Field>
                  <Field label="b"><input type="number" step="0.01" value={quadraticB} onChange={(e)=>{setQuadraticB(e.target.value);clearFeedback();}} style={inputStyle}/></Field>
                  <Field label="c"><input type="number" step="0.01" value={quadraticC} onChange={(e)=>{setQuadraticC(e.target.value);clearFeedback();}} style={inputStyle}/></Field>
                </div>
              ) : (mode === 'exponentialFitPrediction' || mode === 'exponentialFit') ? (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:12 }}>
                  <Field label="a in y = a(b)^x"><input type="number" step="0.01" value={exponentialA} onChange={(e)=>{setExponentialA(e.target.value);clearFeedback();}} style={inputStyle}/></Field>
                  <Field label="Base b"><input type="number" step="0.001" value={exponentialBase} onChange={(e)=>{setExponentialBase(e.target.value);clearFeedback();}} style={inputStyle}/></Field>
                </div>
              ) : mode === 'squareRootFitPrediction' ? (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:10, marginTop:12 }}>
                  <Field label="a in y = a√(x-h)+k"><input type="number" step="0.01" value={squareRootA} onChange={(e)=>{setSquareRootA(e.target.value);clearFeedback();}} style={inputStyle}/></Field>
                  <Field label="h (endpoint x)"><input type="number" step="0.01" value={squareRootH} onChange={(e)=>{setSquareRootH(e.target.value);clearFeedback();}} style={inputStyle}/></Field>
                  <Field label="k (endpoint y)"><input type="number" step="0.01" value={squareRootK} onChange={(e)=>{setSquareRootK(e.target.value);clearFeedback();}} style={inputStyle}/></Field>
                </div>
              ) : exploratoryLineFit ? (
                <div className="mathmaster-line-fit-steppers" style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:10, marginTop:12 }}>
                  <FitStepper label="Slope m" value={m} control={fitControls.slope} onChange={(value)=>{setM(value);clearFeedback();}} />
                  <FitStepper label="Intercept b" value={b} control={fitControls.intercept} onChange={(value)=>{setB(value);clearFeedback();}} />
                  {lineFitRegressionTechnology ? (
                    <section
                      aria-label="Linear regression technology"
                      style={{ gridColumn:'1 / -1', border:'1px solid var(--mm-primary-border)', borderRadius:10, padding:11, background:'var(--mm-surface-tint)' }}
                    >
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
                        <div>
                          <strong style={{ color:'var(--mm-primary-text)' }}>Regression technology</strong>
                          <div style={{ marginTop:3, color:'var(--mm-text-muted)', fontSize:12 }}>After making your estimate, run linear regression on the full data set. Its line becomes your model.</div>
                        </div>
                        <button
                          type="button"
                          // RUNNING REGRESSION IS USING IT. The result used to
                          // sit beside a separate "Use regression model" button,
                          // so a student who ran regression and predicted from
                          // its line still submitted the untouched starting
                          // line as their model and lost half the credit and a
                          // try (live QA, Algebra I DOL #2 Practice Q10). The
                          // estimate stays on screen for comparison.
                          onClick={() => {
                            if (!regressionTechnologyRun) setRegressionEstimate({ m, b });
                            setM(round(regression.m, 3));
                            setB(round(regression.b, 3));
                            setRegressionTechnologyRun(true);
                            clearFeedback();
                          }}
                          style={{ minHeight:42, border:'1px solid #174ea6', borderRadius:9, background:'#174ea6', color:'#fff', padding:'8px 12px', fontWeight:850 }}
                        >
                          Run linear regression
                        </button>
                      </div>
                      {regressionTechnologyRun ? (
                        <div data-line-fit-regression-result style={{ marginTop:10, display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
                          <output aria-live="polite" style={{ fontWeight:850, color:'var(--mm-text-strong)' }}>
                            y = {round(regression.m, 3)}x {regression.b >= 0 ? '+' : '−'} {Math.abs(round(regression.b, 3))}
                            <span style={{ marginLeft:10, color:'var(--mm-text-muted)', fontWeight:700 }}>r ≈ {formatCorrelation(r)}</span>
                          </output>
                          {regressionEstimate ? (
                            <span style={{ color:'var(--mm-text-muted)', fontSize:13 }}>
                              Your estimate was y = {regressionEstimate.m}x {Number(regressionEstimate.b) >= 0 ? '+' : '−'} {Math.abs(Number(regressionEstimate.b))}
                            </span>
                          ) : null}
                          {Number(m) !== round(regression.m, 3) || Number(b) !== round(regression.b, 3) ? (
                            <button
                              type="button"
                              onClick={() => { setM(round(regression.m, 3)); setB(round(regression.b, 3)); clearFeedback(); }}
                              style={{ minHeight:40, border:'1px solid var(--mm-primary-border)', borderRadius:9, background:'var(--mm-surface)', color:'var(--mm-primary-text)', padding:'7px 11px', fontWeight:850 }}
                            >
                              Use regression model
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </section>
                  ) : null}
                </div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:12 }}>
                  <Field label="Slope m"><input type="number" step={slopeIncrements.normal} data-fine-step={slopeIncrements.fine} data-coarse-step={slopeIncrements.coarse} value={m} onChange={(e)=>{setM(e.target.value);clearFeedback();}} style={inputStyle}/></Field>
                  <Field label="Intercept b"><input type="number" step={interceptIncrements.normal} data-fine-step={interceptIncrements.fine} data-coarse-step={interceptIncrements.coarse} value={b} onChange={(e)=>{setB(e.target.value);clearFeedback();}} style={inputStyle}/></Field>
                </div>
              )}
              {studentModelReady ? (
                <div style={{ marginTop:12, borderRadius:10, padding:11, background:'var(--mm-primary-subtle)', color:'var(--mm-primary-text)' }}>
                  <strong>Your model:</strong>{' '}
                  {(mode === 'quadraticFitPrediction' || mode === 'quadraticFit')
                    ? <>y = {quadraticA}x² {Number(quadraticB) >= 0 ? '+' : '−'} {Math.abs(Number(quadraticB))}x {Number(quadraticC) >= 0 ? '+' : '−'} {Math.abs(Number(quadraticC))}</>
                    : (mode === 'exponentialFitPrediction' || mode === 'exponentialFit')
                      ? <>y = {exponentialA}({exponentialBase})^x</>
                      : mode === 'squareRootFitPrediction'
                        ? <>y = {squareRootA}√(x − {squareRootH}) {Number(squareRootK) >= 0 ? '+' : '−'} {Math.abs(Number(squareRootK))}</>
                        : <>y = {shownSlope}x {Number(b) >= 0 ? '+' : '−'} {shownInterceptMagnitude}</>}
                  <br/><span style={{ fontSize:13 }}>Current MAE: {Number.isFinite(studentMetrics.mae) ? round(studentMetrics.mae, 2) : '—'} · RMSE: {Number.isFinite(studentMetrics.rmse) ? round(studentMetrics.rmse, 2) : '—'}</span>
                </div>
              ) : (
                <p style={{margin:'10px 0 0',fontSize:13,color:'var(--mm-text-muted)'}}>Enter every coefficient from your regression result to draw and evaluate your model.</p>
              )}
            </>
          ) : (
            <p style={{margin:'12px 0 0',fontSize:13,color:'var(--mm-text-muted)'}}>Use the scatter plot and data values for the task. No fitted model is preloaded.</p>
          )}
        </Panel>

        {showAssociationPanel ? <Panel title={`${panelNumbers.association} · ${mode === 'correlation' ? 'Correlation interpretation' : 'Association and causation'}`}>
          {mode === 'correlation' ? (
            <div style={{ marginBottom:12 }}>
              <Field label="Correlation coefficient r">
                <input
                  type="number"
                  step="0.001"
                  inputMode="decimal"
                  value={correlationEntry}
                  onChange={(e)=>{setCorrelationEntry(e.target.value);clearFeedback();}}
                  placeholder="Use statistical technology, then enter r"
                  style={inputStyle}
                />
              </Field>
              <p style={{ margin:'7px 0 0', color:'var(--mm-text-muted)', fontSize:13 }}>
                Calculate r from the x- and y-data using statistical technology. The lab intentionally does not display r in this mode.
              </p>
            </div>
          ) : (
            <p style={{ marginTop:0, color:'var(--mm-text-muted)' }}>Correlation coefficient: <strong>r ≈ {formatCorrelation(r)}</strong></p>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Direction"><select value={direction} onChange={(e)=>setDirection(e.target.value)} style={inputStyle}><option value={UNANSWERED}>Choose…</option><option value="positive">Positive</option><option value="negative">Negative</option><option value="none">No clear direction</option></select></Field>
            <Field label="Strength"><select value={strength} onChange={(e)=>setStrength(e.target.value)} style={inputStyle}><option value={UNANSWERED}>Choose…</option><option value="strong">Strong</option><option value="moderate">Moderate</option><option value="weak">Weak</option><option value="none">None</option></select></Field>
          </div>
          {mode !== 'correlation' ? (
            <Field label="What can this observational data justify?">
              <select value={causation} onChange={(e)=>setCausation(e.target.value)} style={inputStyle}>
                <option value={UNANSWERED}>Choose…</option>
                <option value="association">An association / relationship</option>
                <option value="causation">A cause-and-effect conclusion</option>
              </select>
            </Field>
          ) : null}
          <div style={{ marginTop:14, padding:12, borderRadius:10, background:'var(--mm-warning-bg)', color:'var(--mm-warning-text)', fontSize:13 }}>
            {mode === 'correlation'
              ? 'Interpret r by its sign (direction) and magnitude (strength).'
              : 'A large |r| describes strength of linear association. It does not, by itself, prove causation.'}
          </div>
        </Panel> : null}

        {showResidualPanel ? <Panel title={`${panelNumbers.residual} · Residual evidence`}>
          {studentModelReady ? (
            <div>
              <ResidualPlot rows={studentResiduals} xMin={xMin} xMax={xMax} />
              <div style={{ maxHeight:185, overflow:'auto', border:'1px solid var(--mm-border-soft)', borderRadius:8, marginTop:10 }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead><tr style={{ background:'var(--mm-surface-sunken)' }}><th style={{padding:6}}>x</th><th>y</th><th>ŷ</th><th>residual</th></tr></thead>
                  <tbody>{studentResiduals.map((row, index)=><tr key={`${row.x}-${index}`}><td style={{padding:6,textAlign:'center'}}>{row.x}</td><td style={{textAlign:'center'}}>{row.y}</td><td style={{textAlign:'center'}}>{round(row.predicted,2)}</td><td style={{textAlign:'center'}}>{round(row.residual,2)}</td></tr>)}</tbody>
                </table>
              </div>
              <p style={{ color:'var(--mm-text-muted)', fontSize:13, marginBottom:0 }}>A good residual plot should look randomly scattered around 0 rather than forming a clear curve or pattern.</p>
            </div>
          ) : (
            <p style={{margin:0,color:'var(--mm-text-muted)'}}>Enter the complete fitted function first. Residual evidence will appear after your model can be evaluated.</p>
          )}
        </Panel> : null}

        {showModelComparePanel ? <Panel title={`${panelNumbers.compare} · Compare model families`}>
          <div style={{ display:'grid', gap:8 }}>
            {candidateModels.map((entry) => (
              <label key={entry.id} style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:10, alignItems:'center', padding:10, border:'1px solid var(--mm-tint-border)', borderRadius:10, background:modelChoice===entry.id?'var(--mm-primary-subtle)':'var(--mm-surface)' }}>
                <input type="radio" name="modelChoice" checked={modelChoice===entry.id} onChange={()=>setModelChoice(entry.id)} />
                <span><strong>{entry.label}</strong><br/><span style={{fontSize:12,color:'var(--mm-text-muted)'}}>RMSE {round(entry.metrics.rmse,2)} · MAE {round(entry.metrics.mae,2)}</span></span>
              </label>
            ))}
          </div>
          <p style={{ color:'var(--mm-text-muted)', fontSize:13 }}>Pick the model with the smaller residual error <em>and</em> a shape that makes sense for what the data describes. A model that fits these points slightly better but predicts something impossible is the wrong choice.</p>
        </Panel> : null}

        {showPredictionPanel ? <Panel title={`${panelNumbers.prediction} · ${asksPredictionType ? 'Prediction and reasonableness' : 'Prediction'}`}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Predict at x ="><input type="number" value={predictionX} readOnly={fixedPredictionTarget} aria-readonly={fixedPredictionTarget} onChange={(e)=>{if (!fixedPredictionTarget) setPredictionX(e.target.value);}} style={{...inputStyle, background:fixedPredictionTarget?'var(--mm-surface-control)':'var(--mm-surface)'}}/></Field>
            <Field label="Predicted y"><input type="number" step="0.1" value={predictionY} onChange={(e)=>setPredictionY(e.target.value)} style={inputStyle}/></Field>
          </div>
          {asksPredictionType ? <Field label="This prediction is..."><select value={predictionType} onChange={(e)=>setPredictionType(e.target.value)} style={inputStyle}><option value={UNANSWERED}>Choose…</option><option value="interpolation">Interpolation</option><option value="extrapolation">Extrapolation</option></select></Field> : null}
          {asksPredictionType ? <div style={{ marginTop:12, padding:11, borderRadius:10, background:'var(--mm-surface-tint)', color:'var(--mm-text-muted)', fontSize:13 }}>
            Interpolation predicts inside the observed x-range. Extrapolation goes beyond the data and should be treated more cautiously.
          </div> : null}
        </Panel> : null}

        <Panel title="Submit model reasoning">
          <p style={{ marginTop:0, color:'var(--mm-text-muted)' }}>Each part of your reasoning is graded separately, so getting some of it right still earns credit.</p>
          <button data-mm-enter-action="submit" type="button" onClick={check} style={{ padding:'11px 18px', border:0, borderRadius:9, background:'#1a73e8', color:'#fff', fontWeight:800, cursor:'pointer' }}>Check data model</button>
          <HintPanel hints={HINTS[mode] || HINTS.full} onHintUsed={() => onAction?.('HINT_USED')} />
          {feedback ? (
            <div style={{ marginTop:14 }}>
              <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill>
              {(() => {
                const parts = Array.isArray(feedback.metadata?.parts) ? feedback.metadata.parts : [];
                const missed = parts.filter((part) => !part.isCorrect).map((part) => part.id);
                const label = { fit:'the fitted function', correlation:'the correlation coefficient', correlationInterpretation:'the direction/strength interpretation', association:'the association description', modelChoice:'the model family', prediction:'the requested prediction' };
                const text = feedback.isCorrect
                  ? 'Every part of your modelling reasoning holds up.'
                  : `Still to fix: ${missed.map((part) => label[part] || part).join(', ')}. Everything else is right.`;
                return <p style={{ margin:'9px 0 0', color:'var(--mm-text)', lineHeight:1.55 }}>{text}</p>;
              })()}
              <div style={{ marginTop:12, padding:12, borderRadius:10, background:'var(--mm-surface-sunken)', fontSize:13, color:'var(--mm-text-muted)' }}>
                <strong>Reference after submit:</strong> linear regression y ≈ {round(regression.m,2)}x {regression.b>=0?'+':'−'} {Math.abs(round(regression.b,2))}; best candidate by {questionData.modelMetric || 'RMSE'}: {bestModel?.label || '—'}.
              </div>
            </div>
          ) : null}
        </Panel>
      </ToolGrid>
    </ToolShell>
  );
}

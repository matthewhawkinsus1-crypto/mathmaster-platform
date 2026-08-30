import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, ResultPill, ToolGrid, TaskCard, HintPanel } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { correlation, linearRegression, parseNumericAnswer, residualsForLine, round } from '../shared/toolMath';
import {
  buildCandidateModels,
  chooseBestModel,
  correlationDescriptor,
  modelMetrics,
  predictionKind,
} from './dataModelingMath';
import useToolSubmission from '../shared/useToolSubmission';

const DEFAULT_POINTS = [[1,2],[2,3],[3,5],[4,5],[5,7],[6,8],[7,10]];

const Field = ({ label, children }) => (
  <label style={{ display:'block', fontSize:13, color:'#465267', fontWeight:700 }}>
    {label}
    <div style={{ marginTop:5 }}>{children}</div>
  </label>
);

const inputStyle = { width:'100%', boxSizing:'border-box', padding:'9px 10px', border:'1px solid #cfd8e6', borderRadius:8, background:'#fff' };

const modelFunction = (entry) => entry?.predict || (() => Number.NaN);

const MODE_TASKS = {'full': 'Fit a line to the data, describe the association, choose the best model family, and make a prediction you can defend.', 'lineFit': 'Find the slope and intercept of a line that fits this data well.', 'association': 'Describe the direction and strength of the association, and say what this data can justify.', 'correlation': 'Use statistical technology to calculate the correlation coefficient r, then interpret its direction and strength and state what the data can justify.', 'prediction': 'Use the model to predict a value, and say whether that prediction is interpolation or extrapolation.', 'modelCompare': 'Decide which model family fits this data best.'};
const MODE_STEPS = {'full': ['Adjust the slope and intercept until the residuals are small and evenly scattered.', 'Read the correlation to describe direction and strength.', 'Compare the model families, then predict and classify.'], 'lineFit': ['Move the slope until the line matches the overall trend.', 'Move the intercept until the line sits through the middle of the points.', 'Watch the residual plot — you want it scattered around zero with no pattern.'], 'association': ['Look at whether the points rise or fall from left to right.', 'Look at how tightly they cluster around a line.', 'Decide whether this data could show cause and effect, or only a relationship.'], 'correlation': ['Run a correlation calculation on the x- and y-data using statistical technology.', 'Record r to at least the thousandths place.', 'Use the sign and magnitude of r to interpret direction and strength, then distinguish association from causation.'], 'prediction': ['Enter the x-value you are predicting at.', 'Use the model to compute the predicted y.', 'Decide whether that x is inside or outside the observed data.'], 'modelCompare': ['Compare the residual error of each candidate.', 'Check that the shape is reasonable for what the data describes.', 'Select the best model and check.']};
const HINTS = {'full': ['Work through the panels in order — each one builds on the last.', 'A good fit has residuals scattered above and below zero with no curve or pattern in them.', 'Correlation describes how tightly the points follow a line. It never proves that one variable causes the other.'], 'lineFit': ['Get the slope roughly right first, then slide the intercept to centre the line.', 'Slope is rise over run: pick two points far apart on the trend and compare how much y changes to how much x changes.', 'If the residual plot curves, a straight line is the wrong shape for this data — that is information, not failure.'], 'association': ['Direction is about which way the cloud of points tilts.', 'Strength is about how close the points sit to a single line, not how steep that line is.', 'Observational data can only establish an association. Only a controlled experiment can establish cause and effect.'], 'correlation': ['Use the statistical correlation or linear-regression feature of your approved technology; do not estimate r from the picture.', 'The sign of r gives direction. The size of |r| describes how tightly the points follow a line.', 'Correlation can support an association claim, but correlation alone cannot establish cause and effect.'], 'prediction': ['Substitute your x into the model and compute the y it gives.', 'Interpolation means predicting inside the range of x-values you actually observed.', 'Extrapolation goes beyond the data, where the pattern may not hold — treat those predictions cautiously.'], 'modelCompare': ['Smaller residual error means the model is closer to the points on average.', 'RMSE punishes large misses more than MAE does, so a model with one big error will look worse under RMSE.', 'Also ask whether the shape makes sense: a model that fits well but predicts a negative quantity is still wrong.']};

function ResidualPlot({ rows, xMin, xMax }) {
  const absMax = Math.max(2, ...rows.map((row) => Math.abs(row.residual || 0)));
  return (
    <CoordinatePlane xMin={xMin} xMax={xMax} yMin={-Math.ceil(absMax)} yMax={Math.ceil(absMax)} height={250}
      points={rows.map((row) => ({ 0:row.x, 1:row.residual, label:'' }))}
      horizontalLines={[0]} />
  );
}

export default function DataModelingLab({ questionData = {}, onAction }) {
  const points = questionData.points || DEFAULT_POINTS;
  const mode = questionData.mode || 'full';
  const regression = useMemo(() => linearRegression(points), [points]);
  const candidateModels = useMemo(() => buildCandidateModels(points, regression), [points, regression]);
  const bestModel = useMemo(() => chooseBestModel(candidateModels, questionData.modelMetric || 'rmse'), [candidateModels, questionData.modelMetric]);
  const r = useMemo(() => correlation(points), [points]);
  const descriptor = useMemo(() => correlationDescriptor(r), [r]);
  const xs = points.map(([x]) => Number(x));
  const ys = points.map(([, y]) => Number(y));
  const xMin = Math.floor(Math.min(...xs, 0) - 1);
  const xMax = Math.ceil(Math.max(...xs, 1) + 2);
  const yMin = Math.floor(Math.min(...ys, 0) - 2);
  const yMax = Math.ceil(Math.max(...ys, 1) + 3);

  const [m, setM] = useState(questionData.startingModel?.m ?? round(regression.m * 0.75, 2));
  const [b, setB] = useState(questionData.startingModel?.b ?? round(regression.b + 1, 2));
  const [direction, setDirection] = useState('positive');
  const [strength, setStrength] = useState('moderate');
  const [causation, setCausation] = useState('association');
  const [modelChoice, setModelChoice] = useState('linear');
  const [predictionX, setPredictionX] = useState(questionData.predictionX ?? xMax - 1);
  const [predictionY, setPredictionY] = useState('');
  const [predictionType, setPredictionType] = useState('interpolation');
  const [correlationEntry, setCorrelationEntry] = useState('');
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);

  const studentResiduals = useMemo(() => residualsForLine(points, Number(m), Number(b)), [points, m, b]);
  const studentMetrics = useMemo(() => modelMetrics(points, (x) => Number(m) * x + Number(b)), [points, m, b]);
  const expectedModelId = questionData.expectedModel || bestModel?.id || 'linear';
  const expectedModel = candidateModels.find((entry) => entry.id === expectedModelId) || candidateModels[0];
  const expectedPrediction = expectedModel ? modelFunction(expectedModel)(Number(predictionX)) : Number.NaN;
  const expectedPredictionType = predictionKind(points, predictionX);

  const requiredParts = mode === 'lineFit' ? ['fit']
    : mode === 'association' ? ['association']
      : mode === 'correlation' ? ['correlation', 'association']
        : mode === 'prediction' ? ['prediction']
          : mode === 'modelCompare' ? ['modelChoice']
            : ['fit', 'association', 'modelChoice', 'prediction'];

  const check = () => {
    const results = {};
    const slopeTolerance = Number(questionData.slopeTolerance ?? Math.max(0.2, Math.abs(regression.m) * 0.12));
    const interceptTolerance = Number(questionData.interceptTolerance ?? 0.8);
    const fitSlope = parseNumericAnswer(m);
    const fitIntercept = parseNumericAnswer(b);
    results.fit = fitSlope != null && fitIntercept != null
      && Math.abs(fitSlope - regression.m) <= slopeTolerance
      && Math.abs(fitIntercept - regression.b) <= interceptTolerance;
    results.association = direction === descriptor.direction && strength === descriptor.strength && causation === (questionData.causationSupported ? 'causation' : 'association');
    const enteredCorrelation = parseNumericAnswer(correlationEntry);
    const correlationTolerance = Number(questionData.correlationTolerance ?? 0.03);
    results.correlation = enteredCorrelation != null
      && Math.abs(enteredCorrelation - r) <= correlationTolerance;
    results.modelChoice = modelChoice === expectedModelId;
    const predictionTolerance = Number(questionData.predictionTolerance ?? Math.max(0.5, Math.abs(expectedPrediction) * 0.08));
    const predicted = parseNumericAnswer(predictionY);
    results.prediction = predicted != null && Number.isFinite(expectedPrediction)
      && Math.abs(predicted - expectedPrediction) <= predictionTolerance
      && predictionType === expectedPredictionType;

    const scored = requiredParts.map((part) => results[part]);
    const score = scored.filter(Boolean).length / scored.length;
    submit(
      { isCorrect: score === 1, score },
      { m:Number(m), b:Number(b), r:Number(correlationEntry), direction, strength, causation, modelChoice, predictionX:Number(predictionX), predictionY:Number(predictionY), predictionType },
      {
        mode,
        parts: results,
        expectedModel: expectedModelId,
        regression: { m:regression.m, b:regression.b, r },
        expectedPrediction,
        expectedPredictionType,
      },
    );
  };

  return (
    <ToolShell
      title="Data Modeling Lab"
      subtitle="Build a model, inspect residuals, compare functions, and make defensible predictions without confusing association with causation."
      badge="Algebra I / II · Data Modeling"
    >
      <TaskCard question={questionData} task={MODE_TASKS[mode] || MODE_TASKS.full} steps={MODE_STEPS[mode] || MODE_STEPS.full} />
      <ToolGrid min={350}>
        <Panel title="1 · Scatter plot and your model">
          <CoordinatePlane
            xMin={xMin} xMax={xMax} yMin={yMin} yMax={yMax}
            points={points.map(([x,y]) => ({ 0:x, 1:y }))}
            lines={[{ m:Number(m), b:Number(b) }]}
          />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:12 }}>
            <Field label="Slope m"><input type="number" step="0.1" value={m} onChange={(e)=>{setM(e.target.value);clearFeedback();}} style={inputStyle}/></Field>
            <Field label="Intercept b"><input type="number" step="0.1" value={b} onChange={(e)=>{setB(e.target.value);clearFeedback();}} style={inputStyle}/></Field>
          </div>
          <div style={{ marginTop:12, borderRadius:10, padding:11, background:'#f3f7ff', color:'#344563' }}>
            <strong>Your model:</strong> y = {m}x {Number(b) >= 0 ? '+' : '−'} {Math.abs(Number(b))}
            <br/><span style={{ fontSize:13 }}>Current MAE: {round(studentMetrics.mae, 2)} · RMSE: {round(studentMetrics.rmse, 2)}</span>
          </div>
        </Panel>

        <Panel title="2 · Association and causation">
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
              <p style={{ margin:'7px 0 0', color:'#5f6b7a', fontSize:13 }}>
                Calculate r from the x- and y-data using statistical technology. The lab intentionally does not display r in this mode.
              </p>
            </div>
          ) : (
            <p style={{ marginTop:0, color:'#4b5563' }}>Correlation coefficient: <strong>r ≈ {round(r, 3)}</strong></p>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Direction"><select value={direction} onChange={(e)=>setDirection(e.target.value)} style={inputStyle}><option value="positive">Positive</option><option value="negative">Negative</option><option value="none">No clear direction</option></select></Field>
            <Field label="Strength"><select value={strength} onChange={(e)=>setStrength(e.target.value)} style={inputStyle}><option value="strong">Strong</option><option value="moderate">Moderate</option><option value="weak">Weak</option><option value="none">None</option></select></Field>
          </div>
          <Field label="What can this observational data justify?">
            <select value={causation} onChange={(e)=>setCausation(e.target.value)} style={inputStyle}>
              <option value="association">An association / relationship</option>
              <option value="causation">A cause-and-effect conclusion</option>
            </select>
          </Field>
          <div style={{ marginTop:14, padding:12, borderRadius:10, background:'#fff8e6', color:'#6d4c00', fontSize:13 }}>
            A large |r| describes strength of linear association. It does not, by itself, prove causation.
          </div>
        </Panel>

        <Panel title="3 · Residual evidence">
          <ResidualPlot rows={studentResiduals} xMin={xMin} xMax={xMax} />
          <div style={{ maxHeight:185, overflow:'auto', border:'1px solid #e5e7eb', borderRadius:8, marginTop:10 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead><tr style={{ background:'#f7f9fc' }}><th style={{padding:6}}>x</th><th>y</th><th>ŷ</th><th>residual</th></tr></thead>
              <tbody>{studentResiduals.map((row, index)=><tr key={`${row.x}-${index}`}><td style={{padding:6,textAlign:'center'}}>{row.x}</td><td style={{textAlign:'center'}}>{row.y}</td><td style={{textAlign:'center'}}>{round(row.predicted,2)}</td><td style={{textAlign:'center'}}>{round(row.residual,2)}</td></tr>)}</tbody>
            </table>
          </div>
          <p style={{ color:'#5f6b7a', fontSize:13, marginBottom:0 }}>A good residual plot should look randomly scattered around 0 rather than forming a clear curve or pattern.</p>
        </Panel>

        <Panel title="4 · Compare model families">
          <div style={{ display:'grid', gap:8 }}>
            {candidateModels.map((entry) => (
              <label key={entry.id} style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:10, alignItems:'center', padding:10, border:'1px solid #dde5f0', borderRadius:10, background:modelChoice===entry.id?'#eef4ff':'#fff' }}>
                <input type="radio" name="modelChoice" checked={modelChoice===entry.id} onChange={()=>setModelChoice(entry.id)} />
                <span><strong>{entry.label}</strong><br/><span style={{fontSize:12,color:'#667085'}}>RMSE {round(entry.metrics.rmse,2)} · MAE {round(entry.metrics.mae,2)}</span></span>
              </label>
            ))}
          </div>
          <p style={{ color:'#5f6b7a', fontSize:13 }}>Pick the model with the smaller residual error <em>and</em> a shape that makes sense for what the data describes. A model that fits these points slightly better but predicts something impossible is the wrong choice.</p>
        </Panel>

        <Panel title="5 · Prediction and reasonableness">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Predict at x ="><input type="number" value={predictionX} onChange={(e)=>setPredictionX(e.target.value)} style={inputStyle}/></Field>
            <Field label="Predicted y"><input type="number" step="0.1" value={predictionY} onChange={(e)=>setPredictionY(e.target.value)} style={inputStyle}/></Field>
          </div>
          <Field label="This prediction is..."><select value={predictionType} onChange={(e)=>setPredictionType(e.target.value)} style={inputStyle}><option value="interpolation">Interpolation</option><option value="extrapolation">Extrapolation</option></select></Field>
          <div style={{ marginTop:12, padding:11, borderRadius:10, background:'#f8fbff', color:'#4b5563', fontSize:13 }}>
            Interpolation predicts inside the observed x-range. Extrapolation goes beyond the data and should be treated more cautiously.
          </div>
        </Panel>

        <Panel title="Submit model reasoning">
          <p style={{ marginTop:0, color:'#5f6b7a' }}>Each part of your reasoning is graded separately, so getting some of it right still earns credit.</p>
          <button type="button" onClick={check} style={{ padding:'11px 18px', border:0, borderRadius:9, background:'#1a73e8', color:'#fff', fontWeight:800, cursor:'pointer' }}>Check data model</button>
          <HintPanel hints={HINTS[mode] || HINTS.full} onHintUsed={() => onAction?.('HINT_USED')} />
          {feedback ? (
            <div style={{ marginTop:14 }}>
              <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill>
              {(() => {
                const parts = feedback.metadata?.parts || {};
                const missed = requiredParts.filter((part) => !parts[part]);
                const label = { fit:'the line of best fit', correlation:'the correlation coefficient', association:'the association description', modelChoice:'the model family', prediction:'the prediction' };
                const text = feedback.isCorrect
                  ? 'Every part of your modelling reasoning holds up.'
                  : `Still to fix: ${missed.map((part) => label[part] || part).join(', ')}. Everything else is right.`;
                return <p style={{ margin:'9px 0 0', color:'#3c4756', lineHeight:1.55 }}>{text}</p>;
              })()}
              <div style={{ marginTop:12, padding:12, borderRadius:10, background:'#f7f9fc', fontSize:13, color:'#44516a' }}>
                <strong>Reference after submit:</strong> linear regression y ≈ {round(regression.m,2)}x {regression.b>=0?'+':'−'} {Math.abs(round(regression.b,2))}; best candidate by {questionData.modelMetric || 'RMSE'}: {bestModel?.label || '—'}.
              </div>
            </div>
          ) : null}
        </Panel>
      </ToolGrid>
    </ToolShell>
  );
}

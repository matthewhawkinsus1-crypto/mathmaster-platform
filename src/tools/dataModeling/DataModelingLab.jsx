import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, ResultPill, ToolGrid } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { correlation, linearRegression, residualsForLine, round } from '../shared/toolMath';
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
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);

  const studentResiduals = useMemo(() => residualsForLine(points, Number(m), Number(b)), [points, m, b]);
  const studentMetrics = useMemo(() => modelMetrics(points, (x) => Number(m) * x + Number(b)), [points, m, b]);
  const expectedModelId = questionData.expectedModel || bestModel?.id || 'linear';
  const expectedModel = candidateModels.find((entry) => entry.id === expectedModelId) || candidateModels[0];
  const expectedPrediction = expectedModel ? modelFunction(expectedModel)(Number(predictionX)) : Number.NaN;
  const expectedPredictionType = predictionKind(points, predictionX);

  const requiredParts = mode === 'lineFit' ? ['fit']
    : mode === 'association' ? ['association']
      : mode === 'prediction' ? ['prediction']
        : mode === 'modelCompare' ? ['modelChoice']
          : ['fit', 'association', 'modelChoice', 'prediction'];

  const check = () => {
    const results = {};
    const slopeTolerance = Number(questionData.slopeTolerance ?? Math.max(0.2, Math.abs(regression.m) * 0.12));
    const interceptTolerance = Number(questionData.interceptTolerance ?? 0.8);
    results.fit = Math.abs(Number(m) - regression.m) <= slopeTolerance && Math.abs(Number(b) - regression.b) <= interceptTolerance;
    results.association = direction === descriptor.direction && strength === descriptor.strength && causation === (questionData.causationSupported ? 'causation' : 'association');
    results.modelChoice = modelChoice === expectedModelId;
    const predictionTolerance = Number(questionData.predictionTolerance ?? Math.max(0.5, Math.abs(expectedPrediction) * 0.08));
    results.prediction = Number.isFinite(Number(predictionY)) && Math.abs(Number(predictionY) - expectedPrediction) <= predictionTolerance && predictionType === expectedPredictionType;

    const scored = requiredParts.map((part) => results[part]);
    const score = scored.filter(Boolean).length / scored.length;
    submit(
      { isCorrect: score === 1, score },
      { m:Number(m), b:Number(b), direction, strength, causation, modelChoice, predictionX:Number(predictionX), predictionY:Number(predictionY), predictionType },
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
      footer="Question JSON controls which reasoning parts are graded. The same lab supports line-of-best-fit, residual, prediction, correlation, and model-choice families."
    >
      <ToolGrid min={350}>
        <Panel title="1 · Scatter plot and student model">
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
          <p style={{ marginTop:0, color:'#4b5563' }}>Correlation coefficient: <strong>r ≈ {round(r, 3)}</strong></p>
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
              <label key={entry.id} style={{ display:'grid', gridTemplateColumns:'auto 1fr auto', gap:10, alignItems:'center', padding:10, border:'1px solid #dde5f0', borderRadius:10, background:modelChoice===entry.id?'#eef4ff':'#fff' }}>
                <input type="radio" name="modelChoice" checked={modelChoice===entry.id} onChange={()=>setModelChoice(entry.id)} />
                <span><strong>{entry.label}</strong><br/><span style={{fontSize:12,color:'#667085'}}>RMSE {round(entry.metrics.rmse,2)} · MAE {round(entry.metrics.mae,2)}</span></span>
                <span style={{fontSize:12,fontWeight:800,color:'#52617a'}}>{entry.id}</span>
              </label>
            ))}
          </div>
          <p style={{ color:'#5f6b7a', fontSize:13 }}>Choose the model with smaller residual error <em>and</em> a shape that is reasonable for the context. The family can lock the intended model when the instructional goal is model recognition.</p>
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
          <p style={{ marginTop:0, color:'#5f6b7a' }}>This task grades only the parts requested by <code>questionData.mode</code>. A full task can score fit, association, model choice, and prediction separately for partial credit.</p>
          <button type="button" onClick={check} style={{ padding:'11px 18px', border:0, borderRadius:9, background:'#1a73e8', color:'#fff', fontWeight:800, cursor:'pointer' }}>Check data model</button>
          {feedback ? (
            <div style={{ marginTop:14 }}>
              <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'All requested modeling evidence is correct.' : `Modeling evidence: ${Math.round(feedback.score*100)}%`}</ResultPill>
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

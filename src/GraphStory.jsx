import { useEffect, useRef } from 'react';
import QuestionPrompt from './QuestionPrompt';
import GraphDisplay from './GraphDisplay';
import useUndoHistory from './useUndoHistory';
import { stableStringify } from './scenarioResponseUtils';

const WIDTH = 720;
const HEIGHT = 420;
const PAD = 44;

const pointFromEvent = (event, element) => {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.max(PAD, Math.min(WIDTH - PAD, ((event.clientX - rect.left) / rect.width) * WIDTH)),
    y: Math.max(PAD, Math.min(HEIGHT - PAD, ((event.clientY - rect.top) / rect.height) * HEIGHT)),
  };
};

export default function GraphStory({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const initial = {
    scenario: '',
    independent: '',
    dependent: '',
    xLabel: '',
    xUnit: '',
    yLabel: '',
    yUnit: '',
    explanation: '',
    strokes: [],
  };
  const history = useUndoHistory(initial, 100, draftKey ? `${draftKey}:graph-story` : null);
  const values = history.value;
  const drawingRef = useRef(false);

  const hasSourceGraph = Boolean(question?.graph && typeof question.graph === 'object');
  const requireSketch = question.requireSketch === true || !hasSourceGraph;
  const parts = [
    { id: 'scenario', label: 'Scenario', isComplete: values.scenario.trim().length >= Number(question.minimumScenarioCharacters || 20), isCorrect: values.scenario.trim().length >= Number(question.minimumScenarioCharacters || 20), response: values.scenario },
    { id: 'independent', label: 'Independent quantity', isComplete: Boolean(values.independent.trim()), isCorrect: Boolean(values.independent.trim()), response: values.independent },
    { id: 'dependent', label: 'Dependent quantity', isComplete: Boolean(values.dependent.trim()), isCorrect: Boolean(values.dependent.trim()), response: values.dependent },
    { id: 'axis-labels', label: 'Axis labels and units', isComplete: [values.xLabel, values.xUnit, values.yLabel, values.yUnit].every((value) => value.trim()), isCorrect: [values.xLabel, values.xUnit, values.yLabel, values.yUnit].every((value) => value.trim()), response: `${values.xLabel} (${values.xUnit}); ${values.yLabel} (${values.yUnit})` },
    ...(requireSketch ? [{ id: 'graph-sketch', label: 'Graph sketch', isComplete: values.strokes.some((stroke) => stroke.length >= 3), isCorrect: values.strokes.some((stroke) => stroke.length >= 3), response: `${values.strokes.length} stroke(s)` }] : []),
    { id: 'explanation', label: 'Explanation of the graph', isComplete: values.explanation.trim().length >= Number(question.minimumExplanationCharacters || 20), isCorrect: values.explanation.trim().length >= Number(question.minimumExplanationCharacters || 20), response: values.explanation },
  ];
  const isComplete = parts.every((part) => part.isComplete);
  const isCorrect = isComplete; // Open-ended graph stories earn completion credit and remain visible for teacher review.

  useEffect(() => {
    const compact = { ...values, strokes: values.strokes.map((stroke) => stroke.filter((_, index) => index % 4 === 0).slice(0, 60)) };
    onStateChange({
      isComplete,
      isCorrect,
      responseKey: stableStringify(compact),
      questionDetails: `${question.prompt || 'Create a graph story.'} Scenario: ${values.scenario}. Independent: ${values.independent}. Dependent: ${values.dependent}. Axes: ${values.xLabel} (${values.xUnit}) and ${values.yLabel} (${values.yUnit}). Explanation: ${values.explanation}. Sketch strokes: ${values.strokes.length}.`,
      parts,
    });
  }, [isComplete, isCorrect, onStateChange, question.prompt, values]);

  useEffect(() => {
    onUndoStateChange?.({ canUndo: history.canUndo, onUndo: history.undo, label: 'Undo the last graph-story edit or stroke' });
    return () => onUndoStateChange?.(null);
  }, [history.canUndo, history.undo, onUndoStateChange]);

  const setField = (field, value) => history.setValue((current) => ({ ...current, [field]: value }));
  const startStroke = (event) => {
    drawingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = pointFromEvent(event, event.currentTarget);
    history.setValue((current) => ({ ...current, strokes: [...current.strokes, [point]] }));
  };
  const continueStroke = (event) => {
    if (!drawingRef.current) return;
    const point = pointFromEvent(event, event.currentTarget);
    history.setValue((current) => {
      const strokes = [...current.strokes];
      const last = [...(strokes.at(-1) || [])];
      last.push(point);
      strokes[strokes.length - 1] = last;
      return { ...current, strokes };
    }, { record: false });
  };
  const endStroke = () => { drawingRef.current = false; };

  const gridLines = [];
  for (let x = PAD; x <= WIDTH - PAD; x += 42) gridLines.push(<line key={`vx-${x}`} x1={x} y1={PAD} x2={x} y2={HEIGHT - PAD} stroke="#e5e9ef" />);
  for (let y = PAD; y <= HEIGHT - PAD; y += 42) gridLines.push(<line key={`hy-${y}`} x1={PAD} y1={y} x2={WIDTH - PAD} y2={y} stroke="#e5e9ef" />);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', textAlign: 'left' }}>
      <h2 style={{ textAlign: 'center', marginTop: 0 }}>{hasSourceGraph ? 'Read the Graph and Tell Its Story' : 'Write a Scenario and Sketch Its Graph'}</h2>
      <QuestionPrompt>{question.prompt || 'Write a real-world scenario, sketch a graph, and explain how the graph tells the story.'}</QuestionPrompt>
      {hasSourceGraph && <div style={{ maxWidth: '760px', margin: '18px auto' }}><GraphDisplay graph={question.graph} title={question.graphTitle || 'Graph to interpret'} /></div>}
      <p style={{ padding: '10px 14px', borderRadius: '9px', background: '#e8f0fe', color: '#174ea6', fontWeight: 700 }}>This open-ended question earns completion credit when every required part is present. The teacher can review the written response and saved work in the gradebook.</p>
      <label style={{ display: 'block', fontWeight: 800 }}>Scenario
        <textarea value={values.scenario} onChange={(event) => setField('scenario', event.target.value)} placeholder="Describe a possible trip, cost, distance, height, or another changing relationship." style={{ width: '100%', minHeight: '110px', marginTop: '7px', padding: '12px', boxSizing: 'border-box', borderRadius: '9px', border: '2px solid #bdc7d6', font: 'inherit' }} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '16px' }}>
        {[
          ['independent', 'Independent quantity'], ['dependent', 'Dependent quantity'],
          ['xLabel', 'X-axis label'], ['xUnit', 'X-axis unit'], ['yLabel', 'Y-axis label'], ['yUnit', 'Y-axis unit'],
        ].map(([field, label]) => <label key={field} style={{ fontWeight: 800 }}>{label}<input value={values[field]} onChange={(event) => setField(field, event.target.value)} style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', boxSizing: 'border-box', borderRadius: '8px', border: '2px solid #bdc7d6', fontSize: '16px' }} /></label>)}
      </div>
      {requireSketch && <section style={{ marginTop: '22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}><h3 style={{ margin: 0 }}>Graph sketch</h3><button type="button" onClick={() => setField('strokes', [])} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #d93025', background: '#fff', color: '#d93025', fontWeight: 800 }}>Clear graph</button></div>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} onPointerDown={startStroke} onPointerMove={continueStroke} onPointerUp={endStroke} onPointerCancel={endStroke} style={{ display: 'block', width: '100%', marginTop: '10px', border: '2px solid #9fb3cc', borderRadius: '12px', background: '#fff', touchAction: 'none', cursor: 'crosshair' }} role="img" aria-label="Blank coordinate plane for graph story">
          <rect x={PAD} y={PAD} width={WIDTH - PAD * 2} height={HEIGHT - PAD * 2} fill="#fff" stroke="#c7ced8" />
          {gridLines}
          <line x1={PAD} y1={HEIGHT - PAD} x2={WIDTH - PAD} y2={HEIGHT - PAD} stroke="#3c4043" strokeWidth="3" />
          <line x1={PAD} y1={PAD} x2={PAD} y2={HEIGHT - PAD} stroke="#3c4043" strokeWidth="3" />
          <text x={WIDTH - PAD - 8} y={HEIGHT - PAD - 10} textAnchor="end" fontSize="17" fill="#3c4043">{values.xLabel || 'x'}</text>
          <text x={PAD + 10} y={PAD + 20} fontSize="17" fill="#3c4043">{values.yLabel || 'y'}</text>
          {values.strokes.map((stroke, index) => <polyline key={index} points={stroke.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#1a73e8" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />)}
        </svg>
      </section>}
      <label style={{ display: 'block', marginTop: '20px', fontWeight: 800 }}>Explain what the points, segments, or smooth curve represent
        <textarea value={values.explanation} onChange={(event) => setField('explanation', event.target.value)} style={{ width: '100%', minHeight: '110px', marginTop: '7px', padding: '12px', boxSizing: 'border-box', borderRadius: '9px', border: `2px solid ${feedback?.partGrades?.find((part) => part.id === 'explanation' && !part.isCorrect) ? '#d93025' : '#bdc7d6'}`, font: 'inherit' }} />
      </label>
    </div>
  );
}

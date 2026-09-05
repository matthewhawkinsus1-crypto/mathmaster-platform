import React, { useState } from 'react';
import ToolShell, { Panel, ToolGrid, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { matchesNumericAnswer, round } from '../shared/toolMath';
import { evaluate } from 'mathjs';
import useToolSubmission from '../shared/useToolSubmission';
import {
  compareSequencesAt,
  generateSequence,
  normalizeSequenceSpec,
  sequenceChange,
  sequencePartialSum,
  sequenceEvidenceCount,
  sequenceRuleParts,
  sequenceTerm,
} from './sequenceMath';

const inputStyle = { width: '100%', padding: 9, border: '1px solid #cfd8e6', borderRadius: 8, boxSizing: 'border-box' };
const actionStyle = { marginTop: 14, padding: '10px 16px', border: 0, borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 800, cursor: 'pointer' };
const numberText = (value) => `${round(value, 4)}`;
const matchesNumber = (answer, expected, tolerance = 0.01) => matchesNumericAnswer(answer, expected, tolerance);

const sequenceFromQuestion = (questionData = {}) => {
  const kind = questionData.sequence?.kind || questionData.kind || 'arithmetic';
  return normalizeSequenceSpec({ ...questionData.sequence, kind }, kind);
};

const graphBounds = (values = []) => {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { yMin: -5, yMax: 5 };
  const dataLow = Math.min(...finite);
  const dataHigh = Math.max(...finite);
  const span = Math.max(4, dataHigh - dataLow);
  const margin = Math.max(2, span * 0.12);
  let low = dataLow - margin;
  let high = dataHigh + margin;

  // Include zero when the data naturally lives near it or crosses it, but do
  // not waste most of the graph on empty space. This matters for sequences
  // such as 125, 143, 161, ... where forcing y=0 made the actual points appear
  // in a tiny strip at the top of a dense grid.
  if (dataLow <= 0 && dataHigh >= 0) {
    low = Math.min(low, 0);
    high = Math.max(high, 0);
  } else if (dataLow > 0 && dataLow <= span * 0.6) {
    low = 0;
  } else if (dataHigh < 0 && Math.abs(dataHigh) <= span * 0.6) {
    high = 0;
  }

  return { yMin: Math.floor(low), yMax: Math.ceil(high) };
};


const inferPlotSnapStep = (rows = [], authored = null) => {
  const supplied = Number(authored);
  if (Number.isFinite(supplied) && supplied > 0) return supplied;
  const values = rows.map((row) => Number(row.value)).filter(Number.isFinite);
  if (values.every((value) => Math.abs(value - Math.round(value)) <= 1e-9)) return 1;
  if (values.every((value) => Math.abs(value * 4 - Math.round(value * 4)) <= 1e-9)) return 0.25;
  if (values.every((value) => Math.abs(value * 10 - Math.round(value * 10)) <= 1e-9)) return 0.1;
  return 0.01;
};

const stripRuleLeftSide = (value = '') => {
  const text = String(value || '').trim().replace(/−/g, '-').replace(/×/g, '*').replace(/·/g, '*');
  const equalsIndex = text.indexOf('=');
  return equalsIndex >= 0 ? text.slice(equalsIndex + 1).trim() : text;
};

const normalizePreviousTermToken = (value = '') => (
  stripRuleLeftSide(value)
    .replace(/a\s*[_]?\s*\{?\s*n\s*[-−]\s*1\s*\}?/gi, 'p')
    .replace(/a\s*\(\s*n\s*[-−]\s*1\s*\)/gi, 'p')
    .replace(/a\s*\[\s*n\s*[-−]\s*1\s*\]/gi, 'p')
    .replace(/aₙ₋₁/gi, 'p')
);

const normalizeSequenceExpressionText = (value = '') => (
  String(value || '')
    .trim()
    .replace(/−/g, '-')
    .replace(/[×·]/g, '*')
    .replace(/\s+/g, '')
    .replace(/(\d|\))(?=[A-Za-z(])/g, '$1*')
    .replace(/([A-Za-z])(?=\d|\()/g, '$1*')
);

const expressionMatchesSamples = (value, samples = [], expectedAt = () => Number.NaN) => {
  const expression = normalizeSequenceExpressionText(value);
  if (!expression) return false;
  try {
    return samples.every((scope) => {
      const actual = Number(evaluate(expression, scope));
      const expected = Number(expectedAt(scope));
      return Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= 1e-6;
    });
  } catch {
    return false;
  }
};

const matchesExplicitRule = (value, spec) => {
  const rhs = stripRuleLeftSide(value);
  return expressionMatchesSamples(
    rhs,
    [1, 2, 3, 5, 8].map((n) => ({ n })),
    ({ n }) => sequenceTerm(spec, n),
  );
};

const matchesRecursiveRule = (value, spec) => {
  const rhs = normalizePreviousTermToken(value);
  const change = sequenceChange(spec);
  return expressionMatchesSamples(
    rhs,
    [-11, -2.5, 0, 3, 10].map((p) => ({ p })),
    ({ p }) => spec.kind === 'arithmetic' ? p + change : p * change,
  );
};

const pointSetMatchesRows = (points = [], rows = [], tolerance = 0.02) => {
  if (!Array.isArray(points) || points.length !== rows.length) return false;
  return rows.every((row) => points.some((point) => (
    Math.abs(Number(point?.[0]) - Number(row.n)) <= tolerance
    && Math.abs(Number(point?.[1]) - Number(row.value)) <= tolerance
  )));
};

function SequenceVisual({ spec, count = 7, title = 'Table + discrete graph' }) {
  const rows = generateSequence(spec, count);
  const bounds = graphBounds(rows.map((row) => row.value));
  return <Panel title={title}>
    <CoordinatePlane
      xMin={0}
      xMax={count + 1}
      yMin={bounds.yMin}
      yMax={bounds.yMax}
      points={rows.map((row) => ({ x: row.n, y: row.value, label: `a${row.n}` }))}
    />
    <div style={{ overflowX: 'auto', marginTop: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 280 }}>
        <thead><tr><th style={{ padding: 6 }}>n</th>{rows.map((row) => <th key={row.n} style={{ padding: 6 }}>{row.n}</th>)}</tr></thead>
        <tbody><tr><th style={{ padding: 6 }}>aₙ</th>{rows.map((row) => <td key={row.n} style={{ padding: 6, textAlign: 'center' }}>{numberText(row.value)}</td>)}</tr></tbody>
      </table>
    </div>
    <p style={{ marginBottom: 0, color: '#5f6b7a' }}>A sequence is a function with discrete term-number inputs. The graph keeps those inputs visually separate.</p>
  </Panel>;
}

export default function SequenceExplorer({ questionData = {}, onAction }) {
  const mode = questionData.mode || 'analyze';
  const { feedback, submit } = useToolSubmission(onAction);
  if (mode === 'fullBridge') return <FullSequenceBridge questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'ruleBridge') return <RuleBridge questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'missingTerm') return <MissingTerm questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'partialSum') return <PartialSum questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'compare') return <CompareSequences questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  return <AnalyzeSequence questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
}

function AnalyzeSequence({ questionData, feedback, submit, onAction }) {
  const spec = sequenceFromQuestion(questionData);
  const targetN = Number(questionData.targetN ?? 8);
  const expectedChange = sequenceChange(spec);
  const expectedTerm = sequenceTerm(spec, targetN);
  const [kindAnswer, setKindAnswer] = useState('');
  const [changeAnswer, setChangeAnswer] = useState('');
  const [termAnswer, setTermAnswer] = useState('');
  const check = () => {
    const checks = [kindAnswer === spec.kind, matchesNumber(changeAnswer, expectedChange, 0.001), matchesNumber(termAnswer, expectedTerm, 0.01)];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / checks.length }, { kindAnswer, changeAnswer, termAnswer }, { mode: 'analyze', targetN });
  };
  return <ToolShell title="Analyze the Sequence" subtitle="Connect the pattern, table, discrete graph, and term structure." badge="Pattern and terms">
    <TaskCard question={questionData} task={'Decide whether this sequence is arithmetic or geometric, then give its change and the requested term.'} steps={['Compare consecutive terms by subtracting, then by dividing.', 'Whichever stays constant tells you the type.', 'Use that constant to reach the requested term.']} />
    <ToolGrid min={340}>
      <SequenceVisual spec={spec} count={sequenceEvidenceCount(questionData.displayCount ?? 7, targetN, { revealTarget: questionData.revealTargetTerm === true })} />
      <Panel title="Analyze the pattern">
        <label>Sequence family<select value={kindAnswer} onChange={(event) => setKindAnswer(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="arithmetic">Arithmetic</option><option value="geometric">Geometric</option></select></label>
        <label style={{ display: 'block', marginTop: 10 }}>Common {kindAnswer === 'arithmetic' ? 'difference' : kindAnswer === 'geometric' ? 'ratio' : 'change'}<input value={changeAnswer} onChange={(event) => setChangeAnswer(event.target.value)} inputMode="decimal" style={inputStyle} /></label>
        <label style={{ display: 'block', marginTop: 10 }}>a<sub>{targetN}</sub><input value={termAnswer} onChange={(event) => setTermAnswer(event.target.value)} inputMode="decimal" style={inputStyle} /></label>
        <button type="button" onClick={check} style={actionStyle}>Check analysis</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Pattern, common change, and target term all agree.' : 'Use equal differences for arithmetic sequences and equal ratios for geometric sequences.'}</ResultPill></div> : null}
      <HintPanel hints={['Look at how each term becomes the next one. Adding the same amount every time is arithmetic; multiplying by the same amount is geometric.', 'Subtract each term from the one after it. If you always get the same number, that number is the common difference.', 'If subtraction does not give a constant, try dividing instead — a constant ratio means geometric.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid>
  </ToolShell>;
}


function FullSequenceBridge({ questionData, feedback, submit, onAction }) {
  const spec = sequenceFromQuestion(questionData);
  const actions = Array.isArray(questionData.studentActions) ? questionData.studentActions : [];
  const targetN = Number(questionData.targetN || 0);
  const requestedCount = Number(questionData.displayCount ?? 5);
  const count = sequenceEvidenceCount(
    Math.max(3, requestedCount),
    targetN > 0 ? targetN : null,
    { revealTarget: questionData.revealTargetTerm === true, cap: 8 },
  );
  const rows = generateSequence(spec, count);
  const bounds = graphBounds(rows.map((row) => row.value));
  const plotSnapStep = inferPlotSnapStep(rows, questionData.plotSnapStep);

  const requireTable = actions.includes('buildSequenceTable');
  const requirePlot = actions.includes('plotSequence');
  const requireAnalyze = actions.includes('analyzeSequence');
  const requireExplicit = actions.includes('writeExplicit');
  const requireRecursive = actions.includes('writeRecursive');
  const requireTarget = actions.includes('findSequenceTerm') && targetN > 0;

  const [tableValues, setTableValues] = useState(() => rows.map(() => ''));
  const [plottedPoints, setPlottedPoints] = useState([]);
  const [plotMessage, setPlotMessage] = useState('');
  const [kindAnswer, setKindAnswer] = useState('');
  const [changeAnswer, setChangeAnswer] = useState('');
  const [explicitRule, setExplicitRule] = useState('');
  const [recursiveFirst, setRecursiveFirst] = useState('');
  const [recursiveRule, setRecursiveRule] = useState('');
  const [termAnswer, setTermAnswer] = useState('');

  const handlePlot = (point) => {
    const rawN = Number(point?.[0]);
    const value = Number(point?.[1]);
    const n = Math.round(rawN);
    if (!Number.isFinite(rawN) || !Number.isFinite(value) || Math.abs(rawN - n) > 1e-7 || n < 1 || n > count) {
      setPlotMessage(`Sequence inputs are whole-number term positions from n = 1 through n = ${count}.`);
      return;
    }
    setPlotMessage('');
    setPlottedPoints((current) => {
      const withoutSameInput = current.filter((entry) => Number(entry[0]) !== n);
      return [...withoutSameInput, [n, value]].sort((left, right) => Number(left[0]) - Number(right[0]));
    });
  };

  const check = () => {
    const checks = [];
    if (requireTable) checks.push(tableValues.every((value, index) => matchesNumber(value, rows[index].value, 0.01)));
    if (requirePlot) checks.push(pointSetMatchesRows(plottedPoints, rows, Math.max(0.02, plotSnapStep / 3)));
    if (requireAnalyze) {
      checks.push(kindAnswer === spec.kind);
      checks.push(matchesNumber(changeAnswer, sequenceChange(spec), 0.001));
    }
    if (requireExplicit) checks.push(matchesExplicitRule(explicitRule, spec));
    if (requireRecursive) {
      checks.push(matchesNumber(recursiveFirst, spec.first, 0.001));
      checks.push(matchesRecursiveRule(recursiveRule, spec));
    }
    if (requireTarget) checks.push(matchesNumber(termAnswer, sequenceTerm(spec, targetN), 0.01));

    const safeChecks = checks.length ? checks : [false];
    submit(
      {
        isCorrect: safeChecks.every(Boolean),
        score: safeChecks.filter(Boolean).length / safeChecks.length,
      },
      {
        tableValues,
        plottedPoints,
        kindAnswer,
        changeAnswer,
        explicitRule,
        recursiveFirst,
        recursiveRule,
        termAnswer,
      },
      {
        mode: 'fullBridge',
        targetN: requireTarget ? targetN : null,
        representationCount: count,
      },
    );
  };

  const taskSteps = [
    requireTable && 'Build the table so the term number n is the input and aₙ is the output.',
    requirePlot && 'Plot the ordered pairs (n, aₙ) as separate discrete points.',
    requireAnalyze && 'Classify the pattern and identify its common difference or ratio.',
    (requireExplicit || requireRecursive) && 'Write the sequence rules, not just the constants in a template.',
    requireTarget && `Use your explicit rule to determine a₍${targetN}₎ without extending every intermediate term.`,
  ].filter(Boolean);

  return <ToolShell title="Build the Sequence Model" subtitle="Keep the table, discrete graph, pattern, and rules connected in one piece of work." badge="Integrated sequence model">
    <TaskCard
      question={questionData}
      task="Build the sequence as a discrete function, then use the same connected representations to complete the requested analysis."
      steps={taskSteps}
    />
    <ToolGrid min={360}>
      <Panel title="1. Build the table and discrete graph">
        <div style={{ overflowX: 'auto', marginBottom: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 360 }}>
            <thead>
              <tr>
                <th style={{ padding: 7, textAlign: 'left' }}>Domain input n</th>
                {rows.map((row) => <th key={row.n} style={{ padding: 7 }}>{row.n}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th style={{ padding: 7, textAlign: 'left' }}>Output aₙ</th>
                {rows.map((row, index) => (
                  <td key={row.n} style={{ padding: 5 }}>
                    <input
                      aria-label={`Sequence output a${row.n}`}
                      value={tableValues[index]}
                      onChange={(event) => setTableValues((current) => current.map((item, valueIndex) => (
                        valueIndex === index ? event.target.value : item
                      )))}
                      inputMode="decimal"
                      style={{ ...inputStyle, minWidth: 72, textAlign: 'center' }}
                      disabled={!requireTable}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ margin: '0 0 12px', color: '#5f6b7a', lineHeight: 1.45 }}>
          The term number <strong>n is the domain input</strong>. Each sequence value aₙ is the output paired with that input.
          A sequence graph is discrete, so plot only the individual ordered pairs — do not connect them.
        </p>
        <CoordinatePlane
          xMin={0}
          xMax={count + 1}
          yMin={bounds.yMin}
          yMax={bounds.yMax}
          points={plottedPoints.map(([x, y]) => ({ x, y, label: `(${numberText(x)}, ${numberText(y)})` }))}
          onPlot={requirePlot ? handlePlot : null}
          // A sequence point belongs to its term position, and handlePlot
          // already replaces whatever sits at the n a point lands on. So a drag
          // is just a re-plot at the new spot — no index bookkeeping needed.
          onMovePoint={requirePlot ? (index, point) => handlePlot(point) : null}
          viewResetKey={questionData?.id ?? questionData?.prompt ?? null}
          snapStep={plotSnapStep}
          cursorLabel="Sequence point"
          ariaLabel="Discrete sequence graph"
        />
        {requirePlot && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
            <button
              type="button"
              onClick={() => setPlottedPoints((current) => current.slice(0, -1))}
              disabled={!plottedPoints.length}
              style={{ ...actionStyle, marginTop: 0, background: '#fff', color: '#174ea6', border: '1px solid #aecbfa' }}
            >
              Undo last point
            </button>
            <button
              type="button"
              onClick={() => setPlottedPoints([])}
              disabled={!plottedPoints.length}
              style={{ ...actionStyle, marginTop: 0, background: '#fff', color: '#174ea6', border: '1px solid #aecbfa' }}
            >
              Clear graph
            </button>
            <span style={{ color: '#5f6b7a', fontSize: 13 }}>{plottedPoints.length}/{rows.length} term inputs plotted</span>
          </div>
        )}
        {plotMessage && <p style={{ margin: '8px 0 0', color: '#b06000', fontWeight: 700 }}>{plotMessage}</p>}
      </Panel>

      <Panel title="2. Analyze and write the rules">
        {requireAnalyze && <>
          <label>
            Sequence family
            <select value={kindAnswer} onChange={(event) => setKindAnswer(event.target.value)} style={inputStyle}>
              <option value="">Choose…</option>
              <option value="arithmetic">Arithmetic</option>
              <option value="geometric">Geometric</option>
            </select>
          </label>
          <label style={{ display: 'block', marginTop: 10 }}>
            Common {kindAnswer === 'arithmetic' ? 'difference' : kindAnswer === 'geometric' ? 'ratio' : 'change'}
            <input value={changeAnswer} onChange={(event) => setChangeAnswer(event.target.value)} inputMode="decimal" style={inputStyle} />
          </label>
        </>}

        {requireExplicit && (
          <label style={{ display: 'block', marginTop: 16 }}>
            Explicit rule
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <strong style={{ fontSize: 20 }}>aₙ =</strong>
              <input
                value={explicitRule}
                onChange={(event) => setExplicitRule(event.target.value)}
                placeholder={spec.kind === 'arithmetic' ? 'Write an expression in n' : 'Write an exponential expression in n'}
                style={inputStyle}
              />
            </div>
          </label>
        )}

        {requireRecursive && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Recursive rule</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center' }}>
                <strong style={{ fontSize: 18 }}>a₁ =</strong>
                <input value={recursiveFirst} onChange={(event) => setRecursiveFirst(event.target.value)} inputMode="decimal" style={inputStyle} />
              </label>
              <label style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center' }}>
                <strong style={{ fontSize: 18 }}>aₙ =</strong>
                <input
                  value={recursiveRule}
                  onChange={(event) => setRecursiveRule(event.target.value)}
                  placeholder="Use aₙ₋₁ in your rule"
                  style={inputStyle}
                />
              </label>
            </div>
          </div>
        )}

        {requireTarget && (
          <label style={{ display: 'block', marginTop: 16 }}>
            Use the rule to find a<sub>{targetN}</sub>
            <input value={termAnswer} onChange={(event) => setTermAnswer(event.target.value)} inputMode="decimal" style={inputStyle} />
          </label>
        )}

        <button type="button" onClick={check} style={actionStyle}>Check the complete sequence model</button>
        {feedback ? <div style={{ marginTop: 12 }}>
          <ResultPill ok={feedback.isCorrect}>
            {feedback.isCorrect
              ? 'Your table, discrete graph, pattern, formulas, and requested term all describe the same sequence.'
              : 'Keep every representation consistent: n is the table/graph input, the plotted points must match the table, and both rules must generate those same outputs.'}
          </ResultPill>
        </div> : null}
        <HintPanel
          hints={[
            'Start with the table: n = 1, 2, 3, … are the domain inputs. Generate the matching sequence outputs before you graph anything.',
            'Every point on the graph should be (term number, term value). Sequence graphs use separate points because n takes whole-number positions.',
            spec.kind === 'arithmetic'
              ? 'For an arithmetic sequence, an explicit rule can be written as aₙ = a₁ + (n − 1)d. The recursive rule starts at a₁ and adds d to the previous term.'
              : 'For a geometric sequence, an explicit rule can be written as aₙ = a₁(r)ⁿ⁻¹. The recursive rule starts at a₁ and multiplies the previous term by r.',
          ]}
          onHintUsed={() => onAction?.("HINT_USED")}
        />
      </Panel>
    </ToolGrid>
  </ToolShell>;
}

function RuleBridge({ questionData, feedback, submit, onAction }) {
  const spec = sequenceFromQuestion(questionData);
  const [explicitRule, setExplicitRule] = useState('');
  const [recursiveFirst, setRecursiveFirst] = useState('');
  const [recursiveRule, setRecursiveRule] = useState('');
  const check = () => {
    const checks = [
      matchesExplicitRule(explicitRule, spec),
      matchesNumber(recursiveFirst, spec.first, 0.001),
      matchesRecursiveRule(recursiveRule, spec),
    ];
    submit(
      { isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / checks.length },
      { explicitRule, recursiveFirst, recursiveRule },
      { mode: 'ruleBridge', kind: spec.kind },
    );
  };
  return <ToolShell title="Write the Sequence Rules" subtitle="Write complete explicit and recursive equations for the same sequence." badge="Recursive and explicit">
    <TaskCard
      question={questionData}
      task="Write the same sequence both explicitly and recursively."
      steps={[
        'The explicit equation must give aₙ directly from n.',
        'The recursive definition needs the starting value a₁ and a rule using aₙ₋₁.',
        'Both equations must generate the sequence shown.',
      ]}
    />
    <ToolGrid min={330}>
      <SequenceVisual spec={spec} count={6} title="Evidence from the sequence" />
      <Panel title="Write both equations">
        <label>
          Explicit rule
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <strong style={{ fontSize: 20 }}>aₙ =</strong>
            <input value={explicitRule} onChange={(event) => setExplicitRule(event.target.value)} placeholder="Write the full expression in n" style={inputStyle} />
          </div>
        </label>
        <div style={{ marginTop: 18, fontWeight: 800 }}>Recursive rule</div>
        <label style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center', marginTop: 6 }}>
          <strong style={{ fontSize: 18 }}>a₁ =</strong>
          <input value={recursiveFirst} onChange={(event) => setRecursiveFirst(event.target.value)} inputMode="decimal" style={inputStyle} />
        </label>
        <label style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <strong style={{ fontSize: 18 }}>aₙ =</strong>
          <input value={recursiveRule} onChange={(event) => setRecursiveRule(event.target.value)} placeholder="Use aₙ₋₁ in your rule" style={inputStyle} />
        </label>
        <button type="button" onClick={check} style={actionStyle}>Check both equations</button>
        {feedback ? <div style={{ marginTop: 12 }}>
          <ResultPill ok={feedback.isCorrect}>
            {feedback.isCorrect
              ? 'Both equations generate the same sequence.'
              : 'Check the starting value, the previous-term rule, and the explicit expression in n.'}
          </ResultPill>
        </div> : null}
        <HintPanel
          hints={[
            'An explicit rule is a shortcut to any term. A recursive rule builds one term from the previous term.',
            spec.kind === 'arithmetic'
              ? 'Arithmetic: use aₙ = a₁ + (n − 1)d and aₙ = aₙ₋₁ + d.'
              : 'Geometric: use aₙ = a₁(r)ⁿ⁻¹ and aₙ = r·aₙ₋₁.',
            'You are writing the actual equations now — not just filling in A, D, or R.',
          ]}
          onHintUsed={() => onAction?.("HINT_USED")}
        />
      </Panel>
    </ToolGrid>
  </ToolShell>;
}

function MissingTerm({ questionData, feedback, submit, onAction }) {
  const spec = sequenceFromQuestion(questionData);
  const missingIndex = Number(questionData.missingIndex ?? 4);
  const count = Math.max(6, Number(questionData.displayCount ?? 7), missingIndex + 1);
  const rows = generateSequence(spec, count);
  const expected = sequenceTerm(spec, missingIndex);
  const [termAnswer, setTermAnswer] = useState('');
  const [kindAnswer, setKindAnswer] = useState('');
  const check = () => {
    const checks = [matchesNumber(termAnswer, expected, 0.01), kindAnswer === spec.kind];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 2 }, { termAnswer, kindAnswer }, { mode: 'missingTerm', missingIndex });
  };
  return <ToolShell title="Find the Missing Term" subtitle="Recover a missing term from the sequence pattern." badge="Sequence pattern">
    <TaskCard question={questionData} task={'Recover the missing term and say what kind of sequence this is.'} steps={['Look at the terms either side of the gap.', 'Work out the constant difference or ratio from terms you can see.', 'Apply it to fill the gap.']} />
    <ToolGrid min={320}>
      <Panel title="Sequence with a gap">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{rows.map((row) => <div key={row.n} style={{ minWidth: 66, padding: '10px 12px', textAlign: 'center', borderRadius: 10, border: '1px solid #d9e2f1', background: row.n === missingIndex ? '#fff7e6' : '#fff' }}><div style={{ fontSize: 11, color: '#667085' }}>a{row.n}</div><strong>{row.n === missingIndex ? '?' : numberText(row.value)}</strong></div>)}</div>
        <p style={{ color: '#5f6b7a' }}>Use the terms on both sides of the gap. A valid common change must work across the entire sequence.</p>
      </Panel>
      <Panel title="Recover the structure">
        <label>Missing value a<sub>{missingIndex}</sub><input value={termAnswer} onChange={(event) => setTermAnswer(event.target.value)} style={inputStyle} /></label>
        <label style={{ display: 'block', marginTop: 10 }}>Sequence family<select value={kindAnswer} onChange={(event) => setKindAnswer(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="arithmetic">Arithmetic</option><option value="geometric">Geometric</option></select></label>
        <button type="button" onClick={check} style={actionStyle}>Check missing term</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'The missing term preserves the sequence structure.' : 'Check the common difference or ratio on both sides of the blank.'}</ResultPill></div> : null}
      <HintPanel hints={['The structure of a sequence does not change partway through, so terms you can see tell you about the ones you cannot.', 'Use two consecutive known terms to find the difference or the ratio.', 'Then step forward from the term before the gap using that same difference or ratio.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid>
  </ToolShell>;
}

function PartialSum({ questionData, feedback, submit, onAction }) {
  const spec = sequenceFromQuestion(questionData);
  const sumN = Number(questionData.sumN ?? 6);
  const expectedLast = sequenceTerm(spec, sumN);
  const expectedSum = sequencePartialSum(spec, sumN);
  const [lastTerm, setLastTerm] = useState('');
  const [sumAnswer, setSumAnswer] = useState('');
  const check = () => {
    const checks = [matchesNumber(lastTerm, expectedLast, 0.01), matchesNumber(sumAnswer, expectedSum, 0.01)];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 2 }, { lastTerm, sumAnswer }, { mode: 'partialSum', sumN });
  };
  return <ToolShell title="Find the Finite Sum" subtitle="Connect a sequence of terms to the finite series formed by adding them." badge="Finite series">
    <TaskCard question={questionData} task={'Find the last term of this finite sequence and the sum of all its terms.'} steps={['Extend the sequence to the requested number of terms.', 'Identify the last term.', 'Add all the terms, or use the appropriate sum formula.']} />
    <ToolGrid min={320}>
      <SequenceVisual spec={spec} count={sequenceEvidenceCount(7, sumN, { revealTarget: questionData.revealTargetTerm === true, cap: 7 })} title="Sequence evidence" />
      <Panel title={`Find S${sumN}`}>
        <p><strong>S<sub>{sumN}</sub> = a₁ + a₂ + ··· + a<sub>{sumN}</sub></strong></p>
        <label>Last included term a<sub>{sumN}</sub><input value={lastTerm} onChange={(event) => setLastTerm(event.target.value)} style={inputStyle} /></label>
        <label style={{ display: 'block', marginTop: 10 }}>Partial sum S<sub>{sumN}</sub><input value={sumAnswer} onChange={(event) => setSumAnswer(event.target.value)} style={inputStyle} /></label>
        <button type="button" onClick={check} style={actionStyle}>Check finite sum</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'The last term and finite sum are consistent.' : 'Find the correct final term first, then include every term from a₁ through it.'}</ResultPill></div> : null}
      <HintPanel hints={['A series is what you get when you add the terms of a sequence together.', 'Find the last term first — you need it before you can use most sum formulas.', 'For an arithmetic series the sum is the number of terms times the average of the first and last term.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid>
  </ToolShell>;
}

function CompareSequences({ questionData, feedback, submit, onAction }) {
  const left = normalizeSequenceSpec(questionData.left || { kind: 'arithmetic', first: 3, difference: 4 }, questionData.left?.kind || 'arithmetic');
  const right = normalizeSequenceSpec(questionData.right || { kind: 'geometric', first: 1, ratio: 2 }, questionData.right?.kind || 'geometric');
  const actions = Array.isArray(questionData.studentActions) ? questionData.studentActions : [];
  const requirePlot = actions.includes('plotSequence');
  const compareN = Number(questionData.compareN ?? 7);
  const result = compareSequencesAt(left, right, compareN);
  const leftLabel = questionData.leftLabel || 'Sequence A';
  const rightLabel = questionData.rightLabel || 'Sequence B';
  const evidenceCount = sequenceEvidenceCount(questionData.displayCount ?? 7, compareN, { revealTarget: questionData.revealCompareTerm === true, cap: 7 });
  const authoredDisplayCount = Number(questionData.displayCount);
  const preferredPlotCount = Number.isInteger(authoredDisplayCount) && authoredDisplayCount > 0
    ? authoredDisplayCount
    : Math.min(compareN, 7);
  const plotCount = requirePlot
    ? Math.max(1, Math.min(8, Math.max(preferredPlotCount, Math.min(compareN, 7))))
    : evidenceCount;
  const leftRows = generateSequence(left, plotCount);
  const rightRows = generateSequence(right, plotCount);
  const bounds = graphBounds([...leftRows, ...rightRows].map((row) => row.value));
  const plotSnapStep = inferPlotSnapStep([...leftRows, ...rightRows], questionData.plotSnapStep);
  const [activeSeries, setActiveSeries] = useState('A');
  const [leftPlottedPoints, setLeftPlottedPoints] = useState([]);
  const [rightPlottedPoints, setRightPlottedPoints] = useState([]);
  const [plotMessage, setPlotMessage] = useState('');
  const [relation, setRelation] = useState('');
  const [difference, setDifference] = useState('');
  const expectedRelation = result.relation === 'left' ? 'A' : result.relation === 'right' ? 'B' : 'equal';

  const handlePlot = (point) => {
    const rawN = Number(point?.[0]);
    const value = Number(point?.[1]);
    const n = Math.round(rawN);
    if (!Number.isFinite(rawN) || !Number.isFinite(value) || Math.abs(rawN - n) > 1e-7 || n < 1 || n > plotCount) {
      setPlotMessage('Sequence inputs are whole-number term positions from n = 1 through n = ' + plotCount + '.');
      return;
    }
    setPlotMessage('');
    const setPoints = activeSeries === 'A' ? setLeftPlottedPoints : setRightPlottedPoints;
    setPoints((current) => {
      const withoutSameInput = current.filter((entry) => Number(entry[0]) !== n);
      return [...withoutSameInput, [n, value]].sort((a, b) => Number(a[0]) - Number(b[0]));
    });
  };

  const check = () => {
    const checks = [];
    if (requirePlot) {
      const tolerance = Math.max(0.02, plotSnapStep / 3);
      checks.push(pointSetMatchesRows(leftPlottedPoints, leftRows, tolerance));
      checks.push(pointSetMatchesRows(rightPlottedPoints, rightRows, tolerance));
    }
    checks.push(relation === expectedRelation);
    checks.push(matchesNumber(difference, result.difference, 0.01));
    submit(
      { isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / checks.length },
      { relation, difference, leftPlottedPoints, rightPlottedPoints },
      { mode: 'compare', compareN, plotRequired: requirePlot, plotCount: requirePlot ? plotCount : 0 },
    );
  };

  const taskSteps = requirePlot
    ? [
        'Select Sequence A and plot its ordered pairs as discrete points.',
        'Select Sequence B and plot its ordered pairs on the same coordinate plane.',
        'Use the graphs and rules to compare both sequences at the requested term.',
        'Choose the larger term and give the absolute difference.',
      ]
    : [
        'Work out the requested term of each sequence separately.',
        'Compare the two values.',
        'Choose the relationship and give the difference.',
      ];

  const visiblePoints = requirePlot
    ? [
        ...leftPlottedPoints.map(([x, y]) => ({ x, y, fill: '#1a73e8', radius: 8 })),
        ...rightPlottedPoints.map(([x, y]) => ({ x, y, fill: '#d93025', radius: 5 })),
      ]
    : [
        ...leftRows.map((row) => ({ x: row.n, y: row.value, fill: '#1a73e8', radius: 8 })),
        ...rightRows.map((row) => ({ x: row.n, y: row.value, fill: '#d93025', radius: 5 })),
      ];
  return <ToolShell title="Compare the Sequences" subtitle="Compare additive and multiplicative growth at the same term number." badge="Growth comparison">
    <TaskCard
      question={questionData}
      task={requirePlot ? 'Plot both sequences as discrete functions, then compare them at the requested term number.' : 'Compare the two sequences at the given term number.'}
      steps={taskSteps}
    />
    <ToolGrid min={330}>
      <Panel title={requirePlot ? 'Plot the two sequences' : 'Two discrete models'}>
        {requirePlot && (
          <>
            <p style={{ marginTop: 0, color: '#5f6b7a' }}>
              Choose a sequence, then click each ordered pair on the graph. Switching sequences changes which model receives the next point.
            </p>
            <div role="group" aria-label="Sequence to plot" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <button
                type="button"
                aria-pressed={activeSeries === 'A'}
                onClick={() => setActiveSeries('A')}
                style={{
                  ...actionStyle,
                  marginTop: 0,
                  background: activeSeries === 'A' ? '#1a73e8' : '#fff',
                  color: activeSeries === 'A' ? '#fff' : '#174ea6',
                  border: '2px solid #1a73e8',
                }}
              >
                ● Plot {leftLabel}
              </button>
              <button
                type="button"
                aria-pressed={activeSeries === 'B'}
                onClick={() => setActiveSeries('B')}
                style={{
                  ...actionStyle,
                  marginTop: 0,
                  background: activeSeries === 'B' ? '#d93025' : '#fff',
                  color: activeSeries === 'B' ? '#fff' : '#b3261e',
                  border: '2px solid #d93025',
                }}
              >
                ● Plot {rightLabel}
              </button>
            </div>
          </>
        )}
        <CoordinatePlane
          xMin={0}
          xMax={plotCount + 1}
          yMin={bounds.yMin}
          yMax={bounds.yMax}
          points={visiblePoints}
          onPlot={requirePlot ? handlePlot : null}
          // A sequence point belongs to its term position, and handlePlot
          // already replaces whatever sits at the n a point lands on. So a drag
          // is just a re-plot at the new spot — no index bookkeeping needed.
          onMovePoint={requirePlot ? (index, point) => handlePlot(point) : null}
          viewResetKey={questionData?.id ?? questionData?.prompt ?? null}
          snapStep={plotSnapStep}
          cursorLabel={activeSeries === 'A' ? leftLabel + ' point' : rightLabel + ' point'}
          ariaLabel={requirePlot ? 'Interactive graph for plotting two discrete sequences' : 'Graph comparing two discrete sequences'}
        />
        <p><span style={{ color: '#1a73e8', fontWeight: 900 }}>● {leftLabel}</span> &nbsp; <span style={{ color: '#d93025', fontWeight: 900 }}>● {rightLabel}</span></p>
        {requirePlot ? (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setLeftPlottedPoints([])}
                disabled={!leftPlottedPoints.length}
                style={{ ...actionStyle, marginTop: 0, background: '#fff', color: '#174ea6', border: '1px solid #aecbfa' }}
              >
                Clear {leftLabel}
              </button>
              <button
                type="button"
                onClick={() => setRightPlottedPoints([])}
                disabled={!rightPlottedPoints.length}
                style={{ ...actionStyle, marginTop: 0, background: '#fff', color: '#b3261e', border: '1px solid #f2b8b5' }}
              >
                Clear {rightLabel}
              </button>
              <button
                type="button"
                onClick={() => { setLeftPlottedPoints([]); setRightPlottedPoints([]); }}
                disabled={!leftPlottedPoints.length && !rightPlottedPoints.length}
                style={{ ...actionStyle, marginTop: 0, background: '#fff', color: '#5f6b7a', border: '1px solid #cfd8e6' }}
              >
                Clear both
              </button>
              <span style={{ color: '#5f6b7a', fontSize: 13 }}>
                {leftLabel}: {leftPlottedPoints.length}/{leftRows.length} · {rightLabel}: {rightPlottedPoints.length}/{rightRows.length}
              </span>
            </div>
            {plotMessage && <p style={{ margin: '8px 0 0', color: '#b06000', fontWeight: 700 }}>{plotMessage}</p>}
            <p style={{ color: '#5f6b7a', marginBottom: 0 }}>
              Term number n is the domain input. Plot separate points only; a sequence graph is discrete.
            </p>
          </>
        ) : (
          <p style={{ color: '#5f6b7a' }}>Do not decide from the first few terms alone; compare both rules at the requested index.</p>
        )}
      </Panel>
      <Panel title={`Compare at n = ${compareN}`}>
        <label>Larger term<select value={relation} onChange={(event) => setRelation(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="A">{leftLabel}</option><option value="B">{rightLabel}</option><option value="equal">They are equal</option></select></label>
        <label style={{ display: 'block', marginTop: 10 }}>Absolute difference between the terms<input value={difference} onChange={(event) => setDifference(event.target.value)} style={inputStyle} /></label>
        <button type="button" onClick={check} style={actionStyle}>Check comparison</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? (requirePlot ? 'Both discrete graphs and the comparison agree.' : 'The comparison uses the same term number for both sequences.') : (requirePlot ? 'Check every plotted point for both sequences, then compare the two requested terms.' : 'Evaluate both rules at n = ' + compareN + ', then compare their outputs.')}</ResultPill></div> : null}
      <HintPanel hints={['Do not judge by the early terms — additive and multiplicative growth trade places.', 'Compute the requested term of each sequence independently before comparing anything.', 'Geometric growth starts slower but overtakes arithmetic growth eventually, and then pulls away fast.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid>
  </ToolShell>;
}

import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, ToolGrid, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { nearlyEqual, round } from '../shared/toolMath';
import useToolSubmission from '../shared/useToolSubmission';
import {
  composeForwardAfterInverse,
  composeInverseAfterForward,
  equivalentExpLogValues,
  inverseLogValue,
  inversePairFeatures,
  inversePoint,
  normalizeExponentialSpec,
  solveExponentialLinearExponent,
  solveLogLinearArgument,
  transformedExponentialValue,
} from './exponentialLogMath';

const inputStyle = { width: '100%', padding: 9, border: '1px solid #cfd8e6', borderRadius: 8, boxSizing: 'border-box' };
const actionStyle = { marginTop: 14, padding: '10px 16px', border: 0, borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 800, cursor: 'pointer' };
const matchesNumber = (answer, expected, tolerance = 0.01) => `${answer}`.trim() !== '' && nearlyEqual(answer, expected, tolerance);
const displayNumber = (value) => Number.isFinite(Number(value)) ? round(value, 4) : 'undefined';

const expSpecFromQuestion = (questionData = {}) => normalizeExponentialSpec(questionData.function || questionData.exponential || {
  a: questionData.a ?? 1,
  base: questionData.base ?? 2,
  h: questionData.h ?? 0,
  k: questionData.k ?? 0,
});

function InversePairGraph({ spec, sampleX = 1 }) {
  const pointPair = inversePoint(spec, sampleX);
  const expFn = useMemo(() => (x) => transformedExponentialValue(spec, x), [spec.a, spec.base, spec.h, spec.k]);
  const logFn = useMemo(() => (x) => inverseLogValue(spec, x), [spec.a, spec.base, spec.h, spec.k]);
  const pointCoordinates = [...pointPair.exponential, ...pointPair.logarithm].filter(Number.isFinite);
  const boundMin = Math.max(-100, Math.floor(Math.min(-6, spec.k - 3, ...pointCoordinates) - 2));
  const boundMax = Math.min(100, Math.ceil(Math.max(10, spec.k + 6, ...pointCoordinates) + 2));
  return <Panel title="Inverse graphs + reflected point">
    <CoordinatePlane
      xMin={boundMin}
      xMax={boundMax}
      yMin={boundMin}
      yMax={boundMax}
      functions={[expFn, logFn]}
      lines={[{ m: 1, b: 0, stroke: '#667085' }]}
      verticalLines={[spec.k]}
      horizontalLines={[spec.k]}
      points={[
        { 0: pointPair.exponential[0], 1: pointPair.exponential[1], label: 'on f', fill: '#1a73e8' },
        { 0: pointPair.logarithm[0], 1: pointPair.logarithm[1], label: 'on f⁻¹', fill: '#d93025' },
      ]}
    />
    <p style={{ color: '#5f6b7a', marginBottom: 0 }}>Blue f and red f⁻¹ reflect across y = x. The horizontal asymptote y = k becomes the inverse’s vertical asymptote x = k.</p>
  </Panel>;
}

export default function ExponentialLogBridge({ questionData = {}, onAction }) {
  const mode = questionData.mode || 'equivalentForms';
  const { feedback, submit } = useToolSubmission(onAction);
  if (mode === 'solveExponential') return <SolveExponential questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'solveLogarithmic') return <SolveLogarithmic questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'inverse') return <InverseMode questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'composition') return <CompositionMode questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  return <EquivalentForms questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
}

function EquivalentForms({ questionData, feedback, submit, onAction }) {
  const values = equivalentExpLogValues({ base: Number(questionData.base ?? 2), exponent: Number(questionData.exponent ?? 3) });
  const [logAnswer, setLogAnswer] = useState('');
  const [expAnswer, setExpAnswer] = useState('');
  const check = () => {
    const checks = [matchesNumber(logAnswer, values.exponent), matchesNumber(expAnswer, values.value)];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 2 }, { logAnswer, expAnswer }, { mode: 'equivalentForms' });
  };
  const simpleSpec = normalizeExponentialSpec({ base: values.base, a: 1, h: 0, k: 0 });
  return <ToolShell title="Exponential ↔ Log Bridge" subtitle="Translate the same relationship between exponential and logarithmic notation." badge="Algebra II · Equivalent Forms">
    <TaskCard question={questionData} task={'Rewrite the same relationship in both exponential and logarithmic form.'} steps={['Identify the base, the exponent and the result.', 'Exponential form says base^exponent = result.', 'Logarithmic form asks: what exponent on this base gives the result?']} />
    <ToolGrid min={340}>
      <InversePairGraph spec={simpleSpec} sampleX={values.exponent} />
      <Panel title="One relationship, two statements">
        <p style={{ fontSize: 21, fontWeight: 900 }}>{values.base}<sup>{values.exponent}</sup> = {displayNumber(values.value)}</p>
        <p style={{ color: '#5f6b7a' }}>A logarithm answers the inverse question: “what exponent on this base produces the value?”</p>
        <label>log<sub>{values.base}</sub>({displayNumber(values.value)}) =<input value={logAnswer} onChange={(event) => setLogAnswer(event.target.value)} style={inputStyle} /></label>
        <label style={{ display: 'block', marginTop: 10 }}>{values.base}<sup>{values.exponent}</sup> =<input value={expAnswer} onChange={(event) => setExpAnswer(event.target.value)} style={inputStyle} /></label>
        <button type="button" onClick={check} style={actionStyle}>Check inverse forms</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Both notations describe the same base–exponent–value relationship.' : 'Keep the base fixed: exponential output becomes logarithm input, and the exponent becomes logarithm output.'}</ResultPill></div> : null}
      <HintPanel hints={['An exponential statement and a logarithmic statement can say exactly the same thing in two notations.', 'b^e = r and log_b(r) = e carry identical information — the base stays the base in both.', 'A logarithm is the answer to a question about an exponent, so the log always equals the exponent.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid>
  </ToolShell>;
}

function SolveExponential({ questionData, feedback, submit, onAction }) {
  const equation = {
    base: Number(questionData.equation?.base ?? questionData.base ?? 2),
    m: Number(questionData.equation?.m ?? 2),
    c: Number(questionData.equation?.c ?? -1),
    rhs: Number(questionData.equation?.rhs ?? 16),
  };
  const solution = solveExponentialLinearExponent(equation);
  const [xAnswer, setXAnswer] = useState('');
  const [exponentAnswer, setExponentAnswer] = useState('');
  const check = () => {
    const checks = [matchesNumber(xAnswer, solution.x, 0.01), matchesNumber(exponentAnswer, solution.exponentValue, 0.01)];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 2 }, { xAnswer, exponentAnswer }, { mode: 'solveExponential' });
  };
  const exponentText = `${equation.m}x ${equation.c >= 0 ? '+' : '−'} ${Math.abs(equation.c)}`;
  return <ToolShell title="Exponential ↔ Log Bridge" subtitle="Use logarithms to expose an exponent containing the unknown." badge="Algebra II · Solve Exponential">
    <TaskCard question={questionData} task={'Solve the exponential equation for x.'} steps={['Get the power by itself on one side.', 'Take a logarithm of both sides to bring the exponent down.', 'Solve the resulting equation for x.']} />
    <ToolGrid min={330}>
      <Panel title="Equation bridge">
        <p style={{ fontSize: 22, fontWeight: 900 }}>{equation.base}<sup>{exponentText}</sup> = {equation.rhs}</p>
        <p style={{ fontSize: 18 }}>log<sub>{equation.base}</sub>({equation.rhs}) = {exponentText}</p>
        <p style={{ color: '#5f6b7a' }}>The logarithm converts the exponential statement into an equation for the exponent.</p>
      </Panel>
      <Panel title="Solve and verify">
        <label>Exponent value log<sub>{equation.base}</sub>({equation.rhs})<input value={exponentAnswer} onChange={(event) => setExponentAnswer(event.target.value)} style={inputStyle} /></label>
        <label style={{ display: 'block', marginTop: 10 }}>x<input value={xAnswer} onChange={(event) => setXAnswer(event.target.value)} style={inputStyle} /></label>
        <button type="button" onClick={check} style={actionStyle}>Check exponential solution</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'The logarithmic bridge isolates the exponent correctly.' : 'Find the exponent that produces the right side first, then solve the resulting linear equation.'}</ResultPill></div> : null}
      <HintPanel hints={['The unknown is stuck in the exponent, and a logarithm is the tool that brings it down.', 'Isolate the power first — anything multiplied by or added to it has to move across before you take logs.', 'log(b^x) = x·log(b), which turns the exponent into an ordinary coefficient you can divide by.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid>
  </ToolShell>;
}

function SolveLogarithmic({ questionData, feedback, submit, onAction }) {
  const equation = {
    base: Number(questionData.equation?.base ?? questionData.base ?? 3),
    m: Number(questionData.equation?.m ?? 2),
    c: Number(questionData.equation?.c ?? 1),
    result: Number(questionData.equation?.result ?? 2),
  };
  const solution = solveLogLinearArgument(equation);
  const [argumentAnswer, setArgumentAnswer] = useState('');
  const [xAnswer, setXAnswer] = useState('');
  const check = () => {
    const checks = [matchesNumber(argumentAnswer, solution.argumentValue, 0.01), matchesNumber(xAnswer, solution.x, 0.01)];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 2 }, { argumentAnswer, xAnswer }, { mode: 'solveLogarithmic' });
  };
  const argumentText = `${equation.m}x ${equation.c >= 0 ? '+' : '−'} ${Math.abs(equation.c)}`;
  return <ToolShell title="Exponential ↔ Log Bridge" subtitle="Rewrite a logarithmic equation exponentially, then enforce the logarithm’s positive-input domain." badge="Algebra II · Solve Logarithmic">
    <TaskCard question={questionData} task={'Solve the logarithmic equation for x, and respect the domain.'} steps={['Get a single logarithm by itself.', 'Rewrite the statement in exponential form.', 'Check that the argument of the log is actually positive.']} />
    <ToolGrid min={330}>
      <Panel title="Equation bridge">
        <p style={{ fontSize: 21, fontWeight: 900 }}>log<sub>{equation.base}</sub>({argumentText}) = {equation.result}</p>
        <p style={{ fontSize: 18 }}>{equation.base}<sup>{equation.result}</sup> = {argumentText}</p>
        <p style={{ color: '#5f6b7a' }}>The logarithm’s argument must stay positive. The exponential rewrite makes that required value explicit.</p>
      </Panel>
      <Panel title="Solve and check the domain">
        <label>Required argument value {equation.base}<sup>{equation.result}</sup><input value={argumentAnswer} onChange={(event) => setArgumentAnswer(event.target.value)} style={inputStyle} /></label>
        <label style={{ display: 'block', marginTop: 10 }}>x<input value={xAnswer} onChange={(event) => setXAnswer(event.target.value)} style={inputStyle} /></label>
        <button type="button" onClick={check} style={actionStyle}>Check logarithmic solution</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'The exponential rewrite gives a valid positive logarithm input.' : 'Rewrite exponentially, solve the linear equation, then confirm the original log argument is positive.'}</ResultPill></div> : null}
      <HintPanel hints={['Rewriting a log equation exponentially removes the log entirely.', 'log_b(A) = c becomes A = b^c. Then solve for x inside A.', 'You must check your answer: a log is undefined for arguments that are zero or negative, so a value that makes the inside non-positive has to be rejected.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid>
  </ToolShell>;
}

function InverseMode({ questionData, feedback, submit, onAction }) {
  const spec = expSpecFromQuestion(questionData);
  const sampleX = Number(questionData.x ?? 2);
  const pair = inversePoint(spec, sampleX);
  const features = inversePairFeatures(spec);
  const [inverseAnswer, setInverseAnswer] = useState('');
  const [asymptote, setAsymptote] = useState('');
  const [domainSide, setDomainSide] = useState('');
  const check = () => {
    const checks = [matchesNumber(inverseAnswer, sampleX, 0.01), matchesNumber(asymptote, features.logarithmVerticalAsymptote, 0.01), domainSide === features.logarithmDomainSide];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / checks.length }, { inverseAnswer, asymptote, domainSide }, { mode: 'inverse', sampleX });
  };
  return <ToolShell title="Exponential ↔ Log Bridge" subtitle="Reflect a transformed exponential into its logarithmic inverse, including domain/range and asymptotes." badge="Algebra II · Inverse Functions">
    <TaskCard question={questionData} task={'Give the features of the inverse of this exponential function.'} steps={['Swap the roles of input and output.', 'The horizontal asymptote becomes a vertical one.', 'Domain and range swap places too.']} />
    <ToolGrid min={340}>
      <InversePairGraph spec={spec} sampleX={sampleX} />
      <Panel title="Read the inverse structure">
        <p><strong>f({sampleX}) = {displayNumber(pair.exponential[1])}</strong>, so f⁻¹({displayNumber(pair.exponential[1])}) should return the original input.</p>
        <label>f⁻¹({displayNumber(pair.exponential[1])})<input value={inverseAnswer} onChange={(event) => setInverseAnswer(event.target.value)} style={inputStyle} /></label>
        <label style={{ display: 'block', marginTop: 10 }}>Inverse vertical asymptote x =<input value={asymptote} onChange={(event) => setAsymptote(event.target.value)} style={inputStyle} /></label>
        <label style={{ display: 'block', marginTop: 10 }}>Inverse domain relative to x = {features.logarithmDomainBoundary}<select value={domainSide} onChange={(event) => setDomainSide(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="greater">x &gt; {features.logarithmDomainBoundary}</option><option value="less">x &lt; {features.logarithmDomainBoundary}</option></select></label>
        <button type="button" onClick={check} style={actionStyle}>Check inverse features</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Point reflection, asymptote swap, and inverse domain all agree.' : 'Swap x/y roles: the exponential range becomes the logarithm domain, and y = k becomes x = k.'}</ResultPill></div> : null}
      <HintPanel hints={['Taking an inverse reflects the graph across the line y = x, and reflection swaps horizontal for vertical.', 'An exponential has a horizontal asymptote; its logarithmic inverse has a vertical asymptote in the mirrored position.', 'The domain of the inverse is the range of the original, and its range is the original’s domain.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid>
  </ToolShell>;
}

function CompositionMode({ questionData, feedback, submit, onAction }) {
  const spec = expSpecFromQuestion(questionData);
  const x = Number(questionData.x ?? 1);
  const forwardAtX = transformedExponentialValue(spec, x);
  const defaultY = transformedExponentialValue(spec, Number(questionData.inverseSeedX ?? x + 1));
  const y = Number(questionData.y ?? defaultY);
  const expectedX = composeInverseAfterForward(spec, x);
  const expectedY = composeForwardAfterInverse(spec, y);
  const [inverseAfterForward, setInverseAfterForward] = useState('');
  const [forwardAfterInverse, setForwardAfterInverse] = useState('');
  const check = () => {
    const checks = [matchesNumber(inverseAfterForward, expectedX, 0.01), matchesNumber(forwardAfterInverse, expectedY, 0.01)];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 2 }, { inverseAfterForward, forwardAfterInverse }, { mode: 'composition', x, y });
  };
  return <ToolShell title="Exponential ↔ Log Bridge" subtitle="Use composition to verify that the exponential and logarithmic functions undo one another." badge="Algebra II · Inverse Composition">
    <TaskCard question={questionData} task={'Compose the function with its inverse both ways and give both results.'} steps={['Apply the function first, then its inverse.', 'Then do it in the other order.', 'Enter both results.']} />
    <ToolGrid min={340}>
      <InversePairGraph spec={spec} sampleX={x} />
      <Panel title="Test both compositions">
        <p><strong>f({x}) = {displayNumber(forwardAtX)}</strong></p>
        <label>f⁻¹(f({x})) =<input value={inverseAfterForward} onChange={(event) => setInverseAfterForward(event.target.value)} style={inputStyle} /></label>
        <p style={{ marginTop: 16 }}><strong>Use inverse-domain input y = {displayNumber(y)}</strong></p>
        <label>f(f⁻¹({displayNumber(y)})) =<input value={forwardAfterInverse} onChange={(event) => setForwardAfterInverse(event.target.value)} style={inputStyle} /></label>
        <button type="button" onClick={check} style={actionStyle}>Check compositions</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Both compositions return the starting input, confirming the inverse relationship.' : 'True inverses undo each other: f⁻¹(f(x)) = x and f(f⁻¹(y)) = y on the valid domains.'}</ResultPill></div> : null}
      <HintPanel hints={['A function and its inverse undo each other, so composing them should return the value you started with.', 'f⁻¹(f(x)) = x, and f(f⁻¹(y)) = y — as long as you stay inside each function’s domain.', 'If a composition does not return the starting value, check the domain: the inverse may not be defined there.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid>
  </ToolShell>;
}

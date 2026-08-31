import React, { useState } from 'react';
import ToolShell, { Panel, ToolGrid, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { nearlyEqual, round } from '../shared/toolMath';
import useToolSubmission from '../shared/useToolSubmission';
import { useRevealAnswers } from '../shared/ToolRuntimeContext';
import {
  complexAdd,
  complexArgumentDegrees,
  complexConjugateValue,
  complexDivide,
  complexMagnitudeValue,
  complexMultiplyValues,
  complexPower,
  complexSubtract,
  formatComplex,
  normalizedQuarterTurns,
  quadraticRootsComplex,
  quarterTurnLabel,
  rotateByPowerOfI,
  sameComplexSet,
  toComplex,
} from './complexMath';

const inputStyle = { width: '100%', padding: 9, border: '1px solid #cfd8e6', borderRadius: 8, boxSizing: 'border-box' };
const actionStyle = { marginTop: 14, padding: '10px 16px', border: 0, borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 800, cursor: 'pointer' };
const matchesNumber = (answer, expected, tolerance = 0.01) => `${answer}`.trim() !== '' && nearlyEqual(answer, expected, tolerance);
const hintProps = (onAction, hints) => ({ hints, onHintUsed: () => onAction?.('HINT_USED') });

// Several modes plotted the expected result on the plane and printed its value
// in the legend, directly above the boxes asking for that value. Items flagged
// `isAnswer` are withheld unless the surface is allowed to reveal answers.
function ComplexVisual({ values = [], title = 'Complex plane' }) {
  const revealAnswers = useRevealAnswers();
  const visible = values.filter((item) => revealAnswers || !item.isAnswer);
  const items = visible.map((item, index) => ({
    value: toComplex(item.value),
    label: item.label || `z${index + 1}`,
    color: item.color || ['#1a73e8', '#d93025', '#137333', '#8a3ffc'][index % 4],
  }));
  const largest = Math.max(5, ...items.flatMap((item) => [Math.abs(item.value.re), Math.abs(item.value.im)]));
  const bound = Math.min(20, Math.ceil(largest + 2));
  return <Panel title={title}>
    <CoordinatePlane
      xMin={-bound}
      xMax={bound}
      yMin={-bound}
      yMax={bound}
      points={items.map((item) => ({ x: item.value.re, y: item.value.im, label: item.label, fill: item.color }))}
    >
      {({ sx, sy }) => <>{items.map((item) => <line key={item.label} x1={sx(0)} y1={sy(0)} x2={sx(item.value.re)} y2={sy(item.value.im)} stroke={item.color} strokeWidth="2" opacity="0.7" />)}</>}
    </CoordinatePlane>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>{items.map((item) => <span key={item.label} style={{ color: item.color, fontWeight: 800 }}>{item.label} = {formatComplex(item.value)}</span>)}</div>
    <p style={{ marginBottom: 0, color: '#5f6b7a' }}>Real part → horizontal coordinate; imaginary part → vertical coordinate.</p>
  </Panel>;
}

export default function ComplexPlaneLab({ questionData = {}, onAction }) {
  const mode = questionData.mode || 'features';
  const { feedback, submit } = useToolSubmission(onAction);
  if (mode === 'operations') return <Operations questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'division') return <Division questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'powers') return <Powers questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'rotation') return <Rotation questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'quadraticRoots') return <QuadraticRoots questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  return <Features questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
}

function Features({ questionData, feedback, submit, onAction }) {
  const z = toComplex(questionData.z || { re: 3, im: -4 });
  const conjugate = complexConjugateValue(z);
  const magnitude = complexMagnitudeValue(z);
  const angle = complexArgumentDegrees(z);
  const [magnitudeAnswer, setMagnitudeAnswer] = useState('');
  const [conjugateRe, setConjugateRe] = useState('');
  const [conjugateIm, setConjugateIm] = useState('');
  const check = () => {
    const checks = [matchesNumber(magnitudeAnswer, magnitude), matchesNumber(conjugateRe, conjugate.re), matchesNumber(conjugateIm, conjugate.im)];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / checks.length }, { magnitudeAnswer, conjugateRe, conjugateIm }, { mode: 'features' });
  };
  return <ToolShell title="Complex Plane Lab" subtitle="Treat a + bi as both a number and a vector from the origin." badge="Algebra II · Geometry of Complex Numbers">
    <TaskCard question={questionData} task='Find the magnitude of z and the real and imaginary parts of its conjugate.' steps={['Magnitude is the distance from the origin to the point — use the Pythagorean theorem.', 'The conjugate reflects the point across the real (horizontal) axis.', 'Enter |z| first, then the conjugate’s two parts.']} />
    <ToolGrid min={340}>
      <ComplexVisual values={[{ value: z, label: 'z' }, { value: conjugate, label: 'z̄', color: '#8a3ffc', isAnswer: true }]} title="z and its conjugate" />
      <Panel title="Analyze z">
        <p><strong>z = {formatComplex(z)}</strong></p>
        <p style={{ color: '#5f6b7a' }}>Its direction angle is approximately {Number.isFinite(angle) ? `${round(angle, 1)}°` : 'undefined at the origin'}. The conjugate reflects z across the real axis.</p>
        <label>|z|<input value={magnitudeAnswer} onChange={(event) => setMagnitudeAnswer(event.target.value)} style={inputStyle} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}><label>Re(z̄)<input value={conjugateRe} onChange={(event) => setConjugateRe(event.target.value)} style={inputStyle} /></label><label>Im(z̄)<input value={conjugateIm} onChange={(event) => setConjugateIm(event.target.value)} style={inputStyle} /></label></div>
        <button type="button" onClick={check} style={actionStyle}>Check features</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Magnitude and conjugate agree with the geometry.' : 'Magnitude is distance from the origin; conjugation changes only the sign of the imaginary part.'}</ResultPill></div> : null}
              <HintPanel {...hintProps(onAction, ['Plot z as the point (real part, imaginary part). Its magnitude is the length of the arrow from the origin.', '|a + bi| = √(a² + b²).', 'Conjugating changes only the sign of the imaginary part: the conjugate of a + bi is a − bi.'])} />
      </Panel>
    </ToolGrid>
  </ToolShell>;
}

function Operations({ questionData, feedback, submit, onAction }) {
  const z = toComplex(questionData.z || { re: 2, im: 3 });
  const w = toComplex(questionData.w || { re: -1, im: 2 });
  const operation = questionData.operation || 'multiply';
  const expected = operation === 'add' ? complexAdd(z, w) : operation === 'subtract' ? complexSubtract(z, w) : complexMultiplyValues(z, w);
  const symbol = operation === 'add' ? '+' : operation === 'subtract' ? '−' : '×';
  const [real, setReal] = useState('');
  const [imaginary, setImaginary] = useState('');
  const check = () => {
    const checks = [matchesNumber(real, expected.re), matchesNumber(imaginary, expected.im)];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / 2 }, { real, imaginary }, { mode: 'operations', operation });
  };
  return <ToolShell title="Complex Plane Lab" subtitle="Connect symbolic complex-number operations to points and vectors." badge="Algebra II · Operations">
    <TaskCard question={questionData} task='Carry out the operation and give the real and imaginary parts of the result.' steps={['Combine the real parts and the imaginary parts separately.', 'For multiplication, expand every product, then replace i² with −1.', 'Enter the result as a real part and an imaginary part.']} />
    <ToolGrid min={340}>
      <ComplexVisual values={[{ value: z, label: 'z' }, { value: w, label: 'w', color: '#d93025' }, { value: expected, label: 'result', color: '#137333', isAnswer: true }]} title="Operands + result geometry" />
      <Panel title="Compute the result">
        <p style={{ fontSize: 20, fontWeight: 900 }}>({formatComplex(z)}) {symbol} ({formatComplex(w)})</p>
        {operation === 'multiply' ? <p style={{ color: '#5f6b7a' }}>Use i² = −1 when combining the cross-products.</p> : null}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label>Real part<input value={real} onChange={(event) => setReal(event.target.value)} style={inputStyle} /></label><label>Imaginary part<input value={imaginary} onChange={(event) => setImaginary(event.target.value)} style={inputStyle} /></label></div>
        <button type="button" onClick={check} style={actionStyle}>Check operation</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? `Result: ${formatComplex(expected)}.` : 'Keep real terms and imaginary terms organized; replace i² with −1.'}</ResultPill></div> : null}
              <HintPanel {...hintProps(onAction, ['Treat i like a variable while you expand, and only afterwards use the fact that i² = −1.', 'For (a + bi)(c + di), the four products are ac, adi, bci and bd·i².', 'bd·i² becomes −bd, which moves into the real part.'])} />
      </Panel>
    </ToolGrid>
  </ToolShell>;
}

function Division({ questionData, feedback, submit, onAction }) {
  const z = toComplex(questionData.z || { re: 4, im: 2 });
  const w = toComplex(questionData.w || { re: 1, im: -1 });
  const conjugate = complexConjugateValue(w);
  const quotient = complexDivide(z, w);
  const [conjugateRe, setConjugateRe] = useState('');
  const [conjugateIm, setConjugateIm] = useState('');
  const [real, setReal] = useState('');
  const [imaginary, setImaginary] = useState('');
  const check = () => {
    const checks = [matchesNumber(conjugateRe, conjugate.re), matchesNumber(conjugateIm, conjugate.im), matchesNumber(real, quotient.re), matchesNumber(imaginary, quotient.im)];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / checks.length }, { conjugateRe, conjugateIm, real, imaginary }, { mode: 'division' });
  };
  return <ToolShell title="Complex Plane Lab" subtitle="Use a conjugate to turn a complex denominator into a real number." badge="Algebra II · Division by Conjugates">
    <TaskCard question={questionData} task="Rationalize the denominator, then give the quotient's real and imaginary parts." steps={['Write down the conjugate of the denominator.', 'Multiply the top and the bottom by that conjugate.', 'The new denominator is a real number — divide both parts by it.']} />
    <ToolGrid min={330}>
      <ComplexVisual values={[{ value: z, label: 'numerator' }, { value: w, label: 'denominator', color: '#d93025' }, { value: quotient, label: 'quotient', color: '#137333', isAnswer: true }]} title="Division on the complex plane" />
      <Panel title="Rationalize and divide">
        <p style={{ fontSize: 19, fontWeight: 900 }}>({formatComplex(z)}) ÷ ({formatComplex(w)})</p>
        <p style={{ color: '#5f6b7a' }}>Multiply numerator and denominator by the denominator’s conjugate. Then w·w̄ = |w|² is real.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label>Re(w̄)<input value={conjugateRe} onChange={(event) => setConjugateRe(event.target.value)} style={inputStyle} /></label><label>Im(w̄)<input value={conjugateIm} onChange={(event) => setConjugateIm(event.target.value)} style={inputStyle} /></label><label>Quotient real part<input value={real} onChange={(event) => setReal(event.target.value)} style={inputStyle} /></label><label>Quotient imaginary part<input value={imaginary} onChange={(event) => setImaginary(event.target.value)} style={inputStyle} /></label></div>
        <button type="button" onClick={check} style={actionStyle}>Check division</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? `The quotient is ${formatComplex(quotient)}.` : 'First conjugate the divisor correctly, then divide both real and imaginary numerator parts by |w|².'}</ResultPill></div> : null}
              <HintPanel {...hintProps(onAction, ['Dividing by a complex number is awkward, so we turn the denominator into a real number first.', 'Multiplying w by its own conjugate gives |w|², which has no i in it at all.', 'Whatever you multiply the bottom by, you must also multiply the top by, so the value does not change.'])} />
      </Panel>
    </ToolGrid>
  </ToolShell>;
}

function Powers({ questionData, feedback, submit, onAction }) {
  const z = toComplex(questionData.z || { re: 1, im: 1 });
  const exponent = Number(questionData.exponent ?? 3);
  const expected = complexPower(z, exponent);
  const expectedMagnitude = complexMagnitudeValue(expected);
  const [real, setReal] = useState('');
  const [imaginary, setImaginary] = useState('');
  const [magnitude, setMagnitude] = useState('');
  const check = () => {
    const checks = [matchesNumber(real, expected.re), matchesNumber(imaginary, expected.im), matchesNumber(magnitude, expectedMagnitude, 0.02)];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / checks.length }, { real, imaginary, magnitude }, { mode: 'powers', exponent });
  };
  return <ToolShell title="Complex Plane Lab" subtitle="Build integer powers through repeated complex multiplication and track magnitude." badge="Algebra II · Powers">
    <TaskCard question={questionData} task='Compute the power and its magnitude.' steps={['Multiply z by itself the required number of times.', 'Replace i² with −1 each time it appears.', 'Then find the distance of the result from the origin.']} />
    <ToolGrid min={330}>
      <ComplexVisual values={[{ value: z, label: 'z' }, { value: expected, label: `z^${exponent}`, color: '#137333', isAnswer: true }]} title="Base and power" />
      <Panel title={`Compute z^${exponent}`}>
        <p style={{ fontSize: 20, fontWeight: 900 }}>z = {formatComplex(z)}</p>
        <p style={{ color: '#5f6b7a' }}>For integer powers, multiply complex factors carefully. Magnitudes multiply too: |zⁿ| = |z|ⁿ.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label>Real part<input value={real} onChange={(event) => setReal(event.target.value)} style={inputStyle} /></label><label>Imaginary part<input value={imaginary} onChange={(event) => setImaginary(event.target.value)} style={inputStyle} /></label></div>
        <label style={{ display: 'block', marginTop: 10 }}>|z<sup>{exponent}</sup>|<input value={magnitude} onChange={(event) => setMagnitude(event.target.value)} style={inputStyle} /></label>
        <button type="button" onClick={check} style={actionStyle}>Check power</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? `Power and magnitude agree: ${formatComplex(expected)}.` : 'Check the repeated multiplication and then verify the result’s distance from the origin.'}</ResultPill></div> : null}
              <HintPanel {...hintProps(onAction, ['A power just means repeated multiplication — do it one step at a time rather than all at once.', 'After each multiplication, tidy the result back into a + bi form before multiplying again.', 'Magnitudes multiply: |zⁿ| = |z|ⁿ, so you can check your answer independently.'])} />
      </Panel>
    </ToolGrid>
  </ToolShell>;
}

function Rotation({ questionData, feedback, submit, onAction }) {
  const z = toComplex(questionData.z || { re: 3, im: 1 });
  const quarterTurns = Number(questionData.quarterTurns ?? 1);
  const expected = rotateByPowerOfI(z, quarterTurns);
  const expectedTurns = `${normalizedQuarterTurns(quarterTurns)}`;
  const [real, setReal] = useState('');
  const [imaginary, setImaginary] = useState('');
  const [rotation, setRotation] = useState('');
  const check = () => {
    const checks = [matchesNumber(real, expected.re), matchesNumber(imaginary, expected.im), rotation === expectedTurns];
    submit({ isCorrect: checks.every(Boolean), score: checks.filter(Boolean).length / checks.length }, { real, imaginary, rotation }, { mode: 'rotation', quarterTurns });
  };
  return <ToolShell title="Complex Plane Lab" subtitle="See multiplication by powers of i as quarter-turn rotations around the origin." badge="Algebra II · Multiplication as Rotation">
    <TaskCard question={questionData} task='Multiply by the power of i, give the result, and name the net rotation.' steps={['Reduce the exponent on i modulo 4.', 'Apply that many 90° counterclockwise quarter-turns to the point.', 'Enter the new coordinates and pick the matching rotation.']} />
    <ToolGrid min={330}>
      <ComplexVisual values={[{ value: z, label: 'z' }, { value: expected, label: `i^${quarterTurns}z`, color: '#8a3ffc', isAnswer: true }]} title="Before and after rotation" />
      <Panel title={`Multiply by i^${quarterTurns}`}>
        <p><strong>Starting point:</strong> {formatComplex(z)}</p>
        <p style={{ color: '#5f6b7a' }}>Powers of i cycle every four turns. One multiplication by i is a 90° counterclockwise rotation.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label>Result real part<input value={real} onChange={(event) => setReal(event.target.value)} style={inputStyle} /></label><label>Result imaginary part<input value={imaginary} onChange={(event) => setImaginary(event.target.value)} style={inputStyle} /></label></div>
        <label style={{ display: 'block', marginTop: 10 }}>Net rotation<select value={rotation} onChange={(event) => setRotation(event.target.value)} style={inputStyle}><option value="">Choose…</option><option value="0">No net rotation</option><option value="1">90° counterclockwise</option><option value="2">180°</option><option value="3">90° clockwise</option></select></label>
        <button type="button" onClick={check} style={actionStyle}>Check rotation</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? `Correct: ${quarterTurnLabel(quarterTurns)}.` : 'Reduce the exponent modulo 4, then apply the corresponding quarter-turn.'}</ResultPill></div> : null}
              <HintPanel {...hintProps(onAction, ['Multiplying by i once rotates a point 90° counterclockwise about the origin — it does not change its distance from the origin.', 'Powers of i repeat every four: i¹ = i, i² = −1, i³ = −i, i⁴ = 1.', 'A quarter-turn counterclockwise sends (a, b) to (−b, a).'])} />
      </Panel>
    </ToolGrid>
  </ToolShell>;
}

function QuadraticRoots({ questionData, feedback, submit, onAction }) {
  const quadratic = { a: Number(questionData.quadratic?.a ?? 1), b: Number(questionData.quadratic?.b ?? 2), c: Number(questionData.quadratic?.c ?? 5) };
  const roots = quadraticRootsComplex(quadratic);
  const [r1Re, setR1Re] = useState(''); const [r1Im, setR1Im] = useState('');
  const [r2Re, setR2Re] = useState(''); const [r2Im, setR2Im] = useState('');
  const check = () => {
    const complete = [r1Re, r1Im, r2Re, r2Im].every((value) => `${value}`.trim() !== '');
    const actual = [{ re: Number(r1Re), im: Number(r1Im) }, { re: Number(r2Re), im: Number(r2Im) }];
    const correct = complete && sameComplexSet(actual, roots, 0.01);
    submit({ isCorrect: correct, score: correct ? 1 : 0 }, { r1Re, r1Im, r2Re, r2Im }, { mode: 'quadraticRoots' });
  };
  const discriminant = quadratic.b ** 2 - 4 * quadratic.a * quadratic.c;
  return <ToolShell title="Complex Plane Lab" subtitle="Extend the quadratic formula into the complex plane when the discriminant is negative." badge="Algebra II · Complex Quadratic Roots">
    <TaskCard question={questionData} task='Solve the quadratic and give both complex roots.' steps={['Work out the discriminant b² − 4ac.', 'If it is negative, use √(−d) = i√d.', 'Enter both roots; their order does not matter.']} />
    <ToolGrid min={330}>
      <ComplexVisual values={roots.map((value, index) => ({ value, label: `root ${index + 1}`, color: index ? '#d93025' : '#1a73e8', isAnswer: true }))} title="Roots on the complex plane" />
      <Panel title="Solve the quadratic">
        <p style={{ fontSize: 20, fontWeight: 900 }}>{quadratic.a}x² {quadratic.b >= 0 ? '+' : '−'} {Math.abs(quadratic.b)}x {quadratic.c >= 0 ? '+' : '−'} {Math.abs(quadratic.c)} = 0</p>
        <p><strong>Discriminant:</strong> {discriminant}</p>
        <p style={{ color: '#5f6b7a' }}>Enter both roots as a + bi. Their order does not matter.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label>Root 1 real<input value={r1Re} onChange={(event) => setR1Re(event.target.value)} style={inputStyle} /></label><label>Root 1 imaginary<input value={r1Im} onChange={(event) => setR1Im(event.target.value)} style={inputStyle} /></label><label>Root 2 real<input value={r2Re} onChange={(event) => setR2Re(event.target.value)} style={inputStyle} /></label><label>Root 2 imaginary<input value={r2Im} onChange={(event) => setR2Im(event.target.value)} style={inputStyle} /></label></div>
        <button type="button" onClick={check} style={actionStyle}>Check both roots</button>
        {feedback ? <div style={{ marginTop: 12 }}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Both quadratic roots are correct.' : 'Use √(−d) = i√d and keep the ± pair; root order does not matter.'}</ResultPill></div> : null}
              <HintPanel {...hintProps(onAction, ['The quadratic formula still works when the discriminant is negative — the square root just becomes imaginary.', '√(−d) = i√d, so a negative discriminant produces a ± pair with the same real part.', 'Complex roots of a real quadratic always come in conjugate pairs: if a + bi is one root, a − bi is the other.'])} />
      </Panel>
    </ToolGrid>
  </ToolShell>;
}

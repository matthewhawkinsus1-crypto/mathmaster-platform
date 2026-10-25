import React, { useMemo } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import ToolShell, { Panel, ToolGrid, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import { useMethodWithheld, useRevealAnswers, SubmitText } from '../shared/ToolRuntimeContext';
import useReportToolWork from '../shared/useReportToolWork.js';
import useFieldUndoHistory from '../shared/useFieldUndoHistory.js';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import signSolutionGrader from '../../../functions/shared/serverGrading/tools/signSolutionAnalyzer.mjs';
import {
  RADICAL_SOLVE_DEFAULT,
  buildSignIntervals,
  evaluateRadicalEquationCandidate,
  formatSolutionPiece,
  parseRadicalValueList,
  radicalSolveEquation,
  solutionPiecesForRelation,
  validRadicalCandidates,
} from './signSolutionMath';
import { linearReadout, radicalEquationReadout, radicalReadout, raiseBothSidesText } from './radicalSolveReadout.js';
import { radicalSolveMissMessage } from './radicalSolveFeedback.js';

const RELATION_SYMBOLS = { '>': '>', '<': '<', '>=': '≥', '<=': '≤' };
const relationSymbol = (relation) => RELATION_SYMBOLS[relation] || relation;

const actionStyle = { marginTop:16, padding:'11px 18px', border:0, borderRadius:9, background:'#1a73e8', color:'#fff', fontWeight:800, cursor:'pointer', minHeight:44 };

export default function SignSolutionAnalyzer({ questionData = {}, onAction }) {
  const mode = questionData.mode || (questionData.denominatorFactors?.length ? 'rational' : 'polynomial');
  const { feedback, submit } = useToolSubmission(onAction);
  if (mode === 'radicalCheck') return <RadicalCheck questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'radicalSolve') return <RadicalSolve questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  return <SignChart questionData={questionData} feedback={feedback} submit={submit} mode={mode} onAction={onAction} />;
}

function SignChart({ questionData, feedback, submit, mode, onAction }) {
  const numeratorFactors = questionData.numeratorFactors || questionData.factors || [{root:-2,multiplicity:1},{root:3,multiplicity:1}];
  const denominatorFactors = mode === 'rational' ? (questionData.denominatorFactors || [{root:1,multiplicity:1}]) : [];
  const relation = questionData.relation || '>';
  const spec = { numeratorFactors, denominatorFactors };
  const revealAnswers = useRevealAnswers();
  const analysis = useMemo(() => buildSignIntervals(spec, relation), [numeratorFactors, denominatorFactors, relation]);
  const expectedPieces = useMemo(() => solutionPiecesForRelation(spec, relation), [numeratorFactors, denominatorFactors, relation]);
  const expectedIdx = analysis.intervals.map((interval, index) => interval.included ? index : null).filter((value) => value !== null);
  const [selected, setSelected] = usePersistentToolState('selected', []);
  const toggle = (index) => setSelected((old) => old.includes(index) ? old.filter((value) => value !== index) : [...old, index]);
  // Universal Undo over the chosen intervals (TOOL-2, useFieldUndoHistory.js).
  useFieldUndoHistory({ questionData, fields: { selected: [selected, setSelected] } });

  // The verdict comes from the shared grader the server runs; this chart only
  // shows it. The same work is reported live so a deadline can finalize it.
  // Any mode but 'rational' is the polynomial chart (denominators ignored).
  const chartMode = mode === 'rational' ? 'rational' : 'polynomial';
  const work = { selected };
  useReportToolWork(work);
  const check = () => {
    const result = gradeToolCheck(signSolutionGrader, questionData, work);
    submit({ isCorrect: result.isCorrect, score: result.score }, work, { mode: chartMode, relation, parts: result.parts });
  };

  const message = () => {
    if (feedback.isCorrect) return 'Correct — those are exactly the intervals where the expression satisfies the inequality.';
    // How many intervals qualify steers the hint below. It is read from the
    // chart on screen, never sent with the attempt.
    const expectedCount = expectedIdx.length;
    const chosen = selected.length;
    if (chosen === 0) return 'Nothing is selected yet. Pick a test number inside each interval, substitute it, and see whether the result satisfies the inequality.';
    if (chosen > expectedCount) return 'You have selected more intervals than satisfy the inequality. Test one number from each selected interval and drop any that fail.';
    if (chosen < expectedCount) return 'You are missing at least one interval. The sign can flip at every critical point, so test all of them, including the ones at the far left and far right.';
    return 'You have the right number of intervals but not the right ones. Recheck the sign of your test value in each — a factor with even multiplicity does not flip the sign.';
  };

  return <ToolShell
    title="Sign & Solution Analyzer"
    subtitle="Find the solution set of an inequality, endpoints included."
    badge={mode === 'rational' ? 'Rational inequalities' : 'Polynomial inequalities'}
  >
    <TaskCard
      question={questionData}
      task={`Select every interval where the expression is ${relationSymbol(relation)} 0.`}
      steps={[
        'Find the critical points — where the expression is zero or undefined.',
        'Pick a test number inside each interval and check the sign of the result.',
        'Select the intervals that satisfy the inequality, then check.',
      ]}
      note="A value that makes the denominator zero is never part of the solution. A value that makes the numerator zero is included only for ≤ and ≥."
    />
    <ToolGrid min={330}>
      <Panel title="Critical points and intervals">
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
          {analysis.criticalPoints.map((point) => (
            <span key={point.value} style={{padding:'8px 10px',borderRadius:999,background:point.isExcluded?'var(--mm-error-bg)':'var(--mm-primary-subtle)',color:point.isExcluded?'var(--mm-error-text)':'var(--mm-primary-text)',fontWeight:800}}>
              {point.value} · {point.isExcluded ? 'undefined here' : point.isZero ? 'expression = 0' : 'critical'}
            </span>
          ))}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%, 150px),1fr))',gap:8}}>
          {analysis.intervals.map((interval, index) => {
            const label = `(${Number.isFinite(interval.left)?interval.left:'−∞'}, ${Number.isFinite(interval.right)?interval.right:'∞'})`;
            const isSelected = selected.includes(index);
            return (
              <button type="button" key={label} onClick={() => toggle(index)} aria-pressed={isSelected} style={{padding:14,borderRadius:10,border:isSelected?'2px solid #1a73e8':'1px solid var(--mm-tint-border)',background:isSelected?'var(--mm-primary-subtle)':'var(--mm-surface)',cursor:'pointer',minHeight:44,textAlign:'left'}}>
                <div style={{fontWeight:800}}>{label}</div>
                {/* The tested sign of each interval is the work the student is
                    being asked to do, so it is a teacher-bench readout only. */}
                <div style={{marginTop:6,fontSize:'calc(13 * var(--mm-px))',color:revealAnswers ? (interval.sign>0?'var(--mm-success-text)':'var(--mm-danger)') : 'var(--mm-text-muted)'}}>
                  {revealAnswers ? `test sign ${interval.sign>0?'+':'−'}` : isSelected ? 'selected' : 'tap to select'}
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title="Your solution set">
        <div style={{padding:14,border:'1px solid var(--mm-tint-border)',borderRadius:10,background:'var(--mm-surface)',fontSize:'calc(18 * var(--mm-px))',fontWeight:800,minHeight:52}}>
          {selected.length
            ? selected.slice().sort((a, b) => a - b).map((index) => {
                const interval = analysis.intervals[index];
                return `(${Number.isFinite(interval.left)?interval.left:'−∞'}, ${Number.isFinite(interval.right)?interval.right:'∞'})`;
              }).join(' ∪ ')
            : 'Select intervals to build your answer.'}
        </div>
        {revealAnswers ? (
          <p style={{fontSize:'calc(12 * var(--mm-px))',color:'var(--mm-text-muted)',marginTop:8}}>
            Teacher preview — correct solution: {expectedPieces.length ? expectedPieces.map(formatSolutionPiece).join(' ∪ ') : '∅'}
          </p>
        ) : null}
        <button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}><SubmitText>Check selected intervals</SubmitText></button>
        {feedback ? <div style={{marginTop:14}}><ResultPill ok={feedback.isCorrect} message={message()}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill></div> : null}
        <HintPanel
          hints={[
            'The critical points split the number line into intervals. Inside one interval the expression cannot change sign.',
            'Pick any convenient number inside an interval — often 0, or one unit past a critical point — and work out whether the result is positive or negative.',
            `A factor raised to an even power touches zero without changing sign. This inequality is ${relationSymbol(relation)} 0, so ${relation === '>' || relation === '<' ? 'the critical points themselves are excluded' : 'numerator zeros are included, but any value that makes the denominator zero is still excluded'}.`,
          ]}
          onHintUsed={() => onAction?.('HINT_USED')}
        />
      </Panel>
    </ToolGrid>
  </ToolShell>;
}

function RadicalCheck({ questionData, feedback, submit, onAction }) {
  const spec = questionData.radicalEquation || { radicand:{m:1,b:6}, rhs:{m:0,b:3} };
  const candidates = questionData.candidates || [3,-15];
  const revealAnswers = useRevealAnswers();
  const expected = validRadicalCandidates(spec, candidates);
  const [selected, setSelected] = usePersistentToolState('selected', []);
  const toggle = (value) => setSelected((old) => old.includes(value) ? old.filter((entry) => entry !== value) : [...old, value]);
  useFieldUndoHistory({ questionData, fields: { selected: [selected, setSelected] } });
  const work = { selected };
  useReportToolWork(work);
  const check = () => {
    const result = gradeToolCheck(signSolutionGrader, questionData, work);
    submit({ isCorrect: result.isCorrect, score: result.score }, work, { mode: 'radicalCheck', parts: result.parts });
  };

  // As on paper: "√(3x + 4) = x", never "= 1x + 0" (walkthrough 2026-10-23,
  // Solving Radical Equations PR 7).
  const equationText = `√(${linearReadout(spec.radicand?.m ?? 1, spec.radicand?.b ?? 0)}) = ${linearReadout(spec.rhs?.m ?? 0, spec.rhs?.b ?? 0)}`;

  const message = () => {
    if (feedback.isCorrect) return expected.length ? 'Correct — only the values that survive substitution are real solutions.' : 'Correct — every candidate is extraneous, so this equation has no solution.';
    if (!selected.length) return 'Nothing is selected. Substitute each candidate into the original equation and keep the ones that make it true.';
    if (selected.length > expected.length) return 'At least one value you kept fails the original equation. Squaring both sides can create values that were never solutions — substitute each one back to catch them.';
    return 'You have rejected a value that actually works. Substitute each candidate into the original equation, not the squared version.';
  };

  return <ToolShell
    title="Sign & Solution Analyzer"
    subtitle="Decide which candidate solutions really solve the original equation."
    badge="Extraneous solutions"
  >
    <TaskCard
      question={questionData}
      task={`Select every candidate that is a genuine solution of ${equationText}.`}
      steps={[
        'Check that the value keeps the expression under the radical from going negative.',
        'Substitute the value into the original equation and see whether both sides really match.',
        'Reject any value that only appeared because both sides were squared.',
      ]}
    />
    <ToolGrid min={320}>
      <Panel title="Candidates">
        <p style={{fontSize:'calc(20 * var(--mm-px))',fontWeight:900,margin:'0 0 12px'}}>{equationText}</p>
        {candidates.map((candidate) => {
          const result = evaluateRadicalEquationCandidate(spec, candidate);
          const isSelected = selected.includes(candidate);
          return (
            <button type="button" key={candidate} onClick={() => toggle(candidate)} aria-pressed={isSelected} style={{display:'block',width:'100%',padding:13,margin:'8px 0',borderRadius:10,border:isSelected?'2px solid #1a73e8':'1px solid var(--mm-tint-border)',background:isSelected?'var(--mm-primary-subtle)':'var(--mm-surface)',textAlign:'left',cursor:'pointer',minHeight:44}}>
              <strong>x = {candidate}</strong>
              <span style={{float:'right',color:'var(--mm-text-muted)',fontSize:'calc(13 * var(--mm-px))'}}>
                {revealAnswers
                  ? (result?.valid ? 'genuine solution' : result?.reason === 'outsideDomain' ? 'outside the domain' : 'extraneous')
                  : isSelected ? 'kept as a solution' : 'substitute to verify'}
              </span>
            </button>
          );
        })}
      </Panel>
      <Panel title="How to verify">
        <ol style={{paddingLeft:20,lineHeight:1.7,margin:0}}>
          <li>Check the radical’s domain — the expression under the square root cannot be negative.</li>
          <li>Substitute into the <strong>original</strong> equation, before any squaring.</li>
          <li>Reject any value that squaring introduced.</li>
        </ol>
        <button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}><SubmitText>Check candidates</SubmitText></button>
        {feedback ? <div style={{marginTop:14}}><ResultPill ok={feedback.isCorrect} message={message()}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill></div> : null}
        <HintPanel
          hints={[
            'Squaring both sides of an equation can create solutions the original never had. That is why every candidate must be checked.',
            'Start with the domain: if a candidate makes the expression under the radical negative, it is out immediately.',
            'A square root always returns a value that is zero or positive. If the right-hand side comes out negative for a candidate, that candidate cannot work.',
          ]}
          onHintUsed={() => onAction?.('HINT_USED')}
        />
      </Panel>
    </ToolGrid>
  </ToolShell>;
}

const stageInputStyle = { width:'100%', padding:9, border:'1px solid var(--mm-tint-border)', borderRadius:8, boxSizing:'border-box', minHeight:44, fontSize:'calc(16 * var(--mm-px))' };
const stageLabelStyle = { display:'block', fontWeight:800, margin:'14px 0 6px' };
const stageMathStyle = { fontWeight:800, whiteSpace:'nowrap' };

/*
 * SOLVE A RADICAL EQUATION, ONE STAGE AT A TIME: isolate the radical, raise
 * both sides to the index, solve for the candidates, check each candidate in
 * the ORIGINAL equation, then state the solutions. Every stage is typed by
 * the student and marked on its own by the shared grader (radicalSolve in
 * functions/shared/serverGrading/tools/signSolutionAnalyzer.mjs), so a final
 * answer typed from a calculator earns only its own part.
 */
function RadicalSolve({ questionData, feedback, submit, onAction }) {
  const methodWithheld = useMethodWithheld();
  const spec = questionData.radicalEquation || RADICAL_SOLVE_DEFAULT;
  const notation = spec.notation === 'exponent' ? 'exponent' : 'radical';
  // The equation on screen. A spec this view cannot solve by hand shows a
  // notice instead (the grader reports such a question as invalid).
  const equation = useMemo(() => {
    try {
      return radicalSolveEquation(spec);
    } catch {
      return null;
    }
  }, [spec]);
  const variable = equation?.variable || 'x';
  const [isolated, setIsolated] = usePersistentToolState('isolated', '');
  const [raised, setRaised] = usePersistentToolState('raised', '');
  const [candidates, setCandidates] = usePersistentToolState('candidates', '');
  const [rows, setRows] = usePersistentToolState('rows', []);
  const [finalAnswer, setFinalAnswer] = usePersistentToolState('finalAnswer', '');
  const [noRealSolution, setNoRealSolution] = usePersistentToolState('noRealSolution', false);
  useFieldUndoHistory({ questionData, fields: {
    isolated: [isolated, setIsolated], raised: [raised, setRaised], candidates: [candidates, setCandidates],
    rows: [rows, setRows], finalAnswer: [finalAnswer, setFinalAnswer], noRealSolution: [noRealSolution, setNoRealSolution],
  } });
  // The verdict comes from the shared grader the server runs; this view only
  // shows it. Row i checks the i-th value typed as a candidate.
  const work = { isolated, raised, candidates, rows, finalAnswer, noRealSolution };
  useReportToolWork(work);
  const check = () => {
    const result = gradeToolCheck(signSolutionGrader, questionData, work);
    submit({ isCorrect: result.isCorrect, score: result.score }, work, { mode: 'radicalSolve', parts: result.parts });
  };

  // The check rows follow the candidates as typed; a list that cannot be read
  // has none until it can.
  const typed = parseRadicalValueList(candidates, variable);
  const checkValues = typed.kind === 'values' ? typed.values : [];
  const rowAt = (index) => (Array.isArray(rows) && rows[index] && typeof rows[index] === 'object' ? rows[index] : {});
  const setRowField = (index, field) => (event) => {
    const value = event.target.value;
    setRows((old) => {
      const next = Array.isArray(old) ? [...old] : [];
      next[index] = { ...(next[index] && typeof next[index] === 'object' ? next[index] : {}), [field]: value };
      return next;
    });
  };
  const toggleNoRealSolution = (event) => {
    setNoRealSolution(event.target.checked);
    if (event.target.checked) setFinalAnswer('');
  };

  if (!equation) {
    return <ToolShell title="Sign & Solution Analyzer" subtitle="Solve a radical equation step by step." badge="Radical equations">
      <p role="alert">This radical equation cannot be shown. Ask your teacher to check the question.</p>
    </ToolShell>;
  }

  const radical = radicalReadout(equation, notation);
  const radicand = linearReadout(equation.radicand.m, equation.radicand.b, variable);
  const stageParts = Array.isArray(feedback?.metadata?.parts) ? feedback.metadata.parts : [];

  return <ToolShell
    title="Sign & Solution Analyzer"
    subtitle="Solve a radical equation step by step, then decide which answers belong."
    badge="Radical equations"
  >
    <TaskCard
      question={questionData}
      task={`Solve ${radicalEquationReadout(equation, notation)}, showing each step, and check every candidate.`}
      steps={[
        'Isolate the radical: undo what is done outside it, in reverse order.',
        `${raiseBothSidesText(equation.index)} to undo the ${notation === 'exponent' ? `exponent 1/${equation.index}` : 'radical'}.`,
        `Solve the new equation for ${variable}. Its solutions are only candidates.`,
        'Substitute each candidate into the ORIGINAL equation. Keep it only if both sides match.',
      ]}
      note={equation.index % 2 === 0 ? 'An even root is never negative. Raising both sides to an even power can create values that do not solve the original equation — extraneous solutions.' : null}
    />
    <ToolGrid min={330}>
      <Panel title="Solve">
        <p style={{ fontSize:'calc(20 * var(--mm-px))', fontWeight:900, margin:'0 0 4px' }}>{radicalEquationReadout(equation, notation)}</p>
        <label style={stageLabelStyle} htmlFor="radical-solve-isolate">1. Isolate the radical</label>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={stageMathStyle}>{radical} =</span>
          <input id="radical-solve-isolate" value={isolated} onChange={(event) => setIsolated(event.target.value)} style={stageInputStyle} aria-label={`${radical} equals`} autoComplete="off" />
        </div>
        <label style={stageLabelStyle} htmlFor="radical-solve-raise">2. {raiseBothSidesText(equation.index)}</label>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={stageMathStyle}>{radicand} =</span>
          <input id="radical-solve-raise" value={raised} onChange={(event) => setRaised(event.target.value)} style={stageInputStyle} aria-label={`${radicand} equals`} autoComplete="off" placeholder={`a number or an expression in ${variable}`} />
        </div>
        <label style={stageLabelStyle} htmlFor="radical-solve-candidates">3. Solve for {variable}: the candidates</label>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={stageMathStyle}>{variable} =</span>
          <input id="radical-solve-candidates" value={candidates} onChange={(event) => setCandidates(event.target.value)} style={stageInputStyle} autoComplete="off" placeholder="separate two values with a comma, or type none" />
        </div>
        {typed.kind === 'unreadable' ? <p style={{ color:'var(--mm-text-muted)', margin:'6px 0 0' }}>Type each value as a number or a fraction such as 7/2, separated by commas.</p> : null}
      </Panel>
      <Panel title="Check in the original equation">
        {checkValues.length ? checkValues.map((value, index) => {
          const row = rowAt(index);
          const shown = `${variable} = ${value < 0 ? `−${Math.abs(value)}` : value}`;
          return <fieldset key={`${index}-${value}`} style={{ border:'1px solid var(--mm-tint-border)', borderRadius:10, padding:'10px 12px', margin:'0 0 10px' }}>
            <legend style={{ fontWeight:900, padding:'0 6px' }}>4. Check {shown}</legend>
            <label style={{ display:'block', marginBottom:8 }}>Left side at {shown}
              <input value={row.left ?? ''} onChange={setRowField(index, 'left')} style={{ ...stageInputStyle, marginTop:4 }} autoComplete="off" placeholder="a number, or not real" />
            </label>
            <label style={{ display:'block', marginBottom:8 }}>Right side at {shown}
              <input value={row.right ?? ''} onChange={setRowField(index, 'right')} style={{ ...stageInputStyle, marginTop:4 }} autoComplete="off" />
            </label>
            <label style={{ display:'block' }}>So {shown}
              <select value={row.decision ?? ''} onChange={setRowField(index, 'decision')} style={{ ...stageInputStyle, marginTop:4 }}>
                <option value="">Choose…</option>
                <option value="solution">solves the original equation</option>
                <option value="extraneous">is extraneous</option>
              </select>
            </label>
          </fieldset>;
        }) : <p style={{ color:'var(--mm-text-muted)', marginTop:0 }}>{typed.kind === 'none' ? 'No candidates to check.' : 'Your candidates from step 3 appear here to check.'}</p>}
        <label style={stageLabelStyle} htmlFor="radical-solve-final">5. Solution of the original equation</label>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={stageMathStyle}>{variable} =</span>
          <input id="radical-solve-final" value={finalAnswer} onChange={(event) => setFinalAnswer(event.target.value)} style={stageInputStyle} autoComplete="off" disabled={noRealSolution === true} />
        </div>
        <label style={{ display:'flex', alignItems:'center', gap:8, marginTop:8, minHeight:44 }}>
          <input type="checkbox" checked={noRealSolution === true} onChange={toggleNoRealSolution} style={{ width:20, height:20 }} />
          No real solution
        </label>
        <button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}><SubmitText>Check my solution</SubmitText></button>
        {feedback ? <div style={{ marginTop:14 }}>
          <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct — every step, and every candidate checked.' : radicalSolveMissMessage({ parts: stageParts, variable, methodWithheld })}</ResultPill>
          {/* ✓ and ✗ are the markers: no bullets, and read left to right
              like the steps (the panel centres its text). */}
          {!feedback.isCorrect && stageParts.length ? <ul style={{ margin:'10px 0 0', padding:0, listStyle:'none', textAlign:'left', lineHeight:1.7 }}>
            {stageParts.map((part) => <li key={part.id}><span aria-hidden="true">{part.isCorrect ? '✓' : '✗'}</span> {part.label}<span className="mm-sr-only">{part.isCorrect ? ': right' : ': not yet'}</span></li>)}
          </ul> : null}
        </div> : null}
        <HintPanel
          hints={[
            'Undo the outside operations in reverse order: first add or subtract the number outside the radical, then divide by its coefficient.',
            `${raiseBothSidesText(equation.index)}: (${radical})${equation.index === 2 ? '²' : equation.index === 3 ? '³' : `^${equation.index}`} is just ${radicand}. Raise the other side to the same power.`,
            'Substitute each candidate into the original equation, not the raised one. If the two sides do not match, the candidate is extraneous.',
          ]}
          onHintUsed={() => onAction?.('HINT_USED')}
        />
      </Panel>
    </ToolGrid>
  </ToolShell>;
}

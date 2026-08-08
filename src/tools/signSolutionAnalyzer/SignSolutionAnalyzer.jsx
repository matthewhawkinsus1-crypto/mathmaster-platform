import React, { useMemo, useState } from 'react';
import ToolShell, { Panel, ToolGrid, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import { useRevealAnswers } from '../shared/ToolRuntimeContext';
import {
  buildSignIntervals,
  evaluateRadicalEquationCandidate,
  formatSolutionPiece,
  sameIntervalSelection,
  solutionPiecesForRelation,
  validRadicalCandidates,
} from './signSolutionMath';

const RELATION_SYMBOLS = { '>': '>', '<': '<', '>=': '≥', '<=': '≤' };
const relationSymbol = (relation) => RELATION_SYMBOLS[relation] || relation;

const actionStyle = { marginTop:16, padding:'11px 18px', border:0, borderRadius:9, background:'#1a73e8', color:'#fff', fontWeight:800, cursor:'pointer', minHeight:44 };

export default function SignSolutionAnalyzer({ questionData = {}, onAction }) {
  const mode = questionData.mode || (questionData.denominatorFactors?.length ? 'rational' : 'polynomial');
  const { feedback, submit } = useToolSubmission(onAction);
  if (mode === 'radicalCheck') return <RadicalCheck questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
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
  const [selected, setSelected] = useState([]);
  const toggle = (index) => setSelected((old) => old.includes(index) ? old.filter((value) => value !== index) : [...old, index]);

  const check = () => {
    const isCorrect = sameIntervalSelection(selected, expectedIdx);
    submit({ isCorrect, score: isCorrect ? 1 : 0 }, { selected }, { mode, relation, expectedCount: expectedIdx.length });
  };

  const message = () => {
    if (feedback.isCorrect) return 'Correct — those are exactly the intervals where the expression satisfies the inequality.';
    const expectedCount = feedback.metadata?.expectedCount ?? 0;
    const chosen = selected.length;
    if (chosen === 0) return 'Nothing is selected yet. Pick a test number inside each interval, substitute it, and see whether the result satisfies the inequality.';
    if (chosen > expectedCount) return 'You have selected more intervals than satisfy the inequality. Test one number from each selected interval and drop any that fail.';
    if (chosen < expectedCount) return 'You are missing at least one interval. The sign can flip at every critical point, so test all of them, including the ones at the far left and far right.';
    return 'You have the right number of intervals but not the right ones. Recheck the sign of your test value in each — a factor with even multiplicity does not flip the sign.';
  };

  return <ToolShell
    title="Sign & Solution Analyzer"
    subtitle="Build the solution set from critical points, sign changes, and the endpoint rules that go with them."
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
            <span key={point.value} style={{padding:'8px 10px',borderRadius:999,background:point.isExcluded?'#fce8e6':'#eef4ff',color:point.isExcluded?'#b42318':'#174ea6',fontWeight:800}}>
              {point.value} · {point.isExcluded ? 'undefined here' : point.isZero ? 'expression = 0' : 'critical'}
            </span>
          ))}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8}}>
          {analysis.intervals.map((interval, index) => {
            const label = `(${Number.isFinite(interval.left)?interval.left:'−∞'}, ${Number.isFinite(interval.right)?interval.right:'∞'})`;
            const isSelected = selected.includes(index);
            return (
              <button type="button" key={label} onClick={() => toggle(index)} aria-pressed={isSelected} style={{padding:14,borderRadius:10,border:isSelected?'2px solid #1a73e8':'1px solid #d9e2f1',background:isSelected?'#eef4ff':'#fff',cursor:'pointer',minHeight:44,textAlign:'left'}}>
                <div style={{fontWeight:800}}>{label}</div>
                {/* The tested sign of each interval is the work the student is
                    being asked to do, so it is a teacher-bench readout only. */}
                <div style={{marginTop:6,fontSize:13,color:revealAnswers ? (interval.sign>0?'#137333':'#c5221f') : '#5f6b7a'}}>
                  {revealAnswers ? `test sign ${interval.sign>0?'+':'−'}` : isSelected ? 'selected' : 'tap to select'}
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title="Your solution set">
        <div style={{padding:14,border:'1px solid #d9e2f1',borderRadius:10,background:'#fff',fontSize:18,fontWeight:800,minHeight:52}}>
          {selected.length
            ? selected.slice().sort((a, b) => a - b).map((index) => {
                const interval = analysis.intervals[index];
                return `(${Number.isFinite(interval.left)?interval.left:'−∞'}, ${Number.isFinite(interval.right)?interval.right:'∞'})`;
              }).join(' ∪ ')
            : 'Select intervals to build your answer.'}
        </div>
        {revealAnswers ? (
          <p style={{fontSize:12,color:'#667085',marginTop:8}}>
            Teacher preview — correct solution: {expectedPieces.length ? expectedPieces.map(formatSolutionPiece).join(' ∪ ') : '∅'}
          </p>
        ) : null}
        <button type="button" onClick={check} style={actionStyle}>Check selected intervals</button>
        {feedback ? <div style={{marginTop:14}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill><p style={{margin:'9px 0 0',color:'#3c4756',lineHeight:1.55}}>{message()}</p></div> : null}
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
  const [selected, setSelected] = useState([]);
  const toggle = (value) => setSelected((old) => old.includes(value) ? old.filter((entry) => entry !== value) : [...old, value]);
  const same = (a, b) => a.length === b.length && [...a].sort((x, y) => x - y).every((value, index) => value === [...b].sort((x, y) => x - y)[index]);
  const check = () => {
    const isCorrect = same(selected, expected);
    submit({ isCorrect, score: isCorrect ? 1 : 0 }, { selected }, { mode:'radicalCheck', expectedCount: expected.length });
  };

  const equationText = `√(${spec.radicand?.m ?? 1}x ${Number(spec.radicand?.b ?? 0) >= 0 ? '+' : '−'} ${Math.abs(Number(spec.radicand?.b ?? 0))}) = ${spec.rhs?.m ?? 0}x ${Number(spec.rhs?.b ?? 0) >= 0 ? '+' : '−'} ${Math.abs(Number(spec.rhs?.b ?? 0))}`;

  const message = () => {
    if (feedback.isCorrect) return expected.length ? 'Correct — only the values that survive substitution are real solutions.' : 'Correct — every candidate is extraneous, so this equation has no solution.';
    if (!selected.length) return 'Nothing is selected. Substitute each candidate into the original equation and keep the ones that make it true.';
    if (selected.length > expected.length) return 'At least one value you kept fails the original equation. Squaring both sides can create values that were never solutions — substitute each one back to catch them.';
    return 'You have rejected a value that actually works. Substitute each candidate into the original equation, not the squared version.';
  };

  return <ToolShell
    title="Sign & Solution Analyzer"
    subtitle="Check candidate solutions in the original equation to catch the extraneous ones."
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
        <p style={{fontSize:20,fontWeight:900,margin:'0 0 12px'}}>{equationText}</p>
        {candidates.map((candidate) => {
          const result = evaluateRadicalEquationCandidate(spec, candidate);
          const isSelected = selected.includes(candidate);
          return (
            <button type="button" key={candidate} onClick={() => toggle(candidate)} aria-pressed={isSelected} style={{display:'block',width:'100%',padding:13,margin:'8px 0',borderRadius:10,border:isSelected?'2px solid #1a73e8':'1px solid #d9e2f1',background:isSelected?'#eef4ff':'#fff',textAlign:'left',cursor:'pointer',minHeight:44}}>
              <strong>x = {candidate}</strong>
              <span style={{float:'right',color:'#667085',fontSize:13}}>
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
        <button type="button" onClick={check} style={actionStyle}>Check candidates</button>
        {feedback ? <div style={{marginTop:14}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill><p style={{margin:'9px 0 0',color:'#3c4756',lineHeight:1.55}}>{message()}</p></div> : null}
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

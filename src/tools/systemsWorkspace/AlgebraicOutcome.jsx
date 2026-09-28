import React, { useState } from 'react';
import MathDisplay from '../../MathDisplay';
import ThreePlaneWorkspace from './ThreePlaneWorkspace.jsx';

/** The caller supplies only a statement produced by checked student work. */
export default function AlgebraicOutcome({ outcome, classified, onClassify, questionData, solution = null }) {
  const [choice, setChoice] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [showModel, setShowModel] = useState(false);
  const earned = classified || Boolean(solution);
  return <section className="mathmaster-algebraic-outcome" aria-label="Interpret your algebraic result">
    {outcome ? <>
      <h3>Your elimination result</h3>
      <MathDisplay value={outcome.statement} format="ascii-math" />
      {!classified ? <form onSubmit={(event) => { event.preventDefault(); setAttempted(true); onClassify(choice); }}>
        <label>What does your result mean for the system?
          <select aria-label="Classify your algebraic result" value={choice} onChange={(event) => { setChoice(event.target.value); setAttempted(false); }}>
            <option value="">Choose…</option>
            <option value="unique">One ordered triple — unique solution</option>
            <option value="infinite">Identity — dependent — infinitely many solutions</option>
            <option value="none">Contradiction — inconsistent — no solution</option>
          </select>
        </label>
        <button type="submit" disabled={!choice}>Check my classification</button>
        {attempted && choice !== outcome.type ? <p role="status">Does your numerical statement hold for every choice of the remaining variables, for just one choice, or for no choice? Check both sides before deciding.</p> : null}
      </form> : <p role="status">Your classification: {outcome.type === 'infinite' ? 'identity; dependent; infinitely many solutions' : 'contradiction; inconsistent; no solution'}.</p>}
    </> : null}
    {earned ? <button type="button" onClick={() => setShowModel((value) => !value)}>{showModel ? 'Hide 3D connection' : 'Connect my result to 3D'}</button> : null}
    {earned && showModel ? <ThreePlaneWorkspace
      questionData={{ ...questionData, answerFields: [], spatialModel: { kind: 'threePlanes' } }}
      earnedResult={solution ? { type: 'unique', solution } : { type: outcome.type, statement: outcome.statement }}
    /> : null}
  </section>;
}

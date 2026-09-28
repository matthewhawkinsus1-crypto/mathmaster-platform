import React, { useMemo, useState } from 'react';
import MathDisplay from '../../MathDisplay';
import ThreePlaneWorkspace from './ThreePlaneWorkspace.jsx';
import {
  PLANE_RELATIONSHIP_OPTIONS,
  describePlaneRelationships,
  planePairs,
  planeRelationshipFeedback,
} from './spatialFeedback.js';
import {
  STATEMENT_KINDS,
  SYSTEM_MEANINGS,
  classificationFeedback,
  emptyPlaneWork,
  planeTruthFor,
  planeWorkEarned,
  statementKindCorrect,
} from './algebraicOutcomeModel.js';

/**
 * The caller supplies only a statement produced by checked student work.
 *
 * For an identity or contradiction the student then (1) says what kind of
 * statement it is and what it means for the system, and (2) once that is
 * right, states how each pair of planes meets. The model never captions the
 * relationships for them (#392).
 */
export default function AlgebraicOutcome({ outcome, classified, onClassify, questionData, solution = null, planeWork = null, onPlaneWorkChange = null, onAction = null }) {
  const [kind, setKind] = useState('');
  const [choice, setChoice] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [showModel, setShowModel] = useState(false);
  const earned = classified || Boolean(solution);

  const truth = useMemo(() => planeTruthFor(questionData), [questionData]);
  const planes = planeWork || emptyPlaneWork();
  const askPlanes = Boolean(outcome && classified && onPlaneWorkChange && Object.keys(truth).length === 3);
  const planesEarned = askPlanes && planeWorkEarned(planes, questionData);
  const planeHint = askPlanes && planes.checked && !planesEarned ? planeRelationshipFeedback(planes.answers, truth) : null;

  const submitClassification = (event) => {
    event.preventDefault();
    setAttempted(true);
    // Only a correct reading of the statement is recorded as a classification;
    // a wrong one stays here with its nudge and never unlocks the model.
    if (statementKindCorrect(outcome, kind)) onClassify(choice);
  };
  const hint = attempted ? classificationFeedback(outcome, kind, choice) : null;

  return <section className="mathmaster-algebraic-outcome" aria-label="Interpret your algebraic result">
    {outcome ? <>
      <h3>Your algebraic result</h3>
      <MathDisplay value={outcome.statement} format="ascii-math" />
      {!classified ? <form onSubmit={submitClassification}>
        <label>What kind of statement is your result?
          <select aria-label="What kind of statement is your result" value={kind} onChange={(event) => { setKind(event.target.value); setAttempted(false); }}>
            <option value="">Choose…</option>
            {STATEMENT_KINDS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>What does that mean for the system?
          <select aria-label="Classify your algebraic result" value={choice} onChange={(event) => { setChoice(event.target.value); setAttempted(false); }}>
            <option value="">Choose…</option>
            {SYSTEM_MEANINGS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <button type="submit" disabled={!kind || !choice}>Check my classification</button>
        {hint ? <p role="status">{hint}</p> : null}
      </form> : <p role="status">Your classification: {outcome.type === 'infinite' ? 'an identity; consistent and dependent; infinitely many solutions' : 'a contradiction; inconsistent; no solution'}.</p>}
    </> : null}
    {earned ? <button type="button" onClick={() => setShowModel((value) => !value)}>{showModel ? 'Hide 3D connection' : 'Connect my result to 3D'}</button> : null}
    {earned && showModel ? <ThreePlaneWorkspace
      questionData={{ ...questionData, answerFields: [], spatialModel: { kind: 'threePlanes' } }}
      earnedResult={solution ? { type: 'unique', solution } : { type: outcome.type, statement: outcome.statement }}
      // The model's hint panel says "Recorded for your teacher": forward that,
      // and only that — with no answer fields it has nothing to submit.
      onAction={(type, payload) => { if (type === 'HINT_USED') onAction?.(type, payload); }}
    /> : null}
    {askPlanes ? <fieldset className="mathmaster-algebraic-outcome-planes" data-stage="plane-relationships">
      <legend>How do the planes meet? Use the model or compare the coefficients and constants.</legend>
      {planesEarned ? <p role="status">Your plane relationships: {describePlaneRelationships(planes.answers).join(' ')}</p> : <>
        {planePairs(3).map(({ id, first, second }) => <label key={id}>Planes {first} and {second}
          <select
            aria-label={`How Planes ${first} and ${second} meet`}
            value={planes.answers?.[id] || ''}
            onChange={(event) => onPlaneWorkChange({ answers: { ...planes.answers, [id]: event.target.value }, checked: false })}
          >
            <option value="">Choose…</option>
            {PLANE_RELATIONSHIP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>)}
        <button type="button" disabled={planePairs(3).some(({ id }) => !planes.answers?.[id])} onClick={() => onPlaneWorkChange({ answers: planes.answers, checked: true })}>Check the plane relationships</button>
        {planeHint ? <p role="status">{planeHint}</p> : null}
      </>}
    </fieldset> : null}
  </section>;
}

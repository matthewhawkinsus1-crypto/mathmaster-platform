/*
 * VERIFY THE SOLUTION IN EVERY ORIGINAL EQUATION — shared by the 3×3
 * substitution and elimination screens (#369).
 *
 * What a student owes here is mathematics: which value goes on which variable,
 * and the arithmetic of each side of each original equation. The interface no
 * longer asks for anything else (substitutionReduction.js):
 *
 *   - a value is placed on its variable once and goes into every original
 *     equation that has that variable (placeVerificationValue);
 *   - a side that is already a number is shown as given, not retyped
 *     (verificationGivenSides).
 *
 * Every original equation still shows its own substituted line, is simplified
 * by the student, and is checked on its own — all three are verified.
 */
import React from 'react';
import MathDisplay from '../../MathDisplay';
import MathInput from '../../MathInput';
import { MathDragToken, VariableDropEquation } from './AlgebraicSystemMode.jsx';
import { substituteIntoEquation, substitutedEquationLatex } from './algebraicSystemsEngine.js';
import {
  checkVerification,
  placeVerificationValue,
  setVerificationAnswer,
  verificationGivenSides,
  verificationReady,
  verificationVariables,
} from './substitutionReduction.js';

const checkButtonStyle = { marginTop: 8, padding: '9px 14px', border: 0, borderRadius: 9, background: '#1a73e8', color: '#fff', fontWeight: 800, cursor: 'pointer', minHeight: 44, fontSize: 13 };

const SIDE_NAMES = { left: 'Left side', right: 'Right side' };

export default function OriginalEquationsVerification({
  state,
  system,
  solution,
  display,
  payloadPrefix,
  armedToken,
  setArmedToken,
  apply,
  heading = 'Verify the ordered triple in all three original equations',
}) {
  return (
    <div className="mathmaster-systems-verification-stage">
      <div className="mathmaster-systems-verification-heading">
        <strong>{heading}</strong>
        <span>Place each solved value on its variable once — it goes into every original equation that has that variable. Then simplify each side.</span>
      </div>
      <div className="mathmaster-systems-verification-token-bank">
        {system.variables.map((name) => (
          <MathDragToken
            key={name}
            payloadPrefix={payloadPrefix}
            payloadValue={name}
            expression={`${name} = ${display(name)}`}
            label="Solved value"
            onArm={() => setArmedToken({ kind: 'verification', variable: name })}
            ariaLabel={`Pick up solved value ${display(name)} for ${name}`}
          />
        ))}
      </div>
      <div className="mathmaster-systems-verification-equations mathmaster-reduction-verification-grid">
        {system.equations.map((equation) => {
          const entry = state.verification?.[equation.id] || { placed: {} };
          const ready = verificationReady(state, system, equation.id);
          const given = verificationGivenSides(system, equation.id);
          return (
            <div key={equation.id} className={`mathmaster-systems-verification-card${entry.valid ? ' is-valid' : ''}`} data-verify-id={equation.id}>
              <div className="mathmaster-systems-backsub-equation-label">{equation.label}</div>
              {!ready ? (
                <VariableDropEquation
                  equationText={equation.text}
                  variables={system.variables}
                  payloadPrefix={payloadPrefix}
                  onVariableAttempt={(targetVariable, tokenVariable) => apply(placeVerificationValue(state, system, equation.id, targetVariable, tokenVariable))}
                  tokenArmed={armedToken?.kind === 'verification'}
                  armedPayloadValue={armedToken?.kind === 'verification' ? armedToken.variable : null}
                  placedValues={Object.fromEntries(system.variables.filter((name) => entry.placed?.[name]).map((name) => [name, display(name)]))}
                  label={`${equation.label}: place the solved values`}
                />
              ) : (
                <>
                  <div className="mathmaster-systems-verification-substitution">
                    <span>Values substituted</span>
                    {(() => {
                      const substituted = verificationVariables(system, equation.id).reduce((text, name) => substituteIntoEquation(text, name, display(name)), equation.text);
                      const latex = substitutedEquationLatex(substituted);
                      return <MathDisplay value={latex || substituted} format={latex ? 'latex' : 'ascii-math'} />;
                    })()}
                  </div>
                  <div className="mathmaster-systems-verification-arithmetic">
                    {['left', 'right'].map((side) => (given[side] != null ? (
                      <div key={side} className="mathmaster-systems-verification-given" data-given-side={side}>
                        <span>{SIDE_NAMES[side]}</span>
                        <div className="mathmaster-systems-verification-given-value">
                          <MathDisplay value={given[side]} format="ascii-math" inline ariaLabel={`${SIDE_NAMES[side]}, as written: ${given[side]}`} />
                        </div>
                      </div>
                    ) : (
                      <label key={side} className="mathmaster-reduction-field">
                        {SIDE_NAMES[side]} simplifies to
                        <MathInput
                          value={entry[`${side}Answer`] || ''}
                          onChange={(value) => apply(setVerificationAnswer(state, equation.id, `${side}Answer`, value))}
                          placeholder="value"
                          ariaLabel={`${equation.label} ${side} side value`}
                          toolProfile="algebra-operation"
                          compact
                        />
                      </label>
                    )))}
                    <button type="button" onClick={() => apply(checkVerification(state, system, solution, equation.id))} style={checkButtonStyle}>Check {equation.label.toLowerCase()}</button>
                    {entry.checked ? (
                      <p className={`mathmaster-systems-verification-feedback${entry.valid ? ' is-valid' : ' is-error'}`}>
                        {entry.valid ? 'Both sides check out.' : 'The values are placed. Recheck your arithmetic; the two sides should match.'}
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

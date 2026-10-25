import React from 'react';
import MathDisplay from '../../MathDisplay';
import MathInput from '../../MathInput';
import { classroomEquationText } from './algebraicSystemsEngine.js';

/*
 * A SUBSTITUTION THAT LEFT NO VARIABLE, FINISHED BY THE STUDENT (TL11).
 *
 * In a dependent or inconsistent 3×3 a substitution can cancel every variable
 * (2(3 − y − z) + 2y + 2z = 6). Step Algebra has nothing left to isolate, so
 * the student simplifies each side that is not already a number, side by side,
 * and presses Check. What reaches the interpretation is the statement THEY
 * wrote ("6 = 6"); nothing here computes a side for them
 * (degenerateSubstitution.mjs judges what they typed against the true value).
 *
 * Presentation only: the entries, the check and the result are the caller's
 * (substitutionReduction.mjs holds them, and SubstitutionReductionMode persists
 * them), so this file keeps no state. Once both sides are right the caller
 * records the statement and stops showing this card. The 2×2 workspace draws
 * the same step from its own copy of this markup (AlgebraicSystemMode.jsx); the
 * two can be folded together the next time that file is opened for other work.
 *
 * @param equationText  the substituted equation as it stands
 * @param name          what the student calls it ("R₁")
 * @param sides         degenerateSubstitution's `substitutedStatementSides`
 * @param entries       what the student has typed, { left, right }
 * @param result        the judged sides after Check ({ valid, sides }), else null
 * @param onChange      (side, value) => void
 * @param onCheck       () => void
 */
export default function SubstitutedStatementEntry({
  equationText, name, sides, entries, result = null, onChange, onCheck, stageRef = null,
}) {
  const wrong = result && !result.valid ? ['left', 'right'].filter((key) => !result.sides[key]?.correct) : [];
  return (
    <div ref={stageRef} className="mathmaster-systems-student-combination" data-stage="substituted-statement" style={{ marginTop: 14 }}>
      <div className="mathmaster-systems-student-combination-heading">
        <strong>Simplify the substituted equation{name ? ` ${name}` : ''}</strong>
        <span>
          {sides.collected
            ? 'Collect every term on the left yourself, then enter the number left on the right side.'
            : 'Distribute and combine like terms yourself, then enter what each side simplifies to.'}
        </span>
      </div>
      <MathDisplay value={classroomEquationText(equationText)} format="ascii-math" />
      <div className="mathmaster-systems-student-combination-equation">
        {['left', 'right'].map((key) => (
          <React.Fragment key={key}>
            {key === 'right' ? <span className="mathmaster-systems-student-combination-equals">=</span> : null}
            {sides[key].given ? (
              <span data-given-side={key}><MathDisplay value={sides[key].text} format="ascii-math" inline /></span>
            ) : (
              <MathInput
                value={entries[key] || ''}
                onChange={(value) => onChange(key, value)}
                onSubmit={onCheck}
                placeholder={`${key} side`}
                ariaLabel={`Simplified ${key} side${name ? ` of ${name}` : ''}`}
                toolProfile="algebra-operation"
                compact
                maxWidth={150}
              />
            )}
          </React.Fragment>
        ))}
      </div>
      <button type="button" className="mathmaster-systems-check-combination" onClick={onCheck}>
        Check simplified sides
      </button>
      {wrong.length ? (
        <p className="mathmaster-systems-combination-feedback is-error" role="status">
          {wrong.length === 2
            ? 'Recheck the simplification of both sides.'
            : `Recheck the simplification of the ${wrong[0]} side. Distribute carefully and watch the signs.`}
        </p>
      ) : null}
    </div>
  );
}

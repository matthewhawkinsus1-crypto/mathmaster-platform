/*
 * A 3×3 WHOSE EQUATIONS EACH HOLD ONE DIFFERENT VARIABLE, SOLVED EQUATION BY
 * EQUATION (TL43, finding C2-138).
 *
 * 2x = 2, 3y = 6, 4z = 12 (or x = 1, y = 2, z = 3) shares no variable, so
 * substitution and elimination have nothing to work on, whichever variable is
 * chosen. Both workspaces stranded the student, and all they could do was say
 * so. As the 2×2 does for rows like these (AlgebraicSystemMode, `separated`),
 * there is no method here: each equation is solved for its own variable (an
 * equation already reading `variable = number` as written; any other with
 * Step Algebra), and the three values are then checked in all three original
 * equations with the 3×3's own verification.
 *
 * The work is the 3×3's: the values and the sides typed in each check, which
 * the shared grader marks as it marks any ordered triple
 * (functions/shared/serverGrading/tools/systemsWorkspace/algebraic.mjs). Its
 * method is BY_EQUATION_METHOD, the route on screen.
 */
import React, { useCallback, useMemo, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import useMathUndoHistory, { questionUndoResetKey, useActiveUndoOwner } from '../../platform/workView/useMathUndoHistory.js';
import { Panel, ResultPill, HintPanel } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import { SubmitText } from '../shared/ToolRuntimeContext';
import useReportToolWork from '../shared/useReportToolWork.js';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import systemsWorkspaceGrader from '../../../functions/shared/serverGrading/tools/systemsWorkspace.mjs';
import { solvedValuesWork, verificationSidesWork } from '../../../functions/shared/serverGrading/tools/systemsWorkspace/algebraic.mjs';
import MathDisplay from '../../MathDisplay';
import { EmbeddedStepAlgebra, solvedRecordExpression, solvedRecordFor } from './AlgebraicSystemMode.jsx';
import { exactNumberText } from './algebraicSystemsEngine.js';
import { allOriginalsVerified, buildReductionSystem } from './substitutionReduction.js';
import { verificationTokenNeeded } from './verificationTokenState.js';
import OriginalEquationsVerification from './OriginalEquationsVerification.jsx';
import AlgebraicOutcome from './AlgebraicOutcome.jsx';
import { eliminationActionStyle } from './EliminationStack.jsx';
import './AlgebraicSystemMode.css';

/** The `method` this route reports: the route on screen, never a pick between the other two. */
export const BY_EQUATION_METHOD = 'byEquation';

// The same action button as the elimination route's (its colours are the theme
// audit's documented exception there), not a copy with a new hard-coded colour.
const actionStyle = eliminationActionStyle;

const emptyCheck = () => ({ verification: {} });

/** "x in Equation 1, y in Equation 2 and z in Equation 3". */
const whereEachVariableIs = (rows, system) => {
  const parts = rows.map((row) => `${row.variable} in ${system.equations[row.index].label}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts.join('');
};

export default function EquationByEquationMode({ questionData = {}, config, rows, onAction, draftKey = null }) {
  const system = useMemo(
    () => buildReductionSystem({ variables: config.variables, equations: config.equations }),
    // The config object is rebuilt per questionData; the system only changes when the mathematics does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.variables.join('|'), config.equations.join('|')],
  );
  // The student's own solve of each equation that is not already
  // `variable = number`, by equation index, and the original-equation checks.
  const [solved, setSolved] = usePersistentToolState('byEquationSolved', {});
  const [storedCheck, setStoredCheck] = usePersistentToolState('byEquationVerification', emptyCheck);
  const check = storedCheck?.verification ? storedCheck : emptyCheck();
  // Transient presentation only — see toolStatePersistence.js.
  const [verificationNote, setVerificationNote] = useState(null);
  const [armedToken, setArmedToken] = useState(null);
  const [embeddedUndoController, setEmbeddedUndoController] = useState(null);
  const { feedback, submit } = useToolSubmission(onAction);

  const entries = rows.map((row) => {
    if (row.given !== null) return { row, value: row.given, expression: exactNumberText(row.given) };
    const record = solved?.[row.index];
    return record?.variable === row.variable && Number.isFinite(Number(record.value))
      ? { row, value: Number(record.value), expression: solvedRecordExpression(record) }
      : { row, value: null, expression: '' };
  });
  const pending = entries.find((entry) => entry.value === null)?.row || null;
  const solution = pending ? null : Object.fromEntries(entries.map((entry) => [entry.row.variable, entry.value]));
  const display = (name) => entries.find((entry) => entry.row.variable === name)?.expression || '';
  const verified = Boolean(solution) && (!config.requireVerification || allOriginalsVerified(check, system));
  const everyRowGiven = rows.every((row) => row.given !== null);

  /* ------------------------------------------------------------ undo */
  const historyState = useMemo(() => ({ solved, verification: check.verification }), [solved, check.verification]);
  const restore = useCallback((value) => {
    setSolved(value?.solved || {});
    setStoredCheck({ verification: value?.verification || {} });
  }, [setSolved, setStoredCheck]);
  const undoHistory = useMathUndoHistory({
    persist: true,
    label: 'Undo the last 3×3 edit',
    state: historyState,
    onRestore: restore,
    resetKey: questionUndoResetKey(questionData),
    ownerId: 'algebraic-by-equation-history',
  });
  // Most local first: the equation being solved, then this board's history.
  const compositeUndo = useMemo(() => (
    embeddedUndoController?.canUndo
      ? embeddedUndoController
      : { canUndo: undoHistory.canUndo, onUndo: undoHistory.undo, label: 'Undo the last 3×3 edit' }
  ), [embeddedUndoController, undoHistory.canUndo, undoHistory.undo]);
  useActiveUndoOwner({ id: 'algebraic-by-equation-composite', active: true, priority: 60, controller: compositeUndo });

  /* -------------------------------------------------------- handlers */
  const handleSolved = useCallback((row, latexResponse) => {
    const record = solvedRecordFor(latexResponse, row.variable);
    if (record) setSolved((current) => ({ ...current, [row.index]: record }));
  }, [setSolved]);

  const apply = useCallback((transition) => {
    if (!transition) return;
    if (transition.state && transition.state !== check) setStoredCheck({ verification: transition.state.verification || {} });
    setVerificationNote(transition.feedback?.reason === 'wrong-variable'
      ? 'That value was placed on a different variable than the one it represents. Use the variable named on the value to choose another location.'
      : null);
    // A value stays selected until every equation that has its variable has it.
    if (!transition.feedback && transition.state && transition.state !== check) {
      setArmedToken((current) => (current?.kind === 'verification' && verificationTokenNeeded(transition.state, system.equations, current.variable) ? current : null));
    }
  }, [check, setStoredCheck, system]);

  /*
   * THE STUDENT'S WORK, AS THE SHARED GRADER READS IT: every value found so
   * far and the sides typed in each original-equation check. Never the key,
   * never a checked/valid flag. Reported live so a deadline can finalize it;
   * Check submits this same object.
   */
  const work = {
    dimension: config.dimension,
    method: BY_EQUATION_METHOD,
    values: solvedValuesWork(Object.fromEntries(entries.filter((entry) => entry.value !== null).map((entry) => [entry.row.variable, entry.value]))),
    verification: verificationSidesWork(check.verification),
  };
  useReportToolWork(work);

  const readyToSubmit = verified;
  const checkWork = () => {
    const result = gradeToolCheck(systemsWorkspaceGrader, questionData, work);
    submit({ isCorrect: result.isCorrect, score: result.score }, work, {
      mode: 'algebraic',
      dimension: config.dimension,
      method: BY_EQUATION_METHOD,
      parts: result.parts,
    });
  };

  /* ------------------------------------------------------------ view */
  return (
    <EnlargeableFigure
      label="3×3 algebraic systems workspace"
      style={{ width: '100%' }}
      capabilities={{
        undo: {
          label: '↶ Undo',
          title: compositeUndo.label || 'Undo the last algebra step',
          onAction: () => compositeUndo.onUndo?.(),
          disabled: !compositeUndo.canUndo,
          studentState: true,
        },
        equationInput: { label: 'All three equations and every algebraic move', studentState: true },
        numericControls: { label: 'Each solved value and the checks in the original equations', studentState: true },
        instruction: { text: 'Solve each equation for its variable, then check the three values in all three equations.' },
        primaryActions: readyToSubmit ? [{ id: 'check-algebraic-system', label: 'Check my work', onAction: checkWork }] : [],
      }}
    >
      <div className={`mathmaster-reduction-layout${pending ? ' has-active-solver' : ''}`} data-by-equation={pending ? 'solving' : verified ? 'verified' : 'checking'}>
        <aside className="mathmaster-reduction-reference" aria-label="Original equations">
          <div className="mathmaster-reduction-reference-heading">Original equations</div>
          {system.equations.map((equation) => (
            <div key={equation.id} className="mathmaster-reduction-equation-card" data-equation-id={equation.id}>
              <span className="mathmaster-reduction-equation-label">{equation.label}</span>
              <MathDisplay value={equation.text} format="ascii-math" />
            </div>
          ))}
          {entries.some((entry) => entry.value !== null) ? (
            <div className="mathmaster-reduction-solved-values" role="group" aria-label="Solved values">
              {entries.filter((entry) => entry.value !== null).map((entry) => (
                <span key={entry.row.variable} className="mathmaster-reduction-value-chip">{entry.row.variable} = {entry.expression}</span>
              ))}
            </div>
          ) : null}
          {solution ? (
            <div className="mathmaster-reduction-ordered-triple">
              <strong>Ordered triple:</strong> ({system.variables.map((name) => display(name)).join(', ')})
            </div>
          ) : null}
        </aside>

        <div className="mathmaster-reduction-workflow">
          <Panel title="Solve each equation">
            <p className="mathmaster-systems-substitution-direction">
              Each equation has only one variable: {whereEachVariableIs(rows, system)}. There is nothing to substitute or eliminate,
              {everyRowGiven
                ? ' and each equation already gives its value. Check the three values in all three equations.'
                : ' so solve each equation for its variable, then check the three values in all three equations.'}
            </p>
            <ul className="mathmaster-systems-by-equation-rows" style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 4, textAlign: 'left' }}>
              {entries.map((entry) => (
                <li key={entry.row.index} data-by-equation-row={entry.row.index}>
                  {system.equations[entry.row.index].label}:{' '}
                  {entry.value === null
                    ? <span>solve for {entry.row.variable}</span>
                    : <><MathDisplay value={`${entry.row.variable} = ${entry.expression}`} format="ascii-math" inline />{entry.row.given !== null ? ' (as written)' : ''}</>}
                </li>
              ))}
            </ul>

            {pending ? (
              <EmbeddedStepAlgebra
                key={`by-equation-${pending.index}`}
                label={`Solve ${system.equations[pending.index].label} for ${pending.variable}`}
                prompt={`Solve this equation for ${pending.variable}.`}
                equationText={system.equations[pending.index].text}
                solveFor={pending.variable}
                draftKey={draftKey ? `${draftKey}:by-equation:${pending.index}:${pending.variable}` : null}
                onSolved={(latexResponse) => handleSolved(pending, latexResponse)}
                onUndoStateChange={setEmbeddedUndoController}
                workspaceDifficulty={questionData.workspaceDifficulty}
                requireSimplifiedFinalForm
                autoReveal
              />
            ) : null}

            {solution && config.requireVerification ? (
              <OriginalEquationsVerification
                state={check}
                system={system}
                solution={solution}
                display={display}
                payloadPrefix="mathmaster-verification:"
                armedToken={armedToken}
                setArmedToken={setArmedToken}
                apply={apply}
              />
            ) : null}

            {verificationNote ? <p className="mathmaster-systems-substitution-feedback is-error" role="status">{verificationNote}</p> : null}

            {readyToSubmit ? <AlgebraicOutcome questionData={questionData} solution={solution} onAction={onAction} /> : null}
            {readyToSubmit ? <button type="button" onClick={checkWork} style={actionStyle}><SubmitText>Check my work</SubmitText></button> : null}
            {feedback ? (
              <div style={{ marginTop: 14 }}>
                <ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? 'Correct' : 'Not yet'}</ResultPill>
              </div>
            ) : null}

            <HintPanel
              hints={[
                'Which variable does each equation hold? That equation alone decides its value.',
                'Undo what is done to the variable in each equation: a number multiplying it is undone by dividing both sides by that number.',
                'Put all three values back into each original equation: both sides should come out equal.',
              ]}
              onHintUsed={() => onAction?.('HINT_USED')}
            />
          </Panel>
        </div>
      </div>
    </EnlargeableFigure>
  );
}

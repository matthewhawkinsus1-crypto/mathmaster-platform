/*
 * THE ONE SIMPLIFY CONTROL'S PANEL (student push Q).
 *
 * Rendered by every algebra workspace that offers Simplify — StepByStepAlgebra
 * (all seven hosts) and the relation workspace — so the parts, the box, the
 * checks and the messages are the same everywhere. The workspace keeps its own
 * board: it highlights the parts this panel lists and passes a tap on a
 * highlighted term back as a choice (`state.partId`).
 *
 * Two routes, one panel:
 *   - a PART: choose it (tap it on the board, or reach it here by keyboard),
 *     type its simplified form in the small box, and it is checked and
 *     committed. Removing parentheses after a plus sign, or a leftover factor
 *     of 1, needs no typing; parentheses after a minus sign ask for each sign;
 *   - a WHOLE SIDE: type a simpler version of it.
 *
 * Keyboard: the parts are one toolbar (one tab stop) in reading order; arrows
 * move, Home/End jump, Enter or Space opens the box, Escape in the box closes
 * it and puts focus back on its part. Nothing here supplies a result.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import MathDisplay from '../../../MathDisplay';
import MathInput from '../../../MathInput';
import {
  PART_KIND_LABELS,
  SIMPLIFY_PART_KINDS,
  checkRegionRewrite,
  commitSimplifyPart,
  partNeedsAnswer,
  partNeedsSigns,
  partPromptLatex,
  simplifyMessage,
} from './simplifyEngine.js';
import {
  chooseSimplifyPart,
  chooseSimplifyRegion,
  clearSimplifyPart,
  partsToolbarKeyAction,
  setSimplifyAnswer,
  setSimplifyRegionAnswer,
  setSimplifySign,
} from './simplifyState.js';
import { spokenMathLabel } from '../../language/mathSpeechLabel.js';
import './SimplifyPanel.css';

const chipStyle = (active) => ({
  minHeight: 44,
  minWidth: 44,
  padding: '4px 10px',
  borderRadius: 10,
  border: active ? '2px solid #174ea6' : '2px dashed var(--mm-primary-border)',
  background: active ? 'var(--mm-primary-soft)' : 'var(--mm-surface)',
  color: 'var(--mm-text-strong)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  cursor: 'pointer',
  fontSize: 'calc(17 * var(--mm-px))',
});

const kindTagStyle = {
  fontSize: 'calc(11 * var(--mm-px))',
  fontWeight: 800,
  color: 'var(--mm-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

const signButtonStyle = (chosen) => ({
  minWidth: 44,
  minHeight: 44,
  borderRadius: 10,
  border: chosen ? '2px solid #174ea6' : '1px solid var(--mm-tint-border)',
  background: chosen ? 'var(--mm-primary-soft)' : 'var(--mm-surface)',
  color: 'var(--mm-text-strong)',
  fontWeight: 900,
  fontSize: 'calc(18 * var(--mm-px))',
});

export default function SimplifyPanel({
  regions,
  parts,
  state,
  update,
  onCommit,
  notify,
  onClose,
  disabled = false,
  busy = false,
  contextSymbols,
  collapseSignal,
  // The board shows the highlights; without inline tools only this panel does.
  boardHighlights = true,
  idPrefix = 'mm-simplify',
  // Which server step kinds a committed part reports (simplifyStepFor).
  host = 'equation',
  // Bumped by the host when the student opens Simplify: focus moves to the
  // first part (or to Close when there is none). Never on a restored draft.
  focusSignal = 0,
  onFocusConsumed = null,
  // How a typed whole region is read and compared, when the host reads
  // expressions its own way (checkRegionRewrite's `read` / `equivalent`).
  regionCheck = null,
}) {
  const chipRefs = useRef(new Map());
  const typedRef = useRef(null);
  const regionTypedRef = useRef(null);
  const actionRef = useRef(null);
  const firstSignRef = useRef(null);
  const [rovingIndex, setRovingIndex] = useState(0);
  const [answerFocus, setAnswerFocus] = useState(0);
  const [regionFocus, setRegionFocus] = useState(0);
  const part = useMemo(() => parts.find((entry) => entry.id === state?.partId) || null, [parts, state?.partId]);
  const region = regions.find((entry) => entry.key === state?.region) || null;

  useEffect(() => { typedRef.current = null; }, [state?.answer]);
  useEffect(() => { regionTypedRef.current = null; }, [state?.regionAnswer]);
  useEffect(() => {
    if (rovingIndex >= parts.length) setRovingIndex(Math.max(0, parts.length - 1));
  }, [parts.length, rovingIndex]);
  // Choosing a part (by tap or key) moves focus into its box — never a part
  // that was already chosen when the panel appeared (a restored draft, or the
  // panel coming back after a balanced move): nothing moves focus by itself.
  const chosenAtMount = useRef(part?.id || null);
  useEffect(() => {
    if (!part) return;
    if (chosenAtMount.current && chosenAtMount.current === part.id) {
      chosenAtMount.current = null;
      return;
    }
    chosenAtMount.current = null;
    const index = parts.findIndex((entry) => entry.id === part.id);
    if (index >= 0) setRovingIndex(index);
    if (partNeedsSigns(part)) window.requestAnimationFrame(() => firstSignRef.current?.focus());
    else if (partNeedsAnswer(part)) setAnswerFocus((signal) => signal + 1);
    else window.requestAnimationFrame(() => actionRef.current?.focus());
  }, [part?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeRef = useRef(null);
  // A focus request is consumed once (the host clears it), so the panel
  // coming back after a balanced move never takes focus by itself.
  useEffect(() => {
    if (!focusSignal) return;
    onFocusConsumed?.();
    window.requestAnimationFrame(() => {
      const first = parts[0] ? chipRefs.current.get(parts[0].id) : null;
      (first || closeRef.current)?.focus();
    });
  }, [focusSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // After a commit the board changes and so do its parts. Focus goes to the
  // first part that is left, or to Close when there is nothing left to
  // compute, so a keyboard user carries straight on.
  const refocusAfterCommit = useRef(false);
  useEffect(() => {
    if (!refocusAfterCommit.current) return;
    refocusAfterCommit.current = false;
    window.requestAnimationFrame(() => {
      const first = parts[0] ? chipRefs.current.get(parts[0].id) : null;
      setRovingIndex(0);
      (first || closeRef.current)?.focus();
    });
  }, [parts]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusChip = (partId) => {
    window.requestAnimationFrame(() => chipRefs.current.get(partId)?.focus());
  };

  const closeBox = () => {
    const returnTo = part?.id;
    update((current) => clearSimplifyPart(current));
    if (returnTo) focusChip(returnTo);
  };

  const commitPart = async () => {
    if (!part || disabled || busy) return;
    const work = {
      answer: typedRef.current == null ? state.answer : typedRef.current,
      signs: state.signs,
    };
    const result = commitSimplifyPart(regions, part.id, work, { host });
    if (!result.ok) {
      notify?.({ tone: 'growth', text: simplifyMessage(result.reason) });
      if (partNeedsAnswer(part) && !partNeedsSigns(part)) setAnswerFocus((signal) => signal + 1);
      return;
    }
    // Armed before the commit: the host re-renders the new parts while it is
    // still awaiting the save, and the refocus must already be waiting.
    refocusAfterCommit.current = true;
    if (!(await onCommit?.(result))) refocusAfterCommit.current = false;
  };

  const commitRegion = async () => {
    if (!region || disabled || busy) return;
    const answer = regionTypedRef.current == null ? state.regionAnswer : regionTypedRef.current;
    const result = checkRegionRewrite(region, answer, regionCheck || {});
    if (!result.ok) {
      notify?.({ tone: 'growth', text: simplifyMessage(result.reason) });
      setRegionFocus((signal) => signal + 1);
      return;
    }
    refocusAfterCommit.current = true;
    const committed = await onCommit?.({
      ok: true,
      region: region.key,
      expression: result.expression,
      part: null,
      step: {
        kind: 'student-rewrite',
        description: `Simplified the ${region.label}`,
        parts: [`Simplified the ${region.label}`],
      },
    });
    if (!committed) refocusAfterCommit.current = false;
  };

  const onToolbarKeyDown = (event) => {
    const action = partsToolbarKeyAction(event.key, rovingIndex, parts.length);
    if (!action) return;
    event.preventDefault();
    if (action.type === 'close') { onClose?.(); return; }
    if (action.type === 'move') {
      setRovingIndex(action.index);
      chipRefs.current.get(parts[action.index].id)?.focus();
      return;
    }
    const chosen = parts[action.index];
    if (chosen) update((current) => chooseSimplifyPart(current, chosen.id));
  };

  // Enter checks (MathInput's onSubmit). A held-down Enter must not send the
  // same check again and again, so a repeated Enter is swallowed here, in the
  // capture phase, before the field sees it.
  const swallowRepeatedEnter = (event) => {
    if (event.key !== 'Enter' || !event.repeat) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const onBoxKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    closeBox();
  };

  const boxId = `${idPrefix}-box`;

  return (
    <div className="mm-simplify-panel" data-simplify-panel="open">
      <div className="mm-simplify-panel-head">
        <strong>Simplify</strong>
        <span className="mm-simplify-panel-help">
          {parts.length
            ? (boardHighlights
              ? 'Choose a highlighted part, then type its simplified form.'
              : 'Choose a part, then type its simplified form.')
            : 'There is no part to compute right now. You can still type a simpler version of a whole side.'}
        </span>
        <button ref={closeRef} type="button" className="mm-simplify-close" onClick={onClose} aria-label="Close Simplify" title="Close">×</button>
      </div>

      {parts.length > 0 && (
        <div
          role="toolbar"
          aria-label="Parts you can simplify"
          aria-orientation="horizontal"
          className="mm-simplify-parts"
          onKeyDown={onToolbarKeyDown}
        >
          {parts.map((entry, index) => {
            const chosen = entry.id === part?.id;
            return (
              <button
                key={entry.id}
                ref={(element) => {
                  if (element) chipRefs.current.set(entry.id, element);
                  else chipRefs.current.delete(entry.id);
                }}
                type="button"
                className={`mm-simplify-part${chosen ? ' is-chosen' : ''}`}
                data-simplify-part={entry.kind}
                data-part-id={entry.id}
                tabIndex={index === rovingIndex ? 0 : -1}
                aria-label={`${entry.name}, ${entry.regionLabel}`}
                aria-pressed={chosen}
                aria-controls={chosen ? boxId : undefined}
                disabled={disabled}
                onFocus={() => setRovingIndex(index)}
                onClick={() => update((current) => chooseSimplifyPart(current, entry.id))}
                style={chipStyle(chosen)}
              >
                <span aria-hidden="true" style={kindTagStyle}>{PART_KIND_LABELS[entry.kind]}</span>
                <MathDisplay value={entry.latex} format="latex" inline ariaLabel={entry.name} />
              </button>
            );
          })}
        </div>
      )}

      {part && (
        <div
          id={boxId}
          role="group"
          aria-label={`Simplify ${part.name}`}
          className="mm-simplify-box"
          data-simplify-box={part.kind}
          onKeyDown={onBoxKeyDown}
          onKeyDownCapture={swallowRepeatedEnter}
        >
          {partNeedsSigns(part) ? (
            <>
              <span className="mm-simplify-box-prompt">
                Remove the parentheses: choose the sign of each term.
              </span>
              <div className="mm-simplify-signs">
                {part.innerTerms.map((entry, index) => {
                  const chosen = state.signs?.[index];
                  const termLabel = spokenMathLabel(entry.magnitude);
                  return (
                    <div key={`${index}-${entry.magnitude}`} role="group" aria-label={`Sign of ${termLabel}`} className="mm-simplify-sign-group" data-sign-inside={entry.sign < 0 ? '-' : '+'}>
                      {[[1, '+', 'plus'], [-1, '−', 'minus']].map(([sign, symbol, word]) => (
                        <button
                          key={word}
                          ref={index === 0 && sign === 1 ? firstSignRef : undefined}
                          type="button"
                          aria-pressed={chosen === sign}
                          aria-label={`${word} ${termLabel}`}
                          onClick={() => update((current) => setSimplifySign(current, index, sign, part.innerTerms.length))}
                          disabled={disabled || busy}
                          style={signButtonStyle(chosen === sign)}
                        >
                          {symbol}
                        </button>
                      ))}
                      <MathDisplay value={entry.latex} format="latex" inline />
                    </div>
                  );
                })}
              </div>
              <div className="mm-simplify-box-actions">
                <button type="button" className="algebra-inline-commit" onClick={commitPart} disabled={disabled || busy}>Check</button>
                <button type="button" className="algebra-inline-clear" onClick={closeBox}>Cancel</button>
              </div>
            </>
          ) : partNeedsAnswer(part) ? (
            <>
              <MathDisplay value={partPromptLatex(part)} format="latex" inline ariaLabel={part.name} style={{ fontSize: 'calc(18 * var(--mm-px))' }} />
              <MathInput
                value={state.answer || ''}
                onChange={(value) => {
                  typedRef.current = value;
                  update((current) => setSimplifyAnswer(current, value));
                }}
                onSubmit={commitPart}
                placeholder={part.kind === SIMPLIFY_PART_KINDS.LIKE_TERMS ? 'one term' : 'simplified'}
                ariaLabel={`Simplified form of ${part.name}. Press Enter to check.`}
                toolProfile="algebra-operation"
                compact
                maxWidth={220}
                focusSignal={answerFocus}
                contextSymbols={contextSymbols}
                collapseSignal={collapseSignal}
              />
              <div className="mm-simplify-box-actions">
                <button type="button" className="algebra-inline-commit" onClick={commitPart} disabled={disabled || busy}>Check</button>
                <button type="button" className="algebra-inline-clear" onClick={closeBox}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <span className="mm-simplify-box-prompt">
                {part.kind === SIMPLIFY_PART_KINDS.PARENTHESES
                  ? 'A plus sign in front: every term inside keeps its own sign.'
                  : 'Multiplying or dividing by 1 changes nothing.'}
              </span>
              <div className="mm-simplify-box-actions">
                <button ref={actionRef} type="button" className="algebra-inline-commit" onClick={commitPart} disabled={disabled || busy}>
                  {part.kind === SIMPLIFY_PART_KINDS.PARENTHESES ? 'Remove parentheses' : 'Remove the 1'}
                </button>
                <button type="button" className="algebra-inline-clear" onClick={closeBox}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="mm-simplify-side" role="group" aria-label="Type a simpler version of a whole side">
        <span className="mm-simplify-side-label">Or type a simpler version of</span>
        {regions.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className="mm-simplify-side-choice"
            aria-pressed={state?.region === entry.key}
            onClick={() => {
              update((current) => chooseSimplifyRegion(current, entry.key));
              setRegionFocus((signal) => signal + 1);
            }}
            disabled={disabled}
          >
            {`the ${entry.label}`}
          </button>
        ))}
        {region && (
          <span className="mm-simplify-side-entry" onKeyDownCapture={swallowRepeatedEnter}>
            <MathInput
              value={state.regionAnswer || ''}
              onChange={(value) => {
                regionTypedRef.current = value;
                update((current) => setSimplifyRegionAnswer(current, value));
              }}
              onSubmit={commitRegion}
              placeholder={`Simpler ${region.label}`}
              ariaLabel={`A simpler version of the ${region.label}. Press Enter to check.`}
              toolProfile="algebra-operation"
              compact
              maxWidth={420}
              focusSignal={regionFocus}
              contextSymbols={contextSymbols}
              collapseSignal={collapseSignal}
            />
            <button type="button" className="algebra-inline-commit mm-simplify-side-check" onClick={commitRegion} disabled={disabled || busy}>Check</button>
          </span>
        )}
      </div>
      <p className="mm-simplify-note">MathMaster checks your work; it never writes the result for you.</p>
    </div>
  );
}

/*
 * THE STRUCTURE TOOLS, ON THE EQUATION ITSELF.
 *
 * Presentation for Factor, Split fraction, Cancel factors, Simplify arithmetic
 * and Arrange terms. Every decision is made on the committed equation: terms
 * become tokens in place (the same inline-term architecture Distribute, Rewrite
 * and Combine like terms use), and only the few answer boxes a step needs sit
 * directly under that side. The algebra lives in the pure models; this file
 * only draws their state and turns taps, drags and keys into their actions.
 */
import { useEffect, useRef, useState } from 'react';
import MathDisplay from './MathDisplay';
import MathInput from './MathInput';
import AlgebraTermRow from './AlgebraTermRow';
import { expressionToLatex, splitAdditiveTerms } from './algebraAstEngine';
import {
  FACTOR_QUOTIENT_MESSAGES,
  FACTOR_REFUSAL_MESSAGES,
  FACTOR_TOOL,
  checkFactorQuotients,
  describeCommonFactorChoice,
  detectFactorableLists,
  exposeFactorTokens,
  factorTokensForTerm,
  findFactorableList,
  pullOutCommonFactor,
  setFactorQuotient,
  toggleFactorTerm,
  toggleFactorToken,
  toggleNegativeFactor,
} from './algebraFactoringModel';
import {
  SPLIT_TOOL,
  armSplitDenominator,
  chooseSplitFraction,
  detectSplittableFractions,
  findSplittableFraction,
  isSplitComplete,
  placeSplitDenominator,
} from './algebraFractionSplitModel';
import {
  REDUCE_TOOL,
  chooseReductionFraction,
  detectReducibleFractions,
  findReducibleFraction,
  tapReductionToken,
} from './algebraFractionReductionModel';
import {
  ARITHMETIC_MESSAGES,
  ARITHMETIC_TOOL,
  checkArithmeticAnswer,
  chooseArithmeticProduct,
  detectArithmeticProducts,
  findArithmeticProduct,
  setArithmeticAnswer,
} from './algebraArithmeticModel';
import {
  ARRANGE_TOOL,
  arrangedTerms,
  arrangementChanged,
  tapArrangeTerm,
} from './algebraArrangeTermsModel';
import { factoringOptionsFor } from './algebraStructureTools';

const COMMON_FACTOR_DRAG = 'mathmaster-common-factor';
const SPLIT_DENOMINATOR_DRAG = 'mathmaster-split-denominator';

const safeLatex = (text) => {
  try { return expressionToLatex(text); } catch { return String(text ?? ''); }
};

// A term shown at `position` in a row: the first term carries only its own
// sign; every later term carries its operator.
const positionedTerm = (term, position) => {
  const sign = term.sign < 0 ? '-' : '';
  return {
    ...term,
    text: position === 0 ? `${sign}${term.magnitudeText}` : `${term.sign < 0 ? '-' : '+'} ${term.magnitudeText}`,
    latex: position === 0 ? `${sign}${term.magnitudeLatex}` : `${term.sign < 0 ? '-' : '+'} ${term.magnitudeLatex}`,
  };
};

const Times = () => <span className="algebra-structure-times" aria-hidden="true">×</span>;

function PlainTerm({ term }) {
  return (
    <span className="algebra-inline-ordinary-term">
      <MathDisplay value={term.latex} format="latex" inline style={{ fontSize: 'inherit' }} ariaLabel={term.text} />
    </span>
  );
}

// --- Factor -------------------------------------------------------------------------

function FactorTokenGroup({ termText, tokens, chosen = [], pulled = false, onToken, disabled }) {
  return (
    <span className={`algebra-structure-token-group${pulled ? ' is-pulled-phase' : ''}`} role="group" aria-label={`${termText} written as factors`}>
      {tokens.map((token, index) => {
        const isChosen = chosen.includes(index);
        const key = `${index}-${token.key}`;
        return (
          <span key={key} className="algebra-structure-token-slot">
            {index > 0 ? <Times /> : null}
            {token.selectable && !pulled ? (
              <button
                type="button"
                className={`algebra-structure-token${isChosen ? ' is-chosen' : ''}`}
                aria-pressed={isChosen}
                aria-label={`Factor ${token.latex} of ${termText}${isChosen ? ', chosen as common' : ''}`}
                onClick={() => onToken?.(index)}
                disabled={disabled}
              >
                <MathDisplay value={token.latex} format="latex" inline style={{ fontSize: 'inherit' }} />
              </button>
            ) : (
              <span
                className={`algebra-structure-token is-static${token.kind === 'sign' ? ' is-sign' : ''}${pulled && isChosen ? ' is-pulled' : ''}`}
                aria-label={token.kind === 'sign' ? `negative one, the sign of ${termText}` : `Factor ${token.latex}${pulled && isChosen ? ', pulled out' : ''}`}
              >
                <MathDisplay value={token.latex} format="latex" inline style={{ fontSize: 'inherit' }} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function FactorSide({ tool, equation, side, update, notify, disabled }) {
  const options = factoringOptionsFor(equation);
  const lists = detectFactorableLists(equation, options).filter((list) => list.side === side);
  const activeList = tool.listId ? findFactorableList(equation, tool.listId, options) : null;
  if (activeList && activeList.side !== side) return null;
  const list = activeList || lists.find((entry) => entry.scope === 'side') || lists[0];
  if (!list) return null;

  const selectTerm = (termIndex) => {
    const result = toggleFactorTerm(tool, equation, list.id, termIndex, options);
    if (!result.ok) notify({ tone: 'growth', text: FACTOR_REFUSAL_MESSAGES[result.reason] || FACTOR_REFUSAL_MESSAGES.phase });
    else update(() => result.state);
  };
  const chooseToken = (termIndex, tokenIndex) => {
    const result = toggleFactorToken(tool, equation, termIndex, tokenIndex, options);
    if (!result.ok) notify({ tone: 'growth', text: FACTOR_REFUSAL_MESSAGES[result.reason] || FACTOR_REFUSAL_MESSAGES.phase });
    else update(() => result.state);
  };

  const listRow = () => {
    if (tool.phase === 'terms' || tool.listId !== list.id) {
      return (
        <AlgebraTermRow
          terms={list.terms}
          side={side}
          selectedIndices={tool.listId === list.id ? tool.selected : []}
          onTermClick={selectTerm}
          interactionLabel="select as a term to factor"
        />
      );
    }
    return (
      <span className="algebra-inline-distribution-expression">
        {list.terms.map((term, index) => {
          const selected = tool.selected.includes(index);
          if (!selected) return <PlainTerm key={`plain-${index}`} term={positionedTerm(term, index)} />;
          const tokens = factorTokensForTerm(term.signedText) || [];
          const firstSelected = tool.selected[0] === index && index === 0;
          return (
            <span key={`tokens-${index}`} className="algebra-inline-distribution-group">
              {firstSelected ? null : <span aria-hidden="true">+</span>}
              <FactorTokenGroup
                termText={positionedTerm(term, 0).text}
                tokens={tokens}
                chosen={tool.chosen?.[index] || []}
                pulled={tool.phase === 'quotients'}
                onToken={(tokenIndex) => chooseToken(index, tokenIndex)}
                disabled={disabled}
              />
            </span>
          );
        })}
      </span>
    );
  };

  if (list.scope === 'side') return listRow();

  // A grouped sum inside a product: 3( 5x - 15 ). The rest of the side stays put.
  const sideTerms = splitAdditiveTerms(equation[side]) || [];
  return (
    <span className="algebra-inline-distribution-expression">
      {sideTerms.map((sideTerm, sideTermIndex) => {
        if (sideTermIndex !== list.sideTermIndex) return <PlainTerm key={`side-${sideTermIndex}`} term={sideTerm} />;
        const outsideLatex = (list.outsideFactors || []).map(safeLatex).map((latex) => (/[+-]/.test(latex.replace(/^-/, '')) ? `\\left(${latex}\\right)` : latex)).join('');
        return (
          <span key={`group-${sideTermIndex}`} className="algebra-inline-distribution-group">
            {sideTerm.sign < 0 ? <span aria-hidden="true">−</span> : sideTermIndex > 0 ? <span aria-hidden="true">+</span> : null}
            <MathDisplay value={outsideLatex} format="latex" inline style={{ fontSize: 'inherit' }} />
            <span aria-hidden="true">(</span>
            {listRow()}
            <span aria-hidden="true">)</span>
          </span>
        );
      })}
    </span>
  );
}

function FactorControls({ tool, equation, side, update, notify, onCommit, disabled, busy, contextSymbols, collapseSignal }) {
  const options = factoringOptionsFor(equation);
  const list = tool.listId ? findFactorableList(equation, tool.listId, options) : null;
  const firstSide = detectFactorableLists(equation, options)[0]?.side;
  const [focusSignals, setFocusSignals] = useState({});
  // What the student has typed, as of the last keystroke. Enter can arrive
  // before React re-renders with that keystroke, so the check reads this.
  const typedRef = useRef({});
  // Once the tool itself holds the answers (a render, or an Undo), it is the
  // source of truth again.
  useEffect(() => { typedRef.current = {}; }, [tool.quotients]);
  const phase = tool.phase;

  useEffect(() => {
    if (phase !== 'quotients' || !tool.selected?.length) return;
    // The remaining-factor boxes appear as a consequence of pulling the factor
    // out; put the caret in the first one so the next action is typing.
    setFocusSignals((current) => ({ ...current, [tool.selected[0]]: (current[tool.selected[0]] || 0) + 1 }));
  }, [phase, tool.selected]);

  if ((list ? list.side : firstSide) !== side) return null;

  if (phase === 'terms') {
    const ready = tool.selected.length >= 2;
    return (
      <div className="algebra-inline-mode-controls algebra-structure-controls" aria-live="polite">
        <span className="algebra-inline-mode-status">{ready ? `${tool.selected.length} terms selected` : 'Tap the terms you are factoring'}</span>
        <button
          type="button"
          className="algebra-inline-commit"
          disabled={disabled || !ready}
          onClick={() => {
            const result = exposeFactorTokens(tool, equation, options);
            if (!result.ok) notify({ tone: 'growth', text: FACTOR_REFUSAL_MESSAGES[result.reason] });
            else update(() => result.state);
          }}
        >
          Factor to primes
        </button>
      </div>
    );
  }

  if (!list) return null;
  const termLabel = (termIndex) => positionedTerm(list.terms[termIndex], 0).text.replace(/\s+/g, '');

  if (phase === 'factor') {
    const choice = describeCommonFactorChoice(tool, list);
    const pull = () => {
      const result = pullOutCommonFactor(tool, equation, options);
      if (result.ok) { update(() => result.state); return; }
      const mismatch = result.mismatch;
      notify({
        tone: 'growth',
        text: result.reason === 'unmatched' && mismatch
          ? `Choose a matching ${mismatch.value} in ${termLabel(mismatch.termIndex)} too, or unselect it.`
          : result.reason === 'notCommon' && mismatch
            ? `${termLabel(mismatch.termIndex)} has no ${mismatch.value} to pull out, so it is not common to every term.`
            : FACTOR_REFUSAL_MESSAGES[result.reason] || FACTOR_REFUSAL_MESSAGES.notDivisible,
      });
    };
    return (
      <div className="algebra-inline-mode-controls algebra-structure-controls" aria-live="polite">
        <div
          className="algebra-structure-gcf"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (event.dataTransfer?.getData('text/plain') === COMMON_FACTOR_DRAG) pull();
          }}
        >
          <span className="algebra-inline-mode-status">Common factor</span>
          {choice.productLatex ? (
            <span
              className="algebra-structure-chip"
              draggable={choice.ready && !disabled}
              onDragStart={(event) => {
                event.dataTransfer?.setData('text/plain', COMMON_FACTOR_DRAG);
                if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
              }}
              title="Drag out front, or press Pull out"
            >
              <MathDisplay
                value={choice.productLatex === choice.factorLatex || !choice.factorLatex ? choice.productLatex : `${choice.productLatex} = ${choice.factorLatex}`}
                format="latex"
                inline
              />
            </span>
          ) : <span className="algebra-inline-mode-feedback">Tap the factors every selected term shares</span>}
          <span className="algebra-structure-outside-slot" aria-hidden="true">
            <span className="algebra-structure-outside-box" />(…)
          </span>
        </div>
        {choice.mismatch ? (
          <span className="algebra-inline-mode-feedback">
            {choice.mismatch.unavailable
              ? `${termLabel(choice.mismatch.termIndex)} has no ${choice.mismatch.value}.`
              : `Choose ${choice.mismatch.value} in ${termLabel(choice.mismatch.termIndex)} too.`}
          </span>
        ) : null}
        <button type="button" className="algebra-inline-clear" aria-pressed={Boolean(tool.negate)} onClick={() => { const result = toggleNegativeFactor(tool); if (result.ok) update(() => result.state); }} disabled={disabled}>
          {tool.negate ? '✓ Pulling out a negative' : 'Pull out a negative'}
        </button>
        <button type="button" className="algebra-inline-commit" disabled={disabled || !choice.ready} onClick={pull}>
          {choice.ready ? <>Pull out <MathDisplay value={choice.factorLatex} format="latex" inline /></> : 'Pull out'}
        </button>
      </div>
    );
  }

  // phase === 'quotients': the student writes what is left of each term.
  const check = () => {
    const current = { ...tool, quotients: { ...tool.quotients, ...typedRef.current } };
    const result = checkFactorQuotients(current, equation, options);
    const firstProblem = result.results.find((entry) => !entry.ok);
    if (!firstProblem) { onCommit(current); return; }
    setFocusSignals((current) => ({ ...current, [firstProblem.termIndex]: (current[firstProblem.termIndex] || 0) + 1 }));
    notify({ tone: 'growth', text: `${termLabel(firstProblem.termIndex)}: ${FACTOR_QUOTIENT_MESSAGES[firstProblem.reason] || FACTOR_QUOTIENT_MESSAGES.wrong}` });
  };
  return (
    <div className="algebra-inline-mode-controls algebra-structure-controls algebra-structure-quotients" aria-live="polite">
      <span className="algebra-inline-mode-status">What is left of each term?</span>
      {tool.selected.map((termIndex, position) => (
        <span key={termIndex} className="algebra-structure-quotient">
          <MathDisplay
            value={`\\frac{${list.terms[termIndex].sign < 0 ? '-' : ''}${list.terms[termIndex].magnitudeLatex}}{${tool.pulled.latex}}`}
            format="latex"
            inline
            style={{ fontSize: 19 }}
            ariaLabel={`${termLabel(termIndex)} divided by ${tool.pulled.text}`}
          />
          <span aria-hidden="true" className="algebra-structure-equals">=</span>
          <MathInput
            value={tool.quotients?.[termIndex] || ''}
            onChange={(value) => {
              typedRef.current = { ...typedRef.current, [termIndex]: value };
              update((current) => setFactorQuotient(current, termIndex, value));
            }}
            onSubmit={() => {
              const next = tool.selected[position + 1];
              if (next != null) setFocusSignals((current) => ({ ...current, [next]: (current[next] || 0) + 1 }));
              else check();
            }}
            placeholder="what is left"
            ariaLabel={`What is left of ${termLabel(termIndex)} after pulling out ${tool.pulled.text}`}
            toolProfile="algebra-operation"
            compact
            maxWidth={220}
            focusSignal={focusSignals[termIndex] || 0}
            contextSymbols={contextSymbols}
            collapseSignal={collapseSignal}
          />
        </span>
      ))}
      <button type="button" className="algebra-inline-commit" onClick={check} disabled={disabled || busy}>Check factoring</button>
    </div>
  );
}

// --- Split fraction ----------------------------------------------------------------

function SplitSide({ tool, equation, side, update, notify, disabled }) {
  const candidates = detectSplittableFractions(equation).filter((candidate) => candidate.side === side);
  if (!candidates.length) return null;
  const sideTerms = splitAdditiveTerms(equation[side]) || [];
  const active = tool.candidateId ? findSplittableFraction(equation, tool.candidateId) : null;
  if (!active || active.side !== side) {
    const candidateIndexes = candidates.map((candidate) => candidate.sideTermIndex);
    return (
      <AlgebraTermRow
        terms={sideTerms}
        side={side}
        onTermClick={(index) => {
          const candidate = candidates.find((entry) => entry.sideTermIndex === index);
          if (!candidate) notify({ tone: 'growth', text: 'Choose a fraction whose numerator has more than one term.' });
          else update((current) => chooseSplitFraction(current, equation, candidate.id));
        }}
        candidateIndices={candidateIndexes}
        interactionLabel="select to split"
      />
    );
  }
  const complete = isSplitComplete(tool, active);
  const place = (index) => {
    if (!tool.armed) { notify({ tone: 'growth', text: 'Pick up the denominator first, then place it under a numerator term.' }); return; }
    update((current) => placeSplitDenominator(current, equation, index));
  };
  return (
    <span className="algebra-inline-distribution-expression">
      {sideTerms.map((sideTerm, sideTermIndex) => {
        if (sideTermIndex !== active.sideTermIndex) return <PlainTerm key={`plain-${sideTermIndex}`} term={sideTerm} />;
        return (
          <span key={`split-${sideTermIndex}`} className="algebra-inline-distribution-group">
            {sideTerm.sign < 0 ? <span aria-hidden="true">−</span> : sideTermIndex > 0 ? <span aria-hidden="true">+</span> : null}
            <span className="algebra-structure-fraction" role="group" aria-label="Fraction being split">
              <span className="algebra-structure-fraction-row">
                {active.numeratorTerms.map((term, index) => {
                  const placed = tool.placed.includes(index);
                  const shown = positionedTerm(term, index);
                  return (
                    <button
                      key={`${index}-${term.text}`}
                      type="button"
                      className={`algebra-inline-distribution-target${placed ? ' is-placed' : ''}${tool.armed && !placed ? ' is-ready' : ''}`}
                      onClick={() => place(index)}
                      onDragOver={(event) => { if (!placed) event.preventDefault(); }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (!placed && event.dataTransfer?.getData('text/plain') === SPLIT_DENOMINATOR_DRAG) {
                          update((current) => placeSplitDenominator(armSplitDenominator(current, equation), equation, index));
                        }
                      }}
                      disabled={disabled || placed}
                      aria-pressed={placed}
                      aria-label={placed ? `${shown.text} now over its own denominator` : `Place the denominator under ${shown.text}`}
                    >
                      <MathDisplay
                        value={placed
                          ? `${index > 0 ? (term.sign < 0 ? '-' : '+') : (term.sign < 0 ? '-' : '')}\\frac{${term.magnitudeLatex}}{${active.denominatorLatex}}`
                          : shown.latex}
                        format="latex"
                        inline
                        style={{ fontSize: 'inherit' }}
                      />
                    </button>
                  );
                })}
              </span>
              {complete ? null : (
                <>
                  <span className="algebra-structure-fraction-bar" aria-hidden="true" />
                  <button
                    type="button"
                    className={`algebra-inline-factor-token${tool.armed ? ' is-armed' : ''}`}
                    draggable={!disabled}
                    onClick={() => update((current) => armSplitDenominator(current, equation))}
                    onDragStart={(event) => {
                      event.dataTransfer?.setData('text/plain', SPLIT_DENOMINATOR_DRAG);
                      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
                    }}
                    disabled={disabled}
                    aria-pressed={tool.armed}
                    aria-label={`Pick up the denominator ${active.denominatorText}`}
                  >
                    <MathDisplay value={active.denominatorLatex} format="latex" inline />
                  </button>
                </>
              )}
            </span>
          </span>
        );
      })}
    </span>
  );
}

function SplitControls({ tool, equation, side, onCommit, disabled, busy }) {
  const active = tool.candidateId ? findSplittableFraction(equation, tool.candidateId) : null;
  const commitRef = useRef(null);
  const complete = isSplitComplete(tool, active);
  useEffect(() => { if (complete) commitRef.current?.focus?.(); }, [complete]);
  const candidates = detectSplittableFractions(equation);
  if (!active) {
    return candidates[0]?.side === side ? (
      <div className="algebra-inline-mode-controls algebra-structure-controls"><span className="algebra-inline-mode-status">Tap the fraction to split</span></div>
    ) : null;
  }
  if (active.side !== side) return null;
  return (
    <div className="algebra-inline-mode-controls algebra-structure-controls" aria-live="polite">
      <span className="algebra-inline-mode-status">
        {complete ? 'Every numerator term has the denominator' : `Denominator placed ${tool.placed.length}/${active.numeratorTerms.length}`}
      </span>
      {complete ? (
        <button ref={commitRef} type="button" className="algebra-inline-commit" onClick={() => onCommit()} disabled={disabled || busy}>Commit split</button>
      ) : null}
    </div>
  );
}

// --- Cancel factors -------------------------------------------------------------------

function ReductionTokenRow({ tokens, row, tool, onTap, disabled }) {
  return (
    <span className="algebra-structure-fraction-row">
      {tokens.map((token, index) => {
        const paired = (tool.pairs || []).some((pair) => pair[row] === index);
        const held = tool.pending?.row === row && tool.pending.index === index;
        const key = `${row}-${index}`;
        return (
          <span key={key} className="algebra-structure-token-slot">
            {index > 0 ? <Times /> : null}
            {token.selectable ? (
              <button
                type="button"
                className={`algebra-structure-token${held ? ' is-chosen' : ''}${paired ? ' is-paired' : ''}`}
                onClick={() => onTap(row, index)}
                disabled={disabled || paired}
                aria-pressed={held || paired}
                aria-label={`${row === 'numerator' ? 'Numerator' : 'Denominator'} factor ${token.latex}${paired ? ', cancelled' : held ? ', held' : ''}`}
              >
                <MathDisplay value={token.latex} format="latex" inline style={{ fontSize: 'inherit' }} />
              </button>
            ) : (
              <span className="algebra-structure-token is-static" aria-label={`Factor ${token.latex}`}>
                <MathDisplay value={token.latex} format="latex" inline style={{ fontSize: 'inherit' }} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function ReduceSide({ tool, equation, side, update, notify, disabled }) {
  const candidates = detectReducibleFractions(equation).filter((candidate) => candidate.side === side);
  const sideTerms = splitAdditiveTerms(equation[side]) || [];
  const active = tool.candidateId ? findReducibleFraction(equation, tool.candidateId) : null;
  if (!candidates.length && active?.side !== side) return null;
  if (!active || active.side !== side) {
    return (
      <AlgebraTermRow
        terms={sideTerms}
        side={side}
        candidateIndices={candidates.map((candidate) => candidate.sideTermIndex)}
        onTermClick={(index) => {
          const candidate = candidates.find((entry) => entry.sideTermIndex === index);
          if (!candidate) notify({ tone: 'growth', text: 'That term has no factor to cancel. Choose a highlighted fraction.' });
          else update((current) => chooseReductionFraction(current, equation, candidate.id));
        }}
        interactionLabel="select to write as prime factors"
      />
    );
  }
  const tap = (row, index) => {
    const result = tapReductionToken(tool, equation, row, index);
    if (result.outcome === 'mismatch') {
      notify({ tone: 'growth', text: `${result.held} and ${result.tapped} are not the same factor, so they do not cancel.` });
      return;
    }
    if (result.outcome === 'variable') {
      notify({ tone: 'growth', text: 'There is no matching variable below the bar to cancel with.' });
      return;
    }
    if (result.state !== tool) update(() => result.state);
  };
  return (
    <span className="algebra-inline-distribution-expression">
      {sideTerms.map((sideTerm, sideTermIndex) => {
        if (sideTermIndex !== active.sideTermIndex) return <PlainTerm key={`plain-${sideTermIndex}`} term={sideTerm} />;
        return (
          <span key={`reduce-${sideTermIndex}`} className="algebra-inline-distribution-group">
            {sideTermIndex > 0 ? <span aria-hidden="true">+</span> : null}
            <span className="algebra-structure-fraction" role="group" aria-label="Fraction written as prime factors">
              <ReductionTokenRow tokens={active.tokens.numerator} row="numerator" tool={tool} onTap={tap} disabled={disabled} />
              <span className="algebra-structure-fraction-bar" aria-hidden="true" />
              <ReductionTokenRow tokens={active.tokens.denominator} row="denominator" tool={tool} onTap={tap} disabled={disabled} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

function ReduceControls({ tool, equation, side, onCommit, disabled, busy }) {
  const active = tool.candidateId ? findReducibleFraction(equation, tool.candidateId) : null;
  const candidates = detectReducibleFractions(equation);
  if (!active) {
    return candidates[0]?.side === side ? (
      <div className="algebra-inline-mode-controls algebra-structure-controls"><span className="algebra-inline-mode-status">Tap a highlighted fraction to write it as primes</span></div>
    ) : null;
  }
  if (active.side !== side) return null;
  const pairs = tool.pairs?.length || 0;
  return (
    <div className="algebra-inline-mode-controls algebra-structure-controls" aria-live="polite">
      <span className="algebra-inline-mode-status">
        {pairs ? `${pairs} pair${pairs === 1 ? '' : 's'} cancelled` : 'Tap a factor, then an equal factor across the bar'}
      </span>
      <button type="button" className="algebra-inline-commit" onClick={() => onCommit()} disabled={disabled || busy || !pairs}>Apply cancellation</button>
    </div>
  );
}

// --- Simplify arithmetic -----------------------------------------------------------------

function ArithmeticSide({ tool, equation, side, update, notify }) {
  const candidates = detectArithmeticProducts(equation).filter((candidate) => candidate.side === side);
  if (!candidates.length) return null;
  const active = tool.candidateId ? findArithmeticProduct(equation, tool.candidateId) : null;
  return (
    <AlgebraTermRow
      terms={splitAdditiveTerms(equation[side]) || []}
      side={side}
      selectedIndices={active?.side === side ? [active.sideTermIndex] : []}
      candidateIndices={active ? [] : candidates.map((candidate) => candidate.sideTermIndex)}
      onTermClick={(index) => {
        const candidate = candidates.find((entry) => entry.sideTermIndex === index);
        if (!candidate) notify({ tone: 'growth', text: 'That term has no numbers to multiply together.' });
        else update((current) => chooseArithmeticProduct(current, equation, candidate.id));
      }}
      interactionLabel="select to multiply its numbers"
    />
  );
}

function ArithmeticControls({ tool, equation, side, update, notify, onCommit, disabled, busy, contextSymbols, collapseSignal }) {
  const active = tool.candidateId ? findArithmeticProduct(equation, tool.candidateId) : null;
  const [focusSignal, setFocusSignal] = useState(0);
  const typedRef = useRef(null);
  useEffect(() => { typedRef.current = null; }, [tool.answer]);
  useEffect(() => { if (active) setFocusSignal((signal) => signal + 1); }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!active || active.side !== side) return null;
  const check = () => {
    const current = typedRef.current == null ? tool : { ...tool, answer: typedRef.current };
    const result = checkArithmeticAnswer(active, current.answer);
    if (result.ok) { onCommit(current); return; }
    setFocusSignal((signal) => signal + 1);
    notify({ tone: 'growth', text: ARITHMETIC_MESSAGES[result.reason] || ARITHMETIC_MESSAGES.wrong });
  };
  return (
    <div className="algebra-inline-mode-controls algebra-inline-editor algebra-structure-controls">
      <MathDisplay value={`${active.productLatex} =`} format="latex" inline style={{ fontSize: 18 }} ariaLabel="Multiply these numbers" />
      <MathInput
        value={tool.answer || ''}
        onChange={(value) => {
          typedRef.current = value;
          update((current) => setArithmeticAnswer(current, value));
        }}
        onSubmit={check}
        placeholder="product"
        ariaLabel="Enter the product of these numbers"
        toolProfile="algebra-operation"
        compact
        maxWidth={160}
        focusSignal={focusSignal}
        contextSymbols={contextSymbols}
        collapseSignal={collapseSignal}
      />
      <button type="button" className="algebra-inline-commit" onClick={check} disabled={disabled || busy}>Check</button>
    </div>
  );
}

// --- Arrange terms -----------------------------------------------------------------------

function ArrangeSide({ tool, equation, side, update }) {
  const count = (splitAdditiveTerms(equation[side]) || []).length;
  if (count < 2 || (tool.side && tool.side !== side)) {
    return count >= 2 ? (
      <AlgebraTermRow terms={splitAdditiveTerms(equation[side])} side={side} onTermClick={(index) => update((current) => tapArrangeTerm(current, equation, side, index))} interactionLabel="select to move" />
    ) : null;
  }
  const terms = (tool.side === side ? arrangedTerms(tool, equation) : splitAdditiveTerms(equation[side]) || [])
    .map((term, position) => positionedTerm(term, position));
  return (
    <AlgebraTermRow
      terms={terms}
      side={side}
      selectedIndices={tool.side === side && tool.selected != null ? [tool.selected] : []}
      onTermClick={(position) => update((current) => tapArrangeTerm(current, equation, side, position))}
      interactionLabel={tool.selected != null ? 'tap to swap with the selected term' : 'select to move'}
    />
  );
}

function ArrangeControls({ tool, side, onCommit, disabled, busy }) {
  if (!tool.side || tool.side !== side) return null;
  const changed = arrangementChanged(tool);
  return (
    <div className="algebra-inline-mode-controls algebra-structure-controls" aria-live="polite">
      <span className="algebra-inline-mode-status">{tool.selected != null ? 'Tap another term to swap' : 'Tap two terms to swap them'}</span>
      <button type="button" className="algebra-inline-commit" onClick={() => onCommit()} disabled={disabled || busy || !changed}>Keep this order</button>
    </div>
  );
}

// --- Entry points ----------------------------------------------------------------------------

const SIDE_RENDERERS = {
  [FACTOR_TOOL]: FactorSide,
  [SPLIT_TOOL]: SplitSide,
  [REDUCE_TOOL]: ReduceSide,
  [ARITHMETIC_TOOL]: ArithmeticSide,
  [ARRANGE_TOOL]: ArrangeSide,
};

const CONTROL_RENDERERS = {
  [FACTOR_TOOL]: FactorControls,
  [SPLIT_TOOL]: SplitControls,
  [REDUCE_TOOL]: ReduceControls,
  [ARITHMETIC_TOOL]: ArithmeticControls,
  [ARRANGE_TOOL]: ArrangeControls,
};

/** Does the open tool redraw this side? (Side renderers return null when not.) */
export function StructureToolSide(props) {
  const Renderer = SIDE_RENDERERS[props.tool?.kind];
  return Renderer ? <Renderer {...props} /> : null;
}

export const structureToolDrawsSide = (tool, equation, side) => {
  if (!tool || !equation) return false;
  if (tool.kind === FACTOR_TOOL) {
    const options = factoringOptionsFor(equation);
    const active = tool.listId ? findFactorableList(equation, tool.listId, options) : null;
    if (active) return active.side === side;
    return detectFactorableLists(equation, options).some((list) => list.side === side);
  }
  if (tool.kind === SPLIT_TOOL) {
    const active = tool.candidateId ? findSplittableFraction(equation, tool.candidateId) : null;
    return active ? active.side === side : detectSplittableFractions(equation).some((candidate) => candidate.side === side);
  }
  if (tool.kind === REDUCE_TOOL) {
    const active = tool.candidateId ? findReducibleFraction(equation, tool.candidateId) : null;
    return active ? active.side === side : detectReducibleFractions(equation).some((candidate) => candidate.side === side);
  }
  if (tool.kind === ARITHMETIC_TOOL) return detectArithmeticProducts(equation).some((candidate) => candidate.side === side);
  if (tool.kind === ARRANGE_TOOL) return (splitAdditiveTerms(equation[side]) || []).length >= 2;
  return false;
};

export function StructureToolControls(props) {
  const Renderer = CONTROL_RENDERERS[props.tool?.kind];
  return Renderer ? <Renderer {...props} /> : null;
}

/** A short signature of the visible tool state, so the equation re-fits when it changes. */
export const structureToolFitKey = (tool) => {
  if (!tool) return '';
  const { undoStack: _undoStack, lastActionKey: _lastActionKey, quotients: _quotients, answer: _answer, ...visible } = tool;
  return JSON.stringify(visible);
};

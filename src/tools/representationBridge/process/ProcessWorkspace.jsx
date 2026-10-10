import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChoiceChips, ProcessMessage, muted, primaryButton, quietButton, touchButton } from './processUi.jsx';
import { useModalDialog } from '../../../ui/Dialog.jsx';
import {
  ExtendTableMethod,
  FieldsMethod,
  GraphMethod,
  SolveForBMethod,
  TableDeltaMethod,
  TableRowMethod,
  TwoPointFormulaMethod,
} from './ProcessMethods.jsx';
import { SolveForYMethod, SubstituteZeroMethod } from './ProcessAlgebraMethods.jsx';
import {
  decideProcessCheck,
  fieldStatusFrom,
  optionKeyOf,
  selectedOption,
  withWork,
  workKeyOf,
} from './processDraft.js';
import {
  factDisplay,
  lmrFindLabel,
  lmrLaterMethods,
  lmrMethodsFor,
  slopeInterceptLatexOf,
} from '../lmrProcessMath.js';

/*
 * ONE PLACE TO DO MATHEMATICS ABOUT THE LINE.
 *
 * The student chose a fact to find ("Find the slope"); this is where they find
 * it. It opens on the board, under the GIVEN and the facts they know, so the
 * line they are working from stays in sight, and it offers only the methods
 * that make sense now — for this GIVEN, with what they have established —
 * never a menu of everything. Choosing a method shows that method's work and
 * nothing else; Check (or Save, where outcomes are withheld) asks the shared
 * marking, the function the server grades with. Back to board returns to
 * where they were.
 */

const isAlgebra = (strategy) => strategy === 'solveForY' || strategy === 'substituteZero';

// What the choice row says about each source of a method.
const sourceLabel = (option) => (option.source === 'given' ? 'Use the GIVEN' : option.label);

export default function ProcessWorkspace({
  question,
  process,
  target,
  preferredMethod = null,
  draft,
  setDraft,
  canCheck,
  disabled = false,
  description,
  snapStep,
  draftKeyBase = null,
  onRecord,
  onClose,
}) {
  const headingId = useId();
  const sectionRef = useRef(null);
  const enlargeRef = useRef(null);
  const env = process.env;
  const methods = useMemo(() => lmrMethodsFor(question, process, target), [question, process, target]);
  // Ways that start from a fact the student does not have yet: named, so a
  // pathway that begins somewhere else is visible — never a menu.
  const later = useMemo(() => lmrLaterMethods(question, process, target), [question, process, target]);
  const option = selectedOption(question, process, target, draft.method?.[target], preferredMethod);
  const optionKey = optionKeyOf(option);
  const workKey = option ? workKeyOf(target, optionKey) : null;
  const ev = (workKey && draft.work?.[workKey]) || {};
  const group = option ? methods.find((entry) => entry.strategy === option.strategy) : null;

  // The algebra workspace's own equation and steps, as it reports them (it
  // keeps them in its own draft); and the last Check of THIS work, which
  // colours its fields until the work changes.
  // Kept per method: a workspace reports its equation from its own mount
  // effects, which run before this component's, so a reset here would wipe
  // what an already-solved equation just reported.
  const [liveWork, setLiveWork] = useState({});
  const live = (workKey && liveWork[workKey]) || null;
  const setLive = (data) => {
    if (!workKey) return;
    setLiveWork((current) => (current[workKey] === data ? current : { ...current, [workKey]: data }));
  };
  const [lastCheck, setLastCheck] = useState(null);
  const [enlarged, setEnlarged] = useState(false);

  const choose = (key) => setDraft((current) => ({ ...current, method: { ...current.method, [target]: key } }));
  const setEv = (updater) => {
    if (!workKey) return;
    setDraft((current) => {
      const previous = current.work?.[workKey] || {};
      const next = typeof updater === 'function' ? updater(previous) : updater;
      return withWork(current, workKey, next);
    });
  };
  const liveEvidence = option && isAlgebra(option.strategy) && live ? { eq: live.eq, steps: live.steps } : {};
  const workJson = JSON.stringify([workKey, ev, liveEvidence]);
  const checked = lastCheck?.workJson === workJson ? lastCheck : null;
  const fieldStatus = (field) => (checked ? fieldStatusFrom(checked.evaluated, field, canCheck) : 'neutral');

  const check = () => {
    if (!option || disabled) return;
    const tries = Number(draft.tries?.[workKey]) || 0;
    const decision = decideProcessCheck({ question, process, option, target, ev, live: liveEvidence, reveal: canCheck, tries });
    let outcome = null;
    // Part of the work was right and part was not: the right part is recorded
    // and the workspace stays open on the rest.
    if (decision.record) outcome = onRecord(decision.record, { target, keepOpen: Boolean(decision.message) });
    setDraft((current) => {
      const nextTries = { ...current.tries };
      // Every press counts toward the attempts on this work until it is all
      // right; then the count starts again.
      if (decision.record && !decision.message) delete nextTries[workKey];
      else nextTries[workKey] = tries + 1;
      return { ...current, tries: nextTries };
    });
    // Solved for y: the slope and y-intercept are now read from the student's
    // own equation — the method that finishes this pathway opens next.
    if (decision.record && option.bridgeTo && outcome?.bridged) {
      choose(outcome.bridged);
      setLastCheck({ workJson: null, evaluated: null, message: 'Your equation is ready: now read the slope and y-intercept from it.', tone: 'success' });
      return;
    }
    if (decision.record && target === 'point' && outcome?.established) {
      // Points come in twos: the work clears for the next one.
      setEv({});
      setLastCheck({ workJson: null, evaluated: null, message: canCheck ? 'That point is on the line. Find another, or go back to the board.' : 'Saved. Find another point, or go back to the board.', tone: canCheck ? 'success' : 'neutral' });
      return;
    }
    setLastCheck({
      workJson,
      evaluated: decision.evaluated,
      message: decision.message || (decision.record && !outcome?.established ? (canCheck ? 'Recorded.' : 'Saved.') : ''),
      tone: decision.tone,
    });
  };

  // Enlarged, the workspace takes the screen (Escape returns it to the board's
  // flow); the same elements stay mounted, so no work is lost either way.
  // useModalDialog opens on the Enlarge toggle, traps Tab and answers Escape.
  useModalDialog(sectionRef, { onClose: () => setEnlarged(false), initialFocusRef: enlargeRef, returnFocus: false, active: enlarged });
  useEffect(() => {
    if (!enlarged) return undefined;
    const returnTo = enlargeRef.current;
    return () => {
      returnTo?.focus?.({ preventScroll: true });
    };
  }, [enlarged]);

  const facts = process.facts || {};
  const ownEquationLatex = facts.siEquation ? factDisplay(facts.siEquation) : null;
  const factsEquationLatex = facts.slope?.value && facts.yIntercept?.value ? slopeInterceptLatexOf(facts.slope.value, facts.yIntercept.value) : null;
  const common = { option, target, ev, setEv, fieldStatus, disabled, description };

  const body = (() => {
    if (!option) return null;
    switch (option.strategy) {
      case 'readSlopeIntercept':
      case 'readPointSlope':
      case 'readScenario':
      case 'evaluateAtX':
        return <FieldsMethod {...common} ownEquationLatex={ownEquationLatex} factsEquationLatex={factsEquationLatex} />;
      case 'solveForB':
        return <SolveForBMethod {...common} process={process} />;
      case 'twoPointFormula':
        return env.kind === 'graph' && option.source === 'given'
          ? <GraphMethod {...common} bounds={env.bounds} snapStep={snapStep} enlarged={enlarged} />
          : <TwoPointFormulaMethod {...common} env={env} process={process} />;
      case 'tableDelta':
        return <TableDeltaMethod {...common} />;
      case 'tableRead':
      case 'tableRow':
        return <TableRowMethod {...common} />;
      case 'extendTable':
        return <ExtendTableMethod {...common} />;
      case 'graphCrossing':
      case 'graphPoint':
      case 'riseRun':
        return <GraphMethod {...common} bounds={env.bounds} snapStep={snapStep} enlarged={enlarged} />;
      case 'solveForY':
        return <SolveForYMethod env={env} description={description} draftKeyBase={draftKeyBase} live={live} onLive={setLive} disabled={disabled} />;
      case 'substituteZero':
        return (
          <SubstituteZeroMethod
            {...common}
            env={env}
            facts={facts}
            canCheck={canCheck}
            draftKeyBase={draftKeyBase}
            live={live}
            onLive={setLive}
          />
        );
      default:
        return null;
    }
  })();

  const title = lmrFindLabel(question, target);
  const chosenGroupKey = option ? option.strategy : null;
  return (
    <section
      ref={sectionRef}
      data-lmr-card="process"
      data-process-target={target}
      data-process-enlarged={enlarged ? 'true' : undefined}
      aria-labelledby={headingId}
      role={enlarged ? 'dialog' : 'region'}
      aria-modal={enlarged ? 'true' : undefined}
      tabIndex={-1}
      style={enlarged ? {
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        background: 'var(--mm-surface)',
        padding: 'max(12px, env(safe-area-inset-top)) 14px 24px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        textAlign: 'left',
      } : {
        border: '2px solid var(--mm-primary-border)',
        borderRadius: 14,
        padding: 14,
        background: 'var(--mm-surface)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minWidth: 0,
        textAlign: 'left',
        scrollMarginTop: 96,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px 10px', flexWrap: 'wrap' }}>
        <h3 id={headingId} style={{ margin: 0, fontSize: 18, color: 'var(--mm-text-strong)', flex: '1 1 200px' }}>{title}</h3>
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            ref={enlargeRef}
            type="button"
            data-process-enlarge="true"
            onClick={() => setEnlarged((value) => !value)}
            style={quietButton}
            aria-pressed={enlarged}
          >
            {enlarged ? '⤡ Smaller' : '⤢ Enlarge'}
          </button>
          <button type="button" data-process-close="true" onClick={() => { setEnlarged(false); onClose(); }} style={touchButton}>
            ← Back to board
          </button>
        </span>
      </div>

      {methods.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--mm-text)' }}>How will you find it?</span>
          <ChoiceChips
            label={`Methods to ${title.toLowerCase()}`}
            name="method"
            options={methods.map((entry) => ({ value: entry.strategy, label: entry.label }))}
            value={chosenGroupKey}
            disabled={disabled}
            onChange={(strategy) => {
              const chosen = methods.find((entry) => entry.strategy === strategy);
              const first = chosen?.sources.find((entry) => entry.source === 'given') || chosen?.sources[0];
              if (first) choose(optionKeyOf(first));
            }}
          />
          {later.length ? (
            <p data-process-later="true" style={muted}>
              Other ways, once you know more: {later.map((entry) => `${entry.label} (needs ${entry.needs.join(' and ')})`).join(' · ')}.
            </p>
          ) : null}
          {group && group.sources.length > 1 ? (
            <ChoiceChips
              label="Work from"
              name="source"
              options={group.sources.map((entry) => ({ value: optionKeyOf(entry), label: sourceLabel(entry) }))}
              value={optionKey}
              disabled={disabled}
              onChange={choose}
            />
          ) : null}
        </div>
      ) : (
        <p style={muted}>
          {later.length
            ? `First establish ${[...new Set(later.flatMap((entry) => entry.needs))].join(' or ')} — then: ${later.map((entry) => entry.label).join(' · ')}.`
            : 'Nothing on this board can find this yet. Establish another fact first.'}
        </p>
      )}

      {option ? (
        <div data-process-method={optionKey} style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {body}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              data-card-check="true"
              onClick={check}
              disabled={disabled}
              style={{ ...primaryButton, opacity: disabled ? 0.6 : 1 }}
            >
              {canCheck ? 'Check' : 'Save'}
            </button>
            {!canCheck ? <span style={muted}>Your work is saved as your answer. You can change it until you submit.</span> : null}
          </div>
        </div>
      ) : methods.length ? (
        <p style={muted}>Choose a method to start.</p>
      ) : null}

      {lastCheck?.message ? <ProcessMessage tone={lastCheck.tone}>{lastCheck.message}</ProcessMessage> : null}
    </section>
  );
}

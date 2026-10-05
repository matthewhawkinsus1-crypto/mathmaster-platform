import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import MathText from '../../components/common/MathText.jsx';
import {
  countAnswerControls,
  focusFirstAnswerControl,
  focusForEnter,
  isSingleLineAnswerTarget,
  isTouchPrimaryPointer,
  resolveToolEnterAction,
  shouldFocusAnswerOnOpen,
} from '../../platform/interaction/answerEntryUx.js';
import { useAnswerFocusPolicy, useHostedDeferredFocusAuthority } from '../../platform/interaction/answerFocusPolicy.js';
import { isMobileQuestionViewport } from '../../components/student/MobileViewportContainer.jsx';
import QuietDisclosure from '../../components/common/QuietDisclosure.jsx';
import { useRenderPerformance } from '../../platform/performance/useRenderPerformance.js';
import { PlotHelpScope } from './plotHelpScope.js';
import { useHintsAllowed, useToolRuntimeContext } from './ToolRuntimeContext';
import { VERDICT_CARD_RADIUS, verdictRadius, verdictTextLength, verdictWraps } from './verdictShape.js';

// A stable key for "this exact block of text", so a student's decision to fold
// the steps away is remembered per tool without every one of the eighteen tools
// having to be given an id by hand.
//
// Keying on the CONTENT rather than on the tool is deliberate: when the steps
// are rewritten the key changes and the panel opens again, which is what should
// happen when the instructions are no longer the ones the student read.
const contentKey = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
};

/*
 * WHETHER A TOOL OPENS WITH THE CURSOR IN A BOX.
 *
 * Two questions, and both must say yes.
 *
 *   MAY IT? The hosting question decides (useAnswerFocusPolicy): not on a
 *   phone, not on a touch-first tablet, not in a composed question, not while
 *   locked. This shell used to skip that question and focus unconditionally,
 *   so the phone number keypad opened over Linear Table Workbench's table the
 *   moment it loaded, and the iPad math keypad covered half the representation
 *   board.
 *
 *   IS THERE "THE" BOX? Only when the tool shows exactly one answer control.
 *   A tool with a dozen — the representation board, a table workbench — has no
 *   first answer, only a first cell, and landing there says the task starts
 *   with typing when it starts with reading. `focusOnOpen={false}` opts a tool
 *   out even then.
 */
const mayFocusOnOpen = (policy) => (policy
  ? policy.allowed
  : shouldFocusAnswerOnOpen({ narrowViewport: isMobileQuestionViewport(), touchPrimary: isTouchPrimaryPointer() }));

/*
 * WIDTH PROFILES.
 *
 * 'standard' (every tool): up to 1180px, inside the assignment's 1120px shell.
 *
 * 'wide' (opt-in): a tool whose workspace is several columns of cards or
 * graphs — the representation board, a card sort — may use a wider screen
 * when there is one (a Chromebook at 67–80% zoom reports 1700–2000 CSS px
 * and left half the screen empty). App.css widens the assignment shell for
 * such a question only at ≥1400px; paragraphs keep their own reading widths
 * and the task card stays at its usual width. Narrower screens are unchanged.
 */
const WORKSPACE_WIDTHS = { standard: 'min(100%, 1180px)', wide: 'min(100%, 1480px)' };

/*
 * ONE DISCLOSURE FOR THE TOOL'S HELP, NOT TWO (platform quirks audit PQ-023).
 *
 * "About this tool" (a one-line description, in the header) and "How to do
 * this" (the steps, in the task card) were two folded rows between the task
 * and the mathematics — on a 390px phone the header alone was 98–117px. The
 * description now opens as the first line of "How to do this": the shell hands
 * it to its TaskCard through this context, and the TaskCard says it took it.
 * A tool with no TaskCard keeps "About this tool" in its header, and so does
 * Work View, which hides the task card (App.css).
 */
const ToolShellContext = createContext(null);

export default function ToolShell({ title, subtitle, badge, children, footer, shellKey = null, widthProfile = 'standard', workspaceWidth = WORKSPACE_WIDTHS[widthProfile] || WORKSPACE_WIDTHS.standard, focusOnOpen = true }) {
  useRenderPerformance('ToolShell');
  const shellRef = useRef(null);
  const focusPolicy = useAnswerFocusPolicy();
  const focusAllowed = focusOnOpen && mayFocusOnOpen(focusPolicy);
  // The hosting question's (or, on the tools bench, the shell's own): a press
  // or key from the student after the question opened cancels this focus.
  const focusAuthority = useHostedDeferredFocusAuthority();
  const [taskCards, setTaskCards] = useState(0);
  const registerTaskCard = useCallback(() => {
    setTaskCards((count) => count + 1);
    return () => setTaskCards((count) => Math.max(0, count - 1));
  }, []);
  const shellContext = useMemo(() => ({
    description: subtitle || null,
    badge: badge || null,
    registerTaskCard,
  }), [subtitle, badge, registerTaskCard]);

  useEffect(() => {
    if (!focusAllowed) return undefined;
    return focusAuthority.request(() => {
      if (countAnswerControls(shellRef.current) === 1) focusFirstAnswerControl(shellRef.current);
    });
    // On open only: a tool that re-renders must not pull the cursor back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enter in an answer box follows the explicit contract in answerEntryUx.js
  // (resolveToolEnterAction): only a button the tool DECLARED is ever used,
  // nothing is pressed while a box in its card is empty (Enter moves to the
  // next empty box), and a whole-question submit is brought into focus rather
  // than pressed unless the field is the one answer box.
  const handleAnswerEnter = (event) => {
    if (event.defaultPrevented || event.key !== 'Enter' || event.isComposing) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!isSingleLineAnswerTarget(event.target)) return;
    const decision = resolveToolEnterAction({ field: event.target, shell: shellRef.current });
    if (decision.kind === 'none') return;
    event.preventDefault();
    if (decision.kind === 'press') decision.target.click();
    else focusForEnter(decision.target);
  };

  return (
    <section ref={shellRef} onKeyDown={handleAnswerEnter} className="mathmaster-tool-shell" data-width-profile={widthProfile === 'wide' ? 'wide' : undefined} style={{
      // Takes the room it is given, up to a limit generous enough for a
      // coordinate plane beside its controls. The old fixed 980px capped a
      // graph well below the width available on a school Chromebook.
      width: workspaceWidth,
      margin: '0 auto',
      border: '1px solid var(--mm-tint-border)',
      borderRadius: 18,
      background: 'var(--mm-surface)',
      boxShadow: '0 16px 44px rgba(15, 23, 42, 0.08)',
      // `clip`, not `hidden`. Both keep the corners rounded, but `hidden`
      // creates a scroll container, and a `position: sticky` descendant sticks
      // to its nearest scroll container — one that never scrolls, so the task
      // card silently did not stick. `clip` does not create one.
      overflow: 'clip',
    }}>
      {/* ONE LINE, NOT THREE.
          This header was a 24px heading, a full sentence describing the tool,
          and a badge, stacked above every question — and the question's own
          "Your task" panel sits directly above it saying what to do. The name
          still orients a student arriving at an unfamiliar tool, so it stays,
          at the size of a label rather than a headline.

          The subtitle describes what the TOOL is. That is worth reading once
          and is not worth a paragraph on every question, so it folds. */}
      {/* ONE ROW, NOT THREE.
          The name of the tool, its badge and "About this tool" used to stack:
          a title row, then a margin, then a 44px fold, for 99px of chrome
          before the student reached any mathematics. On a phone that pushed the
          answer control to 558px of a 664px screen.

          The header is wide and mostly empty, so they sit on one line and the
          fold goes to the far end. Opened, App.css gives it the whole row via
          its `data-open` attribute, so the text reads at full width instead of
          being squeezed into whatever the summary left over. */}
      <header className="mathmaster-tool-shell-header" style={{ padding: '9px 16px', borderBottom: '1px solid var(--mm-border-soft)', background: 'linear-gradient(135deg,var(--mm-surface-tint),var(--mm-primary-subtle))' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--mm-text-strong)' }}>{title}</h2>
          {badge ? <span className="mathmaster-tool-shell-badge" style={{ borderRadius: 999, background: 'var(--mm-primary-soft)', color: 'var(--mm-primary-text)', padding: '5px 10px', fontWeight: 800, fontSize: 11 }}>{badge}</span> : null}
          {subtitle ? (
            // `display: contents` keeps the fold itself the header's flex item.
            // Merged into the TaskCard's "How to do this", it is hidden by
            // App.css everywhere except Work View.
            <div className="mathmaster-tool-shell-about" data-merged={taskCards > 0 ? 'true' : undefined} style={{ display: 'contents' }}>
            <QuietDisclosure
              summary="About this tool"
              storageKey={`mm.tool.about.${shellKey || contentKey(`${title}|${subtitle}`)}`}
              defaultOpen={false}
              style={{ margin: 0, marginLeft: 'auto' }}
            >
              {/* The badge is repeated here so a phone can drop it from the
                header row without losing it. At 390px "Graphing" plus the badge
                plus this fold wrapped onto three lines — 101px of naming a tool
                the student is already looking at. */}
            {badge ? (
              <p className="mathmaster-tool-shell-badge-echo" style={{ margin: '0 0 6px', color: 'var(--mm-primary-text)', fontWeight: 800, fontSize: 13 }}>{badge}</p>
            ) : null}
            <p style={{ margin: 0, color: 'var(--mm-text-muted)', lineHeight: 1.45, fontSize: 14 }}>{subtitle}</p>
            </QuietDisclosure>
            </div>
          ) : null}
        </div>
      </header>
      {/* One set of plotting directions per tool, however many planes it has. */}
      <div className="mathmaster-tool-shell-body" style={{ padding: 24 }}><ToolShellContext.Provider value={shellContext}><PlotHelpScope>{children}</PlotHelpScope></ToolShellContext.Provider></div>
      {footer ? <footer style={{ padding: '14px 24px', borderTop: '1px solid var(--mm-border-soft)', background: 'var(--mm-surface-sunken)', color: 'var(--mm-text-muted)', fontSize: 13 }}>{footer}</footer> : null}
    </section>
  );
}

export const ToolGrid = ({ children, min = 260 }) => (
  <div className="mathmaster-tool-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 18 }}>{children}</div>
);

// For tools where a graph is the workspace and the rest is controls: the plane
// gets the wider column instead of an even split with a panel of text.
export const ToolSplit = ({ children }) => (
  <div className="mathmaster-tool-split">{children}</div>
);

/**
 * A panel a student can fold away.
 *
 * `collapsible` is opt-in and the bar for setting it is deliberately high,
 * because two kinds of panel must never fold and they are most of them.
 *
 *   A PANEL HOLDING A CONTROL. Hiding a field behind a disclosure is worse than
 *   a long page: a student who cannot find the input does not know to look for
 *   it, and reads the question as broken.
 *
 *   A PANEL HOLDING THIS QUESTION'S DATA. The given ordered pairs, the target
 *   polynomial, the sequence with the gap. Folding is remembered, so a student
 *   who folded one question's givens would arrive at the next question with the
 *   thing it asks about already hidden.
 *
 * What is left is general teaching reference — text that is identical on every
 * question of that tool. Across the whole tool set that is two panels, which is
 * the honest size of this category rather than a disappointing one.
 *
 * It opens by default in every case. The student decides what to put away.
 */
export const Panel = ({ title, children, collapsible = false, defaultOpen = true }) => {
  const body = (
    <div className="mathmaster-tool-panel" style={{ border: '1px solid var(--mm-tint-border)', borderRadius: 14, padding: 16, background: 'var(--mm-surface)' }}>
      {title ? <h3 style={{ margin: '0 0 12px', fontSize: 16, color: 'var(--mm-text)' }}>{title}</h3> : null}
      {children}
    </div>
  );

  if (!collapsible || !title) return body;

  return (
    <QuietDisclosure
      summary={String(title)}
      storageKey={`mm.tool.panel.${contentKey(String(title))}`}
      defaultOpen={defaultOpen}
      tone="strong"
      style={{ margin: 0 }}
    >
      {body}
    </QuietDisclosure>
  );
};

/*
 * THE PLATFORM'S OUTCOME FOR AN ATTEMPT, WHERE THE STUDENT IS LOOKING (PQ-022).
 *
 * A verdict area renders this slot. It joins the question's slot registry
 * while mounted (attemptOutcomeSlots.js) and shows QuestionEngine's outcome —
 * "Not quite. You have 2 attempts remaining on this version." — when that
 * outcome is handed to it, which QuestionEngine does only where it would have
 * shown the sentence in its own box: outcome feedback allowed, nothing
 * withheld, the question still open. It is then the one place the outcome
 * appears, and its live region the one announcement (PQ-017).
 *
 * The live region is mounted, empty and visually hidden, with the verdict —
 * the moment Check is pressed — so the sentence that arrives when the attempt
 * is graded is an addition to a region that already exists, which screen
 * readers announce reliably. `inline` renders the bare sentence for a tool
 * whose verdict is itself a live region (Regression Calculator), so the
 * outcome joins that announcement instead of starting a second one.
 */
const OUTCOME_WAITING_STYLE = {
  position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, border: 0,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap',
};
const outcomeStyle = (tone) => ({
  // Its own row in the flex rows some tools put their verdict in.
  flexBasis: '100%',
  boxSizing: 'border-box',
  margin: '8px 0 0',
  padding: '8px 12px',
  borderRadius: 10,
  background: tone === 'correct' ? 'var(--mm-success-bg)' : 'var(--mm-error-bg)',
  color: tone === 'correct' ? 'var(--mm-success-text)' : 'var(--mm-danger)',
  fontSize: 14,
  fontWeight: 800,
  lineHeight: 1.45,
  // `nearest` would otherwise stop with the box's edge on the scroller's edge,
  // a few pixels under a phone's action bar.
  scrollMarginBottom: 12,
});

// `showDetail={false}` for a tool whose verdict already lists the parts to
// revisit (the representations board), so the "Focus on" line is not said twice.
export const AttemptOutcome = ({ inline = false, showDetail = true }) => {
  const { attemptOutcome, attemptOutcomeSlots } = useToolRuntimeContext();
  const [slot, setSlot] = useState(null);
  const regionRef = useRef(null);
  useLayoutEffect(() => {
    if (!attemptOutcomeSlots) return undefined;
    const token = attemptOutcomeSlots.register();
    setSlot(token);
    return () => attemptOutcomeSlots.unregister(token);
  }, [attemptOutcomeSlots]);
  const outcome = attemptOutcomeSlots && attemptOutcome && slot !== null && attemptOutcome.slot === slot ? attemptOutcome : null;
  // Once per attempt, and only as far as needed: Check pressed low on a phone
  // leaves the verdict at the bottom edge, where the sentence below it could
  // land under the action bar. `nearest` does nothing when it is already in
  // view, and the scroll padding (or, on a phone, the scroller ending at the
  // bar) keeps it clear of the bar.
  const shownId = outcome ? outcome.id : null;
  useEffect(() => {
    if (shownId === null) return;
    regionRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [shownId]);
  // Outside a question (the tools lab) there is no attempt to report.
  if (!attemptOutcomeSlots) return null;
  if (inline) {
    return outcome ? (
      <span ref={regionRef} className="mathmaster-tool-attempt-outcome" data-attempt-outcome="shown" style={{ scrollMarginBottom: 12 }}>
        {' '}{outcome.text}{showDetail && outcome.detail ? ` ${outcome.detail}` : ''}
      </span>
    ) : null;
  }
  return (
    <div
      ref={regionRef}
      role="status"
      className="mathmaster-tool-attempt-outcome"
      data-attempt-outcome={outcome ? 'shown' : 'waiting'}
      style={outcome ? outcomeStyle(outcome.tone) : OUTCOME_WAITING_STYLE}
    >
      {outcome ? (
        <>
          {outcome.text}
          {showDetail && outcome.detail ? <span style={{ display: 'block', marginTop: 4, fontWeight: 700 }}>{outcome.detail}</span> : null}
        </>
      ) : null}
    </div>
  );
};

// The verdict of a Check. `stageCheck` marks a pill that reports one stage or
// step of the work rather than the attempt ("General form correct", "y
// isolated"): it is not where an attempt's outcome belongs.
export const ResultPill = ({ ok, children, stageCheck = false }) => {
  // PQ-032: a verdict that wraps is a 10px card, not a 999px lozenge. Long
  // text is known before layout; whether a shorter one wraps depends on the
  // width it is given, so it is measured, and re-measured when that changes.
  const pillRef = useRef(null);
  const [wrapped, setWrapped] = useState(false);
  useLayoutEffect(() => {
    const pill = pillRef.current;
    if (!pill || typeof window === 'undefined') return undefined;
    const measure = () => {
      const style = window.getComputedStyle(pill);
      setWrapped(verdictWraps({
        height: pill.getBoundingClientRect().height,
        lineHeight: parseFloat(style.lineHeight),
        fontSize: parseFloat(style.fontSize),
        paddingTop: parseFloat(style.paddingTop),
        paddingBottom: parseFloat(style.paddingBottom),
      }));
    };
    measure();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(pill);
    return () => observer.disconnect();
  }, []);
  const radius = verdictRadius({ textLength: verdictTextLength(children), wrapped });
  return (
    <>
      <span
        ref={pillRef}
        className="mathmaster-result-pill"
        data-verdict-shape={radius === VERDICT_CARD_RADIUS ? 'card' : 'pill'}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: radius, padding: '7px 11px', fontWeight: 800, background: ok ? 'var(--mm-success-bg)' : 'var(--mm-error-bg)', color: ok ? 'var(--mm-success-text)' : 'var(--mm-danger)' }}
      >
        {ok ? '✓' : '•'} {children}
      </span>
      {stageCheck ? null : <AttemptOutcome />}
    </>
  );
};

// Every tool leads with the same thing: one sentence naming the task, then the
// concrete steps. Previously each tool buried its directions in a paragraph
// under the workspace, where a student reads them only after guessing wrong.
//
// EVERY AUTHORED STRING HERE GOES THROUGH MathText. This is the card at the top
// of every single tool, so a prompt written as "Solve $-3x + 4 > 13$" — which is
// how the whole Path bank is written — was showing a student the dollar signs
// and the backslashes. One component, every tool, every question.
export const TaskCard = ({ task, steps = [], note = null, question = null, stepsKey = null }) => {
  const authoredPrompt = String(question?.prompt || '').trim();
  const taskText = String(task || '').trim();
  const promptDiffers = Boolean(authoredPrompt && authoredPrompt !== taskText);
  // The fold's remembered open/closed state stays keyed on the directions and
  // steps alone, so a student who had opened them still finds them open.
  const supportKey = stepsKey || contentKey([taskText, ...steps, note || ''].filter(Boolean).join('|'));
  // PQ-023: the tool's one-line description opens the fold, and the shell's
  // header stops offering it separately once this card has said it took it.
  const shell = useContext(ToolShellContext);
  const registerTaskCard = shell?.registerTaskCard;
  useLayoutEffect(() => (registerTaskCard ? registerTaskCard() : undefined), [registerTaskCard]);
  const description = shell?.description || null;
  const showsDirections = Boolean(taskText && (!authoredPrompt || promptDiffers));
  const hasSupport = Boolean(description || showsDirections || steps.length || note);
  // Named for what is inside: the steps when there are steps, otherwise the
  // directions, otherwise only the description of the tool.
  const summary = steps.length
    ? `How to do this (${steps.length} step${steps.length === 1 ? '' : 's'})`
    : showsDirections || note ? 'How to do this' : 'About this tool';

  return (
    <div className="mathmaster-tool-task-card" style={{
      border: '1px solid var(--mm-primary-border)', borderLeft: '6px solid #1a73e8', borderRadius: 12,
      background: 'var(--mm-surface-tint)', padding: '10px 12px', marginBottom: 12,
    }}>
      {authoredPrompt ? (
        <div className="mathmaster-tool-task-prompt">
          <div className="mathmaster-tool-task-eyebrow" style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--mm-primary-text)' }}>{promptDiffers ? 'Problem' : 'Your task'}</div>
          <MathText as="p" style={{ margin: '6px 0 0', fontSize: 17, fontWeight: 700, color: 'var(--mm-text-strong)', lineHeight: 1.4 }}>{authoredPrompt}</MathText>
        </div>
      ) : null}
      {hasSupport ? (
        <QuietDisclosure
          summary={summary}
          storageKey={`mm.tool.steps.${supportKey}`}
          defaultOpen={false}
          style={{ margin: authoredPrompt ? '8px 0 0' : 0 }}
        >
          {description ? (
            <div className="mathmaster-tool-task-about">
              {/* The header drops the badge on a phone; it is kept here. */}
              {shell?.badge ? (
                <p className="mathmaster-tool-shell-badge-echo" style={{ margin: '0 0 6px', color: 'var(--mm-primary-text)', fontWeight: 800, fontSize: 13 }}>{shell.badge}</p>
              ) : null}
              <p style={{ margin: 0, color: 'var(--mm-text-muted)', lineHeight: 1.45, fontSize: 14 }}>{description}</p>
            </div>
          ) : null}
          {showsDirections ? (
            <div className="mathmaster-tool-task-directions" style={description ? { marginTop: 10 } : undefined}>
              <MathText as="p" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--mm-text-strong)', lineHeight: 1.45 }}>{taskText}</MathText>
            </div>
          ) : null}
          {steps.length ? (
            <ol style={{ margin: showsDirections || description ? '10px 0 0' : 0, paddingLeft: 20, color: 'var(--mm-text)', lineHeight: 1.6 }}>
              {steps.map((step, index) => <li key={index}><MathText>{step}</MathText></li>)}
            </ol>
          ) : null}
          {note ? <MathText as="p" style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--mm-text-muted)' }}>{note}</MathText> : null}
        </QuietDisclosure>
      ) : null}
    </div>
  );
};

// Progressive hints: a nudge, then the strategy, then the worked step. Each
// reveal is reported so attempt scoring can discount mathematical help the same
// way it does everywhere else in the platform.
//
// AND ONLY WHERE THE ACTIVITY ALLOWS HELP. A DOL, quiz or test withholds hints
// (`hintsAllowed: false`, read from ToolRuntimeContext), and there the panel
// renders nothing at all — not a disabled button, not a note. That is how the
// platform's other policy-gated help already behaves: the guided coach renders
// nothing when it is not enabled, and the graph self-check is simply absent on
// a DOL. A line saying "hints are not available" on every question of an exit
// ticket would be noise the student reads instead of the problem, and the
// activity already states its own rules.
export const HintPanel = ({ hints = [], onHintUsed }) => {
  const [revealed, setRevealed] = useState(0);
  const hintsAllowed = useHintsAllowed();
  if (!hintsAllowed || !hints.length) return null;
  const revealNext = () => {
    setRevealed((current) => {
      const next = Math.min(hints.length, current + 1);
      if (next > current) onHintUsed?.(next);
      return next;
    });
  };
  // AN UNUSED HINT BLOCK TAKES ONE ROW.
  //
  // This was a bordered box carrying a heading, a button, and two lines telling
  // the student to try it themselves first — on every question, of every tool
  // that has hints, whether or not they wanted one. The nudge was the bulk. The
  // one fact in it a student needs before deciding is that their teacher sees
  // this, and that belongs beside the button they are about to press.
  const used = revealed > 0;

  return (
    <div style={{ marginTop: 16, ...(used ? { border: '1px solid var(--mm-warning-border-soft)', borderRadius: 12, background: 'var(--mm-warning-subtle)', padding: '12px 15px' } : null) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {used && <strong style={{ color: 'var(--mm-warning-text)', fontSize: 14 }}>Hints</strong>}
        <button
          type="button"
          onClick={revealNext}
          disabled={revealed >= hints.length}
          title="Using a hint is recorded for your teacher."
          style={{
            minHeight: 44, padding: '7px 13px', borderRadius: 999, border: '1px solid #e0a800',
            background: revealed >= hints.length ? 'var(--mm-surface-control)' : 'var(--mm-warning-subtle)', color: 'var(--mm-warning-text)',
            fontWeight: 800, fontSize: 13, cursor: revealed >= hints.length ? 'default' : 'pointer',
          }}
        >
          {revealed === 0 ? 'Stuck? Show a hint' : revealed >= hints.length ? 'All hints shown' : `Show hint ${revealed + 1} of ${hints.length}`}
        </button>
        {!used && <span style={{ fontSize: 12, color: 'var(--mm-warning-text)' }}>Recorded for your teacher</span>}
      </div>
      {used ? (
        <ol style={{ margin: '10px 0 0', paddingLeft: 20, color: 'var(--mm-warning-text)', lineHeight: 1.6 }}>
          {hints.slice(0, revealed).map((hint, index) => <li key={index} style={{ marginBottom: 4 }}><MathText>{hint}</MathText></li>)}
        </ol>
      ) : null}
    </div>
  );
};

import React, { useLayoutEffect, useRef } from 'react';
import './InequalityWorkspace.css';

/*
 * THE PIECES EVERY SYSTEMS-OF-INEQUALITIES MODE IS BUILT FROM.
 *
 * The student-build workflow, My Math Path's construct form and the analyze
 * form all show a graph beside per-constraint work. They used to be laid out by
 * three hand-rolled panels with selects for every two-way choice ("Choose…" →
 * Solid, "Choose…" → Above the boundary, "Choose…" → Yes). These are the shared
 * parts: the pinned graph stage and one-tap choices. (The constraint palette
 * is constraintPalette.js.)
 */

/*
 * WHETHER THE GRAPH CAN PIN, MEASURED.
 *
 * A pinned stage is only worth it while the step being worked on still fits
 * under (or beside) it. In the assignment on a 390×844 phone the platform's
 * chrome leaves the question's own scroller about 300px tall: a pinned graph
 * filled all of it, and the step's Check button could not be reached at all —
 * the old layout did exactly that. So the stage pins only when the scroll
 * container leaves room for a step (STEP_ROOM) below it in one column, or fits
 * whole beside the steps in two; otherwise it scrolls like any other content.
 * Work View, or minimising the task, gives a phone that room back.
 */
const STEP_ROOM = 160;

const scrollContainerOf = (element) => {
  for (let node = element?.parentElement; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    if (/(auto|scroll|overlay)/.test(window.getComputedStyle(node).overflowY)) return node;
  }
  return null;
};

/**
 * The graph stage and the work beside it (InequalityWorkspace.css). The stage
 * publishes its height so a step brought into view lands below it where the
 * stage is pinned over the steps (one-column layouts), and says whether it
 * pins at all (`data-pin`).
 */
export function InequalityLayout({ stage, children, stageLabel = 'Graph', sideRef = null, ...rest }) {
  const layoutRef = useRef(null);
  const stageRef = useRef(null);
  useLayoutEffect(() => {
    const layout = layoutRef.current;
    const element = stageRef.current;
    if (!layout || !element || typeof window === 'undefined') return undefined;
    let frame = 0;
    const publish = () => {
      frame = 0;
      const stageHeight = element.offsetHeight;
      layout.style.setProperty('--mm-ineq-stage-height', `${Math.round(stageHeight)}px`);
      const scroller = scrollContainerOf(layout);
      const twoColumns = window.getComputedStyle(layout).gridTemplateColumns.trim().split(/\s+/).length > 1;
      let available;
      if (scroller) {
        available = scroller.clientHeight;
      } else {
        // The page scrolls: the room under the assignment's sticky stack (the
        // stage's own `top`) and above the sticky action bar.
        const top = parseFloat(window.getComputedStyle(element).top) || 0;
        const bar = parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue('--mm-action-bar-height')) || 0;
        available = window.innerHeight - top - bar;
      }
      const pin = twoColumns ? available >= stageHeight : available - stageHeight >= STEP_ROOM;
      const next = pin ? 'true' : 'false';
      if (layout.dataset.pin !== next) layout.dataset.pin = next;
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(publish); };
    publish();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(element);
    observer?.observe(layout);
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, []);
  return (
    <div ref={layoutRef} className="mm-ineq-layout" data-pin="true" {...rest}>
      <section ref={stageRef} className="mm-ineq-graph-stage" aria-label={stageLabel}>{stage}</section>
      <div ref={sideRef} className="mm-ineq-side">{children}</div>
    </div>
  );
}

/*
 * BRING A STEP THAT JUST OPENED INTO VIEW — BELOW THE PINNED GRAPH.
 *
 * Chrome's scrollIntoView({ block: 'nearest' }) counts an element as visible
 * while it sits under a sticky stage, so on a phone the step a Check opened
 * landed behind the graph. What the student can see is measured instead:
 * inside the scroller, below the page's sticky stack (its scroll-padding) and
 * above the action bar, and below the stage wherever the stage sits over the
 * steps (one column). A step seen whole stays put. Otherwise it is scrolled to
 * the top of that region — with its card's header when the two fit — which is
 * where a stuck stage ends: the stage only sticks once the page has scrolled,
 * so its stuck bottom is computed from its sticky `top`, not read before.
 */
const visibleBand = (element) => {
  const scroller = scrollContainerOf(element);
  const root = window.getComputedStyle(document.documentElement);
  let top = 0;
  let bottom = window.innerHeight;
  if (scroller) {
    const box = scroller.getBoundingClientRect();
    top = Math.max(top, box.top);
    bottom = Math.min(bottom, box.bottom);
  } else {
    top = Math.max(top, parseFloat(root.scrollPaddingTop) || 0);
    bottom -= parseFloat(root.getPropertyValue('--mm-action-bar-height')) || 0;
  }
  let coveredBottom = top;
  let stuckBottom = top;
  const layout = element.closest('.mm-ineq-layout');
  const stage = layout?.querySelector('.mm-ineq-graph-stage');
  if (stage && layout.dataset.pin === 'true') {
    const rect = element.getBoundingClientRect();
    const covered = stage.getBoundingClientRect();
    // The stage hides the steps only where it sits above them (one column).
    if (covered.left < rect.right && covered.right > rect.left) {
      coveredBottom = Math.max(top, covered.bottom);
      const stickyTop = parseFloat(window.getComputedStyle(stage).top) || 0;
      stuckBottom = Math.max(top, (scroller ? scroller.getBoundingClientRect().top : 0) + stickyTop + covered.height);
    }
  }
  return { scroller, top, bottom, coveredBottom, stuckBottom };
};

export const revealStep = (heading) => {
  if (!heading?.getBoundingClientRect || typeof window === 'undefined') return;
  const step = heading.closest('[data-step-body]') || heading;
  const band = visibleBand(step);
  const rect = step.getBoundingClientRect();
  // With its card's header (which constraint, which inequality) when the two
  // fit together — the student who just finished constraint 1 sees "Constraint
  // 2 · y < −0.5x + 6" above the step it opened — and the step alone when not.
  const card = heading.closest('[data-constraint-index], [data-phase]');
  const room = band.bottom - Math.max(band.top, band.stuckBottom) - 12;
  const anchor = card && rect.bottom - card.getBoundingClientRect().top <= room ? card : heading;
  const anchorTop = () => anchor.getBoundingClientRect().top;
  if (anchorTop() >= Math.max(band.top, band.coveredBottom) && rect.bottom <= band.bottom) return;
  const scrollBy = (delta) => (band.scroller || window).scrollBy({ top: delta, left: 0, behavior: 'auto' });
  scrollBy(anchorTop() - (Math.max(band.top, band.stuckBottom) + 12));
  // Where the stage really is now (stuck, or back in the flow near the top).
  const after = visibleBand(step);
  const settle = anchorTop() - (Math.max(after.top, after.coveredBottom) + 12);
  if (Math.abs(settle) >= 4) scrollBy(settle);
};

/** A solid or a dashed stroke, drawn in the button's own colour. */
export const LineStyleIcon = ({ dashed = false }) => (
  <svg width="30" height="10" viewBox="0 0 30 10" aria-hidden="true" focusable="false">
    <line x1="1" y1="5" x2="29" y2="5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray={dashed ? '6 5' : undefined} />
  </svg>
);

export const EyeIcon = ({ open = true }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {open ? null : <line x1="3" y1="3" x2="21" y2="21" />}
  </svg>
);

/**
 * One choice among a few, one tap each (a select took two, and hid the
 * options). Buttons with aria-pressed inside a labelled group.
 */
export function ChoiceGroup({ legend, options, value, onChange, disabled = false, className = 'mm-ineq-choices', name }) {
  return (
    <fieldset className={className} data-choice-group={name || undefined}>
      {legend ? <legend>{legend}</legend> : null}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="mm-ineq-choice"
          aria-pressed={value === option.value}
          data-choice={option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.icon || null}
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

/** A yes / no judgement on one row: the question, then its two answers. */
export function YesNoQuestion({ legend, value, onChange, yesLabel = 'Yes', noLabel = 'No', name }) {
  return (
    <fieldset className="mm-ineq-question" data-question={name || undefined}>
      <legend>{legend}</legend>
      <span className="mm-ineq-choices">
        {[['yes', yesLabel], ['no', noLabel]].map(([choice, label]) => (
          <button
            key={choice}
            type="button"
            className="mm-ineq-choice"
            aria-pressed={value === choice}
            data-choice={choice}
            onClick={() => onChange(choice)}
          >
            {label}
          </button>
        ))}
      </span>
    </fieldset>
  );
}

/**
 * The line under a step's Check. `tone`: 'correct' | 'revise' (where outcomes
 * are shown) or 'recorded' (where they are withheld). A live region, so the
 * result of a Check is announced where it appears.
 */
export const StepFeedback = ({ tone = null, children }) => (
  children ? <p className="mm-ineq-feedback" role="status" data-tone={tone || undefined}>{children}</p> : null
);

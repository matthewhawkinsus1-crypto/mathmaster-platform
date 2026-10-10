import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MathDisplay from '../../MathDisplay.jsx';
import { SAT_REFERENCE_SHEET } from '../../platform/assessment/satReferenceSheet.js';
import {
  EXAM_TOOL_DRAWERS, EXAM_TOOL_IDS, EXAM_TOOL_LAYERS, EXAM_TOOL_OPEN_EVENT, examToolYieldsTo,
} from '../../platform/assessment/examToolLayout.js';
import { useExamToolbarOffset, useNarrowScreen } from './examToolDrawerHooks.js';

/*
 * THE DIGITAL SAT REFERENCE SHEET, ON THE SCREEN WHERE THE HEADER PROMISED IT.
 *
 * The secure exam header told SAT practice students "Reference sheet
 * available", and there was no sheet. This is the College Board's sheet —
 * eleven figures, their formulas and three facts (data in
 * src/platform/assessment/satReferenceSheet.js) — drawn as figures and typeset
 * with the platform's math renderer.
 *
 * A PANEL BESIDE THE QUESTION, NOT A WALL IN FRONT OF IT. On test day the
 * sheet can stay open while a student works, so this is a non-modal dialog:
 * on a Chromebook it docks at the right edge and the container moves the
 * question clear of it (onOpenChange + examToolDrawerHooks.js
 * useExamToolRoom), so no part of the question sits under it; on a phone it
 * rises from the bottom, stops below the exam toolbar (the timer and the tool
 * buttons stay in sight), scrolls inside itself, and closes with one large
 * button. Escape closes it and focus goes back to the button that opened it.
 * Where it and the graphing calculator cannot both sit beside the question,
 * opening one closes the other.
 *
 * Which exams get it is the policy's decision, not this file's:
 * src/platform/assessment/secureExamTools.js (only the Digital SAT promises a
 * sheet). Nothing here knows about any question.
 */

const TOOL = EXAM_TOOL_IDS.REFERENCE_SHEET;

const LAUNCHER = {
  minHeight: 44,
  padding: '9px 14px',
  borderRadius: 999,
  border: '1px solid var(--mm-tint-border)',
  background: 'var(--mm-surface)',
  color: 'var(--mm-primary-text)',
  fontWeight: 800,
  cursor: 'pointer',
};

const CLOSE = {
  minWidth: 44,
  minHeight: 44,
  padding: '0 12px',
  borderRadius: 10,
  border: '1px solid var(--mm-border-strong, var(--mm-border))',
  background: 'var(--mm-surface)',
  color: 'var(--mm-text)',
  fontWeight: 800,
  cursor: 'pointer',
};

// ---------------------------------------------------------------- figures

const Label = ({ x, y, children, small = false }) => (
  <text
    x={x}
    y={y}
    fill="currentColor"
    stroke="none"
    textAnchor="middle"
    fontFamily="'Times New Roman', Times, serif"
    fontStyle={small ? 'normal' : 'italic'}
    fontSize={small ? 10 : 14}
  >
    {children}
  </text>
);

const dashed = { strokeDasharray: '4 3' };

const FIGURES = {
  circle: (
    <>
      <circle cx="60" cy="45" r="34" />
      <line x1="60" y1="45" x2="94" y2="45" />
      <circle cx="60" cy="45" r="2" fill="currentColor" />
      <Label x="77" y="40">r</Label>
    </>
  ),
  rectangle: (
    <>
      <rect x="18" y="20" width="84" height="48" />
      <Label x="60" y="84">ℓ</Label>
      <Label x="111" y="48">w</Label>
    </>
  ),
  triangle: (
    <>
      <polygon points="12,72 108,72 42,16" />
      <line x1="42" y1="16" x2="42" y2="72" style={dashed} />
      <polyline points="42,64 50,64 50,72" />
      <Label x="62" y="87">b</Label>
      <Label x="34" y="50">h</Label>
    </>
  ),
  rightTriangle: (
    <>
      <polygon points="20,74 104,74 20,16" />
      <polyline points="20,66 28,66 28,74" />
      <Label x="11" y="49">a</Label>
      <Label x="62" y="88">b</Label>
      <Label x="69" y="38">c</Label>
    </>
  ),
  special30: (
    <>
      <polygon points="14,74 100,74 100,24" />
      <polyline points="92,74 92,66 100,66" />
      <Label x="57" y="88">x√3</Label>
      <Label x="110" y="53">x</Label>
      <Label x="50" y="42">2x</Label>
      <Label x="40" y="72" small>30°</Label>
      <Label x="91" y="47" small>60°</Label>
    </>
  ),
  special45: (
    <>
      <polygon points="24,74 84,74 24,14" />
      <polyline points="24,66 32,66 32,74" />
      <Label x="54" y="88">s</Label>
      <Label x="14" y="48">s</Label>
      <Label x="64" y="38">s√2</Label>
      <Label x="63" y="71" small>45°</Label>
      <Label x="34" y="45" small>45°</Label>
    </>
  ),
  rectangularPrism: (
    <>
      <rect x="14" y="34" width="64" height="44" />
      <polyline points="14,34 38,16 102,16 78,34" />
      <polyline points="102,16 102,60 78,78" />
      <polyline points="14,78 38,60 102,60" style={dashed} />
      <line x1="38" y1="16" x2="38" y2="60" style={dashed} />
      <Label x="46" y="89">ℓ</Label>
      <Label x="97" y="77">w</Label>
      <Label x="6" y="60">h</Label>
    </>
  ),
  cylinder: (
    <>
      <ellipse cx="60" cy="22" rx="34" ry="9" />
      <line x1="26" y1="22" x2="26" y2="72" />
      <line x1="94" y1="22" x2="94" y2="72" />
      <path d="M26,72 A34,9 0 0,0 94,72" />
      <path d="M26,72 A34,9 0 0,1 94,72" style={dashed} />
      <line x1="60" y1="22" x2="94" y2="22" />
      <circle cx="60" cy="22" r="2" fill="currentColor" />
      <Label x="77" y="18">r</Label>
      <Label x="105" y="52">h</Label>
    </>
  ),
  sphere: (
    <>
      <circle cx="60" cy="45" r="34" />
      <path d="M26,45 A34,10 0 0,0 94,45" />
      <path d="M26,45 A34,10 0 0,1 94,45" style={dashed} />
      <line x1="60" y1="45" x2="94" y2="45" />
      <circle cx="60" cy="45" r="2" fill="currentColor" />
      <Label x="77" y="40">r</Label>
    </>
  ),
  cone: (
    <>
      <line x1="60" y1="12" x2="26" y2="72" />
      <line x1="60" y1="12" x2="94" y2="72" />
      <path d="M26,72 A34,9 0 0,0 94,72" />
      <path d="M26,72 A34,9 0 0,1 94,72" style={dashed} />
      <line x1="60" y1="12" x2="60" y2="72" style={dashed} />
      <polyline points="60,65 67,65 67,72" />
      <line x1="60" y1="72" x2="94" y2="72" />
      <Label x="52" y="48">h</Label>
      <Label x="80" y="68">r</Label>
    </>
  ),
  rectangularPyramid: (
    <>
      <polyline points="14,74 82,74 106,58" />
      <line x1="60" y1="12" x2="14" y2="74" />
      <line x1="60" y1="12" x2="82" y2="74" />
      <line x1="60" y1="12" x2="106" y2="58" />
      <polyline points="14,74 38,58 106,58" style={dashed} />
      <line x1="60" y1="12" x2="38" y2="58" style={dashed} />
      <line x1="60" y1="12" x2="60" y2="66" style={dashed} />
      <Label x="48" y="88">ℓ</Label>
      <Label x="101" y="74">w</Label>
      <Label x="53" y="44">h</Label>
    </>
  ),
};

const Figure = ({ id, description }) => (
  <svg
    viewBox="0 0 120 92"
    role="img"
    aria-label={description}
    style={{ display: 'block', width: '100%', maxWidth: 132, height: 'auto', margin: '0 auto', color: 'var(--mm-text-strong)', overflow: 'visible' }}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinejoin="round"
    strokeLinecap="round"
  >
    {FIGURES[id] || null}
  </svg>
);

// ------------------------------------------------------------------ sheet

/** The sheet's content: figures, formulas and facts. */
export function SatReferenceSheetContent() {
  return (
    <div data-sat-reference-content>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {SAT_REFERENCE_SHEET.figures.map((entry) => (
          <li
            key={entry.id}
            data-sat-reference-figure={entry.id}
            style={{ border: '1px solid var(--mm-border)', borderRadius: 12, padding: '10px 8px 12px', background: 'var(--mm-surface)', minWidth: 0, textAlign: 'center' }}
          >
            <Figure id={entry.id} description={entry.description} />
            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: 'var(--mm-text-muted)' }}>{entry.name}</div>
            {entry.formulas.map((item) => (
              <div key={item.latex} style={{ marginTop: 2, textAlign: 'center' }}>
                <MathDisplay value={item.latex} format="latex" inline ariaLabel={item.spoken} style={{ fontSize: 18, color: 'var(--mm-text-strong)' }} />
              </div>
            ))}
          </li>
        ))}
      </ul>
      <ul style={{ margin: '14px 0 0', paddingLeft: 20, display: 'grid', gap: 6, color: 'var(--mm-text)', lineHeight: 1.5, fontSize: 14.5 }}>
        {SAT_REFERENCE_SHEET.facts.map((fact) => <li key={fact.id} data-sat-reference-fact={fact.id}>{fact.text}</li>)}
      </ul>
    </div>
  );
}

/**
 * The sheet as a panel, controlled by its opener.
 *
 * @param open           whether it is showing
 * @param onClose        () => void — the opener closes it and takes focus back
 * @param id             optional element id (the launcher's aria-controls)
 * @param toolbarOffset  optional CSS length: the exam toolbar's height where
 *                       the opener sits (the panel is portalled away from it)
 */
export function SatReferenceSheetDialog({ open, onClose, id = undefined, toolbarOffset = undefined }) {
  const narrow = useNarrowScreen();
  const panelRef = useRef(null);
  const titleId = `sat-reference-title-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  useEffect(() => {
    if (!open) return;
    try {
      panelRef.current?.focus({ preventScroll: true });
    } catch {
      panelRef.current?.focus();
    }
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  // Below whatever toolbar the exam sets --mm-exam-toolbar-offset to (0 by
  // default): docked at the right edge on a wide screen, as on test day; on a
  // phone a sheet that rises no higher than the toolbar's bottom edge.
  const placement = narrow
    ? { left: 0, right: 0, bottom: 0, maxHeight: 'min(88dvh, calc(100dvh - var(--mm-exam-toolbar-offset, 0px)))', borderRadius: '16px 16px 0 0', borderTop: '1px solid var(--mm-border)' }
    : { top: 'var(--mm-exam-toolbar-offset, 0px)', right: 0, bottom: 0, width: `min(${EXAM_TOOL_DRAWERS[TOOL]}px, 100vw)`, borderLeft: '1px solid var(--mm-border)' };

  // Portalled to the body: rendered inside a sticky toolbar, the panel would
  // be held in the toolbar's stacking context, under Work View whatever its
  // own layer says.
  return createPortal(
    <section
      ref={panelRef}
      id={id}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-sat-reference-sheet={narrow ? 'sheet' : 'drawer'}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose?.();
      }}
      style={{
        position: 'fixed',
        zIndex: EXAM_TOOL_LAYERS[TOOL],
        ...(toolbarOffset ? { '--mm-exam-toolbar-offset': toolbarOffset } : null),
        boxSizing: 'border-box',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        background: 'var(--mm-surface-raised, var(--mm-surface))',
        color: 'var(--mm-text)',
        boxShadow: 'var(--mm-shadow-lg, 0 8px 28px rgba(0,0,0,.22))',
        outline: 'none',
        textAlign: 'left',
        ...placement,
      }}
    >
      <header style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', background: 'var(--mm-surface-raised, var(--mm-surface))', borderBottom: '1px solid var(--mm-border)' }}>
        <div style={{ minWidth: 0 }}>
          <h2 id={titleId} style={{ margin: 0, fontSize: 18, color: 'var(--mm-text-strong)' }}>{SAT_REFERENCE_SHEET.title}</h2>
          <div style={{ fontSize: 12.5, color: 'var(--mm-text-muted)' }}>{SAT_REFERENCE_SHEET.subtitle}</div>
        </div>
        <button type="button" onClick={() => onClose?.()} aria-label="Close reference sheet" style={CLOSE}>
          <span aria-hidden="true">✕</span><span style={{ marginLeft: 6 }}>Close</span>
        </button>
      </header>
      <div style={{ padding: '12px 16px 20px' }}>
        <SatReferenceSheetContent />
      </div>
    </section>,
    document.body,
  );
}

/**
 * The launcher and its panel, for the exam toolbar.
 *
 * @param label        button text
 * @param onOpened     optional: () => void each time the student opens it
 * @param onOpenChange optional: (open) => void on every open and close — the
 *                     container pads the question column (useExamToolRoom)
 * @param buttonStyle  optional style overrides for the launcher
 */
export default function SatReferenceSheet({ label = 'Reference sheet', onOpened = null, onOpenChange = null, buttonStyle = null, defaultOpen = false }) {
  const [open, setOpenState] = useState(Boolean(defaultOpen));
  const launcherRef = useRef(null);
  const dialogId = `sat-reference-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const openRef = useRef(open);
  openRef.current = open;
  const toolbarOffset = useExamToolbarOffset(launcherRef, open);

  const setOpen = useCallback((next) => {
    if (next === openRef.current) return;
    openRef.current = next;
    setOpenState(next);
    onOpenChangeRef.current?.(next);
    // The other tool steps aside where the two cannot share the screen.
    if (next && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EXAM_TOOL_OPEN_EVENT, { detail: { tool: TOOL } }));
  }, []);

  // The graphing calculator opened where there is no room for both: close,
  // leaving focus with the calculator the student just opened.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const yieldTo = (event) => {
      if (openRef.current && examToolYieldsTo(TOOL, event?.detail?.tool, window.innerWidth)) setOpen(false);
    };
    window.addEventListener(EXAM_TOOL_OPEN_EVENT, yieldTo);
    return () => window.removeEventListener(EXAM_TOOL_OPEN_EVENT, yieldTo);
  }, [setOpen]);

  const close = () => {
    setOpen(false);
    // Back to where the student was.
    window.requestAnimationFrame?.(() => launcherRef.current?.focus?.({ preventScroll: true }));
  };

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        data-sat-reference-launcher
        onClick={() => {
          if (!open) onOpened?.();
          setOpen(!open);
        }}
        style={{ ...LAUNCHER, ...(open ? { background: 'var(--mm-primary-soft)' } : null), ...buttonStyle }}
      >
        <span aria-hidden="true">📐</span> {label}
      </button>
      <SatReferenceSheetDialog open={open} onClose={close} id={dialogId} toolbarOffset={toolbarOffset} />
    </>
  );
}

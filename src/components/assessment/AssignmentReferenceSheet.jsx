import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import MathDisplay from '../../MathDisplay.jsx';
import {
  EXAM_TOOL_DRAWERS, EXAM_TOOL_IDS, EXAM_TOOL_LAYERS, EXAM_TOOL_OPEN_EVENT, examToolYieldsTo,
} from '../../platform/assessment/examToolLayout.js';
import { useExamToolRoom, useNarrowScreen } from './examToolDrawerHooks.js';

/*
 * A REFERENCE SHEET ON AN ORDINARY ASSIGNMENT (TL07).
 *
 * The work bar's "Reference sheet" button opens this beside the question, the
 * way the graphing calculator opens (AssignmentGraphingCalculator.jsx): a
 * non-modal panel docked at the right edge on a wide screen, a sheet rising
 * from the bottom on a phone, Escape or Close to put it away, focus handed
 * back to the button that opened it. Its placement, layer and "one tool at a
 * time where two do not fit" rule are the secure exam's (examToolLayout.js), so
 * a student meets the same panel on a practice test and in class.
 *
 * It is kept apart from SatReferenceSheet.jsx on purpose: that file is the
 * College Board's sheet for a secure exam, and a second sheet must not be able
 * to change it. What this shows is data — a sheet that has its source and its
 * clearance (referenceSheets.js) — and nothing about any question.
 *
 * ROOM. The element holding the question (`roomRef`) is padded on the right by
 * exactly how far the open drawer reaches into it, so no part of the question
 * or the work bar sits under the sheet.
 */

const TOOL = EXAM_TOOL_IDS.REFERENCE_SHEET;
// One object, so a host with no room to make does not re-measure on every render.
const NO_ROOM = { current: null };

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

/** The sheet's content: its sections of formulas, any notes, and where it comes from. Pure. */
export function ReferenceSheetContent({ sheet }) {
  return (
    <div data-reference-sheet-content>
      {sheet.sections.map((section) => (
        <section key={section.id} data-reference-sheet-section={section.id} style={{ marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 6px', fontSize: 'calc(15 * var(--mm-px))', color: 'var(--mm-text-strong)' }}>{section.title}</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {section.items.map((item) => (
              <li key={item.id} data-reference-sheet-item={item.id} style={{ border: '1px solid var(--mm-border)', borderRadius: 10, padding: '8px 12px', background: 'var(--mm-surface)', minWidth: 0 }}>
                {item.label ? <div style={{ fontSize: 'calc(12.5 * var(--mm-px))', fontWeight: 800, color: 'var(--mm-text-muted)' }}>{item.label}</div> : null}
                <MathDisplay value={item.latex} format="latex" inline ariaLabel={item.spoken} style={{ fontSize: 'calc(18 * var(--mm-px))', color: 'var(--mm-text-strong)' }} />
                {item.note ? <div style={{ marginTop: 2, fontSize: 'calc(13 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>{item.note}</div> : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {Array.isArray(sheet.notes) && sheet.notes.length ? (
        <ul style={{ margin: '0 0 14px', paddingLeft: 20, display: 'grid', gap: 6, color: 'var(--mm-text)', lineHeight: 1.5, fontSize: 'calc(14.5 * var(--mm-px))' }}>
          {sheet.notes.map((note, index) => <li key={index}>{note}</li>)}
        </ul>
      ) : null}
      <p data-reference-sheet-source style={{ margin: 0, fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>
        Source: {sheet.source.name}{sheet.source.edition ? `, ${sheet.source.edition}` : ''}
      </p>
    </div>
  );
}

/**
 * The panel, controlled by whatever opens it (the work bar's button).
 *
 * @param sheet         a sheet resolveReferenceSheet returned
 * @param open          whether it is showing
 * @param onOpenChange  (open) => void — also called with false when another tool takes the room
 * @param roomRef       the element holding the question, padded while the sheet is open
 */
export default function AssignmentReferenceSheet({ sheet, open = false, onOpenChange = null, roomRef = null }) {
  const narrow = useNarrowScreen();
  const panelRef = useRef(null);
  const openerRef = useRef(null);
  const yieldedRef = useRef(false);
  const titleId = `reference-sheet-title-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  // The room the open drawer takes from the question column.
  const room = useExamToolRoom(roomRef || NO_ROOM, { referenceSheetOpen: open });
  useEffect(() => {
    const element = roomRef?.current;
    if (!element || !room.paddingRight) return undefined;
    const before = element.style.paddingRight;
    const base = Number.parseFloat(window.getComputedStyle(element).paddingRight) || 0;
    element.style.paddingRight = `${base + room.paddingRight}px`;
    return () => { element.style.paddingRight = before; };
  }, [roomRef, room.paddingRight]);

  // Opening: take focus into the panel, say so to the other tool, and remember
  // what opened it. Closing: hand focus back there, unless another tool just
  // took the room and the student is now working in it.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    yieldedRef.current = false;
    openerRef.current = document.activeElement;
    try {
      panelRef.current?.focus({ preventScroll: true });
    } catch {
      panelRef.current?.focus();
    }
    window.dispatchEvent(new CustomEvent(EXAM_TOOL_OPEN_EVENT, { detail: { tool: TOOL } }));
    return () => {
      const opener = openerRef.current;
      openerRef.current = null;
      if (!yieldedRef.current) window.requestAnimationFrame?.(() => opener?.focus?.({ preventScroll: true }));
    };
  }, [open]);

  // The graphing calculator opened where there is no room for both: close,
  // leaving focus with the calculator the student just opened.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined;
    const yieldTo = (event) => {
      if (examToolYieldsTo(TOOL, event?.detail?.tool, window.innerWidth)) {
        yieldedRef.current = true;
        onOpenChangeRef.current?.(false);
      }
    };
    window.addEventListener(EXAM_TOOL_OPEN_EVENT, yieldTo);
    return () => window.removeEventListener(EXAM_TOOL_OPEN_EVENT, yieldTo);
  }, [open]);

  if (!sheet || !open || typeof document === 'undefined') return null;

  const placement = narrow
    ? { left: 0, right: 0, bottom: 0, maxHeight: 'min(88dvh, calc(100dvh - var(--mm-exam-toolbar-offset, 0px)))', borderRadius: '16px 16px 0 0', borderTop: '1px solid var(--mm-border)' }
    : { top: 'var(--mm-exam-toolbar-offset, 0px)', right: 0, bottom: 0, width: `min(${EXAM_TOOL_DRAWERS[TOOL]}px, 100vw)`, borderLeft: '1px solid var(--mm-border)' };

  // Portalled to the body: inside the question it would sit in that column's
  // stacking context, under Work View whatever its own layer says.
  return createPortal(
    <section
      ref={panelRef}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-reference-sheet={narrow ? 'sheet' : 'drawer'}
      data-reference-sheet-id={sheet.id}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onOpenChangeRef.current?.(false);
      }}
      style={{
        position: 'fixed',
        zIndex: EXAM_TOOL_LAYERS[TOOL],
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
          <h2 id={titleId} style={{ margin: 0, fontSize: 'calc(18 * var(--mm-px))', color: 'var(--mm-text-strong)' }}>{sheet.title}</h2>
          {sheet.subtitle ? <div style={{ fontSize: 'calc(12.5 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>{sheet.subtitle}</div> : null}
        </div>
        <button type="button" onClick={() => onOpenChangeRef.current?.(false)} aria-label="Close reference sheet" style={CLOSE}>
          <span aria-hidden="true">✕</span><span style={{ marginLeft: 6 }}>Close</span>
        </button>
      </header>
      <div style={{ padding: '12px 16px 20px' }}>
        <ReferenceSheetContent sheet={sheet} />
      </div>
    </section>,
    document.body,
  );
}

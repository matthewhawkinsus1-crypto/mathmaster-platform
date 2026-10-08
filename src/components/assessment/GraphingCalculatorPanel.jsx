import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ANGLE_MODES, DEFAULT_VIEWPORT, ENTRY_KINDS, GRAPHING_LIMITS, evaluateAt, formatNumber,
  panViewport, parseGraphEntries, readNumberEntry, tableOfValues, zoomViewport,
} from '../../platform/assessment/graphingCalculatorModel.js';
import {
  EXAM_TOOL_DRAWERS, EXAM_TOOL_IDS, EXAM_TOOL_LAYERS, EXAM_TOOL_OPEN_EVENT, examToolYieldsTo,
} from '../../platform/assessment/examToolLayout.js';
import { useExamToolbarOffset, useNarrowScreen } from './examToolDrawerHooks.js';

/*
 * A GRAPHING CALCULATOR FOR SECURE PRACTICE TESTS — OFFLINE, AND THE STUDENT'S
 * OWN.
 *
 * The Digital SAT puts a graphing calculator beside every math question. The
 * platform's CalculatorPanel computes but cannot graph, and a secure practice
 * test cannot load Desmos from the internet, so this panel draws its own:
 * several lines (y = …, f(x) = …, x = …, or a plain calculation), a graph that
 * pans and zooms, a table of values, and a trace at any x.
 *
 * WHAT IT COMPUTES is entirely src/platform/assessment/graphingCalculatorModel.js:
 * a parsed, allowlisted tree compiled to plain functions — never eval, never
 * the Function constructor, never mathjs's evaluator. JSXGraph only DRAWS: it
 * is handed those functions, not text, so its own expression parser never
 * sees what a student typed.
 *
 * JSXGRAPH IS LAZY. It is a large library, so only a student offered this
 * calculator downloads it, and that download starts quietly in the background
 * as soon as the button is on screen — so a connection that drops mid-test
 * does not take the graph with it. If it still cannot load, the lines, values,
 * table and trace keep working; only the picture is missing, and a button
 * tries again.
 *
 * ACCESSIBLE WITHOUT THE PICTURE. Every line is a labelled text box; each says
 * in words which line on the graph is its own (colour AND dash pattern, so
 * colour is never the only cue); the graph has a text description; the table
 * and trace give every value as text; every control is a real button with a
 * name, reachable by keyboard, at least 44px on a phone.
 *
 * BESIDE THE QUESTION. On a wide screen it docks at the left edge and the
 * container moves the question clear of it (onOpenChange +
 * examToolDrawerHooks.js useExamToolRoom); on a phone it rises from the
 * bottom and stops below the exam toolbar. Where it and the reference sheet
 * cannot both sit beside the question, opening one closes the other.
 *
 * Which items offer it is the exam policy's decision
 * (src/platform/assessment/secureExamTools.js `graphingCalculator`); pass that
 * as `available`. The calculator knows nothing about the question.
 */

const TOOL = EXAM_TOOL_IDS.GRAPHING_CALCULATOR;

let jsxGraphLoad = null;
/** JSXGraph, loaded once, on demand. A failed load can be tried again. */
export const loadJsxGraph = () => {
  if (!jsxGraphLoad) {
    jsxGraphLoad = import('jsxgraph')
      .then((module) => module.default || module)
      .catch((error) => {
        jsxGraphLoad = null;
        throw error;
      });
  }
  return jsxGraphLoad;
};

/*
 * One look per line: a colour for each theme and a dash pattern, so two lines
 * are told apart without relying on colour. `dash` is JSXGraph's dash index;
 * `dashArray` draws the same pattern in the line's swatch.
 */
const LINE_STYLES = Object.freeze([
  { light: '#1a73e8', dark: '#8ab4f8', dash: 0, dashArray: '', name: 'blue solid line' },
  { light: '#c5221f', dark: '#f28b82', dash: 2, dashArray: '6 4', name: 'red dashed line' },
  { light: '#137333', dark: '#81c995', dash: 1, dashArray: '2 3', name: 'green dotted line' },
  { light: '#8430ce', dark: '#c58af9', dash: 3, dashArray: '10 5', name: 'purple long-dashed line' },
  { light: '#a84d00', dark: '#fcad70', dash: 4, dashArray: '10 4 2 4', name: 'orange dash-dot line' },
  { light: '#00727a', dark: '#78d9ec', dash: 5, dashArray: '14 6', name: 'teal wide-dashed line' },
]);

const BUTTON = {
  minHeight: 44,
  minWidth: 44,
  padding: '0 12px',
  borderRadius: 9,
  border: '1px solid var(--mm-border-strong, var(--mm-border))',
  background: 'var(--mm-surface)',
  color: 'var(--mm-text-strong)',
  fontWeight: 800,
  fontSize: 15,
  cursor: 'pointer',
};

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

const INPUT = {
  width: '100%',
  minHeight: 44,
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderWidth: 2,
  borderStyle: 'solid',
  borderColor: 'var(--mm-control-border, var(--mm-border))',
  borderRadius: 8,
  fontSize: 17,
  fontFamily: 'inherit',
  background: 'var(--mm-surface)',
  color: 'var(--mm-text-strong)',
  minWidth: 0,
};

const SECTION_LABEL = { fontSize: 12, fontWeight: 900, color: 'var(--mm-text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' };

// Keys a phone keyboard hides behind a symbol page.
const ENTRY_KEYS = Object.freeze([
  { label: 'x', text: 'x', name: 'Insert x' },
  { label: 'xʸ', text: '^', name: 'Insert power sign' },
  { label: '(', text: '(', name: 'Insert open bracket' },
  { label: ')', text: ')', name: 'Insert close bracket' },
  { label: '√', text: 'sqrt(', name: 'Insert square root' },
  { label: 'π', text: 'pi', name: 'Insert pi' },
  { label: '|x|', text: '|', name: 'Insert absolute value bar' },
  { label: '=', text: '=', name: 'Insert equals sign' },
]);

let nextLineId = 1;
const newLine = (text = '') => ({ id: nextLineId++, text });

const readToken = (element, name, fallback) => {
  try {
    const value = window.getComputedStyle(element).getPropertyValue(name).trim();
    return value || fallback;
  } catch {
    return fallback;
  }
};

/** Is the surface behind the graph dark? Decides the line palette. */
const isDarkSurface = (element) => {
  try {
    const match = window.getComputedStyle(element).backgroundColor.match(/\d+(\.\d+)?/g);
    if (!match) return false;
    const [r, g, b] = match.map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.45;
  } catch {
    return false;
  }
};

const Swatch = ({ style, dark }) => (
  <svg width="30" height="12" viewBox="0 0 30 12" aria-hidden="true" style={{ flex: '0 0 auto' }}>
    <line x1="1" y1="6" x2="29" y2="6" stroke={dark ? style.dark : style.light} strokeWidth="3" strokeDasharray={style.dashArray || undefined} strokeLinecap="round" />
  </svg>
);

const describeEntry = (entry, style) => {
  if (!entry || entry.kind === ENTRY_KINDS.EMPTY) return '';
  if (entry.kind === ENTRY_KINDS.ERROR) return entry.error;
  if (entry.kind === ENTRY_KINDS.VALUE) return `= ${formatNumber(entry.value)}`;
  if (entry.kind === ENTRY_KINDS.VERTICAL) return `Vertical line at x = ${formatNumber(entry.x)}: the ${style.name}.`;
  return `Graphed as the ${style.name}.`;
};

/**
 * @param available     whether this item offers the graphing calculator
 *                      (secureExamTools.js). False hides it and keeps the lines.
 * @param onOpened      optional: () => void each time the student opens it
 * @param onOpenChange  optional: (open) => void on every open and close — the
 *                      container pads the question column (useExamToolRoom)
 * @param prefetch      start loading JSXGraph in the background (default on)
 */
export default function GraphingCalculatorPanel({
  available = true,
  onOpened = null,
  onOpenChange = null,
  label = 'Graphing calculator',
  launcherStyle = null,
  defaultOpen = false,
  prefetch = true,
}) {
  const baseId = `mm-graphing-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const narrow = useNarrowScreen();
  const [open, setOpenState] = useState(Boolean(defaultOpen));
  const [lines, setLines] = useState(() => [newLine('')]);
  const [angleMode, setAngleMode] = useState(ANGLE_MODES.RADIANS);
  const [view, setView] = useState(() => [...DEFAULT_VIEWPORT]);
  const [graphState, setGraphState] = useState('idle');
  const [retry, setRetry] = useState(0);
  const [tableLine, setTableLine] = useState(null);
  const [tableStart, setTableStart] = useState('-3');
  const [tableStep, setTableStep] = useState('1');
  const [traceX, setTraceX] = useState('');
  const [dark, setDark] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const launcherRef = useRef(null);
  const addButtonRef = useRef(null);
  const panelRef = useRef(null);
  const boardBoxRef = useRef(null);
  const boardRef = useRef(null);
  const drawnRef = useRef([]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const inputRefs = useRef(new Map());
  const activeLineRef = useRef(null);
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
    // The reference sheet steps aside where the two cannot share the screen.
    if (next && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EXAM_TOOL_OPEN_EVENT, { detail: { tool: TOOL } }));
  }, []);

  // The reference sheet opened where there is no room for both: close,
  // leaving focus with the sheet the student just opened.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const yieldTo = (event) => {
      if (openRef.current && examToolYieldsTo(TOOL, event?.detail?.tool, window.innerWidth)) setOpen(false);
    };
    window.addEventListener(EXAM_TOOL_OPEN_EVENT, yieldTo);
    return () => window.removeEventListener(EXAM_TOOL_OPEN_EVENT, yieldTo);
  }, [setOpen]);

  const parsed = useMemo(
    () => parseGraphEntries(lines.map((line) => line.text), { angleMode }),
    [lines, angleMode],
  );
  const graphable = useMemo(
    () => lines.map((line, index) => ({ line, index, entry: parsed[index] })).filter(({ entry }) => entry?.kind === ENTRY_KINDS.FUNCTION),
    [lines, parsed],
  );

  // Not offered on this item: close, keep the lines for the next item that is.
  useEffect(() => {
    if (!available && open) setOpen(false);
  }, [available, open, setOpen]);

  // Load the graph library while the student is still reading the question.
  useEffect(() => {
    if (!available || !prefetch) return undefined;
    const start = () => { loadJsxGraph().catch(() => {}); };
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(start, { timeout: 4000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(start, 1500);
    return () => window.clearTimeout(timer);
  }, [available, prefetch]);

  // The line colours follow the theme the panel is drawn in.
  useEffect(() => {
    if (open && panelRef.current) setDark(isDarkSurface(panelRef.current));
  }, [open]);

  // Focus moves into the panel when it opens.
  useEffect(() => {
    if (!open) return;
    const first = inputRefs.current.get(lines[0]?.id);
    window.requestAnimationFrame?.(() => {
      try { (first || panelRef.current)?.focus({ preventScroll: true }); } catch { (first || panelRef.current)?.focus(); }
    });
  // Only on opening; typing must not pull focus back to the first line.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The board: created when the panel opens, freed when it closes.
  useEffect(() => {
    if (!open || !available) return undefined;
    let cancelled = false;
    let board = null;
    let library = null;
    setGraphState('loading');
    loadJsxGraph().then((JXG) => {
      const box = boardBoxRef.current;
      if (cancelled || !box) return;
      library = JXG;
      const darkSurface = isDarkSurface(box);
      const axisColor = readToken(box, '--mm-text-muted', darkSurface ? '#b4bdca' : '#5f6368');
      const gridColor = readToken(box, '--mm-border', darkSurface ? '#3c4250' : '#dadce0');
      const textColor = readToken(box, '--mm-text', darkSurface ? '#d7dce5' : '#3c4043');
      const axis = {
        strokeColor: axisColor,
        highlight: false,
        ticks: {
          strokeColor: gridColor,
          strokeOpacity: 1,
          majorHeight: -1,
          minorTicks: 0,
          insertTicks: true,
          ticksDistance: 2,
          label: { strokeColor: textColor, fontSize: 11, highlight: false },
        },
      };
      board = JXG.JSXGraph.initBoard(box, {
        boundingBox: [...viewRef.current],
        keepAspectRatio: false,
        axis: true,
        defaultAxes: { x: axis, y: axis },
        showCopyright: false,
        showNavigation: false,
        showInfobox: false,
        pan: { enabled: true, needShift: false, needTwoFingers: false },
        zoom: { enabled: true, wheel: true, needShift: false, pinch: true, min: 0.0005, max: 5000 },
        keyboard: { enabled: false },
        resize: { enabled: true, throttle: 100 },
      });
      board.on('boundingbox', () => {
        const next = board.getBoundingBox();
        if (Array.isArray(next) && next.every(Number.isFinite)) setView([...next]);
      });
      boardRef.current = board;
      setGraphState('ready');
    }).catch(() => {
      if (!cancelled) setGraphState('failed');
    });
    return () => {
      cancelled = true;
      drawnRef.current = [];
      boardRef.current = null;
      if (board && library) {
        try { library.JSXGraph.freeBoard(board); } catch { /* already gone */ }
      }
    };
  }, [open, available, retry]);

  // Draw every graphable line. JSXGraph is handed functions, never text.
  useEffect(() => {
    const board = boardRef.current;
    if (!board || graphState !== 'ready') return;
    board.suspendUpdate();
    drawnRef.current.forEach((element) => {
      try { board.removeObject(element); } catch { /* already removed */ }
    });
    drawnRef.current = [];
    parsed.forEach((entry, index) => {
      const style = LINE_STYLES[index % LINE_STYLES.length];
      const look = { strokeColor: dark ? style.dark : style.light, strokeWidth: 2.5, dash: style.dash, highlight: false, fixed: true, withLabel: false };
      if (entry.kind === ENTRY_KINDS.FUNCTION) {
        const y = (x) => {
          const value = entry.evaluate(x);
          return value === null ? NaN : value;
        };
        drawnRef.current.push(board.create('functiongraph', [y], look));
      } else if (entry.kind === ENTRY_KINDS.VERTICAL) {
        // c + a·x + b·y = 0 is the line x = entry.x.
        drawnRef.current.push(board.create('line', [-entry.x, 1, 0], { ...look, straightFirst: true, straightLast: true }));
      }
    });
    board.unsuspendUpdate();
  }, [parsed, graphState, dark]);

  const applyView = (next) => {
    setView(next);
    boardRef.current?.setBoundingBox(next, false);
  };

  // Say the line being typed in, once the student pauses.
  const activeIndex = lines.findIndex((line) => line.id === activeLineRef.current);
  const activeStatus = activeIndex >= 0 ? describeEntry(parsed[activeIndex], LINE_STYLES[activeIndex % LINE_STYLES.length]) : '';
  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => setAnnouncement(activeStatus ? `Line ${activeIndex + 1}: ${activeStatus}` : ''), 900);
    return () => window.clearTimeout(timer);
  }, [open, activeStatus, activeIndex]);

  const updateLine = (id, text) => setLines((current) => current.map((line) => (line.id === id ? { ...line, text } : line)));

  const focusLine = (id) => window.requestAnimationFrame?.(() => inputRefs.current.get(id)?.focus());

  const addLine = () => {
    if (lines.length >= GRAPHING_LIMITS.maxEntries) return;
    const line = newLine('');
    setLines((current) => [...current, line]);
    focusLine(line.id);
  };

  // The button pressed goes with its line, so focus moves to the line before
  // (or the one after, or a fresh empty line) instead of dropping to the page
  // — where Escape would no longer reach the panel.
  const removeLine = (id) => {
    const index = lines.findIndex((line) => line.id === id);
    const remaining = lines.filter((line) => line.id !== id);
    const next = remaining.length ? remaining : [newLine('')];
    setLines(next);
    const target = next[Math.min(Math.max(0, index - 1), next.length - 1)];
    activeLineRef.current = target.id;
    window.requestAnimationFrame?.(() => (inputRefs.current.get(target.id) || addButtonRef.current || panelRef.current)?.focus());
  };

  const insertKey = (text) => {
    const id = activeLineRef.current ?? lines[lines.length - 1]?.id;
    const input = inputRefs.current.get(id);
    const line = lines.find((entry) => entry.id === id);
    if (!input || !line) return;
    const startAt = input.selectionStart ?? line.text.length;
    const endAt = input.selectionEnd ?? startAt;
    const next = `${line.text.slice(0, startAt)}${text}${line.text.slice(endAt)}`;
    if (next.length > GRAPHING_LIMITS.maxInputLength) return;
    updateLine(id, next);
    window.requestAnimationFrame?.(() => {
      input.focus();
      const caret = startAt + text.length;
      try { input.setSelectionRange(caret, caret); } catch { /* not a text input */ }
    });
  };

  const close = () => {
    setOpen(false);
    window.requestAnimationFrame?.(() => launcherRef.current?.focus?.({ preventScroll: true }));
  };

  if (!available) return null;

  // The small boxes read numbers the way a line does (1/2, −3, 2pi); an empty
  // box is no number, never 0.
  const tableEntry = graphable.find(({ line }) => line.id === tableLine) || graphable[0] || null;
  const tableRows = tableEntry
    ? tableOfValues(tableEntry.entry, { start: readNumberEntry(tableStart, { angleMode }), step: readNumberEntry(tableStep, { angleMode }), rows: 7 })
    : [];
  const traceTyped = String(traceX).trim() !== '';
  const traceNumber = traceTyped ? readNumberEntry(traceX, { angleMode }) : null;
  const traceValue = traceTyped ? (traceNumber ?? NaN) : null;

  const graphDescription = (() => {
    const drawn = parsed
      .map((entry, index) => ({ entry, index, style: LINE_STYLES[index % LINE_STYLES.length] }))
      .filter(({ entry }) => entry.kind === ENTRY_KINDS.FUNCTION || entry.kind === ENTRY_KINDS.VERTICAL)
      .map(({ entry, index, style }) => `line ${index + 1}, ${entry.text.trim()}, as the ${style.name}`);
    const [left, top, right, bottom] = view;
    const extent = `x from ${formatNumber(left)} to ${formatNumber(right)}, y from ${formatNumber(bottom)} to ${formatNumber(top)}`;
    return drawn.length ? `Graph showing ${drawn.join('; ')}. ${extent}.` : `Empty graph, ${extent}.`;
  })();

  // Below whatever toolbar the exam sets --mm-exam-toolbar-offset to (0 by
  // default): docked left on a wide screen, as the test-day calculator is; on
  // a phone a sheet that rises no higher than the toolbar's bottom edge.
  const placement = narrow
    ? { left: 0, right: 0, bottom: 0, maxHeight: 'min(92dvh, calc(100dvh - var(--mm-exam-toolbar-offset, 0px)))', borderRadius: '16px 16px 0 0', borderTop: '1px solid var(--mm-border)' }
    : { top: 'var(--mm-exam-toolbar-offset, 0px)', left: 0, bottom: 0, width: `min(${EXAM_TOOL_DRAWERS[TOOL]}px, 100vw)`, borderRight: '1px solid var(--mm-border)' };

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${baseId}-panel` : undefined}
        data-graphing-calculator-launcher
        onClick={() => {
          if (!open) onOpened?.();
          setOpen(!open);
        }}
        style={{ ...LAUNCHER, ...(open ? { background: 'var(--mm-primary-soft)' } : null), ...launcherStyle }}
      >
        <span aria-hidden="true">📈</span> {label}
      </button>
      {/* Portalled to the body: inside a sticky toolbar the panel would be held
          in the toolbar's stacking context, under Work View whatever its own
          layer says. */}
      {open && typeof document !== 'undefined' && createPortal(
        <section
          ref={panelRef}
          id={`${baseId}-panel`}
          role="dialog"
          aria-modal="false"
          aria-labelledby={`${baseId}-title`}
          tabIndex={-1}
          data-graphing-calculator={narrow ? 'sheet' : 'drawer'}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            close();
          }}
          style={{
            position: 'fixed',
            zIndex: EXAM_TOOL_LAYERS[TOOL],
            '--mm-exam-toolbar-offset': toolbarOffset,
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
          <header style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', background: 'var(--mm-surface-raised, var(--mm-surface))', borderBottom: '1px solid var(--mm-border)' }}>
            <h2 id={`${baseId}-title`} style={{ margin: 0, fontSize: 18, color: 'var(--mm-text-strong)' }}>Graphing calculator</h2>
            <button type="button" onClick={close} aria-label="Close graphing calculator" style={BUTTON}>
              <span aria-hidden="true">✕</span><span style={{ marginLeft: 6 }}>Close</span>
            </button>
          </header>

          <div style={{ padding: '12px 14px 22px', display: 'grid', gap: 14 }}>
            <div>
              <div id={`${baseId}-lines-label`} style={SECTION_LABEL}>Lines</div>
              <p style={{ margin: '2px 0 8px', fontSize: 13, color: 'var(--mm-text-muted)', lineHeight: 1.45 }}>
                Type y = … to graph, x = … for a vertical line, or a calculation to get its value.
              </p>
              <ol aria-labelledby={`${baseId}-lines-label`} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                {lines.map((line, index) => {
                  const style = LINE_STYLES[index % LINE_STYLES.length];
                  const entry = parsed[index];
                  const status = describeEntry(entry, style);
                  const inputId = `${baseId}-line-${line.id}`;
                  return (
                    <li key={line.id} data-graphing-line={index + 1} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 8, alignItems: 'center' }}>
                      <Swatch style={style} dark={dark} />
                      <input
                        id={inputId}
                        ref={(element) => {
                          if (element) inputRefs.current.set(line.id, element);
                          else inputRefs.current.delete(line.id);
                        }}
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        maxLength={GRAPHING_LIMITS.maxInputLength}
                        aria-label={`Line ${index + 1}`}
                        aria-describedby={status ? `${inputId}-status` : undefined}
                        aria-invalid={entry?.kind === ENTRY_KINDS.ERROR ? 'true' : undefined}
                        placeholder={index === 0 ? 'y = x^2' : ''}
                        value={line.text}
                        onFocus={() => { activeLineRef.current = line.id; }}
                        onChange={(event) => updateLine(line.id, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return;
                          event.preventDefault();
                          const next = lines[index + 1];
                          if (next) focusLine(next.id);
                          else addLine();
                        }}
                        style={{ ...INPUT, borderColor: entry?.kind === ENTRY_KINDS.ERROR ? 'var(--mm-warning-border, #f9ab00)' : INPUT.borderColor }}
                      />
                      <button type="button" onClick={() => removeLine(line.id)} aria-label={`Remove line ${index + 1}`} style={{ ...BUTTON, padding: 0, color: 'var(--mm-text-muted)' }}>
                        <span aria-hidden="true">✕</span>
                      </button>
                      {status && (
                        <div
                          id={`${inputId}-status`}
                          data-graphing-status={entry.kind}
                          style={{ gridColumn: '2 / 4', fontSize: 13.5, lineHeight: 1.4, fontWeight: entry.kind === ENTRY_KINDS.VALUE ? 900 : 600, color: entry.kind === ENTRY_KINDS.ERROR ? 'var(--mm-warning-text)' : entry.kind === ENTRY_KINDS.VALUE ? 'var(--mm-text-strong)' : 'var(--mm-text-muted)' }}
                        >
                          {status}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              <div role="group" aria-label="Math keys" style={{ display: 'grid', gridTemplateColumns: `repeat(${narrow ? 4 : ENTRY_KEYS.length}, minmax(0, 1fr))`, gap: 6, marginTop: 10 }}>
                {ENTRY_KEYS.map((key) => (
                  <button
                    key={key.label}
                    type="button"
                    aria-label={key.name}
                    // Keep the caret (and a phone's keyboard) in the line.
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => insertKey(key.text)}
                    style={{ ...BUTTON, padding: 0, fontFamily: 'serif', fontSize: 17 }}
                  >
                    {key.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' }}>
                <button ref={addButtonRef} type="button" onClick={addLine} disabled={lines.length >= GRAPHING_LIMITS.maxEntries} style={{ ...BUTTON, opacity: lines.length >= GRAPHING_LIMITS.maxEntries ? 0.55 : 1 }}>
                  + Add line
                </button>
                <div role="group" aria-label="Angles" style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                  {[ANGLE_MODES.RADIANS, ANGLE_MODES.DEGREES].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={angleMode === mode}
                      onClick={() => setAngleMode(mode)}
                      style={{ ...BUTTON, fontSize: 13.5, background: angleMode === mode ? 'var(--mm-primary-soft)' : BUTTON.background, color: angleMode === mode ? 'var(--mm-primary-text)' : BUTTON.color }}
                    >
                      {mode === ANGLE_MODES.RADIANS ? 'Radians' : 'Degrees'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div style={SECTION_LABEL}>Graph</div>
              <div style={{ position: 'relative', marginTop: 6 }}>
                <div
                  id={`${baseId}-board`}
                  ref={boardBoxRef}
                  role="img"
                  aria-label={graphDescription}
                  data-graphing-board={graphState}
                  style={{ width: '100%', height: narrow ? 250 : 300, position: 'relative', overflow: 'hidden', touchAction: 'none', borderRadius: 10, border: '1px solid var(--mm-border)', background: 'var(--mm-surface)', boxSizing: 'border-box' }}
                />
                {graphState !== 'ready' && (
                  <div role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 16, textAlign: 'center', color: 'var(--mm-text-muted)', fontSize: 14 }}>
                    {graphState === 'failed' ? (
                      <div>
                        <p style={{ margin: '0 0 8px' }}>The graph could not load. Your lines, the table and the trace still work.</p>
                        <button type="button" onClick={() => setRetry((count) => count + 1)} style={BUTTON}>Try again</button>
                      </div>
                    ) : 'Loading the graph…'}
                  </div>
                )}
              </div>
              {/* Seven across on a Chromebook; on a phone the zoom row and
                  the arrow row, so "Reset" keeps room for its word. */}
              <div role="group" aria-label="Move and zoom the graph" style={{ display: 'grid', gridTemplateColumns: `repeat(${narrow ? 4 : 7}, minmax(0, 1fr))`, gap: 6, marginTop: 8 }}>
                <button type="button" aria-label="Zoom in" onClick={() => applyView(zoomViewport(view, 0.5))} style={BUTTON}>+</button>
                <button type="button" aria-label="Zoom out" onClick={() => applyView(zoomViewport(view, 2))} style={BUTTON}>−</button>
                <button type="button" aria-label="Reset the view" onClick={() => applyView([...DEFAULT_VIEWPORT])} style={{ ...BUTTON, padding: '0 6px', fontSize: 13.5, gridColumn: narrow ? 'span 2' : undefined }}>Reset</button>
                <button type="button" aria-label="Move left" onClick={() => applyView(panViewport(view, -0.25, 0))} style={BUTTON}>←</button>
                <button type="button" aria-label="Move right" onClick={() => applyView(panViewport(view, 0.25, 0))} style={BUTTON}>→</button>
                <button type="button" aria-label="Move up" onClick={() => applyView(panViewport(view, 0, 0.25))} style={BUTTON}>↑</button>
                <button type="button" aria-label="Move down" onClick={() => applyView(panViewport(view, 0, -0.25))} style={BUTTON}>↓</button>
              </div>
            </div>

            <div>
              <div style={SECTION_LABEL}>Trace</div>
              <label htmlFor={`${baseId}-trace`} style={{ display: 'block', marginTop: 4, fontSize: 14, fontWeight: 700, color: 'var(--mm-text)' }}>Find y when x =</label>
              <input
                id={`${baseId}-trace`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={traceX}
                onChange={(event) => setTraceX(event.target.value.slice(0, 24))}
                style={{ ...INPUT, marginTop: 6, maxWidth: 200 }}
              />
              {traceValue !== null && (
                <ul aria-live="polite" style={{ margin: '8px 0 0', paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 4, fontSize: 14.5 }}>
                  {!Number.isFinite(traceValue) && <li style={{ color: 'var(--mm-warning-text)' }}>Type a number for x.</li>}
                  {Number.isFinite(traceValue) && !graphable.length && <li style={{ color: 'var(--mm-text-muted)' }}>Graph a line first.</li>}
                  {Number.isFinite(traceValue) && graphable.map(({ line, index, entry }) => (
                    <li key={line.id} data-graphing-trace={index + 1} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Swatch style={LINE_STYLES[index % LINE_STYLES.length]} dark={dark} />
                      <span>Line {index + 1}: y = <strong>{formatNumber(evaluateAt(entry, traceValue))}</strong></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <details>
              <summary style={{ ...SECTION_LABEL, cursor: 'pointer', padding: '8px 0' }}>Table of values</summary>
              {graphable.length ? (
                <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 700 }}>
                      Line
                      <select
                        value={tableEntry?.line.id ?? ''}
                        onChange={(event) => setTableLine(Number(event.target.value))}
                        style={{ ...INPUT, marginTop: 4 }}
                      >
                        {graphable.map(({ line, index }) => <option key={line.id} value={line.id}>Line {index + 1}</option>)}
                      </select>
                    </label>
                    <label style={{ fontSize: 13, fontWeight: 700 }}>
                      Start at x =
                      <input type="text" inputMode="decimal" autoComplete="off" value={tableStart} onChange={(event) => setTableStart(event.target.value.slice(0, 24))} style={{ ...INPUT, marginTop: 4 }} />
                    </label>
                    <label style={{ fontSize: 13, fontWeight: 700 }}>
                      Step
                      <input type="text" inputMode="decimal" autoComplete="off" value={tableStep} onChange={(event) => setTableStep(event.target.value.slice(0, 24))} style={{ ...INPUT, marginTop: 4 }} />
                    </label>
                  </div>
                  {tableRows.length ? (
                    <table data-graphing-table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 360, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
                      <caption style={{ textAlign: 'left', fontSize: 13, color: 'var(--mm-text-muted)', paddingBottom: 4 }}>Values for line {tableEntry.index + 1}</caption>
                      <thead>
                        <tr>
                          <th scope="col" style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid var(--mm-border)' }}>x</th>
                          <th scope="col" style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid var(--mm-border)' }}>y</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.map((row) => (
                          <tr key={row.x}>
                            <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--mm-border)' }}>{formatNumber(row.x)}</td>
                            <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--mm-border)' }}>{formatNumber(row.y)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <p role="status" style={{ margin: 0, fontSize: 13.5, color: 'var(--mm-warning-text)' }}>Type a number to start at and a step that is not 0.</p>}
                </div>
              ) : <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--mm-text-muted)' }}>Graph a line first.</p>}
            </details>
          </div>
          <div aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{announcement}</div>
        </section>,
        document.body,
      )}
    </>
  );
}

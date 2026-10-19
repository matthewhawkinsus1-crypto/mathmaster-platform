/*
 * WHAT A FIGURE ALREADY SAYS, FOR READ ALOUD (pass 3, wave 7).
 *
 * Read aloud read the prompt, the information, matrices and fields, and
 * skipped every table, graph and tool drawing. The figures already know what
 * they show: a coordinate plane carries its description (graphDescription.js),
 * the static question graph too (GraphDisplay), a table its rows. So instead
 * of a second describer that could drift — or say more — a figure publishes
 * what it already says, and QuestionEngine's reader (questionReading.js) puts
 * it in the question's reading.
 *
 * THE SAME RULE AS THE FIGURE. A plane's description says only the kinds of
 * marks while the question can be answered ("1 line. Positions are not read
 * out…"), and positions only once it is closed (QuestionLifecycleContext's
 * positionsReadable). What it publishes is that text, so Read aloud can never
 * say a position the figure would not: on an exit ticket, quiz or test before
 * release nothing read gives a position or a value the question asks for.
 *
 *   <FigureReadingPortProvider publish={fn}>   the host (QuestionEngine)
 *   <PublishFigureReading entry={…} />         a figure, inside its render
 *
 * An entry is { kind: 'figure', label, text } or { kind: 'table', label,
 * table } (displayTable.js; the reader words it in the screen's language).
 * Outside a host (a teacher screen, a review) nothing is published.
 */
import React, { createContext, useContext, useEffect, useId } from 'react';

const FigureReadingPortContext = createContext(null);

export function FigureReadingPortProvider({ publish, children }) {
  return React.createElement(FigureReadingPortContext.Provider, { value: publish || null }, children);
}

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** One comparable string per entry: a host keeps its state when nothing changed. */
export const figureEntryKey = (entry) => (entry ? JSON.stringify(entry) : '');

const normalizeEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.kind === 'table') {
    const table = entry.table;
    if (!table || !Array.isArray(table.columns) || !table.columns.length || !Array.isArray(table.rows) || !table.rows.length) return null;
    return { kind: 'table', label: clean(entry.label), table };
  }
  const text = clean(entry.text);
  return text ? { kind: 'figure', label: clean(entry.label), text } : null;
};

/**
 * Publish while mounted. An update keeps its place in the reading (the entry
 * is replaced, not removed and added again), so a plane whose description
 * follows the student's points is still read where it is on the screen.
 */
export function usePublishFigureReading(entry) {
  const publish = useContext(FigureReadingPortContext);
  const id = useId();
  const normalized = normalizeEntry(entry);
  const key = figureEntryKey(normalized);
  useEffect(() => {
    if (!publish) return;
    publish(id, normalized);
    // `key` stands for `normalized`'s content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publish, id, key]);
  useEffect(() => (publish ? () => publish(id, null) : undefined), [publish, id]);
}

export function PublishFigureReading({ entry }) {
  usePublishFigureReading(entry);
  return null;
}

/**
 * The host's state update: returns `published` itself when nothing changed,
 * so a figure re-rendering with the same description re-renders nothing.
 * Order is first publication (the order the figures mounted on the screen).
 */
export const updateFigureReadings = (published, id, entry) => {
  const list = Array.isArray(published) ? published : [];
  const index = list.findIndex((item) => item.id === id);
  if (!entry) return index < 0 ? list : list.filter((item) => item.id !== id);
  if (index >= 0) {
    if (figureEntryKey(list[index].entry) === figureEntryKey(entry)) return list;
    const next = [...list];
    next[index] = { id, entry };
    return next;
  }
  return [...list, { id, entry }];
};

/** The entries to read: the same figure drawn twice (Work View's enlarged copy) is read once. */
export const figureReadingEntries = (published) => {
  const seen = new Set();
  return (Array.isArray(published) ? published : []).map((item) => item.entry).filter((entry) => {
    const key = figureEntryKey(entry);
    if (!entry || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

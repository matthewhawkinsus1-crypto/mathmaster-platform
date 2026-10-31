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
 *   <FigureReadingScope shown={bool}>           a part kept mounted while hidden
 *   <PublishFigureReading entry={…} />         a figure, inside its render
 *
 * An entry is { kind: 'figure', label, text, say } or { kind: 'table', label,
 * table } (displayTable.js; the reader words it in the screen's language).
 * `say` is the same reading as messages (figureSay.js), when the figure's
 * generator gives them: under an authored Spanish translation it is read in
 * Spanish (AX05). Without it the figure is read in English, and the reader
 * says so. Outside a host (a teacher screen, a review) nothing is published.
 *
 * A TABLE A TOOL DRAWS ITSELF (AX10) is published the same way, from the rows
 * the tool draws and only while it draws them: a cell the student fills in is
 * what they typed ({ entered }) or blank, never its answer, and a table that
 * would state an answer is not drawn — or published — before it may be shown.
 */
import React, { createContext, useContext, useEffect, useId } from 'react';

const FigureReadingPortContext = createContext(null);

export function FigureReadingPortProvider({ publish, children }) {
  return React.createElement(FigureReadingPortContext.Provider, { value: publish || null }, children);
}

/**
 * Only what the screen shows is read. A part of the screen that stays mounted
 * while hidden (Focus Mode's other steps, kept mounted and hidden with CSS)
 * renders inside <FigureReadingScope shown={false}>: its figures publish
 * nothing. One element type whether shown or not, so moving between steps
 * never remounts them (and their work).
 */
export function FigureReadingScope({ shown, children }) {
  const publish = useContext(FigureReadingPortContext);
  return React.createElement(FigureReadingPortContext.Provider, { value: shown ? publish : null }, children);
}

/** Where a figure here would publish: null outside a host or in a hidden scope. */
export const useFigureReadingPublisher = () => useContext(FigureReadingPortContext);

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
  if (!text) return null;
  return Array.isArray(entry.say)
    ? { kind: 'figure', label: clean(entry.label), text, say: entry.say }
    : { kind: 'figure', label: clean(entry.label), text };
};

/**
 * Publish while mounted. An update keeps its place in the reading (the entry
 * is replaced, not removed and added again), so a plane whose description
 * follows the student's points is still read where it is on the screen.
 */
export function usePublishFigureReading(entry) {
  const publish = useFigureReadingPublisher();
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

/**
 * The entries to read, in screen order. Two figures that say the same thing
 * are two figures (two graph cards, each "1 line."), so each is read: Work
 * View enlarges the figure itself and draws no second copy.
 */
export const figureReadingEntries = (published) => (Array.isArray(published) ? published : []).map((item) => item.entry).filter(Boolean);

import React from 'react';
import MathDisplay from '../../MathDisplay';
import { spokenMathLabel } from '../../platform/language/mathSpeechLabel.js';
import { SR_ONLY_STYLE } from '../../ui/srOnly.js';

/*
 * A MATRIX AS A STUDENT READS IT ON PAPER: numbers in rows and columns between
 * square brackets, with the row and column titles the lesson uses (shoe
 * widths down the side, sizes across the top; sprinters by finishing place).
 *
 * One component draws every matrix MathMaster shows — a given in a question's
 * prompt (QuestionVisual), a matrix inside the Matrix Lab, a product a student
 * is filling in — so a matrix looks the same wherever it appears.
 *
 * The visual grid is a CSS grid with the brackets as grid items. A screen
 * reader gets a real table instead ("Matrix A, 4 by 5"), with each row and
 * column header spoken, because a grid of numbers read cell by cell with no
 * headers is not a matrix. When the caller renders interactive cells (an input
 * to fill, a cell to tap), those cells are the accessible surface and carry
 * their own labels, so the duplicate table is left out.
 *
 *   rows         [[cell]]  authored text: 3, -2, 2/3, \frac{3}{2}
 *   renderCell   (i, j, text) => node   replaces the read-only cell
 *   highlightRow / highlightCol   a row/column picked out (row × column)
 */

const isFraction = (value) => /\/|\\frac/.test(String(value ?? ''));

export const matrixCellText = (value) => String(value ?? '').replace(/-/g, '−');

export function MatrixCellValue({ value }) {
  const text = String(value ?? '').trim();
  if (!text) return <span aria-hidden="true" style={{ color: 'var(--mm-text-subtle)' }}>□</span>;
  if (isFraction(text)) return <MathDisplay value={text} format="ascii-math" inline />;
  return <span>{matrixCellText(text)}</span>;
}

const labelStyle = {
  fontSize: 'calc(13 * var(--mm-px))',
  fontWeight: 800,
  color: 'var(--mm-primary-text)',
  whiteSpace: 'nowrap',
  padding: '0 6px',
  display: 'flex',
  alignItems: 'center',
};

export default function MatrixGrid({
  name = '',
  rows = [],
  rowLabels = null,
  colLabels = null,
  rowTitle = null,
  colTitle = null,
  caption = null,
  renderCell = null,
  highlightRow = null,
  highlightCol = null,
  cellMinWidth = 44,
  fontSize = 20,
  showName = true,
  ariaLabel = null,
}) {
  const height = rows.length;
  const width = height ? Math.max(...rows.map((row) => (Array.isArray(row) ? row.length : 0))) : 0;
  if (!height || !width) return null;
  const hasRowLabels = Array.isArray(rowLabels) && rowLabels.length === height;
  const hasColLabels = Array.isArray(colLabels) && colLabels.length === width;
  const interactive = typeof renderCell === 'function';
  const dimensionsText = `${height} by ${width}`;
  const spokenName = name ? `Matrix ${name}` : 'Matrix';
  const firstRow = hasColLabels ? 2 : 1;
  // Columns: [name =] [row labels] [ [ ] [cells…] [ ] ]
  const nameColumn = showName && name ? 1 : 0;
  const labelColumn = hasRowLabels ? 1 : 0;
  const bracketStart = 1 + nameColumn + labelColumn;
  // The name and label columns are max-content: an `auto` track was squeezed
  // to fit a phone, and a long row label ("Alejandra") spilled left over
  // "A =". The grid keeps its full width and its box scrolls instead.
  const template = [
    nameColumn ? 'max-content' : null,
    labelColumn ? 'max-content' : null,
    '9px',
    `repeat(${width}, minmax(${cellMinWidth}px, auto))`,
    '9px',
  ].filter(Boolean).join(' ');

  const bracket = (side) => ({
    gridColumn: side === 'left' ? bracketStart : bracketStart + width + 1,
    gridRow: `${firstRow} / span ${height}`,
    border: '2.5px solid var(--mm-text-strong)',
    [side === 'left' ? 'borderRight' : 'borderLeft']: 'none',
    borderRadius: side === 'left' ? '3px 0 0 3px' : '0 3px 3px 0',
  });

  return (
    <figure
      data-matrix-grid={name || 'matrix'}
      // minWidth 0: a flex item will not shrink below its content otherwise,
      // and a matrix wider than a phone then overflows its panel — centred,
      // so its row labels are cut off on the left — instead of scrolling.
      style={{ margin: 0, display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6, maxWidth: '100%', minWidth: 0 }}
    >
      {colTitle && hasColLabels ? (
        <div aria-hidden={!interactive ? 'true' : undefined} style={{ ...labelStyle, justifyContent: 'center', color: 'var(--mm-text-muted)' }}>{colTitle}</div>
      ) : null}
      {/* overflowX: auto alone makes overflow-y compute to auto too, and a
          column of stacked fractions (CW 5's S) drew a 5px vertical scrollbar
          (P2-11). The box scrolls sideways only; the block padding gives a
          stacked fraction's bar and descender the room they were clipped by. */}
      <div data-matrix-scroll="true" style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: '100%', minWidth: 0, overflowX: 'auto', overflowY: 'hidden', paddingBlock: 4, alignSelf: 'stretch', justifyContent: 'safe center' }}>
        {rowTitle && hasRowLabels ? (
          <div aria-hidden="true" style={{ ...labelStyle, flex: '0 0 auto', writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: 'var(--mm-text-muted)' }}>{rowTitle}</div>
        ) : null}
        <div
          aria-hidden={interactive ? undefined : 'true'}
          role={interactive ? 'group' : undefined}
          aria-label={interactive ? (ariaLabel || `${spokenName}, ${dimensionsText}`) : undefined}
          style={{
            display: 'grid',
            flex: '0 0 auto',
            gridTemplateColumns: template,
            alignItems: 'stretch',
            columnGap: 0,
            rowGap: 2,
            fontSize: `calc(${fontSize} * var(--mm-px))`,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--mm-text-strong)',
          }}
        >
          {nameColumn ? (
            <div style={{ gridColumn: 1, gridRow: `${firstRow} / span ${height}`, display: 'flex', alignItems: 'center', paddingRight: 8, fontStyle: 'italic', fontFamily: 'serif', fontWeight: 700 }}>
              {name}&nbsp;=
            </div>
          ) : null}
          {hasColLabels ? colLabels.map((label, j) => (
            <div key={`c${j}`} style={{ ...labelStyle, gridColumn: bracketStart + 1 + j, gridRow: 1, justifyContent: 'center', background: highlightCol === j ? 'var(--mm-primary-subtle)' : undefined, borderRadius: 6 }}>
              {label}
            </div>
          )) : null}
          {hasRowLabels ? rowLabels.map((label, i) => (
            <div key={`r${i}`} style={{ ...labelStyle, gridColumn: 1 + nameColumn, gridRow: firstRow + i, justifyContent: 'flex-end', background: highlightRow === i ? 'var(--mm-primary-subtle)' : undefined, borderRadius: 6 }}>
              {label}
            </div>
          )) : null}
          <div aria-hidden="true" style={bracket('left')} />
          {rows.map((row, i) => (Array.isArray(row) ? row : []).map((cell, j) => {
            const lit = highlightRow === i || highlightCol === j;
            return (
              <div
                key={`${i}-${j}`}
                data-matrix-cell={`${i + 1},${j + 1}`}
                style={{
                  gridColumn: bracketStart + 1 + j,
                  gridRow: firstRow + i,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 36,
                  padding: interactive ? 2 : '2px 8px',
                  background: lit ? 'var(--mm-primary-subtle)' : undefined,
                  boxShadow: highlightRow === i && highlightCol === j ? 'inset 0 0 0 2px #1a73e8' : undefined,
                  borderRadius: 6,
                }}
              >
                {interactive ? renderCell(i, j, cell) : <MatrixCellValue value={cell} />}
              </div>
            );
          }))}
          <div aria-hidden="true" style={bracket('right')} />
        </div>
      </div>
      {caption ? <figcaption style={{ fontSize: 'calc(13 * var(--mm-px))', color: 'var(--mm-text-muted)', textAlign: 'center' }}>{caption}</figcaption> : null}
      {!interactive ? (
        <table style={SR_ONLY_STYLE}>
          <caption>{ariaLabel || `${spokenName}, ${dimensionsText}${caption ? `. ${caption}` : ''}`}</caption>
          {hasColLabels ? (
            <thead>
              <tr>
                {hasRowLabels ? <td /> : null}
                {colLabels.map((label, j) => <th key={j} scope="col">{colTitle ? `${colTitle} ${label}` : label}</th>)}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {hasRowLabels ? <th scope="row">{rowTitle ? `${rowTitle} ${rowLabels[i]}` : rowLabels[i]}</th> : null}
                {(Array.isArray(row) ? row : []).map((cell, j) => <td key={j}>{spokenMathLabel(String(cell ?? '')) || 'blank'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </figure>
  );
}

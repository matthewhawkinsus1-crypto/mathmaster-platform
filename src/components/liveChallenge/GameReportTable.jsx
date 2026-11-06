import { useId } from 'react';
import { SR_ONLY_STYLE } from '../../ui/srOnly.js';

/*
 * ONE BLOCK OF A GAME'S REPORT ON THE TEACHER'S CONSOLE ("After the game").
 *
 * A heading a screen reader can move to, and the block's rows as a real table
 * named by it, each row headed by what it counts, so a teacher on a screen
 * reader can go from block to block and along a row (teacher features walk,
 * item 11). It draws as the rows always did: what the row is on the left, its
 * numbers on the right, a rule under each. The column names are for a screen
 * reader only, and the header row they sit in has no height. Every padding is
 * the table's own, and so is its width: not the 640px floor the dashboard
 * gives its wide tables (App.css), which would push two columns off a phone.
 *
 * Every game's report draws its blocks with it: the rush's
 * (GraphFeatureRushHost), Graph the Line's (LineGraphHost) and the classic
 * game's standards (LiveChallengeTeacher's ChallengeReport). A row is
 * { key, label }, and `value` gives what its right-hand cell shows. `rule` is
 * the colour of the line under a row (the classic block always drew its own).
 * What follows the table inside the block (a note on how to read it) is
 * `children`. Any other prop is the block's box's: the data attribute a driver
 * finds it by, or its margin.
 */
export function GameReportTable({ title, columns, rows, value, numeric = false, rule = 'var(--mm-divider)', children = null, ...box }) {
  const headingId = useId();
  const cell = { padding: '6px 0', borderBottom: `1px solid ${rule}`, verticalAlign: 'top' };
  return (
    <div {...box}>
      <h4 id={headingId} style={{ margin: '0 0 6px', fontSize: 'calc(12 * var(--mm-px))', fontWeight: 900, color: 'var(--mm-text-muted)' }}>{title}</h4>
      <table aria-labelledby={headingId} style={{ width: '100%', minWidth: 0, borderCollapse: 'collapse', fontSize: 'calc(14 * var(--mm-px))' }}>
        <thead>
          <tr>{columns.map((column) => <th key={column} scope="col" style={{ padding: 0 }}><span style={SR_ONLY_STYLE}>{column}</span></th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" style={{ ...cell, paddingRight: 12, textAlign: 'left', fontWeight: 'inherit' }}>{row.label}</th>
              <td style={{ ...cell, textAlign: 'right', color: 'var(--mm-text-muted)', ...(numeric ? { fontVariantNumeric: 'tabular-nums' } : null) }}>{value(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {children}
    </div>
  );
}

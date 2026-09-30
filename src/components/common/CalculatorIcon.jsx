/*
 * THE CALCULATOR, DRAWN RATHER THAN TYPED.
 *
 * The calculator control used the 🧮 emoji (U+1F9EE, abacus). It arrived in
 * Unicode 11 (2018), so Windows 10 builds before 1809, Android before 9 and a
 * Linux Chrome with no colour-emoji font draw it as an empty box — measured on
 * this project's own Linux test machine, where a phone's action bar (icons
 * only, beside Submit) showed Undo, Reset, the pencil and "□". The word stays
 * in the button's accessible name; this makes the visible mark independent of
 * whatever fonts a school device happens to have. `unavailable` adds the
 * strike that 🚫 used to carry. Inherits the button's colour.
 */
const KEYS = [[5.5, 8.6], [8, 8.6], [10.5, 8.6], [5.5, 11.4], [8, 11.4], [10.5, 11.4]];

export default function CalculatorIcon({ unavailable = false, size = '1.05em' }) {
  return (
    <svg
      className="mathmaster-calculator-icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'inline-block', verticalAlign: '-0.15em', flex: '0 0 auto', overflow: 'visible' }}
    >
      <rect x="3" y="1.25" width="10" height="13.5" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="5" y="3.4" width="6" height="2.6" rx="0.6" fill="currentColor" />
      {KEYS.map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="0.95" fill="currentColor" />)}
      {unavailable ? <line x1="1.25" y1="14.75" x2="14.75" y2="1.25" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /> : null}
    </svg>
  );
}

/*
 * THE CLASS POINTS STAR, DRAWN RATHER THAN TYPED.
 *
 * The identity bar's points chip began with ⭐ (U+2B50). On a machine without a
 * font that has it — this project's Linux test machine, or a Chrome limited to
 * DejaVu and Liberation, which is how the platform quirks audit reproduced it
 * (PQ-030) — the chip read "□ 120 Class Points". Same answer as the calculator
 * icon (PQ-013, CalculatorIcon.jsx): a small inline SVG that needs no font at
 * all. Decorative: the chip's accessible name and text still say
 * "N Class Points".
 */
export default function StarIcon({ size = '1.05em' }) {
  return (
    <svg
      className="mathmaster-star-icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'inline-block', verticalAlign: '-0.15em', flex: '0 0 auto', overflow: 'visible' }}
    >
      <path
        d="M8 1.4 9.76 6.17 14.85 6.38 10.85 9.53 12.23 14.43 8 11.6 3.77 14.43 5.15 9.53 1.15 6.38 6.24 6.17Z"
        fill="#f9ab00"
        stroke="#a05a00"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

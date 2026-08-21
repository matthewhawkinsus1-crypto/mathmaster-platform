// Does a division actually render as a stacked fraction?
//
// Scratch harness for tests/browser/fractionProbe.mjs. Renders the same
// expression through every path a student meets it on and tags each one so the
// driver can MEASURE the rendered box. A stacked fraction is visibly taller
// than a line of type; that height is the honest test — the markup looks much
// the same either way, and MathLive builds its layout inside a custom element
// where a CSS-class check is guesswork.
import React from 'react';
import { createRoot } from 'react-dom/client';
import MathDisplay from '../../src/MathDisplay.jsx';
import MathText from '../../src/components/common/MathText.jsx';
import MathInput from '../../src/MathInput.jsx';

// [id, value, format] — format null means let MathDisplay decide.
const SAMPLES = [
  ['baseline-no-division', 'x + 2', null],
  ['latex-frac', '\\frac{3}{4}', null],
  ['slash-numeric', '3/4', null],
  ['slash-variable-numerator', 'x/2', null],
  ['slash-variable-plus', 'x/2 + 1', null],
  ['slash-variable-both', 'x/y', null],
  ['slash-inside-latex', '\\left(3/4\\right)x', null],
  // Would rewriting the slash into \frac fix each of those, and does the
  // rewritten form survive in BOTH rendering modes?
  ['rewritten-latex-mode', '\\frac{x}{2} + 1', 'latex'],
  ['rewritten-ascii-mode', '\\frac{x}{2} + 1', 'ascii-math'],
  ['rewritten-both-vars', '\\frac{x}{y}', 'latex'],
  // Things ascii-math can express that LaTeX cannot, which is why the format
  // cannot simply be forced to latex for everything.
  ['ascii-sqrt-as-ascii', 'sqrt(x) + 1', 'ascii-math'],
  ['ascii-sqrt-as-latex', 'sqrt(x) + 1', 'latex'],
  ['ascii-log-as-ascii', 'log_2(x)', 'ascii-math'],
  ['ascii-log-as-latex', 'log_2(x)', 'latex'],
  ['ascii-power-as-latex', 'x^2 + 1', 'latex'],
];

function Probe() {
  return (
    <div style={{ padding: 20, fontFamily: 'system-ui', fontSize: 16 }}>
      {SAMPLES.map(([id, value, format]) => (
        <div key={id} style={{ marginBottom: 16, borderBottom: '1px solid #eee', paddingBottom: 9 }}>
          <div style={{ fontSize: 11, color: '#888' }}>{id} — {value} {format ? `(${format})` : ''}</div>
          <span data-probe={id} style={{ display: 'inline-block' }}>
            <MathDisplay value={value} format={format || 'auto'} />
          </span>
          <span style={{ display: 'inline-block', marginLeft: 30 }}>
            <MathText>{`$${value}$`}</MathText>
          </span>
        </div>
      ))}
      <div style={{ maxWidth: 420 }}>
        <MathInput value="" onChange={() => {}} ariaLabel="probe-input" />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Probe />);

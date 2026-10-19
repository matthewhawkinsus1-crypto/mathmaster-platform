// What a screen reader hears for rendered mathematics.
//
// Harness for tests/browser/mathSpeech.mjs: the same expressions through
// MathDisplay (block and inline) and MathText prose, each tagged so the
// driver can read the accessibility tree around it.
import React from 'react';
import { createRoot } from 'react-dom/client';
import MathDisplay from '../../src/MathDisplay.jsx';
import MathText from '../../src/components/common/MathText.jsx';
import '../../src/index.css';

export const SAMPLES = [
  ['frac', '\\frac{1}{2}bh'],
  ['slope', 'y = -\\frac{2}{3}x + 4'],
  ['quadratic', 'x^2 - 5x + 6 = 0'],
  ['ascii', '3/4'],
  ['degrees', 'm\\angle A = 30^{\\circ}'],
];

function Harness() {
  return (
    <main>
      <h1>Math speech</h1>
      {SAMPLES.map(([id, value]) => (
        <section key={id} data-sample={id}>
          <h2>{id}</h2>
          <div data-kind="block"><MathDisplay value={value} /></div>
          <p data-kind="inline">Solve <MathDisplay value={value} inline /> now.</p>
          <p data-kind="prose"><MathText>{`Find $${value}$ today.`}</MathText></p>
        </section>
      ))}
      <section data-sample="authored">
        <div data-kind="block"><MathDisplay value="x^2" ariaLabel="x squared, authored" /></div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);

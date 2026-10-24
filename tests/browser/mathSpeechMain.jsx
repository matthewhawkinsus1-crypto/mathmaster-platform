// What a screen reader hears for rendered mathematics.
//
// Harness for tests/browser/mathSpeech.mjs: the same expressions through
// MathDisplay (block and inline) and MathText prose, each tagged so the
// driver can read the accessibility tree around it. Then the same formulas in
// a Spanish translation (AX06): MathText under lang="es", the real Translate
// button beside a hint, and both Translate panels.
import React from 'react';
import { createRoot } from 'react-dom/client';
import MathDisplay from '../../src/MathDisplay.jsx';
import MathText from '../../src/components/common/MathText.jsx';
import { SupportedTextActions } from '../../src/platform/supports/SupportedText.jsx';
import { TranslatePanel } from '../../src/components/student/supportTools/SupportToolsTray.jsx';
import { TranslatePanel as SecureTranslatePanel } from '../../src/components/assessment/SecureSupportToolsTray.jsx';
import '../../src/index.css';

export const SAMPLES = [
  ['frac', '\\frac{1}{2}bh'],
  ['slope', 'y = -\\frac{2}{3}x + 4'],
  ['quadratic', 'x^2 - 5x + 6 = 0'],
  ['ascii', '3/4'],
  ['degrees', 'm\\angle A = 30^{\\circ}'],
];

// A hint the Spanish pack translates in full (src/platform/language/packs/es.js).
const HINT = 'Subtract $3$ from $y = -\\frac{2}{3}x + 4$, then simplify.';

// One sentence the pack translated, one it could not (it stays English, and its
// formulas are said in English).
const SENTENCES = [
  { source: HINT, text: 'Resta $3$ de $x^2 = 9$; luego simplifica.', translated: true },
  { source: 'Check $x + 3 = 9$.', text: 'Check $x + 3 = 9$.', translated: false },
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
      <section data-sample="spanish" lang="es">
        <h2>Español</h2>
        <p data-kind="prose"><MathText language="es">{'Halla $y = -\\frac{2}{3}x + 4$ hoy.'}</MathText></p>
        <p data-kind="english"><MathText>{'Find $y = -\\frac{2}{3}x + 4$ today.'}</MathText></p>
      </section>
      <section data-sample="translate-button">
        <h2>Translate beside a hint</h2>
        <p data-kind="hint">{HINT.replace(/\$/g, '')}</p>
        <SupportedTextActions text={HINT} translation={{ language: 'es' }} label="this hint" />
      </section>
      <section data-sample="support-tray">
        <TranslatePanel tool={{ coverage: 'partial', translation: { provider: 'curated', language: 'es', sentences: SENTENCES } }} />
      </section>
      <section data-sample="secure-tray">
        <SecureTranslatePanel translation={{ coverage: 'partial', provider: 'curated', language: 'es', sentences: SENTENCES }} />
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);

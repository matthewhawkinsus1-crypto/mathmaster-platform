// Harness for tests/browser/mathKeypadToolbar.mjs: one MathInput with its
// keypad open and a "Needed for this answer" row (≤ and ∞ required), with
// a control before and after it, so the driver can count Tab stops.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MathInput from '../../src/MathInput.jsx';
import '../../src/index.css';

function Harness() {
  const [value, setValue] = useState('');
  return (
    <main style={{ padding: 16, maxWidth: 520 }}>
      <button type="button" data-test="before">Before</button>
      <div data-test="field">
        <MathInput value={value} onChange={setValue} ariaLabel="Slope" showToolsInitially requiredSymbols={['≤', '∞']} />
      </div>
      <output data-test="value">{value}</output>
      <button type="button" data-test="after">After</button>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);

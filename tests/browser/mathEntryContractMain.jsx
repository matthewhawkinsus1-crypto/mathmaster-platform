// Harness for tests/browser/mathEntryContract.mjs: the real MathInput and the
// real CalculatorPanel, nothing around them, so the driver can type on a
// physical keyboard and read what MathLive built. The ordered-pair box types
// its brackets as plain characters (no smart fences), as interval and
// ordered-pair answers do.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MathInput from '../../src/MathInput.jsx';
import CalculatorPanel from '../../src/components/CalculatorPanel.jsx';

function Harness() {
  const [value, setValue] = useState('');
  const [pair, setPair] = useState('');
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <div data-entry="answer">
        <MathInput value={value} onChange={setValue} toolProfile="equation" ariaLabel="Answer" />
      </div>
      <output data-entry="reported">{value}</output>
      <div data-entry="pair" style={{ marginTop: 24 }}>
        <MathInput value={pair} onChange={setPair} toolProfile="orderedPair" ariaLabel="Ordered pair" />
      </div>
      <div data-entry="calculator" style={{ marginTop: 24 }}>
        <CalculatorPanel policy={{ available: true, mode: 'scientific' }} open />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);

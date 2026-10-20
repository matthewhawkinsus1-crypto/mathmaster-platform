// Harness for tests/browser/toolChoiceGroups.mjs: the real FigureMatchStage, as
// WorkflowRunner mounts it (a controlled value, onChange writing it back), with
// every value it reports kept in window.__fm.changes. Figure Match's select
// toggles — pressing the chosen chip clears it — so this is where a key that
// re-selects the checked option would delete an answer (review B1).
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import FigureMatchStage from '../../src/platform/workflow/FigureMatchStage.jsx';
import '../../src/index.css';

const STAGE = {
  items: [
    { id: 'f1', text: 'y = 2x + 1' },
    { id: 'f2', text: 'y = x² − 4' },
  ],
  categories: [
    { id: 'linear', label: 'Linear' },
    { id: 'quadratic', label: 'Quadratic' },
    { id: 'exponential', label: 'Exponential' },
  ],
};

// One category: every arrow, Home and End lands on the chip already chosen.
const ONE_CATEGORY = {
  items: [{ id: 'g1', text: 'y = 3x' }],
  categories: [{ id: 'linear', label: 'Linear' }],
};

window.__fm = { changes: [], one: [] };

function Stage({ stage, log, name }) {
  const [value, setValue] = useState(null);
  return (
    <section data-fm-stage={name} style={{ marginBottom: 24 }}>
      <FigureMatchStage
        stage={stage}
        value={value}
        onChange={(next) => {
          window.__fm[log].push(next);
          setValue(next);
        }}
      />
    </section>
  );
}

function Harness() {
  return (
    <main style={{ padding: 24 }} data-fm-root="true">
      <Stage stage={STAGE} log="changes" name="three" />
      <Stage stage={ONE_CATEGORY} log="one" name="one" />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);

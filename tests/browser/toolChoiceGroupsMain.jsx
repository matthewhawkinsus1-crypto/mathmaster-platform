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

window.__fm = { changes: [] };

function Harness() {
  const [value, setValue] = useState(null);
  return (
    <main style={{ padding: 24 }} data-fm-root="true">
      <FigureMatchStage
        stage={STAGE}
        value={value}
        onChange={(next) => {
          window.__fm.changes.push(next);
          setValue(next);
        }}
      />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);

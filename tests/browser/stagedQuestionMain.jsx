// The staged function-characteristics question, mounted the way a student gets
// it, so the two things unit tests cannot see can be measured:
//
//   1. Does each stage fit — prompt AND answer control on screen together —
//      on a phone, a phone held sideways, and a Chromebook?
//   2. Does any coordinate readout survive on the stages that ask a student to
//      MARK a feature they will later have to write down?
//
// HOW TO RUN: see tests/browser/stagedQuestion.mjs.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import WorkflowRunner from '../../src/platform/workflow/WorkflowRunner.jsx';
import { readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import '../../src/App.css';

const listeners = new Set();
let current = null;
window.__mmStaged = (scene) => { current = scene; listeners.forEach((n) => n(scene)); };

function Harness() {
  const [scene, setScene] = useState(current);
  useEffect(() => { listeners.add(setScene); return () => listeners.delete(setScene); }, []);
  if (!scene) return <div data-staged-idle="1">idle</div>;
  const composed = readComposedQuestion(scene.question);
  window.__mmStages = composed.workflow.map((s) => ({ id: s.id, kind: s.kind }));
  return (
    <div data-staged-id={scene.id} className="mathmaster-question-container">
      <WorkflowRunner key={scene.id} question={scene.question} onStateChange={() => {}} draftKey={null} showPrompt={false} />
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Harness />);

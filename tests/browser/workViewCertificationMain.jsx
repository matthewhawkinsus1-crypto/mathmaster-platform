import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { SAMPLE_SPECS } from '../../src/dev/MathToolsLab.jsx';
import '../../src/index.css';
import '../../src/App.css';

let current = null;
const listeners = new Set();
window.__mmStage4 = (toolId) => { current = toolId; listeners.forEach((listener) => listener(toolId)); };

function StudentCertificationShell() {
  const [toolId, setToolId] = useState(current);
  useEffect(() => { listeners.add(setToolId); return () => listeners.delete(setToolId); }, []);
  if (!toolId) return <main data-stage4-idle="true">Waiting for certification scene</main>;
  const question = { id: `stage4-${toolId}`, questionId: `stage4-${toolId}`, type: toolId, prompt: `Complete the ${toolId} activity.`, ...SAMPLE_SPECS[toolId] };
  return <div className="app-container" data-stage4-tool={toolId}>
    <nav className="mathmaster-assignment-unified-nav" aria-label="Assignment navigation">
      <div className="mathmaster-section-tabs"><button type="button" className="mathmaster-section-tab is-active">Classwork <small>1/3</small></button></div>
      <div className="mathmaster-question-number-strip" aria-label="Classwork questions"><button type="button" className="mathmaster-question-number is-current">1</button><button type="button">2</button><button type="button">3</button></div>
    </nav>
    <main className="mathmaster-question-stage">
      <QuestionEngine key={toolId} question={question} generationKey={`stage4-${toolId}`} questionRecord={null} onGrade={() => {}} onStepGrade={() => {}} studentProfile={{}} activityRole="classwork" maximumAttempts={3} assignmentId="stage4-certification" executionScope="student" />
    </main>
  </div>;
}
createRoot(document.getElementById('root')).render(<StudentCertificationShell />);

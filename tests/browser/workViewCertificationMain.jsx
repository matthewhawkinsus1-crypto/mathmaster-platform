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
    <section className="mathmaster-theme-certification-fixtures" aria-label="Theme control fixtures">
      <label>Text answer <input placeholder="Enter an answer" /></label>
      <label>Choose a method <select defaultValue="model"><option value="model">Use a model</option><optgroup label="Other"><option value="table">Use a table</option></optgroup></select></label>
      <label>Math answer <math-field aria-label="Math answer">x=4</math-field></label>
      <label><input disabled value="Locked answer" readOnly /> Locked until the previous step is complete</label>
      <table><caption>Representative data</caption><tbody><tr><th>x</th><td>2</td></tr><tr><th>y</th><td>5</td></tr></tbody></table>
      <p className="mm-feedback-success">Correct — your model matches the data.</p>
      <p className="mm-feedback-error">Check the selected point and try again.</p>
    </section>
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

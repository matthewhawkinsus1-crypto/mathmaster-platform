// STAGE 3A TOOLS ON THE SURFACE A STUDENT ACTUALLY GETS.
//
// QuestionEngine, mounted the way App.jsx mounts it, because that is what
// supplies the Work View capability provider and the Universal Undo channel.
// Rendering a tool on its own — the way tests/browser/toolOpenAudit does, and
// for its own good reasons — would measure a Work View with no platform Undo,
// no task and no help in it, which is a view no student ever sees.
//
// Both stylesheets, in the order main.jsx loads them: index.css carries the
// body reset and the `overflow-x: clip` production relies on, and a harness
// that imports only App.css measures the browser's default 8px body margin as
// horizontal overflow on every question.
//
// HOW TO RUN: see tests/browser/workViewMatrix.mjs.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import '../../src/index.css';
import '../../src/App.css';

const listeners = new Set();
let current = null;
window.__mmWorkView = (scene) => { current = scene; listeners.forEach((notify) => notify(scene)); };

function Harness() {
  const [scene, setScene] = useState(current);
  useEffect(() => { listeners.add(setScene); return () => listeners.delete(setScene); }, []);
  if (!scene) return <div data-work-view-idle="1">idle</div>;
  return (
    <div data-scene-id={scene.id}>
      {/* Assignment chrome the Work View mobile rules have to stand down. It is
          the real markup — the same class names App.jsx renders — so the gate
          measures the rule, not a stand-in for it. */}
      <nav className="mathmaster-assignment-unified-nav" aria-label="Assignment navigation">
        <div className="mathmaster-section-tabs" role="list" aria-label="Assignment sections">
          <button type="button" role="listitem">Warm-Up</button>
          <button type="button" role="listitem">Guided Notes</button>
          <button type="button" role="listitem">Practice</button>
        </div>
        <div className="mathmaster-question-number-strip" aria-label="Practice questions">
          {[1, 2, 3, 4, 5, 6].map((number) => <button key={number} type="button">{number}</button>)}
        </div>
      </nav>
      <QuestionEngine
        key={scene.id}
        question={scene.question}
        questionRecord={null}
        generationKey={scene.id}
        onGrade={() => {}}
        onStepGrade={() => {}}
        studentProfile={{}}
        activityRole={scene.activityRole || 'classwork'}
        maximumAttempts={3}
        draftKey={null}
        assignmentId="work-view-matrix"
        executionScope="student"
      />
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Harness />);

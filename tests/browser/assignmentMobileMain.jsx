// A COMPOSED ASSIGNMENT QUESTION, ON THE SURFACE A STUDENT ACTUALLY GETS.
//
// Not PathSessionPlayer: the practice path's server sanitizer does not carry a
// `workflow` at all, so a composed question rendered through it silently
// degrades to "type your answer" and every measurement taken from it describes
// a question nobody is being asked.
//
// The assignment surface is QuestionEngine, mounted directly by App.jsx. That
// is what this harness mounts, so the mobile stylesheet (imported by
// MobileViewportContainer, inside QuestionEngine), the focus-mode chrome and
// the real tool layout are all the ones a student meets.
//
// HOW TO RUN: see tests/browser/assignmentMobile.mjs.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
// BOTH stylesheets, in the order main.jsx loads them. index.css carries the
// body reset and the `overflow-x: clip` that production relies on; a harness
// that imports only App.css measures the browser's default 8px body margin as
// horizontal overflow on every question, which is a finding about the harness.
import '../../src/index.css';
import '../../src/App.css';

const listeners = new Set();
let current = null;
window.__mmAssignment = (scene) => { current = scene; listeners.forEach((notify) => notify(scene)); };

function Harness() {
  const [scene, setScene] = useState(current);
  useEffect(() => { listeners.add(setScene); return () => listeners.delete(setScene); }, []);
  if (!scene) return <div data-assignment-idle="1">idle</div>;
  return (
    <div data-assignment-id={scene.id}>
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
        assignmentId="audit"
        executionScope="student"
      />
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Harness />);

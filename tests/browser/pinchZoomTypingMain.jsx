// THE ASSIGNMENT QUESTION SURFACE, FOR tests/browser/pinchZoomTyping.mjs.
//
// Copied from assignmentMobileMain.jsx: QuestionEngine is what App.jsx mounts
// for a student and for a teacher's "View as Student" / Live Teaching preview,
// so it is what a presenting teacher types into. Two additions: the page's
// .mathmaster-assignment-screen wrapper (App.css hangs its scroll-padding on
// it) with tall content above and below, and the zoom flag main.jsx installs.
//
// HOW TO RUN: see tests/browser/pinchZoomTyping.mjs.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
// BOTH stylesheets, in the order main.jsx loads them. index.css carries the
// body reset and the `overflow-x: clip` that production relies on; a harness
// that imports only App.css measures the browser's default 8px body margin as
// horizontal overflow on every question, which is a finding about the harness.
import '../../src/index.css';
import '../../src/App.css';
import { installPinchZoomRootFlag } from '../../src/platform/layout/pinchZoomReveal.js';

// As main.jsx does for the app (PINCH_WITHOUT_ROOT_FLAG=1 measures without it).
if (!window.location.search.includes('withoutRootFlag')) installPinchZoomRootFlag(window);

const listeners = new Set();
let current = null;
window.__mmPinchZoom = (scene) => { current = scene; listeners.forEach((notify) => notify(scene)); };

function Harness() {
  const [scene, setScene] = useState(current);
  useEffect(() => { listeners.add(setScene); return () => listeners.delete(setScene); }, []);
  if (!scene) return <div data-assignment-idle="1">idle</div>;
  return (
    // Tall content above and below, like the real assignment page (header,
    // section navigation, the next question), so a jump has somewhere to go.
    // The real page's wrapper: App.css hangs the page's scroll-padding on
    // html/body:has(.mathmaster-assignment-screen), so a harness without it
    // would not measure what a student or a presenting teacher gets.
    <div className="mathmaster-assignment-screen">
    <div data-filler="above" style={{ height: 900, background: 'repeating-linear-gradient(#eef 0 40px, #fff 40px 80px)' }} />
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
    <div data-filler="below" style={{ height: 1400, background: 'repeating-linear-gradient(#efe 0 40px, #fff 40px 80px)' }} />
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Harness />);

// ONE STUDENT TOOL, ON THE SURFACE A STUDENT GETS, BETWEEN TWO TAB SENTINELS.
//
// The keyboard sweep (tests/browser/keyboardSweep.mjs) walks this page with
// Tab / Shift+Tab only. The tool is mounted through QuestionEngine exactly as
// workViewCertificationMain.jsx mounts it (same SAMPLE_SPECS question), so
// Work View, Undo, hints and the shell's Check button are all present. The two
// sentinel buttons bracket the tool: a forward walk that never reaches the end
// sentinel is a focus trap, and one that reaches it has visited every stop.
//
// Both stylesheets, in the order main.jsx loads them, because index.css owns
// the global :focus-visible ring the sweep is measuring.
//
// The wrapper carries `mathmaster-assignment-screen`, as App.jsx's student
// assignment screen does, because App.css hangs the scroll-padding that keeps
// a Tab-scrolled control clear of the sticky task card and the bottom work
// bar on that class. `?host=bare` drops it, which is what the hosts that mount
// QuestionEngine without it (Path session, live challenge, section recovery)
// look like.
//
//   ?tool=<toolId>           required
//   ?spec=<url-encoded JSON> optional, merged over SAMPLE_SPECS[toolId]
//   ?host=bare               optional, no assignment-screen wrapper
import React from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { listTools } from '../../src/tools/toolRegistry';
import { SAMPLE_SPECS } from '../../src/dev/MathToolsLab.jsx';
import '../../src/index.css';
import '../../src/App.css';

const params = new URLSearchParams(window.location.search);
const toolId = params.get('tool');
let override = {};
try { override = params.get('spec') ? JSON.parse(params.get('spec')) : {}; } catch { override = {}; }

window.__TOOL_IDS__ = listTools().map((tool) => tool.toolId);
window.__KB_GRADES__ = [];
const record = (kind) => (...args) => {
  const first = args[0];
  window.__KB_GRADES__.push({ kind, at: Date.now(), isCorrect: first && typeof first === 'object' ? first.isCorrect ?? null : first ?? null });
};

function Harness() {
  if (!toolId) return <main data-kb-idle="true">Pass ?tool=</main>;
  const question = { id: `kb-${toolId}`, questionId: `kb-${toolId}`, type: toolId, prompt: `Complete the ${toolId} activity.`, ...SAMPLE_SPECS[toolId], ...override };
  return (
    <div className={params.get('host') === 'bare' ? 'app-container' : 'app-container mathmaster-assignment-screen'} data-kb-tool={toolId} data-kb-host={params.get('host') === 'bare' ? 'bare' : 'assignment'}>
      <button type="button" data-kb-sentinel="start">Start of page (sweep sentinel)</button>
      <main className="mathmaster-question-stage" data-kb-root="true">
        <QuestionEngine
          key={toolId}
          question={question}
          generationKey={`kb-${toolId}`}
          questionRecord={null}
          onGrade={record('grade')}
          onStepGrade={record('step')}
          studentProfile={{}}
          activityRole="classwork"
          maximumAttempts={3}
          assignmentId="keyboard-sweep"
          executionScope="student"
        />
      </main>
      <button type="button" data-kb-sentinel="end">End of page (sweep sentinel)</button>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Harness />);

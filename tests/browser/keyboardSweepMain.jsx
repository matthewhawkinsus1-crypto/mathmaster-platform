// ONE STUDENT TOOL, ON THE SURFACE A STUDENT GETS, BETWEEN TWO TAB SENTINELS.
//
// The keyboard sweep (tests/browser/keyboardSweep.mjs) walks this page with
// Tab / Shift+Tab only. The tool is mounted through QuestionEngine exactly as
// workViewCertificationMain.jsx mounts it (same SAMPLE_SPECS question), so
// Work View, Undo, hints and the shell's Check button are all present. The two
// sentinel buttons bracket the tool: a forward walk that never reaches the end
// sentinel is a focus trap, and one that reaches it has visited every stop.
//
// A LEGACY QUESTION TYPE (the graders in src/*.jsx that QuestionEngine's type
// switch mounts: fraction, literal, system, table, orderedPair, multiAnswer,
// numberLine, graphing, functionGraph, graphAnalysis, stepAlgebra, ...) has no
// preview-bench question. It is mounted with the authoring catalog's own
// example of that type (questionTypeCatalog.js, the one description Preflight
// and the authoring contract share), and `?spec=` changes it into the variant a
// scene needs (an inequality for the relation workspace, `mode:
// "linearIntercepts"`, ...).
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
//   ?tool=<toolId>           required: a registry tool, or a legacy question type
//   ?spec=<url-encoded JSON> optional, merged over SAMPLE_SPECS[toolId] (a
//                            legacy type: over the catalog's example)
//   ?variant=<name>          optional, names the scene so two scenes of one type
//                            keep separate drafts
//   ?host=bare               optional, no assignment-screen wrapper
//   ?shell=assignment        optional, what the assignment screen puts around a
//                            question and the wrapper alone does not: see below
//
// THE ASSIGNMENT SHELL (?shell=assignment). Two things the student's screen has
// and a bare wrapper lacks, each of which the sweep read as a gap in a tool:
//   - THE NAVIGATOR above the question. App.css starts the sticky task card
//     where the navigator ends (--mm-assignment-nav-height, published from its
//     measured height, 112px when nothing publishes it), so with no navigator
//     the card was pushed 86px down at scroll 0, over the first rows of the
//     question: the Number Line's "Show a hint" and Function Investigation's
//     stage tab came up "under the sticky card". In the real shell nothing was
//     covered (teacherWorkflow/assignmentChromeJourneys.mjs "tabClear" walks a
//     Number Line there, forward and back). The stand-in is the navigator's
//     own markup and classes, collapsed as it opens, with nothing focusable in
//     it, publishing its height as App.jsx does.
//   - A WAY ON from a closed question. The shell always hands QuestionEngine
//     one (Next, Continue to the next section or to the results, or back to a
//     skipped question), and the engine puts focus on it when a Submit closes
//     the question. With none, focus fell to <body>, which the sweep read as a
//     keyboard student losing their place after "Correct! This question is
//     complete." (Graph Comparison). Pressing it here does nothing.
//   - THE SCREEN'S OWN LAYOUT (student-a11y-3). On a phone App.css makes the
//     assignment screen one screen tall, its shell a grid of the navigator and
//     the stage, and the question as tall as the stage, so the work scrolls
//     above the work bar at the screen's foot. The stand-in had the screen's
//     class on a wrapper with no shell and the sentinels inside it: the stage
//     had no height, the question collapsed to 258px of the 844 and its work
//     area to 16px, and the work bar sat over the question's controls (five of
//     a fraction question's 14 stops under it). The stand-in is now the App's
//     own structure, screen > shell > navigator and stage, with their inline
//     styles; the sentinels take no room.
// The other drivers that mount this page leave it off, as they always did.
import React from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { ASSIGNMENT_NAV_HEIGHT_VAR, stickyHeightRef } from '../../src/platform/layout/stickyHeightRef.js';
import { listTools } from '../../src/tools/toolRegistry';
import { SAMPLE_SPECS } from '../../src/dev/MathToolsLab.jsx';
import { QUESTION_TYPE_CATALOG } from '../../src/platform/contract/questionTypeCatalog.js';
import '../../src/index.css';
import '../../src/App.css';

const params = new URLSearchParams(window.location.search);
const toolId = params.get('tool');
const variant = params.get('variant');
let override = {};
try { override = params.get('spec') ? JSON.parse(params.get('spec')) : {}; } catch { override = {}; }

window.__TOOL_IDS__ = listTools().map((tool) => tool.toolId);
window.__KB_GRADES__ = [];
const record = (kind) => (...args) => {
  const first = args[0];
  window.__KB_GRADES__.push({ kind, at: Date.now(), isCorrect: first && typeof first === 'object' ? first.isCorrect ?? null : first ?? null });
};

// A way on that goes nowhere: the sweep never follows it, it only has to exist.
const noWayOn = () => {};

// What App.jsx's assignment screen and its stage carry inline (the student's own
// support presentation aside): the screen's padding and height, the stage's card.
// On a phone App.css overrides each with the one-screen layout (`!important`).
const ASSIGNMENT_SCREEN_STYLE = Object.freeze({ fontFamily: '"Segoe UI", sans-serif', backgroundColor: 'var(--mm-surface-control)', minHeight: '100vh', padding: '20px' });
const QUESTION_STAGE_STYLE = Object.freeze({ background: 'var(--mm-surface)', borderRadius: '12px', padding: '10px', minHeight: '500px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' });
const SENTINEL_STYLE = Object.freeze({ position: 'fixed', top: 0, left: 0, width: 1, height: 1, padding: 0, border: 0, overflow: 'hidden', opacity: 0.01 });

function Harness() {
  if (!toolId) return <main data-kb-idle="true">Pass ?tool=</main>;
  const sceneId = variant ? `kb-${toolId}-${variant}` : `kb-${toolId}`;
  const base = SAMPLE_SPECS[toolId] || QUESTION_TYPE_CATALOG[toolId]?.example;
  const question = { id: sceneId, questionId: sceneId, type: toolId, prompt: `Complete the ${toolId} activity.`, ...base, ...override };
  const shell = params.get('shell') === 'assignment' && params.get('host') !== 'bare';
  const engine = (
    <QuestionEngine
      key={sceneId}
      question={question}
      generationKey={sceneId}
      questionRecord={null}
      onGrade={record('grade')}
      onStepGrade={record('step')}
      onNextQuestion={shell ? noWayOn : undefined}
      studentProfile={{}}
      activityRole="classwork"
      maximumAttempts={3}
      assignmentId="keyboard-sweep"
      executionScope="student"
    />
  );
  if (shell) {
    // App.jsx's assignment screen, as it is drawn (SHELL above): the screen, the
    // shell inside it, the navigator and the stage, with their own inline styles.
    // The sentinels take no room, as the Tab walk's do: in the App nothing of the
    // page's lies around the screen but the identity bar, whose height it
    // subtracts (--mm-student-identity-stack-offset, 0 here, where there is none).
    return (
      <div className="app-container" data-kb-tool={toolId} data-kb-host="assignment" data-kb-shell="assignment">
        <button type="button" data-kb-sentinel="start" style={SENTINEL_STYLE}>Start of page (sweep sentinel)</button>
        <div className="mathmaster-assignment-screen" style={ASSIGNMENT_SCREEN_STYLE}>
          <div className="mathmaster-assignment-shell" style={{ maxWidth: '1120px', margin: '0 auto' }}>
            <nav ref={stickyHeightRef(ASSIGNMENT_NAV_HEIGHT_VAR)} className="mathmaster-assignment-unified-nav is-collapsed" aria-hidden="true" data-kb-stand-in="navigator">
              <div className="mathmaster-assignment-unified-top" style={{ minHeight: 40 }} />
            </nav>
            <main className="mathmaster-question-stage" data-kb-root="true" style={QUESTION_STAGE_STYLE}>{engine}</main>
          </div>
        </div>
        <button type="button" data-kb-sentinel="end" style={SENTINEL_STYLE}>End of page (sweep sentinel)</button>
      </div>
    );
  }
  return (
    <div className={params.get('host') === 'bare' ? 'app-container' : 'app-container mathmaster-assignment-screen'} data-kb-tool={toolId} data-kb-host={params.get('host') === 'bare' ? 'bare' : 'assignment'}>
      <button type="button" data-kb-sentinel="start">Start of page (sweep sentinel)</button>
      <main className="mathmaster-question-stage" data-kb-root="true">{engine}</main>
      <button type="button" data-kb-sentinel="end">End of page (sweep sentinel)</button>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<Harness />);

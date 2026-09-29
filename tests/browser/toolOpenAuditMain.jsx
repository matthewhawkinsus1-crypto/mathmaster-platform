import React from 'react';
import { createRoot } from 'react-dom/client';
import { getToolDefinition, listTools } from '../../src/tools/toolRegistry';
import { ToolRuntimeProvider } from '../../src/tools/shared/ToolRuntimeContext';
import { ToolDraftScopeProvider } from '../../src/tools/shared/usePersistentToolState.js';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import { listDraftSyncRejections } from '../../src/platform/persistence/draftSyncDiagnostics.js';
import { SAMPLE_SPECS } from '../../src/dev/MathToolsLab.jsx';
import '../../src/App.css';

/*
 * ONE TOOL, NO CHROME, MEASURED.
 *
 * The preview bench wraps every tool in a header and a sidebar, which is fine
 * for looking at but useless for measuring how far down a student has to scroll
 * to reach the thing they type into. This page renders exactly one tool at the
 * top of the document so the numbers mean what they say.
 */
const params = new URLSearchParams(window.location.search);
const toolId = params.get('tool') || listTools()[0].toolId;
const definition = getToolDefinition(toolId);

window.__TOOL_IDS__ = listTools().map((tool) => tool.toolId);
// Every action the tool raises, in order, so a driver can tell whether a key
// press submitted an attempt (ATTEMPT_SUBMITTED) without reading tool state.
window.__TOOL_ACTIONS__ = [];
const recordAction = (type, payload) => { window.__TOOL_ACTIONS__.push({ type, at: Date.now(), keys: Object.keys(payload || {}) }); };

// ?draft=1 mounts the tool under a real student draft key, exactly as
// QuestionEngine does, so everything it persists is written through the
// production draft layer (and its development-time sync audit) where a driver
// can read it back. Without it the tool keeps state in memory only.
const DRAFT_KEY = params.get('draft')
  ? buildQuestionDraftKey({ studentId: 'sweep-student', assignmentId: `sweep-${toolId}`, questionIndex: 0, variantIndex: 0, sessionMode: 'graded' })
  : null;
window.__TOOL_DRAFT_KEY__ = DRAFT_KEY;
window.__DRAFT_SYNC_REJECTIONS__ = () => listDraftSyncRejections();

function Harness() {
  if (!definition?.component) return <div data-audit-error="unknown tool">Unknown tool {toolId}</div>;
  const Tool = definition.component;
  const tool = <Tool questionData={SAMPLE_SPECS[toolId] || {}} onAction={recordAction} attemptRecord={null} />;
  return (
    <div data-audit-root="true">
      <ToolRuntimeProvider>
        {DRAFT_KEY ? <ToolDraftScopeProvider draftKey={DRAFT_KEY}>{tool}</ToolDraftScopeProvider> : tool}
      </ToolRuntimeProvider>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);

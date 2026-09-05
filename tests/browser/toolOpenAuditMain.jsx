import React from 'react';
import { createRoot } from 'react-dom/client';
import { getToolDefinition, listTools } from '../../src/tools/toolRegistry';
import { ToolRuntimeProvider } from '../../src/tools/shared/ToolRuntimeContext';
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

function Harness() {
  if (!definition?.component) return <div data-audit-error="unknown tool">Unknown tool {toolId}</div>;
  const Tool = definition.component;
  return (
    <div data-audit-root="true">
      <ToolRuntimeProvider>
        <Tool questionData={SAMPLE_SPECS[toolId] || {}} onAction={() => {}} attemptRecord={null} />
      </ToolRuntimeProvider>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);

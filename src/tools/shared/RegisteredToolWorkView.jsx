import React from 'react';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import { WORK_VIEW_INVENTORY } from '../workViewInventory.js';
import useMobileInteractionMode from '../../platform/mobile/useMobileInteractionMode.js';
import { useRenderPerformance } from '../../platform/performance/useRenderPerformance.js';
import { useHintUseReporter, useOwnHintLadder } from './ToolRuntimeContext';
import { HintPanel } from './ToolShell';

// Sentence case for the rail labels: `numericControls` used to read
// "numeric Controls" to the student.
export const capabilityLabel = (key) => {
  if (key === 'pointEditing') return 'Edit mathematical objects';
  const words = key.replace(/([A-Z])/g, ' $1').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const descriptor = (key) => ({
  label: capabilityLabel(key),
  studentState: !['task', 'help', 'instruction'].includes(key),
});

const capabilityDescriptor = (key, { taskText, helpText }) => {
  if (key === 'task') return { ...descriptor(key), content: taskText };
  // No instruction content: this wrapper only knows the authored prompt, which
  // Work View already shows as the task in its header. Filling the instruction
  // banner with the same prompt showed the student the task twice and pushed
  // the workspace ~60px down (live QA, Connect the Line, 1536×900). A tool that
  // knows its current step publishes its own instruction.
  if (key === 'instruction') return descriptor(key);
  if (key === 'help') return { ...descriptor(key), content: helpText };
  return descriptor(key);
};

// Final-registry safety net: Stage 3D tools enlarge their existing instance in
// place. Tool-owned actions and published graph controls merge into this shell;
// this wrapper never constructs a second copy or owns response state.
export default function RegisteredToolWorkView({ toolId, questionData = {}, children }) {
  useRenderPerformance('UniversalWorkView', toolId);
  const inventory = WORK_VIEW_INVENTORY[toolId];
  const mobile = useMobileInteractionMode();
  const reportHintUse = useHintUseReporter();
  // Inside a question with the platform's hint ladder, that ladder is this
  // Work View's Help (QuestionEngine publishes it to the shell) and it already
  // holds the question's authored hints (student pass 3, HELP-10). Only where
  // there is no platform ladder and hints are allowed does this wrapper offer
  // them itself.
  const ownLadder = useOwnHintLadder();
  if (!inventory || inventory.status !== 'migrated') return children;

  const taskText = String(
    questionData?.prompt
      || questionData?.task
      || questionData?.scenario
      || `Complete the ${toolId} activity.`,
  ).trim();

  // The question's AUTHORED HINTS are help, not directions. The Work View
  // Help drawer printed all of them at once, unrecorded, on every activity —
  // including a DOL, where the tool's own hint panel is withheld. Where they
  // are allowed they are offered the way every tool offers hints — one at a
  // time, each reveal reported.
  const authoredHints = ownLadder && Array.isArray(questionData?.hints)
    ? questionData.hints.map((hint) => String(hint || '').trim()).filter(Boolean)
    : [];
  const helpText = authoredHints.length
    ? <HintPanel hints={authoredHints} onHintUsed={() => reportHintUse?.()} />
    : null;

  // NO HELP OF ITS OWN OTHERWISE (student pass 3, TOOL-3). This wrapper used to
  // publish "Use the directions and controls in this workspace…" for 15 tools,
  // and it replaced the platform's Help — "Ask my teacher" included — while
  // the directions it pointed to were hidden. The drawer now carries the
  // tool's TaskCard steps (`directions`) and the platform's Help itself.
  const capabilities = Object.fromEntries(inventory.capabilities
    .filter((key) => !['primaryActions', 'secondaryActions', 'undo', 'fitView', 'panZoom'].includes(key))
    .filter((key) => !(key === 'help' && !helpText))
    .map((key) => [key, capabilityDescriptor(key, { taskText, helpText })]));

  return (
    <EnlargeableFigure
      label={`${toolId} workspace`}
      enlargeLabel="Open Work View"
      taskText={taskText}
      capabilities={capabilities}
      openEnlarged={Boolean(mobile?.isCompactPhone)}
      dismissKey={`mm.workview.phone.dismissed.${toolId}`}
      presentationKey={questionData?.questionId || questionData?.id || questionData?.prompt || toolId}
    >
      {children}
    </EnlargeableFigure>
  );
}

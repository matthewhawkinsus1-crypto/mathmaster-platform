import React from 'react';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import { WORK_VIEW_INVENTORY } from '../workViewInventory.js';
import useMobileInteractionMode from '../../platform/mobile/useMobileInteractionMode.js';
import { useRenderPerformance } from '../../platform/performance/useRenderPerformance.js';

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
  if (!inventory || inventory.status !== 'migrated') return children;

  const taskText = String(
    questionData?.prompt
      || questionData?.task
      || questionData?.scenario
      || `Complete the ${toolId} activity.`,
  ).trim();

  const authoredHints = Array.isArray(questionData?.hints)
    ? questionData.hints.map((hint) => String(hint || '').trim()).filter(Boolean)
    : [];
  const helpText = authoredHints.length
    ? authoredHints.join(' ')
    : 'Use the directions and controls in this workspace to complete the current mathematical task. Your work stays in place when you open or close Work View.';

  const capabilities = Object.fromEntries(inventory.capabilities
    .filter((key) => !['primaryActions', 'secondaryActions', 'undo', 'fitView', 'panZoom'].includes(key))
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

import React from 'react';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import { WORK_VIEW_INVENTORY } from '../workViewInventory.js';
import useMobileInteractionMode from '../../platform/mobile/useMobileInteractionMode.js';
import { useToolRuntimeContext } from './ToolRuntimeContext.jsx';

const descriptor = (key) => ({
  label: key === 'pointEditing' ? 'Edit mathematical objects' : key.replace(/([A-Z])/g, ' $1'),
  studentState: !['task', 'help', 'instruction'].includes(key),
});

const capabilityDescriptor = (key, { taskText, helpText }) => {
  if (key === 'task') return { ...descriptor(key), content: taskText };
  if (key === 'instruction') return { ...descriptor(key), content: taskText };
  if (key === 'help') return { ...descriptor(key), content: helpText };
  return descriptor(key);
};

// Final-registry safety net: Stage 3D tools enlarge their existing instance in
// place. Tool-owned actions and published graph controls merge into this shell;
// this wrapper never constructs a second copy or owns response state.
export default function RegisteredToolWorkView({ toolId, questionData = {}, children }) {
  const inventory = WORK_VIEW_INVENTORY[toolId];
  const mobile = useMobileInteractionMode();
  const { questionTerminal } = useToolRuntimeContext();
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
      forceClosed={questionTerminal}
    >
      {children}
    </EnlargeableFigure>
  );
}

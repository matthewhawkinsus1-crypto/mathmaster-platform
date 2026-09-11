import React from 'react';
import EnlargeableFigure from '../../components/common/EnlargeableFigure.jsx';
import { WORK_VIEW_INVENTORY } from '../workViewInventory.js';

const descriptor = (key) => ({
  label: key === 'pointEditing' ? 'Edit mathematical objects' : key.replace(/([A-Z])/g, ' $1'),
  studentState: !['task', 'help', 'instruction'].includes(key),
});

// Final-registry safety net: Stage 3D tools enlarge their existing instance in
// place. Tool-owned actions and published graph controls merge into this shell;
// this wrapper never constructs a second copy or owns response state.
export default function RegisteredToolWorkView({ toolId, children }) {
  const inventory = WORK_VIEW_INVENTORY[toolId];
  if (!inventory || inventory.status !== 'migrated') return children;
  const capabilities = Object.fromEntries(inventory.capabilities
    .filter((key) => !['primaryActions', 'secondaryActions', 'undo', 'fitView', 'panZoom'].includes(key))
    .map((key) => [key, descriptor(key)]));
  return <EnlargeableFigure label={`${toolId} workspace`} enlargeLabel="Open Work View" capabilities={capabilities}>{children}</EnlargeableFigure>;
}

import React from 'react';
import { useFocusSafeDisabled } from './useFocusSafeDisabled.js';

export default function UniversalUndoButton({ controller, disabled = false, style = null, className = '' }) {
  const enabled = Boolean(controller?.canUndo) && !disabled;
  // The press that takes back the last step leaves nothing to undo; focus stays
  // here instead of dropping to the page (useFocusSafeDisabled).
  const availability = useFocusSafeDisabled(enabled);
  return (
    <button
      type="button"
      className={`mathmaster-universal-undo ${className}`.trim()}
      data-undo-owner={controller?.ownerId || 'current-tool'}
      onClick={() => { if (enabled) controller?.onUndo?.(); }}
      {...availability}
      title={controller?.label || 'Undo the most recent response change'}
      style={style}
    >
      {/* Icon and word are separate so a phone's one-row bar can show the
          icon alone; the word stays in the accessible name either way. */}
      <span aria-hidden="true">↶</span><span className="mathmaster-action-label"> Undo</span>
    </button>
  );
}

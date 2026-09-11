import React from 'react';

export default function UniversalUndoButton({ controller, disabled = false, style = null, className = '' }) {
  const enabled = Boolean(controller?.canUndo) && !disabled;
  return (
    <button
      type="button"
      className={`mathmaster-universal-undo ${className}`.trim()}
      data-undo-owner={controller?.ownerId || 'current-tool'}
      onClick={() => controller?.onUndo?.()}
      disabled={!enabled}
      title={controller?.label || 'Undo the most recent response change'}
      style={style}
    >
      ↶ Undo
    </button>
  );
}

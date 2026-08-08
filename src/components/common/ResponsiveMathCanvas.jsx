import React from 'react';

export const ResponsiveMathCanvas = ({
  children,
  viewBox = '0 0 400 400',
  aspectRatio = '1 / 1',
  ariaLabel = 'Interactive math canvas',
  interactive = true,
  svgProps = {},
}) => (
  <div className="math-canvas-wrapper" style={{ width: '100%', maxWidth: '100%', maxHeight: '100%', aspectRatio, display: 'flex', justifyContent: 'center', alignItems: 'center', touchAction: interactive ? 'none' : 'auto', overflow: 'hidden' }}>
    <svg
      {...svgProps}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      role={svgProps.role || (interactive ? 'application' : 'img')}
      aria-label={svgProps['aria-label'] || ariaLabel}
      className={`${svgProps.className || ''} ${interactive ? 'mathmaster-touch-surface' : ''}`.trim()}
      style={{ width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%', overflow: 'visible', userSelect: 'none', touchAction: interactive ? 'none' : 'auto', ...svgProps.style }}
    >
      {children}
    </svg>
  </div>
);

export default ResponsiveMathCanvas;

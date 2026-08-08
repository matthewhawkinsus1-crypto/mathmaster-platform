import React from 'react';

export const InteractivePlotPoint = ({ x, y, radius = 6, isSelected = false, onPointerDown, fill = '#202124', selectedFill = '#1a73e8', ariaLabel = 'Plot point' }) => (
  <g className="touchable-point" role="button" aria-label={ariaLabel} tabIndex="0" style={{ cursor: 'pointer' }} onPointerDown={onPointerDown}>
    <circle cx={x} cy={y} r="22" fill="transparent" stroke="transparent" pointerEvents="all" />
    <circle cx={x} cy={y} r={isSelected ? radius + 2 : radius} fill={isSelected ? selectedFill : fill} stroke="#ffffff" strokeWidth="2" pointerEvents="none" />
  </g>
);

export default InteractivePlotPoint;

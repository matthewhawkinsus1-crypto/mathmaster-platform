import React, { useState } from 'react';
import {
  DEFAULT_MASTERY_COURSE_ID, MASTERY_STATUS_COLORS, getMasteryStrands, masteryCourseLabel,
} from '../../platform/mastery/strandConfig.js';

const polarToCartesian = (cx, cy, radius, angle) => ({
  x: cx + radius * Math.cos(angle),
  y: cy + radius * Math.sin(angle),
});

const describeArc = (cx, cy, innerRadius, outerRadius, startAngle, endAngle) => {
  const startOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
  const endOuter = polarToCartesian(cx, cy, outerRadius, endAngle);
  const startInner = polarToCartesian(cx, cy, innerRadius, endAngle);
  const endInner = polarToCartesian(cx, cy, innerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle <= Math.PI ? 0 : 1;
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${endInner.x} ${endInner.y}`,
    'Z',
  ].join(' ');
};

export const MyMathPathWheel = ({
  masteryProfilesByTEKS = {},
  onSelectTEKS,
  size = 380,
  // The wheel shows the course the student is enrolled in. Showing an Algebra
  // II student the Algebra I standards reports mastery of a course they are
  // not taking, which is worse than showing nothing.
  courseId = DEFAULT_MASTERY_COURSE_ID,
}) => {
  const [focusedTeks, setFocusedTeks] = useState(null);
  const center = size / 2;
  const outerRadius = size * 0.44;
  const innerRadius = size * 0.26;
  const courseLabel = masteryCourseLabel(courseId);
  const entries = getMasteryStrands(courseId).flatMap((strand) => strand.codes.map((code) => ({
    code,
    strand,
    profile: masteryProfilesByTEKS[code] || {
      mastery: { status: 'Not Enough Evidence', estimate: null },
      signals: { retention: 'stable' },
    },
  })));
  const anglePerSegment = entries.length ? (2 * Math.PI) / entries.length : 0;
  const gapAngle = 0.012;
  const activeProfile = focusedTeks ? masteryProfilesByTEKS[focusedTeks] : null;

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: `${size}px`, aspectRatio: '1', margin: '0 auto' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }} aria-label={`Texas ${courseLabel} mastery wheel`}>
        {entries.map((entry, index) => {
          const startAngle = index * anglePerSegment - Math.PI / 2 + gapAngle / 2;
          const endAngle = (index + 1) * anglePerSegment - Math.PI / 2 - gapAngle / 2;
          const status = entry.profile.mastery?.status || 'Not Enough Evidence';
          const active = focusedTeks === entry.code;
          const retentionConcern = ['concern', 'confirmedLoss'].includes(entry.profile.signals?.retention);
          const badge = polarToCartesian(center, center, outerRadius + 7, (startAngle + endAngle) / 2);
          return (
            <g key={entry.code} role="button" tabIndex="0" aria-label={`${entry.code}: ${status}`} onClick={() => onSelectTEKS?.(entry.code)} onFocus={() => setFocusedTeks(entry.code)} onBlur={() => setFocusedTeks(null)} onMouseEnter={() => setFocusedTeks(entry.code)} onMouseLeave={() => setFocusedTeks(null)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectTEKS?.(entry.code); } }} style={{ cursor: 'pointer' }}>
              <path d={describeArc(center, center, innerRadius, active ? outerRadius + 5 : outerRadius, startAngle, endAngle)} fill={MASTERY_STATUS_COLORS[status] || MASTERY_STATUS_COLORS['Not Enough Evidence']} opacity={active ? 1 : 0.9} stroke="#fff" strokeWidth="2" />
              {retentionConcern && <circle cx={badge.x} cy={badge.y} r="5" fill="#d93025" stroke="#fff" strokeWidth="2" />}
            </g>
          );
        })}
        <circle cx={center} cy={center} r={innerRadius - 4} fill="#fff" />
        <text x={center} y={center - 8} textAnchor="middle" style={{ fontSize: '18px', fontWeight: 900, fill: '#202124' }}>{focusedTeks || 'My Math Path'}</text>
        <text x={center} y={center + 15} textAnchor="middle" style={{ fontSize: '12px', fill: '#5f6368' }}>{focusedTeks ? (activeProfile?.mastery?.status || 'Not Enough Evidence') : 'Choose a TEKS'}</text>
      </svg>
    </div>
  );
};

export default MyMathPathWheel;

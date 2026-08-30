import React, { useState } from 'react';
import {
  DEFAULT_MASTERY_COURSE_ID, MASTERY_STATUS_COLORS, getMasteryStrands, masteryCourseLabel,
} from '../../platform/mastery/strandConfig.js';
import { studentLabelForTeks } from '../../platform/path/skillLabels.js';
import { normalizeCoursePathPassProgress } from '../../platform/path/pathPassPresentation.js';

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
  skillProgressByTEKS = {},
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
    passProgress: normalizeCoursePathPassProgress(skillProgressByTEKS[code] || {}),
  })));
  const anglePerSegment = entries.length ? (2 * Math.PI) / entries.length : 0;
  const gapAngle = 0.012;
  const activeProfile = focusedTeks ? masteryProfilesByTEKS[focusedTeks] : null;
  const activePass = focusedTeks ? normalizeCoursePathPassProgress(skillProgressByTEKS[focusedTeks] || {}) : null;
  // Wrapped so a long skill name does not run off the hub of the wheel.
  const focusedLabel = focusedTeks ? studentLabelForTeks(focusedTeks) : 'My Math Path';

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: `${size}px`, aspectRatio: '1', margin: '0 auto' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }} aria-label={`Texas ${courseLabel} mastery wheel`}>
        {entries.map((entry, index) => {
          const startAngle = index * anglePerSegment - Math.PI / 2 + gapAngle / 2;
          const endAngle = (index + 1) * anglePerSegment - Math.PI / 2 - gapAngle / 2;
          const status = entry.profile.mastery?.status || 'Not Enough Evidence';
          const active = focusedTeks === entry.code;
          const retentionConcern = ['concern', 'confirmedLoss'].includes(entry.profile.signals?.retention);
          const passCount = entry.passProgress?.passesCompleted || 0;
          const badge = polarToCartesian(center, center, outerRadius + 7, (startAngle + endAngle) / 2);
          const passBadge = polarToCartesian(center, center, outerRadius - 9, (startAngle + endAngle) / 2);
          const passColor = passCount >= 3 ? '#5b21b6' : '#137333';
          return (
            <g key={entry.code} role="button" tabIndex="0" aria-label={`${studentLabelForTeks(entry.code)}: ${status}${passCount ? ` · Path Pass ${Math.min(passCount, 3)} complete` : ''}`} onClick={() => onSelectTEKS?.(entry.code)} onFocus={() => setFocusedTeks(entry.code)} onBlur={() => setFocusedTeks(null)} onMouseEnter={() => setFocusedTeks(entry.code)} onMouseLeave={() => setFocusedTeks(null)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectTEKS?.(entry.code); } }} style={{ cursor: 'pointer' }}>
              <path d={describeArc(center, center, innerRadius, active ? outerRadius + 5 : outerRadius, startAngle, endAngle)} fill={MASTERY_STATUS_COLORS[status] || MASTERY_STATUS_COLORS['Not Enough Evidence']} opacity={active ? 1 : 0.9} stroke={passCount ? passColor : '#fff'} strokeWidth={passCount ? 3 : 2} />
              {passCount > 0 && <circle cx={passBadge.x} cy={passBadge.y} r="4.5" fill={passColor} stroke="#fff" strokeWidth="1.5" />}
              {retentionConcern && <circle cx={badge.x} cy={badge.y} r="5" fill="#d93025" stroke="#fff" strokeWidth="2" />}
            </g>
          );
        })}
        <circle cx={center} cy={center} r={innerRadius - 4} fill="#fff" />
        {/* The name of the mathematics, not its catalogue number. The code is
            still the wheel's internal key and still what `onSelectTEKS` hands
            back — it is simply not what a student is asked to read. */}
        <text x={center} y={center - 6} textAnchor="middle" style={{ fontSize: '13px', fontWeight: 800, fill: '#202124' }}>
          {focusedLabel}
        </text>
        <text x={center} y={center + 15} textAnchor="middle" style={{ fontSize: '12px', fill: '#5f6368' }}>{focusedTeks ? (activeProfile?.mastery?.status || 'Not practised yet') : 'Choose a skill'}</text>
        {focusedTeks && activePass?.passesCompleted > 0 && (
          <text x={center} y={center + 32} textAnchor="middle" style={{ fontSize: '10.5px', fontWeight: 800, fill: activePass.passesCompleted >= 3 ? '#5b21b6' : '#137333' }}>
            Path Pass {Math.min(activePass.passesCompleted, 3)} complete
          </text>
        )}
      </svg>
    </div>
  );
};

export default MyMathPathWheel;

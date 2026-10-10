import React, { useId, useState } from 'react';
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

const NOT_ENOUGH_EVIDENCE = 'Not Enough Evidence';

// Room around the wheel for the topic ring and its numbers. The SVG scales to
// its container, so this only changes proportions, never the page width.
const RING_PADDING = 22;

export const MyMathPathWheel = ({
  masteryProfilesByTEKS = {},
  skillProgressByTEKS = {},
  onSelectTEKS,
  size = 380,
  // The wheel shows the course the student is enrolled in. Showing an Algebra
  // II student the Algebra I standards reports mastery of a course they are
  // not taking, which is worse than showing nothing.
  courseId = DEFAULT_MASTERY_COURSE_ID,
  // The list of topics and skill names under the wheel. Its accessible
  // alternative and its labels: forty-odd unlabelled wedges are otherwise a
  // picture a student has to hover one slice at a time to read.
  showLegend = true,
}) => {
  const [focusedTeks, setFocusedTeks] = useState(null);
  const [openStrands, setOpenStrands] = useState({});
  const legendId = useId();
  const center = size / 2;
  const outerRadius = size * 0.44;
  const innerRadius = size * 0.26;
  const courseLabel = masteryCourseLabel(courseId);
  const strands = getMasteryStrands(courseId);
  const entries = strands.flatMap((strand, strandIndex) => strand.codes.map((code) => ({
    code,
    strand,
    strandNumber: strandIndex + 1,
    profile: masteryProfilesByTEKS[code] || {
      mastery: { status: NOT_ENOUGH_EVIDENCE, estimate: null },
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
  const statusOf = (entry) => entry.profile.mastery?.status || NOT_ENOUGH_EVIDENCE;

  // One numbered arc per topic, around the wedges it holds, so a wedge can be
  // read as "topic 3" and found again in the list below.
  let cursor = 0;
  const strandArcs = strands.map((strand, index) => {
    const first = cursor;
    cursor += strand.codes.length;
    const startAngle = first * anglePerSegment - Math.PI / 2 + 0.02;
    const endAngle = cursor * anglePerSegment - Math.PI / 2 - 0.02;
    const members = entries.slice(first, cursor);
    return {
      strand,
      number: index + 1,
      first,
      startAngle,
      endAngle: Math.max(endAngle, startAngle + 0.01),
      label: polarToCartesian(center, center, outerRadius + 25, (startAngle + endAngle) / 2),
      members,
      mastered: members.filter((entry) => statusOf(entry) === 'Mastered').length,
    };
  });
  const viewBox = `${-RING_PADDING} ${-RING_PADDING} ${size + 2 * RING_PADDING} ${size + 2 * RING_PADDING}`;

  return (
    <div style={{ width: '100%', maxWidth: `${size}px`, margin: '0 auto' }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '1' }}>
        <svg
          width={size}
          height={size}
          viewBox={viewBox}
          role="group"
          aria-label={`Texas ${courseLabel} mastery wheel: ${entries.length} skills in ${strands.length} topics${showLegend ? ', listed by topic below the wheel' : ''}`}
          style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }}
        >
          {strandArcs.map((arc) => (
            <g key={`ring-${arc.strand.id}`} aria-hidden="true">
              <path
                d={describeArc(center, center, outerRadius + 13, outerRadius + 17, arc.startAngle, arc.endAngle)}
                style={{ fill: arc.number % 2 ? 'var(--mm-text-muted)' : 'var(--mm-border-strong)' }}
              />
              <circle cx={arc.label.x} cy={arc.label.y} r="9.5" style={{ fill: 'var(--mm-surface)', stroke: 'var(--mm-text-muted)' }} strokeWidth="1.5" />
              <text x={arc.label.x} y={arc.label.y + 4} textAnchor="middle" style={{ fontSize: '11px', fontWeight: 900, fill: 'var(--mm-text-strong)' }}>{arc.number}</text>
            </g>
          ))}
          {strandArcs.map((arc) => (
            <g key={arc.strand.id} role="group" aria-label={`Topic ${arc.number}: ${arc.strand.title}, ${arc.mastered} of ${arc.members.length} mastered`}>
              {arc.members.map((entry, offset) => {
                const index = arc.first + offset;
                const startAngle = index * anglePerSegment - Math.PI / 2 + gapAngle / 2;
                const endAngle = (index + 1) * anglePerSegment - Math.PI / 2 - gapAngle / 2;
                const status = statusOf(entry);
                const active = focusedTeks === entry.code;
                const retentionConcern = ['concern', 'confirmedLoss'].includes(entry.profile.signals?.retention);
                const passCount = entry.passProgress?.passesCompleted || 0;
                const badge = polarToCartesian(center, center, outerRadius + 7, (startAngle + endAngle) / 2);
                const passBadge = polarToCartesian(center, center, outerRadius - 9, (startAngle + endAngle) / 2);
                const passColor = passCount >= 3 ? '#5b21b6' : '#137333';
                return (
                  <g key={entry.code} role="button" tabIndex="0" aria-label={`${studentLabelForTeks(entry.code)} (topic ${entry.strandNumber}, ${entry.strand.title}): ${status}${passCount ? ` · Level ${Math.min(passCount, 3)} round done` : ''}`} onClick={() => onSelectTEKS?.(entry.code)} onFocus={() => setFocusedTeks(entry.code)} onBlur={() => setFocusedTeks(null)} onMouseEnter={() => setFocusedTeks(entry.code)} onMouseLeave={() => setFocusedTeks(null)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectTEKS?.(entry.code); } }} style={{ cursor: 'pointer' }}>
                    <path d={describeArc(center, center, innerRadius, active ? outerRadius + 5 : outerRadius, startAngle, endAngle)} fill={MASTERY_STATUS_COLORS[status] || MASTERY_STATUS_COLORS[NOT_ENOUGH_EVIDENCE]} opacity={active ? 1 : 0.9} style={{ stroke: passCount ? passColor : 'var(--mm-surface)' }} strokeWidth={passCount ? 3 : 2} />
                    {passCount > 0 && <circle cx={passBadge.x} cy={passBadge.y} r="4.5" fill={passColor} style={{ stroke: 'var(--mm-surface)' }} strokeWidth="1.5" />}
                    {retentionConcern && <circle cx={badge.x} cy={badge.y} r="5" fill="#d93025" style={{ stroke: 'var(--mm-surface)' }} strokeWidth="2" />}
                  </g>
                );
              })}
            </g>
          ))}
          <circle cx={center} cy={center} r={innerRadius - 4} style={{ fill: 'var(--mm-surface)' }} />
          {/* The name of the mathematics, not its catalogue number. The code is
              still the wheel's internal key and still what `onSelectTEKS` hands
              back — it is simply not what a student is asked to read. */}
          <text x={center} y={center - 6} textAnchor="middle" style={{ fontSize: '13px', fontWeight: 800, fill: 'var(--mm-text-strong)' }}>
            {focusedLabel}
          </text>
          <text x={center} y={center + 15} textAnchor="middle" style={{ fontSize: '12px', fill: 'var(--mm-text-muted)' }}>{focusedTeks ? (activeProfile?.mastery?.status || 'Not practised yet') : 'Choose a skill'}</text>
          {focusedTeks && activePass?.passesCompleted > 0 && (
            <text x={center} y={center + 32} textAnchor="middle" style={{ fontSize: '10.5px', fontWeight: 800, fill: activePass.passesCompleted >= 3 ? 'var(--mm-accent-text)' : 'var(--mm-success-text)' }}>
              Level {Math.min(activePass.passesCompleted, 3)} round done
            </text>
          )}
        </svg>
      </div>

      {showLegend && (
        <section aria-labelledby={`${legendId}-title`} data-wheel-legend style={{ marginTop: 14, textAlign: 'left' }}>
          <h3 id={`${legendId}-title`} style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 900, color: 'var(--mm-text-strong)' }}>
            Topics on your wheel
          </h3>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
            {strandArcs.map((arc) => {
              const open = Boolean(openStrands[arc.strand.id]);
              const listId = `${legendId}-topic-${arc.number}`;
              return (
                <li key={arc.strand.id} data-wheel-topic={arc.number} style={{ border: '1px solid var(--mm-border-soft)', borderRadius: 10, background: 'var(--mm-surface)' }}>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={listId}
                    onClick={() => setOpenStrands((current) => ({ ...current, [arc.strand.id]: !open }))}
                    style={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', color: 'var(--mm-text-strong)', font: 'inherit' }}
                  >
                    <span aria-hidden="true" style={{ flex: '0 0 auto', width: 24, height: 24, borderRadius: 999, display: 'inline-grid', placeItems: 'center', border: '1.5px solid var(--mm-text-muted)', fontSize: 12, fontWeight: 900 }}>{arc.number}</span>
                    <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 850, lineHeight: 1.3 }}>{arc.strand.title}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--mm-text-muted)', fontWeight: 700 }}>
                        {arc.mastered} of {arc.members.length} mastered · {open ? 'Hide' : 'Show'} {arc.members.length === 1 ? 'skill' : `${arc.members.length} skills`}
                      </span>
                    </span>
                    <span aria-hidden="true" style={{ color: 'var(--mm-text-muted)' }}>{open ? '▴' : '▾'}</span>
                  </button>
                  {open && (
                    <ul id={listId} style={{ margin: 0, padding: '0 6px 6px', listStyle: 'none', display: 'grid', gap: 2 }}>
                      {arc.members.map((entry) => {
                        const status = statusOf(entry);
                        return (
                          <li key={entry.code}>
                            <button
                              type="button"
                              onClick={() => onSelectTEKS?.(entry.code)}
                              onFocus={() => setFocusedTeks(entry.code)}
                              onBlur={() => setFocusedTeks(null)}
                              onMouseEnter={() => setFocusedTeks(entry.code)}
                              onMouseLeave={() => setFocusedTeks(null)}
                              style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', border: 0, borderRadius: 8, background: focusedTeks === entry.code ? 'var(--mm-primary-soft)' : 'transparent', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
                            >
                              <span aria-hidden="true" style={{ flex: '0 0 auto', width: 12, height: 12, borderRadius: 999, background: MASTERY_STATUS_COLORS[status] || MASTERY_STATUS_COLORS[NOT_ENOUGH_EVIDENCE], border: '1px solid var(--mm-border-strong)' }} />
                              <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: 13, fontWeight: 750, color: 'var(--mm-text-strong)', lineHeight: 1.35 }}>{studentLabelForTeks(entry.code)}</span>
                              <span style={{ flex: '0 0 auto', fontSize: 11.5, fontWeight: 750, color: 'var(--mm-text-muted)', textAlign: 'right' }}>{status}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
};

export default MyMathPathWheel;

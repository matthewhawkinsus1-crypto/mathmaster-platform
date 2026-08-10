import React, { useMemo, useState } from 'react';
import { buildDomainReadiness, explainDomain } from '../../platform/ccmr/domainReadiness.js';

// One assessment's readiness, as a wheel.
//
// One wheel at a time, for the framework the student selected. Four
// frameworks in one circle would invite the comparison that matters least —
// a student is preparing for a test, not ranking tests.
//
// The segments are that assessment's own reporting domains, sized by the
// weighting the registry already carries, so the picture says what the test
// actually emphasises. Colour is readiness, and readiness here is about
// TRANSFER, not about course mastery: a student can know the mathematics and
// still be new to the format, and that gap has a colour of its own.
//
// Nothing is ever drawn as 0% for want of evidence. An unpractised domain says
// "ready — not yet practised", because that is what it is.

const polar = (cx, cy, radius, angle) => ({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });

const arcPath = (cx, cy, inner, outer, start, end) => {
  const so = polar(cx, cy, outer, start);
  const eo = polar(cx, cy, outer, end);
  const si = polar(cx, cy, inner, end);
  const ei = polar(cx, cy, inner, start);
  const large = end - start <= Math.PI ? 0 : 1;
  return [
    `M ${so.x} ${so.y}`,
    `A ${outer} ${outer} 0 ${large} 1 ${eo.x} ${eo.y}`,
    `L ${si.x} ${si.y}`,
    `A ${inner} ${inner} 0 ${large} 0 ${ei.x} ${ei.y}`,
    'Z',
  ].join(' ');
};

export const CCMRReadinessWheel = ({
  recommendations = null,
  selectedDomainId = null,
  onSelectDomain = null,
  size = 320,
}) => {
  const [focused, setFocused] = useState(null);
  const domains = useMemo(() => buildDomainReadiness(recommendations), [recommendations]);

  if (!domains.length) return null;

  const center = size / 2;
  const outer = size * 0.44;
  const inner = size * 0.27;
  const totalWeight = domains.reduce((sum, entry) => sum + (Number(entry.weight) || 1), 0);
  const gap = 0.02;
  const active = domains.find((entry) => entry.domainId === (focused || selectedDomainId)) || null;

  let cursor = -Math.PI / 2;
  const segments = domains.map((entry) => {
    const span = ((Number(entry.weight) || 1) / totalWeight) * Math.PI * 2;
    const start = cursor + gap / 2;
    const end = cursor + span - gap / 2;
    cursor += span;
    return { entry, start, end };
  });

  const title = recommendations?.profile?.displayName || 'Readiness';

  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: size, aspectRatio: '1' }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }}
          aria-label={`${title} readiness by domain`}
        >
          {segments.map(({ entry, start, end }) => {
            const isActive = entry.domainId === (focused || selectedDomainId);
            return (
              <g
                key={entry.domainId}
                role="button"
                tabIndex={entry.selectable ? 0 : -1}
                aria-label={`${entry.title}: ${entry.label}`}
                aria-disabled={entry.selectable ? undefined : 'true'}
                onClick={() => entry.selectable && onSelectDomain?.(entry.domainId)}
                onKeyDown={(event) => {
                  if (!entry.selectable) return;
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectDomain?.(entry.domainId); }
                }}
                onFocus={() => setFocused(entry.domainId)}
                onBlur={() => setFocused(null)}
                onMouseEnter={() => setFocused(entry.domainId)}
                onMouseLeave={() => setFocused(null)}
                style={{ cursor: entry.selectable ? 'pointer' : 'default' }}
              >
                <path
                  d={arcPath(center, center, inner, isActive ? outer + 6 : outer, start, end)}
                  fill={entry.color}
                  opacity={entry.selectable ? (isActive ? 1 : 0.9) : 0.45}
                  stroke="#fff"
                  strokeWidth="2"
                />
              </g>
            );
          })}
          {/* The hub is decoration. Without this it sits over the middle of
              every segment's hit area and swallows clicks aimed at the ring. */}
          <circle cx={center} cy={center} r={inner - 4} fill="#fff" pointerEvents="none" />
          <text x={center} y={center - 6} textAnchor="middle" pointerEvents="none" style={{ fontSize: 14, fontWeight: 900, fill: '#202124' }}>
            {active ? '' : title}
          </text>
          <text x={center} y={center + 14} textAnchor="middle" pointerEvents="none" style={{ fontSize: 11, fill: '#5f6368' }}>
            {active ? '' : 'Choose a part of the test'}
          </text>
        </svg>
      </div>

      <div style={{ flex: '1 1 240px', minWidth: 0, textAlign: 'left' }}>
        {active ? (
          <>
            <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', color: active.textColor }}>
              {active.label}
            </p>
            <h4 style={{ margin: '0 0 6px', fontSize: 17, color: '#202124' }}>{active.title}</h4>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#5f6368', lineHeight: 1.55 }}>{explainDomain(active)}</p>
            <p style={{ margin: 0, fontSize: 12, color: '#3c4043' }}>
              {active.skillCount} skill{active.skillCount === 1 ? '' : 's'} matched
              {' · '}
              {/* Never a percentage the student did not earn. */}
              {active.proficiency == null
                ? 'not practised in this format yet'
                : `${Math.round(active.proficiency * 100)}% in this format`}
            </p>
          </>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {domains.map((entry) => (
              <li key={entry.domainId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#3c4043' }}>
                <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: entry.color, opacity: entry.selectable ? 1 : 0.45, flexShrink: 0 }} />
                <span style={{ minWidth: 0 }}>
                  <strong>{entry.title}</strong> — {entry.label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default CCMRReadinessWheel;

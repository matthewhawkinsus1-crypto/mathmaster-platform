import React from 'react';
import ToolShell, { Panel, ToolGrid } from '../shared/ToolShell';

// A student review screen is the wrong place for a JSON dump. Render the
// response as readable statements, and fall back to hiding it rather than
// showing an object literal to a fifteen-year-old.
const describeResponse = (response) => {
  if (response == null) return [];
  if (Array.isArray(response)) {
    return response.map((entry, index) => ({ label: `Part ${index + 1}`, value: describeValue(entry) }));
  }
  if (typeof response === 'object') {
    return Object.entries(response)
      .map(([key, value]) => ({ label: humanizeKey(key), value: describeValue(value) }))
      .filter((entry) => entry.value !== null);
  }
  return [{ label: 'Your answer', value: String(response) }];
};

const humanizeKey = (key) => String(key)
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/^./, (character) => character.toUpperCase());

const describeValue = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  if (Array.isArray(value)) {
    // Coordinate pairs are the common case and read far better as (x, y).
    if (value.length === 2 && value.every((entry) => typeof entry === 'number')) return `(${value[0]}, ${value[1]})`;
    const described = value.map(describeValue).filter(Boolean);
    return described.length ? described.join(', ') : null;
  }
  if (typeof value === 'object') {
    const described = Object.entries(value).map(([key, entry]) => {
      const rendered = describeValue(entry);
      return rendered ? `${humanizeKey(key)}: ${rendered}` : null;
    }).filter(Boolean);
    return described.length ? described.join(' · ') : null;
  }
  return null;
};

export default function SolutionReview2({ questionData = {}, attemptRecord = {}, review = {} }) {
  // A DEFAULT PARAMETER ONLY COVERS `undefined`. Passed an explicit null — which
  // a caller with "no attempt yet" naturally does — every read below threw and
  // the student got a blank screen instead of a review. Normalise first, then
  // destructure; the same shape of bug as `= {}` on a nullable options object.
  const record = attemptRecord || {};
  const reviewData = review || {};
  const steps = reviewData.steps || questionData.solutionSteps || [
    'Identify what the question is actually asking for.',
    'Choose a representation or operation that keeps the relationship true.',
    'Check the result against the original problem.',
  ];
  const misconceptions = reviewData.misconceptions || record.misconceptions || [];
  const responseEntries = describeResponse(record.response);
  const scoreText = typeof record.score === 'number' ? `${Math.round(record.score * 100)}%` : null;

  return (
    <ToolShell
      title="Solution Review"
      subtitle="What your work showed, and what a strong solution path looks like for this kind of problem."
      badge="Review"
    >
      <ToolGrid min={320}>
        <Panel title="What you submitted">
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 999, fontWeight: 800,
            background: record.isCorrect ? '#e6f4ea' : '#fef7e0',
            color: record.isCorrect ? '#137333' : '#7a4f01',
          }}>
            {record.isCorrect ? '✓ Correct' : '↻ Worth another look'}
          </div>

          <dl style={{ margin: '14px 0 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', alignItems: 'baseline' }}>
            {record.attemptNumber != null ? <>
              <dt style={{ color: '#5f6b7a', fontSize: 13 }}>Attempt</dt>
              <dd style={{ margin: 0, fontWeight: 700 }}>{record.attemptNumber}</dd>
            </> : null}
            {scoreText ? <>
              <dt style={{ color: '#5f6b7a', fontSize: 13 }}>Credit earned</dt>
              <dd style={{ margin: 0, fontWeight: 700 }}>{scoreText}</dd>
            </> : null}
            {responseEntries.map((entry) => (
              <React.Fragment key={entry.label}>
                <dt style={{ color: '#5f6b7a', fontSize: 13 }}>{entry.label}</dt>
                <dd style={{ margin: 0, fontWeight: 700 }}>{entry.value}</dd>
              </React.Fragment>
            ))}
          </dl>

          {!responseEntries.length ? (
            <p style={{ color: '#5f6b7a', marginBottom: 0, marginTop: 14 }}>No response was recorded for this attempt.</p>
          ) : null}
        </Panel>

        <Panel title="A strong solution path">
          <ol style={{ lineHeight: 1.7, paddingLeft: 20, margin: 0 }}>
            {steps.map((step, index) => <li key={index}>{step}</li>)}
          </ol>
          {misconceptions.length ? (
            <>
              <h4 style={{ margin: '16px 0 6px', fontSize: 14, color: '#7a4f01' }}>Common traps on this one</h4>
              <ul style={{ lineHeight: 1.7, paddingLeft: 20, margin: 0, color: '#3c4756' }}>
                {misconceptions.map((item, index) => <li key={index}>{item}</li>)}
              </ul>
            </>
          ) : null}
        </Panel>
      </ToolGrid>
    </ToolShell>
  );
}

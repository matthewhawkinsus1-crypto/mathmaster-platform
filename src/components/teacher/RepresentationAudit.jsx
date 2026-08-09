import { useMemo } from 'react';
import { REPRESENTATIONS, getQuestionRepresentation } from '../../platform/contract/questionTypeCatalog';

// A JSON file can be perfectly valid and still be the wrong assignment. A lesson
// that teaches domain and range with twenty graphs, turned into twenty sentences
// describing graphs, passes every syntax check ever written. This panel makes
// the representation mix visible before the teacher publishes.

const LABELS = {
  [REPRESENTATIONS.GRAPH]: 'Graphs',
  [REPRESENTATIONS.NUMBER_LINE]: 'Number lines',
  [REPRESENTATIONS.TABLE]: 'Tables',
  [REPRESENTATIONS.MAPPING]: 'Mapping diagrams',
  [REPRESENTATIONS.ORDERED_PAIRS]: 'Ordered pairs',
  [REPRESENTATIONS.SYMBOLIC]: 'Symbolic / computation',
  [REPRESENTATIONS.INTERACTIVE]: 'Interactive tools',
  [REPRESENTATIONS.TEXT]: 'Text only',
};

const VISUAL = new Set([
  REPRESENTATIONS.GRAPH,
  REPRESENTATIONS.NUMBER_LINE,
  REPRESENTATIONS.TABLE,
  REPRESENTATIONS.MAPPING,
  REPRESENTATIONS.INTERACTIVE,
]);

export const summarizeRepresentations = (questions = []) => {
  const counts = {};
  const list = Array.isArray(questions) ? questions : [];
  list.forEach((question) => {
    const representation = getQuestionRepresentation(question);
    counts[representation] = (counts[representation] || 0) + 1;
  });
  const total = list.length;
  const visualCount = Object.entries(counts)
    .filter(([key]) => VISUAL.has(key))
    .reduce((sum, [, value]) => sum + value, 0);
  const textOnly = counts[REPRESENTATIONS.TEXT] || 0;
  return { counts, total, visualCount, textOnly, visualShare: total ? visualCount / total : 0 };
};

export default function RepresentationAudit({ questions = [], warnings = [] }) {
  const summary = useMemo(() => summarizeRepresentations(questions), [questions]);
  if (!summary.total) return null;

  const rows = Object.entries(summary.counts).sort((a, b) => b[1] - a[1]);
  // A text-only majority is the shape of an assignment that flattened its source.
  const mostlyText = summary.total >= 4 && summary.visualShare < 0.25;
  const noVisuals = summary.total >= 4 && summary.visualCount === 0;

  const tone = noVisuals ? 'alert' : mostlyText || warnings.length ? 'warn' : 'ok';
  const palette = {
    ok: { bg: '#e6f4ea', border: '#9bd2aa', text: '#137333' },
    warn: { bg: '#fff8e6', border: '#f0c761', text: '#7a4f01' },
    alert: { bg: '#fce8e6', border: '#f1a5a0', text: '#a50e0e' },
  }[tone];

  return (
    <section style={{ padding: '13px 15px', marginBottom: 16, borderRadius: 9, background: palette.bg, border: `1px solid ${palette.border}`, textAlign: 'left' }}>
      <h4 style={{ margin: '0 0 8px', fontSize: 14, color: palette.text }}>
        What students will actually do
      </h4>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: rows.length ? 10 : 0 }}>
        {rows.map(([representation, count]) => (
          <span key={representation} style={{ fontSize: 13, color: '#3c4756' }}>
            <strong>{count}</strong> {LABELS[representation] || representation}
          </span>
        ))}
      </div>

      {noVisuals && (
        <p style={{ margin: '0 0 6px', fontSize: 13, color: palette.text, lineHeight: 1.55 }}>
          <strong>No visual questions.</strong> Every question in this assignment is text or symbols.
          If the source material teaches with graphs, tables or number lines, this assignment has
          flattened them into prose — ask the AI to rebuild those questions with real graphs.
        </p>
      )}

      {!noVisuals && mostlyText && (
        <p style={{ margin: '0 0 6px', fontSize: 13, color: palette.text, lineHeight: 1.55 }}>
          <strong>Mostly text.</strong> Only {summary.visualCount} of {summary.total} questions show
          the student anything to read or build. Check that this matches how the source teaches.
        </p>
      )}

      {warnings.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: palette.text }}>
            {warnings.length} authoring note{warnings.length === 1 ? '' : 's'}
          </summary>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13, color: '#3c4756', lineHeight: 1.6 }}>
            {warnings.map((warning, index) => <li key={index}>{warning}</li>)}
          </ul>
        </details>
      )}

      {tone === 'ok' && !warnings.length && (
        <p style={{ margin: 0, fontSize: 13, color: palette.text }}>
          {summary.visualCount} of {summary.total} questions put something in front of the student to read or build.
        </p>
      )}
    </section>
  );
}

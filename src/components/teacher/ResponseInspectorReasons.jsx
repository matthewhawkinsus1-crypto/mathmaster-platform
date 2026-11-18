/*
 * "WHY WAS THIS MARKED WRONG?" — EVERY REASON THE INSPECTOR FOUND, IN ORDER.
 *
 * The model (functions/shared/responseInspector.mjs diagnoseResponse) lists
 * each reason the evidence supports, most telling first. A reason the server
 * wrote with lines (functions/shared/responseInspectorReasons.mjs) is a title,
 * its lines and what the teacher can do; an older reason is its explanation.
 *
 * A line is text and values. A value is something a student typed or an
 * author keyed, so it is drawn as text, exactly as written: React escapes it,
 * <bdi> keeps a right-to-left digit from reordering the sentence around it,
 * and it wraps anywhere rather than pushing the dialog wider than a phone.
 */
const valueStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  background: 'var(--mm-surface-sunken)',
  border: '1px solid var(--mm-border)',
  borderRadius: 4,
  padding: '0 4px',
  overflowWrap: 'anywhere',
  whiteSpace: 'pre-wrap',
};

// Text from anything: an object whose toString is not a function would make
// String() throw, so it is written out as JSON, or as nothing.
export const asText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return String(value);
  } catch {
    try { return JSON.stringify(value) ?? ''; } catch { return ''; }
  }
};

function ReasonLine({ line }) {
  const segments = Array.isArray(line) ? line : [];
  return (
    <p style={{ margin: '4px 0', overflowWrap: 'anywhere' }}>
      {segments.map((segment, index) => (segment && typeof segment === 'object' && 'value' in segment
        ? <bdi key={index} data-inspector-value="" style={valueStyle}>{asText(segment.value)}</bdi>
        : <span key={index}>{asText(segment?.text)}</span>))}
    </p>
  );
}

export const diagnosisReasons = (diagnosis) => (Array.isArray(diagnosis?.reasons) && diagnosis.reasons.length
  ? diagnosis.reasons
  : (diagnosis ? [diagnosis] : []));

export default function ResponseInspectorReasons({ diagnosis }) {
  const reasons = diagnosisReasons(diagnosis);
  if (!reasons.length) return <p>No diagnosis is available for this attempt.</p>;
  return (
    <ul data-inspector-reasons="" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
      {reasons.map((reason, index) => (
        <li key={`${asText(reason?.code)}-${index}`} data-reason={asText(reason?.code)} style={{ padding: '10px 12px', border: '1px solid var(--mm-border)', borderRadius: 8, background: 'var(--mm-surface)' }}>
          <p style={{ margin: 0, fontWeight: 800, color: 'var(--mm-text-strong)', overflowWrap: 'anywhere' }}>{asText(reason?.title || reason?.explanation)}</p>
          {(Array.isArray(reason?.lines) ? reason.lines : []).map((line, lineIndex) => <ReasonLine key={lineIndex} line={line} />)}
          {reason?.action ? <p style={{ margin: '6px 0 0', color: 'var(--mm-text-muted)', overflowWrap: 'anywhere' }}>{asText(reason.action)}</p> : null}
        </li>
      ))}
    </ul>
  );
}

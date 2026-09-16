import MathText from '../common/MathText.jsx';

const panelStyle = { padding: 18, borderRadius: 12, background: '#2b2435' };

const displayScalar = (value) => {
  if (value == null || value === '') return 'No response entered yet';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
};

function StructuredValue({ value, label = null, depth = 0 }) {
  if (value == null || typeof value !== 'object') {
    return <div style={{ lineHeight: 1.5 }}>{label && <strong>{label}: </strong>}<MathText>{displayScalar(value)}</MathText></div>;
  }
  if (Array.isArray(value)) {
    if (!value.length) return <div>{label && <strong>{label}: </strong>}No work entered yet</div>;
    const coordinateLike = value.every((entry) => Array.isArray(entry) && entry.length === 2 && entry.every(Number.isFinite));
    if (coordinateLike) return <div>{label && <strong>{label}: </strong>}{value.map(([x, y]) => `(${x}, ${y})`).join(' · ')}</div>;
    return <div style={{ display: 'grid', gap: 6 }}>{label && <strong>{label}</strong>}{value.map((entry, index) => <StructuredValue key={index} value={entry} label={typeof entry === 'object' ? null : `${index + 1}`} depth={depth + 1} />)}</div>;
  }
  const entries = Object.entries(value);
  if (!entries.length) return <div>{label && <strong>{label}: </strong>}No work entered yet</div>;
  return (
    <section style={depth ? { marginLeft: 10, paddingLeft: 12, borderLeft: '2px solid #685b78' } : undefined}>
      {label && <strong style={{ display: 'block', marginBottom: 5 }}>{label}</strong>}
      <div style={{ display: 'grid', gap: 6 }}>
        {entries.map(([key, entry]) => <StructuredValue key={key} value={entry} label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())} depth={depth + 1} />)}
      </div>
    </section>
  );
}

export default function StudentSpotlightView({ request, frame, onStop }) {
  return (
    <section aria-label="Student Spotlight projector view" style={{ marginBottom: 16, padding: 24, borderRadius: 16, background: '#17131f', color: '#fff', minHeight: 260 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'start' }}>
        <div>
          <div style={{ color: '#d7b9ff', fontSize: 12, fontWeight: 900, letterSpacing: '.1em' }}>STUDENT SPOTLIGHT · PRESENTING WITH CONSENT</div>
          <h2 style={{ margin: '6px 0 2px', fontSize: 30 }}>{request?.studentLabel || 'Student'}</h2>
          <div style={{ color: '#d8d2df' }}>{frame?.assignmentTitle || 'Waiting for current MathMaster work…'}</div>
        </div>
        <button type="button" onClick={onStop} style={{ padding: '9px 13px', borderRadius: 7, border: '1px solid #f28b82', background: '#fff', color: '#b3261e', fontWeight: 800, cursor: 'pointer' }}>Stop Spotlight</button>
      </div>
      {frame ? (
        <div style={{ marginTop: 24, display: 'grid', gap: 16 }}>
          <div style={{ padding: 18, borderRadius: 12, background: '#fff', color: '#202124', fontSize: 21, lineHeight: 1.45 }}><MathText>{frame.question?.prompt || 'Current question'}</MathText></div>
          <div style={panelStyle}>
            <strong style={{ display: 'block', marginBottom: 10, color: '#d7b9ff' }}>Current student work</strong>
            {Array.isArray(frame.work?.parts) && frame.work.parts.length > 0
              ? frame.work.parts.map((part, index) => <StructuredValue key={part?.id || index} label={part?.label || `Part ${index + 1}`} value={part?.value ?? part?.response ?? part} />)
              : <StructuredValue value={frame.work?.response ?? frame.work?.toolState ?? frame.work} />}
          </div>
        </div>
      ) : <div style={{ marginTop: 28, color: '#d8d2df' }}>Connecting to the student&apos;s current MathMaster question…</div>}
    </section>
  );
}

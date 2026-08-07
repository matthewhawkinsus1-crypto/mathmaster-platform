import GraphDisplay from './GraphDisplay';
import {
  buildNaturalMeaning,
  buildInterpretationGraph,
  EMPTY_POINT_MEANING,
  normalizeInterpretationConfig,
} from './contextInterpretationUtils';

const borderFor = (feedback, id) => {
  const grade = feedback?.partGrades?.find((part) => part.id === id);
  if (!grade) return '#bdc7d6';
  return grade.isCorrect ? '#188038' : '#d93025';
};

const inputStyle = (border) => ({
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 11px',
  borderRadius: '8px',
  border: `2px solid ${border}`,
  background: '#fff',
  font: 'inherit',
});

const cardStyle = {
  padding: '13px',
  borderRadius: '11px',
  border: '1px solid #d7e0eb',
  background: '#fff',
};

export default function PointMeaningBuilder({
  config: rawConfig,
  values: rawValues,
  onChange,
  graph = null,
  feedback = null,
  prefix = 'meaning',
  disabled = false,
  showGraph = true,
  quantityChoices = [],
}) {
  const config = normalizeInterpretationConfig(rawConfig);
  const values = { ...EMPTY_POINT_MEANING, ...(rawValues || {}) };
  const [expectedX, expectedY] = config.target.coordinates;
  const graphWithResponse = buildInterpretationGraph(graph, values, config);
  const naturalMeaning = buildNaturalMeaning(values, config);
  const choices = Array.isArray(quantityChoices) && quantityChoices.length
    ? quantityChoices
    : [
        { id: config.x.id, label: config.x.name, unit: config.x.unit },
        { id: config.y.id, label: config.y.name, unit: config.y.unit },
      ];

  const setField = (field, value) => onChange?.({ ...values, [field]: value });
  const targetLabel = config.target.label || (Number.isFinite(expectedX) && Number.isFinite(expectedY) ? `(${expectedX}, ${expectedY})` : 'the highlighted point');

  if (config.responseMode === 'open') {
    return (
      <section style={{ marginTop: '12px' }}>
        <div style={{ padding: '15px', borderRadius: '11px', background: '#f8fbff', border: '1px solid #cbd9ec' }}>
          <strong>Interpret {targetLabel} in this situation.</strong>
          <div style={{ marginTop: '5px', color: '#5f6368' }}>Explain what both coordinates mean using the quantities and units from the scenario.</div>
        </div>
        {showGraph && graphWithResponse && <GraphDisplay graph={graphWithResponse} title="Point interpretation graph" />}
        <textarea
          value={values.openText}
          disabled={disabled}
          onChange={(event) => setField('openText', event.target.value)}
          placeholder="Explain what the point means in context."
          style={{ ...inputStyle(borderFor(feedback, `${prefix}-open`)), minHeight: '105px', marginTop: '12px', resize: 'vertical' }}
        />
      </section>
    );
  }

  return (
    <section style={{ marginTop: '12px' }}>
      <div style={{ padding: '15px', borderRadius: '11px', background: '#f8fbff', border: '1px solid #cbd9ec', lineHeight: 1.55 }}>
        <strong>The highlighted point represents {config.target.kind === 'startingPoint' ? 'the beginning of this situation' : 'a meaningful point in this situation'}.</strong>
        <div style={{ marginTop: '4px', color: '#5f6368' }}>Build a statement that explains what each coordinate means. Your entries are reflected on the graph as you work.</div>
      </div>

      {showGraph && graphWithResponse && <GraphDisplay graph={graphWithResponse} title="Point interpretation graph" />}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '14px', alignItems: 'stretch' }}>
        <div style={cardStyle}>
          <div style={{ fontWeight: 900, color: '#174ea6', marginBottom: '10px' }}>X-coordinate meaning</div>
          {config.responseMode === 'builder' ? (
            <label style={{ display: 'block', fontWeight: 800 }}>Quantity
              <select
                value={values.xQuantityId}
                disabled={disabled}
                onChange={(event) => setField('xQuantityId', event.target.value)}
                style={{ ...inputStyle(borderFor(feedback, `${prefix}-x-quantity`)), marginTop: '6px' }}
              >
                <option value="">Choose the quantity</option>
                {choices.map((choice) => <option key={`x-${choice.id}`} value={choice.id}>{choice.label}</option>)}
              </select>
            </label>
          ) : (
            <div style={{ fontWeight: 800, marginBottom: '12px' }}>{config.x.name}</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '8px', marginTop: '11px' }}>
            <label style={{ fontWeight: 800 }}>Value
              <input
                type="number"
                step="any"
                value={values.xValue}
                disabled={disabled}
                onChange={(event) => setField('xValue', event.target.value)}
                style={{ ...inputStyle(borderFor(feedback, `${prefix}-x-value`)), marginTop: '6px' }}
              />
            </label>
            <label style={{ fontWeight: 800 }}>Unit
              <input
                value={values.xUnit}
                disabled={disabled}
                onChange={(event) => setField('xUnit', event.target.value)}
                style={{ ...inputStyle(borderFor(feedback, `${prefix}-x-unit`)), marginTop: '6px' }}
              />
            </label>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 900, color: '#9334e6', marginBottom: '10px' }}>Y-coordinate meaning</div>
          {config.responseMode === 'builder' ? (
            <label style={{ display: 'block', fontWeight: 800 }}>Quantity
              <select
                value={values.yQuantityId}
                disabled={disabled}
                onChange={(event) => setField('yQuantityId', event.target.value)}
                style={{ ...inputStyle(borderFor(feedback, `${prefix}-y-quantity`)), marginTop: '6px' }}
              >
                <option value="">Choose the quantity</option>
                {choices.map((choice) => <option key={`y-${choice.id}`} value={choice.id}>{choice.label}</option>)}
              </select>
            </label>
          ) : (
            <div style={{ fontWeight: 800, marginBottom: '12px' }}>{config.y.name}</div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '8px', marginTop: '11px' }}>
            <label style={{ fontWeight: 800 }}>Value
              <input
                type="number"
                step="any"
                value={values.yValue}
                disabled={disabled}
                onChange={(event) => setField('yValue', event.target.value)}
                style={{ ...inputStyle(borderFor(feedback, `${prefix}-y-value`)), marginTop: '6px' }}
              />
            </label>
            <label style={{ fontWeight: 800 }}>Unit
              <input
                value={values.yUnit}
                disabled={disabled}
                onChange={(event) => setField('yUnit', event.target.value)}
                style={{ ...inputStyle(borderFor(feedback, `${prefix}-y-unit`)), marginTop: '6px' }}
              />
            </label>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '14px', padding: '15px 17px', borderRadius: '11px', background: naturalMeaning ? '#eef7ff' : '#f8f9fa', border: `1px solid ${naturalMeaning ? '#9fc5ef' : '#d8dde6'}` }}>
        <div style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.05em', color: '#5f6368' }}>Your interpretation</div>
        <div style={{ marginTop: '7px', fontSize: '17px', lineHeight: 1.55, fontWeight: 700 }}>
          {naturalMeaning || 'Complete the coordinate meaning above to build your statement.'}
        </div>
      </div>
    </section>
  );
}

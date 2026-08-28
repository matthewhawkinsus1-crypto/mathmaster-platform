import GraphAxisEditor from '../../GraphAxisEditor';

const positiveNumberOr = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const completeAxisResponse = (values, { requireUnits, requireScale }) => Boolean(
  String(values.xLabel || '').trim()
  && String(values.yLabel || '').trim()
  && (!requireUnits || (String(values.xUnit || '').trim() && String(values.yUnit || '').trim()))
  && (!requireScale || (Number(values.xStep) > 0 && Number(values.yStep) > 0))
);

export default function AxisSetupStage({
  stage,
  value,
  onChange,
  disabled = false,
}) {
  const quantities = Array.isArray(stage?.quantities)
    ? stage.quantities.filter((item) => item?.id)
    : [];
  const current = value && typeof value === 'object' ? value : {};
  const requireUnits = stage?.requireUnits !== false;
  const requireScale = stage?.requireScale === true;
  const baseGraph = stage?.graph && typeof stage.graph === 'object' ? stage.graph : {};
  const baseAxisDisplay = baseGraph.axisDisplay && typeof baseGraph.axisDisplay === 'object'
    ? baseGraph.axisDisplay
    : {};

  const setField = (field, fieldValue) => {
    const next = { ...current, [field]: fieldValue };
    onChange({
      ...next,
      __mathmasterWorkflowArtifact: 'axes',
      isComplete: completeAxisResponse(next, { requireUnits, requireScale }),
    });
  };

  const displayGraph = {
    ...baseGraph,
    xAxisLabel: current.xLabel || '',
    yAxisLabel: current.yLabel || '',
    xAxisUnit: requireUnits ? (current.xUnit || '') : '',
    yAxisUnit: requireUnits ? (current.yUnit || '') : '',
    xStep: positiveNumberOr(current.xStep, baseGraph.xStep),
    yStep: positiveNumberOr(current.yStep, baseGraph.yStep),
    axisDisplay: {
      ...baseAxisDisplay,
      showAxisTitles: true,
      showAxisSymbols: true,
      showXTickLabels: requireScale
        ? Number(current.xStep) > 0
        : baseAxisDisplay.showXTickLabels !== false,
      showYTickLabels: requireScale
        ? Number(current.yStep) > 0
        : baseAxisDisplay.showYTickLabels !== false,
    },
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <GraphAxisEditor
        graph={displayGraph}
        quantities={quantities}
        values={current}
        onFieldChange={setField}
        feedback={null}
        title={stage?.title || 'Label the relationship graph'}
      />

      {requireScale && (
        <section
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            background: '#f8fbff',
            border: '1px solid #d5e1ef',
          }}
        >
          <h5 style={{ margin: '0 0 10px', color: '#174ea6', fontSize: 14 }}>
            Choose a reasonable scale
          </h5>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: 12,
            }}
          >
            <label style={{ fontWeight: 800, fontSize: 13 }}>
              X-axis count-by value
              <input
                disabled={disabled}
                type="number"
                min="0"
                step="any"
                value={current.xStep || ''}
                onChange={(event) => setField('xStep', event.target.value)}
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: 10,
                  border: '1px solid #bdc7d6',
                  borderRadius: 8,
                  boxSizing: 'border-box',
                  fontSize: 16,
                }}
              />
            </label>

            <label style={{ fontWeight: 800, fontSize: 13 }}>
              Y-axis count-by value
              <input
                disabled={disabled}
                type="number"
                min="0"
                step="any"
                value={current.yStep || ''}
                onChange={(event) => setField('yStep', event.target.value)}
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: 10,
                  border: '1px solid #bdc7d6',
                  borderRadius: 8,
                  boxSizing: 'border-box',
                  fontSize: 16,
                }}
              />
            </label>
          </div>
          <p style={{ margin: '9px 0 0', color: '#5f6368', fontSize: 12 }}>
            Your count-by values appear directly on the graph.
          </p>
        </section>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import GraphDisplay from './GraphDisplay';

const targetStyle = (status, active) => ({
  minHeight: '54px',
  borderRadius: '10px',
  border: `2px dashed ${status === 'correct' ? '#188038' : status === 'incorrect' ? '#d93025' : active ? '#1a73e8' : '#aebbcf'}`,
  background: status === 'incorrect' ? '#fff8f7' : active ? '#e8f0fe' : '#fff',
  padding: '9px 12px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: '3px',
  cursor: active ? 'pointer' : 'default',
  boxSizing: 'border-box',
});

const chipStyle = (selected) => ({
  border: `2px solid ${selected ? '#1a73e8' : '#bdc7d6'}`,
  background: selected ? '#e8f0fe' : '#fff',
  color: '#202124',
  borderRadius: '999px',
  padding: '8px 12px',
  fontWeight: 800,
  cursor: 'grab',
});

export default function GraphAxisEditor({
  graph,
  quantities,
  values,
  onFieldChange,
  feedback,
  title = 'Relationship graph',
}) {
  const [selectedCard, setSelectedCard] = useState(null);
  const quantityCards = useMemo(
    () => quantities.map((item) => ({ kind: 'quantity', value: item.label, label: item.label })),
    [quantities],
  );
  const unitCards = useMemo(() => {
    const units = [...new Set(quantities.map((item) => String(item.unit || '').trim()).filter(Boolean))];
    return units.map((unit) => ({ kind: 'unit', value: unit, label: unit }));
  }, [quantities]);
  const cards = [...quantityCards, ...unitCards];

  const gradeFor = (id) => feedback?.partGrades?.find((part) => part.id === id);
  const statusFor = (id) => {
    const grade = gradeFor(id);
    return grade ? (grade.isCorrect ? 'correct' : 'incorrect') : 'neutral';
  };

  const fieldForSlot = {
    xLabel: { kind: 'quantity', label: 'X-axis quantity', partId: 'x-label' },
    xUnit: { kind: 'unit', label: 'X-axis unit', partId: 'x-unit' },
    yLabel: { kind: 'quantity', label: 'Y-axis quantity', partId: 'y-label' },
    yUnit: { kind: 'unit', label: 'Y-axis unit', partId: 'y-unit' },
  };

  const assignCard = (field, card) => {
    const slot = fieldForSlot[field];
    if (!slot || !card || card.kind !== slot.kind) return;
    onFieldChange(field, card.value);
    setSelectedCard(null);
  };

  const readDragCard = (event) => {
    try {
      return JSON.parse(event.dataTransfer.getData('application/x-mathmaster-axis-card'));
    } catch {
      return null;
    }
  };

  const slot = (field) => {
    const definition = fieldForSlot[field];
    const active = selectedCard?.kind === definition.kind;
    return (
      <button
        type="button"
        onClick={() => active && assignCard(field, selectedCard)}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(event) => {
          event.preventDefault();
          assignCard(field, readDragCard(event));
        }}
        style={{ ...targetStyle(statusFor(definition.partId), active), width: '100%', textAlign: 'left' }}
      >
        <span style={{ fontSize: '12px', color: '#5f6368', fontWeight: 800 }}>{definition.label}</span>
        <span style={{ fontSize: '15px', color: values[field] ? '#174ea6' : '#7b8797', fontWeight: 800 }}>
          {values[field] || `Drop ${definition.kind} here`}
        </span>
      </button>
    );
  };

  return (
    <div style={{ marginTop: '20px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(135px, 185px) minmax(0, 1fr)',
          gridTemplateRows: 'auto auto',
          gap: '10px 12px',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'grid', gap: '10px' }}>
          {slot('yLabel')}
          {slot('yUnit')}
        </div>
        <GraphDisplay graph={graph} title={title} />
        <div />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {slot('xLabel')}
          {slot('xUnit')}
        </div>
      </div>

      <div style={{ marginTop: '14px', padding: '14px', borderRadius: '12px', background: '#f8fbff', border: '1px solid #d5e1ef' }}>
        <div style={{ fontWeight: 900, color: '#174ea6', marginBottom: '8px' }}>Drag labels and units to the graph</div>
        <div style={{ color: '#5f6368', fontSize: '13px', marginBottom: '10px' }}>
          Drag a card to the matching axis box. On touch devices, tap a card and then tap the destination.
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {cards.map((card) => {
            const key = `${card.kind}:${card.value}`;
            const selected = selectedCard?.kind === card.kind && selectedCard?.value === card.value;
            return (
              <button
                key={key}
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/x-mathmaster-axis-card', JSON.stringify(card));
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => setSelectedCard(selected ? null : card)}
                style={chipStyle(selected)}
              >
                {card.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

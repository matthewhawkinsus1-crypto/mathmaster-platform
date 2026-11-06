import { useMemo, useState } from 'react';
import GraphDisplay from './GraphDisplay';
import useMobileInteractionMode from './platform/mobile/useMobileInteractionMode.js';

const targetStyle = (status, active) => ({
  minHeight: '54px',
  borderRadius: '10px',
  border: `2px dashed ${status === 'correct' ? '#188038' : status === 'incorrect' ? '#d93025' : active ? '#1a73e8' : 'var(--mm-primary-border)'}`,
  background: status === 'incorrect' ? 'var(--mm-error-subtle)' : active ? 'var(--mm-primary-soft)' : 'var(--mm-surface)',
  padding: '9px 12px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: '3px',
  cursor: active ? 'pointer' : 'default',
  boxSizing: 'border-box',
});

// How a card gets to its axis box without a pointer (AX32). The cards and the boxes are
// buttons: Enter selects a card, and Enter on a box puts the selected card there. The
// boxes sit above the cards, so the keyboard goes back up to them with Shift+Tab. A line
// that names the click, the tap or the drag names this in the same sentence.
const AXIS_KEYS = 'Tab to a card and press Enter, then Shift+Tab back to the matching axis box and press Enter';

const chipStyle = (selected) => ({
  border: `2px solid ${selected ? '#1a73e8' : 'var(--mm-border)'}`,
  background: selected ? 'var(--mm-primary-soft)' : 'var(--mm-surface)',
  color: 'var(--mm-text-strong)',
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
  const mobileInteraction = useMobileInteractionMode();
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
        <span style={{ fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)', fontWeight: 800 }}>{definition.label}</span>
        <span style={{ fontSize: 'calc(15 * var(--mm-px))', color: values[field] ? 'var(--mm-primary-text)' : 'var(--mm-text-subtle)', fontWeight: 800 }}>
          {values[field] || `Place ${definition.kind} here`}
        </span>
      </button>
    );
  };

  return (
    <div style={{ marginTop: '20px' }}>
      <div
        className="mathmaster-axis-editor-grid"
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

      <div style={{ marginTop: '14px', padding: '14px', borderRadius: '12px', background: 'var(--mm-surface-tint)', border: '1px solid var(--mm-tint-border)' }}>
        <div style={{ fontWeight: 900, color: 'var(--mm-primary-text)', marginBottom: '8px' }}>Place the labels and units on the graph</div>
        <div style={{ color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))', marginBottom: '10px' }}>
          {mobileInteraction.isMobile ? `Tap a card, then tap the matching axis box, or ${AXIS_KEYS}.` : `Drag a card to the matching axis box. You can also click or tap a card and then the box, or ${AXIS_KEYS}.`}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {cards.map((card) => {
            const key = `${card.kind}:${card.value}`;
            const selected = selectedCard?.kind === card.kind && selectedCard?.value === card.value;
            return (
              <button
                key={key}
                type="button"
                // A selected card is the state "select a card, then the box" depends on, so it
                // is said to a screen reader, not only drawn as a border (AX32).
                aria-pressed={selected}
                draggable={!mobileInteraction.isMobile}
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

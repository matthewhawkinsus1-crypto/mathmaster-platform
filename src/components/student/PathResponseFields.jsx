import React, { useEffect, useRef } from 'react';
import MathText from '../common/MathText.jsx';

// The generic secure Path response.
//
// A Path question that does not need a full MathMaster tool still has to be a
// mathematical interaction rather than a database form. What was here before
// was one `<input type="text">` per response field, which is why 425 of the 515
// starter questions ended with the sentence "Type A, B, C, or D." — the bank
// was writing multiple choice into the prompt because the renderer had no way
// to show choices.
//
// So this file renders by INPUT PROFILE, and the profile is part of the
// question's public payload:
//
//   choice        real selectable cards, one per option, with the option text
//                 rendered as mathematics
//   number        a numeric field
//   expression    a symbolic answer, with the symbols a keyboard lacks
//   equation      the same, seeded for `=`
//   interval      interval notation, with ∞ ∪ [ ] on the pad
//   inequality    an inequality, with < ≤ > ≥ on the pad
//   text          short words, where words are genuinely the answer
//
// Nothing here decides correctness. Every profile collects a value and hands it
// up; the verdict comes back from the server. And nothing here simplifies,
// rearranges or completes what a student typed: the pad inserts a character the
// student chose, which is a keyboard, not a solver.

const FIELD_BASE = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 13px',
  border: '2px solid #c7ccd1',
  borderRadius: 9,
  fontSize: 18,
  lineHeight: 1.35,
  background: '#fff',
  color: '#202124',
};

const LABEL = {
  display: 'block',
  fontSize: 13,
  fontWeight: 800,
  color: '#3c4043',
  marginBottom: 5,
};

const HINT = {
  display: 'block',
  fontSize: 12,
  color: '#5f6368',
  marginTop: 5,
  lineHeight: 1.5,
};

const PAD_BUTTON = {
  minHeight: 34,
  minWidth: 34,
  padding: '0 9px',
  border: '1px solid #c5d5ef',
  borderRadius: 7,
  background: '#f4f8ff',
  color: '#174ea6',
  fontSize: 15,
  fontWeight: 800,
  cursor: 'pointer',
};

// Symbols a Chromebook keyboard cannot produce. Inserting one is a typing aid,
// not a mathematical decision: the student chose the symbol.
const SYMBOL_PADS = {
  interval: ['(', ')', '[', ']', '∞', '-∞', '∪', ','],
  inequality: ['<', '≤', '>', '≥', '≠'],
  expression: ['^', '√', '/', 'π', '±'],
  equation: ['=', '^', '/', '√'],
  set: ['{', '}', ',', '|', '∈'],
};

const normalizeProfile = (profile) => {
  const value = String(profile || 'text').trim();
  if (['choice', 'multipleChoice', 'multiple-choice', 'select'].includes(value)) return 'choice';
  if (['number', 'numeric', 'integer', 'decimal'].includes(value)) return 'number';
  if (['expression', 'symbolic', 'math'].includes(value)) return 'expression';
  if (['equation', 'formula'].includes(value)) return 'equation';
  if (['interval', 'intervalNotation'].includes(value)) return 'interval';
  if (['inequality'].includes(value)) return 'inequality';
  if (['set', 'setNotation'].includes(value)) return 'set';
  if (['orderedPair', 'ordered-pair', 'point'].includes(value)) return 'orderedPair';
  return 'text';
};

const DEFAULT_HINT = {
  interval: 'Write your answer in interval notation, for example [-3, 5).',
  inequality: 'Write your answer as an inequality, for example x ≥ 4.',
  orderedPair: 'Write your answer as an ordered pair, for example (2, -5).',
  expression: 'Write an expression. You do not need to simplify further than the question asks.',
  equation: 'Write a full equation.',
};

function ChoiceGroup({ field, choices, value, onChange, disabled }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend style={{ ...LABEL, padding: 0 }}><MathText>{field.label || 'Choose one'}</MathText></legend>
      <div role="radiogroup" aria-label={field.label || 'Answer choices'} style={{ display: 'grid', gap: 9 }}>
        {choices.map((choice, index) => {
          const selected = String(value ?? '') === String(choice.id);
          return (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(choice.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                minHeight: 52,
                padding: '11px 14px',
                textAlign: 'left',
                border: `2px solid ${selected ? '#1a73e8' : '#d3d8de'}`,
                borderRadius: 11,
                background: selected ? '#e8f0fe' : '#fff',
                color: '#202124',
                font: 'inherit',
                fontSize: 16,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  flex: '0 0 auto',
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  border: `2px solid ${selected ? '#1a73e8' : '#b9c0c9'}`,
                  background: selected ? '#1a73e8' : '#fff',
                  color: '#fff',
                  fontWeight: 900,
                  fontSize: 13,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {String.fromCharCode(65 + index)}
              </span>
              <MathText style={{ flex: 1, minWidth: 0 }}>{choice.label}</MathText>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function TypedField({ field, profile, value, onChange, onSubmit, disabled, autoFocus }) {
  const inputRef = useRef(null);
  const pad = SYMBOL_PADS[profile] || null;
  const hint = field.responseHint || DEFAULT_HINT[profile] || null;

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const insert = (symbol) => {
    const input = inputRef.current;
    const current = String(value ?? '');
    if (!input) {
      onChange(current + symbol);
      return;
    }
    const start = input.selectionStart ?? current.length;
    const end = input.selectionEnd ?? current.length;
    const next = current.slice(0, start) + symbol + current.slice(end);
    onChange(next);
    // Put the caret after what the student just inserted, so the next character
    // lands where they expect rather than at the end of the box.
    requestAnimationFrame(() => {
      input.focus();
      const caret = start + symbol.length;
      input.setSelectionRange(caret, caret);
    });
  };

  return (
    <div>
      {/* The bank names its fields mathematically — "$x$-intercept",
          "Boundary of $y \ge 2x + 1$" — so a plain-text label showed the
          student the markup instead of the mathematics. */}
      <label style={LABEL} htmlFor={`path-field-${field.id}`}>
        <MathText>{field.label || 'Answer'}</MathText>{field.unit ? ` (${field.unit})` : ''}
      </label>
      <input
        id={`path-field-${field.id}`}
        ref={inputRef}
        type={profile === 'number' ? 'text' : 'text'}
        inputMode={profile === 'number' ? 'decimal' : 'text'}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={field.placeholder || ''}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          // Enter checks the answer. A student who has typed a number and
          // pressed Enter has finished; making them find the button is friction
          // with no purpose.
          if (event.key === 'Enter') {
            event.preventDefault();
            onSubmit?.();
          }
        }}
        style={FIELD_BASE}
      />
      {pad && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {pad.map((symbol) => (
            <button
              key={symbol}
              type="button"
              disabled={disabled}
              aria-label={`Insert ${symbol}`}
              onClick={() => insert(symbol)}
              style={PAD_BUTTON}
            >
              {symbol}
            </button>
          ))}
        </div>
      )}
      {hint && <MathText style={HINT}>{hint}</MathText>}
    </div>
  );
}

/**
 * @param fields          sanitized responseFields from the server
 * @param questionChoices question-level choices (a single-choice question)
 * @param values          { [fieldId]: string }
 * @param onChangeField   (fieldId, value) => void
 * @param onSubmit        the primary Check action, for Enter
 */
export const PathResponseFields = ({
  fields = [],
  questionChoices = [],
  values = {},
  onChangeField,
  onSubmit,
  disabled = false,
}) => {
  const resolved = fields.length ? fields : [{ id: 'answer', label: 'Answer', inputProfile: 'text' }];
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {resolved.map((field, index) => {
        const profile = normalizeProfile(field.inputProfile);
        const choices = field.choices?.length ? field.choices : questionChoices;
        if (profile === 'choice' && choices.length) {
          return (
            <ChoiceGroup
              key={field.id}
              field={field}
              choices={choices}
              value={values[field.id]}
              onChange={(next) => onChangeField(field.id, next)}
              disabled={disabled}
            />
          );
        }
        return (
          <TypedField
            key={field.id}
            field={field}
            profile={profile}
            value={values[field.id]}
            onChange={(next) => onChangeField(field.id, next)}
            onSubmit={onSubmit}
            disabled={disabled}
            autoFocus={index === 0}
          />
        );
      })}
    </div>
  );
};

/** Which fields still have nothing in them. Used to enable the Check button. */
export const pathResponseComplete = (fields = [], values = {}) => {
  const resolved = fields.length ? fields : [{ id: 'answer' }];
  return resolved.every((field) => String(values[field.id] ?? '').trim() !== '');
};

export { normalizeProfile as normalizePathInputProfile };

export default PathResponseFields;

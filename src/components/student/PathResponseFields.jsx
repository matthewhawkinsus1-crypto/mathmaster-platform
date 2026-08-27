import React, { useEffect, useRef } from 'react';
import MathText from '../common/MathText.jsx';
import MathInput from '../../MathInput.jsx';

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
//   text          short words, where words are genuinely the answer, in a
//                 plain box where Enter checks the answer
//   everything    the platform's own math editor, with the keypad the question
//     else        needs — ∞ ∪ [ ] for an interval, < ≤ > ≥ for an inequality
//
// EVERY MATHEMATICAL ANSWER IS TYPED IN A MATH EDITOR. It used to be a plain
// text box with a strip of characters to paste in, which meant a student
// writing three quarters saw `3/4` — a side slash, on a mathematics platform —
// and `x^2` stayed `x^2`. Every MathMaster tool already used MathInput; the
// Path's generic answers were the one place that did not, and so the one place
// mathematics did not look like mathematics.
//
// That changes what is submitted, from plain text to LaTeX. See
// tests/browser/answerRoundTrip.mjs, which types every seed answer key into a
// real editor and grades what comes back with the real server grader — the
// evidence the graders accept it rather than the assumption.
//
// Nothing here decides correctness. Every profile collects a value and hands it
// up; the verdict comes back from the server. And nothing here simplifies,
// rearranges or completes what a student typed: the keypad inserts a symbol the
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

// Which MathInput keypad each answer profile gets, so the symbols on offer are
// the ones the question actually needs.
const TOOL_PROFILE = {
  interval: 'interval',
  inequality: 'inequality',
  set: 'set',
  equation: 'equation',
  expression: 'expression',
  orderedPair: 'expression',
  number: 'expression',
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

/** Words are genuinely the answer: a plain box, and Enter checks it. */
function WordField({ field, value, onChange, onSubmit, disabled, autoFocus }) {
  const inputRef = useRef(null);
  const hint = field.responseHint || null;

  useEffect(() => {
    if (!autoFocus || !inputRef.current) return;
    try {
      inputRef.current.focus({ preventScroll: true });
    } catch {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  return (
    <div>
      <label style={LABEL} htmlFor={`path-field-${field.id}`}>
        <MathText>{field.label || 'Answer'}</MathText>{field.unit ? ` (${field.unit})` : ''}
      </label>
      <input
        id={`path-field-${field.id}`}
        ref={inputRef}
        type="text"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={field.placeholder || ''}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onSubmit?.();
          }
        }}
        style={FIELD_BASE}
      />
      {hint && <MathText style={HINT}>{hint}</MathText>}
    </div>
  );
}

/**
 * A mathematical answer, in the platform's own math editor.
 *
 * WHAT THIS REPLACED. A plain `<input type="text">` with a strip of characters
 * to paste into it. A student writing three quarters saw `3/4` — a side slash,
 * in a sentence, on a mathematics platform — and `x^2` stayed `x^2`. Every
 * MathMaster tool already uses MathInput; only the Path's generic answers did
 * not, so the Path was the one place where mathematics did not look like
 * mathematics.
 *
 * IT CHANGES WHAT IS SUBMITTED, from plain text to LaTeX, and that is the risk.
 * tests/browser/answerRoundTrip.mjs types all 351 seed answer keys into a real
 * editor and grades what comes back with the real server grader — the evidence
 * that the graders accept it, rather than the assumption.
 *
 * Enter checks here because this renderer has one unambiguous primary action.
 * Multi-step algebra editors do not pass an onSubmit prop to MathInput.
 */
function MathField({ field, profile, value, onChange, onSubmit, disabled, autoFocus }) {
  const hint = field.responseHint || DEFAULT_HINT[profile] || null;
  return (
    <div>
      <label style={LABEL}>
        <MathText>{field.label || 'Answer'}</MathText>{field.unit ? ` (${field.unit})` : ''}
      </label>
      <MathInput
        value={value ?? ''}
        onChange={onChange}
        toolProfile={TOOL_PROFILE[profile] || 'expression'}
        answerFormat={field.answerFormat || field.inputContract?.format || field.notation || field.inputMode || (profile === 'orderedPair' ? 'orderedPair' : profile)}
        requiredSymbols={field.requiredSymbols || field.inputContract?.requiredSymbols || []}
        placeholder={field.placeholder || ''}
        ariaLabel={field.label || 'Answer'}
        focusSignal={autoFocus ? 1 : 0}
        onSubmit={disabled ? null : onSubmit}
        showToolsInitially
        maxWidth={640}
        inputStatus={disabled ? 'neutral' : 'neutral'}
      />
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
        if (profile === 'text') {
          return (
            <WordField
              key={field.id}
              field={field}
              value={values[field.id]}
              onChange={(next) => onChangeField(field.id, next)}
              onSubmit={onSubmit}
              disabled={disabled}
              autoFocus={index === 0}
            />
          );
        }
        return (
          <MathField
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

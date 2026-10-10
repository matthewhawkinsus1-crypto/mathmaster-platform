import React, { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import MathInput from '../../MathInput.jsx';
import MathText from '../common/MathText.jsx';
import {
  READ_ONLY_EDITOR_ACTIONS, SECURE_ANSWER_EDITORS, SECURE_EDITOR_HELD_EVENTS, readOnlyEditorAction, secureAnswerEntryFor,
} from '../../platform/assessment/secureAnswerEntry.js';
import { speechTextFor } from '../../platform/language/speechText.js';
import { mathFieldKeyboardSink } from '../../platform/math/mathLiveCompat.js';

/*
 * ONE TYPED ANSWER ON A SECURE ITEM, IN THE EDITOR STUDENTS USE EVERYWHERE ELSE.
 *
 * My Math Path and every MathMaster tool collect mathematics in MathInput: a
 * typed `/` builds a stacked fraction, the keypad has the symbols the answer
 * needs, and a phone gets that keypad instead of its letter keyboard. A secure
 * Test collected the same answers in a bare text box. This field gives the
 * secure item the same editor — for the input profiles where the server's
 * grader is shown to read what the editor sends (secureAnswerEntry.js says
 * which: number, set and interval; and why an ordered pair, an inequality, an
 * expression and an equation stay typed text).
 *
 * THE VALUE IS WHAT THE SERVER GRADES. `onChange` receives exactly what the
 * editor holds — LaTeX from the math editor, the typed characters from a text
 * box — and nothing here simplifies, completes, rewrites or checks it. The
 * verdict is the server's, after release.
 *
 * READ-ONLY KEEPS THE EDITOR MOUNTED. While an answer is being recorded the
 * field must not change, but swapping the editor for a picture of the answer
 * would drop the student's place and flash the layout. The math-field itself
 * is made read-only, every key, paste and keypad press that could still reach
 * it is swallowed before MathInput sees it (secureAnswerEntry.js
 * readOnlyEditorAction says which), and nothing it emits is passed up.
 *
 * The caller renders the label (the secure item's fieldset legend);
 * `ariaLabel` names the box for a screen reader, and the line under the box
 * about how to type reaches the screen reader too: as the text box's
 * description, and inside the name of the element in the math field a screen
 * reader actually lands on (MathLive's keyboard sink, which MathLive leaves
 * unnamed).
 */

const TEXT_FIELD = {
  display: 'block',
  width: '100%',
  minHeight: 48,
  boxSizing: 'border-box',
  padding: '10px 12px',
  border: '2px solid var(--mm-control-border, var(--mm-border))',
  borderRadius: 8,
  fontSize: 17,
  background: 'var(--mm-surface)',
  color: 'var(--mm-text-strong)',
};

const HINT = {
  display: 'block',
  margin: '6px 0 0',
  fontSize: 12.5,
  lineHeight: 1.45,
  color: 'var(--mm-text-muted)',
};

function MathEditor({ entry, value, emit, readOnly, readOnlyRef, autoFocus, label, onEnter }) {
  const wrapperRef = useRef(null);
  // One function for MathInput's Enter, whatever the caller passes each
  // render: MathInput rebinds its key handling when that prop changes.
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;
  const enter = useCallback(() => onEnterRef.current?.(), []);

  // The math-field is MathInput's; reach it through the DOM rather than
  // changing MathInput, which every tool shares.
  useEffect(() => {
    const mathField = wrapperRef.current?.querySelector('math-field');
    if (!mathField) return;
    mathField.readOnly = Boolean(readOnly);
    if (readOnly) mathField.setAttribute('aria-readonly', 'true');
    else mathField.removeAttribute('aria-readonly');
  }, [readOnly]);

  // MathLive takes focus in its keyboard sink (found through the MathLive
  // adapter) and never names it, whatever the host's aria-label says:
  // a screen reader landing in the field heard an unnamed text box. The sink
  // gets the field's name, typing hint included — once the element has
  // upgraded, and again on focus, in case MathLive replaced it.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;
    let cancelled = false;
    const nameSink = () => {
      const sink = mathFieldKeyboardSink(wrapper.querySelector('math-field'));
      if (sink && sink.getAttribute('aria-label') !== label) sink.setAttribute('aria-label', label);
      return Boolean(sink);
    };
    if (!nameSink()) {
      window.customElements?.whenDefined?.('math-field').then(() => {
        if (!cancelled) window.requestAnimationFrame?.(() => { if (!cancelled) nameSink(); });
      });
    }
    wrapper.addEventListener('focusin', nameSink);
    return () => {
      cancelled = true;
      wrapper.removeEventListener('focusin', nameSink);
    };
  }, [label]);

  // Capture listeners on the wrapper run before anything inside it — MathInput's
  // own key handling on the field and its keypad's clicks — so an event held
  // here never reaches the field while the answer is held.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;
    const holdWhileReadOnly = (event) => {
      const action = readOnlyEditorAction(event, { readOnly: readOnlyRef.current, wrapper });
      if (action === READ_ONLY_EDITOR_ACTIONS.PASS) return;
      event.preventDefault();
      if (action === READ_ONLY_EDITOR_ACTIONS.HOLD) event.stopPropagation();
    };
    SECURE_EDITOR_HELD_EVENTS.forEach((type) => wrapper.addEventListener(type, holdWhileReadOnly, { capture: true }));
    return () => SECURE_EDITOR_HELD_EVENTS.forEach((type) => wrapper.removeEventListener(type, holdWhileReadOnly, { capture: true }));
  }, [readOnlyRef]);

  return (
    <div
      ref={wrapperRef}
      data-secure-answer-editor="math"
      data-secure-answer-profile={entry.profile}
      data-readonly={readOnly ? 'true' : 'false'}
    >
      <MathInput
        value={value}
        onChange={emit}
        toolProfile={entry.toolProfile}
        answerFormat={entry.answerFormat}
        requiredSymbols={entry.requiredSymbols}
        ariaLabel={label}
        focusSignal={autoFocus ? 1 : 0}
        onSubmit={readOnly || !onEnter ? null : enter}
        showToolsInitially
        maxWidth={640}
      />
    </div>
  );
}

function TextEditor({ entry, value, emit, readOnly, autoFocus, label, hintId, placeholder, onEnter }) {
  const inputRef = useRef(null);
  useEffect(() => {
    if (!autoFocus || !inputRef.current) return;
    try {
      inputRef.current.focus({ preventScroll: true });
    } catch {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  return (
    <input
      ref={inputRef}
      data-secure-answer-editor="text"
      data-secure-answer-profile={entry.profile}
      type="text"
      inputMode={entry.inputMode}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      value={value}
      readOnly={readOnly}
      aria-readonly={readOnly ? 'true' : undefined}
      aria-label={label}
      aria-describedby={hintId || undefined}
      placeholder={placeholder}
      onChange={(event) => emit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || !onEnter || readOnly) return;
        event.preventDefault();
        onEnter();
      }}
      style={{ ...TEXT_FIELD, background: readOnly ? 'var(--mm-surface-sunken)' : TEXT_FIELD.background }}
    />
  );
}

/*
 * The math field's accessible name, with the typing hint in it. An id
 * reference (aria-describedby) cannot cross into MathLive's shadow root, where
 * the element a screen reader lands on lives, so the hint travels in the name
 * MathEditor gives that element. A server hint may carry $…$ mathematics,
 * said in words.
 */
const nameWithHint = (label, hint, fromServer) => {
  const spoken = fromServer ? speechTextFor(hint) : hint;
  return spoken ? `${label.replace(/[\s.:]+$/, '')}. ${spoken}` : label;
};

/**
 * @param field     a sanitized response field from the server
 * @param value     the saved answer (what the server will grade)
 * @param onChange  (value) => void — the editor's exact value
 * @param readOnly  hold the answer still (recording, closed item)
 * @param autoFocus focus the box when it mounts
 * @param ariaLabel the box's accessible name (defaults to the field label)
 * @param onEnter   optional: what Enter does in the box (nothing by default
 *                  in the math editor; a text box inside a form submits it)
 */
export default function SecureMathAnswerField({
  field,
  value = '',
  onChange,
  readOnly = false,
  autoFocus = false,
  ariaLabel = '',
  onEnter = null,
}) {
  const entry = useMemo(() => secureAnswerEntryFor(field), [field]);
  const hintId = `secure-answer-hint-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const label = String(ariaLabel || field?.label || 'Answer');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const emit = useCallback((next) => {
    if (readOnlyRef.current) return;
    onChangeRef.current?.(String(next ?? ''));
  }, []);
  const text = value == null ? '' : String(value);
  const serverHint = Boolean(String(field?.responseHint ?? '').trim());

  return (
    <div className="mathmaster-secure-answer-field" style={{ minWidth: 0 }}>
      {entry.editor === SECURE_ANSWER_EDITORS.MATH ? (
        <MathEditor
          entry={entry}
          value={text}
          emit={emit}
          readOnly={readOnly}
          readOnlyRef={readOnlyRef}
          autoFocus={autoFocus}
          label={nameWithHint(label, entry.hint, serverHint)}
          onEnter={onEnter}
        />
      ) : (
        <TextEditor
          entry={entry}
          value={text}
          emit={emit}
          readOnly={readOnly}
          autoFocus={autoFocus}
          label={label}
          hintId={entry.hint ? hintId : ''}
          placeholder={String(field?.placeholder || '')}
          onEnter={onEnter}
        />
      )}
      {/* The server's own hint may carry $…$ mathematics; the built-in ones
          are plain words. */}
      {entry.hint && (
        <p id={hintId} style={HINT}>
          {serverHint ? <MathText>{entry.hint}</MathText> : entry.hint}
        </p>
      )}
    </div>
  );
}

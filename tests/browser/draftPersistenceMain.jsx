/*
 * THE STUDENT'S OWN NAVIGATION, IN A REAL BROWSER.
 *
 * QuestionEngine mounted the way App.jsx mounts it — same `key` shape, same
 * `draftKey` builder — because the bug this certifies IS the remount. A harness
 * that kept one instance alive between questions would pass while production
 * failed, which is precisely how the gap survived twenty tools.
 *
 * Nothing here is a mock of the draft layer: the page writes to the real
 * localStorage through the real `writeQuestionDraft`, and a reload re-evaluates
 * every module, so only what is genuinely durable can come back.
 *
 * HOW TO RUN: npm run test:draft-persistence
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import { DRAFT_SCENES } from './draftPersistenceScenes.mjs';
import '../../src/index.css';
import '../../src/App.css';

const STUDENT = 'draft-cert-student';
const ASSIGNMENT = 'draft-cert-assignment';

const listeners = new Set();
let currentIndex = 0;
let currentVariant = 0;
let currentSessionMode = 'graded';
const notify = () => listeners.forEach((listen) => listen({
  index: currentIndex, variant: currentVariant, sessionMode: currentSessionMode,
}));

const workspaceRoot = () => document.querySelector('[data-draft-scene]');

/**
 * What the student can see of their own mathematics, plus what is actually
 * stored for it. Both, deliberately: the stored record proves the work is
 * durable, and the controls prove it was restored back INTO the workspace. A
 * check on either alone can pass while the student still sees an empty box.
 */
const snapshot = () => {
  const root = workspaceRoot();
  if (!root) return { controls: [], svgText: [], readouts: [], drafts: {} };
  const controls = [...root.querySelectorAll('input, select, textarea, math-field')]
    .filter((element) => !element.disabled && element.type !== 'button' && element.type !== 'submit')
    .map((element, order) => ({
      order,
      name: element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.name || element.id || element.tagName.toLowerCase(),
      value: element.tagName.toLowerCase() === 'math-field'
        ? String(element.value ?? '')
        : element.type === 'checkbox' || element.type === 'radio'
          ? String(element.checked)
          : String(element.value ?? ''),
    }));
  /*
   * Point labels, term markers and plotted coordinates are drawn as SVG text,
   * so a construction that failed to restore loses them.
   *
   * Cursor guides are skipped. A crosshair, a snap ghost and a hover readout
   * are drawn in `pointer-events: none` overlays — they follow the mouse, they
   * are not the student's work, and a restored page has no mouse on it.
   */
  const svgText = [...root.querySelectorAll('svg text')]
    .filter((node) => !node.closest('[pointer-events="none"]'))
    .map((node) => (node.textContent || '').trim())
    .filter(Boolean);
  /*
   * A graph tool reports a placement on the control that owns it — the point
   * task button reads "Not placed" or "(0, 3)". That readout is the strongest
   * statement the DOM makes about a restored construction, and it is not an
   * input, so it would otherwise go unchecked.
   */
  const readouts = [...root.querySelectorAll('button')]
    .map((node) => (node.textContent || '').trim())
    // Only the labels that state a mathematical result. A keypad key and an
    // open-drawer toggle are chrome, and whether a drawer happens to be open
    // says nothing about whether the student's work came back.
    .filter((text) => /\(\s*-?\d/.test(text) || /placed/i.test(text));
  const drafts = {};
  const prefix = buildQuestionDraftKey({
    studentId: STUDENT, assignmentId: ASSIGNMENT,
    questionIndex: currentIndex, variantIndex: currentVariant, sessionMode: currentSessionMode,
  });
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(prefix)) drafts[key.slice(prefix.length)] = JSON.parse(window.localStorage.getItem(key)).value;
  }
  return { controls, svgText, readouts, drafts };
};

function Harness() {
  const [position, setPosition] = useState({ index: currentIndex, variant: currentVariant, sessionMode: currentSessionMode });
  useEffect(() => { listeners.add(setPosition); return () => listeners.delete(setPosition); }, []);

  const scene = DRAFT_SCENES[position.index] || DRAFT_SCENES[0];
  const draftKey = useMemo(() => buildQuestionDraftKey({
    studentId: STUDENT,
    assignmentId: ASSIGNMENT,
    questionIndex: position.index,
    variantIndex: position.variant,
    sessionMode: position.sessionMode,
  }), [position.index, position.variant, position.sessionMode]);

  /*
   * ATTEMPTS THE HARNESS CAN SEE.
   *
   * A draft must never become one. The driver reads this list after every
   * restore and fails if restoring a workspace produced a grade.
   */
  const grade = useCallback((isCorrect, details) => {
    window.__mmDraftAttempts = [...(window.__mmDraftAttempts || []), { sceneId: scene.id, isCorrect, details }];
    return null;
  }, [scene.id]);

  return (
    <div
      data-draft-scene={scene.id}
      data-draft-key={draftKey}
      data-question-index={position.index}
      data-variant-index={position.variant}
    >
      {/* The assignment chrome a student navigates with. Real markup, so the
          harness measures the real screen. */}
      <nav className="mathmaster-assignment-unified-nav" aria-label="Assignment navigation">
        <div className="mathmaster-question-number-strip" aria-label="Questions">
          {DRAFT_SCENES.map((entry, index) => (
            <button key={entry.id} type="button" onClick={() => { currentIndex = index; notify(); }}>{index + 1}</button>
          ))}
        </div>
      </nav>
      <QuestionEngine
        /* Exactly App.jsx's key: assignment, question, variant, lifecycle. A
           question change remounts the workspace, which is the whole point. */
        key={`${ASSIGNMENT}-${position.index}-${position.variant}-open`}
        question={scene.question}
        questionRecord={null}
        generationKey={`${scene.id}-${position.variant}`}
        onGrade={grade}
        onStepGrade={() => {}}
        studentProfile={{}}
        activityRole="classwork"
        maximumAttempts={3}
        draftKey={draftKey}
        assignmentId={ASSIGNMENT}
        executionScope="student"
      />
    </div>
  );
}

window.__mmDraft = {
  scenes: DRAFT_SCENES.map(({ id, label, family, mixed }) => ({ id, label, family, mixed: Boolean(mixed) })),
  go: (index) => { currentIndex = Number(index) || 0; notify(); return currentIndex; },
  /** Ask for a replacement question: same slot, next variant. */
  replace: () => { currentVariant += 1; notify(); return currentVariant; },
  /** Back to the original variant, so a replacement check does not hide the
      work every other scene left behind. */
  variant: (value) => { currentVariant = Number(value) || 0; notify(); return currentVariant; },
  practiceMode: (on) => { currentSessionMode = on ? 'post-deadline-practice' : 'graded'; notify(); return currentSessionMode; },
  position: () => ({ index: currentIndex, variant: currentVariant, sessionMode: currentSessionMode }),
  snapshot,
  attempts: () => window.__mmDraftAttempts || [],
  resetAttempts: () => { window.__mmDraftAttempts = []; return true; },
  clearStorage: () => { window.localStorage.clear(); return true; },
};

createRoot(document.getElementById('root')).render(<Harness />);

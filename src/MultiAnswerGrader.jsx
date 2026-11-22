import { Suspense, memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import MathInput from './MathInput';
import MathDisplay from './MathDisplay';
import QuestionPrompt from './QuestionPrompt';
import QuestionVisual from './QuestionVisual';
import './MultiAnswerGrader.css';
import GraphDisplay from './GraphDisplay';
import PathQuestionStimulus from './components/student/PathQuestionStimulus.jsx';
import LinearRegressionPanel from './components/assessment/LinearRegressionPanel.jsx';
import { answerCandidatesForField, isChoiceAnswerField, looksLikeFiniteSetNotation, withoutStaleSetStamp } from './answerUtils';
import { gradeMultiAnswerResponse } from '../functions/shared/ordinaryResponseGrading.mjs';
// Registers the factoredForm / simplestRadicalForm comparators the shared
// field grader reads (kept out of the first load: answerUtils.mjs).
import '../functions/shared/formSpecificFieldGrading.mjs';
import { choiceShowsMixedMath, labelHasDelimitedMath, resolveLabelFormat } from './labelFormat';
import { fieldKeyValues, neededAnswerSymbols } from './platform/interaction/answerEntryTools.js';
import { describeAnswerFormat, describeBoxPlaceholder } from './platform/interaction/answerFormatHints.js';
import { keypadProfileForResponseField } from './platform/interaction/interactionContract.js';
import { declaredKeypadProfile, withheldVerdictKeys } from './platform/interaction/withheldVerdictKeypad.js';
import { formatProblemForResponse } from './platform/interaction/answerShapeGuard.js';
import { typedEntryNotice } from '../functions/shared/typedEntryGuard.mjs';
import { withFollowThroughLabels } from '../functions/shared/followThroughNames.mjs';
import { useFollowThroughRules } from './platform/interaction/useFollowThroughRules.js';
import TypedEntryNotice from './components/common/TypedEntryNotice.jsx';
import useUndoHistory from './useUndoHistory';
import { draftNormalizer, draftShape } from './tools/shared/toolDraftShape.js';
import { choiceAccessibleLabel, choiceFieldAsksDimensions, choiceOptionsForField, choiceSeed, stableShuffleChoices } from './platform/interaction/choiceOptions.js';
import { normalizePlainMathTypography, toPlainMath } from './components/common/mathSegments.js';
import { MathText } from './components/common/MathText.jsx';
import { ChoiceMark, useChoiceGroup } from './platform/interaction/choiceGroup.js';
import GradedEntryMark, { gradedEntryInputProps } from './components/common/GradedEntryMark.jsx';
import { isSingleLineAnswerTarget } from './platform/interaction/answerEntryUx.js';
import { SR_ONLY_STYLE } from './ui/srOnly.js';
import { checkpointOf, checkpointWorkKey } from './platform/supports/showTheStep/checkpointShape.js';

// SHOW THE STEP (SP-4). A part with a `checkpoint` asks for one step in a
// tool before its answer box opens: points picked on the plane, moves in Step
// Algebra, a factor pair, a table's rows. The host hands the step in
// (`StepComponent`: the question engine's lazy ShowTheStep, which loads with
// its tools only for such a part). A host that hands none in draws the part
// as its answer box, as before. The student's step is kept as one line of
// text beside the part's answer (`<id>::step`), so the draft, Undo and the
// submitted response carry it; the graders read only the parts a question
// authors, so it changes no verdict and no score.
const NO_STEPS = Object.freeze({});

const TEXTUAL_MATH_SIGNAL = /[=<>≤≥≠+*/^()[\]{}\\∞π√∪∩]/;

// ≤ for <= and the like. Its x⁴ for x^4 is drawn as a power: MathDisplay
// rewrites every Unicode superscript (mathDisplayFormat.js), where this once
// rewrote only ⁻¹, ² and ³ and the rest showed as carets.
const normalizeMathDisplayValue = (value) => normalizePlainMathTypography(value);

// A field's name for a screen reader: the label's mathematics as characters,
// never its dollar signs.
const accessibleFieldLabel = (field) => {
  const text = field.label || field.id;
  return labelHasDelimitedMath(text) ? toPlainMath(text) : text;
};

// A field's label as the student reads it, on its box and on its answered line.
const fieldLabelContent = (field) => {
  const text = field.label || field.id;
  // "$x$-intercept", "Slope $m$ =": words and mathematics,
  // set the way MathText sets every other field label.
  if (!field.labelLatex && !field.labelFormat && labelHasDelimitedMath(text)) return <MathText>{text}</MathText>;
  const format = resolveLabelFormat(text, { latexFlag: field.labelLatex, explicitFormat: field.labelFormat });
  // An English label goes through the math typesetter as
  // juxtaposed variables — "Discrete or continuous?" comes out
  // as "Discrete ∨ continuous?" — so it stays plain text.
  return format ? <MathDisplay value={normalizeMathDisplayValue(text)} format={format} inline /> : normalizePlainMathTypography(text);
};

/*
 * PART BY PART (docs/platform/SHOWING_THE_PROCESS.md, section 3).
 *
 * One photo of a screen that holds every box answers all of it. Where the host
 * asks for it (`partByPart`: the student answering a classroom item or a
 * secure Test item, never a preview, a review, Path or Live Challenge, and
 * never for a student with See every part at once), a question of two or more
 * parts opens one at a time:
 *   - the open part is the first one with no answer when the question opens,
 *     so a reload comes back to it from the answers' own draft (no new saved
 *     state); typing does not move on, Next part does;
 *   - a part before it that has an answer is one line — its label, the
 *     student's answer and Change, which opens it again;
 *   - a part after it is not drawn;
 *   - once every part has an answer, Review all parts lists them all before
 *     the engine's own Submit, which is unchanged;
 *   - after a graded miss the parts marked wrong are open, and stay open while
 *     the student fixes them, and the right ones stay lines.
 * Next part and Change use no attempt and tell the engine nothing: what it is
 * told (onStateChange), the draft and Undo are the answers, exactly as before.
 */
const PART_LINE = {
  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', padding: '10px 14px',
  borderRadius: '10px', background: 'var(--mm-surface-sunken)', color: 'var(--mm-text)', minWidth: 0,
};
const partButton = (enabled, quiet = false) => ({
  minHeight: '44px', padding: quiet ? '6px 14px' : '8px 18px', borderRadius: '8px',
  border: `2px solid ${enabled ? 'var(--mm-primary)' : 'var(--mm-border)'}`,
  background: enabled ? 'var(--mm-surface)' : 'var(--mm-surface-control-strong)',
  color: enabled ? 'var(--mm-primary-text)' : 'var(--mm-disabled-text)',
  fontSize: 'calc(15 * var(--mm-px))', fontWeight: 800, cursor: enabled ? 'pointer' : 'not-allowed',
});

const renderChoiceText = (value, { dimensions = false } = {}) => {
  const text = String(value ?? '');
  // Words with mathematics in them, or LaTeX the word test leaves as words
  // ("$y\ge 2x+1$ and $y\le -x+3$", "$\frac{1}{2}$"): the words as words and
  // each span typeset, as a field label is. As plain text the student saw the
  // dollar signs and the LaTeX, on 466 options of the CCMR bank.
  if (choiceShowsMixedMath(text)) return <MathText>{text}</MathText>;
  const format = resolveLabelFormat(text);
  return format
    // Named by its own text: every choice was announced "Mathematical
    // expression", so a screen reader could not tell 11 from 5.
    ? <MathDisplay value={normalizeMathDisplayValue(text)} format={format} inline ariaLabel={choiceAccessibleLabel(text, { dimensions })} />
    : normalizePlainMathTypography(text);
};

// A choice field: one radio group (choiceGroup.js) — one tab stop, arrows
// move and select, and the chosen option carries a ✓ as well as its colour.
function ChoiceFieldOptions({ label, options, value, grade, markId, onSelect, dimensions = false }) {
  const raws = options.map((option) => String(option));
  const optionProps = useChoiceGroup({ ids: raws, value, onSelect });
  return (
    <div role="radiogroup" aria-label={label} {...gradedEntryInputProps(grade, markId)} style={{ display: 'grid', gap: '8px' }}>
      {raws.map((raw, index) => {
        const selected = value === raw;
        return (
          <button
            type="button"
            key={raw}
            {...optionProps(index)}
            aria-label={choiceAccessibleLabel(raw, { dimensions })}
            onClick={() => onSelect(raw)}
            style={{
              display: 'flex',
              alignItems: 'center',
              minHeight: '46px',
              padding: '10px 12px',
              borderRadius: '8px',
              border: `2px solid ${selected ? '#1a73e8' : grade ? (grade.isCorrect ? '#188038' : '#d93025') : 'var(--mm-border)'}`,
              background: selected ? 'var(--mm-primary-soft)' : 'var(--mm-surface)',
              color: 'var(--mm-text-strong)',
              fontSize: 'calc(16 * var(--mm-px))',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <ChoiceMark selected={selected} />
            {renderChoiceText(raw, { dimensions })}
          </button>
        );
      })}
    </div>
  );
}

const looksLikePlainLanguageAnswer = (value) => {
  const text = String(value ?? '').trim();
  if (!text || TEXTUAL_MATH_SIGNAL.test(text)) return false;
  // A bare number is mathematical. Words (including phrases such as
  // "39 buses") are language responses and should not be entered in a
  // math field.
  return /[A-Za-z]/.test(text);
};


const acceptedAnswersForField = (field) => answerCandidatesForField(field);

const shouldUseSetInput = (field) => {
  if (field?.type === 'set' || field?.notation === 'set' || field?.inputMode === 'set') return true;
  return acceptedAnswersForField(field).some((value) => looksLikeFiniteSetNotation(value));
};

const shouldUseInequalityInput = (field) => {
  if (field?.type === 'inequality' || field?.notation === 'inequality' || field?.inputMode === 'inequality') return true;
  if (/inequalit/i.test(String(field?.label || field?.prompt || ''))) return true;
  return acceptedAnswersForField(field).some((value) => /[<>≤≥]/.test(String(value)));
};


const shouldUsePlainTextInput = (field) => {
  if (field?.type === 'text' || field?.inputMode === 'text') return true;
  if (field?.type === 'math' || field?.inputMode === 'math') return false;
  const accepted = acceptedAnswersForField(field);
  return accepted.length > 0 && accepted.every(looksLikePlainLanguageAnswer);
};

// Stable fallback: `answerFields = []` built a new array per render, and the
// report effect below depends on what is derived from it.
const NO_FIELDS = Object.freeze([]);
const NO_SYMBOLS = Object.freeze([]);
// The saved answers: what is in each box, by field id. A box holding anything
// else is dropped and opens empty (checkedQuestionDraft.js).
const ANSWERS_DRAFT = draftNormalizer(draftShape.map(draftShape.nullable(draftShape.cell())));

// `verdictsWithheld`: an exit ticket, a quiz or a test before its release
// (QuestionEngine). Then the keypad says nothing about the answer
// (withheldVerdictKeypad.js, N56); practice and classwork keep their scaffold.
// `partByPart`: open one part at a time (PART BY PART, above). Off unless the
// host asks: every other host draws every part, as it always has.
// `onShownPartsChange`: told which parts are on the screen while the parts
// open one at a time (the open one and the answered lines; every part in
// Review all parts or after a graded attempt), or null when every part is
// drawn. Read aloud reads only those (SP-1c).
// `stepsOptional`: the student's See every part at once support. A part's
// step (SHOW THE STEP, above) never holds its answer box shut for them.
function MultiAnswerGrader({ question, onStateChange, onUndoStateChange, feedback, draftKey, verdictsWithheld = false, partByPart = false, onShownPartsChange = null, stepsOptional = false, StepComponent = null }) {
  const { prompt, answerFields = NO_FIELDS } = question;
  // Read as the box its key says it is: an older import stamped some number
  // boxes as set boxes (RT02), and the grader reads them the same way.
  const safeFields = useMemo(() => (
    Array.isArray(answerFields) ? answerFields.filter((field) => field?.id).map(withoutStaleSetStamp) : []
  ), [answerFields]);
  // Graphs to choose among are shuffled, so their order cannot point to the
  // answer. Graphs the prompt names in order, each answered in its own box
  // ("write the inequality for graphs a, b and c", N38), are figures to read:
  // `candidateGraphsInOrder` keeps them as written.
  const graphsInOrder = question.candidateGraphsInOrder === true;
  const candidateGraphs = useMemo(
    () => (graphsInOrder
      ? (Array.isArray(question.candidateGraphs) ? question.candidateGraphs : [])
      : stableShuffleChoices(
        Array.isArray(question.candidateGraphs) ? question.candidateGraphs : [],
        choiceSeed(question.questionId || question.prompt, 'candidate-graphs'),
      )),
    [question.candidateGraphs, question.questionId, question.prompt, graphsInOrder],
  );
  const history = useUndoHistory({}, 60, draftKey ? `${draftKey}:multi-answer` : null, { normalize: ANSWERS_DRAFT });
  const answers = history.value;
  // SP-3: a part that builds on an earlier one (followThrough) is graded with
  // the follow-through rules, loaded only for such a question; until they
  // arrive it is not complete, so it cannot be submitted.
  // Its label shows the student's own value ("Using your slope of −3, …"), or
  // "your slope …" before there is one: on its box, its answered line, Review
  // all parts and what a screen reader says. With no followThrough these are
  // the fields themselves, and nothing is loaded.
  const followThrough = useFollowThroughRules(safeFields);
  const followThroughRules = followThrough.rules;
  const labelledFields = useMemo(
    () => withFollowThroughLabels(safeFields, answers, {
      latexOf: (field) => field.labelLatex === true || field.labelFormat === 'latex',
      value: followThroughRules?.followThroughValue,
    }),
    [safeFields, answers, followThroughRules],
  );
  const shown = (field) => labelledFields[safeFields.indexOf(field)] || field;
  // Each graded field says so in words under it, and its control is described
  // by that sentence and aria-invalid when wrong (GradedEntryMark.jsx): the
  // border colour was the only sign (VH-13, WCAG 1.4.1 and 3.3.1).
  const markBase = useId();
  // Correctness comes from the shared grading contract so every caller of it —
  // this screen, the deadline finalizer, the tests — marks alike. It gets the
  // whole question, as the server does: whether a line field takes any form
  // of its line is read from the question's words (GR03, lineFormPolicy.mjs).
  // Once per change of the answers, not once per render.
  const graded = useMemo(
    () => gradeMultiAnswerResponse({ ...question, answerFields: safeFields }, answers, { followThrough: followThroughRules }),
    [question, safeFields, answers, followThroughRules],
  );
  const { parts, isCorrect } = graded;
  // A response that breaks its field's stated shape is not ready to submit:
  // the student is told why beside the field instead of losing a try to it.
  const formatProblems = useMemo(() => Object.fromEntries(safeFields.map((field) => [
    field.id,
    formatProblemForResponse(field, answers[field.id]),
  ])), [safeFields, answers]);
  // …nor is an entry left unfinished (`12 +`, `4*`) or longer than an answer
  // may be (typedEntryGuard.mjs; #557, #558). A box of words, or of choices,
  // is read for its length only.
  const entryProblems = useMemo(() => Object.fromEntries(safeFields.map((field) => [
    field.id,
    typedEntryNotice(answers[field.id], {
      words: shouldUsePlainTextInput(field) || isChoiceAnswerField(field) || Boolean(field.options?.length || field.choices?.length),
      keys: acceptedAnswersForField(field),
    }),
  ])), [safeFields, answers]);
  // What each part's step last said (ShowTheStep's onStatus): `open` once the
  // step lets the answer box open. A part with a step is not answered, and the
  // question not ready to submit, until then.
  const [stepStatus, setStepStatus] = useState(NO_STEPS);
  const stepOf = (field) => (StepComponent ? checkpointOf(field) : null);
  const stepIsOpen = (field) => stepsOptional || !stepOf(field) || stepStatus[field.id]?.open === true;
  const reportStep = (id, status) => setStepStatus((current) => (
    current[id]?.open === status.open && current[id]?.done === status.done ? current : { ...current, [id]: status }
  ));
  const isComplete = graded.isComplete && !Object.values(formatProblems).some(Boolean) && !Object.values(entryProblems).some(Boolean)
    && safeFields.every(stepIsOpen);

  useEffect(() => {
    const responseDetails = labelledFields.map((field) => `${field.label || field.id}=${answers[field.id] ?? ''}`).join(', ');
    onStateChange({
      isComplete,
      isCorrect,
      responseKey: JSON.stringify(answers),
      questionDetails: `${prompt || 'Complete all answer fields.'}${question.mathDisplay?.value ? ` Expression: ${question.mathDisplay.value}.` : ''} Responses: ${responseDetails}`,
      parts,
    });
  }, [answers, labelledFields, prompt, question.mathDisplay, isComplete, isCorrect, onStateChange]);

  // Read in the render the history changed in (useUndoHistory updates it with
  // the value), so Undo is handed to the engine when what it can do changes:
  // the first entry, the last undo. Handed over on every keystroke, it was a
  // new controller each time, and the engine drew the whole question again.
  const canUndo = history.canUndo;
  useEffect(() => {
    onUndoStateChange?.({ canUndo, onUndo: history.undo, label: 'Undo the last field entry' });
    return () => onUndoStateChange?.(null);
  }, [canUndo, history.undo, onUndoStateChange]);

  // What each box shows that its answer does not change: its choices, the
  // keys its key needs, its example and its keypad. Once per question, not on
  // every keystroke: the example is checked against the grader, and a new
  // array of keys each render made the box build its keypad again.
  const fieldPresentation = useMemo(() => new Map(safeFields.map((field) => {
    const choiceOptions = choiceOptionsForField(field, choiceSeed(question.questionId || question.prompt, field.id));
    // What the key says (a relation or a letter only the key needs) and
    // what any accepted form needs to be spelled (answerEntryTools.js).
    const accepted = acceptedAnswersForField(field);
    const inferredRequiredSymbols = neededAnswerSymbols({ key: fieldKeyValues(field, accepted), accepted });
    // The keys a field names, the import's reading of its key among
    // them, and this box's own reading of its answers.
    const requiredSymbols = [
      ...(Array.isArray(field.requiredSymbols) ? field.requiredSymbols : []),
      ...(Array.isArray(field.inputContract?.requiredSymbols) ? field.inputContract.requiredSymbols : []),
      ...inferredRequiredSymbols,
    ];
    // The field already enforces a shape through requiredSymbols. Saying
    // so is the whole fix: an x-intercept box and a zero box look
    // identical and reject each other's answers.
    const answerShape = describeAnswerFormat(field);
    // The box keeps the example alone and the words sit above it, where
    // they wrap ("for exampl…" was all a 127px box could show). An
    // inequality's example is in x and y when the prompt and the label
    // name both (answerFormatHints.js readsXAndY). A number box's example
    // is never one this box's grader would mark right (the 2026-11-06
    // re-walk: "-4" was the answer in some versions).
    const box = describeBoxPlaceholder(field, {
      inferredFormat: shouldUseSetInput(field) ? 'set' : shouldUseInequalityInput(field) ? 'inequality' : '',
      prompt,
      // Read against the part's own answer alone (the box has no earlier
      // values here), as a question with no followThrough is.
      isAnswer: (typed) => gradeMultiAnswerResponse({ ...question, answerFields: safeFields.map(({ followThrough: _builds, ...own }) => own) }, { [field.id]: typed })
        .parts.find((part) => part.id === field.id)?.isCorrect === true,
    });
    // The keypad: the box's shape, the pad its field names (a number,
    // an ordered pair), else the general one. Where the verdict is
    // withheld nothing in it comes from the key: the pad is the one the
    // field declares, and the keys of the secure field's profile and the
    // letters the student reads take the place of the field's required
    // symbols (withheldVerdictKeypad.js, N56).
    const toolProfile = field.toolProfile || (shouldUseSetInput(field) ? 'set' : shouldUseInequalityInput(field) ? 'inequality' : (verdictsWithheld ? declaredKeypadProfile(field) : keypadProfileForResponseField(field)) || 'basic');
    const withheldKeys = verdictsWithheld ? withheldVerdictKeys(field, { prompt, toolProfile }) : null;
    return [field.id, { choiceOptions, inferredRequiredSymbols, requiredSymbols, answerShape, box, toolProfile, withheldKeys }];
  })), [safeFields, question, prompt, verdictsWithheld]);

  // PART BY PART (above). A part is done when it has an answer its box would
  // let the engine submit: an answer that breaks its shape keeps it open,
  // where the reason is shown.
  const walkParts = partByPart === true && safeFields.length > 1;
  const partDone = useMemo(() => new Map(safeFields.map((field) => [
    field.id,
    parts.find((part) => part.id === field.id)?.isComplete === true && !formatProblems[field.id] && !entryProblems[field.id] && stepIsOpen(field),
  ])), [safeFields, parts, formatProblems, entryProblems, stepStatus, stepsOptional, StepComponent]);
  const firstOpenPart = () => safeFields.find((field) => !partDone.get(field.id))?.id ?? null;
  // `open`: the open part's id, or null for Review all parts. `target`: what
  // takes focus after the student moved (`focus` counts the moves).
  // `gradedFor`: the graded attempt (feedback with part grades) last seen, and
  // `afterMiss` the parts it left open: the wrong ones, and any the student
  // opened again with Change. The engine drops its feedback once the student
  // edits an answer; the parts stay open until the next attempt is graded.
  const [walk, setWalk] = useState(() => ({ open: firstOpenPart(), target: null, focus: 0, announcement: '', gradedFor: null, afterMiss: NO_FIELDS }));
  const gradedNow = walkParts && Array.isArray(feedback?.partGrades) ? feedback : null;
  const wrongIn = (graded) => graded.partGrades.filter((part) => part?.isCorrect === false).map((part) => part.id);
  if (gradedNow && walk.gradedFor !== gradedNow) {
    // A newly graded attempt: its wrong parts open, its right ones shrink
    // (state derived from a prop, set while rendering, as React allows).
    setWalk((current) => ({ ...current, gradedFor: gradedNow, afterMiss: wrongIn(gradedNow) }));
  }
  const afterGrading = walkParts && (gradedNow !== null || walk.gradedFor !== null);
  const afterMiss = gradedNow && walk.gradedFor !== gradedNow ? wrongIn(gradedNow) : walk.afterMiss;
  // The grader's marks, on a part's line, while the engine shows them.
  const lineGrades = Array.isArray(feedback?.partGrades) ? feedback.partGrades : null;
  // A part emptied since it was passed (Undo, a restored draft) opens again.
  const openPartId = (safeFields.some((field) => field.id === walk.open) ? walk.open : null) ?? firstOpenPart();
  const reviewHeading = verdictsWithheld ? 'Review all parts, then submit' : 'Review all parts';
  const partName = (id) => `Part ${safeFields.findIndex((field) => field.id === id) + 1} of ${safeFields.length}`;
  const partState = (field) => {
    if (afterGrading) return afterMiss.includes(field.id) || !partDone.get(field.id) ? 'open' : 'answered';
    if (field.id === openPartId) return 'open';
    return partDone.get(field.id) ? 'answered' : 'hidden';
  };
  // What is on the screen, for Read aloud (onShownPartsChange, above): told
  // when it changes, and null once this grader is gone.
  const shownPartIds = walkParts ? safeFields.filter((field) => partState(field) !== 'hidden').map((field) => field.id) : null;
  const shownPartsKey = shownPartIds ? JSON.stringify(shownPartIds) : '';
  const onShownPartsChangeRef = useRef(onShownPartsChange);
  onShownPartsChangeRef.current = onShownPartsChange;
  useEffect(() => {
    onShownPartsChangeRef.current?.(shownPartsKey ? JSON.parse(shownPartsKey) : null);
  }, [shownPartsKey]);
  useEffect(() => () => onShownPartsChangeRef.current?.(null), []);
  // Where Next part goes: the next part with no answer, else an earlier one,
  // else Review all parts.
  const nextStop = (id) => {
    const index = safeFields.findIndex((field) => field.id === id);
    const waiting = [...safeFields.slice(index + 1), ...safeFields.slice(0, Math.max(0, index))]
      .find((field) => !partDone.get(field.id));
    return waiting ? waiting.id : null;
  };
  const moveTo = (id) => setWalk((current) => ({
    ...current, open: id, target: id, focus: current.focus + 1, announcement: id === null ? reviewHeading : partName(id),
  }));
  const changePart = (id) => {
    if (!afterGrading) {
      moveTo(id);
      return;
    }
    setWalk((current) => ({
      ...current,
      afterMiss: [...afterMiss.filter((open) => open !== id), id],
      target: id,
      focus: current.focus + 1,
      announcement: partName(id),
    }));
  };
  // Focus goes to the new part's heading (or the review's), only after the
  // student moved, never on mount; and the page scrolls only as far as it
  // must to show it, not to put it at the top.
  const partFocusRef = useRef(null);
  useEffect(() => {
    if (!walk.focus) return;
    const target = partFocusRef.current;
    if (typeof target?.focus !== 'function') return;
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: 'nearest' });
  }, [walk.focus]);

  // One part's box: its label, its hints, and the control it is answered in.
  const fieldBox = (field) => {
    const grade = feedback?.partGrades?.find((part) => part.id === field.id);
    const markId = `${markBase}-${field.id}-mark`;
    const { choiceOptions, inferredRequiredSymbols, requiredSymbols, answerShape, box, toolProfile, withheldKeys } = fieldPresentation.get(field.id);
    const step = stepOf(field);
    const stepKey = checkpointWorkKey(field.id);
    const stepOpen = stepIsOpen(field);
    return (
      <div key={field.id} data-answer-box-index={safeFields.indexOf(field)} data-answer-box-kind={shouldUsePlainTextInput(field) ? 'text' : undefined} style={{ padding: '16px', border: `2px solid ${grade ? (grade.isCorrect ? '#188038' : '#d93025') : 'var(--mm-border)'}`, borderRadius: '10px', background: grade && !grade.isCorrect ? 'var(--mm-error-subtle)' : 'var(--mm-surface)' }}>
        <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', color: 'var(--mm-text)' }}>
          {fieldLabelContent(shown(field))}
        </label>
        {step ? (
          <div style={{ marginBottom: 14 }}>
            <Suspense fallback={<p role="status" style={{ margin: 0, color: 'var(--mm-text-muted)' }}>Loading the step…</p>}>
              <StepComponent
                checkpoint={field.checkpoint}
                value={String(answers[stepKey] || '')}
                onChange={(line) => history.setValue((current) => (String(current[stepKey] || '') === line ? current : { ...current, [stepKey]: line }))}
                onStatus={(status) => reportStep(field.id, status)}
                verdictsWithheld={verdictsWithheld}
                optional={stepsOptional}
                draftKey={draftKey ? `${draftKey}:step-${field.id}` : null}
                partLabel={accessibleFieldLabel(shown(field))}
              />
            </Suspense>
          </div>
        ) : null}
        {stepOpen ? (
        <>
        {(answerShape.hint || box.example) && !choiceOptions && (
          <p style={{ margin: '-4px 0 10px', fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.4, color: 'var(--mm-text-muted)', fontWeight: 600 }}>
            {answerShape.hint}
            {box.example ? <>{answerShape.hint ? ' ' : ''}For example <strong style={{ color: 'var(--mm-text)' }}>{box.example}</strong>.</> : null}
          </p>
        )}
        {formatProblems[field.id] ? (
          <p role="status" style={{ margin: '0 0 10px', padding: '6px 9px', borderRadius: '8px', fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.4, fontWeight: 700, background: 'var(--mm-warning-bg)', color: 'var(--mm-warning-text)' }}>
            {formatProblems[field.id]}
          </p>
        ) : null}
        <TypedEntryNotice message={entryProblems[field.id]} entry={answers[field.id]} style={{ margin: '0 0 10px' }} />
        {choiceOptions ? (
          <ChoiceFieldOptions
            label={accessibleFieldLabel(shown(field))}
            dimensions={choiceFieldAsksDimensions(field.label, question.prompt)}
            options={choiceOptions}
            value={String(answers[field.id] || '')}
            grade={grade}
            markId={markId}
            onSelect={(raw) => history.setValue((current) => ({ ...current, [field.id]: raw }))}
          />
        ) : shouldUsePlainTextInput(field) ? (
          <input
            type="text"
            value={answers[field.id] || ''}
            onChange={(event) => history.setValue((current) => ({ ...current, [field.id]: event.target.value }))}
            placeholder={box.placeholder}
            aria-label={accessibleFieldLabel(shown(field))}
            {...gradedEntryInputProps(grade, markId)}
            autoComplete="off"
            spellCheck={false}
            style={{
              width: '100%',
              minHeight: '54px',
              padding: '12px 14px',
              boxSizing: 'border-box',
              borderRadius: '8px',
              border: `2px solid ${grade ? (grade.isCorrect ? '#188038' : '#d93025') : '#1a73e8'}`,
              background: grade && !grade.isCorrect ? 'var(--mm-error-subtle)' : grade?.isCorrect ? 'var(--mm-success-subtle)' : 'var(--mm-surface)',
              color: 'var(--mm-text-strong)',
              fontSize: 'calc(18 * var(--mm-px))',
              fontFamily: 'inherit',
            }}
          />
        ) : (
          <MathInput
            value={answers[field.id] || ''}
            onChange={(value) => history.setValue((current) => ({ ...current, [field.id]: value }))}
            placeholder={box.placeholder}
            ariaLabel={accessibleFieldLabel(shown(field))}
            toolProfile={toolProfile}
            answerFormat={field.answerFormat || field.inputContract?.format || field.notation || field.inputMode || (shouldUseInequalityInput(field) ? 'inequality' : '')}
            requiredSymbols={withheldKeys ? NO_SYMBOLS : requiredSymbols}
            extraKeys={withheldKeys || undefined}
            hideNeededSymbols={Boolean(withheldKeys)}
            // Open on arrival by the box's shape, and, with a scaffold, by its key.
            showToolsInitially={shouldUseSetInput(field) || shouldUseInequalityInput(field) || (!withheldKeys && inferredRequiredSymbols.length > 0)}
            inputStatus={grade ? (grade.isCorrect ? 'correct' : 'incorrect') : 'neutral'}
            ariaInvalid={grade ? !grade.isCorrect : false}
            ariaDescribedBy={grade ? markId : ''}
          />
        )}
        <GradedEntryMark grade={grade} id={markId} />
        </>
        ) : null}
      </div>
    );
  };

  return (
    <div>
      {/* Classed so the Enlarge button can be given room beside it on a phone
          (WorkViewShell.css, PQ-025). */}
      <h2 className="mathmaster-multipart-heading" style={{ color: 'var(--mm-text-strong)', marginTop: 0 }}>{question.heading || (safeFields.length > 1 ? 'Complete Each Part' : 'Your answer')}</h2>
      <QuestionPrompt>{prompt || 'Enter an answer for every part.'}</QuestionPrompt>
      {/* A data table beside its answer fields where there is room. Stacked,
          the table sat centred with ~370px blank either side on a 1180px
          tablet and the fields below the fold; scrolling to them slid the
          table the student was reading from under the sticky task card. */}
      <div
        className="mathmaster-multipart-layout"
        data-side-table={Boolean(question?.table) && !question?.graph && !question?.visual && !question?.mathDisplay && !question?.supportingMath && !candidateGraphs.length ? 'true' : 'false'}
      >
      <div className="mathmaster-multipart-body">
      <QuestionVisual question={question} />
      <PathQuestionStimulus stimulus={question.stimulus} />
      {question.permittedTools?.includes('linearRegression') && <LinearRegressionPanel />}
      {candidateGraphs.length > 0 && (
        <div
          role="group"
          aria-label={graphsInOrder ? 'Graphs' : 'Candidate graphs'}
          style={{
            display: 'grid',
            // A graph to read is read off its grid: it gets the width to be
            // legible (one per row in the question's column), where a
            // candidate to pick from can stay a thumbnail.
            gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${graphsInOrder ? 440 : 240}px), 1fr))`,
            gap: 16,
            margin: '18px 0 4px',
          }}
        >
          {candidateGraphs.map((candidate, index) => (
            <div
              key={candidate?.id || index}
              style={{
                border: '2px solid var(--mm-border)',
                borderRadius: 12,
                background: 'var(--mm-surface)',
                padding: 12,
              }}
            >
              <div style={{ marginBottom: 8, fontWeight: 900, color: 'var(--mm-primary-text)', textAlign: 'center' }}>
                {candidate?.label || `Graph ${candidate?.id || String.fromCharCode(65 + index)}`}
              </div>
              {candidate?.graph ? (
                <GraphDisplay graph={candidate.graph} title={candidate?.label || `Graph ${candidate?.id || String.fromCharCode(65 + index)}`} />
              ) : (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--mm-text-muted)' }}>
                  Graph unavailable
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {walkParts ? (
        <div
          className="mathmaster-multipart-fields mathmaster-multipart-parts"
          // The engine counts every part, not the one box on screen, so Enter
          // never takes the open part for the whole answer (answerEntryUx.js
          // countAnswerParts).
          data-answer-part-count={safeFields.length}
          style={{ display: 'grid', gap: '12px', marginTop: '24px', minWidth: 0 }}
        >
          <p role="status" data-part-announcer="true" style={SR_ONLY_STYLE}>{walk.announcement}</p>
          {!afterGrading && openPartId === null && (
            <h3 ref={walk.target === null ? partFocusRef : undefined} tabIndex={-1} style={{ margin: 0, color: 'var(--mm-text-strong)', fontSize: 'calc(17 * var(--mm-px))' }}>{reviewHeading}</h3>
          )}
          {safeFields.map((field, index) => {
            const state = partState(field);
            if (state === 'hidden') return null;
            const grade = lineGrades?.find((part) => part.id === field.id);
            if (state === 'answered') {
              const markId = `${markBase}-${field.id}-mark`;
              const value = String(answers[field.id] ?? '');
              const { choiceOptions } = fieldPresentation.get(field.id);
              return (
                <div key={field.id} data-part-state="answered" data-part-id={field.id} data-part-index={index} data-part-value={value} style={{ ...PART_LINE, border: `2px solid ${grade?.isCorrect ? 'var(--mm-success-border)' : 'var(--mm-border)'}` }}>
                  <span style={{ fontWeight: 800 }}>{fieldLabelContent(shown(field))}</span>
                  <span style={{ color: 'var(--mm-text-strong)', fontSize: 'calc(17 * var(--mm-px))', minWidth: 0, overflowWrap: 'anywhere' }}>
                    {choiceOptions
                      ? renderChoiceText(value, { dimensions: choiceFieldAsksDimensions(field.label, question.prompt) })
                      : shouldUsePlainTextInput(field) ? value : <MathDisplay value={value} format="latex" inline />}
                  </span>
                  <button
                    type="button"
                    onClick={() => changePart(field.id)}
                    // Named by the part, and starting with what it says (WCAG 2.5.3).
                    aria-label={`Change part ${index + 1}, ${accessibleFieldLabel(shown(field))}`}
                    style={{ ...partButton(true, true), marginLeft: 'auto' }}
                  >
                    Change
                  </button>
                  {grade ? <span style={{ flexBasis: '100%' }}><GradedEntryMark grade={grade} id={markId} /></span> : null}
                </div>
              );
            }
            const headingId = `${markBase}-${field.id}-part`;
            const done = partDone.get(field.id) === true;
            const next = afterGrading ? undefined : nextStop(field.id);
            return (
              <div
                key={field.id}
                role="group"
                aria-labelledby={headingId}
                data-part-state="open"
                data-part-id={field.id}
                data-part-index={index}
                data-part-value={String(answers[field.id] ?? '')}
                // Enter in the open part is Next part, once it has an answer;
                // without one it does nothing (and never submits).
                data-mm-enter-owner={afterGrading ? undefined : 'part'}
                onKeyDown={afterGrading ? undefined : (event) => {
                  if (event.key !== 'Enter' || event.isComposing || event.defaultPrevented) return;
                  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
                  if (!isSingleLineAnswerTarget(event.target)) return;
                  event.preventDefault();
                  if (done) moveTo(next);
                }}
                style={{ display: 'grid', gap: '10px', minWidth: 0 }}
              >
                <h3 id={headingId} ref={walk.target === field.id ? partFocusRef : undefined} tabIndex={-1} style={{ margin: 0, color: 'var(--mm-text-strong)', fontSize: 'calc(15 * var(--mm-px))' }}>
                  {partName(field.id)}
                </h3>
                {fieldBox(field)}
                {!afterGrading && (
                  <button type="button" disabled={!done} onClick={() => moveTo(next)} style={{ ...partButton(done), justifySelf: 'start' }}>
                    {next === null ? 'Review all parts' : 'Next part'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
      <div className="mathmaster-multipart-fields" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '20px', marginTop: '24px' }}>
        {safeFields.map((field) => fieldBox(field))}
      </div>
      )}
      </div>
      </div>
    </div>
  );
}

// Drawn again when its own answers change, or when the engine hands it new
// props; the engine's other renders (one for every answer it is told about)
// leave it as it is.
export default memo(MultiAnswerGrader);

import { memo, useEffect, useId, useMemo } from 'react';
import MathInput from './MathInput';
import MathDisplay from './MathDisplay';
import QuestionPrompt from './QuestionPrompt';
import QuestionVisual from './QuestionVisual';
import './MultiAnswerGrader.css';
import GraphDisplay from './GraphDisplay';
import PathQuestionStimulus from './components/student/PathQuestionStimulus.jsx';
import LinearRegressionPanel from './components/assessment/LinearRegressionPanel.jsx';
import { answerCandidatesForField, looksLikeFiniteSetNotation, withoutStaleSetStamp } from './answerUtils';
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
import useUndoHistory from './useUndoHistory';
import { choiceAccessibleLabel, choiceFieldAsksDimensions, choiceOptionsForField, choiceSeed, stableShuffleChoices } from './platform/interaction/choiceOptions.js';
import { normalizePlainMathTypography, toPlainMath } from './components/common/mathSegments.js';
import { MathText } from './components/common/MathText.jsx';
import { ChoiceMark, useChoiceGroup } from './platform/interaction/choiceGroup.js';
import GradedEntryMark, { gradedEntryInputProps } from './components/common/GradedEntryMark.jsx';

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

// `verdictsWithheld`: an exit ticket, a quiz or a test before its release
// (QuestionEngine). Then the keypad says nothing about the answer
// (withheldVerdictKeypad.js, N56); practice and classwork keep their scaffold.
function MultiAnswerGrader({ question, onStateChange, onUndoStateChange, feedback, draftKey, verdictsWithheld = false }) {
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
  const history = useUndoHistory({}, 60, draftKey ? `${draftKey}:multi-answer` : null);
  const answers = history.value;
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
    () => gradeMultiAnswerResponse({ ...question, answerFields: safeFields }, answers),
    [question, safeFields, answers],
  );
  const { parts, isCorrect } = graded;
  // A response that breaks its field's stated shape is not ready to submit:
  // the student is told why beside the field instead of losing a try to it.
  const formatProblems = useMemo(() => Object.fromEntries(safeFields.map((field) => [
    field.id,
    formatProblemForResponse(field, answers[field.id]),
  ])), [safeFields, answers]);
  const isComplete = graded.isComplete && !Object.values(formatProblems).some(Boolean);

  useEffect(() => {
    const responseDetails = safeFields.map((field) => `${field.label || field.id}=${answers[field.id] ?? ''}`).join(', ');
    onStateChange({
      isComplete,
      isCorrect,
      responseKey: JSON.stringify(answers),
      questionDetails: `${prompt || 'Complete all answer fields.'}${question.mathDisplay?.value ? ` Expression: ${question.mathDisplay.value}.` : ''} Responses: ${responseDetails}`,
      parts,
    });
  }, [answers, safeFields, prompt, question.mathDisplay, isComplete, isCorrect, onStateChange]);

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
      isAnswer: (typed) => gradeMultiAnswerResponse({ ...question, answerFields: safeFields }, { [field.id]: typed })
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
      <div className="mathmaster-multipart-fields" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '20px', marginTop: '24px' }}>
        {safeFields.map((field) => {
          const grade = feedback?.partGrades?.find((part) => part.id === field.id);
          const markId = `${markBase}-${field.id}-mark`;
          const { choiceOptions, inferredRequiredSymbols, requiredSymbols, answerShape, box, toolProfile, withheldKeys } = fieldPresentation.get(field.id);
          return (
            <div key={field.id} style={{ padding: '16px', border: `2px solid ${grade ? (grade.isCorrect ? '#188038' : '#d93025') : 'var(--mm-border)'}`, borderRadius: '10px', background: grade && !grade.isCorrect ? 'var(--mm-error-subtle)' : 'var(--mm-surface)' }}>
              <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', color: 'var(--mm-text)' }}>
                {(() => {
                  const text = field.label || field.id;
                  // "$x$-intercept", "Slope $m$ =": words and mathematics,
                  // set the way MathText sets every other field label.
                  if (!field.labelLatex && !field.labelFormat && labelHasDelimitedMath(text)) return <MathText>{text}</MathText>;
                  const format = resolveLabelFormat(text, { latexFlag: field.labelLatex, explicitFormat: field.labelFormat });
                  // An English label goes through the math typesetter as
                  // juxtaposed variables — "Discrete or continuous?" comes out
                  // as "Discrete ∨ continuous?" — so it stays plain text.
                  return format ? <MathDisplay value={normalizeMathDisplayValue(text)} format={format} inline /> : normalizePlainMathTypography(text);
                })()}
              </label>
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
              {choiceOptions ? (
                <ChoiceFieldOptions
                  label={accessibleFieldLabel(field)}
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
                  aria-label={accessibleFieldLabel(field)}
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
                  ariaLabel={accessibleFieldLabel(field)}
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
            </div>
          );
        })}
      </div>
      </div>
      </div>
    </div>
  );
}

// Drawn again when its own answers change, or when the engine hands it new
// props; the engine's other renders (one for every answer it is told about)
// leave it as it is.
export default memo(MultiAnswerGrader);

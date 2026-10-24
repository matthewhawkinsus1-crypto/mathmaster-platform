import { useEffect, useMemo } from 'react';
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
import { labelHasDelimitedMath, resolveLabelFormat } from './labelFormat';
import { inferRequiredAnswerSymbols } from './platform/interaction/answerEntryTools.js';
import { describeAnswerFormat } from './platform/interaction/answerFormatHints.js';
import { keypadProfileForResponseField } from './platform/interaction/interactionContract.js';
import { formatProblemForResponse } from './platform/interaction/answerShapeGuard.js';
import useUndoHistory from './useUndoHistory';
import { choiceAccessibleLabel, choiceOptionsForField, choiceSeed, stableShuffleChoices } from './platform/interaction/choiceOptions.js';
import { normalizePlainMathTypography, toPlainMath } from './components/common/mathSegments.js';
import { MathText } from './components/common/MathText.jsx';
import { ChoiceMark, useChoiceGroup } from './platform/interaction/choiceGroup.js';

const TEXTUAL_MATH_SIGNAL = /[=<>≤≥≠+*/^()[\]{}\\∞π√∪∩]/;

const normalizeMathDisplayValue = (value) => normalizePlainMathTypography(value)
  .replace(/⁻¹/g, '^(-1)')
  .replace(/²/g, '^2')
  .replace(/³/g, '^3');

// A field's name for a screen reader: the label's mathematics as characters,
// never its dollar signs.
const accessibleFieldLabel = (field) => {
  const text = field.label || field.id;
  return labelHasDelimitedMath(text) ? toPlainMath(text) : text;
};

const renderChoiceText = (value) => {
  const text = String(value ?? '');
  const format = resolveLabelFormat(text);
  return format
    // Named by its own text: every choice was announced "Mathematical
    // expression", so a screen reader could not tell 11 from 5.
    ? <MathDisplay value={normalizeMathDisplayValue(text)} format={format} inline ariaLabel={choiceAccessibleLabel(text)} />
    : normalizePlainMathTypography(text);
};

// A choice field: one radio group (choiceGroup.js) — one tab stop, arrows
// move and select, and the chosen option carries a ✓ as well as its colour.
function ChoiceFieldOptions({ label, options, value, grade, onSelect }) {
  const raws = options.map((option) => String(option));
  const optionProps = useChoiceGroup({ ids: raws, value, onSelect });
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'grid', gap: '8px' }}>
      {raws.map((raw, index) => {
        const selected = value === raw;
        return (
          <button
            type="button"
            key={raw}
            {...optionProps(index)}
            aria-label={choiceAccessibleLabel(raw)}
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
            {renderChoiceText(raw)}
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

export default function MultiAnswerGrader({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const { prompt, answerFields = NO_FIELDS } = question;
  // Read as the box its key says it is: an older import stamped some number
  // boxes as set boxes (RT02), and the grader reads them the same way.
  const safeFields = useMemo(() => (
    Array.isArray(answerFields) ? answerFields.filter((field) => field?.id).map(withoutStaleSetStamp) : []
  ), [answerFields]);
  const candidateGraphs = useMemo(
    () => stableShuffleChoices(
      Array.isArray(question.candidateGraphs) ? question.candidateGraphs : [],
      choiceSeed(question.questionId || question.prompt, 'candidate-graphs'),
    ),
    [question.candidateGraphs, question.questionId, question.prompt],
  );
  const history = useUndoHistory({}, 60, draftKey ? `${draftKey}:multi-answer` : null);
  const answers = history.value;
  // Correctness comes from the shared grading contract so every caller of it —
  // this screen, the deadline finalizer, the tests — marks alike.
  const graded = gradeMultiAnswerResponse({ answerFields: safeFields }, answers);
  const { parts, isCorrect } = graded;
  // A response that breaks its field's stated shape is not ready to submit:
  // the student is told why beside the field instead of losing a try to it.
  const formatProblems = Object.fromEntries(safeFields.map((field) => [
    field.id,
    formatProblemForResponse(field, answers[field.id]),
  ]));
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

  useEffect(() => {
    onUndoStateChange?.({ canUndo: history.canUndo, onUndo: history.undo, label: 'Undo the last field entry' });
    return () => onUndoStateChange?.(null);
  }, [answers, history.canUndo, history.undo, onUndoStateChange]);

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
          aria-label="Candidate graphs"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
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
          const choiceOptions = choiceOptionsForField(field, choiceSeed(question.questionId || question.prompt, field.id));
          const inferredRequiredSymbols = inferRequiredAnswerSymbols(acceptedAnswersForField(field));
          const requiredSymbols = [
            ...(Array.isArray(field.requiredSymbols) ? field.requiredSymbols : []),
            ...(Array.isArray(field.inputContract?.requiredSymbols) ? field.inputContract.requiredSymbols : []),
            ...inferredRequiredSymbols,
          ];
          // The field already enforces a shape through requiredSymbols. Saying
          // so is the whole fix: an x-intercept box and a zero box look
          // identical and reject each other's answers.
          const answerShape = describeAnswerFormat(field);
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
              {answerShape.hint && !choiceOptions && (
                <p style={{ margin: '-4px 0 10px', fontSize: 'calc(13 * var(--mm-px))', lineHeight: 1.4, color: 'var(--mm-text-muted)', fontWeight: 600 }}>
                  {answerShape.hint}
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
                  options={choiceOptions}
                  value={String(answers[field.id] || '')}
                  grade={grade}
                  onSelect={(raw) => history.setValue((current) => ({ ...current, [field.id]: raw }))}
                />
              ) : shouldUsePlainTextInput(field) ? (
                <input
                  type="text"
                  value={answers[field.id] || ''}
                  onChange={(event) => history.setValue((current) => ({ ...current, [field.id]: event.target.value }))}
                  placeholder={answerShape.placeholder}
                  aria-label={accessibleFieldLabel(field)}
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
                  placeholder={answerShape.example || field.placeholder
                    ? answerShape.placeholder
                    : shouldUseSetInput(field)
                      ? 'for example {1, 2, 3}'
                      : shouldUseInequalityInput(field)
                        ? 'for example 0 ≤ x ≤ 4'
                        : 'Type your answer'}
                  ariaLabel={accessibleFieldLabel(field)}
                  toolProfile={field.toolProfile || (shouldUseSetInput(field) ? 'set' : shouldUseInequalityInput(field) ? 'inequality' : keypadProfileForResponseField(field) || 'basic')}
                  answerFormat={field.answerFormat || field.inputContract?.format || field.notation || field.inputMode || (shouldUseInequalityInput(field) ? 'inequality' : '')}
                  requiredSymbols={requiredSymbols}
                  showToolsInitially={shouldUseSetInput(field) || shouldUseInequalityInput(field) || inferredRequiredSymbols.length > 0}
                  inputStatus={grade ? (grade.isCorrect ? 'correct' : 'incorrect') : 'neutral'}
                />
              )}
            </div>
          );
        })}
      </div>
      </div>
      </div>
    </div>
  );
}

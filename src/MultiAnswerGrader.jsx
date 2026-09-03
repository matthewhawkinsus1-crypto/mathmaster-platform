import { useEffect, useMemo } from 'react';
import MathInput from './MathInput';
import MathDisplay from './MathDisplay';
import QuestionPrompt from './QuestionPrompt';
import QuestionVisual from './QuestionVisual';
import GraphDisplay from './GraphDisplay';
import { answerCandidatesForField, looksLikeFiniteSetNotation, matchesFieldAnswer } from './answerUtils';
import { resolveLabelFormat } from './labelFormat';
import { inferRequiredAnswerSymbols } from './platform/interaction/answerEntryTools.js';
import { describeAnswerFormat } from './platform/interaction/answerFormatHints.js';
import useUndoHistory from './useUndoHistory';
import { choiceSeed, stableShuffleChoices, strengthenTwoChoiceSet } from './platform/interaction/choiceOptions.js';
import { normalizePlainMathTypography } from './components/common/mathSegments.js';

const TEXTUAL_MATH_SIGNAL = /[=<>≤≥≠+*/^()[\]{}\\∞π√∪∩]/;

const normalizeMathDisplayValue = (value) => normalizePlainMathTypography(value)
  .replace(/⁻¹/g, '^(-1)')
  .replace(/²/g, '^2')
  .replace(/³/g, '^3');

const renderChoiceText = (value) => {
  const text = String(value ?? '');
  const format = resolveLabelFormat(text);
  return format
    ? <MathDisplay value={normalizeMathDisplayValue(text)} format={format} inline />
    : normalizePlainMathTypography(text);
};

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


const inferredBinaryOptions = (field) => {
  const label = String(field?.label || field?.prompt || '').toLowerCase();
  const answer = String(field?.answer ?? field?.acceptedAnswers?.[0] ?? '').trim().toLowerCase();
  const patterns = [
    { options: ['yes', 'no'], pattern: /yes\s*(?:\/|or)\s*no|no\s*(?:\/|or)\s*yes/ },
    { options: ['true', 'false'], pattern: /true\s*(?:\/|or)\s*false|false\s*(?:\/|or)\s*true/ },
    { options: ['discrete', 'continuous'], pattern: /discrete\s*(?:\/|or)\s*continuous|continuous\s*(?:\/|or)\s*discrete/ },
    { options: ['finite', 'infinite'], pattern: /finite\s*(?:\/|or)\s*infinite|infinite\s*(?:\/|or)\s*finite/ },
  ];
  const match = patterns.find((entry) => entry.pattern.test(label) && entry.options.includes(answer));
  return match?.options || null;
};

const choiceOptionsForField = (field, seed = '') => {
  const authored = Array.isArray(field?.options) && field.options.length
    ? field.options
    : inferredBinaryOptions(field);
  if (!authored) return null;
  return stableShuffleChoices(strengthenTwoChoiceSet(authored), seed);
};

const shouldUsePlainTextInput = (field) => {
  if (field?.type === 'text' || field?.inputMode === 'text') return true;
  if (field?.type === 'math' || field?.inputMode === 'math') return false;
  const accepted = acceptedAnswersForField(field);
  return accepted.length > 0 && accepted.every(looksLikePlainLanguageAnswer);
};

export default function MultiAnswerGrader({ question, onStateChange, onUndoStateChange, feedback, draftKey }) {
  const { prompt, answerFields = [] } = question;
  const safeFields = useMemo(() => (Array.isArray(answerFields) ? answerFields.filter((field) => field?.id) : []), [answerFields]);
  const candidateGraphs = useMemo(
    () => stableShuffleChoices(
      Array.isArray(question.candidateGraphs) ? question.candidateGraphs : [],
      choiceSeed(question.questionId || question.prompt, 'candidate-graphs'),
    ),
    [question.candidateGraphs, question.questionId, question.prompt],
  );
  const history = useUndoHistory({}, 60, draftKey ? `${draftKey}:multi-answer` : null);
  const answers = history.value;
  const parts = safeFields.map((field) => {
    const response = String(answers[field.id] ?? '');
    const isCorrect = response.trim() !== '' && matchesFieldAnswer(response, field);
    return {
      id: field.id,
      label: field.label || field.id,
      isComplete: response.trim() !== '',
      // Expression equivalence is deliberately opt-in at the field level.
      // That fixes MathLive serialization differences without making
      // form-sensitive tasks (factoring, vertex form, etc.) overly permissive.
      isCorrect,
      credit: isCorrect ? 1 : 0,
      weight: Number.isFinite(Number(field.scoreWeight)) && Number(field.scoreWeight) > 0
        ? Math.min(20, Number(field.scoreWeight))
        : 1,
      response,
    };
  });
  const isComplete = parts.length > 0 && parts.every((part) => part.isComplete);
  const isCorrect = isComplete && parts.every((part) => part.isCorrect);

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
      <h2 style={{ color: '#202124', marginTop: 0 }}>{question.heading || 'Complete Each Part'}</h2>
      <QuestionPrompt>{prompt || 'Enter an answer for every part.'}</QuestionPrompt>
      <QuestionVisual question={question} />
      {candidateGraphs.length > 0 && (
        <div
          aria-label="Candidate graphs"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
            margin: '18px 0 4px',
          }}
        >
          {candidateGraphs.map((candidate, index) => (
            <div
              key={candidate?.id || index}
              style={{
                border: '2px solid #dfe3e7',
                borderRadius: 12,
                background: '#fff',
                padding: 12,
              }}
            >
              <div style={{ marginBottom: 8, fontWeight: 900, color: '#174ea6', textAlign: 'center' }}>
                {candidate?.label || `Graph ${candidate?.id || String.fromCharCode(65 + index)}`}
              </div>
              {candidate?.graph ? (
                <GraphDisplay graph={candidate.graph} title={candidate?.label || `Graph ${candidate?.id || String.fromCharCode(65 + index)}`} />
              ) : (
                <div style={{ padding: 24, textAlign: 'center', color: '#5f6368' }}>
                  Graph unavailable
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginTop: '24px' }}>
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
            <div key={field.id} style={{ padding: '16px', border: `2px solid ${grade ? (grade.isCorrect ? '#188038' : '#d93025') : '#dfe3e7'}`, borderRadius: '10px', background: grade && !grade.isCorrect ? '#fff8f7' : '#fbfcfe' }}>
              <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', color: '#3c4043' }}>
                {(() => {
                  const text = field.label || field.id;
                  const format = resolveLabelFormat(text, { latexFlag: field.labelLatex, explicitFormat: field.labelFormat });
                  // An English label goes through the math typesetter as
                  // juxtaposed variables — "Discrete or continuous?" comes out
                  // as "Discrete ∨ continuous?" — so it stays plain text.
                  return format ? <MathDisplay value={normalizeMathDisplayValue(text)} format={format} inline /> : normalizePlainMathTypography(text);
                })()}
              </label>
              {answerShape.hint && !choiceOptions && (
                <p style={{ margin: '-4px 0 10px', fontSize: '13px', lineHeight: 1.4, color: '#5f6368', fontWeight: 600 }}>
                  {answerShape.hint}
                </p>
              )}
              {choiceOptions ? (
                <div role="radiogroup" aria-label={field.label || field.id} style={{ display: 'grid', gap: '8px' }}>
                  {choiceOptions.map((option) => {
                    const raw = String(option);
                    const selected = String(answers[field.id] || '') === raw;
                    return (
                      <button
                        type="button"
                        key={raw}
                        role="radio"
                        aria-checked={selected}
                        onClick={() => history.setValue((current) => ({ ...current, [field.id]: raw }))}
                        style={{
                          minHeight: '46px',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: `2px solid ${selected ? '#1a73e8' : grade ? (grade.isCorrect ? '#188038' : '#d93025') : '#bdc7d6'}`,
                          background: selected ? '#e8f0fe' : '#fff',
                          color: '#202124',
                          fontSize: '16px',
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        {renderChoiceText(raw)}
                      </button>
                    );
                  })}
                </div>
              ) : shouldUsePlainTextInput(field) ? (
                <input
                  type="text"
                  value={answers[field.id] || ''}
                  onChange={(event) => history.setValue((current) => ({ ...current, [field.id]: event.target.value }))}
                  placeholder={answerShape.placeholder}
                  aria-label={field.label || field.id}
                  autoComplete="off"
                  spellCheck={false}
                  style={{
                    width: '100%',
                    minHeight: '54px',
                    padding: '12px 14px',
                    boxSizing: 'border-box',
                    borderRadius: '8px',
                    border: `2px solid ${grade ? (grade.isCorrect ? '#188038' : '#d93025') : '#1a73e8'}`,
                    background: grade && !grade.isCorrect ? '#fff8f7' : grade?.isCorrect ? '#f4fbf5' : '#fff',
                    color: '#202124',
                    fontSize: '18px',
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
                  ariaLabel={field.label || field.id}
                  toolProfile={field.toolProfile || (shouldUseSetInput(field) ? 'set' : shouldUseInequalityInput(field) ? 'inequality' : 'basic')}
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
  );
}

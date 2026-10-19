// What a student can still do after the last miss (student pass 3, Batch 4),
// mounted in the real QuestionEngine the way App.jsx mounts a student's
// question. Driven by tests/browser/afterLastMiss.mjs.
//
//   ?role=classwork|practice|warmup|dol  the section's role
//   ?q=inverse|choice                    a real compiled lesson item
//   ?host=0                              the host does not vouch for the practice
//                                        (Recovery, Path, a preview elsewhere)
//
// Graded submissions land on window.__mmGrades; the practice the engine will
// show (same seed, same sibling to avoid) on window.__mmPractice.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { emptyQuestionRecord, recordQuestionAttempt, resolveQuestionMaximumAttempts } from '../../src/attemptPolicy.js';
import { getEffectiveActivityPolicy } from '../../src/platform/policies/activityPolicies.js';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { buildPracticeLikeThis } from '../../src/platform/supports/workedExample/practiceLikeThis.js';
import { buildSimilarWorkedExample } from '../../src/platform/supports/workedExample/similarProblem.js';
import { isChoiceOnlyQuestion } from '../../functions/shared/attemptPolicy.mjs';
import inverseLesson from '../../teacher-import-jsons/algebra2-honors-module1/L3_Inverse_Linear_Functions.json';
import transformationsLesson from '../../teacher-import-jsons/algebra2-honors-module1/L2_Day2_Transformations.json';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';
MathfieldElement.soundsDirectory = null;

const params = new URLSearchParams(window.location.search);
const role = params.get('role') || 'classwork';
const which = params.get('q') || 'inverse';
const hostAllows = params.get('host') !== '0';
const run = params.get('run') || 'manual';
const policy = getEffectiveActivityPolicy(role);

const practiceLike = (lesson) => compileAuthoringIntentV5(lesson).package.sections
  .filter((section) => ['classwork', 'practice'].includes(section.role))
  .flatMap((section) => section.questions);

const QUESTIONS = {
  // A typed item ("If f(a) = b, …f⁻¹…") whose sibling can be checked.
  inverse: () => practiceLike(inverseLesson).find((question) => buildPracticeLikeThis(question)?.checkable
    && (question.answerFields || []).length >= 1 && question.answerFields.every((field) => !Array.isArray(field.options))),
  // A choice-only transformation item, with an authored reason per option.
  choice: () => {
    const question = practiceLike(transformationsLesson).find((entry) => isChoiceOnlyQuestion(entry));
    const [first, ...rest] = question.answerFields;
    const optionRationales = Object.fromEntries(first.options.map((option) => [option, option === first.answer
      ? `Right: ${option} is what the rule does to every point.`
      : `Not ${option}: read the rule inside the bracket the other way round.`]));
    return { ...question, answerFields: [{ ...first, optionRationales }, ...rest] };
  },
};
const question = QUESTIONS[which]();
const maximumAttempts = resolveQuestionMaximumAttempts({ question, maximumAttempts: policy.attempts, activityPolicy: policy });
const hintSibling = buildSimilarWorkedExample(question, { seed: 0 });
const practice = buildPracticeLikeThis(question, { seed: 0, avoidPrompts: hintSibling ? [hintSibling.prompt] : [] });
window.__mmPractice = practice ? { prompt: practice.prompt, parts: practice.parts, answer: practice.answer } : null;
window.__mmAnswers = (question.answerFields || []).map((field) => ({ id: field.id, label: field.label || field.id, answer: String(field.answer ?? ''), options: field.options || null }));
window.__mmGrades = [];

function Harness() {
  const [record, setRecord] = useState(emptyQuestionRecord());
  const onGrade = async (isCorrect, details, parts, supportUsage, responseKey, meta) => {
    window.__mmGrades.push({ isCorrect, parts });
    const outcome = recordQuestionAttempt({ record, isCorrect, questionDetails: details, parts, supportUsage, responseKey, partialCreditPercent: meta?.partialCreditPercent, maximumAttempts });
    setRecord(outcome.record);
    return outcome.result;
  };
  return (
    <div className="mathmaster-assignment-screen" data-after-last-miss={which} style={{ fontFamily: '"Segoe UI", sans-serif', minHeight: '100vh', padding: 12 }}>
      <main className="mathmaster-question-stage" style={{ maxWidth: 1120, margin: '0 auto', background: 'var(--mm-surface)', borderRadius: 12, padding: 10 }}>
        <QuestionEngine
          question={question}
          questionRecord={record}
          maximumAttempts={maximumAttempts}
          activityRole={role}
          practiceLikeThisAllowed={hostAllows && ['classwork', 'practice'].includes(role)}
          dolMode={role === 'dol'}
          generationKey={`after-last-miss-${which}|student-a|0|variant:0`}
          draftKey={`after-last-miss-${role}-${which}-${run}`}
          assignmentId={`after-last-miss-${which}`}
          executionScope="student"
          studentProfile={{ accommodations: ['text-to-speech'] }}
          onGrade={onGrade}
        />
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);

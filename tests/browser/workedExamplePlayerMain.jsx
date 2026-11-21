// The worked-example player (WE-A), on the authoring guide's example lesson,
// mounted in the real QuestionEngine the way the student's assignment screen
// mounts a question. Driven by tests/browser/workedExamplePlayer.mjs.
//
// The lesson (tests/platform/fixtures/learningSupportsLessonFragment.json) is
// compiled as the Assignment Creator compiles it, then put through the shape
// an assignment is STORED in (canonicalV5PersistencePatch) and read back as
// the student's screen reads it, so the page shows what a real assignment
// would: an example id on a question, and the `lessonSupports` entry it names
// on the stored assignment.
//
//   ?q=<questionId>     ls-cw-1 … ls-cw-5, ls-pr-1, ls-dol-1 (default ls-cw-4)
//   ?as=<role>          the role the question RUNS under, where it is not the
//                       section's own (a DOL replayed as practice after its due date)
//   ?support=translate  Read aloud and Translate (Spanish); ?support=read  Read aloud
//   ?tries=<n>          the record already has n missed tries
//   ?run=<id>           a fresh draft namespace; the same id reopens the same question
//
// Graded submissions (with the support use recorded) land on window.__mmGrades;
// what the page mounted on window.__mmExample.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import { canonicalV5PersistencePatch, getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { getEffectiveActivityPolicy, resolveQuestionActivityRole } from '../../src/platform/policies/activityPolicies.js';
import lessonSource from '../platform/fixtures/learningSupportsLessonFragment.json';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';
MathfieldElement.soundsDirectory = null;

const params = new URLSearchParams(window.location.search);
const which = params.get('q') || 'ls-cw-4';
const run = params.get('run') || 'manual';
const tries = Math.max(0, Number(params.get('tries')) || 0);
const SUPPORT_PROFILES = {
  translate: { accommodations: ['text-to-speech', 'translation'], translationLanguage: 'es' },
  read: { accommodations: ['text-to-speech'] },
};
const studentProfile = SUPPORT_PROFILES[params.get('support')] || {};

const compiled = parseAssignmentBlueprintText(JSON.stringify(lessonSource));
const stored = { id: `worked-example-${run}`, ...canonicalV5PersistencePatch(compiled.assignmentV5) };
const questions = getStoredAssignmentQuestions(stored);
const index = questions.findIndex((question) => question.questionId === which);
const question = questions[index] || null;
const sectionRoles = questions.map((entry) => resolveQuestionActivityRole({ question: entry, assignment: stored }));
const sectionRole = sectionRoles[index] || 'practice';
const runningRole = params.get('as') || sectionRole;
const policy = getEffectiveActivityPolicy(runningRole);
const workedExampleLesson = { questions, index, sectionRoles, lessonSupports: stored.lessonSupports || null };

window.__mmGrades = [];
window.__mmExample = { which, index, sectionRole, runningRole, storedLessonSupports: Boolean(stored.lessonSupports), exampleField: question?.example ?? null };

const draftKey = buildQuestionDraftKey({ studentId: 'worked-example-student', assignmentId: stored.id, questionIndex: index, variantIndex: 0, sessionMode: 'graded' });
const questionRecord = tries ? { status: 'attempted', attemptCount: tries } : { status: 'unattempted', attemptCount: 0 };

function Harness() {
  if (!question) return <p role="alert">Unknown question {which}.</p>;
  return (
    <main className="mathmaster-question-stage" style={{ maxWidth: 1360, margin: '0 auto', padding: 12, fontFamily: 'system-ui' }} data-worked-example-fixture={which} data-section-role={sectionRole} data-running-role={runningRole}>
      <QuestionEngine
        key={`${which}-${runningRole}-${run}`}
        question={question}
        questionRecord={questionRecord}
        generationKey={`${stored.id}|${which}`}
        activityRole={runningRole}
        activityPolicy={policy}
        workedExampleLesson={workedExampleLesson}
        practiceLikeThisAllowed={['classwork', 'practice'].includes(sectionRole)}
        maximumAttempts={policy.attempts ?? 3}
        draftKey={draftKey}
        assignmentId={stored.id}
        executionScope="student"
        partByPart
        studentProfile={studentProfile}
        onStepGrade={() => null}
        onGrade={async (isCorrect, details, parts, supportUsage, responseKey, extra) => {
          window.__mmGrades.push({ isCorrect, details, parts, partialCreditPercent: extra?.partialCreditPercent ?? null, supportUsage: JSON.parse(JSON.stringify(supportUsage ?? null)) });
          return { isCorrect, status: isCorrect ? 'correct' : 'attempted', attemptCount: tries + window.__mmGrades.length, remainingAttempts: Math.max(0, 3 - tries - window.__mmGrades.length) };
        }}
      />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);

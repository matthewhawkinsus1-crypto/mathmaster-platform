// A QUESTION CLOSED FROM ANOTHER TAB SHOWS WHAT WAS RECORDED.
//
// The real QuestionEngine and its real draft persistence, with a question
// record shared by every tab of the browser — the harness analogue of the
// Firestore snapshot listener App.jsx feeds `questionRecord` from. A Submit in
// one tab records the attempt (the shared attempt policy, exactly as App.jsx
// applies it) and every other tab with the question open receives the new
// record through a `storage` event, as it would receive a snapshot.
//
// The question is the QA round 2 DOL item, "Solve 5x − 5 = 20." — one typed
// answer, one attempt, feedback after submit — compiled through the teacher
// import chain like studentUxPlatformMain.jsx.
//
// Driven by tests/browser/staleTabRecord.mjs.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections } from '../../src/platform/contract/assignmentSchemaV5.js';
import { recordQuestionAttempt } from '../../src/attemptPolicy.js';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';

const params = new URLSearchParams(window.location.search);
const RUN = params.get('run') || 'a';
const ASSIGNMENT = 'stale-tab-record';
const STUDENT = `stale-tab-student-${RUN}`;
const RECORD_KEY = `stale-tab-record:${RUN}:record`;
const GRADES_KEY = `stale-tab-record:${RUN}:grades`;

const BLUEPRINT = {
  schemaVersion: 5,
  assignment: { title: 'Stale tab record', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  sections: [{
    id: 'stale-dol',
    role: 'dol',
    title: 'DOL',
    feedbackMode: 'afterSubmit',
    attemptsAllowed: 1,
    questions: [{
      questionId: 'stale-dol-solve',
      standard: 'A.5A',
      alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary' }],
      prompt: 'Solve 5x − 5 = 20.',
      studentActions: ['multipleResponses'],
      responses: [{ id: 'x', label: 'x =', answer: '5' }],
    }],
  }],
};

const compileQuestion = () => {
  const parsed = parseAssignmentBlueprintText(JSON.stringify(BLUEPRINT));
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  if (!model.isValid) throw new Error(`Preflight rejected the assignment:\n${model.errors.join('\n')}`);
  return validateAssignmentQuestions(flattenV5Sections(model.assignmentV5), {})[0];
};
const QUESTION = compileQuestion();
const DRAFT_KEY = buildQuestionDraftKey({
  studentId: STUDENT, assignmentId: ASSIGNMENT, questionIndex: 0, variantIndex: 0, sessionMode: 'graded',
});

const readJson = (key) => {
  try { return JSON.parse(window.localStorage.getItem(key)); } catch { return null; }
};

// Every value written to this question's drafts, in order, by any tab — so the
// driver can prove a value was NEVER stored, not just that it is not stored now.
const DRAFT_LOG_KEY = `stale-tab-record:${RUN}:draft-log`;
const nativeSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = function setItem(key, value) {
  nativeSetItem.call(this, key, value);
  if (this === window.localStorage && String(key).includes(STUDENT) && key !== DRAFT_LOG_KEY) {
    const log = readJson(DRAFT_LOG_KEY) || [];
    log.push({ key: String(key), value: String(value) });
    nativeSetItem.call(this, DRAFT_LOG_KEY, JSON.stringify(log));
  }
};

function Harness() {
  const [record, setRecord] = useState(() => readJson(RECORD_KEY));
  useEffect(() => {
    // The other tab's Submit, arriving like a Firestore snapshot.
    const onStorage = (event) => {
      if (event.key === RECORD_KEY) setRecord(readJson(RECORD_KEY));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <div className="mathmaster-assignment-screen" style={{ fontFamily: '"Segoe UI", sans-serif', backgroundColor: '#f0f2f5', minHeight: '100vh', padding: 20 }}>
      <div className="mathmaster-assignment-shell" style={{ maxWidth: 1120, margin: '0 auto' }}>
        <main className="mathmaster-question-stage" data-record-status={record?.status || 'none'} style={{ background: 'var(--mm-surface)', borderRadius: 12, padding: 10, minHeight: 500 }}>
          <QuestionEngine
            key={`${ASSIGNMENT}-${QUESTION.questionId}`}
            question={QUESTION}
            questionRecord={record}
            generationKey={`${ASSIGNMENT}|${STUDENT}|0|variant:0`}
            onGrade={(isCorrect, details, parts, supportUsage, responseKey, meta) => {
              const outcome = recordQuestionAttempt({
                record: readJson(RECORD_KEY),
                isCorrect,
                questionDetails: details,
                parts,
                supportUsage,
                responseKey,
                partialCreditPercent: meta?.partialCreditPercent,
                maximumAttempts: 1,
              });
              const grades = readJson(GRADES_KEY) || [];
              grades.push({ isCorrect, responseKey, parts });
              window.localStorage.setItem(GRADES_KEY, JSON.stringify(grades));
              window.localStorage.setItem(RECORD_KEY, JSON.stringify(outcome.record));
              setRecord(outcome.record);
              return outcome.result;
            }}
            onStepGrade={() => {}}
            studentProfile={{}}
            activityRole="dol"
            dolMode
            maximumAttempts={1}
            draftKey={DRAFT_KEY}
            assignmentId={ASSIGNMENT}
            executionScope="student"
            onNextQuestion={null}
            sectionLabel="DOL 1"
          />
        </main>
      </div>
    </div>
  );
}

window.__staleTab = {
  draftKey: DRAFT_KEY,
  record: () => readJson(RECORD_KEY),
  grades: () => readJson(GRADES_KEY) || [],
  draftLog: () => readJson(DRAFT_LOG_KEY) || [],
  drafts: () => {
    const drafts = {};
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.includes(STUDENT)) drafts[key] = window.localStorage.getItem(key);
    }
    return drafts;
  },
};

createRoot(document.getElementById('root')).render(<Harness />);

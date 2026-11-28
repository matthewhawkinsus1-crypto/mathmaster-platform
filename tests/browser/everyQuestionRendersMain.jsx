// EVERY QUESTION OF EVERY PUBLISHED LESSON, IN THE STUDENT RUNNER.
// Driven by tests/browser/everyQuestionRenders.mjs.
//
// Every lesson file under teacher-import-jsons/ is read as text and taken
// through the path a teacher's import takes to a student's screen:
//
//   parseAssignmentBlueprintText            (the teacher import)
//   buildPreflightReviewedAssignmentV5      (Pre-Flight, no teacher edits)
//   canonicalV5PersistencePatch             (what Create writes)
//   prepareAssignmentForRuntime             (what App.jsx hands the runner)
//   getStoredAssignmentQuestions            (each question, with its section's role)
//
// and each question is mounted in the real QuestionEngine the way
// assignmentWorkspaceView.jsx mounts it: keyed per question, the section's
// role as its activity role, a DOL in DOL mode, part by part, the lesson
// around it, and a Question Family question given the seat a student's
// device would build (buildStudentFamilyContext).
//
//   window.__mmEveryQuestion.lessons()          [{ file, title, questions: [{ id, role, type }] }]
//   window.__mmEveryQuestion.show(file, index, { everyPart })
//                                               mount one question; resolves when React has committed.
//                                               everyPart: the student has the "every part at once"
//                                               accommodation, so a multi-part question shows all its
//                                               parts (its later parts' labels are on screen too).
//
// Nothing here reaches Firebase: the engine's grading callback stays local.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MathfieldElement } from 'mathlive';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { ASSIGNMENT_NAV_HEIGHT_VAR, stickyHeightRef } from '../../src/platform/layout/stickyHeightRef.js';
import { emptyQuestionRecord, recordQuestionAttempt } from '../../src/attemptPolicy.js';
import { getEffectiveActivityPolicy } from '../../src/platform/policies/activityPolicies.js';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import {
  canonicalV5PersistencePatch,
  getStoredAssignmentQuestions,
  prepareAssignmentForRuntime,
} from '../../src/platform/contract/storedAssignmentV5.js';
import { buildStudentFamilyContext } from '../../src/platform/generation/familyDelivery.js';
import '../../src/index.css';
import '../../src/App.css';

MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';
MathfieldElement.soundsDirectory = null;

// Every lesson file, as the raw text a teacher pastes or uploads.
const SOURCES = import.meta.glob('../../teacher-import-jsons/**/*.json', { query: '?raw', import: 'default', eager: true });

const STUDENT_ID = 'render-audit-student';
const NO_SUPPORTS = {};
const EVERY_PART = { accommodations: ['every-part-at-once'] };
const CLASS_ID = 'render-audit-class';

const compileLesson = (key, text) => {
  const file = key.replace(/^(\.\.\/)+/, '');
  try {
    const parsed = parseAssignmentBlueprintText(text);
    const reviewed = buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {});
    const id = `render-audit-${file.replace(/[^A-Za-z0-9]+/g, '-')}`.slice(0, 120);
    const stored = { id, ...canonicalV5PersistencePatch(reviewed) };
    const assignment = { ...prepareAssignmentForRuntime(stored, { source: 'activeAssignmentPlayer' }).assignment, id };
    const questions = getStoredAssignmentQuestions(assignment);
    return { file, title: assignment.title || '', assignment, questions, error: null };
  } catch (error) {
    return { file, title: '', assignment: null, questions: [], error: String(error?.stack || error) };
  }
};

const LESSONS = Object.entries(SOURCES)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, text]) => compileLesson(key, text));
const BY_FILE = new Map(LESSONS.map((lesson) => [lesson.file, lesson]));

const listeners = new Set();
let current = null;
let committed = null;

window.__mmEveryQuestion = {
  lessons: () => LESSONS.map((lesson) => ({
    file: lesson.file,
    title: lesson.title,
    error: lesson.error,
    questions: lesson.questions.map((question, index) => ({
      index,
      id: String(question.questionId || question.id || `#${index}`),
      role: question.activityRole || null,
      type: question.type || null,
      family: Boolean(question.questionFamily),
    })),
  })),
  show: (file, index, { everyPart = false } = {}) => new Promise((resolve, reject) => {
    const lesson = BY_FILE.get(file);
    if (!lesson || !lesson.questions[index]) {
      reject(new Error(`no question ${file}#${index}`));
      return;
    }
    const scene = { file, index, everyPart, nonce: `${file}#${index}#${everyPart ? 'all' : 'one'}#${Date.now()}` };
    committed = (nonce) => { if (nonce === scene.nonce) resolve(scene.nonce); };
    current = scene;
    listeners.forEach((notify) => notify(scene));
  }),
};

// What the student section is called on its tab, and its policy.
const sectionPolicy = (role) => getEffectiveActivityPolicy(role || 'classwork');

function QuestionScene({ scene }) {
  const lesson = BY_FILE.get(scene.file);
  const question = lesson.questions[scene.index];
  const role = question.activityRole || 'classwork';
  const policy = sectionPolicy(role);
  const [record, setRecord] = useState(emptyQuestionRecord());
  useEffect(() => { committed?.(scene.nonce); }, [scene.nonce]);
  const familyContext = buildStudentFamilyContext({
    assignment: lesson.assignment,
    question,
    storageIndex: scene.index,
    studentId: STUDENT_ID,
    classId: CLASS_ID,
    record,
    store: null,
  });
  const onGrade = async (isCorrect, details, parts, supportUsage, responseKey, meta) => {
    const outcome = recordQuestionAttempt({ record, isCorrect, questionDetails: details, parts, supportUsage, responseKey, partialCreditPercent: meta?.partialCreditPercent, maximumAttempts: policy.attempts });
    setRecord(outcome.record);
    return outcome.result;
  };
  return (
    <QuestionEngine
      question={question}
      questionRecord={record}
      maximumAttempts={policy.attempts}
      activityRole={role}
      dolMode={role === 'dol'}
      practiceLikeThisAllowed={['classwork', 'practice'].includes(role)}
      generationKey={`${lesson.assignment.id}|${STUDENT_ID}|${scene.index}|variant:0`}
      familyContext={familyContext}
      draftKey={`every-question-${scene.nonce}`}
      assignmentId={lesson.assignment.id}
      executionScope="student"
      studentProfile={scene.everyPart ? EVERY_PART : NO_SUPPORTS}
      partByPart
      lessonQuestions={lesson.questions}
      lessonGiven={lesson.questions.map((_, index) => index).join()}
      lessonSupports={lesson.assignment.lessonSupports || null}
      onGrade={onGrade}
      onAskTeacher={() => {}}
      onNextQuestion={() => {}}
    />
  );
}

class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { window.__mmBoundaryErrors = [...(window.__mmBoundaryErrors || []), String(error?.message || error)]; }
  render() {
    if (this.state.error) return <div role="alert" data-harness-boundary>{String(this.state.error?.message || this.state.error)}</div>;
    return this.props.children;
  }
}

function Harness() {
  const [scene, setScene] = useState(current);
  useEffect(() => {
    listeners.add(setScene);
    return () => listeners.delete(setScene);
  }, []);
  const lesson = scene ? BY_FILE.get(scene.file) : null;
  const question = lesson ? lesson.questions[scene.index] : null;
  const roleLabel = { warmup: 'Warm-Up', classwork: 'Classwork', practice: 'Practice', dol: 'DOL', test: 'Test' }[question?.activityRole] || 'Classwork';
  return (
    <div className="mathmaster-assignment-screen" data-every-question={scene ? scene.nonce : 'idle'} style={{ fontFamily: '"Segoe UI", sans-serif', minHeight: '100vh', padding: 12 }}>
      {/* The shell App.jsx renders around a question (see feedbackTeachesMain.jsx). */}
      <div className="mathmaster-assignment-shell" style={{ maxWidth: 1120, margin: '0 auto' }}>
        <nav ref={stickyHeightRef(ASSIGNMENT_NAV_HEIGHT_VAR)} className="mathmaster-assignment-unified-nav" aria-label="Assignment questions" style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0' }}>
          <span style={{ padding: '6px 10px', borderRadius: 999, background: '#174ea6', color: '#fff', fontWeight: 800, fontSize: 12 }}>{roleLabel} Q{scene ? scene.index + 1 : 1}</span>
        </nav>
        <main className="mathmaster-question-stage" style={{ background: 'var(--mm-surface)', borderRadius: 12, padding: 10 }}>
          {scene ? (
            // The outer boundary is the harness's own: an error that reaches
            // it got past every boundary the platform has (a finding).
            <Boundary key={scene.nonce}>
              <QuestionScene scene={scene} />
            </Boundary>
          ) : <p>idle</p>}
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);

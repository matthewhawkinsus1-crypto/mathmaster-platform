// The staged function-characteristics question, met the way a student meets
// each of its steps, so the two things unit tests cannot see can be measured:
//
//   1. Does each stage fit — prompt AND answer control on screen together —
//      on a phone, a phone held sideways, and a Chromebook?
//   2. Does any coordinate readout survive on the stages that ask a student to
//      MARK a feature they will later have to write down?
//
// The WHOLE question is mounted in the real QuestionEngine, inside the screen
// App.jsx gives a signed-in student: the identity bar, the assignment screen,
// shell and navigator, and the question stage. That is what gives a step its
// phone container (MobileViewportContainer's mode-portrait / mode-landscape
// rules: one viewport, a scrolling workspace, a plane above its point cards
// instead of beside them), its Work View host and the focus-mode chrome of a
// seventeen-step question. Mounting WorkflowRunner alone in a bare div kept
// the desktop two-column plotting grid on a 390px phone and drew a 98×70px
// plane.
//
// The answers to the steps before it are put in the question's draft, where
// WorkflowRunner keeps them, so a step can be reached from the one before it
// without answering everything earlier by hand. stagedQuestion.mjs then
// arrives at the step the way a student does: "Next step".
//
//   window.__mmStaged({ id, run, question, responses, stageId, openAt })
//     opens the question with `responses` answered and the step `openAt` (an
//     id) current, and returns { stageIndex, openIndex, total }: where
//     `stageId` sits among the steps a student is asked once those answers
//     are in, and the count the runner shows — the most steps the question
//     can still ask (#517: "1 of 17" from the start, not "1 of 12" until a
//     yes/no step reveals its follow-ups).
//
// HOW TO RUN: see tests/browser/stagedQuestion.mjs.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import StudentIdentityBar from '../../src/components/student/StudentIdentityBar.jsx';
import { writeQuestionDraft } from '../../src/questionDraftStorage.js';
import { activeStages, projectedStageCount, readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import { ASSIGNMENT_NAV_HEIGHT_VAR, stickyHeightRef } from '../../src/platform/layout/stickyHeightRef.js';
import '../../src/index.css';
import '../../src/App.css';

const listeners = new Set();
let current = null;

window.__mmStaged = (scene) => {
  const draftKey = `staged-audit:${scene.run || 'run'}:${scene.id}`;
  const responses = scene.responses || {};
  // The steps a student is asked once these answers are in: a branch whose
  // controlling choice is not answered yet is not a step yet.
  const { workflow } = readComposedQuestion(scene.question);
  const steps = activeStages(workflow, responses);
  const stageIndex = steps.findIndex((stage) => stage.id === scene.stageId);
  const openIndex = steps.findIndex((stage) => stage.id === (scene.openAt || scene.stageId));
  writeQuestionDraft(`${draftKey}:workflow-responses`, responses);
  writeQuestionDraft(`${draftKey}:workflow-stage`, Math.max(0, openIndex));
  current = { ...scene, draftKey };
  listeners.forEach((listen) => listen(current));
  return { stageIndex, openIndex, total: Math.max(steps.length, projectedStageCount(workflow, responses)) };
};

const SECTIONS = [
  { label: 'Warm-up', progress: '3/3' },
  { label: 'Classwork', progress: '1/4', active: true },
  { label: 'Practice', progress: '0/6' },
  { label: 'DOL', progress: '0/1' },
];

const QUESTION_PICKER = (
  <select aria-label="Choose a question" defaultValue="2">
    {[1, 2, 3, 4].map((number) => <option key={number} value={String(number)}>Classwork Q{number}</option>)}
  </select>
);

// App.jsx's assignment navigator, with the same classes and rows: what sits
// above the question on every screen size. Like App.jsx since pass 3 (RUN-7,
// "THE NAVIGATOR STARTS COMPACT, ON EVERY SIZE"), a question opens under its
// one-row form; "Show progress" opens the section tabs and question numbers,
// and "Focus view" folds them again. The phone's status chip (NAV-5) and
// Overview sit in the row in both forms, as in App.jsx. (This copy used to
// start full and fold only once the work reached the top of the screen, as
// App.jsx did before RUN-7. With CI's wider system font that full form put
// the first step of the question below a phone's fold.)
function Navigator() {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <nav ref={stickyHeightRef(ASSIGNMENT_NAV_HEIGHT_VAR)} className={`mathmaster-assignment-unified-nav${collapsed ? ' is-collapsed' : ''}`} aria-label="Assignment navigation">
      <div className="mathmaster-assignment-unified-top">
        <button type="button" className="mathmaster-unified-nav-back" aria-label="Back to dashboard">←</button>
        {collapsed ? (
          <>
            <div className="mathmaster-collapsed-current-location" role="status">
              <strong>Classwork</strong>
              <span className="mathmaster-location-long">Question 2 of 4</span>
              <span className="mathmaster-location-short" aria-hidden="true">Q2 of 4</span>
            </div>
            <div className="mathmaster-unified-question-controls mathmaster-focus-inline-controls">
              <button type="button" aria-label="Previous question">‹ <span>Previous</span></button>
              {QUESTION_PICKER}
              <button type="button" className="mathmaster-unified-next" aria-label="Next question"><span>Next</span> ›</button>
            </div>
          </>
        ) : (
          <div className="mathmaster-section-tabs" role="list" aria-label="Assignment sections">
            {SECTIONS.map((section) => (
              <button key={section.label} type="button" role="listitem" className={`mathmaster-section-tab${section.active ? ' is-active' : ''}`} aria-current={section.active ? 'page' : undefined}>
                <span className="mathmaster-section-tab-copy">
                  <span className="mathmaster-section-tab-label">{section.label}</span>
                  <small>{section.progress}</small>
                </span>
              </button>
            ))}
          </div>
        )}
        <button type="button" className="mathmaster-assignment-status-chip is-more" aria-expanded="false">
          More <span aria-hidden="true">▾</span>
        </button>
        <button type="button" className="mathmaster-overview-button" aria-expanded="false">
          <span className="mathmaster-overview-button-label">Overview</span> ▾
        </button>
        <button type="button" className="mathmaster-focus-view-button" aria-expanded={!collapsed} onClick={() => setCollapsed((current) => !current)}>
          {collapsed ? 'Show progress' : 'Focus view'}
        </button>
      </div>
      {!collapsed && (
      <div className="mathmaster-assignment-unified-bottom">
        <div className="mathmaster-current-section-inline">
          <div className="mathmaster-current-section-summary">
            <strong>Classwork</strong>
            <span>1 of 4 complete · 3 remaining</span>
            <small>Question 2 of 4 · In progress</small>
            <small style={{ marginTop: 2, fontWeight: 900 }}>Classwork section score 25% · 1/4 answered</small>
            <small style={{ marginTop: 2, fontWeight: 850 }}>Current grade 25% if submitted now</small>
          </div>
          <div className="mathmaster-question-number-strip" aria-label="Classwork questions">
            {[1, 2, 3, 4].map((number) => (
              <button key={number} type="button" className={`mathmaster-question-number${number === 2 ? ' is-current' : ''}${number === 1 ? ' is-correct' : ''}`} aria-current={number === 2 ? 'step' : undefined} aria-label={`Classwork question ${number}`}>
                {number}
              </button>
            ))}
          </div>
        </div>
        <div className="mathmaster-unified-question-controls">
          <button type="button" aria-label="Previous question">‹ <span>Previous</span></button>
          {QUESTION_PICKER}
          <button type="button" className="mathmaster-unified-next" aria-label="Next question"><span>Next</span> ›</button>
        </div>
      </div>
      )}
    </nav>
  );
}

function Harness() {
  const [scene, setScene] = useState(current);
  useEffect(() => { listeners.add(setScene); return () => listeners.delete(setScene); }, []);
  if (!scene) return <div data-staged-idle="1">idle</div>;
  return (
    // renderStudentIdentityShell, then the screen, shell, navigator and
    // question stage App.jsx renders around every assignment question.
    <div data-authenticated-student-shell="student" style={{ minHeight: '100vh' }} data-staged-id={scene.id}>
      <StudentIdentityBar
        student={{ firstName: 'Staged', lastName: 'Audit Student', classPeriod: '3' }}
        classPointsBalance={120}
        onLogout={() => {}}
      />
      <div className="mathmaster-assignment-screen" style={{ padding: 20 }}>
        <div className="mathmaster-assignment-shell" style={{ maxWidth: '1120px', margin: '0 auto' }}>
          <Navigator key={scene.draftKey} />
          <main className="mathmaster-question-stage" style={{ background: 'var(--mm-surface)', borderRadius: '12px', padding: '10px', minHeight: '500px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
            <QuestionEngine
              key={scene.draftKey}
              question={scene.question}
              questionRecord={null}
              generationKey={scene.draftKey}
              draftKey={scene.draftKey}
              onGrade={() => null}
              onStepGrade={() => {}}
              studentProfile={{}}
              activityRole="classwork"
              maximumAttempts={3}
              assignmentId="staged-audit"
              executionScope="student"
            />
          </main>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);

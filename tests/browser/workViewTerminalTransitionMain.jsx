import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { SAMPLE_SPECS } from '../../src/dev/MathToolsLab.jsx';
import '../../src/index.css';
import '../../src/App.css';

let control = null;
window.__mmTerminalLifecycle = (next) => control?.(next);

function Harness() {
  const [scene, setScene] = useState({ index: 1, status: 'unattempted', sectionComplete: false, assignmentLocked: false });
  useEffect(() => { control = setScene; return () => { control = null; }; }, []);
  const question = {
    ...SAMPLE_SPECS.openSortBoard,
    id: `terminal-question-${scene.index}`,
    questionId: `terminal-question-${scene.index}`,
    type: 'openSortBoard',
    prompt: `Sort the functions for question ${scene.index}.`,
    requireGroupNames: true,
  };
  const record = {
    status: scene.status,
    attemptCount: scene.status === 'expired' ? 3 : scene.status === 'attempted' ? 1 : 0,
    variantIndex: 0,
  };
  const advance = () => setScene((current) => ({ ...current, index: current.index + 1, status: 'unattempted', sectionComplete: false, assignmentLocked: false }));
  return <main className="app-container" data-terminal-question={scene.index}>
    <QuestionEngine
      question={question}
      generationKey={`terminal-${scene.index}`}
      questionRecord={record}
      onGrade={() => {}}
      onStepGrade={() => {}}
      maximumAttempts={3}
      assignmentLocked={scene.assignmentLocked}
      assignmentLockedMessage="This assignment is closed."
      activityRole="classwork"
      assignmentId="terminal-lifecycle"
      executionScope="student"
      sectionComplete={scene.sectionComplete}
      sectionLabel="Practice"
      sectionQuestionCount={1}
      onNextQuestion={advance}
      onContinueSection={advance}
      continueSectionLabel="Review"
    />
  </main>;
}

createRoot(document.getElementById('root')).render(<Harness />);

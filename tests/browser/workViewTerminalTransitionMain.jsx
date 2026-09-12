import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { SAMPLE_SPECS } from '../../src/dev/MathToolsLab.jsx';
import '../../src/index.css';
import '../../src/App.css';

let control = null;
window.__mmTerminalLifecycleReady = false;
window.__mmTerminalLifecycle = (next) => control?.(next);

const QUESTIONS = {
  simpleRegistry: {
    ...SAMPLE_SPECS.openSortBoard,
    type: 'openSortBoard',
    prompt: 'Sort the functions into their matching families.',
    requireGroupNames: true,
  },
  relationAlgebra: {
    type: 'stepAlgebra',
    prompt: 'Solve the compound inequality −7 < 2x + 1 ≤ 9.',
    equation: '-7 < 2*x + 1 <= 9',
  },
  nestedRegistry: {
    ...SAMPLE_SPECS.constraintFunctionBuilder,
    type: 'constraintFunctionBuilder',
    prompt: 'Build a function satisfying every constraint.',
  },
};

function Harness() {
  const [scene, setScene] = useState({ route: 'simpleRegistry', index: 1, status: 'unattempted', sectionComplete: false, assignmentLocked: false });
  useEffect(() => {
    control = setScene;
    window.__mmTerminalLifecycleReady = true;
    return () => {
      control = null;
      window.__mmTerminalLifecycleReady = false;
    };
  }, []);
  const question = {
    ...QUESTIONS[scene.route],
    id: `terminal-question-${scene.index}`,
    questionId: `terminal-question-${scene.index}`,
  };
  const record = {
    status: scene.status,
    attemptCount: scene.status === 'expired' ? 3 : scene.status === 'attempted' ? 1 : 0,
    variantIndex: 0,
  };
  const advance = () => setScene((current) => ({ ...current, index: current.index + 1, status: 'unattempted', sectionComplete: false, assignmentLocked: false }));
  return <main className="app-container" data-terminal-question={scene.index} data-terminal-route={scene.route}>
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

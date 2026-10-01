// Harness for tests/browser/renderStability.mjs.
//
// The real QuestionEngine, mounted the ways its hosts mount it, inside a React
// Profiler that counts commits. A host that re-renders for no reason, or a
// response module that re-reports unchanged work, shows up as commits during a
// window in which nobody touched anything. `window.__mmTick()` re-renders the
// host the way App's 30-second clock or a Firestore snapshot does.
import { Profiler, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import '../../src/App.css';

window.__mmCommits = 0;
window.__mmHostRenders = 0;

const SCENES = {
  // Hosted like the Live Challenge round: inline server grading and a response
  // callback that stores what it receives in host state.
  serverGradedInlineHost: {
    question: { type: 'literal', prompt: 'What is 3 + 4?', correctAnswer: '7', questionId: 'render-literal' },
    host: 'challengeRound',
  },
  // An imported system without `equationsLatex`.
  systemWithoutEquations: {
    question: { type: 'system', prompt: 'Solve the system.', solution: { x: 1, y: 2 }, questionId: 'render-system' },
  },
  // A multi-answer item without `answerFields`.
  multiAnswerWithoutFields: {
    question: { type: 'multiAnswer', prompt: 'Answer each part.', questionId: 'render-multi' },
  },
  // A graph question with neither `graph` nor `functionSpec`.
  graphWithoutSpec: {
    question: { type: 'graphAnalysis', prompt: 'Read the graph.', questionId: 'render-graph' },
  },
  // A composed question whose only step is the balance workspace.
  composedAlgebraStage: {
    question: {
      type: 'workflow',
      questionId: 'render-composed-algebra',
      prompt: 'Solve 2x + 3 = 11.',
      content: { equation: '2x+3=11' },
      workflow: [{ id: 'solve', kind: 'algebraWorkspace', prompt: 'Solve for x.', equation: '2x+3=11' }],
      grading: { solve: { expected: 'x=4' } },
    },
  },
};

function ChallengeRoundLikeHost({ question, tick }) {
  const [, setRaw] = useState(null);
  window.__mmHostRenders += 1;
  return (
    <QuestionEngine
      question={question}
      questionRecord={{ status: 'unattempted', attemptCount: 0 }}
      draftKey={`render-stability-${question.questionId}`}
      data-tick={tick}
      serverGrading={{ pathToolId: 'algebra', submit: async () => null }}
      onResponseStateChange={(raw) => setRaw(raw)}
    />
  );
}

function PlainHost({ question, tick }) {
  window.__mmHostRenders += 1;
  const onGrade = useCallback(async () => null, []);
  return (
    <QuestionEngine
      question={question}
      questionRecord={{ status: 'unattempted', attemptCount: 0 }}
      draftKey={`render-stability-${question.questionId}`}
      onGrade={onGrade}
      data-tick={tick}
    />
  );
}

function Harness() {
  const [sceneId, setSceneId] = useState(null);
  const [tick, setTick] = useState(0);
  const mounted = useRef(false);
  useEffect(() => {
    window.__mmScene = (id) => { window.__mmCommits = 0; window.__mmHostRenders = 0; setSceneId(id); };
    window.__mmTick = () => setTick((value) => value + 1);
    mounted.current = true;
  }, []);
  if (!sceneId) return <div data-render-idle="1">idle</div>;
  const scene = SCENES[sceneId];
  const Host = scene.host === 'challengeRound' ? ChallengeRoundLikeHost : PlainHost;
  return (
    <div className="mathmaster-question-container" data-render-scene={sceneId}>
      <Profiler id={sceneId} onRender={() => { window.__mmCommits += 1; }}>
        <Host key={sceneId} question={scene.question} tick={tick} />
      </Profiler>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);

import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, region } from './helpers/sourceContract.mjs';

const engine = componentSource('src/QuestionEngine.jsx');
const runtime = componentSource('src/tools/shared/ToolRuntimeContext.jsx');
const wrapper = componentSource('src/tools/shared/RegisteredToolWorkView.jsx');
const figure = componentSource('src/components/common/EnlargeableFigure.jsx');
const lifecycle = componentSource('src/platform/question/QuestionLifecycleContext.jsx');
const mobileViewport = componentSource('src/components/student/MobileViewportContainer.jsx');

test('QuestionEngine publishes its authoritative terminal state above every tool route', () => {
  // The whole question's tree is terminal when the question is locked. The
  // only other provider is the open practice beside a closed question
  // (student pass 3: its boxes keep their keypad), which says terminal={false}.
  const questionTree = region(engine, '<QuestionLifecycleProvider terminal={locked}>', '</QuestionLifecycleProvider>', 'complete question lifecycle tree');
  assert.match(engine, /import \{ QuestionLifecycleProvider \} from/);
  assert.deepEqual(engine.match(/<QuestionLifecycleProvider terminal=\{[^}]*\}>/g), ['<QuestionLifecycleProvider terminal={false}>', '<QuestionLifecycleProvider terminal={locked}>']);
  assert.match(region(engine, '<QuestionLifecycleProvider terminal={false}>', '</QuestionLifecycleProvider>', 'the practice'), /^<QuestionLifecycleProvider terminal=\{false\}>\s*<PracticeLikeThis\b[^>]*\/>\s*$/);
  assert.match(questionTree, /\{renderModule\(\)\}/);
  assert.match(lifecycle, /terminal:\s*Boolean\(terminal\)/);
  assert.match(runtime, /questionTerminal:\s*Boolean\(questionTerminal\)/);
  assert.doesNotMatch(wrapper, /forceClosed/);
  assert.match(figure, /useQuestionLifecycle\(\)/);
  assert.match(figure, /forceClosed\s*\|\|\s*questionTerminal/);
});

test('terminal Work View close is automatic cleanup, not a saved phone dismissal', () => {
  const terminalClose = region(figure, 'useEffect(() => {\n    if (!shouldForceClose)', '}, [shouldForceClose, nestedWorkView]);', 'terminal close effect');
  // The grading close blurs (dismissing the on-screen keyboard); a NESTED
  // figure, closed by design from its first render, must not blur what the
  // student just focused elsewhere (keyboard sweep S2).
  assert.match(terminalClose, /if \(!nestedWorkView && typeof document !== 'undefined'\) document\.activeElement\?\.blur\?\.\(\);/);
  assert.match(terminalClose, /setDrawer\(null\)/);
  assert.match(terminalClose, /setEnlarged\(false\)/);
  assert.doesNotMatch(terminalClose, /writeDismissed/);

  const autoOpen = region(figure, 'const questionChanged', '// visualViewport', 'question auto-open policy');
  assert.match(autoOpen, /!shouldForceClose\s*&&\s*openEnlarged/);
});

test('every terminal outcome leaves an actionable continuation outside Work View', () => {
  const continuation = region(engine, 'locked && !sectionComplete', "{terminalFeedbackHidden", 'terminal continuation');
  assert.match(continuation, /typeof onNextQuestion === 'function'/);
  assert.match(continuation, /onClick=\{onNextQuestion\}/);
  assert.match(continuation, />Next Question</);
});


test('terminal question state dismisses the MathMaster mobile keypad before continuation', () => {
  assert.match(mobileViewport, /useQuestionLifecycle\(\)/);
  const keypadClose = region(
    mobileViewport,
    '// Terminal question state owns every input surface',
    '}, [questionTerminal]);',
    'terminal mobile keypad cleanup',
  );
  assert.match(keypadClose, /if \(!questionTerminal\) return/);
  assert.match(keypadClose, /setNumericTarget/);
  assert.match(keypadClose, /current\?\.blur/);
  assert.match(keypadClose, /mathVirtualKeyboard\?\.hide/);
});

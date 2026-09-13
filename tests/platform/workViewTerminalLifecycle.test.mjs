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
  const questionTree = region(engine, '<QuestionLifecycleProvider', '</QuestionLifecycleProvider>', 'complete question lifecycle tree');
  assert.match(engine, /import \{ QuestionLifecycleProvider \} from/);
  assert.match(questionTree, /terminal=\{locked\}/);
  assert.match(questionTree, /\{renderModule\(\)\}/);
  assert.match(lifecycle, /terminal:\s*Boolean\(terminal\)/);
  assert.match(runtime, /questionTerminal:\s*Boolean\(questionTerminal\)/);
  assert.doesNotMatch(wrapper, /forceClosed/);
  assert.match(figure, /useQuestionLifecycle\(\)/);
  assert.match(figure, /forceClosed\s*\|\|\s*questionTerminal/);
});

test('terminal Work View close is automatic cleanup, not a saved phone dismissal', () => {
  const terminalClose = region(figure, 'useEffect(() => {\n    if (!shouldForceClose)', '}, [shouldForceClose]);', 'terminal close effect');
  assert.match(terminalClose, /activeElement\?\.blur/);
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

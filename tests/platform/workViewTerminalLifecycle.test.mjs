import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, region } from './helpers/sourceContract.mjs';

const engine = componentSource('src/QuestionEngine.jsx');
const runtime = componentSource('src/tools/shared/ToolRuntimeContext.jsx');
const wrapper = componentSource('src/tools/shared/RegisteredToolWorkView.jsx');
const figure = componentSource('src/components/common/EnlargeableFigure.jsx');

test('QuestionEngine sends its authoritative editing lock through the tool runtime', () => {
  const registryRender = region(engine, '<ToolRuntimeProvider', '</ToolRuntimeProvider>', 'registry tool runtime');
  assert.match(registryRender, /questionTerminal=\{locked\}/);
  assert.match(runtime, /questionTerminal:\s*Boolean\(questionTerminal\)/);
  assert.match(wrapper, /forceClosed=\{questionTerminal\}/);
});

test('terminal Work View close is automatic cleanup, not a saved phone dismissal', () => {
  const terminalClose = region(figure, 'useEffect(() => {\n    if (!forceClosed)', '}, [forceClosed]);', 'terminal close effect');
  assert.match(terminalClose, /activeElement\?\.blur/);
  assert.match(terminalClose, /setDrawer\(null\)/);
  assert.match(terminalClose, /setEnlarged\(false\)/);
  assert.doesNotMatch(terminalClose, /writeDismissed/);

  const autoOpen = region(figure, 'const questionChanged', '// visualViewport', 'question auto-open policy');
  assert.match(autoOpen, /!forceClosed\s*&&\s*openEnlarged/);
});

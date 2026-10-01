/*
 * A REGISTRY TOOL OFFERS NO HINT WHERE THE ACTIVITY WITHHOLDS HELP.
 *
 * A DOL, quiz or test carries `hintsAllowed: false`. QuestionEngine already
 * read it for its own help (the guided coach, the graph self-check), but every
 * registry tool's HintPanel ignored it: on an exit ticket "Stuck? Show a hint"
 * still revealed the nudge, the strategy and the worked step — recorded as
 * hint use, but shown. The permission now travels to the tools through
 * ToolRuntimeContext, and every hint affordance in src/tools reads it:
 *
 *   HintPanel                       renders nothing
 *   RegisteredToolWorkView          the Work View Help drawer stops printing the
 *                                   question's authored hints (unrecorded!)
 *   Graphing2 / ConstraintFunctionBuilder / FunctionInvestigation2
 *                                   stop publishing a Help that is only hints
 *   EmbeddedStepAlgebra             Step Algebra's "Need a strategic hint?"
 *   composed questions              the mapping / number-line stage tools sit
 *                                   inside the same provider, so their hints
 *                                   (and verdicts) follow the activity too
 *
 * Node cannot render .jsx, so these are source contracts bound to the code that
 * does the work (docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md); the rendered
 * behaviour is checked in a browser by tests/browser/toolPolicyGates.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIVITY_POLICIES, ACTIVITY_ROLES } from '../../functions/shared/activityPolicies.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => readFileSync(path.join(ROOT, relative), 'utf8');
const code = (relative) => executableSource(read(relative));

test('the activities that withhold help are the ones this gate exists for', () => {
  [ACTIVITY_ROLES.DOL, ACTIVITY_ROLES.QUIZ, ACTIVITY_ROLES.TEST].forEach((role) => {
    assert.equal(ACTIVITY_POLICIES[role].hintsAllowed, false, `${role} withholds hints`);
  });
  [ACTIVITY_ROLES.PRACTICE, ACTIVITY_ROLES.CLASSWORK, ACTIVITY_ROLES.WARMUP].forEach((role) => {
    assert.equal(ACTIVITY_POLICIES[role].hintsAllowed, true, `${role} allows hints`);
  });
});

test('the runtime context carries hintsAllowed, allowed unless a provider says false', () => {
  const context = code('src/tools/shared/ToolRuntimeContext.jsx');
  const defaults = region(context, 'const DEFAULT_RUNTIME', '};', 'the default runtime');
  assert.match(defaults, /\n\s*hintsAllowed: true,/, 'a surface with no activity keeps its hints');
  const provider = region(context, 'export const ToolRuntimeProvider', ');', 'the provider');
  assert.match(provider, /hintsAllowed = true,/);
  assert.match(provider, /\n\s*hintsAllowed: hintsAllowed !== false,/);
  assert.match(context, /export const useHintsAllowed = \(\) => useContext\(ToolRuntimeContext\)\.hintsAllowed !== false;/);
});

test('QuestionEngine hands every registry tool — standalone or inside a composed question — the activity\'s hint permission', () => {
  const engine = code('src/QuestionEngine.jsx');
  assert.match(engine, /\n\s*const toolHintsAllowed = resolvedActivityPolicy\?\.hintsAllowed !== false;/);

  const registry = region(engine, 'if (missingToolDefinition) {', '</ToolRuntimeProvider>', 'the registry tool mount');
  assert.match(registry, /<ToolRuntimeProvider\s+showImmediateFeedback=\{showOutcomeFeedback && !serverGrading\}\s+hintsAllowed=\{toolHintsAllowed\}/);
  assert.match(registry, /<Tool questionData=\{presentationQuestion\}/);

  // A composed question mounts RelationMapping / IntervalNumberLine as stages.
  const composed = region(engine, 'if (isComposed) {', '</ToolRuntimeProvider>', 'the composed question mount');
  assert.match(composed, /<ToolRuntimeProvider\s+showImmediateFeedback=\{showOutcomeFeedback && !serverGrading\}\s+hintsAllowed=\{toolHintsAllowed\}\s+questionTerminal=\{locked\}\s*>\s*<WorkflowRunner\b/);
  // The provider must actually enclose the runner, not sit beside it.
  assert.ok(composed.indexOf('<ToolRuntimeProvider') < composed.indexOf('<WorkflowRunner'));
  assert.match(read('src/platform/workflow/WorkflowRunner.jsx'), /import RelationMapping from '\.\.\/\.\.\/tools\/relationMapping\/RelationMapping'/,
    'if the runner stops mounting registry tools this wrap can be revisited, not before');
});

test('HintPanel renders nothing where hints are withheld, before it renders anything else', () => {
  const shell = code('src/tools/shared/ToolShell.jsx');
  assert.match(shell, /import \{ useHintsAllowed \} from '\.\/ToolRuntimeContext';/);
  const panel = region(shell, 'export const HintPanel', 'const revealNext', 'the hint panel');
  assert.match(panel, /\n\s*const hintsAllowed = useHintsAllowed\(\);/);
  assert.match(panel, /\n\s*if \(!hintsAllowed \|\| !hints\.length\) return null;/);
});

test('the Work View Help drawer stops printing a question\'s authored hints where hints are withheld', () => {
  const view = code('src/tools/shared/RegisteredToolWorkView.jsx');
  assert.match(view, /import \{ useHintsAllowed \} from '\.\/ToolRuntimeContext';/);
  const body = region(view, 'export default function RegisteredToolWorkView', 'const capabilities', 'the work view');
  // Called before the early return, so the hook order never changes.
  assert.ok(body.indexOf('const hintsAllowed = useHintsAllowed();') > -1);
  assert.ok(body.indexOf('const hintsAllowed = useHintsAllowed();') < body.indexOf('if (!inventory'));
  assert.match(body, /const authoredHints = hintsAllowed && Array\.isArray\(questionData\?\.hints\)/);
  assert.match(body, /const helpText = authoredHints\.length\s*\?\s*authoredHints\.join\(' '\)/);
});

for (const file of [
  'src/tools/graphing2/Graphing2.jsx',
  'src/tools/constraintFunctionBuilder/ConstraintFunctionBuilder.jsx',
  'src/tools/functionInvestigation2/FunctionInvestigation2.jsx',
]) {
  test(`${path.basename(file)} publishes its hints-only Work View Help only where hints are allowed`, () => {
    const source = code(file);
    assert.match(source, /import \{ useHintsAllowed \} from '\.\.\/shared\/ToolRuntimeContext';/);
    assert.match(source, /\n\s*const hintsAllowed = useHintsAllowed\(\);/);
    const capabilities = region(source, 'const workspaceCapabilities', 'return (', 'the Work View capabilities');
    assert.match(capabilities, /\n\s*help: hintsAllowed \? \{/);
    assert.match(capabilities, /\} : null,/);
  });
}

test('the systems workspace\'s embedded Step Algebra offers no strategic hint where hints are withheld', () => {
  const mode = code('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx');
  assert.match(mode, /import \{ useHintsAllowed \} from '\.\.\/shared\/ToolRuntimeContext';/);
  const embedded = region(mode, 'export function EmbeddedStepAlgebra', 'const hostRef', 'the embedded solver');
  assert.match(embedded, /\n\s*const hintsAllowed = useHintsAllowed\(\);/);
  assert.match(embedded, /\n\s*const offerHint = showHint && hintsAllowed;/);
  assert.match(embedded, /\.\.\.\(offerHint \? \{\} : \{ showHint: false \}\),/);
  assert.match(embedded, /\[normalizedEquationText, solveFor, prompt, workspaceDifficulty, objectiveKey, requireSimplifiedFinalForm, offerHint\]/);
  // The flag it sets is the one the solver's hint reads.
  assert.match(read('src/StepByStepAlgebraCore.jsx'), /question\.showHint !== false && suggestedMove && !solved && <details/);
});

// ------------------------------------------------------------------- the guard
const toolFiles = (() => {
  const files = [];
  const walk = (directory) => readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(jsx?|mjs)$/.test(entry.name)) files.push(path.relative(ROOT, full));
  });
  walk(path.join(ROOT, 'src/tools'));
  return files;
})();

test('every hint a tool reports goes through HintPanel, so the one gate covers it', () => {
  // A tool that grows its own hint button and reports HINT_USED from it would
  // bypass the policy above. A hint reveal may be reported only by HintPanel's
  // onHintUsed, or forwarded from a nested tool's HintPanel.
  const offenders = [];
  toolFiles.forEach((file) => {
    code(file).split('\n').forEach((line, index) => {
      if (!line.includes('HINT_USED')) return;
      if (/onHintUsed/.test(line) || /if \(type === 'HINT_USED'\) onAction\?\.\(type, payload\)/.test(line)) return;
      offenders.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  });
  assert.deepEqual(offenders, [], 'HINT_USED reported outside a HintPanel — gate it with useHintsAllowed()');
});

test('a question\'s authored hints reach a student only through HintPanel or the gated Work View help', () => {
  const offenders = [];
  toolFiles.forEach((file) => {
    code(file).split('\n').forEach((line, index) => {
      if (!/questionData\??\.hints\b/.test(line)) return;
      if (/<HintPanel\s+hints=\{questionData\.hints\b/.test(line)) return;
      if (file.endsWith('RegisteredToolWorkView.jsx')) return; // pinned above: gated by hintsAllowed
      offenders.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  });
  assert.deepEqual(offenders, []);
});

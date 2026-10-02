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

  // Each provider's opening tag carries the policy, whatever order its
  // attributes are written in, and opens directly onto what it governs.
  const openingTag = (mount) => (mount.match(/<ToolRuntimeProvider\b[^>]*>/) || [''])[0];
  const governed = (tag) => {
    assert.match(tag, /\sshowImmediateFeedback=\{showOutcomeFeedback && !serverGrading\}/);
    assert.match(tag, /\shintsAllowed=\{toolHintsAllowed\}/);
    assert.match(tag, /\sonHintUsed=\{recordHintUse\}/);
    assert.match(tag, /\squestionTerminal=\{locked\}/);
  };
  // Both mounts live in renderModule. (`if (isComposed) {` also opens a branch
  // of performSubmit, earlier in the file; a region started there would read
  // whatever provider comes next — such as the solvers' own, which follows
  // showOutcomeFeedback alone — instead of the composed mount.)
  const render = region(engine, 'const renderModule = () => {', null, 'renderModule');
  const registry = region(render, 'if (missingToolDefinition) {', '</ToolRuntimeProvider>', 'the registry tool mount');
  governed(openingTag(registry));
  assert.match(registry, /<Tool questionData=\{presentationQuestion\}/);

  // A composed question mounts RelationMapping / IntervalNumberLine as stages.
  const composed = region(render, 'if (isComposed) {', '</ToolRuntimeProvider>', 'the composed question mount');
  governed(openingTag(composed));
  assert.match(composed, /<ToolRuntimeProvider\b[^>]*>\s*<WorkflowRunner\b/);
  // The provider must actually enclose the runner, not sit beside it.
  assert.ok(composed.indexOf('<ToolRuntimeProvider') < composed.indexOf('<WorkflowRunner'));
  assert.match(read('src/platform/workflow/WorkflowRunner.jsx'), /import RelationMapping from '\.\.\/\.\.\/tools\/relationMapping\/RelationMapping'/,
    'if the runner stops mounting registry tools this wrap can be revisited, not before');
});

test('HintPanel renders nothing where hints are withheld, before it renders anything else', () => {
  const shell = code('src/tools/shared/ToolShell.jsx');
  // ToolShell also reads the attempt outcome from the same context (PQ-022),
  // so the import names more than the hint permission.
  assert.match(shell, /import \{[^}]*\buseHintsAllowed\b[^}]*\} from '\.\/ToolRuntimeContext';/);
  const panel = region(shell, 'export const HintPanel', 'const revealNext', 'the hint panel');
  assert.match(panel, /\n\s*const hintsAllowed = useHintsAllowed\(\);/);
  assert.match(panel, /\n\s*if \(!hintsAllowed \|\| !hints\.length\) return null;/);
});

test('the Work View Help drawer stops printing a question\'s authored hints where hints are withheld', () => {
  const view = code('src/tools/shared/RegisteredToolWorkView.jsx');
  assert.match(view, /import \{[^}]*\buseHintsAllowed\b[^}]*\} from '\.\/ToolRuntimeContext';/);
  const body = region(view, 'export default function RegisteredToolWorkView', 'const capabilities', 'the work view');
  // Called before the early return, so the hook order never changes.
  assert.ok(body.indexOf('const hintsAllowed = useHintsAllowed();') > -1);
  assert.ok(body.indexOf('const hintsAllowed = useHintsAllowed();') < body.indexOf('if (!inventory'));
  assert.ok(body.indexOf('const reportHintUse = useHintUseReporter();') > -1);
  assert.ok(body.indexOf('const reportHintUse = useHintUseReporter();') < body.indexOf('if (!inventory'));
  assert.match(body, /const authoredHints = hintsAllowed && Array\.isArray\(questionData\?\.hints\)/);
  // Where they are allowed, they are the recorded, one-at-a-time HintPanel —
  // never the whole list printed unrecorded.
  assert.match(body, /const helpText = authoredHints\.length\s*\?\s*<HintPanel hints=\{authoredHints\} onHintUsed=\{\(\) => reportHintUse\?\.\(\)\} \/>/);
  assert.doesNotMatch(body, /authoredHints\.join/);
});

for (const file of [
  'src/tools/graphing2/Graphing2.jsx',
  'src/tools/constraintFunctionBuilder/ConstraintFunctionBuilder.jsx',
  'src/tools/functionInvestigation2/FunctionInvestigation2.jsx',
]) {
  test(`${path.basename(file)} publishes its hints-only Work View Help only where hints are allowed`, () => {
    const source = code(file);
    // Other runtime hooks may come from the same import (the constraint
    // builder also reads whether outcomes are shown); this one must.
    assert.match(source, /import \{[^}]*\buseHintsAllowed\b[^}]*\} from '\.\.\/shared\/ToolRuntimeContext';/);
    assert.match(source, /\n\s*const hintsAllowed = useHintsAllowed\(\);/);
    const capabilities = region(source, 'const workspaceCapabilities', 'return (', 'the Work View capabilities');
    assert.match(capabilities, /\n\s*help: hintsAllowed \? \{/);
    assert.match(capabilities, /\} : null,/);
  });
}

test('the systems workspace\'s embedded Step Algebra offers no strategic hint where hints are withheld', () => {
  const mode = code('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx');
  // The same import also brings the outcome policy the 2×2 interpretation
  // reads (systemsInterpretationOutcomePolicy.test.mjs).
  assert.match(mode, /import \{[^}]*\buseHintsAllowed\b[^}]*\} from '\.\.\/shared\/ToolRuntimeContext';/);
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

test('the step-algebra solver\'s strategic hint follows the same permission, and opening it is recorded', () => {
  const core = code('src/StepByStepAlgebraCore.jsx');
  const signature = region(core, 'export default function StepByStepAlgebra({', '}) {', 'the solver props');
  // The props default to allowed / no recorder...
  assert.match(signature, /\bhintsAllowed: hintsAllowedProp = true,/);
  assert.match(signature, /\bonHintUsed: onHintUsedProp = null,/);
  // ...and the permission the hint reads is the prop AND the activity's
  // runtime context, so a host that passes no props (a composed question's
  // algebra step) still follows the activity. The recorder falls back to the
  // context's too. Outside any provider the context allows hints and has no
  // recorder — the old default exactly.
  const body = region(core, '}) {', 'const normalizedRecord', 'the solver body');
  assert.match(core, /import \{ useHintsAllowed, useHintUseReporter \} from '\.\/tools\/shared\/ToolRuntimeContext';/);
  assert.match(body, /\n\s*const contextHintsAllowed = useHintsAllowed\(\);/);
  assert.match(body, /\n\s*const contextHintReporter = useHintUseReporter\(\);/);
  assert.match(body, /\n\s*const hintsAllowed = hintsAllowedProp !== false && contextHintsAllowed;/);
  assert.match(body, /\n\s*const onHintUsed = onHintUsedProp \|\| contextHintReporter;/);
  const hint = core.match(/\{([^{}\n]*)&& <details onToggle=\{\(event\) => \{ if \(event\.currentTarget\.open\) onHintUsed\?\.\(\); \}\}[^\n]*Need a strategic hint\?/);
  assert.ok(hint, 'the strategic hint reports when it is opened');
  assert.match(hint[1], /^hintsAllowed && /, 'and is not rendered at all where hints are withheld');

  // Every solver QuestionEngine mounts is handed the permission and the
  // recorder, including the one inside the intercepts orchestrator.
  const engine = code('src/QuestionEngine.jsx');
  const mounts = [...engine.matchAll(/<(StepByStepAlgebra|LinearInterceptsOrchestrator)\s/g)]
    .map((match) => engine.slice(match.index, engine.indexOf('/>', match.index)));
  assert.ok(mounts.length >= 4, `found ${mounts.length} solver mounts`);
  mounts.forEach((mount) => assert.match(mount, /\{\.\.\.stepAlgebraHintProps\}/, mount.slice(0, 60)));
  assert.match(engine, /const stepAlgebraHintProps = \{\s*hintsAllowed: toolHintsAllowed,\s*onHintUsed: recordHintUse,\s*\};/);
  assert.match(engine, /const recordHintUse = \(\) => setHintUsed\(true\);/);
  const orchestrator = code('src/LinearInterceptsOrchestrator.jsx');
  const inner = region(orchestrator, '<StepByStepAlgebraCore', '/>', 'the intercept solver');
  assert.match(inner, /hintsAllowed=\{hintsAllowed\}/);
  assert.match(inner, /onHintUsed=\{onHintUsed\}/);
});

test('the runtime context carries the hint recorder to surfaces the tool does not own', () => {
  const context = code('src/tools/shared/ToolRuntimeContext.jsx');
  assert.match(context, /onHintUsed: null,/);
  assert.match(context, /onHintUsed: typeof onHintUsed === 'function' \? onHintUsed : null,/);
  assert.match(context, /export const useHintUseReporter = \(\) => useContext\(ToolRuntimeContext\)\.onHintUsed \|\| null;/);
});

test('where hints are withheld the solver does not promise one on request', async () => {
  const { SUPPORT_LEVELS } = await import('../../src/algebraSupportLevels.js');
  const promising = SUPPORT_LEVELS.filter((level) => /Hints are available on request\./.test(level.description));
  // The sentence the solver removes is the sentence a level actually says;
  // reword it there and this fails rather than the promise quietly returning.
  assert.ok(promising.length > 0);
  const core = code('src/StepByStepAlgebraCore.jsx');
  const removed = core.match(/\{hintsAllowed \? supportPolicy\.description : supportPolicy\.description\.replace\((\/[^/]+\/), ''\)\}/);
  assert.ok(removed, 'the footnote drops the promise where hints are withheld');
  const pattern = new RegExp(removed[1].slice(1, -1));
  promising.forEach((level) => assert.doesNotMatch(level.description.replace(pattern, ''), /hint/i, level.id));
});

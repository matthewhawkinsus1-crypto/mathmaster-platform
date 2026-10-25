/*
 * WHAT THE COMPILER NOTICED WHILE READING AN IMPORT REACHES THE TEACHER (TT08).
 *
 * parseAssignmentBlueprintText returns `warnings` from the V5 compiler: a bridge
 * function whose base it cannot grade, a validation note. The import screen
 * (readAssignmentJson in TeacherWorkspace.jsx) collected the alignment,
 * specificity and semantic warnings but never these, so a question the compiler
 * had flagged as ungradable went to Assignment Review with nothing said.
 *
 * The compiler's warning is real behaviour and runs here. readAssignmentJson is
 * a closure inside a component node cannot import (other tests mirror it for the
 * same reason), so its forwarding is asserted on source, bound to the function.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { componentSource, region } from './helpers/sourceContract.mjs';

const bridgeWithBase = (base) => ({
  schemaVersion: 5,
  assignment: { title: 'Compile warning', courseId: 'algebra1' },
  sections: [{
    role: 'practice',
    title: 'Practice',
    questions: [{
      prompt: 'Use f to find the inverse.',
      studentActions: ['exponentialLogBridge'],
      mode: 'inverse',
      function: { type: 'exponential', a: 2, base },
    }],
  }],
});

test('the compiler warns that a bridge whose base cannot be graded will not be graded, and the question still imports', () => {
  const imported = parseAssignmentBlueprintText(JSON.stringify(bridgeWithBase(1)));
  assert.equal(imported.questions.length, 1, 'the question is not dropped');
  const base = imported.warnings.filter((warning) => /exponentialLogBridge function base 1 must be positive and not 1/.test(warning));
  assert.equal(base.length, 1, 'one warning, naming the question');
  assert.match(base[0], /Practice question 1/);
  // A base the bridge can grade says nothing.
  assert.deepEqual(parseAssignmentBlueprintText(JSON.stringify(bridgeWithBase(2))).warnings.filter((warning) => /exponentialLogBridge/.test(warning)), []);
});

test('the import screen collects those warnings before it decides, so every outcome carries them to Assignment Review', () => {
  const workspace = componentSource('src/app/teacher/TeacherWorkspace.jsx');
  const read = region(workspace, 'const readAssignmentJson = (rawText) => {', '// Single entry point for pasted, uploaded and dropped JSON.', 'readAssignmentJson');

  // After the file parses, before the first exit that returns the warnings.
  const parsedAt = read.indexOf('parsed = parseAssignmentBlueprintText(rawText);');
  const forwardedAt = read.search(/warnings\.push\(\.\.\.[^;\n]*\bparsed\.warnings\b[^;\n]*\);/);
  const refusedAt = read.indexOf('if (errors.length) {');
  assert.ok(parsedAt !== -1 && forwardedAt !== -1 && refusedAt !== -1, 'the pieces are all there');
  assert.ok(parsedAt < forwardedAt && forwardedAt < refusedAt, 'parse, then forward the compiler warnings, then judge');
  // Both exits that follow it hand the collected warnings back.
  assert.match(read, /return \{ ok: false, errors, warnings, parsed, sourceSchemaVersion, compilerDefect \};/);
  assert.match(read, /return \{\s*ok: true,\s*errors,\s*warnings,\s*parsed,/);

  // And the caller puts them in front of the teacher: the Review screen's
  // authoring notes on a file that opens, and on one held for repair.
  const ready = region(workspace, 'const handleAssignmentJsonReady = async', 'const handleCreateAssignment = async', 'handleAssignmentJsonReady');
  assert.match(ready, /const warnings = \[\.\.\.\(result\.warnings \|\| \[\]\), \.\.\.bankWarnings\];/);
  assert.match(ready, /openAssignmentPreflight\(\{ \.\.\.result\.parsed, authoringWarnings: warnings \}/);
  assert.match(ready, /authoringWarnings: salvageResult\.warnings/);
});

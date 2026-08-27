import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const walkSource = (dir) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkSource(full));
    else if (entry.isFile() && /\.(?:js|jsx|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
};

test('retired question schema v1 modules are gone', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'src/platform/schemas/QuestionDefinition.js')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'src/platform/validation/validatorRegistry.js')), false);
});

test('source tree cannot recreate the retired question schema v1 path', () => {
  const forbidden = [
    /schemas\/QuestionDefinition\.js/,
    /validation\/validatorRegistry\.js/,
    /\bnormalizeQuestionDefinition\b/,
    /\bvalidateQuestionDefinition\b/,
    /\bQUESTION_DEFINITION_SCHEMA_VERSION\b/,
    /\bLEGACY_QUESTION_TYPES\b/,
  ];
  const offenders = [];
  for (const file of walkSource(path.join(ROOT, 'src'))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of forbidden) {
      if (pattern.test(text)) offenders.push(`${path.relative(ROOT, file)} matched ${pattern}`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('current question validation remains on the Assignment V5 stack', () => {
  const assignmentSchema = fs.readFileSync(path.join(ROOT, 'src/platform/contract/assignmentSchemaV5.js'), 'utf8');
  const semanticValidation = fs.readFileSync(path.join(ROOT, 'src/platform/contract/semanticValidation.js'), 'utf8');
  const blueprint = fs.readFileSync(path.join(ROOT, 'src/assignmentBlueprint.js'), 'utf8');
  const toolSchemas = fs.readFileSync(path.join(ROOT, 'src/tools/toolSchemas.js'), 'utf8');

  assert.match(assignmentSchema, /ASSIGNMENT_SCHEMA_VERSION\s*=\s*5/);
  assert.match(semanticValidation, /validateQuestionSemantics/);
  assert.match(blueprint, /validateAssignmentQuestions/);
  assert.match(toolSchemas, /validateToolQuestion/);
});

console.log('noLegacyQuestionSchema.test.mjs: all assertions passed');

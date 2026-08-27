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

test('retired Lesson Bundle V3 authoring modules are gone', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'src/platform/schemas/BundleDefinition.js')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'src/platform/validation/bundleValidator.js')), false);
});

test('source tree cannot import or call retired Lesson Bundle authoring adapters', () => {
  const forbidden = [
    /schemas\/BundleDefinition\.js/,
    /validation\/bundleValidator\.js/,
    /\bnormalizeLessonBundle\b/,
    /\bvalidateLessonBundle\b/,
    /\bbuildPreflightBundle\b/,
    /lessonBundle=\{/,
  ];

  const offenders = [];
  for (const file of walkSource(path.join(ROOT, 'src'))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of forbidden) {
      if (pattern.test(text)) {
        offenders.push(`${path.relative(ROOT, file)} matched ${pattern}`);
      }
    }
  }

  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('modeling labs keep their independent lab definition contract', () => {
  const labSchema = path.join(ROOT, 'src/platform/labs/labDefinitionSchema.js');
  assert.equal(fs.existsSync(labSchema), true);
  const text = fs.readFileSync(labSchema, 'utf8');
  assert.match(text, /normalizeLabDefinition/);
  assert.match(text, /validateLabDefinition/);
});

console.log('noLegacyBundleAuthoring.test.mjs: all assertions passed');

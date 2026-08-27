import fs from 'node:fs';
import path from 'node:path';

import { parseAssignmentBlueprintText } from '../src/assignmentBlueprint.js';

const ROOT = process.cwd();

const walkJson = (relativeDir) => {
  const absolute = path.join(ROOT, relativeDir);
  if (!fs.existsSync(absolute)) return [];
  const out = [];
  const walk = (dir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.json')) {
        out.push(path.relative(ROOT, full).replaceAll('\\', '/'));
      }
    });
  };
  walk(absolute);
  return out;
};

const rootSamples = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /^SAMPLE_.*(?:ASSIGNMENT|LESSON|AUTHORING).*\.json$/i.test(entry.name))
  .map((entry) => entry.name);

const files = [...new Set([
  ...rootSamples,
  ...walkJson('teacher-import-jsons'),
  ...walkJson('content/generated'),
])].sort();

const errors = [];
const legacyName = /(?:^|[_-])(?:V[1-4]|PACKAGE[_-]?V?[1-4]|COMPILED[_-]?V[1-4])(?:[_\-.]|$)/i;

for (const file of files) {
  if (legacyName.test(path.basename(file))) {
    errors.push(`${file}: legacy assignment version appears in an active authoring filename.`);
    continue;
  }

  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    errors.push(`${file}: invalid JSON (${error.message}).`);
    continue;
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(`${file}: active assignment examples must be one Assignment V5 object, not a raw array/value.`);
    continue;
  }
  if (Number(raw.schemaVersion) !== 5) {
    errors.push(`${file}: schemaVersion must be 5; found ${String(raw.schemaVersion ?? 'missing')}.`);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'activities')) {
    errors.push(`${file}: top-level activities[] is retired. Use sections[].`);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'questions')) {
    errors.push(`${file}: top-level questions[] is retired. Put questions inside sections[].`);
  }
  if (!Array.isArray(raw.sections) || raw.sections.length === 0) {
    errors.push(`${file}: requires a non-empty sections[] array.`);
  }
  if (!String(raw.assignment?.title || '').trim()) {
    errors.push(`${file}: assignment.title is required.`);
  }
  if (!String(raw.assignment?.courseId || '').trim()) {
    errors.push(`${file}: assignment.courseId is required.`);
  }

  try {
    const parsed = parseAssignmentBlueprintText(text);
    if (Number(parsed.schemaVersion) !== 5 || Number(parsed.bundleSource?.schemaVersion) !== 5) {
      errors.push(`${file}: live compiler did not preserve Assignment V5.`);
    }
  } catch (error) {
    errors.push(`${file}: live compiler rejected this active example: ${error.message}`);
  }
}

if (!files.length) {
  errors.push('No active assignment examples/imports were found to audit.');
}

if (errors.length) {
  console.error('Assignment authoring boundary audit FAILED:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Assignment authoring boundary audit: PASS (${files.length} active V5 files; one sections[] shape; live compiler accepted all)`);

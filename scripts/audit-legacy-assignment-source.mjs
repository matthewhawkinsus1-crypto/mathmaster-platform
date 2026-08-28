import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, 'src');
const extensions = new Set(['.js', '.jsx', '.mjs']);
const files = [];

const walk = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && extensions.has(path.extname(entry.name))) {
      files.push(path.relative(ROOT, full).replaceAll('\\', '/'));
    }
  }
};
walk(SOURCE_ROOT);

const rules = [
  ['retired Lesson Bundle schema import/reference', /(?:platform\/schemas\/BundleDefinition|schemas\/BundleDefinition\.js|\bnormalizeLessonBundle\b|\bCURRENT_BUNDLE_SCHEMA_VERSION\b)/],
  ['retired Lesson Bundle validator import/reference', /(?:platform\/validation\/bundleValidator|validation\/bundleValidator\.js|\bvalidateLessonBundle\b)/],
  ['retired Assignment Preflight bundle adapter', /\bbuildPreflightBundle\b|lessonBundle=\{/],
  ['retired QuestionDefinition schema import/reference', /(?:platform\/schemas\/QuestionDefinition|schemas\/QuestionDefinition\.js|\bnormalizeQuestionDefinition\b|\bQUESTION_DEFINITION_SCHEMA_VERSION\b)/],
  ['retired question validator registry import/reference', /(?:platform\/validation\/validatorRegistry|validation\/validatorRegistry\.js|\bvalidateQuestionDefinition\b|\bLEGACY_QUESTION_TYPES\b)/],
  ['removed persisted questions projection read', /\bpersistence\.questions\b/],
  ['retired client Assignment V5 runtime projection', /\bhydrateAssignmentRuntime\b|assignmentRuntimeProjection/],
  ['retired assignment package metadata normalizer', /\bnormalizeAssignmentPackageMetadata\b|\bASSIGNMENT_TEMPLATE_DEFAULTS\b/],
  ['retired assignment package aliases', /\bproblemVersions\b|\bversionMode\b/],
];

const violations = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const [label, pattern] of rules) {
    if (pattern.test(text)) violations.push(`${file}: ${label}`);
  }
}

for (const retired of [
  'src/platform/schemas/BundleDefinition.js',
  'src/platform/validation/bundleValidator.js',
  'src/platform/schemas/QuestionDefinition.js',
  'src/platform/validation/validatorRegistry.js',
  'src/platform/contract/assignmentRuntimeProjection.js',
]) {
  if (fs.existsSync(path.join(ROOT, retired))) {
    violations.push(`${retired}: retired assignment-authoring file must not exist`);
  }
}

if (violations.length) {
  console.error('Legacy assignment source audit FAILED:');
  [...new Set(violations)].forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log(
  `Legacy assignment source audit: PASS (${files.length} live source files scanned; retired Bundle/Question schema and client assignment-projection paths absent)`,
);

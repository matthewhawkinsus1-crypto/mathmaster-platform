import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const roots = ['src', 'tests', 'scripts'];
const extensions = new Set(['.js', '.jsx', '.mjs']);

const files = [];
const walk = (dir) => {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && extensions.has(path.extname(entry.name))) {
      files.push(path.relative(ROOT, full).replaceAll('\\', '/'));
    }
  });
};
roots.forEach((root) => walk(path.join(ROOT, root)));

const violations = [];
const prohibited = [
  {
    label: 'retired BundleDefinition import/reference',
    pattern: /(?:platform\/schemas\/BundleDefinition|BundleDefinition\.js|normalizeLessonBundle|CURRENT_BUNDLE_SCHEMA_VERSION)/,
  },
  {
    label: 'retired bundleValidator import/reference',
    pattern: /(?:platform\/validation\/bundleValidator|bundleValidator\.js|validateLessonBundle)/,
  },
  {
    label: 'retired Lesson Bundle V3 authoring contract',
    pattern: /Lesson Bundle V3|Bundle V3 activities are authoritative|schemaVersion\s*[:=]\s*3[\s\S]{0,400}?activities\s*:/,
  },
];

for (const file of files) {
  if (file === 'scripts/audit-legacy-assignment-bundle-code.mjs') continue;
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  prohibited.forEach(({ label, pattern }) => {
    if (pattern.test(text)) violations.push(`${file}: ${label}`);
  });
}

for (const removedPath of [
  'src/platform/schemas/BundleDefinition.js',
  'src/platform/validation/bundleValidator.js',
  'tests/platform/jsonPreflightMobile.test.mjs',
]) {
  if (fs.existsSync(path.join(ROOT, removedPath))) {
    violations.push(`${removedPath}: retired file must not exist`);
  }
}

if (violations.length) {
  console.error('Legacy assignment-bundle source audit FAILED:');
  [...new Set(violations)].forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log(`Legacy assignment-bundle source audit: PASS (${files.length} JS/JSX/MJS files scanned)`);

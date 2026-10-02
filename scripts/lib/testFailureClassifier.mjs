/*
 * WHAT KIND OF FAILURE IS THIS? The parser and classifier behind
 * `npm run test:platform` (scripts/explain-test-failures.mjs).
 *
 * Kept apart from the script so tests can import it: the script runs the whole
 * suite the moment it is loaded, and a "was I run directly?" guard would be one
 * symlinked checkout away from a CI gate that silently runs nothing.
 *
 * Pinned by tests/platform/explainTestFailures.test.mjs.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const FUNCTIONS_DEPENDENCIES_NOTE = 'functions/ dependencies are not installed — run `npm --prefix functions ci`; this is not a regression.';

export const GUIDANCE = {
  functionsDependencies: {
    label: 'ENVIRONMENT — functions/ DEPENDENCIES ARE NOT INSTALLED',
    why: `${FUNCTIONS_DEPENDENCIES_NOTE} The suite loads Cloud Functions code whose packages live only in functions/package.json, so the file could not even be imported: no assertion ran, and nothing about the code under test was measured.`,
    steps: [
      'Run `npm --prefix functions ci` (CI does this in full-platform-suite.yml).',
      'Re-run `npm run test:platform`. Only a failure that is still there is worth reading.',
    ],
  },
  sourceText: {
    label: 'PINNED TO SOURCE TEXT',
    why: 'The assertion matches a literal string or regex against a component\'s source. It fails when code is renamed, reformatted, split into another file, or rewritten — none of which is a regression.',
    steps: [
      'Read the comment above the assertion. It names the behaviour; the regex does not.',
      'Decide whether that behaviour still holds, by reading or running the new code.',
      'Intact -> rewrite the assertion against the behaviour (assertCapability / region from tests/platform/helpers/sourceContract.mjs), then break the behaviour once and confirm it goes red.',
      'Genuinely lost -> fix the code. The test was right.',
    ],
  },
  canonicalValue: {
    label: 'PINNED TO A VALUE SOMETHING CANONICALISES',
    why: 'The assertion compares a value that a normaliser rewrites on the way through. The authoring-facing name is not the runtime name, so the comparison can never hold regardless of whether the behaviour is correct.',
    steps: [
      'Print the value at the point the assertion runs, rather than assuming it.',
      'Find the normaliser (e.g. normalizeWorkflow, interactionStages aliases) and what it maps the value to.',
      'Assert the invariant that survives normalisation — an id, a role, a category — not the pre-normalisation spelling.',
    ],
  },
  frozenShape: {
    label: 'PINNED TO A FROZEN OBJECT SHAPE',
    why: 'A deepEqual against a whole record fails the moment the record gains a legitimate new field.',
    steps: [
      'Check whether the new or missing key is a deliberate addition.',
      'If it is, add it to the expected object with a comment saying why it exists.',
      'If the record should not have changed, that is a real finding — investigate the code.',
    ],
  },
  forbiddenInComment: {
    label: 'FORBIDDEN IDENTIFIER MATCHED IN A COMMENT',
    why: 'A doesNotMatch assertion means "this code must not touch X", but it runs over the whole file — so it also fires when a COMMENT explains that the code must not touch X. Deleting the explanation is not the fix.',
    steps: [
      'Find where the forbidden word actually occurs: grep -n <word> <file>.',
      'If every occurrence is inside a comment, the code is correct and the assertion is over-scoped.',
      'Scope it to code: import { executableSource } from ./helpers/sourceContract.mjs and assert against executableSource(source).',
      'Then confirm it still bites: add a real reference to the forbidden field in code and check the test fails.',
    ],
  },
  versionedConstant: {
    label: 'PINNED TO A CONSTANT THAT IS MEANT TO CHANGE',
    why: 'The test hardcodes a value like a schema or repair version that exists precisely so it can be incremented. The fixture usually MEANT "current" — and silently came to mean "stale" the moment the constant advanced, so the test then asserts the opposite of its own name.',
    steps: [
      'Read the test name. If it says "current", the fixture must track the constant, not a literal.',
      'Import the constant and use it: repairVersion: ASSIGNMENT_RUNTIME_REPAIR_VERSION.',
      'For a deliberately OLD value, write CURRENT - 1 rather than a literal, so it stays old after the next bump.',
      'Check the counterpart exists: if one test proves a current stamp suppresses work, another should prove a stale one does not.',
    ],
  },
  behavioural: {
    label: 'BEHAVIOURAL',
    why: 'This compares computed output, not source text. It is more likely than the others to be a genuine defect — but it can still be pinned to a representation (see the canonical-value case).',
    steps: [
      'Reproduce it in isolation with a small node -e probe before changing anything.',
      'Confirm which side is wrong: the expectation or the implementation.',
      'If you change the assertion, mutation-test it: break the behaviour and confirm it fails.',
    ],
  },
};

/* ----------------------------------------------------------- environment */

const declaredPackages = (relative) => {
  try {
    const manifest = JSON.parse(readFileSync(path.join(REPO, relative), 'utf8'));
    return new Set([...Object.keys(manifest.dependencies || {}), ...Object.keys(manifest.devDependencies || {})]);
  } catch {
    return new Set();
  }
};

let defaultContext;
/** What the classifier knows about this checkout: its root and both manifests. */
const checkoutContext = () => {
  defaultContext ??= { repo: REPO, functions: declaredPackages('functions/package.json'), root: declaredPackages('package.json') };
  return defaultContext;
};

/** The package a bare specifier belongs to ('firebase-admin/app' -> 'firebase-admin'); null for a file path. */
export const packageName = (specifier) => {
  const value = String(specifier || '');
  if (!value || /^(\.|\/|[a-zA-Z]:[\\/]|file:|node:|data:)/.test(value)) return null;
  const parts = value.split('/');
  return value.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
};

/**
 * Every "this package is not installed" in a piece of output, with the file
 * that asked for it when node says. Both loaders word it differently:
 *
 *   ESM  Cannot find package 'firebase-admin' imported from /repo/functions/shared/x.mjs
 *   CJS  Cannot find module 'googleapis'
 *        Require stack:
 *        - /repo/functions/lib/classroom.js
 */
export const missingPackages = (text) => {
  const source = String(text || '');
  const found = [];
  for (const match of source.matchAll(/Cannot find package '([^']+)' imported from (\S+)/g)) {
    found.push({ specifier: match[1], name: packageName(match[1]), importer: match[2] });
  }
  for (const match of source.matchAll(/Cannot find module '([^']+)'(?:\s*\n\s*Require stack:\s*\n\s*-\s*(\S+))?/g)) {
    found.push({ specifier: match[1], name: packageName(match[1]), importer: match[2] || null });
  }
  return found.filter((entry) => entry.name);
};

const insideFunctions = (importer, repo) => {
  const file = importer.startsWith('file:') ? fileURLToPath(importer) : importer;
  return path.relative(repo, file).split(/[\\/]/)[0] === 'functions';
};

/**
 * The functions/ package a failure could not load, or null.
 *
 * Only when the failure THREW a resolution error — an assertion that happens to
 * mention a package is still an assertion (it has an `operator`) — and only for
 * a package functions/package.json declares, asked for from inside functions/.
 * When node does not say who asked, a package the root package.json does not
 * also declare. A test that imports firebase-admin from tests/ itself would not
 * be fixed by installing functions/, so that is not called an environment
 * problem.
 *
 * A file that failed to LOAD has only "test failed" in its own block; its
 * child process's stderr — where the ERR_MODULE_NOT_FOUND is — arrives as the
 * `diagnostics` lines just above it, and is read only for such a file
 * (`exitCode` is set only there).
 */
export const missingFunctionsDependency = (failure, context = checkoutContext()) => {
  if (failure.operator) return null;
  const text = [failure.error, failure.exitCode != null ? failure.diagnostics : ''].join('\n');
  const hit = missingPackages(text).find(({ name, importer }) => context.functions.has(name)
    && (importer ? insideFunctions(importer, context.repo) : !context.root.has(name)));
  return hit ? hit.name : null;
};

/*
 * Classified from the assertion's own metadata, not its message.
 *
 * node reports the custom message in `error:` and the machinery in `operator:`
 * and `actual:`. A regex assertion against a file shows operator 'match' with
 * `actual` holding the file's text — which is exactly the source-text pin. The
 * message is author-written and says nothing structural, so reading it was why
 * the first version of this called everything behavioural.
 *
 * A missing functions/ install is decided first: it is not a kind of failing
 * assertion at all.
 */
export const classify = (failure, context = checkoutContext()) => {
  if (missingFunctionsDependency(failure, context)) return 'functionsDependencies';
  const { operator, actual, error } = failure;
  const looksLikeSource = /^\s*(import|const|function|export|\/\*|<)/m.test(String(actual || ''))
    || /\.jsx?['"]/.test(String(actual || ''));

  if (operator === 'doesNotMatch') {
    // A forbidden-identifier check that fired only because of prose is the most
    // misleading failure in this suite: the obvious way to green it is to
    // delete the comment documenting the safety boundary being enforced.
    return looksLikeSource ? 'forbiddenInComment' : 'behavioural';
  }
  if (operator === 'match') {
    return looksLikeSource ? 'sourceText' : 'behavioural';
  }
  if (operator === 'deepStrictEqual' || operator === 'notDeepStrictEqual') return 'frozenShape';
  const bare = String(actual || '').trim();
  const equality = operator === 'strictEqual' || operator === '==';
  // A small integer on one side of an equality is very often a version or
  // schema constant that has just been incremented: the fixture said 1 while 1
  // happened to be current, and stopped meaning "current" on the bump.
  if (equality && /^\d{1,3}$/.test(bare)) return 'versionedConstant';
  // A single bare word is usually a canonicalised name — 'functionGraph' where
  // the test expected 'graphConstruction'. Booleans carry no such signal.
  if (equality && /^['"]?[a-zA-Z][a-zA-Z0-9_]*['"]?$/.test(bare) && !/^(true|false|null|undefined)$/.test(bare)) {
    return 'canonicalValue';
  }
  if (/did not match the regular expression/i.test(String(error || ''))) return 'sourceText';
  return 'behavioural';
};

export const parseFailures = (tap) => {
  const failures = [];
  const lines = tap.split('\n');
  lines.forEach((line, index) => {
    const match = /^not ok \d+ - (.*)$/.exec(line.trim());
    if (!match) return;
    /*
     * Each failure's diagnostic block is bounded by the NEXT test result line,
     * not by a fixed window or the YAML terminator. A fixed window misses
     * `operator:` when a failed regex dumps a whole component into `actual:`,
     * and the terminator is not unique — a deepEqual diff prints its own
     * "... Skipped lines". Losing `operator:` silently classified every failure
     * as behavioural, which is the least useful answer available.
     */
    let blockEnd = index + 1;
    while (blockEnd < lines.length && !/^\s*(not ok|ok) \d+/.test(lines[blockEnd])) blockEnd += 1;
    const block = lines.slice(index, blockEnd);
    const location = /location: '([^']+)'/.exec(block.join('\n'));

    // Scanned line by line rather than matched as one blob: node's TAP writes
    // `error: |-` followed by an indented block that ends at the next key, and
    // a single regex over the whole thing either stops at the first newline or
    // runs past into the stack. Getting this wrong silently classifies every
    // failure as behavioural, which is the least useful answer available.
    let error = '';
    const start = block.findIndex((line) => /^\s*error:/.test(line));
    if (start !== -1) {
      const inline = /^\s*error: ['"]?([^'"]*)['"]?\s*$/.exec(block[start]);
      if (inline && inline[1] && inline[1] !== '|-') {
        error = inline[1];
      } else {
        const body = [];
        for (let i = start + 1; i < block.length; i += 1) {
          if (/^\s*(code|stack|failureType|expected|actual|operator):/.test(block[i])) break;
          body.push(block[i].trim());
        }
        error = body.join('\n').trim();
      }
    }

    const joined = block.join('\n');
    const operator = (/operator: '([^']+)'/.exec(joined) || [])[1] || '';
    let actual = '';
    const actualStart = block.findIndex((line) => /^\s*actual:/.test(line));
    if (actualStart !== -1) {
      const inlineActual = /^\s*actual: (.+)$/.exec(block[actualStart]);
      if (inlineActual && inlineActual[1].trim() !== '|-') {
        actual = inlineActual[1].trim();
      } else {
        const body = [];
        for (let i = actualStart + 1; i < block.length && body.length < 6; i += 1) {
          if (/^\s*(code|stack|operator|expected):/.test(block[i])) break;
          body.push(block[i].trim());
        }
        actual = body.join('\n');
      }
    }

    // A file that could not be loaded at all exits its child process: node
    // records the `exitCode`, says only "test failed" here, and prints the
    // child's stderr as `# ` lines just above this file's `# Subtest:` line.
    const exitCode = /^\s*exitCode: (\d+)/m.exec(joined);
    const diagnostics = [];
    let above = index - 1;
    while (above >= 0 && /^\s*# Subtest:/.test(lines[above])) above -= 1;
    while (above >= 0 && /^\s*#/.test(lines[above]) && !/^\s*# Subtest:/.test(lines[above])) {
      diagnostics.unshift(lines[above].replace(/^\s*# ?/, ''));
      above -= 1;
    }

    failures.push({
      name: match[1],
      file: location ? location[1].replace(/^.*\/mathmaster-platform\//, '') : null,
      error,
      operator,
      actual,
      exitCode: exitCode ? Number(exitCode[1]) : null,
      diagnostics: diagnostics.join('\n'),
    });
  });
  return failures;
};

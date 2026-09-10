#!/usr/bin/env node
/*
 * Runs the platform suite and, for every failure, says what KIND of failure it
 * is and what to do about it.
 *
 * Why this exists. Across PRs #152 and #155-#166, 26 of 27 suite failures were
 * not regressions. They were assertions pinned to a REPRESENTATION — the text
 * of a file, a canonical value, a frozen object shape — that a correct refactor
 * had moved. Exactly one was a real bug.
 *
 * That base rate is the problem. A red suite looks identical in both cases, so
 * the cautious-looking response is to revert the change until the assertion
 * matches again. On PR #165 that would have restored an expression which had
 * itself become the double-draw bug the test existed to prevent.
 *
 * So the run tells you which kind you are looking at, instead of leaving it to
 * be guessed.
 */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PLAYBOOK = 'docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md';

const GUIDANCE = {
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

/*
 * Classified from the assertion's own metadata, not its message.
 *
 * node reports the custom message in `error:` and the machinery in `operator:`
 * and `actual:`. A regex assertion against a file shows operator 'match' with
 * `actual` holding the file's text — which is exactly the source-text pin. The
 * message is author-written and says nothing structural, so reading it was why
 * the first version of this called everything behavioural.
 */
const classify = ({ operator, actual, error }) => {
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
  if (operator === 'strictEqual' && /^['"]?[a-zA-Z][a-zA-Z0-9_]*['"]?$/.test(String(actual || '').trim())) {
    return 'canonicalValue';
  }
  if (/did not match the regular expression/i.test(String(error || ''))) return 'sourceText';
  return 'behavioural';
};

const run = () => new Promise((resolve) => {
  const child = spawn('node', ['--test', ...process.argv.slice(2).length ? process.argv.slice(2) : ['tests/platform/*.test.mjs']], {
    shell: true,
    encoding: 'utf8',
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
  child.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
  child.on('close', (code) => resolve({ out, code }));
});

const parseFailures = (tap) => {
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

    failures.push({
      name: match[1],
      file: location ? location[1].replace(/^.*\/mathmaster-platform\//, '') : null,
      error,
      operator,
      actual,
    });
  });
  return failures;
};

const { out, code } = await run();
const failures = parseFailures(out);

if (!failures.length) process.exit(code);

const bar = '='.repeat(78);
console.log(`\n${bar}`);
console.log(`HOW TO READ THESE ${failures.length} FAILURE${failures.length === 1 ? '' : 'S'}`);
console.log(bar);
console.log(
  '\nAcross PRs #152 and #155-#166, 26 of 27 failures in this suite were NOT\n'
  + 'regressions — they were assertions pinned to a representation that a correct\n'
  + 'refactor had moved. Exactly one was a real bug.\n\n'
  + 'So do not revert working code to make an assertion match again. On PR #165\n'
  + 'that would have restored an expression that had itself become the bug the\n'
  + 'test existed to prevent.\n\n'
  + `Full procedure: ${PLAYBOOK}`,
);

const seen = new Set();
failures.forEach((failure, index) => {
  const kind = classify(failure);
  const g = GUIDANCE[kind];
  console.log(`\n${'-'.repeat(78)}`);
  console.log(`${index + 1}. ${failure.name}`);
  if (failure.file) console.log(`   ${failure.file}`);
  console.log(`\n   LIKELY: ${g.label}`);
  if (!seen.has(kind)) {
    console.log(`   ${g.why}`);
    console.log('\n   What to do:');
    g.steps.forEach((step, n) => console.log(`     ${n + 1}. ${step}`));
    seen.add(kind);
  } else {
    console.log(`   (same kind as above — see the steps listed there)`);
  }
});

console.log(`\n${bar}`);
console.log('Classification is a heuristic from the error shape. Verify before acting.');
console.log(bar);
process.exit(code || 1);

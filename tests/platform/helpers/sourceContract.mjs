/*
 * SOURCE CONTRACTS: READING CODE AS TEXT, WITHOUT PINNING ITS SPELLING.
 *
 * About a quarter of this suite inspects component source as a string, because
 * nothing here renders React — node cannot import .jsx, so a source contract is
 * the only way to assert that a screen is wired to the logic behind it. They
 * are worth having. They are also the single most common reason a correct
 * refactor turns CI red: the behaviour is intact and the TEXT moved.
 *
 * Every failure of that kind in recent memory was one of three shapes:
 *
 *   a component was split      AssignmentQuestionEditor -> ...EditorBase
 *   a label was reworded       "Copy AI Fix Package" -> "Copy All Flagged ..."
 *   an expression was rewritten  `!String(n||'').trim()` -> `!clean(n)`
 *
 * None of them was a regression. Each was fixed by asserting what the code has
 * to DO instead of how it currently reads.
 *
 * The helpers here make that the easy path. See
 * docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md for the decision procedure to run
 * when one of these fails.
 */

import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const ROOT = new URL('../../../', import.meta.url);
const read = (relativePath) => readFileSync(new URL(relativePath, ROOT), 'utf8');

const PLAYBOOK = 'docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md';

/**
 * The source of a component, including its extracted base if one exists.
 *
 * A screen split into `Thing.jsx` + `ThingBase.jsx` is still one screen, and a
 * contract about it means both halves. Reading only the wrapper is why a split
 * breaks ten assertions at once; repointing each test at the base instead is
 * worse, because everything the wrapper owns then goes uncovered.
 *
 * The pairing asserts the seam it depends on: concatenating two files is only
 * honest while the wrapper still renders the base. Without that check, deleting
 * the <ThingBase /> element takes the screen off the teacher's display while
 * every string these tests search for is still present in the concatenation.
 */
export const componentSource = (relativePath) => {
  const source = read(relativePath);
  const baseRelative = relativePath.replace(/\.jsx$/, 'Base.jsx');
  if (relativePath === baseRelative || !existsSync(new URL(baseRelative, ROOT))) return source;

  const baseName = baseRelative.split('/').pop().replace(/\.jsx$/, '');
  assert.match(
    source,
    new RegExp(`<${baseName}\\b`),
    `${relativePath} must render <${baseName} />. Without it the screen is not on display, and reading both files would assert against orphaned code.`,
  );
  return `${source}\n${read(baseRelative)}`;
};

/**
 * Assert a capability that may be spelled several ways.
 *
 * Use where a control's WORDING is incidental and its existence is not. A
 * rename should not read as a removal; losing the control entirely still must.
 */
export const assertCapability = (source, alternatives, message) => {
  const matched = alternatives.some((pattern) => (
    pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern)
  ));
  assert.ok(
    matched,
    `${message}\n\nNone of these matched: ${alternatives.map(String).join(' | ')}\n`
    + `If the behaviour is intact and only the wording moved, widen this list rather than reverting the code. See ${PLAYBOOK}.`,
  );
};

/**
 * The slice of a file that has to do the work.
 *
 * Matching a name anywhere in a 700-line component is the other failure mode of
 * these tests, and it is the quieter one: the name is usually already present
 * for an unrelated reason, so the assertion passes while the behaviour it
 * stands for can be deleted. Bind assertions to the handler, memo or call site
 * that must contain them.
 */
export const region = (source, startNeedle, endNeedle, label = 'region') => {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `could not find the start of ${label}: ${startNeedle}`);
  const end = endNeedle ? source.indexOf(endNeedle, start + startNeedle.length) : -1;
  return source.slice(start, end === -1 ? source.length : end);
};


/**
 * The same source with comments removed.
 *
 * Use this for every `assert.doesNotMatch(source, /forbiddenThing/)`. Those
 * assertions mean "this code must not touch X", but they run over the whole
 * file — so they also fail when a comment *explains* that the code must not
 * touch X. The store contract in PR #167 failed exactly that way: the only
 * occurrence of `evidence` in the file was a comment stating the safety
 * boundary the test enforces, and the only way to make it pass was to delete
 * the explanation.
 *
 * A forbidden-identifier check is about what the code DOES. Comments are not
 * code, and a test that punishes documenting an invariant will get the
 * documentation deleted, which is the opposite of what it wants.
 *
 * Deliberately simple: line and block comments only. It does not parse the
 * language, so a `//` inside a string literal is also stripped. That is
 * acceptable here — the result is only ever used as a haystack for
 * forbidden-identifier checks, never rendered or executed.
 */
export const executableSource = (source) => String(source ?? '')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

export default { componentSource, assertCapability, region, executableSource };

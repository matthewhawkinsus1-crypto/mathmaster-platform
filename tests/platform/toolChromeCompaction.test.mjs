import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * How much screen the chrome spends before a student reaches the mathematics.
 *
 * Measured on a 390x664 phone, in the real student path, this was the stack
 * above the graph:
 *
 *   page header            66px
 *   question prompt       110px
 *   attempt strip          33px
 *   tool shell header     101px   <- naming a tool they are already looking at
 *   tool task card        132px
 *   ------------------------------
 *   graph started at      560px   of a 664px screen
 *
 * The two blocks that were paying for nothing are fixed here. The numbers are
 * recorded by tests/browser/mobileLayoutAudit.mjs; these assertions hold the
 * mechanisms in place so the space cannot quietly come back.
 */

const css = readFileSync('src/App.css', 'utf8');
const shell = readFileSync('src/tools/shared/ToolShell.jsx', 'utf8');

test('the tool header is one row, not three stacked items', () => {
  // Title, badge and "About this tool" used to stack. They now share a line,
  // which is what took the header from 99px to 63px on a Chromebook.
  assert.match(shell, /display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap'/);
  const header = shell.slice(shell.indexOf('mathmaster-tool-shell-header'), shell.indexOf('mathmaster-tool-shell-body'));
  assert.match(header, /About this tool/, 'the fold belongs in the header row');
  assert.match(header, /marginLeft: 'auto'/, 'and sits at the far end of it');
});

test('an opened fold still reads at full width', () => {
  // Left in the row, its body would be squeezed into whatever the summary
  // left over at the end of the line.
  assert.match(css, /\.mathmaster-tool-shell-header \.mathmaster-quiet-disclosure\[data-open="true"\]/);
  assert.match(css, /flex-basis: 100%/);
});

test('the badge leaves the phone header row without being lost', () => {
  // At 390px the row could not hold all three and wrapped to 101px. The badge
  // steps out and reappears inside the fold, so nothing is thrown away.
  assert.match(css, /@media \(max-width: 700px\)[\s\S]{0,200}\.mathmaster-tool-shell-badge \{ display: none; \}/);
  assert.match(shell, /mathmaster-tool-shell-badge-echo/, 'the badge must still exist inside the fold');
  assert.match(css, /@media \(min-width: 701px\)[\s\S]{0,160}\.mathmaster-tool-shell-badge-echo \{ display: none; \}/,
    'and must not appear twice on a wide screen');
});

test('the task card lays out across on a phone, not down', () => {
  // Stacking the folded "How to do this" under a one-line task spends 54px of
  // a 664px screen to leave the row beside it empty.
  const block = css.slice(css.indexOf('@media (max-width: 700px)'));
  const scoped = block.slice(0, block.indexOf('@media (min-width: 701px)'));
  assert.match(scoped, /\.mathmaster-tool-task-card \{[\s\S]{0,200}display: flex/);
  assert.match(scoped, /\.mathmaster-tool-task-card \.mathmaster-tool-task-eyebrow \{ display: none; \}/);
});

test('a task card with no steps still fills the row', () => {
  // `:not(:first-child)` matters: a card whose only child is the task must not
  // be treated as the narrow trailing element and pinned to 46%.
  assert.match(css, /\.mathmaster-tool-task-card > \*:last-child:not\(:first-child\)/);
});

test('the measured findings are still empty', () => {
  // The mobile audit is what actually proves the answer control stays in reach;
  // these are its recorded results.
  for (const file of ['mobileLayoutFindings.json', 'mobileLayoutLandscapeFindings.json']) {
    const recorded = JSON.parse(readFileSync(`tests/platform/fixtures/${file}`, 'utf8'));
    assert.deepEqual(recorded.findings, [], `${file} recorded layout problems`);
  }
});

/*
 * THE IDENTITY BAR ON A PHONE: ONE LINE, PINNED, NOTHING LOST.
 *
 * docs/qa/platform-quirks-audit.md, PQ-021 (67px at 390, 86px at 344, always
 * pinned) and PQ-030 (its ⭐ was a box without an emoji font). The bar is the
 * account-integrity marker — a teacher must see whose work is on screen — so
 * the product decision is compact, not hidden. Browser gate:
 * tests/browser/studentUxPlatform.mjs `identity`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const identity = read('src/components/student/StudentIdentityBar.jsx');
const identityCss = executableSource(read('src/components/student/StudentIdentityBar.css'));

test('the identity bar is one line on a phone and keeps every piece of identity', () => {
  assert.match(identity, /import '\.\/StudentIdentityBar\.css';/);
  const phone = region(identityCss, '@media (max-width: 479.98px) {', '\n}\n', 'the phone identity rules');
  assert.match(phone, /\.mm-identity-main \{[^}]*flex-wrap:\s*nowrap/, 'one line');
  assert.match(phone, /\.mm-identity-name \{[^}]*white-space:\s*nowrap[^}]*text-overflow:\s*ellipsis/, 'the name and period end in an ellipsis instead of wrapping');
  assert.match(phone, /\.mm-identity-not-you \{\s*display:\s*none;/, '"Not you?" goes; Log Out stays');
  // "Class Points" is visually hidden, never removed: the chip still reads
  // "120 Class Points" to a screen reader.
  const words = region(phone, '.mm-identity-points-word {', '}', 'the points words');
  assert.match(words, /clip-path:\s*inset\(50%\)/);
  assert.doesNotMatch(words, /display:\s*none/);
  // It stays pinned: nothing on a phone touches its position, and nothing hides
  // the bar, the name, the points or Log Out.
  assert.doesNotMatch(phone, /position:\s*(?:static|relative)|\.mm-identity-(?:bar|name|points|logout|main) \{[^}]*display:\s*none/);
  assert.match(identity, /position: 'sticky', top: 0/);

  // Every piece is still rendered: the name and period, the points with their
  // label, and the Log Out button.
  const bar = region(identity, '<aside', '</aside>', 'the identity bar');
  assert.match(bar, /className="mm-identity-name"[^>]*>\s*\{name\}\{context \? ` • \$\{context\}` : ''\}/);
  assert.match(bar, /aria-label=\{`\$\{classPointsBalance\} Class Points`\} className="mm-identity-points"/);
  assert.match(bar, /\{classPointsBalance\}<span className="mm-identity-points-word"> Class Points<\/span>/);
  assert.match(bar, /onClick=\{onLogout\}[\s\S]*>\s*Log Out\s*</);
  // What used to wrap is in the stylesheet, where a media query can undo it.
  assert.doesNotMatch(bar, /flexWrap: 'wrap'|overflowWrap: 'anywhere'/);
});

test('the identity bar draws its star instead of typing ⭐', () => {
  // U+2B50 rendered as an empty box without an emoji font (PQ-030).
  assert.doesNotMatch(executableSource(identity), /⭐/);
  const points = region(identity, 'className="mm-identity-points"', '</span></span>', 'the points chip');
  assert.match(points, /<StarIcon \/>/);
  assert.match(identity, /import StarIcon from '\.\.\/common\/StarIcon\.jsx';/);
  const icon = read('src/components/common/StarIcon.jsx');
  assert.match(icon, /<svg[\s\S]*aria-hidden="true"[\s\S]*<path/);
  assert.doesNotMatch(executableSource(icon), /⭐|★|☆/, 'no glyph that needs a font');
});

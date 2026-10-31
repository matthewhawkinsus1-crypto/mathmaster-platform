// Type every expression and equation key a secure Test can issue into the real
// math editor, the way a student builds it, and grade exactly what it holds.
//
//   node_modules/.bin/vite --host 127.0.0.1 --port 5199 --strictPort &
//   node tests/browser/editorKeyRoundTrip.mjs              # AUDIT_ORIGIN to point elsewhere
//   node tests/browser/editorKeyRoundTrip.mjs --write      # record the result
//
// WHY (TS05). A secure Test kept expression and equation answers in a plain
// text box: the editor submits MathLive's LaTeX, not the typed characters, and
// on a secure item nobody sees a verdict until release, so a right answer the
// grader could not read would be marked wrong in silence. This proves, key by
// key, that the grader reads what the editor writes for every such key. (My
// Math Path already collects these answers in the editor, so a refusal here is
// a wrong verdict there today.)
//
// HOW. The keys are drawn as the secure runtime draws them: every family of
// the bundled Path seeds and the secure-assessment seed, three draws each
// (mathPath.instantiateQuestion), the typed expression and equation fields of
// what buildSanitizedQuestion issues. Each distinct key is typed into a real
// MathInput twice:
//
//   literal  the characters as written, leaving each fraction, power, root or
//            subscript where the key's own reading ends it, as a student who
//            sees the caret in the box does (ArrowRight, as far as needed);
//   natural  the same answer built with the keypad: a power, subscript or root
//            typed into its box without the brackets around it, a log base
//            through the logₐ key and a cube root through the ⁿ√ key. A
//            denominator keeps its brackets: typed without them `d/4r` is
//            (d/4)·r, which the student would see.
//
// What the field holds is graded by the real secure grader
// (functions/lib/secureItems.js gradeItem) against that field's own private
// grading, and compared with scripts/lib/editorTypedSpelling.mjs, the model the
// equivalence sweep uses for every key in every bank. --write records each key
// whose editor spelling differs from the typed key in
// tests/platform/fixtures/editorKeyRoundTrip.json, which
// tests/platform/editorKeySpellings.test.mjs grades in CI and holds the model to.
//
// Exit 1 when a key's editor spelling is refused, or the model writes another
// spelling than the editor did.

import { createRequire } from 'node:module';
import { readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const mathPath = require('../../functions/lib/mathPath.js');
const secureItems = require('../../functions/lib/secureItems.js');
const { normalizeInteractionInputProfile } = await import(pathToFileURL(path.join(repo, 'src/platform/interaction/interactionContract.js')).href);
const { editorTypedSpelling } = await import(pathToFileURL(path.join(repo, 'scripts/lib/editorTypedSpelling.mjs')).href);

const RESULT = path.join(repo, 'tests/platform/fixtures/editorKeyRoundTrip.json');
const ORIGIN = process.env.AUDIT_ORIGIN || 'http://localhost:5199';
const DRAWS = 3;
const PROFILES = new Set(['expression', 'equation']);
const write = process.argv.includes('--write');
const limitIndex = process.argv.indexOf('--limit');
const limit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) || 0 : 0;

// --- the keys --------------------------------------------------------------------

const seedFiles = () => {
  const bank = path.join(repo, 'functions/seeds/pathQuestionBank');
  const secure = path.join(repo, 'functions/seeds/secureAssessments');
  return [
    ...readdirSync(bank).filter((name) => name.endsWith('_pathQuestionBank_seed.json')).sort().map((name) => path.join(bank, name)),
    ...readdirSync(secure).filter((name) => name.endsWith('.json')).sort().map((name) => path.join(secure, name)),
  ];
};

const keys = [];
const seen = new Set();
for (const file of seedFiles()) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  const documents = Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
  for (const item of documents) {
    if (item?.active === false) continue;
    for (let draw = 0; draw < DRAWS; draw += 1) {
      let question;
      try {
        // eslint-disable-next-line no-await-in-loop
        question = (await mathPath.instantiateQuestion(item, `editor-key-${draw}`))?.question;
      } catch { continue; }
      if (!question || question.pathToolId) continue;
      const issued = mathPath.buildSanitizedQuestion(question, { questionInstanceId: 'q' });
      const grading = mathPath.privateGradingDefinition(question);
      (issued.responseFields || []).forEach((field) => {
        const profile = normalizeInteractionInputProfile(field.inputProfile);
        if (!PROFILES.has(profile) || field.choices?.length || (issued.responseFields.length === 1 && issued.choices?.length)) return;
        const graded = grading.fields.find((entry) => entry.id === field.id);
        const key = String(graded?.expected ?? '');
        if (!graded || !key) return;
        const fieldGrading = { ...graded, id: 'answer' };
        const id = JSON.stringify([profile, fieldGrading]);
        if (seen.has(id)) return;
        seen.add(id);
        keys.push({ key, profile, grading: fieldGrading, source: `${path.basename(file)} ${item.id}` });
      });
    }
  }
}
const selected = limit ? keys.slice(0, limit) : keys;
console.log(`Typing ${selected.length} expression and equation keys into a real math editor, two ways each\n`);

/*
 * Typed answers no key holds, typed straight through, that pin what the model
 * must know about the editor beyond the keys: a typed power leaves its box
 * after one digit (x^11 is held x^11, shown x¹1); a function name typed
 * without brackets stays out of a slash's numerator (ln3/ln2 builds
 * ln(3/ln 2)); a space after a whole number starts a mixed number (GR33);
 * sqrt typed without brackets still builds a root; abs is three letters.
 * Recorded with the keys; nothing here is graded.
 */
const PROBES = ['x^11', 'ln3/ln2', '1 45/55', '5sqrt5', '8*sqrt6', 'abs(3x+7)=-6', '2e^(3x)', 'x^-2'];

// --- how a student builds each key ---------------------------------------------

/*
 * The steps that build a key. Each step names the caret depth it expects
 * before it (the robot leaves groups with ArrowRight until the editor is that
 * shallow): `chars` typed, `press` a key, `insert` a keypad template,
 * `raw` typed straight into a template's box, `end` leave every group.
 * A slash, a power, a subscript or a root opens a group that ends where the
 * key's own reading ends its operand; brackets, set braces and bars are typed.
 */
const matchClose = (text, start, open, close) => {
  let level = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === open) level += 1;
    else if (text[index] === close) { level -= 1; if (level === 0) return index; }
  }
  return -1;
};

const planFor = (key, variant) => {
  const natural = variant === 'natural';
  const text = String(key).replace(/\s+(and|or)\s+/g, '\uE001$1\uE001').replace(/\s+/g, '');
  const steps = [];
  let depth = 0;
  const stack = [];
  let i = 0;
  const emit = (step) => {
    const last = steps[steps.length - 1];
    if (step.type === 'chars' && last?.type === 'chars' && last.depth === depth && !last.sealed) last.text += step.text;
    else steps.push({ ...step, depth });
  };
  const seal = () => { const last = steps[steps.length - 1]; if (last) last.sealed = true; };
  const operandEnd = (start) => {
    let j = start;
    if (text[j] === '-') j += 1;
    const c = text[j];
    if (c === '(') { const k = matchClose(text, j, '(', ')'); return k < 0 ? text.length : k + 1; }
    if (c === '{') { const k = matchClose(text, j, '{', '}'); return k < 0 ? text.length : k + 1; }
    if (text.startsWith('\\sqrt', j)) {
      let k = j + 5;
      if (text[k] === '[') k = matchClose(text, k, '[', ']') + 1;
      return text[k] === '{' ? matchClose(text, k, '{', '}') + 1 : k + 1;
    }
    if (text.startsWith('\\pi', j)) return j + 3;
    const call = /^(?:sqrt|cbrt|ln|log(?:_\d+)?|sin|cos|tan)\(/.exec(text.slice(j));
    if (call) return matchClose(text, j + call[0].length - 1, '(', ')') + 1;
    if (/^pi(?![A-Za-z])/.test(text.slice(j))) return j + 2;
    if (/[0-9.]/.test(c || '')) { let k = j; while (/[0-9.]/.test(text[k] || '')) k += 1; return k; }
    if (/[A-Za-z]/.test(c || '')) return text[j + 1] === '_' ? operandEnd(j + 2) : j + 1;
    return j + 1;
  };
  const closePending = () => {
    while (stack.length && stack[stack.length - 1].structural && i >= stack[stack.length - 1].end) {
      stack.pop();
      depth -= 1;
      seal();
    }
  };
  const open = (kind, end, skipClose = null) => {
    depth += 1;
    stack.push({ kind, structural: true, end, skipClose });
  };
  while (i < text.length) {
    closePending();
    const rest = text.slice(i);
    const c = text[i];
    const top = stack[stack.length - 1];
    // A bracket the box already stands for is not typed: the group ends here
    // (a power's or root's at its own end; the logₐ key's own brackets now).
    if (top && top.skipClose === i) {
      if (!top.structural) { stack.pop(); depth -= 1; seal(); }
      i += 1;
      continue;
    }
    if (c === '\uE001') {
      const word = /^\uE001(and|or)\uE001/.exec(rest)[1];
      emit({ type: 'chars', text: word }); seal();
      i += word.length + 2;
    } else if (rest.startsWith('!=')) {
      emit({ type: 'insert', latex: '\\ne' }); seal(); i += 2;
    } else if (c === '∅') {
      emit({ type: 'insert', latex: '\\varnothing' }); seal(); i += 1;
    } else if (rest.startsWith('\\sqrt[')) {
      const indexEnd = matchClose(text, i + 5, '[', ']');
      const bodyOpen = indexEnd + 1;
      const bodyClose = matchClose(text, bodyOpen, '{', '}');
      emit({ type: 'insert', latex: `\\sqrt[${text.slice(i + 6, indexEnd)}]{#0}` }); seal();
      open('radicand', bodyClose + 1, bodyClose);
      i = bodyOpen + 1;
    } else if (rest.startsWith('\\sqrt{')) {
      const bodyClose = matchClose(text, i + 5, '{', '}');
      emit({ type: 'chars', text: 'sqrt' }); seal();
      open('radicand', bodyClose + 1, bodyClose);
      i += 6;
    } else if (rest.startsWith('\\pi')) {
      emit({ type: 'chars', text: 'pi' }); i += 3;
    } else if (/^(?:sqrt|cbrt)\(/.test(rest)) {
      const openAt = i + 4;
      const close = matchClose(text, openAt, '(', ')');
      if (rest.startsWith('cbrt') && natural) emit({ type: 'insert', latex: '\\sqrt[3]{#0}' });
      else emit({ type: 'chars', text: rest.slice(0, 4) });
      seal();
      if (natural) { open('radicand', close + 1, close); i = openAt + 1; } else { open('radicand', close + 1); i = openAt; }
    } else if (natural && /^log_(\d+)\(/.test(rest)) {
      // The logₐ key: its base box, then Tab to its argument.
      const [, base] = /^log_(\d+)\(/.exec(rest);
      const argOpen = i + 4 + base.length;
      const close = matchClose(text, argOpen, '(', ')');
      emit({ type: 'insert', latex: '\\log_{#?}\\left(#0\\right)', template: true }); seal();
      emit({ type: 'raw', text: base }); seal();
      emit({ type: 'press', key: 'Tab', raw: true }); seal();
      depth += 1;
      stack.push({ kind: 'fence', structural: false, skipClose: close });
      i = argOpen + 1;
    } else if (c === '(') {
      emit({ type: 'chars', text: '(' }); seal();
      depth += 1;
      stack.push({ kind: 'fence', structural: false });
      i += 1;
    } else if (c === ')') {
      while (stack.length && stack[stack.length - 1].structural) { stack.pop(); depth -= 1; }
      emit({ type: 'chars', text: ')' }); seal();
      if (stack.length && !stack[stack.length - 1].structural) { stack.pop(); depth -= 1; }
      i += 1;
    } else if (c === '{') {
      emit({ type: 'chars', text: '{' }); seal();
      depth += 1;
      stack.push({ kind: 'brace', structural: false });
      i += 1;
    } else if (c === '}') {
      while (stack.length && stack[stack.length - 1].structural) { stack.pop(); depth -= 1; }
      emit({ type: 'chars', text: '}' }); seal();
      if (stack.length && !stack[stack.length - 1].structural) { stack.pop(); depth -= 1; }
      i += 1;
    } else if (c === '|') {
      const inBrace = stack.some((entry) => entry.kind === 'brace');
      const openAbs = stack[stack.length - 1]?.kind === 'abs';
      if (inBrace && !openAbs) {
        emit({ type: 'press', key: 'Shift+Backslash' }); seal();
      } else if (openAbs) {
        while (stack.length && stack[stack.length - 1].structural) { stack.pop(); depth -= 1; }
        emit({ type: 'press', key: 'Shift+Backslash' }); seal();
        stack.pop(); depth -= 1;
      } else {
        emit({ type: 'press', key: 'Shift+Backslash' }); seal();
        depth += 1;
        stack.push({ kind: 'abs', structural: false });
      }
      i += 1;
    } else if (c === '/' || c === '^' || c === '_') {
      emit({ type: 'chars', text: c }); seal();
      let end = operandEnd(i + 1);
      if (c === '/' && text[end] === '^') end = operandEnd(end + 1);
      let operandStart = i + 1;
      // Natural: a power's, subscript's or root's own brackets are left out.
      if (natural && c !== '/' && text[operandStart] === '(' && matchClose(text, operandStart, '(', ')') === end - 1) {
        open(c === '^' ? 'power' : 'subscript', end, end - 1);
        operandStart += 1;
        i = operandStart;
        continue;
      }
      open(c === '/' ? 'denominator' : c === '^' ? 'power' : 'subscript', end);
      i = operandStart;
    } else {
      emit({ type: 'chars', text: c });
      i += 1;
    }
  }
  steps.push({ type: 'end' });
  return steps;
};

// --- the editor ------------------------------------------------------------------

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
await page.goto(`${ORIGIN}/tests/browser/answerRoundTrip.html`, { waitUntil: 'networkidle', timeout: 180000 });
await page.waitForFunction(() => typeof window.__mmSetProfile === 'function', null, { timeout: 180000 });

const depthNow = () => page.evaluate(() => { const mf = document.querySelector('math-field'); return mf.lastOffset - mf.position; });
const leaveTo = async (target) => {
  for (let guard = 0; guard < 12 && (await depthNow()) > target; guard += 1) await page.keyboard.press('ArrowRight');
};

const typeKey = async (plan) => {
  const nonce = await page.evaluate(() => { window.__mmReset(); return Number(document.querySelector('[data-nonce]')?.getAttribute('data-nonce') || 0); });
  await page.waitForFunction((was) => Number(document.querySelector('[data-nonce]')?.getAttribute('data-nonce') || 0) > was, nonce);
  const box = await page.locator('math-field').first().boundingBox();
  await page.mouse.click(box.x + 30, box.y + box.height / 2);
  await page.waitForFunction(() => document.activeElement?.tagName === 'MATH-FIELD', null, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(80);
  let inTemplate = false;
  for (const step of plan) {
    if (step.type === 'end') { await leaveTo(0); continue; }
    if (!inTemplate && !step.raw && step.type !== 'raw') await leaveTo(step.depth);
    if (step.type === 'chars') {
      for (const character of step.text) await page.keyboard.type(character, { delay: 12 });
    } else if (step.type === 'raw') {
      await page.keyboard.type(step.text, { delay: 12 });
    } else if (step.type === 'press') {
      await page.keyboard.press(step.key);
      if (step.key === 'Tab') inTemplate = false;
    } else if (step.type === 'insert') {
      await page.evaluate((latex) => {
        document.querySelector('math-field').executeCommand(['insert', latex, { selectionMode: 'placeholder' }]);
      }, step.latex);
      if (step.template) inTemplate = true;
    }
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(90);
  return page.evaluate(() => document.querySelector('math-field')?.value ?? '');
};

const grades = async (grading, response) => (await secureItems.gradeItem({ fields: [grading] }, { responses: { answer: response } })).isCorrect === true;

const results = [];
const refused = [];
const modelDiffers = [];
let currentProfile = null;
for (const [index, entry] of selected.entries()) {
  if (entry.profile !== currentProfile) {
    await page.evaluate((profile) => window.__mmSetProfile(profile), entry.profile);
    await page.waitForFunction((profile) => document.querySelector(`[data-profile="${profile}"]`) !== null, entry.profile);
    currentProfile = entry.profile;
  }
  const typedRight = await grades(entry.grading, entry.key);
  for (const variant of ['literal', 'natural']) {
    // A key holding nothing the keypad builds differently is typed once.
    if (variant === 'natural' && planFor(entry.key, 'natural').length === planFor(entry.key, 'literal').length
      && JSON.stringify(planFor(entry.key, 'natural')) === JSON.stringify(planFor(entry.key, 'literal'))) continue;
    let serialized = '';
    // A freshly mounted field can drop the first keystrokes: type again.
    for (let attempt = 0; attempt < 3 && !serialized; attempt += 1) serialized = await typeKey(planFor(entry.key, variant));
    const right = await grades(entry.grading, serialized);
    const model = editorTypedSpelling(entry.key, { variant });
    results.push({ ...entry, variant, serialized, right, typedRight });
    if (!right) refused.push({ key: entry.key, variant, serialized, source: entry.source });
    if (model !== serialized) modelDiffers.push({ key: entry.key, variant, serialized, model, source: entry.source });
  }
  if ((index + 1) % 100 === 0) console.log(`  ${index + 1} keys typed`);
}

// The probes, typed straight through, character by character.
const probes = [];
await page.evaluate((profile) => window.__mmSetProfile(profile), 'expression');
for (const typed of PROBES) {
  let serialized = '';
  for (let attempt = 0; attempt < 3 && !serialized; attempt += 1) serialized = await typeKey([{ type: 'raw', text: typed }]);
  probes.push({ typed, serialized });
  const model = editorTypedSpelling(typed);
  if (model !== serialized) modelDiffers.push({ key: typed, variant: 'typed straight', serialized, model, source: 'probe' });
}
await browser.close();

const byProfile = {};
for (const result of results) {
  const counts = byProfile[result.profile] || { keys: new Set(), spellings: 0, refused: 0 };
  counts.keys.add(result.key);
  counts.spellings += 1;
  if (!result.right) counts.refused += 1;
  byProfile[result.profile] = counts;
}
console.log(`\nTyped ${selected.length} keys, ${results.length} editor spellings.`);
Object.entries(byProfile).forEach(([profile, counts]) => console.log(`  ${profile.padEnd(11)} ${counts.keys.size} keys, ${counts.spellings} spellings, ${counts.refused} refused`));
if (pageErrors.length) console.log(`page errors: ${pageErrors.length}: ${pageErrors[0]}`);
refused.slice(0, 30).forEach((entry) => console.log(`  REFUSED ${entry.variant} key ${JSON.stringify(entry.key)}: the editor held ${JSON.stringify(entry.serialized)}  ${entry.source}`));
modelDiffers.slice(0, 30).forEach((entry) => console.log(`  MODEL ${entry.variant} key ${JSON.stringify(entry.key)}: the editor held ${JSON.stringify(entry.serialized)}, the model writes ${JSON.stringify(entry.model)}`));

if (write) {
  // A field's private grading, less what every field has (the key is its
  // `expected`, the profile its `inputProfile`): editorKeySpellings.test.mjs
  // puts these back (GRADING_DEFAULTS there).
  const GRADING_DEFAULTS = { id: 'answer', weight: 1, partialCredit: null, accepted: [], numericTolerance: 0.000001, caseSensitive: false, equivalence: null };
  const ownGrading = ({ grading, key, profile }) => Object.fromEntries(Object.entries(grading).filter(([name, value]) => {
    if (name === 'expected') return value !== key;
    if (name === 'inputProfile') return value !== profile;
    return !(name in GRADING_DEFAULTS) || JSON.stringify(value) !== JSON.stringify(GRADING_DEFAULTS[name]);
  }));
  const entries = results
    .filter((result) => result.serialized !== result.key.replace(/\s+/g, ''))
    .map((result) => ({ key: result.key, profile: result.profile, variant: result.variant, serialized: result.serialized, grading: ownGrading(result) }));
  const mathliveVersion = JSON.parse(readFileSync(path.join(repo, 'node_modules/mathlive/package.json'), 'utf8')).version;
  const header = {
    note: 'What the real math editor held for each expression and equation key a secure Test can issue (tests/browser/editorKeyRoundTrip.mjs --write). Keys whose editor spelling is their own text are left out.',
    generatedAt: new Date().toISOString(),
    mathlive: mathliveVersion,
    draws: DRAWS,
    keysTyped: selected.length,
    spellingsTyped: results.length,
    probes,
  };
  const text = `${JSON.stringify(header, null, 1).replace(/\n\}$/, ',\n "entries": [\n')}${entries.map((entry) => `  ${JSON.stringify(entry)}`).join(',\n')}\n ]\n}\n`;
  // Written to a temporary name and renamed, so a full disk never leaves half a file.
  writeFileSync(`${RESULT}.tmp`, text);
  JSON.parse(readFileSync(`${RESULT}.tmp`, 'utf8'));
  renameSync(`${RESULT}.tmp`, RESULT);
  console.log(`\nWrote ${entries.length} entries to ${RESULT}`);
}

process.exit(refused.length || modelDiffers.length || pageErrors.length ? 1 : 0);

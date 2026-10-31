#!/usr/bin/env node
/**
 * GR03 equivalence report: which line fields take any equation of their line,
 * and which known answers change verdict.
 *
 * WHY. The owner's decision (2026-10-24): a field whose key is a line takes any
 * equation of that line when the question names no form, and older lessons
 * change only after this report (functions/shared/lineFormPolicy.mjs).
 *
 * WHAT. Every typed field keyed with a line, in
 *
 *   - the Path banks and secure course tests (functions/seeds), drawn through
 *     the production generator on fixed seeds; `seed/pathQuestionBank` is
 *     compared with them and read only where it differs (its unreferenced
 *     `legacy/` banks are read);
 *   - every teacher-import lesson (teacher-import-jsons), compiled as an
 *     import compiles it, with Question Family previews of its family slots;
 *   - drafts/, docs/assignments and the root SAMPLE_*.json files;
 *
 * with the decision for each field (lineFormDecision's reason), and the
 * known answers graded before (no `lineForm`) and after (the decision applied)
 * by the field's real grader: the Path grader (functions/lib/mathPath.js
 * gradeResponse on the private grading) for a bank item, the assignment
 * matcher (answerUtils.matchesFieldAnswer) for a lesson. Known answers: the
 * key and every accepted answer; the key's line written in other forms
 * (slope-intercept, point-slope through two points, standard, multiplied,
 * sides swapped, x first); near misses (another slope or intercept, a point
 * off the line); and every equation the question itself shows.
 *
 * It fails (exit 1) when a known answer goes from right to wrong, or when a
 * near miss or a shown equation becomes right. Each held field is listed:
 * the question names a form but the field does not, the question shows the
 * key's line, or the key is a one-letter equation. A second, exhaustive read
 * of every flipped field's text looks for the key's line around every `=`
 * and reports any that equationsInText missed.
 *
 *   node scripts/report-line-form-equivalence.mjs [--draws 3] [--previews 4] [--out report.json] [--list 12]
 *
 * Read-only: no network; writes only the --out file.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { generatePathInstanceWithRetries, hasPathGenerator, hasPathVariants } from '../functions/shared/pathQuestionGeneration.mjs';
import { answerCandidatesForField, matchesFieldAnswer } from '../functions/shared/answerUtils.mjs';
import '../functions/shared/formSpecificFieldGrading.mjs';
import { parsePolynomial, splitEquationSides } from '../functions/shared/algebraicForm.mjs';
import { equationsInText, isLine, isObliqueLine, sameLine } from '../functions/shared/linearEquationForm.mjs';
import { fieldTexts, lineFormDecision, questionTexts, withLineFormGrading, withLineFormPolicy } from '../functions/shared/lineFormPolicy.mjs';
import { resolveFamilyPreviewInstance } from '../functions/shared/questionFamilyInstance.mjs';
import { compileTeacherImport } from './check-teacher-import.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const mathPath = require('../functions/lib/mathPath.js');
const { compilePathRecordForStorage } = require('../functions/lib/pathFirestoreShape.js');

const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const DRAWS = Math.max(1, Number(argOf('--draws', '3')) || 3);
const PREVIEWS = Math.max(0, Number(argOf('--previews', '4')) || 0);
const OUT = argOf('--out', null);
const LIST = Math.max(1, Number(argOf('--list', '12')) || 12);

// --- the corpus: questions with their fields, as a student is served them ------

const questions = [];
const seenQuestions = new Set();
const addQuestion = (question, source, grader) => {
  const fields = grader === 'path' ? question.responseFields : question.answerFields;
  if (!Array.isArray(fields) || !fields.length) return;
  const id = JSON.stringify([source.split(' ')[0], question.prompt, fields.map((field) => [field?.label, field?.expected ?? field?.answer])]);
  if (seenQuestions.has(id)) return;
  seenQuestions.add(id);
  questions.push({ question, source, grader });
};

const documentsIn = (parsed) => (Array.isArray(parsed) ? parsed : (parsed?.documents || parsed?.items || parsed?.questions || null));
const group = (source) => source.split(' ')[0];

// A Path item: drawn through its generator, else as stored.
const addPathItem = (item, source) => {
  if (!item || typeof item !== 'object' || item.active === false) return;
  let document = item;
  try { document = compilePathRecordForStorage({ ...item, active: true }).document || item; } catch { /* the authored item */ }
  if (hasPathGenerator(document) || hasPathVariants(document)) {
    for (let draw = 0; draw < DRAWS; draw += 1) {
      try {
        const question = generatePathInstanceWithRetries(document, `p-sweep-${draw}`, 4)?.question;
        if (question) addQuestion(question, source, 'path');
      } catch { /* a draw that fails is the generator audit's business */ }
    }
  } else addQuestion(document, source, 'path');
};

// A lesson: compiled as the import compiles it, plus family previews. A file
// that does not compile is read as authored (its `responses` are the fields),
// and counted, so no lesson drops out of the report unseen.
const lessonsNotCompiled = [];
const addLesson = (text, source) => {
  let compiled = [];
  try { compiled = compileTeacherImport(text).questions || []; } catch { compiled = []; }
  if (!compiled.length) {
    lessonsNotCompiled.push(source);
    const visit = (node, depth = 0) => {
      if (!node || typeof node !== 'object' || depth > 12) return;
      if (Array.isArray(node)) { node.forEach((entry) => visit(entry, depth + 1)); return; }
      const fields = node.answerFields || node.responses;
      if (Array.isArray(fields) && fields.length && typeof node.prompt === 'string') {
        addQuestion({ ...node, type: 'multiAnswer', answerFields: fields }, `${source} ${node.questionId || node.id || ''}`.trim(), 'assignment');
        return;
      }
      Object.values(node).forEach((value) => visit(value, depth + 1));
    };
    try { visit(JSON.parse(text)); } catch { /* not JSON */ }
  }
  compiled.forEach((question, index) => {
    const at = `${source} ${question.questionId || `#${index + 1}`}`;
    if (question.type === 'multiAnswer' && !question.questionFamily) addQuestion(question, at, 'assignment');
    if (question.questionFamily) {
      for (let preview = 0; preview < PREVIEWS; preview += 1) {
        const resolved = resolveFamilyPreviewInstance(question, { index: preview });
        if (resolved?.question?.type === 'multiAnswer') addQuestion(resolved.question, `${at} (family preview ${preview})`, 'assignment');
      }
    }
  });
  return compiled.length;
};

const isLessonFile = (parsed) => Boolean(parsed) && !Array.isArray(parsed) && Array.isArray(parsed.sections);

const walk = (dir, visit, skip = () => false) => {
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (skip(full)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, visit, skip);
    else if (name.endsWith('.json') && stat.size < 40e6) visit(full);
  }
};

const readJsonFile = (full) => {
  const text = readFileSync(full, 'utf8');
  try { return { text, parsed: JSON.parse(text) }; } catch { return { text, parsed: null }; }
};

// Any other JSON: a lesson is compiled; otherwise every node that holds
// response fields is a Path-shaped item (drawn when it has a generator).
const addAnyFile = (full) => {
  const { text, parsed } = readJsonFile(full);
  if (!parsed) return;
  const source = path.relative(ROOT, full);
  if (isLessonFile(parsed)) { addLesson(text, source); return; }
  const visit = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 12) return;
    if (Array.isArray(node)) { node.forEach((entry) => visit(entry, depth + 1)); return; }
    if (Array.isArray(node.responseFields)) { addPathItem(node, `${source} ${node.id || ''}`.trim()); return; }
    if (Array.isArray(node.answerFields) && node.type === 'multiAnswer') { addQuestion(node, `${source} ${node.questionId || node.id || ''}`.trim(), 'assignment'); return; }
    Object.values(node).forEach((value) => visit(value, depth + 1));
  };
  visit(parsed);
};

const bankDir = path.join(ROOT, 'functions/seeds/pathQuestionBank');
const secureDir = path.join(ROOT, 'functions/seeds/secureAssessments');
for (const [dir, filter] of [[bankDir, (name) => name.endsWith('_pathQuestionBank_seed.json')], [secureDir, (name) => name.endsWith('.json')]]) {
  for (const name of readdirSync(dir).filter(filter).sort()) {
    const documents = documentsIn(JSON.parse(readFileSync(path.join(dir, name), 'utf8'))) || [];
    documents.forEach((item) => addPathItem(item, `${path.relative(ROOT, path.join(dir, name))} ${item?.id || ''}`.trim()));
  }
}
// seed/pathQuestionBank mirrors functions/seeds; read only a copy that differs.
const seedCopies = { same: [], read: [] };
walk(path.join(ROOT, 'seed'), (full) => {
  const twin = path.join(bankDir, path.basename(full));
  const isMirror = path.dirname(full) === path.join(ROOT, 'seed/pathQuestionBank');
  let same = false;
  try { same = isMirror && readFileSync(twin, 'utf8') === readFileSync(full, 'utf8'); } catch { same = false; }
  if (same) { seedCopies.same.push(path.relative(ROOT, full)); return; }
  seedCopies.read.push(path.relative(ROOT, full));
  addAnyFile(full);
});
walk(path.join(ROOT, 'teacher-import-jsons'), (full) => {
  const { text, parsed } = readJsonFile(full);
  if (isLessonFile(parsed)) addLesson(text, path.relative(ROOT, full));
  else if (parsed) addAnyFile(full);
});
walk(path.join(ROOT, 'docs/assignments'), addAnyFile);
walk(path.join(ROOT, 'drafts'), addAnyFile);
readdirSync(ROOT).filter((name) => /^SAMPLE_.*\.json$/.test(name)).sort().forEach((name) => addAnyFile(path.join(ROOT, name)));

// --- known answers for a line key -----------------------------------------------

const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
// A float coefficient as an exact fraction (denominators up to 10000).
const asFraction = (value) => {
  for (let denominator = 1; denominator <= 10000; denominator += 1) {
    const numerator = Math.round(value * denominator);
    if (Math.abs(numerator / denominator - value) < 1e-9) return [numerator, denominator];
  }
  return null;
};
const fraction = (numerator, denominator) => {
  const sign = denominator < 0 ? -1 : 1;
  const divisor = gcd(numerator, denominator) || 1;
  return [sign * numerator / divisor, sign * denominator / divisor];
};
const show = ([numerator, denominator], { latex = false } = {}) => {
  if (denominator === 1) return String(numerator);
  if (latex) return `${numerator < 0 ? '-' : ''}\\frac{${Math.abs(numerator)}}{${denominator}}`;
  return `(${numerator}/${denominator})`;
};
const plus = (value, options) => (value[0] < 0 ? `-${show([-value[0], value[1]], options)}` : `+${show(value, options)}`);
const addFractions = ([a, b], [c, d]) => fraction(a * d + c * b, b * d);

/** A·x + B·y + C = 0 with integer coefficients, A > 0; null for anything else. */
const integerLine = (key) => {
  const sides = splitEquationSides(key);
  if (!sides) return null;
  const left = parsePolynomial(sides.left);
  const right = parsePolynomial(sides.right);
  if (!left || !right) return null;
  const coefficient = (key2) => (left.get(key2) || 0) - (right.get(key2) || 0);
  const parts = ['x', 'y', ''].map((name) => asFraction(coefficient(name)));
  if (parts.some((part) => !part)) return null;
  const lcm = parts.reduce((acc, [, denominator]) => (acc * denominator) / gcd(acc, denominator), 1);
  let [A, B, C] = parts.map(([numerator, denominator]) => (numerator * lcm) / denominator);
  const divisor = gcd(gcd(A, B), C) || 1;
  [A, B, C] = [A / divisor, B / divisor, C / divisor];
  if (A < 0 || (A === 0 && B < 0)) [A, B, C] = [-A, -B, -C];
  return { A, B, C };
};

const otherFormsOf = (key) => {
  const line = integerLine(key);
  if (!line || line.A === 0 || line.B === 0) return { right: [], wrong: [] };
  const { A, B, C } = line;
  const m = fraction(-A, B);
  const b = fraction(-C, B);
  const at = (x) => addFractions(fraction(m[0] * x, m[1]), b);
  const right = [];
  const wrong = [];
  for (const latex of [false, true]) {
    const o = { latex };
    const wrap = (inner) => (latex ? `\\left(${inner}\\right)` : `(${inner})`);
    right.push(
      `y=${show(m, o)}x${plus(b, o)}`,
      `y${plus(fraction(-b[0], b[1]), o)}=${show(m, o)}${wrap('x-0')}`,
      `y${plus(fraction(-at(m[1])[0], at(m[1])[1]), o)}=${show(m, o)}${wrap(`x-${m[1]}`)}`,
      `y${plus(fraction(-at(-1)[0], at(-1)[1]), o)}=${show(m, o)}${wrap('x+1')}`,
    );
    wrong.push(
      `y=${show(addFractions(m, [1, 1]), o)}x${plus(b, o)}`,
      `y=${show(m, o)}x${plus(addFractions(b, [1, 1]), o)}`,
      `y${plus(fraction(-(at(1)[0] + at(1)[1]), at(1)[1]), o)}=${show(m, o)}${wrap('x-1')}`,
    );
  }
  right.push(`${A}x${B < 0 ? '-' : '+'}${Math.abs(B)}y=${-C}`, `${-A}x${-B < 0 ? '-' : '+'}${Math.abs(B)}y=${C}`,
    `${2 * B}y=${2 * -A}x${plus([2 * -C, 1])}`, `${show(m)}x${plus(b)}=y`,
    `x=${show(fraction(-B, A))}y${plus(fraction(-C, A))}`);
  wrong.push(`${A}x${B < 0 ? '-' : '+'}${Math.abs(B)}y=${-C + 1}`);
  return { right: [...new Set(right)], wrong: [...new Set(wrong)] };
};

// --- grading, before and after ---------------------------------------------------

const gradePath = async (grading, fieldId, response) => {
  const result = await mathPath.gradeResponse(grading, { responses: { [fieldId]: response } });
  return Boolean(result.fieldResults?.find((entry) => entry.id === String(fieldId))?.isCorrect);
};

const lineFields = [];
const changes = [];
const counts = { questions: questions.length, typedLineFields: 0, byReason: {}, byGroup: {}, gradings: 0, rightToWrong: 0, wrongToRight: 0, nearMissNowRight: 0, shownNowRight: 0 };
const extractorMissed = [];

// The key's line written around any `=` of a text, by brute force: every
// window of up to 40 characters either side. Only for the report's
// cross-check of equationsInText.
const bruteForceShowsLine = (texts, keys) => texts.some((value) => {
  const source = String(value ?? '').replace(/\$+/g, ' ').replace(/[−–—]/g, '-');
  for (let index = source.indexOf('='); index >= 0; index = source.indexOf('=', index + 1)) {
    for (let start = Math.max(0, index - 40); start < index; start += 1) {
      for (let end = index + 2; end <= Math.min(source.length, index + 41); end += 1) {
        const candidate = source.slice(start, end);
        if (keys.some((key) => sameLine(candidate, key))) return true;
      }
    }
  }
  return false;
});

for (const { question, source, grader } of questions) {
  const fields = grader === 'path' ? question.responseFields : question.answerFields;
  const pathBefore = grader === 'path' ? mathPath.privateGradingDefinition(question) : null;
  const pathAfter = grader === 'path' ? withLineFormGrading(question, pathBefore) : null;
  for (const [index, field] of fields.entries()) {
    const keys = answerCandidatesForField(field).filter((key) => typeof key === 'string');
    if (!keys.length || !isLine(keys[0])) continue;
    const decision = lineFormDecision(question, field);
    if (decision.reason === 'choice') continue;
    counts.typedLineFields += 1;
    counts.byReason[decision.reason] = (counts.byReason[decision.reason] || 0) + 1;
    const groupCounts = counts.byGroup[group(source)] || (counts.byGroup[group(source)] = {});
    groupCounts[decision.reason] = (groupCounts[decision.reason] || 0) + 1;
    const texts = [...fieldTexts(field), ...questionTexts(question)];
    const shown = [...new Set(texts.flatMap(equationsInText))];
    const entry = { source, grader, field: String(field.id ?? index), label: field.label || null, key: keys[0], accepted: keys.slice(1), oblique: isObliqueLine(keys[0]), reason: decision.reason, request: decision.request, prompt: question.prompt || null, shown, changed: [] };
    lineFields.push(entry);
    if (decision.lineForm && !shown.some((equation) => keys.some((key) => sameLine(equation, key))) && bruteForceShowsLine(texts, keys)) {
      extractorMissed.push(entry);
    }
    const forms = otherFormsOf(keys[0]);
    const responses = [
      ...keys.map((value) => [value, 'key']),
      ...forms.right.map((value) => [value, 'other form']),
      ...forms.wrong.map((value) => [value, 'near miss']),
      ...shown.map((value) => [value, 'shown in the question']),
    ];
    const graded = new Set();
    for (const [response, kind] of responses) {
      if (graded.has(response)) continue;
      graded.add(response);
      counts.gradings += 1;
      const fieldId = pathBefore ? pathBefore.fields[index]?.id : field.id;
      // eslint-disable-next-line no-await-in-loop
      const before = pathBefore ? await gradePath(pathBefore, fieldId, response) : matchesFieldAnswer(response, field);
      // eslint-disable-next-line no-await-in-loop
      const after = pathAfter ? await gradePath(pathAfter, fieldId, response) : matchesFieldAnswer(response, withLineFormPolicy(question, field));
      if (before === after) continue;
      const change = { response, kind, before, after };
      entry.changed.push(change);
      changes.push({ ...change, source, field: entry.field, key: entry.key, reason: entry.reason });
      if (before && !after) counts.rightToWrong += 1;
      else {
        counts.wrongToRight += 1;
        if (kind === 'near miss') counts.nearMissNowRight += 1;
        if (kind === 'shown in the question' && !keys.includes(response)) counts.shownNowRight += 1;
      }
    }
  }
}

// --- the report -------------------------------------------------------------------

const REASON_WORDS = {
  'no-form-named': 'FLIPS: names no form, takes any equation of its line',
  'asked-by-author': 'FLIPS: the author wrote lineForm "any"',
  'form-named-by-field': 'unchanged: the field names a form',
  'form-named-by-question': 'HELD: the question names a form, the field does not',
  'question-shows-the-line': 'HELD: the question shows the key\'s line',
  'one-letter': 'HELD: a one-letter equation (x = c, a step of a solve)',
  'own-rule': 'unchanged: the field has its own rule (equivalence, gradingMode, answerForm)',
  'no-question-text': 'unchanged: no question prompt to read',
  'not-a-line': 'unchanged: not a line',
};
console.log('# GR03 equivalence report: any equation of the line when no form is asked\n');
console.log(`Questions read: ${counts.questions} (Path draws per generated item: ${DRAWS}; family previews per slot: ${PREVIEWS})`);
console.log(`seed/pathQuestionBank copies identical to functions/seeds (not read twice): ${seedCopies.same.length}; read: ${seedCopies.read.join(', ') || 'none'}`);
console.log(`Lesson files read as authored because they do not compile: ${lessonsNotCompiled.length}${lessonsNotCompiled.length ? ` (${lessonsNotCompiled.join(', ')})` : ''}`);
console.log(`Typed fields keyed with a line: ${counts.typedLineFields}`);
Object.entries(counts.byReason).sort((a, b) => b[1] - a[1]).forEach(([reason, count]) => console.log(`  ${String(count).padStart(5)}  ${REASON_WORDS[reason] || reason}`));
console.log('\nBy bank or lesson (fields that flip / held / unchanged):');
Object.entries(counts.byGroup).sort().forEach(([name, byReason]) => {
  const flips = (byReason['no-form-named'] || 0) + (byReason['asked-by-author'] || 0);
  const held = (byReason['form-named-by-question'] || 0) + (byReason['question-shows-the-line'] || 0) + (byReason['one-letter'] || 0);
  const total = Object.values(byReason).reduce((sum, value) => sum + value, 0);
  console.log(`  ${String(flips).padStart(4)} / ${String(held).padStart(4)} / ${String(total - flips - held).padStart(4)}  ${name}`);
});
console.log(`\nKnown answers graded before and after: ${counts.gradings}`);
console.log(`  right → wrong (must be 0):                 ${counts.rightToWrong}`);
console.log(`  wrong → right:                             ${counts.wrongToRight}`);
console.log(`    of them a near miss (must be 0):         ${counts.nearMissNowRight}`);
console.log(`    of them an equation the question shows (must be 0): ${counts.shownNowRight}`);
console.log(`  flipped fields whose text shows the key's line, missed by equationsInText (must be 0): ${extractorMissed.length}`);
const byKind = changes.reduce((acc, change) => ({ ...acc, [`${change.before} → ${change.after} | ${change.kind}`]: (acc[`${change.before} → ${change.after} | ${change.kind}`] || 0) + 1 }), {});
Object.entries(byKind).forEach(([kind, count]) => console.log(`    ${String(count).padStart(5)}  ${kind}`));

const listFields = (title, filter) => {
  const chosen = lineFields.filter(filter);
  if (!chosen.length) return;
  console.log(`\n${title} (${chosen.length})`);
  const seen = new Set();
  for (const entry of chosen) {
    const line = `  ${entry.source} [${entry.field}] ${JSON.stringify(entry.label)} key ${JSON.stringify(entry.key)}`;
    if (seen.has(line)) continue;
    seen.add(line);
    if (seen.size > LIST) { console.log(`  … ${chosen.length - LIST} more (see --out)`); break; }
    console.log(line);
    if (entry.request) console.log(`      asks for a form: ${JSON.stringify(entry.request)}`);
    if (entry.reason === 'form-named-by-question' || entry.reason === 'question-shows-the-line') console.log(`      prompt: ${JSON.stringify(String(entry.prompt || '').slice(0, 200))}`);
    if (entry.reason === 'question-shows-the-line') console.log(`      shows: ${entry.shown.filter((equation) => sameLine(equation, entry.key)).map((equation) => JSON.stringify(equation)).join(', ')}`);
    if (entry.changed.length) console.log(`      now right: ${entry.changed.filter((change) => change.after).slice(0, 3).map((change) => JSON.stringify(change.response)).join(', ')}`);
  }
};
listFields('FLIPS (examples)', (entry) => entry.reason === 'no-form-named' || entry.reason === 'asked-by-author');
listFields('HELD FOR THE OWNER: the question names a form, the field does not', (entry) => entry.reason === 'form-named-by-question');
listFields('HELD FOR THE OWNER: the question shows the key\'s line', (entry) => entry.reason === 'question-shows-the-line');
listFields('HELD FOR THE OWNER: one-letter keys that name no form', (entry) => entry.reason === 'one-letter');
if (extractorMissed.length) listFields('FLIPPED FIELDS WHOSE TEXT SHOWS THE KEY\'S LINE (equationsInText missed it)', (entry) => extractorMissed.includes(entry));
const failing = changes.filter((change) => !change.after || change.kind === 'near miss' || change.kind === 'shown in the question');
if (failing.length) {
  console.log(`\nCHANGES THAT MUST NOT HAPPEN (${failing.length})`);
  failing.slice(0, 40).forEach((change) => console.log(`  ${change.source} [${change.field}] ${JSON.stringify(change.response)} key ${JSON.stringify(change.key)} ${change.kind}: ${change.before} → ${change.after}`));
}

if (OUT) writeFileSync(OUT, `${JSON.stringify({ counts, seedCopies, lineFields, changes, extractorMissed: extractorMissed.map((entry) => entry.source) }, null, 1)}\n`);
if (counts.rightToWrong || counts.nearMissNowRight || counts.shownNowRight || extractorMissed.length) process.exit(1);

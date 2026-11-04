/*
 * SMALL HELPERS FOR THE LESSON BUILDERS IN scripts/content/.
 *
 * A builder writes a teacher-import Assignment V5 file from plain data. These
 * helpers only spell the shapes every lesson repeats — a TEKS alignment, an
 * answer field, an audited CCMR item placed in Practice — so each builder reads
 * as mathematics and words, not as JSON plumbing. Nothing here decides what a
 * student is asked; the builders do.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const bank = require('../../../functions/lib/ccmrAssignmentBank.js');

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** `standard` and `alignments` for a question: one primary TEKS, then secondary ones. */
export const teks = (primary, ...secondary) => ({
  standard: primary,
  alignments: [
    { framework: 'teks', code: primary, role: 'primary' },
    ...secondary.map((code) => ({ framework: 'teks', code, role: 'secondary' })),
  ],
});

export const number = (id, label, answer, extra = {}) => ({ id, label, answer: String(answer), inputProfile: 'number', ...extra });
export const expression = (id, label, answer, extra = {}) => ({ id, label, answer: String(answer), inputProfile: 'expression', ...extra });
/** A simplified radical or rational-exponent answer: same value AND simplest form, in the key's notation. */
export const simplest = (id, label, answer, extra = {}) => expression(id, label, answer, { gradingMode: 'simplestRadicalForm', ...extra });
export const inequality = (id, label, answer, extra = {}) => ({ id, label, answer: String(answer), inputProfile: 'inequality', ...extra });
export const pair = (id, label, answer, extra = {}) => ({ id, label, answer: String(answer), inputProfile: 'orderedPair', ...extra });
export const choice = (id, label, options, answer, extra = {}) => {
  if (!options.includes(answer)) throw new Error(`${id}: the answer "${answer}" is not one of its options.`);
  return { id, label, type: 'choice', options, answer, ...extra };
};

/** The "Let's back up" step: a simpler question with two choices, neither of them the item's answer. */
export const backUp = (prompt, options, correct) => {
  if (!options.includes(correct)) throw new Error(`back-up step "${prompt}": "${correct}" is not an option.`);
  return { prompt: `Let’s back up. ${prompt}`, options, correct };
};

export const guidedNotes = (...steps) => ({ steps: steps.map(([title, instruction]) => ({ title, instruction })) });

/**
 * An Open Sort Board's cards, categories and its one valid sort, from
 * `[{ id, label, cards: [[id, label], …] }, …]`. The cards are listed in the
 * order given by `order` (ids), so the right group is never the reading order.
 */
export const sortBoard = (groups, order) => {
  const cards = new Map(groups.flatMap((group) => group.cards.map(([id, label]) => [id, label])));
  const ids = order || [...cards.keys()];
  if (ids.length !== cards.size || ids.some((id) => !cards.has(id))) throw new Error('sortBoard: `order` must list every card once.');
  return {
    categories: groups.map(({ id, label }) => ({ id, label })),
    items: ids.map((id) => ({ id, label: cards.get(id) })),
    validSchemes: [{ id: 'answer', groups: groups.map((group) => ({ id: group.id, itemIds: group.cards.map(([id]) => id) })) }],
  };
};

export const review = (headline, reasoning, answerSummary, commonError) => ({
  headline, reasoning, ...(answerSummary ? { answerSummary } : {}), commonError,
});

/**
 * A bank solution line in plain text (the same rule the Algebra I DOL #3
 * Honors builder uses): every $ opens or closes a math span, and the few LaTeX
 * commands the bank writes become Unicode. Anything else is refused, never
 * guessed at.
 */
export const plainSolutionText = (text) => {
  let plain = String(text);
  if ((plain.match(/\$/g) || []).length % 2) throw new Error(`An unpaired $ in a bank solution: ${plain}`);
  // A template's {{name}} braces are not LaTeX groups: they are set aside
  // while the LaTeX is rewritten, and put back exactly as written.
  const placeholders = [];
  plain = plain.replace(/\{\{[^{}]*\}\}/g, (token) => `⟪${placeholders.push(token) - 1}⟫`);
  [
    ['\\dfrac', '\\frac'], ['\\le', '≤'], ['\\ge', '≥'], ['\\cdot', '·'], ['\\pm', '±'], ['\\ne', '≠'],
    ['\\left', ''], ['\\right', ''],
  ].forEach(([latex, unicode]) => { plain = plain.split(latex).join(unicode); });
  // Exponent groups ^{…}, \sqrt{…}, \sqrt[n]{…} and \frac{a}{b}, innermost
  // first, as the student reads them, until nothing is left to rewrite.
  for (let guard = 0; guard < 12; guard += 1) {
    const before = plain;
    plain = plain
      .replace(/\^\{([^{}]*)\}/g, '^($1)')
      .replace(/\\sqrt\[([^\]]*)\]\{([^{}]*)\}/g, 'root($1)($2)')
      .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
    if (plain === before) break;
  }
  plain = plain.replace(/\$([^$]*)\$/g, '$1');
  plain = plain.replace(/⟪(\d+)⟫/g, (_, index) => placeholders[Number(index)]);
  if (/[$\\]/.test(plain)) throw new Error(`A bank solution keeps markup MathMaster will not rewrite: ${plain}`);
  return plain.replace(/\s*(≤|≥)\s*/g, ' $1 ');
};

const bankDocuments = new Map();
const loadBankDocument = (framework, documentId) => {
  if (!bankDocuments.has(framework)) {
    const payload = JSON.parse(readFileSync(path.join(ROOT, 'functions/seeds/pathQuestionBank', bank.FRAMEWORK_FILES[framework]), 'utf8'));
    bankDocuments.set(framework, Array.isArray(payload?.items) ? payload.items : payload?.documents || []);
  }
  const document = bankDocuments.get(framework).find((entry) => entry?.id === documentId);
  if (!document) throw new Error(`The audited ${framework} bank has no item ${documentId}.`);
  return document;
};

/**
 * A choice field with a reason for each option, right after its answer: a
 * question made only of choices has one try, and after it oneTryChoice.js
 * shows the reason for the option the student chose. `reasons` gives one per
 * option in the field's own option order (a bank item's options are
 * templates such as "{{answer}}", which the family fills in the reason keys
 * as it fills the options); a list of any other length is refused.
 */
const withOptionRationales = (field, reasons) => {
  const options = (field.options || []).map(String);
  if (!Array.isArray(reasons) || reasons.length !== options.length || reasons.some((reason) => !String(reason || '').trim())) {
    throw new Error(`${field.id}: write one reason for each of its ${options.length} options (${options.join(' | ')}).`);
  }
  return Object.fromEntries(Object.entries(field).flatMap(([key, value]) => (key === 'answer'
    ? [[key, value], ['optionRationales', Object.fromEntries(options.map((option, index) => [option, reasons[index]]))]]
    : [[key, value]])));
};

/**
 * An audited CCMR item from MathMaster's bank, placed in Practice exactly as
 * the bank converts it: its prompt, answer, generator, alignments and
 * provenance are untouched. The lesson adds only its own question id, a
 * "Let's back up" step, its worked solution in plain text (the bank writes it
 * in $…$ LaTeX, which outside a prompt reaches the student as markup), a reason
 * for each option of a choice ({ fieldId: [reason per option] }) and an
 * assignment-local Question Family, so each student gets their own numbers and
 * the server grades it.
 */
export const auditedCcmrQuestion = ({ framework = 'digitalSAT', documentId, questionId, scaffold, commonError, optionRationales = null }) => {
  const { activityRole: _role, questionId: _id, ...intent } = bank.bankDocumentToV5Intent(loadBankDocument(framework, documentId), { activityRole: 'practice' });
  const choiceFields = (intent.answerFields || []).filter((field) => field.type === 'choice');
  if (choiceFields.length && !optionRationales) throw new Error(`${documentId} is a choice item, one try: give a reason for each option.`);
  if (optionRationales) {
    const known = new Set(choiceFields.map((field) => field.id));
    Object.keys(optionRationales).forEach((id) => { if (!known.has(id)) throw new Error(`${documentId} has no choice field ${id}.`); });
    intent.answerFields = intent.answerFields.map((field) => (optionRationales[field.id] ? withOptionRationales(field, optionRationales[field.id]) : field));
  }
  const solutionReview = Object.fromEntries(Object.entries(intent.solutionReview || {}).map(([key, value]) => (
    [key, Array.isArray(value) ? value.map(plainSolutionText) : plainSolutionText(value)]
  )));
  if (!solutionReview.commonError) {
    if (!commonError) throw new Error(`${documentId} names no usual mistake; write one.`);
    solutionReview.commonError = commonError;
  }
  return {
    questionId,
    ...JSON.parse(JSON.stringify(intent)),
    solutionReview,
    scaffold: JSON.parse(JSON.stringify(scaffold)),
    questionFamily: { scope: 'assignment' },
  };
};

/** A lesson file, written with a trailing newline, the way the other imports are kept. */
export const writeLessonFile = (relativePath, lesson) => {
  const file = path.join(ROOT, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(lesson, null, 2)}\n`);
  return file;
};

export const lessonText = (lesson) => `${JSON.stringify(lesson, null, 2)}\n`;

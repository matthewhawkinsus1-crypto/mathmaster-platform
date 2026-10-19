/*
 * READ THE WHOLE QUESTION — what Read aloud says for one question, in the
 * order the student sees it (pass 3, HELP-6 / H-115).
 *
 * Read aloud used to say the prompt (and, from the work bar, the "Information
 * you need" card). A student with a read-aloud accommodation then heard "What
 * are the dimensions of CD?" and nothing of the four choices under it, nor the
 * field labels ("Slope of the perpendicular line"), nor the step of a composed
 * question they were on, nor the matrices the question is about, nor the
 * "Let's back up" question that stops their work until it is answered.
 *
 *   questionReadingParts(question, context) → [{ id, kind, label, text }]
 *   questionReadingText(parts)              → the whole question, one text
 *
 * Each part is one thing on the screen, so a student can hear just that part
 * again (the Support tools tray lists them). `text` is what the screen shows,
 * mathematics included; speakAloud (./speechText.js) turns the mathematics
 * into words, so a part says "c of x" and "4 dollars and 50 cents" like the
 * rest of Read aloud. `functionNames` (the one-letter functions the question
 * defines, "c(x) = …") travels with every part: "Find c(4)" heard on its own
 * is still "c of 4".
 *
 * Choices are said in the order they are drawn: the same shuffle as the
 * screen (choiceOptionsForField for a multi-answer field, the stage shuffle
 * for a composed step). They carry no letters, because the screen shows none.
 *
 * Pure: no React, no speech engine. Nothing here is graded or stored.
 */
import { choiceOptionsForField, choiceSeed, multiAnswerChoiceSeed, stableShuffleChoices, strengthenTwoChoiceSet } from '../interaction/choiceOptions.js';
import { readDisplayMatrices } from '../math/displayMatrices.js';
import { backUpQuestionText } from '../supports/feedback/backUpStep.js';
import { definedFunctionNames } from './speechText.js';

const WORDS = {
  en: {
    backUp: 'Let’s back up.',
    choices: 'Choices',
    or: 'or',
    information: 'Information you need',
    step: (index, total) => (index && total ? `Step ${index} of ${total}` : 'This step'),
    answerBox: 'Answer box',
    system: 'The system',
    matrix: (name, rows, columns) => `${name ? `Matrix ${name}` : 'A matrix'}, ${rows} by ${columns}.`,
    row: (index) => `Row ${index}`,
    table: (label, rows) => `${label || 'A table'}, ${rows} ${rows === 1 ? 'row' : 'rows'}.`,
    columns: 'Columns',
    blank: 'blank',
    of: 'of',
    dollars: 'dollars',
    figure: 'A figure',
    labels: { table: 'The table', figure: (index) => `Figure ${index}`, question: 'The question', backUp: 'Let’s back up', information: 'Information you need', step: 'This step', system: 'The system', matrix: (name) => (name ? `Matrix ${name}` : 'The matrix'), part: (index) => `Part ${index}` },
  },
  es: {
    backUp: 'Retrocedamos un paso.',
    choices: 'Opciones',
    or: 'o',
    information: 'Información que necesitas',
    step: (index, total) => (index && total ? `Paso ${index} de ${total}` : 'Este paso'),
    answerBox: 'Casilla de respuesta',
    system: 'El sistema',
    matrix: (name, rows, columns) => `${name ? `Matriz ${name}` : 'Una matriz'}, de ${rows} por ${columns}.`,
    row: (index) => `Fila ${index}`,
    table: (label, rows) => `${label || 'Una tabla'}, de ${rows} ${rows === 1 ? 'fila' : 'filas'}.`,
    columns: 'Columnas',
    blank: 'en blanco',
    of: 'de',
    dollars: 'dólares',
    figure: 'Una figura',
    labels: { table: 'La tabla', figure: (index) => `Figura ${index}`, question: 'La pregunta', backUp: 'Retrocedamos', information: 'Información que necesitas', step: 'Este paso', system: 'El sistema', matrix: (name) => (name ? `Matriz ${name}` : 'La matriz'), part: (index) => `Parte ${index}` },
  },
};
const wordsFor = (language) => WORDS[String(language || 'en').toLowerCase().split('-')[0]] || WORDS.en;

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
// A sentence ends once: "Find x." + "." is not read as a pause twice.
const sentence = (value) => {
  const text = clean(value);
  if (!text) return '';
  return /[.?!:;]$/.test(text) ? text : `${text}.`;
};
const optionText = (option) => clean(typeof option === 'string' || typeof option === 'number' ? option : option?.label ?? option?.id ?? '');

/** "Choices: −6; 6; 0; or −2." — semicolons, because a choice may hold a comma ("(2, 3)"). */
export const choicesSentence = (options = [], { language = 'en' } = {}) => {
  const w = wordsFor(language);
  const list = (Array.isArray(options) ? options : []).map(optionText).filter(Boolean);
  if (!list.length) return '';
  const spoken = list.length === 1 ? list[0] : `${list.slice(0, -1).join('; ')}; ${w.or} ${list[list.length - 1]}`;
  return `${w.choices}: ${spoken}.`;
};

/** One matrix the question shows, row by row ("Row 1: 2, −1."), with its labels when it has them. */
export const matrixReading = (matrix, { language = 'en' } = {}) => {
  const w = wordsFor(language);
  if (!matrix || !Array.isArray(matrix.rows) || !matrix.rows.length) return '';
  const columns = matrix.rows[0].length;
  const lines = [w.matrix(clean(matrix.name), matrix.rows.length, columns)];
  if (matrix.caption) lines.push(sentence(matrix.caption));
  matrix.rows.forEach((row, rowIndex) => {
    const rowName = matrix.rowLabels?.[rowIndex] ? clean(matrix.rowLabels[rowIndex]) : w.row(rowIndex + 1);
    const cells = row.map((cell, columnIndex) => (matrix.colLabels?.[columnIndex] ? `${clean(matrix.colLabels[columnIndex])} ${clean(cell)}` : clean(cell)));
    lines.push(`${rowName}: ${cells.join(', ')}.`);
  });
  return lines.join(' ');
};

/**
 * A table the question shows (displayTable.js), row by row with its headers:
 * "Row 1: x 0; y 3." A cell the student fills in is said "blank" — never its
 * value, which on a fillable table is the answer.
 */
export const tableReading = (table, { label = '', language = 'en' } = {}) => {
  const w = wordsFor(language);
  if (!table || !Array.isArray(table.columns) || !table.columns.length || !Array.isArray(table.rows) || !table.rows.length) return '';
  // A column headed "c(x)" is the function's output, never "c times x".
  const headers = table.columns.map((column) => clean(column.label ?? column.key)
    .replace(/^\$?([A-Za-z])\(([A-Za-z])\)\$?$/, (match, name, input) => `${name} ${w.of} ${input}`)
    // A unit "($)" is a word: two of them would pair as a formula's delimiters.
    .replace(/\(\s*\\?\$\s*\)/g, `(${w.dollars})`));
  const lines = [w.table(clean(label).replace(/[.:]$/, ''), table.rows.length), `${w.columns}: ${headers.join('; ')}.`];
  table.rows.forEach((row, rowIndex) => {
    const cells = headers.map((header, columnIndex) => {
      const cell = Array.isArray(row) ? row[columnIndex] : null;
      const value = cell === null || cell === undefined || clean(cell) === '' ? w.blank : clean(cell);
      // "x, −2": a comma, or "x −2" is heard "x minus 2".
      return header ? `${header}, ${value}` : value;
    });
    lines.push(`${w.row(rowIndex + 1)}: ${cells.join('; ')}.`);
  });
  return lines.join(' ');
};

const stageChoices = (stage, workflow = []) => {
  const authored = Array.isArray(stage?.choices) ? stage.choices : [];
  if (!authored.length) return [];
  // WorkflowRunner's ChoiceStage: a step another step branches on, and a
  // classification, are drawn exactly as authored (then shuffled).
  const controlsBranch = (Array.isArray(workflow) ? workflow : [])
    .some((other) => other && typeof other.showWhen === 'object' && String(other.showWhen?.stage || '') === String(stage.id));
  const closedSet = controlsBranch || stage.kind === 'classification';
  return stableShuffleChoices(closedSet ? authored : strengthenTwoChoiceSet(authored), choiceSeed(stage.id, stage.prompt, stage.label));
};

/**
 * The parts of one question, in reading order.
 *
 * context:
 *   referenceInfo  resolveReferenceInfo(question) — the "Information you need" card
 *   backUp         the "Let's back up" step { prompt, options } WHILE it blocks the work
 *   stage          { stage, index, total, workflow } — a composed question's current step
 *   language       the language the screen is in ('en', or the student's when an
 *                  authored translation is shown)
 *   figures        what the tables, graphs and tool drawings on the screen
 *                  already say (figureReadings.js: { kind: 'table', label, table }
 *                  or { kind: 'figure', label, text }), in screen order. A
 *                  figure's text is its own description, under its own rule:
 *                  while the question can be answered, no positions.
 */
export const questionReadingParts = (question, { referenceInfo = null, backUp = null, stage = null, language = 'en', figures = [] } = {}) => {
  if (!question || typeof question !== 'object') return [];
  const w = wordsFor(language);
  const parts = [];
  const add = (id, kind, label, text) => {
    const value = clean(text);
    if (value) parts.push({ id, kind, label, text: value });
  };

  // The back-up question first: until it is answered, it is the only thing
  // the student can do.
  if (backUp?.prompt) {
    // Said once: a family's prompt opens with the same words.
    add('back-up', 'back-up', w.labels.backUp, [w.backUp, sentence(backUpQuestionText(backUp.prompt)), choicesSentence(backUp.options, { language })].join(' '));
  }

  add('prompt', 'prompt', w.labels.question, sentence(question.prompt));

  const statements = (referenceInfo?.statements || []).map((entry) => sentence(entry?.text)).filter(Boolean);
  if (statements.length) add('information', 'information', w.labels.information, [`${clean(referenceInfo.title) || w.information}:`, ...statements].join(' '));

  readDisplayMatrices(question)
    .filter((entry) => entry.kind === 'matrix')
    .forEach((entry, index) => add(`matrix-${index + 1}`, 'matrix', w.labels.matrix(entry.matrix.name), matrixReading(entry.matrix, { language })));

  // A system the tool shows (Matrix Lab) but the prompt does not write out.
  const equations = question.showEquations === false || !Array.isArray(question.equations) ? [] : question.equations.map(clean).filter(Boolean);
  if (equations.length) add('system', 'system', w.labels.system, `${w.system}: ${equations.join('; ')}.`);

  // Tables, graphs and what a tool draws, where the screen shows them (after
  // the prompt's own material, before the step and the fields that ask about
  // them). Each says only what the figure itself already says.
  let tableCount = 0;
  let figureCount = 0;
  (Array.isArray(figures) ? figures : []).forEach((entry) => {
    if (entry?.kind === 'table') {
      tableCount += 1;
      add(`table-${tableCount}`, 'table', clean(entry.label) || w.labels.table, tableReading(entry.table, { label: entry.label, language }));
    } else if (entry?.kind === 'figure' && clean(entry.text)) {
      figureCount += 1;
      const name = clean(entry.label);
      add(`figure-${figureCount}`, 'figure', name || w.labels.figure(figureCount), [sentence(name || w.figure), sentence(entry.text)].join(' '));
    }
  });

  if (stage?.stage) {
    const current = stage.stage;
    const index = Number.isFinite(Number(stage.index)) ? Number(stage.index) + 1 : null;
    const total = Number(stage.total) || null;
    const prompt = clean(current.prompt || current.label);
    const choices = stageChoices(current, stage.workflow);
    if (prompt || choices.length) {
      add(`step-${current.id || index || 1}`, 'step', w.labels.step, [`${w.step(index, total)}:`, sentence(prompt), choicesSentence(choices, { language })].filter(Boolean).join(' '));
    }
  }

  const fields = (Array.isArray(question.answerFields) ? question.answerFields : []).filter((field) => field?.id);
  fields.forEach((field, index) => {
    const label = clean(field.label || field.id);
    const options = choiceOptionsForField(field, multiAnswerChoiceSeed(question, field));
    const text = options
      ? [sentence(label), choicesSentence(options, { language })].join(' ')
      : `${w.answerBox}: ${sentence(label)}`;
    add(`part-${field.id}`, 'part', fields.length > 1 ? w.labels.part(index + 1) : label, text);
  });

  // Every function the question defines, anywhere: a part heard on its own
  // still says "c of 4".
  const functionNames = definedFunctionNames(parts.map((part) => part.text).join(' '));
  return parts.map((part) => ({ ...part, functionNames }));
};

/** The whole question, as one text for Read aloud. */
export const questionReadingText = (parts = []) => (Array.isArray(parts) ? parts : []).map((part) => part.text).filter(Boolean).join(' ');

/** The function names the parts carry (the same for every part). */
export const readingFunctionNames = (parts = []) => (Array.isArray(parts) && parts[0]?.functionNames) || '';

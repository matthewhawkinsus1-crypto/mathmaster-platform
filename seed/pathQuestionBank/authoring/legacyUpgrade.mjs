// Mechanically upgrading the starter bank so no student ever types a letter.
//
// THE SITUATION THIS HANDLES. There are 97 Algebra standards and a finite
// amount of authoring time. Hand-written production families arrive standard by
// standard; the starter items are what a student meets in the meantime. Leaving
// them exactly as they were would mean the single worst defect in the bank —
// "A) … B) … C) … D) … Type A, B, C, or D." typed into the prompt — surviving on
// every standard nobody has reached yet.
//
// So the starter items are rewritten INTO the shape the new renderer supports:
// the options become real selectable choices, the "type a letter" instruction
// disappears, and a numeric answer gets a numeric input instead of a text box.
// Nothing about the mathematics changes and nothing about the grading changes —
// the expected answer is still the same option, still stored server-side.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not invent a solution review.
// Generating "The correct answer is B because it is correct" would satisfy the
// quality audit while teaching nobody, and the whole point of the audit is that
// it should not be satisfiable that way. An upgraded item therefore stays
// CANDIDATE quality and the coverage dashboard says so, standard by standard,
// until a human writes the real families.

const OPTION_LINE = /^\s*([A-H])[).]\s*(.+?)\s*$/;
const TYPE_A_LETTER = /\n?\s*Type\s+[A-H](?:\s*,\s*[A-H])*(?:\s*,?\s*or\s+[A-H])?\s*\.?\s*$/i;

import { deterministicShuffle } from './kit.mjs';

const list = (value) => (Array.isArray(value) ? value : []);

/**
 * Pull an "A) … B) …" block out of a prompt.
 *
 * Returns null when the prompt has no option block, which is how the caller
 * knows to leave the item as a typed response.
 */
export const extractPromptOptions = (prompt) => {
  const text = String(prompt || '').replace(TYPE_A_LETTER, '').trimEnd();
  const lines = text.split('\n');
  const options = [];
  let firstOptionIndex = -1;

  lines.forEach((line, index) => {
    const match = line.match(OPTION_LINE);
    if (!match) return;
    // Only treat a run of option lines at the END of the prompt as the option
    // block. A stem that happens to begin "A) " is not what this is for.
    if (firstOptionIndex === -1) firstOptionIndex = index;
    options.push({ letter: match[1].toUpperCase(), label: match[2] });
  });

  if (options.length < 2 || firstOptionIndex === -1) return null;
  // Every line from the first option onwards must be an option or blank,
  // otherwise this is prose that merely looks like a list.
  const tail = lines.slice(firstOptionIndex);
  if (!tail.every((line) => !line.trim() || OPTION_LINE.test(line))) return null;

  return {
    stem: lines.slice(0, firstOptionIndex).join('\n').trim(),
    options,
  };
};

/** What kind of box a typed answer deserves, from the answer itself. */
export const inferInputProfile = (expected) => {
  const text = String(expected ?? '').trim();
  if (!text) return 'text';
  if (/^-?\d+(\.\d+)?$/.test(text)) return 'number';
  if (/^-?\d+\s*\/\s*-?\d+$/.test(text)) return 'number';
  if (/^[[(].*[\])]$/.test(text) && text.includes(',')) return 'interval';
  if (/^[<>]=?|^[≤≥]/.test(text) || /[<>≤≥]/.test(text)) return 'inequality';
  if (/=/.test(text)) return 'equation';
  if (/[a-zA-Z]/.test(text) && /[+\-*/^√]/.test(text)) return 'expression';
  return 'text';
};

/**
 * Upgrade one starter document.
 *
 * Returns the same document when there is nothing to do, so the function is
 * safe to run over a whole bank.
 */
export const upgradeLegacyQuestion = (question = {}) => {
  const fields = list(question.responseFields);
  const parsed = extractPromptOptions(question.prompt);

  if (parsed && fields.length === 1) {
    const expectedLetter = String(fields[0]?.expected ?? '').trim().toUpperCase();
    // The starter bank put the correct option first almost every time. Shuffling
    // by the item's own id fixes that without changing which option is correct,
    // and keeps the order stable so a refresh does not reshuffle the question
    // underneath a student.
    const choices = deterministicShuffle(parsed.options, question.id || parsed.stem).map((option, index) => ({
      id: `opt-${index + 1}`,
      label: option.label,
      letter: option.letter,
    }));
    const correct = choices.find((choice) => choice.letter === expectedLetter);
    if (correct) {
      return {
        ...question,
        prompt: parsed.stem,
        choices: choices.map((choice) => ({ id: choice.id, label: choice.label })),
        responseFields: [{
          ...fields[0],
          label: 'Choose the correct answer',
          inputProfile: 'choice',
          expected: correct.id,
        }],
        authoring: {
          source: 'MathMaster starter bank, mechanically upgraded to a real choice interaction',
          upgraded: true,
          needsAuthoredReview: true,
        },
      };
    }
  }

  if (fields.length) {
    // Not multiple choice: at least give the answer the right kind of input.
    return {
      ...question,
      prompt: String(question.prompt || '').replace(TYPE_A_LETTER, '').trim(),
      responseFields: fields.map((field) => ({
        ...field,
        inputProfile: field.inputProfile && field.inputProfile !== 'text'
          ? field.inputProfile
          : inferInputProfile(field.expected),
      })),
      authoring: {
        source: 'MathMaster starter bank, mechanically upgraded',
        upgraded: true,
        needsAuthoredReview: true,
      },
    };
  }

  return question;
};

export const upgradeLegacyBank = (documents = []) => list(documents).map(upgradeLegacyQuestion);

export default upgradeLegacyBank;

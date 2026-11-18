/*
 * A PROMPT THAT NEEDS ANOTHER QUESTION'S ANSWER — a Pre-Flight WARNING, never
 * a block (#554 item 6; #383 R9 and its authoring observation, "the intercepts
 * you just found").
 *
 * "Use the prices you found." reads well in the order the lesson was written,
 * and only there. Questions can be shown one at a time or in another order,
 * given as a Recovery version, or left out of a student's shortened
 * assignment, so the question can reach a student who never found the prices.
 *
 * ADVISORY, like answerKeyPreflight.js and impossibleItemsPreflight.js: its
 * own panel, never the readiness diagnostics. A warning diagnostic makes an
 * assignment "Needs Review", and nothing here stops a question from working:
 * it is graded exactly as before. The teacher decides.
 *
 * PRECISION BEFORE RECALL. A note on a good question teaches teachers to
 * ignore Pre-Flight, so a reference is listed only when all of these hold:
 *
 *   1. It points back at a result: "the slope you found", "what you just
 *      calculated", "the equation you wrote", or names another question
 *      ("your answer to the previous question", "from Question 3", "from #2").
 *      Drawings ("the line you just graphed") are not read: what was drawn is
 *      nearly always named again ("g(x) = 3x − 8, the line you just graphed").
 *   2. Nothing on the same screen comes before it that it can point at. An
 *      earlier part of the question (an answer box, a step, a direction) or an
 *      earlier instruction in its own words ("Find m, then use the slope you
 *      found") is the multi-part question doing its job, and is never listed.
 *   3. The value is not given with it: "Use the snack prices you found: a hot
 *      dog costs $2", "From the last problem: x³ + … = (x − 3)(…)", "The slope
 *      you found is 3/4", "x = 4, the value you found".
 *   4. It is not someone's quoted words, and does not point inside the
 *      question ("the value you found in Part A", "above").
 *
 * What it deliberately leaves alone: "answer the last question" (the story's
 * own question), "the previous step", a textbook's "(Exercise 3)", a numbered
 * question the item has as many parts as ("Use your answer to question 1"
 * with two parts), hints, worked solutions and feedback.
 *
 * Pure: no React, no Firestore. Not in a student's first load.
 */
import { asksSomething, questionScreenText, questionScreenVersions, sentenceAt, sentenceClauses } from './questionScreenText.js';

const asArray = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// 1. A RESULT A STUDENT PRODUCED, pointed at from a relative clause: "the
// prices you found", "what you just calculated", "the equation that you wrote".
// "got" only in the simple past ("the answer you got"): "Show Me What You've
// Got!" is a lesson's heading, and "you've got" is "you have".
const RESULT_VERB = String.raw`(?:found|calculated|computed|determined|obtained|derived|wrote|worked\s+out|figured\s+out|came\s+up\s+with|ended\s+up\s+with|solved\s+for)`;
const YOU_RESULT = new RegExp(String.raw`\byou(?:(?:\s+(?:have|had)|['’]ve|['’]d)?\s+(?:just\s+|already\s+|previously\s+|earlier\s+)?${RESULT_VERB}|\s+(?:just\s+)?got)(?![\w'’-])`, 'gi');
// The word that opens the noun phrase the result is: "the", "what", "those"…
const LEADS = new Set(['the', 'your', 'those', 'these', 'that', 'this', 'each', 'both', 'all', 'what', 'which', 'any']);
const RELATIVIZERS = new Set(['that', 'which']);
// A verb with its own object is a statement, not a pointer: "You found
// x⁴ − … = (x − 2)(…)", "If you found the slope".
const OBJECT_AFTER = /^\s+(?:a|an|the|that|this|these|those|his|her|their|its|our|my|both|each|every|all|some|no)\b|^\s*(?:[−-]?\s*\d|\$|\\|[A-Za-z]\s*[=<>≤≥(])/i;

// ANOTHER QUESTION, named: "from the previous question", "to Question 3",
// "in Problem 2", "from #2", "the last problem's". Not "answer the last
// question" (the situation's own question), not "the previous step".
const OTHER_QUESTION = String.raw`(?:previous|preceding|prior|last|earlier)\s+(?:question|problem|item|exercise|task)s?`;
const NUMBERED_QUESTION = String.raw`(?:(?:question|problem)\s*(?:#|no\.|number)?\s*(\d+)[a-z]?|#\s*(\d+)[a-z]?)`;
const NAMED_OTHER = new RegExp(String.raw`\b(?:from|in|on|to|for|of|after|than|with|as\s+in|like\s+in)\s+(?:the\s+)?(?:${OTHER_QUESTION}|${NUMBERED_QUESTION})(?![\w-])|\bthe\s+${OTHER_QUESTION}['’]s(?![\w-])`, 'gi');

// 3. THE VALUE GIVEN WITH IT. A value starts with a digit, $, \(, a bracket,
// a root, or a letter about to be set equal ("x = 4", "c(2) = 7").
const VALUE = String.raw`(?:\$|\\\(|\\\[|[−-]?\s*\d|\(|√|π|∞|\{|[A-Za-z]\s*(?:=|\(|≤|≥|<|>))`;
// Straight after it: a colon or a dash that carries a value, a bracketed or
// comma'd value, "to be 4", "= 4", "is 3/4".
const ABOUT = String.raw`(?:about\s+|approximately\s+|exactly\s+)?`;
const VALUE_RIGHT_AFTER = new RegExp(String.raw`^\s*(?::|[—–]|\s-\s|\()[^.?!]*?(?:\d|\$|=|\\)|^\s*,\s*${VALUE}|^\s+to\s+be\s+${VALUE}|^\s*[=≈]\s*${VALUE}|^\s+(?:is|are|was|were|equals?)\s+${ABOUT}${VALUE}`, 'i');
// Later in its sentence, the value stated: "you found that x = 4", "your
// answer was 12", "which are $8 and $16", ": student $8". Not any "=" (in
// "Use the value you found to solve x + 3 = 9" the equation is not the value).
const VALUE_LATER = new RegExp(String.raw`\b(?:found|got|calculated|computed|wrote|showed|determined|learned|saw)\s+(?:that\s+)?(?:(?:the|your)\s+[\w-]+(?:\s+[\w-]+)?\s+(?:is|was|are|were)\s+)?${ABOUT}${VALUE}|\b(?:which|it|they|answers?|results?|solutions?|values?)\s+(?:is|was|are|were)\s+${ABOUT}${VALUE}|:\s*[^.?!]*?${VALUE}`, 'i');
// Just before it, as an appositive: "x = 4, the value you found".
const VALUE_BEFORE = /(?:\d|\)|\$|[A-Za-z]\s*=\s*[^,]{1,40}),\s*$/;

// 2. A GENERAL INSTRUCTION ("Answer each question.", "Complete every response
// for this review task.") asks for nothing a later part could point back at.
const GENERAL_INSTRUCTION = /^(?:answer|complete|fill\s+in|respond\s+to|do)\s+(?:each|every|all|the)\s+(?:of\s+the\s+)?(?:questions?|responses?|parts?|boxes?|items?|blanks?|steps?)\b/i;
const asksForSomething = (clause) => asksSomething(clause) && !GENERAL_INSTRUCTION.test(String(clause).trim());

// 4. POINTING INSIDE THE QUESTION: "the value you found in Part A", "above".
const INSIDE_THE_QUESTION = /^\s*(?:(?:in|from|on|for|at)\s+(?:part|step|stage|box|row|column|line|table|graph|diagram)\b|(?:in|from)\s+\(?[a-z0-9]\)|(?:above|below)\b|(?:on|in)\s+this\s+(?:page|screen|question)\b)/i;

const quotedSpans = (text) => [...String(text).matchAll(/“[^”]*”|"[^"]*"/g)].map((match) => [match.index, match.index + match[0].length]);
const insideQuotes = (spans, index) => spans.some(([start, end]) => index > start && index < end);

// The nearest word that opens the result's noun phrase, within the clause.
const leadBefore = (text, at) => {
  const before = text.slice(0, at);
  const clauseStart = Math.max(0, ...[...before.matchAll(/[.?!;:](?=\s)/g)].map((match) => match.index + 1));
  const words = [...before.slice(clauseStart).matchAll(/[A-Za-z’']+/g)];
  let end = words.length;
  while (end > 0 && RELATIVIZERS.has(words[end - 1][0].toLowerCase()) && end === words.length) end -= 1;
  for (let index = end - 1; index >= Math.max(0, end - 7); index -= 1) {
    if (LEADS.has(words[index][0].toLowerCase())) return clauseStart + words[index].index;
  }
  return -1;
};

/** Every place in `text` that points back at a result or another question: [{ start, end, numbered }]. */
export const backReferences = (text) => {
  const value = String(text ?? '');
  const found = [];
  for (const match of value.matchAll(YOU_RESULT)) {
    const end = match.index + match[0].length;
    if (OBJECT_AFTER.test(value.slice(end))) continue;
    const start = leadBefore(value, match.index);
    if (start < 0) continue;
    found.push({ start, end, numbered: null });
  }
  for (const match of value.matchAll(NAMED_OTHER)) {
    const number = match[1] || match[2];
    found.push({ start: match.index, end: match.index + match[0].length, numbered: number ? Number(number) : null });
  }
  return found.sort((a, b) => a.start - b.start);
};

const givenWithIt = (text, reference) => {
  const after = text.slice(reference.end);
  const sentence = sentenceAt(text, reference.start);
  const restOfSentence = text.slice(reference.end, sentence.start + sentence.text.length);
  return VALUE_RIGHT_AFTER.test(after)
    || VALUE_LATER.test(restOfSentence)
    || VALUE_BEFORE.test(text.slice(sentence.start, reference.start));
};

// The clause a teacher is shown: the reference in its own words, kept short.
const quoteOf = (text, reference) => {
  const clause = sentenceClauses(text).filter((entry) => entry.start <= reference.start).at(-1);
  const whole = (clause ? clause.text : text).replace(/[\s.,;:!]+$/, '');
  if (whole.length <= 90) return whole;
  const from = Math.max(0, reference.start - 30);
  const to = Math.min(text.length, reference.end + 30);
  return `${from > 0 ? '…' : ''}${text.slice(from, to).trim()}${to < text.length ? '…' : ''}`;
};

/**
 * The first reference to another question's answer a student reads on this
 * question, or null: { field, quote }. Every version a student can be given is
 * read (a family slot's generated words, each static variant).
 */
export const otherQuestionReference = (question = {}) => {
  if (!isObject(question)) return null;
  for (const version of questionScreenVersions(question)) {
    const { stem, parts } = questionScreenText(version);
    const asksIn = (segment) => sentenceClauses(segment.text).some((clause) => asksForSomething(clause.text));
    const stemAsks = stem.some(asksIn);
    const screen = [
      ...stem.map((segment, index) => ({ ...segment, kind: 'stem', index })),
      ...parts.map((segment, index) => ({ ...segment, kind: 'part', index })),
    ];
    for (const segment of screen) {
      // An earlier part of the same question is what a later one points at.
      if (segment.kind === 'part' && segment.index > 0) continue;
      const spans = quotedSpans(segment.text);
      const clauses = sentenceClauses(segment.text);
      for (const reference of backReferences(segment.text)) {
        if (insideQuotes(spans, reference.start)) continue;
        if (INSIDE_THE_QUESTION.test(segment.text.slice(reference.end))) continue;
        if (givenWithIt(segment.text, reference)) continue;
        // "Use your answer to question 1" in a question with two parts may mean its own first part.
        if (reference.numbered !== null && parts.length >= reference.numbered) continue;
        const ownClause = clauses.filter((clause) => clause.start <= reference.start).at(-1);
        const earlierHere = clauses.some((clause) => clause !== ownClause && clause.start < reference.start && asksForSomething(clause.text));
        const earlierStem = segment.kind === 'part' ? stemAsks : stem.slice(0, segment.index).some(asksIn);
        if (earlierHere || earlierStem) continue;
        return { field: segment.field, quote: quoteOf(segment.text, reference) };
      }
    }
  }
  return null;
};

export const otherQuestionReferenceWarning = (questionNumber, reference) => (
  `Question ${questionNumber} says "${reference.quote}", which needs an answer from another question. A student who meets this question first, or without that one, has nothing to use. Repeat the value in this prompt, or make the two questions one multi-part question.`
);

/** { warnings, findings: [{ questionNumber, questionId, field, quote }] } for the delivered questions. */
export const auditAssignmentOtherQuestionReferences = (questions = [], { deliveredOnly = true } = {}) => {
  const warnings = [];
  const findings = [];
  asArray(questions).forEach((question, index) => {
    if (!isObject(question)) return;
    if (deliveredOnly && question.teacherExcluded === true) return;
    const reference = otherQuestionReference(question);
    if (!reference) return;
    findings.push({ questionNumber: index + 1, questionId: question.questionId ?? null, ...reference });
    warnings.push(otherQuestionReferenceWarning(index + 1, reference));
  });
  return { warnings, findings };
};

export default auditAssignmentOtherQuestionReferences;

/*
 * A PROMPT THAT SENDS STUDENTS TO A GRAPHING CALCULATOR THEY DO NOT GET — a
 * Pre-Flight WARNING, never a block (#554 item 6; #383's authoring
 * observation: "enter f(x) into the built-in graphing calculator" on Algebra I
 * DOL #2, where students had a keypad with nowhere to enter a function).
 *
 * The question is what the student is given, not what a setting is called.
 * A student's calculator is resolved as App gives it to the student
 * assignment's QuestionEngine (calculatorPolicy.js resolveCalculatorPolicy):
 * the question's own setting, the section's role, the lesson's setting
 * (toolPolicy.calculator, which Pre-Flight's Delivery step edits), "inherit"
 * and "teacherChoice" — an assignment never sends a teacher's choice, so a
 * "teacherChoice" question takes the lesson's setting, or has none. On an exit
 * ticket, quiz or test the lesson's setting can only make a question's
 * calculator stricter, so "Graphing" for the lesson still leaves such a
 * question with no setting of its own on the basic keypad. A graphing
 * calculator is drawn only where that resolves to graphing (QuestionEngine
 * graphingCalculatorOffered: no assessment context in an assignment, and only
 * Live Challenge turns it off). Everywhere else a "graphing" setting reaches a
 * keypad titled by its keys (TL23, getCalculatorDrawerLabel). A Test Cycle's
 * secure test brings its own tools, so its questions are not judged here.
 *
 * A student's own calculator accommodation is not judged: Pre-Flight reviews
 * the class's assignment, not one student's plan.
 *
 * ADVISORY, like answerKeyPreflight.js: its own panel, never the readiness
 * diagnostics, so it never makes an assignment "Needs Review". The fix it
 * names is the one that works, tried through the same resolver: the lesson's
 * setting, else the question's own, else both; or new wording.
 *
 * PRECISION BEFORE RECALL. Only the words "graphing calculator" (or "graphing
 * calc", "graphing utility") count, in an instruction to the student ("Use",
 * "Enter f(x) into", "you may use", "is allowed"). Left alone: "without a
 * graphing calculator", "do not use", "if you have one", someone else's ("Ben
 * graphed it on his graphing calculator"), a description ("On a graphing
 * calculator, the graph looks like…"), "technology" and the question's own
 * graphing tool.
 *
 * Pure: no React, no Firestore. Not in a student's first load.
 */
import { CALCULATOR_MODES, resolveCalculatorPolicy } from '../policies/calculatorPolicy.js';
import { getEffectiveActivityPolicy, normalizeActivityRole } from '../../../functions/shared/activityPolicies.mjs';
import { isTestCycleAssignment } from '../../../functions/shared/testCyclePolicy.mjs';
import { INSTRUCTION_VERBS, questionScreenText, questionScreenVersions, sentenceAt } from './questionScreenText.js';

const asArray = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const GRAPHING_CALCULATOR = /\bgraphing[\s-]+(?:calculators?|calc\b\.?|utilit(?:y|ies))(?![\w-])/gi;

// "without a graphing calculator", "Do not use the", "not a", "instead of a".
const NEGATED_BEFORE = /(?:\b(?:without|no|not|never|nor|instead\s+of|rather\s+than|except)\b|n['’]t\b)(?:\s+[\w'’-]+){0,4}\s+$/i;
// "A graphing calculator is not allowed", "… isn't needed".
const NEGATED_AFTER = /^\s*(?:(?:is|are|will\s+be|may\s+be|should\s+be)\s+)?(?:not|never)\b|^\s*(?:isn['’]t|aren['’]t|won['’]t|cannot|can['’]t)\b/i;
// "If you have a graphing calculator", "If available, use a".
const CONDITIONAL_BEFORE = /\bif\s+(?:you\s+(?:have|own|can\s+(?:use|access|get|borrow))|(?:one\s+is\s+)?available|allowed|possible|permitted)\b/i;
const OPTIONAL = /\boptional(?:ly)?\b/i;
// Someone else's: "Ben graphed it on his graphing calculator", "Maria's".
const SOMEONE_ELSE = /\b(?:he|she|they|(?!You\b)[A-Z][a-z]+|(?:a|the|one|another|his|her|their)\s+(?:student|classmate|friend|teacher|partner|brother|sister))\s+(?:[\w'’]+\s+){0,2}?(?:used|uses|graphed|graphs|entered|enters|typed|types|checked|checks|puts|found|finds|got|gets|says|said|claims|claimed|thinks|thought|borrowed|has|had|owns)\b/;
const POSSESSED_BY_OTHER = /\b(?:his|her|their|(?!Your\b)[A-Z][a-z]+['’]s)\s+(?:own\s+|built-in\s+|new\s+|old\s+)?$/;

// The sentence speaks to the student: "you", an instruction ("Use", "Enter
// f(x) into", "Then graph"), "may use", "is allowed".
const SPEAKS_TO_STUDENT = /\byou(?:r|rs|rself)?\b|\b(?:may|can|should|must|will|could)\s+(?:use|check|graph|enter|try|confirm)\b|\b(?:is|are)\s+(?:allowed|permitted|available|provided)\b/i;
const INSTRUCTION_START = new RegExp(String.raw`^(?:(?:then|now|first|next|finally|also|and|so)\s*,?\s+)?(?:${INSTRUCTION_VERBS.join('|')}|confirm)\b`, 'i');
const instructs = (sentence) => SPEAKS_TO_STUDENT.test(sentence)
  || sentence.split(/[,;:]|\s+(?:and|then)\s+/).some((piece) => INSTRUCTION_START.test(piece.trim().replace(/^["“'‘(]+/, '')));

/** Does this text tell the student to use a graphing calculator? The words it does it with, or null. */
export const graphingCalculatorInstruction = (text) => {
  const value = String(text ?? '');
  for (const match of value.matchAll(GRAPHING_CALCULATOR)) {
    const sentence = sentenceAt(value, match.index);
    const before = value.slice(sentence.start, match.index);
    const clauseBefore = before.slice(Math.max(0, ...[...before.matchAll(/[;:](?=\s)/g)].map((entry) => entry.index + 1)));
    const after = value.slice(match.index + match[0].length, sentence.start + sentence.text.length);
    if (NEGATED_BEFORE.test(clauseBefore) || NEGATED_AFTER.test(after)) continue;
    if (CONDITIONAL_BEFORE.test(clauseBefore) || OPTIONAL.test(sentence.text)) continue;
    if (SOMEONE_ELSE.test(clauseBefore) || POSSESSED_BY_OTHER.test(clauseBefore)) continue;
    if (!instructs(sentence.text)) continue;
    return sentence.text.trim().replace(/[\s.,;:!?]+$/, '');
  }
  return null;
};

/** The first place a student is told to use a graphing calculator on this question: { field, quote }, or null. */
export const graphingCalculatorPrompt = (version = {}) => {
  const { stem, parts } = questionScreenText(version);
  for (const segment of [...stem, ...parts]) {
    const quote = graphingCalculatorInstruction(segment.text);
    if (quote) return { field: segment.field, quote: quote.length <= 120 ? quote : `${quote.slice(0, 117).trimEnd()}…` };
  }
  return null;
};

/** The role a question is played under in the assignment (activityPolicies.js resolveQuestionActivityRole). */
const roleOf = (question) => normalizeActivityRole(question?.activityRole ?? question?.role);

/**
 * The calculator a student is given on this question in the assignment, as
 * App's student QuestionEngine resolves it: { mode, available, graphing, source }.
 * `graphing` is whether a graphing calculator is drawn (QuestionEngine
 * graphingCalculatorOffered: available, graphing, and no assessment context —
 * an assignment has none).
 */
export const assignmentStudentCalculator = (question = {}, { lessonCalculator = null, role = roleOf(question) } = {}) => {
  const policy = resolveCalculatorPolicy({
    questionSpec: question,
    activityPolicy: getEffectiveActivityPolicy(role),
    studentSupportProfile: null,
    teacherCalculatorChoice: null,
    assignmentCalculatorMode: lessonCalculator,
    assessmentContext: null,
  });
  const available = Boolean(policy?.available);
  const mode = available ? policy.mode : CALCULATOR_MODES.NONE;
  return { mode, available, graphing: available && mode === CALCULATOR_MODES.GRAPHING, source: policy?.source || null };
};

// What the student gets, in Pre-Flight's own names for the settings
// (preflightV5Review.js ASSIGNMENT_CALCULATOR_SETTINGS).
const GIVEN = Object.freeze({
  [CALCULATOR_MODES.BASIC]: 'the basic calculator',
  [CALCULATOR_MODES.SQUARE_ROOT]: 'the basic calculator with square root',
  [CALCULATOR_MODES.SCIENTIFIC]: 'the scientific calculator',
});

const LESSON_FIX = 'Set "Calculator for this lesson" to Graphing, or change the prompt\'s wording.';
const OWN_FIX = 'Give this question its own graphing calculator ("calculatorPolicy": "graphing"), or change the prompt\'s wording.';
const BOTH_FIX = 'Give this question its own graphing calculator ("calculatorPolicy": "graphing") and set "Calculator for this lesson" to Graphing, or change the prompt\'s wording.';
const WORDING_FIX = 'Change the prompt\'s wording.';

/** The change that gives this question a graphing calculator, tried through the resolver: 'lesson', 'own', 'both' or null. */
export const graphingCalculatorFix = (question = {}, { lessonCalculator = null, role = roleOf(question) } = {}) => {
  const own = { ...question, calculatorPolicy: CALCULATOR_MODES.GRAPHING };
  if (assignmentStudentCalculator(question, { lessonCalculator: CALCULATOR_MODES.GRAPHING, role }).graphing) return 'lesson';
  if (assignmentStudentCalculator(own, { lessonCalculator, role }).graphing) return 'own';
  if (assignmentStudentCalculator(own, { lessonCalculator: CALCULATOR_MODES.GRAPHING, role }).graphing) return 'both';
  return null;
};

export const graphingCalculatorPromptWarning = (questionNumber, { calculator, fix }) => {
  const given = calculator.available && GIVEN[calculator.mode]
    ? `they get ${GIVEN[calculator.mode]} on this question, which cannot graph`
    : 'they get no calculator on this question';
  const remedy = { lesson: LESSON_FIX, own: OWN_FIX, both: BOTH_FIX }[fix] || WORDING_FIX;
  return `Question ${questionNumber} tells students to use a graphing calculator, but ${given}. ${remedy}`;
};

/**
 * { warnings, findings: [{ questionNumber, questionId, field, quote, mode, fix }] }:
 * the delivered questions whose words send students to a graphing calculator
 * that the assignment does not give them.
 */
export const auditAssignmentGraphingCalculatorPrompts = (assignment = {}, questions = [], { deliveredOnly = true } = {}) => {
  const warnings = [];
  const findings = [];
  const lessonCalculator = isObject(assignment?.toolPolicy) ? assignment.toolPolicy.calculator ?? null : null;
  const testCycle = isTestCycleAssignment(assignment);
  asArray(questions).forEach((question, index) => {
    if (!isObject(question)) return;
    if (deliveredOnly && question.teacherExcluded === true) return;
    const role = roleOf(question);
    // A Test Cycle's secure test is not played in the assignment's QuestionEngine.
    if (testCycle && role === 'test') return;
    for (const version of questionScreenVersions(question)) {
      const prompt = graphingCalculatorPrompt(version);
      if (!prompt) continue;
      const calculator = assignmentStudentCalculator(version, { lessonCalculator, role });
      if (calculator.graphing) continue;
      const fix = graphingCalculatorFix(version, { lessonCalculator, role });
      findings.push({ questionNumber: index + 1, questionId: question.questionId ?? null, ...prompt, mode: calculator.mode, fix });
      warnings.push(graphingCalculatorPromptWarning(index + 1, { calculator, fix }));
      return;
    }
  });
  return { warnings, findings };
};

export default auditAssignmentGraphingCalculatorPrompts;

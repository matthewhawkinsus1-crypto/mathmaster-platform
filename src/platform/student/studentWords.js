/*
 * ONE STUDENT WORD LIST (student pass 3, decision D9; NAV-17, NAV-18, HELP-17, HELP-24).
 *
 * The same thing had different names on different student screens: the exit
 * ticket was "exit ticket" on one card and an unexplained "DOL" on the next;
 * closed work was "Closed", "Closed — try again", "PRACTICE ONLY", "Practice
 * only" and "Practice Mode — grading window ended"; "See results" on Home was
 * "View Results" on Assignments and Grades; and the strip said "tries" while
 * the box said "attempts". A student screen takes these words from here.
 *
 * D9: "Exit ticket (DOL)" is spelled out once per screen, then "exit ticket";
 * "tries", never "attempts"; "Check" never costs a try and "Submit" always
 * does (the Submit button's own words are submitCost.js, not repeated here);
 * "Work View" for the enlarged workspace.
 *
 * Words only: no clock, no Firestore, nothing that decides a state.
 */

/** The class period as a student reads it: "Period 3", never a bare "3" or the roster's "Unassigned". */
export const studentPeriodLabel = (classPeriod) => {
  const value = String(classPeriod ?? '').trim();
  if (!value || /^unassigned$/i.test(value)) return '';
  return /^\d+$/.test(value) ? `Period ${value}` : value;
};

// --- The exit ticket ---------------------------------------------------------

/** The exit ticket spelled out: the first time a screen names it. */
export const EXIT_TICKET_SPELLED_OUT = 'Exit ticket (DOL)';
/** Every later mention on the same screen (a label, a chip, a sentence start). */
export const EXIT_TICKET = 'Exit ticket';
/** Mid-sentence. */
export const exitTicketInSentence = 'exit ticket';

/** A lesson section's name on a student screen. */
export const STUDENT_SECTION_LABEL = Object.freeze({
  warmup: 'Warm-Up',
  classwork: 'Classwork',
  practice: 'Practice',
  dol: EXIT_TICKET,
  quiz: 'Quiz',
  test: 'Test',
});

/*
 * A Recovery keeps its feature name, "DOL Recovery", which teachers and
 * Pre-Flight use too: renaming it is the owner's call (W6-1 handoff,
 * decision 1). Built from the section label it read "Exit ticket Recovery".
 */
export const RECOVERY_NAME = Object.freeze({ dol: 'DOL Recovery', warmup: 'Warm-Up Recovery' });

/** Home's chip on a lesson that is done except its exit ticket (NAV-26). */
export const EXIT_TICKET_WAITS = 'Exit ticket opens in class';

/**
 * A section's student name; `spelledOut` gives the exit ticket its "(DOL)",
 * for the one place on a screen that spells it out.
 */
export const studentSectionLabel = (role, { spelledOut = false } = {}) => {
  const key = String(role || '').trim();
  if (key === 'dol') return spelledOut ? EXIT_TICKET_SPELLED_OUT : EXIT_TICKET;
  return STUDENT_SECTION_LABEL[key] || key;
};

/**
 * Spell the exit ticket out once: of a screen's items in the order they are
 * shown, the first that names an exit ticket. `namesExitTicket(item)` says
 * whether an item does. When the screen already spelled it out somewhere
 * above the items (`alreadySpelledOut`), none is chosen.
 * Returns the chosen item's index, or -1.
 */
export const firstExitTicketMention = (items = [], namesExitTicket = () => false, { alreadySpelledOut = false } = {}) => {
  if (alreadySpelledOut) return -1;
  const list = Array.isArray(items) ? items : [];
  return list.findIndex((item) => Boolean(namesExitTicket(item)));
};

// --- Closed work -------------------------------------------------------------

/*
 * Work past its last day to turn in. It can still be opened and practiced, and
 * nothing done there changes the grade.
 *
 * The STATE has one name, "Closed": the card chip, the Grades status, the
 * workspace badge and the phone chip. Each can sit beside a real grade (82%),
 * so none of them says "no credit" — that would read as "you earned none".
 * "No credit" is said only of the ACTION, where it is true: trying it again.
 * Never "Practice …": in student copy "Practice" is only the lesson's Practice
 * section, and a closed card already shows a "Practice" chip of its own.
 */
export const CLOSED_WORK = Object.freeze({
  // The state: the chip, the badge, the Grades status, the phone chip.
  label: 'Closed',
  // Grades: closed with nothing recorded, so it is left out of the average.
  notCountedLabel: 'Closed — not counted',
  // Lists of closed work, named by what can still be done with it.
  groupLabel: 'Closed — try again (no credit)',
  tabLabel: 'Closed — try again',
  // The workspace banner's heading (the work in front of the student now) and sentence.
  bannerTitle: 'Closed — practice here earns no credit',
  bannerText: 'Your grade stays as it is. You can keep practicing with feedback; nothing here changes your grade. Your practice is saved, and your teacher can see it.',
  // The button that opens it again.
  tryAgain: 'Try it again — no credit',
  // Beside the grade it keeps.
  gradeLabel: 'Your grade (closed)',
});

// --- Getting around ----------------------------------------------------------

/** The button that opens an assignment's result page, on every list. */
export const SEE_RESULTS = 'See results';
/** The student's first screen, as the navigation names it. */
export const HOME = 'Home';
/** A button that goes back to it. */
export const BACK_TO_HOME = 'Back to Home';

// --- Tries -------------------------------------------------------------------

/** "1 try", "3 tries": the strip's word, never "attempts". */
export const triesCount = (count) => {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return `${n} ${n === 1 ? 'try' : 'tries'}`;
};

// --- Hints -------------------------------------------------------------------

/*
 * What a hint costs, said the same way everywhere one is offered (HELP-17).
 * hintCopy.js offers it as HINT_COST_SENTENCE, beside Recovery's one
 * exception. On an exit ticket, quiz or test no hint is offered at all, so it
 * never appears there. (This module imports nothing: the sign-in page loads it,
 * and with it in the entry chunk Home pays less than for a chunk of its own.)
 */
export const HINT_COST = 'Hints never lower your score. Your teacher can see you used one.';

// --- Dates -------------------------------------------------------------------

/*
 * The two dates on a card and in the workspace header, in a student's words
 * (NAV-18). "Regular due" and "Final late due" were the teacher's settings
 * read aloud; "Due Not set" printed a missing value.
 */
export const DUE_WORDS = Object.freeze({
  due: 'Due',
  yourDue: 'Your due date',
  lastDay: 'Late work accepted until',
  yourLastDay: 'Your last day to turn in',
  noDue: 'No due date',
});

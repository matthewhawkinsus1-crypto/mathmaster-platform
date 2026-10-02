/*
 * A JUDGMENT THE STUDENT IS ASKED TO MAKE STARTS UNANSWERED.
 *
 * "How many solutions?", "Direction?", "Is (x − 2) a factor?", "Is P on the
 * parabola?" — each of these used to open on one of its own options. Whenever
 * that option happened to be the right one the student was credited for a
 * choice they never made: a Data Modeling question about a positive trend
 * opened on "Positive", every one-solution system opened on "Exactly one
 * solution". A tool now starts such a choice on UNANSWERED (the empty string,
 * shown as "Choose…"), and nothing here ever treats unanswered as an answer.
 *
 * Pure, and in functions/shared, so the tools, their tests and the shared
 * graders the server runs (serverGrading/tools/) read one rule.
 * src/tools/shared/judgmentChoices.js re-exports it for the tools.
 */

/** The value of a choice nobody has made yet; a <select> shows it as "Choose…". */
export const UNANSWERED = '';

/** Whether the student has made this choice at all. */
export const isAnswered = (choice) => typeof choice === 'string' && choice.trim() !== '';

/**
 * A yes / no judgment against the truth. Unanswered is never right — in
 * particular it is not "no": `(choice === 'yes') === truth` alone marked a
 * blank answer correct whenever the truth was no.
 */
export const yesNoAnswerMatches = (choice, truth) => (
  (choice === 'yes' || choice === 'no') && (choice === 'yes') === Boolean(truth)
);

/*
 * THE WORK OF A TOOL WHOSE JUDGMENTS OPEN UNANSWERED SAYS SO.
 *
 * Before they opened on "Choose…", Data Modeling and the Polynomial Workshop
 * pre-selected options, and their graders still read work that holds exactly
 * those options as untouched: work an earlier client saved at its start
 * (a draft or checkpoint revision, say after Undo) holds them without the
 * student having chosen any, so a deadline must not submit it. Work a tool
 * reports with this marker comes from a tool whose judgments open unanswered,
 * so every option it holds is the student's own choice — the same options
 * included. Without the marker, a student who chose them (a model that is
 * linear, a hole that is a hole) would be read as never having started, and a
 * deadline would not submit their answer.
 */
export const OWN_CHOICES = Object.freeze({ choicesOpenUnanswered: true });

/** Whether this work comes from a tool whose judgments open unanswered (OWN_CHOICES). */
export const choicesAreOwn = (work) => work?.choicesOpenUnanswered === true;

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
 * Pure, so the tools, their tests and any grader read one rule.
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

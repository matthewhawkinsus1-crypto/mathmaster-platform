// THE SHARED FUNCTIONS CODE A SUBMIT AND A NEXT RUN, FOR studentRuntimePerformance.mjs.
//
// After the second pass App still asked shared Functions code the same
// questions on every one of its renders, five to seven a Submit: the bell
// schedule normalised again for each bell window it read (the pack-up line,
// each lesson's Warm-Up), the Recovery window check for the open assignment
// on each tracker change, and the open assignment's records normalised again
// (functions/shared/classSchedule.mjs, sectionRecoveryEligibility.mjs,
// attemptPolicy.mjs). Each answer is now kept until what it reads changes
// (App.jsx, renderMemo; platform/performance/questionRecordView.js).
//
//   calls   each Submit's and each Next's window is counted with precise
//           coverage (functionCallCounts.mjs) from the press until the
//           window is quiet: how many times the bell schedule is
//           normalised (normalizeSchedule), a question record is normalised
//           (normalizeQuestionRecord) and the Recovery window check runs
//           (resolveOriginalOpportunity). Needs PERF_DIST: a counted function
//           is told by its source file and the text of its first line. A
//           flow of its own: coverage runs the code unoptimised, and in
//           slower windows more of the app's own timers land (the key's
//           checkpoint drew App twice more in two of a counts run's three
//           Submits), so the counts mode's render budgets are not counted
//           in the same windows.
//
// The counts include what App's effects and the question ask in the window,
// and they do not depend on the machine. The budgets: on each device the
// fewest of the flow's three Submits, and of its three Nexts, stays within
// SHARED_CALL_BUDGET. The fewest, as for a key's renders (the driver's
// KEY_BUDGET): App's 30-second clock or its precise clock can tick inside a
// window, and the response checkpoint of the key typed before a Submit can
// land in it under load (in two of the three Submits on a loaded phone), and
// each asks again for everything that reads the clock or the tracker. What
// App's render asks on every render shows in every window, the fewest too.
import { countWhere } from './functionCallCounts.mjs';

export const SHARED_CALLS = Object.freeze({
  normalizeSchedule: { source: /^functions\/shared\/classSchedule\.mjs$/, text: /^export const normalizeSchedule = / },
  normalizeQuestionRecord: { source: /^functions\/shared\/attemptPolicy\.mjs$/, text: /^export const normalizeQuestionRecord = / },
  recoveryWindowCheck: { source: /^functions\/shared\/sectionRecoveryEligibility\.mjs$/, text: /^export const resolveOriginalOpportunity = / },
});

// The code before (8dc31e8a), the fewest of three on a Chromebook and a
// phone: a Submit normalised the bell schedule 48 times and a Next 48-50,
// question records 258-280 and 263-276 times, and ran the Recovery window
// check twice (both sections, on every tracker change). Now 26-28 and 26
// (App's effects, which read the real time), 143 and 135, and none.
export const SHARED_CALL_BUDGET = Object.freeze({
  submit: Object.freeze({ normalizeSchedule: 40, normalizeQuestionRecord: 200, recoveryWindowCheck: 0 }),
  next: Object.freeze({ normalizeSchedule: 40, normalizeQuestionRecord: 200, recoveryWindowCheck: 0 }),
});

const KINDS = Object.freeze({ submit: (name) => name.endsWith('-submit'), next: (name) => name.startsWith('next-to-') });

/** Is this interaction's window counted? */
export const countsSharedCalls = (name) => Object.values(KINDS).some((matches) => matches(name));

/** The counted calls in `ran` (functionCallCounts.mjs's take()). */
export const sharedCallsIn = (ran) => Object.fromEntries(Object.entries(SHARED_CALLS).map(([name, where]) => [name, countWhere(ran, where)]));


/** The budgets, as findings, and the counts per interaction, printed and returned for OUT. */
export const checkSharedCalls = (runs, findings, { log = console.log } = {}) => {
  const rows = [];
  for (const { device, mode, interactions = [] } of runs) {
    if (mode !== 'calls') continue;
    const counted = interactions.filter((entry) => !entry.skipped && entry.sharedCalls);
    counted.forEach((entry) => rows.push({ device, interaction: entry.name, ...entry.sharedCalls }));
    for (const [kind, matches] of Object.entries(KINDS)) {
      const windows = counted.filter((entry) => matches(entry.name));
      if (!windows.length) continue;
      for (const [name, limit] of Object.entries(SHARED_CALL_BUDGET[kind])) {
        const fewest = Math.min(...windows.map((entry) => entry.sharedCalls[name]));
        if (fewest > limit) findings.push(`${device}: every ${kind === 'submit' ? 'Submit' : 'Next'} ran ${name} more than ${limit} times (${windows.map((entry) => `${entry.name} ${entry.sharedCalls[name]}`).join(', ')}; budget ${limit} for the fewest)`);
      }
    }
  }
  if (rows.length) {
    log('\nShared Functions code run (calls: normalizeSchedule, normalizeQuestionRecord, the Recovery window check)');
    rows.forEach((row) => log(`  ${row.device.padEnd(10)} ${row.interaction.padEnd(22)} ${String(row.normalizeSchedule).padStart(5)} ${String(row.normalizeQuestionRecord).padStart(5)} ${String(row.recoveryWindowCheck).padStart(3)}`));
  }
  return { budget: SHARED_CALL_BUDGET, rows };
};

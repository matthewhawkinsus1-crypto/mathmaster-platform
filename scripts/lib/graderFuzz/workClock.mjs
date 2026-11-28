/*
 * WHAT ONE CHECK COST: THE WORK, NOT THE WAIT.
 *
 * `answers-in-time` holds each verdict, check and reading under `slowMs`. The
 * clock alone also counts time the scheduler gave to other jobs: with the
 * platform suite running beside other work on four cores, a 232-character
 * value "took" 2,071 ms on the clock and was reported as a new finding.
 * Process CPU time does not count that wait; a collection on a helper thread
 * can push it past the clock, so the smaller of the two is the cost. Work
 * that really is slow (the 40 s of 48 like terms, #558) is CPU time on every
 * run and is still reported.
 */

/** Start timing; the function returned gives the milliseconds spent so far. */
export const startWorkClock = () => {
  const clock = performance.now();
  const cpu = process.cpuUsage();
  return () => {
    const spent = process.cpuUsage(cpu);
    return Math.min(performance.now() - clock, (spent.user + spent.system) / 1000);
  };
};

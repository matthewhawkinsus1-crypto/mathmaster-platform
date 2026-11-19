/*
 * A WAIT THAT CANNOT END FAILS THE TEST, AND SAYS WHAT IT WAITED FOR.
 *
 * The renders through Vite (actionBarRender.mjs, studentToolRender.mjs) wait
 * on a dev server: starting it, loading a module and everything it imports, a
 * render that waits for its lazy parts, closing it. One that never ends held a
 * full `npm run test:platform` for 25 minutes, and in CI it would hold the
 * shard's job until its time limit.
 *
 * A slow wait is not a stuck one, so a wait is not given a total time. On a
 * loaded machine each takes much longer: at a load average of about 30–48 a
 * whole toolWordsMatchButton.test.mjs took 150–195 s instead of 12 s, and at
 * about 26, with three such files at once, a first load of QuestionEngine.jsx
 * took more than 240 s. Vite reads, transforms and runs those modules in this
 * process, so a wait that is moving, however slowly, keeps the process
 * working; one that cannot end (a promise nothing will settle) leaves it idle,
 * at about a millisecond of CPU in 10 s. A wait fails once the process has
 * done no work (under IDLE_CPU_MS of CPU in each 10 s) for STUCK_AFTER_MS.
 */
export const STUCK_AFTER_MS = 240_000;
const SAMPLE_MS = 10_000;
const IDLE_CPU_MS = 50;

/** `promise`, or a rejection naming `what` once the process has been idle for `ms`. */
export const within = (promise, what, ms = STUCK_AFTER_MS) => {
  let timer;
  const stuck = new Promise((_, reject) => {
    let idleSince = Date.now();
    let cpu = process.cpuUsage();
    timer = setInterval(() => {
      const used = process.cpuUsage(cpu);
      cpu = process.cpuUsage();
      if ((used.user + used.system) / 1000 >= IDLE_CPU_MS) idleSince = Date.now();
      else if (Date.now() - idleSince >= ms) {
        reject(new Error(`${what}: still waiting, with nothing running for ${Math.round(ms / 1000)} s, so the test cannot finish`));
      }
    }, Math.min(SAMPLE_MS, ms));
  });
  return Promise.race([promise, stuck]).finally(() => clearInterval(timer));
};

export default within;

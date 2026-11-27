// The SchoolStatus side of the runner (runner.js): each runner step as small
// page steps (schoolStatusPage.js), waiting through SchoolStatus's loads.
//
// `run(action, args)` runs one schoolStatusPage step in the teacher's
// SchoolStatus tab. While the tab navigates, Chrome cannot run a step, so
// `run` may reject with `{ navigating: true }`; that counts as "not there
// yet", like `{ waiting: true }`. Anything the page does not recognize ends
// the run (stopRun): the extension never guesses on a page that can text a
// family.

import { stopRun } from './runner.js';

export const PAGE_TIMEOUT_MS = 30000;

export const createSchoolStatusAdapter = ({ run, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), log = () => {}, timeoutMs = PAGE_TIMEOUT_MS }) => {
  const until = async (action, args = {}) => {
    const started = Date.now();
    for (;;) {
      let result;
      try {
        result = await run(action, args);
      } catch (error) {
        if (!error?.navigating) throw stopRun(`SchoolStatus: ${String(error?.message || error).slice(0, 200)}`);
        result = { waiting: true };
      }
      if (!result?.waiting) return result;
      if (Date.now() - started > timeoutMs) throw stopRun(`SchoolStatus did not finish loading (${action}). Check the SchoolStatus tab: are you still signed in?`);
      await wait(400);
    }
  };

  return {
    async where() {
      const here = await until('where');
      if (here.page === 'signin') throw stopRun('SchoolStatus is signed out. Sign in in that tab, then run again.');
      if (here.page !== 'app') throw stopRun('The SchoolStatus tab is not on SchoolStatus. Open it, then run again.');
      return here;
    },
    findStudent: (input) => until('findStudent', input),
    openComposer: () => until('openComposer'),
    fill: (input) => until('fill', input),
    discard: () => until('discard'),
    pressSend: () => until('pressSend'),
    confirmSent: () => until('confirmSent'),
    home: () => until('home'),
    log,
  };
};

// The TEAMS side of the runner (runner.js): each operation as a sequence of
// small page steps (teamsPage.js), waiting through TEAMS's page loads.
//
// `run(action, args)` runs one teamsPage step in the teacher's TEAMS tab and
// resolves to its result. While a page is navigating, Chrome cannot run a
// step, so `run` may reject with `{ navigating: true }`; that counts as
// "not there yet", like `{ waiting: true }`.

import { buildTeamsReadback, newColumnId } from './readback.js';

export const PAGE_TIMEOUT_MS = 45000;

export const createTeamsAdapter = ({ run, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), log = () => {}, timeoutMs = PAGE_TIMEOUT_MS, nonce = () => Math.random().toString(36).slice(2) }) => {
  // Ask until the page answers with something other than "not yet".
  const until = async (action, args = {}) => {
    const started = Date.now();
    for (;;) {
      let result;
      try {
        result = await run(action, args);
      } catch (error) {
        if (!error?.navigating) throw error;
        result = { waiting: true };
      }
      if (!result?.waiting) return result;
      if (Date.now() - started > timeoutMs) throw new Error(`TEAMS did not finish loading (${action}). Check the TEAMS tab: are you still signed in?`);
      await wait(400);
    }
  };

  // What the last read showed per section, so a later op can find a column's
  // Assignments row (by name and due date) from its TEAMS id.
  const lastRead = new Map();

  const goToGradebook = async (sectionRef) => {
    const here = await until('where');
    if (here.page === 'signin') throw new Error('TEAMS is signed out. Sign in to TEAMS in that tab and run the sync again.');
    if (here.page === 'other') throw new Error('Open TEAMS on "Enter Classroom Grading" (the section list or a gradebook) and run the sync again.');
    await until('openSection', { sectionRef });
    const now = await until('where');
    if (now.page !== 'gradebook' || now.sectionRef !== sectionRef) throw new Error(`TEAMS did not open section ${sectionRef}.`);
  };

  const readGradebook = async () => (await until('readGradebook')).gradebook;

  const readSection = async (sectionRef) => {
    await goToGradebook(sectionRef);
    const gradebook = await readGradebook();
    await until('openAssignments');
    const { assignments } = await until('readAssignments');
    await until('returnToGradebook');
    const built = buildTeamsReadback({ gradebook, assignments });
    if (built.sectionRef !== sectionRef) throw new Error(`TEAMS showed section ${built.sectionRef}, not ${sectionRef}.`);
    built.notes.forEach((note) => log(`${sectionRef}: ${note}`));
    lastRead.set(sectionRef, built.readback);
    return built.readback;
  };

  const rowOf = (sectionRef, columnId) => {
    const column = lastRead.get(sectionRef)?.columns.find((entry) => entry.id === columnId);
    if (!column) throw new Error(`TEAMS assignment ${columnId} was not in the last read of ${sectionRef}.`);
    const due = column.dueDate ? `${column.dueDate.slice(5, 7)}-${column.dueDate.slice(8, 10)}-${column.dueDate.slice(0, 4)}` : '';
    return { name: column.name, dueDate: due };
  };

  return {
    readSection,

    /** The teacher's TEAMS course sections, for linking a class. */
    async listSections() {
      const here = await until('where');
      if (here.page === 'signin') throw new Error('TEAMS is signed out. Sign in to TEAMS in that tab first.');
      await until('openSectionList');
      return (await until('listSections')).sections;
    },

    async createColumn(sectionRef, op) {
      const fields = op.spec?.teamsFields;
      if (!fields) throw new Error('The create operation has no TEAMS fields.');
      await goToGradebook(sectionRef);
      const before = (await readGradebook()).columns;
      await until('openAssignments');
      await until('addAssignment', { fields });
      await until('returnToGradebook');
      const after = (await readGradebook()).columns;
      return newColumnId({ before, after, name: fields['Assignment Name'] });
    },

    async setCount(sectionRef, columnId, count) {
      const row = rowOf(sectionRef, columnId);
      await goToGradebook(sectionRef);
      await until('openAssignments');
      await until('setCount', { ...row, count });
      await until('returnToGradebook');
    },

    async importFile(sectionRef, columnId, file) {
      const row = rowOf(sectionRef, columnId);
      await goToGradebook(sectionRef);
      await until('openAssignments');
      const token = nonce();
      await until('openImport', { ...row, nonce: token });
      await until('submitImport', { body: file.body, overwrite: file.overwrite === true, nonce: token });
      const { receipt } = await until('readReceipt');
      log(`${sectionRef}: TEAMS import ${receipt.ok ? 'accepted' : 'reported errors'} (${file.rows} row(s), Overwrite ${file.overwrite ? 'Yes' : 'No'}). TEAMS said: ${receipt.summary}`);
      await until('returnToGradebook');
      // Errors for named students are a partial success the server records
      // per student; a refusal with none named is the import failing.
      if (!receipt.ok && !receipt.errors.length) throw new Error('TEAMS refused the import file. The TEAMS message is in the extension log.');
      return { errors: receipt.errors };
    },
  };
};

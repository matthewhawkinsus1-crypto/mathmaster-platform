// The TEAMS side of the runner (runner.js): each operation as a sequence of
// small page steps (teamsPage.js), waiting through TEAMS's page loads.
//
// `run(action, args)` runs one teamsPage step in the teacher's TEAMS tab and
// resolves to its result. While a page is navigating, Chrome cannot run a
// step, so `run` may reject with `{ navigating: true }`; that counts as
// "not there yet", like `{ waiting: true }`.

import { buildTeamsReadback, newColumnId } from './readback.js';

export const PAGE_TIMEOUT_MS = 45000;
// Remove from TEAMS waits for the teacher to press TEAMS's own Delete.
export const DELETE_WAIT_MS = 5 * 60 * 1000;

export const createTeamsAdapter = ({ run, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), log = () => {}, timeoutMs = PAGE_TIMEOUT_MS, nonce = () => Math.random().toString(36).slice(2) }) => {
  // Ask until the page answers with something other than "not yet".
  const until = async (action, args = {}, limitMs = timeoutMs) => {
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
      if (Date.now() - started > limitMs) {
        if (action === 'awaitDeleted') throw new Error('The TEAMS assignment was not deleted. It is still in TEAMS; run the sync again to remove it.');
        throw new Error(`TEAMS did not finish loading (${action}). Check the TEAMS tab: are you still signed in?`);
      }
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

    /** Assign Date and Due Date on the Assignments grid, in TEAMS's own fields. */
    async setDates(sectionRef, columnId, fields) {
      const row = rowOf(sectionRef, columnId);
      await goToGradebook(sectionRef);
      await until('openAssignments');
      await until('setDates', { ...row, fields });
      await until('returnToGradebook');
      // The row now has these dates: a later op in the same batch (an import,
      // #Count) finds it by its new due date, not the one last read.
      const iso = (value) => { const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(value || '').trim()); return m ? `${m[3]}-${m[1]}-${m[2]}` : ''; };
      const column = lastRead.get(sectionRef)?.columns.find((entry) => entry.id === columnId);
      if (column) {
        if (iso(fields['Assign Date'])) column.assignedDate = iso(fields['Assign Date']);
        if (iso(fields['Due Date'])) column.dueDate = iso(fields['Due Date']);
      }
    },

    /*
     * REMOVE FROM TEAMS. TEAMS deletes an assignment after an in-page
     * confirmation (DeSoto, 2026-11-27), but which control does it was not
     * recorded, so the extension does not press it. It marks the row on the
     * Assignments page and asks the teacher to delete it with TEAMS's own
     * Delete, then waits for the row to be gone and checks the gradebook.
     */
    async deleteColumn(sectionRef, columnId, { gradeCount = 0 } = {}) {
      const row = rowOf(sectionRef, columnId);
      await goToGradebook(sectionRef);
      await until('openAssignments');
      await until('markForDelete', { ...row, gradeCount });
      log(`${sectionRef}: delete "${row.name}" in TEAMS now (it is marked on the Assignments page).`);
      await until('awaitDeleted', row, DELETE_WAIT_MS);
      // TEAMS may reload the Assignments page after the delete; back to the gradebook either way.
      await until('returnToGradebook');
      const after = (await readGradebook()).columns;
      if (after.some((entry) => entry.id === columnId)) throw new Error(`"${row.name}" is still in the TEAMS gradebook.`);
      const read = lastRead.get(sectionRef);
      if (read) read.columns = read.columns.filter((entry) => entry.id !== columnId);
    },

    async importFile(sectionRef, columnId, file) {
      const row = rowOf(sectionRef, columnId);
      await goToGradebook(sectionRef);
      await until('openAssignments');
      const token = nonce();
      await until('openImport', { ...row, nonce: token });
      await until('submitImport', { body: file.body, overwrite: file.overwrite === true, nonce: token });
      // The file's district IDs in line order, so TEAMS's "line number: N"
      // errors name their student.
      const ids = String(file.body).split(/\r?\n/).filter(Boolean).map((line) => line.split(',')[0]);
      const { receipt } = await until('readReceipt', { ids });
      log(`${sectionRef}: TEAMS added ${receipt.added} of ${file.rows} grade(s)${receipt.errors.length ? `, refused ${receipt.errors.length}` : ''} (Overwrite ${file.overwrite ? 'Yes' : 'No'}). TEAMS said: ${receipt.summary}`);
      await until('returnToGradebook');
      // Errors for named students are a partial success the server records
      // per student; a refusal with none named is the import failing.
      if (!receipt.ok && !receipt.errors.length) throw new Error('TEAMS refused the import file. The TEAMS message is in the extension log.');
      return { errors: receipt.errors };
    },
  };
};

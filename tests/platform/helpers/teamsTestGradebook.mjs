// A synthetic Frontline TEAMS teacher gradebook for issue #612.
//
// This is not TEAMS. It models what public TEAMS teacher material and
// MathMaster's own TEAMS export describe, and makes every tenant-dependent
// behaviour a switch, so a test states which assumption it rests on:
//
//   documented:  per-assignment Import of a file (student ID column 1, grade
//                column, optional header); a result with grades added and
//                errors; an ID must be scheduled in the class on the
//                assignment's due date; category weights feed the average,
//                and an assignment with no weight does not count.
//   MathMaster:  "Overwrite existing grades?" YES/NO on import (Grade
//                Transfer's MANIFEST already tells teachers to set it).
//   observed on DeSoto's TEAMS (2026-11-26, one test assignment, no scores):
//                the per-assignment weight is "#Count" (default 1) and 0 is
//                accepted at creation (`allowZeroAssignmentWeight`); names are
//                stored to at most 64 characters; the Import dialog defaults
//                to comma, no qualifier, ID column 1, grade column 2, no
//                header, "Overwrite existing grades?" No.
//   teacher:     a #Count-0 grade is not factored into the average.
//   unverified:  clearing a cell (`canClearCells`) and how TEAMS really
//                rounds averages.
//
// Faults reproduce what the browser pilot saw: a save that reports success and
// reopens blank (`phantomSaves`), a connection lost part-way through a file
// (`dropImportAfter`), and a create whose response never arrives
// (`loseCreateResponse`).

const text = (value) => String(value ?? '').trim();
// TEAMS keeps at most 64 characters of an assignment name (observed).
const NAME_MAX = 64;
const clone = (value) => structuredClone(value);

export const createTeamsTestGradebook = ({
  sections = {},
  allowZeroAssignmentWeight = true,
  canClearCells = false,
  faults = {},
} = {}) => {
  const state = { sections: clone(sections), columns: new Map(), cells: new Map(), nextId: 1 };
  const calls = { createColumn: 0, setColumnWeight: [], importScores: [], clearScores: 0 };
  const pendingFaults = {
    phantomSaves: new Map(Object.entries(faults.phantomSaves || {})), // sis -> remaining phantom saves
    dropImportAfter: faults.dropImportAfter ?? null, // first import writes this many rows, then throws
    loseCreateResponse: Boolean(faults.loseCreateResponse),
  };

  const section = (ref) => {
    const found = state.sections[ref];
    if (!found) throw new Error(`Unknown TEAMS section ${ref}`);
    return found;
  };
  const column = (id) => {
    const found = state.columns.get(id);
    if (!found) throw new Error(`Unknown TEAMS assignment ${id}`);
    return found;
  };
  const enrolled = (ref, sis, date) => (section(ref).roster || []).some((entry) => (
    entry.sisStudentId === sis && (!entry.enteredOn || entry.enteredOn <= date) && (!entry.leftOn || entry.leftOn >= date)
  ));

  const api = {
    calls,

    async readGradebook(ref) {
      const found = section(ref);
      const columns = [...state.columns.values()].filter((item) => item.sectionRef === ref);
      return clone({
        sectionRef: ref,
        markingPeriods: found.markingPeriods || [],
        roster: found.roster || [],
        columns: columns.map(({ sectionRef: _sectionRef, ...rest }) => rest),
        cells: Object.fromEntries(columns.map((item) => [item.id, Object.fromEntries(state.cells.get(item.id))])),
      });
    },

    async createColumn(ref, spec) {
      calls.createColumn += 1;
      const period = (section(ref).markingPeriods || []).find((item) => item.id === spec.markingPeriod);
      if (!period) throw new Error('Marking period not found');
      if (period.locked) throw new Error('Marking period is locked');
      if (!(section(ref).categories || {})[spec.category]) throw new Error(`Category ${spec.category} is not set up for this class`);
      if (Number(spec.weight) === 0 && !allowZeroAssignmentWeight) throw new Error('Assignment weight must be greater than 0');
      const id = `A${state.nextId++}`;
      state.columns.set(id, { id, sectionRef: ref, ...clone(spec), name: String(spec.name).slice(0, NAME_MAX), weight: Number(spec.weight) });
      state.cells.set(id, new Map());
      if (pendingFaults.loseCreateResponse) {
        pendingFaults.loseCreateResponse = false;
        throw new Error('Network error: response lost after save');
      }
      return id;
    },

    async setColumnWeight(id, weight) {
      calls.setColumnWeight.push({ id, weight });
      if (Number(weight) === 0 && !allowZeroAssignmentWeight) throw new Error('Assignment weight must be greater than 0');
      column(id).weight = Number(weight);
    },

    /** TEAMS's per-assignment Import: a file body, one "id,grade" row per line. */
    async importScores(id, fileBody, { overwrite = false } = {}) {
      const target = column(id);
      const cells = state.cells.get(id);
      const lines = text(fileBody).split(/\r?\n/).filter(Boolean);
      calls.importScores.push({ id, overwrite, lines: lines.length });
      let added = 0;
      const errors = [];
      for (const [index, line] of lines.entries()) {
        if (pendingFaults.dropImportAfter !== null && index >= pendingFaults.dropImportAfter) {
          pendingFaults.dropImportAfter = null;
          throw new Error('Connection reset during import');
        }
        const [sis, grade] = line.split(',').map(text);
        if (!enrolled(target.sectionRef, sis, target.dueDate)) { errors.push({ sisStudentId: sis, reason: 'Student not scheduled in class on due date' }); continue; }
        if (grade === '') continue; // blanks are skipped, never written
        if (cells.has(sis) && text(cells.get(sis)) !== '' && !overwrite) { errors.push({ sisStudentId: sis, reason: 'Grade exists (overwrite not selected)' }); continue; }
        const phantom = pendingFaults.phantomSaves.get(sis) || 0;
        if (phantom > 0) { pendingFaults.phantomSaves.set(sis, phantom - 1); added += 1; continue; } // "saved", reopens blank
        cells.set(sis, Number(grade));
        added += 1;
      }
      return { added, errors };
    },

    async clearScores(id, sisIds) {
      calls.clearScores += 1;
      if (!canClearCells) throw new Error('Clearing grades is not available on this route');
      sisIds.forEach((sis) => state.cells.get(id).delete(sis));
    },

    // --- what a teacher does by hand in the TEAMS screen ---
    teacherCreateColumn(ref, spec) {
      const id = `A${state.nextId++}`;
      state.columns.set(id, { id, sectionRef: ref, weight: 1, maxScore: 100, ...clone(spec), name: String(spec.name).slice(0, NAME_MAX) });
      state.cells.set(id, new Map());
      return id;
    },
    teacherEnter(id, sis, value) { state.cells.get(id).set(sis, value); },
    teacherClear(id, sis) { state.cells.get(id).delete(sis); },
    teacherSetWeight(id, weight) { column(id).weight = Number(weight); },

    columnsNamed(ref, name) { return [...state.columns.values()].filter((item) => item.sectionRef === ref && item.name === name); },
    columnsIn(ref) { return [...state.columns.values()].filter((item) => item.sectionRef === ref); },
    cell(id, sis) { return state.cells.get(id).get(sis); },

    /**
     * The marking-period average a teacher and parent see. Within a
     * category, scores are averaged by assignment weight; categories combine
     * by their weights, and only categories holding a counted score take
     * part. Blanks and codes (X, EX...) are not scores.
     */
    average(ref, sis, markingPeriod) {
      const categories = section(ref).categories || {};
      let weighted = 0;
      let categoryWeightUsed = 0;
      for (const [category, categoryWeight] of Object.entries(categories)) {
        let points = 0;
        let weights = 0;
        for (const item of state.columns.values()) {
          if (item.sectionRef !== ref || item.markingPeriod !== markingPeriod || item.category !== category) continue;
          const value = state.cells.get(item.id).get(sis);
          if (typeof value !== 'number' || !(item.weight > 0)) continue;
          points += value * item.weight;
          weights += item.weight;
        }
        if (weights > 0 && categoryWeight > 0) {
          weighted += (points / weights) * categoryWeight;
          categoryWeightUsed += categoryWeight;
        }
      }
      return categoryWeightUsed ? Math.round((weighted / categoryWeightUsed) * 100) / 100 : null;
    },
  };
  return api;
};

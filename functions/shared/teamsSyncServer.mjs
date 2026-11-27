// The server side of MathMaster -> Frontline TEAMS sync (route E, #612/#613).
//
// MathMaster's backend holds what to send (targets), what it has sent
// (the ledger) and the plan. The teacher's Chrome extension, signed in to
// TEAMS as the teacher, is the only thing that touches TEAMS: it reads the
// gradebook, applies a batch of operations through TEAMS's own pages (the
// Import dialog for grades), and comes back with the read-back and the
// results. No district password ever reaches MathMaster.
//
// One round trip, `teamsSyncStep`:
//
//   extension → { runnerId, readbacks: {sectionRef: gradebook}, outcomes }
//   server    → reconcile the ledger with the read-backs and outcomes, plan,
//               record each new operation's intent (write-ahead), lease the
//               batch to this runner, and return it.
//
// The lease keeps two open TEAMS tabs from both creating the same column:
// while one runner holds an unanswered batch, another runner is told to wait.
//
// This module is pure (no Firestore): the callable in gradingFunctions.js
// loads and stores what it reads and returns. Every input from a browser is
// validated and bounded here, because a read-back is whatever the page said.

import {
  DESOTO_TEAMS_CAPABILITIES,
  PROVISIONAL_MODE,
  TEAMS_ASSIGNMENT_NAME_MAX,
  planTeamsSync,
  reconcileTeamsLedger,
  recordTeamsIntent,
  recordTeamsOutcome,
  summarizeTeamsPlans,
  teamsAssignmentName,
  teamsOpFile,
} from './teamsSyncEngine.mjs';
import { canonicalDistrictStudentId, effectiveDistrictStudentId, isValidDistrictStudentId } from './studentDistrictId.mjs';

export const TEAMS_SYNC_LIMITS = Object.freeze({
  sectionsPerClass: 3,
  // targets × linked sections: every one is a ledger document a step may
  // rewrite inside one Firestore transaction (at most 500 writes).
  targetSectionPairs: 400,
  rowsPerTarget: 250,
  columnsPerSection: 1000,
  rosterPerSection: 400,
  opsPerStep: 40,
  outcomesPerStep: 80,
  leaseMs: 3 * 60 * 1000,
});

export class TeamsSyncInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TeamsSyncInputError';
  }
}

const fail = (message) => { throw new TeamsSyncInputError(message); };
const text = (value) => String(value ?? '').trim();
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (value, what) => {
  const raw = text(value);
  if (!raw) return '';
  if (!DAY.test(raw) || !Number.isFinite(Date.parse(`${raw}T00:00:00Z`))) fail(`${what} must be a date (YYYY-MM-DD).`);
  return raw;
};
const array = (value, max, what) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(`${what} must be a list.`);
  if (value.length > max) fail(`Too many ${what} (at most ${max}).`);
  return value;
};

// "15001/05": TEAMS's course/section. Letters, digits, space, / _ . - only.
const SECTION_REF = /^[A-Za-z0-9][A-Za-z0-9 /_.-]{0,39}$/;
export const normalizeTeamsSectionRef = (value) => {
  const ref = text(value).replace(/\s+/g, ' ');
  if (!SECTION_REF.test(ref)) fail('A TEAMS section is 1–40 letters, digits, spaces or / _ . - (for example 15001/05).');
  return ref;
};

/**
 * The TEAMS sections one MathMaster class is linked to. An inclusion class
 * is more than one (DeSoto: two 5th and two 8th periods in TEAMS).
 */
export const normalizeTeamsSections = (input) => {
  const seen = new Set();
  return array(input, TEAMS_SYNC_LIMITS.sectionsPerClass, 'TEAMS sections').map((entry) => {
    const sectionRef = normalizeTeamsSectionRef(entry?.sectionRef ?? entry);
    if (seen.has(sectionRef)) fail(`TEAMS section ${sectionRef} is listed twice.`);
    seen.add(sectionRef);
    return { sectionRef, label: text(entry?.label).slice(0, 80) };
  });
};

export const normalizeTeamsCapabilities = (input = null) => {
  if (!input) return { ...DESOTO_TEAMS_CAPABILITIES };
  const provisional = text(input.provisional) || DESOTO_TEAMS_CAPABILITIES.provisional;
  if (!Object.values(PROVISIONAL_MODE).includes(provisional)) fail('Unknown provisional mode.');
  return { provisional, canClearCells: input.canClearCells !== false };
};

/**
 * The class's students as the server knows them: studentId -> district ID.
 * `students` are grades/{id} records ({ id, sisStudentId }).
 *
 * `sharedWith` is every student the teacher holds (grades where
 * assignedTeacherEmail, the roster Grade Export checks). A district ID that
 * two different students carry there or in the class (leading zeros ignored)
 * is left out of the index, so no grade is stored under it: two children
 * under one district ID collide in TEAMS whichever class each is in, and
 * Grade Export holds both back (gradeTransferModel.js sharedSisStudentIds).
 */
export const teamsRosterIndex = (students = [], { sharedWith = [] } = {}) => {
  const idOf = (student) => text(student?.id ?? student?.studentId);
  const holders = new Map();
  [...(students || []), ...(sharedWith || [])].forEach((student) => {
    const canonical = canonicalDistrictStudentId(effectiveDistrictStudentId(student || {}));
    const id = idOf(student);
    if (!canonical || !id) return;
    if (!holders.has(canonical)) holders.set(canonical, new Set());
    holders.get(canonical).add(id);
  });
  return new Map((students || [])
    .map((student) => [idOf(student), effectiveDistrictStudentId(student || {})])
    .filter(([id, sis]) => id && isValidDistrictStudentId(sis))
    .filter(([, sis]) => (holders.get(canonicalDistrictStudentId(sis))?.size || 0) <= 1));
};

/**
 * Validate what Grade Transfer published for one class. A row is kept only
 * when its student is on this class's MathMaster roster under that same
 * district ID: a browser cannot put a grade under another class's student or
 * a mistyped number. Dropped rows are counted, not silently lost.
 */
export const normalizeTeamsTargets = ({ targets, classId, roster, sectionCount = 1 }) => {
  const cleanClassId = text(classId);
  const list = array(targets, Math.max(1, Math.floor(TEAMS_SYNC_LIMITS.targetSectionPairs / Math.max(1, sectionCount))), 'targets');
  const seen = new Set();
  let droppedRows = 0;
  const people = (rows, { graded }) => array(rows, TEAMS_SYNC_LIMITS.rowsPerTarget, 'rows').flatMap((row) => {
    const studentId = text(row?.studentId).slice(0, 320);
    const sisStudentId = roster.get(studentId);
    if (!sisStudentId || text(row?.sisStudentId) !== sisStudentId) { droppedRows += 1; return []; }
    if (!graded) return [{ studentId, sisStudentId, reason: text(row?.reason).slice(0, 120) }];
    const grade = Number(row?.grade);
    if (!Number.isInteger(grade) || grade < 0 || grade > 100) fail('Every TEAMS grade must be a whole number from 0 to 100.');
    return [{ studentId, sisStudentId, grade }];
  });
  const normalized = list.map((input) => {
    const key = text(input?.key);
    if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(key) || !key.startsWith(`${cleanClassId}__`)) fail('A target key must belong to this class.');
    if (seen.has(key)) fail('A target is listed twice.');
    seen.add(key);
    const category = text(input?.category);
    if (!['Daily', 'Test'].includes(category)) fail('A TEAMS category is Daily or Test.');
    const dueDate = day(input?.dueDate, 'The due date');
    if (!dueDate) fail('A target needs a due date.');
    const countedWeight = input?.countedWeight === undefined ? 1 : Number(input.countedWeight);
    if (!Number.isInteger(countedWeight) || countedWeight < 1 || countedWeight > 10) fail('#Count must be a whole number from 1 to 10.');
    const rows = people(input?.rows, { graded: true });
    const finalIds = new Set(rows.map((row) => row.sisStudentId));
    const unique = (list) => list.filter((row) => !finalIds.has(row.sisStudentId));
    return {
      key,
      classId: cleanClassId,
      name: teamsAssignmentName(text(input?.name).slice(0, 240)) || fail('A target needs a name.'),
      category,
      assignedDate: day(input?.assignedDate, 'The assigned date'),
      dueDate,
      closed: input?.closed === true,
      countedWeight,
      rows,
      withheld: unique(people(input?.withheld, { graded: false })),
      excused: unique(people(input?.excused, { graded: false })),
      unresolved: unique(people(input?.unresolved, { graded: false })),
    };
  });
  return { targets: normalized, droppedRows };
};

/** One TEAMS section as the extension read it. Bounded and typed. */
export const normalizeTeamsReadback = (input, sectionRef) => {
  if (!input || typeof input !== 'object') fail(`The read-back for ${sectionRef} is missing.`);
  const id = (value, what) => {
    const raw = text(value);
    if (!/^[A-Za-z0-9_.:/-]{1,80}$/.test(raw)) fail(`${what} is not a TEAMS id.`);
    return raw;
  };
  const markingPeriods = array(input.markingPeriods, 12, 'marking periods').map((period) => ({
    id: id(period?.id, 'A marking period'),
    start: day(period?.start, 'A marking period start'),
    end: day(period?.end, 'A marking period end'),
    locked: period?.locked === true,
  }));
  const roster = array(input.roster, TEAMS_SYNC_LIMITS.rosterPerSection, 'roster entries').map((entry) => {
    const sisStudentId = text(entry?.sisStudentId);
    if (!isValidDistrictStudentId(sisStudentId)) fail('A TEAMS roster entry needs a district ID.');
    return { sisStudentId, enteredOn: day(entry?.enteredOn, 'An entry date'), leftOn: day(entry?.leftOn, 'A withdrawal date') };
  });
  const columns = array(input.columns, TEAMS_SYNC_LIMITS.columnsPerSection, 'TEAMS assignments').map((column) => {
    const weight = Number(column?.weight);
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) fail('A TEAMS #Count must be a number from 0 to 100.');
    return {
      id: id(column?.id, 'A TEAMS assignment'),
      name: text(column?.name).slice(0, TEAMS_ASSIGNMENT_NAME_MAX),
      category: text(column?.category).slice(0, 40),
      markingPeriod: text(column?.markingPeriod).slice(0, 80),
      assignedDate: day(column?.assignedDate, 'An assign date'),
      dueDate: day(column?.dueDate, 'A due date'),
      weight,
    };
  });
  const columnIds = new Set(columns.map((column) => column.id));
  const cells = {};
  const rawCells = input.cells && typeof input.cells === 'object' ? input.cells : {};
  for (const [columnId, values] of Object.entries(rawCells)) {
    if (!columnIds.has(columnId) || !values || typeof values !== 'object') continue;
    cells[columnId] = {};
    for (const [sis, value] of Object.entries(values)) {
      if (!isValidDistrictStudentId(sis)) continue;
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000) cells[columnId][sis] = value;
      else if (typeof value === 'string' && value.trim().length <= 8) cells[columnId][sis] = value.trim();
    }
  }
  return { sectionRef, markingPeriods, roster, columns, cells };
};

// MM-DD-YYYY: how TEAMS's own screens show and take dates.
const teamsScreenDate = (value) => (DAY.test(text(value)) ? `${value.slice(5, 7)}-${value.slice(8, 10)}-${value.slice(0, 4)}` : '');

/** What the extension is told to do: one self-contained instruction per op. */
const wireOp = (op, opId, plan) => {
  const base = { opId, type: op.type, sectionRef: op.sectionRef || plan?.sectionRef || '' };
  if (op.type === 'createColumn') {
    return {
      ...base,
      spec: {
        ...op.spec,
        // TEAMS's field names, so the extension fills the row it sees.
        teamsFields: {
          'Assignment Name': op.spec.name,
          Category: op.spec.category,
          'Assign Date': teamsScreenDate(op.spec.assignedDate),
          'Due Date': teamsScreenDate(op.spec.dueDate),
          '#Count': op.spec.weight,
          'Maximum Value': op.spec.maxScore,
        },
      },
    };
  }
  if (op.type === 'setWeight') return { ...base, columnId: op.columnId, weight: op.weight, teamsField: '#Count' };
  const file = teamsOpFile(op);
  return {
    ...base,
    columnId: op.columnId,
    // The Import dialog: Delimiter Comma, Text Qualifier None, Student ID
    // Column 1, Grade Column 2, Header Row No, and Overwrite as given.
    importFile: { body: file.body, overwrite: file.overwrite, rows: (op.rows || op.sisStudentIds || []).length },
  };
};

const compactPlans = (plans) => plans.map((plan) => ({
  key: plan.key,
  targetKey: plan.targetKey || plan.key,
  sectionRef: plan.sectionRef || null,
  columnId: plan.columnId || null,
  weight: plan.weight ?? null,
  cells: plan.cells,
  exceptions: plan.exceptions,
}));

/**
 * One round trip with the teacher's extension. Pure: returns the next class
 * state and ledger; the caller persists them in one transaction.
 *
 * `classState`: { sections, capabilities, stepCounter, issued }
 * `ledger`: { [ledgerKey]: entry } for these targets' keys
 * `readbacks`: { [sectionRef]: gradebook } as the extension read them
 * `outcomes`: [{ opId, ok, columnId?, errors?, error? }] for the last batch
 * `dryRun`: plan only. Nothing is recorded or leased (Grade Transfer's preview).
 */
export const teamsSyncStep = ({
  classState = {}, targets = [], ledger = {}, readbacks = {}, outcomes = [], runnerId = '', now = Date.now(), dryRun = false,
}) => {
  const sections = classState.sections || [];
  if (!sections.length) fail('Link this class to its TEAMS section first.');
  const runner = text(runnerId).slice(0, 80);
  if (!dryRun && !/^[A-Za-z0-9_-]{8,80}$/.test(runner)) fail('A sync runner id is required.');
  const capabilities = normalizeTeamsCapabilities(classState.capabilities);
  const issued = classState.issued || null;
  const atIso = new Date(now).toISOString();

  if (!dryRun && issued && issued.runnerId !== runner && now < Number(issued.leaseUntil || 0)) {
    return {
      classState, ledger, changed: false,
      response: { status: 'busy', retryAfterMs: Number(issued.leaseUntil) - now, ops: [] },
    };
  }

  let state = structuredClone(ledger || {});
  // Outcomes count only for the batch this runner holds.
  if (!dryRun && issued && issued.runnerId === runner) {
    const byId = new Map((issued.ops || []).map((entry) => [entry.opId, entry.op]));
    for (const outcome of array(outcomes, TEAMS_SYNC_LIMITS.outcomesPerStep, 'outcomes')) {
      const op = byId.get(text(outcome?.opId));
      if (!op) continue;
      recordTeamsOutcome(state, op, {
        ok: outcome?.ok === true,
        columnId: text(outcome?.columnId).slice(0, 80),
        errors: array(outcome?.errors, TEAMS_SYNC_LIMITS.rowsPerTarget, 'import errors').map((item) => ({
          sisStudentId: text(item?.sisStudentId), reason: text(item?.reason).slice(0, 160),
        })),
      }, atIso);
    }
  }

  const linked = sections.map((entry) => entry.sectionRef);
  const gradebooks = new Map();
  for (const ref of linked) {
    if (readbacks && Object.prototype.hasOwnProperty.call(readbacks, ref)) gradebooks.set(ref, normalizeTeamsReadback(readbacks[ref], ref));
  }
  const routed = targets.map((target) => ({ ...target, teamsSectionRefs: linked }));
  const first = planTeamsSync({ targets: routed, ledger: state, gradebooks, capabilities });
  if (!dryRun) state = reconcileTeamsLedger({ units: first.units, plans: first.plans, ledger: state, gradebooks, at: atIso });
  const { plans } = planTeamsSync({ targets: routed, ledger: state, gradebooks, capabilities });

  const planned = plans.flatMap((plan) => plan.ops.map((op) => ({ op, plan })));
  const batch = planned.slice(0, TEAMS_SYNC_LIMITS.opsPerStep);
  const stepId = Number(classState.stepCounter || 0) + 1;
  const ops = batch.map(({ op, plan }, index) => {
    const opId = `${stepId}-${index}`;
    if (!dryRun) recordTeamsIntent(state, op, atIso);
    return { opId, op, wire: wireOp(op, opId, plan) };
  });

  // Every exception names its lesson and TEAMS section, so a teacher reading
  // "needs your decision" knows where to look in TEAMS.
  const lessonOf = new Map(routed.map((target) => [target.key, target.name]));
  const sectionOfPlan = new Map(plans.map((plan) => [plan.key, { targetKey: plan.targetKey || plan.key, sectionRef: plan.sectionRef || null }]));
  const exceptions = plans.flatMap((plan) => plan.exceptions).map((item) => {
    const where = sectionOfPlan.get(item.key) || { targetKey: item.key, sectionRef: null };
    return { ...item, targetKey: where.targetKey, sectionRef: where.sectionRef, lesson: lessonOf.get(where.targetKey) || '' };
  });
  const response = {
    status: ops.length ? 'work' : 'done',
    stepId: dryRun ? null : stepId,
    dryRun,
    ops: ops.map((entry) => entry.wire),
    remainingOps: Math.max(0, planned.length - batch.length),
    unreadSections: linked.filter((ref) => !gradebooks.has(ref)),
    summary: summarizeTeamsPlans(plans),
    exceptions,
    plans: compactPlans(plans),
  };
  if (dryRun) return { classState, ledger, changed: false, response };

  const nextClassState = {
    ...classState,
    capabilities,
    stepCounter: stepId,
    issued: ops.length
      ? { stepId, runnerId: runner, leaseUntil: now + TEAMS_SYNC_LIMITS.leaseMs, ops: ops.map(({ opId, op }) => ({ opId, op })) }
      : null,
    lastStep: {
      at: atIso,
      runnerId: runner,
      status: response.status,
      summary: response.summary,
      exceptionCount: response.exceptions.length,
      // What Grade Transfer shows as "needs your decision": the first 60,
      // with only what a teacher needs to find each one in TEAMS.
      exceptions: response.exceptions.slice(0, 60).map((item) => ({
        code: item.code,
        message: item.message,
        lesson: item.lesson,
        sectionRef: item.sectionRef,
        studentId: item.studentId || '',
        sisStudentId: item.sisStudentId || '',
        ...(item.teams !== undefined ? { teams: item.teams } : {}),
        ...(item.mathmaster !== undefined ? { mathmaster: item.mathmaster } : {}),
      })),
      unreadSections: response.unreadSections,
    },
  };
  return { classState: nextClassState, ledger: state, changed: true, response };
};

/** Which ledger entries a step changed, so only those are written. */
export const changedTeamsLedgerKeys = (before = {}, after = {}) => Object.keys(after)
  .filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null));

/** The ledger keys a set of targets can touch: one per target and section. */
export const teamsLedgerKeysFor = (targets = [], sections = []) => targets
  .flatMap((target) => sections.map((entry) => `${target.key}@${entry.sectionRef}`));

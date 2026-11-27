// What Grade Export's "Automatic TEAMS sync" panel shows and accepts (#612).
// Pure, so node tests cover every message the panel can show; the panel
// (components/teacher/TeamsSyncPanel.jsx) only renders these.

import { TeamsSyncInputError, normalizeTeamsSections } from '../../../functions/shared/teamsSyncServer.mjs';
import { TEAMS_EXCEPTION } from '../../../functions/shared/teamsSyncEngine.mjs';

const text = (value) => String(value ?? '').trim();

/**
 * A teacher types a class's TEAMS section(s): "15001/05" or, for a class
 * whose inclusion students TEAMS keeps in their own section,
 * "15001/05, 15001/55". Commas, semicolons or new lines separate them. The
 * server applies the same check (normalizeTeamsSections); this one only
 * answers sooner.
 */
export const parseTeamsSectionsDraft = (draft) => {
  const parts = text(draft).split(/[,;\n]+/).map(text).filter(Boolean);
  try {
    return { ok: true, sections: normalizeTeamsSections(parts) };
  } catch (error) {
    if (error instanceof TeamsSyncInputError) return { ok: false, error: error.message };
    throw error;
  }
};

export const formatTeamsSections = (sections = []) => (sections || []).map((entry) => entry.sectionRef).join(', ');

const listed = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

// The scheduled publish (gradingFunctions.js publishTeamsSyncTargetsOnSchedule).
const AUTOMATIC = 'MathMaster sends current grades automatically every 30 minutes from 6 am to 10 pm';

export const relativeTime = (iso, now = Date.now()) => {
  const at = Date.parse(iso || '');
  if (!Number.isFinite(at)) return '';
  const minutes = Math.round((now - at) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

/**
 * One class's sync status in words: a headline, a tone, and detail lines.
 * `state` is what getTeamsSyncState returned.
 */
export const describeTeamsSyncState = (state = null, { now = Date.now() } = {}) => {
  if (!state) return { tone: 'neutral', headline: 'Checking…', details: [] };
  const sections = (state.sections || []).map((entry) => entry.sectionRef);
  if (!sections.length) {
    return { tone: 'neutral', headline: 'Not linked to TEAMS', details: ['Enter this class\'s TEAMS section to start.'] };
  }
  const details = [`TEAMS section${sections.length === 1 ? '' : 's'} ${listed(sections)}${sections.length > 1 ? ': each student\'s grade goes to the section TEAMS lists them in' : ''}.`];
  if (!state.targetCount) {
    details.push(`No grades sent to the sync yet. ${AUTOMATIC}, or press Send now.`);
    return { tone: 'neutral', headline: 'Linked, nothing sent yet', details };
  }
  details.push(`${state.targetCount} lesson section${state.targetCount === 1 ? '' : 's'} in the sync${state.targetsPublishedAt ? `, last changed ${relativeTime(state.targetsPublishedAt, now)}` : ''}.`);
  details.push(state.targetsCheckedBy === 'schedule' && state.targetsCheckedAt
    ? `${AUTOMATIC}; last checked ${relativeTime(state.targetsCheckedAt, now)}.`
    : `${AUTOMATIC}.`);
  const leased = Date.parse(state.batchLeasedUntil || '');
  if (Number.isFinite(leased) && leased > now) {
    return { tone: 'primary', headline: 'Syncing in a TEAMS tab now', details };
  }
  const step = state.lastStep;
  if (!step) {
    details.push('Waiting for the MathMaster extension in your TEAMS tab.');
    return { tone: 'neutral', headline: 'Waiting for TEAMS', details };
  }
  const ago = relativeTime(step.at, now);
  if ((step.unreadSections || []).length) {
    details.push(`TEAMS section${step.unreadSections.length === 1 ? '' : 's'} ${listed(step.unreadSections)} could not be read in the last sync, so nothing in this class was written.`);
    return { tone: 'warning', headline: `Last sync ${ago}: a section was not read`, details };
  }
  if (step.status === 'work') {
    details.push('The last sync stopped part way. The next one continues from what TEAMS shows.');
    return { tone: 'warning', headline: `Last sync ${ago}: not finished`, details };
  }
  if (step.exceptionCount) {
    return { tone: 'warning', headline: `Last sync ${ago}: ${step.exceptionCount} need${step.exceptionCount === 1 ? 's' : ''} your decision`, details };
  }
  return { tone: 'success', headline: `Last sync ${ago}: TEAMS matches MathMaster`, details };
};

// Grouped for a teacher: what happened, in the order to look at them.
const GROUPS = [
  { title: 'Grades changed in TEAMS after MathMaster sent them', codes: [TEAMS_EXCEPTION.TEACHER_OVERRIDE] },
  { title: 'Grades already in TEAMS that differ from MathMaster', codes: [TEAMS_EXCEPTION.MANUAL_GRADE_DIFFERS] },
  { title: 'Grades cleared in TEAMS', codes: [TEAMS_EXCEPTION.TEACHER_CLEARED] },
  { title: 'Students not on exactly one of this class\'s TEAMS sections', codes: [TEAMS_EXCEPTION.NOT_ENROLLED, TEAMS_EXCEPTION.ENROLLED_IN_SEVERAL] },
  // DeSoto's TEAMS cannot clear a cell, so a closed lesson keeps #Count 0
  // while a student's provisional score is still there (owner, 2026-11-27).
  { title: '#Count waiting for a final grade', codes: [TEAMS_EXCEPTION.COUNT_HELD_FOR_FINAL_GRADE] },
  { title: 'Provisional scores that would count', codes: [TEAMS_EXCEPTION.PROVISIONAL_WEIGHT_NOT_ZERO, TEAMS_EXCEPTION.REOPENED_AFTER_COUNTED] },
  { title: 'TEAMS did not keep a grade', codes: [TEAMS_EXCEPTION.SAVE_NOT_PERSISTING] },
  {
    title: 'TEAMS assignments to check',
    codes: [TEAMS_EXCEPTION.AMBIGUOUS_COLUMN, TEAMS_EXCEPTION.MAPPED_COLUMN_MISSING, TEAMS_EXCEPTION.CATEGORY_MISMATCH, TEAMS_EXCEPTION.MARKING_PERIOD_LOCKED, TEAMS_EXCEPTION.NO_MARKING_PERIOD, TEAMS_EXCEPTION.CLASS_NOT_MAPPED],
  },
];

/**
 * The last sync's exceptions, grouped. `labelFor({ studentId, sisStudentId })`
 * names a student from the roster the screen already holds.
 */
export const groupTeamsExceptions = (exceptions = [], labelFor = (row) => row.sisStudentId || '') => {
  const known = new Set(GROUPS.flatMap((group) => group.codes));
  const groups = [...GROUPS, { title: 'Other', codes: null }].map((group) => ({
    title: group.title,
    items: (exceptions || [])
      .filter((item) => (group.codes ? group.codes.includes(item.code) : !known.has(item.code)))
      .map((item) => {
        const who = item.studentId || item.sisStudentId ? labelFor(item) : '';
        const values = item.teams !== undefined && item.mathmaster !== undefined ? `TEAMS ${item.teams} · MathMaster ${item.mathmaster}` : '';
        const where = [item.lesson, item.sectionRef ? `TEAMS ${item.sectionRef}` : ''].filter(Boolean).join(' · ');
        return { code: item.code, who, where, values, message: item.message || '' };
      }),
  }));
  return groups.filter((group) => group.items.length);
};

/** What "Send now" reports back. */
export const publishResultMessage = ({ published = 0, droppedRows = 0 } = {}, className = 'this class') => {
  const sent = `Sent ${published} lesson section${published === 1 ? '' : 's'} for ${className} to the sync.`;
  const next = ' The MathMaster extension in your TEAMS tab applies them on its next run.';
  if (!droppedRows) return { tone: 'success', text: `${sent}${next}` };
  return {
    tone: 'warning',
    text: `${sent} ${droppedRows} grade${droppedRows === 1 ? ' was' : 's were'} left out because the student is not in this class under that district ID. Check the district IDs above.${next}`,
  };
};

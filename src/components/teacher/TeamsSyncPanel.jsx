import { useEffect, useRef, useState } from 'react';
import {
  describeTeamsSyncState,
  formatTeamsSections,
  groupTeamsExceptions,
  parseTeamsSectionsDraft,
  publishResultMessage,
} from '../../platform/gradeTransfer/teamsSyncPanelModel.js';
import {
  getTeamsSyncState,
  publishTeamsSyncTargets,
  setTeamsSyncSections,
} from '../../platform/gradeTransfer/teamsSyncStore.js';

/*
 * AUTOMATIC TEAMS SYNC (#612), inside Grade Export.
 *
 * Per class: link it to its TEAMS section(s), send its current grades to the
 * sync, and see what the last sync did and what needs the teacher. The
 * MathMaster extension in the teacher's own TEAMS tab does the writing; this
 * screen never touches TEAMS.
 *
 * It loads nothing until the teacher opens it, so Grade Export costs no extra
 * call for a teacher who does not use the sync. Once open, a class that joins
 * the list later (Grade Export's class filter changed) is loaded when it
 * appears, so no card is left at "Checking…". Grades are sent only once
 * Grade Export's own history has loaded (`ready`), so the sync starts from
 * the same Practice Pass and extension state the export uses.
 */
export default function TeamsSyncPanel({
  classes = [],
  // (classId) => sync targets for that class (teamsSync.js buildTeamsSyncTargets).
  buildTargets,
  // ({ studentId, sisStudentId }) => the student's name from the roster.
  labelFor = (row) => row.sisStudentId || '',
  ready = false,
}) {
  const [opened, setOpened] = useState(false);
  const [states, setStates] = useState({});
  const [drafts, setDrafts] = useState({});
  const [working, setWorking] = useState(null);
  const [notices, setNotices] = useState({});
  // Classes whose sync state has been asked for, once each.
  const requested = useRef(new Set());

  const notice = (classId, value) => setNotices((current) => ({ ...current, [classId]: value }));

  const load = async (classId) => {
    try {
      const state = await getTeamsSyncState({ classId });
      setStates((current) => ({ ...current, [classId]: state }));
      setDrafts((current) => (current[classId] === undefined ? { ...current, [classId]: formatTeamsSections(state.sections) } : current));
    } catch (error) {
      notice(classId, { tone: 'danger', text: `The TEAMS sync status could not load: ${error.message}` });
    }
  };

  const onToggle = (event) => {
    if (!event.currentTarget.open || opened) return;
    setOpened(true);
  };

  const classIds = classes.map((entry) => entry.classId).join('|');
  useEffect(() => {
    if (!opened) return;
    classIds.split('|').filter(Boolean).forEach((classId) => {
      if (requested.current.has(classId)) return;
      requested.current.add(classId);
      load(classId);
    });
  }, [opened, classIds]);

  const saveSections = async (entry) => {
    const parsed = parseTeamsSectionsDraft(drafts[entry.classId]);
    if (!parsed.ok) {
      notice(entry.classId, { tone: 'warning', text: parsed.error });
      return;
    }
    setWorking(entry.classId);
    try {
      await setTeamsSyncSections({ classId: entry.classId, sections: parsed.sections });
      await load(entry.classId);
      setDrafts((current) => ({ ...current, [entry.classId]: formatTeamsSections(parsed.sections) }));
      notice(entry.classId, {
        tone: 'success',
        text: parsed.sections.length
          ? `Linked to TEAMS ${formatTeamsSections(parsed.sections)}.`
          : 'Unlinked from TEAMS. Nothing more is synced for this class.',
      });
    } catch (error) {
      notice(entry.classId, { tone: 'danger', text: error.message });
    } finally {
      setWorking(null);
    }
  };

  const sendGrades = async (entry) => {
    setWorking(entry.classId);
    try {
      const result = await publishTeamsSyncTargets({ classId: entry.classId, targets: buildTargets(entry.classId) });
      await load(entry.classId);
      notice(entry.classId, publishResultMessage(result, entry.name || entry.period || 'this class'));
    } catch (error) {
      notice(entry.classId, { tone: 'danger', text: error.message });
    } finally {
      setWorking(null);
    }
  };

  return (
    <details className="tw-disclosure" data-teams-sync-panel onToggle={onToggle}>
      <summary>
        Automatic TEAMS sync
        <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>Link classes to TEAMS; grades go there without a file</span>
      </summary>
      <div className="tw-disclosure__body tw-stack" style={{ gap: 12 }}>
        <p className="tw-small tw-muted" style={{ margin: 0 }}>
          The MathMaster extension in your signed-in TEAMS tab creates each lesson&apos;s Warm-Up, Classwork, Practice and DOL
          assignments and imports the grades. While a lesson is open, scores show in TEAMS at #Count 0 and do not count toward
          the average. When it closes, #Count changes to 1 once, after every student whose open-lesson score is in TEAMS has a
          final grade (TEAMS cannot clear a score, so it waits). Grades you typed in TEAMS are never overwritten. Your TEAMS
          password never leaves your browser. MathMaster sends each linked class&apos;s current grades to the sync every 30 minutes
          from 6 am to 10 pm; Send now does it right away.
        </p>
        <p className="tw-small tw-muted" style={{ margin: 0 }}>
          A class whose inclusion students TEAMS keeps in their own section has two TEAMS sections: enter both, separated by a
          comma (for example 15001/05, 15001/55). Each student&apos;s grade goes to the section TEAMS lists them in.
        </p>
        {classes.map((entry) => {
          const state = states[entry.classId];
          const status = describeTeamsSyncState(state);
          const groups = groupTeamsExceptions(state?.lastStep?.exceptions || [], labelFor);
          const linked = (state?.sections || []).length > 0;
          const isWorking = working === entry.classId;
          const name = entry.name || entry.period || entry.classId;
          const inputId = `teams-sections-${entry.classId}`;
          return (
            <div key={entry.classId} className="tw-card tw-stack" style={{ gap: 8 }} data-teams-sync-class={entry.classId}>
              <div className="tw-row" style={{ gap: 8 }}>
                <strong>{name}</strong>
                <span className="tw-pill" data-tone={status.tone}>{status.headline}</span>
              </div>
              {status.details.map((line) => <div key={line} className="tw-small tw-muted">{line}</div>)}
              <div className="tw-row" style={{ alignItems: 'flex-end' }}>
                {/* minWidth 0 and a minmax(0, 1fr) column let the field shrink to a phone
                    at 200% text; otherwise the input's own width holds it at 360px. */}
                <label htmlFor={inputId} className="tw-small tw-strong" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4, flex: '1 1 240px', minWidth: 0, maxWidth: 360 }}>
                  TEAMS section(s)
                  <input
                    id={inputId}
                    className="tw-input"
                    style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}
                    value={drafts[entry.classId] ?? ''}
                    placeholder="e.g. 15001/05"
                    disabled={!state || isWorking}
                    onChange={(event) => setDrafts((current) => ({ ...current, [entry.classId]: event.target.value }))}
                  />
                </label>
                <button type="button" className="tw-btn tw-btn--sm" disabled={!state || isWorking} onClick={() => saveSections(entry)}>
                  {isWorking ? 'Saving…' : 'Save sections'}
                </button>
                <button
                  type="button"
                  className="tw-btn tw-btn--sm tw-btn--primary"
                  disabled={!linked || !ready || isWorking}
                  title={!ready ? 'Waiting for the export history to load' : undefined}
                  onClick={() => sendGrades(entry)}
                >
                  Send now
                </button>
              </div>
              {/* Always in the card, so a screen reader announces the text put in it: a status mounted with its text
                  already in it is not announced by every one (a11y sweep 2026-11-28). Hidden while it has nothing to say. */}
              <div role="status" className={notices[entry.classId] ? 'tw-notice' : 'tw-sr-only'} data-tone={notices[entry.classId]?.tone}>{notices[entry.classId]?.text}</div>
              {groups.length > 0 && (
                <details data-teams-sync-decisions>
                  <summary className="tw-small tw-link" style={{ display: 'inline' }}>
                    Needs your decision ({state.lastStep.exceptionCount})
                  </summary>
                  {groups.map((group) => (
                    <div key={group.title} className="tw-stack" style={{ gap: 2, marginTop: 6 }}>
                      <span className="tw-small tw-strong">{group.title}</span>
                      <ul className="tw-small" style={{ margin: 0, paddingLeft: 18 }}>
                        {group.items.map((item, index) => (
                          <li key={`${item.code}-${item.who}-${item.where}-${index}`}>
                            {[item.who, item.where, item.values].filter(Boolean).join(' · ') || item.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {state.lastStep.exceptionCount > (state.lastStep.exceptions || []).length && (
                    <div className="tw-small tw-muted">Showing the first {(state.lastStep.exceptions || []).length}.</div>
                  )}
                </details>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

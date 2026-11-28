import { useEffect, useRef, useState } from 'react';
import {
  describeTeamsRemovals,
  describeTeamsSyncState,
  formatTeamsSections,
  groupTeamsExceptions,
  parseTeamsSectionsDraft,
  publishResultMessage,
  removableTeamsTargets,
  removalConfirmationMatches,
} from '../../platform/gradeTransfer/teamsSyncPanelModel.js';
import {
  getTeamsSyncState,
  publishTeamsSyncTargets,
  setTeamsSyncRemoval,
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
  // Remove from TEAMS: which class's list is open (its lessons are built only
  // then), the lesson chosen to remove, and the typed grade counts.
  const [removalOpen, setRemovalOpen] = useState({});
  const [removalChoice, setRemovalChoice] = useState({});
  const [removalArmed, setRemovalArmed] = useState(null);
  const [confirmDrafts, setConfirmDrafts] = useState({});

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

  // Remove from TEAMS, confirm the grades that go with it, or send it back.
  const changeRemoval = async (entry, targetKey, action, confirmGradeCount) => {
    setWorking(entry.classId);
    try {
      await setTeamsSyncRemoval({ classId: entry.classId, targetKey, action, confirmGradeCount });
      await load(entry.classId);
      setRemovalArmed(null);
      if (action === 'remove') setRemovalChoice((current) => ({ ...current, [entry.classId]: '' }));
      notice(entry.classId, {
        tone: 'success',
        text: action === 'restore'
          ? 'Sent to TEAMS again. The extension creates its TEAMS assignment on its next sync.'
          : action === 'confirm'
            ? 'Confirmed. The extension removes it from TEAMS on its next sync.'
            : 'Marked to remove from TEAMS. The lesson stays in MathMaster. On its next sync, the extension marks the assignment in your TEAMS tab for you to delete with TEAMS\'s own Delete.',
      });
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
              {notices[entry.classId] && <div role="status" className="tw-notice" data-tone={notices[entry.classId].tone}>{notices[entry.classId].text}</div>}
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
              {linked && (
                <details
                  data-teams-sync-removals
                  onToggle={(event) => { const open = event.currentTarget.open; setRemovalOpen((current) => ({ ...current, [entry.classId]: open })); }}
                >
                  <summary className="tw-small tw-link" style={{ display: 'inline' }}>
                    Remove a lesson from TEAMS{Object.keys(state?.removals || {}).length ? ` (${Object.keys(state.removals).length} removed)` : ''}
                  </summary>
                  {removalOpen[entry.classId] && (() => {
                    const targets = buildTargets(entry.classId) || [];
                    const removable = removableTeamsTargets(state, targets);
                    const removed = describeTeamsRemovals(state, targets);
                    const choice = removalChoice[entry.classId] || '';
                    const chosen = removable.find((target) => target.key === choice);
                    const selectId = `teams-remove-${entry.classId}`;
                    return (
                      <div className="tw-stack" style={{ gap: 8, marginTop: 6 }}>
                        <p className="tw-small tw-muted" style={{ margin: 0 }}>
                          Takes the lesson&apos;s TEAMS assignment out of TEAMS. The lesson, its grades and Grade Export stay in MathMaster.
                          Only an assignment MathMaster made is removed; one you made in TEAMS is left there. If it has grades in TEAMS,
                          you confirm how many first.
                        </p>
                        <div className="tw-row" style={{ alignItems: 'flex-end' }}>
                          <label htmlFor={selectId} className="tw-small tw-strong" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4, flex: '1 1 240px', minWidth: 0, maxWidth: 420 }}>
                            Lesson
                            <select
                              id={selectId}
                              className="tw-input"
                              style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}
                              value={choice}
                              disabled={isWorking || !removable.length}
                              onChange={(event) => { setRemovalArmed(null); setRemovalChoice((current) => ({ ...current, [entry.classId]: event.target.value })); }}
                            >
                              <option value="">{removable.length ? 'Choose a lesson…' : 'No lessons to remove'}</option>
                              {removable.map((target) => <option key={target.key} value={target.key}>{target.name}</option>)}
                            </select>
                          </label>
                          {removalArmed === `${entry.classId}|${choice}` && chosen ? (
                            <>
                              <button type="button" className="tw-btn tw-btn--sm tw-btn--danger" disabled={isWorking} onClick={() => changeRemoval(entry, chosen.key, 'remove')}>
                                Yes, remove from TEAMS
                              </button>
                              <button type="button" className="tw-btn tw-btn--sm" disabled={isWorking} onClick={() => setRemovalArmed(null)}>Cancel</button>
                            </>
                          ) : (
                            <button type="button" className="tw-btn tw-btn--sm" disabled={isWorking || !chosen} onClick={() => setRemovalArmed(`${entry.classId}|${choice}`)}>
                              Remove from TEAMS
                            </button>
                          )}
                        </div>
                        {removed.length > 0 && (
                          <ul className="tw-small" style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8 }} aria-label={`Lessons removed from TEAMS for ${name}`}>
                            {removed.map((item) => {
                              const confirmId = `teams-confirm-${entry.classId}-${item.targetKey}`;
                              const typed = confirmDrafts[confirmId] ?? '';
                              const alreadyConfirmed = item.confirmCount > 0 && item.confirmedGradeCount !== null && item.confirmedGradeCount >= item.confirmCount;
                              return (
                                <li key={item.targetKey} className="tw-stack" style={{ gap: 4 }} data-teams-removal={item.targetKey}>
                                  <span className="tw-strong" style={{ overflowWrap: 'anywhere' }}>{item.lesson}</span>
                                  {item.lines.map((line) => (
                                    <span key={line.sectionRef || 'all'} className="tw-row" style={{ gap: 6 }}>
                                      <span className="tw-pill" data-tone={alreadyConfirmed && line.state === 'confirm' ? 'neutral' : line.tone}>{line.sectionRef ? `TEAMS ${line.sectionRef}` : 'TEAMS'}</span>
                                      <span>
                                        {alreadyConfirmed && line.state === 'confirm' ? 'Confirmed. Removed on the next sync.' : line.text}
                                        {line.state === 'confirm' && !alreadyConfirmed ? ` ${line.gradeCount} grade${line.gradeCount === 1 ? '' : 's'}.` : ''}
                                      </span>
                                    </span>
                                  ))}
                                  {item.confirmCount > 0 && !alreadyConfirmed && (
                                    <div className="tw-row" style={{ alignItems: 'flex-end' }}>
                                      <label htmlFor={confirmId} className="tw-small" style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                                        {`Type ${item.confirmCount} to remove its ${item.totalGrades} TEAMS grade${item.totalGrades === 1 ? '' : 's'} with it`}
                                        <input
                                          id={confirmId}
                                          className="tw-input"
                                          inputMode="numeric"
                                          style={{ width: 120 }}
                                          value={typed}
                                          disabled={isWorking}
                                          onChange={(event) => setConfirmDrafts((current) => ({ ...current, [confirmId]: event.target.value }))}
                                        />
                                      </label>
                                      <button
                                        type="button"
                                        className="tw-btn tw-btn--sm tw-btn--danger"
                                        disabled={isWorking || !removalConfirmationMatches(typed, item.confirmCount)}
                                        onClick={() => changeRemoval(entry, item.targetKey, 'confirm', item.confirmCount)}
                                      >
                                        Remove with its grades
                                      </button>
                                    </div>
                                  )}
                                  <div>
                                    <button type="button" className="tw-btn tw-btn--sm" disabled={isWorking} onClick={() => changeRemoval(entry, item.targetKey, 'restore')}>
                                      Send to TEAMS again
                                    </button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })()}
                </details>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

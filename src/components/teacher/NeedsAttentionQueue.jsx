import { useMemo, useState } from 'react';
import {
  ALERT_KIND, ALERT_KIND_LABEL, URGENCY, URGENCY_LABEL,
  filterQueue, summarizeQueue,
} from '../../platform/teacher/needsAttention.js';
import { ACTION, actionsForAlert } from '../../platform/teacher/teacherActions.js';

/*
 * "WHAT NEEDS MY ATTENTION RIGHT NOW?"
 *
 * The one question a teacher asks when they sit down. Everything on this panel
 * is in service of answering it in about four seconds, and everything that
 * would slow that down has been left off.
 *
 * Three things that are deliberately NOT here:
 *
 *   No counts of things that are fine. "18 students on track" is not attention;
 *   it is reassurance, and it costs the same screen space as a real finding.
 *
 *   No severity colour on the whole row. The kind of alert (academic /
 *   completion / system) is a category, not a temperature — colouring a
 *   completion alert red is exactly how a strong student who missed a week
 *   starts looking like a failing one.
 *
 *   No empty-state filler. A class with nothing wrong gets one line saying so,
 *   because a queue that always has something in it teaches the teacher that
 *   its contents do not mean anything.
 */

const KIND_STYLE = {
  [ALERT_KIND.ACADEMIC]: { background: '#e8f0fe', color: '#174ea6', rail: '#1a73e8' },
  [ALERT_KIND.COMPLETION]: { background: '#f1f3f4', color: '#3c4043', rail: '#9aa0a6' },
  [ALERT_KIND.SYSTEM]: { background: '#fff4ce', color: '#6b4c00', rail: '#f9ab00' },
};

const URGENCY_STYLE = {
  [URGENCY.NOW]: { background: '#fce8e6', color: '#a50e0e' },
  [URGENCY.TODAY]: { background: '#fef7e0', color: '#7a5300' },
  [URGENCY.THIS_WEEK]: { background: '#f1f3f4', color: '#5f6368' },
};

const chip = (style) => ({
  display: 'inline-block',
  padding: '3px 8px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '.03em',
  ...style,
});

const filterButton = (active) => ({
  padding: '6px 11px',
  border: active ? '1px solid #1a73e8' : '1px solid #dadce0',
  borderRadius: 999,
  background: active ? '#e8f0fe' : '#fff',
  color: active ? '#174ea6' : '#3c4043',
  fontWeight: 800,
  fontSize: 12.5,
  cursor: 'pointer',
});

export default function NeedsAttentionQueue({
  queue = [],
  onOpenStudent = null,
  // Where the alert is actually resolved. Opening an alert must never change a
  // student's plan by itself — the teacher decides, and this is only the way to
  // the place where they decide.
  onOpenWeeklyPath = null,
  onOpenAdministration = null,
  maxVisible = 6,
  // False while weekly completion has not been read for the selected class.
  // Silence about completion is honest; implying there is nothing to report is
  // not, so the panel says which half of the queue it is missing.
  completionCoverage = true,
}) {
  const [kind, setKind] = useState(null);
  const [urgency, setUrgency] = useState(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);
  // Which rolled-up alert has its student list open.
  const [openList, setOpenList] = useState(null);

  const summary = useMemo(() => summarizeQueue(queue), [queue]);
  const filtered = useMemo(
    () => filterQueue(queue, { kind, urgency, search }),
    [queue, kind, urgency, search],
  );
  const visible = expanded ? filtered : filtered.slice(0, maxVisible);

  if (!queue.length) {
    return (
      <section style={{ padding: '16px 18px', border: '1px solid #d8dde6', borderRadius: 10, background: '#fff', marginBottom: 22 }}>
        <h2 style={{ margin: 0, fontSize: 17 }}>Nothing needs your attention right now</h2>
        <p style={{ margin: '6px 0 0', color: '#5f6368', fontSize: 13.5 }}>
          No prerequisite gaps, reasoning gaps, slipping retention{completionCoverage ? ' or overdue path work' : ''} above the reporting threshold.
          This panel stays quiet on purpose — a queue that always has something in it stops meaning anything.
          {!completionCoverage && ' Choose a class above to include this week’s learning-path completion.'}
        </p>
      </section>
    );
  }

  // The proposals come from the shared action model rather than from a switch
  // written here, so what a teacher is offered cannot drift from what the rules
  // say they should be offered — and so that the rule "opening an alert changes
  // nothing" is enforced in one testable place instead of per component.
  const runnerFor = (alert, proposal) => {
    if (proposal.action === ACTION.OPEN_ADMINISTRATION) return onOpenAdministration;
    if (proposal.action === ACTION.OPEN_WEEKLY_PATH) return onOpenWeeklyPath;
    if (proposal.action === ACTION.OPEN_STUDENT) {
      return onOpenStudent ? () => onOpenStudent(alert.studentId) : null;
    }
    if (proposal.action === ACTION.REVIEW_STUDENTS) return () => setOpenList(alert.id);
    // A plan-changing proposal is deliberately NOT runnable from this panel.
    // It is surfaced with its description so a teacher knows the option exists,
    // and taken on the screen that owns the change, where the confirmation and
    // the audit record live. A one-click "apply" here would be the automatic
    // alteration this design exists to prevent, wearing a button.
    return null;
  };

  const primaryFor = (alert) => {
    const proposals = actionsForAlert({ alert, classId: alert.classId });
    for (const proposal of proposals) {
      const run = runnerFor(alert, proposal);
      if (run) return { label: proposal.label, run };
    }
    return null;
  };

  return (
    <section style={{ border: '1px solid #d8dde6', borderRadius: 10, background: '#fff', marginBottom: 22, overflow: 'hidden' }}>
      <header style={{ padding: '15px 18px 12px', borderBottom: '1px solid #eef0f2' }}>
        {!completionCoverage && (
          <p style={{ margin: '0 0 10px', padding: '8px 10px', borderRadius: 8, background: '#f1f3f4', color: '#3c4043', fontSize: 12.5 }}>
            Showing academic and system items only. Choose a class above to include this week&apos;s learning-path completion.
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Needs your attention</h2>
          <span style={{ color: '#5f6368', fontSize: 13 }}>
            {summary.total} item{summary.total === 1 ? '' : 's'}
            {summary.byUrgency[URGENCY.NOW] ? ` · ${summary.byUrgency[URGENCY.NOW]} right now` : ''}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 11, alignItems: 'center' }}>
          <button type="button" onClick={() => { setKind(null); setUrgency(null); }} style={filterButton(!kind && !urgency)}>
            All
          </button>
          {Object.values(ALERT_KIND).filter((value) => summary.byKind[value] > 0).map((value) => (
            <button key={value} type="button" onClick={() => setKind(kind === value ? null : value)} style={filterButton(kind === value)}>
              {ALERT_KIND_LABEL[value]} · {summary.byKind[value]}
            </button>
          ))}
          <span aria-hidden="true" style={{ width: 1, height: 20, background: '#dadce0', margin: '0 3px' }} />
          {Object.values(URGENCY).filter((value) => summary.byUrgency[value] > 0).map((value) => (
            <button key={value} type="button" onClick={() => setUrgency(urgency === value ? null : value)} style={filterButton(urgency === value)}>
              {URGENCY_LABEL[value]} · {summary.byUrgency[value]}
            </button>
          ))}
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Student or standard"
            aria-label="Filter alerts by student or standard"
            style={{ marginLeft: 'auto', padding: '7px 11px', border: '1px solid #c7cdd6', borderRadius: 8, minWidth: 200 }}
          />
        </div>
      </header>

      {!filtered.length && (
        <p style={{ margin: 0, padding: '18px', color: '#5f6368', fontSize: 13.5 }}>
          Nothing matches those filters. {summary.total} item{summary.total === 1 ? '' : 's'} in the full queue.
        </p>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {visible.map((alert) => {
          const kindStyle = KIND_STYLE[alert.kind] || KIND_STYLE[ALERT_KIND.SYSTEM];
          const action = primaryFor(alert);
          return (
            <li key={alert.id} style={{ display: 'flex', gap: 13, padding: '14px 18px', borderTop: '1px solid #eef0f2' }}>
              <span aria-hidden="true" style={{ flex: '0 0 3px', borderRadius: 3, background: kindStyle.rail }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
                  <span style={chip({ background: kindStyle.background, color: kindStyle.color })}>
                    {ALERT_KIND_LABEL[alert.kind]}
                  </span>
                  <span style={chip(URGENCY_STYLE[alert.urgency] || URGENCY_STYLE[URGENCY.THIS_WEEK])}>
                    {URGENCY_LABEL[alert.urgency]}
                  </span>
                  {alert.studentName && (
                    <button
                      type="button"
                      onClick={() => onOpenStudent?.(alert.studentId)}
                      style={{ border: 0, background: 'transparent', padding: 0, color: '#174ea6', fontWeight: 900, cursor: 'pointer', fontSize: 13.5 }}
                    >
                      {alert.studentName}
                    </button>
                  )}
                </div>
                <div style={{ fontWeight: 800, fontSize: 14.5 }}>{alert.headline}</div>
                {/*
                  The reason, in words. "AI recommended" tells a teacher nothing
                  they can act on and nothing they can disagree with.
                */}
                <p style={{ margin: '4px 0 0', color: '#4d5b58', fontSize: 13, lineHeight: 1.5 }}>{alert.detail}</p>

                {alert.students?.length > 0 && (
                  <details open={openList === alert.id} onToggle={(event) => setOpenList(event.currentTarget.open ? alert.id : null)} style={{ marginTop: 7 }}>
                    <summary style={{ cursor: 'pointer', color: '#174ea6', fontWeight: 800, fontSize: 12.5 }}>
                      Who is in this ({alert.students.length})
                    </summary>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {alert.students.map((entry) => (
                        <button
                          key={entry.studentId}
                          type="button"
                          onClick={() => onOpenStudent?.(entry.studentId)}
                          style={{ padding: '5px 9px', border: '1px solid #dadce0', borderRadius: 7, background: '#fff', color: '#174ea6', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                        >
                          {entry.studentName}
                        </button>
                      ))}
                    </div>
                  </details>
                )}
              </div>

              {action && (
                <button
                  type="button"
                  onClick={action.run}
                  style={{ alignSelf: 'center', padding: '8px 12px', border: '1px solid #1a73e8', borderRadius: 8, background: '#fff', color: '#174ea6', fontWeight: 900, fontSize: 12.5, whiteSpace: 'nowrap', cursor: 'pointer' }}
                >
                  {action.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {filtered.length > maxVisible && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          style={{ display: 'block', width: '100%', padding: '11px', border: 0, borderTop: '1px solid #eef0f2', background: '#f8f9fa', color: '#174ea6', fontWeight: 900, cursor: 'pointer' }}
        >
          {expanded ? 'Show fewer' : `Show all ${filtered.length}`}
        </button>
      )}
    </section>
  );
}

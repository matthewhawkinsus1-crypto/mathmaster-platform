import React, { useState } from 'react';
import {
  gradingPeriodIdFromLabel,
  resolveAssignmentGradingPeriod,
} from '../../platform/student/gradingPeriods.js';
import { MIN_TOUCH_TARGET_PX } from '../../platform/mobile/mobileInteractionFoundation.js';

/*
 * MARKING PERIODS, FOR THE TEACHER.
 *
 * Four actions and nothing else: name a period, choose which one is current,
 * close (archive) one, and move selected assignments into one. That is the
 * whole surface Phase 1 needs, and every additional control here would be a
 * policy decision a district makes, not MathMaster.
 *
 * ARCHIVING A PERIOD IS NOT ARCHIVING AN ASSIGNMENT.
 *
 * The screen says so, because the two words are one letter apart in a menu and
 * the consequences are not remotely similar: archiving an assignment files it
 * away, while closing a marking period only stops new work being sorted into it
 * and collapses it on the student's grade screen. No grade is hidden by either,
 * and this screen never writes `archived` on an assignment.
 *
 * THE DEFAULT BUCKET IS SHOWN, NOT HIDDEN.
 *
 * Every assignment that predates marking periods carries no period stamp and
 * falls into the current one. That is deliberate backward compatibility, but a
 * teacher should be able to see how many assignments are sitting there by
 * default rather than by their choice — so the count is on the screen, next to
 * the control that places them explicitly.
 */

const card = {
  background: '#fff', border: '1px solid #d8dde6', borderRadius: 12,
  padding: 16, marginBottom: 16, textAlign: 'left',
};

const button = (primary) => ({
  appearance: 'none', WebkitAppearance: 'none', fontFamily: 'inherit',
  minHeight: MIN_TOUCH_TARGET_PX, padding: '9px 14px', borderRadius: 9,
  fontWeight: 900, fontSize: 14, cursor: 'pointer',
  border: primary ? 0 : '2px solid #c9ced6',
  background: primary ? '#174ea6' : '#fff',
  color: primary ? '#fff' : '#3c4043',
});

export default function MarkingPeriodSettings({
  settings,
  assignments = [],
  selectedAssignmentIds = new Set(),
  busy = false,
  onCreatePeriod = null,
  onSetCurrentPeriod = null,
  onSetPeriodArchived = null,
  onMoveSelectedAssignments = null,
}) {
  const [newLabel, setNewLabel] = useState('');
  const periods = settings?.periods || [];

  const countFor = (periodId, { explicitOnly = false } = {}) => assignments.filter((assignment) => {
    const resolved = resolveAssignmentGradingPeriod(assignment, settings);
    if (explicitOnly && resolved.isFallback) return false;
    return resolved.id === periodId;
  }).length;

  const fallbackCount = assignments.filter(
    (assignment) => resolveAssignmentGradingPeriod(assignment, settings).isFallback,
  ).length;

  const createPeriod = () => {
    const label = newLabel.trim();
    if (!label || busy) return;
    onCreatePeriod?.({
      id: gradingPeriodIdFromLabel(label, { taken: periods.map((period) => period.id) }),
      label,
      order: (periods[periods.length - 1]?.order || 0) + 1,
      archived: false,
    });
    setNewLabel('');
  };

  const selectedCount = selectedAssignmentIds.size;

  return (
    <section aria-label="Marking periods">
      <div style={card}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#202124' }}>Marking periods</h3>
        <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.55, color: '#5f6368' }}>
          Marking periods group grades for students. Closing a period stops new work being filed into it
          and collapses it on the student Grade Center — it never hides a grade, and it is separate from
          archiving an assignment.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label htmlFor="marking-period-name" style={{ fontSize: 13, fontWeight: 800, color: '#3c4043' }}>New period</label>
          <input
            id="marking-period-name"
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder="Marking Period 1"
            style={{
              flex: '1 1 200px', minWidth: 0, minHeight: MIN_TOUCH_TARGET_PX,
              padding: '8px 12px', borderRadius: 9, border: '1px solid #c9ced6', fontSize: 14,
            }}
          />
          <button type="button" style={button(true)} disabled={busy || !newLabel.trim()} onClick={createPeriod}>
            Add period
          </button>
        </div>
      </div>

      <div style={card}>
        <h3 style={{ margin: '0 0 10px', fontSize: 15, color: '#202124' }}>Existing periods</h3>
        {!periods.length && (
          <p style={{ margin: 0, fontSize: 13, color: '#5f6368' }}>
            No marking periods yet. Every assignment currently shows to students under “Current Marking Period”,
            which keeps existing grades exactly where they were.
          </p>
        )}
        {periods.map((period) => {
          const isCurrent = settings?.currentPeriodId === period.id;
          return (
            <div
              key={period.id}
              style={{
                display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
                justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid #eceff3',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 14, color: '#202124', overflowWrap: 'anywhere' }}>
                  {period.label}
                  {isCurrent && <span style={{ marginLeft: 8, padding: '3px 8px', borderRadius: 999, fontSize: 11, background: '#e6f4ea', color: '#12633a' }}>CURRENT</span>}
                  {period.archived && <span style={{ marginLeft: 8, padding: '3px 8px', borderRadius: 999, fontSize: 11, background: '#f1f3f4', color: '#5f6368' }}>CLOSED</span>}
                </div>
                <div style={{ fontSize: 12, color: '#5f6368' }}>
                  {countFor(period.id, { explicitOnly: true })} assignment(s) placed here
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  style={button(false)}
                  disabled={busy || isCurrent || period.archived}
                  onClick={() => onSetCurrentPeriod?.(period.id)}
                >
                  Make current
                </button>
                <button
                  type="button"
                  style={button(false)}
                  disabled={busy}
                  onClick={() => onSetPeriodArchived?.(period.id, !period.archived)}
                >
                  {period.archived ? 'Reopen period' : 'Close period'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={card}>
        <h3 style={{ margin: '0 0 6px', fontSize: 15, color: '#202124' }}>Move selected assignments</h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.55, color: '#5f6368' }}>
          {selectedCount
            ? `${selectedCount} assignment${selectedCount === 1 ? '' : 's'} selected in the Assignments list.`
            : 'Select assignments in the Assignments list first.'}
          {fallbackCount > 0 && ` ${fallbackCount} assignment${fallbackCount === 1 ? '' : 's'} currently use the default current period because no period was chosen for them.`}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {periods.map((period) => (
            <button
              key={period.id}
              type="button"
              style={button(false)}
              disabled={busy || !selectedCount}
              onClick={() => onMoveSelectedAssignments?.(period)}
            >
              → {period.label}
            </button>
          ))}
          <button
            type="button"
            style={button(false)}
            disabled={busy || !selectedCount}
            onClick={() => onMoveSelectedAssignments?.(null)}
          >
            → Default current period
          </button>
        </div>
      </div>
    </section>
  );
}

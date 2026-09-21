import React, { useEffect, useMemo, useState } from 'react';
import {
  gradingPeriodIdFromLabel,
  resolveAssignmentGradingPeriod,
} from '../../platform/student/gradingPeriods.js';
import { MIN_TOUCH_TARGET_PX } from '../../platform/mobile/mobileInteractionFoundation.js';

/*
 * MARKING PERIODS, FOR THE TEACHER.
 *
 * Period setup and assignment filing live together here so a teacher never has
 * to leave Grades, visit the Assignments tab, remember a selection, and come
 * back. The assignment picker is intentionally class-scoped by App.jsx.
 *
 * ARCHIVING A PERIOD IS NOT ARCHIVING AN ASSIGNMENT.
 *
 * Closing a marking period only stops new work from falling into that reporting
 * window by default. It does not hide grades or archive assignment documents.
 *
 * THE DEFAULT BUCKET IS SHOWN, NOT HIDDEN.
 *
 * Older assignments may have no explicit grading-period stamp. They currently
 * resolve into the active period for backward compatibility, but that is fragile
 * when the school advances to the next period. The picker defaults to those
 * fallback assignments so a teacher can select all and explicitly file them in
 * one action.
 */

const DEFAULT_TARGET = '__default_current_period__';

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

const inputStyle = {
  minHeight: MIN_TOUCH_TARGET_PX,
  padding: '8px 12px',
  borderRadius: 9,
  border: '1px solid #c9ced6',
  fontSize: 14,
  background: '#fff',
  color: '#202124',
};

const formatAssignmentDate = (assignment) => {
  const raw = assignment?.dueAt || assignment?.dueDate || assignment?.createdAt || null;
  if (!raw) return 'No due date';
  const date = typeof raw?.toDate === 'function' ? raw.toDate() : new Date(raw);
  if (Number.isNaN(date.getTime())) return 'No due date';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function MarkingPeriodSettings({
  settings,
  assignments = [],
  classLabel = '',
  busy = false,
  onCreatePeriod = null,
  onSetCurrentPeriod = null,
  onSetPeriodArchived = null,
  onMoveSelectedAssignments = null,
}) {
  const [newLabel, setNewLabel] = useState('');
  const [search, setSearch] = useState('');
  const [periodFilter, setPeriodFilter] = useState('fallback');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const periods = settings?.periods || [];
  const [targetPeriodId, setTargetPeriodId] = useState(
    settings?.currentPeriodId || periods[0]?.id || DEFAULT_TARGET,
  );

  useEffect(() => {
    const validIds = new Set([DEFAULT_TARGET, ...periods.map((period) => period.id)]);
    if (!validIds.has(targetPeriodId)) {
      setTargetPeriodId(settings?.currentPeriodId || periods[0]?.id || DEFAULT_TARGET);
    }
  }, [periods, settings?.currentPeriodId, targetPeriodId]);

  useEffect(() => {
    const availableIds = new Set(assignments.map((assignment) => assignment.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => availableIds.has(id)));
      if (next.size === current.size && [...next].every((id) => current.has(id))) return current;
      return next;
    });
  }, [assignments]);

  const countFor = (periodId, { explicitOnly = false } = {}) => assignments.filter((assignment) => {
    const resolved = resolveAssignmentGradingPeriod(assignment, settings);
    if (explicitOnly && resolved.isFallback) return false;
    return resolved.id === periodId;
  }).length;

  const fallbackCount = assignments.filter(
    (assignment) => resolveAssignmentGradingPeriod(assignment, settings).isFallback,
  ).length;

  const visibleAssignments = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return assignments
      .filter((assignment) => {
        const resolved = resolveAssignmentGradingPeriod(assignment, settings);
        if (periodFilter === 'fallback' && !resolved.isFallback) return false;
        if (periodFilter !== 'all' && periodFilter !== 'fallback') {
          if (resolved.isFallback || resolved.id !== periodFilter) return false;
        }
        if (!needle) return true;
        return [assignment.title, assignment.folder]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        const aRaw = a?.dueAt || a?.dueDate || a?.createdAt || 0;
        const bRaw = b?.dueAt || b?.dueDate || b?.createdAt || 0;
        const aDate = typeof aRaw?.toDate === 'function' ? aRaw.toDate() : new Date(aRaw);
        const bDate = typeof bRaw?.toDate === 'function' ? bRaw.toDate() : new Date(bRaw);
        const aTime = Number.isNaN(aDate.getTime()) ? 0 : aDate.getTime();
        const bTime = Number.isNaN(bDate.getTime()) ? 0 : bDate.getTime();
        return bTime - aTime || String(a.title || '').localeCompare(String(b.title || ''));
      });
  }, [assignments, periodFilter, search, settings]);

  const visibleAssignmentIds = visibleAssignments.map((assignment) => assignment.id);
  const allVisibleSelected = visibleAssignmentIds.length > 0
    && visibleAssignmentIds.every((id) => selectedIds.has(id));
  const selectedCount = selectedIds.size;

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

  const toggleAssignment = (assignmentId) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(assignmentId)) next.delete(assignmentId);
      else next.add(assignmentId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleAssignmentIds.forEach((id) => next.delete(id));
      else visibleAssignmentIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const moveSelected = async () => {
    if (!selectedCount || busy || !onMoveSelectedAssignments) return;
    const target = targetPeriodId === DEFAULT_TARGET
      ? null
      : periods.find((period) => period.id === targetPeriodId) || null;
    const succeeded = await onMoveSelectedAssignments(target, selectedIds);
    if (succeeded !== false) setSelectedIds(new Set());
  };

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
            style={{ ...inputStyle, flex: '1 1 200px', minWidth: 0 }}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: 15, color: '#202124' }}>File assignments into a marking period</h3>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#5f6368' }}>
              Choose assignments right here{classLabel ? ` for ${classLabel}` : ''}. The list starts with work that still
              uses the default current period so you can clean up older assignments quickly.
            </p>
          </div>
          <div style={{ padding: '6px 10px', borderRadius: 999, background: fallbackCount ? '#fef7e0' : '#e6f4ea', color: fallbackCount ? '#7a4d00' : '#12633a', fontSize: 12, fontWeight: 900 }}>
            {fallbackCount} using default current period
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(180px, 240px)', gap: 8, marginTop: 14 }}>
          <input
            type="search"
            aria-label="Search assignments to file"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search assignments…"
            style={{ ...inputStyle, width: '100%', minWidth: 0 }}
          />
          <select
            aria-label="Filter assignments by marking period"
            value={periodFilter}
            onChange={(event) => setPeriodFilter(event.target.value)}
            style={{ ...inputStyle, width: '100%', minWidth: 0 }}
          >
            <option value="fallback">Needs filing ({fallbackCount})</option>
            <option value="all">All assignments ({assignments.length})</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.label} — explicit only ({countFor(period.id, { explicitOnly: true })})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12, marginBottom: 8 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 800, color: '#3c4043', cursor: visibleAssignmentIds.length ? 'pointer' : 'default' }}>
            <input
              type="checkbox"
              checked={allVisibleSelected}
              disabled={!visibleAssignmentIds.length || busy}
              onChange={toggleAllVisible}
            />
            Select all {visibleAssignmentIds.length} shown
          </label>
          <span style={{ fontSize: 12, color: '#5f6368' }}>{selectedCount} selected</span>
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={busy}
              style={{ border: 0, background: 'transparent', color: '#174ea6', fontWeight: 800, cursor: 'pointer', padding: 4 }}
            >
              Clear selection
            </button>
          )}
        </div>

        <div style={{ border: '1px solid #e1e5eb', borderRadius: 10, overflow: 'hidden' }}>
          {!visibleAssignments.length ? (
            <div style={{ padding: 18, textAlign: 'center', color: '#5f6368', fontSize: 13 }}>
              {assignments.length
                ? 'No assignments match this search and filter.'
                : 'No assignments are available for the selected class.'}
            </div>
          ) : (
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              {visibleAssignments.map((assignment, index) => {
                const resolved = resolveAssignmentGradingPeriod(assignment, settings);
                const placement = resolved.isFallback
                  ? `Default → ${resolved.label || 'Current Marking Period'}`
                  : (resolved.label || 'Assigned period');
                return (
                  <label
                    key={assignment.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '24px minmax(0, 1fr) minmax(120px, auto)',
                      gap: 10,
                      alignItems: 'center',
                      padding: '11px 12px',
                      borderTop: index ? '1px solid #eceff3' : 0,
                      cursor: busy ? 'default' : 'pointer',
                      background: selectedIds.has(assignment.id) ? '#f3f7ff' : '#fff',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(assignment.id)}
                      disabled={busy}
                      onChange={() => toggleAssignment(assignment.id)}
                    />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 900, color: '#202124', overflowWrap: 'anywhere' }}>
                        {assignment.title || 'Untitled assignment'}
                      </span>
                      <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: '#5f6368' }}>
                        {formatAssignmentDate(assignment)}
                        {assignment.folder ? ` · ${assignment.folder}` : ''}
                        {assignment.archived ? ' · Archived assignment' : ''}
                      </span>
                    </span>
                    <span style={{ justifySelf: 'end', textAlign: 'right', fontSize: 11, fontWeight: 800, color: resolved.isFallback ? '#7a4d00' : '#5f6368' }}>
                      {placement}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid #eceff3' }}>
          <label htmlFor="marking-period-target" style={{ fontSize: 13, fontWeight: 900, color: '#3c4043' }}>
            Move selected to
          </label>
          <select
            id="marking-period-target"
            value={targetPeriodId}
            onChange={(event) => setTargetPeriodId(event.target.value)}
            disabled={busy}
            style={{ ...inputStyle, flex: '1 1 220px', minWidth: 180 }}
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.label}{period.archived ? ' (closed)' : ''}
              </option>
            ))}
            <option value={DEFAULT_TARGET}>Default current period (remove explicit filing)</option>
          </select>
          <button
            type="button"
            style={button(true)}
            disabled={busy || !selectedCount}
            onClick={moveSelected}
          >
            {busy ? 'Moving…' : `Move ${selectedCount || ''} assignment${selectedCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </section>
  );
}

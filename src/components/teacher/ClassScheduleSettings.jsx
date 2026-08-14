import React, { useMemo, useState } from 'react';
import {
  CLASS_PERIODS,
  getScheduleDayType,
  localDateKey,
  normalizeSchedule,
  setScheduleDayTypeOverride,
} from '../../assignmentLifecycle.js';

const buttonBase = {
  minHeight: 44,
  padding: '9px 14px',
  borderRadius: 8,
  fontWeight: 900,
  cursor: 'pointer',
};

const inputStyle = {
  minHeight: 40,
  fontSize: 16,
  padding: '6px 8px',
  border: '1px solid #c7ccd1',
  borderRadius: 7,
  background: '#fff',
};

const clonePeriods = (periods = {}) => JSON.parse(JSON.stringify(periods));

const PeriodTable = ({ periods, classPeriods, onChange }) => (
  <div style={{ overflowX: 'auto' }}>
    <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ background: '#f8f9fa' }}>
          <th style={{ padding: 11, textAlign: 'left' }}>Period</th>
          <th>Meets</th>
          <th>Start</th>
          <th>End</th>
        </tr>
      </thead>
      <tbody>
        {classPeriods.map((period) => {
          const item = periods?.[period] || {};
          return (
            <tr key={period} style={{ borderBottom: '1px solid #e8eaed' }}>
              <td style={{ padding: 11, fontWeight: 800 }}>{period}</td>
              <td style={{ textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={Boolean(item.enabled)}
                  onChange={(event) => onChange(period, 'enabled', event.target.checked)}
                  aria-label={`${period} meets on this day`}
                  style={{ width: 20, height: 20 }}
                />
              </td>
              <td style={{ textAlign: 'center' }}>
                <input type="time" value={item.start || ''} onChange={(event) => onChange(period, 'start', event.target.value)} style={inputStyle} aria-label={`${period} start time`} />
              </td>
              <td style={{ textAlign: 'center' }}>
                <input type="time" value={item.end || ''} onChange={(event) => onChange(period, 'end', event.target.value)} style={inputStyle} aria-label={`${period} end time`} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export default function ClassScheduleSettings({
  schedule: scheduleValue,
  onChange,
  onSave,
  classPeriods = CLASS_PERIODS,
  nowValue = Date.now(),
}) {
  const schedule = useMemo(() => normalizeSchedule(scheduleValue), [scheduleValue]);
  const today = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const todayKey = localDateKey(today);
  const todayState = getScheduleDayType(schedule, today);
  const [editingDayType, setEditingDayType] = useState(todayState.dayType || 'A');
  const dayPeriods = schedule.daySchedules?.[editingDayType]?.periods || {};
  const todayOverride = schedule.modifiedSchedules?.[todayKey]?.periods || null;

  const push = (next) => onChange?.(normalizeSchedule(next));

  const setTodayDayType = (dayType) => push(setScheduleDayTypeOverride(schedule, today, dayType));

  const updateDayPeriod = (period, field, value) => {
    push({
      ...schedule,
      daySchedules: {
        ...schedule.daySchedules,
        [editingDayType]: {
          ...(schedule.daySchedules?.[editingDayType] || {}),
          periods: {
            ...dayPeriods,
            [period]: { ...(dayPeriods?.[period] || {}), [field]: value },
          },
        },
      },
    });
  };

  const createTodayModifiedSchedule = () => {
    const baseType = todayState.dayType || editingDayType;
    const basePeriods = schedule.daySchedules?.[baseType]?.periods || schedule.periods;
    push({
      ...schedule,
      modifiedSchedules: {
        ...schedule.modifiedSchedules,
        [todayKey]: { periods: clonePeriods(basePeriods) },
      },
    });
  };

  const updateTodayPeriod = (period, field, value) => {
    const source = todayOverride || schedule.daySchedules?.[todayState.dayType || editingDayType]?.periods || schedule.periods;
    push({
      ...schedule,
      modifiedSchedules: {
        ...schedule.modifiedSchedules,
        [todayKey]: {
          periods: {
            ...clonePeriods(source),
            [period]: { ...(source?.[period] || {}), [field]: value },
          },
        },
      },
    });
  };

  const removeTodayModifiedSchedule = () => {
    const modifiedSchedules = { ...schedule.modifiedSchedules };
    delete modifiedSchedules[todayKey];
    push({ ...schedule, modifiedSchedules });
  };

  const dayName = today.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const fixedWeekday = [1, 2, 3, 4].includes(today.getDay());

  return (
    <section style={{ marginTop: 22, border: '1px solid #d9e2f1', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
      <div style={{ padding: '17px 18px', background: '#f8fbff', borderBottom: '1px solid #d9e2f1' }}>
        <h3 style={{ margin: 0, color: '#202124' }}>A/B Bell Schedule</h3>
        <p style={{ margin: '6px 0 0', color: '#5f6368', lineHeight: 1.5 }}>
          Monday and Wednesday resolve to A Day. Tuesday and Thursday resolve to B Day. Friday is left for you to choose because it alternates.
        </p>
      </div>

      <div style={{ padding: 18 }}>
        <section style={{ padding: 15, borderRadius: 10, background: todayState.dayType ? '#e8f0fe' : '#fff4ce', border: `1px solid ${todayState.dayType ? '#aecbfa' : '#f9ab00'}` }}>
          <strong style={{ display: 'block', color: todayState.dayType ? '#174ea6' : '#7a4f00' }}>
            {dayName}: {todayState.dayType ? `${todayState.dayType} Day` : 'A/B day needs to be selected'}
          </strong>
          <p style={{ margin: '6px 0 10px', color: '#3c4043', fontSize: 13 }}>
            {todayState.source === 'override'
              ? 'This date has a manual A/B override.'
              : fixedWeekday
                ? 'This comes from the normal Monday–Thursday pattern. You can override today if the school changes the calendar.'
                : 'Choose the actual Friday schedule before class so DOL timing uses the correct period.'}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['A', 'B'].map((dayType) => (
              <button
                key={dayType}
                type="button"
                onClick={() => setTodayDayType(dayType)}
                style={{
                  ...buttonBase,
                  border: todayState.dayType === dayType ? '2px solid #174ea6' : '1px solid #9bb8e8',
                  background: todayState.dayType === dayType ? '#174ea6' : '#fff',
                  color: todayState.dayType === dayType ? '#fff' : '#174ea6',
                }}
              >
                Use {dayType} Day Today
              </button>
            ))}
            {todayState.source === 'override' && (
              <button type="button" onClick={() => setTodayDayType(null)} style={{ ...buttonBase, border: '1px solid #c7ccd1', background: '#fff', color: '#3c4043' }}>
                Clear Today Override
              </button>
            )}
          </div>
        </section>

        <section style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <strong>Edit normal bell times</strong>
              <div style={{ color: '#5f6368', fontSize: 12, marginTop: 3 }}>Only mark periods that actually meet on that day.</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['A', 'B'].map((dayType) => (
                <button
                  key={dayType}
                  type="button"
                  onClick={() => setEditingDayType(dayType)}
                  style={{
                    ...buttonBase,
                    minWidth: 86,
                    border: editingDayType === dayType ? '2px solid #174ea6' : '1px solid #c7ccd1',
                    background: editingDayType === dayType ? '#e8f0fe' : '#fff',
                    color: '#174ea6',
                  }}
                >
                  {dayType} Day
                </button>
              ))}
            </div>
          </div>
          <PeriodTable periods={dayPeriods} classPeriods={classPeriods} onChange={updateDayPeriod} />
        </section>

        <details style={{ marginTop: 20, border: '1px solid #ead08d', borderRadius: 10, background: '#fffdf6' }}>
          <summary style={{ padding: 14, cursor: 'pointer', fontWeight: 900, color: '#6b5200' }}>Special bell schedule for today (optional)</summary>
          <div style={{ padding: '0 14px 14px' }}>
            <p style={{ color: '#5f6368', lineHeight: 1.5, fontSize: 13 }}>
              Use this only for an assembly, testing day, early release, or another one-day bell-time change. It overrides the selected A/B schedule for {todayKey} only.
            </p>
            {!todayOverride ? (
              <button type="button" onClick={createTodayModifiedSchedule} style={{ ...buttonBase, border: '1px solid #f9ab00', background: '#fff4ce', color: '#5f4400' }}>Create Today&apos;s Special Times</button>
            ) : (
              <>
                <PeriodTable periods={todayOverride} classPeriods={classPeriods} onChange={updateTodayPeriod} />
                <button type="button" onClick={removeTodayModifiedSchedule} style={{ ...buttonBase, marginTop: 12, border: '1px solid #d93025', background: '#fff', color: '#d93025' }}>Remove Today&apos;s Special Times</button>
              </>
            )}
          </div>
        </details>

        <button type="button" onClick={onSave} style={{ ...buttonBase, marginTop: 20, border: 0, background: '#1a73e8', color: '#fff' }}>
          Save A/B Schedule
        </button>
      </div>
    </section>
  );
}

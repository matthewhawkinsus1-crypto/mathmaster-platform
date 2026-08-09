import { useMemo, useState } from 'react';
import { CLASS_PERIODS } from '../../assignmentLifecycle';
import { getSkillGraph, describeSkill } from '../../platform/path/skillGraph';
import { explainForStudent } from '../../platform/path/recommendationEngine';
import { buildStudentPathOptions, resolvePacingProvider } from '../../platform/path/studentPathOptions';
import { describeToday, loadCalendar } from '../../platform/path/curriculumCalendar';
import {
  OVERRIDE_ACTIONS, getPacingForClass, overridesForClass, removeOverride, upsertOverride,
} from '../../platform/path/pathStore';

// Teacher pacing and skill overrides.
//
// This is the screen that makes the engine's *timing* dimension real. Until a
// teacher says where their class actually is, every skill is treated as
// current and the adaptive path can only reason about prerequisites.
//
// It is teacher-only and cannot affect a student yet — no student screen reads
// the recommendation engine. The preview at the bottom is deliberately the
// engine's real output rather than a mock, so what a teacher sets here is what
// they will see happen when the student panel lands.

const panel = { border: '1px solid #dadce0', borderRadius: 12, background: '#fff', padding: 16, marginBottom: 16 };
const heading = { margin: '0 0 4px', fontSize: 15, fontWeight: 900, color: '#174ea6' };
const note = { color: '#5f6368', fontSize: 13, lineHeight: 1.55, margin: '0 0 14px' };
const control = {
  minHeight: 44, fontSize: 15, padding: '9px 10px', border: '1px solid #c9ced6',
  borderRadius: 8, boxSizing: 'border-box', background: '#fff', color: '#202124',
};
const chipButton = (active) => ({
  minHeight: 40, padding: '7px 12px', borderRadius: 999, cursor: 'pointer',
  border: `1px solid ${active ? '#1a73e8' : '#c5d5ef'}`,
  background: active ? '#e8f0fe' : '#fff',
  color: active ? '#174ea6' : '#3c4043', fontWeight: 800, fontSize: 13,
});

const ACTION_LABEL = {
  open: 'Open now',
  recommend: 'Recommend',
  priority: 'Make priority',
  hide: 'Hide',
};

const STATUS_STYLE = {
  required: { background: '#4a148c', color: '#fff' },
  remediation: { background: '#fce8e6', color: '#a50e0e' },
  priority: { background: '#fef7e0', color: '#7a4f00' },
  recommended: { background: '#e6f4ea', color: '#137333' },
  available: { background: '#f1f3f4', color: '#3c4043' },
  extension: { background: '#e8f0fe', color: '#174ea6' },
  future: { background: '#f8f9fa', color: '#80868b' },
  locked: { background: '#f1f3f4', color: '#80868b' },
  mastered: { background: '#e6f4ea', color: '#137333' },
};

const PREVIEW_ORDER = ['required', 'remediation', 'priority', 'recommended', 'available', 'extension', 'future', 'locked'];

export default function PacingControls({
  courseId = 'algebra1',
  nowValue = Date.now(),
  pacingByClass = {},
  overrides = [],
  onSavePacing,
  onSaveOverrides,
  busy = false,
}) {
  const [classId, setClassId] = useState(CLASS_PERIODS[0] || 'Period 1');
  const [skillFilter, setSkillFilter] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  const skills = useMemo(() => getSkillGraph(courseId), [courseId]);
  const pacing = useMemo(() => getPacingForClass(pacingByClass, classId), [pacingByClass, classId]);
  const classOverrides = useMemo(() => overridesForClass(overrides, classId), [overrides, classId]);
  const overrideBySkill = useMemo(
    () => Object.fromEntries(classOverrides.map((entry) => [entry.skillId, entry])),
    [classOverrides],
  );

  // The same resolver the student path uses, so this preview cannot be built
  // on a different provider from the one students actually get.
  const provider = useMemo(
    () => resolvePacingProvider({ courseId, skills, pacing, nowValue }),
    [courseId, skills, pacing, nowValue],
  );
  const isProvisional = provider.isProvisional !== false;
  const calendarToday = useMemo(
    () => (provider.loaded ? describeToday(provider.loaded, nowValue) : null),
    [provider, nowValue],
  );

  const preview = useMemo(() => buildStudentPathOptions({
    student: { id: 'preview', gradesByAssignment: {} },
    assignments: [],
    courseId,
    pacing,
    teacherOverrides: classOverrides,
    nowValue,
  }) || { recommended: [], available: [], confidence: { level: 'low', message: '' } },
  [courseId, pacing, classOverrides, nowValue]);

  const setPacingField = (field, value) => {
    onSavePacing?.({
      ...pacingByClass,
      [classId]: { ...pacing, [field]: value },
    });
  };

  const applyOverride = (skillId, action) => {
    const existing = overrideBySkill[skillId];
    // Tapping the active action again clears it — a toggle, so a teacher can
    // undo without hunting for a separate remove control.
    const next = existing?.action === action
      ? removeOverride(overrides, { classId, skillId })
      : upsertOverride(overrides, { classId, skillId, action });
    onSaveOverrides?.(next);
  };

  const filteredSkills = useMemo(() => {
    const query = skillFilter.trim().toLowerCase();
    const list = query
      ? skills.filter((skill) => describeSkill(skill.skillId).label.toLowerCase().includes(query))
      : skills;
    // Skills the teacher has already acted on float to the top; otherwise a
    // change made ten minutes ago is invisible in a list of fifty.
    return [...list].sort((a, b) => Number(Boolean(overrideBySkill[b.skillId])) - Number(Boolean(overrideBySkill[a.skillId])));
  }, [skills, skillFilter, overrideBySkill]);

  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ ...panel, borderLeft: '5px solid #f9ab00' }}>
        <h3 style={heading}>Curriculum pacing</h3>
        <p style={note}>
          Tell MathMaster where this class actually is. Pacing decides whether a skill is
          review, current, or too far ahead — it never decides whether a student is
          mathematically ready, which comes from prerequisites and mastery.
        </p>
        {isProvisional ? (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: '#fef7e0', color: '#7a4f00', fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
            <strong>Provisional pacing.</strong> No district scope-and-sequence is loaded for this
            course, so windows are spread evenly as a placeholder. Positions you set here are real;
            the skill-to-window map underneath is not.
          </div>
        ) : (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: '#e6f4ea', color: '#137333', fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
            <strong>2026-27 district calendar is active.</strong>
            {calendarToday?.current?.length
              ? ` Today your classes are on ${calendarToday.current.filter((w) => w.curriculumType === 'module' || w.curriculumType === 'review').map((w) => w.title).join(', ') || 'scheduled work'}.`
              : ' No instructional window is scheduled for today.'}
            {calendarToday?.upcoming?.length
              ? ` Opening early: ${calendarToday.upcoming.map((w) => w.title).join(', ')}.`
              : ''}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
          <label style={{ fontWeight: 800 }}>Class period
            <select value={classId} onChange={(event) => setClassId(event.target.value)} style={{ ...control, width: '100%', marginTop: 6 }}>
              {CLASS_PERIODS.map((period) => <option key={period} value={period}>{period}</option>)}
            </select>
          </label>
          <label style={{ fontWeight: 800 }}>Windows in the course
            <input
              type="number" min="1" max="40" value={pacing.windowCount} disabled={busy}
              onChange={(event) => setPacingField('windowCount', Number(event.target.value))}
              style={{ ...control, width: '100%', marginTop: 6 }}
            />
          </label>
          <label style={{ fontWeight: 800 }}>Acceleration radius
            <input
              type="number" min="0" max="6" value={pacing.accelerationRadius} disabled={busy}
              onChange={(event) => setPacingField('accelerationRadius', Number(event.target.value))}
              style={{ ...control, width: '100%', marginTop: 6 }}
            />
          </label>
        </div>

        {isProvisional && <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>
            Current position — window {pacing.currentWindow} of {pacing.windowCount}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {Array.from({ length: pacing.windowCount }, (_, index) => index + 1).map((window) => (
              <button
                key={window} type="button" disabled={busy}
                onClick={() => setPacingField('currentWindow', window)}
                style={chipButton(window === pacing.currentWindow)}
                aria-pressed={window === pacing.currentWindow}
              >
                {window}
              </button>
            ))}
          </div>
          <p style={{ ...note, margin: '10px 0 0' }}>
            Moving the position changes what MathMaster recommends. It never erases mastery
            history — a class that falls behind keeps everything its students have shown.
          </p>
        </div>}
        {!isProvisional && (
          <p style={{ ...note, margin: '14px 0 0' }}>
            Position comes from the district calendar and today&apos;s date, so there is no window to
            set by hand. Use the overrides below to open, delay or prioritise individual skills for
            this class.
          </p>
        )}
      </div>

      <div style={panel}>
        <h3 style={heading}>Skill overrides for {classId}</h3>
        <p style={note}>
          Overrides are stored per class, so opening a skill early for one period does not open it
          for the others, and they never modify the shared curriculum. Tap the same action again to
          clear it. {classOverrides.length} active.
        </p>
        <input
          value={skillFilter}
          onChange={(event) => setSkillFilter(event.target.value)}
          placeholder="Filter skills…"
          style={{ ...control, width: '100%', marginBottom: 12 }}
        />
        <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid #eceff3', borderRadius: 8 }}>
          {filteredSkills.map((skill) => {
            const active = overrideBySkill[skill.skillId];
            const described = describeSkill(skill.skillId);
            return (
              <div
                key={skill.skillId}
                style={{
                  padding: '11px 12px', borderBottom: '1px solid #eceff3',
                  background: active ? '#f7f9ff' : '#fff',
                  display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <div style={{ minWidth: 220, flex: 1 }}>
                  <strong style={{ fontSize: 13 }}>{described.shortLabel}</strong>
                  <div style={{ fontSize: 12, color: '#5f6368', lineHeight: 1.45 }}>{skill.title}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {OVERRIDE_ACTIONS.map((action) => (
                    <button
                      key={action} type="button" disabled={busy}
                      onClick={() => applyOverride(skill.skillId, action)}
                      style={{ ...chipButton(active?.action === action), minHeight: 36, fontSize: 12 }}
                      aria-pressed={active?.action === action}
                    >
                      {ACTION_LABEL[action]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {filteredSkills.length === 0 && (
            <div style={{ padding: 16, color: '#5f6368', fontSize: 13 }}>No skills match that filter.</div>
          )}
        </div>
      </div>

      <div style={panel}>
        <h3 style={heading}>What a student in {classId} would be offered</h3>
        <p style={note}>
          The real recommendation engine, run against this pacing and these overrides for a student
          with no history yet. Nothing here is shown to students — no student screen reads the path
          engine yet — so this is a safe way to see what your settings do.
        </p>
        <button
          type="button"
          onClick={() => setPreviewOpen((current) => !current)}
          style={{ ...chipButton(previewOpen), minHeight: 44 }}
          aria-expanded={previewOpen}
        >
          {previewOpen ? '▾ Hide preview' : '▸ Show preview'}
        </button>

        {previewOpen && (
          <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
            <div style={{ fontSize: 13, color: '#5f6368' }}>
              Confidence: <strong>{preview.confidence.level}</strong> — {preview.confidence.message}
            </div>
            {PREVIEW_ORDER.map((key) => {
              const rows = preview[key] || [];
              if (!rows.length) return null;
              const style = STATUS_STYLE[key] || STATUS_STYLE.available;
              return (
                <div key={key}>
                  <div style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', ...style }}>
                    {key} · {rows.length}
                  </div>
                  <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13, lineHeight: 1.6 }}>
                    {rows.slice(0, 6).map((row) => (
                      <li key={row.skillId}>
                        <strong>{describeSkill(row.skillId).shortLabel}</strong> — {explainForStudent(row)}
                        <span style={{ color: '#80868b' }}> (score {row.score.toFixed(2)}{row.pacingIsProvisional ? ', provisional pacing' : ''})</span>
                      </li>
                    ))}
                    {rows.length > 6 && <li style={{ color: '#80868b' }}>…and {rows.length - 6} more</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

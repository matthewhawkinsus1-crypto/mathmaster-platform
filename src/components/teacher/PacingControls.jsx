import { useMemo, useState } from 'react';
import { CLASS_PERIODS } from '../../assignmentLifecycle';
import { getSkillGraph, describeSkill } from '../../platform/path/skillGraph';
import { explainForStudent } from '../../platform/path/recommendationEngine';
import { buildStudentPathOptions, deriveAutomaticClassPacing, resolvePacingProvider } from '../../platform/path/studentPathOptions';
import { describeToday, loadCalendar } from '../../platform/path/curriculumCalendar';
import {
  OVERRIDE_ACTIONS, normalizePacingByClass, overridesForClassContext, removeOverride, upsertOverride,
} from '../../platform/path/pathStore';

// Teacher pacing and skill overrides.
//
// This screen is an OPTIONAL teacher override over autonomous pacing. Students
// have a Path without touching this page; teachers use it only when the live
// calendar/assignment anchor needs a local adjustment.
//
// What is set here reaches students directly: Recommended for You and the
// student Path are both built from this pacing, so a position set on this
// screen changes what a student is offered on their next visit. The preview at
// the bottom is the engine's real output rather than a mock, so it is the same
// answer the student will get.
//
// The course follows the CLASS. A teacher with an Algebra I period and an
// Algebra II Honors period must not be shown one course's skill graph for both,
// so the course is resolved from the selected class rather than fixed here.

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
  // The fallback for a class with no course set, not a global setting.
  courseId: fallbackCourseId = 'algebra1',
  classes = [],
  assignments = [],
  // period -> { course, courseLabel, ... }, exactly as the teacher's class
  // settings store it.
  courseProfiles = {},
  nowValue = Date.now(),
  pacingByClass = {},
  overrides = [],
  onSavePacing,
  onSaveOverrides,
  busy = false,
}) {
  const classOptions = useMemo(() => {
    const live = (Array.isArray(classes) ? classes : [])
      .filter((entry) => entry?.classId && entry?.status !== 'archived')
      .map((entry) => ({
        key: entry.classId,
        period: entry.period || '',
        name: entry.name || entry.classId,
        course: entry.course || fallbackCourseId,
        courseLevel: entry.courseLevel || 'standard',
        courseLabel: entry.courseLabel || entry.name || entry.course || fallbackCourseId,
      }));
    if (live.length) return live;
    return CLASS_PERIODS.map((period) => ({
      key: period,
      period,
      name: period,
      course: courseProfiles?.[period]?.course || fallbackCourseId,
      courseLevel: courseProfiles?.[period]?.courseLevel || 'standard',
      courseLabel: courseProfiles?.[period]?.courseLabel || courseProfiles?.[period]?.course || fallbackCourseId,
    }));
  }, [classes, courseProfiles, fallbackCourseId]);

  const [selectedClassKey, setSelectedClassKey] = useState('');
  const classId = classOptions.some((entry) => entry.key === selectedClassKey)
    ? selectedClassKey
    : (classOptions[0]?.key || CLASS_PERIODS[0] || 'Period 1');
  const selectedClass = classOptions.find((entry) => entry.key === classId) || null;
  const classProfile = selectedClass || courseProfiles?.[selectedClass?.period || classId] || null;
  const courseId = classProfile?.course || fallbackCourseId;
  const [skillFilter, setSkillFilter] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  const classAssignments = useMemo(() => (
    (Array.isArray(assignments) ? assignments : []).filter((assignment) => {
      const periods = Array.isArray(assignment?.assignedClassPeriods) ? assignment.assignedClassPeriods : [];
      return selectedClass?.period ? periods.includes(selectedClass.period) : false;
    })
  ), [assignments, selectedClass]);

  const skills = useMemo(() => getSkillGraph(courseId), [courseId]);
  const storedPacing = useMemo(() => {
    const normalized = normalizePacingByClass(pacingByClass);
    return normalized[classId] || (selectedClass?.period ? normalized[selectedClass.period] : null) || null;
  }, [pacingByClass, classId, selectedClass]);
  const pacing = useMemo(() => (
    storedPacing || deriveAutomaticClassPacing({ courseId, assignments: classAssignments, skills, nowValue })
  ), [storedPacing, courseId, classAssignments, skills, nowValue]);
  const classOverrides = useMemo(() => overridesForClassContext(overrides, {
    classId,
    classPeriod: selectedClass?.period || '',
  }), [overrides, classId, selectedClass]);
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
    assignments: classAssignments,
    courseId,
    pacing,
    teacherOverrides: classOverrides,
    nowValue,
  }) || { recommended: [], available: [], confidence: { level: 'low', message: '' } },
  [courseId, pacing, classOverrides, classAssignments, nowValue]);

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
          MathMaster runs this class autonomously by default. Use these controls only when you want to override
          where the class sits in the course. Pacing affects timing; prerequisites and mastery still decide readiness.
        </p>
        <div style={{ padding: '10px 12px', borderRadius: 8, background: storedPacing ? '#eef4ff' : '#e6f4ea', color: storedPacing ? '#174ea6' : '#137333', fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
          <strong>{storedPacing ? 'Manual pacing override is active.' : 'Automatic pacing is active.'}</strong>{' '}
          {storedPacing
            ? 'Students still route autonomously from mastery and prerequisites; this class position only changes the timing window.'
            : 'No setup is required. MathMaster uses the district calendar when available and otherwise anchors provisional pacing to open assignment TEKS.'}
          {storedPacing && normalizePacingByClass(pacingByClass)[classId] && (
            <button type="button" disabled={busy} onClick={() => {
              const next = { ...pacingByClass };
              delete next[classId];
              onSavePacing?.(next);
            }} style={{ marginLeft: 10, minHeight: 34, padding: '5px 10px', border: '1px solid #aecbfa', borderRadius: 7, background: '#fff', color: '#174ea6', fontWeight: 800, cursor: busy ? 'wait' : 'pointer' }}>
              Return to automatic
            </button>
          )}
        </div>
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
          <label style={{ fontWeight: 800 }}>Class
            <select value={classId} onChange={(event) => setSelectedClassKey(event.target.value)} style={{ ...control, width: '100%', marginTop: 6 }}>
              {classOptions.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.period ? `${entry.name} · ${entry.period}` : entry.name} · {entry.courseLevel === 'honors' ? 'Honors' : 'Standard'}
                </option>
              ))}
            </select>
            <span style={{ display: 'block', marginTop: 6, fontSize: 12, fontWeight: 700, color: '#5f6368' }}>
              {classProfile?.courseLabel
                ? `Pacing, skills and preview below are ${classProfile.courseLabel}.`
                : 'No course set for this class, so Algebra I is assumed.'}
            </span>
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
        <h3 style={heading}>Skill overrides for {selectedClass?.name || classId}</h3>
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
        <h3 style={heading}>What a student in {selectedClass?.name || classId} would be offered</h3>
        <p style={note}>
          The real recommendation engine, run against this pacing and these overrides for a student
          with no history yet. This is the same answer a student in {selectedClass?.name || classId} gets on their own
          Path and in Recommended for You, so what you set here is what they will be offered.
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

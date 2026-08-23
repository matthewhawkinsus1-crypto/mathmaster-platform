import { useMemo, useRef, useState } from 'react';
import { courseLabel, courseLevelLabel, studentsInClass, unplaceableStudents } from '../../../functions/shared/classModel.mjs';

/*
 * THE CLASS THE TEACHER IS WORKING IN, STATED ONCE.
 *
 * Before this existed there were nine independent class selectors, one per
 * screen, and none of them told any other one anything. A teacher who opened
 * Period 3 in the Classes workspace, walked to the Gradebook and then to Weekly
 * Path picked Period 3 three times — and if they got one of them wrong, nothing
 * on the screen said so, because each view labelled its own selection in its own
 * corner.
 *
 * So this bar is deliberately NOT another selector. It is the statement of a
 * single piece of application state that every class-scoped view reads. Changing
 * it here changes it everywhere, which is the whole point: the organizing unit
 * of the teacher workspace is the class, not the feature.
 *
 * It addresses classes by `classId`. Period is shown because it is what a
 * teacher says out loud — "third period" — but it is display and schedule
 * information, and two classes are allowed to share one. The identity is the id.
 */

const surface = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  padding: '10px 14px',
  border: '1px solid #d8dde6',
  borderRadius: 10,
  background: '#f8f9fa',
};

const chip = (background, color) => ({
  display: 'inline-block',
  padding: '3px 8px',
  borderRadius: 999,
  background,
  color,
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '.03em',
});

export default function ClassContextBar({
  classes = [],
  students = [],
  activeClassId = null,
  onSelectClass = null,
  // What the teacher is looking at right now, so the bar can say what the
  // selection actually governs rather than floating above the page unexplained.
  scopeLabel = '',
  // Some views genuinely operate across every class (Assignments, the Library).
  // Those pass `allowAllClasses` so "All classes" is an honest option rather
  // than an empty state.
  allowAllClasses = true,
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);

  const active = useMemo(
    () => (Array.isArray(classes) ? classes : []).filter((entry) => entry?.status !== 'archived'),
    [classes],
  );

  // Counted through the shared membership rule, not by classId alone, so an
  // unmigrated student who IS placeable by period is counted where a teacher
  // will actually find them.
  const rosterCounts = useMemo(() => Object.fromEntries(active.map((entry) => [
    entry.classId,
    studentsInClass({ students, classes: active, classId: entry.classId }).length,
  ])), [active, students]);

  const selected = active.find((entry) => entry.classId === activeClassId) || null;

  // Students whose period is served by two classes and who have no class of
  // their own. They belong to no roster, so without this they would simply stop
  // appearing and read as having left the school.
  const unplaceable = useMemo(
    () => unplaceableStudents({ students, classes: active }),
    [students, active],
  );

  // A teacher with one class should never be asked which class. The bar still
  // states the context — it just has nothing to offer them.
  const switchable = active.length > 1;

  const choose = (classId) => {
    const record = active.find((entry) => entry.classId === classId) || null;
    onSelectClass?.({ classId: record?.classId || null, classPeriod: record?.period || null });
    setOpen(false);
    buttonRef.current?.focus();
  };

  if (!active.length) {
    return (
      <div style={{ ...surface, color: '#5f6368' }}>
        <span style={{ fontWeight: 800 }}>No classes yet.</span>
        <span style={{ fontSize: 13 }}>Create a class in Administration so rosters, pacing and grades have somewhere to live.</span>
      </div>
    );
  }

  return (
    <div style={surface}>
      <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.09em', textTransform: 'uppercase', color: '#5f6368' }}>
        Class
      </span>

      <div style={{ position: 'relative' }}>
        <button
          type="button"
          ref={buttonRef}
          onClick={() => (switchable ? setOpen((current) => !current) : undefined)}
          aria-haspopup={switchable ? 'listbox' : undefined}
          aria-expanded={switchable ? open : undefined}
          disabled={!switchable}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 9,
            padding: '7px 12px',
            border: '1px solid #c7cdd6',
            borderRadius: 8,
            background: '#fff',
            color: '#202124',
            fontWeight: 900,
            fontSize: 15,
            cursor: switchable ? 'pointer' : 'default',
          }}
        >
          <span>{selected ? (selected.name || selected.period) : 'All classes'}</span>
          {selected?.period && <span style={{ fontSize: 12, fontWeight: 600, color: '#5f6368' }}>{selected.period}</span>}
          {switchable && <span aria-hidden="true" style={{ fontSize: 11, color: '#5f6368' }}>▾</span>}
        </button>

        {open && (
          <ul
            role="listbox"
            style={{
              position: 'absolute',
              zIndex: 30,
              top: 'calc(100% + 6px)',
              left: 0,
              minWidth: 280,
              margin: 0,
              padding: 6,
              listStyle: 'none',
              background: '#fff',
              border: '1px solid #c7cdd6',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,.14)',
            }}
          >
            {allowAllClasses && (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={!selected}
                  onClick={() => choose(null)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '9px 11px',
                    border: 0, borderRadius: 7, background: !selected ? '#e8f0fe' : 'transparent',
                    color: '#202124', fontWeight: 800, cursor: 'pointer',
                  }}
                >
                  All classes
                </button>
              </li>
            )}
            {active.map((entry) => (
              <li key={entry.classId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={entry.classId === activeClassId}
                  onClick={() => choose(entry.classId)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '9px 11px',
                    border: 0, borderRadius: 7,
                    background: entry.classId === activeClassId ? '#e8f0fe' : 'transparent',
                    color: '#202124', cursor: 'pointer',
                  }}
                >
                  <span style={{ fontWeight: 800 }}>{entry.name || entry.period}</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#5f6368', marginTop: 1 }}>
                    {entry.period} · {courseLabel(entry.course)} · {courseLevelLabel(entry.courseLevel)} · {rosterCounts[entry.classId] || 0} student{(rosterCounts[entry.classId] || 0) === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <>
          <span style={chip('#e8f0fe', '#174ea6')}>{courseLabel(selected.course)}</span>
          {selected.courseLevel === 'honors' && <span style={chip('#f3e8fd', '#6f2da8')}>Honors</span>}
          <span style={{ color: '#5f6368', fontSize: 13 }}>
            {rosterCounts[selected.classId] || 0} student{(rosterCounts[selected.classId] || 0) === 1 ? '' : 's'}
          </span>
        </>
      )}

      {scopeLabel && (
        <span style={{ marginLeft: 'auto', color: '#5f6368', fontSize: 12 }}>
          {selected ? `${scopeLabel} for this class` : `${scopeLabel} across all classes`}
        </span>
      )}

      {unplaceable.length > 0 && (
        <div style={{ flexBasis: '100%', marginTop: 2, padding: '9px 11px', borderRadius: 8, background: '#fff4ce', color: '#6b4c00', fontSize: 12.5 }}>
          <strong>{unplaceable.length} student{unplaceable.length === 1 ? ' is' : 's are'} not on any class roster.</strong>{' '}
          Their class period is used by more than one class, so MathMaster cannot tell which one they belong to.
          Give them a class in Administration and they will appear again.
        </div>
      )}
    </div>
  );
}

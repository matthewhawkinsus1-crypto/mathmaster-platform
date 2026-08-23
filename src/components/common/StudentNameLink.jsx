import StudentPerformanceBadge from './StudentPerformanceBadge.jsx';

/*
 * A STUDENT'S NAME IS A DOORWAY.
 *
 * Eleven teacher surfaces print student names. Before this, a name was plain
 * text on most of them, a row toggle on one, and a full navigation on another —
 * so a teacher learned that clicking a name does something unpredictable, which
 * in practice means they stop clicking.
 *
 * This is the single rendering. It looks like what it is, it opens the same
 * drawer everywhere, and it optionally carries the central badge so a teacher
 * reading a list can see the academic picture without opening anything.
 *
 * The badge is a SEPARATE element beside the name, not a colour applied to the
 * name. Colouring the name itself would make the roster read as a ranking of
 * children, which is not what an instructional band is for.
 */

export default function StudentNameLink({
  studentId,
  studentName,
  profile = null,
  onOpen = null,
  showBadge = false,
  badgeSize = 'small',
  // Set when the name sits in a context where engagement would be misread as
  // performance — a gradebook row already showing a score, for instance.
  showEngagement = true,
  style = {},
}) {
  const name = studentName || String(studentId || 'Student');

  if (!onOpen) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, ...style }}>
        <span style={{ fontWeight: 800 }}>{name}</span>
        {showBadge && <StudentPerformanceBadge profile={profile} size={badgeSize} showEngagement={showEngagement} studentName={name} />}
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', ...style }}>
      <button
        type="button"
        onClick={() => onOpen(studentId)}
        title={`Open ${name}'s learning profile`}
        style={{
          border: 0,
          background: 'transparent',
          padding: 0,
          color: '#174ea6',
          fontWeight: 800,
          fontSize: 'inherit',
          fontFamily: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
          textDecorationLine: 'underline',
          textDecorationColor: '#c3d6f5',
          textUnderlineOffset: 3,
        }}
      >
        {name}
      </button>
      {showBadge && (
        <StudentPerformanceBadge
          profile={profile}
          size={badgeSize}
          showEngagement={showEngagement}
          studentName={name}
          onClick={() => onOpen(studentId)}
        />
      )}
    </span>
  );
}

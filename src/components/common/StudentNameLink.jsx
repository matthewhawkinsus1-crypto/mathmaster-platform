import StudentPerformanceBadge from './StudentPerformanceBadge.jsx';
import { STUDENT_NAME_UNAVAILABLE, acceptStudentName, studentIdLabel } from '../../platform/studentName.js';

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
  // A screen that already prints "ID x" under every name (the Students
  // roster) turns this off so a nameless student's id is not shown twice.
  showMissingId = true,
  style = {},
}) {
  // The name a caller resolved, or "Name unavailable" with the id shown
  // beside it as a labelled id. The id itself is never the link text: a
  // nameless student must read as missing a name, not as '101410'.
  const name = acceptStudentName(studentName, { studentId }) || STUDENT_NAME_UNAVAILABLE;
  const idLabel = name === STUDENT_NAME_UNAVAILABLE ? studentIdLabel(studentId) : '';
  const label = idLabel ? `${name} · ${idLabel}` : name;
  const idNote = idLabel && showMissingId
    ? <span style={{ color: '#5f6368', fontWeight: 400, fontSize: '0.85em' }}>{idLabel}</span>
    : null;

  if (!onOpen) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, ...style }}>
        <span style={{ fontWeight: 800 }}>{name}</span>
        {idNote}
        {showBadge && <StudentPerformanceBadge profile={profile} size={badgeSize} showEngagement={showEngagement} studentName={label} />}
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', ...style }}>
      <button
        type="button"
        onClick={() => onOpen(studentId)}
        title={idLabel ? `Open the learning profile for ${label}` : `Open ${name}'s learning profile`}
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
      {idNote}
      {showBadge && (
        <StudentPerformanceBadge
          profile={profile}
          size={badgeSize}
          showEngagement={showEngagement}
          studentName={label}
          onClick={() => onOpen(studentId)}
        />
      )}
    </span>
  );
}

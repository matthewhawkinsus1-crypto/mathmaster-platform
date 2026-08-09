/*
 * Grouped navigation rail.
 *
 * The tab list grew to thirteen entries as Analytics, Secure Exams, the Math
 * Tools Lab and Administration landed. A flat list that long stops being
 * scannable — everything looks equally important and finding "Grades" means
 * reading every label. Grouping into four labelled sections keeps each group
 * to three or four items, which is a length the eye can take in at once.
 *
 * Icons are per-tab rather than the previous first-letter badge, because with
 * thirteen entries several now collide (Classes/Class Schedule,
 * Assignments/Analytics) and a letter badge stopped disambiguating anything —
 * which mattered most in collapsed mode, where the badge is all you get.
 */

const TAB_LABELS = {
  home: 'Home',
  demo: 'Demo Experience',
  assignments: 'Assignments',
  library: 'Library',
  mathTools: 'Math Tools Lab',
  simulator: 'Path Simulator',
  students: 'Students',
  classesWorkspace: 'Classes',
  classes: 'Class Schedule',
  pacing: 'Curriculum Pacing',
  grades: 'Grades',
  standards: 'TEKS & Mastery',
  analytics: 'Analytics',
  exams: 'Secure Exams',
  classroom: 'Google Classroom',
  access: 'Student Access',
};

const TAB_ICONS = {
  home: '🏠',
  demo: '▶️',
  assignments: '📄',
  library: '🗂️',
  mathTools: '🧪',
  simulator: '🧭',
  students: '👥',
  classesWorkspace: '🏫',
  classes: '🕘',
  pacing: '📐',
  grades: '📊',
  standards: '🎯',
  analytics: '📈',
  exams: '🔒',
  classroom: '🎓',
  access: '🔑',
};

const TAB_GROUPS = [
  { id: 'teach', label: 'Teach', tabs: ['home', 'demo', 'assignments', 'library', 'mathTools', 'simulator'] },
  { id: 'people', label: 'Classes', tabs: ['students', 'classesWorkspace', 'classes', 'pacing'] },
  { id: 'insight', label: 'Evidence', tabs: ['grades', 'standards', 'analytics', 'exams'] },
  { id: 'admin', label: 'Setup', tabs: ['classroom', 'access'] },
];

// Purely presentational, controlled navigation rail. Owns no data of its
// own — `App.jsx` still owns `teacherTab`/`sidebarCollapsed` state and is
// responsible for any side effects (like resetting the gradebook filter)
// that should run when the active tab changes; this component only reports
// which tab was clicked.
export default function TeacherSidebar({ activeTab, onSelectTab, collapsed, onToggleCollapsed, isRootAdmin = false }) {
  const labelFor = (tab) => (tab === 'access' && isRootAdmin ? 'Administration' : TAB_LABELS[tab]);

  return (
    <nav
      aria-label="Teacher dashboard navigation"
      className="mm-dashboard-nav"
      style={{
        width: collapsed ? '64px' : '212px',
        flex: `0 0 ${collapsed ? '64px' : '212px'}`,
        transition: 'width 0.16s ease, flex-basis 0.16s ease',
        background: '#f8f9fa',
        borderRight: '1px solid #e8eaed',
        borderRadius: '12px 0 0 12px',
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 8px',
        boxSizing: 'border-box',
      }}
    >
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="mm-nav-collapse"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        style={{
          alignSelf: collapsed ? 'center' : 'flex-end',
          width: '32px',
          height: '32px',
          border: '1px solid #dadce0',
          borderRadius: '8px',
          background: '#fff',
          color: '#5f6368',
          cursor: 'pointer',
          marginBottom: '10px',
          fontWeight: 'bold',
        }}
      >
        {collapsed ? '»' : '«'}
      </button>

      {TAB_GROUPS.map((group, groupIndex) => (
        <div key={group.id} className="mm-nav-group" style={{ marginBottom: '10px' }}>
          {collapsed ? (
            // A hairline keeps the grouping legible once labels are hidden.
            groupIndex > 0 && <div aria-hidden="true" style={{ height: '1px', background: '#e1e3e6', margin: '8px 6px' }} />
          ) : (
            <div
              style={{
                padding: '4px 12px',
                fontSize: '10px',
                fontWeight: 900,
                letterSpacing: '0.09em',
                textTransform: 'uppercase',
                color: '#80868b',
              }}
            >
              {group.label}
            </div>
          )}

          {group.tabs.map((tab) => {
            const label = labelFor(tab);
            const active = activeTab === tab;
            return (
              <button
                type="button"
                key={tab}
                onClick={() => onSelectTab(tab)}
                title={label}
                aria-current={active ? 'page' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  width: '100%',
                  minHeight: '40px',
                  padding: collapsed ? '8px 0' : '8px 12px',
                  marginBottom: '2px',
                  border: 'none',
                  borderRadius: '9px',
                  background: active ? '#e8f0fe' : 'transparent',
                  color: active ? '#1a73e8' : '#3c4043',
                  cursor: 'pointer',
                  fontWeight: active ? 800 : 600,
                  fontSize: '14px',
                  textAlign: 'left',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '26px',
                    height: '26px',
                    flex: '0 0 26px',
                    borderRadius: '999px',
                    background: active ? '#1a73e8' : '#e1e3e6',
                    fontSize: '13px',
                    lineHeight: 1,
                  }}
                >
                  {TAB_ICONS[tab] || '•'}
                </span>
                {!collapsed && <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

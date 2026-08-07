const TAB_LABELS = {
  home: 'Home',
  assignments: 'Assignments',
  library: 'Library',
  students: 'Students',
  classesWorkspace: 'Classes',
  classes: 'Class Schedule',
  grades: 'Grades',
  standards: 'TEKS & Mastery',
  access: 'Sign-in Access',
  classroom: 'Google Classroom',
};

const TABS = ['home', 'assignments', 'library', 'students', 'classesWorkspace', 'classes', 'grades', 'standards', 'access', 'classroom'];

// Purely presentational, controlled navigation rail. Owns no data of its
// own — `App.jsx` still owns `teacherTab`/`sidebarCollapsed` state and is
// responsible for any side effects (like resetting the gradebook filter)
// that should run when the active tab changes; this component only reports
// which tab was clicked.
export default function TeacherSidebar({ activeTab, onSelectTab, collapsed, onToggleCollapsed }) {
  return (
    <nav
      aria-label="Teacher dashboard navigation"
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
          marginBottom: '14px',
          fontWeight: 'bold',
        }}
      >
        {collapsed ? '»' : '«'}
      </button>

      {TABS.map((tab) => {
        const label = TAB_LABELS[tab];
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
              padding: collapsed ? '10px 0' : '10px 12px',
              marginBottom: '4px',
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
                color: active ? '#fff' : '#5f6368',
                fontSize: '12px',
                fontWeight: 900,
              }}
            >
              {label.charAt(0)}
            </span>
            {!collapsed && <span>{label}</span>}
          </button>
        );
      })}
    </nav>
  );
}

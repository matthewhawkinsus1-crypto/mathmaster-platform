/*
 * THE ROOT ADMINISTRATOR'S SCREEN (the teacher's first load, third pass).
 *
 * Moved out of ./TeacherWorkspace.jsx verbatim, with its section tabs. One
 * account can open it, and every teacher downloaded it before Home drew. The
 * workspace asks for it as it draws for that account
 * (./teacherPanels.js's administrationView), so it is here by the time
 * Administration is chosen; until then the screen says it is opening, marked
 * busy.
 *
 * A render function, not a component: the workspace returns what it draws
 * where it returned the JSX, with what the JSX read there by name (`scope`),
 * so React sees the same elements in the same place. The lazy screens it
 * draws come in `scope` too: ../lazyScreens.js imported here as well would
 * leave App's chunk for a chunk of its own on every student's first load.
 */
import { MAIN_CONTENT_ID, SkipToContent } from '../../components/common/pageChrome.jsx';
import { tabKeyTarget } from '../../platform/interaction/tabListKeys.js';

// The administrator's five sections, as a tab list (TT27): the selected tab is
// the one Tab stop, the arrow keys, Home and End move focus between the tabs
// (selecting is Enter or Space, a native button's click), and the content under
// them is a tab panel named by the selected tab. Same keys as Live Class. On a
// phone they are one row that scrolls sideways (App.css, .mm-admin-tabs).
const ADMIN_SECTIONS =[['classes', 'Classes & rosters'], ['accounts', 'Accounts & sign-in'], ['coverage', 'Path content coverage'], ['ai', 'Assignment AI health'], ['reset', 'Pre-production reset']];
const ADMIN_PANEL_ID = 'admin-section-panel';
const adminTabId = (id) => `admin-tab-${id}`;
const moveBetweenAdminTabs = (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')];
  const from = tabs.indexOf(event.target);
  if (from < 0) return;
  const to = tabKeyTarget(event.key, from, tabs.length);
  if (to === null) return;
  event.preventDefault();
  tabs[to].focus();
};

export function renderAdministration(scope) {
  const {
    AssignmentAiHealth,
    ClassesAdmin,
    PathCoverageAudit,
    PlatformHealth,
    PreproductionReset,
    SignInAccess,
    adminTab,
    fetchAssignments,
    fetchTeacherRosterSummaries,
    handleLogout,
    refreshTeacherRosterAfterNameChange,
    setAdminTab,
    setAllStudents,
    setAssignmentActivity,
    setAssignments,
    setClassEvidenceByStudentId,
    setClassworkGradesByAssignment,
    setDolGradesByAssignment,
    setPresenceById,
    setStudentSessionSummaries,
    setStudentSupportEvents,
    setSupportUsageByAssignment,
    setTeacherTab,
    setTeacherWorkspaceMode,
    setWeeklyPathCompletionsByStudent,
    setWeeklyPathGoalSnapshotsByStudent,
    user,
  } = scope;
  return (
      <div style={{ fontFamily: '"Segoe UI", sans-serif', backgroundColor: 'var(--mm-surface-control)', minHeight: '100vh', padding: '20px' }}>
        <SkipToContent />
        <div style={{ maxWidth: 1260, margin: '0 auto', background: 'var(--mm-surface)', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,.06)', overflow: 'hidden', overflowWrap: 'anywhere' }}>
          <header style={{ padding: '22px clamp(14px, 4vw, 28px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderBottom: '1px solid var(--mm-border-soft)', background: '#202124', color: '#fff' }}>
            <div><div style={{ fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, letterSpacing: '.08em', color: '#c6dafc' }}>ROOT ADMINISTRATOR</div><h1 style={{ margin: '4px 0 0', fontSize: 'calc(25 * var(--mm-px))', color: 'inherit' }}>MathMaster Administration</h1><p style={{ margin: '4px 0 0', color: '#dadce0', fontSize: 'calc(13 * var(--mm-px))' }}>{user.email}</p></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><div role="group" aria-label="Root administrator workspace" style={{ display: 'inline-flex', flexWrap: 'wrap', padding: 3, borderRadius: 9, background: '#3c4043', border: '1px solid #5f6368' }}><button type="button" aria-pressed="false" onClick={() => setTeacherWorkspaceMode('teacher')} style={{ padding: '6px 10px', border: 0, borderRadius: 6, background: 'transparent', color: '#e8eaed', fontWeight: 900 }}>Teacher View</button><button type="button" aria-pressed="true" style={{ padding: '6px 10px', border: 0, borderRadius: 6, background: 'var(--mm-surface)', color: 'var(--mm-text-strong)', fontWeight: 900 }}>Administration</button></div><button type="button" onClick={() => { setTeacherWorkspaceMode('teacher'); setTeacherTab('demo'); }} style={{ padding: '9px 13px', border: '1px solid var(--mm-accent-border)', borderRadius: 8, background: 'var(--mm-accent-subtle)', color: 'var(--mm-accent-text)', fontWeight: 900 }}>Open Demo Experience</button><button onClick={handleLogout} style={{ padding: '9px 13px', background: 'transparent', color: '#f28b82', border: '1px solid var(--mm-error-border-soft)', borderRadius: 8, fontWeight: 900 }}>Log Out</button></div>
          </header>
          <div role="tablist" aria-label="Administration sections" className="mm-admin-tabs" onKeyDown={moveBetweenAdminTabs} style={{ display: 'flex', gap: 8, padding: '14px clamp(14px, 4vw, 28px) 0', flexWrap: 'wrap' }}>
            {ADMIN_SECTIONS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={adminTabId(id)}
                aria-selected={adminTab === id}
                aria-controls={ADMIN_PANEL_ID}
                tabIndex={adminTab === id ? 0 : -1}
                onClick={() => setAdminTab(id)}
                style={{ minHeight: 40, padding: '8px 16px', borderRadius: '9px 9px 0 0', cursor: 'pointer', border: '1px solid var(--mm-border)', borderBottom: 0, background: adminTab === id ? 'var(--mm-surface)' : 'var(--mm-surface-control)', color: adminTab === id ? 'var(--mm-primary-text)' : 'var(--mm-text)', fontWeight: 900, fontSize: 'calc(14 * var(--mm-px))' }}
              >
                {label}
              </button>
            ))}
          </div>
          <main id={MAIN_CONTENT_ID} tabIndex={-1} style={{ padding: 'clamp(14px, 4vw, 28px)' }}>
            <div id={ADMIN_PANEL_ID} role="tabpanel" aria-labelledby={adminTabId(adminTab)}>
            {/* Platform health is on the landing section, not a sixth tab: the
                owner sees a crash alert on opening Administration, and the
                tab row keeps its certified one-row layout. */}
            {adminTab === 'classes' && <><PlatformHealth /><ClassesAdmin /></>}
            {adminTab === 'accounts' && <SignInAccess signedInEmail={user.email} mode="admin" onStudentIdentityChanged={refreshTeacherRosterAfterNameChange} />}
            {adminTab === 'coverage' && <PathCoverageAudit />}
            {adminTab === 'ai' && <AssignmentAiHealth />}
            {adminTab === 'reset' && (
              <PreproductionReset
                onResetComplete={async () => {
                  setAssignments([]);
                  setAllStudents([]);
                  setPresenceById({});
                  setStudentSupportEvents([]);
                  setStudentSessionSummaries([]);
                  setAssignmentActivity({});
                  setDolGradesByAssignment({});
                  setClassworkGradesByAssignment({});
                  setSupportUsageByAssignment({});
                  setWeeklyPathCompletionsByStudent({});
                  setWeeklyPathGoalSnapshotsByStudent({});
                  setClassEvidenceByStudentId({});
                  await Promise.all([
                    fetchAssignments(),
                    fetchTeacherRosterSummaries(),
                  ]);
                }}
              />
            )}
            </div>
          </main>
        </div>
      </div>
  );
}

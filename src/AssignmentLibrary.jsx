import { useMemo, useState } from 'react';
import {
  UNCATEGORIZED,
  assignmentFolderMatches,
  getFolderChildren,
  getFolderLabel,
  normalizeFolderPath,
  titleOrFolderMatches,
} from './assignmentFolders';
import { SMART_VIEWS, matchesSmartView } from './assignmentSmartViews';
import { getAssignmentLifecycle } from './assignmentLifecycle';

const dialogOverlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  background: 'rgba(32,33,36,0.72)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
};

const dialogCardStyle = {
  width: '100%',
  maxWidth: '440px',
  background: '#fff',
  borderRadius: '14px',
  boxShadow: '0 24px 70px rgba(0,0,0,0.3)',
  padding: '24px',
  textAlign: 'left',
};

function FolderRow({
  path,
  depth,
  folderPaths,
  selectedFolder,
  onSelect,
  onOpenDialog,
  dragOverFolder,
  onDragOverFolder,
  onDropOnFolder,
  expandedPaths,
  onToggleExpanded,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const children = getFolderChildren(folderPaths, path);
  const active = selectedFolder === path;
  const isDragOver = dragOverFolder === path;
  const expanded = expandedPaths.has(path);
  return (
    <div>
      <div
        onDragOver={(event) => { event.preventDefault(); onDragOverFolder(path); }}
        onDragLeave={() => onDragOverFolder(null)}
        onDrop={(event) => { event.preventDefault(); onDropOnFolder(path); }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
          padding: '6px 8px',
          marginLeft: `${depth * 16}px`,
          borderRadius: '7px',
          background: isDragOver ? '#e6f4ea' : active ? '#e8f0fe' : 'transparent',
          border: isDragOver ? '2px dashed #188038' : '2px solid transparent',
        }}
      >
        <button
          type="button"
          onClick={() => children.length && onToggleExpanded(path)}
          aria-label={children.length ? `${expanded ? 'Collapse' : 'Expand'} ${getFolderLabel(path)}` : undefined}
          style={{ width: 22, border: 0, background: 'transparent', color: '#5f6368', cursor: children.length ? 'pointer' : 'default', padding: 0 }}
        >
          {children.length ? (expanded ? '⌄' : '›') : '·'}
        </button>
        <button
          type="button"
          onClick={() => onSelect(path)}
          style={{
            flex: 1,
            textAlign: 'left',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: 0,
            fontWeight: active ? 800 : 600,
            color: active ? '#1a73e8' : '#3c4043',
            fontSize: '13px',
          }}
        >
          {getFolderLabel(path)}
        </button>
        <div style={{ position: 'relative' }}>
          <button type="button" onClick={() => setMenuOpen((value) => !value)} aria-label={`Folder actions for ${getFolderLabel(path)}`} title="Folder actions" style={{ fontSize: '16px', width: 28, height: 28, border: '1px solid #dadce0', borderRadius: '6px', background: '#fff', color: '#5f6368', cursor: 'pointer' }}>⋯</button>
          {menuOpen && <div style={{ position: 'absolute', right: 0, top: 31, zIndex: 20, minWidth: 130, padding: 5, border: '1px solid #d8dde6', borderRadius: 8, background: '#fff', boxShadow: '0 8px 22px rgba(0,0,0,.14)' }}>
            <button type="button" onClick={() => { setMenuOpen(false); onOpenDialog({ mode: 'create', parentPath: path, input: `${path}/` }); }} style={{ display: 'block', width: '100%', padding: 7, border: 0, background: '#fff', textAlign: 'left' }}>New subfolder</button>
            <button type="button" onClick={() => { setMenuOpen(false); onOpenDialog({ mode: 'rename', path, input: path }); }} style={{ display: 'block', width: '100%', padding: 7, border: 0, background: '#fff', textAlign: 'left' }}>Rename</button>
            <button type="button" onClick={() => { setMenuOpen(false); onOpenDialog({ mode: 'delete', path }); }} style={{ display: 'block', width: '100%', padding: 7, border: 0, background: '#fff', color: '#c5221f', textAlign: 'left' }}>Delete</button>
          </div>}
        </div>
      </div>
      {expanded && children.map((childPath) => (
        <FolderRow
          key={childPath}
          path={childPath}
          depth={depth + 1}
          folderPaths={folderPaths}
          selectedFolder={selectedFolder}
          onSelect={onSelect}
          onOpenDialog={onOpenDialog}
          dragOverFolder={dragOverFolder}
          onDragOverFolder={onDragOverFolder}
          onDropOnFolder={onDropOnFolder}
          expandedPaths={expandedPaths}
          onToggleExpanded={onToggleExpanded}
        />
      ))}
    </div>
  );
}

export default function AssignmentLibrary({
  assignments = [],
  folderPaths = [],
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveAssignment,
  onNavigateToAssignments,
  nowValue = Date.now(),
  classSchedule,
}) {
  const [selectedFolder, setSelectedFolder] = useState('');
  const [smartView, setSmartView] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedAssignmentId, setDraggedAssignmentId] = useState(null);
  const [dragOverFolder, setDragOverFolder] = useState(null);
  const [folderDialog, setFolderDialog] = useState(null); // { mode, path?, parentPath?, input }
  const [dialogError, setDialogError] = useState(null);
  const [folderPaneCollapsed, setFolderPaneCollapsed] = useState(() => {
    try { return window.localStorage.getItem('mathmaster:library:folder-pane-collapsed') === 'true'; } catch { return false; }
  });
  const [expandedPaths, setExpandedPaths] = useState(() => {
    try { return new Set(JSON.parse(window.localStorage.getItem('mathmaster:library:expanded-folders') || '[]')); } catch { return new Set(); }
  });
  const [sortMode, setSortMode] = useState('title');

  const topLevelFolders = getFolderChildren(folderPaths, '');

  // Smart view (including the implicit "hide archived unless viewing
  // Archived" rule baked into matchesSmartView) applies before folder/search
  // narrowing, so the folder counts below stay consistent with what's
  // actually shown in the list.
  const visibleForSmartView = useMemo(() => assignments.filter((assignment) => (
    matchesSmartView(assignment, smartView, { nowValue, classSchedule })
  )), [assignments, smartView, nowValue, classSchedule]);

  const filteredAssignments = useMemo(() => {
    const items = visibleForSmartView.filter((assignment) => (
      assignmentFolderMatches(assignment, selectedFolder)
      && titleOrFolderMatches(assignment, searchQuery)
    ));
    return [...items].sort((left, right) => {
      if (sortMode === 'due') return new Date(left.dueAt || left.dueDate || 0).getTime() - new Date(right.dueAt || right.dueDate || 0).getTime();
      if (sortMode === 'status') return getAssignmentLifecycle(left, nowValue).status.localeCompare(getAssignmentLifecycle(right, nowValue).status);
      return String(left.title || '').localeCompare(String(right.title || ''));
    });
  }, [visibleForSmartView, selectedFolder, searchQuery, sortMode, nowValue]);

  const uncategorizedCount = visibleForSmartView.filter((assignment) => !normalizeFolderPath(assignment.folder)).length;

  const closeDialog = () => { setFolderDialog(null); setDialogError(null); };

  const submitDialog = () => {
    if (!folderDialog) return;
    const value = normalizeFolderPath(folderDialog.input);
    if (folderDialog.mode === 'delete') {
      onDeleteFolder(folderDialog.path);
      if (selectedFolder === folderDialog.path) setSelectedFolder('');
      closeDialog();
      return;
    }
    if (!value) {
      setDialogError('Enter a folder name.');
      return;
    }
    if (folderDialog.mode === 'create') {
      if (folderPaths.includes(value)) {
        setDialogError('That folder already exists.');
        return;
      }
      onCreateFolder(value);
    } else if (folderDialog.mode === 'rename') {
      if (value !== folderDialog.path && folderPaths.includes(value)) {
        setDialogError('That folder already exists.');
        return;
      }
      onRenameFolder(folderDialog.path, value);
      if (selectedFolder === folderDialog.path) setSelectedFolder(value);
    }
    closeDialog();
  };

  const handleDropOnFolder = (folderPath) => {
    setDragOverFolder(null);
    if (draggedAssignmentId) onMoveAssignment(draggedAssignmentId, folderPath);
    setDraggedAssignmentId(null);
  };

  const toggleFolderPane = () => setFolderPaneCollapsed((current) => {
    const next = !current;
    try { window.localStorage.setItem('mathmaster:library:folder-pane-collapsed', String(next)); } catch { /* best effort */ }
    return next;
  });

  const toggleExpanded = (path) => setExpandedPaths((current) => {
    const next = new Set(current);
    if (next.has(path)) next.delete(path); else next.add(path);
    try { window.localStorage.setItem('mathmaster:library:expanded-folders', JSON.stringify([...next])); } catch { /* best effort */ }
    return next;
  });

  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <h2 style={{ margin: 0 }}>Library</h2>
        <button
          type="button"
          onClick={() => onNavigateToAssignments({ folder: selectedFolder, smartView })}
          style={{ padding: '9px 16px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          View {filteredAssignments.length} in Assignments &rarr;
        </button>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search title or folder"
          style={{ flex: '1 1 220px', padding: '9px 12px', border: '1px solid #c9ced6', borderRadius: '8px' }}
        />
        <select value={sortMode} onChange={(event) => setSortMode(event.target.value)} aria-label="Sort library assignments" style={{ padding: '8px 10px', border: '1px solid #dadce0', borderRadius: 8, background: '#fff' }}><option value="title">Sort: Title</option><option value="due">Sort: Due date</option><option value="status">Sort: Status</option></select>
        {SMART_VIEWS.map((view) => (
          <button
            type="button"
            key={view.id}
            onClick={() => setSmartView((current) => (current === view.id ? '' : view.id))}
            style={{
              padding: '7px 12px',
              borderRadius: '999px',
              border: smartView === view.id ? '1px solid #1a73e8' : '1px solid #dadce0',
              background: smartView === view.id ? '#e8f0fe' : '#fff',
              color: smartView === view.id ? '#1a73e8' : '#5f6368',
              fontWeight: 'bold',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            {view.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '18px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {folderPaneCollapsed ? <button type="button" onClick={toggleFolderPane} aria-label="Expand folders" title="Expand folders" style={{ flex: '0 0 44px', width: 44, minHeight: 170, border: '1px solid #e0e3e7', borderRadius: 10, background: '#f8f9fa', color: '#174ea6', fontWeight: 900, cursor: 'pointer', writingMode: 'vertical-rl' }}>› Folders</button> : <div style={{ flex: '0 0 260px', minWidth: '220px', border: '1px solid #e0e3e7', borderRadius: '10px', padding: '12px', background: '#f8f9fa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <strong style={{ fontSize: '13px', color: '#5f6368', textTransform: 'uppercase' }}>Folders</strong>
            <div style={{ display: 'flex', gap: 5 }}><button type="button" onClick={() => setFolderDialog({ mode: 'create', input: '' })} style={{ fontSize: '11px', padding: '3px 8px', border: '1px solid #1a73e8', borderRadius: '6px', background: '#fff', color: '#1a73e8', fontWeight: 'bold', cursor: 'pointer' }}>+ New</button><button type="button" onClick={toggleFolderPane} title="Collapse folders" aria-label="Collapse folders" style={{ width: 28, border: '1px solid #dadce0', borderRadius: 6, background: '#fff', color: '#5f6368' }}>‹</button></div>
          </div>

          <button
            type="button"
            onClick={() => setSelectedFolder('')}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', marginBottom: '2px', border: 'none', borderRadius: '7px', background: selectedFolder === '' ? '#e8f0fe' : 'transparent', color: selectedFolder === '' ? '#1a73e8' : '#3c4043', fontWeight: selectedFolder === '' ? 800 : 600, fontSize: '13px', cursor: 'pointer' }}
          >
            All ({visibleForSmartView.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedFolder(UNCATEGORIZED)}
            onDragOver={(event) => { event.preventDefault(); setDragOverFolder(UNCATEGORIZED); }}
            onDragLeave={() => setDragOverFolder(null)}
            onDrop={(event) => { event.preventDefault(); handleDropOnFolder(''); }}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', marginBottom: '8px', border: dragOverFolder === UNCATEGORIZED ? '2px dashed #188038' : '2px solid transparent', borderRadius: '7px', background: dragOverFolder === UNCATEGORIZED ? '#e6f4ea' : selectedFolder === UNCATEGORIZED ? '#e8f0fe' : 'transparent', color: selectedFolder === UNCATEGORIZED ? '#1a73e8' : '#3c4043', fontWeight: selectedFolder === UNCATEGORIZED ? 800 : 600, fontSize: '13px', cursor: 'pointer' }}
          >
            Uncategorized ({uncategorizedCount})
          </button>

          {topLevelFolders.length === 0 && <p style={{ fontSize: '12px', color: '#80868b', margin: '4px 0' }}>No folders yet. Create one to start organizing assignments.</p>}
          {topLevelFolders.map((path) => (
            <FolderRow
              key={path}
              path={path}
              depth={0}
              folderPaths={folderPaths}
              selectedFolder={selectedFolder}
              onSelect={setSelectedFolder}
              onOpenDialog={setFolderDialog}
              dragOverFolder={dragOverFolder}
              onDragOverFolder={setDragOverFolder}
              onDropOnFolder={handleDropOnFolder}
              expandedPaths={expandedPaths}
              onToggleExpanded={toggleExpanded}
            />
          ))}
        </div>}

        <div style={{ flex: '1 1 320px', minWidth: '260px' }}>
          {filteredAssignments.length === 0 && <p style={{ color: '#80868b' }}>No assignments match this filter.</p>}
          {filteredAssignments.map((assignment) => {
            const lifecycle = getAssignmentLifecycle(assignment, nowValue);
            return (
              <div
                key={assignment.id}
                draggable
                onDragStart={() => setDraggedAssignmentId(assignment.id)}
                onDragEnd={() => setDraggedAssignmentId(null)}
                onClick={() => onNavigateToAssignments({ folder: selectedFolder, smartView })}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  marginBottom: '8px',
                  borderRadius: '8px',
                  border: '1px solid #e0e3e7',
                  background: draggedAssignmentId === assignment.id ? '#f1f3f4' : '#fff',
                  cursor: 'grab',
                }}
              >
                <div>
                  <div style={{ fontWeight: 'bold' }}>{assignment.title}</div>
                  <div style={{ fontSize: '12px', color: '#5f6368' }}>
                    {normalizeFolderPath(assignment.folder) || 'Uncategorized'} &middot; {assignment.archived ? 'archived' : lifecycle.status}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {folderDialog && (
        <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }} style={dialogOverlayStyle}>
          <div role="dialog" aria-modal="true" style={dialogCardStyle}>
            {folderDialog.mode === 'delete' ? (
              <>
                <h3 style={{ marginTop: 0 }}>Delete &ldquo;{getFolderLabel(folderDialog.path)}&rdquo;?</h3>
                <p style={{ color: '#5f6368', fontSize: '13px' }}>
                  Assignments inside this folder become Uncategorized. Subfolders are removed too. This does not delete any assignment.
                </p>
              </>
            ) : (
              <>
                <h3 style={{ marginTop: 0 }}>{folderDialog.mode === 'create' ? 'New folder' : 'Rename folder'}</h3>
                <label style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px' }}>
                  Folder path
                  <input
                    autoFocus
                    type="text"
                    value={folderDialog.input}
                    onChange={(event) => setFolderDialog((current) => ({ ...current, input: event.target.value }))}
                    placeholder="Algebra I/Module 1/Topic 1"
                    style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', border: '1px solid #c9ced6', borderRadius: '7px', boxSizing: 'border-box' }}
                  />
                </label>
                <p style={{ fontSize: '11px', color: '#80868b', margin: '4px 0 0' }}>Use &ldquo;/&rdquo; to nest a subfolder, e.g. Algebra I/Module 1.</p>
              </>
            )}
            {dialogError && <p style={{ color: '#c5221f', fontWeight: 'bold', fontSize: '13px' }}>{dialogError}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
              <button type="button" onClick={closeDialog} style={{ padding: '9px 14px', border: '1px solid #dadce0', borderRadius: '8px', background: '#fff', color: '#5f6368', fontWeight: 'bold', cursor: 'pointer' }}>Cancel</button>
              <button
                type="button"
                onClick={submitDialog}
                style={{ padding: '9px 16px', border: 'none', borderRadius: '8px', background: folderDialog.mode === 'delete' ? '#c5221f' : '#1a73e8', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}
              >
                {folderDialog.mode === 'delete' ? 'Delete' : folderDialog.mode === 'create' ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

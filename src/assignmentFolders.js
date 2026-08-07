// Folders are stored as a flat, sorted list of path strings (e.g.
// "Algebra I/Module 1/Topic 1") in a single settings document — never a
// nested structure in Firestore. These helpers derive a tree view and do
// path/search matching from that flat list, purely client-side.

export const UNCATEGORIZED = 'Uncategorized';

const cleanSegment = (segment) => String(segment ?? '').trim();

export const normalizeFolderPath = (path) => String(path ?? '')
  .split('/')
  .map(cleanSegment)
  .filter(Boolean)
  .join('/');

export const normalizeFolderPaths = (paths) => {
  const cleaned = (Array.isArray(paths) ? paths : [])
    .map(normalizeFolderPath)
    .filter(Boolean);
  return [...new Set(cleaned)].sort((a, b) => a.localeCompare(b));
};

export const getParentFolderPath = (path) => {
  const segments = normalizeFolderPath(path).split('/').filter(Boolean);
  segments.pop();
  return segments.join('/');
};

export const getFolderLabel = (path) => {
  const segments = normalizeFolderPath(path).split('/').filter(Boolean);
  return segments[segments.length - 1] || path;
};

export const getFolderDepth = (path) => normalizeFolderPath(path).split('/').filter(Boolean).length;

// Direct children of `parentPath` among `paths`, including ancestor folders
// implied by deeper paths even if never explicitly created (e.g. creating
// "Algebra I/Module 1/Topic 1" implies "Algebra I" and "Algebra I/Module 1"
// exist as navigable nodes too).
export const getFolderChildren = (paths, parentPath = '') => {
  const normalizedParent = normalizeFolderPath(parentPath);
  const depth = normalizedParent ? getFolderDepth(normalizedParent) : 0;
  const children = new Set();
  (paths || []).forEach((path) => {
    const normalized = normalizeFolderPath(path);
    if (!normalized) return;
    if (normalizedParent && !normalized.startsWith(`${normalizedParent}/`) && normalized !== normalizedParent) return;
    if (!normalizedParent && getFolderDepth(normalized) < 1) return;
    const segments = normalized.split('/');
    if (segments.length <= depth) return;
    children.add(segments.slice(0, depth + 1).join('/'));
  });
  return [...children].sort((a, b) => a.localeCompare(b));
};

export const isFolderOrDescendant = (candidatePath, ancestorPath) => {
  const candidate = normalizeFolderPath(candidatePath);
  const ancestor = normalizeFolderPath(ancestorPath);
  if (!ancestor) return false;
  return candidate === ancestor || candidate.startsWith(`${ancestor}/`);
};

// Renaming a folder must also re-point every path nested under it.
export const renameFolderPath = (path, oldPath, newPath) => {
  const normalized = normalizeFolderPath(path);
  const from = normalizeFolderPath(oldPath);
  const to = normalizeFolderPath(newPath);
  if (normalized === from) return to;
  if (normalized.startsWith(`${from}/`)) return `${to}${normalized.slice(from.length)}`;
  return normalized;
};

export const assignmentFolderMatches = (assignment, folderPath) => {
  if (!folderPath) return true;
  if (folderPath === UNCATEGORIZED) return !normalizeFolderPath(assignment?.folder);
  return isFolderOrDescendant(assignment?.folder, folderPath);
};

export const titleOrFolderMatches = (assignment, searchQuery) => {
  const query = String(searchQuery || '').trim().toLowerCase();
  if (!query) return true;
  const title = String(assignment?.title || '').toLowerCase();
  const folder = String(assignment?.folder || '').toLowerCase();
  return title.includes(query) || folder.includes(query);
};

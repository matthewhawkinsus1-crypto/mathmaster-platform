/*
 * WHERE A SCREEN GETS A COMPONENT FROM.
 *
 * Many wiring tests assert that a component is imported next to where it is
 * rendered: a JSX tag with no import is a runtime ReferenceError that no build
 * or lint step catches here (AGENTS.md, "A call with no import"). They used to
 * match the static import line. Since student push G2, App takes the
 * teacher-only panels from src/app/lazyScreens.js, which loads each on demand,
 * so the import can take either of two shapes, and both mean "this name is
 * that component":
 *
 *   import Name from './components/…/Name.jsx';             (static)
 *   import { …, Name, … } from './app/lazyScreens.js';       (on demand)
 *     with  export const Name = lazy|teacherPanel(() => import('../components/…/Name.jsx'…
 *
 * `importsComponent(sourcePath, name, componentPath)` answers 'static',
 * 'onDemand' or null. Paths are repo-relative ('src/App.jsx').
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (repoPath) => readFileSync(new URL(`../../../${repoPath}`, import.meta.url), 'utf8');
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const relativeSpecifier = (fromFile, toFile) => {
  const relative = path.posix.relative(path.posix.dirname(fromFile), toFile);
  return relative.startsWith('.') ? relative : `./${relative}`;
};
const LAZY_SCREENS = 'src/app/lazyScreens.js';

export const importsComponent = (sourcePath, name, componentPath) => {
  const source = read(sourcePath);
  const component = escape(relativeSpecifier(sourcePath, componentPath));
  const staticImport = new RegExp(`^import (?:${name}\\b[^;]*|[^;]*\\{[^}]*\\b${name}\\b[^}]*\\}) from '${component}';$`, 'm');
  if (staticImport.test(source)) return 'static';
  const screens = escape(relativeSpecifier(sourcePath, LAZY_SCREENS));
  const fromScreens = source.match(new RegExp(`^import \\{([^}]*)\\} from '${screens}';$`, 'm'));
  if (!fromScreens || !fromScreens[1].split(',').map((entry) => entry.trim()).includes(name)) return null;
  const loaded = escape(relativeSpecifier(LAZY_SCREENS, componentPath));
  const entry = new RegExp(`^export const ${name} = (?:lazy|teacherPanel)\\(\\(\\) => import\\('${loaded}'\\)`, 'm');
  return entry.test(read(LAZY_SCREENS)) ? 'onDemand' : null;
};

export default importsComponent;

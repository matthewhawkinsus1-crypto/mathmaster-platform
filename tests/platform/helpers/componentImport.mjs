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
 *     with  export const Name = lazy|teacherPanel|studentScreen|studentPanel(() => import('../components/…/Name.jsx'…
 *
 * (`studentScreen`: a student screen that left the first load in PF01, with
 * its own boundary for code that cannot load; `studentPanel`: one panel of
 * such a screen, Review My Work on the result page, with a boundary of its own.)
 *
 * Since the teacher's first load (second pass), what a teacher's screens draw
 * only once something opens it comes from src/app/teacher/teacherPanels.js,
 * on demand too:
 *
 *   import { …, Name, … } from '…/app/teacher/teacherPanels.js';
 *     with  export const Name = closedPanel|drawnPanel(() => import('../../components/…/Name.jsx')…
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
// Each module that loads components on demand, with the helpers its entries use.
const ON_DEMAND_MODULES = [
  ['src/app/lazyScreens.js', 'lazy|teacherPanel|studentScreen|studentPanel'],
  ['src/app/teacher/teacherPanels.js', 'closedPanel|drawnPanel'],
];

export const importsComponent = (sourcePath, name, componentPath) => {
  const source = read(sourcePath);
  const component = escape(relativeSpecifier(sourcePath, componentPath));
  const staticImport = new RegExp(`^import (?:${name}\\b[^;]*|[^;]*\\{[^}]*\\b${name}\\b[^}]*\\}) from '${component}';$`, 'm');
  if (staticImport.test(source)) return 'static';
  for (const [modulePath, helpers] of ON_DEMAND_MODULES) {
    const from = escape(relativeSpecifier(sourcePath, modulePath));
    const imported = source.match(new RegExp(`^import \\{([^}]*)\\} from '${from}';$`, 'm'));
    if (!imported || !imported[1].split(',').map((entry) => entry.trim()).includes(name)) continue;
    const loaded = escape(relativeSpecifier(modulePath, componentPath));
    const entry = new RegExp(`^export const ${name} = (?:${helpers})\\(\\(\\) => import\\('${loaded}'\\)`, 'm');
    return entry.test(read(modulePath)) ? 'onDemand' : null;
  }
  return null;
};

export default importsComponent;

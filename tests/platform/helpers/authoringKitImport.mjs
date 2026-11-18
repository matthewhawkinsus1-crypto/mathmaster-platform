/*
 * WHERE THE TEACHER'S WORKSPACE GETS ITS AUTHORING CODE FROM.
 *
 * Pre-Flight's model, the compiler and its checks, live corrections, Library
 * reuse, Honors CCMR and Recovery planning left the teacher's first load: the
 * workspace (src/app/teacher/TeacherWorkspace.jsx) loads them on demand as one
 * module, src/app/teacher/teacherAuthoringKit.js (authoringKitLoader.js). So a
 * wiring test that asserted `import { name } from '…/module.js'` next to a call
 * now has a second shape to accept, and both mean "this name is that
 * function": what calls it destructures it from the kit,
 *
 *   const { …, name, … } = await authoringKit();      an action, which waits for it
 *   const { …, name, … } = requireAuthoringKit();     a helper an action calls once it has
 *   const { …, name, … } = assignmentListKit;         the Assignments list, which waits for it
 *
 * and the kit re-exports it from its module:
 *
 *   export { …, name, … } from '<module>';
 *
 * `takesFromAuthoringKit(source, name, modulePath)` answers whether `source`
 * (the workspace, or the region of it that calls `name`) destructures `name`
 * from the kit, and the kit takes it from `modulePath` (repo-relative, with or
 * without its extension, as the kit's specifier has it). A call with no such
 * binding in reach is a runtime ReferenceError no build step catches here
 * (AGENTS.md, "A call with no import"), which is what the static-import
 * assertions guarded.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const KIT = 'src/app/teacher/teacherAuthoringKit.js';
const read = (repoPath) => readFileSync(new URL(`../../../${repoPath}`, import.meta.url), 'utf8');
const names = (list) => list.split(',').map((entry) => entry.trim()).filter(Boolean);
const withoutExtension = (file) => file.replace(/\.(m?js|jsx)$/, '');

/** Names `source` destructures from the authoring kit. */
export const authoringKitNames = (source) => [
  ...String(source).matchAll(/const \{([^}]*)\} = (?:await authoringKit\(\)|requireAuthoringKit\(\)|assignmentListKit);/g),
].flatMap((match) => names(match[1]));

/** Each name the kit re-exports, with the repo path of the module it comes from. */
export const authoringKitExports = () => {
  const kit = read(KIT);
  const exported = new Map();
  for (const match of kit.matchAll(/^export \{([^}]*)\} from '([^']+)';$/gm)) {
    const from = path.posix.normalize(path.posix.join(path.posix.dirname(KIT), match[2]));
    names(match[1]).forEach((name) => exported.set(name, from));
  }
  return exported;
};

export const takesFromAuthoringKit = (source, name, modulePath) => {
  if (!authoringKitNames(source).includes(name)) return false;
  const from = authoringKitExports().get(name);
  return Boolean(from) && withoutExtension(from) === withoutExtension(modulePath);
};

export default takesFromAuthoringKit;

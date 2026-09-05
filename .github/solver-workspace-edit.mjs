import { readFile, writeFile } from 'node:fs/promises';

const replaceOne = (source, before, after, label) => {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing replacement target: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Replacement target is not unique: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
};

const wrapperPath = 'src/MultiRelationAlgebra.jsx';
let wrapper = await readFile(wrapperPath, 'utf8');
wrapper = replaceOne(
  wrapper,
  "export default function MultiRelationAlgebra(props) {\n  const { question = {}, onStateChange } = props;\n",
  "export default function MultiRelationAlgebra(props) {\n  const { question = {}, onStateChange } = props;\n  const denseWorkspace = props.workspaceMode !== 'normal';\n",
  'derive dense workspace signal',
);
wrapper = replaceOne(
  wrapper,
  "      <MultiRelationAlgebraCore {...props} onStateChange={handleStateChange} />\n",
  "      <MultiRelationAlgebraCore {...props} denseWorkspace={denseWorkspace} onStateChange={handleStateChange} />\n",
  'pass dense workspace into core',
);
await writeFile(wrapperPath, wrapper);

const corePath = 'src/MultiRelationAlgebraCore.jsx';
let core = await readFile(corePath, 'utf8');
core = replaceOne(
  core,
  "  disabled = false,\n  draftKey = null,\n}) {\n",
  "  disabled = false,\n  draftKey = null,\n  denseWorkspace = false,\n}) {\n",
  'core dense workspace prop',
);

core = replaceOne(
  core,
  "      {absoluteSplitOpen && (\n        <div\n          style={{\n",
  "      {absoluteSplitOpen && (\n        <div\n          className={`multi-relation-absolute-split${denseWorkspace ? ' multi-relation-absolute-split--dense' : ''}`}\n          style={{\n",
  'dense absolute split container class',
);

core = replaceOne(
  core,
  "            <div\n              style={{\n                width: '100%',\n                display: 'grid',\n                gap: 9,\n",
  "            <div\n              className={`multi-relation-absolute-split-fields${denseWorkspace ? ' multi-relation-absolute-split-fields--dense' : ''}`}\n              style={{\n                width: '100%',\n                display: 'grid',\n                gap: 9,\n",
  'dense absolute split fields class',
);

core = replaceOne(
  core,
  "              <div style={{ color: '#5f6368', fontSize: 11.5, lineHeight: 1.4 }}>\n                Type the right side of both equations. The platform will not create the positive/negative pair for you.\n              </div>\n",
  "              <div className=\"multi-relation-absolute-split-instructions\" style={{ color: '#5f6368', fontSize: 11.5, lineHeight: 1.4 }}>\n                Type the right side of both equations. The platform will not create the positive/negative pair for you.\n              </div>\n",
  'absolute split instructions class',
);

core = replaceOne(
  core,
  "                <div\n                  key={index}\n                  style={{\n                    display: 'grid',\n                    gridTemplateColumns: 'minmax(120px, auto) minmax(160px, 1fr)',\n",
  "                <div\n                  key={index}\n                  className=\"multi-relation-absolute-split-branch\"\n                  style={{\n                    display: 'grid',\n                    gridTemplateColumns: denseWorkspace\n                      ? 'minmax(88px, auto) minmax(0, 1fr)'\n                      : 'minmax(120px, auto) minmax(160px, 1fr)',\n",
  'compact split branch entry columns',
);

core = replaceOne(
  core,
  "              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>\n",
  "              <div className=\"multi-relation-absolute-split-actions\" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>\n",
  'absolute split actions class',
);

core = replaceOne(
  core,
  "      ) : (\n        <div style={{ display: 'grid', gap: 10 }}>\n          {relationState.branches.map((branch, branchIndex) => (\n            <div key={branchIndex}>\n              {branchIndex > 0 && relationState.connective === 'OR' && (\n                <div style={{ textAlign: 'center', fontWeight: 900, color: '#5f6368', marginBottom: 4 }}>\n                  OR\n                </div>\n              )}\n\n              {branchIndex === 1 && relationState.branches.length > 1 && operationDock}\n\n              <div\n                className={`multi-relation-branch ${activeBranch === branchIndex ? 'is-active' : ''}`}\n",
  "      ) : (\n        <div\n          className={`multi-relation-branches${denseWorkspace && relationState.branches.length > 1 ? ' multi-relation-branches--dense' : ''}`}\n          style={{ display: 'grid', gap: 10 }}\n        >\n          {denseWorkspace && relationState.branches.length > 1 && relationState.connective === 'OR' && (\n            <div className=\"multi-relation-dense-connective\" aria-label=\"Branches are connected by OR\">OR</div>\n          )}\n          {denseWorkspace && relationState.branches.length > 1 && operationDock}\n\n          {relationState.branches.map((branch, branchIndex) => (\n            <div key={branchIndex} className=\"multi-relation-branch-slot\">\n              {!denseWorkspace && branchIndex > 0 && relationState.connective === 'OR' && (\n                <div style={{ textAlign: 'center', fontWeight: 900, color: '#5f6368', marginBottom: 4 }}>\n                  OR\n                </div>\n              )}\n\n              {!denseWorkspace && branchIndex === 1 && relationState.branches.length > 1 && operationDock}\n\n              <div\n                className={`multi-relation-branch${denseWorkspace ? ' multi-relation-branch--dense' : ''} ${activeBranch === branchIndex ? 'is-active' : ''}`}\n",
  'dense branch grid and shared operation dock',
);

core = replaceOne(
  core,
  "              {relationState.branches.length > 1 && (\n                <div style={{ textAlign: 'center', fontSize: 11, color: activeBranch === branchIndex ? '#174ea6' : '#6b7280', marginTop: 3 }}>\n                  Branch {branchLabel(branchIndex)}{activeBranch === branchIndex ? ' · active' : ' · click to work here'}\n                </div>\n              )}\n",
  "              {relationState.branches.length > 1 && (\n                <div\n                  className={`multi-relation-branch-status${denseWorkspace ? ' multi-relation-branch-status--dense' : ''}`}\n                  style={{ textAlign: 'center', fontSize: 11, color: activeBranch === branchIndex ? '#174ea6' : '#6b7280', marginTop: 3 }}\n                >\n                  {denseWorkspace\n                    ? <>Branch {branchLabel(branchIndex)}{activeBranch === branchIndex ? ' · active' : ''}</>\n                    : <>Branch {branchLabel(branchIndex)}{activeBranch === branchIndex ? ' · active' : ' · click to work here'}</>}\n                </div>\n              )}\n",
  'compact dense branch status',
);

await writeFile(corePath, core);

const cssPath = 'src/components/common/SolverWorkspaceFrame.css';
let css = await readFile(cssPath, 'utf8');
const denseCss = `
/* Dense multi-relation presentation is workspace-only. The mathematical branch
   tree, active-branch selection, and one shared operation dock are unchanged. */
.multi-relation-branches--dense {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px 12px !important;
  align-items: start;
}

.multi-relation-branches--dense > .multi-relation-dense-connective,
.multi-relation-branches--dense > .multi-relation-operation-dock {
  grid-column: 1 / -1;
}

.multi-relation-dense-connective {
  justify-self: center;
  min-height: 24px;
  padding: 3px 10px;
  border-radius: 999px;
  background: #eef4ff;
  color: #5f6368;
  font-size: 11px;
  font-weight: 950;
  letter-spacing: .04em;
}

.multi-relation-branch-slot {
  min-width: 0;
}

.mathmaster-question-engine[data-solver-workspace-mode="enlarged"] .multi-relation-branches--dense .multi-relation-branch,
.mathmaster-question-engine[data-solver-workspace-mode="focus"] .multi-relation-branches--dense .multi-relation-branch {
  min-height: 112px !important;
  padding: 12px 10px !important;
  overflow-x: auto;
  overflow-y: visible;
  overscroll-behavior-inline: contain;
}

.multi-relation-branch-status--dense {
  min-height: 18px;
  margin-top: 2px !important;
  font-size: 10px !important;
  font-weight: 850;
}

.multi-relation-absolute-split--dense {
  padding: 7px 9px !important;
}

.multi-relation-absolute-split-fields--dense {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 7px 10px !important;
  padding-top: 7px !important;
}

.multi-relation-absolute-split-fields--dense .multi-relation-absolute-split-instructions,
.multi-relation-absolute-split-fields--dense .multi-relation-absolute-split-actions {
  grid-column: 1 / -1;
}

.multi-relation-absolute-split-fields--dense .multi-relation-absolute-split-branch {
  min-width: 0;
  gap: 7px !important;
}
`;
css = replaceOne(
  css,
  ".solver-work-history h3 {\n",
  `${denseCss}\n.solver-work-history h3 {\n`,
  'dense relation workspace CSS',
);

css = replaceOne(
  css,
  "@media (max-width: 780px) {\n",
  "@media (max-width: 780px) {\n  .multi-relation-branches--dense,\n  .multi-relation-absolute-split-fields--dense {\n    grid-template-columns: minmax(0, 1fr);\n  }\n\n  .multi-relation-branches--dense > .multi-relation-dense-connective,\n  .multi-relation-branches--dense > .multi-relation-operation-dock,\n  .multi-relation-absolute-split-fields--dense .multi-relation-absolute-split-instructions,\n  .multi-relation-absolute-split-fields--dense .multi-relation-absolute-split-actions {\n    grid-column: 1;\n  }\n\n",
  'dense relation narrow-screen fallback',
);

await writeFile(cssPath, css);

import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSource, region } from './helpers/sourceContract.mjs';
const ui=componentSource('src/tools/systemsWorkspace/AlgebraicOutcome.jsx');
const parent=componentSource('src/tools/systemsWorkspace/EliminationReductionMode.jsx');
const two=componentSource('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx');
const spatial=componentSource('src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx');
test('terminal classification is a student submission and geometry consumes earned state',()=>{
 assert.match(ui,/onSubmit=\{\(event\) => \{ event.preventDefault\(\); setAttempted\(true\); onClassify\(choice\); \}\}/);
 const model=region(ui,'{earned && showModel ?', '/> : null}', 'earned model');
 assert.match(model,/<ThreePlaneWorkspace/);
 assert.match(model,/earnedResult=\{solution \? \{ type: 'unique', solution \}/);
 assert.doesNotMatch(model,/answerKey|expected/);
 assert.match(parent,/import AlgebraicOutcome from '.\/AlgebraicOutcome.jsx'/);
 assert.match(parent,/onClassify=\{\(choice\) => directOutcome[\s\S]*?classifyEliminationOutcome\(elimination, system, choice\)/);
 const marker=region(spatial,'const solutionMarker =', '// Painter', 'solution marker');
 assert.match(marker,/if \(shownType !== 'unique' \|\| !showResult\) return null/);
 assert.match(marker,/variables.map\(\(name\) => shownSolution\[name\]\)/);
});
test('reduced terminal Undo and invalidation remain in the child until classification',()=>{
 const report=region(parent,'const handleSubsystemSolution =','const subsystemState =', 'child report');
 assert.match(report,/if \(!report\?\.outcome\) setSubsystemClassification\(null\)/);
 const undo=region(parent,'const compositeUndo =','useActiveUndoOwner', 'composite undo');
 assert.match(undo,/subsystemState\?\.outcome && !classified/);
 assert.match(undo,/return subsystemUndoController/);
 const cancel=region(two,'const toggleCancellationRow =','const confirmEliminationCancellation', 'cancellation');
 assert.match(cancel,/cancellationConfirmed: subsystem \? Boolean\(!current.cancelledRows\?\.\[index\] && current.cancelledRows\?\.\[1 - index\]\)/);
});

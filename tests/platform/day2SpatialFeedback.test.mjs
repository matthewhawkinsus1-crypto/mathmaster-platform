import test from 'node:test';
import assert from 'node:assert/strict';
import { parallelPlaneRelationships, spatialMisconceptionFeedback } from '../../src/tools/systemsWorkspace/spatialFeedback.js';
import { linearEquationForm } from '../../src/tools/systemsWorkspace/algebraicSystemsEngine.js';
test('earned inconsistent geometry distinguishes coincident 1/3 from distinct 2',()=>{
 const variables=['x','y','z'];
 const forms=['3x-y-2z=4','6x-2y-4z=11','9x-3y-6z=12'].map(e=>linearEquationForm(e,variables));
 assert.deepEqual(parallelPlaneRelationships(forms,variables),['Planes 1 and 2 are parallel and distinct.','Planes 1 and 3 are coincident.','Planes 2 and 3 are parallel and distinct.']);
});
test('spatial feedback distinguishes misconceptions without supplying classification',()=>{
 const hint=(answer)=>spatialMisconceptionFeedback([{id:'a'}],{a:answer});
 assert.match(hint('Only the first two planes'),/all three/);
 assert.match(hint('All three are coincident'),/constant ratio/);
 assert.match(hint('(0,0,0)'),/fix any coordinate/);
 assert.doesNotMatch(hint('A unique point'),/infinitely many|no solution|dependent|inconsistent/);
});

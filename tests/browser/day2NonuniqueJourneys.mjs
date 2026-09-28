// Run with a Playwright Page attached to visible Chrome and Vite on localhost:5173.
// Uses only rendered controls; no state injection or answer-key reads.
import { chooseVariable, choosePair, scaleEquation, combineRound, subsystemElimination, subsystemScale, subsystemCombine, divideOut, simplifyProducts, subsystemBackSubstitute, backSubstitute, verifyAll, solver } from './day2NonuniqueDriver.mjs';
import { balancedMove, cancelTerm, combineLikeTerms, closeInlineModes, simplifySide, settle } from './stepAlgebraDriver.mjs';
const check=(value,message)=>{if(!value)throw new Error(message);};
const open=async(page,id,run,width)=>{await page.setViewportSize({width,height:width<500?844:768}); await page.goto(`http://localhost:5173/tests/browser/day2Nonunique.html?q=${id}&run=${run}`); await page.getByRole('heading',{name:'3×3 elimination workflow'}).waitFor();};
const locked=async(page)=>check(await page.getByRole('button',{name:'Connect my result to 3D',exact:true}).count()===0,'premature geometry');
const classify=async(page,choice)=>{await page.getByLabel('Classify your algebraic result').selectOption(choice);await page.getByRole('button',{name:'Check my classification',exact:true}).click();};
const model=async(page)=>{await page.getByRole('button',{name:'Connect my result to 3D',exact:true}).click();await page.getByRole('img',{name:'Interactive 3D view of the three planes. Drag to rotate.'}).waitFor();check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow');};
export async function dependentJourney(page,run='dependent') {
 await open(page,'3x3-d2-cw-1',run,1366); await locked(page);
 await chooseVariable(page,'x');await choosePair(page,'Equation 1 and Equation 3');
 await scaleEquation(page,'round1','Equation 1','3',{x:'6',y:'3',z:'-9',constant:'15'},'dependent');
 await page.reload();await page.getByRole('button',{name:'Subtract Equation 3 from Equation 1',exact:true}).waitFor();
 await page.getByRole('button',{name:'↶ Undo',exact:true}).click();
 check(await page.locator('math-field[aria-label="Scaled right side for Equation 1"]').isVisible(),'refresh Undo did not reopen distribution');
 await page.getByRole('button',{name:'Check my scaled terms',exact:true}).click();
 await combineRound(page,'round1','subtract',['Equation 1','Equation 3'],'x',{y:'0',z:'0',constant:'0'},'dependent');
 await locked(page); await choosePair(page,'Equation 1 and Equation 2');
 await scaleEquation(page,'round2','Equation 1','1/2',{x:'1',y:'1/2',z:'-3/2',constant:'5/2'},'dependent');
 await combineRound(page,'round2','subtract',['Equation 1','Equation 2'],'x',{y:'-3/2',z:'5/2',constant:'-9/2'},'dependent');
 await classify(page,'unique');await locked(page);await classify(page,'infinite');await model(page);
 check((await page.locator('.mathmaster-threeplane-viewport').innerText()).includes('Planes 1 and 3 are coincident'),'dependent geometry');
}
export async function inconsistentJourney(page,run='inconsistent') {
 await open(page,'3x3-d2-pr-2',run,390);await locked(page);
 await chooseVariable(page,'x');await choosePair(page,'Equation 1 and Equation 2');
 await scaleEquation(page,'round1','Equation 1','2',{x:'6',y:'-2',z:'-4',constant:'8'},'inconsistent');
 await combineRound(page,'round1','subtract',['Equation 1','Equation 2'],'x',{y:'0',z:'0',constant:'-3'},'inconsistent');
 await locked(page);await classify(page,'none');await model(page);
 const text=await page.locator('.mathmaster-threeplane-viewport').innerText();
 check(text.includes('Planes 1 and 3 are coincident')&&text.includes('Planes 1 and 2 are parallel and distinct'),'inconsistent geometry');
 await page.reload();await page.getByRole('button',{name:'Connect my result to 3D',exact:true}).waitFor();
 await page.getByRole('button',{name:'↶ Undo',exact:true}).click();await locked(page);
 check(await page.getByLabel('Classify your algebraic result').isVisible(),'classification Undo');
}
export async function uniqueJourney(page,run='unique') {
 await open(page,'3x3-d2-cw-3',run,1366);await locked(page);
 await chooseVariable(page,'z');await choosePair(page,'Equation 1 and Equation 2');
 await scaleEquation(page,'round1','Equation 2','2',{x:'4',y:'2',z:'-2',constant:'10'},'unique');
 await combineRound(page,'round1','add',['Equation 1','Equation 2'],'z',{x:'9',y:'5',constant:'12'},'unique');
 await choosePair(page,'Equation 2 and Equation 3');
 await scaleEquation(page,'round2','Equation 2','2',{x:'4',y:'2',z:'-2',constant:'10'},'unique');
 await combineRound(page,'round2','add',['Equation 2','Equation 3'],'z',{x:'5',y:'6',constant:'26'},'unique');
 await subsystemElimination(page,'x','unique');
 await subsystemScale(page,'R₁','5',{x:'45',y:'25',constant:'60'},'unique');
 await subsystemScale(page,'R₂','9',{x:'45',y:'54',constant:'234'},'unique');
 await subsystemCombine(page,'subtract','y','-29','-174');await divideOut(page,'-29','6');await settle(page,1200);
 await subsystemBackSubstitute(page,'6',0,'y');await simplifyProducts(page,solver(page),[[/5.*6/,'30']]);
 await balancedMove(page,solver(page),'Subtract','30');await cancelTerm(page,solver(page),'+ 30');await simplifySide(page,solver(page),'right','-18');await divideOut(page,'9','-2');await settle(page,1200);await locked(page);
 await backSubstitute(page,'E2',['x','y']);await simplifyProducts(page,solver(page),[[/2.*-2/,'-4']]);
 await combineLikeTerms(page,solver(page),'left',[0,1],'2');await closeInlineModes(page,solver(page));
 await balancedMove(page,solver(page),'Subtract','2');await cancelTerm(page,solver(page),'2');await simplifySide(page,solver(page),'right','3');await divideOut(page,'-1','-3');await settle(page,1200);await locked(page);
 await verifyAll(page,'unique',[['2','2'],['5','5'],['16','16']]);await model(page);
 check((await page.locator('.mathmaster-threeplane-viewport').innerText()).includes('(−2, 6, −3)'),'earned unique marker');
}

import React, { useMemo, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import ToolShell, { Panel, ToolGrid, ResultPill, TaskCard, HintPanel } from '../shared/ToolShell';
import CoordinatePlane from '../shared/CoordinatePlane';
import { evaluatePolynomial } from '../shared/toolMath';
import useToolSubmission from '../shared/useToolSubmission';
import { OWN_CHOICES, UNANSWERED } from '../shared/judgmentChoices.js';
import useReportToolWork from '../shared/useReportToolWork.js';
import useFieldUndoHistory from '../shared/useFieldUndoHistory.js';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import polynomialWorkshopGrader from '../../../functions/shared/serverGrading/tools/polynomialWorkshop.mjs';
import {
  POLYNOMIAL_WORKSHOP_DEFAULTS as DEFAULTS,
  addSubtractKey,
  areaModelKey,
  coefficientsFromRoots,
  columnPlainText,
  exactPolynomialLatex,
  exactPolynomialPlainText,
  exactTermLatex,
  graphConnectionTargetEntry,
  longDivisionKey,
  polynomialTermsLatex,
  powerName,
  ratioLatex,
  rationalFeatureMap,
  rationalFeatureTargetValue,
  readWorkingLine,
  syntheticDivisionKey,
  termLatex,
  termPlainText,
  polynomialDegree,
  syntheticAsks,
  syntheticDivisionRoot,
} from './polynomialMath';
import MathInput from '../../MathInput.jsx';
import MathDisplay from '../../MathDisplay.jsx';
import { requiredAnswerToolForSymbol } from '../../platform/interaction/answerEntryTools.js';
import './PolynomialWorkshop.css';
import { polynomialReadoutText } from './polynomialReadout.js';
import { SubmitText, useMethodWithheld } from '../shared/ToolRuntimeContext';
import { SYNTHETIC_TABLE_RETRY, SYNTHETIC_TABLE_WITHHELD, syntheticMissMessage, syntheticTableMissMessage } from './syntheticFeedback.js';

const inputStyle = { width:'100%', padding:9, border:'1px solid var(--mm-tint-border)', borderRadius:8, boxSizing:'border-box' };
const actionStyle = { marginTop:14, padding:'10px 16px', border:0, borderRadius:8, background:'#1a73e8', color:'#fff', fontWeight:800, cursor:'pointer' };
// "x² − 5x + 6", not "1x^2 -5x +6" (TOOL-7).
const polynomialText = (coefficients = []) => polynomialReadoutText(coefficients);

function Feedback({ feedback, success, retry }) {
  if (!feedback) return null;
  return <div style={{marginTop:12}}><ResultPill ok={feedback.isCorrect}>{feedback.isCorrect ? success : retry}</ResultPill></div>;
}

export default function PolynomialWorkshop({ questionData = {}, onAction }) {
  const mode = questionData.mode || 'factorZero';
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);

  if (mode === 'multiplyArea' && writesFactors(questionData)) return <MultiplyFactors questionData={questionData} feedback={feedback} submit={submit} clearFeedback={clearFeedback} onAction={onAction} />;
  if (mode === 'multiplyArea') return <MultiplyArea questionData={questionData} feedback={feedback} submit={submit} clearFeedback={clearFeedback} onAction={onAction} />;
  if (mode === 'addSubtract') return <AddSubtract questionData={questionData} feedback={feedback} submit={submit} clearFeedback={clearFeedback} onAction={onAction} />;
  if (mode === 'factorQuadratic') return <FactorQuadratic questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'division') return <DivisionMode questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'longDivision') return <LongDivision questionData={questionData} feedback={feedback} submit={submit} clearFeedback={clearFeedback} onAction={onAction} />;
  if (mode === 'syntheticDivision') return <SyntheticDivision questionData={questionData} feedback={feedback} submit={submit} clearFeedback={clearFeedback} onAction={onAction} />;
  if (mode === 'graphConnection') return <GraphConnection questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'rationalFeatures') return <RationalFeatures questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'synthetic') return <SyntheticRemainderFactor questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  return <FactorZero questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
}

function FactorZero({ questionData, feedback, submit, onAction }) {
  const coefficients = questionData.coefficients || DEFAULTS.factorZero.coefficients;
  const candidateRoot = Number(questionData.candidateRoot ?? DEFAULTS.factorZero.candidateRoot);
  const [value, setValue] = usePersistentToolState('value', '');
  // Unanswered until chosen (judgmentChoices.js); it opened on "Yes". The
  // shared grader reads unanswered as no answer — never as "no".
  const [factorChoice, setFactorChoice] = usePersistentToolState('factorChoice', UNANSWERED);
  // The verdict comes from the shared grader the server runs; this view only
  // shows it. The same work is reported live so a deadline can finalize it.
  // Universal Undo over these answers (TOOL-2, useFieldUndoHistory.js).
  useFieldUndoHistory({questionData,fields:{value:[value,setValue],factorChoice:[factorChoice,setFactorChoice]}});
  const work={value,factorChoice};
  useReportToolWork(work);
  const check=()=>{
    const result=gradeToolCheck(polynomialWorkshopGrader,questionData,work);
    submit({ isCorrect: result.isCorrect, score: result.score },work,{mode:'factorZero',parts:result.parts});
  };
  return <ToolShell title="Polynomial Workshop" subtitle="Use the Factor Theorem to connect evaluation, zeros, and factors." badge="Algebra II · Factor Theorem">
    <TaskCard question={questionData} task={'Evaluate the polynomial at the given value, then say whether that gives a factor.'} steps={['Substitute the test value into P(x).', 'Simplify to a single number.', 'Decide what that number tells you about the factor.']} />
    <ToolGrid min={320}>
      <Panel title="Evaluate"><p style={{fontSize:'calc(20 * var(--mm-px))',fontWeight:800}}>P(x) = {polynomialText(coefficients)}</p><p>Test x = <strong>{candidateRoot}</strong>.</p><label>P({candidateRoot}) = <input value={value} onChange={e=>setValue(e.target.value)} style={{...inputStyle,width:130,marginLeft:8}}/></label></Panel>
      <Panel title="Interpret"><label>Is (x − {candidateRoot}) a factor?<select value={factorChoice} onChange={e=>setFactorChoice(e.target.value)} style={{...inputStyle,marginTop:6}}><option value={UNANSWERED}>Choose…</option><option value="yes">Yes</option><option value="no">No</option></select></label><button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}><SubmitText>Check connection</SubmitText></button><Feedback feedback={feedback} success="Evaluation and factor conclusion agree." retry="Re-evaluate P(r): a factor occurs exactly when P(r)=0."/><HintPanel hints={['The Factor Theorem links evaluating and factoring: they are the same question asked two ways.', '(x − r) is a factor of P(x) exactly when P(r) = 0.', 'So evaluate P at the candidate. A result of zero means it is a factor; anything else means it is not.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid>
  </ToolShell>;
}

// The expanded polynomial is this mode's graded ANSWER (a coefficient list the
// shared grader reads), not a step in an algebra workspace, so it does not use
// the shared Simplify control (student push Q): that would change what is
// graded. Its heading names the answer; the step text still names the math.
function MultiplyArea({ questionData, feedback, submit, onAction }) {
  const left = questionData.leftBinomial || DEFAULTS.multiplyArea.leftBinomial;
  const right = questionData.rightBinomial || DEFAULTS.multiplyArea.rightBinomial;
  const cellDegrees = [2, 1, 1, 0];
  const [cells, setCells] = usePersistentToolState('cells', ['','','','']);
  const [expanded, setExpanded] = usePersistentToolState('expanded', '');
  const setCell=(index,value)=>setCells((old)=>old.map((v,i)=>i===index?value:v));
  useFieldUndoHistory({questionData,fields:{cells:[cells,setCells],expanded:[expanded,setExpanded]}});
  const work={cells,expanded};
  useReportToolWork(work);
  const check=()=>{
    const result=gradeToolCheck(polynomialWorkshopGrader,questionData,work);
    submit({ isCorrect: result.isCorrect, score: result.score },work,{mode:'multiplyArea',parts:result.parts});
  };
  return <ToolShell title="Polynomial Workshop" subtitle="Build multiplication from an area model instead of memorizing FOIL." badge="Algebra II · Area Model">
    <TaskCard question={questionData} task={'Fill in the area model, then write the expanded polynomial.'} steps={['Multiply each row term by each column term.', 'Each cell already shows the variable part; enter only the signed coefficient for that product.', 'Add the like terms and enter the final coefficients from highest degree down.']} />
    <ToolGrid min={330}>
      <Panel title={`(${left[0]}x ${left[1]>=0?'+':''}${left[1]})(${right[0]}x ${right[1]>=0?'+':''}${right[1]})`}>
        <div style={{display:'grid',gridTemplateColumns:'90px 1fr 1fr',gap:6,alignItems:'stretch'}}>
          <div/><strong style={{padding:8,textAlign:'center'}}>{right[0]}x</strong><strong style={{padding:8,textAlign:'center'}}>{right[1]}</strong>
          <strong style={{padding:8,textAlign:'right'}}>{left[0]}x</strong>{[0,1].map(i=><div key={i} style={{display:'flex',alignItems:'center',gap:5}}><input value={cells[i]} onChange={e=>setCell(i,e.target.value)} style={{...inputStyle,minWidth:0}} placeholder="coefficient" aria-label={`Coefficient of ${cellDegrees[i]===2?'x squared':cellDegrees[i]===1?'x':'constant'} product`}/>{cellDegrees[i]===2?<strong>x²</strong>:cellDegrees[i]===1?<strong>x</strong>:null}</div>)}
          <strong style={{padding:8,textAlign:'right'}}>{left[1]}</strong>{[2,3].map(i=><div key={i} style={{display:'flex',alignItems:'center',gap:5}}><input value={cells[i]} onChange={e=>setCell(i,e.target.value)} style={{...inputStyle,minWidth:0}} placeholder="coefficient" aria-label={`Coefficient of ${cellDegrees[i]===2?'x squared':cellDegrees[i]===1?'x':'constant'} product`}/>{cellDegrees[i]===2?<strong>x²</strong>:cellDegrees[i]===1?<strong>x</strong>:null}</div>)}
        </div>
      </Panel>
      <Panel title="Expanded polynomial"><p style={{color:'var(--mm-text-muted)'}}>Enter coefficients highest degree to constant, separated by commas.</p><input value={expanded} onChange={e=>setExpanded(e.target.value)} style={inputStyle} placeholder="2, -5, -12" aria-label="Expanded polynomial: coefficients from the highest degree to the constant"/><button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}><SubmitText>Check area model</SubmitText></button><Feedback feedback={feedback} success="Every area product and the expanded polynomial are correct." retry="Multiply each row/column pair, then combine the two x-terms."/><HintPanel hints={['An area model is just organised distribution — every cell is one of the products you would get from FOIL.', 'Cells on the same diagonal usually hold the like terms that combine.', 'Enter coefficients highest degree first, and include a 0 for any missing degree.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
    </ToolGrid>
  </ToolShell>;
}

/*
 * POLYNOMIALS WRITTEN AS TEXT (any letters, any size): the area model with
 * `leftFactor` / `rightFactor`, and add & subtract. The student types every
 * term the work makes — each cell's product, each opposite, each column's
 * combined term — and then the answer in simplest form, and the shared grader
 * marks every one of them, so the work on the screen IS the answer: a final
 * answer typed without it earns only its own share.
 */
const writesFactors = (questionData) => typeof questionData.leftFactor === 'string' || typeof questionData.rightFactor === 'string';
// The keys a box needs on a phone keypad (where the keypad is the keyboard):
// the problem's letters and the exponent key. Extra keys, not required
// symbols, so a desktop keypad does not open under every cell.
const keypadKeys = (terms = []) => [...new Set(terms.flatMap((term) => Object.keys(term.powers))), 'xⁿ']
  .map(requiredAnswerToolForSymbol)
  .filter(Boolean);
// A term as a factor in a product: a negative one in parentheses.
const factorLatex = (term) => (term.coefficient < 0 ? `\\left(${termLatex(term)}\\right)` : termLatex(term));
const cardRowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontSize: 'calc(18 * var(--mm-px))' };
const headerStyle = { padding: '6px 4px', textAlign: 'center', fontWeight: 800, fontSize: 'calc(18 * var(--mm-px))', background: 'var(--mm-tint-bg, transparent)', borderRadius: 8 };
const entryAt = (list, index) => (Array.isArray(list) ? list[index] ?? '' : '');
const listWith = (length, list, index, value) => Array.from({ length }, (_, i) => (i === index ? value : entryAt(list, i)));

function MissingProblem({ title }) {
  return <ToolShell title="Polynomial Workshop" subtitle={title} badge="Algebra II · Polynomials"><p>This question is missing its polynomials, so there is nothing to work on yet. Tell your teacher.</p></ToolShell>;
}

function MultiplyFactors({ questionData, feedback, submit, clearFeedback = () => {}, onAction }) {
  const model = useMemo(() => areaModelKey(questionData), [questionData]);
  const width = model ? model.columns.length : 0;
  const size = model ? model.rows.length * width : 0;
  const [terms, setTerms] = usePersistentToolState('terms', []);
  const [product, setProduct] = usePersistentToolState('product', '');
  // An edit clears the verdict and its red cells.
  const setTerm = (index, value) => { clearFeedback(); setTerms((old) => listWith(size, old, index, value)); };
  const setProductText = (value) => { clearFeedback(); setProduct(value); };
  const keys = useMemo(() => (model ? keypadKeys([...model.rows, ...model.columns]) : []), [model]);
  useFieldUndoHistory({questionData,fields:{terms:[terms,setTerms],product:[product,setProduct]}});
  const work={terms,product};
  useReportToolWork(work);
  const check=()=>{
    const result=gradeToolCheck(polynomialWorkshopGrader,questionData,work);
    submit({ isCorrect: result.isCorrect, score: result.score },work,{mode:'multiplyArea',parts:result.parts});
  };
  // The wrong cells are marked on the grid (walkthrough 2026-10-22, Operations CW 7).
  const wrong = wrongPartIds(feedback);
  if (!model) return <MissingProblem title="Multiply polynomials with an area model." />;
  const factors = `\\left(${polynomialTermsLatex(model.rows)}\\right)\\left(${polynomialTermsLatex(model.columns)}\\right)`;
  return <ToolShell title="Polynomial Workshop" subtitle="Multiply every term by every term with an area model." badge="Algebra II · Area Model">
    <TaskCard question={questionData} task={'Fill in every cell of the area model, then write the product in simplest form.'} steps={['Each cell is the term at the start of its row times the term at the top of its column.', 'Type each cell as one term: multiply the numbers and add the exponents of the same letter.', 'Combine the like terms from the cells and type the product in simplest form.']} />
    <ToolGrid min={330}>
      <Panel title="Area model">
        <div style={{fontSize:'calc(20 * var(--mm-px))',fontWeight:800,marginBottom:8}}><MathDisplay value={factors} /></div>
        {/* A grid wider than its panel scrolls inside its own box, never squeezes a cell. */}
        <div style={{overflowX:'auto',paddingBottom:4}}>
        <div role="group" aria-label="Area model" className="mm-area-grid" style={{gridTemplateColumns:`minmax(48px,auto) repeat(${width}, minmax(112px,1fr))`}}>
          <div aria-hidden="true" className="mm-area-head" style={{textAlign:'center',fontWeight:800}}>×</div>
          {model.columns.map((column, c) => <div key={`column-${c}`} className="mm-area-head" style={headerStyle}><MathDisplay value={termLatex(column)} /></div>)}
          {model.rows.map((row, r) => <React.Fragment key={`row-${r}`}>
            <div className="mm-area-head" style={headerStyle}><MathDisplay value={termLatex(row)} /></div>
            {model.columns.map((column, c) => <div key={`cell-${r}-${c}`} className="mm-area-cell"><span className="mm-area-cell-label" aria-hidden="true"><MathDisplay value={`${factorLatex(row)}\\cdot ${factorLatex(column)}`} inline /></span><MathInput value={entryAt(terms, r * width + c)} onChange={(value) => setTerm(r * width + c, value)} inputStatus={statusOf(wrong, `term-${r + 1}-${c + 1}`)} toolProfile="expression" extraKeys={keys} hideToolsToggle compact maxWidth={220} placeholder="term" ariaLabel={`Row ${r + 1}, column ${c + 1}: ${termPlainText(row)} times ${termPlainText(column)}`} /></div>)}
          </React.Fragment>)}
        </div>
        </div>
      </Panel>
      <Panel title="Product in simplest form">
        <p style={{color:'var(--mm-text-muted)',marginTop:0}}>Add up the cells. Combine like terms so each kind of term appears once.</p>
        <MathInput value={product} onChange={setProductText} inputStatus={statusOf(wrong, 'product')} toolProfile="expression" extraKeys={keys} maxWidth={540} placeholder="product" ariaLabel="Product in simplest form" />
        <button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}><SubmitText>Check area model</SubmitText></button>
        <Feedback feedback={feedback} success="Every cell and the product are correct." retry="Check each red cell: multiply the signs and the numbers, and add the exponents of the same letter. Then combine like terms."/>
        <HintPanel hints={['Every term of the first factor multiplies every term of the second — that is what the area model shows: one cell for each pair.', 'Multiply the numbers and keep the letters: a² · 3a = 3a³, because a² · a = a³ (add the exponents).', 'Cells with the same letters and exponents are like terms. Add them to finish, and leave unlike terms separate.']} onHintUsed={() => onAction?.("HINT_USED")} />
      </Panel>
    </ToolGrid>
  </ToolShell>;
}

function AddSubtract({ questionData, feedback, submit, clearFeedback = () => {}, onAction }) {
  const model = useMemo(() => addSubtractKey(questionData), [questionData]);
  const count = model ? model.columns.length : 0;
  const subtracting = model?.operation === 'subtract';
  const [opposites, setOpposites] = usePersistentToolState('opposites', []);
  const [sums, setSums] = usePersistentToolState('sums', []);
  const [answer, setAnswer] = usePersistentToolState('result', '');
  // An edit clears the verdict, and with it the red cells (as the division views do).
  const setOpposite = (index, value) => { clearFeedback(); setOpposites((old) => listWith(count, old, index, value)); };
  const setSum = (index, value) => { clearFeedback(); setSums((old) => listWith(count, old, index, value)); };
  const setResult = (value) => { clearFeedback(); setAnswer(value); };
  const keys = useMemo(() => (model ? keypadKeys([...model.first, ...model.second]) : []), [model]);
  useFieldUndoHistory({questionData,fields:{opposites:[opposites,setOpposites],sums:[sums,setSums],result:[answer,setAnswer]}});
  const work={opposites,sums,result:answer};
  useReportToolWork(work);
  const check=()=>{
    const result=gradeToolCheck(polynomialWorkshopGrader,questionData,work);
    submit({ isCorrect: result.isCorrect, score: result.score },work,{mode:'addSubtract',parts:result.parts});
  };
  // The cells the check marked wrong are marked on the board: every cell kept
  // its blue border, and the student mapped names from "Focus on" text
  // (walkthrough 2026-10-22, Operations on Polynomials CW 4, CW 5).
  const wrong = wrongPartIds(feedback);
  if (!model) return <MissingProblem title="Add and subtract polynomials." />;
  const problem = `\\left(${polynomialTermsLatex(model.first)}\\right)${subtracting ? '-' : '+'}\\left(${polynomialTermsLatex(model.second)}\\right)`;
  const steps = subtracting
    ? ['Subtracting a polynomial adds its opposite: write the opposite of EVERY term of the second polynomial, not just the first.', 'Each column holds one kind of term. Combine the like terms in each column — type 0 when they cancel.', 'Write the result in simplest form.']
    : ['Each column holds one kind of term, lined up from both polynomials.', 'Combine the like terms in each column — type 0 when they cancel.', 'Write the result in simplest form.'];
  return <ToolShell title="Polynomial Workshop" subtitle={subtracting ? 'Subtract by adding the opposite of every term, then combine like terms.' : 'Line up like terms, then combine them.'} badge={subtracting ? 'Algebra II · Subtract Polynomials' : 'Algebra II · Add Polynomials'}>
    <TaskCard question={questionData} task={subtracting ? 'Write the opposite of each term you subtract, combine each column, then write the result.' : 'Combine each column of like terms, then write the result.'} steps={steps} />
    <Panel title="Line up like terms">
      {/* The problem is one line of math that cannot wrap: on a 390px phone it
          was 436–480px and widened the whole page, which clips, cutting off
          the task, the subtracted polynomial and the second column
          (walkthrough 2026-10-22, Operations PR 6 and DOL 1). It scrolls in
          its own box instead, and the columns may shrink to fit. */}
      <div data-addsubtract-problem="" style={{fontSize:'calc(20 * var(--mm-px))',fontWeight:800,marginBottom:10,maxWidth:'100%',overflowX:'auto',overflowY:'hidden'}}><MathDisplay value={problem} /></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:10,minWidth:0}}>
        {model.columns.map((column, index) => {
          const name = columnPlainText(column);
          const firstTerm = model.firstByColumn[index];
          const secondTerm = model.secondByColumn[index];
          return <div key={`column-${index}`} role="group" aria-label={`${name} column`} style={{border:'1px solid var(--mm-tint-border)',borderRadius:10,padding:10,display:'grid',gap:6,alignContent:'start',minWidth:0}}>
            <strong style={{textAlign:'center'}}>{name === 'constant' ? 'Constants' : <>{name} terms</>}</strong>
            <div style={cardRowStyle}><span>First</span>{firstTerm ? <MathDisplay value={termLatex(firstTerm)} inline /> : <span>none</span>}</div>
            <div style={cardRowStyle}><span>Second</span>{secondTerm ? <MathDisplay value={termLatex(secondTerm)} inline /> : <span>none</span>}</div>
            {/* A placeholder is one short word: on a phone a column's box is
                about 90px beside its √x button, and "opposite" and "term or 0"
                showed as "opposit…" and "term or…" (walkthrough 2026-10-22,
                Operations, phone; TL31). The label above each box says what
                goes in it, and "or 0" moved into the Combined label. */}
            {subtracting && secondTerm ? <label style={{display:'grid',gap:4,fontWeight:700}}>Its opposite<MathInput value={entryAt(opposites, index)} onChange={(value) => setOpposite(index, value)} inputStatus={statusOf(wrong, `opposite-${index + 1}`)} toolProfile="expression" extraKeys={keys} hideToolsToggle compact maxWidth={220} placeholder="term" ariaLabel={`Opposite of ${termPlainText(secondTerm)}`} /></label> : null}
            <label style={{display:'grid',gap:4,fontWeight:700}}><span>Combined <span style={{fontWeight:400}}>(0 if they cancel)</span></span><MathInput value={entryAt(sums, index)} onChange={(value) => setSum(index, value)} inputStatus={statusOf(wrong, `sum-${index + 1}`)} toolProfile="expression" extraKeys={keys} hideToolsToggle compact maxWidth={220} placeholder="term" ariaLabel={`Combined ${name} column`} /></label>
          </div>;
        })}
      </div>
    </Panel>
    <Panel title="Result in simplest form">
      <MathInput value={answer} onChange={setResult} inputStatus={statusOf(wrong, 'result')} toolProfile="expression" extraKeys={keys} maxWidth={540} placeholder="result" ariaLabel="Result in simplest form" />
      <button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}><SubmitText>Check my work</SubmitText></button>
      <Feedback feedback={feedback} success="Every step and the result are correct." retry={subtracting ? 'Check the sign of EVERY opposite, then combine each column.' : 'Combine only like terms: same letters, same exponents.'}/>
      <HintPanel hints={subtracting
        ? ['Subtracting a polynomial is adding its opposite. The minus sign in front of the parentheses changes the sign of every term inside.', 'The opposite of a³ is −a³, the opposite of −3a is +3a, and the opposite of 2 is −2.', 'Like terms have the same letters with the same exponents. Add their numbers; a column whose terms cancel combines to 0.']
        : ['Adding polynomials means combining like terms.', 'Like terms have the same letters with the same exponents: 4x² and −2x² are like terms; 4x² and −9x are not.', 'Add the numbers in each column and keep the letters. A column whose terms cancel combines to 0.']} onHintUsed={() => onAction?.("HINT_USED")} />
    </Panel>
  </ToolShell>;
}

function FactorQuadratic({ questionData, feedback, submit, onAction }) {
  const coefficients = questionData.coefficients || DEFAULTS.factorQuadratic.coefficients;
  const [p, setP] = usePersistentToolState('p', ''); const [q, setQ] = usePersistentToolState('q', '');
  useFieldUndoHistory({questionData,fields:{p:[p,setP],q:[q,setQ]}});
  const work={p,q};
  useReportToolWork(work);
  const check=()=>{
    const result=gradeToolCheck(polynomialWorkshopGrader,questionData,work);
    submit({ isCorrect: result.isCorrect, score: result.score },work,{mode:'factorQuadratic',parts:result.parts});
  };
  return <ToolShell title="Polynomial Workshop" subtitle="Factor a monic quadratic by reasoning about sum and product." badge="Algebra II · Factoring">
    <TaskCard question={questionData} task={'Find the two numbers p and q that factor this quadratic.'} steps={['You need two numbers that multiply to the constant term.', 'The same two numbers must add to the x coefficient.', 'Enter them as p and q in either order.']} />
    <ToolGrid min={320}><Panel title="Target polynomial"><p style={{fontSize:'calc(22 * var(--mm-px))',fontWeight:900}}>P(x) = {polynomialText(coefficients)}</p><p>Find p and q so P(x) = (x + p)(x + q).</p></Panel><Panel title="Factor pair"><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><label>p<input value={p} onChange={e=>setP(e.target.value)} style={inputStyle}/></label><label>q<input value={q} onChange={e=>setQ(e.target.value)} style={inputStyle}/></label></div><button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}><SubmitText>Check factors</SubmitText></button><Feedback feedback={feedback} success="The factors multiply back to the original quadratic." retry="Your two numbers must add to the x coefficient and multiply to the constant."/><HintPanel hints={['For x² + bx + c, you are looking for two numbers whose product is c and whose sum is b.', 'List the factor pairs of the constant term first, then test which pair adds correctly.', 'If the constant is negative, one number is positive and the other is negative.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel></ToolGrid>
  </ToolShell>;
}

function DivisionMode({ questionData, feedback, submit, onAction }) {
  // This screen asks for coefficient lists ("1, 0, 0, -8"), so a zero term is
  // shown: x³ + 0x² + 0x − 8, not x³ − 8 (review N7). Confirmed as built in
  // TL31 (the open question of W5-5 / Math Display decision 6 was whether to
  // hide them, as the other modes do): every list the student types here
  // needs a 0 for each missing power, and the dividend is shown the way such
  // a list is written.
  const polynomialText = (coefficients = []) => polynomialReadoutText(coefficients, { keepZeros: true });
  const dividend = questionData.dividend || DEFAULTS.division.dividend;
  const divisor = questionData.divisor || DEFAULTS.division.divisor;
  const [quotient, setQuotient] = usePersistentToolState('quotient', ''); const [remainder, setRemainder] = usePersistentToolState('remainder', '');
  useFieldUndoHistory({questionData,fields:{quotient:[quotient,setQuotient],remainder:[remainder,setRemainder]}});
  const work={quotient,remainder};
  useReportToolWork(work);
  const check=()=>{
    const result=gradeToolCheck(polynomialWorkshopGrader,questionData,work);
    submit({ isCorrect: result.isCorrect, score: result.score },work,{mode:'division',parts:result.parts});
  };
  return <ToolShell title="Polynomial Workshop" subtitle="Divide polynomials and verify quotient + remainder structure." badge="Algebra II · Division">
    <TaskCard question={questionData} task={'Divide the polynomials and give the quotient and remainder.'} steps={['Divide the leading terms to get the first quotient term.', 'Multiply back, subtract, and bring down the next term.', 'Repeat until the remainder has a lower degree than the divisor.']} /><ToolGrid min={320}><Panel title="Divide"><p style={{fontWeight:800}}>{polynomialText(dividend)}</p><p>÷</p><p style={{fontWeight:800}}>{polynomialText(divisor)}</p><p style={{color:'var(--mm-text-muted)'}}>Enter coefficient lists from highest degree downward.</p></Panel><Panel title="Your result"><label>Quotient coefficients<input value={quotient} onChange={e=>setQuotient(e.target.value)} style={inputStyle} placeholder="1, -2, -11"/></label><label style={{display:'block',marginTop:10}}>Remainder coefficients<input value={remainder} onChange={e=>setRemainder(e.target.value)} style={inputStyle} placeholder="-12"/></label><button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}><SubmitText>Check division</SubmitText></button><Feedback feedback={feedback} success="Quotient and remainder reconstruct the dividend." retry="Use leading terms first, subtract, then bring down the next term."/><HintPanel hints={['Polynomial long division works exactly like numeric long division — leading term first, then subtract.', 'After subtracting, the leading term should cancel. If it does not, the multiplication step was wrong.', 'Stop when what is left has a lower degree than the divisor; that leftover is the remainder.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel></ToolGrid></ToolShell>;
}

/*
 * DIVIDING POLYNOMIALS WRITTEN AS TEXT: long division and synthetic division
 * (polynomialMath.mjs longDivisionKey / syntheticDivisionKey). The student
 * types every step the method makes — each round's term, product and line, or
 * every number of the synthetic table — and the shared grader marks each one,
 * so the work on the screen is the answer: a quotient and remainder copied
 * from a solver earn only their own share. A visible verdict marks the boxes
 * that are wrong (none on an exit ticket, where no verdict is shown), and any
 * edit clears it.
 */
const wrongPartIds = (feedback) => new Set(feedback && !feedback.isCorrect
  ? (feedback.metadata?.parts || []).filter((part) => !part.isCorrect).map((part) => part.id)
  : []);
const statusOf = (wrong, id) => (wrong.has(id) ? 'incorrect' : 'neutral');
const letterKeys = (letter) => keypadKeys([{ powers: { [letter]: 1 } }]);
const entriesOf = (coefficients) => coefficients.map((coefficient, index) => ({ coefficient, power: coefficients.length - 1 - index }));
// A typed coefficient shown as a fraction when it is one (1/3, not 0.3333).
const niceNumberLatex = (value) => {
  const magnitude = Math.abs(value);
  for (let d = 1; d <= 1000; d += 1) {
    const n = Math.round(magnitude * d);
    if (Math.abs(magnitude * d - n) < 1e-7) return d === 1 ? `${n}` : `\\frac{${n}}{${d}}`;
  }
  return String(Number(magnitude.toPrecision(6)));
};
// One typed term, signed, as LaTeX: −3x², +5, +\frac{1}{3}a.
const typedTermLatex = (term, letter, first) => {
  const power = term.powers[letter] || 0;
  const letters = power === 0 ? '' : power === 1 ? letter : `${letter}^{${power}}`;
  const magnitude = Math.abs(term.coefficient);
  const number = letters && Math.abs(magnitude - 1) < 1e-12 ? '' : niceNumberLatex(magnitude);
  const sign = term.coefficient < 0 ? '-' : first ? '' : '+';
  return `${sign}${number}${letters}`;
};
// quotient + remainder / divisor, as far as the student has typed it.
const answerLatex = (quotient, remainder, divisorLatex) => {
  const q = String(quotient ?? '').trim();
  const r = String(remainder ?? '').trim().replace(/[−–]/g, '-');
  if (!q) return '';
  if (!r || r === '0') return q;
  const simpleNegative = r.startsWith('-') && !/[+-]/.test(r.slice(1));
  const numerator = /^-?\d+\/\d+$/.test(r) ? `\\frac{${r.replace('-', '').split('/')[0]}}{${r.split('/')[1]}}` : (simpleNegative ? r.slice(1) : r);
  return `${q}${simpleNegative ? '-' : '+'}\\frac{${numerator}}{${divisorLatex}}`;
};

/*
 * The long division as it looks on paper, built live from what the student
 * has typed: the quotient above the bracket, the dividend with a 0 holding
 * every missing power, and each round's product (to subtract) and line, every
 * term in its power's column. It shows the work; it grades nothing.
 */
function LongDivisionLayout({ divisionKey, terms, products, differences, showPlaceholders = true }) {
  const { letter, dividend, divisor } = divisionKey;
  const n = dividend.degree;
  const columnOf = (power) => n - power + 2;
  const powerOf = (term) => term.powers[letter] || 0;
  // A typed line's terms, highest power first; null while it is not a line in this letter.
  const typedTerms = (value) => {
    const read = readWorkingLine(value);
    if (!read || !read.length) return null;
    if (read.some((term) => Object.keys(term.powers).some((name) => name !== letter) || powerOf(term) > n)) return null;
    return [...read].sort((a, b) => powerOf(b) - powerOf(a));
  };
  const cellsOf = (list) => list.map((term, index) => ({ power: powerOf(term), latex: typedTermLatex(term, letter, index === 0) }));
  const quotientTerms = terms.map(typedTerms).filter((list) => list && list.length === 1).map(([term]) => term);
  const quotientCells = cellsOf([...quotientTerms].sort((a, b) => powerOf(b) - powerOf(a)));
  const rows = [];
  divisionKey.rounds.forEach((round, index) => {
    const product = typedTerms(products[index]);
    const left = typedTerms(differences[index]);
    if (product) rows.push({ kind: 'product', cells: cellsOf(product), key: `p${index}` });
    if (left) rows.push({ kind: 'left', cells: cellsOf(left), key: `l${index}` });
  });
  const lettersOf = (power) => (power === 0 ? '' : power === 1 ? letter : `${letter}^{${power}}`);
  // A missing power's column stays, empty, where the method is withheld: the
  // bracket wrote "+0x" for the student on the exit ticket (walkthrough
  // 2026-10-22, Dividing Polynomials CW 5 and DOL 2), so it could not show
  // whether they know to hold the place.
  const dividendCells = entriesOf(dividend.coefficients).filter((entry) => showPlaceholders || entry.coefficient.n !== 0).map((entry, index) => {
    const magnitude = { n: Math.abs(entry.coefficient.n), d: entry.coefficient.d };
    const body = entry.coefficient.n === 0 ? `0${lettersOf(entry.power)}` : exactTermLatex({ coefficient: magnitude, power: entry.power }, letter);
    const sign = entry.coefficient.n < 0 ? '-' : index === 0 ? '' : '+';
    return { power: entry.power, latex: `${sign}${body}` };
  });
  const divisorLatex = exactPolynomialLatex(entriesOf(divisor.coefficients), letter);
  const label = `Your long division so far: ${exactPolynomialPlainText(entriesOf(dividend.coefficients), letter)} divided by ${exactPolynomialPlainText(entriesOf(divisor.coefficients), letter)}`;
  return (
    <div className="mm-long-division-scroll">
      <div className="mm-long-division" role="img" aria-label={label} style={{ gridTemplateColumns: `auto repeat(${n + 1}, minmax(var(--mm-ld-column, 2.8em), auto))` }}>
        {quotientCells.map((cell) => <span key={`q${cell.power}`} className="mm-ld-cell mm-ld-quotient" style={{ gridRow: 1, gridColumn: columnOf(cell.power) }}><MathDisplay value={cell.latex} inline /></span>)}
        <span className="mm-ld-divisor" style={{ gridRow: 2, gridColumn: 1 }}><MathDisplay value={divisorLatex} inline /></span>
        {dividendCells.map((cell) => <span key={`d${cell.power}`} className="mm-ld-cell mm-ld-dividend" style={{ gridRow: 2, gridColumn: columnOf(cell.power) }}><MathDisplay value={cell.latex} inline /></span>)}
        {rows.map((row, rowIndex) => {
          const highest = row.cells[0].power;
          const lowest = row.cells[row.cells.length - 1].power;
          const gridRow = rowIndex + 3;
          return <React.Fragment key={row.key}>
            {row.kind === 'product' ? <span aria-hidden="true" className="mm-ld-minus" style={{ gridRow, gridColumn: columnOf(highest) - 1 }}>−</span> : null}
            {row.cells.map((cell) => <span key={`${row.key}-${cell.power}`} className={`mm-ld-cell ${row.kind === 'product' ? 'mm-ld-product' : 'mm-ld-left'}`} style={{ gridRow, gridColumn: columnOf(cell.power) }}><MathDisplay value={cell.latex} inline /></span>)}
            {row.kind === 'product' ? <span aria-hidden="true" className="mm-ld-rule" style={{ gridRow, gridColumn: `${columnOf(highest)} / ${columnOf(lowest) + 1}` }} /> : null}
          </React.Fragment>;
        })}
      </div>
    </div>
  );
}

function LongDivision({ questionData, feedback, submit, clearFeedback, onAction }) {
  const key = useMemo(() => longDivisionKey(questionData), [questionData]);
  const count = key ? key.rounds.length : 0;
  const [terms, setTerms] = usePersistentToolState('terms', []);
  const [products, setProducts] = usePersistentToolState('products', []);
  const [differences, setDifferences] = usePersistentToolState('differences', []);
  const [quotient, setQuotient] = usePersistentToolState('quotient', '');
  const [remainder, setRemainder] = usePersistentToolState('remainder', '');
  const at = (setter) => (index, value) => { clearFeedback(); setter((old) => listWith(count, old, index, value)); };
  const setTerm = at(setTerms);
  const setProduct = at(setProducts);
  const setDifference = at(setDifferences);
  const keys = useMemo(() => (key ? letterKeys(key.letter) : []), [key]);
  useFieldUndoHistory({questionData,fields:{terms:[terms,setTerms],products:[products,setProducts],differences:[differences,setDifferences],quotient:[quotient,setQuotient],remainder:[remainder,setRemainder]}});
  const work={terms,products,differences,quotient,remainder};
  useReportToolWork(work);
  // On an exit ticket, quiz or test the 0 placeholder is the student's to write.
  const methodWithheld = useMethodWithheld();
  const check=()=>{
    const result=gradeToolCheck(polynomialWorkshopGrader,questionData,work);
    submit({ isCorrect: result.isCorrect, score: result.score },work,{mode:'longDivision',parts:result.parts});
  };
  const wrong = wrongPartIds(feedback);
  if (!key) return <MissingProblem title="Divide polynomials by long division." />;
  const { letter } = key;
  const dividendLatex = exactPolynomialLatex(entriesOf(key.dividend.coefficients), letter);
  const divisorLatex = exactPolynomialLatex(entriesOf(key.divisor.coefficients), letter);
  const leadLatex = exactTermLatex({ coefficient: key.divisor.coefficients[0], power: key.divisor.degree }, letter);
  const hasGap = key.dividend.coefficients.some((coefficient) => coefficient.n === 0);
  const preview = answerLatex(quotient, remainder, divisorLatex);
  return <ToolShell title="Polynomial Workshop" subtitle="Long division: divide, multiply back, subtract, bring down — then repeat." badge="Algebra II · Long Division">
    <TaskCard question={questionData} task={'Divide by long division. Each round: divide the leading terms, multiply back, subtract and bring down the next term. Then write the quotient and the remainder.'} steps={[
      'Write the dividend in descending powers, with a 0 holding the place of any missing power.',
      'Divide the leading term of what is left by the divisor’s leading term. That is the next term of the quotient.',
      'Multiply that term by the whole divisor, subtract the product, and bring down the next term.',
      'Stop when what is left has a lower degree than the divisor: that is the remainder.',
    ]} />
    <Panel title="Long division">
      <div className="mm-division-problem"><MathDisplay value={`\\left(${dividendLatex}\\right)\\div\\left(${divisorLatex}\\right)`} /></div>
      {hasGap && !methodWithheld ? <p style={{margin:'0 0 8px',color:'var(--mm-text-muted)'}}>A 0 holds the place of each missing power, as on paper.</p> : null}
      <LongDivisionLayout divisionKey={key} terms={terms} products={products} differences={differences} showPlaceholders={!methodWithheld} />
    </Panel>
    <div className="mm-division-rounds">
      {key.rounds.map((round, index) => {
        const name = `Round ${index + 1}`;
        return <div key={name} role="group" aria-label={name} className="mm-division-round">
          <strong>{name}</strong>
          <label className="mm-division-step"><span>Divide: the leading term of {index === 0 ? 'the dividend' : 'the last line'} ÷ <MathDisplay value={leadLatex} inline /></span>
            <MathInput value={entryAt(terms, index)} onChange={(value) => setTerm(index, value)} toolProfile="expression" extraKeys={keys} hideToolsToggle compact maxWidth={220} placeholder="next term" ariaLabel={`${name}: divide the leading terms`} inputStatus={statusOf(wrong, `round-${index + 1}-term`)} /></label>
          <label className="mm-division-step"><span>Multiply back: that term times <MathDisplay value={`\\left(${divisorLatex}\\right)`} inline /></span>
            <MathInput value={entryAt(products, index)} onChange={(value) => setProduct(index, value)} toolProfile="expression" extraKeys={keys} hideToolsToggle compact maxWidth={320} placeholder="product" ariaLabel={`${name}: multiply back`} inputStatus={statusOf(wrong, `round-${index + 1}-product`)} /></label>
          <label className="mm-division-step"><span>{index === count - 1 ? 'Subtract (bring down anything still left)' : 'Subtract, then bring down the next term'}</span>
            <MathInput value={entryAt(differences, index)} onChange={(value) => setDifference(index, value)} toolProfile="expression" extraKeys={keys} hideToolsToggle compact maxWidth={320} placeholder="what is left" ariaLabel={`${name}: subtract and bring down`} inputStatus={statusOf(wrong, `round-${index + 1}-difference`)} /></label>
        </div>;
      })}
    </div>
    <Panel title="Quotient and remainder">
      <div style={{display:'grid',gap:10}}>
        <label style={{display:'grid',gap:4,fontWeight:700}}>Quotient (simplest form)<MathInput value={quotient} onChange={(value) => { clearFeedback(); setQuotient(value); }} toolProfile="expression" extraKeys={keys} maxWidth={420} placeholder="quotient" ariaLabel="Quotient in simplest form" inputStatus={statusOf(wrong, 'quotient')} /></label>
        <label style={{display:'grid',gap:4,fontWeight:700}}>Remainder (0 if it divides evenly)<MathInput value={remainder} onChange={(value) => { clearFeedback(); setRemainder(value); }} toolProfile="expression" extraKeys={keys} maxWidth={320} placeholder="remainder" ariaLabel="Remainder in simplest form" inputStatus={statusOf(wrong, 'remainder')} /></label>
        {preview ? <div className="mm-division-answer"><span>Your answer:</span> <MathDisplay value={preview} inline /></div> : null}
      </div>
      <button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}><SubmitText>Check my division</SubmitText></button>
      <Feedback feedback={feedback} success="Every round, the quotient and the remainder are right." retry="The boxes marked in red are not right yet. Start with the first one: every later step depends on it."/>
      <HintPanel hints={[
        'Each round only looks at the leading terms: what is left’s first term ÷ the divisor’s first term gives the next quotient term.',
        'Multiply that term by EVERY term of the divisor, then subtract the whole product — subtracting a negative term adds.',
        'After subtracting, the leading term must cancel. If it does not, the quotient term or the product is off.',
      ]} onHintUsed={() => onAction?.("HINT_USED")} />
    </Panel>
  </ToolShell>;
}

function SyntheticDivision({ questionData, feedback, submit, clearFeedback, onAction }) {
  const key = useMemo(() => syntheticDivisionKey(questionData), [questionData]);
  const columns = key ? key.coefficients.length : 0;
  const [r, setR] = usePersistentToolState('r', '');
  const [coefficients, setCoefficients] = usePersistentToolState('coefficients', []);
  const [products, setProducts] = usePersistentToolState('products', []);
  const [sums, setSums] = usePersistentToolState('sums', []);
  const [quotient, setQuotient] = usePersistentToolState('quotient', '');
  const [remainder, setRemainder] = usePersistentToolState('remainder', '');
  const at = (setter, length) => (index, value) => { clearFeedback(); setter((old) => listWith(length, old, index, value)); };
  const setCoefficient = at(setCoefficients, columns);
  const setProduct = at(setProducts, Math.max(0, columns - 1));
  const setSum = at(setSums, columns);
  const keys = useMemo(() => (key ? letterKeys(key.letter) : []), [key]);
  useFieldUndoHistory({questionData,fields:{r:[r,setR],coefficients:[coefficients,setCoefficients],products:[products,setProducts],sums:[sums,setSums],quotient:[quotient,setQuotient],remainder:[remainder,setRemainder]}});
  const scaled = Boolean(key?.scaled);
  // A divisor ax + b with a = 1 has no separate remainder box: the table's
  // last number is the remainder.
  const work = scaled ? {r,coefficients,products,sums,quotient,remainder} : {r,coefficients,products,sums,quotient};
  useReportToolWork(work);
  const check=()=>{
    const result=gradeToolCheck(polynomialWorkshopGrader,questionData,work);
    submit({ isCorrect: result.isCorrect, score: result.score },work,{mode:'syntheticDivision',parts:result.parts});
  };
  const wrong = wrongPartIds(feedback);
  if (!key) return <MissingProblem title="Divide polynomials by synthetic division." />;
  const { letter } = key;
  const n = key.dividend.degree;
  const dividendLatex = exactPolynomialLatex(entriesOf(key.dividend.coefficients), letter);
  const divisorLatex = exactPolynomialLatex(entriesOf(key.divisor.coefficients), letter);
  const leading = key.leading;
  const reducedDivisor = `${letter} - r`;
  const lastSum = entryAt(sums, n);
  const preview = scaled
    ? answerLatex(quotient, remainder, divisorLatex)
    : answerLatex(quotient, lastSum, divisorLatex);
  const cell = (id, value, onChange, label, extra = {}) => <input
    type="text" inputMode="text" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
    className={`mm-synthetic-input${wrong.has(id) ? ' mm-synthetic-wrong' : ''}`}
    value={value ?? ''} onChange={(event) => onChange(event.target.value)}
    aria-label={label} aria-invalid={wrong.has(id) || undefined} {...extra} />;
  return <ToolShell title="Polynomial Workshop" subtitle="Synthetic division: bring down, multiply by r, add — column by column." badge="Algebra II · Synthetic Division">
    <TaskCard question={questionData} task={'Divide by synthetic division. Fill in r and every number of the table, then write the quotient.'} steps={[
      scaled ? 'The divisor’s leading coefficient is not 1, so first divide the dividend and the divisor by it. Then the divisor is x − r.' : 'Write the divisor as x − r to find r: x + 3 is x − (−3), so r = −3.',
      'Write the dividend’s coefficients in descending powers, with a 0 for every missing power.',
      'Bring down the first coefficient. Multiply it by r, write the product under the next coefficient, and add. Repeat to the last column.',
      'The bottom row (except the last number) gives the quotient, one degree lower than the dividend. The last number is the remainder.',
    ]} />
    <Panel title="Synthetic division">
      <div className="mm-division-problem"><MathDisplay value={`\\left(${dividendLatex}\\right)\\div\\left(${divisorLatex}\\right)`} /></div>
      {scaled ? <p style={{margin:'0 0 8px'}}>The leading coefficient of <MathDisplay value={divisorLatex} inline /> is <MathDisplay value={ratioLatex(leading)} inline />: divide every coefficient of the dividend by <MathDisplay value={ratioLatex(leading)} inline /> before it goes in the table, and write the divisor as <MathDisplay value={reducedDivisor} inline />.</p> : null}
      <div className="mm-synthetic-scroll">
        <div className="mm-synthetic" role="group" aria-label="Synthetic division table" style={{gridTemplateColumns:`minmax(var(--mm-synthetic-column), var(--mm-synthetic-r-width, auto)) repeat(${columns}, minmax(var(--mm-synthetic-column), 1fr))`}}>
          <span aria-hidden="true" className="mm-synthetic-head" style={{gridRow:1,gridColumn:1}}>r</span>
          {key.coefficients.map((_, index) => <span key={`h${index}`} aria-hidden="true" className="mm-synthetic-head" style={{gridRow:1,gridColumn:index + 2}}><MathDisplay value={n - index === 0 ? '1' : n - index === 1 ? letter : `${letter}^{${n - index}}`} inline /></span>)}
          <span aria-hidden="true" className="mm-synthetic-bar" style={{gridRow:'2 / 5',gridColumn:1}} />
          <span className="mm-synthetic-r" style={{gridRow:2,gridColumn:1}}>{cell('r', r, (value) => { clearFeedback(); setR(value); }, `r: the divisor is ${letter} minus r`)}</span>
          {key.coefficients.map((_, index) => <span key={`c${index}`} className="mm-synthetic-top" style={{gridRow:2,gridColumn:index + 2}}>{cell(`coefficient-${index + 1}`, entryAt(coefficients, index), (value) => setCoefficient(index, value), `Coefficient row, column ${index + 1}: ${powerName(n - index, letter)}`)}</span>)}
          {key.products.map((_, index) => <span key={`p${index}`} className="mm-synthetic-middle" style={{gridRow:3,gridColumn:index + 3}}>{cell(`product-${index + 2}`, entryAt(products, index), (value) => setProduct(index, value), `Products row, column ${index + 2}`)}</span>)}
          {key.bottom.map((_, index) => <span key={`s${index}`} className={`mm-synthetic-bottom${index === n ? ' mm-synthetic-remainder' : ''}`} style={{gridRow:4,gridColumn:index + 2}}>{cell(`sum-${index + 1}`, entryAt(sums, index), (value) => setSum(index, value), index === 0 ? 'Bottom row, column 1: bring down' : index === n ? `Bottom row, column ${index + 1}: the remainder` : `Bottom row, column ${index + 1}`)}</span>)}
        </div>
      </div>
      <p style={{margin:'8px 0 0',color:'var(--mm-text-muted)'}}>Top row: the coefficients. Middle row: r times the number below the line in the column before. Bottom row: each column added. The boxed number is the remainder.</p>
    </Panel>
    <Panel title="Read the answer">
      <div style={{display:'grid',gap:10}}>
        <label style={{display:'grid',gap:4,fontWeight:700}}>Quotient (simplest form, one degree lower)<MathInput value={quotient} onChange={(value) => { clearFeedback(); setQuotient(value); }} toolProfile="expression" extraKeys={keys} maxWidth={420} placeholder="quotient" ariaLabel="Quotient in simplest form" inputStatus={statusOf(wrong, 'quotient')} /></label>
        {scaled ? <label style={{display:'grid',gap:4,fontWeight:700}}><span>Remainder over the divisor <MathDisplay value={divisorLatex} inline /> (the table’s remainder is over <MathDisplay value={reducedDivisor} inline />)</span><input type="text" inputMode="text" autoComplete="off" spellCheck={false} className={`mm-synthetic-input mm-synthetic-wide${wrong.has('remainder') ? ' mm-synthetic-wrong' : ''}`} value={remainder} onChange={(event) => { clearFeedback(); setRemainder(event.target.value); }} aria-label={`Remainder over the divisor ${exactPolynomialPlainText(entriesOf(key.divisor.coefficients), letter)}`} aria-invalid={wrong.has('remainder') || undefined} /></label> : null}
        {preview ? <div className="mm-division-answer"><span>Your answer:</span> <MathDisplay value={preview} inline /></div> : null}
      </div>
      <button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}><SubmitText>Check my division</SubmitText></button>
      <Feedback feedback={feedback} success="r, every number in the table and the quotient are right." retry={syntheticMissMessage({ key, work, wrong })}/>
      <HintPanel hints={[
        'Synthetic division needs the divisor in the form x − r: the number in the corner is the value that makes the divisor 0.',
        'Every power of the dividend gets a column, from the highest down to the constant. A missing power still gets its column, with a 0 in it.',
        'Each column: multiply the bottom number on the left by r, write it under the next coefficient, and add down. The last sum is the remainder.',
      ]} onHintUsed={() => onAction?.("HINT_USED")} />
    </Panel>
  </ToolShell>;
}

function GraphConnection({ questionData, feedback, submit, onAction }) {
  const roots = questionData.roots || DEFAULTS.graphConnection.roots;
  const leadingCoefficient = Number(questionData.leadingCoefficient ?? DEFAULTS.graphConnection.leadingCoefficient);
  const coefficients = useMemo(()=>coefficientsFromRoots(roots,leadingCoefficient),[roots,leadingCoefficient]);
  const targetEntry = graphConnectionTargetEntry(roots, questionData.targetRoot);
  const [behavior, setBehavior] = usePersistentToolState('behavior', UNANSWERED); const [end, setEnd] = usePersistentToolState('end', UNANSWERED);
  const fn=(x)=>evaluatePolynomial(coefficients,x);
  // These selects open unanswered, so whatever they hold the student chose
  // (OWN_CHOICES) — even the options an earlier workshop pre-selected.
  useFieldUndoHistory({questionData,fields:{behavior:[behavior,setBehavior],end:[end,setEnd]}});
  const work={behavior,end,...OWN_CHOICES};
  useReportToolWork(work);
  const check=()=>{
    const result=gradeToolCheck(polynomialWorkshopGrader,questionData,work);
    submit({ isCorrect: result.isCorrect, score: result.score },work,{mode:'graphConnection',parts:result.parts});
  };
  return <ToolShell title="Polynomial Workshop" subtitle="Connect factors and multiplicity to graph behavior and end behavior." badge="Algebra II · Zeros & Graphs">
    <TaskCard question={questionData} task={'Say what the graph does at the target zero, and describe its end behaviour.'} steps={['Look at the multiplicity of the target zero.', 'Decide whether the curve passes through or bounces off the axis there.', 'Use the degree and the leading coefficient for the ends.']} /><ToolGrid min={330}><Panel title="Graph from factors"><CoordinatePlane xMin={-6} xMax={6} yMin={-16} yMax={16} functions={[fn]} points={roots.map(r=>[r.root,0])}/><p>Target zero: <strong>x = {targetEntry.root}</strong>, multiplicity {targetEntry.multiplicity}</p></Panel><Panel title="Interpret the graph"><label>At the target zero<select value={behavior} onChange={e=>setBehavior(e.target.value)} style={{...inputStyle,marginTop:5}}><option value={UNANSWERED}>Choose…</option><option value="crosses">crosses the x-axis</option><option value="touches">touches and turns</option></select></label><label style={{display:'block',marginTop:10}}>End behavior<select value={end} onChange={e=>setEnd(e.target.value)} style={{...inputStyle,marginTop:5}}><option value={UNANSWERED}>Choose…</option>{['both ends rise','both ends fall','left falls, right rises','left rises, right falls'].map(v=><option key={v}>{v}</option>)}</select></label><button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}><SubmitText>Check graph connections</SubmitText></button><Feedback feedback={feedback} success="Multiplicity and leading-term behavior are both correct." retry="Odd multiplicity crosses; even multiplicity touches. Degree parity + leading sign control the ends."/><HintPanel hints={['Multiplicity controls what happens at a zero, and the leading term controls what happens at the far ends.', 'Odd multiplicity crosses the axis. Even multiplicity touches it and turns back.', 'Even degree sends both ends the same way; odd degree sends them opposite ways, and a negative leading coefficient flips both.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel></ToolGrid></ToolShell>;
}

function RationalFeatures({ questionData, feedback, submit, onAction }) {
  const numeratorRoots=questionData.numeratorRoots || DEFAULTS.rationalFeatures.numeratorRoots;
  const denominatorRoots=questionData.denominatorRoots || DEFAULTS.rationalFeatures.denominatorRoots;
  const features=useMemo(()=>rationalFeatureMap({numeratorRoots,denominatorRoots}),[numeratorRoots,denominatorRoots]);
  const targetValue=rationalFeatureTargetValue(features, questionData.targetValue);
  const [choice, setChoice] = usePersistentToolState('choice', UNANSWERED);
  useFieldUndoHistory({questionData,fields:{choice:[choice,setChoice]}});
  const work={choice,...OWN_CHOICES};
  useReportToolWork(work);
  const check=()=>{
    const result=gradeToolCheck(polynomialWorkshopGrader,questionData,work);
    submit({ isCorrect: result.isCorrect, score: result.score },work,{mode:'rationalFeatures',parts:result.parts});
  };
  return <ToolShell title="Polynomial Workshop" subtitle="Track common factors to distinguish zeros, holes, and vertical asymptotes." badge="Algebra II · Rational Bridge">
    <TaskCard question={questionData} task={'Decide what happens to the rational function at the given x-value.'} steps={['Check whether the value is a root of the numerator, the denominator, or both.', 'A factor in both cancels.', 'Choose the feature that survives cancellation.']} /><ToolGrid min={320}><Panel title="Factored structure"><p><strong>Numerator roots:</strong> {numeratorRoots.join(', ')}</p><p><strong>Denominator roots:</strong> {denominatorRoots.join(', ')}</p><p style={{color:'var(--mm-text-muted)'}}>A common factor cancels algebraically but remains excluded from the original domain.</p></Panel><Panel title={`What happens at x = ${targetValue}?`}><select aria-label={`What happens at x = ${targetValue}?`} value={choice} onChange={e=>setChoice(e.target.value)} style={inputStyle}><option value={UNANSWERED}>Choose…</option><option value="hole">Hole</option><option value="verticalAsymptote">Vertical asymptote</option><option value="zero">Zero / x-intercept</option><option value="none">None of these</option></select><button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}><SubmitText>Check feature</SubmitText></button><Feedback feedback={feedback} success="You tracked cancellation and domain restrictions correctly." retry="Compare numerator and denominator multiplicities before and after cancellation."/><HintPanel hints={['Every interesting point on a rational function comes from a factor in the numerator, the denominator, or both.', 'A factor in the denominator only gives a vertical asymptote. A factor in the numerator only gives an x-intercept.', 'A factor in both cancels and leaves a hole — but the value is still excluded from the domain.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel></ToolGrid></ToolShell>;
}

/*
 * SYNTHETIC DIVISION, DONE BY THE STUDENT CELL BY CELL.
 *
 * The polynomial is shown as it is written — its missing powers missing — so
 * writing the coefficient row (a 0 holding each missing power) is the
 * student's first act, then the number in the box, then every product and
 * every sum. Nothing is filled in for them: the table IS the work, and the
 * shared grader marks each row (functions/shared/serverGrading/tools/
 * polynomialWorkshop.mjs `synthetic`). Then the table is read: the remainder
 * is P(r), the rest of the bottom row is the quotient one degree lower, and a
 * remainder of 0 means x − r is a factor — as many of those as the question
 * asks (`ask`).
 */
const cellStyle = { width: '100%', minWidth: 0, padding: '8px 4px', border: '1px solid var(--mm-tint-border)', borderRadius: 8, boxSizing: 'border-box', textAlign: 'center', fontSize: 'calc(16 * var(--mm-px))' };
const xPowerName = (degree) => (degree === 0 ? 'constant term' : degree === 1 ? 'x term' : `x to the ${degree} term`);

// x − r for the Remainder and Factor Theorems: the table, then what it says
// (P(r), the quotient, whether x − r is a factor). `SyntheticDivision` above is
// Dividing Polynomials' ax + b view.
function SyntheticRemainderFactor({ questionData, feedback, submit, onAction }) {
  const dividend = questionData.dividend || DEFAULTS.synthetic.dividend;
  const authoredRoot = syntheticDivisionRoot(questionData);
  const root = questionData.dividend ? authoredRoot : (authoredRoot ?? DEFAULTS.synthetic.candidateRoot);
  const asks = syntheticAsks(questionData);
  // The table's shape only — one column per power, as written. Its entries
  // are the student's to find; the shared grader holds the key.
  const degree = polynomialDegree(dividend);
  const size = degree + 1;
  const columnIndexes = (count) => Array.from({ length: Math.max(0, count) }, (_, index) => index);
  const blank = (count) => Array.from({ length: Math.max(0, count) }, () => '');
  const [rootBox, setRootBox] = usePersistentToolState('root', '');
  const [top, setTop] = usePersistentToolState('top', blank(size));
  const [middle, setMiddle] = usePersistentToolState('middle', blank(size - 1));
  const [bottom, setBottom] = usePersistentToolState('bottom', blank(size));
  const [value, setValue] = usePersistentToolState('value', '');
  const [quotient, setQuotient] = usePersistentToolState('quotient', '');
  const [factorChoice, setFactorChoice] = usePersistentToolState('factorChoice', UNANSWERED);
  useFieldUndoHistory({ questionData, fields: {
    root: [rootBox, setRootBox], top: [top, setTop], middle: [middle, setMiddle], bottom: [bottom, setBottom],
    value: [value, setValue], quotient: [quotient, setQuotient], factorChoice: [factorChoice, setFactorChoice],
  } });
  const work={root:rootBox,top,middle,bottom,value,quotient,factorChoice};
  useReportToolWork(work);
  // Which step the last wrong check names (syntheticFeedback.js).
  const [missMessage, setMissMessage] = useState('');
  const methodWithheld = useMethodWithheld();
  const setCell = (setter, index) => (event) => setter((old) => {
    const next = Array.isArray(old) ? [...old] : [];
    next[index] = event.target.value;
    return next;
  });
  const check=()=>{
    const result=gradeToolCheck(polynomialWorkshopGrader,questionData,work);
    setMissMessage(result.isCorrect ? '' : syntheticTableMissMessage({ parts: result.parts, root, typedRoot: rootBox, methodWithheld }));
    submit({ isCorrect: result.isCorrect, score: result.score },work,{mode:'synthetic',parts:result.parts});
  };
  const divisorText = polynomialReadoutText([1, -(root ?? 0)]);
  const columns = `minmax(52px, 64px) repeat(${size}, minmax(44px, 1fr))`;
  const ruled = { borderTop: '2px solid var(--mm-text-strong)', paddingTop: 6 };
  return <ToolShell title="Polynomial Workshop" subtitle="Divide by x − r with synthetic division, then read what the table tells you." badge="Algebra II · Synthetic Division">
    <TaskCard question={questionData} task={`Divide P(x) by (${divisorText}) with synthetic division, then interpret the bottom row.`} steps={['Write the number that makes the divisor zero in the box.', 'Write every coefficient of P(x) from the highest power down, with a 0 for any missing power.', 'Bring down the first coefficient. Multiply it by the box number, write the product under the next coefficient, and add. Repeat to the end.', 'The last number of the bottom row is the remainder; the others are the coefficients of the quotient, one degree lower than P(x).']} />
    <ToolGrid min={330}>
      <Panel title="Synthetic division">
        <p style={{ fontSize: 'calc(19 * var(--mm-px))', fontWeight: 800, margin: '0 0 6px' }}>P(x) = {polynomialText(dividend)}</p>
        <p style={{ margin: '0 0 12px' }}>Divisor: <strong>{divisorText}</strong></p>
        <div role="group" aria-label="Synthetic division table" style={{ display: 'grid', gridTemplateColumns: columns, gap: 6, alignItems: 'end' }}>
          <div style={{ borderRight: '2px solid var(--mm-text-strong)', paddingRight: 6 }}>
            <input value={rootBox} onChange={(event) => setRootBox(event.target.value)} style={cellStyle} aria-label="Number in the box" placeholder="r" />
          </div>
          {columnIndexes(size).map((index) => <input key={`top-${index}`} value={top[index] ?? ''} onChange={setCell(setTop, index)} style={cellStyle} aria-label={`Coefficient of the ${xPowerName(degree - index)}`} />)}
          <div style={{ borderRight: '2px solid var(--mm-text-strong)', paddingRight: 6, alignSelf: 'stretch' }} />
          <div />
          {columnIndexes(size - 1).map((index) => <input key={`middle-${index}`} value={middle[index] ?? ''} onChange={setCell(setMiddle, index)} style={cellStyle} aria-label={`Middle row, product under the ${xPowerName(degree - index - 1)}`} />)}
          <div />
          {columnIndexes(size).map((index) => <div key={`bottom-${index}`} style={ruled}>
            <input value={bottom[index] ?? ''} onChange={setCell(setBottom, index)} style={index === size - 1 ? { ...cellStyle, border: '2px solid var(--mm-text-strong)' } : cellStyle} aria-label={index === size - 1 ? 'Bottom row, remainder' : `Bottom row, number ${index + 1}`} />
          </div>)}
        </div>
        <p style={{ color: 'var(--mm-text-muted)', margin: '10px 0 0', fontSize: 'calc(13 * var(--mm-px))' }}>The boxed bottom-right number is the remainder.</p>
      </Panel>
      <Panel title="What the table tells you">
        {asks.includes('value') && <label style={{ display: 'block', marginBottom: 10 }}>P({root ?? 'r'}) = <input value={value} onChange={(event) => setValue(event.target.value)} style={{ ...inputStyle, width: 140, marginLeft: 8 }} aria-label={`P of ${root ?? 'r'}`} /></label>}
        {asks.includes('quotient') && <label style={{ display: 'block', marginBottom: 10 }}>Quotient (a polynomial in x)<input value={quotient} onChange={(event) => setQuotient(event.target.value)} style={{ ...inputStyle, marginTop: 6 }} placeholder="for example x^2 + 7x + 6" /></label>}
        {asks.includes('factor') && <label style={{ display: 'block', marginBottom: 10 }}>Is ({divisorText}) a factor of P(x)?<select value={factorChoice} onChange={(event) => setFactorChoice(event.target.value)} style={{ ...inputStyle, marginTop: 6 }}><option value={UNANSWERED}>Choose…</option><option value="yes">Yes</option><option value="no">No</option></select></label>}
        <button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}><SubmitText>Check synthetic division</SubmitText></button>
        <Feedback feedback={feedback} success="Every row is right, and so is what it tells you." retry={missMessage || (methodWithheld ? SYNTHETIC_TABLE_WITHHELD : SYNTHETIC_TABLE_RETRY)} />
        <HintPanel hints={['Synthetic division only needs the coefficients — but every power from the highest down needs a place, so a missing power gets a 0.', 'The box holds the number that makes the divisor zero: for x − r it is r, and for x + a it is the opposite of a.', 'Multiply the number you just wrote in the bottom row by the box number, put the product in the next column, and add down. The last sum is P(r).']} onHintUsed={() => onAction?.('HINT_USED')} />
      </Panel>
    </ToolGrid>
  </ToolShell>;
}

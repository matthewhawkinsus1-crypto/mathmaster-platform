import React, { useMemo } from 'react';
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
  graphConnectionTargetEntry,
  polynomialTermsLatex,
  rationalFeatureMap,
  rationalFeatureTargetValue,
  termLatex,
  termPlainText,
} from './polynomialMath';
import MathInput from '../../MathInput.jsx';
import MathDisplay from '../../MathDisplay.jsx';
import { requiredAnswerToolForSymbol } from '../../platform/interaction/answerEntryTools.js';
import './PolynomialWorkshop.css';
import { polynomialReadoutText } from './polynomialReadout.js';
import { SubmitText } from '../shared/ToolRuntimeContext';

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

  if (mode === 'multiplyArea' && writesFactors(questionData)) return <MultiplyFactors questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'multiplyArea') return <MultiplyArea questionData={questionData} feedback={feedback} submit={submit} clearFeedback={clearFeedback} onAction={onAction} />;
  if (mode === 'addSubtract') return <AddSubtract questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'factorQuadratic') return <FactorQuadratic questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'division') return <DivisionMode questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'graphConnection') return <GraphConnection questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
  if (mode === 'rationalFeatures') return <RationalFeatures questionData={questionData} feedback={feedback} submit={submit} onAction={onAction} />;
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
      <Panel title="Expanded polynomial"><p style={{color:'var(--mm-text-muted)'}}>Enter coefficients highest degree to constant, separated by commas.</p><input value={expanded} onChange={e=>setExpanded(e.target.value)} style={inputStyle} placeholder="2, -5, -12"/><button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}><SubmitText>Check area model</SubmitText></button><Feedback feedback={feedback} success="Every area product and the expanded polynomial are correct." retry="Multiply each row/column pair, then combine the two x-terms."/><HintPanel hints={['An area model is just organised distribution — every cell is one of the products you would get from FOIL.', 'Cells on the same diagonal usually hold the like terms that combine.', 'Enter coefficients highest degree first, and include a 0 for any missing degree.']} onHintUsed={() => onAction?.("HINT_USED")} /></Panel>
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

function MultiplyFactors({ questionData, feedback, submit, onAction }) {
  const model = useMemo(() => areaModelKey(questionData), [questionData]);
  const width = model ? model.columns.length : 0;
  const size = model ? model.rows.length * width : 0;
  const [terms, setTerms] = usePersistentToolState('terms', []);
  const [product, setProduct] = usePersistentToolState('product', '');
  const setTerm = (index, value) => setTerms((old) => listWith(size, old, index, value));
  const keys = useMemo(() => (model ? keypadKeys([...model.rows, ...model.columns]) : []), [model]);
  useFieldUndoHistory({questionData,fields:{terms:[terms,setTerms],product:[product,setProduct]}});
  const work={terms,product};
  useReportToolWork(work);
  const check=()=>{
    const result=gradeToolCheck(polynomialWorkshopGrader,questionData,work);
    submit({ isCorrect: result.isCorrect, score: result.score },work,{mode:'multiplyArea',parts:result.parts});
  };
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
            {model.columns.map((column, c) => <div key={`cell-${r}-${c}`} className="mm-area-cell"><span className="mm-area-cell-label" aria-hidden="true"><MathDisplay value={`${factorLatex(row)}\\cdot ${factorLatex(column)}`} inline /></span><MathInput value={entryAt(terms, r * width + c)} onChange={(value) => setTerm(r * width + c, value)} toolProfile="expression" extraKeys={keys} hideToolsToggle compact maxWidth={220} placeholder="term" ariaLabel={`Row ${r + 1}, column ${c + 1}: ${termPlainText(row)} times ${termPlainText(column)}`} /></div>)}
          </React.Fragment>)}
        </div>
        </div>
      </Panel>
      <Panel title="Product in simplest form">
        <p style={{color:'var(--mm-text-muted)',marginTop:0}}>Add up the cells. Combine like terms so each kind of term appears once.</p>
        <MathInput value={product} onChange={setProduct} toolProfile="expression" extraKeys={keys} maxWidth={540} placeholder="product" ariaLabel="Product in simplest form" />
        <button data-mm-enter-action="submit" type="button" onClick={check} style={actionStyle}><SubmitText>Check area model</SubmitText></button>
        <Feedback feedback={feedback} success="Every cell and the product are correct." retry="Check each cell: multiply the numbers, add the exponents of the same letter. Then combine like terms."/>
        <HintPanel hints={['Every term of the first factor multiplies every term of the second — that is what the area model shows: one cell for each pair.', 'Multiply the numbers and keep the letters: a² · 3a = 3a³, because a² · a = a³ (add the exponents).', 'Cells with the same letters and exponents are like terms. Add them to finish, and leave unlike terms separate.']} onHintUsed={() => onAction?.("HINT_USED")} />
      </Panel>
    </ToolGrid>
  </ToolShell>;
}

function AddSubtract({ questionData, feedback, submit, onAction }) {
  const model = useMemo(() => addSubtractKey(questionData), [questionData]);
  const count = model ? model.columns.length : 0;
  const subtracting = model?.operation === 'subtract';
  const [opposites, setOpposites] = usePersistentToolState('opposites', []);
  const [sums, setSums] = usePersistentToolState('sums', []);
  const [answer, setAnswer] = usePersistentToolState('result', '');
  const setOpposite = (index, value) => setOpposites((old) => listWith(count, old, index, value));
  const setSum = (index, value) => setSums((old) => listWith(count, old, index, value));
  const keys = useMemo(() => (model ? keypadKeys([...model.first, ...model.second]) : []), [model]);
  useFieldUndoHistory({questionData,fields:{opposites:[opposites,setOpposites],sums:[sums,setSums],result:[answer,setAnswer]}});
  const work={opposites,sums,result:answer};
  useReportToolWork(work);
  const check=()=>{
    const result=gradeToolCheck(polynomialWorkshopGrader,questionData,work);
    submit({ isCorrect: result.isCorrect, score: result.score },work,{mode:'addSubtract',parts:result.parts});
  };
  if (!model) return <MissingProblem title="Add and subtract polynomials." />;
  const problem = `\\left(${polynomialTermsLatex(model.first)}\\right)${subtracting ? '-' : '+'}\\left(${polynomialTermsLatex(model.second)}\\right)`;
  const steps = subtracting
    ? ['Subtracting a polynomial adds its opposite: write the opposite of EVERY term of the second polynomial, not just the first.', 'Each column holds one kind of term. Combine the like terms in each column — type 0 when they cancel.', 'Write the result in simplest form.']
    : ['Each column holds one kind of term, lined up from both polynomials.', 'Combine the like terms in each column — type 0 when they cancel.', 'Write the result in simplest form.'];
  return <ToolShell title="Polynomial Workshop" subtitle={subtracting ? 'Subtract by adding the opposite of every term, then combine like terms.' : 'Line up like terms, then combine them.'} badge={subtracting ? 'Algebra II · Subtract Polynomials' : 'Algebra II · Add Polynomials'}>
    <TaskCard question={questionData} task={subtracting ? 'Write the opposite of each term you subtract, combine each column, then write the result.' : 'Combine each column of like terms, then write the result.'} steps={steps} />
    <Panel title="Line up like terms">
      <div style={{fontSize:'calc(20 * var(--mm-px))',fontWeight:800,marginBottom:10}}><MathDisplay value={problem} /></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',gap:10}}>
        {model.columns.map((column, index) => {
          const name = columnPlainText(column);
          const firstTerm = model.firstByColumn[index];
          const secondTerm = model.secondByColumn[index];
          return <div key={`column-${index}`} role="group" aria-label={`${name} column`} style={{border:'1px solid var(--mm-tint-border)',borderRadius:10,padding:10,display:'grid',gap:6,alignContent:'start'}}>
            <strong style={{textAlign:'center'}}>{name === 'constant' ? 'Constants' : <>{name} terms</>}</strong>
            <div style={cardRowStyle}><span>First</span>{firstTerm ? <MathDisplay value={termLatex(firstTerm)} inline /> : <span>none</span>}</div>
            <div style={cardRowStyle}><span>Second</span>{secondTerm ? <MathDisplay value={termLatex(secondTerm)} inline /> : <span>none</span>}</div>
            {subtracting && secondTerm ? <label style={{display:'grid',gap:4,fontWeight:700}}>Its opposite<MathInput value={entryAt(opposites, index)} onChange={(value) => setOpposite(index, value)} toolProfile="expression" extraKeys={keys} hideToolsToggle compact maxWidth={220} placeholder="opposite" ariaLabel={`Opposite of ${termPlainText(secondTerm)}`} /></label> : null}
            <label style={{display:'grid',gap:4,fontWeight:700}}>Combined<MathInput value={entryAt(sums, index)} onChange={(value) => setSum(index, value)} toolProfile="expression" extraKeys={keys} hideToolsToggle compact maxWidth={220} placeholder="term or 0" ariaLabel={`Combined ${name} column`} /></label>
          </div>;
        })}
      </div>
    </Panel>
    <Panel title="Result in simplest form">
      <MathInput value={answer} onChange={setAnswer} toolProfile="expression" extraKeys={keys} maxWidth={540} placeholder="result" ariaLabel="Result in simplest form" />
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
  // shown: x³ + 0x² + 0x − 8, not x³ − 8 (review N7).
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

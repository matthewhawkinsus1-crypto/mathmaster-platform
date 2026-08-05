import { useState, useEffect } from 'react';
import * as math from 'mathjs';

export default function EquationGrader({ onGrade }) {
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState('');
  const [feedbackColor, setFeedbackColor] = useState('black');
  
  const [problem, setProblem] = useState({ expression: '', correctAnswer: '' });
  const [attempts, setAttempts] = useState(0);
  const [hasMastered, setHasMastered] = useState(false);

  const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  const generateProblem = () => {
    const a = getRandomInt(1, 6);
    const b = getRandomInt(1, 10);
    const c = getRandomInt(1, 6);
    const d = getRandomInt(1, 10);

    setProblem({
      expression: `${a}x + ${b} + ${c}x + ${d}`,
      correctAnswer: `${a + c}x + ${b + d}`
    });
    
    setInput('');
    setFeedback('');
    setAttempts(0);
  };

  useEffect(() => {
    generateProblem();
  }, []);

  const checkAnswer = () => {
    try {
      const difference = `(${input}) - (${problem.correctAnswer})`;
      const simplified = math.simplify(difference).toString();

      if (simplified === '0') {
        setFeedback('Correct! You have mastered this concept.');
        setFeedbackColor('green');
        
        if (!hasMastered) {
          setHasMastered(true);
          if (onGrade) onGrade(true);
        }
      } else {
        if (hasMastered) {
          setFeedback('Incorrect practice attempt. (No points lost!) Try again.');
          setFeedbackColor('orange');
        } else {
          const newAttempts = attempts + 1;
          
          if (newAttempts >= 3) {
            setFeedback('Out of attempts! Please read the explanation below before generating a new problem.');
            setFeedbackColor('red');
            setAttempts(newAttempts);
            if (onGrade) onGrade(false);
          } else {
            setAttempts(newAttempts);
            setFeedback(`Incorrect. You have ${3 - newAttempts} attempt(s) left.`);
            setFeedbackColor('red');
          }
        }
      }
    } catch (error) {
      setFeedback('Invalid math format. Please check your typing.');
      setFeedbackColor('orange');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '400px', alignItems: 'center', marginBottom: '10px' }}>
        <h2>Question 2: Simplify</h2>
        {hasMastered && <span style={{ background: '#28a745', color: 'white', padding: '5px 10px', borderRadius: '15px', fontSize: '14px', fontWeight: 'bold' }}>Mastered ✓</span>}
      </div>
      
      <p style={{ fontSize: '18px' }}>
        Combine like terms for: <strong>{problem.expression}</strong>
      </p>
      
      <input 
        type="text" 
        value={input} 
        onChange={(e) => setInput(e.target.value)} 
        placeholder="Type your answer here..."
        style={{ padding: '10px', fontSize: '18px', width: '250px', textAlign: 'center', borderRadius: '4px', border: '1px solid #333' }}
      />
      
      {/* The Explainer Box - Only shows if they fail 3 times */}
      {attempts >= 3 && !hasMastered && (
        <div style={{ marginTop: '20px', padding: '15px', border: '2px solid #dc3545', borderRadius: '8px', backgroundColor: '#f8d7da', maxWidth: '400px', textAlign: 'left' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#721c24' }}>How to solve this:</h3>
          <p style={{ margin: 0, color: '#721c24' }}>
            Combine the numbers with an 'x' together, and combine the plain numbers together. For <strong>{problem.expression}</strong>, the correct combined form is <strong>{problem.correctAnswer}</strong>.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
        {(attempts < 3 || hasMastered) && (
          <button onClick={checkAnswer} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}>
            Submit Answer
          </button>
        )}
        {attempts >= 3 && !hasMastered && (
          <button onClick={generateProblem} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px' }}>
            Generate New Problem
          </button>
        )}
        {hasMastered && (
          <button onClick={generateProblem} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer', background: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px' }}>
            Practice Another
          </button>
        )}
      </div>

      <div style={{ marginTop: '15px', fontWeight: 'bold', fontSize: '18px', color: feedbackColor }}>
        {feedback}
      </div>
    </div>
  );
}
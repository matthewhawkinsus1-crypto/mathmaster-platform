import { useState } from 'react';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';

import GraphLine from './GraphLine';
import EquationGrader from './EquationGrader';
import NumberLine from './NumberLine';
import FractionGrader from './FractionGrader'; // IMPORTING OUR NEW CATEGORY!

function App() {
  const [studentIdInput, setStudentIdInput] = useState('');
  const [studentId, setStudentId] = useState(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [allStudents, setAllStudents] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  
  // UPDATED TO 4 QUESTIONS
  const [tracker, setTracker] = useState({ 1: 'unattempted', 2: 'unattempted', 3: 'unattempted', 4: 'unattempted' });

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!studentIdInput.trim()) return;

    const cleanInput = studentIdInput.trim();
    setLoading(true);
    setErrorMessage(null);

    try {
      if (cleanInput.toUpperCase() === 'TEACHER') {
        const querySnapshot = await getDocs(collection(db, "grades"));
        const studentData = [];
        querySnapshot.forEach((doc) => {
          if (doc.id !== "test_connection") {
            studentData.push({ id: doc.id, tracker: doc.data() });
          }
        });
        setAllStudents(studentData);
        setIsTeacher(true);
        setStudentId('TEACHER');
      } else {
        const studentDocRef = doc(db, "grades", cleanInput);
        const docSnap = await getDoc(studentDocRef);
        
        if (docSnap.exists()) {
          setTracker(docSnap.data());
        } else {
          const freshTracker = { 1: 'unattempted', 2: 'unattempted', 3: 'unattempted', 4: 'unattempted' };
          await setDoc(studentDocRef, freshTracker);
          setTracker(freshTracker);
        }
        setIsTeacher(false);
        setStudentId(cleanInput);
      }
    } catch (error) {
      console.error("Firebase connection error:", error);
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setStudentId(null);
    setStudentIdInput('');
    setIsTeacher(false);
    setTracker({ 1: 'unattempted', 2: 'unattempted', 3: 'unattempted', 4: 'unattempted' });
  };

  const handleGradeSubmit = async (isCorrect) => {
    if (!studentId || isTeacher) return;
    const newStatus = isCorrect ? 'correct' : 'incorrect';
    const updatedTracker = { ...tracker, [currentQuestion]: newStatus };
    setTracker(updatedTracker);
    try {
      const studentDocRef = doc(db, "grades", studentId);
      await setDoc(studentDocRef, updatedTracker);
    } catch (error) {
      console.error("Failed to save to cloud:", error);
    }
  };

  // UPDATED TO 4 QUESTIONS
  const totalQuestions = 4;
  const calculateGrade = (studentTracker) => {
    const correctCount = Object.values(studentTracker).filter(status => status === 'correct').length;
    return Math.round((correctCount / totalQuestions) * 100);
  };
  
  const correctCount = Object.values(tracker).filter(status => status === 'correct').length;
  const grade = calculateGrade(tracker);

  const getTrackerColor = (qNum) => {
    if (tracker[qNum] === 'correct') return '#28a745';
    if (tracker[qNum] === 'incorrect') return '#dc3545';
    return '#fff';
  };

  // --- SCREEN 1: LOGIN ---
  if (!studentId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif', backgroundColor: '#f0f2f5' }}>
        <div style={{ padding: '40px', borderRadius: '12px', width: '350px', textAlign: 'center', background: '#fff', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}>
          <h2 style={{ color: '#1a73e8', margin: '0 0 10px 0', fontSize: '28px' }}>MathMaster</h2>
          <p style={{ color: '#5f6368', fontSize: '15px', marginBottom: '25px' }}>Enter your Student ID to continue</p>
          
          <form onSubmit={handleLogin}>
            <input 
              type="text" 
              placeholder="e.g. 12345" 
              value={studentIdInput}
              onChange={(e) => setStudentIdInput(e.target.value)}
              style={{ width: '100%', padding: '12px', fontSize: '16px', marginBottom: '20px', boxSizing: 'border-box', textAlign: 'center', borderRadius: '8px', border: '2px solid #e8eaed', outline: 'none', transition: 'border-color 0.2s' }}
              onFocus={(e) => e.target.style.borderColor = '#1a73e8'}
              onBlur={(e) => e.target.style.borderColor = '#e8eaed'}
            />
            <button 
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: '12px', fontSize: '16px', cursor: 'pointer', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', boxShadow: '0 4px 6px rgba(26, 115, 232, 0.3)', transition: 'background 0.2s' }}
            >
              {loading ? 'Connecting...' : 'Log In'}
            </button>
          </form>

          {errorMessage && (
            <div style={{ marginTop: '20px', padding: '12px', background: '#fce8e6', color: '#c5221f', fontSize: '14px', borderRadius: '8px', textAlign: 'left' }}>
              <strong>Error:</strong> {errorMessage}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- SCREEN 2: TEACHER DASHBOARD ---
  if (isTeacher) {
    return (
      <div style={{ fontFamily: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif', backgroundColor: '#f8f9fa', minHeight: '100vh', padding: '40px 20px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', background: '#fff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', padding: '30px' }}>
          <header style={{ borderBottom: '2px solid #f1f3f4', paddingBottom: '20px', marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: 0, color: '#202124', fontSize: '28px' }}>Instructor Dashboard</h1>
              <p style={{ margin: '5px 0 0 0', color: '#5f6368' }}>Live overview of all student progress</p>
            </div>
            <button onClick={handleLogout} style={{ padding: '10px 20px', background: '#fff', color: '#d93025', border: '1px solid #d93025', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}>
              Log Out
            </button>
          </header>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '15px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f3f4', color: '#5f6368' }}>
                <th style={{ padding: '15px', borderRadius: '8px 0 0 8px' }}>Student ID</th>
                <th style={{ padding: '15px' }}>Graphing</th>
                <th style={{ padding: '15px' }}>Algebra</th>
                <th style={{ padding: '15px' }}>Number Line</th>
                <th style={{ padding: '15px' }}>Fractions</th>
                <th style={{ padding: '15px', borderRadius: '0 8px 8px 0' }}>Mastery Score</th>
              </tr>
            </thead>
            <tbody>
              {allStudents.length === 0 ? (
                <tr><td colSpan="6" style={{ padding: '30px', textAlign: 'center', color: '#5f6368' }}>No student records found yet.</td></tr>
              ) : (
                allStudents.map((student) => {
                  const studentScore = calculateGrade(student.tracker);
                  return (
                    <tr key={student.id} style={{ borderBottom: '1px solid #f1f3f4', transition: 'background 0.2s' }}>
                      <td style={{ padding: '15px', fontWeight: 'bold', color: '#202124' }}>{student.id}</td>
                      <td style={{ padding: '15px', color: student.tracker[1] === 'correct' ? '#188038' : (student.tracker[1] === 'incorrect' ? '#d93025' : '#80868b') }}>
                        {student.tracker[1] === 'unattempted' ? '—' : student.tracker[1]}
                      </td>
                      <td style={{ padding: '15px', color: student.tracker[2] === 'correct' ? '#188038' : (student.tracker[2] === 'incorrect' ? '#d93025' : '#80868b') }}>
                        {student.tracker[2] === 'unattempted' ? '—' : student.tracker[2]}
                      </td>
                      <td style={{ padding: '15px', color: student.tracker[3] === 'correct' ? '#188038' : (student.tracker[3] === 'incorrect' ? '#d93025' : '#80868b') }}>
                        {student.tracker[3] === 'unattempted' ? '—' : student.tracker[3]}
                      </td>
                      <td style={{ padding: '15px', color: student.tracker[4] === 'correct' ? '#188038' : (student.tracker[4] === 'incorrect' ? '#d93025' : '#80868b') }}>
                        {student.tracker[4] === 'unattempted' ? '—' : student.tracker[4]}
                      </td>
                      <td style={{ padding: '15px', fontWeight: 'bold', color: studentScore >= 70 ? '#188038' : (studentScore === 0 ? '#80868b' : '#d93025') }}>
                        {studentScore}%
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // --- SCREEN 3: STUDENT APP VIEW ---
  return (
    <div style={{ fontFamily: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif', backgroundColor: '#f0f2f5', minHeight: '100vh', padding: '20px' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '15px 25px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: '25px' }}>
          <div>
            <h1 style={{ margin: 0, color: '#1a73e8', fontSize: '22px' }}>MathMaster</h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#5f6368' }}>ID: <strong>{studentId}</strong></p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Course Mastery</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: grade >= 70 ? '#188038' : '#202124' }}>
                {grade}%
              </div>
            </div>
            <button onClick={handleLogout} style={{ padding: '8px 16px', cursor: 'pointer', background: '#f1f3f4', color: '#5f6368', border: 'none', borderRadius: '8px', fontWeight: 'bold', transition: 'background 0.2s' }}>
              Log Out
            </button>
          </div>
        </header>

        <div style={{ background: '#e8eaed', borderRadius: '10px', height: '12px', marginBottom: '25px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${grade}%`, background: grade >= 70 ? '#34a853' : '#1a73e8', transition: 'width 0.5s ease-in-out' }}></div>
        </div>

        {/* UPDATED TO 4 COLUMNS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '30px' }}>
          {[
            { num: 1, title: 'Graphing Lines' },
            { num: 2, title: 'Algebra' },
            { num: 3, title: 'Number Lines' },
            { num: 4, title: 'Fractions' }
          ].map((q) => (
            <div
              key={q.num}
              onClick={() => setCurrentQuestion(q.num)}
              style={{
                padding: '15px',
                cursor: 'pointer',
                backgroundColor: getTrackerColor(q.num),
                color: tracker[q.num] === 'unattempted' ? '#202124' : (tracker[q.num] === 'correct' ? '#fff' : '#fff'),
                border: currentQuestion === q.num ? '3px solid #1a73e8' : '1px solid #dadce0',
                borderRadius: '10px',
                boxShadow: currentQuestion === q.num ? '0 4px 12px rgba(26,115,232,0.2)' : 'none',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 'bold', opacity: 0.9 }}>Topic {q.num}</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '5px' }}>{q.title}</div>
            </div>
          ))}
        </div>

        <main style={{ background: '#fff', borderRadius: '12px', padding: '30px', minHeight: '500px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
          <div style={{ display: currentQuestion === 1 ? 'block' : 'none' }}>
            <GraphLine onGrade={handleGradeSubmit} />
          </div>
          <div style={{ display: currentQuestion === 2 ? 'block' : 'none' }}>
            <EquationGrader onGrade={handleGradeSubmit} />
          </div>
          <div style={{ display: currentQuestion === 3 ? 'block' : 'none' }}>
            <NumberLine onGrade={handleGradeSubmit} />
          </div>
          {/* NEW FRACTIONS COMPONENT */}
          <div style={{ display: currentQuestion === 4 ? 'block' : 'none' }}>
            <FractionGrader onGrade={handleGradeSubmit} />
          </div>
        </main>

      </div>
    </div>
  );
}

export default App;
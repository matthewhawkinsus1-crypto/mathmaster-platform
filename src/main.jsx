import { Component, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthProvider.jsx';

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('MathMaster application error:', error, errorInfo);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background: '#f5f7fb',
          color: '#1f2937',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <section
          style={{
            width: 'min(720px, 100%)',
            padding: '28px',
            border: '1px solid #ef4444',
            borderRadius: '16px',
            background: '#fff',
            boxShadow: '0 18px 45px rgba(15, 23, 42, 0.12)',
          }}
        >
          <h1 style={{ marginTop: 0, color: '#b91c1c' }}>MathMaster could not start</h1>
          <p>The application encountered a runtime error. The details below can be copied for troubleshooting.</p>
          <pre
            style={{
              overflow: 'auto',
              padding: '14px',
              borderRadius: '10px',
              background: '#111827',
              color: '#f9fafb',
              whiteSpace: 'pre-wrap',
            }}
          >
            {error?.stack || error?.message || String(error)}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: '12px',
              padding: '11px 18px',
              border: 0,
              borderRadius: '9px',
              background: '#174ea6',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reload MathMaster
          </button>
        </section>
      </main>
    );
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('The MathMaster root element was not found in index.html.');
}

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </AppErrorBoundary>
  </StrictMode>,
);

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Terminal } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });
  }

  handleReload = () => {
    // Clear only ARES-specific state to avoid affecting other apps
    try {
      // Clear ARES-specific localStorage keys
      const keysToRemove = [
        'ares_dashboard_state',
        'ares_auth_session',
        'ares_workspace_data',
        'ares_campaigns',
        'ares_audit_logs',
        'ares_theme'
      ];
      keysToRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          // Continue even if one key fails
        }
      });
    } catch (e) {
      console.error('Failed to clear storage:', e);
    }
    
    // Reload the page
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isDevelopment = process.env.NODE_ENV !== 'production';
      
      // In production, show generic error message to avoid leaking sensitive info
      const displayError = isDevelopment 
        ? this.state.error?.toString() 
        : 'An unexpected error occurred while loading the application.';

      return (
        <div className="min-h-screen flex items-center justify-center p-4" 
             style={{
               fontFamily: 'Inter, sans-serif',
               background: 'linear-gradient(135deg, #0a0f1e 0%, #050813 100%)',
               color: '#f8fafc'
             }}>
          <div className="max-w-2xl w-full">
            {/* Error Card */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.8)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '1.5rem',
              padding: '2rem',
              boxShadow: '0 0 30px rgba(196, 30, 58, 0.3)'
            }}>
              {/* Header */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '1rem',
                marginBottom: '1.5rem',
                paddingBottom: '1.5rem',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div style={{
                  padding: '1rem',
                  background: 'rgba(196, 30, 58, 0.2)',
                  border: '1px solid rgba(196, 30, 58, 0.4)',
                  borderRadius: '0.75rem'
                }}>
                  <AlertTriangle style={{ width: '2rem', height: '2rem', color: '#ef4444' }} />
                </div>
                <div>
                  <h1 style={{ 
                    fontSize: '1.5rem', 
                    fontWeight: 'bold',
                    marginBottom: '0.5rem'
                  }}>
                    Application Error
                  </h1>
                  <p style={{ 
                    fontSize: '0.875rem', 
                    color: '#94a3b8'
                  }}>
                    Something went wrong while loading the dashboard
                  </p>
                </div>
              </div>

              {/* Error Message */}
              <div style={{
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '0.75rem',
                padding: '1rem',
                marginBottom: '1.5rem'
              }}>
                <div style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.75rem'
                }}>
                  <Terminal style={{ width: '1rem', height: '1rem', color: '#ef4444' }} />
                  <span style={{ 
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    color: '#94a3b8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Error Details
                  </span>
                </div>
                <pre style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.875rem',
                  color: '#fca5a5',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  margin: 0
                }}>
                  {displayError}
                </pre>
              </div>

              {/* Stack Trace (Development Only) */}
              {isDevelopment && this.state.errorInfo && (
                <details style={{ marginBottom: '1.5rem' }}>
                  <summary style={{
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    color: '#94a3b8',
                    padding: '0.5rem',
                    background: 'rgba(0, 0, 0, 0.2)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '0.5rem',
                    marginBottom: '0.5rem'
                  }}>
                    Show Stack Trace
                  </summary>
                  <pre style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.75rem',
                    color: '#cbd5e1',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    overflowX: 'auto',
                    maxHeight: '300px',
                    margin: 0
                  }}>
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}

              {/* Action Buttons */}
              <div style={{ 
                display: 'flex',
                gap: '0.75rem',
                flexWrap: 'wrap'
              }}>
                <button
                  onClick={this.handleReload}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem 1.5rem',
                    background: '#06b6d4',
                    color: 'white',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    border: 'none',
                    borderRadius: '0.75rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 0 20px rgba(6, 182, 212, 0.3)'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = '#0891b2';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = '#06b6d4';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <RefreshCw style={{ width: '1rem', height: '1rem' }} />
                  Reload Application
                </button>
              </div>

              {/* Help Text */}
              <div style={{
                marginTop: '1.5rem',
                padding: '1rem',
                background: 'rgba(0, 207, 193, 0.1)',
                border: '1px solid rgba(0, 207, 193, 0.3)',
                borderRadius: '0.75rem'
              }}>
                <p style={{ 
                  fontSize: '0.75rem',
                  color: '#94a3b8',
                  lineHeight: '1.5',
                  margin: 0
                }}>
                  <strong style={{ color: '#00cfc1' }}>Tip:</strong> If this error persists after reloading:
                  <br/>
                  1. Check your browser console for more details (F12)
                  <br/>
                  2. Try clearing your browser cache and cookies
                  <br/>
                  3. Ensure your browser is up to date
                  <br/>
                  4. Try accessing the application in an incognito/private window
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

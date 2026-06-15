import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthProvider';

export default function LoginPage() {
  const { login, isLoading, error, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Redirect if already authenticated
  if (isAuthenticated) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  function getRemainingLockTime(): string | null {
    if (!error?.lockedUntil) return null;
    const lockedUntil = new Date(error.lockedUntil).getTime();
    const now = Date.now();
    const remainingMs = lockedUntil - now;
    if (remainingMs <= 0) return null;
    const minutes = Math.ceil(remainingMs / 60000);
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch {
      // Error is handled by AuthProvider context
    }
  }

  const lockTimeRemaining = getRemainingLockTime();

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        padding: '1rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <h1 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Sign In</h1>

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              borderRadius: '4px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
            }}
          >
            <p style={{ margin: 0 }}>{error.message}</p>
            {lockTimeRemaining && (
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
                Try again in {lockTimeRemaining}.
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="email"
              style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={isLoading}
              aria-describedby={error ? 'login-error' : undefined}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="password"
              style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '1rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !email || !password}
            aria-busy={isLoading}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: isLoading ? '#9ca3af' : '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '1rem',
              fontWeight: 500,
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

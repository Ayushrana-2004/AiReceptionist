import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { apiClient } from '../services/api';

interface AuthUser {
  id: string;
  email: string;
  businessId: string;
}

interface LoginError {
  message: string;
  lockedUntil?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  error: LoginError | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export default function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<LoginError | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAuthenticated = user !== null;

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const logout = useCallback(() => {
    clearInactivityTimer();
    apiClient.clearTokens();
    setUser(null);
    setError(null);
  }, [clearInactivityTimer]);

  const resetInactivityTimer = useCallback(() => {
    clearInactivityTimer();
    if (user) {
      inactivityTimerRef.current = setTimeout(() => {
        logout();
      }, INACTIVITY_TIMEOUT_MS);
    }
  }, [user, logout, clearInactivityTimer]);

  // Track user activity for inactivity timeout
  useEffect(() => {
    if (!user) return;

    const activityEvents = ['mousedown', 'keydown', 'mousemove', 'touchstart'];

    const handleActivity = () => {
      resetInactivityTimer();
    };

    activityEvents.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    // Start the timer initially
    resetInactivityTimer();

    return () => {
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      clearInactivityTimer();
    };
  }, [user, resetInactivityTimer, clearInactivityTimer]);

  // Check for existing session on mount
  useEffect(() => {
    const token = apiClient.getToken();
    if (token) {
      // Our token is base64(JSON) — not a standard JWT with dots
      try {
        const payload = JSON.parse(atob(token));
        const now = Date.now();
        if (payload.exp && payload.exp > now) {
          setUser({
            id: payload.sub || payload.id || 'user',
            email: payload.email,
            businessId: payload.businessId || 'biz_001',
          });
        } else {
          // Token expired, clear it
          apiClient.clearTokens();
        }
      } catch {
        apiClient.clearTokens();
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.post<{
        token: string;
        refreshToken: string;
        user: AuthUser;
      }>('/auth/login', { email, password });

      apiClient.setToken(response.data.token);
      apiClient.setRefreshToken(response.data.refreshToken);
      setUser(response.data.user || { email });
    } catch (err: unknown) {
      const apiError = err as { status?: number; body?: { error?: string; lockedUntil?: string } };
      if (apiError.status === 423 && apiError.body?.lockedUntil) {
        setError({
          message: 'Account locked due to too many failed attempts.',
          lockedUntil: apiError.body.lockedUntil,
        });
      } else if (apiError.status === 401) {
        setError({ message: 'Invalid email or password.' });
      } else {
        setError({ message: 'An unexpected error occurred. Please try again.' });
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value: AuthContextValue = {
    user,
    isAuthenticated,
    login,
    logout,
    isLoading,
    error,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

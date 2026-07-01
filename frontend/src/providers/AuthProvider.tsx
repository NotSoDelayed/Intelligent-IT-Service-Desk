import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import type { StoredSession, User } from '@/types/auth';

const STORAGE_KEY = 'servicedesk_session';
const SESSION_DURATION_MS = Number(import.meta.env.SESSION_DURATION_MINS) || 60;

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  /** Whether the session was expired (used by LoginPage to show banner) */
  sessionExpired: boolean;
  login: (user: User) => void;
  logout: () => void;
  /** Clear the sessionExpired flag after the banner has been shown */
  clearSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadSession(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const session: StoredSession = JSON.parse(raw);
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session.user;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function saveSession(user: User): void {
  const session: StoredSession = {
    user,
    expiresAt: Date.now() + SESSION_DURATION_MS * 1000 * 60 * 60,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Check if the stored session has expired (without clearing it — that's loadSession's job) */
function isSessionExpiredInStorage(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false; // No session = not "expired", just absent
    const session: StoredSession = JSON.parse(raw);
    return Date.now() > session.expiresAt;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  // On first render, check if there's a valid stored session.
  // If the session exists but is expired, we flag it so LoginPage can show a banner.
  const [sessionExpired, setSessionExpired] = useState(() => isSessionExpiredInStorage());
  const [user, setUser] = useState<User | null>(() => loadSession());
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearExpiryTimer = useCallback(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  }, []);

  const startExpiryTimer = useCallback(() => {
    clearExpiryTimer();

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const session: StoredSession = JSON.parse(raw);
      const remaining = session.expiresAt - Date.now();

      if (remaining <= 0) {
        // Already expired
        setUser(null);
        setSessionExpired(true);
        clearSession();
        return;
      }

      expiryTimerRef.current = setTimeout(() => {
        setUser(null);
        setSessionExpired(true);
        clearSession();
      }, remaining);
    } catch {
      // Ignore parse errors
    }
  }, [clearExpiryTimer]);

  // Start the expiry timer when a user is logged in
  useEffect(() => {
    if (user) {
      startExpiryTimer();
    }
    return clearExpiryTimer;
  }, [user, startExpiryTimer, clearExpiryTimer]);

  const login = useCallback((newUser: User) => {
    saveSession(newUser);
    setUser(newUser);
    setSessionExpired(false);
  }, []);

  const logout = useCallback(() => {
    clearExpiryTimer();
    clearSession();
    setUser(null);
  }, [clearExpiryTimer]);

  const clearSessionExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  return (
    <AuthContext
      value={{
        user,
        isAuthenticated: user !== null,
        sessionExpired,
        login,
        logout,
        clearSessionExpired,
      }}
    >
      {children}
    </AuthContext>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

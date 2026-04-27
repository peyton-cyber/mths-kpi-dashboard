import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { apiRequest, setAuthToken, getAuthToken } from "./queryClient";

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  picture?: string;
  departments: string;
  isAdmin: boolean;
};

type AuthState = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  login: (email: string, accessCode: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export { AuthContext };

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export function useAuthState(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check existing token on mount
  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    // Verify token is still valid
    apiRequest("GET", "/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        setUser(data.user);
        setIsLoading(false);
      })
      .catch(() => {
        setAuthToken(null);
        setUser(null);
        setIsLoading(false);
      });
  }, []);

  const login = useCallback(async (email: string, accessCode: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/auth/login", { email, accessCode });
      const data = await res.json();
      // Store token
      setAuthToken(data.token);
      setUser(data.user);
    } catch (err: any) {
      const msg = err.message || "Login failed";
      if (msg.includes("403")) {
        setError("Access restricted to @mytennesseehomesolution.com accounts only");
      } else if (msg.includes("401")) {
        setError("Invalid access code. Please try again.");
      } else {
        setError("Login failed. Please try again.");
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {
      // ignore
    }
    setAuthToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await apiRequest("GET", "/api/auth/me");
      const data = await res.json();
      setUser(data.user);
    } catch {
      setAuthToken(null);
      setUser(null);
    }
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    login,
    logout,
    refreshUser,
  };
}

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { login, logout, getMe, googleLogin, register } from "@/lib/api/accounts";
import { ApiError } from "@/lib/api/client";
import type { AuthToken, CustomerAccount } from "@/types/api";

interface AuthContextValue {
  user: CustomerAccount | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signUp: (payload: {
    email: string;
    password: string;
    password_confirm: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CustomerAccount | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    const saved = localStorage.getItem("ws_token");
    if (!saved) {
      setLoading(false);
      return;
    }
    setToken(saved);
    getMe()
      .then(setUser)
      .catch((sessionError: unknown) => {
        if (
          sessionError instanceof ApiError &&
          (sessionError.status === 401 || sessionError.status === 403)
        ) {
          localStorage.removeItem("ws_token");
          setToken(null);
          return;
        }
        setError(
          sessionError instanceof Error
            ? sessionError.message
            : "Could not verify your saved sign-in.",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const persist = useCallback((response: AuthToken) => {
    const { token: tok, customer } = response;
    localStorage.setItem("ws_token", tok);
    setToken(tok);
    setUser(customer);
    setError(null);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await login({ email, password });
      persist(res);
    },
    [persist]
  );

  const signInWithGoogle = useCallback(
    async (idToken: string) => {
      const res = await googleLogin(idToken);
      persist(res);
    },
    [persist]
  );

  const signUp = useCallback(
    async (payload: {
      email: string;
      password: string;
      password_confirm: string;
    }) => {
      const res = await register(payload);
      persist(res);
    },
    [persist]
  );

  const signOut = useCallback(async () => {
    let signOutError: string | null = null;
    try {
      await logout();
    } catch (requestError) {
      signOutError =
        requestError instanceof Error
          ? `We could not confirm sign-out with the server: ${requestError.message}`
          : "We could not confirm sign-out with the server.";
    }
    localStorage.removeItem("ws_token");
    setToken(null);
    setUser(null);
    setError(signOutError);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        error,
        signIn,
        signInWithGoogle,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

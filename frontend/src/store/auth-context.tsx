"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as accountsApi from "@/lib/api/accounts";
import { ApiError } from "@/lib/api/client";
import type { Customer } from "@/types/api";

interface AuthContextValue {
  customer: Customer | null;
  isLoading: boolean;
  authError: string;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (credential: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    passwordConfirm: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  refreshCustomer: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const TOKEN_KEY = "whitestag.auth.token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  const refreshCustomer = useCallback(async () => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setCustomer(null);
      setAuthError("");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      setCustomer(await accountsApi.getCurrentCustomer());
      setAuthError("");
    } catch (error) {
      setCustomer(null);
      if (error instanceof ApiError && error.status === 401) {
        window.localStorage.removeItem(TOKEN_KEY);
        setAuthError("Your session has expired. Please sign in again.");
      } else {
        setAuthError("We could not confirm your account. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCustomer();
  }, [refreshCustomer]);

  const saveAuth = useCallback((token: string, nextCustomer: Customer) => {
    window.localStorage.setItem(TOKEN_KEY, token);
    setCustomer(nextCustomer);
    setAuthError("");
    setIsLoading(false);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const response = await accountsApi.login(email, password);
      saveAuth(response.token, response.customer);
    },
    [saveAuth],
  );

  const signInWithGoogle = useCallback(
    async (credential: string) => {
      const response = await accountsApi.loginWithGoogle(credential);
      saveAuth(response.token, response.customer);
    },
    [saveAuth],
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      passwordConfirm: string,
    ) => {
      const response = await accountsApi.register(
        email,
        password,
        passwordConfirm,
      );
      saveAuth(response.token, response.customer);
    },
    [saveAuth],
  );

  const signOut = useCallback(async () => {
    try {
      await accountsApi.logout();
    } finally {
      window.localStorage.removeItem(TOKEN_KEY);
      setCustomer(null);
      setAuthError("");
    }
  }, []);

  const value = useMemo(
    () => ({
      customer,
      isLoading,
      authError,
      signIn,
      signInWithGoogle,
      signUp,
      signOut,
      refreshCustomer,
    }),
    [
      customer,
      isLoading,
      authError,
      signIn,
      signInWithGoogle,
      signOut,
      signUp,
      refreshCustomer,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  AdminApiError,
  STAFF_IDENTITY_KEY,
  STAFF_TOKEN_KEY,
} from "@/lib/api/admin/client";
import { staffLogin, staffLogout, staffMe } from "@/lib/api/admin/staff";
import { isStaffRole } from "@/lib/admin/capabilities";
import type { StaffIdentity } from "@/types/admin";

interface StaffAuthContextValue {
  staff: StaffIdentity | null;
  role: string | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<StaffIdentity>;
  signOut: () => Promise<void>;
}

const StaffAuthContext = createContext<StaffAuthContextValue | null>(null);

function clearSession() {
  localStorage.removeItem(STAFF_TOKEN_KEY);
  localStorage.removeItem(STAFF_IDENTITY_KEY);
}

function readCachedIdentity(): StaffIdentity | null {
  const raw = localStorage.getItem(STAFF_IDENTITY_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StaffIdentity;
    return isStaffRole(parsed?.role) ? parsed : null;
  } catch {
    return null;
  }
}

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<StaffIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem(STAFF_TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }

    const cached = readCachedIdentity();
    if (cached) setStaff(cached);

    staffMe()
      .then((identity) => {
        if (!isStaffRole(identity.role)) {
          clearSession();
          setStaff(null);
          return;
        }
        setStaff(identity);
        localStorage.setItem(STAFF_IDENTITY_KEY, JSON.stringify(identity));
      })
      .catch((sessionError: unknown) => {
        if (
          sessionError instanceof AdminApiError &&
          (sessionError.status === 401 || sessionError.status === 403)
        ) {
          clearSession();
          setStaff(null);
          return;
        }
        setError(
          sessionError instanceof Error
            ? sessionError.message
            : "Could not verify your staff session.",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await staffLogin({ email, password });
    if (!isStaffRole(response.staff.role)) {
      throw new Error("This account does not have dashboard access.");
    }
    localStorage.setItem(STAFF_TOKEN_KEY, response.token);
    localStorage.setItem(STAFF_IDENTITY_KEY, JSON.stringify(response.staff));
    setStaff(response.staff);
    setError(null);
    return response.staff;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await staffLogout();
    } catch {
      // The local session is cleared regardless of the server response.
    }
    clearSession();
    setStaff(null);
    setError(null);
  }, []);

  return (
    <StaffAuthContext.Provider
      value={{
        staff,
        role: staff?.role ?? null,
        loading,
        error,
        signIn,
        signOut,
      }}
    >
      {children}
    </StaffAuthContext.Provider>
  );
}

export function useStaffAuth() {
  const ctx = useContext(StaffAuthContext);
  if (!ctx) throw new Error("useStaffAuth must be used inside StaffAuthProvider");
  return ctx;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { describeAdminError } from "@/lib/api/admin/client";
import type { PaginatedResponse } from "@/types/api";

export interface AdminListState<T> {
  rows: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  setPage: (page: number) => void;
  reload: () => void;
}

/**
 * Paginated list loader for the dashboard.
 *
 * `key` is a serialized representation of the active filters; changing it resets
 * pagination back to page 1.
 */
export function useAdminList<T>(
  load: (page: number) => Promise<PaginatedResponse<T>>,
  key = "",
  pageSize = 20,
): AdminListState<T> {
  const [rows, setRows] = useState<T[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    setPage(1);
  }, [key]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadRef
      .current(page)
      .then((result) => {
        if (cancelled) return;
        setRows(result.results ?? []);
        setCount(result.count ?? 0);
      })
      .catch((requestError: unknown) => {
        if (cancelled) return;
        setRows([]);
        setCount(0);
        setError(describeAdminError(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, key, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  return {
    rows,
    count,
    page,
    pageSize,
    totalPages,
    loading,
    error,
    setPage,
    reload,
  };
}

/** Loads a single object (settings singletons, detail views). */
export function useAdminResource<T>(
  load: () => Promise<T>,
  deps: unknown[] = [],
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadRef
      .current()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(describeAdminError(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { data, loading, error, reload, setData };
}

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "../api";

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refetch = useCallback(async () => {
    if (!path) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<T>(path, { signal: controller.signal });
      if (!controller.signal.aborted) {
        setData(result);
      }
    } catch (err: any) {
      if (!controller.signal.aborted) {
        setError(err.message);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [path]);

  useEffect(() => {
    refetch();
    return () => { abortRef.current?.abort(); };
  }, [refetch]);

  return { data, loading, error, refetch };
}

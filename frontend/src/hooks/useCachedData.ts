/** Custom hook for cached data fetching with invalidation support.
 *
 * - Checks Zustand store cache on mount; uses cached data if fresh (within TTL).
 * - Re-fetches when: cache miss/expired, invalidation version bumps, or deps change.
 * - Returns refresh() for manual re-fetch (bypasses cache).
 *
 * IMPORTANT: Data is never cleared — once loaded, it stays visible until
 * new data successfully arrives. Failed refreshes keep showing stale data.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore, type CacheKey } from '../store/useAppStore';

export interface UseCachedDataResult<T> {
  data: T | null;
  loading: boolean;
  refresh: () => void;
}

export function useCachedData<T>(
  cacheKey: string,
  invalidationKey: CacheKey,
  fetcher: () => Promise<T>,
  ttlMs: number = 120_000,  // Default 2 minutes — rely on invalidation, not short TTL
  deps: readonly unknown[] = [],
): UseCachedDataResult<T> {
  // Store fetcher in ref so refresh() always calls the latest version
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const setCacheData = useAppStore(s => s.setCacheData);
  const getCacheData = useAppStore(s => s.getCacheData);

  // Subscribe to the version counter — triggers re-render when invalidated
  const version = useAppStore(s => s._invalidation[invalidationKey]);

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchIdRef = useRef(0);
  const lastFetchedVersionRef = useRef<number>(-1);

  // Stable refresh — always executes, never clears existing data on failure
  const refresh = useCallback(() => {
    const id = ++fetchIdRef.current;
    setLoading(true);
    (async () => {
      try {
        const result = await fetcherRef.current();
        if (id !== fetchIdRef.current) return; // stale — another fetch started
        setData(result);
        setCacheData(cacheKey, result);
        lastFetchedVersionRef.current = version;
      } catch {
        if (id !== fetchIdRef.current) return;
        // NEVER clear data on error — keep stale data visible
      } finally {
        if (id === fetchIdRef.current) setLoading(false);
      }
    })();
  }, [cacheKey, setCacheData, version]);

  // On mount / deps change / invalidation version change
  useEffect(() => {
    const currentVersion = version;
    const versionChanged = lastFetchedVersionRef.current >= 0 &&
      currentVersion !== lastFetchedVersionRef.current;

    // Try cache first (skip if version bumped = data was invalidated)
    if (!versionChanged) {
      const cached = getCacheData<T>(cacheKey, ttlMs);
      if (cached !== null) {
        setData(cached);
        lastFetchedVersionRef.current = currentVersion;
        return; // cache hit, no fetch needed
      }
    }

    // Cache miss or invalidated — fetch
    const id = ++fetchIdRef.current;
    setLoading(true);
    (async () => {
      try {
        const result = await fetcherRef.current();
        if (id !== fetchIdRef.current) return;
        setData(result);
        setCacheData(cacheKey, result);
        lastFetchedVersionRef.current = currentVersion;
      } catch {
        if (id !== fetchIdRef.current) return;
        // Keep stale data on error
      } finally {
        if (id === fetchIdRef.current) setLoading(false);
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, invalidationKey, ttlMs, version, getCacheData, ...deps]);

  return { data, loading, refresh };
}

"use client"

import { useState, useEffect, useCallback } from 'react';

const WATCHLIST_KEY = 'swipebook_watchlist';

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load watchlist from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(WATCHLIST_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setWatchlist(parsed);
        }
      }
    } catch (error) {
      console.error('Failed to load watchlist from localStorage:', error);
    }
    setIsLoaded(true);
  }, []);

  // Persist watchlist to localStorage whenever it changes
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
      } catch (error) {
        console.error('Failed to save watchlist to localStorage:', error);
      }
    }
  }, [watchlist, isLoaded]);

  const addToWatchlist = useCallback((poolAddress: string) => {
    setWatchlist((prev) => {
      if (prev.includes(poolAddress)) {
        return prev;
      }
      return [...prev, poolAddress];
    });
  }, []);

  const removeFromWatchlist = useCallback((poolAddress: string) => {
    setWatchlist((prev) => prev.filter((address) => address !== poolAddress));
  }, []);

  const isWatched = useCallback(
    (poolAddress: string) => {
      return watchlist.includes(poolAddress);
    },
    [watchlist]
  );

  return {
    watchlist,
    addToWatchlist,
    removeFromWatchlist,
    isWatched,
  };
}

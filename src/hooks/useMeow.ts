import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectCombo, WeekGrid } from '../../shared/types';

export function useCombos(): {
  combos: ProjectCombo[];
  reload: () => Promise<void>;
} {
  const [combos, setCombos] = useState<ProjectCombo[]>([]);
  const reload = useCallback(async () => {
    setCombos(await window.meow.combos.list());
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { combos, reload };
}

export function useFavorites(limit = 5): {
  favorites: ProjectCombo[];
  reload: () => Promise<void>;
} {
  const [favorites, setFavorites] = useState<ProjectCombo[]>([]);
  const reload = useCallback(async () => {
    setFavorites(await window.meow.combos.favorites(limit));
  }, [limit]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { favorites, reload };
}

export function useWeek(weekStart: string): {
  week: WeekGrid | null;
  reload: () => Promise<void>;
  loading: boolean;
} {
  const [week, setWeek] = useState<WeekGrid | null>(null);
  const [loading, setLoading] = useState(false);
  const tokenRef = useRef(0);
  const reload = useCallback(async () => {
    const token = ++tokenRef.current;
    setLoading(true);
    try {
      const data = await window.meow.week.get(weekStart);
      if (token === tokenRef.current) setWeek(data);
    } finally {
      if (token === tokenRef.current) setLoading(false);
    }
  }, [weekStart]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { week, reload, loading };
}

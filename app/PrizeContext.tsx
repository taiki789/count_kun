"use client";

import React, { createContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { auth } from "../lib/firebase"; 
import { onAuthStateChanged } from "firebase/auth";

export type HistoryData = {
  timestamp: number;
  time: string;
  memo?: string; // メモフィールド
  memoPrizeIndex?: number;
  memoCountValue?: number;
  [key: string]: number | string | boolean | undefined; // p1, p2... と changedP1, changedP2... を動的に持つ
};

export type Dataset = {
  id: string;
  name: string;
  counts: number[];
  history: HistoryData[];
  prizeLabels?: string[];
  initialCounts?: number[];
  createdAt: string;
  updatedAt: string;
};

type PrizeContextType = {
  counts: number[];
  history: HistoryData[];
  prizeLabels: string[];
  addHistory: (newCounts: number[]) => Promise<void>;
  addMemo: (timestamp: number, memo: string) => Promise<void>;
  addMemoPoint: (prizeIndex: number, memo: string) => Promise<void>;
  resetData: () => Promise<void>;
  resetContext: (newCounts: number[]) => Promise<void>;
  loading: boolean;
  // データセット関連
  currentDatasetId: string | null;
  datasets: Dataset[];
  selectDataset: (datasetId: string) => Promise<void>;
  fetchDatasets: () => Promise<void>;
  // 計測関連
  measuring: boolean;
  startTimestamp: number | null;
  startMeasurement: () => void;
  endMeasurement: () => void;
};

export const PrizeContext = createContext<PrizeContextType>({} as PrizeContextType);

export function PrizeProvider({ children }: { children: ReactNode }) {
  const buildDefaultLabels = (length: number) => Array.from({ length }, (_, i) => `${i + 1}等`);

  const [counts, setCounts] = useState<number[]>([0, 0, 0, 0, 0]);
  const [history, setHistory] = useState<HistoryData[]>([]);
  const [prizeLabels, setPrizeLabels] = useState<string[]>(buildDefaultLabels(5));
  const [loading, setLoading] = useState(true);
  const [currentDatasetId, setCurrentDatasetId] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [measuring, setMeasuring] = useState(false);
  const [startTimestamp, setStartTimestamp] = useState<number | null>(null);
  
  // 各データセットのキャッシュ（独立した時間・データを保持）
  const [datasetCache, setDatasetCache] = useState<{
    [datasetId: string]: { counts: number[]; history: HistoryData[]; prizeLabels: string[] };
  }>({});
  const datasetCacheRef = useRef(datasetCache);

  useEffect(() => {
    datasetCacheRef.current = datasetCache;
  }, [datasetCache]);

  const normalizeDatasetId = (datasetId: string | null | undefined) => {
    const trimmed = String(datasetId ?? "").trim();
    if (!trimmed || trimmed === "undefined" || trimmed === "null") return null;
    return trimmed;
  };

  // 特定のデータセットを読み込む
  const loadDataset = useCallback(async (datasetId: string, options?: { silent?: boolean }) => {
    const normalizedId = normalizeDatasetId(datasetId);
    if (!normalizedId) {
      if (options?.silent) return;
      throw new Error('Invalid dataset id');
    }

    try {
      // キャッシュにあれば先にそれを使用（切り替え時の高速化）
      const cached = datasetCacheRef.current[normalizedId];
      if (cached) {
        setCounts(cached.counts);
        setHistory(cached.history);
        setPrizeLabels(cached.prizeLabels);
        setCurrentDatasetId(normalizedId);
        localStorage.setItem('selectedDatasetId', normalizedId);
        
        // バックグラウンドで最新データを取得
        try {
          const res = await fetch(`/api/datasets/${normalizedId}`);
          if (res.ok) {
            const data: Dataset = await res.json();
            const newCounts = data.counts || [0, 0, 0, 0, 0];
            const newPrizeLabels = (data.prizeLabels && data.prizeLabels.length === newCounts.length)
              ? data.prizeLabels
              : buildDefaultLabels(newCounts.length);
            const newCached = { counts: newCounts, history: data.history || [], prizeLabels: newPrizeLabels };
            setDatasetCache(prev => ({ ...prev, [normalizedId]: newCached }));
            setCounts(newCached.counts);
            setHistory(newCached.history);
            setPrizeLabels(newCached.prizeLabels);
          }
        } catch {
          // キャッシュ表示は成功しているため、バックグラウンド取得失敗は致命扱いにしない
        }
        return;
      }
      
      // キャッシュがなければサーバーから取得
      const res = await fetch(`/api/datasets/${normalizedId}`);
      if (!res.ok) throw new Error('Failed to load dataset');
      const data: Dataset = await res.json();
      
      const newCounts = data.counts || [0, 0, 0, 0, 0];
      const newHistory = data.history || [];
      const newPrizeLabels = (data.prizeLabels && data.prizeLabels.length === newCounts.length)
        ? data.prizeLabels
        : buildDefaultLabels(newCounts.length);
      
      setCounts(newCounts);
      setHistory(newHistory);
      setPrizeLabels(newPrizeLabels);
      setCurrentDatasetId(normalizedId);
      localStorage.setItem('selectedDatasetId', normalizedId);
      
      // キャッシュに保存
      setDatasetCache(prev => ({
        ...prev,
        [normalizedId]: { counts: newCounts, history: newHistory, prizeLabels: newPrizeLabels }
      }));
    } catch (error) {
      console.error('loadDataset error:', error);
      if (options?.silent) return;
      throw error;
    }
  }, []);

  // 認証状態を監視
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // ローカルストレージから前回選択したデータセットIDを取得
        const savedDatasetId = localStorage.getItem('selectedDatasetId');
        if (savedDatasetId) {
          try {
            await loadDataset(savedDatasetId, { silent: true });
          } catch (err) {
            console.error('Load dataset error:', err);
            // エラーが発生した場合は、ローカルストレージをクリア
            localStorage.removeItem('selectedDatasetId');
          }
        }
      }
      setLoading(false);
    });
    return () => unsubAuth();
  }, [loadDataset]);

  // データセット一覧を取得
  const fetchDatasets = async () => {
    try {
      const res = await fetch('/api/datasets');
      if (!res.ok) throw new Error('Failed to fetch datasets');
      const data = await res.json();
      setDatasets(data.datasets || []);
    } catch (error) {
      console.error('fetchDatasets error:', error);
      throw error;
    }
  };

  // データセット選択
  const selectDataset = async (datasetId: string) => {
    await loadDataset(datasetId, { silent: false });
  };

  // 選択されたデータセットのデータを定期的に再取得（ポーリング）
  useEffect(() => {
    if (!currentDatasetId) return;

    const fetchLatestData = async () => {
      try {
        const res = await fetch(`/api/datasets/${currentDatasetId}`);
        if (res.ok) {
          const data: Dataset = await res.json();
          
          const newCounts = data.counts || [0, 0, 0, 0, 0];
          const newHistory = data.history || [];
          const newPrizeLabels = (data.prizeLabels && data.prizeLabels.length === newCounts.length)
            ? data.prizeLabels
            : buildDefaultLabels(newCounts.length);
          
          // データが変更されている場合のみ更新
          setCounts(prev => JSON.stringify(prev) === JSON.stringify(newCounts) ? prev : newCounts);
          setHistory(prev => JSON.stringify(prev) === JSON.stringify(newHistory) ? prev : newHistory);
          setPrizeLabels(prev => JSON.stringify(prev) === JSON.stringify(newPrizeLabels) ? prev : newPrizeLabels);
          
          // キャッシュも同時に更新
          setDatasetCache(prev => ({
            ...prev,
            [currentDatasetId]: { counts: newCounts, history: newHistory, prizeLabels: newPrizeLabels }
          }));
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    };

    fetchLatestData();

    // 7秒ごとに最新データを取得（間隔を長くして負荷軽減）
    const interval = setInterval(fetchLatestData, 7000);

    return () => {
      clearInterval(interval);
    };
  }, [currentDatasetId]);

  const createHistoryEntry = (
    newCounts: number[],
    previousCounts: number[],
    options?: { memo?: string; memoPrizeIndex?: number }
  ): HistoryData => {
    const now = new Date();
    const entry: HistoryData = {
      timestamp: Date.now(),
      time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
    };

    if (options?.memo) {
      entry.memo = options.memo;
    }
    if (typeof options?.memoPrizeIndex === 'number') {
      entry.memoPrizeIndex = options.memoPrizeIndex;
      entry.memoCountValue = newCounts[options.memoPrizeIndex] ?? 0;
    }
    
    // 動的に p1, p2, p3... を追加
    newCounts.forEach((count, index) => {
      entry[`p${index + 1}`] = count;
      entry[`changedP${index + 1}`] = count !== previousCounts[index];
    });
    
    return entry;
  };

  const addHistory = async (newCounts: number[]) => {
    if (!currentDatasetId) throw new Error('No dataset selected');

    const isSameAsCurrent =
      counts.length === newCounts.length &&
      counts.every((value, index) => value === newCounts[index]);
    if (isSameAsCurrent) {
      return;
    }
    
    const previousCounts = counts;
    const newEntry = createHistoryEntry(newCounts, previousCounts);
    try {
      const res = await fetch(`/api/datasets/${currentDatasetId}/operations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addHistory', counts: newCounts, entry: newEntry }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || 'API update failed');
      if (result?.skipped) {
        return;
      }

      setCounts(newCounts);
      setHistory(prev => [...prev, newEntry]);
      setDatasetCache(prev => {
        const cached = prev[currentDatasetId];
        if (!cached) {
          return {
            ...prev,
            [currentDatasetId]: { counts: newCounts, history: [newEntry], prizeLabels },
          };
        }
        return {
          ...prev,
          [currentDatasetId]: {
            ...cached,
            counts: newCounts,
            history: [...cached.history, newEntry],
          },
        };
      });
    } catch (error) {
      console.error('addHistory error:', error);
      throw error;
    }
  };

  const addMemo = async (timestamp: number, memo: string) => {
    if (!currentDatasetId) throw new Error('No dataset selected');

    try {
      const normalizedMemo = typeof memo === 'string' ? memo.trim() : '';
      const res = await fetch(`/api/datasets/${currentDatasetId}/operations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addMemo', timestamp, memo: normalizedMemo }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || 'API update failed');
      if (!result?.updated) throw new Error('Memo update was not applied');

      // ローカルのhistoryを更新
      setHistory(prev => prev.map(entry => 
        entry.timestamp === timestamp ? { ...entry, memo: normalizedMemo } : entry
      ));
      
      // キャッシュも更新
      setDatasetCache(prev => {
        const cached = prev[currentDatasetId];
        if (!cached) return prev;
        return {
          ...prev,
          [currentDatasetId]: {
            ...cached,
            history: cached.history.map(entry =>
              entry.timestamp === timestamp ? { ...entry, memo: normalizedMemo } : entry
            ),
          },
        };
      });
    } catch (error) {
      console.error('addMemo error:', error);
      throw error;
    }
  };

  const addMemoPoint = async (prizeIndex: number, memo: string) => {
    if (!currentDatasetId) throw new Error('No dataset selected');
    if (!Number.isInteger(prizeIndex) || prizeIndex < 0 || prizeIndex >= counts.length) {
      throw new Error('Invalid prize index');
    }

    const normalizedMemo = typeof memo === 'string' ? memo.trim() : '';
    if (!normalizedMemo) {
      throw new Error('Memo is required');
    }

    const newEntry = createHistoryEntry(counts, counts, {
      memo: normalizedMemo,
      memoPrizeIndex: prizeIndex,
    });

    try {
      const res = await fetch(`/api/datasets/${currentDatasetId}/operations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addMemoPoint', counts, entry: newEntry }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || 'API update failed');

      setHistory(prev => [...prev, newEntry]);
      setDatasetCache(prev => {
        const cached = prev[currentDatasetId];
        if (!cached) {
          return {
            ...prev,
            [currentDatasetId]: { counts, history: [...history, newEntry], prizeLabels },
          };
        }
        return {
          ...prev,
          [currentDatasetId]: {
            ...cached,
            history: [...cached.history, newEntry],
          },
        };
      });
    } catch (error) {
      console.error('addMemoPoint error:', error);
      throw error;
    }
  };

  const resetData = async () => {
    if (!currentDatasetId) throw new Error('No dataset selected');
    
    try {
      const res = await fetch(`/api/datasets/${currentDatasetId}/operations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resetData' }),
      });
      if (!res.ok) {
        let errorDetail: Record<string, unknown> = {};
        try {
          errorDetail = await res.json();
        } catch {
          errorDetail = { text: await res.text() };
        }
        console.error("Server side error (Status:", res.status + "):", errorDetail);
        throw new Error(`API reset failed: ${JSON.stringify(errorDetail)}`);
      }

      setCounts(prev => Array(prev.length).fill(0));
      setHistory([]);
      setDatasetCache(prev => {
        const cached = prev[currentDatasetId];
        if (!cached) return prev;
        return {
          ...prev,
          [currentDatasetId]: {
            ...cached,
            counts: Array(cached.counts.length).fill(0),
            history: [],
          },
        };
      });
    } catch (error) {
      console.error('resetData error:', error);
      throw error;
    }
  };

  const resetContext = async (newCounts: number[]) => {
    if (!currentDatasetId) throw new Error('No dataset selected');
    
    try {
      const res = await fetch(`/api/datasets/${currentDatasetId}/operations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setCounts', counts: newCounts }),
      });
      if (!res.ok) {
        let errorDetail: Record<string, unknown> = {};
        try {
          errorDetail = await res.json();
        } catch {
          errorDetail = { text: await res.text() };
        }
        console.error("Server side error (Status:", res.status + "):", errorDetail);
        throw new Error(`API setCounts failed: ${JSON.stringify(errorDetail)}`);
      }

      setCounts(newCounts);
      setHistory([]);
      setDatasetCache(prev => {
        const cached = prev[currentDatasetId];
        if (!cached) {
          return {
            ...prev,
            [currentDatasetId]: { counts: newCounts, history: [], prizeLabels },
          };
        }
        return {
          ...prev,
          [currentDatasetId]: {
            ...cached,
            counts: newCounts,
            history: [],
          },
        };
      });
    } catch (error) {
      console.error('resetContext error:', error);
      throw error;
    }
  };

  const startMeasurement = () => {
    setMeasuring(true);
    setStartTimestamp(Date.now());
  };

  const endMeasurement = () => {
    setMeasuring(false);
  };

  return (
    <PrizeContext.Provider value={{ 
      counts, 
      history, 
      prizeLabels,
      addHistory, 
      addMemo,
      addMemoPoint,
      resetData, 
      resetContext, 
      loading,
      currentDatasetId,
      datasets,
      selectDataset,
      fetchDatasets,
      measuring,
      startTimestamp,
      startMeasurement,
      endMeasurement,
    }}>
      {!loading && children}
    </PrizeContext.Provider>
  );
}
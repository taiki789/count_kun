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

export type AccountingItem = {
  prizeIndex: number;
  label: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
};

export type AccountingRecord = {
  id: string;
  timestamp: number;
  time: string;
  totalAmount: number;
  receivedAmount: number;
  change: number;
  historyTimestamp: number;
  items: AccountingItem[];
};

export type Dataset = {
  id: string;
  name: string;
  counts: number[];
  history: HistoryData[];
  accountingHistory?: AccountingRecord[];
  mode?: OperationMode;
  prices?: number[];
  prizeLabels?: string[];
  initialCounts?: number[];
  createdAt: string;
  updatedAt: string;
  measuring?: boolean;
  startTimestamp?: number | null;
};

export type OperationMode = "inventory" | "accounting";

type PrizeContextType = {
  counts: number[];
  initialCounts: number[];
  prices: number[];
  mode: OperationMode;
  history: HistoryData[];
  accountingHistory: AccountingRecord[];
  prizeLabels: string[];
  addHistory: (newCounts: number[]) => Promise<void>;
  addMemo: (timestamp: number, memo: string) => Promise<void>;
  addMemoPoint: (prizeIndex: number, memo: string) => Promise<void>;
  completeAccountingTransaction: (options: { newCounts: number[]; record: AccountingRecord }) => Promise<void>;
  undoLastAction: () => Promise<void>;
  resetData: () => Promise<void>;
  resetContext: (newCounts: number[], newPrices?: number[]) => Promise<void>;
  loading: boolean;
  // データセット関連
  currentDatasetId: string | null;
  datasets: Dataset[];
  selectDataset: (datasetId: string) => Promise<void>;
  fetchDatasets: () => Promise<void>;
  // 計測関連
  measuring: boolean;
  startTimestamp: number | null;
  startMeasurement: () => Promise<void>;
  endMeasurement: () => Promise<void>;
};

export const PrizeContext = createContext<PrizeContextType>({} as PrizeContextType);

export function PrizeProvider({ children }: { children: ReactNode }) {
  const buildDefaultLabels = (length: number) => Array.from({ length }, (_, i) => `${i + 1}等`);
  const normalizePrices = (input: unknown, length: number) => {
    if (!Array.isArray(input)) return Array(length).fill(0);
    return Array.from({ length }, (_, index) => {
      const value = Number(input[index]);
      return Number.isFinite(value) && value >= 0 ? value : 0;
    });
  };
  const resolveMode = (input: unknown): OperationMode => (input === "accounting" ? "accounting" : "inventory");

  const [counts, setCounts] = useState<number[]>([0, 0, 0, 0, 0]);
  const [initialCounts, setInitialCounts] = useState<number[]>([0, 0, 0, 0, 0]);
  const [prices, setPrices] = useState<number[]>([0, 0, 0, 0, 0]);
  const [mode, setMode] = useState<OperationMode>("inventory");
  const [history, setHistory] = useState<HistoryData[]>([]);
  const [accountingHistory, setAccountingHistory] = useState<AccountingRecord[]>([]);
  const [prizeLabels, setPrizeLabels] = useState<string[]>(buildDefaultLabels(5));
  const [loading, setLoading] = useState(true);
  const [currentDatasetId, setCurrentDatasetId] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [measuring, setMeasuring] = useState(false);
  const [startTimestamp, setStartTimestamp] = useState<number | null>(null);
  
  // 各データセットのキャッシュ（独立した時間・データを保持）
  const [datasetCache, setDatasetCache] = useState<{
    [datasetId: string]: {
      counts: number[];
      initialCounts: number[];
      prices: number[];
      mode: OperationMode;
      history: HistoryData[];
      accountingHistory: AccountingRecord[];
      prizeLabels: string[];
    };
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
        setInitialCounts(cached.initialCounts);
        setPrices(cached.prices);
        setMode(cached.mode);
        setHistory(cached.history);
        setAccountingHistory(cached.accountingHistory);
        setPrizeLabels(cached.prizeLabels);
        setCurrentDatasetId(normalizedId);
        localStorage.setItem('selectedDatasetId', normalizedId);
        
        // バックグラウンドで最新データを取得
        try {
          const res = await fetch(`/api/datasets/${normalizedId}`);
          if (res.ok) {
            const data: Dataset = await res.json();
            const newCounts = data.counts || [0, 0, 0, 0, 0];
            const newInitialCounts = (data.initialCounts && data.initialCounts.length === newCounts.length)
              ? data.initialCounts
              : newCounts;
            const newPrizeLabels = (data.prizeLabels && data.prizeLabels.length === newCounts.length)
              ? data.prizeLabels
              : buildDefaultLabels(newCounts.length);
            const newPrices = normalizePrices(data.prices, newCounts.length);
            const newMode = resolveMode(data.mode);
            const newCached = {
              counts: newCounts,
              initialCounts: newInitialCounts,
              prices: newPrices,
              mode: newMode,
              history: data.history || [],
              accountingHistory: data.accountingHistory || [],
              prizeLabels: newPrizeLabels,
            };
            setDatasetCache(prev => ({ ...prev, [normalizedId]: newCached }));
            setCounts(newCached.counts);
            setInitialCounts(newCached.initialCounts);
            setPrices(newCached.prices);
            setMode(newCached.mode);
            setHistory(newCached.history);
            setAccountingHistory(newCached.accountingHistory);
            setPrizeLabels(newCached.prizeLabels);
            
            // 計測状態も同期
            if (typeof data.measuring === 'boolean') {
              setMeasuring(data.measuring);
            }
            if (typeof data.startTimestamp === 'number') {
              setStartTimestamp(data.startTimestamp);
            } else if (data.startTimestamp === null) {
              setStartTimestamp(null);
            }
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
      const newInitialCounts = (data.initialCounts && data.initialCounts.length === newCounts.length)
        ? data.initialCounts
        : newCounts;
      const newHistory = data.history || [];
      const newPrizeLabels = (data.prizeLabels && data.prizeLabels.length === newCounts.length)
        ? data.prizeLabels
        : buildDefaultLabels(newCounts.length);
      const newPrices = normalizePrices(data.prices, newCounts.length);
      const newMode = resolveMode(data.mode);
      
      setCounts(newCounts);
      setInitialCounts(newInitialCounts);
      setPrices(newPrices);
      setMode(newMode);
      setHistory(newHistory);
      setAccountingHistory(data.accountingHistory || []);
      setPrizeLabels(newPrizeLabels);
      setCurrentDatasetId(normalizedId);
      localStorage.setItem('selectedDatasetId', normalizedId);
      
      // 計測状態も同期
      if (typeof data.measuring === 'boolean') {
        setMeasuring(data.measuring);
      }
      if (typeof data.startTimestamp === 'number') {
        setStartTimestamp(data.startTimestamp);
      } else if (data.startTimestamp === null) {
        setStartTimestamp(null);
      }
      
      // キャッシュに保存
      setDatasetCache(prev => ({
        ...prev,
        [normalizedId]: {
          counts: newCounts,
          initialCounts: newInitialCounts,
          prices: newPrices,
          mode: newMode,
          history: newHistory,
          accountingHistory: data.accountingHistory || [],
          prizeLabels: newPrizeLabels,
        }
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
  const fetchDatasets = useCallback(async () => {
    try {
      const res = await fetch('/api/datasets');
      if (!res.ok) throw new Error('Failed to fetch datasets');
      const data = await res.json();
      setDatasets(data.datasets || []);
    } catch (error) {
      console.error('fetchDatasets error:', error);
      throw error;
    }
  }, []);

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
          const newInitialCounts = (data.initialCounts && data.initialCounts.length === newCounts.length)
            ? data.initialCounts
            : newCounts;
          const newPrices = normalizePrices(data.prices, newCounts.length);
          const newMode = resolveMode(data.mode);
          const newHistory = data.history || [];
          const newAccountingHistory = data.accountingHistory || [];
          const newPrizeLabels = (data.prizeLabels && data.prizeLabels.length === newCounts.length)
            ? data.prizeLabels
            : buildDefaultLabels(newCounts.length);
          
          // データが変更されている場合のみ更新
          setCounts(prev => JSON.stringify(prev) === JSON.stringify(newCounts) ? prev : newCounts);
          setInitialCounts(prev => JSON.stringify(prev) === JSON.stringify(newInitialCounts) ? prev : newInitialCounts);
          setPrices(prev => JSON.stringify(prev) === JSON.stringify(newPrices) ? prev : newPrices);
          setMode(prev => prev === newMode ? prev : newMode);
          setHistory(prev => JSON.stringify(prev) === JSON.stringify(newHistory) ? prev : newHistory);
          setAccountingHistory(prev => JSON.stringify(prev) === JSON.stringify(newAccountingHistory) ? prev : newAccountingHistory);
          setPrizeLabels(prev => JSON.stringify(prev) === JSON.stringify(newPrizeLabels) ? prev : newPrizeLabels);
          
          // 計測状態も同期
          if (typeof data.measuring === 'boolean') {
            setMeasuring(data.measuring);
          }
          if (typeof data.startTimestamp === 'number') {
            setStartTimestamp(data.startTimestamp);
          } else if (data.startTimestamp === null) {
            setStartTimestamp(null);
          }
          
          // キャッシュも同時に更新
          setDatasetCache(prev => ({
            ...prev,
            [currentDatasetId]: {
              counts: newCounts,
              initialCounts: newInitialCounts,
              prices: newPrices,
              mode: newMode,
              history: newHistory,
              accountingHistory: newAccountingHistory,
              prizeLabels: newPrizeLabels,
            }
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
            [currentDatasetId]: {
              counts: newCounts,
              initialCounts,
              prices,
              mode,
              history: [newEntry],
              accountingHistory,
              prizeLabels,
            },
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
            [currentDatasetId]: {
              counts,
              initialCounts,
              prices,
              mode,
              history: [...history, newEntry],
              accountingHistory,
              prizeLabels,
            },
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
      setAccountingHistory([]);
      setDatasetCache(prev => {
        const cached = prev[currentDatasetId];
        if (!cached) return prev;
        return {
          ...prev,
          [currentDatasetId]: {
            ...cached,
            counts: Array(cached.counts.length).fill(0),
            history: [],
            accountingHistory: [],
          },
        };
      });
    } catch (error) {
      console.error('resetData error:', error);
      throw error;
    }
  };

  const resetContext = async (newCounts: number[], newPrices?: number[]) => {
    if (!currentDatasetId) throw new Error('No dataset selected');
    const safePrices = normalizePrices(newPrices, newCounts.length);
    
    try {
      const res = await fetch(`/api/datasets/${currentDatasetId}/operations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setCounts', counts: newCounts, prices: safePrices }),
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
      setInitialCounts(newCounts);
      setPrices(safePrices);
      setHistory([]);
      setAccountingHistory([]);
      setDatasetCache(prev => {
        const cached = prev[currentDatasetId];
        if (!cached) {
          return {
            ...prev,
            [currentDatasetId]: {
              counts: newCounts,
              initialCounts: newCounts,
              prices: safePrices,
              mode,
              history: [],
              accountingHistory: [],
              prizeLabels,
            },
          };
        }
        return {
          ...prev,
          [currentDatasetId]: {
            ...cached,
            counts: newCounts,
            initialCounts: newCounts,
            prices: safePrices,
            history: [],
            accountingHistory: [],
          },
        };
      });
    } catch (error) {
      console.error('resetContext error:', error);
      throw error;
    }
  };

  const completeAccountingTransaction = async (options: { newCounts: number[]; record: AccountingRecord }) => {
    if (!currentDatasetId) throw new Error('No dataset selected');

    const previousCounts = counts;
    const newEntry = createHistoryEntry(options.newCounts, previousCounts);
    const newRecord: AccountingRecord = {
      ...options.record,
      historyTimestamp: newEntry.timestamp,
    };

    try {
      const res = await fetch(`/api/datasets/${currentDatasetId}/operations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'completeAccounting',
          counts: options.newCounts,
          entry: newEntry,
          accountingRecord: newRecord,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || 'Failed to complete accounting');

      setCounts(options.newCounts);
      setHistory(prev => [...prev, newEntry]);
      setAccountingHistory(prev => [...prev, newRecord]);
      setDatasetCache(prev => {
        const cached = prev[currentDatasetId];
        if (!cached) {
          return {
            ...prev,
            [currentDatasetId]: {
              counts: options.newCounts,
              initialCounts,
              prices,
              mode,
              history: [...history, newEntry],
              accountingHistory: [...accountingHistory, newRecord],
              prizeLabels,
            },
          };
        }
        return {
          ...prev,
          [currentDatasetId]: {
            ...cached,
            counts: options.newCounts,
            history: [...cached.history, newEntry],
            accountingHistory: [...cached.accountingHistory, newRecord],
          },
        };
      });
    } catch (error) {
      console.error('completeAccountingTransaction error:', error);
      throw error;
    }
  };

  const undoLastAction = async () => {
    if (!currentDatasetId) throw new Error('No dataset selected');

    try {
      const res = await fetch(`/api/datasets/${currentDatasetId}/operations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'undoLastAction' }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result?.error || 'Failed to undo last action');
      if (result?.skipped) return;

      const nextCounts = Array.isArray(result?.counts) ? result.counts.map((item: unknown) => Number(item) || 0) : counts;
      const nextHistory = Array.isArray(result?.history) ? result.history as HistoryData[] : history;
      const nextAccountingHistory = Array.isArray(result?.accountingHistory) ? result.accountingHistory as AccountingRecord[] : accountingHistory;

      setCounts(nextCounts);
      setHistory(nextHistory);
      setAccountingHistory(nextAccountingHistory);
      setDatasetCache(prev => {
        const cached = prev[currentDatasetId];
        if (!cached) {
          return {
            ...prev,
            [currentDatasetId]: {
              counts: nextCounts,
              initialCounts,
              prices,
              mode,
              history: nextHistory,
              accountingHistory: nextAccountingHistory,
              prizeLabels,
            },
          };
        }
        return {
          ...prev,
          [currentDatasetId]: {
            ...cached,
            counts: nextCounts,
            history: nextHistory,
            accountingHistory: nextAccountingHistory,
          },
        };
      });
    } catch (error) {
      console.error('undoLastAction error:', error);
      throw error;
    }
  };

  const startMeasurement = async () => {
    if (!currentDatasetId) return;
    
    try {
      const res = await fetch(`/api/datasets/${currentDatasetId}/operations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'startMeasurement' }),
      });
      if (!res.ok) throw new Error('Failed to start measurement');
      
      setMeasuring(true);
      setStartTimestamp(Date.now());
    } catch (error) {
      console.error('startMeasurement error:', error);
      throw error;
    }
  };

  const endMeasurement = async () => {
    if (!currentDatasetId) return;
    
    try {
      const res = await fetch(`/api/datasets/${currentDatasetId}/operations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'endMeasurement' }),
      });
      if (!res.ok) throw new Error('Failed to end measurement');
      
      setMeasuring(false);
    } catch (error) {
      console.error('endMeasurement error:', error);
      throw error;
    }
  };

  return (
    <PrizeContext.Provider value={{ 
      counts, 
      initialCounts,
      prices,
      mode,
      history, 
      accountingHistory,
      prizeLabels,
      addHistory, 
      addMemo,
      addMemoPoint,
      completeAccountingTransaction,
      undoLastAction,
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
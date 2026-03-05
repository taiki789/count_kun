"use client";

import React, { createContext, useState, useEffect, ReactNode } from "react";
import { auth } from "../lib/firebase"; 
import { onAuthStateChanged } from "firebase/auth";

export type HistoryData = {
  timestamp: number;
  time: string;
  [key: string]: number | string | boolean; // p1, p2... と changedP1, changedP2... を動的に持つ
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

  // 認証状態を監視
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // ローカルストレージから前回選択したデータセットIDを取得
        const savedDatasetId = localStorage.getItem('selectedDatasetId');
        if (savedDatasetId) {
          try {
            await loadDataset(savedDatasetId);
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
  }, []);

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

  // 特定のデータセットを読み込む
  const loadDataset = async (datasetId: string) => {
    try {
      console.log(`📂 Loading dataset: ${datasetId}`);
      
      // キャッシュにあれば先にそれを使用（切り替え時の高速化）
      if (datasetCache[datasetId]) {
        console.log(`✅ Using cached data for dataset: ${datasetId}`);
        const cached = datasetCache[datasetId];
        setCounts(cached.counts);
        setHistory(cached.history);
        setPrizeLabels(cached.prizeLabels);
        setCurrentDatasetId(datasetId);
        localStorage.setItem('selectedDatasetId', datasetId);
        
        // バックグラウンドで最新データを取得
        const res = await fetch(`/api/datasets/${datasetId}`);
        if (res.ok) {
          const data: Dataset = await res.json();
          const newCounts = data.counts || [0, 0, 0, 0, 0];
          const newPrizeLabels = (data.prizeLabels && data.prizeLabels.length === newCounts.length)
            ? data.prizeLabels
            : buildDefaultLabels(newCounts.length);
          const newCached = { counts: newCounts, history: data.history || [], prizeLabels: newPrizeLabels };
          setDatasetCache(prev => ({ ...prev, [datasetId]: newCached }));
          setCounts(newCached.counts);
          setHistory(newCached.history);
          setPrizeLabels(newCached.prizeLabels);
        }
        return;
      }
      
      // キャッシュがなければサーバーから取得
      const res = await fetch(`/api/datasets/${datasetId}`);
      if (!res.ok) throw new Error('Failed to load dataset');
      const data: Dataset = await res.json();
      console.log(`✅ Dataset loaded:`, data);
      
      const newCounts = data.counts || [0, 0, 0, 0, 0];
      const newHistory = data.history || [];
      const newPrizeLabels = (data.prizeLabels && data.prizeLabels.length === newCounts.length)
        ? data.prizeLabels
        : buildDefaultLabels(newCounts.length);
      
      setCounts(newCounts);
      setHistory(newHistory);
      setPrizeLabels(newPrizeLabels);
      setCurrentDatasetId(datasetId);
      localStorage.setItem('selectedDatasetId', datasetId);
      
      // キャッシュに保存
      setDatasetCache(prev => ({
        ...prev,
        [datasetId]: { counts: newCounts, history: newHistory, prizeLabels: newPrizeLabels }
      }));
    } catch (error) {
      console.error('❌ loadDataset error:', error);
      throw error;
    }
  };

  // データセット選択
  const selectDataset = async (datasetId: string) => {
    await loadDataset(datasetId);
  };

  // 選択されたデータセットのデータを定期的に再取得（ポーリング）
  useEffect(() => {
    if (!currentDatasetId) return;

    console.log(`🔄 Starting polling for dataset: ${currentDatasetId}`);

    // 初回取得
    const fetchLatestData = async () => {
      try {
        console.log(`📡 Polling dataset ${currentDatasetId}...`);
        const res = await fetch(`/api/datasets/${currentDatasetId}`);
        if (res.ok) {
          const data: Dataset = await res.json();
          console.log(`✅ Polling got data:`, data);
          
          const newCounts = data.counts || [0, 0, 0, 0, 0];
          const newHistory = data.history || [];
          const newPrizeLabels = (data.prizeLabels && data.prizeLabels.length === newCounts.length)
            ? data.prizeLabels
            : buildDefaultLabels(newCounts.length);
          
          setCounts(newCounts);
          setHistory(newHistory);
          setPrizeLabels(newPrizeLabels);
          
          // キャッシュも同時に更新
          setDatasetCache(prev => ({
            ...prev,
            [currentDatasetId]: { counts: newCounts, history: newHistory, prizeLabels: newPrizeLabels }
          }));
        } else {
          console.error(`❌ Polling response not ok: ${res.status}`);
        }
      } catch (error) {
        console.error('❌ Polling fetch error:', error);
      }
    };

    fetchLatestData();

    // 3秒ごとに最新データを取得
    const interval = setInterval(fetchLatestData, 3000);

    return () => {
      console.log(`⏹️ Stopping polling for dataset: ${currentDatasetId}`);
      clearInterval(interval);
    };
  }, [currentDatasetId]);

  const createHistoryEntry = (newCounts: number[], previousCounts: number[]): HistoryData => {
    const now = new Date();
    const entry: HistoryData = {
      timestamp: Date.now(),
      time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
    };
    
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

  const resetData = async () => {
    if (!currentDatasetId) throw new Error('No dataset selected');
    
    try {
      const res = await fetch(`/api/datasets/${currentDatasetId}/operations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resetData' }),
      });
      if (!res.ok) {
        let errorDetail: any = {};
        try {
          errorDetail = await res.json();
        } catch (e) {
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
        let errorDetail: any = {};
        try {
          errorDetail = await res.json();
        } catch (e) {
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
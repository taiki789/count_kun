"use client";

import React, { createContext, useState, useEffect, ReactNode } from "react";
import { db, auth } from "../lib/firebase"; 
import { doc, onSnapshot, updateDoc, setDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

// 1. 型定義に timestamp を追加
export type HistoryData = {
  timestamp: number; // 時間間隔を計算するためのミリ秒
  time: string;      // 念のための表示用文字列
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  p5: number;
};

type PrizeContextType = {
  counts: number[];
  history: HistoryData[];
  addHistory: (newCounts: number[]) => Promise<void>;
  resetContext: (initialCounts: number[]) => Promise<void>;
  resetData: () => Promise<void>;
  loading: boolean;
};

export const PrizeContext = createContext<PrizeContextType>({} as PrizeContextType);

export function PrizeProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<number[]>([0, 0, 0, 0, 0]);
  const [history, setHistory] = useState<HistoryData[]>([]);
  const [loading, setLoading] = useState(true);

  const docId = "global-prize-counter";

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const unsubSnapshot = onSnapshot(doc(db, "prizes", docId), (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setCounts(data.counts);
            setHistory(data.history || []);
          } else {
            setDoc(doc(db, "prizes", docId), { counts: [0, 0, 0, 0, 0], history: [] });
          }
          setLoading(false);
        });
        return () => unsubSnapshot();
      } else {
        setLoading(false);
      }
    });

    return () => unsubAuth();
  }, []);

  // 2. 履歴データを作成する共通関数
  const createHistoryEntry = (newCounts: number[]): HistoryData => {
    const now = new Date();
    return {
      timestamp: Date.now(), // グラフの間隔計算に使用
      time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
      p1: newCounts[0],
      p2: newCounts[1],
      p3: newCounts[2],
      p4: newCounts[3],
      p5: newCounts[4],
    };
  };

  const addHistory = async (newCounts: number[]) => {
    const newEntry = createHistoryEntry(newCounts);

    await updateDoc(doc(db, "prizes", docId), {
      counts: newCounts,
      history: [...history, newEntry] 
    });
  };

  const resetData = async () => {
    await updateDoc(doc(db, "prizes", docId), {
      counts: [0, 0, 0, 0, 0],
      history: [] 
    });
  };

  const resetContext = async (initialCounts: number[]) => {
    // 最初の1点を現在の時間で作成
    const firstEntry = createHistoryEntry(initialCounts);

    await updateDoc(doc(db, "prizes", docId), {
      counts: initialCounts,
      history: [firstEntry] 
    });
  };

  return (
    <PrizeContext.Provider value={{ counts, history, addHistory, resetContext, resetData, loading }}>
      {!loading && children}
    </PrizeContext.Provider>
  );
}
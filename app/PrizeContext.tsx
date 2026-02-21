"use client";

import React, { createContext, useState, ReactNode } from "react";

// グラフに渡すための履歴データの型
export type HistoryData = {
  time: string; // "14:30:05" のような時間
  p1: number;   // 1等の数
  p2: number;
  p3: number;
  p4: number;
  p5: number;
};

type PrizeContextType = {
  counts: number[];
  setCounts: (counts: number[]) => void;
  history: HistoryData[];
  addHistory: (newCounts: number[]) => void;
  resetContext: (initialCounts: number[]) => void;
  resetData: () => void;
};

export const PrizeContext = createContext<PrizeContextType>({} as PrizeContextType);

export function PrizeProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<number[]>([0, 0, 0, 0, 0]);
  const [history, setHistory] = useState<HistoryData[]>([]);

  // 履歴を追加する関数（現在時刻を取得して記録）
  const addHistory = (newCounts: number[]) => {
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    
    setHistory((prev) => [
      ...prev,
      {
        time: timeString,
        p1: newCounts[0],
        p2: newCounts[1],
        p3: newCounts[2],
        p4: newCounts[3],
        p5: newCounts[4],
      },
    ]);
  };
  const resetData = () => {
    setCounts([0, 0, 0, 0, 0]);
    setHistory([]);
  };

  // 設定画面から初期値がセットされた時の処理
  const resetContext = (initialCounts: number[]) => {
    setCounts(initialCounts);
    // 履歴をリセットし、初期状態を記録
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    setHistory([{
      time: timeString,
      p1: initialCounts[0],
      p2: initialCounts[1],
      p3: initialCounts[2],
      p4: initialCounts[3],
      p5: initialCounts[4],
    }]);
  };

  return (
    <PrizeContext.Provider value={{ counts, setCounts, history, addHistory, resetContext, resetData }}>
      {children}
    </PrizeContext.Provider>
  );
}



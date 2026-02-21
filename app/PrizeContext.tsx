"use client";

import React, { createContext, useState, useEffect, ReactNode } from "react";
import { db, auth } from "../lib/firebase"; 
import { doc, onSnapshot, updateDoc, setDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export type HistoryData = {
  time: string;
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
    // 1. ログイン状態を監視
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        // 2. ログインしていたら Firestore の監視を開始
        const unsubSnapshot = onSnapshot(doc(db, "prizes", docId), (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            // Firestore から届いた最新データを state に入れる（これで全員が同期）
            setCounts(data.counts);
            setHistory(data.history || []);
          } else {
            // データが存在しない場合のみ初期作成
            setDoc(doc(db, "prizes", docId), { counts: [0,0,0,0,0], history: [] });
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

  const getTimeString = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  };

  // 在庫を1つ減らした時の「同期」用
  const addHistory = async (newCounts: number[]) => {
    const newEntry: HistoryData = {
      time: getTimeString(),
      p1: newCounts[0], p2: newCounts[1], p3: newCounts[2], p4: newCounts[3], p5: newCounts[4],
    };

    await updateDoc(doc(db, "prizes", docId), {
      counts: newCounts,
      // 既存の履歴に新しい1点を追加して保存
      history: [...history, newEntry] 
    });
  };

  // 全データを空にするリセット
  const resetData = async () => {
    await updateDoc(doc(db, "prizes", docId), {
      counts: [0, 0, 0, 0, 0],
      history: [] // 履歴を空の配列にする（グラフが白紙になる）
    });
  };

  // 【重要】設定画面から新しい在庫を入れた時の「白紙スタート」処理
  const resetContext = async (initialCounts: number[]) => {
    const firstEntry: HistoryData = {
      time: getTimeString(),
      p1: initialCounts[0], p2: initialCounts[1], p3: initialCounts[2], p4: initialCounts[3], p5: initialCounts[4],
    };

    await updateDoc(doc(db, "prizes", docId), {
      counts: initialCounts,
      // 以前の履歴を捨てて、新しい初期値の1点だけにする（これでグラフがリセットされる）
      history: [firstEntry] 
    });
  };

  return (
    <PrizeContext.Provider value={{ counts, history, addHistory, resetContext, resetData, loading }}>
      {!loading && children}
    </PrizeContext.Provider>
  );
}
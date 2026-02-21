"use client";

import React, { createContext, useState, useEffect, ReactNode } from "react";
// ▼ auth をインポート (パスはプロジェクトに合わせて調整してください)
import { db, auth } from "../lib/firebase"; 
import { doc, onSnapshot, updateDoc, setDoc } from "firebase/firestore";
// ▼ onAuthStateChanged を firebase/auth からインポート
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

  // 共有ドキュメントのID（全てのユーザーでこのIDを参照します）
  const docId = "global-prize-counter";

  // --- リアルタイム同期設定 ---

  useEffect(() => {
   const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        // ユーザーがいる時だけ監視を開始
        const unsubSnapshot = onSnapshot(doc(db, "prizes", docId), (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setCounts(data.counts);
            setHistory(data.history || []);
          } else {
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

  // 現在時刻の文字列を生成するヘルパー
  const getTimeString = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  };

  // --- データの更新（Firestoreへ書き込み） ---

  // 1つ減らした時などに履歴を追加
  const addHistory = async (newCounts: number[]) => {
    const newEntry: HistoryData = {
      time: getTimeString(),
      p1: newCounts[0],
      p2: newCounts[1],
      p3: newCounts[2],
      p4: newCounts[3],
      p5: newCounts[4],
    };

    await updateDoc(doc(db, "prizes", docId), {
      counts: newCounts,
      history: [...history, newEntry] // 履歴を配列に追加
    });
  };

  // 全リセット
  const resetData = async () => {
    await updateDoc(doc(db, "prizes", docId), {
      counts: [0, 0, 0, 0, 0],
      history: []
    });
  };

  // 設定画面からの初期化
  const resetContext = async (initialCounts: number[]) => {
    const firstEntry: HistoryData = {
      time: getTimeString(),
      p1: initialCounts[0],
      p2: initialCounts[1],
      p3: initialCounts[2],
      p4: initialCounts[3],
      p5: initialCounts[4],
    };

    await updateDoc(doc(db, "prizes", docId), {
      counts: initialCounts,
      history: [firstEntry] // 履歴をリセットして最初の1点を記録
    });
  };

  return (
    <PrizeContext.Provider value={{ counts, history, addHistory, resetContext, resetData, loading }}>
      {/* 読み込みが終わるまで中身を表示しない、もしくはloadingを渡して各ページで処理 */}
      {!loading && children}
    </PrizeContext.Provider>
  );
}
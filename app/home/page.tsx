"use client";

import React, { useContext, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { PrizeContext } from "../PrizeContext";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export default function Home() {
  const router = useRouter();
  // loading を追加して、データ取得前のチラつきを防止
  const { counts, history, addHistory, resetData, loading } = useContext(PrizeContext);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
      }
    });
    return () => unsub();
  }, [router]);

  // 引くボタンを押した時の処理
  const handleDraw = async (index: number) => {
    if (counts[index] <= 0) return;

    // 現在のカウントをコピーして、該当する等級を1減らす
    const newCounts = [...counts];
    newCounts[index] -= 1;

    // Firestoreを更新しにいく（これで全員の画面が同期される）
    try {
      await addHistory(newCounts);
    } catch (error) {
      console.error("更新に失敗しました:", error);
      alert("通信エラーが発生しました。");
    }
  };

  const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6"];

  // 読み込み中は何も表示しない、またはローディング画面を出す
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="animate-pulse font-bold text-gray-400">LOADING DATA...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0">
      
      {/* --- PC版 UI --- */}
      <div className="hidden md:flex flex-col h-screen bg-gray-100">
        <header className="bg-white border-b px-8 py-4 flex justify-between items-center shadow-sm">
           <div className="flex items-center gap-2">
             <img src="/favicon.ico" alt="favicon" className="w-6 h-6" />
             <h1 className="text-2xl font-black text-gray-800 tracking-tighter">Count kun</h1>
           </div>
           {/* resetData も Firestore 対応版を呼び出す */}
          <button onClick={() => confirm("全データをリセットしますか？この操作は全員に反映されます。") && resetData()} className="text-xs font-bold text-gray-400 hover:text-red-500 border border-gray-200 px-4 py-2 rounded-lg transition-all">RESET DATA</button>
        </header>

        <main className="flex-1 overflow-hidden p-8 grid grid-cols-12 gap-8">
          <div className="col-span-8 bg-white p-6 rounded-3xl shadow-sm border border-gray-200">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Legend />
                {[1, 2, 3, 4, 5].map((rank, i) => (
                  <Line key={rank} type="stepAfter" dataKey={`p${rank}`} stroke={colors[i]} strokeWidth={4} dot={false} name={`${rank}等`} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="col-span-4 space-y-3 overflow-y-auto">
            {counts.map((count: number, i: number) => (
              <div key={i} className="bg-white p-4 rounded-xl border border-gray-200 flex items-center justify-between shadow-sm">
                <p className="font-bold text-gray-500">{i + 1}等: {count}</p>
                <button 
                  onClick={() => handleDraw(i)} 
                  disabled={count === 0} 
                  className="bg-black text-white px-4 py-1 rounded-lg text-sm disabled:opacity-20 active:scale-95 transition-transform"
                >
                  DRAW
                </button>
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* --- 携帯版 UI --- */}
      <div className="md:hidden flex flex-col h-screen overflow-hidden">
        <div className="flex-1 p-4">
          <div className="text-center mb-2 flex flex-col items-center">
            <img src="/favicon.ico" alt="favicon" className="w-5 h-5 mb-1" />
            <h1 className="text-sm font-black text-gray-400 tracking-widest uppercase">Count kun</h1>
          </div>
          <div className="h-full max-h-[300px] w-full bg-gray-50 rounded-2xl p-2 border border-gray-100 shadow-inner">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                <XAxis dataKey="time" fontSize={9} />
                <YAxis fontSize={9} axisLine={false} />
                <Tooltip contentStyle={{ fontSize: '10px' }} />
                {[1, 2, 3, 4, 5].map((rank, i) => (
                  <Line key={rank} type="stepAfter" dataKey={`p${rank}`} stroke={colors[i]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border-t p-4 pb-8 shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between items-end gap-2 overflow-x-auto pb-2">
            {counts.map((count: number, i: number) => (
              <button
                key={i}
                onClick={() => handleDraw(i)}
                disabled={count === 0}
                className={`
                  flex-1 min-w-[60px] aspect-[3/4] rounded-xl flex flex-col items-center justify-center transition-all border-b-4
                  active:translate-y-1 active:border-b-0
                  ${count === 0 
                    ? "bg-gray-100 text-gray-300 border-gray-300 shadow-none pointer-events-none" 
                    : "bg-white text-gray-900 border-gray-200 shadow-md"}
                `}
              >
                <span className="text-[10px] font-bold opacity-50">{i + 1}等</span>
                <span className={`text-xl font-black ${count <= 3 && count > 0 ? "text-orange-500" : ""}`}>
                  {count}
                </span>
                <div className="mt-1 w-4 h-[2px] rounded-full" style={{ backgroundColor: colors[i] }}></div>
              </button>
            ))}
          </div>
          <p className="text-[9px] text-center text-gray-300 mt-3 uppercase tracking-widest">
            Tap to draw prize
          </p>
        </div>
      </div>
    </div>
  );
}
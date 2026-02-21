"use client";

import React, { useContext } from "react";
import { PrizeContext } from "../PrizeContext";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export default function Home() {
  const { counts, setCounts, history, addHistory, resetData } = useContext(PrizeContext);

  const handleDraw = (index: number) => {
    if (counts[index] <= 0) return;
    const newCounts = [...counts];
    newCounts[index] -= 1;
    setCounts(newCounts);
    addHistory(newCounts);
  };

  const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6"];

  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0">
      
      {/* --- PC版 UI (変更なし) --- */}
      <div className="hidden md:flex flex-col h-screen bg-gray-100">
        {/* 前回のPC版コードをそのまま維持 */}
        <header className="bg-white border-b px-8 py-4 flex justify-between items-center shadow-sm">
           <img src="/favicon.ico" alt="favicon" className="w-6 h-6" />
           <div className="flex flex-col">
              <h1 className="text-2xl font-black text-gray-800 tracking-tighter">Count kun</h1>
           </div>
          <button onClick={() => confirm("リセットしますか？") && resetData()} className="text-xs font-bold text-gray-400 hover:text-red-500 border border-gray-200 px-4 py-2 rounded-lg transition-all">RESET DATA</button>
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
          <div className="col-span-4 space-y-3">
            {counts.map((count, i) => (
              <div key={i} className="bg-white p-4 rounded-xl border border-gray-200 flex items-center justify-between shadow-sm">
                <p className="font-bold text-gray-500">{i + 1}等: {count}</p>
                <button onClick={() => handleDraw(i)} disabled={count === 0} className="bg-black text-white px-4 py-1 rounded-lg text-sm disabled:opacity-20">DRAW</button>
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* ---------------------------------------------------------
          【携帯版 UI】(ボタンを横並び・コンパクトに修正)
      --------------------------------------------------------- */}
      <div className="md:hidden flex flex-col h-screen overflow-hidden">
        {/* グラフエリア（スマホ版：上部に配置して常に状況を確認） */}
        <div className="flex-1 p-4">
          <div className="text-center mb-2">
            <img src="/favicon.ico" alt="favicon" className="w-6 h-6" />
            <h1 className="text-sm font-black text-gray-400 tracking-widest">Count kun</h1>
          </div>
          <div className="h-full max-h-[300px] w-full bg-gray-50 rounded-2xl p-2 border border-gray-100">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                <XAxis dataKey="time" fontSize={9} />
                <YAxis fontSize={9} axisLine={false} />
                <Tooltip />
                {[1, 2, 3, 4, 5].map((rank, i) => (
                  <Line key={rank} type="stepAfter" dataKey={`p${rank}`} stroke={colors[i]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 操作エリア（下部にコンパクトな横並びボタンを配置） */}
        <div className="bg-white border-t p-4 pb-8 shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between items-end gap-2 overflow-x-auto pb-2">
            {counts.map((count, i) => (
              <button
                key={i}
                onClick={() => handleDraw(i)}
                disabled={count === 0}
                className={`
                  flex-1 min-w-[60px] aspect-[3/4] rounded-xl flex flex-col items-center justify-center transition-all border-b-4
                  active:translate-y-1 active:border-b-0
                  ${count === 0 
                    ? "bg-gray-100 text-gray-300 border-gray-200 shadow-none" 
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
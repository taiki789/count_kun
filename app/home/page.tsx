"use client";

import React, { useContext, useEffect, useState } from "react";
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
  const { counts, history, prizeLabels, addHistory, resetData, loading, currentDatasetId, measuring, startMeasurement, endMeasurement } = useContext(PrizeContext);
  const [isAdmin, setIsAdmin] = useState(false);
  const [datasetLoaded, setDatasetLoaded] = useState(false);

  // 賞品数に応じて色を動的に生成
  const baseColors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#06b6d4", "#10b981", "#6366f1", "#a855f7", "#14b8a6", "#f59e0b", "#84cc16", "#64748b", "#dc2626", "#7c3aed", "#db2777", "#0ea5e9"];
  const colors = counts.map((_, i) => baseColors[i % baseColors.length]);
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
      } else if (user.email === adminEmail) {
        setIsAdmin(true);
      }
    });
    return () => unsub();
  }, [router, adminEmail]);

  // データセットが切り替わった時に検知してデータローディング完了待機
  useEffect(() => {
    if (currentDatasetId && counts.length > 0) {
      console.log(`📊 Dataset ready on homepage:`, { 
        currentDatasetId, 
        counts, 
        historyLength: history.length,
        historyData: history.slice(0, 3) // 最初の3件を確認
      });
      setDatasetLoaded(true);
    }
  }, [currentDatasetId, counts, history]);

  // 時間フォーマット関数 (Unixタイムスタンプを HH:mm 形式へ)
  const formatTime = (tick: any) => {
    if (!tick) return "";
    const date = new Date(tick);
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const handleDraw = async (index: number) => {
    if (counts[index] <= 0) return;
    
    const newCounts = [...counts];
    newCounts[index] -= 1;

    try {
      await addHistory(newCounts);
    } catch (error) {
      console.error("更新失敗:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-black border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-xs font-black tracking-widest text-gray-400">LOADING...</p>
        </div>
      </div>
    );
  }

  // グラフ描画用コンポーネント（動的に賞品数に対応）
  const renderChangedOnlyDot = (seriesIndex: number, color: string) => (dotProps: any) => {
    const { cx, cy, payload, index } = dotProps || {};
    if (typeof cx !== "number" || typeof cy !== "number") return null;

    const changedKey = `changedP${seriesIndex + 1}`;
    const valueKey = `p${seriesIndex + 1}`;
    const changedByFlag = payload?.[changedKey] === true;

    let changedByDiff = false;
    if (!changedByFlag && typeof index === "number" && index > 0) {
      const prev = history[index - 1] as any;
      const prevValue = prev?.[valueKey];
      const currentValue = payload?.[valueKey];
      changedByDiff = typeof prevValue === "number" && typeof currentValue === "number" && prevValue !== currentValue;
    }

    if (!changedByFlag && !changedByDiff) return null;

    return <circle cx={cx} cy={cy} r={4} fill={color} stroke="#fff" strokeWidth={2} />;
  };

  const renderLineContent = () => counts.map((_, i) => (
    <Line
      key={i + 1}
      type="monotone" // 点と点を滑らかにつなぐ
      dataKey={`p${i + 1}`}
      stroke={colors[i]}
      strokeWidth={3}
      dot={renderChangedOnlyDot(i, colors[i])}
      activeDot={{ r: 6, strokeWidth: 0 }}
      animationDuration={1000}
      connectNulls={true}
    />
  ));

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-24 md:pb-0 font-sans">
      
      {/* --- PC版 --- */}
      <div className="hidden md:flex flex-col h-screen">
        <header className="bg-white border-b px-10 py-5 flex justify-between items-center shadow-sm">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => router.push("/select-dataset")}>
              <img src="/favicon.ico" alt="icon" className="w-10 h-10" />
              <h1 className="text-2xl font-black text-gray-900 tracking-tighter">Count kun</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => router.push("/select-dataset")}
              className="text-[10px] font-black text-gray-400 hover:text-indigo-500 border border-gray-200 px-5 py-2 rounded-full transition-all tracking-widest"
            >
              📊 データセット変更
            </button>
            <button 
              onClick={() => {
                endMeasurement();
                if (typeof window !== "undefined") {
                  sessionStorage.setItem("measurementEndedLockBack", "1");
                }
                router.replace("/results");
              }}
              disabled={!measuring}
              className={`text-[10px] font-black px-5 py-2 rounded-full transition-all tracking-widest shadow-lg ${
                measuring
                  ? "text-white bg-red-500 hover:bg-red-600"
                  : "text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed opacity-50"
              }`}
            >
              ⏹️ 計測終了
            </button>
            {isAdmin && (
              <button 
                onClick={() => router.push("/admin")}
                className="text-[10px] font-black text-gray-400 hover:text-purple-500 border border-gray-200 px-5 py-2 rounded-full transition-all tracking-widest"
              >
                🔐 管理
              </button>
            )}
            <button 
              onClick={async () => {
                if (confirm("リセットしますか？")) {
                  try {
                    await resetData();
                    alert("リセット完了しました");
                  } catch (error) {
                    console.error("リセット失敗:", error);
                    alert("リセットに失敗しました。環境変数の設定を確認してください。");
                  }
                }
              }}
              className="text-[10px] font-black text-gray-400 hover:text-red-500 border border-gray-200 px-5 py-2 rounded-full transition-all tracking-widest"
            >
              RESET DATA
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-hidden p-10 grid grid-cols-12 gap-10">
          <div className="col-span-8 bg-white p-8 rounded-[32px] shadow-xl shadow-gray-200/50 border border-gray-100">
            {history.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <p className="text-sm font-semibold mb-2">グラフデータなし</p>
                  <p className="text-xs text-gray-300">DRAW ボタンでカウントを記録してください</p>
                </div>
              </div>
            ) : (
              <>
                {console.log(`📈 Rendering graph with ${history.length} data points:`, history)}
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
                    <XAxis 
                      dataKey="timestamp" // UnixTimeを使用
                      type="number"       // これにより時間幅が可変になる
                      domain={['dataMin', 'dataMax']} 
                      tickFormatter={formatTime}
                      fontSize={12}
                      tickMargin={15}
                      axisLine={false}
                      tickLine={false}
                      stroke="#ADB5BD"
                    />
                    <YAxis fontSize={12} axisLine={false} tickLine={false} stroke="#ADB5BD" />
                    <Tooltip 
                      labelFormatter={(val) => `時刻: ${formatTime(val)}`}
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }} 
                    />
                    <Legend iconType="circle" verticalAlign="top" align="right" height={50} />
                    {renderLineContent()}
                  </LineChart>
                </ResponsiveContainer>
              </>
            )}
          </div>

          <div className="col-span-4 space-y-4 overflow-y-auto pr-2">
            {counts.map((count: number, i: number) => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 flex items-center justify-between hover:shadow-md transition-shadow">
                <div>
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">{prizeLabels[i] || `${i + 1}等`}</p>
                  <p className="text-3xl font-black text-gray-900">{count}</p>
                </div>
                <button 
                  onClick={() => handleDraw(i)}
                  disabled={count === 0}
                  className="bg-gray-900 text-white px-8 py-3 rounded-xl font-bold disabled:opacity-10 active:scale-95 transition-all"
                >
                  DRAW
                </button>
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* --- 携帯版 --- */}
      <div className="md:hidden flex flex-col h-screen overflow-y-auto bg-white">
        <div className="flex-1 p-5 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <img src="/favicon.ico" alt="icon" className="w-10 h-10" />
            <h1 className="text-[12px] font-black text-gray-900 tracking-[0.3em] uppercase">Count kun</h1>
            <div className="flex gap-2">
              {measuring && (
                <button 
                  onClick={() => {
                    endMeasurement();
                    if (typeof window !== "undefined") {
                      sessionStorage.setItem("measurementEndedLockBack", "1");
                    }
                    router.replace("/results");
                  }}
                  className="text-[8px] font-black text-white bg-red-500 px-3 py-1 rounded-full"
                >
                  終了
                </button>
              )}
              <button 
                onClick={() => router.push("/select-dataset")}
                className="text-[8px] font-black text-gray-400 hover:text-indigo-600 px-2 py-1 rounded"
              >
                選択
              </button>
            </div>
          </div>
          
          <div className="flex-1 min-h-[300px] w-full bg-gray-50 rounded-[40px] p-5 shadow-inner border border-gray-100">
            {history.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center text-[12px]">
                  <p className="font-semibold mb-1">グラフデータなし</p>
                  <p className="text-[10px] text-gray-300">DRAW モードでカウント記録へ</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E9ECEF" />
                  <XAxis 
                    dataKey="timestamp" 
                    type="number" 
                    domain={['dataMin', 'dataMax']} 
                    tickFormatter={formatTime}
                    fontSize={10}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis fontSize={10} axisLine={false} tickLine={false} />
                  {renderLineContent()}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 携帯版 下部ナビゲーション兼操作パネル */}
        <div className="bg-white border-t border-gray-100 p-6 pb-20 rounded-t-[48px] shadow-[0_-25px_50px_-12px_rgba(0,0,0,0.08)] flex-shrink-0">
          <div className={`grid gap-3 mb-8 ${counts.length <= 5 ? 'grid-cols-5' : counts.length <= 10 ? 'grid-cols-5' : 'grid-cols-6'}`}>
            {counts.map((count: number, i: number) => (
              <button
                key={i}
                onClick={() => handleDraw(i)}
                disabled={count === 0}
                className={`
                  aspect-[4/5] rounded-2xl flex flex-col items-center justify-center transition-all
                  ${count === 0 ? "bg-gray-50 text-gray-200" : "bg-white shadow-lg border border-gray-100 active:scale-90"}
                `}
              >
                <span className="text-[10px] font-black opacity-50 mb-1 max-w-[64px] truncate">{prizeLabels[i] || `${i + 1}等`}</span>
                <span className={`text-xl font-black ${count <= 3 && count > 0 ? "text-orange-500" : "text-gray-900"}`}>{count}</span>
                <div className="w-4 h-[3px] rounded-full mt-2" style={{ backgroundColor: colors[i] }}></div>
              </button>
            ))}
          </div>
          
          <div className="flex gap-3 mb-3">
            <button 
              onClick={() => router.push("/select-dataset")}
              className="flex-1 py-3 bg-indigo-600 text-white font-black rounded-xl transition-all active:scale-[0.98] text-sm"
            >
              📊 データセット変更
            </button>
            {isAdmin && (
              <button 
                onClick={() => router.push("/admin")}
                className="flex-1 py-3 bg-purple-600 text-white font-black rounded-xl transition-all active:scale-[0.98] text-sm"
              >
                🔐 管理
              </button>
            )}
          </div>
          
          <button 
            onClick={() => router.push("/")}
            className="w-full py-5 bg-gray-900 text-white font-black rounded-2xl shadow-xl shadow-gray-200 active:scale-[0.98] transition-all tracking-[0.2em] text-sm uppercase"
          >
            Exit to Home
          </button>
        </div>
      </div>
    </div>
  );
}
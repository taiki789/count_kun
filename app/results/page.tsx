"use client";

import React, { useContext, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { auth } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { PrizeContext, Dataset } from "../PrizeContext";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export default function Results() {
  const router = useRouter();
  const { counts, history, prizeLabels, resetData, loading, currentDatasetId, startTimestamp } = useContext(PrizeContext);
  const [currentDataset, setCurrentDataset] = useState<Dataset | null>(null);
  const [peakHour, setPeakHour] = useState<string>("");

  const baseColors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#06b6d4", "#10b981", "#6366f1", "#a855f7", "#14b8a6", "#f59e0b", "#84cc16", "#64748b", "#dc2626", "#7c3aed", "#db2777", "#0ea5e9"];
  const colors = counts.map((_, i) => baseColors[i % baseColors.length]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
      }
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const lockBack = sessionStorage.getItem("measurementEndedLockBack") === "1";
    if (!lockBack) return;

    const currentUrl = window.location.href;
    window.history.pushState(null, "", currentUrl);
    const blockBack = () => {
      window.history.pushState(null, "", currentUrl);
    };

    window.addEventListener("popstate", blockBack);
    return () => {
      window.removeEventListener("popstate", blockBack);
    };
  }, []);

  // 現在のデータセット情報を取得
  useEffect(() => {
    const fetchCurrentDataset = async () => {
      if (!currentDatasetId) return;
      try {
        const res = await fetch(`/api/datasets/${currentDatasetId}`);
        if (res.ok) {
          const data: Dataset = await res.json();
          setCurrentDataset(data);
        }
      } catch (error) {
        console.error("Failed to fetch dataset:", error);
      }
    };
    fetchCurrentDataset();
  }, [currentDatasetId]);

  // ピーク時刻を計算（すべてのプライズの販売数合計が最大の30分間を算出）
  useEffect(() => {
    if (history.length === 0 || !startTimestamp) return;

    // 30分ごとのスロットに販売数を集計
    const thirtyMinSlots: { [slot: string]: number } = {};
    
    for (let i = 1; i < history.length; i++) {
      const prevEntry = history[i - 1] as any;
      const currentEntry = history[i] as any;
      const currentDate = new Date(currentEntry.timestamp);
      const hours = currentDate.getHours();
      const minutes = currentDate.getMinutes();
      
      // 30分ごとのスロットを計算（例: "12:00", "12:30"）
      const slotMinutes = minutes < 30 ? 0 : 30;
      const slotKey = `${String(hours).padStart(2, '0')}:${String(slotMinutes).padStart(2, '0')}`;
      
      // すべてのプライズ（p1～p5）の販売数合計を計算
      let totalSalesInSlot = 0;
      for (let j = 1; j <= 5; j++) {
        const key = `p${j}`;
        const prevCount = typeof prevEntry[key] === "number" ? prevEntry[key] : 0;
        const currentCount = typeof currentEntry[key] === "number" ? currentEntry[key] : 0;
        const sales = Math.max(0, prevCount - currentCount);
        totalSalesInSlot += sales;
      }
      
      thirtyMinSlots[slotKey] = (thirtyMinSlots[slotKey] || 0) + totalSalesInSlot;
    }

    // 販売数合計が最大のスロットを取得
    let maxSales = 0;
    let maxSlot = "";
    Object.entries(thirtyMinSlots).forEach(([slot, sales]) => {
      if (sales > maxSales) {
        maxSales = sales;
        maxSlot = slot;
      }
    });

    setPeakHour(maxSlot);
  }, [history, startTimestamp]);

  const formatTime = (tick: any) => {
    if (!tick) return "";
    const date = new Date(tick);
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const handleResetAndGoSettings = async () => {
    if (!confirm("データを0にリセットして設定画面に移動しますか？")) return;
    try {
      await resetData();
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("measurementEndedLockBack");
      }
      router.push("/settings");
    } catch (error) {
      console.error("リセット失敗:", error);
      alert("リセットに失敗しました");
    }
  };

  const getFinalCountsAtMeasurementEnd = (dataset: Dataset) => {
    if (!Array.isArray(dataset.history) || dataset.history.length === 0) {
      return Array.isArray(dataset.counts) ? dataset.counts : [];
    }

    const latest = dataset.history.reduce((acc, cur) => {
      if (!acc) return cur;
      return Number(cur.timestamp || 0) > Number(acc.timestamp || 0) ? cur : acc;
    }, dataset.history[0]);

    const fallbackLength = Array.isArray(dataset.counts) ? dataset.counts.length : 0;
    return Array.from({ length: fallbackLength }, (_, i) => {
      const key = `p${i + 1}`;
      const value = latest?.[key];
      return typeof value === "number" ? value : (dataset.counts?.[i] ?? 0);
    });
  };

  // 売上計算（最初の在庫設定値 - 計測終了時の在庫値）
  const salesData = useMemo(() => {
    if (!currentDataset) return [];
    const initialCounts = Array.isArray(currentDataset.initialCounts)
      ? currentDataset.initialCounts
      : [];
    const finalCounts = getFinalCountsAtMeasurementEnd(currentDataset);

    const length = Math.max(
      initialCounts.length,
      finalCounts.length,
      prizeLabels.length,
      currentDataset.counts?.length ?? 0,
    );

    return Array.from({ length }, (_, i) => {
      const initial = initialCounts[i] ?? 0;
      const remaining = finalCounts[i] ?? 0;
      return {
        label: prizeLabels[i] || `${i + 1}等`,
        initial,
        remaining,
        sold: Math.max(0, initial - remaining),
        color: baseColors[i % baseColors.length],
      };
    });
  }, [currentDataset, prizeLabels, colors]);

  const totalSold = salesData.reduce((sum, item) => sum + item.sold, 0);

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
      type="monotone"
      dataKey={`p${i + 1}`}
      stroke={colors[i]}
      strokeWidth={3}
      dot={renderChangedOnlyDot(i, colors[i])}
      activeDot={{ r: 6, strokeWidth: 0 }}
      animationDuration={1000}
      connectNulls={true}
    />
  ));

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tighter mb-1">
              計測結果
            </h1>
            <p className="text-gray-600 text-sm">
              {currentDataset?.name || "データセット"}の分析結果
            </p>
          </div>
          <button
            onClick={handleResetAndGoSettings}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-6 py-3 rounded-full transition-all"
          >
            設定に移動
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* 売上データ */}
          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h2 className="text-2xl font-black text-gray-900 mb-6">売上データ</h2>
            <div className="space-y-4">
              {salesData.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <span className="font-bold text-gray-900">{item.label}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-gray-900">{item.sold}個</p>
                    <p className="text-xs text-gray-500">{item.initial}個 → {item.remaining}個</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 p-6 bg-indigo-50 rounded-xl border-2 border-indigo-200">
              <p className="text-sm font-bold text-indigo-700 mb-1">合計売上</p>
              <p className="text-4xl font-black text-indigo-900">{totalSold}個</p>
            </div>
          </div>

          {/* ピーク時間帯 */}
          <div className="bg-white rounded-3xl p-8 shadow-lg">
            <h2 className="text-2xl font-black text-gray-900 mb-6">ピーク時間帯</h2>
            <div className="flex items-center justify-center h-48">
              {peakHour ? (
                <div className="text-center">
                  <p className="text-6xl font-black text-gray-900 mb-4">{peakHour}</p>
                  <p className="text-sm text-gray-600">最も売れた時間帯</p>
                  <p className="text-xs text-gray-400 mt-2">履歴データの密集度から算出</p>
                </div>
              ) : (
                <p className="text-gray-400">データ不足</p>
              )}
            </div>
          </div>
        </div>

        {/* グラフ */}
        <div className="bg-white rounded-3xl p-8 shadow-lg">
          <h2 className="text-2xl font-black text-gray-900 mb-6">推移グラフ</h2>
          <div className="h-96">
            {history.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p>グラフデータなし</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E9ECEF" />
                  <XAxis 
                    dataKey="timestamp" 
                    type="number" 
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={formatTime}
                    fontSize={12}
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

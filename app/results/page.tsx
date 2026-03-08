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

  const baseColors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#06b6d4", "#10b981", "#6366f1", "#a855f7", "#14b8a6", "#f59e0b", "#84cc16", "#64748b", "#dc2626", "#7c3aed", "#db2777", "#0ea5e9"];
  const colors = counts.map((_, i) => baseColors[i % baseColors.length]);
  const resultHistory = useMemo(() => {
    if (Array.isArray(currentDataset?.history) && currentDataset.history.length > 0) {
      return currentDataset.history;
    }
    return history;
  }, [currentDataset, history]);

  const resolveMemoPrizeIndex = (entry: Record<string, unknown>): number | null => {
    const direct = entry.memoPrizeIndex;
    if (typeof direct === "number" && Number.isInteger(direct) && direct >= 0) {
      return direct;
    }

    const seriesLength = Math.max(counts.length, prizeLabels.length);
    for (let i = 0; i < seriesLength; i++) {
      const changed = entry[`changedP${i + 1}`];
      if (changed === true) return i;
    }
    return null;
  };

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

  const formatTime = (tick: number | string) => {
    if (!tick) return "";
    const date = new Date(typeof tick === "number" ? tick : Number(tick));
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const peakHour = useMemo(() => {
    if (resultHistory.length === 0 || !startTimestamp) return "";

    const thirtyMinSlots: { [slot: string]: number } = {};
    const seriesLength = Math.max(counts.length, prizeLabels.length, currentDataset?.counts?.length ?? 0);

    for (let i = 1; i < resultHistory.length; i++) {
      const prevEntry = resultHistory[i - 1] as unknown as Record<string, unknown>;
      const currentEntry = resultHistory[i] as unknown as Record<string, unknown>;
      const currentTs = Number(currentEntry.timestamp);
      if (!Number.isFinite(currentTs)) continue;

      const currentDate = new Date(currentTs);
      const hours = currentDate.getHours();
      const minutes = currentDate.getMinutes();

      const slotMinutes = minutes < 30 ? 0 : 30;
      const slotKey = `${String(hours).padStart(2, '0')}:${String(slotMinutes).padStart(2, '0')}`;

      let totalSalesInSlot = 0;
      for (let j = 1; j <= seriesLength; j++) {
        const key = `p${j}`;
        const prevCount = Number(prevEntry[key]);
        const currentCount = Number(currentEntry[key]);
        const prevSafe = Number.isFinite(prevCount) ? prevCount : 0;
        const currentSafe = Number.isFinite(currentCount) ? currentCount : 0;
        const sales = Math.max(0, prevSafe - currentSafe);
        totalSalesInSlot += sales;
      }

      thirtyMinSlots[slotKey] = (thirtyMinSlots[slotKey] || 0) + totalSalesInSlot;
    }

    let maxSales = 0;
    let maxSlot = "";
    Object.entries(thirtyMinSlots).forEach(([slot, sales]) => {
      if (sales > maxSales) {
        maxSales = sales;
        maxSlot = slot;
      }
    });

    return maxSlot;
  }, [resultHistory, startTimestamp, counts.length, prizeLabels.length, currentDataset]);

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
  const salesData = (() => {
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
  })();

  const totalSold = salesData.reduce((sum, item) => sum + item.sold, 0);

  const commentEntries = (() => {
    return resultHistory
      .map((entry) => {
        const item = entry as unknown as Record<string, unknown>;
        const memo = typeof item.memo === "string" ? item.memo.trim() : "";
        if (!memo) return null;

        const memoPrizeIndex = resolveMemoPrizeIndex(item);
        const label = memoPrizeIndex !== null
          ? (prizeLabels[memoPrizeIndex] || `${memoPrizeIndex + 1}等`)
          : "未指定";
        const color = memoPrizeIndex !== null
          ? (colors[memoPrizeIndex] || baseColors[memoPrizeIndex % baseColors.length])
          : "#6b7280";
        const timestamp = typeof item.timestamp === "number" ? item.timestamp : 0;

        return {
          memo,
          label,
          color,
          timestamp,
        };
      })
      .filter((entry): entry is { memo: string; label: string; color: string; timestamp: number } => entry !== null)
      .sort((a, b) => a.timestamp - b.timestamp);
  })();

  const renderTooltipContent = (tooltipProps: Record<string, unknown>) => {
    const active = tooltipProps.active === true;
    const payloadList = (tooltipProps.payload as Record<string, unknown>[] | undefined) || [];
    if (!active || payloadList.length === 0) return null;

    const point = ((payloadList[0] as Record<string, unknown>).payload as Record<string, unknown> | undefined) || {};
    const memoText = typeof point.memo === "string" ? point.memo.trim() : "";
    const memoPrizeIndex = resolveMemoPrizeIndex(point);
    const memoLabel = memoPrizeIndex !== null
      ? (prizeLabels[memoPrizeIndex] || `${memoPrizeIndex + 1}等`)
      : "未指定";
    const memoColor = memoPrizeIndex !== null
      ? (colors[memoPrizeIndex] || baseColors[memoPrizeIndex % baseColors.length])
      : "#6b7280";

    return (
      <div className="rounded-2xl bg-white/95 px-4 py-3 shadow-xl border border-gray-100">
        <p className="text-sm font-bold text-gray-900 mb-2">時刻: {formatTime(tooltipProps.label as number | string)}</p>
        <div className="space-y-1">
          {payloadList.map((item, idx) => {
            const row = item as Record<string, unknown>;
            const name = row.name as string | undefined;
            if (!name || name === "time" || name.startsWith("changed")) return null;
            return (
              <p key={`tooltip-row-${idx}`} style={{ color: (row.color as string) || "#111827" }} className="text-sm font-bold">
                {name}: {String(row.value ?? "")}
              </p>
            );
          })}
          {memoText && (
            <p className="text-xs font-bold pt-2" style={{ color: memoColor }}>
              コメント ({memoLabel}): {memoText}
            </p>
          )}
        </div>
      </div>
    );
  };

  // eslint-disable-next-line react/display-name
  const renderChangedOnlyDot = (seriesIndex: number, color: string) => (dotProps: Record<string, unknown>) => {
    const cx = dotProps?.cx as number | undefined;
    const cy = dotProps?.cy as number | undefined;
    const payload = dotProps?.payload as Record<string, unknown> | undefined;
    const index = dotProps?.index as number | undefined;
    if (typeof cx !== "number" || typeof cy !== "number") return null;

    const changedKey = `changedP${seriesIndex + 1}`;
    const valueKey = `p${seriesIndex + 1}`;
    const changedByFlag = payload?.[changedKey] === true;
    const memoText = typeof payload?.memo === "string" ? payload.memo.trim() : "";
    const hasMemo = memoText.length > 0;
    const memoPrizeIndex = resolveMemoPrizeIndex((payload || {}) as Record<string, unknown>);
    const hasMemoForThisSeries = hasMemo && (memoPrizeIndex === null || memoPrizeIndex === seriesIndex);

    let changedByDiff = false;
    if (!changedByFlag && typeof index === "number" && index > 0) {
      const prev = resultHistory[index - 1] as unknown as Record<string, unknown>;
      const prevValue = prev?.[valueKey] as number | undefined;
      const currentValue = payload?.[valueKey] as number | undefined;
      changedByDiff = typeof prevValue === "number" && typeof currentValue === "number" && prevValue !== currentValue;
    }

    if (!changedByFlag && !changedByDiff && !hasMemoForThisSeries) return null;

    return <circle cx={cx} cy={cy} r={hasMemoForThisSeries ? 6 : 4} fill={hasMemoForThisSeries ? "#fbbf24" : color} stroke="#fff" strokeWidth={2} />;
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        {/* ヘッダー */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 md:mb-10 gap-4">
          <div>
            <h1 className="text-2xl md:text-4xl font-black text-gray-900 tracking-tighter mb-1">
              計測結果
            </h1>
            <p className="text-gray-600 text-xs md:text-sm">
              {currentDataset?.name || "データセット"}の分析結果
            </p>
          </div>
          <button
            onClick={handleResetAndGoSettings}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-4 md:px-6 py-2 md:py-3 rounded-full transition-all text-sm md:text-base w-full md:w-auto"
          >
            設定に移動
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8 mb-4 md:mb-8">
          {/* 売上データ */}
          <div className="bg-white rounded-2xl md:rounded-3xl p-5 md:p-8 shadow-lg">
            <h2 className="text-xl md:text-2xl font-black text-gray-900 mb-4 md:mb-6">売上データ</h2>
            <div className="space-y-3 md:space-y-4">
              {salesData.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 md:p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="w-3 h-3 md:w-4 md:h-4 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <span className="font-bold text-gray-900 text-sm md:text-base">{item.label}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xl md:text-2xl font-black text-gray-900">{item.sold}個</p>
                    <p className="text-[10px] md:text-xs text-gray-500">{item.initial}個 → {item.remaining}個</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 md:mt-6 p-4 md:p-6 bg-indigo-50 rounded-xl border-2 border-indigo-200">
              <p className="text-xs md:text-sm font-bold text-indigo-700 mb-1">合計売上</p>
              <p className="text-3xl md:text-4xl font-black text-indigo-900">{totalSold}個</p>
            </div>
          </div>

          {/* ピーク時間帯 */}
          <div className="bg-white rounded-2xl md:rounded-3xl p-5 md:p-8 shadow-lg">
            <h2 className="text-xl md:text-2xl font-black text-gray-900 mb-4 md:mb-6">ピーク時間帯</h2>
            <div className="flex items-center justify-center h-36 md:h-48">
              {peakHour ? (
                <div className="text-center">
                  <p className="text-4xl md:text-6xl font-black text-gray-900 mb-2 md:mb-4">{peakHour}</p>
                  <p className="text-xs md:text-sm text-gray-600">最も売れた時間帯</p>
                  <p className="text-[10px] md:text-xs text-gray-400 mt-1 md:mt-2">履歴データの密集度から算出</p>
                </div>
              ) : (
                <p className="text-gray-400 text-sm">データ不足</p>
              )}
            </div>
          </div>
        </div>

        {/* グラフ */}
        <div className="bg-white rounded-2xl md:rounded-3xl p-5 md:p-8 shadow-lg">
          <h2 className="text-xl md:text-2xl font-black text-gray-900 mb-4 md:mb-6">推移グラフ</h2>
          <div className="h-64 md:h-96">
            {resultHistory.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p className="text-sm">グラフデータなし</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={resultHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E9ECEF" />
                  <XAxis 
                    dataKey="timestamp" 
                    type="number" 
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={formatTime}
                    fontSize={10}
                    axisLine={false}
                    tickLine={false}
                    stroke="#ADB5BD"
                  />
                  <YAxis fontSize={10} axisLine={false} tickLine={false} stroke="#ADB5BD" />
                  <Tooltip 
                    content={renderTooltipContent}
                  />
                  <Legend iconType="circle" verticalAlign="top" align="right" height={50} wrapperStyle={{ fontSize: '12px' }} />
                  {renderLineContent()}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* コメント一覧 */}
        <div className="bg-white rounded-2xl md:rounded-3xl p-5 md:p-8 shadow-lg mt-4 md:mt-8">
          <h2 className="text-xl md:text-2xl font-black text-gray-900 mb-4 md:mb-6">コメント一覧</h2>
          {commentEntries.length === 0 ? (
            <p className="text-gray-400 text-sm">コメントはありません</p>
          ) : (
            <div className="space-y-3 max-h-64 md:max-h-96 overflow-y-auto pr-2">
              {commentEntries.map((entry, i) => (
                <div key={`comment-${entry.timestamp}-${i}`} className="p-3 md:p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-block w-2.5 h-2.5 md:w-3 md:h-3 rounded-full" style={{ backgroundColor: entry.color }}></span>
                    <span className="text-xs md:text-sm font-bold" style={{ color: entry.color }}>{entry.label}</span>
                    <span className="text-[10px] md:text-xs text-gray-500">{formatTime(entry.timestamp)}</span>
                  </div>
                  <p className="text-xs md:text-sm text-gray-800 whitespace-pre-wrap">{entry.memo}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

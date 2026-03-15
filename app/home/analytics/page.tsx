"use client";

import React, { useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { PrizeContext } from "../../PrizeContext";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function AccountingAnalyticsPage() {
  const router = useRouter();
  const {
    counts,
    history,
    initialCounts,
    prizeLabels,
    mode,
    loading,
    measuring,
    endMeasurement,
    addMemoPoint,
  } = useContext(PrizeContext);

  const [chartView, setChartView] = useState<"inventory" | "sales">("inventory");
  const [memoPointInput, setMemoPointInput] = useState("");
  const [memoPointPrizeIndex, setMemoPointPrizeIndex] = useState(0);
  const [isSavingMemoPoint, setIsSavingMemoPoint] = useState(false);

  const baseColors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#06b6d4", "#10b981", "#6366f1", "#a855f7", "#14b8a6", "#f59e0b", "#84cc16", "#64748b", "#dc2626", "#7c3aed", "#db2777", "#0ea5e9"];
  const colors = counts.map((_, i) => baseColors[i % baseColors.length]);
  const xAxisPaddingMs = 2 * 60 * 1000;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/");
      }
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!loading && mode !== "accounting") {
      router.replace("/home");
    }
  }, [loading, mode, router]);

  useEffect(() => {
    if (memoPointPrizeIndex >= counts.length) {
      setMemoPointPrizeIndex(0);
    }
  }, [counts.length, memoPointPrizeIndex]);

  const formatTime = (tick: number | string) => {
    if (!tick) return "";
    const date = new Date(typeof tick === "number" ? tick : parseInt(tick, 10));
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  };

  const handleAddMemoPoint = async () => {
    const normalizedMemo = memoPointInput.trim();
    if (!normalizedMemo) {
      alert("メモを入力してください");
      return;
    }

    setIsSavingMemoPoint(true);
    try {
      await addMemoPoint(memoPointPrizeIndex, normalizedMemo);
      setMemoPointInput("");
    } catch (error) {
      console.error("メモ追加エラー:", error);
      alert("メモの追加に失敗しました");
    } finally {
      setIsSavingMemoPoint(false);
    }
  };

  const resolveMemoPrizeIndex = (entry: Record<string, unknown>): number | null => {
    const direct = entry.memoPrizeIndex;
    if (typeof direct === "number" && Number.isInteger(direct) && direct >= 0) {
      return direct;
    }

    for (let i = 0; i < counts.length; i++) {
      if (entry[`changedP${i + 1}`] === true) return i;
    }
    return null;
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
    const memoPrizeIndex = typeof payload?.memoPrizeIndex === "number" ? payload.memoPrizeIndex : null;
    const hasMemoForThisSeries = hasMemo && (memoPrizeIndex === null || memoPrizeIndex === seriesIndex);

    let changedByDiff = false;
    if (!changedByFlag && typeof index === "number" && index > 0) {
      const prev = history[index - 1] as unknown as Record<string, unknown> | undefined;
      const prevValue = prev?.[valueKey] as number | undefined;
      const currentValue = payload?.[valueKey] as number | undefined;
      changedByDiff = typeof prevValue === "number" && typeof currentValue === "number" && prevValue !== currentValue;
    }

    if (!changedByFlag && !changedByDiff && !hasMemoForThisSeries) return null;

    return (
      <circle
        cx={cx}
        cy={cy}
        r={hasMemoForThisSeries ? 6 : 4}
        fill={hasMemoForThisSeries ? "#fbbf24" : color}
        stroke="#fff"
        strokeWidth={2}
      />
    );
  };

  const renderTooltipContent = (tooltipProps: Record<string, unknown>) => {
    const active = tooltipProps.active === true;
    const payloadList = (tooltipProps.payload as Record<string, unknown>[] | undefined) || [];
    if (!active || payloadList.length === 0) return null;

    const firstItem = payloadList[0] as Record<string, unknown>;
    const point = (firstItem?.payload as Record<string, unknown> | undefined) || {};
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

  const renderInventoryLineContent = () => counts.map((_, i) => (
    <Line
      key={i + 1}
      type="monotone"
      dataKey={`p${i + 1}`}
      name={prizeLabels[i] || `${i + 1}等`}
      stroke={colors[i]}
      strokeWidth={3}
      dot={renderChangedOnlyDot(i, colors[i])}
      activeDot={{ r: 6, strokeWidth: 0 }}
      animationDuration={1000}
      connectNulls={true}
    />
  ));

  const renderSalesLineContent = () => counts.map((_, i) => (
    <Line
      key={`sales-${i + 1}`}
      type="monotone"
      dataKey={`s${i + 1}`}
      name={prizeLabels[i] || `${i + 1}等`}
      stroke={colors[i]}
      strokeWidth={3}
      dot={{ r: 3 }}
      activeDot={{ r: 6, strokeWidth: 0 }}
      animationDuration={1000}
      connectNulls={true}
    />
  ));

  const buildInventorySnapshotEntry = (timestamp: number) =>
    counts.reduce<Record<string, number | string | boolean>>(
      (acc, count, index) => {
        acc[`p${index + 1}`] = count;
        acc[`changedP${index + 1}`] = false;
        return acc;
      },
      {
        timestamp,
        time: "--:--",
      }
    );

  const buildSalesSnapshotEntry = (timestamp: number) =>
    counts.reduce<Record<string, number | string | boolean>>(
      (acc, _, index) => {
        const initial = Number(initialCounts[index] ?? 0);
        const current = Number(counts[index] ?? 0);
        acc[`s${index + 1}`] = Math.max(0, initial - current);
        acc[`changedS${index + 1}`] = false;
        return acc;
      },
      {
        timestamp,
        time: "--:--",
      }
    );

  const chartData = (() => {
    if (history.length === 0) {
      const now = Date.now();
      return [buildInventorySnapshotEntry(now - 60_000), buildInventorySnapshotEntry(now)];
    }

    if (history.length === 1) {
      const only = history[0] as Record<string, unknown>;
      const onlyTs = Number(only?.timestamp);
      const safeTs = Number.isFinite(onlyTs) ? onlyTs : Date.now();
      return [{ ...only, timestamp: safeTs - 60_000, time: "--:--" }, only];
    }

    return history;
  })();

  const salesChartData = (() => {
    if (history.length === 0) {
      const now = Date.now();
      return [buildSalesSnapshotEntry(now - 60_000), buildSalesSnapshotEntry(now)];
    }

    const converted = history.map((entry) => {
      const source = entry as Record<string, unknown>;
      const row: Record<string, number | string | boolean | undefined> = {
        timestamp: typeof source.timestamp === "number" ? source.timestamp : Date.now(),
        time: typeof source.time === "string" ? source.time : "--:--",
        memo: typeof source.memo === "string" ? source.memo : undefined,
        memoPrizeIndex: typeof source.memoPrizeIndex === "number" ? source.memoPrizeIndex : undefined,
      };

      counts.forEach((_, index) => {
        const initial = Number(initialCounts[index] ?? 0);
        const currentRaw = Number(source[`p${index + 1}`]);
        const current = Number.isFinite(currentRaw) ? currentRaw : Number(counts[index] ?? 0);
        row[`s${index + 1}`] = Math.max(0, initial - current);
        row[`changedS${index + 1}`] = source[`changedP${index + 1}`] === true;
      });

      return row;
    });

    if (converted.length === 1) {
      const only = converted[0];
      const ts = Number(only.timestamp);
      const safeTs = Number.isFinite(ts) ? ts : Date.now();
      return [{ ...only, timestamp: safeTs - 60_000, time: "--:--" }, only];
    }

    return converted;
  })();

  const activeChartData = chartView === "sales" ? salesChartData : chartData;

  const commentEntries = (() => {
    return history
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

        return { memo, label, color, timestamp };
      })
      .filter((entry): entry is { memo: string; label: string; color: string; timestamp: number } => entry !== null)
      .sort((a, b) => a.timestamp - b.timestamp);
  })();

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

  if (mode !== "accounting") {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        <header className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 md:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-gray-900">グラフ・コメント</h1>
            <p className="text-xs text-gray-500 mt-1">会計モード専用ページ</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => router.push("/home")}
              className="text-xs font-black text-emerald-700 border border-emerald-200 px-4 py-2 rounded-full"
            >
              ← 会計操作へ
            </button>
            <button
              onClick={() => router.push("/select-dataset")}
              className="text-xs font-black text-indigo-600 border border-indigo-200 px-4 py-2 rounded-full"
            >
              データセット変更
            </button>
            <button
              onClick={async () => {
                try {
                  await endMeasurement();
                  if (typeof window !== "undefined") {
                    sessionStorage.setItem("measurementEndedLockBack", "1");
                  }
                  router.replace("/results");
                } catch (error) {
                  console.error("計測終了エラー:", error);
                }
              }}
              disabled={!measuring}
              className={`text-xs font-black px-4 py-2 rounded-full ${
                measuring ? "text-white bg-red-500" : "text-gray-400 bg-gray-100 border border-gray-200"
              }`}
            >
              ⏹️ 計測終了
            </button>
          </div>
        </header>

        <section className="bg-white rounded-3xl border border-gray-100 shadow p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-black text-gray-600">{chartView === "sales" ? "売上数推移" : "在庫推移"}</p>
            <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 p-1">
              <button
                onClick={() => setChartView("inventory")}
                className={`text-xs font-black px-3 py-1 rounded-full ${chartView === "inventory" ? "bg-white text-gray-900 shadow" : "text-gray-500"}`}
              >
                在庫
              </button>
              <button
                onClick={() => setChartView("sales")}
                className={`text-xs font-black px-3 py-1 rounded-full ${chartView === "sales" ? "bg-white text-gray-900 shadow" : "text-gray-500"}`}
              >
                売上数
              </button>
            </div>
          </div>
          <div className="h-[340px] md:h-[430px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activeChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  domain={[
                    `dataMin - ${xAxisPaddingMs}`,
                    `dataMax + ${xAxisPaddingMs}`,
                  ]}
                  tickFormatter={formatTime}
                  fontSize={11}
                  axisLine={false}
                  tickLine={false}
                  stroke="#ADB5BD"
                />
                <YAxis fontSize={11} axisLine={false} tickLine={false} stroke="#ADB5BD" />
                <Tooltip content={renderTooltipContent} />
                <Legend iconType="circle" verticalAlign="top" align="right" height={50} />
                {chartView === "sales" ? renderSalesLineContent() : renderInventoryLineContent()}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <div className="bg-white rounded-3xl border border-gray-100 shadow p-4 md:p-6">
            <h2 className="text-lg font-black text-gray-900 mb-3">コメントを追加</h2>
            <div className="space-y-3">
              <select
                value={memoPointPrizeIndex}
                onChange={(e) => setMemoPointPrizeIndex(Number(e.target.value))}
                className="w-full p-2 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-700"
              >
                {counts.map((_, i) => (
                  <option key={`analytics-memo-target-${i}`} value={i}>
                    {prizeLabels[i] || `${i + 1}等`} / 在庫 {counts[i] ?? 0}
                  </option>
                ))}
              </select>
              <textarea
                value={memoPointInput}
                onChange={(e) => setMemoPointInput(e.target.value)}
                placeholder="ここにコメントを入力"
                className="w-full h-28 p-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-800 resize-none"
              />
              <button
                onClick={handleAddMemoPoint}
                disabled={isSavingMemoPoint}
                className="w-full py-2 bg-gray-700 hover:bg-gray-800 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {isSavingMemoPoint ? "記録中..." : "コメントを記録"}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 shadow p-4 md:p-6">
            <h2 className="text-lg font-black text-gray-900 mb-3">コメント一覧</h2>
            {commentEntries.length === 0 ? (
              <p className="text-sm text-gray-400">コメントはありません</p>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {commentEntries.map((entry, i) => (
                  <div key={`analytics-comment-${entry.timestamp}-${i}`} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }}></span>
                      <span className="text-xs font-bold" style={{ color: entry.color }}>{entry.label}</span>
                      <span className="text-[10px] text-gray-500">{formatTime(entry.timestamp)}</span>
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{entry.memo}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

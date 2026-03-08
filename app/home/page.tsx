"use client";

import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
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
  const { counts, history, prizeLabels, addHistory, addMemoPoint, resetData, loading, measuring, endMeasurement } = useContext(PrizeContext);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [memoPointInput, setMemoPointInput] = useState("");
  const [memoPointPrizeIndex, setMemoPointPrizeIndex] = useState(0);
  const [isSavingMemoPoint, setIsSavingMemoPoint] = useState(false);
  const [inAppNotification, setInAppNotification] = useState<{ title: string; body: string } | null>(null);
  const notificationRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const inAppNotificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousHistoryLengthRef = useRef(0);
  const isHistoryWatcherReadyRef = useRef(false);

  // 初期化時のロギング
  React.useEffect(() => {
    console.log("[ホーム画面] 初期化完了");
    console.log("[環境] HTTPSコンテキスト:", window.isSecureContext);
    console.log("[環境] ホスト名:", window.location.hostname);
    console.log("[Notification API] サポート:", "Notification" in window);
    console.log("[Service Worker API] サポート:", "serviceWorker" in navigator);
  }, []);

  // 賞品数に応じて色を動的に生成
  const baseColors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#06b6d4", "#10b981", "#6366f1", "#a855f7", "#14b8a6", "#f59e0b", "#84cc16", "#64748b", "#dc2626", "#7c3aed", "#db2777", "#0ea5e9"];
  const colors = counts.map((_, i) => baseColors[i % baseColors.length]);
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

  const canUseBrowserNotifications = useCallback(() => {
    if (typeof window === "undefined") return false;
    if (!("Notification" in window)) return false;

    if (window.isSecureContext) return true;

    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1";
  }, []);

  // 通知許可をリクエスト（初回のみ）
  const requestNotificationPermission = useCallback(async () => {
    if (!canUseBrowserNotifications()) {
      return false;
    }

    if (Notification.permission === "granted") {
      return true;
    }

    if (Notification.permission === "denied") {
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      return permission === "granted";
    } catch (error) {
      console.error("通知許可リクエストエラー:", error);
      return false;
    }
  }, [canUseBrowserNotifications]);

  const showInAppNotification = useCallback((title: string, body: string) => {
    setInAppNotification({ title, body });

    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(120);
    }

    if (inAppNotificationTimerRef.current) {
      clearTimeout(inAppNotificationTimerRef.current);
    }

    inAppNotificationTimerRef.current = setTimeout(() => {
      setInAppNotification(null);
      inAppNotificationTimerRef.current = null;
    }, 4500);
  }, []);

  // メモ通知を送信（コメント追加時に常に通知）
  const sendMemoNotification = useCallback(async (prizeLabel: string, memoContent: string) => {
    console.log("[通知] 通知送信開始:", { prizeLabel, memoContent, isLoggedIn });
    
    if (!isLoggedIn) {
      console.log("[通知] ログインしていないため通知中止");
      return;
    }

    const title = "コメントが追加されました";
    const body = `${prizeLabel}: ${memoContent}`;
    const tag = `memo-notification-${Date.now()}`;

    const isMobileDevice = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobileDevice) {
      showInAppNotification(title, body);
    }

    if (!canUseBrowserNotifications()) {
      console.log("[通知] ブラウザが通知APIをサポートしていません");
      showInAppNotification(title, body);
      return;
    }

    try {
      const hasPermission = await requestNotificationPermission();
      console.log("[通知] 権限確認結果:", hasPermission);
      if (!hasPermission) {
        console.log("[通知] 通知権限がありません");
        showInAppNotification(title, body);
        return;
      }

      const notificationOptions: NotificationOptions = {
        body,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        tag,
        requireInteraction: false,
        silent: false,
      };

      console.log("[通知] Service Worker登録状態:", notificationRegistrationRef.current ? "登録済み" : "未登録");

      if (typeof navigator.serviceWorker !== "undefined") {
        const registration = notificationRegistrationRef.current ?? await navigator.serviceWorker.ready;
        notificationRegistrationRef.current = registration;

        if (registration?.showNotification) {
          console.log("[通知] ServiceWorkerRegistration.showNotification を実行");
          await registration.showNotification(title, {
            body,
            icon: "/favicon.ico",
            badge: "/favicon.ico",
            tag,
            requireInteraction: false,
            silent: false,
          });
          return;
        }

        if (navigator.serviceWorker.controller) {
          console.log("[通知] Service Worker message 経由で送信");
          navigator.serviceWorker.controller.postMessage({
            type: "SEND_NOTIFICATION",
            payload: {
              title,
              body,
              icon: "/favicon.ico",
              tag,
            },
          });
          return;
        }
      }

      console.log("[通知] 直接APIで通知を送信");
      const notification = new Notification(title, notificationOptions);
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (error) {
      console.error("[通知エラー]", error);
      showInAppNotification(title, body);
    }
  }, [isLoggedIn, requestNotificationPermission, canUseBrowserNotifications, showInAppNotification]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsLoggedIn(Boolean(user));
      if (!user) {
        router.push("/");
      } else if (user.email === adminEmail) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    });
    return () => unsub();
  }, [router, adminEmail]);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      console.log("[Service Worker] ブラウザがサポートしていません");
      return;
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("[Service Worker] 登録成功:", registration);
        notificationRegistrationRef.current = registration;
      })
      .catch((error) => {
        console.error("[Service Worker] 登録失敗:", error);
      });
  }, []);

  useEffect(() => {
    return () => {
      if (inAppNotificationTimerRef.current) {
        clearTimeout(inAppNotificationTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isHistoryWatcherReadyRef.current) {
      previousHistoryLengthRef.current = history.length;
      isHistoryWatcherReadyRef.current = true;
      return;
    }

    if (history.length <= previousHistoryLengthRef.current) {
      previousHistoryLengthRef.current = history.length;
      return;
    }

    const newEntries = history.slice(previousHistoryLengthRef.current);
    previousHistoryLengthRef.current = history.length;

    const latestMemoEntry = [...newEntries]
      .reverse()
      .find((entry) => typeof entry.memo === "string" && entry.memo.trim().length > 0);

    if (!latestMemoEntry || typeof latestMemoEntry.memo !== "string") {
      return;
    }

    const memoTargetIndex =
      typeof latestMemoEntry.memoPrizeIndex === "number" && latestMemoEntry.memoPrizeIndex >= 0
        ? latestMemoEntry.memoPrizeIndex
        : null;
    const prizeLabel = memoTargetIndex !== null
      ? (prizeLabels[memoTargetIndex] || `${memoTargetIndex + 1}等`)
      : "コメント";

    void sendMemoNotification(prizeLabel, latestMemoEntry.memo);
  }, [history, prizeLabels, sendMemoNotification]);



  // データ数変更時のメモ対象インデックス調整
  useEffect(() => {
    if (memoPointPrizeIndex >= counts.length) {
      setMemoPointPrizeIndex(0);
    }
  }, [counts.length, memoPointPrizeIndex]);

  // 時間フォーマット関数 (Unixタイムスタンプを HH:mm 形式へ)
  const formatTime = (tick: number | string) => {
    if (!tick) return "";
    const date = new Date(typeof tick === 'number' ? tick : parseInt(tick, 10));
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

  const handleAddMemoPointFromPanel = async () => {
    const normalizedMemo = memoPointInput.trim();
    if (!normalizedMemo) {
      alert("メモを入力してください");
      return;
    }

    setIsSavingMemoPoint(true);
    try {
      await addMemoPoint(memoPointPrizeIndex, normalizedMemo);

      // コメント記録後に即座に通知を送信
      const prizeLabel = prizeLabels[memoPointPrizeIndex] || `${memoPointPrizeIndex + 1}等`;
      console.log("[コメント記録] プッシュ通知を実行:", { prizeLabel, normalizedMemo });
      await sendMemoNotification(prizeLabel, normalizedMemo);

      setMemoPointInput("");
    } catch (error) {
      console.error("メモ点追加エラー:", error);
      alert("メモ付きデータ点の記録に失敗しました");
    } finally {
      setIsSavingMemoPoint(false);
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

    // カウント変化があるか、またはメモがあれば点を表示
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
    const memoPrizeIndexRaw = point.memoPrizeIndex;
    const memoPrizeIndex = typeof memoPrizeIndexRaw === "number" && memoPrizeIndexRaw >= 0 ? memoPrizeIndexRaw : null;
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

  const buildSnapshotEntry = (timestamp: number) =>
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

  const chartData = (() => {
    if (history.length === 0) {
      const now = Date.now();
      return [buildSnapshotEntry(now - 60_000), buildSnapshotEntry(now)];
    }

    if (history.length === 1) {
      const only = history[0] as Record<string, unknown>;
      const onlyTs = Number(only?.timestamp);
      const safeTs = Number.isFinite(onlyTs) ? onlyTs : Date.now();
      const prev = { ...only, timestamp: safeTs - 60_000, time: "--:--" };
      return [prev, only];
    }

    return history;
  })();

  const xAxisPaddingMs = 2 * 60 * 1000;

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-24 md:pb-0 font-sans">
      {inAppNotification && (
        <div className="fixed top-4 left-1/2 z-[100] w-[92%] max-w-md -translate-x-1/2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-xl">
          <p className="text-sm font-black text-amber-900">{inAppNotification.title}</p>
          <p className="mt-1 text-xs font-semibold text-amber-800 break-words">{inAppNotification.body}</p>
        </div>
      )}
      
      {/* --- PC版 --- */}
      <div className="hidden md:flex flex-col h-screen">
        <header className="bg-white border-b px-10 py-5 flex justify-between items-center shadow-sm">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => router.push("/select-dataset")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
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

        <main className="flex-1 overflow-y-auto p-10 grid grid-cols-12 gap-6 auto-rows-min">
          <div className="col-span-8 h-[50vh] bg-white p-8 rounded-[32px] shadow-xl shadow-gray-200/50 border border-gray-100 relative">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
                <XAxis 
                  dataKey="timestamp" // UnixTimeを使用
                  type="number"       // これにより時間幅が可変になる
                  domain={[
                    `dataMin - ${xAxisPaddingMs}`,
                    `dataMax + ${xAxisPaddingMs}`,
                  ]} 
                  tickFormatter={formatTime}
                  fontSize={12}
                  tickMargin={15}
                  axisLine={false}
                  tickLine={false}
                  stroke="#ADB5BD"
                />
                <YAxis fontSize={12} axisLine={false} tickLine={false} stroke="#ADB5BD" />
                <Tooltip 
                  content={renderTooltipContent}
                />
                <Legend iconType="circle" verticalAlign="top" align="right" height={50} />
                {renderLineContent()}
              </LineChart>
            </ResponsiveContainer>
            {history.length === 0 && (
              <div className="absolute left-8 top-8 rounded-lg bg-white/90 px-3 py-2 border border-gray-100 text-xs text-gray-500">
                グラフデータなし（現在在庫を表示中）
              </div>
            )}
          </div>

          <div className="col-span-4 h-[50vh] overflow-y-auto pr-2">
            {counts.map((count: number, i: number) => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 flex items-center justify-between hover:shadow-md transition-shadow mb-3">
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

          <div className="col-span-12">
            <div className="bg-white p-5 rounded-2xl border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700">メモ</h3>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-gray-500">コメントを追加</p>
                <select
                  value={memoPointPrizeIndex}
                  onChange={(e) => setMemoPointPrizeIndex(Number(e.target.value))}
                  className="w-full p-2 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  {counts.map((_, i) => (
                    <option key={`memo-target-${i}`} value={i}>
                      {prizeLabels[i] || `${i + 1}等`} / 在庫 {counts[i] ?? 0}
                    </option>
                  ))}
                </select>
                <textarea
                  value={memoPointInput}
                  onChange={(e) => setMemoPointInput(e.target.value)}
                  placeholder="ここにコメントを入力"
                  className="w-full h-20 p-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddMemoPointFromPanel}
                    disabled={isSavingMemoPoint}
                    className="w-full py-2 bg-gray-700 hover:bg-gray-800 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isSavingMemoPoint ? "記録中..." : "コメントを記録"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* --- 携帯版 --- */}
      <div className="md:hidden flex flex-col h-screen overflow-y-auto bg-white">
        <div className="flex-1 p-5 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.ico" alt="icon" className="w-10 h-10" />
            <h1 className="text-[12px] font-black text-gray-900 tracking-[0.3em] uppercase">Count kun</h1>
            <div className="flex gap-2">
              {measuring && (
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
          
          <div className="flex-1 min-h-[300px] w-full bg-gray-50 rounded-[40px] p-5 shadow-inner border border-gray-100 relative">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E9ECEF" />
                <XAxis 
                  dataKey="timestamp" 
                  type="number" 
                  domain={[
                    `dataMin - ${xAxisPaddingMs}`,
                    `dataMax + ${xAxisPaddingMs}`,
                  ]} 
                  tickFormatter={formatTime}
                  fontSize={10}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis fontSize={10} axisLine={false} tickLine={false} />
                <Tooltip 
                  content={renderTooltipContent}
                />
                {renderLineContent()}
              </LineChart>
            </ResponsiveContainer>
            {history.length === 0 && (
              <div className="absolute left-5 top-5 rounded-md bg-white/90 px-2 py-1 border border-gray-100 text-[10px] text-gray-500">
                現在在庫を表示中
              </div>
            )}
          </div>
          <p className="text-[10px] text-gray-500 mt-3 text-center">コメントはグラフ上の点とツールチップに表示されます</p>
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

          <div className="mb-4 rounded-2xl border border-gray-200 bg-gray-50 p-3 space-y-2">
            <p className="text-[11px] font-semibold text-gray-600">メモ</p>
            <select
              value={memoPointPrizeIndex}
              onChange={(e) => setMemoPointPrizeIndex(Number(e.target.value))}
              className="w-full p-2 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              {counts.map((_, i) => (
                <option key={`memo-target-mobile-${i}`} value={i}>
                  {prizeLabels[i] || `${i + 1}等`} / 在庫 {counts[i] ?? 0}
                </option>
              ))}
            </select>
            <textarea
              value={memoPointInput}
              onChange={(e) => setMemoPointInput(e.target.value)}
              placeholder="ここにコメントを入力"
              className="w-full h-20 p-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddMemoPointFromPanel}
                disabled={isSavingMemoPoint}
                className="w-full py-2 bg-gray-700 hover:bg-gray-800 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {isSavingMemoPoint ? "記録中..." : "コメントを記録"}
              </button>
            </div>
          </div>
          
          <div className="flex gap-3 mb-3">
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
              className={`flex-1 py-3 font-black rounded-xl transition-all active:scale-[0.98] text-sm ${
                measuring
                  ? "bg-red-500 text-white"
                  : "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed opacity-50"
              }`}
            >
              ⏹️ 計測終了
            </button>
            <button 
              onClick={() => router.push("/select-dataset")}
              className="flex-1 py-3 bg-indigo-600 text-white font-black rounded-xl transition-all active:scale-[0.98] text-sm"
            >
              📊 データセット変更
            </button>
          </div>

          <div className="flex gap-3 mb-3">
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
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
  const {
    counts,
    history,
    initialCounts,
    prices,
    mode,
    accountingHistory,
    prizeLabels,
    addHistory,
    addMemoPoint,
    completeAccountingTransaction,
    undoLastAction,
    resetData,
    loading,
    measuring,
    endMeasurement,
  } = useContext(PrizeContext);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [memoPointInput, setMemoPointInput] = useState("");
  const [memoPointPrizeIndex, setMemoPointPrizeIndex] = useState(0);
  const [isSavingMemoPoint, setIsSavingMemoPoint] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [chartView, setChartView] = useState<"inventory" | "sales">("inventory");
  const [paymentInput, setPaymentInput] = useState("");
  const [, setCalculatorExpression] = useState("");
  const [cartQuantities, setCartQuantities] = useState<number[]>([]);
  const [cartActionStack, setCartActionStack] = useState<number[]>([]);
  const [lastAccountingResult, setLastAccountingResult] = useState<{
    summary: string;
    paid: number;
    total: number;
    change: number;
  } | null>(null);
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
  const isAccountingMode = mode === "accounting";

  const evaluateExpression = (expression: string) => {
    const sanitized = expression.replace(/\s+/g, "").replace(/[xX×]/g, "*").replace(/÷/g, "/");
    if (!sanitized) return null;
    if (!/^[0-9+\-*/().]+$/.test(sanitized)) return null;

    const tokens = sanitized.match(/\d+(?:\.\d+)?|[()+\-*/]/g);
    if (!tokens || tokens.join("") !== sanitized) return null;

    const precedence: Record<string, number> = {
      "+": 1,
      "-": 1,
      "*": 2,
      "/": 2,
    };

    const output: string[] = [];
    const ops: string[] = [];

    tokens.forEach((token) => {
      if (/^\d/.test(token)) {
        output.push(token);
        return;
      }

      if (token === "(") {
        ops.push(token);
        return;
      }

      if (token === ")") {
        while (ops.length > 0 && ops[ops.length - 1] !== "(") {
          const operator = ops.pop();
          if (operator) output.push(operator);
        }
        if (ops[ops.length - 1] === "(") ops.pop();
        return;
      }

      while (
        ops.length > 0 &&
        ops[ops.length - 1] !== "(" &&
        precedence[ops[ops.length - 1]] >= precedence[token]
      ) {
        const operator = ops.pop();
        if (operator) output.push(operator);
      }
      ops.push(token);
    });

    while (ops.length > 0) {
      const operator = ops.pop();
      if (!operator || operator === "(") return null;
      output.push(operator);
    }

    const stack: number[] = [];
    for (const token of output) {
      if (/^\d/.test(token)) {
        stack.push(Number(token));
        continue;
      }

      const right = stack.pop();
      const left = stack.pop();
      if (typeof left !== "number" || typeof right !== "number") return null;

      let result = 0;
      if (token === "+") result = left + right;
      if (token === "-") result = left - right;
      if (token === "*") result = left * right;
      if (token === "/") {
        if (right === 0) return null;
        result = left / right;
      }
      stack.push(result);
    }

    if (stack.length !== 1) return null;
    const fixed = Number(stack[0].toFixed(2));
    return Number.isFinite(fixed) ? fixed : null;
  };

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

  useEffect(() => {
    setCartQuantities((prev) => Array.from({ length: counts.length }, (_, index) => prev[index] || 0));
  }, [counts.length]);

  useEffect(() => {
    if (!isAccountingMode) {
      setChartView("inventory");
      setPaymentInput("");
      setCalculatorExpression("");
      setLastAccountingResult(null);
      setCartQuantities(Array(counts.length).fill(0));
      setCartActionStack([]);
    }
  }, [isAccountingMode, counts.length]);

  // 時間フォーマット関数 (Unixタイムスタンプを HH:mm 形式へ)
  const formatTime = (tick: number | string) => {
    if (!tick) return "";
    const date = new Date(typeof tick === 'number' ? tick : parseInt(tick, 10));
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const handleCalculatorPress = (value: string) => {
    const syncPaymentFromExpression = (expression: string) => {
      const evaluated = evaluateExpression(expression);
      if (evaluated !== null && evaluated >= 0) {
        setPaymentInput(String(evaluated));
        return;
      }

      const normalized = expression.replace(/\s+/g, "");
      if (/^\d*\.?\d*$/.test(normalized)) {
        setPaymentInput(normalized);
      }
    };

    if (value === "C") {
      setCalculatorExpression("");
      setPaymentInput("");
      return;
    }

    if (value === "⌫") {
      setCalculatorExpression((prev) => {
        const next = prev.slice(0, -1);
        syncPaymentFromExpression(next);
        return next;
      });
      return;
    }

    if (value === "会計") {
      void handleCompleteAccounting();
      return;
    }

    setCalculatorExpression((prev) => {
      const next = `${prev}${value}`;
      syncPaymentFromExpression(next);
      return next;
    });
  };

  const handleUndo = async () => {
    setIsUndoing(true);
    try {
      if (isAccountingMode && cartActionStack.length > 0) {
        const lastIndex = cartActionStack[cartActionStack.length - 1];
        setCartActionStack((prev) => prev.slice(0, -1));
        setCartQuantities((prev) => prev.map((value, index) => {
          if (index !== lastIndex) return value;
          return Math.max(0, value - 1);
        }));
        setLastAccountingResult(null);
        return;
      }

      await undoLastAction();
      if (isAccountingMode) {
        setLastAccountingResult(null);
      }
    } catch (error) {
      console.error("Undo失敗:", error);
      alert("一つ前に戻せませんでした");
    } finally {
      setIsUndoing(false);
    }
  };

  const handleDraw = async (index: number) => {
    if (counts[index] <= 0) return;

    if (isAccountingMode) {
      const selectedCount = cartQuantities[index] ?? 0;
      if (selectedCount >= counts[index]) {
        alert("この景品はこれ以上追加できません");
        return;
      }

      setCartQuantities((prev) => prev.map((value, currentIndex) => currentIndex === index ? value + 1 : value));
      setCartActionStack((prev) => [...prev, index]);
      setLastAccountingResult(null);
      return;
    }
    
    const newCounts = [...counts];
    newCounts[index] -= 1;

    try {
      await addHistory(newCounts);
    } catch (error) {
      console.error("更新失敗:", error);
    }
  };

  const handleCompleteAccounting = async () => {
    const totalAmount = cartQuantities.reduce((sum, quantity, index) => sum + quantity * Number(prices[index] ?? 0), 0);
    if (totalAmount <= 0) {
      alert("DRAWした商品がありません");
      return;
    }

    const receivedAmount = Number(paymentInput);
    if (!Number.isFinite(receivedAmount) || paymentInput.trim() === "") {
      alert("お受け取り金額を入力してください");
      return;
    }
    if (receivedAmount < totalAmount) {
      alert("お受け取り金額が不足しています");
      return;
    }

    const soldItems = cartQuantities
      .map((quantity, index) => ({ quantity, index }))
      .filter((item) => item.quantity > 0)
      .map((item) => {
        const unitPrice = Number(prices[item.index] ?? 0);
        return {
          prizeIndex: item.index,
          label: prizeLabels[item.index] || `${item.index + 1}等`,
          unitPrice,
          quantity: item.quantity,
          subtotal: unitPrice * item.quantity,
        };
      });

    const newCounts = counts.map((count, index) => count - (cartQuantities[index] ?? 0));
    const now = new Date();
    const timestamp = Date.now();
    const record = {
      id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp,
      time: `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`,
      totalAmount,
      receivedAmount,
      change: receivedAmount - totalAmount,
      historyTimestamp: timestamp,
      items: soldItems,
    };

    try {
      await completeAccountingTransaction({ newCounts, record });
      setLastAccountingResult({
        summary: soldItems.map((item) => `${item.label}×${item.quantity}`).join(" / "),
        paid: receivedAmount,
        total: totalAmount,
        change: receivedAmount - totalAmount,
      });
      setCartQuantities(Array(counts.length).fill(0));
      setCartActionStack([]);
      setPaymentInput("");
      setCalculatorExpression("");
    } catch (error) {
      console.error("会計失敗:", error);
      alert("会計処理に失敗しました");
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

  const renderInventoryLineContent = () => counts.map((_, i) => (
    <Line
      key={i + 1}
      type="monotone" // 点と点を滑らかにつなぐ
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
      const prev = { ...only, timestamp: safeTs - 60_000, time: "--:--" };
      return [prev, only];
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

  const activeChartData = isAccountingMode && chartView === "sales" ? salesChartData : chartData;
  const chartEmpty = history.length === 0;

  const xAxisPaddingMs = 2 * 60 * 1000;
  const calculatorButtons = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "-", "0", ".", "(", ")", "C", "⌫", "+", "会計"];
  const totalSelectedItems = cartQuantities.reduce((sum, quantity) => sum + quantity, 0);
  const accountingTotalAmount = cartQuantities.reduce(
    (sum, quantity, index) => sum + quantity * Number(prices[index] ?? 0),
    0,
  );
  const accountingDenseLevel = counts.length >= 17 ? 3 : counts.length >= 13 ? 2 : counts.length >= 9 ? 1 : 0;
  const accountingLeftSpanClass = accountingDenseLevel >= 2 ? "col-span-4" : "col-span-5";
  const accountingRightSpanClass = accountingDenseLevel >= 2 ? "col-span-8" : "col-span-7";
  const accountingGridColsClass = accountingDenseLevel === 0
    ? "grid-cols-3"
    : accountingDenseLevel === 1
      ? "grid-cols-4"
      : accountingDenseLevel === 2
        ? "grid-cols-5"
        : "grid-cols-6";
  const isUltraDenseAccounting = accountingDenseLevel >= 2;

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
        <header className={`bg-white border-b px-4 lg:px-10 ${isAccountingMode ? "py-2 lg:py-3" : "py-4 lg:py-5"} flex flex-wrap justify-between items-center gap-2 lg:gap-3 shadow-sm`}>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => router.push("/select-dataset")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/favicon.ico" alt="icon" className="w-10 h-10" />
              <h1 className={`${isAccountingMode ? "text-xl lg:text-2xl" : "text-2xl"} font-black text-gray-900 tracking-tighter`}>Count kun</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 lg:gap-3 flex-wrap justify-end">
            {isAccountingMode && (
              <button
                onClick={() => router.push("/home/analytics")}
                className="text-[10px] font-black text-emerald-600 hover:text-emerald-700 border border-emerald-200 px-5 py-2 rounded-full transition-all tracking-widest"
              >
                📈 グラフ・コメント
              </button>
            )}
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
            <button
              onClick={handleUndo}
              disabled={isUndoing || history.length === 0}
              className={`text-[10px] font-black px-5 py-2 rounded-full transition-all tracking-widest border ${
                isUndoing || history.length === 0
                  ? "text-gray-300 border-gray-200 bg-gray-50 cursor-not-allowed"
                  : "text-amber-600 border-amber-200 hover:bg-amber-50"
              }`}
            >
              ↩ ひとつ戻す
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

        <main className={isAccountingMode ? "flex-1 overflow-hidden p-2 lg:p-3 grid grid-cols-12 gap-2 lg:gap-3" : "flex-1 overflow-y-auto p-6 lg:p-10 grid grid-cols-12 gap-6 auto-rows-min"}>
          {!isAccountingMode && (
          <div className="col-span-8 h-[50vh] bg-white p-8 rounded-[32px] shadow-xl shadow-gray-200/50 border border-gray-100 relative">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-black text-gray-600">
                {isAccountingMode && chartView === "sales" ? "売上数推移" : "在庫推移"}
              </p>
              {isAccountingMode && (
                <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 p-1">
                  <button
                    onClick={() => setChartView("inventory")}
                    className={`text-xs font-black px-3 py-1 rounded-full transition-colors ${
                      chartView === "inventory" ? "bg-white text-gray-900 shadow" : "text-gray-500"
                    }`}
                  >
                    在庫
                  </button>
                  <button
                    onClick={() => setChartView("sales")}
                    className={`text-xs font-black px-3 py-1 rounded-full transition-colors ${
                      chartView === "sales" ? "bg-white text-gray-900 shadow" : "text-gray-500"
                    }`}
                  >
                    売上数
                  </button>
                </div>
              )}
            </div>
            <div className="h-[calc(100%-2.5rem)]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={activeChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
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
                  {isAccountingMode && chartView === "sales" ? renderSalesLineContent() : renderInventoryLineContent()}
                </LineChart>
              </ResponsiveContainer>
            </div>
            {chartEmpty && (
              <div className="absolute left-8 top-8 rounded-lg bg-white/90 px-3 py-2 border border-gray-100 text-xs text-gray-500">
                グラフデータなし（現在在庫を表示中）
              </div>
            )}
          </div>
          )}

          {isAccountingMode ? (
            <>
              <div className={`${accountingLeftSpanClass} h-full`}>
                <div className="bg-white p-3 lg:p-4 rounded-3xl border border-emerald-100 h-full flex flex-col shadow-xl shadow-emerald-100/30 overflow-hidden">
                  <p className="text-xs lg:text-sm font-black text-emerald-600 mb-2">会計モード</p>
                  <label className="text-xs font-bold text-gray-500">お支払い金額合計 (円)</label>
                  <div className="w-full mt-1 mb-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xl lg:text-2xl font-black text-gray-900">
                    ¥{accountingTotalAmount.toLocaleString("ja-JP")}
                  </div>
                  <p className="text-[10px] text-gray-500 mb-2">選択商品数: {totalSelectedItems}</p>
                  <label className="text-xs font-bold text-gray-500">お受け取り金額 (円)</label>
                  <input
                    type="number"
                    min="0"
                    value={paymentInput}
                    onChange={(e) => setPaymentInput(e.target.value)}
                    className="w-full mt-1 mb-2 rounded-xl border border-gray-200 px-3 py-2 text-base lg:text-lg font-black text-gray-900"
                    placeholder="例: 1000"
                  />
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 mb-2">
                    <p className="text-xs text-emerald-700 font-bold mb-1">会計結果</p>
                    <p className="text-xl lg:text-2xl text-emerald-700 font-black mt-1">
                      {lastAccountingResult ? `¥${lastAccountingResult.change.toLocaleString("ja-JP")}` : "¥0"}
                    </p>
                    <p className="text-[10px] text-emerald-800 mt-1 min-h-[12px] line-clamp-2">
                      {lastAccountingResult ? `${lastAccountingResult.summary} / 受取 ¥${lastAccountingResult.paid.toLocaleString("ja-JP")}` : "会計ボタンを押すとおつりを表示します"}
                    </p>
                  </div>
                  <div className={`grid flex-1 grid-cols-4 ${isUltraDenseAccounting ? "gap-1" : "gap-1.5"} content-start auto-rows-fr min-h-[0]`}>
                    {calculatorButtons.map((key) => (
                      <button
                        key={`calc-desktop-${key}`}
                        onClick={() => handleCalculatorPress(key === "×" ? "*" : key === "÷" ? "/" : key)}
                        className={`font-black rounded-lg border transition-colors ${isUltraDenseAccounting ? "text-[10px] lg:text-xs py-1.5 lg:py-2" : "text-xs lg:text-sm py-2 lg:py-2.5"} ${
                          key === "会計" ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => { void handleUndo(); }}
                      disabled={isUndoing || (cartActionStack.length === 0 && history.length === 0)}
                      className="w-full rounded-xl bg-amber-500 text-white font-black py-2.5 disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      ↩ ひとつ戻す
                    </button>
                    <button
                      onClick={() => router.push("/home/accounting-history")}
                      disabled={accountingHistory.length === 0}
                      className="w-full rounded-xl border border-emerald-200 text-emerald-700 font-black py-2.5 disabled:text-gray-300 disabled:border-gray-200"
                    >
                      会計履歴を見る
                    </button>
                  </div>
                </div>
              </div>

              <div className={`${accountingRightSpanClass} h-full overflow-hidden`}>
                <div className={`grid ${accountingGridColsClass} gap-1.5 lg:gap-2 h-full auto-rows-fr`}>
                  {counts.map((count: number, i: number) => {
                    const selectedQuantity = cartQuantities[i] ?? 0;
                    const remainingSelectable = Math.max(0, count - selectedQuantity);

                    return (
                      <div key={i} className={`${isUltraDenseAccounting ? "p-1.5 lg:p-2" : "p-2.5 lg:p-3"} rounded-2xl border flex flex-col justify-between transition-shadow ${selectedQuantity > 0 ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-100"}`}>
                        <div>
                          <p className={`${isUltraDenseAccounting ? "text-[9px]" : "text-[10px]"} font-black text-gray-500 truncate`}>{prizeLabels[i] || `${i + 1}等`}</p>
                          <p className={`${isUltraDenseAccounting ? "text-lg lg:text-xl" : "text-2xl lg:text-3xl"} font-black text-gray-900 leading-none mt-1`}>{count}</p>
                          <p className={`${isUltraDenseAccounting ? "text-[9px]" : "text-[10px]"} font-bold text-emerald-600 mt-1`}>¥{Number(prices[i] ?? 0).toLocaleString("ja-JP")}</p>
                          {accountingDenseLevel <= 1 && (
                            <p className="text-[10px] text-gray-500 mt-1">x{selectedQuantity}</p>
                          )}
                        </div>
                        <button
                          onClick={() => { void handleDraw(i); }}
                          disabled={remainingSelectable === 0}
                          className={`mt-1.5 bg-gray-900 text-white rounded-xl font-black disabled:opacity-10 active:scale-95 transition-all ${isUltraDenseAccounting ? "px-1.5 py-1 text-[10px]" : "px-2 py-2 text-xs lg:text-sm"}`}
                        >
                          DRAW
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
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
          )}

          {!isAccountingMode && (
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
          )}
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
              {isAccountingMode && (
                <button
                  onClick={() => router.push("/home/analytics")}
                  className="text-[8px] font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full"
                >
                  グラフ
                </button>
              )}
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

          {!isAccountingMode && (
          <div className="flex-1 min-h-[300px] w-full bg-gray-50 rounded-[40px] p-5 shadow-inner border border-gray-100 relative">
            {isAccountingMode && (
              <div className="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-full border border-gray-200 bg-white/90 p-1">
                <button
                  onClick={() => setChartView("inventory")}
                  className={`text-[10px] font-black px-2 py-1 rounded-full ${chartView === "inventory" ? "bg-gray-900 text-white" : "text-gray-500"}`}
                >
                  在庫
                </button>
                <button
                  onClick={() => setChartView("sales")}
                  className={`text-[10px] font-black px-2 py-1 rounded-full ${chartView === "sales" ? "bg-gray-900 text-white" : "text-gray-500"}`}
                >
                  売上
                </button>
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activeChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
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
                {isAccountingMode && chartView === "sales" ? renderSalesLineContent() : renderInventoryLineContent()}
              </LineChart>
            </ResponsiveContainer>
            {chartEmpty && (
              <div className="absolute left-5 top-5 rounded-md bg-white/90 px-2 py-1 border border-gray-100 text-[10px] text-gray-500">
                現在在庫を表示中
              </div>
            )}
          </div>
          )}
          {isAccountingMode && (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-xs font-black text-emerald-700">会計操作ページ</p>
              <p className="text-[10px] text-emerald-600 mt-1">グラフとコメントは「グラフ」ボタンで切り替えできます</p>
            </div>
          )}
          <p className="text-[10px] text-gray-500 mt-3 text-center">コメントはグラフ上の点とツールチップに表示されます</p>
        </div>

        {/* 携帯版 下部ナビゲーション兼操作パネル */}
        <div className="bg-white border-t border-gray-100 p-6 pb-20 rounded-t-[48px] shadow-[0_-25px_50px_-12px_rgba(0,0,0,0.08)] flex-shrink-0">
          {isAccountingMode && (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-[11px] font-black text-emerald-700 mb-2">会計モード</p>
              <p className="text-[10px] font-bold text-gray-500">お支払い金額合計</p>
              <div className="w-full mt-1 mb-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xl font-black text-gray-900">
                ¥{accountingTotalAmount.toLocaleString("ja-JP")}
              </div>
              <p className="text-[10px] text-gray-500 mb-2">選択商品数: {totalSelectedItems}</p>
              <input
                type="number"
                min="0"
                value={paymentInput}
                onChange={(e) => setPaymentInput(e.target.value)}
                placeholder="お受け取り金額"
                className="w-full mb-2 rounded-lg border border-emerald-200 px-3 py-2 text-sm font-bold text-gray-900"
              />
              <div className="rounded-lg border border-emerald-100 bg-white p-2 mb-2">
                <p className="text-[10px] font-bold text-emerald-700">会計結果</p>
                <p className="text-lg font-black text-emerald-700 mt-1">{lastAccountingResult ? `¥${lastAccountingResult.change.toLocaleString("ja-JP")}` : "¥0"}</p>
                <p className="text-[10px] text-emerald-700 mt-1 min-h-[12px]">
                  {lastAccountingResult ? `${lastAccountingResult.summary} / 受取 ¥${lastAccountingResult.paid.toLocaleString("ja-JP")}` : "会計ボタンでおつり表示"}
                </p>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {calculatorButtons.map((key) => (
                  <button
                    key={`calc-mobile-${key}`}
                    onClick={() => handleCalculatorPress(key === "×" ? "*" : key === "÷" ? "/" : key)}
                    className={`rounded-md py-1.5 text-[11px] font-black border ${
                      key === "会計" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-700 border-gray-200"
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  onClick={() => { void handleUndo(); }}
                  disabled={isUndoing || (cartActionStack.length === 0 && history.length === 0)}
                  className="rounded-lg bg-amber-500 text-white font-black py-2 disabled:bg-gray-100 disabled:text-gray-400"
                >
                  ↩ ひとつ戻す
                </button>
                <button
                  onClick={() => router.push("/home/accounting-history")}
                  disabled={accountingHistory.length === 0}
                  className="rounded-lg border border-emerald-200 text-emerald-700 font-black py-2 disabled:text-gray-300 disabled:border-gray-200"
                >
                  履歴
                </button>
              </div>
            </div>
          )}
          <div className={`grid gap-3 mb-8 ${counts.length <= 5 ? 'grid-cols-5' : counts.length <= 10 ? 'grid-cols-5' : 'grid-cols-6'}`}>
            {counts.map((count: number, i: number) => {
              const selectedQuantity = cartQuantities[i] ?? 0;
              const remainingSelectable = Math.max(0, count - selectedQuantity);

              return (
                <button
                  key={i}
                  onClick={() => {
                    void handleDraw(i);
                  }}
                  disabled={remainingSelectable === 0}
                  className={`
                    aspect-[4/5] rounded-2xl flex flex-col items-center justify-center transition-all
                    ${remainingSelectable === 0 ? "bg-gray-50 text-gray-200" : selectedQuantity > 0 ? "bg-emerald-50 shadow-lg border border-emerald-200 active:scale-90" : "bg-white shadow-lg border border-gray-100 active:scale-90"}
                  `}
                >
                  <span className="text-[10px] font-black opacity-50 mb-1 max-w-[64px] truncate">{prizeLabels[i] || `${i + 1}等`}</span>
                  <span className={`text-xl font-black ${count <= 3 && count > 0 ? "text-orange-500" : "text-gray-900"}`}>{count}</span>
                  {isAccountingMode && (
                    <span className="text-[9px] font-bold text-emerald-600 mt-1">¥{Number(prices[i] ?? 0).toLocaleString("ja-JP")} / x{selectedQuantity}</span>
                  )}
                  <div className="w-4 h-[3px] rounded-full mt-2" style={{ backgroundColor: colors[i] }}></div>
                </button>
              );
            })}
          </div>

          {!isAccountingMode && (
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
          )}
          
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
            <button
              onClick={handleUndo}
              disabled={isUndoing || history.length === 0}
              className={`flex-1 py-3 font-black rounded-xl transition-all active:scale-[0.98] text-sm ${
                isUndoing || history.length === 0
                  ? "bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed"
                  : "bg-amber-500 text-white"
              }`}
            >
              ↩ ひとつ戻す
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